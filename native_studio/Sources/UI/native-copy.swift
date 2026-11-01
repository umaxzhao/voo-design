import Foundation

/// Native UI copy uses the same persisted locale as the settings drawer.
enum NativeCopy {
    enum Key: String {
        case guidesToggle, clearGuides
        case editTextLayout, textBoxWidth, autoTextWidth, fixedTextWidth, invalidTextWidth
        case layersTab, assetsTab
        case constraintLeft, constraintRight, constraintTop, constraintBottom, constraintCenter,
            constraintScale, normalBlend
        case designTab, prototypeTab, codeTab, prototypeUnavailable, addToLayer
        case transformTitle, constraintsTitle, appearanceTitle, fillTitle, strokeTitle, effectsTitle
        case horizontalTitle, verticalTitle, layerTitle, frameKind, textKind, groupKind, ellipseKind
        case rectangleKind, pathKind, booleanKind, flipHorizontal, flipVertical
        case unsavedTitle, unsavedBody, save, cancel, discard, missingFile
        case collaborationUnavailable, brushSize, brushOpacity, brushColor
        case status, unsupportedImport, importTitle, searchLayers, noResults
        case codeEmpty, assetsEmpty, unsupportedAccount
        case editPaint, editEffects, paintEditFailed, unsupportedEffects, addEffect, removeEffect
        case blurEffect, shadowEffect, innerShadowEffect, fillOpacity, strokeOpacity, addFill,
            addStroke
    }
    static func text(_ key: Key) -> String {
        let chinese =
            (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
        return (chinese ? zh : en)[key] ?? en[key]!
    }
    private static let en: [Key: String] = [
        .editTextLayout: "Edit text layout", .textBoxWidth: "Text box width",
        .autoTextWidth: "Auto width", .fixedTextWidth: "Fixed width",
        .invalidTextWidth: "Invalid text box width.",
        .guidesToggle: "Show/hide guides", .clearGuides: "Clear all guides",
        .layersTab: "Layers", .assetsTab: "Assets",
        .constraintLeft: "Left", .constraintRight: "Right", .constraintTop: "Top",
        .constraintBottom: "Bottom",
        .constraintCenter: "Center", .constraintScale: "Scale", .normalBlend: "Normal",
        .designTab: "Design", .prototypeTab: "Prototype", .codeTab: "Code",
        .prototypeUnavailable: "Prototype interactions are not available in the native editor yet.",
        .addToLayer: "+ Add", .transformTitle: "Transform", .constraintsTitle: "Constraints",
        .appearanceTitle: "Appearance", .fillTitle: "Fill", .strokeTitle: "Stroke",
        .effectsTitle: "Effects",
        .horizontalTitle: "Horizontal", .verticalTitle: "Vertical", .layerTitle: "Layer",
        .frameKind: "Frame", .textKind: "Text", .groupKind: "Group", .ellipseKind: "Ellipse",
        .rectangleKind: "Rectangle", .pathKind: "Vector", .booleanKind: "Boolean",
        .flipHorizontal: "Flip horizontally", .flipVertical: "Flip vertically",
        .addFill: "Add fill", .addStroke: "Add stroke",
        .editPaint: "Edit paint", .editEffects: "Edit effects",
        .paintEditFailed: "Paint edit failed: ",
        .unsupportedEffects: "This effect format is preserved but cannot be edited here yet.",
        .addEffect: "Add effect", .removeEffect: "Remove", .blurEffect: "Gaussian Blur",
        .shadowEffect: "Drop Shadow", .innerShadowEffect: "Inner Shadow",
        .fillOpacity: "Fill opacity", .strokeOpacity: "Stroke opacity",
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
        .editTextLayout: "编辑文字布局", .textBoxWidth: "文本框宽度",
        .autoTextWidth: "自动宽度", .fixedTextWidth: "固定宽度", .invalidTextWidth: "文本框宽度无效。",
        .guidesToggle: "显示/隐藏参考线", .clearGuides: "清除所有参考线",
        .layersTab: "图层", .assetsTab: "资源",
        .constraintLeft: "左", .constraintRight: "右", .constraintTop: "上", .constraintBottom: "下",
        .constraintCenter: "居中", .constraintScale: "缩放", .normalBlend: "正常",
        .designTab: "设计", .prototypeTab: "原型", .codeTab: "代码",
        .prototypeUnavailable: "原生编辑器暂未实现原型交互。",
        .addToLayer: "+ 添加", .transformTitle: "变换", .constraintsTitle: "约束",
        .appearanceTitle: "外观", .fillTitle: "填充", .strokeTitle: "描边", .effectsTitle: "效果",
        .horizontalTitle: "水平", .verticalTitle: "垂直", .layerTitle: "图层",
        .frameKind: "画框", .textKind: "文字", .groupKind: "组合", .ellipseKind: "椭圆",
        .rectangleKind: "矩形", .pathKind: "矢量", .booleanKind: "布尔",
        .flipHorizontal: "水平翻转", .flipVertical: "垂直翻转",
        .addFill: "添加填充", .addStroke: "添加描边",
        .editPaint: "编辑绘制层", .editEffects: "编辑效果", .paintEditFailed: "绘制层编辑失败：",
        .unsupportedEffects: "此效果格式已保留，暂不支持在这里编辑。", .addEffect: "添加效果",
        .removeEffect: "移除", .blurEffect: "高斯模糊", .shadowEffect: "投影", .innerShadowEffect: "内阴影",
        .fillOpacity: "填充不透明度", .strokeOpacity: "描边不透明度",
        .unsavedTitle: "继续前保存更改？", .unsavedBody: "当前文档有未保存的更改。请先保存，以保留工作内容。",
        .save: "保存", .cancel: "取消", .discard: "放弃更改", .missingFile: "未找到工程文件，已保留当前文档。",
        .collaborationUnavailable: "原生编辑器尚未接入实时协作。", .brushSize: "大小", .brushOpacity: "不透明度",
        .brushColor: "颜色",
        .status: "状态", .unsupportedImport: "原生编辑器尚不支持此导入格式。", .importTitle: "导入",
        .searchLayers: "搜索图层", .noResults: "没有匹配的图层", .codeEmpty: "选择图层以查看代码。",
        .assetsEmpty: "当前文档没有可复用资源", .unsupportedAccount: "原生编辑器暂未接入云端登录。",
    ]
}
