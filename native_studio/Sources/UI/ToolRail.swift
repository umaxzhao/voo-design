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
        case .node: return "Frame (Crop)"
        case .pen: return "Pen"
        case .shapes: return "Shapes"
        case .brush: return "Brush"
        case .eraser: return "Eraser"
        case .text: return "Text"
        case .artboard: return "3D / Artboard"
        }
    }

    public var defaultShortcut: Character? {
        switch self {
        case .move: return "V"
        case .node: return "F"
        case .pen: return "P"
        case .shapes: return "R"
        case .brush: return "B"
        case .eraser: return "E"
        case .text: return "T"
        case .artboard: return "A"
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
            activeTool = .node
            matched = .node
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
            activeTool = .artboard
            matched = .artboard
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
        super.init(frame: NSRect(x: 0, y: 0, width: 36, height: 36))
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

        let circleSize: CGFloat = 36.0
        let circleRect = CGRect(x: (b.width - circleSize) / 2.0, y: (b.height - circleSize) / 2.0, width: circleSize, height: circleSize)

        // 1. Background Fill
        if isToolActive {
            // Iconic VOO signature: Active tool is pure white circular pill!
            ctx.setFillColor(NSColor.white.cgColor)
            ctx.fillEllipse(in: circleRect)
        } else if isHighlighted {
            // Hover state: subtle wash
            ctx.setFillColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
            ctx.fillEllipse(in: circleRect)
        }

        // 2. Vector Icon Glyph Drawing
        let iconColor: NSColor = isToolActive ? .black : (isHighlighted ? .white : NSColor(white: 0.65, alpha: 1.0))
        let glyphRect = CGRect(x: b.midX - 8, y: b.midY - 8, width: 16, height: 16)

        switch toolType {
        case .move:
            VooIconFactory.drawCursor(in: glyphRect, color: iconColor, isSolid: isToolActive)
        case .node:
            VooIconFactory.drawFrame(in: glyphRect, color: iconColor)
        case .pen:
            let sub = toolRailState?.penSubTool ?? .pen
            switch sub {
            case .pen:
                VooIconFactory.drawPen(in: glyphRect, color: iconColor)
            case .curvature:
                VooIconFactory.drawCurvaturePen(in: glyphRect, color: iconColor)
            case .pencil:
                VooIconFactory.drawPencil(in: glyphRect, color: iconColor)
            }
        case .shapes:
            let sub = toolRailState?.shapeSubTool ?? .rect
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
                VooIconFactory.drawMarquee(in: glyphRect, color: iconColor)
            case .lassoFree:
                VooIconFactory.drawLasso(in: glyphRect, color: iconColor)
            }
        case .eraser:
            VooIconFactory.drawEraser(in: glyphRect, color: iconColor)
        case .text:
            VooIconFactory.drawText(in: glyphRect, color: iconColor)
        case .artboard:
            VooIconFactory.drawCube(in: glyphRect, color: iconColor)
        }

        // 3. Chevron Down Indicator
        if hasSubtools {
            let chevronColor: NSColor = isToolActive ? NSColor(white: 0, alpha: 0.65) : (isHighlighted ? NSColor.white : NSColor(white: 1.0, alpha: 0.40))
            let chevronRect = CGRect(x: b.maxX - 9, y: b.minY + 4, width: 6, height: 6)
            VooIconFactory.drawChevronDown(in: chevronRect, color: chevronColor, strokeWidth: 1.2)
        }
    }
}

// MARK: - Extra Rail Tools (hand / lasso / magic wand)

public enum ToolRailAccessory: String, CaseIterable, Sendable {
    case hand
    case lasso
    case wand

    public var displayName: String {
        switch self {
        case .hand: return "Hand (Pan)"
        case .lasso: return "Lasso Select"
        case .wand: return "Magic Wand"
        }
    }

    public var accessibilityIdentifier: String {
        switch self {
        case .hand: return "ToolRail.Hand"
        case .lasso: return "ToolRail.Lasso"
        case .wand: return "ToolRail.Wand"
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
        super.init(frame: NSRect(x: 0, y: 0, width: 36, height: 36))
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
        let circleSize: CGFloat = 36
        let circleRect = CGRect(x: (b.width - circleSize) / 2, y: (b.height - circleSize) / 2,
                                width: circleSize, height: circleSize)
        if isAccessoryActive {
            ctx.setFillColor(NSColor.white.cgColor)
            ctx.fillEllipse(in: circleRect)
        } else if isHovered {
            ctx.setFillColor(NSColor(white: 1.0, alpha: 0.10).cgColor)
            ctx.fillEllipse(in: circleRect)
        }
        let color: NSColor = isAccessoryActive ? .black : NSColor(white: 0.68, alpha: 1.0)
        let glyph = CGRect(x: b.midX - 8, y: b.midY - 8, width: 16, height: 16)
        ctx.setStrokeColor(color.cgColor)
        ctx.setFillColor(color.cgColor)
        ctx.setLineWidth(1.5)
        ctx.setLineCap(.round)
        switch accessory {
        case .hand:
            let palm = CGPath(roundedRect: glyph.insetBy(dx: 3, dy: 5), cornerWidth: 4, cornerHeight: 4, transform: nil)
            ctx.addPath(palm)
            ctx.strokePath()
            for index in 0..<3 {
                let x = glyph.minX + 4 + CGFloat(index) * 3.4
                ctx.move(to: CGPoint(x: x, y: glyph.maxY - 2))
                ctx.addLine(to: CGPoint(x: x, y: glyph.maxY - 5))
            }
            ctx.strokePath()
        case .lasso:
            ctx.strokeEllipse(in: glyph.insetBy(dx: 1, dy: 4))
            ctx.move(to: CGPoint(x: glyph.minX + 4, y: glyph.maxY - 5))
            ctx.addLine(to: CGPoint(x: glyph.midX - 2, y: glyph.maxY - 1))
            ctx.strokePath()
        case .wand:
            ctx.move(to: CGPoint(x: glyph.minX + 2, y: glyph.minY + 2))
            ctx.addLine(to: CGPoint(x: glyph.maxX - 5, y: glyph.maxY - 5))
            ctx.strokePath()
            for point in [CGPoint(x: glyph.maxX - 2, y: glyph.maxY - 8),
                          CGPoint(x: glyph.maxX - 7, y: glyph.maxY - 1)] {
                ctx.move(to: CGPoint(x: point.x - 2, y: point.y))
                ctx.addLine(to: CGPoint(x: point.x + 2, y: point.y))
                ctx.move(to: CGPoint(x: point.x, y: point.y - 2))
                ctx.addLine(to: CGPoint(x: point.x, y: point.y + 2))
            }
            ctx.strokePath()
        }
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
        let circle = bounds.insetBy(dx: 1, dy: 1)
        if hovered {
            ctx.setFillColor(NSColor(white: 1.0, alpha: 0.10).cgColor)
            ctx.fillEllipse(in: circle)
        }
        // Solid dark circular medallion with white VOO mark, mirroring the web rail.
        ctx.setFillColor(NSColor(white: 0.06, alpha: 1.0).cgColor)
        ctx.fillEllipse(in: circle)
        let logoRect = CGRect(x: bounds.midX - 8, y: bounds.midY - 8, width: 16, height: 16)
        VooIconFactory.drawBrandLogo(in: logoRect, color: .white)
    }
}

// MARK: - ToolRail View (Floating Horizontal Pill Toolbar)

public final class ToolRailView: NSView {
    public let state: ToolRailState
    public weak var delegate: StudioDelegate?

    public private(set) var toolButtons: [StudioToolType: ToolButton] = [:]
    public private(set) var accessoryButtons: [ToolRailAccessory: ToolRailAccessoryButton] = [:]
    public var onAccessoryAction: ((ToolRailAccessory) -> Void)?
    public let brandAvatarButton = ToolRailBrandAvatarButton()
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

    public init(state: ToolRailState = ToolRailState()) {
        self.state = state
        super.init(frame: NSRect(x: 0, y: 0, width: 512, height: 48))
        setupView()
    }

    required init?(coder: NSCoder) {
        self.state = ToolRailState()
        super.init(coder: coder)
        setupView()
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
        state.onActiveToolChanged = { [weak self] newTool in
            self?.updateSelection()
        }

        // Horizontal pill layout matching VOO Design 1:1:
        // Move -> Frame -> Marquee -> Pen -> Eraser -> Text -> Shapes -> 3D Cube
        let orderedTools: [StudioToolType] = [.move, .node, .brush, .pen, .eraser, .text, .shapes, .artboard]
        var previousAnchor = leadingAnchor
        var leadOffset: CGFloat = 6.0

        for tool in orderedTools {
            let btn = ToolButton(toolType: tool, toolRailState: state)
            btn.translatesAutoresizingMaskIntoConstraints = false
            btn.target = self
            btn.action = #selector(toolButtonClicked(_:))
            if tool == .pen || tool == .shapes || tool == .brush {
                btn.hasSubtools = true
            }
            btn.onTriggerFlyout = { [weak self] button in
                self?.showFlyout(for: button)
            }
            addSubview(btn)
            toolButtons[tool] = btn

            NSLayoutConstraint.activate([
                btn.leadingAnchor.constraint(equalTo: previousAnchor, constant: leadOffset),
                btn.centerYAnchor.constraint(equalTo: centerYAnchor),
                btn.widthAnchor.constraint(equalToConstant: 36),
                btn.heightAnchor.constraint(equalToConstant: 36)
            ])

            previousAnchor = btn.trailingAnchor
            leadOffset = 4.0
        }

        // One extra 8pt group gap before the accessory cluster.
        leadOffset = 8.0

        // Extra web-rail tools: hand / lasso / magic wand
        for accessory in ToolRailAccessory.allCases {
            let button = ToolRailAccessoryButton(accessory: accessory)
            button.translatesAutoresizingMaskIntoConstraints = false
            button.onClick = { [weak self] in
                self?.onAccessoryAction?(accessory)
            }
            addSubview(button)
            accessoryButtons[accessory] = button
            NSLayoutConstraint.activate([
                button.leadingAnchor.constraint(equalTo: previousAnchor, constant: leadOffset),
                button.centerYAnchor.constraint(equalTo: centerYAnchor),
                button.widthAnchor.constraint(equalToConstant: 36),
                button.heightAnchor.constraint(equalToConstant: 36)
            ])
            previousAnchor = button.trailingAnchor
            leadOffset = 4.0
        }

        // Divider + VOO avatar medallion anchoring the right edge of the rail
        let divider = NSView()
        divider.translatesAutoresizingMaskIntoConstraints = false
        divider.wantsLayer = true
        divider.layer?.backgroundColor = NSColor(white: 1.0, alpha: 0.12).cgColor
        addSubview(divider)
        NSLayoutConstraint.activate([
            divider.leadingAnchor.constraint(equalTo: previousAnchor, constant: 8),
            divider.centerYAnchor.constraint(equalTo: centerYAnchor),
            divider.widthAnchor.constraint(equalToConstant: 1),
            divider.heightAnchor.constraint(equalToConstant: 20)
        ])

        brandAvatarButton.translatesAutoresizingMaskIntoConstraints = false
        brandAvatarButton.onClick = { [weak self] in
            self?.onBrandAvatarTapped?()
        }
        addSubview(brandAvatarButton)
        NSLayoutConstraint.activate([
            brandAvatarButton.leadingAnchor.constraint(equalTo: divider.trailingAnchor, constant: 8),
            brandAvatarButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            brandAvatarButton.widthAnchor.constraint(equalToConstant: 36),
            brandAvatarButton.heightAnchor.constraint(equalToConstant: 36),
            brandAvatarButton.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -12)
        ])

        updateSelection()
    }

    @objc private func toolButtonClicked(_ sender: ToolButton) {
        if state.activeTool == sender.toolType && sender.hasSubtools {
            showFlyout(for: sender)
            return
        }
        state.selectTool(sender.toolType)
        updateSelection()
        delegate?.didSelectTool(sender.toolType)
    }

    public func showFlyout(for button: ToolButton) {
        let currentSub: String
        switch button.toolType {
        case .pen: currentSub = state.currentPenSubTool
        case .shapes: currentSub = state.shapeSubTool.rawValue
        case .brush: currentSub = state.selectionSubTool.rawValue
        default: currentSub = ""
        }

        ToolFlyoutPopover.shared.onPenSubToolSelected = { [weak self] sub in
            guard let self = self else { return }
            self.state.selectPenSubTool(sub)
            self.toolButtons[.pen]?.needsDisplay = true
        }
        ToolFlyoutPopover.shared.onShapeSubToolSelected = { [weak self] sub in
            guard let self = self else { return }
            self.state.selectShapeSubTool(sub)
            self.toolButtons[.shapes]?.needsDisplay = true
        }
        ToolFlyoutPopover.shared.onSelectionSubToolSelected = { [weak self] sub in
            guard let self = self else { return }
            self.state.selectSelectionSubTool(sub)
            self.toolButtons[.brush]?.needsDisplay = true
        }

        ToolFlyoutPopover.shared.show(for: button.toolType, relativeTo: button, currentSelection: currentSub)
    }

    public func updateSelection() {
        for (tool, btn) in toolButtons {
            btn.isToolActive = (tool == state.activeTool)
            btn.needsDisplay = true
        }
    }

    public func setAccessoryActive(_ accessory: ToolRailAccessory?) {
        for (key, button) in accessoryButtons {
            button.isAccessoryActive = (key == accessory)
        }
    }

    public var handButton: ToolRailAccessoryButton? { accessoryButtons[.hand] }
    public var lassoButton: ToolRailAccessoryButton? { accessoryButtons[.lasso] }
    public var wandButton: ToolRailAccessoryButton? { accessoryButtons[.wand] }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Floating Pill Chrome:
        // Capsule radius: bounds.height / 2 (22px)
        let pillRadius = bounds.height / 2.0
        let path = CGPath(roundedRect: bounds, cornerWidth: pillRadius, cornerHeight: pillRadius, transform: nil)

        // Background: rgba(18, 18, 20, 0.94)
        ctx.setFillColor(NSColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 0.94).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // Border: 1px solid rgba(255, 255, 255, 0.10)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.10).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }
}
