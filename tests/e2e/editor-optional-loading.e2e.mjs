import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const requests = new Set(await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name)));
  page.on("request", request => requests.add(request.url()));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const selected = () => page.evaluate(() => window.__vooEditor.getSelectedIds());
  const nodeCount = () => page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  const point = (x, y) => page.evaluate(({ x, y }) => {
    const doc = window.__vooEditor.getDocument();
    const board = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    return { x: board.left + x * board.width / doc.width, y: board.top + y * board.height / doc.height };
  }, { x, y });
  const assertCanvasVisible = async ({ dimmed = false } = {}) => {
    assert.equal(await page.getByTestId("editor-pages").isVisible(), true);
    // Stay clear of the corner-radius controls and the cursor-anchored spinner.
    const sample = await point(335, 230);
    const png = await page.screenshot();
    const pixel = await page.evaluate(async ({ dataUrl, x, y }) => {
      const image = new Image(); image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data);
    }, { dataUrl: `data:image/png;base64,${png.toString("base64")}`, ...sample });
    // Screenshot colour conversion and the nearby popup shadow can round a
    // channel by one; a hidden or replaced canvas is far outside this bound.
    const expected = [234, 67, 53].map(channel => Math.round(channel * (dimmed ? 0.6 : 1)));
    assert.ok(pixel.slice(0, 3).every((channel, index) => Math.abs(channel - expected[index]) <= 2), `Pending UI must leave source pixels visible: ${pixel}`);
    assert.equal(pixel[3], 255);
  };
  const blockModule = async file => {
    const pattern = new RegExp(`/src/canvas/components/${file}\\.jsx(?:\\?|$)`);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(pattern, async route => { await gate; await route.continue(); });
    return {
      async release() {
        const responded = page.waitForResponse(response => pattern.test(response.url()) && response.ok());
        release();
        await responded;
        await page.unroute(pattern);
        await settle();
      },
      unblock: release,
    };
  };

  await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.isCanvasRoot);
  await page.waitForLoadState("networkidle");
  for (const module of ["editor_context_menu", "shortcut_reference_modal", "SvgEditModal", "editor_command_palette", "editor_find_replace"]) {
    assert.equal([...requests].some(url => url.includes(`/components/${module}.jsx`)), false, `${module} must not load before its first activation`);
  }
  checks.push("actual New loads the canvas without requesting closed context, shortcut, SVG, palette or find implementations");

  await page.evaluate(async () => {
    const e = window.__vooEditor;
    const { createGroupNode, createRectNode, createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    const frame = e.getDocument().nodes.find(node => node.isFrame);
    e.setDoc({ ...e.getDocument(), nodes: [
      ...e.getDocument().nodes,
      { ...createRectNode({ x: 300, y: 200, width: 120, height: 80, fill: "#ea4335" }), id: "optional-rect", parentId: frame.id },
      { ...createGroupNode({ x: 490, y: 210, width: 200, height: 160 }), id: "optional-text-group", parentId: frame.id },
      { ...createTextNode({ x: 500, y: 220, text: "Voo One", fontSize: 24, fill: "#ffffff" }), id: "optional-text-one", parentId: "optional-text-group" },
      { ...createTextNode({ x: 500, y: 290, text: "Voo Two", fontSize: 24, fill: "#ffffff" }), id: "optional-text-two", parentId: "optional-text-group" },
    ] });
    e.setTool("select"); e.selectExactly([]);
    useDesignStore.setState({ editorCamera: { zoom: 0.75, panX: 200, panY: 100 } });
  });
  await settle();
  const rectangle = await point(360, 240);
  await page.mouse.click(rectangle.x, rectangle.y);
  await page.waitForFunction(() => window.__vooEditor.getSelectedIds().join() === "optional-rect");
  await assertCanvasVisible();
  const originalCount = await nodeCount();
  const loading = page.getByTestId("editor-surface-loading");
  const context = await blockModule("editor_context_menu");
  try {
    await page.mouse.click(rectangle.x, rectangle.y, { button: "right" });
    await loading.waitFor();
    assert.equal(await loading.getAttribute("role"), "menu");
    await assertCanvasVisible();
    assert.deepEqual(await selected(), ["optional-rect"]);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")), "editor-surface-loading");
    assert.equal(await nodeCount(), originalCount);
    await page.keyboard.press("Escape");
    await loading.waitFor({ state: "hidden" });
    assert.deepEqual(await selected(), ["optional-rect"]);
    await page.mouse.click(rectangle.x, rectangle.y, { button: "right" });
    await loading.waitFor();
    const header = await page.getByTestId("editor-top-bar").boundingBox();
    await page.mouse.click(header.x + header.width / 2, header.y + 2);
    await loading.waitFor({ state: "hidden" });
    await context.release();
    assert.equal(await page.getByRole("menu").count(), 0);
    assert.deepEqual(await selected(), ["optional-rect"]);
    assert.equal(await nodeCount(), originalCount);
  } finally {
    context.unblock();
  }
  checks.push("blocked cold context import keeps the real canvas and selection; Escape and outside click cancel it without reappearing after load");

  await page.mouse.click(rectangle.x, rectangle.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Context menu", exact: true });
  await menu.waitFor();
  const items = menu.locator('[role="menuitem"]:not([disabled])');
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem");
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), await items.last().textContent());
  await page.keyboard.press("Home");
  assert.equal(await page.evaluate(() => document.activeElement.textContent), await items.first().textContent());
  const duplicateIndex = (await items.allTextContents()).findIndex(text => /^Duplicate\b/.test(text.trim()));
  assert.ok(duplicateIndex >= 0);
  for (let index = 0; index < duplicateIndex; index += 1) await page.keyboard.press("ArrowDown");
  assert.match(await page.evaluate(() => document.activeElement.textContent), /^Duplicate\b/);
  await page.keyboard.press("Enter");
  await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count, originalCount + 1);
  await menu.waitFor({ state: "hidden" });
  assert.notDeepEqual(await selected(), ["optional-rect"]);
  await page.keyboard.press("Control+z");
  await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count, originalCount);
  assert.deepEqual(await selected(), ["optional-rect"]);
  checks.push("loaded context menu supports Home/End/Arrow navigation and keyboard Duplicate with one-step undo on the real engine");

  const find = await blockModule("editor_find_replace");
  try {
    await page.keyboard.press("Control+f");
    await loading.waitFor();
    assert.equal(await loading.getAttribute("role"), "dialog");
    await assertCanvasVisible({ dimmed: true });
    await find.release();
  } finally {
    find.unblock();
  }
  const bar = page.getByTestId("find-replace-bar");
  await bar.waitFor();
  await bar.getByRole("textbox", { name: "Find text", exact: true }).fill("Voo");
  await page.waitForFunction(() => window.__vooEditor.getSelected()?.id === "optional-text-one");
  await bar.getByRole("textbox", { name: "Find text", exact: true }).press("Enter");
  await page.waitForFunction(() => window.__vooEditor.getSelectedIds().join() === "optional-text-two");
  await bar.getByRole("textbox", { name: "Find text", exact: true }).press("Shift+Enter");
  await page.waitForFunction(() => window.__vooEditor.getSelectedIds().join() === "optional-text-one");
  await bar.getByRole("textbox", { name: "Replace with", exact: true }).fill("Canvas");
  await bar.getByRole("button", { name: "Replace all", exact: true }).click();
  const texts = () => page.evaluate(() => window.__vooEditor.getDocument().nodes.filter(node => node.kind === "text").map(node => node.text));
  assert.deepEqual(await texts(), ["Canvas One", "Canvas Two"]);
  await bar.getByRole("button", { name: "Close", exact: true }).click();
  await bar.waitFor({ state: "hidden" });
  const rectangleAfterFind = await point(360, 240);
  await page.mouse.click(rectangleAfterFind.x, rectangleAfterFind.y);
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => window.__vooEditor.getNode("optional-text-one").text === "Voo One");
  assert.deepEqual(await texts(), ["Voo One", "Voo Two"]);
  await page.keyboard.press("Control+f");
  await bar.waitFor();
  assert.equal(await bar.getByRole("textbox", { name: "Find text", exact: true }).inputValue(), "Voo");
  assert.equal(await bar.getByRole("textbox", { name: "Replace with", exact: true }).inputValue(), "Canvas");
  await bar.getByRole("button", { name: "Close", exact: true }).click();
  await bar.waitFor({ state: "hidden" });
  checks.push("cold Find selects each matched text inside an ordinary Group, replaces both in one undoable operation and retains query/replacement after close and reopen");

  const palette = await blockModule("editor_command_palette");
  try {
    const paletteOrigin = await point(360, 240);
    await page.mouse.click(paletteOrigin.x, paletteOrigin.y);
    await page.waitForFunction(() => window.__vooEditor.getSelectedIds().join() === "optional-rect");
    await page.keyboard.press("Control+k");
    await loading.waitFor();
    await page.keyboard.press("Escape");
    await loading.waitFor({ state: "hidden" });
    await palette.release();
    assert.equal(await page.getByTestId("command-palette").count(), 0);
    assert.equal(await nodeCount(), originalCount);
  } finally {
    palette.unblock();
  }
  await page.keyboard.press("Control+k");
  await page.getByTestId("command-palette").waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('[data-testid="command-palette"] input'));
  await page.keyboard.press("Escape");
  await page.getByTestId("command-palette").waitFor({ state: "hidden" });
  assert.deepEqual(await selected(), ["optional-rect"]);
  checks.push("cold palette loading can be dismissed with Escape and stays closed on arrival, then opens normally without altering the document");
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { openDocument: false });
