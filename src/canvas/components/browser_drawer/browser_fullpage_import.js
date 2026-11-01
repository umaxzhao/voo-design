import { prepareImportTargetProject } from "./browser_import_target.js";
import { useDesignStore } from "../../../store/design_store.js";
import { createGroupNode } from "../../editor/scene_model_groups.js";
import { createRectNode } from "../../editor/scene_model_node_builders.js";
import { createTextNode } from "../../editor/scene_model_text_effects.js";

/** Script to measure and extract DOM elements and text ranges in source coordinates */
export const WYSIWYG_EXTRACTION_SCRIPT = `
(function extractWYSIWYGData(doc = document) {
  const body = doc.body;
  const html = doc.documentElement;
  const scrollH = Math.max(
    body ? body.scrollHeight : 0,
    html ? html.scrollHeight : 0,
    window.innerHeight || 0
  );
  const vw = window.innerWidth || html.clientWidth || 1200;
  const title = doc.title || "Web Page";
  const bodyBg = window.getComputedStyle(body).backgroundColor;
  const docBg = window.getComputedStyle(html).backgroundColor;
  const resolvedBg =
    bodyBg && bodyBg !== "rgba(0, 0, 0, 0)" && bodyBg !== "transparent"
      ? bodyBg
      : docBg && docBg !== "rgba(0, 0, 0, 0)" && docBg !== "transparent"
        ? docBg
        : "#ffffff";

  const elements = [];
  const textNodes = [];

  function walk(el) {
    if (!el || el.nodeType !== 1) return;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(el.tagName)) return;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;

    const r = el.getBoundingClientRect();
    const hasVisibleBg =
      cs.backgroundColor &&
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
      cs.backgroundColor !== "transparent";
    const hasBgImg = cs.backgroundImage && cs.backgroundImage !== "none";
    const hasBorder =
      (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderRightWidth) > 0) &&
      cs.borderTopStyle !== "none";
    const hasShadow = cs.boxShadow && cs.boxShadow !== "none";

    // Only create a backing rect if element has background, border, shadow or is an image
    if (
      el !== body &&
      r.width > 0 &&
      r.height > 0 &&
      (hasVisibleBg || hasBgImg || hasBorder || hasShadow || el.tagName === "IMG")
    ) {
      elements.push({
        id: el.id || undefined,
        tag: el.tagName.toLowerCase(),
        x: Math.round(r.left),
        y: Math.round(r.top + window.scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
        fill: hasBgImg ? cs.backgroundImage : hasVisibleBg ? cs.backgroundColor : undefined,
        cornerRadius: parseFloat(cs.borderRadius) || 0,
        stroke: hasBorder ? cs.borderTopColor : undefined,
        strokeWidth: hasBorder ? Math.round(parseFloat(cs.borderTopWidth)) : 0,
      });
    }

    for (let child = el.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) {
        const text = child.textContent.trim();
        if (text) {
          const range = doc.createRange();
          range.selectNodeContents(child);
          const tr = range.getBoundingClientRect();
          if (tr.width > 0 && tr.height > 0) {
            textNodes.push({
              text,
              x: Math.round(tr.left),
              y: Math.round(tr.top + window.scrollY),
              width: Math.round(tr.width),
              height: Math.round(tr.height),
              color: cs.color,
              fontSize: Math.round(parseFloat(cs.fontSize)) || 16,
              fontFamily: cs.fontFamily.split(",")[0].trim().replace(/^[\\"\\x27]|[\\"\\x27]$/g, ""),
              fontWeight: cs.fontWeight,
            });
          }
        }
      } else if (child.nodeType === 1) {
        walk(child);
      }
    }
  }

  walk(body);
  return { title, width: vw, height: scrollH, backgroundColor: resolvedBg, elements, textNodes };
})(document);
`;

/**
 * Executes a full page import using real getBoundingClientRect measurements from source document.
 */
export async function executeFullPageImport({
  isElectron,
  webviewRef,
  iframeRef,
  injectPickerScript,
  url,
  t,
}) {
  let pageData = null;

  if (isElectron && webviewRef?.current) {
    injectPickerScript?.();
    pageData = await webviewRef.current.executeJavaScript(WYSIWYG_EXTRACTION_SCRIPT);
  } else if (iframeRef?.current) {
    try {
      const doc = iframeRef.current.contentDocument;
      if (doc && doc.body) {
        pageData = iframeRef.current.contentWindow.eval(WYSIWYG_EXTRACTION_SCRIPT);
      }
    } catch {
      pageData = null;
    }
  }

  if (!pageData) {
    throw new Error(t("browser.extractError"));
  }

  const { editor, doc: currentDoc, placement } = await prepareImportTargetProject(pageData.title);
  const existingNodes = currentDoc.nodes || [];

  // 1. Root Frame with exact width, height, title and background
  const frameNode = {
    ...createGroupNode({
      x: placement.x,
      y: placement.y,
      width: Math.round(pageData.width),
      height: Math.round(pageData.height),
      parentId: null,
    }),
    isFrame: true,
    name: pageData.title || t("browser.page"),
    fill: pageData.backgroundColor || "#ffffff",
    clipContent: true,
  };

  const childrenNodes = [];

  // 2. Element backgrounds, borders and shapes
  for (const el of pageData.elements || []) {
    const rect = createRectNode({
      x: placement.x + el.x,
      y: placement.y + el.y,
      width: el.width,
      height: el.height,
      fill: el.fill || "transparent",
      stroke: el.stroke || "transparent",
      strokeWidth: el.strokeWidth || 0,
    });
    rect.parentId = frameNode.id;
    if (el.id) rect.name = el.id;
    if (el.cornerRadius) rect.cornerRadius = el.cornerRadius;
    childrenNodes.push(rect);
  }

  // 3. Exact text nodes using Range positions
  for (const item of pageData.textNodes || []) {
    const textNode = createTextNode({
      x: placement.x + item.x,
      y: placement.y + item.y,
      text: item.text,
      fill: item.color || "#000000",
      fontSize: item.fontSize || 16,
    });
    textNode.parentId = frameNode.id;
    textNode.width = item.width;
    textNode.height = item.height;
    if (item.fontFamily) textNode.fontFamily = item.fontFamily;
    if (item.fontWeight) textNode.fontWeight = item.fontWeight;
    childrenNodes.push(textNode);
  }

  const allNodes = [...existingNodes, frameNode, ...childrenNodes];
  const nextDoc = {
    ...currentDoc,
    nodes: allNodes,
  };

  if (typeof editor.setDoc === "function") {
    editor.setDoc(nextDoc, { name: `Import: ${pageData.title}` });
  } else if (typeof editor.setDocument === "function") {
    editor.setDocument(nextDoc, { name: `Import: ${pageData.title}` });
  }

  if (typeof editor.selectExactly === "function") {
    editor.selectExactly([frameNode.id]);
  }

  return {
    success: true,
    count: childrenNodes.length + 1,
    rootId: frameNode.id,
    title: pageData.title,
  };
}
