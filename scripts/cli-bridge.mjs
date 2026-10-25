/**
 * `npm run bridge` — starts the local CLI bridge so the web editor can use the
 * local CLI agents installed on this machine.
 *
 *   VOO_CLI_BRIDGE_PORT     port to bind (default 4179; the page dials it)
 *   VOO_CLI_BRIDGE_ORIGINS  extra allowed page origins, comma-separated
 */

import {
  DEFAULT_CLI_BRIDGE_ORIGINS,
  startCliBridgeServer,
} from "../electron/cli_bridge_server.js";
import { CLI_BRIDGE_DEFAULT_PORT } from "../src/shared/cli_bridge_protocol.js";
import { writeBridgeToken } from "../src/shared/cli_bridge_token.js";

const rawPort = process.env.VOO_CLI_BRIDGE_PORT;
const port = rawPort ? Number(rawPort) : CLI_BRIDGE_DEFAULT_PORT;
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid VOO_CLI_BRIDGE_PORT: ${rawPort}`);
}
const extraOrigins = (process.env.VOO_CLI_BRIDGE_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const bridge = await startCliBridgeServer({
  port,
  origins: [...DEFAULT_CLI_BRIDGE_ORIGINS, ...extraOrigins],
});
const token = process.env.VOO_CLI_BRIDGE_TOKEN;
if (!token) throw new Error("CLI bridge token was not initialized");
const tokenPath = writeBridgeToken(token);
process.stdout.write(
  `VOO CLI bridge listening on ws://127.0.0.1:${bridge.port}\n` +
  `CLI bridge token: ${token}\n` +
  `CLI bridge token file: ${tokenPath}\n`,
);

// close() also releases the Codex child process, MCP server and temp dir.
const shutdown = () => {
  bridge.close().then(
    () => process.exit(0),
    (error) => {
      process.stderr.write(`CLI bridge shutdown failed: ${error?.message ?? error}\n`);
      process.exit(1);
    },
  );
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
