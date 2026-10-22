# BRIEFING — 2026-10-21T16:48:45Z

## Mission
Port and replicate VOO Design's complete AI capabilities from Web/Electron into native_studio (Pure Swift 6 + AppKit + CoreGraphics/Metal) across LLM engine, canvas tool commands, local AI repair, settings/credentials, UI wiring, and automated testing.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/orchestrator_ai
- Original parent: parent
- Original parent conversation ID: d79b4638-710e-4466-be9a-ced7a05047c4

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /Users/tt/teamwork_projects/voo_design/native_studio/PROJECT.md
1. **Decompose**:
   - Survey codebase via 3 parallel Explorers to map existing AI modules in web vs native_studio
   - Formulate Feature Inventory in PROJECT.md
   - Decompose into parallel milestones (M1: Engine & SSE, M2: Tool Calling & Undo/Redo, M3: Local AI Repair, M4: Settings & Keychain, M5: UI Integration, M6: E2E Testing & Packaging)
2. **Dispatch & Execute**:
   - Direct iteration loop per milestone: Explorer(s) -> Worker -> Reviewer(s) -> Challenger(s) -> Auditor -> Gate
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical, never skip auditor)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (last resort)
4. **Succession**:
   - At 16 spawns, write handoff.md, cancel crons, spawn successor
- **Work items**:
  1. Survey and Scope Mapping [in-progress]
  2. M1: Native AI Execution Engine & SSE Client [pending]
  3. M2: Canvas Tool System & Undo/Redo Integration [pending]
  4. M3: Local / On-Device AI Repair Pipeline [pending]
  5. M4: Provider Credentials & Settings Management [pending]
  6. M5: Full UI Wiring in AgentPanelView & Taskbar [pending]
  7. M6: Verification, E2E Testing & Deployment to `la` [pending]
- **Current phase**: 0 (Survey)
- **Current focus**: Codebase survey and feature inventory enumeration

## 🔒 Key Constraints
- DISPATCH-ONLY: NEVER write source code directly, NEVER run build/test commands directly.
- Audit enforcement: Forensic Auditor reports INTEGRITY VIOLATION -> milestone FAILS UNCONDITIONALLY.
- Deploy rule: Deploy target MUST be `la` (`VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`). NEVER deploy to `pt`.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.
- Binary size budget: <=5MB. Pure Swift 6 + AppKit.

## Current Parent
- Conversation ID: d79b4638-710e-4466-be9a-ced7a05047c4
- Updated: not yet

## Key Decisions Made
- Project pattern selected for comprehensive multi-milestone native AI porting.
- Survey phase dispatched with 3 parallel Explorers.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_survey_1 | teamwork_preview_explorer | Survey Web Agent Loop & Tools | in-progress | 15630937-e96a-4ec3-a04b-84575645d85a |
| explorer_survey_2 | teamwork_preview_explorer | Survey Local AI Repair | in-progress | 898006b9-2b4d-4503-bfa6-38f7def4752a |
| explorer_survey_3 | teamwork_preview_explorer | Survey Native Studio Architecture & UI | in-progress | 351518e6-0735-4140-857a-f3fed5fc470d |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: 15630937-e96a-4ec3-a04b-84575645d85a, 898006b9-2b4d-4503-bfa6-38f7def4752a, 351518e6-0735-4140-857a-f3fed5fc470d
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 4d908fd8-8eb7-442c-b6a1-4f757933f9ed/task-12 (every 10m)
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/orchestrator_ai/DISPATCH.md — Incoming task assignments
- /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/orchestrator_ai/BRIEFING.md — Persistent working memory
- /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/orchestrator_ai/plan.md — Multi-milestone execution plan
- /Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/orchestrator_ai/progress.md — Execution heartbeat and progress tracking
- /Users/tt/teamwork_projects/voo_design/native_studio/PROJECT.md — Global project index & feature inventory
