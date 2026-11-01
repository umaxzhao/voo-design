import AppKit

/// The no-selection inspector uses the same document background operation as the host.
final class NativeCanvasPropertiesView: NSView {
    static let preferredContentHeight: CGFloat = 252
    var onBackgroundChange: ((String) -> Void)?
    private(set) var pageColors: [String] = []
    private(set) var backgroundColor = "#525252"
    private let heading = NSTextField(labelWithString: "")
    private let sizeLabel = NSTextField(labelWithString: "")
    private let sizeValue = NSTextField(labelWithString: "")
    private let backgroundLabel = NSTextField(labelWithString: "")
    private let backgroundHex = NSTextField(labelWithString: "")
    private let pageColorsLabel = NSTextField(labelWithString: "")
    private let customColor = NativeCanvasColorChip()
    private var presets: [NativeCanvasColorChip] = []
    private var palette: [NativeCanvasColorChip] = []
    private let paletteScroll = NSScrollView()
    private let paletteContent = PropertiesFlippedContainerView()
    private static let presetColors = [
        "transparent", "#FFFFFF", "#D4D4D4", "#A3A3A3",
        "#737373", "#525252", "#262626", "#000000",
    ]
    override var isFlipped: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityIdentifier("Inspector.CanvasProperties")
        setAccessibilityRole(.group)
        for label in [
            heading, sizeLabel, sizeValue, backgroundLabel, backgroundHex, pageColorsLabel,
        ] {
            label.isSelectable = false
            label.isBordered = false
            label.drawsBackground = false
            label.textColor = NSColor(hex: "a3a3a3")
            label.font = ThemeFonts.mono(size: 9, weight: .regular)
            addSubview(label)
        }
        heading.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        heading.textColor = NSColor(hex: "e5e5e5")
        sizeValue.font = ThemeFonts.mono(size: 11, weight: .regular)
        sizeValue.textColor = NSColor(hex: "e5e5e5")
        sizeValue.setAccessibilityIdentifier("Inspector.CanvasProperties.Size")
        backgroundHex.font = ThemeFonts.mono(size: 11, weight: .regular)
        backgroundHex.textColor = NSColor(hex: "e5e5e5")
        for color in Self.presetColors {
            let chip = NativeCanvasColorChip()
            chip.color = color
            chip.onChoose = { [weak self] in self?.chooseBackground(color) }
            chip.setAccessibilityIdentifier("Inspector.CanvasProperties.Preset.\(color)")
            chip.setAccessibilityLabel(color)
            presets.append(chip)
            addSubview(chip)
        }
        paletteScroll.drawsBackground = false
        paletteScroll.hasHorizontalScroller = false
        paletteScroll.hasVerticalScroller = false
        paletteScroll.documentView = paletteContent
        addSubview(paletteScroll)
        customColor.setAccessibilityIdentifier("Inspector.CanvasProperties.CustomBackground")
        customColor.onChoose = { [weak self] in self?.openColorPicker() }
        addSubview(customColor)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(document: VOODocument) {
        heading.stringValue = Copy.text(.properties)
        sizeLabel.stringValue = Copy.text(.size)
        backgroundLabel.stringValue = Copy.text(.background)
        pageColorsLabel.stringValue = Copy.text(.pageColors)
        customColor.setAccessibilityLabel(Copy.text(.background))
        sizeValue.stringValue =
            "\(Int(document.canvas.width.rounded())) × \(Int(document.canvas.height.rounded()))"
        backgroundColor = document.workspaceBackgroundColor
        updateBackground()
        for chip in palette { chip.removeFromSuperview() }
        palette = []
        var seen: Set<String> = []
        pageColors = document.nodes.flatMap { node in
            node.nativePaints(.fill).compactMap { $0.value(.fill) }
                + node.nativePaints(.stroke).compactMap { $0.value(.stroke) }
        }.compactMap { PropertiesColorMath.normalizeHex($0) }.filter { seen.insert($0).inserted }
        // Page colors describe the page; recoloring the whole page is a separate operation.
        for color in pageColors {
            let chip = NativeCanvasColorChip()
            chip.color = color
            chip.isEnabled = false
            chip.toolTip = color
            chip.setAccessibilityLabel(color)
            palette.append(chip)
            paletteContent.addSubview(chip)
        }
        needsLayout = true
        needsDisplay = true
    }

    private func chooseBackground(_ color: String) {
        guard color.lowercased() != backgroundColor.lowercased() else { return }
        backgroundColor = color
        updateBackground()
        onBackgroundChange?(color)
    }

    private func updateBackground() {
        backgroundHex.stringValue = backgroundColor.uppercased()
        customColor.color = backgroundColor
        for chip in presets {
            chip.isCurrent = chip.color.lowercased() == backgroundColor.lowercased()
        }
        needsDisplay = true
    }

    private func openColorPicker() {
        let panel = NSColorPanel.shared
        panel.setTarget(self)
        panel.setAction(#selector(pickBackground(_:)))
        panel.isContinuous = false
        panel.showsAlpha = true
        panel.color =
            backgroundColor.lowercased() == "transparent" ? .clear : NSColor(hex: backgroundColor)
        panel.orderFront(nil)
    }

    @objc private func pickBackground(_ sender: NSColorPanel) {
        let color = sender.color.usingColorSpace(.sRGB) ?? sender.color
        chooseBackground(color.alphaComponent == 0 ? "transparent" : color.hexString)
    }

    override func layout() {
        super.layout()
        heading.frame = CGRect(x: 20, y: 24, width: bounds.width - 40, height: 16)
        sizeLabel.frame = CGRect(x: 16, y: 53, width: bounds.width - 32, height: 12)
        sizeValue.frame = CGRect(x: 26, y: 78, width: bounds.width - 52, height: 16)
        backgroundLabel.frame = CGRect(x: 16, y: 109, width: bounds.width - 32, height: 12)
        for (index, chip) in presets.enumerated() {
            chip.frame = CGRect(x: 16 + CGFloat(index) * 28, y: 127, width: 20, height: 20)
        }
        customColor.frame = CGRect(x: 16, y: 161, width: 20, height: 20)
        backgroundHex.frame = CGRect(x: 44, y: 165, width: bounds.width - 60, height: 16)
        pageColorsLabel.frame = CGRect(x: 16, y: 195, width: bounds.width - 32, height: 12)
        paletteScroll.frame = CGRect(x: 16, y: 215, width: bounds.width - 32, height: 20)
        paletteContent.frame = CGRect(
            x: 0, y: 0, width: max(bounds.width - 32, CGFloat(palette.count) * 28 - 8), height: 20)
        for (index, chip) in palette.enumerated() {
            chip.frame = CGRect(x: CGFloat(index) * 28, y: 0, width: 20, height: 20)
        }
    }

    override func draw(_ dirtyRect: NSRect) {
        for chip in presets where chip.isCurrent {
            NSColor.white.setStroke()
            let ring = NSBezierPath(ovalIn: chip.frame.insetBy(dx: -2, dy: -2))
            ring.lineWidth = 2
            ring.stroke()
        }
        NSColor(hex: "262626").setFill()
        NSBezierPath(
            roundedRect: CGRect(x: 16, y: 73, width: bounds.width - 32, height: 28),
            xRadius: 12, yRadius: 12
        ).fill()
    }

    private enum Copy {
        enum Key { case properties, size, background, pageColors }
        static func text(_ key: Key) -> String {
            let chinese =
                (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey)
                ?? "en").hasPrefix("zh")
            switch (key, chinese) {
            case (.properties, true): return "属性"
            case (.properties, false): return "Properties"
            case (.size, true): return "画框尺寸"
            case (.size, false): return "Frame size"
            case (.background, true): return "背景颜色"
            case (.background, false): return "Background color"
            case (.pageColors, true): return "页面颜色"
            case (.pageColors, false): return "Page colors"
            }
        }
    }
}

/// Circular chips keep transparent backgrounds and the selected ring distinct.
private final class NativeCanvasColorChip: NSButton {
    var color = "#525252" { didSet { needsDisplay = true } }
    var isCurrent = false { didSet { needsDisplay = true } }
    var onChoose: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        title = ""
        target = self
        action = #selector(choose)
        focusRingType = .none
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func choose() { onChoose?() }

    override func draw(_ dirtyRect: NSRect) {
        let circle = NSBezierPath(ovalIn: bounds.insetBy(dx: 0.5, dy: 0.5))
        if color.lowercased() == "transparent" {
            NSGraphicsContext.saveGraphicsState()
            circle.addClip()
            NSColor(hex: "171717").setFill()
            bounds.fill()
            NSColor(hex: "404040").setFill()
            for row in 0..<5 {
                for column in 0..<5 where (row + column).isMultiple(of: 2) {
                    CGRect(x: CGFloat(column) * 4, y: CGFloat(row) * 4, width: 4, height: 4).fill()
                }
            }
            NSGraphicsContext.restoreGraphicsState()
        } else {
            NSColor(hex: color).setFill()
            circle.fill()
        }
        NSColor(white: 1, alpha: 0.25).setStroke()
        circle.lineWidth = 0.5
        circle.stroke()

    }
}
