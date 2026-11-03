# Editor safe-area and mint-frame contract — 2026-11-03

## Source and scope

Independent `voo-ui-safearea-followup`, frozen baseline `3dec4ef2d46f055208e972da21f7c288ac14a0a1` (contains UI30fec702, d601 and Skia283). No changes to source comparison tree, selection/gesture owners, existing previews, user documents, catalog, release workflows or frozen original repositories. The local final commit and raw receipts are recorded in sibling `evidence/SAFEAREA-CONTRACT-REPORT.md` and `safearea-verification.json`.

## Reproduction and design decision

`pages_dnd` line86 failed expecting `[16,14,12,14]` padding with physical insets12/10/8/6; actual12/10/8/10. The assertion inherited a decorative 4px gutter predating UI48d5. That gutter conflicts with the user's complete mint frame without a black outside gap. Removing the gutter does not remove physical protection: title and workspace remain within the top/bottom inset and the larger horizontal inset on both sides. The test must verify this visible and interactive contract rather than the padding property on a particular ancestor.

Real pixels also exposed a product defect: root mint padding made a green cap/side beside the black title end with nonzero insets. A strict new black-pixel assertion fails the unchanged baseline. Root top safety paint and a noninteractive title paint layer now continue the gradient across those insets using the actual title height, including wrapped narrow fine-pointer headers. Root clips at its padding box; workspace clipping keeps floating-control shadows out of the safety surround. Controls and structural mint frame retain the same geometry. Light theme inherits the shared frame color rather than replacing gradient paint.

## Acceptance

The existing `pages_dnd` suite retains all rename, focus/dirty, insertion, pointer ownership, Escape, scroll, long-press, second touch, cancel, unmount and 48px-target behavior checks. Both original pointer behavior runs now start with nonzero safe areas. Its visible contract helper checks:

- title/workspace geometry inside physical bounds, symmetric sides, no additional desktop gutter, all four radii16;
- complete physical 2px-equivalent frame strokes and bottom edge, opaque corner arcs and rounded inner cutouts;
- mint outside the editor below the status surface, green-to-black title paint including unsafe corner/side regions;
- actual select-tool center hit within physical safe bounds and no outer-page scroll clipping.

Additional 32 contexts cover fine/coarse × wide/narrow × dark/light × zero/nonzero insets × DPR1/2. Original coarse portrait/landscape safe-area cases remain. Optional `VOO_SAFE_AREA_EVIDENCE` saves pre-assertion screenshots and metrics, including failures; the suite verifies pixels even without that directory. The existing 20-context frame pixel suite and actual panel divider/constraint/focus and inspector interaction suites remain separate checks.

## Limits

CDP safe-area, coarse pointer and DPR are Chromium emulation, not notch hardware, native VOO, physical touch or OS certification. The earlier full integration gate stopped after21 passing steps at step22; its108 unexecuted steps remain unverified. No130-step restart or claim of full release acceptance. Historical failures are preserved, including an intermediate fixed-height paint approach that failed a wrapped fine-pointer header, and shadow contamination after expanding root clipping. Only checks bound to the final source can be reported passing.
