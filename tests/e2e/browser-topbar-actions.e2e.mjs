import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

const PAGE = `<!doctype html><html><head><title>Test Page</title></head><body><h1>Hello VOO</h1><p id="target-p">Extract Paragraph</p></body></html>`;

await withEditorBrowser(async ({ page, errors }) => {
  const origin = new URL(page.url()).origin;
  const url = `${origin}/fixtures/browser-actions-test`;
  await page.route(url, (r) => r.fulfill({ contentType: "text/html", body: PAGE }));

  // 1. Check from welcome screen: welcomeOpen is true
  await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    useDesignStore.getState().setWelcomeOpen(true);
  });

  const trigger = page.getByTestId("titlebar-browser-button");
  await trigger.click();
  const drawer = page.getByTestId("voo-browser-drawer");
  await drawer.waitFor();

  const urlInput = drawer.locator('input[type="text"]');
  await urlInput.fill(url);
  await urlInput.press("Enter");
  await page.frameLocator('[data-testid="voo-browser-drawer"] iframe').locator("#target-p").waitFor();

  // Check 3 explicit icon buttons exist, have aria-labels, no visible text, and sit to the left of "..." button
  const pickBtn = drawer.getByRole("button", { name: /Pick Element|选取元素/i });
  const importPageBtn = drawer.getByRole("button", { name: /Import Page|导入整页/i });
  const captureBtn = drawer.getByRole("button", { name: /Capture Viewport Screenshot|截图置入画布/i });
  const moreBtn = drawer.getByRole("button", { name: /Browser tools|浏览器工具/i });

  await pickBtn.waitFor();
  await importPageBtn.waitFor();
  await captureBtn.waitFor();
  await moreBtn.waitFor();

  const pickBox = await pickBtn.boundingBox();
  const importBox = await importPageBtn.boundingBox();
  const captureBox = await captureBtn.boundingBox();
  const moreBox = await moreBtn.boundingBox();

  assert.ok(pickBox.x < importBox.x, "Pick button is to the left of Import Page button");
  assert.ok(importBox.x < captureBox.x, "Import Page button is to the left of Capture button");
  assert.ok(captureBox.x < moreBox.x, "Capture button is to the left of More button");

  // Verify "..." menu contains secondary actions
  await moreBtn.click();
  const menu = drawer.locator('[role="menu"]');
  await menu.waitFor();
  assert.equal(await menu.getByText(/Custom HTML|自定义 HTML/i).count(), 1);
  assert.equal(await menu.getByText(/Open in default browser|在默认浏览器中打开/i).count(), 1);
  // Close menu via clicking moreBtn again (Escape closes drawer in useBrowserOverlay)
  await moreBtn.click();
  await menu.waitFor({ state: "detached" });

  // Verify import from Welcome screen creates a new project without default blank Frame
  const docsCountBefore = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    return useDesignStore.getState().openDocuments.length;
  });

  await importPageBtn.click();
  await page.waitForFunction(() => {
    const doc = window.__vooEditor?.getDocument?.();
    return Boolean(doc?.nodes?.some((n) => n.name === "Test Page"));
  });

  const stateAfter = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    const s = useDesignStore.getState();
    const doc = window.__vooEditor.getDocument();
    return {
      welcomeOpen: s.welcomeOpen,
      openDocsCount: s.openDocuments.length,
      nodes: doc.nodes.map((n) => ({ id: n.id, name: n.name, isFrame: Boolean(n.isFrame) })),
    };
  });

  assert.equal(stateAfter.openDocsCount, docsCountBefore + 1, "Project count should increment by 1");
  assert.equal(stateAfter.welcomeOpen, false, "Welcome screen should close and show editor");
  // There should be NO default empty Frame ("Frame")
  assert.ok(!stateAfter.nodes.some((n) => n.name === "Frame"), "Must not leave a default empty Frame");
  assert.ok(stateAfter.nodes.some((n) => n.name === "Test Page" && n.isFrame), "Must have imported Frame");

  // 2. Importing while already in an open project does NOT create another new project
  const docsCountNow = stateAfter.openDocsCount;
  await importPageBtn.click();
  await page.waitForTimeout(600);
  const docsCountStill = await page.evaluate(async () => {
    const { useDesignStore } = await import("/src/store/design_store.js");
    return useDesignStore.getState().openDocuments.length;
  });
  assert.equal(docsCountStill, docsCountNow, "Project count must stay the same when importing into existing project");

  // 3. Check toolbar fits without overflow on 320px drawer and 390px mobile viewport
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  const tbBox = await drawer.locator(".browser-drawer-toolbar").boundingBox();
  assert.ok(tbBox.width <= 390, "Toolbar fits in 390px width");

  assert.deepEqual(errors, []);
  console.log("Browser top bar actions and welcome import new project tests passed.");
});
