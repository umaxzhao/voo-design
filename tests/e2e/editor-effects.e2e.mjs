import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  const checks = [];
  const textEffects = await page.evaluate(async () => {
    const { verifySkiaTextEffects } = await import("/tests/e2e/skia-text-effects.mjs");
    return verifySkiaTextEffects();
  });
  assert.deepEqual(textEffects, { normalRun: true, italicRun: true, pixelsDiffer: true });
  checks.push("actual GPU text italic input and pixel change");
  const seed = async () => {
    await page.evaluate(() => {
      const editor = window.__vooEditor;
      editor.setDoc({ ...editor.getDocument(), width: 600, height: 400, backgroundColor: "#171717", nodes: [
        { id: "pinned", kind: "rect", name: "Pinned", x: 480, y: 300, width: 60, height: 40, fill: "#ff0000",
          constraints: { horizontal: "right", vertical: "bottom" } },
      ] });
      editor.selectExactly([]);
      editor.setTool("select");
      editor.zoomToFit();
      const viewport = editor.getViewport();
      editor.setViewport({ ...viewport, zoom: viewport.zoom * 0.5 });
    });
    await page.waitForTimeout(300);
  };
  const node = () => page.evaluate(() => window.__vooEditor.getDocument().nodes.find((item) => item.id === "pinned"));
  await seed();
  for (const edge of ["right", "bottom", "left", "top"]) {
    const before = await page.evaluate(() => ({ ...window.__vooEditor.getDocument(), zoom: window.__vooEditor.getZoom() }));
    const grip = page.locator(`[data-editor-resize-edge="${edge}"]`).first();
    await grip.waitFor({ state: "visible" });
    const box = await grip.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    assert.ok(await grip.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), { x, y }), `${edge} grip must be reachable at ${x},${y}: ${await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 350), { x, y })}`);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (edge === "left" ? -35 : edge === "right" ? 35 : 0),
      y + (edge === "top" ? -25 : edge === "bottom" ? 25 : 0), { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__vooEditor.getDocument());
    const child = await node();
    assert.ok(after.width !== before.width || after.height !== before.height, `${edge} pointer must resize page`);
    assert.equal(child.x, 480 + after.width - 600);
    assert.equal(child.y, 300 + after.height - 400);
    await tool("undo");
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().width), before.width);
    assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().height), before.height);
    assert.deepEqual(await node(), before.nodes.find((item) => item.id === "pinned"));
    await tool("redo");
    assert.deepEqual(await node(), child);
    checks.push(`pointer ${edge} edge + single-step undo/redo`);
  }
  await seed();
  await page.waitForFunction(() => document.querySelector('input[aria-label="W"]')?.value === "600");
  await page.locator('input[aria-label="W"]').fill("800");
  await page.locator('input[aria-label="W"]').press("Enter");
  await page.waitForFunction(() => window.__vooEditor.getDocument().width === 800);
  assert.equal((await node()).x, 680, "panel must reflow once, not twice");
  await tool("undo");
  assert.equal((await node()).x, 480);
  checks.push("actual frame panel width + one undo");
  await page.getByRole("button", { name: /^(Canvas size|画布尺寸)$/ }).click();
  await page.getByRole("button", { name: /393×852/ }).click();
  await page.waitForFunction(() => window.__vooEditor.getDocument().width === 393);
  assert.equal((await node()).x, 273);
  assert.equal((await node()).y, 752);
  await tool("undo");
  assert.equal((await node()).x, 480);
  checks.push("actual canvas preset + one undo");
  await tool("set_constraints", { layerIds: ["pinned"], horizontal: "right", vertical: "bottom" });
  await page.evaluate(() => window.__vooEditor.setDocumentSize(800, 500));
  assert.equal((await node()).x, 680);
  assert.equal((await node()).y, 400);
  checks.push("MCP constraint write + exact-size engine resize");
  await page.evaluate(() => window.__vooEditor.selectExactly(["pinned"]));
  await page.waitForFunction(() => document.querySelector('input[aria-label="W"]')?.value === "60");
  await page.locator('input[aria-label="W"]').fill("90");
  await page.locator('input[aria-label="W"]').press("Enter");
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.find((item) => item.id === "pinned")?.width === 90);
  assert.equal((await node()).width, 90);
  checks.push("actual right-panel width input");
  await tool("mutate_layer_style", { layerId: "pinned", patch: { fill: "#3366ff", opacity: 0.5, cornerRadius: 12 } });
  const styled = await node();
  assert.equal(styled.opacity, 0.5);
  assert.equal(styled.cornerRadius, 12);
  checks.push("MCP style mutation persisted on real editor");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
