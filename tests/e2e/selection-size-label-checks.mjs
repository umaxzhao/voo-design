import assert from "node:assert/strict";

/** Sample actual stage chrome; artwork and exported pixels must stay unchanged. */
export async function checkSelectionSizeLabels(page) {
  const settle = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), isCanvasRoot: true, nodes: [
      { id: "size-frame", kind: "group", isFrame: true, frame: true, name: "Size placement",
        x: 50, y: 50, width: 520, height: 400, fill: "#eeeeee", visible: true, opacity: 1 },
      { id: "size-child", kind: "rect", parentId: "size-frame", x: 200, y: 160,
        width: 137, height: 83, fill: "#ff0000", visible: true, opacity: 1 },
      { id: "size-sibling", kind: "rect", parentId: "size-frame", x: 360, y: 170,
        width: 90, height: 30, fill: "#0000ff", visible: true, opacity: 1 },
    ] });
    e.setTool("select"); e.selectExactly([]);
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 400, panY: 300 }, pendingArtboardFitId: null });
  });
  await settle();
  const point = await page.evaluate(() => {
    const e = window.__vooEditor, zero = e.toDocPoint(0, 0), zoom = e.getViewport().zoom;
    return { x: (230 - zero.x) * zoom, y: (190 - zero.y) * zoom };
  });
  await page.mouse.click(point.x, point.y);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["size-child"]);

  for (const scenario of [
    { zoom: 0.5, rotation: 0, ids: ["size-child"] },
    { zoom: 1, rotation: 0, ids: ["size-child"] },
    { zoom: 2, rotation: 0, ids: ["size-child"] },
    { zoom: 1, rotation: 30, ids: ["size-child"] },
    { zoom: 1, rotation: 0, ids: ["size-frame"] },
    { zoom: 1, rotation: 0, ids: ["size-child", "size-sibling"] },
  ]) {
    const sample = await page.evaluate(async ({ zoom, rotation, ids }) => {
      const { nodeAABB, combinedBounds } = await import("/src/canvas/editor/scene_geometry.js");
      const { SELECTION_COLOR } = await import("/src/canvas/editor/render_nodes.js");
      const { useDesignStore } = await import("/src/store/design_store.js");
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), nodes: e.getDocument().nodes.map(node =>
        node.id === "size-child" ? { ...node, rotation } : node) });
      e.selectExactly(ids);
      useDesignStore.setState({ editorCamera: { zoom, panX: 400, panY: 300 }, pendingArtboardFitId: null });
      const nodes = ids.map(id => e.getNode(id));
      const box = nodes.length === 1 ? nodeAABB(nodes[0]) : combinedBounds(nodes);
      return { box, color: SELECTION_COLOR, document: JSON.stringify(e.getDocument()) };
    }, scenario);
    await settle();
    const points = await page.evaluate(box => {
      const e = window.__vooEditor, zero = e.toDocPoint(0, 0), zoom = e.getViewport().zoom;
      const x = (box.x + box.width / 2 - zero.x) * zoom;
      return { below: { x, y: (box.y + box.height - zero.y) * zoom + 8 },
        above: { x, y: (box.y - zero.y) * zoom - 22 } };
    }, sample.box);
    const image = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;
    const pixels = await page.evaluate(async ({ image, points }) => {
      const source = new Image(); source.src = image; await source.decode();
      const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(source, 0, 0);
      return Object.fromEntries(Object.entries(points).map(([name, p]) =>
        [name, [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data].slice(0, 3)]));
    }, { image, points });
    const expected = sample.color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
    if (scenario.ids.length === 1) {
      assert.deepEqual(pixels.below, expected, `Visible size chip below ${JSON.stringify(scenario)}`);
    } else {
      // Multiple selection has handles but no size chip; retain that existing policy.
      assert.notDeepEqual(pixels.below, expected, "No new multi-selection badge");
    }
    assert.notDeepEqual(pixels.above, expected, "The old upper badge must be absent");
    assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument())), sample.document);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), scenario.ids);
  }
  console.log("Size labels: actual lower chrome pixels at 0.5/1/2x, rotation and Frame; existing multi-selection chrome, artwork and selection unchanged.");
}
