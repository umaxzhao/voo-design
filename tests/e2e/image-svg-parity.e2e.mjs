import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page
}) => {
  const audit = imageAudit(page, "svg-parity");
  const patches = {
    original: {},
    backgroundBlur: {
      opacity: 0.5,
      backgroundBlur: 12
    },
    glass: {
      effects: {
        glass: {
          enabled: true,
          blur: 12,
          tint: "#ffffff",
          opacity: 30,
          highlight: 40
        }
      }
    },
    adjustmentLayer: {},
    selectionBackdrop: {
      backgroundBlur: 12
    },
    flipH: {
      flipH: true
    },
    flipV: {
      flipV: true
    },
    rotation: {
      rotation: 30
    },
    opacity: {
      opacity: 0.5
    },
    crop: {
      crop: {
        x: 0,
        y: 0,
        width: 40,
        height: 80
      }
    },
    invert: {
      adjustments: {
        invert: {
          enabled: true
        }
      }
    },
    overlay: {
      effects: {
        fill: {
          enabled: true,
          color: "#00ff00",
          opacity: 100
        }
      }
    },
    overlayOpacityStroke: {
      opacity: 0.5,
      stroke: "#000000",
      strokeWidth: 3,
      effects: {
        fill: {
          enabled: true,
          color: "#00ff00",
          opacity: 50
        }
      }
    },
    shadow: {
      effects: {
        shadow: {
          enabled: true,
          color: "#000000",
          opacity: 70,
          blur: 8,
          offsetX: 5,
          offsetY: 6
        }
      }
    },
    bevel: {
      effects: {
        bevel: {
          enabled: true,
          size: 8,
          depth: 60,
          angle: 135
        }
      }
    }
  };
  for (const [name, patch] of Object.entries(patches)) await audit.record(name, async () => {
    const node = await audit.seed();
    const result = await page.evaluate(async ({
      id,
      patch,
      name
    }) => {
      const engine = window.__vooEditor;
      const {
        createRectNode,
        createAdjustmentNode
      } = await import("/src/canvas/editor/scene_model.js");
      const contextCase = ["backgroundBlur", "glass", "adjustmentLayer", "selectionBackdrop"].includes(name);
      if (contextCase) {
        const doc = engine.getDocument();
        const backdrop = createRectNode({
          x: 150,
          y: 100,
          width: 200,
          height: 200,
          fill: "linear-gradient(90deg, #ff0000 0%, #ff0000 50%, #0000ff 50%, #0000ff 100%)"
        });
        const adjustment = createAdjustmentNode({
          adjustments: {
            invert: {
              enabled: true
            }
          }
        });
        engine.setDoc({
          ...doc,
          nodes: [backdrop, ...doc.nodes, ...(name === "adjustmentLayer" ? [adjustment] : [])]
        });
      }
      engine.updateNode(id, patch);
      const {
        renderEngineSvg
      } = await import("/src/canvas/components/editor_hooks/export_editor_image.js");
      let svg, png;
      if (name === "selectionBackdrop") {
        const {
          exportSvgNodes
        } = await import("/src/canvas/editor/editor-svg-resources.js");
        const selected = engine.getDocument().nodes.filter(node => node.id === id);
        svg = exportSvgNodes(selected, {
          cache: {
            get: node => engine.getNodeBitmap(node)
          }
        });
        png = engine.exportSelectionPng([id]).dataUrl;
      } else {
        svg = renderEngineSvg(engine);
        png = await engine.exportImageAsync({
          type: "image/png",
          transparent: false
        });
      }
      const decode = async src => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [actual, expected] = await Promise.all([decode(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`), decode(png)]);
      let changed = 0,
        error = 0;
      for (let i = 0; i < expected.length; i++) {
        const delta = Math.abs(actual[i] - expected[i]);
        if (delta > 2) changed++;
        error += delta;
      }
      return {
        changedChannels: changed,
        averageError: error / expected.length,
        rasterFallback: svg.includes("data-voo-raster"),
        sceneFallback: svg.includes('data-voo-raster="scene"')
      };
    }, {
      id: node.id,
      patch,
      name
    });
    // The two browser rasterizers may antialias transformed edges differently.
    assert.ok(result.averageError < 0.2, `SVG differs from the visible image: ${JSON.stringify(result)}`);
    if (["backgroundBlur", "glass", "adjustmentLayer", "selectionBackdrop"].includes(name)) assert.equal(result.sceneFallback, true);
    return result;
  });
  audit.finish();
});
