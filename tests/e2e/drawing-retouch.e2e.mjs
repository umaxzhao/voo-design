import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const reset = () => page.evaluate(async () => {
    const e = window.__vooEditor;
    e.endMaskEdit(); e.setTool("select"); e.selectExactly([]);
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff", nodes: [] });
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 100 } });
    e.setColor("#ff0000"); e.setBrushWidth(24); e.setBrushOpacity(1); e.setBrushFlow(1); e.setBrushStrength(1);
    e.setPressureSize(false); e.setPressureOpacity(false); e.setBrushSmoothing(0);
  });
  const client = (point) => page.evaluate(async (point) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const e = window.__vooEditor;
    const rect = document.querySelector('[data-editor-artboard]').getBoundingClientRect();
    const doc = e.getDocument();
    return { x: rect.left + point.x * rect.width / doc.width, y: rect.top + point.y * rect.height / doc.height };
  }, point);
  const drag = async (from, to) => {
    const a = await client(from), b = await client(to);
    const hit = await page.evaluate(({x, y}) => document.elementFromPoint(x,y)?.outerHTML.slice(0,200), a);
    assert.ok(!hit?.startsWith("<button") && !hit?.startsWith("<input"), `Canvas point blocked by ${hit}`);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
  };
  const seedImage = async () => {
    await reset();
    return page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 100; c.height = 100;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#807050"; ctx.fillRect(0, 0, 100, 100);
      for (let y = 0; y < 100; y += 4) for (let x = 0; x < 100; x += 4) {
        ctx.fillStyle = (x + y) % 8 ? "#c04030" : "#405080"; ctx.fillRect(x, y, 4, 4);
      }
      ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 20, 100);
      const e = window.__vooEditor;
      const n = await e.insertImage(c.toDataURL(), { x: 150, y: 150 });
      e.selectExactly([n.id]);
      return n.id;
    });
  };
  const pixels = (id) => page.evaluate(async (id) => {
    const e = window.__vooEditor, result = e.exportSelectionPng([id]);
    const src = typeof result === "string" ? result : result.dataUrl;
    const image = new Image(); image.src = src; await image.decode();
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  }, id);

  for (const kind of ["rect", "ellipse", "polygon", "star", "line", "arrow"]) {
    await reset();
    await page.evaluate((kind) => window.__vooEditor.setTool(kind), kind);
    await drag({ x: 100, y: 100 }, { x: 200, y: 200 });
    const nodes = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
    assert.equal(nodes.length, 1, `${kind} pointer gesture must create one object`);
    const box = await page.evaluate(async (node) => (await import("/src/canvas/editor/scene_geometry.js")).nodeAABB(node), nodes[0]);
    assert.ok(box.width > 50 && box.height > 50, `${kind}: ${JSON.stringify(box)}`);
    assert.ok((await pixels(nodes[0].id)).some((value, index) => index % 4 === 3 && value > 0), `${kind} must paint pixels`);
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 0);
    await tool("redo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 1);
    checks.push(`${kind}: real pointer creation, rendered pixels and one-step undo/redo`);
  }
  for (const kind of ["pen", "curvature_pen", "free_pen"]) {
    await reset(); await page.evaluate((kind) => window.__vooEditor.setTool(kind), kind);
    if (kind === "free_pen") await drag({ x: 100, y: 100 }, { x: 200, y: 180 });
    else {
      for (const point of [{ x: 100, y: 100 }, { x: 180, y: 120 }, { x: 160, y: 190 }]) {
        const at = await client(point); await page.mouse.click(at.x, at.y);
      }
      await page.getByTestId("editor-taskbar-finishPath").click();
      assert.equal(await page.evaluate(() => window.__vooEditor.getPenDraft()), null);
    }
    const nodes = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
    assert.equal(nodes.length, 1, `${kind} must commit one path`);
    assert.ok((await pixels(nodes[0].id)).some((value, index) => index % 4 === 3 && value > 0));
    checks.push(`${kind}: pointer anchors/stroke commit to visible path; pen finish button works`);
  }
  for (const kind of ["brush", "eraser", "blur", "sharpen", "smudge", "dodge", "burn", "sponge"]) {
    const id = await seedImage();
    const before = await pixels(id);
    await page.evaluate((kind) => {
      const e = window.__vooEditor; e.setBrushMode("normal"); e.setTool(kind);
      e.setBrushTonalRange("all"); e.setBrushProtectLuminosity(false); e.setBrushExposure(1);
    }, kind);
    await drag({ x: 140, y: 140 }, { x: 165, y: 165 });
    await page.evaluate(() => window.__vooEditor.flushPaints());
    const after = await pixels(id);
    assert.notDeepEqual(after, before, `${kind} pointer stroke must change image pixels: ${JSON.stringify(await page.evaluate(() => ({ tool: window.__vooEditor.getTool(), selected: window.__vooEditor.getSelectedIds(), nodes: window.__vooEditor.getDocument().nodes.map(n => ({ id:n.id, kind:n.kind, x:n.x, y:n.y, width:n.width, height:n.height })) })))}`);
    await tool("undo");
    assert.deepEqual(await pixels(id), before, `${kind} must undo the whole stroke once`);
    await tool("redo");
    assert.deepEqual(await pixels(id), after, `${kind} must redo exact pixels`);
    checks.push(`${kind}: real pointer stroke changes pixels with exact undo/redo`);
  }

  const id = await seedImage();
  const before = await pixels(id);
  await page.evaluate(() => { const e = window.__vooEditor; e.setTool("healing"); e.setHealingMode("clone"); });
  const anchor = await client({ x: 110, y: 150 });
  await page.keyboard.down("Alt"); await page.mouse.click(anchor.x, anchor.y); await page.keyboard.up("Alt");
  await drag({ x: 160, y: 150 }, { x: 165, y: 150 });
  await page.waitForFunction((id) => !window.__vooEditor.getRemoveStroke?.(), id);
  await page.waitForTimeout(200);
  assert.notDeepEqual(await pixels(id), before, "Clone stamping must copy actual image pixels");
  await tool("undo"); assert.deepEqual(await pixels(id), before);
  checks.push("clone stamp: Alt-source picking and pointer stroke copy pixels and undo once");
  for (const kind of ["fill", "gradient", "spot"]) {
    const id = await seedImage(); const before = await pixels(id);
    const imageId = await page.evaluate((id) => window.__vooEditor.getNode(id).imageId, id);
    await page.evaluate((kind) => { const e = window.__vooEditor; e.setTool(kind === "spot" ? "healing" : kind); if (kind === "spot") e.setHealingMode("spot"); }, kind);
    if (kind === "fill") { const at = await client({ x: 150, y: 150 }); await page.mouse.click(at.x, at.y); }
    else await drag({ x: 130, y: 140 }, { x: 175, y: 160 });
    await page.waitForFunction(({id, imageId}) => window.__vooEditor.getNode(id).imageId !== imageId, {id, imageId}, {timeout: 15000});
    assert.notDeepEqual(await pixels(id), before, `${kind} must change actual pixels`);
    await tool("undo"); assert.deepEqual(await pixels(id), before);
    checks.push(`${kind}: real pointer operation changes pixels and undoes once`);
  }
  await reset(); await page.evaluate(() => window.__vooEditor.setTool("text"));
  await drag({ x: 100, y: 100 }, { x: 250, y: 180 });
  const textInput = page.locator('[data-editor-artboard] textarea');
  await textInput.fill("Drawing audit"); await textInput.press("Control+Enter");
  const text = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(n => n.kind === "text"));
  assert.equal(text.text, "Drawing audit");
  assert.ok((await pixels(text.id)).some((value,index) => index % 4 === 3 && value > 0));
  checks.push("text: pointer text box, real typing and committed glyph pixels");

  const patchId = await seedImage(); const patchBefore = await pixels(patchId);
  const patchImageId = await page.evaluate((id) => window.__vooEditor.getNode(id).imageId, patchId);
  await page.evaluate(() => { const e = window.__vooEditor; e.setTool("healing"); e.setHealingMode("patch"); });
  const start = await client({ x: 140, y: 140 });
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (const point of [{x:160,y:140},{x:160,y:160},{x:140,y:160},{x:140,y:140}]) {
    const at = await client(point); await page.mouse.move(at.x, at.y, {steps:4});
  }
  await page.mouse.up();
  assert.ok(await page.evaluate(() => window.__vooEditor.getPatchDraft()?.points.length >= 3));
  await drag({x:150,y:150},{x:110,y:150});
  await page.waitForFunction(({id,imageId}) => window.__vooEditor.getNode(id).imageId !== imageId,
    {id:patchId,imageId:patchImageId},{timeout:15000});
  assert.notDeepEqual(await pixels(patchId), patchBefore);
  await tool("undo"); assert.deepEqual(await pixels(patchId), patchBefore);
  checks.push("patch: real contour and source drag modify image pixels and undo once");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
