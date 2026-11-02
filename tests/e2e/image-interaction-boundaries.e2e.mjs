import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "interaction-boundaries");
  const panel = page.getByTestId("editor-properties-panel");
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.clock.install();
  for (const kind of ["image", "rect", "frame"]) {
    await audit.record(`${kind}-consecutive-fields-before-paint`, async () => {
      const seed = await audit.seed();
      const id = kind === "image" ? seed.id : "rapid-fields";
      await page.evaluate(({
        id,
        kind
      }) => {
        const engine = window.__vooEditor;
        if (kind !== "image") engine.setDoc({
          ...engine.getDocument(),
          nodes: [{
            id,
            kind: kind === "frame" ? "group" : "rect",
            isFrame: kind === "frame",
            x: 160,
            y: 100,
            width: 96,
            height: 96,
            fill: "#ff0000",
            opacity: 1,
            visible: true
          }]
        });
        engine.updateNode(id, {
          lockRatio: false
        });
        engine.selectExactly([id]);
      }, {
        id,
        kind
      });
      await settle();
      const original = await page.evaluate(() => window.__vooEditor.serialise());
      // Input events must compose correctly even before the next canvas frame.
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + 100);
      try {
        for (const [name, value] of [["W", 140], ["H", 120], ["X", 210], ["Y", 130]]) {
          const field = panel.getByRole("spinbutton", {
            name,
            exact: true
          });
          await field.fill(String(value));
          await field.press("Enter");
        }
      } finally {
        await page.clock.resume();
      }
      await settle();
      const node = await page.evaluate(id => window.__vooEditor.getNode(id), id);
      assert.deepEqual([node.width, node.height, node.x, node.y], [140, 120, 210, 130]);
      if (kind === "image") {
        const pixels = await audit.pixels(id);
        assert.equal(pixels.width, 140);
        assert.equal(pixels.height, 120);
      }
      for (let index = 0; index < 4; index++) await tool("undo");
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
      return {
        realInputEvents: true,
        deferredPaint: true,
        earlierFieldsRetained: true,
        oneUndoPerConfirmedField: true
      };
    });
  }
  await audit.record("document-frame-consecutive-size-fields", async () => {
    await audit.seed();
    await page.evaluate(() => window.__vooEditor.selectExactly([]));
    await settle();
    const original = await page.evaluate(() => window.__vooEditor.serialise());
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
    try {
      for (const [name, value] of [["W", 800], ["H", 500]]) {
        const field = panel.getByRole("spinbutton", {
          name,
          exact: true
        });
        await field.fill(String(value));
        await field.press("Enter");
      }
    } finally {
      await page.clock.resume();
    }
    await settle();
    assert.deepEqual(await page.evaluate(() => {
      const doc = window.__vooEditor.getDocument();
      return [doc.width, doc.height];
    }), [800, 500]);
    await tool("undo");
    await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
    return {
      pageSize: true,
      earlierFieldsRetained: true,
      history: true
    };
  });
  await audit.record("multi-selection-width-keeps-individual-heights", async () => {
    await audit.seed();
    await page.evaluate(() => {
      const e = window.__vooEditor;
      e.setDoc({
        ...e.getDocument(),
        nodes: [{
          id: "first",
          kind: "rect",
          x: 50,
          y: 80,
          width: 100,
          height: 40,
          fill: "#ff0000",
          visible: true,
          opacity: 1,
          lockRatio: false
        }, {
          id: "second",
          kind: "rect",
          x: 250,
          y: 100,
          width: 80,
          height: 70,
          fill: "#00ff00",
          visible: true,
          opacity: 1,
          lockRatio: false
        }]
      });
      e.selectExactly(["first", "second"]);
    });
    await settle();
    const original = await page.evaluate(() => window.__vooEditor.serialise());
    const field = panel.getByRole("spinbutton", {
      name: "W",
      exact: true
    });
    await field.fill("140");
    await field.press("Enter");
    await settle();
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(n => [n.width, n.height, n.x, n.y])), [[140, 40, 50, 80], [140, 70, 250, 100]]);
    await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
    return {
      independentHeights: true,
      positionsPreserved: true,
      oneUndo: true
    };
  });
  await audit.record("ratio-and-center-anchor-consecutive-fields", async () => {
    const seed = await audit.seed();
    await page.evaluate(id => window.__vooEditor.updateNode(id, {
      width: 120,
      height: 60,
      lockRatio: true
    }), seed.id);
    await settle();
    await panel.getByRole("radio", {
      name: / center$/
    }).click();
    const original = await page.evaluate(() => window.__vooEditor.serialise());
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
    try {
      for (const [name, value] of [["W", 240], ["H", 180], ["X", 200], ["Y", 160]]) {
        const field = panel.getByRole("spinbutton", {
          name,
          exact: true
        });
        await field.fill(String(value));
        await field.press("Enter");
      }
    } finally {
      await page.clock.resume();
    }
    await settle();
    const node = await page.evaluate(id => window.__vooEditor.getNode(id), seed.id);
    assert.deepEqual([node.width, node.height, node.x + node.width / 2, node.y + node.height / 2], [360, 180, 200, 160]);
    for (let index = 0; index < 4; index++) await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
    await panel.getByRole("radio", {
      name: / nw$/
    }).click();
    return {
      ratioRetained: true,
      centerCoordinates: true,
      history: true
    };
  });
  await audit.record("selection-switch-flushes-the-original-edit", async () => {
    const image = await audit.seed();
    await page.evaluate(() => {
      const e = window.__vooEditor;
      e.setDoc({
        ...e.getDocument(),
        nodes: [...e.getDocument().nodes, {
          id: "next-target",
          kind: "rect",
          x: 380,
          y: 240,
          width: 80,
          height: 60,
          fill: "#00ff00",
          visible: true,
          opacity: 1
        }]
      });
    });
    await settle();
    const original = await page.evaluate(() => window.__vooEditor.serialise());
    const field = panel.getByRole("spinbutton", {
      name: "X",
      exact: true
    });
    await field.fill("210");
    const point = await audit.client({
      x: 420,
      y: 285
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__vooEditor.getSelectedId() === "next-target");
    await settle();
    await field.fill("430");
    await field.press("Enter");
    await settle();
    assert.deepEqual(await page.evaluate(id => [window.__vooEditor.getNode(id).x, window.__vooEditor.getNode("next-target").x], image.id), [210, 430]);
    await tool("undo");
    assert.deepEqual(await page.evaluate(id => [window.__vooEditor.getNode(id).x, window.__vooEditor.getNode("next-target").x], image.id), [210, 380]);
    await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
    const history = await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
    await page.clock.runFor(1600);
    assert.equal(await page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), history);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
    return {
      realCanvasSelection: true,
      editsStayOnTheirOwnNodes: true,
      debounceDoesNotReplayOldEdits: true
    };
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const pasteKey = process.platform === "darwin" ? "Meta+v" : "Control+v";
  const seedClippingTree = async () => {
    const seed = await audit.seed();
    await page.evaluate(id => {
      const e = window.__vooEditor,
        image = e.getNode(id);
      e.setDoc({
        ...e.getDocument(),
        nodes: [{
          id: "copy-frame",
          kind: "group",
          isFrame: true,
          x: 180,
          y: 100,
          width: 120,
          height: 120,
          fill: "transparent",
          visible: true,
          opacity: 1,
          clipContent: true
        }, {
          id: "copy-group",
          kind: "group",
          parentId: "copy-frame",
          x: 180,
          y: 100,
          width: 96,
          height: 96,
          visible: true,
          opacity: 1
        }, {
          id: "copy-mask",
          kind: "rect",
          parentId: "copy-group",
          x: 180,
          y: 100,
          width: 48,
          height: 96,
          fill: "#ffffff",
          visible: true,
          opacity: 1,
          maskBase: true
        }, {
          ...image,
          x: 180,
          y: 100,
          parentId: "copy-group",
          clipTo: "copy-mask"
        }]
      });
      e.selectExactly(["copy-frame"]);
    }, seed.id);
    await settle();
    return seed.id;
  };
  const paste = async () => {
    await page.locator("[data-editor-artboard]:visible").first().evaluate(element => {
      element.tabIndex = -1;
      element.focus();
    });
    await page.keyboard.press(pasteKey);
    await settle();
  };
  await audit.record("nested-frame-clipboard-keeps-clips-and-pixels", async () => {
    await seedClippingTree();
    const original = await page.evaluate(() => window.__vooEditor.serialise());
    const pixels = await audit.pixels("copy-frame");
    assert.equal(pixels.painted, 48 * 96, "The source tree must paint its clipped image before copying");
    await page.evaluate(() => window.__vooEditor.copy());
    await paste();
    const copies = await page.evaluate(ids => window.__vooEditor.getDocument().nodes.filter(n => !ids.includes(n.id)), original.nodes.map(n => n.id));
    assert.equal(copies.length, 4);
    const frame = copies.find(n => n.isFrame),
      group = copies.find(n => n.kind === "group" && !n.isFrame);
    const mask = copies.find(n => n.maskBase),
      image = copies.find(n => n.kind === "image");
    assert.equal(group.parentId, frame.id);
    assert.equal(mask.parentId, group.id);
    assert.equal(image.parentId, group.id);
    assert.equal(image.clipTo, mask.id);
    assert.deepEqual(await audit.pixels(frame.id), pixels);
    await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
    await tool("redo");
    assert.deepEqual(await audit.pixels(frame.id), pixels);
    return {
      subtreeComplete: true,
      clippingReferencesRemapped: true,
      exactPixels: true,
      oneUndo: true
    };
  });
  await audit.record("cross-document-image-paste-detaches-foreign-owners", async () => {
    const id = await seedClippingTree();
    const sourceCanvasId = await page.evaluate(async id => {
      const e = window.__vooEditor;
      e.selectExactly([id]);
      await e.copy();
      window.__clipboardSourceEngine = e;
      return e.getDocument().canvasId;
    }, id);
    await tool("new_document", {
      width: 600,
      height: 400,
      name: "ClipboardDestination",
      force: true
    });
    await page.waitForFunction(sourceCanvasId => window.__vooEditor && window.__vooEditor !== window.__clipboardSourceEngine && window.__vooEditor.getDocument().canvasId !== sourceCanvasId, sourceCanvasId);
    await page.evaluate(() => {
      const e = window.__vooEditor;
      e.setDoc({
        ...e.getDocument(),
        nodes: []
      });
      e.selectExactly([]);
    });
    await settle();
    await paste();
    const nodes = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].kind, "image");
    assert.equal(nodes[0].parentId, null);
    assert.equal(nodes[0].clipTo, null);
    await page.waitForFunction(id => {
      const e = window.__vooEditor;
      return Boolean(e.getNodeBitmap(e.getNode(id)));
    }, nodes[0].id);
    assert.ok((await audit.pixels(nodes[0].id)).painted > 8000);
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);
    return {
      noDanglingFrameOrClip: true,
      separateDocumentEngine: true,
      actualBitmap: true,
      oneUndo: true
    };
  });
  audit.finish();
});
