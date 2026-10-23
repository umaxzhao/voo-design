# Handoff Report: Milestone 1 Test Specifications (Dual-Platform Workspace Storage Engine)

## 1. Observation

1. **Test Environment & Configuration (`vite.config.js`)**:
   - Lines 22–26:
     ```javascript
     test: {
       globals: true,
       environment: "node",
       include: ["tests/unit/**/*.test.{js,jsx}"],
     },
     ```
   - Direct observation: Tests run strictly in Node.js (`environment: "node"`). Global browser primitives such as `window`, `indexedDB`, `FileSystemDirectoryHandle`, and `localStorage` are **not present by default**. Any web test must provide self-contained mock harnesses or utilize in-memory storage fallbacks.
   - Command execution `npx vitest run tests/unit/recent_files_and_welcome.test.js` executed 10 tests in 364ms with zero errors, confirming the fast in-memory execution baseline.

2. **Existing Test & Isolation Safety Patterns**:
   - In `tests/unit/recent_files_and_welcome.test.js` (lines 38–43):
     ```javascript
     if (!globalThis.window) {
       globalThis.window = globalThis;
     }
     globalThis.window.localStorage = mockStorage;
     globalThis.localStorage = mockStorage;
     ```
   - In `tests/unit/adversarial_isolation_electron_safety.test.js` (lines 222–236, 256–270):
     - Uses `Module.prototype.require` intercepting `"electron"` to test headless Electron initialization.
     - Asserts `contextIsolation: true`, `nodeIntegration: false`, and verifies exposure of `electronAPI` methods (`openFileDialog`, `saveFileDialog`, `readFile`, `writeFile`, `onMenuAction`).
     - IPC channels tested: `dialog:openFile`, `dialog:saveFile`, `fs:readFile`, `fs:writeFile`.
     - Invariant: Milestone 1 additions must strictly maintain backward compatibility with these existing channels and security constraints.

3. **Storage Engine Requirements (`PROJECT.md` & `ORIGINAL_REQUEST.md`)**:
   - `PROJECT.md` lines 73–116 define the polymorphic `IWorkspaceStorageEngine` interface: `init()`, `getDriverType()`, `getConfig()`, `chooseDirectory()`, `setDirectory()`, `isConfigured()`, `scanFiles()`, `readFileBytes()`, `writeFileBytes()`, `renameFile()`, `moveToTrash()`, `restoreFromTrash()`, `deletePermanently()`, `emptyTrash()`, `toggleStar()`, `revealInFinder()`, `subscribe()`.
   - File formats to scan: shallow scan of `.voo`, `.fig`, `.psd`, `.svg` with metadata synthesis (`id`, `name`, `path`, `extension`, `size`, `updatedAt`, `createdAt`, `starred`, `trashed`).
   - Electron backend requirements: `projects_config.json` in `userData`, default fallback `~/Documents/VOO/Projects`, APFS/NTFS case-only rename safety with staging, `shell.trashItem` with `.trash/` / safe unlink fallback, and 300ms debounced `fs.watch`.

---

## 2. Logic Chain

1. **Need for Two Dedicated Test Suites**:
   - From Observation 1 and 3, Milestone 1 consists of two distinct operational domains:
     - **Web / Frontend polymorphic storage engine**: `tests/unit/workspace_storage.test.js` covering `WebIdbWorkspaceDriver`, `WebFsaWorkspaceDriver`, and `WorkspaceStorageEngine` factory auto-detection.
     - **Electron desktop backend**: `tests/unit/workspace_electron_ipc.test.js` covering `electron/workspace_manager.cjs` filesystem operations, watcher debouncing, case-only staging, and IPC registration.
   - Separating them ensures fast modular test execution and isolates Node filesystem sandbox tests from virtual browser storage tests.

2. **Test Harness Strategy for Web Drivers in Node.js**:
   - Since `environment: "node"` lacks DOM and W3C File System Access APIs (Observation 1), `tests/unit/workspace_storage.test.js` must supply lightweight, specification-compliant mocks:
     - `MockDirectoryHandle` and `MockFileHandle`: implement `queryPermission`, `requestPermission`, `entries()` async generator, `getFileHandle`, `getDirectoryHandle`, `removeEntry`, and `createWritable`.
     - `WebIdbWorkspaceDriver`: test both standard IndexedDB operations and the headless in-memory fallback.
   - Every test must clean up `globalThis.window` in `beforeEach` and `afterEach` to prevent cross-test contamination.

3. **Electron Backend Test Sandbox & Case-Only Rename Safety**:
   - For `tests/unit/workspace_electron_ipc.test.js`, testing physical file I/O requires a sandboxed directory (`tests/unit/.tmp-electron-workspace`).
   - Case-only renames (e.g., `lowercase.voo` to `LowerCase.voo`) behave idiosyncratically on macOS APFS and Windows NTFS. Direct rename either fails or is a no-op. The test suite specifically verifies that `workspace_manager.cjs` stages the rename through an intermediate filename (`__voo_rename_*`), ensuring reliable case updating without file deletion.
   - The test suite verifies `shell.trashItem` as primary, and injects a forced error to verify graceful fallback to `.trash/` or `fs.unlink`.

---

## 3. Caveats

1. **No External Dependencies**: Mocks do not use external NPM packages like `fake-indexeddb` or `browserfs`. They use native in-memory Maps and standard JavaScript constructs to keep tests zero-dependency and fast.
2. **Chokidar vs fs.watch**: The test suite tests native Node `fs.watch` debouncing (300ms) with `vi.useFakeTimers()` to avoid flaky timeouts in CI environments.
3. **Electron Subprocess Avoidance**: Tests run via Vitest in-process using mocked Electron modules rather than spawning full Electron binary instances, ensuring tests run in <1s.

---

## 4. Conclusion

The test specifications for Milestone 1 are complete, comprehensive, and documented in:
1. `test_spec_workspace_storage.md`:
   - Suite A: `WebIdbWorkspaceDriver` (15 test cases covering init, multi-format writes, shallow scan, extension filtering, search/category filter, binary reads, atomic rename, collision rejection, star toggle, soft trash, restore, delete permanently, empty trash, and headless fallback).
   - Suite B: `WebFsaWorkspaceDriver` (9 test cases covering permission grant/prompt/deny, file streaming, design format filtering, `.trash/` subfolder movement, restore, and purge).
   - Suite C: `WorkspaceStorageEngine` Factory (6 test cases covering Electron detection, FSA detection, IDB fallback, singleton stability, and mutation event subscriptions).
2. `test_spec_workspace_electron_ipc.md`:
   - 7 test suites (25 test cases covering default directory resolution, validation, `projects_config.json` persistence, design file shallow scanning, 0-byte file resilience, atomic writing, path traversal protection, case-only rename staging, collision prevention, `shell.trashItem` with fallback, debounced watcher with timer coalescing, and IPC channel registration).

These specifications provide an exact, turnkey blueprint for the implementation worker (`worker_m1`) to implement and pass with 100% test coverage.

---

## 5. Verification Method

1. **Inspect Test Specifications**:
   - View `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_m1_test/test_spec_workspace_storage.md`
   - View `/Users/tt/teamwork_projects/voo_design/.agents/teamwork/explorer_m1_test/test_spec_workspace_electron_ipc.md`

2. **Verify Baseline Tests Pass**:
   ```bash
   npx vitest run tests/unit/recent_files_and_welcome.test.js
   npx vitest run tests/unit/adversarial_isolation_electron_safety.test.js
   ```
   *Expected Result*: All 10 + 6 tests pass cleanly.

3. **Verify Full Test Execution Post-Implementation (Worker Step)**:
   ```bash
   npx vitest run tests/unit/workspace_storage.test.js
   npx vitest run tests/unit/workspace_electron_ipc.test.js
   npm test
   ```
   *Expected Result*: All new workspace test suites pass 100% alongside existing 842 tests.
