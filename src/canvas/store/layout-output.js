import { extractHtmlSnippet } from "../editor/streaming_layout_filter.js";

const LAYOUT_ROOT =
  /<(?:div|section|main|article|header|footer|nav|aside|h[1-6]|p|span|ul|li|button|img)\b/i;
const DOCUMENT_START = /<!doctype\s+html\b|<html\b/i;

/** Keep model commentary out of the preview and the document parser. */
export function extractLayoutMarkup(raw) {
  const withoutReasoning = String(raw ?? "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "");
  const text = extractHtmlSnippet(withoutReasoning);
  const root = LAYOUT_ROOT.exec(text);
  if (!root) return "";
  const documentStart = DOCUMENT_START.exec(text);
  const start =
    documentStart && documentStart.index < root.index
      ? documentStart.index
      : root.index;
  return text.slice(start).trim();
}

/** A retry is useful only after the model returned content without a layout. */
export function buildLayoutRetryPrompt(prompt, reason) {
  const qualityIssue = String(reason).startsWith("layout-quality:");
  return [
    prompt,
    qualityIssue
      ? "上一次设计稿中的文字行高、文本框或画板边界有问题。请重新排版并生成完整设计稿。"
      : "上一次输出无法转换为可编辑画布。请重新生成完整设计稿。",
    `${qualityIssue ? "排版问题" : "解析原因"}：${reason}`,
    ...(qualityIssue
      ? [
          "逐段核对文字实际换行后的高度；给文本框留足高度，保持页面边距，所有文字完整落在画板内。",
        ]
      : []),
    "HTML 只是内部画布交换格式，不表示要设计网页。",
    "只输出一个有实际可见子元素的完整 HTML 根容器；不要解释、计划、Markdown 或代码围栏。",
  ].join("\n\n");
}
