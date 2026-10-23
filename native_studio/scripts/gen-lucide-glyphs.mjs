// Generates Sources/UI/VooIconGlyphs.generated.swift from the canonical VOO icon set.
// Sources of truth:
//   - Lucide glyphs: node_modules/lucide-react (version pinned in the root package.json)
//   - Custom web glyphs: src/canvas/icons.jsx (exported `Icon*` functions, plain SVG markup)
// Every VooIconName case must be mapped here; unmapped or unresolved sources fail the run.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = resolve(SCRIPT_DIR, "..");
const REPO_DIR = resolve(STUDIO_DIR, "..");
const ICON_MODULE_DIR = resolve(REPO_DIR, "node_modules/lucide-react/dist/esm/icons");
const WEB_ICONS_PATH = resolve(REPO_DIR, "src/canvas/icons.jsx");
const ENUM_PATH = resolve(STUDIO_DIR, "Sources/UI/Icons.swift");
const OUTPUT_PATH = resolve(STUDIO_DIR, "Sources/UI/VooIconGlyphs.generated.swift");

// Swift VooIconName case -> glyph source. `lucide:<file>` is a lucide-react icon,
// `web:<Export>` is a custom glyph defined in src/canvas/icons.jsx, and `svg:<path>` reads the
// <path> elements of a standalone SVG asset (used for the VOO brand mark).
// figma stays hand-drawn in Icons.swift.
const GLYPH_SOURCES = {
  brandLogo: "svg:public/voo-mark.svg",
  cursor: "lucide:mouse-pointer-2",
  frame: "lucide:frame",
  marquee: "lucide:square-dashed-mouse-pointer",
  pen: "lucide:pen-tool",
  eraser: "lucide:eraser",
  text: "lucide:type",
  shapes: "lucide:shapes",
  cube: "lucide:box",
  undo: "lucide:undo-2",
  redo: "lucide:redo-2",
  grid: "lucide:grid-3x3",
  plus: "lucide:plus",
  minus: "lucide:minus",
  clock: "lucide:clock-3",
  fileText: "lucide:file-text",
  layoutGrid: "lucide:layout-grid",
  compass: "lucide:compass",
  arrowRight: "lucide:arrow-right",
  zap: "lucide:zap",
  layoutList: "lucide:layout-list",
  search: "lucide:search",
  sliders: "lucide:sliders-horizontal",
  contrast: "lucide:contrast",
  copy: "lucide:copy",
  trash: "lucide:trash-2",
  eye: "lucide:eye",
  eyeOff: "lucide:eye-off",
  lock: "lucide:lock",
  unlock: "lucide:lock-open",
  chevronDown: "lucide:chevron-down",
  chevronRight: "lucide:chevron-right",
  arrowUp: "lucide:arrow-up",
  globe: "lucide:globe",
  smartphone: "lucide:smartphone",
  monitor: "lucide:monitor",
  presentation: "lucide:presentation",
  camera: "lucide:camera",
  layers: "lucide:layers",
  booleanUnion: "lucide:squares-unite",
  booleanSubtract: "lucide:squares-subtract",
  booleanIntersect: "lucide:squares-intersect",
  booleanXor: "lucide:squares-exclude",
  booleanDivide: "lucide:square-divide",
  alignLeft: "lucide:align-left",
  alignCenter: "lucide:align-center",
  alignRight: "lucide:align-right",
  alignTop: "lucide:align-start-horizontal",
  alignMiddle: "lucide:align-center-horizontal",
  alignBottom: "lucide:align-end-horizontal",
  distributeH: "lucide:align-horizontal-distribute-center",
  distributeV: "lucide:align-vertical-distribute-center",
  nodeSharp: "lucide:square",
  nodeSmooth: "lucide:circle",
  nodeSmart: "lucide:spline-pointer",
  rect: "lucide:square",
  ellipse: "lucide:circle",
  line: "lucide:slash",
  polygon: "lucide:pentagon",
  star: "lucide:star",
  arrow: "lucide:arrow-up-right",
  curvaturePen: "lucide:spline",
  pencil: "lucide:pencil",
  lasso: "lucide:lasso",
  flipH: "lucide:flip-horizontal-2",
  flipV: "lucide:flip-vertical-2",
  group: "lucide:group",
  ungroup: "lucide:ungroup",
  code: "lucide:braces",
  svg: "lucide:file-code",
  checkmark: "lucide:check",
  folder: "lucide:folder",
  folderOpen: "lucide:folder-open",
  refresh: "lucide:refresh-cw",
  rotateCcw: "lucide:rotate-ccw",
  swap: "web:IconSwap",
  settings: "lucide:settings",
  pipette: "lucide:pipette",
  cornerRadius: "web:IconCornerRadius",
  mask: "web:IconMask",
  diamond: "lucide:diamond",
  spline: "lucide:spline",
  image: "lucide:image",
  close: "lucide:x",
  sparkles: "lucide:sparkles",
  magnet: "lucide:magnet",
  history: "lucide:history",
  panelRightClose: "lucide:panel-right-close",
  wand: "lucide:wand-2",
  keyboard: "lucide:keyboard",
  hand: "lucide:hand",
  brush: "lucide:brush",
  link: "lucide:link-2",
  unlink: "lucide:unlink-2",
  alignJustify: "lucide:align-justify",
  alignTextLeft: "lucide:text-align-start",
  alignTextCenter: "lucide:text-align-center",
  alignTextRight: "lucide:text-align-end",
  italic: "lucide:italic",
  underline: "lucide:underline",
};

const HAND_DRAWN_CASES = new Set(["figma"]);
// Hand-written wrappers in Icons.swift that replace the generated one (extra parameters).
const HANDWRITTEN_WRAPPERS = new Set(["cursor"]);

const NUMBER = 4;
const round = (value) => Number(value.toFixed(NUMBER));

// ---------------------------------------------------------------------------
// SVG path normalisation: everything becomes absolute M / L / C / Z.
// ---------------------------------------------------------------------------

function arcToCubics(x1, y1, rxIn, ryIn, phiDeg, largeArc, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [[x2, y2]];

  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let coefficient = Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) coefficient = -coefficient;

  const cxp = (coefficient * rx * y1p) / ry;
  const cyp = (-coefficient * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux, uy, vx, vy) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return sign * Math.acos(Math.max(-1, Math.min(1, dot / len)));
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = angle(1, 0, ux, uy);
  let dTheta = angle(ux, uy, vx, vy);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const t = (4 / 3) * Math.tan(delta / 4);
  const toCanvas = (px, py) => [
    cosPhi * rx * px - sinPhi * ry * py + cx,
    sinPhi * rx * px + cosPhi * ry * py + cy,
  ];

  const cubics = [];
  for (let i = 0; i < segments; i += 1) {
    const a1 = theta1 + i * delta;
    const a2 = a1 + delta;
    const c1 = toCanvas(Math.cos(a1) - t * Math.sin(a1), Math.sin(a1) + t * Math.cos(a1));
    const c2 = toCanvas(Math.cos(a2) + t * Math.sin(a2), Math.sin(a2) - t * Math.cos(a2));
    const end = toCanvas(Math.cos(a2), Math.sin(a2));
    cubics.push([...c1, ...c2, ...end]);
  }
  return cubics;
}

const ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
const ARC_FLAG_INDEXES = new Set([3, 4]);
const NUMBER_PATTERN = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/;

// Cursor-based scanner: arc flags may be written without separators ("0 00-2"),
// so they must be read one character at a time rather than as tokens.
function normalizePath(d) {
  let pos = 0;
  const skipSeparators = () => {
    while (pos < d.length && /[\s,]/.test(d[pos])) pos += 1;
  };
  const readNumber = () => {
    skipSeparators();
    const match = NUMBER_PATTERN.exec(d.slice(pos));
    if (!match) throw new Error(`expected number at ${pos} in ${d}`);
    pos += match[0].length;
    return Number(match[0]);
  };
  const readFlag = () => {
    skipSeparators();
    const char = d[pos];
    if (char !== "0" && char !== "1") throw new Error(`expected arc flag at ${pos} in ${d}`);
    pos += 1;
    return Number(char);
  };

  const out = [];
  let cur = [0, 0];
  let start = [0, 0];
  let lastCubicCtrl = null;
  let lastQuadCtrl = null;
  let command = null;

  for (;;) {
    skipSeparators();
    if (pos >= d.length) break;
    const char = d[pos];

    if (/[A-Za-z]/.test(char)) {
      command = char;
      pos += 1;
      if (command === "Z" || command === "z") {
        out.push("Z");
        cur = [...start];
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        continue;
      }
    } else if (command === null) {
      throw new Error(`path does not start with a command: ${d}`);
    } else if (command === "Z" || command === "z") {
      throw new Error(`numbers after Z at ${pos} in ${d}`);
    } else if (command === "M") {
      command = "L";
    } else if (command === "m") {
      command = "l";
    }

    const upper = command.toUpperCase();
    const relative = command !== upper;
    const args = [];
    for (let k = 0; k < ARITY[upper]; k += 1) {
      args.push(upper === "A" && ARC_FLAG_INDEXES.has(k) ? readFlag() : readNumber());
    }
    let nextCubic = null;
    let nextQuad = null;

    switch (upper) {
      case "M": {
        const point = relative ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]];
        out.push(`M ${round(point[0])} ${round(point[1])}`);
        cur = point;
        start = [...point];
        break;
      }
      case "L":
      case "H":
      case "V": {
        let point;
        if (upper === "L") point = relative ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]];
        if (upper === "H") point = [relative ? cur[0] + args[0] : args[0], cur[1]];
        if (upper === "V") point = [cur[0], relative ? cur[1] + args[0] : args[0]];
        out.push(`L ${round(point[0])} ${round(point[1])}`);
        cur = point;
        break;
      }
      case "C":
      case "S": {
        let c1;
        if (upper === "C") {
          c1 = relative ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]];
        } else {
          c1 = lastCubicCtrl ? [2 * cur[0] - lastCubicCtrl[0], 2 * cur[1] - lastCubicCtrl[1]] : [...cur];
        }
        const rest = upper === "C" ? args.slice(2) : args;
        const toPoint = (x, y) => (relative ? [cur[0] + x, cur[1] + y] : [x, y]);
        const c2 = toPoint(rest[0], rest[1]);
        const end = toPoint(rest[2], rest[3]);
        out.push(
          `C ${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(end[0])} ${round(end[1])}`,
        );
        nextCubic = c2;
        cur = end;
        break;
      }
      case "Q":
      case "T": {
        let ctrl;
        if (upper === "Q") {
          ctrl = relative ? [cur[0] + args[0], cur[1] + args[1]] : [args[0], args[1]];
        } else {
          ctrl = lastQuadCtrl ? [2 * cur[0] - lastQuadCtrl[0], 2 * cur[1] - lastQuadCtrl[1]] : [...cur];
        }
        const rest = upper === "Q" ? args.slice(2) : args;
        const end = relative ? [cur[0] + rest[0], cur[1] + rest[1]] : [rest[0], rest[1]];
        const c1 = [cur[0] + (2 / 3) * (ctrl[0] - cur[0]), cur[1] + (2 / 3) * (ctrl[1] - cur[1])];
        const c2 = [end[0] + (2 / 3) * (ctrl[0] - end[0]), end[1] + (2 / 3) * (ctrl[1] - end[1])];
        out.push(
          `C ${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(end[0])} ${round(end[1])}`,
        );
        nextQuad = ctrl;
        cur = end;
        break;
      }
      case "A": {
        const end = relative ? [cur[0] + args[5], cur[1] + args[6]] : [args[5], args[6]];
        const cubics = arcToCubics(cur[0], cur[1], args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, end[0], end[1]);
        for (const c of cubics) {
          if (c.length === 2) {
            out.push(`L ${round(c[0])} ${round(c[1])}`);
          } else {
            out.push(`C ${c.map(round).join(" ")}`);
          }
        }
        cur = end;
        break;
      }
      default:
        throw new Error(`unsupported path command ${command} in ${d}`);
    }

    lastCubicCtrl = nextCubic;
    lastQuadCtrl = nextQuad;
  }
  return out.join(" ");
}

// ---------------------------------------------------------------------------
// Shape primitives -> normalised path strings
// ---------------------------------------------------------------------------

const num = (attrs, key, tag) => {
  const value = Number(attrs[key] ?? 0);
  if (attrs[key] !== undefined && Number.isNaN(value)) {
    throw new Error(`<${tag}> attribute ${key} is not numeric: ${attrs[key]}`);
  }
  return value;
};

function elementToPath(tag, attrs) {
  switch (tag) {
    case "path":
      return normalizePath(attrs.d);
    case "line":
      return normalizePath(
        `M ${num(attrs, "x1", tag)} ${num(attrs, "y1", tag)} L ${num(attrs, "x2", tag)} ${num(attrs, "y2", tag)}`,
      );
    case "polyline":
    case "polygon": {
      const points = attrs.points.trim().split(/[\s,]+/).map(Number);
      const pairs = [];
      for (let k = 0; k < points.length; k += 2) pairs.push(`${points[k]} ${points[k + 1]}`);
      const body = `M ${pairs[0]} ${pairs.slice(1).map((p) => `L ${p}`).join(" ")}`;
      return normalizePath(tag === "polygon" ? `${body} Z` : body);
    }
    case "rect": {
      const x = num(attrs, "x", tag);
      const y = num(attrs, "y", tag);
      const w = num(attrs, "width", tag);
      const h = num(attrs, "height", tag);
      const rx = Math.min(num(attrs, "rx", tag) || num(attrs, "ry", tag), w / 2, h / 2);
      if (!rx) return normalizePath(`M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`);
      return normalizePath(
        `M ${x + rx} ${y} L ${x + w - rx} ${y} A ${rx} ${rx} 0 0 1 ${x + w} ${y + rx} ` +
          `L ${x + w} ${y + h - rx} A ${rx} ${rx} 0 0 1 ${x + w - rx} ${y + h} ` +
          `L ${x + rx} ${y + h} A ${rx} ${rx} 0 0 1 ${x} ${y + h - rx} ` +
          `L ${x} ${y + rx} A ${rx} ${rx} 0 0 1 ${x + rx} ${y} Z`,
      );
    }
    case "circle":
    case "ellipse": {
      const cx = num(attrs, "cx", tag);
      const cy = num(attrs, "cy", tag);
      const rx = tag === "circle" ? num(attrs, "r", tag) : num(attrs, "rx", tag);
      const ry = tag === "circle" ? rx : num(attrs, "ry", tag);
      return normalizePath(
        `M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} Z`,
      );
    }
    default:
      throw new Error(`unsupported element <${tag}>`);
  }
}

// ---------------------------------------------------------------------------
// Glyph sources
// ---------------------------------------------------------------------------

async function loadLucideElements(file) {
  const path = resolve(ICON_MODULE_DIR, `${file}.mjs`);
  // Alias modules (e.g. trash-2 -> trash-2 canonical file) only re-export the default component.
  const alias = readFileSync(path, "utf8").match(/export \{ default \} from '\.\/([^']+)';/);
  if (alias) return loadLucideElements(alias[1].replace(/\.mjs$/, ""));
  const module = await import(pathToFileURL(path).href);
  const data = module.__iconData;
  if (!data || !Array.isArray(data.node) || data.node.length === 0) {
    throw new Error(`lucide icon has no node data: ${file}`);
  }
  return data.node.map(([tag, attrs]) => ({
    tag,
    attrs,
    filled: Boolean(attrs.fill) && attrs.fill !== "none",
  }));
}

function loadWebElements(exportName, source) {
  const start = source.indexOf(`export function ${exportName}(`);
  if (start === -1) throw new Error(`web glyph not found: ${exportName}`);
  const end = source.indexOf("\n}\n", start);
  const body = source.slice(start, end);
  const tagPattern = /<(path|rect|circle|line|polyline|polygon|ellipse)\b([^>]*?)\/>/g;
  const elements = [];
  for (const match of body.matchAll(tagPattern)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    elements.push({ tag: match[1], attrs, filled: attrs.fill === "currentColor" });
  }
  const totalTags = (body.match(/<(path|rect|circle|line|polyline|polygon|ellipse)\b/g) ?? []).length;
  if (totalTags !== elements.length) {
    throw new Error(`${exportName}: ${totalTags - elements.length} element(s) are not self-closing`);
  }
  if (elements.length === 0) throw new Error(`web glyph has no drawable elements: ${exportName}`);
  return elements;
}

// Filled brand mark: every <path> is a filled region (fill-rule nonzero, as in the SVG).
function loadSvgElements(path) {
  const source = readFileSync(path, "utf8");
  const elements = [];
  for (const match of source.matchAll(/<path\b([^>]*?)\/>/g)) {
    const attrs = {};
    for (const attr of match[1].matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    if (!attrs.d) throw new Error(`svg path without d in ${path}`);
    elements.push({ tag: "path", attrs, filled: true });
  }
  if (elements.length === 0) throw new Error(`no paths in ${path}`);
  return elements;
}

// ---------------------------------------------------------------------------
// Swift emission
// ---------------------------------------------------------------------------

function readSwiftCases() {
  const source = readFileSync(ENUM_PATH, "utf8");
  const start = source.indexOf("enum VooIconName");
  const end = source.indexOf("\n}", start);
  const cases = [];
  for (const line of source.slice(start, end).split("\n")) {
    const match = line.replace(/\/\/.*$/, "").match(/^\s*case\s+(.+)$/);
    if (!match) continue;
    for (const name of match[1].split(",")) {
      const trimmed = name.trim();
      if (trimmed) cases.push(trimmed);
    }
  }
  return cases;
}

const capitalize = (name) => name.charAt(0).toUpperCase() + name.slice(1);

async function main() {
  const cases = readSwiftCases();
  const missing = cases.filter((name) => !HAND_DRAWN_CASES.has(name) && !(name in GLYPH_SOURCES));
  if (missing.length > 0) throw new Error(`VooIconName cases without a glyph source: ${missing.join(", ")}`);
  const unknown = Object.keys(GLYPH_SOURCES).filter((name) => !cases.includes(name));
  if (unknown.length > 0) throw new Error(`glyph sources for unknown cases: ${unknown.join(", ")}`);

  const webSource = readFileSync(WEB_ICONS_PATH, "utf8");
  const tableLines = [];
  const wrapperLines = [];

  for (const name of cases) {
    if (HAND_DRAWN_CASES.has(name)) continue;
    const [kind, ref] = GLYPH_SOURCES[name].split(/:(.+)/);
    const elements =
      kind === "lucide"
        ? await loadLucideElements(ref)
        : kind === "svg"
          ? loadSvgElements(resolve(REPO_DIR, ref))
          : loadWebElements(ref, webSource);
    const entries = elements.map(({ tag, attrs, filled }) => {
      const path = elementToPath(tag, attrs);
      return `VooGlyphElement(path: "${path}", filled: ${filled})`;
    });
    tableLines.push(`        .${name}: [`);
    for (const entry of entries) tableLines.push(`            ${entry},`);
    tableLines.push("        ],");

    if (HANDWRITTEN_WRAPPERS.has(name)) continue;
    wrapperLines.push(
      `    public static func draw${capitalize(name)}(in rect: NSRect, color: NSColor = .labelColor, strokeWidth: CGFloat = 1.5) {`,
      `        draw(.${name}, in: rect, color: color, strokeWidth: strokeWidth)`,
      "    }",
      "",
    );
  }

  const output = `//
//  VooIconGlyphs.generated.swift
//  native_studio
//
//  GENERATED FILE — do not edit by hand. Regenerate with: node scripts/gen-lucide-glyphs.mjs
//  Lucide glyphs come from lucide-react (ISC, 24×24 stroke icons); custom glyphs are
//  transcribed from src/canvas/icons.jsx. Paths are absolute M / L / C / Z commands.
//

import AppKit
import Foundation

extension VooIconFactory {

    /// Glyph geometry for every icon except the hand-drawn brand marks.
    static let glyphTable: [VooIconName: [VooGlyphElement]] = [
${tableLines.join("\n")}
    ]

    // MARK: - Per-glyph wrappers (kept so existing call sites keep their API)

${wrapperLines.join("\n")}}
`;

  writeFileSync(OUTPUT_PATH, output);
  console.log(`wrote ${OUTPUT_PATH} (${cases.length - HAND_DRAWN_CASES.size} glyphs)`);
}

main().catch((error) => {
  console.error(`gen-lucide-glyphs failed: ${error.message}`);
  process.exit(1);
});
