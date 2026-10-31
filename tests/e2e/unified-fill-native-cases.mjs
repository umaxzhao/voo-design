import assert from "node:assert/strict";
export async function runNativeFillCases({
  page,
  tool,
  open,
  close,
  dialog,
  node,
  select,
  imageData,
  mark
}) {
  const imageId = await page.evaluate(async url => {
    const e = window.__vooEditor;
    const image = await e.insertImage(url, {
      x: 280,
      y: 150
    });
    e.updateNode(image.id, {
      x: 280,
      y: 150,
      width: 120,
      height: 80
    });
    e.selectExactly([image.id]);
    return image.id;
  }, imageData);
  await open();
  await dialog().getByTestId("fill-image-controls").locator("img").waitFor();
  const originalAsset = (await node(imageId)).imageId;
  await dialog().getByRole("tab", {
    name: "Solid",
    exact: true
  }).click();
  assert.match((await node(imageId)).fill, /^#/);
  await tool("undo");
  await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="Fill"] [role="tab"][aria-label="Image"]')?.getAttribute("aria-selected") === "true");
  await tool("redo");
  await page.waitForFunction(() => document.querySelector('[role="dialog"][aria-label="Fill"] [role="tab"][aria-label="Solid"]')?.getAttribute("aria-selected") === "true");
  await dialog().getByRole("tab", {
    name: "Image",
    exact: true
  }).click();
  assert.equal((await node(imageId)).imageId, originalAsset, "mode switching must retain the full-resolution asset, not save a thumbnail/blob preview");
  assert.equal((await node(imageId)).fill, "transparent");
  await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
    x: 380,
    y: 190
  }) === "#0000ff");
  await dialog().getByRole("button", {
    name: "Image fit",
    exact: true
  }).click();
  await page.getByRole("listbox").getByRole("option", {
    name: "Fit",
    exact: true
  }).click();
  await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
    x: 300,
    y: 152
  }) === "#ffffff");
  await dialog().locator('input[type="file"]').setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageData.split(",")[1], "base64")
  });
  await page.waitForFunction(({
    id,
    previous
  }) => window.__vooEditor.getNode(id).imageId !== previous, {
    id: imageId,
    previous: originalAsset
  });
  const replacementAsset = (await node(imageId)).imageId;
  assert.ok(replacementAsset);
  assert.equal((await node(imageId)).fills[0].imageId, null);
  assert.equal((await node(imageId)).src, null);
  await tool("undo");
  assert.equal((await node(imageId)).imageId, originalAsset);
  await tool("redo");
  assert.equal((await node(imageId)).imageId, replacementAsset);
  await close();
  await page.evaluate(async id => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffff00";
    ctx.fillRect(0, 0, 64, 32);
    await window.__vooEditor.replaceNodeBitmap(id, canvas.toDataURL());
  }, imageId);
  await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
    x: 340,
    y: 190
  }) === "#ffff00");
  await tool("undo");
  await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
    x: 380,
    y: 190
  }) === "#0000ff");
  for (const id of ["paint-frame", "paint-text"]) {
    await select(id);
    await open();
    assert.equal(await dialog().getByRole("tab").count(), 4);
    await close();
  }
  mark("bitmap layers retain full-resolution assets across mode changes, replacement and subsequent retouch use one canonical asset/undo path; Frame and text expose the same editor");
}
