// Run against `npm run build && npm run preview -- --port 5253`:
// flock /tmp/voo-e2e.lock node tests/e2e/qa3_roundtrip.e2e.mjs
// VOO_URL and VOO_SCREENSHOT_DIR override the defaults. Uses no live AI service.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeVooBinary } from '../../src/canvas/store/voo_binary.js';

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const shots = process.env.VOO_SCREENSHOT_DIR || join(tmpdir(), "voo-qa3-roundtrip");
await mkdir(shots, { recursive: true });
await withEditorBrowser(async ({ page, origin, errors }) => {
  page.setDefaultTimeout(30000);
  try {
  await page.addInitScript(() => {
    localStorage.setItem('ciw.locale', JSON.stringify('en'));
    localStorage.setItem('agent.model', JSON.stringify('qa-mock'));
    localStorage.setItem('agent.apiKey', JSON.stringify('qa-mock-only'));
    localStorage.setItem('agent.baseUrl', JSON.stringify('https://qa.invalid/v1'));
    // Exercise the portable download + file-input path in Chromium.
    window.showSaveFilePicker = undefined;
    window.showOpenFilePicker = undefined;
  });
  let requests = 0;
  await page.route('https://qa.invalid/v1/chat/completions', async route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,authorization', 'access-control-allow-methods': 'POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    requests++;
    const delta = requests === 1 ? { tool_calls: [{ index: 0, id: 'qa-shape', type: 'function', function: {
      name: 'create_shape', arguments: JSON.stringify({ kind: 'rect', x: 80, y: 80, width: 240, height: 120, fill: '#a7ffd4', name: 'Agent card' }),
    } }] } : { content: 'Created the QA card.' };
    // Regression: a compatible service can close without a trailing newline.
    await route.fulfill({ headers, contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta }] })}` });
  });
  const screenshot = async name => {
    await page.screenshot({ path: `${shots}/${name}.png`, timeout: 60000 });
    console.log(`STEP ${name}`);
  };
  await page.goto(`${origin}/?voo-test=1`);
  await page.getByRole('button', { name: 'New', exact: true }).waitFor();
  await screenshot('01-open');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.waitForFunction(() => !!window.__vooEditor);
  await page.getByTestId('design-editor').waitFor();
  await screenshot('02-new-document');
  await page.waitForFunction(() => document.querySelector('[data-open-guard]')?.getAttribute('data-open-guard') === 'off');
  const initialNodes = await page.evaluate(() => window.__vooEditor.getDocument().nodes);
  const canvas = page.locator('[data-editor-artboard]').first();
  const box = await canvas.boundingBox();
  assert.ok(box?.width > 500);
  const x = box.x + box.width * .55, y = box.y + box.height * .5;
  const count = await page.evaluate(() => window.__vooEditor.getDocument().nodes.length);
  await page.keyboard.press('r');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 130, y + 90, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(n => window.__vooEditor.getDocument().nodes.length === n + 1, count);
  const rect = await page.evaluate(() => window.__vooEditor.getDocument().nodes.at(-1));
  assert.equal(rect.kind, 'rect');
  await screenshot('03-draw');
  await page.keyboard.press('v');
  await page.locator(`[id="layer-row-${rect.id}"]`).click();
  await page.getByLabel('X', { exact: true }).fill('150');
  await page.getByLabel('X', { exact: true }).press('Enter');
  await page.waitForFunction(id => window.__vooEditor.getDocument().nodes.find(n => n.id === id)?.x === 150, rect.id);
  await screenshot('04-edit');
  await page.keyboard.press('Control+k');
  const palette = page.getByTestId('command-palette');
  await palette.getByRole('combobox').fill('Open VOO Agent');
  await palette.getByRole('option').first().click();
  const composer = page.getByRole('textbox', { name: 'Describe what to create on the canvas', exact: true });
  await composer.fill('Create a mint QA card');
  await composer.press('Enter');
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(n => n.name === 'Agent card'));
  await page.getByText('Created the QA card.', { exact: true }).waitFor();
  assert.equal(requests, 2);
  await screenshot('05-agent-generation');
  // Verify the agent edit is one undoable turn.
  await canvas.click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => !window.__vooEditor.getDocument().nodes.some(n => n.name === 'Agent card'));
  await page.keyboard.press('Control+Shift+z');
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(n => n.name === 'Agent card'));
  for (const format of ['png', 'svg', 'pdf']) {
    await page.keyboard.press('Control+Shift+e');
    const dialog = page.getByTestId('design-export-dialog');
    await dialog.getByRole('button', { name: format === 'png' ? 'PNG (lossless)' : format === 'pdf' ? 'PDF (raster)' : 'SVG', exact: true }).click();
    await screenshot(`06-export-${format}`);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(`${shots}/export.${format}`);
    const bytes = await readFile(`${shots}/export.${format}`);
    assert.ok(bytes.length > 100);
    if (format === 'png') {
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(bytes.readUInt32BE(16), 1200);
      assert.equal(bytes.readUInt32BE(20), 800);
      const pixel = await page.evaluate(async data => {
        const image = await createImageBitmap(await (await fetch(data)).blob());
        const output = document.createElement('canvas');
        output.width = image.width; output.height = image.height;
        const ctx = output.getContext('2d'); ctx.drawImage(image, 0, 0);
        const pixel = Array.from(ctx.getImageData(100, 100, 1, 1).data);
        image.close();
        return pixel;
      }, `data:image/png;base64,${bytes.toString('base64')}`);
      assert.deepEqual(pixel, [167, 255, 212, 255], 'PNG must contain the generated mint card');
    }
    if (format === 'svg') { assert.match(bytes.toString(), /<svg/); assert.match(bytes.toString(), /#a7ffd4/i); }
    if (format === 'pdf') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    await dialog.waitFor({ state: 'hidden' });
  }
  const before = await page.evaluate(() => window.__vooEditor.serialise().nodes);
  const saveDownload = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { saveVooProject } = await import('/src/canvas/store/project_io.js');
    const { useDesignStore } = await import('/src/store/design_store.js');
    const store = useDesignStore.getState();
    await saveVooProject({ store, saveAs: true,
      enginesRef: { current: new Map([[store.editingNodeId, { engine: window.__vooEditor, ready: true }]]) } });
  });
  const saved = await saveDownload;
  const projectPath = `${shots}/roundtrip.voo`;
  await saved.saveAs(projectPath);
  await screenshot('07-save');
  await canvas.click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForFunction(count => window.__vooEditor.getDocument().nodes.length === count, initialNodes.length);
  assert.deepEqual(await page.evaluate(() => window.__vooEditor.getDocument().nodes), initialNodes);
  page.on('dialog', dialog => dialog.accept());
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import project file (⌘O / Ctrl+O)', exact: true }).click();
  await (await chooserPromise).setFiles(projectPath);
  await page.locator('.app-title-bar').getByRole('tab', { name: 'roundtrip', exact: true }).waitFor();
  await page.getByTestId('design-editor').waitFor();
  await page.waitForFunction(() => window.__vooEditor?.getDocument().nodes.some(n => n.name === 'Agent card') && document.querySelector('[data-open-guard]')?.getAttribute('data-open-guard') === 'off');
  const after = await page.evaluate(() => window.__vooEditor.serialise().nodes);
  await screenshot('08-reopen');
  const savedNodeCount = decodeVooBinary(new Uint8Array(await readFile(projectPath))).document.nodes.length;
  await writeFile(`${shots}/report.json`, JSON.stringify({ expectedNodeCount: before.length, savedNodeCount, reopenedNodeCount: after.length, mockRequests: requests, exportFormats: ['png', 'svg', 'pdf'], pageErrors: errors }, null, 2));
  assert.equal(savedNodeCount, before.length, 'Save must serialize live engine nodes, not the initial empty document');
  // The codec omits undefined properties; absent clipTo and null both mean no mask.
  // Compare every remaining field, including non-null mask references and paints.
  const persisted = nodes => JSON.parse(JSON.stringify(nodes.map(node => ({ ...node, clipTo: node.clipTo ?? null }))));
  assert.deepEqual(persisted(after), persisted(before), 'Saved document must preserve every persisted node field');
  assert.deepEqual(errors, []);
  console.log(`PASS: ${after.length} nodes, ${requests} mock requests, 3 exports, save/reopen, zero page errors`);
} catch (error) {
  if (page) { await page.screenshot({ path: `${shots}/failure.png` }).catch(() => {}); console.log((await page.locator('body').innerText()).slice(0, 8000)); }
  throw error;
  }
}, { openDocument: false, mcpLink: false });
