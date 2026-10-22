# BRIEFING — 2026-10-21T02:57:45Z

## Mission
Mine specifications, existing onboarding patterns from voo-run and voo_design codebase, and design tokens for the first-launch Onboarding Configuration Guide Modal.

## 🔒 My Identity
- Archetype: specification miner
- Roles: Teamwork specialist, external domain expert
- Working directory: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_onboarding
- Original parent: 45cc7173-5a54-4e4f-bc62-74296535d042
- Milestone: Onboarding Configuration Guide Modal

## 🔒 Key Constraints
- Mine specifications and onboarding patterns from voo-run and voo_design
- Replicate voo-run onboarding UI styling (`OnboardingGuide.jsx`, `onboarding_step_progress.jsx`, `onboarding_art.jsx`), but streamline into 3 clean steps: 1. Welcome & Agent Selection, 2. Local Detection & Connection, 3. Ready & Enter Canvas
- Do NOT implement anything — read-only specification miner
- Check Design.md and design tokens (#18181b, #121214, border-white/10, shadow-pop, shadow-menu, shadow-panel, typography)
- Report findings with Features Discovered and Edge Cases tables
- Self-contained handoff.md following 5-component protocol

## Current Parent
- Conversation ID: 45cc7173-5a54-4e4f-bc62-74296535d042
- Updated: 2026-10-21T02:57:45Z

## Task Summary
- **What to build**: Specification mining & architectural design for Onboarding Configuration Guide Modal
- **Success criteria**: Comprehensive handoff report analyzing voo-run reference code, voo_design persistence/state, header trigger, visual token compliance, step flows, and edge cases
- **Interface contracts**: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/ORIGINAL_REQUEST.md
- **Code layout**: /Users/tt/teamwork_projects/voo_design/Design.md, /Volumes/TD/Projects/voo-run/src/canvas/components/onboarding

## Key Decisions Made
- Replicate visual style of voo-run onboarding components (`OnboardingGuide.jsx`, `onboarding_step_progress.jsx`, `onboarding_art.jsx`) while streamlining flow to 3 steps.
- Persistence: Use `src/shared/settings.js` with `voo.onboarding.completedVersion` (value `1`).
- Design tokens: Strict neutral `#161616` (modal background), `#121212` (footer), `#1c1c1c` (art column), `border-white/10`, `shadow-panel`, `shadow-pop`, `#a7ffd4` (mint accent).
- Triggers: Startup check in `useOnboarding()`, plus explicit re-trigger from `CanvasAgentPanel` (model pill) and `SettingsDrawer` via `voo:open-onboarding`.

## Artifact Index
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_onboarding/DISPATCH.md — Dispatch log
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_onboarding/BRIEFING.md — Working memory & identity
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_onboarding/progress.md — Liveness & progress tracker
- /Users/tt/teamwork_projects/voo_design/.agents/teamwork/survey_onboarding/handoff.md — 5-component handoff report
