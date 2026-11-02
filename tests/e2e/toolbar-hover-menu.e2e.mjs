import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const checks = [];
const settle = page => page.evaluate(() => new Promise(resolve =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));
const list = (page, id) => page.getByTestId(`editor-${id}-menu-list`);

await withEditorBrowser(async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.__vooEditor;
    editor.setDoc({ ...editor.getDocument(), isCanvasRoot: true, nodes: [
      { id: "hover-rect", kind: "rect", x: 100, y: 100, width: 80, height: 80, fill: "#ff0000", visible: true, opacity: 1 },
    ] });
    editor.setTool("select");
    editor.selectExactly([]);
  });
  await settle(page);

  // Resting on a tool opens its menu without any click.
  for (const id of ["eraser", "healing", "select"]) {
    const root = page.getByTestId(`editor-${id}-menu`);
    await root.hover();
    await list(page, id).waitFor({ state: "visible", timeout: 3000 });
    await page.mouse.move(700, 600);
    await list(page, id).waitFor({ state: "hidden", timeout: 3000 });
  }
  checks.push("Hovering Select, Healing and Eraser opens and then closes their menus without a click");

  // The Eraser menu lists the tool and Remove Background.
  await page.getByTestId("editor-eraser-menu").hover();
  await list(page, "eraser").waitFor();
  assert.equal(await page.getByTestId("editor-eraser-menu-eraser").count(), 1);
  assert.equal(await page.getByTestId("editor-eraser-menu-removeBackground").count(), 1);
  checks.push("Eraser menu offers Eraser and Remove Background");

  // The menu is reachable across the gap below the button, and the tool button still selects.
  const menuBox = await list(page, "eraser").boundingBox();
  await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2, { steps: 8 });
  await settle(page);
  assert.ok(await list(page, "eraser").isVisible(), "menu stays open while the pointer is on it");
  await page.getByTestId("editor-eraser-menu-eraser").click();
  await settle(page);
  assert.equal(await page.getByTestId("editor-eraser-menu").getByRole("button").first().getAttribute("aria-pressed"), "true");
  assert.equal(await list(page, "eraser").count(), 0, "choosing an item closes the menu");
  checks.push("Menu is reachable by hover and choosing Eraser activates the tool");

  // Remove Background with nothing selected is a safe no-op.
  const before = await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument()));
  await page.getByTestId("editor-eraser-menu").hover();
  await list(page, "eraser").waitFor();
  await page.getByTestId("editor-eraser-menu-removeBackground").click();
  await settle(page);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__vooEditor.getDocument())), before);
  checks.push("Remove Background without a layer leaves the document unchanged");

  // The chevron still opens a pinned menu that survives mouse leave.
  await page.mouse.move(700, 600);
  await settle(page);
  await page.getByTestId("editor-brush-menu-trigger").click();
  await list(page, "brush").waitFor();
  await page.mouse.move(700, 650);
  await page.waitForTimeout(500);
  assert.ok(await list(page, "brush").isVisible(), "a clicked menu stays open after the pointer leaves");
  await page.keyboard.press("Escape");
  await list(page, "brush").waitFor({ state: "hidden" });
  checks.push("Chevron click pins the menu until Escape");
});
console.log(JSON.stringify({ passed: checks }, null, 2));
