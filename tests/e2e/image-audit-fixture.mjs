import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

/** Isolated image fixtures use real pixels and the production editor, never user files. */
export function imageAudit(page, name) {
  const directory = process.env.VOO_IMAGE_AUDIT_DIR ?? editorArtifactPath("voo-image-complete");
  const results = [];
  const record = async (id, run) => {
    const started = Date.now();
    try {
      const detail = await run();
      results.push({
        id,
        status: "passed",
        durationMs: Date.now() - started,
        detail
      });
    } catch (error) {
      results.push({
        id,
        status: error.auditStatus === "blocked" ? "blocked" : "failed",
        durationMs: Date.now() - started,
        error: error.stack ?? String(error)
      });
      await mkdir(directory, {
        recursive: true
      });
      await page.screenshot({
        path: `${directory}/${name}-${id.replace(/[^a-z0-9-]/gi, "_")}.png`
      });
    }
    await mkdir(directory, {
      recursive: true
    });
    await writeFile(`${directory}/${name}.json`, JSON.stringify({
      name,
      results
    }, null, 2));
    console.log(`${name}: ${id}: ${results.at(-1).status}`);
  };
  const seed = async () => {
    await page.mouse.up();
    await page.keyboard.press("Escape");
    const node = await page.evaluate(async () => {
      const e = window.__vooEditor;
      e.cancelSelectionTransform();
      e.endMaskEdit();
      e.clearPixelSelection();
      e.clearPendingObjectStroke?.();
      e.setTool("select");
      e.selectExactly([]);
      e.setDoc({
        ...e.getDocument(),
        width: 600,
        height: 400,
        isCanvasRoot: false,
        backgroundColor: "#ffffff",
        nodes: []
      });
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const c = canvas.getContext("2d");
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        c.fillStyle = `rgb(${30 + (x * 7 + y * 3) % 190},${25 + y * 5 % 200},${20 + x * 3 % 210})`;
        c.fillRect(x, y, 1, 1);
      }
      c.fillStyle = "#ff0000";
      c.fillRect(0, 0, 32, 96);
      c.clearRect(80, 0, 16, 16);
      const node = await e.insertImage(canvas.toDataURL(), {
        x: 230,
        y: 180
      });
      e.selectExactly([node.id]);
      const {
        useDesignStore
      } = await import("/src/store/design_store.js");
      useDesignStore.setState({
        editorCamera: {
          zoom: 1,
          panX: 300,
          panY: 100
        }
      });
      return {
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      };
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return node;
  };
  const client = point => page.evaluate(async point => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const bounds = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return {
      x: bounds.left + point.x * bounds.width / doc.width,
      y: bounds.top + point.y * bounds.height / doc.height
    };
  }, point);
  const drag = async (from, to) => {
    const a = await client(from),
      b = await client(to);
    const blocked = await page.evaluate(p => Boolean(document.elementFromPoint(p.x, p.y)?.closest("button,input,[data-floating-surface]")), a);
    assert.equal(blocked, false, "Pointer start must reach canvas artwork");
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    try {
      await page.mouse.move(b.x, b.y, {
        steps: 10
      });
    } finally {
      await page.mouse.up();
    }
  };
  const pixels = id => page.evaluate(async id => {
    const e = window.__vooEditor;
    await e.flushMasks();
    await e.flushPaints();
    const output = e.exportSelectionPng([id]);
    const image = new Image();
    image.src = typeof output === "string" ? output : output.dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const c = canvas.getContext("2d");
    c.drawImage(image, 0, 0);
    const bytes = c.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261,
      painted = 0;
    for (let i = 0; i < bytes.length; i++) {
      hash = Math.imul(hash ^ bytes[i], 16777619);
      if (i % 4 === 3 && bytes[i]) painted++;
    }
    return {
      hash: hash >>> 0,
      width: canvas.width,
      height: canvas.height,
      painted
    };
  }, id);
  const finish = () => {
    const failed = results.filter(result => result.status !== "passed");
    assert.equal(failed.length, 0, `${name}: ${failed.map(result => `${result.id}: ${result.error}`).join("\n")}`);
  };
  return {
    record,
    seed,
    client,
    drag,
    pixels,
    finish,
    results
  };
}
