import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "../tests/e2e/editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "../tests/e2e/ui-responsive-editor-helpers.mjs";

// Read-only T02 probe: vertical rhythm of property groups for rect, text and image selections at a given
// width and theme. It asserts nothing and changes nothing in the document; the caller reads the JSON.
const EVIDENCE = process.env.T02_KIND_EVIDENCE;
const WIDTH = Number(process.env.T02_WIDTH ?? 1440);
const THEME = process.env.T02_THEME ?? "dark";
if (!EVIDENCE) throw new Error("T02_KIND_EVIDENCE must name an evidence directory");
await mkdir(EVIDENCE, { recursive: true });

const NODES = {
  rect: `{ ...createRectNode({ x: 100, y: 100, width: 120, height: 80, fill: "#ff0000" }), id: "t02-n" }`,
  text: `{ ...createTextNode({ x: 100, y: 100, text: "Hello", fill: "#ff0000", fontSize: 24 }), id: "t02-n" }`,
  image: `{ ...createImageNode({ x: 100, y: 100, width: 120, height: 80, imageId: null, src: null }), id: "t02-n" }`,
};

// Group heights from the live panel: every element that carries a section test id, plus the containers of
// the variables and constraints controls (their groups have no section test id).
const measure = (page) => page.evaluate(() => {
  const panel = document.querySelector('[data-testid="editor-properties-panel"]');
  if (!panel) return { error: "no properties panel" };
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
  const out = {};
  for (const el of panel.querySelectorAll("[data-testid$='-section']")) out[el.dataset.testid] = h(el);
  const ancestorHeight = (testid, levels) => {
    let el = panel.querySelector(`[data-testid="${testid}"]`);
    for (let i = 0; i < levels && el; i += 1) el = el.parentElement;
    return h(el);
  };
  out["group:variables(via editor-color-variable-create)"] = ancestorHeight("editor-color-variable-create", 2);
  out["group:constraints(via editor-constraints-diagram)"] = ancestorHeight("editor-constraints-diagram", 2);
  return out;
});

const results = {};
await withEditorBrowser(async ({ page }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: WIDTH, height: 1000 });
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, THEME);
  for (const [kind, node] of Object.entries(NODES)) {
    await page.evaluate(async ({ kind: k, nodeSrc }) => {
      const { createRectNode, createTextNode, createImageNode } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      const build = new Function("createRectNode", "createTextNode", "createImageNode", `return (${nodeSrc});`);
      const n = build(createRectNode, createTextNode, createImageNode);
      e.setDoc({ ...e.getDocument(), nodes: [n], colorVariables: [], variablesV2: undefined, modifiers: [] });
      e.selectExactly([n.id]);
    }, { kind, nodeSrc: node });
    await settlePanels(page);
    results[kind] = await measure(page);
  }
}, { openDocument: true, mcpLink: true });

const name = `w${WIDTH}-${THEME}`;
await writeFile(join(EVIDENCE, `${name}.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ name, results }, null, 2));
