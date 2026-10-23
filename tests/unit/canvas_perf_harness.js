import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDocument,
  createEllipseNode,
  createImageNode,
  createPathNode,
  createRectNode,
  NODE_KIND,
} from "../../src/canvas/editor/scene_model.js";
import {
  buildSpatialIndex,
  visibleNodeIds,
  visibleWorldRect,
} from "../../src/canvas/editor/viewport_culling.js";
import { nodeAtPoint } from "../../src/canvas/editor/doc_ops_nodes.js";
import { createEngineNodeOps } from "../../src/canvas/editor/editor_engine_node_ops.js";
import { createCameraMatrixTransformer } from "../../src/canvas/editor/editor_pointer_pan_zoom.js";

export const REPO_ROOT = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);

export const NODE_COUNTS = [1000, 5000, 20000];
export const SCREEN = { width: 1920, height: 1080, margin: 240 };
export const CULL_SHIFTS = 100;
export const HIT_TEST_QUERIES = 1000;
export const UPDATE_NODE_COUNT = 50;
export const UPDATE_TICKS = 60;
export const UPDATE_STEP = 2;
export const CAMERA_CYCLES = 1500;
export const GRID_SPACING = 80;
export const IMAGE_HEAVY_COUNT = 500;

const MIXED_KINDS = ["rect", "ellipse", "path", "image"];

function buildNode(kind, x, y, index) {
  if (kind === "ellipse") {
    return createEllipseNode({ x, y, width: 50, height: 50, fill: "#7c9cff" });
  }
  if (kind === "path") {
    return createPathNode({
      points: [
        [x, y],
        [x + 44, y + 8],
        [x + 26, y + 38],
      ],
      stroke: "#ffffff",
      strokeWidth: 2,
    });
  }
  if (kind === "image") {
    return createImageNode({
      x,
      y,
      width: 64,
      height: 48,
      imageId: `bench-image-${index}`,
    });
  }
  return createRectNode({ x, y, width: 60, height: 40, fill: "#ef8b5a" });
}

export function buildSyntheticDocument(nodeCount, { imageHeavy = false } = {}) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
  const nodes = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    const x = column * GRID_SPACING;
    const y = row * GRID_SPACING;
    const kind = imageHeavy
      ? i < IMAGE_HEAVY_COUNT
        ? "image"
        : "rect"
      : MIXED_KINDS[i % MIXED_KINDS.length];
    const node = buildNode(kind, x, y, i);
    node.id = `bench-${i}`;
    nodes[i] = node;
  }
  const width = columns * GRID_SPACING;
  const height = Math.ceil(nodeCount / columns) * GRID_SPACING;
  const doc = createDocument(width, height, "#ffffff", {
    canvasId: `bench-canvas-${nodeCount}`,
  });
  doc.nodes = nodes;
  return { doc, nodes, width, height, columns };
}

function panCamera(shift, width, height) {
  const travelX = Math.max(0, width - SCREEN.width);
  const travelY = Math.max(0, height - SCREEN.height);
  const t = CULL_SHIFTS === 1 ? 0 : shift / (CULL_SHIFTS - 1);
  return { panX: -travelX * t, panY: -travelY * t, zoom: 1 };
}

function makeHitPoints(nodes) {
  const targets = nodes.filter((node) => node.kind !== NODE_KIND.PATH);
  const source = targets.length > 0 ? targets : nodes;
  const points = new Array(HIT_TEST_QUERIES);
  for (let i = 0; i < HIT_TEST_QUERIES; i += 1) {
    const node = source[(i * 37) % source.length];
    points[i] = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    };
  }
  return points;
}

function measureCull(doc, index, width, height) {
  const samples = new Array(CULL_SHIFTS);
  let totalMs = 0;
  let visibleTotal = 0;
  for (let shift = 0; shift < CULL_SHIFTS; shift += 1) {
    const camera = panCamera(shift, width, height);
    const t0 = performance.now();
    const visible = visibleNodeIds(
      doc,
      visibleWorldRect(camera, SCREEN.width, SCREEN.height, SCREEN.margin),
      index,
    );
    const elapsed = performance.now() - t0;
    totalMs += elapsed;
    visibleTotal += visible.size;
    samples[shift] = elapsed;
  }
  return {
    cullShifts: CULL_SHIFTS,
    cullTotalMs: totalMs,
    cullAvgMs: totalMs / CULL_SHIFTS,
    cullMaxMs: Math.max(...samples),
    cullVisibleTotal: visibleTotal,
    cullVisibleAvg: visibleTotal / CULL_SHIFTS,
  };
}

function measureHitTest(doc, nodes, index) {
  const points = makeHitPoints(nodes);
  let hits = 0;
  const t0 = performance.now();
  for (let i = 0; i < points.length; i += 1) {
    if (nodeAtPoint(doc, points[i], { spatialIndex: index })) hits += 1;
  }
  const totalMs = performance.now() - t0;
  return {
    hitTestQueries: HIT_TEST_QUERIES,
    hitTestTotalMs: totalMs,
    hitTestAvgUs: (totalMs / HIT_TEST_QUERIES) * 1000,
    hitTestHits: hits,
  };
}

function createBenchEngine(initialDoc) {
  let doc = initialDoc;
  const engine = createEngineNodeOps({
    getDoc: () => doc,
    setDoc: (next) => {
      doc = next;
    },
    selection: {
      getIds: () => [],
      setIds: () => {},
      selectNodes: () => {},
      forgetNode: () => false,
    },
    requestRender: () => {},
    notify: () => {},
    getZoom: () => 1,
  });
  return { engine, getDoc: () => doc };
}

function movePatches(selected, basePositions, tick) {
  return selected.map((node) => {
    const base = basePositions.get(node.id);
    return {
      id: node.id,
      x: base.x + tick * UPDATE_STEP,
      y: base.y + tick * UPDATE_STEP,
    };
  });
}

function measureUpdates(doc, nodes) {
  const selected = nodes.slice(0, Math.min(UPDATE_NODE_COUNT, nodes.length));
  const basePositions = new Map(
    selected.map((node) => [node.id, { x: node.x, y: node.y }]),
  );

  const batch = createBenchEngine(doc);
  let t0 = performance.now();
  for (let tick = 1; tick <= UPDATE_TICKS; tick += 1) {
    batch.engine.updateNodes(movePatches(selected, basePositions, tick), {
      commit: false,
      preview: true,
    });
  }
  const batchTotalMs = performance.now() - t0;

  const sequential = createBenchEngine(doc);
  t0 = performance.now();
  for (let tick = 1; tick <= UPDATE_TICKS; tick += 1) {
    const patches = movePatches(selected, basePositions, tick);
    for (let i = 0; i < patches.length; i += 1) {
      const patch = patches[i];
      sequential.engine.updateNode(
        patch.id,
        { x: patch.x, y: patch.y },
        { commit: false, preview: true },
      );
    }
  }
  const sequentialTotalMs = performance.now() - t0;

  return {
    updateNodes: selected.length,
    updateTicks: UPDATE_TICKS,
    batchUpdateTotalMs: batchTotalMs,
    batchUpdateAvgMs: batchTotalMs / UPDATE_TICKS,
    sequentialUpdateTotalMs: sequentialTotalMs,
    sequentialUpdateAvgMs: sequentialTotalMs / UPDATE_TICKS,
    updateSpeedup:
      batchTotalMs > 0 ? sequentialTotalMs / batchTotalMs : null,
  };
}

function measureCamera() {
  const camera = { panX: 0, panY: 0, zoom: 1 };
  const frameBounds = { x: 500, y: 400, width: 1440, height: 900 };
  const t0 = performance.now();
  for (let i = 0; i < CAMERA_CYCLES; i += 1) {
    camera.zoom = 0.1 + (Math.sin(i * 0.05) + 1) * 10;
    camera.panX = Math.cos(i * 0.03) * 50000;
    camera.panY = Math.sin(i * 0.02) * 50000;
    const transformer = createCameraMatrixTransformer(camera, frameBounds);
    const world = transformer.screenToWorld(960, 540);
    const frame = transformer.worldToFrame(world.x, world.y);
    const backWorld = transformer.frameToWorld(frame.x, frame.y);
    transformer.worldToScreen(backWorld.x, backWorld.y);
  }
  const totalMs = performance.now() - t0;
  return {
    cameraCycles: CAMERA_CYCLES,
    cameraCyclesTotalMs: totalMs,
    cameraCycleAvgUs: (totalMs / CAMERA_CYCLES) * 1000,
  };
}

function heapUsedMB() {
  if (typeof globalThis.gc === "function") globalThis.gc();
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function makeCase(nodeCount, { imageHeavy = false } = {}) {
  const label = imageHeavy
    ? `${IMAGE_HEAVY_COUNT} images + ${nodeCount - IMAGE_HEAVY_COUNT} rects (${nodeCount} nodes)`
    : `${nodeCount.toLocaleString("en-US")} mixed nodes`;
  const id = imageHeavy ? `image-heavy-${nodeCount}` : `${nodeCount}`;

  const buildStart = performance.now();
  const { doc, nodes, width, height } = buildSyntheticDocument(nodeCount, {
    imageHeavy,
  });
  const documentBuildMs = performance.now() - buildStart;

  const heapBeforeMB = heapUsedMB();

  const indexStart = performance.now();
  const index = buildSpatialIndex(nodes);
  const spatialIndexBuildMs = performance.now() - indexStart;

  visibleNodeIds(
    doc,
    visibleWorldRect({ panX: 0, panY: 0, zoom: 1 }, SCREEN.width, SCREEN.height, SCREEN.margin),
    index,
  );
  const cull = measureCull(doc, index, width, height);

  const heapAfterMB = heapUsedMB();
  const memoryDeltaMB = Math.max(0, heapAfterMB - heapBeforeMB);

  const hitTest = measureHitTest(doc, nodes, index);
  const updates = measureUpdates(doc, nodes);
  const camera = measureCamera();

  return {
    id,
    label,
    nodeCount,
    composition: imageHeavy ? "image-heavy" : "mixed",
    imageCount: imageHeavy
      ? IMAGE_HEAVY_COUNT
      : nodes.filter((node) => node.kind === NODE_KIND.IMAGE).length,
    documentWidth: width,
    documentHeight: height,
    metrics: {
      documentBuildMs,
      spatialIndexBuildMs,
      indexSize: index.size,
      ...cull,
      ...hitTest,
      ...updates,
      ...camera,
      heapBeforeMB,
      heapAfterMB,
      memoryDeltaMB,
    },
  };
}

export function runCanvasBenchmarks() {
  const cases = NODE_COUNTS.map((count) => makeCase(count));
  cases.push(makeCase(5000, { imageHeavy: true }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown",
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
      forcedGC: typeof globalThis.gc === "function",
    },
    settings: {
      nodeCounts: NODE_COUNTS,
      imageHeavyCount: 5000,
      imageHeavyImages: IMAGE_HEAVY_COUNT,
      gridSpacing: GRID_SPACING,
      screen: SCREEN,
      cullShifts: CULL_SHIFTS,
      hitTestQueries: HIT_TEST_QUERIES,
      updateNodes: UPDATE_NODE_COUNT,
      updateTicks: UPDATE_TICKS,
      updateStep: UPDATE_STEP,
      cameraCycles: CAMERA_CYCLES,
    },
    cases,
  };
}

const METRIC_ROWS = [
  { key: "documentBuildMs", label: "Document build", unit: "ms", digits: 2 },
  { key: "spatialIndexBuildMs", label: "Spatial index build", unit: "ms", digits: 2 },
  { key: "cullAvgMs", label: "Viewport cull", unit: "ms/cull", digits: 3 },
  { key: "hitTestAvgUs", label: "Hit-test", unit: "µs/query", digits: 2 },
  { key: "batchUpdateTotalMs", label: "Batch updateNodes, 60 ticks", unit: "ms", digits: 2 },
  { key: "batchUpdateAvgMs", label: "Batch updateNodes", unit: "ms/tick", digits: 3 },
  { key: "sequentialUpdateTotalMs", label: "Sequential updateNode, 60 ticks", unit: "ms", digits: 2 },
  { key: "sequentialUpdateAvgMs", label: "Sequential updateNode", unit: "ms/tick", digits: 3 },
  { key: "cameraCyclesTotalMs", label: "Camera matrix, 1,500 cycles", unit: "ms", digits: 2 },
  { key: "memoryDeltaMB", label: "Heap delta after index + cull", unit: "MB", digits: 2 },
];

function format(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

export function renderConsoleSummary(result) {
  const header =
    "| Case | Nodes | Doc build (ms) | Index build (ms) | Cull avg (ms) | Hit avg (µs) | Batch tick (ms) | Seq tick (ms) | Camera 1,500 (ms) | Heap Δ (MB) |";
  const divider =
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";
  const rows = result.cases.map((entry) => {
    const m = entry.metrics;
    return `| ${entry.label} | ${entry.nodeCount.toLocaleString("en-US")} | ${format(m.documentBuildMs, 2)} | ${format(m.spatialIndexBuildMs, 2)} | ${format(m.cullAvgMs, 3)} | ${format(m.hitTestAvgUs, 2)} | ${format(m.batchUpdateAvgMs, 3)} | ${format(m.sequentialUpdateAvgMs, 3)} | ${format(m.cameraCyclesTotalMs, 2)} | ${format(m.memoryDeltaMB, 2)} |`;
  });
  return [header, divider, ...rows].join("\n");
}

export function renderMarkdownDocument(result) {
  const lines = [];
  lines.push("# Canvas Performance Benchmark");
  lines.push("");
  lines.push(
    `> Generated by \`tests/unit/canvas_perf_benchmark.test.js\` on ${result.generatedAt}.`,
  );
  lines.push(
    "> Re-run with `npx vitest run tests/unit/canvas_perf_benchmark.test.js` or `npm run bench:canvas`.",
  );
  lines.push("");
  lines.push("## Methodology");
  lines.push("");
  lines.push(
    `- Environment: Node ${result.environment.node}, ${result.environment.platform}/${result.environment.arch}, ${result.environment.cpu}.`,
  );
  lines.push(
    "- Runner: Vitest node environment; no browser, DOM, or CanvasKit surface is started for these numbers.",
  );
  lines.push(
    `- Synthetic documents: deterministic grid of ${result.settings.gridSpacing}px-spaced nodes built from the production node factories (rect, ellipse, path, image stub).`,
  );
  lines.push(
    `- Node counts: ${NODE_COUNTS.map((count) => count.toLocaleString("en-US")).join(" / ")} mixed nodes.`,
  );
  lines.push(
    `- Image-heavy case: ${result.settings.imageHeavyImages} image nodes + ${result.settings.imageHeavyCount - result.settings.imageHeavyImages} rect nodes (5,000 total).`,
  );
  lines.push(
    `1. Document build: timed construction of all nodes plus the document shell.`,
  );
  lines.push(
    `2. Spatial index build: \`buildSpatialIndex(nodes)\` from \`src/canvas/editor/viewport_culling.js\` (STR bulk load over node visual AABBs).`,
  );
  lines.push(
    `3. Viewport cull: index is built once, warmed once, then ${CULL_SHIFTS} consecutive diagonal pan shifts across the document at zoom 1.0, 1920×1080 screen, ${SCREEN.margin}px world margin; average is \`visibleNodeIds\` time per shift.`,
  );
  lines.push(
    `4. Hit-test: ${HIT_TEST_QUERIES} \`nodeAtPoint(doc, point, { spatialIndex })\` queries at node centres; average is reported in microseconds.`,
  );
  lines.push(
    `5. Updates: move ${UPDATE_NODE_COUNT} selected nodes for ${UPDATE_TICKS} ticks; one batch \`updateNodes({ preview: true })\` call per tick versus one sequential \`updateNode\` call per selected node per tick, through \`createEngineNodeOps\`.`,
  );
  lines.push(
    `6. Camera: ${CAMERA_CYCLES} \`createCameraMatrixTransformer\` screen→world→frame→world→screen cycles.`,
  );
  lines.push(
    "- Memory proxy: `process.memoryUsage().heapUsed` delta between the document build and the end of the warmup + cull pass (after index construction). Forced GC is used when Node exposes it; otherwise this is a noisy proxy, not peak heap.",
  );
  lines.push(
    "- Soft gates: index build < 500 ms, cull < 50 ms/cull, hit-test < 25,000 µs/query for BEFORE or < 1,000 µs/query for AFTER, camera 1,500 cycles < 500 ms for every case.",
  );
  lines.push(
    "- Browser FPS is not measured: Playwright/Puppeteer are not installed in this repository. A system Chrome binary exists, but the benchmark intentionally stays on pure engine modules so CI does not need a browser. This remains a documented gap for paint/FPS work.",
  );
  lines.push(
    "- These are single-run wall-clock numbers; treat them as before/after trend indicators, not precise microbenchmarks.",
  );
  lines.push("");
  lines.push("## BEFORE / AFTER");
  lines.push("");
  lines.push("| Case | Metric | BEFORE | AFTER |");
  lines.push("| --- | --- | ---: | ---: |");
  const before = result.before;
  const after = result.after;
  const beforeCases = new Map((before?.cases ?? []).map((entry) => [entry.id, entry]));
  const afterCases = new Map((after?.cases ?? []).map((entry) => [entry.id, entry]));
  const cases = new Map([...beforeCases, ...afterCases]);
  for (const [id, entry] of cases) {
    for (const row of METRIC_ROWS) {
      const beforeEntry = beforeCases.get(id);
      const afterEntry = afterCases.get(id);
      const beforeValue = beforeEntry ? format(beforeEntry.metrics[row.key], row.digits) : "_pending_";
      const afterValue = afterEntry ? format(afterEntry.metrics[row.key], row.digits) : "_pending_";
      lines.push(
        `| ${entry.label} | ${row.label} (${row.unit}) | ${beforeValue} | ${afterValue} |`,
      );
    }
  }
  lines.push("");
  for (const [phase, snapshot] of [["BEFORE", before], ["AFTER", after]]) {
    if (!snapshot) continue;
    lines.push(`## Raw ${phase} Metrics`);
    lines.push("");
    lines.push(renderConsoleSummary(snapshot));
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- JSON source of truth: `docs/canvas-perf-results.json`.",
  );
  lines.push(
    "- Missing phase measurements are shown as `_pending_`; cases are matched by ID.",
  );
  lines.push(
    "- Batch update speedups by case: " +
      result.cases
        .map(
          (entry) =>
            `${entry.label}: ${format(entry.metrics.updateSpeedup, 2)}×`,
        )
        .join("; ") +
      ".",
  );
  lines.push(
    `- Culled node counts per shift (average): ${result.cases
      .map(
        (entry) =>
          `${entry.label}: ${format(entry.metrics.cullVisibleAvg, 1)}`,
      )
      .join("; ")}.`,
  );
  lines.push("");
  return lines.join("\n");
}

function readBenchmarkArtifacts() {
  const jsonPath = path.join(REPO_ROOT, "docs", "canvas-perf-results.json");
  return fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, "utf8"))
    : null;
}

export function resolveBenchmarkPhase(phase, existing = readBenchmarkArtifacts()) {
  const selected = phase ?? process.env.CANVAS_PERF_PHASE ??
    (existing?.phase === "before" || existing?.before ? "after" : "before");
  if (selected !== "before" && selected !== "after") {
    throw new Error(`Invalid canvas benchmark phase: ${selected}`);
  }
  return selected;
}

export function writeBenchmarkArtifacts(result, { phase } = {}) {
  const existing = readBenchmarkArtifacts();
  phase = resolveBenchmarkPhase(phase, existing);
  const snapshot = { generatedAt: result.generatedAt, cases: result.cases };
  const artifact = {
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    environment: result.environment,
    settings: result.settings,
    before: phase === "before" ? snapshot : existing?.before ??
      (existing?.cases ? { generatedAt: existing.generatedAt, cases: existing.cases } : null),
    after: phase === "after" ? snapshot : existing?.after ?? null,
    cases: result.cases,
  };
  const docsDir = path.join(REPO_ROOT, "docs");
  const jsonPath = path.join(docsDir, "canvas-perf-results.json");
  const markdownPath = path.join(docsDir, "canvas-perf-benchmark.md");
  if (process.env.CANVAS_PERF_WRITE === "1") {
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    fs.writeFileSync(markdownPath, renderMarkdownDocument(artifact), "utf8");
  }
  result.phase = phase;
  return { jsonPath, markdownPath };
}

export function softGateFailures(result, phase = result.phase ?? resolveBenchmarkPhase()) {
  const hitTestLimitUs = phase === "after" ? 1000 : 25000;
  const failures = [];
  for (const entry of result.cases) {
    const m = entry.metrics;
    if (m.indexSize !== entry.nodeCount) {
      failures.push(`${entry.label}: index size ${m.indexSize} != ${entry.nodeCount}`);
    }
    if (!(m.spatialIndexBuildMs < 500)) {
      failures.push(
        `${entry.label}: index build ${format(m.spatialIndexBuildMs, 2)}ms >= 500ms`,
      );
    }
    if (!(m.cullAvgMs < 50)) {
      failures.push(
        `${entry.label}: cull ${format(m.cullAvgMs, 3)}ms >= 50ms`,
      );
    }
    if (!(m.hitTestAvgUs < hitTestLimitUs)) {
      failures.push(
        `${entry.label}: hit-test ${format(m.hitTestAvgUs, 2)}µs >= ${hitTestLimitUs}µs`,
      );
    }
    if (!(m.cameraCyclesTotalMs < 500)) {
      failures.push(
        `${entry.label}: camera ${format(m.cameraCyclesTotalMs, 2)}ms >= 500ms`,
      );
    }
    if (m.cullVisibleTotal <= 0) {
      failures.push(`${entry.label}: culling returned no visible nodes`);
    }
    if (m.hitTestHits <= 0) {
      failures.push(`${entry.label}: hit-test returned no hits`);
    }
  }
  return failures;
}
