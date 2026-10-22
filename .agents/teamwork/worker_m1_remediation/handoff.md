# Remediation Report: Milestone 1 (M1) — Local CLI Bridge & Transport Defect Fixes

**Agent ID**: `worker_m1_remediation`  
**Role**: Implementer / QA / Specialist  
**Parent Agent**: `45cc7173-5a54-4e4f-bc62-74296535d042`  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m1_remediation`  
**Date**: 2026-10-21T03:36:00Z  
**Verdict**: **COMPLETE / READY FOR APPROVAL**

---

## 1. Observation

### 1.1 Remediated Defects & Code Changes

#### Defect 1: Unhandled `'error'` event on `WebSocketServer` during port collision (`EADDRINUSE`)
- **File**: `electron/cli_bridge_server.js` (lines 76–105)
- **Previous behavior**: When `server.listen(port, host)` collided on an existing port (`EADDRINUSE`), the underlying HTTP server emitted `'error'`. The `ws.WebSocketServer` instance (`wss`) internally re-emitted this error onto itself. Because `wss` had no `'error'` listener attached, Node.js raised an unhandled EventEmitter error that crashed the process with an uncaught exception (`Emitted 'error' event on WebSocketServer instance`).
- **Remediation**:
  1. Attached an error handler `wss.on("error", () => {})` to swallow forwarded errors and prevent EventEmitter crashes.
  2. In `startCliBridgeServer`, implemented an `onError` listener on `server` that cleanly terminates both `wss` (`try { wss.close(); } catch {}`) and `server` (`try { server.close(); } catch {}`) before rejecting the startup Promise.

#### Defect 2: Spurious stream cancellation on successful turns in `codex_transport.js`
- **File**: `src/canvas/components/agent-panel/codex_transport.js` (lines 196–203)
- **Previous behavior**:
  ```javascript
  if (!finished || !signal) {
    if (signal) sessions.delete(signal);
    await cancelNativeRequest(entry, failed);
  }
  ```
  When consumers invoked `streamCodexCompletion` without providing an optional `signal` parameter, `!signal` evaluated to `true`. Even when the turn completed 100% successfully (`finished === true`), the `finally` block unconditionally invoked `cancelNativeRequest(entry, failed)` with `failed === false`. If the bridge socket disconnected or rejected during cleanup, `cancelNativeRequest` re-threw the error, causing a successfully completed stream to crash with an unhandled rejection.
- **Remediation**:
  ```javascript
  if (signal) sessions.delete(signal);
  if (!finished) {
    await cancelNativeRequest(entry, failed);
  }
  ```
  `cancelNativeRequest` is now strictly guarded by `!finished`, eliminating spurious cancellations when streams finish normally without an explicit `signal`.

#### Defect 3: Layout streaming failed to route Claude Code and Antigravity models to CLI bridge
- **File**: `src/canvas/store/layout_action_helpers.js` (lines 1–6, 53–58) and `src/shared/cli-agents.js` (line 250)
- **Previous behavior**: `streamLayoutText` used a legacy check:
  ```javascript
  const isCliModel = (model ?? DEFAULT_AGENT_MODEL).startsWith("codex:");
  ```
  Because `DEFAULT_AGENT_MODEL` was updated to `claude:claude-opus-5-5`, this check evaluated to `false`. `streamLayoutText` incorrectly routed default layout generation requests to `PROVIDER_ID.DEEPSEEK` (`streamProviderText`), throwing `Cloud AI generation runtime is not configured in standalone mode`.
- **Remediation**:
  1. In `src/shared/cli-agents.js`, re-exported `parseCliModelId` from `./providers/provider_cli.js`.
  2. In `src/canvas/store/layout_action_helpers.js`, imported `parseCliModelId` from `../../shared/cli-agents.js`.
  3. Updated the check to:
     ```javascript
     const { cliId } = parseCliModelId(model ?? DEFAULT_AGENT_MODEL);
     const isCliModel = Boolean(cliId);
     ```
     All CLI models (`claude:`, `codex:`, `antigravity:`) now route to `PROVIDER_ID.CLI`.

#### Defect 4: Unchecked input types and blind trust of `opts.binPath` in `local_backend_bridge.js`
- **File**: `electron/local_backend_bridge.js` (lines 95–102, 343–350)
- **Previous behavior**:
  - `findCliBinary(null)` passed `null` to `path.join`, throwing an unhandled `TypeError: The "path" argument must be of type string. Received null`.
  - `findCliBinary` returned `opts.binPath` without verifying `fs.existsSync(opts.binPath)`, causing `checkCliStatus` to report non-existent paths as `ready`.
  - In `advance` handler, `prompt.slice(0, 50)` threw a `TypeError` if callers passed a non-string `prompt` (e.g. number, boolean, or object).
- **Remediation**:
  - In `findCliBinary`:
    ```javascript
    if (opts.binPath && fs.existsSync(opts.binPath)) return opts.binPath;
    const binaryNames = Array.isArray(names)
      ? names.filter((n) => typeof n === "string" && Boolean(n.trim()))
      : (typeof names === "string" && Boolean(names.trim()) ? [names.trim()] : []);
    if (!binaryNames.length) return null;
    ```
  - In `advance` handler:
    ```javascript
    const promptText = typeof prompt === "string" ? prompt : JSON.stringify(prompt ?? "");
    ```

#### Defect 5: `createWebCliBridge.connect()` threw instead of resolving error object
- **File**: `src/canvas/components/agent-panel/local_cli_bridge.js` (lines 273–280)
- **Previous behavior**: Threw `new Error("cli.bridgeDisconnected")` on connection failure rather than resolving `{ ok: false, error }`, violating the contract in `PROJECT.md` line 87 (`Promise<{ ok: boolean, transport: ..., error?: string }>`).
- **Remediation**:
  ```javascript
  connect: async () => {
    const ok = await open();
    if (!ok) {
      return { ok: false, transport: "web_loopback", error: "cli.bridgeDisconnected" };
    }
    const val = await invoke(CLI_BRIDGE_CHANNEL.CONNECT);
    return { ok: true, transport: "web_loopback", value: val };
  },
  ```

---

## 2. Logic Chain

1. **Server Port Collision Crash Prevention**:
   - Node.js EventEmitter terminates the runtime if an `'error'` event is emitted on an instance with 0 listeners.
   - When `ws.WebSocketServer` wraps an `http.Server`, it binds an internal listener re-emitting server errors.
   - Installing `wss.on("error", () => {})` guarantees that forwarded error events do not crash the process.
   - Calling `wss.close()` and `server.close()` during `onError` releases bound ports and prevents resource leaks.

2. **Stream Cleanup Integrity**:
   - A stream that yields `{ done: true }` has completed execution on the CLI subprocess.
   - Cancelling a completed request is superfluous and dangerous if the connection has already terminated.
   - Restricting `cancelNativeRequest` to `!finished` guarantees that normally completed turns return their output cleanly.

3. **Provider Routing Coherence**:
   - `DEFAULT_AGENT_MODEL` is `claude:claude-opus-5-5`.
   - By delegating CLI model detection to `parseCliModelId`, any model prefixed with a recognized CLI prefix (`claude:`, `codex:`, `antigravity:`) routes through the CLI bridge.

4. **Defensive Subprocess & Wire Validation**:
   - Validating `fs.existsSync(opts.binPath)` ensures status probes only claim `ready` when the executable actually exists on disk.
   - Sanitizing names to non-empty strings prevents `path.join` TypeError exceptions.
   - Coercing non-string prompt objects avoids unhandled TypeError exceptions in IPC/WS message handlers.

5. **Interface Contract Adherence**:
   - Returning `{ ok: false, transport: "web_loopback", error: "cli.bridgeDisconnected" }` from `bridge.connect()` aligns with `PROJECT.md` line 87.

---

## 3. Caveats

- **External CLI Binary Execution**: In headless test and build environments, real CLI executables (`claude`, `codex`, `agy`) are not installed. All tests verify binary location detection, authentication credential parsing, wire protocol framing, and status evaluation with mocked subprocess channels.
- **Milestone Scope**: Turn execution on canvas nodes and full AI Island bar interactions remain scoped to Milestones 2 and 3 per the project roadmap.

---

## 4. Conclusion

**Verdict: COMPLETE / READY FOR APPROVAL**

All 5 defects identified by Reviewer 2, Challenger 1, and Challenger 2 have been thoroughly remediated:
1. `cli_bridge_server.js` handles port conflicts cleanly without crashing.
2. `codex_transport.js` no longer triggers spurious cancellations on successful streams.
3. `layout_action_helpers.js` correctly routes all CLI models (`claude:`, `codex:`, `antigravity:`) to `PROVIDER_ID.CLI`.
4. `local_backend_bridge.js` handles non-existent paths, null names, and non-string prompts without throwing TypeErrors.
5. `local_cli_bridge.js` returns `{ ok: false, transport: "web_loopback", error: "cli.bridgeDisconnected" }` on connect failure.

All automated verification gates pass:
- `npm test`: 70/70 test suites pass, 835/835 tests pass with 0 failures.
- `npm run lint:design`: 0 violations across 801 files.
- `npm run build`: Clean production bundle built in 4.62s.
- Deployment: Successfully deployed to `la` (`https://la.voo.run/editor/`), remote HTTP 200 OK verified.

---

## 5. Verification Method

To independently verify the implementation:

1. **Run Challenger Bridge Stress Suite**:
   ```bash
   npx vitest run tests/unit/challenger_cli_bridge_stress.test.js
   ```
   *Expected Result*: 18/18 tests pass.

2. **Run Challenger Provider Stress Suite**:
   ```bash
   npx vitest run tests/unit/challenger_stress_cli.test.js
   ```
   *Expected Result*: 29/29 tests pass.

3. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected Result*: 70/70 test files pass, 835/835 tests pass.

4. **Run Design System Linter**:
   ```bash
   npm run lint:design
   ```
   *Expected Result*: Clean — 801 file(s) match `Design.md`.

5. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected Result*: Clean build in `dist/`.

6. **Verify Remote Production Probe**:
   ```bash
   curl -sI https://la.voo.run/editor/ | head -n 5
   ```
   *Expected Result*: `HTTP/2 200`.
