// Run under flock; needs Xvfb on headless Linux and an installed Electron binary.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { _electron as electron } from 'playwright';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const shots = process.env.VOO_SCREENSHOT_DIR || '/workspace/tmp/shots-qa3r';
await mkdir(shots, { recursive: true });
const app = await electron.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '.'],
  env: { ...process.env, XDG_CONFIG_HOME: `${shots}/electron-config`, XDG_CACHE_HOME: `${shots}/electron-cache`, VITE_DEV_SERVER_URL: process.env.VOO_URL || 'http://127.0.0.1:5253/?voo-test=1' },
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'New', exact: true }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${shots}/09-electron-open.png` });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.waitForFunction(() => !!window.__vooEditor);
  assert.ok(await page.evaluate(() => !!window.electronAPI), 'Desktop preload must be available');
  await page.waitForFunction(() => document.querySelector('[data-testid="design-editor"] [data-open-guard]')
    ?.getAttribute('data-open-guard') === 'off', null, { timeout: 60000 });
  const canvas = page.locator('[data-testid="editor-pages"] canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 20000 });
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, 'Visible editor canvas must have nonzero bounds');
  await page.keyboard.press('r');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(n => n.kind === 'rect'));
  await page.screenshot({ path: `${shots}/10-electron-draw.png` });
  assert.deepEqual(errors, []);
  console.log('PASS: Electron preload, create document, pointer drawing, zero page errors');
} finally {
  // A desktop quit hook must not strand Electron children or the shared lock.
  const child = app.process();
  let timer;
  try {
    await Promise.race([
      app.close(),
      new Promise(resolve => { timer = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; child.kill('SIGKILL'); }
        console.log('Electron cleanup: forced process-group exit after quit timeout');
        resolve();
      }, 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
