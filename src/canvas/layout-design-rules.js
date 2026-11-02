/** Shared critique rules stay synchronous without loading generation presets. */
export const ANTI_SLOP_RULES = [
  "禁止使用默认 AI 蓝紫强调色：#6366f1、#4f46e5、#4338ca、#3730a3、#8b5cf6、#7c3aed、#a855f7 一律禁用",
  "禁止英雄区双色渐变（紫→蓝、indigo→pink、蓝→青这类默认渐变），渐变要克制且来自所选风格",
  "禁止用 emoji（✨🚀🎯⚡🔥💡等）充当图标或装饰，文字里也不要用",
  "禁止「圆角卡片 + 彩色左边框」的 AI 仪表盘排版",
  "禁止编造指标（如 10× 更快、99.9% 可用性），数据要么真实要么用明确的占位",
  "禁止填充文案（lorem ipsum、feature one/two/three、placeholder text），空版式用构图解决",
  "禁止套「Hero → Features → Pricing → FAQ → CTA」模板骨架，至少要有一个非常规区块",
  "全页使用的不同颜色控制在 8 个以内（含渐变端点色），配色必须克制",
  "禁止大面积纯黑底 + 霓虹光效的模板感",
  "同一装饰元素（重复圆点/线条）克制使用，禁止整页重复堆叠",
  "留白与信息量取平衡，要有清晰视觉重心",
  "所有文字使用有意义的文案（用用户提供的内容；不够时用通顺占位文案），禁止乱码",
];
