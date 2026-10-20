/**
 * Public facade for HTML-to-editable-layer conversion.
 *
 * Implementation seams live in adjacent modules; this file intentionally keeps
 * the historical public API stable for editor callers and tests.
 */

export { HTML_IMPORT_WARNING, formatUnsupportedPropertyWarning, isUnsupportedPropertyWarning } from "./html_layout.js";
export { estimateTextSize, parseLineHeight, parseTextDecoration, applyTextTransform, inheritInlineTextStyle, checkUnsupportedTextProperties } from "./text_fidelity.js";
export { normalizeGradient, formatGradientString, checkUnsupportedGradient } from "./gradient_model.js";
export { parseInlineStyle, px, sanitizeLayoutHtml } from "./html_import_style.js";
export { resolveBox, walkElement, htmlTreeToDocument } from "./html_import_document.js";
export { autoCloseHtmlTags, sanitizePartialStyles, parseHtmlStringToAst, incrementalHtmlToDocument, IncrementalHtmlParser, htmlToDocument } from "./html_import_parser.js";
export { extractHtmlSnippet, StreamingLayoutFilter } from "./streaming_layout_filter.js";
