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
    case pen = "pen"  // Standard Bezier Pen (P)
    case curvature = "curvature"  // Curvature Pen (P)
    case pencil = "pencil"  // Freehand Pencil (⇧P)

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
    case rect = "rect"  // Rectangle (R)
    case ellipse = "ellipse"  // Ellipse (O)
    case line = "line"  // Line (L)
    case polygon = "polygon"  // Polygon (6-sided)
    case star = "star"  // Star (5-point)
    case arrow = "arrow"  // Arrow (⇧L)

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
    case marqueeRect = "marqueeRect"  // Rectangular Marquee (M)
    case lassoFree = "lassoFree"  // Freeform Lasso (L)

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

    public init(
        id: String, title: String, shortcut: String, iconName: String, isSelected: Bool = false
    ) {
        self.id = id
        self.title = title
        self.shortcut = shortcut
        self.iconName = iconName
        self.isSelected = isSelected
    }
}

// MARK: - Tool Family Menu Controller

public final class ToolFlyoutPopover: NSObject {
    public static let shared = ToolFlyoutPopover()
    private let presenter = NativeToolMenuPresenter()
    public private(set) var isOpen = false
    public private(set) var isHoverOpened = false
    public private(set) var currentTool: StudioToolType?
    public private(set) var menuView: ToolFlyoutContentView?
    public var onPenSubToolSelected: ((PenSubTool) -> Void)?
    public var onShapeSubToolSelected: ((ShapeSubTool) -> Void)?
    public var onSelectionSubToolSelected: ((SelectionSubTool) -> Void)?
    var onPointerEntered: (() -> Void)?
    var onPointerExited: (() -> Void)?
    var onClosed: (() -> Void)?

    public func show(
        for tool: StudioToolType, relativeTo anchor: NSView,
        currentSelection: String = "", openedByHover: Bool = false
    ) {
        close()
        let items = NativeToolMenuModel.items(for: tool, selection: currentSelection)
        guard !items.isEmpty else { return }
        let content = ToolFlyoutContentView(
            items: items,
            width: NativeToolMenuModel.width(for: items))
        content.onSelectSubTool = { [weak self] id in self?.selectItem(id: id) }
        content.onPointerEntered = { [weak self] in self?.onPointerEntered?() }
        content.onPointerExited = { [weak self] in self?.onPointerExited?() }
        menuView = content
        currentTool = tool
        isOpen = true
        isHoverOpened = openedByHover
        presenter.onDismiss = { [weak self] focus in self?.close(restoreFocus: focus) }
        presenter.show(content: content, anchor: anchor, focus: !openedByHover)
        if !openedByHover { content.focusFirstItem() }
    }

    @discardableResult
    public func selectItem(id: String) -> Bool {
        guard let tool = currentTool,
            menuView?.rows.contains(where: { $0.item.id == id }) == true
        else { return false }
        switch tool {
        case .pen:
            guard let sub = PenSubTool(rawValue: id) else { return false }
            onPenSubToolSelected?(sub)
        case .shapes:
            guard let sub = ShapeSubTool(rawValue: id) else { return false }
            onShapeSubToolSelected?(sub)
        default: return false
        }
        close()
        return true
    }

    func pin() {
        guard isOpen else { return }
        isHoverOpened = false
        presenter.focusFirstItem()
        menuView?.focusFirstItem()
    }

    public func close(restoreFocus: Bool = false) {
        presenter.close(restoreFocus: restoreFocus)
        isOpen = false
        isHoverOpened = false
        currentTool = nil
        menuView = nil
        onClosed?()
    }

    public func handleEscape() -> Bool {
        guard isOpen else { return false }
        close(restoreFocus: true)
        return true
    }

    public func handleOutsideClick(clickPoint: CGPoint, flyoutFrame: CGRect) -> Bool {
        guard isOpen, !flyoutFrame.contains(clickPoint) else { return false }
        close()
        return true
    }
}
