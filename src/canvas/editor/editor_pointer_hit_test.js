import { orderedCandidates } from "./hit_test_candidates.js";
/**
 * Hit testing helpers for pointer gestures on the canvas editor stage.
 */

import * as ops from "./doc_ops.js";
import { NODE_KIND } from "./scene_model.js";
import {
  combinedBounds,
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
import { TOOL } from "./editor_constants.js";

export function visibleSelectedNode(api) {
  const selected =
    (api?.getSelected ? api.getSelected() : null) ??
    api?.getSelectedNodes?.()?.[0] ??
    null;
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

export function createPointerHitTester({
  api,
  stage: _stage,
  screenPoint = (event) => {
    if (_stage?.getBoundingClientRect) {
      const rect = _stage.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    return { x: event.clientX ?? 0, y: event.clientY ?? 0 };
  },
}) {
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
      (Array.isArray(targetNode.perspectiveQuad) && targetNode.perspectiveQuad.length === 4) ||
      (Array.isArray(targetNode.perspectiveCorners) && targetNode.perspectiveCorners.length === 4) ||
      (targetNode.warpMesh && Array.isArray(targetNode.warpMesh.points) && targetNode.warpMesh.points.length > 0)
    ) {
      const aabb = nodeAABB(targetNode);
      return pt.x >= aabb.x && pt.x <= aabb.x + aabb.width && pt.y >= aabb.y && pt.y <= aabb.y + aabb.height;
    }
    const local = toNodeLocal(targetNode, pt);
    return local.x >= 0 && local.x <= targetNode.width && local.y >= 0 && local.y <= targetNode.height;
  };

  /** The handle under the pointer for a rect in document space, or null. */
  const handleUnder = (rect, event) =>
    handleAtPoint(
      docToScreenRect(rect, api.getViewport()),
      screenPoint(event),
      HANDLE_GRAB_RADIUS,
    );

  /**
   * Crop handles include the four edge midpoints as invisible bands: clicking
   * near a crop side resizes that side. Corners still win so diagonal resizes
   * keep working, and the extra slop makes the thin crop border easy to grab.
   */
  const cropHandleUnder = (rect, event) => {
    const screenRect = docToScreenRect(rect, api.getViewport());
    const cursor = screenPoint(event);
    const corner = handleAtPoint(screenRect, cursor, HANDLE_GRAB_RADIUS);
    if (corner) return corner;
    const tol = HANDLE_GRAB_RADIUS + 6;
    const nearX = cursor.x >= screenRect.x - tol && cursor.x <= screenRect.x + screenRect.width + tol;
    const nearY = cursor.y >= screenRect.y - tol && cursor.y <= screenRect.y + screenRect.height + tol;
    const candidates = [];
    if (nearY) {
      candidates.push({ handle: "w", distance: Math.abs(cursor.x - screenRect.x) });
      candidates.push({ handle: "e", distance: Math.abs(cursor.x - (screenRect.x + screenRect.width)) });
    }
    if (nearX) {
      candidates.push({ handle: "n", distance: Math.abs(cursor.y - screenRect.y) });
      candidates.push({ handle: "s", distance: Math.abs(cursor.y - (screenRect.y + screenRect.height)) });
    }
    const best = candidates.filter((e) => e.distance <= tol).sort((a, b) => a.distance - b.distance)[0];
    return best?.handle ?? null;
  };

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
    const isFrame = Boolean(node.isFrame || node.frame || node.containerType === "frame" || node.kind === "frame");
    const targetNode = api.getEffectiveNode ? api.getEffectiveNode(node) : node;
    const viewport = api.getViewport();
    const cursorPt = screenPoint(event);

    // 1. Top rotation grip (never on a Frame)
    if (!isFrame) {
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
    }

    // Inside bounds is drag/select, not corner rotation
    const docPt = api.toDocPoint(event.clientX, event.clientY);
    const local = toNodeLocal(targetNode, docPt);
    if (local.x >= 0 && local.x <= targetNode.width && local.y >= 0 && local.y <= targetNode.height) {
      return false;
    }

    // Invisible corner rings must not capture a visible neighboring layer's
    // body at small zoom levels. The explicit grip above keeps its priority.
    const bodyHit = api.nodeAtPoint?.(docPt);
    if (bodyHit && bodyHit.id !== node.id) {
      const doc = api.getDocument?.();
      const nodeIndex = doc?.nodes?.findIndex((n) => n.id === node.id) ?? -1;
      const hitIndex = doc?.nodes?.findIndex((n) => n.id === bodyHit.id) ?? -1;
      if (hitIndex > nodeIndex && bodyHit.id !== node.parentId) return false;
    }

    // 2. 4 corner handles rotation ring outside node bounds
    const cornerHandles = ["nw", "ne", "se", "sw"];
    const onScreenCorners = selectionHandlePoints(targetNode)
      .filter((p) => cornerHandles.includes(p.handle))
      .map((point) => ({ handle: point.handle, ...docToScreenPoint(point, viewport) }));

    for (const corner of onScreenCorners) {
      const dist = Math.hypot(cursorPt.x - corner.x, cursorPt.y - corner.y);
      if (dist > HANDLE_GRAB_RADIUS && dist <= HANDLE_GRAB_RADIUS + 24) return true;
    }
    return false;
  };

  /**
   * The topmost image node under a document-space point.
   */
  const imageAt = (doc, point) => {
    const isMatchingImage = (node) => {
      if (node.visible === false || node.locked || node.lockImagePixels || node.kind !== NODE_KIND.IMAGE) return false;
      const local = toNodeLocal(node, point);
      if (local.x >= 0 && local.x <= node.width && local.y >= 0 && local.y <= node.height) {
        return !(node.paint === true && !api.isPaintOpaqueAt(node, point));
      }
      return false;
    };

    const index = (typeof api.getSpatialIndex === "function" && api.getSpatialIndex()) || doc.spatialIndex || doc._spatialIndex;
    if (index?.pointQuery) {
      const zoom = api.getViewport?.()?.zoom ?? 1;
      const slop = Math.max(1, 24 / Math.max(0.1, zoom));
      const candidates = index.pointQuery(point, slop);
      if (candidates.length === 0) return null;
      for (const node of orderedCandidates(doc.nodes, candidates)) {
        if (isMatchingImage(node)) return node;
      }
      return null;
    }

    for (let index = doc.nodes.length - 1; index >= 0; index -= 1) {
      const node = doc.nodes[index];
      if (isMatchingImage(node)) return node;
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

  /**
   * Whether the pointer is over any selection handle, rotation affordance,
   * or crop handle for the active tool.
   */
  const hasHandleUnder = (event) => {
    if (!event || event.clientX == null || event.clientY == null) return false;
    const tool = typeof api?.getTool === "function" ? api.getTool() : TOOL.SELECT;
    if (tool !== TOOL.SELECT && tool !== TOOL.CROP) return false;

    if (tool === TOOL.CROP) {
      const crop = api?.getCropRect?.();
      return Boolean(crop && cropHandleUnder(crop, event));
    }

    let multiNodes = [];
    if (typeof api?.getSelectedNodes === "function") {
      multiNodes = (api.getSelectedNodes() ?? []).filter((n) => !n.locked && !n.lockPosition);
    } else if (typeof api?.getSelectedIds === "function") {
      const ids = api.getSelectedIds() ?? [];
      if (ids.length > 1) {
        if (typeof api.getNode === "function") {
          multiNodes = ids.map((id) => api.getNode(id)).filter((n) => n && !n.locked && !n.lockPosition);
        } else if (typeof api.getDocument === "function") {
          const docNodes = api.getDocument()?.nodes ?? [];
          const idSet = new Set(ids);
          multiNodes = docNodes.filter((n) => idSet.has(n.id) && !n.locked && !n.lockPosition);
        }
      }
    }

    if (multiNodes.length > 1) {
      const combined = combinedBounds(multiNodes.map((node) => nodeAABB(node)));
      if (combined) {
        const viewport = api.getViewport ? api.getViewport() : { panX: 0, panY: 0, zoom: 1 };
        const screenHandles = handlePoints(combined).map((pt) => ({
          handle: pt.handle,
          ...docToScreenPoint(pt, viewport),
        }));
        const multiHandle = handleFromPoints(screenHandles, screenPoint(event), HANDLE_GRAB_RADIUS);
        if (multiHandle) return true;

        const cornerHandles = ["nw", "ne", "se", "sw"];
        const screenCorners = screenHandles.filter((p) => cornerHandles.includes(p.handle));
        const margin = 3 / (viewport?.zoom || 1);
        const point = api.toDocPoint(event.clientX, event.clientY);
        const isInsideCombined =
          point.x >= combined.x - margin &&
          point.x <= combined.x + combined.width + margin &&
          point.y >= combined.y - margin &&
          point.y <= combined.y + combined.height + margin;

        const bodyHit = api.nodeAtPoint?.(point);
        const doc = api.getDocument?.();
        const hitIndex = doc?.nodes?.findIndex((n) => n.id === bodyHit?.id) ?? -1;
        const maxMultiIndex = doc?.nodes
          ? Math.max(...multiNodes.map((n) => doc.nodes.findIndex((docNode) => docNode.id === n.id)))
          : -1;
        const isOverForegroundOtherNode =
          bodyHit &&
          !multiNodes.some((n) => n.id === bodyHit.id || bodyHit.id === n.parentId) &&
          hitIndex > maxMultiIndex;

        if (!isInsideCombined && !isOverForegroundOtherNode) {
          const cursorPt = screenPoint(event);
          const isNearCorner = screenCorners.some((corner) => {
            const dist = Math.hypot(cursorPt.x - corner.x, cursorPt.y - corner.y);
            return dist > HANDLE_GRAB_RADIUS + 2 && dist <= HANDLE_GRAB_RADIUS + 24;
          });
          if (isNearCorner) return true;
        }
      }
      return false;
    }

    const selected = visibleSelectedNode(api);
    if (selected && !selected.locked && selected.kind !== NODE_KIND.ADJUSTMENT) {
      if (nodeHandleUnder(selected, event)) return true;
      if (rotateHandleUnder(selected, event)) return true;
      if (selected.kind === NODE_KIND.RECT && rectRadiusHandleUnder(selected, event)) return true;
    }

    return false;
  };

  return {
    rectRadiusHandleUnder,
    nodeRectContains,
    handleUnder,
    cropHandleUnder,
    nodeHandleUnder,
    rotateHandleUnder,
    imageAt,
    pointInContours,
    hasHandleUnder,
  };
}

export function hasHandleUnder(event, hitTesterOrOptions) {
  if (typeof hitTesterOrOptions?.hasHandleUnder === "function") {
    return hitTesterOrOptions.hasHandleUnder(event);
  }
  const hitTester = createPointerHitTester(hitTesterOrOptions || {});
  return hitTester.hasHandleUnder(event);
}
