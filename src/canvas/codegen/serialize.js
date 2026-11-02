/**
 * Serialisation of a VOO scene into a format-neutral render tree.
 *
 * One traversal produces a tree of descriptors plus the lossy-export warnings.
 * The HTML, React and CSS writers are then pure formatting passes over that
 * tree, which keeps the three formats structurally identical (same nesting, same
 * order, same text) and makes the mapping easy to unit test.
 *
 * Pure module: no React, no DOM. Inline SVG comes from the editor's own
 * documentToSvg so vector layers stay faithful instead of being flattened.
 */

import { NODE_KIND, isDefaultAdjustments } from "../editor/scene_model.js";
import { normalizeAutoLayout } from "../editor/scene_auto_layout.js";
import { documentToSvg } from "../editor/editor_svg.js";
import {
  safeFontFamily,
  safeImageSource,
  safeVideoSource,
} from "../editor/editor_html_elements.js";
import {
  backgroundValue,
  buildScene,
  codeNumber,
  colorValue,
  isGradientFill,
  isVisibleNode,
  measuredLayerSize,
  nodePaintBox,
  nodeRadii,
  slugify,
  suggestedBaseName,
} from "./model.js";

const TEXT_ALIGNS = new Set(["left", "center", "right", "justify"]);
const BLEND_MODES = new Set([
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);
const PLACEHOLDER_BACKGROUND = "#e5e5e5";

const WARNING_TEXT = Object.freeze({
  emptySelection: "Nothing is selected; exported the whole page instead.",
  emptyPage: "The page has no visible layers; exported an empty frame.",
  imageMissing:
    "Image layer has no resolvable bytes; exported a neutral placeholder.",
  imageCropApproximated:
    "Image crop is approximated because the source pixel size is unknown.",
  imageEffectsSkipped:
    "Image adjustments could not be baked into code; exported the raw pixels.",
  videoMissing: "Video layer has no safe source; exported a placeholder.",
  videoBestEffort:
    "Video is exported muted, looping and autoplaying; playback controls are not reproduced.",
  adjustmentSkipped:
    "Adjustment layer skipped; adjustment layers have no CSS equivalent.",
  regionSkipped: "Region layer skipped; regions are AI editing guides, not artwork.",
  canvasInstancePlaceholder:
    "Canvas instance flattened to a placeholder; nested canvases are not inlined.",
  unsupportedNode: "Unsupported layer kind exported as a placeholder.",
  effectsSkipped:
    "Some layer effects (inner shadow, bevel, satin, overlay) have no CSS equivalent and were skipped.",
  textEffectsSkipped:
    "Some text effects (highlight, baseline shift) have no CSS equivalent and were skipped.",
  maskSkipped: "Layer mask skipped; the exported layer is unmasked.",
  clipSkipped: "Layer clip was skipped; clipping paths are not reproduced.",
  blendModeUnsupported:
    "Layer blend mode has no Tailwind equivalent; exported with normal blending.",
  vectorMissing: "Vector layer produced no drawable geometry; exported a placeholder.",
});

function isEnabled(effect) {
  return Boolean(effect && effect.enabled === true);
}

/** Hex or rgb() → rgba() with an additional 0-100 opacity, always valid CSS. */
function shadowColor(color, opacityPercent) {
  const value = colorValue(color) ?? "#000000";
  const opacity = Number.isFinite(opacityPercent)
    ? Math.max(0, Math.min(100, opacityPercent)) / 100
    : 1;
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const expand = (part) =>
      part.length === 1 ? `${part}${part}` : part;
    const clean = hex.length === 3 || hex.length === 4
      ? hex.split("").map(expand).join("")
      : hex;
    const alpha = clean.length === 8
      ? Math.round((Number.parseInt(clean.slice(6, 8), 16) / 255) * 100) / 100
      : 1;
    const r = Number.parseInt(clean.slice(0, 2), 16) || 0;
    const g = Number.parseInt(clean.slice(2, 4), 16) || 0;
    const b = Number.parseInt(clean.slice(4, 6), 16) || 0;
    const finalAlpha = Math.round(alpha * opacity * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;
  }
  if (/^rgba?\(/i.test(value)) {
    return opacity === 1 ? value : value.replace(/^rgb\(/i, "rgba(").replace(/\)$/, `, ${opacity})`);
  }
  return value;
}

/** The CSS `box-shadow` list a node's drop shadow and outer glow produce. */
function effectsShadow(node) {
  const effects = node?.effects;
  if (!effects) return "";
  const shadows = [];
  if (isEnabled(effects.shadow)) {
    const shadow = effects.shadow;
    shadows.push(
      `${codeNumber(shadow.offsetX)}px ${codeNumber(shadow.offsetY)}px ${codeNumber(
        shadow.blur,
      )}px ${codeNumber(shadow.spread)}px ${shadowColor(shadow.color, shadow.opacity)}`,
    );
  }
  if (isEnabled(effects.glow)) {
    const glow = effects.glow;
    const spread = Math.max(0, Number(glow.spread) || 0);
    shadows.push(
      `0px 0px ${codeNumber(glow.blur)}px ${codeNumber(spread)}px ${shadowColor(
        glow.color,
        glow.opacity,
      )}`,
    );
  }
  return shadows.join(", ");
}

function hasUnsupportedEffects(node) {
  const effects = node?.effects;
  if (!effects) return false;
  return [
    effects.innerShadow,
    effects.innerGlow,
    effects.satin,
    effects.bevel,
    effects.fill,
    effects.gradientOverlay,
    effects.stroke,
  ].some(isEnabled);
}

/** Text shadow string from the text node's own shadow effect. */
function textShadowValue(node) {
  const shadow = node?.shadow;
  if (!shadow || shadow.enabled !== true) return "";
  return `${codeNumber(shadow.offsetX)}px ${codeNumber(shadow.offsetY)}px ${codeNumber(
    shadow.blur,
  )}px ${shadowColor(shadow.color, 100)}`;
}

function transformPlan(node) {
  const rotation = Number.isFinite(node.rotation) ? node.rotation : 0;
  const shear = Number.isFinite(node.shear) ? node.shear : 0;
  const flipH = Boolean(node.flipH);
  const flipV = Boolean(node.flipV);
  if (!rotation && !shear && !flipH && !flipV) return null;
  const transform = {};
  if (rotation) transform.rotate = rotation;
  if (shear) transform.skewX = shear;
  if (flipH) transform.scaleX = -1;
  if (flipV) transform.scaleY = -1;
  return transform;
}

function commonPlan(node) {
  const plan = {};
  if (Number.isFinite(node.opacity) && node.opacity < 1) {
    plan.opacity = Math.max(0, Math.min(1, node.opacity));
  }
  const transform = transformPlan(node);
  if (transform) plan.transform = transform;
  if (BLEND_MODES.has(node.blendMode)) plan.mixBlendMode = node.blendMode;
  const shadow = effectsShadow(node);
  if (shadow) plan.boxShadow = shadow;
  return plan;
}

function fillPlan(value) {
  if (!value) return null;
  if (isGradientFill(value)) return { type: "gradient", value: value.trim() };
  const color = colorValue(value);
  return color ? { type: "color", value: color } : null;
}

function textPlan(node) {
  const color = colorValue(node.fill) ?? "#000000";
  const plan = {
    color,
    fontFamily: safeFontFamily(node.fontFamily),
    fontSize: Number.isFinite(node.fontSize) ? node.fontSize : 16,
    fontWeight: node.fontWeight ?? "normal",
    italic: Boolean(node.italic),
    underline: Boolean(node.underline),
    align: TEXT_ALIGNS.has(node.align) ? node.align : "left",
    lineHeight: Number.isFinite(node.lineHeight) ? node.lineHeight : 1.25,
    letterSpacing: Number.isFinite(node.letterSpacing) ? node.letterSpacing : 0,
    whiteSpace: node.boxWidth > 0 ? "pre-wrap" : "pre",
    vertical: node.direction === "vertical",
  };
  const strokeColor = colorValue(node.stroke);
  if (strokeColor && node.strokeWidth > 0) {
    plan.stroke = {
      width: Math.max(0, Number(node.strokeWidth) || 0),
      color: strokeColor,
    };
  }
  const shadow = textShadowValue(node);
  if (shadow) plan.shadow = shadow;
  return plan;
}

/** Maps an auto-layout child's sizing mode onto flex behaviour. */
function flowSizing(child, direction) {
  const widthFill = child.layoutWidth === "fill";
  const heightFill = child.layoutHeight === "fill";
  const horizontal = direction !== "vertical";
  return {
    omitWidth: horizontal ? widthFill : heightFill,
    omitHeight: horizontal ? heightFill : widthFill,
    grow: horizontal ? widthFill : heightFill,
    stretch: horizontal ? heightFill : widthFill,
  };
}

/**
 * Builds the export render tree.
 *
 * @param {object} doc scene document
 * @param {object} options
 * @param {string[]|null} [options.selectedIds]
 * @param {"selection"|"page"} [options.scope]
 * @param {Map<string,string>|Record<string,string>|null} [options.imageSources]
 *   data URL or remote URL keyed by `imageId` (or node id as a fallback)
 * @param {Map<string,{width:number,height:number}>|Record<string,{width:number,height:number}>|null} [options.imageSizes]
 *   intrinsic pixel size keyed the same way, used to reproduce image crops
 */
export function buildRenderTree(
  doc,
  {
    selectedIds = null,
    scope = "selection",
    imageSources = null,
    imageSizes = null,
  } = {},
) {
  if (!doc || !Array.isArray(doc.nodes)) throw new Error("codegen-no-document");
  const scene = buildScene(doc, { selectedIds, scope });
  const warnings = [];
  const usedCssClasses = new Set(["voo-root"]);
  let nodeIndex = 0;

  function addWarning(code, node) {
    const nodeId = node?.id ?? null;
    if (
      warnings.some(
        (warning) => warning.code === code && warning.nodeId === nodeId,
      )
    ) {
      return;
    }
    warnings.push({
      code,
      nodeId,
      nodeName: node?.name ?? null,
      message: WARNING_TEXT[code] ?? code,
    });
  }

  function assignCssClass(node, suffix = null) {
    const base = slugify(node?.name || node?.kind || "layer", "layer");
    const stem = suffix ? `${base}-${suffix}` : base;
    let candidate = `voo-${stem}`;
    let index = 2;
    while (usedCssClasses.has(candidate)) {
      candidate = `voo-${stem}-${index}`;
      index += 1;
    }
    usedCssClasses.add(candidate);
    return candidate;
  }

  function lookup(sourceMap, keys) {
    if (!sourceMap) return null;
    for (const key of keys) {
      if (!key) continue;
      if (sourceMap instanceof Map) {
        if (sourceMap.has(key)) return sourceMap.get(key);
      } else if (Object.prototype.hasOwnProperty.call(sourceMap, key)) {
        return sourceMap[key];
      }
    }
    return null;
  }

  function imageSourceOf(node) {
    const fromMap = lookup(imageSources, [node.imageId, node.id]);
    return safeImageSource(fromMap ?? node.src);
  }

  function imageSizeOf(node) {
    const size = lookup(imageSizes, [node.imageId, node.id]);
    if (size && size.width > 0 && size.height > 0) return size;
    return null;
  }

  function basePlan(node, origin, { isFlowChild = false, flow = null } = {}) {
    const box = nodePaintBox(node, origin);
    const plan = {
      position: isFlowChild ? "flow" : "absolute",
      left: isFlowChild ? null : box.left,
      top: isFlowChild ? null : box.top,
      width: flow?.omitWidth ? null : box.width,
      height: flow?.omitHeight ? null : box.height,
      ...commonPlan(node),
    };
    if (isFlowChild && flow) {
      if (flow.grow) plan.grow = true;
      if (flow.stretch) plan.selfStretch = true;
    }
    return { plan, box };
  }

  /** Vector layers become one inline SVG sized to the stroked outline. */
  function vectorMarkup(node, key) {
    const padding = nodePaintBox(node, { x: 0, y: 0 }).padding;
    const size = measuredLayerSize(node);
    const width = Math.max(1, size.width + padding * 2);
    const height = Math.max(1, size.height + padding * 2);
    const svg = documentToSvg({
      width,
      height,
      backgroundColor: "transparent",
      nodes: [
        {
          ...node,
          x: padding,
          y: padding,
          rotation: 0,
          shear: 0,
          flipH: false,
          flipV: false,
          opacity: 1,
        },
      ],
    })
      .replace(/^<\?xml[^>]*\?>\s*/, "")
      .trim();
    if (!svg || !svg.includes("<svg")) return "";
    // Gradient defs restart at g0 in every single-node SVG; namespace them per
    // layer so two gradient paths on one page cannot share an id.
    return svg.replace(/\bg(\d+)\b/g, (match, id) => `g${key}-${id}`);
  }

  function placeholderDescriptor(node, cssClass, origin) {
    const { plan } = basePlan(node, origin);
    plan.background = { type: "color", value: PLACEHOLDER_BACKGROUND };
    plan.overflow = true;
    return {
      kind: "placeholder",
      tag: "div",
      plan,
      cssClass,
      attrs: [],
      text: null,
      svg: null,
      children: [],
      sourceNode: node,
    };
  }

  function imageDescriptor(node, cssClass, origin, flowOptions) {
    const box = nodePaintBox(node, origin);
    const source = imageSourceOf(node);
    if (!source) {
      addWarning("imageMissing", node);
      return placeholderDescriptor(node, cssClass, origin);
    }
    if (node.adjustments && !isDefaultAdjustments(node.adjustments)) {
      addWarning("imageEffectsSkipped", node);
    }
    if (node.maskId || node.maskSrc) addWarning("maskSkipped", node);
    if (node.clipTo) addWarning("clipSkipped", node);

    const { plan } = basePlan(node, origin, flowOptions);
    plan.radius = nodeRadii(node);
    const attrs = [
      ["src", source],
      ["alt", ""],
    ];
    const crop =
      node.crop && node.crop.width > 0 && node.crop.height > 0
        ? node.crop
        : null;
    if (!crop) {
      plan.objectFit = "cover";
      return {
        kind: "image",
        tag: "img",
        plan,
        cssClass,
        attrs,
        text: null,
        svg: null,
        children: [],
        sourceNode: node,
      };
    }

    const rawSize = imageSizeOf(node);
    if (!rawSize) addWarning("imageCropApproximated", node);
    const size = rawSize ?? {
      width: Math.max(
        box.width,
        (crop.x || 0) + (crop.width || box.width),
      ),
      height: Math.max(
        box.height,
        (crop.y || 0) + (crop.height || box.height),
      ),
    };
    const originX = Math.max(0, Math.min(size.width, crop.x || 0));
    const originY = Math.max(0, Math.min(size.height, crop.y || 0));
    const cropWidth = Math.max(
      1,
      Math.min(size.width - originX, crop.width || box.width),
    );
    const cropHeight = Math.max(
      1,
      Math.min(size.height - originY, crop.height || box.height),
    );
    plan.overflow = true;
    const innerPlan = {
      position: "absolute",
      left: `${codeNumber((-100 * originX) / cropWidth)}%`,
      top: `${codeNumber((-100 * originY) / cropHeight)}%`,
      width: `${codeNumber((100 * size.width) / cropWidth)}%`,
      height: `${codeNumber((100 * size.height) / cropHeight)}%`,
      maxWidthNone: true,
    };
    const inner = {
      kind: "image",
      tag: "img",
      plan: innerPlan,
      cssClass: assignCssClass(node, "source"),
      attrs,
      text: null,
      svg: null,
      children: [],
      sourceNode: node,
    };
    return {
      kind: "element",
      tag: "div",
      plan,
      cssClass,
      attrs: [],
      text: null,
      svg: null,
      children: [inner],
      sourceNode: node,
    };
  }

  function textDescriptor(node, cssClass, origin, flowOptions) {
    const { plan } = basePlan(node, origin, flowOptions);
    plan.text = textPlan(node);
    if (node.highlight) addWarning("textEffectsSkipped", node);
    if (Number.isFinite(node.baselineShift) && node.baselineShift !== 0) {
      addWarning("textEffectsSkipped", node);
    }
    return {
      kind: "text",
      tag: "div",
      plan,
      cssClass,
      attrs: [],
      text: String(node.text ?? ""),
      svg: null,
      children: [],
      sourceNode: node,
    };
  }

  function shapeDescriptor(node, cssClass, origin, flowOptions) {
    const { plan } = basePlan(node, origin, flowOptions);
    plan.background = fillPlan(node.fill);
    plan.radius = node.kind === NODE_KIND.ELLIPSE ? null : nodeRadii(node);
    if (node.kind === NODE_KIND.ELLIPSE) plan.radiusFull = true;
    const strokeColor = colorValue(node.stroke);
    if (strokeColor && node.strokeWidth > 0) {
      plan.border = {
        width: Math.max(0, Number(node.strokeWidth) || 0),
        color: strokeColor,
      };
    }
    if (node.clipTo) addWarning("clipSkipped", node);
    if (node.maskId || node.maskSrc) addWarning("maskSkipped", node);
    return {
      kind: "element",
      tag: "div",
      plan,
      cssClass,
      attrs: [],
      text: null,
      svg: null,
      children: [],
      sourceNode: node,
    };
  }

  function videoDescriptor(node, cssClass, origin, flowOptions) {
    const source = safeVideoSource(node.src);
    if (!source) {
      addWarning("videoMissing", node);
      return placeholderDescriptor(node, cssClass, origin);
    }
    addWarning("videoBestEffort", node);
    const { plan } = basePlan(node, origin, flowOptions);
    plan.radius = nodeRadii(node);
    plan.overflow = true;
    return {
      kind: "video",
      tag: "video",
      plan,
      cssClass,
      attrs: [
        ["src", source],
        ["autoplay", ""],
        ["muted", ""],
        ["loop", ""],
        ["playsinline", ""],
        ["preload", "auto"],
      ],
      text: null,
      svg: null,
      children: [],
      sourceNode: node,
    };
  }

  function groupDescriptor(node, cssClass, origin, { isFlowChild, flow }) {
    const { plan } = basePlan(node, origin, { isFlowChild, flow });
    // An absolutely positioned group is already a containing block; only a
    // flex-flow child needs `position: relative` for its own absolute children.
    plan.relative = Boolean(isFlowChild);
    const autoLayout = normalizeAutoLayout(node.autoLayout);
    if (autoLayout) {
      plan.display = "flex";
      plan.flexDirection =
        autoLayout.direction === "vertical" ? "column" : "row";
      plan.gap = autoLayout.gap;
      plan.padding = autoLayout.padding;
      plan.alignItems =
        autoLayout.alignItems === "center"
          ? "center"
          : autoLayout.alignItems === "end"
            ? "flex-end"
            : "flex-start";
      plan.justifyContent =
        autoLayout.justifyContent === "center"
          ? "center"
          : autoLayout.justifyContent === "end"
            ? "flex-end"
            : autoLayout.justifyContent === "space-between" ||
                autoLayout.justifyContent === "space-around" ||
                autoLayout.justifyContent === "space-evenly"
              ? autoLayout.justifyContent
              : "flex-start";
      // Wrapped frames also carry a cross-axis alignment and a second gap.
      plan.flexWrap = autoLayout.wrap ? "wrap" : null;
      plan.alignContent =
        autoLayout.wrap && autoLayout.alignContent !== "start"
          ? autoLayout.alignContent === "center"
            ? "center"
            : autoLayout.alignContent === "end"
              ? "flex-end"
              : autoLayout.alignContent
          : null;
      plan.rowGap = autoLayout.wrap ? autoLayout.crossGap : null;
      plan.minWidth = autoLayout.minWidth;
      plan.maxWidth = autoLayout.maxWidth;
      plan.minHeight = autoLayout.minHeight;
      plan.maxHeight = autoLayout.maxHeight;
    }
    const children = [];
    for (const child of scene.childrenOf.get(node.id) ?? []) {
      if (!isVisibleNode(child)) continue;
      const absolute = child.layoutPosition === "absolute";
      const childFlow = autoLayout && !absolute
        ? flowSizing(child, autoLayout.direction)
        : null;
      const descriptor = renderNode(child, node, {
        isFlowChild: Boolean(childFlow),
        flow: childFlow,
      });
      if (descriptor) children.push(descriptor);
    }
    return {
      kind: "element",
      tag: "div",
      plan,
      cssClass,
      attrs: [],
      text: null,
      svg: null,
      children,
      sourceNode: node,
    };
  }

  function renderNode(node, parent, { isFlowChild = false, flow = null } = {}) {
    if (!isVisibleNode(node)) return null;
    nodeIndex += 1;
    const cssClass = assignCssClass(node);
    const origin = parent
      ? { x: parent.x, y: parent.y }
      : { x: scene.bounds.x, y: scene.bounds.y };
    // `source-over`/`normal` are the editor's default compositing modes: they
    // have no mix-blend utility and must not be reported as lossy.
    const isDefaultBlend =
      !node.blendMode ||
      node.blendMode === "source-over" ||
      node.blendMode === "normal";
    if (!isDefaultBlend && !BLEND_MODES.has(node.blendMode)) {
      addWarning("blendModeUnsupported", node);
    }
    if (node.maskId || node.maskSrc) addWarning("maskSkipped", node);
    if (hasUnsupportedEffects(node)) addWarning("effectsSkipped", node);
    switch (node.kind) {
      case NODE_KIND.GROUP:
        return groupDescriptor(node, cssClass, origin, { isFlowChild, flow });
      case NODE_KIND.TEXT:
        return textDescriptor(node, cssClass, origin, { isFlowChild, flow });
      case NODE_KIND.RECT:
      case NODE_KIND.ELLIPSE:
        return shapeDescriptor(node, cssClass, origin, { isFlowChild, flow });
      case NODE_KIND.IMAGE:
        return imageDescriptor(node, cssClass, origin, { isFlowChild, flow });
      case NODE_KIND.VIDEO:
        return videoDescriptor(node, cssClass, origin, { isFlowChild, flow });
      case NODE_KIND.PATH:
      case NODE_KIND.BOOLEAN: {
        const svg = vectorMarkup(node, nodeIndex);
        if (!svg) {
          addWarning("vectorMissing", node);
          return placeholderDescriptor(node, cssClass, origin);
        }
        const { plan } = basePlan(node, origin, { isFlowChild, flow });
        return {
          kind: "vector",
          tag: "div",
          plan,
          cssClass,
          attrs: [],
          text: null,
          svg,
          children: [],
          sourceNode: node,
        };
      }
      case NODE_KIND.ADJUSTMENT:
        addWarning("adjustmentSkipped", node);
        return null;
      case NODE_KIND.REGION:
        addWarning("regionSkipped", node);
        return null;
      case NODE_KIND.CANVAS_INSTANCE:
        addWarning("canvasInstancePlaceholder", node);
        return placeholderDescriptor(node, cssClass, origin);
      default:
        addWarning("unsupportedNode", node);
        return placeholderDescriptor(node, cssClass, origin);
    }
  }

  if (scene.emptySelection) addWarning("emptySelection", null);
  const children = [];
  for (const node of scene.roots) {
    const descriptor = renderNode(node, null);
    if (descriptor) children.push(descriptor);
  }
  if (children.length === 0) addWarning("emptyPage", null);

  const background = backgroundValue(scene.background);
  const rootPlan = {
    position: "root",
    relative: true,
    width: scene.bounds.width,
    height: scene.bounds.height,
    overflow: true,
  };
  if (background) {
    rootPlan.background = isGradientFill(background)
      ? { type: "gradient", value: background }
      : { type: "color", value: background };
  }

  return {
    doc,
    scene,
    warnings,
    baseName: suggestedBaseName(scene, doc),
    root: {
      kind: "root",
      tag: "div",
      plan: rootPlan,
      cssClass: "voo-root",
      attrs: [],
      text: null,
      svg: null,
      children,
      sourceNode: null,
    },
  };
}
