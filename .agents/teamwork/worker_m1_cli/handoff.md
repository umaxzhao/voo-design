# Handoff Report: Milestone 1 (M1) — Local CLI Bridge Infrastructure & Provider Defaults

**Agent ID**: `worker_m1_cli` (`ab93b26b-78ae-4918-a826-27f03f01590c`)  
**Parent Agent**: `45cc7173-5a54-4e4f-bc62-74296535d042`  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m1_cli`  
**Date**: 2026-10-21T03:15:00Z  
**Type**: Hard Handoff (Milestone 1 Complete)

---

## 1. Observation

### 1.1 Baseline State Prior to Milestone 1
- `src/shared/agent-defaults.js` defined `DEFAULT_AGENT_MODEL = "codex:gpt-6-astra"` (Codex pinned as default) with no Claude Code model constants.
- `src/shared/cli-agents.js` had `antigravity` marked as `supported: false, experimental: true`, had no `binary` property definitions on CLI agents, and had no exported default active agent getter.
- `src/shared/providers.js` mapped only `CODEX_MODELS` to `CLI_TEXT_MODELS`, omitting Claude Code and Antigravity models.
- `src/shared/providers/provider_cli.js` only checked `window.vooDesktop?.localCli` with no support for loopback WebSocket bridge connections or streaming jobs (`streamProviderJob`).
- `src/canvas/components/agent-panel/local_cli_bridge.js` and `codex_transport.js` were missing from the project.
- `electron/preload.cjs` exposed `window.electronAPI` only, with no `window.vooDesktop.localCli` surface.
- `electron/main.cjs` had no IPC handlers registered for `voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`, or `voo:cli-check-all`.
- `electron/cli_bridge_server.js`, `electron/ws_ipc_adapter.js`, `electron/local_backend_bridge.js`, and `scripts/cli-bridge.mjs` were absent.
- `package.json` had no `ws` dependency and no `"bridge"` script.

### 1.2 Implemented Changes
- **`src/shared/agent-defaults.js`**:
  - Exported `DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"` and `CLAUDE_MODELS` (covering `claude-opus-5-5`, `opus`, `sonnet`, `haiku`, `best`, `default`, `fable`).
  - Set `DEFAULT_AGENT_MODEL = "claude:claude-opus-5-5"`.
- **`src/shared/cli-agents.js`**:
  - Defined `DEFAULT_CLI_AGENT_ID = "claude"` and exported `getDefaultCliAgent()`.
  - Enabled Antigravity: `supported: true`, `binary: "agy"`, `defaultModel: "gemini-2.5-pro"`, with models `gemini-2.5-pro`, `gemini-2.5-flash`, `claude-3-7-sonnet`.
  - Added explicit binaries (`claude`, `codex`, `opencode`, `agy`) and install commands (`@anthropic-ai/claude-code`, `@openai/codex`, `@opencode/cli`, `@google/antigravity-cli`).
  - Updated `getVisibleCliAgents(optedIn)`: filters `(!agent.experimental && agent.supported) || (agent.experimental && optedIn)`.
- **`src/shared/providers.js`**:
  - Imported `CLAUDE_MODELS`.
  - Defined `ANTIGRAVITY_TEXT_MODELS` and expanded `CLI_TEXT_MODELS` to include Claude Code, Codex, and Antigravity models.
  - Set `CLI_TEXT_MODEL_ID = DEFAULT_AGENT_MODEL`.
- **`src/shared/providers/provider_cli.js`**:
  - Integrated `getLocalCliBridge()`, supporting dual-channel bridge connectivity.
  - Implemented `runCliText` with support for both `bridge.runText` and `bridge.advance` + `onText`.
  - Implemented and exported `streamProviderJob({ mediaType, request, onChunk, onReasoning, signal })`.
- **`src/canvas/components/agent-panel/local_cli_bridge.js`**:
  - Built unified bridge supporting both Desktop IPC (`desktopBridge()`) and Web WebSocket loopback (`createWebCliBridge()`, default port 4179).
  - Implemented `connect()`, `advance()`, `cancel()`, `checkAll()`, `checkStatus()`, and `onText(listener)` returning unsubscribe callback.
  - Implemented lazy dial policy: `resolveCliTransport()` probes with `dial: false` without triggering network permissions.
- **`src/canvas/components/agent-panel/codex_transport.js`**:
  - Built `streamCodexCompletion` async generator adapting CLI text events and results into stream completion chunks.
  - Supports `signal` abort listener calling `bridge.cancel()`.
- **`electron/preload.cjs`**:
  - Exposes `window.vooDesktop` with `localCli: { connect, advance, cancel, checkAll, checkStatus, onText }` while preserving `window.electronAPI`.
- **`electron/main.cjs`**:
  - Dynamically registers `registerLocalCliIpc(ipcMain)` on app startup.
- **`electron/ws_ipc_adapter.js`**:
  - Provides an `ipcMain`-compatible facade over WebSockets, parsing `INVOKE` frames, dispatching to handlers, and pushing `RESULT` and `EVENT` (`voo:codex-text`) frames.
- **`electron/local_backend_bridge.js`**:
  - Defines `CLI_DEFINITIONS` for all 4 tools.
  - Implements `findCliBinary` scanning absolute and user `$HOME` directories with 2000ms caching and TTL invalidation.
  - Implements `checkCliAuth` checking environment variables and configuration files (`.credentials.json`, `auth.json`, OAuth tokens).
  - Implements `checkCliStatus` and `checkAllCliStatus` returning structured statuses (`ready`, `unauthenticated`, `not_installed`).
  - Registers IPC handlers for `voo:codex-connect`, `voo:cli-check-all`, `voo:cli-status`, `voo:codex-advance`, and `voo:codex-cancel`.
- **`electron/cli_bridge_server.js`**:
  - Loopback HTTP + WebSocket server listening on `127.0.0.1:4179`.
  - Provides `/health` HTTP probe returning `{"ok": true, "version": "1.0.0"}`.
  - Restricts WebSocket upgrade to allowed origins (`localhost`, `127.0.0.1`, `voo.run`, `la.voo.run`).
- **`scripts/cli-bridge.mjs` & `package.json`**:
  - Added `"bridge": "node scripts/cli-bridge.mjs"` and standalone launcher.
  - Added `"ws": "^8.22.0"` dependency.
- **Automated Unit Tests**:
  - `tests/unit/cli_bridge_protocol.test.js`: 12 comprehensive unit tests covering protocol constants, WS IPC adapter wire routing, event pushes, invalid frame disconnection, lazy dial policy, desktop IPC wrapper, real server roundtrip, and stream generator.
  - `tests/unit/provider_cli_registry.test.js`: 16 comprehensive unit tests covering default agent selection, Claude Opus 5.5 constants, expanded model catalog, Antigravity opt-in gating, model ID parsing, honest provider config availability, job submission/fetch, and incremental stream chunks.

---

## 2. Logic Chain

1. **Default Model & Agent Selection**:
   - The user request specified: "default the agent connection to Claude Code (`@anthropic-ai/claude-code`, binary `claude`, default connected agent)".
   - By updating `DEFAULT_AGENT_MODEL` in `src/shared/agent-defaults.js` to `claude:claude-opus-5-5`, setting `DEFAULT_CLI_AGENT_ID = "claude"` in `src/shared/cli-agents.js`, and ensuring `CLI_TEXT_MODEL_ID = DEFAULT_AGENT_MODEL` in `src/shared/providers.js`, any fresh session or fallback defaults immediately to Claude Code.
   - Claude Opus 5.5 is configured as the active primary model, while stable aliases (`default`, `best`, `opus`, `sonnet`, `haiku`, `fable`) remain available for runtime resolution.

2. **Dual-Channel Bridge Architecture**:
   - In Electron Desktop, `electron/preload.cjs` bridges renderer calls to main process IPC channels (`voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`, `voo:cli-check-all`).
   - In browser Web mode, renderer calls cannot access `ipcRenderer`. The client bridge `local_cli_bridge.js` dials loopback WebSocket `ws://127.0.0.1:4179` served by `electron/cli_bridge_server.js`.
   - `electron/ws_ipc_adapter.js` maps WebSocket JSON frames (`invoke`, `result`, `event`) directly to the exact same `ipcMain` handlers registered by `electron/local_backend_bridge.js`.
   - Therefore, the client interface (`connect`, `advance`, `cancel`, `checkAll`, `onText`) behaves identically in both Desktop and Web environments.

3. **Subprocess Probing & Authentication**:
   - `findCliBinary` uses a fast static scan of standard binary paths (`/usr/local/bin`, `/opt/homebrew/bin`, `~/.npm-global/bin`, `~/.claude/local`, `~/.gemini/antigravity-cli/bin`, etc.) and caches results with a 2-second TTL to avoid duplicate filesystem walks.
   - `checkCliAuth` tests environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) and credential files on disk, ensuring `checkCliStatus` returns honest status codes: `"ready"`, `"unauthenticated"`, or `"not_installed"`.

4. **Streaming Execution Adapter**:
   - `provider_cli.js` exposes `streamProviderJob` which delegates to `bridge.advance` and collects streaming chunks pushed by `bridge.onText`.
   - `codex_transport.js` implements `streamCodexCompletion`, yielding asynchronous generator chunks formatted for both OpenAI-compatible delta consumers (`choices[0].delta.content`) and direct text consumers (`{ text, done }`).

---

## 3. Caveats

1. **Subprocess Execution in CI / Headless Mode**:
   - In automated test environments without installed CLI binaries, `checkCliStatus` correctly returns `installed: false` and `status: "not_installed"`.
   - All unit tests in `cli_bridge_protocol.test.js` and `provider_cli_registry.test.js` test wire protocols, frame serialization, event streams, and status detection without requiring real external API keys or installed CLIs.
2. **WebSocket Port Binding**:
   - The default bridge port is `4179`. In tests, `port: 0` is used to bind to dynamic ephemeral ports to avoid port collision.
   - If port 4179 is occupied on a user's machine, `VOO_CLI_BRIDGE_PORT` environment variable allows overriding the port.

---

## 4. Conclusion

Milestone 1 (M1) is 100% complete and fully verified:
- Local CLI bridge infrastructure is implemented across Desktop IPC (`vooDesktop.localCli`) and Web Loopback WebSocket (`ws://127.0.0.1:4179`).
- Provider defaults are switched to Claude Code (`claude:claude-opus-5-5`), with Antigravity enabled as a supported CLI agent.
- `provider_cli.js` and `codex_transport.js` provide unified job and streaming execution.
- Standalone bridge runner `npm run bridge` is configured in `package.json`.
- 100% of automated unit tests pass (68/68 test suites, 788/788 tests).
- Design system linter reports 0 violations across 801 files.
- Production build succeeds cleanly without bundle or module resolution errors.

Milestone 2 (First-Launch Onboarding Configuration Guide Modal) and Milestone 3 (Canvas Selection Island & Agent Panel Turn Dispatch) can now proceed with full confidence in the underlying bridge infrastructure.

---

## 5. Verification Method

To independently reproduce and verify all results:

1. **Run Full Automated Unit Test Suite**:
   ```bash
   npm test
   ```
   *Verified Result*: `Test Files: 68 passed (68)`, `Tests: 788 passed (788)` in 3.33s.

2. **Run Targeted M1 Unit Tests**:
   ```bash
   npx vitest run tests/unit/cli_bridge_protocol.test.js tests/unit/provider_cli_registry.test.js
   ```
   *Verified Result*: `2 passed (2)`, `28 passed (28)` in 0.45s.

3. **Run Design System Linter**:
   ```bash
   npm run lint:design
   ```
   *Verified Result*: `design: clean — 801 file(s) match Design.md.` (0 violations).

4. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Verified Result*: Clean Vite production build bundling into `dist/` in 4.58s with 0 errors.

5. **Verify Standalone Bridge Server Health Probe**:
   ```bash
   node -e '
   import("./electron/cli_bridge_server.js").then(async ({ startCliBridgeServer }) => {
     const bridge = await startCliBridgeServer({ port: 4179 });
     const res = await fetch("http://127.0.0.1:4179/health");
     const data = await res.json();
     console.log("Health check:", data);
     await bridge.close();
   });'
   ```
   *Verified Result*: Prints `Health check: { ok: true, version: '1.0.0' }` and exits cleanly with code 0.
