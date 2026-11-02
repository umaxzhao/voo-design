import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "layer-alpha");
  for (const kind of ["innerShadow", "innerGlow", "satin", "gradientOverlay", "fill", "stroke", "bevel"]) {
    await audit.record(kind, async () => {
      const node = await audit.seed();
      await page.evaluate(async ({
        id,
        kind
      }) => {
        const {
          starterEffect
        } = await import("/src/canvas/editor/adjustment_starters.js");
        window.__vooEditor.updateNode(id, {
          opacity: 0.5,
          effects: {
            [kind]: starterEffect(kind)
          }
        });
      }, {
        id: node.id,
        kind
      });
      const result = await page.evaluate(async id => {
        const exported = window.__vooEditor.exportSelectionPng([id], {
          transparent: true
        });
        const bitmap = await createImageBitmap(await (await fetch(exported.dataUrl)).blob());
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let maximumAlpha = 0;
          for (let i = 3; i < pixels.length; i += 4) maximumAlpha = Math.max(maximumAlpha, pixels[i]);
          return {
            maximumAlpha,
            holeAlpha: pixels[(8 * canvas.width + 88) * 4 + 3]
          };
        } finally {
          bitmap.close();
        }
      }, node.id);
      assert.ok(result.maximumAlpha >= 127 && result.maximumAlpha <= 128, "Apply the layer's 50% opacity once to the completed style");
      assert.equal(result.holeAlpha, 0, "A layer style must not paint transparent holes or the page behind them");
      return result;
    });
  }
  await audit.record("text-bevel-size-and-history", async () => {
    await audit.seed();
    await page.evaluate(async () => {
      const {
        createTextNode
      } = await import("/src/canvas/editor/scene_model.js");
      const engine = window.__vooEditor;
      engine.setDoc({
        ...engine.getDocument(),
        nodes: [{
          ...createTextNode({
            x: 200,
            y: 160,
            text: "OO",
            fontSize: 70,
            fill: "#808080"
          }),
          id: "bevel-text"
        }]
      });
    });
    const before = await audit.pixels("bevel-text");
    for (const size of [2, 12]) {
      await page.evaluate(size => window.__vooEditor.updateNode("bevel-text", {
        effects: {
          bevel: {
            enabled: true,
            size,
            depth: 80,
            angle: 135
          }
        }
      }), size);
      const pixels = await audit.pixels("bevel-text");
      assert.notDeepEqual(pixels, before);
      if (size === 2) await page.evaluate(value => {
        window.__auditSmallBevel = value;
      }, pixels);else assert.notDeepEqual(pixels, await page.evaluate(() => window.__auditSmallBevel));
    }
    await tool("undo");
    await tool("undo");
    assert.deepEqual(await audit.pixels("bevel-text"), before);
    return {
      glyphPixels: true,
      sizeEffective: true,
      history: true
    };
  });
  audit.finish();
});
