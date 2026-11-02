//
//  ContextualTaskbarView.swift
//  native_studio
//
//  Floating contextual taskbar attached 10pt below or above selection bounds.
//  Provides 3 context-adaptive modes: Single Node, Multi-Selection, and Path Editing.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Taskbar Button Glyphs

public enum TaskbarGlyph: Sendable {
    case duplicate
    case flipH
    case flipV
    case lock
    case unlock
    case eye
    case eyeOff
    case copySvg
    case copyCode
    case delete
    case alignLeft
    case alignCenter
    case alignRight
    case alignTop
    case alignMiddle
    case alignBottom
    case distributeH
    case distributeV
    case group
    case ungroup
    case booleanUnion
    case booleanSubtract
    case booleanIntersect
    case booleanXor
    case booleanDivide
    case finishPath
    case deleteAnchor
    case nodeSharp
    case nodeSmooth
    case nodeSmart
    case breakCurve
    case closeCurve
    case wand
    case sparkles
}

// MARK: - Taskbar Icon Button

public final class TaskbarIconButton: NSButton {
    public let glyph: TaskbarGlyph
    public var onClick: (() -> Void)?
    public var isDanger: Bool = false

    public init(glyph: TaskbarGlyph, tooltip: String, isDanger: Bool = false) {
        self.glyph = glyph
        self.isDanger = isDanger
        super.init(frame: NSRect(x: 0, y: 0, width: 28, height: 28))
        self.title = ""
        self.toolTip = tooltip
        self.isBordered = false
        self.focusRingType = .none
        self.target = self
        self.action = #selector(handleClick)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() {
        onClick?()
    }

    public override var isHighlighted: Bool {
        didSet {
            if oldValue != isHighlighted {
                needsDisplay = true
            }
        }
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let b = bounds

        // Hover or press highlight
        if isHighlighted {
            if isDanger {
                ctx.setFillColor(NSColor(red: 0.95, green: 0.25, blue: 0.35, alpha: 0.25).cgColor)
            } else {
                ctx.setFillColor(NSColor(white: 1.0, alpha: 0.16).cgColor)
            }
            let r = b.insetBy(dx: 2, dy: 2)
            let path = CGPath(roundedRect: r, cornerWidth: 6, cornerHeight: 6, transform: nil)
            ctx.addPath(path)
            ctx.fillPath()
        }

        let iconColor: NSColor
        if isDanger {
            iconColor = isHighlighted ? NSColor(red: 1.0, green: 0.4, blue: 0.5, alpha: 1.0) : NSColor(red: 0.95, green: 0.45, blue: 0.50, alpha: 0.90)
        } else {
            iconColor = isHighlighted ? .white : NSColor(white: 0.85, alpha: 1.0)
        }

        let iconRect = CGRect(x: b.midX - 7.5, y: b.midY - 7.5, width: 15, height: 15)

        switch glyph {
        case .duplicate:
            VooIconFactory.drawCopy(in: iconRect, color: iconColor)
        case .flipH:
            VooIconFactory.drawFlipH(in: iconRect, color: iconColor)
        case .flipV:
            VooIconFactory.drawFlipV(in: iconRect, color: iconColor)
        case .lock:
            VooIconFactory.drawLock(in: iconRect, color: iconColor)
        case .unlock:
            VooIconFactory.drawUnlock(in: iconRect, color: iconColor)
        case .eye:
            VooIconFactory.drawEye(in: iconRect, color: iconColor)
        case .eyeOff:
            VooIconFactory.drawEyeOff(in: iconRect, color: iconColor)
        case .copySvg:
            VooIconFactory.drawSvg(in: iconRect, color: iconColor)
        case .copyCode:
            VooIconFactory.drawCode(in: iconRect, color: iconColor)
        case .delete:
            VooIconFactory.drawTrash(in: iconRect, color: iconColor)
        case .alignLeft:
            VooIconFactory.drawAlignLeft(in: iconRect, color: iconColor)
        case .alignCenter:
            VooIconFactory.drawAlignCenter(in: iconRect, color: iconColor)
        case .alignRight:
            VooIconFactory.drawAlignRight(in: iconRect, color: iconColor)
        case .alignTop:
            VooIconFactory.drawAlignTop(in: iconRect, color: iconColor)
        case .alignMiddle:
            VooIconFactory.drawAlignMiddle(in: iconRect, color: iconColor)
        case .alignBottom:
            VooIconFactory.drawAlignBottom(in: iconRect, color: iconColor)
        case .distributeH:
            VooIconFactory.drawDistributeH(in: iconRect, color: iconColor)
        case .distributeV:
            VooIconFactory.drawDistributeV(in: iconRect, color: iconColor)
        case .group:
            VooIconFactory.drawGroup(in: iconRect, color: iconColor)
        case .ungroup:
            VooIconFactory.drawUngroup(in: iconRect, color: iconColor)
        case .booleanUnion:
            VooIconFactory.drawBooleanUnion(in: iconRect, color: iconColor)
        case .booleanSubtract:
            VooIconFactory.drawBooleanSubtract(in: iconRect, color: iconColor)
        case .booleanIntersect:
            VooIconFactory.drawBooleanIntersect(in: iconRect, color: iconColor)
        case .booleanXor:
            VooIconFactory.drawBooleanXor(in: iconRect, color: iconColor)
        case .booleanDivide:
            VooIconFactory.drawBooleanDivide(in: iconRect, color: iconColor)
        case .finishPath:
            VooIconFactory.drawCheckmark(in: iconRect, color: NSColor(red: 0.2, green: 0.85, blue: 0.5, alpha: 1.0))
        case .deleteAnchor:
            VooIconFactory.drawMinus(in: iconRect, color: iconColor)
        case .nodeSharp:
            VooIconFactory.drawNodeSharp(in: iconRect, color: iconColor)
        case .nodeSmooth:
            VooIconFactory.drawNodeSmooth(in: iconRect, color: iconColor)
        case .nodeSmart:
            VooIconFactory.drawNodeSmart(in: iconRect, color: iconColor)
        case .breakCurve:
            guard let ctx = NSGraphicsContext.current?.cgContext else { return }
            ctx.setStrokeColor(iconColor.cgColor)
            ctx.setLineWidth(1.4)
            ctx.setLineCap(.round)
            // Left curve segment
            ctx.move(to: CGPoint(x: iconRect.minX + 2, y: iconRect.midY + 4))
            ctx.addQuadCurve(to: CGPoint(x: iconRect.midX - 2, y: iconRect.midY - 2),
                             control: CGPoint(x: iconRect.minX + 5, y: iconRect.midY - 4))
            ctx.strokePath()
            // Right curve segment
            ctx.move(to: CGPoint(x: iconRect.midX + 2, y: iconRect.midY + 2))
            ctx.addQuadCurve(to: CGPoint(x: iconRect.maxX - 2, y: iconRect.midY - 4),
                             control: CGPoint(x: iconRect.maxX - 5, y: iconRect.midY + 4))
            ctx.strokePath()
        case .closeCurve:
            guard let ctx = NSGraphicsContext.current?.cgContext else { return }
            ctx.setStrokeColor(iconColor.cgColor)
            ctx.setLineWidth(1.4)
            ctx.strokeEllipse(in: iconRect.insetBy(dx: 3, dy: 3))
        case .wand:
            VooIconFactory.draw(.wand, in: iconRect, color: iconColor)
        case .sparkles:
            VooIconFactory.draw(.sparkles, in: iconRect, color: iconColor)
        }
    }
}

// MARK: - Taskbar Divider View

public final class TaskbarDividerView: NSView {
    public init() {
        super.init(frame: NSRect(x: 0, y: 0, width: 1, height: 16))
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(NSColor(white: 1.0, alpha: 0.15).cgColor)
        ctx.fill(CGRect(x: 0, y: (bounds.height - 16) / 2.0, width: 1, height: 16))
    }
}

// MARK: - Taskbar Mode

public enum ContextualTaskbarMode: Sendable, Equatable {
    case singleNode
    case multiSelection
    case pathEditing
}

// MARK: - Contextual Taskbar View

public final class ContextualTaskbarView: NSView {
    public private(set) var currentMode: ContextualTaskbarMode = .singleNode

    // Callbacks
    public var onDuplicate: (() -> Void)?
    public var onFlipH: (() -> Void)?
    public var onFlipV: (() -> Void)?
    public var onToggleLock: (() -> Void)?
    public var onToggleVisibility: (() -> Void)?
    public var onCopySvg: (() -> Void)?
    public var onCopyCode: (() -> Void)?
    public var onDelete: (() -> Void)?

    public var onAlign: ((String) -> Void)?
    public var onDistribute: ((String) -> Void)?
    public var onGroup: (() -> Void)?
    public var onUngroup: (() -> Void)?
    public var onBoolean: ((BooleanOperationType) -> Void)?

    public var onFinishPath: (() -> Void)?
    public var onDeleteAnchor: (() -> Void)?
    public var onConvertAnchor: ((NodeType) -> Void)?
    public var onBreakCurve: (() -> Void)?
    public var onCloseCurve: (() -> Void)?

    // Contextual AI Actions
    public var onAIRemoveBackground: (() -> Void)?
    public var onAIRewrite: (() -> Void)?

    private struct ButtonState: Equatable {
        let mode: ContextualTaskbarMode
        let isLocked: Bool
        let isVisible: Bool
        let isImage: Bool
        let hasGroup: Bool
    }
    private let stackView = NSStackView()
    private var requestedState = ButtonState(
        mode: .singleNode, isLocked: false,
        isVisible: true, isImage: false, hasGroup: false)
    private var renderedState: ButtonState?
    private var presentationUpdateScheduled = false

    public override init(frame frameRect: NSRect = .zero) {
        super.init(frame: NSRect(x: 0, y: 0, width: 340, height: 34))
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func setupView() {
        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.35
        layer?.shadowRadius = 12.0
        layer?.shadowOffset = CGSize(width: 0, height: -4)

        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.orientation = .horizontal
        stackView.spacing = 3.0
        stackView.alignment = .centerY
        stackView.edgeInsets = NSEdgeInsets(top: 0, left: 6, bottom: 0, right: 6)
        addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: topAnchor),
            stackView.bottomAnchor.constraint(equalTo: bottomAnchor),
            stackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])

        buildButtons(for: .singleNode)
        renderedState = requestedState
    }

    public func update(selectedNodes: [VOONode], isPathEditing: Bool = false) {
        let newMode: ContextualTaskbarMode
        if isPathEditing {
            newMode = .pathEditing
        } else if selectedNodes.count >= 2 {
            newMode = .multiSelection
        } else {
            newMode = .singleNode
        }

        // Position, identity and unrelated style changes do not alter the buttons.
        let next = ButtonState(
            mode: newMode,
            isLocked: newMode == .singleNode && selectedNodes.first?.style.locked == true,
            isVisible: newMode != .singleNode || selectedNodes.first?.style.visible != false,
            isImage: newMode == .singleNode && selectedNodes.first?.kind == .image,
            hasGroup: newMode == .multiSelection && selectedNodes.contains { $0.kind == .group })
        guard requestedState != next else { return }
        requestedState = next
        currentMode = next.mode
        guard !presentationUpdateScheduled else { return }
        presentationUpdateScheduled = true
        // CanvasStageView calls this method from layout. NSStackView structure
        // may only change after that AppKit layout pass has returned.
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.presentationUpdateScheduled = false
            let state = self.requestedState
            guard self.renderedState != state else { return }
            self.buildButtons(
                for: state.mode, isLocked: state.isLocked,
                isVisible: state.isVisible, hasGroup: state.hasGroup,
                nodeKind: state.isImage ? .image : nil)
            self.renderedState = state
        }
    }

    private func buildButtons(for mode: ContextualTaskbarMode, isLocked: Bool = false, isVisible: Bool = true, hasGroup: Bool = false, nodeKind: NodeKind? = nil) {
        currentMode = mode
        for view in stackView.arrangedSubviews {
            stackView.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        switch mode {
        case .singleNode:
            addSingleNodeButtons(isLocked: isLocked, isVisible: isVisible, nodeKind: nodeKind)
        case .multiSelection:
            addMultiSelectionButtons(hasGroup: hasGroup)
        case .pathEditing:
            addPathEditingButtons()
        }

        invalidateIntrinsicContentSize()
        needsLayout = true
        superview?.needsLayout = true
    }

    private func addSingleNodeButtons(isLocked: Bool, isVisible: Bool, nodeKind: NodeKind? = nil) {
        // 1. Duplicate
        let dup = TaskbarIconButton(glyph: .duplicate, tooltip: "创建副本 (⌘D)")
        dup.onClick = { [weak self] in self?.onDuplicate?() }
        stackView.addArrangedSubview(dup)

        // 2. Flip H / V
        let flipH = TaskbarIconButton(glyph: .flipH, tooltip: "水平翻转 (⇧H)")
        flipH.onClick = { [weak self] in self?.onFlipH?() }
        stackView.addArrangedSubview(flipH)

        let flipV = TaskbarIconButton(glyph: .flipV, tooltip: "垂直翻转 (⇧V)")
        flipV.onClick = { [weak self] in self?.onFlipV?() }
        stackView.addArrangedSubview(flipV)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 3. Lock / Unlock
        let lock = TaskbarIconButton(glyph: isLocked ? .unlock : .lock, tooltip: isLocked ? "解锁图层" : "锁定图层")
        lock.onClick = { [weak self] in self?.onToggleLock?() }
        stackView.addArrangedSubview(lock)

        // 4. Hide / Show
        let eye = TaskbarIconButton(glyph: isVisible ? .eye : .eyeOff, tooltip: isVisible ? "隐藏图层" : "显示图层")
        eye.onClick = { [weak self] in self?.onToggleVisibility?() }
        stackView.addArrangedSubview(eye)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 5. Copy SVG / Copy Code
        let svg = TaskbarIconButton(glyph: .copySvg, tooltip: "复制 SVG")
        svg.onClick = { [weak self] in self?.onCopySvg?() }
        stackView.addArrangedSubview(svg)

        let code = TaskbarIconButton(glyph: .copyCode, tooltip: "复制代码 (Copy Code)")
        code.onClick = { [weak self] in self?.onCopyCode?() }
        stackView.addArrangedSubview(code)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 6. Contextual AI Action
        if nodeKind == .image {
            let aiMatting = TaskbarIconButton(glyph: .wand, tooltip: "AI 一键抠图去背景")
            aiMatting.onClick = { [weak self] in self?.onAIRemoveBackground?() }
            stackView.addArrangedSubview(aiMatting)
        } else {
            let aiRewrite = TaskbarIconButton(glyph: .sparkles, tooltip: "AI 智能改写与变体")
            aiRewrite.onClick = { [weak self] in self?.onAIRewrite?() }
            stackView.addArrangedSubview(aiRewrite)
        }

        stackView.addArrangedSubview(TaskbarDividerView())

        // 7. Delete
        let del = TaskbarIconButton(glyph: .delete, tooltip: "删除 (⌫)", isDanger: true)
        del.onClick = { [weak self] in self?.onDelete?() }
        stackView.addArrangedSubview(del)
    }

    private func addMultiSelectionButtons(hasGroup: Bool) {
        // 1. Align Left, Center, Right, Top, Middle, Bottom
        let aligns: [(TaskbarGlyph, String, String)] = [
            (.alignLeft, "left", "左对齐"),
            (.alignCenter, "center", "水平居中"),
            (.alignRight, "right", "右对齐"),
            (.alignTop, "top", "顶对齐"),
            (.alignMiddle, "middle", "垂直居中"),
            (.alignBottom, "bottom", "底对齐")
        ]
        for (g, key, tip) in aligns {
            let btn = TaskbarIconButton(glyph: g, tooltip: tip)
            btn.onClick = { [weak self] in self?.onAlign?(key) }
            stackView.addArrangedSubview(btn)
        }

        // 2. Distribute H / V
        let distH = TaskbarIconButton(glyph: .distributeH, tooltip: "水平等距分布")
        distH.onClick = { [weak self] in self?.onDistribute?("distributeH") }
        stackView.addArrangedSubview(distH)

        let distV = TaskbarIconButton(glyph: .distributeV, tooltip: "垂直等距分布")
        distV.onClick = { [weak self] in self?.onDistribute?("distributeV") }
        stackView.addArrangedSubview(distV)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 3. Group / Ungroup
        let grp = TaskbarIconButton(glyph: .group, tooltip: "编组 (⌘G)")
        grp.onClick = { [weak self] in self?.onGroup?() }
        stackView.addArrangedSubview(grp)

        let ungrp = TaskbarIconButton(glyph: .ungroup, tooltip: "取消编组 (⇧⌘G)")
        ungrp.onClick = { [weak self] in self?.onUngroup?() }
        ungrp.isEnabled = hasGroup
        stackView.addArrangedSubview(ungrp)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 4. Boolean operations
        let booleans: [(BooleanOperationType, TaskbarGlyph, String)] = [
            (.union, .booleanUnion, "并集 (Union)"),
            (.subtract, .booleanSubtract, "减去 (Subtract)"),
            (.intersect, .booleanIntersect, "相交 (Intersect)"),
            (.xor, .booleanXor, "异或 (XOR)"),
            (.divide, .booleanDivide, "分割 (Divide)")
        ]
        for (op, g, tip) in booleans {
            let btn = TaskbarIconButton(glyph: g, tooltip: tip)
            btn.onClick = { [weak self] in self?.onBoolean?(op) }
            stackView.addArrangedSubview(btn)
        }

        stackView.addArrangedSubview(TaskbarDividerView())

        // 5. Contextual AI Action
        let aiArrange = TaskbarIconButton(glyph: .sparkles, tooltip: "AI 智能排版与优化")
        aiArrange.onClick = { [weak self] in self?.onAIRewrite?() }
        stackView.addArrangedSubview(aiArrange)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 6. Delete
        let del = TaskbarIconButton(glyph: .delete, tooltip: "删除 (⌫)", isDanger: true)
        del.onClick = { [weak self] in self?.onDelete?() }
        stackView.addArrangedSubview(del)
    }

    private func addPathEditingButtons() {
        // 1. Finish Path
        let done = TaskbarIconButton(glyph: .finishPath, tooltip: "完成路径编辑 (Return)")
        done.onClick = { [weak self] in self?.onFinishPath?() }
        stackView.addArrangedSubview(done)

        // 2. Delete Anchor
        let delAnchor = TaskbarIconButton(glyph: .deleteAnchor, tooltip: "删除当前锚点 (⌫)")
        delAnchor.onClick = { [weak self] in self?.onDeleteAnchor?() }
        stackView.addArrangedSubview(delAnchor)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 3. Corner type conversions
        let sharp = TaskbarIconButton(glyph: .nodeSharp, tooltip: "尖角 (Sharp)")
        sharp.onClick = { [weak self] in self?.onConvertAnchor?(.sharp) }
        stackView.addArrangedSubview(sharp)

        let smooth = TaskbarIconButton(glyph: .nodeSmooth, tooltip: "平滑角 (Smooth)")
        smooth.onClick = { [weak self] in self?.onConvertAnchor?(.smooth) }
        stackView.addArrangedSubview(smooth)

        let smart = TaskbarIconButton(glyph: .nodeSmart, tooltip: "对称角 (Symmetric)")
        smart.onClick = { [weak self] in self?.onConvertAnchor?(.symmetric) }
        stackView.addArrangedSubview(smart)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 3.5 Curve operations: Break Curve & Close Curve
        let breakBtn = TaskbarIconButton(glyph: .breakCurve, tooltip: "打断曲线 (Break Curve)")
        breakBtn.onClick = { [weak self] in self?.onBreakCurve?() }
        stackView.addArrangedSubview(breakBtn)

        let closeBtn = TaskbarIconButton(glyph: .closeCurve, tooltip: "闭合曲线 (Close Curve)")
        closeBtn.onClick = { [weak self] in self?.onCloseCurve?() }
        stackView.addArrangedSubview(closeBtn)

        stackView.addArrangedSubview(TaskbarDividerView())

        // 4. Flip H / V
        let flipH = TaskbarIconButton(glyph: .flipH, tooltip: "水平翻转 (⇧H)")
        flipH.onClick = { [weak self] in self?.onFlipH?() }
        stackView.addArrangedSubview(flipH)

        let flipV = TaskbarIconButton(glyph: .flipV, tooltip: "垂直翻转 (⇧V)")
        flipV.onClick = { [weak self] in self?.onFlipV?() }
        stackView.addArrangedSubview(flipV)
    }

    public override var intrinsicContentSize: NSSize {
        var width: CGFloat = 16.0
        for v in stackView.arrangedSubviews {
            if v is TaskbarDividerView {
                width += 1.0 + stackView.spacing
            } else {
                width += 28.0 + stackView.spacing
            }
        }
        return NSSize(width: max(width, 120.0), height: 34.0)
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let b = bounds

        // Capsule background
        let pillRadius = b.height / 2.0
        let path = CGPath(roundedRect: b, cornerWidth: pillRadius, cornerHeight: pillRadius, transform: nil)

        // Dark glass background: rgba(18, 18, 20, 0.94)
        ctx.setFillColor(NSColor(red: 18/255.0, green: 18/255.0, blue: 20/255.0, alpha: 0.94).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // 1px Border: rgba(255, 255, 255, 0.12)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }
}

// MARK: - Contextual Taskbar Geometry Calculator

public final class ContextualTaskbarGeometry {
    public static func calculateTaskbarFrame(
        selectionViewRect: CGRect,
        taskbarSize: CGSize,
        stageBounds: CGRect,
        bottomLimit: CGFloat = 36.0,
        margin: CGFloat = 10.0
    ) -> (frame: CGRect, isFlippedTop: Bool) {
        let taskbarW = taskbarSize.width
        let taskbarH = taskbarSize.height

        var posX = selectionViewRect.midX - taskbarW / 2.0
        let leftLimit: CGFloat = 8.0
        let rightLimit = stageBounds.width - taskbarW - 8.0
        posX = min(max(posX, leftLimit), rightLimit)

        var posY = selectionViewRect.minY - taskbarH - margin
        var isFlipped = false

        if posY < bottomLimit {
            posY = selectionViewRect.maxY + margin
            isFlipped = true
        }

        return (CGRect(x: posX, y: posY, width: taskbarW, height: taskbarH), isFlipped)
    }
}

