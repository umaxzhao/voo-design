import assert from "node:assert/strict";
import { preview } from "vite";
import { chromium } from "playwright";

// Test compiled, minified modules too: development-only contracts are stripped.
const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  // This production-artifact suite owns no CLI service. Keep it isolated
  // from an App running on the developer's machine, including legacy hosts.
  await page.route("**/health", route => route.fulfill({
    json: { ok: false }, headers: { "access-control-allow-origin": "*" },
  }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?voo-test=1`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("welcome-prompt-heading").innerText(), "What would you like to design?");
  await page.getByTestId("editor-top-bar").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("design-editor").waitFor();
  await page.waitForFunction(() => window.__vooEditor && document.querySelector('[data-testid="design-editor"] [data-open-guard]')?.getAttribute("data-open-guard") === "off");
  await page.getByTestId("editor-layers-tab-assets").click();
  const resources = page.getByTestId("editor-resource-browser");
  await resources.getByRole("button", { name: "Resource source", exact: true }).click();
  await page.getByRole("option", { name: "Templates", exact: true }).click();
  const card = resources.locator('[data-resource-id="saas-analytics-dashboard"]');
  await card.waitFor();
  const before = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  await card.click();
  await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length > count, before);
  await page.evaluate(() => window.__vooEditor.undo());
  assert.equal(await page.evaluate(() => window.__vooEditor.getDocument().nodes.length), before);
  assert.equal(await page.getByText("Something went wrong", { exact: true }).count(), 0);
  assert.deepEqual(errors.filter(error => !/favicon|Failed to load resource/.test(error)), []);
  console.log("Production resources passed: compiled editor opens, template cards load, insertion and undo work.");
} catch (error) {
  throw new Error(`Production resource check failed: ${errors.join("\n")}`, { cause: error });
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
