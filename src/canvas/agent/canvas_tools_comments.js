/** Agent tools for page-scoped review comments. */

import {
  addComment,
  addReply,
  deleteComment,
  listOpenComments,
  normalizeComments,
  serializeComments,
  setResolved,
} from "../comments/comment_model.js";

const COMMENT_HISTORY_NAME = "editor.history.entry.comments";

function fail(message) {
  throw Object.assign(new Error(`agentInvalidArgs: ${message}`), {
    code: "agentInvalidArgs",
  });
}

function editorOf() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) {
    throw Object.assign(new Error("agentNoEditor"), { code: "agentNoEditor" });
  }
  return editor;
}

function documentOf(editor) {
  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) fail("The editor has no active page document.");
  return doc;
}

function writeComments(editor, mutate) {
  const doc = documentOf(editor);
  const base = { ...doc, comments: normalizeComments(doc.comments) };
  const next = mutate(base);
  if (!next || next === base) return { ok: false, error: "comment_not_found_or_invalid" };
  const nextDoc = { ...next, comments: serializeComments(next) };
  if (typeof editor.setDoc === "function") {
    editor.setDoc(nextDoc, { name: COMMENT_HISTORY_NAME });
  } else if (typeof editor.updateDocument === "function") {
    editor.updateDocument(nextDoc, { name: COMMENT_HISTORY_NAME });
  } else {
    fail("The editor cannot save comment changes.");
  }
  editor.requestRender?.();
  return { ok: true, comments: nextDoc.comments };
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) fail(`${field} must be a non-empty string.`);
  return value.trim();
}

export function listComments(args = {}) {
  const comments = normalizeComments(documentOf(editorOf()).comments);
  return {
    ok: true,
    comments: args.openOnly === true ? listOpenComments(comments) : comments,
  };
}

export function createComment(args = {}) {
  if (typeof args.x !== "number" || !Number.isFinite(args.x) || typeof args.y !== "number" || !Number.isFinite(args.y)) {
    fail("x and y must be finite canvas coordinates.");
  }
  const body = requireText(args.body, "body");
  const author = typeof args.author === "string" ? args.author.trim() : "Codex";
  const result = writeComments(editorOf(), (doc) => addComment(doc, {
    x: args.x,
    y: args.y,
    body,
    author: { name: author || "Codex" },
  }));
  if (result.ok) result.comment = result.comments.at(-1);
  return result;
}

export function replyComment(args = {}) {
  const commentId = requireText(args.commentId, "commentId");
  const body = requireText(args.body, "body");
  const author = typeof args.author === "string" ? args.author.trim() : "Codex";
  return writeComments(editorOf(), (doc) => addReply(doc, commentId, {
    body,
    author: { name: author || "Codex" },
  }));
}

export function resolveComment(args = {}) {
  const commentId = requireText(args.commentId, "commentId");
  if (typeof args.resolved !== "boolean") fail("resolved must be a boolean.");
  return writeComments(editorOf(), (doc) => setResolved(doc, commentId, args.resolved));
}

export function removeComment(args = {}) {
  const commentId = requireText(args.commentId, "commentId");
  return writeComments(editorOf(), (doc) => deleteComment(doc, commentId));
}

const tool = (name, description, properties, required = []) => ({
  type: "function",
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
    },
  },
});

export const COMMENT_TOOL_SCHEMAS = Object.freeze([
  tool("list_comments", "List review comments on the active page, optionally only unresolved threads.", {
    openOnly: { type: "boolean" },
  }),
  tool("create_comment", "Create an undoable review comment at canvas coordinates.", {
    x: { type: "number" },
    y: { type: "number" },
    body: { type: "string" },
    author: { type: "string" },
  }, ["x", "y", "body"]),
  tool("reply_comment", "Reply to a review comment thread.", {
    commentId: { type: "string" },
    body: { type: "string" },
    author: { type: "string" },
  }, ["commentId", "body"]),
  tool("resolve_comment", "Mark a review comment thread resolved or reopen it.", {
    commentId: { type: "string" },
    resolved: { type: "boolean" },
  }, ["commentId", "resolved"]),
  tool("delete_comment", "Delete a review comment thread and its replies.", {
    commentId: { type: "string" },
  }, ["commentId"]),
]);

export const COMMENT_TOOL_EXECUTORS = Object.freeze({
  list_comments: listComments,
  create_comment: createComment,
  reply_comment: replyComment,
  resolve_comment: resolveComment,
  delete_comment: removeComment,
});
