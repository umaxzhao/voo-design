# Real-editor layout, clipping and Boolean audit — 2026-10-27

## Confirmed defects repaired

- Agent alignment/distribution updated a group's box without translating its absolute-coordinate descendants. Both tools now translate complete nested subtrees and commit once. Overlapping parent/child targets are translated once, rather than receiving two deltas.
- Agent alignment to the first layer or parent used a rotated layer's visible bounding-box position as its unrotated origin. The operation now applies the measured displacement to the original origin.
- Agent Auto Layout stored `enabled: false` as a non-null configuration, so the scene continued positioning children. Disable now writes the scene's actual disabled state (`null`) in both single and batch mutations.
- Agent Auto Layout stored the `alignment` alias without converting it to `alignItems`/`justifyContent`; partial changes also erased existing direction/gap/sizing. These fields now reach the layout engine and preserve unspecified settings. Unsupported stretch and non-container targets fail before document mutation.

## Repeatable evidence

Run `node tests/e2e/layout-mask-audit.e2e.mjs`. It starts an isolated real app and private ephemeral MCP relay, preserving the user's open document and authentication files. Twelve scenarios check document geometry, actual sampled artwork pixels, UI menu actions and history:

1. Agent group alignment moves child artwork; one undo/redo restores both.
2. Agent distribution moves a grouped child's pixels; one undo restores it.
3. The quickbar alignment menu moves actual artwork and undoes in one step.
4. A rotated rectangle aligns its visible bounds to the page edge.
5. Horizontal Auto Layout applies padding and gap to child pixels.
6. Partial Auto Layout alignment changes cross-axis positioning and retains gap.
7. Batch disabling Auto Layout releases child geometry for free positioning.
8. A clipping mask removes pixels outside its base; undo/redo restores clipping.
9. Quickbar Boolean union pixels and undo/redo.
10. Quickbar Boolean subtract pixels and undo/redo.
11. Quickbar Boolean intersect pixels and undo/redo.
12. Quickbar Boolean exclude pixels and undo/redo.

`agent-layout-subtrees.test.js` adds six unit cases for immutable subtree translation, overlapping selections, no-op history, disabled layout, partial configuration and unsupported stretch. The related four-file unit run passes all 55 cases.

## Coverage boundary

These checks certify the listed scenarios, not every combination of each feature. Wrap/hug/fill/min-max Auto Layout combinations, raster-painted masks, Live Filters/adjustments, all retouch/drawing tools, Warp/Pin/Variants/arrays, export settings and every history label remain outside this batch. See the [previous verification](agent-mutation-verification.md) for earlier paint/text and resize evidence.

## Clean release verification

The exported source snapshot matches commit `7e3815a` byte-for-byte, excluding concurrent uncommitted work. Its production build and design lint pass, and its full test run passes **3667 tests with 12 skips** (424 passing files, 3 skipped). The new twelve-scenario browser suite and both previous browser suites (seven paint/text/mobile scenarios and ten resize/typography scenarios) pass. An initial parallel build/test run was discarded because artifact checks ran before the build completed; the release gate ran tests after the build. Welcome tests now check the committed advanced-dialog/custom-dropdown surface instead of removed native-select/radio-row markup.

Published directly through `ssh la2` to https://voo.run/editor/. Previous files are retained at `/srv/voo-run/editor-backups/7e3815a-20261027T043834Z`.
