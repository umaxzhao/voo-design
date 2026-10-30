import { NODE_KIND } from "./scene_model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";
import { exportSvgNodes } from "./editor-svg-resources.js";

/** SVG insertion and replacement have their own decode and history boundary. */
export function createSvgLayerActions({
  getDoc,
  setDoc,
  cache,
  maskTools,
  selection,
  select,
  selectExactly
}) {
  async function insertSvg(svgString, point) {
    const {
      parseSvgStringToNodes
    } = await import("./editor_svg_import.js");
    const doc = getDoc();
    const {
      nodes: parsedNodes,
      bounds
    } = parseSvgStringToNodes(svgString);
    if (!parsedNodes || parsedNodes.length === 0) {
      throw new Error("No renderable shapes found in SVG");
    }
    const page = doc;
    const targetX = point ? point.x : (page.width || 800) / 2;
    const targetY = point ? point.y : (page.height || 600) / 2;
    const boundsCenterX = bounds.x + bounds.width / 2;
    const boundsCenterY = bounds.y + bounds.height / 2;
    const offsetX = targetX - boundsCenterX;
    const offsetY = targetY - boundsCenterY;
    const positionedNodes = parsedNodes.map(node => {
      if (node.kind === NODE_KIND.GROUP) {
        return {
          ...node,
          x: node.x != null ? node.x + offsetX : node.x,
          y: node.y != null ? node.y + offsetY : node.y
        };
      }
      return {
        ...node,
        x: node.x + offsetX,
        y: node.y + offsetY
      };
    });
    let nextDoc = doc;
    for (const n of positionedNodes) {
      nextDoc = ops.addNode(nextDoc, n);
    }
    commitEditorDocument("editor.layer.add", setDoc, nextDoc);
    const nonGroup = positionedNodes.filter(n => n.kind !== NODE_KIND.GROUP);
    if (selectExactly && nonGroup.length > 1) {
      selectExactly(nonGroup.map(n => n.id));
    } else if (positionedNodes.length > 0) {
      select(positionedNodes[0].id);
    }
    return positionedNodes;
  }
  async function updateNodeFromSvg(nodeId, svgString) {
    const doc = getDoc();
    const targetNode = doc.nodes.find(n => n.id === nodeId);
    if (!targetNode) return;
    const {
      parseSvgStringToNodes
    } = await import("./editor_svg_import.js");
    const {
      nodes: parsedNodes,
      bounds
    } = parseSvgStringToNodes(svgString);
    if (!parsedNodes || parsedNodes.length === 0) return;
    const offsetX = targetNode.x - bounds.x;
    const offsetY = targetNode.y - bounds.y;
    const shifted = parsedNodes.map(n => ({
      ...n,
      x: n.x != null ? n.x + offsetX : n.x,
      y: n.y != null ? n.y + offsetY : n.y
    }));
    let nextDoc;
    if (shifted.length === 1 && targetNode.kind !== NODE_KIND.GROUP) {
      const updated = {
        ...shifted[0],
        id: targetNode.id,
        parentId: targetNode.parentId
      };
      nextDoc = ops.updateNode(doc, targetNode.id, updated);
      commitEditorDocument("editor.layer.settings", setDoc, nextDoc);
      select(targetNode.id);
      return updated;
    }
    const targetIdx = doc.nodes.findIndex(n => n.id === nodeId);
    const newNodes = [...doc.nodes];
    newNodes.splice(targetIdx, 1, ...shifted);
    nextDoc = {
      ...doc,
      nodes: newNodes
    };
    commitEditorDocument("editor.layer.settings", setDoc, nextDoc);
    if (selectExactly) {
      selectExactly(shifted.map(n => n.id));
    } else {
      select(shifted[0].id);
    }
    return shifted;
  }
  function getNodeSvg(nodeId) {
    const doc = getDoc();
    const targetId = nodeId ?? selection.getId();
    if (!targetId) return "";
    const setIds = ops.moveAffectedIds(doc, [targetId]);
    const set = new Set(setIds);
    const nodes = doc.nodes.filter(n => set.has(n.id)).map(n => JSON.parse(JSON.stringify(n)));
    return exportSvgNodes(nodes, {
      cache,
      maskTools
    });
  }
  return {
    insertSvg,
    updateNodeFromSvg,
    getNodeSvg
  };
}
