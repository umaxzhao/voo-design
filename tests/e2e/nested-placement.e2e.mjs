import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { nestedObjectsFixture, nestedFrames, frame, shape } from "./nested-objects-fixture.mjs";
const pasteKey = process.platform === "darwin" ? "Meta+v" : "Control+v";
const copyKey = process.platform === "darwin" ? "Meta+c" : "Control+c";

await withEditorBrowser(async ({ page }) => {
  const f = nestedObjectsFixture(page, "nested-placement");
  for (const format of ["png", "svg"]) await f.record(`picker-${format}-inside-inner-frame`, async () => {
    await f.seed(nestedFrames(), ["inner"]);
    const before = await f.snapshot();
    const file = format === "png" ? { name: "Nested.png", mimeType: "image/png", buffer: await f.solidPng() }
      : { name: "Nested.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#0000ff"/></svg>') };
    const added = await f.pick(file);
    const roots = added.filter(n => !added.some(parent => parent.id === n.parentId));
    assert.ok(roots.length > 0);
    assert.ok(roots.every(n => n.parentId === "inner"), JSON.stringify(roots));
    assert.equal(await f.pixel({ x: 240, y: 220 }), "#0000ff");
    await f.hierarchy(); await f.history(before);
    return { realPicker: true, nestedOwner: true, pixels: true, undoRedo: true };
  });

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const format of ["png", "svg"]) await f.record(`clipboard-${format}-inside-selected-frame`, async () => {
    await f.seed(nestedFrames(), ["inner"]);
    const before = await f.snapshot();
    const base64 = (await f.solidPng()).toString("base64");
    await page.evaluate(async ({ format, base64 }) => {
      if (format === "svg") {
        await navigator.clipboard.writeText('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#0000ff"/></svg>');
      } else {
        const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
    }, { format, base64 });
    await f.focus(); await page.keyboard.press(pasteKey);
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length > count, before.nodes.length);
    const added = (await f.snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
    assert.ok(added.every(n => n.parentId === "inner"));
    assert.equal(await f.pixel({ x: 280, y: 250 }), "#0000ff");
    if (format === "svg") assert.ok(added.every(n => n.kind !== "image"));
    await f.hierarchy(); await f.history(before);
    return { nativeClipboard: true, selectedFrame: true, pixels: true, undoRedo: true };
  });
  await f.record("file-drop-into-nested-frame", async () => {
    await f.seed(); const before = await f.snapshot(), point = await f.client({ x: 240, y: 220 });
    const base64 = (await f.solidPng()).toString("base64");
    const transfer = await page.evaluateHandle(base64 => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const data = new DataTransfer(); data.items.add(new File([bytes], "Dropped.png", { type: "image/png" }));
      return data;
    }, base64);
    try {
      await page.locator("[data-editor-artboard]").dispatchEvent("drop", {
        dataTransfer: transfer, clientX: point.x, clientY: point.y,
      });
    } finally { await transfer.dispose(); }
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length > count, before.nodes.length);
    const added = (await f.snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
    assert.equal(added.length, 1); assert.equal(added[0].parentId, "inner");
    assert.equal(await f.pixel({ x: 240, y: 220 }), "#0000ff");
    await f.hierarchy(); await f.history(before);
    return { realFileDecode: true, dropEvent: true, nestedOwner: true, undoRedo: true };
  });

  for (const kind of ["rect", "ellipse", "frame"]) await f.record(`draw-${kind}-in-nested-frame`, async () => {
    await f.seed();
    const before = await f.snapshot();
    await page.evaluate(kind => window.__vooEditor.setTool(kind), kind);
    await f.drag({ x: 190, y: 180 }, { x: 260, y: 230 });
    const created = (await f.snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
    assert.equal(created.length, 1, JSON.stringify(created));
    assert.equal(created[0].parentId, "inner");
    await page.evaluate(() => window.__vooEditor.setTool("select"));
    await f.hierarchy(); await f.history(before);
    return { pointerDrawing: true, nestedOwner: true, undoRedo: true };
  });

  await f.record("text-box-and-pen-path-join-inner-frame", async () => {
    await f.seed();
    const before = await f.snapshot();
    await page.evaluate(() => window.__vooEditor.setTool("text"));
    await f.drag({ x: 180, y: 180 }, { x: 310, y: 220 });
    const text = (await f.snapshot()).nodes.find(n => n.kind === "text");
    assert.equal(text?.parentId, "inner");
    const input = page.getByRole("textbox", { name: text.name || "Text", exact: true });
    await input.fill("Nested creation"); await input.press("Escape");
    assert.equal((await f.node(text.id)).text, "Nested creation");
    await f.history(before);
    await page.evaluate(() => window.__vooEditor.setTool("pen"));
    const pathBefore = await f.snapshot();
    for (const position of [{ x: 190, y: 260 }, { x: 270, y: 260 }, { x: 270, y: 310 }, { x: 190, y: 260 }]) {
      const p = await f.client(position); await page.mouse.click(p.x, p.y);
    }
    await page.keyboard.press("Enter"); await f.settle();
    const path = (await f.snapshot()).nodes.find(n => n.kind === "path");
    assert.equal(path?.parentId, "inner"); assert.ok(path.points.length >= 3);
    await f.hierarchy(); await f.history(pathBefore);
    return { realTextBox: true, typedText: true, realPenAnchors: true, nestedOwners: true, undoRedo: true };
  });

  await f.record("drawing-prefers-front-frame-over-smaller-rear-frame", async () => {
    await f.seed([frame("rear", 120, 120, 160, 140), frame("front", 100, 100, 400, 300)]);
    const before = await f.snapshot();
    await page.evaluate(() => window.__vooEditor.setTool("rect"));
    await f.drag({ x: 180, y: 180 }, { x: 240, y: 230 });
    const created = (await f.snapshot()).nodes.find(n => !before.nodes.some(old => old.id === n.id));
    assert.equal(created?.parentId, "front");
    return { visibleStacking: true };
  });

  await f.record("drawing-outside-clipped-nested-frame-stays-on-canvas", async () => {
    await f.seed([frame("outer", 40, 40, 160, 160), frame("inner", 150, 80, 200, 180, { parentId: "outer" })]);
    const before = await f.snapshot();
    await page.evaluate(() => window.__vooEditor.setTool("rect"));
    await f.drag({ x: 260, y: 150 }, { x: 300, y: 180 });
    const created = (await f.snapshot()).nodes.find(n => !before.nodes.some(old => old.id === n.id));
    assert.equal(created?.parentId ?? null, null);
    return { clippedHitProtection: true };
  });

  await f.record("paste-selected-layer-into-different-nested-frame", async () => {
    await f.seed([...nestedFrames(), shape("source", "inner", 180, 180),
      frame("target", 480, 120, 140, 260, { parentId: "outer" })], ["source"]);
    await f.focus(); await page.keyboard.press(copyKey);
    await page.evaluate(() => window.__vooEditor.selectExactly(["target"]));
    const before = await f.snapshot();
    await f.focus(); await page.keyboard.press(pasteKey);
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length > count, before.nodes.length);
    const added = (await f.snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
    assert.equal(added.length, 1);
    assert.equal(added[0].parentId, "target");
    assert.ok(added[0].x >= 480 && added[0].x + added[0].width <= 620, "Pasted artwork must be inside the target Frame");
    assert.equal(await f.pixel({ x: added[0].x + 20, y: added[0].y + 20 }), "#ff0000");
    await f.hierarchy(); await f.history(before);
    return { keyboardCopyPaste: true, explicitDestination: true, pixels: true, undoRedo: true };
  });
  await f.record("clipped-and-rounded-child-areas-do-not-intercept-clicks", async () => {
    for (const cornerRadius of [0, 40]) {
      const point = cornerRadius ? { x: 122, y: 122 } : { x: 300, y: 180 };
      await f.seed([shape("backdrop", null, 80, 80, { width: 400, height: 300, fill: "#0000ff" }),
        frame("outer", 120, 120, 100, 100, { cornerRadius }),
        shape("clipped-child", "outer", 120, 120, { width: 250, height: 200 })]);
      const p = await f.client(point); await page.mouse.click(p.x, p.y); await f.settle();
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ["backdrop"]);
      assert.equal(await f.pixel(point), "#0000ff");
    }
    return { trustedPointerClicks: true, roundedClip: true, rectangularOverflow: true, visibleLayerSelected: true };
  });
  f.finish();
});
