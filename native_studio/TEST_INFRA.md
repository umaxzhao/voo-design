# E2E Test Infra: native_studio AI Capabilities

## Test Philosophy
- Opaque-box, requirement-driven. No reliance on mock implementation cheats.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.
- Target: 100% automated pass rate via `./tests/run_tests.sh`, verified under strict budget (<= 5 MB app binary).

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Tier 1 (Unit) | Tier 2 (Boundary) | Tier 3 (Cross) |
|---|---------|-------------------|:-------------:|:-----------------:|:--------------:|
| 1 | SSE Chunk & Token Parsing | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Tool Call Chunk Reassembly | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Multi-turn Agent Loop & Step Limits | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Keychain Credentials & Provider Storage | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 5 | Connection Test Probe | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 6 | Canvas Tool Schema Registry | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Canvas Tool Execution Engine | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Undo/Redo Reversibility Contract | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Remote Image Generation Pipeline | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 10 | Telea Fast Marching Inpainter | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 11 | Poisson Membrane Patch Blender | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 12 | Apple Vision Foreground Matting | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 13 | Range-Aware Guided Filter & Feathering | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 14 | Outpainting Geometry & Seam Blending | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 15 | Local AI Repair Bridge to CommandManager | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 16 | Settings UI AI Providers Tab | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 17 | AgentPanelView Live Streaming & Cards | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 18 | Selection Context & Suggestion Chips | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 19 | Contextual Taskbar AI Quick Actions | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: `tests/run_tests.sh` (builds `build/VOODesignE2ETests` and executes).
- Test harness: `tests/TestHarness.swift` providing assertions, timing, memory check, and summary tables.
- Test suites:
  - `tests/AIAgentTests.swift`: SSE client, tool parser, multi-turn loop simulation.
  - `tests/CanvasAIToolTests.swift`: Tool schemas, node generation, CommandManager undo/redo reversibility.
  - `tests/LocalAIRepairTests.swift`: Telea diffusion, Poisson SOR, Vision matting, edge feathering, byte preservation.
  - `tests/ProviderCredentialsTests.swift`: Keychain storage, fallback, endpoint testing.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Multi-turn card design with AI tools | F1, F2, F3, F6, F7, F8 | High |
| 2 | Image generation, insertion, and complete Undo/Redo | F8, F9, F17 | High |
| 3 | Local photo blemish healing & background removal | F10, F12, F13, F15 | High |
| 4 | Outpainting canvas expansion & seam blending | F14, F15, F8 | High |
| 5 | End-to-end prompt from Contextual Taskbar to layer creation | F19, F17, F1, F7, F8 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 boundary/error cases per feature
- Tier 3: pairwise coverage of key tool & command combinations
- Tier 4: ≥5 realistic end-to-end workflows
