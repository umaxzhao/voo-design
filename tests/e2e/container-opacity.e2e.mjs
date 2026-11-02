import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const WHITE = [255, 255, 255, 255], PINK = [255, 127, 127, 255];
const LIGHT_BLUE = [127, 127, 255, 255], QUARTER_RED = [255, 191, 191, 255];
const group = (id = "group", patch = {}) => ({ id, kind: "group", visible: true,
  isFrame: false, x: 40, y: 40, width: 260, height: 180, fill: "transparent", opacity: 0.5, ...patch });
const rect = (id, patch = {}) => ({ id, kind: "rect", visible: true, parentId: "group",
  x: 80, y: 80, width: 100, height: 100, fill: "#ff0000", strokeWidth: 0, ...patch });

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const assertPixel = (actual, expected, label) => actual.forEach((value, channel) =>
    assert.ok(Math.abs(value - expected[channel]) <= 1, `${label}/${channel}: ${value} != ${expected[channel]}`));
  await page.evaluate(() => {
    window.__opacityProbe = async (nodes, points, selection = null, backdropColor = "#ffffff") => {
      const e = window.__vooEditor;
      const { renderEngineSvg } = await import("/src/canvas/components/editor_hooks/export_editor_image.js");
      e.setDoc({ ...e.getDocument(), width: 400, height: 300, isCanvasRoot: true,
        crop: { x: 0, y: 0, width: 400, height: 300 }, backgroundColor: "transparent", nodes: [
          { id: "backdrop", kind: "rect", visible: true, x: 0, y: 0, width: 400, height: 300, fill: backdropColor }, ...nodes] });
      const read = async (url, origin = { x: 0, y: 0 }) => {
        const image = new Image(); image.src = url; await image.decode();
        const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
        const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
        return points.map(([x, y]) => [...ctx.getImageData(x - origin.x, y - origin.y, 1, 1).data]);
      };
      let png, svg, origin = { x: 0, y: 0 };
      if (selection) {
        const result = e.exportSelectionPng([selection]); png = result.dataUrl; origin = result.bounds;
        svg = e.getNodeSvg(selection);
      } else { png = await e.exportFullResPng(); svg = renderEngineSvg(e); }
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try { return { png: await read(png, origin), svg: await read(url, origin) }; }
      finally { URL.revokeObjectURL(url); }
    };
  });
  const check = async (label, nodes, points, expected, selection, backdropColor = "#ffffff") => {
    const results = await page.evaluate(({ nodes, points, selection, backdropColor }) => window.__opacityProbe(nodes, points, selection, backdropColor), { nodes, points, selection, backdropColor });
    for (const [kind, pixels] of Object.entries(results)) {
      pixels.forEach((pixel, index) => pixel.forEach((value, channel) => assert.ok(
        Math.abs(value - expected[index][channel]) <= 1, `${label}/${kind}/${index}/${channel}: ${value} != ${expected[index][channel]}`)));
    }
    checks.push(label);
  };
  await check("ordinary Group composites overlapping children once instead of multiplying alpha per child",
    [group(), rect("a"), rect("b", { x: 130 })], [[100, 120], [150, 120], [220, 120]], [PINK, PINK, PINK]);
  const blended = {
    "source-over": [[192, 64, 64, 255], [64, 64, 192, 255]],
    multiply: [[128, 64, 64, 255], [64, 64, 128, 255]],
    screen: [[192, 128, 128, 255], [128, 128, 192, 255]],
  };
  for (const [blendMode, expected] of Object.entries(blended)) {
    await check(`isolated Group ${blendMode} blends its completed children against the outer backdrop`,
      [group("group", { blendMode }), rect("a"), rect("b", { x: 130, fill: "#0000ff" })],
      [[100, 120], [150, 120]], expected, null, "#808080");
  }
  await check("isolated Frame blend is not applied again to its internal body",
    [rect("a"), group("group", { isFrame: true, fill: "#0000ff", blendMode: "multiply" })],
    [[100, 120]], [[64, 64, 128, 255]], null, "#808080");
  await check("Frame own fill and children share one final opacity",
    [group("group", { isFrame: true, fill: "#0000ff" }), rect("a")], [[100, 120], [250, 120]], [PINK, LIGHT_BLUE]);
  await check("nested Group and Frame isolation multiply the completed layers",
    [group(), group("inner", { isFrame: true, parentId: "group" }), rect("a", { parentId: "inner" })],
    [[100, 120]], [QUARTER_RED]);
  await check("zero opacity suppresses the entire subtree",
    [group("group", { isFrame: true, opacity: 0, fill: "#0000ff" }), rect("a")], [[100, 120], [250, 120]], [WHITE, WHITE]);
  await check("opaque Frame retains the existing child-before-parent paint order",
    [rect("a"), group("group", { isFrame: true, opacity: 1, fill: "#0000ff" })], [[100, 120]], [[0, 0, 255, 255]]);
  await check("an interleaved isolated subtree occupies its first member slot",
    [group(), rect("a"), rect("sibling", { parentId: null, fill: "#0000ff" }), rect("b")], [[100, 120]], [[0, 0, 255, 255]]);
  await check("rounded Frame clips its subtree before applying final alpha",
    [group("group", { isFrame: true, cornerRadius: 40 }), rect("a", { x: 0, y: 0, width: 400, height: 300 })],
    [[43, 43], [100, 120], [320, 120]], [WHITE, PINK, WHITE]);
  await check("clipping-mask alpha remains internal to the isolated Frame",
    [group("group", { isFrame: true }), rect("mask", { fill: "#ffffff", opacity: 0.5, maskBase: true }),
      rect("a", { clipTo: "mask" })], [[100, 120], [250, 120]], [QUARTER_RED, WHITE]);
  await check("a cross-container clipping mask inherits its own Group alpha once",
    [group(), rect("mask", { fill: "#ffffff", maskBase: true }), rect("a", { parentId: null, clipTo: "mask" })],
    [[100, 120]], [PINK]);
  await check("cross-container mask and painted subtree each contribute isolated alpha",
    [group(), rect("mask", { fill: "#ffffff", maskBase: true }), group("painted"),
      rect("a", { parentId: "painted", clipTo: "mask" })], [[100, 120]], [QUARTER_RED]);
  await check("selected Frame PNG and SVG keep isolated alpha on transparent pixels",
    [group("group", { isFrame: true }), rect("a"), rect("b", { x: 130 })],
    [[100, 120], [150, 120]], [[255, 0, 0, 128], [255, 0, 0, 128]], "group");

  await page.evaluate(async () => {
    await window.__opacityProbe([
      { id: "frame", kind: "group", isFrame: true, visible: true, x: 40, y: 40,
        width: 260, height: 180, opacity: 1, fill: "#0000ff" },
      { id: "child", kind: "rect", parentId: "frame", visible: true, x: 80, y: 80, width: 100, height: 100, fill: "#ff0000" },
    ], [[100, 120]]);
    window.__vooEditor.selectExactly(["frame"]);
  });
  const opacity = page.getByTestId("editor-properties-panel").getByRole("spinbutton", { name: "Opacity", exact: true });
  await opacity.fill("50"); await opacity.press("Enter");
  await page.waitForFunction(() => window.__vooEditor.getNode("frame").opacity === 0.5);
  const currentPixels = () => page.evaluate(async () => {
    const e = window.__vooEditor, image = new Image(); image.src = await e.exportFullResPng(); await image.decode();
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(100, 120, 1, 1).data];
  });
  assertPixel(await currentPixels(), PINK, "completed group alpha");
  await tool("undo"); assert.deepEqual(await currentPixels(), [255, 0, 0, 255]);
  await tool("redo"); assertPixel(await currentPixels(), PINK, "redo group alpha");
  checks.push("actual inspector opacity edits affect children and one undo/redo restores completed group pixels");

  const reopened = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { buildProjectVooFile, openVooProject } = await import("/src/canvas/store/project_io.js");
    const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const store = useDesignStore.getState(), id = store.editingNodeId;
    const engines = new Map(Object.entries(window.__vooEditors).map(([key, engine]) => [key, { engine, ready: true }]));
    const { vooFile } = await buildProjectVooFile({ store, enginesRef: { current: engines } });
    window.__beforeOpacityReopen = window.__vooEditor;
    const result = await openVooProject({ store: useDesignStore.getState(), fileOrPath: new File([encodeVooBinary(vooFile)], "Opacity.voo") });
    return { success: result.success, id };
  });
  assert.equal(reopened.success, true);
  await page.waitForFunction(id => window.__vooEditors?.[id] && window.__vooEditors[id] !== window.__beforeOpacityReopen, reopened.id);
  assertPixel(await currentPixels(), PINK, "completed group alpha");
  checks.push("real project save/reopen preserves container opacity and composited pixels");
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  const screenPixels = [];
  for (const [zoom, offset] of [[0.5, 0], [2, 0], [2, 40]]) {
    await page.evaluate(async ({ zoom, offset }) => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const id = useDesignStore.getState().editingNodeId;
      const stage = document.querySelector('[data-testid="editor-pages"]');
      const layout = useDesignStore.getState().editorArtboardLayouts[id] ?? { x: 0, y: 0 };
      useDesignStore.setState({ pendingArtboardFitId: null, editorCamera: { zoom,
        panX: stage.clientWidth / 2 - (layout.x + 100) * zoom + offset,
        panY: stage.clientHeight / 2 - (layout.y + 120) * zoom } });
    }, { zoom, offset });
    await page.waitForFunction(zoom => {
      const id = window.__vooStore.editingNodeId;
      const bounds = document.querySelector(`[data-editor-artboard][data-node-id="${id}"]`).getBoundingClientRect();
      return Math.abs(bounds.width - 400 * zoom) < 0.1;
    }, zoom);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const point = await page.evaluate(() => {
      const id = window.__vooStore.editingNodeId;
      const bounds = document.querySelector(`[data-editor-artboard][data-node-id="${id}"]`).getBoundingClientRect();
      return { x: Math.floor(bounds.left + 100 * bounds.width / 400), y: Math.floor(bounds.top + 120 * bounds.height / 300) };
    });
    const bytes = await page.screenshot({ clip: { ...point, width: 1, height: 1 } });
    const pixel = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, bytes.toString("base64"));
    assertPixel(pixel, PINK, `visible stage zoom ${zoom} pan ${offset}`);
    screenPixels.push({ point, pixel });
  }
  assert.ok(Math.abs(screenPixels[2].point.x - screenPixels[1].point.x - 40) <= 1);
  checks.push("actual stage pixels preserve isolated alpha across shared-camera zoom and pan");
  const adjustment = await page.evaluate(async nodes => window.__opacityProbe(nodes,
    [[100, 120], [250, 120]]), [group(), rect("a", { opacity: 0.5 }),
    rect("tone", { kind: "adjustment", adjustments: { brightness: { enabled: true, value: -100 } } })]);
  assertPixel(adjustment.png[0], [191, 191, 191, 255], "isolated adjustment preserves leaf alpha");
  assertPixel(adjustment.png[1], WHITE, "isolated adjustment excludes external backdrop");
  checks.push("isolated PNG adjustments preserve existing leaf alpha and do not import external backdrop pixels");
  for (const [blendMode, expected] of [["linear-burn", [128, 64, 64, 255]],
    ["linear-dodge", [192, 128, 128, 255]], ["subtract", [64, 128, 128, 255]]]) {
    const result = await page.evaluate(async ({ nodes, mode }) => {
      let svgError;
      try { await window.__opacityProbe(nodes, [[100, 120]], null, "#808080"); }
      catch (error) { svgError = error.message; }
      const image = new Image(); image.src = await window.__vooEditor.exportFullResPng(); await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      return { pixel: [...ctx.getImageData(100, 120, 1, 1).data], svgError, mode };
    }, { nodes: [group("group", { blendMode }), rect("a")], mode: blendMode });
    assertPixel(result.pixel, expected, `custom isolated ${blendMode}`);
    assert.equal(result.svgError, `svg-unsupported-isolated-blend:${blendMode}`);
  }
  checks.push("PSD-only isolated blend math keeps PNG pixels while SVG explicitly rejects unsupported blend semantics");
  const blurred = await page.evaluate(async nodes => window.__opacityProbe(nodes,
    [[75, 120], [120, 120], [20, 120]]), [group(), rect("a", { width: 80, height: 80 }),
    rect("tone", { kind: "adjustment", adjustments: { blur: { enabled: true, value: 20 } } })]);
  const spread = blurred.png[0];
  assert.ok(spread[0] > spread[1], `isolated filter retains a red contribution: ${spread}`);
  assert.ok(spread[1] > 127 && spread[1] < 254 && Math.abs(spread[1] - spread[2]) <= 1,
    `isolated spatial filter must spread filtered pixels beyond their original alpha: ${spread}`);
  assertPixel(blurred.png[1], PINK, "isolated blur interior");
  assertPixel(blurred.png[2], WHITE, "isolated blur distant exterior");
  checks.push("isolated spatial filters can expand alpha without double-compositing tone-only adjustments");
  const bounded = await page.evaluate(async () => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), isCanvasRoot: false, cornerRadius: 40, backgroundColor: "transparent", nodes: [
      { id: "backdrop", kind: "rect", visible: true, x: 0, y: 0, width: 400, height: 300, fill: "#ffffff" },
      { id: "group", kind: "group", visible: true, x: 0, y: 0, width: 400, height: 300, opacity: 0.5 },
      { id: "outside", kind: "rect", visible: true, parentId: "group", x: 0, y: 0, width: 8, height: 8, fill: "#ff0000" },
      { id: "tone", kind: "adjustment", visible: true, parentId: "group", adjustments: { blur: { enabled: true, value: 20 } } },
    ] });
    const image = new Image(); image.src = await e.exportFullResPng(); await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return [[3, 3], [16, 16]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  });
  assert.deepEqual(bounded[0], [0, 0, 0, 0]);
  assert.deepEqual(bounded[1], WHITE);
  checks.push("bounded rounded-page clips apply before isolated spatial filters sample their inputs");
  await page.evaluate(async nodes => window.__opacityProbe(nodes, [[100, 120]]),
    [group(), rect("a", { opacity: 0.5 }), rect("tone", { kind: "adjustment", adjustments: { brightness: { enabled: true, value: -100 } } })]);
  const recovery = await page.evaluate(async () => {
    const { adjustmentLayerFailure } = await import("/src/canvas/editor/chrome_layers.js");
    const e = window.__vooEditor, doc = e.getDocument();
    const original = CanvasRenderingContext2D.prototype.getImageData;
    let fail = true;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      if (fail) { fail = false; throw new Error("expected-isolated-adjustment-failure"); }
      return original.apply(this, args);
    };
    let failure;
    try { await e.exportFullResPng(); failure = adjustmentLayerFailure(doc, "tone"); }
    finally { CanvasRenderingContext2D.prototype.getImageData = original; }
    await e.exportFullResPng();
    return { failure, recovered: adjustmentLayerFailure(doc, "tone") };
  });
  assert.match(recovery.failure, /expected-isolated-adjustment-failure/);
  assert.equal(recovery.recovered, null);
  checks.push("isolated adjustment failures remain visible to the engine and recover on a successful repaint");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
