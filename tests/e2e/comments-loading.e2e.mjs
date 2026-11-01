import { checkCommentPanelSlot } from "./comment-panel-slot-checks.mjs";
import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

async function expectHit(target) {
  const report = await target.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const ancestors = node => {
      const chain = [];
      while (node instanceof Element) {
        const style = getComputedStyle(node);
        chain.push({ node: node.getAttribute("data-testid") || node.tagName, z: style.zIndex,
          position: style.position, transform: style.transform, opacity: style.opacity,
          isolation: style.isolation, filter: style.filter, pointerEvents: style.pointerEvents });
        node = node.parentElement;
      }
      return chain;
    };
    return { reachable: Boolean(hit && element.contains(hit)), target: ancestors(element), actual: ancestors(hit) };
  });
  assert.equal(report.reachable, true, JSON.stringify(report));
}

async function placeBesideInspector(page, mode) {
  const position = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="editor-comment-mode-overlay"]').getBoundingClientRect();
    const inspector = document.querySelector('[data-testid="editor-properties-panel"]').getBoundingClientRect();
    return { x: inspector.left - stage.left - 20, y: inspector.top - stage.top + 120 };
  });
  await mode.click({ position });
}

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  await page.locator('[data-open-guard="off"]').waitFor();
  const pattern = /\/src\/canvas\/components\/editor_comments_surface\.jsx(?:\?|$)/;
  const requests = new Set(await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name)));
  page.on("request", request => requests.add(request.url()));
  assert.equal([...requests].some(url => pattern.test(url)), false);
  await page.getByTestId("editor-comments-toggle").waitFor();
  const launcher = await page.getByTestId("editor-comments-toggle").boundingBox();
  const navigation = await page.getByTestId("page-switcher").getByRole("button", { name: "Pages", exact: true }).boundingBox();
  assert.ok(launcher.x >= navigation.x + navigation.width && Math.abs(launcher.y + launcher.height / 2 - navigation.y - navigation.height / 2) < 2,
    "Comments must sit beside the page name on its right");
  checks.push("an empty editor exposes its comment launcher beside page navigation without downloading the comments surface");

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
    assert.equal(await page.getByTestId("editor-properties-panel").count(), 1);
    assert.equal(await page.getByTestId("editor-properties-panel").getByRole("spinbutton", { name: "W", exact: true }).count(), 0);
    await expectHit(page.getByTestId("editor-comments-loading").getByRole("button", { name: "Close comments", exact: true }));
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
  assert.equal(await page.getByTestId("editor-properties-panel").count(), 1);
  assert.equal(await panel.locator("xpath=ancestor::aside").getAttribute("data-testid"), "editor-properties-panel");
  assert.equal(await page.getByTestId("editor-properties-panel").getByRole("spinbutton", { name: "W", exact: true }).count(), 0);
  const allFilter = panel.getByRole("button", { name: /^All\b/ });
  await expectHit(allFilter);
  await allFilter.click();
  await page.evaluate(() => window.__vooEditor.updateDocument({
    guides: [{ id: "comments-placement-guide", type: "vertical", pos: 300 }],
  }));
  await page.getByTestId("editor-guide").waitFor();
  await page.getByTestId("editor-comments-add-mode").click();
  const mode = page.getByTestId("editor-comment-mode-overlay");
  assert.equal(await page.getByTestId("editor-guide").evaluate(guide => {
    const box = guide.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.getAttribute("data-testid");
  }), "editor-comment-mode-overlay", "comment placement still owns the canvas above guide hit bands");
  await expectHit(allFilter); await allFilter.click();
  assert.equal(await mode.count(), 1, "placement mode must leave the shared right-panel controls reachable");
  await placeBesideInspector(page, mode);
  const composer = page.getByTestId("editor-comment-composer");
  await expectHit(composer.getByRole("textbox"));
  await composer.getByRole("textbox").click();
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
  await page.getByTestId("editor-properties-panel").getByRole("spinbutton", { name: "W", exact: true }).waitFor();
  assert.deepEqual(await selected(), ["comment-loading-target"]);
  checks.push("warm Escape unwinds draft, placement mode and panel one at a time without changing artwork selection");

  await page.getByTestId("editor-comments-toggle").click();
  assert.equal(await panel.getByRole("button", { name: /^All\b/ }).getAttribute("aria-pressed"), "true");
  await page.getByTestId("editor-comments-add-mode").click();
  await placeBesideInspector(page, mode);
  await expectHit(composer.getByRole("button", { name: "Post", exact: true }));
  await composer.getByRole("textbox").fill("Deferred comments remain undoable");
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  const commentId = await page.evaluate(() => window.__vooEditor.getDocument().comments[0].id);
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].messages[0].body), "Deferred comments remain undoable");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments?.length ?? 0), 0);
  await tool("redo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].id), commentId);
  await panel.getByRole("button", { name: "Close comments", exact: true }).click();
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  const canvasTarget = await page.evaluate(() => {
    const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: board.left + 150 * board.width / doc.width, y: board.top + 140 * board.height / doc.height };
  });
  await page.mouse.click(canvasTarget.x, canvasTarget.y);
  assert.deepEqual(await selected(), ["comment-loading-target"], "closed pins must not add a canvas-sized click blocker");
  await page.getByTestId("editor-comment-pin").click();
  const thread = page.getByTestId("editor-comment-thread");
  await expectHit(thread.getByRole("textbox", { name: "Reply", exact: true }));
  await thread.getByRole("textbox", { name: "Reply", exact: true }).click();
  await thread.getByRole("textbox", { name: "Reply", exact: true }).fill("Reply survives normal composition");
  await thread.getByRole("button", { name: "Reply", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].messages.length), 2);
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].messages.length), 1);
  checks.push("reopening keeps the filter and real create/reply operations retain single-step undo after lazy activation");
  await checkCommentPanelSlot(page);
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { viewport: { width: 1440, height: 700 }, hasTouch: true });

await withEditorBrowser(async ({ page }) => {
  await page.locator('[data-open-guard="off"]').waitFor();
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
  await expectHit(failure.getByRole("button", { name: "Retry", exact: true }));
  await failure.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByTestId("editor-comments-panel").waitFor();
  assert.equal(await page.getByTestId("editor-comments-error").count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["comments-failure-target"]);
  console.log(JSON.stringify({ passed: ["a failed optional comments download reports a local error, preserves canvas pixels/selection and retries without reloading the document"] }, null, 2));
});

await withEditorBrowser(async ({ page, errors }) => {
  await page.locator('[data-open-guard="off"]').waitFor();
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, {
      id: "standalone-mode-target", kind: "rect", visible: true,
      x: 100, y: 100, width: 80, height: 80, fill: "#ff0000",
    }] });
    e.selectExactly(["standalone-mode-target"]);
  });
  const rail = page.getByTestId("editor-properties-panel");
  const width = rail.getByRole("spinbutton", { name: "W", exact: true });
  await width.waitFor();
  const before = await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument()));
  const pattern = /\/src\/canvas\/components\/editor_comments_surface\.jsx(?:\?|$)/;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await page.route(pattern, async route => { await blocked; await route.continue(); });
  try {
    await page.keyboard.press("Control+k");
    const commands = page.getByTestId("command-palette");
    await commands.getByRole("combobox").fill("Comment mode");
    await commands.getByRole("option").filter({ hasText: /^Comment mode$/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="editor-comments-toggle"]')?.getAttribute("aria-busy") === "true");
    assert.equal(await rail.count(), 1, "Standalone placement loading must not create a second inspector");
    await expectHit(width);
    assert.equal(await page.getByTestId("editor-comments-panel").count(), 0);
    await expectHit(page.getByTestId("editor-comments-toggle"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('[data-testid="editor-comments-toggle"]')?.getAttribute("aria-busy") === "false");
    const responded = page.waitForResponse(response => pattern.test(response.url()) && response.ok());
    release(); await responded; await page.unroute(pattern);
    await page.waitForLoadState("networkidle");
    assert.equal(await page.getByTestId("editor-comments-panel").count(), 0);
    assert.equal(await page.getByTestId("editor-comment-mode-overlay").count(), 0);
    assert.equal(await rail.count(), 1);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument())), before);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["standalone-mode-target"]);
    assert.deepEqual(errors, []);
    console.log("Standalone Comment mode keeps the original inspector, shows progress in its launcher and cancels cold loading without late UI or document edits.");
  } finally { release(); await page.unroute(pattern); }
});
