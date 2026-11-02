import AppKit

/// Geometry from CanvasTabStrip. The label's CSS max-width includes its padding.
enum NativeDocumentTabMetrics {
    static let height: CGFloat = 28
    static let leadingPadding: CGFloat = 12
    static let labelMaximumWidth: CGFloat = 160
    static let closeHitSize: CGFloat = 28
    static let dirtySize: CGFloat = 6
    static let itemGap: CGFloat = 6
    static let newTabGap: CGFloat = 4
    static let tracking: CGFloat = 0.3

    static var font: NSFont { ThemeFonts.system(size: 12, weight: .medium) }
    static var maximumTextWidth: CGFloat { labelMaximumWidth - leadingPadding }

    static func textWidth(_ title: String) -> CGFloat {
        let width = (title as NSString).size(withAttributes: [
            .font: font, .kern: tracking,
        ]).width
        return min(maximumTextWidth, max(1, ceil(width)))
    }

    static func textRect(in bounds: CGRect, font: NSFont) -> CGRect {
        let lineHeight = ceil(NSLayoutManager().defaultLineHeight(for: font))
        let height = min(bounds.height, lineHeight)
        return CGRect(
            x: bounds.minX, y: bounds.midY - height / 2,
            width: bounds.width, height: height)
    }

    static func pillFrame(label: CGRect, close: CGRect) -> CGRect {
        CGRect(
            x: label.minX - leadingPadding, y: label.midY - height / 2,
            width: close.maxX - label.minX + leadingPadding, height: height)
    }
}

/// A text field's default cell top-aligns text inside a tall frame. All display,
/// selection and editing paths use one font-derived rectangle instead.
final class NativeDocumentTitleCell: NSTextFieldCell {
    override func drawingRect(forBounds rect: NSRect) -> NSRect {
        NativeDocumentTabMetrics.textRect(in: rect, font: font ?? NativeDocumentTabMetrics.font)
    }

    override func titleRect(forBounds rect: NSRect) -> NSRect {
        drawingRect(forBounds: rect)
    }

    override func drawInterior(withFrame cellFrame: NSRect, in controlView: NSView) {
        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(rect: cellFrame).addClip()
        attributedStringValue.draw(
            with: drawingRect(forBounds: cellFrame),
            options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
        NSGraphicsContext.restoreGraphicsState()
    }

    override func select(
        withFrame rect: NSRect, in controlView: NSView, editor textObj: NSText,
        delegate: Any?, start selStart: Int, length selLength: Int
    ) {
        super.select(
            withFrame: drawingRect(forBounds: rect), in: controlView, editor: textObj,
            delegate: delegate, start: selStart, length: selLength)
        configureEditor(textObj)
    }

    override func edit(
        withFrame rect: NSRect, in controlView: NSView, editor textObj: NSText,
        delegate: Any?, event: NSEvent?
    ) {
        super.edit(
            withFrame: drawingRect(forBounds: rect), in: controlView, editor: textObj,
            delegate: delegate, event: event)
        configureEditor(textObj)
    }

    private func configureEditor(_ editor: NSText) {
        guard let editor = editor as? NSTextView else { return }
        editor.textContainerInset = .zero
        editor.textContainer?.lineFragmentPadding = 0
        editor.drawsBackground = false
        editor.font = font ?? NativeDocumentTabMetrics.font
        editor.typingAttributes[.kern] = NativeDocumentTabMetrics.tracking
    }
}
