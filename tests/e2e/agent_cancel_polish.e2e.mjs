// Run against a local Vite server under flock /tmp/voo-e2e.lock.
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const shots = join(tmpdir(), "voo-agent-cancel-polish");
await mkdir(shots, { recursive: true });
await withEditorBrowser(async ({ page }) => {
  await page.evaluate(async () => {
    const { mountCancelHarness } = await import("/tests/e2e/agent-cancel-harness.jsx");
    await mountCancelHarness();
  });
  const input = page.getByRole('textbox', { name: 'Describe what to create on the canvas', exact: true });
  await input.fill('Create a simple landing page');
  await input.press('Enter');
  await page.getByText('Inspecting the current canvas…').waitFor();
  await page.getByTestId('agent-cancel').click();
  await page.getByRole('status').filter({hasText:'Cancelled.'}).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(await page.evaluate(() => window.agentState()), false);
  await page.screenshot({path:`${shots}/cancelled.png`});
  await page.getByRole('button', {name:'Resume',exact:true}).click();
  await page.getByText('Inspecting the current canvas…').waitFor();
  assert.match(await page.evaluate(() => window.testPrompts.at(-1)), /Inspect existing changes first/);
  await page.screenshot({path:`${shots}/resuming.png`});
  await page.getByTestId('agent-cancel').click();
  await page.getByRole('button', {name:'Retry last prompt',exact:true}).click();
  await page.getByText('Inspecting the current canvas…').waitFor();
  assert.equal(await page.evaluate(() => window.testPrompts.at(-1)), 'Create a simple landing page');
  await page.getByTestId('agent-cancel').click();
  console.log('Passed: cancellation message, no error dump, resume, retry; screenshots:', shots);
}, { openDocument: false, mcpLink: false, preparePage: async page => {
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
 } });
