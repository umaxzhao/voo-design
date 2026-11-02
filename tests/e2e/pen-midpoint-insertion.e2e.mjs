import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool, errors }) => {
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    e.setTool("select");
    e.setDoc({
      ...e.getDocument(),
      width: 600,
      height: 400,
      isCanvasRoot: false,
      nodes: [
        {
          id: "midpoint-path",
          kind: "path",
          pen: true,
          x: 100,
          y: 80,
          width: 200,
          height: 160,
          baseWidth: 200,
          baseHeight: 160,
          stroke: "#ffffff",
          strokeWidth: 2,
          fill: null,
          points: [
            { x: 0, y: 0, out: [0, 160] },
            { x: 200, y: 0, in: [0, 160] },
          ],
        },
      ],
    });
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({
      editorCamera: { zoom: 1, panX: 300, panY: 100 },
    });
    e.selectExactly(["midpoint-path"]);
    e.beginEdit("midpoint-path");
  });
  const snapshot = () =>
    page.evaluate(() => window.__vooEditor.getDocument().nodes);
  const client = (point) =>
    page.evaluate(async (point) => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const rect = document
        .querySelector("[data-editor-artboard]")
        .getBoundingClientRect();
      const doc = window.__vooEditor.getDocument();
      return {
        x: rect.left + (point.x * rect.width) / doc.width,
        y: rect.top + (point.y * rect.height) / doc.height,
      };
    }, point);
  const before = await snapshot();
  const curvePoint = await client({ x: 200, y: 200 });
  await page.keyboard.down("Control");
  await page.mouse.move(curvePoint.x, curvePoint.y);
  await page.mouse.down();
  await page.mouse.move(curvePoint.x, curvePoint.y + 24, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  const bent = await snapshot();
  assert.equal(bent[0].points.length, 2, "Bending must not insert an anchor");
  assert.notDeepEqual(
    bent[0].points,
    before[0].points,
    "Modifier-dragging the curve edge reshapes its handles",
  );
  await tool("undo");
  assert.deepEqual(await snapshot(), before, "One undo restores the curve");
  await tool("redo");
  assert.deepEqual(await snapshot(), bent, "Redo restores the bent curve");
  await tool("undo");

  const quarter = await client({ x: 131.25, y: 170 });
  await page.mouse.move(quarter.x, quarter.y);
  assert.equal(
    await page.evaluate(() => window.__vooEditor.insertionPreview()),
    null,
  );
  await page.mouse.click(quarter.x, quarter.y);
  assert.deepEqual(
    await snapshot(),
    before,
    "Off-midpoint click must not change path",
  );
  await page.evaluate(() => window.__vooEditor.beginEdit("midpoint-path"));
  const middle = await client({ x: 200, y: 200 });
  await page.mouse.move(middle.x + 3, middle.y);
  assert.deepEqual(
    await page.evaluate(() => window.__vooEditor.insertionPreview()),
    { x: 200, y: 200 },
  );
  await page.mouse.click(middle.x + 3, middle.y);
  const after = await snapshot();
  assert.equal(after[0].points.length, 3);
  assert.equal(after[0].points[1].x, 100);
  assert.equal(after[0].points[1].y, 120);
  assert.deepEqual(
    await page.evaluate(() => window.__vooEditor.penEdit.selected),
    [1],
  );
  await tool("undo");
  assert.deepEqual(
    await snapshot(),
    before,
    "One undo restores the original curve",
  );
  await tool("redo");
  assert.deepEqual(
    await snapshot(),
    after,
    "Redo restores the inserted midpoint",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Verified fixed midpoint preview, pointer insert, selection and one-step undo/redo.",
  );
});
