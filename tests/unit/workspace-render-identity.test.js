import { expect, it } from "vitest";
import { sameWorkspacePaint } from "../../src/canvas/editor/workspace-render-identity.js";

it("deduplicates repeated chrome notifications but paints camera, scene and surface changes", () => {
  const base = { docs: [{}], layouts: {}, panX: 0, panY: 0, zoom: 1, width: 800,
    height: 600, dpr: 1, backgroundColor: "#525252", revision: 1 };
  expect(sameWorkspacePaint(null, base)).toBe(false);
  expect(sameWorkspacePaint(base, { ...base })).toBe(true);
  expect(sameWorkspacePaint(base, { ...base, revision: 2 })).toBe(true);
  for (const change of [{ docs: [{}] }, { layouts: {} }, { panX: 20 }, { panY: 20 },
    { zoom: 2 }, { width: 1000 }, { height: 800 }, { dpr: 2 },
    { backgroundColor: "#ffffff" }, { resolveImageUrl: () => "new-image" }]) {
    expect(sameWorkspacePaint(base, { ...base, ...change })).toBe(false);
  }
});
