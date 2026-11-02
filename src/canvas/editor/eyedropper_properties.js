/**
 * Eyedropper sampling property model — pure, node:test-drivable.
 *
 * The eyedropper has per-sample-mode controls (sample range, whether to sample
 * from all visible layers, and whether a sampling ring is shown). Each mode
 * exposes exactly its own field set — no leakage, no aliasing — mirroring the
 * healing/brush property model.
 */

/** Sample modes keyed by the engine's 0..4 sample-size value (1×1…31×31). */
export const DROPPER_SAMPLE_MODES = {
  0: { labelKey: "editor.dropper.sample1x1", fields: ["sampleRange"] },
  1: {
    labelKey: "editor.dropper.sample3x3",
    fields: ["sampleRange", "showSampleRing"],
  },
  2: {
    labelKey: "editor.dropper.sample5x5",
    fields: ["sampleRange", "sampleLayers", "showSampleRing"],
  },
  3: {
    labelKey: "editor.dropper.sample11x11",
    fields: ["sampleRange", "sampleLayers", "showSampleRing"],
  },
  4: {
    labelKey: "editor.dropper.sample31x31",
    fields: ["sampleRange", "sampleLayers", "showSampleRing"],
  },
};

/** Fallback for an unknown sample value: the point picker controls. */
const DEFAULT_DROPPER_FIELDS = ["sampleRange"];

/** The field keys a sample mode exposes, in a stable order. */
export function dropperModeFields(sampleSize) {
  const mode = DROPPER_SAMPLE_MODES[Number(sampleSize)] ?? null;
  return mode ? [...mode.fields] : [...DEFAULT_DROPPER_FIELDS];
}

/** Whether a sample mode exposes a given field key. */
export function dropperModeHas(sampleSize, key) {
  return dropperModeFields(sampleSize).includes(key);
}

/** Every dropper control the property model knows. */
export const DROPPER_FIELD_KEYS = [
  "sampleRange",
  "sampleLayers",
  "showSampleRing",
];

/**
 * The eyedropper's three sample-source choices. Each value is its own state —
 * "current" (active layer), "below" (active + layers beneath it), "all"
 * (every visible layer). They never alias each other or the ring flag.
 */
export const DROPPER_SOURCE_KEYS = ["current", "below", "all"];

/** The source used when none is set (the safest: the active layer). */
export const DROPPER_SOURCE_DEFAULT = "current";

/** Normalise a dropper source value to a known one (falls back to "current"). */
export function dropperSourceValue(value) {
  return DROPPER_SOURCE_KEYS.includes(value) ? value : DROPPER_SOURCE_DEFAULT;
}

/** Whether a sample mode shows the all-layers source picker. */
export function dropperSourceShown(sampleSize) {
  return dropperModeHas(sampleSize, "sampleLayers");
}

/** Whether a sample mode shows the sampling-ring toggle. */
export function dropperRingShown(sampleSize) {
  return dropperModeHas(sampleSize, "showSampleRing");
}

/**
 * Which nodes participate in sampling at a point, for a given Source mode.
 * `nodes` is the document array in paint order (later = on top). `point` is in
 * document coordinates.
 *   - "current" — only the topmost node under the point.
 *   - "below"   — the topmost node under the point plus every node beneath it.
 *   - "all"     — every node under the point (all visible layers at that pixel).
 */
export function sampleSourceNodes(nodes, sourceMode, point) {
  const hits = (nodes ?? [])
    .map((node, index) => ({ node, index }))
    .filter(
      ({ node }) =>
        node.x <= point.x &&
        point.x <= node.x + node.width &&
        node.y <= point.y &&
        point.y <= node.y + node.height,
    );
  if (hits.length === 0) return [];
  const topIndex = Math.max(...hits.map((entry) => entry.index));
  if (sourceMode === "all") return hits.map((entry) => entry.node);
  if (sourceMode === "below")
    return hits
      .filter((entry) => entry.index <= topIndex)
      .map((entry) => entry.node);
  return [hits.find((entry) => entry.index === topIndex).node];
}

/**
 * The averaged sampled colour for a Source mode. `colorOf(node)` supplies a
 * node's own colour at the point (the engine passes a real pixel reader; a test
 * injects one). This is the piece that makes "current"/"below"/"all" actually
 * differ — each source averages a different set of layers, so a two-layer
 * document reads one colour for "current" and the blend of both for "all".
 */
export function sourceSampleColor(nodes, sourceMode, point, colorOf) {
  const sources = sampleSourceNodes(nodes, sourceMode, point);
  const colors = [];
  for (const node of sources) {
    const rgb = colorOf?.(node);
    if (rgb) colors.push(rgb);
  }
  if (colors.length === 0) return null;
  const hex = (value) => Math.round(value).toString(16).padStart(2, "0");
  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of colors) {
    r += color.r;
    g += color.g;
    b += color.b;
  }
  return `#${hex(r / colors.length)}${hex(g / colors.length)}${hex(b / colors.length)}`;
}
