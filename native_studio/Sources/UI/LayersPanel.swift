//
//  LayersPanel.swift
//  native_studio
//
//  Floating left LAYERS card matching the VOO Design web editor 1:1:
//  web-style visibility checkboxes, kind glyphs, mint selection row, interactive
//  opacity/blend pills with NSMenu presets and a five-action footer toolbar.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Vector Icon Button (legacy AppKit button rendering Lucide vector paths)

public final class VectorIconButton: NSButton {
    public var iconType: String = "" { didSet { needsDisplay = true } }
    public var iconColor: NSColor = NSColor(white: 0.60, alpha: 1.0) { didSet { needsDisplay = true } }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        focusRingType = .none
        title = ""
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
    }

    public override func draw(_ dirtyRect: NSRect) {
        let b = bounds.insetBy(dx: 1, dy: 1)
        switch iconType {
        case "eye":
            VooIconFactory.drawEye(in: b, color: iconColor, strokeWidth: 1.5)
        case "eye-off":
            VooIconFactory.drawEyeOff(in: b, color: iconColor.withAlphaComponent(0.35), strokeWidth: 1.5)
        case "lock":
            VooIconFactory.drawLock(in: b, color: iconColor, strokeWidth: 1.5)
        case "unlock":
            VooIconFactory.drawUnlock(in: b, color: iconColor.withAlphaComponent(0.35), strokeWidth: 1.5)
        default:
            break
        }
    }
}

// MARK: - Panel colors & metrics

private enum LayersPalette {
    static let cardFill = NSColor(white: 0.0, alpha: 0.95)
    static let cardBorder = NSColor(white: 1.0, alpha: 0.08)
    static let divider = NSColor(white: 1.0, alpha: 0.10)

    static let headerText = NSColor(white: 0.60, alpha: 1.0)
    static let iconResting = NSColor(white: 0.62, alpha: 1.0)
    static let iconHover = NSColor(white: 0.95, alpha: 1.0)
    static let iconMuted = NSColor(white: 0.45, alpha: 1.0)

    static let pillFill = NSColor(white: 1.0, alpha: 0.14)
    static let pillFillHover = NSColor(white: 1.0, alpha: 0.20)
    static let pillText = NSColor(white: 0.86, alpha: 1.0)
    static let pillTextMuted = NSColor(white: 0.38, alpha: 1.0)
    static let chevron = NSColor(white: 0.55, alpha: 1.0)

    static let rowHover = NSColor(white: 1.0, alpha: 0.08)
    static let rowSelectedFill = ThemeTokens.colorMint.withAlphaComponent(0.10)
    static let rowSelectedBorder = NSColor.clear
    static let rowName = NSColor(hex: "#d4d4d4")
    static let rowNameSelected = ThemeTokens.colorMint
    static let rowNameMuted = NSColor(white: 0.45, alpha: 1.0)
    static let hexText = NSColor(white: 0.42, alpha: 1.0)

    static let checkboxBorder = NSColor(white: 1.0, alpha: 0.24)
    static let checkboxBorderHover = NSColor(white: 1.0, alpha: 0.42)
    static let checkboxFillHover = NSColor(white: 1.0, alpha: 0.07)
    static let checkboxOn = ThemeTokens.colorMint
    static let lockAmber = NSColor(hex: "#FFB84D")

    static let shapeOutline = NSColor(white: 1.0, alpha: 0.55)
    static let shapeOutlineSelected = ThemeTokens.colorMint
}

private enum LayersMetrics {
    static let cornerRadius: CGFloat = 24
    static let contentInset: CGFloat = 12
    static let headerInset: CGFloat = 20          // card padding 12 + header px 8
    static let headerTitleTop: CGFloat = 16       // card padding 12 + header pt 4
    static let headerTitleHeight: CGFloat = 20
    static let headerButtonSize: CGFloat = 21     // 13pt icon + p4
    static let headerIconSize: CGFloat = 13
    static let pillHeight: CGFloat = 28
    static let pillRadius: CGFloat = 12
    static let pillGap: CGFloat = 6
    static let pillTop: CGFloat = 50
    static let rowHeight: CGFloat = 30
    static let rowSpacing: CGFloat = 4
    static let rowInset: CGFloat = 12
    static let checkboxSize: CGFloat = 16
    static let checkboxLeading: CGFloat = 8
    static let kindContainerSize: CGFloat = 28
    static let kindGlyphSize: CGFloat = 14
    static let rowContentGap: CGFloat = 8
    static let footerButtonSize: CGFloat = 24
    static let footerBottomInset: CGFloat = 12
    static let footerLeadingInset: CGFloat = 16   // card padding 12 + footer px 4
    static let footerSpacing: CGFloat = 4
    static let iconGlyphSize: CGFloat = 14
}

// MARK: - Glyph catalogue

public enum LayersPanelGlyph {
    case search
    case sliders
    case sortArrows
    case plus
    case contrast
    case mask
    case folder
    case trash
    case chevronDown
    case square
    case circle
    case frame
    case text
    case penCurve
    case diamond
}

private enum LayersGlyphDrawing {
    /// Draws a canonical Lucide glyph via `VooIconFactory`.
    static func draw(_ glyph: LayersPanelGlyph, in rect: CGRect, color: NSColor, strokeWidth: CGFloat = 1.6) {
        guard rect.width > 0, rect.height > 0 else { return }
        switch glyph {
        case .search:
            VooIconFactory.drawSearch(in: rect, color: color, strokeWidth: strokeWidth)
        case .sliders:
            VooIconFactory.drawSliders(in: rect, color: color, strokeWidth: strokeWidth)
        case .sortArrows:
            VooIconFactory.drawSwap(in: rect, color: color, strokeWidth: strokeWidth)
        case .plus:
            VooIconFactory.drawPlus(in: rect, color: color, strokeWidth: strokeWidth)
        case .contrast:
            VooIconFactory.drawContrast(in: rect, color: color, strokeWidth: strokeWidth)
        case .trash:
            VooIconFactory.drawTrash(in: rect, color: color, strokeWidth: strokeWidth)
        case .frame:
            VooIconFactory.drawFrame(in: rect, color: color, strokeWidth: strokeWidth)
        case .text:
            VooIconFactory.drawText(in: rect, color: color, strokeWidth: strokeWidth)
        case .mask:
            VooIconFactory.drawMask(in: rect, color: color, strokeWidth: strokeWidth)
        case .folder:
            VooIconFactory.drawFolder(in: rect, color: color, strokeWidth: strokeWidth)
        case .chevronDown:
            VooIconFactory.drawChevronDown(in: rect, color: color, strokeWidth: strokeWidth)
        case .diamond:
            VooIconFactory.drawDiamond(in: rect, color: color, strokeWidth: strokeWidth)
        case .penCurve:
            VooIconFactory.drawSpline(in: rect, color: color, strokeWidth: strokeWidth)
        case .square:
            VooIconFactory.drawRect(in: rect, color: color, strokeWidth: strokeWidth)
        case .circle:
            VooIconFactory.drawEllipse(in: rect, color: color, strokeWidth: strokeWidth)
        }
    }
}

// MARK: - Small icon button (header search / sort, footer actions)

public final class LayersIconButton: NSButton {
    public let glyph: LayersPanelGlyph
    public var onClick: (() -> Void)?
    /// Icon side length (header 13 / footer 14).
    public var iconSize: CGFloat = LayersMetrics.iconGlyphSize
    /// Hover wash corner radius (8pt per UI spec).
    public var hoverRadius: CGFloat = 8
    /// Optional accent tint for destructive actions (e.g. trash hover = rose).
    public var hoverTint: NSColor?

    public var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }

    public init(glyph: LayersPanelGlyph, tooltip: String, accessibilityLabel: String) {
        self.glyph = glyph
        super.init(frame: NSRect(x: 0, y: 0, width: 20, height: 20))
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        self.toolTip = tooltip
        setAccessibilityRole(.button)
        setAccessibilityLabel(accessibilityLabel)
    }

    public override init(frame frameRect: NSRect) {
        self.glyph = .plus
        super.init(frame: frameRect)
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() { onClick?() }

    /// Drawn in the same y-down design space as `VooIconFactory` (unflipped context).
    public override var isFlipped: Bool { false }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: self,
            userInfo: nil
        ))
    }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) { isHovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        if isHovered || isHighlighted {
            let wash = bounds.insetBy(dx: 1, dy: 1)
            let washColor: NSColor
            if let tint = hoverTint, isHovered {
                washColor = tint.withAlphaComponent(0.14)
            } else {
                washColor = NSColor(white: 1.0, alpha: isHighlighted ? 0.14 : 0.08)
            }
            ctx.setFillColor(washColor.cgColor)
            ctx.addPath(CGPath(roundedRect: wash,
                               cornerWidth: hoverRadius,
                               cornerHeight: hoverRadius,
                               transform: nil))
            ctx.fillPath()
        }
        let color: NSColor
        if let tint = hoverTint, isHovered {
            color = tint
        } else {
            color = (isHovered || isHighlighted) ? LayersPalette.iconHover : LayersPalette.iconResting
        }
        let side = iconSize
        let glyphRect = CGRect(
            x: bounds.midX - side / 2.0,
            y: bounds.midY - side / 2.0,
            width: side,
            height: side
        )
        LayersGlyphDrawing.draw(glyph, in: glyphRect, color: color, strokeWidth: 1.5)
    }
}

// MARK: - Opacity / Blend pill button

public final class LayersPillButton: NSButton {
    public enum Style {
        case opacity
        case blendMode
    }

    public let style: Style
    public var titleText: String = "100" {
        didSet { if oldValue != titleText { needsDisplay = true } }
    }
    /// Dims the pill and disables interaction (no selection).
    public var isActive: Bool = true {
        didSet { if oldValue != isActive { needsDisplay = true } }
    }

    public var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }

    public init(style: Style, accessibilityLabel: String) {
        self.style = style
        super.init(frame: NSRect(x: 0, y: 0, width: 114, height: LayersMetrics.pillHeight))
        isBordered = false
        focusRingType = .none
        title = ""
        setAccessibilityRole(.button)
        setAccessibilityLabel(accessibilityLabel)
        toolTip = accessibilityLabel
    }

    public override init(frame frameRect: NSRect) {
        self.style = .opacity
        super.init(frame: frameRect)
        isBordered = false
        focusRingType = .none
        title = ""
        setAccessibilityRole(.button)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// Drawn in the same y-down design space as `VooIconFactory` (unflipped context).
    public override var isFlipped: Bool { false }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: self,
            userInfo: nil
        ))
    }

    public override func resetCursorRects() {
        if isActive { addCursorRect(bounds, cursor: .pointingHand) }
    }

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) { isHovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let radius = LayersMetrics.pillRadius
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

        let hovering = isHovered && isActive
        let fill = hovering ? LayersPalette.pillFillHover : LayersPalette.pillFill
        ctx.setFillColor(fill.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        let textColor = isActive ? LayersPalette.pillText : LayersPalette.pillTextMuted
        let chevronColor = isActive ? LayersPalette.chevron : LayersPalette.pillTextMuted.withAlphaComponent(0.5)

        let font = ThemeFonts.mono(size: 10.0, weight: .medium)
        let textHeight = ceil(font.ascender - font.descender)
        let textY = floor((bounds.height - textHeight) / 2.0)

        switch style {
        case .opacity:
            // Leading contrast glyph (px10).
            let glyphSide: CGFloat = 12.0
            let glyphRect = CGRect(
                x: 10.0,
                y: floor((bounds.height - glyphSide) / 2.0),
                width: glyphSide,
                height: glyphSide
            )
            LayersGlyphDrawing.draw(
                .contrast,
                in: glyphRect,
                color: isActive ? NSColor(white: 0.72, alpha: 1.0) : LayersPalette.pillTextMuted,
                strokeWidth: 1.5
            )
            let value = titleText as NSString
            value.draw(
                with: NSRect(x: 34.0, y: textY, width: 44.0, height: textHeight),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: [.font: font, .foregroundColor: textColor]
            )
            let percentFont = ThemeFonts.mono(size: 9.0, weight: .regular)
            let percentWidth = ("%" as NSString).size(withAttributes: [.font: percentFont]).width
            ("%" as NSString).draw(
                with: NSRect(x: bounds.width - 10.0 - percentWidth, y: textY,
                             width: percentWidth + 1.0, height: textHeight),
                options: [.usesLineFragmentOrigin],
                attributes: [.font: percentFont, .foregroundColor: LayersPalette.pillTextMuted]
            )

        case .blendMode:
            (titleText as NSString).draw(
                with: NSRect(x: 12.0, y: textY, width: max(0, bounds.width - 40.0), height: textHeight),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: [.font: font, .foregroundColor: textColor]
            )
        }

        // Trailing chevron only on the blend-mode pill (opacity is a value pill).
        if style == .blendMode {
            let chevronWidth: CGFloat = 9.0
            let chevronX = bounds.width - 10.0 - chevronWidth
            let chevronMidY = bounds.midY
            ctx.setStrokeColor(chevronColor.cgColor)
            ctx.setLineWidth(1.4)
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            ctx.move(to: CGPoint(x: chevronX, y: chevronMidY + 2.5))
            ctx.addLine(to: CGPoint(x: chevronX + chevronWidth / 2.0, y: chevronMidY - 2.5))
            ctx.addLine(to: CGPoint(x: chevronX + chevronWidth, y: chevronMidY + 2.5))
            ctx.strokePath()
        }
    }
}

// MARK: - Web-style visibility checkbox

public final class LayerVisibilityCheckbox: NSButton {
    public var isVisibleState: Bool = true {
        didSet { if oldValue != isVisibleState { needsDisplay = true } }
    }
    public var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }
    public var onToggle: (() -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: NSRect(x: 0, y: 0, width: LayersMetrics.checkboxSize, height: LayersMetrics.checkboxSize))
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Toggle visibility")
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Toggle visibility")
    }

    @objc private func handleClick() { onToggle?() }

    /// Drawn in the same y-down design space as `VooIconFactory` (unflipped context).
    public override var isFlipped: Bool { false }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: self,
            userInfo: nil
        ))
    }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) { isHovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = CGPath(roundedRect: rect, cornerWidth: 4, cornerHeight: 4, transform: nil)

        if isHovered {
            ctx.setFillColor(LayersPalette.checkboxFillHover.cgColor)
            ctx.addPath(path)
            ctx.fillPath()
        }
        ctx.setStrokeColor(
            (isHovered ? LayersPalette.checkboxBorderHover : LayersPalette.checkboxBorder).cgColor
        )
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()

        guard isVisibleState else { return }
        let eyeRect = bounds.insetBy(dx: 1.0, dy: 2.0)
        VooIconFactory.drawEye(
            in: eyeRect,
            color: LayersPalette.checkboxOn,
            strokeWidth: 1.5
        )
    }
}

// MARK: - Lock indicator (amber, only when locked)

public final class LayerLockButton: NSButton {
    public var isLocked: Bool = false {
        didSet {
            isHidden = !isLocked
            if oldValue != isLocked { needsDisplay = true }
        }
    }
    public var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }
    public var onClick: (() -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: NSRect(x: 0, y: 0, width: 14, height: 14))
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Toggle lock")
        isHidden = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Toggle lock")
        isHidden = true
    }

    @objc private func handleClick() { onClick?() }

    /// Drawn in the same y-down design space as `VooIconFactory` (unflipped context).
    public override var isFlipped: Bool { false }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: self,
            userInfo: nil
        ))
    }

    public override func resetCursorRects() {
        if isLocked { addCursorRect(bounds, cursor: .pointingHand) }
    }

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) { isHovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard isLocked else { return }
        VooIconFactory.drawLock(
            in: bounds.insetBy(dx: 1.5, dy: 1.5),
            color: isHovered ? LayersPalette.lockAmber : LayersPalette.lockAmber.withAlphaComponent(0.8),
            strokeWidth: 1.5
        )
    }
}

// MARK: - Layer Row Cell (web-style row)

public class LayerRowCell: NSTableCellView, NSTextFieldDelegate {
    public let visibilityButton = LayerVisibilityCheckbox()
    public let lockButton = LayerLockButton()
    /// Retained for API compatibility (custom kind glyphs are drawn in `draw(_:)`).
    public let kindIconView = NSImageView()
    public let titleField = NSTextField()
    public let hexLabel = NSTextField(labelWithString: "")

    public var onToggleVisible: (() -> Void)?
    public var onToggleLock: (() -> Void)?
    public var onRename: ((String) -> Void)?

    private var currentNode: VOONode?
    private var isRowSelected: Bool = false
    private var isHovered: Bool = false
    private var committedName: String = ""
    private var lockWidthConstraint: NSLayoutConstraint?
    private var hexWidthConstraint: NSLayoutConstraint?

    public init(identifier: NSUserInterfaceItemIdentifier) {
        super.init(frame: NSRect(x: 0, y: 0, width: 248, height: LayersMetrics.rowHeight))
        self.identifier = identifier
        setupCell()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupCell()
    }

    private func setupCell() {
        wantsLayer = false

        visibilityButton.translatesAutoresizingMaskIntoConstraints = false
        visibilityButton.onToggle = { [weak self] in self?.onToggleVisible?() }
        addSubview(visibilityButton)

        lockButton.translatesAutoresizingMaskIntoConstraints = false
        lockButton.onClick = { [weak self] in self?.onToggleLock?() }
        addSubview(lockButton)

        titleField.translatesAutoresizingMaskIntoConstraints = false
        titleField.isBordered = false
        titleField.drawsBackground = false
        titleField.focusRingType = .none
        titleField.isEditable = false
        titleField.isSelectable = false
        titleField.font = ThemeFonts.mono(size: 11, weight: .regular)
        titleField.textColor = LayersPalette.rowName
        titleField.cell?.wraps = false
        titleField.cell?.isScrollable = true
        (titleField.cell as? NSTextFieldCell)?.lineBreakMode = .byTruncatingTail
        titleField.delegate = self
        addSubview(titleField)

        hexLabel.translatesAutoresizingMaskIntoConstraints = false
        hexLabel.font = ThemeFonts.mono(size: 9, weight: .regular)
        hexLabel.textColor = LayersPalette.hexText
        hexLabel.alignment = .right
        hexLabel.isHidden = true
        addSubview(hexLabel)

        // Kept as a non-visible compatibility stub.
        kindIconView.isHidden = true

        let lockWidth = lockButton.widthAnchor.constraint(equalToConstant: 14)
        let hexWidth = hexLabel.widthAnchor.constraint(equalToConstant: 0)
        lockWidthConstraint = lockWidth
        hexWidthConstraint = hexWidth

        NSLayoutConstraint.activate([
            visibilityButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.checkboxLeading),
            visibilityButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            visibilityButton.widthAnchor.constraint(equalToConstant: LayersMetrics.checkboxSize),
            visibilityButton.heightAnchor.constraint(equalToConstant: LayersMetrics.checkboxSize),

            lockButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            lockButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            lockButton.heightAnchor.constraint(equalToConstant: 14),
            lockWidth,

            hexLabel.trailingAnchor.constraint(equalTo: lockButton.leadingAnchor, constant: -6),
            hexLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            hexLabel.heightAnchor.constraint(equalToConstant: 12),
            hexWidth,

            titleField.leadingAnchor.constraint(equalTo: leadingAnchor, constant:
                LayersMetrics.checkboxLeading + LayersMetrics.checkboxSize
                + LayersMetrics.rowContentGap + LayersMetrics.kindContainerSize
                + LayersMetrics.rowContentGap),
            titleField.centerYAnchor.constraint(equalTo: centerYAnchor),
            titleField.heightAnchor.constraint(equalToConstant: 15),
            titleField.trailingAnchor.constraint(lessThanOrEqualTo: hexLabel.leadingAnchor, constant: -8),
            titleField.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -8)
        ])
    }

    public func configure(node: VOONode, isSelected: Bool) {
        currentNode = node
        committedName = node.name
        titleField.stringValue = node.name
        titleField.textColor = isSelected ? LayersPalette.rowNameSelected : LayersPalette.rowName
        titleField.font = ThemeFonts.mono(size: 11, weight: isSelected ? .medium : .regular)

        visibilityButton.isVisibleState = node.style.visible
        lockButton.isLocked = node.style.locked
        lockWidthConstraint?.constant = node.style.locked ? 14 : 0

        let showsHex = node.name == "Background"
        hexLabel.stringValue = showsHex ? node.fill : ""
        hexLabel.isHidden = !showsHex
        hexWidthConstraint?.constant = showsHex ? 58 : 0

        isRowSelected = isSelected
        setAccessibilityIdentifier("Inspector.LayersTree.Row.\(node.name)")
        needsDisplay = true
    }

    /// Enables inline rename (called on double-click by the panel).
    public func beginRename() {
        guard let node = currentNode else { return }
        committedName = node.name
        titleField.isEditable = true
        titleField.isSelectable = true
        window?.makeFirstResponder(titleField)
        titleField.selectText(nil)
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rowRect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let rowPath = CGPath(roundedRect: rowRect, cornerWidth: 12, cornerHeight: 12, transform: nil)

        if isRowSelected {
            ctx.setFillColor(LayersPalette.rowSelectedFill.cgColor)
            ctx.addPath(rowPath)
            ctx.fillPath()
        } else if isHovered {
            ctx.setFillColor(LayersPalette.rowHover.cgColor)
            ctx.addPath(rowPath)
            ctx.fillPath()
        }

        guard let node = currentNode else { return }
        // Kind glyph: 14pt glyph centred inside a 28×28 container.
        let container = NSRect(
            x: LayersMetrics.checkboxLeading + LayersMetrics.checkboxSize + LayersMetrics.rowContentGap,
            y: floor((bounds.height - LayersMetrics.kindContainerSize) / 2.0),
            width: LayersMetrics.kindContainerSize,
            height: LayersMetrics.kindContainerSize
        )
        let glyphRect = NSRect(
            x: container.midX - LayersMetrics.kindGlyphSize / 2.0,
            y: container.midY - LayersMetrics.kindGlyphSize / 2.0,
            width: LayersMetrics.kindGlyphSize,
            height: LayersMetrics.kindGlyphSize
        )
        drawKindGlyph(for: node, in: glyphRect)
    }

    private func drawKindGlyph(for node: VOONode, in rect: NSRect) {
        let outline = isRowSelected ? LayersPalette.shapeOutlineSelected : LayersPalette.shapeOutline
        let neutral = isRowSelected ? LayersPalette.shapeOutlineSelected : LayersPalette.iconMuted

        switch node.kind {
        case .rect:
            drawShapeGlyph(isCircle: false, fill: LayersShapeFill.color(from: node.fill), outline: outline, in: rect)
        case .ellipse:
            drawShapeGlyph(isCircle: true, fill: LayersShapeFill.color(from: node.fill), outline: outline, in: rect)
        case .path:
            LayersGlyphDrawing.draw(.penCurve, in: rect, color: neutral, strokeWidth: 1.4)
        case .text:
            LayersGlyphDrawing.draw(.text, in: rect, color: neutral, strokeWidth: 1.7)
        case .group:
            LayersGlyphDrawing.draw(.folder, in: rect, color: neutral, strokeWidth: 1.4)
        case .frame:
            LayersGlyphDrawing.draw(.frame, in: rect, color: neutral, strokeWidth: 1.4)
        case .boolean:
            LayersGlyphDrawing.draw(.diamond, in: rect, color: neutral, strokeWidth: 1.4)
        default:
            LayersGlyphDrawing.draw(.diamond, in: rect, color: neutral, strokeWidth: 1.4)
        }
    }

    private func drawShapeGlyph(isCircle: Bool, fill: NSColor?, outline: NSColor, in rect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let glyphRect = rect.insetBy(dx: 1.0, dy: 1.0)
        ctx.saveGState()
        if let fill = fill {
            ctx.setFillColor(fill.cgColor)
            if isCircle {
                ctx.fillEllipse(in: glyphRect)
            } else {
                ctx.addPath(CGPath(
                    roundedRect: glyphRect,
                    cornerWidth: 3, cornerHeight: 3, transform: nil
                ))
                ctx.fillPath()
            }
        }
        ctx.setStrokeColor(outline.cgColor)
        ctx.setLineWidth(1.0)
        if isCircle {
            ctx.strokeEllipse(in: glyphRect)
        } else {
            ctx.addPath(CGPath(
                roundedRect: glyphRect,
                cornerWidth: 3, cornerHeight: 3, transform: nil
            ))
            ctx.strokePath()
        }
        ctx.restoreGState()
    }

    // MARK: Hover

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: self,
            userInfo: nil
        ))
    }

    public override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
    }

    // MARK: Rename

    public func controlTextDidEndEditing(_ obj: Notification) {
        let newName = titleField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        titleField.isEditable = false
        titleField.isSelectable = false
        if !newName.isEmpty && newName != committedName {
            committedName = newName
            onRename?(newName)
        } else {
            titleField.stringValue = committedName
        }
    }
}

/// Parses CSS hex fills for the row's shape glyph.
private enum LayersShapeFill {
    static func color(from fill: String) -> NSColor? {
        let trimmed = fill.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = trimmed.lowercased()
        if lower.isEmpty || lower == "none" || lower == "transparent" { return nil }
        return NSColor(hexString: trimmed)
    }
}

// MARK: - Table view with Option+Arrow reorder support

public final class LayersTableView: NSTableView {
    public var onOptionMoveUp: (() -> Void)?
    public var onOptionMoveDown: (() -> Void)?
    public weak var ownerPanel: LayersPanelView?

    public override func menu(for event: NSEvent) -> NSMenu? {
        guard let panel = ownerPanel else { return super.menu(for: event) }
        let row = clickedRow
        guard row >= 0, row < panel.nodes.count else { return super.menu(for: event) }
        panel.selectRowForContextMenu(row)
        return panel.buildRowContextMenu(row: row)
    }

    public override func keyDown(with event: NSEvent) {
        if event.modifierFlags.contains(.option) {
            if event.keyCode == 126 { // up arrow
                onOptionMoveUp?()
                return
            }
            if event.keyCode == 125 { // down arrow
                onOptionMoveDown?()
                return
            }
        }
        super.keyDown(with: event)
    }
}

// MARK: - Scroll document container (flipped so the table is laid out top-down)

public final class LayersDocumentContainerView: NSView {
    public override var isFlipped: Bool { true }
}

// MARK: - Layers Panel View (Floating Dark Glass Card)

public class LayersPanelView: NSView, NSTableViewDataSource, NSTableViewDelegate {
    // MARK: Existing public API

    public var onSelectNode: ((String) -> Void)?
    public var onToggleVisibility: ((String, Bool) -> Void)?
    public var onToggleLock: ((String, Bool) -> Void)?
    public var onRenameNode: ((String, String) -> Void)?

    // MARK: New public API (host wires these)

    public var onSearchTapped: (() -> Void)?
    public var onSortTapped: (() -> Void)?
    public var onAddLayer: (() -> Void)?
    public var onAddMask: (() -> Void)?
    public var onGroupLayers: (() -> Void)?
    public var onDeleteSelected: (() -> Void)?
    public var onOpacityChange: ((CGFloat) -> Void)?
    public var onBlendModeChange: ((String) -> Void)?
    public var onMoveLayer: ((String, Int) -> Void)?
    public var onDuplicateSelected: (() -> Void)?

    public private(set) var nodes: [VOONode] = []
    public private(set) var selectedNodeId: String?

    public var selectedNode: VOONode? {
        guard let id = selectedNodeId else { return nil }
        return nodes.first { $0.id == id }
    }

    // MARK: Subviews

    private let headerLabel = NSTextField(labelWithString: "LAYERS")
    private let countBadge = NSTextField(labelWithString: "0")
    private let searchButton = LayersIconButton(
        glyph: .search,
        tooltip: "Search layers",
        accessibilityLabel: "Search layers"
    )
    private let sortButton = LayersIconButton(
        glyph: .sortArrows,
        tooltip: "Sort layers",
        accessibilityLabel: "Sort layers"
    )
    private let opacityPill = LayersPillButton(style: .opacity, accessibilityLabel: "Layer opacity")
    private let blendPill = LayersPillButton(style: .blendMode, accessibilityLabel: "Blend mode")

    private let scrollView = NSScrollView()
    /// Holds the table and owns the scroll document height (NSTableView otherwise
    /// auto-resizes itself to the clip height and the list cannot scroll).
    private let listContainer = LayersDocumentContainerView()
    private let tableView = LayersTableView()

    private let addButton = LayersIconButton(
        glyph: .plus, tooltip: "Add layer", accessibilityLabel: "Add layer"
    )
    private let contrastButton = LayersIconButton(
        glyph: .contrast, tooltip: "Add adjustment", accessibilityLabel: "Add adjustment"
    )
    private let maskButton = LayersIconButton(
        glyph: .mask, tooltip: "Add mask", accessibilityLabel: "Add mask"
    )
    private let groupButton = LayersIconButton(
        glyph: .folder, tooltip: "Group layers", accessibilityLabel: "Group layers"
    )
    private let deleteButton = LayersIconButton(
        glyph: .trash, tooltip: "Delete layer", accessibilityLabel: "Delete layer"
    )

    // MARK: Static data

    private static let rowDragType = NSPasteboard.PasteboardType("com.voodesign.native.layers.row")
    private static let cellIdentifier = NSUserInterfaceItemIdentifier("LayerRowCell")

    private static let opacityPresets: [Int] = [100, 75, 50, 25, 0]
    private static let blendModes: [(title: String, raw: String)] = [
        ("Normal", "source-over"),
        ("Multiply", "multiply"),
        ("Screen", "screen"),
        ("Overlay", "overlay"),
        ("Darken", "darken"),
        ("Lighten", "lighten"),
        ("Color Dodge", "color-dodge"),
        ("Color Burn", "color-burn"),
        ("Hard Light", "hard-light"),
        ("Soft Light", "soft-light"),
        ("Difference", "difference"),
        ("Exclusion", "exclusion"),
        ("Hue", "hue"),
        ("Saturation", "saturation"),
        ("Color", "color"),
        ("Luminosity", "luminosity")
    ]

    private var scrollViewHeightConstraint: NSLayoutConstraint?
    private var isSyncingSelection: Bool = false
    private var pendingRevealRow: Int?

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
        setAccessibilityIdentifier(AccessibilityCatalog.layersTree)
        setAccessibilityRole(.group)
        setAccessibilityLabel("Layers")

        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.45
        layer?.shadowRadius = 18.0
        layer?.shadowOffset = CGSize(width: 0, height: -6)

        // 1. Header "LAYERS" (11pt semibold, letterspaced, muted).
        headerLabel.translatesAutoresizingMaskIntoConstraints = false
        headerLabel.attributedStringValue = NSAttributedString(
            string: "LAYERS",
            attributes: [
                .font: ThemeFonts.system(size: 11, weight: .semibold),
                .foregroundColor: LayersPalette.headerText,
                .kern: 1.0
            ]
        )
        addSubview(headerLabel)

        countBadge.translatesAutoresizingMaskIntoConstraints = false
        countBadge.font = ThemeFonts.monoDigit(size: 9, weight: .regular)
        countBadge.textColor = LayersPalette.rowNameMuted
        countBadge.isHidden = true
        addSubview(countBadge)

        // 2. Header search / sort buttons (13pt icons in 21×21 p4 buttons).
        searchButton.translatesAutoresizingMaskIntoConstraints = false
        searchButton.iconSize = LayersMetrics.headerIconSize
        searchButton.setAccessibilityIdentifier("Layers.Search")
        searchButton.onClick = { [weak self] in self?.onSearchTapped?() }
        addSubview(searchButton)

        sortButton.translatesAutoresizingMaskIntoConstraints = false
        sortButton.iconSize = LayersMetrics.headerIconSize
        sortButton.setAccessibilityIdentifier("Layers.Sort")
        sortButton.onClick = { [weak self] in self?.onSortTapped?() }
        addSubview(sortButton)

        // 3. Opacity / blend pills.
        opacityPill.translatesAutoresizingMaskIntoConstraints = false
        opacityPill.setAccessibilityIdentifier("Layers.Opacity")
        opacityPill.target = self
        opacityPill.action = #selector(handleOpacityPillClick)
        addSubview(opacityPill)

        blendPill.translatesAutoresizingMaskIntoConstraints = false
        blendPill.setAccessibilityIdentifier("Layers.Blend")
        blendPill.target = self
        blendPill.action = #selector(handleBlendPillClick)
        addSubview(blendPill)

        // 4. Layer list.
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.scrollerStyle = .overlay
        scrollView.verticalScrollElasticity = .allowed
        scrollView.horizontalScrollElasticity = .none
        scrollView.focusRingType = .none
        scrollView.contentView.drawsBackground = false
        addSubview(scrollView)

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("LayerCol"))
        column.title = "Layers"
        column.resizingMask = .autoresizingMask
        tableView.addTableColumn(column)
        tableView.headerView = nil
        tableView.style = .plain
        tableView.backgroundColor = .clear
        tableView.dataSource = self
        tableView.delegate = self
        tableView.rowHeight = LayersMetrics.rowHeight
        tableView.intercellSpacing = NSSize(width: 0, height: LayersMetrics.rowSpacing)
        tableView.selectionHighlightStyle = .none
        tableView.focusRingType = .none
        tableView.usesAlternatingRowBackgroundColors = false
        tableView.gridStyleMask = []
        tableView.allowsColumnResizing = false
        tableView.allowsColumnReordering = false
        tableView.allowsMultipleSelection = false
        tableView.columnAutoresizingStyle = .lastColumnOnlyAutoresizingStyle
        tableView.setAccessibilityIdentifier(AccessibilityCatalog.layersTree)
        tableView.ownerPanel = self

        // Drag-to-reorder.
        tableView.registerForDraggedTypes([Self.rowDragType])
        tableView.setDraggingSourceOperationMask(.move, forLocal: true)
        tableView.draggingDestinationFeedbackStyle = .gap
        tableView.target = self
        tableView.doubleAction = #selector(handleTableDoubleClick)
        tableView.onOptionMoveUp = { [weak self] in self?.moveSelectedRow(by: -1) }
        tableView.onOptionMoveDown = { [weak self] in self?.moveSelectedRow(by: 1) }

        listContainer.autoresizingMask = []
        listContainer.frame = NSRect(x: 0, y: 0, width: 248, height: 30)
        tableView.autoresizingMask = []
        tableView.frame = NSRect(x: 0, y: 0, width: 248, height: 30)
        listContainer.addSubview(tableView)
        scrollView.documentView = listContainer

        // 5. Footer toolbar.
        let footerButtons: [(LayersIconButton, String, String)] = [
            (addButton, "Layers.Add", "Add layer"),
            (contrastButton, "Layers.Contrast", "Add adjustment"),
            (maskButton, "Layers.Mask", "Add mask"),
            (groupButton, "Layers.Group", "Group layers"),
            (deleteButton, "Layers.Delete", "Delete layer")
        ]
        for (button, identifier, label) in footerButtons {
            button.translatesAutoresizingMaskIntoConstraints = false
            button.setAccessibilityIdentifier(identifier)
            button.setAccessibilityLabel(label)
            addSubview(button)
        }
        addButton.onClick = { [weak self] in self?.onAddLayer?() }
        contrastButton.onClick = { [weak self] in self?.onAddMask?() }
        maskButton.onClick = { [weak self] in self?.onAddMask?() }
        groupButton.onClick = { [weak self] in self?.onGroupLayers?() }
        deleteButton.hoverTint = NSColor(hex: "#FB7185")
        deleteButton.onClick = { [weak self] in self?.onDeleteSelected?() }

        // 6. Constraints.
        let footerSize = LayersMetrics.footerButtonSize
        let headerButtonSize = LayersMetrics.headerButtonSize
        NSLayoutConstraint.activate([
            headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: LayersMetrics.headerTitleTop),
            headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.headerInset),
            headerLabel.heightAnchor.constraint(equalToConstant: LayersMetrics.headerTitleHeight),

            sortButton.trailingAnchor.constraint(equalTo: trailingAnchor,
                                                 constant: -(LayersMetrics.contentInset + 8)),
            sortButton.centerYAnchor.constraint(equalTo: headerLabel.centerYAnchor),
            sortButton.widthAnchor.constraint(equalToConstant: headerButtonSize),
            sortButton.heightAnchor.constraint(equalToConstant: headerButtonSize),

            searchButton.trailingAnchor.constraint(equalTo: sortButton.leadingAnchor, constant: -4),
            searchButton.centerYAnchor.constraint(equalTo: headerLabel.centerYAnchor),
            searchButton.widthAnchor.constraint(equalToConstant: headerButtonSize),
            searchButton.heightAnchor.constraint(equalToConstant: headerButtonSize),

            countBadge.centerYAnchor.constraint(equalTo: headerLabel.centerYAnchor),
            countBadge.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),

            opacityPill.topAnchor.constraint(equalTo: topAnchor, constant: LayersMetrics.pillTop),
            opacityPill.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.contentInset),
            opacityPill.heightAnchor.constraint(equalToConstant: LayersMetrics.pillHeight),

            blendPill.topAnchor.constraint(equalTo: opacityPill.topAnchor),
            blendPill.leadingAnchor.constraint(equalTo: opacityPill.trailingAnchor, constant: LayersMetrics.pillGap),
            blendPill.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.contentInset),
            blendPill.heightAnchor.constraint(equalToConstant: LayersMetrics.pillHeight),
            blendPill.widthAnchor.constraint(equalTo: opacityPill.widthAnchor),

            scrollView.topAnchor.constraint(equalTo: opacityPill.bottomAnchor, constant: 8),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.rowInset),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.rowInset),
            scrollView.bottomAnchor.constraint(lessThanOrEqualTo: addButton.topAnchor, constant: -18),

            addButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.footerLeadingInset),
            addButton.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -LayersMetrics.footerBottomInset),
            addButton.widthAnchor.constraint(equalToConstant: footerSize),
            addButton.heightAnchor.constraint(equalToConstant: footerSize),

            contrastButton.leadingAnchor.constraint(equalTo: addButton.trailingAnchor, constant: LayersMetrics.footerSpacing),
            contrastButton.centerYAnchor.constraint(equalTo: addButton.centerYAnchor),
            contrastButton.widthAnchor.constraint(equalToConstant: footerSize),
            contrastButton.heightAnchor.constraint(equalToConstant: footerSize),

            maskButton.leadingAnchor.constraint(equalTo: contrastButton.trailingAnchor, constant: LayersMetrics.footerSpacing),
            maskButton.centerYAnchor.constraint(equalTo: addButton.centerYAnchor),
            maskButton.widthAnchor.constraint(equalToConstant: footerSize),
            maskButton.heightAnchor.constraint(equalToConstant: footerSize),

            groupButton.leadingAnchor.constraint(equalTo: maskButton.trailingAnchor, constant: LayersMetrics.footerSpacing),
            groupButton.centerYAnchor.constraint(equalTo: addButton.centerYAnchor),
            groupButton.widthAnchor.constraint(equalToConstant: footerSize),
            groupButton.heightAnchor.constraint(equalToConstant: footerSize),

            deleteButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.footerLeadingInset),
            deleteButton.centerYAnchor.constraint(equalTo: addButton.centerYAnchor),
            deleteButton.widthAnchor.constraint(equalToConstant: footerSize),
            deleteButton.heightAnchor.constraint(equalToConstant: footerSize)
        ])

        let heightConstraint = scrollView.heightAnchor.constraint(
            equalToConstant: rowBlockHeight(3)
        )
        heightConstraint.priority = .defaultHigh
        heightConstraint.isActive = true
        scrollViewHeightConstraint = heightConstraint

        refreshPills()
    }

    /// Height of `count` stacked rows: n * rowHeight + (n-1) * rowSpacing.
    private func rowBlockHeight(_ count: Int) -> CGFloat {
        guard count > 0 else { return 0 }
        return CGFloat(count) * LayersMetrics.rowHeight
            + CGFloat(count - 1) * LayersMetrics.rowSpacing
    }

    // MARK: Public configuration

    // MARK: - Row Context Menu

    public func selectRowForContextMenu(_ row: Int) {
        guard row >= 0, row < nodes.count else { return }
        selectedNodeId = nodes[row].id
        tableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        onSelectNode?(nodes[row].id)
        needsDisplay = true
    }

    public func buildRowContextMenu(row: Int) -> NSMenu {
        let menu = NSMenu()
        guard row >= 0, row < nodes.count else { return menu }
        let node = nodes[row]

        let rename = NSMenuItem(title: "重命名 (Rename)", action: #selector(contextRename(_:)), keyEquivalent: "")
        rename.target = self
        rename.tag = row
        menu.addItem(rename)

        let visibility = NSMenuItem(title: node.style.visible ? "隐藏 (Hide)" : "显示 (Show)",
                                    action: #selector(contextToggleVisibility(_:)), keyEquivalent: "")
        visibility.target = self
        visibility.tag = row
        menu.addItem(visibility)

        let lock = NSMenuItem(title: node.style.locked ? "解锁 (Unlock)" : "锁定 (Lock)",
                              action: #selector(contextToggleLock(_:)), keyEquivalent: "")
        lock.target = self
        lock.tag = row
        menu.addItem(lock)

        menu.addItem(NSMenuItem.separator())

        let duplicate = NSMenuItem(title: "创建副本 (Duplicate)", action: #selector(contextDuplicate(_:)), keyEquivalent: "")
        duplicate.target = self
        duplicate.tag = row
        menu.addItem(duplicate)

        let group = NSMenuItem(title: "编组 (Group)", action: #selector(contextGroup(_:)), keyEquivalent: "")
        group.target = self
        group.tag = row
        menu.addItem(group)

        let delete = NSMenuItem(title: "删除 (Delete)", action: #selector(contextDelete(_:)), keyEquivalent: "")
        delete.target = self
        delete.tag = row
        menu.addItem(delete)

        return menu
    }

    @objc private func contextRename(_ sender: NSMenuItem) {
        let row = sender.tag
        guard row >= 0, row < nodes.count else { return }
        selectedNodeId = nodes[row].id
        tableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        if let cell = tableView.view(atColumn: 0, row: row, makeIfNecessary: true) as? LayerRowCell {
            cell.beginRename()
        }
    }

    @objc private func contextToggleVisibility(_ sender: NSMenuItem) {
        let row = sender.tag
        guard row >= 0, row < nodes.count else { return }
        let node = nodes[row]
        onToggleVisibility?(node.id, !node.style.visible)
    }

    @objc private func contextToggleLock(_ sender: NSMenuItem) {
        let row = sender.tag
        guard row >= 0, row < nodes.count else { return }
        let node = nodes[row]
        onToggleLock?(node.id, !node.style.locked)
    }

    @objc private func contextDuplicate(_ sender: NSMenuItem) {
        let row = sender.tag
        guard row >= 0, row < nodes.count else { return }
        selectedNodeId = nodes[row].id
        tableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        onSelectNode?(nodes[row].id)
        onDuplicateSelected?()
    }

    @objc private func contextGroup(_ sender: NSMenuItem) {
        onGroupLayers?()
    }

    @objc private func contextDelete(_ sender: NSMenuItem) {
        onDeleteSelected?()
    }

    public func configure(with nodes: [VOONode], selectedId: String?) {
        self.nodes = nodes
        self.selectedNodeId = selectedId
        countBadge.stringValue = "\(nodes.count)"

        tableView.reloadData()
        refreshPills()
        updateVisibleRowHeight()
        syncTableGeometry()
        needsDisplay = true

        isSyncingSelection = true
        if let selectedId = selectedId, let idx = nodes.firstIndex(where: { $0.id == selectedId }) {
            tableView.selectRowIndexes(IndexSet(integer: idx), byExtendingSelection: false)
            pendingRevealRow = idx
        } else {
            tableView.deselectAll(nil)
        }
        isSyncingSelection = false
        needsLayout = true
    }

    // MARK: Layout

    public override func layout() {
        super.layout()
        updateVisibleRowHeight()
        syncTableGeometry()
        if let row = pendingRevealRow {
            pendingRevealRow = nil
            revealRowIfNeeded(row, clipHeight: scrollViewHeightConstraint?.constant ?? 0)
        }
        needsDisplay = true
    }

    /// Scrolls only when the requested row is not already fully visible. Computed
    /// against the clip height that the constraint is about to apply this pass.
    private func revealRowIfNeeded(_ row: Int, clipHeight: CGFloat) {
        guard row >= 0, row < tableView.numberOfRows, clipHeight > 0 else { return }
        let rowRect = tableView.rect(ofRow: row)
        let scrollViewOrigin = scrollView.contentView.bounds.origin
        let currentOffset = scrollViewOrigin.y
        var target = currentOffset
        if rowRect.minY < currentOffset {
            target = rowRect.minY
        } else if rowRect.maxY > currentOffset + clipHeight {
            target = rowRect.maxY - clipHeight
        }
        let maxOffset = max(0, tableView.frame.height - clipHeight)
        target = max(0, min(target, maxOffset))
        guard abs(target - currentOffset) > 0.5 else { return }
        scrollView.contentView.scroll(to: NSPoint(x: scrollViewOrigin.x, y: target))
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }

    /// Sizes the list area to whole rows only (like the web card, which never shows a
    /// half-cut row above the footer toolbar).
    private func updateVisibleRowHeight() {
        guard bounds.height > 0 else { return }
        let stride = LayersMetrics.rowHeight + LayersMetrics.rowSpacing
        let scrollTopFromTop = bounds.height - scrollView.frame.maxY
        let footerTopFromTop = bounds.height - addButton.frame.maxY
        // 18 = footer mt8 + divider 1 + pt10 (list bottom sits 8pt above the divider).
        let available = max(0, footerTopFromTop - 18.0 - scrollTopFromTop)
        let capacity = max(1, Int(floor((available + LayersMetrics.rowSpacing) / stride)))
        let count = max(1, nodes.count)
        let wanted = rowBlockHeight(min(count, capacity))
        let desired = max(0, min(available, wanted))
        if let constraint = scrollViewHeightConstraint, abs(constraint.constant - desired) > 0.5 {
            constraint.constant = desired
        }
    }

    private func syncTableGeometry() {
        let width = max(1.0, scrollView.contentSize.width)
        if let column = tableView.tableColumns.first, abs(column.width - width) > 0.5 {
            column.width = width
        }
        let rowsHeight = rowBlockHeight(max(nodes.count, 1))
        let requiredHeight = max(scrollView.contentSize.height, rowsHeight)
        let target = NSRect(x: 0, y: 0, width: width, height: requiredHeight)
        if abs(listContainer.frame.width - width) > 0.5 || abs(listContainer.frame.height - requiredHeight) > 0.5 {
            listContainer.frame = target
        }
        if abs(tableView.frame.width - width) > 0.5 || abs(tableView.frame.height - requiredHeight) > 0.5 {
            tableView.autoresizingMask = []
            tableView.frame = target
        }
    }

    // MARK: Pill state & menus

    private func refreshPills() {
        guard let node = selectedNode else {
            opacityPill.titleText = "100"
            opacityPill.isActive = false
            opacityPill.setAccessibilityValue("No selection")
            blendPill.titleText = "Normal"
            blendPill.isActive = false
            blendPill.setAccessibilityValue("No selection")
            return
        }
        opacityPill.titleText = "\(Int(round(node.style.opacity * 100)))"
        opacityPill.isActive = true
        opacityPill.setAccessibilityValue("\(Int(round(node.style.opacity * 100))) percent")
        blendPill.titleText = Self.displayName(forBlendMode: node.style.blendMode)
        blendPill.isActive = true
        blendPill.setAccessibilityValue(blendPill.titleText)
    }

    private static func displayName(forBlendMode raw: String) -> String {
        let key = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if key.isEmpty || key.contains("source") || key == "normal" || key == "正常" {
            return "Normal"
        }
        if let match = blendModes.first(where: { $0.raw == key }) {
            return match.title
        }
        if let match = blendModes.first(where: { $0.title.lowercased() == key }) {
            return match.title
        }
        return raw.capitalized
    }

    @objc private func handleOpacityPillClick() {
        guard let node = selectedNode else { return }
        let currentPercent = Int(round(node.style.opacity * 100))
        let menu = NSMenu()
        menu.autoenablesItems = false
        for preset in Self.opacityPresets {
            let item = NSMenuItem(
                title: "\(preset)%",
                action: #selector(handleOpacityMenuSelection(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.tag = preset
            item.state = (preset == currentPercent) ? .on : .off
            menu.addItem(item)
        }
        menu.popUp(
            positioning: nil,
            at: NSPoint(x: 0, y: opacityPill.bounds.height + 4),
            in: opacityPill
        )
    }

    @objc private func handleBlendPillClick() {
        guard let node = selectedNode else { return }
        let currentRaw = node.style.blendMode.lowercased()
        let currentDisplay = Self.displayName(forBlendMode: node.style.blendMode).lowercased()
        let menu = NSMenu()
        menu.autoenablesItems = false
        for mode in Self.blendModes {
            let item = NSMenuItem(
                title: mode.title,
                action: #selector(handleBlendMenuSelection(_:)),
                keyEquivalent: ""
            )
            item.target = self
            item.representedObject = mode.raw
            let isCurrent = (mode.raw == currentRaw || mode.title.lowercased() == currentDisplay)
            item.state = isCurrent ? .on : .off
            menu.addItem(item)
        }
        menu.popUp(
            positioning: nil,
            at: NSPoint(x: 0, y: blendPill.bounds.height + 4),
            in: blendPill
        )
    }

    @objc private func handleOpacityMenuSelection(_ sender: NSMenuItem) {
        let percent = sender.tag
        opacityPill.titleText = "\(percent)"
        opacityPill.isActive = true
        opacityPill.setAccessibilityValue("\(percent) percent")
        onOpacityChange?(CGFloat(percent) / 100.0)
    }

    @objc private func handleBlendMenuSelection(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String else { return }
        blendPill.titleText = sender.title
        blendPill.isActive = true
        blendPill.setAccessibilityValue(sender.title)
        onBlendModeChange?(raw)
    }

    // MARK: Reorder helpers

    private func moveSelectedRow(by offset: Int) {
        let row = tableView.selectedRow
        guard row >= 0, row < nodes.count, let callback = onMoveLayer else { return }
        let target = max(0, min(nodes.count - 1, row + offset))
        guard target != row else { return }
        callback(nodes[row].id, target)
    }

    @objc private func handleTableDoubleClick() {
        let row = tableView.clickedRow
        guard row >= 0, row < nodes.count,
              let cell = tableView.view(atColumn: 0, row: row, makeIfNecessary: false) as? LayerRowCell
        else { return }
        cell.beginRename()
    }

    // MARK: NSTableViewDataSource & Delegate

    public func numberOfRows(in tableView: NSTableView) -> Int {
        return nodes.count
    }

    public func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < nodes.count else { return nil }
        let node = nodes[row]
        let cell = (tableView.makeView(withIdentifier: Self.cellIdentifier, owner: self) as? LayerRowCell)
            ?? LayerRowCell(identifier: Self.cellIdentifier)
        let isSelected = (node.id == selectedNodeId)
        cell.configure(node: node, isSelected: isSelected)

        cell.onToggleVisible = { [weak self] in
            guard let self = self else { return }
            self.onToggleVisibility?(node.id, !node.style.visible)
        }
        cell.onToggleLock = { [weak self] in
            guard let self = self else { return }
            self.onToggleLock?(node.id, !node.style.locked)
        }
        cell.onRename = { [weak self] newName in
            guard let self = self else { return }
            self.onRenameNode?(node.id, newName)
        }
        return cell
    }

    public func tableViewSelectionDidChange(_ notification: Notification) {
        guard !isSyncingSelection else { return }
        let row = tableView.selectedRow
        guard row >= 0 && row < nodes.count else { return }
        let node = nodes[row]
        let changed = (selectedNodeId != node.id)
        selectedNodeId = node.id
        refreshPills()
        refreshVisibleCellsSelection()
        if changed {
            onSelectNode?(node.id)
        }
    }

    /// Re-configures the visible cells so the mint selected row follows the table
    /// selection without calling `reloadData()` (which would drop the row selection).
    private func refreshVisibleCellsSelection() {
        for row in 0..<tableView.numberOfRows {
            guard row < nodes.count else { continue }
            guard let cell = tableView.view(atColumn: 0, row: row, makeIfNecessary: false) as? LayerRowCell else {
                continue
            }
            cell.configure(node: nodes[row], isSelected: nodes[row].id == selectedNodeId)
        }
    }

    // MARK: Drag to reorder

    public func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> NSPasteboardWriting? {
        guard row >= 0, row < nodes.count else { return nil }
        let item = NSPasteboardItem()
        item.setString(nodes[row].id, forType: Self.rowDragType)
        return item
    }

    public func tableView(
        _ tableView: NSTableView,
        validateDrop info: NSDraggingInfo,
        proposedRow row: Int,
        proposedDropOperation dropOperation: NSTableView.DropOperation
    ) -> NSDragOperation {
        guard info.draggingSource as? NSTableView === tableView else { return [] }
        if dropOperation == .on {
            tableView.setDropRow(row, dropOperation: .above)
        }
        return .move
    }

    public func tableView(
        _ tableView: NSTableView,
        acceptDrop info: NSDraggingInfo,
        row: Int,
        dropOperation: NSTableView.DropOperation
    ) -> Bool {
        guard let rawId = info.draggingPasteboard.string(forType: Self.rowDragType),
              let sourceIndex = nodes.firstIndex(where: { $0.id == rawId }),
              let callback = onMoveLayer
        else { return false }

        var targetIndex = row
        if sourceIndex < targetIndex {
            targetIndex -= 1
        }
        targetIndex = max(0, min(nodes.count - 1, targetIndex))
        guard targetIndex != sourceIndex else { return false }
        callback(nodes[sourceIndex].id, targetIndex)
        return true
    }

    // MARK: Chrome

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = CGPath(
            roundedRect: rect,
            cornerWidth: LayersMetrics.cornerRadius,
            cornerHeight: LayersMetrics.cornerRadius,
            transform: nil
        )
        ctx.setFillColor(LayersPalette.cardFill.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        ctx.setStrokeColor(LayersPalette.cardBorder.cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()

        // Footer divider sits pt10 above the footer toolbar.
        let dividerY = addButton.frame.maxY + 10.0
        ctx.setStrokeColor(LayersPalette.divider.cgColor)
        ctx.setLineWidth(1.0)
        ctx.strokeLineSegments(between: [
            CGPoint(x: 12.0, y: dividerY),
            CGPoint(x: max(12.0, bounds.width - 12.0), y: dividerY)
        ])
    }
}
