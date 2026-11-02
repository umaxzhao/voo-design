import { putImage, deleteImage } from "../canvas/store/db.js";
import { createEditorGeneratedOutput, EDITOR_SCENE_PATCH } from "../canvas/editor/editor_generated_output.js";
import { FREE_GUTTER, gridArtboardLayouts } from "../canvas/components/image_editor_helpers.js";
import { t } from "../shared/i18n.js";

const LABEL_KEYS = Object.freeze({
  aiRepair: "editor.tool.healing",
  aiRepaint: "editor.taskbar.repaint",
  outpaint: "editor.taskbar.outpaint",
  upscale: "editor.taskbar.upscale",
});

const clone = value => JSON.parse(JSON.stringify(value));

function sourceDocument(state, sourceId) {
  const page = state.nodes.find(node => node.id === sourceId);
  return state.editorPageDocumentReader?.(sourceId) ?? page?.data?.editorDoc ?? page?.data?.sceneDoc;
}

function assertSourceImage(state, result) {
  const source = sourceDocument(state, result.sourceWorkflowNodeId);
  const expected = result.sourceSnapshot.nodes.find(node => node.id === result.sourceSceneNodeId);
  const current = source?.nodes?.find(node => node.id === result.sourceSceneNodeId);
  if (!current || current.kind !== "image" || current.imageId !== expected?.imageId) {
    throw new Error("Generated output source image changed");
  }
}

function prepareOutput(result) {
  if (result?.asset?.mediaKind !== "image" || !/^data:image\//i.test(result.asset.dataUrl ?? "")) {
    throw new Error("Generated output must contain an image data URL");
  }
  const output = createEditorGeneratedOutput({ ...result, dataUrl: result.asset.dataUrl });
  const document = clone(output.sourceSnapshot);
  if (!Array.isArray(document.nodes) || !Number.isFinite(document.width) ||
    !Number.isFinite(document.height) || document.width <= 0 || document.height <= 0) {
    throw new Error("Generated output source snapshot is invalid");
  }
  const target = document.nodes.find(node => node.id === output.sourceSceneNodeId);
  if (!target || target.kind !== "image") throw new Error("Generated output source image is missing");
  return { output, document, target };
}

function expandClippingAncestors(document, target, rect) {
  const byId = new Map(document.nodes.map(node => [node.id, node]));
  const seen = new Set([target.id]);
  let parentId = target.parentId;
  while (parentId) {
    if (seen.has(parentId)) throw new Error("Outpaint source hierarchy is cyclic");
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) throw new Error("Outpaint source parent is missing");
    if (parent.clipContent !== false && (parent.isFrame || parent.frame || parent.containerType === "frame" || parent.clipContent)) {
      if (parent.rotation || parent.shear || parent.flipH || parent.flipV) {
        throw new Error("Outpaint does not support transformed clipping frames");
      }
      const right = Math.max(parent.x + parent.width, rect.x + rect.width);
      const bottom = Math.max(parent.y + parent.height, rect.y + rect.height);
      parent.x = Math.min(parent.x, rect.x);
      parent.y = Math.min(parent.y, rect.y);
      parent.width = right - parent.x;
      parent.height = bottom - parent.y;
    }
    parentId = parent.parentId;
  }
}

function applyOutpaint(document, target, patch) {
  const { documentGrowth: growth, nodeRect } = patch;
  if (growth.width < document.width || growth.height < document.height ||
    nodeRect.x < 0 || nodeRect.y < 0 ||
    nodeRect.x + nodeRect.width > growth.width || nodeRect.y + nodeRect.height > growth.height) {
    throw new Error("Outpaint geometry does not fit the expanded document");
  }
  for (const node of document.nodes) {
    if (Number.isFinite(node.x)) node.x += growth.shiftX;
    if (Number.isFinite(node.y)) node.y += growth.shiftY;
  }
  for (const guide of document.guides ?? []) {
    if (Number.isFinite(guide.pos)) guide.pos += guide.type === "v" ? growth.shiftX : growth.shiftY;
  }
  if (document.crop) {
    throw new Error("Outpaint does not support a cropped source document");
  }
  document.width = growth.width;
  document.height = growth.height;
  Object.assign(target, nodeRect);
  if (target.baseWidth !== undefined) target.baseWidth = nodeRect.width;
  if (target.baseHeight !== undefined) target.baseHeight = nodeRect.height;
  expandClippingAncestors(document, target, nodeRect);
}

function layoutForCandidate(state, sourceId, document) {
  const saved = state.editorArtboardLayouts instanceof Map
    ? Object.fromEntries(state.editorArtboardLayouts) : state.editorArtboardLayouts ?? {};
  const automatic = gridArtboardLayouts(state.nodes.map(page => ({ nodeId: page.id,
    width: sourceDocument(state, page.id)?.width ?? document.width,
    height: sourceDocument(state, page.id)?.height ?? document.height,
  })));
  const layouts = automatic.map(layout => ({ ...layout, ...saved[layout.nodeId], width: layout.width, height: layout.height }));
  const source = layouts.find(layout => layout.nodeId === sourceId);
  if (!source) throw new Error("Generated output source page is missing");
  const candidate = { x: source.x + source.width + FREE_GUTTER, y: source.y,
    width: document.width, height: document.height };
  // Repeated candidates stay to the source's right without covering a page.
  for (let pass = 0; pass <= layouts.length; pass += 1) {
    const collision = layouts.find(layout => candidate.x < layout.x + layout.width + FREE_GUTTER &&
      candidate.x + candidate.width + FREE_GUTTER > layout.x &&
      candidate.y < layout.y + layout.height && candidate.y + candidate.height > layout.y);
    if (!collision) return { saved, candidate };
    candidate.x = collision.x + collision.width + FREE_GUTTER;
  }
  throw new Error("Generated output page could not be positioned");
}

/** Publish one fully persisted candidate; never modify the source page. */
export async function materializeGeneratedOutput({ result, context, get, set, assertCurrent }) {
  const { output, document, target } = prepareOutput(result);
  assertCurrent();
  assertSourceImage(get(), output);
  if (output.scenePatch.type === EDITOR_SCENE_PATCH.OUTPAINT_BITMAP) {
    applyOutpaint(document, target, output.scenePatch);
  }
  const token = crypto.randomUUID();
  const candidateNodeId = `page-generated-${token}`;
  const imageId = `image-generated-${token}`;
  const provenance = { operation: output.operation, parameters: clone(output.parameters),
    sourceWorkflowNodeId: output.sourceWorkflowNodeId, sourceSceneNodeId: output.sourceSceneNodeId,
    sourceDocumentId: context.documentId, imageId };
  target.imageId = imageId;
  delete target.src;
  delete target.url;
  delete target.dataUrl;
  target.generatedOutput = provenance;
  document.canvasId = candidateNodeId;
  if (document.id !== undefined) document.id = candidateNodeId;
  let written = false;
  try {
    if (await putImage(imageId, output.asset.dataUrl) === false) throw new Error("Generated image could not be persisted");
    written = true;
    assertCurrent();
    assertSourceImage(get(), output);
    set(state => {
      assertCurrent();
      const source = state.nodes.find(node => node.id === output.sourceWorkflowNodeId);
      const { saved, candidate } = layoutForCandidate(state, source.id, document);
      const page = { id: candidateNodeId, type: "imageEditor", position: { x: 0, y: 0 },
        data: { label: [source.data?.label, t(LABEL_KEYS[output.operation])].filter(Boolean).join(" · "),
          canvasType: source.data?.canvasType ?? document.canvasType ?? "design",
          editorDoc: document, generatedOutput: provenance } };
      return { nodes: [...state.nodes, page], images: { ...state.images, [imageId]: output.asset.dataUrl },
        editorArtboardLayouts: { ...saved, [candidateNodeId]: candidate }, isDirty: true };
    });
    return { candidateNodeId, imageId, operation: output.operation };
  } catch (error) {
    if (written && await deleteImage(imageId) === false) {
      throw new AggregateError([error, new Error("Generated image cleanup failed")]);
    }
    throw error;
  }
}
