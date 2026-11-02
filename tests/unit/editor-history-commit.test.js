import { expect, it, vi } from "vitest";
import { createHistoryApi } from "../../src/canvas/editor/editor_history_api.js";

it("publishes a completed preview gesture after recording its history snapshot", () => {
  const snapshot = { doc: { nodes: [{ id: "rect", x: 80 }] } };
  const push = vi.fn(() => "recorded");
  const onCommit = vi.fn(() => expect(push).toHaveBeenCalledWith(snapshot, "Move"));
  const api = createHistoryApi({ history: { push }, snapshotState: () => snapshot, onCommit });
  expect(api.commit("Move")).toBe("recorded");
  expect(onCommit).toHaveBeenCalledTimes(1);
});

it("supports history clients without a document notification callback", () => {
  const push = vi.fn();
  const api = createHistoryApi({ history: { push }, snapshotState: () => "snapshot" });
  expect(() => api.commit("Move")).not.toThrow();
  expect(push).toHaveBeenCalledWith("snapshot", "Move");
});
