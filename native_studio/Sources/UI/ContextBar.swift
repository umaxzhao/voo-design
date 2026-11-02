//
//  ContextBar.swift
//  native_studio
//
//  Dynamic Contextual Toolbar exposing Affinity & VOO Boolean operations,
//  Alignments, and Node geometry editing in real-time.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - ContextBar Button

public final class ContextIconButton: NSButton {
    public enum Glyph {
        case booleanUnion
        case booleanSubtract
        case booleanIntersect
        case booleanXor
        case booleanDivide
        case alignLeft
        case alignCenter
        case alignRight
        case nodeSharp
        case nodeSmooth
        case nodeSmart
    }

    public let glyph: Glyph
    public var onClick: (() -> Void)?

    public init(glyph: Glyph, tooltip: String) {
        self.glyph = glyph
        super.init(frame: NSRect(x: 0, y: 0, width: 30, height: 30))
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

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Hover or press highlight
        if isHighlighted {
            ctx.setFillColor(NSColor(white: 1.0, alpha: 0.15).cgColor)
            let r = bounds.insetBy(dx: 2, dy: 2)
            let path = CGPath(roundedRect: r, cornerWidth: 6, cornerHeight: 6, transform: nil)
            ctx.addPath(path)
            ctx.fillPath()
        }

        let iconColor: NSColor = isHighlighted ? .white : NSColor(white: 0.82, alpha: 1.0)
        let iconRect = CGRect(x: bounds.midX - 8, y: bounds.midY - 8, width: 16, height: 16)

        switch glyph {
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
        case .alignLeft:
            VooIconFactory.drawAlignLeft(in: iconRect, color: iconColor)
        case .alignCenter:
            VooIconFactory.drawAlignCenter(in: iconRect, color: iconColor)
        case .alignRight:
            VooIconFactory.drawAlignRight(in: iconRect, color: iconColor)
        case .nodeSharp:
            VooIconFactory.drawNodeSharp(in: iconRect, color: iconColor)
        case .nodeSmooth:
            VooIconFactory.drawNodeSmooth(in: iconRect, color: iconColor)
        case .nodeSmart:
            VooIconFactory.drawNodeSmart(in: iconRect, color: iconColor)
        }
    }
}

// MARK: - Dynamic Contextual Toolbar (Floating Pill below ToolRail)

public final class ContextToolbarPillView: NSView {
    public var onBooleanOperation: ((BooleanOperationType) -> Void)?
    public var onAlignAction: ((String) -> Void)?
    public var onNodeTypeAction: ((String) -> Void)?

    private let stackView = NSStackView()
    private var booleanButtons: [ContextIconButton] = []
    private var alignButtons: [ContextIconButton] = []
    private var nodeButtons: [ContextIconButton] = []

    public override init(frame frameRect: NSRect) {
        super.init(frame: NSRect(x: 0, y: 0, width: 320, height: 38))
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        wantsLayer = true
        layer?.cornerRadius = 19
        layer?.masksToBounds = true

        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.orientation = .horizontal
        stackView.spacing = 2
        stackView.alignment = .centerY
        stackView.edgeInsets = NSEdgeInsets(top: 0, left: 8, bottom: 0, right: 8)
        addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.topAnchor.constraint(equalTo: topAnchor),
            stackView.bottomAnchor.constraint(equalTo: bottomAnchor),
            stackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: trailingAnchor)
        ])

        buildToolbarItems()
    }

    private func buildToolbarItems() {
        stackView.arrangedSubviews.forEach { $0.removeFromSuperview() }

        // 1. Boolean operations group (Affinity 5 Operations)
        let ops: [(BooleanOperationType, ContextIconButton.Glyph, String)] = [
            (.union, .booleanUnion, "并集 (Union / Add)"),
            (.subtract, .booleanSubtract, "减去顶层 (Subtract)"),
            (.intersect, .booleanIntersect, "相交 (Intersect)"),
            (.xor, .booleanXor, "异或排除 (XOR / Exclude)"),
            (.divide, .booleanDivide, "分割 (Divide)")
        ]

        for (op, glyph, tip) in ops {
            let btn = ContextIconButton(glyph: glyph, tooltip: tip)
            btn.translatesAutoresizingMaskIntoConstraints = false
            btn.onClick = { [weak self] in
                self?.onBooleanOperation?(op)
            }
            NSLayoutConstraint.activate([
                btn.widthAnchor.constraint(equalToConstant: 28),
                btn.heightAnchor.constraint(equalToConstant: 28)
            ])
            stackView.addArrangedSubview(btn)
            booleanButtons.append(btn)
        }

        // Separator
        let sep1 = createSeparator()
        stackView.addArrangedSubview(sep1)

        // 2. Alignment group (Affinity / VOO Align)
        let aligns: [(String, ContextIconButton.Glyph, String)] = [
            ("left", .alignLeft, "左对齐 (Align Left)"),
            ("center", .alignCenter, "水平居中 (Align Center)"),
            ("right", .alignRight, "右对齐 (Align Right)")
        ]

        for (alignKey, glyph, tip) in aligns {
            let btn = ContextIconButton(glyph: glyph, tooltip: tip)
            btn.translatesAutoresizingMaskIntoConstraints = false
            btn.onClick = { [weak self] in
                self?.onAlignAction?(alignKey)
            }
            NSLayoutConstraint.activate([
                btn.widthAnchor.constraint(equalToConstant: 28),
                btn.heightAnchor.constraint(equalToConstant: 28)
            ])
            stackView.addArrangedSubview(btn)
            alignButtons.append(btn)
        }

        // Separator
        let sep2 = createSeparator()
        stackView.addArrangedSubview(sep2)

        // 3. Node type group (Affinity Curve Node Sharp/Smooth/Smart)
        let nodes: [(String, ContextIconButton.Glyph, String)] = [
            ("sharp", .nodeSharp, "尖角节点 (Sharp Corner)"),
            ("smooth", .nodeSmooth, "平滑节点 (Smooth Corner)"),
            ("smart", .nodeSmart, "智能对称节点 (Smart/Symmetric)")
        ]

        for (nodeKey, glyph, tip) in nodes {
            let btn = ContextIconButton(glyph: glyph, tooltip: tip)
            btn.translatesAutoresizingMaskIntoConstraints = false
            btn.onClick = { [weak self] in
                self?.onNodeTypeAction?(nodeKey)
            }
            NSLayoutConstraint.activate([
                btn.widthAnchor.constraint(equalToConstant: 28),
                btn.heightAnchor.constraint(equalToConstant: 28)
            ])
            stackView.addArrangedSubview(btn)
            nodeButtons.append(btn)
        }
    }

    private func createSeparator() -> NSView {
        let v = NSView()
        v.translatesAutoresizingMaskIntoConstraints = false
        v.wantsLayer = true
        v.layer?.backgroundColor = NSColor(white: 1.0, alpha: 0.12).cgColor
        NSLayoutConstraint.activate([
            v.widthAnchor.constraint(equalToConstant: 1),
            v.heightAnchor.constraint(equalToConstant: 18)
        ])
        return v
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Floating pill chrome
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
