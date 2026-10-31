import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(
  async ({ page }) => {
    const checks = [];
    const settle = () =>
      page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    await page
      .getByTestId("editor-top-bar")
      .getByRole("button", { name: "New", exact: true })
      .click();
    await page.waitForFunction(
      () => window.__vooEditor?.getDocument()?.isCanvasRoot,
    );
    await page.evaluate(async () => {
      const e = window.__vooEditor;
      const { useDesignStore } = await import("/src/store/design_store.js");
      window.__rootToolbarStore = useDesignStore;
      useDesignStore.setState({
        editorCamera: { zoom: 1, panX: 260, panY: 100 },
      });
      // Independent root artwork must not be adopted by New's default Frame.
      e.setDoc({ ...e.getDocument(), nodes: [] });
      e.setTool("select");
      e.selectExactly([]);
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      context.fillStyle = "#c09070";
      context.fillRect(0, 0, 64, 64);
      const image = await e.insertImage(canvas.toDataURL(), { x: 400, y: 300 });
      e.updateNode(image.id, { x: 350, y: 250, width: 100, height: 100 });
      window.__rootToolbarImage = image.id;
      e.selectExactly([]);
    });
    await settle();
    const bars = page.locator(
      '[data-testid="editor-contextual-taskbar"]:visible',
    );
    assert.equal(
      await bars.count(),
      0,
      "An empty selection on the real root canvas must have no persistent contextual bar",
    );
    const point = (x, y) =>
      page.evaluate(
        ({ x, y }) => {
          const e = window.__vooEditor;
          const board = document
            .querySelector("[data-editor-artboard]")
            .getBoundingClientRect();
          const doc = e.getDocument();
          return {
            x: board.left + (x * board.width) / doc.width,
            y: board.top + (y * board.height) / doc.height,
          };
        },
        { x, y },
      );
    const center = await point(400, 300);
    await page.mouse.click(center.x, center.y);
    await bars.waitFor();
    assert.equal(
      await page.evaluate(() => window.__vooEditor.getSelected()?.id),
      await page.evaluate(() => window.__rootToolbarImage),
    );
    assert.equal(await bars.count(), 1);
    await page.getByTestId("editor-taskbar-more").click();
    await page.getByTestId("more-retouch").waitFor();
    await page.getByTestId("more-retouch").click();
    await page.getByTestId("more-retouch-apply").waitFor();
    await page.getByTestId("editor-taskbar-more").click();
    const zoomBar = page.getByTestId("editor-bottom-toolbar");
    const zoomBounds = await zoomBar.boundingBox();
    checks.push(
      "default New retains its root document, real image click exposes one toolbar and the actual portrait-retouch controls",
    );

    const before = await bars.boundingBox();
    await page.screenshot({ path: "/private/tmp/voo-bottom-toolbar-parking.png" });
    assert.ok(
      before.y + before.height <= zoomBounds.y - 6,
      `The docked contextual toolbar must stay above the canvas zoom controls: ${JSON.stringify({ before, zoomBounds })}`,
    );
    assert.ok(
      Math.abs(before.x + before.width / 2 - zoomBounds.x - zoomBounds.width / 2) < 1,
      "The contextual and zoom toolbars must share a center line",
    );
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 15, center.y + 10, { steps: 3 });
    await settle();
    const duringDrag = await bars.boundingBox();
    assert.ok(Math.abs(duringDrag.x - before.x) < 1);
    assert.ok(Math.abs(duringDrag.y - before.y) < 1);
    await page.mouse.move(center.x + 30, center.y + 20, { steps: 3 });
    await page.mouse.up();
    await settle();
    assert.deepEqual(
      await page.evaluate(() => {
        const n = window.__vooEditor.getNode(window.__rootToolbarImage);
        return [n.x, n.y];
      }),
      [380, 270],
    );
    const moved = await bars.boundingBox();
    assert.ok(
      Math.abs(moved.x - before.x) < 1,
      "Object movement must not move the docked contextual bar",
    );
    assert.ok(
      Math.abs(moved.y - before.y) < 1,
      "Object movement must not move the docked contextual bar",
    );
    await page.evaluate(() => {
      const store = window.__rootToolbarStore;
      const camera = store.getState().editorCamera;
      store.setState({
        editorCamera: {
          ...camera,
          panX: camera.panX + 20,
          panY: camera.panY + 15,
        },
      });
    });
    await settle();
    const panned = await bars.boundingBox();
    assert.ok(Math.abs(panned.x - moved.x) < 1);
    assert.ok(Math.abs(panned.y - moved.y) < 1);
    await page.evaluate(() => {
      const store = window.__rootToolbarStore;
      store.setState({
        editorCamera: { ...store.getState().editorCamera, zoom: 0.8 },
      });
    });
    await settle();
    const zoomed = await bars.boundingBox();
    assert.ok(Math.abs(zoomed.x - moved.x) < 1);
    assert.ok(Math.abs(zoomed.y - moved.y) < 1);
    checks.push(
      "the docked toolbar stays above zoom controls while object geometry, camera pan and zoom change",
    );

    await page.evaluate(async () => {
      const e = window.__vooEditor;
      const { createRectNode } = await import(
        "/src/canvas/editor/scene_model_node_builders.js"
      );
      const other = {
        ...createRectNode({
          x: 500,
          y: 270,
          width: 50,
          height: 50,
          fill: "#ffffff",
        }),
        id: "root-toolbar-other",
      };
      e.setDoc({
        ...e.getDocument(),
        nodes: [...e.getDocument().nodes, other],
      });
      e.selectExactly([window.__rootToolbarImage, other.id]);
    });
    await settle();
    assert.equal(await bars.count(), 1);
    await page.getByTestId("editor-taskbar-alignment-menu").waitFor();
    checks.push(
      "multi-selection reuses one contextual bar with the existing alignment menu",
    );
    await page.evaluate(() => {
      const e = window.__vooEditor;
      e.selectExactly([window.__rootToolbarImage]);
      e.selectAllPixels();
    });
    await settle();
    await page.getByTestId("editor-taskbar-deselect").waitFor();
    assert.equal(await bars.count(), 1);
    await page.getByTestId("editor-taskbar-deselect").click();
    await page.evaluate(() => {
      window.__vooEditor.selectExactly([]);
      window.__vooEditor.setTool("pen");
    });
    await settle();
    await page.getByTestId("editor-taskbar-finishPath").waitFor();
    assert.equal(await bars.count(), 1);
    await page.evaluate(() => {
      window.__vooEditor.setTool("select");
      window.__vooEditor.selectExactly([]);
    });
    await settle();
    assert.equal(await bars.count(), 0);
    checks.push(
      "pixel and pen edit contexts remain reachable and clearing the selection returns the root canvas to a clean surface",
    );
    await page.evaluate(() => {
      const e = window.__vooEditor;
      const image = e.getNode(window.__rootToolbarImage);
      const frame = {
        id: "toolbar-frame",
        kind: "group",
        isFrame: true,
        x: 200,
        y: 100,
        width: 400,
        height: 300,
        visible: true,
        opacity: 1,
      };
      e.setDoc({
        ...e.getDocument(),
        nodes: [frame, { ...image, x: 300, y: 200, parentId: frame.id }],
      });
      e.selectExactly([image.id]);
    });
    await settle();
    const anchored = await bars.boundingBox();
    assert.ok(anchored.y + anchored.height <= zoomBounds.y - 6);
    await page.evaluate(() => {
      const e = window.__vooEditor,
        image = e.getNode(window.__rootToolbarImage);
      e.updateNode(image.id, { x: image.x + 30, y: image.y + 20 });
    });
    await settle();
    const childMoved = await bars.boundingBox();
    assert.ok(
      Math.abs(childMoved.x - anchored.x) < 1 &&
        Math.abs(childMoved.y - anchored.y) < 1,
    );
    await page.evaluate(() =>
      window.__vooEditor.moveNodesBy(["toolbar-frame"], 20, 15),
    );
    await settle();
    const frameMoved = await bars.boundingBox();
    assert.ok(Math.abs(frameMoved.x - anchored.x) < 1);
    assert.ok(Math.abs(frameMoved.y - anchored.y) < 1);
    checks.push(
      "nested artwork in a root canvas keeps its bar above zoom controls during child and Frame movement",
    );
    // A low viewport edge keeps the docked toolbar in the zoom-control zone.
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.evaluate(() => {
      const store = window.__rootToolbarStore;
      store.setState({
        editorCamera: { ...store.getState().editorCamera, panY: 300 },
      });
    });
    await settle();
    const lowBar = await bars.boundingBox(),
      lowZoom = await zoomBar.boundingBox(),
      lowFrameBottom = await point(420, 415);
    assert.ok(
      lowFrameBottom.y > 600,
      "Exercise a frame extending below the viewport",
    );
    assert.ok(
      lowBar.y + lowBar.height <= lowZoom.y - 6,
      "The toolbar must remain above zoom controls even when the frame extends below the viewport",
    );
    checks.push("a short viewport retains the docked toolbar above zoom controls");
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await settle();
      const narrowBar = await bars.boundingBox();
      const narrowZoom = await zoomBar.boundingBox();
      assert.ok(
        narrowBar.y + narrowBar.height <= narrowZoom.y + 1,
        `The root contextual bar must stay above zoom controls at ${width}px: ${JSON.stringify({ narrowBar, narrowZoom })}`,
      );
      assert.ok(
        Math.abs(narrowBar.x + narrowBar.width / 2 - width / 2) < 1,
        `The root contextual bar must stay centered at ${width}px`,
      );
      checks.push(`${width}px root canvas keeps contextual actions above zoom controls`);
    }
    console.log(JSON.stringify({ passed: checks }, null, 2));
  },
  { openDocument: false },
);
