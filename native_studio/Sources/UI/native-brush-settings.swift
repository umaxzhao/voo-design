import AppKit

final class NativeBrushSettings: NSViewController {
    static let shared = NativeBrushSettings()
    private let popover = NSPopover()
    private let size = NSSlider(value: 24, minValue: 1, maxValue: 256, target: nil, action: nil)
    private let opacity = NSSlider(value: 1, minValue: 0, maxValue: 1, target: nil, action: nil)
    private let colour = NSColorWell()
    private weak var stage: CanvasStageView?

    override func loadView() {
        view = NSView(frame: CGRect(x: 0, y: 0, width: 256, height: 160))
        let rows: [(NativeCopy.Key, NSControl)] = [
            (.brushSize, size), (.brushOpacity, opacity), (.brushColor, colour),
        ]
        for (index, row) in rows.enumerated() {
            let label = NSTextField(labelWithString: NativeCopy.text(row.0))
            label.frame = CGRect(x: 12, y: 116 - index * 44, width: 80, height: 24)
            row.1.frame = CGRect(x: 98, y: 116 - index * 44, width: 146, height: 28)
            row.1.setAccessibilityLabel(NativeCopy.text(row.0))
            row.1.setAccessibilityIdentifier("Brush.Settings." + row.0.rawValue)
            row.1.target = self
            row.1.action = #selector(updateBrush)
            view.addSubview(label)
            view.addSubview(row.1)
        }
    }

    func show(relativeTo button: NSView, stage: CanvasStageView) {
        _ = view
        self.stage = stage
        size.doubleValue = Double(stage.brushDiameter)
        opacity.doubleValue = Double(stage.brushOpacity)
        colour.color = NSColor(hex: stage.brushColorHex)
        popover.contentViewController = self
        popover.behavior = .transient
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .maxY)
    }

    @objc private func updateBrush() {
        stage?.brushDiameter = CGFloat(size.doubleValue)
        stage?.brushOpacity = CGFloat(opacity.doubleValue)
        stage?.brushColorHex = colour.color.hexString
    }
}
