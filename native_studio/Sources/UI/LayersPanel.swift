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
    static let divider = NSColor(white: 1.0, alpha: 0.08)

    static let headerText = NSColor(hex: "#a3a3a3")   // neutral-400
    static let iconResting = NSColor(white: 0.62, alpha: 1.0)
    static let iconHover = NSColor(white: 0.95, alpha: 1.0)
    static let iconMuted = NSColor(white: 0.45, alpha: 1.0)

    /// Web panel tab strip (`bg-white/[0.04]` + `bg-white/[0.12]` active pill).
    static let tabStripFill = NSColor(white: 1.0, alpha: 0.04)
    static let tabActiveFill = NSColor(white: 1.0, alpha: 0.12)
    static let tabActiveText = NSColor(white: 1.0, alpha: 1.0)
    static let tabInactiveText = NSColor(hex: "#a3a3a3")   // neutral-400

    /// Web field surface (`bg-white/[0.06]` over the black/95 card ≈ #111111).
    /// The old #262626 token read roughly twice as bright as the web pills.
    static let pillFill = NSColor(white: 0.065, alpha: 1.0)
    static let pillFillHover = NSColor(white: 0.12, alpha: 1.0)
    static let pillText = NSColor(white: 0.86, alpha: 1.0)
    static let pillTextMuted = NSColor(white: 0.38, alpha: 1.0)
    static let chevron = NSColor(white: 0.55, alpha: 1.0)

    static let rowHover = NSColor(white: 1.0, alpha: 0.08)
    /// Web selected row: `bg-neutral-800` + `inset 0 0 0 1px #a7ffd4`.
    static let rowSelectedFill = NSColor(hex: "#262626")
    static let rowSelectedRing = NSColor(hex: "#a7ffd4")
    static let rowSelectedBorder = NSColor.clear
    static let depthGuide = NSColor(white: 1.0, alpha: 0.10)
    /// Web row name: `text-neutral-200`, neutral-500 when hidden. Selection is
    /// signalled by the neutral-800 fill + mint ring, not by the text colour.
    static let rowName = NSColor(hex: "#e5e5e5")   // neutral-200
    static let rowNameSelected = NSColor(hex: "#e5e5e5")   // neutral-200
    static let rowNameMuted = NSColor(hex: "#737373")   // neutral-500
    static let hexText = NSColor(hex: "#a3a3a3")   // neutral-400

    static let checkboxBorder = NSColor(white: 1.0, alpha: 0.24)
    static let checkboxBorderHover = NSColor(white: 1.0, alpha: 0.42)
    static let checkboxFillHover = NSColor(white: 1.0, alpha: 0.07)
    static let checkboxOn = ThemeTokens.colorMint
    static let lockAmber = NSColor(hex: "#FFB84D")

    static let shapeOutline = NSColor(white: 1.0, alpha: 0.55)
    static let shapeOutlineSelected = ThemeTokens.colorMint
    /// Layer thumbnail tile (web `bg-neutral-800` / `inset 0 0 0 1px rgb(255 255 255 / 25%)`).
    static let thumbTileFill = NSColor(hex: "#262626")
    static let thumbRing = NSColor(white: 1.0, alpha: 0.25)
    static let thumbDotRing = NSColor(white: 1.0, alpha: 0.20)
    static let kindGlyph = NSColor(hex: "#a3a3a3")   // neutral-400
    static let assetsEmptyText = NSColor(hex: "#737373")   // neutral-500
}

private enum LayersMetrics {
    static let cornerRadius: CGFloat = 24
    static let contentInset: CGFloat = 12
    /// Header row (web `px-1 pb-1.5 pt-1 mb-2`): tab strip + search/sort actions.
    /// 17 = card padding 12 + pt-1 4 + the 1px border the web box counts in.
    static let headerTop: CGFloat = 17
    static let headerInset: CGFloat = 16          // card padding 12 + px-1 4
    static let headerTitleTop: CGFloat = 16       // legacy header (now hidden)
    static let headerTitleHeight: CGFloat = 20
    static let headerButtonSize: CGFloat = 28     // web actions h-7 w-7
    static let headerIconSize: CGFloat = 13
    static let headerBottomGap: CGFloat = 14      // pb-1.5 6 + mb-2 8
    static let tabStripHeight: CGFloat = 32       // tablist = h-7 tab + 2pt inset *2
    static let tabSegmentHeight: CGFloat = 28
    static let tabStripRadius: CGFloat = 12      // web tablist rounded-xl
    static let tabSegmentRadius: CGFloat = 8
    static let tabStripInset: CGFloat = 2         // tablist p-0.5
    static let tabActionGap: CGFloat = 8          // header gap-2
    /// Controls row (web `h-7 gap-2 mb-2 border-b pb-2`).
    static let pillHeight: CGFloat = 28
    static let pillRadius: CGFloat = 12
    static let pillGap: CGFloat = 8
    static let blendPillWidth: CGFloat = 144
    static let opacityPillWidth: CGFloat = 80
    static let controlBottomGap: CGFloat = 8
    static let treeTopGap: CGFloat = 8
    static let treeBottomGap: CGFloat = 8
    static let footerTopGap: CGFloat = 8
    static let dividerHeight: CGFloat = 1
    static let rowHeight: CGFloat = 32       // web: min-h-8 (h32, py-1)
    static let rowSpacing: CGFloat = 4
    static let rowInset: CGFloat = 12
    static let rowCornerRadius: CGFloat = 8  // web rounded-lg
    /// Disclosure slot: 28×28 hit area with a 12pt chevron (web `-mx-1.5 -my-1`).
    /// The negative margin makes the visible box start 6pt before the row padding.
    static let disclosureSlot: CGFloat = 28
    static let disclosureGlyphSize: CGFloat = 12
    /// Visibility slot: 28×28 hit area with a 13pt eye (web `-mx-1.5 -my-1`).
    static let visibilitySlot: CGFloat = 28
    static let visibilityGlyphSize: CGFloat = 13
    /// Width a slot contributes to the row flow after its -mx-1.5 margins.
    static let slotFlowOverlap: CGFloat = 6
    static let checkboxLeading: CGFloat = 2   // row padding 8 − negative margin 6
    static let depthIndent: CGFloat = 16      // web `paddingLeft: 8 + depth*16`
    static let kindContainerSize: CGFloat = 28
    static let kindThumbHeight: CGFloat = 20
    static let kindThumbRadius: CGFloat = 6
    static let kindGlyphSize: CGFloat = 13    // web `TypeIcon size={13}`
    static let swatchDotSize: CGFloat = 14    // web `h-3.5 w-3.5`
    static let rowContentGap: CGFloat = 6
    static let footerButtonSize: CGFloat = 28 // web footer buttons h-7 w-7
    static let footerIconSize: CGFloat = 13   // web footer icons 13
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
    case chevronRight
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
        case .chevronRight:
            VooIconFactory.drawChevronRight(in: rect, color: color, strokeWidth: strokeWidth)
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

// MARK: - Panel tabs (web `editor_layers_header.jsx` tablist: Layers | Assets)

/// One segment of the LAYERS card tab strip. Active segment paints the
/// `bg-white/[0.12]` rounded pill and white label, inactive stays transparent
/// with a neutral-400 label (hover lifts it to neutral-200).
final class LayersTabButton: NSButton {
    var segmentTitle: String = "" {
        didSet { if oldValue != segmentTitle { needsDisplay = true } }
    }
    var isActive: Bool = false {
        didSet { if oldValue != isActive { needsDisplay = true } }
    }
    var onSelect: (() -> Void)?

    private var isHovered = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }

    init(title: String) {
        segmentTitle = title
        super.init(frame: NSRect(x: 0, y: 0, width: 74, height: LayersMetrics.tabSegmentHeight))
        isBordered = false
        focusRingType = .none
        self.title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.radioButton)
        setAccessibilityLabel(title)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() { onSelect?() }

    /// Drawn in the same y-down design space as `VooIconFactory` (unflipped context).
    override var isFlipped: Bool { false }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: self,
            userInfo: nil
        ))
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    override func mouseEntered(with event: NSEvent) { isHovered = true }
    override func mouseExited(with event: NSEvent) { isHovered = false }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        if isActive {
            let pill = bounds.insetBy(dx: 0.5, dy: 0.5)
            ctx.setFillColor(LayersPalette.tabActiveFill.cgColor)
            ctx.addPath(CGPath(roundedRect: pill,
                               cornerWidth: LayersMetrics.tabSegmentRadius,
                               cornerHeight: LayersMetrics.tabSegmentRadius,
                               transform: nil))
            ctx.fillPath()
        }

        let color: NSColor
        if isActive {
            color = LayersPalette.tabActiveText
        } else if isHovered {
            color = NSColor(hex: "#e5e5e5")   // neutral-200 hover
        } else {
            color = LayersPalette.tabInactiveText
        }
        let attributes: [NSAttributedString.Key: Any] = [
            .font: ThemeFonts.mono(size: 10, weight: .regular),
            .foregroundColor: color
        ]
        let title = segmentTitle as NSString
        let size = title.size(withAttributes: attributes)
        title.draw(
            at: CGPoint(x: floor(bounds.midX - size.width / 2.0),
                        y: floor(bounds.midY - size.height / 2.0)),
            withAttributes: attributes
        )
    }
}

/// Two-segment tab strip that swaps the card body between the layer tree and
/// the (native-only) empty Assets state.
final class LayersTabStripView: NSView {
    let layersTab = LayersTabButton(title: "Layers")
    let assetsTab = LayersTabButton(title: "Assets")
    var onSelectTab: ((Int) -> Void)?
    private(set) var selectedIndex: Int = 0

    init() {
        super.init(frame: NSRect(x: 0, y: 0, width: 152, height: LayersMetrics.tabStripHeight))
        wantsLayer = true
        layersTab.translatesAutoresizingMaskIntoConstraints = false
        assetsTab.translatesAutoresizingMaskIntoConstraints = false
        layersTab.setAccessibilityIdentifier("Layers.Tab.Layers")
        assetsTab.setAccessibilityIdentifier("Layers.Tab.Assets")
        addSubview(layersTab)
        addSubview(assetsTab)

        let inset = LayersMetrics.tabStripInset
        NSLayoutConstraint.activate([
            layersTab.leadingAnchor.constraint(equalTo: leadingAnchor, constant: inset),
            layersTab.topAnchor.constraint(equalTo: topAnchor, constant: inset),
            layersTab.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -inset),
            assetsTab.leadingAnchor.constraint(equalTo: layersTab.trailingAnchor),
            assetsTab.topAnchor.constraint(equalTo: topAnchor, constant: inset),
            assetsTab.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -inset),
            assetsTab.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -inset),
            assetsTab.widthAnchor.constraint(equalTo: layersTab.widthAnchor)
        ])
        layersTab.onSelect = { [weak self] in self?.select(index: 0) }
        assetsTab.onSelect = { [weak self] in self?.select(index: 1) }
        setSelectedIndex(0, notify: false)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    /// Drawn in the same y-down design space as `VooIconFactory` (unflipped context).
    override var isFlipped: Bool { false }

    func setSelectedIndex(_ index: Int, notify: Bool = true) {
        let clamped = max(0, min(1, index))
        selectedIndex = clamped
        layersTab.isActive = clamped == 0
        assetsTab.isActive = clamped == 1
        layersTab.state = clamped == 0 ? .on : .off
        assetsTab.state = clamped == 1 ? .on : .off
        if notify { onSelectTab?(clamped) }
    }

    private func select(index: Int) {
        guard index != selectedIndex else { return }
        setSelectedIndex(index, notify: true)
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        ctx.setFillColor(LayersPalette.tabStripFill.cgColor)
        ctx.addPath(CGPath(roundedRect: rect,
                           cornerWidth: LayersMetrics.tabStripRadius,
                           cornerHeight: LayersMetrics.tabStripRadius,
                           transform: nil))
        ctx.fillPath()
    }
}

// MARK: - Hairline divider (web `border-b border-white/[0.08]`)

final class LayersDividerView: NSView {
    override var isFlipped: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(LayersPalette.divider.cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: bounds.width, height: max(1.0, bounds.height)))
    }
}

// MARK: - Small icon button (header search / sort, footer actions)

public final class LayersIconButton: NSButton {
    public var glyph: LayersPanelGlyph {
        didSet { if oldValue != glyph { needsDisplay = true } }
    }
    public var onClick: (() -> Void)?
    /// Colour of the glyph at rest; nil keeps the neutral panel icon colour.
    public var idleColor: NSColor? { didSet { needsDisplay = true } }
    /// Icon side length (header 13 / footer 13 / disclosure 12).
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
            color = (isHovered || isHighlighted)
                ? LayersPalette.iconHover
                : (idleColor ?? LayersPalette.iconResting)
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

        // One mono 10 line box shared by the value, the "%" suffix and the blend
        // label, so every glyph in the pill sits on the same baseline. The line
        // box is centred in the 28pt pill: cap-centre lands exactly on pill midY.
        let font = ThemeFonts.mono(size: 10.0, weight: .medium)
        let lineHeight = ceil(font.ascender - font.descender)
        let textTopFromTop = floor((bounds.height - lineHeight) / 2.0)
        // Unflipped view: a text rect whose top edge is `textTopFromTop` below the
        // pill top puts the glyph baseline at `baseline` measured from the bottom.
        let textRectY = bounds.height - textTopFromTop - lineHeight
        func textRect(x: CGFloat, width: CGFloat) -> NSRect {
            NSRect(x: x, y: textRectY, width: width, height: lineHeight)
        }

        switch style {
        case .opacity:
            // Web ScrubField value pill: `100` on the left, muted `%` suffix on
            // the right, no leading glyph.
            let value = titleText as NSString
            value.draw(
                with: textRect(x: 10.0, width: 44.0),
                options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
                attributes: [.font: font, .foregroundColor: textColor]
            )
            // The suffix shares the value's font and baseline (was 9pt on a
            // different baseline, which read as a 1pt vertical jitter).
            let percent = "%" as NSString
            let percentWidth = percent.size(withAttributes: [.font: font]).width
            percent.draw(
                with: textRect(x: bounds.width - 10.0 - percentWidth, width: percentWidth + 1.0),
                options: [.usesLineFragmentOrigin],
                attributes: [.font: font, .foregroundColor: LayersPalette.pillTextMuted]
            )

        case .blendMode:
            // px10 field padding, matching the web FlatSelect trigger.
            (titleText as NSString).draw(
                with: textRect(x: 10.0, width: max(0, bounds.width - 36.0)),
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

// MARK: - Row visibility affordance (web: eye, shown on hover or when hidden)

public final class LayerVisibilityCheckbox: NSButton {
    public var isVisibleState: Bool = true {
        didSet { if oldValue != isVisibleState { refreshAffordance() } }
    }
    /// True while the owning row is hovered: the eye lifts from white/45 to
    /// white/90 (a hidden layer always draws the eye-off at white/90).
    public var isRowHovered: Bool = false {
        didSet { if oldValue != isRowHovered { needsDisplay = true } }
    }
    public var onToggle: (() -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: NSRect(x: 0, y: 0,
                                 width: LayersMetrics.visibilitySlot,
                                 height: LayersMetrics.visibilitySlot))
        configure()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        isBordered = false
        focusRingType = .none
        title = ""
        target = self
        action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Toggle visibility")
        refreshAffordance()
    }

    @objc private func handleClick() { onToggle?() }

    private func refreshAffordance() {
        isHidden = false
        needsDisplay = true
    }

    /// Drawn in the same y-down design space as `VooIconFactory` (unflipped context).
    public override var isFlipped: Bool { false }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    public override func draw(_ dirtyRect: NSRect) {
        // No checkbox box: a bare 14pt eye/eye-off glyph like the web row, white/45
        // at rest, white/90 on row hover or when the layer is hidden.
        let idle: CGFloat = isVisibleState && !isRowHovered ? 0.45 : 0.90
        let color = NSColor(white: idle, alpha: 1.0)
        let side = LayersMetrics.visibilityGlyphSize
        let glyphRect = CGRect(x: bounds.midX - side / 2.0,
                               y: bounds.midY - side / 2.0,
                               width: side, height: side)
        if isVisibleState {
            VooIconFactory.drawEye(in: glyphRect, color: color, strokeWidth: 1.5)
        } else {
            VooIconFactory.drawEyeOff(in: glyphRect, color: color, strokeWidth: 1.5)
        }
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
    /// 28×28 disclosure hit area with a 12pt chevron (web row chevron).
    public let disclosureButton = LayersIconButton(
        glyph: .chevronDown,
        tooltip: "Collapse layer",
        accessibilityLabel: "Collapse layer"
    )
    public let visibilityButton = LayerVisibilityCheckbox()
    public let lockButton = LayerLockButton()
    /// Retained for API compatibility (custom kind glyphs are drawn in `draw(_:)`).
    public let kindIconView = NSImageView()
    public let titleField = NSTextField()
    public let hexLabel = NSTextField(labelWithString: "")

    public var onToggleVisible: (() -> Void)?
    public var onToggleLock: (() -> Void)?
    public var onToggleDisclosure: (() -> Void)?
    public var onRename: ((String) -> Void)?

    private var currentNode: VOONode?
    /// Nesting depth of the row; drives `left padding = 8 + depth*14`.
    private var rowDepth: Int = 0
    private var rowInset: CGFloat = LayersMetrics.checkboxLeading
    private var disclosureLeadingConstraint: NSLayoutConstraint?
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

        disclosureButton.translatesAutoresizingMaskIntoConstraints = false
        disclosureButton.iconSize = LayersMetrics.disclosureGlyphSize
        disclosureButton.idleColor = NSColor(white: 0.40, alpha: 1.0)
        disclosureButton.hoverRadius = 8
        disclosureButton.onClick = { [weak self] in self?.onToggleDisclosure?() }
        addSubview(disclosureButton)

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
        // Web row title: 11px mono medium with a leading-none line box.
        titleField.font = ThemeFonts.mono(size: 11, weight: .regular)
        titleField.textColor = LayersPalette.rowName
        titleField.cell?.wraps = false
        titleField.cell?.isScrollable = true
        (titleField.cell as? NSTextFieldCell)?.lineBreakMode = .byTruncatingTail
        titleField.delegate = self
        addSubview(titleField)

        hexLabel.translatesAutoresizingMaskIntoConstraints = false
        hexLabel.font = ThemeFonts.mono(size: 11, weight: .regular)
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

        let disclosureLeading = disclosureButton.leadingAnchor.constraint(
            equalTo: leadingAnchor,
            constant: LayersMetrics.checkboxLeading
        )
        disclosureLeadingConstraint = disclosureLeading
        let titleLineHeight = ceil(
            (titleField.font ?? ThemeFonts.mono(size: 11, weight: .medium)).ascender
                - (titleField.font ?? ThemeFonts.mono(size: 11, weight: .medium)).descender
        )

        NSLayoutConstraint.activate([
            disclosureLeading,
            disclosureButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            disclosureButton.widthAnchor.constraint(equalToConstant: LayersMetrics.disclosureSlot),
            disclosureButton.heightAnchor.constraint(equalToConstant: LayersMetrics.disclosureSlot),

            visibilityButton.leadingAnchor.constraint(
                equalTo: disclosureButton.trailingAnchor,
                constant: -LayersMetrics.slotFlowOverlap
            ),
            visibilityButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            visibilityButton.widthAnchor.constraint(equalToConstant: LayersMetrics.visibilitySlot),
            visibilityButton.heightAnchor.constraint(equalToConstant: LayersMetrics.visibilitySlot),

            lockButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            lockButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            lockButton.heightAnchor.constraint(equalToConstant: 14),
            lockWidth,

            hexLabel.trailingAnchor.constraint(equalTo: lockButton.leadingAnchor, constant: -6),
            hexLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            hexLabel.heightAnchor.constraint(equalToConstant: 12),
            hexWidth,

            titleField.leadingAnchor.constraint(
                equalTo: visibilityButton.trailingAnchor,
                constant: LayersMetrics.kindContainerSize + LayersMetrics.rowContentGap
            ),
            titleField.centerYAnchor.constraint(equalTo: centerYAnchor),
            titleField.heightAnchor.constraint(equalToConstant: titleLineHeight),
            titleField.trailingAnchor.constraint(lessThanOrEqualTo: hexLabel.leadingAnchor, constant: -8),
            titleField.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -8)
        ])
    }

    public func configure(node: VOONode, isSelected: Bool, depth: Int = 0,
                          hasChildren: Bool = false, isCollapsed: Bool = false) {
        currentNode = node
        apply(rowDepth: depth)
        committedName = node.name
        titleField.stringValue = node.name
        // Web row name: 11px mono (weight 400); the canvas background row uses
        // font-medium. Colour: neutral-200, neutral-500 when hidden.
        let isBackgroundRow = node.name == "Background"
        titleField.font = ThemeFonts.mono(size: 11, weight: isBackgroundRow ? .medium : .regular)
        if isSelected {
            titleField.textColor = LayersPalette.rowNameSelected
        } else if !node.style.visible {
            titleField.textColor = LayersPalette.rowNameMuted
        } else {
            titleField.textColor = LayersPalette.rowName
        }

        // Disclosure chevron only for nodes that have children; the 28pt slot is
        // always reserved, so leaf rows keep the same content grid. The chevron
        // points down when the subtree is open and right when it is collapsed.
        disclosureButton.isHidden = !hasChildren
        disclosureButton.glyph = (hasChildren && isCollapsed) ? .chevronRight : .chevronDown
        disclosureButton.setAccessibilityLabel(
            hasChildren ? (isCollapsed ? "Expand layer" : "Collapse layer") : "Layer"
        )

        visibilityButton.isVisibleState = node.style.visible
        visibilityButton.isRowHovered = isHovered
        lockButton.isLocked = node.style.locked
        lockWidthConstraint?.constant = node.style.locked ? 14 : 0

        let showsHex = isBackgroundRow
        hexLabel.stringValue = showsHex ? node.fill : ""
        hexLabel.isHidden = !showsHex
        // 50pt keeps "#525252" (7 mono glyphs) unclipped while leaving the
        // row name room to render in full next to the eye + colour dot.
        hexWidthConstraint?.constant = showsHex ? 50 : 0

        isRowSelected = isSelected
        setAccessibilityIdentifier("Inspector.LayersTree.Row.\(node.name)")
        needsDisplay = true
    }

    /// Applies the tree indent to the row's leading slot (web: `paddingLeft: 8 + depth*14`).
    private func apply(rowDepth newDepth: Int) {
        rowDepth = max(0, newDepth)
        let inset = LayersMetrics.checkboxLeading + CGFloat(rowDepth) * LayersMetrics.depthIndent
        guard abs(inset - rowInset) > 0.01 else { return }
        rowInset = inset
        disclosureLeadingConstraint?.constant = inset
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
        let radius = LayersMetrics.rowCornerRadius
        let rowPath = CGPath(roundedRect: rowRect, cornerWidth: radius, cornerHeight: radius, transform: nil)

        if isRowSelected {
            ctx.setFillColor(LayersPalette.rowSelectedFill.cgColor)
            ctx.addPath(rowPath)
            ctx.fillPath()
            // Web selection: `shadow-[inset_0_0_0_1px_#a7ffd4]`.
            ctx.setStrokeColor(LayersPalette.rowSelectedRing.cgColor)
            ctx.setLineWidth(1.0)
            ctx.addPath(rowPath)
            ctx.strokePath()
        } else if isHovered {
            ctx.setFillColor(LayersPalette.rowHover.cgColor)
            ctx.addPath(rowPath)
            ctx.fillPath()
        }

        guard let node = currentNode else { return }
        drawDepthGuide(in: ctx)
        drawThumbnail(for: node, in: ctx)
    }

    /// Faint vertical guide for nested rows (web `border-l border-white/10` at
    /// `left: 8 + (depth - 1) * 16`).
    private func drawDepthGuide(in ctx: CGContext) {
        guard rowDepth > 0 else { return }
        let x = floor(8.0 + CGFloat(rowDepth - 1) * LayersMetrics.depthIndent) + 0.5
        ctx.setStrokeColor(LayersPalette.depthGuide.cgColor)
        ctx.setLineWidth(1.0)
        ctx.move(to: CGPoint(x: x, y: 0))
        ctx.addLine(to: CGPoint(x: x, y: bounds.height))
        ctx.strokePath()
    }

    /// Leading preview tile in the row. Matches the web `EditorLayerThumb`:
    /// 28×20 rounded tile for shapes / text, bare 13pt glyph for grouped kinds,
    /// and a 14pt colour dot for the canvas background row.
    private func drawThumbnail(for node: VOONode, in ctx: CGContext) {
        let thumb = CGRect(
            x: rowInset + LayersMetrics.disclosureSlot + LayersMetrics.visibilitySlot
                - LayersMetrics.slotFlowOverlap,
            y: floor((bounds.height - LayersMetrics.kindThumbHeight) / 2.0),
            width: LayersMetrics.kindContainerSize,
            height: LayersMetrics.kindThumbHeight
        )
        let fill = LayersShapeFill.color(from: node.fill)
            ?? LayersShapeFill.color(from: node.stroke)
        let opacity = max(0.05, min(1.0, node.style.opacity))

        // Web canvas background row: bare 14pt colour dot, no kind glyph.
        if node.name == "Background" {
            drawSwatchDot(in: thumb, color: fill, opacity: opacity)
            return
        }

        switch node.kind {
        case .rect:
            drawTile(in: thumb, fill: fill ?? LayersPalette.thumbTileFill, opacity: opacity)
            drawTileRing(in: thumb)
        case .ellipse:
            drawTile(in: thumb, fill: LayersPalette.thumbTileFill, opacity: 1.0)
            drawSwatchDot(in: thumb, color: fill, opacity: opacity)
        case .text:
            drawTile(in: thumb, fill: LayersPalette.thumbTileFill, opacity: 1.0)
            let attributes: [NSAttributedString.Key: Any] = [
                .font: ThemeFonts.mono(size: 11, weight: .medium),
                .foregroundColor: LayersPalette.rowName
            ]
            let glyph = "T" as NSString
            let size = glyph.size(withAttributes: attributes)
            glyph.draw(
                at: CGPoint(x: floor(thumb.midX - size.width / 2.0),
                            y: floor(thumb.midY - size.height / 2.0)),
                withAttributes: attributes
            )
        case .group:
            drawKindGlyph(.folder, in: thumb)
        case .frame:
            drawKindGlyph(.frame, in: thumb)
        case .boolean:
            drawKindGlyph(.diamond, in: thumb)
        case .path:
            drawKindGlyph(.penCurve, in: thumb)
        default:
            drawKindGlyph(.diamond, in: thumb)
        }
    }

    private func drawTile(in rect: CGRect, fill: NSColor, opacity: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        ctx.setFillColor(fill.withAlphaComponent(fill.alphaComponent * opacity).cgColor)
        ctx.addPath(CGPath(
            roundedRect: rect,
            cornerWidth: LayersMetrics.kindThumbRadius,
            cornerHeight: LayersMetrics.kindThumbRadius,
            transform: nil
        ))
        ctx.fillPath()
        ctx.restoreGState()
    }

    /// Web thumbnail ring: `inset 0 0 0 1px rgb(255 255 255 / 25%)`.
    private func drawTileRing(in rect: CGRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setStrokeColor(LayersPalette.thumbRing.cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(CGPath(
            roundedRect: rect.insetBy(dx: 0.5, dy: 0.5),
            cornerWidth: LayersMetrics.kindThumbRadius,
            cornerHeight: LayersMetrics.kindThumbRadius,
            transform: nil
        ))
        ctx.strokePath()
    }

    /// 14pt circle with a white/20 ring, centred in the row's thumbnail slot.
    private func drawSwatchDot(in rect: CGRect, color: NSColor?, opacity: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let side = LayersMetrics.swatchDotSize
        let dot = CGRect(
            x: floor(rect.midX - side / 2.0),
            y: floor(rect.midY - side / 2.0),
            width: side,
            height: side
        ).insetBy(dx: 0.5, dy: 0.5)
        ctx.saveGState()
        if let color = color {
            ctx.setFillColor(color.withAlphaComponent(color.alphaComponent * opacity).cgColor)
            ctx.fillEllipse(in: dot)
        }
        ctx.setStrokeColor(LayersPalette.thumbDotRing.cgColor)
        ctx.setLineWidth(1.0)
        ctx.strokeEllipse(in: dot)
        ctx.restoreGState()
    }

    /// 13pt glyph centred in the 28×20 thumbnail slot (no tile background).
    private func drawKindGlyph(_ glyph: LayersPanelGlyph, in rect: CGRect) {
        let side = LayersMetrics.kindGlyphSize
        let glyphRect = CGRect(
            x: floor(rect.midX - side / 2.0),
            y: floor(rect.midY - side / 2.0),
            width: side,
            height: side
        )
        LayersGlyphDrawing.draw(glyph, in: glyphRect, color: LayersPalette.kindGlyph, strokeWidth: 1.4)
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
        visibilityButton.isRowHovered = true
        needsDisplay = true
    }

    public override func mouseExited(with event: NSEvent) {
        isHovered = false
        visibilityButton.isRowHovered = false
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
        guard row >= 0, row < panel.visibleRowCount else { return super.menu(for: event) }
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

    public var searchQuery: String = "" { didSet { rebuildVisibleRows() } }
    public var onSearchTapped: (() -> Void)?
    public var onSortTapped: (() -> Void)?
    public var onAddLayer: (() -> Void)?
    public var onAddMask: (() -> Void)?
    /// Web footer "add adjustment" action (was mis-wired to `onAddMask`).
    public var onAddAdjustment: (() -> Void)?
    /// Optional expand/collapse hook for the new disclosure chevron. Nil keeps the
    /// chevron visual-only (rows are always expanded until the host adds the state).
    public var onToggleLayerExpanded: ((String) -> Void)?
    public var onGroupLayers: (() -> Void)?
    public var onDeleteSelected: (() -> Void)?
    public var onOpacityChange: ((CGFloat) -> Void)?
    public var onBlendModeChange: ((String) -> Void)?
    public var onMoveLayer: ((String, Int) -> Void)?
    public var onDuplicateSelected: (() -> Void)?

    public private(set) var nodes: [VOONode] = []
    public private(set) var selectedNodeId: String?
    /// Ids of nodes that have at least one child in the current list (chevron rows).
    private var parentNodeIds: Set<String> = []
    /// Rows hidden behind a collapsed ancestor are dropped from `visibleNodes`.
    private var collapsedIds: Set<String> = []
    /// Nodes actually rendered by the table, in `nodes` order but with the
    /// subtrees of collapsed nodes removed. All table row indexes address this
    /// array, while ids/core logic keep using `nodes`.
    private(set) var visibleNodes: [VOONode] = []
    /// Number of table rows currently rendered (used by the table subclass).
    var visibleRowCount: Int { visibleNodes.count }

    public var selectedNode: VOONode? {
        guard let id = selectedNodeId else { return nil }
        return nodes.first { $0.id == id }
    }

    // MARK: Subviews

    private let headerLabel = NSTextField(labelWithString: "LAYERS")
    private let countBadge = NSTextField(labelWithString: "0")
    /// Web card header: `Layers | Assets` tab strip with the search/sort actions.
    private let tabStrip = LayersTabStripView()
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
    /// Web `border-b border-white/[0.08]` hairlines above the tree and the footer.
    private let controlsDivider = LayersDividerView()
    private let footerDivider = LayersDividerView()
    /// Native-only empty state for the Assets tab (no asset model yet).
    private let assetsEmptyLabel = NSTextField(labelWithString: "No assets yet")

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

        // 1. Header: the web card opens with the `Layers | Assets` tab strip and
        //    keeps the search/sort actions on the same row (the old "LAYERS"
        //    title is retired but retained as a hidden compatibility view).
        headerLabel.translatesAutoresizingMaskIntoConstraints = false
        headerLabel.attributedStringValue = NSAttributedString(
            string: "LAYERS",
            attributes: [
                .font: ThemeFonts.mono(size: 11, weight: .medium),
                .foregroundColor: LayersPalette.headerText,
                .kern: 0.55   // tracking-wider (0.05em @11px)
            ]
        )
        headerLabel.isHidden = true
        addSubview(headerLabel)

        countBadge.translatesAutoresizingMaskIntoConstraints = false
        countBadge.font = ThemeFonts.monoDigit(size: 9, weight: .regular)
        countBadge.textColor = LayersPalette.rowNameMuted
        countBadge.isHidden = true
        addSubview(countBadge)

        tabStrip.translatesAutoresizingMaskIntoConstraints = false
        tabStrip.onSelectTab = { [weak self] index in
            self?.setAssetsTabActive(index == 1)
        }
        addSubview(tabStrip)

        // 2. Header search / sort buttons (13pt icons in 28×28 web-size buttons).
        searchButton.translatesAutoresizingMaskIntoConstraints = false
        searchButton.iconSize = LayersMetrics.headerIconSize
        searchButton.setAccessibilityIdentifier("Layers.Search")
        searchButton.onClick = { [weak self] in
            guard let self else { return }
            if let onSearchTapped = self.onSearchTapped {
                onSearchTapped()
            } else {
                NativeLayerSearch.shared.show(
                    relativeTo: self.searchButton, query: self.searchQuery
                ) {
                    [weak self] query in
                    self?.searchQuery = query
                }
            }
        }
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
        listContainer.frame = NSRect(x: 0, y: 0, width: 228, height: 30)
        tableView.autoresizingMask = []
        tableView.frame = NSRect(x: 0, y: 0, width: 228, height: 30)
        listContainer.addSubview(tableView)
        scrollView.documentView = listContainer

        // 4b. Hairlines (web `border-b border-white/[0.08]`) and the Assets empty state.
        for divider in [controlsDivider, footerDivider] {
            divider.translatesAutoresizingMaskIntoConstraints = false
            addSubview(divider)
        }

        assetsEmptyLabel.translatesAutoresizingMaskIntoConstraints = false
        assetsEmptyLabel.font = ThemeFonts.mono(size: 11, weight: .regular)
        assetsEmptyLabel.textColor = LayersPalette.assetsEmptyText
        assetsEmptyLabel.alignment = .center
        assetsEmptyLabel.isHidden = true
        assetsEmptyLabel.setAccessibilityIdentifier("Layers.AssetsEmpty")
        addSubview(assetsEmptyLabel)

        // 5. Footer toolbar. Web order (footer.jsx): [mask][adjustment][new layer]
        // on the left, trash right-aligned; 28×28 buttons with 13pt icons.
        let footerButtons: [(LayersIconButton, String, String)] = [
            (maskButton, "Layers.Mask", "Add mask"),
            (contrastButton, "Layers.Contrast", "Add adjustment"),
            (addButton, "Layers.Add", "Add layer"),
            (groupButton, "Layers.Group", "Group layers"),
            (deleteButton, "Layers.Delete", "Delete layer")
        ]
        for (button, identifier, label) in footerButtons {
            button.translatesAutoresizingMaskIntoConstraints = false
            button.setAccessibilityIdentifier(identifier)
            button.setAccessibilityLabel(label)
            button.iconSize = LayersMetrics.footerIconSize
            addSubview(button)
        }
        maskButton.onClick = { [weak self] in self?.onAddMask?() }
        contrastButton.onClick = { [weak self] in self?.onAddAdjustment?() }
        addButton.onClick = { [weak self] in self?.onAddLayer?() }
        groupButton.onClick = { [weak self] in self?.onGroupLayers?() }
        deleteButton.hoverTint = NSColor(hex: "#FB7185")
        deleteButton.onClick = { [weak self] in self?.onDeleteSelected?() }
        // The group affordance only exists in the multi-select state on the web.
        groupButton.isHidden = true

        // 6. Constraints. Vertical rhythm verified against the live web card
        //    (252/256 × 236, p12): header 17..49, pills 63..91, hairline 99,
        //    tree 108..176 (two 32pt rows + 4pt gap), hairline 187, footer 196..224.
        let footerSize = LayersMetrics.footerButtonSize
        let headerButtonSize = LayersMetrics.headerButtonSize
        NSLayoutConstraint.activate([
            tabStrip.topAnchor.constraint(equalTo: topAnchor, constant: LayersMetrics.headerTop),
            tabStrip.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.headerInset),
            tabStrip.heightAnchor.constraint(equalToConstant: LayersMetrics.tabStripHeight),

            sortButton.trailingAnchor.constraint(equalTo: trailingAnchor,
                                                 constant: -(LayersMetrics.contentInset + 4)),
            sortButton.centerYAnchor.constraint(equalTo: tabStrip.centerYAnchor),
            sortButton.widthAnchor.constraint(equalToConstant: headerButtonSize),
            sortButton.heightAnchor.constraint(equalToConstant: headerButtonSize),

            searchButton.trailingAnchor.constraint(equalTo: sortButton.leadingAnchor, constant: -4),
            searchButton.centerYAnchor.constraint(equalTo: tabStrip.centerYAnchor),
            searchButton.widthAnchor.constraint(equalToConstant: headerButtonSize),
            searchButton.heightAnchor.constraint(equalToConstant: headerButtonSize),

            tabStrip.trailingAnchor.constraint(
                equalTo: searchButton.leadingAnchor,
                constant: -LayersMetrics.tabActionGap
            ),

            headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: LayersMetrics.headerTitleTop),
            headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.headerInset),
            headerLabel.heightAnchor.constraint(equalToConstant: LayersMetrics.headerTitleHeight),

            countBadge.centerYAnchor.constraint(equalTo: headerLabel.centerYAnchor),
            countBadge.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),

            // Web controls row is `flex-row-reverse`: blend mode on the left
            // (flex-1 ≈ 144pt at this card width) and opacity on the right (w-20).
            blendPill.topAnchor.constraint(equalTo: tabStrip.bottomAnchor, constant: LayersMetrics.headerBottomGap),
            blendPill.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.contentInset),
            blendPill.heightAnchor.constraint(equalToConstant: LayersMetrics.pillHeight),

            opacityPill.topAnchor.constraint(equalTo: blendPill.topAnchor),
            opacityPill.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.contentInset),
            opacityPill.leadingAnchor.constraint(
                equalTo: blendPill.trailingAnchor,
                constant: LayersMetrics.pillGap
            ),
            opacityPill.heightAnchor.constraint(equalToConstant: LayersMetrics.pillHeight),
            opacityPill.widthAnchor.constraint(equalToConstant: LayersMetrics.opacityPillWidth),

            controlsDivider.topAnchor.constraint(equalTo: blendPill.bottomAnchor, constant: LayersMetrics.controlBottomGap),
            controlsDivider.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.contentInset),
            controlsDivider.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.contentInset),
            controlsDivider.heightAnchor.constraint(equalToConstant: LayersMetrics.dividerHeight),

            scrollView.topAnchor.constraint(equalTo: controlsDivider.bottomAnchor, constant: LayersMetrics.treeTopGap),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.rowInset),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.rowInset),
            scrollView.bottomAnchor.constraint(
                lessThanOrEqualTo: footerDivider.topAnchor,
                constant: -LayersMetrics.treeBottomGap
            ),

            footerDivider.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.contentInset),
            footerDivider.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.contentInset),
            footerDivider.heightAnchor.constraint(equalToConstant: LayersMetrics.dividerHeight),

            assetsEmptyLabel.topAnchor.constraint(equalTo: tabStrip.bottomAnchor, constant: LayersMetrics.headerBottomGap),
            assetsEmptyLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.contentInset),
            assetsEmptyLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.contentInset),
            assetsEmptyLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -LayersMetrics.contentInset),

            maskButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: LayersMetrics.footerLeadingInset),
            maskButton.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -LayersMetrics.footerBottomInset),
            maskButton.widthAnchor.constraint(equalToConstant: footerSize),
            maskButton.heightAnchor.constraint(equalToConstant: footerSize),

            footerDivider.bottomAnchor.constraint(
                equalTo: maskButton.topAnchor,
                constant: -LayersMetrics.footerTopGap
            ),

            contrastButton.leadingAnchor.constraint(equalTo: maskButton.trailingAnchor, constant: LayersMetrics.footerSpacing),
            contrastButton.centerYAnchor.constraint(equalTo: maskButton.centerYAnchor),
            contrastButton.widthAnchor.constraint(equalToConstant: footerSize),
            contrastButton.heightAnchor.constraint(equalToConstant: footerSize),

            addButton.leadingAnchor.constraint(equalTo: contrastButton.trailingAnchor, constant: LayersMetrics.footerSpacing),
            addButton.centerYAnchor.constraint(equalTo: maskButton.centerYAnchor),
            addButton.widthAnchor.constraint(equalToConstant: footerSize),
            addButton.heightAnchor.constraint(equalToConstant: footerSize),

            groupButton.leadingAnchor.constraint(equalTo: addButton.trailingAnchor, constant: LayersMetrics.footerSpacing),
            groupButton.centerYAnchor.constraint(equalTo: maskButton.centerYAnchor),
            groupButton.widthAnchor.constraint(equalToConstant: footerSize),
            groupButton.heightAnchor.constraint(equalToConstant: footerSize),

            deleteButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -LayersMetrics.footerLeadingInset),
            deleteButton.centerYAnchor.constraint(equalTo: maskButton.centerYAnchor),
            deleteButton.widthAnchor.constraint(equalToConstant: footerSize),
            deleteButton.heightAnchor.constraint(equalToConstant: footerSize)
        ])

        let heightConstraint = scrollView.heightAnchor.constraint(
            equalToConstant: rowBlockHeight(2)
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

    // MARK: Collapse state

    /// Rebuilds the rendered rows from `nodes` minus the subtrees of collapsed ids.
    private func computeVisibleNodes() -> [VOONode] {
        if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            var included = Set(
                nodes.filter { $0.name.localizedCaseInsensitiveContains(searchQuery) }.map(\.id))
            let byId = Dictionary(
                nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            for id in Array(included) {
                var cursor = byId[id]?.parentId
                var visited = Set<String>()
                while let parent = cursor, visited.insert(parent).inserted {
                    included.insert(parent)
                    cursor = byId[parent]?.parentId
                }
            }
            return nodes.filter { included.contains($0.id) }
        }
        guard !collapsedIds.isEmpty else { return nodes }
        var byId: [String: VOONode] = [:]
        for candidate in nodes { byId[candidate.id] = candidate }
        var result: [VOONode] = []
        result.reserveCapacity(nodes.count)
        for node in nodes {
            var cursor = node.parentId
            var steps = 0
            var hidden = false
            while let parentId = cursor, steps < 64 {
                if collapsedIds.contains(parentId) { hidden = true; break }
                guard let parent = byId[parentId] else { break }
                cursor = parent.parentId
                steps += 1
            }
            if !hidden { result.append(node) }
        }
        return result
    }

    /// Expands every collapsed ancestor so `nodeId` is rendered (used when the
    /// host selects a node that lives inside a collapsed group).
    private func expandAncestors(of nodeId: String) {
        guard !collapsedIds.isEmpty else { return }
        var byId: [String: VOONode] = [:]
        for candidate in nodes { byId[candidate.id] = candidate }
        var cursor = byId[nodeId]?.parentId
        var steps = 0
        while let parentId = cursor, steps < 64 {
            collapsedIds.remove(parentId)
            guard let parent = byId[parentId] else { break }
            cursor = parent.parentId
            steps += 1
        }
    }

    /// Chevron action: toggles the subtree, refreshes the table and tells the host.
    private func toggleCollapsed(_ nodeId: String) {
        guard parentNodeIds.contains(nodeId) else { return }
        if collapsedIds.contains(nodeId) {
            collapsedIds.remove(nodeId)
        } else {
            collapsedIds.insert(nodeId)
        }
        onToggleLayerExpanded?(nodeId)
        rebuildVisibleRows()
    }

    /// Recomputes `visibleNodes`, reloads the table and restores the selection.
    private func rebuildVisibleRows() {
        isSyncingSelection = true
        visibleNodes = computeVisibleNodes()
        tableView.reloadData()
        updateVisibleRowHeight()
        syncTableGeometry()
        if let id = selectedNodeId, let idx = visibleNodes.firstIndex(where: { $0.id == id }) {
            tableView.selectRowIndexes(IndexSet(integer: idx), byExtendingSelection: false)
            pendingRevealRow = idx
        } else {
            tableView.deselectAll(nil)
        }
        isSyncingSelection = false
        updateFooterSelectionState()
        needsLayout = true
        needsDisplay = true
    }

    // MARK: Public configuration

    // MARK: - Row Context Menu

    public func selectRowForContextMenu(_ row: Int) {
        guard row >= 0, row < visibleNodes.count else { return }
        let node = visibleNodes[row]
        selectedNodeId = node.id
        tableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        onSelectNode?(node.id)
        needsDisplay = true
    }

    public func buildRowContextMenu(row: Int) -> NSMenu {
        let menu = NSMenu()
        guard row >= 0, row < visibleNodes.count else { return menu }
        let node = visibleNodes[row]
        let nodeId = node.id

        let rename = NSMenuItem(title: "重命名 (Rename)", action: #selector(contextRename(_:)), keyEquivalent: "")
        rename.target = self
        rename.representedObject = nodeId
        menu.addItem(rename)

        let visibility = NSMenuItem(title: node.style.visible ? "隐藏 (Hide)" : "显示 (Show)",
                                    action: #selector(contextToggleVisibility(_:)), keyEquivalent: "")
        visibility.target = self
        visibility.representedObject = nodeId
        menu.addItem(visibility)

        let lock = NSMenuItem(title: node.style.locked ? "解锁 (Unlock)" : "锁定 (Lock)",
                              action: #selector(contextToggleLock(_:)), keyEquivalent: "")
        lock.target = self
        lock.representedObject = nodeId
        menu.addItem(lock)

        menu.addItem(NSMenuItem.separator())

        let duplicate = NSMenuItem(title: "创建副本 (Duplicate)", action: #selector(contextDuplicate(_:)), keyEquivalent: "")
        duplicate.target = self
        duplicate.representedObject = nodeId
        menu.addItem(duplicate)

        let group = NSMenuItem(title: "编组 (Group)", action: #selector(contextGroup(_:)), keyEquivalent: "")
        group.target = self
        group.representedObject = nodeId
        menu.addItem(group)

        let delete = NSMenuItem(title: "删除 (Delete)", action: #selector(contextDelete(_:)), keyEquivalent: "")
        delete.target = self
        delete.representedObject = nodeId
        menu.addItem(delete)

        return menu
    }

    /// Node id carried by a context-menu item (indices can shift when rows collapse).
    private func contextNodeId(_ sender: NSMenuItem) -> String? {
        sender.representedObject as? String
    }

    @objc private func contextRename(_ sender: NSMenuItem) {
        guard let nodeId = contextNodeId(sender),
              let row = visibleNodes.firstIndex(where: { $0.id == nodeId }) else { return }
        selectedNodeId = nodeId
        tableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        if let cell = tableView.view(atColumn: 0, row: row, makeIfNecessary: true) as? LayerRowCell {
            cell.beginRename()
        }
    }

    @objc private func contextToggleVisibility(_ sender: NSMenuItem) {
        guard let nodeId = contextNodeId(sender),
              let node = nodes.first(where: { $0.id == nodeId }) else { return }
        onToggleVisibility?(node.id, !node.style.visible)
    }

    @objc private func contextToggleLock(_ sender: NSMenuItem) {
        guard let nodeId = contextNodeId(sender),
              let node = nodes.first(where: { $0.id == nodeId }) else { return }
        onToggleLock?(node.id, !node.style.locked)
    }

    @objc private func contextDuplicate(_ sender: NSMenuItem) {
        guard let nodeId = contextNodeId(sender),
              let row = visibleNodes.firstIndex(where: { $0.id == nodeId }) else { return }
        selectedNodeId = nodeId
        tableView.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false)
        onSelectNode?(nodeId)
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
        parentNodeIds = Set(nodes.compactMap { $0.parentId })
        // Drop collapse state for nodes that are gone or no longer have children,
        // then make sure the selected node is not hidden inside a collapsed group.
        collapsedIds = collapsedIds.filter { parentNodeIds.contains($0) }
        if let selectedId = selectedId { expandAncestors(of: selectedId) }
        visibleNodes = computeVisibleNodes()
        countBadge.stringValue = "\(nodes.count)"

        isSyncingSelection = true
        tableView.reloadData()
        refreshPills()
        updateVisibleRowHeight()
        syncTableGeometry()
        needsDisplay = true

        if let selectedId = selectedId,
           let idx = visibleNodes.firstIndex(where: { $0.id == selectedId }) {
            tableView.selectRowIndexes(IndexSet(integer: idx), byExtendingSelection: false)
            pendingRevealRow = idx
        } else {
            tableView.deselectAll(nil)
        }
        isSyncingSelection = false
        updateFooterSelectionState()
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
        // Tree bottom = footer buttons + footer pt-2 + hairline + tree gap (web
        // `footer: mt-2 border-t pt-2`). In this unflipped view the footer sits at
        // the bottom, so `maskButton.frame.maxY` is the highest footer y.
        let treeBottomFromTop = bounds.height - maskButton.frame.maxY
            - LayersMetrics.footerTopGap
            - LayersMetrics.dividerHeight
            - LayersMetrics.treeBottomGap
        let available = max(0, treeBottomFromTop - scrollTopFromTop)
        let capacity = max(1, Int(floor((available + LayersMetrics.rowSpacing) / stride)))
        let count = max(1, visibleNodes.count)
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
        let rowsHeight = rowBlockHeight(max(visibleNodes.count, 1))
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
        guard row >= 0, row < visibleNodes.count, let callback = onMoveLayer else { return }
        let nodeId = visibleNodes[row].id
        guard let sourceIndex = nodes.firstIndex(where: { $0.id == nodeId }) else { return }
        let target = max(0, min(nodes.count - 1, sourceIndex + offset))
        guard target != sourceIndex else { return }
        callback(nodeId, target)
    }

    @objc private func handleTableDoubleClick() {
        let row = tableView.clickedRow
        guard row >= 0, row < visibleNodes.count,
              let cell = tableView.view(atColumn: 0, row: row, makeIfNecessary: false) as? LayerRowCell
        else { return }
        cell.beginRename()
    }

    // MARK: NSTableViewDataSource & Delegate

    public func numberOfRows(in tableView: NSTableView) -> Int {
        return visibleNodes.count
    }

    /// Nesting depth of `node` within the rows this panel was given (0 = top level).
    /// The controller hands us a flat list, so the depth comes from `parentId`.
    private func depth(of node: VOONode) -> Int {
        guard node.parentId != nil else { return 0 }
        var byId: [String: VOONode] = [:]
        for candidate in nodes {
            byId[candidate.id] = candidate
        }
        var depth = 0
        var cursor = node.parentId
        var visited: Set<String> = []
        while let parentId = cursor, depth < 32, visited.insert(parentId).inserted,
              let parent = byId[parentId] {
            depth += 1
            cursor = parent.parentId
        }
        return depth
    }

    public func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row < visibleNodes.count else { return nil }
        let node = visibleNodes[row]
        let cell = (tableView.makeView(withIdentifier: Self.cellIdentifier, owner: self) as? LayerRowCell)
            ?? LayerRowCell(identifier: Self.cellIdentifier)
        let isSelected = (node.id == selectedNodeId)
        cell.configure(node: node,
                       isSelected: isSelected,
                       depth: depth(of: node),
                       hasChildren: parentNodeIds.contains(node.id),
                       isCollapsed: collapsedIds.contains(node.id))
        cell.onToggleDisclosure = { [weak self] in
            self?.toggleCollapsed(node.id)
        }

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
        guard row >= 0 && row < visibleNodes.count else { return }
        let node = visibleNodes[row]
        let changed = (selectedNodeId != node.id)
        selectedNodeId = node.id
        refreshPills()
        refreshVisibleCellsSelection()
        updateFooterSelectionState()
        if changed {
            onSelectNode?(node.id)
        }
    }

    /// Web parity: the group/folder footer action only exists while several layers
    /// are selected (native rows are single-select, so it stays hidden).
    private func updateFooterSelectionState() {
        let selectedCount = tableView.selectedRowIndexes.count
        groupButton.isHidden = isAssetsTabActive || selectedCount <= 1
    }

    // MARK: Panel tabs

    /// True while the card shows the (native-only, empty) Assets tab body.
    private var isAssetsTabActive: Bool = false

    /// Swaps the card body between the layer tree and the Assets empty state,
    /// mirroring the web panel where the tab strip replaces controls/tree/footer.
    private func setAssetsTabActive(_ active: Bool) {
        guard isAssetsTabActive != active else { return }
        isAssetsTabActive = active
        opacityPill.isHidden = active
        blendPill.isHidden = active
        controlsDivider.isHidden = active
        footerDivider.isHidden = active
        scrollView.isHidden = active
        maskButton.isHidden = active
        contrastButton.isHidden = active
        addButton.isHidden = active
        groupButton.isHidden = active
        deleteButton.isHidden = active
        assetsEmptyLabel.isHidden = !active
        updateFooterSelectionState()
        needsLayout = true
        needsDisplay = true
    }

    /// Re-configures the visible cells so the mint selected row follows the table
    /// selection without calling `reloadData()` (which would drop the row selection).
    private func refreshVisibleCellsSelection() {
        for row in 0..<tableView.numberOfRows {
            guard row < visibleNodes.count else { continue }
            guard let cell = tableView.view(atColumn: 0, row: row, makeIfNecessary: false) as? LayerRowCell else {
                continue
            }
            let node = visibleNodes[row]
            cell.configure(node: node,
                           isSelected: node.id == selectedNodeId,
                           depth: depth(of: node),
                           hasChildren: parentNodeIds.contains(node.id),
                           isCollapsed: collapsedIds.contains(node.id))
        }
    }

    // MARK: Drag to reorder

    public func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> NSPasteboardWriting? {
        guard row >= 0, row < visibleNodes.count else { return nil }
        let item = NSPasteboardItem()
        item.setString(visibleNodes[row].id, forType: Self.rowDragType)
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

        // `row` is a rendered-row index; translate it back to a node index first.
        var targetIndex: Int
        if row < visibleNodes.count,
           let idx = nodes.firstIndex(where: { $0.id == visibleNodes[row].id }) {
            targetIndex = idx
        } else {
            targetIndex = nodes.count
        }
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
    }
}
