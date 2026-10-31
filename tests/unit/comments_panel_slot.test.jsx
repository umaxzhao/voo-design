import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import EditorComments from "../../src/canvas/components/editor_comments.jsx";
import EditorCommentsPanel from "../../src/canvas/components/editor_comments_panel.jsx";

const loader = vi.hoisted(() => ({ error: null }));
vi.mock("../../src/canvas/components/editor_hooks/use_deferred_comments.js", () => ({
  useDeferredComments: () => ({ Component: null, error: loader.error, retry: vi.fn() }),
}));
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: key => key }) }));

function emptyModel() {
  const actions = Object.fromEntries([
    "setDraft", "setReplyBody", "setFilter", "closeThread", "submitDraft",
    "submitReply", "handleDelete", "handleResolve", "focusThread", "popoverStyle",
  ].map(name => [name, vi.fn()]));
  return { ...actions, list: [], threads: [], openCount: 0, unreadCount: 0,
    unreadIds: new Set(), filter: "open", selectedId: null, selected: null,
    draft: null, replyBody: "", author: {}, cameraX: {}, cameraY: {} };
}

describe("comments replace the shared inspector", () => {
  it("does not claim a second inspector during standalone comment-mode loading", () => {
    const html = renderToStaticMarkup(<EditorComments open={false} addMode comments={[]} />);
    expect(html).not.toContain('data-testid="editor-properties-panel"');
  });
  it("keeps standalone-mode errors retryable without a second inspector", () => {
    loader.error = new Error("Fixture unavailable");
    try {
      const html = renderToStaticMarkup(<EditorComments open={false} addMode comments={[]} />);
      expect(html).toContain('data-testid="editor-comments-error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('error.retry');
      expect(html).not.toContain('data-testid="editor-properties-panel"');
    } finally { loader.error = null; }
  });
  it.each([false, true])("uses the same single docked inspector shell (swapped=%s)", swapSide => {
    const html = renderToStaticMarkup(<EditorCommentsPanel model={emptyModel()} open swapSide={swapSide} t={key => key} />);
    expect(html).toContain(swapSide ? "absolute left-4" : "absolute right-4");
    expect(html.match(/<aside\b/g)).toHaveLength(1);
    expect(html).toContain('data-testid="editor-properties-panel"');
    expect(html).toContain('data-testid="editor-comments-panel"');
    expect(html).toContain('aria-label="Comments"');
    const content = html.match(/<section[^>]+>/)?.[0];
    expect(content).toBeDefined();
    expect(content).not.toMatch(/absolute|shadow|rounded|bg-/);
    expect(html).not.toContain('data-inspector-control=');
  });
  it("does not leave a second shell behind when closed", () => {
    expect(renderToStaticMarkup(<EditorCommentsPanel model={emptyModel()} open={false} />)).toBe("");
  });
});
