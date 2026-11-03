import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

let savedFigBytes = null;
let savedOriginalGeo = null;
const SAVED_FIG_PATH = "/tmp/uf24-autolayout-exported.fig";

// ============================================================================
// PART 1: Scene setup, real UI export, warm re-import, and history API checks
// ============================================================================
await withEditorBrowser(async ({ page }) => {
  // 1. Prepare scene with ParentFrame -> OrdinaryGroup (with autoLayout) -> 2 Rect children
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model_node_builders.js");
    const { createGroupNode } = await import("/src/canvas/editor/scene_model_groups.js");
    const e = window.__vooEditor;

    const frame = {
      ...createGroupNode({ x: 60, y: 40, width: 600, height: 450 }),
      id: "parent-frame",
      name: "ParentFrame",
      isFrame: true,
      frame: true,
      containerType: "frame",
      fill: "#ffffff",
    };

    const group = {
      ...createGroupNode({ x: 100, y: 80, width: 320, height: 220 }),
      id: "ordinary-group",
      name: "OrdinaryGroup",
      parentId: "parent-frame",
      isFrame: false,
      frame: false,
      containerType: "group",
      autoLayout: {
        direction: "vertical",
        gap: 24,
        padding: { top: 12, right: 16, bottom: 12, left: 16 },
        widthMode: "fixed",
        heightMode: "hug",
      },
    };

    const rect1 = {
      ...createRectNode({ x: 100, y: 80, width: 140, height: 60, fill: "#ff3333" }),
      id: "child-rect-1",
      name: "ChildRect1",
      parentId: "ordinary-group",
    };

    const rect2 = {
      ...createRectNode({ x: 100, y: 164, width: 140, height: 60, fill: "#3366ff" }),
      id: "child-rect-2",
      name: "ChildRect2",
      parentId: "ordinary-group",
    };

    e.setDoc({
      ...e.getDocument(),
      width: 1000,
      height: 700,
      isCanvasRoot: false,
      nodes: [frame, group, rect1, rect2],
    });
  });

  // Helper to extract geometry
  const getSceneGeometry = () =>
    page.evaluate(() => {
      const e = window.__vooEditor;
      const nodes = e.getDocument().nodes;
      const f = nodes.find((n) => n.name === "ParentFrame");
      const g = nodes.find((n) => n.name === "OrdinaryGroup");
      const r1 = nodes.find((n) => n.name === "ChildRect1");
      const r2 = nodes.find((n) => n.name === "ChildRect2");
      return {
        f: f ? { x: f.x, y: f.y, width: f.width, height: f.height } : null,
        g: g
          ? {
              x: g.x,
              y: g.y,
              width: g.width,
              height: g.height,
              isFrame: Boolean(g.isFrame),
              autoLayout: g.autoLayout ? { direction: g.autoLayout.direction, gap: g.autoLayout.gap } : null,
            }
          : null,
        r1: r1 ? { x: r1.x, y: r1.y } : null,
        r2: r2 ? { x: r2.x, y: r2.y } : null,
        r1_rel_g: r1 && g ? { dx: r1.x - g.x, dy: r1.y - g.y } : null,
        r2_rel_g: r2 && g ? { dx: r2.x - g.x, dy: r2.y - g.y } : null,
      };
    });

  const originalGeo = await getSceneGeometry();
  assert.equal(originalGeo.r1_rel_g.dx, 16);
  assert.equal(originalGeo.r1_rel_g.dy, 12);
  assert.equal(originalGeo.r2_rel_g.dx, 16);
  assert.equal(originalGeo.r2_rel_g.dy, 96);
  assert.equal(originalGeo.g.autoLayout.direction, "vertical");
  assert.equal(originalGeo.g.autoLayout.gap, 24);
  savedOriginalGeo = originalGeo;

  // 2. Real UI Export via Titlebar -> Export Dialog -> Figma (.fig) -> Download
  await page.getByTestId("titlebar-export").click();
  const exportDialog = page.getByTestId("design-export-dialog");
  await exportDialog.waitFor({ state: "visible" });

  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: undefined,
    });
  });

  await exportDialog.getByRole("button", { name: /^Figma(?: |$)/ }).click();

  const downloadPromise = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  const figFilePath = await download.path();
  savedFigBytes = await readFile(figFilePath);
  assert.ok(savedFigBytes.length > 200, "Downloaded .fig archive must have content");
  await writeFile(SAVED_FIG_PATH, savedFigBytes);

  // Close export dialog if still present
  if (await page.getByTestId("design-export-dialog").isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.getByTestId("design-export-dialog").waitFor({ state: "detached" });
  }

  // 3. Warm re-import in the existing page/context
  await page.evaluate(() => {
    delete window.showOpenFilePicker;
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: undefined,
    });
  });

  const importButton = page.getByRole("button", { name: /^Import project file|^导入工程文件/ });
  const [warmChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    importButton.click(),
  ]);

  await warmChooser.setFiles({
    name: "warm-roundtrip.fig",
    mimeType: "application/octet-stream",
    buffer: savedFigBytes,
  });

  await page.waitForFunction(() => window.__vooEditor && window.__vooStore?.fileName?.includes("warm-roundtrip"));
  await page.getByTestId("loading-modal").waitFor({ state: "detached" });
  await page.waitForFunction(
    () =>
      window.__vooEditor?.getDocument().nodes.some((n) => n.name === "OrdinaryGroup") &&
      document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off"
  );

  // Compare warm-imported geometry and autoLayout
  const warmGeo = await getSceneGeometry();
  assert.ok(warmGeo.g, "OrdinaryGroup must exist after warm re-import");
  assert.equal(warmGeo.g.isFrame, false, "OrdinaryGroup must retain group container semantics");
  assert.ok(warmGeo.g.autoLayout, "OrdinaryGroup must retain autoLayout");
  assert.equal(warmGeo.g.autoLayout.direction, "vertical");
  assert.equal(warmGeo.g.autoLayout.gap, 24);

  // Child relative coordinates to group must remain preserved without drift
  assert.equal(warmGeo.r1_rel_g.dx, originalGeo.r1_rel_g.dx);
  assert.equal(warmGeo.r1_rel_g.dy, originalGeo.r1_rel_g.dy);
  assert.equal(warmGeo.r2_rel_g.dx, originalGeo.r2_rel_g.dx);
  assert.equal(warmGeo.r2_rel_g.dy, originalGeo.r2_rel_g.dy);

  // 4. History API evidence (updateNode mutation followed by undo)
  await page.evaluate(() => {
    const e = window.__vooEditor;
    const g = e.getDocument().nodes.find((n) => n.name === "OrdinaryGroup");
    e.updateNode(g.id, { x: g.x + 50, y: g.y + 30 });
  });

  const mutatedGeo = await getSceneGeometry();
  assert.equal(mutatedGeo.g.x, warmGeo.g.x + 50);
  assert.equal(mutatedGeo.g.y, warmGeo.g.y + 30);

  // Undo mutation via history API
  await page.evaluate(() => window.__vooEditor.undo());
  const undoneGeo = await getSceneGeometry();
  assert.equal(undoneGeo.g.x, warmGeo.g.x);
  assert.equal(undoneGeo.g.y, warmGeo.g.y);
  assert.equal(undoneGeo.r1_rel_g.dx, originalGeo.r1_rel_g.dx);
  assert.equal(undoneGeo.r1_rel_g.dy, originalGeo.r1_rel_g.dy);

  console.log("[UF24] Warm re-import and history-API evidence verified successfully in initial browser context.");
});

// ============================================================================
// PART 2: Cold reopen in a separate, fresh browser process/context
// ============================================================================
await withEditorBrowser(async ({ page }) => {
  assert.ok(savedFigBytes && savedFigBytes.length > 200, "Saved FIG bytes must exist from Part 1");
  assert.ok(savedOriginalGeo, "Saved original geometry must exist from Part 1");

  // Verify that this new browser process/context is clean and has no OrdinaryGroup from Part 1
  const initialNodes = await page.evaluate(() => window.__vooEditor?.getDocument()?.nodes ?? []);
  assert.equal(
    initialNodes.some((n) => n.name === "OrdinaryGroup"),
    false,
    "Fresh browser process/context must NOT contain OrdinaryGroup before cold import"
  );

  // Configure file picker fallback
  await page.evaluate(() => {
    delete window.showOpenFilePicker;
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: undefined,
    });
  });

  // Real UI import in fresh process
  const importButton = page.getByRole("button", { name: /^Import project file|^导入工程文件/ });
  const [coldChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    importButton.click(),
  ]);

  await coldChooser.setFiles({
    name: "cold-reopen-test.fig",
    mimeType: "application/octet-stream",
    buffer: savedFigBytes,
  });

  await page.waitForFunction(() => window.__vooEditor && window.__vooStore?.fileName?.includes("cold-reopen-test"));
  await page.getByTestId("loading-modal").waitFor({ state: "detached" });
  await page.waitForFunction(
    () =>
      window.__vooEditor?.getDocument().nodes.some((n) => n.name === "OrdinaryGroup") &&
      document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off"
  );

  // Extract and verify cold geometry in fresh runtime
  const coldGeo = await page.evaluate(() => {
    const e = window.__vooEditor;
    const nodes = e.getDocument().nodes;
    const f = nodes.find((n) => n.name === "ParentFrame");
    const g = nodes.find((n) => n.name === "OrdinaryGroup");
    const r1 = nodes.find((n) => n.name === "ChildRect1");
    const r2 = nodes.find((n) => n.name === "ChildRect2");
    return {
      f: f ? { x: f.x, y: f.y, width: f.width, height: f.height } : null,
      g: g
        ? {
            x: g.x,
            y: g.y,
            width: g.width,
            height: g.height,
            isFrame: Boolean(g.isFrame),
            autoLayout: g.autoLayout ? { direction: g.autoLayout.direction, gap: g.autoLayout.gap } : null,
          }
        : null,
      r1: r1 ? { x: r1.x, y: r1.y } : null,
      r2: r2 ? { x: r2.x, y: r2.y } : null,
      r1_rel_g: r1 && g ? { dx: r1.x - g.x, dy: r1.y - g.y } : null,
      r2_rel_g: r2 && g ? { dx: r2.x - g.x, dy: r2.y - g.y } : null,
    };
  });

  assert.ok(coldGeo.g, "OrdinaryGroup must exist after cold reopen");
  assert.equal(coldGeo.g.isFrame, false, "OrdinaryGroup must retain group semantics in cold reopen");
  assert.ok(coldGeo.g.autoLayout, "OrdinaryGroup must retain autoLayout in cold reopen");
  assert.equal(coldGeo.g.autoLayout.direction, savedOriginalGeo.g.autoLayout.direction);
  assert.equal(coldGeo.g.autoLayout.gap, savedOriginalGeo.g.autoLayout.gap);

  // Verify child-relative coordinates match original baseline in fresh process
  assert.equal(coldGeo.r1_rel_g.dx, savedOriginalGeo.r1_rel_g.dx);
  assert.equal(coldGeo.r1_rel_g.dy, savedOriginalGeo.r1_rel_g.dy);
  assert.equal(coldGeo.r2_rel_g.dx, savedOriginalGeo.r2_rel_g.dx);
  assert.equal(coldGeo.r2_rel_g.dy, savedOriginalGeo.r2_rel_g.dy);

  console.log("[UF24] Cold reopen in fresh independent browser process/context passed with exact geometry preservation.");
});
