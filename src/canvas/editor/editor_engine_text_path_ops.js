import { findNode, isLockedByGroup, NODE_KIND } from "./scene_model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import { layoutTextOnPath } from "./text_on_path.js";
import { newId } from "./scene_model_core.js";
import { fromNodeLocal } from "./scene_geometry.js";

function toDocSpaceAnchors(node) {
  const sx = node.baseWidth ? node.width / node.baseWidth : 1;
  const sy = node.baseHeight ? node.height / node.baseHeight : 1;
  const raw = node.points || node.anchors || [];
  return raw.map((pt) => {
    const p = fromNodeLocal(node, { x: pt.x * sx, y: pt.y * sy });
    const tip = (h) => {
      if (!h) return null;
      const hx = Array.isArray(h) ? h[0] : (h.x ?? 0);
      const hy = Array.isArray(h) ? h[1] : (h.y ?? 0);
      if (!hx && !hy) return null;
      const t = fromNodeLocal(node, { x: (pt.x + hx) * sx, y: (pt.y + hy) * sy });
      return [t.x - p.x, t.y - p.y];
    };
    return {
      x: p.x,
      y: p.y,
      in: tip(pt.in),
      out: tip(pt.out),
      close: Boolean(pt.close),
    };
  });
}

export function createTextPathEngineOps({
  getDoc,
  setDoc,
  selection,
  requestRender,
  notify,
}) {
  function typeOnSelectedPath() {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    const pathNode = selectedIds
      .map((id) => findNode(doc, id))
      .find((n) => n && n.kind === NODE_KIND.PATH && (n.points?.length || n.anchors?.length));
    if (!pathNode || pathNode.locked || isLockedByGroup(doc, pathNode)) return false;

    const docPoints = toDocSpaceAnchors(pathNode);

    const textPath = {
      points: docPoints,
      closed: pathNode.closed || docPoints[docPoints.length - 1]?.close || false,
      startOffset: 0,
      align: "left",
      side: "top",
      reverse: false,
      baselineOffset: 0,
    };

    const textNode = {
      id: newId(),
      kind: NODE_KIND.TEXT,
      name: "Path Text",
      text: "Type along path...",
      fontSize: 22,
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      fill: "#ffffff",
      parentId: pathNode.parentId ?? null,
      textPath,
    };

    const layout = layoutTextOnPath(null, textNode);
    textNode.x = layout?.bounds?.x ?? pathNode.x;
    textNode.y = layout?.bounds?.y ?? pathNode.y;
    textNode.width = Math.max(20, layout?.bounds?.width ?? pathNode.width);
    textNode.height = Math.max(20, layout?.bounds?.height ?? pathNode.height);

    const pathIndex = doc.nodes.indexOf(pathNode);
    const nextNodes = [...doc.nodes];
    nextNodes.splice(pathIndex + 1, 0, textNode);

    const nextDoc = { ...doc, nodes: nextNodes };
    commitEditorDocument("editor.textOnPath.create", setDoc, nextDoc);
    (selection?.selectNodes ?? selection?.setIds)?.([textNode.id]);
    requestRender?.();
    notify?.();
    return true;
  }

  function attachTextToPath() {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    if (selectedIds.length !== 2) return false;
    const nodes = selectedIds.map((id) => findNode(doc, id)).filter(Boolean);
    const textNode = nodes.find((n) => n.kind === NODE_KIND.TEXT);
    const pathNode = nodes.find((n) => n.kind === NODE_KIND.PATH && (n.points?.length || n.anchors?.length));
    if (!textNode || !pathNode) return false;
    if (textNode.locked || pathNode.locked || isLockedByGroup(doc, textNode) || isLockedByGroup(doc, pathNode)) return false;

    const docPoints = toDocSpaceAnchors(pathNode);

    const textPath = {
      points: docPoints,
      closed: pathNode.closed || docPoints[docPoints.length - 1]?.close || false,
      startOffset: 0,
      align: textNode.align || "left",
      side: "top",
      reverse: false,
      baselineOffset: 0,
    };

    const updatedText = {
      ...textNode,
      textPath,
    };
    const layout = layoutTextOnPath(null, updatedText);
    if (layout?.bounds) {
      updatedText.x = layout.bounds.x;
      updatedText.y = layout.bounds.y;
      updatedText.width = Math.max(20, layout.bounds.width);
      updatedText.height = Math.max(20, layout.bounds.height);
    }

    const nextNodes = doc.nodes.map((n) => (n.id === textNode.id ? updatedText : n));
    const nextDoc = { ...doc, nodes: nextNodes };
    commitEditorDocument("editor.textOnPath.attach", setDoc, nextDoc);
    (selection?.selectNodes ?? selection?.setIds)?.([textNode.id]);
    requestRender?.();
    notify?.();
    return true;
  }

  function detachTextFromPath() {
    const doc = getDoc();
    const selectedIds = selection?.getIds?.() ?? [];
    const textNode = selectedIds
      .map((id) => findNode(doc, id))
      .find((n) => n && n.kind === NODE_KIND.TEXT && n.textPath);
    if (!textNode || textNode.locked || isLockedByGroup(doc, textNode)) return false;

    const { textPath, ...rest } = textNode;
    const nextNodes = doc.nodes.map((n) => (n.id === textNode.id ? rest : n));
    const nextDoc = { ...doc, nodes: nextNodes };
    commitEditorDocument("editor.textOnPath.detach", setDoc, nextDoc);
    (selection?.selectNodes ?? selection?.setIds)?.([textNode.id]);
    requestRender?.();
    notify?.();
    return true;
  }

  return {
    typeOnSelectedPath,
    attachTextToPath,
    detachTextFromPath,
  };
}
