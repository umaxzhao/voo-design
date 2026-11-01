import assert from "node:assert/strict";
import { runNativeFillCases } from "./unified-fill-native-cases.mjs";
/** Exercise the shipped inspector and compositor, not a second copy of its callbacks. */
export async function runUnifiedFillCases({
  page,
  tool,
  mark
}) {
  const original = await page.evaluate(() => ({
    doc: window.__vooEditor.getDocument(),
    ids: window.__vooEditor.getSelectedIds()
  }));
  const panel = page.getByTestId("editor-properties-panel");
  const dialog = () => page.getByRole("dialog", {
    name: "Fill",
    exact: true
  });
  const node = (id = "paint-shape") => page.evaluate(id => window.__vooEditor.getNode(id), id);
  const nodes = () => page.evaluate(() => window.__vooEditor.getDocument().nodes);
  const sample = (x, y) => page.evaluate(({
    x,
    y
  }) => window.__vooEditor.sampleColorAt({
    x,
    y
  }), {
    x,
    y
  });
  const select = id => page.evaluate(id => window.__vooEditor.selectExactly([id]), id);
  const close = async () => {
    await page.keyboard.press("Escape");
    await dialog().waitFor({
      state: "detached"
    });
  };
  const open = async (index = 0) => {
    await panel.locator("[data-fill-paint-row]").nth(index).getByRole("button", {
      name: "Fill",
      exact: true
    }).click();
    await dialog().waitFor();
  };
  const pixels = async () => page.evaluate(async () => {
    const e = window.__vooEditor;
    const png = await e.exportSelectionPng(["paint-shape"]);
    const svg = e.getNodeSvg("paint-shape");
    const decode = async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return [[8, 8], [16, 16], [10, 2], [100, 20]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
    };
    const url = URL.createObjectURL(new Blob([svg], {
      type: "image/svg+xml"
    }));
    try {
      return {
        png: await decode(png.dataUrl),
        svg: await decode(url)
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  try {
    const imageData = await page.evaluate(async () => {
      const {
        createRectNode,
        createGroupNode,
        createTextNode
      } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor;
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(32, 0, 32, 32);
      const url = canvas.toDataURL();
      e.setDoc({
        ...e.getDocument(),
        isCanvasRoot: false,
        width: 600,
        height: 400,
        crop: null,
        backgroundColor: "#ffffff",
        nodes: [{
          ...createGroupNode({
            x: 40,
            y: 40,
            width: 450,
            height: 300
          }),
          id: "paint-frame",
          isFrame: true,
          fill: "#ffffff"
        }, {
          ...createRectNode({
            x: 80,
            y: 80,
            width: 120,
            height: 80,
            fill: "#ff0000"
          }),
          id: "paint-shape",
          parentId: "paint-frame"
        }, {
          ...createRectNode({
            x: 300,
            y: 220,
            width: 60,
            height: 60,
            fill: "#000000"
          }),
          id: "paint-other"
        }, {
          ...createTextNode({
            x: 260,
            y: 80,
            text: "Paint",
            fill: "#000000",
            fontSize: 24
          }),
          id: "paint-text",
          parentId: "paint-frame"
        }]
      });
      e.selectExactly(["paint-shape"]);
      e.setTool("select");
      e.commitEditorDocument();
      return url;
    });
    await open();
    assert.equal(await dialog().getByRole("tab").count(), 4);
    assert.equal(await panel.getByRole("button", {
      name: "Fill type",
      exact: true
    }).count(), 0);
    const baseline = await nodes();
    await dialog().getByRole("tab", {
      name: "Gradient",
      exact: true
    }).click();
    assert.match((await node()).fill, /^linear-gradient/);
    const gradient = (await node()).fill;
    await dialog().getByRole("button", {
      name: "Mesh",
      exact: true
    }).click();
    assert.equal(await dialog().getByRole("group", {
      name: "Gradient points"
    }).getByRole("button").count(), 4);
    await tool("undo");
    assert.equal((await node()).fill, gradient);
    await dialog().getByRole("tab", {
      name: "Solid",
      exact: true
    }).click();
    assert.equal((await node()).fill, "#ff0000");
    await dialog().getByRole("tab", {
      name: "Gradient",
      exact: true
    }).click();
    assert.equal((await node()).fill, gradient);
    await close();
    await tool("undo");
    await tool("undo");
    await tool("undo");
    assert.deepEqual(await nodes(), baseline);
    mark("one fill editor owns all four modes; gradient/mesh/solid switching preserves drafts and undo restores the complete original nodes");
    await open();
    await dialog().getByRole("tab", {
      name: "Image",
      exact: true
    }).click();
    assert.deepEqual(await nodes(), baseline, "entering an empty image tab must not erase the current paint");
    const input = dialog().locator('input[type="file"]');
    await input.setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image")
    });
    await dialog().getByRole("alert").waitFor();
    assert.deepEqual(await nodes(), baseline);
    await input.setInputFiles({
      name: "paint.png",
      mimeType: "image/png",
      buffer: Buffer.from(imageData.split(",")[1], "base64")
    });
    await page.waitForFunction(() => window.__vooEditor.getNode("paint-shape").fill.startsWith("data:image/png"));
    await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
      x: 180,
      y: 120
    }) === "#0000ff");
    assert.equal(await sample(100, 120), "#ff0000");
    await dialog().getByTestId("picker-opacity-input").fill("40");
    await dialog().getByTestId("picker-opacity-input").press("Enter");
    assert.equal((await node()).fills[0].opacity, .4);
    await panel.locator("[data-fill-paint-row]").first().getByRole("button", {
      name: "Opacity",
      exact: true
    }).filter({
      hasText: /^40$/
    }).waitFor();
    assert.equal(await panel.locator("[data-fill-paint-row]").first().getByRole("button", {
      name: "Opacity",
      exact: true
    }).innerText(), "40");
    await tool("undo");
    assert.equal((await node()).fillOpacity, 1);
    await tool("redo");
    assert.equal((await node()).fillOpacity, .4);
    await tool("undo");
    await dialog().getByRole("button", {
      name: "Image fit",
      exact: true
    }).click();
    await page.getByRole("listbox").getByRole("option", {
      name: "Fit",
      exact: true
    }).click();
    assert.equal((await node()).fills[0].imageScaleMode, "fit");
    await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
      x: 100,
      y: 82
    }) === "#ffffff");
    let exported = await pixels();
    assert.deepEqual(exported.svg, exported.png);
    await tool("undo");
    assert.equal((await node()).fills[0].imageScaleMode, "fill");
    await close();
    await open();
    assert.equal(await dialog().getByRole("tab", {
      name: "Image",
      exact: true
    }).getAttribute("aria-selected"), "true");
    mark("image choose/retry/replace uses actual decoded pixels, shared opacity and fit mode, persists when reopened, exports matching PNG/SVG and undoes once");
    await dialog().getByRole("tab", {
      name: "Texture",
      exact: true
    }).click();
    const colour = dialog().getByRole("textbox", {
      name: "Texture colour",
      exact: true
    });
    await colour.fill("00ff00");
    await colour.press("Enter");
    await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
      x: 88,
      y: 88
    }) === "#00ff00");
    const textureScale = dialog().getByRole("spinbutton", {
      name: "Texture scale",
      exact: true
    });
    await textureScale.fill("200");
    await textureScale.press("Enter");
    await page.waitForFunction(() => window.__vooEditor.sampleColorAt({
      x: 96,
      y: 96
    }) === "#00ff00");
    const texture = (await node()).fill;
    exported = await pixels();
    assert.deepEqual(exported.svg, exported.png);
    await close();
    await open();
    assert.equal(await dialog().getByRole("tab", {
      name: "Texture",
      exact: true
    }).getAttribute("aria-selected"), "true");
    assert.equal(await dialog().getByRole("spinbutton", {
      name: "Texture scale",
      exact: true
    }).inputValue(), "200");
    await close();
    await panel.getByRole("button", {
      name: "Add fill",
      exact: true
    }).click();
    assert.equal((await node()).fills.length, 2);
    const rows = panel.locator("[data-fill-paint-row]");
    const second = rows.nth(1).getByRole("textbox", {
      name: "Custom colour",
      exact: true
    });
    await second.fill("0000ff");
    await second.press("Enter");
    assert.equal((await node()).fills[0].fill, texture);
    assert.equal((await node()).fills[1].fill, "#0000ff");
    await rows.nth(0).getByRole("button", {
      name: "Fill visible",
      exact: true
    }).click();
    await rows.nth(1).getByRole("button", {
      name: "Fill visible",
      exact: true
    }).click();
    assert.equal(await rows.count(), 2);
    assert.ok((await node()).fills.every(paint => paint.visible === false));
    await tool("undo");
    await tool("undo");
    await rows.nth(0).getByRole("button", {
      name: "Remove fill",
      exact: true
    }).click();
    assert.equal((await node()).fills[0].fill, "#0000ff");
    await tool("undo");
    assert.equal((await node()).fills[0].fill, texture);
    mark("portable texture tiles change actual colour/scale and match SVG pixels; layered paints retain independent values and hidden paints remain editable");
    await open();
    await dialog().getByRole("tab", {
      name: "Image",
      exact: true
    }).click();
    await page.evaluate(url => {
      const decode = HTMLImageElement.prototype.decode;
      window.__fillDecodeOriginal = decode;
      HTMLImageElement.prototype.decode = async function () {
        if (this.src === url) await new Promise(resolve => {
          window.__releaseFillDecode = resolve;
        });
        return decode.call(this);
      };
    }, imageData);
    const beforePending = await nodes();
    await dialog().locator('input[type="file"]').setInputFiles({
      name: "late.png",
      mimeType: "image/png",
      buffer: Buffer.from(imageData.split(",")[1], "base64")
    });
    await page.waitForFunction(() => typeof window.__releaseFillDecode === "function");
    await close();
    await select("paint-other");
    await page.evaluate(() => {
      window.__releaseFillDecode();
      HTMLImageElement.prototype.decode = window.__fillDecodeOriginal;
    });
    await page.waitForTimeout(100);
    assert.deepEqual(await nodes(), beforePending);
    mark("closing an in-flight image decode and switching selection cannot overwrite either object's paint");
    await runNativeFillCases({
      page,
      tool,
      open,
      close,
      dialog,
      node,
      select,
      imageData,
      mark
    });
  } catch (error) {
    console.error("Fill audit state:", JSON.stringify(await page.evaluate(() => ({
      ids: window.__vooEditor.getSelectedIds(),
      selected: window.__vooEditor.getDocument().nodes.filter(node => window.__vooEditor.getSelectedIds().includes(node.id)).map(({
        id,
        kind,
        fill,
        imageId,
        fills
      }) => ({
        id,
        kind,
        fill: fill?.slice(0, 80),
        imageId,
        fills: fills?.map(paint => ({
          ...paint,
          fill: paint.fill?.slice(0, 80)
        }))
      })),
      tabs: [...document.querySelectorAll('[role="dialog"] [role="tab"]')].map(button => ({
        name: button.getAttribute("aria-label"),
        active: button.getAttribute("aria-selected")
      })),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(element => element.getAttribute("aria-label"))
    }))));
    await page.screenshot({
      path: "/private/tmp/voo-unified-fill-failure.png"
    });
    throw error;
  } finally {
    await page.evaluate(({
      doc,
      ids
    }) => {
      if (window.__fillDecodeOriginal) HTMLImageElement.prototype.decode = window.__fillDecodeOriginal;
      window.__releaseFillDecode?.();
      window.__vooEditor.setDoc(doc);
      window.__vooEditor.selectExactly(ids);
    }, original);
  }
}
