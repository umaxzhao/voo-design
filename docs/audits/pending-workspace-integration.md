# Pending workspace integration — 2026-10-28

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
7. The welcome picker offers all three signature systems and disables competing style selection until Automatic is restored.

Unit tests cover the contracts, generation handoff, category counts, rounded templates, nested constraints, no-op resizing and Auto Layout ownership. The release verifier now includes this suite alongside all five previous browser suites and requires an unchanged, clean committed source tree.

## Local miscellaneous files

`tmp/` contains exploratory browser scripts and screenshots; `.cursor/` contains local tool rules; `.codegraph/` contains the local code index/configuration. These are excluded from the source integration and retained on disk. They belong in this repository's local Git exclusions when cleaning the primary checkout; the shared `.gitignore` is unchanged. No cache, screenshot, index database or ad-hoc script is included in the commit.

## Boundaries

No external paid model generation was invoked. The agent contract and forwarding were tested with controlled provider responses, and the real welcome control was exercised separately. The inherited large-file and bundle-size tasks remain separate. The focused integration does not certify every transformed/cropped bitmap, constraint combination or external provider.
