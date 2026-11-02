import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "selection-warp");
  const activate = kind => page.evaluate(kind => window.__vooEditor.setTool(kind), kind);
  const click = async point => {
    const at = await audit.client(point);
    await page.mouse.click(at.x, at.y);
  };
  for (const mode of ["region", "ellipse", "lasso", "poly", "magnetic"]) await audit.record(`marquee-${mode}`, async () => {
    const node = await audit.seed();
    await activate("marquee");
    await page.evaluate(mode => window.__vooEditor.setMarqueeMode(mode), mode);
    const points = [{
      x: node.x + 5,
      y: node.y + 5
    }, {
      x: node.x + 55,
      y: node.y + 5
    }, {
      x: node.x + 55,
      y: node.y + 55
    }, {
      x: node.x + 5,
      y: node.y + 55
    }];
    if (mode === "poly" || mode === "magnetic") {
      for (const point of points) await click(point);
      await page.keyboard.press("Enter");
    } else if (mode === "lasso") {
      const start = await audit.client(points[0]);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (const point of [...points.slice(1), points[0]]) {
        const at = await audit.client(point);
        await page.mouse.move(at.x, at.y, {
          steps: 4
        });
      }
      await page.mouse.up();
    } else await audit.drag(points[0], points[2]);
    const selection = await page.evaluate(() => window.__vooEditor.getPixelSelection());
    assert.ok(selection?.contours?.length, "The pointer gesture must create a pixel selection");
    assert.equal(selection.nodeId, node.id);
    await page.evaluate(() => window.__vooEditor.invertPixelSelection());
    assert.notDeepEqual(await page.evaluate(() => window.__vooEditor.getPixelSelection()), selection);
    await page.evaluate(() => window.__vooEditor.clearPixelSelection());
    assert.equal(await page.evaluate(() => window.__vooEditor.getPixelSelection()), null);
    return {
      selection: true,
      invert: true,
      clear: true
    };
  });
  for (const kind of ["wand", "ai_select"]) await audit.record(kind, async () => {
    const node = await audit.seed();
    await activate(kind);
    if (kind === "ai_select") await audit.drag({
      x: node.x + 8,
      y: node.y + 25
    }, {
      x: node.x + 15,
      y: node.y + 65
    });else await click({
      x: node.x + 10,
      y: node.y + 45
    });
    if (kind === "ai_select") {
      const dialog = page.getByRole("dialog", {
        name: "Download cutout model?",
        exact: true
      });
      await dialog.waitFor();
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
      await dialog.getByRole("button", {
        name: "Download",
        exact: true
      }).focus();
      await page.keyboard.press("Tab");
      assert.equal(await dialog.getByRole("button", {
        name: "Cancel",
        exact: true
      }).evaluate(element => element === document.activeElement), true);
      await page.keyboard.press("Escape");
      await dialog.waitFor({
        state: "detached"
      });
      assert.equal(await page.evaluate(() => window.__vooEditor.getPixelSelection()), null);
      return {
        localModelRequired: true,
        focusBoundary: true,
        escapeCancel: true,
        noSilentDownload: true
      };
    }
    await page.waitForFunction(() => window.__vooEditor.getPixelSelection()?.contours?.length > 0, null, {
      timeout: 15000
    });
    assert.equal(await page.evaluate(() => window.__vooEditor.getPixelSelection().nodeId), node.id);
    return {
      actualSelection: true
    };
  });
  await audit.record("dropper", async () => {
    const node = await audit.seed();
    await activate("dropper");
    await page.evaluate(() => window.__vooEditor.setColor("#00ff00"));
    await click({
      x: node.x + 10,
      y: node.y + 45
    });
    assert.equal(await page.evaluate(() => window.__vooEditor.getColor()), "#ff0000");
    return {
      sampledSourcePixel: true
    };
  });
  for (const kind of ["perspective", "distort"]) await audit.record(kind, async () => {
    const node = await audit.seed();
    await activate(kind);
    const before = await audit.pixels(node.id);
    await audit.drag({
      x: node.x,
      y: node.y
    }, {
      x: node.x + 20,
      y: node.y + 12
    });
    const changed = await page.evaluate(id => window.__vooEditor.getNode(id), node.id);
    assert.ok(kind === "perspective" ? changed.perspectiveCorners?.[0]?.x > 0 : changed.warpMesh?.points?.[0]?.x > 0);
    assert.notDeepEqual(await audit.pixels(node.id), before, "Warp handles must alter pixels, not just chrome");
    await tool("undo");
    assert.deepEqual(await audit.pixels(node.id), before);
    return {
      handle: true,
      pixels: true,
      undo: true
    };
  });
  await audit.record("puppet_warp", async () => {
    const node = await audit.seed();
    await activate("puppet_warp");
    await click({
      x: node.x + 12,
      y: node.y + 60
    });
    await click({
      x: node.x + 72,
      y: node.y + 60
    });
    assert.equal(await page.evaluate(id => window.__vooEditor.getNode(id).puppetPins.length, node.id), 2);
    const before = await audit.pixels(node.id);
    await audit.drag({
      x: node.x + 72,
      y: node.y + 60
    }, {
      x: node.x + 75,
      y: node.y + 30
    });
    assert.notDeepEqual(await audit.pixels(node.id), before);
    await tool("undo");
    assert.deepEqual(await audit.pixels(node.id), before);
    return {
      pins: 2,
      movement: true,
      pixels: true,
      undo: true
    };
  });
  await audit.record("hand", async () => {
    await audit.seed();
    await activate("hand");
    const camera = () => page.evaluate(async () => {
      const {
        useDesignStore
      } = await import("/src/store/design_store.js");
      return {
        engine: window.__vooEditor.getViewport(),
        camera: useDesignStore.getState().editorCamera
      };
    });
    const before = await camera();
    await audit.drag({
      x: 230,
      y: 180
    }, {
      x: 270,
      y: 200
    });
    assert.notDeepEqual(await camera(), before);
    return {
      actualCameraPan: true
    };
  });
  await audit.record("crop-cancel", async () => {
    const node = await audit.seed();
    const before = await audit.pixels(node.id);
    await activate("crop");
    await audit.drag({
      x: node.x + 5,
      y: node.y + 5
    }, {
      x: node.x + 65,
      y: node.y + 65
    });
    assert.ok(await page.evaluate(() => window.__vooEditor.getCropRect()));
    await page.keyboard.press("Escape");
    assert.deepEqual(await audit.pixels(node.id), before, "Escape must keep original source pixels");
    return {
      pointerCrop: true,
      cancel: true
    };
  });
  await audit.record("crop-apply-redo", async () => {
    const node = await audit.seed();
    const before = await audit.pixels(node.id);
    await activate("crop");
    await audit.drag({ x: node.x, y: node.y }, { x: node.x + 16, y: node.y + 12 });
    await page.getByTestId("editor-properties-panel").getByRole("button", { name: "Apply", exact: true }).click();
    const after = await audit.pixels(node.id);
    assert.ok(after.width < before.width || after.height < before.height, "Applying the pointer crop must change the visible image dimensions");
    await tool("undo"); assert.deepEqual(await audit.pixels(node.id), before);
    await tool("redo"); assert.deepEqual(await audit.pixels(node.id), after);
    return { appliedInspector: true, visibleDimensions: true, nonDestructiveUndo: true, redo: true };
  });
  audit.finish();
});
