// Run against a local Vite server under flock /tmp/voo-e2e.lock.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const shots = '/workspace/tmp/shots-agent-cancel-polish';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.route('**/cancel-test.html', route => route.fulfill({ contentType: 'text/html', body: `
    <html><body style="margin:0;background:#242424"><div id="root" style="width:420px;height:760px;margin:20px auto"></div>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import {createRoot} from '/node_modules/.vite/deps/react-dom_client.js';
      import Panel from '/src/canvas/components/canvas_agent_panel.jsx';
      import {loadLocale} from '/src/shared/i18n.js';
      import '/src/index.css';
      await loadLocale('en');
      createRoot(document.getElementById('root')).render(React.createElement(Panel));
    </script></body></html>` }));
  await page.route('**/src/canvas/agent/agent_provider.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const customModelGroups = () => [];
    export async function resolveAgentProvider() {
      return {streamStep: async ({signal,onText,messages}) => {
        window.testPrompts ??= []; window.testPrompts.push(messages.at(-1).content);
        onText('Inspecting the current canvas…');
        return new Promise((resolve,reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}));
      }};
    }` }));
  await page.route('**/src/canvas/agent/external_mcp_tools.js', route => route.fulfill({ contentType: 'application/javascript', body: 'export async function externalMcpTools() { return {tools:[]}; }' }));
  await page.goto(`${process.env.VOO_TEST_URL || 'http://127.0.0.1:5187'}/cancel-test.html`);
  const input = page.locator('textarea');
  await input.fill('Create a simple landing page');
  await input.press('Enter');
  await page.getByText('Inspecting the current canvas…').waitFor();
  await page.getByTestId('agent-cancel').click();
  await page.getByRole('status').filter({hasText:'Cancelled.'}).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.screenshot({path:`${shots}/cancelled.png`});
  await page.getByRole('button', {name:'Resume',exact:true}).click();
  await page.getByText('Inspecting the current canvas…').waitFor();
  assert.match(await page.evaluate(() => window.testPrompts.at(-1)), /Inspect existing changes first/);
  await page.screenshot({path:`${shots}/resuming.png`});
  await page.getByTestId('agent-cancel').click();
  await page.getByRole('button', {name:'Retry last prompt',exact:true}).click();
  await page.getByText('Inspecting the current canvas…').waitFor();
  await page.getByTestId('agent-cancel').click();
  console.log('Passed: cancellation message, no error dump, resume, retry; screenshots:', shots);
} finally { await browser.close(); }
