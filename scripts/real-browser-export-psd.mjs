import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { initializeCanvas, readPsd } from "ag-psd";
import { withEditorBrowser } from "../tests/e2e/editor-browser-fixture.mjs";

function installCanvasStubs() {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  const makeImageData = (width, height) =>
    new ImageData(new Uint8ClampedArray(width * height * 4), width, height);
  initializeCanvas(
    (width, height) => ({
      width,
      height,
      getContext: () => ({
        putImageData() {},
        createImageData: makeImageData,
      }),
    }),
    makeImageData,
  );
}
installCanvasStubs();

const EVIDENCE_DIR = "/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/uf26-20261103T003655Z";
const OUTPUT_PSD_PATH = `${EVIDENCE_DIR}/uf26-browser-api-export.psd`;

await withEditorBrowser(async ({ page }) => {
  console.log("Setting up UF26 Frame fidelity document in browser engine...");

  // Inject document adhering to visibility & geometry contract
  const docToInject = {
    version: 1,
    width: 600,
    height: 500,
    backgroundColor: "transparent",
    nodes: [
      {
        id: "frame-white",
        kind: "group",
        isFrame: true,
        frame: true,
        name: "White Frame",
        x: 20,
        y: 20,
        width: 250,
        height: 180,
        fill: "#ffffff",
        fillOpacity: 1,
        visible: true,
        opacity: 1,
      },
      {
        id: "child-graphic-1",
        kind: "rect",
        parentId: "frame-white",
        name: "Child Graphic",
        x: 40,
        y: 40,
        width: 80,
        height: 60,
        fill: "#ff0000",
        visible: true,
        opacity: 1,
      },
      {
        id: "frame-empty-black",
        kind: "group",
        isFrame: true,
        frame: true,
        name: "Empty Black Frame",
        x: 300,
        y: 20,
        width: 200,
        height: 180,
        fill: "#000000",
        fillOpacity: 1,
        visible: true,
        opacity: 1,
      },
      {
        id: "frame-empty-clear",
        kind: "group",
        isFrame: true,
        frame: true,
        name: "Empty Clear Frame",
        x: 20,
        y: 240,
        width: 150,
        height: 120,
        fill: "transparent",
        visible: true,
        opacity: 1,
      },
    ],
  };

  const injectedDoc = await page.evaluate((doc) => {
    const editor = window.__vooEditor;
    if (typeof editor.setDoc === "function") {
      editor.setDoc(doc);
    } else if (typeof editor.setDocument === "function") {
      editor.setDocument(doc);
    }
    return editor.getDocument();
  }, docToInject);

  // Assertion on getDocument() content after injection
  assert.ok(injectedDoc, "Document must be present in editor after injection");
  assert.equal(injectedDoc.nodes.length, 4, "All 4 nodes must be registered in editor document");
  assert.ok(injectedDoc.nodes.some((n) => n.id === "frame-white" && n.visible === true), "White Frame must be present and visible");
  assert.ok(injectedDoc.nodes.some((n) => n.id === "child-graphic-1" && n.visible === true), "Child graphic must be present and visible");
  assert.ok(injectedDoc.nodes.some((n) => n.id === "frame-empty-black" && n.visible === true), "Empty Black Frame must be present and visible");
  assert.ok(injectedDoc.nodes.some((n) => n.id === "frame-empty-clear" && n.visible === true), "Empty Clear Frame must be present and visible");

  console.log("Document injection verified via getDocument(). Triggering browser exportPsd()...");

  // Trigger exportPsd via browser engine / API
  const psdArray = await page.evaluate(async () => {
    const editor = window.__vooEditor;
    const arrayBuffer = await editor.exportPsd();
    return Array.from(new Uint8Array(arrayBuffer));
  });

  const psdBuffer = Buffer.from(psdArray);
  console.log(`Exported PSD size: ${psdBuffer.length} bytes.`);
  assert.ok(psdBuffer.length > 500, "PSD buffer must be substantial");
  assert.equal(psdBuffer.subarray(0, 4).toString(), "8BPS", "Must have valid 8BPS header");

  await writeFile(OUTPUT_PSD_PATH, psdBuffer);
  console.log(`Saved exported PSD to: ${OUTPUT_PSD_PATH}`);

  // Read back and parse PSD to verify layer structure and pixel fidelity
  const parsed = readPsd(psdBuffer, { useImageData: true });
  console.log("Parsed PSD canvas dimensions:", parsed.width, "x", parsed.height);
  console.log("Root layers in PSD:", parsed.children.map((c) => c.name));

  // 1. Verify White Frame layer group and its background layer
  const whiteFrameLayer = parsed.children.find((c) => c.name === "White Frame");
  assert.ok(whiteFrameLayer, "White Frame layer group must exist in PSD");
  assert.ok(whiteFrameLayer.children?.length >= 2, "White Frame must contain child graphic and its background fill layer");

  const whiteBg = whiteFrameLayer.children.find((c) => c.name.includes("Background"));
  assert.ok(whiteBg, "White Frame Background layer must exist");
  assert.equal(whiteBg.left, 20);
  assert.equal(whiteBg.top, 20);
  assert.equal(whiteBg.right, 270);
  assert.equal(whiteBg.bottom, 200);
  assert.equal(whiteBg.imageData.width, 250);
  assert.equal(whiteBg.imageData.height, 180);
  assert.equal(whiteBg.imageData.data[0], 255, "Red channel must be 255 (white)");
  assert.equal(whiteBg.imageData.data[1], 255, "Green channel must be 255 (white)");
  assert.equal(whiteBg.imageData.data[2], 255, "Blue channel must be 255 (white)");
  assert.equal(whiteBg.imageData.data[3], 255, "Alpha channel must be 255 (opaque)");

  // 2. Verify Empty Black Frame layer group and its background layer
  const blackFrameLayer = parsed.children.find((c) => c.name === "Empty Black Frame");
  assert.ok(blackFrameLayer, "Empty Black Frame layer group must exist in PSD");
  const blackBg = blackFrameLayer.children?.find((c) => c.name.includes("Background"));
  assert.ok(blackBg, "Empty Black Frame Background layer must exist");
  assert.equal(blackBg.left, 300);
  assert.equal(blackBg.top, 20);
  assert.equal(blackBg.right, 500);
  assert.equal(blackBg.bottom, 200);
  assert.equal(blackBg.imageData.width, 200);
  assert.equal(blackBg.imageData.height, 180);
  assert.equal(blackBg.imageData.data[0], 0, "Red channel must be 0 (black)");
  assert.equal(blackBg.imageData.data[1], 0, "Green channel must be 0 (black)");
  assert.equal(blackBg.imageData.data[2], 0, "Blue channel must be 0 (black)");
  assert.equal(blackBg.imageData.data[3], 255, "Alpha channel must be 255 (opaque)");

  // 3. Verify Empty Clear Frame layer group preserved in layer stack
  const clearFrameLayer = parsed.children.find((c) => c.name === "Empty Clear Frame");
  assert.ok(clearFrameLayer, "Empty Clear Frame layer group must be preserved in PSD");
  assert.equal(clearFrameLayer.left, 20);
  assert.equal(clearFrameLayer.top, 240);

  console.log("Browser engine PSD export and layer fidelity verified successfully.");
});
