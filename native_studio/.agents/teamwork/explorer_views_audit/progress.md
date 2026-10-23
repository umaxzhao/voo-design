# Progress — Views Icon Usage Auditor

Last visited: 2026-10-21T14:23:00Z

- [x] Initialized DISPATCH.md, BRIEFING.md, and progress.md
- [x] Inspect canonical Lucide icons in `../src/canvas/icons.jsx`
- [x] Inspect existing `VooIconFactory` in `Sources/UI/Icons.swift`
- [x] Deep-dive audit: `Sources/UI/PropertiesPanelView.swift` (`PropertiesGlyphFactory` & inline)
- [x] Deep-dive audit: `Sources/UI/LayersPanel.swift` (`LayersGlyphDrawing` & layer icons)
- [x] Deep-dive audit: `Sources/UI/WelcomeDashboardView.swift` (private `draw*Icon` & inline)
- [x] Deep-dive audit: `Sources/UI/WindowController.swift` (toolbar & menus, isolated `systemSymbolName`)
- [x] Codebase grep & audit: `Sources/UI/ToolRail.swift`, `ContextBar.swift`, `TitleBar.swift`, `CanvasStageView.swift`, etc.
- [x] Audit for `NSImage(systemSymbolName:)`, `NSImage(named:)`, custom `NSBezierPath`/`CGPath`
- [x] Compile comprehensive mapping table
- [x] Write `views_audit_report.md`
- [x] Write `handoff.md`
- [ ] Send completion message to orchestrator
