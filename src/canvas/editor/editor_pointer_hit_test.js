import { orderedCandidates } from "./hit_test_candidates.js";
/**
 * Hit testing helpers for pointer gestures on the canvas editor stage.
 */

import * as ops from "./doc_ops.js";
import { NODE_KIND } from "./scene_model.js";
import {
  handleAtPoint,
  handleFromPoints,
  handlePoints,
  nodeAABB,
  rectCornerRadiusHandles,
  rotationHandleGeometry,
  selectionHandlePoints,
  toNodeLocal,
} from "./scene_geometry.js";
import {
  HANDLE_GRAB_RADIUS,
  docToScreenPoint,
  docToScreenRect,
} from "./scene_renderer.js";

export function visibleSelectedNode(api) {
  const selected = api.getSelected();
  if (!selected) return null;
  const hasEvaluatedState =
    selected.timing ||
    selected.animations?.some((track) => track.keyframes?.length);
  if (!hasEvaluatedState) return selected;
  const frameNode = api
    .getEvaluatedDocument?.()
    ?.nodes.find((node) => node.id === selected.id);
  return api.getEffectiveNode?.(frameNode ?? selected) ?? frameNode ?? selected;
}

export function createPointerHitTester({ api, stage: _stage, screenPoint }) {
  /**
   * The corner-radius handle under the pointer, or null.
   */
  const rectRadiusHandleUnder = (node, event) => {
    if (!node || node.kind !== NODE_KIND.RECT || node.locked) return null;
    const viewport = api.getViewport();
    const cursorPt = screenPoint(event);
    for (const handle of rectCornerRadiusHandles(node)) {
      const screenPt = docToScreenPoint(handle, viewport);
      const dist = Math.hypot(cursorPt.x - screenPt.x, cursorPt.y - screenPt.y);
      if (dist <= HANDLE_GRAB_RADIUS + 2) return handle.handle;
    }
    return null;
  };

  /** Returns true if pointer is inside a node's local box or deformed AABB */
  const nodeRectContains = (node, event) => {
    const targetNode = api.getEffectiveNode ? api.getEffectiveNode(node) : node;
    const pt = api.toDocPoint(event.clientX, event.clientY);
    if (
      (Array.isArray(targetNode.perspectiveQuad) &&
        targetNode.perspectiveQuad.length === 4) ||
      (Array.isArray(targetNode.perspectiveCorners) &&
        targetNode.perspectiveCorners.length === 4) ||
      (targetNode.warpMesh &&
        Array.isArray(targetNode.warpMesh.points) &&
        targetNode.warpMesh.points.length > 0)
    ) {
      const aabb = nodeAABB(targetNode);
      return (
        pt.x >= aabb.x &&
        pt.x <= aabb.x + aabb.width &&
        pt.y >= aabb.y &&
        pt.y <= aabb.y + aabb.height
      );
    }
    const local = toNodeLocal(targetNode, pt);
    const minLocalX = targetNode.effectiveLocal?.x ?? 0;
    const minLocalY = targetNode.effectiveLocal?.y ?? 0;
    const maxLocalX = targetNode.effectiveLocal
      ? targetNode.effectiveLocal.x + targetNode.effectiveLocal.width
      : targetNode.width;
    const maxLocalY = targetNode.effectiveLocal
      ? targetNode.effectiveLocal.y + targetNode.effectiveLocal.height
      : targetNode.height;
    return (
      local.x >= minLocalX &&
      local.x <= maxLocalX &&
      local.y >= minLocalY &&
      local.y <= maxLocalY
    );
  };

  /** The handle under the pointer for a rect in document space, or null. */
  const handleUnder = (rect, event) =>
    handleAtPoint(
      docToScreenRect(rect, api.getViewport()),
      screenPoint(event),
      HANDLE_GRAB_RADIUS,
    );

  /**
   * The handle under the pointer for a node, or null.
   */
  const nodeHandleUnder = (node, event) => {
    let points;
    if (node?.kind === NODE_KIND.REGION) {
      const outline = ops.regionOutlineInDoc(api.getDocument(), node);
      if (!outline) return null;
      points = handlePoints(outline.box).map((point) => ({
        handle: point.handle,
        ...docToScreenPoint(point, api.getViewport()),
      }));
    } else {
      const viewport = api.getViewport();
      const targetNode = api.getEffectiveNode
        ? api.getEffectiveNode(node)
        : node;
      points = selectionHandlePoints(targetNode).map((point) => ({
        handle: point.handle,
        ...docToScreenPoint(point, viewport),
      }));
    }
    return handleFromPoints(points, screenPoint(event), HANDLE_GRAB_RADIUS);
  };

  /**
   * Whether the pointer is on the selected node's rotate grip.
   */
  const rotateHandleUnder = (node, event) => {
    if (!node || node.locked || node.kind === NODE_KIND.REGION) return false;
    const targetNode = api.getEffectiveNode ? api.getEffectiveNode(node) : node;
    const viewport = api.getViewport();
    const cursorPt = screenPoint(event);

    // 1. Top rotation grip
    const geom = rotationHandleGeometry(targetNode, viewport.zoom);
    if (geom?.grip) {
      const screenGrip = docToScreenPoint(geom.grip, viewport);
      if (
        Math.hypot(cursorPt.x - screenGrip.x, cursorPt.y - screenGrip.y) <=
        HANDLE_GRAB_RADIUS + 8
      ) {
        return true;
      }
    }

    // Inside bounds is drag/select, not corner rotation
    const docPt = api.toDocPoint(event.clientX, event.clientY);
    const local = toNodeLocal(targetNode, docPt);
    const minLocalX = targetNode.effectiveLocal?.x ?? 0;
    const minLocalY = targetNode.effectiveLocal?.y ?? 0;
    const maxLocalX = targetNode.effectiveLocal
      ? targetNode.effectiveLocal.x + targetNode.effectiveLocal.width
      : targetNode.width;
    const maxLocalY = targetNode.effectiveLocal
      ? targetNode.effectiveLocal.y + targetNode.effectiveLocal.height
      : targetNode.height;
    if (
      local.x >= minLocalX &&
      local.x <= maxLocalX &&
      local.y >= minLocalY &&
      local.y <= maxLocalY
    ) {
      return false;
    }

    // Invisible corner rings must not capture a visible neighboring layer's
    // body at small zoom levels. The explicit grip above keeps its priority.
    const bodyHit = api.nodeAtPoint?.(docPt);
    if (bodyHit && bodyHit.id !== node.id) return false;

    // 2. 4 corner handles rotation ring outside node bounds
    const cornerHandles = ["nw", "ne", "se", "sw"];
    const onScreenCorners = selectionHandlePoints(targetNode)
      .filter((p) => cornerHandles.includes(p.handle))
      .map((point) => ({
        handle: point.handle,
        ...docToScreenPoint(point, viewport),
      }));

    for (const corner of onScreenCorners) {
      const dx = cursorPt.x - corner.x;
      const dy = cursorPt.y - corner.y;
      const dist = Math.hypot(dx, dy);
      if (dist > HANDLE_GRAB_RADIUS && dist <= HANDLE_GRAB_RADIUS + 24) {
        return true;
      }
    }
    return false;
  };

  /**
   * The topmost image node under a document-space point.
   *
   * Uses the document's R-tree spatial index when one is available, so a
   * 10k-node page costs a point query plus the few overlapping images instead
   * of a scan of every node. Candidates are still tested topmost-first, and
   * each one is confirmed with the exact local-space bounds test the linear
   * scan used, so results are identical with and without the index.
   */
  const imageAt = (doc, point) => {
    const index =
      (typeof api.getSpatialIndex === "function" && api.getSpatialIndex()) ||
      doc.spatialIndex ||
      doc._spatialIndex;

    if (index?.pointQuery) {
      const zoom = api.getViewport?.()?.zoom ?? 1;
      const slop = Math.max(1, 24 / Math.max(0.1, zoom));
      const candidates = index.pointQuery(point, slop);
      if (candidates.length === 0) return null;
      for (const node of orderedCandidates(doc.nodes, candidates)) {
        if (
          node.visible === false ||
          node.locked ||
          node.lockImagePixels ||
          node.kind !== NODE_KIND.IMAGE
        ) {
          continue;
        }
        const local = toNodeLocal(node, point);
        if (
          local.x >= 0 &&
          local.x <= node.width &&
          local.y >= 0 &&
          local.y <= node.height
        ) {
          if (node.paint === true && !api.isPaintOpaqueAt(node, point)) continue;
          return node;
        }
      }
      return null;
    }

    for (let index = doc.nodes.length - 1; index >= 0; index -= 1) {
      const node = doc.nodes[index];
      if (
        node.visible === false ||
        node.locked ||
        node.lockImagePixels ||
        node.kind !== NODE_KIND.IMAGE
      ) {
        continue;
      }
      const local = toNodeLocal(node, point);
      if (
        local.x >= 0 &&
        local.x <= node.width &&
        local.y >= 0 &&
        local.y <= node.height
      ) {
        if (node.paint === true && !api.isPaintOpaqueAt(node, point)) continue;
        return node;
      }
    }
    return null;
  };

  /**
   * Ray-casting point-in-polygon over a selection's rings.
   */
  const pointInContours = (selection, point) => {
    const bounds = selection.bounds;
    if (
      bounds &&
      (point.x < bounds.x - 1 ||
        point.x > bounds.x + bounds.width + 1 ||
        point.y < bounds.y - 1 ||
        point.y > bounds.y + bounds.height + 1)
    ) {
      return false;
    }
    const rings = selection.contours ?? [];
    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const crosses =
          yi > point.y !== yj > point.y &&
          point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
        if (crosses) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };

  return {
    rectRadiusHandleUnder,
    nodeRectContains,
    handleUnder,
    nodeHandleUnder,
    rotateHandleUnder,
    imageAt,
    pointInContours,
  };
}
