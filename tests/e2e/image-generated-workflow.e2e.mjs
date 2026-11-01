import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
const fixture = resolve("tests/fixtures/image-editor/generated-product.png");
const directory = resolve(process.env.VOO_IMAGE_AUDIT_DIR ?? editorArtifactPath("voo-image-complete"));
await mkdir(directory, {
  recursive: true
});
let snapshot;
let expected;
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "generated-workflow");
  const panel = page.getByTestId("editor-properties-panel");
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let id;
  await audit.record("built-in-image-import-and-pointer-move", async () => {
    await audit.seed();
    await page.evaluate(() => {
      const engine = window.__vooEditor;
      engine.setDoc({
        ...engine.getDocument(),
        nodes: []
      });
      engine.selectExactly([]);
    });
    const at = await audit.client({
      x: 320,
      y: 250
    });
    await page.mouse.click(at.x, at.y, {
      button: "right"
    });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("editor-menu-import-media").click()]);
    await chooser.setFiles(fixture);
    await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 1);
    id = await page.evaluate(() => window.__vooEditor.getDocument().nodes[0].id);
    const size = await page.evaluate(id => {
      const bitmap = window.__vooEditor.getNodeBitmap(window.__vooEditor.getNode(id));
      return {
        width: bitmap.width,
        height: bitmap.height
      };
    }, id);
    assert.ok(size.width >= 1024 && size.height >= 1024);
    // Edit the actual inspector rather than replacing the imported bitmap.
    for (const [name, key, value] of [["W", "width", 240], ["H", "height", 240], ["X", "x", 180], ["Y", "y", 100]]) {
      const field = panel.getByRole("spinbutton", {
        name,
        exact: true
      });
      await field.fill(String(value));
      await field.press("Enter");
      await page.waitForFunction(({
        id,
        key,
        value
      }) => window.__vooEditor.getNode(id)?.[key] === value, {
        id,
        key,
        value
      });
    }
    const original = await page.evaluate(() => window.__vooEditor.serialise());
    const pixels = await audit.pixels(id);
    assert.equal(pixels.painted, 240 * 240, JSON.stringify({
      pixels,
      node: await page.evaluate(id => window.__vooEditor.getNode(id), id)
    }));
    await audit.drag({
      x: 300,
      y: 220
    }, {
      x: 330,
      y: 240
    });
    const moved = await page.evaluate(id => window.__vooEditor.getNode(id), id);
    assert.ok(Math.abs(moved.x - 210) < 2 && Math.abs(moved.y - 120) < 2);
    assert.deepEqual(await audit.pixels(id), pixels, "Moving the selection must retain actual artwork");
    await tool("undo");
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise()), original);
    await tool("redo");
    await settled();
    return {
      generatedWith: "Codex built-in image generation",
      sourceSize: size,
      inspectorEdits: true,
      realPointerMove: true,
      undoRedo: true
    };
  });
  await audit.record("generated-photo-flip-adjust-export", async () => {
    assert.ok(id, "Generated source must have imported successfully");
    const original = await audit.pixels(id);
    const imageId = await page.evaluate(id => window.__vooEditor.getNode(id).imageId, id);
    await panel.getByRole("button", {
      name: "Flip horizontal",
      exact: true
    }).click();
    await page.waitForFunction(({
      id,
      imageId
    }) => window.__vooEditor.getNode(id)?.imageId !== imageId, {
      id,
      imageId
    });
    assert.notDeepEqual(await audit.pixels(id), original);
    await tool("undo");
    assert.deepEqual(await audit.pixels(id), original);
    await page.evaluate(async id => {
      const {
        starterAdjustment
      } = await import("/src/canvas/editor/adjustment_starters.js");
      window.__vooEditor.updateNode(id, {
        adjustments: {
          brightness: starterAdjustment("brightness")
        }
      });
    }, id);
    const adjusted = await audit.pixels(id);
    assert.notDeepEqual(adjusted, original);
    await tool("undo");
    assert.deepEqual(await audit.pixels(id), original);
    await tool("redo");
    assert.deepEqual(await audit.pixels(id), adjusted);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog").filter({
      has: page.getByRole("combobox")
    });
    await palette.getByRole("combobox").fill("Export");
    await palette.getByRole("option").filter({
      hasText: /^Export$/
    }).click();
    const dialog = page.getByTestId("design-export-dialog");
    await dialog.getByRole("button", {
      name: /^PNG(?: |$)/
    }).click();
    const one = dialog.getByRole("button", {
      name: /^1[x×]$/
    });
    if (await one.count()) await one.click();
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", {
      name: "Export",
      exact: true
    }).click()]);
    const bytes = await readFile(await download.path());
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(bytes.length > 10000, "Downloaded PNG must include the generated photograph");
    const downloadedHash = await page.evaluate(async ({
      base64,
      id
    }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const node = window.__vooEditor.getNode(id);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(node.x, node.y, node.width, node.height).data;
      let hash = 2166136261;
      for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    }, {
      base64: bytes.toString("base64"),
      id
    });
    assert.equal(downloadedHash, adjusted.hash, "Downloaded PNG must contain the exact edited pixels");
    await download.saveAs(resolve(directory, "generated-edited.png"));
    if (await dialog.count()) await dialog.getByRole("button", {
      name: "Cancel",
      exact: true
    }).click();
    expected = {
      id,
      pixels: adjusted,
      node: await page.evaluate(id => window.__vooEditor.getNode(id), id)
    };
    return {
      actualFlipButton: true,
      tonalPixelsChanged: true,
      undoRedo: true,
      downloadedBytes: bytes.length
    };
  });
  await audit.record("portable-snapshot-download", async () => {
    assert.ok(expected, "Edited pixels must have passed");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", {
      name: "Export project as a portable .zip snapshot",
      exact: true
    }).click()]);
    snapshot = await readFile(await download.path());
    assert.equal(snapshot.subarray(0, 2).toString(), "PK");
    assert.ok(snapshot.length > 100000);
    await download.saveAs(resolve(directory, "generated-edit.zip"));
    return {
      actualTitlebarExport: true,
      archiveBytes: snapshot.length
    };
  });
  audit.finish();
});

// A separate browser has no original cache, IndexedDB assets or editor instance.
await withEditorBrowser(async ({
  page
}) => {
  const audit = imageAudit(page, "generated-reopen");
  await audit.record("cold-browser-reopen-retains-source-and-edits", async () => {
    // Exercise the standard input fallback used when native FSA is unavailable.
    await page.evaluate(() => {
      delete window.showOpenFilePicker;
    });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", {
      name: /^Import project file/
    }).click()]);
    await chooser.setFiles({
      name: "GeneratedEdit.zip",
      mimeType: "application/zip",
      buffer: snapshot
    });
    await page.waitForFunction(id => window.__vooEditor?.getNode(id)?.imageId, expected.id);
    await page.waitForFunction(id => {
      const engine = window.__vooEditor;
      return Boolean(engine.getNodeBitmap(engine.getNode(id)));
    }, expected.id);
    const node = await page.evaluate(id => window.__vooEditor.getNode(id), expected.id);
    assert.deepEqual(node.adjustments.brightness, expected.node.adjustments.brightness);
    for (const key of ["x", "y", "width", "height"]) assert.equal(node[key], expected.node[key]);
    assert.deepEqual(await audit.pixels(expected.id), expected.pixels);
    await page.screenshot({
      path: resolve(directory, "generated-reopened.png")
    });
    return {
      freshBrowserAndDatabase: true,
      inputPickerFallback: true,
      embeddedSourceHydrated: true,
      exactEditedPixels: true
    };
  });
  audit.finish();
});
