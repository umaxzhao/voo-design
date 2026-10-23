/**
 * Chinese dictionary slice for "Export design to code". Key-parity with
 * codegen-en.js; the Lead wires this slice into the aggregate zh dictionary.
 */
export default {
  "editor.codegen.title": "导出代码",
  "editor.codegen.subtitle": "所选图层的代码",
  "editor.codegen.close": "关闭",
  "editor.codegen.format": "格式",
  "editor.codegen.format.tailwind": "HTML + Tailwind",
  "editor.codegen.format.react": "React",
  "editor.codegen.format.css": "纯 CSS",
  "editor.codegen.scope": "范围",
  "editor.codegen.scope.selection": "选区",
  "editor.codegen.scope.page": "整页",
  "editor.codegen.layers": "个图层",
  "editor.codegen.wholePage": "整页",
  "editor.codegen.warnings": "警告",
  "editor.codegen.noWarnings": "没有损失的图层",
  "editor.codegen.copy": "复制代码",
  "editor.codegen.copied": "已复制",
  "editor.codegen.copyFailed": "复制失败",
  "editor.codegen.download": "下载",
  "editor.codegen.preview": "代码预览",
  "editor.codegen.resolving": "加载图片中…",
  "editor.codegen.error": "无法导出文档。",
  "editor.codegen.copyAction": "复制代码",
  "editor.codegen.exportAction": "导出代码…",
  "editor.codegen.warn.emptySelection": "未选择图层，已导出整页。",
  "editor.codegen.warn.emptyPage": "无可见图层，已导出空白画框。",
  "editor.codegen.warn.imageMissing":
    "图片不可用，已导出占位块。",
  "editor.codegen.warn.imageCropApproximated":
    "图片尺寸未知，裁剪为近似效果。",
  "editor.codegen.warn.imageEffectsSkipped":
    "已跳过图片调整，导出原始像素。",
  "editor.codegen.warn.videoMissing": "视频源不可用，已导出占位块。",
  "editor.codegen.warn.videoBestEffort":
    "视频静音循环自动播放，无播放控件。",
  "editor.codegen.warn.adjustmentSkipped":
    "已跳过调整图层：无对应 CSS。",
  "editor.codegen.warn.regionSkipped":
    "已跳过区域：仅用于编辑引导。",
  "editor.codegen.warn.canvasInstancePlaceholder":
    "嵌套画布已导出为占位块。",
  "editor.codegen.warn.unsupportedNode": "不支持的图层已导出为占位块。",
  "editor.codegen.warn.effectsSkipped":
    "部分图层效果（内阴影、斜面和浮雕、绸缎、叠加）没有对应的 CSS 表达，已跳过。",
  "editor.codegen.warn.textEffectsSkipped":
    "部分文字效果（高亮、基线偏移）没有对应的 CSS 表达，已跳过。",
  "editor.codegen.warn.maskSkipped": "已跳过蒙版，导出图层不带蒙版。",
  "editor.codegen.warn.clipSkipped": "已跳过剪切路径。",
  "editor.codegen.warn.blendModeUnsupported":
    "Tailwind 不支持此混合模式，已使用普通模式。",
  "editor.codegen.warn.vectorMissing": "无矢量几何，已导出占位块。",
};
