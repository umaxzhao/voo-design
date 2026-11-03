import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const diag = await page.evaluate(async () => {
    const { measureText, getTextLayout, textFont, textLineHeight } = await import("/src/canvas/editor/text_metrics.js");
    const { createTextNode } = await import("/src/canvas/editor/scene_model_text_effects.js");
    const { paintTextBody } = await import("/src/canvas/editor/render_text_node.js");

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");

    const fontsLoaded = [];
    for (const font of document.fonts) {
      fontsLoaded.push({ family: font.family, status: font.status, weight: font.weight });
    }

    // Test text "40k" with various parameters
    const results = [];
    const fontFamilies = [
      "system-ui, -apple-system, 'Segoe UI', sans-serif",
      "Inter, sans-serif",
      "sans-serif",
      "monospace"
    ];
    const fontSizes = [11, 12, 13, 14, 15, 16, 18, 24];
    const boxWidths = [0, 18, 20, 25];

    for (const fontFamily of fontFamilies) {
      for (const fontSize of fontSizes) {
        for (const boxWidth of boxWidths) {
          const node = {
            id: "test",
            kind: "text",
            x: 50,
            y: 50,
            text: "40k",
            fontFamily,
            fontSize,
            boxWidth,
            letterSpacing: 0,
            lineHeight: 1.25
          };
          const size = measureText(ctx, node);
          const layout = getTextLayout(ctx, node);
          results.push({
            fontFamily,
            fontSize,
            boxWidth,
            size,
            lines: layout.lines,
            widths: layout.widths,
            baseline: layout.baseline
          });
        }
      }
    }

    return { fontsLoaded, results };
  });

  console.log("=== FONTS LOADED ===");
  console.log(JSON.stringify(diag.fontsLoaded, null, 2));

  console.log("=== RESULTS WITH width == 18 or height == 15 ===");
  const matching = diag.results.filter(r => r.size.width === 18 || r.size.height === 15 || r.boxWidth === 18);
  console.log(JSON.stringify(matching, null, 2));

  console.log("=== RESULTS WITH boxWidth === 0 ===");
  const autoSize = diag.results.filter(r => r.boxWidth === 0 && r.fontSize <= 16);
  console.log(JSON.stringify(autoSize, null, 2));
});
