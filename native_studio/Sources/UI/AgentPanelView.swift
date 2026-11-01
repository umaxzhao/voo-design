//
//  AgentPanelView.swift
//  native_studio
//
//  AI Agent side panel — pure AppKit / CoreGraphics replica of the VOO Design
//  web agent column (376pt wide, black chrome, purple VOO badge, suggestion
//  chips, message stack and bottom composer card).
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Panel Metrics

public enum AgentPanelMetrics {
    /// Canonical panel card width (UI_SPEC §7: x1064 w364, 12pt gap to window edge).
    public static let panelWidth: CGFloat = 364
    /// Web agent column is `rounded-3xl bg-black` (24pt corners).
    public static let cornerRadius: CGFloat = 24
    /// Host adds the 12pt outer window padding; this is the panel's inner gutter.
    public static let contentInset: CGFloat = 16

    public static let headerHeight: CGFloat = 48
    public static let headerTrailingInset: CGFloat = 16
    public static let headerLeadingInset: CGFloat = 16
    public static let bodyRightInset: CGFloat = 16
    public static let iconButtonSpacing: CGFloat = 8
    public static let avatarSize: CGFloat = 28
    public static let heroBadgeSize: CGFloat = 56
    public static let messageAvatarSize: CGFloat = 40
    public static let iconButtonSize: CGFloat = 32
    public static let iconGlyphSize: CGFloat = 16

    public static let suggestionChipHeight: CGFloat = 38
    public static let suggestionChipSpacing: CGFloat = 8
    public static let suggestionChipCornerRadius: CGFloat = 12
    public static let suggestionChipTextInset: CGFloat = 14

    public static let composerHeight: CGFloat = 130
    public static let composerSideInset: CGFloat = 12
    public static let composerBottomInset: CGFloat = 12
    public static let composerCornerRadius: CGFloat = 16
    public static let composerTextInset: CGFloat = 14
    public static let composerBottomRowHeight: CGFloat = 24
    public static let sendButtonSize: CGFloat = 32
    public static let sendButtonInset: CGFloat = 12
    public static let modelChipHeight: CGFloat = 24
    public static let modelChipRadius: CGFloat = 8
    public static let modelChipSpacing: CGFloat = 8

    public static let messageBubbleMaxWidth: CGFloat = 300
    public static let messageBubbleHorizontalInset: CGFloat = 14
    public static let messageBubbleVerticalInset: CGFloat = 10
    public static let messageStackSpacing: CGFloat = 16
    /// Left gutter reserved for the 40pt author avatar on the first message of a turn.
    public static let messageAvatarIndent: CGFloat = 52

    // Typography (values verified against docs/refs/web_20261031/web_agent_open.png).
    public static let headerTitleFontSize: CGFloat = 12
    public static let modelStatusFontSize: CGFloat = 10
    public static let greetingFontSize: CGFloat = 15
    public static let suggestionFontSize: CGFloat = 12
    public static let hintFontSize: CGFloat = 12
    public static let composerFontSize: CGFloat = 12
    public static let modelChipFontSize: CGFloat = 11
    public static let messageFontSize: CGFloat = 12.5
    public static let messageCodeFontSize: CGFloat = 11.5
}

// MARK: - Accessibility Identifiers

public enum AgentPanelAccessibility {
    public static let panel = "Agent.Panel"
    public static let header = "Agent.Header"
    public static let close = "Agent.Close"
    public static let history = "Agent.History"
    public static let newChat = "Agent.NewChat"
    public static let modelStatus = "Agent.ModelStatus"
    public static let send = "Agent.Send"
    public static let composer = "Agent.Composer"
    public static let composerInput = "Agent.Composer.Input"
    public static let messageList = "Agent.Messages"
    public static let heroBadge = "Agent.Badge"

    public static func suggestion(_ index: Int) -> String {
        return "Agent.Suggestion.\(index)"
    }
}

// MARK: - Palette (reference-sampled)

private enum AgentPalette {
    /// Web panel section is `bg-black`; the chips are `bg-white/[0.06]` on it.
    static let panelBackground = NSColor(hex: "#000000")
    static let panelBorder = NSColor(white: 1.0, alpha: 0.08)

    static let chipFill = NSColor(hex: "#0F0F0F")
    static let chipFillHover = NSColor(hex: "#1A1A1A")
    static let chipText = NSColor(hex: "#D6D6D6")

    static let purple = NSColor(hex: ThemeTokens.accentPurple)
    static let purpleDeep = NSColor(hex: "#C77DFF")
    static let purpleLight = NSColor(hex: "#F2CCFF")
    static let mint = ThemeTokens.colorMint

    static let composerFill = NSColor(hex: "#171717")
    static let composerBorder = NSColor(white: 1.0, alpha: 0.08)
    static let composerBorderFocused = NSColor(hex: "#A7FFD4").withAlphaComponent(0.45)
    static let placeholder = ThemeTokens.textMuted
    static let composerGlow = NSColor(hex: "#A7FFD4").withAlphaComponent(0.16)
    static let modelChipFill = NSColor(white: 1.0, alpha: 0.05)
    static let modelChipText = NSColor(white: 0.64, alpha: 1.0)

    static let markColor = NSColor(hex: "#0B0B0B")

    static let agentProseText = NSColor(hex: "#E5E5E5")
    static let agentCodeText = NSColor(hex: "#C9C9C9")
    static let userBubbleFill = NSColor(white: 1.0, alpha: 0.08)
    static let userBubbleText = NSColor(hex: "#F5F5F5")

    static let agentErrorText = NSColor(hex: "#FFB4B4")
}

// MARK: - Typography helpers

private enum AgentTextDrawing {
    static func paragraphStyle(lineSpacing: CGFloat = 0, truncating: Bool = false) -> NSMutableParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = lineSpacing
        style.lineBreakMode = truncating ? .byTruncatingTail : .byWordWrapping
        return style
    }

    static func attributes(
        font: NSFont,
        color: NSColor,
        lineSpacing: CGFloat = 0,
        truncating: Bool = false,
        kern: CGFloat = 0
    ) -> [NSAttributedString.Key: Any] {
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraphStyle(lineSpacing: lineSpacing, truncating: truncating)
        ]
        if kern != 0 {
            attributes[.kern] = kern
        }
        return attributes
    }

    static func measuredWidth(_ text: String, font: NSFont, kern: CGFloat = 0) -> CGFloat {
        guard !text.isEmpty else { return 0 }
        if kern == 0 {
            return ceil((text as NSString).size(withAttributes: [.font: font]).width)
        }
        return ceil((text as NSString).size(withAttributes: attributes(
            font: font, color: .white, kern: kern
        )).width)
    }

    static func measuredHeight(
        _ text: String,
        font: NSFont,
        width: CGFloat,
        lineSpacing: CGFloat = 0
    ) -> CGFloat {
        guard !text.isEmpty, width > 0 else { return 0 }
        let attrs = attributes(font: font, color: .white, lineSpacing: lineSpacing)
        let rect = (text as NSString).boundingRect(
            with: NSSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attrs
        )
        return ceil(rect.height)
    }

    static func draw(
        _ text: String,
        in rect: NSRect,
        font: NSFont,
        color: NSColor,
        lineSpacing: CGFloat = 0
    ) {
        guard !text.isEmpty, rect.width > 0, rect.height > 0 else { return }
        let attrs = attributes(font: font, color: color, lineSpacing: lineSpacing)
        (text as NSString).draw(
            with: rect,
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attrs
        )
    }

    static func drawSingleLine(
        _ text: String,
        in rect: NSRect,
        font: NSFont,
        color: NSColor,
        alignment: NSTextAlignment = .left,
        kern: CGFloat = 0
    ) {
        guard !text.isEmpty, rect.width > 0, rect.height > 0 else { return }
        let style = paragraphStyle(truncating: true)
        style.alignment = alignment
        var attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style
        ]
        if kern != 0 {
            attrs[.kern] = kern
        }
        (text as NSString).draw(
            with: rect,
            options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
            attributes: attrs
        )
    }
}

// MARK: - Vector glyphs (drawn in y-down design space so flipped views stay upright)

private enum AgentGlyphDrawing {
    static func draw(_ glyph: AgentPanelGlyph, in rect: CGRect, color: NSColor, lineWidth: CGFloat = 1.6) {
        guard rect.width > 0, rect.height > 0,
              let ctx = NSGraphicsContext.current?.cgContext else { return }

        ctx.saveGState()
        let scale = min(rect.width, rect.height) / 24.0
        ctx.translateBy(x: rect.minX, y: rect.minY)
        ctx.scaleBy(x: scale, y: scale)
        ctx.setStrokeColor(color.cgColor)
        ctx.setFillColor(color.cgColor)
        ctx.setLineWidth(lineWidth)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)

        switch glyph {
        case .history:
            // Clock dial + hands + counter-clockwise rewind corner (Lucide "history").
            ctx.strokeEllipse(in: CGRect(x: 7.0, y: 6.0, width: 15.0, height: 15.0))
            ctx.strokeLineSegments(between: [CGPoint(x: 14.5, y: 9.0), CGPoint(x: 14.5, y: 13.5)])
            ctx.strokeLineSegments(between: [CGPoint(x: 14.5, y: 13.5), CGPoint(x: 17.5, y: 15.0)])
            ctx.strokeLineSegments(between: [CGPoint(x: 1.5, y: 2.5), CGPoint(x: 1.5, y: 7.0)])
            ctx.strokeLineSegments(between: [CGPoint(x: 1.5, y: 7.0), CGPoint(x: 6.0, y: 7.0)])

        case .plus:
            ctx.strokeLineSegments(between: [CGPoint(x: 12, y: 5), CGPoint(x: 12, y: 19)])
            ctx.strokeLineSegments(between: [CGPoint(x: 5, y: 12), CGPoint(x: 19, y: 12)])

        case .collapse:
            let panelRect = CGRect(x: 3, y: 4.5, width: 18, height: 15)
            let path = CGPath(
                roundedRect: panelRect,
                cornerWidth: 2.4,
                cornerHeight: 2.4,
                transform: nil
            )
            ctx.addPath(path)
            ctx.strokePath()
            ctx.strokeLineSegments(between: [CGPoint(x: 8.6, y: 4.5), CGPoint(x: 8.6, y: 19.5)])

        case .arrowUp:
            ctx.strokeLineSegments(between: [CGPoint(x: 12, y: 19), CGPoint(x: 12, y: 5)])
            let tip = CGMutablePath()
            tip.move(to: CGPoint(x: 5.0, y: 12.0))
            tip.addLine(to: CGPoint(x: 12.0, y: 5.0))
            tip.addLine(to: CGPoint(x: 19.0, y: 12.0))
            ctx.addPath(tip)
            ctx.strokePath()

        case .brandMark:
            drawBrandMark(ctx: ctx, color: color)
        }

        ctx.restoreGState()
    }

    /// VOO hexagon / inscribed triangle / ring brand mark, authored in y-down space.
    private static func drawBrandMark(ctx: CGContext, color: NSColor) {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 21.0, y: 6.25))
        path.addLine(to: CGPoint(x: 21.0, y: 16.75))
        path.addLine(to: CGPoint(x: 11.5, y: 22.0))
        path.addLine(to: CGPoint(x: 2.0, y: 16.75))
        path.addLine(to: CGPoint(x: 2.0, y: 6.25))
        path.addLine(to: CGPoint(x: 11.5, y: 1.0))
        path.closeSubpath()

        path.move(to: CGPoint(x: 11.5, y: 22.0))
        path.addLine(to: CGPoint(x: 21.0, y: 6.25))
        path.addLine(to: CGPoint(x: 2.0, y: 6.25))
        path.closeSubpath()

        ctx.setFillColor(color.cgColor)
        ctx.setStrokeColor(color.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        let circleRect = CGRect(x: 6.5, y: 6.5, width: 10.0, height: 10.0)
        ctx.setLineWidth(1.6)
        ctx.strokeEllipse(in: circleRect)
    }
}

// MARK: - Glyph catalogue used by the panel

public enum AgentPanelGlyph {
    case history
    case plus
    case collapse
    case arrowUp
    case brandMark
}

// MARK: - Reusable hover tracking

private extension NSButton {
    func installAgentHoverTracking() {
        wantsLayer = false
        focusRingType = .none
        isBordered = false
        title = ""
    }
}

// MARK: - Header icon button

public final class AgentPanelIconButton: NSButton {
    public let glyph: AgentPanelGlyph
    public var onClick: (() -> Void)?

    public var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }

    public init(glyph: AgentPanelGlyph, tooltip: String, accessibilityLabel: String) {
        self.glyph = glyph
        super.init(frame: NSRect(x: 0, y: 0, width: AgentPanelMetrics.iconButtonSize, height: AgentPanelMetrics.iconButtonSize))
        installAgentHoverTracking()
        self.toolTip = tooltip
        self.target = self
        self.action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel(accessibilityLabel)
    }

    public override init(frame frameRect: NSRect) {
        self.glyph = .plus
        super.init(frame: frameRect)
        installAgentHoverTracking()
        self.target = self
        self.action = #selector(handleClick)
        setAccessibilityRole(.button)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() {
        onClick?()
    }

    public override var isFlipped: Bool { true }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

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

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) { isHovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        if isHovered || isHighlighted {
            let wash = bounds.insetBy(dx: 2, dy: 2)
            let path = CGPath(roundedRect: wash, cornerWidth: 8, cornerHeight: 8, transform: nil)
            ctx.setFillColor(NSColor(white: 1.0, alpha: isHighlighted ? 0.12 : 0.07).cgColor)
            ctx.addPath(path)
            ctx.fillPath()
        }

        let color: NSColor = isHovered || isHighlighted
            ? NSColor(white: 1.0, alpha: 1.0)
            : NSColor(white: 0.62, alpha: 1.0)
        let side = AgentPanelMetrics.iconGlyphSize
        let glyphRect = CGRect(
            x: bounds.midX - side / 2.0,
            y: bounds.midY - side / 2.0,
            width: side,
            height: side
        )
        AgentGlyphDrawing.draw(glyph, in: glyphRect, color: color, lineWidth: 1.6)
    }
}

// MARK: - Hero VOO badge (large purple medallion)

public final class AgentHeroBadgeView: NSView {
    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityRole(.image)
        setAccessibilityLabel("VOO agent")
        setAccessibilityIdentifier(AgentPanelAccessibility.heroBadge)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setAccessibilityRole(.image)
        setAccessibilityLabel("VOO agent")
        setAccessibilityIdentifier(AgentPanelAccessibility.heroBadge)
    }

    public override var isFlipped: Bool { true }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let circleRect = bounds.insetBy(dx: 0.5, dy: 0.5)

        ctx.saveGState()
        ctx.addEllipse(in: circleRect)
        ctx.clip()
        ctx.setFillColor(AgentPalette.purple.cgColor)
        ctx.fill(circleRect)
        if let gradient = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                AgentPalette.purpleLight.withAlphaComponent(0.55).cgColor,
                AgentPalette.purple.withAlphaComponent(0.0).cgColor
            ] as CFArray,
            locations: [0.0, 1.0]
        ) {
            ctx.drawRadialGradient(
                gradient,
                startCenter: CGPoint(x: circleRect.midX, y: circleRect.minY + circleRect.height * 0.28),
                startRadius: 0,
                endCenter: CGPoint(x: circleRect.midX, y: circleRect.minY + circleRect.height * 0.28),
                endRadius: circleRect.width * 0.75,
                options: [.drawsAfterEndLocation]
            )
        }
        ctx.restoreGState()

        let logoInset = min(bounds.width, bounds.height) * 0.27
        let logoRect = bounds.insetBy(dx: logoInset, dy: logoInset)
        AgentGlyphDrawing.draw(.brandMark, in: logoRect, color: AgentPalette.markColor, lineWidth: 1.6)
    }
}

// MARK: - Suggestion chip

public final class AgentSuggestionChipView: NSButton {
    public let suggestionText: String
    public let index: Int
    public var onSelect: (() -> Void)?

    public var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }

    public init(index: Int, suggestionText: String, accessibilityIdentifier: String) {
        self.index = index
        self.suggestionText = suggestionText
        super.init(frame: .zero)
        installAgentHoverTracking()
        self.target = self
        self.action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel(suggestionText)
        setAccessibilityIdentifier(accessibilityIdentifier)
        toolTip = suggestionText
    }

    public override init(frame frameRect: NSRect) {
        self.index = 0
        self.suggestionText = ""
        super.init(frame: frameRect)
        installAgentHoverTracking()
        self.target = self
        self.action = #selector(handleClick)
        setAccessibilityRole(.button)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() {
        onSelect?()
    }

    public override var isFlipped: Bool { true }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

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

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) { isHovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let radius = AgentPanelMetrics.suggestionChipCornerRadius
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

        // Web suggestion row: `rounded-xl bg-white/[0.06]` on black, no border.
        let fill: NSColor
        if isHighlighted {
            fill = NSColor(white: 0.16, alpha: 1.0)
        } else if isHovered {
            fill = AgentPalette.chipFillHover
        } else {
            fill = AgentPalette.chipFill
        }
        ctx.setFillColor(fill.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        let font = ThemeFonts.system(size: AgentPanelMetrics.suggestionFontSize, weight: .regular)
        let lineHeight = ceil(font.ascender - font.descender + font.leading)
        let inset = AgentPanelMetrics.suggestionChipTextInset
        let textRect = CGRect(
            x: inset,
            y: floor((bounds.height - lineHeight) / 2.0),
            width: max(0, bounds.width - inset * 2.0),
            height: lineHeight
        )
        AgentTextDrawing.drawSingleLine(
            suggestionText,
            in: textRect,
            font: font,
            color: isHovered ? NSColor(white: 0.94, alpha: 1.0) : AgentPalette.chipText
        )
    }
}

// MARK: - Send button

public final class AgentSendButton: NSButton {
    public var onClick: (() -> Void)?

    public var isHovered: Bool = false {
        didSet { if oldValue != isHovered { needsDisplay = true } }
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        installAgentHoverTracking()
        self.target = self
        self.action = #selector(handleClick)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Send message")
        setAccessibilityIdentifier(AgentPanelAccessibility.send)
        toolTip = "Send message"
        // Reference: the arrow is dimmed while the composer is empty.
        isEnabled = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() {
        onClick?()
    }

    public override var isFlipped: Bool { true }

    public override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

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

    public override func mouseEntered(with event: NSEvent) { isHovered = true }
    public override func mouseExited(with event: NSEvent) { isHovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let circle = bounds.insetBy(dx: 0.5, dy: 0.5)

        // Empty input → dim purple (web disabled state); typed input → solid white.
        let fill: NSColor
        if !isEnabled {
            fill = AgentPalette.purple.withAlphaComponent(0.42)
        } else if isHighlighted {
            fill = NSColor(white: 0.82, alpha: 1.0)
        } else if isHovered {
            fill = NSColor(white: 0.94, alpha: 1.0)
        } else {
            fill = NSColor(white: 1.0, alpha: 1.0)
        }

        ctx.setFillColor(fill.cgColor)
        ctx.fillEllipse(in: circle)

        let glyphSide: CGFloat = 12.0
        let glyphRect = CGRect(
            x: bounds.midX - glyphSide / 2.0,
            y: bounds.midY - glyphSide / 2.0,
            width: glyphSide,
            height: glyphSide
        )
        AgentGlyphDrawing.draw(
            .arrowUp,
            in: glyphRect,
            color: isEnabled ? AgentPalette.markColor : AgentPalette.markColor.withAlphaComponent(0.55),
            lineWidth: 2.0
        )
    }
}

// MARK: - Composer text view (Enter = send, Shift+Enter = newline)

public final class AgentComposerTextView: NSTextView {
    public var onSubmit: (() -> Void)?

    public override func keyDown(with event: NSEvent) {
        let isReturnKey = event.keyCode == 36 || event.keyCode == 76
        if isReturnKey {
            if hasMarkedText() {
                super.keyDown(with: event)
                return
            }
            if event.modifierFlags.contains(.shift) {
                super.keyDown(with: event)
                return
            }
            onSubmit?()
            return
        }
        super.keyDown(with: event)
    }
}

// MARK: - Composer card

public final class AgentComposerView: NSView, NSTextViewDelegate {
    /// Called with the trimmed message whenever the send button (or Return) fires.
    public var onSubmit: ((String) -> Void)?

    /// Plain-text content of the composer.
    public var text: String {
        get { return textView.string }
        set {
            textView.string = newValue
            updatePlaceholderVisibility()
        }
    }

    public var placeholderText: String = "Describe what to create on the canvas" {
        didSet { placeholderLabel.stringValue = placeholderText }
    }

    /// Model / agent label shown in the composer chip (host updates it from the
    /// active agent; web shows the current model next to a sparkle glyph).
    public var modelLabel: String = "Opus 5.5" {
        didSet {
            needsLayout = true
            needsDisplay = true
        }
    }

    public private(set) var isFocused: Bool = false

    public let textView: AgentComposerTextView
    public let sendButton: AgentSendButton

    private let placeholderLabel = NSTextField(labelWithString: "")
    private var modelChipRect: CGRect = .zero

    /// Width of the [sparkle glyph + label] composer model chip.
    private func modelChipWidth() -> CGFloat {
        let font = ThemeFonts.system(size: AgentPanelMetrics.modelChipFontSize)
        let textWidth = ceil(AgentTextDrawing.measuredWidth(modelLabel, font: font))
        return 8.0 + 10.0 + 4.0 + textWidth + 8.0
    }

    public override init(frame frameRect: NSRect) {
        self.textView = AgentComposerTextView(frame: NSRect(x: 0, y: 0, width: 300, height: 96))
        self.sendButton = AgentSendButton(frame: NSRect(
            x: 0,
            y: 0,
            width: AgentPanelMetrics.sendButtonSize,
            height: AgentPanelMetrics.sendButtonSize
        ))
        super.init(frame: frameRect)
        commonSetup()
    }

    required init?(coder: NSCoder) {
        self.textView = AgentComposerTextView(frame: NSRect(x: 0, y: 0, width: 300, height: 96))
        self.sendButton = AgentSendButton(frame: NSRect(
            x: 0,
            y: 0,
            width: AgentPanelMetrics.sendButtonSize,
            height: AgentPanelMetrics.sendButtonSize
        ))
        super.init(coder: coder)
        commonSetup()
    }

    private func commonSetup() {
        setAccessibilityIdentifier(AgentPanelAccessibility.composer)
        setAccessibilityRole(.group)
        setAccessibilityLabel("Message composer")

        // Soft mint under-glow around the composer card (web `prompt-composer`).
        wantsLayer = true
        layer?.shadowColor = AgentPalette.mint.cgColor
        layer?.shadowOpacity = 0.20
        layer?.shadowRadius = 16.0
        layer?.shadowOffset = .zero

        // Placeholder overlay (visible only while the composer is empty).
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = true
        placeholderLabel.font = ThemeFonts.system(size: AgentPanelMetrics.composerFontSize, weight: .regular)
        placeholderLabel.textColor = AgentPalette.placeholder
        placeholderLabel.stringValue = placeholderText
        placeholderLabel.lineBreakMode = .byTruncatingTail
        placeholderLabel.setAccessibilityIdentifier("Agent.Composer.Placeholder")
        placeholderLabel.isSelectable = false
        placeholderLabel.isEditable = false
        addSubview(placeholderLabel)

        // Text view (transparent, multi-line, custom background below).
        textView.isRichText = false
        textView.importsGraphics = false
        textView.drawsBackground = false
        textView.font = ThemeFonts.system(size: AgentPanelMetrics.composerFontSize, weight: .regular)
        textView.textColor = NSColor(white: 0.92, alpha: 1.0)
        textView.insertionPointColor = AgentPalette.mint
        textView.focusRingType = .none
        textView.textContainerInset = NSSize(
            width: AgentPanelMetrics.composerTextInset,
            height: AgentPanelMetrics.composerTextInset
        )
        textView.textContainer?.lineFragmentPadding = 0.0
        textView.textContainer?.widthTracksTextView = true
        textView.isVerticallyResizable = false
        textView.isHorizontallyResizable = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isContinuousSpellCheckingEnabled = false
        textView.isGrammarCheckingEnabled = false
        textView.delegate = self
        textView.onSubmit = { [weak self] in
            self?.submit()
        }
        textView.setAccessibilityIdentifier(AgentPanelAccessibility.composerInput)
        textView.setAccessibilityLabel("Message input")
        addSubview(textView)

        sendButton.onClick = { [weak self] in
            self?.submit()
        }
        addSubview(sendButton)

        updatePlaceholderVisibility()
    }

    public override var isFlipped: Bool { true }

    public func focus() {
        window?.makeFirstResponder(textView)
    }

    public func clear() {
        text = ""
    }

    public func submit() {
        let trimmed = textView.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onSubmit?(trimmed)
    }

    public override func layout() {
        super.layout()
        layoutChildren()
    }

    public override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        needsLayout = true
    }

    public func layoutChildren() {
        let width = bounds.width
        let height = bounds.height
        guard width > 0, height > 0 else { return }

        // Bottom-right row: [model chip] [send] inside the 12pt card padding.
        let sendSize = AgentPanelMetrics.sendButtonSize
        let sendInset = AgentPanelMetrics.sendButtonInset
        let sendY = height - sendInset - sendSize
        sendButton.frame = NSRect(
            x: width - sendInset - sendSize,
            y: sendY,
            width: sendSize,
            height: sendSize
        )
        let chipHeight = AgentPanelMetrics.modelChipHeight
        let chipWidth = min(
            modelChipWidth(),
            max(48.0, width - sendInset * 2.0 - sendSize - AgentPanelMetrics.modelChipSpacing)
        )
        modelChipRect = NSRect(
            x: sendButton.frame.minX - AgentPanelMetrics.modelChipSpacing - chipWidth,
            y: sendY + (sendSize - chipHeight) / 2.0,
            width: chipWidth,
            height: chipHeight
        )

        // Text area spans the card above the bottom row; text inset = web `p-3`.
        let textHeight = max(24.0, sendY - AgentPanelMetrics.modelChipSpacing)
        textView.frame = NSRect(x: 0, y: 0, width: width, height: textHeight)
        textView.textContainerInset = NSSize(
            width: AgentPanelMetrics.composerTextInset,
            height: AgentPanelMetrics.composerTextInset
        )

        let placeholderHeight = ceil(placeholderLabel.font.map { $0.ascender - $0.descender } ?? 16.0)
        placeholderLabel.frame = NSRect(
            x: AgentPanelMetrics.composerTextInset,
            y: AgentPanelMetrics.composerTextInset,
            width: max(0.0, width - AgentPanelMetrics.composerTextInset * 2.0),
            height: placeholderHeight
        )

        layer?.shadowPath = CGPath(
            roundedRect: bounds,
            cornerWidth: AgentPanelMetrics.composerCornerRadius,
            cornerHeight: AgentPanelMetrics.composerCornerRadius,
            transform: nil
        )
    }

    public override func hitTest(_ point: NSPoint) -> NSView? {
        let hit = super.hitTest(point)
        if hit === placeholderLabel { return textView }
        return hit
    }

    public override func mouseDown(with event: NSEvent) {
        focus()
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let card = bounds.insetBy(dx: 0.5, dy: 0.5)
        let radius = AgentPanelMetrics.composerCornerRadius
        let path = CGPath(roundedRect: card, cornerWidth: radius, cornerHeight: radius, transform: nil)

        ctx.setFillColor(AgentPalette.composerFill.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        drawModelChip(in: modelChipRect, ctx: ctx)

        ctx.setStrokeColor(
            (isFocused ? AgentPalette.composerBorderFocused : AgentPalette.composerBorder).cgColor
        )
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }

    /// Web composer model chip: `bg-white/[0.05] rounded-lg h-6 px-2 text-[11px]`
    /// with a sparkle glyph before the model label.
    private func drawModelChip(in rect: CGRect, ctx: CGContext) {
        guard rect.width > 4, rect.height > 4 else { return }
        let chipPath = CGPath(
            roundedRect: rect,
            cornerWidth: AgentPanelMetrics.modelChipRadius,
            cornerHeight: AgentPanelMetrics.modelChipRadius,
            transform: nil
        )
        ctx.setFillColor(AgentPalette.modelChipFill.cgColor)
        ctx.addPath(chipPath)
        ctx.fillPath()

        // Sparkle glyph (8 rays) at the left padding.
        let center = CGPoint(x: rect.minX + 8.0 + 5.0, y: rect.midY)
        ctx.setStrokeColor(AgentPalette.modelChipText.cgColor)
        ctx.setLineWidth(1.1)
        ctx.setLineCap(.round)
        for index in 0..<8 {
            let angle = Double(index) * Double.pi / 4.0
            let inner: CGFloat = index % 2 == 0 ? 1.4 : 2.6
            let outer: CGFloat = 5.0
            ctx.strokeLineSegments(between: [
                CGPoint(x: center.x + CGFloat(cos(angle)) * inner,
                        y: center.y + CGFloat(sin(angle)) * inner),
                CGPoint(x: center.x + CGFloat(cos(angle)) * outer,
                        y: center.y + CGFloat(sin(angle)) * outer)
            ])
        }

        let font = ThemeFonts.system(size: AgentPanelMetrics.modelChipFontSize)
        AgentTextDrawing.drawSingleLine(
            modelLabel,
            in: CGRect(
                x: rect.minX + 8.0 + 10.0 + 4.0,
                y: rect.minY,
                width: max(0, rect.width - 8.0 - 10.0 - 4.0 - 8.0),
                height: rect.height
            ),
            font: font,
            color: AgentPalette.modelChipText
        )
    }

    // MARK: NSTextViewDelegate

    public func textDidChange(_ notification: Notification) {
        updatePlaceholderVisibility()
    }

    public func textDidBeginEditing(_ notification: Notification) {
        isFocused = true
        needsDisplay = true
    }

    public func textDidEndEditing(_ notification: Notification) {
        isFocused = false
        needsDisplay = true
    }

    private func updatePlaceholderVisibility() {
        let isEmpty = textView.string.isEmpty
        placeholderLabel.isHidden = !isEmpty
        sendButton.isEnabled = !textView.string
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty
    }
}

// MARK: - Intro block (hero badge + greeting + suggestion chips + hint)

public final class AgentIntroView: NSView {
    public var onSuggestion: ((Int, String) -> Void)?

    public let suggestions: [String] = [
        "Draft a poster layout for a music festival",
        "Tidy up and align the selected layers",
        "Try a colour palette for this image"
    ]

    public private(set) var showsSuggestionsAndHint: Bool = true

    public let badgeView = AgentHeroBadgeView(frame: .zero)
    public private(set) var chipViews: [AgentSuggestionChipView] = []

    private let greetingText = "Hi, what shall we create together today?"
    private let hintText = "The agent can create and edit on the canvas. Enter to send, Shift + Enter for a new line."

    private var greetingHeight: CGFloat = 0
    private var hintHeight: CGFloat = 0

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonSetup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonSetup()
    }

    private func commonSetup() {
        setAccessibilityIdentifier("Agent.Intro")
        setAccessibilityRole(.group)
        setAccessibilityLabel("Agent greeting and suggestions")

        addSubview(badgeView)

        for (index, suggestion) in suggestions.enumerated() {
            let chip = AgentSuggestionChipView(
                index: index,
                suggestionText: suggestion,
                accessibilityIdentifier: AgentPanelAccessibility.suggestion(index)
            )
            chip.onSelect = { [weak self] in
                self?.onSuggestion?(index, suggestion)
            }
            chipViews.append(chip)
            addSubview(chip)
        }
    }

    public override var isFlipped: Bool { true }

    public func setSuggestionsAndHintVisible(_ visible: Bool) {
        guard showsSuggestionsAndHint != visible else { return }
        showsSuggestionsAndHint = visible
        chipViews.forEach { $0.isHidden = !visible }
        needsLayout = true
        needsDisplay = true
    }

    // MARK: Metrics

    private static let greetingFont = ThemeFonts.system(
        size: AgentPanelMetrics.greetingFontSize,
        weight: .regular
    )
    private static let greetingLineSpacing: CGFloat = 4.0
    private static let hintFont = ThemeFonts.system(
        size: AgentPanelMetrics.hintFontSize,
        weight: .regular
    )
    private static let hintLineSpacing: CGFloat = 4.0

    // Web empty-state block: badge → greeting `gap-4` (16), greeting → chips and
    // chips → hint `gap-6` (24).
    private static let badgeToGreetingGap: CGFloat = 16.0
    private static let greetingToChipsGap: CGFloat = 24.0
    private static let chipsToHintGap: CGFloat = 24.0

    public func requiredHeight(forWidth width: CGFloat) -> CGFloat {
        guard width > 0 else { return 0 }
        let greetingH = AgentTextDrawing.measuredHeight(
            greetingText,
            font: AgentIntroView.greetingFont,
            width: width,
            lineSpacing: AgentIntroView.greetingLineSpacing
        )
        var total = AgentPanelMetrics.heroBadgeSize + AgentIntroView.badgeToGreetingGap + greetingH
        if showsSuggestionsAndHint {
            let chipsH = CGFloat(suggestions.count) * AgentPanelMetrics.suggestionChipHeight
                + CGFloat(max(0, suggestions.count - 1)) * AgentPanelMetrics.suggestionChipSpacing
            let hintH = AgentTextDrawing.measuredHeight(
                hintText,
                font: AgentIntroView.hintFont,
                width: width,
                lineSpacing: AgentIntroView.hintLineSpacing
            )
            total += AgentIntroView.greetingToChipsGap + chipsH + AgentIntroView.chipsToHintGap + hintH
        }
        return ceil(total)
    }

    public override func layout() {
        super.layout()
        layoutChildren()
    }

    public override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        needsLayout = true
    }

    public func layoutChildren() {
        let width = bounds.width
        guard width > 0 else { return }

        let badgeSize = AgentPanelMetrics.heroBadgeSize
        badgeView.frame = NSRect(x: 0, y: 0, width: badgeSize, height: badgeSize)

        greetingHeight = AgentTextDrawing.measuredHeight(
            greetingText,
            font: AgentIntroView.greetingFont,
            width: width,
            lineSpacing: AgentIntroView.greetingLineSpacing
        )

        var y = badgeSize + AgentIntroView.badgeToGreetingGap + greetingHeight
        if showsSuggestionsAndHint {
            y += AgentIntroView.greetingToChipsGap
            for chip in chipViews {
                chip.frame = NSRect(
                    x: 0,
                    y: y,
                    width: width,
                    height: AgentPanelMetrics.suggestionChipHeight
                )
                y += AgentPanelMetrics.suggestionChipHeight + AgentPanelMetrics.suggestionChipSpacing
            }
            y -= AgentPanelMetrics.suggestionChipSpacing
            y += AgentIntroView.chipsToHintGap
            hintHeight = AgentTextDrawing.measuredHeight(
                hintText,
                font: AgentIntroView.hintFont,
                width: width,
                lineSpacing: AgentIntroView.hintLineSpacing
            )
        } else {
            hintHeight = 0
        }
    }

    public override func draw(_ dirtyRect: NSRect) {
        let width = bounds.width
        guard width > 0 else { return }

        let greetingTop = AgentPanelMetrics.heroBadgeSize + AgentIntroView.badgeToGreetingGap
        if greetingHeight <= 0 {
            greetingHeight = AgentTextDrawing.measuredHeight(
                greetingText,
                font: AgentIntroView.greetingFont,
                width: width,
                lineSpacing: AgentIntroView.greetingLineSpacing
            )
        }
        AgentTextDrawing.draw(
            greetingText,
            in: NSRect(x: 0, y: greetingTop, width: width, height: greetingHeight),
            font: AgentIntroView.greetingFont,
            color: NSColor(hex: "#E5E5E5"),
            lineSpacing: AgentIntroView.greetingLineSpacing
        )

        guard showsSuggestionsAndHint else { return }

        let chipsHeight = CGFloat(suggestions.count) * AgentPanelMetrics.suggestionChipHeight
            + CGFloat(max(0, suggestions.count - 1)) * AgentPanelMetrics.suggestionChipSpacing
        let hintTop = greetingTop + greetingHeight
            + AgentIntroView.greetingToChipsGap
            + chipsHeight
            + AgentIntroView.chipsToHintGap

        if hintHeight <= 0 {
            hintHeight = AgentTextDrawing.measuredHeight(
                hintText,
                font: AgentIntroView.hintFont,
                width: width,
                lineSpacing: AgentIntroView.hintLineSpacing
            )
        }
        AgentTextDrawing.draw(
            hintText,
            in: NSRect(x: 0, y: hintTop, width: width, height: hintHeight),
            font: AgentIntroView.hintFont,
            color: AgentPalette.placeholder,
            lineSpacing: AgentIntroView.hintLineSpacing
        )
    }
}

// MARK: - Message bubble

public final class AgentMessageBubbleView: NSView {
    public enum Role: String {
        case user
        case agent
    }

    public let role: Role
    public private(set) var messageText: String

    /// True while tokens are being appended by the live local-CLI stream.
    public private(set) var isStreaming: Bool = false

    /// Streaming/error messages are drawn as prose with the rose treatment.
    public var isError: Bool = false {
        didSet { needsDisplay = true; updateAccessibilityLabel() }
    }

    /// First agent message of a turn shows the 40pt author avatar; follow-up
    /// agent messages keep the same indent without repeating it.
    public var showsAvatar: Bool = false {
        didSet { if oldValue != showsAvatar { needsDisplay = true } }
    }

    private static let proseFont = ThemeFonts.system(
        size: AgentPanelMetrics.messageFontSize,
        weight: .regular
    )
    private static let codeFont = ThemeFonts.mono(
        size: AgentPanelMetrics.messageCodeFontSize,
        weight: .regular
    )
    private static let proseLineHeight: CGFloat = 19.0
    private static let codeLineHeight: CGFloat = 16.0
    private static let minimumWidth: CGFloat = 72.0
    private static let minimumHeight: CGFloat = 24.0
    private static let avatarSize = AgentPanelMetrics.messageAvatarSize

    public init(role: Role, text: String) {
        self.role = role
        self.messageText = text
        super.init(frame: .zero)
        commonSetup()
    }

    public override init(frame frameRect: NSRect) {
        self.role = .agent
        self.messageText = ""
        super.init(frame: frameRect)
        commonSetup()
    }

    required init?(coder: NSCoder) {
        self.role = .agent
        self.messageText = ""
        super.init(coder: coder)
        commonSetup()
    }

    private func commonSetup() {
        setAccessibilityRole(.staticText)
        updateAccessibilityLabel()
    }

    /// Replaces the bubble content in place (used by the streaming codepath).
    public func replaceText(_ text: String) {
        messageText = text
        updateAccessibilityLabel()
        needsDisplay = true
    }

    /// Appends a streamed chunk in place, without re-creating the bubble.
    public func appendStreamingText(_ text: String) {
        guard !text.isEmpty else { return }
        messageText += text
        updateAccessibilityLabel()
        needsDisplay = true
    }

    /// Kept for API compatibility; prose has no bubble chrome to toggle now.
    public func setStreaming(_ streaming: Bool) {
        guard isStreaming != streaming else { return }
        isStreaming = streaming
        needsDisplay = true
    }

    private func updateAccessibilityLabel() {
        let prefix: String
        if role == .user {
            prefix = "You: "
        } else if isError {
            prefix = "Agent error: "
        } else {
            prefix = "Agent: "
        }
        setAccessibilityLabel(prefix + messageText)
    }

    public override var isFlipped: Bool { true }

    // MARK: Text composition (sans prose, mono code/command lines)

    /// Tool/CLI lines stay monospace: `[tool]`, `⚡`, `↳`, `⚠`, backtick code,
    /// shell prompts and indented fragments coming from the CLI bridge.
    private static func isCodeLine(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return false }
        if line.hasPrefix("    ") || line.hasPrefix("\t") { return true }
        if trimmed.hasPrefix("[") || trimmed.hasPrefix("```") { return true }
        if trimmed.hasPrefix("⚡") || trimmed.hasPrefix("↳") || trimmed.hasPrefix("⚠") { return true }
        if trimmed.hasPrefix("$ ") || trimmed.hasPrefix("> ") { return true }
        if trimmed.contains("`") { return true }
        return false
    }

    private func bodyAttributes(font: NSFont, color: NSColor, lineHeight: CGFloat) -> [NSAttributedString.Key: Any] {
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byWordWrapping
        style.minimumLineHeight = lineHeight
        style.maximumLineHeight = lineHeight
        return [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style
        ]
    }

    private func attributedBody() -> NSAttributedString {
        let proseColor = isError
            ? AgentPalette.agentErrorText
            : (role == .user ? AgentPalette.userBubbleText : AgentPalette.agentProseText)
        let lines = messageText.components(separatedBy: "\n")
        let result = NSMutableAttributedString()
        for (index, line) in lines.enumerated() {
            let code = role == .agent && !isError && Self.isCodeLine(line)
            let font = code ? Self.codeFont : Self.proseFont
            let color = code ? AgentPalette.agentCodeText : proseColor
            let lineHeight = code ? Self.codeLineHeight : Self.proseLineHeight
            let text = index == lines.count - 1 ? line : line + "\n"
            result.append(NSAttributedString(
                string: text,
                attributes: bodyAttributes(font: font, color: color, lineHeight: lineHeight)
            ))
        }
        return result
    }

    private func bodyWidth(for maxWidth: CGFloat) -> CGFloat {
        switch role {
        case .agent:
            return max(60.0, maxWidth - AgentPanelMetrics.messageAvatarIndent)
        case .user:
            // Web user bubble: `max-w-[85%] self-end`.
            let cap = min(maxWidth * 0.85, AgentPanelMetrics.messageBubbleMaxWidth)
            let natural = ceil(attributedBody().boundingRect(
                with: NSSize(width: cap, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading]
            ).width)
            return min(cap, max(Self.minimumWidth, natural + AgentPanelMetrics.messageBubbleHorizontalInset * 2.0))
        }
    }

    private func bodyHeight(for width: CGFloat) -> CGFloat {
        ceil(attributedBody().boundingRect(
            with: NSSize(width: max(20, width), height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading]
        ).height)
    }

    /// Row size for a given content column width.
    public func sizeFor(maxWidth: CGFloat) -> NSSize {
        switch role {
        case .agent:
            let contentWidth = bodyWidth(for: max(maxWidth, Self.minimumWidth))
            let textHeight = bodyHeight(for: contentWidth)
            let height = max(Self.minimumHeight, max(textHeight, showsAvatar ? Self.avatarSize : 0))
            return NSSize(width: max(maxWidth, Self.minimumWidth), height: height)
        case .user:
            let bubbleWidth = bodyWidth(for: max(maxWidth, Self.minimumWidth))
            let contentWidth = bubbleWidth - AgentPanelMetrics.messageBubbleHorizontalInset * 2.0
            let textHeight = bodyHeight(for: contentWidth)
            let height = max(Self.minimumHeight,
                             textHeight + AgentPanelMetrics.messageBubbleVerticalInset * 2.0)
            return NSSize(width: ceil(bubbleWidth), height: ceil(height))
        }
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let body = attributedBody()

        switch role {
        case .user:
            // Right-aligned white/8 bubble, sans 12.5 prose.
            let path = CGPath(
                roundedRect: bounds,
                cornerWidth: 12,
                cornerHeight: 12,
                transform: nil
            )
            ctx.setFillColor(AgentPalette.userBubbleFill.cgColor)
            ctx.addPath(path)
            ctx.fillPath()
            let inset = AgentPanelMetrics.messageBubbleHorizontalInset
            let vInset = AgentPanelMetrics.messageBubbleVerticalInset
            body.draw(with: NSRect(
                x: inset,
                y: vInset,
                width: max(0, bounds.width - inset * 2.0),
                height: max(0, bounds.height - vInset * 2.0)
            ), options: [.usesLineFragmentOrigin, .usesFontLeading])
        case .agent:
            // Plain left-aligned prose; avatar only on the first message of a turn.
            if showsAvatar {
                drawAuthorAvatar(ctx: ctx)
            }
            let indent = AgentPanelMetrics.messageAvatarIndent
            body.draw(with: NSRect(
                x: indent,
                y: 0,
                width: max(0, bounds.width - indent),
                height: max(0, bounds.height)
            ), options: [.usesLineFragmentOrigin, .usesFontLeading])
        }
    }

    /// 40pt purple brand avatar used for the first agent message of a turn.
    private func drawAuthorAvatar(ctx: CGContext) {
        let rect = CGRect(x: 0, y: 0, width: Self.avatarSize, height: Self.avatarSize)
        ctx.saveGState()
        ctx.addEllipse(in: rect)
        ctx.clip()
        ctx.setFillColor(AgentPalette.purple.cgColor)
        ctx.fill(rect)
        if let gradient = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                AgentPalette.purpleLight.withAlphaComponent(0.65).cgColor,
                AgentPalette.purpleDeep.withAlphaComponent(0.35).cgColor
            ] as CFArray,
            locations: [0.0, 1.0]
        ) {
            ctx.drawLinearGradient(
                gradient,
                start: CGPoint(x: rect.midX, y: rect.minY),
                end: CGPoint(x: rect.midX, y: rect.maxY),
                options: []
            )
        }
        ctx.restoreGState()
        let logoRect = rect.insetBy(dx: rect.width * 0.21, dy: rect.height * 0.21)
        AgentGlyphDrawing.draw(.brandMark, in: logoRect, color: AgentPalette.markColor, lineWidth: 1.4)
    }
}

// MARK: - Panel header (title + trailing icon buttons)

public final class AgentPanelHeaderView: NSView {
    public var onHistory: (() -> Void)?
    public var onNewChat: (() -> Void)?
    public var onClose: (() -> Void)?

    public private(set) var titleText: String = "Untitled"
    public private(set) var modelStatusText: String = "Flash ACTIVE"

    public let historyButton = AgentPanelIconButton(
        glyph: .history,
        tooltip: "Conversation history",
        accessibilityLabel: "Conversation history"
    )
    public let newChatButton = AgentPanelIconButton(
        glyph: .plus,
        tooltip: "New conversation",
        accessibilityLabel: "New conversation"
    )
    public let collapseButton = AgentPanelIconButton(
        glyph: .collapse,
        tooltip: "Hide agent panel",
        accessibilityLabel: "Hide agent panel"
    )

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonSetup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonSetup()
    }

    private func commonSetup() {
        setAccessibilityIdentifier(AgentPanelAccessibility.header)
        setAccessibilityRole(.group)
        setAccessibilityLabel("Agent panel header")
        setAccessibilityValue(modelStatusText)

        historyButton.setAccessibilityIdentifier(AgentPanelAccessibility.history)
        newChatButton.setAccessibilityIdentifier(AgentPanelAccessibility.newChat)
        collapseButton.setAccessibilityIdentifier(AgentPanelAccessibility.close)

        historyButton.onClick = { [weak self] in self?.onHistory?() }
        newChatButton.onClick = { [weak self] in self?.onNewChat?() }
        collapseButton.onClick = { [weak self] in self?.onClose?() }

        addSubview(historyButton)
        addSubview(newChatButton)
        addSubview(collapseButton)
    }

    public func setTitle(_ title: String) {
        titleText = title
        needsDisplay = true
    }

    public func setModelStatus(_ status: String) {
        var clean = status.trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.hasPrefix("●") {
            clean = String(clean.dropFirst()).trimmingCharacters(in: .whitespaces)
        }
        modelStatusText = clean
        setAccessibilityValue(clean)
        needsDisplay = true
    }

    public override var isFlipped: Bool { true }

    public override func layout() {
        super.layout()
        layoutChildren()
    }

    public override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        needsLayout = true
    }

    public func layoutChildren() {
        let size = AgentPanelMetrics.iconButtonSize
        let spacing = AgentPanelMetrics.iconButtonSpacing
        let midY = floor((bounds.height - size) / 2.0)
        let rightEdge = bounds.width - AgentPanelMetrics.headerTrailingInset

        collapseButton.frame = NSRect(x: rightEdge - size, y: midY, width: size, height: size)
        newChatButton.frame = NSRect(x: collapseButton.frame.minX - spacing - size, y: midY, width: size, height: size)
        historyButton.frame = NSRect(x: newChatButton.frame.minX - spacing - size, y: midY, width: size, height: size)
    }

    public override func draw(_ dirtyRect: NSRect) {
        // Web header: document title at the left + three 32pt icon buttons at the
        // right. Avatar/model status moved to the intro badge and composer chip.
        let titleFont = ThemeFonts.system(
            size: AgentPanelMetrics.headerTitleFontSize,
            weight: .semibold
        )
        let titleHeight = ceil(titleFont.ascender - titleFont.descender)
        let iconsStart = historyButton.frame.minX > 0
            ? historyButton.frame.minX
            : bounds.width - AgentPanelMetrics.headerTrailingInset
                - AgentPanelMetrics.iconButtonSize * 3.0
                - AgentPanelMetrics.iconButtonSpacing * 2.0
        let titleX = AgentPanelMetrics.headerLeadingInset
        let titleWidth = max(0, iconsStart - 8.0 - titleX)
        AgentTextDrawing.drawSingleLine(
            titleText,
            in: NSRect(
                x: titleX,
                y: floor((bounds.height - titleHeight) / 2.0),
                width: titleWidth,
                height: titleHeight
            ),
            font: titleFont,
            color: .white
        )
    }
}

// MARK: - Scroll document view

public final class AgentPanelDocumentView: NSView {
    public override var isFlipped: Bool { true }
}

// MARK: - Agent Panel

public final class AgentPanelView: NSView {
    // MARK: Public API

    /// Fired when the header collapse ("close") control is clicked.
    public var onClose: (() -> Void)?
    /// Fired with the trimmed prompt after the composer sends.
    public var onSend: ((String) -> Void)?
    /// Fired when one of the three suggestion chips is clicked.
    public var onSuggestion: ((String) -> Void)?
    /// Optional: fired when the header history control is clicked.
    public var onHistory: (() -> Void)?
    /// Optional: fired when the header "+" (new conversation) control is clicked.
    public var onNewChat: (() -> Void)?

    public let composer: AgentComposerView = AgentComposerView(frame: .zero)

    /// Model / agent label shown in the composer chip (e.g. "Opus 5.5").
    /// Host wiring updates it from the active agent/model.
    public var modelLabel: String {
        get { composer.modelLabel }
        set { composer.modelLabel = newValue }
    }

    public private(set) var header: AgentPanelHeaderView = AgentPanelHeaderView(frame: .zero)
    public private(set) var introView: AgentIntroView = AgentIntroView(frame: .zero)
    private let scrollView = NSScrollView()
    private let documentView = AgentPanelDocumentView(frame: .zero)
    private var messageBubbles: [AgentMessageBubbleView] = []
    private var streamingBubble: AgentMessageBubbleView?
    private var streamingTextBuffer: String = ""
    private var modelStatusBeforeStreaming: String?

    public var messageCount: Int { messageBubbles.count }

    /// Whether a live agent response is currently streaming into the transcript.
    public var isStreamingAgentMessage: Bool { streamingBubble != nil }

    /// Index of the in-place streaming bubble in `messageTexts`, when streaming.
    public var streamingMessageIndex: Int? {
        guard let bubble = streamingBubble else { return nil }
        return messageBubbles.firstIndex { $0 === bubble }
    }

    /// Read-only snapshot of the transcript text (used by wiring + headless tests).
    public var messageTexts: [String] { messageBubbles.map(\.messageText) }

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonSetup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonSetup()
    }

    private func commonSetup() {
        wantsLayer = true
        layer?.cornerRadius = AgentPanelMetrics.cornerRadius
        layer?.masksToBounds = true

        setAccessibilityIdentifier(AgentPanelAccessibility.panel)
        setAccessibilityRole(.group)
        setAccessibilityLabel("AI Agent panel")

        // Header
        addSubview(header)
        header.onClose = { [weak self] in self?.onClose?() }
        header.onHistory = { [weak self] in self?.onHistory?() }
        header.onNewChat = { [weak self] in
            self?.newConversation()
            self?.onNewChat?()
        }

        // Message scroll area
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.scrollerStyle = .overlay
        scrollView.horizontalScrollElasticity = .none
        scrollView.verticalScrollElasticity = .allowed
        scrollView.contentView.drawsBackground = false
        addSubview(scrollView)

        documentView.autoresizingMask = []
        scrollView.documentView = documentView
        scrollView.setAccessibilityIdentifier(AgentPanelAccessibility.messageList)
        scrollView.setAccessibilityRole(.group)
        scrollView.setAccessibilityLabel("Agent messages")

        documentView.addSubview(introView)
        introView.onSuggestion = { [weak self] _, suggestion in
            self?.handleSuggestionTap(suggestion)
        }

        // Composer
        composer.onSubmit = { [weak self] text in
            self?.handleComposerSubmit(text)
        }
        addSubview(composer)
    }

    // MARK: Public API

    public func setModelStatus(_ status: String) {
        if streamingBubble != nil {
            // Remember the requested idle status and show the streaming variant.
            modelStatusBeforeStreaming = status
            header.setModelStatus(Self.streamingStatus(from: status))
        } else {
            header.setModelStatus(status)
        }
    }

    public func setTitle(_ title: String) {
        header.setTitle(title)
    }

    public func addUserMessage(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        appendMessage(role: .user, text: trimmed)
    }

    public func addAgentMessage(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        appendMessage(role: .agent, text: trimmed)
    }

    // MARK: Streaming agent messages

    /// Begins (or resumes) an in-place streamed agent response and returns its bubble
    /// index. The bubble is created immediately with a placeholder so the panel can
    /// auto-scroll, then updated in place by `appendStreamingText(_:)`.
    @discardableResult
    public func beginStreamingAgentMessage() -> Int {
        if let bubble = streamingBubble,
           let index = messageBubbles.firstIndex(where: { $0 === bubble }) {
            return index
        }
        let bubble = AgentMessageBubbleView(role: .agent, text: "…")
        bubble.setStreaming(true)
        streamingBubble = bubble
        streamingTextBuffer = ""
        addBubble(bubble)
        enterStreamingStatus()
        return messageBubbles.count - 1
    }

    /// Appends a streamed chunk to the active agent bubble. No-op when nothing is
    /// streaming (graceful for late/duplicate events from the CLI bridge).
    public func appendStreamingText(_ text: String) {
        guard !text.isEmpty else { return }
        guard let bubble = streamingBubble else { return }
        streamingTextBuffer += text
        bubble.replaceText(streamingTextBuffer)
        relayoutTranscript()
    }

    /// Finalises the active streamed response (keeps the bubble in place). An empty
    /// stream drops its placeholder bubble instead of leaving an empty row.
    public func endStreamingAgentMessage() {
        guard let bubble = streamingBubble else {
            exitStreamingStatus()
            return
        }
        streamingBubble = nil
        bubble.setStreaming(false)

        let trimmed = streamingTextBuffer.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            removeBubble(bubble)
        } else if trimmed != streamingTextBuffer {
            bubble.replaceText(trimmed)
        }
        streamingTextBuffer = ""
        exitStreamingStatus()
        relayoutTranscript()
    }

    /// Appends a red-tinted agent error bubble (also closes any active stream).
    public func appendAgentError(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if streamingBubble != nil {
            endStreamingAgentMessage()
        }
        let bubble = AgentMessageBubbleView(role: .agent, text: trimmed)
        bubble.isError = true
        addBubble(bubble)
    }

    /// Clears the transcript and restores the empty-state suggestions.
    public func clearConversation() {
        streamingBubble = nil
        streamingTextBuffer = ""
        exitStreamingStatus()
        messageBubbles.forEach { $0.removeFromSuperview() }
        messageBubbles.removeAll()
        introView.setSuggestionsAndHintVisible(true)
        needsLayout = true
        layoutSubtreeIfNeeded()
        layoutContent()
        scrollToTop()
    }

    /// Starts a fresh conversation (called by the header "+" button).
    public func newConversation() {
        guard !messageBubbles.isEmpty else { return }
        clearConversation()
    }

    // MARK: Layout

    public override var isFlipped: Bool { true }

    public override func layout() {
        super.layout()
        layoutChildren()
    }

    public override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        needsLayout = true
    }

    private func layoutChildren() {
        let width = bounds.width
        let height = bounds.height
        guard width > 0, height > 0 else { return }

        header.frame = NSRect(x: 0, y: 0, width: width, height: AgentPanelMetrics.headerHeight)
        header.layoutChildren()

        let composerHeight = AgentPanelMetrics.composerHeight
        let composerInset = AgentPanelMetrics.composerSideInset
        let composerY = max(
            AgentPanelMetrics.headerHeight + 8.0,
            height - AgentPanelMetrics.composerBottomInset - composerHeight
        )
        composer.frame = NSRect(
            x: composerInset,
            y: composerY,
            width: max(0, width - composerInset * 2.0),
            height: composerHeight
        )
        composer.layoutChildren()

        let scrollTop = AgentPanelMetrics.headerHeight
        let scrollBottom = composerY - 12.0
        scrollView.frame = NSRect(
            x: 0,
            y: scrollTop,
            width: width,
            height: max(0, scrollBottom - scrollTop)
        )

        layoutContent()
    }

    private func layoutContent() {
        let clipSize = scrollView.contentSize
        let contentWidth = max(1.0, clipSize.width)
        let inset = AgentPanelMetrics.contentInset
        let columnWidth = max(
            1.0,
            contentWidth - inset - AgentPanelMetrics.bodyRightInset
        )

        let introHeight = introView.requiredHeight(forWidth: columnWidth)

        if messageBubbles.isEmpty {
            let documentHeight = max(clipSize.height, introHeight + 32.0)
            let introTop = max(0.0, (documentHeight - introHeight) / 2.0)
            introView.frame = NSRect(x: inset, y: introTop, width: columnWidth, height: introHeight)
            introView.layoutChildren()
            documentView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: documentHeight)
            return
        }

        introView.frame = NSRect(x: inset, y: 10.0, width: columnWidth, height: introHeight)
        introView.layoutChildren()

        var y = 12.0 + introHeight + 14.0
        for bubble in messageBubbles {
            let size = bubble.sizeFor(maxWidth: columnWidth)
            let x = bubble.role == .user ? inset + (columnWidth - size.width) : inset
            bubble.frame = NSRect(x: x, y: y, width: size.width, height: size.height)
            bubble.needsDisplay = true
            y += size.height + AgentPanelMetrics.messageStackSpacing
        }

        let documentHeight = max(clipSize.height, y + 12.0)
        documentView.frame = NSRect(x: 0, y: 0, width: contentWidth, height: documentHeight)
    }

    // MARK: Message handling

    private func appendMessage(role: AgentMessageBubbleView.Role, text: String) {
        addBubble(AgentMessageBubbleView(role: role, text: text))
    }

    /// Installs a bubble into the transcript and refreshes layout + scroll.
    private func addBubble(_ bubble: AgentMessageBubbleView) {
        // The 40pt author avatar is only drawn on the first agent message of a
        // turn; follow-ups share its indent without repeating the avatar.
        if bubble.role == .agent {
            bubble.showsAvatar = messageBubbles.last?.role != .agent
        }
        bubble.setAccessibilityIdentifier("Agent.Message.\(bubble.role.rawValue).\(messageBubbles.count)")
        messageBubbles.append(bubble)
        documentView.addSubview(bubble)

        if messageBubbles.count == 1 {
            introView.setSuggestionsAndHintVisible(false)
        }
        relayoutTranscript()
    }

    private func removeBubble(_ bubble: AgentMessageBubbleView) {
        guard let index = messageBubbles.firstIndex(where: { $0 === bubble }) else { return }
        messageBubbles.remove(at: index)
        bubble.removeFromSuperview()
        if messageBubbles.isEmpty {
            introView.setSuggestionsAndHintVisible(true)
        }
    }

    /// Re-lays out the transcript and keeps it pinned to the newest content.
    private func relayoutTranscript() {
        needsLayout = true
        layoutSubtreeIfNeeded()
        layoutContent()
        scrollToBottom()
    }

    private func handleComposerSubmit(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        addUserMessage(trimmed)
        composer.clear()
        composer.focus()
        onSend?(trimmed)
    }

    private func handleSuggestionTap(_ suggestion: String) {
        if let onSuggestion = onSuggestion {
            onSuggestion(suggestion)
        } else {
            composer.text = suggestion
            composer.focus()
        }
    }

    private func scrollToBottom() {
        layoutSubtreeIfNeeded()
        let documentHeight = documentView.frame.height
        let clipHeight = scrollView.contentSize.height
        guard documentHeight > clipHeight else { return }
        let point = NSPoint(x: 0, y: documentHeight - clipHeight)
        scrollView.contentView.scroll(to: point)
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }

    private func scrollToTop() {
        scrollView.contentView.scroll(to: NSPoint(x: 0, y: 0))
        scrollView.reflectScrolledClipView(scrollView.contentView)
    }

    // MARK: Streaming status pill

    private func enterStreamingStatus() {
        guard modelStatusBeforeStreaming == nil else { return }
        let base = header.modelStatusText
        modelStatusBeforeStreaming = base
        header.setModelStatus(Self.streamingStatus(from: base))
    }

    private func exitStreamingStatus() {
        guard let saved = modelStatusBeforeStreaming else { return }
        modelStatusBeforeStreaming = nil
        header.setModelStatus(saved)
    }

    /// "Flash ACTIVE" -> "Flash STREAMING", preserving the leading provider token.
    private static func streamingStatus(from base: String) -> String {
        let trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "Agent STREAMING" }
        let parts = trimmed.split(separator: " ").map(String.init)
        guard parts.count > 1 else { return "\(trimmed) STREAMING" }
        return parts.dropLast().joined(separator: " ") + " STREAMING"
    }

    // MARK: Chrome

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        // Web panel section: `rounded-3xl bg-black`, no border.
        let rect = bounds
        let radius = AgentPanelMetrics.cornerRadius
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
        ctx.setFillColor(AgentPalette.panelBackground.cgColor)
        ctx.addPath(path)
        ctx.fillPath()
    }
}
