/**
 * Mathematical helpers for 4-point perspective warp quads and parametric tilt/skew.
 *
 * Perspective corners are stored in normalized quad coordinates [0..1] relative to the node:
 *   corners[0]: Top-Left (TL)
 *   corners[1]: Top-Right (TR)
 *   corners[2]: Bottom-Right (BR)
 *   corners[3]: Bottom-Left (BL)
 */

/**
 * Converts parametric horizontal perspective (H), vertical perspective (V),
 * horizontal skew (SX), and vertical skew (SY) (-100..100)
 * into normalized 4-corner perspective quad coordinates.
 *
 * @param {number} [h=0] - Horizontal perspective (-100..100)
 * @param {number} [v=0] - Vertical perspective (-100..100)
 * @param {number} [skewX=0] - Horizontal skew / shear (-100..100)
 * @param {number} [skewY=0] - Vertical skew / shear (-100..100)
 * @returns {Array<{x: number, y: number}>}
 */
export function perspectiveParamsToCorners(h = 0, v = 0, skewX = 0, skewY = 0) {
  const nh = Math.max(-100, Math.min(100, h)) / 100;
  const nv = Math.max(-100, Math.min(100, v)) / 100;
  const nsx = Math.max(-100, Math.min(100, skewX)) / 100;
  const nsy = Math.max(-100, Math.min(100, skewY)) / 100;

  const topSqueeze = nv > 0 ? nv * 0.4 : 0;
  const botSqueeze = nv < 0 ? -nv * 0.4 : 0;
  const rightSqueeze = nh > 0 ? nh * 0.4 : 0;
  const leftSqueeze = nh < 0 ? -nh * 0.4 : 0;

  const shiftX = nsx * 0.4;
  const shiftY = nsy * 0.4;

  return [
    // TL (0): top-left
    {
      x: topSqueeze + shiftX,
      y: leftSqueeze - shiftY,
    },
    // TR (1): top-right
    {
      x: 1 - topSqueeze + shiftX,
      y: rightSqueeze + shiftY,
    },
    // BR (2): bottom-right
    {
      x: 1 - botSqueeze - shiftX,
      y: 1 - rightSqueeze + shiftY,
    },
    // BL (3): bottom-left
    {
      x: botSqueeze - shiftX,
      y: 1 - leftSqueeze - shiftY,
    },
  ];
}

/**
 * Derives parametric horizontal perspective, vertical perspective,
 * horizontal skew, and vertical skew (-100..100) from 4-corner quad coordinates.
 *
 * @param {Array<{x: number, y: number}> | null} corners
 * @returns {{horizontal: number, vertical: number, skewX: number, skewY: number}}
 */
export function cornersToPerspectiveParams(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return { horizontal: 0, vertical: 0, skewX: 0, skewY: 0 };
  }
  const [tl, tr, br, bl] = corners;

  // 1. Vertical perspective (top width vs bottom width)
  const topWidth = tr.x - tl.x;
  const botWidth = br.x - bl.x;
  const diffV = botWidth - topWidth;
  const vertical =
    Math.round(Math.max(-100, Math.min(100, (diffV / 0.8) * 100))) || 0;

  // 2. Horizontal skew (top center X vs bottom center X)
  const topCenterX = (tl.x + tr.x) / 2;
  const botCenterX = (bl.x + br.x) / 2;
  const diffShiftX = (topCenterX - botCenterX) / 2;
  const skewX =
    Math.round(Math.max(-100, Math.min(100, (diffShiftX / 0.4) * 100))) || 0;

  // 3. Horizontal perspective (left height vs right height)
  const leftHeight = bl.y - tl.y;
  const rightHeight = br.y - tr.y;
  const diffH = leftHeight - rightHeight;
  const horizontal =
    Math.round(Math.max(-100, Math.min(100, (diffH / 0.8) * 100))) || 0;

  // 4. Vertical skew (right center Y vs left center Y)
  const rightCenterY = (tr.y + br.y) / 2;
  const leftCenterY = (tl.y + bl.y) / 2;
  const diffShiftY = (rightCenterY - leftCenterY) / 2;
  const skewY =
    Math.round(Math.max(-100, Math.min(100, (diffShiftY / 0.4) * 100))) || 0;

  return { horizontal, vertical, skewX, skewY };
}

/**
 * Default unwarped unit-square perspective quad coordinates [TL, TR, BR, BL].
 *
 * @returns {Array<{x: number, y: number}>}
 */
export function defaultPerspectiveCorners() {
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

/**
 * Checks whether a 4-corner perspective quad is in its unwarped unit-square default state.
 *
 * @param {Array<{x: number, y: number}> | null} corners
 * @returns {boolean}
 */
export function isDefaultPerspectiveCorners(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) return true;
  const [tl, tr, br, bl] = corners;
  return (
    Math.abs(tl.x - 0) < 1e-4 &&
    Math.abs(tl.y - 0) < 1e-4 &&
    Math.abs(tr.x - 1) < 1e-4 &&
    Math.abs(tr.y - 0) < 1e-4 &&
    Math.abs(br.x - 1) < 1e-4 &&
    Math.abs(br.y - 1) < 1e-4 &&
    Math.abs(bl.x - 0) < 1e-4 &&
    Math.abs(bl.y - 1) < 1e-4
  );
}

/**
 * Checks whether a warp control mesh is in its unwarped default flat grid state.
 *
 * @param {object | null} mesh
 * @returns {boolean}
 */
export function isDefaultControlMesh(mesh) {
  if (!mesh || !Array.isArray(mesh.points) || mesh.points.length === 0)
    return true;
  const cols = mesh.cols || 3;
  const rows = mesh.rows || 3;
  if (mesh.points.length !== (cols + 1) * (rows + 1)) return false;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const idx = r * (cols + 1) + c;
      const pt = mesh.points[idx];
      if (!pt) return true;
      const expectedU = c / cols;
      const expectedV = r / rows;
      if (
        Math.abs((pt.x ?? expectedU) - expectedU) > 1e-4 ||
        Math.abs((pt.y ?? expectedV) - expectedV) > 1e-4
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Converts a 4-corner perspective quad into an equivalent 16-point (3x3) bicubic control mesh.
 * This conversion is mathematically exact for bilinear quadrilateral surfaces.
 *
 * @param {Array<{x: number, y: number}>} corners [TL, TR, BR, BL]
 * @param {boolean} [isCurve=true]
 * @returns {{ cols: number, rows: number, points: Array<{x: number, y: number, origU: number, origV: number}>, isCurve: boolean, preset: string }}
 */
export function perspectiveCornersToWarpMesh(corners, isCurve = true) {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return null;
  }
  const [p0, p1, p2, p3] = corners;
  const cols = 3;
  const rows = 3;
  const points = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      let x;
      let y;
      if (r === 0 && c === 0) {
        x = p0.x;
        y = p0.y;
      } else if (r === 0 && c === cols) {
        x = p1.x;
        y = p1.y;
      } else if (r === rows && c === cols) {
        x = p2.x;
        y = p2.y;
      } else if (r === rows && c === 0) {
        x = p3.x;
        y = p3.y;
      } else {
        const topX = p0.x + u * (p1.x - p0.x);
        const topY = p0.y + u * (p1.y - p0.y);
        const botX = p3.x + u * (p2.x - p3.x);
        const botY = p3.y + u * (p2.y - p3.y);
        x = topX + v * (botX - topX);
        y = topY + v * (botY - topY);
      }
      points.push({ x, y, origU: u, origV: v });
    }
  }
  return { cols, rows, points, isCurve, preset: "custom" };
}

/**
 * Extracts the 4 outer corner points from a warp control mesh.
 *
 * @param {object | null} mesh
 * @returns {Array<{x: number, y: number}> | null} [TL, TR, BR, BL]
 */
export function warpMeshToPerspectiveCorners(mesh) {
  if (!mesh || !Array.isArray(mesh.points) || mesh.points.length < 4) {
    return null;
  }
  const cols = mesh.cols || 3;
  const rows = mesh.rows || 3;
  const stride = cols + 1;
  const tl = mesh.points[0];
  const tr = mesh.points[cols];
  const br = mesh.points[rows * stride + cols];
  const bl = mesh.points[rows * stride];
  if (!tl || !tr || !br || !bl) return null;
  return [
    { x: tl.x, y: tl.y },
    { x: tr.x, y: tr.y },
    { x: br.x, y: br.y },
    { x: bl.x, y: bl.y },
  ];
}

/**
 * Returns which warp/transform tool was used or is best suited for a node based on its active deformation data.
 *
 * @param {object | null} node
 * @param {string} [fallback="perspective"]
 * @returns {string}
 */
export function getNodeWarpTool(node, fallback = "distort") {
  if (!node) return fallback;
  if (Array.isArray(node.puppetPins) && node.puppetPins.length > 0) {
    return "puppet_warp";
  }
  if (node.warpMesh && Array.isArray(node.warpMesh.points)) {
    return "distort";
  }
  if (
    Array.isArray(node.perspectiveCorners) &&
    node.perspectiveCorners.length === 4
  ) {
    return "perspective";
  }
  // Mesh Warp is retired. Documents saved while it existed still carry it in
  // lastWarpTool, so it is skipped here rather than resurrected as a tool.
  if (node.lastWarpTool && node.lastWarpTool !== "mesh_warp") {
    return node.lastWarpTool;
  }
  return fallback;
}
