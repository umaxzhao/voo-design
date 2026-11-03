import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  // 1. Create a solid vector star
  const setupResult = await page.evaluate(async () => {
    const { starNodeFromBox } = await import("/src/canvas/editor/shape_geometry.js");
    const e = window.__vooEditor;

    const star = {
      ...starNodeFromBox(
        { x: 50, y: 50, width: 195, height: 195 },
        { spikes: 5, innerRatio: 0.382, fill: "#ff6600", stroke: "#000000", strokeWidth: 0 }
      ),
      id: "vector-star-1",
      name: "Star",
    };

    e.setDoc({
      ...e.getDocument(),
      width: 400,
      height: 400,
      nodes: [star],
    });

    e.selectExactly(["vector-star-1"]);
    return { id: star.id, kind: star.kind };
  });

  assert.equal(setupResult.kind, "path", "Vector star must be a path node");

  // Helper to extract image pixels from editor canvas
  const getCanvasPixelData = () =>
    page.evaluate(async () => {
      const e = window.__vooEditor;
      const canvas = await e.exportPngCanvasAsync();
      const ctx = canvas.getContext("2d");
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        data: Array.from(imgData.data),
      };
    });

  // State 1: Solid vector star without any effects
  const basePixels = await getCanvasPixelData();

  // State 2: Add adjustments.blur = { enabled: true, value: 70 } via editor updateNode
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("vector-star-1", {
      adjustments: {
        blur: { enabled: true, value: 70 },
      },
    });
  });

  const blur70EnabledPixels = await getCanvasPixelData();

  // State 3: Toggle adjustments.blur to enabled: false (eye off)
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("vector-star-1", {
      adjustments: {
        blur: { enabled: false, value: 70 },
      },
    });
  });

  const blur70DisabledPixels = await getCanvasPixelData();

  // Calculate pixel differences between blur70Enabled and blur70Disabled
  let diffCountEnabledVsDisabled = 0;
  let maxChannelDiffEnabledVsDisabled = 0;
  for (let i = 0; i < blur70EnabledPixels.data.length; i++) {
    const d = Math.abs(blur70EnabledPixels.data[i] - blur70DisabledPixels.data[i]);
    if (d > 0) {
      diffCountEnabledVsDisabled++;
      maxChannelDiffEnabledVsDisabled = Math.max(maxChannelDiffEnabledVsDisabled, d);
    }
  }

  // Calculate pixel differences between blur70Enabled and base (no adjustments)
  let diffCountEnabledVsBase = 0;
  for (let i = 0; i < blur70EnabledPixels.data.length; i++) {
    if (blur70EnabledPixels.data[i] !== basePixels.data[i]) {
      diffCountEnabledVsBase++;
    }
  }

  console.log("=== PRE-FIX REPRODUCTION EVIDENCE ===");
  console.log("Canvas size:", blur70EnabledPixels.width, "x", blur70EnabledPixels.height);
  console.log("diffCountEnabledVsDisabled:", diffCountEnabledVsDisabled);
  console.log("maxChannelDiffEnabledVsDisabled:", maxChannelDiffEnabledVsDisabled);
  console.log("diffCountEnabledVsBase:", diffCountEnabledVsBase);

  // Exact reproduction confirmation: RGBA diff is 0!
  assert.equal(diffCountEnabledVsDisabled, 0, "Reproduction confirmed: adjustments.blur enabled vs disabled has 0 RGBA diff on vector star!");
  assert.equal(diffCountEnabledVsBase, 0, "Reproduction confirmed: adjustments.blur 70% does not alter vector star pixels at all!");

  // State 4: Set layerBlur: 20
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNode("vector-star-1", {
      layerBlur: 20,
    });
  });

  const layerBlurPixels = await getCanvasPixelData();
  let diffCountLayerBlurVsBase = 0;
  for (let i = 0; i < layerBlurPixels.data.length; i++) {
    if (layerBlurPixels.data[i] !== basePixels.data[i]) {
      diffCountLayerBlurVsBase++;
    }
  }

  console.log("diffCountLayerBlurVsBase:", diffCountLayerBlurVsBase);
  assert.ok(diffCountLayerBlurVsBase > 100, "layerBlur (20px) is genuinely effective and alters canvas pixels!");

  // Check UI presence: AddKindPicker currently exposes FILTER_KINDS (including blur) when vector is selected
  // We can verify this via inspecting AddKindPicker behavior when isImage is false
  console.log("UF22 pre-fix reproduction verified successfully: percentBlur has 0 effect on vector star while layerBlur is active.");
});
