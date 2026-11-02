/**
 * React writer.
 *
 * Same tree and same Tailwind utilities as the HTML writer, emitted as a single
 * function component. Two dialect differences matter: text has to be JSX-safe
 * (a literal `<` or `{` would otherwise change the output), and inline SVG has
 * to become JSX (hyphenated SVG attributes are not valid JSX).
 */

import { componentName } from "./model.js";
import { renderDescriptor } from "./markup.js";
import { tailwindClassName } from "./tailwind.js";

const JSX_UNSAFE_TEXT = /[{}<>&]|\n/;
const REACT_ATTRIBUTE_NAMES = Object.freeze({
  autoplay: "autoPlay",
  playsinline: "playsInline",
  crossorigin: "crossOrigin",
  referrerpolicy: "referrerPolicy",
  allowfullscreen: "allowFullScreen",
  frameborder: "frameBorder",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
});

/** Text content that is safe in JSX, or a string expression when it is not. */
export function jsxText(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (JSX_UNSAFE_TEXT.test(text) || text !== text.trim()) {
    return `{${JSON.stringify(text)}}`;
  }
  return text;
}

function jsxSvgAttribute(name) {
  if (/^(data|aria)-/.test(name)) return name;
  if (!name.includes("-") && !name.includes(":")) return name;
  return name.replace(/[-:]([a-z])/g, (match, character) => character.toUpperCase());
}

/** Converts the editor's SVG string into JSX-safe markup. */
export function svgMarkupToJsx(markup) {
  return String(markup)
    .replace(/^<\?xml[^>]*\?>\s*/, "")
    .replace(/\s([a-zA-Z][\w:-]*)=/g, (match, name) => ` ${jsxSvgAttribute(name)}=`)
    .replace(/\sclass=/g, " className=")
    .trim();
}

export const REACT_DIALECT = Object.freeze({
  classAttribute: "className",
  classFor: (descriptor) => tailwindClassName(descriptor.plan),
  attributeName: (name) => REACT_ATTRIBUTE_NAMES[name] ?? name,
  text: jsxText,
  svg: svgMarkupToJsx,
  videoSelfClose: true,
  indent: "  ",
});

/** A complete `.jsx` component file using Tailwind utility classes. */
export function generateReact(renderTree) {
  const component = componentName(renderTree.baseName);
  const body = renderDescriptor(renderTree.root, REACT_DIALECT, 2);
  return [
    "/**",
    " * Generated from VOO Design.",
    " * Tailwind CSS is required for the utility classes in this component.",
    " */",
    `export default function ${component}() {`,
    "  return (",
    body,
    "  );",
    "}",
  ].join("\n");
}
