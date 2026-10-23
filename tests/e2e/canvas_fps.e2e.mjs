// Browser FPS instrumentation for the canvas.
//
// Usage: `node tests/e2e/canvas_fps.e2e.mjs` (or `npm run test:e2e:fps`).
// VOO_FPS_NODES=1000,5000,20000 selects sizes; VOO_FPS_MS=2000 sets each sample.
// VOO_FPS_PROFILE=/tmp/canvas.cpuprofile captures a Chrome CPU profile.
// Uses Playwright chromium and the `?voo-test=1` engine hook. If no dev server
// is reachable it starts Vite briefly; if Playwright/Chromium is unavailable it
// fails with installation instructions. Install once with:
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
const NODE_COUNTS = (process.env.VOO_FPS_NODES || "1000,5000,20000").split(",").map(Number);
if (NODE_COUNTS.some(n => !Number.isInteger(n) || n < 1)) throw new Error("Invalid VOO_FPS_NODES");
const SAMPLE_MS = Number(process.env.VOO_FPS_MS || 2000);
if (!Number.isFinite(SAMPLE_MS) || SAMPLE_MS <= 0) throw new Error("Invalid VOO_FPS_MS");
const EXPLICIT_URL = process.env.VOO_URL || null;
const CANDIDATES = EXPLICIT_URL
  ? [EXPLICIT_URL]
  : [
      "http://127.0.0.1:5197/?voo-test=1",
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
    log("Cannot measure canvas FPS: playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`.");
    process.exitCode = 1;
    throw new Error("Browser benchmark prerequisites unavailable");
  }

  let url = null;
  for (const candidate of CANDIDATES) {
    if (EXPLICIT_URL && await reachable(candidate)) {
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
      log(`Cannot measure canvas FPS: no dev server at ${CANDIDATES.join(", ")} and Vite did not start.`);
      process.exitCode = 1;
      throw new Error("Browser benchmark prerequisites unavailable");
    }
  }

  try {
    browser = await playwright.launch({ headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  } catch (error) {
    log(`Cannot measure canvas FPS: chromium could not launch (${error?.message || error}). Run \`npx playwright install chromium\`.`);
    process.exitCode = 1;
    throw new Error("Browser benchmark prerequisites unavailable");
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  const profiler = process.env.VOO_FPS_PROFILE ? await page.context().newCDPSession(page) : null;
  if (profiler) { await profiler.send("Profiler.enable"); await profiler.send("Profiler.start"); }
  const results = [];
  for (const nodeCount of NODE_COUNTS) {
    await page.evaluate(async (nodeCount) => {
      const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const editor = window.__vooEditor;
      const columns = Math.ceil(Math.sqrt(nodeCount));
      const nodes = Array.from({ length: nodeCount }, (_, i) => createRectNode({
        x: (i % columns) * 24, y: Math.floor(i / columns) * 24,
        width: 18, height: 18, fill: i % 2 ? "#3366ff" : "#ff6633",
      }));
      editor.setDoc({ ...editor.getDocument(), width: columns * 24,
        height: Math.ceil(nodeCount / columns) * 24, nodes }, { commit: false });
      editor.zoomToFit();
    }, nodeCount);
    for (const scenario of ["pan", "zoom", "drag"]) {
      await page.evaluate(() => window.__vooEditor.zoomToFit());
      await page.waitForTimeout(1000);
      const result = await page.evaluate(async ({ scenario, sampleMs }) => {
        const editor = window.__vooEditor;
        const base = { ...editor.getViewport() };
        const node = editor.getDocument().nodes[0];
        const frames = [], timings = [];
        let previous;
        let started;
        await new Promise(resolve => {
          function loop(now) {
            if (started === undefined) started = now;
            if (previous !== undefined) frames.push(now - previous);
            previous = now;
            const phase = (now - started) / 500;
            const t = performance.now();
            if (scenario === "pan") editor.setViewport({ ...base,
              panX: base.panX + Math.sin(phase) * 80,
              panY: base.panY + Math.cos(phase) * 50 });
            if (scenario === "zoom") editor.zoomAt(Math.exp(Math.sin(phase) * 0.015), { x: 720, y: 500 });
            // Same preview update operation used by the pointer move dispatcher.
            if (scenario === "drag") editor.updateNodes([{ id: node.id,
              x: node.x + Math.sin(phase) * 60, y: node.y + Math.cos(phase) * 40 }],
              { commit: false, preview: true });
            editor.requestRender();
            timings.push(performance.now() - t);
            if (now - started < sampleMs) requestAnimationFrame(loop);
            else resolve();
          }
          requestAnimationFrame(loop);
        });
        const sorted = [...frames].sort((a,b) => a-b);
        const total = frames.reduce((a,b) => a+b, 0);
        return { avgFps: +(frames.length * 1000 / total).toFixed(2),
          p95FrameMs: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2),
          updateMs: +(timings.reduce((a,b) => a+b, 0) / timings.length).toFixed(2),
          frames: frames.length, durationMs: Math.round(total), nodeCount: editor.getDocument().nodes.length };
      }, { scenario, sampleMs: SAMPLE_MS });
      if (result.nodeCount !== nodeCount || !Number.isFinite(result.avgFps)) {
        throw new Error(`Invalid ${nodeCount}-node ${scenario} measurement`);
      }
      results.push({ scenario, ...result });
      log(results.at(-1));
    }
  }
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    await fs.writeFile(process.env.VOO_FPS_PROFILE, JSON.stringify(profile));
  }
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join("; ")}`);
  const summary = {
    browser: browser.version(),
    launchArgs: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    renderer: "Canvas2D (default app renderer)",
    generatedAt: new Date().toISOString(),
    url,
    viewport: "1440x1000",
    requestedNodes: NODE_COUNTS,
    sampleMs: SAMPLE_MS,
    results,
  };
  await fs.mkdir(path.dirname(RESULTS_PATH), { recursive: true });
  await fs.writeFile(RESULTS_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  log(summary);
  if (results.some(r => r.avgFps < 30)) {
    process.stderr.write(`WARN canvas FPS is low: below 30 FPS\n`);
  }
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`canvas FPS instrumentation failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopProcess(child);
}
