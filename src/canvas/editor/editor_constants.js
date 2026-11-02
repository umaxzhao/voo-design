/**
 * Editor constants and viewport maths.
 *
 * Lives in its own module because both the engine and the pointer layer need
 * it, and importing it from the engine would make those two circular.
 */

import { marqueeCycleIds } from "./tool_families.js";
import { TOOL } from "./tool_ids.js";

export { TOOL };

/**
 * Figma-style single-key tool switches, keyed by `KeyboardEvent.code`.
 *
 * Lives here (not in use_editor_shortcuts.js) so the routing table can be
 * unit-tested without pulling React into Node.
 */
export const TOOL_KEYS = {
  KeyV: TOOL.SELECT,
  KeyF: TOOL.FRAME,
  KeyA: TOOL.SELECT,
  KeyQ: TOOL.PERSPECTIVE,
  KeyM: TOOL.MARQUEE,
  KeyZ: TOOL.REGION,
  // W arms the magic wand, matching the toolbar label and Photoshop (the
  // object-selection tool lives in the region menu, reachable with G).
  KeyW: TOOL.WAND,
  KeyB: TOOL.BRUSH,
  KeyE: TOOL.ERASER,
  KeyJ: TOOL.HEALING,
  KeyL: TOOL.LASSO,
  KeyR: TOOL.RECT,
  KeyO: TOOL.ELLIPSE,
  KeyP: TOOL.PEN,
  KeyT: TOOL.TEXT,
  KeyG: TOOL.FILL,
  KeyC: TOOL.CROP,
  KeyI: TOOL.DROPPER,
  // Hold Space still pans from any tool; H makes the hand tool persistent.
  KeyH: TOOL.HAND,
};

/**
 * Primary toolbar families. Pressing one of these keys again while a member
 * is active advances its child tool instead of falling back to the previous
 * tool. The same metadata drives keyboard routing without coupling it to UI
 * component state.
 */
export const TOOL_KEY_FAMILIES = {
  KeyA: {
    type: "tool",
    items: [TOOL.SELECT, TOOL.DISTORT, TOOL.PERSPECTIVE, TOOL.PUPPET_WARP],
  },
  KeyQ: {
    type: "tool",
    items: [
      TOOL.SELECT_REGION,
      TOOL.DISTORT,
      TOOL.PERSPECTIVE,
      TOOL.PUPPET_WARP,
    ],
  },
  KeyM: { type: "selection", items: marqueeCycleIds("KeyM") },
  KeyZ: { type: "selection", items: marqueeCycleIds("KeyZ") },
  KeyL: { type: "selection", items: marqueeCycleIds("KeyL") },
  KeyB: {
    type: "brush",
    items: ["normal", "smudge", "blur", "sharpen", "dodge", "burn", "sponge"],
  },
  KeyJ: { type: "healing", items: ["aiRepair", "spot", "patch", "clone"] },
  KeyP: { type: "tool", items: [TOOL.PEN, TOOL.CURVATURE_PEN, TOOL.FREE_PEN] },
  KeyF: { type: "tool", items: [TOOL.FRAME] },
  KeyR: {
    type: "tool",
    items: [
      TOOL.RECT,
      TOOL.ELLIPSE,
      TOOL.LINE,
      TOOL.POLYGON,
      TOOL.STAR,
      TOOL.ARROW,
    ],
  },
  KeyG: { type: "tool", items: [TOOL.FILL, TOOL.GRADIENT] },
};

/**
 * Resolves a primary toolbar key into its next child. Returning null leaves
 * the normal single-tool shortcut behaviour intact.
 */
export function cycleToolFamily({
  code,
  tool,
  marqueeMode = "rect",
  brushMode = "normal",
  healingMode = "aiRepair",
  selectionItems = null,
}) {
  const family = TOOL_KEY_FAMILIES[code];
  if (!family) return null;
  const items =
    family.type === "selection"
      ? (selectionItems ?? family.items)
      : family.items;
  const current =
    family.type === "tool"
      ? tool
      : family.type === "selection"
        ? tool === TOOL.REGION
          ? "region"
          : tool === TOOL.WAND
            ? "wand"
            : tool === TOOL.LASSO
              ? "lasso"
              : tool === TOOL.MARQUEE
                ? marqueeMode
                : null
        : family.type === "brush"
          ? tool === TOOL.BRUSH
            ? brushMode
            : null
          : tool === TOOL.HEALING
            ? healingMode
            : null;
  const index = items.indexOf(current);
  const item = items[index >= 0 ? (index + 1) % items.length : 0];
  if (family.type === "tool") return { tool: item };
  if (family.type === "selection") {
    if (item === "region") return { tool: TOOL.REGION };
    if (item === "lasso") return { tool: TOOL.LASSO };
    if (item === "wand") return { tool: TOOL.WAND };
    return { tool: TOOL.MARQUEE, marqueeMode: item };
  }
  if (family.type === "brush") return { tool: TOOL.BRUSH, brushMode: item };
  return { tool: TOOL.HEALING, healingMode: item };
}

/**
 * Shift-modified tool switches, Figma's bindings: ⇧P is the freehand pencil,
 * ⇧L the arrow. Keyed by `KeyboardEvent.code` like TOOL_KEYS; the shortcuts
 * hook consults this table first, so a shifted key never falls through to the
 * plain binding (⇧L must not arm the lasso).
 */
export const TOOL_SHIFT_KEYS = {
  KeyP: TOOL.FREE_PEN,
  KeyL: TOOL.ARROW,
};

/**
 * Photoshop's tool-toggle: pressing the active tool's key again returns to
 * the previously used tool (V → B → B → V). Lives here — like TOOL_KEYS —
 * so the routing rule can be unit-tested without pulling React into Node.
 *
 * @returns {{tool: string, lastTool: string|null}} the next tool to arm and
 *   the tool to remember as "previous" (the one being left).
 */
export function toggleToolKey(currentTool, pressedTool, lastTool) {
  // Select is the one exception to the toggle. It is the highest-frequency
  // tool and V is its direct key (A owns the family radial), so V must always
  // land on Select — bouncing back to the previous tool on a double tap makes
  // the most-used key the least predictable one. A press that changes nothing
  // keeps the existing toggle target rather than making Select its own.
  if (pressedTool === TOOL.SELECT) {
    return currentTool === TOOL.SELECT
      ? { tool: TOOL.SELECT, lastTool }
      : { tool: TOOL.SELECT, lastTool: currentTool };
  }
  if (pressedTool === TOOL.CROP) {
    return { tool: TOOL.CROP, lastTool };
  }
  if (pressedTool === currentTool && lastTool) {
    return { tool: lastTool, lastTool: currentTool };
  }
  return { tool: pressedTool, lastTool: currentTool };
}

/** Annotation colours — deliberately loud, since they are instructions to a model. */
export const MARK_COLORS = [
  "#ff3b30",
  "#ffcc00",
  "#34c759",
  "#0a84ff",
  "#ffffff",
];

/** The tool-options bar starts on black (Photoshop default: black foreground, white background); the picker takes it from there. */
export const DEFAULT_MARK_COLOR = "#D4D4D4";

export const DEFAULT_BRUSH_WIDTH = 12;

/**
 * The pen tool's stroke width for a freshly drawn path. Deliberately separate
 * from the annotation brush (12px): a vector outline starts hairline, Figma's
 * 1px default, and is fattened afterwards in the properties panel.
 */
export const DEFAULT_PEN_STROKE_WIDTH = 1;

/** Annotation-brush stroke width bounds — the tool-options slider agrees. */
export const BRUSH_WIDTH_MIN = 1;
export const BRUSH_WIDTH_MAX = 256;

/** Clamps a brush width to the slider's range; junk falls back to the default. */
export function clampBrushWidth(width) {
  const value = Number(width);
  if (!Number.isFinite(value)) return DEFAULT_BRUSH_WIDTH;
  return Math.min(
    BRUSH_WIDTH_MAX,
    Math.max(BRUSH_WIDTH_MIN, Math.round(value)),
  );
}

/** The tools whose strokes are drawn in the engine's current mark colour. */
export function toolUsesColor(tool) {
  return (
    tool === TOOL.BRUSH ||
    tool === TOOL.RECT ||
    tool === TOOL.FRAME ||
    tool === TOOL.ELLIPSE ||
    tool === TOOL.LINE ||
    tool === TOOL.POLYGON ||
    tool === TOOL.STAR ||
    tool === TOOL.ARROW
  );
}

/** Mask-brush diameter in mask pixels; the mask spans the image's natural size. */
export const DEFAULT_MASK_BRUSH_SIZE = 48;

/** Mask-brush size bounds — the panel slider and the [ ] shortcuts agree on them. */
export const MASK_BRUSH_MIN = 4;
export const MASK_BRUSH_MAX = 200;

/** Region-Remove brush size bounds — the panel slider agrees (editor_engine clamps with them). */
export const REMOVE_BRUSH_MIN = 4;
export const REMOVE_BRUSH_MAX = 400;
export const DEFAULT_REMOVE_BRUSH_SIZE = 48;

/** Keyboard step for the [ and ] mask-brush shortcuts. */
export const MASK_BRUSH_STEP = 4;

/** Keyboard step for the [ and ] annotation-brush width shortcuts. */
export const BRUSH_WIDTH_STEP = 4;

/** Keyboard step for the Shift+[ / Shift+] brush-hardness shortcuts (0..1). */
export const BRUSH_HARDNESS_STEP = 0.1;

/**
 * Routes the [ and ] bracket keys between the two brushes.
 *
 * Precedence: an active mask edit always wins — the mask brush has no
 * hardness, so Shift does not reroute while one is armed. Otherwise an armed
 * brush tool takes width, or hardness with Shift held (Photoshop's binding).
 * Anything else is a no-op and the key keeps its default behaviour.
 */
export function bracketBrushAdjustment({
  maskEditActive,
  brushTool,
  shiftKey,
  grow,
}) {
  if (maskEditActive) {
    return { target: "mask", delta: grow ? MASK_BRUSH_STEP : -MASK_BRUSH_STEP };
  }
  if (!brushTool) return null;
  if (shiftKey) {
    return {
      target: "hardness",
      delta: grow ? BRUSH_HARDNESS_STEP : -BRUSH_HARDNESS_STEP,
    };
  }
  return {
    target: "width",
    delta: grow ? BRUSH_WIDTH_STEP : -BRUSH_WIDTH_STEP,
  };
}

/**
 * Figma's plain-[ / ] layer ordering: one step backward / forward through the
 * stack. Returns null whenever the brackets already belong to a brush context
 * (an active mask edit or an armed brush tool — Photoshop's sizing binding),
 * when a modifier is held, or when nothing is selected, so the two schemes
 * never fight over the same keys. `grow` is ] (forward), `!grow` is [.
 */
export function bracketReorderDirection({
  maskEditActive,
  brushTool,
  hasSelection,
  shiftKey,
  altKey,
  grow,
}) {
  if (maskEditActive || brushTool || shiftKey || altKey || !hasSelection) {
    return null;
  }
  return grow ? 1 : -1;
}

// Low enough that zoom-to-fit can frame a large imported page (e.g. a 46000 px frame).
export const ZOOM_MIN = 0.01;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;

/** Stage padding (px) left around the page when zooming to fit. */
export const FIT_PADDING = 96;

/**
 * How far (screen px) the pointer travels before a press turns into a drag.
 * Measured on screen rather than in the document so the slack is the same at
 * every zoom: a plain click never nudges a node out of place, however far in
 * the canvas is zoomed.
 */
export const DRAG_SLOP_PX = 4;

export function clampZoom(zoom) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * The backing-store pixel a document point lands on.
 *
 * The stage canvas is sized at devicePixelRatio, and getImageData reads
 * device pixels ignoring any transform, so the eyedropper maps doc → screen
 * (the same maths the scene transform uses) and then multiplies by the dpr.
 */
export function canvasPixelAt(point, viewport, dpr) {
  const scale = dpr || 1;
  return {
    x: Math.round((point.x * viewport.zoom + viewport.panX) * scale),
    y: Math.round((point.y * viewport.zoom + viewport.panY) * scale),
  };
}

/** Scale that fits the document inside the stage, never past 100%. */
export function fitScale(stageWidth, stageHeight, docWidth, docHeight) {
  if (!stageWidth || !stageHeight || !docWidth || !docHeight) return 1;
  const padding = Math.min(
    FIT_PADDING,
    Math.min(stageWidth, stageHeight) * 0.2,
  );
  const scale = Math.min(
    (stageWidth - padding) / docWidth,
    (stageHeight - padding) / docHeight,
    1,
  );
  return clampZoom(scale);
}

/** Figma-style wheel/pinch zoom: exponential, so trackpads and mice both feel right. */
export function wheelZoomFactor(deltaY) {
  return 0.999 ** deltaY;
}

/** Plain wheel pans; Shift turns a vertical scroll horizontal. */
export function wheelPanDelta(event) {
  const { deltaX, deltaY, shiftKey } = event;
  // `-delta || 0` normalises -0 so callers never see it.
  if (shiftKey && deltaX === 0) return { dx: -deltaY || 0, dy: 0 };
  return { dx: -deltaX || 0, dy: -deltaY || 0 };
}
