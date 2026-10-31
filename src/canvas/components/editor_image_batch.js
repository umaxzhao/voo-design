import { insertionTarget } from "../editor/frame-target.js";
import { commitAssetExpansion } from "../agent/agent-asset-transaction.js";

/** Decode before starting history: async I/O must never capture unrelated edits. */
export async function importEditorImageBatch(engine, files, point = null) {
  const selectedIds = engine.getSelectedIds?.() ?? [];
  const entries = [];
  for (const file of files) {
    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name ?? "")) {
      try {
        entries.push({
          kind: "svg",
          prepared: await engine.prepareSvgInsertion(await file.text())
        });
        continue;
      } catch (error) {
        console.warn("SVG vector import failed; trying the image decoder:", error);
      }
    }
    entries.push({
      kind: "image",
      prepared: await engine.prepareImageInsertion(file)
    });
  }
  if (!entries.length) return [];
  return commitAssetExpansion(engine, () => {
    const target = insertionTarget(engine.getDocument(), point, selectedIds);
    const nodes = entries.flatMap(({ kind, prepared }) => {
      if (kind === "svg") {
        return engine.insertPreparedSvg(prepared, target.point, { parentId: target.frame?.id });
      }
      const patch = target.frame ? { parentId: target.frame.id } : {};
      if (target.frame) {
        const width = prepared.bitmap.naturalWidth ?? prepared.bitmap.width;
        const height = prepared.bitmap.naturalHeight ?? prepared.bitmap.height;
        const scale = Math.min(1, target.frame.width * 0.8 / width, target.frame.height * 0.8 / height);
        Object.assign(patch, { width: width * scale, height: height * scale,
          x: target.point.x - width * scale / 2, y: target.point.y - height * scale / 2 });
      }
      return engine.insertPreparedImages([{ prepared, point: target.point, patch }]);
    });
    engine.selectExactly(nodes.map(node => node.id));
    return nodes;
  }, "editor.layer.add");
}

/** Clipboard strings and dropped URLs share file placement and atomic history. */
export function importEditorImageSource(engine, source, { point = null, svg = false } = {}) {
  const image = svg ? new Blob([source], { type: "image/svg+xml" }) : source;
  return importEditorImageBatch(engine, [image], point);
}
