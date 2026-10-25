/**
 * Lightweight scene document and image node factories.
 *
 * Separated from scene_model.js so workflow actions, node reducers, and initial
 * canvas store initialization do not pull in the entire 80 KB scene model,
 * geometric transformations, raster engines, and adjustment pipelines.
 */

export const DOC_VERSION = 2;

// Canvas type is additive in v2 so previously saved documents remain readable.
export const CANVAS_TYPE = Object.freeze({
  DESIGN: "design",
});

export const NODE_KIND = Object.freeze({
  IMAGE: "image",
  RECT: "rect",
  ELLIPSE: "ellipse",
  PATH: "path",
  TEXT: "text",
  REGION: "region",
  BOOLEAN: "boolean",
  GROUP: "group",
  ADJUSTMENT: "adjustment",
  /** Footage on the canvas: a playable video layer with its own frame. */
  VIDEO: "video",
  CANVAS_INSTANCE: "canvasInstance",
});

export const DEFAULT_BLEND_MODE = "source-over";

export function newId() {
  return crypto.randomUUID();
}

export function createDefaultAdjustments() {
  return {
    brightness: { enabled: true, value: 0 },
    contrast: { enabled: true, value: 0 },
    hue: { enabled: true, value: 0, colorize: false, bands: null },
    saturation: { enabled: true, value: 0 },
    lightness: { enabled: true, value: 0 },
    exposure: { enabled: true, value: 0 },
    temperature: { enabled: true, value: 0 },
    tint: { enabled: true, value: 0 },
    highlights: { enabled: true, value: 0 },
    shadows: { enabled: true, value: 0 },
    vignette: { enabled: true, value: 0 },
    blur: { enabled: true, value: 0 },
    sharpen: { enabled: true, value: 0 },
    clarity: { enabled: true, value: 0 },
    highPass: { enabled: true, value: 0 },
    motionBlur: { enabled: true, value: 0, angle: 0 },
    noise: { enabled: true, value: 0 },
    clouds: { enabled: true, value: 0 },
    pixelate: { enabled: true, value: 0 },
    posterize: { enabled: true, value: 0 },
    solarize: { enabled: true, value: 0 },
    halftone: { enabled: true, value: 0 },
    sepia: { enabled: true, value: 0 },
    emboss: { enabled: true, value: 0 },
    median: { enabled: true, value: 0 },
    bloom: { enabled: true, value: 0 },
    zoomBlur: { enabled: true, value: 0 },
    twirl: { enabled: true, value: 0 },
    denoise: { enabled: true, value: 0 },
    defringe: { enabled: true, value: 0 },
    hazeRemoval: { enabled: true, value: 0 },
    diffuseGlow: { enabled: true, value: 0 },
    unsharpMask: { enabled: true, value: 0 },
    levels: {
      enabled: true,
      black: 0,
      white: 100,
      gamma: 1,
      outBlack: 0,
      outWhite: 100,
    },
    invert: { enabled: false },
    threshold: { enabled: false, value: 128 },
    colorBalance: {
      enabled: true,
      preserveLuminosity: true,
      shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
      midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
      highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 },
    },
    blackAndWhite: {
      enabled: false,
      reds: 40,
      yellows: 60,
      greens: 40,
      cyans: 60,
      blues: 20,
      magentas: 80,
      useTint: false,
      tintColor: "#ffffff",
    },
    photoFilter: {
      enabled: true,
      color: "#f5a623",
      density: 0,
      preserveLuminosity: true,
    },
    vibrance: { enabled: true, value: 0 },
    channelMixer: {
      enabled: true,
      monochrome: false,
      red: { red: 100, green: 0, blue: 0, constant: 0 },
      green: { red: 0, green: 100, blue: 0, constant: 0 },
      blue: { red: 0, green: 0, blue: 100, constant: 0 },
      gray: { red: 40, green: 40, blue: 20, constant: 0 },
    },
    selectiveColor: {
      enabled: true,
      mode: "relative",
      reds: { c: 0, m: 0, y: 0, k: 0 },
      yellows: { c: 0, m: 0, y: 0, k: 0 },
      greens: { c: 0, m: 0, y: 0, k: 0 },
      cyans: { c: 0, m: 0, y: 0, k: 0 },
      blues: { c: 0, m: 0, y: 0, k: 0 },
      magentas: { c: 0, m: 0, y: 0, k: 0 },
      whites: { c: 0, m: 0, y: 0, k: 0 },
      neutrals: { c: 0, m: 0, y: 0, k: 0 },
      blacks: { c: 0, m: 0, y: 0, k: 0 },
    },
    gradientMap: {
      enabled: false,
      reverse: false,
      stops: [
        { color: "#000000", location: 0 },
        { color: "#ffffff", location: 1 },
      ],
    },
    curves: {
      enabled: true,
      luminance: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      r: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      g: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      b: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    // Non-destructive live filter stack (Affinity Live Filters); empty = none.
    liveFilters: [],
  };
}

export function getBaseDefaults() {
  return {
    opacity: 1,
    visible: true,
    locked: false,
    lockPosition: false,
    lockImagePixels: false,
    blendMode: DEFAULT_BLEND_MODE,
    rotation: 0,
    shear: 0,
    clipTo: null,
    adjustments: createDefaultAdjustments(),
    effects: null,
    prompt: "",
  };
}

export function createDocument(
  width,
  height,
  backgroundColor = "transparent",
  options = {},
) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Canvas options must be an object");
  }
  const canvasType = options.canvasType ?? CANVAS_TYPE.DESIGN;
  if (!Object.values(CANVAS_TYPE).includes(canvasType)) {
    throw new RangeError("Unsupported canvas type");
  }
  const canvasId = options.canvasId ?? newId();
  if (typeof canvasId !== "string" || !canvasId.trim()) {
    throw new TypeError("Canvas ID must be a non-empty string");
  }
  return {
    version: DOC_VERSION,
    canvasId: canvasId.trim(),
    canvasType,
    width,
    height,
    backgroundColor,
    nodes: [],
  };
}

export function createImageNode({
  x,
  y,
  width,
  height,
  imageId,
  src,
  locked = false,
  name = null,
}) {
  return {
    ...getBaseDefaults(),
    id: newId(),
    kind: NODE_KIND.IMAGE,
    x,
    y,
    width,
    height,
    imageId: imageId ?? null,
    src: src ?? null,
    maskId: null,
    locked: Boolean(locked),
    ...(name ? { name } : {}),
  };
}

export const REGION_INTENTS = ["place", "keep", "clear"];
export const DEFAULT_REGION_INTENT = "place";

export function normalizeRegionIntent(value) {
  return REGION_INTENTS.includes(value) ? value : DEFAULT_REGION_INTENT;
}

export function isRegionNode(node) {
  return Boolean(node && node.kind === NODE_KIND.REGION);
}

export function findNode(doc, id) {
  if (!doc?.nodes || !id) return null;
  return doc.nodes.find((n) => n.id === id) || null;
}

export function regionParts(label) {
  const lines = String(label ?? "")
    .split("\n")
    .map((line) => line.trim());
  const name = lines.find(Boolean) ?? "";
  const detail = lines.slice(lines.indexOf(name) + 1).filter(Boolean);
  return { name, detail };
}

export const REGION_PALETTE = [
  { hex: "#FF0000", name: "Red", nameZh: "红色" },
  { hex: "#00FF00", name: "Green", nameZh: "绿色" },
  { hex: "#0000FF", name: "Blue", nameZh: "蓝色" },
  { hex: "#FFFF00", name: "Yellow", nameZh: "黄色" },
  { hex: "#FF00FF", name: "Magenta", nameZh: "洋红" },
  { hex: "#00FFFF", name: "Cyan", nameZh: "青色" },
  { hex: "#FF8800", name: "Orange", nameZh: "橙色" },
  { hex: "#8800FF", name: "Purple", nameZh: "紫色" },
  { hex: "#00FF88", name: "Spring Green", nameZh: "春绿" },
  { hex: "#FF0088", name: "Rose", nameZh: "玫瑰红" },
];

export const REGION_COLOR = "#FF0000";

export function getRegionColor(regionIndex = 0) {
  const item = REGION_PALETTE[Math.abs(regionIndex) % REGION_PALETTE.length];
  return item;
}
