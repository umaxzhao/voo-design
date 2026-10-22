/**
 * Shared HTML/JSX renderer for the code exporter.
 *
 * The HTML, React and CSS writers differ only in their dialect hooks: the
 * attribute name for classes, how text is escaped, whether SVG is emitted raw
 * or converted to JSX, and whether a video element self-closes. Keeping one
 * traversal here guarantees the three formats agree on nesting and order.
 */

import { escapeHtml } from "../editor/editor_html_elements.js";
import { tailwindClassName } from "./tailwind.js";

const INDENT = "  ";

/** Attributes that are booleans in HTML/JSX and render as a bare name. */
const BOOLEAN_ATTRIBUTES = new Set([
  "autoplay",
  "muted",
  "loop",
  "playsinline",
  "controls",
  "disabled",
  "hidden",
  "allowfullscreen",
]);

function attributeMarkup(descriptor, dialect) {
  const parts = [
    `${dialect.classAttribute}="${escapeHtml(dialect.classFor(descriptor))}"`,
  ];
  for (const [name, value] of descriptor.attrs) {
    const attributeName = dialect.attributeName(name);
    if (value === "" && BOOLEAN_ATTRIBUTES.has(name)) parts.push(attributeName);
    else parts.push(`${attributeName}="${escapeHtml(value)}"`);
  }
  if (descriptor.kind === "placeholder") {
    parts.push('data-placeholder="true"');
  }
  const layerName = descriptor.sourceNode?.name;
  if (layerName) {
    parts.push(`data-layer-name="${escapeHtml(layerName)}"`);
  }
  return ` ${parts.join(" ")}`;
}

function indentMarkup(markup, depth) {
  return String(markup)
    .split("\n")
    .map((line) => (line ? `${INDENT.repeat(depth)}${line}` : line))
    .join("\n");
}

/**
 * Renders one descriptor (and its subtree) in the given dialect.
 *
 * Dialect contract: `classAttribute`, `classFor(descriptor)`,
 * `attributeName(name)`, `text(value)`, `svg(markup)`, `videoSelfClose` and
 * `indent`.
 */
export function renderDescriptor(descriptor, dialect, depth = 0) {
  const pad = (dialect.indent ?? INDENT).repeat(depth);
  const attributes = attributeMarkup(descriptor, dialect);
  switch (descriptor.kind) {
    case "text":
      return `${pad}<div${attributes}>${dialect.text(descriptor.text)}</div>`;
    case "vector": {
      const svg = indentMarkup(dialect.svg(descriptor.svg), depth + 1);
      return `${pad}<div${attributes}>\n${svg}\n${pad}</div>`;
    }
    case "image":
      return `${pad}<img${attributes} />`;
    case "video":
      return dialect.videoSelfClose
        ? `${pad}<video${attributes} />`
        : `${pad}<video${attributes}></video>`;
    case "placeholder":
    case "element":
    case "root": {
      if (descriptor.children.length === 0) {
        return `${pad}<div${attributes}></div>`;
      }
      const children = descriptor.children
        .map((child) => renderDescriptor(child, dialect, depth + 1))
        .join("\n");
      return `${pad}<div${attributes}>\n${children}\n${pad}</div>`;
    }
    default:
      return `${pad}<div${attributes}></div>`;
  }
}

/** The canonical dialect for plain HTML and the CSS format's HTML skeleton. */
export const HTML_DIALECT = Object.freeze({
  classAttribute: "class",
  classFor: (descriptor) => tailwindClassName(descriptor.plan),
  attributeName: (name) => name,
  text: (value) => escapeHtml(value),
  svg: (markup) => markup,
  videoSelfClose: false,
  indent: INDENT,
});

/** The dialect for the plain-CSS format: semantic class names, not utilities. */
export const CSS_DIALECT = Object.freeze({
  ...HTML_DIALECT,
  classFor: (descriptor) => descriptor.cssClass,
});
