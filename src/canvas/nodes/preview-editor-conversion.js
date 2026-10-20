import { createDocument } from "../editor/scene_doc_factory.js";
import { createModel3dNode, createVideoNode } from "../editor/scene-media.js";
import { parseHtmlStringToAst } from "../editor/html_import_parser.js";
import { htmlTreeToDocument } from "../editor/html_import_document.js";
import { NODE_TYPE } from "./node_enums.js";
import { isEditablePreviewType } from "./preview-editor-types.js";

const DEFAULT_SCENE_SIZE = Object.freeze({ width: 1080, height: 720 });

export function isEditablePreview(node) {
  return (
    node?.type === NODE_TYPE.PREVIEW &&
    isEditablePreviewType(node.data?.mediaType, node.data)
  );
}

function sourceRecord(data, mediaType) {
  return {
    mediaType,
    assetId: data.assetId ?? data.imageId ?? null,
    url: data.url ?? data.src ?? null,
  };
}

function sceneSize(node) {
  const width = node.width ?? node.style?.width ?? DEFAULT_SCENE_SIZE.width;
  const height = node.height ?? node.style?.height ?? DEFAULT_SCENE_SIZE.height;
  return {
    width:
      Number.isFinite(width) && width > 0 ? width : DEFAULT_SCENE_SIZE.width,
    height:
      Number.isFinite(height) && height > 0
        ? height
        : DEFAULT_SCENE_SIZE.height,
  };
}

function createMediaDocument(node, mediaType, data) {
  if (mediaType === "html") {
    const html = data.html ?? data.srcdoc ?? "";
    const ast = parseHtmlStringToAst(html);
    return htmlTreeToDocument(ast, sceneSize(node)).doc;
  }

  const { width, height } = sceneSize(node);
  const doc = createDocument(width, height);
  const mediaNodeOptions = {
    box: { x: 0, y: 0, width, height },
    assetId: data.assetId ?? data.imageId ?? null,
    src: data.url ?? data.src ?? null,
    name: data.filename || data.title || null,
  };
  const mediaNode =
    mediaType === "video"
      ? createVideoNode(mediaNodeOptions)
      : createModel3dNode({ ...mediaNodeOptions, model: data.model });

  mediaNode.timing ??= { start: 0, end: null };
  doc.nodes = [mediaNode];
  doc.timeline = { duration: 5, fps: 30 };
  return doc;
}

/** Converts a supported Preview node in place; unsupported nodes are returned unchanged. */
export function convertPreviewToEditor(node) {
  if (!isEditablePreview(node) || node.data?.mediaType === "slides")
    return { node, converted: false };

  const mediaType = node.data?.mediaType ?? "image";
  const data = {
    ...node.data,
    ...(mediaType === "image" && !node.data?.imageId
      ? { imageId: node.data?.assetId ?? null }
      : {}),
    editorSource: sourceRecord(node.data ?? {}, mediaType),
  };

  // An existing document is authoritative, including an intentionally empty one.
  if (data.editorDoc == null) {
    if (
      mediaType === "video" ||
      mediaType === "model3d" ||
      mediaType === "html"
    ) {
      data.editorDoc = createMediaDocument(node, mediaType, data);
    }
  }

  return {
    node: { ...node, type: NODE_TYPE.IMAGE_EDITOR, data },
    converted: true,
  };
}
