/**
 * Transform-domain API facade extracted from the createEditor closure.
 *
 * Coordinates:
 * - transform_api_puppet.js: Puppet Warp pin operations (rotate, depth, fix, delete)
 * - transform_api_bake.js: Bitmap baking, flip, 90° rotation, and layer rasterization
 * - transform_api_free_transform.js: Selection Free Transform bounding box interaction
 */

import { commitEditorDocument } from "../undo-action-contracts.js";
import { findNode, groupDescendants, NODE_KIND } from "./scene_model.js";
import * as ops from "./doc_ops.js";
import { createPuppetTransformApi } from "./transform_api_puppet.js";
import { createBakeTransformApi } from "./transform_api_bake.js";
import { createSelectionTransformApi } from "./transform_api_free_transform.js";

/**
 * Commits a transform modification to the editor document history.
 * Bound to the literal "editor.transform.change" undo contract action.
 */
export function commitTransformChange(setDoc, next) {
  commitEditorDocument("editor.transform.change", setDoc, next);
}

export function createTransformApi(deps) {
  const puppetApi = createPuppetTransformApi({
    getDoc: deps.getDoc,
    setDoc: deps.setDoc,
    getSelectedId: deps.getSelectedId,
    getSelectedPuppetPin: deps.getSelectedPuppetPin,
    setSelectedPuppetPin: deps.setSelectedPuppetPin,
    commitTransformChange,
    notify: deps.notify,
  });

  const bakeApi = deps.bakeApi ?? createBakeTransformApi({
    getDoc: deps.getDoc,
    setDoc: deps.setDoc,
    getPixelSelection: deps.getPixelSelection,
    cache: deps.cache,
    maskTools: deps.maskTools,
    glAdjustments: deps.glAdjustments,
    requestRender: deps.requestRender,
    notify: deps.notify,
    trackTransform: deps.trackTransform,
    transformsInFlight: deps.transformsInFlight,
    activeTransformPromises: deps.activeTransformPromises,
    isDisposed: deps.isDisposed,
    commitTransformChange,
  });

  const selectionApi = createSelectionTransformApi({
    getDoc: deps.getDoc,
    getPixelSelection: deps.getPixelSelection,
    setPixelSelection: deps.setPixelSelection,
    getSelectionTransform: deps.getSelectionTransform,
    setSelectionTransform: deps.setSelectionTransform,
    setRegionHint: deps.setRegionHint,
    cache: deps.cache,
    maskTools: deps.maskTools,
    syncAnts: deps.syncAnts,
    requestRender: deps.requestRender,
    notify: deps.notify,
    cancelPolygonLasso: deps.cancelPolygonLasso,
    trackTransform: deps.trackTransform,
    replaceNodeBitmap: deps.replaceNodeBitmap,
  });

  async function flipHorizontal(targetId = null) {
    const group = deps.getSelectedGroup?.();
    const ids = targetId
      ? [targetId]
      : (group ? [group.id] : (deps.getSelectedIds?.() ??
        (deps.getSelectedId?.() ? [deps.getSelectedId()] : [])));
    if (!ids || ids.length === 0) return false;
    const allPatches = [];
    for (const id of ids) {
      const node = findNode(deps.getDoc(), id);
      if (!node) continue;
      if (node.kind === NODE_KIND.GROUP) {
        const children = groupDescendants(deps.getDoc(), node.id);
        for (const child of children) {
          const patch = { flipH: !child.flipH };
          if (node.width && child.width !== undefined && child.x !== undefined) {
            patch.x = 2 * (node.x ?? 0) + node.width - child.x - (child.width ?? 0);
          }
          allPatches.push({ nodeId: child.id, patch });
        }
      } else if (node.kind === NODE_KIND.IMAGE) {
        const fn =
          deps.getTransformNodeBitmap?.() ??
          deps.transformNodeBitmap ??
          bakeApi.transformNodeBitmap;
        const res = await fn(id, "flipH", { commit: false });
        if (res?.patch) {
          allPatches.push({ nodeId: id, patch: res.patch });
        }
      } else {
        allPatches.push({ nodeId: id, patch: { flipH: !node.flipH } });
      }
    }
    if (allPatches.length === 0) return false;
    let nextDoc = deps.getDoc();
    for (const { nodeId, patch } of allPatches) {
      nextDoc = ops.updateNode(nextDoc, nodeId, patch);
    }
    if (nextDoc !== deps.getDoc()) {
      commitTransformChange(deps.setDoc, nextDoc);
      deps.requestRender?.();
      deps.notify?.();
      return true;
    }
    return false;
  }

  async function flipVertical(targetId = null) {
    const group = deps.getSelectedGroup?.();
    const ids = targetId
      ? [targetId]
      : (group ? [group.id] : (deps.getSelectedIds?.() ??
        (deps.getSelectedId?.() ? [deps.getSelectedId()] : [])));
    if (!ids || ids.length === 0) return false;
    const allPatches = [];
    for (const id of ids) {
      const node = findNode(deps.getDoc(), id);
      if (!node) continue;
      if (node.kind === NODE_KIND.GROUP) {
        const children = groupDescendants(deps.getDoc(), node.id);
        for (const child of children) {
          const patch = { flipV: !child.flipV };
          if (node.height && child.height !== undefined && child.y !== undefined) {
            patch.y = 2 * (node.y ?? 0) + node.height - child.y - (child.height ?? 0);
          }
          allPatches.push({ nodeId: child.id, patch });
        }
      } else if (node.kind === NODE_KIND.IMAGE) {
        const fn =
          deps.getTransformNodeBitmap?.() ??
          deps.transformNodeBitmap ??
          bakeApi.transformNodeBitmap;
        const res = await fn(id, "flipV", { commit: false });
        if (res?.patch) {
          allPatches.push({ nodeId: id, patch: res.patch });
        }
      } else {
        allPatches.push({ nodeId: id, patch: { flipV: !node.flipV } });
      }
    }
    if (allPatches.length === 0) return false;
    let nextDoc = deps.getDoc();
    for (const { nodeId, patch } of allPatches) {
      nextDoc = ops.updateNode(nextDoc, nodeId, patch);
    }
    if (nextDoc !== deps.getDoc()) {
      commitTransformChange(deps.setDoc, nextDoc);
      deps.requestRender?.();
      deps.notify?.();
      return true;
    }
    return false;
  }

  async function rotateClockwise(targetId = null) {
    const ids = targetId
      ? [targetId]
      : (deps.getSelectedIds?.() ??
        (deps.getSelectedId?.() ? [deps.getSelectedId()] : []));
    if (!ids || ids.length === 0) return false;
    const allPatches = [];
    for (const id of ids) {
      const node = findNode(deps.getDoc(), id);
      if (!node) continue;
      if (node.kind === NODE_KIND.IMAGE) {
        const fn =
          deps.getTransformNodeBitmap?.() ??
          deps.transformNodeBitmap ??
          bakeApi.transformNodeBitmap;
        const res = await fn(id, "rotate90", { commit: false });
        if (res?.patch) {
          allPatches.push({ nodeId: id, patch: res.patch });
        }
      } else {
        const curRot = typeof node.rotation === "number" ? node.rotation : 0;
        const nextRot = (curRot + 90) % 360;
        allPatches.push({ nodeId: id, patch: { rotation: nextRot } });
      }
    }
    if (allPatches.length === 0) return false;
    let nextDoc = deps.getDoc();
    for (const { nodeId, patch } of allPatches) {
      nextDoc = ops.updateNode(nextDoc, nodeId, patch);
    }
    if (nextDoc !== deps.getDoc()) {
      commitTransformChange(deps.setDoc, nextDoc);
      deps.requestRender?.();
      deps.notify?.();
      return true;
    }
    return false;
  }

  async function rotateCounterClockwise(targetId = null) {
    const ids = targetId
      ? [targetId]
      : (deps.getSelectedIds?.() ??
        (deps.getSelectedId?.() ? [deps.getSelectedId()] : []));
    if (!ids || ids.length === 0) return false;
    const allPatches = [];
    for (const id of ids) {
      const node = findNode(deps.getDoc(), id);
      if (!node) continue;
      if (node.kind === NODE_KIND.IMAGE) {
        const fn =
          deps.getTransformNodeBitmap?.() ??
          deps.transformNodeBitmap ??
          bakeApi.transformNodeBitmap;
        const res = await fn(id, "rotate270", { commit: false });
        if (res?.patch) {
          allPatches.push({ nodeId: id, patch: res.patch });
        }
      } else {
        const curRot = typeof node.rotation === "number" ? node.rotation : 0;
        const nextRot = (curRot - 90 + 360) % 360;
        allPatches.push({ nodeId: id, patch: { rotation: nextRot } });
      }
    }
    if (allPatches.length === 0) return false;
    let nextDoc = deps.getDoc();
    for (const { nodeId, patch } of allPatches) {
      nextDoc = ops.updateNode(nextDoc, nodeId, patch);
    }
    if (nextDoc !== deps.getDoc()) {
      commitTransformChange(deps.setDoc, nextDoc);
      deps.requestRender?.();
      deps.notify?.();
      return true;
    }
    return false;
  }

  return {
    ...bakeApi,
    ...puppetApi,
    ...selectionApi,
    flipHorizontal,
    flipVertical,
    rotateClockwise,
    rotateCounterClockwise,
  };
}
