import AppKit

final class NativeLayerSearch: NSViewController, NSSearchFieldDelegate {
    static let shared = NativeLayerSearch()
    private let popover = NSPopover()
    private let input = NSSearchField()
    private var onChange: ((String) -> Void)?

    override func loadView() {
        view = NSView(frame: CGRect(x: 0, y: 0, width: 256, height: 56))
        input.frame = CGRect(x: 12, y: 12, width: 232, height: 32)
        input.delegate = self
        input.setAccessibilityIdentifier("Layers.SearchInput")
        view.addSubview(input)
    }

    func show(relativeTo button: NSView, query: String, onChange: @escaping (String) -> Void) {
        _ = view
        self.onChange = onChange
        input.stringValue = query
        input.placeholderString = NativeCopy.text(.searchLayers)
        input.setAccessibilityLabel(NativeCopy.text(.searchLayers))
        popover.contentViewController = self
        popover.behavior = .transient
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .maxY)
        input.window?.makeFirstResponder(input)
    }

    func controlTextDidChange(_ obj: Notification) { onChange?(input.stringValue) }
}

final class NativeCodePanel: NSScrollView {
    let code = NSTextView()
    override init(frame: NSRect) {
        super.init(frame: frame)
        hasVerticalScroller = true
        drawsBackground = false
        code.isEditable = false
        code.isSelectable = true
        code.isRichText = false
        code.isVerticallyResizable = true
        code.minSize = NSSize(width: 0, height: 400)
        code.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        code.textColor = ThemeTokens.textPrimary
        code.drawsBackground = false
        code.autoresizingMask = [.width]
        code.textContainer?.widthTracksTextView = true
        code.setAccessibilityIdentifier("Inspector.Code.Source")
        documentView = code
    }
    required init?(coder: NSCoder) { super.init(coder: coder) }
}
