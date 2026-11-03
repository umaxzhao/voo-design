import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { createTextNode } = await import("/src/canvas/editor/scene_model_text_effects.js");
    const e = window.__vooEditor;
    const doc = e.getDocument();

    // Node 1: boxWidth: 18, fontSize: 12
    const node1 = {
      ...createTextNode({ x: 100, y: 100, text: "40k", fill: "#9ca3af", fontSize: 12 }),
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      boxWidth: 18
    };

    // Node 2: width: 18, height: 15, boxWidth: 0, text: "40k" (what if persisted width is 18?)
    const node2 = {
      ...createTextNode({ x: 200, y: 100, text: "40k", fill: "#9ca3af", fontSize: 12 }),
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      width: 18,
      height: 15,
      boxWidth: 0
    };

    e.setDoc({
      ...doc,
      backgroundColor: "#171717",
      nodes: [node1, node2]
    });

    e.select(node1.id);
  });

  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const e = window.__vooEditor;
    return e.getDocument().nodes;
  });
  console.log("Nodes after setDoc:", JSON.stringify(info, null, 2));

  // Zoom in on the canvas
  await page.evaluate(() => {
    const { useDesignStore } = window;
    // zoom to 400%
    window.__vooEditor.setZoom?.(4);
  });

  await page.screenshot({ path: "test-boxwidth-18.png" });
});
