# Handoff Report: Challenger 2 (Provider Registry, Model Parsing & Stream Transport Stress Testing)

**Agent ID**: `challenger_m1_cli_2`  
**Parent Agent**: `45cc7173-5a54-4e4f-bc62-74296535d042`  
**Working Directory**: `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/challenger_m1_cli_2`  
**Date**: 2026-10-21T03:25:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

A dedicated empirical stress-testing suite (`tests/unit/challenger_stress_cli.test.js`, 29 tests) was authored and executed against the implementation deliverables from Worker M1 (`worker_m1_cli`).

```bash
npx vitest run tests/unit/challenger_stress_cli.test.js
# Result: 1 passed (1), 29 passed (29) in 760ms
```

### Observation 1: `codex_transport.js` Crashes Successful Streams on Cleanup If `signal` Is Omitted
- **File**: `src/canvas/components/agent-panel/codex_transport.js`, lines 199–203:
  ```javascript
  } finally {
    unsubscribe?.();
    signal?.removeEventListener?.("abort", abort);
    if (!finished || !signal) {
      if (signal) sessions.delete(signal);
      await cancelNativeRequest(entry, failed);
    }
  }
  ```
  And lines 18–29:
  ```javascript
  async function cancelNativeRequest(entry, preserveFailure) {
    try {
      await entry.bridge.cancel({
        threadId: entry.threadId || entry.requestId,
        sessionId: entry.sessionId,
        requestId: entry.requestId,
      });
    } catch (error) {
      if (!preserveFailure) throw error;
      console.warn("[codex-transport] Native session cleanup failed", error);
    }
  }
  ```
- **Direct Empirical Verification**:
  When invoking `streamCodexCompletion({ model: "claude:claude-opus-5-5", prompt: "Test" })` without passing a `signal` (optional parameter):
  1. The stream yields all chunks and the final done chunk (`{ text: "", done: true }`).
  2. The generator enters `finally`.
  3. Because `signal` is `undefined`, `!signal` evaluates to `true`. Thus `(!finished || !signal)` evaluates to `true` despite `finished === true`.
  4. It calls `cancelNativeRequest(entry, failed)` where `failed === false`.
  5. If `bridge.cancel` throws or rejects (e.g. WebSocket connection disconnected, server closed, or cancellation failure), `if (!preserveFailure) throw error;` causes the error to be rethrown out of the finally block.
  6. **Verbatim Output**:
     ```
     Chunk: Done false
     Chunk:  true
     CAUGHT_ERROR: Bridge connection closed during cleanup
     ```
     A turn that completed 100% successfully crashes with an unhandled exception for the consumer.

### Observation 2: `layout_action_helpers.js` Fails to Route Default Model (`claude:claude-opus-5-5`) and Antigravity to CLI Bridge
- **File**: `src/canvas/store/layout_action_helpers.js`, lines 54–58:
  ```javascript
  // Codex model IDs use the native subscription connection on desktop.
  const isCliModel = (model ?? DEFAULT_AGENT_MODEL).startsWith("codex:");
  const effectiveProviderId = isCliModel
    ? PROVIDER_ID.CLI
    : providerId || PROVIDER_ID.DEEPSEEK;
  ```
- **Direct Empirical Verification**:
  Worker M1 updated `DEFAULT_AGENT_MODEL` to `claude:claude-opus-5-5` in `src/shared/agent-defaults.js`.
  When `streamLayoutText({ prompt: "..." })` is invoked with default settings (or with any `claude:` or `antigravity:` model):
  `(model ?? DEFAULT_AGENT_MODEL).startsWith("codex:")` evaluates to `false`.
  `streamLayoutText` treats the default model as a cloud model, routing to `PROVIDER_ID.DEEPSEEK` (`streamProviderText`), producing:
  ```
  Error: Cloud AI generation runtime is not configured in standalone mode.
  ```
  Directly verified in `tests/unit/challenger_stress_cli.test.js` under section 4.

### Observation 3: `findCliBinary` Throws Unhandled `TypeError` on `null` Input
- **File**: `electron/local_backend_bridge.js`, line 99:
  ```javascript
  const binaryNames = Array.isArray(names) ? names : [names];
  ```
- **Direct Empirical Verification**:
  When `findCliBinary(null)` is called:
  `Array.isArray(null)` is `false` -> `binaryNames` is `[null]`.
  At line 121: `path.join(dir, exe)` with `exe = null` throws:
  ```
  TypeError: The "path" argument must be of type string. Received null
  ```
  Directly verified in `tests/unit/challenger_stress_cli.test.js` under section 3.

### Observation 4: `checkCliStatus` Reports `ready` and `installed: true` for Non-Existent `opts.binPath`
- **File**: `electron/local_backend_bridge.js`, line 97:
  ```javascript
  if (opts.binPath) return opts.binPath;
  ```
- **Direct Empirical Verification**:
  If a caller passes a custom path that does not exist on disk (e.g. `checkCliStatus("claude", { binPath: "/missing/claude", env: { ANTHROPIC_API_KEY: "..." } })`), `findCliBinary` immediately returns `opts.binPath` without running `fs.existsSync(opts.binPath)`.
  `checkCliStatus` subsequently returns:
  ```javascript
  {
    status: 'ready',
    installed: true,
    authenticated: true,
    ready: true,
    binPath: '/missing/claude'
  }
  ```
  Directly verified in `tests/unit/challenger_stress_cli.test.js` under section 3.

### Observation 5: Robustness Verification of Model Parsing & Opt-in Gating
- `parseCliModelId`:
  - Empty strings, `null`, `undefined`, whitespaces, numbers, booleans, and objects are safely handled without throwing, returning `{ cliId: null, model: null }`.
  - Non-prefixed model names (`gpt-4o`, `claude-opus-5-5`) return `{ cliId: null, model: null }`.
  - Leading/isolated colons (`:model`, `::`, `:::`) return `{ cliId: null, model: null }`.
  - Trailing colons (`claude:`) return `{ cliId: "claude", model: null }`.
  - Multiple colons (`claude:claude-opus-5-5:preview:v2`) safely preserve the entire suffix as `model`.
  - `canonicalizeCliModelId` properly maps legacy `opus-5` variants to `claude-opus-5-5`.
- Antigravity opt-in gating:
  - `isAntigravityOptedIn()` correctly defaults to `false`.
  - `getVisibleCliAgents()` and `VISIBLE_CLI_AGENTS` dynamically react to `setAntigravityOptedIn(true/false)`.
  - `CLI_TEXT_MODELS` items are all well-formed CLI model prefixes.

---

## 2. Logic Chain

1. **Stream Generator Cleanup Lifecycle (Observation 1)**:
   - In `codex_transport.js`, the generator's `finally` block is meant to ensure that aborted or leaked turns are cancelled on the bridge so subprocesses do not hang.
   - However, the condition `if (!finished || !signal)` treats any invocation where `signal` is not provided (`!signal === true`) as an unmanaged turn requiring cancellation via `cancelNativeRequest`.
   - If a turn finishes normally (`finished === true`), the work on the CLI backend is already completed. Calling `bridge.cancel` on an already-finished request is redundant.
   - Because `failed === false` for a successful turn, `cancelNativeRequest` has `preserveFailure === false`, which means it re-throws any error encountered during `bridge.cancel`.
   - In production or over network WebSocket loopback, closing sockets or late cancel frames frequently reject. Re-throwing this error in the finally block masks the successful result and raises a fatal exception to the user.
   - **Conclusion**: `cancelNativeRequest` should only be called if `!finished`.

2. **Cross-Module Default Model Routing (Observation 2)**:
   - In Milestone 1, `DEFAULT_AGENT_MODEL` was intentionally shifted from `codex:gpt-6-astra` to `claude:claude-opus-5-5`.
   - `src/canvas/store/layout_action_helpers.js` contains a legacy check: `const isCliModel = (model ?? DEFAULT_AGENT_MODEL).startsWith("codex:")`.
   - Because this check was not updated to use `parseCliModelId` or check for `claude:`/`antigravity:`, any canvas caller invoking layout streaming with the default model fails immediately with a cloud runtime error.
   - **Conclusion**: `layout_action_helpers.js` must detect all CLI models via `parseCliModelId`.

3. **Defensive Input Validation (Observations 3 & 4)**:
   - In `findCliBinary`, `names = null` triggers an unhandled `TypeError` because `Array.isArray(null)` evaluates to `false`, wrapping `null` in an array (`[null]`) passed to `path.join`.
   - In `findCliBinary`, `opts.binPath` is trusted blindly without checking `fs.existsSync(opts.binPath)`, leading `checkCliStatus` to report non-existent paths as `ready`.
   - **Conclusion**: Simple defensive guards (`Boolean(names)` and `fs.existsSync`) are required.

---

## 3. Caveats

- In automated headless testing, real CLI binaries (`claude`, `agy`, `codex`) are typically absent from CI environments. Tests correctly mocked subprocess responses and filesystem structures to verify status reporting and stream protocol execution.
- `layout_action_helpers.js` full integration is part of Milestone 3 (Canvas Island & Agent Panel Turn Dispatch), but the regression was introduced by Milestone 1's change to `DEFAULT_AGENT_MODEL`.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

While Worker M1 successfully implemented the core dual-channel bridge, WebSocket server, and provider registry configurations, two actionable defects must be addressed prior to closing Milestone 1:

1. **Fix `codex_transport.js` cancellation bug**:
   In `src/canvas/components/agent-panel/codex_transport.js`, update the `finally` block (lines 199–203):
   ```javascript
   // Old:
   if (!finished || !signal) {
     if (signal) sessions.delete(signal);
     await cancelNativeRequest(entry, failed);
   }

   // New:
   if (signal) sessions.delete(signal);
   if (!finished) {
     await cancelNativeRequest(entry, failed);
   }
   ```
   *Rationale*: Eliminates spurious cancel rejections on successfully completed turns when `signal` is not provided.

2. **Fix CLI model check in `layout_action_helpers.js`**:
   In `src/canvas/store/layout_action_helpers.js`, update line 54:
   ```javascript
   // Old:
   const isCliModel = (model ?? DEFAULT_AGENT_MODEL).startsWith("codex:");

   // New:
   const { cliId } = parseCliModelId(model ?? DEFAULT_AGENT_MODEL);
   const isCliModel = Boolean(cliId);
   ```
   *Rationale*: Restores compatibility between `streamLayoutText` and `DEFAULT_AGENT_MODEL = "claude:claude-opus-5-5"`.

3. **Harden `findCliBinary` input checks**:
   In `electron/local_backend_bridge.js`:
   - At line 97: `if (opts.binPath && fs.existsSync(opts.binPath)) return opts.binPath;`
   - At line 99:
     ```javascript
     const binaryNames = Array.isArray(names)
       ? names.filter((n) => typeof n === "string" && Boolean(n.trim()))
       : (typeof names === "string" && Boolean(names.trim()) ? [names.trim()] : []);
     ```

---

## 5. Verification Method

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Verified Result*: 70 test files passed (70), 833 tests passed (833).

2. **Run Challenger Stress Suite**:
   ```bash
   npx vitest run tests/unit/challenger_stress_cli.test.js
   ```
   *Verified Result*: 29 tests passed (29) documenting all stress behaviors and findings.

3. **Run Design System Linter**:
   ```bash
   npm run lint:design
   ```
   *Verified Result*: Clean, 801 files matching `Design.md`.

4. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Verified Result*: Clean Vite build in 4.79s without bundling errors.
