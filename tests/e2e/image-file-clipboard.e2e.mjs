import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
const pasteKey = process.platform === "darwin" ? "Meta+v" : "Control+v";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "file-clipboard");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const source = async mime => {
    const base64 = await page.evaluate(mime => {
      const engine = window.__vooEditor;
      const bitmap = engine.getNodeBitmap(engine.getNode(engine.getSelectedId()));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      return canvas.toDataURL(mime).split(",")[1];
    }, mime);
    return Buffer.from(base64, "base64");
  };
  const before = () => page.evaluate(() => window.__vooEditor.serialise());
  const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const focusCanvas = () => page.locator("[data-editor-artboard]").evaluate(element => {
    element.tabIndex = -1;
    element.focus();
  });
  const pick = async files => {
    const point = await audit.client({
      x: 320,
      y: 250
    });
    await page.mouse.click(point.x, point.y, {
      button: "right"
    });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("editor-menu-import-media").click()]);
    await chooser.setFiles(files);
  };
  const added = async original => {
    const ids = original.nodes.map(node => node.id);
    await page.waitForFunction(ids => window.__vooEditor.getDocument().nodes.some(node => !ids.includes(node.id)), ids);
    await settled();
    return page.evaluate(ids => window.__vooEditor.getDocument().nodes.filter(node => !ids.includes(node.id)), ids);
  };
  for (const [ext, mime] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]]) {
    await audit.record(`file-picker-${ext}`, async () => {
      await audit.seed();
      const original = await before();
      await pick({
        name: `Import.${ext}`,
        mimeType: mime,
        buffer: await source(mime)
      });
      const nodes = await added(original);
      assert.equal(nodes.length, 1);
      assert.equal(nodes[0].kind, "image");
      const pixels = await audit.pixels(nodes[0].id);
      assert.equal(pixels.width, 96);
      assert.equal(pixels.height, 96);
      assert.ok(pixels.painted > 8000);
      await tool("undo");
      assert.deepEqual(await before(), original);
      await tool("redo");
      assert.deepEqual(await audit.pixels(nodes[0].id), pixels);
      return {
        realFileChooser: true,
        decodedPixels: true,
        undoRedo: true
      };
    });
  }
  await audit.record("svg-remains-editable", async () => {
    await audit.seed();
    const original = await before();
    await pick({
      name: "Vector.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#ff0000"/></svg>')
    });
    const nodes = await added(original);
    assert.ok(nodes.length > 0 && nodes.every(node => node.kind !== "image"));
    assert.ok(nodes.some(node => node.fill === "#ff0000"));
    await tool("undo");
    assert.deepEqual(await before(), original);
    return {
      editableVector: true,
      oneUndo: true
    };
  });
  await audit.record("corrupt-file-feedback-and-recovery", async () => {
    await audit.seed();
    const png = await source("image/png");
    const original = await before();
    await pick({
      name: "Broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image")
    });
    await page.getByRole("alert").filter({
      hasText: /import/i
    }).waitFor();
    assert.deepEqual(await before(), original);
    await pick({
      name: "Recovered.png",
      mimeType: "image/png",
      buffer: png
    });
    const nodes = await added(original);
    assert.ok((await audit.pixels(nodes[0].id)).painted > 0);
    assert.equal(await page.getByRole("alert").filter({
      hasText: /import/i
    }).count(), 0);
    return {
      failureVisible: true,
      documentUnchangedOnFailure: true,
      nextImportWorks: true
    };
  });
  await audit.record("multi-file-picker-one-undo", async () => {
    await audit.seed();
    const original = await before(),
      png = await source("image/png");
    await pick([1, 2].map(index => ({
      name: `Batch${index}.png`,
      mimeType: "image/png",
      buffer: png
    })));
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count + 2, original.nodes.length);
    await settled();
    await tool("undo");
    assert.deepEqual(await before(), original, "One picker action must undo the whole image batch");
    return {
      twoImages: true,
      oneUndo: true
    };
  });
  await audit.record("multi-file-drop-one-undo", async () => {
    await audit.seed();
    const original = await before(),
      png = await source("image/png");
    const transfer = await page.evaluateHandle(base64 => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const data = new DataTransfer();
      for (const index of [1, 2]) data.items.add(new File([bytes], `Drop${index}.png`, {
        type: "image/png"
      }));
      return data;
    }, png.toString("base64"));
    const point = await audit.client({
      x: 400,
      y: 250
    });
    await page.getByTestId("design-editor").dispatchEvent("drop", {
      dataTransfer: transfer,
      clientX: point.x,
      clientY: point.y
    });
    await transfer.dispose();
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count + 2, original.nodes.length);
    await settled();
    await tool("undo");
    assert.deepEqual(await before(), original, "One drop action must undo the whole image batch");
    return {
      realDecoding: true,
      domDropPipeline: true,
      oneUndo: true
    };
  });
  await audit.record("mixed-svg-raster-batch-one-undo", async () => {
    await audit.seed();
    const original = await before();
    await pick([{
      name: "Photo.png",
      mimeType: "image/png",
      buffer: await source("image/png")
    }, {
      name: "Vector.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#ff0000"/></svg>')
    }]);
    const nodes = await added(original);
    assert.ok(nodes.some(node => node.kind === "image"));
    assert.ok(nodes.some(node => node.kind === "rect"));
    await tool("undo");
    assert.deepEqual(await before(), original);
    return {
      editableVectorAndRaster: true,
      oneUndo: true
    };
  });
  await audit.record("invalid-batch-is-atomic", async () => {
    await audit.seed();
    const original = await before();
    await pick([{
      name: "Valid.png",
      mimeType: "image/png",
      buffer: await source("image/png")
    }, {
      name: "Broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("broken")
    }]);
    await page.getByRole("alert").filter({
      hasText: /import/i
    }).waitFor();
    assert.deepEqual(await before(), original);
    return {
      noPartiallyImportedImages: true
    };
  });
  await audit.record("context-menu-small-viewport", async () => {
    await audit.seed();
    await page.setViewportSize({
      width: 600,
      height: 500
    });
    await page.mouse.click(580, 200, {
      button: "right"
    });
    const menu = page.getByRole("menu", {
      name: "Context menu",
      exact: true
    });
    await menu.waitFor();
    await settled();
    const box = await menu.boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 600 && box.y + box.height <= 500, JSON.stringify({
      box,
      style: await menu.getAttribute("style"),
      viewport: await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      }))
    }));
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByTestId("editor-menu-import-media").click()]);
    await chooser.setFiles([]);
    await page.setViewportSize({
      width: 1440,
      height: 1000
    });
    return {
      boundedToViewport: true,
      lastActionsReachable: true
    };
  });
  await audit.record("browser-clipboard-png-paste", async () => {
    await audit.seed();
    const original = await before(),
      png = await source("image/png");
    await focusCanvas();
    await page.evaluate(async base64 => {
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      await navigator.clipboard.write([new ClipboardItem({
        "image/png": new Blob([bytes], {
          type: "image/png"
        })
      })]);
    }, png.toString("base64"));
    await page.keyboard.press(pasteKey);
    const nodes = await added(original);
    assert.equal(nodes.length, 1);
    assert.ok((await audit.pixels(nodes[0].id)).painted > 0);
    await tool("undo");
    assert.deepEqual(await before(), original);
    return {
      browserClipboard: true,
      trustedPasteKey: true,
      pixels: true,
      undo: true
    };
  });
  await audit.record("keyboard-copy-paste-cut-history", async () => {
    const node = await audit.seed(),
      original = await before();
    await focusCanvas();
    await page.keyboard.press("Control+c");
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes("<svg"));
    await page.keyboard.press(pasteKey);
    const nodes = await added(original);
    assert.equal(nodes.length, 1);
    assert.deepEqual(await audit.pixels(nodes[0].id), await audit.pixels(node.id));
    await page.keyboard.press("Control+x");
    await page.waitForFunction(id => !window.__vooEditor.getNode(id), nodes[0].id);
    await tool("undo");
    assert.ok((await audit.pixels(nodes[0].id)).painted > 0);
    await tool("undo");
    assert.deepEqual(await before(), original);
    return {
      keyboardCopyPasteCut: true,
      imageBytesPreserved: true,
      oneUndoPerAction: true
    };
  });
  await audit.record("psd-picker-keeps-document-import", async () => {
    await audit.seed();
    await pick("tests/fixtures/roundtrip/poster-1.psd");
    await page.waitForFunction(() => window.__vooStore.fileName === "poster-1.psd" && window.__vooEditor?.getDocument().nodes.length > 0);
    await page.waitForFunction(() => {
      const engine = window.__vooEditor;
      const image = engine.getDocument().nodes.find(node => node.kind === "image");
      return image && engine.getNodeBitmap(image);
    });
    const id = await page.evaluate(() => window.__vooEditor.getDocument().nodes.find(node => node.kind === "image").id);
    assert.ok((await audit.pixels(id)).painted > 0);
    return {
      actualPsdFilePicker: true,
      documentImporter: true,
      decodedLayerPixels: true
    };
  });
  audit.finish();
});
