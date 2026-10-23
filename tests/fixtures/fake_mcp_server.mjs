import { createInterface } from 'node:readline';
for await (const line of createInterface({ input: process.stdin })) {
  const frame = JSON.parse(line);
  if (frame.id == null) continue;
  const result = frame.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } }
    : frame.method === 'tools/list' ? { tools: [{ name: 'echo', description: 'Echo input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] }
    : { content: [{ type: 'text', text: frame.params.arguments.text ?? process.env.FAKE_MCP_VALUE ?? '' }] };
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: frame.id, result }) + '\n');
}
