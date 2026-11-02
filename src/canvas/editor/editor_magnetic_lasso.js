/** Runtime Magnetic Lasso draft controller. The draft never enters scene data. */

import { commitEditorAction } from "../undo-action-contracts.js";
import { contourBounds } from "./mask_contour.js";
import {
  MAGNETIC_LASSO_SETTINGS,
  findMagneticTarget,
  straightLinePath,
  traceLiveWirePath,
} from "./magnetic_lasso.js";
import {
  buildMagneticSegment,
  docPointToTier,
  prepareMagneticLassoSource,
  tierPointToDoc,
} from "./editor_magnetic_lasso_source.js";
import { createMagneticLassoSettings } from "./editor_magnetic_lasso_settings.js";
import {
  appendMagneticPath,
  magneticPolygonArea,
  sameMagneticPoint,
} from "./editor_magnetic_lasso_path.js";

const HISTORY_LABEL = "editor.history.entry.magneticLasso";

export function createMagneticLassoController({
  getDocument,
  getNodeBitmap,
  getViewport,
  getPixelSelection,
  setPixelSelection,
  combinePixelSelection,
  getSelectionFeather,
  featherPixelSelection,
  commitHistory,
  setHint,
  requestRender,
  notify,
  readRgba,
}) {
  let draft = null;
  let straight = false;
  const settings = createMagneticLassoSettings();

  function hostOf(candidate = draft) {
    return candidate
      ? (getDocument()?.nodes?.find((node) => node.id === candidate.nodeId) ??
          null)
      : null;
  }

  function radiusFor(node, analysis) {
    const zoom = getViewport()?.zoom || 1;
    const pixelsPerDoc = Math.max(
      analysis.width / Math.max(1, node.width),
      analysis.height / Math.max(1, node.height),
    );
    return Math.max(
      1,
      Math.round((settings.get("width") / zoom) * pixelsPerDoc),
    );
  }

  function rebuild(anchor) {
    const node = hostOf();
    if (!node) throw new Error("MAGNETIC_LASSO_HOST_MISSING");
    draft.segment = buildMagneticSegment(draft.analysis, anchor, {
      radius: radiusFor(node, draft.analysis),
      contrast: settings.get("contrast") / 100,
      readRgba,
    });
    draft.previousTarget = null;
  }

  function toDocumentPath(path) {
    const node = hostOf();
    if (!node) return [];
    return path.map((point) => {
      const mapped = tierPointToDoc(node, draft.analysis, point);
      return [mapped.x, mapped.y];
    });
  }

  function syncView() {
    if (!draft) return;
    draft.fixedPath = toDocumentPath(draft.fixedTierPath);
    draft.livePath = toDocumentPath(draft.liveTierPath);
    draft.renderAnchors = draft.anchors.map((anchor) => ({
      automatic: anchor.automatic,
      point: toDocumentPath([anchor.point])[0],
    }));
    requestRender();
  }

  function cancel(hintKey = null) {
    if (!draft) return false;
    draft = null;
    straight = false;
    if (hintKey) setHint?.(hintKey, "error");
    requestRender();
    notify();
    return true;
  }

  function validateSource() {
    const node = hostOf();
    const bitmap = node ? getNodeBitmap(node) : null;
    if (
      !node ||
      bitmap !== draft.analysis.bitmap ||
      (bitmap?.__warpTextureVersion ?? 0) !== draft.analysis.bitmapVersion
    ) {
      cancel("editor.magneticLasso.sourceChanged");
      return null;
    }
    return node;
  }

  function localCursor(point) {
    const node = validateSource();
    return node ? docPointToTier(node, draft.analysis, point) : null;
  }

  function livePathTo(cursor, useStraight = straight) {
    const { roi, gradient, tree } = draft.segment;
    const local = {
      x: Math.max(0, Math.min(roi.width - 1, cursor.x - roi.x)),
      y: Math.max(0, Math.min(roi.height - 1, cursor.y - roi.y)),
    };
    let path;
    if (useStraight) {
      const anchor = draft.anchors[draft.anchors.length - 1].point;
      path = straightLinePath({ x: anchor[0], y: anchor[1] }, cursor);
      draft.confidence = "manual";
    } else {
      const target = findMagneticTarget(gradient, local, {
        previousTarget: draft.previousTarget,
      });
      draft.previousTarget = { x: target.x, y: target.y };
      path = traceLiveWirePath(tree, target).map(([x, y]) => [
        x + roi.x,
        y + roi.y,
      ]);
      draft.confidence = gradient.hasUsableEdge ? "edge" : "low";
    }
    return path;
  }

  function pathScreenLength(path, node) {
    if (path.length < 2) return 0;
    const first = tierPointToDoc(node, draft.analysis, path[0]);
    const last = tierPointToDoc(node, draft.analysis, path[path.length - 1]);
    return (
      Math.hypot(last.x - first.x, last.y - first.y) *
      (getViewport()?.zoom || 1)
    );
  }

  function shouldAutoAnchor(cursor, node) {
    const { roi } = draft.segment;
    const outside =
      cursor.x <= roi.x + 2 ||
      cursor.y <= roi.y + 2 ||
      cursor.x >= roi.x + roi.width - 3 ||
      cursor.y >= roi.y + roi.height - 3;
    const frequencyDistance = 160 - settings.get("frequency") * 1.2;
    return (
      outside || pathScreenLength(draft.liveTierPath, node) >= frequencyDistance
    );
  }

  function confirmLive(automatic = false) {
    if (!draft?.liveTierPath?.length || draft.liveTierPath.length < 2)
      return false;
    const segment = draft.liveTierPath.map((point) => [point[0], point[1]]);
    const endpoint = segment[segment.length - 1];
    draft.segments.push(segment);
    appendMagneticPath(draft.fixedTierPath, segment);
    draft.anchors.push({ point: endpoint, automatic });
    draft.liveTierPath = [];
    rebuild({ x: endpoint[0], y: endpoint[1] });
    return true;
  }

  function update(point, { forceStraight = straight } = {}) {
    if (!draft) return false;
    try {
      const node = validateSource();
      if (!node) return false;
      const cursor = localCursor(point);
      if (!cursor) return false;
      draft.cursor = point;
      draft.liveTierPath = livePathTo(cursor, forceStraight);
      if (!forceStraight && shouldAutoAnchor(cursor, node)) {
        confirmLive(true);
        draft.liveTierPath = livePathTo(cursor, false);
      }
      syncView();
      return true;
    } catch {
      cancel("editor.magneticLasso.readFailed");
      return false;
    }
  }

  function start(nodeId, point, mode = "replace") {
    const node = getDocument()?.nodes?.find(
      (candidate) => candidate.id === nodeId,
    );
    const bitmap = node ? getNodeBitmap(node) : null;
    if (!node || !bitmap) {
      setHint?.("editor.magneticLasso.needImage", "error");
      return false;
    }
    try {
      const analysis = prepareMagneticLassoSource(node, bitmap, getViewport());
      const anchor = docPointToTier(node, analysis, point);
      draft = {
        nodeId,
        analysis,
        mode,
        baseSelection: mode === "replace" ? null : getPixelSelection(),
        anchors: [
          {
            point: [Math.round(anchor.x), Math.round(anchor.y)],
            automatic: false,
          },
        ],
        segments: [],
        fixedTierPath: [[Math.round(anchor.x), Math.round(anchor.y)]],
        liveTierPath: [],
        fixedPath: [],
        livePath: [],
        renderAnchors: [],
        cursor: point,
        confidence: "edge",
      };
      rebuild(anchor);
      setHint?.(null);
      syncView();
      notify();
      return true;
    } catch (error) {
      draft = null;
      const key =
        error?.message === "MAGNETIC_LASSO_NONLINEAR_HOST"
          ? "editor.magneticLasso.nonlinear"
          : "editor.magneticLasso.readFailed";
      setHint?.(key, "error");
      return false;
    }
  }

  function click(nodeId, point, mode) {
    if (!draft) return start(nodeId, point, mode);
    if (draft.nodeId !== nodeId) return false;
    const startPoint = draft.renderAnchors[0]?.point;
    const zoom = getViewport()?.zoom || 1;
    if (
      draft.anchors.length >= 3 &&
      startPoint &&
      Math.hypot(point.x - startPoint[0], point.y - startPoint[1]) * zoom <=
        MAGNETIC_LASSO_SETTINGS.CLOSE_RADIUS_CSS_PX
    ) {
      update({ x: startPoint[0], y: startPoint[1] });
      return finish();
    }
    update(point);
    const confirmed = confirmLive(false);
    syncView();
    return confirmed;
  }

  function removeLastAnchor() {
    if (!draft || draft.anchors.length <= 1) return false;
    draft.anchors.pop();
    draft.segments.pop();
    draft.fixedTierPath = [];
    for (const segment of draft.segments)
      appendMagneticPath(draft.fixedTierPath, segment);
    if (draft.fixedTierPath.length === 0) {
      draft.fixedTierPath.push(draft.anchors[0].point);
    }
    const anchor = draft.anchors[draft.anchors.length - 1].point;
    rebuild({ x: anchor[0], y: anchor[1] });
    draft.liveTierPath = [];
    syncView();
    return true;
  }

  function closingPath(endpoint) {
    const start = draft.anchors[0].point;
    rebuild({ x: endpoint[0], y: endpoint[1] });
    const { roi, tree } = draft.segment;
    const inside =
      start[0] >= roi.x &&
      start[0] < roi.x + roi.width &&
      start[1] >= roi.y &&
      start[1] < roi.y + roi.height;
    if (!inside) {
      return straightLinePath(
        { x: endpoint[0], y: endpoint[1] },
        { x: start[0], y: start[1] },
      );
    }
    return traceLiveWirePath(tree, {
      x: start[0] - roi.x,
      y: start[1] - roi.y,
    }).map(([x, y]) => [x + roi.x, y + roi.y]);
  }

  function finish() {
    if (!draft) return false;
    try {
      if (draft.liveTierPath.length >= 2) confirmLive(false);
      if (draft.anchors.length < 3) return false;
      const endpoint = draft.anchors[draft.anchors.length - 1].point;
      const contourTier = draft.fixedTierPath.map((point) => [
        point[0],
        point[1],
      ]);
      appendMagneticPath(contourTier, closingPath(endpoint));
      if (
        sameMagneticPoint(contourTier[0], contourTier[contourTier.length - 1])
      )
        contourTier.pop();
      const contour = toDocumentPath(contourTier);
      if (
        contour.length < 3 ||
        magneticPolygonArea(contour) < MAGNETIC_LASSO_SETTINGS.MIN_CONTOUR_AREA
      ) {
        return false;
      }
      const previous = getPixelSelection();
      const completed = draft;
      const selection = {
        nodeId: completed.nodeId,
        contours: [contour],
        bounds: contourBounds([contour]),
      };
      try {
        combinePixelSelection(
          completed.baseSelection,
          selection,
          completed.mode,
        );
        if (getSelectionFeather() > 0)
          featherPixelSelection(getSelectionFeather());
        commitEditorAction("editor.selection.magneticLasso", () =>
          commitHistory(HISTORY_LABEL),
        );
      } catch (error) {
        setPixelSelection(previous);
        throw error;
      }
      draft = null;
      straight = false;
      requestRender();
      notify();
      return true;
    } catch {
      cancel("editor.magneticLasso.readFailed");
      return false;
    }
  }

  function setStraight(next) {
    straight = Boolean(next);
    if (draft?.cursor) update(draft.cursor, { forceStraight: straight });
  }

  function setValue(name, next) {
    settings.set(name, next);
    if (draft) {
      const anchor = draft.anchors[draft.anchors.length - 1].point;
      rebuild({ x: anchor[0], y: anchor[1] });
      if (draft.cursor) update(draft.cursor);
    }
    notify();
  }

  return {
    getDraft: () => draft,
    click,
    update,
    finish,
    cancel,
    removeLastAnchor,
    setStraight,
    getSettings: settings.snapshot,
    setWidth: (next) => setValue("width", next),
    setContrast: (next) => setValue("contrast", next),
    setFrequency: (next) => setValue("frequency", next),
  };
}
