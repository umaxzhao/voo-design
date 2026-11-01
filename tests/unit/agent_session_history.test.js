import { describe, it, expect } from "vitest";
import {
  createEmptySession,
  deleteSessionFromList,
  renameSessionInList,
  upsertSession,
} from "../../src/canvas/agent/session_history.js";

describe("agent session history", () => {
  it("titles a session from its first user message", () => {
    const session = createEmptySession("s1");
    const saved = upsertSession([], {
      ...session,
      messages: [{ kind: "text", role: "user", content: "做一张海报的草稿" }],
    });
    expect(saved[0].title).toBe("做一张海报的草稿");
  });

  it("replaces an existing session instead of duplicating it", () => {
    const first = upsertSession([], createEmptySession("s2"));
    const second = upsertSession(first, { ...createEmptySession("s2"), title: "renamed" });
    expect(second).toHaveLength(1);
    expect(second[0].title).toBe("renamed");
  });

  it("deletes only the requested session", () => {
    const list = [createEmptySession("a"), createEmptySession("b")];
    expect(deleteSessionFromList(list, "a").map((s) => s.id)).toEqual(["b"]);
  });

  it("renames only the requested session without changing its transcript", () => {
    const list = [
      { ...createEmptySession("a"), messages: [{ role: "user", content: "hello" }] },
      createEmptySession("b"),
    ];
    const renamed = renameSessionInList(list, "a", "  Campaign  ");
    expect(renamed[0]).toMatchObject({ title: "Campaign", messages: list[0].messages });
    expect(renamed[1]).toBe(list[1]);
    expect(renameSessionInList(list, "a", " ")).toBe(list);
  });
});
