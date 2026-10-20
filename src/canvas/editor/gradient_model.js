/**
 * Pure CSS Gradient model and normalizer for editor and HTML import.
 *
 * Maps CSS linear-gradient, radial-gradient, and conic-gradient into
 * structured round-trip models with stops, angle, and geometry,
 * while detecting unsupported gradient extensions.
 */

const GRADIENT_TYPE_RE = /^(repeating-)?(linear|radial|conic)-gradient\(/i;

export const GRADIENT_TYPES = ["linear", "radial", "conic"];

const DIRECTION_ANGLES = {
  "to top": 0,
  "to right": 90,
  "to bottom": 180,
  "to left": 270,
  "to top right": 45,
  "to right top": 45,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom left": 225,
  "to left bottom": 225,
  "to top left": 315,
  "to left top": 315,
};

const NAMED_COLORS = {
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  orange: "#ffa500",
  transparent: "#000000",
};

export function parseAngleDegrees(raw) {
  if (!raw) return 180; // CSS default is 180deg (to bottom)
  const str = String(raw).trim().toLowerCase();
  if (DIRECTION_ANGLES[str] != null) return DIRECTION_ANGLES[str];
  if (str.endsWith("deg")) {
    const num = Number.parseFloat(str);
    return Number.isFinite(num) ? ((num % 360) + 360) % 360 : 180;
  }
  if (str.endsWith("rad")) {
    const rad = Number.parseFloat(str);
    if (Number.isFinite(rad)) {
      const deg = (rad * 180) / Math.PI;
      return ((deg % 360) + 360) % 360;
    }
  }
  if (str.endsWith("turn")) {
    const turn = Number.parseFloat(str);
    if (Number.isFinite(turn)) {
      const deg = turn * 360;
      return ((deg % 360) + 360) % 360;
    }
  }
  const directNum = Number.parseFloat(str);
  if (Number.isFinite(directNum)) {
    return ((directNum % 360) + 360) % 360;
  }
  return 180;
}

export function parseColorAndAlpha(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { color: "#000000", opacity: 100 };

  // Hex (#rgb, #rgba, #rrggbb, #rrggbbaa)
  const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      hex = [...hex].map((c) => c + c).join("");
    }
    if (hex.length === 6) {
      return { color: `#${hex.toLowerCase()}`, opacity: 100 };
    }
    if (hex.length === 8) {
      const alpha = Number.parseInt(hex.slice(6), 16) / 255;
      return {
        color: `#${hex.slice(0, 6).toLowerCase()}`,
        opacity: Math.max(0, Math.min(100, Math.round(alpha * 100))),
      };
    }
  }

  // rgba?()
  const rgbMatch = /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*([\d.]+%?))?\s*\)$/i.exec(value);
  if (rgbMatch) {
    const toChan = (p) => (p.endsWith("%") ? Math.round((Number.parseFloat(p) / 100) * 255) : Math.round(Number.parseFloat(p)));
    const r = Math.max(0, Math.min(255, toChan(rgbMatch[1]))).toString(16).padStart(2, "0");
    const g = Math.max(0, Math.min(255, toChan(rgbMatch[2]))).toString(16).padStart(2, "0");
    const b = Math.max(0, Math.min(255, toChan(rgbMatch[3]))).toString(16).padStart(2, "0");
    let alpha = 100;
    if (rgbMatch[4] != null && rgbMatch[4] !== "") {
      const a = Number.parseFloat(rgbMatch[4]);
      alpha = rgbMatch[4].endsWith("%") ? a : a * 100;
    }
    return {
      color: `#${(r + g + b).toLowerCase()}`,
      opacity: Math.max(0, Math.min(100, Math.round(alpha))),
    };
  }

  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) {
    return { color: named.toLowerCase(), opacity: value.toLowerCase() === "transparent" ? 0 : 100 };
  }
  return { color: "#000000", opacity: 100 };
}

function splitArguments(body) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < body.length) parts.push(body.slice(start).trim());
  return parts.filter(Boolean);
}

export function normalizeGradientStops(rawStops) {
  if (!Array.isArray(rawStops) || rawStops.length === 0) {
    return [
      { color: "#000000", position: 0, opacity: 100 },
      { color: "#ffffff", position: 100, opacity: 100 },
    ];
  }

  const normalized = rawStops.map((stop) => {
    const { color, opacity } = parseColorAndAlpha(stop.color);
    let pos = stop.position ?? (stop.location != null ? stop.location * 100 : null);
    if (typeof pos === "string") {
      pos = pos.endsWith("%") ? Number.parseFloat(pos) : Number.parseFloat(pos);
    }
    return {
      color,
      opacity: stop.opacity != null ? Math.max(0, Math.min(100, stop.opacity)) : opacity,
      position: Number.isFinite(pos) ? Math.max(0, Math.min(100, pos)) : null,
    };
  });

  // Infer missing positions
  if (normalized[0].position == null) normalized[0].position = 0;
  if (normalized[normalized.length - 1].position == null) {
    normalized[normalized.length - 1].position = 100;
  }
  let prevKnown = 0;
  for (let i = 1; i < normalized.length; i += 1) {
    if (normalized[i].position != null) {
      const step = (normalized[i].position - normalized[prevKnown].position) / (i - prevKnown);
      for (let j = prevKnown + 1; j < i; j += 1) {
        normalized[j].position = Math.round(normalized[prevKnown].position + step * (j - prevKnown));
      }
      prevKnown = i;
    }
  }

  normalized.sort((a, b) => a.position - b.position);
  if (normalized.length === 1) {
    normalized.push({ color: normalized[0].color, position: 100, opacity: normalized[0].opacity });
  }
  return normalized;
}

/**
 * Normalizes a CSS gradient string or gradient object into a structured contract.
 */
export function normalizeGradient(input) {
  if (!input) return null;
  if (typeof input === "object" && input.type && Array.isArray(input.stops)) {
    return {
      type: GRADIENT_TYPES.includes(input.type) ? input.type : "linear",
      angle: parseAngleDegrees(input.angle ?? 180),
      stops: normalizeGradientStops(input.stops),
      geometry: input.geometry ?? { centerX: 50, centerY: 50, width: 100, height: 100 },
    };
  }

  const str = String(input).trim();
  const match = GRADIENT_TYPE_RE.exec(str);
  if (!match) return null;

  const type = match[2].toLowerCase();
  const openParen = str.indexOf("(");
  const lastClose = str.lastIndexOf(")");
  if (openParen < 0 || lastClose <= openParen) return null;

  const body = str.slice(openParen + 1, lastClose).trim();
  const args = splitArguments(body);
  if (args.length === 0) return null;

  let angle = 180;
  let stopArgs = args;
  const geometry = { centerX: 50, centerY: 50, width: 100, height: 100 };

  if (type === "linear") {
    const first = args[0].toLowerCase();
    if (
      first.endsWith("deg") ||
      first.endsWith("rad") ||
      first.endsWith("turn") ||
      first.startsWith("to ")
    ) {
      angle = parseAngleDegrees(first);
      stopArgs = args.slice(1);
    }
  } else if (type === "radial") {
    const first = args[0].toLowerCase();
    if (first.includes("circle") || first.includes("at ") || first.includes("ellipse")) {
      const atMatch = /at\s+([\d.]+%?)\s+([\d.]+%?)/i.exec(first);
      if (atMatch) {
        geometry.centerX = Number.parseFloat(atMatch[1]) || 50;
        geometry.centerY = Number.parseFloat(atMatch[2]) || 50;
      }
      stopArgs = args.slice(1);
    }
  } else if (type === "conic") {
    const first = args[0].toLowerCase();
    if (first.startsWith("from ") || first.includes("at ")) {
      const fromMatch = /from\s+([\d.]+(?:deg|rad|turn)?)/i.exec(first);
      if (fromMatch) angle = parseAngleDegrees(fromMatch[1]);
      const atMatch = /at\s+([\d.]+%?)\s+([\d.]+%?)/i.exec(first);
      if (atMatch) {
        geometry.centerX = Number.parseFloat(atMatch[1]) || 50;
        geometry.centerY = Number.parseFloat(atMatch[2]) || 50;
      }
      stopArgs = args.slice(1);
    }
  }

  const stops = [];
  for (const s of stopArgs) {
    const parts = s.trim().split(/\s+(?=[^)]*(?:\(|$))/);
    const colPart = parts[0];
    const posPart = parts[1] || null;
    stops.push({ color: colPart, position: posPart });
  }

  return {
    type,
    angle,
    stops: normalizeGradientStops(stops),
    geometry,
  };
}

/**
 * Formats a normalized gradient into canonical CSS gradient string.
 */
export function formatGradientString(gradient) {
  if (!gradient || !gradient.stops) return "";
  const stopsStr = gradient.stops
    .map((s) => {
      let c = s.color;
      if (s.opacity != null && s.opacity < 100) {
        const hex = s.color.replace("#", "");
        const r = Number.parseInt(hex.slice(0, 2), 16) || 0;
        const g = Number.parseInt(hex.slice(2, 4), 16) || 0;
        const b = Number.parseInt(hex.slice(4, 6), 16) || 0;
        c = `rgba(${r}, ${g}, ${b}, ${Math.round((s.opacity / 100) * 100) / 100})`;
      }
      return `${c} ${s.position}%`;
    })
    .join(", ");

  if (gradient.type === "radial") {
    const geo = gradient.geometry ?? { centerX: 50, centerY: 50 };
    return `radial-gradient(circle at ${geo.centerX}% ${geo.centerY}%, ${stopsStr})`;
  }
  if (gradient.type === "conic") {
    const geo = gradient.geometry ?? { centerX: 50, centerY: 50 };
    return `conic-gradient(from ${gradient.angle ?? 0}deg at ${geo.centerX}% ${geo.centerY}%, ${stopsStr})`;
  }
  return `linear-gradient(${gradient.angle ?? 180}deg, ${stopsStr})`;
}

/**
 * Detects unsupported CSS gradient features (repeating gradients, vendor syntax).
 */
export function checkUnsupportedGradient(cssValue) {
  if (!cssValue || typeof cssValue !== "string") return null;
  const str = cssValue.trim().toLowerCase();
  if (str.startsWith("repeating-linear-gradient")) return "unsupported-gradient:repeating-linear";
  if (str.startsWith("repeating-radial-gradient")) return "unsupported-gradient:repeating-radial";
  if (str.startsWith("repeating-conic-gradient")) return "unsupported-gradient:repeating-conic";
  if (str.startsWith("-webkit-gradient")) return "unsupported-gradient:legacy-webkit";
  return null;
}
