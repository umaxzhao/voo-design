import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cacheDir = await mkdtemp(join(tmpdir(), "voo-suggestions-"));
let server, browser;
try {
  server = await createServer({
    root,
    cacheDir,
    logLevel: "error",
    server: { port: 0, host: "127.0.0.1" },
    plugins: [
      {
        name: "agent-suggestions-fixture",
        configureServer(vite) {
          vite.middlewares.use(
            "/__agent-suggestions",
            async (_request, response, next) => {
              try {
                const html = await vite.transformIndexHtml(
                  "/__agent-suggestions",
                  '<html><body style="margin:0;background:#525252"><div id="root" style="width:100%;height:100vh"></div><script type="module" src="/tests/e2e/agent-suggestions-harness.jsx"></script></body></html>',
                );
                response.setHeader("Content-Type", "text/html");
                response.end(html);
              } catch (error) {
                next(error);
              }
            },
          );
        },
      },
    ],
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 380, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${server.resolvedUrls.local[0]}__agent-suggestions`);
  const suggestions = page.getByTestId("agent-selection-suggestions");
  const input = page.locator("form.agent-composer textarea");
  await input.waitFor();
  assert.equal(await suggestions.count(), 0);
  await page.evaluate(() => window.selectSuggestionFixture(["image"]));
  await suggestions
    .getByRole("button", { name: "参考生图", exact: true })
    .click();
  assert.match(await input.inputValue(), /以选中的图片为视觉参考/);
  assert.equal(
    await input.evaluate((el) => document.activeElement === el),
    true,
  );
  assert.equal(
    await page.getByTestId("agent-cancel").count(),
    0,
    "Suggestions must not send automatically",
  );
  await input.fill("保留蓝色");
  await page.evaluate(() => window.selectSuggestionFixture(["frame"]));
  await suggestions
    .getByRole("button", { name: "重构设计", exact: true })
    .click();
  const draft = await input.inputValue();
  assert.match(draft, /^保留蓝色\n重构选中对象/);
  await suggestions
    .getByRole("button", { name: "重构设计", exact: true })
    .click();
  assert.equal(await input.inputValue(), draft);
  await page.evaluate(() => window.selectSuggestionFixture(["text"]));
  await suggestions
    .getByRole("button", { name: "优化文案", exact: true })
    .waitFor();
  await page.evaluate(() => window.selectSuggestionFixture(["text", "image"]));
  await suggestions
    .getByRole("button", { name: "统一样式", exact: true })
    .waitFor();
  const box = await suggestions.boundingBox(),
    composer = await page.locator("form.agent-composer").boundingBox();
  assert.ok(
    box.y + box.height <= composer.y,
    "Suggestions stay above the composer",
  );
  assert.ok(
    box.x >= 0 && box.x + box.width <= 380,
    "Suggestions fit narrow panels",
  );
  await page.getByTestId("agent-context-detach").click();
  await suggestions.waitFor({ state: "detached" });
  assert.equal(await input.inputValue(), draft);
  assert.deepEqual(errors, []);
  console.log(
    "Verified type-aware prompts, draft preservation, focus, narrow layout, and no automatic send",
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(cacheDir, { recursive: true, force: true });
}
