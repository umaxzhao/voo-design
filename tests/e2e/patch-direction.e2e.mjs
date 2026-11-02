import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { importZipFromWelcome, saveZipSnapshot } from "./uf13-pen-join-helpers.mjs";
// Optional evidence directory for the before/after PNGs reviewed by a human.
const EVIDENCE = process.env.UF14_EVIDENCE;
// Each direction's result is saved as a portable ZIP and reopened in a new browser process.
const COLD_DIR = process.env.UF14_COLD_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-uf14-cold-reopen");

// UF14 regression: the Patch tool's Source / Destination direction must reach the engine
// and change which region receives pixels. Source writes the lasso (the region dragged
// away from); Destination writes the dragged-to location from the lasso's content.
const IMAGE_AT = { x: 100, y: 100, size: 100 };
// Lasso (document coordinates) and the drag that moves it 40 px left.
const LASSO = { x0: 140, y0: 140, x1: 170, y1: 170 };
const DRAG = { from: { x: 155, y: 155 }, to: { x: 115, y: 155 } };
const DX = DRAG.to.x - DRAG.from.x;
const destinationBox = { x0: LASSO.x0 + DX, y0: LASSO.y0, x1: LASSO.x1 + DX, y1: LASSO.y1 };

/** Image pixels of one node as {width, data}, so regions can be addressed in image space. */
async function readPixels(page, id) {
  return page.evaluate(async (nodeId) => {
    const result = window.__vooEditor.exportSelectionPng([nodeId]);
    const src = typeof result === "string" ? result : result.dataUrl;
    const image = new Image(); image.src = src; await image.decode();
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
    return { width: c.width, data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
  }, id);
}

// Count changed RGB bytes inside a document-space square, in image pixel coordinates.
function changedIn(before, after, box) {
  const scale = before.width / IMAGE_AT.size;
  let count = 0;
  for (let y = Math.floor((box.y0 - IMAGE_AT.y) * scale); y < Math.ceil((box.y1 - IMAGE_AT.y) * scale); y += 1) {
    for (let x = Math.floor((box.x0 - IMAGE_AT.x) * scale); x < Math.ceil((box.x1 - IMAGE_AT.x) * scale); x += 1) {
      const i = (y * before.width + x) * 4;
      for (let c = 0; c < 3; c += 1) if (before.data[i + c] !== after.data[i + c]) count += 1;
    }
  }
  return count;
}

const coldResults = new Map();

await withEditorBrowser(async ({ page, tool, errors }) => {
  const client = (point) => page.evaluate(async (point) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const e = window.__vooEditor;
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = e.getDocument();
    return { x: rect.left + point.x * rect.width / doc.width, y: rect.top + point.y * rect.height / doc.height };
  }, point);
  const drag = async (from, to) => {
    const a = await client(from), b = await client(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
  };
  const seedImage = () => page.evaluate(async ({ at, size }) => {
    const e = window.__vooEditor;
    e.endMaskEdit(); e.setTool("select"); e.selectExactly([]);
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff", nodes: [] });
    const c = document.createElement("canvas"); c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) {
      ctx.fillStyle = (x * 3 + y * 5) % 16 < 8 ? "#c04030" : "#405080";
      ctx.fillRect(x, y, 4, 4);
    }
    const n = await e.insertImage(c.toDataURL(), { x: at, y: at });
    // insertImage may place the node elsewhere; pin it so the lasso geometry above is exact.
    e.updateNode(n.id, { x: at, y: at });
    e.selectExactly([n.id]);
    return n.id;
  }, { at: IMAGE_AT.x, size: IMAGE_AT.size });

  // Real toolbar entry: the Healing family chevron, then its Patch item (not an engine setTool call).
  const enterPatchFromToolbar = async () => {
    await page.getByTestId("editor-healing-menu-trigger").click();
    await page.getByRole("menuitem", { name: /^(Patch|修补)$/ }).first().click();
    await page.waitForFunction(() => window.__vooEditor.getHealingMode() === "patch");
    // The toolbar's healing button is pressed and labelled with the active mode (Patch).
    await page.getByRole("button", { name: /^(Patch|修补)$/, pressed: true }).first().waitFor({ timeout: 5000 });
  };

  const runPatch = async (direction) => {
    const id = await seedImage();
    const before = await readPixels(page, id);
    await enterPatchFromToolbar();
    // Use the panel's own Source / Destination control, as a user would.
    await page.locator("button[aria-pressed]").filter({ hasText: direction === "source" ? /^(Source|源)$/ : /^(Destination|目标)$/ }).first().click();
    const corners = [[LASSO.x0, LASSO.y0], [LASSO.x1, LASSO.y0], [LASSO.x1, LASSO.y1], [LASSO.x0, LASSO.y1], [LASSO.x0, LASSO.y0]];
    const start = await client({ x: corners[0][0], y: corners[0][1] });
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    for (const [x, y] of corners.slice(1)) {
      const at = await client({ x, y }); await page.mouse.move(at.x, at.y, { steps: 4 });
    }
    await page.mouse.up();
    assert.ok(await page.evaluate(() => window.__vooEditor.getPatchDraft()?.points.length >= 3), "lasso becomes a patch draft");
    const imageId = await page.evaluate((nodeId) => window.__vooEditor.getNode(nodeId).imageId, id);
    await drag(DRAG.from, DRAG.to);
    await page.waitForFunction(({ id: nodeId, imageId: previous }) => window.__vooEditor.getNode(nodeId).imageId !== previous, { id, imageId }, { timeout: 15000 });
    const after = await readPixels(page, id);
    assert.equal(await page.evaluate(() => window.__vooEditor.getPatchDirection()), direction, "engine stores the chosen direction");
    const lassoChanged = changedIn(before, after, LASSO);
    const destinationChanged = changedIn(before, after, destinationBox);
    if (EVIDENCE) {
      await mkdir(EVIDENCE, { recursive: true });
      const png = await page.evaluate((nodeId) => window.__vooEditor.exportSelectionPng([nodeId]), id);
      const dataUrl = typeof png === "string" ? png : png.dataUrl;
      await writeFile(join(EVIDENCE, `${direction}-after.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
      await writeFile(join(EVIDENCE, `${direction}-before.json`), JSON.stringify({ width: before.width }));
    }
    // Save the patched state (before Undo) as a normal portable ZIP for the cold reopen check.
    const zipPath = join(COLD_DIR, `patch-${direction}.zip`);
    await saveZipSnapshot(page, zipPath);
    coldResults.set(direction, { zipPath, after });
    await tool("undo");
    assert.deepEqual(await readPixels(page, id), before, `${direction}: one Undo restores the image`);
    await tool("redo");
    assert.deepEqual(await readPixels(page, id), after, `${direction}: one Redo re-applies the patch`);
    await tool("undo");
    assert.deepEqual(await readPixels(page, id), before, `${direction}: second Undo restores the image again`);
    return { lassoChanged, destinationChanged };
  };

  const source = await runPatch("source");
  assert.ok(source.lassoChanged > 0, "Source: the lasso region receives the patch");
  assert.equal(source.destinationChanged, 0, "Source: the dragged-to location is not written");

  const destination = await runPatch("destination");
  assert.ok(destination.destinationChanged > 0, "Destination: the dragged-to location receives the lasso content");
  assert.equal(destination.lassoChanged, 0, "Destination: the lasso region keeps its pixels");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(JSON.stringify({ source, destination }));
}, { openDocument: true, mcpLink: true });

// Cold reopen per direction: each result must come back pixel-identical in a new browser process.
for (const direction of ["source", "destination"]) {
  const entry = coldResults.get(direction);
  assert.ok(entry, `${direction} result was captured for the cold reopen`);
  await withEditorBrowser(async ({ page, errors }) => {
    page.setDefaultTimeout(30000);
    await importZipFromWelcome(page, entry.zipPath);
    const reopenedId = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find((n) => n.kind === "image")?.id ?? null);
    assert.ok(reopenedId, `${direction}: cold reopen keeps the image layer`);
    const reopened = await readPixels(page, reopenedId);
    assert.deepEqual(reopened, entry.after, `${direction}: cold reopen keeps the patched pixels`);
    assert.deepEqual(errors, [], `${direction} cold reopen page errors: ${errors.join("\n")}`);
    console.log(JSON.stringify({ cold: direction, pass: true, zip: entry.zipPath }));
  }, { openDocument: false, mcpLink: false });
}
