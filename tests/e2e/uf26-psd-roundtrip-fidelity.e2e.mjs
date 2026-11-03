import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { initializeCanvas, readPsd } from "ag-psd";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// Initialize canvas stubs for ag-psd's node-side readPsd
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

// Evidence directory: use official env or fallback to a unique mkdtemp directory, and explicitly mkdir
const EVIDENCE_DIR =
  process.env.VOO_EVIDENCE_DIR ||
  process.env.UF26_EVIDENCE_DIR ||
  fs.mkdtempSync(path.join(os.tmpdir(), "voo-uf26-roundtrip-"));

await mkdir(EVIDENCE_DIR, { recursive: true });
console.log(`Using evidence directory: ${EVIDENCE_DIR}`);

const testCoords = [
  { name: "Opaque Red Frame Background", x: 30, y: 30 },
  { name: "Green Child Graphic", x: 60, y: 60 },
  { name: "Semi Blue Frame Background", x: 250, y: 30 },
  { name: "Yellow Child Graphic in Semi Group", x: 280, y: 60 },
  { name: "Empty Black Frame", x: 30, y: 200 },
  { name: "Empty Clear Frame", x: 190, y: 200 },
];

function getPixel(data, width, x, y) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

let psdBuffer = null;
let beforePixels = null;
let beforePngDataUrl = null;
let psdCompositePixels = null;
let afterPixels = null;
let afterPngDataUrl = null;

console.log("=== Phase 1: Real Browser UI Export to PSD ===");
await withEditorBrowser(async ({ page }) => {
  // 1. Setup sample document with Frame hierarchy via editor API
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({
      version: 1,
      width: 460,
      height: 310,
      isCanvasRoot: true,
      backgroundColor: "transparent",
      nodes: [
        {
          id: "f-opaque",
          kind: "group",
          isFrame: true,
          frame: true,
          name: "Opaque Red Frame",
          x: 20,
          y: 20,
          width: 200,
          height: 150,
          fill: "#ff0000",
          fillOpacity: 1,
          opacity: 1,
          visible: true,
        },
        {
          id: "c-green",
          kind: "rect",
          parentId: "f-opaque",
          name: "Green Child",
          x: 50,
          y: 50,
          width: 60,
          height: 60,
          fill: "#00ff00",
          opacity: 1,
          visible: true,
        },
        {
          id: "f-semi",
          kind: "group",
          isFrame: true,
          frame: true,
          name: "Semi Blue Frame",
          x: 240,
          y: 20,
          width: 200,
          height: 150,
          fill: "#0000ff",
          fillOpacity: 0.5,
          opacity: 0.8,
          visible: true,
        },
        {
          id: "c-yellow",
          kind: "rect",
          parentId: "f-semi",
          name: "Yellow Child",
          x: 270,
          y: 50,
          width: 60,
          height: 60,
          fill: "#ffff00",
          opacity: 1,
          visible: true,
        },
        {
          id: "f-empty-black",
          kind: "group",
          isFrame: true,
          frame: true,
          name: "Empty Black Frame",
          x: 20,
          y: 190,
          width: 140,
          height: 100,
          fill: "#000000",
          fillOpacity: 1,
          opacity: 1,
          visible: true,
        },
        {
          id: "f-empty-clear",
          kind: "group",
          isFrame: true,
          frame: true,
          name: "Empty Clear Frame",
          x: 180,
          y: 190,
          width: 140,
          height: 100,
          fill: "transparent",
          opacity: 1,
          visible: true,
        },
      ],
    });
  });

  // 2. Sample before pixels and PNG from production renderer
  const beforeData = await page.evaluate((coords) => {
    const canvas = window.__vooEditor.exportPngCanvas();
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = coords.map((c) => {
      const i = (c.y * canvas.width + c.x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    });
    return {
      pixels,
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  }, testCoords);

  beforePixels = beforeData.pixels;
  beforePngDataUrl = beforeData.dataUrl;
  console.log("Before export canvas size:", beforeData.width, "x", beforeData.height);
  console.log("Before export sampled pixels:", JSON.stringify(beforePixels));

  // 3. Open Export Dialog via real TitleBar UI button
  const exportBtn = page.getByTestId("titlebar-export");
  await exportBtn.waitFor({ state: "visible" });
  await exportBtn.click();

  const dialog = page.getByTestId("design-export-dialog");
  await dialog.waitFor({ state: "visible" });

  // 4. Select PSD format in dialog
  const psdOption = dialog.getByRole("button", { name: /^PSD(?: |$)/ });
  await psdOption.click();

  // 5. Click Export button and await real file download
  const downloadPromise = page.waitForEvent("download");
  const dialogExportBtn = dialog.getByRole("button", { name: "Export", exact: true });
  await dialogExportBtn.click();

  const download = await downloadPromise;
  const downloadPath = await download.path();
  psdBuffer = await readFile(downloadPath);
  console.log(`Downloaded PSD (${download.suggestedFilename()}): ${psdBuffer.length} bytes`);
});

// Save downloaded PSD and before.png to evidence directory
await writeFile(path.join(EVIDENCE_DIR, "real-dialog-export.psd"), psdBuffer);
const beforePngBuffer = Buffer.from(beforePngDataUrl.split(",")[1], "base64");
await writeFile(path.join(EVIDENCE_DIR, "real-renderer-before.png"), beforePngBuffer);

console.log("\n=== Phase 2: PSD Layer Structure & Composite Verification ===");
const parsedPsd = readPsd(psdBuffer, { useImageData: true });
console.log("Parsed PSD dimensions:", parsedPsd.width, "x", parsedPsd.height);
console.log("Parsed PSD root layers:", parsedPsd.children.map((c) => c.name));

// Sample PSD composite pixels
psdCompositePixels = testCoords.map((c) =>
  getPixel(parsedPsd.imageData.data, parsedPsd.width, c.x, c.y),
);
console.log("PSD composite sampled pixels:", JSON.stringify(psdCompositePixels));

console.log("\n=== Phase 3: Cold Reopen & Real FileChooser Import ===");
await withEditorBrowser(async ({ page }) => {
  // Disable native file picker to force standard input file chooser
  await page.evaluate(() => {
    delete window.showOpenFilePicker;
  });

  const importBtn = page.getByRole("button", { name: /Import project file|导入工程文件/ });
  await importBtn.waitFor({ state: "visible" });

  // Trigger file chooser and upload the downloaded PSD
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    importBtn.click(),
  ]);

  await chooser.setFiles({
    name: "roundtrip-imported.psd",
    mimeType: "image/vnd.adobe.photoshop",
    buffer: psdBuffer,
  });
  console.log("File uploaded to file chooser. Waiting for document and images...");

  // Wait for document to load and all image layers to decode in the engine (20s timeout preserved)
  await page.waitForFunction(
    () => {
      const e = window.__vooEditor;
      const d = e?.getDocument?.();
      if (!d || !d.nodes || d.nodes.length === 0) return false;
      const images = d.nodes.filter((n) => n.kind === "image");
      return images.length > 0 && images.every((n) => Boolean(e.getNodeBitmap(n)));
    },
    null,
    { timeout: 20000 },
  );

  const importedDoc = await page.evaluate(() => window.__vooEditor.getDocument());
  console.log(
    "Imported nodes count:",
    importedDoc.nodes.length,
    "names:",
    importedDoc.nodes.map((n) => n.name),
  );

  // Sample after pixels and PNG from production renderer
  const afterData = await page.evaluate((coords) => {
    const canvas = window.__vooEditor.exportPngCanvas();
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = coords.map((c) => {
      const i = (c.y * canvas.width + c.x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    });
    return {
      pixels,
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  }, testCoords);

  afterPixels = afterData.pixels;
  afterPngDataUrl = afterData.dataUrl;
  console.log("After import canvas size:", afterData.width, "x", afterData.height);
  console.log("After import sampled pixels:", JSON.stringify(afterPixels));
});

// Save after.png to evidence directory
const afterPngBuffer = Buffer.from(afterPngDataUrl.split(",")[1], "base64");
await writeFile(path.join(EVIDENCE_DIR, "real-renderer-after.png"), afterPngBuffer);

console.log("\n=== Phase 4: Pixel Fidelity Comparison Across Checkpoints ===");
let allPassed = true;
testCoords.forEach((coord, idx) => {
  const b = beforePixels[idx];
  const p = psdCompositePixels[idx];
  const a = afterPixels[idx];

  const beforeVsPsd = b.every((val, ch) => Math.abs(val - p[ch]) <= 1);
  const beforeVsAfter = b.every((val, ch) => Math.abs(val - a[ch]) <= 1);
  const pass = beforeVsPsd && beforeVsAfter;
  if (!pass) allPassed = false;

  console.log(`\nCheckpoint ${idx + 1}: ${coord.name} at (${coord.x}, ${coord.y})`);
  console.log(`  Before (production canvas):    RGBA(${b.join(", ")})`);
  console.log(`  PSD composite (exported file):  RGBA(${p.join(", ")}) [match: ${beforeVsPsd}]`);
  console.log(`  After (reimported canvas):     RGBA(${a.join(", ")}) [match: ${beforeVsAfter}]`);
  assert.ok(beforeVsPsd, `Before vs PSD mismatch at ${coord.name}: ${b} vs ${p}`);
  assert.ok(beforeVsAfter, `Before vs After mismatch at ${coord.name}: ${b} vs ${a}`);
});

assert.ok(allPassed, "All 6 checkpoints must pass pixel-fidelity comparison");
console.log("\n✓ Real browser UI export, cold reopen filechooser import, and production pixel fidelity verified successfully!");
