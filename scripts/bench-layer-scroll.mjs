import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { cpus, loadavg, platform, arch, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";
import { createRectNode } from "../src/canvas/editor/scene_model_node_builders.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.env.VOO_PERF_OUTPUT ?? join(tmpdir(), "voo-layer-scroll.json"));
const mode = process.env.VOO_PERF_MODE ?? "production";
const dpr = Number(process.env.VOO_PERF_DPR ?? 1);
const sourceFile = process.env.VOO_PERF_FILE;
const buildDir = resolve(root, process.env.VOO_PERF_DIST ?? "dist");
if (!["production", "development"].includes(mode)) throw new Error("Unsupported VOO_PERF_MODE");
if (![1, 2].includes(dpr)) throw new Error("VOO_PERF_DPR must be 1 or 2");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const revision = process.env.VOO_PERF_SOURCE_REVISION ?? git(["rev-parse", "HEAD"]);
const dirty = process.env.VOO_PERF_SOURCE_DIRTY ?? git(["status", "--porcelain"]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const report = {
  revision, dirty, mode, buildRevision: process.env.VOO_PERF_BUILD_REVISION ?? null,
  timestamp: new Date().toISOString(), cpu: cpus()[0]?.model, platform: platform(), arch: arch(),
  node: process.version, dpr, viewport: { width: 1440, height: 1000 }, loadBefore: loadavg(),
  scope: "Sequential headless Chromium; synthetic RAF scrolling, not native Electron, physical input, GPU FPS or a leak proof",
  runs: [], memory: [],
};
if (mode === "production") report.buildHtmlSha256 = sha256(await readFile(join(buildDir, "index.html")));
if (sourceFile) report.input = { path: sourceFile, sha256: sha256(await readFile(sourceFile)) };

async function recordProfile(page, cdp) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
  const complete = new Promise(done => cdp.once("Tracing.tracingComplete", done));
  await cdp.send("Tracing.start", { categories: "devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline", transferMode: "ReturnAsStream" });
  await page.evaluate(async () => {
    const list = document.querySelector("[data-layers-list]");
    for (let i = 0; i < 180; i += 1) {
      await new Promise(requestAnimationFrame);
      list.scrollTop = (list.scrollHeight - list.clientHeight) * (i % 60) / 59;
    }
  });
  const { profile } = await cdp.send("Profiler.stop");
  await cdp.send("Tracing.end");
  const { stream } = await complete;
  let trace = "";
  try {
    for (;;) {
      const chunk = await cdp.send("IO.read", { handle: stream });
      trace += chunk.data;
      if (chunk.eof) break;
    }
  } finally { await cdp.send("IO.close", { handle: stream }); }
  await writeFile(`${output}.cpuprofile`, JSON.stringify(profile));
  await writeFile(`${output}.trace.json`, trace);
}

async function run({ page }) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  const start = Date.now();
  if (sourceFile) {
    const [picker] = await Promise.all([page.waitForEvent("filechooser"),
      page.getByTestId("editor-top-bar").getByRole("button", { name: /^Import project file/ }).click()]);
    await picker.setFiles(sourceFile);
  } else {
    await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  }
  await page.waitForFunction(() => window.__vooEditor &&
    document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off",
  null, { timeout: 180000 });
  await page.getByTestId("loading-modal").waitFor({ state: "detached", timeout: 180000 });
  report.openMs = Date.now() - start;
  if (!sourceFile) {
    const nodes = Array.from({ length: 2000 }, (_, i) => ({
      ...createRectNode({ x: i % 50 * 24, y: Math.floor(i / 50) * 24, width: 18, height: 18, fill: "#ff0000" }),
      id: `large-${i}`, name: `Layer${i}`,
    }));
    await page.evaluate(nodes => {
      const engine = window.__vooEditor;
      engine.selectExactly([]);
      engine.setDoc({ ...engine.getDocument(), isCanvasRoot: true, nodes });
    }, nodes);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector("[data-windowed-layers]"));
  await page.waitForTimeout(1500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  report.browser = await cdp.send("Browser.getVersion");
  const browserSession = await page.context().browser().newBrowserCDPSession();
  try { report.gpu = (await browserSession.send("SystemInfo.getInfo")).gpu; }
  finally { await browserSession.detach(); }
  report.scene = await page.evaluate(() => ({
    nodes: window.__vooEditor.getDocument().nodes.length, visibility: document.visibilityState,
    scrollHeight: document.querySelector("[data-layers-list]").scrollHeight,
    clientHeight: document.querySelector("[data-layers-list]").clientHeight,
  }));
  const memory = async () => {
    // Collection happens between rounds, never inside the timed sample loops.
    await cdp.send("HeapProfiler.collectGarbage");
    report.memory.push({ metrics: await cdp.send("Performance.getMetrics"),
      dom: await cdp.send("Memory.getDOMCounters") });
  };
  await memory();
  for (let round = 0; round < 3; round += 1) {
    report.runs.push(...await page.evaluate(async round => {
      const list = document.querySelector("[data-layers-list]");
      const runs = [];
      for (const mode of ["idle", "smooth", "sweep", "jump"]) {
        list.scrollTop = 0;
        await new Promise(done => setTimeout(done, 500));
        const samples = [], mounted = [];
        let previous;
        for (let i = 0; i < 121; i += 1) {
          const timestamp = await new Promise(requestAnimationFrame);
          if (previous !== undefined) samples.push(timestamp - previous);
          previous = timestamp;
          if (mode === "smooth") list.scrollTop = i * 17;
          if (mode === "sweep") list.scrollTop = (list.scrollHeight - list.clientHeight) * (i % 60) / 59;
          if (mode === "jump") list.scrollTop = i % 2 ? list.scrollHeight : 0;
          mounted.push(list.querySelectorAll("[data-layer-row-id]").length);
        }
        const sorted = [...samples].sort((a, b) => a - b);
        runs.push({ round, mode, samples, mounted, p50: sorted[60], p95: sorted[114],
          max: sorted.at(-1), above20: samples.filter(value => value > 20).length });
      }
      return runs;
    }, round));
    await memory();
  }
  if (sourceFile) report.selection = await page.evaluate(async () => {
    const engine = window.__vooEditor;
    const ids = engine.getDocument().nodes.filter(node => node.kind === "rect" && node.visible !== false).slice(-12).map(node => node.id);
    const runs = [];
    for (let round = 0; round < 3; round += 1) {
      engine.selectExactly([]);
      await new Promise(done => setTimeout(done, 500));
      const samples = [];
      for (const id of ids) {
        const start = performance.now();
        engine.selectExactly([id]);
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        samples.push(performance.now() - start);
      }
      runs.push({ round, samples });
    }
    return { scope: "Programmatic selection to two RAF callbacks, not input-to-presentation latency", ids, runs };
  });
  if (process.env.VOO_PERF_TRACE === "1") await recordProfile(page, cdp);
  report.errors = errors;
  if (errors.length) throw new Error(errors.join("\n"));
}

await mkdir(dirname(output), { recursive: true });
let browser, server;
try {
  if (mode === "development") {
    const { withEditorBrowser } = await import("../tests/e2e/editor-browser-fixture.mjs");
    await withEditorBrowser(run, { openDocument: false, mcpLink: false, deviceScaleFactor: dpr });
  } else {
    server = await preview({ root, build: { outDir: buildDir }, preview: { host: "127.0.0.1", port: 0, strictPort: true }, logLevel: "error" });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: dpr });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?voo-test=1`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("editor-top-bar").waitFor();
    await run({ page });
  }
  report.complete = true;
} catch (error) {
  report.complete = false;
  report.failure = error.stack ?? String(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise((done, reject) => server.httpServer.close(error => error ? reject(error) : done()));
  report.loadAfter = loadavg();
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, complete: report.complete, failure: report.failure }));
}
