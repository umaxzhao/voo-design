import { withExternalMcp } from "./external_mcp_client.js";
import { validateMcpServers } from "../src/shared/agent_mcp_servers.js";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCodexConnection } from "./codex_connection.js";
import { startAgentMcpServer } from "./agent_mcp_server.js";
import { createCodexAgentSession } from "./codex_agent_session.js";
import { createClaudeAgentSession } from "./claude_agent_session.js";
import { createAntigravityAgentSession } from "./antigravity_agent_session.js";
import {
  createCodexModelCatalog,
  validateCodexReasoningEffort,
} from "./codex_model_catalog.js";

/** CLIs that run a native VOO agent turn over this channel. */
const AGENT_CLIS = new Set(["claude", "codex", "antigravity"]);

/**
 * Resolvers are injected, never defaulted.
 *
 * This used to read `findClaudeBinary = () => null`, whose return value is
 * byte-for-byte the same as a CLI that is genuinely not installed. A caller
 * that forgot to wire a resolver therefore got a bridge that registered fine
 * and then failed every run with `cli.notInstalled` — the trap this default
 * hid, and the shape of the run-vs-picker disagreement this bridge is on.
 * Throwing here points the stack at the caller that forgot, at startup,
 * rather than at a user's run.
 *
 * @param {unknown} injected
 * @param {string} cliId
 * @returns {() => (string|null)}
 */
function requireBinaryResolver(injected, cliId) {
  if (typeof injected !== "function") {
    throw new Error(`cli.resolverMissing:${cliId}`);
  }
  return injected;
}

/**
 * Main-process ownership ties sessions to the exact renderer that started them.
 *
 * Despite the historical name this channel serves every native agent CLI:
 * `advance` carries a `cliId` (default "codex"). Both CLIs share one MCP
 * server and work directory; only Codex needs its long-lived app-server.
 */
export function registerCodexAgentIpc({
  ipcMain,
  app,
  findBinary,
  findClaudeBinary,
  findAntigravityBinary,
  isAuthorized,
}) {
  const resolveCodex = requireBinaryResolver(findBinary, "codex");
  const resolveClaude = requireBinaryResolver(findClaudeBinary, "claude");
  const resolveAntigravity = requireBinaryResolver(
    findAntigravityBinary,
    "antigravity",
  );
  const owners = new Map();
  const sessions = new Map();
  const starting = new Map();
  let hostPromise = null;
  let runtimePromise = null;
  let closing = false;

  /** The MCP server and scratch directory every agent session reports to. */
  async function host() {
    if (closing) throw new Error("cli.connectionClosed");
    hostPromise ??= (async () => {
      const token = randomBytes(32).toString("hex");
      const cwd = await mkdtemp(path.join(tmpdir(), "voo-agent-"));
      const mcp = await startAgentMcpServer({
        token,
        getSession: (id) => sessions.get(id)?.session,
      });
      return { token, cwd, mcp };
    })();
    try {
      return await hostPromise;
    } catch (error) {
      hostPromise = null;
      throw error;
    }
  }

  /** The Codex app-server connection, started on first Codex use. */
  async function runtime() {
    if (closing) throw new Error("cli.connectionClosed");
    if (runtimePromise) return runtimePromise;
    const bin = resolveCodex();
    if (!bin) throw new Error("cli.notInstalled");
    runtimePromise = (async () => {
      const { token, cwd, mcp } = await host();
      const connection = createCodexConnection({
        bin,
        env: { ...process.env, VOO_AGENT_MCP_TOKEN: token },
        onClose: () => {
          for (const [id, entry] of sessions) {
            if (entry.cliId !== "codex") continue;
            entry.session.close("cli.connectionClosed");
            sessions.delete(id);
          }
          runtimePromise = null;
        },
      });
      try {
        await connection.initialize();
      } catch (error) {
        connection.close();
        throw error;
      }
      return {
        connection,
        mcp,
        cwd,
        token,
        getModels: createCodexModelCatalog(connection),
      };
    })();
    try {
      return await runtimePromise;
    } catch (error) {
      runtimePromise = null;
      throw error;
    }
  }

  /** Everything a new session of `cliId` needs before it can start. */
  async function prepare(cliId, options) {
    if (cliId === "claude") {
      const bin = resolveClaude();
      if (!bin) throw new Error("cli.notInstalled");
      return { ...(await host()), claudeBin: bin };
    }
    if (cliId === "antigravity") {
      const bin = resolveAntigravity();
      if (!bin) throw new Error("cli.notInstalled");
      return { ...(await host()), antigravityBin: bin };
    }
    const initialized = await runtime();
    if (options.reasoningEffort !== undefined) {
      validateCodexReasoningEffort(
        await initialized.getModels(),
        options.model,
        options.reasoningEffort,
      );
    }
    return initialized;
  }

  const protect = (handler) => async (event, options) => {
    if (!isAuthorized(event))
      return { ok: false, code: "cli.unauthorizedSender" };
    try {
      return await handler(event, options ?? {});
    } catch (error) {
      return {
        ok: false,
        code: error.message?.startsWith("cli.") ? error.message : "cli.failed",
      };
    }
  };
  ipcMain.handle(
    "voo:codex-connect",
    protect(async () => {
      if (!resolveCodex())
        return {
          ok: false,
          installed: false,
          authenticated: false,
          connected: false,
        };
      const { connection, getModels } = await runtime();
      const status = await connection.call("account/read", {
        refreshToken: false,
      });
      const authenticated =
        Boolean(status.account) || status.requiresOpenaiAuth === false;
      let models = [];
      let modelsError;
      if (authenticated) {
        try {
          models = await getModels();
        } catch {
          modelsError = "cli.modelCapabilitiesUnavailable";
        }
      }
      return {
        ok: true,
        installed: true,
        authenticated,
        connected: authenticated,
        ready: authenticated,
        models,
        ...(modelsError && { modelsError }),
      };
    }),
  );
  ipcMain.handle(
    "voo:codex-advance",
    protect(async (event, options) => {
      if (options.externalMcp) {
        const servers = validateMcpServers(options.servers);
        if (options.externalMcp === "list") {
          const tools = [];
          for (const server of servers) {
            const listed = await withExternalMcp(server, client => client.listTools());
            tools.push(...listed.map(tool => ({ type: "function", function: { name: `mcp__${server.id}__${tool.name}`, description: tool.description ?? "", parameters: tool.inputSchema } })));
          }
          return { ok: true, tools };
        }
        const server = servers.find(server => options.name?.startsWith(`mcp__${server.id}__`));
        if (!server || options.externalMcp !== "call") throw new Error("cli.invalidRequest");
        const result = await withExternalMcp(server, client => client.callTool(options.name.slice(`mcp__${server.id}__`.length), options.arguments ?? {}));
        return { ok: true, result };
      }
      validateMcpServers(options.mcpServers ?? []);
      if (
        !Array.isArray(options.messages) ||
        !Array.isArray(options.tools) ||
        typeof options.requestId !== "string"
      )
        throw new Error("cli.invalidRequest");
      const cliId = options.cliId ?? "codex";
      if (!AGENT_CLIS.has(cliId)) throw new Error("cli.unsupported");
      let entry = options.sessionId ? sessions.get(options.sessionId) : null;
      if (options.sessionId && (!entry || entry.owner !== event.sender.id))
        throw new Error("cli.sessionUnavailable");
      if (!entry) {
        if (
          options.reasoningEffort !== undefined &&
          (typeof options.reasoningEffort !== "string" ||
            !options.reasoningEffort)
        )
          throw new Error("cli.invalidReasoningEffort");
        if (
          typeof options.model !== "string" ||
          !/^[a-zA-Z0-9._-]+$/.test(options.model)
        )
          throw new Error("cli.invalidModel");
        const requestKey = `${event.sender.id}:${options.requestId}`;
        const pending = { cancelled: false };
        starting.set(requestKey, pending);
        let initialized;
        try {
          initialized = await prepare(cliId, options);
        } finally {
          starting.delete(requestKey);
        }
        if (pending.cancelled || event.sender.isDestroyed() || closing)
          throw new Error("cli.cancelled");
        const onText = (text, offset) => {
          if (!event.sender.isDestroyed())
            event.sender.send("voo:codex-text", {
              requestId: entry.requestId,
              text,
              offset,
            });
        };
        const session =
          cliId === "claude"
            ? createClaudeAgentSession({
                bin: initialized.claudeBin,
                tools: options.tools,
                onText,
                onFinish: () => {},
              })
            : cliId === "antigravity"
                ? createAntigravityAgentSession({
                    bin: initialized.antigravityBin,
                    tools: options.tools,
                    onText,
                    onFinish: () => {},
                  })
                : createCodexAgentSession({
                    connection: initialized.connection,
                    tools: options.tools,
                    onText,
                    onFinish: () => {},
                  });
        entry = {
          session,
          cliId,
          owner: event.sender.id,
          requestId: options.requestId,
        };
        sessions.set(session.id, entry);
        if (!owners.has(event.sender.id)) {
          owners.set(event.sender.id, event.sender);
          event.sender.once("destroyed", () => {
            for (const [id, owned] of sessions)
              if (owned.owner === event.sender.id) {
                owned.session.close();
                sessions.delete(id);
              }
            owners.delete(event.sender.id);
          });
        }
        try {
          await session.start({
            model: options.model,
            messages: options.messages,
            mcpUrl: initialized.mcp.url,
            cwd: initialized.cwd,
            token: initialized.token,
            reasoningEffort: options.reasoningEffort,
            mcpServers: options.mcpServers ?? [],
          });
        } catch (error) {
          session.close();
          sessions.delete(session.id);
          throw error;
        }
      }
      // Further advances only deliver tool receipts to the existing native
      // turn. Its model and effort remain those validated at session startup.
      entry.requestId = options.requestId;
      const result = await entry.session.advance(options);
      if (result.done) sessions.delete(entry.session.id);
      return { ok: !result.error, sessionId: entry.session.id, ...result };
    }),
  );
  ipcMain.handle(
    "voo:codex-cancel",
    protect(async (event, { sessionId, requestId }) => {
      const pending = starting.get(`${event.sender.id}:${requestId}`);
      if (pending) pending.cancelled = true;
      for (const [id, entry] of sessions) {
        if (
          entry.owner === event.sender.id &&
          (id === sessionId || entry.requestId === requestId)
        ) {
          entry.session.close();
          sessions.delete(id);
        }
      }
      return { ok: true };
    }),
  );
  app.once?.("before-quit", () => {
    closing = true;
    for (const entry of sessions.values()) entry.session.close();
    if (runtimePromise)
      void runtimePromise
        .then(({ connection }) => connection.close())
        .catch(() => {});
    if (hostPromise)
      void hostPromise
        .then(({ mcp, cwd }) =>
          mcp.close().then(() => rm(cwd, { recursive: true, force: true })),
        )
        .catch(() => {});
  });
}
