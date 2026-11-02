import {
  formatDiamondGradient,
  isDiamondGradient,
  parseDiamondGradient,
} from "./diamond_gradient.js";
import {
  formatMeshGradient,
  isMeshGradient,
  parseMeshGradient,
  MESH_GRADIENT_PRESETS,
} from "./mesh_gradient.js";

export {
  formatMeshGradient,
  isMeshGradient,
  parseMeshGradient,
  MESH_GRADIENT_PRESETS,
};

const LINEAR_CENTER_METADATA =
  /\/\*\s*voo-gradient-center:\s*(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?\s*\*\//i;
const LINEAR_ENDPOINT_METADATA =
  /\/\*\s*voo-gradient-line:\s*(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?\s*\*\//i;

export const DEFAULT_STOPS = [
  { color: "#FFFFFF", opacity: 100, position: 0 },
  { color: "#A651FF", opacity: 100, position: 100 },
];

export const DEFAULT_GRADIENT_GEOMETRY = {
  centerX: 50,
  centerY: 50,
  width: 100,
  height: 100,
};

export function isCssGradient(value) {
  return (
    /^(?:linear|radial|conic)-gradient\(/i.test(value?.trim() ?? "") ||
    isDiamondGradient(value) ||
    isMeshGradient(value)
  );
}

export function resolveActiveFillBackground(input) {
  const backgroundImage = input?.backgroundImage?.trim();
  if (!backgroundImage || input?.fillType === "solid") return undefined;

  const isGradient = isCssGradient(backgroundImage);
  if (input.fillType === "image") {
    return isGradient ? undefined : backgroundImage;
  }
  if (
    input.fillType === "linear" ||
    input.fillType === "radial" ||
    input.fillType === "angular" ||
    input.fillType === "diamond" ||
    input.fillType === "mesh"
  ) {
    return isGradient ? backgroundImage : undefined;
  }

  return backgroundImage;
}

function clampCenterPercent(value) {
  return Math.round(Math.max(-200, Math.min(300, value)) * 100) / 100;
}

function clampSizePercent(value) {
  return Math.round(Math.max(0, Math.min(400, value)) * 100) / 100;
}

function splitGradientParts(value) {
  const parts = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseHexColor(value) {
  const normalized = value.toUpperCase();
  if (!/^#[0-9A-F]{3,8}$/.test(normalized)) {
    return { color: "#FFFFFF", opacity: 100 };
  }

  if (normalized.length === 4) {
    return {
      color: `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`,
      opacity: 100,
    };
  }

  if (normalized.length === 5) {
    return {
      color: `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`,
      opacity: Math.round(
        (parseInt(`${normalized[4]}${normalized[4]}`, 16) / 255) * 100,
      ),
    };
  }

  if (normalized.length === 9) {
    return {
      color: normalized.slice(0, 7),
      opacity: Math.round((parseInt(normalized.slice(7, 9), 16) / 255) * 100),
    };
  }

  return { color: normalized.slice(0, 7), opacity: 100 };
}

function parseStop(value, fallbackPosition) {
  const match = value.match(/^(.*?)(?:\s+(-?\d+(?:\.\d+)?)%)?$/);
  const colorValue = match?.[1]?.trim() || "#FFFFFF";
  const positionValue = match?.[2];
  const rgbaMatch = colorValue.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );

  let color = "#FFFFFF";
  let opacity = 100;
  if (rgbaMatch) {
    color = `#${[rgbaMatch[1], rgbaMatch[2], rgbaMatch[3]]
      .map((channel) =>
        Math.max(0, Math.min(255, Number(channel)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`.toUpperCase();
    opacity = rgbaMatch[4]
      ? Math.round(Math.max(0, Math.min(1, Number(rgbaMatch[4]))) * 100)
      : 100;
  } else if (colorValue.startsWith("#")) {
    ({ color, opacity } = parseHexColor(colorValue));
  }

  return {
    color,
    opacity,
    position: Math.max(
      0,
      Math.min(
        100,
        positionValue === undefined ? fallbackPosition : Number(positionValue),
      ),
    ),
  };
}

export function parseGradient(value) {
  const diamond = parseDiamondGradient(value);
  if (diamond) {
    return { type: "diamond", ...diamond };
  }

  const mesh = parseMeshGradient(value);
  if (mesh) {
    return mesh;
  }

  if (!isCssGradient(value)) {
    return {
      type: "solid",
      angle: "135deg",
      stops: DEFAULT_STOPS,
      geometry: DEFAULT_GRADIENT_GEOMETRY,
    };
  }

  const isLinear = value.includes("linear-gradient");
  const isAngular = value.includes("conic-gradient");
  const type = isLinear ? "linear" : isAngular ? "angular" : "radial";
  const openParen = value.indexOf("(");
  const closeParen = value.lastIndexOf(")");
  if (openParen < 0 || closeParen <= openParen) {
    return {
      type,
      angle: "135deg",
      stops: DEFAULT_STOPS,
      geometry: DEFAULT_GRADIENT_GEOMETRY,
    };
  }

  const parts = splitGradientParts(value.slice(openParen + 1, closeParen));
  let angle = "135deg";
  let stopParts = parts;
  let geometry = { ...DEFAULT_GRADIENT_GEOMETRY };

  if (isLinear) {
    const endpointMetadata = value.match(LINEAR_ENDPOINT_METADATA);
    const centerMetadata = value.match(LINEAR_CENTER_METADATA);
    if (endpointMetadata) {
      const startX = clampCenterPercent(Number(endpointMetadata[1]));
      const startY = clampCenterPercent(Number(endpointMetadata[2]));
      const endX = clampCenterPercent(Number(endpointMetadata[3]));
      const endY = clampCenterPercent(Number(endpointMetadata[4]));
      geometry = {
        ...geometry,
        centerX: (startX + endX) / 2,
        centerY: (startY + endY) / 2,
        startX,
        startY,
        endX,
        endY,
      };
    } else if (centerMetadata) {
      geometry = {
        ...geometry,
        centerX: clampCenterPercent(Number(centerMetadata[1])),
        centerY: clampCenterPercent(Number(centerMetadata[2])),
      };
    }
  }

  if (isLinear && (parts[0]?.includes("deg") || parts[0]?.includes("to "))) {
    angle = parts[0];
    stopParts = parts.slice(1);
  } else if (isAngular) {
    const angleMatch = parts[0]?.match(
      /^from\s+(-?\d+(?:\.\d+)?)deg(?:\s+at\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%)?$/i,
    );
    if (angleMatch) {
      angle = `${angleMatch[1]}deg`;
      if (angleMatch[2] !== undefined && angleMatch[3] !== undefined) {
        geometry = {
          ...geometry,
          centerX: clampCenterPercent(Number(angleMatch[2])),
          centerY: clampCenterPercent(Number(angleMatch[3])),
        };
      }
      stopParts = parts.slice(1);
    }
  } else {
    const radialMatch = parts[0]?.match(
      /^(?:circle|ellipse)(?:\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%)?(?:\s+at\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%)?$/i,
    );
    if (radialMatch) {
      geometry = {
        centerX:
          radialMatch[3] === undefined
            ? geometry.centerX
            : clampCenterPercent(Number(radialMatch[3])),
        centerY:
          radialMatch[4] === undefined
            ? geometry.centerY
            : clampCenterPercent(Number(radialMatch[4])),
        width:
          radialMatch[1] === undefined
            ? geometry.width
            : clampSizePercent(Number(radialMatch[1]) * 2),
        height:
          radialMatch[2] === undefined
            ? geometry.height
            : clampSizePercent(Number(radialMatch[2]) * 2),
      };
      stopParts = parts.slice(1);
    }
  }

  const lastIndex = Math.max(1, stopParts.length - 1);
  const stops = stopParts.map((part, index) =>
    parseStop(part, (index / lastIndex) * 100),
  );
  if (stops.length < 2) {
    return {
      type,
      angle,
      stops: [stops[0] ?? DEFAULT_STOPS[0], DEFAULT_STOPS[1]],
      geometry,
    };
  }

  return { type, angle, stops, geometry };
}

function opacityToHex(opacity) {
  return Math.round((Math.max(0, Math.min(100, opacity)) / 100) * 255)
    .toString(16)
    .padStart(2, "0");
}

export function formatGradient(
  type,
  angle,
  stops,
  geometry = DEFAULT_GRADIENT_GEOMETRY,
) {
  if (type === "diamond") {
    return formatDiamondGradient(angle, stops, geometry);
  }
  if (type === "mesh") {
    return formatMeshGradient({ points: geometry?.points, blur: geometry?.blur });
  }

  const stopStrings = [...(stops || [])]
    .sort((left, right) => left.position - right.position)
    .map((stop) => {
      const alphaHex = opacityToHex(stop.opacity);
      const colorWithAlpha =
        alphaHex === "ff"
          ? stop.color
          : `${stop.color}${alphaHex}`.toUpperCase();
      return `${colorWithAlpha} ${Math.max(0, Math.min(100, stop.position))}%`;
    });

  if (type === "linear") {
    const gradient = `linear-gradient(${angle}, ${stopStrings.join(", ")})`;
    if (
      geometry.startX !== undefined &&
      geometry.startY !== undefined &&
      geometry.endX !== undefined &&
      geometry.endY !== undefined
    ) {
      return `${gradient} /* voo-gradient-line: ${clampCenterPercent(geometry.startX)}% ${clampCenterPercent(geometry.startY)}% ${clampCenterPercent(geometry.endX)}% ${clampCenterPercent(geometry.endY)}% */`;
    }
    if (geometry.centerX === 50 && geometry.centerY === 50) return gradient;
    return `${gradient} /* voo-gradient-center: ${clampCenterPercent(geometry.centerX)}% ${clampCenterPercent(geometry.centerY)}% */`;
  }
  if (type === "angular") {
    return `conic-gradient(from ${angle} at ${clampCenterPercent(geometry.centerX)}% ${clampCenterPercent(geometry.centerY)}%, ${stopStrings.join(", ")})`;
  }
  return `radial-gradient(ellipse ${clampSizePercent(geometry.width) / 2}% ${clampSizePercent(geometry.height) / 2}% at ${clampCenterPercent(geometry.centerX)}% ${clampCenterPercent(geometry.centerY)}%, ${stopStrings.join(", ")})`;
}

function interpolateChannel(left, right, ratio) {
  return Math.round(left + (right - left) * ratio);
}

function interpolateColor(left, right, ratio) {
  const leftValue = parseInt(left.slice(1), 16);
  const rightValue = parseInt(right.slice(1), 16);
  const channels = [16, 8, 0].map((shift) =>
    interpolateChannel(
      (leftValue >> shift) & 0xff,
      (rightValue >> shift) & 0xff,
      ratio,
    ),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function insertGradientStop(stops, position) {
  const nextPosition = Math.max(0, Math.min(100, position));
  const sorted = [...stops].sort(
    (left, right) => left.position - right.position,
  );
  const rightIndex = sorted.findIndex((stop) => stop.position >= nextPosition);
  const left =
    sorted[Math.max(0, rightIndex <= 0 ? 0 : rightIndex - 1)] ??
    DEFAULT_STOPS[0];
  const right =
    sorted[rightIndex < 0 ? sorted.length - 1 : rightIndex] ?? DEFAULT_STOPS[1];
  const distance = right.position - left.position;
  const ratio =
    distance === 0 ? 0.5 : (nextPosition - left.position) / distance;
  const inserted = {
    color: interpolateColor(left.color, right.color, ratio),
    opacity: Math.round(left.opacity + (right.opacity - left.opacity) * ratio),
    position: nextPosition,
  };
  const nextStops = [...sorted, inserted].sort(
    (leftStop, rightStop) => leftStop.position - rightStop.position,
  );
  return { stops: nextStops, insertedIndex: nextStops.indexOf(inserted) };
}

export function getGradientInsertionPosition(stops) {
  const positions = [...stops]
    .map((stop) => Math.max(0, Math.min(100, stop.position)))
    .sort((left, right) => left - right);
  if (positions.length < 2) return 50;

  let largestGap = -1;
  let midpoint = 50;
  for (let index = 1; index < positions.length; index += 1) {
    const gap = positions[index] - positions[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      midpoint = positions[index - 1] + gap / 2;
    }
  }
  return Math.round(midpoint * 100) / 100;
}

/** Normalize a degree value while allowing 360° to remain a visible endpoint. */
export function normalizeGradientAngle(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return `${Math.max(0, Math.min(360, numericValue))}deg`;
}
