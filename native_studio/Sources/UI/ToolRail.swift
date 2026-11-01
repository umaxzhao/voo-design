//
//  ToolRail.swift
//  native_studio
//
//  Floating horizontal pill toolbar matching VOO Design 1:1.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Studio Tool Type

public enum StudioToolType: String, CaseIterable, Sendable, Equatable {
    case move
    case node
    case pen
    case shapes
    case brush
    case eraser
    case text
    case artboard

    public var displayName: String {
        switch self {
        case .move: return "Select (Move)"
        case .node: return "Edit nodes"
        case .pen: return "Pen"
        case .shapes: return "Shapes"
        case .brush: return "Brush"
        case .eraser: return "Eraser"
        case .text: return "Text"
        case .artboard: return "Frame"
        }
    }

    public var defaultShortcut: Character? {
        switch self {
        case .move: return "V"
        case .node: return "A"
        case .pen: return "P"
        case .shapes: return "R"
        case .brush: return "B"
        case .eraser: return "E"
        case .text: return "T"
        case .artboard: return "F"
        }
    }

    public var tooltipText: String {
        if let key = defaultShortcut {
            return "\(displayName) (\(key))"
        } else {
            return displayName
        }
    }

    public var accessibilityIdentifier: String {
        switch self {
        case .move: return AccessibilityCatalog.toolMove
        case .node: return AccessibilityCatalog.toolNode
        case .pen: return AccessibilityCatalog.toolPen
        case .shapes: return AccessibilityCatalog.toolShapes
        case .brush: return AccessibilityCatalog.toolBrush
        case .eraser: return AccessibilityCatalog.toolEraser
        case .text: return AccessibilityCatalog.toolText
        case .artboard: return AccessibilityCatalog.toolArtboard
        }
    }
}

// MARK: - Studio Delegate Protocol

public protocol StudioDelegate: AnyObject {
    func didSelectTool(_ tool: StudioToolType)
    func didChangeZoom(_ zoom: CGFloat)
    func didRequestUndo()
    func didRequestRedo()
}

public extension StudioDelegate {
    func didSelectTool(_ tool: StudioToolType) {}
    func didChangeZoom(_ zoom: CGFloat) {}
    func didRequestUndo() {}
    func didRequestRedo() {}
}

// MARK: - ToolRail State Machine

public final class ToolRailState: @unchecked Sendable {
    public private(set) var activeTool: StudioToolType = .move
    private var penSubToolIndex: Int = 0
    private let penSubTools: [String] = ["pen", "curvature", "pencil"]

    public var penSubTool: PenSubTool = .pen {
        didSet {
            if let idx = penSubTools.firstIndex(of: penSubTool.rawValue) {
                penSubToolIndex = idx
            }
            onPenSubToolChanged?(penSubTool.rawValue)
        }
    }
    public var shapeSubTool: ShapeSubTool = .rect {
        didSet {
            onShapeSubToolChanged?(shapeSubTool)
        }
    }
    public var selectionSubTool: SelectionSubTool = .marqueeRect {
        didSet {
            onSelectionSubToolChanged?(selectionSubTool)
        }
    }

    public var onActiveToolChanged: ((StudioToolType) -> Void)?
    public var onPenSubToolChanged: ((String) -> Void)?
    public var onShapeSubToolChanged: ((ShapeSubTool) -> Void)?
    public var onSelectionSubToolChanged: ((SelectionSubTool) -> Void)?

    public init() {}

    public func selectTool(_ tool: StudioToolType) {
        guard activeTool != tool else { return }
        activeTool = tool
        onActiveToolChanged?(tool)
    }

    public func selectPenSubTool(_ sub: PenSubTool) {
        penSubTool = sub
    }

    public func selectShapeSubTool(_ sub: ShapeSubTool) {
        shapeSubTool = sub
    }

    public func selectSelectionSubTool(_ sub: SelectionSubTool) {
        selectionSubTool = sub
    }

    @discardableResult
    public func handleShortcutKey(_ char: Character) -> StudioToolType? {
        let matched: StudioToolType?
        switch char {
        case "v", "V":
            activeTool = .move
            matched = .move
        case "f", "F":
            activeTool = .artboard
            matched = .artboard
        case "p", "P":
            activeTool = .pen
            let nextIndex = (penSubToolIndex + 1) % penSubTools.count
            penSubTool = PenSubTool(rawValue: penSubTools[nextIndex]) ?? .pen
            matched = .pen
        case "b", "B":
            activeTool = .brush
            matched = .brush
        case "t", "T":
            activeTool = .text
            matched = .text
        case "r", "R":
            activeTool = .shapes
            matched = .shapes
        case "e", "E":
            activeTool = .eraser
            matched = .eraser
        case "a", "A":
            activeTool = .node
            matched = .node
        default:
            return nil
        }

        if let tool = matched {
            onActiveToolChanged?(tool)
        }
        return matched
    }

    public var currentPenSubTool: String {
        return penSubTools[penSubToolIndex]
    }
}

// MARK: - Custom AppKit Tool Button (White Circle when active)

public final class ToolButton: NSButton {
    public let toolType: StudioToolType
    public weak var toolRailState: ToolRailState?
    public var hasSubtools: Bool = false {
        didSet {
            if oldValue != hasSubtools {
                needsDisplay = true
            }
        }
    }
    public var onTriggerFlyout: ((ToolButton) -> Void)?
    public private(set) var menuTrigger: NSButton?
    var onHoverChanged: ((Bool) -> Void)?
    private var isHovered = false

    public var isToolActive: Bool = false {
        didSet {
            if oldValue != isToolActive {
                needsDisplay = true
            }
        }
    }

    public init(toolType: StudioToolType, toolRailState: ToolRailState? = nil) {
        self.toolType = toolType
        self.toolRailState = toolRailState
        // Web parity: `toolButtonClass` is `h-11 w-11 rounded-full p-0` (44×44).
        super.init(frame: NSRect(x: 0, y: 0, width: 44, height: 44))
        self.title = ""
        self.isBordered = false
        self.focusRingType = .none
        self.toolTip = toolType.tooltipText
        self.setAccessibilityIdentifier(toolType.accessibilityIdentifier)
        self.setAccessibilityRole(.button)
        self.setAccessibilityLabel(toolType.displayName)

        let press = NSPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
        press.minimumPressDuration = 0.35
        addGestureRecognizer(press)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleLongPress(_ gesture: NSPressGestureRecognizer) {
        if gesture.state == .began, hasSubtools {
            onTriggerFlyout?(self)
        }
    }

    public override func rightMouseDown(with event: NSEvent) {
        if hasSubtools {
            onTriggerFlyout?(self)
        } else {
            super.rightMouseDown(with: event)
        }
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self {
            removeTrackingArea(area)
        }
        addTrackingArea(
            NSTrackingArea(
                rect: .zero,
                options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
        onHoverChanged?(true)
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
        onHoverChanged?(false)
    }

    func installMenuTrigger(onClick: @escaping () -> Void) {
        let trigger = NativeToolMenuTrigger(identifier: toolType.accessibilityIdentifier + ".Menu")
        trigger.onTrigger = onClick
        addSubview(trigger)
        menuTrigger = trigger
        needsLayout = true
    }

    func setMenuExpanded(_ expanded: Bool) {
        (menuTrigger as? NativeToolMenuTrigger)?.expanded = expanded
    }

    public override func layout() {
        super.layout()
        let y = isFlipped ? bounds.maxY - 14 : bounds.minY
        menuTrigger?.frame = CGRect(x: bounds.midX - 7, y: y, width: 14, height: 14)
    }

    public override var isHighlighted: Bool {
        didSet {
            if oldValue != isHighlighted {
                needsDisplay = true
            }
        }
    }

    public override func draw(_ dirtyRect: NSRect) {
        let b = bounds
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Web parity: the active white circle is the whole 44pt `h-11 w-11
        // rounded-full` button.
        let circleSize: CGFloat = 44.0
        let circleRect = CGRect(x: (b.width - circleSize) / 2.0, y: (b.height - circleSize) / 2.0, width: circleSize, height: circleSize)

        // 1. Background Fill
        if isToolActive {
            // Iconic VOO signature: Active tool is pure white circular pill!
            ctx.setFillColor(NSColor.white.cgColor)
            ctx.fillEllipse(in: circleRect)
        } else if isHighlighted || isHovered {
            // Hover state: `hover:bg-neutral-800` (#262626).
            ctx.setFillColor(NSColor(white: 0.15, alpha: 1.0).cgColor)
            ctx.fillEllipse(in: circleRect)
        }

        // 2. Vector Icon Glyph Drawing (web icons are size 16 inside the 44pt button)
        let iconColor: NSColor =
            isToolActive
            ? .black
            : ((isHighlighted || isHovered)
                ? NSColor(white: 0.96, alpha: 1.0) : NSColor(white: 0.64, alpha: 1.0))
        let glyphRect = CGRect(x: b.midX - 8, y: b.midY - 8, width: 16, height: 16)

        switch toolType {
        case .move:
            VooIconFactory.drawCursor(in: glyphRect, color: iconColor, isSolid: false)
        case .node:
            // Web rail slot 2 is Lucide `crop` (a frame with corner ticks). The
            // shared `.frame` entry is Lucide `frame` (a # hash), which reads as a
            // grid at 16pt, so draw the crop geometry the rail actually shows.
            RailGlyphDrawing.draw(.crop, in: glyphRect, color: iconColor)
        case .pen:
            let sub = isToolActive ? (toolRailState?.penSubTool ?? .pen) : .pen
            switch sub {
            case .pen:
                VooIconFactory.drawPen(in: glyphRect, color: iconColor)
            case .curvature:
                VooIconFactory.drawCurvaturePen(in: glyphRect, color: iconColor)
            case .pencil:
                VooIconFactory.drawPencil(in: glyphRect, color: iconColor)
            }
        case .shapes:
            let sub = isToolActive ? (toolRailState?.shapeSubTool ?? .rect) : .rect
            switch sub {
            case .rect:
                VooIconFactory.drawRect(in: glyphRect, color: iconColor)
            case .ellipse:
                VooIconFactory.drawEllipse(in: glyphRect, color: iconColor)
            case .line:
                VooIconFactory.drawLine(in: glyphRect, color: iconColor)
            case .polygon:
                VooIconFactory.drawPolygon(in: glyphRect, color: iconColor)
            case .star:
                VooIconFactory.drawStar(in: glyphRect, color: iconColor)
            case .arrow:
                VooIconFactory.drawArrow(in: glyphRect, color: iconColor)
            }
        case .brush:
            let sub = toolRailState?.selectionSubTool ?? .marqueeRect
            switch sub {
            case .marqueeRect:
                // The native `.brush` tool paints (`activeTool == .brush`), so its
                // glyph is Lucide `brush` (paintbrush), not the old marquee square
                // with a floating pointer.
                VooIconFactory.draw(.brush, in: glyphRect, color: iconColor)
            case .lassoFree:
                VooIconFactory.draw(.lasso, in: glyphRect, color: iconColor)
            }
        case .eraser:
            VooIconFactory.draw(.eraser, in: glyphRect, color: iconColor)
        case .text:
            VooIconFactory.draw(.text, in: glyphRect, color: iconColor)
        case .artboard:
            // Lucide `scan`: an artboard/frame boundary with corner brackets (a 3D
            // cube is the object tool's glyph, not the artboard's).
            VooIconFactory.drawFrame(in: glyphRect, color: iconColor)
        }

        // Family menus occupy a centred 14pt target along the bottom edge.
        if hasSubtools && menuTrigger == nil {
            let chevronColor: NSColor =
                isToolActive
                ? NSColor(white: 0, alpha: 0.65)
                : ((isHighlighted || isHovered) ? NSColor.white : NSColor(white: 1.0, alpha: 0.40))
            let chevronY = isFlipped ? b.maxY - 12 : b.minY + 2
            let chevronRect = CGRect(x: b.midX - 5, y: chevronY, width: 10, height: 10)
            VooIconFactory.drawChevronDown(in: chevronRect, color: chevronColor, strokeWidth: 1.2)
        }
    }
}

// MARK: - Rail-only Lucide glyph geometry

/// Geometry for the few Lucide paths the shared icon table does not carry.
/// Authored on the canonical 24×24 box (SVG y-down coordinates) so it renders
/// upright in both flipped (`NSButton`) and unflipped contexts.
enum RailGlyphDrawing {
    case crop
    case squareDashed
    case artboard

    static func draw(
        _ glyph: RailGlyphDrawing,
        in rect: CGRect,
        color: NSColor,
        strokeWidth: CGFloat = 1.5
    ) {
        VooIconFactory.withCanonicalCanvas(in: rect, color: color, strokeWidth: strokeWidth) { ctx in
            for path in paths(for: glyph) {
                ctx.addPath(path)
                ctx.strokePath()
            }
        }
    }

    private static func paths(for glyph: RailGlyphDrawing) -> [CGPath] {
        switch glyph {
        case .crop:
            // lucide `crop`: M6 2v14a2 2 0 0 0 2 2h14 / M18 22V8a2 2 0 0 0-2-2H2
            return [
                path { p in
                    p.move(to: CGPoint(x: 6, y: 2))
                    p.addLine(to: CGPoint(x: 6, y: 16))
                    p.addQuadCurve(to: CGPoint(x: 8, y: 18), control: CGPoint(x: 6, y: 18))
                    p.addLine(to: CGPoint(x: 22, y: 18))
                },
                path { p in
                    p.move(to: CGPoint(x: 18, y: 22))
                    p.addLine(to: CGPoint(x: 18, y: 8))
                    p.addQuadCurve(to: CGPoint(x: 16, y: 6), control: CGPoint(x: 18, y: 6))
                    p.addLine(to: CGPoint(x: 2, y: 6))
                }
            ]
        case .squareDashed:
            // lucide `square-dashed`: four rounded corner arcs + eight dash marks.
            var result: [CGPath] = []
            result.append(path { p in
                p.move(to: CGPoint(x: 5, y: 3))
                p.addQuadCurve(to: CGPoint(x: 3, y: 5), control: CGPoint(x: 3, y: 3))
            })
            result.append(path { p in
                p.move(to: CGPoint(x: 19, y: 3))
                p.addQuadCurve(to: CGPoint(x: 21, y: 5), control: CGPoint(x: 21, y: 3))
            })
            result.append(path { p in
                p.move(to: CGPoint(x: 21, y: 19))
                p.addQuadCurve(to: CGPoint(x: 19, y: 21), control: CGPoint(x: 21, y: 21))
            })
            result.append(path { p in
                p.move(to: CGPoint(x: 5, y: 21))
                p.addQuadCurve(to: CGPoint(x: 3, y: 19), control: CGPoint(x: 3, y: 21))
            })
            let dashes: [(CGPoint, CGPoint)] = [
                (CGPoint(x: 9, y: 3), CGPoint(x: 10, y: 3)),
                (CGPoint(x: 9, y: 21), CGPoint(x: 10, y: 21)),
                (CGPoint(x: 14, y: 3), CGPoint(x: 15, y: 3)),
                (CGPoint(x: 14, y: 21), CGPoint(x: 15, y: 21)),
                (CGPoint(x: 3, y: 9), CGPoint(x: 3, y: 10)),
                (CGPoint(x: 21, y: 9), CGPoint(x: 21, y: 10)),
                (CGPoint(x: 3, y: 14), CGPoint(x: 3, y: 15)),
                (CGPoint(x: 21, y: 14), CGPoint(x: 21, y: 15))
            ]
            for (start, end) in dashes {
                result.append(path { p in
                    p.move(to: start)
                    p.addLine(to: end)
                })
            }
            return result
        case .artboard:
            // lucide `scan`: four corner brackets.
            return [
                path { p in
                    p.move(to: CGPoint(x: 3, y: 7))
                    p.addLine(to: CGPoint(x: 3, y: 5))
                    p.addQuadCurve(to: CGPoint(x: 5, y: 3), control: CGPoint(x: 3, y: 3))
                    p.addLine(to: CGPoint(x: 7, y: 3))
                },
                path { p in
                    p.move(to: CGPoint(x: 17, y: 3))
                    p.addLine(to: CGPoint(x: 19, y: 3))
                    p.addQuadCurve(to: CGPoint(x: 21, y: 5), control: CGPoint(x: 21, y: 3))
                    p.addLine(to: CGPoint(x: 21, y: 7))
                },
                path { p in
                    p.move(to: CGPoint(x: 21, y: 17))
                    p.addLine(to: CGPoint(x: 21, y: 19))
                    p.addQuadCurve(to: CGPoint(x: 19, y: 21), control: CGPoint(x: 21, y: 21))
                    p.addLine(to: CGPoint(x: 17, y: 21))
                },
                path { p in
                    p.move(to: CGPoint(x: 7, y: 21))
                    p.addLine(to: CGPoint(x: 5, y: 21))
                    p.addQuadCurve(to: CGPoint(x: 3, y: 19), control: CGPoint(x: 3, y: 21))
                    p.addLine(to: CGPoint(x: 3, y: 17))
                }
            ]
        }
    }

    private static func path(_ build: (CGMutablePath) -> Void) -> CGPath {
        let p = CGMutablePath()
        build(p)
        return p
    }
}

// MARK: - Extra Rail Tools (hand / lasso / magic wand)

public enum ToolRailAccessory: String, CaseIterable, Sendable {
    case hand
    case lasso
    case wand
    case fill
    case healing
    case crop
    case marquee

    public var displayName: String {
        switch self {
        case .hand: return "Hand (Pan)"
        case .lasso: return "Lasso Select"
        case .wand: return "Magic Wand"
        case .fill: return NativeToolbarCopy.text(.fill)
        case .healing: return NativeToolbarCopy.text(.healing)
        case .crop: return NativeToolbarCopy.text(.crop)
        case .marquee: return NativeToolbarCopy.text(.selection)
        }
    }

    public var accessibilityIdentifier: String {
        switch self {
        case .hand: return "ToolRail.Hand"
        case .lasso: return "ToolRail.Lasso"
        case .wand: return "ToolRail.Wand"
        case .fill: return "ToolRail.Fill"
        case .healing: return "ToolRail.Healing"
        case .crop: return "ToolRail.Crop"
        case .marquee: return "ToolRail.Marquee"
        }
    }
}

public final class ToolRailAccessoryButton: NSButton {
    public let accessory: ToolRailAccessory
    public var isAccessoryActive: Bool = false {
        didSet { if oldValue != isAccessoryActive { needsDisplay = true } }
    }
    public var onClick: (() -> Void)?
    private var isHovered = false

    public init(accessory: ToolRailAccessory) {
        self.accessory = accessory
        // Rail buttons are 44×44 to match the web `h-11 w-11` tool buttons.
        super.init(frame: NSRect(x: 0, y: 0, width: 44, height: 44))
        self.title = ""
        self.isBordered = false
        self.focusRingType = .none
        self.target = self
        self.action = #selector(handleClick)
        self.toolTip = accessory.displayName
        self.setAccessibilityIdentifier(accessory.accessibilityIdentifier)
        self.setAccessibilityRole(.button)
        self.setAccessibilityLabel(accessory.displayName)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() { onClick?() }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways], owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let b = bounds
        let circleSize: CGFloat = 44
        let circleRect = CGRect(x: (b.width - circleSize) / 2, y: (b.height - circleSize) / 2,
                                width: circleSize, height: circleSize)
        if isAccessoryActive {
            ctx.setFillColor((accessory == .healing ? NSColor(hex: "E5B2FF") : .white).cgColor)
            ctx.fillEllipse(in: circleRect)
        } else if isHovered {
            // Web: `hover:bg-neutral-800` (#262626).
            ctx.setFillColor(NSColor(white: 0.15, alpha: 1.0).cgColor)
            ctx.fillEllipse(in: circleRect)
        }
        let color: NSColor = isAccessoryActive ? .black : (isHovered ? NSColor(white: 0.96, alpha: 1.0) : NSColor(white: 0.64, alpha: 1.0))
        let glyph = CGRect(x: b.midX - 8, y: b.midY - 8, width: 16, height: 16)
        // Exact Lucide geometry from the shared icon table (hand / wand-2). The
        // rail's slot 4 is the selection family and shows Lucide's dashed marquee
        // square (`square-dashed`, no floating pointer) like the web rail.
        switch accessory {
        case .hand:
            VooIconFactory.draw(.hand, in: glyph, color: color, strokeWidth: 1.5)
        case .lasso:
            VooIconFactory.draw(.lasso, in: glyph, color: color, strokeWidth: 1.5)
        case .marquee:
            RailGlyphDrawing.draw(.squareDashed, in: glyph, color: color)
        case .wand:
            VooIconFactory.draw(.wand, in: glyph, color: color, strokeWidth: 1.5)
        case .crop:
            RailGlyphDrawing.draw(.crop, in: glyph, color: color)
        case .fill:
            NativeToolbarGlyphs.drawBucket(in: glyph, color: color)
        case .healing:
            NativeToolbarGlyphs.drawHealing(
                in: glyph,
                color: isAccessoryActive ? .black : NSColor(hex: "E5B2FF"))
        }
        if accessory == .marquee || accessory == .fill || accessory == .healing {
            let caretY = isFlipped ? b.maxY - 12 : b.minY + 2
            VooIconFactory.drawChevronDown(
                in: CGRect(x: b.midX - 5, y: caretY, width: 10, height: 10),
                color: NSColor(hex: "a3a3a3"), strokeWidth: 1.2)
        }
    }
}

// MARK: - Rail Divider (1×20, white/12)

/// The thin divider between the tool cluster and the trailing VOO medallion.
public final class ToolRailDividerView: NSView {
    public static let preferredHeight: CGFloat = 20.0

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
        ctx.fill(CGRect(x: 0, y: (bounds.height - ToolRailDividerView.preferredHeight) / 2.0, width: bounds.width, height: ToolRailDividerView.preferredHeight))
    }
}

// MARK: - VOO Brand Avatar Button (AI entry point inside the pill)

public final class ToolRailBrandAvatarButton: NSButton {
    public var onClick: (() -> Void)?
    public var hovered: Bool = false {
        didSet { if oldValue != hovered { needsDisplay = true } }
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        self.title = ""
        self.isBordered = false
        self.focusRingType = .none
        self.target = self
        self.action = #selector(handleClick)
        self.setAccessibilityIdentifier("ToolRail.BrandAvatar")
        self.setAccessibilityRole(.button)
        self.setAccessibilityLabel("VOO Assistant")
        self.toolTip = "VOO 智能助手"
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() { onClick?() }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways], owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) { hovered = true }
    public override func mouseExited(with event: NSEvent) { hovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let circle = bounds.insetBy(dx: 0.5, dy: 0.5)
        // Web rail's trailing medallion: a white circle with the black VOO mark
        // (same treatment as the bottom-right AI FAB). Slight dim on hover.
        let white = hovered
            ? (NSColor.white.blended(withFraction: 0.14, of: NSColor(white: 0.0, alpha: 1.0)) ?? NSColor.white)
            : NSColor.white
        ctx.setFillColor(white.cgColor)
        ctx.fillEllipse(in: circle)
        let logoDiameter: CGFloat = 24.0
        let logoRect = CGRect(
            x: bounds.midX - logoDiameter / 2.0,
            y: bounds.midY - logoDiameter / 2.0,
            width: logoDiameter,
            height: logoDiameter
        )
        VooIconFactory.drawBrandLogo(in: logoRect, color: .black)
    }
}

// MARK: - ToolRail View (Floating Horizontal Pill Toolbar)

public final class ToolRailView: NSView {
    // MARK: Web parity metrics
    //
    // Container: `absolute top-[14px] left-1/2 -translate-x-1/2` (top inset 14 is
    // applied by the host's constraint).
    // Pill:      `flex items-center gap-1 rounded-full border border-white/10
    //             bg-black/90 p-1.5`  -> padding 6, gap 4, radius full.
    // Button:    `h-11 w-11 rounded-full p-0` -> 44x44, icon 16.
    // The border adds 1pt outside the 6pt padding on every edge.
    public static let buttonSize: CGFloat = 44.0
    public static let itemGap: CGFloat = 4.0
    public static let horizontalPadding: CGFloat = 7.0
    public static let pillHeight: CGFloat = 58.0
    public static let entryCount: Int = 12
    public static let dividerWidth: CGFloat = 1.0
    public static let avatarSize: CGFloat = 44.0

    /// Twelve 44pt tools, eleven 4pt gaps, plus padding and the border.
    public static var preferredWidth: CGFloat {
        horizontalPadding * 2
            + buttonSize * CGFloat(entryCount)
            + itemGap * CGFloat(entryCount - 1)
    }

    public let state: ToolRailState
    let familyMenuHover = NativeToolMenuHover()
    public weak var delegate: StudioDelegate?

    public private(set) var toolButtons: [StudioToolType: ToolButton] = [:]
    public private(set) var accessoryButtons: [ToolRailAccessory: ToolRailAccessoryButton] = [:]
    public var onAccessoryAction: ((ToolRailAccessory) -> Void)?
    /// Web rail's trailing brand medallion; opens the AI agent panel.
    public let brandAvatarButton = ToolRailBrandAvatarButton(frame: NSRect(x: 0, y: 0, width: 44, height: 44))
    private let dividerView = ToolRailDividerView(frame: .zero)
    public var onBrushSettingsRequested: ((NSView) -> Void)?
    public var onBrandAvatarTapped: (() -> Void)?

    // Direct accessors for tests & legacy compatibility
    public var moveToolButton: NSButton { toolButtons[.move]! }
    public var nodeToolButton: NSButton { toolButtons[.node]! }
    public var penToolButton: NSButton { toolButtons[.pen]! }
    public var shapesToolButton: NSButton { toolButtons[.shapes]! }
    public var brushToolButton: NSButton { toolButtons[.brush]! }
    public var eraserToolButton: NSButton { toolButtons[.eraser]! }
    public var textToolButton: NSButton { toolButtons[.text]! }
    public var artboardToolButton: NSButton { toolButtons[.artboard]! }

    /// Match the web toolbar order. Node editing is a contextual operation.
    private enum RailEntry {
        case tool(StudioToolType)
        case accessory(ToolRailAccessory)
    }

    private static let orderedEntries: [RailEntry] = [
        .tool(.move),
        .accessory(.hand),
        .tool(.artboard),
        .accessory(.crop),
        .accessory(.marquee),
        .tool(.brush),
        .tool(.eraser),
        .tool(.text),
        .tool(.pen),
        .tool(.shapes),
        .accessory(.fill),
        .accessory(.healing),
    ]

    public init(state: ToolRailState = ToolRailState()) {
        self.state = state
        super.init(frame: NSRect(x: 0, y: 0, width: ToolRailView.preferredWidth, height: ToolRailView.pillHeight))
        setupView()
    }

    required init?(coder: NSCoder) {
        self.state = ToolRailState()
        super.init(coder: coder)
        setupView()
    }

    public override var intrinsicContentSize: NSSize {
        NSSize(width: ToolRailView.preferredWidth, height: ToolRailView.pillHeight)
    }

    public var preferredSize: NSSize {
        NSSize(width: ToolRailView.preferredWidth, height: ToolRailView.pillHeight)
    }

    private func setupView() {
        setAccessibilityIdentifier(AccessibilityCatalog.toolRail)
        setAccessibilityRole(.toolbar)

        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.40
        layer?.shadowRadius = 14.0
        layer?.shadowOffset = CGSize(width: 0, height: -4)

        // Bind state callbacks
        state.onActiveToolChanged = { [weak self] _ in
            self?.updateSelection()
        }

        // The rail is laid out manually in `layout()` (centred content) so the
        // pill stays correct when the host pins the derived `preferredWidth`.
        for entry in ToolRailView.orderedEntries {
            switch entry {
            case .tool(let tool):
                let btn = ToolButton(toolType: tool, toolRailState: state)
                btn.target = self
                btn.action = #selector(toolButtonClicked(_:))
                if tool == .move || tool == .pen || tool == .shapes || tool == .brush {
                    btn.hasSubtools = true
                }
                btn.onTriggerFlyout = { [weak self] button in
                    self?.showFlyout(for: button)
                }
                if tool == .pen || tool == .shapes {
                    btn.installMenuTrigger { [weak self, weak btn] in
                        guard let self, let btn else { return }
                        self.toggleFamilyMenu(for: btn)
                    }
                    btn.onHoverChanged = { [weak self, weak btn] entered in
                        guard let self, let btn else { return }
                        self.handleFamilyHover(for: btn, entered: entered)
                    }
                }
                addSubview(btn)
                toolButtons[tool] = btn
            case .accessory(let accessory):
                let button = ToolRailAccessoryButton(accessory: accessory)
                button.onClick = { [weak self] in
                    self?.onAccessoryAction?(accessory)
                }
                addSubview(button)
                accessoryButtons[accessory] = button
            }
        }

        // Node editing remains available through its shortcut and contextual
        // controls; its legacy button is not a crop-tool substitute.
        let nodeButton = ToolButton(toolType: .node, toolRailState: state)
        nodeButton.isHidden = true
        nodeButton.target = self
        nodeButton.action = #selector(toolButtonClicked(_:))
        toolButtons[.node] = nodeButton

        // The Agent has one home in the bottom-right FAB. Keep the legacy
        // callback available without adding a duplicate medallion to the rail.
        brandAvatarButton.onClick = { [weak self] in self?.onBrandAvatarTapped?() }

        updateSelection()
        needsLayout = true
    }

    public override func layout() {
        super.layout()
        let scale = min(1, bounds.width / ToolRailView.preferredWidth)
        let count = CGFloat(ToolRailView.orderedEntries.count)
        let toolRow =
            count * ToolRailView.buttonSize * scale + (count - 1) * ToolRailView.itemGap * scale
        let contentWidth = toolRow
        var x = max(ToolRailView.horizontalPadding * scale, (bounds.width - contentWidth) / 2.0)
        let y = (bounds.height - ToolRailView.buttonSize * scale) / 2.0

        for entry in ToolRailView.orderedEntries {
            let view: NSView
            switch entry {
            case .tool(let tool):
                guard let button = toolButtons[tool] else { continue }
                view = button
            case .accessory(let accessory):
                guard let button = accessoryButtons[accessory] else { continue }
                view = button
            }
            view.frame = NSRect(
                x: ceil(x), y: y, width: ToolRailView.buttonSize * scale,
                height: ToolRailView.buttonSize * scale)
            x += (ToolRailView.buttonSize + ToolRailView.itemGap) * scale
        }
    }

    @objc private func toolButtonClicked(_ sender: ToolButton) {
        familyMenuHover.cancel()
        ToolFlyoutPopover.shared.close()
        // The main button chooses the family's default; the caret opens its menu.
        if sender.toolType == .pen { state.selectPenSubTool(.pen) }
        if sender.toolType == .shapes { state.selectShapeSubTool(.rect) }
        if sender.toolType == .brush && state.activeTool == .brush {
            onBrushSettingsRequested?(sender)
            return
        }
        state.selectTool(sender.toolType)
        updateSelection()
        delegate?.didSelectTool(sender.toolType)
    }

    func toggleFamilyMenu(for button: ToolButton) {
        familyMenuHover.cancel()
        let menu = ToolFlyoutPopover.shared
        if menu.isOpen && menu.currentTool == button.toolType {
            if menu.isHoverOpened { menu.pin() } else { menu.close() }
        } else {
            showFlyout(for: button)
        }
    }

    func handleFamilyHover(for button: ToolButton, entered: Bool) {
        let menu = ToolFlyoutPopover.shared
        familyMenuHover.cancel()
        if entered {
            guard !menu.isOpen || menu.currentTool != button.toolType else { return }
            familyMenuHover.schedule(after: NativeToolMenuHover.openDelay) {
                [weak self, weak button] in
                guard let self, let button else { return }
                self.showFlyout(for: button, openedByHover: true)
            }
        } else if menu.isHoverOpened && menu.currentTool == button.toolType {
            scheduleFamilyMenuClose()
        }
    }

    private func scheduleFamilyMenuClose() {
        familyMenuHover.schedule(after: NativeToolMenuHover.closeDelay) {
            ToolFlyoutPopover.shared.close()
        }
    }

    public func showFlyout(for button: ToolButton, openedByHover: Bool = false) {
        if button.toolType == .brush {
            onBrushSettingsRequested?(button)
            return
        }
        let currentSub: String
        switch button.toolType {
        case .pen: currentSub = state.activeTool == .pen ? state.currentPenSubTool : ""
        case .shapes: currentSub = state.activeTool == .shapes ? state.shapeSubTool.rawValue : ""
        case .brush: currentSub = state.selectionSubTool.rawValue
        default: currentSub = ""
        }

        ToolFlyoutPopover.shared.onPenSubToolSelected = { [weak self] sub in
            guard let self = self else { return }
            self.state.selectPenSubTool(sub)
            self.state.selectTool(.pen)
            self.updateSelection()
            self.delegate?.didSelectTool(.pen)
        }
        ToolFlyoutPopover.shared.onShapeSubToolSelected = { [weak self] sub in
            guard let self = self else { return }
            self.state.selectShapeSubTool(sub)
            self.state.selectTool(.shapes)
            self.updateSelection()
            self.delegate?.didSelectTool(.shapes)
        }
        ToolFlyoutPopover.shared.onSelectionSubToolSelected = { [weak self] sub in
            guard let self = self else { return }
            self.state.selectSelectionSubTool(sub)
            self.toolButtons[.brush]?.needsDisplay = true
        }

        let menu = ToolFlyoutPopover.shared
        menu.onClosed = { [weak self] in
            guard let self else { return }
            self.familyMenuHover.cancel()
            for button in self.toolButtons.values { button.setMenuExpanded(false) }
        }
        menu.onPointerEntered = { [weak self] in self?.familyMenuHover.cancel() }
        menu.onPointerExited = { [weak self] in
            if menu.isHoverOpened { self?.scheduleFamilyMenuClose() }
        }
        menu.show(
            for: button.toolType, relativeTo: button, currentSelection: currentSub,
            openedByHover: openedByHover)
        button.setMenuExpanded(menu.isOpen)
    }

    public func updateSelection() {
        for (tool, btn) in toolButtons {
            btn.isToolActive = (tool == state.activeTool)
            let sub: String?
            switch tool {
            case .pen: sub = btn.isToolActive ? state.currentPenSubTool : "pen"
            case .shapes: sub = btn.isToolActive ? state.shapeSubTool.rawValue : "rect"
            default: sub = nil
            }
            if let sub {
                let title = NativeToolMenuModel.title(sub)
                btn.setAccessibilityLabel(title)
                btn.toolTip = title
            }
            btn.needsDisplay = true
        }
    }

    public func setAccessoryActive(_ accessory: ToolRailAccessory?) {
        for (tool, button) in toolButtons {
            button.isToolActive = accessory == nil && tool == state.activeTool
        }
        for (key, button) in accessoryButtons {
            button.isAccessoryActive = (key == accessory)
        }
    }

    public var handButton: ToolRailAccessoryButton? { accessoryButtons[.hand] }
    public var lassoButton: ToolRailAccessoryButton? { accessoryButtons[.lasso] }
    public var wandButton: ToolRailAccessoryButton? { accessoryButtons[.wand] }
    public var marqueeButton: ToolRailAccessoryButton? { accessoryButtons[.marquee] }
    public var cropButton: ToolRailAccessoryButton? { accessoryButtons[.crop] }
    public var fillButton: ToolRailAccessoryButton? { accessoryButtons[.fill] }
    public var healingButton: ToolRailAccessoryButton? { accessoryButtons[.healing] }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Floating Pill Chrome (web: `rounded-full border border-white/10 bg-black/90`)
        let pillRadius = bounds.height / 2.0
        let path = CGPath(
            roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), cornerWidth: pillRadius,
            cornerHeight: pillRadius, transform: nil)

        // Background: black/90
        ctx.setFillColor(NSColor.black.withAlphaComponent(0.90).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // Border: 1px solid rgba(255, 255, 255, 0.10)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.10).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }
}
