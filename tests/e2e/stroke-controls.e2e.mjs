import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 400, height: 300, isCanvasRoot: false, backgroundColor: "#ffffff", nodes: [
      { ...createRectNode({ x: 100, y: 100, width: 100, height: 80, fill: "#ffffff", stroke: "#ff0000", strokeWidth: 20 }), id: "stroke-target", name: "Stroke target", strokeAlign: "center" },
    ] });
    e.selectExactly(["stroke-target"]);
  });
  const panel = page.getByTestId("editor-properties-panel");
  await panel.getByText("Stroke target", { exact: true }).waitFor();
  const samples = (format = "png", points = [[85, 140], [95, 140], [105, 140], [115, 140]]) => page.evaluate(async ({ format, points }) => {
    const e = window.__vooEditor;
    let url;
    if (format === "svg") {
      const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
      const markup = documentToSvg(e.getDocument());
      url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    } else url = await e.exportFullResPng();
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const result = points.map(([x, y]) => "#" + [...ctx.getImageData(x, y, 1, 1).data.subarray(0, 3)].map(value => value.toString(16).padStart(2, "0")).join(""));
    if (format === "svg") URL.revokeObjectURL(url);
    return result;
  }, { format, points });

  const positions = [
    ["Inside", "inside", ["#ffffff", "#ffffff", "#ff0000", "#ff0000"]],
    ["Center", "center", ["#ffffff", "#ff0000", "#ff0000", "#ffffff"]],
    ["Outside", "outside", ["#ff0000", "#ff0000", "#ffffff", "#ffffff"]],
  ];
  for (const [label, align, expected] of positions) {
    await panel.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await page.evaluate(() => window.__vooEditor.getNode("stroke-target").strokeAlign), align);
    assert.deepEqual(await samples(), expected);
    assert.deepEqual(await samples("svg"), expected);
  }
  checks.push("actual Inside/Center/Outside buttons change real PNG and SVG border pixels consistently");

  await panel.getByRole("button", { name: "Stroke visibility", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => {
    const n = window.__vooEditor.getNode("stroke-target");
    return { hidden: n.strokeHidden, color: n.stroke, width: n.strokeWidth };
  }), { hidden: true, color: "#ff0000", width: 20 });
  assert.deepEqual(await samples(), Array(4).fill("#ffffff"));
  assert.deepEqual(await samples("svg"), Array(4).fill("#ffffff"));
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual(await samples(), positions[2][2]);
  await page.evaluate(() => window.__vooEditor.redo());
  assert.deepEqual(await samples(), Array(4).fill("#ffffff"));
  checks.push("visibility preserves stored colour/width and one undo/redo restores the same border");

  await page.evaluate(() => window.__vooEditor.updateNode("stroke-target", {
    strokes: [
      { stroke: "#0000ff", strokeWidth: 8, strokeAlign: "inside", visible: true },
      { stroke: "#00ff00", strokeWidth: 20, visible: false },
    ],
  }));
  assert.deepEqual(await samples("png", [[85, 140], [105, 140]]), ["#ffffff", "#0000ff"]);
  assert.deepEqual(await samples("svg", [[85, 140], [105, 140]]), ["#ffffff", "#0000ff"]);
  const pageId = await page.evaluate(() => window.__vooStore.editingNodeId);
  await page.evaluate(async id => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const stage = document.querySelector('[data-testid="editor-pages"]');
    const layout = useDesignStore.getState().editorArtboardLayouts[id] ?? { x: 0, y: 0 };
    useDesignStore.setState({ pendingArtboardFitId: null, editorCamera: { zoom: 1,
      panX: stage.clientWidth / 2 - layout.x - 105, panY: stage.clientHeight / 2 - layout.y - 140 } });
  }, pageId);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const client = await page.evaluate(id => {
    const rect = document.querySelector(`[data-editor-artboard][data-node-id="${id}"]`).getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: Math.floor(rect.left + 105 * rect.width / doc.width), y: Math.floor(rect.top + 140 * rect.height / doc.height) };
  }, pageId);
  const screenshot = await page.screenshot({ clip: { ...client, width: 1, height: 1 } });
  const visible = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const c = document.createElement("canvas"); c.width = c.height = 1;
    const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, screenshot.toString("base64"));
  assert.deepEqual(visible, [0, 0, 255, 255]);
  checks.push("an independent extra stroke remains visible on the actual canvas while its primary is hidden");

  const reopened = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { buildProjectVooFile, openVooProject } = await import("/src/canvas/store/project_io.js");
    const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const store = useDesignStore.getState();
    const id = store.editingNodeId;
    const engines = new Map(Object.entries(window.__vooEditors).map(([key, engine]) => [key, { engine, ready: true }]));
    const { vooFile } = await buildProjectVooFile({ store, enginesRef: { current: engines } });
    window.__strokeBeforeReopen = window.__vooEditor;
    const result = await openVooProject({ store: useDesignStore.getState(), fileOrPath: new File([encodeVooBinary(vooFile)], "Stroke.voo") });
    return { success: result.success, id };
  });
  assert.equal(reopened.success, true);
  await page.waitForFunction(id => window.__vooEditors?.[id] && window.__vooEditors[id] !== window.__strokeBeforeReopen, reopened.id);
  const stored = await page.evaluate(id => {
    const node = window.__vooEditors[id].getNode("stroke-target");
    return { hidden: node.strokeHidden, stroke: node.stroke, width: node.strokeWidth, extras: node.strokes };
  }, reopened.id);
  assert.equal(stored.hidden, true);
  assert.equal(stored.stroke, "#ff0000");
  assert.equal(stored.width, 20);
  assert.equal(stored.extras[0].stroke, "#0000ff");
  assert.deepEqual(await samples("png", [[85, 140], [105, 140]]), ["#ffffff", "#0000ff"]);
  checks.push("real project save/reopen preserves hidden primary and independent extra paint with matching pixels");

  const matrix = await page.evaluate(async () => {
    const { createRectNode, createGroupNode, createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const { drawNode } = await import("/src/canvas/editor/render_node_dispatch.js");
    const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
    const base = { ...createRectNode({ x: 60, y: 60, width: 100, height: 80, fill: "#ffffff", stroke: "#ff0000", strokeWidth: 12 }), strokeAlign: "center" };
    const bitmap = document.createElement("canvas"); bitmap.width = bitmap.height = 20;
    bitmap.getContext("2d").fillStyle = "#ffffff"; bitmap.getContext("2d").fillRect(0, 0, 20, 20);
    const nodes = [
      { ...base, kind: "ellipse" },
      { ...base, kind: "image", fill: "transparent", src: bitmap.toDataURL() },
      { ...createGroupNode({ x: 60, y: 60, width: 100, height: 80 }), isFrame: true, fill: "#ffffff", stroke: "#ff0000", strokeWidth: 12 },
      { ...createTextNode({ x: 60, y: 60, text: "Ab", fontSize: 60, fill: "#000000" }), stroke: "#ff0000", strokeWidth: 6 },
      { ...base, kind: "path", fill: "transparent", points: [[0, 20], [100, 20]], arrow: true, arrowCap: "triangle" },
      { ...base, kind: "path", fill: "transparent", pen: true, strokeWidthProfile: "taperBoth", points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] },
    ];
    const redCount = ctx => {
      const data = ctx.getImageData(0, 0, 240, 200).data;
      let count = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] < 30 && data[i + 2] < 30 && data[i + 3] > 200) count++;
      return count;
    };
    const results = [];
    for (const source of nodes) {
      const counts = [];
      for (const hidden of [false, true]) {
        const node = { ...source, strokeHidden: hidden };
        const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 200;
        const ctx = canvas.getContext("2d"); drawNode(ctx, node, () => bitmap);
        const markup = documentToSvg({ width: 240, height: 200, backgroundColor: "#ffffff", nodes: [node] });
        const image = new Image(); const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" })); image.src = url; await image.decode();
        const exported = document.createElement("canvas"); exported.width = 240; exported.height = 200;
        exported.getContext("2d").drawImage(image, 0, 0); URL.revokeObjectURL(url);
        counts.push({ canvas: redCount(ctx), svg: redCount(exported.getContext("2d")) });
      }
      results.push({ kind: source.kind, counts });
    }
    return results;
  });
  for (const result of matrix) {
    assert.ok(result.counts[0].canvas > 0 && result.counts[0].svg > 0, JSON.stringify(result));
    assert.deepEqual(result.counts[1], { canvas: 0, svg: 0 }, JSON.stringify(result));
  }
  checks.push("ellipse, image, Frame, text, arrowheads and variable-width paths hide their actual Canvas2D and SVG stroke pixels");
  const distant = await page.evaluate(async () => {
    const { drawNode } = await import("/src/canvas/editor/render_node_dispatch.js");
    const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
    const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry_transform.js");
    const node = { id: "distant", kind: "rect", visible: true, x: 80000, y: 90000, width: 100, height: 80,
      fill: "#ffffff", stroke: "#ff0000", strokeWidth: 20, strokeAlign: "outside", rotation: 33, shear: 13 };
    const crop = { x: 79940, y: 89940, width: 240, height: 200 };
    const point = fromNodeLocal(node, { x: -5, y: 40 });
    const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 200;
    const ctx = canvas.getContext("2d"); ctx.translate(-crop.x, -crop.y); drawNode(ctx, node, () => null);
    const rgba = context => [...context.getImageData(Math.floor(point.x - crop.x), Math.floor(point.y - crop.y), 1, 1).data];
    const image = new Image();
    const url = URL.createObjectURL(new Blob([documentToSvg({ width: 240, height: 200, crop, nodes: [node] })], { type: "image/svg+xml" }));
    image.src = url; await image.decode();
    const exported = document.createElement("canvas"); exported.width = 240; exported.height = 200;
    const svgCtx = exported.getContext("2d"); svgCtx.drawImage(image, 0, 0); URL.revokeObjectURL(url);
    return { canvas: rgba(ctx), svg: rgba(svgCtx) };
  });
  assert.deepEqual(distant, { canvas: [255, 0, 0, 255], svg: [255, 0, 0, 255] });
  checks.push("rotated and sheared outside stroke at x=80000 retains matching SVG pixels without fixed world-mask bounds");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
