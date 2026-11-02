import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(async () => {
    const { mountEditorPageCompositionAudit } = await import("/tests/e2e/editor-page-composition-harness.jsx");
    window.__pageComposition = mountEditorPageCompositionAudit();
  });
  await page.waitForFunction(() => window.__pageComposition?.entry?.ready);
  assert.equal(await page.evaluate(() => window.__pageComposition.entry.engine.sampleColorAt({ x: 40, y: 35 })), "#ff0000");
  assert.equal(await page.locator('#editor-page-composition-audit [data-testid="editor-2d-canvas"]').count(), 1);
  checks.push("a composed full Page opens the eviction snapshot over stored artwork and retains its own actual 2D canvas");

  await page.evaluate(() => {
    const api = window.__pageComposition;
    api.originalEngine = api.entry.engine;
    api.entry.engine.updateNode("composition-rect", { fill: "#0000ff" });
    api.version = "latest";
    api.render({ snapshot: { doc: { ...api.props.snapshot.doc, backgroundColor: "#ffff00" } } });
  });
  await settled();
  assert.equal(await page.evaluate(() => window.__pageComposition.entry.engine === window.__pageComposition.originalEngine), true);
  assert.equal(await page.evaluate(() => window.__pageComposition.entry.engine.sampleColorAt({ x: 40, y: 35 })), "#0000ff");
  await page.evaluate(() => window.__pageComposition.entry.engine.setColor("#112233"));
  await settled();
  assert.equal(await page.evaluate(() => window.__pageComposition.changes.at(-1)), "latest");
  checks.push("rerendered source props preserve live edits and route subsequent engine notifications through the latest page callback");

  const header = page.locator('#editor-page-composition-audit [data-testid="editor-page-title"]');
  await header.dblclick();
  const name = page.locator('#editor-page-composition-audit [data-testid="editor-page-title-input"]');
  await name.fill("Renamed page");
  await name.press("Enter");
  await page.locator('#editor-page-composition-audit [data-testid="editor-page-title-text"]').getByText("Renamed page", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__pageComposition.renames), [{ version: "latest", id: "page-composition-fixture", name: "Renamed page" }]);
  assert.equal(await page.evaluate(() => window.__pageComposition.entry.engine === window.__pageComposition.originalEngine), true);
  checks.push("the extracted full-page title supports an actual double-click rename without recreating its engine");

  await page.evaluate(() => {
    const api = window.__pageComposition;
    api.appendCalls = 0;
    const append = api.entry.engine.appendImageLayers;
    api.entry.engine.appendImageLayers = (...args) => { api.appendCalls++; return append(...args); };
    api.addExternalImage();
  });
  await page.waitForFunction(() => window.__pageComposition.entry.engine.getDocument().nodes.some(node => node.imageId === "composition-external-image"));
  assert.deepEqual(await page.evaluate(() => {
    const api = window.__pageComposition;
    const added = api.entry.engine.getDocument().nodes.filter(node => node.imageId === "composition-external-image");
    return { appendCalls: api.appendCalls, copies: added.length,
      pixel: api.entry.engine.sampleColorAt({ x: added[0].x + added[0].width / 2, y: added[0].y + added[0].height / 2 }),
      retained: api.entry.engine.getNode("composition-rect").fill };
  }), { appendCalls: 1, copies: 1, pixel: "#11dd44", retained: "#0000ff" });
  checks.push("two workflow cache notifications ingest one decoded external image while preserving existing live artwork");

  await page.evaluate(() => window.__pageComposition.render({ active: false }));
  await page.waitForFunction(() => window.__pageComposition.entry?.engine === null);
  assert.deepEqual(await page.evaluate(() => {
    const disposal = window.__pageComposition.disposals.at(-1);
    return { version: disposal.version, ready: disposal.ready, fill: disposal.doc.nodes.find(node => node.id === "composition-rect").fill,
      imageCount: disposal.doc.nodes.filter(node => node.imageId === "composition-external-image").length };
  }), { version: "latest", ready: true, fill: "#0000ff", imageCount: 1 });
  await page.evaluate(() => window.__pageComposition.render({ active: true }));
  await page.waitForFunction(() => window.__pageComposition.entry?.ready);
  assert.deepEqual(await page.evaluate(() => {
    const api = window.__pageComposition, engine = api.entry.engine;
    return { replaced: engine !== api.originalEngine, fill: engine.getNode("composition-rect").fill,
      imageCount: engine.getDocument().nodes.filter(node => node.imageId === "composition-external-image").length };
  }), { replaced: true, fill: "#0000ff", imageCount: 1 });
  await page.evaluate(() => window.__pageComposition.close());
  checks.push("actual Page deactivation snapshots through the latest ready callback and reactivation restores edited objects and ingested images");
  await page.evaluate(async () => {
    const { mountEditorStatusAudit } = await import("/tests/e2e/editor-page-composition-harness.jsx");
    window.__statusComposition = mountEditorStatusAudit();
  });
  const notices = page.locator("#editor-status-audit");
  await notices.getByText("editor.storage.persistQuotaWarning", { exact: true }).waitFor();
  await notices.getByText("Model failed", { exact: true }).waitFor();
  await notices.locator('[data-testid="editor-ai-error"]').getByRole("button", { name: "error.dismiss" }).click();
  await notices.getByText("Model failed", { exact: true }).waitFor({ state: "detached" });
  await notices.getByText("editor.storage.persistQuotaWarning", { exact: true }).waitFor();
  await notices.getByRole("button", { name: "error.dismiss" }).click();
  await notices.getByRole("alert").waitFor({ state: "detached" });
  assert.deepEqual(await page.evaluate(() => window.__statusComposition.dismissals), ["aiErrorText", "persistQuota"]);
  checks.push("model and persistence warnings dismiss independently through their own actual notice buttons");
  await page.evaluate(() => window.__statusComposition.render({ imageActionError: "editor.imageAction.noImage", aiErrorText: "Second failure" }));
  await notices.getByText("editor.imageAction.noImage", { exact: true }).waitFor();
  assert.equal(await notices.getByText("Second failure", { exact: true }).count(), 0);
  await page.evaluate(() => window.__statusComposition.render({ imageActionError: null }));
  await notices.getByText("Second failure", { exact: true }).waitFor();
  await page.evaluate(() => window.__statusComposition.close());
  checks.push("image-action errors keep precedence and the pending model warning becomes visible when that error clears");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
