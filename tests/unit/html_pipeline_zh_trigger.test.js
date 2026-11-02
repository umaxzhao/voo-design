import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldUseHtmlPipeline } from "../../src/canvas/agent/html_pipeline/pipeline.js";

const emptyEditor = { getDocument: () => ({ nodes: [] }) };
const filledEditor = { getDocument: () => ({ nodes: [{ id: "n1" }] }) };

describe("HTML pipeline trigger", () => {
  beforeEach(() => {
    globalThis.document = { createElement: () => ({}) };
  });
  afterEach(() => {
    delete globalThis.document;
  });

  it("keeps the English creation briefs working", () => {
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "Create a landing page for a coffee brand" })).toBe(true);
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "build a dashboard" })).toBe(true);
  });

  it("now recognises Chinese generation briefs", () => {
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "帮我做一个精品咖啡品牌的落地页" })).toBe(true);
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "生成一个数据看板，包含 KPI 和趋势图" })).toBe(true);
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "设计一个移动端应用界面" })).toBe(true);
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "制作一套演示文稿" })).toBe(true);
  });

  it("does not hijack edit requests", () => {
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "修改这个页面的标题" })).toBe(false);
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "调整现有看板的颜色" })).toBe(false);
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "refine the existing landing page" })).toBe(false);
  });

  it("only runs on an empty document", () => {
    expect(shouldUseHtmlPipeline({ editor: filledEditor, userText: "做一个落地页" })).toBe(false);
  });

  it("honours the explicit disable flag", () => {
    expect(shouldUseHtmlPipeline({ editor: emptyEditor, userText: "做一个落地页", enabled: false })).toBe(false);
  });
});
