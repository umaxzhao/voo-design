if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_TOOL_SCHEMAS, EXECUTORS, executeCanvasTool } from "../../src/canvas/agent/canvas_tools.js";

describe("canvas agent comment tools", () => {
  let doc;
  let editor;

  beforeEach(() => {
    doc = { nodes: [], comments: [] };
    editor = {
      getDocument: () => doc,
      setDoc: vi.fn((next) => { doc = next; }),
      requestRender: vi.fn(),
    };
    window.__vooEditor = editor;
  });

  it("registers every review operation for local and MCP agents", () => {
    const names = ["list_comments", "create_comment", "reply_comment", "resolve_comment", "delete_comment"];
    for (const name of names) {
      expect(CANVAS_TOOL_SCHEMAS.some((schema) => schema.function?.name === name)).toBe(true);
      expect(typeof EXECUTORS[name]).toBe("function");
    }
  });

  it("creates, lists, replies to and resolves a thread as undoable page edits", async () => {
    const created = await executeCanvasTool("create_comment", {
      x: 120,
      y: 240,
      body: "Check this spacing",
    });
    const commentId = created.comment.id;
    expect(created.ok).toBe(true);
    expect(editor.setDoc).toHaveBeenCalledWith(expect.objectContaining({ comments: expect.any(Array) }), {
      name: "editor.history.entry.comments",
    });

    await executeCanvasTool("reply_comment", { commentId, body: "Adjusted" });
    expect(doc.comments[0].messages).toHaveLength(2);
    expect((await executeCanvasTool("list_comments", {})).comments).toHaveLength(1);

    await executeCanvasTool("resolve_comment", { commentId, resolved: true });
    expect(doc.comments[0].resolved).toBe(true);
    expect((await executeCanvasTool("list_comments", { openOnly: true })).comments).toEqual([]);
  });

  it("deletes a thread and rejects invalid coordinates or missing messages", async () => {
    expect(await executeCanvasTool("create_comment", { x: 1, y: 2, body: "Review" })).toMatchObject({ ok: true });
    const commentId = doc.comments[0].id;
    expect(await executeCanvasTool("delete_comment", { commentId })).toMatchObject({ ok: true });
    expect(doc.comments).toEqual([]);
    await expect(executeCanvasTool("create_comment", { x: Infinity, y: 0, body: "Bad" })).rejects.toThrow("agentInvalidArgs");
    await expect(executeCanvasTool("reply_comment", { commentId: "missing", body: "Reply" })).resolves.toMatchObject({ ok: false });
  });
});
