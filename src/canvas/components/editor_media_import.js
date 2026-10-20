import { carryImagePublication } from "../store/image-publication-bindings.js";
import {
  consumeImagePublication,
  settleImagePublication,
} from "../store/image-publication.js";
import { applySceneOperations } from "../editor/scene-composition-operations.js";
import { DEFAULT_OBJECT_EDGE } from "../editor/object3d_master.js";
import { t } from "../../shared/i18n.js";

export function editorMediaFileKind(file) {
  if (
    file?.type?.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v)$/i.test(file?.name ?? "")
  )
    return "video";
  if (
    file?.type?.startsWith("audio/") ||
    /\.(mp3|wav|m4a|ogg|oga)$/i.test(file?.name ?? "")
  )
    return "audio";
  if (
    /\.(glb|obj)$/i.test(file?.name ?? "") ||
    file?.type === "model/gltf-binary"
  )
    return "model3d";
  return null;
}

/**
 * Ingest the file and build the media layer without touching the document, so
 * a caller can place it elsewhere (a dropped model becomes a 3D frame).
 */
export async function createEditorMediaNode(engine, file, store, options = {}) {
  const kind = editorMediaFileKind(file);
  if (!kind || !engine) throw new TypeError(t("editor.media.unsupportedFile"));
  const source = await store.ingestEditorMediaFile(file);
  try {
    if (!source?.assetId || !source.src)
      throw new Error(t("editor.media.importFailed"));
    const doc = engine.getDocument();
    const layerId = crypto.randomUUID();
    const properties = { name: file.name, ...options.properties };
    if (kind === "model3d") {
      const edge = Math.min(
        DEFAULT_OBJECT_EDGE,
        Math.max(1, (doc.width || 800) * 0.5),
        Math.max(1, (doc.height || 600) * 0.5),
      );
      const width = options.width ?? edge;
      const height = options.height ?? edge;
      let center = options.point;
      if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) {
        center = engine.getViewportCenter?.() ?? null;
        if (
          !center ||
          !Number.isFinite(center.x) ||
          !Number.isFinite(center.y)
        ) {
          center = { x: (doc.width || 800) / 2, y: (doc.height || 600) / 2 };
        }
      }
      properties.width = width;
      properties.height = height;
      properties.x = Math.round(center.x - width / 2);
      properties.y = Math.round(center.y - height / 2);
    }
    const next = applySceneOperations(doc, [
      {
        type: "insert_media",
        layerId,
        kind,
        ...source,
        properties,
      },
    ]);
    const node = next.nodes.find((entry) => entry.id === layerId);
    return carryImagePublication(source, { kind, layerId, doc: next, node });
  } catch (error) {
    await settleImagePublication(source);
    throw error;
  }
}

/** Asset persistence belongs to the host; document insertion belongs to editor undo. */
export async function importEditorMediaFile(engine, file, store, options = {}) {
  const result = await createEditorMediaNode(engine, file, store, options);
  const { kind, layerId, doc: next } = result;
  await consumeImagePublication(result, engine, () => {
    engine.setDoc(next, { commit: false });
    return true;
  });
  engine.selectExactly([layerId]);
  try {
    await engine.prepareFrame(engine.getPlaybackState().time);
  } catch {
    // If runtime frame preparation fails, proceed with the staged document.
  }
  let finalDoc = engine.getDocument() ?? next;
  // Sound and footage both outlive a short composition by default, so both
  // stretch it rather than arrive clipped.
  if (kind === "video" || kind === "audio") {
    const duration = engine.getMediaPlaybackMetadata?.(layerId)?.duration;
    if (
      Number.isFinite(duration) &&
      duration > (finalDoc.timeline?.duration ?? 5)
    ) {
      finalDoc = {
        ...finalDoc,
        timeline: { ...finalDoc.timeline, duration },
      };
    }
  }
  engine.setDoc(finalDoc, { name: t("editor.media.import") });
  return layerId;
}
