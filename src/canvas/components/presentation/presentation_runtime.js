import { createEditor } from "../../editor/editor_engine.js";
import { isAssetPlaceholder } from "../../editor/asset_unavailable.js";
import { getCanvasType } from "../../editor/canvas-composition-model.js";
import {
  createDocument,
  createImageNode,
} from "../../editor/scene_doc_factory.js";
import { createWorkflowStoreEditorHost } from "../../../shared/editor-host-contract.js";
import { useDesignStore } from "../../../store/design_store.js";
import {
  getPresentationOwner,
  getPresentationPages,
} from "../../presentation/presentation-document.js";

export function readPresentationPage(store, pageId, engines, snapshots) {
  const live = engines?.get(pageId);
  if (live?.ready) return live.engine.serialise();
  const snapshot = snapshots?.get(pageId);
  if (snapshot?.doc) return structuredClone(snapshot.doc);
  const page = store.nodes.find((node) => node.id === pageId);
  if (!page) throw new TypeError("Presentation page is missing");
  if (page.data?.editorDoc) return structuredClone(page.data.editorDoc);
  const owner = getPresentationOwner(store.nodes, pageId);
  const doc = createDocument(
    owner?.data.presentation.width ?? 1920,
    owner?.data.presentation.height ?? 1080,
    "#ffffff",
  );
  if (page.data?.imageId)
    doc.nodes.push(
      createImageNode({
        imageId: page.data.imageId,
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
      }),
    );
  return doc;
}

export function readPresentationDeck(store, ownerId, readPage) {
  const owner = getPresentationOwner(store.nodes, ownerId);
  if (!owner) throw new TypeError("Presentation is missing");
  return {
    ownerId: owner.id,
    title: owner.data.title ?? owner.data.label ?? "",
    width: owner.data.presentation.width,
    height: owner.data.presentation.height,
    pages: getPresentationPages(store.nodes, owner.id).map((page) => ({
      id: page.id,
      title: page.data?.label ?? page.data?.title ?? "",
      notes: page.data?.presentationNotes ?? "",
      doc: readPage(page.id),
    })),
  };
}

async function pngPayload(canvas) {
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Could not encode slide image")),
      "image/png",
    ),
  );
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType: "image/png",
    width: canvas.width,
    height: canvas.height,
  };
}

export async function resolvePresentationImage(imageId) {
  if (!/^(blob:|data:|https?:)/.test(imageId))
    await useDesignStore.getState().hydrateImages([imageId]);
  const src = useDesignStore.getState().images[imageId] ?? imageId;
  if (typeof src !== "string" || !/^(blob:|data:|https?:)/.test(src))
    throw new Error("Presentation image is missing");
  const response = await fetch(src);
  if (!response.ok) throw new Error("Presentation image could not be loaded");
  const image = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return await pngPayload(canvas);
  } finally {
    image.close();
  }
}

/** A detached engine renders snapshots without seeking or saving the user's live pages. */
export async function renderPresentationPage(
  page,
  { resolveCanvas = null } = {},
) {
  if (getCanvasType(page.doc) === "3d") {
    throw new Error("PRESENTATION_3D_UNSUPPORTED");
  }
  const canvas = document.createElement("canvas");
  const stage = document.createElement("div");
  const host = createWorkflowStoreEditorHost(useDesignStore, {
    sourceWorkflowNodeId: page.id,
  });
  const engine = createEditor({ canvas, stage, host, onChange() {} });
  try {
    await engine.open({ savedDoc: page.doc });
    await engine.prepareFrame(0);
    for (const node of engine.getEvaluatedDocument().nodes) {
      if (
        node.visible === false ||
        !["image", "video", "model3d"].includes(node.kind)
      )
        continue;
      // Failed assets stay visible as recovery placeholders in the editor, but
      // exporting those placeholders would silently discard presentation content.
      const bitmap = engine.getNodeBitmap(node);
      if (!bitmap || isAssetPlaceholder(bitmap))
        throw new Error(`Presentation asset could not be rendered: ${node.id}`);
    }
    if (Object.keys(engine.getMediaErrors()).length)
      throw new Error("Presentation media could not be loaded");
    const output = await engine.exportPngCanvasAsync(1, resolveCanvas);
    if (!output) throw new Error("Presentation page could not be rendered");
    return await pngPayload(output);
  } finally {
    engine.dispose();
  }
}
