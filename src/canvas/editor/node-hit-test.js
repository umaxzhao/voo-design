import { createMaskHitTester } from "./mask-hit-test.js";
import { NODE_KIND } from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
import * as ops from "./doc_ops.js";

/** Bind live artwork hit testing independently of document mutation controls. */
export function createNodeHitTester({ getDoc, getZoom, paintTools, getEffectiveNode, cache, maskTools }) {
  const maskedOut = createMaskHitTester({ getDoc, cache, maskTools });
  function nodeAtPoint(point, options = {}) {
    // Hit testing must use the frame painted on the stage. A saved X/Y value
    // can be far from an animated node's visible position at the playhead.
    const doc = getDoc();
    const zoom = options.zoom ?? (typeof getZoom === "function" ? getZoom() : 1);
    return ops.nodeAtPoint(doc, point, {
      zoom,
      ...options,
      reject: (node, at) => {
        if (maskedOut(node, at)) return true;
        if (node.paint === true && !paintTools.api.isPaintOpaqueAt(node, at)) {
          return true;
        }
        if (node.kind === NODE_KIND.IMAGE) {
          const eff = getEffectiveNode?.(node);
          if (eff?.effectiveLocal) {
            const local = toNodeLocal(node, at);
            const el = eff.effectiveLocal;
            if (
              local.x < el.x ||
              local.x > el.x + el.width ||
              local.y < el.y ||
              local.y > el.y + el.height
            ) {
              return true;
            }
          }
        }
        return false;
      },
    });
  }

  return nodeAtPoint;
}
