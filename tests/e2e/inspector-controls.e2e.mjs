import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool, errors }) => {
  const checks = [];
  const mount = async (kind, id) => {
    await page.evaluate(async ({ kind, id }) => {
      const { mountAuditPanel } = await import("/tests/e2e/inspector-audit-panel.mjs");
      mountAuditPanel(kind, id);
    }, { kind, id });
    await page.locator("#inspector-audit-host > *").waitFor({ timeout: 5000 }).catch(async (error) => {
      throw new Error(`${kind}/${id} errors=${errors.join(";")}: ${await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument().nodes.map(({id, kind}) => ({id, kind}))))}: ${error.message}`);
    });
  };
  const options = () => page.locator('[role="listbox"]:visible').last().getByRole("option");
  const host = page.locator("#inspector-audit-host");
  const sample = (x, y) => page.evaluate(async ({ x, y }) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return window.__vooEditor.sampleColorAt({ x, y });
  }, { x, y });
  const seedImage = () => page.evaluate(async () => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff", nodes: [] });
    const c = document.createElement("canvas"); c.width = 100; c.height = 100;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 50, 100);
    ctx.fillStyle = "#0000ff"; ctx.fillRect(50, 0, 50, 100);
    const image = await e.insertImage(c.toDataURL(), { x: 150, y: 150 });
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 100 } });
    return image.id;
  });
  let id = await seedImage();
  await mount("colour", id);
  await host.getByTestId("picker-blend-mode").click();
  const modes = await page.evaluate(async () => (await import("/src/canvas/editor/scene_model.js")).BLEND_MODES);
  assert.equal(await options().count(), modes.length);
  await options().filter({ hasText: /^multiply$/ }).click();
  assert.equal(await page.evaluate((id) => window.__vooEditor.getNode(id).blendMode, id), "multiply");
  await host.getByTestId("colour-model-select").click();
  assert.deepEqual(await options().allTextContents(), ["RGB", "HEX", "CSS", "HSL", "HSB"]);
  await options().filter({ hasText: /^HSL$/ }).click();
  assert.equal(await host.locator('input[type="number"]').count(), 3);
  checks.push("colour picker opens every blend/model option and changes the bound layer");

  await page.evaluate(async () => {
    const { createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [{ ...createTextNode({ x: 100, y: 100, text: "Menu audit", fontSize: 24, fill: "#000000" }), id: "text" }] });
  });
  await mount("text", "text");
  await host.getByRole("button", { name: /Font weight/i, exact: true }).click();
  const weights = await options().allTextContents();
  assert.equal(weights.length, 9);
  assert.equal(new Set(weights).size, weights.length);
  assert.equal(weights.filter((value) => value === "Regular").length, 1);
  await options().filter({ hasText: /^Bold$/ }).click();
  assert.equal(String(await page.evaluate(() => window.__vooEditor.getNode("text").fontWeight)), "700");
  checks.push("font weight menu has unique faces and selecting Bold reaches the real engine");

  await page.evaluate(() => {
    const e = window.__vooEditor;
    const source = { canvasId: "small", width: 100, height: 100, variantGroupId: "sizes", variantName: "Size=Small, State=Idle", nodes: [] };
    e.setDoc({ ...e.getDocument(), components: { small: source, large: { ...source, canvasId: "large", variantName: "Size=Large, State=Idle" } },
      nodes: [{ id: "instance", kind: "canvasInstance", sourceCanvasId: "small", x: 100, y: 100, width: 100, height: 100, scaleX: 1, scaleY: 1 }] });
  });
  await mount("variants", "instance");
  await host.getByRole("button", { name: "Size", exact: true }).click();
  assert.deepEqual(await options().allTextContents(), ["Small", "Large"]);
  await options().filter({ hasText: /^Large$/ }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("instance").sourceCanvasId), "large");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("instance").sourceCanvasId), "small");
  checks.push("variant menu switches the actual component reference and undoes once");

  id = await seedImage();
  await page.evaluate(async (id) => {
    const { createLiveFilterEntry } = await import("/src/canvas/editor/live_filter_stack.js");
    window.__vooEditor.updateNode(id, { adjustments: { liveFilters: [createLiveFilterEntry("blur", { value: 12 })] } });
  }, id);
  await mount("filters", id);
  await page.waitForFunction(() => window.__vooEditor.sampleColorAt({ x: 149, y: 150 }) !== null);
  const blurred = await sample(149, 150);
  await host.getByTestId("live-filter-toggle-blur").click();
  assert.equal(await sample(149, 150), "#ff0000");
  assert.notEqual(blurred, "#ff0000");
  await tool("undo");
  assert.equal(await sample(149, 150), blurred);
  const opacity = host.getByRole("spinbutton", {name:"Opacity",exact:true});
  await opacity.fill("0"); await opacity.press("Enter");
  assert.equal(await sample(149, 150), "#ff0000");
  await opacity.fill("100"); await opacity.press("Enter");
  assert.equal(await sample(149, 150), blurred);
  await host.getByTestId("live-filter-remove-blur").click();
  assert.equal(await sample(149, 150), "#ff0000");
  checks.push("Live Filter toggle/opacity/remove changes pixels and one undo restores the filtered image");

  id = await seedImage();
  await page.evaluate(async (id) => {
    const e = window.__vooEditor;
    const { createLiveFilterEntry } = await import("/src/canvas/editor/live_filter_stack.js");
    e.updateNode(id, { adjustments: { liveFilters: [createLiveFilterEntry("sepia", { value: 100 })] } });
    e.setPixelSelection({ nodeId: id, contours: [[[100, 100], [150, 100], [150, 200], [100, 200]]] });
  }, id);
  await mount("filters", id);
  const filteredRight = await sample(175, 150);
  assert.notEqual(filteredRight, "#0000ff");
  await host.getByTestId("live-filter-mask-sepia").click();
  assert.equal(await sample(175, 150), "#0000ff");
  assert.notEqual(await sample(125, 150), "#ff0000");
  assert.deepEqual(await page.evaluate((id) => window.__vooEditor.getNode(id).adjustments.liveFilters[0].mask, id),
    { contours: [[[0, 0], [0.5, 0], [0.5, 1], [0, 1]]] });
  await tool("undo");
  assert.equal(await sample(175, 150), filteredRight);
  checks.push("per-filter selection mask limits rendered pixels to its own region and undoes once");
  await page.evaluate(() => window.__vooEditor.setPixelSelection(null));

  const adjustmentId = await page.evaluate(async () => {
    const node = await window.__vooEditor.addAdjustmentLayer("brightness");
    return node.id;
  });
  await mount("adjustment", adjustmentId);
  const brightnessBefore = await sample(175, 150);
  const input = host.getByRole("spinbutton", { name: "Brightness", exact: true });
  await input.fill("40"); await input.press("Enter");
  assert.notEqual(await sample(175, 150), brightnessBefore);
  await host.getByRole("checkbox", { name: "Brightness", exact: true }).click();
  assert.equal(await page.evaluate((id) => window.__vooEditor.getNode(id).adjustments?.brightness?.enabled, adjustmentId), false, "Brightness toggle must persist disabled state");
  assert.equal(await sample(175, 150), brightnessBefore);
  checks.push("adjustment inspector brightness field and enable switch change actual composite pixels");
  await host.locator('input[type="checkbox"]').first().click();
  const paired = await page.evaluate((id) => window.__vooEditor.getNode(id).adjustments, adjustmentId);
  assert.equal(paired.brightness.enabled, true, "Header must enable brightness together with contrast");
  assert.equal(paired.contrast.enabled, true);
  await host.locator('input[type="checkbox"]').first().click();
  const disabledPair = await page.evaluate((id) => window.__vooEditor.getNode(id).adjustments, adjustmentId);
  assert.equal(disabledPair.brightness.enabled, false);
  assert.equal(disabledPair.contrast.enabled, false);
  await tool("undo");
  const restoredPair = await page.evaluate((id) => window.__vooEditor.getNode(id).adjustments, adjustmentId);
  assert.equal(restoredPair.brightness.enabled, true);
  assert.equal(restoredPair.contrast.enabled, true);
  checks.push("adjustment header switches both paired parameters atomically with one undo");

  id = await seedImage();
  await page.evaluate(async (id) => {
    const e = window.__vooEditor; await e.createEmptyMask(id); e.beginMaskEdit(id); e.setMaskBrushSize(25);
    e.beginMaskStroke(); e.paintMaskStroke({ x: 125, y: 150 }); e.paintMaskStroke({ x: 130, y: 150 });
    e.finishMaskStroke(); await e.flushMasks();
  }, id);
  assert.equal(await sample(125, 150), "#ffffff");
  await mount("mask", id);
  await host.getByRole("button", { name: /Restore/i, exact: true }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getMaskEdit().mode), "restore");
  await page.evaluate(async () => {
    const e = window.__vooEditor; e.beginMaskStroke(); e.paintMaskStroke({ x: 125, y: 150 });
    e.paintMaskStroke({ x: 130, y: 150 }); e.finishMaskStroke(); await e.flushMasks();
  });
  assert.equal(await sample(125, 150), "#ff0000");
  await host.getByRole("button", { name: /^Invert$/i, exact: true }).click();
  await page.evaluate(() => window.__vooEditor.flushMasks());
  assert.equal(await sample(125, 150), "#ffffff");
  checks.push("raster mask erase/restore and inspector invert change alpha in actual image pixels");
  await page.evaluate(() => window.__vooEditor.endMaskEdit());

  await mount("export", id);
  await host.getByRole("button", { name: "Export scale", exact: true }).click();
  await options().filter({ hasText: /^2x$/ }).click();
  const downloadReady = page.waitForEvent("download");
  await host.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadReady;
  assert.match(download.suggestedFilename(), /@2x\.png$/);
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const png = await readFile(path);
  assert.equal(png.readUInt32BE(16), 200);
  assert.equal(png.readUInt32BE(20), 200);
  checks.push("export preset creates a real downloadable PNG with exact 2x dimensions");
  for (const [format, signature] of [["JPEG", "ffd8"], ["WebP", "5249"]]) {
    await host.getByRole("button", {name:"Format",exact:true}).click();
    await options().filter({hasText:new RegExp(`^${format}$`)}).click();
    await host.getByRole("button", {name:"Quality",exact:true}).click();
    await options().filter({hasText:/^Low$/}).click();
    const ready = page.waitForEvent("download");
    await host.getByRole("button", {name:"Export",exact:true}).click();
    const result = await ready;
    const bytes = await readFile(await result.path());
    assert.equal(bytes.subarray(0,2).toString("hex"), signature);
    assert.equal(await page.evaluate((id) => window.__vooEditor.getNode(id).exportPresets[0].quality,id), "0.6");
    checks.push(`${format}: inspector format/quality produces matching downloadable file bytes`);
  }
  // Exercise the full inspector's add entry, not the isolated audit mount.
  await page.evaluate(async () => {
    window.__auditPanelRoot.unmount(); document.getElementById("inspector-audit-host").remove();
    const e = window.__vooEditor;
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    e.setDoc({ ...e.getDocument(), colorVariables: [], variablesV2: undefined,
      nodes: [{ ...createRectNode({ x: 100, y: 100, width: 100, height: 100, fill: "#ff0000" }), id: "variable-manager-target" }] });
    e.selectExactly(["variable-manager-target"]);
  });
  await page.getByTestId("properties-add-menu").last().getByRole("button").first().click();
  await page.getByTestId("properties-add-variables").click();
  await page.getByTestId("editor-variables-manage").click();
  const variables = page.getByTestId("editor-variables-panel");
  await variables.getByRole("button", { name: "Add collection", exact: true }).click();
  await variables.getByRole("textbox", { name: "Collection name", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().variablesV2.collections.length), 1);
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().variablesV2), undefined);
  assert.equal(await variables.count(), 1);
  await tool("redo");
  await variables.getByRole("textbox", { name: "Collection name", exact: true }).waitFor();
  assert.equal(await variables.count(), 1);
  checks.push("actual variables manager stays open after the first collection and one undo restores the unseeded document");
  const collectionName = variables.getByRole("textbox", { name: "Collection name", exact: true });
  await collectionName.fill("First collection"); await collectionName.press("Enter");
  await variables.getByRole("button", { name: "Add mode", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().variablesV2.collections[0].modes.length), 2);
  await variables.getByRole("button", { name: "Close variables", exact: true }).click();
  await page.getByTestId("editor-variables-manage").click();
  assert.equal(await variables.getByRole("textbox", { name: "Collection name", exact: true }).inputValue(), "First collection");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().variablesV2.collections[0].modes.length), 1);
  assert.equal(await variables.count(), 1);
  checks.push("variables manager accepts later edits, keeps them after reopening and preserves one-step mode undo");
  await variables.getByRole("button", { name: "Close variables", exact: true }).click();
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const nodes = [100, 260].map((x, index) => {
      const node = createRectNode({ x, y: 100, width: 100, height: 80 });
      node.id = `sparse-transform-${index}`;
      // Older document nodes omit optional transforms; the renderer uses zero.
      delete node.rotation;
      delete node.shear;
      return node;
    });
    e.setDoc({ ...e.getDocument(), nodes });
    e.selectExactly(nodes.map((node) => node.id));
  });
  await page.getByTestId("editor-properties-panel").getByText("2 selected", { exact: true }).waitFor();
  const rotation = page.getByRole("spinbutton", { name: "Rotation", exact: true });
  await rotation.waitFor();
  assert.equal(await rotation.inputValue(), "0");
  await rotation.fill("30");
  await rotation.press("Enter");
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes.map((node) => node.rotation)), [30, 30]);
  await tool("undo");
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes.map((node) => node.rotation ?? 0)), [0, 0]);
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-properties-panel"] input[aria-label="Rotation"]')?.value === "0");
  assert.equal(await rotation.inputValue(), "0");
  checks.push("sparse multi-selection shows effective zero rotation, edits both nodes and restores both with one undo");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
