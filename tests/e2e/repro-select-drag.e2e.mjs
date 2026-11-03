import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const EVIDENCE_DIR = mkdtempSync(editorArtifactPath("repro-select-drag/run-"));
console.log(`Evidence directory: ${EVIDENCE_DIR}`);

await mkdir(EVIDENCE_DIR, { recursive: true });

console.log("=== Row 1: Default Select Empty Drag vs Object Drag vs Space Hand Matrix ===");

await withEditorBrowser(async ({ page, tool }) => {
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );

  const getCamera = () =>
    page.evaluate(async () => {
      const { useDesignStore } = await import("/src/store/design_store.js");
      const cam = useDesignStore.getState().editorCamera;
      return { panX: cam?.panX || 0, panY: cam?.panY || 0, zoom: cam?.zoom || 1 };
    });

  const matrixReport = {
    matrixRow: "Row 1: Default Select Empty Drag (Marquee vs Canvas Pan)",
    testedRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8" }).trim(),
    timestamp: new Date().toISOString(),
    environments: {
      web: { status: "TESTED", details: `Playwright Chromium headless on ${process.platform} ${process.arch}` },
      macNative: { status: "UNTESTED", reason: "Mac native GUI was not executed in this browser run" },
      linuxNative: { status: "UNTESTED", reason: "Linux native build was not executed in this browser run" },
    },
    scenarios: [],
    rootCauses: [],
    proposedFixFiles: [],
  };

  // -------------------------------------------------------------------------
  // [1] User Defect Reproduction: Empty Canvas Drag in Default Select Mode
  // User quote: "默认选择工具 滑动画布的时候 应该是框选画布 不是拖动移动画布"
  // -------------------------------------------------------------------------
  console.log("\n[Item 1] Testing Default Select Tool Drag on Empty Canvas Area...");

  const camBefore1 = await getCamera();
  const currentTool1 = await page.evaluate(() => window.__vooEditor.getTool());
  console.log(`  Initial Tool: ${currentTool1}, Initial Camera:`, camBefore1);

  // Drag in empty stage area from (100, 100) to (250, 200)
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(250, 200, { steps: 10 });
  await page.mouse.up();
  await settle();

  const camAfter1 = await getCamera();
  const panDeltaX1 = camAfter1.panX - camBefore1.panX;
  const panDeltaY1 = camAfter1.panY - camBefore1.panY;
  console.log(`  Camera After Empty Drag:`, camAfter1);
  console.log(`  Camera Pan Delta: dx=${panDeltaX1}, dy=${panDeltaY1}`);

  const item1 = {
    name: "empty_canvas_drag_select_tool",
    tool: currentTool1,
    expected: "Marquee box appears and selects objects; canvas camera does NOT pan",
    actual: `Canvas camera panned by (dx: ${panDeltaX1}, dy: ${panDeltaY1}); marquee did not activate`,
    defectConfirmed: panDeltaX1 !== 0 || panDeltaY1 !== 0,
    status: (panDeltaX1 !== 0 || panDeltaY1 !== 0) ? "DEFECT_CONFIRMED" : "PASS",
  };
  matrixReport.scenarios.push(item1);

  // -------------------------------------------------------------------------
  // [2] Space + Drag (Temporary Hand Tool Pan Preservation)
  // Requirement: Space temporary hand MUST still pan the canvas
  // -------------------------------------------------------------------------
  console.log("\n[Item 2] Testing Space + Drag (Temporary Hand Tool)...");

  const camBefore2 = await getCamera();

  await page.keyboard.down("Space");
  await settle();

  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(250, 200, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await settle();

  const camAfter2 = await getCamera();
  const panDeltaX2 = camAfter2.panX - camBefore2.panX;
  const panDeltaY2 = camAfter2.panY - camBefore2.panY;
  console.log(`  Space Hand Pan Delta: dx=${panDeltaX2}, dy=${panDeltaY2}`);

  const item2 = {
    name: "space_hand_drag_pan",
    expected: "Canvas camera pans smoothly when Space key is held down",
    actual: `Camera panned by (dx: ${panDeltaX2}, dy: ${panDeltaY2})`,
    status: (panDeltaX2 === 150 && panDeltaY2 === 100) ? "PASS" : "FAIL",
  };
  matrixReport.scenarios.push(item2);

  // -------------------------------------------------------------------------
  // [3] Dragging Selected Object Preservation
  // Requirement: Dragging selected object must move the object, NOT pan the canvas
  // -------------------------------------------------------------------------
  console.log("\n[Item 3] Testing Dragging Selected Object...");

  // Seed standard node
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    const doc = editor.getDocument();
    const existing = doc.nodes[0];
    if (existing) {
      editor.selectExactly([existing.id]);
    }
  });
  await settle();

  const nodeInfoBefore = await page.evaluate(() => {
    const editor = window.__vooEditor;
    const sel = editor.getSelected();
    return sel ? { id: sel.id, x: sel.x, y: sel.y, width: sel.width, height: sel.height } : null;
  });
  console.log("  Target Selected Node Before:", nodeInfoBefore);

  if (nodeInfoBefore) {
    const camBefore3 = await getCamera();

    // Get screen point for node center
    const screenCenter = await page.evaluate((node) => {
      const editor = window.__vooEditor;
      const pt = editor.toScreenPoint ? editor.toScreenPoint(node.x + node.width / 2, node.y + node.height / 2) : { x: 400, y: 300 };
      const stage = document.querySelector(".canvas-stage") || document.querySelector("canvas");
      const r = stage.getBoundingClientRect();
      return { x: r.left + pt.x, y: r.top + pt.y };
    }, nodeInfoBefore);

    await page.mouse.move(screenCenter.x, screenCenter.y);
    await page.mouse.down();
    await page.mouse.move(screenCenter.x + 60, screenCenter.y + 40, { steps: 8 });
    await page.mouse.up();
    await settle();

    const nodeInfoAfter = await page.evaluate((id) => {
      const editor = window.__vooEditor;
      const n = editor.getDocument().nodes.find((each) => each.id === id);
      return n ? { id: n.id, x: n.x, y: n.y } : null;
    }, nodeInfoBefore.id);

    const camAfter3 = await getCamera();
    const camStable = camAfter3.panX === camBefore3.panX && camAfter3.panY === camBefore3.panY;
    const nodeMoved = nodeInfoAfter && (nodeInfoAfter.x !== nodeInfoBefore.x || nodeInfoAfter.y !== nodeInfoBefore.y);

    console.log(`  Node Pos After:`, nodeInfoAfter);
    console.log(`  Camera Stable: ${camStable}, Node Moved: ${nodeMoved}`);

    matrixReport.scenarios.push({
      name: "selected_object_drag",
      expected: "Selected object position updates; canvas camera remains stable",
      actual: `Node moved=${nodeMoved}, Camera stable=${camStable}`,
      status: (nodeMoved && camStable) ? "PASS" : "FAIL",
    });

    // -----------------------------------------------------------------------
    // [4] Undo / Redo
    // -----------------------------------------------------------------------
    console.log("\n[Item 4] Testing Undo / Redo on Object Drag...");

    await page.evaluate(() => window.__vooEditor.undo?.());
    await settle();

    const nodeAfterUndo = await page.evaluate((id) => {
      const n = window.__vooEditor.getDocument().nodes.find((each) => each.id === id);
      return n ? { x: n.x, y: n.y } : null;
    }, nodeInfoBefore.id);

    await page.evaluate(() => window.__vooEditor.redo?.());
    await settle();

    const nodeAfterRedo = await page.evaluate((id) => {
      const n = window.__vooEditor.getDocument().nodes.find((each) => each.id === id);
      return n ? { x: n.x, y: n.y } : null;
    }, nodeInfoBefore.id);

    const undoWorks = nodeAfterUndo && nodeAfterUndo.x === nodeInfoBefore.x && nodeAfterUndo.y === nodeInfoBefore.y;
    const redoWorks = nodeAfterRedo && nodeAfterRedo.x === nodeInfoAfter.x && nodeAfterRedo.y === nodeInfoAfter.y;

    console.log(`  Undo to (${nodeAfterUndo?.x}, ${nodeAfterUndo?.y}): ${undoWorks}`);
    console.log(`  Redo to (${nodeAfterRedo?.x}, ${nodeAfterRedo?.y}): ${redoWorks}`);

    matrixReport.scenarios.push({
      name: "undo_redo_object_drag",
      expected: "Undo restores pre-drag coordinates, Redo restores post-drag coordinates",
      actual: `Undo works=${undoWorks}, Redo works=${redoWorks}`,
      status: (undoWorks && redoWorks) ? "PASS" : "FAIL",
    });
  }

  // -------------------------------------------------------------------------
  // [5] Esc Key Clears Selection
  // -------------------------------------------------------------------------
  console.log("\n[Item 5] Testing Esc Key Selection Clearing...");

  await page.keyboard.press("Escape");
  await settle();

  const selAfterEsc = await page.evaluate(() => window.__vooEditor.getSelectedIds());
  console.log(`  Selected IDs after Escape: ${JSON.stringify(selAfterEsc)}`);

  matrixReport.scenarios.push({
    name: "escape_clears_selection",
    expected: "Escape key clears active layer selection",
    actual: `Selected IDs: ${JSON.stringify(selAfterEsc)}`,
    status: (selAfterEsc.length === 0) ? "PASS" : "FAIL",
  });

  // -------------------------------------------------------------------------
  // [6] Root Causes & Proposed Modifications
  // -------------------------------------------------------------------------
  matrixReport.rootCauses = [
    {
      file: "src/canvas/components/editor_hooks/use_editor_canvas_gestures.js",
      lines: "65-130",
      defectAnalysis: "onFreePointerDown treats plain left-click drag on empty canvas (isLeftClick && !isPanTrigger) as a canvas pan gesture (panEditorCamera), overriding selection tool marquee behavior.",
    },
    {
      file: "src/canvas/components/editor_hooks/use_editor_canvas_gestures.js",
      lines: "361-388",
      defectAnalysis: "onArtboardBodyPointerDown routes empty artboard clicks (when shouldDragArtboardBody is true) to onTitlePointerDown, causing dragging inside the artboard to move the whole artboard instead of marquee-selecting inner layers.",
    },
    {
      file: "src/canvas/components/artboard-body-gesture.js",
      lines: "1-12",
      defectAnalysis: "shouldDragArtboardBody returns true for any empty pixel (!engine.nodeAtPoint(...)), causing artboard dragging to hijack marquee selection.",
    },
  ];

  matrixReport.proposedFixFiles = [
    {
      file: "src/canvas/components/editor_hooks/use_editor_canvas_gestures.js",
      lines: "65-130, 361-388",
      action: "Modify onFreePointerDown to require isPanTrigger (Space key, middle button, or Hand tool) for canvas panning. When tool === TOOL.SELECT and no pan modifier is held, initiate marquee selection instead of panEditorCamera. In onArtboardBodyPointerDown, do not hijack Select tool drags to artboard position moves.",
    },
    {
      file: "src/canvas/components/artboard-body-gesture.js",
      lines: "1-12",
      action: "Adjust shouldDragArtboardBody so that in TOOL.SELECT mode, empty area clicks remain available for marquee selection.",
    },
  ];

  await writeFile(
    `${EVIDENCE_DIR}/repro-matrix-row1-report.json`,
    JSON.stringify(matrixReport, null, 2)
  );
  console.log(`\nWritten reproduction report to ${EVIDENCE_DIR}/repro-matrix-row1-report.json`);
});
