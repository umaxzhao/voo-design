import { createServer } from "node:http";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const TOOL_SCHEMA = [
  {
    name: "list_tools",
    description:
      "List the VOO canvas tools currently available, with their input schemas.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "call_tool",
    description:
      "Execute a VOO canvas tool. Use list_tools for its schema. tool_search discovers additional VOO tools. The host applies its normal approval and undo policy.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        arguments: { type: "object", additionalProperties: true },
      },
      required: ["name", "arguments"],
      additionalProperties: false,
    },
  },
];

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body == null ? undefined : JSON.stringify(body));
}

export async function handleAgentMcp(frame, session) {
  if (frame.method === "initialize")
    return {
      protocolVersion: frame.params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "voo", version: "1" },
    };
  if (frame.method === "ping") return {};
  if (frame.method === "tools/list") return { tools: TOOL_SCHEMA };
  if (frame.method !== "tools/call") throw new Error("Unknown MCP method");
  if (frame.params?.name === "list_tools")
    return { content: [{ type: "text", text: JSON.stringify(session.tools) }] };
  if (frame.params?.name !== "call_tool") throw new Error("Unknown MCP tool");
  const { name, arguments: args } = frame.params.arguments ?? {};
  if (!session.tools.some((tool) => tool.function?.name === name)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "Tool unavailable. Call list_tools or use tool_search to discover it.",
        },
      ],
    };
  }
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Invalid tool arguments");
  return session.callTool(name, args);
}

/** Private, authenticated MCP transport for the app-owned Codex threads. */
export async function startAgentMcpServer({ token, getSession }) {
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}` || req.headers.origin) {
      send(res, 403, { error: "Forbidden" });
      return;
    }
    const session = getSession(req.url?.slice(1));
    if (!session) {
      send(res, 404, { error: "Session unavailable" });
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, {});
      return;
    }
    let frame;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          send(res, 413, {});
          return;
        }
        chunks.push(chunk);
      }
      frame = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (frame.id == null) {
        send(res, 202);
        return;
      }
      const result = await handleAgentMcp(frame, session);
      send(res, 200, { jsonrpc: "2.0", id: frame.id, result });
    } catch {
      send(res, frame ? 200 : 400, {
        jsonrpc: "2.0",
        id: frame?.id ?? null,
        error: { code: -32603, message: "VOO tool request failed" },
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
