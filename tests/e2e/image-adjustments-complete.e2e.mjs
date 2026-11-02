import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "adjustments");
  const catalog = await page.evaluate(async () => {
    const {
      ADJUSTMENT_KINDS,
      EFFECT_KINDS,
      FILTER_KINDS
    } = await import("/src/canvas/editor/adjustment_kinds.js");
    return {
      adjustments: ADJUSTMENT_KINDS,
      effects: EFFECT_KINDS,
      filters: FILTER_KINDS
    };
  });
  for (const [category, kinds] of Object.entries({
    adjustments: catalog.adjustments,
    effects: catalog.effects
  })) {
    for (const kind of kinds) await audit.record(`${category}-${kind}`, async () => {
      const {
        id
      } = await audit.seed();
      const before = await audit.pixels(id);
      const patch = await page.evaluate(async ({
        id,
        kind,
        category
      }) => {
        const {
          starterAdjustment,
          starterEffect
        } = await import("/src/canvas/editor/adjustment_starters.js");
        const value = category === "effects" ? starterEffect(kind) : starterAdjustment(kind);
        window.__vooEditor.updateNode(id, {
          [category]: {
            [kind]: value
          }
        });
        return value;
      }, {
        id,
        kind,
        category
      });
      assert.ok(patch?.enabled, "The advertised starter must enable the operation");
      const after = await audit.pixels(id);
      assert.notDeepEqual(after, before, `${kind} must alter actual image pixels`);
      await tool("undo");
      assert.deepEqual(await audit.pixels(id), before, "One undo must restore the image");
      await tool("redo");
      const restored = await page.evaluate(({
        id,
        category,
        kind
      }) => window.__vooEditor.getNode(id)[category][kind], {
        id,
        category,
        kind
      });
      assert.equal(restored.enabled, true);
      const pixels = await audit.pixels(id);
      assert.notDeepEqual(pixels, before, "Redo must paint the operation again");
      return {
        before,
        after,
        restoredPixels: pixels
      };
    });
  }
  for (const kind of catalog.filters) await audit.record(`stack-${kind}`, async () => {
    const {
      id
    } = await audit.seed();
    const before = await audit.pixels(id);
    await page.evaluate(async ({
      id,
      kind
    }) => {
      const {
        starterAdjustment
      } = await import("/src/canvas/editor/adjustment_starters.js");
      const {
        createLiveFilterEntry
      } = await import("/src/canvas/editor/live_filter_stack.js");
      window.__vooEditor.updateNode(id, {
        adjustments: {
          liveFilters: [createLiveFilterEntry(kind, starterAdjustment(kind))]
        }
      });
    }, {
      id,
      kind
    });
    assert.notDeepEqual(await audit.pixels(id), before, "The live filter must render");
    await tool("undo");
    assert.deepEqual(await audit.pixels(id), before);
    return {
      rendered: true,
      undo: true
    };
  });
  audit.finish();
});
