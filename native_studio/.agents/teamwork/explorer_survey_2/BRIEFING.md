# BRIEFING — 2026-10-21T16:54:40Z

## Mission
Investigate Web/Electron local AI image repair and processing capabilities (inpainting, erase-fill, matting, background removal, outpainting) and design pure native macOS (Swift 6 + AppKit + CoreGraphics/CoreImage/Vision/Metal) architecture for native_studio bitmap nodes.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesis
- Working directory: /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/explorer_survey_2
- Original parent: 4d908fd8-8eb7-442c-b6a1-4f757933f9ed
- Milestone: survey_2_local_ai_repair

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze local_ai_repair.js, local_inpaint.js, local_matting.js
- Pure Swift 6 + AppKit + CoreGraphics / CoreImage / Vision / Metal target stack
- Check native_studio bitmap node data representation and lifecycle

## Current Parent
- Conversation ID: 4d908fd8-8eb7-442c-b6a1-4f757933f9ed
- Updated: 2026-10-21T16:54:40Z

## Investigation State
- **Explored paths**:
  - `../src/canvas/editor/local_ai_repair.js`
  - `../src/canvas/editor/local_inpaint.js`
  - `../src/canvas/editor/local_inpaint_patch.js`
  - `../src/canvas/editor/local_matting.js`
  - `../src/canvas/editor/matting_models.js`
  - `../src/canvas/editor/matting_transform.js`
  - `../src/canvas/editor/matte_refine.js`
  - `../src/canvas/editor/outpaint_geometry.js`
  - `../src/canvas/editor/outpaint_direction.js`
  - `../src/canvas/editor/outpaint_composite.js`
  - `../src/canvas/editor/selection_effects_inpaint.js`
  - `native_studio/Sources/Models/DocumentModel.swift`
  - `native_studio/Sources/Engine/ImageImporter.swift`
  - `native_studio/Sources/Engine/RasterEngine.swift`
  - `native_studio/Sources/Engine/MetalRenderPipeline.swift`
  - `native_studio/Sources/Engine/CommandManager.swift`
  - `native_studio/Sources/Canvas/CanvasStageView.swift`
- **Key findings**:
  - Web codebase has 3 distinct inpainting mechanisms: Telea fast marching (CPU, 10-30ms), Poisson Laplacian SOR solver, and LaMa 512 ONNX deep repair.
  - Matting uses RMBG-1.4 / BiRefNet with range-aware guided filter (freezing interior/exterior to prevent halos) and 16MP memory budget guard.
  - Outpainting primes margins with mirror reflection + blur (`mirrorBlur`) and blends generations with a 16px feather ramp while preserving original source pixels byte-for-byte.
  - On macOS native, Apple Vision (`VNGenerateForegroundInstanceMaskRequest` and `VNGeneratePersonSegmentationRequest`) provides zero-download, ANE-accelerated foreground matting.
  - Bitmap layers in native_studio are `VOONode` with `kind == .image` storing base64 data URLs in `src`. Image mutations can be encapsulated in `UpdateNodeBitmapCommand` for seamless undo/redo.
- **Unexplored areas**: None. Complete survey achieved.

## Key Decisions Made
- Authored comprehensive 5-component handoff report at `.agents/teamwork/explorer_survey_2/handoff.md`.
- Specified Pure Swift 6 implementations for `TeleaInpainter`, `LocalMattingEngine`, `LocalOutpaintEngine`, and `UpdateNodeBitmapCommand`.

## Artifact Index
- DISPATCH.md — Initial dispatch log
- BRIEFING.md — Working memory and status
- progress.md — Liveness heartbeat and step tracker
- handoff.md — Final investigation report
