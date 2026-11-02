import assert from "node:assert/strict";
import { imageAudit } from "./image-audit-fixture.mjs";

/** Observe the actual module worker without replacing its work or its results. */
export async function installBackgroundWorkerProbe(page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const probe = window.__backgroundWorkerProbe = { started: 0, requests: [], results: [], terminated: 0 };
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.audited = String(url).includes("voo-background-worker");
        if (this.audited) {
          probe.started++;
          this.addEventListener("message", ({ data }) => probe.results.push({ id: data.id, type: data.type }));
        }
      }
      postMessage(message, transfer) {
        if (this.audited) probe.requests.push({ id: message.id, operation: message.operation,
          x: message.file?.document?.nodes?.find(node => node.id === "background-edit")?.x });
        return super.postMessage(message, transfer);
      }
      terminate() {
        if (this.audited) probe.terminated++;
        return super.terminate();
      }
    };
  });
}

/** Live decoded cover, real encoding worker and overlapping edit snapshots. */
export async function verifyBackgroundDraft({ page }) {
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    // Keep the editor's automatic draft timer out of this explicit-save probe.
    useDesignStore.setState({ filePath: "memory://background-draft-audit.voo" });
  });
  await imageAudit(page, "background-draft").seed();
  await page.evaluate(async () => {
    const { createGroupNode, createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const engine = window.__vooEditor;
    const image = engine.getDocument().nodes.find(node => node.kind === "image");
    const frame = { ...createGroupNode({ x: 0, y: 0, width: 800, height: 600 }),
      id: "background-frame", isFrame: true, clipContent: true, fill: "#ffffff" };
    const shapes = Array.from({ length: 1200 }, (_, i) => ({
      ...createRectNode({ x: i % 40 * 20, y: Math.floor(i / 40) * 20, width: 14, height: 14,
        fill: i % 2 ? "#128855" : "#663399" }),
      id: i === 0 ? "background-edit" : `background-${i}`, parentId: frame.id,
    }));
    engine.setDoc({ ...engine.getDocument(), isCanvasRoot: true, width: 800, height: 600,
      nodes: [frame, ...shapes, { ...image, x: 300, y: 200, parentId: frame.id }] });
    engine.selectExactly(["background-edit"]);
    engine.updateNode("background-edit", { x: 7 });
    window.__backgroundAssetId = image.imageId;
  });
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-artwork-fallback"]')?.dataset.artworkState === "exact");
  const first = await page.evaluate(async () => {
    const { addRecentFile } = await import("/src/canvas/store/recent_files.js");
    const { writeDraftSnapshot } = await import("/src/canvas/store/draft_autosave.js");
    const { loadDraftBytes } = await import("/src/canvas/store/draft_store.js");
    const { decodeVooBinary, encodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const { getImageDataUrl } = await import("/src/canvas/store/db.js");
    const engine = window.__vooEditor, doc = engine.getDocument();
    const before = engine.serialise(), dirty = engine.isDirty();
    const artwork = document.querySelector('[data-testid="editor-artwork-fallback"]');
    const backing = [artwork.width, artwork.height], passes = [];
    const artworkPixels = async () => {
      const bytes = artwork.getContext("2d").getImageData(0, 0, artwork.width, artwork.height).data;
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return { sha256: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join(""),
        bytes: bytes.byteLength, painted: bytes.some((value, index) => index % 4 === 3 && value > 0) };
    };
    const pixelsBefore = await artworkPixels();
    const renderLayerPass = engine.renderLayerPass;
    engine.renderLayerPass = (target, ids, surface) => {
      const result = renderLayerPass(target, ids, surface);
      if (!target.isConnected) passes.push({ target, width: target.width, height: target.height, dpr: surface?.dpr });
      return result;
    };
    const entry = addRecentFile({ name: "BackgroundWorker.voo", isDraft: true });
    const extra = { ...before, nodes: [{ ...before.nodes.find(node => node.id === "background-edit"),
      id: "background-second-page", parentId: null }] };
    const store = { filePath: null, fileName: entry.name,
      nodes: [{ id: "background-live", data: { label: "Live" } },
        { id: "background-snapshot", data: { label: "Snapshot" } }], editingNodeId: "background-live",
      canvasBackgroundColor: "#525252", editorCamera: { zoom: .8, panX: 20, panY: 30 },
      editorArtboardLayouts: { "background-live": { x: -100, y: 50 } } };
    const enginesRef = { current: new Map([["background-live", { ready: true, engine }]]) };
    const snapshotsRef = { current: new Map([["background-snapshot", { doc: extra }]]) };
    window.__backgroundDraftInput = { store, enginesRef, snapshotsRef, entry };
    let saved;
    try { saved = await writeDraftSnapshot({ store, enginesRef, snapshotsRef }); }
    finally { engine.renderLayerPass = renderLayerPass; }
    const row = await loadDraftBytes(entry.id), file = decodeVooBinary(row.bytes);
    const canonical = encodeVooBinary(file);
    const unchanged = engine.getDocument() === doc && engine.isDirty() === dirty &&
      JSON.stringify(engine.serialise()) === JSON.stringify(before);
    const coverPasses = passes.filter(pass => pass.width > 0 && pass.height > 0 && pass.width <= 512 && pass.height <= 512);
    return { saved, unchanged, selected: engine.getSelectedIds(),
      pageIds: file.document.pages.map(item => item.id),
      liveEqual: JSON.stringify(file.document.pages[0].sceneDoc) === JSON.stringify(before),
      snapshotEqual: JSON.stringify(file.document.pages[1].sceneDoc) === JSON.stringify(extra),
      assetEqual: file.assets[window.__backgroundAssetId] === await getImageDataUrl(window.__backgroundAssetId),
      canonicalEqual: canonical.length === row.bytes.length && canonical.every((byte, i) => byte === row.bytes[i]),
      coverPasses: coverPasses.map(({ width, height, dpr }) => ({ width, height, dpr })),
      coverReleased: coverPasses.every(({ target }) => target.width === 0 && target.height === 0),
      artworkUnchanged: artwork.width === backing[0] && artwork.height === backing[1],
      pixelsBefore, pixelsAfter: await artworkPixels(),
      preview: file.preview, operations: window.__backgroundWorkerProbe.requests.map(item => item.operation),
      results: window.__backgroundWorkerProbe.results.map(item => item.type), started: window.__backgroundWorkerProbe.started };
  });
  assert.equal(first.saved, true);
  assert.equal(first.unchanged, true, "Background packaging must preserve the live document and dirty/history state");
  assert.deepEqual(first.selected, ["background-edit"]);
  assert.deepEqual(first.pageIds, ["background-live", "background-snapshot"]);
  assert.equal(first.liveEqual && first.snapshotEqual && first.assetEqual && first.canonicalEqual, true);
  assert.ok(first.preview.startsWith("data:image/png"));
  assert.deepEqual(first.operations, ["encode"]);
  assert.deepEqual(first.results, ["result"]);
  assert.equal(first.started, 1, "Encoding must use one actual bounded module worker");
  assert.equal(first.coverPasses.length, 1, "The cover must render into one dedicated thumbnail surface");
  assert.equal(first.coverPasses[0].dpr, 1);
  assert.equal(first.coverReleased && first.artworkUnchanged, true, "Thumbnail capture must release its bitmap and preserve editing dimensions");
  assert.ok(first.pixelsBefore.bytes > 0 && first.pixelsBefore.painted, "The authoritative pixel baseline must contain actual artwork");
  assert.deepEqual(first.pixelsAfter, first.pixelsBefore, "Live cover capture must preserve every authoritative RGBA byte");
  const cover = await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    return { width: image.width, height: image.height,
      painted: context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, i) => i % 4 === 3 && value > 0) };
  }, first.preview);
  assert.ok(cover.width <= 512 && cover.height <= 512 && cover.painted);

  const race = await page.evaluate(async () => {
    const { writeDraftSnapshot } = await import("/src/canvas/store/draft_autosave.js");
    const { loadDraftBytes } = await import("/src/canvas/store/draft_store.js");
    const { decodeVooBinary } = await import("/src/canvas/store/voo_binary.js");
    const { entry, ...input } = window.__backgroundDraftInput;
    const engine = window.__vooEditor;
    engine.updateNode("background-edit", { x: 19 });
    const older = writeDraftSnapshot(input);
    engine.updateNode("background-edit", { x: 31 });
    const doc = engine.getDocument(), expected = JSON.stringify(engine.serialise());
    const newer = writeDraftSnapshot(input);
    const saved = await Promise.all([older, newer]);
    const file = decodeVooBinary((await loadDraftBytes(entry.id)).bytes);
    const stored = file.document.pages.find(item => item.id === "background-live").sceneDoc;
    const unchanged = engine.getDocument() === doc && JSON.stringify(engine.serialise()) === expected;
    await engine.undo(); const undo = engine.getNode("background-edit").x;
    await engine.redo(); const redo = engine.getNode("background-edit").x;
    return { saved, newestRetained: JSON.stringify(stored) === expected, unchanged, undo, redo,
      selected: engine.getSelectedIds(),
      encodedPositions: window.__backgroundWorkerProbe.requests.filter(item => item.operation === "encode").map(item => item.x) };
  });
  assert.deepEqual(race.saved, [true, true]);
  assert.equal(race.newestRetained && race.unchanged, true, "An older worker result must never replace the newer draft");
  assert.deepEqual([race.undo, race.redo], [19, 31]);
  assert.deepEqual(race.selected, ["background-edit"]);
  assert.deepEqual(race.encodedPositions, [7, 19, 31]);
  console.log("Live thumbnail and real encoding worker: released bounded PNG cover, canonical pages/assets/bytes, overlapping drafts and untouched edit undo/redo passed.");
}
