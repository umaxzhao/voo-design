/**
 * UF19 UI regression: Browser drawer → Paste & Import Custom HTML keeps the
 * root background on the imported frame, leaves the document canvas alone,
 * and survives one Undo/Redo. Driven through the real UI controls.
 */
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const TYPOGRAPHY_HTML = `<main style="width: 352px; padding: 16px; background-color: #ffffff; font: 16px Arial;">
  <h1 style="font-size: 24px; margin: 0 0 8px 0;">Typography</h1>
  <p style="font-size: 14px; margin: 0;">Body copy line one.</p>
</main>`;

const PLAIN_HTML = `<main style="width: 200px;"><p style="font-size: 14px; margin: 0;">No background here</p></main>`;

/** Pixel probe of an exported PNG of one node: its alpha and colour at a padding pixel. */
async function probeExportedPixel(page, nodeId) {
  return page.evaluate(async (id) => {
    const result = window.__vooEditor.exportSelectionPng([id], { scale: 1, type: "image/png", transparent: true });
    const url = typeof result === "string" ? result : result?.dataUrl;
    if (!url) return null;
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const [r, g, b, a] = ctx.getImageData(2, 2, 1, 1).data;
    return { width: img.width, height: img.height, rgba: [r, g, b, a] };
  }, nodeId);
}

async function importCustomHtml(page, html) {
  const drawer = page.getByTestId("voo-browser-drawer");
  if (!(await drawer.locator("textarea").isVisible())) {
    await drawer.getByRole("button", { name: "Browser tools" }).click();
    await page.getByRole("menuitem", { name: "Paste & Import Custom HTML" }).click();
  }
  await drawer.locator("textarea").fill(html);
  const count = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  await drawer.getByRole("button", { name: "Convert to Canvas Layers" }).click();
  await page.waitForFunction((previous) => window.__vooEditor.getDocument().nodes.length > previous, count);
}

await withEditorBrowser(async ({ page, errors }) => {
  await page.getByTestId("titlebar-browser-button").click();
  const drawer = page.getByTestId("voo-browser-drawer");
  await drawer.waitFor();

  await drawer.getByRole("button", { name: "Browser tools" }).click();
  await page.getByRole("menuitem", { name: "Paste & Import Custom HTML" }).click();
  await drawer.locator("textarea").fill(TYPOGRAPHY_HTML);
  const before = await page.evaluate(() => {
    const doc = window.__vooEditor.getDocument();
    return { background: doc.background, count: doc.nodes.length, ids: doc.nodes.map((node) => node.id) };
  });
  await drawer.getByRole("button", { name: "Convert to Canvas Layers" }).click();

  await page.waitForFunction((count) => window.__vooEditor.getDocument().nodes.length > count, before.count);
  const after = await page.evaluate((ids) => {
    const doc = window.__vooEditor.getDocument();
    const frame = doc.nodes.find((node) => !node.parentId && node.isFrame && node.fill && !ids.includes(node.id));
    return { background: doc.background, frameFill: frame?.fill ?? null, frameId: frame?.id ?? null, count: doc.nodes.length };
  }, before.ids);
  assert.equal(after.background, before.background, "document canvas background must not be overwritten");
  // The browser measures computed styles, so the colour may arrive as rgb().
  assert.ok(
    ["#ffffff", "rgb(255, 255, 255)"].includes(after.frameFill),
    `root background must land on the imported frame, got ${after.frameFill}`,
  );
  assert.ok(after.count > before.count, "import must add layers");
  // Original HTML content must survive the import as real text layers, not just the frame.
  const importedTexts = await page.evaluate((ids) => window.__vooEditor.getDocument().nodes
    .filter((node) => !ids.includes(node.id) && node.kind === "text")
    .map((node) => node.text), before.ids);
  assert.ok(importedTexts.includes("Typography"), `heading text must survive import, got ${JSON.stringify(importedTexts)}`);
  assert.ok(importedTexts.includes("Body copy line one."), `body text must survive import, got ${JSON.stringify(importedTexts)}`);

  await page.getByTestId("editor-pages").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("ControlOrMeta+Z");
  const undone = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  assert.equal(undone, before.count, "one Undo must remove the whole import");
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  const redone = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  assert.equal(redone, after.count, "one Redo must restore the whole import");

  const opaque = await probeExportedPixel(page, after.frameId);
  assert.ok(opaque, "frame must export as PNG");
  assert.equal(opaque.rgba[3], 255, "root background must be opaque in the exported PNG");
  assert.deepEqual(opaque.rgba.slice(0, 3), [255, 255, 255], "root background must be white");

  const knownIds = await page.evaluate(() => window.__vooEditor.getDocument().nodes.map((node) => node.id));
  await importCustomHtml(page, PLAIN_HTML);
  const plainId = await page.evaluate((previous) => {
    const doc = window.__vooEditor.getDocument();
    return doc.nodes.filter((node) => !node.parentId && !previous.includes(node.id)).at(-1)?.id ?? null;
  }, knownIds);
  assert.ok(plainId, "plain import must add a root layer");
  const transparent = await probeExportedPixel(page, plainId);
  assert.equal(transparent.rgba[3], 0, "an HTML root without a background must stay transparent");

  assert.deepEqual(errors, [], `unexpected page errors: ${errors.join("\n")}`);
  console.log("browser-html-root-background e2e: pass");
});
