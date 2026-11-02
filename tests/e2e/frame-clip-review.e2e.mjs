import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const results = await page.evaluate(async () => {
    const { createExport } = await import("/src/canvas/editor/editor_export_raster.js");
    const { documentToSvg } = await import("/src/canvas/editor/editor_svg.js");
    const white = document.createElement("canvas"); white.width = white.height = 100;
    white.getContext("2d").fillStyle = "#ffffff"; white.getContext("2d").fillRect(0, 0, 100, 100);
    const bitmapUrl = white.toDataURL();
    const base = { visible: true, strokeWidth: 0, x: 100, y: 100, width: 80, height: 60 };
    const rect = patch => ({ ...base, kind: "rect", fill: "#ff0000", ...patch });
    const frame = { ...base, kind: "group", id: "frame", isFrame: true,
      clipContent: true, x: 60, y: 60, width: 260, height: 200, fill: "transparent" };
    const cases = [
      { name: "a fill-hidden vector mask cannot leak its geometric rectangle", points: [[140, 130], [80, 130]],
        expected: [[255, 255, 255, 255], [255, 255, 255, 255]], nodes: [frame,
          rect({ id: "mask", parentId: "frame", maskBase: true, fill: "#ffffff", fillHidden: true }),
          rect({ id: "paint", parentId: "frame", clipTo: "mask", x: 0, y: 0, width: 400, height: 300 }),
        ] },
      { name: "a mask base under a hidden Frame suppresses an independently parented chain", points: [[140, 130], [80, 130]],
        expected: [[255, 255, 255, 255], [255, 255, 255, 255]], nodes: [{ ...frame, visible: false },
          rect({ id: "mask", parentId: "frame", maskBase: true, fill: "#ffffff" }),
          rect({ id: "paint", clipTo: "mask", x: 0, y: 0, width: 400, height: 300 }),
        ] },
      { name: "outside extra stroke belongs to mask alpha beyond base geometry", points: [[90, 130], [105, 130]],
        expected: [[255, 0, 0, 255], [255, 255, 255, 255]], nodes: [frame,
          rect({ id: "mask", parentId: "frame", maskBase: true, fill: "transparent", stroke: null,
            strokes: [{ stroke: "#ffffff", strokeWidth: 20, strokeAlign: "outside", visible: true }] }),
          rect({ id: "paint", parentId: "frame", clipTo: "mask", x: 0, y: 0, width: 400, height: 300 }),
        ] },
      { name: "rounded image mask has distinct image-corner and chain definitions", points: [[140, 130], [102, 102], [80, 130]],
        expected: [[255, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255]], nodes: [frame,
          { ...base, kind: "image", id: "image-mask", parentId: "frame", maskBase: true,
            fill: "transparent", src: bitmapUrl, cornerRadius: 25 },
          rect({ id: "paint", parentId: "frame", clipTo: "image-mask", x: 0, y: 0, width: 400, height: 300 }),
        ] },
      { name: "distinct source IDs cannot alias after SVG ID sanitization", points: [[120, 130], [240, 130]],
        expected: [[255, 127, 127, 255], [127, 127, 255, 255]], nodes: [frame,
          rect({ id: "a/b", maskBase: true, opacity: 0.5, fill: "#ffffff" }),
          rect({ id: "paint-a", clipTo: "a/b", opacity: 1, x: 0, y: 0, width: 200, height: 300 }),
          rect({ id: "a_b", maskBase: true, x: 220, opacity: 0.5, fill: "#ffffff" }),
          rect({ id: "paint-b", clipTo: "a_b", opacity: 1, x: 200, y: 0, width: 200, height: 300, fill: "#0000ff" }),
        ].map(node => node.maskBase ? { ...node, opacity: 1, fillOpacity: 0.5 } : node) },
    ];
    const read = async (url, points) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 300;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
    };
    const output = [];
    for (const item of cases) {
      const doc = { width: 400, height: 300, isCanvasRoot: true, crop: { x: 0, y: 0, width: 400, height: 300 },
        backgroundColor: "transparent", nodes: [rect({ id: "backdrop", x: 0, y: 0, width: 400, height: 300, fill: "#ffffff" }), ...item.nodes] };
      const exported = createExport({ getDoc: () => doc, bitmapSourceOf: () => white });
      const svg = documentToSvg(doc, { bitmapOf: () => bitmapUrl });
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const xml = new DOMParser().parseFromString(svg, "image/svg+xml");
      const ids = [...xml.querySelectorAll("[id]")].map(el => el.id);
      try { output.push({ name: item.name, expected: item.expected, png: await read(exported.exportPng(), item.points),
        svg: await read(url, item.points), duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index) }); }
      finally { URL.revokeObjectURL(url); }
    }
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), isCanvasRoot: true, nodes: [
      { ...frame, id: "folder", isFrame: false, x: 0, y: 0, width: 400, height: 300 },
      rect({ id: "child", parentId: "folder" }),
    ] });
    const png = await e.exportSelectionPng(["folder"]);
    const svgMarkup = e.getNodeSvg("folder");
    const svgDocument = new DOMParser().parseFromString(svgMarkup, "image/svg+xml").documentElement;
    output.push({ name: "ordinary Group metadata does not expand selected artwork bounds",
      png: [png.width, png.height], svg: [Number(svgDocument.getAttribute("width")), Number(svgDocument.getAttribute("height"))],
      expected: [80, 60], duplicateIds: [] });
    return output;
  });
  for (const result of results) {
    assert.deepEqual(result.png, result.expected, `${result.name}: PNG`);
    assert.deepEqual(result.svg, result.expected, `${result.name}: SVG`);
    assert.deepEqual(result.duplicateIds, [], `${result.name}: SVG definitions`);
  }
  console.log(JSON.stringify({ passed: results.map(result => result.name) }, null, 2));
});
