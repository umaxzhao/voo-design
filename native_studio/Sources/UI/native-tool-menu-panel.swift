import AppKit

final class NativeToolMenuPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// A child panel avoids NSPopover's system arrow and extra chrome.
final class NativeToolMenuPresenter {
    private var panel: NativeToolMenuPanel?
    private var eventMonitor: Any?
    private var observers: [NSObjectProtocol] = []
    private weak var anchor: NSView?
    private weak var previousResponder: NSResponder?
    private weak var parentWindow: NSWindow?
    var onDismiss: ((Bool) -> Void)?
    var screenFrame: CGRect? { panel?.frame }

    static func frame(anchor: CGRect, size: CGSize, visibleFrame: CGRect) -> CGRect {
        let x = max(
            visibleFrame.minX + 8,
            min(anchor.midX - size.width / 2, visibleFrame.maxX - size.width - 8))
        return CGRect(
            x: x, y: anchor.minY - NativeToolMenuModel.anchorGap - size.height,
            width: size.width, height: size.height)
    }

    func show(content: ToolFlyoutContentView, anchor: NSView, focus: Bool) {
        close()
        guard let parent = anchor.window else { return }
        self.anchor = anchor
        parentWindow = parent
        previousResponder = parent.firstResponder
        let anchorFrame = parent.convertToScreen(anchor.convert(anchor.bounds, to: nil))
        let visible = parent.screen?.visibleFrame ?? anchorFrame.insetBy(dx: -1000, dy: -1000)
        let frame = Self.frame(
            anchor: anchorFrame, size: content.bounds.size, visibleFrame: visible)
        let panel = NativeToolMenuPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isReleasedWhenClosed = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.colorSpace = .sRGB
        panel.hasShadow = true
        panel.hidesOnDeactivate = true
        panel.level = parent.level
        panel.contentView = content
        parent.addChildWindow(panel, ordered: .above)
        panel.orderFront(nil)
        self.panel = panel
        if focus { focusFirstItem() }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [
            .leftMouseDown, .rightMouseDown, .keyDown,
        ]) {
            [weak self, weak content] event in
            guard let self else { return event }
            if event.type == .keyDown, self.panel?.isKeyWindow == true {
                if event.keyCode == 53 {
                    self.onDismiss?(true)
                    return nil
                }
                if content?.handleMenuKey(event.keyCode) == true { return nil }
            } else if event.type != .keyDown {
                let point =
                    event.window?.convertPoint(toScreen: event.locationInWindow)
                    ?? NSEvent.mouseLocation
                if !frame.contains(point) && !anchorFrame.contains(point) {
                    self.onDismiss?(false)
                }
            }
            return event
        }
        for name in [NSWindow.didResizeNotification, NSWindow.didMoveNotification] {
            observers.append(
                NotificationCenter.default.addObserver(
                    forName: name, object: parent,
                    queue: .main
                ) { [weak self] _ in self?.onDismiss?(false) })
        }
        observers.append(
            NotificationCenter.default.addObserver(
                forName: NSApplication.didResignActiveNotification, object: nil, queue: .main
            ) {
                [weak self] _ in self?.onDismiss?(false)
            })
    }

    func focusFirstItem() {
        panel?.makeKeyAndOrderFront(nil)
        (panel?.contentView as? ToolFlyoutContentView)?.focusFirstItem()
    }

    func close(restoreFocus: Bool = false) {
        if let eventMonitor { NSEvent.removeMonitor(eventMonitor) }
        eventMonitor = nil
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers.removeAll()
        let wasKey = panel?.isKeyWindow == true
        if let panel {
            parentWindow?.removeChildWindow(panel)
            panel.orderOut(nil)
        }
        panel = nil
        if wasKey { parentWindow?.makeKeyAndOrderFront(nil) }
        if restoreFocus {
            let target = (anchor as? ToolButton)?.menuTrigger ?? anchor
            parentWindow?.makeFirstResponder(target)
        } else if wasKey {
            parentWindow?.makeFirstResponder(previousResponder)
        }
        anchor = nil
        previousResponder = nil
        parentWindow = nil
    }

    deinit { close() }
}
