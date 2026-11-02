import {
  createEllipseNode,
  createPathNode,
  createRectNode,
} from "../scene_model.js";
import * as ops from "../doc_ops.js";
import { editorCommandError } from "./errors.js";
import { COMMAND_DEFINITIONS } from "./definitions.js";

/**
 * Command implementations part 3 (zone split).
 */
export const IMPLEMENTATIONS_PART3 = {
  draw_rect({ engine }, args) {
    const {
      x,
      y,
      width,
      height,
      fill = "#999999",
      stroke = "#ffffff",
      strokeWidth = 1,
      cornerRadius = 0,
    } = args;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "draw_rect requires positive width and height.",
        { args: ["width", "height"] },
      );
    }
    const node = createRectNode({
      x,
      y,
      width,
      height,
      fill,
      stroke,
      strokeWidth,
    });
    if (Number.isFinite(cornerRadius) && cornerRadius > 0) {
      node.cornerRadius = cornerRadius;
    }
    const doc = engine?.getDocument?.();
    if (doc) {
      engine.setDoc?.(ops.addNode(doc, node), { commit: false });
    }
    engine?.selectMany?.([node.id]) ?? engine?.select?.(node.id);
    engine?.requestRender?.();
    engine?.commit?.(COMMAND_DEFINITIONS.draw_rect.historyLabel);
    return { nodeId: node.id, kind: "rect", ok: true };
  },

  draw_ellipse({ engine }, args) {
    const {
      x,
      y,
      width,
      height,
      fill = "#999999",
      stroke = "#ffffff",
      strokeWidth = 1,
    } = args;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "draw_ellipse requires positive width and height.",
        { args: ["width", "height"] },
      );
    }
    const node = createEllipseNode({
      x,
      y,
      width,
      height,
      stroke,
      strokeWidth,
    });
    if (fill) node.fill = fill;
    const doc = engine?.getDocument?.();
    if (doc) {
      engine.setDoc?.(ops.addNode(doc, node), { commit: false });
    }
    engine?.selectMany?.([node.id]) ?? engine?.select?.(node.id);
    engine?.requestRender?.();
    engine?.commit?.(COMMAND_DEFINITIONS.draw_ellipse.historyLabel);
    return { nodeId: node.id, kind: "ellipse", ok: true };
  },

  draw_line({ engine }, args) {
    const { x1, y1, x2, y2, stroke = "#ffffff", strokeWidth = 2 } = args;
    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "draw_line requires finite x1, y1, x2, and y2 coordinates.",
        { args: ["x1", "y1", "x2", "y2"] },
      );
    }
    const node = createPathNode({
      points: [
        [x1, y1],
        [x2, y2],
      ],
      stroke,
      strokeWidth,
      line: true,
    });
    const doc = engine?.getDocument?.();
    if (doc) {
      engine.setDoc?.(ops.addNode(doc, node), { commit: false });
    }
    engine?.selectMany?.([node.id]) ?? engine?.select?.(node.id);
    engine?.requestRender?.();
    engine?.commit?.(COMMAND_DEFINITIONS.draw_line.historyLabel);
    return { nodeId: node.id, kind: "path", ok: true };
  },

  draw_arrow({ engine }, args) {
    const {
      x1,
      y1,
      x2,
      y2,
      stroke = "#ffffff",
      strokeWidth = 2,
      arrowSize,
      arrowStart = false,
    } = args;
    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "draw_arrow requires finite x1, y1, x2, and y2 coordinates.",
        { args: ["x1", "y1", "x2", "y2"] },
      );
    }
    const node = createPathNode({
      points: [
        [x1, y1],
        [x2, y2],
      ],
      stroke,
      strokeWidth,
      arrow: true,
      arrowSize:
        Number.isFinite(arrowSize) && arrowSize > 0 ? arrowSize : undefined,
      arrowStart: Boolean(arrowStart),
    });
    const doc = engine?.getDocument?.();
    if (doc) {
      engine.setDoc?.(ops.addNode(doc, node), { commit: false });
    }
    engine?.selectMany?.([node.id]) ?? engine?.select?.(node.id);
    engine?.requestRender?.();
    engine?.commit?.(COMMAND_DEFINITIONS.draw_arrow.historyLabel);
    return { nodeId: node.id, kind: "path", ok: true };
  },

  draw_polygon({ engine }, args) {
    const {
      points,
      cx,
      cy,
      radius,
      sides = 3,
      fill = "#999999",
      stroke = "#ffffff",
      strokeWidth = 1,
    } = args;
    let pts = [];
    if (Array.isArray(points) && points.length >= 3) {
      pts = points.map((p) => [p.x, p.y]);
    } else if (
      Number.isFinite(cx) &&
      Number.isFinite(cy) &&
      Number.isFinite(radius) &&
      radius > 0
    ) {
      const numSides = Math.max(3, Math.round(sides));
      for (let i = 0; i < numSides; i++) {
        const angle = (i * 2 * Math.PI) / numSides - Math.PI / 2;
        pts.push([
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius,
        ]);
      }
    } else {
      throw editorCommandError(
        "ARGS_INVALID",
        "draw_polygon requires either a points array (min 3) or regular polygon parameters (cx, cy, radius).",
        { args: ["points"] },
      );
    }
    const node = createPathNode({
      points: pts,
      stroke,
      strokeWidth,
      poly: true,
      closed: true,
      fill,
    });
    const doc = engine?.getDocument?.();
    if (doc) {
      engine.setDoc?.(ops.addNode(doc, node), { commit: false });
    }
    engine?.selectMany?.([node.id]) ?? engine?.select?.(node.id);
    engine?.requestRender?.();
    engine?.commit?.(COMMAND_DEFINITIONS.draw_polygon.historyLabel);
    return { nodeId: node.id, kind: "path", ok: true };
  },

  draw_star({ engine }, args) {
    const {
      cx,
      cy,
      outerRadius,
      innerRadius,
      points = 5,
      fill = "#999999",
      stroke = "#ffffff",
      strokeWidth = 1,
    } = args;
    if (
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      !Number.isFinite(outerRadius) ||
      outerRadius <= 0
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "draw_star requires finite cx, cy and positive outerRadius.",
        { args: ["cx", "cy", "outerRadius"] },
      );
    }
    const numPoints =
      Number.isFinite(points) && points >= 3 ? Math.round(points) : 5;
    const inner =
      Number.isFinite(innerRadius) && innerRadius > 0
        ? innerRadius
        : outerRadius * 0.4;
    const pts = [];
    for (let i = 0; i < numPoints * 2; i++) {
      const angle = (i * Math.PI) / numPoints - Math.PI / 2;
      const r = i % 2 === 0 ? outerRadius : inner;
      pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
    const node = createPathNode({
      points: pts,
      stroke,
      strokeWidth,
      poly: true,
      closed: true,
      fill,
    });
    const doc = engine?.getDocument?.();
    if (doc) {
      engine.setDoc?.(ops.addNode(doc, node), { commit: false });
    }
    engine?.selectMany?.([node.id]) ?? engine?.select?.(node.id);
    engine?.requestRender?.();
    engine?.commit?.(COMMAND_DEFINITIONS.draw_star.historyLabel);
    return { nodeId: node.id, kind: "path", ok: true };
  },
};
