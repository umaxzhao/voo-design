import assert from "node:assert/strict";

/** The shipped FORM example reproduces the user's overlapping Frame copies. */
export async function checkDuplicatedFrameDrag(page, checks) {
  await page.evaluate(() => { window.__frameCopyAuditSession = window.__vooEditor.captureDocumentSession(); });
  const modifier = await page.evaluate(() => /Mac/.test(navigator.platform) ? "Meta" : "Control");
  try {
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const seed = async method => {
      const sourceId = await page.evaluate(async () => {
        const { decodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
        const { useDesignStore } = await import("/src/store/design_store.js");
        const file = decodeVooBinary(new Uint8Array(await (await fetch("/docs/examples/form-poster.voo")).arrayBuffer()));
        const e = window.__vooEditor, doc = file.document;
        const frame = doc.nodes.find(node => node.name === "FORM — Design Culture");
        const dx = 40 - frame.x, dy = 40 - frame.y;
        e.setDoc({ ...e.getDocument(), ...doc, isCanvasRoot: true, width: 1500, height: 1000,
          nodes: doc.nodes.map(node => ({ ...node, x: node.x + dx, y: node.y + dy })) });
        e.setTool("select"); e.selectExactly([]);
        if (e.getSnappingEnabled()) e.toggleSnapping();
        useDesignStore.setState({ editorCamera: { zoom: 0.5, panX: 320, panY: 250 }, pendingArtboardFitId: null });
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
          write: async () => {}, writeText: async () => {},
        } });
        return frame.id;
      });
      await settle();
      await page.getByTestId("editor-layers-panel").locator(`#layer-row-${sourceId}`).click();
      if (method === "duplicate") await page.keyboard.press(`${modifier}+d`);
      else await page.evaluate(async () => {
        const e = window.__vooEditor;
        await e.copySelected();
        if (!e.paste()) throw new Error("The internal Frame clipboard must paste");
      });
      await settle();
      const copy = await page.evaluate(sourceId => {
        const e = window.__vooEditor, id = e.getSelectedIds()[0];
        if (!id || id === sourceId || !e.getNode(id)?.isFrame) throw new Error("Copy must select the new Frame");
        return { id, frame: e.getNode(id), doc: e.serialise(), index: e.getCurrentHistoryIndex() };
      }, sourceId);
      return copy;
    };
    const point = async (copy, surface) => {
      if (surface === "title") {
        const box = await page.locator(`[data-testid="editor-canvas-frame-label"][data-frame-id="${copy.id}"]`).boundingBox();
        assert.ok(box);
        return { x: box.x + 30, y: box.y + box.height / 2 };
      }
      return page.evaluate(({ frame, surface }) => {
        const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
        const doc = window.__vooEditor.getDocument();
        const x = frame.x + frame.width * (surface === "body" ? 0.5 : 0.25);
        const y = frame.y + (surface === "body" ? frame.height * 0.5 : 2);
        return { x: board.left + x * board.width / doc.width, y: board.top + y * board.height / doc.height };
      }, { frame: copy.frame, surface });
    };
    for (const method of ["duplicate", "paste"]) for (const surface of ["body", "title", "edge"]) {
      const copy = await seed(method), start = await point(copy, surface);
      const before = await page.evaluate(() => window.__vooEditor.serialise());
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x + 80, start.y + 40, { steps: 8 }); await page.mouse.up(); await settle();
      const after = await page.evaluate(copy => ({ doc: window.__vooEditor.serialise(),
        selected: window.__vooEditor.getSelectedIds(), index: window.__vooEditor.getCurrentHistoryIndex(),
        frame: window.__vooEditor.getNode(copy.id) }), copy);
      assert.deepEqual([after.frame.x - copy.frame.x, after.frame.y - copy.frame.y], [160, 80],
        `${method}/${surface}: dragging the selected copy moves the whole Frame`);
      const beforeById = new Map(before.nodes.map(node => [node.id, node]));
      const moving = new Set([copy.id]);
      for (const node of before.nodes) if (moving.has(node.parentId)) moving.add(node.id);
      for (const node of after.doc.nodes) {
        const old = beforeById.get(node.id);
        if (moving.has(node.id)) assert.deepEqual([node.x - old.x, node.y - old.y], [160, 80], `${node.name} moves with its Frame`);
        else assert.deepEqual(node, old, "Original Frame, sibling and artwork must stay unchanged");
      }
      assert.deepEqual(after.selected, [copy.id]);
      assert.equal(after.index, copy.index + 1, "One pointer move adds one history entry");
      await page.evaluate(() => window.__vooEditor.undo());
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), before);
      await page.evaluate(() => window.__vooEditor.redo());
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), after.doc);
      checks.push(`${method}/${surface}: actual FORM copy moves as one Frame and complete subtree; originals stay fixed and move undoes/redoes once`);
    }
    for (const surface of ["body", "title"]) for (const cancel of ["Escape", "pointercancel", "blur"]) {
      const copy = await seed("duplicate"), start = await point(copy, surface);
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x + 40, start.y + 20, { steps: 5 }); await settle();
      assert.notEqual(await page.evaluate(id => window.__vooEditor.getNode(id).x, copy.id), copy.frame.x,
        "Cancellation must start from an actual moved Frame");
      if (cancel === "Escape") await page.keyboard.press("Escape");
      else if (cancel === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      else await page.evaluate(() => {
        const stage = [...document.querySelectorAll("[data-editor-artboard] *")].find(el => el.hasPointerCapture?.(1));
        if (!stage) throw new Error("Frame drag must own real pointer capture");
        stage.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
      });
      await page.mouse.up(); await settle();
      const state = await page.evaluate(() => ({ doc: window.__vooEditor.serialise(),
        selected: window.__vooEditor.getSelectedIds(), index: window.__vooEditor.getCurrentHistoryIndex() }));
      assert.deepEqual(state.doc, copy.doc);
      assert.deepEqual(state.selected, [copy.id]);
      assert.equal(state.index, copy.index);
      checks.push(`${surface}/${cancel}: cancels the real copied-Frame move, restores its selection and adds no history`);
    }
    for (const lock of ["locked", "lockPosition"]) {
      const copy = await seed("duplicate");
      await page.evaluate(({ id, lock }) => window.__vooEditor.updateNode(id, { [lock]: true }), { id: copy.id, lock });
      await settle();
      const before = await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise()));
      const start = await point(copy, "title");
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(start.x + 60, start.y + 30, { steps: 5 }); await page.mouse.up(); await settle();
      assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.serialise())), before);
      checks.push(`${lock}: title dragging cannot bypass the copied Frame's lock`);
    }
    const deep = await seed("duplicate"), deepStart = await point(deep, "body");
    await page.keyboard.down(modifier);
    await page.mouse.move(deepStart.x, deepStart.y); await page.mouse.down();
    await page.mouse.move(deepStart.x + 40, deepStart.y + 20, { steps: 5 }); await page.mouse.up();
    await page.keyboard.up(modifier); await settle();
    const deepState = await page.evaluate(id => ({ frame: window.__vooEditor.getNode(id), child: window.__vooEditor.getSelected() }), deep.id);
    assert.deepEqual([deepState.frame.x, deepState.frame.y], [deep.frame.x, deep.frame.y]);
    assert.equal(deepState.child.name, "Quarter arch");
    assert.equal(deepState.child.parentId, deep.id);
    const deepBefore = deep.doc.nodes.find(node => node.id === deepState.child.id);
    assert.deepEqual([deepState.child.x - deepBefore.x, deepState.child.y - deepBefore.y], [80, 40]);
    checks.push("Ctrl/Meta drag still moves the copied child independently of its selected Frame");

    // The selected parent must not swallow ordinary click-to-select-child behavior.
    const copy = await seed("duplicate"), start = await point(copy, "body");
    await page.mouse.click(start.x, start.y); await settle();
    const clicked = await page.evaluate(() => window.__vooEditor.getSelected());
    assert.equal(clicked.name, "Quarter arch");
    assert.equal(clicked.parentId, copy.id);
    checks.push("a plain click still selects the copied child; only a real drag carries the selected Frame");
  } finally {
    await page.keyboard.up(modifier);
    await page.mouse.up();
    await page.evaluate(() => {
      window.__vooEditor.cancelActiveGesture?.();
      window.__vooEditor.restoreDocumentSession(window.__frameCopyAuditSession);
      delete window.__frameCopyAuditSession;
    });
  }
}
