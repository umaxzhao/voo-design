import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

// UF19 cold reopen: session A imports custom HTML through the Browser drawer and saves a
// production portable ZIP. Session B is a new browser process that imports that ZIP through
// the real file chooser. The HTML root background and the pre-existing content must survive.
const EVIDENCE = process.env.UF19_COLD_REOPEN_EVIDENCE ?? join(process.env.HOME ?? "/tmp", "voo-uf19-cold-reopen");
const ZIP_PATH = join(EVIDENCE, "uf19-html-root-bg.zip");
const IMPORT_NAME = "Import project file (⌘O / Ctrl+O)";

const TYPOGRAPHY_HTML = `<main style="width: 352px; padding: 16px; background-color: #ffffff; font: 16px Arial;">
  <h1 style="font-size: 24px; margin: 0 0 8px 0;">Typography</h1>
  <p style="font-size: 14px; margin: 0;">Body copy line one.</p>
</main>`;

await mkdir(EVIDENCE, { recursive: true });

// The engine normalises stored nodes with defaults, so compare the authored fields only.
const authored = (node) => ({
  id: node?.id, kind: node?.kind, x: node?.x, y: node?.y, width: node?.width, height: node?.height, fill: node?.fill, parentId: node?.parentId ?? null,
});

const nodesOf = (page) => page.evaluate(() => window.__vooEditor.getDocument().nodes);
const rootFrameOf = (nodes, knownIds) =>
  nodes.find((node) => !node.parentId && node.isFrame && node.fill && !knownIds.includes(node.id));
const pixelOf = (page, id) =>
  page.evaluate(async (nodeId) => {
    const result = window.__vooEditor.exportSelectionPng([nodeId], { scale: 1, type: "image/png", transparent: true });
    const url = typeof result === "string" ? result : result?.dataUrl;
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(2, 2, 1, 1).data);
  }, id);

let importedFrameId;
let seedRect;
let beforeSaveNodes;

await withEditorBrowser(async ({ page, errors }) => {
  // Pre-existing content that must survive the import and the reopen unchanged.
  seedRect = { id: "uf19-seed-rect", kind: "rect", name: "Seed", x: 600, y: 120, width: 120, height: 80, fill: "#ff0000", parentId: null };
  await page.evaluate((rect) => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [...e.getDocument().nodes, rect] });
  }, seedRect);
  const knownBefore = (await nodesOf(page)).map((n) => n.id);

  await page.getByTestId("titlebar-browser-button").click();
  const drawer = page.getByTestId("voo-browser-drawer");
  await drawer.waitFor();
  await drawer.getByRole("button", { name: "Browser tools" }).click();
  await page.getByRole("menuitem", { name: "Paste & Import Custom HTML" }).click();
  await drawer.locator("textarea").fill(TYPOGRAPHY_HTML);
  await drawer.getByRole("button", { name: "Convert to Canvas Layers" }).click();
  await page.waitForFunction((count) => window.__vooEditor.getDocument().nodes.length > count, knownBefore.length);

  beforeSaveNodes = await nodesOf(page);
  const frame = rootFrameOf(beforeSaveNodes, knownBefore);
  assert.ok(frame, "root background frame must exist before save");
  importedFrameId = frame.id;
  assert.ok(["#ffffff", "rgb(255, 255, 255)"].includes(frame.fill));
  assert.deepEqual(
    authored(beforeSaveNodes.find((n) => n.id === seedRect.id)),
    authored(seedRect),
    "pre-existing rectangle is unchanged by the import",
  );

  await page.getByTestId("editor-pages").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  await palette.getByRole("combobox").fill("portable .zip snapshot");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    palette.getByRole("option").filter({ hasText: /portable \.zip snapshot/i }).click(),
  ]);
  assert.match(download.suggestedFilename(), /\.zip$/);
  await download.saveAs(ZIP_PATH);
  assert.deepEqual(errors, [], "session A has no page errors");
}, { openDocument: true, mcpLink: true });

await withEditorBrowser(async ({ page, errors }) => {
  page.setDefaultTimeout(30000);
  const bar = page.getByTestId("editor-top-bar");
  const importButton = bar.getByRole("button", { name: IMPORT_NAME, exact: true });
  await importButton.waitFor();
  for (let attempt = 0; attempt < 300 && (await importButton.isDisabled()); attempt += 1) {
    await page.waitForTimeout(100);
  }
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), importButton.click()]);
  await chooser.setFiles(ZIP_PATH);
  await page.waitForFunction(() => window.__vooEditor?.getDocument()?.nodes?.length > 0, null, { timeout: 60000 });

  const reopened = await nodesOf(page);
  const frame = reopened.find((n) => n.id === importedFrameId);
  assert.ok(frame, "cold reopen restores the imported root frame");
  assert.ok(["#ffffff", "rgb(255, 255, 255)"].includes(frame.fill), "cold reopen keeps the root background fill");
  assert.equal(frame.isFrame, true);
  assert.deepEqual(
    authored(reopened.find((n) => n.id === seedRect.id)),
    authored(seedRect),
    "cold reopen keeps the pre-existing rectangle unchanged",
  );
  const sameGeometry = beforeSaveNodes.every((node) => {
    const match = reopened.find((n) => n.id === node.id);
    return match && match.x === node.x && match.y === node.y && match.width === node.width && match.height === node.height;
  });
  assert.ok(sameGeometry, "cold reopen keeps every node's geometry");

  const [r, g, b, a] = await pixelOf(page, importedFrameId);
  assert.equal(a, 255, "exported root background is opaque after cold reopen");
  assert.deepEqual([r, g, b], [255, 255, 255]);

  assert.deepEqual(errors, [], "session B has no page errors");
  console.log(`browser-html-root-background cold reopen: pass (zip ${ZIP_PATH}, ${(await readFile(ZIP_PATH)).length} bytes)`);
}, { openDocument: false, mcpLink: false });
