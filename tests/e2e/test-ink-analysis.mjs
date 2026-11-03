import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const pixelAnalysis = await page.evaluate(async () => {
    const { measureText, textFont } = await import("/src/canvas/editor/text_metrics.js");

    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 100;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // Test "40k" with Inter loaded vs unloaded
    const testInk = (fontStr, text) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = fontStr;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      const metrics = ctx.measureText(text);
      const startX = 20;
      const startY = 50;

      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, startX, startY);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
      let hasPixels = false;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = imgData.data[(y * canvas.width + x) * 4 + 3];
          if (alpha > 10) { // threshold
            hasPixels = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const inkWidth = hasPixels ? (maxX - minX + 1) : 0;
      const inkLeft = hasPixels ? (minX - startX) : 0;
      const inkRight = hasPixels ? (maxX - startX) : 0;

      return {
        fontStr,
        measuredWidth: metrics.width,
        ceilWidth: Math.ceil(metrics.width),
        actualBoundingBoxRight: metrics.actualBoundingBoxRight,
        actualBoundingBoxLeft: metrics.actualBoundingBoxLeft,
        inkWidth,
        inkLeft,
        inkRight
      };
    };

    // Before loading fonts
    const beforeInter = testInk("12px Inter", "40k");
    const beforeInterSans = testInk("12px Inter, sans-serif", "40k");

    // Load Inter
    await document.fonts.load("12px Inter");

    const afterInter = testInk("12px Inter", "40k");
    const afterInterSans = testInk("12px Inter, sans-serif", "40k");

    return { beforeInter, beforeInterSans, afterInter, afterInterSans };
  });

  console.log("=== INK PIXEL ANALYSIS ===");
  console.log(JSON.stringify(pixelAnalysis, null, 2));
});
