import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, origin }) => {
  await page.evaluate(async () => { const { setLocale } = await import("/src/shared/i18n.js"); await setLocale("en"); });
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 4;
    const context = canvas.getContext("2d");
    context.fillStyle = "#b2ffd6";
    context.fillRect(0, 0, 4, 4);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const home = page.locator(".welcome-dashboard");
  const input = home.locator(".prompt-composer textarea");
  await home.getByRole("button", { name: "Import from browser", exact: true }).click();
  const browser = page.getByTestId("voo-browser-drawer");
  await browser.waitFor({ timeout: 5000 });
  assert.ok(await home.isVisible());
  await browser.getByRole("button", { name: /Close Browser/ }).click();
  await browser.waitFor({ state: "detached" });
  await input.fill("Preserve my brief");
  const chooser = page.waitForEvent("filechooser");
  await home.getByRole("button", { name: "Recreate a screenshot", exact: true }).click();
  await (await chooser).setFiles({ name: "reference.png", mimeType: "image/png", buffer: png });
  const attachments = home.getByRole("list", { name: "References and attachments" });
  await attachments.getByText("reference.png", { exact: true }).waitFor();
  assert.equal(await input.inputValue(), "Preserve my brief");
  assert.ok(await input.evaluate(element => element === document.activeElement));
  assert.equal(await page.getByTestId("design-editor").count(), 0);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.evaluate(async bytes => {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }) })]);
  }, [...png]);
  await input.focus();
  await page.keyboard.press("ControlOrMeta+V");
  await page.waitForFunction(() => document.querySelectorAll('.welcome-dashboard .prompt-composer li img').length === 2);
  assert.equal(await input.inputValue(), "Preserve my brief");
  await page.evaluate(() => navigator.clipboard.writeText(" + pasted text"));
  await page.keyboard.press("ControlOrMeta+V");
  assert.equal(await input.inputValue(), "Preserve my brief + pasted text");
  await attachments.getByRole("button", { name: "Remove attachment" }).first().click();
  assert.equal(await attachments.locator("li").count(), 1);
  assert.equal(await page.getByTestId("design-editor").count(), 0);
  await page.screenshot({ path: "/private/tmp/voo-welcome-reference-paste.png" });
  // The editor's Agent composer shares the attachment boundary and sends real pixels.
  await page.evaluate(async origin => {
    const { setSetting } = await import("/src/shared/settings.js");
    const { AGENT_SETTING } = await import("/src/canvas/agent/agent-settings.js");
    setSetting(AGENT_SETTING.MODEL, "fixture-vision");
    setSetting(AGENT_SETTING.API_KEY, "fixture-only");
    setSetting(AGENT_SETTING.BASE_URL, `${origin}/reference-test-api`);
  }, origin);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.waitForFunction(() => window.__vooEditor && document.querySelector('[data-open-guard="off"]'));
  await page.evaluate(async () => {
    const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
    const editor = window.__vooEditor;
    editor.setDoc({ ...editor.getDocument(), nodes: [createRectNode({ x: 0, y: 0, width: 100, height: 100 })] });
  });
  await page.locator(".voo-ai-fab").click();
  const agent = page.locator(".agent-composer");
  await agent.locator("textarea").waitFor();
  await page.evaluate(async bytes => {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }) })]);
  }, [...png]);
  await agent.locator("textarea").focus();
  await page.keyboard.press("ControlOrMeta+V");
  await agent.locator("li img").waitFor();
  let capture;
  const requestSeen = new Promise(resolve => { capture = resolve; });
  await page.route("**/reference-test-api/**", async route => {
    capture(route.request().postDataJSON());
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"message":"fixture stopped generation"}}' });
  });
  await agent.getByRole("button", { name: /Send/ }).click();
  const request = await Promise.race([requestSeen, new Promise((_, reject) => setTimeout(() => reject(new Error("Reference request was not sent")), 15000))]);
  assert.match(JSON.stringify(request), /data:image\/png;base64,/);
  assert.equal(await agent.locator("li img").count(), 0);
  await page.screenshot({ path: "/private/tmp/voo-agent-reference-paste.png" });
  console.log("Welcome browser entry, screenshot reference, real clipboard image/text paste, focus, removal and deferred generation passed.");
}, { openDocument: false, mcpLink: false });
