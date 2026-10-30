import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "layer-window");
  await audit.seed();
  await page.evaluate(async () => {
    const {
      createRectNode
    } = await import("/src/canvas/editor/scene_model.js");
    const engine = window.__vooEditor;
    const nodes = Array.from({
      length: 2000
    }, (_, index) => ({
      ...createRectNode({
        x: index % 50 * 24,
        y: Math.floor(index / 50) * 24,
        width: 18,
        height: 18,
        fill: "#ff0000"
      }),
      id: `large-${index}`,
      name: `Layer${index}`
    }));
    engine.selectExactly([]);
    engine.setDoc({
      ...engine.getDocument(),
      isCanvasRoot: true,
      nodes
    });
  });
  const list = page.locator("[data-layers-list]");
  await audit.record("bounded-dom", async () => {
    await page.waitForFunction(() => document.querySelector("[data-windowed-layers]") && document.querySelectorAll("[data-layer-row-id]").length < 80);
    assert.ok((await list.locator("[data-layer-row-id]").count()) > 0);
    assert.ok(await list.evaluate(element => element.scrollHeight > 2000 * 30));
    return {
      totalLayers: 2000,
      mountedRows: await list.locator("[data-layer-row-id]").count()
    };
  });
  await audit.record("scroll-to-final-row", async () => {
    await list.evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    await page.locator("#layer-row-large-0").waitFor({
      state: "visible"
    });
    assert.ok((await list.locator("[data-layer-row-id]").count()) < 80);
    return {
      lastLayerReachable: true
    };
  });
  await audit.record("pointer-and-keyboard-selection", async () => {
    await page.locator('#layer-row-large-0 button[title="Rename layer"]').click();
    await page.waitForFunction(() => window.__vooEditor.getSelectedIds().includes("large-0"));
    await list.press("ArrowUp");
    await page.waitForFunction(() => window.__vooEditor.getSelectedIds().includes("large-1"));
    assert.equal(await list.getAttribute("aria-activedescendant"), "layer-row-large-1");
    return {
      realClick: true,
      arrowSelection: true
    };
  });
  await audit.record("offscreen-selection-mounts-focused-row", async () => {
    await page.evaluate(() => window.__vooEditor.selectExactly(["large-1000"]));
    await page.locator("#layer-row-large-1000").waitFor({
      state: "visible"
    });
    assert.equal(await list.getAttribute("aria-activedescendant"), "layer-row-large-1000");
    return {
      focusedDomExists: true
    };
  });
  await audit.record("rename-and-search", async () => {
    await page.locator('#layer-row-large-1000 button[title="Rename layer"]').dblclick();
    const rename = page.getByRole("textbox", {
      name: "Rename layer",
      exact: true
    });
    await rename.fill("WindowRenamed");
    await rename.press("Enter");
    await page.waitForFunction(() => window.__vooEditor.getNode("large-1000").name === "WindowRenamed");
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getNode("large-1000").name), "Layer1000");
    await page.getByRole("button", {
      name: "Toggle layer search",
      exact: true
    }).click();
    const search = page.getByRole("textbox", {
      name: "Filter layers",
      exact: true
    });
    await search.fill("Layer1999");
    await page.waitForFunction(() => document.querySelectorAll("[data-layer-row-id]").length === 1);
    assert.ok(await page.locator('#layer-row-large-1999 button[title="Rename layer"]').isVisible());
    await search.fill("");
    await page.locator("[data-windowed-layers]").waitFor();
    return {
      renameUndo: true,
      fullTreeSearch: true
    };
  });
  await audit.record("variable-height-filter-rows", async () => {
    await page.evaluate(() => {
      const engine = window.__vooEditor;
      engine.selectExactly(["large-1999"]);
      engine.updateNode("large-1999", {
        adjustments: {
          liveFilters: [{
            id: "filter-one",
            kind: "blur",
            enabled: false
          }, {
            id: "filter-two",
            kind: "sharpen",
            enabled: false
          }]
        }
      });
    });
    const row = page.locator('[data-layer-window-id="large-1999"]');
    await page.getByTestId("layer-filter-sublist-large-1999").waitFor();
    await page.waitForFunction(() => {
      const first = document.querySelector('[data-layer-window-id="large-1999"]')?.getBoundingClientRect();
      const next = document.querySelector('[data-layer-window-id="large-1998"]')?.getBoundingClientRect();
      return first && next && first.height > 50 && next.top >= first.bottom - 1;
    });
    assert.ok((await row.boundingBox()).height > 50);
    await tool("undo");
    await page.getByTestId("layer-filter-sublist-large-1999").waitFor({
      state: "detached"
    });
    return {
      measuredHeight: true,
      noOverlappingRows: true,
      undo: true
    };
  });
  audit.finish();
});
