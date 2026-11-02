import { expect, it } from "vitest";
import { createLiveWorkspaceDocuments } from "../../src/canvas/editor/workspace-live-documents.js";

it("keeps camera-only frames from restarting GPU resource completion renders", () => {
  const resolve = createLiveWorkspaceDocuments();
  const liveDoc = { width: 500, height: 300, nodes: [] };
  const docs = [{ id: "page", nodes: [] }, { id: "other", nodes: [] }];
  const first = resolve(docs, "page", liveDoc);
  expect(resolve(docs, "page", liveDoc)).toBe(first);
  expect(first[0].id).toBe("page");
  expect(first[1]).toBe(docs[1]);
  expect(resolve([...docs], "page", liveDoc)).toBe(first);
  const moved = resolve(docs, "page", { ...liveDoc, width: 700 });
  expect(moved[0].width).toBe(700);
  expect(moved[0]).not.toBe(first[0]);
});

it("preserves the supported frame surface when media needs the Canvas2D fallback", () => {
  const resolve = createLiveWorkspaceDocuments();
  const liveDoc = { width: 500, height: 300, backgroundColor: "#123456", nodes: [{ kind: "image", id: "image" }] };
  const result = resolve([{ id: "page" }], "page", liveDoc);
  expect(result[0].backgroundColor).toBe("#123456");
  expect(result[0].nodes).toEqual([]);
  expect(resolve([{ id: "other" }], "other", { ...liveDoc, backgroundColor: "#ffffff" })[0].backgroundColor).toBe("#ffffff");
});
