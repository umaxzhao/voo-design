import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";

const environment = await startEditorBrowserServer();
const browser = await chromium.launch({ headless: true });
const checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const unexpectedErrors = [];
  page.on("pageerror", error => {
    if (!error.message.startsWith("Recovery fixture:")) unexpectedErrors.push(error.message);
  });
  await page.route("**/__error-recovery*", route => route.fulfill({ contentType: "text/html",
    body: `<html><body><div id="root"></div><script type="module">
      import RefreshRuntime from "/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import("/tests/e2e/app-error-recovery-harness.jsx");
    </script></body></html>` }));
  await page.goto(`${environment.origin}/__error-recovery?locale=zh`);
  const recovery = page.getByRole("alert");
  await recovery.getByRole("heading", { name: "应用程序遇到意外错误" }).waitFor();
  assert.equal(await recovery.getByRole("button").count(), 2,
    "Recovery defaults to one primary action and one details entry");
  assert.equal(await recovery.getByRole("button", { name: "复制诊断信息" }).isVisible(), false);
  await recovery.getByRole("button", { name: "显示详情" }).click();
  assert.equal(await recovery.getByRole("button", { name: "显示详情" }).getAttribute("aria-expanded"), "true");
  await recovery.getByRole("button", { name: "复制诊断信息" }).click();
  await recovery.getByRole("status").getByText("已复制", { exact: true }).waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Recovery fixture/);
  await recovery.getByRole("button", { name: "显示详情" }).click();
  assert.equal(await recovery.locator("pre").isVisible(), false);
  checks.push("Real React boundary, Chinese copy, collapsed diagnostics and clipboard report work");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => ({ tag: document.activeElement.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle }));
  assert.equal(focused.tag, "BUTTON");
  assert.equal(focused.outline, "solid");
  checks.push("Keyboard actions have visible focus");
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await recovery.getByRole("button", { name: "显示详情" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const box = await recovery.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    if (width === 390) {
      assert.ok((await recovery.getByRole("button").first().boundingBox()).height >= 48);
    }
    await page.screenshot({ path: `/private/tmp/voo-error-recovery-${width}-details.png` });
    await recovery.getByRole("button", { name: "显示详情" }).click();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "/private/tmp/voo-error-recovery-desktop.png" });
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  assert.equal(await recovery.evaluate(element => getComputedStyle(element.parentElement).backgroundColor), "rgb(250, 250, 250)");
  // Shared buttons animate theme colors; retain the exact settled color assertion.
  await page.waitForFunction(() => getComputedStyle(document.querySelector("button[aria-controls=app-error-details]")).color === "rgb(38, 38, 38)");
  assert.equal(await recovery.getByRole("button", { name: "显示详情" }).evaluate(element => getComputedStyle(element).color), "rgb(38, 38, 38)");
  await page.screenshot({ path: "/private/tmp/voo-error-recovery-light.png" });
  checks.push("Desktop, tablet, mobile long diagnostics fit; mobile target and light theme verified");
  const navigation = page.waitForEvent("load");
  await recovery.getByRole("button", { name: "重新加载应用" }).click();
  await navigation;
  await recovery.getByRole("heading").waitFor();
  assert.equal(await recovery.getByRole("button", { name: "显示详情" }).getAttribute("aria-expanded"), "false");
  await page.goto(`${environment.origin}/__error-recovery?locale=en`);
  await recovery.getByRole("heading", { name: "Something went wrong" }).waitFor();
  checks.push("Reload triggers real navigation and restores collapsed state; English copy verified");
  assert.deepEqual(unexpectedErrors, []);
  console.log(JSON.stringify({ checks, functionalCoverage: "partial" }, null, 2));
} finally {
  await browser.close();
  await environment.close();
}
