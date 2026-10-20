import {
  createDocument,
  getBaseDefaults,
  NODE_KIND,
} from "../editor/scene_doc_factory.js";
import { parseHtmlStringToAst } from "../editor/html_import_parser.js";
import { htmlTreeToDocument } from "../editor/html_import_document.js";
import { NODE_TYPE } from "../nodes/types.js";

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 720;

function positive(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sourceSize(node, page) {
  const doc = page?.doc ?? page?.editorDoc ?? page?.scene;
  return {
    width:
      positive(doc?.width) ??
      positive(page?.width) ??
      positive(node.data?.layoutWidth) ??
      positive(node.data?.width) ??
      DEFAULT_WIDTH,
    height:
      positive(doc?.height) ??
      positive(page?.height) ??
      positive(node.data?.layoutHeight) ??
      positive(node.data?.height) ??
      DEFAULT_HEIGHT,
  };
}

function imageDocument(page, size, index) {
  const imageId = page.imageId ?? page.assetId ?? null;
  const src = page.url ?? page.src ?? null;
  if (!imageId && !src) return null;
  const doc = createDocument(size.width, size.height);
  doc.nodes = [
    {
      ...getBaseDefaults(),
      id: `presentation-image-${index}`,
      kind: NODE_KIND.IMAGE,
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
      imageId,
      src,
      maskId: null,
    },
  ];
  return doc;
}

function normalizePage(rawPage, node, index) {
  const page = typeof rawPage === "string" ? { url: rawPage } : rawPage;
  if (!page || typeof page !== "object") return null;
  const size = sourceSize(node, page);
  const originalDoc = page.doc ?? page.editorDoc ?? page.scene;
  let doc;
  if (originalDoc != null) {
    if (!Array.isArray(originalDoc.nodes)) return null;
    doc = structuredClone(originalDoc);
    doc.width = positive(doc.width) ?? size.width;
    doc.height = positive(doc.height) ?? size.height;
  } else if (typeof (page.html ?? page.srcdoc) === "string") {
    const ast = parseHtmlStringToAst(page.html ?? page.srcdoc);
    doc = htmlTreeToDocument(ast, size).doc;
  } else {
    doc = imageDocument(page, size, index);
  }
  if (!doc) return null;
  return {
    doc,
    width: doc.width,
    height: doc.height,
    title: typeof page.title === "string" ? page.title : "",
    notes: typeof page.notes === "string" ? page.notes : "",
    imageId: page.imageId ?? page.assetId ?? null,
    source: {
      imageId: page.imageId ?? page.assetId ?? null,
      url: page.url ?? page.src ?? null,
      html: page.html ?? page.srcdoc ?? null,
    },
  };
}

import {
  createRectNode,
  createEllipseNode,
  createTextNode,
} from "../editor/scene_model.js";

function decodeXml(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

/** Converts only embedded page content; raw PPTX URLs remain preview-only. */
export function prepareSlidesPreviewConversion(node) {
  if (node?.type !== NODE_TYPE.PREVIEW || node.data?.mediaType !== "slides") {
    return null;
  }
  const rawPages =
    Array.isArray(node.data?.pages) && node.data.pages.length > 0
      ? node.data.pages
      : Array.isArray(node.data?.deck?.pages) && node.data.deck.pages.length > 0
        ? node.data.deck.pages
        : node.data?.slides;
  if (!Array.isArray(rawPages) || rawPages.length === 0) return null;
  const pages = rawPages.map((page, index) => normalizePage(page, node, index));
  if (pages.some((page) => !page)) return null;
  return {
    width: pages[0].width,
    height: pages[0].height,
    pages,
  };
}

export async function parsePptxDeck(bufferOrBlob) {
  if (!bufferOrBlob) throw new TypeError("Missing PPTX buffer or blob");
  const buffer =
    typeof bufferOrBlob.arrayBuffer === "function"
      ? await bufferOrBlob.arrayBuffer()
      : bufferOrBlob;
  // Ordinary workflow nodes need conversion metadata, not the PPTX ZIP decoder.
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  // Read presentation dimensions
  const presXml = await zip.file("ppt/presentation.xml")?.async("string");
  let width = 960;
  let height = 540;
  if (presXml) {
    const szMatch = presXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/i);
    if (szMatch) {
      width = Math.round(Number(szMatch[1]) / 9525) || 960;
      height = Math.round(Number(szMatch[2]) / 9525) || 540;
    }
  }

  // Find slide files
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || "0", 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || "0", 10);
      return numA - numB;
    });

  const pages = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideNum = slidePath.match(/\d+/)?.[0] || `${i + 1}`;
    const slideXml = await zip.file(slidePath).async("string");

    // Notes
    let notes = "";
    const notesFile =
      zip.file(`ppt/notesSlides/notesSlide${slideNum}.xml`) ||
      zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`);
    if (notesFile) {
      const notesXml = await notesFile.async("string");
      const noteMatches = [
        ...notesXml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi),
      ];
      notes = noteMatches
        .map((m) => decodeXml(m[1]))
        .filter((t) => t.trim().length > 0)
        .join("\n");
    }

    // Nodes
    const doc = createDocument(width, height, "#ffffff");
    const parsedNodes = [];

    // Parse shape blocks
    const spMatches = [...slideXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gi)];
    for (let sIdx = 0; sIdx < spMatches.length; sIdx++) {
      const spXml = spMatches[sIdx][0];

      // Coordinates
      const offMatch = spXml.match(/<a:off[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/i);
      const extMatch = spXml.match(/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/i);
      if (!offMatch || !extMatch) continue;

      const x = Math.round(Number(offMatch[1]) / 9525);
      const y = Math.round(Number(offMatch[2]) / 9525);
      const w = Math.round(Number(extMatch[1]) / 9525);
      const h = Math.round(Number(extMatch[2]) / 9525);

      const rotMatch = spXml.match(/<a:xfrm[^>]*rot="(\d+)"/i);
      const rotation = rotMatch ? Math.round(Number(rotMatch[1]) / 60000) : 0;

      // Geometry & colors
      const geomMatch = spXml.match(/<a:prstGeom[^>]*prst="([^"]+)"/i);
      const geom = geomMatch ? geomMatch[1] : "rect";

      const fillMatch = spXml.match(
        /<a:solidFill>[\s\S]*?<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i,
      );
      const fill = fillMatch ? `#${fillMatch[1].toLowerCase()}` : undefined;

      const lnMatch = spXml.match(
        /<a:ln\b[^>]*?(?:w="(\d+)")?[\s\S]*?<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i,
      );
      let stroke;
      let strokeWidth = 0;
      if (lnMatch) {
        if (lnMatch[1]) strokeWidth = Math.round(Number(lnMatch[1]) / 9525);
        if (lnMatch[2]) stroke = `#${lnMatch[2].toLowerCase()}`;
      }

      // Check text body
      const txBodyMatch = spXml.match(/<p:txBody\b[\s\S]*?<\/p:txBody>/i);
      const textMatches = txBodyMatch
        ? [...txBodyMatch[0].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi)]
        : [];

      if (textMatches.length > 0) {
        const fullText = textMatches.map((m) => decodeXml(m[1])).join("\n");
        const szMatch = txBodyMatch[0].match(/<a:rPr[^>]*sz="(\d+)"/i);
        const fontSize = szMatch ? Math.round(Number(szMatch[1]) / 100) : 16;

        const typefaceMatch = txBodyMatch[0].match(
          /<a:latin[^>]*typeface="([^"]+)"/i,
        );
        const fontFamily = typefaceMatch ? typefaceMatch[1] : "Arial";

        const isBold = /<a:rPr[^>]*b="1"/i.test(txBodyMatch[0]);
        const isItalic = /<a:rPr[^>]*i="1"/i.test(txBodyMatch[0]);

        const textFillMatch = txBodyMatch[0].match(
          /<a:rPr>[\s\S]*?<a:srgbClr\s+val="([0-9a-fA-F]{6})"/i,
        );
        const textFill = textFillMatch
          ? `#${textFillMatch[1].toLowerCase()}`
          : fill || "#000000";

        const alignMatch = txBodyMatch[0].match(/<a:pPr[^>]*algn="([^"]+)"/i);
        const align = alignMatch
          ? { l: "left", ctr: "center", r: "right", just: "justify" }[
              alignMatch[1]
            ] || "left"
          : "left";

        parsedNodes.push(
          createTextNode({
            id: `text-${slideNum}-${sIdx}`,
            x,
            y,
            width: w,
            height: h,
            text: fullText,
            fontSize,
            fontFamily,
            fontWeight: isBold ? "bold" : "normal",
            fontStyle: isItalic ? "italic" : "normal",
            fill: textFill,
            align,
            rotation,
          }),
        );
      } else {
        if (geom === "ellipse") {
          parsedNodes.push(
            createEllipseNode({
              id: `shape-${slideNum}-${sIdx}`,
              x,
              y,
              width: w,
              height: h,
              fill: fill || "#cccccc",
              stroke,
              strokeWidth: strokeWidth || (stroke ? 1 : 0),
              rotation,
            }),
          );
        } else {
          parsedNodes.push(
            createRectNode({
              id: `shape-${slideNum}-${sIdx}`,
              x,
              y,
              width: w,
              height: h,
              fill: fill || "#cccccc",
              stroke,
              strokeWidth: strokeWidth || (stroke ? 1 : 0),
              rotation,
            }),
          );
        }
      }
    }

    doc.nodes = parsedNodes;
    pages.push({
      id: `imported-slide-${slideNum}`,
      title: `Slide ${slideNum}`,
      notes,
      width,
      height,
      doc,
    });
  }

  return {
    title: "Imported Presentation",
    width,
    height,
    pages,
  };
}
