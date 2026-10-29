import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const pattern = /\/src\/canvas\/components\/editor_comments_surface\.jsx(?:\?|$)/;
  const requests = new Set(await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name)));
  page.on("request", request => requests.add(request.url()));
  assert.equal([...requests].some(url => pattern.test(url)), false);
  await page.getByTestId("editor-comments-toggle").waitFor();
  checks.push("an empty editor exposes its comment launcher without downloading the comments surface");

  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, {
      id: "comment-loading-target", kind: "rect", visible: true, x: 100, y: 100,
      width: 100, height: 80, fill: "#ff0000", strokeWidth: 0,
    }] });
    e.selectExactly(["comment-loading-target"]);
  });
  const selected = () => page.evaluate(() => window.__vooEditor.getSelectedIds());
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route(pattern, async route => { await blocked; await route.continue(); });
  try {
    await page.getByTestId("editor-comments-toggle").click();
    await page.getByTestId("editor-comments-loading").waitFor();
    assert.equal(await page.getByTestId("editor-pages").isVisible(), true);
    assert.deepEqual(await selected(), ["comment-loading-target"]);
    await page.keyboard.press("Escape");
    await page.getByTestId("editor-comments-loading").waitFor({ state: "hidden" });
    assert.deepEqual(await selected(), ["comment-loading-target"]);
    const responded = page.waitForResponse(response => pattern.test(response.url()) && response.ok());
    release(); await responded; await page.unroute(pattern);
    await page.waitForLoadState("networkidle");
    assert.equal(await page.getByTestId("editor-comments-panel").count(), 0);
    assert.equal(await page.getByTestId("editor-comment-composer").count(), 0);
    checks.push("cold comment loading consumes Escape before canvas selection and a cancelled import cannot reopen the panel");
  } finally { release(); await page.unroute(pattern); }

  await page.getByTestId("editor-comments-toggle").click();
  const panel = page.getByTestId("editor-comments-panel");
  await panel.waitFor();
  await panel.getByRole("button", { name: /^All\b/ }).click();
  await page.getByTestId("editor-comments-add-mode").click();
  const mode = page.getByTestId("editor-comment-mode-overlay");
  await mode.click({ position: { x: 700, y: 350 } });
  const composer = page.getByTestId("editor-comment-composer");
  await composer.getByRole("textbox").fill("Cancel only this draft");
  await page.keyboard.press("Escape");
  await composer.waitFor({ state: "hidden" });
  assert.equal(await mode.count(), 1);
  assert.deepEqual(await selected(), ["comment-loading-target"]);
  await page.keyboard.press("Escape");
  await mode.waitFor({ state: "hidden" });
  assert.equal(await panel.count(), 1);
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "hidden" });
  assert.deepEqual(await selected(), ["comment-loading-target"]);
  checks.push("warm Escape unwinds draft, placement mode and panel one at a time without changing artwork selection");

  await page.getByTestId("editor-comments-toggle").click();
  assert.equal(await panel.getByRole("button", { name: /^All\b/ }).getAttribute("aria-pressed"), "true");
  await page.getByTestId("editor-comments-add-mode").click();
  await mode.click({ position: { x: 700, y: 350 } });
  await composer.getByRole("textbox").fill("Deferred comments remain undoable");
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  const commentId = await page.evaluate(() => window.__vooEditor.getDocument().comments[0].id);
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].messages[0].body), "Deferred comments remain undoable");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments?.length ?? 0), 0);
  await tool("redo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].id), commentId);
  await panel.getByRole("button", { name: "Close comments", exact: true }).click();
  await page.getByTestId("editor-comment-pin").click();
  const thread = page.getByTestId("editor-comment-thread");
  await thread.getByRole("textbox", { name: "Reply", exact: true }).fill("Reply survives normal composition");
  await thread.getByRole("button", { name: "Reply", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].messages.length), 2);
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].messages.length), 1);
  checks.push("reopening keeps the filter and real create/reply operations retain single-step undo after lazy activation");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});

await withEditorBrowser(async ({ page }) => {
  const pattern = /\/src\/canvas\/components\/editor_comments_surface\.jsx(?:\?|$)/;
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, {
      id: "comments-failure-target", kind: "rect", visible: true, x: 100, y: 100,
      width: 100, height: 80, fill: "#ff0000", strokeWidth: 0,
    }] });
    e.selectExactly(["comments-failure-target"]);
  });
  await page.route(pattern, route => route.abort("failed"));
  await page.getByTestId("editor-comments-toggle").click();
  const failure = page.getByTestId("editor-comments-error");
  await failure.waitFor();
  assert.equal(await page.getByTestId("editor-pages").isVisible(), true);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["comments-failure-target"]);
  assert.equal(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 150, y: 140 })), "#ff0000");
  await page.unroute(pattern);
  await failure.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByTestId("editor-comments-panel").waitFor();
  assert.equal(await page.getByTestId("editor-comments-error").count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["comments-failure-target"]);
  console.log(JSON.stringify({ passed: ["a failed optional comments download reports a local error, preserves canvas pixels/selection and retries without reloading the document"] }, null, 2));
});
