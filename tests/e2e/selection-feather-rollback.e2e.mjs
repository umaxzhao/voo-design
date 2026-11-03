import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withEditorBrowser } from './editor-browser-fixture.mjs';
import { editorArtifactPath } from './editor-test-artifacts.mjs';
import { helpers } from './pixel-selection-escape-fixture.mjs';

const directory = process.env.VOO_FEATHER_AUDIT_DIR ?? editorArtifactPath('selection-feather-rollback');
await mkdir(join(directory, 'pixels'), { recursive: true }); await mkdir(join(directory, 'screenshots'), { recursive: true });
const results = [];
await withEditorBrowser(async ({ page }) => {
  const h = helpers(page, directory + '/'), node = await h.seed('wand');
  await page.getByTestId('editor-toolbar').getByRole('button', { name: 'Marquee', exact: true }).click();
  await h.drag({ x: node.x + 8, y: node.y + 8 }, { x: node.x + 56, y: node.y + 56 });
  const field = page.getByTestId('editor-properties-panel').getByRole('textbox', { name: 'Feather', exact: true });
  const selected = await h.snapshot(node.id, 'selected-original');
  const historyBefore = await page.evaluate(() => window.__vooEditor.captureDocumentSession().history);
  assert.equal(await field.inputValue(), '0');
  await field.fill('7'); const preview = await h.snapshot(node.id, 'preview-seven');
  assert.notEqual(preview.selectionMaskSha256, selected.selectionMaskSha256, 'Real Feather typing changes actual selection coverage');
  await field.press('Escape'); const cancelled = await h.snapshot(node.id, 'cancelled-zero');
  assert.equal(await field.inputValue(), '0');
  assert.deepEqual(cancelled.selection, selected.selection, 'Escape restores the complete original selection, not just its numeric value');
  assert.equal(cancelled.selectionMaskSha256, selected.selectionMaskSha256);
  assert.equal(cancelled.sourceSha256, selected.sourceSha256); assert.deepEqual(cancelled.geometry, selected.geometry);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.captureDocumentSession().history), historyBefore, 'Cancel cannot create or rewrite history');
  results.push({ name: 'seven-escape-zero', status: 'passed', beforePixels: selected.selectedPixelCount, afterPixels: cancelled.selectedPixelCount, restoredSelection: true });
  await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2));

  // Preview cancellation preserves the actual selection-creation Undo/Redo chain.
  await page.getByTestId('editor-marquee-menu-trigger').focus(); await page.keyboard.press('ControlOrMeta+z');
  const undo = await h.snapshot(node.id, 'cancel-history-undo'); assert.equal(undo.selection, null);
  await page.keyboard.press('ControlOrMeta+Shift+z'); const redo = await h.snapshot(node.id, 'cancel-history-redo');
  assert.deepEqual(redo.selection, selected.selection); assert.equal(redo.selectionMaskSha256, selected.selectionMaskSha256);
  assert.equal(redo.sourceSha256, selected.sourceSha256); assert.deepEqual(redo.geometry, selected.geometry);
  results.push({ name: 'cancel-preserves-creation-history', status: 'passed' });

  await field.fill('7'); const firstSeven = await h.snapshot(node.id, 'repeat-first-seven');
  await field.fill('11'); await h.snapshot(node.id, 'repeat-eleven');
  await field.fill('7'); const secondSeven = await h.snapshot(node.id, 'repeat-second-seven');
  assert.deepEqual(secondSeven.selection, firstSeven.selection, 'Preview values always derive from the same preimage');
  assert.equal(secondSeven.selectionMaskSha256, firstSeven.selectionMaskSha256);
  await field.press('Escape'); const repeatCancelled = await h.snapshot(node.id, 'repeat-cancelled');
  assert.deepEqual(repeatCancelled.selection, redo.selection); assert.equal(repeatCancelled.selectionMaskSha256, redo.selectionMaskSha256);
  results.push({ name: 'repeated-preview-does-not-accumulate', status: 'passed' });

  await field.fill('3'); await field.press('Enter'); const committedThree = await h.snapshot(node.id, 'value-three');
  await field.fill('7'); await h.snapshot(node.id, 'three-preview-seven'); await field.press('Escape');
  const cancelledThree = await h.snapshot(node.id, 'cancelled-three');
  assert.equal(await field.inputValue(), '3'); assert.deepEqual(cancelledThree.selection, committedThree.selection);
  assert.equal(cancelledThree.selectionMaskSha256, committedThree.selectionMaskSha256); assert.equal(cancelledThree.sourceSha256, selected.sourceSha256);
  results.push({ name: 'nonzero-value-rollback', status: 'passed' });

  await page.getByTestId('editor-properties-panel').getByRole('radio', { name: 'New selection', exact: true }).click();
  await h.drag({ x: node.x + 68, y: node.y + 64 }, { x: node.x + 120, y: node.y + 116 });
  const replacement = await h.snapshot(node.id, 'replacement-selection'); assert.notDeepEqual(replacement.selection.bounds, committedThree.selection.bounds);
  await field.fill('7'); await h.snapshot(node.id, 'replacement-preview-seven'); await field.press('Escape');
  const restoredReplacement = await h.snapshot(node.id, 'replacement-cancelled');
  assert.deepEqual(restoredReplacement.selection, replacement.selection, 'A later selection must not restore the old selection preimage');
  assert.equal(restoredReplacement.selectionMaskSha256, replacement.selectionMaskSha256); assert.equal(restoredReplacement.sourceSha256, selected.sourceSha256);
  results.push({ name: 'new-selection-invalidates-old-preimage', status: 'passed' });
  await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2));
});
console.log(JSON.stringify({ results, physicalIme: 'notrun', overlayDrawingChanged: false }, null, 2));
