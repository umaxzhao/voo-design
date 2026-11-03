import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { seedResponsiveDocument, settlePanels } from "./ui-responsive-editor-helpers.mjs";

// T02 reachability by selection kind (default theme, 1440). Expectations come from the section rules in
// src/canvas/components/editor_properties/panel_extras.js (resolveExtras), not from observed DOM alone.
const WIDTH = Number(process.env.T02_WIDTH ?? 1440);
const THEME = process.env.T02_THEME ?? "dark";
const checks = [];

const CASES = {
  text: {
    nodes: `[{ ...createTextNode({ x: 100, y: 100, text: "Hello", fill: "#ff0000", fontSize: 24 }), id: "t02-text" }]`,
    select: `["t02-text"]`,
    // Single non-frame: Modifiers and Styles are offered; colour variables follow fill support.
    expect: { modifiers: true, styles: true, export: true },
  },
  image: {
    nodes: `[{ ...createImageNode({ x: 100, y: 100, width: 120, height: 80, imageId: null, src: null }), id: "t02-image" }]`,
    select: `["t02-image"]`,
    // Images: no colour-variable group (panel_extras excludes kind image); Modifiers still offered.
    expect: { modifiers: true, variables: false, export: true },
  },
  multi: {
    nodes: `[{ ...createRectNode({ x: 100, y: 100, width: 60, height: 60, fill: "#ff0000" }), id: "t02-a" }, { ...createRectNode({ x: 220, y: 100, width: 60, height: 60, fill: "#00ff00" }), id: "t02-b" }]`,
    select: `["t02-a", "t02-b"]`,
    // Multi-selection: Modifiers and Styles are single-selection only; Export is offered.
    expect: { modifiers: false, styles: false, export: true },
  },
  frame: {
    nodes: `[{ ...createGroupNode({ x: 100, y: 100, width: 200, height: 150 }), id: "t02-frame", isFrame: true }]`,
    select: `["t02-frame"]`,
    // Frames: Modifiers hidden by design; Export offered.
    expect: { modifiers: false, export: true },
  },
};

await withEditorBrowser(async ({ page, errors }) => {
  await seedResponsiveDocument(page);
  await page.setViewportSize({ width: WIDTH, height: 1000 });
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, THEME);
  const panel = page.getByTestId("editor-properties-panel");

  for (const [kind, c] of Object.entries(CASES)) {
    await page.evaluate(async ({ nodesSrc, selectSrc }) => {
      const { createRectNode, createTextNode, createImageNode, createGroupNode } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      const nodes = eval(nodesSrc);
      e.setDoc({ ...e.getDocument(), nodes, colorVariables: [], variablesV2: undefined, modifiers: [] });
      e.selectExactly(eval(selectSrc));
    }, { nodesSrc: c.nodes, selectSrc: c.select });
    await settlePanels(page);

    const seen = {
      modifiers: await page.getByTestId("editor-modifiers-section").count() > 0,
      styles: await page.getByTestId("editor-style-section").count() > 0,
      variables: await page.getByTestId("editor-color-variable-create").count() > 0,
      export: await panel.getByText("Export", { exact: true }).count() >= 1,
    };
    for (const [section, want] of Object.entries(c.expect)) {
      assert.equal(seen[section], want, `${kind}: ${section} expected ${want}, saw ${seen[section]}`);
    }
    checks.push(`${kind}: ${Object.entries(c.expect).map(([k, v]) => `${k}=${v}`).join(", ")} (as contracted)`);
  }

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log(`T02 reachability ok (${WIDTH}px, ${THEME}):\n- ${checks.join("\n- ")}`);
}, { openDocument: true, mcpLink: true });
