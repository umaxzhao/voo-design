import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "toolbar");
  for (const family of ["select", "marquee", "brush", "pen", "shapes", "fill", "healing"]) {
    const trigger = page.getByTestId(`editor-${family}-menu-trigger`);
    const menu = page.getByTestId(`editor-${family}-menu-list`);
    await trigger.click();
    const labels = await menu.getByRole("menuitem").allTextContents();
    await page.keyboard.press("Escape");
    for (const [index, label] of labels.entries()) await audit.record(`${family}-${index}`, async () => {
      const image = await audit.seed();
      const before = await audit.pixels(image.id);
      await trigger.click();
      const choice = menu.getByRole("menuitem").nth(index);
      if (!(await choice.isEnabled())) {
        await page.keyboard.press("Escape");
        return {
          label,
          contextDisabled: true,
          context: "image"
        };
      }
      await choice.click();
      await menu.waitFor({
        state: "detached"
      });
      const state = await page.evaluate(() => {
        const e = window.__vooEditor;
        return {
          tool: e.getTool(),
          brush: e.getBrushMode(),
          healing: e.getHealingMode(),
          marquee: e.getMarqueeMode()
        };
      });
      assert.ok(state.tool);
      await page.getByTestId("editor-properties-panel").waitFor();
      if (family === "brush" || family === "healing" && ["spot", "clone"].includes(state.healing)) {
        await page.evaluate(() => {
          const e = window.__vooEditor;
          e.setBrushWidth(24);
          e.setBrushOpacity(1);
          e.setBrushFlow(1);
          e.setBrushStrength(1);
          e.setPressureSize(false);
          e.setPressureOpacity(false);
          e.setBrushSmoothing(0);
          e.setBrushTonalRange("all");
          e.setBrushProtectLuminosity(false);
          e.setBrushExposure(1);
          e.setColor("#ff00ff");
        });
        if (state.healing === "clone" && family === "healing") {
          const at = await audit.client({
            x: image.x + 10,
            y: image.y + 45
          });
          await page.keyboard.down("Alt");
          await page.mouse.click(at.x, at.y);
          await page.keyboard.up("Alt");
        }
        const previousImageId = await page.evaluate(id => window.__vooEditor.getNode(id).imageId, image.id);
        await audit.drag({
          x: image.x + 42,
          y: image.y + 30
        }, {
          x: image.x + 70,
          y: image.y + 65
        });
        await page.waitForFunction(({
          id,
          previousImageId
        }) => window.__vooEditor.getNode(id).imageId !== previousImageId, {
          id: image.id,
          previousImageId
        }, {
          timeout: 10000
        });
        assert.notDeepEqual(await audit.pixels(image.id), before, `${label} must change image pixels`);
        await tool("undo");
        assert.deepEqual(await audit.pixels(image.id), before);
      }
      if (family === "healing" && state.healing === "patch") {
        const points = [[35, 20], [65, 20], [65, 50], [35, 50], [35, 20]];
        const start = await audit.client({
          x: image.x + points[0][0],
          y: image.y + points[0][1]
        });
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        for (const [x, y] of points.slice(1)) {
          const at = await audit.client({
            x: image.x + x,
            y: image.y + y
          });
          await page.mouse.move(at.x, at.y, {
            steps: 4
          });
        }
        await page.mouse.up();
        assert.ok(await page.evaluate(() => window.__vooEditor.getPatchDraft()?.points?.length >= 3));
        const previous = await page.evaluate(id => window.__vooEditor.getNode(id).imageId, image.id);
        await audit.drag({
          x: image.x + 50,
          y: image.y + 35
        }, {
          x: image.x + 13,
          y: image.y + 45
        });
        await page.waitForFunction(({
          id,
          previous
        }) => window.__vooEditor.getNode(id).imageId !== previous, {
          id: image.id,
          previous
        }, {
          timeout: 10000
        });
        assert.notDeepEqual(await audit.pixels(image.id), before);
        await tool("undo");
        assert.deepEqual(await audit.pixels(image.id), before);
      }
      if (family === "shapes") {
        const document = await page.evaluate(() => window.__vooEditor.serialise());
        await audit.drag({
          x: 320,
          y: 140
        }, {
          x: 380,
          y: 210
        });
        const after = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
        assert.ok(after.length > document.nodes.length, `${label} must create artwork`);
        const added = after.find(node => !document.nodes.some(original => original.id === node.id));
        assert.ok((await audit.pixels(added.id)).painted > 0);
        await tool("undo");
        assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), document);
      }
      if (family === "fill") {
        await page.evaluate(() => window.__vooEditor.setColor("#00ff00"));
        const previousImageId = await page.evaluate(id => window.__vooEditor.getNode(id).imageId, image.id);
        if (state.tool === "fill") {
          const at = await audit.client({
            x: image.x + 10,
            y: image.y + 45
          });
          await page.mouse.click(at.x, at.y);
        } else await audit.drag({
          x: image.x + 10,
          y: image.y + 20
        }, {
          x: image.x + 75,
          y: image.y + 60
        });
        await page.waitForFunction(({
          id,
          previousImageId
        }) => window.__vooEditor.getNode(id).imageId !== previousImageId, {
          id: image.id,
          previousImageId
        }, {
          timeout: 10000
        });
        assert.notDeepEqual(await audit.pixels(image.id), before);
        await tool("undo");
        assert.deepEqual(await audit.pixels(image.id), before);
      }
      if (family === "pen" && ["pen", "curvature_pen", "free_pen"].includes(state.tool)) {
        const document = await page.evaluate(() => window.__vooEditor.serialise());
        if (state.tool === "free_pen") await audit.drag({
          x: 320,
          y: 140
        }, {
          x: 380,
          y: 210
        });else {
          for (const point of [{
            x: 320,
            y: 140
          }, {
            x: 380,
            y: 150
          }, {
            x: 360,
            y: 210
          }]) {
            const at = await audit.client(point);
            await page.mouse.click(at.x, at.y);
          }
          await page.getByTestId("editor-taskbar-finishPath").click();
        }
        const added = await page.evaluate(ids => window.__vooEditor.getDocument().nodes.find(node => !ids.includes(node.id)), document.nodes.map(node => node.id));
        assert.ok(added?.kind === "path");
        assert.ok((await audit.pixels(added.id)).painted > 0);
        await tool("undo");
        assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), document);
      }
      return {
        label,
        selected: state,
        imagePixels: ["brush", "fill"].includes(family) || family === "healing" && ["spot", "clone", "patch"].includes(state.healing),
        nativeToolbar: true
      };
    });
  }
  audit.finish();
});
