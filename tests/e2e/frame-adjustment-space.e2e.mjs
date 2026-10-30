import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const passed = [];
  const sameRendered = (actual, expected) => {
    assert.deepEqual(actual.samples, expected.samples);
    assert.deepEqual(actual.rasterPixels, expected.rasterPixels);
    actual.pixels.forEach((pixel, index) => pixel.forEach((value, channel) =>
      assert.ok(Math.abs(value - expected.pixels[index][channel]) <= 1,
        `Screen colour round-trip exceeds one level: ${JSON.stringify({ actual, expected })}`)));
  };
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const points = [{ x: -100, y: 90 }, { x: 80, y: 90 }, { x: 740, y: 90 }, { x: 80, y: 540 }];
  const seed = async (nodes = null) => {
    await page.evaluate(async nodes => {
      const { createAdjustmentNode } = await import("/src/canvas/editor/scene_model.js");
      const { useDesignStore } = await import("/src/store/design_store.js");
      const e = window.__vooEditor;
      const rect = (id, x, y) => ({ id, kind: "rect", visible: true, x, y, width: 80, height: 80, fill: "#444444" });
      e.setDoc({ ...e.getDocument(), isCanvasRoot: true, width: 600, height: 400, crop: null,
        backgroundColor: "transparent", nodes: nodes ?? [
          rect("negative", -140, 50), rect("positive", 40, 50), rect("right", 700, 50), rect("bottom", 40, 500),
          { ...createAdjustmentNode({ width: 600, height: 400,
            adjustments: { brightness: { enabled: true, value: 60 } } }), id: "tone" },
        ] });
      e.setTool("select"); e.selectExactly([]);
      useDesignStore.setState({ editorCamera: { zoom: 1, panX: 600, panY: 250 }, pendingArtboardFitId: null });
    }, nodes);
    await page.getByTestId("editor-artwork-fallback").waitFor(); await settled();
  };
  const read = async (worldPoints = points) => {
    await settled();
    const screen = await page.evaluate(points => {
      const e = window.__vooEditor, origin = e.toDocPoint(0, 0), zoom = e.getViewport().zoom;
      return points.map(point => ({ x: (point.x - origin.x) * zoom, y: (point.y - origin.y) * zoom }));
    }, worldPoints);
    const bytes = await page.screenshot();
    return page.evaluate(async ({ source, screen, points }) => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      const fallback = document.querySelector('[data-testid="editor-artwork-fallback"]');
      const bounds = fallback?.getBoundingClientRect();
      const fallbackContext = fallback?.getContext("2d");
      const pixels = screen.map(point => [...ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data]);
      const rasterPixels = screen.map(point => bounds && fallbackContext
        ? [...fallbackContext.getImageData(Math.floor((point.x - bounds.x) * fallback.width / bounds.width),
          Math.floor((point.y - bounds.y) * fallback.height / bounds.height), 1, 1).data] : null);
      return { pixels, rasterPixels,
        samples: points.map(point => window.__vooEditor.sampleColorAt(point)) };
    }, { source: bytes.toString("base64"), screen, points: worldPoints });
  };
  await seed();
  const initial = await read();
  assert.deepEqual(initial.pixels, Array(4).fill([221, 221, 221, 255]));
  assert.deepEqual(initial.samples, Array(4).fill("#dddddd"));
  passed.push("global adjustments affect negative, positive, right-overflow and bottom-overflow pixels equally");

  for (const camera of [{ zoom: 0.5, panX: 500, panY: 250 }, { zoom: 1.5, panX: 350, panY: 200 }]) {
    await page.evaluate(async camera => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      useDesignStore.setState({ editorCamera: camera });
    }, camera);
    sameRendered(await read(), initial);
  }
  passed.push("camera zoom and pan do not retain a stale document-origin adjustment plane");

  const before = await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument()));
  await page.evaluate(() => window.__vooEditor.updateNode("tone", { opacity: 0.5 }));
  const partial = await read();
  // Check the composited source and public sampler exactly. The screenshot
  // additionally passes through browser colour composition and panel shadows,
  // so retain the same one-level screen round-trip budget used above.
  const halfPixels = Array(4).fill([144, 144, 144, 255]);
  sameRendered(partial, { pixels: halfPixels, rasterPixels: halfPixels, samples: Array(4).fill("#909090") });
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument())), before);
  sameRendered(await read(), initial);
  await page.evaluate(() => window.__vooEditor.redo());
  sameRendered(await read(), partial);
  passed.push("adjustment opacity and one-step undo/redo preserve equal signed-coordinate output");

  const rect = (id, x, patch = {}) => ({ id, kind: "rect", visible: true, x, y: 50,
    width: 80, height: 80, fill: "#444444", ...patch });
  await seed([
    rect("outside", 40),
    { id: "clip-frame", kind: "group", isFrame: true, visible: true, x: -160, y: 30,
      width: 160, height: 140, fill: "transparent", clipContent: true },
    rect("inside", -140, { parentId: "clip-frame" }),
    { id: "clip-tone", kind: "adjustment", visible: true, parentId: "clip-frame",
      adjustments: { brightness: { enabled: true, value: 60 } } },
  ]);
  const clipped = await read(points.slice(0, 2));
  assert.deepEqual(clipped.pixels, [[221, 221, 221, 255], [68, 68, 68, 255]]);
  assert.deepEqual(clipped.samples, ["#dddddd", "#444444"]);
  passed.push("a Frame-scoped adjustment uses its signed ancestor clip and leaves the external backdrop unchanged");

  await seed([
    { id: "half-frame", kind: "group", isFrame: true, visible: true, x: -160, y: 30,
      width: 160, height: 140, fill: "transparent", opacity: 0.5 },
    rect("half-child", -140, { parentId: "half-frame" }),
    { id: "frame-tone", kind: "adjustment", visible: true, parentId: "half-frame",
      x: 0, y: 0, width: 600, height: 400,
      adjustments: { brightness: { enabled: true, value: 60 } } },
  ]);
  const half = await page.evaluate(async () => {
    const result = window.__vooEditor.exportSelectionPng(["half-frame"]);
    if (result.width !== 160 || result.height !== 140) throw new Error("Adjustment metadata must not expand the selected Frame bounds");
    const image = new Image(); image.src = result.dataUrl; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(-100 - result.bounds.x, 90 - result.bounds.y, 1, 1).data];
  });
  assert.ok(Math.abs(half[3] - 128) <= 1, `A global adjustment must retain completed container alpha: ${half}`);
  assert.ok(Math.abs(half[0] - 221) <= 1);
  passed.push("selection exports retain the Frame's own adjustment and isolated alpha without expanding its bounds");
  console.log(JSON.stringify({ initial, partial, clipped, half, passed }, null, 2));
}, { viewport: { width: 1920, height: 1200 } });
