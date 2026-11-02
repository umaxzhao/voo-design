import { isCssGradient, parseGradient } from "../color_picker/gradient_fill.js";
import { NODE_KIND } from "../editor/scene_doc_factory.js";
import { normalizeStrokeProps, STROKE_DASH, WIDTH_PROFILE } from "../editor/stroke_style.js";
import { WRITABLE_KINDS, SILENT_KINDS, UNWRITABLE_GRADIENTS, WRITABLE_EFFECTS, BINDING_KEYS } from "./pen-write-contract.js";

/* ------------------------------------------------------------------ *
 * Losses
 * ------------------------------------------------------------------ */

function isUnwritablePaint(value) {
  if (typeof value !== "string" || !value || !isCssGradient(value)) return false;
  return UNWRITABLE_GRADIENTS.has(parseGradient(value)?.type);
}

function hasUnwritableFill(node) {
  const paints = Array.isArray(node.fills)
    ? node.fills.map((paint) => paint?.fill)
    : [node.fill];
  if (paints.some(isUnwritablePaint) || isUnwritablePaint(node.stroke)) return true;
  return (
    Array.isArray(node.strokes) &&
    node.strokes.some((stroke) => isUnwritablePaint(stroke?.stroke ?? stroke?.fill))
  );
}

function hasUnwritableEffects(node) {
  const effects = node.effects;
  if (!effects || typeof effects !== "object") return false;
  return Object.entries(effects).some(
    ([key, value]) => !WRITABLE_EFFECTS.has(key) && value?.enabled,
  );
}

function hasUnwritableStructure(node) {
  if (node.autoLayout) return true;
  if (node.maskBase || node.maskType) return true;
  if (node.clipTo && !(node.kind === NODE_KIND.GROUP && node.isFrame)) return true;
  const props = normalizeStrokeProps(node);
  if (props.dash !== STROKE_DASH.SOLID) return true;
  if (props.profile !== WIDTH_PROFILE.UNIFORM) return true;
  return BINDING_KEYS.some((key) => Boolean(node[key]));
}

/**
 * What a Pen save of this page would drop, as `{ key, params }` entries. Kept
 * next to `buildPenDocument` so the warning and the file never disagree.
 */
export function penSaveLosses(sceneDoc, { pageCount } = {}) {
  const losses = [];
  if (pageCount > 1) losses.push({ key: "save.loss.pages" });

  const background = sceneDoc?.backgroundColor;
  if (typeof background === "string" && background && background !== "transparent") {
    losses.push({ key: "pen.save.lossBackground" });
  }

  const nodes = (Array.isArray(sceneDoc?.nodes) ? sceneDoc.nodes : []).filter(
    (node) => node && node.visible !== false,
  );

  const kinds = new Set();
  let fills = 0;
  let effects = 0;
  let structure = 0;
  for (const node of nodes) {
    if (!WRITABLE_KINDS.has(node.kind)) {
      if (!SILENT_KINDS.has(node.kind)) kinds.add(node.kind);
      continue;
    }
    if (hasUnwritableFill(node)) fills += 1;
    if (hasUnwritableEffects(node)) effects += 1;
    if (hasUnwritableStructure(node)) structure += 1;
  }

  if (kinds.size > 0) {
    losses.push({ key: "pen.save.lossKinds", params: { kinds: [...kinds].join(", ") } });
  }
  if (fills > 0) losses.push({ key: "pen.save.lossFills", params: { count: fills } });
  if (effects > 0) {
    losses.push({ key: "pen.save.lossEffects", params: { count: effects } });
  }
  if (structure > 0) {
    losses.push({ key: "pen.save.lossStructure", params: { count: structure } });
  }
  return losses;
}
