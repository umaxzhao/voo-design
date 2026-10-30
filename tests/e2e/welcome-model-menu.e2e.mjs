import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cacheDir = await mkdtemp(join(tmpdir(), "voo-model-menu-"));
let server, browser;
try {
  server = await createServer({
    root,
    cacheDir,
    logLevel: "error",
    server: { port: 0, host: "127.0.0.1" },
    plugins: [
      {
        name: "model-menu-fixture",
        configureServer(vite) {
          vite.middlewares.use(
            "/__model-menu",
            async (_request, response, next) => {
              try {
                const html = await vite.transformIndexHtml(
                  "/__model-menu",
                  '<html><body style="margin:0;background:#525252"><div id="root" style="width:100%;height:100vh"></div></body></html>',
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
  await page.goto(`${server.resolvedUrls.local[0]}__model-menu`);
  // Reproduce a tall model list inside a clipped, isolated composer container.
  await page.evaluate(async () => {
    const { mountModelMenuRegression } = await import(
      "/tests/e2e/welcome-model-menu-harness.jsx"
    );
    mountModelMenuRegression();
  });
  const testTrigger = page.getByRole("button", {
    name: "Regression models",
    exact: true,
  });
  const testMenu = page.getByRole("listbox", {
    name: "Regression models",
    exact: true,
  });
  const host = page.locator("#model-menu-regression");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 500 });
    for (const top of [40, 420]) {
      await host.evaluate((el, y) => {
        el.style.top = `${y}px`;
      }, top);
      await testTrigger.click();
      await testMenu.waitFor();
      assert.equal(await testMenu.getByRole("group").count(), 3);
      assert.equal(
        await testMenu
          .getByRole("group", { name: "Claude Code", exact: true })
          .getByRole("option")
          .count(),
        40,
      );
      assert.equal(
        await testMenu
          .getByRole("group", { name: "Codex", exact: true })
          .getByRole("option")
          .count(),
        1,
      );
      assert.equal(await testMenu.getByRole("option").count(), 42);
      assert.equal(await testMenu.getByText("Empty provider").count(), 0);
      const box = await testMenu.boundingBox();
      const anchor = await testTrigger.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      assert.ok(box.y >= 0 && box.y + box.height <= 500);
      assert.ok(
        top === 40
          ? box.y >= anchor.y + anchor.height
          : box.y + box.height <= anchor.y,
      );
      assert.ok(
        await testMenu.evaluate((el) => el.scrollHeight > el.clientHeight),
      );
      const last = testMenu.getByRole("option").last();
      await last.scrollIntoViewIfNeeded();
      assert.equal(
        await last.evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          );
        }),
        true,
      );
      await last.click();
      assert.equal(await host.getAttribute("data-selected"), "api:custom:test");
      await testMenu.waitFor({ state: "detached" });
    }
  }
  await testTrigger.click();
  await page.keyboard.press("Escape");
  await testMenu.waitFor({ state: "detached" });
  await testTrigger.click();
  await page.mouse.click(2, 2);
  await testMenu.waitFor({ state: "detached" });
  await testTrigger.click();
  await testMenu
    .getByRole("group", { name: "Claude Code", exact: true })
    .getByRole("option")
    .last()
    .click();
  await testTrigger.click();
  await page.keyboard.press("ArrowDown");
  assert.equal(await host.getAttribute("data-selected"), "codex:test");
  assert.equal(
    await testMenu
      .getByRole("group", { name: "Codex", exact: true })
      .getByRole("option")
      .getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  console.log(
    "Welcome model menu: portal, clipping, viewport edges, scrolling, selection and dismissal passed.",
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(cacheDir, { recursive: true, force: true });
}
