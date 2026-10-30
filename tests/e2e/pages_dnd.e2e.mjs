import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const pageState = page => page.evaluate(async () => {
  const { useDesignStore } = await import("/src/store/design_store.js");
  const state = useDesignStore.getState();
  return { labels: state.nodes.map(node => node.data.label), focus: state.editingNodeId, dirty: state.isDirty };
});
async function seedPages(page, count = 4) {
  await page.evaluate(async count => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const state = useDesignStore.getState();
    state.renameEditorPage(state.nodes[0].id, "Cover");
    for (let index = 1; index < count; index++) state.addEditorPage({ label: `Page ${index}` });
  }, count);
  await settle(page);
  const switcher = page.getByTestId("page-switcher");
  await switcher.locator(":scope > button").click();
  return switcher;
}
const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const targetHit = locator => locator.evaluate(button => {
  const box = button.getBoundingClientRect();
  return { width: box.width, height: box.height, matches: [-22, 0, 22].flatMap(y => [-22, 0, 22].map(x =>
    document.elementFromPoint(box.x + box.width / 2 + x, box.y + box.height / 2 + y)?.closest("button") === button)) };
});

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const switcher = await seedPages(page);
  const input = switcher.locator("input");
  await switcher.getByRole("button", { name: "Page 1", exact: true }).dblclick();
  await input.fill("  Details  "); await input.press("Enter");
  assert.equal((await pageState(page)).labels[1], "Details");
  for (const [value, key] of [["Cancelled", "Escape"], ["   ", "Tab"]]) {
    await switcher.getByRole("button", { name: "Details", exact: true }).dblclick();
    await input.fill(value); await input.press(key);
    assert.equal((await pageState(page)).labels[1], "Details");
  }
  await switcher.getByRole("button", { name: "Details", exact: true }).dblclick();
  await input.fill("Details renamed"); await input.press("Tab");
  assert.equal((await pageState(page)).labels[1], "Details renamed");
  checks.push("real page rows retain Enter/blur rename, empty revert and Escape cancellation");

  const dragTo = async (sourceName, targetIndex) => {
    const source = center(await switcher.getByRole("button", { name: sourceName, exact: true }).boundingBox());
    const target = await switcher.locator("li").nth(targetIndex).boundingBox();
    await page.mouse.move(source.x, source.y); await page.mouse.down();
    await page.mouse.move(target.x + 40, target.y + 2, { steps: 8 });
    await switcher.getByTestId("page-drop-indicator").waitFor();
  };
  const focus = (await pageState(page)).focus;
  await dragTo("Page 3", 0); await page.mouse.up();
  assert.deepEqual((await pageState(page)).labels, ["Page 3", "Cover", "Details renamed", "Page 2"]);
  assert.equal((await pageState(page)).focus, focus);
  assert.equal((await pageState(page)).dirty, true);
  await switcher.getByRole("button", { name: "Page 2", exact: true }).click();
  assert.notEqual((await pageState(page)).focus, focus);
  checks.push("mouse reorder shows an insertion line, preserves focus and leaves later single-click selection intact");

  const beforeCancel = await pageState(page);
  await dragTo("Page 3", 2);
  await page.keyboard.press("Escape");
  await page.mouse.up(); await settle(page);
  assert.deepEqual(await pageState(page), beforeCancel, "closing the popup must cancel the in-flight reorder");
  checks.push("Escape closes an active drag without a late reorder");
  await switcher.locator(":scope > button").click();
  await dragTo("Page 3", 2);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 999, pointerType: "touch" })));
  assert.deepEqual(await pageState(page), beforeCancel, "another pointer cannot commit this mouse drag");
  await switcher.getByTestId("page-drop-indicator").waitFor();
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, pointerType: "mouse" })));
  await page.mouse.up(); await settle(page);
  assert.deepEqual(await pageState(page), beforeCancel);
  checks.push("pointer ownership rejects unrelated release and genuine cancellation never commits");

  const session = await page.context().newCDPSession(page);
  assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), false);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 12, right: 10, bottom: 8, left: 6 } });
  await settle(page);
  const padding = () => page.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".app-root-frame"));
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(parseFloat);
  });
  assert.deepEqual(await padding(), [16, 14, 12, 10], "safe-area protection does not depend on a coarse pointer");
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 0, bottom: 0, left: 0 } });
  await settle(page);
  assert.deepEqual(await padding(), [4, 4, 4, 4]);
  assert.equal(await page.getByTestId("editor-select-menu-trigger").getAttribute("aria-hidden"), null);
  await session.detach();
  checks.push("fine-pointer sessions retain nonzero safe-area padding while ordinary desktops keep the 4px fallback");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const switcher = await seedPages(page, 12);
  const session = await page.context().newCDPSession(page);
  const touch = (type, points = []) => session.send("Input.dispatchTouchEvent", {
    type, touchPoints: points.map(point => ({ ...point, radiusX: 1, radiusY: 1, force: 1 })),
  });
  const section = switcher.locator("section");
  const beforeSwipe = await pageState(page);
  const listBox = await section.boundingBox();
  await section.evaluate(element => {
    window.__pageScrollEnded = new Promise(resolve => element.addEventListener("scrollend", resolve, { once: true }));
  });
  const scrollStart = { id: 1, x: listBox.x + 80, y: listBox.y + listBox.height - 65 };
  await touch("touchStart", [scrollStart]);
  await touch("touchMove", [{ ...scrollStart, y: scrollStart.y - 100 }]);
  await touch("touchEnd");
  await page.waitForFunction(() => document.querySelector('[data-testid="page-switcher"] section').scrollTop > 0);
  assert.deepEqual(await pageState(page), beforeSwipe);
  assert.equal(await switcher.getByTestId("page-drop-indicator").count(), 0);
  await page.evaluate(async () => { await window.__pageScrollEnded; delete window.__pageScrollEnded; });
  checks.push("trusted quick touch swipes scroll the actual page list without reordering or changing focus");

  await section.evaluate(element => { element.scrollTop = 0; }); await settle(page);
  const first = center(await switcher.locator("li").first().boundingBox());
  const destination = await switcher.locator("li").nth(3).boundingBox();
  await touch("touchStart", [{ ...first, id: 2 }]);
  await page.waitForTimeout(280);
  await touch("touchMove", [{ id: 2, x: first.x, y: destination.y + destination.height - 2 }]);
  await switcher.getByTestId("page-drop-indicator").waitFor();
  await touch("touchEnd"); await settle(page);
  assert.deepEqual((await pageState(page)).labels.slice(0, 5), ["Page 1", "Page 2", "Page 3", "Cover", "Page 4"]);
  assert.equal((await pageState(page)).focus, beforeSwipe.focus);
  checks.push("trusted touch long-press reorder uses the insertion edge and suppresses accidental page selection");

  const beforeMultiple = await pageState(page);
  const one = { ...center(await switcher.locator("li").first().boundingBox()), id: 4 };
  await touch("touchStart", [one]); await page.waitForTimeout(280);
  const shifted = { ...one, y: one.y + 95 };
  await touch("touchMove", [shifted]);
  await switcher.getByTestId("page-drop-indicator").waitFor();
  const two = { ...shifted, id: 5, x: shifted.x + 12 };
  await touch("touchStart", [shifted, two]); await page.waitForTimeout(280);
  assert.equal(await switcher.getByTestId("page-drop-indicator").count(), 0);
  assert.equal(await switcher.locator("li.opacity-60").count(), 0, "a secondary touch cannot restart the hold timer");
  await touch("touchEnd"); await settle(page);
  assert.deepEqual(await pageState(page), beforeMultiple);
  checks.push("a second real touch cancels the move unit and cannot rearm a new drag on the same row");

  await touch("touchStart", [{ ...one, id: 6 }]); await page.waitForTimeout(280);
  await touch("touchMove", [{ ...shifted, id: 6 }]);
  await switcher.getByTestId("page-drop-indicator").waitFor();
  await touch("touchCancel"); await settle(page);
  assert.equal(await switcher.getByTestId("page-drop-indicator").count(), 0);
  assert.deepEqual(await pageState(page), beforeMultiple);
  checks.push("real touch cancellation clears the insertion state without committing the pending order");

  const beforeUnmount = await pageState(page);
  const next = center(await switcher.locator("li").first().boundingBox());
  await touch("touchStart", [{ ...next, id: 3 }]); await page.waitForTimeout(280);
  await touch("touchMove", [{ id: 3, x: next.x, y: next.y + 95 }]);
  await switcher.getByTestId("page-drop-indicator").waitFor();
  await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().setWelcomeOpen(true));
  await switcher.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true }))), true);
  await touch("touchEnd"); await settle(page);
  assert.deepEqual(await pageState(page), beforeUnmount);
  await page.evaluate(async () => (await import("/src/store/design_store.js")).useDesignStore.getState().setWelcomeOpen(false));
  await switcher.waitFor();
  checks.push("unmounting the popup removes global drag/scroll listeners and cannot commit a late drop");

  const padding = () => page.evaluate(() => {
    const root = document.querySelector(".app-root-frame");
    const style = getComputedStyle(root);
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(parseFloat);
  });
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 20, right: 8, bottom: 16, left: 12 } });
  await settle(page);
  assert.deepEqual(await padding(), [24, 12, 20, 16]);
  await page.setViewportSize({ width: 844, height: 390 });
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 20, bottom: 12, left: 36 } });
  await settle(page);
  assert.deepEqual(await padding(), [4, 24, 16, 40], "landscape phones retain nonzero safe insets above the narrow breakpoint");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 0, bottom: 0, left: 0 } });
  await settle(page);
  assert.deepEqual(await padding(), [4, 4, 4, 4]);
  checks.push("actual safe-area env values protect all edges in portrait and landscape and fall back to 4px");

  const select = page.getByTestId("editor-select-tool");
  await select.scrollIntoViewIfNeeded();
  assert.deepEqual(await targetHit(select), { width: 48, height: 48, matches: Array(9).fill(true) });
  assert.equal(await select.getAttribute("aria-haspopup"), "menu");
  assert.equal(await page.getByTestId("editor-select-menu-trigger").getAttribute("aria-hidden"), "true");
  await select.tap();
  await page.getByTestId("editor-select-menu-perspective").tap();
  assert.equal(await page.evaluate(() => window.__vooEditor.getTool()), "perspective");
  const brush = page.getByTestId("editor-brush-tool");
  await brush.scrollIntoViewIfNeeded();
  assert.deepEqual(await targetHit(brush), { width: 48, height: 48, matches: Array(9).fill(true) });
  const families = await page.locator(".editor-toolbar-family").evaluateAll(roots => roots.map(root => {
    const buttons = root.querySelectorAll("[data-toolbar-touch-tool]");
    const box = buttons[0]?.getBoundingClientRect();
    return { id: root.getAttribute("data-testid"), count: buttons.length, width: box?.width, height: box?.height };
  }));
  assert.deepEqual(families.map(family => family.id).sort(), ["brush", "fill", "healing", "marquee", "pen", "select", "shapes"].map(id => `editor-${id}-menu`));
  for (const family of families) assert.deepEqual([family.count, family.width, family.height], [1, 48, 48], family.id);
  await brush.tap();
  assert.equal(await page.evaluate(() => window.__vooEditor.getTool()), "brush");
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-brush-tool"]')?.getAttribute("aria-pressed") === "true");
  assert.equal(await page.getByTestId("editor-brush-menu-list").count(), 0);
  await brush.tap(); await page.getByTestId("editor-brush-menu-list").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await brush.evaluate(button => document.activeElement === button), true);
  await page.keyboard.press("Enter");
  await page.getByTestId("editor-brush-menu-list").waitFor(); await page.keyboard.press("Escape");
  checks.push("whole 48px family targets hit correctly, select an inactive tool, reopen active options and retain keyboard focus");
  await session.detach();
  console.log(JSON.stringify({ passed: checks }, null, 2));
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
