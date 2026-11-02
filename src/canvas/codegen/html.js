/**
 * HTML + Tailwind writer.
 *
 * Emits one standalone document: a root frame carrying the exported bounds and
 * the same utility class structure the React writer uses. Tailwind is a target
 * project dependency, noted in the head comment rather than pulled from a CDN,
 * so the file stays production-usable offline.
 */

import { escapeHtml } from "../editor/editor_html_elements.js";
import { HTML_DIALECT, renderDescriptor } from "./markup.js";

export function htmlDocumentTitle(baseName) {
  const words = String(baseName ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .join(" ");
  return words ? words.replace(/^./, (character) => character.toUpperCase()) : "Design";
}

/** The HTML body markup for an export, without the document wrapper. */
export function renderHtmlBody(renderTree) {
  return renderDescriptor(renderTree.root, HTML_DIALECT, 0);
}

/** A complete HTML document using Tailwind utility classes. */
export function generateHtml(renderTree) {
  const title = escapeHtml(htmlDocumentTitle(renderTree.baseName));
  const body = renderDescriptor(renderTree.root, HTML_DIALECT, 1);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${title}</title>`,
    "  <!-- Tailwind CSS is required for the utility classes below. -->",
    "</head>",
    '<body class="m-0">',
    body,
    "</body>",
    "</html>",
  ].join("\n");
}
