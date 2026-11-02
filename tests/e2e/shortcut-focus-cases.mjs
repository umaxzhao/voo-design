import assert from "node:assert/strict";

/** Actual editor controls, camera and text overlay, separate from OS IME evidence. */
export async function runShortcutFocusCases({ page }) {
  const checks = [];
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    const { createRectNode, createTextNode } =
      await import("/src/canvas/editor/scene_model.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    e.setDoc({
      ...e.getDocument(),
      width: 600,
      height: 400,
      isCanvasRoot: true,
      nodes: [
        {
          ...createRectNode({
            x: 60,
            y: 60,
            width: 120,
            height: 80,
            fill: "#ff0000",
          }),
          id: "focus-shape",
        },
        {
          ...createRectNode({
            x: 240,
            y: 60,
            width: 120,
            height: 80,
            fill: "#0000ff",
          }),
          id: "focus-other",
        },
        {
          ...createTextNode({
            x: 60,
            y: 200,
            text: "Before IME",
            fontSize: 24,
            fill: "#000000",
          }),
          id: "focus-text",
          name: "Focus text",
        },
      ],
    });
    e.selectExactly(["focus-shape"]);
    useDesignStore.setState({
      editorCamera: { zoom: 1, panX: 300, panY: 150 },
      pendingArtboardFitId: null,
    });
  });
  await settle();
  const panel = page.getByTestId("editor-properties-panel");
  const original = await page.evaluate(() =>
    window.__vooEditor.getNode("focus-shape"),
  );
  const blend = panel.getByRole("button", { name: "Blend mode", exact: true });
  await blend.click();
  const list = page.getByRole("listbox", { name: "Blend mode", exact: true });
  await list.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await list.count(), 0);
  assert.equal(
    await blend.evaluate((el) => document.activeElement === el),
    true,
  );
  assert.deepEqual(
    await page.evaluate(() => window.__vooEditor.getSelectedIds()),
    ["focus-shape"],
  );
  checks.push(
    "Escape closes the top dropdown and restores its trigger without clearing canvas selection",
  );
  await panel.getByRole("button", { name: "Fill", exact: true }).click();
  const paint = page.getByRole("dialog", { name: "Fill", exact: true });
  await paint.getByTestId("picker-blend-mode").click();
  await page.getByRole("listbox").last().waitFor();
  await page.keyboard.press("Escape");
  await settle();
  assert.equal(await paint.count(), 1);
  assert.equal(
    await page.getByRole("listbox").count(),
    1,
    "Only the persistent Layers listbox remains",
  );
  await page.keyboard.press("Escape");
  await settle();
  assert.equal(await paint.count(), 0);
  assert.deepEqual(
    await page.evaluate(() => window.__vooEditor.getSelectedIds()),
    ["focus-shape"],
  );
  checks.push(
    "nested paint menu Escape unwinds the menu before the paint dialog and preserves artwork selection",
  );

  const x = panel.getByLabel("X", { exact: true });
  await x.fill("85");
  await x.press("Escape");
  await settle();
  assert.equal(await x.inputValue(), String(original.x));
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-shape").x),
    original.x,
  );
  await x.fill("90");
  await x.press("Enter");
  await settle();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await settle();
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-shape").x),
    original.x,
  );
  await page.keyboard.press("Control+Shift+z");
  await settle();
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-shape").x),
    90,
  );
  checks.push(
    "numeric Escape cancels; Enter then one keyboard Undo/Redo restores exact geometry",
  );
  await page.keyboard.press("Meta+z");
  await settle();
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-shape").x),
    original.x,
  );
  await page.keyboard.press("Meta+Shift+z");
  await settle();
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-shape").x),
    90,
  );

  await page.evaluate(() => {
    window.__vooEditor.setTool("brush");
    window.__vooEditor.setBrushWidth(12);
  });
  await settle();
  await page.keyboard.press("]");
  const brushWidth = await page.evaluate(() =>
    window.__vooEditor.getBrushWidth(),
  );
  assert.ok(brushWidth > 12);
  await page.keyboard.press("Control+]");
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getBrushWidth()),
    brushWidth,
  );
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getDocument().nodes.at(-1).id),
    "focus-shape",
  );
  await page.keyboard.press("Control+z");
  assert.notEqual(
    await page.evaluate(() => window.__vooEditor.getDocument().nodes.at(-1).id),
    "focus-shape",
  );
  checks.push(
    "bare bracket sizes the image brush; modified bracket orders layers with one undo and leaves brush size intact",
  );

  await page.evaluate(() => window.__vooEditor.setTool("select"));
  await settle();
  const camera = () =>
    page.evaluate(
      async () =>
        (await import("/src/store/design_store.js")).useDesignStore.getState()
          .editorCamera,
    );
  const beforePan = await camera();
  const doc = await page.evaluate(() =>
    JSON.stringify(window.__vooEditor.getDocument().nodes),
  );
  await page.evaluate(() => document.activeElement?.blur());
  const at = await page
    .locator("[data-editor-artboard]")
    .first()
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + 470, y: rect.top + 300 };
    });
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await settle();
  const afterPan = await camera();
  assert.equal(afterPan.panX, beforePan.panX + 40);
  assert.equal(afterPan.panY, beforePan.panY + 30);
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify(window.__vooEditor.getDocument().nodes),
    ),
    doc,
  );
  checks.push(
    "real Space-drag pans the shared canvas by the pointer delta without changing document geometry",
  );

  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly(["focus-text"]);
    e.beginTextEdit("focus-text");
  });
  const text = page.getByRole("textbox", { name: "Focus text", exact: true });
  await text.waitFor();
  await text.dispatchEvent("compositionstart", { data: "中" });
  await text.dispatchEvent("keydown", {
    key: "Escape",
    code: "Escape",
    isComposing: false,
  });
  await settle();
  assert.equal(
    await text.count(),
    1,
    "Composition session owns candidate Escape even when isComposing is missing",
  );
  await text.dispatchEvent("compositionend", { data: "中文" });
  await text.fill("");
  await page.keyboard.insertText("中文候选");
  await page.keyboard.press("Escape");
  await settle();
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-text").text),
    "中文候选",
  );
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await settle();
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-text").text),
    "Before IME",
  );
  await page.keyboard.press("Control+Shift+z");
  await settle();
  assert.equal(
    await page.evaluate(() => window.__vooEditor.getNode("focus-text").text),
    "中文候选",
  );
  checks.push(
    "synthetic composition session preserves the real textarea; browser insertText then one Undo/Redo restores Unicode text (not a physical OS IME test)",
  );
  console.log(
    JSON.stringify({ shortcutFocus: checks, physicalIme: "not-run" }, null, 2),
  );
}
