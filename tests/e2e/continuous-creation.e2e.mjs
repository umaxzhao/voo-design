import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { creationSession } from "./creation-session-fixture.mjs";

let archive, expected, frameId, imageId, painted;
const projection = nodes => nodes.map(node => ({ ...Object.fromEntries(
  ["id", "kind", "isFrame", "x", "y", "width", "height", "opacity", "text", "points"]
    .filter(key => node[key] !== undefined).map(key => [key, node[key]])),
parentId: node.parentId ?? null, clipTo: node.clipTo ?? null }));
const artwork = (page, id) => page.evaluate(async id => {
  const result = window.__vooEditor.exportSelectionPng([id]);
  const image = new Image(); image.src = result.dataUrl; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
  let hash = 2166136261;
  for (const value of ctx.getImageData(0, 0, canvas.width, canvas.height).data) hash = Math.imul(hash ^ value, 16777619);
  return { width: canvas.width, height: canvas.height, hash: hash >>> 0 };
}, id);

await withEditorBrowser(async ({ page }) => {
  const f = await creationSession(page);
  let frame, rectangle, ellipse, text, path, mask, image;
  const addedSince = async before => (await f.snapshot()).nodes.filter(n => !before.nodes.some(old => old.id === n.id));
  const panel = page.getByTestId("editor-properties-panel");
  const edit = async (name, value) => {
    const input = panel.getByRole("spinbutton", { name, exact: true });
    await input.fill(String(value)); await input.press("Enter"); await f.settle();
  };
  const context = async (point, testId) => { await f.click(point, { button: "right" }); await page.getByTestId("editor-menu-mask-submenu").hover(); await page.getByTestId(testId).click(); await f.settle(); };

  await f.step("new-project-and-frame-creation", async () => {
    await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
    await page.waitForFunction(() => window.__vooEditor && document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
    // Set only the initial view; preserve New's actual document, tools and defaults.
    await page.evaluate(() => window.__vooStore.setEditorCamera({ zoom: 1, panX: 300, panY: 100 }));
    await f.settle(); const before = await f.snapshot();
    await f.click({ x: 700, y: 500 }); await f.tool("f", "frame");
    await f.drag({ x: 80, y: 80 }, { x: 700, y: 500 });
    [frame] = await addedSince(before);
    assert.equal(frame.isFrame, true); assert.equal(frame.parentId, before.nodes[0].id);
  });
  await f.step("rectangle-then-ellipse-through-real-tools", async () => {
    let before = await f.snapshot();
    await page.getByTestId("editor-toolbar").getByRole("button", { name: "Shapes", exact: true }).click();
    await f.drag({ x: 120, y: 120 }, { x: 260, y: 200 }); [rectangle] = await addedSince(before);
    assert.equal(rectangle.kind, "rect"); assert.equal(rectangle.parentId, frame.id);
    before = await f.snapshot(); await f.tool("o", "ellipse", true);
    await f.drag({ x: 330, y: 140 }, { x: 420, y: 230 }); [ellipse] = await addedSince(before);
    assert.equal(ellipse.kind, "ellipse"); assert.equal(ellipse.parentId, frame.id);
    // A no-motion R tap must return to Rectangle even when Ellipse is active.
    await f.tool("r", "rect", true); await f.tool("o", "ellipse", true);
    await page.keyboard.down("r");
    const menuEllipse = page.getByRole("menuitem", { name: "Ellipse", exact: true });
    await menuEllipse.waitFor(); await menuEllipse.hover(); await page.keyboard.up("r"); await f.settle();
    assert.equal(await page.evaluate(() => window.__vooEditor.getTool()), "ellipse", "A real radial hover overrides the key default");
  });
  await f.step("create-text-then-return-to-object-movement", async () => {
    const before = await f.snapshot(); await f.tool("t", "text");
    await f.drag({ x: 120, y: 280 }, { x: 410, y: 330 }); [text] = await addedSince(before);
    assert.equal(text.kind, "text"); assert.equal(text.parentId, frame.id);
    const input = page.locator("textarea:visible");
    await input.fill("Continuous creation 中文"); await input.press("Escape");
    assert.equal((await f.node(text.id)).text, "Continuous creation 中文");
    const ink = await page.evaluate(async id => {
      const result = window.__vooEditor.exportSelectionPng([id]);
      const img = new Image(); img.src = result.dataUrl; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(40, 200, 290, 50).data;
      let dark = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 1] < 100 && pixels[i + 2] < 100 && pixels[i + 3] > 200) dark++;
      return dark;
    }, frame.id);
    assert.ok(ink > 20, "New text must have visible ink on its white Frame, not white-on-white");
    const typed = await f.snapshot(); await f.key("z"); await f.settle();
    assert.deepEqual(await f.snapshot(), before, "Text placement and typing must undo together");
    await f.key("Shift+z"); await f.settle(); assert.deepEqual(await f.snapshot(), typed);
    await f.tool("v", "select"); await f.click({ x: 180, y: 155 });
    assert.deepEqual(await f.selected(), [rectangle.id]);
    await f.drag({ x: 180, y: 155 }, { x: 210, y: 175 });
    const moved = await f.node(rectangle.id);
    assert.ok(Math.abs(moved.x - rectangle.x - 30) <= 8 && Math.abs(moved.y - rectangle.y - 20) <= 8);
    rectangle = moved;
  });
  await f.step("inspector-duplicate-delete-and-keyboard-history", async () => {
    await edit("W", 190); assert.equal((await f.node(rectangle.id)).width, 190);
    await f.layer(rectangle.id); const before = await f.snapshot();
    await f.key("d"); await f.settle();
    const [copy] = await addedSince(before); assert.equal(copy.parentId, frame.id);
    const duplicated = await f.snapshot();
    await f.key("z"); await f.settle(); assert.deepEqual(await f.snapshot(), before);
    await f.key("Shift+z"); await f.settle(); assert.deepEqual(await f.snapshot(), duplicated);
    await page.keyboard.press("Backspace"); await f.settle(); assert.equal(await f.node(copy.id), null);
    await f.key("z"); await f.settle(); assert.deepEqual(await f.snapshot(), duplicated);
    await f.key("Shift+z"); await f.settle(); assert.equal(await f.node(copy.id), null);
  });
  await f.step("multi-select-group-move-and-ungroup", async () => {
    rectangle = await f.node(rectangle.id);
    await f.click({ x: rectangle.x + 40, y: rectangle.y + 30 });
    await page.keyboard.down("Shift"); await f.click({ x: ellipse.x + 35, y: ellipse.y + 35 }); await page.keyboard.up("Shift");
    assert.equal((await f.selected()).length, 2); const before = await f.snapshot();
    await f.key("g"); await f.settle();
    const [group] = await addedSince(before); assert.equal(group.kind, "group");
    assert.equal((await f.node(rectangle.id)).parentId, group.id);
    await f.drag({ x: rectangle.x + 40, y: rectangle.y + 30 }, { x: rectangle.x + 55, y: rectangle.y + 40 });
    assert.ok((await f.node(rectangle.id)).x > rectangle.x);
    await f.key("Shift+g"); await f.settle();
    assert.equal(await f.node(group.id), null); assert.equal((await f.node(rectangle.id)).parentId, frame.id);
  });
  await f.step("pen-creation-and-double-click-anchor-edit", async () => {
    const before = await f.snapshot();
    await page.getByTestId("editor-toolbar").getByRole("button", { name: "Pen", exact: true }).click();
    for (const point of [{ x: 480, y: 150 }, { x: 570, y: 150 }, { x: 570, y: 220 }, { x: 480, y: 150 }]) await f.click(point);
    await page.keyboard.press("Enter"); await f.settle(); [path] = await addedSince(before);
    assert.equal(path.kind, "path"); assert.equal(path.parentId, frame.id); assert.ok(path.points.length >= 3);
    await f.tool("v", "select"); await f.click({ x: 540, y: 175 }, { clickCount: 2 });
    assert.equal(await page.evaluate(() => window.__vooEditor.getEdit()?.nodeId), path.id);
    const original = await f.node(path.id);
    await f.drag({ x: 480, y: 150 }, { x: 490, y: 160 });
    assert.notDeepEqual((await f.node(path.id)).points, original.points);
    await page.keyboard.press("Escape"); await f.key("z"); await f.settle();
    assert.deepEqual((await f.node(path.id)).points, original.points);
  });
  await f.step("image-picker-resize-mask-and-release", async () => {
    await f.tool("o", "ellipse", true); const before = await f.snapshot();
    await f.drag({ x: 460, y: 330 }, { x: 580, y: 410 }); [mask] = await addedSince(before);
    await f.tool("v", "select");
    const bytes = await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 80; c.height = 60;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#0000ff"; ctx.fillRect(0, 0, 80, 60);
      return c.toDataURL().split(",")[1];
    });
    [image] = await f.pick({ name: "Creation.png", mimeType: "image/png", buffer: Buffer.from(bytes, "base64") }, { x: 520, y: 370 });
    assert.equal(image.parentId, frame.id);
    for (const [name, value] of [["W", 120], ["H", 80], ["X", 460], ["Y", 330]]) await edit(name, value);
    assert.equal(await f.pixel({ x: 470, y: 340 }), "#0000ff");
    await context({ x: 520, y: 370 }, "editor-menu-create-clip-mask");
    assert.equal((await f.node(image.id)).clipTo, mask.id);
    assert.equal(await f.pixel({ x: 520, y: 370 }), "#0000ff");
    assert.equal(await f.pixel({ x: 470, y: 340 }), "#ffffff");
    const clipped = await f.snapshot();
    await context({ x: 520, y: 370 }, "editor-menu-release-clip-mask");
    assert.equal((await f.node(image.id)).clipTo ?? null, null);
    assert.equal(await f.pixel({ x: 470, y: 340 }), "#0000ff");
    await f.layer(image.id); await f.key("z"); await f.settle(); assert.deepEqual(await f.snapshot(), clipped);
  });
  await f.step("move-populated-frame-and-pan-without-document-change", async () => {
    await f.layer(frame.id); const before = await f.snapshot();
    await f.drag({ x: 650, y: 450 }, { x: 670, y: 465 });
    const moved = await f.node(frame.id), dx = moved.x - frame.x, dy = moved.y - frame.y;
    assert.ok(dx > 0 && dy > 0);
    for (const node of before.nodes.filter(n => n.id !== before.nodes[0].id)) {
      const current = await f.node(node.id);
      assert.equal(current.x, node.x + dx); assert.equal(current.y, node.y + dy);
    }
    const after = await f.snapshot();
    await page.keyboard.down("Space"); await f.drag({ x: 800, y: 550 }, { x: 830, y: 570 }); await page.keyboard.up("Space");
    assert.deepEqual(await f.snapshot(), after);
  });
  await f.step("rapid-shortcuts-and-cancelled-frame-drawing", async () => {
    for (let round = 0; round < 3; round++) for (const [key, tool] of [["r", "rect"], ["o", "ellipse"], ["v", "select"]]) {
      await page.keyboard.press(key); await f.settle();
      assert.equal(await page.evaluate(() => window.__vooEditor.getTool()), tool);
    }
    const future = await f.snapshot(); await f.key("z"); await f.settle();
    const before = await f.snapshot();
    for (const [key, tool, radial] of [["f", "frame", false], ["r", "rect", true], ["o", "ellipse", true], ["t", "text", false]]) {
      await f.tool(key, tool, radial);
      const selection = await f.selected();
      const history = await page.evaluate(() => window.__vooEditor.getHistoryEntries());
      const a = await f.client({ x: 600, y: 260 }), b = await f.client({ x: 650, y: 310 });
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 });
      await page.keyboard.press("Escape"); await page.mouse.up(); await f.settle();
      assert.deepEqual(await f.snapshot(), before, `Escape must cancel ${tool} without publishing it`);
      assert.deepEqual(await f.selected(), selection);
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.getHistoryEntries()), history);
    }
    await f.key("Shift+z"); await f.settle(); assert.deepEqual(await f.snapshot(), future);
    await f.tool("v", "select");
  });
  await f.step("save-the-continuously-created-project", async () => {
    expected = projection((await f.snapshot()).nodes); frameId = frame.id; imageId = image.id;
    painted = await artwork(page, frame.id);
    const [download] = await Promise.all([page.waitForEvent("download"),
      page.getByRole("button", { name: "Export project as a portable .zip snapshot", exact: true }).click()]);
    archive = await readFile(await download.path()); assert.equal(archive.subarray(0, 2).toString(), "PK");
  });
  await f.finish();
}, { openDocument: false, mcpLink: false });

await withEditorBrowser(async ({ page }) => {
  const f = await creationSession(page, "creation-reopen");
  await f.step("cold-reopen-retains-created-text-paths-frames-and-mask", async () => {
    assert.ok(archive && expected);
    await page.evaluate(() => { delete window.showOpenFilePicker; });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /^Import project file/ }).click()]);
    await chooser.setFiles({ name: "ContinuousCreation.zip", mimeType: "application/zip", buffer: archive });
    await page.waitForFunction(id => window.__vooEditor?.getNode(id) && window.__vooEditor.getNodeBitmap(window.__vooEditor.getNode(id)), imageId);
    await f.settle(); assert.deepEqual(projection((await f.snapshot()).nodes), expected);
    assert.deepEqual(await artwork(page, frameId), painted);
    await f.layer(imageId); const before = await f.snapshot();
    await page.keyboard.press("ArrowRight"); await f.settle(); assert.notDeepEqual(await f.snapshot(), before);
    await f.key("z"); await f.settle(); assert.deepEqual(await f.snapshot(), before);
  });
  await f.finish();
}, { openDocument: false, mcpLink: false });
