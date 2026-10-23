# E2E & Unit Test Infra: VOO Design Workspace Directory Management System

## Test Philosophy
- Requirement-driven, opaque-box & unit-level coverage for all 3 runtime environments (Electron Desktop, Web FSA, Web Virtual IDB).
- Guarantee zero regression across existing 842 tests (`npm test` 100% Pass).
- Maintain 0 design token violations (`npm run lint:design`).

## Feature Inventory Test Coverage
| # | Feature | Target Test File | Tier 1 (Happy) | Tier 2 (Boundary) | Tier 3 (Cross) |
|---|---------|------------------|:--------------:|:-----------------:|:--------------:|
| 1 | Electron Native Picker & Config | `tests/unit/workspace_electron_ipc.test.js` | 5 | 5 | ✓ |
| 2 | Electron Filesystem Operations | `tests/unit/workspace_electron_ipc.test.js` | 5 | 5 | ✓ |
| 3 | Electron File Watcher IPC | `tests/unit/workspace_electron_ipc.test.js` | 5 | 5 | ✓ |
| 4 | Unified Storage Engine | `tests/unit/workspace_storage.test.js` | 5 | 5 | ✓ |
| 5 | Web FSA Driver | `tests/unit/workspace_storage.test.js` | 5 | 5 | ✓ |
| 6 | Web IndexedDB Driver | `tests/unit/workspace_storage.test.js` | 5 | 5 | ✓ |
| 7 | Design File Scanning (.voo/.fig/.psd/.svg) | `tests/unit/workspace_storage.test.js` | 5 | 5 | ✓ |
| 8 | Onboarding Workspace Step | `tests/unit/onboarding_workspace_guide.test.js` | 5 | 5 | ✓ |
| 9 | Onboarding First-Launch Gate | `tests/unit/onboarding_workspace_guide.test.js` | 5 | 5 | ✓ |
| 10 | Onboarding Skip & Defaults | `tests/unit/onboarding_workspace_guide.test.js` | 5 | 5 | ✓ |
| 11 | Settings Drawer Workspace Section | `tests/unit/settings_workspace.test.js` | 5 | 5 | ✓ |
| 12 | Settings Keys & Synchronized Events | `tests/unit/settings_workspace.test.js` | 5 | 5 | ✓ |
| 13 | WelcomeDashboard Workspace Header | `tests/unit/workspace_dashboard_integration.test.js` | 5 | 5 | ✓ |
| 14 | WelcomeDashboard Live Listing | `tests/unit/workspace_dashboard_integration.test.js` | 5 | 5 | ✓ |
| 15 | Star & Favorites Persistence | `tests/unit/workspace_dashboard_integration.test.js` | 5 | 5 | ✓ |
| 16 | Disk File Renaming | `tests/unit/workspace_dashboard_integration.test.js` | 5 | 5 | ✓ |
| 17 | Trash & Permanent Delete | `tests/unit/workspace_dashboard_integration.test.js` | 5 | 5 | ✓ |
| 18 | Default Save Location | `tests/unit/workspace_dashboard_integration.test.js` | 5 | 5 | ✓ |

## Test Runner
- `npm test`: Runs Vitest across all unit and integration test suites.
- `npm run lint:design`: Verifies Design.md tokens compliance.
- `npm run build`: Bundles production assets.
- `VOO_DEPLOY_TARGET=la scripts/deploy-editor.sh`: Deploys to `103.114.160.86` and verifies live HTTP 200.
