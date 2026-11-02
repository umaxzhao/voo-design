import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const source = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 100;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#0000ff"; ctx.fillRect(0, 0, 200, 100);
    editor.setDoc({ ...editor.getDocument(), width: 200, height: 100, isCanvasRoot: true, backgroundColor: "transparent", nodes: [
      { ...createGroupNode({ x: 0, y: 0, width: 200, height: 100 }), id: "source-frame", isFrame: true, frame: true, clipContent: true, fill: "#ffffff" },
    ] });
    const image = await editor.insertImage(canvas.toDataURL(), { x: 100, y: 50 });
    editor.updateNode(image.id, { parentId: "source-frame", x: 0, y: 0, width: 200, height: 100 });
    const marker = { ...createRectNode({ x: 150, y: 70, width: 20, height: 10, fill: "#ff0000" }), id: "source-marker", parentId: "source-frame", strokeWidth: 0 };
    editor.setDoc({ ...editor.getDocument(), nodes: [...editor.getDocument().nodes, marker] });
    editor.selectExactly([]);
    const state = useDesignStore.getState();
    const value = { pageId: state.editingNodeId, imageId: image.imageId, targetId: image.id, before: JSON.stringify(editor.serialise()) };
    window.__generatedSource = value;
    return value;
  });

  const enginePixel = (id, point) => page.evaluate(async ({ id, point }) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__vooEditors[id].sampleColorAt(point);
  }, { id, point });
  const visiblePixel = async (id, point) => {
    await page.evaluate(async ({ id, point }) => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      useDesignStore.getState().openExistingEditorPage(id);
      const stage = document.querySelector('[data-testid="editor-pages"]');
      const layout = useDesignStore.getState().editorArtboardLayouts[id] ?? { x: 0, y: 0 };
      useDesignStore.setState({ pendingArtboardFitId: null, editorCamera: { zoom: 1,
        panX: stage.clientWidth / 2 - layout.x - point.x, panY: stage.clientHeight / 2 - layout.y - point.y } });
    }, { id, point });
    await page.waitForFunction(id => window.__vooEditors?.[id]?.getDocument()?.nodes.some(node => node.kind === "image"), id);
    const artwork = page.locator(`[data-editor-artboard][data-node-id="${id}"]`).getByTestId("editor-artwork-fallback");
    await artwork.waitFor({ state: "visible" });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const client = await page.evaluate(({ id, point }) => {
      const rect = document.querySelector(`[data-editor-artboard][data-node-id="${id}"]`).getBoundingClientRect();
      const doc = window.__vooEditors[id].getDocument();
      return { x: rect.left + point.x * rect.width / doc.width, y: rect.top + point.y * rect.height / doc.height };
    }, { id, point });
    const png = await page.screenshot({ clip: { x: Math.floor(client.x), y: Math.floor(client.y), width: 1, height: 1 } });
    return page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, png.toString("base64"));
  };

  const replacement = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { createEditorGeneratedOutput } = await import("/src/canvas/editor/editor_generated_output.js");
    const source = window.__generatedSource;
    const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 100;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, 200, 100);
    const editor = window.__vooEditors[source.pageId];
    const result = createEditorGeneratedOutput({ dataUrl: canvas.toDataURL(), operation: "upscale", parameters: { scale: 2 },
      sourceWorkflowNodeId: source.pageId, sourceSceneNodeId: source.targetId, sourceSnapshot: editor.serialise() });
    const output = await useDesignStore.getState().materializeEditorGeneratedOutput({ result });
    if (!useDesignStore.getState().openExistingEditorPage(output.candidateNodeId)) throw new Error("Candidate page could not join the session");
    return output;
  });
  await page.waitForFunction(id => Boolean(window.__vooEditors?.[id]), replacement.candidateNodeId);
  assert.equal(await enginePixel(source.pageId, { x: 40, y: 30 }), "#0000ff");
  await page.waitForFunction(({ id }) => window.__vooEditors[id]?.sampleColorAt({ x: 40, y: 30 }) === "#00ff00", { id: replacement.candidateNodeId });
  assert.equal(await enginePixel(replacement.candidateNodeId, { x: 40, y: 30 }), "#00ff00");
  assert.equal(await enginePixel(replacement.candidateNodeId, { x: 155, y: 75 }), "#ff0000");
  assert.equal(await page.evaluate(id => JSON.stringify(window.__vooEditors[id].serialise()), source.pageId), source.before);
  assert.deepEqual(await visiblePixel(source.pageId, { x: 40, y: 30 }), [0, 0, 255, 255]);
  assert.deepEqual(await visiblePixel(replacement.candidateNodeId, { x: 40, y: 30 }), [0, 255, 0, 255]);
  assert.equal(await page.locator(`[data-editor-artboard][data-node-id="${source.pageId}"]`).isVisible(), true);
  assert.equal(await page.locator(`[data-editor-artboard][data-node-id="${replacement.candidateNodeId}"]`).isVisible(), true);
  checks.push("the real store publishes an independent green candidate while the source stays blue, including actual visible canvas pixels");

  const reopen = await page.evaluate(async replacement => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { buildProjectVooFile, openVooProject } = await import("/src/canvas/store/project_io.js");
    const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const { getImageBlob, deleteImage } = await import("/src/canvas/store/db.js");
    const engines = new Map(Object.entries(window.__vooEditors).map(([id, engine]) => [id, { engine, ready: true }]));
    const { vooFile } = await buildProjectVooFile({ store: useDesignStore.getState(), enginesRef: { current: engines } });
    const assetWasPersisted = Boolean(await getImageBlob(replacement.imageId));
    const packedAsset = typeof vooFile.assets[replacement.imageId] === "string";
    window.__candidateBeforeReopen = window.__vooEditors[replacement.candidateNodeId];
    const bytes = encodeVooBinary(vooFile);
    await deleteImage(replacement.imageId);
    const removed = !await getImageBlob(replacement.imageId);
    const result = await openVooProject({ store: useDesignStore.getState(), fileOrPath: new File([bytes], "Generated.voo") });
    return { assetWasPersisted, packedAsset, removed, reopened: result.success, rehydrated: Boolean(await getImageBlob(replacement.imageId)) };
  }, replacement);
  assert.deepEqual(reopen, { assetWasPersisted: true, packedAsset: true, removed: true, reopened: true, rehydrated: true });
  await page.waitForFunction(id => window.__vooEditors?.[id] && window.__vooEditors[id] !== window.__candidateBeforeReopen, replacement.candidateNodeId);
  await page.waitForFunction(id => window.__vooEditors[id]?.sampleColorAt({ x: 40, y: 30 }) === "#00ff00", replacement.candidateNodeId);
  assert.deepEqual(await visiblePixel(replacement.candidateNodeId, { x: 40, y: 30 }), [0, 255, 0, 255]);
  assert.equal(await page.evaluate(({ id, target }) => window.__vooEditors[id].getNode(target).generatedOutput.operation,
    { id: replacement.candidateNodeId, target: source.targetId }), "upscale");
  checks.push("the real project package embeds generated bytes and reopens with a fresh engine after deleting its cached asset");

  await page.evaluate(async id => (await import("/src/store/design_store.js")).useDesignStore.getState().openExistingEditorPage(id), source.pageId);
  await page.waitForFunction(id => window.__vooEditors?.[id]?.sampleColorAt({ x: 40, y: 30 }) === "#0000ff", source.pageId);
  // Reopening normalizes legacy null parent/clip fields; compare the source
  // against its actual generation-start snapshot after that round trip.
  const beforeOutpaint = await page.evaluate(id => JSON.stringify(window.__vooEditors[id].serialise()), source.pageId);
  const outpaint = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { createEditorGeneratedOutput, createOutpaintScenePatch } = await import("/src/canvas/editor/editor_generated_output.js");
    const source = window.__generatedSource;
    const editor = window.__vooEditors[source.pageId];
    const snapshot = editor.serialise();
    const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 130;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#00ff00"; ctx.fillRect(0, 0, 240, 130);
    ctx.fillStyle = "#0000ff"; ctx.fillRect(20, 10, 200, 100);
    const result = createEditorGeneratedOutput({ dataUrl: canvas.toDataURL(), operation: "outpaint",
      sourceWorkflowNodeId: source.pageId, sourceSceneNodeId: source.targetId, sourceSnapshot: snapshot,
      scenePatch: createOutpaintScenePatch(snapshot, { x: -20, y: -10, width: 240, height: 130 }) });
    const output = await useDesignStore.getState().materializeEditorGeneratedOutput({ result });
    useDesignStore.getState().openExistingEditorPage(output.candidateNodeId);
    return output;
  });
  await page.waitForFunction(id => window.__vooEditors?.[id]?.sampleColorAt({ x: 10, y: 5 }) === "#00ff00", outpaint.candidateNodeId);
  const growth = await page.evaluate(({ id, target }) => {
    const editor = window.__vooEditors[id], doc = editor.getDocument();
    return { width: doc.width, height: doc.height, target: editor.getNode(target), frame: editor.getNode("source-frame"), marker: editor.getNode("source-marker") };
  }, { id: outpaint.candidateNodeId, target: source.targetId });
  assert.deepEqual([growth.width, growth.height], [240, 130]);
  assert.deepEqual([growth.target.x, growth.target.y, growth.target.width, growth.target.height], [0, 0, 240, 130]);
  assert.deepEqual([growth.frame.x, growth.frame.y, growth.frame.width, growth.frame.height, growth.frame.clipContent], [0, 0, 240, 130, true]);
  assert.deepEqual([growth.marker.x, growth.marker.y], [170, 80]);
  assert.equal(await enginePixel(outpaint.candidateNodeId, { x: 70, y: 50 }), "#0000ff");
  assert.deepEqual(await visiblePixel(outpaint.candidateNodeId, { x: 10, y: 5 }), [0, 255, 0, 255]);
  assert.equal(await enginePixel(source.pageId, { x: 10, y: 5 }), "#0000ff");
  assert.equal(await page.evaluate(id => JSON.stringify(window.__vooEditors[id].serialise()), source.pageId), beforeOutpaint);
  checks.push("outpaint persists its grown image, shifts other layers and expands the copied Frame clip so new border pixels are actually visible");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
