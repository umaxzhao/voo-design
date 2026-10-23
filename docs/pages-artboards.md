# Pages and artboards audit

The standalone design store represents pages/artboards as `imageEditor` nodes. `editingNodeIds` chooses the canvases mounted in the editor; `editingNodeId` chooses the active one. Multiple mounted nodes share the free-canvas camera, while a single mounted node uses its engine viewport. The layers panel also exposes canvas pages inside scene documents; those are a separate hierarchy, not the bottom-left page list. Frame headers already support inline rename. Canvas tabs/presentation navigation use the same focus actions.

Before this change the bottom-left list exposed add, focus and delete, despite existing store rename and duplicate actions. There was no reorder action, last-page deletion was hidden, and an empty list displayed 1/0. Duplicate IDs could collide within one millisecond. Shared camera focus did not remember individual page views.

## Fixed

- Page list exposes inline rename (Enter/blur commits, Escape cancels), duplicate, delete and bounded move up/down controls. Current page, disabled moves and action labels are accessible. Outside click and Escape dismiss the list. All copy is in `pageSwitcher.*`, in English and Chinese.
- Delete can reach zero pages; a visible empty message and add-page CTA recover the editor. Focus falls back to another available page, including pages not currently mounted.
- Store focus saves/restores shared camera snapshots by page ID and flushes pending camera input. Single-page engine viewports are captured on departure and restored after readiness; absent camera APIs are safe. Camera snapshots are session-only and cleared on project load/new document. Deleted page camera/layout entries are removed.
- Rename trims whitespace and rejects blank/no-op changes. Duplicate IDs use a monotonic suffix; duplication reads the current live engine or evicted snapshot when available. Reordering changes document node order without moving artboard coordinates.
- Legacy documents remain a single editor node holding the original document object; neither missing nor empty `pages` arrays rewrite the payload on load. Existing nonempty `doc.pages` loading remains intact and preserves order/focus.

- Presets include phone and desktop devices alongside social formats, with English and Chinese labels. The page list offers compact default, phone, desktop and social size choices; add-canvas inherits its reference canvas size.
- Focusing a page restores its saved shared view. An unseen page keeps the current shared camera until its positioned artboard is ready to zoom-to-fit, including presentation navigation. Local single-page viewports retain their existing restore/fit behavior.

## Deferred

Drag reordering, cross-page layer moves, hierarchical sections and separate page-versus-artboard document models remain out of scope. Camera persistence across app restarts and changes to the save envelope are deferred. Existing project serialization writes node order into `document.pages`; this change does not modify file-management or save code. Reordering the list intentionally leaves free-canvas artboard geometry unchanged.
