/**
 * CLI binary detection, authentication checking, and IPC handler registration
 * for local CLI tools (Claude Code, OpenAI Codex, Google Antigravity, OpenCode).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLI_BRIDGE_CHANNEL } from "../src/shared/cli_bridge_protocol.js";
import { registerCodexAgentIpc } from "./codex_agent_bridge.js";

export const CLI_DEFINITIONS = {
  claude: {
    names: ["claude"],
    defaultCmd: "claude",
    installCmd: "npm install -g @anthropic-ai/claude-code",
    loginCmd: "claude",
    docsUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview",
    defaultModel: "claude-opus-5-5",
  },
  codex: {
    names: ["codex"],
    defaultCmd: "codex",
    installCmd: "npm install -g @openai/codex",
    loginCmd: "codex login",
    docsUrl: "https://github.com/openai/codex",
    defaultModel: "gpt-6-astra",
  },
  antigravity: {
    names: ["agy", "antigravity"],
    defaultCmd: "agy",
    installCmd: "npm install -g @google/antigravity-cli",
    loginCmd: "agy login",
    docsUrl: "https://antigravity.google/cli",
    defaultModel: "gemini-2.5-pro",
  },
  opencode: {
    names: ["opencode"],
    defaultCmd: "opencode",
    installCmd: "npm install -g @opencode/cli",
    loginCmd: "opencode auth login",
    docsUrl: "https://opencode.ai/v2/docs/cli/commands/",
    defaultModel: "",
  },
};

const CLI_SEARCH_SUBDIRS = [
  ".nvm/current/bin",
  ".fnm/aliases/default/bin",
  ".asdf/shims",
  ".npm-global/bin",
  ".local/bin",
  ".local/share/pnpm",
  ".cargo/bin",
  ".bun/bin",
  ".volta/bin",
  ".yarn/bin",
  "Library/pnpm",
  ".claude/local",
  ".gemini/antigravity-cli/bin",
  "bin",
];

const CLI_SEARCH_ABSOLUTE = [
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/bin",
  "/bin",
];

const CLI_BINARY_CACHE_TTL_MS = 2000;
const cliBinaryCache = new Map();

export function clearCliBinaryCache() {
  cliBinaryCache.clear();
}

function cliBinaryCacheKey(names, options, env) {
  const opts = options || {};
  return JSON.stringify([
    names,
    opts.binPath ?? null,
    opts.searchDirs ?? null,
    env.HOME ?? null,
    env.PATH ?? null,
  ]);
}

/**
 * Finds a CLI binary path across common PATH and user locations.
 */
export function findCliBinary(names = [], options = {}) {
  const opts = options || {};
  if (opts.binPath && fs.existsSync(opts.binPath)) return opts.binPath;
  const env = opts.env || process.env;
  const binaryNames = Array.isArray(names)
    ? names.filter((n) => typeof n === "string" && Boolean(n.trim()))
    : (typeof names === "string" && Boolean(names.trim()) ? [names.trim()] : []);
  if (!binaryNames.length) return null;
  const key = cliBinaryCacheKey(binaryNames, opts, env);
  const cached = cliBinaryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.binPath;

  const isWin = process.platform === "win32";
  const userHome = env.HOME || os.homedir();
  const searchDirs = [
    ...(opts.searchDirs || []),
    ...CLI_SEARCH_ABSOLUTE,
    ...CLI_SEARCH_SUBDIRS.map((sub) => path.join(userHome, sub)),
    ...(env.PATH ? env.PATH.split(path.delimiter) : []),
  ];

  let found = null;
  for (const name of binaryNames) {
    const exes = isWin
      ? [`${name}.cmd`, `${name}.exe`, `${name}.bat`, name]
      : [name];
    for (const dir of searchDirs) {
      if (!dir) continue;
      for (const exe of exes) {
        const full = path.join(dir, exe);
        try {
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            found = full;
            break;
          }
        } catch {
          // ignore stat errors
        }
      }
      if (found) break;
    }
    if (found) break;
  }

  cliBinaryCache.set(key, {
    binPath: found,
    expiresAt: Date.now() + CLI_BINARY_CACHE_TTL_MS,
  });
  return found;
}

/**
 * Checks authentication credentials for a CLI tool.
 */
export async function checkCliAuth(cliId, binPath, options = {}) {
  if (typeof options.authCheck === "function") {
    return await options.authCheck(cliId, binPath);
  }
  const env = options.env || process.env;
  const userHome = env.HOME || os.homedir();

  if (cliId === "codex") {
    if (env.OPENAI_API_KEY || env.CODEX_API_KEY) {
      return { authenticated: true };
    }
    const codexHome = env.CODEX_HOME || path.join(userHome, ".codex");
    const authPath = path.join(codexHome, "auth.json");
    try {
      if (fs.existsSync(authPath)) {
        const content = fs.readFileSync(authPath, "utf8");
        const parsed = JSON.parse(content);
        const hasKey =
          typeof parsed.OPENAI_API_KEY === "string" &&
          parsed.OPENAI_API_KEY.trim().length > 0;
        const hasTokens =
          parsed.tokens &&
          (Boolean(parsed.tokens.access_token) ||
            Boolean(parsed.tokens.refresh_token) ||
            Boolean(parsed.tokens.id_token) ||
            (typeof parsed.tokens === "object" &&
              Object.keys(parsed.tokens).length > 0));
        if (hasKey || hasTokens) {
          return { authenticated: true };
        }
      }
    } catch {
      // fallback
    }
    return {
      authenticated: false,
      reason: "未检测到 Codex 登录凭据，请在终端运行 codex login",
    };
  }

  if (cliId === "claude") {
    if (env.ANTHROPIC_API_KEY) return { authenticated: true };
    const claudeCreds = path.join(userHome, ".claude", ".credentials.json");
    const claudeJson = path.join(userHome, ".claude.json");
    if (fs.existsSync(claudeCreds) || fs.existsSync(claudeJson)) {
      return { authenticated: true };
    }
    return { authenticated: false, reason: "请运行 claude 进行登录" };
  }

  if (cliId === "antigravity") {
    if (env.GEMINI_API_KEY) return { authenticated: true };
    const tokenPaths = [
      path.join(userHome, ".gemini", "antigravity-cli", "antigravity-oauth-token"),
      path.join(userHome, ".gemini", "oauth_creds.json"),
      path.join(userHome, ".gemini", "google_accounts.json"),
      path.join(userHome, ".gemini", "antigravity-cli", "auth.json"),
    ];
    if (tokenPaths.some((p) => fs.existsSync(p))) {
      return { authenticated: true };
    }
    return { authenticated: false, reason: "请运行 agy login 进行登录" };
  }

  return { authenticated: true };
}

/**
 * Checks a CLI tool's installation and authentication status.
 */
export async function checkCliStatus(cliId, options = {}) {
  const opts = options || {};
  const def = CLI_DEFINITIONS[cliId];
  if (!def) {
    return {
      status: "not_installed",
      installed: false,
      authenticated: false,
      ready: false,
      binPath: null,
      installCmd: "",
      loginCmd: "",
      reasonKey: "provider.cli.unknown",
      reason: `Unknown CLI tool: ${cliId}`,
    };
  }

  const binPath = findCliBinary(def.names, opts);
  const defaultCmd = def.defaultCmd || cliId;
  const installCmd = def.installCmd || `npm install -g ${cliId}`;
  const loginCmd = def.loginCmd || `${defaultCmd} login`;

  if (!binPath) {
    return {
      status: "not_installed",
      installed: false,
      authenticated: false,
      ready: false,
      binPath: null,
      installCmd,
      loginCmd,
      reasonKey: "provider.cli.notInstalled",
      reason: `未检测到 ${cliId} CLI`,
    };
  }

  const authResult = await checkCliAuth(cliId, binPath, opts);
  if (!authResult.authenticated) {
    return {
      status: "unauthenticated",
      installed: true,
      authenticated: false,
      ready: false,
      binPath,
      installCmd,
      loginCmd,
      reasonKey: "provider.cli.unauthenticated",
      reason: authResult.reason || `${cliId} 已安装但未登录`,
    };
  }

  return {
    status: "ready",
    installed: true,
    authenticated: true,
    ready: true,
    binPath,
    installCmd,
    loginCmd,
    reasonKey: null,
    reason: null,
  };
}

export async function checkAllCliStatus(options = {}) {
  const opts = options || {};
  const result = {};
  for (const id of Object.keys(CLI_DEFINITIONS)) {
    result[id] = await checkCliStatus(id, opts);
  }
  return result;
}

/**
 * Only our own app frames may drive the CLI agents. The packaged app loads from
 * file://, the dev build from the Vite server; any other page is refused.
 */
export function isAuthorizedSender(event) {
  const frameUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || "";
  if (typeof frameUrl !== "string" || !frameUrl) return false;
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  return (
    frameUrl.startsWith("file://") ||
    frameUrl.startsWith(devUrl) ||
    frameUrl.startsWith("http://127.0.0.1:5173")
  );
}

const SAFE_MODEL_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Strictly validates and normalizes cwd. An empty cwd means the home directory.
 */
export function validateCwd(targetCwd) {
  if (targetCwd == null || targetCwd === "") {
    return { ok: true, cwd: os.homedir() };
  }
  if (typeof targetCwd !== "string") {
    return { ok: false, code: "cli.invalidCwd", detail: "type" };
  }
  if (targetCwd.includes("\0") || targetCwd.includes("\n") || targetCwd.includes("\r")) {
    return { ok: false, code: "cli.invalidCwd", detail: "controlChars" };
  }
  const resolved = path.resolve(targetCwd);
  try {
    if (!fs.existsSync(resolved)) {
      return { ok: false, code: "cli.cwdNotFound", detail: resolved };
    }
    if (!fs.statSync(resolved).isDirectory()) {
      return { ok: false, code: "cli.cwdNotDirectory", detail: resolved };
    }
  } catch (err) {
    return { ok: false, code: "cli.cwdAccessError", detail: String(err) };
  }
  return { ok: true, cwd: resolved };
}

/** An Error carrying an i18n-style code, so the IPC handler can report why. */
class ErrorCodeError extends Error {
  constructor(code, message) {
    super(String(message ?? code));
    this.name = "ErrorCodeError";
    this.code = code;
  }
}

/**
 * Runs one Codex turn through `codex exec` in non-interactive JSON mode.
 */
export async function runCodexExec(bin, { prompt, model, cwd }) {
  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "--json",
    ...(model ? ["-m", model] : []),
    prompt,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });
    // Immediately close stdin so codex exec does not block on stdin pipe
    child.stdin.end();

    let output = "";
    let errorOutput = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });
    child.on("error", (err) => reject(new ErrorCodeError("cli.notInstalled", err)));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new ErrorCodeError(
            "cli.failed",
            errorOutput || `codex exited with code ${code}`,
          ),
        );
      }
      let text = "";
      for (const line of output.split("\n")) {
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line);
          if (
            frame.type === "item.completed" &&
            frame.item?.type === "agent_message" &&
            frame.item.text
          ) {
            text += frame.item.text;
          }
        } catch {}
      }
      if (!text.trim()) {
        if (output.trim()) {
          resolve(output.trim());
        } else {
          reject(new ErrorCodeError("cli.noOutput", errorOutput));
        }
      } else {
        resolve(text);
      }
    });
  });
}

/**
 * Runs one Codex turn through `codex mcp-server` over stdio and returns its text.
 * Falls back to `codex exec` if MCP initialize times out or is unsupported.
 *
 * @returns {Promise<string>} the assistant's text answer.
 */
export async function runCodexMcpSession(bin, { prompt, model, cwd }) {
  const { createMcpClient, codexSessionArgs, textFromToolResult } =
    await import("../src/shared/mcp_client.js");

  const child = spawn(bin, ["mcp-server"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NO_COLOR: "1" },
  });

  const client = createMcpClient({
    write: (line) => {
      try {
        child.stdin.write(line + "\n");
      } catch {}
    },
    onEvent: () => {},
  });

  child.stdout.on("data", (chunk) => {
    client.feed(String(chunk));
  });

  let errorOutput = "";
  child.stderr.on("data", (chunk) => {
    errorOutput += String(chunk);
  });

  child.on("close", () => {
    client.close();
  });

  const spawnError = new Promise((_resolve, reject) => {
    child.on("error", (err) =>
      reject(new ErrorCodeError("cli.notInstalled", err)),
    );
  });

  try {
    await Promise.race([
      spawnError,
      new Promise((resolve) => child.once("spawn", resolve)),
    ]);

    await client.call(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "voo", version: "1" },
      },
      undefined,
      2000,
    );

    const result = await client.call(
      "tools/call",
      {
        name: "codex",
        arguments: codexSessionArgs({ prompt, cwd, model }),
      },
      undefined,
      15000,
    );

    const text = textFromToolResult(result);
    if (!text) {
      throw new ErrorCodeError("cli.noOutput", errorOutput);
    }
    return text;
  } catch (error) {
    if (error?.code === "cli.notInstalled") throw error;
    // Fall back to direct codex exec execution when MCP server is unsupported or timed out
    return await runCodexExec(bin, { prompt, model, cwd });
  } finally {
    client.close();
    try {
      child.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
}

/**
 * Registers the CLI channels. The agent sessions (connect, advance, cancel)
 * come from codex_agent_bridge, which needs the app object and an authorization
 * check; the loopback bridge passes its own check because its origin is
 * verified once at the WebSocket upgrade.
 *
 * @param {object} ipcMain
 * @param {{ app?: object, isAuthorized?: (event: object) => boolean }} [options]
 * @returns {{ dispose: () => Promise<void> }}
 */
export function registerLocalCliIpc(ipcMain, { app = {}, isAuthorized = isAuthorizedSender } = {}) {
  ipcMain.handle(CLI_BRIDGE_CHANNEL.CHECK_ALL, async (_event, options) => {
    return await checkAllCliStatus(options || {});
  });

  ipcMain.handle("voo:cli-status", async (_event, cliId, options) => {
    return await checkCliStatus(cliId, options || {});
  });

  /**
   * Runs a headless text turn. Only Codex serves an MCP server, so other CLIs
   * are refused rather than routed through a different transport.
   */
  ipcMain.handle("voo:cli-run-text", async (event, cliId, { prompt, model, cwd } = {}) => {
    if (!isAuthorized(event)) {
      return { ok: false, code: "cli.unauthorizedSender" };
    }
    if (cliId !== "codex") {
      return { ok: false, code: "cli.mcpUnsupported", detail: cliId };
    }
    const bin = findCliBinary(CLI_DEFINITIONS.codex.names);
    if (!bin) {
      return { ok: false, code: "cli.notInstalled", detail: cliId };
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return { ok: false, code: "cli.emptyPrompt" };
    }
    if (model != null && (typeof model !== "string" || !SAFE_MODEL_RE.test(model))) {
      return { ok: false, code: "cli.invalidModel", detail: String(model) };
    }
    const cwdResult = validateCwd(cwd);
    if (!cwdResult.ok) {
      return { ok: false, code: cwdResult.code, detail: cwdResult.detail };
    }
    try {
      const text = await runCodexMcpSession(bin, { prompt, model, cwd: cwdResult.cwd });
      return { ok: true, text };
    } catch (error) {
      return {
        ok: false,
        code: error?.code ?? "cli.failed",
        detail: String(error?.message || error || ""),
      };
    }
  });

  return registerCodexAgentIpc({
    ipcMain,
    app,
    findBinary: () => findCliBinary(["codex"]),
    findClaudeBinary: () => findCliBinary(["claude"]),
    findAntigravityBinary: () => findCliBinary(["agy", "antigravity"]),
    isAuthorized,
  });
}
