//
//  EditorChrome.swift
//  native_studio
//
//  Floating editor chrome for the VOO Design canvas, 1:1 with the web editor:
//
//    • PageSwitcherPillView  — bottom-left "Design 1  1/1" capsule
//    • StudioBottomZoomBar   — bottom-center silver undo/redo/grid/zoom capsule
//    • VooAIFloatingButton   — bottom-right 44pt purple brand mark circle
//    • ContextIslandBar      — selection-only island bar above the zoom cluster
//
//  Everything is drawn with AppKit / CoreGraphics (no SwiftUI, no third party).
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Accessibility Identifiers

/// Stable accessibility identifiers for the editor chrome. Kept self-contained
/// so the chrome can be wired up and tested without touching the global
/// AccessibilityCatalog (owned by the Lead).
public enum EditorChromeAccessibility {
    // Page switcher
    public static let pageSwitcher = "Editor.PageSwitcher"
    public static let pageSwitcherPill = "Editor.PageSwitcher.Pill"

    // Zoom cluster
    public static let zoomBar = "Editor.ZoomBar"
    public static let zoomBarUndo = "Editor.ZoomBar.Undo"
    public static let zoomBarRedo = "Editor.ZoomBar.Redo"
    public static let zoomBarGrid = "Editor.ZoomBar.GridToggle"
    public static let zoomBarVisibility = "Editor.ZoomBar.VisibilityToggle"
    public static let zoomBarZoomIn = "Editor.ZoomBar.ZoomIn"
    public static let zoomBarZoomOut = "Editor.ZoomBar.ZoomOut"
    public static let zoomBarZoomReset = "Editor.ZoomBar.ZoomReset"

    // AI floating button
    public static let aiAssistantButton = "Editor.AIAssistantButton"

    // Selection island
    public static let islandBar = "Editor.IslandBar"
    public static let islandSelection = "Editor.IslandBar.Select"
    public static let islandRotate = "Editor.IslandBar.Rotate"
    public static let islandFlipVertical = "Editor.IslandBar.FlipVertical"
    public static let islandFlipHorizontal = "Editor.IslandBar.FlipHorizontal"
    public static let islandDuplicate = "Editor.IslandBar.Duplicate"
    public static let islandLock = "Editor.IslandBar.Lock"
    public static let islandDelete = "Editor.IslandBar.Delete"
    public static let islandDiamond = "Editor.IslandBar.Component"
    public static let islandAISparkle = "Editor.IslandBar.AISparkle"
    public static let islandAIPrompt = "Editor.IslandBar.AIPrompt"
    public static let islandAISend = "Editor.IslandBar.AISend"
    public static let islandActionVectorize = "Editor.IslandBar.Action.Vectorize"
    public static let islandActionBoolean = "Editor.IslandBar.Action.Boolean"
    public static let islandActionStyleTransfer = "Editor.IslandBar.Action.StyleTransfer"
}

// MARK: - Chrome Glyphs

/// Every vector glyph the editor chrome needs. These are hand-drawn here (16pt
/// design grid, 24×24 path space) so the chrome stays self-contained; simpler
/// shapes reuse the shared `VooIconFactory` primitives.
public enum EditorChromeGlyph: String, CaseIterable, Sendable {
    // Page switcher
    case page
    case chevronDown

    // Zoom cluster (drawn black on the silver capsule)
    case undo
    case redo
    case grid
    case magnet
    case plus
    case minus

    // Selection island (drawn light on dark chrome)
    case marquee
    case rotate
    case flipVertical
    case flipHorizontal
    case copy
    case lock
    case trash
    case diamond

    // AI island
    case sparkle
    case arrowUp

    /// Draws the glyph inside `rect` with the supplied 24×24-space stroke width
    /// (rendered width ≈ `strokeWidth * rect.width / 24`).
    public func draw(in rect: CGRect, color: NSColor, strokeWidth: CGFloat = 2.0) {
        switch self {
        case .page:
            VooIconFactory.drawFileText(in: rect, color: color, strokeWidth: strokeWidth)
        case .chevronDown:
            VooIconFactory.drawChevronDown(in: rect, color: color, strokeWidth: strokeWidth)
        case .undo:
            VooIconFactory.drawUndo(in: rect, color: color, strokeWidth: strokeWidth)
        case .redo:
            VooIconFactory.drawRedo(in: rect, color: color, strokeWidth: strokeWidth)
        case .grid:
            VooIconFactory.drawGrid(in: rect, color: color, strokeWidth: strokeWidth)
        case .magnet:
            VooIconFactory.drawMagnet(in: rect, color: color, strokeWidth: strokeWidth)
        case .plus:
            VooIconFactory.drawPlus(in: rect, color: color, strokeWidth: strokeWidth)
        case .minus:
            VooIconFactory.drawMinus(in: rect, color: color, strokeWidth: strokeWidth)
        case .marquee:
            VooIconFactory.drawMarquee(in: rect, color: color, strokeWidth: strokeWidth)
        case .rotate:
            VooIconFactory.drawRefresh(in: rect, color: color, strokeWidth: strokeWidth)
        case .flipVertical:
            VooIconFactory.drawFlipV(in: rect, color: color, strokeWidth: strokeWidth)
        case .flipHorizontal:
            VooIconFactory.drawFlipH(in: rect, color: color, strokeWidth: strokeWidth)
        case .copy:
            VooIconFactory.drawCopy(in: rect, color: color, strokeWidth: strokeWidth)
        case .lock:
            VooIconFactory.drawLock(in: rect, color: color, strokeWidth: strokeWidth)
        case .trash:
            VooIconFactory.drawTrash(in: rect, color: color, strokeWidth: strokeWidth)
        case .diamond:
            VooIconFactory.drawDiamond(in: rect, color: color, strokeWidth: strokeWidth)
        case .sparkle:
            VooIconFactory.drawSparkles(in: rect, color: color, strokeWidth: strokeWidth)
        case .arrowUp:
            VooIconFactory.drawArrowUp(in: rect, color: color, strokeWidth: strokeWidth)
        }
    }

    // MARK: Drawing helpers

    /// Sets up the shared 24×24 "Lucide" canvas: origin at the bottom-left of
    /// `rect`, uniform scale, y-axis pointing down (so path coordinates match
    /// the design grid that every icon was authored on).
    private static func withFlippedCanvas(_ rect: CGRect, _ body: (CGContext) -> Void) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        let scale = min(rect.width, rect.height) / 24.0
        ctx.translateBy(x: rect.origin.x, y: rect.origin.y + rect.height)
        ctx.scaleBy(x: scale, y: -scale)
        body(ctx)
        ctx.restoreGState()
    }

    private static func applyStrokeStyle(_ ctx: CGContext, color: NSColor, strokeWidth: CGFloat) {
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(max(0.8, strokeWidth))
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
    }
















}

// MARK: - Shared Drawing Helpers

/// Draws a single line of text vertically centred inside `rect`.
private func drawChromeText(
    _ text: String,
    in rect: CGRect,
    font: NSFont,
    color: NSColor,
    alignment: NSTextAlignment = .left,
    truncating: Bool = false,
    verticalNudge: CGFloat = 0
) {
    let style = NSMutableParagraphStyle()
    style.alignment = alignment
    style.lineBreakMode = truncating ? .byTruncatingTail : .byClipping
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: style
    ]
    let attributed = NSAttributedString(string: text, attributes: attributes)
    let size = attributed.size()
    let lineHeight = min(rect.height, ceil(size.height))
    let drawRect = CGRect(
        x: rect.minX,
        y: rect.midY - lineHeight / 2.0 + verticalNudge,
        width: rect.width,
        height: lineHeight
    )
    if truncating {
        attributed.draw(with: drawRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
    } else {
        attributed.draw(in: drawRect)
    }
}

/// Small rounded capsule chrome helper.
private func chromeCapsulePath(in rect: CGRect) -> CGPath {
    let radius = min(rect.width, rect.height) / 2.0
    return CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
}

// MARK: - Chrome Icon Button

/// Borderless, custom-drawn icon button used across every editor chrome surface.
/// Hover/pressed washes and colour transitions are all vector drawn so the
/// chrome does not depend on the system button appearance.
public final class EditorChromeIconButton: NSButton {

    // MARK: Configuration

    public let glyph: EditorChromeGlyph

    /// Invoked on click (after the button's enabled check).
    public var onClick: (() -> Void)?

    /// Side length of the drawn glyph (not the button frame).
    public var glyphSize: CGFloat = 14.0 {
        didSet { needsDisplay = true }
    }

    public var iconColor: NSColor = NSColor(white: 1.0, alpha: 1.0) {
        didSet { needsDisplay = true }
    }

    public var hoverIconColor: NSColor? {
        didSet { needsDisplay = true }
    }

    /// Resting background wash (clear for flat buttons).
    public var backgroundColor: NSColor = .clear {
        didSet { needsDisplay = true }
    }

    public var hoverBackgroundColor: NSColor? {
        didSet { needsDisplay = true }
    }

    public var pressedBackgroundColor: NSColor? {
        didSet { needsDisplay = true }
    }

    public var cornerRadius: CGFloat = 6.0 {
        didSet { needsDisplay = true }
    }

    /// 24×24 design-space stroke width passed to the glyph renderer.
    public var strokeWidth: CGFloat = 2.0 {
        didSet { needsDisplay = true }
    }

    public private(set) var isHovered: Bool = false {
        didSet {
            if oldValue != isHovered { needsDisplay = true }
        }
    }

    /// NSButton's cell normally invalidates on state changes; this view draws
    /// itself, so mirror the state changes into an explicit redraw.
    public override var isHighlighted: Bool {
        didSet {
            if oldValue != isHighlighted { needsDisplay = true }
        }
    }

    public override var isEnabled: Bool {
        didSet {
            if oldValue != isEnabled { needsDisplay = true }
        }
    }

    private var hoverTrackingArea: NSTrackingArea?

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        self.glyph = .page
        super.init(frame: frameRect)
        commonInit()
    }

    public init(glyph: EditorChromeGlyph, frame frameRect: NSRect) {
        self.glyph = glyph
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        self.glyph = .page
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        title = ""
        isBordered = false
        focusRingType = .none
        setButtonType(.momentaryChange)
        target = self
        action = #selector(handleClick)
    }

    /// Custom chrome is drawn in a bottom-left origin space; NSButton defaults to
    /// a flipped geometry, which would mirror the hand-drawn glyphs vertically.
    public override var isFlipped: Bool { false }

    // MARK: Interaction

    @objc private func handleClick() {
        guard isEnabled else { return }
        onClick?()
    }

    public override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        isHovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        isHovered = false
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = hoverTrackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        hoverTrackingArea = area
    }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    // MARK: Drawing

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let hovered = isHovered || isHighlighted
        let background: NSColor? = {
            if isHighlighted, let pressed = pressedBackgroundColor { return pressed }
            if hovered, isEnabled { return hoverBackgroundColor ?? backgroundColor.withAlphaComponent(min(1.0, backgroundColor.alphaComponent + 0.06)) }
            return backgroundColor.alphaComponent > 0 ? backgroundColor : nil
        }()

        if let background, background.alphaComponent > 0 {
            let radius = min(cornerRadius, bounds.height / 2.0)
            let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
            let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
            ctx.setFillColor(background.cgColor)
            ctx.addPath(path)
            ctx.fillPath()
        }

        var color = iconColor
        if hovered, isEnabled, let hoverIconColor {
            color = hoverIconColor
        }
        if !isEnabled {
            color = color.withAlphaComponent(color.alphaComponent * 0.55)
        }

        let side = min(glyphSize, min(bounds.width, bounds.height))
        let glyphRect = CGRect(
            x: bounds.midX - side / 2.0,
            y: bounds.midY - side / 2.0,
            width: side,
            height: side
        )
        glyph.draw(in: glyphRect, color: color, strokeWidth: strokeWidth)
    }
}

// MARK: - Chrome Text Pill Button

/// Compact pill button with custom-drawn chrome and a centred label. Used for
/// the zoom-percentage readout and the island's quick-action chips.
public final class EditorChromePillButton: NSButton {

    public var text: String {
        didSet {
            invalidateIntrinsicContentSize()
            needsDisplay = true
        }
    }

    /// Label font. Named `labelFont` because NSButton already exposes `font`.
    public var labelFont: NSFont {
        didSet {
            invalidateIntrinsicContentSize()
            needsDisplay = true
        }
    }

    public var textColor: NSColor {
        didSet { needsDisplay = true }
    }

    public var hoverTextColor: NSColor? {
        didSet { needsDisplay = true }
    }

    public var backgroundColor: NSColor {
        didSet { needsDisplay = true }
    }

    public var hoverBackgroundColor: NSColor? {
        didSet { needsDisplay = true }
    }

    public var pressedBackgroundColor: NSColor? {
        didSet { needsDisplay = true }
    }

    public var borderColor: NSColor? {
        didSet { needsDisplay = true }
    }

    public var hoverBorderColor: NSColor? {
        didSet { needsDisplay = true }
    }

    public var horizontalPadding: CGFloat = 8.0 {
        didSet {
            invalidateIntrinsicContentSize()
            needsDisplay = true
        }
    }

    public var minimumWidth: CGFloat = 0.0 {
        didSet {
            invalidateIntrinsicContentSize()
            needsDisplay = true
        }
    }

    /// Height used by the intrinsic size (the view frame still wins).
    public var contentHeight: CGFloat = 20.0 {
        didSet { invalidateIntrinsicContentSize() }
    }

    public var onClick: (() -> Void)?

    public private(set) var isHovered: Bool = false {
        didSet {
            if oldValue != isHovered { needsDisplay = true }
        }
    }

    /// NSButton's cell normally invalidates on state changes; this view draws
    /// itself, so mirror the state changes into an explicit redraw.
    public override var isHighlighted: Bool {
        didSet {
            if oldValue != isHighlighted { needsDisplay = true }
        }
    }

    public override var isEnabled: Bool {
        didSet {
            if oldValue != isEnabled { needsDisplay = true }
        }
    }

    private var hoverTrackingArea: NSTrackingArea?

    public init(text: String, font: NSFont, frame frameRect: NSRect) {
        self.text = text
        self.labelFont = font
        self.textColor = NSColor(white: 0.83, alpha: 1.0)
        self.backgroundColor = .clear
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        self.text = ""
        self.labelFont = ThemeFonts.mono(size: 11, weight: .medium)
        self.textColor = NSColor(white: 0.83, alpha: 1.0)
        self.backgroundColor = .clear
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        title = ""
        isBordered = false
        focusRingType = .none
        setButtonType(.momentaryChange)
        target = self
        action = #selector(handleClick)
    }

    /// Custom chrome is drawn in a bottom-left origin space; NSButton defaults to
    /// a flipped geometry, which would mirror the hand-drawn glyphs vertically.
    public override var isFlipped: Bool { false }

    @objc private func handleClick() {
        guard isEnabled else { return }
        onClick?()
    }

    public override var intrinsicContentSize: NSSize {
        let size = NSAttributedString(string: text, attributes: [.font: labelFont]).size()
        return NSSize(
            width: max(minimumWidth, ceil(size.width) + horizontalPadding * 2.0),
            height: contentHeight
        )
    }

    public override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        isHovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        isHovered = false
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = hoverTrackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        hoverTrackingArea = area
    }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let hovered = isHovered || isHighlighted
        let fill: NSColor? = {
            if isHighlighted, let pressed = pressedBackgroundColor { return pressed }
            if hovered, isEnabled, let hover = hoverBackgroundColor { return hover }
            return backgroundColor.alphaComponent > 0 ? backgroundColor : nil
        }()

        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let radius = min(rect.height / 2.0, 12.0)
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

        if let fill, fill.alphaComponent > 0 {
            ctx.setFillColor(fill.cgColor)
            ctx.addPath(path)
            ctx.fillPath()
        }

        let border: NSColor? = (hovered ? (hoverBorderColor ?? borderColor) : borderColor)
        if let border, border.alphaComponent > 0 {
            ctx.setStrokeColor(border.cgColor)
            ctx.setLineWidth(1.0)
            ctx.addPath(path)
            ctx.strokePath()
        }

        var color = textColor
        if hovered, isEnabled, let hoverTextColor {
            color = hoverTextColor
        }
        if !isEnabled {
            color = color.withAlphaComponent(color.alphaComponent * 0.5)
        }

        drawChromeText(text, in: bounds, font: labelFont, color: color, alignment: .center)
    }
}

// MARK: - Chrome Prompt Button

/// The island's inline "Ask AI to modify @Shape..." capsule. It is a button
/// (not a text field): clicking it asks the agent, exactly like the web app's
/// prompt row. The trailing send circle lives next to it in `ContextIslandBar`.
public final class EditorChromePromptButton: NSButton {

    /// Placeholder shown when `text` is `nil`.
    public var placeholderText: String = "Ask AI to modify @Shape..." {
        didSet {
            needsDisplay = true
            setAccessibilityLabel(placeholderText)
        }
    }

    /// User-entered prompt; `nil` renders the placeholder.
    public var text: String? {
        didSet { needsDisplay = true }
    }

    public var labelFont: NSFont = ThemeFonts.mono(size: 10.0) {
        didSet { needsDisplay = true }
    }

    public var textColor: NSColor = NSColor(white: 1.0, alpha: 1.0) {
        didSet { needsDisplay = true }
    }

    public var placeholderColor: NSColor = NSColor(white: 0.64, alpha: 1.0) {
        didSet { needsDisplay = true }
    }

    public var sparkleColor: NSColor = NSColor(hex: ThemeTokens.accentPurple) {
        didSet { needsDisplay = true }
    }

    public var backgroundColor: NSColor = NSColor(white: 1.0, alpha: 0.06) {
        didSet { needsDisplay = true }
    }

    public var hoverBackgroundColor: NSColor = NSColor(white: 1.0, alpha: 0.08) {
        didSet { needsDisplay = true }
    }

    public var borderColor: NSColor = NSColor(white: 1.0, alpha: 0.10) {
        didSet { needsDisplay = true }
    }

    public var hoverBorderColor: NSColor = NSColor(white: 1.0, alpha: 0.20) {
        didSet { needsDisplay = true }
    }

    public var horizontalPadding: CGFloat = 10.0

    /// Total capsule width used by the island layout.
    public var preferredWidth: CGFloat = 192.0 {
        didSet { invalidateIntrinsicContentSize() }
    }

    public var onClick: (() -> Void)?

    public private(set) var isHovered: Bool = false {
        didSet {
            if oldValue != isHovered { needsDisplay = true }
        }
    }

    /// NSButton's cell normally invalidates on state changes; this view draws
    /// itself, so mirror the state changes into an explicit redraw.
    public override var isHighlighted: Bool {
        didSet {
            if oldValue != isHighlighted { needsDisplay = true }
        }
    }

    public override var isEnabled: Bool {
        didSet {
            if oldValue != isEnabled { needsDisplay = true }
        }
    }

    private var hoverTrackingArea: NSTrackingArea?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        title = ""
        isBordered = false
        focusRingType = .none
        setButtonType(.momentaryChange)
        target = self
        action = #selector(handleClick)
        setAccessibilityLabel(placeholderText)
    }

    /// Custom chrome is drawn in a bottom-left origin space; NSButton defaults to
    /// a flipped geometry, which would mirror the hand-drawn glyphs vertically.
    public override var isFlipped: Bool { false }

    @objc private func handleClick() {
        guard isEnabled else { return }
        onClick?()
    }

    public override var intrinsicContentSize: NSSize {
        NSSize(width: preferredWidth, height: 24.0)
    }

    public override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        isHovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        isHovered = false
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = hoverTrackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        hoverTrackingArea = area
    }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .iBeam)
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let hovered = isHovered || isHighlighted
        let capsule = bounds.insetBy(dx: 0.5, dy: 0.5)
        let radius = min(capsule.height / 2.0, 12.0)
        let path = CGPath(roundedRect: capsule, cornerWidth: radius, cornerHeight: radius, transform: nil)

        ctx.setFillColor((hovered ? hoverBackgroundColor : backgroundColor).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        ctx.setStrokeColor((hovered ? hoverBorderColor : borderColor).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()

        // Leading purple sparkle.
        let sparkleSide: CGFloat = 13.0
        let sparkleRect = CGRect(
            x: capsule.minX + horizontalPadding,
            y: capsule.midY - sparkleSide / 2.0,
            width: sparkleSide,
            height: sparkleSide
        )
        EditorChromeGlyph.sparkle.draw(in: sparkleRect, color: sparkleColor, strokeWidth: 1.8)

        // Prompt / placeholder text, tail-truncated inside the capsule.
        let textOriginX = sparkleRect.maxX + 5.0
        let textRect = CGRect(
            x: textOriginX,
            y: capsule.minY,
            width: max(0, capsule.maxX - textOriginX - 8.0),
            height: capsule.height
        )
        let shownText = text ?? placeholderText
        let shownColor = text == nil ? placeholderColor : textColor
        drawChromeText(shownText, in: textRect, font: labelFont, color: shownColor, alignment: .left, truncating: true)
    }
}

// MARK: - Chrome Separator

/// One-pixel vertical divider used between island chrome groups.
public final class EditorChromeSeparatorView: NSView {

    public var lineColor: NSColor = NSColor(white: 1.0, alpha: 0.08) {
        didSet { needsDisplay = true }
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = false
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    public override var isOpaque: Bool { false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(lineColor.cgColor)
        let width = max(1.0, bounds.width)
        ctx.fill(CGRect(x: bounds.midX - width / 2.0, y: bounds.minY, width: width, height: bounds.height))
    }
}

// MARK: - Page Switcher Pill

/// Bottom-left page switcher: a 36pt capsule reading "Design 1  1/1".
/// Clicking it asks the host to open the page menu (`onTap`).
/// Web: `h-9 rounded-full px-3.5 gap-2 text-xs bg-neutral-900/95 border-white/10`.
public final class PageSwitcherPillView: NSView {

    // MARK: Metrics

    public static let preferredHeight: CGFloat = 36.0
    /// Web: `px-3.5` = 14pt horizontal padding.
    public static let dotPillHorizontalPadding: CGFloat = 14.0
    /// Web: `gap-2` = 8pt between the page name and the counter.
    public static let dotPillGap: CGFloat = 8.0

    // MARK: State

    public var onTap: (() -> Void)?

    public private(set) var pageName: String = "Design 1"
    public private(set) var pageIndex: Int = 1
    public private(set) var pageCount: Int = 1

    /// The reference editor pill is text-only; these affordances are available
    /// for hosts that want the richer "icon + chevron" treatment.
    public var showsPageIcon: Bool = false {
        didSet {
            invalidateIntrinsicContentSize()
            needsDisplay = true
        }
    }

    public var showsChevron: Bool = false {
        didSet {
            invalidateIntrinsicContentSize()
            needsDisplay = true
        }
    }

    // MARK: Styling

    public var nameFont: NSFont = ThemeFonts.mono(size: 12.0) {
        didSet { needsDisplay = true }
    }

    public var counterFont: NSFont = ThemeFonts.mono(size: 12.0) {
        didSet { needsDisplay = true }
    }

    public var nameColor: NSColor = NSColor(white: 0.96, alpha: 1.0) {
        didSet { needsDisplay = true }
    }

    public var counterColor: NSColor = NSColor(white: 0.64, alpha: 1.0) {
        didSet { needsDisplay = true }
    }

    public var pillBackgroundColor: NSColor = NSColor(hex: ThemeTokens.surfacePanel).withAlphaComponent(0.95) {
        didSet { needsDisplay = true }
    }

    public var pillHoverBackgroundColor: NSColor = NSColor(hex: "#202020") {
        didSet { needsDisplay = true }
    }

    public var borderColor: NSColor = NSColor(white: 1.0, alpha: 0.10) {
        didSet { needsDisplay = true }
    }

    public var hoverBorderColor: NSColor = NSColor(white: 1.0, alpha: 0.14) {
        didSet { needsDisplay = true }
    }

    // MARK: Private state

    private var isHovered: Bool = false {
        didSet {
            if oldValue != isHovered { needsDisplay = true }
        }
    }

    private var isPressed: Bool = false {
        didSet {
            if oldValue != isPressed { needsDisplay = true }
        }
    }

    private var hoverTrackingArea: NSTrackingArea?

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
        setAccessibilityIdentifier(EditorChromeAccessibility.pageSwitcher)
        updateAccessibilityLabel()

        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.35
        layer?.shadowRadius = 12.0
        layer?.shadowOffset = CGSize(width: 0, height: -4)
    }

    // MARK: Public API

    public func update(pageName: String, pageIndex: Int, pageCount: Int) {
        self.pageName = pageName
        self.pageIndex = max(1, pageIndex)
        self.pageCount = max(1, pageCount)
        needsDisplay = true
        invalidateIntrinsicContentSize()
        updateAccessibilityLabel()
    }

    /// Width the pill wants for its current content.
    public var preferredWidth: CGFloat {
        var width = PageSwitcherPillView.dotPillHorizontalPadding * 2.0
        if showsPageIcon {
            width += 13.0 + 8.0
        }
        width += nameSize.width + PageSwitcherPillView.dotPillGap + counterSize.width
        if showsChevron {
            width += 8.0 + 12.0
        }
        return ceil(width)
    }

    public var preferredSize: NSSize {
        NSSize(width: preferredWidth, height: PageSwitcherPillView.preferredHeight)
    }

    public override var intrinsicContentSize: NSSize {
        preferredSize
    }

    private var counterText: String {
        "\(pageIndex)/\(pageCount)"
    }

    private var nameSize: CGSize {
        NSAttributedString(string: pageName, attributes: [.font: nameFont]).size()
    }

    private var counterSize: CGSize {
        NSAttributedString(string: counterText, attributes: [.font: counterFont]).size()
    }

    private func updateAccessibilityLabel() {
        setAccessibilityLabel("Page switcher. \(pageName), page \(pageIndex) of \(pageCount)")
        setAccessibilityHelp("Opens the page list")
    }

    public override func accessibilityPerformPress() -> Bool {
        onTap?()
        return true
    }

    // MARK: Tracking & interaction

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = hoverTrackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        hoverTrackingArea = area
    }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    public override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        isHovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        isHovered = false
        isPressed = false
    }

    public override func mouseDown(with event: NSEvent) {
        isPressed = true
    }

    public override func mouseUp(with event: NSEvent) {
        let wasPressed = isPressed
        isPressed = false
        let location = convert(event.locationInWindow, from: nil)
        if wasPressed && bounds.contains(location) {
            onTap?()
        }
    }

    // MARK: Drawing

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = chromeCapsulePath(in: rect)

        let fill = isPressed
            ? pillBackgroundColor.blended(withFraction: 0.10, of: .white) ?? pillBackgroundColor
            : (isHovered ? pillHoverBackgroundColor : pillBackgroundColor)
        ctx.setFillColor(fill.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        ctx.setStrokeColor((isHovered ? hoverBorderColor : borderColor).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()

        var x = PageSwitcherPillView.dotPillHorizontalPadding

        if showsPageIcon {
            let iconSide: CGFloat = 13.0
            let iconRect = CGRect(
                x: x,
                y: bounds.midY - iconSide / 2.0,
                width: iconSide,
                height: iconSide
            )
            EditorChromeGlyph.page.draw(
                in: iconRect,
                color: counterColor.withAlphaComponent(0.75),
                strokeWidth: 1.8
            )
            x += iconSide + 8.0
        }

        let padding = PageSwitcherPillView.dotPillHorizontalPadding
        let nameWidth = ceil(nameSize.width)
        let counterWidth = ceil(counterSize.width)
        let trailingSpace: CGFloat = showsChevron ? 8.0 + 12.0 : 0.0
        let counterMaxX = bounds.width - padding - trailingSpace

        var counterX = x + nameWidth + PageSwitcherPillView.dotPillGap
        if counterX + counterWidth > counterMaxX {
            counterX = max(x + 4.0, counterMaxX - counterWidth)
        }

        drawChromeText(
            pageName,
            in: CGRect(x: x, y: 0, width: max(0, counterX - x - 4.0), height: bounds.height),
            font: nameFont,
            color: nameColor,
            truncating: true,
            verticalNudge: 1.0
        )
        drawChromeText(
            counterText,
            in: CGRect(x: counterX, y: 0, width: counterWidth, height: bounds.height),
            font: counterFont,
            color: counterColor,
            verticalNudge: 1.0
        )
        x = counterX + counterWidth

        if showsChevron {
            let chevronSide: CGFloat = 12.0
            x += 8.0
            let chevronRect = CGRect(
                x: x,
                y: bounds.midY - chevronSide / 2.0,
                width: chevronSide,
                height: chevronSide
            )
            EditorChromeGlyph.chevronDown.draw(
                in: chevronRect,
                color: counterColor.withAlphaComponent(0.8),
                strokeWidth: 1.8
            )
        }
    }
}

// MARK: - Bottom Zoom Bar

/// Bottom-center silver zoom cluster:
/// undo · redo │ grid · snap │ + 58% −
public final class StudioBottomZoomBar: NSView {

    // MARK: Metrics

    public static let preferredHeight: CGFloat = 32.0
    public static let preferredWidth: CGFloat = 232.0
    public static let buttonSize: CGFloat = 28.0
    public static let horizontalPadding: CGFloat = 4.0
    public static let cornerRadius: CGFloat = 12.0

    // MARK: Callbacks

    public var onUndo: (() -> Void)?
    public var onRedo: (() -> Void)?
    public var onGridToggle: ((Bool) -> Void)?
    public var onVisibilityToggle: ((Bool) -> Void)?
    public var onZoomIn: (() -> Void)?
    public var onZoomOut: (() -> Void)?
    public var onZoomReset: (() -> Void)?

    // MARK: Controls (public read-only accessors)

    public let undoButton: EditorChromeIconButton
    public let redoButton: EditorChromeIconButton
    public let gridButton: EditorChromeIconButton
    public let visibilityButton: EditorChromeIconButton
    public let zoomInButton: EditorChromeIconButton
    public let zoomOutButton: EditorChromeIconButton
    public let zoomLabelButton: EditorChromePillButton

    public let firstSeparator: EditorChromeSeparatorView
    public let secondSeparator: EditorChromeSeparatorView

    // MARK: State

    /// Current zoom as a fraction (0.58 → "58%").
    public private(set) var zoom: CGFloat = 1.0
    public private(set) var canUndo: Bool = false
    public private(set) var canRedo: Bool = false
    public private(set) var isGridEnabled: Bool = false
    public private(set) var isVisibilityEnabled: Bool = true

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        undoButton = EditorChromeIconButton(glyph: .undo, frame: .zero)
        redoButton = EditorChromeIconButton(glyph: .redo, frame: .zero)
        gridButton = EditorChromeIconButton(glyph: .grid, frame: .zero)
        visibilityButton = EditorChromeIconButton(glyph: .magnet, frame: .zero)
        zoomInButton = EditorChromeIconButton(glyph: .plus, frame: .zero)
        zoomOutButton = EditorChromeIconButton(glyph: .minus, frame: .zero)
        zoomLabelButton = EditorChromePillButton(
            text: "100%",
            font: ThemeFonts.mono(size: 11.0, weight: .medium),
            frame: .zero
        )
        firstSeparator = EditorChromeSeparatorView(frame: .zero)
        secondSeparator = EditorChromeSeparatorView(frame: .zero)
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        undoButton = EditorChromeIconButton(glyph: .undo, frame: .zero)
        redoButton = EditorChromeIconButton(glyph: .redo, frame: .zero)
        gridButton = EditorChromeIconButton(glyph: .grid, frame: .zero)
        visibilityButton = EditorChromeIconButton(glyph: .magnet, frame: .zero)
        zoomInButton = EditorChromeIconButton(glyph: .plus, frame: .zero)
        zoomOutButton = EditorChromeIconButton(glyph: .minus, frame: .zero)
        zoomLabelButton = EditorChromePillButton(
            text: "100%",
            font: ThemeFonts.mono(size: 11.0, weight: .medium),
            frame: .zero
        )
        firstSeparator = EditorChromeSeparatorView(frame: .zero)
        secondSeparator = EditorChromeSeparatorView(frame: .zero)
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        setAccessibilityElement(true)
        setAccessibilityRole(.toolbar)
        setAccessibilityIdentifier(EditorChromeAccessibility.zoomBar)
        setAccessibilityLabel("Canvas zoom and history")

        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.35
        layer?.shadowRadius = 12.0
        layer?.shadowOffset = CGSize(width: 0, height: -4)

        configureButton(
            undoButton,
            identifier: EditorChromeAccessibility.zoomBarUndo,
            label: "Undo",
            help: "Undo the last action"
        )
        configureButton(
            redoButton,
            identifier: EditorChromeAccessibility.zoomBarRedo,
            label: "Redo",
            help: "Redo the last undone action"
        )
        configureButton(
            gridButton,
            identifier: EditorChromeAccessibility.zoomBarGrid,
            label: "Toggle grid",
            help: "Show or hide the canvas grid"
        )
        configureButton(
            visibilityButton,
            identifier: EditorChromeAccessibility.zoomBarVisibility,
            label: "Toggle visibility",
            help: "Show or hide canvas overlays"
        )
        configureButton(
            zoomInButton,
            identifier: EditorChromeAccessibility.zoomBarZoomIn,
            label: "Zoom in",
            help: "Zoom the canvas in"
        )
        configureButton(
            zoomOutButton,
            identifier: EditorChromeAccessibility.zoomBarZoomOut,
            label: "Zoom out",
            help: "Zoom the canvas out"
        )

        zoomLabelButton.setAccessibilityIdentifier(EditorChromeAccessibility.zoomBarZoomReset)
        zoomLabelButton.setAccessibilityRole(.button)
        zoomLabelButton.setAccessibilityLabel("Zoom level. Reset to 100%")
        zoomLabelButton.setAccessibilityHelp("Resets the canvas zoom to 100%")
        zoomLabelButton.minimumWidth = 30.0
        zoomLabelButton.contentHeight = Self.buttonSize
        zoomLabelButton.horizontalPadding = 4.0
        zoomLabelButton.textColor = .black
        zoomLabelButton.hoverBackgroundColor = NSColor.black.withAlphaComponent(0.07)
        zoomLabelButton.pressedBackgroundColor = NSColor.black.withAlphaComponent(0.12)
        zoomLabelButton.onClick = { [weak self] in self?.resetZoom() }

        undoButton.onClick = { [weak self] in self?.onUndo?() }
        redoButton.onClick = { [weak self] in self?.onRedo?() }
        gridButton.onClick = { [weak self] in self?.toggleGrid() }
        visibilityButton.onClick = { [weak self] in self?.toggleVisibility() }
        zoomInButton.onClick = { [weak self] in self?.onZoomIn?() }
        zoomOutButton.onClick = { [weak self] in self?.onZoomOut?() }

        for view in [
            undoButton, redoButton, gridButton, visibilityButton,
            zoomInButton, zoomOutButton, zoomLabelButton,
            firstSeparator, secondSeparator
        ] as [NSView] {
            view.translatesAutoresizingMaskIntoConstraints = true
            addSubview(view)
        }

        refreshAppearance()
    }

    private func configureButton(
        _ button: EditorChromeIconButton,
        identifier: String,
        label: String,
        help: String
    ) {
        button.setAccessibilityIdentifier(identifier)
        button.setAccessibilityRole(.button)
        button.setAccessibilityLabel(label)
        button.setAccessibilityHelp(help)
        button.toolTip = label
        button.glyphSize = 13.0
        button.backgroundColor = .clear
        button.hoverBackgroundColor = NSColor.black.withAlphaComponent(0.07)
        button.pressedBackgroundColor = NSColor.black.withAlphaComponent(0.12)
        button.cornerRadius = 7.0
        button.strokeWidth = 2.0
    }

    // MARK: Public API

    /// Updates zoom (fraction: 0.58 = 58%) and the history availability.
    public func update(zoom: CGFloat, canUndo: Bool, canRedo: Bool) {
        let fraction = zoom > 10.0 ? zoom / 100.0 : zoom
        self.zoom = fraction.isFinite ? max(0.01, fraction) : 1.0
        self.canUndo = canUndo
        self.canRedo = canRedo
        refreshAppearance()
        needsDisplay = true
    }

    public func setGridEnabled(_ enabled: Bool) {
        guard isGridEnabled != enabled else { return }
        isGridEnabled = enabled
        refreshAppearance()
    }

    public func setVisibilityEnabled(_ enabled: Bool) {
        guard isVisibilityEnabled != enabled else { return }
        isVisibilityEnabled = enabled
        refreshAppearance()
    }

    public var preferredSize: NSSize {
        NSSize(width: StudioBottomZoomBar.preferredWidth, height: StudioBottomZoomBar.preferredHeight)
    }

    public override var intrinsicContentSize: NSSize {
        preferredSize
    }

    // MARK: State changes

    private func toggleGrid() {
        isGridEnabled.toggle()
        refreshAppearance()
        onGridToggle?(isGridEnabled)
    }

    private func toggleVisibility() {
        isVisibilityEnabled.toggle()
        refreshAppearance()
        onVisibilityToggle?(isVisibilityEnabled)
    }

    private func resetZoom() {
        zoom = 1.0
        refreshAppearance()
        onZoomReset?()
    }

    private func refreshAppearance() {
        let percent = Int((zoom * 100.0).rounded())
        zoomLabelButton.text = "\(percent)%"
        zoomLabelButton.setAccessibilityValue("\(percent)%")

        undoButton.isEnabled = canUndo
        redoButton.isEnabled = canRedo

        let undoAlpha: CGFloat = canUndo ? 1.0 : 0.30
        let redoAlpha: CGFloat = canRedo ? 1.0 : 0.30
        let gridAlpha: CGFloat = isGridEnabled ? 1.0 : 0.40
        let visibilityAlpha: CGFloat = isVisibilityEnabled ? 1.0 : 0.30

        undoButton.iconColor = NSColor.black.withAlphaComponent(undoAlpha)
        redoButton.iconColor = NSColor.black.withAlphaComponent(redoAlpha)
        gridButton.iconColor = NSColor.black.withAlphaComponent(gridAlpha)
        visibilityButton.iconColor = NSColor.black.withAlphaComponent(visibilityAlpha)
        zoomInButton.iconColor = .black
        zoomOutButton.iconColor = .black

        gridButton.setAccessibilityValue(isGridEnabled ? "On" : "Off")
        visibilityButton.setAccessibilityValue(isVisibilityEnabled ? "On" : "Off")

        needsLayout = true
    }

    // MARK: Layout

    public override func layout() {
        super.layout()
        let height = bounds.height
        let originX = max(0.0, (bounds.width - StudioBottomZoomBar.preferredWidth) / 2.0)
        let buttonY = (height - Self.buttonSize) / 2.0
        let separatorHeight: CGFloat = 14.0
        let separatorY = (height - separatorHeight) / 2.0

        undoButton.frame = NSRect(x: originX + 4.0, y: buttonY, width: 28.0, height: 28.0)
        redoButton.frame = NSRect(x: originX + 34.0, y: buttonY, width: 28.0, height: 28.0)
        firstSeparator.frame = NSRect(x: originX + 64.0, y: separatorY, width: 1.0, height: separatorHeight)
        gridButton.frame = NSRect(x: originX + 71.0, y: buttonY, width: 28.0, height: 28.0)
        visibilityButton.frame = NSRect(x: originX + 101.0, y: buttonY, width: 28.0, height: 28.0)
        secondSeparator.frame = NSRect(x: originX + 131.0, y: separatorY, width: 1.0, height: separatorHeight)
        zoomInButton.frame = NSRect(x: originX + 138.0, y: buttonY, width: 28.0, height: 28.0)
        zoomLabelButton.frame = NSRect(x: originX + 168.0, y: buttonY, width: 30.0, height: 28.0)
        zoomOutButton.frame = NSRect(x: originX + 200.0, y: buttonY, width: 28.0, height: 28.0)
    }

    // MARK: Drawing

    public override var isOpaque: Bool { false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = CGPath(
            roundedRect: rect,
            cornerWidth: StudioBottomZoomBar.cornerRadius,
            cornerHeight: StudioBottomZoomBar.cornerRadius,
            transform: nil
        )
        ctx.setFillColor(ThemeTokens.colorBottomTools.cgColor)
        ctx.addPath(path)
        ctx.fillPath()
    }
}

// MARK: - AI Floating Button

/// Bottom-right 44pt purple VOO brand circle. The brand mark is the shared
/// `VooIconFactory.drawBrandLogo` drawing, tinted black; hover grows the circle
/// to 108% and brightens the purple.
public final class VooAIFloatingButton: NSButton {

    public static let preferredSize: CGFloat = 44.0

    /// Invoked when the button is activated (click or accessibility press).
    public var onActivate: (() -> Void)?

    public var fillColor: NSColor = NSColor(hex: ThemeTokens.accentPurple) {
        didSet { needsDisplay = true }
    }

    public var hoverScale: CGFloat = 1.08

    public private(set) var isHovered: Bool = false {
        didSet {
            if oldValue != isHovered {
                needsDisplay = true
                applyHoverTransform()
            }
        }
    }

    /// NSButton's cell normally invalidates on state changes; this view draws
    /// itself, so mirror the state changes into an explicit redraw.
    public override var isHighlighted: Bool {
        didSet {
            if oldValue != isHighlighted { needsDisplay = true }
        }
    }

    public override var isEnabled: Bool {
        didSet {
            if oldValue != isEnabled { needsDisplay = true }
        }
    }

    private var hoverTrackingArea: NSTrackingArea?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        title = ""
        isBordered = false
        focusRingType = .none
        setButtonType(.momentaryChange)
        target = self
        action = #selector(handleClick)
        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor(hex: ThemeTokens.accentPurple).cgColor
        layer?.shadowOpacity = 0.45
        layer?.shadowRadius = 14.0
        layer?.shadowOffset = CGSize(width: 0, height: 2)

        setAccessibilityElement(true)
        setAccessibilityRole(.button)
        setAccessibilityIdentifier(EditorChromeAccessibility.aiAssistantButton)
        setAccessibilityLabel("VOO AI Assistant")
        setAccessibilityHelp("Open the VOO AI agent panel")
        toolTip = "Ask VOO AI"
    }

    /// Custom chrome is drawn in a bottom-left origin space; NSButton defaults to
    /// a flipped geometry, which would mirror the hand-drawn glyphs vertically.
    public override var isFlipped: Bool { false }


    @objc private func handleClick() {
        onActivate?()
    }

    public override func accessibilityPerformPress() -> Bool {
        onActivate?()
        return true
    }

    public override var intrinsicContentSize: NSSize {
        NSSize(width: VooAIFloatingButton.preferredSize, height: VooAIFloatingButton.preferredSize)
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = hoverTrackingArea {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        hoverTrackingArea = area
    }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    public override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        isHovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        isHovered = false
    }

    /// Scales the layer around the view's centre. The layer is not clipped to
    /// its bounds, so the 44pt circle can visually grow on hover.
    private func applyHoverTransform() {
        guard let layer else { return }
        let scale = isHovered ? hoverScale : 1.0

        let oldAnchor = layer.anchorPoint
        let newAnchor = CGPoint(x: 0.5, y: 0.5)
        let oldPosition = layer.position
        if oldAnchor != newAnchor {
            let bounds = layer.bounds
            layer.anchorPoint = newAnchor
            layer.position = CGPoint(
                x: oldPosition.x + (newAnchor.x - oldAnchor.x) * bounds.width,
                y: oldPosition.y + (newAnchor.y - oldAnchor.y) * bounds.height
            )
        }

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.transform = CATransform3DMakeScale(scale, scale, 1.0)
        CATransaction.commit()
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let diameter = VooAIFloatingButton.preferredSize - 1.0
        let circleRect = CGRect(
            x: bounds.midX - diameter / 2.0,
            y: bounds.midY - diameter / 2.0,
            width: diameter,
            height: diameter
        )

        var color = fillColor
        if isHovered {
            color = color.blended(withFraction: 0.14, of: .white) ?? color
        }
        if isHighlighted {
            color = color.blended(withFraction: 0.08, of: .black) ?? color
        }

        ctx.setFillColor(color.cgColor)
        ctx.fillEllipse(in: circleRect)

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

// MARK: - Contextual Selection Island

/// Selection-only floating island bar above the zoom cluster:
///
///   [ selection · rotate │ flip-v · flip-h · duplicate · lock │ delete │ component ]
///   │ ✦ [ Ask AI to modify @Shape... ] ↑  (Vectorize) (Boolean) (Style Transfer)
///
/// `update(selectionLabel: nil)` hides the bar; a non-nil label shows it and
/// rewrites the AI prompt placeholder.
public final class ContextIslandBar: NSView {

    // MARK: Metrics

    public static let preferredHeight: CGFloat = 32.0
    public static let horizontalPadding: CGFloat = 8.0
    public static let glyphButtonSize: CGFloat = 24.0
    public static let aiSparkleSize: CGFloat = 24.0
    public static let sendButtonSize: CGFloat = 20.0
    public static let chipHeight: CGFloat = 24.0
    public static let itemGap: CGFloat = 4.0

    // MARK: Callbacks

    public var onAskAI: ((String) -> Void)?
    public var onQuickAction: ((String) -> Void)?
    public var onGlyphAction: ((EditorChromeGlyph) -> Void)?

    // MARK: Controls (public read-only accessors)

    /// Leading geometry / transform glyph buttons, left-to-right:
    /// marquee, rotate, flip-vertical, flip-horizontal, duplicate, lock, delete, diamond.
    public let glyphButtons: [EditorChromeIconButton]
    public let sparkleButton: EditorChromeIconButton
    public let promptButton: EditorChromePromptButton
    public let sendButton: EditorChromeIconButton
    public let quickActionChips: [EditorChromePillButton]
    public let separators: [EditorChromeSeparatorView]

    // MARK: State

    public private(set) var selectionLabel: String?

    /// Quick action chip titles, in display order.
    public static let quickActionTitles: [String] = ["Vectorize", "Boolean", "Style Transfer"]

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        let glyphOrder: [EditorChromeGlyph] = [
            .marquee, .rotate, .flipVertical, .flipHorizontal,
            .copy, .lock, .trash, .diamond
        ]
        glyphButtons = glyphOrder.map { EditorChromeIconButton(glyph: $0, frame: .zero) }
        separators = (0..<4).map { _ in EditorChromeSeparatorView(frame: .zero) }
        sparkleButton = EditorChromeIconButton(glyph: .sparkle, frame: .zero)
        promptButton = EditorChromePromptButton(frame: .zero)
        sendButton = EditorChromeIconButton(glyph: .arrowUp, frame: .zero)
        quickActionChips = ContextIslandBar.quickActionTitles.map {
            EditorChromePillButton(
                text: $0,
                font: ThemeFonts.mono(size: 10.0),
                frame: .zero
            )
        }
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        let glyphOrder: [EditorChromeGlyph] = [
            .marquee, .rotate, .flipVertical, .flipHorizontal,
            .copy, .lock, .trash, .diamond
        ]
        glyphButtons = glyphOrder.map { EditorChromeIconButton(glyph: $0, frame: .zero) }
        separators = (0..<4).map { _ in EditorChromeSeparatorView(frame: .zero) }
        sparkleButton = EditorChromeIconButton(glyph: .sparkle, frame: .zero)
        promptButton = EditorChromePromptButton(frame: .zero)
        sendButton = EditorChromeIconButton(glyph: .arrowUp, frame: .zero)
        quickActionChips = ContextIslandBar.quickActionTitles.map {
            EditorChromePillButton(
                text: $0,
                font: ThemeFonts.mono(size: 10.0),
                frame: .zero
            )
        }
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        setAccessibilityElement(true)
        setAccessibilityRole(.toolbar)
        setAccessibilityIdentifier(EditorChromeAccessibility.islandBar)
        setAccessibilityLabel("Selection actions and AI prompt")

        // Web `shadow-pop` on the floating capsule; match the rail / zoom bar so
        // the floating chrome shares one shadow treatment.
        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.35
        layer?.shadowRadius = 12.0
        layer?.shadowOffset = CGSize(width: 0, height: -4)

        configureGlyphButtons()
        configureSparkleButton()
        configurePromptButton()
        configureSendButton()
        configureQuickActionChips()
        configureSeparators()

        let orderedSubviews: [NSView] = [
            glyphButtons[0], glyphButtons[1], separators[0],
            glyphButtons[2], glyphButtons[3], glyphButtons[4], glyphButtons[5],
            separators[1], glyphButtons[6], separators[2], glyphButtons[7], separators[3],
            sparkleButton, promptButton, sendButton,
            quickActionChips[0], quickActionChips[1], quickActionChips[2]
        ]
        for view in orderedSubviews {
            view.translatesAutoresizingMaskIntoConstraints = true
            addSubview(view)
        }

        refreshSendButtonAppearance()
        isHidden = true
    }

    // MARK: Public API

    /// Shows the island when `selectionLabel` is non-nil, hides it otherwise,
    /// and rewrites the AI prompt placeholder from the selected layer name.
    public func update(selectionLabel: String?) {
        self.selectionLabel = selectionLabel
        if let selectionLabel, !selectionLabel.isEmpty {
            promptButton.placeholderText = "Ask AI to modify @\(selectionLabel)..."
            isHidden = false
        } else {
            promptButton.placeholderText = "Ask AI to modify @Shape..."
            isHidden = true
        }
        invalidateIntrinsicContentSize()
        needsLayout = true
        needsDisplay = true
    }

    /// Optional user prompt shown inside the AI capsule. Empty/nil shows the
    /// placeholder and disables the send circle (matching the web reference).
    public var promptText: String {
        get { promptButton.text ?? "" }
        set {
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            promptButton.text = trimmed.isEmpty ? nil : newValue
            refreshSendButtonAppearance()
        }
    }

    public var preferredSize: NSSize {
        NSSize(width: naturalContentWidth, height: ContextIslandBar.preferredHeight)
    }

    public override var intrinsicContentSize: NSSize {
        preferredSize
    }

    /// The current prompt sent to the agent when the capsule or sparkle is clicked.
    private var currentPromptValue: String {
        (promptButton.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Configuration helpers

    private func configureGlyphButtons() {
        let configs: [(identifier: String, label: String, help: String)] = [
            (EditorChromeAccessibility.islandSelection, "Selection", "Select the layer"),
            (EditorChromeAccessibility.islandRotate, "Rotate", "Rotate the selection"),
            (EditorChromeAccessibility.islandFlipVertical, "Flip vertical", "Flip the selection vertically"),
            (EditorChromeAccessibility.islandFlipHorizontal, "Flip horizontal", "Flip the selection horizontally"),
            (EditorChromeAccessibility.islandDuplicate, "Duplicate", "Duplicate the selection"),
            (EditorChromeAccessibility.islandLock, "Lock", "Lock or unlock the selection"),
            (EditorChromeAccessibility.islandDelete, "Delete", "Delete the selection"),
            (EditorChromeAccessibility.islandDiamond, "Create component", "Create a component from the selection")
        ]

        for (index, button) in glyphButtons.enumerated() {
            let config = configs[index]
            button.setAccessibilityIdentifier(config.identifier)
            button.setAccessibilityRole(.button)
            button.setAccessibilityLabel(config.label)
            button.setAccessibilityHelp(config.help)
            button.toolTip = config.label
            button.glyphSize = 13.0
            button.iconColor = index == 6
                ? NSColor(hex: "#fb7185")   // rose-400 delete glyph
                : NSColor(white: 0.83, alpha: 1.0)
            button.hoverIconColor = index == 6
                ? NSColor(hex: "#fda4af")
                : NSColor.white
            button.backgroundColor = .clear
            button.hoverBackgroundColor = NSColor(white: 1.0, alpha: 0.10)
            button.pressedBackgroundColor = NSColor(white: 1.0, alpha: 0.16)
            button.cornerRadius = 6.0
            button.strokeWidth = 2.0
            button.onClick = { [weak self] in
                guard let self else { return }
                self.onGlyphAction?(button.glyph)
            }
        }
    }

    private func configureSparkleButton() {
        sparkleButton.setAccessibilityIdentifier(EditorChromeAccessibility.islandAISparkle)
        sparkleButton.setAccessibilityRole(.button)
        sparkleButton.setAccessibilityLabel("Ask VOO AI Agent")
        sparkleButton.setAccessibilityHelp("Ask the AI agent to work on the selection")
        sparkleButton.toolTip = "Ask VOO AI Agent"
        sparkleButton.glyphSize = 13.0
        sparkleButton.iconColor = NSColor(hex: ThemeTokens.accentPurple)
        sparkleButton.hoverIconColor = NSColor(hex: ThemeTokens.accentPurpleText)
        sparkleButton.backgroundColor = NSColor(white: 1.0, alpha: 0.08)
        sparkleButton.hoverBackgroundColor = NSColor(hex: ThemeTokens.accentPurple).withAlphaComponent(0.20)
        sparkleButton.pressedBackgroundColor = NSColor(hex: ThemeTokens.accentPurple).withAlphaComponent(0.30)
        sparkleButton.cornerRadius = ContextIslandBar.aiSparkleSize / 2.0
        sparkleButton.strokeWidth = 1.8
        sparkleButton.onClick = { [weak self] in
            guard let self else { return }
            self.onAskAI?(self.currentPromptValue)
        }
    }

    private func configurePromptButton() {
        promptButton.setAccessibilityIdentifier(EditorChromeAccessibility.islandAIPrompt)
        promptButton.setAccessibilityRole(.button)
        promptButton.setAccessibilityLabel(promptButton.placeholderText)
        promptButton.setAccessibilityHelp("Ask the AI agent to modify the selected layer")
        promptButton.toolTip = promptButton.placeholderText
        promptButton.preferredWidth = 192.0
        promptButton.onClick = { [weak self] in
            guard let self else { return }
            self.onAskAI?(self.currentPromptValue)
        }
    }

    private func configureSendButton() {
        sendButton.setAccessibilityIdentifier(EditorChromeAccessibility.islandAISend)
        sendButton.setAccessibilityRole(.button)
        sendButton.setAccessibilityLabel("Send prompt to AI")
        sendButton.setAccessibilityHelp("Send the prompt to the AI agent")
        sendButton.toolTip = "Send prompt to AI"
        sendButton.glyphSize = 12.0
        sendButton.cornerRadius = ContextIslandBar.sendButtonSize / 2.0
        sendButton.strokeWidth = 2.4
        sendButton.onClick = { [weak self] in
            guard let self else { return }
            self.onAskAI?(self.currentPromptValue)
        }
    }

    private func configureQuickActionChips() {
        let identifiers = [
            EditorChromeAccessibility.islandActionVectorize,
            EditorChromeAccessibility.islandActionBoolean,
            EditorChromeAccessibility.islandActionStyleTransfer
        ]
        for (index, chip) in quickActionChips.enumerated() {
            chip.setAccessibilityIdentifier(identifiers[index])
            chip.setAccessibilityRole(.button)
            chip.setAccessibilityLabel(chip.text)
            chip.setAccessibilityHelp("Run \(chip.text) on the selection")
            chip.toolTip = chip.text
            chip.textColor = NSColor(white: 0.83, alpha: 1.0)
            chip.hoverTextColor = NSColor(hex: ThemeTokens.accentPurpleText)
            chip.backgroundColor = NSColor(white: 1.0, alpha: 0.06)
            chip.hoverBackgroundColor = NSColor(hex: ThemeTokens.accentPurple).withAlphaComponent(0.20)
            chip.pressedBackgroundColor = NSColor(hex: ThemeTokens.accentPurple).withAlphaComponent(0.30)
            chip.horizontalPadding = 10.0
            chip.contentHeight = ContextIslandBar.chipHeight
            chip.onClick = { [weak self] in
                guard let self else { return }
                self.onQuickAction?(chip.text)
            }
        }
    }

    private func configureSeparators() {
        for separator in separators {
            // Web: `bg-white/15` divider.
            separator.lineColor = NSColor(white: 1.0, alpha: 0.15)
            separator.setAccessibilityElement(false)
        }
    }

    private func refreshSendButtonAppearance() {
        let enabled = !currentPromptValue.isEmpty
        sendButton.isEnabled = enabled
        if enabled {
            sendButton.backgroundColor = NSColor(hex: ThemeTokens.accentPurple)
            sendButton.hoverBackgroundColor = NSColor(hex: ThemeTokens.accentPurpleText)
            sendButton.pressedBackgroundColor = NSColor(hex: ThemeTokens.accentPurpleText)
            sendButton.iconColor = .black
            sendButton.hoverIconColor = .black
        } else {
            sendButton.backgroundColor = NSColor(hex: ThemeTokens.accentPurple).withAlphaComponent(0.30)
            sendButton.hoverBackgroundColor = NSColor(hex: ThemeTokens.accentPurple).withAlphaComponent(0.30)
            sendButton.pressedBackgroundColor = NSColor(hex: ThemeTokens.accentPurple).withAlphaComponent(0.30)
            sendButton.iconColor = NSColor.black.withAlphaComponent(0.55)
            sendButton.hoverIconColor = NSColor.black.withAlphaComponent(0.55)
        }
        sendButton.needsDisplay = true
    }

    // MARK: Layout

    /// One horizontal layout slot. `gapBefore` is the space between the
    /// previous slot and this one.
    private struct LayoutSlot {
        let view: NSView
        let width: CGFloat
        let height: CGFloat
        let gapBefore: CGFloat
    }

    private func layoutSlots() -> [LayoutSlot] {
        var slots: [LayoutSlot] = []
        let glyphSize = ContextIslandBar.glyphButtonSize
        let separatorHeight: CGFloat = 14.0
        let chipHeight = ContextIslandBar.chipHeight
        let gap = ContextIslandBar.itemGap

        slots.append(LayoutSlot(view: glyphButtons[0], width: glyphSize, height: glyphSize, gapBefore: 0))
        slots.append(LayoutSlot(view: glyphButtons[1], width: glyphSize, height: glyphSize, gapBefore: gap))
        slots.append(LayoutSlot(view: separators[0], width: 1, height: separatorHeight, gapBefore: gap))
        slots.append(LayoutSlot(view: glyphButtons[2], width: glyphSize, height: glyphSize, gapBefore: gap))
        slots.append(LayoutSlot(view: glyphButtons[3], width: glyphSize, height: glyphSize, gapBefore: gap))
        slots.append(LayoutSlot(view: glyphButtons[4], width: glyphSize, height: glyphSize, gapBefore: gap))
        slots.append(LayoutSlot(view: glyphButtons[5], width: glyphSize, height: glyphSize, gapBefore: gap))
        slots.append(LayoutSlot(view: separators[1], width: 1, height: separatorHeight, gapBefore: gap))
        slots.append(LayoutSlot(view: glyphButtons[6], width: glyphSize, height: glyphSize, gapBefore: gap))
        slots.append(LayoutSlot(view: separators[2], width: 1, height: separatorHeight, gapBefore: gap))
        slots.append(LayoutSlot(view: glyphButtons[7], width: glyphSize, height: glyphSize, gapBefore: gap))
        slots.append(LayoutSlot(view: separators[3], width: 1, height: separatorHeight, gapBefore: gap))
        slots.append(LayoutSlot(
            view: sparkleButton,
            width: ContextIslandBar.aiSparkleSize,
            height: ContextIslandBar.aiSparkleSize,
            gapBefore: gap
        ))
        slots.append(LayoutSlot(
            view: promptButton,
            width: promptButton.preferredWidth,
            height: 24.0,
            gapBefore: gap
        ))
        slots.append(LayoutSlot(
            view: sendButton,
            width: ContextIslandBar.sendButtonSize,
            height: ContextIslandBar.sendButtonSize,
            gapBefore: gap
        ))

        for chip in quickActionChips {
            slots.append(LayoutSlot(
                view: chip,
                width: ceil(chip.intrinsicContentSize.width),
                height: chipHeight,
                gapBefore: gap
            ))
        }
        return slots
    }

    private var naturalContentWidth: CGFloat {
        let slots = layoutSlots()
        let content = slots.reduce(CGFloat(0)) { $0 + $1.gapBefore + $1.width }
        return ceil(content + ContextIslandBar.horizontalPadding * 2.0)
    }

    public override func layout() {
        super.layout()
        let slots = layoutSlots()
        let totalWidth = slots.reduce(CGFloat(0)) { $0 + $1.gapBefore + $1.width }
            + ContextIslandBar.horizontalPadding * 2.0
        let originX = max(0.0, (bounds.width - totalWidth) / 2.0) + ContextIslandBar.horizontalPadding
        var x = originX
        for slot in slots {
            x += slot.gapBefore
            let y = (bounds.height - slot.height) / 2.0
            slot.view.frame = NSRect(x: ceil(x), y: y, width: slot.width, height: slot.height)
            x += slot.width
        }
    }

    // MARK: Drawing

    public override var isOpaque: Bool { false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = chromeCapsulePath(in: rect)

        // Web: `bg-neutral-900/95` + a hairline white/10 border.
        ctx.setFillColor(NSColor(hex: ThemeTokens.surfacePanel).withAlphaComponent(0.95).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.10).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }
}
