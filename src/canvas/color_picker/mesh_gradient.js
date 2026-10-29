export const MESH_MARKER = 'data-gradient-type="mesh"';
export const SVG_DATA_PREFIX = "data:image/svg+xml,";

export const MESH_GRADIENT_PRESETS = Object.freeze({
  aurora: [
    { x: 15, y: 20, color: "#00F2FE", opacity: 90 },
    { x: 85, y: 15, color: "#4FACFE", opacity: 85 },
    { x: 20, y: 80, color: "#43E97B", opacity: 80 },
    { x: 80, y: 85, color: "#38F9D7", opacity: 75 },
  ],
  sunset: [
    { x: 20, y: 20, color: "#FA709A", opacity: 90 },
    { x: 80, y: 25, color: "#FEE140", opacity: 85 },
    { x: 25, y: 80, color: "#FF0844", opacity: 80 },
    { x: 75, y: 75, color: "#FFB199", opacity: 75 },
  ],
  ocean: [
    { x: 20, y: 20, color: "#2E3192", opacity: 90 },
    { x: 80, y: 20, color: "#1BFFFF", opacity: 85 },
    { x: 25, y: 80, color: "#009245", opacity: 80 },
    { x: 75, y: 80, color: "#FCEE21", opacity: 75 },
  ],
  neon: [
    { x: 20, y: 25, color: "#B224EF", opacity: 90 },
    { x: 80, y: 20, color: "#7579FF", opacity: 85 },
    { x: 25, y: 80, color: "#F857A6", opacity: 80 },
    { x: 75, y: 75, color: "#FF5858", opacity: 75 },
  ],
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

export function isMeshGradient(value) {
  if (!value) return false;
  return decodeSvg(value)?.includes(MESH_MARKER) === true;
}

export function formatMeshGradient({ points = MESH_GRADIENT_PRESETS.aurora, blur = 45 } = {}) {
  const validPoints = Array.isArray(points) && points.length >= 2 ? points : MESH_GRADIENT_PRESETS.aurora;
  const normalizedBlur = clamp(Number(blur) || 45, 10, 100);

  const pointDefs = validPoints
    .map((p, idx) => {
      const r = Math.round(normalizedBlur * 1.5);
      const opacity = (p.opacity ?? 100) / 100;
      return `<radialGradient id="mesh_pt_${idx}" cx="${p.x}%" cy="${p.y}%" r="${r}%">
        <stop offset="0%" stop-color="${p.color}" stop-opacity="${opacity}"/>
        <stop offset="100%" stop-color="${p.color}" stop-opacity="0"/>
      </radialGradient>`;
    })
    .join("");

  const pointRects = validPoints
    .map((_p, idx) => `<rect width="100" height="100" fill="url(#mesh_pt_${idx})"/>`)
    .join("");

  const pointsAttr = encodeURIComponent(JSON.stringify(validPoints));
  const baseColor = validPoints[0]?.color || "#000000";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" ` +
    `${MESH_MARKER} data-blur="${normalizedBlur}" data-points="${pointsAttr}">` +
    `<defs>${pointDefs}</defs>` +
    `<rect width="100" height="100" fill="${baseColor}"/>` +
    pointRects +
    `</svg>`;

  return `url("${SVG_DATA_PREFIX}${encodeURIComponent(svg)}")`;
}

export function parseMeshGradient(value) {
  const svg = decodeSvg(value);
  if (!svg || !svg.includes(MESH_MARKER)) return null;

  try {
    const pointsMatch = svg.match(/data-points="([^"]*)"/);
    const blurMatch = svg.match(/data-blur="([^"]*)"/);
    const points = pointsMatch ? JSON.parse(decodeURIComponent(pointsMatch[1])) : MESH_GRADIENT_PRESETS.aurora;
    const blur = blurMatch ? Number(blurMatch[1]) : 45;
    return {
      type: "mesh",
      points,
      blur,
    };
  } catch {
    return {
      type: "mesh",
      points: MESH_GRADIENT_PRESETS.aurora,
      blur: 45,
    };
  }
}
