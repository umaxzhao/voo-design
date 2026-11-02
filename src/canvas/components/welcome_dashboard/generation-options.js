import { STYLE_KITS } from "../../agent/design_quality/style_kits.js";
import { DESIGN_SYSTEMS } from "../../design_systems.js";
import { AI_GEN_TYPES } from "./welcome_constants.js";

/** Picker metadata must not initialize design-system validators or font catalogs. */
export const DEFAULT_STYLE_ID = "auto";
export const DEFAULT_DESIGN_SYSTEM_ID = "auto";
export const AUTO_SIZE_ID = "auto";
/** Curated signature systems offered by the welcome composer. */
export const SIGNATURE_DESIGN_SYSTEM_IDS = Object.freeze(["axiom", "void-os", "bloom"]);
export const MAX_REFERENCE_IMAGES = 4;
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

/** Style options for the welcome picker, derived from the agent style kits. */
export function styleOptions() {
  return Object.values(STYLE_KITS).map((kit) => ({
    id: kit.id,
    name: kit.name,
    mood: kit.mood,
    swatch: [kit.palette.bg, kit.palette.surface, kit.palette.accent],
  }));
}

/** Unique canvas sizes offered by the size picker (preset defaults first). */
export function sizeOptions() {
  const seen = new Set();
  const sizes = [];
  for (const preset of AI_GEN_TYPES) {
    const id = `${preset.width}x${preset.height}`;
    if (seen.has(id)) continue;
    seen.add(id);
    sizes.push({ id, width: preset.width, height: preset.height });
  }
  return sizes;
}

/** Picker options: automatic routing first, then the signature collection. */
export function designSystemOptions(t = (key) => key) {
  return [
    { id: DEFAULT_DESIGN_SYSTEM_ID, label: t("designSystem.auto"), description: "" },
    ...SIGNATURE_DESIGN_SYSTEM_IDS.filter((id) => DESIGN_SYSTEMS[id]).map((id) => ({
      id,
      label: t(DESIGN_SYSTEMS[id].labelKey),
      description: t(DESIGN_SYSTEMS[id].descriptionKey),
    })),
  ];
}

export function designSystemById(id) {
  if (!id || id === DEFAULT_DESIGN_SYSTEM_ID) return null;
  const system = DESIGN_SYSTEMS[id];
  if (!system) throw new Error(`unknown-design-system:${id}`);
  return system;
}

export function presetById(id) {
  return AI_GEN_TYPES.find((preset) => preset.id === id) ?? AI_GEN_TYPES[0];
}

export function styleById(id) {
  if (!id || id === DEFAULT_STYLE_ID) return null;
  return STYLE_KITS[id] ?? null;
}

