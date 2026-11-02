/**
 * Critique-and-improve logic for generated layouts.
 *
 * After a layout streams in, a lightweight model run reviews it against the
 * design brief (visual hierarchy, palette, whitespace, anti-AI-slop, type
 * scale). A low score or any major issue triggers one improvement pass that
 * regenerates the HTML with the review attached. Pure functions here are
 * testable; the model calls live in layout_actions.js.
 */

/** Extracts { score, issues[] } from a model reply, tolerating fences/text. */
export function parseCritique(text) {
  if (typeof text !== "string") return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const score = Number(parsed?.score);
    return {
      score: Number.isFinite(score)
        ? Math.max(0, Math.min(100, Math.round(score)))
        : null,
      issues: Array.isArray(parsed?.issues)
        ? parsed.issues
            .slice(0, 5)
            .map((item) => ({
              severity: item?.severity === "major" ? "major" : "minor",
              issue: String(item?.issue ?? "").slice(0, 200),
              fix: String(item?.fix ?? "").slice(0, 200),
            }))
            .filter((item) => item.issue)
        : [],
    };
  } catch {
    return null;
  }
}

/** Whether a review warrants an improvement pass. */
export function reviewNeedsImprovement(review) {
  if (!review) return false;
  const hasMajor = review.issues?.some((item) => item.severity === "major");
  return hasMajor || (Number.isFinite(review.score) && review.score < 85);
}

/** The lightweight review prompt (run on the fast model). */
export function buildCritiquePrompt({ brief, html, content = "" }) {
  return [
    "你是资深产品设计总监，评审下面这份 AI 生成的版式（HTML）。对照简报中的艺术指导与设计系统，重点判断成品是否有独特且恰当的视觉观点。不要因为 HTML 可解析或配色正确就给高分。",
    "评审维度：1) 是否有明确视觉主角与可追踪的阅读动线 2) 构图、字体尺度、留白和密度是否形成节奏，而非均匀铺卡 3) 图形母题是否来自内容且被克制复用 4) 导航、主行动和内容是否像可交付的真实产品页面 5) 字号、对比、对齐和边界是否可读 6) 是否有 emoji、模板骨架、占位文案或编造数据。",
    "评分标尺：90+ 是具有鲜明品味且可交付的作品；75-89 有清晰视觉观点但存在局部瑕疵；60-74 是整齐却普通的模板；低于 60 是线框、同尺寸卡片堆叠、错误结构或明显不可用。请严格区分整洁与美感。",
    "只输出 JSON，不要任何其他文字：",
    '{"score": 0-100 整数, "issues": [{"severity": "major|minor", "issue": "问题描述", "fix": "具体修改建议"}]}',
    "issues 最多 5 条；major 只留给真正破坏视觉或违反硬性规则的问题，普通调整用 minor。",
    content
      ? `<用户原始要求与已提供数据>\n${content}\n</用户原始要求与已提供数据>`
      : "",
    `<设计简报>\n${brief}\n</设计简报>`,
    `<版式HTML>\n${html}\n</版式HTML>`,
  ].join("\n\n");
}

/** The improvement pass prompt: the review plus the current HTML. */
export function buildImprovePrompt({
  html,
  review,
  brief,
  width,
  height,
  content = "",
}) {
  return [
    "你是资深产品设计师。下面是一份已生成的版式 HTML 和评审意见。重新思考视觉主角、构图和内容节奏，针对每条意见实质性改进，输出完整 HTML。不要只微调圆角和颜色。",
    "必须遵守原始规范：画布固定尺寸；外层可绝对定位，组内可用 flex/grid；样式全部内联；只用锁定色板；禁止模板式卡片堆叠和反 AI 味。保留所有重要内容与可编辑层级。",
    `画布 ${width}×${height}px。`,
    content
      ? `<用户原始要求与已提供数据>\n${content}\n</用户原始要求与已提供数据>`
      : "",
    brief,
    `<评审意见>\n${JSON.stringify(review?.issues ?? [], null, 1)}\n</评审意见>`,
    `<当前版式HTML>\n${html}\n</当前版式HTML>`,
    "直接输出改进后的完整 HTML，不要解释文字，不要 Markdown 代码块围栏。",
  ].join("\n\n");
}
