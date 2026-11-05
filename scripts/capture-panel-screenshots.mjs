import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();

async function reachable(url, timeout = 1000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) return false;
    if (await reachable(url, 1500)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return !child || child.exitCode === null;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function isolatedDevUrl() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return `http://127.0.0.1:${port}/?voo-test=1`;
}

async function startVite(url) {
  const port = new URL(url).port || "5173";
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(
    command,
    ["vite", "--host", "127.0.0.1", "--port", port, "--strictPort"],
    { cwd: ROOT, detached: true, stdio: ["ignore", "ignore", "pipe"] }
  );
  child.on("error", () => {});
  const ready = await waitForServer(url, child);
  return { child, ready };
}

function stopProcess(child) {
  if (!child) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

export async function capturePanelScreenshots({ phase = "before" } = {}) {
  const outDir = path.resolve(ROOT, `docs/perf-panel-evidence/${phase}`);
  await fs.mkdir(outDir, { recursive: true });

  const { chromium } = await import("playwright");
  let child = null;
  let browser = null;
  const targetUrl = await isolatedDevUrl();
  const started = await startVite(targetUrl);
  child = started.child;
  if (!started.ready) {
    stopProcess(child);
    throw new Error(`Dev server did not start at ${targetUrl}`);
  }

  try {
    const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    // Initialize project
    await page.evaluate(async () => {
      if (window.__vooEditor) return;
      const { useDesignStore } = await import("/src/store/design_store.js");
      useDesignStore.getState().newVooProject({ label: "ScreenshotProject", width: 1440, height: 900 });
    });
    await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // 1. Capture Toolbar
    const toolbar = await page.$('[data-testid="editor-toolbar"]');
    if (toolbar) {
      await toolbar.screenshot({ path: path.join(outDir, "toolbar.png") });
      console.log(`[Screenshot] Saved toolbar.png to ${outDir}`);
    }

    // 2. Capture Empty Canvas / Background panel
    await page.evaluate(() => {
      const editor = window.__vooEditor;
      editor.selectExactly?.([]);
    });
    await page.waitForTimeout(600);
    let panel = await page.$('[data-testid="editor-properties-panel"]');
    if (panel) {
      await panel.screenshot({ path: path.join(outDir, "panel_canvas_background.png") });
      console.log(`[Screenshot] Saved panel_canvas_background.png`);
    }

    // 3. Create Frame and shapes, then capture Frame panel
    await page.evaluate(async () => {
      const {
        createRectNode,
        createEllipseNode,
        createGroupNode,
      } = await import("/src/canvas/editor/scene_model.js");
      const editor = window.__vooEditor;
      const frame = createGroupNode({
        id: "test-frame-1",
        x: 100,
        y: 100,
        width: 400,
        height: 300,
        name: "Card Frame",
        fill: "#242424",
      });
      frame.isFrame = true;
      frame.clipContent = true;

      const rect1 = createRectNode({
        id: "test-rect-1",
        x: 130,
        y: 130,
        width: 120,
        height: 80,
        fill: "#3b82f6",
        cornerRadius: 12,
        parentId: frame.id,
      });

      const rect2 = createRectNode({
        id: "test-rect-2",
        x: 280,
        y: 130,
        width: 100,
        height: 60,
        fill: "#10b981",
        cornerRadius: 6,
        parentId: frame.id,
      });

      editor.setDoc(
        {
          ...editor.getDocument(),
          nodes: [frame, rect1, rect2],
        },
        { commit: false }
      );
      editor.selectExactly?.(["test-frame-1"]);
    });
    await page.waitForTimeout(600);
    panel = await page.$('[data-testid="editor-properties-panel"]');
    if (panel) {
      await panel.screenshot({ path: path.join(outDir, "panel_frame_selected.png") });
      console.log(`[Screenshot] Saved panel_frame_selected.png`);
    }

    // 4. Capture Shape (Rectangle) selected panel
    await page.evaluate(() => {
      const editor = window.__vooEditor;
      editor.selectExactly?.(["test-rect-1"]);
    });
    await page.waitForTimeout(600);
    panel = await page.$('[data-testid="editor-properties-panel"]');
    if (panel) {
      await panel.screenshot({ path: path.join(outDir, "panel_shape_selected.png") });
      console.log(`[Screenshot] Saved panel_shape_selected.png`);
    }

    // 5. Capture Multi-selection (Mixed values) panel
    await page.evaluate(() => {
      const editor = window.__vooEditor;
      editor.selectExactly?.(["test-rect-1", "test-rect-2"]);
    });
    await page.waitForTimeout(600);
    panel = await page.$('[data-testid="editor-properties-panel"]');
    if (panel) {
      await panel.screenshot({ path: path.join(outDir, "panel_multi_mixed_selected.png") });
      console.log(`[Screenshot] Saved panel_multi_mixed_selected.png`);
    }

    // 6. Full workspace screenshot
    await page.screenshot({ path: path.join(outDir, "workspace_full.png") });
    console.log(`[Screenshot] Saved workspace_full.png`);
  } finally {
    if (browser) await browser.close();
    stopProcess(child);
  }
}

if (process.argv[1] && process.argv[1].endsWith("capture-panel-screenshots.mjs")) {
  const phase = process.argv[2] || "before";
  await capturePanelScreenshots({ phase });
}
