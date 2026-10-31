import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

async function assertUncovered(surface, label) {
  await surface.waitFor({ state: "visible" });
  const misses = await surface.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const misses = [];
    for (const dx of [0.1, 0.5, 0.9]) {
      for (const dy of [0.1, 0.5, 0.9]) {
        const x = rect.left + rect.width * dx, y = rect.top + rect.height * dy;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !element.contains(hit)) misses.push({ x, y, hit: hit?.getAttribute("data-testid") ?? hit?.className });
      }
    }
    return misses;
  });
  assert.deepEqual(misses, [], `${label} must receive pointer hits across its surface`);
}

// Fresh documents exercise the shipped UI without changing the user's open file.
await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const engine = window.__vooEditor;
    const doc = engine.getDocument();
    const frame = doc.nodes.find((node) => node.isFrame);
    engine.setDoc({ ...doc, nodes: [...doc.nodes, {
      ...createTextNode({ text: "Hello VOO", x: 50, y: 50, fontSize: 24 }),
      id: "global-ui-text", parentId: frame.id,
    }] });
  });

  // A docked Agent leaves the share popover overlapping the real inspector.
  await page.getByRole("button", { name: "Open VOO Agent", exact: true }).click();
  await page.evaluate(async () => {
    const { getCollabSession } = await import("/src/canvas/collab/use_collab.js");
    const session = getCollabSession();
    const update = session.setIdentity.bind(session);
    window.__identityUpdateCount = 0;
    session.setIdentity = (identity) => { window.__identityUpdateCount++; return update(identity); };
  });
  // Exercise real copy/access actions on a loopback page without joining a public room.
  const signalingSockets = [];
  let signalOpened;
  const signalingReady = new Promise(resolve => { signalOpened = resolve; });
  await page.route("https://voo.run/editor/collab-config.json", route => route.fulfill({
    json: {}, headers: { "access-control-allow-origin": "*" },
  }));
  await page.routeWebSocket("wss://voo.run/collab", socket => {
    signalingSockets.push(socket.url());
    signalOpened();
    socket.onMessage(() => {});
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async text => { window.__copiedShareLink = text; } },
    });
  });
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "Share", exact: true }).click();
  const linkDialog = page.getByRole("dialog", { name: "Share", exact: true });
  const linkField = linkDialog.getByRole("textbox", { name: "Project link", exact: true });
  let previousLink;
  for (const access of ["edit", "view"]) {
    if (access === "view") await linkDialog.getByRole("button", { name: "View only", exact: true }).click();
    await linkDialog.getByRole("button", { name: /^(Copy|Copied)$/ }).click();
    await page.waitForFunction(access => {
      const link = document.querySelector('[role="dialog"] input[readonly]')?.value;
      if (!link) return false;
      return new URL(link).searchParams.get("access") === (access === "view" ? "view" : null);
    }, access);
    const link = new URL(await linkField.inputValue());
    assert.equal(link.origin, "https://voo.run", "Share on loopback must hand recipients the public app");
    assert.match(link.pathname, /^\/r\/[a-z2-9]{20}$/);
    assert.match(link.hash, /^#k=[A-Za-z0-9_-]{22}$/);
    assert.equal(await page.evaluate(() => window.__copiedShareLink), link.href, "Displayed and copied links are identical");
    if (previousLink) {
      assert.equal(link.pathname, previousLink.pathname);
      assert.equal(link.hash, previousLink.hash, "Changing permission preserves the room secret");
    }
    previousLink = link;
  }
  await page.waitForFunction(() => document.querySelector('[role="dialog"] input[readonly]')?.value.includes("https://voo.run/"));
  let signalingTimer;
  try {
    await Promise.race([signalingReady, new Promise((_, reject) => {
      signalingTimer = setTimeout(() => reject(new Error("Hosted signaling socket did not open")), 15000);
    })]);
  } finally { clearTimeout(signalingTimer); }
  assert.ok(signalingSockets.length > 0, "Local host uses the same hosted signaling endpoint as its recipients");
  await linkDialog.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await page.keyboard.press("Escape");
  await linkDialog.waitFor({ state: "detached" });
  await page.evaluate(() => { delete navigator.clipboard; });

  const beforeOverlays = await page.evaluate(() => ({ doc: window.__vooEditor.getDocument(), selected: window.__vooEditor.getSelectedIds() }));
  for (const width of [1600, 1280, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByTestId("editor-top-bar").getByRole("button", { name: "Share", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share", exact: true });
    await assertUncovered(share, `Share at ${width}px`);
    await share.getByRole("textbox", { name: "Your display name", exact: true }).fill("Overlay audit");
    if (width === 1600) {
      const count = await page.evaluate(() => window.__identityUpdateCount);
      await page.evaluate(async () => {
        const { editShareIdentityBeforePaint } = await import("/tests/e2e/global-overlay-harness.jsx");
        editShareIdentityBeforePaint(["Rapid A", "Rapid B"]);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.equal(await share.getByRole("textbox", { name: "Your display name", exact: true }).inputValue(), "Rapid B");
      assert.equal(await page.evaluate(() => window.__identityUpdateCount), count + 2,
        "Each input publishes identity once even when React batches updates");
    }
    await page.keyboard.press("Escape");
    await share.waitFor({ state: "detached" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const kind of ["shortcuts", "icons", "svg", "pending"]) {
    await page.evaluate(async (kind) => {
      const { mountGlobalOverlayAudit } = await import("/tests/e2e/global-overlay-harness.jsx");
      mountGlobalOverlayAudit(kind);
    }, kind);
    const dialog = page.getByRole("dialog");
    await assertUncovered(dialog, `${kind} under a clipped canvas host`);
    assert.equal(await dialog.evaluate(element => Boolean(element.closest('[data-global-overlay-audit-host]'))), false);
    await page.evaluate(() => window.closeGlobalOverlayAudit());
    await dialog.waitFor({ state: "detached" });
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByTestId("settings-drawer");
  await assertUncovered(settings, "Settings above the canvas");
  await page.keyboard.press("Escape");
  await settings.waitFor({ state: "detached" });

  assert.deepEqual(await page.evaluate(() => ({ doc: window.__vooEditor.getDocument(), selected: window.__vooEditor.getSelectedIds() })), beforeOverlays);

  await page.keyboard.press("Control+f");
  const search = page.getByTestId("find-replace-bar");
  await search.getByRole("textbox", { name: "Find text", exact: true }).fill("Hello");
  await page.waitForFunction(() => window.__vooEditor.getSelectedIds().includes("global-ui-text"));
  await search.getByRole("button", { name: "Match case", exact: true }).focus();
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "detached" });
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["global-ui-text"]);

  await page.keyboard.press("Control+f");
  await search.getByRole("textbox", { name: "Find text", exact: true }).fill("Hello");
  await search.getByRole("textbox", { name: "Replace with", exact: true }).fill("Welcome");
  await search.getByRole("button", { name: "Replace all", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.find((node) => node.id === "global-ui-text").text === "Welcome VOO");
  assert.equal(await search.getByRole("textbox", { name: "Find text", exact: true }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "detached" });
  await page.evaluate(() => window.__vooEditor.undo());
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.find((node) => node.id === "global-ui-text").text === "Hello VOO");

  await page.evaluate(async () => {
    const { mountAutosaveAudit } = await import("/tests/e2e/ui-autosave-harness.jsx");
    window.__autosaveUi = mountAutosaveAudit();
  });
  await page.waitForFunction(() => window.__autosaveUi.version > 0);
  await page.evaluate(() => window.__autosaveUi.saver.flush());
  assert.equal(await page.evaluate(() => window.__autosaveUi.writes.length), 0);
  await page.evaluate(() => window.__autosaveUi.render(false));
  await page.waitForFunction(() => document.querySelector('[data-autosave-disabled="false"]'));
  await page.evaluate(() => window.__autosaveUi.saver.flush());
  assert.equal(await page.evaluate(() => window.__autosaveUi.writes.length), 1);
  await page.evaluate(() => window.__autosaveUi.render(true));
  await page.waitForFunction(() => document.querySelector('[data-autosave-disabled="true"]'));
  await page.evaluate(() => window.__autosaveUi.saver.flush());
  assert.equal(await page.evaluate(() => window.__autosaveUi.writes.length), 1);
  assert.deepEqual(await page.evaluate(() => window.__autosaveUi.errors), []);
  await page.evaluate(() => window.__autosaveUi.close());

  const opener = page.getByRole("button", { name: "Settings", exact: true });
  await opener.focus();
  // Hold the next animation callbacks so a delayed autofocus cannot hide an early Tab race.
  await page.evaluate(() => {
    const request = window.requestAnimationFrame;
    const cancel = window.cancelAnimationFrame;
    const frames = new Map();
    let nextId = 0;
    window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
    window.cancelAnimationFrame = id => frames.delete(id);
    window.__releaseFocusFrames = () => {
      window.requestAnimationFrame = request;
      window.cancelAnimationFrame = cancel;
      for (const callback of frames.values()) callback(performance.now());
      delete window.__releaseFocusFrames;
    };
  });
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette");
  const commandInput = palette.getByRole("combobox");
  await commandInput.waitFor();
  await assertUncovered(palette, "Command palette");
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "combobox");
  const close = palette.getByRole("button", { name: "esc close", exact: true });
  await commandInput.press("Shift+Tab");
  assert.equal(await close.evaluate((element) => element === document.activeElement), true);
  await page.evaluate(() => window.__releaseFocusFrames());
  assert.equal(await close.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await commandInput.evaluate((element) => element === document.activeElement), true);
  await commandInput.fill("not-a-real-command-9z");
  assert.equal(await palette.getByRole("option").count(), 0);
  await close.focus();
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });
  assert.equal(await opener.evaluate((element) => element === document.activeElement), true);

  // Trigger the existing image-export entry through its real command palette action.
  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("Export");
  await palette.getByRole("option").filter({ hasText: /^Export$/ }).click();
  const exportDialog = page.getByTestId("design-export-dialog");
  await exportDialog.waitFor();
  await assertUncovered(exportDialog, "Export dialog");
  assert.equal(await exportDialog.evaluate((element) => element.contains(document.activeElement)), true);
  await page.keyboard.press("Control+k");
  await palette.waitFor();
  await palette.getByRole("combobox").fill("missing-nested-command");
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });
  assert.equal(await exportDialog.count(), 1, "closing the top dialog must retain the export underneath");
  assert.equal(await exportDialog.evaluate((element) => element.contains(document.activeElement)), true);
  await exportDialog.getByRole("button", { name: "JPEG", exact: false }).click();
  const transparency = exportDialog.getByRole("checkbox");
  assert.equal(await transparency.isDisabled(), true);
  await exportDialog.getByRole("button", { name: "PNG", exact: false }).click();
  assert.equal(await transparency.isEnabled(), true);
  await exportDialog.getByRole("button", { name: "Export", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await exportDialog.evaluate((element) => element.contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await exportDialog.waitFor({ state: "detached" });

  await page.setViewportSize({ width: 320, height: 568 });
  const more = page.getByTestId("editor-top-bar-actions").getByRole("button", { name: "More actions", exact: true });
  await more.waitFor({ state: "visible" });
  await more.click();
  const menu = page.locator("#titlebar-more-menu");
  await assertUncovered(menu, "Narrow title menu");
  const items = menu.getByRole("menuitem");
  assert.equal(await items.first().evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("End");
  assert.equal(await items.last().evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Home");
  assert.equal(await items.first().evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  assert.equal(await more.evaluate((element) => element === document.activeElement), true);
  await more.click();
  await menu.getByRole("button", { name: "Share", exact: true }).click();
  const narrowShare = page.getByRole("dialog", { name: "Share", exact: true });
  await assertUncovered(narrowShare, "Narrow nested share");
  const bounds = await narrowShare.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.y >= 0 && bounds.y + bounds.height <= 568,
    "Share stays inside the narrow viewport");
  await narrowShare.getByRole("textbox", { name: "Your display name", exact: true }).fill("Narrow share");
  assert.equal(await narrowShare.isVisible(), true, "Interacting with a portalled share must not dismiss it");
  await page.keyboard.press("Escape");
  await narrowShare.waitFor({ state: "detached" });
}, { hasTouch: true });
console.log("UI global interaction audit passed: search/replace/undo, modal focus, export states, mobile title menu.");
