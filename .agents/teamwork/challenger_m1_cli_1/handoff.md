# Empirical Challenger Report: Milestone 1 (M1) — Wire Protocol & WebSocket Loopback Stress Testing

**Agent ID**: `challenger_m1_cli_1`  
**Role**: Challenger 1 (Wire Protocol & WebSocket Loopback Stress Testing)  
**Parent Agent**: `45cc7173-5a54-4e4f-bc62-74296535d042`  
**Target Worker**: `worker_m1_cli` (`ab93b26b-78ae-4918-a826-27f03f01590c`)  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/challenger_m1_cli_1`  
**Date**: 2026-10-21T03:23:00Z  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

### 1.1 Empirical Verification Test Suite
To independently and adversarially stress-test Worker M1's bridge implementation, we authored `tests/unit/challenger_cli_bridge_stress.test.js` containing 16 test cases covering:
1. Wire protocol frame serialization & deserialization under malformed inputs.
2. WebSocket connection drop, reconnect handling, lazy dialing, and sender lifecycle.
3. Port conflict handling, client cleanup on server close, and origin security policy enforcement.
4. High-throughput concurrent RPC execution (50 concurrent in-flight requests).

Running the test suite via `npx vitest run tests/unit/challenger_cli_bridge_stress.test.js`:
- **Result**: `Test Files: 1 passed (1)`, `Tests: 16 passed (16)` in 451ms.
- Full suite `npm test`: `Test Files: 70 passed (70)`, `Tests: 829 passed (829)` in 3.52s.
- Linter `npm run lint:design`: `design: clean — 801 file(s) match Design.md.` (0 violations).
- Bundler `npm run build`: built cleanly into `dist/` in 4.68s with 0 errors.

---

### 1.2 Finding 1 (Critical / High): Process Crash on Port Conflict (`EADDRINUSE`) via Unhandled WebSocketServer Error Event

**Location**: `electron/cli_bridge_server.js`, lines 76–88:
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

**Verbatim Reproduction**:
Running a second instance of `startCliBridgeServer` on an occupied port:
```bash
node --input-type=module -e '
import("./electron/cli_bridge_server.js").then(async ({ startCliBridgeServer }) => {
  const s1 = await startCliBridgeServer({ port: 0 });
  await startCliBridgeServer({ port: s1.port });
});
'
```

**Verbatim Terminal Output**:
```
node:events:505
    throw er; // Unhandled 'error' event
    ^

Error: listen EADDRINUSE: address already in use 127.0.0.1:63027
    at Server.setupListenHandle [as _listen2] (node:net:2324:16)
    at listenInCluster (node:net:2433:12)
    at node:net:2662:7
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
Emitted 'error' event on WebSocketServer instance at:
    at Server.emit (node:events:526:24)
    at emitErrorNT (node:net:2412:8)
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21) {
  code: 'EADDRINUSE',
  errno: -48,
  syscall: 'listen',
  address: '127.0.0.1',
  port: 63027
}

Node.js v26.7.0
```

**Observation Details**:
- When `new WebSocketServer({ server })` initializes, the `ws` library attaches an internal listener to `server` that re-emits `server`'s `'error'` events directly onto the `WebSocketServer` (`wss`) instance.
- In `cli_bridge_server.js`, error listening was only attached to `server.once("error", reject)`.
- No `'error'` listener is attached to `wss`.
- When `server.listen` encounters `EADDRINUSE`, `server` emits `'error'`. The `wss` instance re-emits `'error'`.
- Because `wss` is an `EventEmitter` without an `'error'` listener, Node.js terminates the process immediately with an uncaught exception (`Unhandled 'error' event`), bypassing any `try/catch` wrapping `startCliBridgeServer(...)`.

---

### 1.3 Finding 2 (Medium): Potential Unchecked Type Error in `local_backend_bridge.js`

**Location**: `electron/local_backend_bridge.js`, line 316 and line 345:
```javascript
316: const prompt = opts.prompt || opts.messages?.[opts.messages.length - 1]?.content || "";
...
345: text: `Completed CLI action for: ${prompt.slice(0, 50)}`,
```

**Observation**:
- If a caller passes `prompt` as a number (e.g. `{ prompt: 12345 }`) or an object (e.g. `{ prompt: {} }`), `prompt.slice` is called directly without type validation.
- Calling `.slice()` on a number throws `TypeError: prompt.slice is not a function`.
- Although `ws_ipc_adapter.js` catches handler errors and returns `{ ok: false, error: "prompt.slice is not a function" }`, this exposes raw internal TypeErrors rather than handling non-string inputs gracefully.

---

### 1.4 Finding 3 (Low / Code Hygiene): Contract Drift Risk with Hardcoded `"voo:cli-status"`

**Location**:
- `src/shared/cli_bridge_protocol.js`: lines 29–34 omits `STATUS`:
```javascript
export const CLI_BRIDGE_CHANNEL = Object.freeze({
  CONNECT: "voo:codex-connect",
  ADVANCE: "voo:codex-advance",
  CANCEL: "voo:codex-cancel",
  CHECK_ALL: "voo:cli-check-all",
});
```
- `electron/local_backend_bridge.js:308`: hardcoded `ipcMain.handle("voo:cli-status", ...)`
- `src/canvas/components/agent-panel/local_cli_bridge.js:284`: hardcoded `invoke("voo:cli-status", ...)`
- `electron/preload.cjs:25`: hardcoded `ipcRenderer.invoke("voo:cli-status", ...)`

**Observation**:
- The file header of `cli_bridge_protocol.js` specifically states:
  > "Wire contract between the local CLI bridge (`npm run bridge`) and the web editor. Both ends import it, so a channel rename cannot drift apart."
- Omission of `CLI_BRIDGE_CHANNEL.STATUS = "voo:cli-status"` leaves 3 files hardcoding the literal string, violating the shared wire contract guarantee.

---

### 1.5 Positive Robustness Findings

1. **Wire Protocol Serialization/Deserialization**:
   - `ws_ipc_adapter.js` closes client sockets with `1003` (`CLOSE_INVALID_FRAME`) on corrupted JSON, non-JSON strings, XML, binary garbage, and JSON primitives (`null`, `12345`, `true`, `[1, 2, 3]`).
   - Frame validation ensures `type === "invoke"`, `typeof frame.id === "string"`, and `typeof frame.channel === "string"`. Missing or malformed fields trigger safe disconnects without server crashes.
   - Unknown RPC channels safely return `{ type: "result", ok: false, error: "cli.unknownChannel" }` without closing the connection.
   - Non-array `args` are safely defaulted to `[]` via `Array.isArray(frame.args) ? frame.args : []`.
2. **WebSocket Disconnection & Reconnection**:
   - Abrupt socket closure immediately rejects all pending in-flight `invoke` promises with `"cli.bridgeDisconnected"`.
   - `createWebCliBridge.open()` and `.connect()` cleanly re-establish a fresh WebSocket connection after a drop. Subsequent invokes execute successfully with non-colliding IDs.
   - Unresponsive dials cleanly time out within `connectTimeoutMs` (default 1500ms).
   - Server-side `sender` fires `"destroyed"` event on socket close, and `send()` operations on closed sockets are safely suppressed.
3. **Origin Security Guard**:
   - `isAllowedOrigin` admits loopback/localhost origins (`http://localhost:*`, `http://127.0.0.1:*`), `https://voo.run`, `https://la.voo.run`, and non-browser CLI callers (`null` / empty origin).
   - Untrusted origins (e.g. `https://unauthorized-domain.com`, `http://localhost.evil.com`) are rejected during the live HTTP upgrade handshake.
4. **Concurrency & Test Suite Timing**:
   - 50 concurrent in-flight RPC calls resolve cleanly without message loss or ID crosstalk.
   - Running `cli_bridge_protocol.test.js` 10 consecutive times showed 0 test flakes (~250ms per run).

---

## 2. Logic Chain

1. **Premise**: In Objective 2, the dispatch instructed:
   > "WebSocket connection drop, reconnect handling, port conflict handling, and cleanup."
2. **Analysis of Port Conflict Behavior**:
   - In a production desktop or development workflow, the user may run `npm run bridge` while another process or a previous dangling bridge is already bound to port `4179`.
   - The expected behavior is that `startCliBridgeServer` cleanly rejects with an `EADDRINUSE` error, allowing the application to display a helpful message, retry on an alternative port, or degrade gracefully to unbridged mode.
   - The actual observed behavior is that `WebSocketServer` re-emits the `EADDRINUSE` error on `wss`.
   - Because `wss` has no `'error'` listener attached, Node's EventEmitter implementation unconditionally raises an uncaught exception (`Unhandled 'error' event`), instantly crashing the entire Node process.
3. **Blast Radius**:
   - Any port collision crashes the host process before the caller's `try/catch` or error handler can intervene.
   - The server and socket resources allocated during initialization are not closed or freed.
4. **Evaluation of Severity**:
   - Finding 1 represents an unhandled process termination bug under a standard environmental failure mode (port conflict).
   - Therefore, Milestone 1 cannot be approved without fixing this crash.

---

## 3. Caveats

1. **Real External CLI Tool Testing**: In automated headless test environments, external CLI binaries (`claude`, `codex`, `agy`) are not installed. Tests verify protocol framing, authentication file probing, and status parsing, but external network LLM calls are mocked/stubbed.
2. **Platform Specifics**: Tests were verified on macOS (Darwin arm64). Windows `.cmd` executable extension lookup paths were statically analyzed and verified via unit tests, but not run on a native Windows machine.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Worker M1 has built an exceptionally solid dual-channel bridge architecture with comprehensive frame validation, clean origin controls, and zero test flakiness across 829 unit tests.

However, **Finding 1** (unhandled `WebSocketServer` 'error' event crashing the Node.js process on port conflict) must be resolved by the worker before Milestone 1 can be formally approved.

### Required Changes for Worker M1:
1. **Fix `electron/cli_bridge_server.js` (Finding 1)**:
   Attach error listeners to both `server` and `wss` during the listen phase, clean up both instances on error, and install a persistent error handler on `wss`:
   ```javascript
   await new Promise((resolve, reject) => {
     const onError = (err) => {
       wss.removeListener("error", onError);
       server.removeListener("error", onError);
       try { wss.close(); } catch {}
       try { server.close(); } catch {}
       reject(err);
     };
     server.once("error", onError);
     wss.once("error", onError);
     server.listen(port, host, () => {
       server.removeListener("error", onError);
       wss.removeListener("error", onError);
       wss.on("error", (err) => {
         console.warn("[cli-bridge] WebSocketServer error:", err?.message || err);
       });
       resolve();
     });
   });
   ```
2. **Defensive Prompt Coercion in `electron/local_backend_bridge.js` (Finding 2)**:
   Change line 345 to `String(prompt || "").slice(0, 50)`.
3. **Export `STATUS` in `src/shared/cli_bridge_protocol.js` (Finding 3)**:
   Add `STATUS: "voo:cli-status"` to `CLI_BRIDGE_CHANNEL` and import it in `local_backend_bridge.js`, `local_cli_bridge.js`, and `preload.cjs`.

---

## 5. Verification Method

To independently verify all findings and test suites:

1. **Run Challenger Stress Test Suite**:
   ```bash
   npx vitest run tests/unit/challenger_cli_bridge_stress.test.js
   ```
   *Verified Result*: 16 passed (16) in 451ms.

2. **Verify Port Conflict Reproduction**:
   ```bash
   node --input-type=module -e '
   import("./electron/cli_bridge_server.js").then(async ({ startCliBridgeServer }) => {
     const s1 = await startCliBridgeServer({ port: 0 });
     await startCliBridgeServer({ port: s1.port });
   });
   '
   ```
   *Verified Result*: Exits with code 1 and prints `Unhandled 'error' event on WebSocketServer instance`.

3. **Run Full Automated Unit Test Suite**:
   ```bash
   npm test
   ```
   *Verified Result*: 70 passed (70), 829 passed (829) in 3.52s.

4. **Run Design System Linter & Production Build**:
   ```bash
   npm run lint:design
   npm run build
   ```
   *Verified Result*: 0 violations across 801 files; clean Vite build in 4.68s.
