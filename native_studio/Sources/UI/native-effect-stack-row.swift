import AppKit

/// A configured effect is a compact disclosure row; its parameters stay secondary.
final class NativeEffectStackRow: NSView {
    let key: String
    var label = "" {
        didSet {
            titleButton.setAccessibilityLabel(label)
            needsDisplay = true
        }
    }
    var isEffectEnabled = true {
        didSet {
            eye.iconKind = isEffectEnabled ? .eye : .eyeOff
            needsDisplay = true
        }
    }
    var isExpanded = false { didSet { needsDisplay = true } }
    var onOpen: (() -> Void)?
    var onToggle: (() -> Void)?
    var onRemove: (() -> Void)?
    private let titleButton = NSButton()
    private let eye = PropertiesIconButton(kind: .eye, style: .plain)
    private let remove = PropertiesIconButton(kind: .minus, style: .plain)
    override var isFlipped: Bool { true }

    init(key: String) {
        self.key = key
        super.init(frame: .zero)
        titleButton.isBordered = false
        titleButton.title = ""
        titleButton.target = self
        titleButton.action = #selector(open)
        titleButton.setAccessibilityIdentifier("Inspector.Properties.Effect.\(key).Open")
        addSubview(titleButton)
        for button in [eye, remove] {
            button.iconPadding = 6
            button.iconColor = NSColor(hex: "a3a3a3")
            button.target = self
            addSubview(button)
        }
        eye.action = #selector(toggle)
        eye.setAccessibilityIdentifier("Inspector.Properties.Effect.\(key).Visible")
        eye.setAccessibilityLabel(NativeCopy.text(.editEffects))
        remove.action = #selector(deleteEffect)
        remove.setAccessibilityIdentifier("Inspector.Properties.Effect.\(key).Remove")
        remove.setAccessibilityLabel(NativeCopy.text(.removeEffect))
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    @objc private func open() { onOpen?() }
    @objc private func toggle() { onToggle?() }
    @objc private func deleteEffect() { onRemove?() }

    override func layout() {
        super.layout()
        titleButton.frame = CGRect(
            x: 0, y: 0, width: max(bounds.width - 58, 0), height: bounds.height)
        eye.frame = CGRect(x: bounds.width - 56, y: 2, width: 24, height: 24)
        remove.frame = CGRect(x: bounds.width - 28, y: 2, width: 24, height: 24)
    }

    override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(
            roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 12, yRadius: 12)
        NSColor(hex: isExpanded ? "262626" : "141414").setFill()
        path.fill()
        if isExpanded {
            NSColor(hex: "e5b2ff").withAlphaComponent(0.4).setStroke()
            path.lineWidth = 1
            path.stroke()
        }
        let color = NSColor(hex: isEffectEnabled ? "d4d4d4" : "737373")
        (label as NSString).draw(
            in: CGRect(x: 32, y: 7, width: max(bounds.width - 94, 0), height: 14),
            withAttributes: [
                .font: ThemeFonts.mono(size: 10, weight: .regular), .foregroundColor: color,
            ])
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.saveGState()
        context.translateBy(x: 10, y: 7)
        context.setStrokeColor(color.cgColor)
        context.setLineWidth(1)
        switch key {
        case "gaussianBlur":
            context.setLineDash(phase: 0, lengths: [2, 1.5])
            context.strokeEllipse(in: CGRect(x: 1, y: 1, width: 12, height: 12))
        case "shadow":
            for offset in [0.0, 3.0] {
                context.stroke(CGRect(x: offset, y: offset, width: 10, height: 10))
            }
        default:
            for (x, y, dx, dy) in [
                (1.0, 1.0, 1.0, 1.0), (13.0, 1.0, -1.0, 1.0),
                (1.0, 13.0, 1.0, -1.0), (13.0, 13.0, -1.0, -1.0),
            ] {
                context.move(to: CGPoint(x: x + dx * 3, y: y))
                context.addLine(to: CGPoint(x: x, y: y))
                context.addLine(to: CGPoint(x: x, y: y + dy * 3))
            }
            context.strokePath()
        }
        context.restoreGState()
    }
}
