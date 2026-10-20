/** Thrown when a node fails, carrying enough context for a localized message. */
export class RunError extends Error {
  constructor(code, nodeId, details = {}) {
    super(details.message ?? code);
    this.name = "RunError";
    this.code = code;
    this.nodeId = nodeId;
    this.providerId = details.providerId;
    this.details = details.details;
  }
}

/**
 * Appended to every text-node request. Without it the models answer
 * conversationally, and the preamble travels downstream as prompt text.
 */
export const TEXT_EDIT_CONTRACT = [
  "这是纯文本创作与编辑任务，不是图片生成任务。",
  "禁止生成、编辑或渲染图片，禁止调用任何图片工具。即使内容涉及图片描述，也只需处理文字本身。",
  "如果提供了待编辑文本，请严格按照要求进行改写或翻译；如果没有提供待编辑文本，请直接根据创作要求生成内容。",
  "核心要求：直接输出最终的文本内容。绝对不要包含 Markdown 代码块包裹（如 ``` ），不要包含“这是翻译后的内容”、“好的”等任何前后缀客套话或解释说明。",
].join("\n");
