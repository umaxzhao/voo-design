import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const evidenceDir = "/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/inspector-font-768-e0-20261103T0601Z/screenshots";
await mkdir(evidenceDir, { recursive: true });

console.log("=== Matrix Verification: 320/390/768/1440 × Light/Dark × En/Zh ===");

await withEditorBrowser(async ({ page, tool }) => {
  const panel = page.getByTestId("editor-properties-panel");
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // Seed document with audit-rect
  await page.evaluate(async () => {
    const { createRectNode, createGroupNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    editor.setDoc({
      ...editor.getDocument(),
      width: 1000,
      height: 700,
      nodes: [
        { ...createGroupNode({ x: 40, y: 40, width: 700, height: 500 }), id: "audit-frame", name: "Audit Frame", isFrame: true, fill: "#ffffff" },
        { ...createRectNode({ x: 100, y: 100, width: 160, height: 120, fill: "#ff0000" }), id: "audit-rect", name: "Audit Rectangle", parentId: "audit-frame" },
      ],
    });
    editor.selectExactly(["audit-rect"]);
    editor.setTool("select");
  });
  await settle();

  const matrixResults = [];

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    for (const theme of ["dark", "light"]) {
      for (const locale of ["en", "zh"]) {
        await page.evaluate(async ({ theme, locale }) => {
          const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
          const { setLocale } = await import("/src/shared/i18n.js");
          setEditorTheme(theme);
          await setLocale(locale);
        }, { theme, locale });
        await settle();

        const toggle = panel.locator(".editor-mobile-panel-toggle");
        if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") {
          await toggle.click();
          await settle();
        }

        const xInput = panel.getByRole("textbox", { name: "X", exact: true });
        await xInput.scrollIntoViewIfNeeded();

        // 1. Measure computed styles of input and field container
        const metrics = await page.evaluate(() => {
          const x = document.querySelector('[data-testid="editor-properties-panel"] input[aria-label="X"]');
          const field = x ? x.closest('[data-inspector-control="field"]') : null;
          if (!x || !field) return null;
          const xStyle = getComputedStyle(x);
          const fStyle = getComputedStyle(field);
          const fBox = field.getBoundingClientRect();
          return {
            inputFontSize: parseFloat(xStyle.fontSize),
            inputFontFamily: xStyle.fontFamily,
            fieldHeight: fBox.height,
            fieldRadius: parseFloat(fStyle.borderRadius),
            fieldWidth: fBox.width,
            inputValue: x.value,
          };
        });

        assert.ok(metrics, `Input must exist in DOM at ${width}/${theme}/${locale}`);
        console.log(`[${width}px | ${theme} | ${locale}] input font-size: ${metrics.inputFontSize}px, field height: ${metrics.fieldHeight}px, radius: ${metrics.fieldRadius}px`);

        // Strict Contract Assertions
        assert.ok(metrics.inputFontSize >= 11, `Input font-size at ${width}px (${theme}/${locale}) must be >= 11px, got ${metrics.inputFontSize}px`);
        assert.equal(metrics.fieldRadius, 12, "Field radius must remain 12px");
        assert.equal(metrics.fieldHeight, width < 768 ? 48 : 32, `Field height at ${width}px must match specification`);

        // 2. Test Hover & Focus readability
        await xInput.hover();
        await settle();
        const hoverColor = await xInput.evaluate((el) => getComputedStyle(el).color);

        await xInput.focus();
        await settle();
        const focusMetrics = await page.evaluate(() => {
          const x = document.activeElement;
          return {
            isFocused: x?.getAttribute("aria-label") === "X",
            fontSize: parseFloat(getComputedStyle(x).fontSize),
          };
        });
        assert.ok(focusMetrics.isFocused, "Input receives focus cleanly");
        assert.ok(focusMetrics.fontSize >= 11, "Input retains >=11px font-size while focused");

        // 3. Test Geometry Edit & Undo threshold in each viewport
        const originalX = await page.evaluate(() => window.__vooEditor.getNode("audit-rect").x);
        await xInput.fill(String(originalX + 15));
        await xInput.press("Enter");
        await settle();

        const editedX = await page.evaluate(() => window.__vooEditor.getNode("audit-rect").x);
        assert.equal(editedX, originalX + 15, "Numeric input Enter commits actual geometry edit");

        await tool("undo");
        await settle();

        const restoredX = await page.evaluate(() => window.__vooEditor.getNode("audit-rect").x);
        assert.equal(restoredX, originalX, "Undo cleanly restores original geometry");

        // Screenshot for visual audit evidence
        const screenshotPath = `${evidenceDir}/matrix-${width}-${theme}-${locale}.png`;
        await panel.screenshot({ path: screenshotPath });

        matrixResults.push({
          width,
          theme,
          locale,
          inputFontSize: metrics.inputFontSize,
          fieldHeight: metrics.fieldHeight,
          fieldRadius: metrics.fieldRadius,
          screenshot: screenshotPath,
          pass: true,
        });
      }
    }
  }

  // Restore 1440 default
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { setEditorTheme } = await import("/src/canvas/use_editor_theme.js");
    const { setLocale } = await import("/src/shared/i18n.js");
    setEditorTheme("dark");
    await setLocale("en");
  });

  const matrixJsonPath = "/Users/tt/Documents/Codex/2026-11-02/task/closure-acceptance-evidence/inspector-font-768-e0-20261103T0601Z/matrix-results.json";
  await writeFile(matrixJsonPath, JSON.stringify(matrixResults, null, 2));
  console.log("All 16 matrix scenarios verified successfully. Results written to:", matrixJsonPath);
});
