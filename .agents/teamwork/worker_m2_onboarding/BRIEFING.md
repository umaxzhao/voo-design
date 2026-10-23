# BRIEFING — 2026-10-21T23:31:00Z

## Mission
Implement Milestone 2: Refined Onboarding Guide & Quick Setup Ergonomics across onboarding state, modal UX, CLI diagnostics, title bar and settings entry points, and comprehensive unit tests.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /Users/tt/teamwork_projects/voo_design/.agents/teamwork/worker_m2_onboarding
- Original parent: 8189032a-2771-44e5-a68b-fb75d8c8aa02
- Milestone: Milestone 2 (Onboarding Ergonomics & Entry Points)

## 🔒 Key Constraints
- Exclusive write ownership limited to:
  - src/canvas/components/onboarding/onboarding_state.js
  - src/canvas/components/onboarding/OnboardingGuide.jsx
  - src/canvas/components/onboarding/step_local_detect.jsx
  - src/app_title_bar.jsx
  - src/canvas/components/settings_general.jsx
  - tests/unit/onboarding_ergonomics_entry_points.test.js
- Integrity Mandate: no cheating, no hardcoded test outputs, genuine logic and state.
- Keep navigator.webdriver protection in shouldShowOnboarding().
- Always verify changes with vitest.

## Current Parent
- Conversation ID: 8189032a-2771-44e5-a68b-fb75d8c8aa02
- Updated: not yet

## Task Summary
- **What to build**:
  1. `openOnboardingGuide()` export in `onboarding_state.js` & workspace path trimming check.
  2. Draft restoration 1-frame flash elimination & styling & scroll reset in `OnboardingGuide.jsx`.
  3. Honest CLI diagnostics (ready / unauthenticated / not_installed / loopback bridge guidance) in `step_local_detect.jsx`.
  4. Accessible entry point button in `src/app_title_bar.jsx`.
  5. Action card / button in `src/canvas/components/settings_general.jsx`.
  6. Comprehensive unit tests in `tests/unit/onboarding_ergonomics_entry_points.test.js`.
- **Success criteria**: Tests pass 100%, clean code, minimal edits, genuine logic.
- **Interface contracts**: PROJECT.md, survey_r2_onboarding handoff.
- **Code layout**: src/canvas/components/onboarding/, src/, tests/unit/

## Change Tracker
- **Files modified**: None yet
- **Build status**: Untested
- **Pending issues**: None

## Quality Status
- **Build/test result**: Not started
- **Lint status**: Not started
- **Tests added/modified**: tests/unit/onboarding_ergonomics_entry_points.test.js (planned)

## Loaded Skills
- None specified in dispatch

## Key Decisions Made
- Synchronous state initialization via callback to eliminate 1-frame flash during draft load.
- Dispatch window custom event `voo:open-onboarding` for decoupling between title bar/settings and OnboardingGuide modal.

## Artifact Index
- DISPATCH.md — Assignment instructions
- BRIEFING.md — Working memory
- progress.md — Execution heartbeat
- handoff.md — Final 5-component report
