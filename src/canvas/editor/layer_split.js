/**
 * Image layer decomposition (split layers) into editable editor nodes.
 *
 * Takes a flattened image, queries the visual model (e.g. ChatGPT / GPT-4o)
 * to locate text elements and foreground subjects, then reconstructs the scene:
 *  1. Inpaints the background with local Telea inpainting to remove foreground
 *     clutter (producing a clean "Background" layer).
 *  2. Converts detected texts into native editable TextNodes with positions and styling.
 *  3. Crops and mats foreground visual subjects into independent image layers.
 */
import { createTextNode, createImageNode } from "./scene_model.js";
import { inpaintLocalImage } from "./local_inpaint.js";
import { putImage } from "../store/db.js";
import { dataUrlToBlob } from "../../shared/db_wire.js";
import * as ops from "./doc_ops.js";
import { commitEditorAction } from "../undo-action-contracts.js";

/**
 * Prompt instruction sent to ChatGPT (or vision LLM) to analyze the image
 * and return structured layer coordinates.
 */
export const SPLIT_LAYERS_PROMPT = `Please analyze this image and decompose it into distinct visual layers for a graphic design editor.

Identify:
1. Text layers: For each distinct text block, title, heading or caption, extract:
   - "text": exact text string
   - "fontSize": estimated font size in px (relative to image height)
   - "color": primary font color in hex format (e.g. "#FFFFFF")
   - "box": normalized bounding box [ymin, xmin, ymax, xmax] (integers between 0 and 1000)

2. Foreground visual elements/subjects: For each prominent subject (person, product, main object, badge, graphic element, logo), extract:
   - "label": short descriptive name (e.g. "Person", "Product", "Logo", "Badge")
   - "box": normalized bounding box [ymin, xmin, ymax, xmax] (integers between 0 and 1000)

Format your response STRICTLY as a JSON object inside a \`\`\`json block:
\`\`\`json
{
  "layers": [
    { "type": "text", "text": "Example Heading", "fontSize": 36, "color": "#FFFFFF", "box": [100, 200, 180, 800] },
    { "type": "image", "label": "Subject", "box": [250, 150, 850, 750] }
  ]
}
\`\`\`
Return only the json codeblock with no other conversational text.`;

/**
 * Parses and validates the LLM response into normalized layer objects.
 * Bounding boxes are clamped to [0, 1000].
 */
export function parseLayerSplitResponse(text) {
  if (!text || typeof text !== "string") return [];
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = codeBlockMatch ? codeBlockMatch[1] : text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.layers)) return [];

    return parsed.layers
      .map((layer) => {
        if (!layer || typeof layer !== "object") return null;
        if (!Array.isArray(layer.box) || layer.box.length !== 4) return null;

        let [ymin, xmin, ymax, xmax] = layer.box.map((v) => Number(v) || 0);
        ymin = Math.max(0, Math.min(1000, ymin));
        xmin = Math.max(0, Math.min(1000, xmin));
        ymax = Math.max(ymin + 1, Math.min(1000, ymax));
        xmax = Math.max(xmin + 1, Math.min(1000, xmax));

        if (layer.type === "text") {
          const textContent = String(layer.text ?? "").trim();
          if (!textContent) return null;
          return {
            type: "text",
            text: textContent,
            fontSize: Number(layer.fontSize) || 0,
            color: typeof layer.color === "string" ? layer.color : "#ffffff",
            box: [ymin, xmin, ymax, xmax],
          };
        }

        if (layer.type === "image") {
          return {
            type: "image",
            label: String(layer.label ?? "Element").trim() || "Element",
            box: [ymin, xmin, ymax, xmax],
          };
        }

        return null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Decomposes an existing image node in the editor into multiple layers.
 */
export async function decomposeImageToLayers({
  engine,
  node,
  layers,
  bitmap = null,
}) {
  if (!engine || !node || !Array.isArray(layers) || layers.length === 0) {
    return { ok: false, count: 0 };
  }

  // Resolve source bitmap
  let bmp = bitmap || engine.getBitmap?.(node) || engine.cache?.get?.(node);
  if (!bmp && node.src) {
    try {
      const { decodeImageSource } = await import("./bitmap_cache.js");
      bmp = await decodeImageSource(node.src);
    } catch {
      // Ignore
    }
  }
  if (!bmp) {
    return { ok: false, error: "bitmapMissing" };
  }

  const bmpW = bmp.naturalWidth ?? bmp.width;
  const bmpH = bmp.naturalHeight ?? bmp.height;
  if (!bmpW || !bmpH) return { ok: false, error: "invalidDimensions" };

  // Prepare source canvas
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = bmpW;
  sourceCanvas.height = bmpH;
  const srcCtx = sourceCanvas.getContext("2d");
  if (!srcCtx) return { ok: false, error: "canvasError" };
  srcCtx.drawImage(bmp, 0, 0);

  // Prepare mask canvas for inpainting background
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = bmpW;
  maskCanvas.height = bmpH;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return { ok: false, error: "canvasError" };
  maskCtx.clearRect(0, 0, bmpW, bmpH);
  maskCtx.fillStyle = "#ffffff";

  const createdNodes = [];
  const pad = 4; // Margin around boxes for inpainting

  for (const layer of layers) {
    const [ymin, xmin, ymax, xmax] = layer.box;
    const docX = Math.round(node.x + (xmin / 1000) * node.width);
    const docY = Math.round(node.y + (ymin / 1000) * node.height);
    const docW = Math.max(4, Math.round(((xmax - xmin) / 1000) * node.width));
    const docH = Math.max(4, Math.round(((ymax - ymin) / 1000) * node.height));

    const pxX = Math.max(0, Math.round((xmin / 1000) * bmpW));
    const pxY = Math.max(0, Math.round((ymin / 1000) * bmpH));
    const pxW = Math.min(
      bmpW - pxX,
      Math.max(1, Math.round(((xmax - xmin) / 1000) * bmpW)),
    );
    const pxH = Math.min(
      bmpH - pxY,
      Math.max(1, Math.round(((ymax - ymin) / 1000) * bmpH)),
    );

    // Mark mask canvas for background inpainting
    const mX = Math.max(0, pxX - pad);
    const mY = Math.max(0, pxY - pad);
    const mW = Math.min(bmpW - mX, pxW + pad * 2);
    const mH = Math.min(bmpH - mY, pxH + pad * 2);
    maskCtx.fillRect(mX, mY, mW, mH);

    if (layer.type === "text") {
      const scale = node.height / bmpH;
      const calculatedFontSize = Math.round(
        layer.fontSize > 0 ? layer.fontSize * scale : Math.max(14, docH * 0.75),
      );
      const textNode = createTextNode({
        x: docX,
        y: docY,
        text: layer.text,
        fill: layer.color || "#ffffff",
        fontSize: calculatedFontSize,
      });
      textNode.boxWidth = docW;
      createdNodes.push(textNode);
    } else if (layer.type === "image") {
      const elemCanvas = document.createElement("canvas");
      elemCanvas.width = pxW;
      elemCanvas.height = pxH;
      const elemCtx = elemCanvas.getContext("2d");
      if (elemCtx) {
        elemCtx.drawImage(sourceCanvas, pxX, pxY, pxW, pxH, 0, 0, pxW, pxH);
        const elemDataUrl = elemCanvas.toDataURL("image/png");
        let imageId = null;
        try {
          const blob = dataUrlToBlob(elemDataUrl);
          imageId = `img-${crypto.randomUUID()}`;
          await putImage(imageId, blob);
          if (engine.cache?.put) {
            try {
              const { decodeImageSource } = await import("./bitmap_cache.js");
              const bmp = await decodeImageSource(elemDataUrl);
              if (bmp) {
                engine.cache.put({ imageId }, bmp);
              }
            } catch {
              // Cache decode is non-critical
            }
          }
        } catch {
          // If storage fails, fall back to inline src
        }

        const imgNode = createImageNode({
          x: docX,
          y: docY,
          width: docW,
          height: docH,
          imageId: imageId || null,
          src: imageId ? null : elemDataUrl,
          name: layer.label || "Subject",
        });
        createdNodes.push(imgNode);
      }
    }
  }

  // 1. Inpaint the background using local Telea algorithm
  let healedBgDataUrl = null;
  try {
    healedBgDataUrl = inpaintLocalImage(sourceCanvas, maskCanvas, 8);
  } catch (err) {
    console.warn("Background inpainting failed during layer split:", err);
  }

  // 2. Prepare background update
  const bgPatch = { name: "Background" };
  if (healedBgDataUrl) {
    try {
      const bgBlob = dataUrlToBlob(healedBgDataUrl);
      const bgImageId = `img-${crypto.randomUUID()}`;
      await putImage(bgImageId, bgBlob);
      bgPatch.imageId = bgImageId;
      bgPatch.src = null;
      if (engine.cache?.put) {
        try {
          const { decodeImageSource } = await import("./bitmap_cache.js");
          const bgBmp = await decodeImageSource(healedBgDataUrl);
          if (bgBmp) {
            engine.cache.put({ imageId: bgImageId }, bgBmp);
          }
        } catch {
          // Cache decode is non-critical
        }
      }
    } catch {
      bgPatch.src = healedBgDataUrl;
    }
  }

  // 3. Atomically commit both background update and new layers in a single undo step
  let currentDoc = engine.getDocument();
  currentDoc = ops.updateNode(currentDoc, node.id, bgPatch);
  for (const newNode of createdNodes) {
    currentDoc = ops.addNode(currentDoc, newNode);
  }
  commitEditorAction("editor.layer.split", () =>
    engine.setDoc(currentDoc, { name: "editor.history.entry.splitLayers" }),
  );
  if (engine.selectExactly && createdNodes.length > 0) {
    engine.selectExactly(createdNodes.map((n) => n.id));
  }
  engine.requestRender?.();
  engine.notify?.();

  return {
    ok: true,
    count: createdNodes.length,
    textCount: createdNodes.filter((n) => n.kind === "text").length,
    imageCount: createdNodes.filter((n) => n.kind === "image").length,
  };
}
