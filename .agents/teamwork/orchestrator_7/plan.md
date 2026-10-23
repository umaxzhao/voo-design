# Execution Plan — orchestrator_7

## Mission
Deliver unified Workspace Directory Management System for VOO Design according to latest requirements in ORIGINAL_REQUEST.md.

## Phase 0: Survey & Codebase Exploration
- Spawn 3 parallel Explorers:
  - `explorer_ws_storage`: Investigate reference `/Volumes/TD/Projects/voo-run` for workspace storage engine (Electron IPC, native folder dialog, file scanning, watch, trash, delete; Web File System Access API & IndexedDB fallback).
  - `explorer_ws_onboarding`: Investigate onboarding guide and settings drawer integration (`OnboardingGuide`, `SettingsDrawer`, workspace setup modal, persistence key).
  - `explorer_ws_workbench`: Investigate `WelcomeDashboard`, project list, star/favorites, rename, delete, new project path defaults.
- Merge survey findings into updated `PROJECT.md` and `TEST_INFRA.md`.

## Phase 1: Milestone 1 (M1) — Dual-Platform Workspace Storage Engine
- Implement workspace storage adapter abstraction layer:
  - Electron IPC channels (`window.vooDesktop.workspace`) in `preload.cjs` & `main.cjs` for native dialog, folder scanning (.voo, .fig, .psd, .svg), file watch, rename, trash/delete.
  - Web fallback with File System Access API directory handle & IndexedDB store.
- Unit and integration tests.
- Review, challenge, and forensic audit.

## Phase 2: Milestone 2 (M2) — Onboarding Workspace Guide & Settings Integration
- Onboarding workspace modal for first launch if no workspace configured.
- SettingsDrawer workspace path display, change folder action, reset/relink.
- Persistence with fallback defaults.
- Unit and integration tests, review, challenge, forensic audit.

## Phase 3: Milestone 3 (M3) — Workbench (WelcomeDashboard) Deep Integration
- Display active workspace path and change button on WelcomeDashboard.
- Live listing of design projects (.voo, .fig, .psd, .svg).
- Actions: Star/favorite, rename, move to trash, permanent delete, new project default save location.
- Unit and integration tests, review, challenge, forensic audit.

## Phase 4: Milestone 4 (M4) — End-to-End Test Suite, Clean Build, & Deployment
- Full unit and integration test suite verification (100% Pass).
- Clean `npm run build`.
- Automatic deployment to server `la` (103.114.160.86) via `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`.
- Verify remote health probe HTTP 200.
