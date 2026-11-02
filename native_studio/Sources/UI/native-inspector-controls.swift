import AppKit

/// Small inspector-only glyphs use the web's 16px coordinate space.
enum NativeInspectorGlyph {
    static func draw(_ kind: PropertiesGlyphFactory.Kind, in rect: CGRect, color: NSColor) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.minY)
        context.scaleBy(x: rect.width / 16, y: rect.height / 16)
        context.setStrokeColor(color.cgColor)
        context.setLineWidth(1.2)
        switch kind {
        case .cornerExpand:
            for (x, y, dx, dy) in [
                (2.0, 2.0, 1.0, 1.0), (14.0, 2.0, -1.0, 1.0),
                (2.0, 14.0, 1.0, -1.0), (14.0, 14.0, -1.0, -1.0),
            ] {
                context.move(to: CGPoint(x: x + dx * 4, y: y))
                context.addLine(to: CGPoint(x: x, y: y))
                context.addLine(to: CGPoint(x: x, y: y + dy * 4))
            }
            context.strokePath()
        case .sliders:
            for (x, gapY) in [(3.0, 5.0), (8.0, 11.0), (13.0, 5.0)] {
                context.strokeLineSegments(between: [
                    CGPoint(x: x, y: 2), CGPoint(x: x, y: gapY - 2),
                    CGPoint(x: x, y: gapY + 2), CGPoint(x: x, y: 14),
                ])
                context.strokeLineSegments(between: [
                    CGPoint(x: x - 2, y: gapY), CGPoint(x: x + 2, y: gapY),
                ])
            }
        case .strokeWidth:
            for (y, width) in [(4.0, 1.0), (8.0, 3.0), (12.0, 1.0)] {
                context.setLineWidth(width)
                context.strokeLineSegments(between: [CGPoint(x: 2, y: y), CGPoint(x: 14, y: y)])
            }
        default:
            context.stroke(CGRect(x: 3, y: 3, width: 10, height: 10))
            let inset: CGFloat = kind == .strokeInside ? 5 : kind == .strokeOutside ? 1 : 3
            context.setLineWidth(2)
            context.stroke(
                CGRect(x: inset, y: inset, width: 16 - inset * 2, height: 16 - inset * 2))
        }
        context.restoreGState()
    }
}

/// The inspector's bottom Add menu is deliberately a quiet outlined command.
final class NativeInspectorAddButton: NSButton {
    var onClick: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        target = self
        action = #selector(activate)
        focusRingType = .none
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    @objc private func activate() { onClick?() }

    override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(
            roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 12, yRadius: 12)
        NSColor(white: 1, alpha: 0.12).setStroke()
        path.lineWidth = 1
        path.stroke()
        (title as NSString).draw(
            at: CGPoint(x: 10, y: (bounds.height - 14) / 2),
            withAttributes: [
                .font: ThemeFonts.mono(size: 10, weight: .regular),
                .foregroundColor: NSColor(hex: "a3a3a3"),
            ])
    }
}

/// Constraint pins share the web's drawing and six distinct hit regions.
final class NativeConstraintsDiagramView: NSView {
    var horizontal = "left" { didSet { needsDisplay = true } }
    var vertical = "top" { didSet { needsDisplay = true } }
    var onPinChange: ((String?, String?) -> Void)?
    private var pinButtons: [NSButton] = []
    override var isFlipped: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityRole(.group)
        let labels = [
            NativeCopy.Key.constraintLeft, .constraintRight, .constraintTop,
            .constraintBottom, .verticalTitle, .horizontalTitle,
        ]
        for (index, label) in labels.enumerated() {
            let button = NSButton(title: "", target: self, action: #selector(choosePin(_:)))
            button.isBordered = false
            button.tag = index
            button.setAccessibilityLabel(NativeCopy.text(label))
            button.setAccessibilityIdentifier("Inspector.Properties.ConstraintPin.\(index)")
            addSubview(button)
            pinButtons.append(button)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layout() {
        super.layout()
        let rectangles = [
            CGRect(x: 0, y: 18, width: 18, height: 24),
            CGRect(x: 42, y: 18, width: 18, height: 24),
            CGRect(x: 18, y: 0, width: 24, height: 18),
            CGRect(x: 18, y: 42, width: 24, height: 18),
            CGRect(x: 18, y: 18, width: 12, height: 24),
            CGRect(x: 30, y: 18, width: 12, height: 24),
        ]
        for (index, rectangle) in rectangles.enumerated() { pinButtons[index].frame = rectangle }
    }

    @objc private func choosePin(_ sender: NSButton) {
        switch sender.tag {
        case 0: horizontal = "left"
        case 1: horizontal = "right"
        case 2: vertical = "top"
        case 3: vertical = "bottom"
        case 4: vertical = "middle"
        case 5: horizontal = "center"
        default: preconditionFailure("Unknown constraint pin")
        }
        onPinChange?(horizontal, vertical)
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor(hex: "1a1a1a").setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 8, yRadius: 8).fill()
        NSColor(hex: "262626").setFill()
        NSBezierPath(
            roundedRect: CGRect(x: 10, y: 10, width: 40, height: 40), xRadius: 6, yRadius: 6
        ).fill()
        let pins: [(CGRect, Bool)] = [
            (
                CGRect(x: 8, y: 21, width: 2, height: 18),
                horizontal == "left" || horizontal == "leftRight"
            ),
            (
                CGRect(x: 50, y: 21, width: 2, height: 18),
                horizontal == "right" || horizontal == "leftRight"
            ),
            (
                CGRect(x: 21, y: 8, width: 18, height: 2),
                vertical == "top" || vertical == "topBottom"
            ),
            (
                CGRect(x: 21, y: 50, width: 18, height: 2),
                vertical == "bottom" || vertical == "topBottom"
            ),
            (
                CGRect(x: 23, y: 21, width: 2, height: 18),
                vertical == "middle" || vertical == "center"
            ),
            (CGRect(x: 31, y: 29, width: 10, height: 2), horizontal == "center"),
        ]
        for (rect, active) in pins {
            NSColor(hex: active ? "a8fcd4" : "525252").setFill()
            NSBezierPath(roundedRect: rect, xRadius: 1, yRadius: 1).fill()
        }
    }
}
