import { commitAssetExpansion } from "../agent/agent-asset-transaction.js";

/** Decode before starting history: async I/O must never capture unrelated edits. */
export async function importEditorImageBatch(engine, files, point = null) {
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
    const nodes = entries.flatMap(({
      kind,
      prepared
    }) => kind === "svg" ? engine.insertPreparedSvg(prepared, point) : engine.insertPreparedImages([{
      prepared,
      point
    }]));
    engine.selectExactly(nodes.map(node => node.id));
    return nodes;
  }, "editor.layer.add");
}
