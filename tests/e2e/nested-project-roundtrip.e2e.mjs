import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { nestedObjectsFixture, nestedFrames, shape } from "./nested-objects-fixture.mjs";
let archive, expected;

function projection(nodes) {
  return nodes.map(node => Object.fromEntries(["id", "kind", "parentId", "clipTo", "isFrame", "x", "y", "width", "height", "opacity"]
    .filter(key => node[key] !== undefined).map(key => [key, node[key]])));
}
async function paintedFrame(page) {
  return page.evaluate(async () => {
    const exported = window.__vooEditor.exportSelectionPng(["outer"]);
    const image = new Image(); image.src = exported.dataUrl; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    let hash = 2166136261;
    for (const value of ctx.getImageData(0, 0, canvas.width, canvas.height).data) hash = Math.imul(hash ^ value, 16777619);
    return { width: canvas.width, height: canvas.height, hash: hash >>> 0 };
  });
}

await withEditorBrowser(async ({ page }) => {
  const f = nestedObjectsFixture(page, "nested-project-save");
  await f.record("download-nested-mask-project-with-embedded-image", async () => {
    await f.seed([...nestedFrames(), shape("mask", "inner", 180, 160,
      { kind: "ellipse", width: 120, height: 120, fill: "#ffffff" })], ["inner"]);
    const [image] = await f.pick({ name: "Embedded.png", mimeType: "image/png", buffer: await f.solidPng() });
    await page.evaluate(id => {
      const e = window.__vooEditor;
      e.updateNode(id, { x: 150, y: 160, width: 200, height: 120 });
      e.selectExactly([id]); e.createClippingMask();
    }, image.id);
    assert.equal((await f.node(image.id)).clipTo, "mask");
    assert.equal(await f.pixel({ x: 240, y: 210 }), "#0000ff");
    assert.equal(await f.pixel({ x: 165, y: 190 }), "#ffffff");
    expected = { imageId: image.id, nodes: projection((await f.snapshot()).nodes), pixels: await paintedFrame(page) };
    const [download] = await Promise.all([page.waitForEvent("download"),
      page.getByRole("button", { name: "Export project as a portable .zip snapshot", exact: true }).click()]);
    archive = await readFile(await download.path());
    assert.equal(archive.subarray(0, 2).toString(), "PK");
    return { actualDownload: true, nestedHierarchy: true, maskPixels: true, archiveBytes: archive.length };
  });
  f.finish();
});

// Separate process/context storage proves the original bitmap cache is unnecessary.
await withEditorBrowser(async ({ page }) => {
  const f = nestedObjectsFixture(page, "nested-project-open");
  await f.record("cold-open-retains-nested-ownership-mask-and-pixels", async () => {
    assert.ok(archive && expected);
    await page.evaluate(() => { delete window.showOpenFilePicker; });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /^Import project file/ }).click()]);
    await chooser.setFiles({ name: "NestedFrames.zip", mimeType: "application/zip", buffer: archive });
    await page.waitForFunction(id => {
      const e = window.__vooEditor;
      return e?.getNode(id) && e.getNodeBitmap(e.getNode(id));
    }, expected.imageId);
    await f.settle();
    assert.deepEqual(projection((await f.snapshot()).nodes), expected.nodes);
    assert.deepEqual(await paintedFrame(page), expected.pixels);
    await f.hierarchy();
    const before = await f.snapshot();
    await page.evaluate(id => window.__vooEditor.updateNode(id, { opacity: 0.5 }), expected.imageId);
    assert.notDeepEqual(await paintedFrame(page), expected.pixels);
    await f.history(before);
    await page.evaluate(() => window.__vooEditor.undo());
    assert.deepEqual(await paintedFrame(page), expected.pixels);
    return { freshDatabase: true, realFilePicker: true, exactPixels: true, hierarchy: true, postLoadUndoRedo: true };
  });
  f.finish();
});
