import { fillsOf } from "./skia_adapter_paint.js";

/** Frame documents accept legacy scene paints and the editor's fill paints. */
export function frameEditorFills(doc) {
  if (doc.fills?.length) {
    return doc.fills.map((paint) => ({ ...paint, fill: paint.fill ?? paint.color }));
  }
  return [{
    fill: doc.backgroundColor ?? "#ffffff",
    opacity: doc.fillOpacity ?? 1,
    visible: doc.fillHidden !== true,
  }];
}

/** Convert frame paints just like node paints, including hidden/empty fills. */
export function frameSceneFills(doc) {
  return frameEditorFills(doc)
    .filter((paint) => paint.visible !== false)
    .flatMap((paint) => paint.gradient
      ? [{ ...paint, color: paint.fill }]
      : fillsOf({ fill: paint.fill, fillOpacity: paint.opacity }) ?? []);
}
