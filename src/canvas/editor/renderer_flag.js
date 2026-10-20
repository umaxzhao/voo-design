/**
 * Which renderer paints the editor.
 *
 * The Skia path is being brought up alongside the 2D one rather than in place
 * of it: both draw the same document, so they can be compared on the same
 * page, and a machine that cannot start CanvasKit still has an editor. The
 * choice lives in localStorage so it can be flipped in a running tab without
 * a rebuild — this is a switch for developing the migration, not a user
 * setting, and it disappears once the Skia path is the only one.
 *
 *   localStorage.setItem("voo.renderer", "skia")   // then reload
 *   localStorage.removeItem("voo.renderer")        // back to 2D
 */

const STORAGE_KEY = "voo.renderer";

export function skiaRendererEnabled() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "skia";
  } catch {
    // A blocked storage partition is not a reason to fail to draw.
    return false;
  }
}
