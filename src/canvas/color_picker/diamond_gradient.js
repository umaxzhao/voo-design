export const DIAMOND_MARKER = 'data-gradient-type="diamond"';
export const SVG_DATA_PREFIX = "data:image/svg+xml,";
const FALLBACK_STOPS = [
  { color: "#FFFFFF", opacity: 100, position: 0 },
  { color: "#A651FF", opacity: 100, position: 100 },
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function normalizeColor(value) {
  return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)
    ? value.toUpperCase()
    : "#FFFFFF";
}

function normalizeStops(stops) {
  const normalized = (stops || [])
    .map((stop) => ({
      color: normalizeColor(stop.color),
      opacity: round(clamp(stop.opacity ?? 100, 0, 100)),
      position: round(clamp(stop.position ?? 0, 0, 100)),
    }))
    .sort((left, right) => left.position - right.position);

  return normalized.length >= 2 ? normalized : FALLBACK_STOPS;
}

function normalizeGeometry(geometry) {
  return {
    centerX: round(clamp(geometry?.centerX ?? 50, -200, 300)),
    centerY: round(clamp(geometry?.centerY ?? 50, -200, 300)),
    width: round(clamp(geometry?.width ?? 100, 0, 400)),
    height: round(clamp(geometry?.height ?? 100, 0, 400)),
  };
}

function normalizeAngle(angle) {
  const value = Number.parseFloat(angle);
  return `${round(Number.isFinite(value) ? value : 0)}deg`;
}

function stopMarkup(stops) {
  return stops
    .map(
      (stop) =>
        `<stop offset="${stop.position}%" stop-color="${stop.color}" stop-opacity="${stop.opacity / 100}"/>`,
    )
    .join("");
}

function unwrapDataUrl(value) {
  const match = (value || "")
    .trim()
    .match(/^url\((['"]?)(data:image\/svg\+xml,[\s\S]*)\1\)$/i);
  return match?.[2];
}

function decodeSvg(value) {
  const dataUrl = unwrapDataUrl(value);
  if (!dataUrl?.startsWith(SVG_DATA_PREFIX)) return undefined;

  try {
    return decodeURIComponent(dataUrl.slice(SVG_DATA_PREFIX.length));
  } catch {
    return undefined;
  }
}

function readAttribute(svg, name) {
  const match = svg.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1];
}

export function isDiamondGradient(value) {
  if (!value) return false;
  return decodeSvg(value)?.includes(DIAMOND_MARKER) === true;
}

export function formatDiamondGradient(angle, stops, geometry) {
  const normalizedStops = normalizeStops(stops);
  const normalizedGeometry = normalizeGeometry(geometry);
  const normalizedAngle = normalizeAngle(angle);
  const angleDegrees = Number.parseFloat(normalizedAngle);
  const { centerX, centerY, width, height } = normalizedGeometry;
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;
  const stopsAttribute = encodeURIComponent(JSON.stringify(normalizedStops));
  const stopsSvg = stopMarkup(normalizedStops);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" ` +
    `${DIAMOND_MARKER} data-angle="${normalizedAngle}" data-center-x="${centerX}" data-center-y="${centerY}" ` +
    `data-width="${width}" data-height="${height}" data-stops="${stopsAttribute}">` +
    `<defs>` +
    `<linearGradient id="top" gradientUnits="userSpaceOnUse" x1="${centerX}" y1="${centerY}" x2="${centerX}" y2="${top}">${stopsSvg}</linearGradient>` +
    `<linearGradient id="right" gradientUnits="userSpaceOnUse" x1="${centerX}" y1="${centerY}" x2="${right}" y2="${centerY}">${stopsSvg}</linearGradient>` +
    `<linearGradient id="bottom" gradientUnits="userSpaceOnUse" x1="${centerX}" y1="${centerY}" x2="${centerX}" y2="${bottom}">${stopsSvg}</linearGradient>` +
    `<linearGradient id="left" gradientUnits="userSpaceOnUse" x1="${centerX}" y1="${centerY}" x2="${left}" y2="${centerY}">${stopsSvg}</linearGradient>` +
    `</defs>` +
    `<g transform="rotate(${angleDegrees} ${centerX} ${centerY})">` +
    `<polygon points="-200,-200 300,-200 ${centerX},${centerY}" fill="url(#top)"/>` +
    `<polygon points="300,-200 300,300 ${centerX},${centerY}" fill="url(#right)"/>` +
    `<polygon points="300,300 -200,300 ${centerX},${centerY}" fill="url(#bottom)"/>` +
    `<polygon points="-200,300 -200,-200 ${centerX},${centerY}" fill="url(#left)"/>` +
    `</g></svg>`;

  return `url("${SVG_DATA_PREFIX}${encodeURIComponent(svg)}")`;
}

export function parseDiamondGradient(value) {
  const svg = decodeSvg(value);
  if (!svg?.includes(DIAMOND_MARKER)) return undefined;

  const centerX = Number(readAttribute(svg, "data-center-x"));
  const centerY = Number(readAttribute(svg, "data-center-y"));
  const width = Number(readAttribute(svg, "data-width"));
  const height = Number(readAttribute(svg, "data-height"));
  const angle = readAttribute(svg, "data-angle") ?? "0deg";
  const stopsValue = readAttribute(svg, "data-stops");
  if (
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !stopsValue
  ) {
    return undefined;
  }

  try {
    const parsedStops = JSON.parse(decodeURIComponent(stopsValue));
    if (!Array.isArray(parsedStops)) return undefined;
    const stops = parsedStops.filter(
      (stop) =>
        typeof stop === "object" &&
        stop !== null &&
        typeof stop.color === "string" &&
        typeof stop.opacity === "number" &&
        typeof stop.position === "number",
    );
    if (stops.length < 2) return undefined;

    return {
      angle: normalizeAngle(angle),
      stops: normalizeStops(stops),
      geometry: normalizeGeometry({ centerX, centerY, width, height }),
    };
  } catch {
    return undefined;
  }
}
