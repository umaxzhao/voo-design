//
//  ToolFlyoutPopover.swift
//  native_studio
//
//  Sub-tool flyout popover matching VOO Design 1:1.
//  Presents dark glass floating popover for Pen, Shapes, and Selection families.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Sub-tool Enums

public enum PenSubTool: String, CaseIterable, Sendable {
    case pen        = "pen"        // Standard Bezier Pen (P)
    case curvature  = "curvature"  // Curvature Pen (P)
    case pencil     = "pencil"     // Freehand Pencil (⇧P)

    public var displayName: String {
        switch self {
        case .pen: return "钢笔 (Pen)"
        case .curvature: return "曲率钢笔 (Curvature)"
        case .pencil: return "铅笔 (Pencil)"
        }
    }

    public var shortcut: String {
        switch self {
        case .pen: return "P"
        case .curvature: return "P"
        case .pencil: return "⇧P"
        }
    }
}

public enum ShapeSubTool: String, CaseIterable, Sendable {
    case rect       = "rect"       // Rectangle (R)
    case ellipse    = "ellipse"    // Ellipse (O)
    case line       = "line"       // Line (L)
    case polygon    = "polygon"    // Polygon (6-sided)
    case star       = "star"       // Star (5-point)
    case arrow      = "arrow"      // Arrow (⇧L)

    public var displayName: String {
        switch self {
        case .rect: return "矩形 (Rectangle)"
        case .ellipse: return "椭圆 (Ellipse)"
        case .line: return "直线 (Line)"
        case .polygon: return "多边形 (Polygon)"
        case .star: return "星形 (Star)"
        case .arrow: return "箭头 (Arrow)"
        }
    }

    public var shortcut: String {
        switch self {
        case .rect: return "R"
        case .ellipse: return "O"
        case .line: return "L"
        case .polygon: return ""
        case .star: return ""
        case .arrow: return "⇧L"
        }
    }
}

public enum SelectionSubTool: String, CaseIterable, Sendable {
    case marqueeRect   = "marqueeRect"   // Rectangular Marquee (M)
    case lassoFree     = "lassoFree"     // Freeform Lasso (L)

    public var displayName: String {
        switch self {
        case .marqueeRect: return "矩形选区 (Marquee)"
        case .lassoFree: return "自由套索 (Lasso)"
        }
    }

    public var shortcut: String {
        switch self {
        case .marqueeRect: return "M"
        case .lassoFree: return "L"
        }
    }
}

// MARK: - Tool Flyout Item

public struct ToolFlyoutItem: Sendable {
    public let id: String
    public let title: String
    public let shortcut: String
    public let iconName: String
    public let isSelected: Bool

    public init(id: String, title: String, shortcut: String, iconName: String, isSelected: Bool = false) {
        self.id = id
        self.title = title
        self.shortcut = shortcut
        self.iconName = iconName
        self.isSelected = isSelected
    }
}

// MARK: - Tool Flyout Row View

public final class ToolFlyoutRowView: NSView {
    public let item: ToolFlyoutItem
    public var onSelect: (() -> Void)?

    private var isHovered: Bool = false {
        didSet {
            if oldValue != isHovered {
                needsDisplay = true
            }
        }
    }

    public init(item: ToolFlyoutItem, width: CGFloat = 170.0, height: CGFloat = 28.0) {
        self.item = item
        super.init(frame: NSRect(x: 0, y: 0, width: width, height: height))
        self.wantsLayer = true
        setupTrackingArea()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupTrackingArea() {
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
    }

    public override func mouseUp(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        if bounds.contains(loc) {
            onSelect?()
        }
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let b = bounds

        // 1. Hover or selected background highlight
        if item.isSelected {
            ctx.setFillColor(NSColor(white: 1.0, alpha: 0.16).cgColor)
            let pillRect = b.insetBy(dx: 4, dy: 1.5)
            let path = CGPath(roundedRect: pillRect, cornerWidth: 6, cornerHeight: 6, transform: nil)
            ctx.addPath(path)
            ctx.fillPath()
        } else if isHovered {
            ctx.setFillColor(NSColor(white: 1.0, alpha: 0.08).cgColor)
            let pillRect = b.insetBy(dx: 4, dy: 1.5)
            let path = CGPath(roundedRect: pillRect, cornerWidth: 6, cornerHeight: 6, transform: nil)
            ctx.addPath(path)
            ctx.fillPath()
        }

        // 2. Icon glyph
        let iconRect = CGRect(x: 10, y: (b.height - 16) / 2.0, width: 16, height: 16)
        let iconColor = item.isSelected ? NSColor.white : (isHovered ? NSColor.white : NSColor(white: 0.82, alpha: 1.0))
        drawItemIcon(named: item.iconName, in: iconRect, color: iconColor)

        // 3. Title Text
        let titleAttrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 11.5, weight: item.isSelected ? .semibold : .regular),
            .foregroundColor: item.isSelected ? NSColor.white : (isHovered ? NSColor.white : NSColor(white: 0.88, alpha: 1.0))
        ]
        let titleStr = NSAttributedString(string: item.title, attributes: titleAttrs)
        let titleSize = titleStr.size()
        let titleRect = CGRect(x: 32, y: (b.height - titleSize.height) / 2.0, width: b.width - 70, height: titleSize.height)
        titleStr.draw(in: titleRect)

        // 4. Shortcut Text
        if !item.shortcut.isEmpty {
            let shortcutAttrs: [NSAttributedString.Key: Any] = [
                .font: ThemeFonts.mono(size: 10.0, weight: .regular),
                .foregroundColor: NSColor(white: 0.50, alpha: 1.0)
            ]
            let shortcutStr = NSAttributedString(string: item.shortcut, attributes: shortcutAttrs)
            let shortcutSize = shortcutStr.size()
            let shortcutRect = CGRect(x: b.width - shortcutSize.width - 12,
                                      y: (b.height - shortcutSize.height) / 2.0,
                                      width: shortcutSize.width,
                                      height: shortcutSize.height)
            shortcutStr.draw(in: shortcutRect)
        }
    }

    private func drawItemIcon(named name: String, in rect: CGRect, color: NSColor) {
        switch name {
        case "pen":
            VooIconFactory.drawPen(in: rect, color: color)
        case "curvature":
            VooIconFactory.drawCurvaturePen(in: rect, color: color)
        case "pencil":
            VooIconFactory.drawPencil(in: rect, color: color)
        case "rect":
            VooIconFactory.drawRect(in: rect, color: color)
        case "ellipse":
            VooIconFactory.drawEllipse(in: rect, color: color)
        case "line":
            VooIconFactory.drawLine(in: rect, color: color)
        case "polygon":
            VooIconFactory.drawPolygon(in: rect, color: color)
        case "star":
            VooIconFactory.drawStar(in: rect, color: color)
        case "arrow":
            VooIconFactory.drawArrow(in: rect, color: color)
        case "marquee":
            VooIconFactory.drawMarquee(in: rect, color: color)
        case "lasso":
            VooIconFactory.drawLasso(in: rect, color: color)
        default:
            VooIconFactory.drawShapes(in: rect, color: color)
        }
    }
}

// MARK: - Tool Flyout Content View

public final class ToolFlyoutContentView: NSView {
    public var onSelectSubTool: ((String) -> Void)?

    private let stackView = NSStackView()

    public init(items: [ToolFlyoutItem], width: CGFloat = 176.0) {
        let totalHeight = CGFloat(items.count) * 28.0 + 12.0
        super.init(frame: NSRect(x: 0, y: 0, width: width, height: totalHeight))
        wantsLayer = true

        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.orientation = .vertical
        stackView.spacing = 1.0
        stackView.alignment = .leading
        stackView.edgeInsets = NSEdgeInsets(top: 6, left: 4, bottom: 6, right: 4)
        addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: topAnchor),
            stackView.bottomAnchor.constraint(equalTo: bottomAnchor),
            stackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])

        for item in items {
            let row = ToolFlyoutRowView(item: item, width: width - 8.0, height: 28.0)
            row.translatesAutoresizingMaskIntoConstraints = false
            row.heightAnchor.constraint(equalToConstant: 28.0).isActive = true
            row.widthAnchor.constraint(equalToConstant: width - 8.0).isActive = true
            row.onSelect = { [weak self] in
                self?.onSelectSubTool?(item.id)
            }
            stackView.addArrangedSubview(row)
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let b = bounds

        // Dark glass background
        ctx.setFillColor(NSColor(red: 18/255.0, green: 18/255.0, blue: 20/255.0, alpha: 0.95).cgColor)
        let r = b.insetBy(dx: 0.5, dy: 0.5)
        let path = CGPath(roundedRect: r, cornerWidth: 10, cornerHeight: 10, transform: nil)
        ctx.addPath(path)
        ctx.fillPath()

        // 1px Subtle border
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }
}

// MARK: - Tool Flyout Popover Controller

public final class ToolFlyoutPopover: NSObject, NSPopoverDelegate {
    public static let shared = ToolFlyoutPopover()

    private var popover: NSPopover?
    public private(set) var isOpen: Bool = false
    public private(set) var currentTool: StudioToolType?

    public var onPenSubToolSelected: ((PenSubTool) -> Void)?
    public var onShapeSubToolSelected: ((ShapeSubTool) -> Void)?
    public var onSelectionSubToolSelected: ((SelectionSubTool) -> Void)?

    public override init() {
        super.init()
    }

    public func show(for tool: StudioToolType, relativeTo positioningView: NSView, currentSelection: String = "") {
        close()

        let items: [ToolFlyoutItem]
        switch tool {
        case .pen:
            items = [
                ToolFlyoutItem(id: "pen", title: "钢笔 (Pen)", shortcut: "P", iconName: "pen", isSelected: currentSelection == "pen"),
                ToolFlyoutItem(id: "curvature", title: "曲率钢笔 (Curvature)", shortcut: "P", iconName: "curvature", isSelected: currentSelection == "curvature"),
                ToolFlyoutItem(id: "pencil", title: "铅笔 (Pencil)", shortcut: "⇧P", iconName: "pencil", isSelected: currentSelection == "pencil")
            ]
        case .shapes:
            items = [
                ToolFlyoutItem(id: "rect", title: "矩形 (Rectangle)", shortcut: "R", iconName: "rect", isSelected: currentSelection == "rect" || currentSelection.isEmpty),
                ToolFlyoutItem(id: "ellipse", title: "椭圆 (Ellipse)", shortcut: "O", iconName: "ellipse", isSelected: currentSelection == "ellipse"),
                ToolFlyoutItem(id: "line", title: "直线 (Line)", shortcut: "L", iconName: "line", isSelected: currentSelection == "line"),
                ToolFlyoutItem(id: "polygon", title: "多边形 (Polygon)", shortcut: "", iconName: "polygon", isSelected: currentSelection == "polygon"),
                ToolFlyoutItem(id: "star", title: "星形 (Star)", shortcut: "", iconName: "star", isSelected: currentSelection == "star"),
                ToolFlyoutItem(id: "arrow", title: "箭头 (Arrow)", shortcut: "⇧L", iconName: "arrow", isSelected: currentSelection == "arrow")
            ]
        case .brush:
            items = [
                ToolFlyoutItem(id: "marqueeRect", title: "矩形选区 (Marquee)", shortcut: "M", iconName: "marquee", isSelected: currentSelection == "marqueeRect" || currentSelection.isEmpty),
                ToolFlyoutItem(id: "lassoFree", title: "自由套索 (Lasso)", shortcut: "L", iconName: "lasso", isSelected: currentSelection == "lassoFree")
            ]
        default:
            return
        }

        let contentView = ToolFlyoutContentView(items: items, width: 180.0)
        contentView.onSelectSubTool = { [weak self] selectedId in
            guard let self = self else { return }
            self.handleSelection(id: selectedId, for: tool)
            self.close()
        }

        let viewController = NSViewController()
        viewController.view = contentView

        let p = NSPopover()
        p.contentViewController = viewController
        p.behavior = .transient
        p.animates = true
        p.delegate = self

        guard positioningView.window != nil else {
            self.isOpen = true
            self.currentTool = tool
            return
        }

        // Position popover below the button
        p.show(relativeTo: positioningView.bounds, of: positioningView, preferredEdge: .maxY)
        self.popover = p
        self.isOpen = true
        self.currentTool = tool
    }

    private func handleSelection(id: String, for tool: StudioToolType) {
        switch tool {
        case .pen:
            if let sub = PenSubTool(rawValue: id) {
                onPenSubToolSelected?(sub)
            }
        case .shapes:
            if let sub = ShapeSubTool(rawValue: id) {
                onShapeSubToolSelected?(sub)
            }
        case .brush:
            if let sub = SelectionSubTool(rawValue: id) {
                onSelectionSubToolSelected?(sub)
            }
        default:
            break
        }
    }

    public func close() {
        popover?.performClose(nil)
        popover = nil
        isOpen = false
        currentTool = nil
    }

    public func handleEscape() -> Bool {
        guard isOpen else { return false }
        close()
        return true
    }

    public func handleOutsideClick(clickPoint: CGPoint, flyoutFrame: CGRect) -> Bool {
        guard isOpen else { return false }
        if !flyoutFrame.contains(clickPoint) {
            close()
            return true
        }
        return false
    }

    public func popoverDidClose(_ notification: Notification) {
        isOpen = false
        popover = nil
        currentTool = nil
    }
}
