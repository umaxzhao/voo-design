import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const matches = await page.evaluate(async () => {
    const { measureText, getTextLayout } = await import("/src/canvas/editor/text_metrics.js");

    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");

    const fonts = [
      "Inter",
      "Roboto",
      "Arial",
      "Helvetica",
      "Helvetica Neue",
      "system-ui",
      "-apple-system",
      "BlinkMacSystemFont",
      "Segoe UI",
      "PingFang SC",
      "Microsoft YaHei",
      "sans-serif"
    ];

    const weights = ["normal", "400", "500", "600", "bold", "700"];
    const fontSizes = [10, 11, 12, 13, 14];
    const letterSpacings = [0, -0.5, -1, 0.5, 1];
    const boxWidths = [0, 18];

    const hits = [];

    for (const font of fonts) {
      for (const weight of weights) {
        for (const fontSize of fontSizes) {
          for (const letterSpacing of letterSpacings) {
            for (const boxWidth of boxWidths) {
              const node = {
                id: "test",
                kind: "text",
                x: 0,
                y: 0,
                text: "40k",
                fontFamily: font,
                fontWeight: weight,
                fontSize,
                letterSpacing,
                boxWidth,
                lineHeight: 1.25
              };
              const size = measureText(ctx, node);
              if (size.width === 18 && size.height === 15) {
                const layout = getTextLayout(ctx, node);
                hits.push({
                  font,
                  weight,
                  fontSize,
                  letterSpacing,
                  boxWidth,
                  size,
                  lines: layout.lines,
                  widths: layout.widths
                });
              }
            }
          }
        }
      }
    }
    return hits;
  });

  console.log(`Found ${matches.length} matching configurations for 18x15:`);
  console.log(JSON.stringify(matches, null, 2));
});
