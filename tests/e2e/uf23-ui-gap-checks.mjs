import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { TARGET_NAME, seedFixture, observe, client, drag, settle, screenPixels, pixelsMatch, exportThroughUi, importThroughUi, saveThroughUi, attachInputRecorder, persistObservation } from "./uf23-ui-gap-helpers.mjs";

const out = process.env.UF23_EVIDENCE_DIR;
assert.ok(out, "UF23_EVIDENCE_DIR is required");
await mkdir(out, { recursive: true });
const options = { preparePage: async (page) => page.addInitScript(() => {
  // Exercise browser downloads and the real HTML file chooser without OS dialogs.
  window.showSaveFilePicker = undefined;
  window.showOpenFilePicker = undefined;
}) };
const prior = process.env.UF23_ARTIFACTS ? JSON.parse(await readFile(process.env.UF23_ARTIFACTS, "utf8")) : null;
const artifacts = prior?.artifacts ?? [];
const references = prior?.references ?? {};
const failures = prior?.failures ?? [];
function check(name, callback) {
  try { callback(); } catch (error) { failures.push({ name, message: error.message, stack: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
const target = (observation) => observation.doc.nodes.find((node) => node.name === TARGET_NAME);
const geometry = (node) => [node.x, node.y, node.width, node.height];
async function session(name, callback) {
  await withEditorBrowser(async ({ page }) => {
    await page.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
    await attachInputRecorder(page);
    try { await callback(page); }
    finally {
      await writeFile(`${out}/failures.json`, JSON.stringify(failures, null, 2));
      await persistObservation(page, out, `${name}-last`);
      await writeFile(`${out}/${name}-last.html`, await page.content());
      await page.context().tracing.stop({ path: `${out}/${name}-trace.zip` });
    }
  }, options);
}
if (!prior) await session("chain", async (page) => {
  await seedFixture(page);
  const before = target(await observe(page));
  const beforePixels = await screenPixels(page);
  const pointer = await drag(page, { x: 356, y: 248 }, { x: 378, y: 156 });
  const moved = target(await observe(page));
  assert.notEqual(moved.fill, before.fill);
  assert.equal(moved.fill, moved.fills[0].fill);
  assert.deepEqual(geometry(moved), geometry(before));
  assert.match(moved.fill, /90% 22\.5%/);
  const movedPixels = await screenPixels(page);
  assert.notDeepEqual(movedPixels, beforePixels);
  await persistObservation(page, out, "01-gradient-drag", { pointer, before, beforePixels, pixels: movedPixels });
  const panel = page.getByTestId("editor-properties-panel");
  await panel.getByRole("button", { name: "Add fill", exact: true }).click();
  const rows = panel.locator("[data-fill-paint-row]");
  await rows.nth(1).waitFor(); assert.equal(await rows.count(), 2);
  const colour = rows.nth(1).getByRole("textbox", { name: "Custom colour", exact: true });
  await colour.fill("00ff00"); await colour.press("Enter");
  await rows.nth(1).getByRole("button", { name: "Fill", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Fill", exact: true });
  await picker.getByTestId("picker-opacity-input").fill("35");
  await picker.getByTestId("picker-opacity-input").press("Enter");
  await page.keyboard.press("Escape"); await picker.waitFor({ state: "detached" }); await settle(page);
  const dual = target(await observe(page));
  assert.equal(dual.fills.length, 2); assert.equal(dual.fill, dual.fills[0].fill);
  assert.equal(dual.fills[1].fill.toLowerCase(), "#00ff00"); assert.equal(dual.fills[1].opacity, 0.35);
  references.gradient = await screenPixels(page);
  assert.notDeepEqual(references.gradient, movedPixels);
  await persistObservation(page, out, "02-dual-fill", { pixels: references.gradient });
  for (const format of ["fig", "svg"]) artifacts.push({ stage: "gradient", format, ...await exportThroughUi(page, out, "gradient-dual", format) });
  const at = await client(page, { x: 290, y: 200 });
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.getByTestId("editor-menu-component-submenu").hover();
  await page.getByTestId("editor-menu-create-component").click();
  const properties = page.getByTestId("editor-instance-properties"); await properties.waitFor(); await settle(page);
  await persistObservation(page, out, "03-component-created");
  const hex = properties.getByTestId("editor-instance-overrides-group").getByRole("textbox", { name: "Fill hex", exact: true });
  await hex.fill("0066ff"); await hex.press("Enter"); await settle(page);
  const instance = await observe(page);
  assert.ok(JSON.stringify(instance.doc).toLowerCase().includes("#0066ff"), "Host instance override must contain blue");
  assert.ok(Object.values(instance.editors).some((doc) => doc.nodes.some((node) => node.name === TARGET_NAME && node.fill === dual.fill)), "Shared master retains the original gradient");
  references.detached = await screenPixels(page);
  check("Instance override preserves secondary fill pixels", () => pixelsMatch(references.detached, [[0, 156, 166, 255], [0, 156, 166, 255], [0, 156, 166, 255]]));
  await persistObservation(page, out, "04-instance-override", { pixels: references.detached });
  references.instance = references.detached;
  artifacts.push({ stage: "instance", format: "zip", ...await saveThroughUi(page, out, "uf23-instance") });
  await properties.getByTestId("editor-instance-detach").click(); await properties.waitFor({ state: "detached" }); await settle(page);
  const detached = target(await observe(page));
  assert.ok(detached, "Detached target exists in the focused host");
  assert.equal(detached.fill.toLowerCase(), "#0066ff"); assert.equal(detached.fills[0].fill.toLowerCase(), "#0066ff");
  assert.equal(detached.fills.length, 2); assert.equal(detached.fills[1].fill.toLowerCase(), "#00ff00");
  assert.equal(detached.fills[1].opacity, 0.35); assert.deepEqual(geometry(detached), geometry(dual));
  const detachPixels = await screenPixels(page);
  check("Detach/Undo/Redo preserves instance pixels", () => pixelsMatch(detachPixels, references.detached));
  references.detachedExport = detachPixels;
  await page.keyboard.press("Control+z"); await properties.waitFor(); await settle(page);
  pixelsMatch(await screenPixels(page), references.detached);
  await page.keyboard.press("Control+Shift+z"); await properties.waitFor({ state: "detached" }); await settle(page);
  assert.equal(target(await observe(page)).fills[0].fill.toLowerCase(), "#0066ff");
  const redoPixels = await screenPixels(page);
  check("Redo matches instance appearance", () => pixelsMatch(redoPixels, references.detached));
  pixelsMatch(redoPixels, detachPixels);
  await persistObservation(page, out, "05-detach-undo-redo", { pixels: await screenPixels(page) });
  for (const format of ["fig", "svg"]) artifacts.push({ stage: "detached", format, ...await exportThroughUi(page, out, "detached-dual", format) });
  artifacts.push({ stage: "saved", format: "zip", ...await saveThroughUi(page, out) });
  await writeFile(`${out}/artifacts.json`, JSON.stringify({ artifacts, references, failures }, null, 2));
});
for (const artifact of artifacts) {
  try { await session(`reopen-${artifact.stage}-${artifact.format}`, async (page) => {
    await importThroughUi(page, artifact);
    await page.waitForFunction(async () => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const id = useDesignStore.getState().editingNodeId;
      return (window.__vooEditors?.[id] ?? window.__vooEditor)?.getDocument().nodes.length > 0;
    });
    await settle(page);
    const observation = await observe(page);
    assert.ok(observation.doc.nodes.length > 0);
    if (artifact.stage === "instance") {
      const instance = observation.doc.nodes.find((node) => node.kind === "canvasInstance");
      assert.ok(instance, "Cold reopen retains the actual component instance");
      assert.equal(instance.instance.overrides.nodes["uf23-target"].fill.toLowerCase(), "#0066ff");
    } else if (artifact.format !== "svg") {
      const node = target(observation); assert.ok(node, "Round-trip target name");
      assert.equal(node.fills.length, 2); assert.equal(node.fill, node.fills[0].fill);
      assert.ok(Math.abs(node.fills[1].opacity - 0.35) < 1e-7, "FIG float32 retains secondary opacity");
      if (artifact.stage !== "gradient") assert.equal(node.fills[0].fill.toLowerCase(), "#0066ff");
    }
    const expected = references[artifact.stage] ?? references.detachedExport;
    const node = target(observation) ?? observation.doc.nodes.find((item) => item.width === 220 && item.height === 160);
    assert.ok(node, "Imported artwork bounds are observable");
    const points = [22, 110, 198].map((x) => ({ x: node.x + x, y: node.y + 96 }));
    const pixels = await screenPixels(page, points);
    await persistObservation(page, out, `06-import-${artifact.stage}-${artifact.format}`, { artifact, points, pixels, expected });
    pixelsMatch(pixels, expected);
    // History assertions use actual mouse selection and keyboard operations after import.
    const at = await client(page, points[1]);
    await page.mouse.click(at.x, at.y); await page.keyboard.press("Delete"); await settle(page);
    assert.notDeepEqual(await screenPixels(page, points), pixels, "Delete must change the imported artwork pixels");
    await page.keyboard.press("Control+z"); await settle(page);
    pixelsMatch(await screenPixels(page, points), pixels);
    await page.keyboard.press("Control+Shift+z"); await settle(page);
    assert.notDeepEqual(await screenPixels(page, points), pixels, "Redo must restore the deletion");
    await page.keyboard.press("Control+z"); await settle(page);
    pixelsMatch(await screenPixels(page, points), pixels);
    await persistObservation(page, out, `07-import-history-${artifact.stage}-${artifact.format}`, { artifact, points, pixels });
    console.log(`PASS real UI ${artifact.stage} ${artifact.format} import/reopen; pixels ${JSON.stringify(pixels)}`);
  }); } catch (error) { failures.push({ name: `Import ${artifact.stage} ${artifact.format}`, message: error.message, stack: error.stack }); console.error(`FAIL import ${artifact.stage} ${artifact.format}: ${error.message}`); }
}
await writeFile(`${out}/failures.json`, JSON.stringify(failures, null, 2));
assert.equal(failures.length, 0, JSON.stringify(failures));
console.log("PASS UF23 real-mouse gradient, dual fill, instance override/detach with Undo/Redo, actual FIG/SVG downloads/imports, and cold portable ZIP reopen");
