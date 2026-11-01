import AppKit

public final class ToolFlyoutRowView: NSButton {
    public let item: ToolFlyoutItem
    public var onSelect: (() -> Void)?
    var keyboardFocused = false { didSet { needsDisplay = true } }
    private var hovered = false { didSet { needsDisplay = true } }

    public init(item: ToolFlyoutItem, width: CGFloat = 132, height: CGFloat = 26) {
        self.item = item
        super.init(frame: CGRect(x: 0, y: 0, width: width, height: height))
        title = item.title
        isBordered = false
        focusRingType = .none
        target = self
        action = #selector(choose)
        state = item.isSelected ? .on : .off
        setAccessibilityRole(.menuItem)
        setAccessibilityIdentifier("ToolMenu.Item." + item.id)
        setAccessibilityLabel(item.title)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    public override var acceptsFirstResponder: Bool { true }
    @objc private func choose() { onSelect?() }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self { removeTrackingArea(area) }
        addTrackingArea(
            NSTrackingArea(
                rect: .zero,
                options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect],
                owner: self, userInfo: nil))
    }

    public override func mouseEntered(with event: NSEvent) { hovered = true }
    public override func mouseExited(with event: NSEvent) { hovered = false }

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds, xRadius: 8, yRadius: 8)
        if item.isSelected || hovered {
            NSColor(white: 1, alpha: 0.1).setFill()
            path.fill()
        }
        if keyboardFocused {
            ThemeTokens.colorMint.setStroke()
            path.lineWidth = 2
            path.stroke()
        }
        let iconColor = hovered ? NSColor.white : NSColor(hex: "a3a3a3")
        let icon = CGRect(x: 8, y: bounds.midY - 7, width: 14, height: 14)
        switch item.iconName {
        case "pen": VooIconFactory.drawPen(in: icon, color: iconColor)
        case "curvature": VooIconFactory.draw(.sparkles, in: icon, color: iconColor)
        case "pencil": VooIconFactory.drawPencil(in: icon, color: iconColor)
        case "rect": VooIconFactory.drawRect(in: icon, color: iconColor)
        case "ellipse": VooIconFactory.drawEllipse(in: icon, color: iconColor)
        case "line": VooIconFactory.drawLine(in: icon, color: iconColor)
        case "polygon": VooIconFactory.drawPolygon(in: icon, color: iconColor)
        case "star": VooIconFactory.drawStar(in: icon, color: iconColor)
        case "arrow": VooIconFactory.drawArrow(in: icon, color: iconColor)
        default: preconditionFailure("Unknown tool menu glyph: \(item.iconName)")
        }
        let label = NSAttributedString(
            string: item.title,
            attributes: [
                .font: NativeToolMenuModel.font,
                .foregroundColor: item.isSelected || hovered
                    ? NSColor.white : NSColor(hex: "d4d4d4"),
            ])
        label.draw(
            in: CGRect(
                x: 30, y: bounds.midY - label.size().height / 2,
                width: max(0, bounds.width - 38), height: label.size().height))
    }
}

public final class ToolFlyoutContentView: NSView {
    public var onSelectSubTool: ((String) -> Void)?
    var onPointerEntered: (() -> Void)?
    var onPointerExited: (() -> Void)?
    public private(set) var rows: [ToolFlyoutRowView] = []
    public private(set) var focusedIndex: Int?
    public override var isFlipped: Bool { true }

    public init(items: [ToolFlyoutItem], width: CGFloat = 142) {
        super.init(
            frame: CGRect(
                x: 0, y: 0, width: width,
                height: NativeToolMenuModel.height(itemCount: items.count)))
        setAccessibilityRole(.menu)
        setAccessibilityLabel(NativeToolMenuModel.toolOptions)
        for (index, item) in items.enumerated() {
            let row = ToolFlyoutRowView(item: item, width: width - 10)
            row.frame.origin = CGPoint(x: 5, y: 5 + CGFloat(index) * 28)
            row.onSelect = { [weak self] in self?.onSelectSubTool?(item.id) }
            addSubview(row)
            rows.append(row)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self { removeTrackingArea(area) }
        addTrackingArea(
            NSTrackingArea(
                rect: .zero,
                options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect],
                owner: self, userInfo: nil))
    }
    public override func mouseEntered(with event: NSEvent) { onPointerEntered?() }
    public override func mouseExited(with event: NSEvent) { onPointerExited?() }

    func focusFirstItem() { focus(0) }

    @discardableResult
    func handleMenuKey(_ keyCode: UInt16) -> Bool {
        guard !rows.isEmpty else { return false }
        switch keyCode {
        case 125: focus(((focusedIndex ?? -1) + 1) % rows.count)
        case 126: focus(((focusedIndex ?? 0) - 1 + rows.count) % rows.count)
        case 115: focus(0)
        case 119: focus(rows.count - 1)
        case 36, 49:
            guard let focusedIndex else { return false }
            rows[focusedIndex].performClick(nil)
        default: return false
        }
        return true
    }

    private func focus(_ index: Int) {
        guard rows.indices.contains(index) else { return }
        focusedIndex = index
        for (rowIndex, row) in rows.enumerated() { row.keyboardFocused = rowIndex == index }
        window?.makeFirstResponder(rows[index])
    }

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(
            roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5),
            xRadius: 12, yRadius: 12)
        NSColor.black.withAlphaComponent(0.9).setFill()
        path.fill()
        NSColor.white.withAlphaComponent(0.1).setStroke()
        path.lineWidth = 1
        path.stroke()
    }
}
