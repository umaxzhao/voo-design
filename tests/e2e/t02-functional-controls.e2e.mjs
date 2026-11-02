import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 functional controls on a real rectangle (1440 wide, default theme): colour variables must
// create, bind, propagate a value edit, unlink and undo; Export must show its title and add entry
// by default, and the configured PNG/JPEG downloads must have the expected pixel sizes.
const EVIDENCE = process.env.T02_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-t02-functional");
const RECT = { id: "t02-rect", kind: "rect", x: 100, y: 100, width: 120, height: 80, fill: "#ff0000" };

const pngSize = (buffer) => {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, "download must be a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

// Walk JPEG segments to the first SOF marker, which carries the frame height and width.
const jpegSize = (buffer) => {
  assert.equal(buffer[0], 0xff, "download must be a JPEG");
  assert.equal(buffer[1], 0xd8, "download must be a JPEG");
  let offset = 2;
  while (offset < buffer.length) {
    assert.equal(buffer[offset], 0xff, "JPEG marker expected");
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + buffer.readUInt16BE(offset + 2);
  }
  throw new Error("JPEG SOF marker not found");
};

await mkdir(EVIDENCE, { recursive: true });
const checks = [];

await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate((rect) => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [rect], colorVariables: [], variablesV2: undefined });
    e.selectExactly([rect.id]);
  }, RECT);
  await settlePanels(page);

  const panel = page.getByTestId("editor-properties-panel");
  const state = () => page.evaluate(() => {
    const e = window.__vooEditor;
    return {
      fill: e.getNode("t02-rect").fill,
      binding: e.getNode("t02-rect").fillVariableId ?? null,
      legacy: e.getDocument().colorVariables.length,
      collections: e.getDocument().variablesV2?.collections?.length ?? 0,
    };
  });

  // Colour variables: create from the current fill, edit the value, then unlink and undo.
  await page.getByTestId("editor-color-variable-create").click();
  await settlePanels(page);
  const created = await state();
  assert.ok(created.legacy + created.collections >= 1, `create must store a colour variable: ${JSON.stringify(created)}`);
  assert.ok(created.binding, `create must bind the rect to the new variable: ${JSON.stringify(created)}`);
  checks.push(`colour variable created and bound (${JSON.stringify(created)})`);

  const valueField = panel.getByRole("textbox", { name: "Variable value", exact: true });
  await valueField.fill("#00ff00");
  await valueField.press("Enter");
  await settlePanels(page);
  const edited = await state();
  assert.equal(edited.fill, "#00ff00", `value edit must propagate to the bound fill: ${JSON.stringify(edited)}`);
  checks.push("variable value edit propagates to the bound rect fill");

  await panel.locator('button[title="Unlinked"]').first().click();
  await settlePanels(page);
  assert.equal((await state()).binding, null, "unlink must clear the binding");
  checks.push("unlink clears the binding");

  await page.keyboard.press("ControlOrMeta+Z");
  await settlePanels(page);
  assert.ok((await state()).binding, "one undo must restore the unlinked binding");
  checks.push("one undo restores the binding");

  // Export: title and add entry visible by default; add a preset, then download PNG and JPEG.
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
  const pngPath = join(EVIDENCE, "rect-1x-or-2x.png");
  await pngDownload.saveAs(pngPath);
  const png = pngSize(await readFile(pngPath));
  assert.deepEqual(png, { width: 240, height: 160 }, `PNG at 2x must be 240x160, got ${png.width}x${png.height}`);
  checks.push(`PNG export at 2x: ${png.width}x${png.height}`);

  await panel.getByRole("button", { name: "Format", exact: true }).click();
  await page.getByRole("option", { name: /JPEG/i }).click();
  await settlePanels(page);
  const [jpegDownload] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  const jpegPath = join(EVIDENCE, "rect-2x.jpg");
  await jpegDownload.saveAs(jpegPath);
  const jpeg = jpegSize(await readFile(jpegPath));
  assert.deepEqual(jpeg, { width: 240, height: 160 }, `JPEG at 2x must be 240x160, got ${jpeg.width}x${jpeg.height}`);
  checks.push(`JPEG export at 2x: ${jpeg.width}x${jpeg.height}`);

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 functional ok:\n- ${checks.join("\n- ")}`);
}, { openDocument: true, mcpLink: true });
