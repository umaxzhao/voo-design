// Starts its own editor: node tests/e2e/command_palette.e2e.mjs
// Optional: VOO_URL, VOO_SCREENSHOT_DIR. Images stay outside the repository.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
const output = process.env.VOO_SCREENSHOT_DIR || join(tmpdir(), "voo-command-palette");
await mkdir(output, { recursive: true });
await withEditorBrowser(async ({ page, errors }) => {
  page.setDefaultTimeout(30000);
  const palette = page.getByTestId("command-palette");
  const input = palette.getByRole("combobox");
  const rows = palette.getByRole("option");
  const shortcuts = page.getByRole("dialog", { name: "Keyboard Shortcuts", exact: true });
  const screenshot = name => page.screenshot({ path: `${output}/cmdk-${name}.png`, timeout: 60000 });

  await page.keyboard.press("Control+k");
  await palette.waitFor();
  const rowCount = await rows.count();
  assert.ok(rowCount >= 65, `Expected at least 65 palette rows, got ${rowCount}`);
  console.log(`Indexed palette rows: ${rowCount}`);
  await screenshot("palette");
  const bounds = await palette.boundingBox();
  for (const id of ["editor-bottom-toolbar", "editor-contextual-taskbar"]) {
    const bar = page.getByTestId(id);
    if (await bar.count()) {
      const box = await bar.boundingBox();
      if (box) assert.ok(bounds.y + bounds.height <= box.y, `Palette overlaps ${id}`);
    }
  }
  await input.fill("blnun");
  await rows.filter({ hasText: "Unite" }).waitFor();
  await screenshot("palette-filter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await palette.waitFor({ state: "hidden" });

  for (const binding of ["Control+/", "Shift+Slash", "Meta+/"]) {
    await page.keyboard.press(binding);
    await shortcuts.waitFor();
    if (binding === "Control+/") await screenshot("shortcuts");
    await page.keyboard.press("Escape");
    await shortcuts.waitFor({ state: "hidden" });
  }
  await page.getByTestId("design-editor").click({ button: "right", position: { x: 750, y: 350 } });
  await page.getByRole("menuitem", { name: /Keyboard Shortcuts/ }).click();
  await shortcuts.waitFor();
  await page.keyboard.press("Escape");
  await shortcuts.waitFor({ state: "hidden" });

  await page.keyboard.press("Meta+k");
  await palette.waitFor();
  await input.fill("Rectangle");
  await page.waitForFunction(() => document.querySelector("#command-palette-option-0")?.textContent.includes("Rectangle"));
  await page.keyboard.press("Enter");
  await palette.waitFor({ state: "hidden" });
  await page.waitForFunction(() => window.__vooEditor.getTool() === "rect");

  await page.keyboard.press("Control+k");
  await palette.waitFor();
  await palette.getByText("Recent", { exact: true }).waitFor();
  await input.fill("Switch language to Chinese");
  await page.waitForFunction(() => document.querySelector("#command-palette-option-0")?.textContent.includes("Switch language to Chinese"));
  await page.keyboard.press("Enter");
  await page.evaluate(async () => { window.__paletteAuditGetLocale = (await import("/src/shared/i18n.js")).getLocale; });
  await page.waitForFunction(() => window.__paletteAuditGetLocale() === "zh");
  await page.keyboard.press("Control+k");
  await palette.waitFor();
  await input.fill("网格");
  await rows.filter({ hasText: "显示/隐藏网格" }).waitFor();
  await screenshot("palette-zh");
  assert.deepEqual(errors, []);
  console.log("Verified keyboard toggles, menu entry, ranking, Enter execution, recents, locale and placement.");
});
