import assert from "node:assert/strict";

export async function assertEmptyCanvas(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await page.evaluate(() => {
    const editor = window.__vooEditor;
    return { isCanvasRoot: editor.getDocument().isCanvasRoot,
      nodes: editor.getDocument().nodes.length, selected: editor.getSelectedIds() };
  });
  assert.deepEqual(state, { isCanvasRoot: true, nodes: 0, selected: [] });
  assert.equal(await page.getByTestId("editor-canvas-frame-label").count(), 0);
  const chromePixels = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="workspace-chrome-canvas"]');
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) painted++;
    return painted;
  });
  assert.equal(chromePixels, 0, "An empty canvas must not paint a synthetic page outline");
}

export async function verifyEmptyCanvasDrawing(page) {
  await assertEmptyCanvas(page);
  const bounds = await page.getByTestId("editor-pages").boundingBox();
  const y = bounds.y + bounds.height / 2;
  await page.evaluate(() => window.__vooEditor.setTool("rect"));
  for (const [index, offset] of [-180, 40].entries()) {
    const x = bounds.x + bounds.width / 2 + offset;
    await page.mouse.move(x, y - 60); await page.mouse.down();
    await page.mouse.move(x + 100, y + 20, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count, index + 1);
  }
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.every(node => node.kind === "rect" && !node.parentId)), true);
  for (const count of [1, 0]) {
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count, count);
  }
  await page.evaluate(() => window.__vooEditor.setTool("select"));
  await assertEmptyCanvas(page);
}

async function importDocument(page, name, document) {
  const scene = value => ({ version: 2, canvasType: "design", canvasId: name, ...value });
  const serialized = document.pages ? { ...document, pages: document.pages.map(item => ({ ...item,
    ...(item.sceneDoc ? { sceneDoc: scene(item.sceneDoc) } : {}) })) } : scene(document);
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "VOO Design", exact: true }).click();
  await page.locator(".welcome-dashboard").waitFor();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"),
    page.getByTestId("editor-top-bar").getByRole("button", { name: /^Import project file/ }).click()]);
  await chooser.setFiles({ name, mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "voo", version: 2, kind: "design", document: serialized, assets: {} })) });
  await page.waitForFunction(name => {
    const store = window.__vooStore;
    const doc = window.__vooEditor?.getDocument();
    const expected = store?.nodes.find(item => item.id === store.editingNodeId)?.data.editorDoc;
    return store?.fileName === name && doc && doc.canvasId === expected?.canvasId &&
      document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off";
  }, name);
  await page.getByTestId("loading-modal").waitFor({ state: "detached" });
}

export async function verifyEmptyCanvasImports(page) {
  const documents = [
    { name: "EmptyLegacy.voo", document: { width: 640, height: 480, backgroundColor: "#171717", nodes: [] } },
    { name: "EmptyPages.voo", document: { pages: [{ id: "empty-page", label: "Empty", sceneDoc: {
      width: 640, height: 480, backgroundColor: "#171717", nodes: [] } }] } },
    { name: "MissingScene.voo", document: { pages: [{ id: "missing-scene", label: "Empty" }] } },
    { name: "EmptyRoot.voo", document: { isCanvasRoot: true, width: 640, height: 480, nodes: [] } },
  ];
  for (const item of documents) {
    await importDocument(page, item.name, item.document);
    await assertEmptyCanvas(page);
  }
  await page.screenshot({ path: "/tmp/voo-empty-canvas.png" });
  await importDocument(page, "ExistingFrame.voo", { isCanvasRoot: true, width: 640, height: 480, nodes: [
    { id: "retained-frame", kind: "group", isFrame: true, name: "Existing Frame", x: 10, y: 20,
      width: 100, height: 80, fill: "#123456" },
  ] });
  await page.waitForFunction(() => window.__vooEditor.getNode("retained-frame"));
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 1);
  assert.equal(await page.getByTestId("editor-canvas-frame-label").count(), 1);

  await importDocument(page, "LegacyContent.voo", { width: 640, height: 480, backgroundColor: "#171717", nodes: [
    { id: "legacy-rect", kind: "rect", x: 10, y: 20, width: 100, height: 80, fill: "#123456" },
  ] });
  await page.waitForFunction(() => window.__vooEditor.getNode("legacy-rect"));
  const legacy = await page.evaluate(() => {
    const nodes = window.__vooEditor.getDocument().nodes;
    const frame = nodes.find(node => node.isFrame);
    return { count: nodes.length, frameFill: frame?.fill, parent: nodes.find(node => node.id === "legacy-rect").parentId === frame?.id };
  });
  assert.deepEqual(legacy, { count: 2, frameFill: "#171717", parent: true });
  assert.equal(await page.getByTestId("editor-canvas-frame-label").count(), 1);
}
