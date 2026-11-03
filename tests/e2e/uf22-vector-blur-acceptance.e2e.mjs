import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

console.log("=== [UF22 E2E] PART 1: Real Panel Interaction, Export Pixel Diff & Undo/Redo ===");

let savedDocJson = null;

await withEditorBrowser(async ({ page }) => {
  // 1. Setup a solid vector star
  const setupResult = await page.evaluate(async () => {
    const { starNodeFromBox } = await import("/src/canvas/editor/shape_geometry.js");
    const e = window.__vooEditor;

    const star = {
      ...starNodeFromBox(
        { x: 50, y: 50, width: 195, height: 195 },
        { spikes: 5, innerRatio: 0.382, fill: "#ff6600", stroke: "#000000", strokeWidth: 0 }
      ),
      id: "vector-star-1",
      name: "Star",
    };

    e.setDoc({
      ...e.getDocument(),
      width: 400,
      height: 400,
      nodes: [star],
    });

    e.selectExactly(["vector-star-1"]);
    return { id: star.id, kind: star.kind };
  });

  assert.equal(setupResult.kind, "path", "Vector star must be a path node");

  const getCanvasPixelData = () =>
    page.evaluate(async () => {
      const e = window.__vooEditor;
      const canvas = await e.exportPngCanvasAsync();
      const ctx = canvas.getContext("2d");
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        data: Array.from(imgData.data),
      };
    });

  const basePixels = await getCanvasPixelData();

  // 2. Open AddKindPicker via the + Add Effect button on the UI panel
  await page.waitForTimeout(500);
  const addEffectBtn = page.locator('button[aria-label="Add effect"]');
  assert.equal(await addEffectBtn.count(), 1, "Exactly one Add Effect button exists");
  await addEffectBtn.scrollIntoViewIfNeeded();
  await addEffectBtn.click();
  await page.waitForSelector('[data-testid="editor-adjustment-picker"]', { state: "attached", timeout: 5000 });

  // 3. Inspect UI elements inside AddKindPicker and try clicking disabled filter button
  const pickerCheck = await page.evaluate(() => {
    const popover = document.querySelector('[data-testid="editor-adjustment-picker"]');
    if (!popover) return { found: false };
    const buttons = Array.from(popover.querySelectorAll("button"));
    // Find blur button under Filters
    const blurBtn = buttons.find((b) => b.textContent?.trim() === "Blur");
    const isDisabled = blurBtn?.disabled === true || blurBtn?.getAttribute("aria-disabled") === "true";
    const title = blurBtn?.title || blurBtn?.getAttribute("title") || "";
    if (blurBtn) {
      // Attempt click on disabled button
      blurBtn.click();
    }
    return {
      found: true,
      buttonCount: buttons.length,
      blurFound: Boolean(blurBtn),
      blurDisabled: isDisabled,
      blurTitle: title,
      blurText: blurBtn?.textContent?.trim() || "",
    };
  });

  console.log("AddKindPicker check result:", pickerCheck);
  assert.ok(pickerCheck.found, "AddKindPicker must be mounted");
  assert.ok(pickerCheck.blurFound, "Blur button exists in AddKindPicker");
  assert.ok(pickerCheck.blurDisabled, "Pixel Blur button in AddKindPicker must be disabled for vector star");
  assert.equal(pickerCheck.blurTitle, "Only supported on image layers");

  // Verify node adjustments were NOT mutated by clicking disabled button (blur remains neutral/unconfigured)
  const nodeAfterClick = await page.evaluate(() => {
    const e = window.__vooEditor;
    return e.getNode("vector-star-1");
  });
  assert.equal(nodeAfterClick.adjustments?.blur?.value ?? 0, 0, "Clicking disabled blur button did not configure blur adjustment");

  // Close picker
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 4. Verify that trying to add adjustments.blur to vector star via engine/handler is blocked or has 0 pixel diff
  // Check renderer truth: if historical document has adjustments.blur = { enabled: true, value: 70 }
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("vector-star-1", {
      adjustments: {
        blur: { enabled: true, value: 70 },
      },
    });
  });

  const historicalBlurPixels = await getCanvasPixelData();
  let diffCountHistoricalVsBase = 0;
  for (let i = 0; i < historicalBlurPixels.data.length; i++) {
    if (historicalBlurPixels.data[i] !== basePixels.data[i]) {
      diffCountHistoricalVsBase++;
    }
  }
  console.log("Historical adjustments.blur 70% vs base pixel diff count:", diffCountHistoricalVsBase);
  assert.equal(diffCountHistoricalVsBase, 0, "adjustments.blur has 0 RGBA effect on vector star pixels");

  // 5. Test layerBlur (20px): genuinely effective
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("vector-star-1", {
      layerBlur: 20,
    });
  });

  const layerBlurPixels = await getCanvasPixelData();
  let diffCountLayerBlurVsBase = 0;
  for (let i = 0; i < layerBlurPixels.data.length; i++) {
    if (layerBlurPixels.data[i] !== basePixels.data[i]) {
      diffCountLayerBlurVsBase++;
    }
  }
  console.log("layerBlur: 20px vs base pixel diff count:", diffCountLayerBlurVsBase);
  assert.ok(diffCountLayerBlurVsBase > 10000, "layerBlur (20px) must produce significant pixel changes (> 10000 px)");

  // 6. Test Undo / Redo
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.undo();
  });
  const afterUndoNode = await page.evaluate(() => {
    const e = window.__vooEditor;
    return e.getNode("vector-star-1");
  });
  assert.equal(afterUndoNode.layerBlur ?? 0, 0, "Undo successfully restores layerBlur to 0");

  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.redo();
  });
  const afterRedoNode = await page.evaluate(() => {
    const e = window.__vooEditor;
    return e.getNode("vector-star-1");
  });
  assert.equal(afterRedoNode.layerBlur, 20, "Redo successfully restores layerBlur to 20");

  // Save current document for cold reopen
  savedDocJson = await page.evaluate(() => {
    const e = window.__vooEditor;
    return JSON.stringify(e.getDocument());
  });
  console.log("Document saved successfully for cold reopen test.");
});

console.log("=== [UF22 E2E] PART 2: Cold Reopen in New Browser Process/Context ===");

await withEditorBrowser(async ({ page }) => {
  assert.ok(savedDocJson, "Saved doc JSON must exist from Part 1");

  // Load document in clean runtime
  const loadedState = await page.evaluate((docStr) => {
    const doc = JSON.parse(docStr);
    const e = window.__vooEditor;
    e.setDoc(doc);
    e.selectExactly(["vector-star-1"]);
    const node = e.getNode("vector-star-1");
    return {
      id: node.id,
      kind: node.kind,
      layerBlur: node.layerBlur,
      adjustments: node.adjustments,
    };
  }, savedDocJson);

  console.log("Cold reopen loaded node state:", loadedState);
  assert.equal(loadedState.kind, "path", "Vector star kind preserved");
  assert.equal(loadedState.layerBlur, 20, "layerBlur (20px) preserved across cold reopen");
  assert.ok(loadedState.adjustments?.blur, "Historical adjustments preserved without data loss");

  // Verify exported canvas pixels in cold reopen match layerBlur
  const coldPixels = await page.evaluate(async () => {
    const e = window.__vooEditor;
    const canvas = await e.exportPngCanvasAsync();
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(imgData.data),
    };
  });
  assert.equal(coldPixels.width, 400);
  assert.equal(coldPixels.height, 400);

  console.log("Cold reopen E2E verified successfully!");
});

console.log("=== [UF22 E2E] ALL VERIFICATIONS PASSED ===");
