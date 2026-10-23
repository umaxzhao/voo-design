import { getSetting } from '../../shared/settings.js';
import { MCP_SERVERS_KEY } from '../../shared/agent_mcp_servers.js';
import { ensureLocalCliBridge } from '../components/agent-panel/local_cli_bridge.js';

/** External tools use the same authenticated desktop/loopback channel as native CLIs. */
export async function externalMcpTools() {
  const servers = getSetting(MCP_SERVERS_KEY) ?? [];
  if (!servers.length) return { tools: [], execute: null };
  const bridge = await ensureLocalCliBridge();
  if (!bridge?.advance) throw new Error('agent.connection.desktopOnly');
  const invoke = async options => {
    const reply = await bridge.advance({ ...options, servers });
    if (!reply.ok) throw new Error(reply.code ?? reply.error ?? 'cli.failed');
    return reply;
  };
  const { tools } = await invoke({ externalMcp: 'list' });
  const names = new Set(tools.map(tool => tool.function.name));
  return { tools, async execute(name, args) {
    if (!names.has(name)) throw new Error('cli.invalidRequest');
    const { result } = await invoke({ externalMcp: 'call', name, arguments: args });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return result;
  } };
}
