import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, errors }) => {
  const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <title>Fixture Sample Page</title>
    <style>
      body { margin: 0; padding: 0; background-color: #121212; color: #ffffff; font-family: sans-serif; }
      header { height: 60px; background-color: #1f1f1f; padding: 10px; box-sizing: border-box; }
      main { height: 400px; background-color: #2a2a2a; padding: 20px; box-sizing: border-box; }
      footer { height: 80px; background-color: #181818; padding: 10px; box-sizing: border-box; }
      .card { width: 200px; height: 100px; background-color: #3b82f6; margin-top: 10px; }
      .btn { display: inline-block; padding: 8px 16px; background-color: #10b981; }
    </style>
  </head>
  <body>
    <header id="sample-header">Header Navigation</header>
    <main id="sample-main">
      <h1>Main Heading</h1>
      <div id="sample-card" class="card">Card Item</div>
      <div id="sample-btn" class="btn">Click Action</div>
    </main>
    <footer id="sample-footer">Footer Details</footer>
  </body>
</html>`;

  const origin = new URL(page.url()).origin;
  const fixtureUrl = `${origin}/fixtures/sample`;

  await page.route(fixtureUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: htmlContent,
    }),
  );

  // Set desktop viewport
  await page.setViewportSize({ width: 1440, height: 900 });

  // Open browser drawer
  const trigger = page.getByTestId("titlebar-browser-button");
  await trigger.click();
  const drawer = page.getByTestId("voo-browser-drawer");
  await drawer.waitFor();

  // Navigate to local fixture
  const urlInput = drawer.locator("input[type=\"text\"]");
  await urlInput.fill(fixtureUrl);
  await urlInput.press("Enter");

  const iframe = drawer.locator("iframe");
  await iframe.waitFor();
  await page.waitForTimeout(600);

  // Measure source page in iframe
  const iframeBox = await iframe.boundingBox();
  assert.ok(iframeBox.width > 0, "iframe is loaded and has positive width");

  // Full-page import has one home in the browser's top bar.
  const importFullBtn = drawer.getByRole("button", { name: /Import Page|导入整页/i });
  await importFullBtn.waitFor();
  await importFullBtn.click();

  // Wait for import completion notice
  await page.waitForFunction(() => {
    const e = window.__vooEditor;
    const doc = e?.getDocument?.();
    return Boolean(doc?.nodes?.some((n) => n.name === "Fixture Sample Page"));
  });

  // Verify the imported root node
  const doc = await page.evaluate(() => window.__vooEditor.getDocument());
  const rootFrame = doc.nodes.find((n) => n.name === "Fixture Sample Page");
  assert.ok(rootFrame, "Imported Frame with webpage title must exist");
  assert.equal(rootFrame.isFrame, true, "Root imported node must be a Frame with isFrame=true");
  assert.equal(rootFrame.width, Math.round(iframeBox.width), "Frame width must equal iframe viewport width");

  // Check children inside the Frame
  const children = doc.nodes.filter((n) => n.parentId === rootFrame.id);
  assert.ok(children.length >= 3, "Page header, main, and footer must be children of the Frame");

  // Verify Drawer Resizer (Desktop)
  const resizer = page.getByTestId("browser-drawer-resizer");
  await resizer.waitFor();
  const initialDrawerBox = await drawer.boundingBox();

  // Drag resizer to the left by 100px (expanding drawer)
  const resizerBox = await resizer.boundingBox();
  await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizerBox.x - 100, resizerBox.y + resizerBox.height / 2);
  await page.mouse.up();

  const expandedDrawerBox = await drawer.boundingBox();
  assert.ok(
    expandedDrawerBox.width > initialDrawerBox.width + 50,
    `Drawer width should expand after dragging left (before: ${initialDrawerBox.width}, after: ${expandedDrawerBox.width})`,
  );

  // Double click resizer to reset to default
  await resizer.dblclick();
  const resetDrawerBox = await drawer.boundingBox();
  assert.ok(
    Math.abs(resetDrawerBox.width - initialDrawerBox.width) <= 2,
    `Drawer should reset to default width on double click (expected ~${initialDrawerBox.width}, got ${resetDrawerBox.width})`,
  );

  // Keyboard navigation on resizer
  await resizer.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  const keyboardAdjustedBox = await drawer.boundingBox();
  assert.ok(keyboardAdjustedBox.width > resetDrawerBox.width, "ArrowLeft should increase drawer width");

  assert.deepEqual(errors, []);
  console.log("Full page import to Frame & Resizable Drawer test passed.");
});
