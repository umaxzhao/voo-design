import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const runPalette = async (query, label) => {
    await page.keyboard.press("Control+k");
    const palette = page.getByTestId("command-palette");
    await palette.getByRole("combobox").fill(query);
    await palette.getByRole("option").filter({ hasText: label }).first().click();
    await palette.waitFor({ state: "hidden" });
  };
  const guides = () => page.evaluate(() => window.__vooEditor.getDocument().guides ?? []);
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false,
      backgroundColor: "#ffffff", nodes: [], guides: [], comments: [] });
    e.selectExactly([]); e.setTool("select");
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 100 } });
  });
  await runPalette("rulers", /rulers/i);
  const ruler = page.getByTestId("editor-ruler-top");
  await ruler.waitFor({ state: "visible" });
  const rulerBox = await ruler.boundingBox();
  const x = rulerBox.x + 120, y = rulerBox.y + 10;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + 100, { steps: 6 }); await page.mouse.up();
  assert.equal((await guides()).length, 1);
  const created = (await guides())[0];
  await tool("undo"); assert.equal((await guides()).length, 0);
  await tool("redo"); assert.deepEqual((await guides())[0], created);
  checks.push("palette ruler action and real pointer guide creation preserve one-step undo/redo");

  const guide = page.getByTestId("editor-guide");
  const guideBox = await guide.boundingBox();
  await page.mouse.move(guideBox.x + 180, guideBox.y + guideBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(guideBox.x + 180, guideBox.y + guideBox.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  assert.equal((await guides())[0].pos, created.pos + 60);
  await tool("undo"); assert.deepEqual((await guides())[0], created);
  await runPalette("clear guides", /clear.*guides/i);
  assert.equal((await guides()).length, 0);
  await tool("undo"); assert.deepEqual((await guides())[0], created);
  checks.push("guide drag and palette clear each commit exactly one undo entry");

  await page.getByTestId("editor-comments-toggle").click();
  await page.getByTestId("editor-comments-add-mode").click();
  await page.getByTestId("editor-comment-mode-overlay").click({ position: { x: 230, y: 210 } });
  const composer = page.getByTestId("editor-comment-composer");
  await composer.getByRole("textbox").fill("Document aid regression");
  await composer.getByRole("button", { name: "Post", exact: true }).click();
  const comment = await page.evaluate(() => window.__vooEditor.getDocument().comments[0]);
  assert.equal(comment.messages[0].body, "Document aid regression");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments?.length ?? 0), 0);
  await tool("redo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().comments[0].id), comment.id);
  await page.getByTestId("editor-comments-panel").getByRole("button", { name: "Close comments", exact: true }).click();
  assert.equal(await page.getByTestId("editor-comment-mode-overlay").count(), 0);
  checks.push("pointer comment creation commits once and closing comments disarms placement");

  await page.evaluate(async () => {
    const { createTextNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [{ ...createTextNode({ x: 100, y: 100, text: "Audit audit", fontSize: 24, fill: "#000000" }), id: "find-target" }] });
    e.selectExactly([]);
  });
  await runPalette("find", /find.*replace/i);
  const find = page.getByTestId("find-replace-bar");
  await find.getByRole("textbox", { name: "Find text", exact: true }).fill("Audit");
  await find.getByRole("textbox", { name: "Replace with", exact: true }).fill("Review");
  await find.getByRole("button", { name: /^Replace all$/i }).click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("find-target").text), "Review Review");
  await tool("undo");
  assert.equal(await page.evaluate(() => window.__vooEditor.getNode("find-target").text), "Audit audit");
  await find.getByRole("button", { name: "Close", exact: true }).click();
  checks.push("palette find/replace updates real text in one undoable document edit");

  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.getState().addEditorPage();
  });
  await page.waitForFunction(() => Boolean(window.__vooEditor) && !window.__vooEditor.getNode("find-target"));
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [{ ...createRectNode({ x: 100, y: 100, width: 100, height: 100, fill: "#ff0000" }), id: "second-page-target" }] });
    e.selectExactly(["second-page-target"]);
  });
  await runPalette("duplicate", /duplicate/i);
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), 2);
  await tool("undo");
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id)), ["second-page-target"]);
  checks.push("palette commands retarget the newly focused page and undo through its engine");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
