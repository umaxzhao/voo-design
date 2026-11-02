// Commercial critical-path checks against the running VOO preview.
// Run with: VOO_URL=http://127.0.0.1:4173/ node tests/e2e/critical_flows.e2e.mjs
const results = [];
const signalingUrl = process.env.VOO_SIGNALING_URL || "ws://127.0.0.1:8787";
let browser;
let page;

const signalingHost = new URL(signalingUrl).hostname;
if (!["127.0.0.1", "localhost", "[::1]"].includes(signalingHost)) {
  throw new Error("critical_flows requires VOO_SIGNALING_URL to use a loopback-only signaling service");
}

function report(name, status, reason) {
  results.push({ name, status, reason });
  process.stdout.write(`${JSON.stringify({ name, status, reason })}\n`);
}

async function flow(name, action) {
  try {
    const reason = await action();
    report(name, reason ? "SKIP" : "PASS", reason || "completed");
  } catch (error) {
    report(name, "FAIL", error?.message || String(error));
  }
}

async function requireVisible(locator, description) {
  if (!(await locator.count())) throw new Error(`${description} selector was not found`);
  await locator.first().waitFor({ state: "visible", timeout: 10000 });
  return locator.first();
}

try {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Playwright is unavailable");
  }
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.addInitScript((url) => {
    globalThis.__VOO_SIGNALING_URL__ = url;
  }, signalingUrl);
  await page.route("https://voo.run/editor/collab-config.json", route => route.abort());
  const url = process.env.VOO_URL || "http://127.0.0.1:4173/";

  await flow("Load", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("body").waitFor({ state: "visible" });
    if (!(await page.locator("body").innerText()).trim()) throw new Error("welcome page is empty");
    await page.waitForTimeout(1200);
    if (pageErrors.length || consoleErrors.length) {
      throw new Error([...pageErrors, ...consoleErrors].join(" | "));
    }
    return null;
  });

  await flow("New design", async () => {
    const button = page.getByRole("button", { name: "New", exact: true });
    if (!(await button.count())) return 'Welcome "New" button is unavailable';
    await button.first().click();
    await page.getByRole("button", { name: "Undo", exact: true }).waitFor({ state: "attached", timeout: 20000 });
    return null;
  });

  await flow("Draw and select", async () => {
    const rectTool = page.getByRole("button", { name: "Shapes", exact: true });
    if (!(await rectTool.count())) return 'Shapes tool button is not present';
    await rectTool.first().click();
    const canvas = await requireVisible(page.locator('[data-testid="editor-pages"] canvas'), "editor canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("editor canvas has no bounds");
    await page.evaluate(() => {
      window.__draftWriteObserved = false;
      window.addEventListener("voo:draft-updated", () => { window.__draftWriteObserved = true; }, { once: true });
    });
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 4 });
    await page.mouse.up();
    const layers = page.getByRole("complementary", { name: "Layers" });
    if (!(await layers.count())) return 'Layers panel accessible name "Layers" is unavailable';
    await layers.waitFor({ state: "visible" });
    await page.getByRole("button", { name: /Rectangle/ }).first().click();
    const properties = page.locator('[data-testid="editor-properties-panel"]');
    if (!(await properties.count())) return 'Properties panel test surface is unavailable';
    await properties.waitFor({ state: "visible" });
    return null;
  });

  await flow("Undo and redo", async () => {
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    if (!(await undo.count()) || !(await redo.count())) return "Undo/Redo accessible buttons are unavailable";
    await undo.click();
    await redo.click();
    return null;
  });

  await flow("Export", async () => {
    const exportButton = page.getByRole("button", { name: "Export project as a portable .zip snapshot", exact: true });
    if (!(await exportButton.count())) return 'Project export action is unavailable';
    const downloadEvent = page.waitForEvent("download", { timeout: 10000 });
    await exportButton.click();
    const download = await downloadEvent;
    if (!download.suggestedFilename().toLowerCase().endsWith(".zip")) {
      throw new Error(`download filename is not ZIP: ${download.suggestedFilename()}`);
    }
    return null;
  });

  await flow("Save", async () => {
    const nodeIdsBeforeReload = await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id));
    if (nodeIdsBeforeReload.length < 2) throw new Error("created canvas content is missing before reload");
    await page.waitForFunction(() => window.__draftWriteObserved, null, { timeout: 15000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Drafts", exact: true }).click();
    const draft = page.getByRole("button", { name: /Design1\.voo/ }).first();
    await draft.waitFor({ state: "visible", timeout: 20000 });
    await draft.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')
      ?.getAttribute("data-open-guard") === "off", null, { timeout: 60000 });
    await page.locator('[data-testid="editor-canvas-frame-label"]').first().waitFor({ state: "visible", timeout: 20000 });
    const restoredNodeIds = await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id));
    if (restoredNodeIds.length < nodeIdsBeforeReload.length) {
      throw new Error(`auto-saved canvas nodes were not restored from Drafts (before ${nodeIdsBeforeReload.length}, after ${restoredNodeIds.length})`);
    }
    return null;
  });

  await flow("Share link", async () => {
    const shareButton = page.getByRole("button", { name: /Share/ });
    if (!(await shareButton.count())) return 'Share accessible button is unavailable';
    await shareButton.first().click();
    const copyButton = page.getByRole("button", { name: "Copy", exact: true });
    await copyButton.waitFor({ state: "visible", timeout: 10000 });
    await copyButton.click();
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      const links = [...document.querySelectorAll("a[href]")].map(link => link.href);
      const inputs = [...document.querySelectorAll("input")].map(input => input.value);
      return [...links, ...inputs, text].some(value => /(?:\/r\/|\?r=).*#k=/.test(value));
    }, null, { timeout: 15000 });
    return null;
  });
} catch (error) {
  report("Setup", "FAIL", error?.message || String(error));
} finally {
  await browser?.close().catch(() => {});
}

process.exitCode = results.length === 7 && results.every(result => result.status === "PASS") ? 0 : 1;
