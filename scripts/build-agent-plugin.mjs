import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpTools } from "../electron/mcp_server/tool_catalog.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination)) {
  throw new Error("Usage: node scripts/build-agent-plugin.mjs /absolute/new/plugin-folder");
}
// Never replace an installed plugin or accidentally include private config.
await mkdir(destination);
await cp(path.join(root, "plugins/voo-design"), destination, { recursive: true });
const files = [
  "scripts/mcp-server.mjs",
  "electron/mcp_server/stdio_server.js",
  "src/shared/cli_bridge_protocol.js",
  "src/shared/cli_bridge_token.js",
];
for (const file of files) {
  const target = path.join(destination, file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, file), target);
}
const catalog = `const tools = ${JSON.stringify(buildMcpTools(), null, 2)};\nexport function buildMcpTools() { return tools; }\n`;
await writeFile(path.join(destination, "electron/mcp_server/tool_catalog.js"), catalog);
const require = createRequire(import.meta.url);
const wsPackage = require.resolve("ws/package.json");
const wsVersion = JSON.parse(await readFile(wsPackage, "utf8")).version;
await cp(path.dirname(wsPackage), path.join(destination, "node_modules/ws"), { recursive: true });
await cp(path.join(root, "LICENSE"), path.join(destination, "LICENSE"));
await writeFile(path.join(destination, "package.json"), JSON.stringify({
  name: "voo-design-agent-connector", version: "1.0.0", private: true,
  type: "module", license: "MIT", engines: { node: ">=18" }, dependencies: { ws: wsVersion },
}, null, 2) + "\n");
process.stdout.write(`Built portable VOO Design connector: ${destination}\n`);
