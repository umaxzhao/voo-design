import PropTypes from "prop-types";
import {
  generatePhotoshopWarpPreset,
  subdivideBicubicWarpPatch,
} from "../../editor/mesh_transform.js";

/**
 * Warp style icons are *derived from the real deformation*, not hand-drawn:
 * each icon runs generatePhotoshopWarpPreset() at a representative bend and
 * draws the outline of the resulting bicubic patch — outline only, so the
 * icons stay readable at 20px.
 *
 * The exception is ACCENT_PRESETS: twist and fisheye deform the interior only
 * and leave the boundary untouched, so their outline alone is a plain square.
 * Those two get one extra inner contour to stay distinguishable.
 */

const DIVS = 12; // subdivisions per direction; a multiple of 4 so the inner contour lands on quarters
const VIEW = 100;
const PAD = 9;
const PREVIEW_ORIENTATION = "horizontal";
const DEFAULT_PREVIEW_BEND = 0.55;

/**
 * Per-preset preview strength. Presets whose deformation saturates (fisheye,
 * twist) or stays inside the boundary need a stronger bend than the default to
 * read at icon size; these values only drive the drawing, never the canvas.
 */
const PREVIEW_BEND = {
  bulge: 0.7,
  fish: 0.7,
  trapezoid: 0.6,
  inflate: 0.95,
  squeeze: 0.95,
  twist: 1,
  fisheye: 6,
};

/** Presets whose boundary is undeformed; they need one inner contour to read. */
const ACCENT_PRESETS = new Set(["twist", "fisheye"]);
const ACCENT_INSET = DIVS / 4; // inner contour at u,v in [1/4, 3/4]

/** preset id -> { outline, accent } SVG path strings. Built once per preset. */
const pathCache = new Map();

function sampleAt(grid, row, col) {
  return grid[row * (DIVS + 1) + col];
}

/** Fit the sampled patch into the icon viewBox without changing its aspect. */
function makeProjector(grid) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of grid) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const inner = VIEW - PAD * 2;
  const scale = Math.min(inner / spanX, inner / spanY);
  const offsetX = (VIEW - spanX * scale) / 2;
  const offsetY = (VIEW - spanY * scale) / 2;
  return (p) => [
    ((p.x - minX) * scale + offsetX).toFixed(1),
    ((p.y - minY) * scale + offsetY).toFixed(1),
  ];
}

function polyline(points, project, close) {
  const parts = points.map((p, index) => {
    const [x, y] = project(p);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  });
  return parts.join(" ") + (close ? " Z" : "");
}

/** Walks the sampled grid clockwise around the rectangle [lo, hi] in both axes. */
function ringPoints(grid, lo, hi) {
  const steps = [];
  for (let k = lo; k <= hi; k += 1) steps.push(k);
  const top = steps.map((c) => sampleAt(grid, lo, c));
  const right = steps.map((r) => sampleAt(grid, r, hi)).slice(1);
  const bottom = steps
    .map((c) => sampleAt(grid, hi, c))
    .reverse()
    .slice(1);
  const left = steps
    .map((r) => sampleAt(grid, r, lo))
    .reverse()
    .slice(1, -1);
  return [...top, ...right, ...bottom, ...left];
}

function buildPaths(preset) {
  const patch = generatePhotoshopWarpPreset(
    preset,
    PREVIEW_BEND[preset] ?? DEFAULT_PREVIEW_BEND,
    0,
    0,
    PREVIEW_ORIENTATION,
  );
  const grid = subdivideBicubicWarpPatch(patch, DIVS);
  if (!grid.length) return { outline: "", accent: "" };
  const project = makeProjector(grid);

  const outline = polyline(ringPoints(grid, 0, DIVS), project, true);
  const accent = ACCENT_PRESETS.has(preset)
    ? polyline(
        ringPoints(grid, ACCENT_INSET, DIVS - ACCENT_INSET),
        project,
        true,
      )
    : "";
  return { outline, accent };
}

function getPaths(preset) {
  let cached = pathCache.get(preset);
  if (!cached) {
    cached = buildPaths(preset);
    pathCache.set(preset, cached);
  }
  return cached;
}

/**
 * `custom` has no generated shape — it is whatever the user dragged — so it
 * renders an undeformed frame with corner handles, echoing the on-canvas mesh.
 */
export default function WarpStyleIcon({ preset, className = "" }) {
  const { outline, accent } = getPaths(preset);
  const isCustom = preset === "custom";
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={outline} strokeWidth="7" />
      {accent && <path d={accent} strokeWidth="5" opacity="0.5" />}
      {isCustom &&
        [
          [PAD, PAD],
          [VIEW - PAD, PAD],
          [PAD, VIEW - PAD],
          [VIEW - PAD, VIEW - PAD],
        ].map(([cx, cy]) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r="7"
            fill="currentColor"
            stroke="none"
          />
        ))}
    </svg>
  );
}

WarpStyleIcon.propTypes = {
  preset: PropTypes.string.isRequired,
  className: PropTypes.string,
};
