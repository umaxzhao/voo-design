// Live integration (uses the logged-in local Claude Code CLI):
// npm install --no-save playwright && npx playwright install chromium
// node tests/e2e/claude_agent.e2e.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const probe = spawnSync('claude', ['-p', 'ok', '--output-format', 'json'], { encoding: 'utf8', timeout: 30000 });
const output = `${probe.stdout ?? ''} ${probe.stderr ?? ''}`;
let isError = false;
try { isError = JSON.parse(probe.stdout).is_error === true; } catch {}
if (probe.error?.code === 'ENOENT' || /not logged in/i.test(output) || isError) {
  console.log('SKIP: Claude Code is missing or unauthenticated');
  process.exit(0);
}
if (probe.error || probe.status !== 0) throw new Error(`Claude preflight failed: ${probe.error?.message ?? output}`);
const { chromium } = await import('playwright');

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const children = [];
let browser;
let page;
let summary = { pass: false, toolCalls: [], nodesAdded: [], reply: '' };
const timeout = Number(process.env.VOO_CLAUDE_TIMEOUT_MS || 240000);
const env = { ...process.env, NO_PROXY: [...new Set(`${process.env.NO_PROXY || ''},127.0.0.1,localhost`.split(','))].join(',') };
function start(args) {
  const child = spawn('npm', args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.on('error', error => console.error(error.message));
  for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => process.stderr.write(chunk));
  return child;
}
async function ready(url, child) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready: ${url}`);
}
try {
  // Dedicated ports avoid borrowing another editor/bridge's state.
  env.VOO_CLI_BRIDGE_PORT = process.env.VOO_CLAUDE_BRIDGE_PORT || '4191';
  env.VITE_CLI_BRIDGE_URL = `ws://127.0.0.1:${env.VOO_CLI_BRIDGE_PORT}`;
  const port = process.env.VOO_CLAUDE_VITE_PORT || '5199';
  const bridge = start(['run', 'bridge']);
  const vite = start(['run', 'dev', '--', '--host', '127.0.0.1', '--port', port, '--strictPort']);
  await Promise.all([ready(`http://127.0.0.1:${env.VOO_CLI_BRIDGE_PORT}/health`, bridge), ready(`http://127.0.0.1:${port}`, vite)]);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => console.error(`Page: ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/?voo-test=1`);
  await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const { useDesignStore } = await import('/src/store/design_store.js');
    useDesignStore.getState().setWelcomeOpen(false);
  });
  // Invoke the exact model selector and execution modules used by Agent panel.
  // Keeping callbacks here also exposes streamed chunks and real tool receipts.
  await page.evaluate(({ timeout, model }) => {
    window.__codexE2E = { pass: false, toolCalls: [], nodesAdded: [], reply: '', done: false };
    void (async () => {
      const out = window.__codexE2E;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let unsubscribe;
      try {
        const { ensureLocalCliBridge } = await import('/src/canvas/components/agent-panel/local_cli_bridge.js');
        const { isCliAgentModel, streamCliStep } = await import('/src/canvas/agent/cli_agent_step.js');
        const { runAgentTurn } = await import('/src/canvas/agent/canvas_agent.js');
        const { CANVAS_TOOL_SCHEMAS, executeCanvasTool, AGENT_SETTING } = await import('/src/canvas/agent/canvas_tools.js');
        const { setSetting } = await import('/src/shared/settings.js');
        const { closeCodexSession } = await import('/src/canvas/components/agent-panel/codex_transport.js');
        const bridge = await ensureLocalCliBridge();
        if (!bridge) throw new Error('Local CLI bridge unavailable');
        const selected = model || 'claude:haiku';
        setSetting(AGENT_SETTING.MODEL, selected);
        if (!isCliAgentModel(selected)) throw new Error(`Not a CLI model: ${selected}`);
        unsubscribe = bridge.onText(event => { if (event.text) out.reply += event.text; });
        const before = new Set(window.__vooEditor.getDocument().nodes.map(node => node.id));
        try {
          out.finalReply = await runAgentTurn({
            config: { model: selected }, history: [],
            userText: "Create a 400x300 frame named Card with a title text 'Hello' and a blue button",
            tools: CANVAS_TOOL_SCHEMAS, executeTool: executeCanvasTool,
            streamStep: streamCliStep, signal: controller.signal, maxSteps: 32,
            onToolEvent: event => { if (event.status !== 'in_progress') out.toolCalls.push({ name: event.name, status: event.status, error: event.error }); },
          });
          out.nodesAdded = window.__vooEditor.getDocument().nodes.filter(node => !before.has(node.id));
          // The agent may group a frame with its contents and name that wrapper
          // Card, renaming the actual frame "Card background".
          const frame = out.nodesAdded.find(node =>
            (node.kind === 'frame' || node.isFrame === true || node.containerType === 'frame') &&
            node.width === 400 && node.height === 300 &&
            (node.name === 'Card' || out.nodesAdded.some(parent => parent.id === node.parentId && parent.name === 'Card')));
          const text = out.nodesAdded.find(node => node.kind === 'text' && node.text === 'Hello');
          out.pass = !!(out.reply.trim() && out.finalReply?.trim() && out.toolCalls.some(call => call.status === 'completed') && frame && text);
          if (!out.pass) out.error = 'Missing streamed reply, completed canvas tool, Card frame, or Hello text';
        } finally {
          out.nodesAdded = window.__vooEditor.getDocument().nodes.filter(node => !before.has(node.id));
          await closeCodexSession(controller.signal);
        }
      } catch (error) { out.error = error.stack || String(error); }
      finally { clearTimeout(timer); unsubscribe?.(); out.done = true; }
    })();
  }, { timeout, model: process.env.VOO_CLAUDE_MODEL });
  const deadline = Date.now() + timeout + 30000;
  while (Date.now() < deadline) {
    const progress = await page.evaluate(() => {
      const out = window.__codexE2E;
      return { done: out?.done, toolCalls: out?.toolCalls, replyLength: out?.reply.length };
    });
    if (progress.done) break;
    console.error(JSON.stringify(progress));
    await page.waitForTimeout(10000);
  }
  summary = await page.evaluate(() => window.__codexE2E);
  if (!summary?.done) throw new Error('Claude E2E timed out');
} catch (error) {
  summary.error = error.stack || String(error);
} finally {
  if (page) {
    await page.evaluate(() => window.__vooEditor?.getViewport?.()?.zoomToFit?.()).catch(() => {});
    await page.screenshot({ path: '/tmp/claude-agent-e2e.png' }).catch(error => console.error(error.message));
  }
  await browser?.close();
  for (const child of children.reverse()) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
  // Codex app-server is part of the detached bridge process group.
  for (const child of children) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 1500))]);
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  }
}
console.log(JSON.stringify(summary));
process.exitCode = summary.pass ? 0 : 1;
