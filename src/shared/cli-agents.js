import { CODEX_MODELS, DEFAULT_CODEX_MODEL } from "./agent-defaults.js";
import { getSetting, setSetting } from "./settings.js";

export const ANTIGRAVITY_OPT_IN_KEY = "voo.agent.experimental.antigravity";

export function isAntigravityOptedIn() {
  return Boolean(getSetting(ANTIGRAVITY_OPT_IN_KEY));
}

export function setAntigravityOptedIn(enabled) {
  setSetting(ANTIGRAVITY_OPT_IN_KEY, Boolean(enabled));
}

/** Agent identities are distinct from local inference engines. */
export const CLI_AGENTS = [
  {
    id: "claude",
    providerId: "claude-cli",
    displayName: "Claude Code",
    labelKey: "agent.connection.claude",
    // Claude Code owns alias resolution, account availability, and provider
    // restrictions. Claude Opus 5.5 has verified local firstParty evidence
    // (claude-opus-5-5), while stable aliases (default, best, fable, opus,
    // sonnet, haiku) remain delegated to the CLI for runtime resolution.
    defaultModel: "claude-opus-5-5",
    models: [
      { id: "default", labelKey: "agent.claudeModel.default" },
      { id: "best", labelKey: "agent.claudeModel.best" },
      { id: "claude-opus-5-5", labelKey: "agent.claudeModel.opus55" },
      { id: "fable", labelKey: "agent.claudeModel.fable" },
      { id: "opus", labelKey: "agent.claudeModel.opus" },
      { id: "sonnet", labelKey: "agent.claudeModel.sonnet" },
      { id: "haiku", labelKey: "agent.claudeModel.haiku" },
    ],
    installCmd: "npm install -g @anthropic-ai/claude-code",
    supported: true,
  },
  {
    id: "codex",
    providerId: "cli",
    displayName: "Codex",
    labelKey: "agent.connection.codex",
    defaultModel: DEFAULT_CODEX_MODEL,
    models: CODEX_MODELS,
    installCmd: "npm install -g @openai/codex",
    supported: true,
  },
  {
    id: "opencode",
    providerId: "opencode-cli",
    displayName: "OpenCode",
    labelKey: "agent.connection.opencode",
    // The installed CLI owns provider/model routes and account availability.
    // A catalog entry containing "free" is not a pricing or access guarantee.
    defaultModel: "",
    models: [],
    installCmd: "npm install -g @opencode/cli",
    supported: true,
  },
  {
    id: "antigravity",
    providerId: "antigravity-cli",
    displayName: "Antigravity",
    labelKey: "agent.connection.antigravity",
    // The installed `agy models` command determines this account's models.
    // With no list, omit --model and let Antigravity use its own default.
    defaultModel: "gemini-3.8-flash-high",
    models: [],
    installCmd: "npm install -g @google/antigravity-cli",
    supported: true,
    experimental: false,
  },
  {
    id: "deepseek-harness",
    providerId: "deepseek",
    displayName: "DeepSeek Harness",
    name: "DeepSeek Harness",
    labelKey: "agent.connection.deepseekHarness",
    defaultModel: "deepseek-v4-flash",
    models: [],
    // Detected by macOS app bundle; no standalone CLI binary is documented.
    detectedBy: "app-bundle",
    detectionType: "app-bundle",
    appBundle: true,
    installCmd: "",
    supported: true,
  },
];

const discoveredCliModels = new Map();

/** In-memory account-specific models received from the local CLI bridge. */
export function setDiscoveredCliModels(cliId, models) {
  if (!["antigravity", "opencode"].includes(cliId) || !Array.isArray(models))
    return;
  discoveredCliModels.set(cliId, models);
}

export function getDiscoveredCliModels(cliId) {
  return discoveredCliModels.get(cliId) ?? [];
}

/**
 * Returns the agents the UI offers. Antigravity stays experimental and opt-in:
 * only shown when the user explicitly enabled it.
 */
export function getVisibleCliAgents(optedIn = isAntigravityOptedIn()) {
  return CLI_AGENTS.filter(
    (agent) => agent.supported || (agent.experimental && optedIn),
  );
}

/**
 * Dynamic view of the visible CLI agents. Preserves backwards compatibility
 * while dynamically showing experimental agents when opted in.
 */
export const VISIBLE_CLI_AGENTS = new Proxy([], {
  get(_target, prop) {
    const list = getVisibleCliAgents();
    if (prop === Symbol.iterator) {
      return list[Symbol.iterator].bind(list);
    }
    const val = list[prop];
    if (typeof val === "function") {
      return val.bind(list);
    }
    return val;
  },
});

export function cliAgentForProvider(providerId) {
  return CLI_AGENTS.find((agent) => agent.providerId === providerId) ?? null;
}

/**
 * How far the transport the page is on can take a local CLI.
 *
 * "Is a bridge reachable" and "may that bridge launch a process" are two
 * questions, and one boolean was answering both — `Boolean(bridge)` in the
 * picker, `Boolean(getLocalCliBridge())` in the settings summary — which is how
 * a card ends up green for a route that has nowhere to run.
 *
 * Two of the four transports carry reads only. The desktop app's panel link
 * (`electron/panel_link_replies.js`) and the extension's external port
 * (`src/background/external_bridge.js`) both answer `BG.DESKTOP_LINKED` and
 * hand the page the whole `localCli` shape — presence, install state, login
 * state — while deliberately refusing `BG.DESKTOP_CLI_INVOKE`: reading a
 * machine's configuration over a link is not a licence to run a process on it.
 * What such a page reads is therefore *true* — that machine really does have
 * the CLI — and still not runnable from here, which is a third answer neither
 * "connected" nor "not installed" can give.
 */
export const CLI_TRANSPORT = Object.freeze({
  /** Nothing to talk to at all: no desktop app and no CLI bridge. */
  NONE: "none",
  /** A link that carries reads only: the configuration is real, the process is not reachable. */
  READS_ONLY: "readsOnly",
  /** A bridge that may launch the process: the app's own IPC, the extension's runtime, or the loopback CLI bridge. */
  RUNNABLE: "runnable",
});

/**
 * Binary installation alone is not evidence of a usable login.
 *
 * Fails closed on the transport: anything that is not `RUNNABLE` — an
 * unrecognised value, a bare boolean from an older caller — reads as "cannot
 * run here", so a surface that has not thought about the transport can never
 * produce a green card by accident.
 */
export function cliConnectionReason(agent, status, transport) {
  if (transport !== CLI_TRANSPORT.RUNNABLE) {
    return transport === CLI_TRANSPORT.READS_ONLY
      ? "agent.connection.linkReadsOnly"
      : "agent.connection.desktopOnly";
  }
  if (!status?.installed) return "agent.connection.notInstalled";
  if (status.status === "unavailable")
    return status.reasonKey === "cli.unsupportedVersion"
      ? "cli.unsupportedVersion"
      : "agent.connection.statusUnavailable";
  if (status.authenticated !== true || status.ready === false) {
    return "agent.connection.loginRequired";
  }
  if (!agent.supported && !(agent.experimental && isAntigravityOptedIn())) {
    return "agent.connection.unsupported";
  }
  return null;
}

/**
 * Whether a CLI can actually be offered: the binary is on the machine AND the
 * login behind it is live.
 *
 * Authentication on its own says nothing about installation. The bridge calls
 * `claude` authenticated when `ANTHROPIC_API_KEY` is set or when a
 * `~/.claude/.credentials.json` / `~/.claude.json` survives from an earlier
 * install, so a machine with no `claude` binary still reports
 * `authenticated: true` — reading that as connected is how an agent card ends
 * up with a green dot for a CLI the user does not have.
 *
 * Deliberately derived from `cliConnectionReason` rather than restating the
 * conditions: the card's dot, the run's refusal, and the status line must be
 * three readings of ONE rule, or the next change drifts them apart again.
 *
 * @param {string} transport one of `CLI_TRANSPORT`; the page's own transport,
 *   never a guess at it — see there for why "a bridge exists" is a different
 *   question.
 */
export function isCliAgentConnected(agent, status, transport) {
  if (!agent) return false;
  return cliConnectionReason(agent, status, transport) === null;
}

/**
 * Normalizes Claude Code CLI model identifiers to their canonical form.
 *
 * Handles both prefixed (`claude:...`) and raw CLI model strings:
 * - `claude:claude-opus-5`, `claude:opus-5`, `claude:opus-5-5` -> `claude:claude-opus-5-5`
 * - raw `claude-opus-5`, `opus-5`, `opus-5-5` -> `claude-opus-5-5`
 * Stable aliases (`opus`, `claude:opus`, `default`, `best`, etc.) remain untouched.
 */
export function canonicalizeCliModelId(modelId) {
  if (!modelId || typeof modelId !== "string") return modelId;
  const raw = modelId.trim();
  if (
    raw === "claude:claude-opus-5" ||
    raw === "claude:opus-5" ||
    raw === "claude:opus-5-5"
  ) {
    return "claude:claude-opus-5-5";
  }
  if (raw === "claude-opus-5" || raw === "opus-5" || raw === "opus-5-5") {
    return "claude-opus-5-5";
  }
  return raw;
}

/**
 * Resolves a raw CLI model identifier for spawning the `claude` process argument.
 * Strips `claude:` prefix and resolves legacy models to `claude-opus-5-5`.
 */
export function resolveClaudeCliModel(modelId) {
  if (!modelId || typeof modelId !== "string") return modelId;
  let target = modelId.trim();
  if (target.startsWith("claude:")) {
    target = target.slice("claude:".length);
  }
  return canonicalizeCliModelId(target);
}
