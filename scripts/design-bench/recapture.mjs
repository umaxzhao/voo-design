#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function recapture({ label, tasks, scoreOnly = false } = {}) {
  if (!['before', 'after'].includes(label)) throw new Error('--label must be before or after');
  const directory = `/workspace/tmp/design-bench/${label}`;
  const manifest = `${directory}/scores.json`;
  const scores = JSON.parse(await readFile(manifest, 'utf8'));
  const ids = tasks ?? scores.tasks.map(task => task.id);
  if (ids.some(id => !/^[\w-]+$/.test(id))) throw new Error('Invalid task ID');
  const port = Number(process.env.VOO_DESIGN_BENCH_RECAPTURE_PORT || 5299);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid recapture port');
  const url = `http://127.0.0.1:${port}`;
  let vite, browser, startError;
  const kill = () => { if (vite?.pid) { try { process.kill(-vite.pid, 'SIGKILL'); } catch {} } };
  const stop = () => {
    kill();
    setTimeout(() => process.exit(1), 3000).unref();
    if (browser) browser.close().catch(() => {}).finally(() => process.exit(1));
    else process.exit(1);
  };
  process.once('exit', kill);
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    for (const id of ids) {
      const screenshot = `${directory}/${id}.png`;
      try {
        let exists = false;
        try { await access(screenshot); exists = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!scoreOnly || !exists) {
          const doc = JSON.parse(await readFile(`${directory}/${id}.json`, 'utf8'));
          if (!browser) {
            vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
              cwd: fileURLToPath(new URL('../../', import.meta.url)), detached: true, stdio: ['ignore', 'inherit', 'inherit'],
            });
            vite.on('error', error => { startError = error; });
            const deadline = Date.now() + 240000;
            while (true) {
              if (startError) throw startError;
              if (vite.exitCode !== null || vite.signalCode) throw new Error('Vite exited before capture');
              try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) break; } catch {}
              if (Date.now() >= deadline) throw new Error('Vite readiness timed out');
              await new Promise(done => setTimeout(done, 250));
            }
            const { chromium } = await import('playwright');
            browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=3072', '--disable-dev-shm-usage'] });
          }
          const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
          try {
            const page = await context.newPage();
            await page.goto(`${url}/?voo-test=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
            await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
            const frame = await page.evaluate(doc => {
              const editor = window.__vooEditor;
              editor.updateDocument(doc);
              editor.requestRender?.();
              return { w: doc.width || doc.w, h: doc.height || doc.h };
            }, doc);
            await page.waitForTimeout(800);
            try {
              await page.locator('[data-testid="workspace-skia-canvas"], [data-testid="skia-canvas"], canvas').first()
                .screenshot({ path: screenshot, type: 'png' });
            } catch {
              const viewport = page.viewportSize();
              const dimension = (value, maximum) => Number.isFinite(Number(value)) && Number(value) > 0
                ? Math.min(Number(value), maximum) : maximum;
              await page.screenshot({
                path: screenshot, type: 'png',
                clip: { x: 0, y: 0, width: dimension(frame.w, viewport.width), height: dimension(frame.h, viewport.height) },
              });
            }
          } finally { await context.close(); }
        }
      } catch (error) {
        console.error(`Failed to recapture ${id}:`, error);
      }
      try { await access(screenshot); }
      catch (error) {
        if (error.code !== 'ENOENT') console.error(`Failed to access screenshot for ${id}:`, error);
        continue;
      }
      const record = scores.tasks.find(task => task.id === id);
      if (record) record.screenshot = screenshot;
      else scores.tasks.push({ id, document: `${directory}/${id}.json`, screenshot });
      await writeFile(manifest, `${JSON.stringify(scores, null, 2)}\n`);
    }
    await writeFile(manifest, `${JSON.stringify(scores, null, 2)}\n`);
    return scores;
  } finally {
    kill();
    try { await browser?.close(); }
    finally {
      process.removeListener('exit', kill);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  }
}

// For scoring workflows: keep existing PNGs, capture only missing images.
export const scoreOnly = options => recapture({ ...options, scoreOnly: true });

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--label=')) options.label = arg.slice(8);
    else if (arg.startsWith('--tasks=')) options.tasks = arg.slice(8).split(',');
    else if (arg === '--score-only') options.scoreOnly = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  recapture(options).catch(error => { console.error(error); process.exitCode = 1; });
}
