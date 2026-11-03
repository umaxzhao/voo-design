import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const TARGET_NAME = "UF23 Target";
export const POINTS = [{ x: 202, y: 216 }, { x: 290, y: 216 }, { x: 378, y: 216 }];
export const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Setup only: every audited paint/component/export/import operation uses UI input. */
export async function seedFixture(page) {
  await page.evaluate(async () => {
    const e = window.__vooEditor;
    const fill = "linear-gradient(135deg, #ff0000 0%, #0000ff 100%) /* voo-gradient-line: 20% 20% 80% 80% */";
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff", nodes: [{
      id: "uf23-target", name: "UF23 Target", kind: "rect", x: 180, y: 120, width: 220, height: 160,
      fill, fills: [{ fill, opacity: 1, visible: true }], visible: true, opacity: 1,
    }] });
    e.selectExactly(["uf23-target"]); e.setTool("select");
    if (e.getSnappingEnabled()) e.toggleSnapping();
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 260, panY: 100 }, pendingArtboardFitId: null });
  });
  await settle(page);
}

/** Read the focused engine, rather than the debug pointer of a retained master. */
export const observe = (page) => page.evaluate(async () => {
  const { useDesignStore } = await import("/src/store/design_store.js");
  const id = useDesignStore.getState().editingNodeId;
  const e = window.__vooEditors?.[id] ?? window.__vooEditor;
  if (!e) throw new Error("No active editor to observe");
  return { id, doc: e.getDocument(), selection: e.getSelectedIds(),
    editors: Object.fromEntries(Object.entries(window.__vooEditors ?? {}).map(([key, engine]) => [key, engine.getDocument()])) };
});

export const client = (page, point) => page.evaluate(async (point) => {
  const { useDesignStore } = await import("/src/store/design_store.js");
  const id = useDesignStore.getState().editingNodeId;
  const board = [...document.querySelectorAll("[data-editor-artboard]")].find((element) => element.getAttribute("data-node-id") === id);
  if (!board) throw new Error(`No active artboard: ${id}`);
  const r = board.getBoundingClientRect();
  const doc = (window.__vooEditors[id] ?? window.__vooEditor).getDocument();
  return { x: r.left + point.x * r.width / doc.width, y: r.top + point.y * r.height / doc.height };
}, point);

export async function drag(page, from, to) {
  const start = await client(page, from), end = await client(page, to);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up(); await settle(page);
  return { start, end };
}

/** Pixel observations come from browser screenshots, including the actual rendered canvas. */
export async function screenPixels(page, points = POINTS) {
  const values = [];
  for (const point of points) {
    const at = await client(page, point);
    const bytes = await page.screenshot({ clip: { x: Math.floor(at.x), y: Math.floor(at.y), width: 1, height: 1 } });
    values.push(await page.evaluate(async (base64) => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      return [...context.getImageData(0, 0, 1, 1).data];
    }, bytes.toString("base64")));
  }
  return values;
}

export function pixelsMatch(actual, expected, tolerance = 3) {
  assert.equal(actual.length, expected.length);
  actual.forEach((pixel, index) => pixel.forEach((value, channel) => {
    assert.ok(Math.abs(value - expected[index][channel]) <= tolerance,
      `Pixel ${index}/${channel}: ${value} versus ${expected[index][channel]}`);
  }));
}

export async function command(page, text, pattern) {
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette");
  await palette.getByRole("combobox").fill(text);
  await palette.getByRole("option").filter({ hasText: pattern }).click();
}

export async function exportThroughUi(page, out, phase, format) {
  await command(page, "Export", /^Export$/);
  const dialog = page.getByTestId("design-export-dialog"); await dialog.waitFor();
  await dialog.getByRole("button", { name: new RegExp(`^${format === "fig" ? "Figma" : "SVG"}(?: |$)`) }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export", exact: true }).click()]);
  const path = `${out}/${phase}.${format}`; await download.saveAs(path); const bytes = await readFile(path);
  assert.ok(bytes.length > 100);
  if (await dialog.count()) await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await settle(page);
  return { path, name: download.suggestedFilename(), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function importThroughUi(page, artifact) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"),
    page.getByTestId("editor-top-bar").getByRole("button", { name: /^Import project file/ }).click()]);
  await chooser.setFiles({ name: artifact.path.split("/").pop(), mimeType: artifact.path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream", buffer: await readFile(artifact.path) });
  await page.getByTestId("loading-modal").waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
  await settle(page);
}

export async function saveThroughUi(page, out) {
  await page.keyboard.press("Control+k"); const palette = page.getByTestId("command-palette");
  await palette.getByRole("combobox").fill("portable .zip snapshot");
  const [download] = await Promise.all([page.waitForEvent("download"), palette.getByRole("option").filter({ hasText: /portable \.zip snapshot/i }).click()]);
  const path = `${out}/uf23-ui-chain.zip`; await download.saveAs(path); const bytes = await readFile(path);
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function attachInputRecorder(page) {
  await page.evaluate(() => {
    window.__uf23InputEvents = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "click", "keydown"]) document.addEventListener(type, (event) => {
      window.__uf23InputEvents.push({ type, x: event.clientX, y: event.clientY, key: event.key, trusted: event.isTrusted,
        label: event.target.closest?.("[aria-label]")?.getAttribute("aria-label"), testid: event.target.closest?.("[data-testid]")?.getAttribute("data-testid") });
    }, true);
  });
}

export async function persistObservation(page, out, phase, detail = {}) {
  const value = { ...detail, observation: await observe(page), inputEvents: await page.evaluate(() => window.__uf23InputEvents?.splice(0) ?? []) };
  await writeFile(`${out}/${phase}.json`, JSON.stringify(value, null, 2));
  await page.screenshot({ path: `${out}/${phase}.png` });
  return value;
}
