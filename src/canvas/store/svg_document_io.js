/**
 * SVG as a document format: opening a `.svg` builds an editable design, and
 * saving writes the focused page back as SVG. The SVG writer cannot represent
 * everything the editor can, so `svgSaveLosses` lists what would be dropped
 * before the file is written.
 */
import { isSvgString, parseSvgStringToNodes } from "../editor/editor_svg.js";
import { NODE_KIND, createDocument } from "../editor/scene_doc_factory.js";
import { VOO_FILE_FORMAT } from "../../../electron/voo_format.js";
import { needsSvgRaster, requiresSvgSceneRaster } from "../editor/svg-raster-support.js";

/** Node kinds the SVG writer represents. Other visible kinds are reported as losses. */
const SVG_WRITABLE_KINDS = new Set([
  NODE_KIND.RECT,
  NODE_KIND.ELLIPSE,
  NODE_KIND.PATH,
  NODE_KIND.BOOLEAN,
  NODE_KIND.TEXT,
  NODE_KIND.IMAGE,
]);

export function isSvgFileName(fileName) {
  return /\.svg$/i.test(fileName ?? "");
}

/**
 * Parses SVG bytes into a v1 `.voo` envelope with one design document.
 * Throws when the bytes are not a usable SVG: a silent empty canvas would hide the error.
 */
export function svgBytesToVooFile(bytes) {
  const text = new TextDecoder().decode(bytes);
  if (!isSvgString(text)) throw new Error("invalid-svg-file");
  const { nodes, width, height } = parseSvgStringToNodes(text);
  if (!(width > 0) || !(height > 0)) throw new Error("invalid-svg-file");

  const doc = createDocument(width, height, "transparent");
  doc.nodes = nodes;
  return {
    format: VOO_FILE_FORMAT,
    version: 1,
    document: doc,
    images: {},
  };
}

/**
 * Lists what an SVG save would drop, as translation keys with params.
 * Empty when the whole document round-trips.
 */
export function svgSaveLosses({ pageCount, sceneDoc }) {
  const losses = [];
  if (pageCount > 1) losses.push({ key: "save.loss.pages" });
  const kinds = new Set(
    (sceneDoc?.nodes ?? [])
      .filter((node) => node.visible !== false && !SVG_WRITABLE_KINDS.has(node.kind))
      .map((node) => node.kind),
  );
  if (kinds.size > 0) losses.push({ key: "svg.save.lossKinds", params: { kinds: [...kinds].join(", ") } });
  if (requiresSvgSceneRaster(sceneDoc ?? {}) || sceneDoc?.nodes?.some(node => node.visible !== false && needsSvgRaster(node))) losses.push({ key: "svg.save.rasterized" });
  return losses;
}
