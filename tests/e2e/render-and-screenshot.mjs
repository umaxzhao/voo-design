import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { createTextNode } = await import("/src/canvas/editor/scene_model_text_effects.js");
    const e = window.__vooEditor;
    const doc = e.getDocument();

    // Create a text node with "40k" at fontSize 12, Inter, boxWidth 0
    const node = {
      ...createTextNode({ x: 100, y: 100, text: "40k", fill: "#9ca3af", fontSize: 12 }),
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal"
    };

    e.setDoc({
      ...doc,
      backgroundColor: "#171717",
      nodes: [node]
    });

    e.select(node.id);
  });

  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-render-40k.png" });
});
