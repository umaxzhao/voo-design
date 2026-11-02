import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const SWITCH_SETTLE_MS = 5000;

/** Polls a switch's aria-checked until React has re-rendered it to the expected value. */
async function waitForSwitch(locator, expected, page) {
  const deadline = Date.now() + SWITCH_SETTLE_MS;
  while (Date.now() < deadline) {
    if ((await locator.getAttribute("aria-checked")) === expected) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`switch did not settle to aria-checked=${expected} within ${SWITCH_SETTLE_MS}ms`);
}

// UF25 through the real property panel: Exposure field, Protect tones switch and
// Tonal range radios are set by the user's controls. Engine getters only read state.
await withEditorBrowser(async ({ page, tool, errors }) => {
  const reset = () => page.evaluate(async () => {
    const e = window.__vooEditor;
    e.endMaskEdit(); e.setTool("select"); e.selectExactly([]);
    e.setDoc({ ...e.getDocument(), width: 600, height: 400, isCanvasRoot: false, backgroundColor: "#ffffff", nodes: [] });
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.setState({ editorCamera: { zoom: 1, panX: 300, panY: 100 } });
    e.setBrushMode("normal"); e.setBrushWidth(24); e.setBrushOpacity(1); e.setBrushFlow(1);
    e.setBrushStrength(1); e.setPressureSize(false); e.setPressureOpacity(false); e.setBrushSmoothing(0);
  });
  const client = (point) => page.evaluate(async (point) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = document.querySelector("[data-editor-artboard]").getBoundingClientRect();
    const doc = window.__vooEditor.getDocument();
    return { x: rect.left + point.x * rect.width / doc.width, y: rect.top + point.y * rect.height / doc.height };
  }, point);
  const stroke = async (from, to) => {
    const a = await client(from), b = await client(to);
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 200), a);
    assert.ok(!hit?.startsWith("<button") && !hit?.startsWith("<input"), `canvas point blocked by ${hit}`);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 }); await page.mouse.up();
    await page.evaluate(() => window.__vooEditor.flushPaints());
  };
  const seedImage = async () => {
    await reset();
    return page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 100; c.height = 100;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#807050"; ctx.fillRect(0, 0, 100, 100);
      for (let y = 0; y < 100; y += 4) for (let x = 0; x < 100; x += 4) {
        ctx.fillStyle = (x + y) % 8 ? "#c04030" : "#405080"; ctx.fillRect(x, y, 4, 4);
      }
      // Near-white patch under the stroke: the pre-fix protect clamp pulled channels above 235 down to 235 at zero exposure.
      ctx.fillStyle = "#f8f8f8"; ctx.fillRect(0, 0, 40, 40);
      const e = window.__vooEditor;
      const n = await e.insertImage(c.toDataURL(), { x: 150, y: 150 });
      e.selectExactly([n.id]);
      return n.id;
    });
  };
  const pixels = (id) => page.evaluate(async (id) => {
    const result = window.__vooEditor.exportSelectionPng([id]);
    const src = typeof result === "string" ? result : result.dataUrl;
    const image = new Image(); image.src = src; await image.decode();
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d"); ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  }, id);

  const id = await seedImage();
  // Select Dodge through the brush family menu, as a user would.
  await page.getByTestId("editor-brush-menu-trigger").click();
  await page.getByTestId("editor-brush-menu-dodge").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-brush-tool"]')?.getAttribute("aria-pressed") === "true");
  // Dodge-only controls appear in the panel only when the Dodge tool is active.
  const protect = page.getByRole("switch", { name: /Protect|保护/ }).first();
  assert.equal(await protect.count(), 1, "Dodge panel shows the Protect tones switch");

  // Protect tones switch: real control, read back from the engine.
  if ((await protect.getAttribute("aria-checked")) !== "true") await protect.click();
  assert.equal(await protect.getAttribute("aria-checked"), "true", "Protect tones switch turns on");
  assert.equal(await page.evaluate(() => window.__vooEditor.getBrushProtectLuminosity()), true, "engine reflects Protect tones");

  // Tonal range radio: Highlights.
  await page.getByRole("radio", { name: /Highlights|高光/ }).first().click();
  assert.equal(await page.evaluate(() => window.__vooEditor.getBrushTonalRange()), "highlights", "Highlights radio applies");

  // Exposure field: type 0 into the real numeric field and commit with Enter.
  const exposure = page.getByLabel(/^(Exposure|曝光)$/).first();
  await exposure.click();
  await exposure.fill("0");
  await exposure.press("Enter");
  assert.equal(await page.evaluate(() => window.__vooEditor.getBrushExposure()), 0, "Exposure field at 0 reaches the engine");

  const before = await pixels(id);
  await stroke({ x: 140, y: 140 }, { x: 165, y: 165 });
  assert.deepEqual(await pixels(id), before, "UF25 panel: zero exposure + Protect tones changes no RGBA byte");

  // Positive exposure through the same field.
  await exposure.click();
  await exposure.fill("100");
  await exposure.press("Enter");
  assert.equal(await page.evaluate(() => window.__vooEditor.getBrushExposure()), 1, "Exposure field at 100 reaches the engine");
  await stroke({ x: 140, y: 140 }, { x: 165, y: 165 });
  const lifted = await pixels(id);
  assert.notDeepEqual(lifted, before, "UF25 panel: positive exposure + Protect tones changes pixels");

  // Protect tones switch off reaches the engine too (checked before any Undo/Redo).
  // React re-renders after the click, so wait for the switch to settle instead of reading it immediately.
  await protect.click();
  await waitForSwitch(protect, "false", page);
  assert.equal(await protect.getAttribute("aria-checked"), "false", "Protect tones switch turns off");
  assert.equal(await page.evaluate(() => window.__vooEditor.getBrushProtectLuminosity()), false, "engine reflects Protect tones off");

  // One Undo restores the pre-stroke pixels; one Redo restores the lifted ones.
  await tool("undo");
  assert.deepEqual(await pixels(id), before, "UF25 panel: one Undo restores pre-dodge pixels");
  await tool("redo");
  assert.deepEqual(await pixels(id), lifted, "UF25 panel: one Redo restores dodged pixels");

  assert.deepEqual(errors, [], `unexpected page errors: ${errors.join("\n")}`);
  console.log("dodge-burn-panel-controls e2e: pass");
}, { openDocument: true, mcpLink: true });
