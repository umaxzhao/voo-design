import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 functional controls on a real rectangle (1440 wide, default theme). The rectangle comes from
// the project factory so it is visible; exported files are decoded in the browser and checked pixel
// by pixel, so a blank or white export cannot pass on its file header alone.
const EVIDENCE = process.env.T02_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-t02-functional");
const GREEN = [0, 255, 0];

await mkdir(EVIDENCE, { recursive: true });
const checks = [];

// Decode an exported file in the page and report what the pixels contain.
async function decodeInPage(page, path, mime) {
  const base64 = (await readFile(path)).toString("base64");
  return page.evaluate(async ({ b64, type, target }) => {
    const img = new Image();
    img.src = `data:${type};base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels = canvas.width * canvas.height;
    let onTarget = 0;
    let transparent = 0;
    let white = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a === 0) transparent += 1;
      if (r >= 240 && g >= 240 && b >= 240) white += 1;
      if (a >= 250 && Math.abs(r - target[0]) <= 24 && Math.abs(g - target[1]) <= 24 && Math.abs(b - target[2]) <= 24) {
        onTarget += 1;
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      onTargetRatio: onTarget / pixels,
      transparentRatio: transparent / pixels,
      whiteRatio: white / pixels,
    };
  }, { b64: base64, type: mime, target: GREEN });
}

await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const rect = { ...createRectNode({ x: 100, y: 100, width: 120, height: 80, fill: "#ff0000" }), id: "t02-rect" };
    e.setDoc({ ...e.getDocument(), nodes: [rect], colorVariables: [], variablesV2: undefined });
    e.selectExactly([rect.id]);
  });
  await settlePanels(page);

  const panel = page.getByTestId("editor-properties-panel");
  const state = () => page.evaluate(() => {
    const e = window.__vooEditor;
    const node = e.getNode("t02-rect");
    return {
      visible: node.visible,
      fill: node.fill,
      binding: node.fillVariableId ?? null,
      legacy: e.getDocument().colorVariables.length,
      collections: e.getDocument().variablesV2?.collections?.length ?? 0,
    };
  });
  const initial = await state();
  assert.equal(initial.visible, true, `the rect must be visible: ${JSON.stringify(initial)}`);
  checks.push(`factory rect visible=${initial.visible}, fill ${initial.fill}`);

  // Colour variables: create, bind, edit the value (propagates), then unlink and undo/redo.
  await page.getByTestId("editor-color-variable-create").click();
  await settlePanels(page);
  const created = await state();
  assert.ok(created.legacy + created.collections >= 1, `create must store a colour variable: ${JSON.stringify(created)}`);
  assert.ok(created.binding, `create must bind the rect to the new variable: ${JSON.stringify(created)}`);
  checks.push("colour variable created and bound");

  const valueField = panel.getByRole("textbox", { name: "Variable value", exact: true });
  await valueField.fill("#00ff00");
  await valueField.press("Enter");
  await settlePanels(page);
  const edited = await state();
  assert.equal(edited.fill, "#00ff00", `value edit must propagate to the bound fill: ${JSON.stringify(edited)}`);
  checks.push("variable value edit propagates to the bound fill (#00ff00)");

  // Export while the rect is green: PNG and JPEG at 2x, decoded and checked pixel by pixel.
  assert.ok(await panel.getByText("Export", { exact: true }).count() >= 1, "Export title must show by default");
  await panel.getByRole("button", { name: "Add export settings", exact: true }).click();
  await settlePanels(page);
  await panel.getByRole("button", { name: "Export scale", exact: true }).click();
  await page.getByRole("option", { name: "2x", exact: true }).click();
  await settlePanels(page);

  const [pngDownload] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const pngPath = join(EVIDENCE, "rect-2x.png");
  await pngDownload.saveAs(pngPath);
  const png = await decodeInPage(page, pngPath, "image/png");
  assert.deepEqual([png.width, png.height], [240, 160], `PNG at 2x must be 240x160: ${JSON.stringify(png)}`);
  assert.ok(png.onTargetRatio >= 0.99, `PNG must be the green fill: ${JSON.stringify(png)}`);
  assert.equal(png.transparentRatio, 0, `PNG is fully covered by the rect, so no transparent pixels: ${JSON.stringify(png)}`);
  assert.equal(png.whiteRatio, 0, `PNG must not be blank white: ${JSON.stringify(png)}`);
  checks.push(`PNG 2x decoded: ${png.width}x${png.height}, green ${(png.onTargetRatio * 100).toFixed(2)}%, transparent 0%`);

  await panel.getByRole("button", { name: "Format", exact: true }).click();
  await page.getByRole("option", { name: /JPEG/i }).click();
  await settlePanels(page);
  const [jpegDownload] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const jpegPath = join(EVIDENCE, "rect-2x.jpg");
  await jpegDownload.saveAs(jpegPath);
  const jpeg = await decodeInPage(page, jpegPath, "image/jpeg");
  assert.deepEqual([jpeg.width, jpeg.height], [240, 160], `JPEG at 2x must be 240x160: ${JSON.stringify(jpeg)}`);
  assert.ok(jpeg.onTargetRatio >= 0.97, `JPEG must be the green fill within compression error: ${JSON.stringify(jpeg)}`);
  assert.equal(jpeg.whiteRatio, 0, `JPEG must not be blank white: ${JSON.stringify(jpeg)}`);
  checks.push(`JPEG 2x decoded: ${jpeg.width}x${jpeg.height}, green ${(jpeg.onTargetRatio * 100).toFixed(2)}%, white 0%`);

  // Unlink, undo, redo.
  await panel.locator('button[title="Unlinked"]').first().click();
  await settlePanels(page);
  assert.equal((await state()).binding, null, "unlink must clear the binding");
  await page.keyboard.press("ControlOrMeta+Z");
  await settlePanels(page);
  assert.ok((await state()).binding, "one undo must restore the unlinked binding");
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await settlePanels(page);
  assert.equal((await state()).binding, null, "one redo must unlink again");
  checks.push("unlink, one undo and one redo verified");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 functional ok:\n- ${checks.join("\n- ")}`);
}, { openDocument: true, mcpLink: true });
