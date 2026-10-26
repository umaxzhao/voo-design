# VOO Design — Feature Gap Analysis (REA)

Goal: reverse-engineer the feature surface of **Pen.app 1.2.15** (pen.dev / highagency Electron app)
and **Figma.app desktop** with the local `rea` CLI, inventory the current **VOO Design** editor
(`src/`, Electron + web), and produce a prioritized gap report that drives implementation work.

## Directory layout

```
analysis/
  README.md            # this file (conventions + matrix schema)
  FEATURE_MATRIX.md    # synthesized by Lead: canonical feature matrix + gap verdicts
  FEATURE_MATRIX.json  # synthesized by Lead: machine-readable matrix
  GAP_REPORT.md        # synthesized by Lead: prioritized gap report / backlog
  RIGHT_PANEL_ALIGNMENT.md # right-hand properties panel: Figma/Pen functional layout → VOO target spec
  DESIGN_EXPERIENCE_AUDIT_2026-10-25.md # 44-state automated design/UX sweep vs Pen + audit-2026-10-25/ raw data
  figma/RIGHT_PANEL_PARITY_2026-10-26.md # Figma right panel vs VOO: item-by-item parity check + remaining gaps
  affinity/GAP_ANALYSIS_2026-10-26.md   # Affinity Photo image-edit gap analysis (REA menus/resources) + shipped filters
  voo/RIGHT_PANEL_CLARITY_2026-10-26.md # Right panel empty states / merged Frame & layout + pan-chrome sync
  NEXT_OPTIMIZATIONS_2026-10-26.md # verified next-round optimization list (prototype/inspect/variants/vector mask/quick wins)
  pen/                 # pen-analyst output (evidence + features.jsonl + FEATURES.md; RIGHT_PANEL.md = panel anatomy)
  figma/               # figma-analyst output (same; RIGHT_PANEL.md = panel anatomy)
  voo/                 # voo-inventory output
```

Each analyst owns exactly one subdirectory. Never edit files outside it.

## Evidence rules

- Every feature row must carry at least one concrete evidence pointer:
  - Pen/Figma: bundle-relative file path (from `/tmp/apps/pen` or `/tmp/apps/figma`) plus symbol,
    string literal, menu label, or command id; include the `rea` command that produced it.
  - VOO: repo path + symbol / test path that proves the behavior exists.
- Mark evidence strength: `static` (bundle/code), `runtime` (captured), `docs` (public docs / web),
  `inferred`.
- Do not claim a behavior is absent in VOO without a code search (state the search pattern used).

## features.jsonl schema (one JSON object per line)

```json
{
  "id": "components.auto_layout",
  "area": "components",
  "name": "Auto layout",
  "description": "One sentence, user-visible behavior.",
  "user_visible": true,
  "priority_guess": "P0",
  "evidence": [
    {"source": "pen", "strength": "static", "file": "out/editor/assets/index.js", "locator": "string:auto layout", "command": "rea ..."}
  ],
  "notes": "Optional caveats / related sub-features."
}
```

Allowed `area` values:
`file`, `canvas`, `tools`, `selection`, `vector`, `text`, `layout`, `components`, `variables`,
`styles`, `effects`, `masks`, `image`, `motion`, `prototyping`, `presentation`, `export`,
`import`, `ai`, `agent`, `collaboration`, `comments`, `devmode`, `plugins`, `performance`,
`shortcuts`, `settings`, `onboarding`, `accessibility`, `i18n`, `storage`.

`priority_guess` is only a suggestion; the Lead assigns final priorities in `GAP_REPORT.md`.

## Environment facts (already established by Lead)

- `rea` v6.5.0 at `/Users/tt/.npm-global/bin/rea`. No native analysis providers are configured
  (Hopper/Ghidra/IDA missing) — do **not** use `rea inspect` / `rea analyze` on binaries.
  Use the JavaScript/Electron/artifact commands only.
- Screen Recording permission is denied, so `rea observe-native-ui` / `capture-native-ui-scenario`
  fail. Do not retry them.
- Pen.app asar extracted read-only copy: `/tmp/apps/pen` (774 MB; `out/editor/assets/index.js` is the
  7.3 MB minified renderer bundle; `out/*.js` is readable compiled main process).
  Original: `/Applications/Pen.app/Contents/Resources/app.asar`.
- Figma.app asar extracted read-only copy: `/tmp/apps/figma` (9.5 MB desktop shell; `main.js`,
  `desktop_shell.js`, `i18n/*.json`, `lazy/external/*.js`). Original asar is malformed by design
  (`.codesign` entry with negative size); do not re-extract with standard tools.
- Both apps are currently running; treat them as read-only. Do not quit, kill, reconfigure or
  write to their profiles.
- The VOO Design working tree contains uncommitted work. Analysts are read-only for the repo.
