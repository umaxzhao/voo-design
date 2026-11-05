import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

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

export async function runPerfMeasurement({ label = "Measurement" } = {}) {
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
    const launchStart = performance.now();
    const chromePath = process.env.CHROME_BIN || "/usr/bin/google-chrome";
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    console.log(`[Perf] Starting browser and navigating...`);
    const navStart = performance.now();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    console.log(`[Perf] Creating initial project...`);
    await page.evaluate(async () => {
      if (window.__vooEditor) return;
      const { useDesignStore } = await import("/src/store/design_store.js");
      useDesignStore.getState().newVooProject({ label: "PerfBenchTab1", width: 1440, height: 900 });
    });
    await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 30000 });
    await page.waitForFunction(
      () =>
        Boolean(
          [...document.querySelectorAll("canvas")].some(
            (c) => c.width > 0 && c.height > 0 && c.getBoundingClientRect().width > 0
          )
        ),
      null,
      { timeout: 30000 }
    );
    const startupTimeMs = Math.round(performance.now() - navStart);
    console.log(`[Perf] Startup time: ${startupTimeMs} ms`);

    console.log(`[Perf] Measuring tab switch latency...`);
    const tabSwitchLatencyMs = await page.evaluate(async () => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const store = useDesignStore.getState();
      const tab1Id = store.activeDocumentId;
      store.newVooProject({ label: "PerfBenchTab2", width: 1200, height: 800 });
      await new Promise((r) => setTimeout(r, 300));
      const tab2Id = useDesignStore.getState().activeDocumentId;

      // Switch from tab2 back to tab1
      const start = performance.now();
      useDesignStore.getState().switchDocument(tab1Id);
      await new Promise((resolve) => {
        const check = () => {
          if (useDesignStore.getState().activeDocumentId === tab1Id && window.__vooEditor) {
            requestAnimationFrame(() => resolve());
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
      return Math.round(performance.now() - start);
    });
    console.log(`[Perf] Tab switch latency: ${tabSwitchLatencyMs} ms`);

    console.log(`[Perf] Building 500+ layer synthetic document...`);
    const setupInfo = await page.evaluate(async () => {
      const {
        createRectNode,
        createEllipseNode,
        createPathNode,
        createImageNode,
        createGroupNode,
      } = await import("/src/canvas/editor/scene_model.js");
      const editor = window.__vooEditor;
      const totalNodes = 520;
      const nodes = [];
      const frameCount = 4;
      const nodesPerFrame = 120;

      // Generate a 1000x1000 synthetic image bitmap data URL
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1000;
      const ctx = canvas.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, 1000, 1000);
      grad.addColorStop(0, "#ff4444");
      grad.addColorStop(0.5, "#44ff44");
      grad.addColorStop(1, "#4444ff");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1000, 1000);
      const largeImageDataUrl = canvas.toDataURL("image/png");

      for (let f = 0; f < frameCount; f++) {
        const frameX = f * 700;
        const frameY = 0;
        const frame = createGroupNode({
          x: frameX,
          y: frameY,
          width: 650,
          height: 650,
          name: `Frame ${f + 1}`,
        });
        frame.isFrame = true;
        frame.fill = "#1e1e1e";
        nodes.push(frame);

        // Nested big bitmap in each frame
        nodes.push(
          createImageNode({
            x: frameX + 20,
            y: frameY + 20,
            width: 300,
            height: 300,
            imageId: `large-img-${f}`,
            src: largeImageDataUrl,
            parentId: frame.id,
          })
        );

        // Fill with various vector shapes
        for (let i = 0; i < nodesPerFrame - 1; i++) {
          const col = i % 10;
          const row = Math.floor(i / 10);
          const x = frameX + 40 + col * 55;
          const y = frameY + 40 + row * 50;
          if (i % 3 === 0) {
            nodes.push(
              createRectNode({
                x,
                y,
                width: 45,
                height: 35,
                fill: i % 2 ? "#3b82f6" : "#10b981",
                cornerRadius: 8,
                parentId: frame.id,
              })
            );
          } else if (i % 3 === 1) {
            nodes.push(
              createEllipseNode({
                x,
                y,
                width: 40,
                height: 40,
                fill: "#f59e0b",
                parentId: frame.id,
              })
            );
          } else {
            nodes.push(
              createPathNode({
                points: [
                  [x, y],
                  [x + 40, y + 10],
                  [x + 20, y + 40],
                ],
                stroke: "#ec4899",
                strokeWidth: 2,
                parentId: frame.id,
              })
            );
          }
        }
      }

      // Add remaining root nodes
      while (nodes.length < totalNodes) {
        const idx = nodes.length;
        nodes.push(
          createRectNode({
            x: (idx % 20) * 80,
            y: 800 + Math.floor(idx / 20) * 60,
            width: 60,
            height: 40,
            fill: "#6366f1",
          })
        );
      }

      editor.setDoc(
        {
          ...editor.getDocument(),
          width: frameCount * 700 + 100,
          height: 1600,
          nodes,
        },
        { commit: false }
      );
      editor.zoomToFit();
      return { totalLayers: nodes.length, frameCount };
    });

    await page.waitForTimeout(1000);

    console.log(`[Perf] Document loaded with ${setupInfo.totalLayers} layers. Measuring Pan FPS...`);
    // 4. Measure Pan FPS
    const panResult = await page.evaluate(async (sampleMs) => {
      const editor = window.__vooEditor;
      const base = { ...editor.getViewport() };
      const frames = [];
      let previous, started;
      await new Promise((resolve) => {
        function loop(now) {
          if (started === undefined) started = now;
          if (previous !== undefined) frames.push(now - previous);
          previous = now;
          const phase = (now - started) / 400;
          editor.setViewport({
            ...base,
            panX: base.panX + Math.sin(phase) * 150,
            panY: base.panY + Math.cos(phase) * 100,
          });
          editor.requestRender();
          if (now - started < sampleMs) requestAnimationFrame(loop);
          else resolve();
        }
        requestAnimationFrame(loop);
      });
      const total = frames.reduce((a, b) => a + b, 0);
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        fps: +(frames.length * 1000 / total).toFixed(1),
        p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2),
        frames: frames.length,
      };
    }, 2000);

    console.log(`[Perf] Pan FPS: ${panResult.fps}. Measuring Zoom FPS...`);
    // 5. Measure Zoom FPS
    const zoomResult = await page.evaluate(async (sampleMs) => {
      const editor = window.__vooEditor;
      const frames = [];
      let previous, started;
      await new Promise((resolve) => {
        function loop(now) {
          if (started === undefined) started = now;
          if (previous !== undefined) frames.push(now - previous);
          previous = now;
          const phase = (now - started) / 400;
          editor.zoomAt(Math.exp(Math.sin(phase) * 0.02), { x: 720, y: 450 });
          editor.requestRender();
          if (now - started < sampleMs) requestAnimationFrame(loop);
          else resolve();
        }
        requestAnimationFrame(loop);
      });
      const total = frames.reduce((a, b) => a + b, 0);
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        fps: +(frames.length * 1000 / total).toFixed(1),
        p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2),
        frames: frames.length,
      };
    }, 2000);

    console.log(`[Perf] Zoom FPS: ${zoomResult.fps}. Measuring Drag FPS...`);
    // 6. Measure Drag FPS
    const dragResult = await page.evaluate(async (sampleMs) => {
      const editor = window.__vooEditor;
      const target = editor.getDocument().nodes.find((n) => n.kind === "rect");
      const frames = [];
      let previous, started;
      await new Promise((resolve) => {
        function loop(now) {
          if (started === undefined) started = now;
          if (previous !== undefined) frames.push(now - previous);
          previous = now;
          const phase = (now - started) / 300;
          editor.updateNodes(
            [
              {
                id: target.id,
                x: target.x + Math.sin(phase) * 80,
                y: target.y + Math.cos(phase) * 60,
              },
            ],
            { commit: false, preview: true }
          );
          editor.requestRender();
          if (now - started < sampleMs) requestAnimationFrame(loop);
          else resolve();
        }
        requestAnimationFrame(loop);
      });
      const total = frames.reduce((a, b) => a + b, 0);
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        fps: +(frames.length * 1000 / total).toFixed(1),
        p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2),
        frames: frames.length,
      };
    }, 2000);

    console.log(`[Perf] Drag FPS: ${dragResult.fps}. Measuring Marquee FPS...`);
    // 7. Measure Marquee / Box Selection FPS
    const marqueeResult = await page.evaluate(async (sampleMs) => {
      const editor = window.__vooEditor;
      const { nodesWithin } = await import("/src/canvas/editor/doc_ops_selection.js");
      const frames = [];
      let previous, started;
      await new Promise((resolve) => {
        function loop(now) {
          if (started === undefined) started = now;
          if (previous !== undefined) frames.push(now - previous);
          previous = now;
          const phase = (now - started) / 300;
          const rect = {
            x: 100,
            y: 100,
            width: 300 + Math.sin(phase) * 150,
            height: 300 + Math.cos(phase) * 100,
          };
          editor.setMarquee(rect);
          // Exercise nodesWithin hit testing against scene
          const doc = editor.getDocument();
          nodesWithin(doc, rect, { spatialIndex: editor.getSpatialIndex?.() });
          editor.requestRender();
          if (now - started < sampleMs) requestAnimationFrame(loop);
          else {
            editor.setMarquee(null);
            editor.requestRender();
            resolve();
          }
        }
        requestAnimationFrame(loop);
      });
      const total = frames.reduce((a, b) => a + b, 0);
      const sorted = [...frames].sort((a, b) => a - b);
      return {
        fps: +(frames.length * 1000 / total).toFixed(1),
        p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2),
        frames: frames.length,
      };
    }, 2000);

    console.log(`[Perf] Marquee FPS: ${marqueeResult.fps}. Waiting idle...`);
    // 8. Idle CPU and Memory
    await page.waitForTimeout(2000);
    const metricsRes = await cdp.send("Performance.getMetrics");
    const metricsMap = Object.fromEntries(metricsRes.metrics.map((m) => [m.name, m.value]));
    const jsHeapUsedMB = +(metricsMap.JSHeapUsedSize / (1024 * 1024)).toFixed(1);
    const jsHeapTotalMB = +(metricsMap.JSHeapTotalSize / (1024 * 1024)).toFixed(1);

    // Process memory via evaluate
    const memUsage = await page.evaluate(() => {
      return {
        jsHeapMB: performance.memory
          ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
          : null,
      };
    });

    const report = {
      label,
      timestamp: new Date().toISOString(),
      scene: {
        totalLayers: setupInfo.totalLayers,
        frameCount: setupInfo.frameCount,
        bitmapSize: "1000x1000 px RGBA",
      },
      metrics: {
        startupTimeMs,
        tabSwitchLatencyMs,
        panFps: panResult.fps,
        panP95Ms: panResult.p95Ms,
        zoomFps: zoomResult.fps,
        zoomP95Ms: zoomResult.p95Ms,
        dragFps: dragResult.fps,
        dragP95Ms: dragResult.p95Ms,
        marqueeFps: marqueeResult.fps,
        marqueeP95Ms: marqueeResult.p95Ms,
        idleJsHeapUsedMB: jsHeapUsedMB || memUsage.jsHeapMB,
        idleJsHeapTotalMB: jsHeapTotalMB,
      },
    };

    return report;
  } finally {
    if (browser) await browser.close();
    stopProcess(child);
  }
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith("measure-perf.mjs")) {
  const label = process.argv[2] || "Before";
  console.log(`Running performance measurement [${label}]...`);
  const report = await runPerfMeasurement({ label });
  console.log(JSON.stringify(report, null, 2));
  const outputPath = path.resolve(ROOT, `docs/perf-panel-evidence/perf-${label.toLowerCase()}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Saved results to ${outputPath}`);
}
