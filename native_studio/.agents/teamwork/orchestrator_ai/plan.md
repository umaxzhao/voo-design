# Multi-Milestone Execution Plan: Native AI Capabilities Porting

## Objective
Port and faithfully replicate VOO Design's complete AI capabilities from Web/Electron (`../src/canvas/agent/`, `../src/canvas/editor/local_ai_repair.js`, etc.) into `native_studio` (Pure Swift 6 + AppKit + CoreGraphics/Metal).

## Phases & Milestones

### Phase 0: Survey & Scope Mapping (Parallel 3 Explorers)
- Explorer 1 (Web AI Reference): Deep dive into `../src/canvas/agent/` (`canvas_agent.js`, `canvas_tools.js`, `chat_stream.js`, `image_generation.js`, `generation_routes.js`).
- Explorer 2 (Local AI Image Repair): Deep dive into `../src/canvas/editor/` (`local_ai_repair.js`, `local_inpaint.js`, `local_matting.js`) and corresponding CoreImage/Vision/Metal native mapping.
- Explorer 3 (Native Studio UI & Architecture): Audit existing `AgentPanelView.swift`, `SettingsDrawerView.swift`, `CommandManager.swift`, `DocumentModel.swift`, `ContextualTaskbarView.swift`.
- Synthesize into `PROJECT.md` Feature Inventory & Architecture.

### Milestone 1: Native AI Execution Engine & SSE Streaming Client (R1)
- Async streaming client (`URLSession` SSE parser) for OpenAI-compatible endpoints.
- Multi-turn conversation loop, tool call schemas, JSON parser, stream token emitter.

### Milestone 2: Canvas Tool System & Undo/Redo Integration (R2)
- Port tools: `generate_image`, `create_shape`, `create_text`, `modify_layer`, layout tools.
- Bind all mutations to `CommandManager` (`VOONodeCommand`, etc.) for complete Undo/Redo fidelity.

### Milestone 3: Local / On-device AI Repair Pipeline (R3)
- Inpainting / erase-fill via CoreImage / Metal / Vision.
- Subject/Background matting (segmentation).
- Seamless blending and layer bitmap updating.

### Milestone 4: Provider Credentials & Settings Management (R4)
- Keychain & secure persistent storage for API keys (OpenAI, Anthropic, Qwen, DeepSeek, custom base URLs, model IDs).
- Settings UI wiring in `SettingsDrawerView.swift` with live connection testing.

### Milestone 5: UI Integration in AgentPanelView & Contextual Taskbar (R5)
- Full message streaming UI, tool invocation cards, suggestions, chat history.
- Contextual Taskbar quick prompt actions.
- Main-thread decoupling for smooth 60fps interaction.

### Milestone 6: Verification, E2E Testing & Deployment (R6 & User Rules)
- Test suite under `tests/` covering mock streaming, tool calling, undo contracts, filters.
- Build clean <= 5MB budget via `./build.sh build`.
- 100% test pass via `./tests/run_tests.sh`.
- Automated deploy to `la` (`VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`).
