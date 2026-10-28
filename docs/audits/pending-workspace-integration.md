# Pending workspace integration — 2026-10-28

> Historical snapshot for source `59fc020`. The publication failure recorded below was resolved by [541a170](https://github.com/umaxzhao/voo-design/commit/541a170e1ec4d197ac46f4cf1bc786ab7ba9e2a7), which was pushed and deployed with a clean release verification. This snapshot and its JSON evidence describe their recorded revision, not the current Git/production state.

## Source and preservation

The primary checkout at `/Volumes/TD/Projects/voo_design` started at `ea98728` with thirty changed tracked files and five new source/document/test files. Git has no author record for uncommitted files; these drafts were identified by content and checked against their callers, tests and the newer remote implementation. An original patch and SHA-256 manifest were captured before integration. The original files remained untouched while the draft was applied to a separate checkout based on remote `88f37f0`.

The thirty-file patch applied cleanly with Git's three-way merge. A clean textual merge was only the starting point: the following feature groups were inspected and tested.

| Group | Adopted intent | Additional corrections |
| :--- | :--- | :--- |
| Signature design systems | Three artifact systems, localized briefs, contract adapter, welcome-to-agent handoff and starter documents | Split registry/signature data and template builders into modules below 400 lines; preserve template corner radii |
| Frame constraints | Panel and pointer frame resize/move resolve child constraints | Reflow nested descendants, preserve unconstrained subtrees and defer flow geometry to Auto Layout |
| Bucket tool | Tolerance, contiguous region and sample-all controls | Inverse-map rotated image seeds; map composite contours into target bitmap coordinates; refuse empty/out-of-bounds selection instead of filling the entire layer |
| Image/variable inspector | Image actions placed before paint fields; live v2 variable listing/editing | Route the binding dropdown through the v2 action factory; remove unused controller-option forwarding |

New draft files were normalized to hyphenated names: `from-preset.js`, `agent-design-system.test.js`, `frame-constraints-reflow.test.js`, and `signature-design-systems.test.js`. The original spellings are preserved in the source backup; this is a rename, not abandoned draft content. Existing large editor/i18n modules remain a separately scoped refactor, rather than a repository-wide extraction in this integration.

## Validation

The added regression suite `tests/e2e/pending-integration.e2e.mjs` runs the actual browser/editor and checks:

1. The tolerance control affects a pointer bucket fill and preserves the other colour region; one undo restores the image.
2. Clicking outside the selected bitmap leaves its bytes/colours unchanged.
3. Sample-all respects a divider painted on another layer.
4. A rotated image receives the colour seed at the pointer's actual local position.
5. Frame W editing reflows nested constraints and rendered child pixels, with one-step undo.
6. A v2-only colour variable binds through the inspector and changes rendered fill.
7. A legacy fixed page opens as a free canvas Frame: its surface and child pixels remain visible, move together and undo once.
8. The welcome picker offers all three signature systems and disables competing style selection until Automatic is restored.

Unit tests cover the contracts, generation handoff, category counts, rounded templates, nested constraints, no-op resizing and Auto Layout ownership. The release verifier now includes this suite alongside all five previous browser suites and requires an unchanged, clean committed source tree.

## Local miscellaneous files

`tmp/` contains exploratory browser scripts and screenshots; `.cursor/` contains local tool rules; `.codegraph/` contains the local code index/configuration. These are excluded from the source integration and retained on disk. They belong in this repository's local Git exclusions when cleaning the primary checkout; the shared `.gitignore` is unchanged. No cache, screenshot, index database or ad-hoc script is included in the commit.

## Boundaries

No external paid model generation was invoked. The agent contract and forwarding were tested with controlled provider responses, and the real welcome control was exercised separately. The inherited large-file and bundle-size tasks remain separate. The focused integration does not certify every transformed/cropped bitmap, constraint combination or external provider.

## Concurrent changes and migration follow-up

The primary checkout gained commits `c51d930` and `d12a9ec` during integration. Both were merged with their history intact. The actual Live Filter inspector now has a browser regression for capturing a selection mask: pixels outside the selected region revert to the original bitmap, the inside stays filtered, and one undo restores the unrestricted filter.

Remote page separation introduced eleven failures in five unit files. The tests now check authored content, original input immutability, independent workspace/frame paints and idempotent binary save/reopen. Page switching also had an actual camera regression: exclusive single-page display no longer met the old camera-recording condition. Switching pages now records the outgoing shared camera by default.

The new real-browser migration scenario exposed an actual missing-paint defect: the Canvas2D compositor skipped top-level Frame groups even in a free canvas. It now paints those surfaces; the Skia adapter also retains painted Frame groups as rectangle elements instead of dropping them with plain folders. Existing bounded-page browser scenarios explicitly declare their fixed-page model; the new migration scenario independently exercises the free-canvas model.

## Verified release and primary checkout

Clean committed source `59fc020cd433f7438d9b21e550b945d38fc5e988` passed `node scripts/verify-editor-release.mjs`: build, design lint, 428 unit files (3 skipped), 3689 unit tests (12 skipped, zero failures), and six real-browser suites containing 71 scenario groups. The verifier confirmed unchanged HEAD and source at the end. Machine evidence is in [pending-integration-release.json](pending-integration-release.json).

That exact build was deployed directly to `la2` and verified at <https://voo.run/editor/>. Public HTML matched the verified local build, all 30 entry assets returned HTTP 200, and desktop/mobile browser checks reported zero page errors. The previous build remains in the backup path recorded in the JSON evidence.

GitHub publication is **not complete**: HTTPS credentials are invalid, and the existing SSH identity `kesyn` has no write permission to this repository. No remote history was rewritten and no alternate commit tree was published to bypass this authentication failure. The application commits remain local and need an authenticated push to `origin/main`.

The primary checkout was fast-forwarded to the verified source, preserving the two concurrent committed changes in its ancestry. The original thirty tracked drafts and five new files were incorporated with the corrections described above. Exact originals and a retained Git stash are available under `/Users/tt/.codex/artifacts/voo-pending-integration-20261028` and `refs/voo-backups/primary-before-integration-20261028`. Three newer concurrent changes remain **uncommitted and outside the released build**: `histogram_strip.jsx`, `image_context_actions.jsx`, and `text_section_compact.test.jsx`. The overlapping text-menu test kept both the verified stronger assertions and the concurrent canonical-menu clarification. A focused check of the retained primary changes passed 13 tests in `text_section_compact` and `panel_wiring_fixes`; this is not a clean release verification of those additional drafts.

Local `tmp/`, `.cursor/`, `.codegraph/` and `.dsh_tool_probe.txt` remain on disk and are excluded only through Git's repository-local `info/exclude`. The shared `.gitignore` was not modified. The historical oversized-file refactor and bundle analysis remain separate tasks; this release does not claim to complete them.

## Follow-up review of the three retained drafts

The compact histogram and image-tools call site were retained and covered by explicit four-channel/default, one-channel/compact, clipping-readout and missing-bitmap tests. The font-weight test clarification preserves the already verified custom-menu assertions. These three files are included in the follow-up application change rather than discarded.

Additional touch-browser coverage selects all six generation types at 390px through the advanced dialog and confirms Mobile dimensions and close behavior. A second options-open attribute and dead generation-row CSS were removed. The variables-manager first-collection issue recorded in `analysis/IMPLEMENTATION.md` did not reproduce through the actual inspector entry; two browser regression groups now protect its open state, undo/redo and subsequent edits without changing its implementation.

The repository also contains `gl_spatial_shaders.js` implementations for high-pass, clarity and motion blur, plus the frequency-separation controller and tests. Their existence does not certify complete GPU/CPU pixel parity: three GL pixel-comparison cases remain skipped without a GL context. Oversized-file refactoring, bundle-size work and a dedicated Liquify feature are separate tasks, not claimed complete by this review. Old stashes and unmanaged temporary checkouts are retained; no cleanup assumes their contents are redundant.
