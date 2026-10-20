/**
 * Mesh transformation and grid subdivision engine.
 *
 * Implements:
 * 1. Default grid construction over a rectangular bounding box.
 * 2. Bilinear resampling across differing row/col dimensions.
 * 3. 4-Corner perspective quad subdivision.
 * 4. 4x4 (16-point) Bicubic Bézier warp patch evaluation (Bernstein polynomials).
 */

/**
 * Creates default initial grid points for an NxM mesh over a rectangle [x, y, w, h].
 */
export function createDefaultMesh(x, y, w, h, cols = 3, rows = 3) {
  const points = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      points.push({
        x: x + u * w,
        y: y + v * h,
        origU: u,
        origV: v,
      });
    }
  }
  return points;
}

/**
 * Resamples or initializes a mesh with new col/row density while preserving existing deformations.
 */
export function resampleMeshGrid(oldMesh, newCols, newRows) {
  if (
    !oldMesh ||
    !Array.isArray(oldMesh.points) ||
    !oldMesh.cols ||
    !oldMesh.rows
  ) {
    const points = [];
    for (let r = 0; r <= newRows; r++) {
      const v = r / newRows;
      for (let c = 0; c <= newCols; c++) {
        const u = c / newCols;
        points.push({ x: u, y: v, origU: u, origV: v });
      }
    }
    return { cols: newCols, rows: newRows, points };
  }

  const { cols: oldCols, rows: oldRows, points: oldPts } = oldMesh;
  const newPts = [];

  for (let r = 0; r <= newRows; r++) {
    const targetV = r / newRows;
    for (let c = 0; c <= newCols; c++) {
      const targetU = c / newCols;

      // Bilinear sample inside old grid
      const srcC = targetU * oldCols;
      const srcR = targetV * oldRows;

      const c0 = Math.min(oldCols - 1, Math.floor(srcC));
      const c1 = Math.min(oldCols, c0 + 1);
      const r0 = Math.min(oldRows - 1, Math.floor(srcR));
      const r1 = Math.min(oldRows, r0 + 1);

      const fC = srcC - c0;
      const fR = srcR - r0;

      const p00 = oldPts[r0 * (oldCols + 1) + c0] || { x: targetU, y: targetV };
      const p10 = oldPts[r0 * (oldCols + 1) + c1] || p00;
      const p01 = oldPts[r1 * (oldCols + 1) + c0] || p00;
      const p11 = oldPts[r1 * (oldCols + 1) + c1] || p10;

      const topX = p00.x + fC * (p10.x - p00.x);
      const topY = p00.y + fC * (p10.y - p00.y);
      const botX = p01.x + fC * (p11.x - p01.x);
      const botY = p01.y + fC * (p11.y - p01.y);

      newPts.push({
        x: topX + fR * (botX - topX),
        y: topY + fR * (botY - topY),
        origU: targetU,
        origV: targetV,
      });
    }
  }

  return { cols: newCols, rows: newRows, points: newPts };
}

/**
 * Evaluates 4-corner perspective quad into an NxN subdivided mesh for smoother rendering.
 */
export function subdividePerspectiveQuad(corners, divs = 8) {
  // corners: [TL, TR, BR, BL]
  const [p0, p1, p2, p3] = corners;
  const grid = [];

  for (let r = 0; r <= divs; r++) {
    const v = r / divs;
    for (let c = 0; c <= divs; c++) {
      const u = c / divs;
      // Bilinear / perspective interpolation
      const topX = p0.x + u * (p1.x - p0.x);
      const topY = p0.y + u * (p1.y - p0.y);
      const botX = p3.x + u * (p2.x - p3.x);
      const botY = p3.y + u * (p2.y - p3.y);

      const x = topX + v * (botX - topX);
      const y = topY + v * (botY - topY);

      grid.push({ x, y, origU: u, origV: v });
    }
  }
  return grid;
}

/**
 * Photoshop-style Bicubic Bézier Spline Basis Functions (Bernstein Polynomials).
 */
function bernstein(i, t) {
  switch (i) {
    case 0:
      return (1 - t) * (1 - t) * (1 - t);
    case 1:
      return 3 * t * (1 - t) * (1 - t);
    case 2:
      return 3 * t * t * (1 - t);
    case 3:
      return t * t * t;
    default:
      return 0;
  }
}

/**
 * Evaluates a 4x4 (16-point) Bicubic Bézier Patch (Photoshop Warp Surface)
 * into a finely subdivided mesh (default 12x12) for smooth curved deformation.
 *
 * @param {Array<{x: number, y: number}>} patch16 16 control points in doc space row-by-row
 * @param {number} divs Number of subdivisions per direction (e.g. 12)
 */
export function subdivideBicubicWarpPatch(patch16, divs = 12) {
  if (!Array.isArray(patch16) || patch16.length < 16) {
    return [];
  }

  const grid = [];
  for (let r = 0; r <= divs; r++) {
    const v = r / divs;
    const bV = [
      bernstein(0, v),
      bernstein(1, v),
      bernstein(2, v),
      bernstein(3, v),
    ];

    for (let c = 0; c <= divs; c++) {
      const u = c / divs;
      const bU = [
        bernstein(0, u),
        bernstein(1, u),
        bernstein(2, u),
        bernstein(3, u),
      ];

      let px = 0;
      let py = 0;

      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const pt = patch16[j * 4 + i];
          const weight = bV[j] * bU[i];
          px += pt.x * weight;
          py += pt.y * weight;
        }
      }

      grid.push({ x: px, y: py, origU: u, origV: v });
    }
  }
  return grid;
}
