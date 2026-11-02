# Project: Native Studio AI Capabilities Porting

## Architecture
Replicate VOO Design's complete Web/Electron AI agent, canvas tools, local AI repair, and provider credentials systems into Pure Swift 6 + AppKit + CoreGraphics/Metal/Vision:
- **Engine Core** (`Sources/Engine/Agent/`):
  - `AIAgentEngine.swift`: Multi-turn conversational agent loop (`canvas_agent.js`), message history manager, system prompt configuration, error handling (`agentStepLimit`).
  - `SSEStreamingClient.swift`: Native `URLSession` Server-Sent Events parser (`chat_stream.js`), delta token accumulator, incremental tool call JSON reassembly.
  - `CanvasTools.swift`: Declarative tool schema registry (`CANVAS_TOOL_SCHEMAS`), parameter decoding, tool execution dispatcher.
  - `ImageGenerationService.swift`: Remote image generation pipeline (`image_generation.js`, `generation_routes.js`), prompt augmentation, polling, and bitmap layer creation.
  - `ProviderCredentials.swift`: Secure dual-tier storage (macOS Keychain via `Security.framework` for API keys, `UserDefaults` for base URLs and model IDs), connection health probe.
- **Local AI Repair Engine** (`Sources/Engine/LocalAIRepair/`):
  - `TeleaInpainter.swift`: Fast Marching weighted neighbor diffusion for spot healing / blemish removal (`local_inpaint.js`).
  - `PoissonPatchBlender.swift`: Laplacian membrane SOR solver ($\omega=1.45$) for seamless patch blending (`local_inpaint_patch.js`).
  - `LocalMattingEngine.swift`: Background cutout / foreground matting using Apple Vision (`VNGenerateForegroundInstanceMaskRequest` / `VNGeneratePersonSegmentationRequest`) with range-aware guided filtering and edge feathering (`local_matting.js`, `matte_refine.js`).
  - `LocalOutpaintEngine.swift`: Saliency-guided canvas expansion, mirrorBlur margin priming, and 16px seam blending (`outpaint_geometry.js`, `outpaint_composite.js`).
  - `LocalAIRepairBridge.swift`: Unified bridge dispatching repair operations to `CommandManager` on image layers.
- **Canvas Command & Undo/Redo Integration** (`Sources/Engine/CommandManager.swift`):
  - All AI canvas mutations (`create_shape`, `create_text`, `modify_layer`, `generate_image`, inpaint, matting) commit as atomic `StudioCommand` instances or grouped `CompoundCommand` transactions with 100% `Cmd+Z` / `Cmd+Shift+Z` reversibility.
- **UI Integration** (`Sources/UI/`):
  - `AgentPanelView.swift`: Live token streaming, `AgentToolCardView` (in-progress spinner, completed checkmark, layer focus button, error card), selection context pill, context-aware suggestions.
  - `ContextualTaskbarView.swift`: Inline "✨ AI" quick actions (Background Removal, Inpaint / Healing, Copy Rewrite, Style Variation) attached to active canvas selection.
  - `SettingsDrawerView.swift`: Interactive AI Providers tab with endpoint configuration, API key input (`NSSecureTextField`), active model selection, and live connection test probe.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | SSE Streaming Client | Native `URLSession` async SSE parser handling OpenAI-compatible chunk deltas, `[DONE]`, and split-buffer lines | M1 | survey |
| 2 | Tool Call Chunk Reassembly | Incremental indexing and merging of tool call arguments across streaming deltas | M1 | survey |
| 3 | AI Multi-Turn Agent Loop | Multi-turn agent loop with system prompt, history management, tool execution recursion, and step limits (max 8) | M1 | survey |
| 4 | Provider Credentials & Keychain | Secure Keychain storage for sensitive API keys (OpenAI, Anthropic, Qwen, DeepSeek), UserDefaults for models/URLs | M1 | survey |
| 5 | Connection Test Probe | Connectivity probe testing endpoint URL and authentication validity with visual feedback | M1 | survey |
| 6 | Canvas Tool Schema Registry | Declarative tool schemas for `generate_image`, `describe_selection`, `create_shape`, `create_text`, `modify_layer` | M2 | survey |
| 7 | Canvas Tool Execution Engine | Tool executor translating parsed arguments into canvas operations and returning execution JSON to LLM | M2 | survey |
| 8 | Undo/Redo Integration | 100% `Cmd+Z` / `Cmd+Shift+Z` compatibility for all AI-created and AI-modified layers via `CompoundCommand` | M2 | survey |
| 9 | Remote Image Generation Pipeline | Submit generation jobs, poll status, download bitmap, and place centered layer respecting canvas aspect ratio | M2 | survey |
| 10 | Telea Fast Marching Inpainter | Zero-dependency local diffusion inpainting for spots, scratches, and blemish healing | M3 | survey |
| 11 | Poisson Membrane Patch Blender | Laplacian SOR seamless patch blending for local image repairs | M3 | survey |
| 12 | Apple Vision Foreground Matting | One-click background removal via `VNGenerateForegroundInstanceMaskRequest` / `VNGeneratePersonSegmentationRequest` | M3 | survey |
| 13 | Range-Aware Guided Filter & Feathering | Edge band restriction preserving solid subject/background pixels with edge feathering | M3 | survey |
| 14 | Outpainting Geometry & Seam Blending | Saliency-based canvas expansion, mirrorBlur margin priming, and 16px seam blending | M3 | survey |
| 15 | Local AI Repair Bridge | Connect inpaint, matting, and outpaint to `CommandManager` via `UpdateNodeBitmapCommand` preserving byte-for-byte fidelity | M3 | survey |
| 16 | Settings UI AI Providers Tab | Interactive text fields for base URLs, API keys, active provider selection, and connection test button | M4 | survey |
| 17 | AgentPanelView Live Streaming & Cards | Real-time text token streaming, `AgentToolCardView` tool status cards, error bubbles | M5 | survey |
| 18 | Selection Context & Suggestion Chips | Selection pill displaying target layer info and dynamic context-adaptive suggestions | M5 | survey |
| 19 | Contextual Taskbar AI Quick Actions | "✨ AI" button on `ContextualTaskbarView` for instant matting, inpaint, and quick prompt trigger | M5 | survey |
| 20 | Automated Unit & Integration Tests | Comprehensive test suites under `tests/` covering SSE parser, tool calls, undo/redo, and image repair | M6 | survey |
| 21 | Build Packaging & Budget Verification | Clean build via `./build.sh build` with binary size <= 5.0 MB (budget <= 5,242,880 bytes) | M6 | survey |
| 22 | Server Deployment | Production deployment to `la` (`VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`) | M6 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | AI Engine Core & SSE Client | `Sources/Engine/Agent/SSEStreamingClient.swift`, `AIAgentEngine.swift`, `ProviderCredentials.swift`, connection testing | None | PLANNED |
| M2 | Canvas Tool System & Undo/Redo | `Sources/Engine/Agent/CanvasTools.swift`, `ImageGenerationService.swift`, `CompoundCommand` integration | M1 | PLANNED |
| M3 | Local AI Repair Pipeline | `Sources/Engine/LocalAIRepair/` (`TeleaInpainter.swift`, `PoissonPatchBlender.swift`, `LocalMattingEngine.swift`, `LocalOutpaintEngine.swift`, `LocalAIRepairBridge.swift`) | None | PLANNED |
| M4 | Settings UI & Credentials Integration | `Sources/UI/SettingsDrawerView.swift` AI Providers tab interactive fields, Keychain binding, connection testing UI | M1 | PLANNED |
| M5 | AgentPanel & Contextual Taskbar UI | `Sources/UI/AgentPanelView.swift` (`AgentToolCardView`, streaming, suggestion chips), `Sources/UI/ContextualTaskbarView.swift` ("✨ AI" action) | M1, M2, M3 | PLANNED |
| M6 | Comprehensive Verification & Deploy | Unit & E2E tests under `tests/`, `./build.sh build` size check (<=5MB), `./tests/run_tests.sh` 100% pass, deploy to `la` | M1, M2, M3, M4, M5 | PLANNED |

## Interface Contracts
### `SSEStreamingClient` (`Sources/Engine/Agent/SSEStreamingClient.swift`)
```swift
public protocol SSEStreamingClientDelegate: AnyObject, Sendable {
    func client(_ client: SSEStreamingClient, didYieldDelta textDelta: String)
    func client(_ client: SSEStreamingClient, didUpdateToolCall id: String, name: String?, argumentsDelta: String)
    func client(_ client: SSEStreamingClient, didCompleteWithFullText text: String, toolCalls: [AgentToolCall])
    func client(_ client: SSEStreamingClient, didFailWithError error: Error)
}
```

### `CanvasTools` (`Sources/Engine/Agent/CanvasTools.swift`)
```swift
public struct AgentToolCall: Sendable {
    public let id: String
    public let name: String
    public let argumentsJSON: String
}

public struct AgentToolResult: Sendable {
    public let toolCallId: String
    public let name: String
    public let success: Bool
    public let outputJSON: String
    public let affectedNodeIds: [String]
    public let undoableCommand: StudioCommand?
}
```

### `LocalAIRepairBridge` (`Sources/Engine/LocalAIRepair/LocalAIRepairBridge.swift`)
```swift
@MainActor
public protocol LocalAIRepairBridgeDelegate: AnyObject {
    func localAIRepairDidStart(operationName: String)
    func localAIRepairDidComplete(operationName: String, updatedNodeId: String)
    func localAIRepairDidFail(operationName: String, error: Error)
}
```

## Code Layout
- `Sources/Engine/Agent/`: Owned by M1 & M2.
  - `AIAgentEngine.swift`
  - `SSEStreamingClient.swift`
  - `CanvasTools.swift`
  - `ImageGenerationService.swift`
  - `ProviderCredentials.swift`
- `Sources/Engine/LocalAIRepair/`: Owned by M3.
  - `TeleaInpainter.swift`
  - `PoissonPatchBlender.swift`
  - `LocalMattingEngine.swift`
  - `LocalOutpaintEngine.swift`
  - `LocalAIRepairBridge.swift`
- `Sources/UI/SettingsDrawerView.swift`: Owned by M4.
- `Sources/UI/AgentPanelView.swift`: Owned by M5.
- `Sources/UI/ContextualTaskbarView.swift`: Owned by M5.
- `tests/`: Owned by M6.
