import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import { _electron as electron } from "playwright";
import { desktopReleasePlan, canonicalProjectNodes } from "./desktop-release-plan.mjs";

const [platform, arch] = process.argv.slice(2);
const plan = desktopReleasePlan(platform, arch);
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const temporary = await mkdtemp(path.join(tmpdir(), "voo-release-smoke-"));
const evidence = path.join(plan.output, "evidence");
await mkdir(evidence, { recursive: true });
await rm(path.join(evidence, `${platform}-${arch}.json`), { force: true });
const errors = [];
let application;
let saved;
let proof;
const checks = [];
const documentRoot = path.join(temporary, "documents");
await mkdir(documentRoot);

async function bridgePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return String(port);
}

async function open(profileName) {
  const profile = path.join(temporary, profileName);
  const env = { ...process.env, VOO_DISABLE_UPDATES: "1",
    VOO_USER_DATA_DIR: profile, VOO_DOCUMENTS_ROOT: documentRoot,
    XDG_CONFIG_HOME: path.join(temporary, "config"), XDG_CACHE_HOME: path.join(temporary, "cache"),
    VOO_CLI_BRIDGE_PORT: await bridgePort(),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  application = await electron.launch({ executablePath: plan.executable,
    args: [`--user-data-dir=${profile}`, ...(platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : [])], env,
  });
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(await application.evaluate(({ app }) => app.getVersion()), pkg.version);
  assert.equal(await application.evaluate(() => process.arch), arch);
  assert.equal(await application.evaluate(() => process.platform), plan.host);
  const page = await application.firstWindow();
  page.on("pageerror", error => errors.push(String(error)));
  await page.waitForURL(url => url.protocol === "file:" && url.pathname.endsWith("/index.html"),
    { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.addInitScript(() => localStorage.setItem("ciw.locale", "en"));
  // Keep the actual packaged renderer/preload. The query exposes scene readback
  // and skips first-run setup; it does not replace filesystem or rendering code.
  const url = new URL(page.url()); url.searchParams.set("voo-test", "1");
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("editor-top-bar").waitFor({ timeout: 90_000 });
  assert.equal(await page.evaluate(() => window.electronAPI?.isElectron), true);
  const config = await page.evaluate(() => window.electronAPI.workspace.getConfig());
  assert.ok(path.resolve(config.path).startsWith(path.resolve(documentRoot) + path.sep));
  return page;
}

async function close() {
  if (!application) return;
  const current = application; application = null;
  let timer;
  try {
    await Promise.race([current.close(), new Promise((_, reject) => {
      timer = setTimeout(() => { current.process().kill("SIGKILL"); reject(new Error("Packaged app failed to quit")); }, 15_000);
    })]);
  } finally { clearTimeout(timer); }
}

try {
  let page = await open("first-profile");
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor && document.querySelector('[data-open-guard="off"]'));
  const before = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  const canvas = page.locator("[data-editor-artboard]").first();
  const box = await canvas.boundingBox();
  assert.ok(box?.width > 100 && box.height > 100, "Actual packaged canvas must have a usable size");
  await page.keyboard.press("r");
  await page.mouse.move(box.x + box.width * 0.42, box.y + box.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count + 1, before);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), before);
  await page.evaluate(() => window.__vooEditor.redo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), before + 1);
  checks.push("packaged preload, actual pointer drawing and one-step undo/redo");
  console.log("Packaged pointer drawing and history passed");
  saved = await page.evaluate(async () => {
    const document = JSON.parse(JSON.stringify(window.__vooEditor.getDocument()));
    const file = { format: "voo-editor", version: 2, kind: "design", document, assets: {} };
    const bytes = new TextEncoder().encode(JSON.stringify(file));
    const written = await window.electronAPI.workspace.writeFileBytes("ReleaseSmoke.voo", bytes);
    if (!written.ok) throw new Error(written.error);
    const read = await window.electronAPI.workspace.readFileBytes(written.file.path);
    if (!read.ok) throw new Error(read.error);
    if (JSON.stringify(JSON.parse(new TextDecoder().decode(read.bytes)).document) !== JSON.stringify(document)) {
      throw new Error("Packaged filesystem roundtrip changed the document");
    }
    return { ...written.file, document };
  });
  assert.ok(saved.path.startsWith(documentRoot));
  assert.ok((await readFile(saved.path)).length > 100);
  await application.evaluate(({ dialog, app }) => {
    dialog.showMessageBox = async () => ({ response: 0 });
    app.quit();
  });
  await page.waitForTimeout(200);
  assert.equal(application.process().exitCode, null, "Keep editing must cancel quit");
  const port = await application.evaluate(() => process.env.VOO_CLI_BRIDGE_PORT);
  const bridge = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(bridge.status, 200, "Cancelling quit must keep the app-owned bridge running");
  checks.push("native workspace IPC file roundtrip; cancelled dirty quit preserves the app and CLI bridge");
  console.log("Native filesystem and cancelled-quit bridge retention passed");
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await close();
  page = await open("second-profile");
  const card = page.locator("[data-welcome-file-id]").filter({ hasText: "ReleaseSmoke.voo" });
  await card.getByRole("button", { name: "ReleaseSmoke.voo", exact: true }).click();
  await page.waitForFunction(count => window.__vooEditor?.getDocument().nodes.length === count &&
    document.querySelector('[data-open-guard="off"]'), saved.document.nodes.length);
  assert.deepEqual(canonicalProjectNodes(await page.evaluate(() => window.__vooEditor.getDocument().nodes)),
    canonicalProjectNodes(saved.document.nodes));
  checks.push("fresh packaged process/profile opens the physical project through its real workspace file card");
  await page.screenshot({ path: path.join(evidence, `${platform}-${arch}.png`) });
  assert.deepEqual(errors, []);
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await close();
  proof = {
    platform, arch, version: pkg.version,
    revision: process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    packaged: true, checks, errors,
    remaining: ["interactive OS installer UX", "signed/notarized distribution trust", "live CLI/model services", "update from an older installed version"],
  };
} catch (error) {
  await writeFile(path.join(evidence, `${platform}-${arch}-failure.json`), JSON.stringify({
    platform, arch, version: pkg.version, completedChecks: checks, error: String(error), rendererErrors: errors,
  }, null, 2));
  if (application) {
    try { await (await application.firstWindow()).screenshot({ path: path.join(evidence, `${platform}-${arch}-failure.png`) }); }
    catch (captureError) { console.warn("Unable to capture failed packaged window:", String(captureError)); }
  }
  throw error;
} finally {
  try { await close(); } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}
// A cleanup failure must not leave a success receipt eligible for assembly.
await writeFile(path.join(evidence, `${platform}-${arch}.json`), JSON.stringify(proof, null, 2));
console.log(`Packaged ${platform}/${arch} checks passed: ${checks.join("; ")}`);
