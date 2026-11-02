import AppKit

enum NativeViewAidPreferences {
    static let guidesKey = "voo.editor.showGuides"
    static var guidesVisible: Bool {
        UserDefaults.standard.object(forKey: guidesKey) as? Bool ?? true
    }
}

extension WindowController {
    /// View-only operations share one path across toolbar, settings and shortcuts.
    public func setGuidesVisible(_ visible: Bool) {
        mainContentView.canvasStageView.showGuides = visible
        UserDefaults.standard.set(visible, forKey: NativeViewAidPreferences.guidesKey)
        mainContentView.bottomZoomBar.setVisibilityEnabled(visible)
    }

    public func setRulersVisible(_ visible: Bool) {
        mainContentView.canvasStageView.showRulers = visible
        UserDefaults.standard.set(visible, forKey: SettingsDrawerView.showRulersDefaultsKey)
        mainContentView.bottomZoomBar.setRulersEnabled(visible)
        mainContentView.updateIslandBarPosition()
    }

    public func toggleGuidesAction(_ sender: Any?) {
        setGuidesVisible(!mainContentView.canvasStageView.showGuides)
    }

    public func clearGuidesAction(_ sender: Any?) {
        let previous = mainContentView.canvasStageView.document.guides
        guard let previous, !previous.isEmpty else { return }
        let command = BasicCommand(
            name: NativeCopy.text(.clearGuides),
            execute: { document in
                document.guides = []
                return true
            },
            undo: { document in
                document.guides = previous
                return true
            })
        if commandManager.execute(command, on: &mainContentView.canvasStageView.document) {
            refreshAfterDocumentMutation()
        }
    }

    func handleViewAidShortcut(_ event: NSEvent) -> Bool {
        guard !mainContentView.isWelcomeOpen,
            mainContentView.onboardingGuide.isHidden,
            mainContentView.settingsDrawer.isHidden
        else { return false }
        let modifiers = event.modifierFlags.intersection([.command, .control, .shift, .option])
        if modifiers == [.shift], event.charactersIgnoringModifiers?.lowercased() == "r" {
            toggleRulersAction(nil)
            return true
        }
        let command = modifiers.contains(.command) || modifiers.contains(.control)
        guard command, !modifiers.contains(.shift), event.keyCode == 41 else { return false }
        if modifiers.contains(.option) { clearGuidesAction(nil) } else { toggleGuidesAction(nil) }
        return true
    }
}
