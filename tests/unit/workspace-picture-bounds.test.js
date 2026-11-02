import { describe, expect, it } from "vitest";
import { workspacePictureBounds, pictureCapturesScene } from "../../src/canvas/editor/workspace-picture-bounds.js";

const frame = { id: "frame", kind: "group", isFrame: true, clipContent: true,
  x: 100, y: 100, width: 200, height: 300, strokeWidth: 4 };
const child = { id: "child", kind: "rect", parentId: frame.id, x: -500, y: -500, width: 2000, height: 2000 };
const doc = (...nodes) => ({ isCanvasRoot: true, nodes });

describe("complete artwork capture bounds", () => {
  it("uses clipping-frame extents, including all stroke widths, for nested artwork", () => {
    const scene = doc({ ...frame, strokes: [{ width: 8 }] }, { id: "folder", kind: "group", parentId: frame.id },
      { ...child, parentId: "folder", layerBlur: 80 });
    expect(workspacePictureBounds(scene)).toEqual({ left: 92, top: 92, right: 308, bottom: 408 });
    expect(workspacePictureBounds(scene)).toBe(workspacePictureBounds(scene));
    const changed = doc({ ...frame, x: 500 }, child);
    expect(workspacePictureBounds(changed).left).toBe(496);
  });

  it("requires every branch to reach a clipping frame and rejects cycles and duplicate IDs", () => {
    expect(workspacePictureBounds(doc(frame, child))).not.toBeNull();
    expect(workspacePictureBounds(doc(frame, { ...child, parentId: "missing" }))).toBeNull();
    expect(workspacePictureBounds(doc(frame, { ...child, parentId: child.id }))).toBeNull();
    expect(workspacePictureBounds(doc(frame, child, { ...child }))).toBeNull();
    expect(workspacePictureBounds(doc(frame, { ...child, parentId: null }))).toBeNull();
    expect(workspacePictureBounds(doc({ ...frame, id: "other", x: 1000 }, frame, child)))
      .toEqual({ left: 96, top: 96, right: 1204, bottom: 404 });
  });

  it.each([
    { clipContent: false }, { rotation: 45 }, { shear: 15 }, { flipH: true },
    { layerBlur: 20 }, { shadow: { enabled: true, blur: 20 } }, { effects: [{ type: "drop-shadow", blur: 4 }] },
    { maskId: "mask" }, { warp: {} }, { blendMode: "copy" }, { width: NaN }, { strokes: {} },
  ])("retains the existing viewport fallback for unproven frame paint extents: %j", patch => {
    expect(workspacePictureBounds(doc({ ...frame, ...patch }, child))).toBeNull();
  });

  it("rejects unbounded backdrop operations, non-root documents and playback", () => {
    expect(workspacePictureBounds(doc(frame, { ...child, kind: "adjustment" }))).toBeNull();
    expect(workspacePictureBounds({ ...doc(frame), isCanvasRoot: false })).toBeNull();
    expect(workspacePictureBounds({ ...doc(frame), timeline: {} })).toBeNull();
  });

  it("requires antialiased edges to be inside the cached device-pixel region", () => {
    const scene = doc(frame, child);
    const surface = { stageWidth: 500, stageHeight: 500, viewport: { zoom: 1, panX: -96, panY: 0 } };
    expect(pictureCapturesScene(scene, surface, 0, 1)).toBe(false);
    expect(pictureCapturesScene(scene, surface, 2, 1)).toBe(true);
    expect(pictureCapturesScene(scene, surface, 1, 2)).toBe(true);
    expect(pictureCapturesScene(scene, { ...surface, viewport: { ...surface.viewport, zoom: 2 } }, 0, 1)).toBe(false);
  });
});
