import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const pattern = /\/src\/canvas\/components\/editor_comments_surface\.jsx(?:\?|$)/;

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route(pattern, async route => { await blocked; await route.continue(); });
  try {
    await page.evaluate(() => {
      localStorage.setItem("voo.comments.lastSeen", "0");
      const now = Date.now() - 1000;
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), comments: [
        { id: "initial-comment", x: 150, y: 120, createdAt: now,
          messages: [{ id: "first-message", body: "Initial open thread", createdAt: now }] },
        { id: "resolved-comment", x: 260, y: 180, resolved: true, createdAt: new Date(now).toISOString(),
          messages: [{ id: "resolved-message", body: "Initial resolved thread", createdAt: new Date(now).toISOString() }] },
      ] });
    });
    await page.getByTestId("editor-comments-unread-count").waitFor();
    assert.equal(await page.getByTestId("editor-comments-unread-count").textContent(), "2");
    assert.equal(await page.getByTestId("editor-comments-panel").count(), 0);
    assert.equal(await page.getByTestId("editor-comment-pin").count(), 0);
    assert.equal(await page.getByTestId("editor-comments-loading").count(), 0);
    checks.push("a closed document with existing comments exposes correct unread counts before its surface downloads");
    release();
    await page.getByTestId("editor-comment-pin").first().waitFor();
    assert.equal(await page.getByTestId("editor-comment-pin").count(), 2);
    assert.equal(await page.getByTestId("editor-comment-pin-new").count(), 2);
    assert.equal(await page.getByTestId("editor-comments-panel").count(), 0);
    assert.equal(await page.getByTestId("editor-comment-composer").count(), 0);
    checks.push("initial closed comments automatically load both pins and unread indicators without opening a panel or draft");
  } finally { release(); await page.unroute(pattern); }

  const cameraPin = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1.25, panX: 250, panY: 100 }, pendingArtboardFitId: null });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pin = document.querySelector('[data-comment-id="initial-comment"][data-comment-pin]').getBoundingClientRect();
    const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const width = window.__vooEditor.getDocument().width;
    const zoom = board.width / width;
    return { actualX: pin.left + pin.width / 2, actualY: pin.top + pin.height / 2,
      expectedX: board.left + 150 * zoom, expectedY: board.top + 120 * zoom };
  });
  assert.ok(Math.abs(cameraPin.actualX - cameraPin.expectedX) < 1, JSON.stringify(cameraPin));
  assert.ok(Math.abs(cameraPin.actualY - cameraPin.expectedY) < 1, JSON.stringify(cameraPin));
  checks.push("loaded comment pins stay in the current document camera space after a shared pan and zoom");

  await page.getByTestId("editor-comments-toggle").click();
  const panel = page.getByTestId("editor-comments-panel");
  await panel.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="editor-comment-pin-new"]').length === 0);
  await panel.getByRole("button", { name: "Close comments", exact: true }).click();
  assert.equal(await page.getByTestId("editor-comments-unread-count").count(), 0);
  await page.waitForTimeout(30);
  await page.evaluate(() => {
    const e = window.__vooEditor, doc = e.getDocument();
    e.updateDocument({ comments: doc.comments.map(comment => comment.id === "initial-comment"
      ? { ...comment, messages: [...comment.messages, { id: "incoming-reply", body: "Incoming reply", createdAt: Date.now() }] }
      : comment) });
  });
  await page.getByTestId("editor-comments-unread-count").waitFor();
  assert.equal(await page.getByTestId("editor-comments-unread-count").textContent(), "1");
  assert.equal(await page.getByTestId("editor-comment-pin-new").count(), 1);
  checks.push("opening marks existing normalized threads seen and a later incoming numeric-timestamp reply becomes unread again");
  await page.locator('[data-comment-pin][data-comment-id="initial-comment"]').click();
  const thread = page.getByTestId("editor-comment-thread");
  await thread.getByRole("textbox", { name: "Reply", exact: true }).fill("Keep this reply while new comments arrive");
  await page.evaluate(async () => {
    const e = window.__vooEditor, doc = e.getDocument();
    e.updateDocument({ comments: doc.comments.map(comment => comment.id === "resolved-comment"
      ? { ...comment, messages: [...comment.messages, { id: "second-incoming", body: "Other incoming reply", createdAt: Date.now() }] }
      : comment) });
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 280, panY: 100 } });
  });
  assert.equal(await thread.getByRole("textbox", { name: "Reply", exact: true }).inputValue(), "Keep this reply while new comments arrive");
  await page.keyboard.press("Escape");
  await thread.waitFor({ state: "hidden" });
  checks.push("an unposted reply survives normal document notifications and camera rerenders until the thread is explicitly dismissed");

  await page.getByTestId("editor-comments-toggle").click();
  await page.getByTestId("editor-comments-add-mode").click();
  await page.getByTestId("editor-comment-mode-overlay").click({ position: { x: 700, y: 350 } });
  const composer = page.getByTestId("editor-comment-composer");
  await composer.getByRole("textbox").fill("Keep this placement draft");
  await page.getByTestId("editor-comments-add-mode").click();
  await page.getByTestId("editor-comments-add-mode").click();
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1.1, panX: 260, panY: 100 } });
  });
  assert.equal(await composer.getByRole("textbox").inputValue(), "Keep this placement draft");
  checks.push("rapid placement-mode toggles and camera rerenders preserve a warm unposted draft");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route(pattern, async route => { await blocked; await route.continue(); });
  try {
    await page.evaluate(async () => {
      const { mountCommentsLifecycleAudit } = await import("/tests/e2e/comments-lifecycle-harness.jsx");
      window.__commentsLifecycle = mountCommentsLifecycleAudit();
    });
    const harness = page.locator("#comments-lifecycle-audit");
    await harness.getByTestId("editor-comments-loading").waitFor();
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.evaluate(() => window.__commentsLifecycle.calls), ["mode"]);
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.evaluate(() => window.__commentsLifecycle.calls), ["mode", "close"]);
    await page.evaluate(() => window.__commentsLifecycle.render({ open: true, addMode: true }));
    await harness.getByTestId("editor-comments-loading").waitFor();
    await harness.getByRole("button", { name: "editor.comments.close", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => ({ calls: window.__commentsLifecycle.calls,
      open: window.__commentsLifecycle.props.open, addMode: window.__commentsLifecycle.props.addMode })),
    { calls: ["mode", "close", "close"], open: false, addMode: false });
    checks.push("the cold Close button closes panel and mode together while Escape still removes only the active mode first");
    await page.evaluate(() => window.__commentsLifecycle.render({ open: true, addMode: true }));
    await harness.getByTestId("editor-comments-loading").waitFor();
    await page.evaluate(() => {
      window.__commentsLifecycle.close();
      window.__commentEscapeProbe = 0;
      window.__commentEscapeListener = event => { if (event.key === "Escape") window.__commentEscapeProbe++; };
      window.addEventListener("keydown", window.__commentEscapeListener, true);
    });
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.__commentEscapeProbe), 1);
    const response = page.waitForResponse(value => pattern.test(value.url()) && value.ok());
    release(); await response;
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("#comments-lifecycle-audit").count(), 0);
    assert.equal(await page.getByTestId("editor-comments-panel").count(), 0);
    assert.equal(await page.getByTestId("editor-comment-composer").count(), 0);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.__commentEscapeProbe), 2);
    checks.push("cold Escape callbacks use current mode/open state and unmount removes the layer before a pending module resolves");
    checks.push("a completed import cannot resurrect an unmounted comment surface or leave an Escape listener consuming canvas keys");
  } finally {
    release(); await page.unroute(pattern);
    await page.evaluate(() => {
      if (window.__commentEscapeListener) window.removeEventListener("keydown", window.__commentEscapeListener, true);
    });
  }
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
