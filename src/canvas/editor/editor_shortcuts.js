import { TOOL } from "./editor_constants.js";

/**
 * Figma/Photoshop-style single-key shortcuts shown in the tool button tooltips.
 * Single source of truth shared by tooltips, toolbar and the shortcuts cheatsheet.
 */
export const TOOL_SHORTCUTS = {
  [TOOL.SELECT]: "V",
  [TOOL.SELECT_REGION]: "⌘T",
  [TOOL.PERSPECTIVE]: "Q",
  [TOOL.MARQUEE]: "M",
  [TOOL.WAND]: "W",
  [TOOL.AI_SELECT]: "W",
  [TOOL.BRUSH]: "B",
  [TOOL.ERASER]: "E",
  [TOOL.HEALING]: "J",
  [TOOL.LASSO]: "L",
  [TOOL.RECT]: "R",
  [TOOL.ELLIPSE]: "O",
  [TOOL.ARROW]: "⇧L",
  [TOOL.PEN]: "P",
  [TOOL.FREE_PEN]: "⇧P",
  [TOOL.REGION]: "M",
  [TOOL.TEXT]: "T",
  [TOOL.CROP]: "C",
  [TOOL.DROPPER]: "I",
  [TOOL.FILL]: "G",
  [TOOL.GRADIENT]: "G",
};

// Kept under the old name so toolbar/tooltip tests can keep importing it while
// the actual cheatsheet data lives in the shared pure catalog.
export { DESIGN_SHORTCUT_GROUPS as SHORTCUT_GROUPS } from "../../shared/editor-shortcut-catalog.js";
