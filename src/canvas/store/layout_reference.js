import * as db from "./db.js";

const MAX_REFERENCE_LAYERS = 36;
const MAX_REFERENCE_TEXT = 80;
const MAX_REFERENCE_EDGE = 1024;

function finite(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function color(value) {
  if (typeof value === "string") return value;
  return typeof value?.color === "string" ? value.color : null;
}

/** A compact geometry brief gives text-only models the same layout evidence. */
export function summarizeLayoutReference(doc) {
  if (!doc || !Array.isArray(doc.nodes)) return null;
  const layers = doc.nodes
    .filter((layer) => layer?.visible !== false && layer?.kind !== "region")
    .slice(0, MAX_REFERENCE_LAYERS)
    .map((layer) => {
      const details = {
        kind: layer.kind,
        name: layer.name || undefined,
        box: [layer.x, layer.y, layer.width, layer.height].map(finite),
        fill: color(layer.fill) || undefined,
        stroke: color(layer.stroke) || undefined,
      };
      if (layer.kind === "text") {
        details.text = String(layer.text ?? "").slice(0, MAX_REFERENCE_TEXT);
        details.type = {
          family: layer.fontFamily || undefined,
          size: finite(layer.fontSize),
          weight: layer.fontWeight || undefined,
          lineHeight: finite(layer.lineHeight),
          align: layer.textAlign || undefined,
        };
      }
      if (layer.parentId) details.parent = layer.parentId;
      return details;
    });
  if (layers.length === 0) return null;
  return JSON.stringify({
    canvas: [finite(doc.width), finite(doc.height)],
    background: color(doc.backgroundColor),
    layers,
  });
}

function referencePalette(doc) {
  const colors = [
    doc?.backgroundColor,
    ...(doc?.nodes ?? []).flatMap((layer) => [layer.fill, layer.stroke]),
  ]
    .map(color)
    .filter(
      (value) => typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value),
    );
  return [...new Set(colors)]
    .slice(0, 8)
    .map((hex) => ({ role: "参考设计", hex }));
}

function previewFromEngine(engine) {
  const source = engine?.exportPngCanvas?.();
  if (!source) return null;
  const scale = Math.min(
    1,
    MAX_REFERENCE_EDGE / Math.max(source.width, source.height),
  );
  if (scale === 1) return source.toDataURL("image/png");
  const canvas = globalThis.document?.createElement?.("canvas");
  if (!canvas) return null;
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Resolve a named workflow object at request time, before generation mutates it. */
export async function captureLayoutReference(store, nodeId) {
  const node = store.nodes?.find((item) => item.id === nodeId);
  if (!node) throw new Error("layoutReferenceMissing");
  const engine = store.editorBridges?.[nodeId]?.engine;
  const session = store.presentationSession;
  const doc =
    engine?.getDocument?.() ??
    (node.data?.presentationOwnerId &&
    session?.ownerId === node.data.presentationOwnerId
      ? session.getPageDocument?.(nodeId)
      : null) ??
    node.data?.editorDoc;
  const summary = summarizeLayoutReference(doc);
  let image = previewFromEngine(engine);
  if (!image && node.data?.imageId)
    image = await db.getImageDataUrl(node.data.imageId);
  if (!image) {
    const url = node.data?.imageUrl ?? node.data?.url ?? node.data?.src;
    if (typeof url === "string" && /^(data:image\/|https:\/\/)/.test(url)) {
      image = url;
    }
  }
  if (!image && !summary) throw new Error("layoutReferenceUnreadable");
  return { nodeId, summary, image, palette: referencePalette(doc) };
}

export async function captureStoredReferenceImage(imageId) {
  const image = await db.getImageDataUrl(imageId);
  if (!image) throw new Error("layoutReferenceUnreadable");
  return { nodeId: null, summary: null, image, palette: [] };
}
