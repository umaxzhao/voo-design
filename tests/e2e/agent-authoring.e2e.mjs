import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const directions = await page.evaluate(async () => {
    const { DESIGN_SYSTEM_PRESETS } = await import("/src/canvas/agent/design_system/from_style_kit.js");
    return Object.values(DESIGN_SYSTEM_PRESETS).slice(0, 2).map((designSystem, index) => ({ id: String(index), name: designSystem.name, mood: "calm", layoutIdea: "grid", designSystem }));
  });
  let output;
  const chunk = text => output.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
    if (request.method === "OPTIONS") { response.end(); return; }
    let body = "";
    for await (const part of request) body += part;
    const messages = JSON.parse(body).messages;
    response.setHeader("Content-Type", "text/event-stream");
    response.flushHeaders();
    const prompt = messages[0].content;
    if (prompt.includes("Art direct a finished page")) {
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(directions) } }] })}\n\ndata: [DONE]\n\n`);
    } else if (prompt.includes("Critique this finished canvas")) {
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"score":5,"issues":[]}' } }] })}\n\ndata: [DONE]\n\n`);
    } else output = response;
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const seed = async () => {
    await page.evaluate(() => {
      const editor = window.__vooEditor;
      editor.setDoc({ ...editor.getDocument(), width: 600, height: 400, nodes: [] });
      editor.selectExactly([]); editor.setViewport({ zoom: 1, panX: 0, panY: 0 });
    });
  };
  const start = async () => {
    output = null;
    await seed();
    await page.evaluate(async url => {
      const harness = await import("/tests/e2e/agent-authoring-harness.js");
      window.__authoringHarness = harness;
      harness.startAuthoringHarness(url);
    }, baseUrl);
    // Poll a synchronous page predicate; never hide unfinished async work in waitForFunction.
    for (let attempt = 0; !output && attempt < 100; attempt++) await page.waitForTimeout(20);
    assert.ok(output, "HTML SSE request must start");
  };
  const first = '<html><body style="margin:0;width:600px;height:400px;background:white"><div data-voo-id="first" style="position:absolute;left:20px;top:20px;width:120px;height:80px;background:#ff0000"></div>';
  const last = '<div data-voo-id="last" style="position:absolute;left:400px;top:220px;width:120px;height:80px;background:#0000ff"></div></body></html>';
  try {
    await start();
    chunk(first);
    await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(node => node.fill?.toLowerCase() === "#ff0000"));
    assert.equal(await page.evaluate(() => window.__authoring.done), false, "real layers must arrive before the response completes");
    const firstId = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(node => node.fill?.toLowerCase() === "#ff0000").id);
    assert.deepEqual((await page.evaluate(() => window.__authoringHarness.authoringPixels())).first, [255, 0, 0]);
    assert.ok(await page.evaluate(() => window.__authoringHarness.cursorPixels()) > 20, "the authoring cursor must paint VOO purple pixels");
    await page.screenshot({ path: editorArtifactPath("voo-authoring-in-progress.png") });
    chunk(last); output.end("data: [DONE]\n\n");
    await page.waitForFunction(() => window.__authoring.done);
    assert.equal(await page.evaluate(() => window.__authoring.error), null);
    assert.deepEqual(await page.evaluate(() => window.__authoringHarness.authoringPixels()), { first: [255, 0, 0], last: [0, 0, 255] });
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(node => node.fill?.toLowerCase() === "#ff0000").id), firstId);
    const finished = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
    const frames = await page.evaluate(() => window.__authoring.frames);
    assert.ok(frames.some(frame => frame.cursor), "cursor must be sampled on a real animation frame");
    assert.ok(frames.some(frame => frame.ids.length < finished && frame.ids.length > 0), "intermediate native placements must be visible across frames");
    const { getAgentCursor } = await page.evaluate(async () => {
      const module = await import("/src/canvas/editor/chrome-agent-feedback.js");
      return { getAgentCursor: Boolean(module.getAgentCursor()) };
    });
    assert.equal(getAgentCursor, false, "finish must remove the virtual cursor");
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);
    await tool("redo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), finished);

    // A real transport abort retains arrived work, with no queued late insertions.
    await start(); chunk(first);
    await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(node => node.fill?.toLowerCase() === "#ff0000"));
    await page.evaluate(() => window.__authoring.controller.abort());
    chunk(last); output.end("data: [DONE]\n\n");
    await page.waitForFunction(() => window.__authoring.done);
    assert.equal(await page.evaluate(() => window.__authoring.error?.name), "AbortError");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.some(node => node.fill?.toLowerCase() === "#0000ff")), false);
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);

    // The external MCP/App entry inserts the same native layers before final.
    await seed();
    await tool("stream_layout", { html: first });
    const externalId = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(node => node.fill?.toLowerCase() === "#ff0000")?.id);
    assert.ok(externalId);
    await tool("stream_layout", { html: first + last, final: true });
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(node => node.fill?.toLowerCase() === "#ff0000")?.id), externalId);
    assert.deepEqual(await page.evaluate(() => window.__authoringHarness.authoringPixels()), { first: [255, 0, 0], last: [0, 0, 255] });
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);

    // Clearing an in-flight external draft removes only its own layers.
    await tool("create_shape", { kind: "rect", x: 10, y: 10, width: 30, height: 30, fill: "#00ff00" });
    const preserved = await page.evaluate(() => window.__vooEditor.getDocument().nodes[0].id);
    await tool("stream_layout", { html: first });
    await tool("stream_layout", { clear: true });
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id)), [preserved]);
    await seed();

    // Switching pages inside one project must not retarget an active writer.
    await tool("stream_layout", { html: first });
    const originalPage = await page.evaluate(async () => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const state = useDesignStore.getState();
      const id = state.editingNodeId;
      state.addEditorPage({ label: "Other canvas", width: 600, height: 400 });
      return id;
    });
    await page.waitForFunction(previous => window.__vooEditor.getDocument().canvasId !== previous, originalPage);
    const otherCanvas = await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument()));
    await assert.rejects(tool("stream_layout", { final: true }), /Stream canvas changed/);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument())), otherCanvas);
    await page.evaluate(async id => (await import("/src/store/design_store.js")).useDesignStore.getState().focusEditorPage(id), originalPage);
    await page.waitForFunction(previous => window.__vooEditor.getDocument().canvasId === previous, originalPage);
    await assert.rejects(tool("stream_layout", { final: true }), /clear before restarting/);
    await tool("stream_layout", { clear: true });
    assert.ok(await page.evaluate(() => window.__vooEditor.getDocument().nodes.some(node => node.fill?.toLowerCase() === "#ff0000")));
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);

    // An external stream remains bound to its original document even when a
    // stale writer sends a final event after the user switches projects.
    await tool("stream_layout", { html: first });
    const previousCanvas = await page.evaluate(() => window.__vooEditor.getDocument().canvasId);
    await tool("new_document", { width: 600, height: 400, name: "StreamNext", force: true });
    await page.waitForFunction(previous => window.__vooEditor?.getDocument().canvasId !== previous, previousCanvas);
    const baseline = await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id));
    await assert.rejects(tool("stream_layout", { final: true }), /Stream document changed/);
    await tool("stream_layout", { clear: true });
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id)), baseline);
    await seed();

    // Reduced motion and a large tool tree use the actual shared bulk entry.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const nodes = Array.from({ length: 100 }, (_, index) => ({ type: "rect", name: `Tile ${index}`, x: (index % 10) * 40, y: Math.floor(index / 10) * 30, width: 32, height: 22, fill: "#00ff00" }));
    const begin = Date.now();
    assert.equal((await tool("build_layout", { nodes })).count, 100);
    const elapsed = Date.now() - begin;
    assert.ok(elapsed < 5000, `reduced-motion batch must not replay 100 delayed animations: ${elapsed}ms`);
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const animatedBegin = Date.now();
    assert.equal((await tool("build_layout", { nodes })).count, 100);
    const animatedElapsed = Date.now() - animatedBegin;
    assert.ok(animatedElapsed < 5000, `large batches need a bounded animation budget: ${animatedElapsed}ms`);
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);
    // Cancelling a bulk tool while it is visibly placing layers rolls back the
    // tree, restores the helper hooks and keeps the pre-existing redo branch.
    const redoBefore = await page.evaluate(() => window.__vooEditor.canRedo());
    await page.evaluate(async nodes => {
      const { executeCanvasTool } = await import("/src/canvas/agent/canvas_tools.js");
      const controller = new AbortController();
      const editor = window.__vooEditor;
      window.__bulk = { controller, done: false, before: JSON.stringify(editor.getDocument()), commit: editor.commit };
      void executeCanvasTool("build_layout", { nodes }, { signal: controller.signal })
        .then(() => { window.__bulk.success = true; }, error => { window.__bulk.error = error.name; })
        .finally(() => { window.__bulk.done = true; });
    }, nodes);
    await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length > 0 && !window.__bulk.done);
    await page.evaluate(() => window.__bulk.controller.abort());
    await page.waitForFunction(() => window.__bulk.done);
    assert.equal(await page.evaluate(() => window.__bulk.error), "AbortError");
    assert.ok(await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument()) === window.__bulk.before));
    assert.ok(await page.evaluate(() => window.__vooEditor.commit === window.__bulk.commit));
    assert.equal(await page.evaluate(() => window.__vooEditor.canRedo()), redoBefore);
    console.log(JSON.stringify({ animatedBatchMs: animatedElapsed, streaming: "real SSE before final", pixels: "native red/blue + purple cursor", stableIds: true, singleUndoRedo: true, abort: true, externalMcp: true, reducedMotionBatchMs: elapsed }));
  } finally {
    output?.destroy(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
