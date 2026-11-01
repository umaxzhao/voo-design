import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const checks = [];
const widths = [320, 390, 768, 1440];
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const insideFocus = (locator) => locator.evaluate((root) => root.contains(document.activeElement));

async function expectViewport(locator, width) {
  const rect = await locator.boundingBox();
  assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width + 1, `surface must fit ${width}px: ${JSON.stringify(rect)}`);
}

await withEditorBrowser(async ({ page, origin }) => {
  // Mounting the real editor pulls in CanvasKit/Skia WASM; under three parallel
  // release suites that cold mount can pass 15s, so keep Playwright's 30s budget.
  page.setDefaultTimeout(30000);
  // These paths must never reach a paid generation or authentication service in a UI audit.
  let blockedRequests = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && /generate|completions|images|auth\/(login|register)/i.test(request.url())) {
      blockedRequests += 1;
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"audit_network_blocked"}' });
    } else await route.continue();
  });
  await page.evaluate(async () => { const { setLocale } = await import("/src/shared/i18n.js"); await setLocale("en"); });
  const home = page.locator(".welcome-dashboard");
  await home.waitFor();
  assert.equal(await home.getByText("VOO Design 1.0", { exact: true }).count(), 0);
  assert.equal(await page.locator('.app-title-actions').getByRole("button", { name: "Settings", exact: true }).count(), 0);
  const rim = await home.locator("form.prompt-composer").evaluate(form => {
    const style = getComputedStyle(form, "::before");
    return { image: style.backgroundImage, animation: style.animationName,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches };
  });
  assert.match(rim.image, /conic-gradient/);
  assert.equal(rim.animation, rim.reduced ? "none" : "prompt-rim-spin");
  checks.push("the shared animated prompt rim remains active and respects reduced motion");

  // Exercise the public creation/open path, rather than injecting a document fixture.
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("design-editor").waitFor();
  // A visible editor mounts before asynchronous project hydration finishes.
  // Match the shared fixture's ready boundary before navigating away.
  await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
  await settle(page);
  await page.locator("button").filter({ hasText: "VOO Design" }).first().click();
  await home.waitFor();
  await home.getByRole("button", { name: "Design1.voo", exact: true }).waitFor();
  const file = (name) => home.locator("[data-welcome-file-id]").filter({ has: page.getByRole("button", { name, exact: true }) });
  const actions = async (name) => {
    await file(name).hover();
    await file(name).getByTitle("More actions", { exact: true }).click();
    const menu = page.locator("[data-welcome-file-menu]").first();
    await menu.waitFor();
    await settle(page);
    return menu;
  };
  checks.push("New creates a persistent browser workspace document and Home lists it");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFile = file("Design1.voo");
  await mobileFile.scrollIntoViewIfNeeded();
  const card = await mobileFile.boundingBox();
  assert.ok(card.width > 300, "phone files retain a full-width, usable thumbnail");
  await page.mouse.click(card.x + card.width / 2, card.y + card.height * 0.35);
  await home.waitFor({ state: "detached" });
  await page.waitForFunction(() => window.__vooEditor && document.querySelector('[data-open-guard]')?.getAttribute("data-open-guard") === "off");
  await page.locator(".app-title-brand-row button").first().click();
  await home.waitFor();
  await mobileFile.scrollIntoViewIfNeeded();
  await actions("Design1.voo");
  await page.keyboard.press("Escape");
  await home.locator(".welcome-main").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const lastCard = await mobileFile.boundingBox();
  const settingsButton = await page.getByRole("button", { name: "Settings", exact: true }).boundingBox();
  assert.ok(lastCard.y + lastCard.height <= settingsButton.y,
    "bottom padding keeps the last file metadata above the fixed Settings entry");
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push("phone card midpoint opens the document, corner More stays usable, and Settings never covers the last file");


  await home.getByRole("button", { name: "Design1.voo", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByTestId("design-editor").waitFor();
  // A visible editor mounts before asynchronous project hydration finishes.
  // Match the shared fixture's ready boundary before navigating away.
  await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
  await settle(page);
  await page.locator("button").filter({ hasText: "VOO Design" }).first().click();
  await home.waitFor();
  await actions("Design1.voo");
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename file", exact: true });
  await rename.waitFor();
  assert.ok(await insideFocus(rename));
  await rename.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Escape");
  await rename.waitFor({ state: "detached" });
  await actions("Design1.voo");
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  await rename.getByRole("textbox").fill("AuditHome");
  await rename.getByRole("button", { name: "Confirm", exact: true }).click();
  await home.getByRole("button", { name: "AuditHome.voo", exact: true }).waitFor();
  checks.push("file keyboard open, pointer menu commands, modal rename and Escape from a secondary button work");
  await actions("AuditHome.voo");
  await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await home.getByRole("button", { name: "AuditHomeCopy.voo", exact: true }).waitFor();
  await actions("AuditHomeCopy.voo");
  await page.getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
  await home.getByRole("button", { name: "Trash", exact: true }).click();
  await home.getByRole("button", { name: "AuditHomeCopy.voo", exact: true }).waitFor();
  await home.getByRole("button", { name: "Empty Trash", exact: true }).click();
  const emptyTrash = page.getByRole("dialog", { name: "Empty Trash", exact: true });
  await emptyTrash.waitFor();
  assert.ok(await insideFocus(emptyTrash));
  await emptyTrash.getByRole("button", { name: "Confirm", exact: true }).click();
  await home.getByRole("button", { name: "AuditHomeCopy.voo", exact: true }).waitFor({ state: "detached" });
  await home.getByRole("button", { name: "Recents", exact: true }).click();
  checks.push("Duplicate uses whitespace-free filenames and trash/empty confirmation affects only the isolated browser workspace");


  await file("AuditHome.voo").getByTitle("Add to Starred", { exact: true }).click();
  await home.getByRole("button", { name: "Starred", exact: true }).click();
  await home.getByRole("button", { name: "AuditHome.voo", exact: true }).waitFor();
  await home.getByRole("button", { name: "Recents", exact: true }).click();
  const search = home.getByPlaceholder("Search files, drafts...", { exact: true });
  await search.fill("absent-file");
  await home.getByText("No matching files found", { exact: true }).waitFor();
  await search.fill("AuditHome");
  await home.getByRole("button", { name: "AuditHome.voo", exact: true }).waitFor();
  await search.fill("");
  await home.getByRole("button", { name: "Last modified", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Name (A-Z)", exact: true }).click();
  const sortTrigger = home.getByRole("button", { name: "Name (A-Z)", exact: true });
  await sortTrigger.waitFor();
  assert.ok(await sortTrigger.evaluate((element) => element === document.activeElement));
  await sortTrigger.click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[data-welcome-file-menu]").count(), 0);
  await home.getByTitle("List view", { exact: true }).click();
  await home.getByRole("button", { name: "AuditHome.voo", exact: true }).waitFor();
  assert.equal(await file("AuditHome.voo").getByTitle("More actions", { exact: true }).count(), 1);
  await home.getByTitle("Grid view", { exact: true }).click();
  await home.getByRole("button", { name: "New folder", exact: true }).click();
  await home.getByRole("textbox", { name: "Folder name", exact: true }).fill("AuditFolder");
  await page.keyboard.press("Enter");
  await home.getByTestId("sidebar-folder").filter({ hasText: "AuditFolder" }).waitFor();
  await actions("AuditHome.voo");
  await page.getByRole("button", { name: "Move to", exact: true }).click();
  await page.getByRole("menuitem", { name: "AuditFolder", exact: true }).click();
  await home.getByRole("button", { name: "AuditHome.voo", exact: true }).waitFor({ state: "detached" });
  await home.getByTestId("sidebar-folder").filter({ hasText: "AuditFolder" }).getByRole("button").first().click();
  await home.getByRole("button", { name: "AuditHome.voo", exact: true }).waitFor();
  checks.push("starred, search, list/grid switch, browser project creation and nested Move to all mutate the actual workspace");

  // Advanced generation remains behind its existing trigger; nested Escape leaves it open.
  await home.getByRole("button", { name: "Recents", exact: true }).click();
  await home.getByRole("button", { name: "Generation settings", exact: true }).click();
  const advanced = page.getByRole("dialog", { name: "Generation settings", exact: true });
  await advanced.waitFor();
  await advanced.getByRole("button", { name: "Style", exact: true }).click();
  await page.getByRole("listbox", { name: "Style", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("listbox", { name: "Style", exact: true }).waitFor({ state: "detached" });
  assert.ok(await advanced.isVisible());
  await page.keyboard.press("Escape");
  await advanced.waitFor({ state: "detached" });
  checks.push("advanced generation opens through one entry and nested selects own the first Escape");
  await home.getByRole("button", { name: "Generation settings", exact: true }).click();
  await advanced.waitFor();
  const touch = await page.context().newCDPSession(page);
  await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  try {
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart",
      touchPoints: [{ x: 1400, y: 970, radiusX: 1, radiusY: 1, force: 1 }] });
    await advanced.waitFor({ state: "detached" });
  } finally {
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await touch.detach();
  }
  checks.push("a real outside touch closes advanced settings on pointerdown before compatibility mouse events");

  const settingsOpener = page.getByRole("button", { name: "Settings", exact: true });
  await settingsOpener.click();
  const drawer = page.getByTestId("settings-drawer");
  await drawer.waitFor();
  assert.ok(await insideFocus(drawer));
  assert.equal(await drawer.getByText("Local guest profile", { exact: true }).count(), 1);
  assert.equal(await drawer.getByText("Display name", { exact: true }).count(), 1);
  const tabs = drawer.getByRole("tab");
  assert.equal(await tabs.count(), 5);
  for (let index = 0; index < 5; index += 1) {
    await tabs.nth(index).click();
    assert.equal(await tabs.nth(index).getAttribute("aria-selected"), "true");
    assert.equal(await drawer.locator("main[role=tabpanel]").getAttribute("aria-labelledby"), await tabs.nth(index).getAttribute("id"));
  }
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");
  assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
  const focusables = drawer.locator('button:not([disabled]):visible:not([tabindex="-1"]), input:not([disabled]):visible');
  await focusables.last().focus();
  await page.keyboard.press("Tab");
  assert.ok(await insideFocus(drawer));
  await drawer.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  assert.ok(await insideFocus(drawer));
  await drawer.getByTestId("settings-light-theme").click();
  assert.equal(await drawer.getByTestId("settings-light-theme").getAttribute("aria-checked"), "true");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await drawer.getByTestId("settings-light-theme").click();
  await drawer.getByTestId("settings-auto-save-drafts").click();
  assert.equal(await drawer.getByTestId("settings-auto-save-drafts").getAttribute("aria-checked"), "true");
  assert.equal(await page.getByTestId("design-editor").count(), 1);
  await drawer.getByTestId("settings-auto-save-drafts").click();
  assert.equal(await drawer.getByTestId("settings-auto-save-drafts").getAttribute("aria-checked"), "false");
  await drawer.getByRole("button", { name: "简体中文", exact: true }).click();
  await drawer.getByRole("button", { name: "关闭", exact: true }).waitFor();
  assert.equal(await drawer.getAttribute("aria-label"), "设置与偏好");
  assert.equal(await drawer.getByText("本地访客资料", { exact: true }).count(), 1);
  await drawer.getByRole("button", { name: "English", exact: true }).click();
  await drawer.getByRole("button", { name: "Close", exact: true }).waitFor();
  await tabs.nth(1).click();
  const nestedSelect = drawer.locator('button[aria-haspopup="listbox"]').first();
  if (await nestedSelect.count()) {
    await nestedSelect.click();
    const listbox = page.locator(`[id="${await nestedSelect.getAttribute("aria-controls")}"]`);
    await listbox.waitFor();
    await listbox.getByRole("option").first().focus();
    assert.ok(await listbox.evaluate((root) => root.contains(document.activeElement)));
    await page.keyboard.press("Escape");
    await listbox.waitFor({ state: "detached" });
    assert.ok(await drawer.isVisible());
  }
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  assert.ok(await settingsOpener.evaluate((element) => element === document.activeElement));
  // Editor shortcuts are deliberately paused while the welcome page is visible.
  await home.getByTestId("sidebar-folder").filter({ hasText: "AuditFolder" }).getByRole("button").first().click();
  await home.getByRole("button", { name: "AuditHome.voo", exact: true }).click();
  await page.getByTestId("design-editor").waitFor();
  // A visible editor mounts before asynchronous project hydration finishes.
  // Match the shared fixture's ready boundary before navigating away.
  await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
  await settle(page);
  await settingsOpener.click();
  await drawer.waitFor();
  await drawer.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette");
  await palette.waitFor();
  assert.ok(await insideFocus(palette));
  await palette.locator("button").first().focus();
  await page.keyboard.press("Tab");
  assert.ok(await insideFocus(palette));
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "detached" });
  assert.ok(await insideFocus(drawer));
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  assert.ok(await settingsOpener.evaluate((element) => element === document.activeElement));
  await page.locator("button").filter({ hasText: "VOO Design" }).first().click();
  await home.waitFor();
  checks.push("all Settings tabs, roving keyboard tabs, focus boundaries/restore, theme, autosave toggle, bilingual copy, nested select and stacked palette Escape pass");

  // Capture geometry with the same real touch-capable Chromium context at each breakpoint.
  await home.getByTestId("sidebar-folder").filter({ hasText: "AuditFolder" }).getByRole("button").first().click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await expectViewport(home, width);
    const settingsRect = await settingsOpener.boundingBox();
    assert.ok(settingsRect && settingsRect.x < width / 2 && settingsRect.y > 800,
      `Settings must stay in the bottom-left at ${width}px: ${JSON.stringify(settingsRect)}`);
    assert.ok(settingsRect.width >= 48 && settingsRect.height >= 48);
    assert.ok(Math.abs(900 - settingsRect.y - settingsRect.height - 12) <= 1,
      `Settings bottom gap must be 12px at ${width}px`);
    await page.screenshot({ path: `/private/tmp/voo-ui-home-${width}.png` });
    await actions("AuditHome.voo");
    const menu = page.locator("[data-welcome-file-menu]").first();
    await expectViewport(menu, width);
    assert.ok(await menu.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.bottom <= innerHeight && document.elementFromPoint(rect.x + 10, rect.y + 10)?.closest("[data-welcome-file-menu]"); }));
    await page.keyboard.press("Escape");
    await settingsOpener.click();
    await drawer.waitFor();
    await expectViewport(drawer, width);
    assert.ok(await drawer.locator("main").evaluate((element) => { element.scrollTop = element.scrollHeight; return element.scrollTop > 0; }));
    await drawer.locator("main").evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: `/private/tmp/voo-ui-settings-${width}.png` });
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "detached" });
  }
  checks.push("320/390/768/1440 home, settings and portalled file menus fit the viewport and settings content scrolls");

  // Use the ordinary first-run path (not voo-test) to verify its native dialog and persistence.
  await page.goto(`${origin}/?firstRun=1`);
  const onboarding = page.getByTestId("first-run-onboarding");
  await onboarding.waitFor();
  const nativeDialog = page.locator("dialog[open]");
  assert.equal(await nativeDialog.count(), 1);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    await expectViewport(nativeDialog, width);
    await page.screenshot({ path: `/private/tmp/voo-ui-onboarding-${width}.png` });
  }
  await onboarding.getByTestId("first-run-next").click();
  await page.locator('[data-testid="first-run-onboarding"][data-step="workspace"]').waitFor();
  assert.equal(await page.getByTestId("first-run-workspace-path").inputValue(), "Browser storage");
  assert.equal(await page.getByRole("button", { name: "Choose directory", exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 900 });
  await settle(page);
  await expectViewport(nativeDialog, 390);
  await page.screenshot({ path: "/private/tmp/voo-ui-onboarding-workspace-390.png" });
  await onboarding.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator('[data-testid="first-run-onboarding"][data-step="provider"]').waitFor();
  await onboarding.getByRole("button", { name: "中文", exact: true }).click();
  await onboarding.getByRole("heading", { name: "选择智能体（可选）", exact: true }).waitFor();
  await onboarding.getByRole("button", { name: "English", exact: true }).click();
  await onboarding.getByTestId("first-run-next").focus();
  await page.keyboard.press("Tab");
  // Native Chromium may briefly target the browser chrome/body sentinel at the boundary.
  if (!(await insideFocus(nativeDialog))) await page.keyboard.press("Tab");
  assert.ok(await insideFocus(nativeDialog));
  assert.ok(await page.evaluate(() => {
    const background = document.querySelector(".app-title-bar button");
    if (!background) throw new Error("Expected a real background control");
    background.focus();
    return document.querySelector("dialog[open]")?.contains(document.activeElement);
  }));
  await page.keyboard.press("Escape");
  await onboarding.waitFor({ state: "detached" });
  await page.goto(`${origin}/`);
  await home.waitFor();
  assert.equal(await onboarding.count(), 0);
  checks.push("normal first-run agent/workspace steps fit, browser storage is the default, native dialog keeps background inert, switches language, dismisses and persists");
  assert.equal(blockedRequests, 0, "audit must not attempt a generation or authentication request");
  console.log(JSON.stringify({ passed: checks, blockedRequests }, null, 2));
}, { openDocument: false, mcpLink: false, hasTouch: true });
