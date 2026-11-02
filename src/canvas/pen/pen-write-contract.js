import { NODE_KIND } from "../editor/scene_doc_factory.js";

/** The schema generation this writer emits. */
export const PEN_WRITE_VERSION = "2.20";

/** Layer kinds Pen can hold, in the editor's vocabulary. */
export const WRITABLE_KINDS = new Set([
  NODE_KIND.GROUP,
  NODE_KIND.RECT,
  NODE_KIND.ELLIPSE,
  NODE_KIND.TEXT,
  NODE_KIND.IMAGE,
  NODE_KIND.PATH,
]);

/** Region nodes are export markers, not design content; dropping them is not a loss. */
export const SILENT_KINDS = new Set([NODE_KIND.REGION]);

/** Gradient kinds Pen's schema cannot express. */
export const UNWRITABLE_GRADIENTS = new Set(["mesh", "diamond"]);

/** Effect keys Pen has no record for. */
export const WRITABLE_EFFECTS = new Set(["shadow", "innerShadow"]);

/** Node fields that bind a value to a document variable. */
export const BINDING_KEYS = [
  "fillVariableId",
  "strokeVariableId",
  "opacityVariableId",
  "cornerRadiusVariableId",
  "textVariableId",
  "gapVariableId",
  "paddingVariableId",
];

export const MAX_DEPTH = 64;
