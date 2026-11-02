import { TOOL } from "./tool_ids.js";

export const MARQUEE_TOOL_ITEMS = Object.freeze([
  Object.freeze({
    id: "region",
    toolId: TOOL.REGION,
    interaction: "objectSelection",
    icon: "objectSelection",
    labelKey: "editor.tool.region",
    isAi: true,
    shortcut: "M",
  }),
  Object.freeze({
    id: "lasso",
    toolId: TOOL.LASSO,
    interaction: "maskLasso",
    icon: "selectionFree",
    labelKey: "editor.selection.lasso",
    shortcut: "L",
  }),
  Object.freeze({
    id: "rect",
    toolId: TOOL.MARQUEE,
    interaction: "pixelMarquee",
    icon: "selectionRect",
    labelKey: "editor.selection.rect",
    shortcut: "M",
  }),
  Object.freeze({
    id: "ellipse",
    toolId: TOOL.MARQUEE,
    interaction: "pixelMarquee",
    icon: "selectionEllipse",
    labelKey: "editor.selection.ellipse",
    shortcut: "M",
  }),
  Object.freeze({
    id: "poly",
    toolId: TOOL.MARQUEE,
    interaction: "polygonLasso",
    icon: "selectionPolygon",
    labelKey: "editor.selection.poly",
    shortcut: "M",
  }),
  Object.freeze({
    id: "magnetic",
    toolId: TOOL.MARQUEE,
    interaction: "magneticLasso",
    icon: "selectionMagnetic",
    labelKey: "editor.selection.magneticLasso",
    shortcut: "L",
  }),
  Object.freeze({
    id: "wand",
    toolId: TOOL.WAND,
    interaction: "magicWand",
    icon: "wand",
    labelKey: "editor.selection.wand",
    shortcut: "W",
  }),
]);

export const MARQUEE_MODE_IDS = Object.freeze(
  MARQUEE_TOOL_ITEMS.map((item) => item.id),
);

export const MARQUEE_FAMILY_ITEMS = Object.freeze(
  MARQUEE_TOOL_ITEMS.filter((item) => ["region", "wand", "rect", "ellipse"].includes(item.id)),
);

export const LASSO_FAMILY_ITEMS = Object.freeze(
  MARQUEE_TOOL_ITEMS.filter(
    (item) => item.id === "lasso" || item.id === "poly" || item.id === "magnetic",
  ),
);

export function marqueeItemForMode(mode) {
  return MARQUEE_TOOL_ITEMS.find((item) => item.id === mode) ?? null;
}

export function normalizeMarqueeMode(mode) {
  return marqueeItemForMode(mode)?.id ?? "rect";
}

export function marqueeCycleIds(code) {
  const ids = MARQUEE_MODE_IDS.slice();
  if (code !== "KeyL") return ids;
  return ["lasso", ...ids.filter((id) => id !== "lasso")];
}

/**
 * Metadata definition for each tool family.
 * Shared across the properties panel and keyboard pie menu.
 */
export const TOOL_FAMILIES = {
  select: {
    id: "select",
    // A opens the family radial; V is a direct shortcut for the Select tool
    // itself (the highest-frequency tool — a pie menu on it costs a hold and a
    // pointer move on every single use), so V is deliberately not a family key.
    key: "A",
    codes: ["KeyA", "KeyQ"],
    code: "KeyA",
    matchTool: (tool) =>
      [
        TOOL.SELECT,
        TOOL.DISTORT,
        TOOL.PERSPECTIVE,
        TOOL.PUPPET_WARP,
        TOOL.SELECT_REGION,
      ].includes(tool),
    items: [
      {
        id: TOOL.SELECT,
        icon: "cursor",
        labelKey: "editor.tool.select",
        shortcut: "V",
      },
      {
        id: TOOL.DISTORT,
        icon: "distort",
        labelKey: "editor.tool.distort",
        shortcut: "Q",
      },
      {
        id: TOOL.PERSPECTIVE,
        icon: "perspective",
        labelKey: "editor.tool.perspective",
        shortcut: "Q",
      },
      {
        id: TOOL.PUPPET_WARP,
        icon: "pin",
        labelKey: "editor.tool.puppetWarp",
        shortcut: "Q",
      },
    ],
    isActiveItem: (item, { tool }) => tool === item.id,
    applyItem: (item, { onTool }) => onTool(item.id),
  },

  marquee: {
    id: "marquee",
    key: "M",
    codes: ["KeyM"],
    code: "KeyM",
    matchTool: (tool) => [TOOL.MARQUEE, TOOL.REGION, TOOL.WAND].includes(tool),
    items: MARQUEE_FAMILY_ITEMS,
    isActiveItem: (item, { tool, marqueeMode }) =>
      item.toolId === tool && (item.toolId !== TOOL.MARQUEE || marqueeMode === item.id),
    applyItem: (item, { onTool, onMarqueeMode }) => {
      if (item.toolId !== TOOL.MARQUEE) {
        onTool(item.toolId);
        return;
      }
      onMarqueeMode?.(item.id);
      onTool(TOOL.MARQUEE);
    },
  },

  lasso: {
    id: "lasso",
    key: "L",
    codes: ["KeyL"],
    code: "KeyL",
    matchTool: (tool, marqueeMode = null) =>
      tool === TOOL.LASSO ||
      (tool === TOOL.MARQUEE &&
        (marqueeMode === "poly" || marqueeMode === "magnetic")),
    items: LASSO_FAMILY_ITEMS,
    isActiveItem: (item, { tool, marqueeMode }) =>
      item.id === "lasso"
        ? tool === TOOL.LASSO
        : tool === TOOL.MARQUEE && marqueeMode === item.id,
    applyItem: (item, { onTool, onMarqueeMode }) => {
      if (item.id === "lasso") {
        onTool(TOOL.LASSO);
      } else {
        onMarqueeMode?.(item.id);
        onTool(TOOL.MARQUEE);
      }
    },
  },

  brush: {
    id: "brush",
    key: "B",
    codes: ["KeyB"],
    code: "KeyB",
    matchTool: (tool) => tool === TOOL.BRUSH,
    items: [
      {
        id: "normal",
        icon: "brush",
        labelKey: "editor.brushMode.normal",
        shortcut: "B",
      },
      {
        id: "smudge",
        icon: "pointer",
        labelKey: "editor.brushMode.smudge",
        shortcut: "B",
      },
      {
        id: "blur",
        icon: "droplet",
        labelKey: "editor.brushMode.blur",
        shortcut: "B",
      },
      {
        id: "sharpen",
        icon: "cone",
        labelKey: "editor.brushMode.sharpen",
        shortcut: "B",
      },
      {
        id: "dodge",
        icon: "sun",
        labelKey: "editor.brushMode.dodge",
        shortcut: "B",
      },
      {
        id: "burn",
        icon: "moon",
        labelKey: "editor.brushMode.burn",
        shortcut: "B",
      },
      {
        id: "sponge",
        icon: "palette",
        labelKey: "editor.brushMode.sponge",
        shortcut: "B",
      },
    ],
    isActiveItem: (item, { tool, brushMode }) =>
      tool === TOOL.BRUSH && brushMode === item.id,
    applyItem: (item, { onTool, onBrushMode, tool }) => {
      onBrushMode?.(item.id);
      if (tool !== TOOL.BRUSH) onTool(TOOL.BRUSH);
    },
  },

  healing: {
    id: "healing",
    key: "J",
    codes: ["KeyJ", "KeyS"],
    code: "KeyJ",
    matchTool: (tool) => tool === TOOL.HEALING,
    items: [
      {
        id: "aiRepair",
        icon: "healAi",
        labelKey: "editor.tool.aiRepair",
        isAi: true,
        shortcut: "J",
      },
      {
        id: "spot",
        icon: "healSpot",
        labelKey: "editor.tool.spotHealing",
        shortcut: "J",
      },
      {
        id: "patch",
        icon: "healPatch",
        labelKey: "editor.tool.patch",
        shortcut: "J",
      },
      {
        id: "clone",
        icon: "healClone",
        labelKey: "editor.tool.clone",
        shortcut: "S",
      },
    ],
    isActiveItem: (item, { tool, healingMode }) =>
      tool === TOOL.HEALING && healingMode === item.id,
    applyItem: (item, { onTool, onHealingMode, tool }) => {
      onHealingMode?.(item.id);
      if (tool !== TOOL.HEALING) onTool(TOOL.HEALING);
    },
  },

  pen: {
    id: "pen",
    key: "P",
    codes: ["KeyP"],
    code: "KeyP",
    matchTool: (tool) =>
      [TOOL.PEN, TOOL.CURVATURE_PEN, TOOL.FREE_PEN].includes(tool),
    items: [
      {
        id: TOOL.PEN,
        icon: "pen",
        labelKey: "editor.tool.pen",
        shortcut: "P",
      },
      {
        id: TOOL.CURVATURE_PEN,
        icon: "sparkle",
        labelKey: "editor.tool.curvaturePen",
        shortcut: "P",
      },
      {
        id: TOOL.FREE_PEN,
        icon: "edit",
        labelKey: "editor.tool.freePen",
        shortcut: "⇧P",
      },
    ],
    isActiveItem: (item, { tool }) => tool === item.id,
    applyItem: (item, { onTool }) => onTool(item.id),
  },

  shapes: {
    id: "shapes",
    key: "R",
    codes: ["KeyR", "KeyO"],
    code: "KeyR",
    matchTool: (tool) =>
      [
        TOOL.RECT,
        TOOL.ELLIPSE,
        TOOL.LINE,
        TOOL.POLYGON,
        TOOL.STAR,
        TOOL.ARROW,
      ].includes(tool),
    items: [
      {
        id: TOOL.RECT,
        icon: "square",
        labelKey: "editor.tool.rect",
        shortcut: "R",
      },
      {
        id: TOOL.ELLIPSE,
        icon: "circle",
        labelKey: "editor.tool.ellipse",
        shortcut: "O",
      },
      {
        id: TOOL.LINE,
        icon: "slash",
        labelKey: "editor.tool.line",
      },
      {
        id: TOOL.POLYGON,
        icon: "triangle",
        labelKey: "editor.tool.polygon",
      },
      {
        id: TOOL.STAR,
        icon: "star",
        labelKey: "editor.tool.star",
      },
      {
        id: TOOL.ARROW,
        icon: "arrowUpRight",
        labelKey: "editor.tool.arrow",
        shortcut: "⇧L",
      },
    ],
    isActiveItem: (item, { tool }) => tool === item.id,
    applyItem: (item, { onTool }) => onTool(item.id),
  },

  fill: {
    id: "fill",
    key: "G",
    codes: ["KeyG"],
    code: "KeyG",
    matchTool: (tool) => [TOOL.FILL, TOOL.GRADIENT].includes(tool),
    items: [
      {
        id: TOOL.FILL,
        icon: "bucket",
        labelKey: "editor.tool.fill",
        shortcut: "G",
      },
      {
        id: TOOL.GRADIENT,
        icon: "gradient",
        labelKey: "editor.tool.gradient",
        shortcut: "G",
      },
    ],
    isActiveItem: (item, { tool }) => tool === item.id,
    applyItem: (item, { onTool }) => onTool(item.id),
  },
};

/**
 * The member a family key pre-selects when the radial opens and the pointer
 * never leaves the dead zone. Without it, the first item in the family wins
 * (so a lone W press would arm Rectangle rather than the Wand it names).
 */
export const PIE_DEFAULT_ITEM_BY_CODE = Object.freeze({
  KeyA: TOOL.SELECT,
  KeyQ: TOOL.PERSPECTIVE,
  KeyW: "wand",
  KeyZ: "region",
  KeyM: "rect",
  KeyL: "lasso",
  KeyB: "normal",
  KeyJ: "aiRepair",
  KeyP: TOOL.PEN,
  KeyR: TOOL.RECT,
  KeyO: TOOL.ELLIPSE,
  KeyG: TOOL.FILL,
});

/**
 * Find the tool family associated with a keyboard event code.
 */
export function getFamilyByCode(code) {
  switch (code) {
    // KeyV is absent on purpose: it falls through to TOOL_KEYS and switches
    // straight to the Select tool without opening the radial.
    case "KeyA":
    case "KeyQ":
      return TOOL_FAMILIES.select;
    case "KeyZ":
    case "KeyM":
    case "KeyW":
      return TOOL_FAMILIES.marquee;
    case "KeyL":
      return TOOL_FAMILIES.lasso;
    case "KeyG":
      return TOOL_FAMILIES.fill;
    case "KeyB":
      return TOOL_FAMILIES.brush;
    case "KeyJ":
    case "KeyS":
      return TOOL_FAMILIES.healing;
    case "KeyP":
      return TOOL_FAMILIES.pen;
    case "KeyR":
    case "KeyO":
      return TOOL_FAMILIES.shapes;
    default:
      return null;
  }
}

/**
 * Find the tool family associated with a tool id.
 */
export function getFamilyByTool(tool) {
  for (const family of Object.values(TOOL_FAMILIES)) {
    if (family.matchTool(tool)) return family;
  }
  return null;
}
