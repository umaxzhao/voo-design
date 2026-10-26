# VOO Design documentation index

## Start here
- [../README.md](../README.md): product overview, setup, scripts
- [contributing.md](contributing.md): workflow, design-token gate, how to add canvas tools
- [architecture.md](architecture.md): stack, document model, rendering, Electron layer

## Agents and MCP
- [agents.md](agents.md): design agent, canvas tools, local CLI agents (Claude Code, Codex, OpenCode, Antigravity, DeepSeek Harness)
- [mcp-server.md](mcp-server.md): MCP server, bridge, client configuration, portable connectors

## Editor features
- [properties-panel.md](properties-panel.md), [pages-artboards.md](pages-artboards.md), [export-quality.md](export-quality.md), [web-image-extension.md](web-image-extension.md)

## Release and deployment
- [release-checklist.md](release-checklist.md), [code-signing.md](code-signing.md), [installer-size.md](installer-size.md), [deploy-la.md](deploy-la.md) (editor deploys to `la2`)

## Performance
- [canvas-perf-benchmark.md](canvas-perf-benchmark.md) with raw data in `canvas-perf-results.json` (both are written by `tests/unit/canvas_perf_harness.js`, so they stay at this level)
- [performance/](performance/): [local drag FPS](performance/canvas-fps-local-drag.md), [tile rendering](performance/canvas-fps-tiles.md), [WASM engine](performance/wasm-engine.md), [WASM bench](performance/wasm-engine-bench.md)

## Audits (point-in-time records; check the date and re-verify before relying on them)
| Document | Topic | Status |
| :--- | :--- | :--- |
| [audits/effect-audit-verification.md](audits/effect-audit-verification.md) | Resize constraints, Skia italics: fixes and e2e evidence | Current (2026-10-27) |
| [audits/editor-completion-verification.md](audits/editor-completion-verification.md) | Editor completion checks | Recent |
| [audits/image-processing-audit.md](audits/image-processing-audit.md) | Affinity vs VOO image processing | Recent |
| [audits/design-editor-interaction-audit.md](audits/design-editor-interaction-audit.md) | Editor interaction audit | Historical |
| [audits/panel-control-audit.md](audits/panel-control-audit.md) | Panel control audit (WB-02) | Historical: some file names are gone |
| [audits/editor-ui-gaps.md](audits/editor-ui-gaps.md) | UI control gaps | Historical |
| [audits/benchmark-parity-audit.md](audits/benchmark-parity-audit.md), [audits/benchmark-parity-matrix.md](audits/benchmark-parity-matrix.md) | Benchmark parity | Historical |
| [audits/qa3-round3.md](audits/qa3-round3.md) | QA round 3 | Historical |

Known bug write-ups: [bugs/](bugs/).
