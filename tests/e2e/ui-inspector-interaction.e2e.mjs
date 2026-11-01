import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { runInspectorControlCases } from "./inspector-control-cases.mjs";
import { runTypographyCases } from "./typography-inspector-cases.mjs";
import { runUnifiedFillCases } from "./unified-fill-picker-cases.mjs";

const evidence = process.env.VOO_INSPECTOR_EVIDENCE_DIR ?? "/private/tmp/voo-ui-inspector";
await mkdir(evidence, { recursive: true });

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const mark = (message) => { checks.push(message); console.log(message); };
  const panel = page.getByTestId("editor-properties-panel");
  const layers = page.getByTestId("editor-layers-panel");
  const row = (id) => layers.locator(`#layer-row-${id}`);
  const node = (id = "audit-rect") => page.evaluate((id) => window.__vooEditor.getNode(id === "audit-image" ? window.__auditImageId : id), id);
  const selected = () => page.evaluate(() => window.__vooEditor.getSelectedIds());
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const select = async (ids) => {
    await page.evaluate((ids) => window.__vooEditor.selectExactly(ids.map((id) => id === "audit-image" ? window.__auditImageId : id)), ids);
    await settle();
  };
  const seed = async () => {
    await page.evaluate(async () => {
      const { createRectNode, createTextNode, createGroupNode } = await import("/src/canvas/editor/scene_model.js");
      const editor = window.__vooEditor;
      editor.setDoc({ ...editor.getDocument(), width: 1000, height: 700, isCanvasRoot: true, crop: null, nodes: [
        { ...createGroupNode({ x: 40, y: 40, width: 700, height: 500 }), id: "audit-frame", name: "Audit Frame", isFrame: true, fill: "#ffffff" },
        { ...createRectNode({ x: 100, y: 100, width: 160, height: 120, fill: "#ff0000" }), id: "audit-rect", name: "Audit Rectangle", parentId: "audit-frame" },
        { ...createGroupNode({ x: 180, y: 300, width: 240, height: 100 }), id: "audit-nested", name: "Audit Nested Frame", isFrame: true, fill: "#eeeeee", parentId: "audit-frame" },
        { ...createRectNode({ x: 210, y: 330, width: 40, height: 30, fill: "#00ff00" }), id: "audit-nested-child", name: "Nested child", parentId: "audit-nested" },
        { ...createTextNode({ x: 300, y: 130, text: "Inspector audit", fontSize: 30, fill: "#000000" }), id: "audit-text", name: "Audit Text", parentId: "audit-frame" },
      ] });
      const image = document.createElement("canvas");
      image.width = 64; image.height = 48;
      const context = image.getContext("2d");
      context.fillStyle = "#00aaff"; context.fillRect(0, 0, 64, 48);
      await editor.insertImage(image.toDataURL(), { x: 480, y: 130, width: 64, height: 48 });
      const imageNode = editor.getDocument().nodes.at(-1);
      editor.updateNode(imageNode.id, { name: "Audit Image", parentId: "audit-frame" });
      window.__auditImageId = imageNode.id;
      editor.selectExactly(["audit-rect"]); editor.setTool("select"); editor.commitEditorDocument();
    });
    await panel.getByRole("button", { name: "Audit Rectangle", exact: true }).waitFor();
  };
  const inViewport = async (locator, label) => {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box && box.width > 0 && box.height > 0, `${label} must be visible`);
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
      `${label} outside ${viewport.width}x${viewport.height}: ${JSON.stringify(box)}`);
  };

  try {
    await seed();
    const exportFormat = panel.getByRole("button", { name: "Format", exact: true });
    const exportAction = panel.getByRole("button", { name: "Export", exact: true });
    const addExport = async () => {
      await panel.getByTestId("properties-add-menu").getByRole("button").first().click();
      await panel.getByTestId("properties-add-export").click();
    };
    for (const id of ["audit-rect", "audit-frame", "audit-text", "audit-image"]) {
      await select([id]);
      assert.equal(await exportFormat.count(), 0, `${id} must not invent an export preset`);
      assert.equal(await panel.getByRole("button", { name: "Add export settings", exact: true }).count(), 0, "the entire unconfigured export section is hidden");
      assert.equal(await exportAction.count(), 0);
    }
    await select(["audit-rect"]);
    await addExport();
    await exportFormat.waitFor();
    const configured = (await node()).exportPresets;
    assert.equal(configured.length, 1);
    assert.equal(await exportAction.count(), 1);
    await tool("undo"); await settle();
    assert.equal(await exportFormat.count(), 0, "undo adding export removes its controls");
    await tool("redo"); await exportFormat.waitFor();
    assert.deepEqual((await node()).exportPresets, configured);
    await select(["audit-text"]);
    assert.equal(await exportAction.count(), 0, "export configuration belongs to its layer");
    await select(["audit-rect"]); await exportFormat.waitFor();
    await panel.getByRole("button", { name: "Remove export settings", exact: true }).click();
    await settle();
    assert.deepEqual((await node()).exportPresets, []);
    assert.equal(await exportAction.count(), 0);
    await select(["audit-image"]); await select(["audit-rect"]);
    assert.equal(await exportFormat.count(), 0, "removing the last preset stays empty after reselection");
    await tool("undo"); await exportFormat.waitFor();
    await tool("redo"); await settle();
    assert.equal(await exportAction.count(), 0, "redo removing export hides it again");
    mark("export is opt-in for shapes, Frames, text and images; add/remove persist per layer and undo/redo immediately follow document state");

    const x = panel.getByRole("spinbutton", { name: "X", exact: true });
    await x.fill("150"); await x.press("Enter");
    assert.equal((await node()).x, 150);
    await x.fill("222"); await x.press("Escape");
    assert.equal((await node()).x, 150, "Escape must revert the live geometry preview");
    assert.equal(await x.inputValue(), "150");
    await tool("undo");
    assert.equal((await node()).x, 100, "one undo must skip the cancelled draft");
    const y = panel.getByRole("spinbutton", { name: "Y", exact: true });
    await y.fill("140"); await y.blur();
    assert.equal((await node()).y, 140);
    await tool("undo"); assert.equal((await node()).y, 100);
    mark("numeric Enter/blur commit one actual geometry edit; Escape restores the preview and preserves one-step undo");

    await panel.getByRole("button", { name: "Audit Rectangle", exact: true }).dblclick();
    const rename = panel.getByRole("textbox", { name: "Layer name", exact: true });
    await rename.fill("Discarded name"); await rename.press("Escape");
    assert.equal((await node()).name, "Audit Rectangle");
    await panel.getByRole("button", { name: "Audit Rectangle", exact: true }).dblclick();
    await rename.fill("Renamed rectangle"); await rename.press("Enter");
    assert.equal((await node()).name, "Renamed rectangle");
    await tool("undo"); assert.equal((await node()).name, "Audit Rectangle");
    mark("inspector layer-name Escape cancels; Enter updates the actual layer and undoes once");

    const fillType = panel.getByRole("button", { name: "Fill", exact: true });
    const fillDialog = page.getByRole("dialog", { name: "Fill", exact: true });
    await fillType.click(); await fillDialog.waitFor();
    assert.ok(await fillDialog.evaluate(element => parseFloat(getComputedStyle(element).borderRadius) >= 12), "the semantic fill dialog must be the rounded visual surface");
    await inViewport(fillDialog, "fill editor");
    await page.keyboard.press("Escape");
    await fillDialog.waitFor({ state: "detached" });
    assert.deepEqual(await selected(), ["audit-rect"], "closing the paint editor retains selection");
    await page.keyboard.press("Escape");
    assert.deepEqual(await selected(), [], "Escape after the editor closes still clears canvas selection");
    await select(["audit-rect"]);
    await fillType.focus(); await fillType.press("ArrowDown");
    await fillDialog.getByRole("tab", { name: "Solid", exact: true }).waitFor();
    await page.keyboard.press("ArrowRight");
    assert.match((await node()).fill, /linear-gradient/);
    await page.keyboard.press("Escape");
    await tool("undo"); assert.equal((await node()).fill, "#ff0000");
    await panel.getByRole("button", { name: "Fill visible", exact: true }).click();
    assert.equal((await node()).fills[0].visible, false);
    await tool("undo");
    const strokeWidth = panel.getByRole("spinbutton", { name: "Outline width", exact: true });
    await strokeWidth.fill("8"); await strokeWidth.press("Enter");
    assert.equal((await node()).strokeWidth, 8);
    await panel.getByRole("button", { name: "Inside", exact: true }).click();
    assert.equal((await node()).strokeAlign, "inside");
    await tool("undo"); await tool("undo");
    mark("fill menu keyboard selection/Escape, fill visibility and stroke width/alignment mutate actual paint state and undo");

    await panel.getByRole("button", { name: "Add effect", exact: true }).click();
    const picker = page.getByTestId("editor-adjustment-picker");
    await picker.waitFor(); await inViewport(picker, "effect picker");
    await picker.getByTestId("adjustment-picker-search").fill("Drop shadow");
    await picker.getByRole("button", { name: "Drop shadow", exact: true }).click();
    assert.ok((await node()).effects.shadow);
    await tool("undo"); assert.equal((await node()).effects?.shadow, undefined);
    await panel.getByRole("button", { name: "Add effect", exact: true }).click();
    await picker.waitFor(); await page.keyboard.press("Escape");
    await picker.waitFor({ state: "hidden" });
    assert.deepEqual(await selected(), ["audit-rect"]);
    mark("effect picker remains in viewport, creates a real shadow, undoes once, and Escape preserves selection");

    assert.equal(await panel.getByRole("button", { name: "Align right", exact: true }).count(), 0);
    await page.getByTestId("editor-taskbar-alignment-menu").click();
    await page.getByTestId("editor-taskbar-align-right").click();
    assert.equal((await node()).x, 580, "single-layer alignment uses its parent Frame bounds");
    await tool("undo"); assert.equal((await node()).x, 100);
    await select(["audit-frame"]);
    await page.getByTestId("editor-taskbar-alignment-menu").click();
    await page.getByTestId("editor-taskbar-align-left").click();
    assert.equal((await node("audit-frame")).x, 0, "root Frame alignment uses page bounds");
    assert.equal((await node()).x, 60, "Frame descendants follow the same alignment delta");
    await tool("undo"); assert.equal((await node("audit-frame")).x, 40);
    assert.equal((await node()).x, 100);
    await select(["audit-nested"]);
    await page.getByTestId("editor-taskbar-alignment-menu").click();
    await page.getByTestId("editor-taskbar-align-right").click();
    assert.equal((await node("audit-nested")).x, 500);
    assert.equal((await node("audit-nested-child")).x, 530);
    await tool("undo");
    assert.equal((await node("audit-nested")).x, 180);
    assert.equal((await node("audit-nested-child")).x, 210);
    await select(["audit-frame"]);
    mark("alignment has one grouped quickbar home; single child aligns to its parent and root Frame to the canvas, each undoing once");

    const width = panel.getByRole("spinbutton", { name: "W", exact: true });
    await width.fill("720"); await width.press("Enter");
    assert.equal((await node("audit-frame")).width, 720);
    await tool("undo"); assert.equal((await node("audit-frame")).width, 700);
    await page.evaluate(async () => {
      const { DEFAULT_AUTO_LAYOUT } = await import("/src/canvas/components/editor_properties/auto_layout_controls.js");
      window.__vooEditor.updateNode("audit-frame", { autoLayout: { ...DEFAULT_AUTO_LAYOUT, direction: "horizontal" } });
      window.__vooEditor.commitEditorDocument();
    });
    const advanced = panel.getByLabel("Auto layout settings", { exact: true });
    await advanced.click();
    const advancedBody = page.getByTestId("editor-auto-layout-advanced");
    await inViewport(advancedBody, "auto-layout advanced settings");
    await advancedBody.getByRole("button", { name: "Align", exact: true }).click();
    await page.getByRole("option", { name: "Stretch", exact: true }).click();
    assert.equal((await node("audit-frame")).autoLayout.alignItems, "stretch");
    const minWidth = advancedBody.getByRole("spinbutton", {name: "Min W", exact: true});
    await minWidth.fill("321");
    await minWidth.press("Escape");
    assert.notEqual((await node("audit-frame")).autoLayout.minWidth, 321);
    assert.equal(await advancedBody.count(), 1);
    await page.keyboard.press("Escape");
    assert.deepEqual(await selected(), ["audit-frame"]);
    mark("Frame dimensions edit/undo; Auto Layout advanced controls are reachable and stretch updates the engine");

    await seed();
    await select(["audit-text"]);
    assert.equal(await panel.getByRole("spinbutton", { name: /^Font size/ }).inputValue(), "30");
    const fontSize = panel.getByRole("spinbutton", { name: /^Font size/ });
    await fontSize.fill("45"); await fontSize.press("Enter");
    assert.equal((await node("audit-text")).fontSize, 45);
    await tool("undo"); assert.equal((await node("audit-text")).fontSize, 30);
    await select(["audit-image"]);
    await panel.getByText("Audit Image", { exact: true }).waitFor();
    await select(["audit-rect", "audit-nested-child"]);
    assert.equal(await panel.getByRole("button", { name: "Align left", exact: true }).count(), 0);
    assert.equal(await panel.getByRole("button", { name: "Group", exact: true }).count(), 0);
    await select([]);
    assert.equal(await panel.getByRole("spinbutton", { name: "X", exact: true }).count(), 0);
    mark("text/image/multi/no-selection inspector contexts switch without duplicate grouping/alignment quick actions");

    await row("audit-rect").getByText("Audit Rectangle", { exact: true }).click();
    assert.deepEqual(await selected(), ["audit-rect"]);
    await row("audit-rect").getByText("Audit Rectangle", { exact: true }).dblclick();
    const layerName = row("audit-rect").getByRole("textbox", { name: "Rename layer", exact: true });
    await layerName.fill("Discarded layer"); await layerName.press("Escape");
    assert.equal((await node()).name, "Audit Rectangle");
    await row("audit-rect").getByText("Audit Rectangle", { exact: true }).dblclick();
    await layerName.fill("Renamed layer"); await layerName.press("Enter");
    assert.equal((await node()).name, "Renamed layer");
    await tool("undo");
    await row("audit-rect").getByRole("button", { name: "Hide layer", exact: true }).click();
    assert.equal((await node()).visible, false);
    await tool("undo"); assert.equal((await node()).visible, true);
    await row("audit-rect").hover();
    await row("audit-rect").getByRole("button", { name: "Lock layer", exact: true }).click();
    assert.equal((await node()).locked, true);
    await tool("undo"); assert.equal(Boolean((await node()).locked), false);
    mark("Layers selection, rename cancel/commit, hide and lock alter real nodes and each undo once");

    await runTypographyCases({ page, tool, mark, evidence });
    // Typography creation replaces the document; restore this suite's scene.
    await seed();
    await runInspectorControlCases({ page, tool, mark, evidence });
    await seed();
    await runUnifiedFillCases({ page, tool, mark });

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
      await page.setViewportSize(viewport);
      for (const theme of ["dark", "light"]) {
        for (const locale of ["en", "zh"]) {
          await page.evaluate(async ({ theme, locale }) => {
            const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
            const { setLocale } = await import("/src/shared/i18n.js");
            setEditorTheme(theme); await setLocale(locale);
          }, { theme, locale });
          await select(["audit-rect"]); await settle();
          const toggle = panel.locator(".editor-mobile-panel-toggle");
          if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
          await inViewport(panel, `${viewport.width}/${theme}/${locale} inspector`);
          await inViewport(layers, `${viewport.width}/${theme}/${locale} layers`);
          const fill = panel.getByRole("button", { name: locale === "en" ? "Fill" : "填充", exact: true });
          await fill.click();
          await inViewport(page.getByRole("dialog", { name: locale === "en" ? "Fill" : "填充", exact: true }), `${viewport.width}/${theme}/${locale} fill editor`);
          await page.screenshot({ path: `${evidence}/${viewport.width}-${theme}-${locale}.png` });
          await page.keyboard.press("Escape");
          assert.deepEqual(await selected(), ["audit-rect"]);
        }
      }
    }
    mark("320/390/768/1440, light/dark and Chinese/English panels and fill editors remain on screen and retain selection after Escape");
    await writeFile(`${evidence}/result.json`, JSON.stringify({ passed: checks }, null, 2));
    console.log(JSON.stringify({ passed: checks, evidence }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `${evidence}/failure.png` });
    await writeFile(`${evidence}/result.json`, JSON.stringify({ passed: checks, error: String(error) }, null, 2));
    throw error;
  }
}, { hasTouch: true });
