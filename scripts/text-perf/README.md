# Text layout benchmark

Run from this worktree:

```sh
flock /tmp/voo-e2e.lock node scripts/text-perf/benchmark.mjs
```

Uses real Chromium Canvas2D with 2,200 distinct, wrapped Latin/CJK text nodes.
Compares the original text painter/metrics at commit
`c855437` with the current implementation, loaded into the same browser.
Each pan, zoom, and move workload has one cold pass followed by 30 measured
frames. All nodes are painted every frame, independent of visibility, to isolate
text layout from renderer culling and FPS work. Browser and Vite close in `finally`.

Times measure synchronous Canvas2D frame submission (layout and paint calls),
not GPU presentation or whole-editor FPS. `measureTextCalls` counts browser
measurement requests over all 30 warm frames; it is an observable proxy for
layout/shaping work, not a count of the browser's private glyph shaping inside
`fillText`. Cold timings/calls are recorded separately. There are no timing-based
pass/fail thresholds on a machine shared with other jobs.

The benchmark saves `results.json` and `text-heavy.png` under
`/workspace/tmp/shots-text-perf/`, falling back to `/tmp/shots-text-perf/` if the
sandbox cannot write the requested directory.

The cache stores wrapped lines, line widths and baseline metrics. It is keyed by
text, the canonical font (family, weight, italic style and size), line height,
letter spacing, wrap width, context identity and additional canvas shaping
properties. Position, transforms and paint properties do not invalidate layout.
Typography/text edits select a new entry; undo can reuse an older entry. Browser
font-load completion/error events clear metrics. Limits are 4,096 entries and an
estimated 8 MiB of key/value data across all contexts, with LRU eviction; a single
oversized layout is computed without retention. Text on a path keeps its existing
specialized renderer.

## Recorded result (2026-10-23)

Chromium headless on the shared job host; 2,200 nodes, 30 warm frames per action.
Raw data is in [results.json](results.json).

| Action | Median before → after (ms) | p95 before → after (ms) | Warm measureText calls before → after |
| --- | --- | --- | --- |
| Pan | 107.0 → 16.7 | 162.7 → 30.8 | 1,252,500 → 0 |
| Zoom | 165.7 → 14.7 | 202.5 → 18.1 | 1,252,500 → 0 |
| Move | 165.7 → 15.6 | 251.4 → 19.0 | 1,252,500 → 0 |

Median submission time improved by 6.4×, 11.3×, and 10.6× respectively.
Cold passes still made 41,750 measurement calls per action in both versions;
this change removes repeated layout work, not first-layout cost. Cold timings
ranged from 154.8–193.8 ms before and 116.1–234.1 ms after, so no cold-path
speedup is claimed. These are single-run, shared-host observations.

Screenshot: `/tmp/shots-text-perf/text-heavy.png`. The requested
`/workspace/tmp/shots-text-perf/` directory was unavailable in this sandbox.
Validation: 74 tests passed across the cache, text-on-path, text placement,
Figma text, and basic rendering suites (two Vitest workers maximum).
