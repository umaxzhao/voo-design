//
//  PropertiesPanelView.swift
//  native_studio
//
//  Web-parity "PROPERTIES" inspector card content.
//  Matches VOO Design's live web editor right-hand inspector:
//    PROPERTIES header + icon buttons
//    COLOR     — HSV hue wheel / SV triangle + fill swatch + hex pill + eyedropper
//    SHAPE     — corner radius scrub field (shape-like nodes only)
//    TRANSFORM — X/Y/W/H + R/CR compact pills (native functionality retained)
//    APPEARANCE— fill/stroke hex pills, stroke width, opacity, blend mode
//
//  The floating card chrome itself is drawn by FloatingPropertiesCardView.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Card Geometry Metrics (288 × 520 scrollable content box)

public struct PropertiesPanelMetrics {
    /// Scroll-document width. Web card: `md:w-72` = 288pt with `p-3` (12) padding,
    /// so the usable column is 288 − 2×12 = 264.
    public static let width: CGFloat = 288
    public static let contentInset: CGFloat = 12
    public static let contentWidth: CGFloat = 264
    public static let dividerInset: CGFloat = 12
    public static let headerDividerY: CGFloat = 46   // p12 + pt4 + title 20 + pb10
    public static let headerTitleTop: CGFloat = 16
    public static let headerTitleHeight: CGFloat = 20
    public static let headerIconSize: CGFloat = 21   // 13pt icon + p4
    public static let wheelDiameter: CGFloat = 140
    public static let sectionLabelHeight: CGFloat = 12
    public static let sectionGap: CGFloat = 12       // each side of a section divider
    public static let rowHeight: CGFloat = 24
}

// MARK: - HSV / Hex Color Math

public enum PropertiesColorMath {
    /// Standard HSV → RGB (0…1 components). Hue is in degrees 0…<360.
    public static func rgb(hue: CGFloat, saturation: CGFloat, value: CGFloat) -> (r: CGFloat, g: CGFloat, b: CGFloat) {
        let h = ((hue.truncatingRemainder(dividingBy: 360)) + 360).truncatingRemainder(dividingBy: 360)
        let s = min(max(saturation, 0), 1)
        let v = min(max(value, 0), 1)
        let c = v * s
        let x = c * (1 - abs((h / 60).truncatingRemainder(dividingBy: 2) - 1))
        let m = v - c
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0
        switch Int(h / 60) % 6 {
        case 0: r1 = c; g1 = x
        case 1: r1 = x; g1 = c
        case 2: g1 = c; b1 = x
        case 3: g1 = x; b1 = c
        case 4: r1 = x; b1 = c
        case 5: r1 = c; b1 = x
        default: break
        }
        return (r1 + m, g1 + m, b1 + m)
    }

    public static func color(hue: CGFloat, saturation: CGFloat, value: CGFloat) -> NSColor {
        let rgb = rgb(hue: hue, saturation: saturation, value: value)
        return NSColor(srgbRed: rgb.r, green: rgb.g, blue: rgb.b, alpha: 1.0)
    }

    public static func hex(hue: CGFloat, saturation: CGFloat, value: CGFloat) -> String {
        let rgb = rgb(hue: hue, saturation: saturation, value: value)
        let r = Int(round(min(max(rgb.r, 0), 1) * 255))
        let g = Int(round(min(max(rgb.g, 0), 1) * 255))
        let b = Int(round(min(max(rgb.b, 0), 1) * 255))
        return String(format: "#%02X%02X%02X", r, g, b)
    }

    /// Parses #RGB / #RRGGBB strings into normalised HSB. Returns (0, 0, 0) for black / invalid.
    public static func hsb(fromHex raw: String) -> (hue: CGFloat, saturation: CGFloat, value: CGFloat) {
        guard let normalized = normalizeHex(raw),
              let color = NSColor(hexString: normalized) else {
            return (0, 0, 0)
        }
        var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
        color.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
        return (hue * 360, saturation, brightness)
    }

    /// Returns an uppercase "#RRGGBB" string, or nil when the input is not a 3/6 digit hex color.
    /// True when a paint string actually paints something ("none"/empty/clear are not).
    public static func isVisiblePaint(_ raw: String) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if value.isEmpty || value == "none" || value == "transparent" { return false }
        if value.hasPrefix("rgba(") && value.hasSuffix(", 0)") { return false }
        return true
    }

    public static func normalizeHex(_ raw: String) -> String? {
        var clean = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if clean.hasPrefix("#") { clean.removeFirst() }
        if clean.count == 3 {
            clean = clean.map { "\($0)\($0)" }.joined()
        }
        guard clean.count == 6, clean.allSatisfy({ $0.isHexDigit }) else { return nil }
        return "#" + clean
    }

    public static func hexString(from color: NSColor) -> String {
        let hex = color.hexString
        return String(hex.prefix(7))
    }

    /// Compact numeric formatting used by all pill fields ("12", "1.5", "-40").
    public static func formatNumber(_ value: CGFloat, integer: Bool = true) -> String {
        if integer || abs(value - round(value)) < 0.05 {
            return String(Int(round(value)))
        }
        return String(format: "%.1f", value)
    }

    public static func englishBlendModeName(_ raw: String) -> String {
        if raw == "source-over" { return "Normal" }
        return raw
            .split(separator: "-")
            .map { part -> String in
                guard let first = part.first else { return "" }
                return String(first).uppercased() + part.dropFirst()
            }
            .joined(separator: " ")
    }
}

// MARK: - Vector Glyph Factory (self-contained, no Icons.swift edits)

public enum PropertiesGlyphFactory {
    public enum Kind {
        case settings
        case transfer
        case eyedropper
        case cornerRadius
        case chevronDown
        case link
        case unlink
        case italic
        case underline
        case alignLeft
        case alignCenter
        case alignRight
        case alignJustify
        /// Mini paint chips for the fill row's paint-type trigger (web PaintTypeMenu).
        case paintSolid
        case paintLinear
        case paintRadial
        /// Rebuilt web-inspector chrome.
        case selectOnly
        case rotateCcw
        case rotateCw
        case constraints
        case eye
        case eyeOff
        case minus
        case plus
        case strokeAlign
        case strokeCap
        case strokeJoin
        case strokeDash
        case frameKind
        case textKind
        case groupKind
        case shapeKind
        case ellipseKind
    }

    public static func draw(kind: Kind, in rect: CGRect, color: NSColor, strokeWidth: CGFloat = 1.5) {
        switch kind {
        case .settings:
            VooIconFactory.drawSettings(in: rect, color: color, strokeWidth: strokeWidth)
        case .transfer:
            VooIconFactory.drawSwap(in: rect, color: color, strokeWidth: strokeWidth)
        case .eyedropper:
            VooIconFactory.drawPipette(in: rect, color: color, strokeWidth: strokeWidth)
        case .cornerRadius:
            VooIconFactory.drawCornerRadius(in: rect, color: color, strokeWidth: strokeWidth)
        case .chevronDown:
            VooIconFactory.drawChevronDown(in: rect, color: color, strokeWidth: strokeWidth)
        case .link:
            VooIconFactory.drawLink(in: rect, color: color, strokeWidth: strokeWidth)
        case .unlink:
            VooIconFactory.drawUnlink(in: rect, color: color, strokeWidth: strokeWidth)
        case .italic:
            VooIconFactory.drawItalic(in: rect, color: color, strokeWidth: strokeWidth)
        case .underline:
            VooIconFactory.drawUnderline(in: rect, color: color, strokeWidth: strokeWidth)
        case .alignLeft:
            VooIconFactory.drawAlignTextLeft(in: rect, color: color, strokeWidth: strokeWidth)
        case .alignCenter:
            VooIconFactory.drawAlignTextCenter(in: rect, color: color, strokeWidth: strokeWidth)
        case .alignRight:
            VooIconFactory.drawAlignTextRight(in: rect, color: color, strokeWidth: strokeWidth)
        case .alignJustify:
            VooIconFactory.drawAlignJustify(in: rect, color: color, strokeWidth: strokeWidth)
        case .paintSolid:
            drawPaintChip(.solid, in: rect, color: color, strokeWidth: strokeWidth)
        case .paintLinear:
            drawPaintChip(.linear, in: rect, color: color, strokeWidth: strokeWidth)
        case .paintRadial:
            drawPaintChip(.radial, in: rect, color: color, strokeWidth: strokeWidth)
        case .selectOnly:
            drawSelectOnly(in: rect, color: color)
        case .rotateCcw:
            VooIconFactory.drawRotateCcw(in: rect, color: color, strokeWidth: strokeWidth)
        case .rotateCw:
            drawMirrored(.rotateCcw, in: rect, color: color, strokeWidth: strokeWidth)
        case .constraints:
            drawConstraintsDiagram(in: rect, color: color)
        case .eye:
            VooIconFactory.drawEye(in: rect, color: color, strokeWidth: strokeWidth)
        case .eyeOff:
            VooIconFactory.drawEyeOff(in: rect, color: color, strokeWidth: strokeWidth)
        case .minus:
            VooIconFactory.drawMinus(in: rect, color: color, strokeWidth: strokeWidth)
        case .plus:
            VooIconFactory.drawPlus(in: rect, color: color, strokeWidth: strokeWidth)
        case .strokeAlign:
            drawStrokeAlign(in: rect, color: color)
        case .strokeCap:
            drawStrokeCap(in: rect, color: color)
        case .strokeJoin:
            drawStrokeJoin(in: rect, color: color)
        case .strokeDash:
            drawStrokeDash(in: rect, color: color)
        case .frameKind:
            VooIconFactory.drawFrame(in: rect, color: color, strokeWidth: strokeWidth)
        case .textKind:
            VooIconFactory.drawText(in: rect, color: color, strokeWidth: strokeWidth)
        case .groupKind:
            VooIconFactory.drawFolder(in: rect, color: color, strokeWidth: strokeWidth)
        case .shapeKind:
            VooIconFactory.drawRect(in: rect, color: color, strokeWidth: strokeWidth)
        case .ellipseKind:
            VooIconFactory.drawEllipse(in: rect, color: color, strokeWidth: strokeWidth)
        }
    }

    /// Mirrors a glyph horizontally around its rect (e.g. rotate-CCW → rotate-CW).
    private static func drawMirrored(_ kind: Kind, in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        ctx.translateBy(x: rect.minX + rect.maxX, y: 0)
        ctx.scaleBy(x: -1, y: 1)
        draw(kind: kind, in: rect, color: color, strokeWidth: strokeWidth)
        ctx.restoreGState()
    }

    /// Web "select only" icon: a dashed selection box with a corner handle.
    private static func drawSelectOnly(in rect: CGRect, color: NSColor) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let box = rect.insetBy(dx: rect.width * 0.14, dy: rect.height * 0.14)
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.0)
        ctx.setLineDash(phase: 0, lengths: [2.4, 1.8])
        ctx.stroke(box)
        ctx.setLineDash(phase: 0, lengths: [])
        let handle = CGRect(x: box.minX - 0.5, y: box.minY - 0.5,
                            width: max(2.0, rect.width * 0.22),
                            height: max(2.0, rect.width * 0.22))
        ctx.setFillColor(color.cgColor)
        ctx.fill(handle)
        ctx.restoreGState()
    }

    /// Web constraints diagram: brackets around a dashed cross.
    private static func drawConstraintsDiagram(in rect: CGRect, color: NSColor) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let r = rect.insetBy(dx: rect.width * 0.12, dy: rect.height * 0.12)
        let arm = r.width * 0.30
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.0)
        for (cx, cy, dx, dy) in [
            (r.minX, r.minY, 1.0, 1.0),
            (r.maxX, r.minY, -1.0, 1.0),
            (r.minX, r.maxY, 1.0, -1.0),
            (r.maxX, r.maxY, -1.0, -1.0)
        ] {
            ctx.move(to: CGPoint(x: cx + dx * arm, y: cy))
            ctx.addLine(to: CGPoint(x: cx, y: cy))
            ctx.addLine(to: CGPoint(x: cx, y: cy + dy * arm))
        }
        ctx.strokePath()
        ctx.setLineDash(phase: 0, lengths: [2.0, 1.8])
        ctx.move(to: CGPoint(x: r.midX, y: r.minY + 2))
        ctx.addLine(to: CGPoint(x: r.midX, y: r.maxY - 2))
        ctx.move(to: CGPoint(x: r.minX + 2, y: r.midY))
        ctx.addLine(to: CGPoint(x: r.maxX - 2, y: r.midY))
        ctx.strokePath()
        ctx.restoreGState()
    }

    private static func drawStrokeAlign(in rect: CGRect, color: NSColor) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let r = rect.insetBy(dx: rect.width * 0.18, dy: rect.height * 0.24)
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.0)
        ctx.stroke(r)
        ctx.setLineWidth(2.0)
        ctx.move(to: CGPoint(x: r.minX + 2, y: r.midY))
        ctx.addLine(to: CGPoint(x: r.maxX - 2, y: r.midY))
        ctx.strokePath()
        ctx.restoreGState()
    }

    private static func drawStrokeCap(in rect: CGRect, color: NSColor) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let r = rect.insetBy(dx: rect.width * 0.20, dy: rect.height * 0.30)
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.6)
        ctx.setLineCap(.round)
        ctx.move(to: CGPoint(x: r.minX, y: r.midY))
        ctx.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        ctx.strokePath()
        ctx.restoreGState()
    }

    private static func drawStrokeJoin(in rect: CGRect, color: NSColor) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let r = rect.insetBy(dx: rect.width * 0.20, dy: rect.height * 0.24)
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.6)
        ctx.setLineJoin(.round)
        ctx.move(to: CGPoint(x: r.minX, y: r.maxY))
        ctx.addLine(to: CGPoint(x: r.midX, y: r.minY))
        ctx.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        ctx.strokePath()
        ctx.restoreGState()
    }

    private static func drawStrokeDash(in rect: CGRect, color: NSColor) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let r = rect.insetBy(dx: rect.width * 0.18, dy: rect.height * 0.34)
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(1.2)
        ctx.setLineDash(phase: 0, lengths: [3.0, 2.0])
        ctx.move(to: CGPoint(x: r.minX, y: r.midY))
        ctx.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        ctx.strokePath()
        ctx.restoreGState()
    }

    /// Paint-type chips: a 13pt rounded square previewing the paint kind — solid
    /// filled, linear ramp or radial ramp — so the trigger reads like the web's
    /// PaintTypeMenu icon at the same optical weight as the other 13pt glyphs.
    private enum PaintChip { case solid, linear, radial }

    private static func drawPaintChip(_ chip: PaintChip, in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        var chipRect = rect
        if chipRect.width > chipRect.height {
            chipRect.origin.x += (chipRect.width - chipRect.height) / 2
            chipRect.size.width = chipRect.height
        } else if chipRect.height > chipRect.width {
            chipRect.origin.y += (chipRect.height - chipRect.width) / 2
            chipRect.size.height = chipRect.width
        }
        guard chipRect.width > 2 else { return }
        let inset = max(0.5, chipRect.width * 0.06)
        let path = NSBezierPath(
            roundedRect: chipRect.insetBy(dx: inset, dy: inset),
            xRadius: chipRect.width * 0.22,
            yRadius: chipRect.width * 0.22
        )
        switch chip {
        case .solid:
            color.setFill()
            path.fill()
        case .linear:
            NSGradient(colors: [color, color.withAlphaComponent(0.15)])?
                .draw(in: path, angle: 0)
        case .radial:
            NSGradient(colors: [color, color.withAlphaComponent(0.15)])?
                .draw(in: path, relativeCenterPosition: .zero)
        }
        color.setStroke()
        path.lineWidth = max(0.5, strokeWidth * 0.6)
        path.stroke()
    }
}

// MARK: - HSV Color Wheel + SV Triangle (Web Parity)

public final class PropertiesColorWheelView: NSView {
    /// Hue in degrees 0…<360. 0° (red) sits at the 3 o'clock position, hue increases clockwise.
    public var hue: CGFloat = 0
    public var saturation: CGFloat = 0
    public var value: CGFloat = 0

    /// Fires with an uppercase "#RRGGBB" string whenever the user drags a knob.
    public var onColorChanged: ((String) -> Void)?

    private enum DragMode { case none, hue, sv }
    private var dragMode: DragMode = .none

    private let ringThickness: CGFloat = 14
    private var isEditingHexDriven = false

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        setAccessibilityIdentifier("Inspector.Properties.ColorWheel")
        setAccessibilityElement(true)
        setAccessibilityRole(.slider)
        setAccessibilityLabel("Color wheel")
        setAccessibilityValue(hex)
    }

    public var hex: String {
        PropertiesColorMath.hex(hue: hue, saturation: saturation, value: value)
    }

    /// Applies a hex color to the wheel state. Hue / saturation are preserved for
    /// achromatic inputs (black / grey) so the hue marker does not jump to red.
    public func setHex(_ raw: String) {
        let normalized = PropertiesColorMath.normalizeHex(raw) ?? "#000000"
        let hsb = PropertiesColorMath.hsb(fromHex: normalized)
        if hsb.value > 0.0005 && hsb.saturation > 0.0005 {
            hue = hsb.hue
        }
        saturation = hsb.saturation
        value = hsb.value
        setAccessibilityValue(hex)
        needsDisplay = true
    }

    // MARK: Geometry

    private var center: CGPoint { CGPoint(x: bounds.midX, y: bounds.midY) }
    private var outerRadius: CGFloat { max(min(bounds.width, bounds.height) / 2, 8) }
    private var ringRadius: CGFloat { max(outerRadius - ringThickness / 2, 6) }
    private var innerRadius: CGFloat { max(outerRadius - ringThickness, 4) }
    private var triangleRadius: CGFloat { max(innerRadius - 3, 3) }

    private var huePoint: CGPoint {
        CGPoint(x: center.x + triangleRadius, y: center.y)
    }
    private var blackPoint: CGPoint {
        CGPoint(x: center.x + triangleRadius * cos(120 * .pi / 180),
                y: center.y + triangleRadius * sin(120 * .pi / 180))
    }
    private var whitePoint: CGPoint {
        CGPoint(x: center.x + triangleRadius * cos(240 * .pi / 180),
                y: center.y + triangleRadius * sin(240 * .pi / 180))
    }

    private var hueKnobPoint: CGPoint {
        let theta = -hue * .pi / 180
        return CGPoint(x: center.x + ringRadius * cos(theta), y: center.y + ringRadius * sin(theta))
    }

    private var svKnobPoint: CGPoint {
        let hueWeight = saturation * value
        let whiteWeight = value * (1 - saturation)
        let blackWeight = 1 - value
        return CGPoint(
            x: huePoint.x * hueWeight + whitePoint.x * whiteWeight + blackPoint.x * blackWeight,
            y: huePoint.y * hueWeight + whitePoint.y * whiteWeight + blackPoint.y * blackWeight
        )
    }

    // MARK: Drawing

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let segs = 180
        let radius = ringRadius
        ctx.saveGState()
        ctx.setLineCap(.butt)
        for i in 0..<segs {
            let a0 = CGFloat(i) * 2 * .pi / CGFloat(segs)
            let a1 = CGFloat(i + 1) * 2 * .pi / CGFloat(segs)
            let midDeg = ((a0 + a1) / 2) * 180 / .pi
            var h = (360 - midDeg).truncatingRemainder(dividingBy: 360)
            if h < 0 { h += 360 }
            ctx.setStrokeColor(PropertiesColorMath.color(hue: h, saturation: 1, value: 1).cgColor)
            ctx.setLineWidth(ringThickness)
            ctx.beginPath()
            ctx.addArc(center: center, radius: radius, startAngle: a0 - 0.004, endAngle: a1 + 0.004, clockwise: false)
            ctx.strokePath()
        }
        ctx.restoreGState()

        drawTriangle(in: ctx)
        drawKnobs(in: ctx)
    }

    private func drawTriangle(in ctx: CGContext) {
        let hueColor = PropertiesColorMath.color(hue: hue, saturation: 1, value: 1)
        let hueVertex = huePoint
        let whiteVertex = whitePoint
        let blackVertex = blackPoint

        let triangle = CGMutablePath()
        triangle.move(to: hueVertex)
        triangle.addLine(to: blackVertex)
        triangle.addLine(to: whiteVertex)
        triangle.closeSubpath()

        ctx.saveGState()
        ctx.addPath(triangle)
        ctx.clip()

        // Base black plane.
        ctx.setFillColor(NSColor.black.cgColor)
        ctx.fill(bounds)

        // Additive hue component (weight = barycentric hue weight).
        ctx.setBlendMode(.plusLighter)
        let footHue = CGPoint(x: (blackVertex.x + whiteVertex.x) / 2, y: (blackVertex.y + whiteVertex.y) / 2)
        drawAlphaGradient(ctx: ctx, from: hueVertex, to: footHue, color: hueColor)

        // Additive white component (weight = barycentric white weight).
        let footWhite = CGPoint(x: (hueVertex.x + blackVertex.x) / 2, y: (hueVertex.y + blackVertex.y) / 2)
        drawAlphaGradient(ctx: ctx, from: whiteVertex, to: footWhite, color: .white)

        ctx.restoreGState()
    }

    private func drawAlphaGradient(ctx: CGContext, from start: CGPoint, to end: CGPoint, color: NSColor) {
        let colors = [color.withAlphaComponent(1.0).cgColor, color.withAlphaComponent(0.0).cgColor] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) else { return }
        ctx.drawLinearGradient(gradient, start: start, end: end,
                               options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    }

    private func drawKnobs(in ctx: CGContext) {
        // Hue knob — hollow white ring filled with the pure hue color.
        let hueColor = PropertiesColorMath.color(hue: hue, saturation: 1, value: 1)
        drawKnob(in: ctx, at: hueKnobPoint, diameter: 15, fill: hueColor, ringWidth: 1.8)

        // Saturation / value knob — white ring filled with the current color.
        let current = PropertiesColorMath.color(hue: hue, saturation: saturation, value: value)
        drawKnob(in: ctx, at: svKnobPoint, diameter: 11, fill: current, ringWidth: 1.6)
    }

    private func drawKnob(in ctx: CGContext, at point: CGPoint, diameter: CGFloat, fill: NSColor, ringWidth: CGFloat) {
        let rect = CGRect(x: point.x - diameter / 2, y: point.y - diameter / 2, width: diameter, height: diameter)
        ctx.setFillColor(fill.cgColor)
        ctx.fillEllipse(in: rect)
        ctx.setStrokeColor(NSColor.white.cgColor)
        ctx.setLineWidth(ringWidth)
        ctx.strokeEllipse(in: rect.insetBy(dx: ringWidth / 2, dy: ringWidth / 2))
        // Thin dark outer hairline keeps the marker legible on bright hues.
        ctx.setStrokeColor(NSColor(white: 0, alpha: 0.35).cgColor)
        ctx.setLineWidth(0.75)
        ctx.strokeEllipse(in: rect.insetBy(dx: -0.4, dy: -0.4))
    }

    // MARK: Interaction

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .crosshair)
    }

    public override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let distance = hypot(point.x - center.x, point.y - center.y)
        if abs(distance - ringRadius) <= ringThickness / 2 + 5 {
            dragMode = .hue
        } else if distance <= innerRadius {
            dragMode = .sv
        } else {
            dragMode = .none
            return
        }
        applyDrag(at: point)
    }

    public override func mouseDragged(with event: NSEvent) {
        guard dragMode != .none else { return }
        applyDrag(at: convert(event.locationInWindow, from: nil))
    }

    public override func mouseUp(with event: NSEvent) {
        dragMode = .none
    }

    private func applyDrag(at point: CGPoint) {
        switch dragMode {
        case .hue:
            var degrees = atan2(point.y - center.y, point.x - center.x) * 180 / .pi
            degrees = (360 - degrees).truncatingRemainder(dividingBy: 360)
            if degrees < 0 { degrees += 360 }
            hue = degrees
        case .sv:
            let weights = barycentric(point)
            var blackWeight = min(max(weights.black, 0), 1)
            var whiteWeight = min(max(weights.white, 0), 1)
            if blackWeight + whiteWeight > 1 {
                let overflow = blackWeight + whiteWeight - 1
                if whiteWeight >= blackWeight {
                    whiteWeight -= overflow
                } else {
                    blackWeight -= overflow
                }
            }
            let v = 1 - blackWeight
            let s = v > 0.0005 ? max(min(whiteWeight / v, 1), 0) : 0
            value = min(max(v, 0), 1)
            saturation = min(max(s, 0), 1)
        case .none:
            return
        }
        setAccessibilityValue(hex)
        needsDisplay = true
        onColorChanged?(hex)
    }

    private func barycentric(_ point: CGPoint) -> (hue: CGFloat, white: CGFloat, black: CGFloat) {
        let v0x = whitePoint.x - huePoint.x, v0y = whitePoint.y - huePoint.y
        let v1x = blackPoint.x - huePoint.x, v1y = blackPoint.y - huePoint.y
        let v2x = point.x - huePoint.x, v2y = point.y - huePoint.y
        let d00 = v0x * v0x + v0y * v0y
        let d01 = v0x * v1x + v0y * v1y
        let d11 = v1x * v1x + v1y * v1y
        let d20 = v2x * v0x + v2y * v0y
        let d21 = v2x * v1x + v2y * v1y
        let denominator = d00 * d11 - d01 * d01
        guard abs(denominator) > 0.000001 else { return (1, 0, 0) }
        let white = (d11 * d20 - d01 * d21) / denominator
        let black = (d00 * d21 - d01 * d20) / denominator
        return (1 - white - black, white, black)
    }
}

// MARK: - Compact Capsule Numeric Field (click to type / drag to scrub)

public final class PropertiesNumberPill: NSView, NSTextFieldDelegate {
    public var labelText: String = "" {
        didSet { labelField.stringValue = labelText; needsLayout = true }
    }
    public var suffix: String = "" {
        didSet { updateDisplay() }
    }
    public var roundsToInteger: Bool = true
    public var minimumValue: CGFloat = -100_000
    public var maximumValue: CGFloat = 100_000
    public var scrubUnitsPerPoint: CGFloat = 1.0
    public var valueAlignment: NSTextAlignment = .left {
        didSet { valueField.alignment = valueAlignment }
    }
    public var leadingGlyph: PropertiesGlyphFactory.Kind? {
        didSet { needsDisplay = true; needsLayout = true }
    }
    public var onValueChanged: ((CGFloat) -> Void)?
    public var onInteractionChanged: ((Bool) -> Void)?

    public private(set) var value: CGFloat = 0

    private let labelField = NSTextField(labelWithString: "")
    private let valueField = NSTextField()
    private var isEditing = false
    private var isHovered = false
    private var dragStartPoint = NSPoint.zero
    private var dragStartValue: CGFloat = 0
    private var editingStartValue: CGFloat = 0
    private var cancelledEditing = false
    private var didDrag = false

    public init(label: String, suffix: String = "") {
        super.init(frame: .zero)
        labelText = label
        self.suffix = suffix
        setupUI()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        setAccessibilityElement(true)
        setAccessibilityRole(.textField)
        setAccessibilityLabel(labelText.isEmpty ? "Value" : labelText)

        labelField.stringValue = labelText
        // Mono like the rest of the web card (`font-mono` on the aside).
        labelField.font = ThemeFonts.mono(size: 9, weight: .medium)
        labelField.textColor = NSColor(hex: "8a8a8a")
        labelField.isBordered = false
        labelField.drawsBackground = false
        labelField.isEditable = false
        labelField.isSelectable = false
        labelField.isHidden = labelText.isEmpty
        addSubview(labelField)

        valueField.font = ThemeFonts.mono(size: 10, weight: .regular)
        valueField.textColor = NSColor(hex: "e5e5e5")
        valueField.isBordered = false
        valueField.drawsBackground = false
        valueField.focusRingType = .none
        valueField.alignment = valueAlignment
        valueField.isEditable = false
        valueField.isSelectable = false
        valueField.delegate = self
        valueField.target = self
        valueField.action = #selector(commitEditing)
        addSubview(valueField)

        updateDisplay()
    }

    // MARK: Value

    public func setValue(_ newValue: CGFloat) {
        value = clamped(newValue)
        updateDisplay()
    }

    private func clamped(_ raw: CGFloat) -> CGFloat {
        min(max(raw, minimumValue), maximumValue)
    }

    private func formatted(_ raw: CGFloat) -> String {
        PropertiesColorMath.formatNumber(raw, integer: roundsToInteger) + suffix
    }

    private func updateDisplay() {
        guard !isEditing else { return }
        valueField.stringValue = formatted(value)
        setAccessibilityValue(valueField.stringValue)
        invalidateIntrinsicContentSize()
    }

    private func parse(_ raw: String) -> CGFloat? {
        var clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !suffix.isEmpty, clean.hasSuffix(suffix) {
            clean = String(clean.dropLast(suffix.count))
        }
        clean = clean.replacingOccurrences(of: ",", with: ".")
        clean = clean.replacingOccurrences(of: "°", with: "")
        clean = clean.replacingOccurrences(of: "%", with: "")
        return Double(clean).flatMap { $0.isFinite ? CGFloat($0) : nil }
    }

    // MARK: Layout

    public override func layout() {
        super.layout()
        let glyphSpace: CGFloat = leadingGlyph == nil ? 0 : 20
        let labelSpace: CGFloat
        if labelText.isEmpty || leadingGlyph != nil {
            labelSpace = 0
        } else {
            labelSpace = labelText.count >= 2 ? 17 : 9
        }
        // One baseline shared by the inline prefix and the value. Both fields
        // are sized to exactly their line height, so their text is top-aligned
        // inside the frame and the baseline math is exact (a plain "centre each
        // font box" placement left the small prefix ~1pt above the value).
        let valueFont = ThemeFonts.mono(size: 10, weight: .regular)
        let valueLineHeight = ceil(valueFont.ascender - valueFont.descender)
        let valueY = round((bounds.height - valueLineHeight) / 2.0)
        let baselineFromBottom = valueY + valueLineHeight - valueFont.ascender

        let labelFont = ThemeFonts.mono(size: 9, weight: .medium)
        let labelLineHeight = ceil(labelFont.ascender - labelFont.descender)
        let labelY = round(baselineFromBottom - labelLineHeight + labelFont.ascender)

        labelField.frame = CGRect(x: 7 + glyphSpace, y: labelY,
                                  width: max(labelSpace, 1), height: labelLineHeight)
        labelField.isHidden = labelText.isEmpty || leadingGlyph != nil
        let textX = 7 + glyphSpace + labelSpace + 2
        valueField.frame = CGRect(x: textX, y: valueY,
                                  width: max(bounds.width - textX - 4, 8), height: valueLineHeight)
    }

    // MARK: Drawing

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                                xRadius: 8, yRadius: 8)
        (isHovered || isEditing ? NSColor(hex: "1f1f1f") : NSColor(hex: "171717")).setFill()
        path.fill()
        NSColor(white: 1.0, alpha: 0.05).setStroke()
        path.lineWidth = 1
        path.stroke()

        if let glyph = leadingGlyph {
            PropertiesGlyphFactory.draw(kind: glyph,
                                        in: CGRect(x: 8, y: floor((bounds.height - 12) / 2), width: 12, height: 12),
                                        color: NSColor(hex: "c9c9c9"), strokeWidth: 1.4)
        }
    }

    // MARK: Hover

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self && area.userInfo == nil {
            removeTrackingArea(area)
        }
        let area = NSTrackingArea(rect: .zero,
                                  options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                  owner: self, userInfo: nil)
        addTrackingArea(area)
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }

    // MARK: Mouse (click = edit, drag = scrub)

    public override func hitTest(_ point: NSPoint) -> NSView? {
        if isEditing { return super.hitTest(point) }
        let local = convert(point, from: superview)
        return bounds.contains(local) ? self : nil
    }

    public override func mouseDown(with event: NSEvent) {
        onInteractionChanged?(true)
        dragStartPoint = event.locationInWindow
        dragStartValue = value
        didDrag = false
    }

    public override func mouseDragged(with event: NSEvent) {
        let dx = event.locationInWindow.x - dragStartPoint.x
        if abs(dx) > 1.5 { didDrag = true }
        guard didDrag else { return }
        let multiplier: CGFloat = event.modifierFlags.contains(.shift) ? 0.1 : 1.0
        let raw = dragStartValue + dx * scrubUnitsPerPoint * multiplier
        value = clamped(roundsToInteger ? round(raw) : raw)
        updateDisplay()
        onValueChanged?(value)
    }

    public override func mouseUp(with event: NSEvent) {
        onInteractionChanged?(false)
        if !didDrag && !isEditing {
            beginEditing()
        }
    }

    private func beginEditing() {
        editingStartValue = value
        cancelledEditing = false
        isEditing = true
        valueField.isEditable = true
        valueField.isSelectable = true
        valueField.stringValue = PropertiesColorMath.formatNumber(value, integer: roundsToInteger)
        if let window = window {
            window.makeFirstResponder(valueField)
            valueField.currentEditor()?.selectAll(nil)
        }
        needsDisplay = true
    }

    @objc private func commitEditing() {
        window?.makeFirstResponder(nil)
    }

    public func controlTextDidEndEditing(_ obj: Notification) {
        isEditing = false
        if !cancelledEditing, let parsed = parse(valueField.stringValue) {
            value = clamped(parsed)
            onValueChanged?(value)
        }
        updateDisplay()
        valueField.isEditable = false
        valueField.isSelectable = false
        needsDisplay = true
    }
    public func control(
        _ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector
    ) -> Bool {
        guard commandSelector == NSSelectorFromString("cancelOperation:") else { return false }
        cancelledEditing = true
        value = editingStartValue
        isEditing = false
        window?.makeFirstResponder(nil)
        valueField.isEditable = false
        valueField.isSelectable = false
        updateDisplay()
        return true
    }

}

// MARK: - Compact Capsule Hex Field (click to edit)

public final class PropertiesHexPill: NSView, NSTextFieldDelegate {
    public var showsColorDot: Bool = false {
        didSet { needsLayout = true; needsDisplay = true }
    }
    public private(set) var hex: String = "#000000"
    public var onHexChange: ((String) -> Void)?

    private let textField = NSTextField()
    private var isEditing = false
    private var isHovered = false

    public init(hex: String = "#000000", showsColorDot: Bool = false) {
        super.init(frame: .zero)
        self.hex = PropertiesColorMath.normalizeHex(hex) ?? "#000000"
        self.showsColorDot = showsColorDot
        setupUI()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        setAccessibilityElement(true)
        setAccessibilityRole(.textField)
        setAccessibilityLabel("Hex color")

        textField.font = ThemeFonts.mono(size: 10, weight: .regular)
        textField.textColor = NSColor(hex: "d6d6d6")
        textField.isBordered = false
        textField.drawsBackground = false
        textField.focusRingType = .none
        textField.alignment = showsColorDot ? .left : .center
        textField.isEditable = false
        textField.isSelectable = false
        textField.delegate = self
        textField.target = self
        textField.action = #selector(commitEditing)
        textField.stringValue = hex
        addSubview(textField)
        setAccessibilityValue(hex)
    }

    public func setHex(_ raw: String) {
        let normalized = PropertiesColorMath.normalizeHex(raw) ?? "#000000"
        hex = normalized
        if !isEditing { textField.stringValue = normalized }
        setAccessibilityValue(normalized)
        needsDisplay = true
    }

    public override func layout() {
        super.layout()
        // px8 on both sides and a line box that is an exact height, so the hex
        // text sits on the pill's true vertical centre (the old 7pt right inset
        // and 15pt-tall field pushed centred text 0.5pt left and off-centre).
        let left: CGFloat = showsColorDot ? 23 : 8
        textField.alignment = showsColorDot ? .left : .center
        let font = textField.font ?? ThemeFonts.mono(size: 10, weight: .regular)
        let lineHeight = ceil(font.ascender - font.descender)
        let textY = round((bounds.height - lineHeight) / 2.0)
        textField.frame = CGRect(x: left, y: textY,
                                 width: max(bounds.width - left - 8, 8), height: lineHeight)
    }

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                                xRadius: 8, yRadius: 8)
        (isHovered || isEditing ? NSColor(hex: "1f1f1f") : NSColor(hex: "171717")).setFill()
        path.fill()
        NSColor(white: 1.0, alpha: 0.05).setStroke()
        path.lineWidth = 1
        path.stroke()

        if showsColorDot {
            let dotRect = CGRect(x: 8, y: floor((bounds.height - 11) / 2), width: 11, height: 11)
            let dot = NSBezierPath(roundedRect: dotRect, xRadius: 3, yRadius: 3)
            NSColor(hex: hex).setFill()
            dot.fill()
            NSColor(white: 1.0, alpha: 0.28).setStroke()
            dot.lineWidth = 1
            dot.stroke()
        }
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self && area.userInfo == nil {
            removeTrackingArea(area)
        }
        addTrackingArea(NSTrackingArea(rect: .zero,
                                       options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }

    public override func hitTest(_ point: NSPoint) -> NSView? {
        if isEditing { return super.hitTest(point) }
        let local = convert(point, from: superview)
        return bounds.contains(local) ? self : nil
    }

    public override func mouseDown(with event: NSEvent) {
        beginEditing()
    }

    private func beginEditing() {
        guard !isEditing else { return }
        isEditing = true
        textField.isEditable = true
        textField.isSelectable = true
        textField.stringValue = hex
        if let window = window {
            window.makeFirstResponder(textField)
            textField.currentEditor()?.selectAll(nil)
        }
        needsDisplay = true
    }

    @objc private func commitEditing() {
        window?.makeFirstResponder(nil)
    }

    public func controlTextDidEndEditing(_ obj: Notification) {
        isEditing = false
        if let normalized = PropertiesColorMath.normalizeHex(textField.stringValue) {
            let changed = normalized != hex
            hex = normalized
            setAccessibilityValue(normalized)
            textField.stringValue = normalized
            if changed { onHexChange?(normalized) }
        } else {
            textField.stringValue = hex
        }
        textField.isEditable = false
        textField.isSelectable = false
        needsDisplay = true
    }
}

// MARK: - Fill / Stroke Double Swatch (Web Parity)

public final class PropertiesFillSwatchView: NSView {
    public var fillHex: String = "#000000" { didSet { needsDisplay = true } }
    public var strokeHex: String = "#b2ffd6" { didSet { needsDisplay = true } }
    public var onClick: (() -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Fill and stroke swatch")
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    public override func draw(_ dirtyRect: NSRect) {
        // Rear stroke swatch (offset bottom-right), then front fill swatch. Both
        // faces are 20×20 with a symmetric 1pt margin, so the 30×30 control is
        // exactly filled and the pair reads as one icon.
        let backRect = CGRect(x: 9, y: 1, width: 20, height: 20)
        let back = NSBezierPath(roundedRect: backRect, xRadius: 8, yRadius: 8)
        NSColor(white: 1.0, alpha: 0.16).setStroke()
        back.lineWidth = 1.2
        back.stroke()

        let frontRect = CGRect(x: 1, y: 9, width: 20, height: 20)
        let front = NSBezierPath(roundedRect: frontRect, xRadius: 8, yRadius: 8)
        NSColor(hex: fillHex).setFill()
        front.fill()
        NSColor(white: 1.0, alpha: 0.28).setStroke()
        front.lineWidth = 1
        front.stroke()
    }

    public override func mouseDown(with event: NSEvent) {
        onClick?()
    }
}

// MARK: - Icon Button (header + eyedropper + swap)

public final class PropertiesIconButton: NSButton {
    public enum ButtonStyle {
        case plain
        case circular
    }

    public var iconKind: PropertiesGlyphFactory.Kind = .settings { didSet { needsDisplay = true } }
    public var buttonStyle: ButtonStyle = .plain { didSet { needsDisplay = true } }
    public var iconColor: NSColor = NSColor(hex: "737373") { didSet { needsDisplay = true } }
    /// Explicit glyph padding; -1 keeps the style default (circular 8, plain 0.5).
    public var iconPadding: CGFloat = -1 { didSet { needsDisplay = true } }
    /// Draws a round white/8 hover wash (header icon buttons per UI spec p4 radius-full).
    public var showsHoverBackground: Bool = false

    private var isHovered = false

    public init(kind: PropertiesGlyphFactory.Kind, style: ButtonStyle = .plain) {
        super.init(frame: .zero)
        iconKind = kind
        buttonStyle = style
        isBordered = false
        focusRingType = .none
        title = ""
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
    }

    public override func draw(_ dirtyRect: NSRect) {
        if isHovered {
            NSColor(white: 1.0, alpha: 0.08).setFill()
            if showsHoverBackground {
                // Header controls: round hover wash (UI spec: p4, radius-full).
                NSBezierPath(ovalIn: bounds.insetBy(dx: 0.5, dy: 0.5)).fill()
            } else if buttonStyle == .plain {
                // Inline controls share the pill radius of the fields beside them.
                NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                             xRadius: 8, yRadius: 8).fill()
            }
        }
        if buttonStyle == .circular {
            let bg = NSBezierPath(ovalIn: bounds.insetBy(dx: 0.5, dy: 0.5))
            (isHovered ? NSColor(hex: "333333") : NSColor(hex: "262626")).setFill()
            bg.fill()
        }
        let inset: CGFloat = iconPadding >= 0 ? iconPadding : (buttonStyle == .circular ? 8 : 0.5)
        let iconRect = bounds.insetBy(dx: inset, dy: inset)
        let color = isHovered ? NSColor(hex: "e5e5e5") : iconColor
        PropertiesGlyphFactory.draw(kind: iconKind, in: iconRect, color: color, strokeWidth: 1.5)
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self && area.userInfo == nil {
            removeTrackingArea(area)
        }
        addTrackingArea(NSTrackingArea(rect: .zero,
                                       options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }
}

// MARK: - Blend Mode Capsule Menu Button

public final class PropertiesBlendModeButton: NSButton {
    public var onValueChange: ((String) -> Void)?
    /// Title shown when `selectedValue` is not one of the menu items.
    public var placeholderTitle: String = "Normal" {
        didSet { needsDisplay = true; setAccessibilityValue(displayTitle) }
    }

    private var items: [(title: String, value: String)] = []
    private var isHovered = false

    public private(set) var selectedValue: String = "source-over" {
        didSet { needsDisplay = true; setAccessibilityValue(displayTitle) }
    }

    private var displayTitle: String {
        items.first(where: { $0.value == selectedValue })?.title ?? placeholderTitle
    }

    public init() {
        super.init(frame: .zero)
        isBordered = false
        focusRingType = .none
        title = ""
        setAccessibilityElement(true)
        setAccessibilityRole(.popUpButton)
        setAccessibilityLabel("Blend mode")
        setAccessibilityValue(displayTitle)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
    }

    public func setItems(_ newItems: [(title: String, value: String)]) {
        items = newItems
        if items.contains(where: { $0.value == selectedValue }) == false {
            selectedValue = items.first?.value ?? "source-over"
        }
        needsDisplay = true
    }

    public func select(value: String) {
        selectedValue = value
    }

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                                xRadius: 8, yRadius: 8)
        (isHovered ? NSColor(hex: "1f1f1f") : NSColor(hex: "171717")).setFill()
        path.fill()
        NSColor(white: 1.0, alpha: 0.05).setStroke()
        path.lineWidth = 1
        path.stroke()

        let font = ThemeFonts.mono(size: 10, weight: .medium)
        let lineHeight = ceil(font.ascender - font.descender)
        let textRect = CGRect(x: 10, y: round((bounds.height - lineHeight) / 2),
                              width: max(bounds.width - 34, 10), height: lineHeight)
        (displayTitle as NSString).draw(in: textRect, withAttributes: [
            .font: font,
            .foregroundColor: NSColor(hex: "d6d6d6")
        ])
        PropertiesGlyphFactory.draw(kind: .chevronDown,
                                    in: CGRect(x: bounds.width - 22, y: (bounds.height - 10) / 2, width: 10, height: 10),
                                    color: NSColor(hex: "8a8a8a"), strokeWidth: 1.3)
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self && area.userInfo == nil {
            removeTrackingArea(area)
        }
        addTrackingArea(NSTrackingArea(rect: .zero,
                                       options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }

    public override func mouseDown(with event: NSEvent) {
        let menu = NSMenu()
        menu.autoenablesItems = false
        for item in items {
            let menuItem = NSMenuItem(title: item.title, action: #selector(selectMenuItem(_:)), keyEquivalent: "")
            menuItem.target = self
            menuItem.representedObject = item.value
            menuItem.state = item.value == selectedValue ? .on : .off
            menu.addItem(menuItem)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: -4), in: self)
    }

    @objc private func selectMenuItem(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? String else { return }
        selectedValue = value
        onValueChange?(value)
    }
}

// MARK: - Paint-Type Menu Trigger (COLOR fill row, web: PaintTypeMenu)

/// Compact 24pt paint-type trigger for the COLOR fill row. Shows a 13pt paint
/// chip for the current paint type and opens a menu with Solid / Linear
/// gradient / Radial gradient, so paint switching lives in a menu on the fill
/// row (web `PaintTypeMenu`) instead of a full-width segmented bar. It routes
/// through `PropertiesSegmentedControl`'s `applyFillMode` path, keeping the old
/// behaviour (and `fillModeControl`) reachable.
public final class PropertiesPaintTypeButton: NSButton {
    public private(set) var paintType: String = "solid"

    public var onPaintTypeChange: ((String) -> Void)?

    private static let options: [(title: String, value: String)] = [
        ("Solid", "solid"),
        ("Linear gradient", "linear"),
        ("Radial gradient", "radial")
    ]

    private var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }

    private var displayTitle: String {
        Self.options.first(where: { $0.value == paintType })?.title ?? "Solid"
    }

    public init() {
        super.init(frame: .zero)
        isBordered = false
        focusRingType = .none
        title = ""
        setAccessibilityElement(true)
        setAccessibilityRole(.popUpButton)
        setAccessibilityLabel("Fill type")
        setAccessibilityValue(displayTitle)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
    }

    public func setPaintType(_ value: String) {
        let resolved = Self.options.contains(where: { $0.value == value }) ? value : "solid"
        guard resolved != paintType else { return }
        paintType = resolved
        setAccessibilityValue(displayTitle)
        needsDisplay = true
    }

    public override func draw(_ dirtyRect: NSRect) {
        if isHovered {
            NSColor(white: 1.0, alpha: 0.08).setFill()
            NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                         xRadius: 8, yRadius: 8).fill()
        }
        let side: CGFloat = 13
        let chipRect = CGRect(x: round(bounds.midX - side / 2),
                              y: round(bounds.midY - side / 2),
                              width: side, height: side)
        let kind: PropertiesGlyphFactory.Kind
        switch paintType {
        case "linear": kind = .paintLinear
        case "radial": kind = .paintRadial
        default: kind = .paintSolid
        }
        PropertiesGlyphFactory.draw(
            kind: kind,
            in: chipRect,
            color: isHovered ? NSColor(hex: "e5e5e5") : NSColor(hex: "c9c9c9"),
            strokeWidth: 1.4
        )
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self && area.userInfo == nil {
            removeTrackingArea(area)
        }
        addTrackingArea(NSTrackingArea(rect: .zero,
                                       options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
    }

    public override func mouseDown(with event: NSEvent) {
        let menu = NSMenu()
        menu.autoenablesItems = false
        for option in Self.options {
            let item = NSMenuItem(title: option.title,
                                  action: #selector(selectOption(_:)),
                                  keyEquivalent: "")
            item.target = self
            item.representedObject = option.value
            item.state = option.value == paintType ? .on : .off
            menu.addItem(item)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: -4), in: self)
    }

    @objc private func selectOption(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? String else { return }
        setPaintType(value)
        onPaintTypeChange?(value)
    }
}

// MARK: - Compact "Aa" Typography Menu Button

public final class PropertiesTypographyMenuButton: NSButton {
    public var currentWeight: String = "regular"
    public var currentTextAlign: String = "left"
    public var currentLineHeight: CGFloat = 1.2
    public var currentLetterSpacing: CGFloat = 0

    public var onWeightChange: ((String) -> Void)?
    public var onTextAlignChange: ((String) -> Void)?
    public var onLineHeightChange: ((CGFloat) -> Void)?
    public var onLetterSpacingChange: ((CGFloat) -> Void)?

    private var isHovered = false

    public init() {
        super.init(frame: .zero)
        isBordered = false
        focusRingType = .none
        title = ""
        setAccessibilityElement(true)
        setAccessibilityRole(.popUpButton)
        setAccessibilityLabel("Typography")
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
    }

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
                                xRadius: 8, yRadius: 8)
        (isHovered ? NSColor(hex: "2d2d2d") : NSColor(hex: "262626")).setFill()
        path.fill()
        NSColor(white: 1.0, alpha: 0.05).setStroke()
        path.lineWidth = 1
        path.stroke()

        let attributed = NSAttributedString(string: "Aa", attributes: [
            .font: NSFont.systemFont(ofSize: 10.5, weight: .medium),
            .foregroundColor: NSColor(hex: "d6d6d6")
        ])
        let textSize = attributed.size()
        let textRect = CGRect(x: round((bounds.width - textSize.width) / 2),
                              y: round((bounds.height - textSize.height) / 2),
                              width: textSize.width, height: textSize.height)
        attributed.draw(in: textRect)
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self && area.userInfo == nil {
            removeTrackingArea(area)
        }
        addTrackingArea(NSTrackingArea(rect: .zero,
                                       options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }

    public override func mouseDown(with event: NSEvent) {
        let root = NSMenu()
        root.autoenablesItems = false
        root.addItem(makeSubmenu(title: "字重", category: "weight",
                                 accessibilityIdentifier: "Inspector.Properties.Weight",
                                 options: [("Regular", "regular"), ("Medium", "medium"),
                                           ("Semibold", "semibold"), ("Bold", "bold")]))
        root.addItem(makeSubmenu(title: "对齐", category: "align",
                                 accessibilityIdentifier: "Inspector.Properties.Align",
                                 options: [("Left", "left"), ("Center", "center"),
                                           ("Right", "right"), ("Justify", "justify")]))
        root.addItem(makeSubmenu(title: "行高", category: "lineHeight",
                                 accessibilityIdentifier: "Inspector.Properties.LineHeight",
                                 options: [("Auto (1.2)", "1.2"), ("1.0", "1.0"),
                                           ("1.5", "1.5"), ("2.0", "2.0")]))
        root.addItem(makeSubmenu(title: "字距", category: "spacing",
                                 accessibilityIdentifier: "Inspector.Properties.LetterSpacing",
                                 options: [("0", "0"), ("-1", "-1"), ("0.5", "0.5"),
                                           ("1", "1"), ("2", "2")]))
        root.popUp(positioning: nil, at: NSPoint(x: 0, y: -4), in: self)
    }

    private func makeSubmenu(title: String, category: String,
                             accessibilityIdentifier: String,
                             options: [(title: String, tag: String)]) -> NSMenuItem {
        let submenu = NSMenu()
        submenu.autoenablesItems = false
        let parent = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        parent.setAccessibilityIdentifier(accessibilityIdentifier)
        for option in options {
            let item = NSMenuItem(title: option.title,
                                  action: #selector(selectFormatItem(_:)),
                                  keyEquivalent: "")
            item.target = self
            item.representedObject = "\(category)|\(option.tag)"
            item.state = isChecked(category: category, tag: option.tag) ? .on : .off
            submenu.addItem(item)
        }
        parent.submenu = submenu
        return parent
    }

    private func isChecked(category: String, tag: String) -> Bool {
        switch category {
        case "weight": return currentWeight == tag
        case "align": return currentTextAlign == tag
        case "lineHeight": return abs(currentLineHeight - CGFloat(Double(tag) ?? 0)) < 0.0001
        case "spacing": return abs(currentLetterSpacing - CGFloat(Double(tag) ?? 0)) < 0.0001
        default: return false
        }
    }

    @objc private func selectFormatItem(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String,
              let separator = raw.firstIndex(of: "|") else { return }
        let category = String(raw[..<separator])
        let tag = String(raw[raw.index(after: separator)...])
        switch category {
        case "weight":
            currentWeight = tag
            onWeightChange?(tag)
        case "align":
            currentTextAlign = tag
            onTextAlignChange?(tag)
        case "lineHeight":
            let value = min(max(CGFloat(Double(tag) ?? 1.2), 0.5), 4.0)
            currentLineHeight = value
            onLineHeightChange?(value)
        case "spacing":
            let value = min(max(CGFloat(Double(tag) ?? 0), -20), 50)
            currentLetterSpacing = value
            onLetterSpacingChange?(value)
        default:
            break
        }
        needsDisplay = true
    }
}

// MARK: - Properties Segmented Control

public final class PropertiesSegmentedControl: NSView {
    public struct Segment {
        public var title: String
        public var icon: PropertiesGlyphFactory.Kind?
        public var value: String
        public init(title: String, icon: PropertiesGlyphFactory.Kind? = nil, value: String) {
            self.title = title
            self.icon = icon
            self.value = value
        }
    }

    public var onSelectionChanged: ((Int, String) -> Void)?
    public private(set) var selectedIndex: Int = 0
    public var segments: [Segment] = [] {
        didSet {
            if selectedIndex >= segments.count { selectedIndex = max(0, segments.count - 1) }
            needsDisplay = true
        }
    }

    public init(segments: [Segment] = []) {
        self.segments = segments
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 8
        layer?.masksToBounds = true
        setAccessibilityElement(true)
        setAccessibilityRole(.radioGroup)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
        layer?.cornerRadius = 8
        layer?.masksToBounds = true
    }

    public func select(index: Int, notify: Bool = false) {
        guard index >= 0, index < segments.count else { return }
        selectedIndex = index
        setAccessibilityValue(segments[index].value)
        needsDisplay = true
        if notify {
            onSelectionChanged?(index, segments[index].value)
        }
    }

    public func select(value: String, notify: Bool = false) {
        if let idx = segments.firstIndex(where: { $0.value == value }) {
            select(index: idx, notify: notify)
        }
    }

    public override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)
        guard bounds.width > 0, !segments.isEmpty else { return }
        let segmentWidth = bounds.width / CGFloat(segments.count)
        let clickedIndex = min(max(Int(location.x / segmentWidth), 0), segments.count - 1)
        select(index: clickedIndex, notify: true)
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(NSColor(hex: "1a1a1a").cgColor)
        ctx.fill(bounds)

        guard !segments.isEmpty else { return }
        let segmentWidth = bounds.width / CGFloat(segments.count)

        let selectedRect = CGRect(x: CGFloat(selectedIndex) * segmentWidth + 1,
                                  y: 1,
                                  width: segmentWidth - 2,
                                  height: bounds.height - 2)
        let selectedPath = CGPath(roundedRect: selectedRect, cornerWidth: 7, cornerHeight: 7, transform: nil)
        ctx.setFillColor(NSColor(hex: "333333").cgColor)
        ctx.addPath(selectedPath)
        ctx.fillPath()

        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.1).cgColor)
        ctx.setLineWidth(1)
        ctx.stroke(bounds.insetBy(dx: 0.5, dy: 0.5))

        for (i, seg) in segments.enumerated() {
            let segRect = CGRect(x: CGFloat(i) * segmentWidth, y: 0, width: segmentWidth, height: bounds.height)
            let isSelected = (i == selectedIndex)
            let textColor = isSelected ? NSColor.white : NSColor(hex: "a3a3a3")

            if let iconKind = seg.icon {
                let iconSize: CGFloat = min(segRect.height - 8, 14)
                let iconRect = CGRect(x: segRect.midX - iconSize / 2,
                                      y: segRect.midY - iconSize / 2,
                                      width: iconSize,
                                      height: iconSize)
                PropertiesGlyphFactory.draw(kind: iconKind, in: iconRect, color: textColor, strokeWidth: 1.5)
            } else {
                let paragraphStyle = NSMutableParagraphStyle()
                paragraphStyle.alignment = .center
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: ThemeFonts.mono(size: 10, weight: isSelected ? .medium : .regular),
                    .foregroundColor: textColor,
                    .paragraphStyle: paragraphStyle
                ]
                let str = NSAttributedString(string: seg.title, attributes: attrs)
                let strSize = str.size()
                let strRect = CGRect(x: segRect.minX,
                                     y: segRect.midY - strSize.height / 2,
                                     width: segRect.width,
                                     height: strSize.height)
                str.draw(in: strRect)
            }
        }
    }
}

// MARK: - Gradient Stops Bar View

public final class GradientStopsBarView: NSView {
    public struct Stop {
        public var color: NSColor
        public var location: CGFloat // 0.0 ... 1.0
        public init(color: NSColor, location: CGFloat) {
            self.color = color
            self.location = min(max(location, 0), 1)
        }
    }

    public var stops: [Stop] = [
        Stop(color: .white, location: 0.0),
        Stop(color: .black, location: 1.0)
    ] {
        didSet {
            if selectedIndex >= stops.count { selectedIndex = max(0, stops.count - 1) }
            needsDisplay = true
        }
    }

    public private(set) var selectedIndex: Int = 0
    public var onStopsChange: (([Stop]) -> Void)?
    public var onSelectionChange: ((Int, Stop) -> Void)?

    private var isDragging = false

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.cornerRadius = 6
        layer?.masksToBounds = false
        setAccessibilityElement(true)
        setAccessibilityRole(.slider)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
        layer?.cornerRadius = 6
        layer?.masksToBounds = false
    }

    public var selectedStop: Stop? {
        guard selectedIndex >= 0, selectedIndex < stops.count else { return nil }
        return stops[selectedIndex]
    }

    public func updateSelectedColor(_ color: NSColor) {
        guard selectedIndex >= 0, selectedIndex < stops.count else { return }
        stops[selectedIndex].color = color
        needsDisplay = true
        onStopsChange?(stops)
    }

    public func selectStop(at index: Int) {
        guard index >= 0, index < stops.count else { return }
        selectedIndex = index
        needsDisplay = true
        onSelectionChange?(selectedIndex, stops[selectedIndex])
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let trackHeight: CGFloat = 14
        let trackY = (bounds.height - trackHeight) / 2
        let trackRect = CGRect(x: 8, y: trackY, width: max(bounds.width - 16, 10), height: trackHeight)

        ctx.saveGState()
        let trackPath = CGPath(roundedRect: trackRect, cornerWidth: 4, cornerHeight: 4, transform: nil)
        ctx.addPath(trackPath)
        ctx.clip()

        let sortedStops = stops.sorted { $0.location < $1.location }
        var cgColors: [CGColor] = []
        var locations: [CGFloat] = []
        for stop in sortedStops {
            cgColors.append(stop.color.cgColor)
            locations.append(stop.location)
        }
        if !cgColors.isEmpty, let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                                    colors: cgColors as CFArray,
                                                    locations: locations) {
            ctx.drawLinearGradient(grad,
                                   start: CGPoint(x: trackRect.minX, y: trackRect.midY),
                                   end: CGPoint(x: trackRect.maxX, y: trackRect.midY),
                                   options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
        ctx.restoreGState()

        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.15).cgColor)
        ctx.setLineWidth(1)
        ctx.addPath(trackPath)
        ctx.strokePath()

        for (i, stop) in stops.enumerated() {
            let knobX = trackRect.minX + stop.location * trackRect.width
            let knobY = trackRect.midY
            let knobRect = CGRect(x: knobX - 6, y: knobY - 6, width: 12, height: 12)
            let isSelected = (i == selectedIndex)

            ctx.saveGState()
            if isSelected {
                ctx.setShadow(offset: .zero, blur: 4, color: NSColor(hex: "a7ffd4").cgColor)
            }
            ctx.setFillColor(stop.color.cgColor)
            ctx.fillEllipse(in: knobRect)

            ctx.setStrokeColor(isSelected ? NSColor.white.cgColor : NSColor(white: 0.8, alpha: 0.8).cgColor)
            ctx.setLineWidth(isSelected ? 2.0 : 1.5)
            ctx.strokeEllipse(in: knobRect)
            ctx.restoreGState()
        }
    }

    public override func mouseDown(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        let trackRect = CGRect(x: 8, y: (bounds.height - 14) / 2, width: max(bounds.width - 16, 10), height: 14)

        for (i, stop) in stops.enumerated() {
            let knobX = trackRect.minX + stop.location * trackRect.width
            let knobRect = CGRect(x: knobX - 8, y: trackRect.midY - 8, width: 16, height: 16)
            if knobRect.contains(loc) {
                selectedIndex = i
                isDragging = true
                needsDisplay = true
                onSelectionChange?(selectedIndex, stops[selectedIndex])
                return
            }
        }

        if trackRect.insetBy(dx: -4, dy: -4).contains(loc) {
            let frac = min(max((loc.x - trackRect.minX) / trackRect.width, 0), 1)
            let interpolatedColor = interpolateColor(at: frac)
            let newStop = Stop(color: interpolatedColor, location: frac)
            stops.append(newStop)
            selectedIndex = stops.count - 1
            isDragging = true
            needsDisplay = true
            onSelectionChange?(selectedIndex, newStop)
            onStopsChange?(stops)
        }
    }

    public override func mouseDragged(with event: NSEvent) {
        guard isDragging, selectedIndex >= 0, selectedIndex < stops.count else { return }
        let loc = convert(event.locationInWindow, from: nil)
        let trackRect = CGRect(x: 8, y: (bounds.height - 14) / 2, width: max(bounds.width - 16, 10), height: 14)
        let frac = min(max((loc.x - trackRect.minX) / trackRect.width, 0), 1)
        stops[selectedIndex].location = frac
        needsDisplay = true
        onStopsChange?(stops)
    }

    public override func mouseUp(with event: NSEvent) {
        isDragging = false
    }

    private func interpolateColor(at frac: CGFloat) -> NSColor {
        let sorted = stops.sorted { $0.location < $1.location }
        guard !sorted.isEmpty else { return .white }
        if frac <= sorted.first!.location { return sorted.first!.color }
        if frac >= sorted.last!.location { return sorted.last!.color }
        for i in 0..<(sorted.count - 1) {
            let s1 = sorted[i]
            let s2 = sorted[i + 1]
            if frac >= s1.location && frac <= s2.location {
                let range = s2.location - s1.location
                let t = range > 0 ? (frac - s1.location) / range : 0
                return blend(c1: s1.color, c2: s2.color, t: t)
            }
        }
        return sorted.first!.color
    }

    private func blend(c1: NSColor, c2: NSColor, t: CGFloat) -> NSColor {
        let rgb1 = c1.usingColorSpace(.sRGB) ?? c1
        let rgb2 = c2.usingColorSpace(.sRGB) ?? c2
        let r = rgb1.redComponent + (rgb2.redComponent - rgb1.redComponent) * t
        let g = rgb1.greenComponent + (rgb2.greenComponent - rgb1.greenComponent) * t
        let b = rgb1.blueComponent + (rgb2.blueComponent - rgb1.blueComponent) * t
        let a = rgb1.alphaComponent + (rgb2.alphaComponent - rgb1.alphaComponent) * t
        return NSColor(srgbRed: r, green: g, blue: b, alpha: a)
    }
}

// MARK: - Flipped Container (top-down subview layout)

public final class PropertiesFlippedContainerView: NSView {
    public override var isFlipped: Bool { true }
}

// MARK: - Colour Swatch Button (FILL / STROKE rows, web 20×20 swatch)

public final class PropertiesColorSwatchButton: NSButton {
    /// Current colour shown in the swatch.
    public var swatchHex: String = "#D4D4D4" {
        didSet { if oldValue != swatchHex { needsDisplay = true } }
    }
    /// Checkerboard-less "no paint" face (dark placeholder).
    public var showsNoneFace: Bool = false {
        didSet { needsDisplay = true }
    }
    public var onPick: (() -> Void)?

    public init(hex: String = "#D4D4D4") {
        self.swatchHex = hex
        super.init(frame: .zero)
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Colour swatch")
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
    }

    @objc private func handleClick() { onPick?() }

    public override func draw(_ dirtyRect: NSRect) {
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6)
        if showsNoneFace {
            NSColor(white: 0.16, alpha: 1).setFill()
            path.fill()
        } else {
            (NSColor(hexString: swatchHex) ?? .white).setFill()
            path.fill()
        }
        NSColor(white: 1.0, alpha: 0.24).setStroke()
        path.lineWidth = 1
        path.stroke()
    }
}

// MARK: - Properties Panel View (The Web-Parity Card Content)

public final class PropertiesPanelView: NSView {
    /// Full scrollable document height. The visible web card is only 368pt tall
    /// (header + COLOR + SHAPE); TRANSFORM / APPEARANCE live below the fold.
    public static let preferredContentHeight: CGFloat = 520

    /// AppKit scrolls a document view to reveal a subview being edited/laid out.
    /// The inspector card must always open at its first section, so block that:
    /// the host controls the scroll position explicitly.
    public override func scrollToVisible(_ rect: NSRect) -> Bool { false }

    // Public API -------------------------------------------------------------
    /// Last non-`none` fill / stroke, so the row eye can restore what it hid.
    private var lastVisibleFill: String = "#D4D4D4"
    private var lastVisibleStroke: String = "#FFFFFF"

    public var onFillChange: ((String) -> Void)?
    public var onStrokeChange: ((String) -> Void)?
    public var onStrokeWidthChange: ((CGFloat) -> Void)?
    public var onOpacityChange: ((CGFloat) -> Void)?
    public var onBlendModeChange: ((String) -> Void)?
    public var onCornerRadiusChange: ((CGFloat) -> Void)?
    public var onGeometryChange: ((_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat, _ cr: CGFloat?) -> Void)?
    /// Text-layer typography (only surfaced for `NodeKind.text` selections).
    public var onFontFamilyChange: ((String) -> Void)?
    public var onFontSizeChange: ((CGFloat) -> Void)?
    public var onFontWeightChange: ((String) -> Void)?
    public var onTextAlignChange: ((String) -> Void)?
    public var onLineHeightChange: ((CGFloat) -> Void)?
    public var onLetterSpacingChange: ((CGFloat) -> Void)?

    // M2 Callbacks -----------------------------------------------------------
    public var onCornerRadiiChange: ((CornerRadii) -> Void)?
    public var onLockRatioChange: ((Bool) -> Void)?
    public var onStrokeCapChange: ((String) -> Void)?
    public var onStrokeJoinChange: ((String) -> Void)?
    public var onStrokeMiterLimitChange: ((CGFloat) -> Void)?
    public var onStrokeDashChange: (([CGFloat]?) -> Void)?
    public var onStrokeAlignChange: ((String) -> Void)?
    public var onItalicChange: ((Bool) -> Void)?
    public var onUnderlineChange: ((Bool) -> Void)?
    public var onEffectsChange: ((LayerEffects) -> Void)?
    public var onPaintMutation: ((NativePaintMutation) -> Void)?
    public var onPaintInteraction: ((Bool) -> Void)?
    public var onAnchorChanged: ((TransformAnchor3x3) -> Void)?
    /// Auto-layout constraints (horizontal, vertical): left|center|right|scale /
    /// top|middle|bottom|scale.
    public var onConstraintsChange: ((String, String) -> Void)?

    public private(set) var node: VOONode?

    public override var isFlipped: Bool { true }

    // Header -----------------------------------------------------------------
    private let headerLabel = NSTextField(labelWithString: "")
    private let settingsButton = PropertiesIconButton(kind: .settings, style: .plain)
    private let transferButton = PropertiesIconButton(kind: .transfer, style: .plain)

    // COLOR & Fill Modes -----------------------------------------------------
    private let colorLabel = NSTextField(labelWithString: "")
    public let fillModeControl = PropertiesSegmentedControl(segments: [
        .init(title: "Solid", value: "solid"),
        .init(title: "Linear", value: "linear"),
        .init(title: "Radial", value: "radial")
    ])
    /// Visible paint-type control: a compact 24pt menu trigger on the COLOR fill
    /// row (web PaintTypeMenu). `fillModeControl` stays as the hidden state carrier
    /// so existing `select(value:notify:)` call paths keep working.
    public let paintTypeButton = PropertiesPaintTypeButton()
    private let wheel = PropertiesColorWheelView()
    private let fillSwatch = PropertiesFillSwatchView()
    private let swapButton = PropertiesIconButton(kind: .transfer, style: .plain)
    private let hexPill = PropertiesHexPill(hex: "#000000", showsColorDot: false)
    private let eyedropperButton = PropertiesIconButton(kind: .eyedropper, style: .circular)

    // Gradient Fill Controls
    public let gradientStopsBar = GradientStopsBarView()
    public let gradientAnglePill = PropertiesNumberPill(label: "∠")
    public let gradientStopHexPill = PropertiesHexPill(hex: "#FFFFFF", showsColorDot: true)
    public let gradientStopOpacityPill = PropertiesNumberPill(label: "Op")

    // SHAPE ------------------------------------------------------------------
    private let shapeLabel = NSTextField(labelWithString: "")
    private let radiusPill = PropertiesNumberPill(label: "")

    // TEXT (text layers only — occupies the SHAPE slot) -----------------------
    private let textContainer = PropertiesFlippedContainerView()
    private let textLabel = NSTextField(labelWithString: "")
    private let fontFamilyPill = PropertiesBlendModeButton()
    private let fontSizePill = PropertiesNumberPill(label: "")
    private let typographyButton = PropertiesTypographyMenuButton()
    // Accessibility markers describing the current submenu values.
    private let weightMarker = NSView()
    private let alignMarker = NSView()
    private let lineHeightMarker = NSView()
    private let letterSpacingMarker = NSView()

    // Visible Typography Controls (M2)
    public let fontWeightDropdown = PropertiesBlendModeButton()
    public let alignSegmentedControl = PropertiesSegmentedControl(segments: [
        .init(title: "", icon: .alignLeft, value: "left"),
        .init(title: "", icon: .alignCenter, value: "center"),
        .init(title: "", icon: .alignRight, value: "right"),
        .init(title: "", icon: .alignJustify, value: "justify")
    ])
    public let lineHeightPill = PropertiesNumberPill(label: "LH")
    public let letterSpacingPill = PropertiesNumberPill(label: "LS")
    public let italicButton = PropertiesIconButton(kind: .italic, style: .plain)
    public let underlineButton = PropertiesIconButton(kind: .underline, style: .plain)

    // TRANSFORM --------------------------------------------------------------
    private let transformLabel = NSTextField(labelWithString: "")
    public let anchorGrid = AnchorGridView()
    private let transformContainer = PropertiesFlippedContainerView()
    public let xPill = PropertiesNumberPill(label: "X")
    public let yPill = PropertiesNumberPill(label: "Y")
    public let wPill = PropertiesNumberPill(label: "W")
    public let lockRatioButton = PropertiesIconButton(kind: .unlink, style: .plain)
    public let hPill = PropertiesNumberPill(label: "H")
    public let rPill = PropertiesNumberPill(label: "R")
    public let crLinkButton = PropertiesIconButton(kind: .link, style: .plain)
    public let crPill = PropertiesNumberPill(label: "CR")
    public let tlPill = PropertiesNumberPill(label: "TL")
    public let trPill = PropertiesNumberPill(label: "TR")
    public let brPill = PropertiesNumberPill(label: "BR")
    public let blPill = PropertiesNumberPill(label: "BL")

    // APPEARANCE -------------------------------------------------------------
    private let appearanceLabel = NSTextField(labelWithString: "")
    public let fillHexPill = PropertiesHexPill(hex: "#000000", showsColorDot: true)
    public let strokeHexPill = PropertiesHexPill(hex: "#b2ffd6", showsColorDot: true)
    public let strokeWidthPill = PropertiesNumberPill(label: "W")
    public let strokeCapControl = PropertiesSegmentedControl(segments: [
        .init(title: "Butt", value: "butt"),
        .init(title: "Round", value: "round"),
        .init(title: "Square", value: "square")
    ])
    public let strokeJoinControl = PropertiesSegmentedControl(segments: [
        .init(title: "Miter", value: "miter"),
        .init(title: "Round", value: "round"),
        .init(title: "Bevel", value: "bevel")
    ])
    public let strokeMiterLimitPill = PropertiesNumberPill(label: "ML")
    public let strokeDashControl = PropertiesSegmentedControl(segments: [
        .init(title: "Solid", value: "solid"),
        .init(title: "Dash", value: "dashed"),
        .init(title: "Dot", value: "dotted"),
        .init(title: "Custom", value: "custom")
    ])
    public let dashLengthPill = PropertiesNumberPill(label: "DL")
    public let dashGapPill = PropertiesNumberPill(label: "DG")
    public let strokeAlignControl = PropertiesSegmentedControl(segments: [
        .init(title: "Center", value: "center"),
        .init(title: "Inside", value: "inside"),
        .init(title: "Outside", value: "outside")
    ])
    public let opacityPill = PropertiesNumberPill(label: "")
    public let blendButton = PropertiesBlendModeButton()

    // EFFECTS ----------------------------------------------------------------
    public let effectsContainer = PropertiesFlippedContainerView()
    private let effectsLabel = NSTextField(labelWithString: "")
    public let blurCheckbox = NSButton(checkboxWithTitle: "Gaussian Blur", target: nil, action: nil)
    public let blurPill = PropertiesNumberPill(label: "R")

    public let dropShadowCheckbox = NSButton(checkboxWithTitle: "Drop Shadow", target: nil, action: nil)
    public let dropShadowHexPill = PropertiesHexPill(hex: "#000000", showsColorDot: true)
    public let dropShadowOpacityPill = PropertiesNumberPill(label: "Op")
    public let dropShadowBlurPill = PropertiesNumberPill(label: "Bl")
    public let dropShadowXPill = PropertiesNumberPill(label: "X")
    public let dropShadowYPill = PropertiesNumberPill(label: "Y")

    public let innerShadowCheckbox = NSButton(checkboxWithTitle: "Inner Shadow", target: nil, action: nil)
    public let innerShadowHexPill = PropertiesHexPill(hex: "#000000", showsColorDot: true)
    public let innerShadowOpacityPill = PropertiesNumberPill(label: "Op")
    public let innerShadowBlurPill = PropertiesNumberPill(label: "Bl")
    public let innerShadowXPill = PropertiesNumberPill(label: "X")
    public let innerShadowYPill = PropertiesNumberPill(label: "Y")

    // MARK: Rebuilt web-inspector chrome (Design|Code header → EFFECTS)

    // Header
    private let codePanel = NativeCodePanel(frame: .zero)
    private var designVisibility: [ObjectIdentifier: Bool] = [:]
    public var onSwapPanels: (() -> Void)?
    public var onPresentationChange: (() -> Void)?
    public let headerTabs = PropertiesSegmentedControl(segments: [
        .init(title: "Design", value: "design"),
        .init(title: "Code", value: "code")
    ])
    private let identityName = NSTextField(labelWithString: "")
    private let identityKind = NSTextField(labelWithString: "")
    private let selectOnlyButton = PropertiesIconButton(kind: .selectOnly, style: .plain)

    // TRANSFORM extras
    public let sPill = PropertiesNumberPill(label: "S")
    private let rotateCcwButton = PropertiesIconButton(kind: .rotateCcw, style: .plain)
    private let rotateCwButton = PropertiesIconButton(kind: .rotateCw, style: .plain)

    // CONSTRAINTS
    private let constraintsLabel = NSTextField(labelWithString: "")
    private let constraintsDiagramButton = PropertiesIconButton(kind: .constraints, style: .plain)
    private let hConstraintLabel = NSTextField(labelWithString: "")
    private let vConstraintLabel = NSTextField(labelWithString: "")
    public let hConstraintDropdown = PropertiesBlendModeButton()
    public let vConstraintDropdown = PropertiesBlendModeButton()

    // FILL row
    private let fillLabel = NSTextField(labelWithString: "")
    private let fillAddButton = PropertiesIconButton(kind: .plus, style: .plain)
    private let fillRowSwatch = PropertiesColorSwatchButton()
    private let fillRowHex = NSTextField(labelWithString: "")
    public let fillOpacityPill = PropertiesNumberPill(label: "", suffix: "%")
    private let fillRowToggle = PropertiesIconButton(kind: .eye, style: .plain)
    private let fillRowRemove = PropertiesIconButton(kind: .minus, style: .plain)

    // STROKE rows
    private let strokeLabel = NSTextField(labelWithString: "")
    private let strokeAddButton = PropertiesIconButton(kind: .plus, style: .plain)
    private let strokeRowSwatch = PropertiesColorSwatchButton(hex: "#FFFFFF")
    private let strokeRowHex = NSTextField(labelWithString: "")
    public let strokeOpacityPill = PropertiesNumberPill(label: "", suffix: "%")
    private let strokeRowToggle = PropertiesIconButton(kind: .eye, style: .plain)
    private let strokeRowRemove = PropertiesIconButton(kind: .minus, style: .plain)
    private let strokeAlignButton = PropertiesIconButton(kind: .strokeAlign, style: .plain)
    private let strokeCapButton = PropertiesIconButton(kind: .strokeCap, style: .plain)
    private let strokeJoinButton = PropertiesIconButton(kind: .strokeJoin, style: .plain)
    private let strokeDashButton = PropertiesIconButton(kind: .strokeDash, style: .plain)

    // FRAME block (frame selections)
    private let frameBlock = PropertiesFlippedContainerView()
    private let frameSizeLabel = NSTextField(labelWithString: "")
    private let frameSizeValue = NSTextField(labelWithString: "")
    private let backgroundColorLabel = NSTextField(labelWithString: "")
    private var framePresetSwatches: [PropertiesColorSwatchButton] = []
    private let frameCustomSwatch = PropertiesColorSwatchButton()
    private let frameHexField = NSTextField(labelWithString: "")
    private let effectsAddButton = PropertiesIconButton(kind: .plus, style: .plain)

    // Rebuilt-layout bookkeeping (surfaces drawn in `draw(_:)`).
    private var fillRowRect: CGRect = .zero
    private var strokeRow1Rect: CGRect = .zero
    private var strokeRow2Rect: CGRect = .zero
    private var frameSizeRowRect: CGRect = .zero
    private var frameColorRowRect: CGRect = .zero
    private var anchorSurfaceRect: CGRect = .zero
    private var diagramSurfaceRect: CGRect = .zero
    private var identityGlyphRect: CGRect = .zero
    private var identityKindGlyph: PropertiesGlyphFactory.Kind = .shapeKind
    private var showsFrameBlock = false

    // State ------------------------------------------------------------------
    private var dividerYs: [CGFloat] = []
    private var showsShape = true
    private var showsText = false
    private var currentConstraintHorizontal = "left"
    private var currentConstraintVertical = "top"
    private var currentX: CGFloat = 0
    private var currentY: CGFloat = 0
    private var currentW: CGFloat = 0
    private var currentH: CGFloat = 0
    private var currentR: CGFloat = 0
    private var currentCornerRadius: CGFloat = 0
    public private(set) var isAspectLocked: Bool = false
    public private(set) var isCornerRadiiLinked: Bool = true
    public private(set) var currentCornerRadii: CornerRadii = CornerRadii(uniform: 0)

    private var currentFillHex: String = "#000000"
    private var currentSolidHex: String = "#000000"
    public private(set) var currentFillMode: String = "solid"
    public private(set) var currentGradientAngle: CGFloat = 180

    private var currentStrokeHex: String = "#b2ffd6"
    private var currentStrokeWidth: CGFloat = 1
    public private(set) var currentStrokeCap: String = "butt"
    public private(set) var currentStrokeJoin: String = "miter"
    public private(set) var currentStrokeMiterLimit: CGFloat = 4.0
    public private(set) var currentStrokeDash: [CGFloat]? = nil
    public private(set) var currentStrokeAlign: String = "center"

    private var currentOpacity: CGFloat = 1
    private var currentBlendMode: String = "source-over"
    private var currentFontFamily: String = "Inter"
    private var currentFontSize: CGFloat = 16
    private var currentFontWeight: String = "regular"
    private var currentTextAlign: String = "left"
    private var currentLineHeight: CGFloat = 1.2
    private var currentLetterSpacing: CGFloat = 0
    public private(set) var isItalic: Bool = false
    public private(set) var isUnderline: Bool = false
    public private(set) var currentEffects: LayerEffects = LayerEffects()
    private var colorSampler: NSColorSampler?

    public private(set) var contentHeight: CGFloat = PropertiesPanelView.preferredContentHeight

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    // MARK: Setup

    private func setupUI() {
        setAccessibilityIdentifier("Inspector.Properties")
        setAccessibilityElement(true)
        setAccessibilityRole(.group)
        setAccessibilityLabel("Properties inspector")

        // Header
        applyAttributedLabel(headerLabel, text: "PROPERTIES", size: 11, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 0.55)
        addSubview(headerLabel)

        settingsButton.iconKind = .transfer
        settingsButton.iconPadding = 5
        settingsButton.showsHoverBackground = true
        settingsButton.setAccessibilityIdentifier("Inspector.Properties.Settings")
        settingsButton.setAccessibilityLabel("Switch panels")
        settingsButton.target = self
        settingsButton.action = #selector(didClickSettings)
        addSubview(settingsButton)

        transferButton.iconPadding = 4
        transferButton.showsHoverBackground = true
        transferButton.setAccessibilityIdentifier("Inspector.Properties.Swap")
        transferButton.setAccessibilityLabel("Swap fill and stroke")
        transferButton.target = self
        transferButton.action = #selector(didClickSwap)
        addSubview(transferButton)

        // COLOR
        applyAttributedLabel(colorLabel, text: "COLOR", size: 10, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.4)
        addSubview(colorLabel)

        fillModeControl.setAccessibilityIdentifier("Inspector.Properties.FillMode")
        fillModeControl.setAccessibilityLabel("Fill mode")
        fillModeControl.onSelectionChanged = { [weak self] _, mode in
            self?.applyFillMode(mode)
        }
        // The inline Solid/Linear/Radial bar is gone: paint type now lives in the
        // fill row's small menu trigger (web PaintTypeMenu), which keeps COLOR at
        // the web height. The segmented control stays as a hidden state carrier.
        fillModeControl.isHidden = true
        addSubview(fillModeControl)

        paintTypeButton.setAccessibilityIdentifier("Inspector.Properties.PaintType")
        paintTypeButton.onPaintTypeChange = { [weak self] mode in
            guard let self = self else { return }
            self.fillModeControl.select(value: mode, notify: true)
        }
        addSubview(paintTypeButton)

        wheel.onColorChanged = { [weak self] hex in
            self?.currentSolidHex = hex
            self?.applyFill(hex: hex, notify: true)
        }
        addSubview(wheel)

        fillSwatch.onClick = { [weak self] in self?.presentColorPanel() }
        addSubview(fillSwatch)

        swapButton.iconPadding = 1.5        // 16pt slot -> 13pt glyph
        swapButton.iconColor = NSColor(hex: "737373")
        swapButton.setAccessibilityIdentifier("Inspector.Properties.SwapInline")
        swapButton.setAccessibilityLabel("Swap fill and stroke")
        swapButton.target = self
        swapButton.action = #selector(didClickSwap)
        addSubview(swapButton)

        hexPill.setAccessibilityIdentifier("Inspector.Properties.Hex")
        hexPill.setAccessibilityLabel("Fill hex color")
        hexPill.onHexChange = { [weak self] hex in
            self?.currentSolidHex = hex
            self?.applyFill(hex: hex, notify: true)
        }
        addSubview(hexPill)

        eyedropperButton.iconPadding = 8.5  // 30pt circle -> 13pt glyph
        eyedropperButton.setAccessibilityIdentifier("Inspector.Properties.Eyedropper")
        eyedropperButton.setAccessibilityLabel("Eyedropper")
        eyedropperButton.target = self
        eyedropperButton.action = #selector(didClickEyedropper)
        addSubview(eyedropperButton)

        gradientStopsBar.setAccessibilityIdentifier("Inspector.Properties.GradientStops")
        gradientStopsBar.onStopsChange = { [weak self] _ in
            self?.rebuildGradientFill(notify: true)
        }
        gradientStopsBar.onSelectionChange = { [weak self] _, stop in
            self?.didSelectGradientStop(stop)
        }
        addSubview(gradientStopsBar)

        gradientAnglePill.minimumValue = 0
        gradientAnglePill.maximumValue = 360
        gradientAnglePill.suffix = "°"
        gradientAnglePill.setAccessibilityIdentifier("Inspector.Properties.GradientAngle")
        gradientAnglePill.onValueChanged = { [weak self] angle in
            self?.applyGradientAngle(angle)
        }
        addSubview(gradientAnglePill)

        gradientStopHexPill.setAccessibilityIdentifier("Inspector.Properties.GradientStopHex")
        gradientStopHexPill.onHexChange = { [weak self] hex in
            self?.applyGradientStopHex(hex)
        }
        addSubview(gradientStopHexPill)

        gradientStopOpacityPill.minimumValue = 0
        gradientStopOpacityPill.maximumValue = 100
        gradientStopOpacityPill.suffix = "%"
        gradientStopOpacityPill.setAccessibilityIdentifier("Inspector.Properties.GradientStopOpacity")
        gradientStopOpacityPill.onValueChanged = { [weak self] op in
            self?.applyGradientStopOpacity(op)
        }
        addSubview(gradientStopOpacityPill)

        // SHAPE
        applyAttributedLabel(shapeLabel, text: "SHAPE", size: 10, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.4)
        addSubview(shapeLabel)

        radiusPill.leadingGlyph = .cornerRadius
        radiusPill.minimumValue = 0
        radiusPill.maximumValue = 1_000
        radiusPill.scrubUnitsPerPoint = 0.5
        radiusPill.setAccessibilityIdentifier("Inspector.Properties.Radius")
        radiusPill.setAccessibilityLabel("Corner radius")
        radiusPill.onValueChanged = { [weak self] value in
            self?.applyCornerRadius(value)
        }
        addSubview(radiusPill)

        // TEXT (text layers only)
        textContainer.setAccessibilityIdentifier("Inspector.Properties.Text")
        textContainer.setAccessibilityElement(true)
        textContainer.setAccessibilityRole(.group)
        textContainer.setAccessibilityLabel("Text typography")
        addSubview(textContainer)

        applyAttributedLabel(textLabel, text: "TEXT", size: 10, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.4)
        textContainer.addSubview(textLabel)

        fontFamilyPill.placeholderTitle = "Inter"
        fontFamilyPill.setItems(PropertiesPanelView.fontFamilyItems)
        fontFamilyPill.setAccessibilityIdentifier("Inspector.Properties.FontFamily")
        fontFamilyPill.setAccessibilityLabel("Font family")
        fontFamilyPill.onValueChange = { [weak self] family in
            self?.applyFontFamily(family)
        }
        textContainer.addSubview(fontFamilyPill)

        fontSizePill.minimumValue = 8
        fontSizePill.maximumValue = 200
        fontSizePill.scrubUnitsPerPoint = 1.0
        fontSizePill.valueAlignment = .center
        fontSizePill.setAccessibilityIdentifier("Inspector.Properties.FontSize")
        fontSizePill.setAccessibilityLabel("Font size")
        fontSizePill.onValueChanged = { [weak self] size in
            self?.applyFontSize(size)
        }
        textContainer.addSubview(fontSizePill)

        // Accessibility markers for typography submenus
        configureFormatMarker(weightMarker, identifier: "Inspector.Properties.Weight", label: "Font weight")
        configureFormatMarker(alignMarker, identifier: "Inspector.Properties.Align", label: "Text alignment")
        configureFormatMarker(lineHeightMarker, identifier: "Inspector.Properties.LineHeight", label: "Line height")
        configureFormatMarker(letterSpacingMarker, identifier: "Inspector.Properties.LetterSpacing", label: "Letter spacing")
        for marker in [weightMarker, alignMarker, lineHeightMarker, letterSpacingMarker] {
            textContainer.addSubview(marker)
        }

        typographyButton.setAccessibilityIdentifier("Inspector.Properties.Typography")
        typographyButton.setAccessibilityLabel("Typography")
        typographyButton.onWeightChange = { [weak self] weight in self?.applyFontWeight(weight) }
        typographyButton.onTextAlignChange = { [weak self] align in self?.applyTextAlign(align) }
        typographyButton.onLineHeightChange = { [weak self] lh in self?.applyLineHeight(lh) }
        typographyButton.onLetterSpacingChange = { [weak self] sp in self?.applyLetterSpacing(sp) }
        textContainer.addSubview(typographyButton)

        // Visible Typography Controls (M2)
        fontWeightDropdown.placeholderTitle = "Regular"
        fontWeightDropdown.setItems([
            ("Regular", "regular"),
            ("Medium", "medium"),
            ("Semibold", "semibold"),
            ("Bold", "bold"),
            ("Black", "black"),
            ("Light", "light"),
            ("Thin", "thin")
        ])
        fontWeightDropdown.setAccessibilityIdentifier("Inspector.Properties.VisibleWeight")
        fontWeightDropdown.setAccessibilityLabel("Font weight")
        fontWeightDropdown.onValueChange = { [weak self] weight in self?.applyFontWeight(weight) }
        textContainer.addSubview(fontWeightDropdown)

        alignSegmentedControl.setAccessibilityIdentifier("Inspector.Properties.VisibleAlign")
        alignSegmentedControl.setAccessibilityLabel("Text alignment")
        alignSegmentedControl.onSelectionChanged = { [weak self] _, align in self?.applyTextAlign(align) }
        textContainer.addSubview(alignSegmentedControl)

        lineHeightPill.minimumValue = 0.5
        lineHeightPill.maximumValue = 4.0
        lineHeightPill.roundsToInteger = false
        lineHeightPill.scrubUnitsPerPoint = 0.05
        lineHeightPill.setAccessibilityIdentifier("Inspector.Properties.VisibleLineHeight")
        lineHeightPill.setAccessibilityLabel("Line height")
        lineHeightPill.onValueChanged = { [weak self] lh in self?.applyLineHeight(lh) }
        textContainer.addSubview(lineHeightPill)

        letterSpacingPill.minimumValue = -20
        letterSpacingPill.maximumValue = 50
        letterSpacingPill.roundsToInteger = false
        letterSpacingPill.scrubUnitsPerPoint = 0.5
        letterSpacingPill.setAccessibilityIdentifier("Inspector.Properties.VisibleLetterSpacing")
        letterSpacingPill.setAccessibilityLabel("Letter spacing")
        letterSpacingPill.onValueChanged = { [weak self] ls in self?.applyLetterSpacing(ls) }
        textContainer.addSubview(letterSpacingPill)

        italicButton.iconPadding = 5.5      // 24pt slot -> 13pt glyph
        italicButton.setAccessibilityIdentifier("Inspector.Properties.Italic")
        italicButton.setAccessibilityLabel("Italic")
        italicButton.target = self
        italicButton.action = #selector(didClickItalic)
        textContainer.addSubview(italicButton)

        underlineButton.iconPadding = 5.5   // 24pt slot -> 13pt glyph
        underlineButton.setAccessibilityIdentifier("Inspector.Properties.Underline")
        underlineButton.setAccessibilityLabel("Underline")
        underlineButton.target = self
        underlineButton.action = #selector(didClickUnderline)
        textContainer.addSubview(underlineButton)

        // TRANSFORM
        applyAttributedLabel(transformLabel, text: "TRANSFORM", size: 10, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.4)
        addSubview(transformLabel)

        anchorGrid.setAccessibilityIdentifier("Inspector.Properties.AnchorGrid")
        anchorGrid.setAccessibilityLabel("Transform 3x3 Anchor Grid")
        anchorGrid.onAnchorChanged = { [weak self] a in self?.onAnchorChanged?(a) }
        addSubview(anchorGrid)

        transformContainer.setAccessibilityIdentifier("Inspector.Properties.Transform")
        transformContainer.setAccessibilityElement(true)
        transformContainer.setAccessibilityRole(.group)
        transformContainer.setAccessibilityLabel("Transform")
        addSubview(transformContainer)

        configureTransformPill(xPill, label: "X", units: 1.0)
        configureTransformPill(yPill, label: "Y", units: 1.0)
        configureTransformPill(wPill, label: "W", units: 1.0)
        configureTransformPill(hPill, label: "H", units: 1.0)
        configureTransformPill(rPill, label: "R", units: 1.0)
        configureTransformPill(crPill, label: "CR", units: 0.5)

        configureTransformPill(tlPill, label: "TL", units: 0.5)
        configureTransformPill(trPill, label: "TR", units: 0.5)
        configureTransformPill(brPill, label: "BR", units: 0.5)
        configureTransformPill(blPill, label: "BL", units: 0.5)

        tlPill.setAccessibilityIdentifier("Inspector.Properties.TL")
        trPill.setAccessibilityIdentifier("Inspector.Properties.TR")
        brPill.setAccessibilityIdentifier("Inspector.Properties.BR")
        blPill.setAccessibilityIdentifier("Inspector.Properties.BL")

        lockRatioButton.setAccessibilityIdentifier("Inspector.Properties.LockRatio")
        lockRatioButton.setAccessibilityLabel("Lock aspect ratio")
        lockRatioButton.iconPadding = 2
        lockRatioButton.target = self
        lockRatioButton.action = #selector(didClickLockRatio)
        transformContainer.addSubview(lockRatioButton)

        crLinkButton.setAccessibilityIdentifier("Inspector.Properties.CornerRadiiLink")
        crLinkButton.setAccessibilityLabel("Link corner radii")
        crLinkButton.iconPadding = 2
        crLinkButton.target = self
        crLinkButton.action = #selector(didClickCornerRadiiLink)
        transformContainer.addSubview(crLinkButton)

        xPill.onValueChanged = { [weak self] value in self?.applyGeometry(x: value) }
        yPill.onValueChanged = { [weak self] value in self?.applyGeometry(y: value) }

        wPill.onValueChanged = { [weak self] value in
            guard let self = self else { return }
            if self.isAspectLocked && self.currentW > 0 && self.currentH > 0 {
                let ratio = self.currentW / self.currentH
                let newH = max(1, round(value / ratio))
                self.hPill.setValue(newH)
                self.applyGeometry(width: value, height: newH)
            } else {
                self.applyGeometry(width: value)
            }
        }

        hPill.onValueChanged = { [weak self] value in
            guard let self = self else { return }
            if self.isAspectLocked && self.currentW > 0 && self.currentH > 0 {
                let ratio = self.currentW / self.currentH
                let newW = max(1, round(value * ratio))
                self.wPill.setValue(newW)
                self.applyGeometry(width: newW, height: value)
            } else {
                self.applyGeometry(height: value)
            }
        }

        rPill.onValueChanged = { [weak self] value in self?.applyGeometry(rotation: value) }
        crPill.onValueChanged = { [weak self] value in self?.applyCornerRadius(value) }

        tlPill.onValueChanged = { [weak self] v in self?.applyCornerRadius(tl: v) }
        trPill.onValueChanged = { [weak self] v in self?.applyCornerRadius(tr: v) }
        brPill.onValueChanged = { [weak self] v in self?.applyCornerRadius(br: v) }
        blPill.onValueChanged = { [weak self] v in self?.applyCornerRadius(bl: v) }

        for pill in [xPill, yPill, wPill, hPill, rPill, crPill, tlPill, trPill, brPill, blPill] {
            transformContainer.addSubview(pill)
        }

        // APPEARANCE
        applyAttributedLabel(appearanceLabel, text: "APPEARANCE", size: 10, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.4)
        addSubview(appearanceLabel)

        fillHexPill.setAccessibilityIdentifier("Inspector.Properties.FillHex")
        fillHexPill.setAccessibilityLabel("Fill color")
        fillHexPill.onHexChange = { [weak self] hex in
            self?.currentSolidHex = hex
            self?.applyFill(hex: hex, notify: true)
        }
        addSubview(fillHexPill)

        strokeHexPill.setAccessibilityIdentifier("Inspector.Properties.StrokeHex")
        strokeHexPill.setAccessibilityLabel("Stroke color")
        strokeHexPill.onHexChange = { [weak self] hex in self?.applyStroke(hex: hex, notify: true) }
        addSubview(strokeHexPill)

        strokeWidthPill.minimumValue = 0
        strokeWidthPill.maximumValue = 500
        strokeWidthPill.scrubUnitsPerPoint = 0.2
        strokeWidthPill.roundsToInteger = false
        strokeWidthPill.setAccessibilityIdentifier("Inspector.Properties.StrokeWidth")
        strokeWidthPill.setAccessibilityLabel("Stroke width")
        strokeWidthPill.onValueChanged = { [weak self] value in
            guard let self = self else { return }
            self.currentStrokeWidth = max(value, 0)
            if var node = self.node {
                node.style.strokeWidth = self.currentStrokeWidth
                self.node = node
            }
            self.onStrokeWidthChange?(self.currentStrokeWidth)
        }
        addSubview(strokeWidthPill)

        strokeCapControl.setAccessibilityIdentifier("Inspector.Properties.StrokeCap")
        strokeCapControl.setAccessibilityLabel("Stroke cap")
        strokeCapControl.onSelectionChanged = { [weak self] _, cap in self?.applyStrokeCap(cap) }
        addSubview(strokeCapControl)

        strokeJoinControl.setAccessibilityIdentifier("Inspector.Properties.StrokeJoin")
        strokeJoinControl.setAccessibilityLabel("Stroke join")
        strokeJoinControl.onSelectionChanged = { [weak self] _, join in self?.applyStrokeJoin(join) }
        addSubview(strokeJoinControl)

        strokeMiterLimitPill.minimumValue = 1
        strokeMiterLimitPill.maximumValue = 50
        strokeMiterLimitPill.setValue(4)
        strokeMiterLimitPill.setAccessibilityIdentifier("Inspector.Properties.StrokeMiterLimit")
        strokeMiterLimitPill.setAccessibilityLabel("Stroke miter limit")
        strokeMiterLimitPill.onValueChanged = { [weak self] ml in self?.applyStrokeMiterLimit(ml) }
        addSubview(strokeMiterLimitPill)

        strokeDashControl.setAccessibilityIdentifier("Inspector.Properties.StrokeDash")
        strokeDashControl.setAccessibilityLabel("Stroke dash")
        strokeDashControl.onSelectionChanged = { [weak self] _, dash in self?.applyStrokeDashMode(dash) }
        addSubview(strokeDashControl)

        dashLengthPill.minimumValue = 0
        dashLengthPill.maximumValue = 500
        dashLengthPill.setValue(4)
        dashLengthPill.setAccessibilityIdentifier("Inspector.Properties.DashLength")
        dashLengthPill.onValueChanged = { [weak self] _ in self?.applyCustomDash() }
        addSubview(dashLengthPill)

        dashGapPill.minimumValue = 0
        dashGapPill.maximumValue = 500
        dashGapPill.setValue(2)
        dashGapPill.setAccessibilityIdentifier("Inspector.Properties.DashGap")
        dashGapPill.onValueChanged = { [weak self] _ in self?.applyCustomDash() }
        addSubview(dashGapPill)

        strokeAlignControl.setAccessibilityIdentifier("Inspector.Properties.StrokeAlign")
        strokeAlignControl.setAccessibilityLabel("Stroke align")
        strokeAlignControl.onSelectionChanged = { [weak self] _, align in self?.applyStrokeAlign(align) }
        addSubview(strokeAlignControl)

        opacityPill.minimumValue = 0
        opacityPill.maximumValue = 100
        opacityPill.scrubUnitsPerPoint = 0.5
        opacityPill.valueAlignment = .center
        opacityPill.suffix = "%"
        opacityPill.setAccessibilityIdentifier("Inspector.Properties.Opacity")
        opacityPill.setAccessibilityLabel("Opacity")
        opacityPill.onValueChanged = { [weak self] value in
            guard let self = self else { return }
            self.currentOpacity = min(max(value / 100.0, 0), 1)
            if var node = self.node {
                node.style.opacity = self.currentOpacity
                self.node = node
            }
            self.onOpacityChange?(self.currentOpacity)
        }
        addSubview(opacityPill)

        blendButton.setAccessibilityIdentifier("Inspector.Properties.BlendMode")
        blendButton.setItems(PropertiesPanelView.blendModeItems)
        blendButton.onValueChange = { [weak self] raw in
            guard let self = self else { return }
            self.currentBlendMode = raw
            if var node = self.node {
                node.style.blendMode = raw
                self.node = node
            }
            self.onBlendModeChange?(raw)
        }
        addSubview(blendButton)

        // EFFECTS (M2)
        effectsContainer.setAccessibilityIdentifier("Inspector.Properties.Effects")
        effectsContainer.setAccessibilityElement(true)
        effectsContainer.setAccessibilityRole(.group)
        effectsContainer.setAccessibilityLabel("Effects")
        addSubview(effectsContainer)

        applyAttributedLabel(effectsLabel, text: "EFFECTS", size: 10, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.4)
        effectsContainer.addSubview(effectsLabel)
        effectsAddButton.setAccessibilityIdentifier("Inspector.Properties.EffectsAdd")
        effectsAddButton.setAccessibilityLabel(NativeCopy.text(.addEffect))
        effectsAddButton.target = self
        effectsAddButton.action = #selector(didClickAddEffect)
        effectsContainer.addSubview(effectsAddButton)

        blurCheckbox.setAccessibilityIdentifier("Inspector.Properties.BlurCheckbox")
        blurCheckbox.target = self
        blurCheckbox.action = #selector(didToggleBlur)
        effectsContainer.addSubview(blurCheckbox)

        blurPill.minimumValue = 0
        blurPill.maximumValue = 100
        blurPill.setAccessibilityIdentifier("Inspector.Properties.BlurRadius")
        blurPill.onValueChanged = { [weak self] r in self?.applyBlurRadius(r) }
        effectsContainer.addSubview(blurPill)

        dropShadowCheckbox.setAccessibilityIdentifier("Inspector.Properties.DropShadowCheckbox")
        dropShadowCheckbox.target = self
        dropShadowCheckbox.action = #selector(didToggleDropShadow)
        effectsContainer.addSubview(dropShadowCheckbox)

        dropShadowHexPill.setAccessibilityIdentifier("Inspector.Properties.DropShadowHex")
        dropShadowHexPill.onHexChange = { [weak self] hex in self?.applyDropShadow(hex: hex) }
        effectsContainer.addSubview(dropShadowHexPill)

        dropShadowOpacityPill.minimumValue = 0
        dropShadowOpacityPill.maximumValue = 100
        dropShadowOpacityPill.suffix = "%"
        dropShadowOpacityPill.onValueChanged = { [weak self] op in self?.applyDropShadow(opacity: op / 100.0) }
        effectsContainer.addSubview(dropShadowOpacityPill)

        dropShadowBlurPill.minimumValue = 0
        dropShadowBlurPill.maximumValue = 100
        dropShadowBlurPill.onValueChanged = { [weak self] bl in self?.applyDropShadow(blur: bl) }
        effectsContainer.addSubview(dropShadowBlurPill)

        dropShadowXPill.minimumValue = -100
        dropShadowXPill.maximumValue = 100
        dropShadowXPill.onValueChanged = { [weak self] x in self?.applyDropShadow(x: x) }
        effectsContainer.addSubview(dropShadowXPill)

        dropShadowYPill.minimumValue = -100
        dropShadowYPill.maximumValue = 100
        dropShadowYPill.onValueChanged = { [weak self] y in self?.applyDropShadow(y: y) }
        effectsContainer.addSubview(dropShadowYPill)

        innerShadowCheckbox.setAccessibilityIdentifier("Inspector.Properties.InnerShadowCheckbox")
        innerShadowCheckbox.target = self
        innerShadowCheckbox.action = #selector(didToggleInnerShadow)
        effectsContainer.addSubview(innerShadowCheckbox)

        innerShadowHexPill.setAccessibilityIdentifier("Inspector.Properties.InnerShadowHex")
        innerShadowHexPill.onHexChange = { [weak self] hex in self?.applyInnerShadow(hex: hex) }
        effectsContainer.addSubview(innerShadowHexPill)

        innerShadowOpacityPill.minimumValue = 0
        innerShadowOpacityPill.maximumValue = 100
        innerShadowOpacityPill.suffix = "%"
        innerShadowOpacityPill.onValueChanged = { [weak self] op in self?.applyInnerShadow(opacity: op / 100.0) }
        effectsContainer.addSubview(innerShadowOpacityPill)

        innerShadowBlurPill.minimumValue = 0
        innerShadowBlurPill.maximumValue = 100
        innerShadowBlurPill.onValueChanged = { [weak self] bl in self?.applyInnerShadow(blur: bl) }
        effectsContainer.addSubview(innerShadowBlurPill)

        innerShadowXPill.minimumValue = -100
        innerShadowXPill.maximumValue = 100
        innerShadowXPill.onValueChanged = { [weak self] x in self?.applyInnerShadow(x: x) }
        effectsContainer.addSubview(innerShadowXPill)

        innerShadowYPill.minimumValue = -100
        innerShadowYPill.maximumValue = 100
        innerShadowYPill.onValueChanged = { [weak self] y in self?.applyInnerShadow(y: y) }
        effectsContainer.addSubview(innerShadowYPill)

        // ------------------------------------------------------------------
        // Rebuilt web-inspector chrome: Design|Code header, identity row,
        // TRANSFORM / CONSTRAINTS / APPEARANCE / TEXT / FILL / STROKE / EFFECTS.
        // The old COLOR-wheel controls stay in the tree (public API + tests) but
        // are no longer laid out; the FILL/STROKE rows are the visible editors.
        // ------------------------------------------------------------------

        headerTabs.setAccessibilityIdentifier("Inspector.Properties.HeaderTabs")
        headerTabs.setAccessibilityLabel("Design or code")
        codePanel.isHidden = true
        addSubview(codePanel)
        headerTabs.onSelectionChanged = { [weak self] _, value in self?.setCodeMode(value == "code")
        }
        headerTabs.select(index: 0)
        addSubview(headerTabs)

        applyAttributedLabel(identityName, text: "FILL", size: 11, weight: .semibold,
                             color: NSColor.white, kern: 0.2)
        identityName.lineBreakMode = .byTruncatingTail
        addSubview(identityName)
        applyAttributedLabel(identityKind, text: "RECTANGLE", size: 9, weight: .medium,
                             color: NSColor(hex: "737373"), kern: 1.1)
        addSubview(identityKind)

        selectOnlyButton.iconPadding = 3.5
        selectOnlyButton.iconColor = NSColor(hex: "a3a3a3")
        selectOnlyButton.setAccessibilityIdentifier("Inspector.Properties.SelectOnly")
        selectOnlyButton.setAccessibilityLabel("Select only")
        selectOnlyButton.target = self
        selectOnlyButton.action = #selector(didClickSelectOnly)
        addSubview(selectOnlyButton)

        // TRANSFORM extras -------------------------------------------------
        sPill.labelText = "S"
        sPill.minimumValue = -10_000
        sPill.maximumValue = 10_000
        sPill.roundsToInteger = false
        sPill.setAccessibilityIdentifier("Inspector.Properties.Scale")
        sPill.setAccessibilityLabel("Transform S")
        transformContainer.addSubview(sPill)

        rotateCcwButton.iconPadding = 7
        rotateCcwButton.iconColor = NSColor(hex: "a3a3a3")
        rotateCcwButton.setAccessibilityIdentifier("Inspector.Properties.RotateCCW")
        rotateCcwButton.setAccessibilityLabel("Rotate 90 degrees counter-clockwise")
        rotateCcwButton.target = self
        rotateCcwButton.action = #selector(didClickRotateCCW)
        transformContainer.addSubview(rotateCcwButton)

        rotateCwButton.iconPadding = 7
        rotateCwButton.iconColor = NSColor(hex: "a3a3a3")
        rotateCwButton.setAccessibilityIdentifier("Inspector.Properties.RotateCW")
        rotateCwButton.setAccessibilityLabel("Rotate 90 degrees clockwise")
        rotateCwButton.target = self
        rotateCwButton.action = #selector(didClickRotateCW)
        transformContainer.addSubview(rotateCwButton)

        // CONSTRAINTS -------------------------------------------------------
        applyAttributedLabel(constraintsLabel, text: "CONSTRAINTS", size: 9, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.26)
        addSubview(constraintsLabel)

        constraintsDiagramButton.iconPadding = 8
        constraintsDiagramButton.iconColor = NSColor(hex: "a3a3a3")
        constraintsDiagramButton.showsHoverBackground = true
        constraintsDiagramButton.setAccessibilityIdentifier("Inspector.Properties.ConstraintsDiagram")
        constraintsDiagramButton.setAccessibilityLabel("Constraints")
        addSubview(constraintsDiagramButton)

        applyAttributedLabel(hConstraintLabel, text: "HORIZONTAL", size: 9, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 0.9)
        hConstraintLabel.alignment = .right
        addSubview(hConstraintLabel)
        applyAttributedLabel(vConstraintLabel, text: "VERTICAL", size: 9, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 0.9)
        vConstraintLabel.alignment = .right
        addSubview(vConstraintLabel)

        hConstraintDropdown.setItems([("Left", "left"), ("Center", "center"),
                                      ("Right", "right"), ("Scale", "scale")])
        hConstraintDropdown.placeholderTitle = "Left"
        hConstraintDropdown.select(value: "left")
        hConstraintDropdown.setAccessibilityIdentifier("Inspector.Properties.HorizontalConstraint")
        hConstraintDropdown.setAccessibilityLabel("Horizontal constraint")
        hConstraintDropdown.onValueChange = { [weak self] value in
            guard let self = self else { return }
            self.currentConstraintHorizontal = value
            self.hConstraintDropdown.select(value: value)
            self.onConstraintsChange?(self.currentConstraintHorizontal, self.currentConstraintVertical)
        }
        addSubview(hConstraintDropdown)

        vConstraintDropdown.setItems([("Top", "top"), ("Middle", "middle"),
                                      ("Bottom", "bottom"), ("Scale", "scale")])
        vConstraintDropdown.placeholderTitle = "Top"
        vConstraintDropdown.select(value: "top")
        vConstraintDropdown.setAccessibilityIdentifier("Inspector.Properties.VerticalConstraint")
        vConstraintDropdown.setAccessibilityLabel("Vertical constraint")
        vConstraintDropdown.onValueChange = { [weak self] value in
            guard let self = self else { return }
            self.currentConstraintVertical = value
            self.vConstraintDropdown.select(value: value)
            self.onConstraintsChange?(self.currentConstraintHorizontal, self.currentConstraintVertical)
        }
        addSubview(vConstraintDropdown)

        // FILL --------------------------------------------------------------
        applyAttributedLabel(fillLabel, text: "FILL", size: 9, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.26)
        addSubview(fillLabel)

        fillAddButton.iconPadding = 4
        fillAddButton.iconColor = NSColor(hex: "a3a3a3")
        fillAddButton.setAccessibilityIdentifier("Inspector.Properties.FillAdd")
        fillAddButton.setAccessibilityLabel(NativeCopy.text(.addFill))
        addSubview(fillAddButton)

        fillRowSwatch.onPick = { [weak self] in self?.presentColorPanel() }
        addSubview(fillRowSwatch)

        applyMonoLabel(fillRowHex, size: 11, color: NSColor(hex: "e5e5e5"))
        addSubview(fillRowHex)
        configurePaintOpacity(fillOpacityPill, channel: .fill)

        fillRowToggle.iconPadding = 3
        fillRowToggle.iconColor = NSColor(hex: "a3a3a3")
        fillRowToggle.setAccessibilityIdentifier("Inspector.Properties.FillEye")
        fillRowToggle.setAccessibilityLabel("Toggle fill visibility")
        addSubview(fillRowToggle)

        fillRowRemove.iconPadding = 4
        fillRowRemove.iconColor = NSColor(hex: "a3a3a3")
        fillRowRemove.setAccessibilityIdentifier("Inspector.Properties.FillRemove")
        fillRowRemove.setAccessibilityLabel("Remove fill")
        fillRowRemove.target = self
        fillRowRemove.action = #selector(didRemoveFill)
        addSubview(fillRowRemove)

        fillRowToggle.target = self
        fillRowToggle.action = #selector(didToggleFillVisible)
        fillAddButton.target = self
        fillAddButton.action = #selector(didAddFill)
        // STROKE ------------------------------------------------------------
        applyAttributedLabel(strokeLabel, text: "STROKE", size: 9, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.26)
        addSubview(strokeLabel)

        strokeAddButton.iconPadding = 4
        strokeAddButton.iconColor = NSColor(hex: "a3a3a3")
        strokeAddButton.setAccessibilityIdentifier("Inspector.Properties.StrokeAdd")
        strokeAddButton.setAccessibilityLabel(NativeCopy.text(.addStroke))
        addSubview(strokeAddButton)

        strokeRowSwatch.onPick = { [weak self] in self?.presentStrokeColorPanel() }
        addSubview(strokeRowSwatch)

        applyMonoLabel(strokeRowHex, size: 11, color: NSColor(hex: "e5e5e5"))
        addSubview(strokeRowHex)
        configurePaintOpacity(strokeOpacityPill, channel: .stroke)

        strokeRowToggle.iconPadding = 3
        strokeRowToggle.iconColor = NSColor(hex: "a3a3a3")
        addSubview(strokeRowToggle)

        strokeRowRemove.iconPadding = 4
        strokeRowRemove.iconColor = NSColor(hex: "a3a3a3")
        strokeRowRemove.setAccessibilityIdentifier("Inspector.Properties.StrokeRemove")
        strokeRowRemove.setAccessibilityLabel("Remove stroke")
        strokeRowRemove.target = self
        strokeRowRemove.action = #selector(didRemoveStroke)
        addSubview(strokeRowRemove)

        strokeRowToggle.target = self
        strokeRowToggle.action = #selector(didToggleStrokeVisible)
        strokeRowToggle.setAccessibilityIdentifier("Inspector.Properties.StrokeVisible")
        strokeRowToggle.setAccessibilityLabel("Stroke visible")
        strokeAddButton.target = self
        strokeAddButton.action = #selector(didAddStroke)

        strokeAlignButton.iconPadding = 4
        strokeAlignButton.iconColor = NSColor(hex: "a3a3a3")
        strokeAlignButton.setAccessibilityIdentifier("Inspector.Properties.StrokeAlign")
        strokeAlignButton.target = self
        strokeAlignButton.action = #selector(didClickStrokeAlign)
        addSubview(strokeAlignButton)

        strokeCapButton.iconPadding = 4
        strokeCapButton.iconColor = NSColor(hex: "a3a3a3")
        strokeCapButton.setAccessibilityIdentifier("Inspector.Properties.StrokeCap")
        strokeCapButton.target = self
        strokeCapButton.action = #selector(didClickStrokeCap)
        addSubview(strokeCapButton)

        strokeJoinButton.iconPadding = 4
        strokeJoinButton.iconColor = NSColor(hex: "a3a3a3")
        strokeJoinButton.setAccessibilityIdentifier("Inspector.Properties.StrokeJoin")
        strokeJoinButton.target = self
        strokeJoinButton.action = #selector(didClickStrokeJoin)
        addSubview(strokeJoinButton)

        strokeDashButton.iconPadding = 4
        strokeDashButton.iconColor = NSColor(hex: "a3a3a3")
        strokeDashButton.setAccessibilityIdentifier("Inspector.Properties.StrokeDash")
        strokeDashButton.target = self
        strokeDashButton.action = #selector(didClickStrokeDash)
        addSubview(strokeDashButton)

        // FRAME block (frame selections) -------------------------------------
        frameBlock.isHidden = true
        addSubview(frameBlock)
        applyAttributedLabel(frameSizeLabel, text: "FRAME SIZE", size: 9, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.26)
        frameBlock.addSubview(frameSizeLabel)
        applyMonoLabel(frameSizeValue, size: 11, color: NSColor.white)
        frameBlock.addSubview(frameSizeValue)
        applyAttributedLabel(backgroundColorLabel, text: "BACKGROUND COLOR", size: 9, weight: .medium,
                             color: NSColor(hex: "a3a3a3"), kern: 1.26)
        frameBlock.addSubview(backgroundColorLabel)
        let backgroundPresets = ["#FFFFFF", "#F5F5F5", "#D4D4D4", "#A3A3A3", "#525252", "#171717"]
        for hex in backgroundPresets {
            let swatch = PropertiesColorSwatchButton(hex: hex)
            swatch.setAccessibilityLabel("Background " + hex)
            swatch.onPick = { [weak self] in
                self?.applyFill(hex: hex, notify: true)
            }
            framePresetSwatches.append(swatch)
            frameBlock.addSubview(swatch)
        }
        frameCustomSwatch.onPick = { [weak self] in self?.presentColorPanel() }
        frameBlock.addSubview(frameCustomSwatch)
        applyMonoLabel(frameHexField, size: 11, color: NSColor(hex: "e5e5e5"))
        frameBlock.addSubview(frameHexField)

        // Hide the previous COLOR-wheel controls (kept for API/tests).
        headerLabel.isHidden = true
        colorLabel.isHidden = true
        wheel.isHidden = true
        fillSwatch.isHidden = true
        swapButton.isHidden = true
        hexPill.isHidden = true
        eyedropperButton.isHidden = true
        shapeLabel.isHidden = true
        fillModeControl.isHidden = true
        fillHexPill.isHidden = true
        strokeHexPill.isHidden = true
        strokeCapControl.isHidden = true
        strokeJoinControl.isHidden = true
        strokeAlignControl.isHidden = true
        strokeDashControl.isHidden = true
        dashLengthPill.isHidden = true
        dashGapPill.isHidden = true
        strokeMiterLimitPill.isHidden = true

        applyEmptyState()
    }

    private func configureTransformPill(_ pill: PropertiesNumberPill, label: String, units: CGFloat) {
        pill.labelText = label
        pill.minimumValue = -100_000
        pill.maximumValue = 100_000
        pill.scrubUnitsPerPoint = units
        pill.setAccessibilityLabel("Transform \(label)")
    }

    private func configureFormatMarker(_ view: NSView, identifier: String, label: String) {
        view.setAccessibilityIdentifier(identifier)
        view.setAccessibilityElement(true)
        view.setAccessibilityRole(.group)
        view.setAccessibilityLabel(label)
    }

    private func updateFormatMarkers() {
        weightMarker.setAccessibilityValue(currentFontWeight)
        alignMarker.setAccessibilityValue(currentTextAlign)
        lineHeightMarker.setAccessibilityValue(PropertiesColorMath.formatNumber(currentLineHeight, integer: false))
        letterSpacingMarker.setAccessibilityValue(PropertiesColorMath.formatNumber(currentLetterSpacing, integer: false))
        typographyButton.setAccessibilityValue("\(currentFontWeight), \(currentTextAlign), \(currentLineHeight), \(currentLetterSpacing)")
    }

    /// Styles a plain mono label (value text inside the rebuilt FILL/STROKE rows).
    private func applyMonoLabel(_ label: NSTextField, size: CGFloat, color: NSColor) {
        label.font = ThemeFonts.mono(size: size, weight: .regular)
        label.textColor = color
        label.isBordered = false
        label.drawsBackground = false
        label.isEditable = false
        label.isSelectable = false
        label.lineBreakMode = .byTruncatingTail
        label.cell?.usesSingleLineMode = true
    }

    private func applyAttributedLabel(_ label: NSTextField, text: String, size: CGFloat,
                                      weight: NSFont.Weight, color: NSColor, kern: CGFloat) {
        // The web card is `font-mono`, so every uppercase group title is mono too.
        label.attributedStringValue = NSAttributedString(string: text, attributes: [
            .font: ThemeFonts.mono(size: size, weight: weight),
            .foregroundColor: color,
            .kern: kern
        ])
        label.isBordered = false
        label.drawsBackground = false
        label.isEditable = false
        label.isSelectable = false
        label.lineBreakMode = .byClipping
        label.cell?.usesSingleLineMode = true
    }

    private static let blendModeItems: [(title: String, value: String)] = BlendMode.allCases.map {
        (PropertiesColorMath.englishBlendModeName($0.rawValue), $0.rawValue)
    }

    private static let fontFamilies = ["Inter", "Helvetica Neue", "SF Pro Text", "Arial", "Georgia", "Menlo"]
    private static let fontFamilyItems: [(title: String, value: String)] = fontFamilies.map { ($0, $0) }

    // MARK: Configure

    public func configure(with node: VOONode?) {
        self.node = node
        guard let node = node else {
            applyEmptyState()
            return
        }

        alphaValue = 1.0

        currentX = node.x
        currentY = node.y
        currentW = node.width
        currentH = node.height
        currentR = node.rotation

        isAspectLocked = node.lockRatio ?? false
        lockRatioButton.iconKind = isAspectLocked ? .link : .unlink

        currentCornerRadii = node.cornerRadii ?? CornerRadii(uniform: 0)
        isCornerRadiiLinked = currentCornerRadii.isUniform
        currentCornerRadius = currentCornerRadii.uniformRadius
        crLinkButton.iconKind = isCornerRadiiLinked ? .link : .unlink

        xPill.setValue(currentX)
        yPill.setValue(currentY)
        wPill.setValue(currentW)
        hPill.setValue(currentH)
        rPill.setValue(currentR)
        crPill.setValue(currentCornerRadius)
        tlPill.setValue(currentCornerRadii.tl)
        trPill.setValue(currentCornerRadii.tr)
        brPill.setValue(currentCornerRadii.br)
        blPill.setValue(currentCornerRadii.bl)

        radiusPill.maximumValue = max(0, min(node.width, node.height) / 2)
        radiusPill.setValue(min(currentCornerRadius, radiusPill.maximumValue))

        // Fill / Gradient
        currentFillHex = node.fill
        if node.fill.hasPrefix("linear-gradient") {
            currentFillMode = "linear"
            fillModeControl.select(value: "linear")
            if let parsed = CanvasStageView.parseGradient(from: node.fill) {
                if case .linear(let angle) = parsed.type {
                    currentGradientAngle = angle
                    gradientAnglePill.setValue(angle)
                }
                gradientStopsBar.stops = parsed.stops.map { GradientStopsBarView.Stop(color: $0.color, location: $0.location) }
            }
        } else if node.fill.hasPrefix("radial-gradient") {
            currentFillMode = "radial"
            fillModeControl.select(value: "radial")
            if let parsed = CanvasStageView.parseGradient(from: node.fill) {
                gradientStopsBar.stops = parsed.stops.map { GradientStopsBarView.Stop(color: $0.color, location: $0.location) }
            }
        } else {
            currentFillMode = "solid"
            fillModeControl.select(value: "solid")
            currentSolidHex = PropertiesColorMath.normalizeHex(node.fill) ?? "#000000"
            wheel.setHex(currentSolidHex)
            fillSwatch.fillHex = currentSolidHex
            hexPill.setHex(currentSolidHex)
            fillHexPill.setHex(currentSolidHex)
        }

        syncPaintTypeUI()

        let isGradient = (currentFillMode != "solid")
        // The legacy COLOR-wheel controls are retired by the web inspector layout and
        // must stay hidden in every mode (a gradient used to bring the wheel back).
        wheel.isHidden = true
        fillSwatch.isHidden = true
        swapButton.isHidden = true
        hexPill.isHidden = true
        eyedropperButton.isHidden = true
        gradientStopsBar.isHidden = !isGradient
        gradientStopHexPill.isHidden = !isGradient
        gradientStopOpacityPill.isHidden = !isGradient
        gradientAnglePill.isHidden = (currentFillMode != "linear")

        currentStrokeHex = PropertiesColorMath.normalizeHex(node.stroke) ?? "#b2ffd6"
        currentStrokeWidth = max(node.strokeWidth, 0)
        strokeHexPill.setHex(currentStrokeHex)
        strokeWidthPill.setValue(currentStrokeWidth)
        fillSwatch.strokeHex = currentStrokeHex

        currentStrokeCap = node.style.strokeCap ?? "butt"
        strokeCapControl.select(value: currentStrokeCap)
        currentStrokeJoin = node.style.strokeJoin ?? "miter"
        strokeJoinControl.select(value: currentStrokeJoin)
        currentStrokeMiterLimit = node.style.strokeMiterLimit ?? 4.0
        strokeMiterLimitPill.setValue(currentStrokeMiterLimit)
        currentStrokeAlign = node.style.strokeAlign ?? "center"
        strokeAlignControl.select(value: currentStrokeAlign)
        currentStrokeDash = node.style.strokeDash
        if let dash = currentStrokeDash, !dash.isEmpty {
            if dash.count >= 2 && dash[0] == 0 {
                strokeDashControl.select(value: "dotted")
            } else if dash.count >= 2 && dash[0] == 4 * currentStrokeWidth {
                strokeDashControl.select(value: "dashed")
            } else {
                strokeDashControl.select(value: "custom")
                dashLengthPill.setValue(dash[0])
                dashGapPill.setValue(dash.count > 1 ? dash[1] : dash[0])
            }
        } else {
            strokeDashControl.select(value: "solid")
        }

        currentOpacity = min(max(node.opacity, 0), 1)
        opacityPill.setValue(round(currentOpacity * 100))

        currentBlendMode = node.blendMode
        blendButton.select(value: currentBlendMode)

        // Typography
        currentFontFamily = node.fontFamily ?? "Inter"
        currentFontSize = min(max(node.fontSize ?? 16, 8), 200)
        currentFontWeight = node.fontWeight ?? "regular"
        currentTextAlign = node.textAlign ?? "left"
        currentLineHeight = node.lineHeight ?? 1.2
        currentLetterSpacing = node.letterSpacing ?? 0
        isItalic = node.italic ?? false
        isUnderline = node.underline ?? false

        fontFamilyPill.select(value: currentFontFamily)
        fontSizePill.setValue(currentFontSize)
        typographyButton.currentWeight = currentFontWeight
        typographyButton.currentTextAlign = currentTextAlign
        typographyButton.currentLineHeight = currentLineHeight
        typographyButton.currentLetterSpacing = currentLetterSpacing

        fontWeightDropdown.select(value: currentFontWeight)
        alignSegmentedControl.select(value: currentTextAlign)
        lineHeightPill.setValue(currentLineHeight)
        letterSpacingPill.setValue(currentLetterSpacing)
        italicButton.iconColor = isItalic ? NSColor(hex: "a7ffd4") : NSColor(hex: "737373")
        underlineButton.iconColor = isUnderline ? NSColor(hex: "a7ffd4") : NSColor(hex: "737373")
        updateFormatMarkers()

        // Effects
        currentEffects = node.effects ?? LayerEffects()
        let blur = currentEffects.gaussianBlur
        blurCheckbox.state = (blur?.enabled == true) ? .on : .off
        blurPill.setValue(CGFloat(blur?.radius ?? 0))

        let shadow = currentEffects.shadow
        dropShadowCheckbox.state = (shadow?.enabled == true) ? .on : .off
        dropShadowHexPill.setHex(PropertiesColorMath.normalizeHex(shadow?.color ?? "#000000") ?? "#000000")
        dropShadowOpacityPill.setValue(round(CGFloat(shadow?.opacity ?? 1.0) * 100))
        dropShadowBlurPill.setValue(CGFloat(shadow?.blur ?? 0))
        dropShadowXPill.setValue(CGFloat(shadow?.offsetX ?? 0))
        dropShadowYPill.setValue(CGFloat(shadow?.offsetY ?? 0))

        let innerShadow = currentEffects.innerShadow
        innerShadowCheckbox.state = (innerShadow?.enabled == true) ? .on : .off
        innerShadowHexPill.setHex(PropertiesColorMath.normalizeHex(innerShadow?.color ?? "#000000") ?? "#000000")
        innerShadowOpacityPill.setValue(round(CGFloat(innerShadow?.opacity ?? 1.0) * 100))
        innerShadowBlurPill.setValue(CGFloat(innerShadow?.blur ?? 0))
        innerShadowXPill.setValue(CGFloat(innerShadow?.offsetX ?? 0))
        innerShadowYPill.setValue(CGFloat(innerShadow?.offsetY ?? 0))

        showsShape = isShapeLike(node.kind)
        showsText = node.kind == .text
        showsFrameBlock = (node.kind == .frame)
        let constraints = node.constraints ?? NodeConstraints()
        currentConstraintHorizontal = constraints.horizontal
        currentConstraintVertical = constraints.vertical
        hConstraintDropdown.select(value: constraints.horizontal)
        vConstraintDropdown.select(value: constraints.vertical)
        updateIdentityRow(for: node)
        updatePaintRows()
        radiusPill.suffix = "px"
        radiusPill.valueAlignment = .right
        applySectionVisibility()
        if headerTabs.selectedIndex == 1 { setCodeMode(true) }
        needsLayout = true
        layoutSubtreeIfNeeded()
        needsDisplay = true
    }

    private func applyEmptyState() {
        alphaValue = 0.5
        showsShape = false
        showsText = false
        showsFrameBlock = false
        identityName.stringValue = "LAYER"
        identityKind.stringValue = "—"
        frameSizeValue.stringValue = ""
        frameHexField.stringValue = ""
        currentConstraintHorizontal = "left"
        currentConstraintVertical = "top"
        hConstraintDropdown.select(value: "left")
        vConstraintDropdown.select(value: "top")
        applySectionVisibility()
        currentX = 0; currentY = 0; currentW = 0; currentH = 0; currentR = 0; currentCornerRadius = 0
        currentCornerRadii = CornerRadii(uniform: 0)
        isAspectLocked = false
        isCornerRadiiLinked = true
        lockRatioButton.iconKind = .unlink
        crLinkButton.iconKind = .link
        xPill.setValue(0); yPill.setValue(0); wPill.setValue(0); hPill.setValue(0)
        rPill.setValue(0); crPill.setValue(0); radiusPill.setValue(0)
        tlPill.setValue(0); trPill.setValue(0); brPill.setValue(0); blPill.setValue(0)

        currentFillHex = "#000000"
        currentSolidHex = "#000000"
        currentFillMode = "solid"
        fillModeControl.select(value: "solid")
        syncPaintTypeUI()
        wheel.setHex(currentFillHex)
        fillSwatch.fillHex = currentFillHex
        fillSwatch.strokeHex = "#b2ffd6"
        hexPill.setHex(currentFillHex)
        fillHexPill.setHex(currentFillHex)

        currentStrokeHex = "#b2ffd6"
        currentStrokeWidth = 1
        currentStrokeCap = "butt"
        currentStrokeJoin = "miter"
        currentStrokeMiterLimit = 4.0
        currentStrokeDash = nil
        currentStrokeAlign = "center"
        strokeCapControl.select(value: "butt")
        strokeJoinControl.select(value: "miter")
        strokeMiterLimitPill.setValue(4.0)
        strokeDashControl.select(value: "solid")
        strokeAlignControl.select(value: "center")
        strokeHexPill.setHex(currentStrokeHex)
        strokeWidthPill.setValue(currentStrokeWidth)

        currentOpacity = 1
        opacityPill.setValue(100)

        currentBlendMode = "source-over"
        blendButton.select(value: currentBlendMode)

        currentFontFamily = "Inter"
        currentFontSize = 16
        currentFontWeight = "regular"
        currentTextAlign = "left"
        currentLineHeight = 1.2
        currentLetterSpacing = 0
        isItalic = false
        isUnderline = false
        fontFamilyPill.select(value: currentFontFamily)
        fontSizePill.setValue(currentFontSize)
        typographyButton.currentWeight = currentFontWeight
        typographyButton.currentTextAlign = currentTextAlign
        typographyButton.currentLineHeight = currentLineHeight
        typographyButton.currentLetterSpacing = currentLetterSpacing
        fontWeightDropdown.select(value: currentFontWeight)
        alignSegmentedControl.select(value: currentTextAlign)
        lineHeightPill.setValue(currentLineHeight)
        letterSpacingPill.setValue(currentLetterSpacing)
        italicButton.iconColor = NSColor(hex: "737373")
        underlineButton.iconColor = NSColor(hex: "737373")
        updateFormatMarkers()

        currentEffects = LayerEffects()
        blurCheckbox.state = .off
        blurPill.setValue(0)
        dropShadowCheckbox.state = .off
        dropShadowHexPill.setHex("#000000")
        dropShadowOpacityPill.setValue(100)
        dropShadowBlurPill.setValue(0)
        dropShadowXPill.setValue(0)
        dropShadowYPill.setValue(0)
        innerShadowCheckbox.state = .off
        innerShadowHexPill.setHex("#000000")
        innerShadowOpacityPill.setValue(100)
        innerShadowBlurPill.setValue(0)
        innerShadowXPill.setValue(0)
        innerShadowYPill.setValue(0)

        contentHeight = PropertiesPanelView.preferredContentHeight
        applySectionVisibility()
        needsLayout = true
        layoutSubtreeIfNeeded()
        needsDisplay = true
    }

    private func isShapeLike(_ kind: NodeKind) -> Bool {
        switch kind {
        case .rect, .ellipse, .frame, .boolean, .path:
            return true
        default:
            return false
        }
    }

    /// Identity row: kind glyph + CAPS layer name + kind label.
    private func updateIdentityRow(for node: VOONode) {
        let name = node.name.trimmingCharacters(in: .whitespacesAndNewlines)
        identityName.stringValue = (name.isEmpty ? "LAYER" : name).uppercased()
        let kind: String
        switch node.kind {
        case .frame: kind = "FRAME"
        case .text: kind = "TEXT"
        case .group: kind = "GROUP"
        case .ellipse: kind = "ELLIPSE"
        case .rect: kind = "RECTANGLE"
        case .path: kind = "PATH"
        case .boolean: kind = "BOOLEAN"
        default: kind = "LAYER"
        }
        identityKind.stringValue = kind
        switch node.kind {
        case .frame: identityKindGlyph = .frameKind
        case .text: identityKindGlyph = .textKind
        case .group, .boolean: identityKindGlyph = .groupKind
        case .ellipse: identityKindGlyph = .ellipseKind
        default: identityKindGlyph = .shapeKind
        }
        needsDisplay = true
    }

    private func applySectionVisibility() {
        shapeLabel.isHidden = true            // superseded by the rebuilt chrome
        radiusPill.isHidden = !showsShape
        textContainer.isHidden = !showsText
        frameBlock.isHidden = !showsFrameBlock
    }

    /// Feeds the rebuilt FILL / STROKE rows (swatch, hex, percent) from state.
    private func updatePaintRows() {
        let isGradient = currentFillMode != "solid"
        let solidFill = PropertiesColorMath.normalizeHex(currentSolidHex) ?? "#FFFFFF"
        fillRowSwatch.swatchHex = solidFill
        fillRowHex.stringValue = isGradient ? "Gradient" : solidFill
        fillOpacityPill.setValue(round((node?.nativePaints(.fill).first?.opacity ?? 1) * 100))
        let stroke = PropertiesColorMath.normalizeHex(currentStrokeHex) ?? "#FFFFFF"
        strokeRowSwatch.swatchHex = stroke
        strokeRowHex.stringValue = stroke
        strokeOpacityPill.setValue(round((node?.style.strokeOpacity ?? 1) * 100))
        let fillPaint = node?.nativePaints(.fill).first
        let hasFill =
            fillPaint.map { paint in
                PropertiesColorMath.isVisiblePaint(paint.value(.fill) ?? "transparent")
                    || paint.properties["imageId"] != nil
            } ?? false
        fillAddButton.isHidden = hasFill
        let hasStroke =
            PropertiesColorMath.isVisiblePaint(
                node?.nativePaints(.stroke).first?.value(.stroke) ?? "none")
            && currentStrokeWidth > 0
        strokeAddButton.isHidden = hasStroke
        fillRowToggle.iconKind = fillPaint?.isVisible == false ? .eyeOff : .eye
        strokeRowToggle.iconKind =
            node?.portableProperties["strokeHidden"] == .bool(true) ? .eyeOff : .eye
        fillRowSwatch.alphaValue = fillPaint?.isVisible == false ? 0.4 : 1
        strokeRowSwatch.alphaValue =
            node?.portableProperties["strokeHidden"] == .bool(true) ? 0.4 : 1
        frameCustomSwatch.swatchHex = solidFill
        frameHexField.stringValue = solidFill
        frameSizeValue.stringValue = "\(Int(round(currentW))) × \(Int(round(currentH)))"
    }

    // MARK: Edits (internal state + node mirror + callbacks)

    private func applyFill(hex: String, notify: Bool) {
        // "none" is a valid paint (the row's eye/remove toggles it on and off).
        let normalized = PropertiesColorMath.isVisiblePaint(hex)
            ? (PropertiesColorMath.normalizeHex(hex) ?? currentFillHex)
            : "none"
        currentFillHex = normalized
        currentSolidHex = normalized
        updatePaintRows()
        fillSwatch.fillHex = normalized
        hexPill.setHex(normalized)
        fillHexPill.setHex(normalized)
        if wheel.hex != normalized {
            wheel.setHex(normalized)
        }
        if var node = node {
            node.style.fill = normalized
            self.node = node
        }
        if notify {
            onFillChange?(normalized)
        }
    }

    /// Mirrors `currentFillMode` into the fill row's paint-type trigger.
    private func syncPaintTypeUI() {
        paintTypeButton.setPaintType(currentFillMode)
    }

    private func applyFillMode(_ mode: String) {
        currentFillMode = mode
        syncPaintTypeUI()
        let isGradient = (mode != "solid")
        wheel.isHidden = true
        fillSwatch.isHidden = true
        swapButton.isHidden = true
        hexPill.isHidden = true
        eyedropperButton.isHidden = true
        gradientStopsBar.isHidden = !isGradient
        gradientStopHexPill.isHidden = !isGradient
        gradientStopOpacityPill.isHidden = !isGradient
        gradientAnglePill.isHidden = (mode != "linear")

        if mode == "solid" {
            let hex = PropertiesColorMath.normalizeHex(currentSolidHex) ?? "#000000"
            applyFill(hex: hex, notify: true)
        } else {
            rebuildGradientFill(notify: true)
        }
        needsLayout = true
        needsDisplay = true
    }

    private func didSelectGradientStop(_ stop: GradientStopsBarView.Stop) {
        gradientStopHexPill.setHex(PropertiesColorMath.hexString(from: stop.color))
        let alpha = stop.color.alphaComponent
        gradientStopOpacityPill.setValue(round(alpha * 100))
    }

    private func applyGradientStopHex(_ hex: String) {
        guard let normalized = PropertiesColorMath.normalizeHex(hex),
              let baseColor = NSColor(hexString: normalized) else { return }
        let currentAlpha = gradientStopsBar.selectedStop?.color.alphaComponent ?? 1.0
        let newColor = baseColor.withAlphaComponent(currentAlpha)
        gradientStopsBar.updateSelectedColor(newColor)
        rebuildGradientFill(notify: true)
    }

    private func applyGradientStopOpacity(_ op: CGFloat) {
        guard let stop = gradientStopsBar.selectedStop else { return }
        let alpha = min(max(op / 100.0, 0), 1)
        let newColor = stop.color.withAlphaComponent(alpha)
        gradientStopsBar.updateSelectedColor(newColor)
        rebuildGradientFill(notify: true)
    }

    private func applyGradientAngle(_ angle: CGFloat) {
        currentGradientAngle = angle.truncatingRemainder(dividingBy: 360)
        if currentGradientAngle < 0 { currentGradientAngle += 360 }
        rebuildGradientFill(notify: true)
    }

    private func rebuildGradientFill(notify: Bool = true) {
        let sorted = gradientStopsBar.stops.sorted { $0.location < $1.location }
        let stopStrings = sorted.map { stop -> String in
            let hex = PropertiesColorMath.hexString(from: stop.color)
            let pct = Int(round(stop.location * 100))
            return "\(hex) \(pct)%"
        }.joined(separator: ", ")

        let cssString: String
        if currentFillMode == "radial" {
            cssString = "radial-gradient(circle at 50% 50%, \(stopStrings))"
        } else {
            cssString = "linear-gradient(\(Int(round(currentGradientAngle)))deg, \(stopStrings))"
        }

        currentFillHex = cssString
        if var node = node {
            node.style.fill = cssString
            self.node = node
        }
        if notify {
            onFillChange?(cssString)
        }
    }

    private func applyStroke(hex: String, notify: Bool) {
        let normalized = PropertiesColorMath.isVisiblePaint(hex)
            ? (PropertiesColorMath.normalizeHex(hex) ?? currentStrokeHex)
            : "none"
        currentStrokeHex = normalized
        updatePaintRows()
        strokeHexPill.setHex(normalized)
        fillSwatch.strokeHex = normalized
        if var node = node {
            node.style.stroke = normalized
            self.node = node
        }
        if notify {
            onStrokeChange?(normalized)
        }
    }

    private func applyStrokeCap(_ cap: String) {
        currentStrokeCap = cap
        if var node = node {
            node.style.strokeCap = cap
            self.node = node
        }
        onStrokeCapChange?(cap)
    }

    private func applyStrokeJoin(_ join: String) {
        currentStrokeJoin = join
        if var node = node {
            node.style.strokeJoin = join
            self.node = node
        }
        onStrokeJoinChange?(join)
    }

    private func applyStrokeMiterLimit(_ ml: CGFloat) {
        currentStrokeMiterLimit = max(1, ml)
        if var node = node {
            node.style.strokeMiterLimit = currentStrokeMiterLimit
            self.node = node
        }
        onStrokeMiterLimitChange?(currentStrokeMiterLimit)
    }

    private func applyStrokeDashMode(_ mode: String) {
        switch mode {
        case "solid":
            currentStrokeDash = nil
        case "dashed":
            let w = max(currentStrokeWidth, 1)
            currentStrokeDash = [4 * w, 2 * w]
        case "dotted":
            let w = max(currentStrokeWidth, 1)
            currentStrokeDash = [0, 2 * w]
            currentStrokeCap = "round"
            strokeCapControl.select(value: "round")
            applyStrokeCap("round")
        case "custom":
            currentStrokeDash = [dashLengthPill.value, dashGapPill.value]
        default:
            currentStrokeDash = nil
        }
        if var node = node {
            node.style.strokeDash = currentStrokeDash
            self.node = node
        }
        onStrokeDashChange?(currentStrokeDash)
        needsLayout = true
    }

    private func applyCustomDash() {
        let dl = max(0, dashLengthPill.value)
        let dg = max(0, dashGapPill.value)
        currentStrokeDash = [dl, dg]
        if var node = node {
            node.style.strokeDash = currentStrokeDash
            self.node = node
        }
        onStrokeDashChange?(currentStrokeDash)
    }

    private func applyStrokeAlign(_ align: String) {
        currentStrokeAlign = align
        if var node = node {
            node.style.strokeAlign = align
            self.node = node
        }
        onStrokeAlignChange?(align)
    }

    @objc private func didClickLockRatio() {
        isAspectLocked.toggle()
        lockRatioButton.iconKind = isAspectLocked ? .link : .unlink
        if var node = node {
            node.lockRatio = isAspectLocked
            self.node = node
        }
        onLockRatioChange?(isAspectLocked)
    }

    @objc private func didClickCornerRadiiLink() {
        isCornerRadiiLinked.toggle()
        crLinkButton.iconKind = isCornerRadiiLinked ? .link : .unlink
        crPill.isHidden = !isCornerRadiiLinked
        tlPill.isHidden = isCornerRadiiLinked
        trPill.isHidden = isCornerRadiiLinked
        brPill.isHidden = isCornerRadiiLinked
        blPill.isHidden = isCornerRadiiLinked
        if isCornerRadiiLinked {
            let u = currentCornerRadii.tl
            currentCornerRadii = CornerRadii(uniform: u)
            crPill.setValue(u)
            applyCornerRadii(currentCornerRadii)
        }
        needsLayout = true
    }

    private func applyCornerRadius(_ radius: CGFloat) {
        currentCornerRadius = max(radius, 0)
        currentCornerRadii = CornerRadii(uniform: currentCornerRadius)
        crPill.setValue(currentCornerRadius)
        tlPill.setValue(currentCornerRadius)
        trPill.setValue(currentCornerRadius)
        brPill.setValue(currentCornerRadius)
        blPill.setValue(currentCornerRadius)
        if var node = node {
            node.cornerRadii = currentCornerRadii
            self.node = node
        }
        onCornerRadiusChange?(currentCornerRadius)
        onCornerRadiiChange?(currentCornerRadii)
    }

    private func applyCornerRadius(tl: CGFloat? = nil, tr: CGFloat? = nil, br: CGFloat? = nil, bl: CGFloat? = nil) {
        if let tl = tl { currentCornerRadii.tl = max(0, tl) }
        if let tr = tr { currentCornerRadii.tr = max(0, tr) }
        if let br = br { currentCornerRadii.br = max(0, br) }
        if let bl = bl { currentCornerRadii.bl = max(0, bl) }
        applyCornerRadii(currentCornerRadii)
    }

    private func applyCornerRadii(_ radii: CornerRadii) {
        currentCornerRadii = radii
        currentCornerRadius = radii.tl
        if var node = node {
            node.cornerRadii = radii
            self.node = node
        }
        onCornerRadiiChange?(radii)
        onCornerRadiusChange?(radii.tl)
    }

    private func applyFontFamily(_ family: String) {
        currentFontFamily = family
        if var node = node {
            node.fontFamily = family
            self.node = node
        }
        onFontFamilyChange?(family)
    }

    private func applyFontSize(_ size: CGFloat) {
        currentFontSize = min(max(size, 8), 200)
        if var node = node {
            node.fontSize = currentFontSize
            self.node = node
        }
        onFontSizeChange?(currentFontSize)
    }

    private func applyFontWeight(_ weight: String) {
        currentFontWeight = weight
        typographyButton.currentWeight = weight
        fontWeightDropdown.select(value: weight)
        if var node = node {
            node.fontWeight = weight
            self.node = node
        }
        updateFormatMarkers()
        onFontWeightChange?(weight)
    }

    private func applyTextAlign(_ align: String) {
        currentTextAlign = align
        typographyButton.currentTextAlign = align
        alignSegmentedControl.select(value: align)
        if var node = node {
            node.textAlign = align
            self.node = node
        }
        updateFormatMarkers()
        onTextAlignChange?(align)
    }

    private func applyLineHeight(_ lineHeight: CGFloat) {
        currentLineHeight = min(max(lineHeight, 0.5), 4.0)
        typographyButton.currentLineHeight = currentLineHeight
        lineHeightPill.setValue(currentLineHeight)
        if var node = node {
            node.lineHeight = currentLineHeight
            self.node = node
        }
        updateFormatMarkers()
        onLineHeightChange?(currentLineHeight)
    }

    private func applyLetterSpacing(_ spacing: CGFloat) {
        currentLetterSpacing = min(max(spacing, -20), 50)
        typographyButton.currentLetterSpacing = currentLetterSpacing
        letterSpacingPill.setValue(currentLetterSpacing)
        if var node = node {
            node.letterSpacing = currentLetterSpacing
            self.node = node
        }
        updateFormatMarkers()
        onLetterSpacingChange?(currentLetterSpacing)
    }

    @objc private func didClickItalic() {
        isItalic.toggle()
        italicButton.iconColor = isItalic ? NSColor(hex: "a7ffd4") : NSColor(hex: "737373")
        if var node = node {
            node.italic = isItalic
            self.node = node
        }
        onItalicChange?(isItalic)
    }

    @objc private func didClickUnderline() {
        isUnderline.toggle()
        underlineButton.iconColor = isUnderline ? NSColor(hex: "a7ffd4") : NSColor(hex: "737373")
        if var node = node {
            node.underline = isUnderline
            self.node = node
        }
        onUnderlineChange?(isUnderline)
    }

    @objc private func didToggleBlur() {
        let enabled = blurCheckbox.state == .on
        let radius = Double(blurPill.value)
        currentEffects.gaussianBlur = BlurEffect(enabled: enabled, radius: radius)
        applyEffects()
    }

    private func applyBlurRadius(_ radius: CGFloat) {
        let enabled = blurCheckbox.state == .on
        currentEffects.gaussianBlur = BlurEffect(enabled: enabled, radius: Double(radius))
        applyEffects()
    }

    @objc private func didToggleDropShadow() {
        let enabled = dropShadowCheckbox.state == .on
        var shadow = currentEffects.shadow ?? DropShadowEffect(enabled: enabled, color: dropShadowHexPill.hex, blur: Double(dropShadowBlurPill.value), offsetX: Double(dropShadowXPill.value), offsetY: Double(dropShadowYPill.value), spread: 0, opacity: Double(dropShadowOpacityPill.value / 100.0))
        shadow.enabled = enabled
        currentEffects.shadow = shadow
        applyEffects()
    }

    private func applyDropShadow(hex: String? = nil, opacity: Double? = nil, blur: Double? = nil, x: Double? = nil, y: Double? = nil) {
        var shadow = currentEffects.shadow ?? DropShadowEffect(enabled: dropShadowCheckbox.state == .on, color: dropShadowHexPill.hex, blur: 8, offsetX: 0, offsetY: 4, spread: 0, opacity: 1.0)
        if let hex = hex { shadow.color = hex }
        if let opacity = opacity { shadow.opacity = opacity }
        if let blur = blur { shadow.blur = blur }
        if let x = x { shadow.offsetX = x }
        if let y = y { shadow.offsetY = y }
        currentEffects.shadow = shadow
        applyEffects()
    }

    @objc private func didToggleInnerShadow() {
        let enabled = innerShadowCheckbox.state == .on
        var innerShadow = currentEffects.innerShadow ?? InnerShadowEffect(enabled: enabled, color: innerShadowHexPill.hex, blur: Double(innerShadowBlurPill.value), offsetX: Double(innerShadowXPill.value), offsetY: Double(innerShadowYPill.value), spread: 0, opacity: Double(innerShadowOpacityPill.value / 100.0))
        innerShadow.enabled = enabled
        currentEffects.innerShadow = innerShadow
        applyEffects()
    }

    private func applyInnerShadow(hex: String? = nil, opacity: Double? = nil, blur: Double? = nil, x: Double? = nil, y: Double? = nil) {
        var innerShadow = currentEffects.innerShadow ?? InnerShadowEffect(enabled: innerShadowCheckbox.state == .on, color: innerShadowHexPill.hex, blur: 4, offsetX: 0, offsetY: 2, spread: 0, opacity: 1.0)
        if let hex = hex { innerShadow.color = hex }
        if let opacity = opacity { innerShadow.opacity = opacity }
        if let blur = blur { innerShadow.blur = blur }
        if let x = x { innerShadow.offsetX = x }
        if let y = y { innerShadow.offsetY = y }
        currentEffects.innerShadow = innerShadow
        applyEffects()
    }

    private func applyEffects() {
        if var node = node {
            node.effects = currentEffects
            self.node = node
        }
        onEffectsChange?(currentEffects)
        needsLayout = true
        layoutSubtreeIfNeeded()
        onPresentationChange?()
    }

    private func applyGeometry(x: CGFloat? = nil, y: CGFloat? = nil, width: CGFloat? = nil,
                               height: CGFloat? = nil, rotation: CGFloat? = nil,
                               cornerRadius: CGFloat? = nil) {
        if let x = x { currentX = x }
        if let y = y { currentY = y }
        if let width = width { currentW = width }
        if let height = height { currentH = height }
        if let rotation = rotation { currentR = rotation }
        if let cornerRadius = cornerRadius {
            currentCornerRadius = max(cornerRadius, 0)
            if isCornerRadiiLinked {
                currentCornerRadii = CornerRadii(uniform: currentCornerRadius)
                tlPill.setValue(currentCornerRadius)
                trPill.setValue(currentCornerRadius)
                brPill.setValue(currentCornerRadius)
                blPill.setValue(currentCornerRadius)
            }
        }

        if var node = node {
            node.x = currentX
            node.y = currentY
            node.width = max(currentW, 0.001)
            node.height = max(currentH, 0.001)
            node.rotation = currentR
            if isShapeLike(node.kind) {
                node.cornerRadii = currentCornerRadii
            }
            self.node = node
            radiusPill.maximumValue = max(0, min(node.width, node.height) / 2)
        }

        onGeometryChange?(currentX, currentY, currentW, currentH, currentR, currentCornerRadius)
    }

    private func presentColorPanel() {
        let panel = NSColorPanel.shared
        // Seeding the shared panel must never deliver an edit to its old owner.
        panel.setTarget(nil)
        panel.setAction(nil)
        panel.color = NSColor(hex: currentSolidHex)
        panel.setTarget(self)
        panel.setAction(#selector(colorPanelDidChange(_:)))
        panel.orderFront(nil)
    }

    @objc private func colorPanelDidChange(_ sender: NSColorPanel) {
        let hex = PropertiesColorMath.hexString(from: sender.color)
        if currentFillMode == "solid" {
            applyFill(hex: hex, notify: true)
        } else {
            applyGradientStopHex(hex)
        }
    }

    private func configurePaintOpacity(_ pill: PropertiesNumberPill, channel: NativePaintChannel) {
        pill.minimumValue = 0
        pill.maximumValue = 100
        pill.valueAlignment = .right
        pill.scrubUnitsPerPoint = 0.5
        pill.setAccessibilityIdentifier(
            "Inspector.Properties." + channel.rawValue.capitalized + "Opacity")
        pill.setAccessibilityLabel(
            NativeCopy.text(channel == .fill ? .fillOpacity : .strokeOpacity))
        pill.onValueChanged = { [weak self] value in
            self?.sendPaintMutation(.opacity(channel, 0, value / 100))
        }
        pill.onInteractionChanged = { [weak self] active in self?.onPaintInteraction?(active) }
        addSubview(pill)
    }

    private func sendPaintMutation(_ mutation: NativePaintMutation) {
        guard var edited = node else { return }
        do { try edited.applyPaintMutation(mutation) } catch {
            NSAlert(error: error).runModal()
            return
        }
        configure(with: edited)
        onPaintMutation?(mutation)
    }

    @objc private func didToggleFillVisible() {
        guard let paint = node?.nativePaints(.fill).first else { return }
        sendPaintMutation(.visibility(.fill, 0, !paint.isVisible))
    }
    @objc private func didRemoveFill() { sendPaintMutation(.remove(.fill, 0)) }
    @objc private func didToggleStrokeVisible() {
        guard let paint = node?.nativePaints(.stroke).first else { return }
        sendPaintMutation(.visibility(.stroke, 0, !paint.isVisible))
    }
    @objc private func didRemoveStroke() { sendPaintMutation(.remove(.stroke, 0)) }
    @objc private func didAddFill() {
        sendPaintMutation(
            .insert(.fill, 0, NativePaint(properties: ["fill": .string(lastVisibleFill)])))
    }
    @objc private func didAddStroke() {
        sendPaintMutation(
            .insert(
                .stroke, 0,
                NativePaint(properties: [
                    "stroke": .string(lastVisibleStroke), "strokeWidth": .number(1),
                ])))
    }

    @objc private func didClickAddEffect() {
        makeEffectsMenu().popUp(
            positioning: nil, at: NSPoint(x: 0, y: effectsAddButton.bounds.maxY),
            in: effectsAddButton)
    }

    func makeEffectsMenu() -> NSMenu {
        let menu = NSMenu()
        let options: [(String, NativeCopy.Key, Bool)] = [
            ("gaussianBlur", .blurEffect, currentEffects.gaussianBlur != nil),
            ("shadow", .shadowEffect, currentEffects.shadow != nil),
            ("innerShadow", .innerShadowEffect, currentEffects.innerShadow != nil),
        ]
        for (key, label, exists) in options {
            let title =
                (exists ? NativeCopy.text(.removeEffect) + " " : "") + NativeCopy.text(label)
            let item = NSMenuItem(
                title: title, action: #selector(didPickEffect(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = key
            menu.addItem(item)
        }
        return menu
    }

    @objc private func didPickEffect(_ item: NSMenuItem) {
        switch item.representedObject as? String {
        case "gaussianBlur":
            currentEffects.gaussianBlur =
                currentEffects.gaussianBlur == nil ? BlurEffect(enabled: true, radius: 10) : nil
        case "shadow":
            currentEffects.shadow = currentEffects.shadow == nil ? DropShadowEffect() : nil
        case "innerShadow":
            currentEffects.innerShadow =
                currentEffects.innerShadow == nil ? InnerShadowEffect() : nil
        default: preconditionFailure("Unknown effect menu item")
        }
        applyEffects()
    }

    @objc private func didClickSwap() {
        let fill = currentSolidHex
        let stroke = currentStrokeHex
        applyStroke(hex: fill, notify: true)
        applyFill(hex: stroke, notify: true)
    }

    @objc private func didClickSettings() {
        onSwapPanels?()
    }

    @objc private func didClickEyedropper() {
        let sampler = NSColorSampler()
        colorSampler = sampler
        sampler.show { [weak self] color in
            guard let self = self else { return }
            self.colorSampler = nil
            guard let color = color else { return }
            let hex = PropertiesColorMath.hexString(from: color)
            self.applyFill(hex: hex, notify: true)
        }
    }

    // MARK: Rebuilt-chrome actions

    @objc private func didClickSelectOnly() {
        // Web "selection only" hint — nothing to toggle in the native model yet.
    }

    /// Rotates the selected node by ±90° through the normal geometry callback.
    private func rotateSelection(by degrees: CGFloat) {
        var next = (currentR + degrees).truncatingRemainder(dividingBy: 360)
        if next < 0 { next += 360 }
        currentR = next
        rPill.setValue(currentR)
        if var node = node {
            node.rotation = currentR
            self.node = node
        }
        onGeometryChange?(currentX, currentY, currentW, currentH, currentR, currentCornerRadius)
    }

    @objc private func didClickRotateCCW() { rotateSelection(by: -90) }
    @objc private func didClickRotateCW() { rotateSelection(by: 90) }

    @objc private func didClickStrokeAlign() {
        presentStrokeMenu(options: [("Center", "center"), ("Inside", "inside"), ("Outside", "outside")],
                          current: currentStrokeAlign,
                          in: strokeAlignButton) { [weak self] value in
            self?.currentStrokeAlign = value
            self?.onStrokeAlignChange?(value)
        }
    }

    @objc private func didClickStrokeCap() {
        presentStrokeMenu(options: [("Butt", "butt"), ("Round", "round"), ("Square", "square")],
                          current: currentStrokeCap,
                          in: strokeCapButton) { [weak self] value in
            self?.currentStrokeCap = value
            self?.onStrokeCapChange?(value)
        }
    }

    @objc private func didClickStrokeJoin() {
        presentStrokeMenu(options: [("Miter", "miter"), ("Round", "round"), ("Bevel", "bevel")],
                          current: currentStrokeJoin,
                          in: strokeJoinButton) { [weak self] value in
            self?.currentStrokeJoin = value
            self?.onStrokeJoinChange?(value)
        }
    }

    @objc private func didClickStrokeDash() {
        let current = (currentStrokeDash?.isEmpty == false) ? "dashed" : "solid"
        presentStrokeMenu(options: [("Solid", "solid"), ("Dash", "dashed")],
                          current: current,
                          in: strokeDashButton) { [weak self] value in
            guard let self = self else { return }
            let dash: [CGFloat]? = value == "dashed" ? [4, 4] : nil
            self.currentStrokeDash = dash
            self.onStrokeDashChange?(dash)
        }
    }

    private var strokeMenuCallback: ((String) -> Void)?

    private func presentStrokeMenu(options: [(String, String)],
                                   current: String,
                                   in anchorView: NSView,
                                   onPick: @escaping (String) -> Void) {
        let menu = NSMenu()
        menu.autoenablesItems = false
        strokeMenuCallback = onPick
        for (label, value) in options {
            let item = NSMenuItem(title: label, action: #selector(handleStrokeMenuPick(_:)), keyEquivalent: "")
            item.representedObject = value
            item.state = value == current ? .on : .off
            item.target = self
            menu.addItem(item)
        }
        menu.popUp(positioning: nil,
                   at: NSPoint(x: 0, y: anchorView.bounds.height + 4),
                   in: anchorView)
    }

    @objc private func handleStrokeMenuPick(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? String else { return }
        strokeMenuCallback?(value)
        strokeMenuCallback = nil
        needsDisplay = true
    }

    /// Colour panel target for the STROKE swatch (the FILL swatch keeps the
    /// existing `presentColorPanel` path).
    private func presentStrokeColorPanel() {
        let panel = NSColorPanel.shared
        panel.setTarget(self)
        panel.setAction(#selector(strokeColorPanelDidChange(_:)))
        panel.color = NSColor(hex: currentStrokeHex)
        panel.orderFront(nil)
    }

    @objc private func strokeColorPanelDidChange(_ sender: NSColorPanel) {
        applyStroke(hex: PropertiesColorMath.hexString(from: sender.color), notify: true)
    }

    // MARK: Layout

    /// Vertical rhythm of the rebuilt web inspector: 28pt fields, 9pt section
    /// labels, 12pt above/below every 1px divider.
    private enum Row {
        static let inset: CGFloat = 12
        static let gap: CGFloat = 8
        static let rowH: CGFloat = 28
        static let labelH: CGFloat = 11
        static let sectionGap: CGFloat = 7
        static let fieldRadius: CGFloat = 8
        static let surfaceHex = "171717"
    }

    private func setCodeMode(_ enabled: Bool) {
        if enabled {
            if codePanel.isHidden {
                designVisibility = Dictionary(
                    uniqueKeysWithValues: subviews.map { (ObjectIdentifier($0), $0.isHidden) })
            }
            for view in subviews where view !== headerTabs && view !== codePanel {
                view.isHidden = true
            }
            codePanel.isHidden = false
            if let node {
                codePanel.code.string = NativeInspectCode.snippet(for: node)
            } else {
                codePanel.code.string = NativeCopy.text(.codeEmpty)
            }
        } else if !codePanel.isHidden {
            for view in subviews {
                view.isHidden = designVisibility[ObjectIdentifier(view)] ?? view.isHidden
            }
            codePanel.isHidden = true
            applySectionVisibility()
        }
        needsLayout = true
        needsDisplay = true
        layoutSubtreeIfNeeded()
        onPresentationChange?()
    }

    public override func layout() {
        super.layout()
        if headerTabs.selectedIndex == 1 {
            for view in subviews where view !== headerTabs && view !== codePanel {
                view.isHidden = true
            }
            codePanel.isHidden = false
            headerTabs.frame = CGRect(x: 12, y: 12, width: max(bounds.width - 60, 0), height: 28)
            codePanel.frame = CGRect(x: 12, y: 52, width: max(bounds.width - 24, 0), height: 400)
            contentHeight = 464
            return
        }

        let width = bounds.width > 0 ? bounds.width : PropertiesPanelMetrics.width
        let inset = Row.inset
        let contentRight = width - inset
        let contentWidth = max(contentRight - inset, 0)
        dividerYs = []
        fillRowRect = .zero
        strokeRow1Rect = .zero
        strokeRow2Rect = .zero
        frameSizeRowRect = .zero
        frameColorRowRect = .zero

        /// Closes a section: divider 12pt below the content, next section 12pt after.
        func closeSection(_ bottom: CGFloat) -> CGFloat {
            let dividerY = bottom + Row.sectionGap
            dividerYs.append(dividerY)
            return dividerY + Row.sectionGap
        }

        var y: CGFloat = 12

        // MARK: Header (Design | Code + settings)
        headerTabs.frame = CGRect(x: inset, y: y, width: max(contentWidth - 36, 0), height: Row.rowH)
        settingsButton.frame = CGRect(x: contentRight - 24, y: y + 2, width: 24, height: 24)

        // MARK: Layer identity row
        let identityY = y + 28 + 12
        identityGlyphRect = CGRect(x: inset, y: identityY + 2, width: 14, height: 14)
        identityName.frame = CGRect(x: inset + 22, y: identityY - 1, width: 112, height: 17)
        identityKind.frame = CGRect(x: inset + 140, y: identityY + 3,
                                    width: max(contentRight - 20 - 8 - (inset + 140), 0), height: 12)
        selectOnlyButton.frame = CGRect(x: contentRight - 20, y: identityY, width: 20, height: 20)
        y = closeSection(identityY + 20)

        // MARK: TRANSFORM
        transformLabel.frame = CGRect(x: inset, y: y, width: 160, height: Row.labelH)
        let transformTop = y + Row.labelH + 6
        anchorSurfaceRect = CGRect(x: inset, y: transformTop, width: 56, height: 56)
        anchorGrid.frame = anchorSurfaceRect

        let colX: CGFloat = 56 + 12                       // column next to the anchor grid
        let colW = max(contentWidth - colX, 0)
        let halfW = (colW - Row.gap) / 2
        let wWidth = halfW - 10
        let hX = colX + wWidth + 24
        let hWidth = max(contentWidth - hX, 0)

        transformContainer.frame = CGRect(x: inset, y: transformTop,
                                          width: contentWidth, height: 124)
        xPill.frame = CGRect(x: colX, y: 0, width: halfW, height: Row.rowH)
        yPill.frame = CGRect(x: colX + halfW + Row.gap, y: 0, width: halfW, height: Row.rowH)

        wPill.frame = CGRect(x: colX, y: 32, width: wWidth, height: Row.rowH)
        lockRatioButton.frame = CGRect(x: colX + wWidth + 4, y: 36, width: 16, height: 20)
        hPill.frame = CGRect(x: hX, y: 32, width: hWidth, height: Row.rowH)

        rPill.frame = CGRect(x: 0, y: 64, width: 96, height: Row.rowH)
        sPill.frame = CGRect(x: 100, y: 64, width: 96, height: Row.rowH)
        rotateCcwButton.frame = CGRect(x: 204, y: 64, width: 28, height: Row.rowH)
        rotateCwButton.frame = CGRect(x: 236, y: 64, width: 28, height: Row.rowH)

        radiusPill.frame = CGRect(x: inset, y: transformTop + 96,
                                  width: max(contentWidth - 28, 0), height: Row.rowH)
        crLinkButton.frame = CGRect(x: contentWidth - 20, y: 100, width: 20, height: 20)

        var transformBottom = transformTop + 96 + Row.rowH
        if isCornerRadiiLinked {
            crPill.isHidden = true
            tlPill.isHidden = true; trPill.isHidden = true; brPill.isHidden = true; blPill.isHidden = true
            radiusPill.isHidden = !showsShape
        } else {
            radiusPill.isHidden = true
            crPill.isHidden = true
            tlPill.isHidden = false; trPill.isHidden = false; brPill.isHidden = false; blPill.isHidden = false
            let radiiHalf = (contentWidth - Row.gap) / 2
            tlPill.frame = CGRect(x: 0, y: 132, width: radiiHalf, height: Row.rowH)
            trPill.frame = CGRect(x: radiiHalf + Row.gap, y: 132, width: radiiHalf, height: Row.rowH)
            blPill.frame = CGRect(x: 0, y: 164, width: radiiHalf, height: Row.rowH)
            brPill.frame = CGRect(x: radiiHalf + Row.gap, y: 164, width: radiiHalf, height: Row.rowH)
            transformContainer.frame = CGRect(x: inset, y: transformTop,
                                              width: contentWidth, height: 196)
            transformBottom = transformTop + 196
        }
        y = closeSection(max(transformBottom, transformTop + 56))

        // MARK: CONSTRAINTS
        constraintsLabel.frame = CGRect(x: inset, y: y, width: 160, height: Row.labelH)
        let constraintTop = y + Row.labelH + 6
        diagramSurfaceRect = CGRect(x: inset, y: constraintTop, width: 56, height: 56)
        constraintsDiagramButton.frame = diagramSurfaceRect
        let ddX = colX + 82
        let ddW = max(contentRight - ddX, 0)
        hConstraintLabel.frame = CGRect(x: colX, y: constraintTop + 9, width: 78, height: 10)
        hConstraintDropdown.frame = CGRect(x: ddX, y: constraintTop, width: ddW, height: Row.rowH)
        vConstraintLabel.frame = CGRect(x: colX, y: constraintTop + 45, width: 78, height: 10)
        vConstraintDropdown.frame = CGRect(x: ddX, y: constraintTop + 36, width: ddW, height: Row.rowH)
        y = closeSection(constraintTop + 64)

        // MARK: APPEARANCE
        appearanceLabel.frame = CGRect(x: inset, y: y, width: 160, height: Row.labelH)
        let appearanceTop = y + Row.labelH + 6
        opacityPill.frame = CGRect(x: inset, y: appearanceTop, width: 124, height: Row.rowH)
        blendButton.frame = CGRect(x: inset + 132, y: appearanceTop,
                                   width: max(contentWidth - 132, 0), height: Row.rowH)
        y = closeSection(appearanceTop + Row.rowH)

        // MARK: TEXT (text layers) / FRAME block (frames)
        textContainer.isHidden = !showsText
        frameBlock.isHidden = !showsFrameBlock
        if showsText {
            let textHeight: CGFloat = 11 + 6 + Row.rowH + 4 + Row.rowH + 4 + Row.rowH
            textContainer.frame = CGRect(x: inset, y: y, width: contentWidth, height: textHeight)
            textLabel.frame = CGRect(x: 0, y: 0, width: 160, height: Row.labelH)
            fontFamilyPill.frame = CGRect(x: 0, y: 17, width: 130, height: Row.rowH)
            fontSizePill.frame = CGRect(x: 136, y: 17, width: 60, height: Row.rowH)
            typographyButton.frame = CGRect(x: 202, y: 17, width: 24, height: Row.rowH)
            fontWeightDropdown.frame = CGRect(x: 0, y: 49, width: 130, height: Row.rowH)
            alignSegmentedControl.frame = CGRect(x: 136, y: 49,
                                                 width: max(contentWidth - 136, 0), height: Row.rowH)
            lineHeightPill.frame = CGRect(x: 0, y: 81, width: 64, height: Row.rowH)
            letterSpacingPill.frame = CGRect(x: 70, y: 81, width: 64, height: Row.rowH)
            italicButton.frame = CGRect(x: 140, y: 81, width: 28, height: Row.rowH)
            underlineButton.frame = CGRect(x: 172, y: 81, width: 28, height: Row.rowH)
            y = closeSection(y + textHeight)
        } else if showsFrameBlock {
            let blockHeight: CGFloat = 11 + 17 + 28 + 12 + 11 + 17 + 20 + 8 + 28
            frameBlock.frame = CGRect(x: inset, y: y, width: contentWidth, height: blockHeight)
            frameSizeLabel.frame = CGRect(x: 0, y: 0, width: 160, height: Row.labelH)
            frameSizeRowRect = CGRect(x: inset, y: y + 17, width: contentWidth, height: Row.rowH)
            frameSizeValue.frame = CGRect(x: 10, y: 17 + 6, width: max(contentWidth - 20, 0), height: 16)
            backgroundColorLabel.frame = CGRect(x: 0, y: 17 + 28 + 12, width: 200, height: Row.labelH)
            let presetsY: CGFloat = 17 + 28 + 12 + 17
            for (index, swatch) in framePresetSwatches.enumerated() {
                swatch.frame = CGRect(x: CGFloat(index) * 28, y: presetsY, width: 20, height: 20)
            }
            let colorRowY = presetsY + 20 + 8
            frameColorRowRect = CGRect(x: inset, y: y + colorRowY, width: contentWidth, height: Row.rowH)
            frameCustomSwatch.frame = CGRect(x: 8, y: colorRowY + 4, width: 20, height: 20)
            frameHexField.frame = CGRect(x: 36, y: colorRowY + 6, width: 140, height: 16)
            y = closeSection(y + colorRowY + Row.rowH)
        }

        // MARK: FILL
        fillLabel.frame = CGRect(x: inset, y: y, width: 160, height: Row.labelH)
        paintTypeButton.frame = CGRect(x: contentRight - 56, y: y - 5, width: 20, height: 20)
        fillAddButton.frame = CGRect(x: contentRight - 28, y: y - 8, width: 24, height: 24)
        let fillTop = y + Row.labelH + 6
        fillRowRect = CGRect(x: inset, y: fillTop, width: contentWidth, height: 32)
        fillRowSwatch.frame = CGRect(x: inset + 8, y: fillTop + 6, width: 20, height: 20)
        fillRowHex.frame = CGRect(x: inset + 36, y: fillTop + 9, width: 112, height: 16)
        fillOpacityPill.frame = CGRect(x: inset + 150, y: fillTop + 4, width: 44, height: 24)
        fillRowToggle.frame = CGRect(x: inset + 202, y: fillTop + 6, width: 20, height: 20)
        fillRowRemove.frame = CGRect(x: inset + 232, y: fillTop + 6, width: 20, height: 20)
        let primaryFill = node?.nativePaints(.fill).first
        let hasFill =
            primaryFill.map { paint in
                PropertiesColorMath.isVisiblePaint(paint.value(.fill) ?? "transparent")
                    || paint.properties["imageId"] != nil
            } ?? false
        fillAddButton.isHidden = hasFill
        for view in [fillRowSwatch, fillRowHex, fillOpacityPill, fillRowToggle, fillRowRemove]
            as [NSView]
        { view.isHidden = !hasFill }
        if !hasFill { fillRowRect = .zero }
        var fillBottom = hasFill ? fillTop + 32 : fillTop

        if hasFill && currentFillMode != "solid" {
            gradientStopsBar.isHidden = false
            gradientStopHexPill.isHidden = false
            gradientStopOpacityPill.isHidden = false
            gradientAnglePill.isHidden = (currentFillMode != "linear")
            gradientStopsBar.frame = CGRect(x: inset, y: fillBottom + 6,
                                            width: contentWidth, height: 24)
            let stopRowY = fillBottom + 6 + 30
            gradientStopHexPill.frame = CGRect(x: inset, y: stopRowY, width: 100, height: 24)
            gradientStopOpacityPill.frame = CGRect(x: inset + 106, y: stopRowY, width: 56, height: 24)
            if currentFillMode == "linear" {
                gradientAnglePill.frame = CGRect(x: contentRight - 56, y: stopRowY, width: 56, height: 24)
            } else {
                gradientAnglePill.frame = .zero
            }
            fillBottom = stopRowY + 24
        }
        y = closeSection(fillBottom)

        // MARK: STROKE
        strokeLabel.frame = CGRect(x: inset, y: y, width: 160, height: Row.labelH)
        strokeAddButton.frame = CGRect(x: contentRight - 28, y: y - 8, width: 24, height: 24)
        let strokeTop = y + Row.labelH + 6
        strokeRow1Rect = CGRect(x: inset, y: strokeTop, width: contentWidth, height: 32)
        strokeRowSwatch.frame = CGRect(x: inset + 8, y: strokeTop + 6, width: 20, height: 20)
        strokeRowHex.frame = CGRect(x: inset + 36, y: strokeTop + 9, width: 112, height: 16)
        strokeOpacityPill.frame = CGRect(x: inset + 150, y: strokeTop + 4, width: 44, height: 24)
        strokeRowToggle.frame = CGRect(x: inset + 202, y: strokeTop + 6, width: 20, height: 20)
        strokeRowRemove.frame = CGRect(x: inset + 232, y: strokeTop + 6, width: 20, height: 20)

        let strokeRow2Top = strokeTop + 32 + 4
        strokeRow2Rect = CGRect(x: inset, y: strokeRow2Top, width: contentWidth, height: Row.rowH)
        strokeAlignButton.frame = CGRect(x: inset + 6, y: strokeRow2Top + 4, width: 20, height: 20)
        strokeCapButton.frame = CGRect(x: inset + 32, y: strokeRow2Top + 4, width: 20, height: 20)
        strokeJoinButton.frame = CGRect(x: inset + 58, y: strokeRow2Top + 4, width: 20, height: 20)
        strokeWidthPill.labelText = ""
        strokeWidthPill.frame = CGRect(x: inset + 88, y: strokeRow2Top, width: 120, height: Row.rowH)
        strokeDashButton.frame = CGRect(x: contentRight - 28, y: strokeRow2Top + 4, width: 20, height: 20)
        let hasStroke =
            PropertiesColorMath.isVisiblePaint(
                node?.nativePaints(.stroke).first?.value(.stroke) ?? "none")
            && currentStrokeWidth > 0
        for view in [
            strokeRowSwatch, strokeRowHex, strokeOpacityPill, strokeRowToggle, strokeRowRemove,
            strokeAlignButton, strokeCapButton, strokeJoinButton, strokeWidthPill, strokeDashButton,
        ] as [NSView] { view.isHidden = !hasStroke }
        strokeAddButton.isHidden = hasStroke
        if !hasStroke {
            strokeRow1Rect = .zero
            strokeRow2Rect = .zero
        }
        var strokeBottom = hasStroke ? strokeRow2Top + Row.rowH : strokeTop
        let isDashed = (currentStrokeDash != nil && currentStrokeDash!.isEmpty == false)
        if hasStroke && isDashed {
            let dashY = strokeBottom + 4
            dashLengthPill.isHidden = false
            dashGapPill.isHidden = false
            strokeMiterLimitPill.isHidden = false
            dashLengthPill.frame = CGRect(x: inset, y: dashY, width: 70, height: Row.rowH)
            dashGapPill.frame = CGRect(x: inset + 76, y: dashY, width: 70, height: Row.rowH)
            strokeMiterLimitPill.frame = CGRect(x: inset + 152, y: dashY, width: 70, height: Row.rowH)
            strokeBottom = dashY + Row.rowH
        } else {
            dashLengthPill.isHidden = true
            dashGapPill.isHidden = true
            strokeMiterLimitPill.isHidden = true
        }
        y = closeSection(strokeBottom)

        // MARK: EFFECTS
        effectsLabel.frame = CGRect(x: 0, y: 0, width: 160, height: Row.labelH)
        effectsAddButton.frame = CGRect(x: contentWidth - 24, y: -8, width: 24, height: 24)
        let supported = node?.portableProperties["effects"] == nil || node?.effects != nil
        effectsAddButton.isEnabled = supported
        effectsAddButton.toolTip = NativeCopy.text(supported ? .addEffect : .unsupportedEffects)
        let effectHeight = NativeEffectsLayout.layout(self, width: contentWidth)
        effectsContainer.frame = CGRect(x: inset, y: y, width: contentWidth, height: effectHeight)
        y += effectHeight

        contentHeight = y + 4
        needsDisplay = true
    }

    public func calculateContentHeight() -> CGFloat {
        return contentHeight
    }

    // MARK: Drawing (row surfaces, dividers, identity glyph)

    public override func draw(_ dirtyRect: NSRect) {
        guard headerTabs.selectedIndex == 0,
            let ctx = NSGraphicsContext.current?.cgContext
        else { return }

        // Field surfaces for the read-only rows of the rebuilt inspector chrome.
        let surfaces: [CGRect] = [fillRowRect, strokeRow1Rect, strokeRow2Rect,
                                  frameSizeRowRect, frameColorRowRect]
        ctx.setFillColor(NSColor(hex: Row.surfaceHex).cgColor)
        for rect in surfaces where rect.height > 0 {
            ctx.addPath(CGPath(roundedRect: rect,
                               cornerWidth: Row.fieldRadius,
                               cornerHeight: Row.fieldRadius,
                               transform: nil))
            ctx.fillPath()
        }

        // White/6 surfaces behind the anchor grid and the constraints diagram.
        ctx.setFillColor(NSColor(white: 1.0, alpha: 0.06).cgColor)
        for rect in [anchorSurfaceRect, diagramSurfaceRect] where rect.height > 0 {
            ctx.addPath(CGPath(roundedRect: rect, cornerWidth: 10, cornerHeight: 10, transform: nil))
            ctx.fillPath()
        }

        // Hairline separators inside the FILL / STROKE rows.
        ctx.setLineWidth(1)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.06).cgColor)
        for row in [fillRowRect, strokeRow1Rect] where row.height > 0 {
            for offset in [150.0, 198.0, 227.0] {
                let x = round(row.minX + offset) + 0.5
                ctx.strokeLineSegments(between: [
                    CGPoint(x: x, y: row.minY + 5),
                    CGPoint(x: x, y: row.maxY - 5)
                ])
            }
        }

        // 1px white/8 rules between sections.
        let dividerInset: CGFloat = 12
        ctx.setLineWidth(1)
        for y in dividerYs {
            ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.08).cgColor)
            let lineY = round(y) + 0.5
            ctx.strokeLineSegments(between: [CGPoint(x: dividerInset, y: lineY),
                                             CGPoint(x: bounds.width - dividerInset, y: lineY)])
        }

        // Layer kind glyph in the identity row.
        if identityGlyphRect.width > 0 {
            PropertiesGlyphFactory.draw(kind: identityKindGlyph,
                                        in: identityGlyphRect,
                                        color: NSColor(white: 0.92, alpha: 1.0),
                                        strokeWidth: 1.5)
        }
    }
}

