// Run with Vite on 127.0.0.1:5173. Artifacts stay outside the repository.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

await mkdir("/workspace/tmp", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  // Automation normally bypasses first run. Simulate a real fresh user here.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  page.setDefaultTimeout(120000);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 120000 });
  const modal = page.getByTestId("first-run-onboarding");
  await modal.waitFor();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome to VOO Design" }).waitFor();
  await page.screenshot({ path: "/workspace/tmp/onboard-en.png" });
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.getByRole("heading", { name: "欢迎使用 VOO Design" }).waitFor();
  await page.screenshot({ path: "/workspace/tmp/onboard-zh.png" });
  await page.getByRole("button", { name: "暂时跳过", exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("voo.firstRun.status"))), "dismissed");
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await modal.count(), 0);
  assert.equal(await page.getByTestId("onboarding-guide-modal").count(), 0);
  // Reset through the settings module, then exercise completion and document creation.
  await page.evaluate(async () => (await import("/src/shared/settings.js")).setSetting("voo.firstRun.status", null));
  await page.reload();
  await page.getByRole("button", { name: "新建空白文档", exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("voo.firstRun.status"))), "completed");
  const state = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const s = useDesignStore.getState();
    return { welcomeOpen: s.welcomeOpen, nodes: s.nodes.length };
  });
  assert.equal(state.welcomeOpen, false);
  assert.ok(state.nodes > 0);
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await modal.count(), 0);
  console.log("English/Chinese screenshots captured; skip, reload, completion and blank document verified.");
  await context.close();
} finally {
  await browser.close();
}
