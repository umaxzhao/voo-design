/**
 * Per-frame layout grids (Figma's "Layout grid"): normalised model + pure
 * geometry. The panel edits the model, the stage draws the geometry as chrome
 * (like rulers, never exported), and both use these helpers so they cannot
 * drift apart.
 *
 * Model is backward compatible with the first version of the panel, which only
 * wrote `{ enabled, size }`.
 */

export const LAYOUT_GRID_TYPES = Object.freeze(["grid", "columns", "rows"]);

const DEFAULT_COLOUR = "#FF3B30";

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeColour(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? ""))
    ? String(value).toUpperCase()
    : DEFAULT_COLOUR;
}

/** Clamps every field; unknown types fall back to the pixel grid. */
export function normalizeLayoutGrid(grid) {
  const raw = grid && typeof grid === "object" ? grid : {};
  return {
    enabled: raw.enabled !== false && grid != null,
    type: LAYOUT_GRID_TYPES.includes(raw.type) ? raw.type : "grid",
    size: clampInt(raw.size ?? 8, 1, 512, 8),
    count: clampInt(raw.count ?? 12, 1, 64, 12),
    gutter: clampInt(raw.gutter ?? 16, 0, 512, 16),
    margin: clampInt(raw.margin ?? 16, 0, 512, 16),
    colour: normalizeColour(raw.colour),
  };
}

/** HEX + alpha → rgba(), so fills and hairlines can share one colour. */
export function gridColour(hex, alpha) {
  const value = normalizeColour(hex).slice(1);
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Bands (filled column/row strips) and hairlines for one grid in document
 * coordinates. `box` is the frame's absolute rect.
 */
export function layoutGridGeometry(box, grid) {
  const result = { bands: [], lines: [], colour: DEFAULT_COLOUR, opacity: 0 };
  if (!box || !(box.width > 0) || !(box.height > 0)) return result;
  if (grid == null || grid.enabled === false) return result;
  const model = normalizeLayoutGrid(grid);
  result.colour = model.colour;

  if (model.type === "grid") {
    const { x, y, width, height } = box;
    for (let gx = x + model.size; gx < x + width; gx += model.size) {
      result.lines.push([gx, y, gx, y + height]);
    }
    for (let gy = y + model.size; gy < y + height; gy += model.size) {
      result.lines.push([x, gy, x + width, gy]);
    }
    result.opacity = 0.12;
    return result;
  }

  const vertical = model.type === "columns";
  const span = vertical ? box.width : box.height;
  const start = vertical ? box.x : box.y;
  const inner = span - model.margin * 2;
  const usable = inner - model.gutter * (model.count - 1);
  if (inner <= 0 || usable <= 0) return result;
  const band = usable / model.count;

  for (let index = 0; index < model.count; index += 1) {
    const offset = start + model.margin + index * (band + model.gutter);
    result.bands.push(
      vertical
        ? { x: offset, y: box.y, width: band, height: box.height }
        : { x: box.x, y: offset, width: box.width, height: band },
    );
  }
  result.opacity = 0.08;
  return result;
}
