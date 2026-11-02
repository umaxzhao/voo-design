import Foundation

/// Missing image-tool engines never silently activate a different tool.
enum NativeRailFeedback {
    enum Key {
        case selectFillTarget, selectionFill, healingUnavailable, cropUnavailable
    }

    static func text(_ key: Key) -> String {
        let chinese =
            (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
        switch key {
        case .selectFillTarget:
            return chinese ? "请先选择要编辑填充的图层。" : "Select a layer to edit its fill."
        case .selectionFill:
            return chinese
                ? "编辑选区填充；原生版尚未实现油漆桶工具。"
                : "Editing the selection fill; the native paint bucket is not implemented yet."
        case .healingUnavailable:
            return chinese
                ? "原生版尚未实现图像修复工具。" : "Image healing is not implemented in the native editor yet."
        case .cropUnavailable:
            return chinese
                ? "原生版尚未实现裁剪工具。" : "Cropping is not implemented in the native editor yet."
        }
    }
}
