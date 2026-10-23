//
//  DocumentIO.swift
//  native_studio
//
//  Native Document File I/O, SerDe, Export Pipeline & Recent Files Manager.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation
import UniformTypeIdentifiers

// MARK: - Document File Format

public enum DocumentFileFormat: String, CaseIterable, Sendable {
    case vooJson   = "voo"
    case vooBinary = "voobin"
    case json      = "json"
    case svg       = "svg"
    case png       = "png"

    public var fileExtension: String {
        switch self {
        case .vooJson, .vooBinary:
            return "voo"
        case .json:
            return "json"
        case .svg:
            return "svg"
        case .png:
            return "png"
        }
    }
}

// MARK: - Recent Files Manager

public final class RecentFilesManager: @unchecked Sendable {
    public static let shared = RecentFilesManager()

    private let userDefaultsKey = "run.voo.editor.recentFiles"
    private let maxRecentCount = 10

    public init() {}

    public var recentFilePaths: [String] {
        get {
            UserDefaults.standard.stringArray(forKey: userDefaultsKey) ?? []
        }
        set {
            UserDefaults.standard.set(newValue, forKey: userDefaultsKey)
        }
    }

    public func addRecentFile(at url: URL) {
        var recents = recentFilePaths.filter { $0 != url.path }
        recents.insert(url.path, at: 0)
        if recents.count > maxRecentCount {
            recents = Array(recents.prefix(maxRecentCount))
        }
        recentFilePaths = recents
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
    }

    public func clearRecentFiles() {
        recentFilePaths = []
        NSDocumentController.shared.clearRecentDocuments(nil)
    }
}

// MARK: - Document File I/O & Export Pipeline

public final class DocumentIO: @unchecked Sendable {
    public static let shared = DocumentIO()

    public init() {}

    // MARK: - File Reading & Auto-Detection

    /// Reads and deserializes a document from disk, auto-detecting binary or JSON format.
    public func loadDocument(from url: URL) throws -> VOODocument {
        let data = try Data(contentsOf: url)

        // Check if data begins with VOOBIN01 binary magic header
        if VOOBinaryContainer.isVooBinary(data: data) {
            let res = try VOOBinaryContainer.decode(data: data)
            RecentFilesManager.shared.addRecentFile(at: url)
            return res.document
        }

        // Standard VOO JSON deserialization
        let doc = try VOOSerializer.shared.deserialize(from: data)
        RecentFilesManager.shared.addRecentFile(at: url)
        return doc
    }

    // MARK: - File Writing

    /// Writes document to disk in canonical JSON format.
    public func saveDocument(_ document: VOODocument, to url: URL) throws {
        let data = try VOOSerializer.shared.serialize(document: document)
        try data.write(to: url, options: [.atomic])
        RecentFilesManager.shared.addRecentFile(at: url)
    }

    /// Writes document to disk in high-performance VOOBIN01 binary format.
    public func saveBinaryDocument(_ document: VOODocument, to url: URL) throws {
        let data = try VOOBinaryContainer.encode(document: document)
        try data.write(to: url, options: [.atomic])
        RecentFilesManager.shared.addRecentFile(at: url)
    }

    // MARK: - Vector & Raster Export Pipeline

    /// Exports document scene to clean, standard SVG vector markup.
    public func exportToSVG(document: VOODocument) -> String {
        let canvas = document.canvas
        let w = canvas.width > 0 ? canvas.width : 1920.0
        let h = canvas.height > 0 ? canvas.height : 1080.0

        var svg = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \(w) \(h)" width="\(w)" height="\(h)">
          <rect width="\(w)" height="\(h)" fill="\(canvas.backgroundColor)" />

        """

        for node in document.nodes where node.style.visible {
            svg += renderNodeSVG(node) + "\n"
        }

        svg += "</svg>"
        return svg
    }

    private func renderNodeSVG(_ node: VOONode) -> String {
        let fill = node.style.fill
        let stroke = node.style.stroke
        let strokeW = node.style.strokeWidth
        let opacity = node.style.opacity
        let rot = node.rotation

        var transformAttr = ""
        if rot != 0 {
            let cx = node.x + node.width / 2.0
            let cy = node.y + node.height / 2.0
            transformAttr = " transform=\"rotate(\(rot) \(cx) \(cy))\""
        }

        switch node.kind {
        case .rect:
            let rx = node.cornerRadii?.tl ?? 0.0
            return "  <rect x=\"\(node.x)\" y=\"\(node.y)\" width=\"\(node.width)\" height=\"\(node.height)\" rx=\"\(rx)\" fill=\"\(fill)\" stroke=\"\(stroke)\" stroke-width=\"\(strokeW)\" opacity=\"\(opacity)\"\(transformAttr) />"

        case .ellipse:
            let rx = node.width / 2.0
            let ry = node.height / 2.0
            let cx = node.x + rx
            let cy = node.y + ry
            return "  <ellipse cx=\"\(cx)\" cy=\"\(cy)\" rx=\"\(rx)\" ry=\"\(ry)\" fill=\"\(fill)\" stroke=\"\(stroke)\" stroke-width=\"\(strokeW)\" opacity=\"\(opacity)\"\(transformAttr) />"

        case .path:
            let d = buildSVGPathData(from: node.points ?? [])
            return "  <path d=\"\(d)\" fill=\"\(fill)\" stroke=\"\(stroke)\" stroke-width=\"\(strokeW)\" opacity=\"\(opacity)\"\(transformAttr) />"

        case .text:
            let text = node.text ?? node.name
            let fontSize = node.fontSize ?? 16.0
            let fontFamily = node.fontFamily ?? "Inter, system-ui, sans-serif"
            let textY = node.y + fontSize
            return "  <text x=\"\(node.x)\" y=\"\(textY)\" font-family=\"\(fontFamily)\" font-size=\"\(fontSize)\" fill=\"\(fill)\" opacity=\"\(opacity)\"\(transformAttr)>\(text)</text>"

        default:
            return "  <rect x=\"\(node.x)\" y=\"\(node.y)\" width=\"\(node.width)\" height=\"\(node.height)\" fill=\"\(fill)\" opacity=\"\(opacity)\"\(transformAttr) />"
        }
    }

    private func buildSVGPathData(from points: [PenAnchor]) -> String {
        guard let first = points.first else { return "" }
        var d = "M \(first.x) \(first.y)"

        for i in 1..<points.count {
            let prev = points[i - 1]
            let curr = points[i]

            let cp1x = prev.outHandle?.x ?? prev.x
            let cp1y = prev.outHandle?.y ?? prev.y
            let cp2x = curr.inHandle?.x ?? curr.x
            let cp2y = curr.inHandle?.y ?? curr.y

            d += " C \(cp1x) \(cp1y), \(cp2x) \(cp2y), \(curr.x) \(curr.y)"
        }

        if points.first?.isClosed == true {
            d += " Z"
        }
        return d
    }

    // MARK: - Native Open / Save Panels

    /// Presents native Open Panel for .voo, .json, .svg documents.
    public func promptOpenDocument(window: NSWindow? = nil, completion: @escaping (Result<URL, Error>) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        var types: [UTType] = [.json]
        if let vooType = UTType(filenameExtension: "voo") { types.append(vooType) }
        if let svgType = UTType(filenameExtension: "svg") { types.append(svgType) }
        panel.allowedContentTypes = types
        panel.prompt = "打开 (Open)"

        let handler: (NSApplication.ModalResponse) -> Void = { response in
            if response == .OK, let url = panel.url {
                completion(.success(url))
            } else {
                completion(.failure(NSError(domain: "run.voo.editor", code: -1, userInfo: [NSLocalizedDescriptionKey: "用户取消了打开操作"])))
            }
        }

        if let win = window {
            panel.beginSheetModal(for: win, completionHandler: handler)
        } else {
            let res = panel.runModal()
            handler(res)
        }
    }

    /// Presents native Save Panel for saving document to disk.
    public func promptSaveDocument(
        suggestedName: String = "Untitled.voo",
        window: NSWindow? = nil,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedName
        var types: [UTType] = [.json]
        if let vooType = UTType(filenameExtension: "voo") { types.append(vooType) }
        panel.allowedContentTypes = types
        panel.canCreateDirectories = true
        panel.prompt = "保存 (Save)"

        let handler: (NSApplication.ModalResponse) -> Void = { response in
            if response == .OK, let url = panel.url {
                completion(.success(url))
            } else {
                completion(.failure(NSError(domain: "run.voo.editor", code: -1, userInfo: [NSLocalizedDescriptionKey: "用户取消了保存操作"])))
            }
        }

        if let win = window {
            panel.beginSheetModal(for: win, completionHandler: handler)
        } else {
            let res = panel.runModal()
            handler(res)
        }
    }
}
