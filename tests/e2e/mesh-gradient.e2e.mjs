import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const results = await page.evaluate(async () => (await import("/tests/e2e/mesh-gradient-harness.js")).meshPainterMatrix());
  const checks = [];
  for (const result of results) {
    assert.equal(result.fallback, result.expectedFallback, `${result.label}: backend routing`);
    assert.ok(result.expected.slice(0, 3).some(pixel => pixel.slice(0, 3).some(channel => channel < 240)),
      `${result.label}: browser SVG oracle must contain visible colour`);
    for (const backend of ["canvas", "skia", "png"].filter(name => result[name])) result[backend].forEach((pixel, probe) => pixel.forEach((channel, i) => {
      assert.ok(Math.abs(channel - result.expected[probe][i]) <= 3,
        `${result.label}/${backend}/${probe}/${i}: ${channel} != ${result.expected[probe][i]}`);
    }));
    checks.push(`${result.label} agrees across Canvas2D, ${result.skia ? "native Skia, " : ""}PNG and browser SVG`);
  }
  const textStrokes = await page.evaluate(async () =>
    (await import("/tests/e2e/mesh-gradient-harness.js")).meshTextStrokeMatrix());
  for (const result of textStrokes) {
    assert.equal(result.rawPaint, false, `${result.label}: SVG paint must reference a local definition`);
    for (const backend of ["canvas", "svg"]) {
      assert.ok(result[backend].coloured > 200, `${result.label}/${backend}: visible coloured glyph/outline pixels`);
      assert.ok(Math.abs(result[backend].alpha - result.expectedAlpha) <= 1,
        `${result.label}/${backend}: alpha ${result[backend].alpha} != ${result.expectedAlpha}`);
      if (result.transform) {
        assert.ok(result.transform[backend].probes > 200, `${result.label}/${backend}: transformed glyph interior`);
        assert.ok(result.transform[backend].meanError < 3,
          `${result.label}/${backend}: mesh must move with the text, error ${result.transform[backend].meanError}`);
      }
    }
    checks.push(`${result.label} retains visible colour and paint/node alpha in Canvas2D and SVG`);
  }
  const cache = await page.evaluate(async () => (await import("/tests/e2e/mesh-gradient-harness.js")).meshCacheContract());
  assert.deepEqual(cache.reused, { encoded: 1, allocated: 1, sameResource: true });
  assert.equal(cache.evicted, true);
  assert.equal(cache.bounded, true);
  checks.push("camera and opacity changes reuse one bounded tile/PNG and the resource cache evicts old paints");

  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 400, height: 300, isCanvasRoot: false, backgroundColor: "#ffffff",
      nodes: [{ ...createRectNode({ x: 70, y: 60, width: 160, height: 120, fill: "#ffffff" }), id: "agent-mesh" }] });
    e.selectExactly(["agent-mesh"]);
    window.__meshBefore = JSON.stringify(e.serialise());
    window.__meshBeforeIndex = e.getCurrentHistoryIndex();
  });
  await tool("mutate_layer_style", { layerId: "agent-mesh", patch: { gradient: { type: "mesh" } } });
  assert.notEqual(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 130, y: 100 })), "#ffffff");
  assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()),
    await page.evaluate(() => window.__meshBeforeIndex + 1));
  const after = await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise()));
  await tool("undo"); assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise())),
    await page.evaluate(() => window.__meshBefore));
  await tool("redo"); assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise())), after);
  checks.push("MCP mesh writes become visible and exactly one undo/redo restores the complete document");

  const reopened = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { buildProjectVooFile, openVooProject } = await import("/src/canvas/store/project_io.js");
    const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const store = useDesignStore.getState(), id = store.editingNodeId;
    const engines = new Map(Object.entries(window.__vooEditors).map(([key, engine]) => [key, { engine, ready: true }]));
    const { vooFile } = await buildProjectVooFile({ store, enginesRef: { current: engines } });
    window.__meshStoredFill = window.__vooEditor.getNode("agent-mesh").fill;
    window.__meshOldEngine = window.__vooEditor;
    const result = await openVooProject({ store: useDesignStore.getState(),
      fileOrPath: new File([encodeVooBinary(vooFile)], "MeshGradient.voo") });
    return { success: result.success, id };
  });
  assert.equal(reopened.success, true);
  await page.waitForFunction(id => window.__vooEditors?.[id] && window.__vooEditors[id] !== window.__meshOldEngine, reopened.id);
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("agent-mesh").fill),
    await page.evaluate(() => window.__meshStoredFill));
  assert.notEqual(await page.evaluate(() => window.__vooEditor.sampleColorAt({ x: 130, y: 100 })), "#ffffff");
  checks.push("actual .voo save/open retains the mesh paint and visible pixels");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
