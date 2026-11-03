import assert from "node:assert/strict";
import fs from "node:fs";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );

  // 1. Setup scene with:
  // - Node A: auto-size "40k" (boxWidth: 0), fontSize: 12, Inter
  // - Node B: persisted 18x15 auto-size "40k" (simulating loaded from fallback save)
  // - Node C: fixed-width 18px "40k" (boxWidth: 18)
  const results = await page.evaluate(async () => {
    const { createTextNode } = await import(
      "/src/canvas/editor/scene_model_text_effects.js"
    );
    const e = window.__vooEditor;
    const doc = e.getDocument();

    // Ensure Inter is loaded
    await document.fonts.load("12px Inter");

    const nodeA = {
      ...createTextNode({
        x: 100,
        y: 100,
        text: "40k",
        fill: "#9ca3af",
        fontSize: 12,
      }),
      id: "node-a",
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      boxWidth: 0,
    };

    const nodeB = {
      ...createTextNode({
        x: 100,
        y: 150,
        text: "40k",
        fill: "#9ca3af",
        fontSize: 12,
      }),
      id: "node-b",
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      width: 18,
      height: 15,
      boxWidth: 0,
    };

    const nodeC = {
      ...createTextNode({
        x: 100,
        y: 200,
        text: "40k",
        fill: "#9ca3af",
        fontSize: 12,
      }),
      id: "node-c",
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      width: 18,
      height: 30,
      boxWidth: 18,
    };

    const nodeD = {
      ...createTextNode({
        x: 100,
        y: 260,
        text: "f",
        fill: "#9ca3af",
        fontSize: 32,
      }),
      id: "node-d",
      fontFamily: "Inter, sans-serif",
      fontWeight: "normal",
      italic: true,
      boxWidth: 0,
    };

    e.setDoc({
      ...doc,
      backgroundColor: "#171717",
      nodes: [nodeA, nodeB, nodeC, nodeD],
    });

    return {
      nodeA: e.getNode("node-a"),
      nodeB: e.getNode("node-b"),
      nodeC: e.getNode("node-c"),
      nodeD: e.getNode("node-d"),
    };
  });

  await settle();

  // Test Node A (live auto-size measured text)
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly(["node-a"]);
  });
  await settle();

  const boundsA = await page.evaluate(async () => {
    const { nodeAABB } = await import("/src/canvas/editor/scene_geometry.js");
    const e = window.__vooEditor;
    const node = e.getNode("node-a");
    const eff = e.getEffectiveNode(node);
    const box = nodeAABB(eff);
    return { node, eff, box };
  });

  console.log("Node A bounds:", JSON.stringify(boundsA, null, 2));
  assert.ok(
    boundsA.box.width >= 21.9,
    `Node A selection box width (${boundsA.box.width}) must be >= 21.9px`,
  );

  // Test Node B (persisted fallback 18x15 text node)
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly(["node-b"]);
  });
  await settle();

  const boundsB = await page.evaluate(async () => {
    const { nodeAABB } = await import("/src/canvas/editor/scene_geometry.js");
    const e = window.__vooEditor;
    const node = e.getNode("node-b");
    const eff = e.getEffectiveNode(node);
    const box = nodeAABB(eff);
    return { node, eff, box };
  });

  console.log("Node B bounds:", JSON.stringify(boundsB, null, 2));
  assert.ok(
    boundsB.box.width >= 21.9,
    `Node B effective selection box width (${boundsB.box.width}) must encompass the full 22px text`,
  );

  // Test Node C (fixed-width 18px)
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly(["node-c"]);
  });
  await settle();

  const boundsC = await page.evaluate(async () => {
    const { nodeAABB } = await import("/src/canvas/editor/scene_geometry.js");
    const e = window.__vooEditor;
    const node = e.getNode("node-c");
    const eff = e.getEffectiveNode(node);
    const box = nodeAABB(eff);
    return { node, eff, box };
  });

  console.log("Node C bounds:", JSON.stringify(boundsC, null, 2));
  assert.equal(
    boundsC.box.width,
    18,
    "Node C fixed box width must strictly remain 18px",
  );

  // Test Node D (Italic / left-bearing text node)
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.selectExactly(["node-d"]);
  });
  await settle();

  const boundsD = await page.evaluate(async () => {
    const { nodeAABB } = await import("/src/canvas/editor/scene_geometry.js");
    const e = window.__vooEditor;
    const node = e.getNode("node-d");
    const eff = e.getEffectiveNode(node);
    const box = nodeAABB(eff);
    return { node, eff, box };
  });

  console.log("Node D bounds:", JSON.stringify(boundsD, null, 2));
  assert.ok(
    boundsD.box.x <= boundsD.node.x,
    `Node D box.x (${boundsD.box.x}) must enclose leftward glyph overhang (node.x: ${boundsD.node.x})`,
  );
  assert.ok(
    boundsD.box.width >= boundsD.node.width,
    `Node D box width (${boundsD.box.width}) must be >= typographic advance width (${boundsD.node.width})`,
  );

  // Take high-zoom screenshot of Node B selected to verify pixels
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    e.selectExactly(["node-b"]);
    // Center camera on node-b at 800% zoom (same as user observation)
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({
      editorCamera: { zoom: 8, panX: -600, panY: -1050 },
      pendingArtboardFitId: null,
    });
  });
  await settle();

  // Compute exact screen ROI of the selected text node to strictly exclude panels / outside chrome
  const screenROI = await page.evaluate(async () => {
    const { nodeAABB } = await import("/src/canvas/editor/scene_geometry.js");
    const { docToScreenRect } = await import("/src/canvas/editor/chrome_coords.js");
    const e = window.__vooEditor;
    const { useDesignStore } = await import("/src/store/design_store.js");
    const viewport = useDesignStore.getState().editorCamera;
    const node = e.getNode("node-b");
    const eff = e.getEffectiveNode(node);
    const box = nodeAABB(eff);
    const screenRect = docToScreenRect(box, viewport);
    return {
      x: Math.max(0, Math.round(screenRect.x - 20)),
      y: Math.max(0, Math.round(screenRect.y - 20)),
      width: Math.round(screenRect.width + 40),
      height: Math.round(screenRect.height + 40),
    };
  });

  await page.screenshot({ path: "test-fixed-40k-selected.png" });

  // Strict local ROI pixel analysis (isolated crop, zero panel interference)
  const pngB64 = fs.readFileSync("test-fixed-40k-selected.png").toString("base64");
  const pixelCheck = await page.evaluate(async ({ b64, roi }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();

    // Isolated crop canvas strictly around the selected node
    const canvas = document.createElement("canvas");
    canvas.width = roi.width;
    canvas.height = roi.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
    const data = ctx.getImageData(0, 0, roi.width, roi.height).data;

    let frameMinX = 9999,
      frameMaxX = -1,
      textMinX = 9999,
      textMaxX = -1;
    let greenPixelCount = 0;
    let textPixelCount = 0;

    // Scan inside the cropped local ROI (excluding outer top 5px / bottom 5px to avoid rotation knob/chip)
    for (let y = 10; y < roi.height - 10; y++) {
      for (let x = 0; x < roi.width; x++) {
        const i = (y * roi.width + x) * 4;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        // Mint green frame line
        if (g > 200 && r > 120 && b > 180) {
          greenPixelCount++;
          if (x < frameMinX) frameMinX = x;
          if (x > frameMaxX) frameMaxX = x;
        }
        // Grey text
        if (
          r > 80 &&
          r < 180 &&
          g > 80 &&
          g < 180 &&
          b > 80 &&
          b < 190 &&
          Math.abs(r - g) < 25 &&
          Math.abs(g - b) < 25
        ) {
          textPixelCount++;
          if (x < textMinX) textMinX = x;
          if (x > textMaxX) textMaxX = x;
        }
      }
    }
    return {
      roi,
      greenPixelCount,
      textPixelCount,
      frameMinX,
      frameMaxX,
      textMinX,
      textMaxX,
      frameWidth: frameMaxX - frameMinX + 1,
      textWidth: textMaxX - textMinX + 1,
      rightMargin: frameMaxX - textMaxX,
      leftMargin: textMinX - frameMinX,
    };
  }, { b64: pngB64, roi: screenROI });

  console.log("Strict Isolated Node ROI Pixel Check:", JSON.stringify(pixelCheck, null, 2));

  assert.ok(
    pixelCheck.greenPixelCount >= 20,
    `Must find sufficient green frame pixels in ROI (found ${pixelCheck.greenPixelCount})`,
  );
  assert.ok(
    pixelCheck.textPixelCount >= 50,
    `Must find sufficient text pixels in ROI (found ${pixelCheck.textPixelCount})`,
  );
  assert.ok(
    pixelCheck.frameMaxX >= pixelCheck.textMaxX - 0.5,
    `Frame right edge (${pixelCheck.frameMaxX}) must enclose text right edge (${pixelCheck.textMaxX}) — text must NOT hang out!`,
  );
  assert.ok(
    pixelCheck.textMinX >= pixelCheck.frameMinX - 1.0,
    `Text left edge (${pixelCheck.textMinX}) must not protrude past frame left edge (${pixelCheck.frameMinX})`,
  );

  // Undo / Redo verification
  await page.evaluate(async () => {
    const { updateNode } = await import("/src/canvas/editor/doc_ops.js");
    const e = window.__vooEditor;
    // Move node-b
    const node = e.getNode("node-b");
    e.setDoc(
      updateNode(e.getDocument(), "node-b", { x: node.x + 50 }),
      { commit: true, name: "move-text" },
    );
  });
  await settle();

  const movedX = await page.evaluate(() => window.__vooEditor.getNode("node-b").x);
  assert.equal(movedX, 150, "Node B must have moved to x: 150");

  await page.evaluate(() => window.__vooEditor.undo());
  await settle();
  const undoneX = await page.evaluate(() => window.__vooEditor.getNode("node-b").x);
  assert.equal(undoneX, 100, "Node B must restore to x: 100 after 1 undo");

  await page.evaluate(() => window.__vooEditor.redo());
  await settle();
  const redoneX = await page.evaluate(() => window.__vooEditor.getNode("node-b").x);
  assert.equal(redoneX, 150, "Node B must restore to x: 150 after 1 redo");

  await page.evaluate(() => window.__vooEditor.undo());
  await settle();

  // Cold reopen / roundtrip verification
  const serialized = await page.evaluate(async () => {
    const { serialiseDocument } = await import("/src/canvas/editor/scene_model.js");
    return serialiseDocument(window.__vooEditor.getDocument());
  });

  assert.ok(serialized, "Document serialization must succeed");

  await page.evaluate(async (savedDoc) => {
    const e = window.__vooEditor;
    await e.open({ savedDoc });
  }, serialized);
  await settle();

  const reopenedBounds = await page.evaluate(async () => {
    const { nodeAABB } = await import("/src/canvas/editor/scene_geometry.js");
    const e = window.__vooEditor;
    e.selectExactly(["node-b"]);
    const node = e.getNode("node-b");
    const eff = e.getEffectiveNode(node);
    return { box: nodeAABB(eff) };
  });

  console.log("Reopened bounds:", JSON.stringify(reopenedBounds, null, 2));
  assert.ok(
    reopenedBounds.box.width >= 21.9,
    "Reopened text node effective selection box must still encompass full text",
  );

  console.log("ALL 40K TEXT BOUNDS VERIFICATIONS PASSED!");
});
