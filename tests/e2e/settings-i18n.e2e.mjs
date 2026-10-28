import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page }) => {
  const checks = [];
  const switchLocale = async (locale) => {
    await page.evaluate(async (locale) => {
      const { setLocale } = await import("/src/shared/i18n.js");
      await setLocale(locale);
    }, locale);
  };
  await switchLocale("en");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("voo:open-settings", { detail: { tab: "shortcuts" } })));
  const drawer = page.getByTestId("settings-drawer");
  await drawer.waitFor({ state: "visible" });
  assert.equal(await drawer.getAttribute("aria-label"), "Settings & Preferences");
  assert.equal(await drawer.getByRole("navigation").getAttribute("aria-label"), "Settings Categories");
  assert.equal(await drawer.getByRole("button", { name: "Close", exact: true }).getAttribute("title"), "Close (Esc)");
  assert.equal(await drawer.getByText("Boolean & Geometry", { exact: true }).count(), 1);
  assert.equal(await drawer.getByText("Union (Merge paths)", { exact: true }).count(), 1);
  checks.push("actual settings drawer and boolean shortcut descriptions render translated English labels");

  const query = drawer.locator('input[type="text"]');
  await query.fill("Union");
  assert.equal(await drawer.getByText("Union (Merge paths)", { exact: true }).count(), 1);
  await switchLocale("zh");
  await drawer.getByRole("button", { name: "清除", exact: true }).waitFor();
  assert.equal(await drawer.getAttribute("aria-label"), "设置与偏好");
  assert.equal(await drawer.getByRole("navigation").getAttribute("aria-label"), "设置分类");
  assert.equal(await query.getAttribute("placeholder"), "搜索快捷键或功能名称...");
  assert.equal(await query.inputValue(), "Union");
  assert.equal(await drawer.getByText("未找到相关快捷键", { exact: true }).count(), 1);
  await drawer.getByRole("button", { name: "清除", exact: true }).click();
  assert.equal(await query.inputValue(), "");
  assert.equal(await drawer.getByText("布尔运算与几何变换", { exact: true }).count(), 1);
  assert.equal(await drawer.getByText("并集运算 (合并路径)", { exact: true }).count(), 1);
  assert.equal(await drawer.getByRole("button", { name: "关闭", exact: true }).getAttribute("title"), "关闭 (Esc)");
  checks.push("switching locale with a search preserves the query, recalculates translated matches and localizes clear/empty states");

  await query.fill("并集");
  assert.equal(await drawer.getByText("并集运算 (合并路径)", { exact: true }).count(), 1);
  await switchLocale("en");
  await drawer.getByRole("button", { name: "Clear", exact: true }).waitFor();
  assert.equal(await query.getAttribute("placeholder"), "Search shortcuts or tools...");
  assert.equal(await drawer.getByText("No matching shortcuts found", { exact: true }).count(), 1);
  await drawer.getByRole("button", { name: "Clear", exact: true }).click();
  assert.equal(await drawer.getByText("Union (Merge paths)", { exact: true }).count(), 1);
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  checks.push("switching back to English refreshes search results and Escape closes the same settings surface");
  console.log(JSON.stringify({ passed: checks }, null, 2));
});
