import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate(async () => {
    const { createRectNode, createGroupNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const frame = {
      ...createGroupNode({ x: 50, y: 50, width: 300, height: 300 }),
      id: "frame-1",
      isFrame: true,
    };
    const rect = {
      ...createRectNode({ x: 70, y: 70, width: 100, height: 100 }),
      id: "rect-1",
      parentId: "frame-1",
      constraints: { horizontal: "left", vertical: "top" },
    };
    e.setDoc({ ...e.getDocument(), nodes: [frame, rect] });
    e.select("rect-1");
  });

  const centerH = page.getByTestId("editor-constraints-center-horizontal");
  const centerV = page.getByTestId("editor-constraints-center-vertical");

  await centerH.waitFor();
  await centerV.waitFor();

  // Clicking horizontal center pin updates only horizontal constraint
  await centerH.click();
  let constraints = await page.evaluate(
    () => window.__vooEditor.getDocument().nodes.find((n) => n.id === "rect-1").constraints,
  );
  assert.deepEqual(constraints, { horizontal: "center", vertical: "top" });

  // Clicking vertical center pin updates only vertical constraint
  await centerV.click();
  constraints = await page.evaluate(
    () => window.__vooEditor.getDocument().nodes.find((n) => n.id === "rect-1").constraints,
  );
  assert.deepEqual(constraints, { horizontal: "center", vertical: "center" });

  assert.deepEqual(errors, []);
  console.log("Constraints diagram center pin isolation passed.");
});
