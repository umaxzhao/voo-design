export const MCP_SERVERS_KEY = 'agent.mcpServers';

export function validateMcpServers(servers) {
  if (!Array.isArray(servers)) throw new Error('agent.mcp.invalid');
  const ids = new Set(['voo']);
  for (const server of servers) {
    if (!server || !/^[a-zA-Z0-9_-]+$/.test(server.id) || ids.has(server.id)) throw new Error('agent.mcp.invalid');
    ids.add(server.id);
    const strings = value => value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'string');
    if (server.type === 'stdio') {
      if (typeof server.command !== 'string' || !server.command.trim() || (server.args !== undefined && (!Array.isArray(server.args) || !server.args.every(v => typeof v === 'string'))) || (server.env !== undefined && !strings(server.env))) throw new Error('agent.mcp.invalid');
    } else if (server.type === 'http') {
      let url; try { url = new URL(server.url); } catch { throw new Error('agent.mcp.invalid'); }
      if (!['http:', 'https:'].includes(url.protocol) || (server.headers !== undefined && !strings(server.headers))) throw new Error('agent.mcp.invalid');
    } else throw new Error('agent.mcp.invalid');
  }
  return servers;
}

export function nativeMcpServers(servers = [], codex = false) {
  return Object.fromEntries(validateMcpServers(servers).map(({ id, type, command, args, env, url, headers }) => [id,
    type === 'stdio' ? { ...(codex ? {} : { type }), command, args: args ?? [], env: env ?? {} }
      : { ...(codex ? {} : { type }), url, [codex ? 'http_headers' : 'headers']: headers ?? {} },
  ]));
}
