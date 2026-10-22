//
//  ExportEngine.swift
//  native_studio
//
//  Native document export: PNG / JPG / PDF / SVG at 1x–4x scale.
//  Pure CoreGraphics + AppKit, no third-party dependencies.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation
import UniformTypeIdentifiers

// MARK: - Export Format

public enum ExportFormat: String, CaseIterable, Sendable {
    case png = "PNG"
    case jpg = "JPG"
    case pdf = "PDF"
    case svg = "SVG"

    public var fileExtension: String {
        switch self {
        case .png: return "png"
        case .jpg: return "jpg"
        case .pdf: return "pdf"
        case .svg: return "svg"
        }
    }

    public var allowsScale: Bool {
        switch self {
        case .png, .jpg: return true
        case .pdf, .svg: return false
        }
    }

    public var contentType: UTType {
        switch self {
        case .png: return .png
        case .jpg: return .jpeg
        case .pdf: return .pdf
        case .svg: return UTType(filenameExtension: "svg") ?? .data
        }
    }
}

// MARK: - Export Options

public struct ExportOptions: Sendable {
    public var format: ExportFormat
    public var scale: CGFloat
    public var transparentBackground: Bool

    public init(format: ExportFormat = .png, scale: CGFloat = 2.0, transparentBackground: Bool = false) {
        self.format = format
        self.scale = min(max(scale, 1.0), 4.0)
        self.transparentBackground = transparentBackground
    }

    public var scaleLabel: String {
        return "\(Int(scale))x"
    }
}

// MARK: - Export Errors

public enum ExportError: LocalizedError {
    case emptyCanvas
    case contextCreationFailed
    case encodingFailed(String)

    public var errorDescription: String? {
        switch self {
        case .emptyCanvas: return "画布尺寸无效，无法导出。"
        case .contextCreationFailed: return "无法创建导出上下文。"
        case .encodingFailed(let detail): return "编码失败：\(detail)"
        }
    }
}

// MARK: - Export Engine

public final class ExportEngine {

    public static let shared = ExportEngine()

    private init() {}

    // MARK: Public API

    /// Renders the document into an ordered CGImage at the requested scale.
    public func renderImage(document: VOODocument, scale: CGFloat, transparent: Bool = false) throws -> CGImage {
        let canvas = normalizedCanvas(document)
        let pixelWidth = Int(max(1, canvas.width * scale).rounded())
        let pixelHeight = Int(max(1, canvas.height * scale).rounded())
        guard pixelWidth > 0, pixelHeight > 0 else { throw ExportError.emptyCanvas }

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
        guard let ctx = CGContext(data: nil,
                                  width: pixelWidth,
                                  height: pixelHeight,
                                  bitsPerComponent: 8,
                                  bytesPerRow: 0,
                                  space: colorSpace,
                                  bitmapInfo: bitmapInfo) else {
            throw ExportError.contextCreationFailed
        }

        draw(document: document, canvas: canvas, scale: scale, transparent: transparent, into: ctx)
        guard let image = ctx.makeImage() else { throw ExportError.encodingFailed("CGImage") }
        return image
    }

    /// Renders the document into PDF data (vector where possible).
    public func renderPDF(document: VOODocument) throws -> Data {
        let canvas = normalizedCanvas(document)
        guard canvas.width > 0, canvas.height > 0 else { throw ExportError.emptyCanvas }
        let data = NSMutableData()
        guard let consumer = CGDataConsumer(data: data) else {
            throw ExportError.contextCreationFailed
        }
        var mediaBox = CGRect(x: 0, y: 0, width: canvas.width, height: canvas.height)
        guard let ctx = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
            throw ExportError.contextCreationFailed
        }
        ctx.beginPDFPage(nil)
        draw(document: document, canvas: canvas, scale: 1, transparent: false, into: ctx)
        ctx.endPDFPage()
        ctx.closePDF()
        return data as Data
    }

    /// Writes the document to disk in the requested format.
    public func write(document: VOODocument, options: ExportOptions, to url: URL) throws {
        switch options.format {
        case .svg:
            let svg = DocumentIO.shared.exportToSVG(document: document)
            try svg.write(to: url, atomically: true, encoding: .utf8)
        case .pdf:
            let data = try renderPDF(document: document)
            try data.write(to: url, options: .atomic)
        case .png, .jpg:
            let image = try renderImage(document: document,
                                        scale: options.scale,
                                        transparent: options.transparentBackground)
            let rep = NSBitmapImageRep(cgImage: image)
            let type: NSBitmapImageRep.FileType = options.format == .png ? .png : .jpeg
            var properties: [NSBitmapImageRep.PropertyKey: Any] = [:]
            if options.format == .jpg {
                properties[.compressionFactor] = 0.92
            }
            guard let data = rep.representation(using: type, properties: properties) else {
                throw ExportError.encodingFailed(options.format.rawValue)
            }
            try data.write(to: url, options: .atomic)
        }
    }

    // MARK: Canvas

    private func normalizedCanvas(_ document: VOODocument) -> CGRect {
        let canvas = document.canvas
        let width = max(canvas.width, 1)
        let height = max(canvas.height, 1)
        return CGRect(x: canvas.x, y: canvas.y, width: width, height: height)
    }

    // MARK: Core drawing

    private func draw(document: VOODocument, canvas: CGRect, scale: CGFloat, transparent: Bool, into ctx: CGContext) {
        ctx.saveGState()

        // Export uses a top-left origin like the VOO document model.
        ctx.translateBy(x: 0, y: canvas.height)
        ctx.scaleBy(x: 1, y: -1)
        ctx.scaleBy(x: scale, y: scale)
        ctx.translateBy(x: -canvas.minX, y: -canvas.minY)

        if !transparent {
            let background = NSColor(hex: document.canvas.backgroundColor)
            ctx.setFillColor(background.cgColor)
            ctx.fill(CGRect(x: canvas.minX, y: canvas.minY, width: canvas.width, height: canvas.height))
        }

        for node in document.nodes where node.style.visible {
            drawNode(node, in: ctx)
        }

        ctx.restoreGState()
    }

    private func drawNode(_ node: VOONode, in ctx: CGContext) {
        ctx.saveGState()

        // Rotation around the node centre.
        if node.rotation != 0 {
            let centre = CGPoint(x: node.x + node.width / 2.0, y: node.y + node.height / 2.0)
            ctx.translateBy(x: centre.x, y: centre.y)
            ctx.rotate(by: node.rotation * .pi / 180.0)
            ctx.translateBy(x: -centre.x, y: -centre.y)
        }

        ctx.setAlpha(node.style.opacity)
        ctx.setBlendMode(cgBlendMode(for: node.style.blendMode))
        let fillColor = NSColor(hex: node.style.fill)
        let strokeColor = NSColor(hex: node.style.stroke)

        switch node.kind {
        case .rect, .frame, .group, .boolean:
            let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            let radius = node.cornerRadii?.tl ?? 0
            let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
            paint(path: path, fill: fillColor, stroke: strokeColor, strokeWidth: node.style.strokeWidth, in: ctx)

        case .ellipse:
            let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            ctx.addEllipse(in: rect)
            if fillColor.alphaComponent > 0 {
                ctx.setFillColor(fillColor.cgColor)
                ctx.fillPath()
            }
            if node.style.strokeWidth > 0 {
                ctx.addEllipse(in: rect)
                ctx.setStrokeColor(strokeColor.cgColor)
                ctx.setLineWidth(node.style.strokeWidth)
                ctx.strokePath()
            }

        case .path:
            let path = buildPath(from: node.points ?? [])
            paint(path: path, fill: fillColor, stroke: strokeColor, strokeWidth: max(node.style.strokeWidth, 1.0), in: ctx)

        case .image:
            drawImageNode(node, in: ctx)

        case .text:
            drawText(node, in: ctx)

        default:
            let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            paint(path: CGPath(rect: rect, transform: nil), fill: fillColor, stroke: strokeColor, strokeWidth: node.style.strokeWidth, in: ctx)
        }

        ctx.restoreGState()
    }

    private func paint(path: CGPath, fill: NSColor, stroke: NSColor, strokeWidth: CGFloat, in ctx: CGContext) {
        // The export context is flipped; drawing text and paths through AppKit
        // helpers keeps glyphs upright while shapes stay inline with the model.
        if fill.alphaComponent > 0 {
            ctx.addPath(path)
            ctx.setFillColor(fill.cgColor)
            ctx.fillPath()
        }
        if strokeWidth > 0, stroke.alphaComponent > 0 {
            ctx.addPath(path)
            ctx.setStrokeColor(stroke.cgColor)
            ctx.setLineWidth(strokeWidth)
            ctx.strokePath()
        }
    }

    private func buildPath(from points: [PenAnchor]) -> CGPath {
        let path = CGMutablePath()
        guard let first = points.first else { return path }
        path.move(to: CGPoint(x: first.x, y: first.y))
        for index in 1..<max(points.count, 1) {
            let prev = points[index - 1]
            let curr = points[index]
            let cp1 = prev.outHandle ?? CGPoint(x: prev.x, y: prev.y)
            let cp2 = curr.inHandle ?? CGPoint(x: curr.x, y: curr.y)
            path.addCurve(to: CGPoint(x: curr.x, y: curr.y), control1: cp1, control2: cp2)
        }
        if first.isClosed, points.count > 2 {
            path.closeSubpath()
        }
        return path
    }

    private func drawImageNode(_ node: VOONode, in ctx: CGContext) {
        guard let source = node.src, !source.isEmpty else { return }
        var cgImage: CGImage?
        if source.hasPrefix("data:image/") {
            cgImage = ImageImporter.cgImage(fromDataURL: source)
        } else if let image = NSImage(contentsOfFile: source) {
            var rect = CGRect(origin: .zero, size: image.size)
            cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
        }
        guard let image = cgImage else { return }
        // The context is flipped for the document model; draw the image upright
        // inside the node rect by flipping locally around the rect.
        let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
        ctx.saveGState()
        ctx.translateBy(x: rect.midX, y: rect.midY)
        ctx.scaleBy(x: 1, y: -1)
        ctx.draw(image, in: CGRect(x: -rect.width / 2.0, y: -rect.height / 2.0,
                                    width: rect.width, height: rect.height))
        ctx.restoreGState()
    }

    private func drawText(_ node: VOONode, in ctx: CGContext) {
        let text = node.text ?? node.name
        guard !text.isEmpty else { return }
        let fontSize = node.fontSize ?? 16
        let color = NSColor(hex: node.style.fill)
        let attributes = TextStyleResolver.attributes(for: node, color: color, size: fontSize)
        let attributed = NSAttributedString(string: text, attributes: attributes)

        // Flip locally so glyphs are not mirrored by the export transform, and
        // publish an NSGraphicsContext so AppKit text layout can draw.
        ctx.saveGState()
        ctx.translateBy(x: node.x, y: node.y + fontSize)
        ctx.scaleBy(x: 1, y: -1)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
        let rect = CGRect(x: 0, y: -fontSize * 0.22, width: max(node.width, 10), height: max(node.height, fontSize * 1.4))
        attributed.draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
        NSGraphicsContext.restoreGraphicsState()
        ctx.restoreGState()
    }

    private func cgBlendMode(for blendMode: String) -> CGBlendMode {
        switch blendMode.lowercased() {
        case "multiply": return .multiply
        case "screen": return .screen
        case "overlay": return .overlay
        case "darken": return .darken
        case "lighten": return .lighten
        case "color-dodge", "color dodge": return .colorDodge
        case "color-burn", "color burn": return .colorBurn
        case "hard-light", "hard light": return .hardLight
        case "soft-light", "soft light": return .softLight
        case "difference": return .difference
        case "exclusion": return .exclusion
        case "hue": return .hue
        case "saturation": return .saturation
        case "color": return .color
        case "luminosity": return .luminosity
        default: return .normal
        }
    }
}
