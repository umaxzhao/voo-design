import AppKit

/// Metrics and copy come from EditorFamilyMenu and the shared tool families.
enum NativeToolMenuModel {
    static let minimumWidth: CGFloat = 142
    static let padding: CGFloat = 5
    static let rowHeight: CGFloat = 26
    static let rowGap: CGFloat = 2
    static let anchorGap: CGFloat = 8
    static var font: NSFont { ThemeFonts.mono(size: 11) }

    static var toolOptions: String { chinese ? "工具选项" : "Tool options" }
    private static var chinese: Bool {
        (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
    }

    static func title(_ id: String) -> String {
        let copy: [String: (String, String)] = [
            "pen": ("Pen", "钢笔"), "curvature": ("Curvature Pen", "曲率钢笔"),
            "pencil": ("Freeform Pen", "自由钢笔"), "rect": ("Rectangle", "矩形"),
            "ellipse": ("Ellipse", "椭圆"), "line": ("Line", "直线"),
            "polygon": ("Polygon", "多边形"), "star": ("Star", "星形"),
            "arrow": ("Arrow", "箭头"),
        ]
        guard let labels = copy[id] else { preconditionFailure("Unknown tool menu item: \(id)") }
        return chinese ? labels.1 : labels.0
    }

    static func items(for tool: StudioToolType, selection: String) -> [ToolFlyoutItem] {
        let ids: [String]
        switch tool {
        case .pen: ids = ["pen", "curvature", "pencil"]
        case .shapes: ids = ["rect", "ellipse", "line", "polygon", "star", "arrow"]
        default: return []
        }
        return ids.map {
            ToolFlyoutItem(
                id: $0, title: title($0), shortcut: "", iconName: $0,
                isSelected: selection == $0)
        }
    }

    static func width(for items: [ToolFlyoutItem]) -> CGFloat {
        let labelWidth =
            items.map { ($0.title as NSString).size(withAttributes: [.font: font]).width }
            .max() ?? 0
        // Border + p-1, row px-2, 14pt glyph and gap-2.
        return max(minimumWidth, ceil(labelWidth + padding * 2 + 16 + 14 + 8))
    }

    static func height(itemCount: Int) -> CGFloat {
        padding * 2 + CGFloat(itemCount) * rowHeight + CGFloat(max(0, itemCount - 1)) * rowGap
    }
}

/// A separate 14pt hit target preserves the main tool button's click semantics.
final class NativeToolMenuTrigger: NSButton {
    var onTrigger: (() -> Void)?
    var expanded = false {
        didSet {
            setAccessibilityValue(expanded)
            needsDisplay = true
        }
    }

    init(identifier: String) {
        super.init(frame: .zero)
        title = ""
        isBordered = false
        focusRingType = .none
        target = self
        action = #selector(trigger)
        setAccessibilityIdentifier(identifier)
        setAccessibilityRole(.popUpButton)
        setAccessibilityLabel(NativeToolMenuModel.toolOptions)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var acceptsFirstResponder: Bool { true }
    @objc private func trigger() { onTrigger?() }

    override func draw(_ dirtyRect: NSRect) {
        VooIconFactory.drawChevronDown(
            in: bounds.insetBy(dx: 2, dy: 2),
            color: expanded ? .white : NSColor(hex: "a3a3a3"), strokeWidth: 1.2)
    }
}

/// The Web hover menu delays are shared by opening and pointer handoff.
final class NativeToolMenuHover {
    static let openDelay: TimeInterval = 0.120
    static let closeDelay: TimeInterval = 0.220
    private var timer: Timer?
    private var pendingAction: (() -> Void)?
    private(set) var pendingDelay: TimeInterval?

    func schedule(after delay: TimeInterval, action: @escaping () -> Void) {
        cancel()
        pendingDelay = delay
        pendingAction = action
        let timer = Timer(timeInterval: delay, repeats: false) { [weak self] _ in
            self?.runPendingAction()
        }
        self.timer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    func runPendingAction() {
        let action = pendingAction
        cancel()
        action?()
    }

    func cancel() {
        timer?.invalidate()
        timer = nil
        pendingAction = nil
        pendingDelay = nil
    }

    deinit { timer?.invalidate() }
}
