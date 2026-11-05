// Linux desktop window chrome: frameless window, hidden menu bar, in-app
// minimise/maximise/restore/close and the native application menu still bound.
// Run with a display (X11/XWayland): `node tests/e2e/linux-window-chrome.e2e.mjs`.
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";

if (process.platform !== "linux") {
  console.log(`SKIP: Linux window chrome is not applicable on ${process.platform}`);
  process.exit(0);
}

const profile = await mkdtemp(path.join(tmpdir(), "voo-linux-chrome-"));
const server = await startEditorBrowserServer();
let app = null;

const state = () => app.evaluate(({ BrowserWindow, Menu }) => {
  const win = BrowserWindow.getAllWindows()[0];
  const menu = Menu.getApplicationMenu();
  const find = (items, label) => {
    for (const item of items ?? []) {
      if (item.label === label) return item;
      const nested = find(item.submenu?.items, label);
      if (nested) return nested;
    }
    return null;
  };
  const newDocument = find(menu?.items, "New Document");
  return {
    bounds: win.getBounds(),
    content: win.getContentBounds(),
    menuVisible: win.isMenuBarVisible(),
    menuInstalled: Boolean(menu),
    newDocumentAccelerator: newDocument?.accelerator ?? null,
    movable: win.isMovable(),
    maximized: win.isMaximized(),
    minimized: win.isMinimized(),
  };
});

async function waitForState(predicate, label) {
  const deadline = Date.now() + 8000;
  let current = await state();
  while (!predicate(current)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(current)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    current = await state();
  }
  return current;
}

try {
  app = await electron.launch({
    args: ["--no-sandbox", "--ozone-platform=x11", "."],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `${server.origin}/?voo-test=1`,
      VOO_CLI_BRIDGE_PORT: String(server.bridge.port),
      VOO_DISABLE_UPDATES: "1",
      XDG_CONFIG_HOME: `${profile}/config`,
      XDG_CACHE_HOME: `${profile}/cache`,
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.getByTestId("editor-top-bar").waitFor({ timeout: 90000 });
  await page.waitForTimeout(500);

  const initial = await state();
  assert.equal(initial.menuInstalled, true, "the application menu must stay installed for shortcuts");
  assert.equal(initial.menuVisible, false, "the Linux menu bar must not paint above the editor");
  assert.equal(initial.movable, true, "the frameless window must stay movable");
  assert.equal(initial.newDocumentAccelerator, "CmdOrCtrl+N", "native accelerators must survive hiding the menu bar");
  await page.keyboard.press("Alt");
  await page.waitForTimeout(300);
  assert.equal((await state()).menuVisible, false, "Alt must not reveal the hidden menu bar");
  assert.deepEqual(
    { x: initial.content.x, y: initial.content.y, width: initial.content.width, height: initial.content.height },
    { x: initial.bounds.x, y: initial.bounds.y, width: initial.bounds.width, height: initial.bounds.height },
    "a frameless Linux window must not reserve native title-bar or menu-bar space",
  );

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const appRegion = (selector) => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      return (style.getPropertyValue("-webkit-app-region") || style.getPropertyValue("app-region")).trim();
    };
    return {
      title: rect(".app-title-bar"),
      shell: rect(".editor-shell"),
      controls: rect("[data-testid=desktop-window-controls]"),
      titleAppRegion: appRegion(".app-title-bar"),
      controlsAppRegion: appRegion("[data-testid=desktop-window-controls]"),
      titleBackground: getComputedStyle(document.querySelector(".app-title-bar")).backgroundImage,
    };
  });
  assert.equal(layout.title.y, 0, "the in-app title bar must be the topmost row");
  assert.equal(layout.title.height, 40, "the in-app title bar must keep its current 40px height");
  assert.equal(layout.shell.y, 40, "the mint frame must begin directly below the title bar");
  assert.ok(layout.controls && layout.controls.width > 0, "Linux must render in-app window controls");
  assert.equal(layout.titleAppRegion, "drag", "the title bar must remain a native drag region");
  assert.equal(layout.controlsAppRegion, "no-drag", "window controls must not start a window drag");
  assert.match(layout.titleBackground, /linear-gradient/, "the title bar must keep the hosted mint gradient");
  assert.deepEqual(pageErrors, []);

  const controls = page.getByTestId("desktop-window-controls");
  await controls.getByRole("button", { name: "Maximize window" }).click();
  await waitForState((current) => current.maximized, "maximize");
  await page.getByRole("button", { name: "Restore window" }).waitFor();
  await page.screenshot({ path: editorArtifactPath("linux-window-maximized.png") });

  await controls.getByRole("button", { name: "Restore window" }).click();
  await waitForState((current) => !current.maximized, "restore");

  await controls.getByRole("button", { name: "Minimize window" }).click();
  await waitForState((current) => current.minimized, "minimize");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await waitForState((current) => !current.minimized, "restore after minimize");

  await page.screenshot({ path: editorArtifactPath("linux-window-chrome.png") });

  // The window controls close through the same guard as the OS close button.
  const closed = new Promise((resolve) => app.once("close", resolve));
  await controls.getByRole("button", { name: "Close window" }).click();
  await Promise.race([
    closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Close window did not close the app")), 8000)),
  ]);
  app = null;
  console.log(JSON.stringify({
    passed: [
      "frameless window has no native title/menu bar space",
      "application menu installed with CmdOrCtrl+N accelerator",
      "in-app title bar stays a drag region with no-drag controls",
      "maximize/restore/minimize/close work through IPC",
    ],
  }, null, 2));
} finally {
  if (app) await app.close().catch(() => {});
  await server.close();
}
