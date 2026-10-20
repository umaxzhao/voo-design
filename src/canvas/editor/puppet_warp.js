/** Pure pin-based deformation helpers for the Puppet Warp tool. */
import {
  buildGridAdjacency,
  buildPuppetMesh,
  computeAlphaOccupancy,
  isIdentityWarpMesh,
  nearestVertexIndex,
} from "./puppet_warp_mesh.js";

export {
  buildGridAdjacency,
  buildPuppetMesh,
  computeAlphaOccupancy,
  isIdentityWarpMesh,
  nearestVertexIndex,
};

export const DEFAULT_PUPPET_PINS = [
  { id: "top-left", x: 0, y: 0 },
  { id: "top-right", x: 1, y: 0 },
  { id: "center", x: 0.5, y: 0.5 },
  { id: "bottom-left", x: 0, y: 1 },
  { id: "bottom-right", x: 1, y: 1 },
];

export function createDefaultPuppetPins() {
  // The Puppet Warp tool starts with NO pins: every pin is added by the user
  // clicking the image. DEFAULT_PUPPET_PINS is kept as an exported constant for
  // reference, but it is no longer seeded when the tool is entered.
  return [];
}


/**
 * Removes the pin with `pinId`. Used by Delete/Backspace on the current pin.
 * Returns a new array (the source is not mutated).
 */
export function deletePuppetPin(pins, pinId) {
  return (Array.isArray(pins) ? pins : []).filter((pin) => pin.id !== pinId);
}

/**
 * Adds a free-position puppet pin in normalized node coordinates.
 * The rest position is captured at insertion time so the first drag moves
 * only the new pin while the existing pins remain stable.
 */
export function addPuppetPin(pins, x, y) {
  const next = Array.isArray(pins) ? pins.map((pin) => ({ ...pin })) : [];
  const safeX = Math.max(0, Math.min(1, Number(x) || 0));
  const safeY = Math.max(0, Math.min(1, Number(y) || 0));
  let index = next.length + 1;
  let id = `pin-${index}`;
  while (next.some((pin) => pin.id === id)) {
    index += 1;
    id = `pin-${index}`;
  }
  const pin = { id, x: safeX, y: safeY, restX: safeX, restY: safeY };
  next.push(pin);
  return { pins: next, pin };
}

/**
 * Weight exponent for MLS deformation. α = 1.0 gives `w = 1/d²` (inverse-
 * distance-squared), the most common default in Schaefer et al. 2006.
 * Higher values make each pin's influence more local; lower values spread it
 * further. Exposed as a module constant so it's easy to tune without hunting
 * through code.
 */
export const MLS_ALPHA = 1.0;

/**
 * Applies pin displacements to the mesh via **MLS rigid deformation**
 * (Moving Least Squares, Schaefer, McPhail & Warren 2006, rigid variant).
 *
 * For every grid vertex the algorithm computes a locally optimal rigid
 * transform (rotation + translation, no scale/shear) that best maps the
 * pins' rest positions to their current positions, weighted by inverse
 * distance.  The result is C∞-smooth away from pins and exactly interpolates
 * every pin position (hard constraint).
 *
 * Key differences from the old harmonic (Laplace + SOR) solver:
 * - Pins use their own floating-point rest coordinates; no snapping to the
 *   nearest grid vertex, so two sub-grid-distance pins never collide.
 * - Boundaries are NOT locked: the image edge deforms naturally.
 * - Cost is O(V·P) per frame (V vertices, P pins) with no iteration, so it
 *   scales linearly with grid density and is trivially parallelisable.
 */
export function applyPuppetPins(mesh, pins) {
  if (!mesh || !Array.isArray(mesh.points) || !Array.isArray(pins)) return mesh;
  const activePins = pins.filter(
    (pin) =>
      Number.isFinite(pin.x) &&
      Number.isFinite(pin.y) &&
      Number.isFinite(pin.restX) &&
      Number.isFinite(pin.restY),
  );
  if (activePins.length === 0) return mesh;

  // Quick check: if all pins have 0 displacement, return original mesh
  const hasDisplacement = activePins.some(
    (p) => Math.hypot(p.x - p.restX, p.y - p.restY) > 1e-5,
  );
  if (!hasDisplacement) return mesh;

  const { cols, rows } = mesh;
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 1 ||
    rows < 1
  )
    return mesh;
  const W = cols + 1;
  const N = W * (rows + 1);
  const points = mesh.points;
  if (points.length !== N) return mesh;

  // Build control-point arrays from pins.
  // A `fixed: true` pin is an anchor: its target position equals its rest
  // position (displacement = 0), which is how "pin this spot in place" works.
  const nPins = activePins.length;
  const px = new Float64Array(nPins); // rest X
  const py = new Float64Array(nPins); // rest Y
  const qx = new Float64Array(nPins); // target X
  const qy = new Float64Array(nPins); // target Y
  for (let k = 0; k < nPins; k++) {
    const pin = activePins[k];
    px[k] = pin.restX;
    py[k] = pin.restY;
    qx[k] = pin.fixed ? pin.restX : pin.x;
    qy[k] = pin.fixed ? pin.restY : pin.y;
  }

  const alpha2 = 2 * MLS_ALPHA; // exponent on |d|² (i.e. |d|^(2α))

  const nextPoints = new Array(N);
  for (let i = 0; i < N; i++) {
    const pt = points[i];
    const vx = pt.origU ?? pt.x;
    const vy = pt.origV ?? pt.y;

    // --- weights ---
    const w = new Float64Array(nPins);
    let coincident = -1;
    for (let k = 0; k < nPins; k++) {
      const dx = px[k] - vx;
      const dy = py[k] - vy;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1e-20) {
        // Query point coincides with this pin's rest position — return its
        // target directly (avoids division by zero).
        coincident = k;
        break;
      }
      w[k] = 1 / (alpha2 === 2 ? d2 : d2 ** (alpha2 / 2));
    }

    if (coincident >= 0) {
      nextPoints[i] = { ...pt, x: qx[coincident], y: qy[coincident] };
      continue;
    }

    // --- weighted centroids p*, q* ---
    let wSum = 0;
    let psx = 0,
      psy = 0,
      qsx = 0,
      qsy = 0;
    for (let k = 0; k < nPins; k++) {
      const wk = w[k];
      wSum += wk;
      psx += wk * px[k];
      psy += wk * py[k];
      qsx += wk * qx[k];
      qsy += wk * qy[k];
    }
    const invW = 1 / wSum;
    const pcx = psx * invW;
    const pcy = psy * invW;
    const qcx = qsx * invW;
    const qcy = qsy * invW;

    // --- rigid MLS: find the optimal rotation angle θ ---
    // Accumulate:  A = Σ wᵢ p̂ᵢ · q̂ᵢ    (dot product component)
    //              B = Σ wᵢ p̂ᵢ × q̂ᵢ    (cross product component)
    // θ = atan2(B, A)   but we need the unit vector (cosθ, sinθ) normalised
    // by √(A²+B²) to get a proper rigid rotation (no scaling).
    let A = 0,
      B = 0;
    for (let k = 0; k < nPins; k++) {
      const wk = w[k];
      const phx = px[k] - pcx;
      const phy = py[k] - pcy;
      const qhx = qx[k] - qcx;
      const qhy = qy[k] - qcy;
      A += wk * (phx * qhx + phy * qhy);
      B += wk * (phx * qhy - phy * qhx);
    }
    const len = Math.sqrt(A * A + B * B);
    const cosT = len > 1e-20 ? A / len : 1;
    const sinT = len > 1e-20 ? B / len : 0;

    // Apply: f(v) = M (v - p*) + q*   where M is the 2×2 rotation [cosT -sinT; sinT cosT]
    const dvx = vx - pcx;
    const dvy = vy - pcy;
    const nx = cosT * dvx - sinT * dvy + qcx;
    const ny = sinT * dvx + cosT * dvy + qcy;

    nextPoints[i] = { ...pt, x: nx, y: ny };
  }
  return { ...mesh, points: nextPoints };
}

export function movePuppetPin(mesh, pins, pinId, x, y) {
  const nextPins = (pins ?? []).map((pin) =>
    pin.id === pinId ? { ...pin, x, y } : { ...pin },
  );
  return { pins: nextPins, mesh: applyPuppetPins(mesh, nextPins) };
}

/**
 * Toggles the `fixed` flag on a pin. A fixed pin's displacement is held at
 * zero by `applyPuppetPins`, so dragging any other pin cannot move it.
 * Returns a new pins array (source not mutated).
 */
export function togglePuppetPinFixed(pins, pinId) {
  return (pins ?? []).map((pin) =>
    pin.id === pinId ? { ...pin, fixed: !pin.fixed } : { ...pin },
  );
}
