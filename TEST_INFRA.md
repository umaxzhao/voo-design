# E2E Test Infra: VOO Design Local AI CLI Alignment & Onboarding Guide

## Test Philosophy
- Opaque-box, requirement-driven derived from the original user specifications (the `ORIGINAL_REQUEST` document referenced below was not kept in this repository).
- Dual validation across Desktop Electron IPC and Web loopback bridge environments.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Claude Code Default Setting | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Antigravity CLI Agent Enablement | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Dual-Channel Client Bridge | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 4 | CLI Stream Transport | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 5 | Desktop Electron IPC Exposure | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 6 | Loopback Bridge Server (ws 4179) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 7 | CLI Subprocess Probe & Executor | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | CLI Provider Engine Integration | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 9 | Onboarding Shell & Layout Port | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 10 | Onboarding Sliding Step Progress | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 11 | Onboarding Cover Art Component | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 12 | Step 1: Welcome & Agent Selection | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 13 | Step 2: Local Detection & Probe | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 14 | Step 3: Ready & Enter Canvas | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 15 | Settings Persistence & Gating | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 16 | Automation CI Bypass | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 17 | Workbench Re-trigger Triggers | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 18 | Contextual Island Taskbar Dispatch | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 19 | Agent Panel Turn Execution | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 20 | Real-time Agent Status Pill | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 21 | Step-by-Step Plan Execution Cards | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 22 | Transactional Canvas Mutations | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest (`npm test`), Node environment with lightweight browser polyfills.
- Design linter: `npm run lint:design` (`scripts/check-design.mjs`).
- Production builder: `npm run build` (`vite build`).
- Target deployment: `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`.
- Test suites:
  - `tests/unit/cli_bridge_protocol.test.js`: Message serialization, wire routing, event emission.
  - `tests/unit/provider_cli_registry.test.js`: Defaults, model resolution, provider availability.
  - `tests/unit/onboarding_guide.test.jsx`: 3-step wizard flow, persistence, UI rendering, automation gate.
  - Agent panel dispatch (Island Bar selection context, turn execution, plan status, undo/redo): the former `agent_panel_dispatch.test.jsx` no longer exists; see `tests/unit/agent_panel_model_selector.test.jsx` and the canvas agent tests.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | First-time user opens VOO Design, completes 3-step guide selecting Claude Code, and lands on blank canvas | F1, F9, F12, F13, F14, F15 | High |
| 2 | User opens settings from header, switches active agent to Codex, probes connection, and verifies status pill updates | F1, F17, F20, F7 | Medium |
| 3 | User selects a Frame on canvas, types prompt in floating Island Bar, dispatches turn to Claude Code, streams plan steps | F3, F4, F18, F19, F21 | High |
| 4 | Agent executes canvas mutation (inserting image/layer), user presses Undo (⌘Z) and Redo (⇧⌘Z) verifying history integrity | F18, F21, F22 | Medium |
| 5 | Web user runs without bridge, receives clear offline indicator and copyable terminal command without crash | F6, F7, F13, F20 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (≥110 tests)
- Tier 2: ≥5 boundary/edge cases per feature (≥110 tests)
- Tier 3: Pairwise coverage across major feature combinations (≥22 tests)
- Tier 4: ≥5 realistic end-to-end application scenarios
