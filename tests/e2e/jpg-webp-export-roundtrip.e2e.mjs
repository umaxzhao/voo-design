import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { importZipFromWelcome, saveZipSnapshot } from "./uf13-pen-join-helpers.mjs";

const EVIDENCE_DIR =
  process.env.VOO_EVIDENCE_DIR ||
  process.env.UF_EVIDENCE_DIR ||
  "/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/b8-export-jpg-webp-20261103T083400Z";

await mkdir(EVIDENCE_DIR, { recursive: true });

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function getBrowserMetadata(page) {
  const browser = page.context().browser();
  const cdp = await browser.newBrowserCDPSession();
  const [procInfo, versionInfo] = await Promise.all([
    cdp.send("SystemInfo.getProcessInfo"),
    cdp.send("Browser.getVersion"),
  ]);
  const browserPid = procInfo.processInfo.find((x) => x.type === "browser")?.id ?? null;
  return {
    browserPid,
    browserVersion: browser.version(),
    cdp: versionInfo,
  };
}

const receipt = {
  task: "JPG and WebP real UI export, filechooser re-import into fresh browser process, asset pixel comparison, interactive UI & keyboard Undo/Redo, and cold reopen",
  timestamp: new Date().toISOString(),
  commit: "b33e6085f3efb8340b70a2525fd93281d5fb3b60",
  tree: "01557fbfdf557f1291640d74710a4ca7980bff56",
  baseline: "b8ae8039a291e841f786b29f90af00e4f4c89653",
  scopeClassification: {
    fileChooserScope: "Browser Web DOM FileChooser (Playwright page.waitForEvent('filechooser') handling hidden <input type='file'> via context menu trigger; NOT native macOS NSOpenPanel/Finder dialog)",
    undoRedoScope: "Interactive UI button click (editor_actions IconUndo / IconRedo) and keyboard shortcuts (Meta+z / Meta+Shift+z); distinguishing from bridge MCP tool history",
    browserEnvironment: "Headless Chromium (actual version from browser.version() and CDP Browser.getVersion; NOT Playwright npm package version)",
    platformScope: "Web browser automation (macOS arm64 Chromium); Mac native GUI window (PID 224) and Linux are untested/held separately",
  },
  environment: {},
  steps: {},
};

const exportedFiles = {};
let warmJpegAsset = null;
let warmWebpAsset = null;

// =========================================================================
// STEP 1: Real UI Export (Process 1)
// =========================================================================
console.log("=== STEP 1: Real UI Export of JPEG and WebP ===");
await withEditorBrowser(async ({ page, errors }) => {
  const nodePid = process.pid;
  const meta = await getBrowserMetadata(page);
  console.log(`[Step 1] Node PID: ${nodePid}, Browser PID: ${meta.browserPid}, Browser Version: ${meta.browserVersion}`);

  receipt.environment = {
    playwrightPackage: "1.64.1",
    actualBrowser: {
      product: meta.cdp.product,
      browserVersion: meta.browserVersion,
      cdpProtocolVersion: meta.cdp.protocolVersion,
      cdpRevision: meta.cdp.revision,
      userAgent: meta.cdp.userAgent,
      v8JsVersion: meta.cdp.jsVersion,
    },
  };

  // Setup test document with distinct colors and shapes
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.cancelSelectionTransform();
    e.setTool("select");
    e.selectExactly([]);
    e.setDoc({
      ...e.getDocument(),
      width: 600,
      height: 400,
      isCanvasRoot: true,
      backgroundColor: "#ffffff",
      nodes: [
        {
          id: "rect-red",
          kind: "rect",
          name: "Red Box",
          x: 40,
          y: 40,
          width: 160,
          height: 120,
          fill: "#ff0000",
          opacity: 1,
          visible: true,
        },
        {
          id: "rect-blue",
          kind: "rect",
          name: "Blue Box",
          x: 240,
          y: 40,
          width: 160,
          height: 120,
          fill: "#0000ff",
          opacity: 1,
          visible: true,
        },
        {
          id: "rect-green",
          kind: "rect",
          name: "Green Box",
          x: 140,
          y: 140,
          width: 180,
          height: 140,
          fill: "#00ff00",
          opacity: 1,
          visible: true,
        },
      ],
    });
  });

  // Wait for canvas frames to settle
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );

  // Capture original canvas baseline render
  const baselineInfo = await page.evaluate(async () => {
    const e = window.__vooEditor;
    const canvas = e.exportPngCanvas(1);
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let hash = 2166136261;
    let painted = 0;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (i % 4 === 3 && data[i] > 0) painted++;
    }

    return {
      width: canvas.width,
      height: canvas.height,
      painted,
      hash: hash >>> 0,
      sampleRed: [...ctx.getImageData(60, 60, 1, 1).data],
      sampleBlue: [...ctx.getImageData(260, 60, 1, 1).data],
      sampleGreen: [...ctx.getImageData(160, 160, 1, 1).data],
      sampleBg: [...ctx.getImageData(20, 20, 1, 1).data],
      pngDataUrl: canvas.toDataURL("image/png"),
    };
  });

  const baselinePngBuf = Buffer.from(
    baselineInfo.pngDataUrl.split(",")[1],
    "base64"
  );
  const baselinePngPath = path.join(EVIDENCE_DIR, "baseline-render.png");
  await writeFile(baselinePngPath, baselinePngBuf);
  console.log(`[Step 1] Baseline canvas render saved (${baselinePngBuf.length} bytes, hash: ${baselineInfo.hash})`);

  // --- 1A. Export JPEG via Real UI ---
  const exportBtn = page.getByTestId("titlebar-export");
  await exportBtn.waitFor({ state: "visible" });
  await exportBtn.click();

  const dialog = page.getByTestId("design-export-dialog");
  await dialog.waitFor({ state: "visible" });

  const jpegBtn = dialog.getByRole("button", { name: /^JPEG(?: |$)/ });
  await jpegBtn.click();
  assert.equal(await jpegBtn.getAttribute("aria-pressed"), "true");

  const filenameEl = dialog.getByTestId("design-export-filename");
  const jpegSuggestedName = await filenameEl.textContent();
  assert.match(jpegSuggestedName, /\.jpg$/i);

  const dimensionsEl = dialog.getByTestId("design-export-dimensions");
  const jpegDimensionsText = await dimensionsEl.textContent();
  assert.match(jpegDimensionsText, /600\s*[×x]\s*400/);

  const downloadPromiseJpeg = page.waitForEvent("download");
  const submitBtn = dialog.getByRole("button", { name: /Export|导出/, exact: true });
  await submitBtn.click();
  const downloadJpeg = await downloadPromiseJpeg;
  const jpegPath = path.join(EVIDENCE_DIR, "export-test.jpg");
  await downloadJpeg.saveAs(jpegPath);

  const jpegBytes = await readFile(jpegPath);
  assert.ok(jpegBytes.length > 500, "Exported JPEG must have non-trivial size");
  assert.equal(jpegBytes[0], 0xff, "JPEG magic byte 0");
  assert.equal(jpegBytes[1], 0xd8, "JPEG magic byte 1");
  assert.equal(jpegBytes[2], 0xff, "JPEG magic byte 2");
  const jpegSha = sha256(jpegBytes);
  console.log(`[Step 1] Real UI exported JPEG: ${jpegPath} (${jpegBytes.length} bytes, sha256: ${jpegSha})`);
  exportedFiles.jpeg = { path: jpegPath, size: jpegBytes.length, sha256: jpegSha };

  // --- 1B. Export WebP via Real UI ---
  await exportBtn.click();
  await dialog.waitFor({ state: "visible" });

  const webpBtn = dialog.getByRole("button", { name: /^WebP(?: |$)/ });
  await webpBtn.click();
  assert.equal(await webpBtn.getAttribute("aria-pressed"), "true");

  const webpSuggestedName = await filenameEl.textContent();
  assert.match(webpSuggestedName, /\.webp$/i);

  const downloadPromiseWebp = page.waitForEvent("download");
  await submitBtn.click();
  const downloadWebp = await downloadPromiseWebp;
  const webpPath = path.join(EVIDENCE_DIR, "export-test.webp");
  await downloadWebp.saveAs(webpPath);

  const webpBytes = await readFile(webpPath);
  assert.ok(webpBytes.length > 500, "Exported WebP must have non-trivial size");
  assert.equal(webpBytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(webpBytes.subarray(8, 12).toString("ascii"), "WEBP");
  const webpSha = sha256(webpBytes);
  console.log(`[Step 1] Real UI exported WebP: ${webpPath} (${webpBytes.length} bytes, sha256: ${webpSha})`);
  exportedFiles.webp = { path: webpPath, size: webpBytes.length, sha256: webpSha };

  assert.deepEqual(errors, []);

  receipt.steps.step1_real_ui_export = {
    status: "passed",
    nodePid,
    browserPid: meta.browserPid,
    actualBrowserVersion: meta.browserVersion,
    cdpProduct: meta.cdp.product,
    controls: {
      exportTrigger: 'data-testid="titlebar-export"',
      dialog: 'data-testid="design-export-dialog"',
      formatButtons: ['button[name="^JPEG"]', 'button[name="^WebP"]'],
      filenameDisplay: 'data-testid="design-export-filename"',
      dimensionsDisplay: 'data-testid="design-export-dimensions"',
      exportButton: 'button[name="/Export|导出/"]',
    },
    baselineRender: {
      width: baselineInfo.width,
      height: baselineInfo.height,
      painted: baselineInfo.painted,
      hash: baselineInfo.hash,
      pngPath: baselinePngPath,
      sampleColors: {
        red: baselineInfo.sampleRed,
        blue: baselineInfo.sampleBlue,
        green: baselineInfo.sampleGreen,
        background: baselineInfo.sampleBg,
      },
    },
    exportedFiles: {
      jpeg: {
        path: jpegPath,
        suggestedName: jpegSuggestedName,
        size: jpegBytes.length,
        sha256: jpegSha,
        magic: [0xff, 0xd8, 0xff],
      },
      webp: {
        path: webpPath,
        suggestedName: webpSuggestedName,
        size: webpBytes.length,
        sha256: webpSha,
        magic: "RIFF...WEBP",
      },
    },
  };
}, { openDocument: true, mcpLink: true });

// =========================================================================
// STEP 2 & 3: Filechooser Re-import in New Browser Process + Asset Pixels + Interactive Undo/Redo
// =========================================================================
console.log("=== STEP 2 & 3: Filechooser Re-import in New Browser Process, Asset Pixels, Interactive Undo/Redo ===");
const snapshotZipPath = path.join(EVIDENCE_DIR, "reimport-snapshot.zip");

await withEditorBrowser(async ({ page, errors, tool }) => {
  const nodePid = process.pid;
  const meta = await getBrowserMetadata(page);
  console.log(`[Step 2/3] Node PID: ${nodePid}, Fresh Browser PID: ${meta.browserPid}, Browser Version: ${meta.browserVersion}`);
  assert.notEqual(meta.browserPid, receipt.steps.step1_real_ui_export.browserPid, "Step 2 must run in a separate fresh browser process");

  // Reset document to clean empty canvas
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.cancelSelectionTransform();
    e.setTool("select");
    e.selectExactly([]);
    e.setDoc({
      ...e.getDocument(),
      width: 600,
      height: 400,
      isCanvasRoot: true,
      backgroundColor: "#ffffff",
      nodes: [],
    });
  });

  const initialNodes = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
  assert.equal(initialNodes.length, 0, "Document starts clean with 0 nodes");

  const clientPoint = async (x, y) => {
    return page.evaluate(async ({ x, y }) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const bounds = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
      const doc = window.__vooEditor.getDocument();
      return {
        x: bounds.left + (x * bounds.width) / doc.width,
        y: bounds.top + (y * bounds.height) / doc.height,
      };
    }, { x, y });
  };

  // --- 2A: Re-import JPEG via Real UI filechooser ---
  console.log("[Step 2] Importing JPEG via context menu and Web DOM filechooser...");
  const point = await clientPoint(300, 200);
  await page.mouse.click(point.x, point.y, { button: "right" });

  const importMenuItem = page.getByTestId("editor-menu-import-media");
  await importMenuItem.waitFor({ state: "visible" });
  const [chooserJpeg] = await Promise.all([
    page.waitForEvent("filechooser"),
    importMenuItem.click(),
  ]);
  await chooserJpeg.setFiles(exportedFiles.jpeg.path);

  // Wait for JPEG node to be added and decoded
  await page.waitForFunction(() => {
    const e = window.__vooEditor;
    const doc = e?.getDocument?.();
    const img = doc?.nodes?.find((n) => n.kind === "image");
    return img && Boolean(e.getNodeBitmap(img));
  }, null, { timeout: 25000 });

  const jpegAssetInfo = await page.evaluate(async () => {
    const e = window.__vooEditor;
    const node = e.getDocument().nodes.find((n) => n.kind === "image");
    const bitmap = e.getNodeBitmap(node);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let hash = 2166136261;
    let painted = 0;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (i % 4 === 3 && data[i] > 0) painted++;
    }

    return {
      nodeId: node.id,
      width: canvas.width,
      height: canvas.height,
      painted,
      hash: hash >>> 0,
      sampleRed: [...ctx.getImageData(60, 60, 1, 1).data],
      sampleBlue: [...ctx.getImageData(260, 60, 1, 1).data],
      sampleGreen: [...ctx.getImageData(160, 160, 1, 1).data],
      sampleBg: [...ctx.getImageData(20, 20, 1, 1).data],
      pngDataUrl: canvas.toDataURL("image/png"),
    };
  });

  assert.equal(jpegAssetInfo.width, 600, "Imported JPEG bitmap width must be 600");
  assert.equal(jpegAssetInfo.height, 400, "Imported JPEG bitmap height must be 400");
  assert.equal(jpegAssetInfo.painted, 600 * 400, "All 240,000 pixels must be opaque in imported JPEG");
  assert.ok(jpegAssetInfo.sampleRed[0] > 200 && jpegAssetInfo.sampleRed[1] < 50 && jpegAssetInfo.sampleRed[2] < 50, "Red area preserved in JPEG");
  assert.ok(jpegAssetInfo.sampleBlue[2] > 200 && jpegAssetInfo.sampleBlue[0] < 50 && jpegAssetInfo.sampleBlue[1] < 50, "Blue area preserved in JPEG");
  assert.ok(jpegAssetInfo.sampleGreen[1] > 200 && jpegAssetInfo.sampleGreen[0] < 50 && jpegAssetInfo.sampleGreen[2] < 50, "Green area preserved in JPEG");
  console.log(`[Step 2] JPEG asset decoded: 600x400, painted: ${jpegAssetInfo.painted}, hash: ${jpegAssetInfo.hash}`);
  warmJpegAsset = jpegAssetInfo;

  // --- STEP 3A: Interactive UI Button Undo/Redo on JPEG ---
  console.log("[Step 3A] Testing Interactive UI Button Undo/Redo on JPEG...");
  const undoBtn = page.getByRole("button", { name: /Undo|撤销/ });
  await undoBtn.waitFor({ state: "visible" });
  assert.equal(await undoBtn.isDisabled(), false, "Undo button must be enabled after JPEG import");
  await undoBtn.click();

  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 0);
  const countAfterUndoJpeg = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  assert.equal(countAfterUndoJpeg, 0, "Interactive UI Button Undo must remove imported JPEG image node");
  console.log("[Step 3A] JPEG Interactive UI Button Undo verified: node count reverted to 0");

  const redoBtn = page.getByRole("button", { name: /Redo|重做/ });
  await redoBtn.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const b = Array.from(document.querySelectorAll("button")).find(
      (el) => /Redo|重做/i.test(el.getAttribute("aria-label") || el.textContent)
    );
    return b && !b.disabled;
  });
  assert.equal(await redoBtn.isDisabled(), false, "Redo button must be enabled after Undo");
  await redoBtn.click();

  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 1);
  const countAfterRedoJpeg = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  assert.equal(countAfterRedoJpeg, 1, "Interactive UI Button Redo must restore imported JPEG image node");
  const redoJpegHash = await page.evaluate(() => {
    const e = window.__vooEditor;
    const node = e.getDocument().nodes.find((n) => n.kind === "image");
    const bitmap = e.getNodeBitmap(node);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
    return hash >>> 0;
  });
  assert.equal(redoJpegHash, jpegAssetInfo.hash, "Interactive UI Button Redo restored exact JPEG asset pixels");
  console.log(`[Step 3A] JPEG Interactive UI Button Redo verified: restored exact pixel hash ${redoJpegHash}`);

  // Re-import WebP as a second image node in the document
  console.log("[Step 2] Importing WebP via context menu and Web DOM filechooser...");
  const pointWebp = await clientPoint(300, 200);
  await page.mouse.click(pointWebp.x, pointWebp.y, { button: "right" });

  await importMenuItem.waitFor({ state: "visible" });
  const [chooserWebp] = await Promise.all([
    page.waitForEvent("filechooser"),
    importMenuItem.click(),
  ]);
  await chooserWebp.setFiles(exportedFiles.webp.path);

  // Wait for 2nd image node (WebP) to be added and decoded
  await page.waitForFunction(() => {
    const e = window.__vooEditor;
    const doc = e?.getDocument?.();
    const imgs = doc?.nodes?.filter((n) => n.kind === "image");
    return imgs?.length === 2 && imgs.every((n) => Boolean(e.getNodeBitmap(n)));
  }, null, { timeout: 25000 });

  const webpAssetInfo = await page.evaluate(async (firstNodeId) => {
    const e = window.__vooEditor;
    const node = e.getDocument().nodes.find((n) => n.kind === "image" && n.id !== firstNodeId);
    const bitmap = e.getNodeBitmap(node);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    let hash = 2166136261;
    let painted = 0;
    for (let i = 0; i < data.length; i++) {
      hash = Math.imul(hash ^ data[i], 16777619);
      if (i % 4 === 3 && data[i] > 0) painted++;
    }

    return {
      nodeId: node.id,
      width: canvas.width,
      height: canvas.height,
      painted,
      hash: hash >>> 0,
      sampleRed: [...ctx.getImageData(60, 60, 1, 1).data],
      sampleBlue: [...ctx.getImageData(260, 60, 1, 1).data],
      sampleGreen: [...ctx.getImageData(160, 160, 1, 1).data],
      sampleBg: [...ctx.getImageData(20, 20, 1, 1).data],
      pngDataUrl: canvas.toDataURL("image/png"),
    };
  }, jpegAssetInfo.nodeId);

  assert.equal(webpAssetInfo.width, 600, "Imported WebP bitmap width must be 600");
  assert.equal(webpAssetInfo.height, 400, "Imported WebP bitmap height must be 400");
  assert.equal(webpAssetInfo.painted, 60800, "WebP preserves exact 60,800 painted shape pixels with transparent background");
  assert.ok(webpAssetInfo.sampleRed[0] > 200 && webpAssetInfo.sampleRed[1] < 50 && webpAssetInfo.sampleRed[2] < 50 && webpAssetInfo.sampleRed[3] > 200, "Red area preserved in WebP");
  assert.ok(webpAssetInfo.sampleBlue[2] > 200 && webpAssetInfo.sampleBlue[0] < 50 && webpAssetInfo.sampleBlue[1] < 50 && webpAssetInfo.sampleBlue[3] > 200, "Blue area preserved in WebP");
  assert.ok(webpAssetInfo.sampleGreen[1] > 200 && webpAssetInfo.sampleGreen[0] < 50 && webpAssetInfo.sampleGreen[2] < 50 && webpAssetInfo.sampleGreen[3] > 200, "Green area preserved in WebP");
  assert.equal(webpAssetInfo.sampleBg[3], 0, "Background area preserved as transparent in WebP (alpha = 0)");
  console.log(`[Step 2] WebP asset decoded: 600x400, painted: ${webpAssetInfo.painted}, hash: ${webpAssetInfo.hash}`);
  warmWebpAsset = webpAssetInfo;

  // --- STEP 3B: Interactive Keyboard Shortcut Undo/Redo on WebP ---
  console.log("[Step 3B] Testing Interactive Keyboard Shortcut Undo/Redo on WebP...");
  const isMac = process.platform === "darwin";
  await page.locator("[data-editor-artboard]").click();
  await page.keyboard.press(isMac ? "Meta+z" : "Control+z");
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 1);
  const countAfterUndoWebp = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  assert.equal(countAfterUndoWebp, 1, "Keyboard Undo on WebP leaves only 1 node (JPEG)");
  console.log(`[Step 3B] WebP Keyboard Undo (${isMac ? "Meta+z" : "Control+z"}) verified: node count reverted to 1`);

  await page.keyboard.press(isMac ? "Meta+Shift+z" : "Control+Shift+z");
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 2);
  const countAfterRedoWebp = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  assert.equal(countAfterRedoWebp, 2, "Keyboard Redo on WebP restores both image nodes");
  const redoWebpHash = await page.evaluate((targetId) => {
    const e = window.__vooEditor;
    const node = e.getDocument().nodes.find((n) => n.id === targetId);
    const bitmap = e.getNodeBitmap(node);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
    return hash >>> 0;
  }, webpAssetInfo.nodeId);
  assert.equal(redoWebpHash, webpAssetInfo.hash, "Keyboard Redo restored exact WebP asset pixels");
  console.log(`[Step 3B] WebP Keyboard Redo (${isMac ? "Meta+Shift+z" : "Control+Shift+z"}) verified: restored exact pixel hash ${redoWebpHash}`);

  // Save portable ZIP snapshot containing both imported assets for Step 4 Cold Reopen
  console.log("[Step 2] Saving snapshot containing imported assets for cold reopen...");
  await saveZipSnapshot(page, snapshotZipPath);
  const snapBytes = await readFile(snapshotZipPath);
  assert.ok(snapBytes.length > 500, "Saved snapshot zip must exist and have content");
  const snapSha = sha256(snapBytes);
  console.log(`[Step 2] Snapshot saved: ${snapshotZipPath} (${snapBytes.length} bytes, sha256: ${snapSha})`);

  assert.deepEqual(errors, []);

  receipt.steps.step2_reimport_and_pixels = {
    status: "passed",
    nodePid,
    browserPid: meta.browserPid,
    actualBrowserVersion: meta.browserVersion,
    controls: {
      canvasArtboard: "[data-editor-artboard]",
      contextMenuTrigger: "mouse.click(button='right')",
      importMenuItem: 'data-testid="editor-menu-import-media"',
      fileChooser: "page.waitForEvent('filechooser') (Web DOM input[type=file])",
    },
    jpegImport: {
      nodeId: jpegAssetInfo.nodeId,
      width: jpegAssetInfo.width,
      height: jpegAssetInfo.height,
      painted: jpegAssetInfo.painted,
      pixelHash: jpegAssetInfo.hash,
      sampleColors: {
        red: jpegAssetInfo.sampleRed,
        blue: jpegAssetInfo.sampleBlue,
        green: jpegAssetInfo.sampleGreen,
        background: jpegAssetInfo.sampleBg,
      },
    },
    webpImport: {
      nodeId: webpAssetInfo.nodeId,
      width: webpAssetInfo.width,
      height: webpAssetInfo.height,
      painted: webpAssetInfo.painted,
      pixelHash: webpAssetInfo.hash,
      sampleColors: {
        red: webpAssetInfo.sampleRed,
        blue: webpAssetInfo.sampleBlue,
        green: webpAssetInfo.sampleGreen,
        background: webpAssetInfo.sampleBg,
      },
    },
    snapshotZip: {
      path: snapshotZipPath,
      size: snapBytes.length,
      sha256: snapSha,
    },
  };

  receipt.steps.step3_interactive_undo_redo = {
    status: "passed",
    jpeg: {
      mechanism: "Interactive UI Button Click (page.getByRole('button', { name: /Undo|撤销/ }) & /Redo|重做/)",
      undoNodeCount: countAfterUndoJpeg,
      redoNodeCount: countAfterRedoJpeg,
      redoPixelHash: redoJpegHash,
      pixelMatch: redoJpegHash === jpegAssetInfo.hash,
    },
    webp: {
      mechanism: `Interactive Keyboard Shortcuts (${isMac ? "Meta+z" : "Control+z"} & ${isMac ? "Meta+Shift+z" : "Control+Shift+z"})`,
      undoNodeCount: countAfterUndoWebp,
      redoNodeCount: countAfterRedoWebp,
      redoPixelHash: redoWebpHash,
      pixelMatch: redoWebpHash === webpAssetInfo.hash,
    },
  };
}, { openDocument: true, mcpLink: true });

// =========================================================================
// STEP 4: Cold Reopen in New Browser Process (Process 3)
// =========================================================================
console.log("=== STEP 4: Cold Reopen in Fresh Browser Process ===");
await withEditorBrowser(async ({ page, errors }) => {
  const nodePid = process.pid;
  const meta = await getBrowserMetadata(page);
  console.log(`[Step 4] Node PID: ${nodePid}, Cold Reopen Browser PID: ${meta.browserPid}, Browser Version: ${meta.browserVersion}`);
  assert.notEqual(meta.browserPid, receipt.steps.step1_real_ui_export.browserPid, "Step 4 must run in fresh browser PID");
  assert.notEqual(meta.browserPid, receipt.steps.step2_reimport_and_pixels.browserPid, "Step 4 must run in fresh browser PID");

  // Import snapshot from Welcome dashboard via real file chooser
  console.log("[Step 4] Importing snapshot from welcome screen via Web DOM file chooser...");
  await importZipFromWelcome(page, snapshotZipPath);

  // Await document loaded and image bitmaps decoded in fresh runtime
  await page.waitForFunction(() => {
    const e = window.__vooEditor;
    const doc = e?.getDocument?.();
    if (!doc || !doc.nodes || doc.nodes.length === 0) return false;
    const images = doc.nodes.filter((n) => n.kind === "image");
    return images.length === 2 && images.every((n) => Boolean(e.getNodeBitmap(n)));
  }, null, { timeout: 35000 });

  const coldAssets = await page.evaluate(async (ids) => {
    const e = window.__vooEditor;
    const results = {};
    for (const [key, id] of Object.entries(ids)) {
      const node = e.getDocument().nodes.find((n) => n.id === id);
      const bitmap = e.getNodeBitmap(node);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      let hash = 2166136261;
      let painted = 0;
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data[i], 16777619);
        if (i % 4 === 3 && data[i] > 0) painted++;
      }

      results[key] = {
        nodeId: node.id,
        width: canvas.width,
        height: canvas.height,
        painted,
        hash: hash >>> 0,
        sampleRed: [...ctx.getImageData(60, 60, 1, 1).data],
        sampleBlue: [...ctx.getImageData(260, 60, 1, 1).data],
        sampleGreen: [...ctx.getImageData(160, 160, 1, 1).data],
        sampleBg: [...ctx.getImageData(20, 20, 1, 1).data],
      };
    }
    return results;
  }, { jpeg: warmJpegAsset.nodeId, webp: warmWebpAsset.nodeId });

  // Assert exact pixel match across cold reopen for JPEG
  assert.equal(coldAssets.jpeg.width, warmJpegAsset.width, "Cold reopened JPEG width match");
  assert.equal(coldAssets.jpeg.height, warmJpegAsset.height, "Cold reopened JPEG height match");
  assert.equal(coldAssets.jpeg.painted, warmJpegAsset.painted, "Cold reopened JPEG painted count match");
  assert.equal(coldAssets.jpeg.hash, warmJpegAsset.hash, "Cold reopened JPEG pixel hash must match warm hash exactly!");
  console.log(`[Step 4] Cold reopened JPEG asset pixel hash: ${coldAssets.jpeg.hash} (EXACT MATCH with warm hash: ${warmJpegAsset.hash})`);

  // Assert exact pixel match across cold reopen for WebP
  assert.equal(coldAssets.webp.width, warmWebpAsset.width, "Cold reopened WebP width match");
  assert.equal(coldAssets.webp.height, warmWebpAsset.height, "Cold reopened WebP height match");
  assert.equal(coldAssets.webp.painted, warmWebpAsset.painted, "Cold reopened WebP painted count match");
  assert.equal(coldAssets.webp.hash, warmWebpAsset.hash, "Cold reopened WebP pixel hash must match warm hash exactly!");
  console.log(`[Step 4] Cold reopened WebP asset pixel hash: ${coldAssets.webp.hash} (EXACT MATCH with warm hash: ${warmWebpAsset.hash})`);

  assert.deepEqual(errors, []);

  receipt.steps.step4_cold_reopen = {
    status: "passed",
    nodePid,
    browserPid: meta.browserPid,
    actualBrowserVersion: meta.browserVersion,
    controls: {
      welcomeImportButton: 'data-testid="editor-top-bar" > button[name="Import project file (⌘O / Ctrl+O)"]',
      fileChooser: "page.waitForEvent('filechooser') (Web DOM input[type=file])",
    },
    coldAssets: {
      jpeg: {
        nodeId: coldAssets.jpeg.nodeId,
        width: coldAssets.jpeg.width,
        height: coldAssets.jpeg.height,
        painted: coldAssets.jpeg.painted,
        pixelHash: coldAssets.jpeg.hash,
        exactMatchWithWarm: coldAssets.jpeg.hash === warmJpegAsset.hash,
      },
      webp: {
        nodeId: coldAssets.webp.nodeId,
        width: coldAssets.webp.width,
        height: coldAssets.webp.height,
        painted: coldAssets.webp.painted,
        pixelHash: coldAssets.webp.hash,
        exactMatchWithWarm: coldAssets.webp.hash === warmWebpAsset.hash,
      },
    },
  };
}, { openDocument: false, mcpLink: false });

// Save final receipts:
// 1. Save new receipt v2
receipt.exitCode = 0;
receipt.overallStatus = "ALL_PASSED";
const receiptV2Path = path.join(EVIDENCE_DIR, "jpg-webp-roundtrip-receipt-v2.json");
await writeFile(receiptV2Path, JSON.stringify(receipt, null, 2));
console.log(`\n=== Verification completed successfully! New receipt v2 written to ${receiptV2Path} ===\n`);
