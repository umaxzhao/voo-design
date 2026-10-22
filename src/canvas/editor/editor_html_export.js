// HTML/CSS handoff for editable design layers. Complex vector layers use SVG fallbacks.

import { applyInstanceOverrides } from "./instance-overrides.js";
import { withInstanceCamera, withInstanceView } from "./instance-view.js";
import { NODE_KIND, effectivePage } from "./scene_model.js";
import { resolveCornerRadii } from "./scene_model_core.js";
import { documentToSvg } from "./editor_svg.js";
import { estimateTextSize } from "./text_fidelity.js";
import {
  escapeHtml,
  cssNumber,
  safeCssValue,
  safeFontFamily,
  safeImageSource,
  safeVideoSource,
} from "./editor_html_elements.js";
export { safeImageSource, safeVideoSource } from "./editor_html_elements.js";

function selectedNodes(doc, selectedIds) {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0)
    return doc.nodes ?? [];
  const selected = new Set(selectedIds);
  // The editor selects a group's painted members, not its folder node.
  // Recover a folder when every direct member is selected so handoff keeps
  // the original design structure.
  for (const node of [...(doc.nodes ?? [])].reverse()) {
    if (node.kind !== NODE_KIND.GROUP) continue;
    const members = doc.nodes.filter(
      (candidate) => candidate.parentId === node.id,
    );
    if (
      members.length > 0 &&
      members.every((member) => selected.has(member.id))
    )
      selected.add(node.id);
  }
  const byId = new Map((doc.nodes ?? []).map((node) => [node.id, node]));
  return (doc.nodes ?? []).filter((node) => {
    let current = node;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      if (selected.has(current.id)) return true;
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
    return false;
  });
}

function layerSize(node) {
  if (node.kind !== NODE_KIND.TEXT || (node.width > 0 && node.height > 0))
    return { width: node.width, height: node.height };
  const measured = estimateTextSize(node.text, node.fontSize, node.boxWidth, {
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
  });
  return {
    width: node.width > 0 ? node.width : node.boxWidth || measured.width,
    height: node.height > 0 ? node.height : measured.height,
  };
}

function exportBounds(doc, nodes, selectedIds) {
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    const page = effectivePage(doc);
    return { x: page.x, y: page.y, width: page.width, height: page.height };
  }
  if (
    nodes.some(
      (node) =>
        node.kind === NODE_KIND.CANVAS_INSTANCE &&
        node.instance?.layoutMode === "fill",
    )
  ) {
    const page = effectivePage(doc);
    return { x: page.x, y: page.y, width: page.width, height: page.height };
  }
  const drawable = nodes.filter(
    (node) => node.kind !== NODE_KIND.GROUP && node.visible !== false,
  );
  if (drawable.length === 0) throw new Error("html-export-empty");
  const left = Math.min(...drawable.map((node) => node.x));
  const top = Math.min(...drawable.map((node) => node.y));
  const right = Math.max(
    ...drawable.map((node) => node.x + layerSize(node).width),
  );
  const bottom = Math.max(
    ...drawable.map((node) => node.y + layerSize(node).height),
  );
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function cssBorderRadiusRule(cornerRadius, width, height) {
  if (!cornerRadius) return null;
  const radii = resolveCornerRadii(cornerRadius, width, height);
  if (radii.isUniform) {
    return radii.uniformRadius > 0
      ? `border-radius:${cssNumber(radii.uniformRadius)}px`
      : null;
  }
  return `border-radius:${cssNumber(radii.tl)}px ${cssNumber(radii.tr)}px ${cssNumber(radii.br)}px ${cssNumber(radii.bl)}px`;
}

function strokePadding(node) {
  if (
    (node.kind === NODE_KIND.PATH || node.kind === NODE_KIND.BOOLEAN) &&
    node.strokeWidth > 0 &&
    node.stroke &&
    node.stroke !== "transparent"
  ) {
    return Math.ceil(Number(node.strokeWidth) || 0);
  }
  return 0;
}

function nodeCss(node, parent, bounds, { maskSourceOf = null } = {}) {
  const pad = strokePadding(node);
  const x = cssNumber(node.x - pad - (parent?.x ?? bounds.x));
  const y = cssNumber(node.y - pad - (parent?.y ?? bounds.y));
  const size = layerSize(node);
  const width = Math.max(0, cssNumber(size.width + pad * 2));
  const height = Math.max(0, cssNumber(size.height + pad * 2));
  const rules = [
    "position:absolute",
    `left:${x}px`,
    `top:${y}px`,
    `width:${width}px`,
    `height:${height}px`,
    "box-sizing:border-box",
  ];
  if (Number.isFinite(node.opacity) && node.opacity < 1)
    rules.push(`opacity:${Math.max(0, cssNumber(node.opacity))}`);
  const hasRot = Number.isFinite(node.rotation) && node.rotation !== 0;
  const hasShear = Number.isFinite(node.shear) && node.shear !== 0;
  const isImage = node?.kind === NODE_KIND.IMAGE;
  const flipH = !isImage && Boolean(node.flipH);
  const flipV = !isImage && Boolean(node.flipV);
  if (hasRot || hasShear || flipH || flipV) {
    const transforms = [];
    if (hasRot) transforms.push(`rotate(${cssNumber(node.rotation)}deg)`);
    if (hasShear) transforms.push(`skewX(${cssNumber(node.shear)}deg)`);
    if (flipH || flipV)
      transforms.push(`scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`);
    rules.push(`transform:${transforms.join(" ")}`);
  }
  const maskUrl = maskSourceOf?.(node) ?? node.maskSrc;
  if (maskUrl && !maskUrl.startsWith("#")) {
    const formattedUrl = maskUrl.startsWith("url(")
      ? maskUrl
      : `url(${maskUrl})`;
    rules.push(
      `-webkit-mask-image:${formattedUrl}`,
      `mask-image:${formattedUrl}`,
      "-webkit-mask-size:100% 100%",
      "mask-size:100% 100%",
      "-webkit-mask-repeat:no-repeat",
      "mask-repeat:no-repeat",
    );
  }
  if (node.kind === NODE_KIND.RECT || node.kind === NODE_KIND.ELLIPSE) {
    rules.push(`background:${safeCssValue(node.fill)}`);
    if (node.kind === NODE_KIND.ELLIPSE) {
      rules.push("border-radius:50%");
    } else {
      const radiusRule = cssBorderRadiusRule(
        node.cornerRadius,
        node.width,
        node.height,
      );
      if (radiusRule) rules.push(radiusRule);
    }
    if (node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent")
      rules.push(
        `border:${Math.max(0, cssNumber(node.strokeWidth))}px solid ${safeCssValue(node.stroke)}`,
      );
  }
  if (node.kind === NODE_KIND.TEXT) {
    rules.push(
      `color:${safeCssValue(node.fill, "#000000")}`,
      `font-family:${safeFontFamily(node.fontFamily)}`,
      `font-size:${Math.max(1, cssNumber(node.fontSize, 16))}px`,
      `font-weight:${safeCssValue(String(node.fontWeight ?? "normal"), "normal")}`,
      `text-align:${["left", "center", "right", "justify"].includes(node.align) ? node.align : "left"}`,
      // Auto-sized text must stay unwrapped when browser font metrics differ.
      node.boxWidth > 0 ? "white-space:pre-wrap" : "white-space:pre",
    );
    if (Number.isFinite(node.lineHeight))
      rules.push(`line-height:${Math.max(0, cssNumber(node.lineHeight))}`);
    if (Number.isFinite(node.letterSpacing))
      rules.push(`letter-spacing:${cssNumber(node.letterSpacing)}px`);
  }
  if (node.kind === NODE_KIND.IMAGE || node.kind === NODE_KIND.VIDEO) {
    rules.push("object-fit:cover");
    if (node.kind === NODE_KIND.IMAGE) {
      const radiusRule = cssBorderRadiusRule(
        node.cornerRadius,
        node.width,
        node.height,
      );
      if (radiusRule) rules.push(radiusRule);
    }
  }
  if (node.kind === NODE_KIND.CANVAS_INSTANCE) rules.push("overflow:hidden");
  return rules.join(";");
}

export function fallbackSvg(node) {
  const pad = strokePadding(node);
  const w = Math.max(1, node.width + pad * 2);
  const h = Math.max(1, node.height + pad * 2);
  const svg = documentToSvg({
    width: w,
    height: h,
    backgroundColor: "transparent",
    nodes: [{ ...node, x: pad, y: pad, rotation: 0 }],
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Produces an HTML/CSS snippet; nested source canvases share document semantics. */
export function documentToHtml(
  doc,
  {
    selectedIds = null,
    imageSourceOf = (node) => node.src,
    imageSizeOf = () => null,
    videoSourceOf = (node) => node.src,
    maskSourceOf = () => null,
    resolveCanvas = null,
    scope = "root",
    activeDocs = new WeakSet(),
    activeSources = new Set(),
  } = {},
) {
  if (!doc || !Array.isArray(doc.nodes))
    throw new Error("html-export-no-document");
  if (activeDocs.has(doc)) throw new Error("html-export-canvas-cycle");
  activeDocs.add(doc);
  const safeScope = String(scope).replace(/[^a-z\d-]/gi, "");
  const nodes = selectedNodes(doc, selectedIds).filter(
    (node) => node.visible !== false,
  );
  const included = new Set(nodes.map((node) => node.id));
  const bounds = exportBounds(doc, nodes, selectedIds);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map();
  for (const node of nodes) {
    const fullscreen =
      node.kind === NODE_KIND.CANVAS_INSTANCE &&
      node.instance?.layoutMode === "fill";
    const parentId =
      !fullscreen && included.has(node.parentId) ? node.parentId : null;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(node);
  }
  const pageBackground = selectedIds?.length
    ? "transparent"
    : safeCssValue(doc.backgroundColor, "transparent");
  const css = [
    `.voo-design-${safeScope}{position:relative;overflow:hidden;width:${cssNumber(bounds.width)}px;height:${cssNumber(bounds.height)}px;background:${pageBackground}}`,
  ];
  let index = 0;
  function render(node, parent = null) {
    if (
      node.kind === NODE_KIND.REGION ||
      node.kind === NODE_KIND.ADJUSTMENT
    )
      return "";
    const className = `voo-${safeScope}-layer-${index++}`;
    const fullscreen =
      node.kind === NODE_KIND.CANVAS_INSTANCE &&
      node.instance?.layoutMode === "fill";
    const boxNode = fullscreen
      ? {
          ...node,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          rotation: 0,
        }
      : node;
    css.push(
      `.${className}{${nodeCss(boxNode, fullscreen ? null : parent, bounds, { maskSourceOf })}}`,
    );
    const layerName = node.name
      ? ` data-layer-name="${escapeHtml(node.name)}"`
      : "";
    if (node.kind === NODE_KIND.GROUP) {
      const content = (children.get(node.id) ?? [])
        .map((child) => render(child, node))
        .join("\n");
      return `<div class="${className}"${layerName}>${content}</div>`;
    }
    if (node.kind === NODE_KIND.TEXT)
      return `<div class="${className}"${layerName}>${escapeHtml(node.text ?? "")}</div>`;
    if (node.kind === NODE_KIND.RECT || node.kind === NODE_KIND.ELLIPSE)
      return `<div class="${className}"${layerName}></div>`;
    if (node.kind === NODE_KIND.VIDEO) {
      // Canvas video layers loop silently and autoplay: browsers only allow
      // autoplay when muted, and the artwork carries no transport controls.
      const videoSource = safeVideoSource(videoSourceOf(node));
      if (!videoSource) throw new Error("html-export-video-source");
      return `<video class="${className}"${layerName} src="${escapeHtml(videoSource)}" autoplay muted loop playsinline preload="auto"></video>`;
    }
    if (node.kind === NODE_KIND.CANVAS_INSTANCE) {
      const instance = node.instance ?? {};
      if (typeof resolveCanvas !== "function")
        throw new Error("html-export-canvas-resolver");
      const sourceId = node.sourceCanvasId;
      if (activeSources.has(sourceId))
        throw new Error("html-export-canvas-cycle");
      const source = withInstanceCamera(
        withInstanceView(
          applyInstanceOverrides(resolveCanvas(sourceId), instance),
          instance,
        ),
        instance,
      );
      if (!source || !Array.isArray(source.nodes))
        throw new Error("html-export-missing-canvas");
      activeSources.add(sourceId);
      let nested;
      try {
        nested = documentToHtml(source, {
          imageSourceOf,
          imageSizeOf,
          videoSourceOf,
          maskSourceOf,
          resolveCanvas,
          scope: `${safeScope}-${index}`,
          activeDocs,
          activeSources,
        });
      } finally {
        activeSources.delete(sourceId);
      }
      const sourcePage = effectivePage(source);
      const scaleX = boxNode.width / sourcePage.width;
      const scaleY = boxNode.height / sourcePage.height;
      const fixed = instance.layoutMode === "fixed";
      const scale = fixed ? Math.min(scaleX, scaleY) : null;
      const offsetX = fixed
        ? (boxNode.width - sourcePage.width * scale) / 2
        : 0;
      const offsetY = fixed
        ? (boxNode.height - sourcePage.height * scale) / 2
        : 0;
      return `<div class="${className}"${layerName} data-source-canvas-id="${escapeHtml(sourceId)}"><div style="position:absolute;left:${cssNumber(offsetX)}px;top:${cssNumber(offsetY)}px;transform-origin:top left;transform:scale(${cssNumber(scale ?? scaleX)},${cssNumber(scale ?? scaleY)})">${nested}</div></div>`;
    }
    const source =
      node.kind === NODE_KIND.IMAGE
        ? safeImageSource(imageSourceOf(node))
        : fallbackSvg(node);
    if (!source) throw new Error("html-export-image-source");
    if (node.kind === NODE_KIND.IMAGE && node.crop) {
      const rawSize = imageSizeOf(node);
      const size =
        rawSize?.width > 0 && rawSize?.height > 0
          ? rawSize
          : {
              width: Math.max(
                node.width,
                (node.crop.x || 0) + (node.crop.width || node.width),
              ),
              height: Math.max(
                node.height,
                (node.crop.y || 0) + (node.crop.height || node.height),
              ),
            };
      const crop = {
        x: Math.max(0, Math.min(size.width, node.crop.x || 0)),
        y: Math.max(0, Math.min(size.height, node.crop.y || 0)),
        width: 0,
        height: 0,
      };
      crop.width = Math.max(
        1,
        Math.min(size.width - crop.x, node.crop.width || node.width),
      );
      crop.height = Math.max(
        1,
        Math.min(size.height - crop.y, node.crop.height || node.height),
      );
      return `<div class="${className}"${layerName} style="overflow:hidden"><img src="${escapeHtml(source)}" alt="" style="position:absolute;left:${(-100 * crop.x) / crop.width}%;top:${(-100 * crop.y) / crop.height}%;width:${(100 * size.width) / crop.width}%;height:${(100 * size.height) / crop.height}%;max-width:none" /></div>`;
    }
    return `<img class="${className}"${layerName} src="${escapeHtml(source)}" alt="" />`;
  }

  const content = (children.get(null) ?? [])
    .map((node) => render(node, byId.get(node.parentId) ?? null))
    .filter(Boolean)
    .join("\n");
  activeDocs.delete(doc);
  return `<style>\n${css.join("\n")}\n</style>\n<div class="voo-design voo-design-${safeScope}">\n${content}\n</div>`;
}
