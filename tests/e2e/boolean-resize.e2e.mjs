import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const seed = async (children = false) => {
    await page.evaluate(async children => {
      const { createRectNode, createBooleanNode } = await import("/src/canvas/editor/scene_model.js");
      const { useDesignStore } = await import("/src/store/design_store.js");
      const e = window.__vooEditor;
      const a = { ...createRectNode({ x: 100, y: 100, width: 100, height: 80, fill: "#ff0000" }), id: "a" };
      const b = { ...createRectNode({ x: 150, y: 100, width: 100, height: 80, fill: "#ff0000" }), id: "b" };
      const combined = { ...createBooleanNode([a, b], "union"), id: "boolean", name: "Resize Boolean", lockRatio: false };
      e.setDoc({ ...e.getDocument(), isCanvasRoot: false, width: 600, height: 400,
        crop: null, backgroundColor: "#ffffff", nodes: children
          ? [combined, { ...a, parentId: combined.id }, { ...b, parentId: combined.id }] : [combined] });
      e.selectExactly([combined.id]); e.setTool("select"); e.setSnappingEnabled(false);
      useDesignStore.setState({ pendingArtboardFitId: null, editorCamera: { zoom: 1, panX: 260, panY: 130 } });
    }, children);
    await settled();
  };
  const sample = (points) => page.evaluate(async points => {
    const e = window.__vooEditor;
    const image = new Image(); image.src = await e.exportFullResPng(); await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  }, points);
  const red = [255, 0, 0, 255], white = [255, 255, 255, 255];
  const snapshot = () => page.evaluate(() => JSON.stringify(window.__vooEditor.serialise().nodes));
  for (const children of [false, true]) {
    await seed(children);
    const before = await snapshot();
    const width = page.getByTestId("editor-properties-panel").getByRole("spinbutton", { name: "W", exact: true });
    await width.fill("300"); await width.press("Enter"); await settled();
    assert.equal(await page.evaluate(() => window.__vooEditor.getNode("boolean").width), 300, `panel ${children}`);
    assert.deepEqual(await sample([[350, 140], [410, 140]]), [red, white], `panel geometry ${children}`);
    const after = await snapshot();
    await tool("undo"); assert.equal(await snapshot(), before);
    await tool("redo"); assert.equal(await snapshot(), after);
    assert.deepEqual(await sample([[350, 140], [410, 140]]), [red, white]);
    checks.push(`${children ? "child-backed" : "sources-only"} W field scales real pixels with one undo`);
  }
  for (const children of [false, true]) {
    await seed(children);
    const before = await snapshot();
    const point = await page.evaluate(() => {
      const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
      return { x: board.left + 250 * board.width / 600, y: board.top + 180 * board.height / 400 };
    });
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    await page.mouse.move(point.x + 150, point.y, { steps: 6 }); await page.mouse.up();
    await settled(); await page.evaluate(() => window.__vooEditor.flushTransforms());
    assert.equal(await page.evaluate(() => Math.round(window.__vooEditor.getNode("boolean").width)), 300, `pointer ${children}`);
    assert.deepEqual(await sample([[350, 140], [410, 140]]), [red, white], `pointer geometry ${children}`);
    await tool("undo"); assert.equal(await snapshot(), before);
    checks.push(`${children ? "child-backed" : "sources-only"} real corner handle scales pixels with one undo`);
  }
  for (const children of [false, true]) {
    await seed(children);
    const before = await snapshot();
    const beforeIndex = await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
    const response = await tool("mutate_layer_layout", { layerId: "boolean", patch: { x: 120, y: 110, width: 300, height: 160 } });
    assert.ok(response);
    assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), beforeIndex + 1);
    assert.deepEqual(await sample([[370, 200], [430, 200], [110, 140]]), [red, white, white]);
    const after = await snapshot();
    await tool("undo"); assert.equal(await snapshot(), before);
    await tool("redo"); assert.equal(await snapshot(), after);
    checks.push(`${children ? "child-backed" : "sources-only"} MCP layout mutation synchronously moves and resizes with one undo`);
  }

  for (const frame of [false, true]) {
    await page.evaluate(async frame => {
      const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      const parent = { ...createRectNode({ x: 100, y: 100, width: 200, height: 100 }),
        id: "container", kind: "group", isFrame: frame, rotation: 0 };
      const nested = { ...createRectNode({ x: 110, y: 120, width: 40, height: 40 }),
        id: "nested", kind: "group", parentId: parent.id };
      const child = { ...createRectNode({ x: 115, y: 125, width: 10, height: 10, fill: "#ff0000" }),
        id: "nested-child", parentId: nested.id };
      const pinned = { ...createRectNode({ x: 260, y: 160, width: 20, height: 20, fill: "#ff0000" }),
        id: "pinned", parentId: parent.id, constraints: { horizontal: "right", vertical: "bottom" } };
      e.setDoc({ ...e.getDocument(), nodes: [parent, nested, child, pinned] });
      e.selectExactly([parent.id]);
    }, frame);
    const before = await snapshot();
    const initialIndex = await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
    await tool("mutate_layer_layout", { layerId: "container", patch: { x: 120, y: 110, width: 300, height: 160 } });
    assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), initialIndex + 1);
    assert.deepEqual(await page.evaluate(() => ["nested-child", "pinned"].map(id => {
      const node = window.__vooEditor.getNode(id); return [node.x, node.y];
    })), [[135, 135], frame ? [380, 230] : [280, 170]]);
    assert.deepEqual(await sample([[139, 139], frame ? [389, 239] : [289, 179]]), [red, red]);
    await tool("undo"); assert.equal(await snapshot(), before);
    if (!frame) {
      for (const unchanged of [{ width: 200 }, { rotation: 0 }]) {
        await tool("mutate_layer_layout", { layerId: "container", patch: { x: 120, y: 110, ...unchanged } });
        assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), initialIndex + 1);
        assert.deepEqual(await sample([[139, 139]]), [red]);
        await tool("undo"); assert.equal(await snapshot(), before);
      }
    }
    checks.push(`${frame ? "Frame pins" : "Group descendants and unchanged extra fields"} keep MCP geometry changes in one undo`);
  }

  for (const kind of ["boolean", "frame", "group"]) {
    for (const scope of ["root", "follower"]) {
      await seed(true);
      const layerId = await page.evaluate(({ kind, scope }) => {
        const e = window.__vooEditor;
        const nodes = e.getDocument().nodes.map((node) => ({ ...node }));
        const root = nodes[0];
        if (kind !== "boolean") {
          root.kind = "group";
          root.isFrame = kind === "frame";
          delete root.sources;
        }
        if (scope === "follower") nodes[1].locked = true;
        else if (kind === "frame") root.lockPosition = true;
        else root.locked = true;
        e.setDoc({ ...e.getDocument(), nodes });
        return root.id;
      }, { kind, scope });
      const before = await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise()));
      const index = await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
      const response = await tool("mutate_layer_layout", { layerId, patch: { x: 120, y: 110, width: 300, height: 160 } });
      assert.deepEqual(response, { ok: false, layerId, reason: "locked", updated: {} });
      assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise())), before);
      assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), index);
    }
    checks.push(`${kind} root/follower locks reject the entire MCP patch without document or history changes`);
  }

  for (const frame of [false, true]) {
    await seed(true);
    await page.evaluate(frame => {
      const e = window.__vooEditor;
      const doc = e.getDocument();
      const root = frame ? { ...doc.nodes[0], kind: "group", isFrame: true } : doc.nodes[0];
      const clip = { ...doc.nodes[1], id: "external-clip", parentId: null, clipTo: root.id, x: 110, y: 120 };
      const chain = { ...clip, id: "external-clip-chain", clipTo: clip.id, x: 115, y: 125 };
      e.setDoc({ ...doc, nodes: [root, ...doc.nodes.slice(1), clip, chain] });
    }, frame);
    const before = await snapshot();
    const index = await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
    await tool("mutate_layer_layout", { layerId: "boolean", patch: { x: 120, y: 110, width: 300, height: 160 } });
    assert.deepEqual(await page.evaluate(() => ["external-clip", "external-clip-chain"].map(id => {
      const node = window.__vooEditor.getNode(id); return [node.x, node.y];
    })), [[130, 130], [135, 135]]);
    assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), index + 1);
    await tool("undo"); assert.equal(await snapshot(), before);
    checks.push(`${frame ? "Frame" : "Boolean"} external chained clip followers move and undo together through MCP`);
  }

  await seed(true);
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("boolean", { constraints: { horizontal: "scale", vertical: "scale" } });
    window.__booleanConstraintBefore = JSON.stringify(e.serialise().nodes);
    e.setDocumentSize(1200, 800);
  });
  assert.deepEqual(await sample([[450, 250], [510, 250]]), [red, white]);
  assert.deepEqual(await page.evaluate(() => {
    const n = window.__vooEditor.getNode("boolean"), a = window.__vooEditor.getNode("a");
    return [n.x, n.y, n.width, n.height, a.x, a.y, a.width, a.height];
  }), [200, 200, 300, 160, 200, 200, 200, 160]);
  await tool("undo");
  assert.equal(await snapshot(), await page.evaluate(() => window.__booleanConstraintBefore));
  checks.push("page constraints resize the composite and children once and undo together");

  await seed(true);
  await page.evaluate(() => window.__vooEditor.updateNodes([
    { id: "boolean", x: 120, y: 110, width: 300, height: 160 },
    { id: "a", x: 120, y: 110, width: 200, height: 160 },
    { id: "b", x: 220, y: 110, width: 200, height: 160 },
  ]));
  assert.deepEqual(await sample([[410, 200], [430, 200]]), [red, white]);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getNode("boolean").sources.map(source => [source.x, source.w])), [[0, 200], [100, 200]]);
  await tool("undo");
  checks.push("batch parent and child boxes remain authoritative without applying the same scale twice");

  await seed(true);
  await page.evaluate(async () => {
    const { createRectNode, createBooleanNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    e.updateNode("boolean", { operation: "subtract" });
    const doc = e.getDocument(), inner = e.getNode("boolean");
    const c = { ...createRectNode({ x: 300, y: 100, width: 20, height: 80, fill: "#ff0000" }), id: "c" };
    const root = { ...createBooleanNode([inner, c], "union"), id: "boolean-root" };
    e.setDoc({ ...doc, nodes: [root, { ...inner, parentId: root.id }, ...doc.nodes.slice(1), { ...c, parentId: root.id }] });
    window.__booleanNestedBefore = JSON.stringify(e.serialise().nodes);
    e.updateNode(root.id, { width: 440, height: 160 });
  });
  assert.deepEqual(await sample([[150, 140], [250, 140], [520, 140]]), [red, white, red]);
  await tool("undo"); assert.equal(await snapshot(), await page.evaluate(() => window.__booleanNestedBefore));
  checks.push("nested child-backed subtraction keeps its cutout and sibling pixels through parent resize and one undo");

  await seed(true);
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("a", { rotation: 45 });
    e.updateDocument({ width: 8000 });
    window.__booleanExtremeBefore = JSON.stringify(e.serialise().nodes);
    e.updateNode("boolean", { width: 7500, height: 40 });
  });
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("a").kind), "path");
  assert.deepEqual(await sample([[2600, 120], [2600, 80]]), [red, white]);
  await tool("undo");
  assert.equal(await snapshot(), await page.evaluate(() => window.__booleanExtremeBefore));
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("a").kind), "rect");
  checks.push("extreme affine resize preserves analytic interior/exterior pixels and one undo restores the operand's original kind");

  await seed(true);
  await page.evaluate(() => window.__vooEditor.updateNode("boolean", {
    width: 300, height: 160, rotation: 30, shear: 12, flipH: true,
  }));
  const transformedPoint = await page.evaluate(async () => {
    const { fromNodeLocal } = await import("/src/canvas/editor/scene_geometry_transform.js");
    const node = window.__vooEditor.getNode("boolean");
    return fromNodeLocal(node, { x: 50, y: 40 });
  });
  assert.deepEqual(await sample([[Math.floor(transformedPoint.x), Math.floor(transformedPoint.y)]]), [red]);
  const geometrySnapshot = () => page.evaluate(() => ["boolean", "a", "b"].map(id => {
    const n = window.__vooEditor.getNode(id);
    return { id, x: n.x, y: n.y, width: n.width, height: n.height, rotation: n.rotation,
      shear: n.shear, flipH: n.flipH, sources: n.sources,
      ...(id === "boolean" ? {} : { parentId: n.parentId }) };
  }));
  const beforeReopen = await geometrySnapshot();
  const reopened = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { buildProjectVooFile, openVooProject } = await import("/src/canvas/store/project_io.js");
    const { encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const store = useDesignStore.getState(), id = store.editingNodeId;
    const engines = new Map(Object.entries(window.__vooEditors).map(([key, engine]) => [key, { engine, ready: true }]));
    const { vooFile } = await buildProjectVooFile({ store, enginesRef: { current: engines } });
    window.__booleanOldEngine = window.__vooEditor;
    const result = await openVooProject({ store: useDesignStore.getState(), fileOrPath: new File([encodeVooBinary(vooFile)], "BooleanResize.voo") });
    return { success: result.success, id };
  });
  assert.equal(reopened.success, true);
  await page.waitForFunction(id => window.__vooEditors?.[id] && window.__vooEditors[id] !== window.__booleanOldEngine, reopened.id);
  // Bounded pages acquire a root Frame on reopen. Their internal Boolean
  // hierarchy and transformed geometry must remain identical through that migration.
  assert.deepEqual(await geometrySnapshot(), beforeReopen);
  assert.deepEqual(await sample([[Math.floor(transformedPoint.x), Math.floor(transformedPoint.y)]]), [red]);
  checks.push("rotation, shear and flip retain resized geometry through actual project save and reopen");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
