/**
 * Perspective, mesh distort, and puppet warp pointer gestures.
 *
 * Extracted from editor_pointer_transform.js and editor_pointer.js.
 */

import { TOOL } from "./editor_constants.js";
import { fromNodeLocal, toNodeLocal } from "./scene_geometry.js";
import { addPuppetPin, movePuppetPin } from "./puppet_warp.js";
import { warpPatchForTool } from "./editor_engine_warp.js";
import {
  isDefaultPerspectiveCorners,
  perspectiveCornersToWarpMesh,
} from "./perspective_geometry.js";

export function createWarpPointerGestures({ api, setGesture }) {
  /**
   * Starts the right warp gesture for a press, if the press landed on a warp
   * control point.
   */
  function grabWarpControl(node, event, point) {
    if (!node) return false;
    const tool = api.getTool();
    if (tool === TOOL.PERSPECTIVE) {
      const corners = node.perspectiveCorners || [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const zoom = api.getViewport()?.zoom || 1;
      const radius = 12 / zoom;
      let cornerIdx = -1;
      let best = Infinity;
      corners.forEach((c, index) => {
        const mapped = fromNodeLocal(node, {
          x: c.x * node.width,
          y: c.y * node.height,
        });
        const dist = Math.hypot(mapped.x - point.x, mapped.y - point.y);
        if (dist <= radius && dist < best) {
          best = dist;
          cornerIdx = index;
        }
      });
      if (cornerIdx !== -1) {
        setGesture({
          kind: "perspectiveCorner",
          id: node.id,
          cornerIdx,
          corners,
        });
        return true;
      }
      return false;
    }

    if (tool === TOOL.DISTORT || tool === TOOL.MESH_WARP) {
      const isDistort = tool === TOOL.DISTORT;
      const defaultCols = isDistort ? 3 : 4;
      const defaultRows = isDistort ? 3 : 4;
      let mesh = node.warpMesh;
      if (
        !mesh &&
        node.perspectiveCorners &&
        !isDefaultPerspectiveCorners(node.perspectiveCorners)
      ) {
        mesh = perspectiveCornersToWarpMesh(node.perspectiveCorners);
      }
      if (!mesh || !Array.isArray(mesh.points)) {
        const pts = [];
        const cols = defaultCols;
        const rows = defaultRows;
        for (let r = 0; r <= rows; r++) {
          for (let c = 0; c <= cols; c++) {
            pts.push({
              x: c / cols,
              y: r / rows,
              origU: c / cols,
              origV: r / rows,
            });
          }
        }
        mesh = {
          cols,
          rows,
          points: pts,
          isCurve: isDistort,
        };
        api.updateNode(node.id, { warpMesh: mesh }, { commit: false });
      }

      const zoom = api.getViewport()?.zoom || 1;
      const radius = 12 / zoom;
      let ptIdx = -1;
      let best = Infinity;
      mesh.points.forEach((p, index) => {
        const mapped = fromNodeLocal(node, {
          x: p.x * node.width,
          y: p.y * node.height,
        });
        const dist = Math.hypot(mapped.x - point.x, mapped.y - point.y);
        if (dist <= radius && dist < best) {
          best = dist;
          ptIdx = index;
        }
      });

      if (ptIdx !== -1) {
        setGesture({
          kind: "meshPoint",
          id: node.id,
          ptIdx,
          points: mesh.points,
          cols: mesh.cols,
          rows: mesh.rows,
          isCurve: mesh.isCurve ?? isDistort,
        });
        return true;
      }
      return false;
    }

    if (tool === TOOL.PUPPET_WARP) {
      // Pin factories return pins separately from the mesh. Reuse the tool's
      // canonical mesh initializer so the first click on any selected layer
      // creates a usable pin instead of reading the obsolete object contract.
      const initial = warpPatchForTool(node, TOOL.PUPPET_WARP);
      const pins = initial.puppetPins;
      const mesh = initial.warpMesh;
      if (pins !== node.puppetPins || mesh !== node.warpMesh) {
        api.updateNode(
          node.id,
          { puppetPins: pins, warpMesh: mesh },
          { commit: false },
        );
      }

      const zoom = api.getViewport()?.zoom || 1;
      const radius = 14 / zoom;
      let pinIdx = -1;
      let best = Infinity;
      pins.forEach((p, index) => {
        const mapped = fromNodeLocal(node, {
          x: p.x * node.width,
          y: p.y * node.height,
        });
        const dist = Math.hypot(mapped.x - point.x, mapped.y - point.y);
        if (dist <= radius && dist < best) {
          best = dist;
          pinIdx = index;
        }
      });

      if (pinIdx !== -1) {
        api.setSelectedPuppetPin?.(pins[pinIdx].id);
        setGesture({
          kind: "puppetPin",
          id: node.id,
          pinId: pins[pinIdx].id,
          pins,
          mesh,
        });
        return true;
      }

      const local = toNodeLocal(node, point);
      if (
        local.x >= 0 &&
        local.x <= node.width &&
        local.y >= 0 &&
        local.y <= node.height
      ) {
        const nx = local.x / node.width;
        const ny = local.y / node.height;
        const next = addPuppetPin(pins, nx, ny);
        api.updateNode(
          node.id,
          { puppetPins: next.pins, warpMesh: mesh },
          { commit: false },
        );
        api.setSelectedPuppetPin?.(next.pin.id);
        setGesture({
          kind: "puppetPin",
          id: node.id,
          pinId: next.pin.id,
          pins: next.pins,
          mesh,
        });
        return true;
      }
      return false;
    }

    return false;
  }

  function dragPerspectiveCorner(event, gesture) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const node = api.getSelected();
    const nextCorners = JSON.parse(JSON.stringify(gesture.corners));
    if (node && node.width > 0 && node.height > 0) {
      const local = toNodeLocal(node, point);
      const rawX = local.x / node.width;
      const rawY = local.y / node.height;
      const snapThreshX = 6 / (node.width * (api.getViewport?.()?.zoom ?? 1));
      const snapThreshY = 6 / (node.height * (api.getViewport?.()?.zoom ?? 1));
      const snapTargets = [0, 0.5, 1];
      const snapVal = (v, thresh) => {
        for (const t of snapTargets) {
          if (Math.abs(v - t) < thresh) return t;
        }
        return v;
      };
      nextCorners[gesture.cornerIdx] = {
        x: snapVal(rawX, snapThreshX),
        y: snapVal(rawY, snapThreshY),
      };
    }
    api.updateNode(
      gesture.id,
      { perspectiveCorners: nextCorners },
      { commit: false },
    );
  }

  function dragMeshPoint(event, gesture) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const node = api.getSelected();
    const nextPoints = JSON.parse(JSON.stringify(gesture.points));
    if (node && node.width > 0 && node.height > 0) {
      const local = toNodeLocal(node, point);
      const rawX = local.x / node.width;
      const rawY = local.y / node.height;

      const snapThreshX = 6 / (node.width * (api.getViewport?.()?.zoom ?? 1));
      const snapThreshY = 6 / (node.height * (api.getViewport?.()?.zoom ?? 1));
      const snapTargets = [0, 0.5, 1];
      const snapVal = (v, thresh) => {
        for (const t of snapTargets) {
          if (Math.abs(v - t) < thresh) return t;
        }
        return v;
      };
      const nextX = snapVal(rawX, snapThreshX);
      const nextY = snapVal(rawY, snapThreshY);

      const prevPoint = gesture.points[gesture.ptIdx];
      const deltaX = nextX - prevPoint.x;
      const deltaY = nextY - prevPoint.y;

      nextPoints[gesture.ptIdx] = {
        x: nextX,
        y: nextY,
        origU: prevPoint?.origU ?? nextX,
        origV: prevPoint?.origV ?? nextY,
      };

      if (
        gesture.cols === 3 &&
        gesture.rows === 3 &&
        gesture.points.length === 16 &&
        (gesture.isCurve || api.getTool() === TOOL.DISTORT)
      ) {
        const cornerPairs = {
          0: [1, 4],
          3: [2, 7],
          12: [8, 13],
          15: [11, 14],
        };
        const handles = cornerPairs[gesture.ptIdx];
        if (handles) {
          for (const hIdx of handles) {
            const origH = gesture.points[hIdx];
            nextPoints[hIdx] = {
              x: origH.x + deltaX,
              y: origH.y + deltaY,
              origU: origH.origU ?? origH.x + deltaX,
              origV: origH.origV ?? origH.y + deltaY,
            };
          }
        }
      }
    }
    api.updateNode(
      gesture.id,
      {
        warpMesh: {
          cols: gesture.cols,
          rows: gesture.rows,
          points: nextPoints,
          isCurve: gesture.isCurve ?? api.getTool() === TOOL.DISTORT,
        },
      },
      { commit: false },
    );
  }

  function dragPuppetPin(event, gesture) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const node = api.getSelected();
    if (node && node.width > 0 && node.height > 0) {
      const local = toNodeLocal(node, point);
      const x = local.x / node.width;
      const y = local.y / node.height;
      const next = movePuppetPin(
        gesture.mesh,
        gesture.pins,
        gesture.pinId,
        x,
        y,
      );
      api.updateNode(
        gesture.id,
        { puppetPins: next.pins, warpMesh: next.mesh },
        { commit: false },
      );
    }
  }

  return {
    grabWarpControl,
    dragPerspectiveCorner,
    dragMeshPoint,
    dragPuppetPin,
  };
}
