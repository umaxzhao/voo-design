import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMcpTools } from "../electron/mcp_server/tool_catalog.js";

export const CONNECTOR_PACKAGE_NAME = "voo";
export const CONNECTOR_VERSION = "1.0.0";
export const DSH_MCP_ROW_ID = "mcp-voo";
export const DSH_MCP_SERVER_NAME = "voo";
export const DSH_MODEL_BRIDGE_ROW_ID = "voo-model-bridge";
export const DSH_MODEL_BRIDGE_ENTRY = "lib/model-bridge.js";
export const DSH_MODEL_BRIDGE_PORT = 4399;
export const ICON_MAX_BYTES = 256 * 1024;

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));

// Runtime files that are shared with the repository entry points. The catalog is
// snapshotted separately so the portable folder never needs the repository.
const portableRuntimeFiles = [
  "scripts/mcp-server.mjs",
  "electron/mcp_server/stdio_server.js",
  "src/shared/cli_bridge_protocol.js",
  "src/shared/cli_bridge_token.js",
];

// The model bridge is authored as its own DSH bundle and copied into the
// connector so one install exposes both the canvas tools and the loopback
// OpenAI-compatible endpoint the VOO editor selects.
const modelBridgeSource = "plugins/voo-model-bridge/lib/model-bridge.js";

function resolvePortableWsPackage(repositoryRoot) {
  const repositoryRequire = createRequire(path.join(repositoryRoot, "package.json"));
  return repositoryRequire.resolve("ws/package.json");
}

export function createConnectorManifest({ wsVersion }) {
  return {
    name: CONNECTOR_PACKAGE_NAME,
    version: CONNECTOR_VERSION,
    private: true,
    description: "VOO MCP connector for DeepSeek Harness and other MCP clients.",
    type: "module",
    license: "MIT",
    engines: { node: ">=18" },
    dependencies: { ws: wsVersion },
    // Display metadata is read without activating the bundle: Settings and the
    // Plugin Manager resolve ./locale/*.json and ./icon from these exports.
    exports: {
      "./locale/*.json": "./locale/*.json",
      "./icon": "./icon.png",
      "./lib/model-bridge.js": "./lib/model-bridge.js",
      "./package.json": "./package.json",
    },
    files: [
      "cordis.patch.yml",
      "locale/*.json",
      "icon.png",
      "lib",
      ".claude-plugin",
      ".mcp.json",
      "deepseek.cordis.yml",
      "scripts",
      "electron/mcp_server",
      "src/shared",
      "node_modules/ws",
      "README.md",
      "LICENSE",
    ],
    dsh: { bundle: { patch: "./cordis.patch.yml" } },
  };
}

// The portable copy is installed as a link: directory, so every runtime path is
// baked in at build time; rebuild after moving the folder.
//
// The second row names a module relative to this patch file: the Loader anchors
// inserted relative row names beside their patch, so `./lib/model-bridge.js`
// resolves inside the installed connector without a package subpath export.
// (`exports` still carries the subpath for Node-resolver consumers.)
export function renderDshPatch({ destination }) {
  const serverEntry = path.join(destination, "scripts/mcp-server.mjs");
  return [
    "- insert:",
    `    - id: ${DSH_MCP_ROW_ID}`,
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    `        serverName: ${DSH_MCP_SERVER_NAME}`,
    "        transport: stdio",
    "        command: node",
    "        args:",
    `          - ${JSON.stringify(serverEntry)}`,
    `        cwd: ${JSON.stringify(destination)}`,
    "        toolCallTimeoutMs: 65000",
    "        failOnStartupError: false",
    `    - id: ${DSH_MODEL_BRIDGE_ROW_ID}`,
    `      name: './${DSH_MODEL_BRIDGE_ENTRY}'`,
    "      config:",
    `        port: ${DSH_MODEL_BRIDGE_PORT}`,
    "",
  ].join("\n");
}

export async function buildPortableConnector({ root = defaultRoot, destination } = {}) {
  if (!destination || !path.isAbsolute(destination)) {
    throw new Error("Usage: node scripts/build-agent-plugin.mjs /absolute/new/plugin-folder");
  }
  const repositoryRoot = path.resolve(root);
  const outputDirectory = path.resolve(destination);
  // Never replace an installed plugin or accidentally include private config;
  // mkdir without recursive fails with EEXIST when the folder already exists.
  await mkdir(outputDirectory);
  await cp(path.join(repositoryRoot, "plugins/voo"), outputDirectory, { recursive: true });
  // One install gives VOO both halves: the canvas MCP tools and the model
  // bridge row. The bridge stays a single source of truth in its own bundle.
  await mkdir(path.join(outputDirectory, "lib"), { recursive: true });
  await cp(path.join(repositoryRoot, modelBridgeSource), path.join(outputDirectory, DSH_MODEL_BRIDGE_ENTRY));
  for (const file of portableRuntimeFiles) {
    const target = path.join(outputDirectory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(repositoryRoot, file), target);
  }
  const catalog = `const tools = ${JSON.stringify(buildMcpTools(), null, 2)};\nexport function buildMcpTools() { return tools; }\n`;
  await writeFile(path.join(outputDirectory, "electron/mcp_server/tool_catalog.js"), catalog);
  const wsPackage = resolvePortableWsPackage(repositoryRoot);
  const wsVersion = JSON.parse(await readFile(wsPackage, "utf8")).version;
  await cp(path.dirname(wsPackage), path.join(outputDirectory, "node_modules/ws"), { recursive: true });
  await cp(path.join(repositoryRoot, "LICENSE"), path.join(outputDirectory, "LICENSE"));
  const iconSource = path.join(repositoryRoot, "build/icon.png");
  const iconBytes = (await stat(iconSource)).size;
  if (iconBytes > ICON_MAX_BYTES) {
    throw new Error(`build/icon.png is ${iconBytes} bytes; DSH bundle icons must stay below ${ICON_MAX_BYTES} bytes.`);
  }
  await cp(iconSource, path.join(outputDirectory, "icon.png"));
  await cp(iconSource, path.join(outputDirectory, ".claude-plugin/icon.png"));
  await writeFile(
    path.join(outputDirectory, "package.json"),
    JSON.stringify(createConnectorManifest({ wsVersion }), null, 2) + "\n",
  );
  await writeFile(path.join(outputDirectory, "cordis.patch.yml"), renderDshPatch({ destination: outputDirectory }));
  return {
    destination: outputDirectory,
    packageJsonPath: path.join(outputDirectory, "package.json"),
    dshPatchPath: path.join(outputDirectory, "cordis.patch.yml"),
  };
}

function isDirectInvocation() {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;
  try {
    const resolved = path.resolve(entrypoint);
    const modulePath = fileURLToPath(import.meta.url);
    if (resolved === modulePath) return true;
    // Support invocation through a symlink such as a bin shim.
    return realpathSync(resolved) === realpathSync(modulePath);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  const destination = process.argv[2];
  try {
    await buildPortableConnector({ root: defaultRoot, destination });
    process.stdout.write(`Built portable VOO connector: ${destination}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
