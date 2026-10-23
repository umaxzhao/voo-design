//
//  TitleBar.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - AppTitleBar State Model

public final class AppTitleBarState {
    public var documentTitle: String
    public var zoom: CGFloat
    public var canUndo: Bool
    public var canRedo: Bool
    public var exportTriggered: Bool = false
    public var isDirty: Bool = false

    public init(
        title: String = "Untitled.voo",
        zoom: CGFloat = 1.0,
        canUndo: Bool = false,
        canRedo: Bool = false
    ) {
        self.documentTitle = title
        self.zoom = zoom
        self.canUndo = canUndo
        self.canRedo = canRedo
    }

    public var formattedZoom: String {
        return "\(Int(round(zoom * 100)))%"
    }

    /// Title shown inside the tab pill, matching the web editor which strips the
    /// `.voo` extension from the document name.
    public var displayTitle: String {
        var name = documentTitle
        if name.lowercased().hasSuffix(".voo") {
            name = String(name.dropLast(4))
        }
        return name.isEmpty ? "Untitled" : name
    }
}

// MARK: - AppTitleBar Delegate Protocol

public protocol AppTitleBarDelegate: AnyObject {
    func titleBar(_ titleBar: AppTitleBar, didChangeTitle newTitle: String)
    func titleBarDidRequestUndo(_ titleBar: AppTitleBar)
    func titleBarDidRequestRedo(_ titleBar: AppTitleBar)
    func titleBarDidRequestExport(_ titleBar: AppTitleBar)
    func titleBarDidClickZoom(_ titleBar: AppTitleBar)
    func titleBarDidToggleDashboard(_ titleBar: AppTitleBar)
    func titleBarDidRequestNewProject(_ titleBar: AppTitleBar)
    func titleBarDidRequestCloseProject(_ titleBar: AppTitleBar)
    func titleBarDidRequestSettings(_ titleBar: AppTitleBar)
    func titleBarDidRequestOpenDocument(_ titleBar: AppTitleBar)
}

public extension AppTitleBarDelegate {
    func titleBar(_ titleBar: AppTitleBar, didChangeTitle newTitle: String) {}
    func titleBarDidRequestUndo(_ titleBar: AppTitleBar) {}
    func titleBarDidRequestRedo(_ titleBar: AppTitleBar) {}
    func titleBarDidRequestExport(_ titleBar: AppTitleBar) {}
    func titleBarDidClickZoom(_ titleBar: AppTitleBar) {}
    func titleBarDidToggleDashboard(_ titleBar: AppTitleBar) {}
    func titleBarDidRequestNewProject(_ titleBar: AppTitleBar) {}
    func titleBarDidRequestCloseProject(_ titleBar: AppTitleBar) {}
    func titleBarDidRequestSettings(_ titleBar: AppTitleBar) {}
    func titleBarDidRequestOpenDocument(_ titleBar: AppTitleBar) {}
}

// MARK: - Dark Title Text Field (Zero OS Focus Ring)

public final class DarkTitleTextField: NSTextField, NSTextFieldDelegate {
    public var onTitleCommit: ((String) -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configure()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        isEditable = false
        isSelectable = true
        isBezeled = false
        drawsBackground = false
        backgroundColor = .clear
        textColor = NSColor(white: 1.0, alpha: 0.92)
        font = ThemeFonts.system(size: 12, weight: .medium)
        focusRingType = .none
        lineBreakMode = .byTruncatingTail
        maximumNumberOfLines = 1
        delegate = self
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        setContentHuggingPriority(.defaultHigh, for: .horizontal)
    }

    public override func mouseDown(with event: NSEvent) {
        if !isEditable {
            isEditable = true
            selectText(nil)
        }
        super.mouseDown(with: event)
    }

    public override var stringValue: String {
        didSet {
            invalidateIntrinsicContentSize()
        }
    }

    public override var intrinsicContentSize: NSSize {
        let textWidth = (stringValue as NSString).size(withAttributes: [.font: font ?? ThemeFonts.system(size: 12, weight: .medium)]).width + 8
        return NSSize(width: max(60, min(220, ceil(textWidth))), height: 22)
    }

    public func controlTextDidEndEditing(_ obj: Notification) {
        isEditable = false
        invalidateIntrinsicContentSize()
        onTitleCommit?(stringValue)
    }
}

// MARK: - Dark Action Button (Undo, Redo, Export, Save, Open)

public final class DarkActionButton: NSButton {
    public var isWhitePill: Bool = false

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configure()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        isBordered = false
        focusRingType = .none
        font = ThemeFonts.system(size: 12, weight: .medium)
        contentTintColor = .white
        isEnabled = true
    }

    public override var isHighlighted: Bool {
        didSet {
            if oldValue != isHighlighted {
                needsDisplay = true
            }
        }
    }

    public override var isEnabled: Bool {
        didSet {
            alphaValue = isEnabled ? 1.0 : 0.45
            needsDisplay = true
        }
    }

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds, xRadius: ThemeTokens.radiusXl, yRadius: ThemeTokens.radiusXl)

        if isWhitePill {
            let bg = isHighlighted ? NSColor(white: 0.90, alpha: 1.0) : NSColor.white
            bg.setFill()
            path.fill()

            if !title.isEmpty {
                let pStyle = NSMutableParagraphStyle()
                pStyle.alignment = .center
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: font ?? ThemeFonts.system(size: 12, weight: .medium),
                    .foregroundColor: NSColor.black,
                    .paragraphStyle: pStyle
                ]
                let str = NSAttributedString(string: title, attributes: attrs)
                let strSize = str.size()
                let strRect = NSRect(x: 0, y: (bounds.height - strSize.height) / 2, width: bounds.width, height: strSize.height)
                str.draw(in: strRect)
            }
        } else {
            let bg = isHighlighted ? NSColor(white: 1.0, alpha: 0.12) : NSColor.clear
            bg.setFill()
            path.fill()

            if !title.isEmpty {
                let pStyle = NSMutableParagraphStyle()
                pStyle.alignment = .center
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: font ?? ThemeFonts.system(size: 12, weight: .medium),
                    .foregroundColor: isHighlighted ? NSColor.white : NSColor(white: 0.64, alpha: 1.0),
                    .paragraphStyle: pStyle
                ]
                let str = NSAttributedString(string: title, attributes: attrs)
                let strSize = str.size()
                let strRect = NSRect(x: 0, y: (bounds.height - strSize.height) / 2, width: bounds.width, height: strSize.height)
                str.draw(in: strRect)
            }
        }
    }
}

// MARK: - Dark Zoom Indicator

public final class DarkZoomIndicator: NSTextField {
    public var onClick: (() -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configure()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        isEditable = false
        isSelectable = false
        isBezeled = false
        drawsBackground = false
        backgroundColor = .clear
        textColor = NSColor(white: 0.50, alpha: 1.0)
        font = ThemeFonts.monoDigit(size: 11, weight: .regular)
        focusRingType = .none
        alignment = .center
        lineBreakMode = .byClipping
    }

    public override var stringValue: String {
        didSet {
            invalidateIntrinsicContentSize()
        }
    }

    public override var intrinsicContentSize: NSSize {
        return NSSize(width: 44, height: 22)
    }

    public override func mouseDown(with event: NSEvent) {
        onClick?()
    }
}

// MARK: - Small circular title-bar icon button (close tab / plus / settings)

public final class TitleBarIconButton: NSButton {
    public enum Glyph {
        case close
        case plus
        case settings
    }

    public let glyph: Glyph
    public var hovered: Bool = false {
        didSet { if oldValue != hovered { needsDisplay = true } }
    }

    public init(glyph: Glyph) {
        self.glyph = glyph
        let side: CGFloat
        switch glyph {
        case .close: side = 16.0
        case .plus: side = 24.0
        case .settings: side = 20.0
        }
        super.init(frame: NSRect(x: 0, y: 0, width: side, height: side))
        self.title = ""
        self.isBordered = false
        self.focusRingType = .none
        self.target = self
        self.action = #selector(handleClick)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public var onClick: (() -> Void)?

    @objc private func handleClick() {
        onClick?()
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways], owner: self, userInfo: nil)
        addTrackingArea(area)
    }

    public override func mouseEntered(with event: NSEvent) {
        hovered = true
    }

    public override func mouseExited(with event: NSEvent) {
        hovered = false
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let center = CGPoint(x: bounds.midX, y: bounds.midY)

        switch glyph {
        case .close:
            // Web: size-4 rounded-full button, X icon 12, white/50.
            if hovered {
                ctx.setFillColor(NSColor(white: 1.0, alpha: 0.18).cgColor)
                ctx.fillEllipse(in: bounds)
            }
            ctx.setStrokeColor(NSColor(white: hovered ? 1.0 : 0.55, alpha: 1.0).cgColor)
            ctx.setLineWidth(1.7)
            ctx.setLineCap(.round)
            let s: CGFloat = 4.3
            ctx.move(to: CGPoint(x: center.x - s, y: center.y - s))
            ctx.addLine(to: CGPoint(x: center.x + s, y: center.y + s))
            ctx.move(to: CGPoint(x: center.x - s, y: center.y + s))
            ctx.addLine(to: CGPoint(x: center.x + s, y: center.y - s))
            ctx.strokePath()

        case .plus:
            // Web: size-6 rounded-full bg-neutral-800/50, Plus icon 14.
            let circle = bounds.insetBy(dx: 1, dy: 1)
            ctx.setFillColor(NSColor(white: 1.0, alpha: hovered ? 0.14 : 0.08).cgColor)
            ctx.fillEllipse(in: circle)
            ctx.setStrokeColor(NSColor(white: hovered ? 1.0 : 0.92, alpha: 1.0).cgColor)
            ctx.setLineWidth(1.8)
            ctx.setLineCap(.round)
            let s: CGFloat = 5.2
            ctx.move(to: CGPoint(x: center.x - s, y: center.y))
            ctx.addLine(to: CGPoint(x: center.x + s, y: center.y))
            ctx.move(to: CGPoint(x: center.x, y: center.y - s))
            ctx.addLine(to: CGPoint(x: center.x, y: center.y + s))
            ctx.strokePath()

        case .settings:
            // Web uses Lucide's Bolt (an alias of zap) at 14pt inside a 20pt button.
            let glyphSize: CGFloat = 14.0
            let glyphRect = CGRect(x: center.x - glyphSize / 2.0, y: center.y - glyphSize / 2.0, width: glyphSize, height: glyphSize)
            VooIconFactory.drawZap(in: glyphRect, color: NSColor(white: hovered ? 1.0 : 0.55, alpha: 1.0), strokeWidth: 1.5)
        }
    }
}

// MARK: - AppTitleBar View (40px Fixed Height Chrome with Gradient)

public class AppTitleBar: NSView {
    // Child Controls
    public let docTitleField = DarkTitleTextField()
    public let zoomIndicator = DarkZoomIndicator()
    public let undoButton = DarkActionButton()
    public let redoButton = DarkActionButton()
    public let exportButton = DarkActionButton()

    // VOO Design Signature Chrome Controls
    public let saveButton = DarkActionButton()
    public let openButton = DarkActionButton()
    public let brandLogoButton = NSButton()

    // Document tab bar controls (web parity)
    public let tabCloseButton = TitleBarIconButton(glyph: .close)
    public let tabPlusButton = TitleBarIconButton(glyph: .plus)
    public let settingsButton = TitleBarIconButton(glyph: .settings)

    // State & Delegation
    public weak var delegate: AppTitleBarDelegate?
    public private(set) var state = AppTitleBarState()

    private var isBrandHovered: Bool = false {
        didSet {
            if oldValue != isBrandHovered { needsDisplay = true }
        }
    }

    /// Dashboard mode keeps the brand + tab pill + plus button but hides the
    /// editor-only save/open affordances (web dashboard shows only a settings bolt).
    public var isDashboardMode: Bool = false {
        didSet {
            updateDashboardMode()
            needsDisplay = true
        }
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupHierarchy()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupHierarchy()
    }

    private func setupHierarchy() {
        setAccessibilityIdentifier(AccessibilityCatalog.titleBar)
        setAccessibilityRole(.toolbar)
        setAccessibilityLabel("VOO Design Application Title Bar")

        // 1. Brand Logo & Home Button
        brandLogoButton.translatesAutoresizingMaskIntoConstraints = false
        brandLogoButton.isBordered = false
        brandLogoButton.title = ""
        brandLogoButton.target = self
        brandLogoButton.action = #selector(handleBrandClicked)
        brandLogoButton.setAccessibilityIdentifier("title_bar_brand_logo")
        addSubview(brandLogoButton)

        // 2. Document Title inside the floating tab pill
        docTitleField.translatesAutoresizingMaskIntoConstraints = false
        applyDocumentTitle(state.documentTitle)
        docTitleField.setAccessibilityIdentifier(AccessibilityCatalog.docTitle)
        docTitleField.setAccessibilityRole(.textField)
        docTitleField.setAccessibilityLabel("Document Title")
        docTitleField.onTitleCommit = { [weak self] newTitle in
            guard let self = self else { return }
            self.state.documentTitle = newTitle
            self.delegate?.titleBar(self, didChangeTitle: newTitle)
        }
        addSubview(docTitleField)

        // 2b. Tab close + new tab buttons
        tabCloseButton.translatesAutoresizingMaskIntoConstraints = false
        tabCloseButton.setAccessibilityIdentifier("TitleBar.TabClose")
        tabCloseButton.setAccessibilityRole(.button)
        tabCloseButton.setAccessibilityLabel("Close Document")
        tabCloseButton.onClick = { [weak self] in
            guard let self = self else { return }
            self.delegate?.titleBarDidRequestCloseProject(self)
        }
        addSubview(tabCloseButton)

        tabPlusButton.translatesAutoresizingMaskIntoConstraints = false
        tabPlusButton.setAccessibilityIdentifier("TitleBar.TabNew")
        tabPlusButton.setAccessibilityRole(.button)
        tabPlusButton.setAccessibilityLabel("New Document")
        tabPlusButton.onClick = { [weak self] in
            guard let self = self else { return }
            self.delegate?.titleBarDidRequestNewProject(self)
        }
        addSubview(tabPlusButton)

        // 3. Zoom Indicator (Compact hidden/visible badge; bottom zoom bar owns this now)
        zoomIndicator.translatesAutoresizingMaskIntoConstraints = false
        zoomIndicator.stringValue = state.formattedZoom
        zoomIndicator.setAccessibilityIdentifier(AccessibilityCatalog.zoomIndicator)
        zoomIndicator.setAccessibilityRole(.button)
        zoomIndicator.setAccessibilityLabel("Zoom Level")
        zoomIndicator.isHidden = true
        zoomIndicator.onClick = { [weak self] in
            guard let self = self else { return }
            self.delegate?.titleBarDidClickZoom(self)
        }
        addSubview(zoomIndicator)

        // 4. Save Button: "保存" (White Pill)
        saveButton.translatesAutoresizingMaskIntoConstraints = false
        saveButton.isWhitePill = true
        saveButton.title = "保存"
        saveButton.target = self
        saveButton.action = #selector(handleSaveClicked)
        saveButton.setAccessibilityIdentifier("title_bar_save_button")
        addSubview(saveButton)

        // 5. Open Button: "打开"
        openButton.translatesAutoresizingMaskIntoConstraints = false
        openButton.isWhitePill = false
        openButton.title = "打开"
        openButton.target = self
        openButton.action = #selector(handleOpenClicked)
        openButton.setAccessibilityIdentifier("title_bar_open_button")
        addSubview(openButton)

        // 6. Settings bolt
        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        settingsButton.setAccessibilityIdentifier("title_bar_settings_button")
        settingsButton.setAccessibilityRole(.button)
        settingsButton.setAccessibilityLabel("Settings")
        settingsButton.onClick = { [weak self] in
            guard let self = self else { return }
            self.delegate?.titleBarDidRequestSettings(self)
        }
        addSubview(settingsButton)

        // Backward Compatible Action Buttons (Kept for automated test suites)
        undoButton.translatesAutoresizingMaskIntoConstraints = false
        undoButton.title = "Undo"
        undoButton.target = self
        undoButton.action = #selector(handleUndoClicked)
        undoButton.setAccessibilityIdentifier(AccessibilityCatalog.undoButton)
        undoButton.setAccessibilityRole(.button)
        undoButton.isHidden = true
        addSubview(undoButton)

        redoButton.translatesAutoresizingMaskIntoConstraints = false
        redoButton.title = "Redo"
        redoButton.target = self
        redoButton.action = #selector(handleRedoClicked)
        redoButton.setAccessibilityIdentifier(AccessibilityCatalog.redoButton)
        redoButton.setAccessibilityRole(.button)
        redoButton.isHidden = true
        addSubview(redoButton)

        exportButton.translatesAutoresizingMaskIntoConstraints = false
        exportButton.title = "Export"
        exportButton.target = self
        exportButton.action = #selector(handleExportClicked)
        exportButton.setAccessibilityIdentifier(AccessibilityCatalog.exportButton)
        exportButton.setAccessibilityRole(.button)
        exportButton.isHidden = true
        addSubview(exportButton)

        // Spec metrics (web title bar): brand h28 / icon20 / text12 medium,
        // tab pill h28 with pl12/pr6/gap6, close 16, plus 24, right buttons h28
        // with 6x12 padding and radius 12, settings bolt 20, right inset 16.
        // Web measurement: brand button 108.7 x 28; keep the same footprint so the
        // tab pill lands at the same absolute offset (allowing for native fonts).
        let brandWidth: CGFloat = 109.0
        let actionFont = ThemeFonts.system(size: 12, weight: .medium)
        let saveTextWidth = ceil(("保存" as NSString).size(withAttributes: [.font: actionFont]).width)
        let openTextWidth = ceil(("打开" as NSString).size(withAttributes: [.font: actionFont]).width)
        let actionHorizontalPadding: CGFloat = 12.0

        NSLayoutConstraint.activate([
            // Brand Logo button: traffic-light inset; 28pt tall with 6pt inner padding.
            brandLogoButton.leadingAnchor.constraint(equalTo: leadingAnchor, constant: ThemeTokens.macTrafficLightInset),
            brandLogoButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            brandLogoButton.widthAnchor.constraint(equalToConstant: brandWidth),
            brandLogoButton.heightAnchor.constraint(equalToConstant: 28),

            // Tab title: brand gap 8 + tab wrapper leading 12 + pill padding-left 12.
            docTitleField.leadingAnchor.constraint(equalTo: brandLogoButton.trailingAnchor, constant: 34),
            docTitleField.centerYAnchor.constraint(equalTo: centerYAnchor),
            docTitleField.heightAnchor.constraint(equalToConstant: 24),
            docTitleField.widthAnchor.constraint(lessThanOrEqualToConstant: 220),

            // Close (X) inside the tab pill: 16x16, 6pt after the title.
            tabCloseButton.leadingAnchor.constraint(equalTo: docTitleField.trailingAnchor, constant: 6),
            tabCloseButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            tabCloseButton.widthAnchor.constraint(equalToConstant: 16),
            tabCloseButton.heightAnchor.constraint(equalToConstant: 16),

            // New tab (+) circle after the pill: 24x24, 6pt pill padding + 6pt gap.
            tabPlusButton.leadingAnchor.constraint(equalTo: tabCloseButton.trailingAnchor, constant: 12),
            tabPlusButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            tabPlusButton.widthAnchor.constraint(equalToConstant: 24),
            tabPlusButton.heightAnchor.constraint(equalToConstant: 24),

            // Right side controls: settings bolt, open, save (right to left), 16pt inset.
            settingsButton.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            settingsButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            settingsButton.widthAnchor.constraint(equalToConstant: 20),
            settingsButton.heightAnchor.constraint(equalToConstant: 20),

            openButton.trailingAnchor.constraint(equalTo: settingsButton.leadingAnchor, constant: -8),
            openButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            openButton.widthAnchor.constraint(equalToConstant: ceil(openTextWidth + actionHorizontalPadding * 2)),
            openButton.heightAnchor.constraint(equalToConstant: 28),

            saveButton.trailingAnchor.constraint(equalTo: openButton.leadingAnchor, constant: -8),
            saveButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            saveButton.widthAnchor.constraint(equalToConstant: ceil(saveTextWidth + actionHorizontalPadding * 2)),
            saveButton.heightAnchor.constraint(equalToConstant: 28),

            // Invisible anchors for compatibility tests
            exportButton.trailingAnchor.constraint(equalTo: saveButton.leadingAnchor),
            exportButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            redoButton.trailingAnchor.constraint(equalTo: exportButton.leadingAnchor),
            redoButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            undoButton.trailingAnchor.constraint(equalTo: redoButton.leadingAnchor),
            undoButton.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])

        updateDashboardMode()
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .mouseMoved, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
    }

    public override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let hovered = brandLogoButton.frame.contains(point)
        if hovered != isBrandHovered {
            isBrandHovered = hovered
        }
    }

    public override func mouseExited(with event: NSEvent) {
        if isBrandHovered { isBrandHovered = false }
    }

    /// Applies the tab title with the web's 12/500 type and 0.3 tracking.
    private func applyDocumentTitle(_ title: String) {
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byTruncatingTail
        docTitleField.attributedStringValue = NSAttributedString(
            string: title,
            attributes: [
                .font: ThemeFonts.system(size: 12, weight: .medium),
                .foregroundColor: NSColor(white: 1.0, alpha: 0.92),
                .kern: 0.3,
                .paragraphStyle: style
            ]
        )
    }

    private func updateDashboardMode() {
        // The web dashboard keeps the brand, the document tab and the "+" button;
        // the save/open editor affordances only appear in the editor.
        saveButton.isHidden = isDashboardMode
        openButton.isHidden = isDashboardMode
        settingsButton.isHidden = false
        docTitleField.isHidden = false
        tabCloseButton.isHidden = false
        // Show a generic "Untitled" tab while browsing the dashboard, exactly like
        // the web app (the loaded project is not "active" until the editor opens).
        if isDashboardMode {
            applyDocumentTitle("Untitled")
        } else {
            applyDocumentTitle(state.documentTitle)
        }
        needsDisplay = true
    }

    public override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // 1. Signature VOO Titlebar Gradient:
        // CSS: linear-gradient(-90deg, rgb(0, 0, 0) 70.123%, rgb(178, 255, 214) 89.855%)
        // Maps left-to-right (0 to bounds.width):
        // 0.0 -> 0.10145: solid mint rgb(178, 255, 214)
        // 0.10145 -> 0.29877: transition to black rgb(0, 0, 0)
        // 0.29877 -> 1.0: solid black rgb(0, 0, 0)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let mintColor = ThemeTokens.colorMint.cgColor
        let blackColor = NSColor.black.cgColor
        let gradientColors = [mintColor, mintColor, blackColor, blackColor] as CFArray
        let locations: [CGFloat] = [0.0, 0.10145, 0.29877, 1.0]

        if let gradient = CGGradient(colorsSpace: colorSpace, colors: gradientColors, locations: locations) {
            let startPoint = CGPoint(x: 0, y: bounds.midY)
            let endPoint = CGPoint(x: bounds.width, y: bounds.midY)
            ctx.drawLinearGradient(gradient, start: startPoint, end: endPoint, options: [])
        } else {
            ctx.setFillColor(blackColor)
            ctx.fill(bounds)
        }

        // 2. Bottom border: border-b border-white/10
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.10).cgColor)
        ctx.setLineWidth(1.0)
        ctx.strokeLineSegments(between: [CGPoint(x: 0, y: 0.5), CGPoint(x: bounds.width, y: 0.5)])

        // 3. Brand block: h28 hover pill (radius 8), 20pt logo, 6pt gap,
        //    12pt/500 black wordmark with tight tracking.
        let brandFrame = brandLogoButton.frame
        if brandFrame.width > 0 {
            if isBrandHovered {
                let hoverRect = CGRect(
                    x: brandFrame.minX,
                    y: bounds.midY - 14,
                    width: brandFrame.width,
                    height: 28
                )
                let hoverPath = CGPath(roundedRect: hoverRect, cornerWidth: 8, cornerHeight: 8, transform: nil)
                ctx.setFillColor(NSColor(white: 0.0, alpha: 0.07).cgColor)
                ctx.addPath(hoverPath)
                ctx.fillPath()
            }

            let logoRect = CGRect(
                x: brandFrame.minX + 6,
                y: bounds.midY - 10,
                width: 20,
                height: 20
            )
            VooIconFactory.drawBrandLogo(in: logoRect, color: .black)

            let brandFont = ThemeFonts.system(size: 12, weight: .medium)
            let brandName = NSAttributedString(
                string: "VOO Design",
                attributes: [
                    .font: brandFont,
                    .foregroundColor: NSColor.black,
                    .kern: -0.2
                ]
            )
            let brandNameSize = brandName.size()
            brandName.draw(at: CGPoint(
                x: logoRect.maxX + 6,
                y: bounds.midY - brandNameSize.height / 2
            ))
        }

        // 4. Floating document tab pill: h28, radius full, pl12 / pr6.
        let tabLeft = docTitleField.frame.minX - 12
        let tabRight = tabCloseButton.frame.maxX + 6
        if tabRight > tabLeft {
            let pillRect = CGRect(x: tabLeft, y: bounds.midY - 14, width: tabRight - tabLeft, height: 28)
            let pillPath = CGPath(roundedRect: pillRect, cornerWidth: 14, cornerHeight: 14, transform: nil)
            ctx.setFillColor(NSColor(white: 0.16, alpha: 0.75).cgColor)
            ctx.addPath(pillPath)
            ctx.fillPath()
        }
    }

    // MARK: - Actions

    @objc private func handleBrandClicked() {
        delegate?.titleBarDidToggleDashboard(self)
    }

    @objc private func handleSaveClicked() {
        state.exportTriggered = true
        delegate?.titleBarDidRequestExport(self)
    }

    @objc private func handleOpenClicked() {
        delegate?.titleBarDidRequestOpenDocument(self)
    }

    @objc private func handleUndoClicked() {
        delegate?.titleBarDidRequestUndo(self)
    }

    @objc private func handleRedoClicked() {
        delegate?.titleBarDidRequestRedo(self)
    }

    @objc private func handleExportClicked() {
        state.exportTriggered = true
        delegate?.titleBarDidRequestExport(self)
    }

    // MARK: - State Synchronization

    /// Single source of truth for the document/tab title. Both the state model
    /// and the visible tab field stay in sync, regardless of dashboard mode.
    public func setDocumentTitle(_ title: String) {
        state.documentTitle = title
        applyDocumentTitle(isDashboardMode ? "Untitled" : title)
        needsDisplay = true
    }

    public func sync(with newState: AppTitleBarState) {
        self.state = newState
        applyDocumentTitle(isDashboardMode ? "Untitled" : newState.documentTitle)
        zoomIndicator.stringValue = newState.formattedZoom
        undoButton.isEnabled = newState.canUndo
        redoButton.isEnabled = newState.canRedo
        needsDisplay = true
    }
}
