# Reviewer & Adversarial Audit Report: Milestone 1 (M1) — Local CLI Bridge Infrastructure

**Reviewer**: `reviewer_m1_cli_2` (Reviewer 2: Dual-Channel Bridge Architecture, IPC & Server Robustness)  
**Parent Agent**: `45cc7173-5a54-4e4f-bc62-74296535d042`  
**Date**: 2026-10-21T03:22:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## Review Summary

While the overall architecture for the Dual-Channel CLI Bridge (`local_cli_bridge.js`, `preload.cjs`, `main.cjs`, `ws_ipc_adapter.js`, `local_backend_bridge.js`) is cleanly structured and conforms to the project specification, **automated verification fails** on `npm test` with 1 failing test suite and an uncaught exception in `tests/unit/challenger_cli_bridge_stress.test.js`.

The root cause is a server robustness bug in `electron/cli_bridge_server.js`: when a port conflict occurs (`EADDRINUSE`), `ws.WebSocketServer` re-emits the underlying HTTP server's error event. Because `wss` lacks an `'error'` event listener, Node.js treats this as an unhandled event on an EventEmitter and crashes the process with an uncaught exception, rather than rejecting the startup Promise cleanly.

---

## 1. Observation

### 1.1 Automated Quality Checks
1. **Design System Linter**:
   - Command: `npm run lint:design`
   - Result: `design: clean — 801 file(s) match Design.md.` (0 violations). **PASS**.
2. **Production Bundler**:
   - Command: `npm run build`
   - Result: Clean Vite build into `dist/` in 4.80s with 0 errors. **PASS**.
3. **Automated Unit Tests**:
   - Command: `npm test`
   - Result: `Test Files: 1 failed | 69 passed (70)`, `Tests: 1 failed | 828 passed (829)`. **FAIL**.
   - Verbatim failure:
     ```text
     FAIL tests/unit/challenger_cli_bridge_stress.test.js > Empirical Challenger: Wire Protocol & WebSocket Loopback Stress Testing > 3. Port Conflict, Cleanup & Origin Security Guard > detects port conflict with EADDRINUSE and keeps existing server intact
     Error: Test timed out in 5000ms.

     Uncaught Exception:
     Error: listen EADDRINUSE: address already in use 127.0.0.1:63181
         at Server.setupListenHandle [as _listen2] (node:net:2324:16)
         at listenInCluster (node:net:2433:12)
         at node:net:2662:7
         at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
     Emitted 'error' event on WebSocketServer instance at:
         at Server.emit (node:events:526:24)
         at emitErrorNT (node:net:2412:8)
     ```

### 1.2 Inspection of `electron/cli_bridge_server.js`
In `electron/cli_bridge_server.js` (lines 76–88):
```javascript
  const wss = new WebSocketServer({
    server,
    verifyClient: ({ origin }) => isAllowedOrigin(origin, allowed),
  });

  wss.on("connection", (socket) => {
    adapter.attach(socket);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
```
- `wss` is created with `{ server }`. In `ws` library internals, passing `server` causes `WebSocketServer` to register an internal listener on `server`: `server.on('error', (err) => this.emit('error', err))`.
- When `server.listen(port, host)` fails with `EADDRINUSE`, `server` emits `'error'`.
- `wss` immediately re-emits `'error'`.
- Since `wss` has no listener registered for `'error'`, Node.js EventEmitter executes `if (this.listenerCount('error') === 0) throw er;`, triggering an uncaught exception in the event loop before the `reject` promise can settle safely.

### 1.3 Inspection of `src/canvas/components/agent-panel/local_cli_bridge.js`
- **Desktop IPC wrapping (`wrapDesktopBridge`)**: Correctly wraps `window.vooDesktop.localCli` with `connect`, `advance`, `cancel`, `checkAll`, `checkStatus`, `runText`, and `onText`.
- **Browser Loopback (`createWebCliBridge`)**: Correctly implements JSON wire protocol (`invoke`, `result`, `event`), manages `pending` map, rejects in-flight calls on socket drop with `cli.bridgeDisconnected`.
- **Lazy Dialing Policy**: `resolveCliTransport()` probes via `ensureLocalCliBridge({ dial: false })`, ensuring pages don't open sockets or trigger network permissions prematurely.
- **Contract nuance**: `createWebCliBridge.connect()` throws `new Error("cli.bridgeDisconnected")` on connection failure rather than resolving `{ ok: false, error }`, while `PROJECT.md` line 87 specifies `Promise<{ ok: boolean, transport: ..., error?: string }>`.

### 1.4 Inspection of `electron/preload.cjs` & `electron/main.cjs`
- `electron/preload.cjs` (lines 9–19): Exposes `window.vooDesktop.localCli` mapping:
  - `connect` -> `voo:codex-connect`
  - `advance` -> `voo:codex-advance`
  - `cancel` -> `voo:codex-cancel`
  - `checkAll` -> `voo:cli-check-all`
  - `checkStatus` -> `voo:cli-status`
  - `onText` -> `voo:codex-text` (returns unsubscribe function via `removeListener`)
  Existing `window.electronAPI` methods remain completely untouched.
- `electron/main.cjs` (lines 328–332): Asynchronously imports `local_backend_bridge.js` and registers `registerLocalCliIpc(ipcMain)`.

### 1.5 Inspection of `electron/ws_ipc_adapter.js` & `electron/local_backend_bridge.js`
- `ws_ipc_adapter.js`: Implements an `ipcMain`-compatible facade. Rejects invalid frames and malformed JSON with WebSocket close code 1003. Properly supports `sender.send(...)` for streaming event notifications.
- `local_backend_bridge.js`:
  - `findCliBinary`: Scans system PATH and user directories with a 2-second TTL cache (`CLI_BINARY_CACHE_TTL_MS`).
  - `checkCliAuth`: Reliably checks environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) and on-disk credentials (`~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.gemini/antigravity-cli/...`).
  - `checkCliStatus`: Returns honest status (`ready`, `unauthenticated`, `not_installed`).
  - Integrity check: No hardcoded test responses or fake pass logic was found. The status probe inspects real files and environment paths.

---

## 2. Findings

### [Major] Finding 1: Unhandled `'error'` Event on `WebSocketServer` during Port Collision
- **What**: Port collision (`EADDRINUSE`) during `startCliBridgeServer` causes an uncaught exception on `wss` and times out the test suite.
- **Where**: `electron/cli_bridge_server.js`, lines 76–88.
- **Why**: When `http.Server.listen` encounters `EADDRINUSE`, `ws.WebSocketServer` re-emits the error on itself. Without a `wss.on("error", ...)` handler, Node.js EventEmitter throws an unhandled error event, crashing the Node process and failing `tests/unit/challenger_cli_bridge_stress.test.js`.
- **Suggestion**:
  In `startCliBridgeServer`, attach an error handler to `wss` and ensure clean teardown:
  ```javascript
  await new Promise((resolve, reject) => {
    const onError = (err) => {
      try { wss.close(); } catch {}
      try { server.close(); } catch {}
      reject(err);
    };
    server.once("error", onError);
    wss.on("error", () => {}); // Prevent unhandled EventEmitter crash on wss
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
  ```

### [Minor] Finding 2: `bridge.connect()` Error Return Shape
- **What**: When `createWebCliBridge.connect()` fails to connect, it throws `new Error("cli.bridgeDisconnected")` instead of returning `{ ok: false, error: ... }`.
- **Where**: `src/canvas/components/agent-panel/local_cli_bridge.js`, lines 274–277.
- **Why**: `PROJECT.md` line 87 lists the contract as `Promise<{ ok: boolean, transport: "desktop_ipc" | "web_loopback", error?: string }>`.
- **Suggestion**:
  In `createWebCliBridge.connect`:
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

## 3. Adversarial Stress Test Results

| # | Stress Scenario | Expected Behavior | Actual Behavior | Result |
|---|----------------|-------------------|-----------------|--------|
| 1 | Port conflict (`EADDRINUSE`) on bridge startup | Server rejects with `EADDRINUSE` error cleanly | `WebSocketServer` emits unhandled error event, crashing process | **FAIL** |
| 2 | Origin spoofing (`http://evil.com`, `http://localhost.evil.com`) | Handshake rejected with HTTP 403 / abort | Handshake rejected, `isAllowedOrigin` returns `false` | **PASS** |
| 3 | Sandboxed iframe origin (`"null"`) | Rejected (not admitted as local) | Handshake rejected, `isAllowedOrigin` returns `false` | **PASS** |
| 4 | Non-browser local CLI client (empty Origin) | Admitted | `isAllowedOrigin` returns `true` | **PASS** |
| 5 | Malformed JSON / raw byte wire injection | Socket closed with code 1003 (`CLOSE_INVALID_FRAME`) | Socket closed with code 1003 | **PASS** |
| 6 | Abrupt socket drop mid-request | In-flight promises rejected with `cli.bridgeDisconnected` | All pending calls reject with `cli.bridgeDisconnected` | **PASS** |
| 7 | High-throughput concurrent invokes (50 simultaneous) | All 50 frames dispatched and resolved without crosstalk | All 50 returned with matching IDs | **PASS** |
| 8 | Exception inside client `onText` listener | Other listeners and message loop continue uninterrupted | Error is isolated in try/catch block | **PASS** |
| 9 | Lazy dial policy (`dial: false`) | Does not attempt socket connection | Returns `null` without calling `WebSocket` constructor | **PASS** |

---

## 4. Logic Chain

1. Worker M1 delivered Milestone 1 and claimed 100% test pass rate (788/788 tests).
2. Challenger tests (`tests/unit/challenger_cli_bridge_stress.test.js`) stress-tested the server lifecycle and port collision handling.
3. Running `npm test` fails with 1 failing test and 1 unhandled error: `listen EADDRINUSE: address already in use 127.0.0.1:63181`.
4. Source code inspection of `electron/cli_bridge_server.js` reveals that `WebSocketServer` does not handle the `'error'` event that `ws` forwards from `server`.
5. Under Node.js EventEmitter semantics, unhandled error events throw uncaught exceptions, crashing the runtime.
6. Acceptance Criterion AC 5.1 requires `npm test` to pass 100% of unit and integration tests.
7. Because `npm test` fails, the Milestone cannot be approved in its current state.

---

## 5. Caveats

- **Scope boundary**: `advance` in `local_backend_bridge.js` currently returns simulated progress strings rather than invoking native subprocesses. This aligns with the milestone plan where full turn execution and canvas mutation are scoped to Milestone 3.
- **Integrity**: No cheating or falsified logic was detected; the issue is an unhandled event edge case in error propagation.

---

## 6. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone 1 implementation is 95% complete and demonstrates strong architectural fidelity. However, the unhandled `'error'` event on `WebSocketServer` in `electron/cli_bridge_server.js` breaks automated test verification (`npm test` failing).

Once Worker M1 applies the fix in `electron/cli_bridge_server.js` (adding `wss.on("error", () => {})` and proper teardown on listen failure) and all 70 test suites pass cleanly, Milestone 1 will be ready for approval.

---

## 7. Verification Method

To reproduce the failure and verify the resolution:

1. **Reproduce the failing test suite**:
   ```bash
   npx vitest run tests/unit/challenger_cli_bridge_stress.test.js
   ```
   *Current Result*: Fails on test `detects port conflict with EADDRINUSE and keeps existing server intact` with `Uncaught Exception: listen EADDRINUSE`.

2. **Verify full test suite**:
   ```bash
   npm test
   ```
   *Target Result*: All 70 test suites and 829+ unit tests pass with 0 errors.

3. **Verify design linter & build**:
   ```bash
   npm run lint:design
   npm run build
   ```
   *Target Result*: 0 violations in design lint, clean bundle output in build.
