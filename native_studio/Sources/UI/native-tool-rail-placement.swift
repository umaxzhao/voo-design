import AppKit

/// Electron switches placement using the measured editor width, including Agent changes.
final class NativeToolRailPlacement {
    private weak var shell: NSView?
    private let top: NSLayoutConstraint
    private let center: NSLayoutConstraint
    private let leading: NSLayoutConstraint
    private var compact = false
    private var updateScheduled = false

    init(rail: ToolRailView, shell: NSView) {
        self.shell = shell
        top = rail.topAnchor.constraint(equalTo: shell.topAnchor, constant: 16)
        center = rail.centerXAnchor.constraint(equalTo: shell.centerXAnchor)
        leading = rail.leadingAnchor.constraint(equalTo: shell.leadingAnchor, constant: 8)
        top.isActive = true
        center.isActive = true
        update()
    }

    func update() {
        guard let shell, compact != (shell.bounds.width <= 768), !updateScheduled else { return }
        updateScheduled = true
        // Constraint changes must not re-enter the AppKit layout pass that measured the shell.
        DispatchQueue.main.async { [weak self] in
            guard let self, let shell = self.shell else { return }
            self.updateScheduled = false
            let next = shell.bounds.width <= 768
            guard self.compact != next else { return }
            self.compact = next
            if next {
                self.center.isActive = false
                self.leading.isActive = true
            } else {
                self.leading.isActive = false
                self.center.isActive = true
            }
            self.top.constant = next ? 8 : 16
        }
    }
}
