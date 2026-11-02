/**
 * Public API for "Export design to code".
 *
 * `generateCode` turns a scene document (or a selection inside it) into one of
 * three handoff formats. Every module below this file is pure: no React, no DOM,
 * no store access, so the exporter is unit-testable in the node environment.
 *
 *   html  — standalone HTML document using Tailwind utility classes
 *   react — single function component (JSX, Tailwind classes, default export)
 *   css   — semantic class names, plain stylesheet, matching HTML skeleton
 */

import { generateCss } from "./css.js";
import { generateHtml } from "./html.js";
import {
  CODEGEN_FORMATS,
  CODEGEN_SCOPES,
  buildScene,
  componentName,
} from "./model.js";
import { generateReact } from "./react.js";
import { buildRenderTree } from "./serialize.js";

const LANGUAGES = Object.freeze({ html: "html", react: "jsx", css: "css" });
const EXTENSIONS = Object.freeze({ html: "html", react: "jsx", css: "css" });

export { CODEGEN_FORMATS, CODEGEN_SCOPES, buildRenderTree, buildScene };

export function fileNameFor(format, baseName) {
  if (format === "react") return `${componentName(baseName)}.${EXTENSIONS.react}`;
  return `${baseName}.${EXTENSIONS[format] ?? "txt"}`;
}

/**
 * Generates export code.
 *
 * @param {object} input
 * @param {object} input.doc scene document (`{ width, height, nodes, ... }`)
 * @param {string[]|null} [input.selectedIds] selected node ids; null/[] means none
 * @param {"html"|"react"|"css"} [input.format]
 * @param {"selection"|"page"} [input.scope] selection falls back to the page when nothing is selected
 * @param {Map<string,string>|Record<string,string>|null} [input.imageSources]
 *   resolvable `src` per `imageId`/node id (data URL or http(s) URL)
 * @param {Map<string,object>|Record<string,object>|null} [input.imageSizes]
 *   intrinsic `{width,height}` per image id, used to reproduce crops
 * @returns {{code:string, fileName:string, language:string, format:string,
 *   scope:string, warnings:Array<{code:string,nodeId:string|null,
 *   nodeName:string|null,message:string}>}}
 */
export function generateCode({
  doc = null,
  selectedIds = null,
  format = "html",
  scope = "selection",
  imageSources = null,
  imageSizes = null,
} = {}) {
  if (!doc || !Array.isArray(doc.nodes)) throw new Error("codegen-no-document");
  if (!CODEGEN_FORMATS.includes(format)) {
    throw new Error("codegen-unsupported-format");
  }
  if (!CODEGEN_SCOPES.includes(scope)) {
    throw new Error("codegen-unsupported-scope");
  }
  const renderTree = buildRenderTree(doc, {
    selectedIds,
    scope,
    imageSources,
    imageSizes,
  });
  let code;
  if (format === "react") code = generateReact(renderTree);
  else if (format === "css") code = generateCss(renderTree);
  else code = generateHtml(renderTree);
  const effectiveScope = renderTree.scene.emptySelection ? "page" : scope;
  return {
    code,
    fileName: fileNameFor(format, renderTree.baseName),
    language: LANGUAGES[format],
    format,
    scope: effectiveScope,
    warnings: renderTree.warnings,
  };
}

export { generateHtml, generateReact, generateCss };
