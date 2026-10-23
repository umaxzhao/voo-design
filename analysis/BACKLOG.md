# VOO Design — prioritized implementation backlog (from REA gap analysis)

Source: [`GAP_REPORT.md`](GAP_REPORT.md) + [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md).
Priority = user value × differentiation vs Pen/Figma × feasibility in this codebase.
Effort: **S** ≤ half day, **M** 1–2 days, **L** ≥ 3 days (single agent, this repo's conventions).

| # | Item | Pri | Effort | Status | Write scope | Acceptance criteria |
|---|---|---|---|---|---|---|
| 1 | **Pen `.pen` import** — parse Pen 2.x JSON, map frame/group/rect/ellipse/polygon/path/text/icon, fills/strokes/radii/effects/text/auto-layout, resolve local image assets, warnings for unsupported nodes, open through the same hydrate path as `.fig` | P0 | M | **done** (28 tests; 12 real Pen docs convert) | `src/canvas/pen/**`, `src/canvas/store/project_io.js`, `src/canvas/store/save_formats.js`, `tests/unit/pen_import.test.js` | Synthetic fixtures convert deterministically; unsupported nodes warn instead of throw; `.pen` appears in the open dialog/drag path; `isValidVooFile` passes on output; targeted tests + design lint clean |
| 2 | **Export design to code** — selection/page → HTML+Tailwind / React / CSS dialog with copy+download, scope selector, lossy warnings; menu entries beside Copy HTML/CSS | P0 | M | **done** (26 tests; live UI verified) | `src/canvas/codegen/**`, `src/canvas/components/editor_code_export_dialog.jsx`, `editor_context_menu.jsx`, `tests/unit/codegen_export.test.js` | Deterministic, escaped output for rect/text/image/group/path; no XSS via text; Tailwind classes cover box/flex/typography; dialog is keyboard accessible and passes design lint |
| 3 | **Rulers + draggable guides + reachable grid snapping** — viewport-aligned rulers, guide create/move/remove persisted in `doc.guides` with undo, clear-all + show/hide toggles, grid/guide snap plumbing | P1 | S | **done** (27 tests; snapping regressions green) | `src/canvas/editor/rulers_geometry.js`, `src/canvas/components/editor_rulers.jsx`, `image_editor.jsx`, `use_editor_shortcuts.js`, `scene_snapping.js`, pointer move/transform call sites, `tests/unit/rulers_guides.test.js` | Tick math verified at several zooms; guide edit is one undo entry per drag; guides persist in `.voo`; snapping tests unchanged; design lint clean |
| 4 | **Wire collaboration session** — construct `createCollabSession` from the room/share entry, show presence, fix share links; remove dead `./persistence.js` imports | P1 | M | planned | `src/canvas/collab/**` (owner), `src/canvas/store/share_actions.js`, `src/canvas/store/template_ugc.js`, collab tests | Two-tab room test (localhost) syncs a stroke + node move; share link produces a joinable URL; presence list shows the peer; no dead import graph |
| 5 | **Comments / review threads** — comment pins on canvas, thread popover, resolve/delete, persistence in doc, author identity from collab identity | P1 | M | **done** (model 24 tests; live verified; persistence wired) | new `src/canvas/comments/**`, `editor_comment_layer.jsx`, toolbar/dev-tool entry, i18n modules, tests | Create/reply/resolve/delete works and survives reload; pins ride pan/zoom; keyboard accessible; unit tests for comment store reducers |
| 6 | **Variables v2: types + collections + modes** — extend flat `colorVariables` to color/number/string/boolean with collections, theme/mode values, binding on fill/stroke/radius/gap/spacing; variables panel | P1 | L | **done** (model+panel 40 tests; serialisation wired; aliases/gap-binding deferred) | `src/canvas/editor/scene_variables*.js` (new, migrate `scene_color_variables.js`), properties variable section, serialization, tests | Mode switch re-resolves bound properties without losing bindings; `.voo` round-trips collections/modes; migration from v1 colour variables; tests for binding + mode resolution |
| 7 | **Named styles library** — paint / text / effect styles saved on the document, apply/update/detach from properties | P1 | M | **done wave 3** (30 tests; persistence wired) | new `src/canvas/editor/scene_styles.js`, `editor_properties/style_section.jsx`, serialization, tests | Saving a style then applying it reproduces exact values; editing a style updates applied nodes with one undo step; `.voo` round-trip |
| 8 | **Auto-layout depth + constraints** — hug/fill reflow rules, wrap, min/max, absolute children, resize constraints (pin/scale) in transform panel | P1 | M | **done wave 3** (auto-layout 34 tests; constraints 27 tests + page-resize integration; group/edge-drag hooks deferred) | `src/canvas/editor/scene_auto_layout.js`, `auto_layout_*.jsx`, new `scene_constraints.js`, tests | Reflow tests for hug/fill/wrap; constraints respond to frame resize; existing snapping tests stay green |
| 9 | **Prototyping interactions (MVP)** — hotspots between frames, click/while-press triggers, navigate/back/overlay actions, transition + easing, present-and-run in the existing presentation runtime; flows + starting points | P2 | L | planned | new `src/canvas/prototype/**`, presentation runtime integration, prototype panel, tests | A two-frame prototype runs from Present mode with the declared transition; interaction model round-trips in `.voo`; keyboard/Esc exits |
| 10 | **Quick actions + find & replace** — ⌘K action palette over command table/shortcut catalog; canvas text find/replace with match navigation | P2 | S | **done wave 3** (18 + 14 tests; live UI verified) | new `editor_command_palette.jsx`, `editor_find_replace.jsx`, shortcut wiring, tests | Palette filters commands and executes them; find highlights matches on canvas and replaces with undo; keyboard accessible |
| 11 | **Light interface theme** — token-level theme switch for editor chrome (no gradients, keep Design.md rules), persisted setting | P2 | M | planned | `src/index.css`, `tailwind.config.js`, `settings_general.jsx`, design-lint allowlist update, tests | Chrome switches without reload; contrast passes; design lint clean for both themes; screenshots for both |
| 12 | **Pen agent contract + bundled design skills** — document the canvas tool API (schema + guides), ship a design skill pack (web app / mobile / slides / dashboard) and prompt gallery; `get_style`-style archetypes | P2 | M | planned | `src/shared/skills/**`, `src/canvas/agent/**`, agent panel UI, docs | Agents discover tools + guides from the app; prompt gallery inserts prompts; docs tested for schema validity |

## Explicitly out of scope this cycle

Variables v2, comments, prototyping and collaboration wiring are large enough to deserve their own
verification loops (they touch serialization, the collab transport and the presentation runtime).
They are documented here so the next cycle starts from evidence, not from a blank page.

## Working agreement for implementation workers

- One write scope per task; never edit another task's files (advisory scopes are in `team_task_list`).
- Read `analysis/README.md`, the relevant `analysis/{pen,figma,voo}` section, and the cited files first.
- Pure logic in plain modules (unit-testable without DOM); UI in `.jsx` under `src/canvas/components/`.
- i18n: add a new `src/shared/i18n/<feature>-{en,zh}.js` module; the Lead wires `en.js`/`zh.js`.
- Verify with targeted `npx vitest run …`, `npm run lint:design`; the Lead runs the full suite/build.
- No new dependencies, no commits, no deployment.

## Known follow-ups from wave 2

- Variables manager: the panel can close right after creating the first collection (reopen shows it;
  subsequent edits keep it open). Persist/reopen intent is tracked but the first-action close needs a
  React-level fix.
- Auto layout: `alignItems: "stretch"`, per-line main-axis fill in wrapped frames, and emitting the new
  fields from the code generator / Pen importer.
- Comments: mentions/notifications, realtime sync via the collab stack, pin dragging, keyboard placement.
