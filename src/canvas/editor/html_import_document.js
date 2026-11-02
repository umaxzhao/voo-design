// HTML import tree traversal and document assembly seam.

import {
  createDocument,
  createGroupNode,
  createImageNode,
  createRectNode,
} from "./scene_model.js";
import { cssAutoLayout } from "./html_import_autolayout.js";
import { computeContainerLayout } from "./html_layout.js";
import { importInlineSvg } from "./html_import_svg.js";
import { inheritInlineTextStyle } from "./text_fidelity.js";
import {
  GRADIENT_RE,
  SKIP_TAGS,
  parseInlineStyle,
  px,
  resolveFill,
} from "./html_import_style.js";
import {
  applyDropShadow,
  contentHeight,
  contentWidth,
  resolveBox,
  resolveRadius,
  textOf,
  isInlineChild,
  makeShapeLayer,
  makeSideBorderLayers,
  makeTextLayer,
  parseBorder,
} from "./html_import_layers.js";

export { resolveBox } from "./html_import_layers.js";

const SEMANTIC_CONTAINERS = new Set([
  "article",
  "aside",
  "footer",
  "header",
  "main",
  "nav",
  "section",
]);

function shouldPreserveContainer(el, tag, style, fill, isRoot, enabled) {
  if (!enabled || !el.children?.length) return false;
  if (cssAutoLayout(style)) return true;
  if (SEMANTIC_CONTAINERS.has(tag)) return true;
  if (el.attrs?.["data-layer-name"] || el.attrs?.["aria-label"] || el.attrs?.id)
    return true;
  if (fill) return true;
  return (
    el.children.length > 1 &&
    ["flex", "inline-flex", "grid", "inline-grid"].includes(style.display)
  );
}

function appendLayer(layers, node, parentId) {
  if (parentId) node.parentId = parentId;
  layers.push(node);
}

export function walkElement(
  el,
  box,
  flow,
  ctx,
  pendingImages,
  {
    isRoot = false,
    precomputedBox = null,
    inheritedStyle = null,
    parentId = null,
    inheritedOpacity = 1,
    layoutItem = false,
  } = {},
) {
  const { warnings } = ctx;
  const tag = String(el.tag ?? "div").toLowerCase();
  const style = { ...(inheritedStyle ?? parseInlineStyle(el.style)) };
  const ownOpacity = Math.max(0, Math.min(1, px(style.opacity, 1)));
  const opacity = inheritedOpacity * ownOpacity;
  style.opacity = opacity;
  if (ownOpacity < 1 && el.children?.length && !warnings.includes("html-opacity-flattened")) {
    // Folder groups do not composite to an offscreen surface. Preserve child
    // alpha, and report the overlap limitation rather than silently losing it.
    warnings.push("html-opacity-flattened");
  }
  const layers = [];

  if (SKIP_TAGS.has(tag)) {
    return { layers, bottom: box.y, right: box.x, absolute: false };
  }

  if (style.display === "none" || style.visibility === "hidden") {
    return { layers, bottom: box.y, right: box.x, absolute: false };
  }

  const resolved =
    precomputedBox ?? el.measuredBox ?? resolveBox(el, style, box, flow, ctx);

  // Pre-calculate container layout if display is flex or grid
  const layout = el.measuredBox
    ? null
    : computeContainerLayout(el, style, resolved, ctx, {
        contentWidth: (e, s, a) => contentWidth(e, s, a, ctx),
        contentHeight: (e, s, w) => contentHeight(e, s, w, ctx),
        parseInlineStyle,
        isSkipTag: (t) => SKIP_TAGS.has(t),
      });

  if (
    layout &&
    (style.height == null || style.height === "auto") &&
    (style.top == null || style.bottom == null)
  ) {
    if (layout.contentHeight > 0) {
      resolved.height = Math.max(resolved.height, layout.contentHeight);
    }
  }
  if (
    layout &&
    (style.width == null || style.width === "auto") &&
    (style.left == null || style.right == null)
  ) {
    if (
      layout.contentWidth > 0 &&
      (style.display === "inline-flex" || style.display === "inline-grid")
    ) {
      resolved.width = Math.max(resolved.width, layout.contentWidth);
    }
  }

  if (tag === "svg") {
    const slot = ctx.preserveHierarchy && layoutItem
      ? createGroupNode({ ...resolved, parentId }) : null;
    if (slot) { slot.name = "svg"; layers.push(slot); }
    layers.push(...importInlineSvg({ ...el, style }, resolved, slot?.id ?? parentId));
    return {
      layers,
      bottom: resolved.y + resolved.height,
      right: resolved.x + resolved.width,
      absolute: resolved.absolute,
    };
  }

  const fill = resolveFill(style, ctx, resolved);
  const radius = resolveRadius(style, resolved);
  const ownText = textOf(el);

  const groupThis = (ctx.preserveHierarchy && layoutItem && tag !== "img") || shouldPreserveContainer(
    el,
    tag,
    style,
    fill,
    isRoot,
    ctx.preserveHierarchy,
  );
  const group = groupThis
    ? createGroupNode({
        x: resolved.x,
        y: resolved.y,
        width: resolved.width,
        height: resolved.height,
        parentId,
        autoLayout: cssAutoLayout(style),
      })
    : null;
  if (group) {
    group.name =
      el.attrs?.["data-layer-name"] ??
      el.attrs?.["aria-label"] ??
      el.attrs?.id ??
      tag;
    layers.push(group);
  }
  const layerParentId = group?.id ?? parentId;

  if (tag === "img") {
    const src = el.attrs?.src ?? "";
    if (!src) {
      warnings.push("img-without-src");
      if (fill)
        appendLayer(
          layers,
          makeShapeLayer(resolved, fill, radius, style),
          layerParentId,
        );
    } else {
      const node = createImageNode({
        x: resolved.x,
        y: resolved.y,
        width: resolved.width,
        height: resolved.height,
        imageId: null,
        src,
      });
      node.cornerRadius = radius === "ellipse"
        ? Math.min(resolved.width, resolved.height) / 2 : radius;
      const opacity = px(style.opacity);
      if (opacity != null) node.opacity = Math.max(0, Math.min(1, opacity));
      applyDropShadow(node, style);
      appendLayer(layers, node, layerParentId);
      pendingImages.push({ nodeId: node.id, src });
    }
    return {
      layers,
      bottom: resolved.y + resolved.height,
      right: resolved.x + resolved.width,
      absolute: resolved.absolute,
    };
  }

  if (tag === "hr") {
    appendLayer(
      layers,
      makeShapeLayer(
        { ...resolved, height: Math.max(1, resolved.height) },
        fill ?? "#555555",
        radius,
        style,
      ),
      layerParentId,
    );
    return {
      layers,
      bottom: resolved.y + resolved.height,
      right: resolved.x + resolved.width,
      absolute: resolved.absolute,
    };
  }

  const hasElementChildren =
    Array.isArray(el.children) && el.children.length > 0;

  // The root's background is handled by htmlTreeToDocument: a solid colour
  // becomes the document's page colour, a gradient becomes the full-canvas
  // backdrop rect — never a layer here.
  if ((fill || parseBorder(style.border)) && !isRoot) {
    appendLayer(
      layers,
      makeShapeLayer(resolved, fill, radius, style),
      layerParentId,
    );
    if (group?.autoLayout) layers.at(-1).layoutPosition = "absolute";
  }
  if (!isRoot)
    makeSideBorderLayers(resolved, style).forEach((node) =>
      appendLayer(layers, Object.assign(node, { layoutPosition: "absolute", opacity }), layerParentId),
    );

  if (ownText) {
    // Leaf text (paragraphs, headings) or a container's own direct text
    // (button labels, badges, headings wrapping a styled run).
    const buttonText = tag === "button" && !hasElementChildren;
    const textStyle =
      buttonText && !style.textAlign
        ? { ...style, textAlign: "center" }
        : style;
    const textBox =
      el.measuredTextBox ??
      (buttonText
        ? {
            ...resolved,
            y:
              resolved.y +
              Math.max(
                0,
                (resolved.height -
                  (px(style.lineHeight) ?? px(style.fontSize, 16) * 1.2)) /
                  2,
              ),
            height: px(style.lineHeight) ?? px(style.fontSize, 16) * 1.2,
          }
        : resolved);
    appendLayer(
      layers,
      makeTextLayer(ownText, textBox, textStyle, { ...ctx, measuredText: !!el.measuredTextBox }),
      layerParentId,
    );
  }

  let bottom = resolved.y + resolved.height;
  let right = resolved.x + resolved.width;
  if (hasElementChildren) {
    const paddingLeft = px(style.paddingLeft) ?? 0;
    const paddingTop = px(style.paddingTop) ?? 0;
    const childFlow = { x: paddingLeft, y: paddingTop };
    for (const child of el.children) {
      const rawChildStyle = parseInlineStyle(child.style);
      const isAbs =
        rawChildStyle.position === "absolute" ||
        rawChildStyle.position === "fixed";
      const childPrecomputed =
        child.measuredBox ??
        (layout && !isAbs ? layout.childBoxes.get(child) : null);
      const inline = isInlineChild(child, rawChildStyle);
      // CSS text properties inherit even when a child is absolutely positioned.
      const childStyle = inheritInlineTextStyle(
        style,
        rawChildStyle,
        child.tag,
      );
      const out = walkElement(
        child,
        {
          x: resolved.x,
          y: resolved.y,
          width: resolved.width,
          height: resolved.height,
        },
        childFlow,
        ctx,
        pendingImages,
        {
          precomputedBox: childPrecomputed,
          inheritedStyle: childStyle,
          parentId: layerParentId,
          inheritedOpacity: opacity,
          layoutItem: !!cssAutoLayout(style) && !isAbs,
        },
      );
      if (isAbs) {
        for (const node of out.layers) {
          if (node.parentId === layerParentId) node.layoutPosition = "absolute";
        }
      }
      layers.push(...out.layers);
      if (out.absolute) continue;
      if (layout) {
        bottom = Math.max(bottom, out.bottom);
        right = Math.max(right, out.right);
      } else {
        if (inline) childFlow.x = out.right - resolved.x;
        else childFlow.y = out.bottom - resolved.y;
        bottom = Math.max(bottom, out.bottom);
        right = Math.max(right, out.right);
      }
    }
  }

  return { layers, bottom, right, absolute: resolved.absolute };
}

/**
 * Converts a plain element tree into an editor document.
 *
 * @param {Array|object} elements - root element(s); the first is the page
 * @param {object} [options]
 * @param {number} [options.width] - canvas width (media preset default)
 * @param {number} [options.height] - canvas height
 * @param {string} [options.background] - page backdrop override
 * @param {boolean} [options.preserveHierarchy] - retain editable container groups
 * @returns {{doc: object, warnings: string[], pendingImages: Array<{nodeId, src}>}}
 */
export function htmlTreeToDocument(
  elements,
  { width, height, background, metricsAdapter, preserveHierarchy = true } = {},
) {
  const roots = Array.isArray(elements) ? elements : [elements];
  const W = width ?? 1080;
  const H = height ?? 1440;
  const warnings = [];
  const ctx = { warnings, metricsAdapter, preserveHierarchy };
  const pendingImages = [];

  const rootStyle = parseInlineStyle(roots[0]?.style ?? {});
  const rootFill = background ?? resolveFill(rootStyle, ctx, { width: W, height: H });
  const rootGradient = rootFill && GRADIENT_RE.test(rootFill) ? rootFill : null;
  const doc = createDocument(
    W,
    H,
    rootGradient
      ? (rootGradient.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? "#ffffff")
      : (rootFill ?? "#ffffff"),
  );

  const layers = [];
  let flowY = 0;
  for (const root of roots) {
    const out = walkElement(
      root,
      { x: 0, y: flowY, width: W, height: H - flowY },
      { x: 0, y: flowY },
      ctx,
      pendingImages,
      { isRoot: true },
    );
    layers.push(...out.layers);
    flowY = out.bottom;
  }

  // A gradient page backdrop paints as a full-canvas rect (the document's
  // background colour cannot hold a gradient), sitting under everything.
  if (rootGradient) {
    const backdrop = createRectNode({
      x: 0,
      y: 0,
      width: W,
      height: H,
      fill: rootGradient,
      stroke: "transparent",
      strokeWidth: 0,
    });
    layers.unshift(backdrop);
  }

  doc.nodes = layers;
  return { doc, warnings, pendingImages };
}

/**
 * Void/self-closing elements in HTML that don't need a closing tag.
 */
