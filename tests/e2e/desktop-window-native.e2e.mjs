import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";

// Run under Xvfb with a window manager; this is actual Linux Electron, not a UA override.
if (process.platform !== "linux") throw new Error("Native window verification requires Linux/X11 with openbox and xdotool");
const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "voo-window-native-"));
const artifacts = process.env.VOO_WINDOW_ARTIFACT_DIR || await mkdtemp(join(tmpdir(), "voo-window-evidence-"));
await mkdir(artifacts, { recursive: true });
await mkdir(join(profile, "documents"));
const entry = join(profile, "entry.cjs");
await writeFile(entry, `const {app}=require('electron');
app.setPath('userData',${JSON.stringify(join(profile, "profile"))});
app.setPath('documents',${JSON.stringify(join(profile, "documents"))});
app.setAppLogsPath(${JSON.stringify(join(profile, "logs"))});
require(${JSON.stringify(join(root, "electron/main.cjs"))});`);
const server = await startEditorBrowserServer();
let app;
let closed = false;
const proof = { platform: process.platform, checks: [], errors: [] };
try {
  app = await electron.launch({ args: ["--no-sandbox", entry], env: {
    ...process.env, XDG_CONFIG_HOME: join(profile, "config"), XDG_CACHE_HOME: join(profile, "cache"),
    VOO_USER_DATA_DIR: join(profile, "profile"), VOO_DOCUMENTS_ROOT: join(profile, "documents"),
    VOO_CLI_BRIDGE_PORT: String(server.bridge.port), VOO_DISABLE_UPDATES: "1",
    VITE_DEV_SERVER_URL: `${server.origin}/?voo-test=1`,
  } });
  app.on("close", () => { closed = true; });
  const page = await app.firstWindow();
  page.on("pageerror", error => proof.errors.push(String(error)));
  page.setDefaultTimeout(20_000);
  const newDocument = page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true });
  await newDocument.waitFor({ timeout: 90_000 });
  await newDocument.click();
  await page.waitForFunction(() => window.__vooEditor && document.querySelector('[data-open-guard="off"]'), null, { timeout: 90_000 });
  const controls = page.getByTestId("desktop-window-controls");
  await controls.waitFor();
  const windowState = () => app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return { bounds: win.getBounds(), content: win.getContentBounds(), maximized: win.isMaximized(),
      minimized: win.isMinimized(), menu: win.isMenuBarVisible() };
  });
  const waitState = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await windowState();
      if (predicate(state)) return state;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Native window state did not settle: ${JSON.stringify(await windowState())}`);
  };
  const initial = await windowState();
  assert.equal(initial.bounds.height, initial.content.height, "No standalone system title/menu height");
  assert.equal(initial.menu, false);
  await page.keyboard.press("Alt");
  assert.equal((await windowState()).menu, false);
  proof.checks.push("frameless native client geometry; Alt does not reveal a second menu bar");

  await controls.getByRole("button", { name: "Maximize window" }).click();
  await waitState(state => state.maximized);
  await controls.getByRole("button", { name: "Restore window" }).click();
  await waitState(state => !state.maximized);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize());
  await controls.getByRole("button", { name: "Restore window" }).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize());
  await controls.getByRole("button", { name: "Maximize window" }).waitFor();
  await controls.getByRole("button", { name: "Minimize window" }).click();
  await waitState(state => state.minimized);
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.restore(); win.focus(); });
  await waitState(state => !state.minimized);
  proof.checks.push("actual compositor minimize, maximize/restore and externally pushed state");

  const drag = await page.evaluate(() => {
    const brand = document.querySelector(".app-title-brand-row").getBoundingClientRect();
    const actions = document.querySelector(".app-title-actions").getBoundingClientRect();
    if (actions.left - brand.right < 16) throw new Error("Title bar must retain a real drag region");
    return { x: Math.round((brand.right + actions.left) / 2), y: 20 };
  });
  const beforeDrag = (await windowState()).bounds;
  await run("xdotool", ["mousemove", "--sync", String(beforeDrag.x + drag.x), String(beforeDrag.y + drag.y)]);
  await run("xdotool", ["mousedown", "1"]);
  await run("xdotool", ["mousemove", "--sync", String(beforeDrag.x + drag.x + 80), String(beforeDrag.y + drag.y + 40)]);
  await run("xdotool", ["mouseup", "1"]);
  await waitState(state => state.bounds.x !== beforeDrag.x || state.bounds.y !== beforeDrag.y);
  proof.checks.push("trusted X11 pointer input drags the actual frameless window");
  const previousDocument = await page.evaluate(() => window.__vooStore.activeDocumentId);
  await page.keyboard.press("Control+n");
  await page.waitForFunction(previous => window.__vooStore.activeDocumentId !== previous, previousDocument);
  proof.checks.push("the hidden native menu retains its New document accelerator");
  await page.screenshot({ path: join(artifacts, "linux-window.png") });

  // Exercise the real native prompt and dismiss it with an OS-level Escape.
  await app.evaluate(({ dialog }) => {
    const original = dialog.showMessageBox.bind(dialog);
    dialog.showMessageBox = (...args) => {
      global.__windowPrompted = true;
      return original(...args).finally(() => { global.__windowPrompted = false; });
    };
  });
  await page.evaluate(() => {
    window.__windowTestUnload = event => event.preventDefault();
    window.addEventListener("beforeunload", window.__windowTestUnload);
  });
  await controls.getByRole("button", { name: "Close window" }).click();
  for (let attempt = 0; attempt < 100 && !await app.evaluate(() => Boolean(global.__windowPrompted)); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await app.evaluate(() => Boolean(global.__windowPrompted)), true);
  await run("xdotool", ["key", "Escape"]);
  for (let attempt = 0; attempt < 100 && await app.evaluate(() => Boolean(global.__windowPrompted)); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(await app.evaluate(() => Boolean(global.__windowPrompted)), false);
  await controls.waitFor();
  assert.equal(closed, false);
  await page.evaluate(() => window.removeEventListener("beforeunload", window.__windowTestUnload));
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  const closing = app.waitForEvent("close");
  await controls.getByRole("button", { name: "Close window" }).click();
  await closing;
  proof.checks.push("native dirty-close prompt cancels safely; an approved close exits through the shared guard");
  assert.deepEqual(proof.errors, []);
  await writeFile(join(artifacts, "linux-window.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
} catch (error) {
  proof.failure = error.stack;
  await writeFile(join(artifacts, "linux-window.json"), JSON.stringify(proof, null, 2));
  if (app && !closed) {
    await (await app.firstWindow()).screenshot({ path: join(artifacts, "linux-window-failure.png") })
      .catch(captureError => console.error("Could not capture native window failure", captureError));
  }
  throw error;
} finally {
  try { if (app && !closed) await app.evaluate(({ app }) => app.exit(0)); }
  finally { await server.close(); await rm(profile, { recursive: true, force: true }); }
}
