/** Explicit layer export configuration shared by both inspector entries. */

export const FORMATS = [
  { value: "image/png", labelKey: "editor.exportFormatPng", ext: "png" },
  { value: "image/jpeg", labelKey: "editor.exportFormatJpeg", ext: "jpg" },
  { value: "image/webp", labelKey: "editor.exportFormatWebp", ext: "webp" },
];
export const SCALES = [1, 2, 3];
export const QUALITIES = [
  { value: "0.6", labelKey: "editor.exportQualityLow" },
  { value: "0.8", labelKey: "editor.exportQualityMedium" },
  { value: "0.92", labelKey: "editor.exportQualityHigh" },
];
export const MAX_PRESETS = 4;

const hasPresetId = (id) => typeof id === "string" && id.trim().length > 0;

/** IDs belong to one node's persisted list, never a module-session counter. */
function availablePresetId(reserved) {
  let index = 1;
  while (reserved.has(`preset-${index}`)) index += 1;
  return `preset-${index}`;
}

export function createExportPreset(patch = {}, existing = []) {
  const reserved = new Set(existing.map((row) => row?.id).filter(hasPresetId));
  const id =
    hasPresetId(patch.id) && !reserved.has(patch.id)
      ? patch.id
      : availablePresetId(reserved);
  return { type: "image/png", scale: 1, suffix: "", ...patch, id };
}

const FORMAT_VALUES = new Set(FORMATS.map((format) => format.value));

/** Node-stored export presets survive selection changes; bad rows are ignored. */
export function normalizeExportPresets(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const candidates = raw
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .slice(0, MAX_PRESETS);
  // Reserve later valid IDs too, so repairing an earlier row cannot steal one.
  const reserved = new Set(candidates.map((row) => row.id).filter(hasPresetId));
  const assigned = new Set();
  const rows = candidates.map((row) => {
    const id =
      hasPresetId(row.id) && !assigned.has(row.id)
        ? row.id
        : availablePresetId(reserved);
    reserved.add(id);
    assigned.add(id);
    return {
      id,
      type: FORMAT_VALUES.has(row.type) ? row.type : "image/png",
      scale: SCALES.includes(Number(row.scale)) ? Number(row.scale) : 1,
      suffix: typeof row.suffix === "string" ? row.suffix.slice(0, 32) : "",
      ...(row.transparent === false ? { transparent: false } : {}),
      ...(row.type !== "image/png" && row.quality != null
        ? { quality: String(row.quality) }
        : {}),
    };
  });
  return rows;
}

/** Adding/removing a preset is one history entry; text edits may coalesce. */
export function updateExportPresets(
  engine,
  nodeId,
  presets,
  coalesced = false,
) {
  if (!nodeId) return;
  const update = coalesced
    ? (engine?.updateNodeCoalesced ?? engine?.updateNode)
    : (engine?.updateNode ?? engine?.updateNodeCoalesced);
  update?.(nodeId, { exportPresets: presets });
}
