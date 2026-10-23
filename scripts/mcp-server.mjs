#!/usr/bin/env node
/**
 * MCP server entry point for VOO Design.
 * Implements JSON-RPC 2.0 over stdin/stdout for tool execution.
 */

import { startMcpStdioServer } from "../electron/mcp_server/stdio_server.js";

startMcpStdioServer().catch((err) => {
  console.error(`[MCP Server Error] ${err.message}`);
  process.exit(1);
});
