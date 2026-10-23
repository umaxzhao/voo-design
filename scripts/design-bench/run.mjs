#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ready, browserOptions } from './runtime.mjs';
import { DESIGN_BENCH_TASKS } from './tasks.mjs';
import { runAntiAiChecks } from '../../src/canvas/agent/html_pipeline/anti_ai_checks.js';
import { loadLinter, scoreDocument } from './score.mjs';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
export function parseOptions(args) {
  const options = { label: 'after', critique: false, judge: false };
  for (let i = 0; i < args.length; i++) {
    const [flag, ...rest] = args[i].split('=');
    if (['--critique', '--judge', '--help', '--baseline', '--skip-existing'].includes(flag)) {
      if (rest.length) throw new Error(`${flag} takes no value`);
      options[flag.slice(2)] = true;
    } else if (['--model', '--tasks', '--label', '--out'].includes(flag)) {
      const value = rest.length ? rest.join('=') : args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[flag.slice(2)] = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!/^[a-z0-9-]+$/.test(options.label)) throw new Error('--label must match [a-z0-9-]+');
  options.selectedTasks = options.tasks ? options.tasks.split(',') : DESIGN_BENCH_TASKS.map(task => task.id);
  if (new Set(options.selectedTasks).size !== options.selectedTasks.length) throw new Error('Duplicate task IDs');
  for (const id of options.selectedTasks) {
    if (!DESIGN_BENCH_TASKS.some(task => task.id === id)) throw new Error(`Unknown task: ${id}`);
  }
  return options;
}

// Runs inside the editor page; imports match the live Codex E2E harness.
async function runInEditor({ task, model, timeout, critique, images }) {
  const out = { toolCalls: [], rounds: [], reply: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let unsubscribe;
  let closeSession;
  let completedTools = 0;
  let frameTimer;
  let frameBusy = false;
  globalThis.__VOO_DESIGN_BENCH__ = true;
  globalThis.__VOO_DESIGN_BENCH_IMAGES__ = images;
  try {
    const { createDocument } = await import('/src/canvas/editor/scene_model.js');
    const editor = window.__vooEditor;
    editor.updateDocument(createDocument(task.frame.w, task.frame.h));
    const { ensureLocalCliBridge } = await import('/src/canvas/components/agent-panel/local_cli_bridge.js');
    const { streamCliStep } = await import('/src/canvas/agent/cli_agent_step.js');
    const { runAgentTurn } = await import('/src/canvas/agent/canvas_agent.js');
    const { CANVAS_TOOL_SCHEMAS, executeCanvasTool, AGENT_SETTING } = await import('/src/canvas/agent/canvas_tools.js');
    const { setSetting } = await import('/src/shared/settings.js');
    ({ closeCodexSession: closeSession } = await import('/src/canvas/components/agent-panel/codex_transport.js'));
    console.log('[bench] ensure bridge');
    const bridge = await ensureLocalCliBridge();
    console.log('[bench] connect');
    if (!bridge) throw new Error('Local CLI bridge unavailable');
    const connected = await bridge.connect();
    const status = connected.value ?? connected;
    if (!connected.ok || !status.authenticated) throw new Error(`Codex not ready: ${JSON.stringify(connected)}`);
    const selected = model || status.models?.find(item => item.isDefault)?.id || status.models?.[0]?.id || 'gpt-6-astra';
    const cliModel = selected.startsWith('codex:') ? selected : `codex:${selected}`;
    out.model = cliModel;
    setSetting(AGENT_SETTING.MODEL, cliModel);
    unsubscribe = bridge.onText(event => { if (event.text) out.reply += event.text; });
    const prompt = `${task.prompt}\nCreate the complete design within a ${task.frame.w}×${task.frame.h}px canvas, with an outer frame named "${task.id}" at (0, 0). Use editable canvas elements and realistic finished content. Do not rely on external images or assets. Create a complete UI page/screen.`;
    const history = [];
    async function turn(userText) {
      const reply = await runAgentTurn({
        config: { model: cliModel }, history: [...history], userText,
        tools: CANVAS_TOOL_SCHEMAS,
        executeTool: async (name, args, ...rest) => {
          if (name === 'capture_canvas') {
            args = { ...args, maxSize: Math.min(args?.maxSize || 960, 512) };
          }
          const result = await executeCanvasTool(name, args, ...rest);
          if (name === 'capture_canvas' && result.ok && result.dataUrl?.length > 180000) {
            return {
              ...result,
              dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
              note: 'downscaled for bench memory',
            };
          }
          return result;
        },
        chooseDirection: () => 'auto', frame: { width: task.frame.w, height: task.frame.h },
        streamStep: streamCliStep, signal: controller.signal, maxSteps: 40,
        onToolEvent: event => {
          if (event.status !== 'in_progress') console.log('[bench] tool', event.name, event.status);
          if (event.status !== 'in_progress') out.toolCalls.push({ name: event.name, status: event.status, error: event.error });
          if ((event.status === 'completed' || event.status === 'error') && ++completedTools % 4 === 0 && window.__vooEditor) {
            window.__vooBenchCheckpoint?.(JSON.parse(JSON.stringify(window.__vooEditor.getDocument())));
          }
        },
      });
      history.push({ role: 'user', content: userText }, { role: 'assistant', content: reply || '' });
      return reply;
    }
    if (window.__vooBenchFrame) frameTimer = setInterval(async () => {
      if (frameBusy || controller.signal.aborted) return;
      frameBusy = true;
      try {
        const canvas = await (editor.exportPngCanvas?.() ?? editor.renderComposite?.());
        if (canvas) await window.__vooBenchFrame(canvas.toDataURL('image/png'));
      } catch (error) { console.warn('[bench] frame capture', error.message); }
      finally { frameBusy = false; }
    }, 2000);
    console.log('[bench] turn start');
    out.finalReply = await turn(prompt);
    if (controller.signal.aborted) throw new Error('Task timed out');
    if (critique) {
      const { lintDesign } = await import('/src/canvas/agent/design_quality/lint.js');
      const { runCritiqueLoop, formatIssuesForModel } = await import('/src/canvas/agent/design_quality/critique_loop.js');
      let fixes = 0;
      // The contract's maxRounds counts lint rounds; a hard cap also guards fixes.
      out.critique = await runCritiqueLoop({
        lint: () => lintDesign(editor.getDocument()), maxRounds: 3, threshold: 85,
        fix: async (feedbackText, round) => {
          if (fixes >= 2) return;
          fixes++;
          out.finalReply = await turn(`Refine the existing ${task.id} design in place, keeping its canvas dimensions and intended content.\n${typeof feedbackText === 'string' ? feedbackText : formatIssuesForModel(feedbackText)}\nCritique pass ${round}.`);
          if (controller.signal.aborted) throw new Error('Task timed out during critique');
        },
      });
      out.rounds = out.critique.rounds;
    }
    if (!editor.getDocument().nodes.length) throw new Error('Agent produced an empty document');
  } catch (error) { out.error = error.stack || String(error); }
  finally {
    clearTimeout(timer);
    clearInterval(frameTimer);
    unsubscribe?.();
    try { await closeSession?.(AbortSignal.timeout(10000)); }
    catch (error) { out.sessionCloseError = error.message; }
    out.doc = JSON.parse(JSON.stringify(window.__vooEditor.getDocument()));
    await window.__vooBenchCheckpoint?.(out.doc);
    try {
      const { executeCanvasTool } = await import('/src/canvas/agent/canvas_tools.js');
      const captured = await executeCanvasTool('capture_canvas', { maxSize: Math.min(960, Math.max(task.frame.w, task.frame.h)) });
      if (!captured.ok || !captured.dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Canvas capture returned no PNG');
      out.png = captured.dataUrl;
    } catch (error) { out.captureError = error.message; }
  }
  return out;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) {
    console.log('npm run bench:design -- [--model MODEL] [--tasks=id1,id2] [--critique] [--baseline] [--label=LABEL] [--judge] [--skip-existing] [--out=DIR]\nPorts: VOO_DESIGN_BENCH_BRIDGE_PORT (4290), VOO_DESIGN_BENCH_VITE_PORT (5199).\nOutputs: /workspace/tmp/design-bench/<label>/{<id>.png,<id>.json,scores.json}\nRescore: node scripts/design-bench/score.mjs --label=after [--judge]\nCompare: node scripts/design-bench/report.mjs --a=before --b=after');
    return;
  }
  const { chromium } = await import('playwright');
  const lint = await loadLinter();
  if (options.critique && !lint) console.warn('Warning: critique skipped because the linter is missing.');
  const timeout = Number(process.env.VOO_DESIGN_BENCH_TIMEOUT_MS || 480000);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Invalid VOO_DESIGN_BENCH_TIMEOUT_MS');
  const bridgePort = process.env.VOO_DESIGN_BENCH_BRIDGE_PORT || process.env.VOO_CODEX_BRIDGE_PORT || '4290';
  const vitePort = process.env.VOO_DESIGN_BENCH_VITE_PORT || process.env.VOO_CODEX_VITE_PORT || '5199';
  const env = {
    ...process.env,
    NO_PROXY: [...new Set(`${process.env.NO_PROXY || ''},127.0.0.1,localhost`.split(','))].join(','),
    VOO_CLI_BRIDGE_PORT: bridgePort, VITE_CLI_BRIDGE_URL: `ws://127.0.0.1:${bridgePort}`,
  };
  const children = [];
  const output = `/workspace/tmp/design-bench/${options.label}`;
  await mkdir(output, { recursive: true });
  if (options.out) await mkdir(options.out, { recursive: true });
  const results = { label: options.label, model: options.model || process.env.VOO_CODEX_MODEL || null, critique: options.critique, startedAt: new Date().toISOString(), tasks: [] };
  if (options['skip-existing']) {
    try { results.tasks = JSON.parse(await readFile(`${output}/scores.json`, 'utf8')).tasks; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const save = () => writeFile(`${output}/scores.json`, `${JSON.stringify(results, null, 2)}\n`);
  function start(args) {
    const child = spawn('npm', args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    child.on('error', error => { child.startError = error; });
    for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => process.stderr.write(chunk));
    return child;
  }
  try {
    const bridge = start(['run', 'bridge']);
    const vite = start(['run', 'dev', '--', '--host', '127.0.0.1', '--port', vitePort, '--strictPort']);
    await Promise.all([ready(`http://127.0.0.1:${bridgePort}/health`, bridge), ready(`http://127.0.0.1:${vitePort}`, vite)]);
    await Promise.all(['/', '/src/canvas/agent/canvas_tools.js'].map(path => fetch(`http://127.0.0.1:${vitePort}${path}`).catch(() => {})));
    const runOne = async id => {
      const task = DESIGN_BENCH_TASKS.find(item => item.id === id);
      if (options['skip-existing']) {
        let exists = false;
        try { await Promise.all(['json', 'png'].map(ext => access(`${output}/${id}.${ext}`))); exists = true; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (exists) {
          console.error(`Design benchmark: ${id} (skipped)`);
          if (!results.tasks.some(item => item.id === id)) {
            const doc = JSON.parse(await readFile(`${output}/${id}.json`, 'utf8'));
            results.tasks.push({ id, kind: task.kind, frame: task.frame, document: `${output}/${id}.json`, screenshot: `${output}/${id}.png`, ...await scoreDocument(doc, { lint }) });
          }
          if (options.out) await copyFile(`${output}/${id}.png`, resolve(options.out, `${id}.png`));
          await save();
          return;
        }
      }
      console.error(`Design benchmark: ${id}`);
      const browser = await chromium.launch(browserOptions);
      try {
        const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
        await context.addInitScript(baseline => { globalThis.__VOO_DESIGN_QUALITY_OFF__ = baseline; }, !!options.baseline);
        const page = await context.newPage();
        page.on('crash', () => console.error(`[crash] ${id}`));
        let heapInterval;
        if (process.env.VOO_DESIGN_BENCH_DEBUG) page.on('console', m => console.error(`[page] ${m.text().slice(0, 300)}`));
        if (process.env.VOO_DESIGN_BENCH_DEBUG) heapInterval = setInterval(async () => {
          try {
            const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize);
            if (heap !== undefined) console.error(`[heap] ${id} ${(heap / 1024 / 1024).toFixed(1)}`);
          } catch {}
        }, 30000);
        const started = Date.now();
        let watchdog;
        let record = { id, kind: task.kind, frame: task.frame };
        let lastCheckpoint = null;
        try {
          const framesDir = process.env.VOO_DESIGN_BENCH_FRAMES_DIR;
          if (framesDir) {
            await mkdir(framesDir, { recursive: true });
            let frameIndex = 0;
            await page.exposeFunction('__vooBenchFrame', async png => {
              if (!png?.startsWith('data:image/png;base64,')) return;
              const filename = `${id}-${String(frameIndex++).padStart(3, '0')}.png`;
              await writeFile(resolve(framesDir, filename), Buffer.from(png.split(',')[1], 'base64'));
            });
          }
          await page.exposeFunction('__vooBenchSourceHtml', async html => {
            await writeFile(`${output}/${id}.html`, html);
            record.sourceHtml = `${output}/${id}.html`;
            record.antiAi = runAntiAiChecks({ html, frame: task.frame });
            record.failed = record.antiAi.hardFail;
          });
          await page.exposeFunction('__vooBenchCheckpoint', payload => {
            if (payload?.nodes?.length) lastCheckpoint = payload;
          });
          try {
            await page.goto(`http://127.0.0.1:${vitePort}/?voo-test=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
          } catch {
            await page.goto(`http://127.0.0.1:${vitePort}/?voo-test=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
          }
          await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
          const result = await Promise.race([
            page.evaluate(runInEditor, { task, model: options.model || process.env.VOO_CODEX_MODEL, timeout, images: process.env.VOO_DESIGN_BENCH_IMAGES === '1', critique: options.critique && !!lint }),
            new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('Task exceeded hard deadline')), timeout + 30000); }),
          ]);
          const { doc, png, ...details } = result;
          Object.assign(record, details);
          if (doc?.nodes?.length) lastCheckpoint = doc;
          if (!png) throw new Error(`Screenshot unavailable: ${result.captureError}`);
          if (record.error) record.partial = true;
          record.document = `${output}/${id}.json`;
          await writeFile(record.document, `${JSON.stringify(doc, null, 2)}\n`);
          if (png) {
            record.screenshot = `${output}/${id}.png`;
            await writeFile(record.screenshot, Buffer.from(png.split(',')[1], 'base64'));
          } else record.error ||= `Screenshot unavailable: ${result.captureError}`;
          Object.assign(record, await scoreDocument(doc, { lint, antiAi: record.antiAi, screenshot: record.screenshot, judge: options.judge && !!png }));
        } catch (error) {
          record.error = error.stack || String(error);
          try {
            // Stop the timed-out agent before restoring its latest checkpoint in a fresh page.
            let doc = lastCheckpoint;
            if (!doc) {
              try { doc = await page.evaluate(() => JSON.parse(JSON.stringify(window.__vooEditor.getDocument()))); }
              catch {}
            }
            if (!doc?.nodes?.length) throw new Error('No checkpoint document to salvage');
            record.partial = true;
            record.document = `${output}/${id}.json`;
            await writeFile(record.document, `${JSON.stringify(doc, null, 2)}\n`);
            await page.close();
            const recovery = await context.newPage();
            await recovery.goto(`http://127.0.0.1:${vitePort}/?voo-test=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
            await recovery.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
            if (!doc?.nodes?.length) throw new Error('No checkpoint document to salvage');
            await recovery.evaluate(doc => window.__vooEditor.updateDocument(doc), doc);
            await recovery.waitForTimeout(1500);
            const png = await recovery.evaluate(async size => {
              const { executeCanvasTool } = await import('/src/canvas/agent/canvas_tools.js');
              const captured = await executeCanvasTool('capture_canvas', { maxSize: size });
              if (!captured.ok || !captured.dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Canvas capture returned no PNG');
              return captured.dataUrl;
            }, Math.min(960, Math.max(task.frame.w, task.frame.h)));
            const salvage = { doc, png };
            if (salvage.doc?.nodes?.length) {
              record.partial = true;
              record.document = `${output}/${id}.json`;
              await writeFile(record.document, `${JSON.stringify(salvage.doc, null, 2)}\n`);
              if (salvage.png?.startsWith('data:image/png;base64,')) {
                record.screenshot = `${output}/${id}.png`;
                await writeFile(record.screenshot, Buffer.from(salvage.png.split(',')[1], 'base64'));
              }
              Object.assign(record, await scoreDocument(salvage.doc, { lint, antiAi: record.antiAi, screenshot: record.screenshot, judge: options.judge && !!record.screenshot }));
            }
          } catch (salvageError) { record.salvageError = salvageError.message; }
        }
        finally { clearTimeout(watchdog); clearInterval(heapInterval); await context.close(); }
        if (options.out && record.screenshot) await copyFile(record.screenshot, resolve(options.out, `${id}.png`));
        record.durationMs = Date.now() - started;
        results.tasks = results.tasks.filter(item => item.id !== id);
        results.tasks.push(record);
        await save();
        console.error(`${id}: ${record.failed || record.error && !record.partial ? 'FAILED' : `lint ${record.lint?.score ?? 'unavailable'}`}`);
      } finally { await browser.close(); }
    };
    for (const id of options.selectedTasks) await runOne(id);
  } finally {
    for (const child of children.reverse()) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    }
    for (const child of children) {
      if (child.exitCode === null) await Promise.race([
        new Promise(resolveExit => child.once('exit', resolveExit)),
        new Promise(resolveWait => setTimeout(resolveWait, 1500)),
      ]);
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    results.finishedAt = new Date().toISOString();
    await save();
  }
  console.log(`${output}/scores.json`);
  if (results.tasks.some(task => task.error || task.judgeError || task.failed)) process.exitCode = 1;
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
