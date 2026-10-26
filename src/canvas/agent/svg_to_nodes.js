/**
 * SVG → VOO node specs for the `generate_vector` agent tool.
 *
 * The model returns a raw SVG document; this module turns it into the flat
 * `NodeSpec[]` the canvas tools (`create_path` / `create_shape`) can place.
 * It is deliberately dependency-free and DOM-free: a hand-written scanner
 * walks the markup, so the same code runs in the browser and under vitest's
 * node environment (no `DOMParser`).
 *
 * Contract:
 *   parseSvgToNodes(svgText, { targetWidth, targetHeight, maxNodes }) →
 *     { width, height, viewBox, nodes, warnings }
 *   NodeSpec = { kind: "path", name, d, fill, stroke, strokeWidth, opacity }
 *            | { kind: "rect", name, x, y, width, height, rx, fill, stroke,
 *                strokeWidth, opacity }
 *
 * Design decisions / limits (dirty LLM output must never throw):
 * - Everything is emitted in target-canvas coordinates. viewBox + the transform
 *   stack (translate/scale/matrix/rotate/skewX/skewY) are composed into one
 *   affine matrix; path `d` is rewritten numerically (M/L/H/V/C/S/Q/T/A/Z are
 *   converted to absolute commands, relative offsets resolved, arcs scaled by
 *   sqrt(|det|) and rotated by the matrix angle). Under a non-uniform/skewed
 *   matrix the arc radii can only be approximated — a warning is recorded.
 *   If a `d` cannot be tokenized it is skipped with a warning rather than
 *   emitted broken.
 * - `<rect>` stays a rect only under axis-aligned transforms; rotated/skewed
 *   rects become 4-corner paths (corner radius dropped) with a warning.
 * - Paint (`fill`/`stroke`/`stroke-width`/`opacity`/`fill-opacity`/
 *   `stroke-opacity`, presentation attribute + inline `style`) is inherited
 *   through `<g>`/`<a>`/`<switch>`. `fill-opacity`/`stroke-opacity` are folded
 *   into `rgba()` when the color is hex/rgb; otherwise a warning is recorded.
 * - `url(...)` paint servers (gradients), `currentColor`, `<defs>`, `<use>`,
 *   `<text>`, `<image>`, `<script>`, `<style>`, clip paths, masks, filters …
 *   are ignored with a warning: defs/gradients are NOT flattened.
 */

const IDENTITY_MATRIX = Object.freeze([1, 0, 0, 1, 0, 0]);
const DEFAULT_FILL = "#000000";
const DEFAULT_SOURCE_SIZE = 100;
const DEFAULT_MAX_NODES = 400;
const EPSILON = 1e-9;
/** Bezier constant for approximating a quarter circle with one cubic. */
const KAPPA = 0.5522847498307936;

const NUMBER_STICKY = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const NUMBER_GLOBAL = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const NUMBER_ONLY = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const LENGTH_PATTERN =
  /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(px|pt|pc|cm|mm|in|%)?$/i;
const COMMAND_LETTER = /^[MmLlHhVvCcSsQqTtAaZz]$/;

/** Tags we never render. Subtrees are skipped: their content is not canvas. */
const SKIP_SUBTREE_TAGS = new Set([
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "use",
  "text",
  "tspan",
  "textpath",
  "image",
  "script",
  "style",
  "title",
  "desc",
  "metadata",
  "clippath",
  "mask",
  "pattern",
  "filter",
  "symbol",
  "marker",
  "foreignobject",
]);
const CONTAINER_TAGS = new Set(["g", "a", "switch", "svg"]);
const BASE_PAINT = Object.freeze({
  fill: DEFAULT_FILL,
  stroke: null,
  strokeWidth: null,
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
});

/** Argument count per absolute path command. */
const COMMAND_ARG_COUNT = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

// ---------------------------------------------------------------------------
// Small numeric / matrix helpers
// ---------------------------------------------------------------------------

function round(value, digits = 3) {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Formats a coordinate for `d` / node fields: stable, 3 decimals. */
function fmt(value) {
  if (!Number.isFinite(value)) return "0";
  return String(round(value));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** Parses a plain number (optionally with a px suffix). Returns null if unparsable. */
function parseNumber(value) {
  if (value == null) return null;
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(?:px)?\s*$/i.exec(
    String(value),
  );
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

/** Parses an SVG length for the root width/height. Percentages are unusable. */
function parseLength(value) {
  if (value == null) return null;
  const match = LENGTH_PATTERN.exec(String(value).trim());
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = (match[2] || "px").toLowerCase();
  switch (unit) {
    case "%":
      return null;
    case "pt":
      return (number * 4) / 3;
    case "pc":
      return number * 16;
    case "in":
      return number * 96;
    case "cm":
      return (number * 96) / 2.54;
    case "mm":
      return (number * 96) / 25.4;
    default:
      return number;
  }
}

/** Parses `viewBox="minX minY width height"`; returns null when unusable. */
function parseViewBox(value) {
  if (value == null) return null;
  const parts = String(value)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length !== 4 || parts.some((number) => !Number.isFinite(number))) return null;
  if (parts[2] <= 0 || parts[3] <= 0) return null;
  return parts;
}

/** Affine matrix [a, b, c, d, e, f]; composes left-to-right transform lists. */
function multiplyMatrix(first, second) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

function isIdentityMatrix(matrix) {
  for (let i = 0; i < 6; i++) {
    const expected = IDENTITY_MATRIX[i];
    if (Math.abs(matrix[i] - expected) > EPSILON) return false;
  }
  return true;
}

function applyMatrix(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function hasRotationOrSkew(matrix) {
  return Math.abs(matrix[1]) > EPSILON || Math.abs(matrix[2]) > EPSILON;
}

/**
 * Scale factor applied to stroke widths so they stay proportional to the
 * geometry after the viewBox/transform mapping. sqrt(|det|) is exact for
 * similarity transforms and the geometric mean for non-uniform ones.
 */
function strokeScaleFor(matrix) {
  const det = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  const scale = Math.sqrt(Math.abs(det));
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

// ---------------------------------------------------------------------------
// Warnings / context
// ---------------------------------------------------------------------------

function createContext() {
  const warnings = [];
  const seen = new Set();
  return {
    warnings,
    /** Records a message once per key so a bad gradient does not flood the list. */
    warnOnce(key, message) {
      if (seen.has(key)) return;
      seen.add(key);
      warnings.push(message);
    },
  };
}

// ---------------------------------------------------------------------------
// Lightweight XML scanner (no DOMParser)
// ---------------------------------------------------------------------------

/** Finds the closing `>` of a tag, skipping over quoted attribute values. */
function findTagEnd(text, start) {
  let quote = null;
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return index;
  }
  return -1;
}

function parseAttributes(source) {
  const attrs = {};
  const pattern =
    /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(source))) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    if (value === undefined) continue;
    if (!(key in attrs)) attrs[key] = value;
  }
  return attrs;
}

/**
 * Builds a minimal element tree. Comments, XML declarations, doctypes and
 * CDATA are skipped; `<script>`/`<style>` bodies are skipped wholesale so a
 * `<` inside JS/CSS cannot derail the scanner. Malformed nesting never throws:
 * a close tag pops to the first matching ancestor, an unterminated tag stops
 * the scan with whatever was parsed so far.
 */
function parseMarkup(text) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  let index = 0;
  while (index < text.length) {
    const lt = text.indexOf("<", index);
    if (lt < 0) break;
    if (text.startsWith("<!--", lt)) {
      const end = text.indexOf("-->", lt + 4);
      index = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const end = text.indexOf("]]>", lt + 9);
      index = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith("<?", lt)) {
      const end = text.indexOf("?>", lt + 2);
      index = end < 0 ? text.length : end + 2;
      continue;
    }
    if (text.startsWith("<!", lt)) {
      const end = text.indexOf(">", lt + 2);
      index = end < 0 ? text.length : end + 1;
      continue;
    }
    const gt = findTagEnd(text, lt);
    if (gt < 0) break;
    const raw = text.slice(lt + 1, gt).trim();
    index = gt + 1;
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth--) {
        if (stack[depth].tag === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }
    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const nameMatch = /^([^\s/>]+)/.exec(body);
    if (!nameMatch) continue;
    const fullName = nameMatch[1];
    const tag = fullName.split(":").pop().toLowerCase();
    const attrs = parseAttributes(body.slice(fullName.length));
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (selfClosing) continue;
    if (tag === "script" || tag === "style") {
      const close = text.toLowerCase().indexOf(`</${tag}`, index);
      if (close >= 0) {
        const closeEnd = text.indexOf(">", close);
        index = closeEnd < 0 ? text.length : closeEnd + 1;
      }
      continue;
    }
    stack.push(node);
  }
  return root;
}

function findElement(node, tag) {
  for (const child of node.children) {
    if (child.tag === tag) return child;
    const found = findElement(child, tag);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Presentation attributes / paint inheritance
// ---------------------------------------------------------------------------

function parseStyle(value) {
  const style = {};
  if (!value) return style;
  for (const part of String(value).split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    if (!key) continue;
    style[key] = part.slice(colon + 1).trim();
  }
  return style;
}

/** Normalizes a paint value; degrades unsupported paint servers instead of throwing. */
function resolvePaintColor(value, fallback, role, ctx) {
  if (value == null) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (lower === "none") return "none";
  if (lower === "transparent") return "none";
  if (lower === "currentcolor") {
    ctx.warnOnce("paint:currentcolor", "currentColor is unsupported; using #000000");
    return DEFAULT_FILL;
  }
  if (lower.startsWith("url(")) {
    ctx.warnOnce(
      `paint:${role}:url`,
      `${role}="${raw}" references a paint server (gradient/pattern), which is unsupported; using ${fallback ?? "none"}`,
    );
    return fallback;
  }
  if (/^(inherit|initial|unset|revert)$/.test(lower)) return fallback;
  return raw;
}

/** Folds a paint opacity into the color when it is hex/rgb, otherwise warns. */
function withAlpha(color, alpha, role, ctx) {
  if (color == null || color === "none") return color;
  if (!(alpha < 1)) return color;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const digits = hex[1];
    const pairs =
      digits.length === 3
        ? digits.split("").map((digit) => digit + digit)
        : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)];
    const channels = pairs.map((pair) => Number.parseInt(pair, 16));
    return `rgba(${channels.join(",")},${round(alpha)})`;
  }
  const rgb = /^rgba?\(([^)]*)\)$/i.exec(color);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const channels = parts.slice(0, 3).map((part) => Number(part));
      if (channels.every((channel) => Number.isFinite(channel))) {
        return `rgba(${channels.join(",")},${round(alpha)})`;
      }
    }
  }
  ctx.warnOnce(
    `alpha:${role}:${color}`,
    `cannot apply ${role}-opacity ${alpha} to "${color}"; color kept as-is`,
  );
  return color;
}

function resolvePaint(attrs, inherited, ctx, parsedStyle = parseStyle(attrs.style)) {
  const lookup = (key) => parsedStyle[key] ?? attrs[key];
  const rawFill = lookup("fill");
  const fill = rawFill === undefined ? inherited.fill : resolvePaintColor(rawFill, inherited.fill, "fill", ctx);
  const rawStroke = lookup("stroke");
  const stroke = rawStroke === undefined ? inherited.stroke : resolvePaintColor(rawStroke, null, "stroke", ctx);
  const rawWidth = lookup("stroke-width");
  const parsedWidth = rawWidth === undefined ? null : parseNumber(rawWidth);
  const strokeWidth = stroke === null ? null : (parsedWidth ?? inherited.strokeWidth ?? 1);
  const rawOpacity = lookup("opacity");
  const ownOpacity = rawOpacity === undefined ? 1 : clamp01(parseNumber(rawOpacity) ?? 1);
  const rawFillOpacity = lookup("fill-opacity");
  const fillOpacity =
    rawFillOpacity === undefined
      ? inherited.fillOpacity
      : clamp01(parseNumber(rawFillOpacity) ?? inherited.fillOpacity);
  const rawStrokeOpacity = lookup("stroke-opacity");
  const strokeOpacity =
    rawStrokeOpacity === undefined
      ? inherited.strokeOpacity
      : clamp01(parseNumber(rawStrokeOpacity) ?? inherited.strokeOpacity);
  return {
    fill,
    stroke,
    strokeWidth,
    opacity: clamp01(inherited.opacity * ownOpacity),
    fillOpacity,
    strokeOpacity,
  };
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

/**
 * Parses a transform list into one matrix. Lists compose in document order:
 * `translate(a) scale(b)` maps p → translate(a) · scale(b) · p.
 * Unknown functions are ignored with one warning per function name.
 */
function parseTransformMatrix(value, ctx) {
  if (value == null) return IDENTITY_MATRIX;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "none") return IDENTITY_MATRIX;
  let matrix = IDENTITY_MATRIX;
  let matched = false;
  const pattern = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = pattern.exec(text))) {
    matched = true;
    const name = match[1].toLowerCase();
    const numbers = (match[2].match(NUMBER_GLOBAL) ?? []).map(Number);
    let operation = null;
    switch (name) {
      case "translate":
        operation = [1, 0, 0, 1, numbers[0] ?? 0, numbers[1] ?? 0];
        break;
      case "scale": {
        const scaleX = numbers[0] ?? 1;
        const scaleY = numbers[1] ?? scaleX;
        operation = [scaleX, 0, 0, scaleY, 0, 0];
        break;
      }
      case "matrix":
        if (numbers.length >= 6) operation = numbers.slice(0, 6);
        else ctx.warnOnce(`transform:matrix:${match[2]}`, `invalid matrix() ignored: ${match[0]}`);
        break;
      case "rotate": {
        const radians = ((numbers[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const centerX = numbers[1] ?? 0;
        const centerY = numbers[2] ?? 0;
        operation = [
          cos,
          sin,
          -sin,
          cos,
          centerX - cos * centerX + sin * centerY,
          centerY - sin * centerX - cos * centerY,
        ];
        break;
      }
      case "skewx":
        operation = [1, 0, Math.tan(((numbers[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewy":
        operation = [1, Math.tan(((numbers[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        ctx.warnOnce(`transform:${name}`, `unsupported transform function ${name}() ignored`);
    }
    if (operation) matrix = multiplyMatrix(matrix, operation);
  }
  if (!matched) {
    ctx.warnOnce(`transform:${text}`, `unparsable transform attribute ignored: ${text}`);
    return IDENTITY_MATRIX;
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Path data parsing / rewriting
// ---------------------------------------------------------------------------

/**
 * Tokenizes SVG path data into absolute commands with raw (untransformed)
 * argument values plus a `relative` flag. Returns null when the data cannot be
 * fully tokenized (unknown letters, truncated argument lists, …).
 */
function parsePathCommands(data) {
  const commands = [];
  const length = data.length;
  let index = 0;
  const isSeparator = (char) =>
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === "\f" ||
    char === ",";
  const skipSeparators = () => {
    while (index < length && isSeparator(data[index])) index++;
  };
  const isNumberStart = (char) =>
    (char >= "0" && char <= "9") || char === "." || char === "+" || char === "-";
  const readNumber = () => {
    skipSeparators();
    NUMBER_STICKY.lastIndex = index;
    const match = NUMBER_STICKY.exec(data);
    if (!match) return null;
    index = NUMBER_STICKY.lastIndex;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  };
  const readFlag = () => {
    skipSeparators();
    const char = data[index];
    if (char === "0" || char === "1") {
      index++;
      return char === "1";
    }
    return null;
  };
  const readArguments = (upper) => {
    const args = [];
    for (let argIndex = 0; argIndex < COMMAND_ARG_COUNT[upper]; argIndex++) {
      const isArcFlag = upper === "A" && (argIndex === 3 || argIndex === 4);
      const value = isArcFlag ? readFlag() : readNumber();
      if (value === null) return null;
      args.push(value);
    }
    return args;
  };
  while (index < length) {
    skipSeparators();
    if (index >= length) break;
    const letter = data[index];
    if (!COMMAND_LETTER.test(letter)) return null;
    index++;
    const upper = letter.toUpperCase();
    if (upper === "Z") {
      commands.push({ cmd: "Z", args: [], relative: false });
      continue;
    }
    const relative = letter !== upper;
    let firstSet = true;
    while (true) {
      const args = readArguments(upper);
      if (!args) return null;
      // Repeated moveto argument pairs are implicit linetos.
      commands.push({ cmd: firstSet ? upper : upper === "M" ? "L" : upper, args, relative });
      firstSet = false;
      skipSeparators();
      if (index >= length || !isNumberStart(data[index])) break;
    }
  }
  return commands;
}

/**
 * Rewrites absolute/relative path commands into absolute commands transformed
 * by `matrix`. Arcs: radii scale by sqrt(|det|) (exact for similarity
 * transforms), the x-axis rotation advances by the matrix angle, and the sweep
 * flag flips under a mirrored matrix. Requires pre-validated commands.
 */
function transformPathCommands(commands, matrix, ctx) {
  if (isIdentityMatrix(matrix)) return null;
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;
  const scale = Math.sqrt(Math.abs(det));
  const rotationDegrees = (Math.atan2(b, a) * 180) / Math.PI;
  const mirrored = det < 0;
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  const similarity = Math.abs(scaleX - scaleY) <= 1e-6 * Math.max(1, scaleX);
  const point = (x, y) => applyMatrix(matrix, x, y);
  const segments = [];
  let cursorX = 0;
  let cursorY = 0;
  let startX = 0;
  let startY = 0;
  for (const { cmd, args, relative } of commands) {
    const baseX = cursorX;
    const baseY = cursorY;
    switch (cmd) {
      case "M": {
        const x = relative ? baseX + args[0] : args[0];
        const y = relative ? baseY + args[1] : args[1];
        const transformed = point(x, y);
        segments.push(`M ${fmt(transformed.x)} ${fmt(transformed.y)}`);
        cursorX = x;
        cursorY = y;
        startX = x;
        startY = y;
        break;
      }
      case "L": {
        const x = relative ? baseX + args[0] : args[0];
        const y = relative ? baseY + args[1] : args[1];
        const transformed = point(x, y);
        segments.push(`L ${fmt(transformed.x)} ${fmt(transformed.y)}`);
        cursorX = x;
        cursorY = y;
        break;
      }
      case "H": {
        const x = relative ? baseX + args[0] : args[0];
        const transformed = point(x, baseY);
        segments.push(`L ${fmt(transformed.x)} ${fmt(transformed.y)}`);
        cursorX = x;
        break;
      }
      case "V": {
        const y = relative ? baseY + args[0] : args[0];
        const transformed = point(baseX, y);
        segments.push(`L ${fmt(transformed.x)} ${fmt(transformed.y)}`);
        cursorY = y;
        break;
      }
      case "C": {
        const points = [
          relative ? baseX + args[0] : args[0],
          relative ? baseY + args[1] : args[1],
          relative ? baseX + args[2] : args[2],
          relative ? baseY + args[3] : args[3],
          relative ? baseX + args[4] : args[4],
          relative ? baseY + args[5] : args[5],
        ];
        const p1 = point(points[0], points[1]);
        const p2 = point(points[2], points[3]);
        const p3 = point(points[4], points[5]);
        segments.push(
          `C ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`,
        );
        cursorX = points[4];
        cursorY = points[5];
        break;
      }
      case "S": {
        const points = [
          relative ? baseX + args[0] : args[0],
          relative ? baseY + args[1] : args[1],
          relative ? baseX + args[2] : args[2],
          relative ? baseY + args[3] : args[3],
        ];
        const p1 = point(points[0], points[1]);
        const p2 = point(points[2], points[3]);
        segments.push(`S ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
        cursorX = points[2];
        cursorY = points[3];
        break;
      }
      case "Q": {
        const points = [
          relative ? baseX + args[0] : args[0],
          relative ? baseY + args[1] : args[1],
          relative ? baseX + args[2] : args[2],
          relative ? baseY + args[3] : args[3],
        ];
        const p1 = point(points[0], points[1]);
        const p2 = point(points[2], points[3]);
        segments.push(`Q ${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)}`);
        cursorX = points[2];
        cursorY = points[3];
        break;
      }
      case "T": {
        const x = relative ? baseX + args[0] : args[0];
        const y = relative ? baseY + args[1] : args[1];
        const transformed = point(x, y);
        segments.push(`T ${fmt(transformed.x)} ${fmt(transformed.y)}`);
        cursorX = x;
        cursorY = y;
        break;
      }
      case "A": {
        const radiusX = Math.abs(args[0]);
        const radiusY = Math.abs(args[1]);
        const x = relative ? baseX + args[5] : args[5];
        const y = relative ? baseY + args[6] : args[6];
        const transformed = point(x, y);
        if (radiusX === 0 || radiusY === 0) {
          segments.push(`L ${fmt(transformed.x)} ${fmt(transformed.y)}`);
        } else {
          if (!similarity) {
            ctx.warnOnce(
              "path:arc:nonuniform",
              "arc command under a non-uniform/skewed transform approximated (radii scaled by sqrt(|det|))",
            );
          }
          const largeArc = args[3] ? 1 : 0;
          // A mirrored (negative determinant) matrix reverses the sweep direction.
          const sweep = Boolean(args[4]) !== mirrored ? 1 : 0;
          segments.push(
            `A ${fmt(radiusX * scale)} ${fmt(radiusY * scale)} ${fmt(args[2] + rotationDegrees)} ${largeArc} ${sweep} ${fmt(transformed.x)} ${fmt(transformed.y)}`,
          );
        }
        cursorX = x;
        cursorY = y;
        break;
      }
      case "Z":
        segments.push("Z");
        cursorX = startX;
        cursorY = startY;
        break;
      default:
        break;
    }
  }
  return segments.join(" ");
}

// ---------------------------------------------------------------------------
// Shape → user-space path data
// ---------------------------------------------------------------------------

function circlePathData(centerX, centerY, radiusX, radiusY) {
  const offsetX = radiusX * KAPPA;
  const offsetY = radiusY * KAPPA;
  return [
    `M ${fmt(centerX + radiusX)} ${fmt(centerY)}`,
    `C ${fmt(centerX + radiusX)} ${fmt(centerY + offsetY)} ${fmt(centerX + offsetX)} ${fmt(centerY + radiusY)} ${fmt(centerX)} ${fmt(centerY + radiusY)}`,
    `C ${fmt(centerX - offsetX)} ${fmt(centerY + radiusY)} ${fmt(centerX - radiusX)} ${fmt(centerY + offsetY)} ${fmt(centerX - radiusX)} ${fmt(centerY)}`,
    `C ${fmt(centerX - radiusX)} ${fmt(centerY - offsetY)} ${fmt(centerX - offsetX)} ${fmt(centerY - radiusY)} ${fmt(centerX)} ${fmt(centerY - radiusY)}`,
    `C ${fmt(centerX + offsetX)} ${fmt(centerY - radiusY)} ${fmt(centerX + radiusX)} ${fmt(centerY - offsetY)} ${fmt(centerX + radiusX)} ${fmt(centerY)}`,
    "Z",
  ].join(" ");
}

function pointsToPathData(points, close) {
  if (points.length < 2) return null;
  const commands = [`M ${fmt(points[0][0])} ${fmt(points[0][1])}`];
  for (let index = 1; index < points.length; index++) {
    commands.push(`L ${fmt(points[index][0])} ${fmt(points[index][1])}`);
  }
  if (close) commands.push("Z");
  return commands.join(" ");
}

function readPoints(value, ctx) {
  if (value == null) return [];
  const numbers = (String(value).match(NUMBER_GLOBAL) ?? []).map(Number).filter(Number.isFinite);
  if (numbers.length % 2 !== 0) {
    ctx.warnOnce("points:odd", "points attribute has an odd number of coordinates; last value ignored");
    numbers.pop();
  }
  const points = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push([numbers[index], numbers[index + 1]]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

function buildPathNode(d, paint, ctx, matrix = IDENTITY_MATRIX) {
  return {
    kind: "path",
    d,
    fill: withAlpha(paint.fill, paint.fillOpacity, "fill", ctx),
    stroke: withAlpha(paint.stroke, paint.strokeOpacity, "stroke", ctx),
    strokeWidth:
      paint.strokeWidth == null ? null : round(paint.strokeWidth * strokeScaleFor(matrix)),
    opacity: round(paint.opacity),
  };
}

/** Builds a path node from user-space `d`, applying the transform matrix if any. */
function pathNodeFromUserData(userData, paint, matrix, ctx) {
  const commands = parsePathCommands(userData);
  if (!commands) return null;
  if (isIdentityMatrix(matrix)) return buildPathNode(userData, paint, ctx, matrix);
  const transformed = transformPathCommands(commands, matrix, ctx);
  if (!transformed) return null;
  return buildPathNode(transformed, paint, ctx, matrix);
}

function buildPathElement(attrs, paint, matrix, ctx) {
  const rawData = attrs.d;
  if (typeof rawData !== "string" || rawData.trim() === "") {
    ctx.warnOnce("path:empty", "<path> without a non-empty d attribute skipped");
    return null;
  }
  const commands = parsePathCommands(rawData);
  if (!commands) {
    ctx.warnOnce("path:invalid", `invalid path data skipped: ${rawData.slice(0, 80)}`);
    return null;
  }
  if (isIdentityMatrix(matrix)) return buildPathNode(rawData, paint, ctx, matrix);
  const transformed = transformPathCommands(commands, matrix, ctx);
  if (!transformed) return null;
  return buildPathNode(transformed, paint, ctx, matrix);
}

function buildRectElement(attrs, paint, matrix, ctx) {
  const x = parseNumber(attrs.x) ?? 0;
  const y = parseNumber(attrs.y) ?? 0;
  const width = parseNumber(attrs.width);
  const height = parseNumber(attrs.height);
  if (width == null || height == null || width <= 0 || height <= 0) {
    ctx.warnOnce("rect:size", "<rect> without a positive width/height skipped");
    return null;
  }
  const rawRadius = parseNumber(attrs.rx) ?? parseNumber(attrs.ry) ?? 0;
  const radius = Math.max(0, Math.min(rawRadius, width / 2, height / 2));
  if (!hasRotationOrSkew(matrix)) {
    const [a, b, c, d, e, f] = matrix;
    const cornerOneX = a * x + c * y + e;
    const cornerTwoX = a * (x + width) + c * (y + height) + e;
    const cornerOneY = b * x + d * y + f;
    const cornerTwoY = b * (x + width) + d * (y + height) + f;
    return {
      kind: "rect",
      x: round(Math.min(cornerOneX, cornerTwoX)),
      y: round(Math.min(cornerOneY, cornerTwoY)),
      width: round(Math.abs(a) * width),
      height: round(Math.abs(d) * height),
      rx: round(radius * Math.min(Math.abs(a), Math.abs(d))),
      fill: withAlpha(paint.fill, paint.fillOpacity, "fill", ctx),
      stroke: withAlpha(paint.stroke, paint.strokeOpacity, "stroke", ctx),
      strokeWidth:
        paint.strokeWidth == null ? null : round(paint.strokeWidth * strokeScaleFor(matrix)),
      opacity: round(paint.opacity),
    };
  }
  ctx.warnOnce(
    "rect:rotated",
    "rotated/skewed <rect> emitted as a 4-corner path (corner radius ignored)",
  );
  const corners = pointsToPathData(
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
    true,
  );
  if (!corners) return null;
  return pathNodeFromUserData(corners, paint, matrix, ctx);
}

function buildCircleElement(attrs, paint, matrix, ctx) {
  const centerX = parseNumber(attrs.cx) ?? 0;
  const centerY = parseNumber(attrs.cy) ?? 0;
  const radius = parseNumber(attrs.r);
  if (radius == null || radius <= 0) {
    ctx.warnOnce("circle:radius", "<circle> without a positive r skipped");
    return null;
  }
  const userData = circlePathData(centerX, centerY, radius, radius);
  return pathNodeFromUserData(userData, paint, matrix, ctx);
}

function buildEllipseElement(attrs, paint, matrix, ctx) {
  const centerX = parseNumber(attrs.cx) ?? 0;
  const centerY = parseNumber(attrs.cy) ?? 0;
  const radiusX = parseNumber(attrs.rx);
  const radiusY = parseNumber(attrs.ry);
  if (radiusX == null || radiusY == null || radiusX <= 0 || radiusY <= 0) {
    ctx.warnOnce("ellipse:radius", "<ellipse> without positive rx/ry skipped");
    return null;
  }
  const userData = circlePathData(centerX, centerY, radiusX, radiusY);
  return pathNodeFromUserData(userData, paint, matrix, ctx);
}

function buildLineElement(attrs, paint, matrix, ctx) {
  const x1 = parseNumber(attrs.x1) ?? 0;
  const y1 = parseNumber(attrs.y1) ?? 0;
  const x2 = parseNumber(attrs.x2) ?? 0;
  const y2 = parseNumber(attrs.y2) ?? 0;
  const userData = `M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)}`;
  return pathNodeFromUserData(userData, paint, matrix, ctx);
}

function buildPointsElement(close) {
  return (attrs, paint, matrix, ctx) => {
    const points = readPoints(attrs.points, ctx);
    if (points.length < 2) {
      ctx.warnOnce("points:empty", `<${close ? "polygon" : "polyline"}> with fewer than 2 points skipped`);
      return null;
    }
    const userData = pointsToPathData(points, close);
    if (!userData) return null;
    return pathNodeFromUserData(userData, paint, matrix, ctx);
  };
}

const SHAPE_BUILDERS = {
  path: buildPathElement,
  rect: buildRectElement,
  circle: buildCircleElement,
  ellipse: buildEllipseElement,
  line: buildLineElement,
  polyline: buildPointsElement(false),
  polygon: buildPointsElement(true),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a raw SVG document into VOO node specs.
 *
 * @param {string} svgText Raw SVG markup from the model.
 * @param {{ targetWidth?: number, targetHeight?: number, maxNodes?: number }} [options]
 *   targetWidth/targetHeight define the destination frame; when only one is
 *   given the other is derived from the source aspect ratio, and when neither
 *   is given the svg viewport (width/height, else viewBox size) is used.
 *   maxNodes caps the emitted node count (default 400).
 * @returns {{ width: number, height: number, viewBox: number[] | null,
 *   nodes: object[], warnings: string[] }} Never throws.
 */
export function parseSvgToNodes(svgText, options = {}) {
  const safeOptions = options && typeof options === "object" ? options : {};
  const { targetWidth, targetHeight, maxNodes = DEFAULT_MAX_NODES } = safeOptions;
  const ctx = createContext();
  const emptyResult = (width = 0, height = 0, viewBox = null) => ({
    width,
    height,
    viewBox,
    nodes: [],
    warnings: ctx.warnings,
  });

  if (typeof svgText !== "string" || svgText.trim() === "") {
    ctx.warnings.push("empty or invalid SVG input: expected a non-empty string");
    return emptyResult();
  }

  try {
    const markup = parseMarkup(svgText);
    const svg = findElement(markup, "svg");
    if (!svg) {
      ctx.warnings.push("no <svg> root element found");
      return emptyResult();
    }

    const viewBoxRaw = svg.attrs.viewBox ?? svg.attrs.viewbox;
    const viewBox = parseViewBox(viewBoxRaw);
    if (viewBoxRaw != null && !viewBox) {
      ctx.warnOnce("viewbox:invalid", `invalid viewBox ignored: ${JSON.stringify(viewBoxRaw)}`);
    }
    const svgWidth = parseLength(svg.attrs.width);
    const svgHeight = parseLength(svg.attrs.height);
    const sourceWidth = viewBox ? viewBox[2] : svgWidth && svgWidth > 0 ? svgWidth : DEFAULT_SOURCE_SIZE;
    const sourceHeight = viewBox
      ? viewBox[3]
      : svgHeight && svgHeight > 0
        ? svgHeight
        : DEFAULT_SOURCE_SIZE;
    // Default destination when no target is requested: the svg viewport
    // (width/height attributes) or, absent those, the viewBox size.
    const intrinsicWidth = svgWidth && svgWidth > 0 ? svgWidth : sourceWidth;
    const intrinsicHeight = svgHeight && svgHeight > 0 ? svgHeight : sourceHeight;

    let width = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : null;
    let height = Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : null;
    if (width === null && height === null) {
      width = intrinsicWidth;
      height = intrinsicHeight;
    } else if (width === null) {
      width = (height * sourceWidth) / sourceHeight;
    } else if (height === null) {
      height = (width * sourceHeight) / sourceWidth;
    }

    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const offsetX = (width - sourceWidth * scale) / 2 - (viewBox ? viewBox[0] : 0) * scale;
    const offsetY = (height - sourceHeight * scale) / 2 - (viewBox ? viewBox[1] : 0) * scale;
    const viewBoxMatrix = [scale, 0, 0, scale, offsetX, offsetY];
    const outerMatrix = parseTransformMatrix(svg.attrs.transform, ctx);
    const rootMatrix = multiplyMatrix(outerMatrix, viewBoxMatrix);

    const limit = Number.isFinite(maxNodes)
      ? Math.max(0, Math.floor(maxNodes))
      : DEFAULT_MAX_NODES;
    const nodes = [];
    let limitWarned = false;

    const addNode = (tag, attrs, node) => {
      if (nodes.length >= limit) {
        if (!limitWarned) {
          limitWarned = true;
          ctx.warnings.push(`node limit reached (maxNodes=${limit}); remaining shapes skipped`);
        }
        return false;
      }
      const rawId = typeof attrs.id === "string" ? attrs.id.trim() : "";
      node.name = rawId || `${tag}-${nodes.length + 1}`;
      nodes.push(node);
      return true;
    };

    const walk = (element, inheritedPaint, inheritedMatrix) => {
      const tag = element.tag;
      if (SKIP_SUBTREE_TAGS.has(tag)) {
        ctx.warnOnce(`tag:${tag}`, `unsupported element <${tag}> ignored`);
        return true;
      }
      const parsedStyle = parseStyle(element.attrs.style);
      const display = String(parsedStyle.display ?? element.attrs.display ?? "")
        .trim()
        .toLowerCase();
      const visibility = String(parsedStyle.visibility ?? element.attrs.visibility ?? "")
        .trim()
        .toLowerCase();
      if (display === "none" || visibility === "hidden") {
        ctx.warnOnce(`hidden:${tag}`, `hidden element <${tag}> skipped (display:none / visibility:hidden)`);
        return true;
      }
      const paint = resolvePaint(element.attrs, inheritedPaint, ctx, parsedStyle);
      const matrix = multiplyMatrix(
        inheritedMatrix,
        parseTransformMatrix(element.attrs.transform, ctx),
      );
      if (CONTAINER_TAGS.has(tag)) {
        for (const child of element.children) {
          if (!walk(child, paint, matrix)) return false;
        }
        return true;
      }
      const builder = SHAPE_BUILDERS[tag];
      if (!builder) {
        ctx.warnOnce(`tag:${tag}`, `unsupported element <${tag}> ignored`);
        for (const child of element.children) {
          if (!walk(child, paint, matrix)) return false;
        }
        return true;
      }
      const node = builder(element.attrs, paint, matrix, ctx);
      if (!node) return true;
      return addNode(tag, element.attrs, node);
    };

    const rootPaint = resolvePaint(svg.attrs, BASE_PAINT, ctx);
    for (const child of svg.children) {
      if (!walk(child, rootPaint, rootMatrix)) break;
    }

    return {
      width: round(width),
      height: round(height),
      viewBox: viewBox ? viewBox.map((value) => round(value)) : null,
      nodes,
      warnings: ctx.warnings,
    };
  } catch (error) {
    ctx.warnings.push(`unexpected SVG parser error: ${error?.message || String(error)}`);
    return emptyResult();
  }
}
