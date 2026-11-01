import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { serializeFigArchive } from "../../src/canvas/figma/fig-file.js";
import { loadFigmaSchema } from "../../src/canvas/figma/figma-schema.js";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const guid = localID => ({ sessionID: 0, localID });
const color = (r, g, b) => [{ type: "SOLID", color: { r, g, b, a: 1 }, visible: true, opacity: 1 }];
const record = (id, type, parent, fields = {}) => ({
  guid: guid(id), type, name: `Native ${id}`,
  ...(parent === null ? {} : { parentIndex: { guid: guid(parent), position: String.fromCharCode(33 + id) } }),
  visible: true, opacity: 1, size: { x: 40, y: 40 },
  ...fields,
  transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0, ...fields.transform },
});

await withEditorBrowser(async ({ page, errors }) => {
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 40; canvas.height = 10;
    const ctx = canvas.getContext("2d");
    ["#ff0000", "#00ff00", "#0000ff", "#ffff00"].forEach((fill, index) => {
      ctx.fillStyle = fill; ctx.fillRect(index * 10, 0, 10, 10);
    });
    return canvas.toDataURL();
  });
  const image = new Uint8Array(Buffer.from(png.split(",")[1], "base64"));
  const hash = createHash("sha1").update(image).digest("hex");
  const imagePaint = { type: "IMAGE", visible: true, opacity: 1,
    image: { hash: new Uint8Array(Buffer.from(hash, "hex")) } };
  const message = { nodeChanges: [
    record(0, "DOCUMENT", null), record(1, "CANVAS", 0),
    record(2, "FRAME", 1, { size: { x: 200, y: 100 }, frameMaskDisabled: true }),
    record(3, "RECTANGLE", 2, { transform: { m02: 180, m12: 40 }, fillPaints: color(1, 0, 0), horizontalConstraint: "MAX" }),
    record(4, "RECTANGLE", 1, { name: "Rotated", size: { x: 40, y: 20 }, fillPaints: color(0, 0, 1),
      transform: { m00: 0, m01: -1, m02: 300, m10: 1, m11: 0, m12: 40 } }),
    record(5, "RECTANGLE", 1, { name: "Manual crop", transform: { m02: 400, m12: 40 },
      fillPaints: [{ ...imagePaint, imageScaleMode: "STRETCH", transform: { m00: .25, m01: 0, m02: .25, m10: 0, m11: 1, m12: 0 } }] }),
    record(6, "RECTANGLE", 1, { name: "Cover", transform: { m02: 460, m12: 40 }, fillPaints: [{ ...imagePaint, imageScaleMode: "FILL" }] }),
    record(15, "RECTANGLE", 1, { name: "Independent image paints", parentIndex: { guid: guid(1), position: "!" }, transform: { m02: 520, m12: 40 },
      fillPaints: [{ ...imagePaint, opacity: 0, imageScaleMode: "STRETCH", transform: { m00: .25, m01: 0, m02: .25, m10: 0, m11: 1, m12: 0 } },
        { ...imagePaint, imageScaleMode: "FILL" }] }),
    record(7, "FRAME", 1, { name: "Layout", size: { x: 100, y: 50 }, transform: { m02: 600, m12: 40 },
      stackMode: "HORIZONTAL", stackHorizontalPadding: 10, stackVerticalPadding: 8, stackSpacing: 12 }),
    record(8, "RECTANGLE", 7, { size: { x: 20, y: 20 }, transform: { m02: 10, m12: 8 }, fillPaints: color(0, 1, 0) }),
    record(9, "VARIABLE_SET", 1, { name: "Test colors", key: "test-collection",
      variableSetModes: [{ id: guid(50), name: "Default" }] }),
    record(10, "VARIABLE", 1, { name: "Brand", variableResolvedType: "COLOR", variableSetID: { guid: guid(9) },
      variableDataValues: { entries: [{ modeID: guid(50), variableData: { value: { colorValue: { r: 1, g: 0, b: 0, a: 1 } }, dataType: "COLOR", resolvedDataType: "COLOR" } }] } }),
    record(11, "RECTANGLE", 1, { name: "Mask A", mask: true, transform: { m02: 100, m12: 160 }, fillPaints: color(1, 1, 1) }),
    record(12, "RECTANGLE", 1, { transform: { m02: 100, m12: 160 }, size: { x: 80, y: 40 }, fillPaints: color(0, 0, 1) }),
    record(13, "RECTANGLE", 1, { name: "Mask B", mask: true, transform: { m02: 200, m12: 160 }, fillPaints: color(1, 1, 1) }),
    record(14, "RECTANGLE", 1, { transform: { m02: 200, m12: 160 }, size: { x: 80, y: 40 }, fillPaints: color(0, 1, 0) }),
  ] };
  const bytes = await serializeFigArchive({ version: 106, schema: await loadFigmaSchema(), message },
    { name: "Native import regression", images: new Map([[hash, { hashHex: hash, bytes: image }]]) });
  const pick = async file => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"),
      page.getByTestId("editor-top-bar").getByRole("button", { name: "Import project file (⌘O / Ctrl+O)", exact: true }).click()]);
    await chooser.setFiles(file);
    await page.waitForFunction(() => window.__vooEditor && window.__vooStore?.fileName?.includes("NativeFigma"));
    await page.getByTestId("loading-modal").waitFor({ state: "detached" });
    // The modal can detach before the new engine publishes the reopened scene.
    // Wait for the actual imported document, retaining every exact pixel check.
    await page.waitForFunction(() => window.__vooEditor?.getDocument().nodes.some(node => node.name === "Native 2") &&
      document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
  };
  await pick({ name: "NativeFigma.fig", mimeType: "application/octet-stream", buffer: Buffer.from(bytes) });
  const sample = () => page.evaluate(async () => {
    const e = window.__vooEditor, doc = e.getDocument();
    const canvas = await e.exportPngCanvasAsync();
    const ctx = canvas.getContext("2d");
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    return { pixels: { overflow: pixel(210, 60), rotation: pixel(290, 60), crop: pixel(420, 60),
      coverLeft: pixel(470, 60), coverRight: pixel(490, 60), independentCover: pixel(550, 60), maskA: pixel(120, 180), outsideA: pixel(160, 180), maskB: pixel(220, 180) },
      frame: doc.nodes.find(n => n.name === "Native 2"), layout: doc.nodes.find(n => n.name === "Layout"),
      variables: doc.variablesV2, ids: doc.nodes.map(n => n.id) };
  });
  const before = await sample();
  assert.deepEqual(before.pixels.overflow, [255, 0, 0, 255]);
  assert.deepEqual(before.pixels.rotation, [0, 0, 255, 255]);
  assert.deepEqual(before.pixels.crop, [0, 255, 0, 255]);
  assert.deepEqual(before.pixels.coverLeft, [0, 255, 0, 255]);
  assert.deepEqual(before.pixels.coverRight, [0, 0, 255, 255]);
  assert.deepEqual(before.pixels.independentCover, [0, 0, 255, 255]);
  assert.deepEqual(before.pixels.maskA, [0, 0, 255, 255]);
  assert.equal(before.pixels.outsideA[3], 0);
  assert.deepEqual(before.pixels.maskB, [0, 255, 0, 255]);
  assert.equal(before.frame.clipContent, false);
  assert.equal(before.layout.autoLayout.direction, "horizontal");
  assert.equal(before.variables.collections[0].variables[0].type, "color");
  assert.equal(new Set(before.ids).size, before.ids.length);

  const cache = await page.evaluate(() => {
    const e = window.__vooEditor, doc = e.getDocument(), ids = doc.nodes.map(n => n.id);
    const target = document.createElement("canvas");
    const render = () => e.renderLayerPass(target, ids, { viewport: { zoom: 1, panX: 0, panY: 0 }, stageWidth: doc.width, stageHeight: doc.height });
    render();
    const first = target.toDataURL();
    const create = document.createElement.bind(document); let canvases = 0;
    document.createElement = (name, ...args) => { if (name === "canvas") canvases++; return create(name, ...args); };
    try { render(); return { canvases, samePixels: first === target.toDataURL() }; }
    finally { document.createElement = create; }
  });
  assert.equal(cache.canvases, 0, "An unchanged second layer pass must reuse its mask bitmaps");
  assert.equal(cache.samePixels, true);

  const culling = await page.evaluate(() => {
    const e = window.__vooEditor, doc = e.getDocument(), ids = doc.nodes.map(n => n.id);
    const render = (canvas, width, height) => e.renderLayerPass(canvas, ids,
      { viewport: { zoom: 1, panX: 0, panY: 0 }, stageWidth: width, stageHeight: height });
    const full = document.createElement("canvas"), cropped = document.createElement("canvas");
    render(full, doc.width, doc.height);
    const ctx = cropped.getContext("2d"), drawImage = ctx.drawImage;
    let offscreenImagePaints = 0;
    ctx.drawImage = function (source, ...args) {
      if (source.width === 40 && source.height === 10) offscreenImagePaints++;
      return drawImage.call(this, source, ...args);
    };
    try {
      render(cropped, 240, 120);
      const expected = full.getContext("2d").getImageData(0, 0, 240, 120).data;
      const actual = ctx.getImageData(0, 0, 240, 120).data;
      return { offscreenImagePaints, samePixels: expected.every((value, i) => value === actual[i]) };
    } finally { ctx.drawImage = drawImage; }
  });
  assert.equal(culling.samePixels, true, "Viewport culling must preserve every visible pixel, including Frame overflow");
  // The two nearby fills remain inside the existing 240-world-pixel safety margin.
  assert.equal(culling.offscreenImagePaints, 2, "A mixed layer pass must skip the distant image fill beyond the safety margin");

  await page.evaluate(id => window.__vooEditor.updateFrameNode(id, { width: 300 }), before.frame.id);
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(n => n.name === "Native 3").x), 280);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.deepEqual((await sample()).pixels, before.pixels);
  await page.evaluate(() => window.__vooEditor.redo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(n => n.name === "Native 3").x), 280);
  await page.evaluate(() => window.__vooEditor.undo());
  const saved = await page.evaluate(async () => {
    const { buildVooFile } = await import("/src/canvas/store/project_io.js");
    const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const data = await buildVooFile({ document: window.__vooEditor.serialise(), version: 2, kind: "design" });
    return [...encodeVooBinary(data)];
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("editor-top-bar").waitFor();
  await pick({ name: "NativeFigma.voo", mimeType: "application/octet-stream", buffer: Buffer.from(saved) });
  const reopened = await sample();
  assert.deepEqual(reopened.pixels, before.pixels);
  assert.deepEqual(reopened.variables, before.variables);
  assert.deepEqual(errors, []);
  console.log("Native Figma picker import: crop/cover/rotation/overflow/mask pixels, mask reuse, editable constraints, undo/redo and cold binary reopening passed.");
}, { openDocument: false, mcpLink: false });
