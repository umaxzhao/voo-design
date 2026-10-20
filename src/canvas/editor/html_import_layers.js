// HTML import box and layer construction seam.

import {
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_RATIO,
  createEllipseNode,
  createRectNode,
  createTextNode,
} from "./scene_model.js";
import {
  parseLineHeight,
  parseTextDecoration,
  applyTextTransform,
  estimateTextSize,
  checkUnsupportedTextProperties,
} from "./text_fidelity.js";
import { INLINE_TAGS, px, resolveShadow } from "./html_import_style.js";

export function resolveRadius(style, box) {
  const raw = style.borderRadius;
  if (raw == null || raw === "" || raw === "0") return 0;
  const token = String(raw).trim().split(/\s+/)[0];
  if (token.endsWith("%")) {
    if (box.width === box.height && Number.parseFloat(token) === 50) {
      return "ellipse";
    }
    return Math.min(box.width, box.height) / 2;
  }
  return px(token, 0);
}

/** rotate(Ndeg) → degrees, or null. */
export function resolveRotation(style) {
  const match = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(style.transform ?? "");
  return match ? Number.parseFloat(match[1]) : null;
}

export function isBold(style) {
  const weight = style.fontWeight ?? "normal";
  return (
    weight === "bold" ||
    (Number(weight) >= 600 && Number.isFinite(Number(weight)))
  );
}

export function textOf(el) {
  return String(el.text ?? "").trim();
}

/** Whether a child participates in the fallback flow as inline. */
export function isInlineChild(el, style) {
  if (style.display === "block" || style.display === "flex") return false;
  if (style.position === "absolute" || style.position === "fixed") return false;
  return INLINE_TAGS.has(String(el.tag ?? "").toLowerCase());
}

/**
 * Computes an element's document box. Absolute positioning follows the
 * contract; anything else falls back to a block/inline stack so a model slip
 * degrades gracefully instead of collapsing to nothing.
 */
export function resolveBox(el, style, box, flow, ctx) {
  const left = px(style.left);
  const right = px(style.right);
  const top = px(style.top);
  const bottom = px(style.bottom);
  let width = px(style.width);
  let height = px(style.height);
  const absolute =
    style.position === "absolute" ||
    style.position === "fixed" ||
    left != null ||
    right != null ||
    top != null ||
    bottom != null;

  if (absolute) {
    if (width == null && left != null && right != null) {
      width = Math.max(0, box.width - left - right);
    }
    if (height == null && top != null && bottom != null) {
      height = Math.max(0, box.height - top - bottom);
    }
    if (width == null) width = contentWidth(el, style, box.width, ctx);
    if (height == null) height = contentHeight(el, style, width, ctx);
    return {
      x: box.x + (left ?? (right != null ? box.width - width - right : flow.x)),
      y:
        box.y +
        (top ?? (bottom != null ? box.height - height - bottom : flow.y)),
      width,
      height,
      absolute: true,
    };
  }

  if (width == null) width = Math.max(0, box.width);
  if (height == null) height = contentHeight(el, style, width, ctx);
  return {
    x: box.x + flow.x,
    y: box.y + flow.y,
    width,
    height,
    absolute: false,
  };
}

export function contentWidth(el, style, available, ctx) {
  const tag = String(el.tag ?? "").toLowerCase();
  if (tag === "hr") return available;
  if (tag === "img") return px(style.width, 160);
  const text = textOf(el);
  if (text) {
    return estimateTextSize(text, px(style.fontSize, DEFAULT_FONT_SIZE), 0, {
      metricsAdapter: ctx?.metricsAdapter,
    }).width;
  }
  return available;
}

export function contentHeight(el, style, width, ctx) {
  const tag = String(el.tag ?? "").toLowerCase();
  if (tag === "hr") return px(style.height, 2);
  if (tag === "img") return px(style.height, 160);
  const text = textOf(el);
  if (text) {
    return estimateTextSize(
      text,
      px(style.fontSize, DEFAULT_FONT_SIZE),
      width > 0 ? width : 0,
      {
        metricsAdapter: ctx?.metricsAdapter,
      },
    ).height;
  }
  return px(style.height, 0);
}

export function makeShapeLayer(box, fill, radius, style) {
  const border = parseBorder(style.border);
  if (radius === "ellipse") {
    const node = createEllipseNode({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      stroke: border?.color ?? "transparent",
      strokeWidth: border?.width ?? 0,
    });
    node.fill = fill ?? "transparent";
    const rotation = resolveRotation(style);
    if (rotation != null) node.rotation = rotation;
    applyDropShadow(node, style);
    return node;
  }
  const node = createRectNode({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fill: fill ?? "transparent",
    stroke: border?.color ?? "transparent",
    strokeWidth: border?.width ?? 0,
  });
  if (typeof radius === "number" && radius > 0) node.cornerRadius = radius;
  const rotation = resolveRotation(style);
  if (rotation != null) node.rotation = rotation;
  const opacity = px(style.opacity);
  if (opacity != null && opacity >= 0 && opacity <= 1) node.opacity = opacity;
  applyDropShadow(node, style);
  return node;
}

/** CSS border shorthand supported by editable rect and ellipse strokes. */
export function parseBorder(value) {
  const match = /^([\d.]+)px\s+solid\s+(.+)$/i.exec(String(value ?? "").trim());
  if (!match) return null;
  const width = Number.parseFloat(match[1]);
  return width > 0 ? { width, color: match[2].trim() } : null;
}

/** Side-only borders become narrow editable rectangles in document order. */
export function makeSideBorderLayers(box, style) {
  const sides = ["Top", "Right", "Bottom", "Left"];
  const layers = [];
  for (const side of sides) {
    const border = parseBorder(style[`border${side}`]);
    if (!border) continue;
    const { width, color } = border;
    const bounds = {
      Top: { x: box.x, y: box.y, width: box.width, height: width },
      Right: {
        x: box.x + box.width - width,
        y: box.y,
        width,
        height: box.height,
      },
      Bottom: {
        x: box.x,
        y: box.y + box.height - width,
        width: box.width,
        height: width,
      },
      Left: { x: box.x, y: box.y, width, height: box.height },
    }[side];
    layers.push(makeShapeLayer(bounds, color, 0, {}));
  }
  return layers;
}

/** Preserves a box-shadow as the layer's drop-shadow effect, when present. */
export function applyDropShadow(node, style) {
  const shadow = resolveShadow(style.boxShadow);
  if (shadow) node.effects = { shadow };
}

export function makeTextLayer(text, box, style, ctx) {
  const fontSize = px(style.fontSize, DEFAULT_FONT_SIZE);
  let resolvedText = text;
  if (style.textTransform) {
    resolvedText = applyTextTransform(resolvedText, style.textTransform);
  }
  const node = createTextNode({
    x: box.x,
    y: box.y,
    text: resolvedText,
    fill: style.color ?? "#000000",
    fontSize,
  });
  node.fontWeight = isBold(style) ? "bold" : "normal";
  if (style.fontStyle === "italic" || style.fontStyle === "oblique") {
    node.italic = true;
  }
  const dec = parseTextDecoration(style.textDecoration);
  if (dec.underline) {
    node.underline = true;
  }
  if (["left", "center", "right"].includes(style.textAlign)) {
    node.align = style.textAlign;
  }
  const lineHeight = parseLineHeight(style.lineHeight, fontSize);
  if (lineHeight !== LINE_HEIGHT_RATIO) {
    node.lineHeight = lineHeight;
  }
  const letterSpacing = px(style.letterSpacing);
  if (letterSpacing != null) node.letterSpacing = letterSpacing;
  if (typeof style.fontFamily === "string" && style.fontFamily.trim()) {
    node.fontFamily = style.fontFamily.trim();
  }
  if (style.textTransform) {
    node.textTransform = style.textTransform;
  }

  checkUnsupportedTextProperties(style, ctx);

  const estimated = estimateTextSize(resolvedText, fontSize, 0, {
    lineHeight: node.lineHeight,
    metricsAdapter: ctx?.metricsAdapter,
  });
  node.estimatedMetrics = estimated.fallback;
  node.metricsSource = estimated.source;

  const textWidth = estimated.width;
  const textHeight = estimated.height;
  const isWrapping = box.width > 0 && textWidth > box.width;

  if (isWrapping) {
    node.boxWidth = box.width;
    node.width = box.width;
    node.height = box.height > 0 ? box.height : Math.ceil(textHeight);
  } else {
    // Auto-width: the bounding box hugs the text exactly, without stretching across the canvas.
    node.boxWidth = 0;
    node.width = Math.ceil(textWidth);
    node.height = box.height > 0 ? box.height : Math.ceil(textHeight);

    if (box.width > textWidth) {
      if (style.textAlign === "center") {
        node.x = Math.round(box.x + (box.width - textWidth) / 2);
      } else if (style.textAlign === "right") {
        node.x = Math.round(box.x + box.width - textWidth);
      }
    }
  }

  const rotation = resolveRotation(style);
  if (rotation != null) node.rotation = rotation;
  const opacity = px(style.opacity);
  if (opacity != null && opacity >= 0 && opacity <= 1) node.opacity = opacity;
  const textShadow = resolveShadow(style.textShadow);
  if (textShadow) {
    node.shadow = {
      enabled: true,
      color: textShadow.color,
      blur: textShadow.blur,
      offsetX: textShadow.offsetX,
      offsetY: textShadow.offsetY,
    };
  }
  return node;
}

/**
 * Emits this element's own layers (background, text, image) in paint order,
 * then walks its children. Children's layers append after the parent's, which
 * keeps document order bottom-first exactly as the editor expects.
 */
