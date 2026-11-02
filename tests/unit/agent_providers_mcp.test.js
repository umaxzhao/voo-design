import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { customModelGroups, resolveAgentProvider } from '../../src/canvas/agent/agent_provider.js';
import { setCredentialAreaFactory } from '../../src/shared/providers/credential_store.js';
import { streamChatTurn } from '../../src/canvas/agent/chat_stream.js';
import { streamCliStep } from '../../src/canvas/agent/cli_agent_step.js';
import { runAgentTurn, SYSTEM_PROMPT } from '../../src/canvas/agent/canvas_agent.js';
import { withExternalMcp } from '../../electron/external_mcp_client.js';
import { nativeMcpServers, validateMcpServers } from '../../src/shared/agent_mcp_servers.js';
import { claudeArgs } from '../../electron/claude_agent_session.js';
import { validateTasks, canvasToolNames } from '../../scripts/agent-bench/validate.mjs';
import { DESIGN_GENERATION_TASKS } from '../../scripts/agent-bench/tasks/design-generation.mjs';

afterEach(() => setCredentialAreaFactory(name => globalThis.chrome?.storage?.[name] ?? null));
const providers = [{ id: 'custom:gateway', name: 'Gateway', defaultBaseUrl: 'https://example.test/v1', models: [{ id: 'org/model:latest', label: 'Design model' }] }];

it('routes custom provider and model IDs losslessly through the shared harness transport', async () => {
  const [group] = customModelGroups(providers, {});
  setCredentialAreaFactory(area => ({ get: async key => ({ [key]: area === 'local' ? { apiKey: 'secret', baseUrl: 'https://saved.test/v1' } : null }) }));
  const resolved = await resolveAgentProvider(group.models[0].id, providers);
  expect(resolved.streamStep).toBe(streamChatTurn);
  expect(resolved.config).toMatchObject({ model: 'org/model:latest', apiKey: 'secret', baseUrl: 'https://saved.test/v1' });
  expect((await resolveAgentProvider('claude:sonnet')).streamStep).toBe(streamCliStep);
  expect((await resolveAgentProvider('codex:gpt-6-astra')).streamStep).toBe(streamCliStep);
});

it('rejects a removed custom provider instead of using another provider key', async () => {
  await expect(resolveAgentProvider('api:custom%3Amissing:model', providers)).rejects.toThrow('agentNotConfigured');
});

it('requires the design quality instructions', () => {
  for (const phrase of ['4/8/12/16/24/32/48/64', 'auto layout', 'capture_canvas', 'variables']) expect(SYSTEM_PROMPT).toContain(phrase);
});

it('nudges capture after multiple writes, and reviews the capture before completion', async () => {
  const streamStep = vi.fn()
    .mockResolvedValueOnce({ text: '', toolCalls: ['a', 'b'].map(id => ({ id, name: 'create_frame', arguments: '{}' })) })
    .mockResolvedValueOnce({ text: 'Done', toolCalls: [] })
    .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'c', name: 'capture_canvas', arguments: '{}' }] })
    .mockResolvedValueOnce({ text: 'Verified', toolCalls: [] });
  const executeTool = vi.fn().mockResolvedValue({ ok: true });
  const controller = new AbortController();
  const result = await runAgentTurn({ config: {}, history: [], userText: 'design', tools: [{ function: { name: 'capture_canvas' } }], executeTool, streamStep, signal: controller.signal });
  expect(result).toBe('Verified');
  expect(streamStep.mock.calls[2][0].messages.some(m => m.content?.includes?.('Before finishing'))).toBe(true);
  expect(executeTool).toHaveBeenCalledWith('capture_canvas', {}, { signal: controller.signal });
});

it('allows one explicit recovery message after tool failure', async () => {
  const streamStep = vi.fn().mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'a', name: 'create_frame', arguments: '{}' }] }).mockResolvedValue({ text: 'Cannot complete', toolCalls: [] });
  await runAgentTurn({ config: {}, history: [], userText: 'design', tools: [], executeTool: async () => { throw new Error('Bad geometry'); }, streamStep });
  expect(streamStep).toHaveBeenCalledTimes(3);
  expect(streamStep.mock.calls[2][0].messages.at(-1).content).toContain('retry once');
});

const server = { id: 'fake', type: 'stdio', command: process.execPath, args: [fileURLToPath(new URL('../fixtures/fake_mcp_server.mjs', import.meta.url))], env: { FAKE_MCP_VALUE: 'from env' } };
it('initializes, lists and calls a real stdio MCP server with env', async () => {
  await withExternalMcp(server, async client => {
    expect((await client.listTools())[0].name).toBe('echo');
    expect((await client.callTool('echo', {})).content[0].text).toBe('from env');
    expect((await client.callTool('echo', { text: 'hello' })).content[0].text).toBe('hello');
  });
});

it('merges external configs without replacing voo and permits Claude external tools', () => {
  expect(nativeMcpServers([server]).fake).toMatchObject({ type: 'stdio', command: process.execPath });
  expect(nativeMcpServers([{ id: 'remote', type: 'http', url: 'https://example.test', headers: { Authorization: 'Bearer key' } }], true).remote.http_headers.Authorization).toBe('Bearer key');
  expect(claudeArgs({ model: 'sonnet', mcpConfigPath: 'config', systemPrompt: '', mcpServers: [server] }).join(' ')).toContain('mcp__fake__*');
  expect(() => validateMcpServers([{ ...server, id: 'voo' }])).toThrow();
  expect(() => validateMcpServers([{ ...server, args: 'bad' }])).toThrow();
});

it('handles HTTP JSON and SSE responses and propagates session and custom headers', async () => {
  const seen = [];
  const host = createServer(async (req, res) => {
    if (req.method === 'DELETE') { res.end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const frame = JSON.parse(body); seen.push({ frame, headers: req.headers });
    if (!frame.id) { res.writeHead(202); res.end(); return; }
    res.setHeader('Mcp-Session-Id', 'session');
    const result = frame.method === 'initialize' ? { protocolVersion: '2025-03-26' } : { tools: [] };
    const reply = JSON.stringify({ jsonrpc: '2.0', id: frame.id, result });
    if (frame.method === 'tools/list') { res.setHeader('Content-Type', 'text/event-stream'); res.end(`data: ${reply}\n\n`); }
    else { res.setHeader('Content-Type', 'application/json'); res.end(reply); }
  });
  await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
  try {
    await withExternalMcp({ type: 'http', url: `http://127.0.0.1:${host.address().port}`, headers: { Authorization: 'Bearer test' } }, async client => expect(await client.listTools()).toEqual([]));
    expect(seen[2].headers['mcp-session-id']).toBe('session');
    expect(seen[2].headers.authorization).toBe('Bearer test');
  } finally { host.closeAllConnections(); await new Promise(resolve => host.close(resolve)); }
});

it('validates the slim benchmark against actual canvas tool names', async () => {
  expect(validateTasks(DESIGN_GENERATION_TASKS, await canvasToolNames()).tasks).toBe(DESIGN_GENERATION_TASKS.length);
  expect(() => validateTasks([{ ...DESIGN_GENERATION_TASKS[0], requiredTools: ['missing'] }], new Set())).toThrow('unknown canvas tool');
});
