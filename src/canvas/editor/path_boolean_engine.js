/**
 * Synchronous destructive Boolean path API.
 *
 * The editor commits the resulting document before these operations return.
 * Keep that contract when organizing the geometry, clipping and reconstruction
 * modules; a dynamic import here would change history and caller semantics.
 */
import { tessellateNodeToWorldPolygons } from "./path-boolean-geometry.js";
import { clipMultiLoopShapes } from "./path-boolean-clipping.js";
import { reconstructBezierPath } from "./path-boolean-reconstruction.js";

export {
  ptEq, polygonSignedArea, ensurePositiveOrientation, isPointInPolygon,
  adaptiveFlattenCubicSegment, normalizeNodeToDocPenAnchors,
  tessellateNodeToWorldPolygons, tessellateNodeToWorldPolygon,
} from "./path-boolean-geometry.js";
export {
  solveSegmentIntersection, isPointInMultiLoopShape, subdivideMultiLoops,
  clipMultiLoopShapes, clipPolygonPair,
} from "./path-boolean-clipping.js";
export { reconstructAnchorsFromLoop, reconstructBezierPath } from "./path-boolean-reconstruction.js";

// --- Binary & Multi-Node Chaining Execution ---

function executeBinaryBoolean(nodeA, nodeB, op) {
  if (!nodeA || !nodeB) return null;

  const loopsA = tessellateNodeToWorldPolygons(nodeA);
  const loopsB = tessellateNodeToWorldPolygons(nodeB);

  if (loopsA.length === 0 && loopsB.length === 0) return null;
  if (loopsA.length === 0) {
    if (op === "union" || op === "exclude") return reconstructBezierPath(loopsB, nodeA);
    return null;
  }
  if (loopsB.length === 0) {
    if (op === "union" || op === "subtract" || op === "exclude") {
      return reconstructBezierPath(loopsA, nodeA);
    }
    return null;
  }

  const resultLoops = clipMultiLoopShapes(loopsA, loopsB, op);
  return reconstructBezierPath(resultLoops, nodeA);
}

function executeBooleanChain(nodes, op) {
  if (!Array.isArray(nodes) || nodes.length < 2) return null;

  let current = nodes[0];
  for (let i = 1; i < nodes.length; i += 1) {
    const next = nodes[i];
    current = executeBinaryBoolean(current, next, op);
    if (!current && (op === "subtract" || op === "intersect")) {
      return null;
    }
  }
  return current;
}

// --- Public API ---

export function booleanUnion(nodes) {
  return executeBooleanChain(nodes, "union");
}

export function booleanSubtract(nodes) {
  return executeBooleanChain(nodes, "subtract");
}

export function booleanIntersect(nodes) {
  return executeBooleanChain(nodes, "intersect");
}

export function booleanExclude(nodes) {
  return executeBooleanChain(nodes, "exclude");
}
