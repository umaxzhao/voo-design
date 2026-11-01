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

let presetSeq = 0;
export const createExportPreset = (patch = {}) => ({
  id: `preset-${++presetSeq}`,
  type: "image/png",
  scale: 1,
  suffix: "",
  ...patch,
});

const FORMAT_VALUES = new Set(FORMATS.map((format) => format.value));

/** Node-stored export presets survive selection changes; bad rows are ignored. */
export function normalizeExportPresets(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const rows = raw
    .slice(0, MAX_PRESETS)
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      id: typeof row.id === "string" && row.id ? row.id : `preset-${++presetSeq}`,
      type: FORMAT_VALUES.has(row.type) ? row.type : "image/png",
      scale: SCALES.includes(Number(row.scale)) ? Number(row.scale) : 1,
      suffix: typeof row.suffix === "string" ? row.suffix.slice(0, 32) : "",
      ...(row.transparent === false ? { transparent: false } : {}),
      ...(row.type !== "image/png" && row.quality != null
        ? { quality: String(row.quality) }
        : {}),
    }));
  return rows;
}


/** Adding/removing a preset is one history entry; text edits may coalesce. */
export function updateExportPresets(engine, nodeId, presets, coalesced = false) {
  if (!nodeId) return;
  const update = coalesced
    ? engine?.updateNodeCoalesced ?? engine?.updateNode
    : engine?.updateNode ?? engine?.updateNodeCoalesced;
  update?.(nodeId, { exportPresets: presets });
}

