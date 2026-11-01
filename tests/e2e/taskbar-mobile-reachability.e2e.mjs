import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const rect = { ...createRectNode({ x: 100, y: 100, width: 100, height: 100 }), id: "rect-1" };
    e.setDoc({ ...e.getDocument(), nodes: [rect] });
    e.select("rect-1");
  });

  const taskbar = page.getByTestId("editor-contextual-taskbar");
  await taskbar.waitFor();

  // In 390px viewport, contextual taskbar has overflow and provides scroll controls
  const rightScroll = page.getByTestId("editor-taskbar-scroll-right");
  assert.ok(await rightScroll.isVisible(), "Scroll right control is visible when taskbar items overflow");

  // Verify that initially off-screen items (e.g. duplicate, lock, hide, delete, ai) become fully reachable
  const delBtn = page.getByTestId("editor-taskbar-delete");
  const aiBtn = page.getByTestId("editor-taskbar-ai-sparkle");

  // Initially they are beyond the 390px viewport right boundary
  const initialBox = await delBtn.boundingBox();
  assert.ok(initialBox.x + initialBox.width > 390, "Delete button is initially past screen boundary");

  // Click scroll right arrow
  await rightScroll.click();
  await rightScroll.click();

  // After scrolling via visible control, delete and AI buttons are inside viewport and clickable
  const delBoxAfter = await delBtn.boundingBox();
  assert.ok(delBoxAfter.x >= 0 && delBoxAfter.x + delBoxAfter.width <= 390, "Delete button is inside 390px viewport after scroll");

  const aiBoxAfter = await aiBtn.boundingBox();
  assert.ok(aiBoxAfter.x >= 0 && aiBoxAfter.x + aiBoxAfter.width <= 390, "AI button is inside 390px viewport after scroll");

  // Scroll left button is now visible and can scroll back
  const leftScroll = page.getByTestId("editor-taskbar-scroll-left");
  assert.ok(await leftScroll.isVisible(), "Scroll left control is visible");
  await leftScroll.click();
  await leftScroll.click();

  const flipH = page.getByTestId("editor-taskbar-flipH");
  const flipHBox = await flipH.boundingBox();
  assert.ok(flipHBox.x >= 0 && flipHBox.x + flipHBox.width <= 390, "Initial items are back inside viewport");

  assert.deepEqual(errors, []);
  console.log("390px taskbar all buttons reachable via visible navigation passed.");
});
