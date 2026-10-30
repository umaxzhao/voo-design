import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const passed = [];
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Invert the public pointer conversion instead of assuming bitmap bounds are
  // the document origin. Signed render windows may extend to all four sides.
  const client = point => page.evaluate(point => {
    const e = window.__vooEditor;
    const zero = e.toDocPoint(0, 0), zoom = e.getViewport().zoom;
    return { x: (point.x - zero.x) * zoom, y: (point.y - zero.y) * zoom };
  }, point);
  const documentState = () => page.evaluate(() => {
    const e = window.__vooEditor, doc = e.getDocument();
    return { width: doc.width, height: doc.height, crop: doc.crop, nodes: doc.nodes,
      selected: e.getSelectedIds() };
  });
  const drag = async (point, delta) => {
    const start = await client(point);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 8 });
    await page.mouse.up(); await settle();
    await page.evaluate(() => window.__vooEditor.flushTransforms());
    await settle();
  };
  const screenPixels = async points => {
    await settle();
    const source = `data:image/png;base64,${(await page.screenshot()).toString("base64")}`;
    return page.evaluate(async ({ source, points }) => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      return points.map(p => [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data]);
    }, { source, points });
  };
  const seed = async () => {
    await page.evaluate(async () => {
      const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const { useDesignStore } = await import("/src/store/design_store.js");
      const e = window.__vooEditor;
      const frame = (id, x, y, fill) => ({ ...createGroupNode({ x, y, width: 220, height: 170 }),
        id, name: id, isFrame: true, frame: true, fill, clipContent: false });
      e.setDoc({ ...e.getDocument(), isCanvasRoot: true, width: 700, height: 450,
        crop: { x: 0, y: 0, width: 700, height: 450 }, backgroundColor: "transparent", nodes: [
          frame("negative-moving", 60, 80, "#ffffff"),
          { ...createRectNode({ x: 90, y: 110, width: 70, height: 50, fill: "#ff0000" }),
            id: "negative-child", parentId: "negative-moving" },
          frame("negative-sibling", 420, 100, "#0000ff"),
          { ...createRectNode({ x: 460, y: 130, width: 50, height: 40, fill: "#00ff00" }),
            id: "negative-sibling-child", parentId: "negative-sibling" },
        ] });
      e.setTool("select"); e.selectExactly(["negative-moving"]);
      if (e.getSnappingEnabled()) e.toggleSnapping();
      useDesignStore.setState({ editorCamera: { zoom: 1, panX: 700, panY: 420 }, pendingArtboardFitId: null });
    });
    await settle();
  };
  await seed();
  await page.locator('[data-testid="workspace-skia-canvas"][data-renderer-status="ready"]').waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("editor-artwork-fallback").count(), 0,
    "The vector scenario must actually use the native workspace painter");
  const before = await documentState();
  const siblingPoint = await client({ x: 480, y: 150 });
  const beforePixels = await screenPixels([siblingPoint]);
  assert.deepEqual(beforePixels, [[0, 255, 0, 255]]);
  await drag({ x: 200, y: 210 }, { x: -200, y: -190 });
  const after = await documentState();
  console.log(JSON.stringify({ negativeDrag: { before, after, siblingPoint } }));
  assert.deepEqual(after.nodes.filter(n => n.id.startsWith("negative-sibling")),
    before.nodes.filter(n => n.id.startsWith("negative-sibling")), "Moving one Frame through zero must not move its sibling tree");
  const frame = after.nodes.find(n => n.id === "negative-moving");
  const child = after.nodes.find(n => n.id === "negative-child");
  assert.deepEqual([frame.x, frame.y, child.x, child.y], [-140, -110, -110, -80]);
  assert.deepEqual([after.width, after.height, after.crop], [before.width, before.height, before.crop]);
  assert.deepEqual(await screenPixels([siblingPoint, await client({ x: -75, y: -55 })]),
    [[0, 255, 0, 255], [255, 0, 0, 255]]);
  passed.push("a real multi-step Frame drag crosses both coordinate origins without shifting sibling data, sibling pixels or document bounds");
  const label = page.getByTestId("editor-canvas-frame-label").filter({ hasText: "negative-moving" });
  const labelRect = await label.boundingBox(), corner = await client({ x: frame.x, y: frame.y });
  assert.ok(labelRect && Math.abs(labelRect.x - corner.x) < 20, JSON.stringify({ labelRect, corner }));
  assert.ok(labelRect.y + labelRect.height <= corner.y + 2);
  const [selectionEdge] = await screenPixels([await client({ x: frame.x + 90, y: frame.y })]);
  assert.ok(selectionEdge[1] > selectionEdge[0] + 10 && selectionEdge[1] > selectionEdge[2] + 10,
    `The selection edge must follow the actual negative Frame boundary: ${selectionEdge}`);
  passed.push("the negative-coordinate Frame label and painted selection edge follow its world-space corner");
  await page.evaluate(() => window.__vooEditor.undo()); await settle();
  assert.deepEqual(await documentState(), before);
  await page.evaluate(() => window.__vooEditor.redo()); await settle();
  assert.deepEqual(await documentState(), after);
  passed.push("one undo and redo restore the exact document bounds, crop, subtree geometry and selection");

  await drag({ x: 0, y: 20 }, { x: 230, y: 220 });
  const returned = await documentState();
  const returnedFrame = returned.nodes.find(n => n.id === "negative-moving");
  assert.deepEqual([returnedFrame.x, returnedFrame.y], [90, 110]);
  assert.deepEqual(returned.nodes.filter(n => n.id.startsWith("negative-sibling")),
    before.nodes.filter(n => n.id.startsWith("negative-sibling")));
  passed.push("the next pointer drag returns the same Frame across zero without cumulative coordinate drift");
  await page.evaluate(() => window.__vooEditor.undo()); await settle();
  const negativeChild = await client({ x: -75, y: -55 });
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await page.mouse.click(negativeChild.x, negativeChild.y); await settle();
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["negative-child"]);
  await drag({ x: -75, y: -55 }, { x: -30, y: 20 });
  assert.deepEqual(await page.evaluate(() => {
    const e = window.__vooEditor, n = e.getNode("negative-child"), f = e.getNode("negative-moving");
    return [n.x, n.y, f.x, f.y];
  }), [-140, -60, -140, -110]);
  assert.deepEqual(await screenPixels([await client({ x: -105, y: -35 })]), [[255, 0, 0, 255]]);
  passed.push("a child painted at negative coordinates remains directly selectable and independently movable");

  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const rect = createRectNode({ x: -210, y: -180, width: 80, height: 80, fill: "#ff00ff" });
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, { ...rect, id: "negative-overflow", parentId: "negative-moving" },
      { ...createRectNode({ x: -340, y: -80, width: 100, height: 60, fill: "#00ffff" }), id: "negative-rotated", rotation: 30 }] });
    e.selectExactly([]);
  });
  await settle();
  assert.deepEqual(await screenPixels([await client({ x: -170, y: -140 }), await client({ x: -290, y: -50 })]),
    [[255, 0, 255, 255], [0, 255, 255, 255]]);
  const overflowPoint = await client({ x: -170, y: -140 });
  await page.mouse.click(overflowPoint.x, overflowPoint.y); await settle();
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["negative-overflow"]);
  passed.push("unclipped Frame overflow and a rotated root remain visible and hit-testable beyond the old top-left bitmap edge");
  await page.evaluate(async () => {
    const { createGroupNode, createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const canvas = document.createElement("canvas"); canvas.width = 90; canvas.height = 70;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ff8800"; ctx.fillRect(0, 0, 90, 70);
    const image = await e.insertImage(canvas.toDataURL(), { x: 200, y: 200 });
    e.setDoc({ ...e.getDocument(), nodes: [
      { ...createGroupNode({ x: -230, y: -230, width: 280, height: 240 }), id: "negative-media-frame",
        name: "Negative Media", frame: true, isFrame: true, fill: "#ffffff", clipContent: false },
      { ...image, id: "negative-media-image", parentId: "negative-media-frame", x: -200, y: -190, width: 90, height: 70 },
      { ...image, id: "right-media-image", parentId: null, x: 740, y: 50, width: 90, height: 70 },
      { ...image, id: "bottom-media-image", parentId: null, x: 50, y: 520, width: 90, height: 70 },
      { ...createTextNode({ x: -190, y: -90, text: "MMMM", fontSize: 48, fontFamily: "Arial", fontWeight: 700,
        fill: "#8000ff" }), id: "negative-media-text", parentId: "negative-media-frame", width: 180, height: 70,
        boxWidth: 180, boxHeight: 70 },
    ] });
    e.selectExactly([]); e.setTool("select");
  });
  const fallback = page.getByTestId("editor-artwork-fallback");
  await fallback.waitFor({ state: "visible" }); await settle();
  const orangePoint = await client({ x: -155, y: -155 });
  const orangePixels = await screenPixels([orangePoint]);
  const fallbackBounds = await fallback.evaluate(el => ({ width: el.width, height: el.height,
    css: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y,
      width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height } }));
  console.log(JSON.stringify({ negativeMediaFallback: { orangePoint, orangePixels, fallbackBounds } }));
  assert.deepEqual(orangePixels, [[255, 136, 0, 255]], "The real Canvas2D fallback must paint negative image pixels");
  const textCorner = await client({ x: -190, y: -90 });
  const textImage = await page.screenshot({ clip: { x: Math.floor(textCorner.x), y: Math.floor(textCorner.y), width: 180, height: 70 } });
  const glyphPixels = await page.evaluate(async source => {
    const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i] > rgba[i + 1] + 20 && rgba[i + 2] > rgba[i + 1] + 80) count++;
    return count;
  }, textImage.toString("base64"));
  assert.ok(glyphPixels > 500, `Negative-coordinate Canvas2D text must retain visible glyph pixels: ${glyphPixels}`);
  await page.mouse.click(orangePoint.x, orangePoint.y); await settle();
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["negative-media-image"]);
  passed.push("real Canvas2D fallback image/text pixels remain visible at negative coordinates and the image is directly selectable");
  assert.deepEqual(await screenPixels([await client({ x: 785, y: 85 }), await client({ x: 95, y: 555 })]),
    [[255, 136, 0, 255], [255, 136, 0, 255]], "Canvas2D must also retain artwork beyond the original right and bottom document edges");
  passed.push("the viewport-sized fallback preserves image pixels beyond the original right and bottom bounds too");
  const selectionExports = await page.evaluate(async () => {
    const e = window.__vooEditor;
    const read = async (url, probe = [45, 35], countGlyphs = false) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      const result = { size: [canvas.width, canvas.height], pixel: [...ctx.getImageData(...probe, 1, 1).data] };
      if (countGlyphs) {
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        result.glyphPixels = 0;
        for (let i = 0; i < rgba.length; i += 4) if (rgba[i] > rgba[i + 1] + 20 && rgba[i + 2] > rgba[i + 1] + 80) result.glyphPixels++;
      }
      return result;
    };
    const png = await e.exportSelectionPng(["negative-media-image"]);
    const svg = e.getNodeSvg("negative-media-image");
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const frameUrl = URL.createObjectURL(new Blob([e.getNodeSvg("negative-media-frame")], { type: "image/svg+xml" }));
    try {
      return { sample: e.sampleColorAt({ x: -155, y: -155 }), bounds: png.bounds,
        png: await read(png.dataUrl), svg: await read(url), frame: await read(frameUrl, [75, 75], true) };
    } finally { URL.revokeObjectURL(url); URL.revokeObjectURL(frameUrl); }
  });
  console.log(JSON.stringify({ selectionExports }));
  assert.equal(selectionExports.sample, "#ff8800", "Public colour sampling must use the same signed world position as visible artwork");
  assert.deepEqual(selectionExports.bounds, { x: -200, y: -190, width: 90, height: 70 });
  for (const format of ["png", "svg"]) {
    assert.deepEqual(selectionExports[format], { size: [90, 70], pixel: [255, 136, 0, 255] });
  }
  assert.deepEqual(selectionExports.frame.size, [280, 240]);
  assert.deepEqual(selectionExports.frame.pixel, [255, 136, 0, 255]);
  assert.ok(selectionExports.frame.glyphPixels > 500, "A selected negative Frame SVG must embed both image bytes and visible child text");
  passed.push("negative-coordinate selection PNG/SVG preserve explicit bounds, sampling matches pixels and a selected Frame SVG retains image/text resources");
  console.log(JSON.stringify({ glyphPixels, passed }, null, 2));
}, { viewport: { width: 1920, height: 1200 } });
