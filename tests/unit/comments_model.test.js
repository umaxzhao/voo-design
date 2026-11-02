import { describe, it, expect } from "vitest";
import {
  addComment,
  addReply,
  countOpen,
  deleteComment,
  deserializeComments,
  hitTestComment,
  listOpenComments,
  normalizeComments,
  serializeComments,
  setResolved,
  sortedComments,
} from "../../src/canvas/comments/comment_model.js";

const author = { id: "user_1", name: "Ada", avatarSeed: "seed_ada" };

function makeDoc(comments) {
  return { id: "doc_1", nodes: [{ id: "n1" }], guides: [], comments };
}

function makeComment(overrides = {}) {
  return {
    id: "c1",
    x: 10,
    y: 20,
    resolved: false,
    createdAt: 1000,
    author,
    messages: [
      { id: "m1", author, body: "First look", createdAt: 1000 },
    ],
    ...overrides,
  };
}

describe("comment_model — normalization tolerance", () => {
  it("returns an empty list for every absent or malformed container", () => {
    expect(normalizeComments(undefined)).toEqual([]);
    expect(normalizeComments(null)).toEqual([]);
    expect(normalizeComments({})).toEqual([]);
    expect(normalizeComments({ comments: null })).toEqual([]);
    expect(normalizeComments({ comments: "nope" })).toEqual([]);
    expect(normalizeComments("not json")).toEqual([]);
    expect(normalizeComments(42)).toEqual([]);
  });

  it("drops entries without a finite document point", () => {
    const normalized = normalizeComments([
      makeComment({ id: "ok" }),
      makeComment({ id: "no-x", x: undefined }),
      makeComment({ id: "nan-x", x: Number.NaN }),
      makeComment({ id: "bad-y", y: "not a number" }),
      null,
      "comment",
      [],
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe("ok");
  });

  it("coerces numeric strings, string bodies, and legacy author names", () => {
    const [comment] = normalizeComments([
      {
        id: " c1 ",
        x: "12.5",
        y: "-4",
        resolved: "true",
        createdAt: "2026-01-02T03:04:05.000Z",
        author: "  Grace  ",
        messages: [
          { id: "m1", author: "Grace", body: 42, createdAt: "1000" },
          { id: "m2", author: "Grace", body: "   " },
          { body: "" },
          null,
        ],
      },
    ]);
    expect(comment.x).toBe(12.5);
    expect(comment.y).toBe(-4);
    expect(comment.id).toBe("c1");
    expect(comment.resolved).toBe(true);
    expect(comment.createdAt).toBe(Date.parse("2026-01-02T03:04:05.000Z"));
    expect(comment.author).toEqual({
      id: "",
      name: "Grace",
      avatarSeed: "Grace",
    });
    expect(comment.messages).toHaveLength(1);
    expect(comment.messages[0].body).toBe("42");
    expect(comment.messages[0].createdAt).toBe(1000);
  });

  it("keeps a legacy top-level body as the first message", () => {
    const [comment] = normalizeComments([
      { id: "legacy", x: 1, y: 2, body: "Before messages existed", author },
    ]);
    expect(comment.messages).toHaveLength(1);
    expect(comment.messages[0].body).toBe("Before messages existed");
    expect(comment.messages[0].author).toEqual(author);
  });

  it("accepts a JSON string and a document wrapper", () => {
    const json = JSON.stringify([makeComment()]);
    expect(normalizeComments(json)).toHaveLength(1);
    expect(normalizeComments({ comments: [makeComment()] })).toHaveLength(1);
  });

  it("generates unique ids for missing or duplicate comment/message ids", () => {
    const normalized = normalizeComments([
      makeComment({ id: "dup" }),
      makeComment({ id: "dup" }),
      makeComment({
        id: "",
        messages: [
          { id: "same", body: "a" },
          { id: "same", body: "b" },
          { body: "no id" },
        ],
      }),
    ]);
    const commentIds = normalized.map((comment) => comment.id);
    expect(commentIds.every(Boolean)).toBe(true);
    expect(new Set(commentIds).size).toBe(commentIds.length);
    const messageIds = normalized.flatMap((comment) =>
      comment.messages.map((message) => message.id),
    );
    expect(messageIds.every(Boolean)).toBe(true);
    expect(new Set(messageIds).size).toBe(messageIds.length);
  });

  it("does not mutate the input", () => {
    const input = [makeComment()];
    const snapshot = JSON.stringify(input);
    normalizeComments(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("comment_model — add / reply / resolve / delete", () => {
  it("adds a comment with its first message and preserves unrelated doc fields", () => {
    const doc = makeDoc([]);
    const next = addComment(doc, {
      x: "30",
      y: 40,
      body: "  Tighten this spacing  ",
      author,
    });
    expect(next).not.toBe(doc);
    expect(doc.comments).toEqual([]);
    expect(next.nodes).toEqual(doc.nodes);
    expect(next.comments).toHaveLength(1);
    const [comment] = next.comments;
    expect(comment).toMatchObject({
      x: 30,
      y: 40,
      resolved: false,
      author,
    });
    expect(comment.id).toBeTruthy();
    expect(comment.messages).toHaveLength(1);
    expect(comment.messages[0]).toMatchObject({
      author,
      body: "Tighten this spacing",
    });
    expect(comment.messages[0].id).toBeTruthy();
    expect(comment.messages[0].createdAt).toBe(comment.createdAt);
  });

  it("uses the supplied comment id", () => {
    const next = addComment(makeDoc([]), {
      id: "chosen",
      x: 1,
      y: 2,
      body: "hello",
      author,
    });
    expect(next.comments[0].id).toBe("chosen");
  });

  it("is a no-op for invalid points or empty bodies", () => {
    const doc = makeDoc([]);
    expect(addComment(doc, { x: 1, y: 2, body: "   ", author })).toBe(doc);
    expect(addComment(doc, { x: "no", y: 2, body: "hi", author })).toBe(doc);
    expect(addComment(doc, { y: 2, body: "hi", author })).toBe(doc);
  });

  it("adds replies in order and rejects unknown threads or empty bodies", () => {
    const doc = addComment(makeDoc([]), { x: 1, y: 2, body: "first", author });
    const id = doc.comments[0].id;
    const replied = addReply(doc, id, { body: "second", author });
    expect(replied.comments[0].messages.map((m) => m.body)).toEqual([
      "first",
      "second",
    ]);
    expect(replied.comments[0].messages[1].id).not.toBe(
      replied.comments[0].messages[0].id,
    );
    expect(addReply(doc, "missing", { body: "x", author })).toBe(doc);
    expect(addReply(doc, id, { body: "  ", author })).toBe(doc);
    expect(addReply(doc, id, {})).toBe(doc);
  });

  it("resolves, reopens, and no-ops when the state is unchanged", () => {
    const doc = addComment(makeDoc([]), { x: 1, y: 2, body: "hey", author });
    const id = doc.comments[0].id;
    const resolved = setResolved(doc, id, true);
    expect(resolved.comments[0].resolved).toBe(true);
    expect(setResolved(resolved, id, true)).toBe(resolved);
    expect(setResolved(resolved, id, false).comments[0].resolved).toBe(false);
    expect(setResolved(doc, "missing", true)).toBe(doc);
  });

  it("deletes a whole thread and no-ops for an unknown id", () => {
    const one = addComment(makeDoc([]), { x: 1, y: 2, body: "one", author });
    const two = addComment(one, { x: 3, y: 4, body: "two", author });
    const twoIds = two.comments.map((comment) => comment.id);
    const after = deleteComment(two, twoIds[0]);
    expect(after.comments).toHaveLength(1);
    expect(after.comments[0].id).toBe(twoIds[1]);
    expect(deleteComment(after, "missing")).toBe(after);
  });

  it("works on empty and legacy documents", () => {
    const next = addComment({}, { x: 0, y: 0, body: "hello", author });
    expect(next.comments).toHaveLength(1);
    const legacy = { id: "legacy-doc", comments: undefined };
    expect(addReply(legacy, "none", { body: "x", author })).toBe(legacy);
    expect(deleteComment(legacy, "none")).toBe(legacy);
    expect(setResolved(legacy, "none", true)).toBe(legacy);
  });
});

describe("comment_model — hit testing", () => {
  const comments = normalizeComments([
    makeComment({ id: "a", x: 0, y: 0, createdAt: 1 }),
    makeComment({ id: "b", x: 10, y: 0, createdAt: 2 }),
    makeComment({ id: "c", x: 10, y: 0, createdAt: 3 }),
  ]);

  it("returns the nearest pin within the slop radius", () => {
    expect(hitTestComment(comments, { x: 1, y: 1 }, 3)?.id).toBe("a");
    expect(hitTestComment(comments, { x: 9, y: 0 }, 3)?.id).toBe("c");
  });

  it("prefers the later comment when two pins coincide", () => {
    expect(hitTestComment(comments, { x: 10, y: 0 }, 2)?.id).toBe("c");
  });

  it("returns null beyond the slop or for an invalid point", () => {
    expect(hitTestComment(comments, { x: 50, y: 50 }, 2)).toBeNull();
    expect(hitTestComment(comments, { x: 0, y: 0 }, 0)?.id).toBe("a");
    expect(hitTestComment(comments, { x: Number.NaN, y: 0 }, 100)).toBeNull();
    expect(hitTestComment([], { x: 0, y: 0 }, 10)).toBeNull();
  });
});

describe("comment_model — ordering and counts", () => {
  const comments = normalizeComments([
    makeComment({ id: "old-open", resolved: false, createdAt: 100 }),
    makeComment({ id: "new-resolved", resolved: true, createdAt: 300 }),
    makeComment({ id: "mid-open", resolved: false, createdAt: 200 }),
    makeComment({ id: "tie-a", resolved: false, createdAt: 300 }),
  ]);

  it("sorts newest-first with a stable id tiebreaker", () => {
    const ids = sortedComments(comments).map((comment) => comment.id);
    expect(ids[0]).toBe("new-resolved");
    expect(ids[1]).toBe("tie-a");
    expect(ids.slice(2)).toEqual(["mid-open", "old-open"]);
  });

  it("lists and counts only open threads", () => {
    expect(listOpenComments(comments).map((comment) => comment.id)).toEqual([
      "tie-a",
      "mid-open",
      "old-open",
    ]);
    expect(countOpen(comments)).toBe(3);
    expect(countOpen([])).toBe(0);
    expect(countOpen(undefined)).toBe(0);
  });
});

describe("comment_model — serialization helpers", () => {
  it("serializes to a plain normalized array and round-trips", () => {
    const doc = addComment(makeDoc([]), {
      x: 12,
      y: 34,
      body: "Round trip",
      author,
    });
    const serialized = serializeComments(doc);
    expect(Array.isArray(serialized)).toBe(true);
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    expect(deserializeComments({ comments: serialized })).toEqual(serialized);
    expect(normalizeComments(serialized)).toEqual(serialized);
  });

  it("accepts a bare array on both sides", () => {
    const raw = [makeComment()];
    expect(serializeComments(raw)).toEqual(normalizeComments(raw));
    expect(deserializeComments(raw)).toEqual(normalizeComments(raw));
  });

  it("returns an empty array for a legacy document with no comments", () => {
    expect(serializeComments({ nodes: [] })).toEqual([]);
    expect(deserializeComments({ nodes: [] })).toEqual([]);
    expect(serializeComments(undefined)).toEqual([]);
    expect(deserializeComments(null)).toEqual([]);
  });
});

describe("comment_model — id collisions", () => {
  it("never overwrites an existing comment when the supplied id is taken", () => {
    const doc = addComment(makeDoc([]), {
      id: "same",
      x: 1,
      y: 2,
      body: "original",
      author,
    });
    const next = addComment(doc, {
      id: "same",
      x: 3,
      y: 4,
      body: "second",
      author,
    });
    expect(next.comments).toHaveLength(2);
    expect(next.comments[0].id).toBe("same");
    expect(next.comments[1].id).not.toBe("same");
    expect(next.comments[1].messages[0].body).toBe("second");
  });

  it("never reuses a reply id", () => {
    const doc = addComment(makeDoc([]), { x: 1, y: 2, body: "first", author });
    const id = doc.comments[0].id;
    const firstReply = addReply(doc, id, {
      id: "message-id",
      body: "one",
      author,
    });
    const secondReply = addReply(firstReply, id, {
      id: "message-id",
      body: "two",
      author,
    });
    const messageIds = secondReply.comments[0].messages.map(
      (message) => message.id,
    );
    expect(new Set(messageIds).size).toBe(messageIds.length);
  });
});
