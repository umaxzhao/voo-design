//
//  TransformPanel.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Transform 3x3 Anchor Enum

public enum TransformAnchor3x3: String, CaseIterable, Sendable, Equatable {
    case nw, n, ne
    case w, center, e
    case sw, s, se

    public func anchorPoint(for rect: CGRect) -> CGPoint {
        switch self {
        case .nw: return CGPoint(x: rect.minX, y: rect.minY)
        case .n:  return CGPoint(x: rect.midX, y: rect.minY)
        case .ne: return CGPoint(x: rect.maxX, y: rect.minY)
        case .w:  return CGPoint(x: rect.minX, y: rect.midY)
        case .center: return CGPoint(x: rect.midX, y: rect.midY)
        case .e:  return CGPoint(x: rect.maxX, y: rect.midY)
        case .sw: return CGPoint(x: rect.minX, y: rect.maxY)
        case .s:  return CGPoint(x: rect.midX, y: rect.maxY)
        case .se: return CGPoint(x: rect.maxX, y: rect.maxY)
        }
    }
}

// MARK: - Anchor Grid 3x3 Interactive Custom View

public class AnchorGridView: NSView {
    public var activeAnchor: TransformAnchor3x3 = .nw {
        didSet { needsDisplay = true }
    }
    public var onAnchorChanged: ((TransformAnchor3x3) -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    public override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Grid border & lines
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.20).cgColor)
        ctx.setLineWidth(1.0)
        let rect = bounds.insetBy(dx: 2, dy: 2)
        ctx.stroke(rect)

        let stepX = rect.width / 2.0
        let stepY = rect.height / 2.0

        // Draw dots
        let anchors: [[TransformAnchor3x3]] = [
            [.nw, .n, .ne],
            [.w, .center, .e],
            [.sw, .s, .se]
        ]

        for (rowIdx, row) in anchors.enumerated() {
            for (colIdx, anchor) in row.enumerated() {
                let pt = CGPoint(x: rect.minX + CGFloat(colIdx) * stepX, y: rect.maxY - CGFloat(rowIdx) * stepY)
                if anchor == activeAnchor {
                    ctx.setFillColor(NSColor(red: 0.70, green: 1.00, blue: 0.84, alpha: 1.0).cgColor) // Mint #b2ffd6
                    ctx.fillEllipse(in: CGRect(x: pt.x - 3.5, y: pt.y - 3.5, width: 7, height: 7))
                } else {
                    ctx.setFillColor(NSColor(red: 0.45, green: 0.45, blue: 0.45, alpha: 1.0).cgColor) // #737373
                    ctx.fillEllipse(in: CGRect(x: pt.x - 2.0, y: pt.y - 2.0, width: 4, height: 4))
                }
            }
        }
    }

    public override func mouseDown(with event: NSEvent) {
        let pt = convert(event.locationInWindow, from: nil)
        let rect = bounds.insetBy(dx: 2, dy: 2)
        guard rect.contains(pt) else { return }

        let col = min(max(Int(round((pt.x - rect.minX) / (rect.width / 2.0))), 0), 2)
        let row = min(max(Int(round((rect.maxY - pt.y) / (rect.height / 2.0))), 0), 2)

        let anchors: [[TransformAnchor3x3]] = [
            [.nw, .n, .ne],
            [.w, .center, .e],
            [.sw, .s, .se]
        ]
        activeAnchor = anchors[row][col]
        onAnchorChanged?(activeAnchor)
    }
}

// MARK: - Scrubbable Number Field

public class ScrubbableNumberField: NSView, NSTextFieldDelegate {
    public var value: CGFloat = 0 {
        didSet { updateText() }
    }
    public var onValueChanged: ((CGFloat) -> Void)?

    private let labelView = NSTextField()
    private let textField = NSTextField()
    private let suffix: String

    public init(label: String, suffix: String = "") {
        self.suffix = suffix
        super.init(frame: .zero)
        setup(label: label)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setup(label: String) {
        labelView.translatesAutoresizingMaskIntoConstraints = false
        labelView.stringValue = label
        labelView.font = NSFont.systemFont(ofSize: 10, weight: .bold)
        labelView.textColor = NSColor(white: 0.5, alpha: 1.0)
        labelView.isBordered = false
        labelView.drawsBackground = false
        labelView.isEditable = false
        labelView.isSelectable = false
        addSubview(labelView)

        textField.translatesAutoresizingMaskIntoConstraints = false
        textField.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        textField.textColor = .white
        textField.isBordered = false
        textField.drawsBackground = false
        textField.focusRingType = .none
        textField.delegate = self
        addSubview(textField)

        NSLayoutConstraint.activate([
            labelView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 6),
            labelView.centerYAnchor.constraint(equalTo: centerYAnchor),
            labelView.widthAnchor.constraint(greaterThanOrEqualToConstant: 16),
            labelView.heightAnchor.constraint(equalToConstant: 20),

            textField.leadingAnchor.constraint(equalTo: labelView.trailingAnchor, constant: 4),
            textField.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
            textField.centerYAnchor.constraint(equalTo: centerYAnchor),
            textField.heightAnchor.constraint(equalToConstant: 20)
        ])
    }

    public override func draw(_ dirtyRect: NSRect) {
        ThemeTokens.colorPanel.setFill()
        bounds.fill()
    }

    private func updateText() {
        textField.stringValue = "\(Int(round(value)))\(suffix)"
    }

    public func controlTextDidEndEditing(_ obj: Notification) {
        let clean = textField.stringValue.replacingOccurrences(of: suffix, with: "").trimmingCharacters(in: .whitespaces)
        if let num = Double(clean) {
            value = CGFloat(num)
            onValueChanged?(value)
        }
    }
}

// MARK: - Transform Panel View

public class TransformPanelView: NSView {
    public var onGeometryChange: ((_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat, _ cr: CGFloat?) -> Void)?

    public private(set) var activeAnchor: TransformAnchor3x3 = .nw
    public private(set) var isAspectLocked: Bool = false

    private let headerLabel = NSTextField(labelWithString: "TRANSFORM")
    public let anchorGrid = AnchorGridView()

    public let xField = ScrubbableNumberField(label: "X")
    public let yField = ScrubbableNumberField(label: "Y")
    public let wField = ScrubbableNumberField(label: "W")
    public let hField = ScrubbableNumberField(label: "H")
    public let rField = ScrubbableNumberField(label: "R", suffix: "°")
    public let crField = ScrubbableNumberField(label: "CR")
    public let linkButton = NSButton()

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        setAccessibilityIdentifier(AccessibilityCatalog.transformPanel)
        setAccessibilityRole(.group)

        headerLabel.translatesAutoresizingMaskIntoConstraints = false
        headerLabel.font = NSFont.systemFont(ofSize: 10, weight: .bold)
        headerLabel.textColor = NSColor(white: 0.6, alpha: 1.0)
        headerLabel.isBordered = false
        headerLabel.drawsBackground = false
        headerLabel.isEditable = false
        headerLabel.isSelectable = false
        addSubview(headerLabel)

        anchorGrid.translatesAutoresizingMaskIntoConstraints = false
        addSubview(anchorGrid)

        anchorGrid.onAnchorChanged = { [weak self] anchor in
            self?.activeAnchor = anchor
        }

        // Setup fields
        for f in [xField, yField, wField, hField, rField, crField] {
            f.translatesAutoresizingMaskIntoConstraints = false
            f.onValueChanged = { [weak self] _ in self?.dispatchChanges() }
            addSubview(f)
        }

        linkButton.translatesAutoresizingMaskIntoConstraints = false
        linkButton.bezelStyle = .inline
        linkButton.isBordered = false
        linkButton.title = "🔗"
        linkButton.target = self
        linkButton.action = #selector(toggleAspectLock)
        addSubview(linkButton)

        NSLayoutConstraint.activate([
            headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            headerLabel.heightAnchor.constraint(equalToConstant: 16),

            anchorGrid.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 10),
            anchorGrid.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            anchorGrid.widthAnchor.constraint(equalToConstant: 44),
            anchorGrid.heightAnchor.constraint(equalToConstant: 44),

            // X & Y row
            xField.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 10),
            xField.leadingAnchor.constraint(equalTo: anchorGrid.trailingAnchor, constant: 12),
            xField.widthAnchor.constraint(equalToConstant: 95),
            xField.heightAnchor.constraint(equalToConstant: 24),

            yField.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 10),
            yField.leadingAnchor.constraint(equalTo: xField.trailingAnchor, constant: 8),
            yField.widthAnchor.constraint(equalToConstant: 95),
            yField.heightAnchor.constraint(equalToConstant: 24),

            // W & H row
            wField.topAnchor.constraint(equalTo: xField.bottomAnchor, constant: 8),
            wField.leadingAnchor.constraint(equalTo: anchorGrid.trailingAnchor, constant: 12),
            wField.widthAnchor.constraint(equalToConstant: 95),
            wField.heightAnchor.constraint(equalToConstant: 24),

            hField.topAnchor.constraint(equalTo: xField.bottomAnchor, constant: 8),
            hField.leadingAnchor.constraint(equalTo: wField.trailingAnchor, constant: 8),
            hField.widthAnchor.constraint(equalToConstant: 95),
            hField.heightAnchor.constraint(equalToConstant: 24),

            linkButton.centerYAnchor.constraint(equalTo: wField.centerYAnchor),
            linkButton.leadingAnchor.constraint(equalTo: hField.trailingAnchor, constant: 4),
            linkButton.widthAnchor.constraint(equalToConstant: 20),
            linkButton.heightAnchor.constraint(equalToConstant: 24),

            // R & CR row
            rField.topAnchor.constraint(equalTo: wField.bottomAnchor, constant: 8),
            rField.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            rField.widthAnchor.constraint(equalToConstant: 120),
            rField.heightAnchor.constraint(equalToConstant: 24),

            crField.topAnchor.constraint(equalTo: wField.bottomAnchor, constant: 8),
            crField.leadingAnchor.constraint(equalTo: rField.trailingAnchor, constant: 12),
            crField.widthAnchor.constraint(equalToConstant: 120),
            crField.heightAnchor.constraint(equalToConstant: 24)
        ])
    }

    public func configure(with node: VOONode?) {
        guard let node = node else {
            alphaValue = 0.4
            return
        }
        alphaValue = 1.0

        xField.value = node.x
        yField.value = node.y
        wField.value = node.width
        hField.value = node.height
        rField.value = node.rotation
        crField.value = node.cornerRadii?.tl ?? 0.0
    }

    @objc private func toggleAspectLock() {
        isAspectLocked.toggle()
        linkButton.alphaValue = isAspectLocked ? 1.0 : 0.4
    }

    public override func draw(_ dirtyRect: NSRect) {
        ThemeTokens.colorPanel.setFill()
        bounds.fill()
    }

    private func dispatchChanges() {
        onGeometryChange?(xField.value, yField.value, wField.value, hField.value, rField.value, crField.value)
    }
}
