import assert from "node:assert/strict";
import { serializeFigArchive } from "../../src/canvas/figma/fig-file.js";
import { loadFigmaSchema } from "../../src/canvas/figma/figma-schema.js";
import { mixedNativeText } from "../unit/figma/testing/native-text.js";

export async function verifyNativeTextFidelity(page) {
  await page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype;
    window.__nativeMeasureOriginal = proto.measureText;
    window.__nativeMeasures = 0;
    proto.measureText = function (text) {
      if (text === "A" || text === "B") window.__nativeMeasures++;
      return window.__nativeMeasureOriginal.call(this, text);
    };
  });
  const pick = async (name, bytes) => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"),
      page.getByTestId("editor-top-bar").getByRole("button", { name: /^Import project file/ }).click()]);
    await chooser.setFiles({ name, mimeType: "application/octet-stream", buffer: Buffer.from(bytes) });
    await page.waitForFunction(extension => window.__vooStore?.fileName?.toLowerCase().endsWith(extension) &&
      window.__vooEditor?.getDocument().nodes.some(node => node.name === "Mixed sizes") &&
      document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off",
    name.endsWith(".voo") ? ".voo" : ".fig");
    await page.getByTestId("loading-modal").waitFor({ state: "detached" });
  };
  const pixels = () => page.evaluate(async () => {
    const canvas = await window.__vooEditor.exportPngCanvasAsync();
    return { width: canvas.width, height: canvas.height,
      data: [...canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data] };
  });
  try {
    const archive = await serializeFigArchive({ version: 106, schema: await loadFigmaSchema(), message: mixedNativeText() },
      { name: "Native typography", images: new Map() });
    await pick("NativeTextCache.fig", archive);
    const initial = await page.evaluate(async () => {
      const e = window.__vooEditor, node = e.getDocument().nodes.find(node => node.name === "Mixed sizes");
      e.selectExactly([node.id]); document.activeElement?.blur();
      return { id: node.id, kind: node.kind, text: node.text, width: node.width, height: node.height,
        lineHeight: node.lineHeight,
        measures: window.__nativeMeasures, originalFontFaces: (await document.fonts.load('64px "Unavailable Test Face"')).length };
    });
    assert.equal(initial.kind, "text");
    assert.equal(initial.text, "A\nB");
    assert.equal(initial.width, 258);
    assert.equal(initial.height, 126);
    assert.equal(initial.lineHeight, 0.75, "Native condensed-font leading must survive engine normalization");
    assert.equal(initial.measures, 0);
    assert.equal(initial.originalFontFaces, 0);
    const original = await pixels();
    const expected = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 258; canvas.height = 126;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ff0000";
      ctx.fill(new Path2D("M0 36 L18 0 L36 36 Z M0 112 L32 48 L64 112 Z"));
      return [...ctx.getImageData(0, 0, 258, 126).data];
    });
    assert.deepEqual({ width: original.width, height: original.height }, { width: 258, height: 126 });
    assert.deepEqual(original.data, expected, "Missing fonts must paint the native 36px/64px glyphs exactly");
    const svgPixels = await page.evaluate(async id => {
      const svg = window.__vooEditor.getNodeSvg(id);
      const image = new Image();
      image.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try {
        await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        return [...ctx.getImageData(0, 0, canvas.width, canvas.height).data];
      } finally { URL.revokeObjectURL(image.src); }
    }, initial.id);
    assert.deepEqual(svgPixels, original.data, "SVG preserves the same cached glyphs without font substitution");
    await page.evaluate(id => window.__vooEditor.updateNode(id, { fill: "#00ff00" }), initial.id);
    assert.notDeepEqual((await pixels()).data, original.data);
    await page.keyboard.press("ControlOrMeta+z");
    assert.deepEqual((await pixels()).data, original.data);
    await page.evaluate(id => window.__vooEditor.updateNode(id, { text: "Changed" }), initial.id);
    assert.notDeepEqual((await pixels()).data, original.data);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(id => window.__vooEditor.getNode(id)?.text === "A\nB", initial.id);
    assert.deepEqual((await pixels()).data, original.data);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.waitForFunction(id => window.__vooEditor.getNode(id)?.text === "Changed", initial.id);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(id => window.__vooEditor.getNode(id)?.text === "A\nB", initial.id);
    const saved = await page.evaluate(async () => {
      const { buildVooFile } = await import("/src/canvas/store/project_io.js");
      const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
      return [...encodeVooBinary(await buildVooFile({ document: window.__vooEditor.serialise(), version: 2, kind: "design" }))];
    });
    await page.evaluate(() => { CanvasRenderingContext2D.prototype.measureText = window.__nativeMeasureOriginal; });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("editor-top-bar").waitFor();
    await pick("NativeTextCache.voo", saved);
    assert.deepEqual((await pixels()).data, original.data, "Portable cold reopen retains original glyph appearance without installed fonts");
  } finally {
    await page.evaluate(() => {
      if (window.__nativeMeasureOriginal) CanvasRenderingContext2D.prototype.measureText = window.__nativeMeasureOriginal;
      delete window.__nativeMeasureOriginal; delete window.__nativeMeasures;
    });
  }
  return "native mixed sizes, missing-font pixels, zero replacement measurements, editable recolor/content, keyboard history and cold portable reopen";
}
