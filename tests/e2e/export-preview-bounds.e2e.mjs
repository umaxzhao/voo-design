import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// UF20 matrix: the export dialog's selection preview must equal the PNG that the real
// export writes, for ordinary groups (tight, no padding), frames, multi-selection, rotated
// and nested nodes, at each UI scale preset. Output semantics stay tight.
const EVIDENCE = process.env.UF20_EXPORT_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-uf20-export-preview");
await mkdir(EVIDENCE, { recursive: true });

const rect = (id, x, y, width, height, parentId = null, extra = {}) => ({
  id, kind: "rect", x, y, width, height, parentId, fill: "#3366ff", ...extra,
});

const CASES = [
  {
    name: "ordinary-group-padding",
    nodes: [
      { id: "g", kind: "group", x: 0, y: 0, width: 300, height: 300, parentId: null },
      rect("a", 10, 10, 50, 50, "g"),
      rect("b", 100, 60, 40, 40, "g"),
    ],
    select: ["g"],
    expected: { width: 130, height: 90 },
  },
  {
    name: "frame-clip",
    nodes: [
      { id: "f", kind: "group", isFrame: true, x: 0, y: 0, width: 300, height: 200, parentId: null, fill: "#ffffff" },
      rect("a", 10, 10, 50, 50, "f"),
    ],
    select: ["f"],
    expected: { width: 300, height: 200 },
  },
  {
    name: "multi-select",
    nodes: [rect("p", 0, 0, 20, 20), rect("q", 50, 40, 30, 10)],
    select: ["p", "q"],
    expected: { width: 80, height: 50 },
  },
  {
    name: "rotated-nested",
    nodes: [
      { id: "g", kind: "group", x: 0, y: 0, width: 260, height: 260, parentId: null },
      { id: "n", kind: "group", x: 20, y: 20, width: 200, height: 200, parentId: "g" },
      rect("r", 40, 40, 100, 40, "n", { rotation: 30 }),
    ],
    select: ["g"],
    // AABB of a 100x40 rectangle rotated 30 degrees: 100*cos30+40*sin30 ~ 106.6 by 100*sin30+40*cos30 ~ 84.6.
    expected: { width: 106.6, height: 84.6 },
    tolerance: 1,
  },
];

const SCALES = [1, 2, 3];

/** Reads width/height from the PNG IHDR chunk (big-endian at byte 16 and 20). */
function pngSize(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, "download must be a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function openExportDialog(page) {
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await palette.getByRole("combobox").fill("Export");
  await palette.getByRole("option").filter({ hasText: /^Export$/ }).first().click();
  return page.getByTestId("design-export-dialog");
}

async function previewSize(dialog) {
  const text = await dialog.getByTestId("design-export-dimensions").innerText();
  const match = text.match(/(\d+)\D+?(\d+)/);
  assert.ok(match, `preview text must carry dimensions, got: ${text}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

const results = [];

await withEditorBrowser(async ({ page, errors }) => {
  for (const testCase of CASES) {
    await page.evaluate((nodes) => {
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, ...nodes] });
    }, testCase.nodes);
    await page.evaluate((ids) => window.__vooEditor.selectExactly(ids), testCase.select);

    for (const scale of SCALES) {
      await page.evaluate((ids) => window.__vooEditor.selectExactly(ids), testCase.select);
      const dialog = await openExportDialog(page);
      await dialog.getByRole("radio", { name: /Selected layers|所选图层/i }).click();
      await dialog.getByRole("button", { name: new RegExp(`^${scale}\\s*[x×]?$`, "i") }).first().click();
      const preview = await previewSize(dialog);

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        dialog.getByRole("button", { name: /^(Export|导出)/ }).last().click(),
      ]);
      const path = join(EVIDENCE, `${testCase.name}-${scale}x.png`);
      await download.saveAs(path);
      const actual = pngSize(await readFile(path));

      const tolerance = testCase.tolerance ?? 0;
      const expectedPixels = {
        width: Math.round(testCase.expected.width * scale),
        height: Math.round(testCase.expected.height * scale),
      };
      assert.ok(
        Math.abs(actual.width - expectedPixels.width) <= tolerance * scale + 1 &&
          Math.abs(actual.height - expectedPixels.height) <= tolerance * scale + 1,
        `${testCase.name} ${scale}x: PNG ${actual.width}x${actual.height} vs expected ${expectedPixels.width}x${expectedPixels.height}`,
      );
      assert.deepEqual(preview, actual, `${testCase.name} ${scale}x: preview must equal the exported PNG`);
      results.push({ case: testCase.name, scale, preview, png: actual });
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");
    await page.evaluate((ids) => {
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), nodes: e.getDocument().nodes.filter((n) => !ids.includes(n.id)) });
    }, testCase.nodes.map((n) => n.id));
  }
  assert.deepEqual(errors, [], `unexpected page errors: ${errors.join("\n")}`);
  console.log(JSON.stringify(results));
}, { openDocument: true, mcpLink: true });
