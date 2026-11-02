import assert from "node:assert/strict";
import { checkDuplicatedFrameDrag } from "./duplicate-frame-drag-checks.mjs";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const seed = async () => {
    await page.evaluate(async () => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), isCanvasRoot: true, width: 1000, height: 600, crop: null,
        backgroundColor: "transparent", nodes: [
          { id: "source-frame", kind: "group", isFrame: true, visible: true,
            x: 40, y: 40, width: 240, height: 180, fill: "#ffffff", clipContent: true },
          { id: "source-group", kind: "group", parentId: "source-frame", visible: true,
            x: 70, y: 70, width: 110, height: 80 },
          { id: "source-child", kind: "rect", parentId: "source-group", visible: true,
            x: 80, y: 80, width: 70, height: 50, fill: "#00ff00" },
          { id: "source-hidden", kind: "rect", parentId: "source-frame", visible: false, locked: true,
            x: 160, y: 80, width: 40, height: 40, fill: "#ff0000" },
          { id: "sibling", kind: "group", isFrame: true, visible: true,
            x: 700, y: 40, width: 180, height: 180, fill: "#0000ff" },
        ] });
      e.selectExactly(["source-frame"]); e.setTool("select");
      if (e.getSnappingEnabled()) e.toggleSnapping();
      useDesignStore.setState({ editorCamera: { zoom: 1, panX: 220, panY: 200 }, pendingArtboardFitId: null });
    });
    await settled();
  };
  const snapshot = () => page.evaluate(() => JSON.stringify(window.__vooEditor.serialise()));
  const index = () => page.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
  const point = (position = { x: 230, y: 170 }) => page.evaluate(position => {
    const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: board.left + position.x * board.width / doc.width, y: board.top + position.y * board.height / doc.height };
  }, position);
  const begin = async (position) => {
    const start = await point(position);
    await page.keyboard.down("Alt"); await page.mouse.move(start.x, start.y); await page.mouse.down();
    return start;
  };

  await seed();
  const clickBefore = await snapshot(), clickIndex = await index();
  await begin(); await page.mouse.up(); await page.keyboard.up("Alt"); await settled();
  assert.equal(await snapshot(), clickBefore, "Alt-click without a drag must not create a duplicate");
  assert.equal(await index(), clickIndex);
  checks.push("an Alt-click without movement creates neither a duplicate nor a history entry");

  await checkDuplicatedFrameDrag(page, checks);
  await seed();
  const before = await snapshot(), beforeIndex = await index();
  const start = await begin();
  await page.mouse.move(start.x + 350, start.y + 30, { steps: 8 });
  await page.mouse.up(); await page.keyboard.up("Alt"); await settled();
  const after = await snapshot();
  const result = await page.evaluate(() => {
    const e = window.__vooEditor, nodes = e.getDocument().nodes;
    const copies = nodes.filter(n => !n.id.startsWith("source-") && n.id !== "sibling");
    const copiedFrame = copies.find(n => n.isFrame);
    return { copies, source: nodes.filter(n => n.id.startsWith("source-") || n.id === "sibling"),
      pixel: e.sampleColorAt({ x: 450, y: 130 }), copiedFrameId: copiedFrame?.id,
      selected: e.getSelectedIds() };
  });
  assert.equal(result.copies.length, 4);
  assert.equal(result.copies.filter(n => n.parentId === result.copiedFrameId).length, 2);
  assert.equal(result.copies.find(n => n.kind === "rect" && n.visible).parentId,
    result.copies.find(n => n.kind === "group" && !n.isFrame).id);
  assert.equal(result.pixel, "#00ff00");
  assert.deepEqual(result.source, JSON.parse(before).nodes);
  assert.deepEqual(result.selected, [result.copiedFrameId]);
  assert.equal(await index(), beforeIndex + 1, "the duplicate and its movement share one history entry");
  await page.evaluate(() => window.__vooEditor.undo()); assert.equal(await snapshot(), before);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["source-frame"]);
  await page.evaluate(() => window.__vooEditor.redo()); assert.equal(await snapshot(), after);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), [result.copiedFrameId]);
  checks.push("Alt-drag copies the complete nested Frame with pixels, preserves originals and sibling, and undoes/redoes once");

  for (const cancel of ["Escape", "pointercancel", "blur"]) {
    await seed();
    await page.evaluate(async () => {
      const e = window.__vooEditor;
      e.updateNode("sibling", { fill: "#00ffff" });
      window.__duplicateFuture = JSON.stringify(e.serialise());
      await e.undo();
    });
    const cancelledBefore = await snapshot(), cancelledIndex = await index();
    const start = await begin();
    await page.mouse.move(start.x + 100, start.y + 20, { steps: 4 }); await settled();
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else if (cancel === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await page.evaluate(() => {
      const stage = document.querySelector('[data-editor-artboard] [data-testid="editor-stage"]')
        ?? [...document.querySelectorAll("[data-editor-artboard] *")].find(el => el.hasPointerCapture?.(1));
      if (!stage) throw new Error("The active pointer capture must exist");
      stage.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
    });
    await page.mouse.up(); await page.keyboard.up("Alt"); await settled();
    assert.equal(await snapshot(), cancelledBefore, `${cancel} restores the complete original document`);
    assert.equal(await index(), cancelledIndex, `${cancel} does not create history`);
    await page.evaluate(() => window.__vooEditor.redo());
    assert.equal(await snapshot(), await page.evaluate(() => window.__duplicateFuture), `${cancel} retains the original redo branch`);
    checks.push(`${cancel} rolls back a live Alt duplicate without leaving a partial subtree or history entry`);
  }

  await seed();
  await page.evaluate(() => window.__vooEditor.selectGroup("source-group"));
  const groupBefore = await snapshot(), groupIndex = await index();
  await page.evaluate(() => window.__vooEditor.duplicateSelected());
  const copiedGroup = await page.evaluate(() => {
    const nodes = window.__vooEditor.getDocument().nodes;
    return nodes.filter(node => !node.id.startsWith("source-") && node.id !== "sibling");
  });
  assert.equal(copiedGroup.length, 2, "duplicating a selected ordinary Group must retain its container");
  assert.equal(copiedGroup[1].parentId, copiedGroup[0].id);
  assert.equal(copiedGroup[0].parentId, "source-frame");
  assert.equal(await index(), groupIndex + 1);
  await page.evaluate(() => window.__vooEditor.undo()); assert.equal(await snapshot(), groupBefore);
  assert.equal(await page.evaluate(() => window.__vooEditor.getSelectedGroup()?.id), "source-group",
    "undo must restore the ordinary Group selection unit, not only its leaf IDs");
  await page.evaluate(() => window.__vooEditor.duplicateSelected());
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), JSON.parse(groupBefore).nodes.length + 2,
    "duplicating again after undo must still copy the whole Group");
  await page.evaluate(() => window.__vooEditor.undo()); assert.equal(await snapshot(), groupBefore);
  checks.push("ordinary Group duplication preserves the container and its nested parent links with one undo");

  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly(["source-child"]);
    e.updateNode("sibling", { fill: "#ff00ff" });
  });
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getSelectedGroup()?.id ?? null), null,
    "an explicit leaf selection must not become its former Group after undo");
  checks.push("undo distinguishes an explicit leaf selection from a Group with the same leaf IDs");

  await seed();
  await page.evaluate(() => window.__vooEditor.selectGroup("source-group"));
  const altGroupBefore = await snapshot(), altGroupIndex = await index();
  const groupStart = await begin({ x: 110, y: 105 });
  await page.mouse.move(groupStart.x + 40, groupStart.y + 20, { steps: 4 });
  await page.mouse.up(); await page.keyboard.up("Alt"); await settled();
  const altGroup = await page.evaluate(() => window.__vooEditor.getDocument().nodes
    .filter(node => !node.id.startsWith("source-") && node.id !== "sibling"));
  assert.equal(altGroup.length, 2);
  assert.equal(altGroup[0].parentId, "source-frame");
  assert.equal(altGroup[1].parentId, altGroup[0].id);
  assert.equal(altGroup[0].x, 110);
  assert.equal(await index(), altGroupIndex + 1);
  await page.evaluate(() => window.__vooEditor.undo()); assert.equal(await snapshot(), altGroupBefore);
  checks.push("Alt-drag retains an ordinary selected Group as a complete container and undoes once");

  await seed();
  await page.evaluate(() => window.__vooEditor.selectGroup("source-group"));
  const pasteBefore = await snapshot(), pasteIndex = await index();
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    await e.copySelected();
    if (!e.paste()) throw new Error("Copied internal Group must paste successfully");
  });
  const pastedGroup = await page.evaluate(() => {
    const e = window.__vooEditor;
    const copies = e.getDocument().nodes.filter(node => !node.id.startsWith("source-") && node.id !== "sibling");
    return { copies, selection: e.getSelectedIds(), svg: e.getSelectedSvg() };
  });
  assert.equal(pastedGroup.copies.length, 2);
  assert.equal(pastedGroup.copies[1].parentId, pastedGroup.copies[0].id);
  assert.deepEqual(pastedGroup.selection, [pastedGroup.copies[0].id]);
  assert.ok(pastedGroup.svg.includes("#00ff00"));
  assert.equal(await index(), pasteIndex + 1);
  await page.evaluate(() => window.__vooEditor.undo()); assert.equal(await snapshot(), pasteBefore);
  checks.push("copy/paste preserves the ordinary Group shell, selects only its root and exports its child in SVG");

  for (const unit of ["frame", "group"]) for (const cancel of ["Escape", "pointercancel", "blur"]) {
    await seed();
    await page.evaluate(unit => {
      const e = window.__vooEditor;
      e.updateNode("source-hidden", { locked: false });
      if (unit === "group") e.selectGroup("source-group");
    }, unit);
    const ordinaryBefore = await snapshot(), ordinaryIndex = await index();
    const start = await point(unit === "group" ? { x: 110, y: 105 } : undefined);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + 40, start.y + 20, { steps: 4 }); await settled();
    assert.notEqual(await snapshot(), ordinaryBefore, "the actual ordinary drag must change geometry before cancellation");
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else if (cancel === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await page.evaluate(() => {
      const stage = [...document.querySelectorAll("[data-editor-artboard] *")].find(el => el.hasPointerCapture?.(1));
      if (!stage) throw new Error("The active ordinary drag must own pointer capture");
      stage.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
    });
    await page.mouse.up(); await settled();
    assert.equal(await snapshot(), ordinaryBefore, `${cancel} must restore an ordinary ${unit} drag`);
    assert.equal(await index(), ordinaryIndex, `${cancel} must not commit an ordinary ${unit} drag`);
    checks.push(`${cancel} restores an ordinary ${unit} drag without adding history`);
  }
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
