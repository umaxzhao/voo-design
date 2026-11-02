/** Segment-classified clipping with multi-ring even-odd winding. */
import { ptEq, polygonSignedArea, isPointInPolygon } from "./path-boolean-geometry.js";

function roundCoord(v) {
  return Math.round(v * 1e5) / 1e5;
}

function ptKey(p) {
  return `${roundCoord(p.x)},${roundCoord(p.y)}`;
}

// --- 2D Segment Intersection & Polygon Clipping Kernel ---

export function solveSegmentIntersection(a, b, c, d) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = d.x - c.x;
  const vy = d.y - c.y;
  const wx = c.x - a.x;
  const wy = c.y - a.y;

  const det = ux * vy - uy * vx;
  const numT = wx * vy - wy * vx;
  const numS = wx * uy - wy * ux;

  if (Math.abs(det) < 1e-9) {
    // Parallel or collinear
    if (Math.abs(numT) > 1e-6) return [];
    const uLenSq = ux * ux + uy * uy;
    if (uLenSq < 1e-12) return [];
    const tC = ((c.x - a.x) * ux + (c.y - a.y) * uy) / uLenSq;
    const tD = ((d.x - a.x) * ux + (d.y - a.y) * uy) / uLenSq;
    const tMin = Math.max(0, Math.min(tC, tD));
    const tMax = Math.min(1, Math.max(tC, tD));
    if (tMax <= tMin + 1e-6) return [];
    const res = [];
    if (tMin > 1e-6 && tMin < 1 - 1e-6) {
      res.push({ x: a.x + tMin * ux, y: a.y + tMin * uy, t: tMin });
    }
    if (tMax > 1e-6 && tMax < 1 - 1e-6) {
      res.push({ x: a.x + tMax * ux, y: a.y + tMax * uy, t: tMax });
    }
    return res;
  }

  const t = numT / det;
  const s = numS / det;
  if (t >= -1e-6 && t <= 1 + 1e-6 && s >= -1e-6 && s <= 1 + 1e-6) {
    const clampedT = Math.max(0, Math.min(1, t));
    if (clampedT > 1e-6 && clampedT < 1 - 1e-6) {
      return [{ x: a.x + clampedT * ux, y: a.y + clampedT * uy, t: clampedT }];
    }
  }
  return [];
}

/**
 * Tests if a point is inside a multi-loop shape under the even-odd winding rule.
 * An odd number of enclosing rings means inside; an even number means in a hole or outside.
 */
export function isPointInMultiLoopShape(pt, loops) {
  if (!loops || loops.length === 0) return false;
  let insideCount = 0;
  for (const ring of loops) {
    if (isPointInPolygon(pt, ring)) {
      insideCount += 1;
    }
  }
  return insideCount % 2 === 1;
}

export function subdivideMultiLoops(subjectLoops, clipLoops) {
  const segments = [];
  if (!subjectLoops || subjectLoops.length === 0) return segments;

  for (const ring of subjectLoops) {
    const rLen = ring.length;
    if (rLen < 2) continue;

    for (let i = 0; i < rLen; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % rLen];
      const splits = [
        { x: a.x, y: a.y, t: 0 },
        { x: b.x, y: b.y, t: 1 },
      ];

      if (clipLoops && clipLoops.length > 0) {
        for (const clipRing of clipLoops) {
          const cLen = clipRing.length;
          if (cLen < 2) continue;
          for (let j = 0; j < cLen; j += 1) {
            const c = clipRing[j];
            const d = clipRing[(j + 1) % cLen];
            const hits = solveSegmentIntersection(a, b, c, d);
            for (const h of hits) {
              if (!splits.some((s) => Math.abs(s.t - h.t) < 1e-6)) {
                splits.push(h);
              }
            }
          }
        }
      }

      splits.sort((p, q) => p.t - q.t);
      for (let k = 0; k < splits.length - 1; k += 1) {
        const p0 = splits[k];
        const p1 = splits[k + 1];
        if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-5) {
          segments.push({
            from: { x: p0.x, y: p0.y },
            to: { x: p1.x, y: p1.y },
          });
        }
      }
    }
  }

  return segments;
}

function assembleLoops(segs) {
  if (!segs || segs.length === 0) return [];
  const map = new Map();
  for (const seg of segs) {
    const k = ptKey(seg.from);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ ...seg, used: false });
  }

  const loops = [];
  for (const [, list] of map) {
    for (const edge of list) {
      if (edge.used) continue;
      const loop = [];
      let curEdge = edge;
      let steps = 0;
      const maxSteps = segs.length * 2;

      while (curEdge && !curEdge.used && steps < maxSteps) {
        curEdge.used = true;
        loop.push(curEdge.from);
        steps += 1;

        const nextKey = ptKey(curEdge.to);
        let nextCandidates = map.get(nextKey);
        if (!nextCandidates || !nextCandidates.some((e) => !e.used)) {
          for (const [, cList] of map) {
            if (cList.some((e) => !e.used)) {
              if (ptEq(cList[0].from, curEdge.to, 1e-4)) {
                nextCandidates = cList;
                break;
              }
            }
          }
        }
        if (!nextCandidates) break;

        // Choose next unused candidate edge
        curEdge = nextCandidates.find((e) => !e.used);
        if (curEdge && ptEq(curEdge.from, edge.from)) {
          break;
        }
      }

      if (loop.length >= 3) {
        const area = Math.abs(polygonSignedArea(loop));
        if (area > 1e-4) {
          loops.push(loop);
        }
      }
    }
  }

  return loops;
}

/**
 * Clips two multi-loop shapes using multi-ring even-odd winding classification.
 */
export function clipMultiLoopShapes(loopsA, loopsB, op) {
  if (!loopsA?.length && !loopsB?.length) return [];
  if (!loopsA?.length) {
    if (op === "union" || op === "exclude") return loopsB;
    return [];
  }
  if (!loopsB?.length) {
    if (op === "union" || op === "subtract" || op === "exclude") return loopsA;
    return [];
  }

  if (op === "exclude") {
    const aMinusB = clipMultiLoopShapes(loopsA, loopsB, "subtract");
    const bMinusA = clipMultiLoopShapes(loopsB, loopsA, "subtract");
    return [...aMinusB, ...bMinusA];
  }

  const segsA = subdivideMultiLoops(loopsA, loopsB);
  const segsB = subdivideMultiLoops(loopsB, loopsA);

  const kept = [];

  for (const s of segsA) {
    let sharedSame = false;
    let sharedOpp = false;

    for (const c of segsB) {
      if (ptEq(s.from, c.from) && ptEq(s.to, c.to)) {
        sharedSame = true;
        break;
      }
      if (ptEq(s.from, c.to) && ptEq(s.to, c.from)) {
        sharedOpp = true;
        break;
      }
    }

    if (sharedSame) {
      if (op === "union" || op === "intersect") kept.push(s);
    } else if (sharedOpp) {
      if (op === "subtract") kept.push(s);
    } else {
      const mid = { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 };
      const inB = isPointInMultiLoopShape(mid, loopsB);
      if (op === "union" && !inB) kept.push(s);
      if (op === "intersect" && inB) kept.push(s);
      if (op === "subtract" && !inB) kept.push(s);
    }
  }

  for (const c of segsB) {
    let isShared = false;
    for (const s of segsA) {
      if (
        (ptEq(c.from, s.from) && ptEq(c.to, s.to)) ||
        (ptEq(c.from, s.to) && ptEq(c.to, s.from))
      ) {
        isShared = true;
        break;
      }
    }

    if (!isShared) {
      const mid = { x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 };
      const inA = isPointInMultiLoopShape(mid, loopsA);
      if (op === "union" && !inA) kept.push(c);
      if (op === "intersect" && inA) kept.push(c);
      if (op === "subtract" && inA) kept.push({ from: c.to, to: c.from });
    }
  }

  return assembleLoops(kept);
}

/**
 * Clips two simple polygon rings using the segment-classified kernel.
 */
export function clipPolygonPair(polyS, polyC, op) {
  if (!polyS?.length || !polyC?.length) return [];
  return clipMultiLoopShapes([polyS], [polyC], op);
}

