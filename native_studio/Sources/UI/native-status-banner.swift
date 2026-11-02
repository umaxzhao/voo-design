import AppKit

final class NativeStatusBanner: NSTextField {
    private var dismissal: DispatchWorkItem?
    init() {
        super.init(frame: .zero)
        isEditable = false
        isSelectable = true
        isBordered = false
        drawsBackground = false
        wantsLayer = true
        layer?.backgroundColor = NSColor(hex: "#262626").cgColor
        layer?.cornerRadius = 12
        textColor = .white
        font = ThemeFonts.mono(size: 11)
        alignment = .center
        maximumNumberOfLines = 3
        setAccessibilityIdentifier("Editor.StatusMessage")
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }

    func show(_ message: String, in host: NSView) {
        dismissal?.cancel()
        stringValue = message
        setAccessibilityLabel(message)
        let width = min(max(intrinsicContentSize.width + 32, 160), max(host.bounds.width - 32, 160))
        frame = CGRect(x: (host.bounds.width - width) / 2, y: 72, width: width, height: 40)
        if superview !== host { host.addSubview(self) }
        isHidden = false
        NSAccessibility.post(element: self, notification: .valueChanged)
        let item = DispatchWorkItem { [weak self] in self?.isHidden = true }
        dismissal = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: item)
    }
}
