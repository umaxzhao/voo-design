/**
 * The file formats a design can be saved as, and what each save would lose.
 * A document saves back to the format its file name carries; `.voo` is the
 * native format and loses nothing.
 */
import { NODE_KIND } from "../editor/scene_doc_factory.js";
import { isSvgFileName, svgSaveLosses } from "./svg_document_io.js";
import { figSaveLosses } from "../figma/voo-to-fig.js";

/** The Figma save: frames, rectangles and ellipses with solid fills. */
export const FIG_FORMAT = Object.freeze({
  extension: ".fig",
  mime: "application/octet-stream",
  electronFilter: { name: "Figma", extensions: ["fig"] },
  pickerType: {
    description: "Figma (*.fig)",
    accept: { "application/octet-stream": [".fig"] },
  },
});

export const SAVE_FORMATS = Object.freeze({
  voo: {
    extension: ".voo",
    mime: "application/octet-stream",
    electronFilter: { name: "VOO Design Document", extensions: ["voo"] },
    pickerType: {
      description: "VOO Design Document (*.voo)",
      accept: { "application/json": [".voo"] },
    },
  },
  svg: {
    extension: ".svg",
    mime: "image/svg+xml",
    electronFilter: { name: "SVG", extensions: ["svg"] },
    pickerType: {
      description: "SVG (*.svg)",
      accept: { "image/svg+xml": [".svg"] },
    },
  },
  fig: FIG_FORMAT,
  psd: {
    extension: ".psd",
    mime: "image/vnd.adobe.photoshop",
    electronFilter: { name: "Photoshop", extensions: ["psd"] },
    pickerType: {
      description: "Photoshop (*.psd)",
      accept: { "image/vnd.adobe.photoshop": [".psd"] },
    },
  },
});

export function isFigFileName(fileName) {
  return /\.fig$/i.test(fileName ?? "");
}

export function isPsdFileName(fileName) {
  return /\.psd$/i.test(fileName ?? "");
}

/** Pen documents are imported into a new `.voo`; there is no Pen writer. */
export function isPenFileName(fileName) {
  return /\.pen$/i.test(fileName ?? "");
}

/**
 * The save format a document name implies. Unknown names save as `.voo`.
 * A `.pen` name also saves as `.voo`: Pen is an import-only format, so the
 * imported document is never written back over the source file.
 */
export function saveFormatOf(fileName) {
  if (isSvgFileName(fileName)) return "svg";
  if (isPsdFileName(fileName)) return "psd";
  if (isFigFileName(fileName)) return "fig";
  return "voo";
}

/** Swaps a document name's extension for the one it saves as. */
export function replaceDocumentExtension(name, extension) {
  return name.replace(/\.(voo|svg|psd|fig|pen)$/i, "") + extension;
}

/**
 * Lists what a save in `format` would drop, as `{ key, params }` translation
 * entries. Empty when nothing is lost. `.voo` never loses anything.
 */
export function formatSaveLosses(format, { pageCount, sceneDoc }) {
  if (format === "svg") return svgSaveLosses({ pageCount, sceneDoc });
  if (format === "psd") return psdSaveLosses({ pageCount, sceneDoc });
  if (format === "fig") return figSaveLosses(sceneDoc, { pageCount });
  return [];
}

/**
 * PSD stores every drawn layer as pixels, so text and vector shapes stop being
 * editable as such. Only the focused page is written.
 */
const PSD_RASTERIZED_KINDS = new Set([
  NODE_KIND.TEXT,
  NODE_KIND.RECT,
  NODE_KIND.ELLIPSE,
  NODE_KIND.PATH,
  NODE_KIND.BOOLEAN,
]);

function psdSaveLosses({ pageCount, sceneDoc }) {
  const losses = [];
  if (pageCount > 1) losses.push({ key: "save.loss.pages" });
  const rasterized = (sceneDoc?.nodes ?? []).filter(
    (node) => node.visible !== false && PSD_RASTERIZED_KINDS.has(node.kind),
  ).length;
  if (rasterized > 0) {
    losses.push({ key: "psd.save.lossRasterized", params: { count: rasterized } });
  }
  return losses;
}
