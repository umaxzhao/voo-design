import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { settlePanels } from "./ui-responsive-editor-helpers.mjs";

console.log("=== OBS-FRAME01 Diagnosis: Frame Canvas Fill vs Model / Export Across rootFrame, nestedFrame, and Bounded Page ===");

const diagnosisReceipt = {
  task: "OBS-FRAME01",
  baseline: "b8ae8039a291e841f786b29f90af00e4f4c89653",
  timestamp: new Date().toISOString(),
  readouts: {},
};

let savedVooBytes = null;

// ============================================================================
// Phase 1: Live Diagnosis Session across the 3 Scenarios
// ============================================================================
await withEditorBrowser(async ({ page, tool, errors }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // --------------------------------------------------------------------------
  // Helper to read DOM rects, canvas buffer dimensions, and pixel samples
  // --------------------------------------------------------------------------
  async function readRuntimeState(label, docPointSamples = []) {
    return page.evaluate(async ({ label, docPointSamples }) => {
      const e = window.__vooEditor;
      const doc = e?.getDocument?.();
      const pageEl = document.querySelector('[data-testid="editor-page"]');
      const pageBox = pageEl ? pageEl.getBoundingClientRect() : null;
      const stageEl = pageEl ? pageEl.querySelector('.touch-none') : null;
      const stageBox = stageEl ? stageEl.getBoundingClientRect() : null;

      const fallbackCanvas = document.querySelector('[data-testid="editor-artwork-fallback"]');
      const skiaCanvas = document.querySelector('[data-testid="workspace-skia-canvas"]');
      const chromeCanvas = document.querySelector('[data-testid="workspace-chrome-canvas"]');
      const artboardLayer = document.querySelector('[data-testid="editor-artboards-layer"]');

      const dpr = window.devicePixelRatio || 1;

      // Sample pixels on canvas via engine sampler
      const samples = {};
      for (const pt of docPointSamples) {
        samples[`(${pt.x},${pt.y})`] = e?.sampleColorAt?.(pt) ?? null;
      }

      return {
        label,
        dpr,
        docMeta: {
          id: doc?.id,
          isCanvasRoot: doc?.isCanvasRoot ?? false,
          docWidth: doc?.width,
          docHeight: doc?.height,
          backgroundColor: doc?.backgroundColor,
        },
        pageDom: pageBox ? {
          x: Math.round(pageBox.x),
          y: Math.round(pageBox.y),
          width: Math.round(pageBox.width),
          height: Math.round(pageBox.height),
          styleWidth: pageEl.style.width,
          styleHeight: pageEl.style.height,
          styleLeft: pageEl.style.left,
          styleTop: pageEl.style.top,
        } : null,
        stageDom: stageBox ? {
          clientWidth: stageEl.clientWidth,
          clientHeight: stageEl.clientHeight,
          overflow: window.getComputedStyle(stageEl).overflow,
        } : null,
        artworkCanvas: fallbackCanvas ? {
          width: fallbackCanvas.width,
          height: fallbackCanvas.height,
          styleWidth: fallbackCanvas.style.width,
          styleHeight: fallbackCanvas.style.height,
        } : null,
        chromeCanvas: chromeCanvas ? {
          width: chromeCanvas.width,
          height: chromeCanvas.height,
          styleWidth: chromeCanvas.style.width,
          styleHeight: chromeCanvas.style.height,
        } : null,
        skiaCanvas: skiaCanvas ? {
          width: skiaCanvas.width,
          height: skiaCanvas.height,
          hidden: skiaCanvas.hidden,
          status: skiaCanvas.getAttribute("data-renderer-status"),
        } : null,
        artboardLayerTransform: artboardLayer?.style.transform ?? null,
        pixelSamples: samples,
      };
    }, { label, docPointSamples });
  }

  // ==========================================================================
  // [SCENARIO 1]: rootFrame on Unbounded Canvas (isCanvasRoot: true)
  // ==========================================================================
  console.log("\n--- Scenario 1: rootFrame on Unbounded Canvas (isCanvasRoot: true) ---");

  await page.evaluate(async () => {
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;

    const frame = {
      ...createGroupNode({ x: 0, y: 0, width: 1200, height: 800 }),
      id: "root-frame-1",
      name: "RootFrame",
      frame: true,
      isFrame: true,
      containerType: "frame",
      fill: "#171717",
      fillOpacity: 1,
      clipContent: true,
      visible: true,
    };

    const child = {
      ...createRectNode({ x: 1100, y: 700, width: 60, height: 60, fill: "#ff0000" }),
      id: "child-pinned-rb",
      name: "ChildRightBottom",
      parentId: "root-frame-1",
      constraints: { horizontal: "right", vertical: "bottom" },
      visible: true,
    };

    e.setDoc({
      ...e.getDocument(),
      width: 1200,
      height: 800,
      isCanvasRoot: true,
      backgroundColor: "transparent",
      nodes: [frame, child],
    });

    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 0, panY: 0 } });
  });

  await settlePanels(page);

  // Readout 1.1: Before resize
  const s1Before = await readRuntimeState("rootFrame: 1200x800", [
    { x: 600, y: 400 },    // Center of original frame
    { x: 1300, y: 900 },   // Future expanded region (outside 1200x800)
    { x: 1130, y: 730 },   // Center of child node (1100+30, 700+30)
  ]);
  const nodeBefore = await page.evaluate(() => {
    const e = window.__vooEditor;
    const f = e.getNode("root-frame-1");
    const c = e.getNode("child-pinned-rb");
    return { frame: { x: f.x, y: f.y, width: f.width, height: f.height }, child: { x: c.x, y: c.y } };
  });
  s1Before.modelBbox = nodeBefore;
  console.log("Scenario 1 (Before):", JSON.stringify(s1Before, null, 2));
  diagnosisReceipt.readouts.s1Before = s1Before;

  // Perform Frame Resize: 1200x800 -> 1400x1000
  console.log("Resizing root-frame-1 to 1400x1000 via updateFrameNode...");
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateFrameNode("root-frame-1", { width: 1400, height: 1000 });
  });
  await settlePanels(page);

  // Readout 1.2: After resize
  const s1After = await readRuntimeState("rootFrame: 1400x1000", [
    { x: 600, y: 400 },    // Center of original frame
    { x: 1300, y: 900 },   // Inside newly expanded region (1200..1400, 800..1000)
    { x: 1330, y: 930 },   // Center of shifted child node (1100+200+30, 700+200+30)
  ]);
  const nodeAfter = await page.evaluate(() => {
    const e = window.__vooEditor;
    const f = e.getNode("root-frame-1");
    const c = e.getNode("child-pinned-rb");
    return { frame: { x: f.x, y: f.y, width: f.width, height: f.height }, child: { x: c.x, y: c.y } };
  });
  s1After.modelBbox = nodeAfter;
  console.log("Scenario 1 (After Resize):", JSON.stringify(s1After, null, 2));
  diagnosisReceipt.readouts.s1After = s1After;

  // Real Export PNG Comparison for rootFrame
  console.log("Exporting root-frame-1 to PNG...");
  const exportPngResult = await page.evaluate(async () => {
    const e = window.__vooEditor;
    const doc = e.getDocument();
    const { renderSelectionPng, selectedExportBounds, selectedExportNodes } = await import("/src/canvas/editor/editor_export_selection.js");
    const nodes = selectedExportNodes(doc, ["root-frame-1"]);
    const bounds = selectedExportBounds(nodes);
    const exportResult = renderSelectionPng(doc, nodes, bounds, { scale: 1, transparent: false }, {
      bitmapSourceOf: () => null,
      cache: null,
      maskSourceOf: () => null,
      glRenderer: null,
    });
    if (!exportResult) return { error: "renderSelectionPng returned null" };

    const img = new Image();
    img.src = exportResult.dataUrl;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Sample inside original (600, 400)
    const pOriginal = [...ctx.getImageData(600, 400, 1, 1).data];
    // Sample inside expanded region (1300, 900)
    const pExpanded = [...ctx.getImageData(1300, 900, 1, 1).data];
    // Sample shifted child (1330, 930)
    const pChild = [...ctx.getImageData(1330, 930, 1, 1).data];

    const toHex = (data) => `#${data.slice(0, 3).map(v => v.toString(16).padStart(2, "0")).join("")}`;

    return {
      width: exportResult.width,
      height: exportResult.height,
      pixelAtOriginal: toHex(pOriginal),
      pixelAtExpanded: toHex(pExpanded),
      pixelAtChild: toHex(pChild),
    };
  });
  console.log("Scenario 1 Export PNG Result:", JSON.stringify(exportPngResult, null, 2));
  diagnosisReceipt.readouts.s1ExportPng = exportPngResult;

  // Undo / Redo verification
  console.log("Verifying Undo/Redo...");
  await tool("undo");
  await settlePanels(page);
  const s1Undo = await readRuntimeState("rootFrame: after Undo", [
    { x: 600, y: 400 },
    { x: 1300, y: 900 },
    { x: 1130, y: 730 },
  ]);
  const nodeUndo = await page.evaluate(() => {
    const e = window.__vooEditor;
    const f = e.getNode("root-frame-1");
    const c = e.getNode("child-pinned-rb");
    return { frame: { x: f.x, y: f.y, width: f.width, height: f.height }, child: { x: c.x, y: c.y } };
  });
  s1Undo.modelBbox = nodeUndo;
  diagnosisReceipt.readouts.s1Undo = s1Undo;

  // Redo back to 1400x1000
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  await settlePanels(page);

  // ==========================================================================
  // [SCENARIO 2]: nested Frame inside Outer Frame
  // ==========================================================================
  console.log("\n--- Scenario 2: nested Frame inside Outer Frame ---");

  await page.evaluate(async () => {
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;

    const outerFrame = {
      ...createGroupNode({ x: 50, y: 50, width: 1800, height: 1400 }),
      id: "outer-frame-1",
      name: "OuterFrame",
      frame: true,
      isFrame: true,
      containerType: "frame",
      fill: "#333333",
      fillOpacity: 1,
      clipContent: true,
      visible: true,
    };

    const nestedFrame = {
      ...createGroupNode({ x: 100, y: 100, width: 1200, height: 800 }),
      id: "nested-frame-1",
      name: "NestedFrame",
      parentId: "outer-frame-1",
      frame: true,
      isFrame: true,
      containerType: "frame",
      fill: "#171717",
      fillOpacity: 1,
      clipContent: true,
      visible: true,
    };

    const nestedChild = {
      ...createRectNode({ x: 1100, y: 700, width: 60, height: 60, fill: "#ff0000" }),
      id: "nested-child-rb",
      name: "NestedChildRB",
      parentId: "nested-frame-1",
      constraints: { horizontal: "right", vertical: "bottom" },
      visible: true,
    };

    e.setDoc({
      ...e.getDocument(),
      width: 1800,
      height: 1400,
      isCanvasRoot: true,
      backgroundColor: "transparent",
      nodes: [outerFrame, nestedFrame, nestedChild],
    });
  });
  await settlePanels(page);

  const s2Before = await readRuntimeState("nestedFrame: 1200x800", [
    { x: 300, y: 300 },    // inside nested frame
    { x: 1350, y: 950 },   // outside nested frame, inside outer frame
  ]);
  diagnosisReceipt.readouts.s2Before = s2Before;

  // Resize nested frame to 1400x1000
  console.log("Resizing nested-frame-1 to 1400x1000...");
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateFrameNode("nested-frame-1", { width: 1400, height: 1000 });
  });
  await settlePanels(page);

  const s2After = await readRuntimeState("nestedFrame: 1400x1000", [
    { x: 300, y: 300 },    // inside nested frame
    { x: 1350, y: 950 },   // now inside expanded nested frame!
    { x: 1330, y: 930 },   // shifted nested child
  ]);
  const nodeS2After = await page.evaluate(() => {
    const e = window.__vooEditor;
    const f = e.getNode("nested-frame-1");
    const c = e.getNode("nested-child-rb");
    return { frame: { x: f.x, y: f.y, width: f.width, height: f.height }, child: { x: c.x, y: c.y } };
  });
  s2After.modelBbox = nodeS2After;
  console.log("Scenario 2 (After Resize):", JSON.stringify(s2After, null, 2));
  diagnosisReceipt.readouts.s2After = s2After;

  // ==========================================================================
  // [SCENARIO 3]: 有界 page (Bounded Page: isCanvasRoot = false)
  // ==========================================================================
  console.log("\n--- Scenario 3: Bounded Page (isCanvasRoot = false) ---");

  await page.evaluate(async () => {
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;

    const movableFrame = {
      ...createGroupNode({ x: 0, y: 0, width: 1200, height: 800 }),
      id: "page-frame-1",
      name: "PageFrame",
      frame: true,
      isFrame: true,
      containerType: "frame",
      fill: "#171717",
      fillOpacity: 1,
      clipContent: true,
      visible: true,
    };

    const pageChild = {
      ...createRectNode({ x: 1000, y: 600, width: 60, height: 60, fill: "#ff0000" }),
      id: "page-child-rb",
      name: "PageChildRB",
      parentId: "page-frame-1",
      constraints: { horizontal: "right", vertical: "bottom" },
      visible: true,
    };

    // Bounded page: doc.width = 1200, doc.height = 800, isCanvasRoot = false
    e.setDoc({
      ...e.getDocument(),
      width: 1200,
      height: 800,
      isCanvasRoot: false,
      backgroundColor: "#171717",
      nodes: [movableFrame, pageChild],
    });
  });
  await settlePanels(page);

  const s3Before = await readRuntimeState("boundedPage: 1200x800", [
    { x: 600, y: 400 },    // inside 1200x800
    { x: 1300, y: 900 },   // outside bounded page
  ]);
  diagnosisReceipt.readouts.s3Before = s3Before;
  console.log("Scenario 3 (Before):", JSON.stringify(s3Before, null, 2));

  // In bounded page, resize the internal frame to 1400x1000 while doc remains 1200x800
  console.log("Resizing page-frame-1 to 1400x1000 while doc remains 1200x800...");
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateFrameNode("page-frame-1", { width: 1400, height: 1000 });
  });
  await settlePanels(page);

  const s3AfterFrameOnly = await readRuntimeState("boundedPage: Frame 1400x1000, doc 1200x800", [
    { x: 600, y: 400 },
    { x: 1300, y: 900 },   // In expanded frame region, but outside doc 1200x800 page bounds!
  ]);
  const nodeS3After = await page.evaluate(() => {
    const e = window.__vooEditor;
    const f = e.getNode("page-frame-1");
    const c = e.getNode("page-child-rb");
    return { frame: { x: f.x, y: f.y, width: f.width, height: f.height }, child: { x: c.x, y: c.y } };
  });
  s3AfterFrameOnly.modelBbox = nodeS3After;
  console.log("Scenario 3 (Frame resized, doc unresized):", JSON.stringify(s3AfterFrameOnly, null, 2));
  diagnosisReceipt.readouts.s3AfterFrameOnly = s3AfterFrameOnly;

  // Now resize the document itself to 1400x1000
  console.log("Now calling setDocumentSize(1400, 1000)...");
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDocumentSize(1400, 1000);
  });
  await settlePanels(page);

  const s3AfterDocResize = await readRuntimeState("boundedPage: doc & Frame both 1400x1000", [
    { x: 600, y: 400 },
    { x: 1300, y: 900 },
  ]);
  console.log("Scenario 3 (Both resized):", JSON.stringify(s3AfterDocResize, null, 2));
  diagnosisReceipt.readouts.s3AfterDocResize = s3AfterDocResize;

  // ==========================================================================
  // [SCENARIO 4]: Pan and Zoom Readouts
  // ==========================================================================
  console.log("\n--- Scenario 4: Pan and Zoom Coverage ---");

  // Pan to (200, 150)
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 200, panY: 150 } });
  });
  await settlePanels(page);
  const s4Pan = await readRuntimeState("panX: 200, panY: 150", [{ x: 600, y: 400 }, { x: 1300, y: 900 }]);
  diagnosisReceipt.readouts.s4Pan = s4Pan;

  // Zoom 0.5
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 0.5, panX: 200, panY: 150 } });
  });
  await settlePanels(page);
  const s4ZoomHalf = await readRuntimeState("zoom: 0.5", [{ x: 600, y: 400 }, { x: 1300, y: 900 }]);
  diagnosisReceipt.readouts.s4ZoomHalf = s4ZoomHalf;

  // Zoom 1.5
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1.5, panX: 200, panY: 150 } });
  });
  await settlePanels(page);
  const s4ZoomOneAndHalf = await readRuntimeState("zoom: 1.5", [{ x: 600, y: 400 }, { x: 1300, y: 900 }]);
  diagnosisReceipt.readouts.s4ZoomOneAndHalf = s4ZoomOneAndHalf;

  // Reset Camera to 1.0, 0, 0 and set document to rootFrame 1400x1000 for serialization
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 0, panY: 0 } });
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const frame = {
      ...createGroupNode({ x: 0, y: 0, width: 1400, height: 1000 }),
      id: "root-frame-saved",
      name: "RootFrameSaved",
      frame: true,
      isFrame: true,
      containerType: "frame",
      fill: "#171717",
      fillOpacity: 1,
      clipContent: true,
      visible: true,
    };
    const child = {
      ...createRectNode({ x: 1300, y: 900, width: 60, height: 60, fill: "#ff0000" }),
      id: "child-pinned-saved",
      parentId: "root-frame-saved",
      constraints: { horizontal: "right", vertical: "bottom" },
      visible: true,
    };
    // Notice: doc.width = 1200, doc.height = 800, but frame is 1400x1000!
    e.setDoc({
      ...e.getDocument(),
      width: 1200,
      height: 800,
      isCanvasRoot: true,
      backgroundColor: "transparent",
      nodes: [frame, child],
    });
  });
  await settlePanels(page);

  // Serialize Document for Cold Reopen
  savedVooBytes = await page.evaluate(async () => {
    const { emptyVooFile } = await import("/electron/voo_format.js");
    const e = window.__vooEditor;
    const doc = e.getDocument();
    const voo = emptyVooFile(doc, "design");
    return [...new TextEncoder().encode(JSON.stringify(voo))];
  });

  assert.deepEqual(errors, [], `Page errors in session 1: ${errors.join("\n")}`);
});

// ============================================================================
// Phase 2: Fresh Independent Cold Reopen Session (Ctrl+O Equivalence)
// ============================================================================
console.log("\n--- Phase 2: Cold Reopen Session in Independent Context ---");

await withEditorBrowser(async ({ page, errors }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Open the saved project
  const openRes = await page.evaluate(async (bytes) => {
    try {
      const { openVooProject } = await import("/src/canvas/store/project_io.js");
      const file = new File([new Uint8Array(bytes)], "ObsFrameColdReopen.voo", { type: "application/json" });
      const res = await openVooProject({ fileOrPath: file });
      const doc = window.__vooEditor?.getDocument?.();
      return { success: true, res, docWidth: doc?.width, docHeight: doc?.height, isCanvasRoot: doc?.isCanvasRoot };
    } catch (e) {
      return { success: false, error: e.message, stack: e.stack };
    }
  }, savedVooBytes);
  console.log("Cold Open Result:", JSON.stringify(openRes, null, 2));

  await page.waitForFunction(() => {
    const e = window.__vooEditor;
    return Boolean(e?.getDocument?.()?.nodes?.length);
  });
  await settlePanels(page);

  // Readout Cold Reopen state
  const coldState = await page.evaluate(() => {
    const e = window.__vooEditor;
    const doc = e?.getDocument?.();
    const pageEl = document.querySelector('[data-testid="editor-page"]');
    const pageBox = pageEl ? pageEl.getBoundingClientRect() : null;
    const stageEl = pageEl ? pageEl.querySelector('.touch-none') : null;
    const stageBox = stageEl ? stageEl.getBoundingClientRect() : null;
    const fallbackCanvas = document.querySelector('[data-testid="editor-artwork-fallback"]');
    const skiaCanvas = document.querySelector('[data-testid="workspace-skia-canvas"]');

    return {
      docMeta: {
        docWidth: doc?.width,
        docHeight: doc?.height,
        isCanvasRoot: doc?.isCanvasRoot,
        nodes: doc?.nodes?.map(n => ({ id: n.id, isFrame: n.isFrame, width: n.width, height: n.height })),
      },
      pageDom: pageBox ? {
        width: Math.round(pageBox.width),
        height: Math.round(pageBox.height),
      } : null,
      stageDom: stageBox ? {
        clientWidth: stageEl.clientWidth,
        clientHeight: stageEl.clientHeight,
      } : null,
      artworkCanvas: fallbackCanvas ? {
        width: fallbackCanvas.width,
        height: fallbackCanvas.height,
        styleWidth: fallbackCanvas.style.width,
        styleHeight: fallbackCanvas.style.height,
      } : null,
      skiaCanvas: skiaCanvas ? {
        width: skiaCanvas.width,
        height: skiaCanvas.height,
        status: skiaCanvas.getAttribute("data-renderer-status"),
      } : null,
      pixelSamples: {
        at600_400: e?.sampleColorAt?.({ x: 600, y: 400 }) ?? null,
        at1300_900: e?.sampleColorAt?.({ x: 1300, y: 900 }) ?? null,
      },
    };
  });
  console.log("Cold Reopen Runtime State:", JSON.stringify(coldState, null, 2));
  diagnosisReceipt.readouts.coldState = coldState;

  assert.deepEqual(errors, [], `Page errors in session 2: ${errors.join("\n")}`);
});

console.log("\n=== OBS-FRAME01 Diagnosis Complete ===");
console.log("DIAGNOSIS_RECEIPT_JSON_START");
console.log(JSON.stringify(diagnosisReceipt, null, 2));
console.log("DIAGNOSIS_RECEIPT_JSON_END");
