/**
 * Puppet Warp mesh generation, lattice topology, and alpha silhouette sampling.
 */

/**
 * Analyzes bitmap alpha transparency and returns a mask of occupied/active cells
 * with a customizable dilation/expansion margin around the opaque silhouette.
 */
export function computeAlphaOccupancy(bitmap, cols, rows, expansion = 1) {
  if (!bitmap) return null;
  try {
    const w = bitmap.width || bitmap.videoWidth || bitmap.naturalWidth || 64;
    const h = bitmap.height || bitmap.videoHeight || bitmap.naturalHeight || 64;
    if (!w || !h) return null;

    if (typeof document === "undefined") return null;
    const sampleW = Math.min(128, w);
    const sampleH = Math.min(128, h);
    const off = document.createElement("canvas");
    off.width = sampleW;
    off.height = sampleH;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;

    const cellOccupied = new Uint8Array(cols * rows);
    let hasTransparent = false;
    let hasOpaque = false;

    for (let r = 0; r < rows; r++) {
      const y0 = Math.floor((r / rows) * sampleH);
      const y1 = Math.ceil(((r + 1) / rows) * sampleH);
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor((c / cols) * sampleW);
        const x1 = Math.ceil(((c + 1) / cols) * sampleW);

        let opaqueCount = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const alpha = imgData[(y * sampleW + x) * 4 + 3];
            if (alpha > 16) {
              opaqueCount++;
            }
          }
        }
        if (opaqueCount > 0) {
          cellOccupied[r * cols + c] = 1;
          hasOpaque = true;
        } else {
          hasTransparent = true;
        }
      }
    }

    if (!hasTransparent || !hasOpaque) return null;

    const activeCells = new Array(cols * rows).fill(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cellOccupied[r * cols + c]) {
          for (let dr = -expansion; dr <= expansion; dr++) {
            for (let dc = -expansion; dc <= expansion; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                activeCells[nr * cols + nc] = 1;
              }
            }
          }
        }
      }
    }
    return activeCells;
  } catch {
    return null;
  }
}

/**
 * Checks if a warp mesh has not been deformed from its identity grid.
 */
export function isIdentityWarpMesh(mesh) {
  if (!mesh || !Array.isArray(mesh.points) || mesh.points.length === 0)
    return true;
  for (let i = 0; i < mesh.points.length; i += 1) {
    const pt = mesh.points[i];
    const u = pt.origU ?? pt.x;
    const v = pt.origV ?? pt.y;
    if (Math.abs(pt.x - u) > 1e-4 || Math.abs(pt.y - v) > 1e-4) {
      return false;
    }
  }
  return true;
}

/**
 * Builds a high-density puppet mesh — `(rows+1)*(cols+1)` vertices on a regular
 * grid conforming automatically to the layer shape's alpha silhouette.
 * Starts with zero jitter so the image renders pixel-perfect identity without distortion.
 */
export function buildPuppetMesh({
  cols = 20,
  rows = 20,
  jitter = 0,
  seed = 0,
  bitmap = null,
  expansion = 1,
} = {}) {
  const safeCols = Math.max(1, Math.min(64, Math.round(cols)));
  const safeRows = Math.max(1, Math.min(64, Math.round(rows)));
  let state = (Number(seed) || 0) >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const activeCells = computeAlphaOccupancy(
    bitmap,
    safeCols,
    safeRows,
    expansion,
  );
  const points = [];
  for (let r = 0; r <= safeRows; r += 1) {
    for (let c = 0; c <= safeCols; c += 1) {
      const u = c / safeCols;
      const v = r / safeRows;
      const onBoundary = r === 0 || r === safeRows || c === 0 || c === safeCols;
      let x = u;
      let y = v;
      if (!onBoundary && jitter > 0) {
        x = Math.max(0, Math.min(1, u + (rand() - 0.5) * jitter));
        y = Math.max(0, Math.min(1, v + (rand() - 0.5) * jitter));
      }
      points.push({ x, y, origU: x, origV: y });
    }
  }
  const result = { cols: safeCols, rows: safeRows, points };
  if (activeCells) {
    result.activeCells = activeCells;
  }
  return result;
}

/**
 * Grid topology for a `{cols, rows}` lattice of `(rows+1)*(cols+1)` points.
 *
 * index = r*(cols+1)+c. Each cell splits into the two triangles
 * `(r,c)-(r+1,c)-(r+1,c+1)` and `(r,c)-(r,c+1)-(r+1,c+1)`, sharing the diagonal
 * `(r,c)-(r+1,c+1)`.
 */
export function buildGridAdjacency(cols, rows, activeCells = null) {
  const W = cols + 1;
  const adj = new Array(W * (rows + 1)).fill(null).map(() => new Set());
  const idx = (r, c) => r * W + c;
  const link = (a, b) => {
    adj[a].add(b);
    adj[b].add(a);
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (activeCells && !activeCells[r * cols + c]) continue;
      const a = idx(r, c);
      const b = idx(r + 1, c);
      const d = idx(r, c + 1);
      const e = idx(r + 1, c + 1);
      link(a, b);
      link(b, e);
      link(a, e);
      link(a, d);
      link(d, e);
    }
  }
  return adj;
}

/** Nearest lattice vertex index to a normalized (u, v) point. */
export function nearestVertexIndex(points, u, v) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const d = ((p.origU ?? p.x) - u) ** 2 + ((p.origV ?? p.y) - v) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
