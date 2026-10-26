/**
 * Shape and vector node creation helpers for the drawing API:
 * rect, ellipse, text, pen (vector path from SVG or anchors), copy structure,
 * and path-to-shape conversion.
 *
 * Extracted from editor_drawing_api.js to keep both modules under 400 lines.
 */
import {
  createEllipseNode,
  createGroupNode,
  createPenNode,
  createRectNode,
  createTextNode,
  penAnchorsBounds,
} from "./scene_model.js";
import { parseSvgPath } from "./editor_svg.js";
import { DEFAULT_PEN_STROKE_WIDTH } from "./editor_constants.js";
import { getTextToolDefaults } from "./text_tool_defaults.js";
import * as ops from "./doc_ops.js";

export function createDrawingShapesApi({
  getDoc,
  setDoc,
  selectMany,
  getColor,
}) {
  /**
   * A new node drawn from `point` joins the frame the drag starts inside.
   * Figma/Pen behaviour: drawing within a frame adds a child; drawing outside
   * stays at the document root. The frame itself is excluded so a new frame
   * never parents to the frame being replaced.
   */
  function insideFrame(node, point, enabled) {
    if (!enabled) return node;
    const frame = ops.frameAtPoint(getDoc(), point);
    return frame ? { ...node, parentId: frame.id } : node;
  }
  /** Creates a zero-size rect at `point`; the drag shapes it. Fill-only by convention. */
  function addRectAt(point, options = {}) {
    const node = insideFrame(
      {
        ...createRectNode({
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          fill: options.fill ?? getColor?.() ?? "#999999",
          stroke: options.stroke ?? "#ffffff",
          strokeWidth: 0,
        }),
        ...(options.stroke ? { stroke: options.stroke } : {}),
        strokeWidth: Number(options.strokeWidth) || 0,
        ...(options.strokeDash ? { strokeDash: options.strokeDash } : {}),
        ...(options.opacity != null ? { opacity: options.opacity } : {}),
      },
      point,
      options.intoFrame,
    );
    setDoc(ops.addNode(getDoc(), node), { commit: false });
    return node;
  }

  /** Creates a zero-size frame at `point`; the frame tool drag shapes it. */
  function addFrameAt(point, options = {}) {
    // A frame reads as a surface, not a transparent group: give it the page's
    // own backdrop as an explicit fill so the Fill section shows the colour the
    // user already sees. Transparent pages fall back to white.
    const pageBackground = getDoc()?.backgroundColor;
    const frameFill =
      options.fill ??
      (pageBackground && pageBackground !== "transparent"
        ? pageBackground
        : "#FFFFFF");
    const node = insideFrame(
      {
        ...createGroupNode({ x: point.x, y: point.y, width: 0, height: 0 }),
        frame: true,
        isFrame: true,
        name: "Frame",
        fill: frameFill,
        fillOpacity: 1,
      },
      point,
      options.intoFrame,
    );
    setDoc(ops.addNode(getDoc(), node), { commit: false });
    return node;
  }

  /** Creates a zero-size ellipse at `point`; the drag shapes it. Fill-only by convention. */
  function addEllipseAt(point, options = {}) {
    const node = insideFrame(
      {
        ...createEllipseNode({
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          fill: options.fill ?? getColor?.() ?? "#999999",
          stroke: options.stroke ?? "#ffffff",
          strokeWidth: 0,
        }),
        ...(options.stroke ? { stroke: options.stroke } : {}),
        strokeWidth: Number(options.strokeWidth) || 0,
        ...(options.strokeDash ? { strokeDash: options.strokeDash } : {}),
        ...(options.opacity != null ? { opacity: options.opacity } : {}),
      },
      point,
      options.intoFrame,
    );
    setDoc(ops.addNode(getDoc(), node), { commit: false });
    return node;
  }

  /** Creates an empty text node at `point`; the drag (optionally) boxes it. */
  function addTextAt(point, text, options = {}) {
    // Interactive creation inherits the text tool's pending style; agent calls
    // keep the factory defaults unless they opt in explicitly.
    const toolStyle = options.useToolDefaults ? getTextToolDefaults() : null;
    const node = insideFrame(
      {
        ...createTextNode({
          x: point.x,
          y: point.y,
          text,
          fill: options.fill ?? "#ffffff",
        }),
        ...(toolStyle ?? {}),
        ...(options.opacity != null ? { opacity: options.opacity } : {}),
      },
      point,
      options.intoFrame,
    );
    setDoc(ops.addNode(getDoc(), node), { commit: false });
    return node;
  }

  /**
   * Adds a pen (bezier vector) node from an SVG path string or explicit
   * anchors. The agent channel (draw_vector → add_pen_node) lands an AI
   * generated path into the document as a manipulable vector object.
   */
  function addPenNode({ svgD, anchors, x, y, stroke, strokeWidth, fill } = {}) {
    const hasAnchors = Array.isArray(anchors) && anchors.length > 0;
    const hasPath = typeof svgD === "string" && svgD.trim().length > 0;
    if (!hasAnchors && !hasPath) {
      const err = new Error(
        "addPenNode needs an SVG path (svgD) or an anchors array.",
      );
      err.code = "ARGS_INVALID";
      throw err;
    }
    const source = hasAnchors ? anchors : parseSvgPath(svgD);
    if (!Array.isArray(source) || source.length < 2) {
      const err = new Error(
        "addPenNode produced fewer than 2 anchors — cannot draw a path.",
      );
      err.code = "ARGS_INVALID";
      throw err;
    }
    let pts = source.map((point) => {
      const handle = (candidate) => {
        if (Array.isArray(candidate) && candidate.length === 2)
          return [candidate[0], candidate[1]];
        if (
          candidate &&
          typeof candidate === "object" &&
          Number.isFinite(candidate.x) &&
          Number.isFinite(candidate.y)
        ) {
          return [candidate.x, candidate.y];
        }
        return null;
      };
      return {
        ...point,
        in: handle(point.in),
        out: handle(point.out),
      };
    });
    if (Number.isFinite(x) || Number.isFinite(y)) {
      const bounds = penAnchorsBounds(pts, 1);
      const dx = Number.isFinite(x) ? x - bounds.x : 0;
      const dy = Number.isFinite(y) ? y - bounds.y : 0;
      if (dx !== 0 || dy !== 0) {
        pts = pts.map((point) => ({
          ...point,
          x: point.x + dx,
          y: point.y + dy,
        }));
      }
    }
    const width =
      Number.isFinite(Number(strokeWidth)) && Number(strokeWidth) > 0
        ? Number(strokeWidth)
        : DEFAULT_PEN_STROKE_WIDTH;
    const node = createPenNode(pts, stroke ?? "#ffffff", width);
    if (typeof fill === "string" && fill) node.fill = fill;
    setDoc(ops.addNode(getDoc(), node), { commit: false });
    selectMany([node.id]);
    return { nodeId: node.id, kind: node.kind };
  }

  /**
   * Lands a copy structure (a hierarchy of text blocks) as stacked text nodes.
   */
  function applyCopyStructure({ structure, x, y, gap } = {}) {
    const blocks = Array.isArray(structure) ? structure : structure?.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      const err = new Error(
        "applyCopyStructure needs a structure with a blocks array of text copy.",
      );
      err.code = "ARGS_INVALID";
      throw err;
    }
    const startX = Number.isFinite(x) ? x : 40;
    const startY = Number.isFinite(y) ? y : 40;
    const rowGap = Number.isFinite(gap) ? gap : 24;
    let cursorY = startY;
    const created = [];
    for (const block of blocks) {
      const text = block?.text ?? block?.content ?? "";
      if (typeof text !== "string" || !text.trim()) continue;
      const fontSize =
        Number.isFinite(Number(block.fontSize)) && Number(block.fontSize) > 0
          ? Number(block.fontSize)
          : 16;
      const node = createTextNode({
        x: startX,
        y: cursorY,
        text,
        fill: block.fill ?? "#ffffff",
        fontSize,
      });
      node.fontWeight = block.weight ?? "normal";
      if (["left", "center", "right"].includes(block.align))
        node.align = block.align;
      if (Number.isFinite(Number(block.letterSpacing)))
        node.letterSpacing = Number(block.letterSpacing);
      if (
        Number.isFinite(Number(block.lineHeight)) &&
        Number(block.lineHeight) > 0
      ) {
        node.lineHeight = Number(block.lineHeight);
      }
      if (typeof block.fontFamily === "string" && block.fontFamily.trim()) {
        node.fontFamily = block.fontFamily.trim();
      }
      const boxWidth = Number(block.boxWidth ?? block.width);
      if (Number.isFinite(boxWidth) && boxWidth > 0) {
        node.boxWidth = boxWidth;
        node.width = boxWidth;
      }
      const lineHeight = node.lineHeight ?? 1.2;
      created.push(node);
      cursorY += Math.max(Math.ceil(fontSize * lineHeight), 12) + rowGap;
    }
    if (created.length === 0) {
      const err = new Error(
        "applyCopyStructure produced no text nodes from the structure.",
      );
      err.code = "ARGS_INVALID";
      throw err;
    }
    let next = getDoc();
    for (const node of created) next = ops.addNode(next, node);
    setDoc(next, { commit: false });
    selectMany([created[0].id]);
    return {
      nodes: created.map((node) => node.id),
      objectCount: created.length,
    };
  }

  return {
    addRectAt,
    addFrameAt,
    addEllipseAt,
    addTextAt,
    addPenNode,
    applyCopyStructure,
  };
}

