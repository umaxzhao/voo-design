import AppKit

extension WindowController {
    /// Palette clicks and the custom color picker share one reversible document operation.
    @discardableResult
    public func applyCanvasBackground(_ color: String) -> Bool {
        let stage = mainContentView.canvasStageView
        let previous = stage.document.portableProperties["canvasBackgroundColor"]
        guard stage.document.workspaceBackgroundColor.lowercased() != color.lowercased() else {
            return false
        }
        let command = BasicCommand(
            name: NativeCanvasActionCopy.background,
            execute: { document in
                document.portableProperties["canvasBackgroundColor"] = .string(color)
                return true
            },
            undo: { document in
                document.portableProperties["canvasBackgroundColor"] = previous
                return true
            })
        guard commandManager.execute(command, on: &stage.document) else { return false }
        refreshAfterDocumentMutation()
        return true
    }
}

private enum NativeCanvasActionCopy {
    static var background: String {
        let locale =
            UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en"
        return locale.hasPrefix("zh") ? "修改背景颜色" : "Change background color"
    }
}

// Workspace ground is project state; document canvas paint remains independent.
extension VOODocument {
    var workspaceBackgroundColor: String {
        portableProperties["canvasBackgroundColor"]?.string ?? ThemeTokens.surfaceStage
    }
}
