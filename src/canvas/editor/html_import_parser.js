// HTML import tolerant streaming and DOM parser seam.

import { createDocument } from "./scene_model.js";
import { extractHtmlSnippet } from "./streaming_layout_filter.js";
import { SKIP_TAGS, parseInlineStyle } from "./html_import_style.js";
import { htmlTreeToDocument } from "./html_import_document.js";
import { measureHtmlRoots } from "./html_import_measure.js";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Repairs unclosed HTML tags and unclosed attribute quotes in partial streaming HTML.
 * @param {string} html
 * @returns {string} Repaired valid HTML
 */
export function autoCloseHtmlTags(html) {
  if (!html) return "";
  let text = String(html).trim();

  // If text ends with an unclosed tag opening like `<div style="...` or `<h1`,
  // check if there's an unclosed quote in attributes or incomplete tag.
  const lastLt = text.lastIndexOf("<");
  const lastGt = text.lastIndexOf(">");
  if (lastLt > lastGt) {
    const partialTag = text.slice(lastLt);
    const quoteCount = (partialTag.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) {
      text += '">';
    } else {
      const singleQuoteCount = (partialTag.match(/'/g) || []).length;
      if (singleQuoteCount % 2 === 1) {
        text += "'>";
      } else {
        text += ">";
      }
    }
  }

  // Scan tag stack
  const tagStack = [];
  const tagRegex = /<(\/)?([a-zA-Z0-9-]+)([^>]*?)(\/)?>/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const isClosing = Boolean(match[1]);
    const tagName = match[2].toLowerCase();
    const isSelfClosing = Boolean(match[4]) || VOID_ELEMENTS.has(tagName);

    if (isSelfClosing) continue;

    if (isClosing) {
      const idx = tagStack.lastIndexOf(tagName);
      if (idx >= 0) {
        tagStack.splice(idx);
      }
    } else {
      tagStack.push(tagName);
    }
  }

  // Append closing tags in reverse order
  while (tagStack.length > 0) {
    const tag = tagStack.pop();
    text += `</${tag}>`;
  }

  return text;
}

/**
 * Sanitizes partial/cut-off inline CSS styles.
 */
export function sanitizePartialStyles(style) {
  if (!style || typeof style !== "string") return style;
  return style.replace(/(?:^|;)\s*[-a-zA-Z0-9]+\s*:\s*(?:calc\([^)]*)?$/i, ";");
}

function parseAttributes(attrStr) {
  const attrs = {};
  if (!attrStr) return attrs;
  const re = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
  let match;
  while ((match = re.exec(attrStr)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = val;
  }
  return attrs;
}

/**
 * Lightweight pure HTML AST parser for environments where DOMParser is not present.
 */
export function parseHtmlStringToAst(html) {
  const cleaned = extractHtmlSnippet(html);
  const root = { tag: "div", style: "", attrs: {}, text: "", children: [] };
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9-]+)([^>]*?)(\/)?>|([^<]+)/g;
  let match;
  while ((match = tagRe.exec(cleaned)) !== null) {
    if (match[0].startsWith("<!--")) continue;
    if (match[5]) {
      const text = match[5].trim();
      if (text && stack.length > 0) {
        const top = stack[stack.length - 1];
        top.text = top.text
          ? `${top.text}${top.text.endsWith("\n") ? "" : " "}${text}`
          : text;
      }
      continue;
    }
    const isClosing = Boolean(match[1]);
    const tagName = (match[2] || "").toLowerCase();
    const attrStr = match[3] || "";
    const isSelfClosing = Boolean(match[4]) || VOID_ELEMENTS.has(tagName);

    if (isClosing) {
      if (stack.length > 1) {
        const lastIdx = stack.map((n) => n.tag).lastIndexOf(tagName);
        if (lastIdx > 0) {
          stack.splice(lastIdx);
        } else {
          stack.pop();
        }
      }
    } else {
      if (tagName === "br") {
        stack[stack.length - 1].text += "\n";
        continue;
      }
      const attrs = parseAttributes(attrStr);
      const style = attrs.style || "";
      const node = { tag: tagName, style, attrs, text: "", children: [] };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      }
      if (!isSelfClosing) {
        stack.push(node);
      }
    }
  }
  return root.children.length > 0 ? root.children[0] : root;
}

/**
 * Tolerant incremental HTML parser that auto-closes tags, sanitizes partial styles,
 * and parses progressive layout documents.
 */
export function incrementalHtmlToDocument(htmlOrTree, options = {}) {
  if (!htmlOrTree) {
    const W = options.width ?? 1080;
    const H = options.height ?? 1440;
    return {
      doc: createDocument(W, H, "#ffffff"),
      warnings: [],
      pendingImages: [],
    };
  }

  if (typeof htmlOrTree === "object" && !Array.isArray(htmlOrTree)) {
    return htmlTreeToDocument(htmlOrTree, options);
  }

  const rawHtml = String(htmlOrTree);
  const withoutThink = rawHtml
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "");
  const snippet = extractHtmlSnippet(withoutThink);
  if (!snippet.trim()) {
    const W = options.width ?? 1080;
    const H = options.height ?? 1440;
    return {
      doc: createDocument(W, H, "#ffffff"),
      warnings: [],
      pendingImages: [],
    };
  }

  const repaired = autoCloseHtmlTags(snippet);

  if (typeof DOMParser !== "undefined") {
    try {
      const parsed = new DOMParser().parseFromString(repaired, "text/html");
      const body = parsed.body ?? parsed.documentElement;
      const sourceRoots = [...(body?.children ?? [])];
      const measurements = measureHtmlRoots(parsed, sourceRoots, options);
      const roots = sourceRoots
        .map((element) => domElementToTree(element, measurements))
        .filter(Boolean);
      if (roots.length > 0) {
        return htmlTreeToDocument(roots, options);
      }
    } catch {
      // Fallback to AST parser
    }
  }

  try {
    const ast = parseHtmlStringToAst(repaired);
    if (ast) {
      const roots =
        ast.children && ast.children.length > 0
          ? ast.tag === "div" && !ast.style && !ast.attrs?.src
            ? ast.children
            : [ast]
          : [ast];
      return htmlTreeToDocument(roots, options);
    }
  } catch {
    // Fall through
  }

  const W = options.width ?? 1080;
  const H = options.height ?? 1440;
  return {
    doc: createDocument(W, H, "#ffffff"),
    warnings: ["incremental-parse-empty"],
    pendingImages: [],
  };
}

/**
 * Class wrapping tolerant incremental HTML parsing.
 */
export class IncrementalHtmlParser {
  constructor(options = {}) {
    this.options = options;
  }

  repair(html) {
    return autoCloseHtmlTags(extractHtmlSnippet(html));
  }

  parse(html, options = {}) {
    return incrementalHtmlToDocument(html, { ...this.options, ...options });
  }
}

/** Converts a DOM element into the plain tree contract above. */
function domElementToTree(element, measurements = null) {
  const tag = element.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return null;
  const attrs = {};
  for (const attr of element.attributes ?? []) attrs[attr.name] = attr.value;
  const measured = measurements?.get(element);
  let directText = [...element.childNodes]
    .map((node) => {
      if (node.nodeType === 3) return node.textContent;
      if (node.nodeType === 1 && node.tagName?.toLowerCase() === "br")
        return "\u0000";
      return "";
    })
    .join("");
  const whiteSpace = measured?.style.whiteSpace ?? "normal";
  if (["normal", "nowrap"].includes(whiteSpace)) {
    directText = directText.replace(/[ \t\r\n\f]+/g, " ").trim();
  } else if (whiteSpace === "pre-line") {
    directText = directText.replace(/[ \t]+/g, " ").trim();
  }
  directText = directText.replaceAll("\u0000", "\n");
  return {
    tag,
    style: measured
      ? {
          ...parseInlineStyle(element.getAttribute("style")),
          ...measured.style,
          // Computed paints have resolved variables and stylesheet precedence.
          background: undefined,
          backgroundColor: measured.style.backgroundColor ?? "transparent",
        }
      : (element.getAttribute("style") ?? ""),
    attrs,
    text: directText,
    measuredBox: measured?.box ?? null,
    measuredTextBox: measured?.textBox ?? null,
    children: [...element.children]
      .map((child) => domElementToTree(child, measurements))
      .filter(Boolean),
  };
}

/**
 * Browser half: parses an HTML string and converts it into a document.
 * Requires DOMParser (all three deployment forms have it). Pure callers use
 * `htmlTreeToDocument` instead.
 */
export function htmlToDocument(html, options) {
  const cleaned = extractHtmlSnippet(html);
  const parsed = new DOMParser().parseFromString(cleaned, "text/html");
  const body = parsed.body ?? parsed.documentElement;
  const sourceRoots = [...body.children];
  const measurements = measureHtmlRoots(parsed, sourceRoots, options);
  const roots = sourceRoots
    .map((element) => domElementToTree(element, measurements))
    .filter(Boolean);
  if (roots.length === 0) {
    throw new Error("layout-parse-empty");
  }
  return htmlTreeToDocument(roots, options);
}
