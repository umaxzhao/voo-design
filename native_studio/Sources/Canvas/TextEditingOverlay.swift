//
//  TextEditingOverlay.swift
//  native_studio
//
//  Inline text editing overlay for the VOO canvas.
//
//  Web parity: the web editor swaps a selected text layer for an HTML <textarea>
//  overlay that sits exactly on top of the layer, has a mint (#b2ffd6) 1px border,
//  a mint caret and commits on blur / Return and cancels on Escape. This file is
//  the AppKit equivalent: a transparent NSView that fills its CanvasStageView,
//  hosts a transparent (flipped) NSTextView over the text node's rendered rect and
//  draws the mint editor chrome itself.
//
//  Coordinate-system notes (important):
//  - CanvasStageView is NOT flipped (isFlipped == false), so its view space has
//    origin at the bottom-left and +y pointing up. Its renderer draws a node's
//    document rect with `node.y` as the rect's MIN-Y in document space, mapped by
//    `viewPoint(from:)` (includes ruler inset + pan offset + zoom).
//  - NSGraphicsContext text drawing (`NSAttributedString.draw(in:)`) top-aligns
//    the first line inside the requested rect even in an unflipped context, and an
//    NSTextView also top-aligns its first line inside its own (flipped) frame.
//    Therefore the editor's VISUAL TOP edge must coincide with the node rect's
//    VISUAL TOP edge (visual top of an unflipped rect is `maxY`).
//  - This file positions the editor box in `stage` coordinates, then converts the
//    rect into the overlay's coordinate space with `convert(_:from:)`, so the
//    overlay keeps working if it is embedded in a differently flipped host.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Inline Editor Text View

/// The thin NSTextView subclass used inside `TextEditingOverlay`.
///
/// Intercepts the three keys the web editor owns so normal NSTextView editing
/// (Cmd+A, arrows, undo/redo, IME, selection) keeps working untouched:
/// - Return ................ commit
/// - Shift+Return .......... insert a newline
/// - Escape ................ cancel
///
/// Input-method composition is never interrupted: while `hasMarkedText()` is true
/// (e.g. Pinyin candidates) every key falls through to the standard text view.
public final class CanvasInlineTextView: NSTextView {
    /// Invoked when the user asks to commit (plain Return).
    public var onCommitRequested: (() -> Void)?
    /// Invoked when the user asks to cancel (Escape).
    public var onCancelRequested: (() -> Void)?

    public override func keyDown(with event: NSEvent) {
        // Never hijack keys while an input method (Chinese/Japanese/Korean, etc.)
        // is composing - Return there accepts the composition candidate.
        if hasMarkedText() {
            super.keyDown(with: event)
            return
        }

        switch event.keyCode {
        case 36, 76: // Return / keypad Enter
            if event.modifierFlags.contains(.shift) {
                // Insert the newline directly instead of re-entering the key
                // interpretation machinery, so Shift+Return works identically
                // whether the view is in a window/key window or not.
                super.insertNewline(nil)
            } else {
                onCommitRequested?()
            }
        case 53: // Escape
            onCancelRequested?()
        default:
            super.keyDown(with: event)
        }
    }

    // Menu / key-binding paths can dispatch Return through insertNewline: instead
    // of through keyDown: - mirror the same policy there.
    public override func insertNewline(_ sender: Any?) {
        if hasMarkedText() {
            super.insertNewline(sender)
            return
        }
        if NSEvent.modifierFlags.contains(.shift) {
            super.insertNewline(sender)
        } else {
            onCommitRequested?()
        }
    }

    // Escape may also arrive through cancelOperation:.
    public override func cancelOperation(_ sender: Any?) {
        if hasMarkedText() {
            super.cancelOperation(sender)
            return
        }
        onCancelRequested?()
    }

    /// Translates caret character rect to screen coordinates for native macOS CJK IME candidate windows.
    public override func firstRect(forCharacterRange range: NSRange, actualRange: NSRangePointer?) -> NSRect {
        var rect = super.firstRect(forCharacterRange: range, actualRange: actualRange)
        if rect.origin.x <= 0 || rect.origin.y <= 0 {
            if let lm = layoutManager, let tc = textContainer {
                lm.ensureLayout(for: tc)
                let glyphRange = lm.glyphRange(forCharacterRange: range, actualCharacterRange: actualRange)
                let glyphRect = lm.boundingRect(forGlyphRange: glyphRange, in: tc)
                if let win = self.window {
                    let winRect = convert(glyphRect, to: nil)
                    rect = win.convertToScreen(winRect)
                }
            }
        }
        if rect.width <= 0 {
            rect.size.width = 2.0
        }
        if rect.height <= 0 {
            rect.size.height = font?.pointSize ?? 16.0
        }
        return rect
    }
}

// MARK: - Text Editing Overlay

/// Transparent inline text-editing overlay attached to a `CanvasStageView`.
///
/// Lifecycle:
/// 1. The host inserts the overlay once per canvas (or lets `begin` do it via
///    `attach(to:)`).
/// 2. `begin(editing:in:)` positions a mint-bordered editor over the text node,
///    fills it with the node's text and focuses it.
/// 3. Return commits, Shift+Return inserts a newline, Escape cancels, clicking
///    outside the editor box commits.
/// 4. `onCommit` / `onCancel` fire exactly once per editing session, then the
///    overlay hides itself.
///
/// Accessibility: identifier `"Canvas.TextEditor"`, role `.textArea`,
/// label `"Canvas text editor"`.
public final class TextEditingOverlay: NSView {

    // MARK: Constants

    /// Accessibility identifier used by the overlay and its inner text view.
    public static let textEditorAccessibilityIdentifier = "Canvas.TextEditor"

    /// Minimum editor width in DOCUMENT points (scaled by zoom when laid out).
    public static let minimumEditorWidth: CGFloat = 80.0

    /// Mint border corner radius in view points (web uses rounded-4).
    public static let borderCornerRadius: CGFloat = 4.0

    /// Mint editor chrome colour (#b2ffd6).
    public static let borderColor: NSColor = NSColor(hex: ThemeTokens.accentSelection)

    // MARK: Callbacks

    /// Called once with the final text when the edit is committed.
    public var onCommit: ((String) -> Void)?
    /// Called once when the edit is cancelled.
    public var onCancel: (() -> Void)?

    // MARK: Editing State

    /// The node currently being edited, or `nil` when idle.
    ///
    /// It also stays readable INSIDE `onCommit` / `onCancel`, so the host can
    /// resolve the edited node (e.g. `overlay.editingNode?.id`) without having to
    /// remember the node itself. It is cleared right after the callbacks unless a
    /// callback already started a new session.
    public private(set) var editingNode: VOONode?
    /// `true` between a successful `begin` and the matching `endEditing`.
    public private(set) var isEditing: Bool = false

    /// The stage this overlay is attached to (weak to avoid a retain cycle).
    public private(set) weak var attachedStage: CanvasStageView?

    /// First responder before the edit started, restored on commit/cancel.
    private weak var previousFirstResponder: NSResponder?

    /// The editor box in OVERLAY (view) coordinates.
    public private(set) var editorFrame: CGRect = .zero
    /// The editor box in STAGE coordinates, computed by `editorFrame(for:in:)`.
    public private(set) var editorFrameInStage: CGRect = .zero

    /// Selects the whole text when editing starts (Figma-like). New text nodes are
    /// usually created with the placeholder "Text" so this makes typing replace it.
    public var selectsAllOnBegin: Bool = true

    // Cached style state so pan/zoom ticks don't re-apply fonts unnecessarily.
    private var lastAppliedFontSize: CGFloat = -1
    private var lastAppliedFontFamily: String?

    /// Forwards the outside click that commits to the stage after committing, so a
    /// single click both finishes the edit and performs the underlying stage action
    /// (selection, marquee, text-tool node creation, ...). Real window events only.
    public var forwardsOutsideClickToStage: Bool = true

    // MARK: Editor

    /// The inline text view. Exposed for tests/tooling (font, caret colour, ...).
    public let editorTextView: CanvasInlineTextView

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        editorTextView = CanvasInlineTextView(frame: .zero)
        super.init(frame: frameRect)
        setupOverlay()
    }

    public required init?(coder: NSCoder) {
        editorTextView = CanvasInlineTextView(frame: .zero)
        super.init(coder: coder)
        setupOverlay()
    }

    private func setupOverlay() {
        wantsLayer = false
        autoresizingMask = [.width, .height]
        isHidden = true

        // Accessibility: the overlay itself is the canvas text editor element.
        setAccessibilityIdentifier(Self.textEditorAccessibilityIdentifier)
        setAccessibilityRole(.textArea)
        setAccessibilityLabel("Canvas text editor")

        editorTextView.drawsBackground = false
        editorTextView.isRichText = false
        editorTextView.importsGraphics = false
        editorTextView.isEditable = true
        editorTextView.isSelectable = true
        editorTextView.allowsUndo = true
        editorTextView.isFieldEditor = false
        editorTextView.focusRingType = .none
        editorTextView.textContainerInset = .zero
        editorTextView.textContainer?.lineFragmentPadding = 0
        editorTextView.textContainer?.widthTracksTextView = true
        editorTextView.isHorizontallyResizable = false
        editorTextView.isVerticallyResizable = false
        editorTextView.textColor = .white
        editorTextView.insertionPointColor = Self.borderColor
        editorTextView.selectedTextAttributes = [
            .backgroundColor: Self.borderColor.withAlphaComponent(0.28),
            .foregroundColor: NSColor.white
        ]
        editorTextView.isContinuousSpellCheckingEnabled = false
        editorTextView.isGrammarCheckingEnabled = false
        editorTextView.isAutomaticSpellingCorrectionEnabled = false
        editorTextView.isAutomaticQuoteSubstitutionEnabled = false
        editorTextView.isAutomaticDashSubstitutionEnabled = false
        editorTextView.isAutomaticTextReplacementEnabled = false
        editorTextView.isAutomaticLinkDetectionEnabled = false
        editorTextView.isHidden = true
        editorTextView.setAccessibilityIdentifier(Self.textEditorAccessibilityIdentifier)
        editorTextView.setAccessibilityRole(.textArea)
        editorTextView.setAccessibilityLabel("Canvas text editor")

        // Commit/cancel routing (thin closures -> one guard in endEditing).
        editorTextView.onCommitRequested = { [weak self] in
            self?.endEditing(commit: true)
        }
        editorTextView.onCancelRequested = { [weak self] in
            self?.endEditing(commit: false)
        }

        addSubview(editorTextView)
    }

    // MARK: - Attaching

    /// Installs the overlay as the top-most subview of `stage` (filling it).
    /// Safe to call repeatedly; `begin(editing:in:)` calls it automatically.
    public func attach(to stage: CanvasStageView) {
        attachedStage = stage
        if superview !== stage {
            if superview != nil {
                removeFromSuperview()
            }
            stage.addSubview(self)
        }
        frame = stage.bounds
        autoresizingMask = [.width, .height]
        isHidden = !isEditing
        if isEditing {
            refreshGeometry()
        }
    }

    // MARK: - Begin / End

    /// Starts editing `node` on `stage`.
    ///
    /// The overlay attaches itself to the stage if needed, recomputes the editor
    /// frame from the stage's CURRENT zoom/pan/ruler state, seeds the text view
    /// with the node's text and gives it first-responder focus.
    public func begin(editing node: VOONode, in stage: CanvasStageView) {
        // Flush a previous session so no text is silently lost (commit-once guard
        // inside endEditing keeps this safe even if callbacks re-enter).
        if isEditing {
            endEditing(commit: true)
        }

        attach(to: stage)

        editingNode = node
        isEditing = true
        editorTextView.isHidden = false
        isHidden = false

        // Apply font/colours BEFORE seeding the text so the seeded glyphs use the
        // node's font immediately (plain NSTextView adopts `font` for its text).
        applyEditorStyle(for: node, zoom: stage.zoom, force: true)
        editorTextView.string = node.text ?? ""
        applyEditorStyle(for: node, zoom: stage.zoom, force: true)

        updateEditorFrame()

        // Focus: the stage lives in the window in the real app; in offscreen tests
        // there is no window and this simply no-ops.
        if let window = stage.window {
            previousFirstResponder = window.firstResponder
            window.makeFirstResponder(editorTextView)
        }

        if selectsAllOnBegin && !editorTextView.string.isEmpty {
            editorTextView.selectAll(nil)
        } else {
            let end = (editorTextView.string as NSString).length
            editorTextView.setSelectedRange(NSRange(location: end, length: 0))
        }
        editorTextView.scrollRangeToVisible(editorTextView.selectedRange())
        editorTextView.needsDisplay = true
        needsDisplay = true
    }

    /// Finishes the current editing session.
    ///
    /// The callback fires exactly once: subsequent calls (or a callback that
    /// re-enters) are ignored until the next `begin`.
    public func endEditing(commit: Bool) {
        guard isEditing else { return }

        // Clear the session flag first so callbacks can safely start a new session;
        // keep `editingNode` alive through the callbacks (see its documentation).
        isEditing = false
        let finalText = editorTextView.string

        // Restore focus BEFORE hiding: a hidden view must not remain the first
        // responder, and hiding first can make AppKit resign it for us.
        if let window = editorTextView.window, window.firstResponder === editorTextView {
            // Hand focus back to whatever had it before the edit (stage, inspector
            // field, ...) instead of leaving a hidden text view as first responder.
            var restored = false
            if let previous = previousFirstResponder, previous !== editorTextView {
                restored = window.makeFirstResponder(previous)
            }
            if !restored {
                window.makeFirstResponder(nil)
            }
        }
        previousFirstResponder = nil
        lastAppliedFontSize = -1
        lastAppliedFontFamily = nil

        editorTextView.isHidden = true
        isHidden = true
        needsDisplay = true

        if commit {
            onCommit?(finalText)
        } else {
            onCancel?()
        }

        // Clear the edited node unless a callback already began a new session.
        if !isEditing {
            editingNode = nil
        }
    }

    // MARK: - Geometry

    /// Computes the editor box for `node` in STAGE coordinates.
    ///
    /// Positioning math (CanvasStageView is not flipped):
    /// - `topLeftDoc = CGPoint(node.x, node.y)` -> `vp = stage.viewPoint(from:)`,
    ///   which already includes the ruler inset, pan offset and zoom.
    /// - The node's rendered rect in stage space is `(vp.x, vp.y, w*zoom, h*zoom)`
    ///   where `vp.y` is its MIN-Y (visually its BOTTOM in an unflipped view).
    /// - Editor size: `width = max(node.width, 80) * zoom`,
    ///   `height = max(node.height * zoom, fontSize * 1.4 * zoom)`.
    /// - The editor's VISUAL TOP is pinned to the node rect's visual top so the
    ///   first text line lands exactly where the canvas renderer draws it:
    ///   unflipped -> `y = vp.y + nodeHeight*zoom - height`,
    ///   flipped   -> `y = vp.y` (rects grow downwards).
    public static func editorFrame(for node: VOONode, in stage: CanvasStageView) -> CGRect {
        let zoom = stage.zoom
        let viewOrigin = stage.viewPoint(from: CGPoint(x: node.x, y: node.y))

        let width = max(max(node.width, TextEditingOverlay.minimumEditorWidth) * zoom, 1.0)
        let nodeHeight = max(node.height * zoom, 1.0)
        let fontLineHeight = max(node.fontSize ?? 16.0, 1.0) * 1.4 * zoom
        let height = max(nodeHeight, fontLineHeight)

        if stage.isFlipped {
            return CGRect(x: viewOrigin.x, y: viewOrigin.y, width: width, height: height)
        } else {
            return CGRect(x: viewOrigin.x, y: viewOrigin.y + nodeHeight - height, width: width, height: height)
        }
    }

    /// Recomputes `editorFrameInStage` / `editorFrame` / the text view frame and
    /// re-applies font metrics for the stage's current zoom.
    public func refreshGeometry() {
        guard isEditing, let node = editingNode, let stage = attachedStage else { return }
        applyEditorStyle(for: node, zoom: stage.zoom)
        updateEditorFrame()
    }

    private func updateEditorFrame() {
        guard let stage = attachedStage, let node = editingNode else { return }

        let stageRect = Self.editorFrame(for: node, in: stage)
        editorFrameInStage = stageRect

        let overlayRect: CGRect
        if superview === stage {
            overlayRect = convert(stageRect, from: stage)
        } else {
            // Overlay not (yet) inside the stage: stage coords minus our frame origin.
            overlayRect = stageRect.offsetBy(dx: -frame.origin.x, dy: -frame.origin.y)
        }
        editorFrame = overlayRect
        editorTextView.frame = overlayRect
        editorTextView.needsDisplay = true
        needsDisplay = true
    }

    private func applyEditorStyle(for node: VOONode, zoom: CGFloat, force: Bool = false) {
        let fontSize = max((node.fontSize ?? 16.0) * zoom, 1.0)
        // Keep the editor in sync with the node's typography (family, weight,
        // alignment, line height, letter spacing) so inline editing matches the
        // rendered canvas exactly.
        TextStyleResolver.apply(to: editorTextView, node: node, color: NSColor.white, size: fontSize)
        lastAppliedFontSize = fontSize
        lastAppliedFontFamily = node.fontFamily
        editorTextView.insertionPointColor = Self.borderColor
    }

    /// Resolves the editor font: node family when installed, "Helvetica Neue" as
    /// the family fallback, and the themed system font as the last resort.
    public static func resolveFont(family: String?, size: CGFloat) -> NSFont {
        if let family = family, !family.isEmpty {
            if let font = NSFont(name: family, size: size) {
                return font
            }
            if let fallback = NSFont(name: "Helvetica Neue", size: size) {
                return fallback
            }
        }
        return ThemeFonts.system(size: size, weight: .regular)
    }

    // MARK: - Drawing (mint border + translucent scrim)

    public override func draw(_ dirtyRect: NSRect) {
        guard isEditing, editorFrame.width > 1, editorFrame.height > 1 else { return }
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // 1px mint border drawn just outside the text view so glyphs stay aligned
        // with the canvas renderer.
        let borderRect = editorFrame.insetBy(dx: -1.0, dy: -1.0)
        let radius = Self.borderCornerRadius
        let path = CGPath(roundedRect: borderRect, cornerWidth: radius, cornerHeight: radius, transform: nil)

        // Dark scrim ("dark transparent" editor) so white text stays legible over
        // any artboard colour; the NSTextView itself stays transparent. The canvas
        // renderer may paint a bright fill behind a text node (it currently fills
        // .text rects with style.fill), so this needs to be stronger than a hint.
        ctx.setFillColor(NSColor(white: 0.02, alpha: 0.45).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        ctx.setStrokeColor(Self.borderColor.cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }

    // MARK: - Layout

    public override func layout() {
        super.layout()
        // Keep the editor pinned to the node when the stage/bounds resize while
        // editing (pan/zoom refreshes are handled by refreshGeometry()).
        if isEditing {
            updateEditorFrame()
        }
    }

    public override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if isEditing, let window = window {
            window.makeFirstResponder(editorTextView)
        }
    }

    // MARK: - Hit Testing (only the editor box is interactive)

    public override func hitTest(_ point: NSPoint) -> NSView? {
        // Idle overlay is fully transparent to events: clicks go to the stage.
        guard isEditing, !isHidden else { return nil }

        // NSView.hitTest(_:) receives the point in the SUPERVIEW's coordinates.
        let localPoint = convert(point, from: superview)
        guard bounds.contains(localPoint) else { return nil }

        if editorFrame.contains(localPoint) {
            // Inside the editor: let the text view (or the overlay as a fallback
            // for the 1px border ring) receive the click.
            return super.hitTest(point) ?? self
        }

        // Outside: swallow the click; mouseDown commits the edit.
        return self
    }

    public override func mouseDown(with event: NSEvent) {
        guard isEditing else {
            super.mouseDown(with: event)
            return
        }

        let localPoint = convert(event.locationInWindow, from: nil)
        if editorFrame.contains(localPoint) {
            // e.g. the 1px border ring: route focus back into the text view.
            window?.makeFirstResponder(editorTextView)
            return
        }

        // Outside click -> commit, then (for real window events) let the stage
        // process the same click so selection / tool actions still happen.
        endEditing(commit: true)
        if forwardsOutsideClickToStage, let stage = attachedStage, event.window != nil {
            stage.mouseDown(with: event)
        }
    }

    // MARK: - Viewport Forwarding

    // The overlay covers the whole stage while editing; hand scroll/pinch to the
    // next responder (the stage) so panning and zooming keep working, then re-pin
    // the editor to the node.
    public override func scrollWheel(with event: NSEvent) {
        guard isEditing else {
            super.scrollWheel(with: event)
            return
        }
        if let next = nextResponder {
            next.scrollWheel(with: event)
        } else {
            super.scrollWheel(with: event)
        }
        refreshGeometry()
    }

    public override func magnify(with event: NSEvent) {
        guard isEditing else {
            super.magnify(with: event)
            return
        }
        if let next = nextResponder {
            next.magnify(with: event)
        } else {
            super.magnify(with: event)
        }
        refreshGeometry()
    }

    // MARK: - Factory

    /// Creates the standard text node the host inserts when the text tool is used.
    ///
    /// - kind: `.text`, name `"Text N"`, 160x28, text `"Text"`, font size 24,
    ///   family `"Inter"` (falls back to Helvetica Neue / system), fill `#ffffff` (or `#171717` on light backgrounds),
    ///   stroke `"none"`, stroke width 0.
    public static func defaultTextNode(at point: CGPoint, index: Int, onLightBackground: Bool = false) -> VOONode {
        VOONode(
            kind: .text,
            name: "Text \(index)",
            x: point.x,
            y: point.y,
            width: 160.0,
            height: 28.0,
            style: LayerStyle(fill: onLightBackground ? "#171717" : "#ffffff", stroke: "none", strokeWidth: 0),
            text: "Text",
            fontSize: 24.0,
            fontFamily: "Inter"
        )
    }
}
