import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

const checks = [];

console.log("=== T02 Uncovered Scope: Non-Empty Styles/Modifiers, Bound Variable Canvas Sync, Real Export Undo, and Cold Reopen ===");

let savedProjectVooBytes = null;

// ============================================================================
// Phase 1: Live Editor Session
// - Non-empty Styles operations (active style display, rename, detach, undo)
// - Non-empty Modifiers operations (stack, toggle, count/step edit, remove, undo)
// - Color variable bound to object: edit value propagates to rendered canvas pixels, undo restores
// - Real export: downloadable PNG, followed by one Undo restoring pre-export state
// - Document serialization for cold reopen
// ============================================================================
await withEditorBrowser(async ({ page, tool, errors }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;

    const styledRect = {
      ...createRectNode({ x: 50, y: 50, width: 120, height: 80, fill: "#ff0000" }),
      id: "styled-rect",
      name: "StyledRectangle",
      styleIds: { paintId: "style-crimson" },
    };

    const modRect = {
      ...createRectNode({ x: 220, y: 50, width: 120, height: 80, fill: "#2563eb" }),
      id: "mod-rect",
      name: "ModifiedRectangle",
    };

    const varRect = {
      ...createRectNode({ x: 390, y: 50, width: 120, height: 80, fill: "#ff0000" }),
      id: "var-rect",
      name: "VariableRectangle",
      fillVariableId: "var-primary",
    };

    e.setDoc({
      ...e.getDocument(),
      width: 1200,
      height: 800,
      isCanvasRoot: false,
      backgroundColor: "#ffffff",
      styles: {
        paint: [{ id: "style-crimson", name: "Crimson Red", value: { fill: "#ff0000" } }],
        text: [],
        effect: [],
      },
      modifiers: [
        {
          id: "mod-linear-1",
          targetId: "mod-rect",
          type: "linearArray",
          count: 3,
          step: { x: 50, y: 0, z: 0 },
          enabled: true,
        },
      ],
      colorVariables: [{ id: "var-primary", name: "Brand Primary", value: "#ff0000" }],
      variablesV2: undefined,
      nodes: [styledRect, modRect, varRect],
    });

    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 400, panY: 200 } });
  });

  const panel = page.getByTestId("editor-properties-panel");
  const undo = async () => {
    await tool("undo");
    await settlePanels(page);
  };
  const redo = async () => {
    await page.keyboard.press("ControlOrMeta+Shift+Z");
    await settlePanels(page);
  };

  // --------------------------------------------------------------------------
  // [1] Non-empty Styles Section Verification & Operations
  // --------------------------------------------------------------------------
  await page.evaluate(() => window.__vooEditor.selectExactly(["styled-rect"]));
  await settlePanels(page);

  const styleSection = panel.getByTestId("editor-style-section");
  await styleSection.waitFor({ state: "visible" });
  assert.equal(await styleSection.count(), 1, "Non-empty styles section must be visible when styleIds exist");

  // Verify the paint dropdown shows the applied style
  const paintSelect = panel.getByTestId("editor-style-paint");
  await paintSelect.waitFor({ state: "visible" });

  // Active style rename input is present for the bound style
  const renameInput = styleSection.locator('input[type="text"]').first();
  await renameInput.waitFor({ state: "visible" });
  assert.equal(await renameInput.inputValue(), "Crimson Red");

  // Rename style: Crimson Red -> Ruby Velvet
  await renameInput.fill("Ruby Velvet");
  await renameInput.press("Tab");
  await settlePanels(page);

  let docStyles = await page.evaluate(() => window.__vooEditor.getDocument().styles?.paint ?? []);
  assert.equal(docStyles[0]?.name, "Ruby Velvet", "Style rename must update doc.styles.paint");

  // Undo restores Crimson Red
  await undo();
  docStyles = await page.evaluate(() => window.__vooEditor.getDocument().styles?.paint ?? []);
  assert.equal(docStyles[0]?.name, "Crimson Red", "Undo must restore original style name");

  // Detach style via the detach icon button
  const detachBtn = styleSection.getByRole("button", { name: "Detach style", exact: true });
  await detachBtn.click();
  await settlePanels(page);

  let styledNode = await page.evaluate(() => window.__vooEditor.getNode("styled-rect"));
  assert.equal(styledNode.styleIds?.paintId ?? null, null, "Detaching style must clear paintId binding");

  // Undo restores the style binding
  await undo();
  styledNode = await page.evaluate(() => window.__vooEditor.getNode("styled-rect"));
  assert.equal(styledNode.styleIds?.paintId, "style-crimson", "Undo must restore detached style binding");

  checks.push("non-empty Styles section displays bound style, supports rename with undo, and detach with undo");

  // --------------------------------------------------------------------------
  // [2] Non-empty Modifiers Section Verification & Operations
  // --------------------------------------------------------------------------
  await page.evaluate(() => window.__vooEditor.selectExactly(["mod-rect"]));
  await settlePanels(page);

  const modSection = panel.getByTestId("editor-modifiers-section");
  await modSection.waitFor({ state: "visible" });
  assert.equal(await modSection.count(), 1, "Non-empty modifiers section must be visible when modifiers exist");

  const modStack = panel.getByTestId("editor-modifiers-stack");
  await modStack.waitFor({ state: "visible" });

  // Check modifier row and toggle
  const modRow = panel.getByTestId("editor-modifier-row");
  await modRow.waitFor({ state: "visible" });
  assert.ok((await modRow.textContent()).includes("Linear"), "Modifier row must display Linear title");

  // Toggle modifier visibility / enabled state
  const modToggle = panel.getByTestId("editor-modifier-toggle");
  await modToggle.click();
  await settlePanels(page);

  let docModifiers = await page.evaluate(() => window.__vooEditor.getDocument().modifiers ?? []);
  assert.equal(docModifiers[0]?.enabled, false, "Toggle must disable modifier");

  await undo();
  docModifiers = await page.evaluate(() => window.__vooEditor.getDocument().modifiers ?? []);
  assert.equal(docModifiers[0]?.enabled, true, "Undo must re-enable modifier");

  // Count input inspection and edit
  const countInput = panel.getByTestId("editor-linear-array-count");
  await countInput.waitFor({ state: "visible" });
  assert.equal(await countInput.inputValue(), "3");

  await countInput.fill("5");
  await countInput.press("Tab");
  await settlePanels(page);

  docModifiers = await page.evaluate(() => window.__vooEditor.getDocument().modifiers ?? []);
  assert.equal(docModifiers[0]?.count, 5, "Count edit must persist in doc.modifiers");

  await undo();
  docModifiers = await page.evaluate(() => window.__vooEditor.getDocument().modifiers ?? []);
  assert.equal(docModifiers[0]?.count, 3, "Undo must restore count to 3");

  // Step X input inspection and edit
  const stepXInput = panel.getByTestId("editor-linear-array-step-x");
  await stepXInput.waitFor({ state: "visible" });
  assert.equal(await stepXInput.inputValue(), "50");

  await stepXInput.fill("75");
  await stepXInput.press("Tab");
  await settlePanels(page);

  docModifiers = await page.evaluate(() => window.__vooEditor.getDocument().modifiers ?? []);
  assert.equal(docModifiers[0]?.step?.x, 75, "Step X edit must persist in doc.modifiers");

  await undo();
  docModifiers = await page.evaluate(() => window.__vooEditor.getDocument().modifiers ?? []);
  assert.equal(docModifiers[0]?.step?.x, 50, "Undo must restore step X to 50");

  checks.push("non-empty Modifiers section displays stack controls, toggles enabled with undo, and edits count/step with undo");

  // --------------------------------------------------------------------------
  // [3] Color Variable Truly Bound to Object: Value Edit Updates Canvas Pixels
  // --------------------------------------------------------------------------
  await page.evaluate(() => window.__vooEditor.selectExactly(["var-rect"]));
  await settlePanels(page);

  // Initial pixel color sample at var-rect center: (390 + 60, 50 + 40) = (450, 90)
  const initialPixel = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__vooEditor.sampleColorAt({ x: 450, y: 90 });
  });
  assert.equal(initialPixel, "#ff0000", `Initial canvas pixel at bound variable node must be #ff0000 (got ${initialPixel})`);

  // Edit the bound variable value via the Variable value input in the inspector
  const varValueInput = panel.getByRole("textbox", { name: "Variable value", exact: true });
  await varValueInput.waitFor({ state: "visible" });
  await varValueInput.fill("#00ff00");
  await varValueInput.press("Enter");
  await settlePanels(page);

  // Settle canvas frame rendering
  const updatedPixel = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__vooEditor.sampleColorAt({ x: 450, y: 90 });
  });
  assert.equal(updatedPixel, "#00ff00", `Canvas pixel at bound object must update to #00ff00 (got ${updatedPixel})`);

  let varNode = await page.evaluate(() => window.__vooEditor.getNode("var-rect"));
  assert.equal(varNode.fill, "#00ff00", "Bound node fill property must update to match modified variable value");

  // Undo restores canvas pixel and variable value
  await undo();
  const restoredPixel = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__vooEditor.sampleColorAt({ x: 450, y: 90 });
  });
  assert.equal(restoredPixel, "#ff0000", `Undo must restore canvas pixel at bound object to #ff0000 (got ${restoredPixel})`);

  varNode = await page.evaluate(() => window.__vooEditor.getNode("var-rect"));
  assert.equal(varNode.fill, "#ff0000", "Undo must restore node fill property to #ff0000");

  checks.push("color variable bound to object updates actual canvas pixels on edit and restores on undo");

  // --------------------------------------------------------------------------
  // [4] Real Export with One Undo Step
  // --------------------------------------------------------------------------
  const addExportBtn = panel.getByRole("button", { name: "Add export settings", exact: true });
  await addExportBtn.click();
  await settlePanels(page);

  const exportBtn = panel.getByRole("button", { name: "Export", exact: true });
  await exportBtn.waitFor({ state: "visible" });

  // Trigger real export download
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportBtn.click(),
  ]);

  const filePath = await download.path();
  const fileBytes = await readFile(filePath);
  assert.ok(fileBytes.length > 50, "Exported file must contain substantial image bytes");
  assert.equal(fileBytes.subarray(0, 4).toString("hex"), "89504e47", "Exported file must have valid PNG signature");
  assert.match(download.suggestedFilename(), /VariableRectangle.*\.png$/);

  // Perform one undo step: export settings must be removed cleanly
  await undo();

  const presetsAfterUndo = await page.evaluate(() => window.__vooEditor.getNode("var-rect").exportPresets ?? []);
  assert.equal(presetsAfterUndo.length, 0, "One undo must restore exportPresets to empty");
  assert.equal(await panel.getByRole("button", { name: "Export", exact: true }).count(), 0, "Export button must disappear after undo");

  checks.push("real export downloads valid PNG bytes and one undo restores pre-export state");

  // --------------------------------------------------------------------------
  // [5] Serialize Document for Cold Reopen
  // --------------------------------------------------------------------------
  savedProjectVooBytes = await page.evaluate(async () => {
    const { emptyVooFile } = await import("/electron/voo_format.js");
    const e = window.__vooEditor;
    const doc = e.getDocument();
    const voo = emptyVooFile(doc, "design");
    return [...new TextEncoder().encode(JSON.stringify(voo))];
  });
  assert.ok(savedProjectVooBytes.length > 100, "Serialized VOO document bytes must be non-empty");

  assert.deepEqual(errors, [], `Page errors in session 1: ${errors.join("\n")}`);
});

// ============================================================================
// Phase 2: Fresh Independent Cold Reopen Session
// - Launch separate browser context
// - Cold open the saved project file
// - Verify persistence of nodes, styles, modifiers, and color variable bindings
// - Verify pixel-accurate canvas rendering after cold reopen
// - Verify post-reopen editing and history
// ============================================================================
await withEditorBrowser(async ({ page, tool, errors }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Cold open the saved project bytes
  const openResult = await page.evaluate(async (bytes) => {
    try {
      const { openVooProject } = await import("/src/canvas/store/project_io.js");
      const file = new File([new Uint8Array(bytes)], "UncoveredColdReopen.voo", { type: "application/json" });
      const res = await openVooProject({ fileOrPath: file });
      const nodes = window.__vooEditor?.getDocument()?.nodes ?? [];
      return { success: true, res, nodeCount: nodes.length, nodes: nodes.map(n => ({ id: n.id, kind: n.kind, isFrame: n.isFrame })) };
    } catch (e) {
      return { success: false, error: e.message, stack: e.stack };
    }
  }, savedProjectVooBytes);
  console.log("openResult in Session 2:", JSON.stringify(openResult, null, 2));

  // Wait for document to populate with our nodes
  await page.waitForFunction(() => {
    const e = window.__vooEditor;
    const nodes = e?.getDocument()?.nodes ?? [];
    return nodes.some((n) => n.id === "styled-rect") && nodes.some((n) => n.id === "var-rect");
  }, null, { timeout: 20000 });
  await settlePanels(page);

  const coldDoc = await page.evaluate(() => window.__vooEditor.getDocument());

  // 1. Nodes existence and order
  const nonFrameNodeIds = coldDoc.nodes.filter((n) => !n.isFrame).map((n) => n.id);
  assert.deepEqual(
    nonFrameNodeIds,
    ["styled-rect", "mod-rect", "var-rect"],
    "Cold reopen must preserve all 3 document nodes",
  );

  // 2. Styles persistence
  assert.equal(coldDoc.styles?.paint?.length, 1, "Cold reopen must retain 1 paint style");
  assert.equal(coldDoc.styles.paint[0].id, "style-crimson");
  assert.equal(coldDoc.styles.paint[0].name, "Crimson Red");
  const styledNodeAfterCold = coldDoc.nodes.find((n) => n.id === "styled-rect");
  assert.equal(styledNodeAfterCold?.styleIds?.paintId, "style-crimson", "Cold reopen must retain styleId on styled-rect");

  // 3. Modifiers persistence
  assert.equal(coldDoc.modifiers?.length, 1, "Cold reopen must retain 1 modifier");
  assert.equal(coldDoc.modifiers[0].targetId, "mod-rect");
  assert.equal(coldDoc.modifiers[0].type, "linearArray");
  assert.equal(coldDoc.modifiers[0].count, 3);
  assert.equal(coldDoc.modifiers[0].step?.x, 50);

  // 4. Color variable binding persistence
  assert.equal(coldDoc.colorVariables?.length, 1, "Cold reopen must retain color variables");
  assert.equal(coldDoc.colorVariables[0].id, "var-primary");
  assert.equal(coldDoc.colorVariables[0].value, "#ff0000");
  const varNodeAfterCold = coldDoc.nodes.find((n) => n.id === "var-rect");
  assert.equal(varNodeAfterCold?.fillVariableId, "var-primary", "Cold reopen must retain fillVariableId on var-rect");

  // 5. Canvas pixel accuracy after cold reopen
  const pixelAtVarRect = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.__vooEditor.sampleColorAt({ x: 450, y: 90 });
  });
  assert.equal(pixelAtVarRect, "#ff0000", `Cold reopen must render bound variable fill as #ff0000 on canvas (got ${pixelAtVarRect})`);

  // 6. Post-load edit and undo verification
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("var-rect", { width: 200 });
  });
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("var-rect").width), 200);

  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("var-rect").width), 120);

  checks.push("save and cold reopen faithfully restores nodes, styles, modifiers, color variables, and canvas pixels with working post-load undo");

  assert.deepEqual(errors, [], `Page errors in session 2: ${errors.join("\n")}`);
});

console.log(JSON.stringify({ passed: checks }, null, 2));
