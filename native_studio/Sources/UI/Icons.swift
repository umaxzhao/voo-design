//
//  Icons.swift
//  native_studio
//
//  High-fidelity canonical vector icons matching VOO Design (Lucide v1.59.0 & brand SVG assets).
//  Pure vector drawing with CoreGraphics on a canonical 24×24 coordinate box.
//  Default stroke width 1.5pt, round line cap, round line join, context-flip aware.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Canonical VOO Icon Names Catalog

public enum VooIconName: String, Sendable, CaseIterable, Equatable {
    case brandLogo, cursor, frame, marquee, pen, eraser, text, shapes, cube
    case undo, redo, grid, plus, minus, clock, fileText, layoutGrid, compass
    case arrowRight, zap, layoutList, search, sliders, contrast, copy, trash
    case eye, eyeOff, lock, unlock, chevronDown, chevronRight, arrowUp, globe
    case smartphone, monitor, presentation, camera, layers
    case booleanUnion, booleanSubtract, booleanIntersect, booleanXor, booleanDivide
    case alignLeft, alignCenter, alignRight, nodeSharp, nodeSmooth, nodeSmart
    case rect, ellipse, line, polygon, star, arrow, curvaturePen, pencil, lasso
    case flipH, flipV, alignTop, alignMiddle, alignBottom, distributeH, distributeV
    case group, ungroup, code, svg, checkmark
    // Canonical additions:
    case folder, folderOpen, refresh, rotateCcw, swap, settings, pipette, cornerRadius
    case mask, diamond, spline, image, close, sparkles, magnet, history, panelRightClose
    case wand, keyboard, hand, brush, figma
    case link, unlink, alignJustify, alignTextLeft, alignTextCenter, alignTextRight, italic, underline
}

// MARK: - Central Vector Icon Factory

public enum VooIconFactory {

    // MARK: - Canonical 24×24 Canvas Transformation Context
    /// Applies aspect-ratio preserved scaling and centering into a 24×24 coordinate space,
    /// with automatic flip-detection supporting both flipped (top-left origin) and unflipped (bottom-left origin) contexts.
    @inline(__always)
    public static func withCanonicalCanvas(
        in rect: CGRect,
        color: NSColor = .white,
        strokeWidth: CGFloat = 1.5,
        _ body: (CGContext) -> Void
    ) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        guard rect.width > 0, rect.height > 0 else { return }
        ctx.saveGState()

        let s = min(rect.width, rect.height) / 24.0
        let ox = rect.midX - 12.0 * s

        let isFlipped = NSGraphicsContext.current?.isFlipped ?? false
        if isFlipped {
            let oy = rect.midY - 12.0 * s
            ctx.translateBy(x: ox, y: oy)
            ctx.scaleBy(x: s, y: s)
        } else {
            let oy = rect.midY + 12.0 * s
            ctx.translateBy(x: ox, y: oy)
            ctx.scaleBy(x: s, y: -s)
        }

        ctx.setStrokeColor(color.cgColor)
        ctx.setFillColor(color.cgColor)
        ctx.setLineWidth(strokeWidth)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)

        body(ctx)

        ctx.restoreGState()
    }

    // MARK: - NSImage Generator Helpers

    /// Generates a vector NSImage from a custom drawing closure.
    public static func image(
        size: NSSize = NSSize(width: 16, height: 16),
        color: NSColor = .labelColor,
        strokeWidth: CGFloat = 1.5,
        drawing: @escaping (CGContext, NSRect) -> Void
    ) -> NSImage {
        let img = NSImage(size: size, flipped: false) { rect in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
            drawing(ctx, rect)
            return true
        }
        img.isTemplate = false
        return img
    }

    /// Generates a vector NSImage for any canonical VooIconName glyph.
    public static func image(
        named name: VooIconName,
        size: NSSize = NSSize(width: 16, height: 16),
        color: NSColor = .labelColor,
        strokeWidth: CGFloat = 1.5
    ) -> NSImage {
        return NSImage(size: size, flipped: false) { rect in
            draw(name, in: rect, color: color, strokeWidth: strokeWidth)
            return true
        }
    }

    // MARK: - Unified Draw Dispatch

    /// Brand marks are hand-drawn; every other glyph is data-driven from `glyphTable`
    /// (generated from lucide-react and src/canvas/icons.jsx).
    public static func draw(
        _ name: VooIconName,
        in rect: NSRect,
        color: NSColor = .labelColor,
        strokeWidth: CGFloat = 1.5
    ) {
        switch name {
        case .figma: drawFigma(in: rect, color: color, strokeWidth: strokeWidth)
        default: drawGlyph(name, in: rect, color: color, strokeWidth: strokeWidth)
        }
    }

    /// Strokes (or fills) the registered geometry for `name` on the canonical 24×24 canvas.
    static func drawGlyph(
        _ name: VooIconName,
        in rect: NSRect,
        color: NSColor,
        strokeWidth: CGFloat,
        forceFill: Bool = false
    ) {
        guard let elements = glyphTable[name] else {
            preconditionFailure("No glyph geometry registered for \(name.rawValue)")
        }
        withCanonicalCanvas(in: rect, color: color, strokeWidth: strokeWidth) { ctx in
            for element in elements {
                ctx.addPath(cgPath(fromAbsolute: element.path))
                if element.filled || forceFill {
                    ctx.fillPath()
                } else {
                    ctx.strokePath()
                }
            }
        }
    }

    /// Pointer glyph; `isSolid` fills the arrow (active tool state) instead of outlining it.
    public static func drawCursor(
        in rect: NSRect,
        color: NSColor = .labelColor,
        strokeWidth: CGFloat = 1.5,
        isSolid: Bool
    ) {
        drawGlyph(.cursor, in: rect, color: color, strokeWidth: strokeWidth, forceFill: isSolid)
    }

    /// Parses the generator's absolute `M / L / C / Z` command format.
    static func cgPath(fromAbsolute data: String) -> CGPath {
        let path = CGMutablePath()
        let tokens = data.split(separator: " ")
        var index = 0

        func nextNumber() -> CGFloat {
            guard index < tokens.count, let value = Double(tokens[index]) else {
                preconditionFailure("Malformed glyph path data: \(data)")
            }
            index += 1
            return CGFloat(value)
        }
        func nextPoint() -> CGPoint {
            let x = nextNumber()
            return CGPoint(x: x, y: nextNumber())
        }

        while index < tokens.count {
            let command = tokens[index]
            index += 1
            switch command {
            case "M": path.move(to: nextPoint())
            case "L": path.addLine(to: nextPoint())
            case "C":
                let control1 = nextPoint()
                let control2 = nextPoint()
                path.addCurve(to: nextPoint(), control1: control1, control2: control2)
            case "Z": path.closeSubpath()
            default: preconditionFailure("Unsupported glyph path command \(command) in \(data)")
            }
        }
        return path
    }

    // MARK: - 93. Figma Brand Mark
    public static func drawFigma(in rect: CGRect, color: NSColor = .white, strokeWidth: CGFloat = 1.5) {
        withCanonicalCanvas(in: rect, color: color, strokeWidth: strokeWidth) { ctx in
            // Top-left pill:
            let topLeft = CGPath(roundedRect: CGRect(x: 5, y: 2.5, width: 7, height: 7), cornerWidth: 3.5, cornerHeight: 3.5, transform: nil)
            ctx.addPath(topLeft); ctx.strokePath()

            // Top-right half-pill:
            let topRight = CGMutablePath()
            topRight.move(to: CGPoint(x: 12, y: 2.5))
            topRight.addLine(to: CGPoint(x: 15.5, y: 2.5))
            topRight.addArc(center: CGPoint(x: 15.5, y: 6), radius: 3.5, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: false)
            topRight.addLine(to: CGPoint(x: 12, y: 9.5))
            topRight.closeSubpath()
            ctx.addPath(topRight); ctx.strokePath()

            // Middle-left pill:
            let middleLeft = CGPath(roundedRect: CGRect(x: 5, y: 9.5, width: 7, height: 7), cornerWidth: 3.5, cornerHeight: 3.5, transform: nil)
            ctx.addPath(middleLeft); ctx.strokePath()

            // Middle-right circle:
            ctx.strokeEllipse(in: CGRect(x: 12, y: 9.5, width: 7, height: 7))

            // Bottom-left teardrop:
            let bottomLeft = CGMutablePath()
            bottomLeft.move(to: CGPoint(x: 12, y: 16.5))
            bottomLeft.addLine(to: CGPoint(x: 8.5, y: 16.5))
            bottomLeft.addArc(center: CGPoint(x: 8.5, y: 20), radius: 3.5, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: true)
            bottomLeft.addLine(to: CGPoint(x: 12, y: 23.5))
            bottomLeft.closeSubpath()
            ctx.addPath(bottomLeft); ctx.strokePath()
        }
    }
}

/// One stroked or filled piece of a glyph. `path` uses absolute M / L / C / Z commands.
public struct VooGlyphElement: Sendable {
    public let path: String
    public let filled: Bool

    public init(path: String, filled: Bool) {
        self.path = path
        self.filled = filled
    }
}
