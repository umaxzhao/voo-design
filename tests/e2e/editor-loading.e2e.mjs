import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const deferredBuilders = /(?:export_editor_pdf|presentation-pdf|presentation-pptx(?:-xml|-zip|-package)?)\.(?:js|jsx)(?:\?|$)/;

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  // Vite serves more modules than Chromium's default 150-entry timing buffer.
  // Reload this still-unopened document with timing capacity set before scripts.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
  await page.reload({ waitUntil: "networkidle" });
  const resources = () => page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name));
  const brand = page.getByTestId("editor-top-bar").getByRole("button", { name: "VOO Design", exact: true });
  await page.locator(".welcome-prompt-root textarea").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => Boolean(window.__vooEditor)), false);
  const welcomeResources = await resources();
  assert.equal(welcomeResources.some(name => /\/image_editor\.jsx(?:\?|$)/.test(name)), false,
    "The welcome screen must not request the editor implementation");
  assert.deepEqual(welcomeResources.filter(name => deferredBuilders.test(name)), [],
    "Opening the welcome screen must not request PDF/PPTX builders");
  assert.deepEqual(welcomeResources.filter(name => /\/(?:canvas_tools|scene_variables|scene_auto_layout|scene_snapping|google_fonts_index)\.js(?:\?|$)/.test(name)), [],
    "Configuration and model menus must not request canvas execution, layout, variables or font catalogs");
  checks.push("first welcome screen defers the editor, canvas executors, scene engines, font catalogs and export builders");

  // Hold the actual cold editor request so the loading surface is observable.
  let releaseEditor;
  const editorDownload = new Promise(resolve => { releaseEditor = resolve; });
  let finishDownload;
  const downloadFinished = new Promise(resolve => { finishDownload = resolve; });
  await page.route(/\/image_editor\.jsx(?:\?|$)/, async route => {
    await editorDownload;
    await route.continue();
    finishDownload();
  });
  try {
    await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
    const loading = page.getByTestId("loading-modal");
    await loading.waitFor();
    if (await loading.locator("[data-loading-brand]").count() !== 1) {
      await page.screenshot({ path: "/private/tmp/voo-license-regression/loading-brand-before.png" });
    }
    assert.equal(await loading.locator("[data-loading-brand]").count(), 1,
      "The editor loading surface uses the VOO brand icon instead of an accent ring");
    const icon = loading.locator("[data-loading-brand]");
    const progress = loading.getByRole("progressbar");
    assert.equal(await progress.getAttribute("aria-valuenow"), null, "Unknown download progress must not invent a percentage");
    // A rotating span's viewport rectangle includes its transparent corners.
    // Layout spacing must not depend on which animation frame was sampled.
    const brandGap = await loading.evaluate(element => {
      const brand = element.querySelector("[data-loading-brand]");
      const track = element.querySelector('[role="progressbar"]');
      return track.offsetTop - brand.offsetTop - brand.offsetHeight;
    });
    assert.ok(brandGap >= 20, "Progress sits below the brand with breathing room");
    assert.equal(await icon.evaluate(el => getComputedStyle(el).animationName), "voo-loading-turn");
    const transform = await icon.evaluate(el => getComputedStyle(el).transform);
    await page.waitForFunction(before => getComputedStyle(document.querySelector("[data-loading-brand]")).transform !== before, transform);
    await page.screenshot({ path: "/private/tmp/voo-license-regression/loading-brand-desktop.png" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await icon.evaluate(el => getComputedStyle(el).animationName), "none");
    assert.equal(await progress.locator("div").evaluate(el => getComputedStyle(el).animationName), "none");
    await page.setViewportSize({ width: 320, height: 700 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(async theme => {
        const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
        setEditorTheme(theme);
      }, theme);
      const geometry = await loading.evaluate(el => {
        const box = el.getBoundingClientRect(), rgb = getComputedStyle(el).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
        return { x: box.x, right: box.right, rgb };
      });
      assert.ok(geometry.x >= 0 && geometry.right <= 320, "Loading fits a narrow viewport");
      assert.equal(new Set(geometry.rgb).size, 1, "The loading surface is neutral in both themes");
      await page.screenshot({ path: `/private/tmp/voo-license-regression/loading-brand-${theme}-mobile.png` });
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    checks.push("cold editor loading uses the rotating VOO logo above a neutral honest progress bar; reduced motion and 320px themes remain usable");

  } finally {
    releaseEditor(); await downloadFinished; await page.unroute(/\/image_editor\.jsx(?:\?|$)/);
  }
  // Continue opening the same document created through the real title-bar action.
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.isCanvasRoot &&
    window.__vooEditor.getDocument().nodes.some(node => node.isFrame));
  await page.evaluate(async () => {
    window.__loadingAuditEngine = window.__vooEditor;
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 0.6, panX: 200, panY: 100 } });
    window.__vooEditor.setColor("#ff0000");
    window.__vooEditor.setTool("rect");
  });
  const client = (point) => page.evaluate(async point => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + point.x * rect.width / doc.width, y: rect.top + point.y * rect.height / doc.height };
  }, point);
  const start = await client({ x: 400, y: 250 }), end = await client({ x: 600, y: 400 });
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(node => node.kind === "rect" && node.fill === "#ff0000"));
  const created = await page.evaluate(() => {
    const e = window.__vooEditor;
    const node = e.getDocument().nodes.find(node => node.kind === "rect" && node.fill === "#ff0000");
    return { id: node.id, width: node.width, height: node.height, canUndo: e.canUndo() };
  });
  assert.ok(created.width > 100 && created.height > 80, "Real pointer input must create a visible rectangle");
  assert.equal(created.canUndo, true);
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 500, y: 325 })), "#ff0000");
  assert.ok((await resources()).some(name => /\/image_editor\.jsx(?:\?|$)/.test(name)));
  assert.deepEqual((await resources()).filter(name => deferredBuilders.test(name)), [],
    "Ordinary drawing must still defer PDF/PPTX builders until export");
  checks.push("New opens the deferred editor and real pointer drawing creates an undoable rectangle");

  await brand.click();
  await page.locator(".welcome-prompt-root textarea").waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => window.__vooEditor === window.__loadingAuditEngine), true);
  assert.equal(await page.evaluate(id => Boolean(window.__vooEditor.getNode(id)), created.id), true);
  await brand.click();
  await page.locator(".welcome-prompt-root").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.__vooEditor === window.__loadingAuditEngine), true);
  assert.equal(await page.evaluate(() => window.__vooEditor.canUndo()), true);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(id => Boolean(window.__vooEditor.getNode(id)), created.id), false);
  await page.evaluate(() => window.__vooEditor.redo());
  assert.equal(await page.evaluate(id => Boolean(window.__vooEditor.getNode(id)), created.id), true);
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 500, y: 325 })), "#ff0000");
  checks.push("returning through welcome preserves the engine, artwork and one-step undo/redo");
  const downloadEvent = page.waitForEvent("download");
  await page.evaluate(async () => {
    const { exportEditorImage } = await import("/src/canvas/components/editor_hooks/export_editor_image.js");
    await exportEditorImage({ engine: window.__vooEditor, format: "pdf", scale: 1, name: "LoadingAudit", title: "Loading audit", transparent: false });
  });
  const download = await downloadEvent;
  const pdf = await readFile(await download.path());
  assert.equal(download.suggestedFilename(), "LoadingAudit.pdf");
  assert.match(pdf.subarray(0, 12).toString("ascii"), /^%PDF-/);
  assert.ok((await resources()).some(name => /\/export_editor_pdf\.js(?:\?|$)/.test(name)));
  checks.push("PDF builder loads only when requested and produces an actual downloadable PDF");
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { openDocument: false, mcpLink: false });
