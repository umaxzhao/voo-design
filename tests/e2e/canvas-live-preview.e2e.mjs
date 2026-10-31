import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  await tool("create_shape", { kind: "rect", x: 60, y: 60, width: 160, height: 100, fill: "#ff0000" });
  const before = await tool("voo_status");
  assert.match(before.previewUrl, /^http:\/\/127\.0\.0\.1:\d+\/preview\/[a-f0-9]{48}$/);
  const viewer = await page.context().browser().newPage();
  const failures = [];
  viewer.on("pageerror", error => failures.push(String(error)));
  try {
    await viewer.goto(before.previewUrl);
    const image = viewer.locator("img");
    await viewer.waitForFunction(() => document.querySelector("img").naturalWidth > 0);
    const first = await image.getAttribute("src");
    const status = await tool("voo_status");
    assert.equal(status.previewSession, before.previewSession, "Viewer must never replace the writable target");
    await tool("create_shape", { kind: "rect", x: 260, y: 60, width: 160, height: 100, fill: "#00ff00" });
    await viewer.waitForFunction(previous => document.querySelector("img").getAttribute("src") !== previous, first);
    // Real image pixels, not just a success status or a changed resource string.
    const colors = await viewer.evaluate(async () => {
      const image = document.querySelector("img");
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      return [context.getImageData(100, 100, 1, 1).data.slice(0, 3), context.getImageData(300, 100, 1, 1).data.slice(0, 3)].map(values => Array.from(values));
    });
    assert.deepEqual(colors, [[255, 0, 0], [0, 255, 0]]);
    const transform = await image.getAttribute("style");
    await viewer.locator("#in").click();
    assert.notEqual(await image.getAttribute("style"), transform);
    await viewer.locator("main").focus();
    await viewer.keyboard.press("0");
    assert.equal(await image.getAttribute("style"), transform);
    await viewer.screenshot({ path: "/private/tmp/voo-canvas-live-preview.png" });
    await tool("new_document", { width: 600, height: 400, name: "NextDocument", force: true });
    await viewer.waitForFunction(() => !document.querySelector("img").hasAttribute("src"));
    const expired = await viewer.request.get(`${before.previewUrl}/snapshot`);
    assert.equal(expired.status(), 410, "An old link cannot leak the next document");
    assert.notEqual((await tool("voo_status")).previewSession, before.previewSession);
    assert.deepEqual(failures, []);
    console.log("Read-only live preview: actual pixels, update, zoom, same target, document-switch expiry");
  } finally { await viewer.close(); }
});
