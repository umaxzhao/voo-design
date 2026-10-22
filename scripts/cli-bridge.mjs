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
process.stdout.write(
  `VOO CLI bridge listening on ws://127.0.0.1:${bridge.port}\n`,
);

const shutdown = () => void bridge.close();
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
