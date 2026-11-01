import Foundation

/// Native UI copy uses the same persisted locale as the settings drawer.
enum NativeCopy {
    enum Key: String {
        case unsavedTitle, unsavedBody, save, cancel, discard, missingFile
        case collaborationUnavailable, brushSize, brushOpacity, brushColor
        case status, unsupportedImport, importTitle, searchLayers, noResults
        case codeEmpty, assetsEmpty, unsupportedAccount
    }
    static func text(_ key: Key) -> String {
        let chinese =
            (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
        return (chinese ? zh : en)[key] ?? en[key]!
    }
    private static let en: [Key: String] = [
        .unsavedTitle: "Save changes before continuing?",
        .unsavedBody: "Your current document has unsaved changes. Save it to keep your work.",
        .save: "Save", .cancel: "Cancel", .discard: "Discard Changes",
        .missingFile: "The project file could not be found. Your current document has been kept.",
        .collaborationUnavailable: "Live collaboration is not connected in the native editor yet.",
        .brushSize: "Size", .brushOpacity: "Opacity", .brushColor: "Colour",
        .status: "Status",
        .unsupportedImport: "This import format is not supported by the native editor yet.",
        .importTitle: "Import", .searchLayers: "Search layers", .noResults: "No matching layers",
        .codeEmpty: "Select a layer to inspect its code.",
        .assetsEmpty: "No reusable assets in this document",
        .unsupportedAccount: "Cloud sign-in is not available in the native editor yet.",
    ]
    private static let zh: [Key: String] = [
        .unsavedTitle: "继续前保存更改？", .unsavedBody: "当前文档有未保存的更改。请先保存，以保留工作内容。",
        .save: "保存", .cancel: "取消", .discard: "放弃更改", .missingFile: "未找到工程文件，已保留当前文档。",
        .collaborationUnavailable: "原生编辑器尚未接入实时协作。", .brushSize: "大小", .brushOpacity: "不透明度",
        .brushColor: "颜色",
        .status: "状态", .unsupportedImport: "原生编辑器尚不支持此导入格式。", .importTitle: "导入",
        .searchLayers: "搜索图层", .noResults: "没有匹配的图层", .codeEmpty: "选择图层以查看代码。",
        .assetsEmpty: "当前文档没有可复用资源", .unsupportedAccount: "原生编辑器暂未接入云端登录。",
    ]
}
