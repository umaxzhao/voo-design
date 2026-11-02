import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "inspector-core");
  const panel = page.getByTestId("editor-properties-panel");
  for (const kind of ["image", "rect", "frame"]) {
    const fields = [["X", "x", 180], ["Y", "y", 90], ["W", "width", 110], ["H", "height", 100], ["Rotation", "rotation", 15], ["Shear", "shear", 8]];
    if (kind !== "image") fields.push(["Corner radius", "cornerRadius", 10]);
    for (const [label, key, value] of fields) await audit.record(`${kind}-${key}`, async () => {
      const image = await audit.seed();
      const id = kind === "image" ? image.id : "inspector-target";
      await page.evaluate(({
        kind,
        id
      }) => {
        const engine = window.__vooEditor;
        if (kind !== "image") engine.setDoc({
          ...engine.getDocument(),
          nodes: [{
            id,
            kind: kind === "frame" ? "group" : "rect",
            isFrame: kind === "frame",
            x: 160,
            y: 100,
            width: 96,
            height: 96,
            fill: "#ff0000",
            visible: true,
            opacity: 1
          }]
        });
        engine.updateNode(id, {
          lockRatio: false
        });
        engine.selectExactly([id]);
      }, {
        kind,
        id
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const before = await page.evaluate(() => window.__vooEditor.serialise());
      const field = panel.getByRole("spinbutton", {
        name: label,
        exact: true
      });
      await field.fill(String(value));
      await field.press("Enter");
      await page.waitForFunction(({
        id,
        key,
        value
      }) => window.__vooEditor.getNode(id)?.[key] === value, {
        id,
        key,
        value
      });
      await tool("undo");
      assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), before);
      return {
        actualInspector: true,
        field: label,
        value,
        oneUndo: true
      };
    });
  }
  for (const [label, axis] of [["Flip horizontal", "horizontal"], ["Flip vertical", "vertical"], ["Rotate 90°", "rotation"]]) {
    await audit.record(`image-${axis}-action`, async () => {
      const image = await audit.seed();
      const before = await audit.pixels(image.id);
      const previous = await page.evaluate(id => window.__vooEditor.getNode(id).imageId, image.id);
      await panel.getByRole("button", {
        name: label,
        exact: true
      }).click();
      await page.waitForFunction(({
        id,
        previous
      }) => Boolean(window.__vooEditor.getNode(id)?.rotation) || window.__vooEditor.getNode(id)?.imageId !== previous, {
        id: image.id,
        previous
      }, {
        timeout: 5000
      });
      assert.notDeepEqual(await audit.pixels(image.id), before);
      await tool("undo");
      assert.deepEqual(await audit.pixels(image.id), before);
      return {
        actualInspector: true,
        pixels: true,
        oneUndo: true
      };
    });
  }
  audit.finish();
});
