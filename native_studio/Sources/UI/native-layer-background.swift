import AppKit

/// A canvas property row, kept separate from persisted document nodes.
final class NativeLayerBackgroundButton: NSButton {
    var hex = "transparent" { didSet { needsDisplay = true } }
    var onPick: (() -> Void)?

    static var label: String {
        let chinese =
            (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
        return chinese ? "背景" : "Background"
    }

    init() {
        super.init(frame: .zero)
        title = ""
        isBordered = false
        focusRingType = .none
        target = self
        action = #selector(pickBackground)
        setAccessibilityIdentifier("Layers.CanvasBackground")
        setAccessibilityLabel(Self.label)
    }

    required init?(coder: NSCoder) { super.init(coder: coder) }

    @objc private func pickBackground() { onPick?() }

    override func draw(_ dirtyRect: NSRect) {
        let dot = NSRect(x: 12, y: bounds.midY - 7, width: 14, height: 14)
        let circle = NSBezierPath(ovalIn: dot)
        if hex != "transparent" {
            NSColor(hex: hex).setFill()
            circle.fill()
        }
        NSColor(white: 1, alpha: 0.2).setStroke()
        circle.lineWidth = 1
        circle.stroke()
        let font = ThemeFonts.mono(size: 11, weight: .medium)
        let height = ceil(font.ascender - font.descender)
        let baseline = round((bounds.height - height) / 2)
        (Self.label as NSString).draw(
            in: NSRect(x: 36, y: baseline, width: max(bounds.width - 120, 0), height: height),
            withAttributes: [.font: font, .foregroundColor: NSColor(hex: "#E5E5E5")])
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .right
        (hex.uppercased() as NSString).draw(
            in: NSRect(x: bounds.width - 92, y: baseline, width: 80, height: height),
            withAttributes: [
                .font: ThemeFonts.mono(size: 11),
                .foregroundColor: NSColor(hex: "#A3A3A3"), .paragraphStyle: paragraph,
            ])
    }
}
