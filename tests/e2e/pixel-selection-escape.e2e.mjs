import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withEditorBrowser } from './editor-browser-fixture.mjs';
import { editorArtifactPath } from './editor-test-artifacts.mjs';
import { helpers } from './pixel-selection-escape-fixture.mjs';

const directory = process.env.VOO_ESCAPE_AUDIT_DIR ?? editorArtifactPath('pixel-selection-escape');
await mkdir(join(directory, 'pixels'), { recursive: true });
await mkdir(join(directory, 'screenshots'), { recursive: true });
const results = [];
const conditions = [{ dpr: 1, zoomSteps: 0 }, { dpr: 2, zoomSteps: -2 }, { dpr: 2, zoomSteps: 2 }];

for (const condition of conditions) {
  const name = `dpr${condition.dpr}-zoom${condition.zoomSteps}`;
  await withEditorBrowser(async ({ page }) => {
    const h = helpers(page, directory + '/');
    const node = await h.seed('wand');
    await page.getByTestId('editor-zoom-percent').click();
    for (let i = 0; i < Math.abs(condition.zoomSteps); i++) {
      await page.getByTestId('editor-bottom-toolbar').getByRole('button', { name: condition.zoomSteps > 0 ? 'Zoom in' : 'Zoom out', exact: true }).click();
    }
    const viewport = await page.evaluate(() => ({ dpr: devicePixelRatio, viewport: window.__vooEditor.getViewport() }));
    const main = page.getByTestId('editor-toolbar').getByRole('button', { name: 'Marquee', exact: true });
    await main.click(); await h.settle();
    const baseline = await h.snapshot(node.id, name + '-baseline');
    const point = await h.client({ x: node.x + 12, y: node.y + 8 });
    const outline = () => page.evaluate(point => {
      const canvas = document.querySelector('canvas.z-20');
      const r = canvas.getBoundingClientRect(), sx = canvas.width / r.width, sy = canvas.height / r.height;
      const width = Math.max(1, Math.round(36 * sx)), height = Math.max(1, Math.round(5 * sy));
      const bytes = canvas.getContext('2d').getImageData(Math.round((point.x - r.left) * sx), Math.round((point.y - r.top - 2) * sy), width, height).data;
      let light = 0, dark = 0, nonTransparent = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        if (bytes[i + 3]) nonTransparent++;
        if (bytes[i + 3] >= 100 && Math.min(...bytes.slice(i, i + 3)) >= 210) light++;
        if (bytes[i + 3] >= 100 && Math.max(...bytes.slice(i, i + 3)) <= 110) dark++;
      }
      return { light, dark, nonTransparent, bytes: Array.from(bytes), width, height };
    }, point);
    const emptyOutline = await outline();
    await h.drag({ x: node.x + 8, y: node.y + 8 }, { x: node.x + 56, y: node.y + 56 });
    const selected = await h.snapshot(node.id, name + '-selected');
    const visibleOutline = await outline();
    assert.equal(selected.selectedPixelCount, 2304);
    assert.ok(visibleOutline.light > 0 && visibleOutline.dark > 0, 'Real overlay canvas contains visible light/dark marching ants');
    assert.ok(visibleOutline.nonTransparent > emptyOutline.nonTransparent);

    // The topmost menu consumes the first Escape without clearing the artwork selection.
    await page.getByTestId('editor-marquee-menu-trigger').click();
    await page.keyboard.press('Escape');
    await page.getByTestId('editor-marquee-menu-list').waitFor({ state: 'detached' });
    const menuCancelled = await h.snapshot(node.id, name + '-menu-cancel');
    assert.deepEqual(menuCancelled.selection, selected.selection);
    assert.deepEqual(menuCancelled.selectedIds, selected.selectedIds);

    // A native text field owns Escape before it can become a canvas command.
    const feather = page.getByTestId('editor-properties-panel').getByRole('textbox', { name: 'Feather', exact: true });
    const featherBefore = await feather.inputValue();
    await feather.focus(); await feather.press('Escape');
    assert.equal(await feather.inputValue(), featherBefore);
    const inputCancelled = await h.snapshot(node.id, name + '-input-cancel');
    assert.deepEqual(inputCancelled.selection, selected.selection);
    assert.equal(inputCancelled.sourceSha256, selected.sourceSha256);

    await main.click(); await page.keyboard.press('Escape');
    const cleared = await h.snapshot(node.id, name + '-cleared');
    const clearedOutline = await outline();
    await writeFile(join(directory, 'pixels', name + '-outline.json'), JSON.stringify({ emptyOutline, visibleOutline, clearedOutline }, null, 2));
    assert.equal(cleared.selection, null, 'Escape must clear actual raster selection');
    assert.equal(cleared.selectedPixelCount, 0);
    assert.deepEqual(cleared.selectedIds, selected.selectedIds, 'First Escape retains the host layer selection');
    assert.equal(cleared.sourceSha256, baseline.sourceSha256, 'Selection clear never changes artwork pixels');
    assert.deepEqual(cleared.geometry, selected.geometry);
    assert.equal(clearedOutline.nonTransparent, emptyOutline.nonTransparent, 'Visible inner selection outline disappears');
    const history = await h.history(node.id, name, selected, cleared, assert);
    assert.equal(history.undo.selectedPixelCount, 2304);
    assert.equal(history.redo.selectedPixelCount, 0);
    await main.click(); await page.keyboard.press('Escape');
    const layerCleared = await h.snapshot(node.id, name + '-layer-cleared');
    assert.deepEqual(layerCleared.selectedIds, []);
    assert.equal(layerCleared.selection, null);
    assert.equal(layerCleared.sourceSha256, baseline.sourceSha256);
    results.push({ name, viewport, status: 'passed', menuPriority: true, inputPriority: true, visiblePixels: true, undoRedo: true });
    await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2));
  }, { deviceScaleFactor: condition.dpr });
}

await withEditorBrowser(async ({ page }) => {
  const h = helpers(page, directory + '/');
  await h.seed('wand');
  await page.evaluate(() => {
    const e = window.__vooEditor;
    e.setDoc({ ...e.getDocument(), nodes: [{ id: 'vector-only', kind: 'rect', name: 'Vector applicability', x: 180, y: 130, width: 80, height: 60, fill: '#ff0000', opacity: 1, visible: true }] });
    e.selectExactly([]);
  });
  await h.settle();
  await page.getByTestId('editor-toolbar').getByRole('button', { name: 'Marquee', exact: true }).click();
  const before = await h.snapshot('vector-only', 'vector-only-before');
  await h.drag({ x: 190, y: 140 }, { x: 240, y: 180 });
  const after = await h.snapshot('vector-only', 'vector-only-after');
  assert.equal(after.selection, null, 'Pixel marquee has no raster host on a vector-only canvas');
  assert.deepEqual(after.geometry, before.geometry);
  assert.equal(after.sourceSha256, before.sourceSha256);
  const ui = { propertiesText: await page.getByTestId('editor-properties-panel').innerText(), statusText: await page.getByRole('status').allTextContents() };
  await writeFile(join(directory, 'vector-only-ui.json'), JSON.stringify(ui, null, 2));
  await page.getByTestId('editor-select-menu-trigger').click();
  await page.getByTestId('editor-select-menu-list').getByRole('menuitem').first().click();
  await h.click({ x: 220, y: 160 });
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), ['vector-only']);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getSelectedIds()), []);
  assert.equal(await page.evaluate(() => window.__vooEditor.getPixelSelection()), null);
  results.push({ name: 'vector-only-applicability', status: 'passed', rasterHost: false, newWholeCanvasRasterCapability: false, uiRecorded: true });
  await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2));
});

console.log(JSON.stringify({ checks: results, nativeMac: 'notrun; original cannot-display feedback remains unresolved', physicalIme: 'notrun' }, null, 2));
