#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { DESIGN_BENCH_TASKS } from './tasks.mjs';
import { loadLinter, scoreDocument } from './score.mjs';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
export function parseOptions(args) {
  const options = { label: 'after', critique: false, judge: false };
  for (let i = 0; i < args.length; i++) {
    const [flag, ...rest] = args[i].split('=');
    if (['--critique', '--judge', '--help', '--baseline'].includes(flag)) {
      if (rest.length) throw new Error(`${flag} takes no value`);
      options[flag.slice(2)] = true;
    } else if (['--model', '--tasks', '--label'].includes(flag)) {
      const value = rest.length ? rest.join('=') : args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[flag.slice(2)] = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!['before', 'after'].includes(options.label)) throw new Error('--label must be before or after');
  options.selectedTasks = options.tasks ? options.tasks.split(',') : DESIGN_BENCH_TASKS.map(task => task.id);
  if (new Set(options.selectedTasks).size !== options.selectedTasks.length) throw new Error('Duplicate task IDs');
  for (const id of options.selectedTasks) {
    if (!DESIGN_BENCH_TASKS.some(task => task.id === id)) throw new Error(`Unknown task: ${id}`);
  }
  return options;
}

async function ready(url, child) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.startError) throw child.startError || new Error(`Server exited: ${child.exitCode}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

// Runs inside the editor page; imports match the live Codex E2E harness.
async function runInEditor({ task, model, timeout, critique }) {
  const out = { toolCalls: [], rounds: [], reply: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let unsubscribe;
  let closeSession;
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
    const bridge = await ensureLocalCliBridge();
    if (!bridge) throw new Error('Local CLI bridge unavailable');
    const connected = await bridge.connect();
    const status = connected.value ?? connected;
    if (!connected.ok || !status.authenticated) throw new Error(`Codex not ready: ${JSON.stringify(connected)}`);
    const selected = model || status.models?.find(item => item.isDefault)?.id || status.models?.[0]?.id || 'gpt-6-astra';
    const cliModel = selected.startsWith('codex:') ? selected : `codex:${selected}`;
    out.model = cliModel;
    setSetting(AGENT_SETTING.MODEL, cliModel);
    unsubscribe = bridge.onText(event => { if (event.text) out.reply += event.text; });
    const prompt = `${task.prompt}\nCreate the complete design within a ${task.frame.w}×${task.frame.h}px canvas, with an outer frame named "${task.id}" at (0, 0). Use editable canvas elements and realistic finished content. Do not rely on external images or assets.`;
    const history = [];
    async function turn(userText) {
      const reply = await runAgentTurn({
        config: { model: cliModel }, history: [...history], userText,
        tools: CANVAS_TOOL_SCHEMAS, executeTool: executeCanvasTool,
        streamStep: streamCliStep, signal: controller.signal, maxSteps: 64,
        onToolEvent: event => {
          if (event.status !== 'in_progress') out.toolCalls.push({ name: event.name, status: event.status, error: event.error });
        },
      });
      history.push({ role: 'user', content: userText }, { role: 'assistant', content: reply || '' });
      return reply;
    }
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
    unsubscribe?.();
    try { await closeSession?.(AbortSignal.timeout(10000)); }
    catch (error) { out.sessionCloseError = error.message; }
    out.doc = JSON.parse(JSON.stringify(window.__vooEditor.getDocument()));
    try {
      const { executeCanvasTool } = await import('/src/canvas/agent/canvas_tools.js');
      const captured = await executeCanvasTool('capture_canvas', { maxSize: Math.max(task.frame.w, task.frame.h) });
      if (!captured.ok || !captured.dataUrl?.startsWith('data:image/png;base64,')) throw new Error('Canvas capture returned no PNG');
      out.png = captured.dataUrl;
    } catch (error) { out.captureError = error.message; }
  }
  return out;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) {
    console.log('npm run bench:design -- [--model MODEL] [--tasks=id1,id2] [--critique] [--baseline] [--label=before|after] [--judge]\nPorts: VOO_DESIGN_BENCH_BRIDGE_PORT (4190), VOO_DESIGN_BENCH_VITE_PORT (5199).\nOutputs: /workspace/tmp/design-bench/<label>/{<id>.png,<id>.json,scores.json}\nRescore: node scripts/design-bench/score.mjs --label=after [--judge]\nCompare: node scripts/design-bench/report.mjs');
    return;
  }
  const { chromium } = await import('playwright');
  const lint = await loadLinter();
  if (options.critique && !lint) console.warn('Warning: critique skipped because the linter is missing.');
  const timeout = Number(process.env.VOO_DESIGN_BENCH_TIMEOUT_MS || 360000);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Invalid VOO_DESIGN_BENCH_TIMEOUT_MS');
  const bridgePort = process.env.VOO_DESIGN_BENCH_BRIDGE_PORT || process.env.VOO_CODEX_BRIDGE_PORT || '4190';
  const vitePort = process.env.VOO_DESIGN_BENCH_VITE_PORT || process.env.VOO_CODEX_VITE_PORT || '5199';
  const env = {
    ...process.env, HTTPS_PROXY: 'http://127.0.0.1:7890', HTTP_PROXY: 'http://127.0.0.1:7890',
    NO_PROXY: [...new Set(`${process.env.NO_PROXY || ''},127.0.0.1,localhost`.split(','))].join(','),
    VOO_CLI_BRIDGE_PORT: bridgePort, VITE_CLI_BRIDGE_URL: `ws://127.0.0.1:${bridgePort}`,
  };
  const children = [];
  let browser;
  const output = `/workspace/tmp/design-bench/${options.label}`;
  await mkdir(output, { recursive: true });
  const results = { label: options.label, model: options.model || process.env.VOO_CODEX_MODEL || null, critique: options.critique, startedAt: new Date().toISOString(), tasks: [] };
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
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    for (const id of options.selectedTasks) {
      const task = DESIGN_BENCH_TASKS.find(item => item.id === id);
      console.error(`Design benchmark: ${id}`);
      const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
      await context.addInitScript(baseline => { globalThis.__VOO_DESIGN_QUALITY_OFF__ = baseline; }, !!options.baseline);
      const page = await context.newPage();
      const started = Date.now();
      let watchdog;
      let record = { id, kind: task.kind, frame: task.frame };
      try {
        await page.goto(`http://127.0.0.1:${vitePort}/?voo-test=1`);
        await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
        const result = await Promise.race([
          page.evaluate(runInEditor, { task, model: options.model || process.env.VOO_CODEX_MODEL, timeout, critique: options.critique && !!lint }),
          new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('Task exceeded hard deadline')), timeout + 30000); }),
        ]);
        const { doc, png, ...details } = result;
        Object.assign(record, details);
        record.document = `${output}/${id}.json`;
        await writeFile(record.document, `${JSON.stringify(doc, null, 2)}\n`);
        if (png) {
          record.screenshot = `${output}/${id}.png`;
          await writeFile(record.screenshot, Buffer.from(png.split(',')[1], 'base64'));
        } else record.error ||= `Screenshot unavailable: ${result.captureError}`;
        Object.assign(record, await scoreDocument(doc, { lint, screenshot: record.screenshot, judge: options.judge && !!png }));
      } catch (error) { record.error = error.stack || String(error); }
      finally { clearTimeout(watchdog); await context.close(); }
      record.durationMs = Date.now() - started;
      results.tasks.push(record);
      await save();
      console.error(`${id}: ${record.error ? 'FAILED' : `lint ${record.lint?.score ?? 'unavailable'}`}`);
    }
  } finally {
    await browser?.close();
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
  if (results.tasks.some(task => task.error || task.judgeError)) process.exitCode = 1;
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
