import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Small MCP client. Each owner must close it, including after initialization failure. */
export function createExternalMcpClient(server, { timeoutMs = 30000 } = {}) {
  let child, sequence = 0, sessionId, protocolVersion = '2025-06-18';
  const pending = new Map();
  const fail = (error) => { for (const job of pending.values()) job.reject(error); pending.clear(); };
  function receive(frame) {
    if (frame.method && frame.id != null) {
      child?.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, ...(frame.method === 'ping' ? { result: {} } : { error: { code: -32601, message: 'Unsupported method' } }) }) + '\n');
      return;
    }
    const job = pending.get(frame.id);
    if (!job) return;
    pending.delete(frame.id);
    if (frame.error) job.reject(new Error(frame.error.message)); else job.resolve(frame.result);
  }
  async function request(method, params, notification = false) {
    const id = ++sequence;
    const frame = { jsonrpc: '2.0', ...(notification ? {} : { id }), method, params };
    if (server.type === 'stdio') {
      if (!child) {
        child = spawn(server.command, server.args ?? [], { env: { ...process.env, ...server.env }, stdio: ['pipe', 'pipe', 'pipe'] });
        child.stderr.resume();
        createInterface({ input: child.stdout }).on('line', line => {
          try { receive(JSON.parse(line)); } catch { fail(new Error('Invalid MCP JSON')); }
        });
        child.on('error', fail);
        child.stdin.on('error', fail);
        child.on('exit', () => fail(new Error('MCP process exited')));
      }
      if (notification) { child.stdin.write(JSON.stringify(frame) + '\n'); return; }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timeout')); }, timeoutMs);
        pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        child.stdin.write(JSON.stringify(frame) + '\n');
      });
    }
    const response = await fetch(server.url, {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { ...server.headers, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': protocolVersion, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) },
      body: JSON.stringify(frame),
    });
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
    sessionId = response.headers.get('mcp-session-id') ?? sessionId;
    if (notification || response.status === 202) { await response.body?.cancel(); return; }
    let result;
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = '';
      try {
        while (!result) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
            if (data) { const parsed = JSON.parse(data); if (parsed.id === id) result = parsed; }
          }
        }
      } finally { await reader.cancel(); }
    } else result = await response.json();
    if (!result || result.id !== id) throw new Error('Missing MCP response');
    if (result.error) throw new Error(result.error.message);
    return result.result;
  }
  return {
    async initialize() {
      const result = await request('initialize', { protocolVersion, capabilities: {}, clientInfo: { name: 'voo', version: '1' } });
      protocolVersion = result.protocolVersion;
      await request('notifications/initialized', {}, true);
    },
    async listTools() {
      const tools = []; let cursor;
      do { const page = await request('tools/list', cursor ? { cursor } : {}); tools.push(...page.tools); cursor = page.nextCursor; } while (cursor);
      return tools;
    },
    callTool: (name, args) => request('tools/call', { name, arguments: args }),
    async close() {
      fail(new Error('MCP client closed'));
      child?.stdin.end(); child?.kill();
      if (sessionId) await fetch(server.url, { method: 'DELETE', headers: { ...server.headers, 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': protocolVersion }, signal: AbortSignal.timeout(2000) }).catch(() => {});
    },
  };
}

export async function withExternalMcp(server, operation) {
  const client = createExternalMcpClient(server);
  try { await client.initialize(); return await operation(client); } finally { await client.close(); }
}
