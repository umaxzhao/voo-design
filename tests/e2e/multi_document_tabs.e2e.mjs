// Start Vite, then: flock -w 600 /tmp/voo-e2e.lock node tests/e2e/multi_document_tabs.e2e.mjs
// browser.close() cleans up the browser launched by this test.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const before = process.env.VOO_TABS_BEFORE === '1';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60000);
  await page.goto(process.env.VOO_URL || 'http://127.0.0.1:5247/?voo-test=1');
  await page.evaluate(async () => {
    localStorage.setItem('voo:first-run:completed', '1');
    const { useDesignStore } = await import('/src/store/design_store.js');
    useDesignStore.getState().setWelcomeOpen(false);
  });
  // Closing welcome mounts the existing document asynchronously. Give that
  // editor time to start before creating a fallback project (and another tab).
  try {
    await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 15000 });
  } catch {
    await page.evaluate(async () => {
      const { useDesignStore } = await import('/src/store/design_store.js');
      if (!window.__vooEditor) useDesignStore.getState().newVooProject();
    });
    await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 120000 });
  }
  // Draw through the canvas UI; inspect the engine through the existing browser-test hook.
  const edit = async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('r');
    const canvas = page.getByTestId('design-editor');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .6, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length > 0);
  };
  await page.waitForTimeout(1800);
  await edit();
  const a = await page.evaluate(() => ({ nodes: window.__vooEditor.serialise().nodes, viewport: window.__vooEditor.getViewport() }));
  const tabs = page.getByRole('tablist').first();
  page.on('dialog', dialog => dialog.accept());
  await tabs.getByRole('button', { name: /Add project|添加项目/ }).click();
  await page.waitForTimeout(1800);
  if (before) {
    assert.equal(await tabs.getByRole('tab').count(), 1);
    await page.screenshot({ path: '/workspace/shots-tabs/before.png', timeout: 60000 });
    console.log('Confirmed origin/main replaces the previous tab.');
  } else {
    assert.equal(await tabs.getByRole('tab').count(), 2);
    await edit();
    const b = await page.evaluate(() => window.__vooEditor.serialise().nodes);
    await tabs.getByRole('tab').first().click();
    await page.waitForFunction(id => window.__vooEditor?.getDocument()?.nodes.some(node => node.id === id), a.nodes[0].id);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise().nodes), a.nodes);
    assert.equal(await tabs.getByRole('tab').count(), 2);
    assert.equal(await page.evaluate(() => window.__vooEditor.canUndo()), true);
    await page.screenshot({ path: '/workspace/shots-tabs/after.png', timeout: 60000 });
    await page.evaluate(() => window.__vooEditor.undo());
    await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.length === 0);
    await tabs.getByRole('tab').nth(1).click();
    await page.waitForFunction(id => window.__vooEditor?.getDocument()?.nodes.some(node => node.id === id), b[0].id);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise().nodes), b);
    console.log('Verified two edited documents, independent content, switching, and preserved undo.');
  }
} finally { await browser.close(); }
