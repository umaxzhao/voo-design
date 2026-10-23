## 2026-10-21T23:30:48Z
You are the Project Orchestrator (teamwork_preview_orchestrator).
Your working directory is: /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/orchestrator_aiflow/
Please maintain your plan.md, progress.md, and BRIEFING.md in your working directory.

The authoritative user request is in: /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/ORIGINAL_REQUEST.md
Specifically, execute the latest user request under header ## 2026-10-21T23:29:09Z:

"完整多智能体团队（并行拆解推进：悬浮工具条/右键AI动作、Agent交互卡片与视口定位、端侧图像直通处理、测试与打包发布）

Deeply optimize the native AI workflow across VOO Design Native Studio (native_studio) by embedding contextual AI direct-actions into the canvas (Contextual Taskbar & Right-Click Menu), rendering interactive tool execution cards in the Agent Panel with instant canvas layer focus, and streamlining the end-to-end interactive experience.

Working directory: /Users/tt/teamwork_projects/voo_design/native_studio
Integrity mode: development

## Reference Material
- Contextual Taskbar Component: Sources/UI/ContextualTaskbarView.swift
- Canvas Selection & Context Menus: Sources/UI/CanvasStageView.swift
- Window Controller & Agent Wiring: Sources/UI/WindowController.swift
- Agent Panel UI: Sources/UI/AgentPanelView.swift
- AI Tool Execution & Local Repair: Sources/Engine/AICanvasTools.swift, Sources/Engine/LocalAIRepairEngine.swift

## Requirements
### R1. Direct Contextual Taskbar & Context Menu AI Actions
Integrate direct one-click AI action affordances into ContextualTaskbarView and the right-click context menu when layers are selected:
- For bitmap/image layers: instant "AI 去背景 (Remove Background)" using LocalAIRepairEngine.removeBackground, updating the node and texture in-place with full Undo/Redo.
- For text/shape layers: "AI 改写/变体 (Rewrite/Variant)" trigger that pre-populates or directly submits a targeted prompt referencing the selected node IDs.

### R2. Interactive Tool Execution Cards & Visual Status
Upgrade the streaming message cards in AgentPanelView:
- Replace raw text prints of [tool] with distinct visual tool cards indicating status (running, success, failed).
- When a tool creates or modifies layers (e.g. create_shape, create_text, generate_image), display clickable action pills showing layer names.

### R3. Smooth Viewport Focusing & Layer Highlighting
Implement viewport synchronization:
- Clicking a generated or modified layer pill in the Agent Panel centers the canvas viewport smoothly onto the target node's bounding box.
- Highlight the target node with a subtle selection pulse effect on the canvas stage.

### R4. Non-blocking Asynchronous Execution & Undo Guarantees
All direct contextual AI operations and background tasks must run off the main thread, dispatching state changes safely to @MainActor via CommandManager to preserve 60fps scrolling and Cmd+Z / Cmd+Shift+Z reversibility.

### R5. Comprehensive Verification & Production Packaging
Extend ./tests/AIAgentTests.swift and ./tests/run_tests.sh to cover contextual taskbar invocations, in-place matting updates, and agent card layer clicks. Ensure ./build.sh build compiles cleanly with zero warnings/errors, maintaining binary size <= 5MB and bundle size <= 35MB. Automatically deploy to la server on completion.

## Mandatory User Rules & Guidelines
- Deployment target: fixed to la (103.114.160.86).
- Remote path: /var/www/voo.run/editor/.
- Never deploy to pt server.
- Automatically execute VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh on completion.

Please decompose this project into parallel sub-teams/specialists (explorers, workers, reviewers, challengers), drive execution, verify thoroughly against all acceptance criteria, run the build and test suites, run deployment, and report when finished."
