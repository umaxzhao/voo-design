import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 real-UI audit: properties panel structure, dividers, default-open and empty-state
// rhythm, and the centre cross, measured in Chromium and captured as screenshots.
// Evidence goes to T02_EVIDENCE (a new directory outside the original trees).
const EVIDENCE = process.env.T02_EVIDENCE;
assert.ok(EVIDENCE, "T02_EVIDENCE must name an evidence directory outside the original trees");
await mkdir(EVIDENCE, { recursive: true });

const VIEWPORTS = [
  { name: "wide-1440", width: 1440, height: 1000 },
  { name: "narrow-1100", width: 1100, height: 800 },
];

const sectionReport = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-testid="editor-properties-panel"]');
    if (!panel) return { panel: false };
    return [...panel.querySelectorAll("[data-inspector-section]")].map((section) => {
      const style = getComputedStyle(section);
      const title = section.querySelector("span.overflow-hidden")?.textContent?.trim() ?? null;
      const body = section.children[1] ?? null;
      return {
        title,
        borderTop: style.borderTopWidth,
        structure: section.getAttribute("data-ui-structure"),
        bodyChildren: body ? body.children.length : 0,
        empty: !body,
        height: Math.round(section.getBoundingClientRect().height),
      };
    });
  });

const crossGeometry = async (page) => {
  const diagram = await page.getByTestId("editor-constraints-diagram").boundingBox();
  const vStroke = await page.getByTestId("editor-constraints-center-vertical").locator("span[aria-hidden='true']").boundingBox();
  const hStroke = await page.getByTestId("editor-constraints-center-horizontal").locator("span[aria-hidden='true']").boundingBox();
  return {
    centreX: diagram.x + diagram.width / 2,
    centreY: diagram.y + diagram.height / 2,
    vCentreX: vStroke.x + vStroke.width / 2,
    hCentreY: hStroke.y + hStroke.height / 2,
    hSpan: [hStroke.x, hStroke.x + hStroke.width],
    vSpan: [vStroke.y, vStroke.y + vStroke.height],
  };
};

const results = [];

await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  const runs = VIEWPORTS.flatMap((viewport) => ["dark", "light"].map((theme) => ({ ...viewport, theme })));
  for (const viewport of runs) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, viewport.theme);
    viewport.name = `${viewport.name}-${viewport.theme}`;
    await settlePanels(page);

    const panel = page.getByTestId("editor-properties-panel");
    await panel.waitFor();
    const sections = await sectionReport(page);
    await panel.screenshot({ path: join(EVIDENCE, `${viewport.name}-properties-panel.png`) });

    const cross = await crossGeometry(page);
    const diagram = page.getByTestId("editor-constraints-diagram");
    await diagram.screenshot({ path: join(EVIDENCE, `${viewport.name}-constraints-cross.png`) });

    // Keyboard reachability: Tab through the panel until the centre-vertical pin takes focus.
    await page.getByTestId("editor-constraints-left").focus();
    let reached = false;
    for (let step = 0; step < 40 && !reached; step += 1) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "editor-constraints-center-vertical");
    }
    assert.ok(reached, `${viewport.name}: keyboard Tab must reach editor-constraints-center-vertical`);
    const focusVisible = await page.evaluate(() => document.activeElement.matches(":focus-visible"));
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert.ok(focusVisible, `${viewport.name}: Tab focus must be :focus-visible`);
    assert.notEqual(outline, "none", `${viewport.name}: focused centre pin must show an outline`);

    await page.keyboard.press("Enter");
    const afterEnter = await page.evaluate(() => window.__vooEditor.getNode("responsive-target").constraints?.vertical);
    assert.equal(afterEnter, "center", `${viewport.name}: Enter on Tab-focused centre pin must set vertical=center`);
    await page.keyboard.press("ControlOrMeta+Z");

    // Real pointer click on the centre-horizontal pin midpoint.
    const horizontal = await page.getByTestId("editor-constraints-center-horizontal").boundingBox();
    await page.mouse.click(horizontal.x + horizontal.width / 2, horizontal.y + horizontal.height / 2);
    await page.waitForFunction(() => window.__vooEditor.getNode("responsive-target").constraints?.horizontal === "center");
    await page.keyboard.press("ControlOrMeta+Z");

    results.push({ viewport: viewport.name, sections, cross, focusOutline: outline, tabReached: reached });
  }

  assert.deepEqual(errors, [], `page errors during audit: ${errors.join("\n")}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(EVIDENCE, "t02-panel-audit.json"), JSON.stringify(results, null, 2));
  console.log(`T02 panel audit written: ${join(EVIDENCE, "t02-panel-audit.json")}`);
  for (const r of results) {
    console.log(`${r.viewport}: sections=${r.sections.length} crossDiffX=${(r.cross.vCentreX - r.cross.centreX).toFixed(2)} crossDiffY=${(r.cross.hCentreY - r.cross.centreY).toFixed(2)} focus=${r.focusOutline}`);
  }
}, { openDocument: true, mcpLink: true });
