// Browser layout measurement for editable HTML imports.

import { SKIP_TAGS } from "./html_import_style.js";

const UNSAFE_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "form",
  "link",
  "meta",
  "foreignobject",
  "video",
  "audio",
  "source",
  "track",
  "picture",
  "canvas",
  "math",
  "template",
  "base",
]);

const COMPUTED_KEYS = [
  "color",
  "display",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textAlign",
  "textDecoration",
  "textTransform",
  "whiteSpace",
  "visibility",
  "fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "fillRule", "fillOpacity", "strokeOpacity",
  "backgroundImage", "opacity", "borderRadius",
  "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius",
  "borderTop", "borderRight", "borderBottom", "borderLeft",
  "flexDirection", "flexWrap", "justifyContent", "alignItems", "alignContent",
  "rowGap", "columnGap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "gridTemplateColumns", "gridTemplateRows", "objectFit",
];

function safeClone(source, documentRef, pairs) {
  const tag = source.tagName.toLowerCase();
  if (UNSAFE_TAGS.has(tag)) return null;
  // Uppercase tagName creates a nonstandard XHTML element and collapses block flow.
  const clone = documentRef.createElementNS(
    source.namespaceURI ?? "http://www.w3.org/1999/xhtml",
    source.localName,
  );
  for (const attribute of source.attributes) {
    const name = attribute.name.toLowerCase();
    if (
      name.startsWith("on") ||
      [
        "src",
        "srcset",
        "href",
        "xlink:href",
        "poster",
        "data",
        "action",
        "formaction",
      ].includes(name)
    )
      continue;
    if (name === "style" && /url\s*\(/i.test(attribute.value)) {
      clone.setAttribute(
        name,
        attribute.value.replace(/url\s*\([^)]*\)/gi, "none"),
      );
      continue;
    }
    clone.setAttribute(attribute.name, attribute.value);
  }
  pairs.push([source, clone]);
  if (tag === "style") {
    clone.textContent = source.textContent
      .replace(/@import[^;]*;/gi, "")
      .replace(/url\s*\([^)]*\)/gi, "none");
    return clone;
  }
  for (const child of source.childNodes) {
    if (child.nodeType === 3) {
      clone.appendChild(documentRef.createTextNode(child.textContent ?? ""));
    } else if (child.nodeType === 1) {
      const copied = safeClone(child, documentRef, pairs);
      if (copied) clone.appendChild(copied);
    }
  }
  return clone;
}

function directTextBox(element, origin, lineHeight) {
  const textNodes = [...element.childNodes].filter(
    (child) => child.nodeType === 3 && child.textContent?.trim(),
  );
  if (textNodes.length === 0) return null;
  const range = element.ownerDocument.createRange();
  const rects = [];
  for (const node of textNodes) {
    range.selectNodeContents(node);
    rects.push(...range.getClientRects());
  }
  range.detach?.();
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const leading = Number.isFinite(lineHeight) ? lineHeight - rects[0].height : 0;
  return {
    x: left - origin.left,
    y: top - origin.top - leading / 2,
    width: right - left,
    height: bottom - top + leading,
  };
}

/** Measure with Chromium's CSS engine before converting HTML into editor nodes. */
export function measureHtmlRoots(
  parsed,
  roots,
  { width = 1080, height = 1440 } = {},
) {
  if (typeof document === "undefined" || !document.body) return null;
  const host = document.createElement("div");
  // Reset the editor shell's inherited font and line height before measuring.
  host.style.cssText = `all:initial;display:block;position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1;`;
  const shadow = host.attachShadow({ mode: "open" });
  const pairs = [];
  for (const style of parsed.head?.querySelectorAll("style") ?? []) {
    const copied = safeClone(style, document, pairs);
    if (copied) shadow.appendChild(copied);
  }
  for (const root of roots) {
    const copied = safeClone(root, document, pairs);
    if (copied) shadow.appendChild(copied);
  }
  document.body.appendChild(host);
  try {
    const origin = host.getBoundingClientRect();
    // Editor nodes store an untransformed box and apply rotation separately.
    // BoundingClientRect includes transforms from the element and its parents,
    // which would otherwise bake rotation into every descendant's geometry.
    for (const [, clone] of pairs) {
      clone.style?.setProperty("transform", "none", "important");
    }
    const measured = new Map();
    for (const [source, clone] of pairs) {
      if (SKIP_TAGS.has(source.tagName.toLowerCase())) continue;
      const rect = clone.getBoundingClientRect();
      const computed = getComputedStyle(clone);
      const style = Object.fromEntries(
        COMPUTED_KEYS.map((key) => [key, computed[key]]),
      );
      const background = computed.backgroundColor;
      if (
        background &&
        background !== "rgba(0, 0, 0, 0)" &&
        background !== "transparent"
      ) {
        style.backgroundColor = background;
      }
      const sides = ["borderTop", "borderRight", "borderBottom", "borderLeft"];
      if (sides.every((key) => style[key] === style.borderTop)) {
        style.border = style.borderTop;
        for (const key of sides) style[key] = "none";
      } else {
        // A shorthand would paint a second stroke beneath the individual sides.
        style.border = "none";
      }
      measured.set(source, {
        box: {
          x: rect.left - origin.left,
          y: rect.top - origin.top,
          width: rect.width,
          height: rect.height,
          absolute:
            computed.position === "absolute" || computed.position === "fixed",
        },
        textBox: directTextBox(clone, origin, Number.parseFloat(computed.lineHeight)),
        style,
      });
    }
    return measured;
  } finally {
    host.remove();
  }
}
