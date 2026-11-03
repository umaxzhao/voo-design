import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

console.log("=== [UF22 E2E] PART 1: Real UI Operations (Vector Row Guard, LayerBlur Scrub, Keyboard Undo/Redo & Image Forward Path) ===");

const VOO_TEMP_FILE = "/tmp/uf22-warm-roundtrip.voo";
let warmExportPixels = null;

await withEditorBrowser(async ({ page }) => {
  // 1. Setup document with a solid vector star carrying historical adjustments.blur and an image node
  const setupResult = await page.evaluate(async () => {
    const { starNodeFromBox } = await import("/src/canvas/editor/shape_geometry.js");
    const { createImageNode } = await import("/src/canvas/editor/scene_doc_factory.js");
    const e = window.__vooEditor;

    // A. Solid vector star (Path node) with historical adjustments.blur = 70%
    const star = {
      ...starNodeFromBox(
        { x: 30, y: 30, width: 160, height: 160 },
        { spikes: 5, innerRatio: 0.382, fill: "#ff6600", stroke: "#000000", strokeWidth: 0 }
      ),
      id: "vector-star-1",
      name: "Vector Star",
      adjustments: {
        blur: { enabled: true, value: 70 },
      },
    };

    // B. Real Image Node with bitmap data (colorful pattern)
    const testCanvas = document.createElement("canvas");
    testCanvas.width = 120;
    testCanvas.height = 120;
    const ctx = testCanvas.getContext("2d");
    ctx.fillStyle = "#0088ff";
    ctx.fillRect(0, 0, 120, 120);
    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    ctx.arc(60, 60, 40, 0, Math.PI * 2);
    ctx.fill();
    const dataUrl = testCanvas.toDataURL("image/png");

    const imgNode = {
      ...createImageNode({
        x: 220,
        y: 30,
        width: 120,
        height: 120,
        name: "Test Image",
      }),
      id: "img-test-1",
      src: dataUrl,
    };

    e.setDoc({
      ...e.getDocument(),
      width: 400,
      height: 400,
      nodes: [star, imgNode],
    });

    e.selectExactly(["vector-star-1"]);
    return { starId: star.id, imgId: imgNode.id };
  });

  assert.equal(setupResult.starId, "vector-star-1");
  await page.waitForTimeout(400);

  // Helper for full-res exported canvas pixels
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

  // --- A. Vector Old Row Guard & Removal via Real DOM ---
  console.log("Checking Vector old row in inspector panel...");
  // Look for the adjustments row in inspector
  const blurRow = page.locator('button[aria-label="Blur"], button:has-text("BLUR")').first();
  await blurRow.waitFor({ state: "visible", timeout: 5000 });

  // Verify Real DOM shows Image only indicator and title
  const rowInfo = await blurRow.evaluate((el) => ({
    text: el.textContent,
    title: el.getAttribute("title") || el.title,
    disabled: el.disabled,
    cursor: window.getComputedStyle(el).cursor,
  }));
  console.log("Vector blur row DOM info:", rowInfo);
  assert.match(rowInfo.text, /image only|仅图像/i, "Row must visually display 'Image only' label");
  assert.match(rowInfo.title, /supported on image|仅支持图像/i, "Row title must explain image-only restriction");
  assert.equal(rowInfo.cursor, "not-allowed", "Row button must have cursor-not-allowed");

  // Real click on row button: popover must NOT open
  await blurRow.click({ force: true });
  await page.waitForTimeout(200);
  const popoverExists = await page.evaluate(() =>
    Boolean(document.querySelector('[data-testid="adjustment-popover"], [data-editor-adjustment-popover]'))
  );
  assert.equal(popoverExists, false, "Clicking disabled adjustment row must NOT open popover");

  // Real click on the Remove (minus) button in that row to clean up
  const removeRowBtn = page.locator('button[aria-label="Remove adjustment"]').first();
  assert.equal(await removeRowBtn.count(), 1, "Remove adjustment button exists on row");
  await removeRowBtn.click();
  await page.waitForTimeout(300);

  // Verify row is removed from DOM and adjustments.blur is gone from node
  const starNodeAfterRemove = await page.evaluate(() => window.__vooEditor.getNode("vector-star-1"));
  assert.equal(starNodeAfterRemove.adjustments?.blur, undefined, "Historical blur was successfully removed");
  console.log("Vector historical row cleanly removed via real UI click.");

  // --- B. Universal LayerBlur via Real UI Add and ScrubField Input ---
  console.log("Operating universal LayerBlur via real UI Add and ScrubField input...");
  // 1. Click + Add effect to open picker
  const addEffectForBlurBtn = page.locator('button[aria-label="Add effect"]');
  await addEffectForBlurBtn.click();

  // 2. Click "Layer blur" under Blur & noise in picker
  const pickerLayerBlurBtn = page.locator('[data-testid="editor-adjustment-picker"] button:has-text("Layer blur")').first();
  await pickerLayerBlurBtn.waitFor({ state: "visible", timeout: 5000 });
  await pickerLayerBlurBtn.click();
  await page.waitForTimeout(300);

  // 3. Now the Layer blur input is visible in inspector, enter 20 via real input
  const layerBlurInput = page.locator('input[aria-label="Layer blur"]');
  await layerBlurInput.waitFor({ state: "visible", timeout: 5000 });
  await layerBlurInput.click();
  await layerBlurInput.fill("20");
  await layerBlurInput.press("Enter");
  await page.waitForTimeout(300);

  const starNodeAfterBlur = await page.evaluate(() => window.__vooEditor.getNode("vector-star-1"));
  assert.equal(starNodeAfterBlur.layerBlur, 20, "layerBlur was updated to 20 via real input");

  const pixelsAfterLayerBlur = await getCanvasPixelData();
  let layerBlurDiffCount = 0;
  for (let i = 0; i < pixelsAfterLayerBlur.data.length; i++) {
    if (pixelsAfterLayerBlur.data[i] !== basePixels.data[i]) {
      layerBlurDiffCount++;
    }
  }
  console.log("LayerBlur 20px pixel diff count vs base:", layerBlurDiffCount);
  assert.ok(layerBlurDiffCount > 10000, "LayerBlur 20px must produce real pixel change (> 10000 px)");

  // --- C. Real Keyboard Undo & Redo ---
  console.log("Verifying Undo and Redo via real keyboard shortcuts...");
  const isMac = process.platform === "darwin";
  // Step 1: Undo value change 20 -> 8
  await page.keyboard.press(isMac ? "Meta+z" : "Control+z");
  await page.waitForTimeout(200);
  const starNodeAfterUndo1 = await page.evaluate(() => window.__vooEditor.getNode("vector-star-1"));
  assert.equal(starNodeAfterUndo1.layerBlur, 8, "First Undo restored layerBlur from 20 to initial 8");

  // Step 2: Undo addition 8 -> 0
  await page.keyboard.press(isMac ? "Meta+z" : "Control+z");
  await page.waitForTimeout(200);
  const starNodeAfterUndo2 = await page.evaluate(() => window.__vooEditor.getNode("vector-star-1"));
  assert.equal(starNodeAfterUndo2.layerBlur ?? 0, 0, "Second Undo restored layerBlur to 0");

  // Step 3: Redo addition 0 -> 8
  await page.keyboard.press(isMac ? "Meta+Shift+z" : "Control+Shift+z");
  await page.waitForTimeout(200);
  const starNodeAfterRedo1 = await page.evaluate(() => window.__vooEditor.getNode("vector-star-1"));
  assert.equal(starNodeAfterRedo1.layerBlur, 8, "First Redo restored layerBlur to 8");

  // Step 4: Redo value change 8 -> 20
  await page.keyboard.press(isMac ? "Meta+Shift+z" : "Control+Shift+z");
  await page.waitForTimeout(200);
  const starNodeAfterRedo2 = await page.evaluate(() => window.__vooEditor.getNode("vector-star-1"));
  assert.equal(starNodeAfterRedo2.layerBlur, 20, "Second Redo restored layerBlur to 20");
  console.log("Granular keyboard Undo / Redo verified successfully (20 <-> 8 <-> 0).");

  // --- D. Image Layer: Forward Path (Real UI Add and Genuine Blur Effect) ---
  console.log("Testing image layer forward path: Real Click Add Blur on Image...");
  await page.evaluate(() => window.__vooEditor.selectExactly(["img-test-1"]));
  await page.waitForTimeout(300);

  const imgBasePixels = await getCanvasPixelData();

  // Real click on + Add effect button for image
  const addEffectBtn = page.locator('button[aria-label="Add effect"]');
  await addEffectBtn.waitFor({ state: "visible", timeout: 5000 });
  await addEffectBtn.click();

  // Wait for AddKindPicker popover
  const pickerLocator = page.locator('[data-testid="editor-adjustment-picker"]');
  await pickerLocator.waitFor({ state: "visible", timeout: 5000 });

  // Locate the Blur button in AddKindPicker for image: it must be ENABLED
  const pickerBlurBtn = pickerLocator.locator('button:has-text("Blur")').first();
  await pickerBlurBtn.waitFor({ state: "visible", timeout: 3000 });

  const imgBlurBtnInfo = await pickerBlurBtn.evaluate((el) => ({
    disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
    title: el.getAttribute("title") || "",
  }));
  console.log("Image AddKindPicker Blur button info:", imgBlurBtnInfo);
  assert.equal(imgBlurBtnInfo.disabled, false, "Blur button must be ENABLED for image layer");

  // Real pointer click on Blur button in picker
  await pickerBlurBtn.click();
  await page.waitForTimeout(400);

  // Verify that the image node received blur in liveFilters/adjustments
  const imgNodeAfterAdd = await page.evaluate(() => window.__vooEditor.getNode("img-test-1"));
  const hasFilter =
    Boolean(imgNodeAfterAdd.adjustments?.liveFilters?.some((f) => f.kind === "blur")) ||
    Boolean(imgNodeAfterAdd.adjustments?.blur);
  assert.ok(hasFilter, "Image node successfully received blur filter via real click");

  // Export pixels and confirm real visual pixel difference on image!
  const imgAfterBlurPixels = await getCanvasPixelData();
  let imgBlurDiffCount = 0;
  for (let i = 0; i < imgAfterBlurPixels.data.length; i++) {
    if (imgAfterBlurPixels.data[i] !== imgBasePixels.data[i]) {
      imgBlurDiffCount++;
    }
  }
  console.log("Image blur pixel difference count:", imgBlurDiffCount);
  assert.ok(imgBlurDiffCount > 500, "Real image blur produced active pixel differences on canvas (> 500 px)");

  // Capture final warm export pixels for cold reopen comparison
  warmExportPixels = await getCanvasPixelData();
  console.log("Warm export pixels captured:", warmExportPixels.width, "x", warmExportPixels.height);

  // --- E. Real VOO File Save to Disk via Download ---
  console.log("Saving actual .voo project file to disk via download...");
  const downloadPromise = page.waitForEvent("download");

  await page.evaluate(async () => {
    // Force download fallback by clearing picker
    delete window.showSaveFilePicker;
    const { saveVooProject } = await import("/src/canvas/store/project_io.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    const store = useDesignStore.getState();
    await saveVooProject({
      store,
      saveAs: true,
      enginesRef: { current: new Map([[store.editingNodeId, { engine: window.__vooEditor, ready: true }]]) },
    });
  });

  const download = await downloadPromise;
  await download.saveAs(VOO_TEMP_FILE);
  const fileBytes = await readFile(VOO_TEMP_FILE);
  console.log("VOO file successfully saved to:", VOO_TEMP_FILE, "bytes:", fileBytes.length);
  assert.ok(fileBytes.length > 500, "Saved VOO file must be non-trivial binary archive");
});

console.log("=== [UF22 E2E] PART 2: Cold Reopen in Independent Browser Process, Real Open & Strict RGBA Diff ===");

await withEditorBrowser(async ({ page }) => {
  assert.ok(warmExportPixels, "Warm export pixels must be present from Part 1");
  const vooBytes = await readFile(VOO_TEMP_FILE);

  // Real open through project_io.openVooProject with File object
  await page.evaluate(async ({ bytes, name }) => {
    delete window.showOpenFilePicker;
    const { openVooProject } = await import("/src/canvas/store/project_io.js");
    const file = new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });
    await openVooProject({ fileOrPath: file });
  }, { bytes: Array.from(vooBytes), name: "uf22-warm-roundtrip.voo" });

  await page.waitForFunction(
    () => window.__vooEditor?.getDocument()?.nodes?.length >= 2,
    null,
    { timeout: 30000 }
  );
  await page.waitForTimeout(500);

  // Verify node states in cold reopen
  const coldNodes = await page.evaluate(() => {
    const e = window.__vooEditor;
    const star = e.getNode("vector-star-1");
    const img = e.getNode("img-test-1");
    return {
      starKind: star?.kind,
      starLayerBlur: star?.layerBlur,
      imgKind: img?.kind,
      imgHasFilter:
        Boolean(img?.adjustments?.liveFilters?.some((f) => f.kind === "blur")) ||
        Boolean(img?.adjustments?.blur),
    };
  });
  console.log("Cold reopened node states:", coldNodes);
  assert.equal(coldNodes.starKind, "path");
  assert.equal(coldNodes.starLayerBlur, 20, "layerBlur (20px) faithfully preserved across cold reopen");
  assert.equal(coldNodes.imgKind, "image");
  assert.equal(coldNodes.imgHasFilter, true, "Image blur filter preserved across cold reopen");

  // Export pixels in cold reopen
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

  // Strict pixel equality assertion against warmExportPixels
  assert.equal(coldPixels.width, warmExportPixels.width, "Width must match exactly");
  assert.equal(coldPixels.height, warmExportPixels.height, "Height must match exactly");
  assert.equal(coldPixels.data.length, warmExportPixels.data.length, "Pixel buffer length must match exactly");

  let pixelDiffCount = 0;
  let maxChannelDiff = 0;
  for (let i = 0; i < coldPixels.data.length; i++) {
    const diff = Math.abs(coldPixels.data[i] - warmExportPixels.data[i]);
    if (diff > 0) {
      pixelDiffCount++;
      maxChannelDiff = Math.max(maxChannelDiff, diff);
    }
  }

  console.log("=== COLD REOPEN RGBA PIXEL COMPARISON ===");
  console.log("Total bytes compared:", coldPixels.data.length);
  console.log("pixelDiffCount:", pixelDiffCount);
  console.log("maxChannelDiff:", maxChannelDiff);

  // 100% exact equality: every single pixel and channel must match!
  assert.equal(pixelDiffCount, 0, "Cold reopen exported canvas must match Warm exported canvas with 0 RGBA diff");
  assert.equal(maxChannelDiff, 0, "Max channel diff must be strictly 0");

  console.log("Cold reopen real VOO file open verified with 100% RGBA pixel equality!");
});

// Clean up temp file
try {
  await unlink(VOO_TEMP_FILE);
} catch {}

console.log("=== [UF22 E2E] ALL EXTENDED REAL-UI & COLD ROUNDTRIP TESTS PASSED ===");
