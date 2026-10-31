# VOO Design documentation index

## Start here
- [quality-progress.md](quality-progress.md): maintained inspection progress, module status, unverified checks and next work
- [../README.md](../README.md): product overview, setup, scripts
- [contributing.md](contributing.md): workflow, design-token gate, how to add canvas tools
- [architecture.md](architecture.md): stack, document model, rendering, Electron layer
- [engineering-workflow.md](engineering-workflow.md): module ownership, acceptance rows, affected checks and evidence limits

## Agents and MCP
- [agents.md](agents.md): design agent, canvas tools, local CLI agents (Claude Code, Codex, OpenCode, Antigravity, DeepSeek Harness)
- [mcp-server.md](mcp-server.md): MCP server, bridge, client configuration, portable connectors

## Editor features
- [editor-resources.md](editor-resources.md): Assets browser, workspace Resources directory, components and template insertion
- [design-systems.md](design-systems.md): signature systems, welcome choice and agent contracts
- [properties-panel.md](properties-panel.md), [pages-artboards.md](pages-artboards.md), [export-quality.md](export-quality.md), [web-image-extension.md](web-image-extension.md)

## Release and deployment

Run `node scripts/verify-editor-release.mjs` on the exact clean commit being released. It checks the build, design rules, all unit tests, the registered browser suites and source immutability. The JSON output identifies that commit; copy it to the local delivery artifacts directory rather than adding another dated report to this index. Git/remote and production state must be checked independently, rather than inferred from a past report.

- [release-checklist.md](release-checklist.md), [code-signing.md](code-signing.md), [installer-size.md](installer-size.md), [deploy-la.md](deploy-la.md) (editor deploys to `la2`)

## Performance
- [Evidence map](performance/README.md): distinguishes CPU, historical raster FPS, current GPU FPS and WASM results; no mixed-backend aggregate
- [canvas-perf-benchmark.md](canvas-perf-benchmark.md) with raw data in `canvas-perf-results.json` (both are written by `tests/unit/canvas_perf_harness.js`, so they stay at this level)
- [performance/](performance/): [local drag FPS](performance/canvas-fps-local-drag.md), [tile rendering](performance/canvas-fps-tiles.md), [WASM engine](performance/wasm-engine.md), [WASM bench](performance/wasm-engine-bench.md)

## Audits (point-in-time records; check the date and re-verify before relying on them)
| Document | Topic | Status |
| :--- | :--- | :--- |
| [audits/continuous-creation-audit.md](audits/continuous-creation-audit.md) | One real UI creation session, shortcut/group/cancel/ink defects and cold ZIP reopening | Registered core check; desktop Chromium scope and remaining cases explicit |
| [audits/nested-objects-audit.md](audits/nested-objects-audit.md) | Nested Frame placement, masks, hit testing, deletion, clipboard and cold project reopening | Real-pointer, pixel and hierarchy coverage; use the exact release report for results |
| [audits/image-editor-complete-audit.md](audits/image-editor-complete-audit.md) | Image tool, pixel, inspector, MCP, native storage and real-model acceptance matrix | Maintained coverage and explicit external/platform requirements; execution results belong to the exact revision report |
| [audits/editor-closeout.md](audits/editor-closeout.md) | Mesh rendering, automatic image consent, touch page ordering and stretch layout | Coverage contracts and remaining limits; use the exact release report for execution results |
| [audits/pending-workspace-integration.md](audits/pending-workspace-integration.md) | Preserved pending drafts, signature systems, nested constraints and bucket/variable regressions | Workspace integration; [verified release evidence](audits/pending-integration-release.json) |
| [audits/remote-main-verification-2026-10-28.md](audits/remote-main-verification-2026-10-28.md) | Clean remote reproduction, custom-menu regressions, dedicated inspector/drawing/retouch evidence | Verification at the recorded revision |
| [audits/layout-mask-verification.md](audits/layout-mask-verification.md) | Group/rotated alignment, Auto Layout, clipping and Boolean pixel/history checks | Snapshot (2026-10-27) |
| [audits/agent-mutation-verification.md](audits/agent-mutation-verification.md) | Agent paint/text parity, UI tests, real MCP/pixel evidence and remaining limits | Snapshot (2026-10-27) |
| [audits/effect-audit-verification.md](audits/effect-audit-verification.md) | Resize constraints, Skia italics: fixes and e2e evidence | Snapshot (2026-10-27) |
| [audits/editor-completion-verification.md](audits/editor-completion-verification.md) | Editor completion checks | Recent |
| [audits/image-processing-audit.md](audits/image-processing-audit.md) | Affinity vs VOO image processing | Recent |
| [audits/design-editor-interaction-audit.md](audits/design-editor-interaction-audit.md) | Editor interaction audit | Historical |
| [audits/panel-control-audit.md](audits/panel-control-audit.md) | Panel control audit (WB-02) | Historical: some file names are gone |
| [audits/editor-ui-gaps.md](audits/editor-ui-gaps.md) | UI control gaps | Historical |
| [audits/benchmark-parity-audit.md](audits/benchmark-parity-audit.md), [audits/benchmark-parity-matrix.md](audits/benchmark-parity-matrix.md) | Benchmark parity | Historical |
| [audits/qa3-round3.md](audits/qa3-round3.md) | QA round 3 | Historical |

Known bug write-ups: [bugs/](bugs/).
