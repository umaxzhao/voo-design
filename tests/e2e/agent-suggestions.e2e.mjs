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
  await page.addInitScript(() => localStorage.setItem("voo_design_agent_sessions_v1", JSON.stringify([{
    id: "integration-history", title: "Original title", createdAt: 1, updatedAt: 1,
    messages: [], history: [],
  }])));
  await page.goto(`${server.resolvedUrls.local[0]}__agent-suggestions`);
  const suggestions = page.getByTestId("agent-selection-suggestions");
  const input = page.locator("form.agent-composer textarea");
  await input.waitFor();
  assert.equal(await suggestions.count(), 0);
  await page.evaluate(() => window.selectSuggestionFixture(["image"]));
  await suggestions.first().waitFor();
  assert.equal(await suggestions.count(), 1, "Selection suggestions have one home");
  assert.equal(await suggestions.getByRole("button").count(), 3);
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
  await suggestions.getByRole("button", { name: "重构设计", exact: true }).waitFor();
  assert.equal(await suggestions.count(), 1, "Frame suggestions appear once");
  assert.equal(await page.getByRole("button", { name: "重构设计", exact: true }).count(), 1);
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
  for (const width of [380, 760]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.selectSuggestionFixture(["frame"]));
    await suggestions.getByRole("button", { name: "重构设计", exact: true }).waitFor();
    assert.equal(await suggestions.count(), 1, `One suggestion group at ${width}px`);
    assert.equal(await suggestions.getByRole("button").count(), 3);
    for (const name of ["重构设计", "优化布局", "调整配色"]) {
      assert.equal(await page.getByRole("button", { name, exact: true }).count(), 1);
    }
  }
  await page.getByTestId("agent-context-detach").click();
  await suggestions.waitFor({ state: "detached" });
  assert.equal(await input.inputValue(), draft);
  // Picker and paste share the existing attachment state; neither sends a turn.
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1EAAAAASUVORK5CYII=", "base64");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "添加参考图或工程文件", exact: true }).click();
  await (await picker).setFiles({ name: "reference.png", mimeType: "image/png", buffer: image });
  const attachments = page.getByRole("list", { name: "参考图与附件" });
  await attachments.getByText("reference.png").waitFor();
  assert.equal(await attachments.getByRole("listitem").count(), 1);
  await input.evaluate((element, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  }, [...image]);
  await attachments.getByText("pasted.png").waitFor();
  assert.equal(await attachments.getByRole("listitem").count(), 2);
  await attachments.getByRole("button", { name: "移除附件" }).first().click();
  assert.equal(await attachments.getByRole("listitem").count(), 1);
  assert.equal(await input.inputValue(), draft);
  assert.equal(await page.getByTestId("agent-cancel").count(), 0);

  // Renaming remains reachable after the history component extraction.
  await page.getByRole("button", { name: "对话记录", exact: true }).click();
  await page.getByRole("button", { name: "重命名对话", exact: true }).click();
  await page.getByRole("textbox", { name: "重命名对话", exact: true }).fill("Reviewed session");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await page.getByRole("button", { name: "Reviewed session", exact: true }).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("voo_design_agent_sessions_v1")));
  assert.equal(stored[0].title, "Reviewed session");
  assert.deepEqual(errors, []);
  console.log(
    "Verified type-aware prompts, draft preservation, focus, narrow layout, and no automatic send",
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(cacheDir, { recursive: true, force: true });
}
