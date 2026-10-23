# Handoff Report: Local CLI Agent Detection, Dual-Channel Bridge Architecture & Provider Registry Survey

**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_cli`  
**Date**: 2026-10-21  
**Archetype**: Explorer (Read-only investigation)

---

## 1. Observation

### 1.1 Existing CLI Definitions and Provider Files
- **`src/shared/cli_bridge_protocol.js`** (lines 18–46):
  - `CLI_BRIDGE_DEFAULT_PORT = 4179;`
  - `NATIVE_AGENT_CLI_IDS = Object.freeze(["codex", "claude", "antigravity", "opencode"]);`
  - `CLI_BRIDGE_CHANNEL`: `CONNECT: "voo:codex-connect"`, `ADVANCE: "voo:codex-advance"`, `CANCEL: "voo:codex-cancel"`, `CHECK_ALL: "voo:cli-check-all"`.
  - `CLI_BRIDGE_EVENT.TEXT = "voo:codex-text"`.
  - `CLI_BRIDGE_MESSAGE`: `INVOKE: "invoke"`, `RESULT: "result"`, `EVENT: "event"`.
- **`src/shared/cli-agents.js`** (lines 15–73):
  - Defines `CLI_AGENTS` containing:
    - `claude`: `displayName: "Claude Code"`, `providerId: "claude-cli"`, `defaultModel: "claude-opus-5-5"`, `models: ["default", "best", "claude-opus-5-5", "fable", "opus", "sonnet", "haiku"]`, `installCmd: "npm install -g @anthropic-ai/claude-code"`, `supported: true`.
    - `codex`: `displayName: "Codex"`, `providerId: "cli"`, `defaultModel: DEFAULT_CODEX_MODEL`, `models: CODEX_MODELS`, `installCmd: "npm install -g @openai/codex"`, `supported: true`.
    - `opencode`: `displayName: "OpenCode"`, `providerId: "opencode-cli"`, `supported: true`.
    - `antigravity`: `displayName: "Antigravity"`, `providerId: "antigravity-cli"`, `installCmd: "npm install -g @google/antigravity-cli"`, `supported: false`, `experimental: true`.
  - Defines `CLI_TRANSPORT` (`NONE: "none"`, `READS_ONLY: "readsOnly"`, `RUNNABLE: "runnable"`).
  - Defines `cliConnectionReason(agent, status, transport)` and `isCliAgentConnected(agent, status, transport)`.
  - Defines `canonicalizeCliModelId(modelId)` and `resolveClaudeCliModel(modelId)`.
- **`src/shared/agent-defaults.js`** (lines 2–3):
  - `DEFAULT_CODEX_MODEL = "gpt-6-astra";`
  - `DEFAULT_AGENT_MODEL = "codex:gpt-6-astra";` *(Note: Currently defaults to Codex instead of Claude Code)*.
- **`src/shared/providers.js`** (lines 730–734):
  - `CLI_TEXT_MODELS = CODEX_MODELS.map((model) => ({ id: "codex:" + model.id, label: "Codex · " + model.label }));`
  - `CLI_TEXT_MODEL_ID = DEFAULT_AGENT_MODEL;` *(Only lists Codex models, omitting Claude Code and Antigravity)*.
- **`src/shared/providers/provider_cli.js`** (lines 27–47, 130–136):
  - `function cliBridgeAvailable() { return typeof window !== "undefined" && Boolean(window.vooDesktop?.localCli); }`
  - `runCliText(cliId, model, prompt)` calls `window.vooDesktop?.localCli.runText(cliId, { prompt, model })`.
  - This implementation is Desktop-only and does not implement the loopback WebSocket client (`ws://127.0.0.1:4179`) nor the streaming advance/event wire protocol.
- **`src/shared/providers/provider_registry.js`** (lines 41, 198–237, 314–338):
  - Registers `[PROVIDER_ID.CLI, adapt(cliEngine)]`.
  - `streamRegisteredProviderJob` checks `typeof provider.streamJob === "function"`. `provider_cli.js` currently does not implement `streamProviderJob`.

### 1.2 Electron Subprocess & IPC Infrastructure
- **`electron/preload.cjs`** (lines 3–18):
  - Exposes `window.electronAPI` (`isElectron`, `platform`, file dialogs, fs read/write, `model:loadBytes`, `onMenuAction`).
  - Does NOT expose `window.vooDesktop` or `window.vooDesktop.localCli`.
- **`electron/main.cjs`** (lines 240–326):
  - Registers IPC handles: `dialog:openFile`, `dialog:saveFile`, `fs:readFile`, `fs:readBinary`, `fs:writeFile`, `fs:writeBinary`, `model:loadBytes`.
  - Has NO handlers for `CLI_BRIDGE_CHANNEL` (`voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`, `voo:cli-check-all`).
  - Has NO binary lookup (`findCliBinary`), login probing (`checkCliAuth`), or subprocess lifecycle management.

### 1.3 Canvas Agent & Contextual Island Interaction
- **`src/canvas/agent/canvas_agent.js`** & **`src/canvas/agent/chat_stream.js`** (lines 56–80):
  - Currently executes turns by sending HTTP POST requests to `${config.baseUrl}/chat/completions` using an API key (`streamChatTurn`).
  - Does NOT interface with local CLI processes or bridge transports.
- **`src/canvas/components/canvas_agent_panel.jsx`** (lines 148–170):
  - Dispatches turns exclusively through `runAgentTurn` with stored `AGENT_SETTING.API_KEY`, `BASE_URL`, `MODEL`.
  - Listens for `voo:agent-prompt` and `voo:open-agent-panel` custom DOM events dispatched by the floating island bar (`src/canvas/components/editor_contextual_ai_input.jsx`).
  - Status pill currently renders a static model name badge without live connection indicators or CLI install triggers.

### 1.4 Reference Implementation in `voo-run`
- Inspected `/Volumes/TD/Projects/voo-run`:
  - **`electron/cli_bridge_server.js`**: Starts an `http.createServer` + `WebSocketServer` (from `ws`) on `127.0.0.1:4179` with a `/health` endpoint and origin verification (`DEFAULT_CLI_BRIDGE_ORIGINS`).
  - **`electron/ws_ipc_adapter.js`**: Creates an `ipcMain`-like facade over WebSocket connections, translating `{ type: "invoke", id, channel, args }` into handler calls and returning `{ type: "result", id, ok, value, error }` / pushing `{ type: "event", channel, payload }`.
  - **`electron/local_backend_bridge.js`**:
    - `findCliBinary(names, options)`: scans PATH + standard absolute/user directories (`~/.npm-global/bin`, `~/.nvm/...`, `~/.cargo/bin`, `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`) with TTL caching.
    - `checkCliAuth(cliId, binPath, options)`: checks API keys in env (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`), credential files (`~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.gemini/antigravity-cli/auth.json`), or probes via CLI commands.
    - `checkCliStatus(cliId, options)`: returns `{ status, installed, authenticated, ready, binPath, installCmd, loginCmd, models }`.
  - **`electron/codex_agent_bridge.js`** & **`claude_agent_session.js`**: spawns headless agent subprocesses (`claude -p --input-format stream-json --output-format stream-json --verbose ...`), binds MCP tools, and streams chunks.
  - **`src/canvas/components/agent-panel/local_cli_bridge.js`**: Unified client bridge supporting:
    - `desktopBridge()`: `window.vooDesktop?.localCli` (Electron IPC)
    - `webBridge`: `createWebCliBridge({ url: "ws://127.0.0.1:4179" })` (WebSocket loopback)
    - Methods: `connect()`, `advance(options)`, `cancel(options)`, `checkAll()`, `onText(listener)`.
  - **`src/canvas/components/agent-panel/codex_transport.js`**: `streamCodexCompletion` async generator adapting CLI events into OpenAI-compatible delta streams (`{ choices: [{ delta: { content, tool_calls } }] }`).
  - **`src/canvas/components/onboarding/`**:
    - Complete visual assets, styling, and step progress components (`OnboardingGuide.jsx`, `onboarding_step_progress.jsx`, `onboarding_art.jsx`, `onboarding_state.js`).

### 1.5 Quality and Verification Baseline
- Executed `npm run lint:design`: passed cleanly (`799 file(s) match Design.md`).
- Executed `npm test`: all 66 test suites passed (760 tests total).

---

## 2. Logic Chain

1. **Local CLI Provider Readiness**:
   - `src/shared/cli_bridge_protocol.js` and `src/shared/cli-agents.js` already have complete schema definitions for `claude`, `codex`, `antigravity`, and `opencode`.
   - However, `DEFAULT_AGENT_MODEL` in `src/shared/agent-defaults.js` is currently pinned to `codex:gpt-6-astra`, and `CLI_TEXT_MODELS` in `src/shared/providers.js` only maps `CODEX_MODELS`.
   - *Inference*: To satisfy R1 ("default the agent connection to Claude Code"), `DEFAULT_AGENT_MODEL` must be changed to `claude:claude-opus-5-5`, `CLI_TEXT_MODELS` must include Claude Code models, and `antigravity` must be enabled as a supported CLI agent.

2. **Dual-Channel Bridge Architecture**:
   - In Desktop mode: The renderer expects `window.vooDesktop.localCli` to invoke IPC channels `voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`, `voo:cli-check-all`.
   - In Web mode: Browser security blocks direct subprocess spawning, so the web client dials `ws://127.0.0.1:4179` to communicate with the local CLI bridge server.
   - *Inference*: The client requires a unified `local_cli_bridge.js` that checks for `window.vooDesktop.localCli` first; if absent, it dials `ws://127.0.0.1:4179`.
   - *Inference*: The host requires `electron/cli_bridge_server.js` and `electron/ws_ipc_adapter.js`, launched either standalone via `npm run bridge` (`scripts/cli-bridge.mjs`) or embedded in the Electron main process.
   - *Inference*: `electron/preload.cjs` must expose `window.vooDesktop.localCli`, bridging `ipcRenderer.invoke` to match the exact same API surface.

3. **Subprocess Probing & Execution**:
   - `findCliBinary` needs to resolve binary paths across both `PATH` and non-standard shell locations (`/opt/homebrew/bin`, `~/.nvm`, `~/.npm-global/bin`).
   - `checkCliStatus` needs to probe both presence and authentication (checking keys in env, config files in home directory, or executing `--version` / status commands), returning distinct statuses: `ready`, `unauthenticated`, `not_installed`.
   - Headless subprocess execution for Claude Code (`claude -p --input-format stream-json --output-format stream-json ...`) enables tool calls and streaming responses without interactive terminal prompts.

4. **Contextual Dispatch & Agent Panel Integration**:
   - `CanvasAgentPanel` currently only supports API key-based HTTP chat completions.
   - *Inference*: When the active model starts with a CLI prefix (e.g. `claude:`, `codex:`, `agy:`), `CanvasAgentPanel` must route turn execution through `streamCodexCompletion` / `streamCliCompletion` over the local CLI bridge, streaming text deltas and executing canvas tool mutations with undo/redo transactions.

5. **First-Launch Onboarding Wizard**:
   - Per requirement R2 and user instruction `2026-10-21T02:49:26Z` ("直接复刻voo-run的引导界面样式，简化流程"):
   - Port styling and layout from `/Volumes/TD/Projects/voo-run/src/canvas/components/onboarding` (`OnboardingGuide.jsx`, `onboarding_step_progress.jsx`, `onboarding_art.jsx`).
   - Streamline into a focused 3-step setup:
     1. Step 1: Welcome & Agent Selection (defaulting to Claude Code `@anthropic-ai/claude-code`, with toggle/cards for Codex and Antigravity).
     2. Step 2: Local Detection & Connection (live check for binary/bridge, install instructions if absent, quick status probe).
     3. Step 3: Ready & Enter Canvas (apply configuration, persist onboarding completed state, and enter editor).
   - Mount in `App.jsx` with first-launch automatic trigger (checking `voo.onboarding.completed`), plus a manual trigger in `AppTitleBar` or `CanvasAgentPanel`.

---

## 3. Caveats

1. **No External Network Dependency for Verification**:
   - During automated tests (`npm test`), real CLI binaries (`claude`, `codex`, `agy`) may not be installed in the CI/headless environment.
   - *Mitigation*: Tests must mock the bridge transport (`createWebCliBridge`, fake WebSocket, or mock `window.vooDesktop.localCli`) to verify all states (`ready`, `not_installed`, `unauthenticated`, `bridgeDisconnected`) deterministically.
2. **`ws` Package in Web Bridge Server**:
   - `ws` is currently not in `voo_design`'s `package.json` dependencies (though present in `voo-run`).
   - *Mitigation*: For the loopback WebSocket server, either `ws` should be added to dependencies, or the bridge server can leverage Node's built-in HTTP server with an upgrade handler / lightweight frame parser, or import `ws` from existing tooling.
3. **Design System Token Strictness**:
   - All newly added components must adhere 100% to `Design.md` (no emojis in JSX, no forbidden gradients, strict dark palette `#0c0c0c`, `#18181b`, `#121214`, mint accent `#a7ffd4`, standard shadows `shadow-panel`, `shadow-pop`). `npm run lint:design` will be enforced.

---

## 4. Conclusion & Concrete Plan of Action

### Summary Table: Files to Create / Modify

| Component | Target File | Action | Description / Rationale |
|---|---|---|---|
| **Agent Defaults** | `src/shared/agent-defaults.js` | Modify | Set `DEFAULT_AGENT_MODEL = "claude:claude-opus-5-5"` and export Claude model constants. |
| **CLI Agent Models** | `src/shared/cli-agents.js` | Modify | Enable `antigravity` (`supported: true`), export helper functions for default models. |
| **Provider Models** | `src/shared/providers.js` | Modify | Expand `CLI_TEXT_MODELS` to include Claude Code (`claude:claude-opus-5-5`, etc.) and set `CLI_TEXT_MODEL_ID = DEFAULT_AGENT_MODEL`. |
| **CLI Provider Engine** | `src/shared/providers/provider_cli.js` | Modify | Update to query `getLocalCliBridge()`, support dual-channel bridge, export `streamProviderJob`. |
| **Client Bridge** | `src/canvas/components/agent-panel/local_cli_bridge.js` | Create | Dual-channel client bridge: `desktopBridge()` (Electron IPC) + `createWebCliBridge()` (WebSocket loopback). |
| **CLI Stream Transport** | `src/canvas/components/agent-panel/codex_transport.js` | Create | Adapts `bridge.advance` and `bridge.onText` into async iterable stream for canvas agent turns. |
| **CLI Status Hook** | `src/canvas/components/agent-panel/useAgentCliStatus.js` | Create | React hook for polling, probing, and refreshing CLI installation and auth status. |
| **Agent Panel** | `src/canvas/components/canvas_agent_panel.jsx` | Modify | Support CLI models: route through `streamCodexCompletion`, display active model status pill with live status dot. |
| **Electron Preload** | `electron/preload.cjs` | Modify | Expose `window.vooDesktop.localCli` (`connect`, `advance`, `cancel`, `checkAll`) over Electron IPC. |
| **Electron Main** | `electron/main.cjs` | Modify | Register IPC handlers for `CLI_BRIDGE_CHANNEL` (`voo:codex-connect`, `voo:codex-advance`, `voo:codex-cancel`, `voo:cli-check-all`). |
| **Bridge Server** | `electron/cli_bridge_server.js` | Create | Loopback HTTP + WebSocket bridge server on port 4179 with `/health` endpoint and origin guard. |
| **WS IPC Adapter** | `electron/ws_ipc_adapter.js` | Create | Bridges WebSocket JSON frames (`invoke`, `result`, `event`) to an `ipcMain`-compatible dispatcher. |
| **CLI Backend Engine** | `electron/local_backend_bridge.js` | Create | Binary lookup (`findCliBinary`), login probing (`checkCliAuth`), and status checking (`checkCliStatus`). |
| **CLI Session Runners** | `electron/codex_agent_bridge.js`, `claude_agent_session.js` | Create | Subprocess execution managers for headless Claude Code and Codex turns. |
| **Bridge CLI Script** | `scripts/cli-bridge.mjs` | Create | Standalone launcher for `npm run bridge`. |
| **Package Script** | `package.json` | Modify | Add `"bridge": "node scripts/cli-bridge.mjs"`. |
| **Onboarding Guide** | `src/canvas/components/onboarding/OnboardingGuide.jsx` | Create | Ported from `voo-run`, streamlined into 3-step setup (Welcome/Select, Detect/Connect, Ready). |
| **Onboarding Steps** | `src/canvas/components/onboarding/step_agent_select.jsx`, `step_cli_detect.jsx`, `step_ready.jsx` | Create | Individual step screens adhering strictly to `Design.md`. |
| **Onboarding Progress** | `src/canvas/components/onboarding/onboarding_step_progress.jsx`, `onboarding_art.jsx` | Create | Reusable 3-step progress bar and dark decorative artwork. |
| **Onboarding State** | `src/canvas/components/onboarding/onboarding_state.js` | Create | Handles step transitions and persistence (`voo.onboarding.completed`). |
| **App Mount** | `src/App.jsx` & `src/app_title_bar.jsx` | Modify | Mount `OnboardingGuide`, automatically show on first visit, provide manual trigger from TitleBar. |
| **Unit Tests** | `tests/unit/local_cli_bridge.test.js` & `onboarding_guide.test.jsx` | Create | Comprehensive unit tests covering dual-channel bridge, status detection, and onboarding flow. |

---

## 5. Verification Method

1. **Design System Linter**:
   ```bash
   npm run lint:design
   ```
   *Expected*: Reports 0 violations across all existing and newly created files.
2. **Automated Unit Tests**:
   ```bash
   npm test
   ```
   *Expected*: 100% of test suites pass, including new tests in `tests/unit/local_cli_bridge.test.js` and `tests/unit/onboarding_guide.test.jsx`.
3. **Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Clean Vite bundling without module resolution errors or missing exports.
4. **End-to-End Bridge Probe**:
   - Run loopback bridge server: `npm run bridge` (verifying `http://127.0.0.1:4179/health` returns `{"ok":true}`).
   - Verify WebSocket handshake over `ws://127.0.0.1:4179` with `voo:cli-check-all`.
5. **Deployment Verification**:
   ```bash
   VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh
   ```
   *Expected*: Bundle uploaded to `/var/www/voo.run/editor/` on `la` (`103.114.160.86`), remote HTTP probe returns 200 OK.
