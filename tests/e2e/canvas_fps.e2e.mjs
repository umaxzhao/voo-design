// Browser FPS instrumentation for the canvas.
//
// Usage: `node tests/e2e/canvas_fps.e2e.mjs` (or `npm run test:e2e:fps`).
// Uses Playwright chromium and the `?voo-test=1` engine hook. If no dev server
// is reachable it starts Vite briefly; if Playwright/Chromium is unavailable it
// prints SKIP and exits 0. Install once with:
//   npm i -D playwright && npx playwright install chromium
//
// This is instrumentation, not a gate: a low FPS is reported and the process
// still exits 0. The latest numbers are written to docs/canvas-fps-results.json.
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RESULTS_PATH = path.join(ROOT, "docs", "canvas-fps-results.json");
const NODE_COUNT = Number(process.env.VOO_FPS_NODES || 2000);
const SAMPLE_MS = Number(process.env.VOO_FPS_MS || 2000);
const EXPLICIT_URL = process.env.VOO_URL || null;
const CANDIDATES = EXPLICIT_URL
  ? [EXPLICIT_URL]
  : [
      "http://localhost:5173/?voo-test=1",
      "http://localhost:5199/?voo-test=1",
    ];

function log(value) {
  process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}

async function reachable(url, timeout = 1000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) return false;
    if (await reachable(url, 1500)) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function startVite(url) {
  const port = new URL(url).port || "5173";
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(
    command,
    ["vite", "--host", "127.0.0.1", "--port", port, "--strictPort"],
    { cwd: ROOT, detached: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  child.on("error", () => {});
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
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
    } catch {
      // Already gone.
    }
  }
}

async function loadChromium() {
  try {
    const playwright = await import("playwright");
    return playwright.chromium;
  } catch {
    return null;
  }
}

let child = null;
let browser = null;
try {
  const playwright = await loadChromium();
  if (!playwright) {
    log("SKIP canvas FPS: playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`.");
    process.exit(0);
  }

  let url = null;
  for (const candidate of CANDIDATES) {
    if (await reachable(candidate)) {
      url = candidate;
      break;
    }
  }
  if (!url) {
    const target = CANDIDATES[0];
    const started = await startVite(target);
    child = started.child;
    if (started.ready) {
      url = target;
    } else {
      stopProcess(child);
      child = null;
      log(`SKIP canvas FPS: no dev server at ${CANDIDATES.join(", ")} and Vite did not start.`);
      process.exit(0);
    }
  }

  try {
    browser = await playwright.launch({ headless: true, args: ["--no-sandbox"] });
  } catch (error) {
    log(`SKIP canvas FPS: chromium could not launch (${error?.message || error}). Run \`npx playwright install chromium\`.`);
    process.exit(0);
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async ({ nodeCount, sampleMs }) => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    const documentBefore = editor.getDocument();
    const nodes = [...documentBefore.nodes];
    const columns = Math.ceil(Math.sqrt(nodeCount));
    for (let index = 0; index < nodeCount; index += 1) {
      nodes.push(
        createRectNode({
          x: (index % columns) * 24,
          y: Math.floor(index / columns) * 24,
          width: 18,
          height: 18,
          fill: index % 2 ? "#3366ff" : "#ff6633",
        }),
      );
    }
    editor.setDoc?.({ ...documentBefore, nodes }, { commit: false, name: "FPS benchmark" });

    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    editor.zoomToFit?.();
    await nextFrame();
    await nextFrame();

    const frames = [];
    let previous = performance.now();
    const started = previous;
    let tick = 0;
    await new Promise((resolve) => {
      const loop = (now) => {
        frames.push(now - previous);
        previous = now;
        const elapsed = now - started;
        const phase = (elapsed / 1000) * Math.PI;
        editor.panBy?.(Math.sin(phase) * 6, Math.cos(phase) * 4);
        if (tick > 0 && tick % 120 === 0) {
          editor.zoomAt?.(tick % 240 === 0 ? 1.05 : 1 / 1.05, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
        }
        editor.requestRender?.();
        tick += 1;
        if (elapsed < sampleMs) requestAnimationFrame(loop);
        else resolve();
      };
      requestAnimationFrame(loop);
    });

    const usable = frames.filter((value) => Number.isFinite(value) && value > 0);
    const total = usable.reduce((sum, value) => sum + value, 0);
    const sorted = [...usable].sort((a, b) => a - b);
    const p95Index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
    );
    return {
      avgFps: total > 0 ? Math.round((usable.length * 1000 * 100) / total) / 100 : 0,
      p95FrameMs: sorted.length ? Math.round(sorted[p95Index] * 100) / 100 : 0,
      frames: usable.length,
      durationMs: Math.round(total),
      nodeCount: editor.getDocument().nodes.length,
    };
  }, { nodeCount: NODE_COUNT, sampleMs: SAMPLE_MS });

  const summary = {
    generatedAt: new Date().toISOString(),
    url,
    viewport: "1440x1000",
    requestedNodes: NODE_COUNT,
    sampleMs: SAMPLE_MS,
    ...result,
  };
  await fs.mkdir(path.dirname(RESULTS_PATH), { recursive: true });
  await fs.writeFile(RESULTS_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  log(summary);
  if (pageErrors.length) log({ pageErrors });
  if (summary.avgFps < 20) {
    process.stderr.write(`WARN canvas FPS is low: ${summary.avgFps} avg FPS (soft threshold 20)\n`);
  }
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`canvas FPS instrumentation failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopProcess(child);
}
