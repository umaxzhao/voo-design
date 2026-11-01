// Start Vite, then: flock -w 600 /tmp/voo-e2e.lock node tests/e2e/multi_document_tabs.e2e.mjs
// browser.close() cleans up the browser launched by this test.
import assert from 'node:assert/strict';
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const before = process.env.VOO_TABS_BEFORE === '1';
const shots = join(tmpdir(), "voo-multi-document-tabs");
await mkdir(shots, { recursive: true });
await withEditorBrowser(async ({ page }) => {
  page.setDefaultTimeout(30000);
  // Draw through the canvas UI; inspect the engine through the existing browser-test hook.
  const edit = async () => {
    const count = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
    await page.keyboard.press('Escape');
    await page.keyboard.press('r');
    const canvas = page.getByTestId('design-editor');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .6, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count + 1, count);
  };
  await page.waitForTimeout(1800);
  const initialNodes = await page.evaluate(() => window.__vooEditor.serialise().nodes);
  await edit();
  const a = await page.evaluate(() => ({ nodes: window.__vooEditor.serialise().nodes, viewport: window.__vooEditor.getViewport() }));
  const tabs = page.getByRole('tablist').first();
  page.on('dialog', dialog => dialog.accept());
  // The creation entry sits beside the scrolling tab strip, not inside it, so
  // a long project list can never push it off the bar.
  await page.locator('.canvas-tab-bar-desktop').getByRole('button', { name: /Add project|添加项目/ }).click();
  await page.waitForTimeout(1800);
  if (before) {
    assert.equal(await tabs.getByRole('tab').count(), 1);
    await page.screenshot({ path: `${shots}/before.png`, timeout: 60000 });
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
    await page.screenshot({ path: `${shots}/after.png`, timeout: 60000 });
    await page.evaluate(() => window.__vooEditor.undo());
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise().nodes), initialNodes);
    await tabs.getByRole('tab').nth(1).click();
    await page.waitForFunction(id => window.__vooEditor?.getDocument()?.nodes.some(node => node.id === id), b[0].id);
    assert.deepEqual(await page.evaluate(() => window.__vooEditor.serialise().nodes), b);
    console.log('Verified two edited documents, independent content, switching, and preserved undo.');
  }
});
