// Local comment notifications: seen timestamp, unread ids and @mentions.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMENT_SEEN_SETTING,
  mentionedMessages,
  readCommentSeenAt,
  threadLastActivity,
  unreadCommentCount,
  unreadCommentIds,
  writeCommentSeenAt,
} from "../../src/canvas/comments/comment_notifications.js";

const now = Date.now();
const comments = [
  { id: "c1", createdAt: new Date(now - 5000).toISOString(), messages: [{ id: "m1", author: { name: "A" }, body: "Old", createdAt: new Date(now - 5000).toISOString() }] },
  { id: "c2", createdAt: new Date(now - 1000).toISOString(), messages: [{ id: "m2", author: { name: "B" }, body: "@you please check", createdAt: new Date(now - 1000).toISOString() }] },
];

afterEach(() => vi.unstubAllGlobals());

describe("comment notifications", () => {
  it("computes thread activity and unread ids", () => {
    expect(threadLastActivity(comments[0])).toBe(now - 5000);
    const ids = unreadCommentIds(comments, now - 3000);
    expect(ids).toEqual(["c2"]);
    expect(unreadCommentCount(comments, now - 3000)).toBe(1);
    expect(unreadCommentIds(comments, now)).toEqual([]);
  });

  it("finds @mentions by name", () => {
    const mentions = mentionedMessages(comments, "You");
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ commentId: "c2", message: { id: "m2" } });
    expect(mentionedMessages(comments, "")).toEqual([]);
  });

  it("persists and reads the seen timestamp", () => {
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
    });
    expect(readCommentSeenAt()).toBe(0);
    writeCommentSeenAt(12345);
    expect(store.get(COMMENT_SEEN_SETTING)).toBe("12345");
    expect(readCommentSeenAt()).toBe(12345);
    writeCommentSeenAt(0);
    expect(readCommentSeenAt()).toBe(0);
  });

  it("degrades safely without storage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readCommentSeenAt()).toBe(0);
    expect(writeCommentSeenAt(7)).toBe(7);
  });
});
