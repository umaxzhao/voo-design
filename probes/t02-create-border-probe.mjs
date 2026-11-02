import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "../tests/e2e/editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "../tests/e2e/ui-responsive-editor-helpers.mjs";

// Read-only T02 probe: the Variables "create" button border in each theme under rest, hover, focus and
// disabled states. It asserts nothing and writes no document change; the caller reads the JSON.
const EVIDENCE = process.env.T02_BORDER_EVIDENCE;
if (!EVIDENCE) throw new Error("T02_BORDER_EVIDENCE must name an evidence directory");
await mkdir(EVIDENCE, { recursive: true });

const readBorder = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="editor-color-variable-create"]');
  if (!el) return null;
  const s = getComputedStyle(el);
  return {
    disabled: el.disabled,
    border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
    background: s.backgroundColor,
    outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
    boxShadow: s.boxShadow,
    className: el.className.slice(0, 240),
  };
});

const results = [];
await withEditorBrowser(async ({ page }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const rect = { ...createRectNode({ x: 100, y: 100, width: 120, height: 80, fill: "#ff0000" }), id: "t02-rect" };
    e.setDoc({ ...e.getDocument(), nodes: [rect], colorVariables: [], variablesV2: undefined });
    e.selectExactly([rect.id]);
  });
  await settlePanels(page);

  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await settlePanels(page);
    const button = page.getByTestId("editor-properties-panel").getByTestId("editor-color-variable-create");
    await page.mouse.move(0, 0);
    await settlePanels(page);
    results.push({ theme, state: "rest", ...(await readBorder(page)) });

    await button.hover();
    await settlePanels(page);
    results.push({ theme, state: "hover", ...(await readBorder(page)) });

    await page.mouse.move(0, 0);
    await button.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await settlePanels(page);
    const focused = await page.evaluate(() => document.activeElement?.dataset?.testid ?? null);
    results.push({ theme, state: "focus", focusedTestId: focused, ...(await readBorder(page)) });
    await page.screenshot({ path: join(EVIDENCE, `create-${theme}-focus.png`) });
  }
}, { openDocument: true, mcpLink: true });

await writeFile(join(EVIDENCE, "probe.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
