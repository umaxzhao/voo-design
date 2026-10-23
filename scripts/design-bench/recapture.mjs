#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ready, browserOptions, awaitKill } from './runtime.mjs';

const cwd = fileURLToPath(new URL('../../', import.meta.url));

export async function recapture({ label, tasks, scoreOnly = false, repaint = false, out } = {}) {
  if (!/^[a-z0-9-]+$/.test(label || '')) throw new Error('--label must match [a-z0-9-]+');
  const directory = `/workspace/tmp/design-bench/${label}`;
  const manifest = `${directory}/scores.json`;
  const scores = JSON.parse(await readFile(manifest, 'utf8'));
  const ids = tasks ?? scores.tasks.map(task => task.id);
  if (ids.some(id => !/^[\w-]+$/.test(id))) throw new Error('Invalid task ID');
  if (out) await mkdir(out, { recursive: true });
  const port = process.env.VOO_DESIGN_BENCH_VITE_PORT || process.env.VOO_CODEX_VITE_PORT || '5199';
  const url = `http://127.0.0.1:${port}`;
  let vite;
  let chromium;
  async function render(doc, maxSize) {
    if (!vite) {
      ({ chromium } = await import('playwright'));
      vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
        cwd, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      vite.on('error', error => { vite.startError = error; });
      for (const pipe of [vite.stdout, vite.stderr]) pipe.on('data', chunk => process.stderr.write(chunk));
    }
    await ready(url, vite);
    const browser = await chromium.launch(browserOptions);
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
      await page.goto(`${url}/?voo-test=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
      await page.evaluate(async doc => {
        const { createDocument } = await import('/src/canvas/editor/scene_model.js');
        window.__vooEditor.updateDocument(createDocument());
        window.__vooEditor.updateDocument(doc);
        await document.fonts.ready;
      }, doc);
      await page.waitForTimeout(1500);
      return await page.evaluate(async maxSize => {
        const { executeCanvasTool } = await import('/src/canvas/agent/canvas_tools.js');
        const captured = await executeCanvasTool('capture_canvas', { maxSize });
        if (!captured.ok || !captured.dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Canvas capture returned no PNG');
        return captured.dataUrl;
      }, maxSize);
    } finally { await browser.close(); }
  }
  try {
    for (const id of ids) {
      const screenshot = `${directory}/${id}.png`;
      try {
        let exists = false;
        if (scoreOnly && !repaint) {
          try { await access(screenshot); exists = true; }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const record = scores.tasks.find(task => task.id === id);
        if (!exists) {
          const doc = JSON.parse(await readFile(`${directory}/${id}.json`, 'utf8'));
          const maxSize = record?.frame ? Math.min(960, Math.max(record.frame.w, record.frame.h)) : 960;
          const png = await render(doc, maxSize);
          await writeFile(screenshot, Buffer.from(png.split(',')[1], 'base64'));
        }
        if (out) await copyFile(screenshot, resolve(out, `${id}.png`));
        if (record) record.screenshot = screenshot;
        else scores.tasks.push({ id, document: `${directory}/${id}.json`, screenshot });
        await writeFile(manifest, `${JSON.stringify(scores, null, 2)}\n`);
      } catch (error) {
        console.error(`Failed to recapture ${id}:`, error);
        process.exitCode = 1;
      }
    }
  } finally {
    if (vite) await awaitKill(vite);
  }
  return scores;
}

// Preserve existing PNGs; render missing ones through the app.
export const scoreOnly = options => recapture({ ...options, scoreOnly: true });
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--label=')) options.label = arg.slice(8);
    else if (arg.startsWith('--tasks=')) options.tasks = arg.slice(8).split(',');
    else if (arg.startsWith('--out=')) {
      options.out = arg.slice(6);
      if (!options.out) throw new Error('Missing value for --out');
    } else if (arg === '--score-only') options.scoreOnly = true;
    else if (arg === '--repaint') options.repaint = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  recapture(options).catch(error => { console.error(error); process.exitCode = 1; });
}
