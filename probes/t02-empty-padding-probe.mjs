import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "../tests/e2e/editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "../tests/e2e/ui-responsive-editor-helpers.mjs";

// Read-only T02 probe: vertical rhythm of empty property groups, measured from the live DOM for a plain
// rectangle (default theme). It asserts nothing; the caller reads the JSON. Groups are listed by test id.
const EVIDENCE = process.env.T02_PAD_EVIDENCE;
if (!EVIDENCE) throw new Error("T02_PAD_EVIDENCE must name an evidence directory");
await mkdir(EVIDENCE, { recursive: true });

const GROUP_IDS = [
  "editor-modifiers-section",
  "editor-style-section",
  "editor-effects-section",
  "editor-export-section",
  "editor-constraints-section",
];

const measure = (page) => page.evaluate((ids) => {
  const out = {};
  for (const id of ids) {
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) { out[id] = null; continue; }
    const header = root.firstElementChild;
    const rect = root.getBoundingClientRect();
    const headRect = header?.getBoundingClientRect();
    const body = header?.nextElementSibling ?? null;
    const bodyRect = body?.getBoundingClientRect();
    const s = body ? getComputedStyle(body) : null;
    out[id] = {
      groupHeight: Math.round(rect.height),
      headerHeight: headRect ? Math.round(headRect.height) : null,
      bodyHeight: bodyRect ? Math.round(bodyRect.height) : null,
      bodyPaddingTop: s?.paddingTop ?? null,
      bodyPaddingBottom: s?.paddingBottom ?? null,
      bodyChildren: body ? body.children.length : null,
    };
  }
  return out;
}, GROUP_IDS);

const results = {};
await withEditorBrowser(async ({ page }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    const rect = { ...createRectNode({ x: 100, y: 100, width: 120, height: 80, fill: "#ff0000" }), id: "t02-rect" };
    e.setDoc({ ...e.getDocument(), nodes: [rect], colorVariables: [], variablesV2: undefined, modifiers: [] });
    e.selectExactly([rect.id]);
  });
  await settlePanels(page);
  results.singleRectEmpty = await measure(page);
}, { openDocument: true, mcpLink: true });

await writeFile(join(EVIDENCE, "probe.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
