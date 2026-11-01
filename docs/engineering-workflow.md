# Engineering and acceptance workflow

This is the current workflow. Historical audit tables describe their recorded
revision, not today's product. A passing release certifies the registered
checks on one clean revision; it does not certify every feature combination.

## One maintained module inventory

`scripts/editor-module-catalog.mjs` owns the module IDs, source ownership,
related regressions, capability IDs, browser suites and remaining evidence.
The release verifier imports this catalog; do not create another suite list.

| Module ID | Responsibility | Shared boundaries |
| --- | --- | --- |
| `workspace` | Projects, covers, assets and templates | File opening, document ownership, native picker |
| `documents` | Persistence, formats, portable assets and history | Async publication, migrations, resource retention |
| `canvas` | Camera, world coordinates, grids and snapping | Pointer conversion, rendering, performance |
| `selection` | Hit testing, transforms and shortcuts | Visible alpha, nested ownership, cancellation |
| `layers` | Frames, Groups, ordering, duplication and deletion | Parent/clip references, locked units, subtree operations |
| `compositing` | Rendering, masks, clips, opacity and sampling | Stage/PNG/SVG parity, bitmap lifecycle |
| `vectors` | Paths, Booleans, strokes and format conversion | Transform geometry, editable exports and loss reports |
| `text` | Editing, text boxes, fonts and typography | IME, font loading, layout and vector rendering |
| `images` | Image tools, selections, adjustments and local AI | Real pixels, resource ownership and model delivery |
| `layout` | Auto Layout, constraints, variables and components | All resize entry points, descendants and aliases |
| `inspector` | Fields, menus, toolbar, responsive UI and i18n | Commit/cancel, selection changes, focus and async locale |
| `platform` | Agent, runtime, loading, native integration and collaboration | Auth, process ownership, reconnect and unmount |

The current inventory contains 87 capability groups, not a census of every
button or parameter. All groups remain **partial** until specific acceptance
rows cover their declared entry points and contexts. Registration is not
execution, and execution is not exhaustive functional coverage.

The existing core release contains 101 browser suites. Another 11 standalone
suites are explicitly listed in `ADDITIONAL_BROWSER_CHECKS`: 8 need fixture,
assertion and service-requirement review; `canvas_fps`, `image-electron` and
`image-network` run separately for hardware, native-host and network/model
acceptance. They appear as **not-run** in a core release report. They are not
counted as passing, removed or claimed obsolete. A new top-level `.e2e.mjs`
file without release registration or an explicit standalone classification
fails `check:modules`, preventing silently orphaned tests.

## Practical commands

```bash
# Check registration, referenced suite files and unique ownership.
npm run check:modules

# Inspect the inventory or an affected module plus its related regressions.
node scripts/editor-checks.mjs --list
node scripts/editor-checks.mjs --module layers --json

# Include tracked and untracked local changes; compare branch work to a base.
node scripts/editor-checks.mjs --changed --base origin/main --json

# Run the existing real-browser suites in the planned module group.
npm run test:module -- --module layers

# Release: clean source, metadata, build, design lint, all units and browsers.
VOO_RELEASE_REPORT=/private/tmp/voo-release.json node scripts/verify-editor-release.mjs
node scripts/editor-checks.mjs --evidence /private/tmp/voo-release.json --json

# Optionally schedule browser suites sequentially on a busy host; default remains 3.
# VOO_RELEASE_BROWSER_CONCURRENCY=1 uses the same suite list and assertions.

# Reduce compiler/unit contention on a busy developer host; assertions stay unchanged.
GOMAXPROCS=1 VITEST_MAX_FORKS=2 VITEST_MIN_FORKS=1 \
  VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=1 \
  VOO_RELEASE_REPORT=/private/tmp/voo-release.json node scripts/verify-editor-release.mjs
```

Module plans include one hop of explicitly related modules, not a claim of
complete dependency analysis. An unmapped executable/configuration/test path
selects every module and requires the full release gate. A documentation-only
plan has no product browser suites; review its links and claims separately.
Add ownership for new product paths rather than relying on that fallback.

Local module runs may inspect dirty work, and are never release evidence.
Build before running artifact-dependent suites (`editor-resources-built`,
loading checks). The full release verifier builds automatically.
Offline module/release checks do not grant consent to paid generation.

GitHub PR/main checks validate the catalog, design rules, build and unit tests.
The deployment job requires those checks and runs only on `main`, never a PR.
The desktop Release workflow runs the same complete verifier on its clean
candidate revision plus four native packaged-app jobs. GitHub's basic PR/main
gate is not a substitute for those browser or native/hardware results.
Use `.github/pull_request_template.md` to record the same scope and limits.

## Acceptance rows

Maintain detailed rows in the existing relevant audit document, linked from
`docs/README.md`; avoid creating a new dated report for every repair. Use stable
capability IDs from the catalog and this template for each concrete behavior:

| Field | Required content |
| --- | --- |
| Capability and operation | For example `layers.placement`: place PNG in a nested Frame |
| Entry points | Picker, drop, clipboard, context menu, keyboard or MCP; list which are tested |
| Context | Root/Frame/Group, one/many selected, locked/hidden, clipping, zoom and nesting |
| State assertions | Geometry, ownership, unique IDs, no cycles, valid clip/asset references |
| Visible assertions | Actual pixels/glyphs/handles and matching layer/inspector UI |
| History | One undo restores the complete previous document; redo restores the result |
| Persistence | Cold browser/project reopen retains geometry, references and assets |
| Failure/cancel | Escape, pointer cancellation, blur, decode failure, stale async result, unmount |
| Platform/performance | Actual browser/backend/input/device and scene size; mark exclusions |
| Evidence | Test file and named assertion; exact clean commit and external report path |
| Status and remainder | Unverified, partial, verified for the stated scope, failed or blocked |

An axis may be inapplicable, but requires a reason: camera panning should not
change document history, for example. A feature with only a data-level test
cannot be marked interaction-verified. A Chromium pass cannot certify a
signed desktop installer or a physical IME/touch/stylus path.

## Cross-module scenarios and invariant checks

Retain at least these scenarios while extending coverage:

- Place -> Frame -> nested Frame -> mask -> move -> duplicate -> delete ->
  undo/redo -> portable save -> cold reopen -> PNG/SVG export.
- Text edit -> font load -> resize -> Auto Layout/constraints -> selection
  switch -> undo -> reopen, including actual IME acceptance separately.
- Image edit -> live filter/matte -> duplicate -> erase one copy -> async
  output cancellation -> save/reopen; confirm the original remains unchanged.
- Open a menu -> switch selection/document -> cancel/unmount -> reopen;
  ensure no stale commit, listener, hidden click target or retained label.

Use `editor-browser-fixture.mjs` for isolated real editors and reuse
`image-audit-fixture.mjs` / `nested-objects-fixture.mjs` where appropriate.
Do not replace a missing real interaction with an engine call and call it a
pointer test. Generated fixtures must not touch the user's current project.

## Code boundaries and refactoring

- UI components display state and dispatch commands; they do not implement
  independent document mutations for each toolbar/menu/shortcut/MCP entry.
- Command handlers share domain operations. A document change has one commit
  boundary and owns its cancellation, descendant updates and resource cleanup.
- Rendering consumes the document. Selection/Agent chrome is separate from
  artwork, exports and sampling. Changes require stage/export parity checks.
- Pure geometry, constraints and format transforms stay independent of React,
  storage and network. Host/storage/model adapters own those side effects.
- Test environment changes use reversible stubs (`vi.stubEnv`/`vi.unstubAllEnvs`)
  and OS temporary-directory APIs. Restore absent variables by deleting them,
  never by assigning `undefined`; do not assume macOS environment defaults.
- New files stay within 400 lines. Do not grow an existing oversized module;
  extract one coherent responsibility with behavior regression per change.
- Removing dead code requires checking static/dynamic imports, public exports,
  agent contracts and packaged entry points. Never replace missing behavior
  with empty stubs merely to pass import checks.
- File extraction is a maintenance change; claim a bundle or FPS improvement
  only with actual download closure or reproducible hardware measurements.

## Change and delivery protocol

1. Synchronize remote work while preserving unrelated local edits. Identify
   owning modules, shared entry points and known remaining evidence.
2. For a defect, add a failing reproduction first. Fix the common domain path,
   then check UI entry, state, pixels and one-step history as applicable.
3. Update ownership/capability records and the detailed acceptance row when
   adding a behavior or discovering an uncovered context. Keep limits visible.
4. Run targeted checks, full unit/design gates and the clean release verifier.
   Do not weaken assertions or count skipped/blocked tests as passing.
5. Report executed checks separately from coverage. Keep raw reports outside
   the repository, tied to exact revisions. The release JSON now groups
   execution by module while keeping `functionalCoverage: "partial"`.
6. Push the task-only commit and deploy application changes to `la2`; verify
   canonical assets and a real production interaction. Preserve other work.

Do not end with "the whole project is fully tested." State what was checked,
what was repaired, what remains unverified and which revision was deployed.

## Native desktop release gate

`platform.desktop-release` and `platform.desktop-close` have a separate native
CI gate in `.github/workflows/release.yml`: four native platform/architecture
jobs, real packaged executables, content/transitive dependency inspection and
filesystem/cold-open/quit-cancellation smoke. Web-browser results never certify
these capabilities. Keep signatures, interactive installation and live update
acceptance separate even after all native smoke jobs pass. See the current
[release checklist](release-checklist.md) and [progress](quality-progress.md).
