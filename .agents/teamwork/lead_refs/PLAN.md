# VOO Design Native — 1:1 UI Parity Plan (Lead brief)

Workspace: /Users/tt/teamwork_projects/voo_design
Target: /Users/tt/teamwork_projects/voo_design/native_studio  (pure AppKit + CoreGraphics + Metal, no 3rd party)
Reference (live web app screenshots at 1440x900): `../lead_refs/` (relative to this file)
Deliverable: native `.app` built by `native_studio/build.sh`, plus test suite `native_studio/tests/run_tests.sh` (must stay 100% green).

## Golden rule
Do NOT modify files outside your assigned write scope. Lead owns:
`Sources/UI/WindowController.swift`, `TitleBar.swift`, `ToolRail.swift`, `Inspector.swift`,
`AccessibilityCatalog.swift`, `Main.swift`, and `build.sh` (unless your task says so).

Use only AppKit/CoreGraphics/Foundation. Custom-draw with NSBezierPath/CGContext; no SwiftUI.
Reuse: `ThemeTokens`, `ThemeFonts`, `VooIconFactory` (Sources/UI/Icons.swift), `NSColor(hex:)`.
Every interactive control gets `setAccessibilityIdentifier(...)`, role + label.
All new types/functions `public`. Swift 6, macOS 14 target, `-O` build.

## Live web reference screenshots
- web_dashboard_full.png — welcome/dashboard (mint-to-black title bar, doc tab, workspace bar, pills, prompt, import cards, recents)
- web_dash_starred.png / web_dash_trash.png / web_dash_designsystems.png / web_dash_shortcuts.png — dashboard tab contents
- web_editor.png — editor empty state (floating tool rail top-center, Layers card left, bottom-left page pill, bottom-center zoom bar, bottom-right purple FAB; NO right properties card, NO island bar when nothing selected)
- web_editor_rect2.png — editor with rectangle selected (right PROPERTIES card, bottom island bar with "Ask AI to modify @Shape..." + Vectorize / Boolean / Style Transfer)
- web_editor_ai.png — AI agent side panel open (376px right column, editor shell shrinks)
- web_onboarding.png / web_onboarding_step2/3/4.png — 4-step onboarding modal (960x655 split: cover art left 315 wide, 4-segment progress, cards, footer)
- web_onboarding_step2.png — local agent cards (Claude Code default, OpenAI Codex, Google Antigravity CLI)
- web_onboarding_step3.png — environment probe / transport status / install command
- web_onboarding_step4.png — ready summary + "进入画布工作台"

## Layout metrics (1440x900 window, title bar 40)
- Editor shell: x=2, y=41, w=1436, h=857; 1px mint border; radius 14.
- Tool rail pill: top center, y≈59, h=52; 11 icons + VOO avatar; native keeps its 8 canonical tools + VOO avatar.
- Layers card: x=16, w=260, h≈228, vertically centered (top≈355).
- Properties card: right≈1424 (16 right), w=260, h≈445, vertically centered (top≈245). Only visible with a selection.
- Page pill "Design 1 1/1": x=16, bottom 16, h=32, radius 16.
- Zoom bar (undo, redo, grid, eye, +, 58%, −): centered, bottom 16, h=32, radius 16.
- Island bar (only with selection): centered, bottom ≈141, h=32, radius 16 — icons + "Ask AI to modify @Shape..." + Vectorize / Boolean / Style Transfer.
- AI FAB: right 16, bottom 16, 44x44 purple circle; hidden when the agent panel is open.
- Agent panel: 376 wide, right side outside editor shell; editor shell shrinks; bg #0c0c0c, radius 16.
- Onboarding modal: 960x655 centered under title bar; radius 24; scrim rgba(0,0,0,0.55).

## Theme tokens (already in Theme.swift)
surface #171717 / raised #262626 / stage #0f0f0f; mint #b2ffd6 / #a7ffd4; purple #E5B2FF;
text white / #b3b3b3 / #737373; borders white 6–10%.

## Build / verify discipline
- Type-check your file(s) without touching build/:
  `cd native_studio && swiftc -typecheck -target arm64-apple-macosx14.0 -sdk $(xcrun --show-sdk-path) -framework AppKit Sources/UI/Theme.swift Sources/UI/Icons.swift Sources/UI/AccessibilityCatalog.swift <yourfile>.swift`
  (add other deps as needed; ignore files that pull in the whole app).
- Never run `./build.sh` while other agents are editing — Lead builds at integration points.
- Do not edit tests. Existing 214 tests must stay green.
- Report back: files written, public API, what you verified, known gaps.

## Coordination
- Write only your scope; mark shared task in_progress when starting, complete when done.
- If you need a token/icon/method you don't have, add a private helper in YOUR file; don't edit Icons.swift/Theme.swift.
- Keep all new NSView classes `public` and constructible with `init(frame:)` + `required init?(coder:)`.
