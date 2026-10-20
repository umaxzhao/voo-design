// Base canvas sizing and backdrop helpers for editor node rendering.

export const PAGE_BACKGROUND = "#ffffff";

/** Selection chrome, in screen pixels so it never scales with the zoom. */
export const SELECTION_COLOR = "#b2ffd6";

export const HANDLE_SIZE = 8;
const HANDLE_HIT_SLOP = 4;

/** How far from a handle centre a pointer still grabs it, in screen pixels. */
export const HANDLE_GRAB_RADIUS = HANDLE_SIZE / 2 + HANDLE_HIT_SLOP;

/** Checkerboard square size in document units; it scales with the zoom like
    Photoshop's transparency grid. */
const CHECKER_SQUARE = 8;

let checkerboardSource = null;

/**
 * A tiny two-tone tile used to paint a transparent page backdrop on screen.
 * Created lazily so Node (unit tests) can import this module without a DOM —
 * there the preview falls back to the plain page colour instead.
 */
export function getCheckerboardSource() {
  if (!checkerboardSource) {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = CHECKER_SQUARE * 2;
    canvas.height = CHECKER_SQUARE * 2;
    const tile = canvas.getContext("2d");
    tile.fillStyle = "#ffffff";
    tile.fillRect(0, 0, canvas.width, canvas.height);
    tile.fillStyle = "#e3e3e3";
    tile.fillRect(0, 0, CHECKER_SQUARE, CHECKER_SQUARE);
    tile.fillRect(
      CHECKER_SQUARE,
      CHECKER_SQUARE,
      CHECKER_SQUARE,
      CHECKER_SQUARE,
    );
    checkerboardSource = canvas;
  }
  return checkerboardSource;
}

/**
 * Matches the backing store to the CSS size at the device pixel ratio.
 *
 * Returns true when the size changed, so the caller can skip a redraw that
 * would otherwise be redundant.
 */
export function resizeCanvas(canvas, width, height, dpr) {
  const nextWidth = Math.max(1, Math.round(width * dpr));
  const nextHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width === nextWidth && canvas.height === nextHeight) return false;
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return true;
}
