import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const WHITE = [255, 255, 255, 255];
const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const CLEAR = [0, 0, 0, 0];
const frame = (patch = {}) => ({
  id: "frame", kind: "group", isFrame: true, frame: true, visible: true,
  x: 80, y: 80, width: 160, height: 120, fill: "#0000ff", strokeWidth: 0,
  clipContent: true, ...patch,
});
const rect = (patch = {}) => ({
  id: "child", kind: "rect", visible: true, x: 40, y: 40,
  width: 240, height: 200, fill: "#ff0000", strokeWidth: 0,
  parentId: "frame", ...patch,
});

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  await page.evaluate(() => {
    window.__frameProbe = async (nodes, points, selection = null, crop = { x: 0, y: 0, width: 400, height: 300 }) => {
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), isCanvasRoot: true, width: 400, height: 300,
        crop, backgroundColor: "transparent",
        nodes: [{ id: "background", kind: "rect", visible: true, x: crop.x, y: crop.y,
          width: 400, height: 300, fill: "#ffffff", strokeWidth: 0 }, ...nodes] });
      return window.__frameOutputs(points, selection);
    };
    window.__frameOutputs = async (points, selection = null) => {
      const e = window.__vooEditor;
      const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
      let raster, svg, bounds = e.getDocument().crop ?? { x: 0, y: 0 };
      if (selection) {
        const result = await e.exportSelectionPng([selection]);
        raster = result.dataUrl; bounds = result.bounds;
        svg = e.getNodeSvg(selection);
      } else {
        raster = await e.exportFullResPng();
        svg = documentToSvg(e.getDocument());
      }
      const read = async (url) => {
        const image = new Image(); image.src = url; await image.decode();
        const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
        const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
        return { width: c.width, height: c.height,
          pixels: points.map(([x, y]) => [...ctx.getImageData(x - bounds.x, y - bounds.y, 1, 1).data]) };
      };
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      try { return { png: await read(raster), svg: await read(url), bounds }; }
      finally { URL.revokeObjectURL(url); }
    };
  });
  const probe = (nodes, points, selection, crop) => page.evaluate(
    ({ nodes, points, selection, crop }) => window.__frameProbe(nodes, points, selection, crop),
    { nodes, points, selection, crop },
  );
  const check = async (label, nodes, points, expected, selection) => {
    const result = await probe(nodes, points, selection);
    assert.deepEqual(result.png.pixels, expected, `${label}: complete PNG compositor`);
    assert.deepEqual(result.svg.pixels, expected, `${label}: decoded SVG pixels`);
    assert.equal(result.png.width, result.svg.width, `${label}: export width`);
    assert.equal(result.png.height, result.svg.height, `${label}: export height`);
    checks.push(label);
  };

  await check("Frame clips overflowing children in complete PNG and SVG exports", [frame(), rect()],
    [[50, 120], [120, 120], [270, 120]], [WHITE, RED, WHITE]);
  await check("clipContent=false retains overflow without changing child world coordinates",
    [frame({ clipContent: false }), rect()], [[50, 120], [120, 120], [270, 120]], [RED, RED, RED]);
  await check("missing clipContent retains the default clipping contract",
    [frame({ clipContent: undefined }), rect()], [[50, 120], [120, 120]], [WHITE, RED]);
  await check("independent corner radii clip children with the same silhouette",
    [frame({ cornerRadius: { tl: 40, tr: 0, br: 40, bl: 0 } }), rect()],
    [[84, 84], [234, 84], [234, 194], [84, 194], [120, 120]], [WHITE, RED, WHITE, RED, RED]);

  const covering = rect({ x: 0, y: 0, width: 400, height: 300 });
  await check("a ninety-degree Frame rotation clips in transformed world space",
    [frame({ x: 100, y: 100, width: 140, height: 100, rotation: 90 }), covering],
    [[170, 150], [110, 150], [170, 85]], [RED, WHITE, RED]);
  await check("horizontal Frame flip mirrors asymmetric corner clipping",
    [frame({ x: 100, y: 100, width: 140, height: 100,
      cornerRadius: { tl: 40, tr: 0, br: 0, bl: 0 }, flipH: true }), covering],
    [[235, 105], [105, 105], [170, 150]], [WHITE, RED, RED]);
  await check("sheared Frame clipping follows the slanted outline",
    [frame({ x: 100, y: 100, width: 140, height: 100, shear: Math.atan(0.5) * 180 / Math.PI }), covering],
    [[90, 110], [245, 110], [95, 190], [245, 190]], [RED, WHITE, WHITE, RED]);

  const outer = frame({ id: "outer", x: 60, y: 60, width: 240, height: 180, cornerRadius: 30 });
  const folder = { ...frame({ id: "folder", parentId: "outer" }), isFrame: false, frame: false };
  const inner = frame({ id: "inner", parentId: "folder", x: 120, y: 100,
    width: 240, height: 150, fill: "#00ff00" });
  await check("nested Frames intersect clips through an ordinary Group",
    [outer, folder, inner, rect({ ...covering, parentId: "inner" })],
    [[180, 180], [330, 180], [90, 180]], [RED, WHITE, BLUE]);
  await check("hidden parent suppresses descendants independently of their visibility",
    [frame({ visible: false }), rect()], [[50, 120], [120, 120]], [WHITE, WHITE]);
  await check("document paint order remains authoritative when children precede their Frame",
    [rect(), frame()], [[50, 120], [120, 120]], [WHITE, BLUE]);
  await check("a Frame clip intersects the painted alpha clipping chain",
    [frame(), rect({ id: "mask", x: 30, y: 90, width: 120, height: 80,
      fill: "#ffffff", maskBase: true }), rect({ clipTo: "mask", x: 0, y: 0,
      width: 400, height: 300 })],
    [[50, 120], [100, 120], [180, 120]], [WHITE, RED, BLUE]);
  await check("exporting a Frame keeps its own fill and child clip",
    [frame(), rect()], [[50, 120], [120, 120], [270, 120]], [CLEAR, RED, CLEAR], "frame");
  await check("an empty selected Frame exports its painted surface",
    [frame()], [[100, 100], [200, 150]], [BLUE, BLUE], "frame");
  await check("selected Frame fill remains visible beyond a partially covering child",
    [frame(), rect({ x: 40, y: 100, width: 100, height: 40 })],
    [[50, 120], [120, 120], [200, 120]], [CLEAR, RED, BLUE], "frame");
  await check("an independently exported child remains standalone without unselected ancestors",
    [frame(), rect()], [[50, 120], [120, 120], [270, 120]], [RED, RED, RED], "child");

  const distant = await probe([
    frame({ x: 80080, y: 90080 }),
    rect({ id: "mask", x: 80030, y: 90090, width: 120, height: 80,
      opacity: 0.5, fill: "#ffffff", maskBase: true }),
    rect({ x: 80000, y: 90000, width: 400, height: 300, clipTo: "mask" }),
  ], [[80050, 90120], [80100, 90120], [80180, 90120]], null,
  { x: 80000, y: 90000, width: 400, height: 300 });
  for (const kind of ["png", "svg"]) {
    assert.deepEqual(distant[kind].pixels[0], WHITE, `${kind}: distant ancestor clip`);
    assert.deepEqual(distant[kind].pixels[2], BLUE, `${kind}: distant mask exterior`);
    const overlap = distant[kind].pixels[1];
    assert.ok(Math.abs(overlap[0] - 128) <= 1 && overlap[1] === 0 && Math.abs(overlap[2] - 127) <= 1 && overlap[3] === 255,
      `${kind}: distant half-alpha mask: ${overlap}`);
  }
  checks.push("half-alpha clipping mask at x=80000/y=90000 intersects Frame without a fixed world mask box");

  const opacity = await probe([frame({ opacity: 0.5 }), rect()], [[120, 120]]);
  console.log(JSON.stringify({ diagnostic: "parent-opacity-not-certified", png: opacity.png.pixels, svg: opacity.svg.pixels }));

  await probe([frame(), rect()], [[120, 120]]);
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const id = useDesignStore.getState().editingNodeId;
    const stage = document.querySelector('[data-testid="editor-pages"]');
    const layout = useDesignStore.getState().editorArtboardLayouts[id] ?? { x: 0, y: 0 };
    useDesignStore.setState({ pendingArtboardFitId: null, editorCamera: { zoom: 1,
      panX: stage.clientWidth / 2 - layout.x - 200, panY: stage.clientHeight / 2 - layout.y - 150 } });
    window.__vooEditor.selectExactly(["frame"]);
  });
  const visiblePixels = async () => {
    await page.evaluate(() => { window.__frameVisiblePreviousBounds = null; });
    await page.waitForFunction(() => {
      const id = window.__vooStore.editingNodeId;
      const surface = document.querySelector(`[data-editor-artboard][data-node-id="${id}"]`);
      const stage = document.querySelector('[data-testid="editor-pages"]').getBoundingClientRect();
      const next = surface.getBoundingClientRect();
      const first = window.__frameVisiblePreviousBounds;
      window.__frameVisiblePreviousBounds = { left: next.left, top: next.top };
      return first && Math.abs(next.width - 400) < 0.1 && Math.abs(next.height - 300) < 0.1 &&
        Math.abs(next.left + 200 - (stage.left + stage.width / 2)) < 1 &&
        Math.abs(next.top + 150 - (stage.top + stage.height / 2)) < 1 &&
        Math.abs(next.left - first.left) < 0.1 && Math.abs(next.top - first.top) < 0.1;
    });
    const positions = await page.evaluate(() => {
      const id = window.__vooStore.editingNodeId;
      const bounds = document.querySelector(`[data-editor-artboard][data-node-id="${id}"]`).getBoundingClientRect();
      return [[50, 120], [120, 120], [200, 120]].map(([x, y]) => ({
        x: Math.floor(bounds.left + x * bounds.width / 400),
        y: Math.floor(bounds.top + y * bounds.height / 300), width: 1, height: 1,
      }));
    });
    const values = [];
    for (const position of positions) {
      const bytes = await page.screenshot({ clip: position });
      values.push(await page.evaluate(async base64 => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      }, bytes.toString("base64")));
    }
    return values;
  };
  const clipCheckbox = page.getByTestId("editor-properties-panel").getByRole("checkbox", { name: "Clip content", exact: true });
  await clipCheckbox.waitFor();
  assert.equal(await clipCheckbox.isChecked(), true);
  assert.deepEqual(await visiblePixels(), [WHITE, RED, RED]);
  await clipCheckbox.click();
  await page.waitForFunction(() => window.__vooEditor.getNode("frame").clipContent === false);
  assert.deepEqual(await visiblePixels(), [RED, RED, RED]);
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("frame").clipContent), true);
  assert.deepEqual(await visiblePixels(), [WHITE, RED, RED]);
  await tool("redo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("frame").clipContent), false);
  assert.deepEqual(await visiblePixels(), [RED, RED, RED]);
  checks.push("actual inspector Clip content changes visible canvas pixels and one undo/redo restores clipping");
  await tool("undo");
  await page.evaluate(() => window.__vooEditor.updateNode("frame", { width: 80 }));
  assert.deepEqual(await visiblePixels(), [WHITE, RED, WHITE]);
  await tool("undo");
  assert.deepEqual(await visiblePixels(), [WHITE, RED, RED]);
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.updateNodes(["frame", "child"].map(id => ({ id, patch: { x: e.getNode(id).x + 80 } })));
  });
  assert.deepEqual(await visiblePixels(), [WHITE, WHITE, RED]);
  const moved = await page.evaluate(() => window.__frameOutputs([[50, 120], [120, 120], [200, 120]]));
  assert.deepEqual(moved.png.pixels, [WHITE, WHITE, RED]);
  assert.deepEqual(moved.svg.pixels, [WHITE, WHITE, RED]);
  await tool("undo");
  assert.deepEqual(await visiblePixels(), [WHITE, RED, RED]);
  checks.push("resizing and translating a Frame invalidates visible and exported clips across undo frames");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
