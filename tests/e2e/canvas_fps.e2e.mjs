// Browser FPS instrumentation for the canvas.
//
// Usage: `node tests/e2e/canvas_fps.e2e.mjs` (or `npm run test:e2e:fps`).
// VOO_FPS_NODES=1000,5000,20000 selects sizes; VOO_FPS_MS=2000 sets each sample.
// VOO_FPS_COMPLEX_SCENE=1 mixes imported PNGs, effects and nested Frames.
// VOO_FPS_SCENARIOS=zoom,drag isolates interactions for profiling.
// VOO_FPS_PROFILE=/tmp/canvas.cpuprofile captures a Chrome CPU profile.
// VOO_FPS_SCREENSHOT_DIR=/tmp/canvas-fps saves settled full-page PNGs.
// Uses Playwright chromium and the `?voo-test=1` engine hook. If no dev server
// is reachable it starts Vite briefly; if Playwright/Chromium is unavailable it
// fails with installation instructions. Install once with:
//   npm i -D playwright && npx playwright install chromium
//
// Fails below 30 FPS by default. VOO_FPS_MIN=0 explicitly selects measurement
// only. Results go to the OS temp directory or VOO_FPS_RESULTS_PATH.
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { verifyPreviewPixels } from "./canvas-preview-parity.mjs";
import { verifySkiaRectPreview } from "./skia-rect-preview-parity.mjs";
import { verifyCameraPixels } from "./canvas-camera-parity.mjs";
import { assertFpsThreshold, fpsThreshold } from "./canvas-fps-gate.mjs";
import { summarizeCpuProfile } from "./cpu_profile_summary.mjs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RESULTS_PATH = process.env.VOO_FPS_RESULTS_PATH || path.join(tmpdir(), "voo-canvas-fps-results.json");
const NODE_COUNTS = (process.env.VOO_FPS_NODES || "1000,5000,20000").split(",").map(Number);
const COMPLEX_SCENE = process.env.VOO_FPS_COMPLEX_SCENE === "1";
if (NODE_COUNTS.some(n => !Number.isInteger(n) || n < 1)) throw new Error("Invalid VOO_FPS_NODES");
const SCENARIOS = (process.env.VOO_FPS_SCENARIOS || "pan,zoom,drag").split(",");
if (SCENARIOS.some(s => !["pan", "zoom", "drag"].includes(s))) throw new Error("Invalid VOO_FPS_SCENARIOS");
const MINIMUM_FPS = fpsThreshold(process.env.VOO_FPS_MIN);
const SAMPLE_MS = Number(process.env.VOO_FPS_MS || 2000);
if (!Number.isFinite(SAMPLE_MS) || SAMPLE_MS <= 0) throw new Error("Invalid VOO_FPS_MS");
const SCREENSHOT_DIR = process.env.VOO_FPS_SCREENSHOT_DIR;
const EXPLICIT_URL = process.env.VOO_URL || null;
const GPU_MODE = process.env.VOO_FPS_GPU || "hardware";
if (!["hardware", "software"].includes(GPU_MODE)) throw new Error("Invalid VOO_FPS_GPU");
const LAUNCH_ARGS = GPU_MODE === "software"
  ? ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  : ["--no-sandbox"];

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
    if (await reachable(url, 1500)) {
      // Let a Vite bind failure reach exitCode before trusting the URL.
      await new Promise(resolve => setTimeout(resolve, 100));
      return !child || child.exitCode === null;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

// Never silently benchmark a dev server owned by another worktree. Reserve
// an unused port for our Vite child; --strictPort fails if a race takes it.
async function isolatedDevUrl() {
  const server = createTcpServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return `http://127.0.0.1:${port}/?voo-test=1`;
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
  if (SCREENSHOT_DIR) await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const playwright = await loadChromium();
  if (!playwright) {
    log("Cannot measure canvas FPS: playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`.");
    process.exitCode = 1;
    throw new Error("Browser benchmark prerequisites unavailable");
  }

  let url = EXPLICIT_URL && await reachable(EXPLICIT_URL) ? EXPLICIT_URL : null;
  if (!url) {
    const target = EXPLICIT_URL || await isolatedDevUrl();
    const started = await startVite(target);
    child = started.child;
    if (started.ready) {
      url = target;
    } else {
      stopProcess(child);
      child = null;
      log(`Cannot measure canvas FPS: no dev server at ${target} and Vite did not start.`);
      process.exitCode = 1;
      throw new Error("Browser benchmark prerequisites unavailable");
    }
  }

  try {
    browser = await playwright.launch({ headless: true, args: LAUNCH_ARGS });
  } catch (error) {
    log(`Cannot measure canvas FPS: chromium could not launch (${error?.message || error}). Run \`npx playwright install chromium\`.`);
    process.exitCode = 1;
    throw new Error("Browser benchmark prerequisites unavailable");
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(enabled => {
    if (enabled) localStorage.setItem('voo.wasm-engine', '1');
    else localStorage.removeItem('voo.wasm-engine');
  }, process.env.VOO_WASM_ENGINE === '1');
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  // Test mode exposes the engine only after a real document has been opened.
  // A fresh browser starts on the workbench, rather than an implicit blank page.
  await page.evaluate(async () => {
    if (window.__vooEditor) return;
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.getState().newVooProject({ label: "PerformanceAudit", width: 1440, height: 900 });
  });
  await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
  if (process.env.VOO_WASM_ENGINE === '1') {
    await page.waitForFunction(() => window.__vooEditor?.getWasmEngineStatus?.() === 'ready', null, { timeout: 30000 });
  }
  await page.waitForTimeout(1000);
  if (process.env.VOO_FPS_DISABLE_BACKDROP === "1") {
    await page.addStyleTag({ content: "*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" });
  }

  const profiler = (process.env.VOO_FPS_PROFILE || process.env.VOO_FPS_TRACE) ? await page.context().newCDPSession(page) : null;
  if (profiler) await profiler.send("Profiler.enable");
  const cpuProfiles = [];
  const results = [];
  for (const nodeCount of (process.env.VOO_FPS_PIXELS_ONLY === "1" ? [] : NODE_COUNTS)) {
    await page.evaluate(async ({ nodeCount, complexScene }) => {
      const { createRectNode, createImageNode, createGroupNode } = await import("/src/canvas/editor/scene_model.js");
      const editor = window.__vooEditor;
      const columns = Math.ceil(Math.sqrt(nodeCount));
      const nodes = [];
      const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pS8AAAAASUVORK5CYII=";
      const parentFor = new Map();
      if (complexScene) {
        for (let start = 0; start < nodeCount; start += 256) {
          const frame = createGroupNode({
            x: (start % columns) * 24,
            y: Math.floor(start / columns) * 24,
            width: Math.min(256, nodeCount - start) * 24,
            height: 120,
            name: `Performance frame ${Math.floor(start / 256) + 1}`,
          });
          frame.isFrame = true;
          frame.fill = "#17191b";
          nodes.push(frame);
          const end = Math.min(nodeCount, start + 256);
          for (let innerStart = start; innerStart < end; innerStart += 64) {
            const inner = createGroupNode({
              x: (innerStart % columns) * 24,
              y: Math.floor(innerStart / columns) * 24,
              width: Math.min(64, end - innerStart) * 24,
              height: 120,
              parentId: frame.id,
            });
            inner.isFrame = true;
            inner.fill = "#202326";
            nodes.push(inner);
            for (let index = innerStart; index < Math.min(end, innerStart + 64); index += 1) {
              parentFor.set(index, inner.id);
            }
          }
        }
      }
      for (let i = 0; i < nodeCount; i += 1) {
        const geometry = {
          x: (i % columns) * 24,
          y: Math.floor(i / columns) * 24,
          width: 18,
          height: 18,
          fill: i % 2 ? "#3366ff" : "#ff6633",
          ...(parentFor.has(i) ? { parentId: parentFor.get(i) } : {}),
        };
        if (complexScene && i % 32 === 0) {
          nodes.push(createImageNode({ ...geometry, imageId: `fps-image-${i}`, src: png }));
        } else {
          const node = createRectNode(geometry);
          if (complexScene && i % 5 === 0) {
            node.effects = { shadow: { enabled: true, color: "#000000", blur: 6, offsetX: 2, offsetY: 3, opacity: 45 } };
          }
          nodes.push(node);
        }
      }
      editor.setDoc({ ...editor.getDocument(), width: columns * 24,
        height: Math.ceil(nodeCount / columns) * 24, nodes }, { commit: false });
      editor.zoomToFit();
    }, { nodeCount, complexScene: COMPLEX_SCENE });
    if (SCREENSHOT_DIR) {
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `fps-${nodeCount}-settled.png`), fullPage: true });
    }
    for (const scenario of SCENARIOS) {
      await page.evaluate(() => window.__vooEditor.zoomToFit());
      await page.waitForTimeout(1000);
      const profileSample = !!profiler;
      if (profileSample) await profiler.send("Profiler.start");
      if (process.env.VOO_FPS_TRACE) await profiler.send("Tracing.start", {
        categories: "devtools.timeline,cc,gpu,benchmark", transferMode: "ReturnAsStream",
      });
      const result = await page.evaluate(async ({ scenario, sampleMs, details }) => {
        const editor = window.__vooEditor;
        const base = { ...editor.getViewport() };
        const node = editor.getDocument().nodes[0];
        const frames = [], timings = [];
        const sampleCanvas = details ? document.querySelector('canvas[data-testid="editor-2d-canvas"][data-renderer-active="true"]') : null;
        const canvasDetails = sampleCanvas ? { width: sampleCanvas.width, height: sampleCanvas.height,
          connected: sampleCanvas.isConnected, editorRoot: !!sampleCanvas.closest('[data-testid="design-editor"]'), rendererActive: sampleCanvas.getAttribute("data-renderer-active"),
          attributes: sampleCanvas.getContext("2d").getContextAttributes?.() } : null;
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
        return { ...(details ? { canvasDetails, gestureBackdropActive: !!document.querySelector('[data-voo-camera-preview]'),
          liveBackdrops: [...document.querySelectorAll('*')].map(el => ({ el, style: getComputedStyle(el), rect: el.getBoundingClientRect() }))
            .filter(({ style, rect }) => style.backdropFilter !== 'none' && style.backdropFilter && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0)
            .map(({ el, rect }) => ({ widget: el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName,
              outsideEditor: !el.closest('[data-testid="design-editor"]'), area: Math.round(rect.width * rect.height) }))
            .sort((a,b) => b.area - a.area).slice(0, 12), tileLayerActive: !!document.querySelector("[data-canvas-tile-layer]") } : {}), avgFps: +(frames.length * 1000 / total).toFixed(2),
          p95FrameMs: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2),
          updateMs: +(timings.reduce((a,b) => a+b, 0) / timings.length).toFixed(2),
          frames: frames.length, durationMs: Math.round(total),
          nodeCount: editor.getDocument().nodes.filter(item => item.kind !== "group").length,
          sceneNodeCount: editor.getDocument().nodes.length };
      }, { scenario, sampleMs: SAMPLE_MS, details: !!process.env.VOO_FPS_DETAILS });
      if (process.env.VOO_FPS_TRACE) {
        const complete = new Promise(resolve => profiler.once("Tracing.tracingComplete", resolve));
        await profiler.send("Tracing.end");
        const { stream } = await complete;
        const chunks = [];
        while (true) {
          const chunk = await profiler.send("IO.read", { handle: stream });
          chunks.push(chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : Buffer.from(chunk.data));
          if (chunk.eof) break;
        }
        await profiler.send("IO.close", { handle: stream });
        await fs.writeFile(`${process.env.VOO_FPS_TRACE}-${nodeCount}-${scenario}.json`, Buffer.concat(chunks));
      }
      if (profileSample) {
        const cpuProfile = (await profiler.send("Profiler.stop")).profile;
        cpuProfiles.push({ nodeCount, scenario, ...summarizeCpuProfile(cpuProfile) });
        // Retain the diagnostic even if a later pixel check or sample fails.
        const filename = (process.env.VOO_FPS_PROFILE || "/tmp/canvas-fps.cpuprofile").replace(/(?:\.cpuprofile)?$/, `-${nodeCount}-${scenario}.cpuprofile`);
        await fs.writeFile(filename, JSON.stringify(cpuProfile));
      }
      if (result.nodeCount !== nodeCount || !Number.isFinite(result.avgFps)) {
        throw new Error(`Invalid ${nodeCount}-node ${scenario} measurement`);
      }
      results.push({ scenario, scene: COMPLEX_SCENE ? "mixed-assets" : "rectangles", ...result });
      log(results.at(-1));
      if (SCREENSHOT_DIR && (scenario === "zoom" || scenario === "drag")) {
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `fps-${nodeCount}-after-${scenario}.png`), fullPage: true });
      }
    }
  }
  let idleFps = null;
  if (process.env.VOO_FPS_DETAILS) {
    await page.waitForTimeout(1000);
    idleFps = await page.evaluate(async () => {
      let start, frames = 0;
      return new Promise(resolve => {
        const sample = now => {
          if (start === undefined) start = now;
          else frames++;
          if (now - start < 2000) requestAnimationFrame(sample);
          else resolve(+(frames * 1000 / (now - start)).toFixed(2));
        };
        requestAnimationFrame(sample);
      });
    });
  }
  // Outside timed samples: partial paint must equal a subsequent full paint,
  // including opaque/translucent overlaps and the selection handles.
  const previewPixelsMatch = await page.evaluate(verifyPreviewPixels);
  // Compare settled camera output against the authoritative renderer on
  // independent canvases, including fractional pan, DPR, transparent overlap,
  // selection changes, edits and undo. No screenshot timing assumptions.
  const cameraPixelsMatch = await page.evaluate(verifyCameraPixels);
  if (cameraPixelsMatch !== true) {
    for (const key of ["cached", "full"]) await fs.writeFile(path.join(tmpdir(), `voo-camera-${key}.png`), Buffer.from(cameraPixelsMatch[key].split(",")[1], "base64"));
    throw new Error(cameraPixelsMatch.error);
  }
  if (!previewPixelsMatch) throw new Error("Cached/partial preview pixels differ from full repaint");
  const gpuPreviewPixelsMatch = await page.evaluate(verifySkiaRectPreview);
  if (gpuPreviewPixelsMatch !== true) {
    for (const key of ["cached", "full"]) await fs.writeFile(path.join(tmpdir(), `voo-gpu-${key}.png`), Buffer.from(gpuPreviewPixelsMatch[key].split(",")[1], "base64"));
    throw new Error(gpuPreviewPixelsMatch.error);
  }
  const samplePixelsMatch = await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    const node = createRectNode({ x: 50, y: 50, width: 100, height: 100, fill: "#123456" });
    editor.setDoc({ ...editor.getDocument(), width: 500, height: 400, backgroundColor: "#ffffff", nodes: [node] }, { commit: false });
    editor.zoomToFit();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return editor.sampleColorAt({ x: 100, y: 100 }) === "#123456";
  });
  if (!samplePixelsMatch) throw new Error("Deferred stage color sampling is stale");
  await page.waitForFunction(() => !document.querySelector('[data-voo-camera-preview]'), null, { timeout: 3000 });
  const gestureUiRestored = true;
  if (!gestureUiRestored) throw new Error("Settled camera retained the UI preview tier");
  if (profiler) {
    log({ cpuProfiles });
  }
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join("; ")}`);
  const summary = {
    browser: browser.version(),
    launchArgs: LAUNCH_ARGS,
    gpuMode: GPU_MODE,
    renderer: "CanvasKit workspace with Canvas2D fallbacks",
    generatedAt: new Date().toISOString(),
    url,
    viewport: "1440x1000",
    requestedNodes: NODE_COUNTS,
    scenarios: SCENARIOS,
    previewPixelsMatch,
    gpuPreviewPixelsMatch,
    samplePixelsMatch,
    cameraPixelsMatch,
    gestureUiRestored,
    ...(process.env.VOO_FPS_DISABLE_BACKDROP === "1" ? { diagnosticBackdropDisabled: true } : {}),
    ...(idleFps == null ? {} : { idleFps }),
    sampleMs: SAMPLE_MS,
    minimumFps: MINIMUM_FPS,
    results,
  };
  await fs.mkdir(path.dirname(RESULTS_PATH), { recursive: true });
  await fs.writeFile(RESULTS_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  log(summary);
  if (process.env.VOO_FPS_PIXELS_ONLY !== "1") assertFpsThreshold(results, MINIMUM_FPS);
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`canvas FPS instrumentation failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopProcess(child);
}
