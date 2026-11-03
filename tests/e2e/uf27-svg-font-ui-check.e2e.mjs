import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const EVIDENCE_DIR = "/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/uf27-aad8-20261103T0118";
const EXPORT_SVG_PATH = join(EVIDENCE_DIR, "uf27-ui-exported.svg");
const SCREENSHOT_PATH = join(EVIDENCE_DIR, "uf27-ui-reimported.png");
const REPORT_PATH = join(EVIDENCE_DIR, "uf27-ui-verification-report.json");

const TEST_TEXT = "Typography ✓ 459";
const TARGET_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const TARGET_FONT_SIZE = 32;

await withEditorBrowser(async ({ page, errors }) => {
  page.setDefaultTimeout(30000);

  // Helper to get client coordinates of artboard center
  const getArtboardCenter = async () => page.evaluate(() => {
    const artboard = document.querySelector("[data-editor-artboard]");
    if (!artboard) throw new Error("Missing [data-editor-artboard]");
    const rect = artboard.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  const center = await getArtboardCenter();

  // 1. Author text node via real UI actions:
  // Select text tool via toolbar button or keyboard shortcut 't'
  await page.getByTestId("editor-toolbar").getByRole("button", { name: "Text", exact: true }).click();
  await page.waitForTimeout(200);

  // Click on artboard to initiate text editing
  await page.mouse.click(center.x, center.y);
  const textarea = page.locator("textarea:visible");
  await textarea.waitFor({ timeout: 10000 });
  await textarea.fill(TEST_TEXT);
  await textarea.press("Escape");
  await page.waitForTimeout(300);

  // Text node is created and selected on canvas
  const selectedNodesBefore = await page.evaluate(() => window.__vooEditor.getSelectedNodes());
  assert.equal(selectedNodesBefore.length, 1, "One text node must be created and selected");
  const textNodeId = selectedNodesBefore[0].id;

  // Set font family containing quotes and font size 32
  await page.evaluate(({ id, fontFamily, fontSize }) => {
    window.__vooEditor.updateNode(id, { fontFamily, fontSize });
  }, { id: textNodeId, fontFamily: TARGET_FONT_FAMILY, fontSize: TARGET_FONT_SIZE });

  // Wait for update to reflect
  await page.waitForFunction(({ id, fontSize }) => {
    const node = window.__vooEditor.getNode(id);
    return node && node.fontSize === fontSize;
  }, { id: textNodeId, fontSize: TARGET_FONT_SIZE });

  const beforeExportNode = await page.evaluate(id => window.__vooEditor.getNode(id), textNodeId);
  assert.equal(beforeExportNode.fontSize, TARGET_FONT_SIZE);
  assert.equal(beforeExportNode.text, TEST_TEXT);
  assert.ok(beforeExportNode.fontFamily.includes("'"), "Authored font family must contain quotes");

  // 2. Real UI Export: trigger export dialog via Control+Shift+e
  await page.keyboard.press("Control+Shift+e");
  const dialog = page.getByTestId("design-export-dialog");
  await dialog.waitFor();

  // Switch export range to "Selected layers" so the text node itself is cleanly exported
  const selectionRadio = dialog.getByRole("radio", { name: /Selected layers|所选图层/i });
  if (await selectionRadio.isVisible()) {
    await selectionRadio.click();
  }

  // Select SVG format in export dialog
  await dialog.getByRole("button", { name: "SVG", exact: true }).click();

  // Listen for real browser download event and click Export
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(EXPORT_SVG_PATH);

  // Verify exported SVG file on disk
  const svgContent = await readFile(EXPORT_SVG_PATH, "utf-8");
  assert.match(svgContent, /<svg/i, "Exported file must be valid SVG");
  assert.match(svgContent, /font-family="[^"]*&#39;Segoe UI&#39;[^"]*"/, "Exported SVG must contain &#39; entity from escapeXml");
  assert.match(svgContent, /font-size="32"/, "Exported SVG must specify font-size 32");
  assert.match(svgContent, /Typography/, "Exported SVG must contain text content");

  // Parse exported SVG width, height, and viewBox
  const svgWidthMatch = svgContent.match(/<svg[^>]*\bwidth="([^"]+)"/);
  const svgHeightMatch = svgContent.match(/<svg[^>]*\bheight="([^"]+)"/);
  const exportedSvgDimensions = {
    width: svgWidthMatch ? Number.parseFloat(svgWidthMatch[1]) : null,
    height: svgHeightMatch ? Number.parseFloat(svgHeightMatch[1]) : null,
  };
  assert.equal(exportedSvgDimensions.width, 264, `Exported SVG width must be 264: actual=${exportedSvgDimensions.width}`);
  assert.equal(exportedSvgDimensions.height, 40, `Exported SVG height must be 40: actual=${exportedSvgDimensions.height}`);

  // 3. Clear canvas so we can test clean re-import
  await page.evaluate(() => {
    window.__vooEditor.setDoc({ ...window.__vooEditor.getDocument(), nodes: [] });
  });
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 0);

  // 4. Real UI re-import through file chooser
  // Open context menu on canvas (right-click)
  const currentCenter = await getArtboardCenter();
  await page.mouse.click(currentCenter.x, currentCenter.y, { button: "right" });
  const importMediaMenu = page.getByTestId("editor-menu-import-media");
  await importMediaMenu.waitFor();

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    importMediaMenu.click(),
  ]);
  await chooser.setFiles(EXPORT_SVG_PATH);

  // Wait for re-imported text node to appear on canvas
  await page.waitForFunction(() => {
    const nodes = window.__vooEditor?.getDocument()?.nodes ?? [];
    return nodes.some(n => n.kind === "text" && n.text.includes("Typography"));
  }, null, { timeout: 15000 });

  const importedNodes = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
  const importedTextNode = importedNodes.find(n => n.kind === "text" && n.text.includes("Typography"));
  assert.ok(importedTextNode, "Re-imported text node must exist on canvas");

  // 5. Pre-mutation state capture: save imported node's original state BEFORE any mutation
  const originalImportState = {
    id: importedTextNode.id,
    clipTo: importedTextNode.clipTo ?? null,
    visible: importedTextNode.visible !== false,
    width: importedTextNode.width,
    height: importedTextNode.height,
    fontFamily: importedTextNode.fontFamily,
    fontSize: importedTextNode.fontSize,
  };

  // 6. Detailed Comparisons:
  // (a) family: must be decoded, no &#39; or &# entities
  assert.ok(!importedTextNode.fontFamily.includes("&#"), `Font family must not contain XML entities: ${importedTextNode.fontFamily}`);
  assert.ok(importedTextNode.fontFamily.includes("Segoe UI"), `Font family must contain Segoe UI: ${importedTextNode.fontFamily}`);

  // (b) Unicode: exact text preserved
  assert.equal(importedTextNode.text, TEST_TEXT, `Unicode text must match exactly: ${importedTextNode.text}`);

  // (c) font size: exactly 32
  assert.equal(importedTextNode.fontSize, TARGET_FONT_SIZE, `Font size must be ${TARGET_FONT_SIZE}: ${importedTextNode.fontSize}`);

  // (d) Compare exported SVG width/height (264x40) with original and imported node dimensions
  assert.equal(importedTextNode.width, 264, `Imported width must match 264: actual=${importedTextNode.width}`);
  assert.equal(importedTextNode.height, 40, `Imported height must match 40: actual=${importedTextNode.height}`);
  assert.equal(importedTextNode.width, exportedSvgDimensions.width, `Imported width must match exported SVG width: ${importedTextNode.width} vs ${exportedSvgDimensions.width}`);
  assert.equal(importedTextNode.height, exportedSvgDimensions.height, `Imported height must match exported SVG height: ${importedTextNode.height} vs ${exportedSvgDimensions.height}`);
  assert.equal(importedTextNode.width, beforeExportNode.width, `Imported width must match before-export node width: ${importedTextNode.width} vs ${beforeExportNode.width}`);
  assert.equal(importedTextNode.height, beforeExportNode.height, `Imported height must match before-export node height: ${importedTextNode.height} vs ${beforeExportNode.height}`);

  // (e) effective ctx font: valid CSS font string accepted by browser 2D canvas
  const ctxFontCheck = await page.evaluate((family) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const fontString = `32px ${family}`;
    ctx.font = fontString;
    return {
      assigned: fontString,
      effective: ctx.font,
      accepted: ctx.font.includes("32px"),
    };
  }, importedTextNode.fontFamily);
  assert.ok(ctxFontCheck.accepted, `Browser canvas must accept the decoded font string without fallback: ${JSON.stringify(ctxFontCheck)}`);

  // (f) Unmodified imported node pixel check (NO updateNode / NO mutation):
  const unmodifiedPixelCheck = await page.evaluate(async (nodeId) => {
    const node = window.__vooEditor.getNode(nodeId);
    const pngResult = window.__vooEditor.exportSelectionPng([nodeId], { scale: 1, type: "image/png", transparent: true });
    if (!pngResult?.dataUrl) return { error: "No PNG exported", nonTransparentPixels: 0, hasGlyphPixels: false };
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = pngResult.dataUrl;
    });
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonTransparentPixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 20) nonTransparentPixels++;
    }
    return {
      nodeClipTo: node?.clipTo ?? null,
      nodeVisible: node?.visible !== false,
      width: img.width,
      height: img.height,
      nonTransparentPixels,
      hasGlyphPixels: nonTransparentPixels > 100,
    };
  }, importedTextNode.id);

  assert.ok(unmodifiedPixelCheck.hasGlyphPixels, `Unmodified imported node must render real glyph pixels: ${JSON.stringify(unmodifiedPixelCheck)}`);

  // (g) Separate, explicitly labelled sample: test-only clip removal verification
  const testOnlyClipRemovalSample = await page.evaluate(async (nodeId) => {
    const originalNode = window.__vooEditor.getNode(nodeId);
    const hadOriginalClip = originalNode?.clipTo != null;
    let postRemovalPixels = null;

    if (hadOriginalClip) {
      window.__vooEditor.updateNode(nodeId, { clipTo: null });
      const pngResult = window.__vooEditor.exportSelectionPng([nodeId], { scale: 1, type: "image/png", transparent: true });
      if (pngResult?.dataUrl) {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = pngResult.dataUrl;
        });
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let count = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 20) count++;
        }
        postRemovalPixels = count;
      }
    }

    return {
      sampleLabel: "test-only-clip-removal-sample",
      hadOriginalClip,
      originalClipTo: originalNode?.clipTo ?? null,
      clipRemovalPerformed: hadOriginalClip,
      postRemovalPixels,
      note: hadOriginalClip
        ? "clipTo was present and removed in this isolated test-only sample"
        : "unmodified imported node has clipTo === null, so no clip removal was performed or needed",
    };
  }, importedTextNode.id);

  // Take screenshot for evidence
  await page.screenshot({ path: SCREENSHOT_PATH });

  // Scope constraints
  const scopeConstraints = {
    scope: "web-svg-canvas-entities",
    targetFontFamily: TARGET_FONT_FAMILY,
    verifiedFontFormat: "Chromium 2D Canvas SVG font-family XML character reference decode",
    generalizationConstraint: "Verified specifically for web canvas and SVG XML entity round-trip ('system-ui, -apple-system, Segoe UI, sans-serif') in browser engine. Not generalized to Mac native font subsystem (CoreText/AppKit) or arbitrary system fonts.",
  };

  // Write detailed evidence report
  const report = {
    task: "UF27",
    headline: "SVG font-family XML entity decode and real UI roundtrip verification",
    timestamp: new Date().toISOString(),
    testText: TEST_TEXT,
    targetFontFamily: TARGET_FONT_FAMILY,
    targetFontSize: TARGET_FONT_SIZE,
    exportedSvgPath: EXPORT_SVG_PATH,
    exportedSvgSnippet: svgContent.slice(0, 400),
    exportedSvgDimensions,
    originalImportState,
    dimensionsComparison: {
      exportedSvgWidth: exportedSvgDimensions.width,
      exportedSvgHeight: exportedSvgDimensions.height,
      beforeExportWidth: beforeExportNode.width,
      beforeExportHeight: beforeExportNode.height,
      importedNodeWidth: importedTextNode.width,
      importedNodeHeight: importedTextNode.height,
      widthExactMatch264: importedTextNode.width === 264 && exportedSvgDimensions.width === 264,
      heightExactMatch40: importedTextNode.height === 40 && exportedSvgDimensions.height === 40,
    },
    comparisons: {
      familyDecoded: !importedTextNode.fontFamily.includes("&#"),
      familyActual: importedTextNode.fontFamily,
      unicodeMatch: importedTextNode.text === TEST_TEXT,
      fontSizeMatch: importedTextNode.fontSize === TARGET_FONT_SIZE,
      ctxFontAccepted: ctxFontCheck.accepted,
      ctxFontDetails: ctxFontCheck,
      unmodifiedPixelCheck,
      testOnlyClipRemovalSample,
    },
    scopeConstraints,
    pageErrors: errors,
    verdict: "PASS",
  };
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ passed: true, report }, null, 2));
}, { openDocument: true, mcpLink: true });
