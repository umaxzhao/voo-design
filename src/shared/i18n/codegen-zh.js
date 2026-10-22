/**
 * Chinese dictionary slice for "Export design to code". Key-parity with
 * codegen-en.js; the Lead wires this slice into the aggregate zh dictionary.
 */
export default {
  "editor.codegen.title": "导出设计代码",
  "editor.codegen.subtitle": "将所选图层导出为 Tailwind、React 或纯 CSS 代码。",
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
  "editor.codegen.resolving": "正在解析图片资源...",
  "editor.codegen.error": "无法导出该文档。",
  "editor.codegen.copyAction": "复制代码",
  "editor.codegen.exportAction": "导出设计代码...",
  "editor.codegen.warn.emptySelection": "未选择任何图层，已改为导出整页。",
  "editor.codegen.warn.emptyPage": "页面没有可见图层，已导出空白画框。",
  "editor.codegen.warn.imageMissing":
    "图片图层缺少可用的图片数据，已导出中性占位块。",
  "editor.codegen.warn.imageCropApproximated":
    "缺少原图像素尺寸，图片裁剪为近似还原。",
  "editor.codegen.warn.imageEffectsSkipped":
    "图片调整无法烘焙进代码，已导出原始像素。",
  "editor.codegen.warn.videoMissing": "视频图层缺少可用的来源，已导出占位块。",
  "editor.codegen.warn.videoBestEffort":
    "视频以静音、循环、自动播放方式导出，不包含播放控件。",
  "editor.codegen.warn.adjustmentSkipped":
    "调整图层已跳过：调整图层没有对应的 CSS 表达。",
  "editor.codegen.warn.regionSkipped":
    "区域图层已跳过：区域是 AI 编辑引导，不属于画面内容。",
  "editor.codegen.warn.canvasInstancePlaceholder":
    "画布实例已展平为占位块：嵌套画布不会内联导出。",
  "editor.codegen.warn.unsupportedNode": "不支持的图层类型已导出为占位块。",
  "editor.codegen.warn.effectsSkipped":
    "部分图层效果（内阴影、斜面和浮雕、绸缎、叠加）没有对应的 CSS 表达，已跳过。",
  "editor.codegen.warn.textEffectsSkipped":
    "部分文字效果（高亮、基线偏移）没有对应的 CSS 表达，已跳过。",
  "editor.codegen.warn.maskSkipped": "图层蒙版已跳过，导出的图层不带蒙版。",
  "editor.codegen.warn.clipSkipped": "图层剪切已跳过，未还原剪切路径。",
  "editor.codegen.warn.blendModeUnsupported":
    "图层混合模式没有对应的 Tailwind 类，已按普通混合导出。",
  "editor.codegen.warn.vectorMissing": "矢量图层没有可绘制的几何，已导出占位块。",
};
