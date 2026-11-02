import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";

// Opt-in: this suite uses the public stock service and downloads actual model weights.
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "network");
  const requested = process.env.VOO_NETWORK_CASES?.split(",").filter(Boolean);
  const record = (id, run) => !requested?.length || requested.includes(id) ? audit.record(id, run) : Promise.resolve();
  const blocked = message => Object.assign(new Error(message), {
    auditStatus: "blocked"
  });
  await record("public-stock", async () => {
    await audit.seed();
    let result;
    try {
      result = await tool("stock_image", {
        query: "fern",
        count: 1,
        width: 120,
        height: 90
      }, 90000);
    } catch (error) {
      if (/agentStockUnavailable/.test(error.message)) throw blocked(error.message);
      throw error;
    }
    assert.equal(result.layerIds.length, 1);
    assert.equal(result.attributions.length, 1);
    assert.ok(result.attributions[0].source);
    assert.ok((await audit.pixels(result.layerIds[0])).painted > 0);
    await tool("undo");
    assert.equal(await page.evaluate(id => Boolean(window.__vooEditor.getNode(id)), result.layerIds[0]), false);
    return {
      source: result.source,
      warnings: result.warnings,
      publicSearch: true,
      downloadedPixels: true,
      attribution: true,
      undo: true
    };
  });
  let portraitId;
  await record("local-matting", async () => {
    await audit.seed();
    const id = await page.evaluate(async () => {
      const portrait = new Image();
      portrait.src = "/onboarding/cover.webp";
      await portrait.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 256;
      canvas.getContext("2d").drawImage(portrait, 0, 0, canvas.width, canvas.height);
      const engine = window.__vooEditor;
      const node = await engine.insertImage(canvas.toDataURL(), {
        x: 300,
        y: 200
      });
      engine.selectExactly([node.id]);
      return node.id;
    });
    portraitId = id;
    const before = await audit.pixels(id);
    await page.getByTestId("editor-taskbar-ai-remove-bg").click();
    const dialog = page.getByRole("dialog", {
      name: "Download cutout model?",
      exact: true
    });
    await dialog.waitFor();
    await dialog.getByRole("button", {
      name: "Download",
      exact: true
    }).click();
    await page.waitForFunction(id => Boolean(window.__vooEditor.getNode(id)?.maskId), id, {
      timeout: 240000
    });
    await dialog.waitFor({
      state: "detached",
      timeout: 10000
    });
    const after = await audit.pixels(id);
    assert.notDeepEqual(after, before);
    assert.ok(after.painted < before.painted, "Inference must remove actual background pixels");
    await tool("undo");
    assert.deepEqual(await audit.pixels(id), before);
    const backend = await page.evaluate(async () => {
      const module = await import("/src/canvas/editor/local_matting.js");
      return module.describeBackend();
    });
    return {
      actualWeights: true,
      backend,
      before,
      after,
      undo: true
    };
  });
  await record("object-select-inference", async () => {
    const node = await page.evaluate(id => window.__vooEditor.getNode(id), portraitId);
    await page.evaluate(id => {
      window.__vooEditor.selectExactly([id]);
      window.__vooEditor.setTool("ai_select");
    }, portraitId);
    await audit.drag({
      x: node.x + 96,
      y: node.y + 55
    }, {
      x: node.x + 105,
      y: node.y + 170
    });
    await page.waitForFunction(() => window.__vooEditor.getPixelSelection()?.contours?.length > 0, null, {
      timeout: 120000
    });
    assert.equal(await page.evaluate(() => window.__vooEditor.getPixelSelection().nodeId), node.id);
    return {
      cachedModelInference: true,
      pointerSelection: true
    };
  });
  await record("ai-repair-inference", async () => {
    const node = await audit.seed();
    const before = await audit.pixels(node.id);
    const previous = await page.evaluate(id => window.__vooEditor.getNode(id).imageId, node.id);
    await page.evaluate(() => {
      const engine = window.__vooEditor;
      engine.setTool("healing");
      engine.setHealingMode("aiRepair");
      engine.setBrushWidth(18);
      engine.setBrushOpacity(1);
      engine.setBrushFlow(1);
    });
    await audit.drag({
      x: node.x + 42,
      y: node.y + 30
    }, {
      x: node.x + 70,
      y: node.y + 65
    });
    await page.evaluate(() => {
      const engine = window.__vooEditor;
      const resume = engine.downloadAiRepairModel;
      engine.downloadAiRepairModel = async (...args) => {
        const result = await resume(...args);
        window.__auditRepairResume = {
          result,
          phase: engine.getAiRepairDownload()?.phase,
          selection: engine.getPixelSelection()?.nodeId,
          nodes: engine.getDocument().nodes.map(node => node.id)
        };
        return result;
      };
    });
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", {
      name: "Download",
      exact: true
    }).click({
      timeout: 15000
    });
    await page.waitForFunction(({
      id,
      previous
    }) => window.__vooEditor.getNode(id)?.imageId !== previous, {
      id: node.id,
      previous
    }, {
      timeout: 240000
    }).catch(async error => {
      throw new Error(`${error.message}; resume=${JSON.stringify(await page.evaluate(() => window.__auditRepairResume ?? {
        phase: window.__vooEditor.getAiRepairDownload()?.phase
      }))}`);
    });
    assert.notDeepEqual(await audit.pixels(node.id), before);
    await tool("undo");
    assert.deepEqual(await audit.pixels(node.id), before);
    return {
      realPointer: true,
      actualWeights: true,
      pixels: true,
      undo: true
    };
  });
  for (const modelId of ["realesrgan-compact-2x", "realesrgan-compact-4x", "realesrgan-anime-4x"]) {
    await record(`upscale-${modelId}`, async () => {
      await audit.seed();
      return page.evaluate(async modelId => {
        const {
          runLocalUpscale
        } = await import("/src/canvas/editor/local_upscale.js");
        const source = document.createElement("canvas");
        source.width = 32;
        source.height = 32;
        const context = source.getContext("2d");
        context.fillStyle = "#00aaff";
        context.fillRect(0, 0, 32, 32);
        context.fillStyle = "#ffffff";
        context.fillRect(8, 8, 16, 16);
        const phases = [];
        const blob = await runLocalUpscale(source, {
          modelId,
          scale: modelId.includes("4x") ? 4 : 2,
          onProgress: value => phases.push(value.phase)
        });
        const bitmap = await createImageBitmap(blob);
        try {
          if (phases.includes("fallback")) throw new Error(`${modelId}: model unavailable; canvas interpolation is not AI inference`);
          const expected = modelId.includes("4x") ? 128 : 64;
          if (bitmap.width !== expected || bitmap.height !== expected) throw new Error(`Incorrect upscale size ${bitmap.width}x${bitmap.height}`);
          return {
            actualWeights: true,
            width: bitmap.width,
            height: bitmap.height,
            phases: [...new Set(phases)]
          };
        } finally {
          bitmap.close();
        }
      }, modelId);
    });
  }
  await record("browser-model-offline-cache", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../vendor/client-models/manifest.json", import.meta.url), "utf8"));
    await page.context().setOffline(true);
    try {
      const loaded = await page.evaluate(async models => {
        const {
          loadModelAssetBytes
        } = await import("/src/canvas/editor/model_asset_loader.js");
        const result = [];
        for (const model of models) {
          const phases = [];
          const bytes = await loadModelAssetBytes({
            filename: model.file,
            onProgress: update => phases.push(update.phase)
          });
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
          if (!phases.includes("cached") || sha256 !== model.sha256) throw new Error(`Offline cache mismatch: ${model.file}`);
          result.push({
            file: model.file,
            bytes: bytes.byteLength,
            sha256,
            cached: true
          });
        }
        return result;
      }, manifest.models);
      return {
        networkOffline: true,
        loaded
      };
    } finally {
      await page.context().setOffline(false);
    }
  });
  await writeFile(`${process.env.VOO_IMAGE_AUDIT_DIR ?? "/private/tmp/voo-image-complete"}/network-diagnostics.json`, JSON.stringify(await page.locator("body").innerText(), null, 2));
  assert.ok(audit.results.length > 0, "At least one network scenario must execute");
  if (!requested?.length) assert.equal(audit.results.length, 8);
  audit.finish();
});
