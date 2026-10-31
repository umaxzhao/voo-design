//
//  UIParityTests.swift
//  native_studio
//
//  Opaque-box acceptance tests for the new 1:1 VOO Design UI surfaces:
//    • AppTitleBar tab bar (title pill, close/plus/settings, save/open)
//    • ToolRail (8 canonical tools + VOO brand avatar)
//    • EditorChrome (page switch pill, bottom zoom bar, AI FAB, context island)
//    • Inspector properties-card visibility
//    • AgentPanelView / AgentComposerView
//    • OnboardingGuideView (step clamp, launch policy, footer callbacks)
//    • WelcomeDashboardView (construction at both reference sizes + target wiring)
//
//  Every test is deterministic and headless: AppKit is already initialised by
//  tests/main.swift. UserDefaults keys and environment overrides touched by the
//  onboarding tests are always restored by a `defer` in the same closure.
//

import Foundation
import CoreGraphics
import AppKit
import Darwin
import UniformTypeIdentifiers

// MARK: - Mock Delegates

private final class UIParityTitleBarDelegate: AppTitleBarDelegate {
    var changedTitles: [String] = []
    var undoCount = 0
    var redoCount = 0
    var exportCount = 0
    var zoomClickCount = 0
    var dashboardToggleCount = 0
    var newProjectCount = 0
    var closeProjectCount = 0
    var settingsCount = 0
    var openDocumentCount = 0

    func titleBar(_ titleBar: AppTitleBar, didChangeTitle newTitle: String) {
        changedTitles.append(newTitle)
    }

    func titleBarDidRequestUndo(_ titleBar: AppTitleBar) { undoCount += 1 }
    func titleBarDidRequestRedo(_ titleBar: AppTitleBar) { redoCount += 1 }
    func titleBarDidRequestExport(_ titleBar: AppTitleBar) { exportCount += 1 }
    func titleBarDidClickZoom(_ titleBar: AppTitleBar) { zoomClickCount += 1 }
    func titleBarDidToggleDashboard(_ titleBar: AppTitleBar) { dashboardToggleCount += 1 }
    func titleBarDidRequestNewProject(_ titleBar: AppTitleBar) { newProjectCount += 1 }
    func titleBarDidRequestCloseProject(_ titleBar: AppTitleBar) { closeProjectCount += 1 }
    func titleBarDidRequestSettings(_ titleBar: AppTitleBar) { settingsCount += 1 }
    func titleBarDidRequestOpenDocument(_ titleBar: AppTitleBar) { openDocumentCount += 1 }
}

private final class UIParityStudioDelegate: StudioDelegate {
    var selectedTools: [StudioToolType] = []
    var zoomChanges: [CGFloat] = []
    var undoRequests = 0
    var redoRequests = 0

    func didSelectTool(_ tool: StudioToolType) { selectedTools.append(tool) }
    func didChangeZoom(_ zoom: CGFloat) { zoomChanges.append(zoom) }
    func didRequestUndo() { undoRequests += 1 }
    func didRequestRedo() { redoRequests += 1 }
}

// MARK: - Test Suite

public class UIParityTests {

    public static func registerTests() {
        let registry = TestRegistry.shared

        registerTitleBarTests(registry)
        registerToolRailTests(registry)
        registerEditorChromeTests(registry)
        registerInspectorTests(registry)
        registerAgentPanelTests(registry)
        registerOnboardingTests(registry)
        registerWelcomeDashboardTests(registry)
        registerCrossFeatureTests(registry)
        registerRound3Tests(registry)
        registerInteractionRound4Tests(registry)
        registerRound5Tests(registry)
        registerSpacingRound6Tests(registry)
    }

    // =====================================================================
    // MARK: - Shared Helpers
    // =====================================================================

    private static func makeTitleBar(width: CGFloat = 1440) -> AppTitleBar {
        let bar = AppTitleBar(frame: NSRect(x: 0, y: 0, width: width, height: 40))
        bar.layoutSubtreeIfNeeded()
        return bar
    }

    private static func findView(_ root: NSView, id: String) -> NSView? {
        for subview in root.subviews {
            if subview.accessibilityIdentifier() == id {
                return subview
            }
            if let match = findView(subview, id: id) {
                return match
            }
        }
        return nil
    }

    private static func requireView(
        _ root: NSView,
        id: String,
        file: String = #file,
        line: Int = #line
    ) throws -> NSView {
        guard let view = findView(root, id: id) else {
            throw TestFailure(message: "Missing view with accessibility identifier '\(id)'", file: file, line: line)
        }
        return view
    }

    private static func requireButton(
        _ root: NSView,
        id: String,
        file: String = #file,
        line: Int = #line
    ) throws -> NSButton {
        let view = try requireView(root, id: id, file: file, line: line)
        guard let button = view as? NSButton else {
            throw TestFailure(message: "View '\(id)' is not an NSButton", file: file, line: line)
        }
        return button
    }

    private static func findFields(_ root: NSView) -> [NSTextField] {
        var fields: [NSTextField] = []
        for subview in root.subviews {
            if let field = subview as? NSTextField { fields.append(field) }
            fields.append(contentsOf: findFields(subview))
        }
        return fields
    }

    /// Deterministic headless snapshot: renders the given views into an
    /// offscreen bitmap. Any drawing crash (bad path, missing context) fails
    /// the test by crashing the runner, so reaching the assertions proves the
    /// drawing code is safe.
    @discardableResult
    private static func renderSnapshot(
        size: NSSize,
        views: [NSView],
        file: String = #file,
        line: Int = #line
    ) throws -> NSBitmapImageRep {
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: max(1, Int(size.width)),
            pixelsHigh: max(1, Int(size.height)),
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else {
            throw TestFailure(message: "Failed to allocate offscreen bitmap", file: file, line: line)
        }
        guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
            throw TestFailure(message: "Failed to create offscreen graphics context", file: file, line: line)
        }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = context
        for view in views {
            view.displayIgnoringOpacity(view.bounds, in: context)
        }
        NSGraphicsContext.restoreGraphicsState()
        return bitmap
    }

    private static func resetOnboardingState() {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: OnboardingGuideView.completedVersionKey)
        defaults.removeObject(forKey: OnboardingGuideView.agentProviderKey)
        unsetenv(OnboardingGuideView.skipEnvironmentKey)
    }

    // =====================================================================
    // MARK: - 1. AppTitleBar Tab Bar (7 tests)
    // =====================================================================

    private static func registerTitleBarTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-TitleBar", name: "test_UIParity_TitleBar_DefaultDocumentTitleField") {
            let bar = makeTitleBar()
            try TestAssertions.assertEqual(bar.docTitleField.stringValue, "Untitled.voo", "Default tab title must be Untitled.voo")
            try TestAssertions.assertEqual(bar.state.documentTitle, "Untitled.voo")
            try TestAssertions.assertEqual(bar.docTitleField.accessibilityIdentifier(), AccessibilityCatalog.docTitle)
            try TestAssertions.assertEqual(bar.accessibilityIdentifier(), AccessibilityCatalog.titleBar)
            try TestAssertions.assertEqual(bar.accessibilityIdentifier(), "AppTitleBar")
            try TestAssertions.assertTrue(bar.zoomIndicator.isHidden, "Legacy zoom badge stays hidden; bottom zoom bar owns zoom")
        }

        registry.register(tier: 1, feature: "UIParity-TitleBar", name: "test_UIParity_TitleBar_SetDocumentTitleSyncsStateAndDisplay") {
            let bar = makeTitleBar()
            bar.setDocumentTitle("Landing.voo")
            try TestAssertions.assertEqual(bar.docTitleField.stringValue, "Landing.voo")
            try TestAssertions.assertEqual(bar.state.documentTitle, "Landing.voo")
            try TestAssertions.assertEqual(bar.state.displayTitle, "Landing", "The tab pill strips the .voo extension")
            try TestAssertions.assertEqual(bar.state.formattedZoom, "100%")
        }

        registry.register(tier: 1, feature: "UIParity-TitleBar", name: "test_UIParity_TitleBar_DashboardModeShowsUntitledAndHidesEditorActions") {
            let bar = makeTitleBar()
            bar.setDocumentTitle("Moon.voo")
            try TestAssertions.assertEqual(bar.docTitleField.stringValue, "Moon.voo")
            try TestAssertions.assertFalse(bar.saveButton.isHidden)
            try TestAssertions.assertFalse(bar.openButton.isHidden)

            bar.isDashboardMode = true
            try TestAssertions.assertEqual(bar.docTitleField.stringValue, "Untitled", "Dashboard tab shows a generic Untitled document")
            try TestAssertions.assertEqual(bar.state.documentTitle, "Moon.voo", "Dashboard mode must not lose the loaded project title")
            try TestAssertions.assertTrue(bar.saveButton.isHidden, "Save is editor-only")
            try TestAssertions.assertTrue(bar.openButton.isHidden, "Open is editor-only")
            try TestAssertions.assertFalse(bar.tabCloseButton.isHidden)
            try TestAssertions.assertFalse(bar.tabPlusButton.isHidden)
            try TestAssertions.assertFalse(bar.settingsButton.isHidden)

            bar.setDocumentTitle("NewProject.voo")
            try TestAssertions.assertEqual(bar.docTitleField.stringValue, "Untitled", "Dashboard mode keeps showing Untitled after a title change")
            try TestAssertions.assertEqual(bar.state.documentTitle, "NewProject.voo")

            bar.isDashboardMode = false
            try TestAssertions.assertEqual(bar.docTitleField.stringValue, "NewProject.voo")
            try TestAssertions.assertFalse(bar.saveButton.isHidden)
            try TestAssertions.assertFalse(bar.openButton.isHidden)
        }

        registry.register(tier: 1, feature: "UIParity-TitleBar", name: "test_UIParity_TitleBar_SaveOpenButtonTitlesAndIdentifiers") {
            let bar = makeTitleBar()
            try TestAssertions.assertEqual(bar.saveButton.title, "保存")
            try TestAssertions.assertEqual(bar.openButton.title, "打开")
            try TestAssertions.assertTrue(bar.saveButton.isWhitePill, "Save is the white primary pill")
            try TestAssertions.assertFalse(bar.openButton.isWhitePill, "Open is the ghost secondary button")
            try TestAssertions.assertEqual(bar.saveButton.accessibilityIdentifier(), "title_bar_save_button")
            try TestAssertions.assertEqual(bar.openButton.accessibilityIdentifier(), "title_bar_open_button")
        }

        registry.register(tier: 1, feature: "UIParity-TitleBar", name: "test_UIParity_TitleBar_TabBarButtonsFireDelegateCallbacks") {
            let bar = makeTitleBar()
            let delegate = UIParityTitleBarDelegate()
            bar.delegate = delegate

            bar.tabCloseButton.performClick(nil)
            try TestAssertions.assertEqual(delegate.closeProjectCount, 1, "Tab X must request close project")

            bar.tabPlusButton.performClick(nil)
            try TestAssertions.assertEqual(delegate.newProjectCount, 1, "Tab + must request new project")

            bar.settingsButton.performClick(nil)
            try TestAssertions.assertEqual(delegate.settingsCount, 1, "Settings bolt must request settings")

            try TestAssertions.assertEqual(delegate.newProjectCount + delegate.closeProjectCount + delegate.settingsCount, 3)
        }

        registry.register(tier: 1, feature: "UIParity-TitleBar", name: "test_UIParity_TitleBar_BrandSaveAndOpenActions") {
            let bar = makeTitleBar()
            let delegate = UIParityTitleBarDelegate()
            bar.delegate = delegate
            try TestAssertions.assertFalse(bar.state.exportTriggered)

            bar.brandLogoButton.performClick(nil)
            try TestAssertions.assertEqual(delegate.dashboardToggleCount, 1, "Brand block toggles the dashboard")

            bar.saveButton.performClick(nil)
            try TestAssertions.assertEqual(delegate.exportCount, 1, "Save fires the export callback")
            try TestAssertions.assertTrue(bar.state.exportTriggered)

            bar.openButton.performClick(nil)
            try TestAssertions.assertEqual(delegate.openDocumentCount, 1, "Open requests the document picker")
            try TestAssertions.assertEqual(delegate.dashboardToggleCount, 1, "Open no longer toggles the dashboard")

            // The legacy undo/redo/export anchors stay wired for the old suites.
            bar.undoButton.performClick(nil)
            bar.redoButton.performClick(nil)
            try TestAssertions.assertEqual(delegate.undoCount, 1)
            try TestAssertions.assertEqual(delegate.redoCount, 1)
        }

        registry.register(tier: 1, feature: "UIParity-TitleBar", name: "test_UIParity_TitleBar_ControlAccessibilityIdentifiers") {
            let bar = makeTitleBar()
            try TestAssertions.assertEqual(bar.docTitleField.accessibilityIdentifier(), "AppTitleBar.DocTitle")
            try TestAssertions.assertEqual(bar.tabCloseButton.accessibilityIdentifier(), "TitleBar.TabClose")
            try TestAssertions.assertEqual(bar.tabPlusButton.accessibilityIdentifier(), "TitleBar.TabNew")
            try TestAssertions.assertEqual(bar.settingsButton.accessibilityIdentifier(), "title_bar_settings_button")
            try TestAssertions.assertEqual(bar.brandLogoButton.accessibilityIdentifier(), "title_bar_brand_logo")
            try TestAssertions.assertEqual(bar.zoomIndicator.accessibilityIdentifier(), AccessibilityCatalog.zoomIndicator)
            try TestAssertions.assertEqual(bar.undoButton.accessibilityIdentifier(), AccessibilityCatalog.undoButton)
            try TestAssertions.assertEqual(bar.redoButton.accessibilityIdentifier(), AccessibilityCatalog.redoButton)
            try TestAssertions.assertEqual(bar.exportButton.accessibilityIdentifier(), AccessibilityCatalog.exportButton)
        }
    }

    // =====================================================================
    // MARK: - 2. ToolRail (4 tests)
    // =====================================================================

    private static func registerToolRailTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-ToolRail", name: "test_UIParity_ToolRail_EightCanonicalToolButtons") {
            let rail = ToolRailView()
            try TestAssertions.assertEqual(rail.toolButtons.count, 8)
            try TestAssertions.assertEqual(Set(rail.toolButtons.keys), Set(StudioToolType.allCases))
            try TestAssertions.assertEqual(rail.state.activeTool, .move, "Move is the default tool")

            for tool in StudioToolType.allCases {
                guard let button = rail.toolButtons[tool] else {
                    throw TestFailure(message: "Missing tool button for \(tool.rawValue)", file: #file, line: #line)
                }
                try TestAssertions.assertEqual(button.accessibilityIdentifier(), tool.accessibilityIdentifier)
                try TestAssertions.assertEqual(button.toolType, tool)
                try TestAssertions.assertNotNil(button.toolTip)
            }
            try TestAssertions.assertEqual(rail.accessibilityIdentifier(), "ToolRail")
            try TestAssertions.assertTrue(rail.toolButtons[.move]?.isToolActive == true, "Active tool has the white circle treatment")
        }

        registry.register(tier: 1, feature: "UIParity-ToolRail", name: "test_UIParity_ToolRail_BrandAvatarFiresOnBrandAvatarTapped") {
            let rail = ToolRailView()
            var activations = 0
            rail.onBrandAvatarTapped = { activations += 1 }

            try TestAssertions.assertEqual(rail.brandAvatarButton.accessibilityIdentifier(), "ToolRail.BrandAvatar")
            try TestAssertions.assertEqual(rail.brandAvatarButton.accessibilityLabel(), "VOO Assistant")

            rail.brandAvatarButton.performClick(nil)
            try TestAssertions.assertEqual(activations, 1, "VOO medallion opens the AI agent")

            // The direct closure must stay wired to the button as well.
            rail.brandAvatarButton.onClick?()
            try TestAssertions.assertEqual(activations, 2)
        }

        registry.register(tier: 1, feature: "UIParity-ToolRail", name: "test_UIParity_ToolRail_ToolButtonSelectionUpdatesStateAndDelegate") {
            let rail = ToolRailView()
            let delegate = UIParityStudioDelegate()
            rail.delegate = delegate

            rail.shapesToolButton.performClick(nil)
            try TestAssertions.assertEqual(rail.state.activeTool, .shapes)
            try TestAssertions.assertEqual(delegate.selectedTools, [.shapes])
            try TestAssertions.assertTrue(rail.toolButtons[.shapes]?.isToolActive == true)
            try TestAssertions.assertFalse(rail.toolButtons[.move]?.isToolActive == true)

            rail.textToolButton.performClick(nil)
            try TestAssertions.assertEqual(rail.state.activeTool, .text)
            try TestAssertions.assertEqual(delegate.selectedTools, [.shapes, .text])
            try TestAssertions.assertTrue(rail.toolButtons[.text]?.isToolActive == true)
            try TestAssertions.assertFalse(rail.toolButtons[.shapes]?.isToolActive == true)

            // Every canonical accessor is backed by a real button.
            try TestAssertions.assertNotNil(rail.moveToolButton)
            try TestAssertions.assertNotNil(rail.nodeToolButton)
            try TestAssertions.assertNotNil(rail.penToolButton)
            try TestAssertions.assertNotNil(rail.brushToolButton)
            try TestAssertions.assertNotNil(rail.eraserToolButton)
            try TestAssertions.assertNotNil(rail.artboardToolButton)
        }

        registry.register(tier: 1, feature: "UIParity-ToolRail", name: "test_UIParity_ToolRail_ShortcutKeysUpdateActiveTool") {
            let rail = ToolRailView()
            try TestAssertions.assertEqual(rail.state.handleShortcutKey("v"), .move)
            try TestAssertions.assertEqual(rail.state.activeTool, .move)
            try TestAssertions.assertEqual(rail.state.handleShortcutKey("r"), .shapes)
            try TestAssertions.assertEqual(rail.state.activeTool, .shapes)
            try TestAssertions.assertEqual(rail.state.handleShortcutKey("t"), .text)
            try TestAssertions.assertEqual(rail.state.activeTool, .text)
            try TestAssertions.assertEqual(rail.state.handleShortcutKey("a"), .artboard)
            try TestAssertions.assertEqual(rail.state.activeTool, .artboard)
            try TestAssertions.assertNil(rail.state.handleShortcutKey("z"), "Unknown shortcut is ignored")

            // Pen shortcut cycles its sub-tool mode.
            try TestAssertions.assertEqual(rail.state.handleShortcutKey("p"), .pen)
            let firstSubTool = rail.state.currentPenSubTool
            try TestAssertions.assertEqual(rail.state.handleShortcutKey("p"), .pen)
            try TestAssertions.assertNotEqual(rail.state.currentPenSubTool, firstSubTool, "Repeated P cycles pen sub-tools")
        }
    }

    // =====================================================================
    // MARK: - 3. Editor Chrome (11 tests)
    // =====================================================================

    private static func registerEditorChromeTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_PageSwitcher_UpdateStateAndPreferredWidth") {
            let pill = PageSwitcherPillView(frame: NSRect(x: 0, y: 0, width: 160, height: 32))
            try TestAssertions.assertEqual(pill.pageName, "Design 1")
            try TestAssertions.assertEqual(pill.pageIndex, 1)
            try TestAssertions.assertEqual(pill.pageCount, 1)

            pill.update(pageName: "Design 3", pageIndex: 2, pageCount: 5)
            try TestAssertions.assertEqual(pill.pageName, "Design 3")
            try TestAssertions.assertEqual(pill.pageIndex, 2)
            try TestAssertions.assertEqual(pill.pageCount, 5)
            try TestAssertions.assertGreaterThan(pill.preferredWidth, CGFloat(0))
            try TestAssertions.assertGreaterThan(pill.intrinsicContentSize.width, CGFloat(0))
            try TestAssertions.assertEqual(pill.preferredSize.height, PageSwitcherPillView.preferredHeight)
            try TestAssertions.assertEqual(pill.accessibilityIdentifier(), "Editor.PageSwitcher")
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_PageSwitcher_ClampsIndicesAndFiresOnTap") {
            let pill = PageSwitcherPillView(frame: NSRect(x: 0, y: 0, width: 160, height: 32))
            pill.update(pageName: "Solo", pageIndex: -3, pageCount: 0)
            try TestAssertions.assertEqual(pill.pageIndex, 1, "Page index is clamped to >= 1")
            try TestAssertions.assertEqual(pill.pageCount, 1, "Page count is clamped to >= 1")
            try TestAssertions.assertEqual(pill.pageName, "Solo")
            try TestAssertions.assertGreaterThan(pill.preferredWidth, CGFloat(0))

            var taps = 0
            pill.onTap = { taps += 1 }
            let handled = pill.accessibilityPerformPress()
            try TestAssertions.assertTrue(handled, "Pill supports the accessibility press action")
            try TestAssertions.assertEqual(taps, 1, "Accessibility press opens the page menu")
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_ZoomBar_UpdateReflectsZoomAndHistoryState") {
            let bar = StudioBottomZoomBar(frame: NSRect(x: 0, y: 0, width: StudioBottomZoomBar.preferredWidth, height: StudioBottomZoomBar.preferredHeight))
            bar.layoutSubtreeIfNeeded()

            try TestAssertions.assertEqual(bar.zoomLabelButton.text, "100%")
            bar.update(zoom: 0.58, canUndo: true, canRedo: false)
            try TestAssertions.assertEqual(bar.zoomLabelButton.text, "58%", "Zoom text mirrors the 58% reference frame")
            try TestAssertions.assertApproxEqual(bar.zoom, 0.58)
            try TestAssertions.assertTrue(bar.canUndo)
            try TestAssertions.assertFalse(bar.canRedo)
            try TestAssertions.assertTrue(bar.undoButton.isEnabled)
            try TestAssertions.assertFalse(bar.redoButton.isEnabled, "Redo is dimmed while history is empty")

            // Values > 10 are interpreted as whole percentages.
            bar.update(zoom: 125, canUndo: false, canRedo: true)
            try TestAssertions.assertApproxEqual(bar.zoom, 1.25)
            try TestAssertions.assertEqual(bar.zoomLabelButton.text, "125%")
            try TestAssertions.assertFalse(bar.undoButton.isEnabled)
            try TestAssertions.assertTrue(bar.redoButton.isEnabled)
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_ZoomBar_DisabledHistoryButtonsBlockCallbacks") {
            let bar = StudioBottomZoomBar(frame: NSRect(x: 0, y: 0, width: StudioBottomZoomBar.preferredWidth, height: StudioBottomZoomBar.preferredHeight))
            var undoCount = 0
            var redoCount = 0
            bar.onUndo = { undoCount += 1 }
            bar.onRedo = { redoCount += 1 }

            bar.update(zoom: 1.0, canUndo: false, canRedo: false)
            bar.undoButton.performClick(nil)
            bar.redoButton.performClick(nil)
            try TestAssertions.assertEqual(undoCount, 0, "Disabled undo must not fire")
            try TestAssertions.assertEqual(redoCount, 0, "Disabled redo must not fire")

            bar.update(zoom: 1.0, canUndo: true, canRedo: true)
            bar.undoButton.performClick(nil)
            bar.redoButton.performClick(nil)
            try TestAssertions.assertEqual(undoCount, 1)
            try TestAssertions.assertEqual(redoCount, 1)
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_ZoomBar_ZoomGridVisibilityAndResetCallbacks") {
            let bar = StudioBottomZoomBar(frame: NSRect(x: 0, y: 0, width: StudioBottomZoomBar.preferredWidth, height: StudioBottomZoomBar.preferredHeight))
            var zoomInCount = 0
            var zoomOutCount = 0
            var zoomResetCount = 0
            var gridValues: [Bool] = []
            var visibilityValues: [Bool] = []
            bar.onZoomIn = { zoomInCount += 1 }
            bar.onZoomOut = { zoomOutCount += 1 }
            bar.onZoomReset = { zoomResetCount += 1 }
            bar.onGridToggle = { gridValues.append($0) }
            bar.onVisibilityToggle = { visibilityValues.append($0) }

            bar.zoomInButton.performClick(nil)
            bar.zoomOutButton.performClick(nil)
            try TestAssertions.assertEqual(zoomInCount, 1)
            try TestAssertions.assertEqual(zoomOutCount, 1)

            bar.gridButton.performClick(nil)
            try TestAssertions.assertTrue(bar.isGridEnabled)
            try TestAssertions.assertEqual(gridValues, [true])
            bar.gridButton.performClick(nil)
            try TestAssertions.assertFalse(bar.isGridEnabled)
            try TestAssertions.assertEqual(gridValues, [true, false])

            try TestAssertions.assertTrue(bar.isVisibilityEnabled, "Magnet/visibility starts enabled")
            bar.visibilityButton.performClick(nil)
            try TestAssertions.assertFalse(bar.isVisibilityEnabled)
            try TestAssertions.assertEqual(visibilityValues, [false])

            bar.update(zoom: 0.58, canUndo: true, canRedo: true)
            bar.zoomLabelButton.performClick(nil)
            try TestAssertions.assertEqual(zoomResetCount, 1)
            try TestAssertions.assertApproxEqual(bar.zoom, 1.0)
            try TestAssertions.assertEqual(bar.zoomLabelButton.text, "100%")
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_ZoomBarAndPagePill_AccessibilityAndMetrics") {
            let bar = StudioBottomZoomBar(frame: .zero)
            try TestAssertions.assertEqual(bar.accessibilityIdentifier(), "Editor.ZoomBar")
            try TestAssertions.assertEqual(bar.undoButton.accessibilityIdentifier(), "Editor.ZoomBar.Undo")
            try TestAssertions.assertEqual(bar.redoButton.accessibilityIdentifier(), "Editor.ZoomBar.Redo")
            try TestAssertions.assertEqual(bar.gridButton.accessibilityIdentifier(), "Editor.ZoomBar.GridToggle")
            try TestAssertions.assertEqual(bar.visibilityButton.accessibilityIdentifier(), "Editor.ZoomBar.VisibilityToggle")
            try TestAssertions.assertEqual(bar.zoomInButton.accessibilityIdentifier(), "Editor.ZoomBar.ZoomIn")
            try TestAssertions.assertEqual(bar.zoomOutButton.accessibilityIdentifier(), "Editor.ZoomBar.ZoomOut")
            try TestAssertions.assertEqual(bar.zoomLabelButton.accessibilityIdentifier(), "Editor.ZoomBar.ZoomReset")
            try TestAssertions.assertEqual(bar.preferredSize.width, StudioBottomZoomBar.preferredWidth)
            try TestAssertions.assertEqual(bar.preferredSize.height, StudioBottomZoomBar.preferredHeight)

            let pill = PageSwitcherPillView(frame: .zero)
            try TestAssertions.assertEqual(pill.accessibilityIdentifier(), "Editor.PageSwitcher")
            try TestAssertions.assertNotNil(pill.accessibilityLabel())
            try TestAssertions.assertNotNil(pill.accessibilityHelp())
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_AIFloatingButton_FiresOnActivate") {
            let button = VooAIFloatingButton(frame: NSRect(x: 0, y: 0, width: 44, height: 44))
            var activations = 0
            button.onActivate = { activations += 1 }

            try TestAssertions.assertEqual(button.accessibilityIdentifier(), "Editor.AIAssistantButton")
            try TestAssertions.assertEqual(button.intrinsicContentSize.width, VooAIFloatingButton.preferredSize)
            try TestAssertions.assertEqual(button.intrinsicContentSize.height, VooAIFloatingButton.preferredSize)

            button.performClick(nil)
            try TestAssertions.assertEqual(activations, 1, "Clicking the FAB opens the agent panel")

            let handled = button.accessibilityPerformPress()
            try TestAssertions.assertTrue(handled)
            try TestAssertions.assertEqual(activations, 2, "Accessibility press also opens the agent panel")
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_ContextIsland_VisibilityTracksSelectionLabel") {
            let island = ContextIslandBar(frame: NSRect(x: 0, y: 0, width: 900, height: 36))
            try TestAssertions.assertEqual(island.accessibilityIdentifier(), "Editor.IslandBar")
            try TestAssertions.assertNil(island.selectionLabel)

            island.update(selectionLabel: nil)
            try TestAssertions.assertTrue(island.isHidden, "No selection => island hidden")
            try TestAssertions.assertNil(island.selectionLabel)
            try TestAssertions.assertEqual(island.promptButton.placeholderText, "Ask AI to modify @Shape...")

            island.update(selectionLabel: "Rectangle")
            try TestAssertions.assertFalse(island.isHidden, "Selection shows the island")
            try TestAssertions.assertEqual(island.selectionLabel, "Rectangle")
            try TestAssertions.assertEqual(island.promptButton.placeholderText, "Ask AI to modify @Rectangle...")
            try TestAssertions.assertTrue(
                island.promptButton.accessibilityLabel()?.contains("Rectangle") == true,
                "Prompt accessibility label tracks the selected layer"
            )

            island.update(selectionLabel: "")
            try TestAssertions.assertTrue(island.isHidden, "Empty label behaves like no selection")
            try TestAssertions.assertEqual(island.promptButton.placeholderText, "Ask AI to modify @Shape...")
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_ContextIsland_GlyphButtonsFireOnGlyphAction") {
            let island = ContextIslandBar(frame: NSRect(x: 0, y: 0, width: 900, height: 36))
            island.update(selectionLabel: "Shape")
            var received: [EditorChromeGlyph] = []
            island.onGlyphAction = { received.append($0) }

            try TestAssertions.assertEqual(island.glyphButtons.count, 8)
            try TestAssertions.assertEqual(island.glyphButtons[0].accessibilityIdentifier(), "Editor.IslandBar.Select")
            try TestAssertions.assertEqual(island.glyphButtons[6].accessibilityIdentifier(), "Editor.IslandBar.Delete")
            try TestAssertions.assertEqual(island.glyphButtons[7].accessibilityIdentifier(), "Editor.IslandBar.Component")

            island.glyphButtons[6].performClick(nil)
            island.glyphButtons[1].performClick(nil)
            island.glyphButtons[7].performClick(nil)
            try TestAssertions.assertEqual(received, [.trash, .rotate, .diamond])
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_ContextIsland_PromptSendAndQuickActionCallbacks") {
            let island = ContextIslandBar(frame: NSRect(x: 0, y: 0, width: 900, height: 36))
            island.update(selectionLabel: "Rectangle")

            var prompts: [String] = []
            var quickActions: [String] = []
            island.onAskAI = { prompts.append($0) }
            island.onQuickAction = { quickActions.append($0) }

            try TestAssertions.assertFalse(island.sendButton.isEnabled, "Send starts disabled while the prompt is empty")
            try TestAssertions.assertEqual(island.promptText, "")

            island.promptText = "Make it blue"
            try TestAssertions.assertEqual(island.promptText, "Make it blue")
            try TestAssertions.assertTrue(island.sendButton.isEnabled, "Non-empty prompt enables send")
            island.sendButton.performClick(nil)
            try TestAssertions.assertEqual(prompts, ["Make it blue"])

            island.sparkleButton.performClick(nil)
            try TestAssertions.assertEqual(prompts, ["Make it blue", "Make it blue"], "The sparkle also sends the current prompt")

            island.promptText = ""
            try TestAssertions.assertFalse(island.sendButton.isEnabled, "Clearing the prompt disables send again")

            try TestAssertions.assertEqual(ContextIslandBar.quickActionTitles, ["Vectorize", "Boolean", "Style Transfer"])
            try TestAssertions.assertEqual(island.quickActionChips.count, 3)
            try TestAssertions.assertEqual(island.quickActionChips[0].accessibilityIdentifier(), "Editor.IslandBar.Action.Vectorize")
            island.quickActionChips[0].performClick(nil)
            island.quickActionChips[2].performClick(nil)
            try TestAssertions.assertEqual(quickActions, ["Vectorize", "Style Transfer"])
        }

        registry.register(tier: 1, feature: "UIParity-EditorChrome", name: "test_UIParity_EditorChromeGlyphs_CoverageAndRender") {
            // Every chrome glyph must be present in the catalogue...
            try TestAssertions.assertEqual(EditorChromeGlyph.allCases.count, 18)
            let expected: [EditorChromeGlyph] = [
                .page, .chevronDown, .undo, .redo, .grid, .magnet, .plus, .minus,
                .marquee, .rotate, .flipVertical, .flipHorizontal, .copy, .lock,
                .trash, .diamond, .sparkle, .arrowUp
            ]
            try TestAssertions.assertEqual(Set(EditorChromeGlyph.allCases), Set(expected))

            // ...and each one must draw into an offscreen context without crashing.
            let glyphs = EditorChromeGlyph.allCases
            let width = CGFloat(glyphs.count) * 24.0
            guard let bitmap = NSBitmapImageRep(
                bitmapDataPlanes: nil,
                pixelsWide: Int(width),
                pixelsHigh: 24,
                bitsPerSample: 8,
                samplesPerPixel: 4,
                hasAlpha: true,
                isPlanar: false,
                colorSpaceName: .deviceRGB,
                bytesPerRow: 0,
                bitsPerPixel: 0
            ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
                throw TestFailure(message: "Failed to create glyph render context", file: #file, line: #line)
            }
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = context
            for (index, glyph) in glyphs.enumerated() {
                glyph.draw(
                    in: CGRect(x: CGFloat(index) * 24.0, y: 0, width: 24, height: 24),
                    color: .white,
                    strokeWidth: 2.0
                )
            }
            NSGraphicsContext.restoreGraphicsState()
            try TestAssertions.assertEqual(bitmap.pixelsWide, Int(width))
            try TestAssertions.assertEqual(bitmap.pixelsHigh, 24)
        }
    }

    // =====================================================================
    // MARK: - 4. Inspector Visibility (3 tests)
    // =====================================================================

    private static func registerInspectorTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Inspector", name: "test_UIParity_Inspector_PropertiesVisibleByDefault") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            inspector.layoutSubtreeIfNeeded()

            try TestAssertions.assertEqual(inspector.accessibilityIdentifier(), "Inspector.Studio")
            try TestAssertions.assertTrue(inspector.arePropertiesVisible)
            try TestAssertions.assertFalse(inspector.propertiesCard.isHidden)
            try TestAssertions.assertFalse(inspector.layersPanel.isHidden, "Layers card is always visible")
            try TestAssertions.assertEqual(inspector.layersPanel.superview, inspector)
        }

        registry.register(tier: 1, feature: "UIParity-Inspector", name: "test_UIParity_Inspector_SetPropertiesVisibleTogglesCardAndFlag") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            inspector.layoutSubtreeIfNeeded()

            inspector.setPropertiesVisible(false)
            try TestAssertions.assertFalse(inspector.arePropertiesVisible)
            try TestAssertions.assertTrue(inspector.propertiesCard.isHidden)
            try TestAssertions.assertFalse(inspector.layersPanel.isHidden, "Hiding properties keeps the layers card visible")

            // Idempotent while already hidden.
            inspector.setPropertiesVisible(false)
            try TestAssertions.assertFalse(inspector.arePropertiesVisible)
            try TestAssertions.assertTrue(inspector.propertiesCard.isHidden)

            inspector.setPropertiesVisible(true)
            try TestAssertions.assertTrue(inspector.arePropertiesVisible)
            try TestAssertions.assertFalse(inspector.propertiesCard.isHidden)
        }

        registry.register(tier: 1, feature: "UIParity-Inspector", name: "test_UIParity_Inspector_LegacyPanelsRemainDescendants") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            inspector.layoutSubtreeIfNeeded()

            try TestAssertions.assertEqual(inspector.transformPanel.superview, inspector.propertiesCard)
            try TestAssertions.assertEqual(inspector.appearancePanel.superview, inspector.propertiesCard)
            try TestAssertions.assertNotNil(inspector.propertiesPanel)
            try TestAssertions.assertNotNil(inspector.transformPanel.accessibilityIdentifier())
            try TestAssertions.assertNotNil(inspector.appearancePanel.accessibilityIdentifier())

            // Hiding properties must not detach the legacy panels from the card.
            inspector.setPropertiesVisible(false)
            try TestAssertions.assertEqual(inspector.transformPanel.superview, inspector.propertiesCard)
            try TestAssertions.assertEqual(inspector.appearancePanel.superview, inspector.propertiesCard)
        }
    }

    // =====================================================================
    // MARK: - 5. Agent Panel (5 tests)
    // =====================================================================

    private static func makeAgentPanel() -> AgentPanelView {
        let panel = AgentPanelView(frame: NSRect(x: 0, y: 0, width: 376, height: 800))
        panel.layoutSubtreeIfNeeded()
        return panel
    }

    private static func registerAgentPanelTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-AgentPanel", name: "test_UIParity_AgentPanel_ComposerSubmitRoundtrip") {
            let panel = makeAgentPanel()
            var sent: [String] = []
            panel.onSend = { sent.append($0) }

            try TestAssertions.assertFalse(panel.composer.sendButton.isEnabled, "Empty composer keeps send disabled")
            panel.composer.text = "Draw a pricing card"
            try TestAssertions.assertFalse(panel.composer.textView.isHidden)
            try TestAssertions.assertTrue(panel.composer.sendButton.isEnabled, "Typed text enables send")

            panel.composer.submit()
            try TestAssertions.assertEqual(sent, ["Draw a pricing card"], "Composer forwards the trimmed prompt")
            try TestAssertions.assertEqual(panel.messageCount, 1, "Submit appends the user bubble")
            try TestAssertions.assertEqual(panel.composer.text, "", "Composer clears after submit")
            try TestAssertions.assertFalse(panel.composer.sendButton.isEnabled)
        }

        registry.register(tier: 1, feature: "UIParity-AgentPanel", name: "test_UIParity_AgentPanel_MessageCountIncrements") {
            let panel = makeAgentPanel()
            try TestAssertions.assertEqual(panel.messageCount, 0)

            panel.addUserMessage("Hello")
            try TestAssertions.assertEqual(panel.messageCount, 1)
            panel.addAgentMessage("Working on it")
            try TestAssertions.assertEqual(panel.messageCount, 2)

            panel.addUserMessage("   ")
            panel.addAgentMessage("")
            try TestAssertions.assertEqual(panel.messageCount, 2, "Blank messages are ignored")

            panel.clearConversation()
            try TestAssertions.assertEqual(panel.messageCount, 0)

            panel.addUserMessage("Again")
            try TestAssertions.assertEqual(panel.messageCount, 1)
            panel.newConversation()
            try TestAssertions.assertEqual(panel.messageCount, 0, "New chat clears the transcript")
        }

        registry.register(tier: 1, feature: "UIParity-AgentPanel", name: "test_UIParity_AgentPanel_HeaderCloseHistoryNewChatCallbacks") {
            let panel = makeAgentPanel()
            var closeCount = 0
            var historyCount = 0
            var newChatCount = 0
            panel.onClose = { closeCount += 1 }
            panel.onHistory = { historyCount += 1 }
            panel.onNewChat = { newChatCount += 1 }

            panel.header.collapseButton.performClick(nil)
            try TestAssertions.assertEqual(closeCount, 1)

            panel.header.historyButton.performClick(nil)
            try TestAssertions.assertEqual(historyCount, 1)

            panel.addUserMessage("First turn")
            try TestAssertions.assertEqual(panel.messageCount, 1)
            panel.header.newChatButton.performClick(nil)
            try TestAssertions.assertEqual(newChatCount, 1)
            try TestAssertions.assertEqual(panel.messageCount, 0, "Header + starts a fresh conversation")
        }

        registry.register(tier: 1, feature: "UIParity-AgentPanel", name: "test_UIParity_AgentPanel_AccessibilityIdentifiers") {
            let panel = makeAgentPanel()

            try TestAssertions.assertEqual(panel.accessibilityIdentifier(), "Agent.Panel")
            try TestAssertions.assertEqual(panel.header.accessibilityIdentifier(), "Agent.Header")
            try TestAssertions.assertEqual(panel.header.collapseButton.accessibilityIdentifier(), "Agent.Close")
            try TestAssertions.assertEqual(panel.header.historyButton.accessibilityIdentifier(), "Agent.History")
            try TestAssertions.assertEqual(panel.header.newChatButton.accessibilityIdentifier(), "Agent.NewChat")
            try TestAssertions.assertEqual(panel.composer.accessibilityIdentifier(), "Agent.Composer")
            try TestAssertions.assertEqual(panel.composer.textView.accessibilityIdentifier(), "Agent.Composer.Input")
            try TestAssertions.assertEqual(panel.composer.sendButton.accessibilityIdentifier(), "Agent.Send")

            // Derived subviews (scroll list and hero badge) are reachable in the hierarchy.
            try TestAssertions.assertNotNil(findView(panel, id: "Agent.Messages"))
            try TestAssertions.assertNotNil(findView(panel, id: "Agent.Badge"))
            try TestAssertions.assertNotNil(findView(panel, id: "Agent.Intro"))
        }

        registry.register(tier: 1, feature: "UIParity-AgentPanel", name: "test_UIParity_AgentPanel_ComposerGuardsEmptyAndHeaderStatus") {
            let panel = makeAgentPanel()
            var sent: [String] = []
            panel.onSend = { sent.append($0) }

            panel.composer.text = "   \n\t "
            panel.composer.submit()
            try TestAssertions.assertEqual(sent, [], "Whitespace-only prompts are ignored")
            try TestAssertions.assertEqual(panel.messageCount, 0)

            panel.composer.text = "  Trimmed  "
            panel.composer.submit()
            try TestAssertions.assertEqual(sent, ["Trimmed"])

            panel.setModelStatus("● Flash ACTIVE")
            try TestAssertions.assertEqual(panel.header.modelStatusText, "Flash ACTIVE", "Status dot prefix is stripped")
            panel.setTitle("Landing.voo")
            try TestAssertions.assertEqual(panel.header.titleText, "Landing.voo")
        }
    }

    // =====================================================================
    // MARK: - 6. Onboarding Guide (6 tests)
    // =====================================================================

    private static func makeOnboarding() -> OnboardingGuideView {
        OnboardingGuideView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900))
    }

    private static func registerOnboardingTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Onboarding", name: "test_UIParity_Onboarding_PresentClampsStepAndDismissHides") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            let guide = makeOnboarding()
            try TestAssertions.assertEqual(guide.currentStep, 0)
            try TestAssertions.assertEqual(guide.accessibilityIdentifier(), "Onboarding.Guide")

            guide.present(step: -7)
            try TestAssertions.assertEqual(guide.currentStep, 0, "Negative step clamps to 0")
            try TestAssertions.assertFalse(guide.isHidden, "Presenting shows the overlay")

            guide.present(step: 99)
            try TestAssertions.assertEqual(guide.currentStep, OnboardingGuideView.stepCount - 1, "High step clamps to the last step")
            try TestAssertions.assertFalse(guide.isHidden)

            guide.present(step: 2)
            try TestAssertions.assertEqual(guide.currentStep, 2)
            guide.dismiss()
            try TestAssertions.assertTrue(guide.isHidden, "Dismiss hides the overlay")
            try TestAssertions.assertEqual(guide.currentStep, 2, "Dismiss preserves the current step")
        }

        registry.register(tier: 1, feature: "UIParity-Onboarding", name: "test_UIParity_Onboarding_ShouldPresentOnLaunchHonorsEnvOverride") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            try TestAssertions.assertTrue(OnboardingGuideView.shouldPresentOnLaunch(), "Fresh install presents onboarding")

            setenv(OnboardingGuideView.skipEnvironmentKey, "1", 1)
            try TestAssertions.assertFalse(OnboardingGuideView.shouldPresentOnLaunch(), "VOO_SKIP_ONBOARDING=1 suppresses the guide")

            setenv(OnboardingGuideView.skipEnvironmentKey, "true", 1)
            try TestAssertions.assertFalse(OnboardingGuideView.shouldPresentOnLaunch(), "VOO_SKIP_ONBOARDING=true also suppresses it")

            unsetenv(OnboardingGuideView.skipEnvironmentKey)
            try TestAssertions.assertTrue(OnboardingGuideView.shouldPresentOnLaunch(), "Unsetting the override restores the guide")
        }

        registry.register(tier: 1, feature: "UIParity-Onboarding", name: "test_UIParity_Onboarding_MarkCompletedSuppressesLaunchPresentation") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            try TestAssertions.assertTrue(OnboardingGuideView.shouldPresentOnLaunch())
            OnboardingGuideView.markCompleted()
            try TestAssertions.assertFalse(OnboardingGuideView.shouldPresentOnLaunch(), "Completed installs skip the guide")
            try TestAssertions.assertEqual(
                UserDefaults.standard.string(forKey: OnboardingGuideView.completedVersionKey),
                OnboardingGuideView.completedVersionValue
            )

            UserDefaults.standard.removeObject(forKey: OnboardingGuideView.completedVersionKey)
            try TestAssertions.assertTrue(OnboardingGuideView.shouldPresentOnLaunch(), "Clearing the version re-enables the guide")
        }

        registry.register(tier: 1, feature: "UIParity-Onboarding", name: "test_UIParity_Onboarding_NextAndPreviousButtonsNavigateSteps") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            let guide = makeOnboarding()
            guide.present(step: 0)

            let next = try requireButton(guide, id: "Onboarding.Next")
            let previous = try requireButton(guide, id: "Onboarding.Previous")
            try TestAssertions.assertTrue(previous.isHidden, "Back button is hidden on the first step")
            try TestAssertions.assertEqual(next.accessibilityLabel(), "下一步")

            next.performClick(nil)
            try TestAssertions.assertEqual(guide.currentStep, 1)
            try TestAssertions.assertFalse(previous.isHidden, "Back button appears after the first step")

            next.performClick(nil)
            try TestAssertions.assertEqual(guide.currentStep, 2)
            previous.performClick(nil)
            try TestAssertions.assertEqual(guide.currentStep, 1, "Back button retreats one step")

            let progress = try requireView(guide, id: "Onboarding.StepProgress")
            let progressValue = progress.accessibilityValue() as? String
            try TestAssertions.assertEqual(progressValue, "第 2 步，共 4 步", "Progress element mirrors the current step")
        }

        registry.register(tier: 1, feature: "UIParity-Onboarding", name: "test_UIParity_Onboarding_LastStepNextCompletesGuide") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            let guide = makeOnboarding()
            var completions = 0
            guide.onComplete = { completions += 1 }
            guide.present(step: OnboardingGuideView.stepCount - 1)

            let next = try requireButton(guide, id: "Onboarding.Next")
            try TestAssertions.assertEqual(next.accessibilityLabel(), "进入画布工作台", "Final CTA label")
            next.performClick(nil)

            try TestAssertions.assertEqual(completions, 1, "Final CTA completes onboarding")
            try TestAssertions.assertTrue(guide.isHidden, "Completing dismisses the modal")
            try TestAssertions.assertFalse(OnboardingGuideView.shouldPresentOnLaunch(), "Completion is persisted")
        }

        registry.register(tier: 1, feature: "UIParity-Onboarding", name: "test_UIParity_Onboarding_SkipAndCloseButtonsFireOnClose") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            let firstGuide = makeOnboarding()
            var firstCloseCount = 0
            firstGuide.onClose = { firstCloseCount += 1 }
            firstGuide.present(step: 0)

            let skip = try requireButton(firstGuide, id: "Onboarding.Skip")
            skip.performClick(nil)
            try TestAssertions.assertEqual(firstCloseCount, 1, "Skip closes the guide")
            try TestAssertions.assertTrue(firstGuide.isHidden)
            try TestAssertions.assertFalse(OnboardingGuideView.shouldPresentOnLaunch(), "Skipping marks the guide handled")

            resetOnboardingState()

            let secondGuide = makeOnboarding()
            var secondCloseCount = 0
            secondGuide.onClose = { secondCloseCount += 1 }
            secondGuide.present(step: 1)
            let close = try requireButton(secondGuide, id: "Onboarding.Close")
            close.performClick(nil)
            try TestAssertions.assertEqual(secondCloseCount, 1, "Close X dismisses the guide")
            try TestAssertions.assertTrue(secondGuide.isHidden)

            // All accessibility proxies exist and the progress element updates.
            try TestAssertions.assertNotNil(findView(secondGuide, id: "Onboarding.Close"))
            try TestAssertions.assertNotNil(findView(secondGuide, id: "Onboarding.Next"))
            try TestAssertions.assertNotNil(findView(secondGuide, id: "Onboarding.Previous"))
            try TestAssertions.assertNotNil(findView(secondGuide, id: "Onboarding.Skip"))
            try TestAssertions.assertNotNil(findView(secondGuide, id: "Onboarding.StepProgress"))
        }
    }

    // =====================================================================
    // MARK: - 7. Welcome Dashboard (2 tests)
    // =====================================================================

    private static func registerWelcomeDashboardTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-WelcomeDashboard", name: "test_UIParity_WelcomeDashboard_BuildsAtReferenceSizesAndExposesCallbacks") {
            let wide = WelcomeDashboardView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            wide.layoutSubtreeIfNeeded()
            try TestAssertions.assertEqual(wide.frame.width, 1436)
            try TestAssertions.assertEqual(wide.frame.height, 857)
            try TestAssertions.assertEqual(wide.accessibilityIdentifier(), "Welcome.Dashboard")
            try TestAssertions.assertNotNil(findView(wide, id: "Dashboard.Search"))
            try TestAssertions.assertNotNil(findView(wide, id: "Dashboard.Prompt.Input"))
            try TestAssertions.assertNotNil(findView(wide, id: "Dashboard.Toolbar.New"))

            let compact = WelcomeDashboardView(frame: NSRect(x: 0, y: 0, width: 960, height: 640))
            compact.layoutSubtreeIfNeeded()
            try TestAssertions.assertEqual(compact.frame.width, 960)
            try TestAssertions.assertEqual(compact.frame.height, 640)
            try TestAssertions.assertNotNil(findView(compact, id: "Dashboard.Search"))

            // All navigation hooks accept non-nil closures.
            wide.onOpenEditor = { _ in }
            wide.onOpenFile = {}
            wide.onNewFile = {}
            wide.onPromptSubmit = { _ in }
            wide.onImportAction = { _ in }
            wide.onChangeWorkspace = {}
            wide.onRescan = {}
            try TestAssertions.assertNotNil(wide.onOpenEditor)
            try TestAssertions.assertNotNil(wide.onOpenFile)
            try TestAssertions.assertNotNil(wide.onNewFile)
            try TestAssertions.assertNotNil(wide.onPromptSubmit)
            try TestAssertions.assertNotNil(wide.onImportAction)
            try TestAssertions.assertNotNil(wide.onChangeWorkspace)
            try TestAssertions.assertNotNil(wide.onRescan)
        }

        registry.register(tier: 1, feature: "UIParity-WelcomeDashboard", name: "test_UIParity_WelcomeDashboard_ToolbarAndCardTargetsFireCallbacks") {
            let dashboard = WelcomeDashboardView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            dashboard.layoutSubtreeIfNeeded()

            var newFileCount = 0
            var openFileCount = 0
            var openedProjects: [String] = []
            var submittedPrompts: [String] = []
            dashboard.onNewFile = { newFileCount += 1 }
            dashboard.onOpenFile = { openFileCount += 1 }
            dashboard.onOpenEditor = { openedProjects.append($0) }
            dashboard.onPromptSubmit = { submittedPrompts.append($0) }

            // The custom hit-targets expose accessibility press, so the real
            // dashboard wiring can be exercised headlessly.
            try requireView(dashboard, id: "Dashboard.Toolbar.New").accessibilityPerformPress()
            try TestAssertions.assertEqual(newFileCount, 1, "Toolbar + New creates a document")

            try requireView(dashboard, id: "Dashboard.Toolbar.Open").accessibilityPerformPress()
            try TestAssertions.assertEqual(openFileCount, 1, "Toolbar Open opens a local file")

            try requireView(dashboard, id: "Dashboard.ProjectCard.0").accessibilityPerformPress()
            try TestAssertions.assertEqual(openedProjects, ["Web app.voo"], "Recent project card opens the editor")

            // Prompt composer submit path.
            guard let promptField = findView(dashboard, id: "Dashboard.Prompt.Input") as? NSTextField else {
                throw TestFailure(message: "Missing dashboard prompt field", file: #file, line: #line)
            }
            promptField.stringValue = "Design a pricing page"
            try requireView(dashboard, id: "Dashboard.Prompt.Send").accessibilityPerformPress()
            try TestAssertions.assertEqual(submittedPrompts, ["Design a pricing page"], "Prompt send forwards the text")
            try TestAssertions.assertEqual(promptField.stringValue, "", "Prompt field clears after submit")

            // Import cards route through onImportAction.
            var importedActions: [String] = []
            dashboard.onImportAction = { importedActions.append($0) }
            try requireView(dashboard, id: "Dashboard.Import.0").accessibilityPerformPress()
            try TestAssertions.assertEqual(importedActions, ["Import from Figma"])
        }
    }

    // =====================================================================
    // MARK: - 8. Cross-Feature Compositions (2 tests, Tier 3)
    // =====================================================================

    private static func registerCrossFeatureTests(_ registry: TestRegistry) {

        registry.register(tier: 3, feature: "UIParity-CrossFeature", name: "test_UIParity_CrossFeature_EditorChromeCompositionRenders") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            let canvas = NSSize(width: 1436, height: 857)
            let host = NSView(frame: NSRect(origin: .zero, size: canvas))

            let titleBar = makeTitleBar(width: canvas.width)
            titleBar.setDocumentTitle("Untitled.voo")

            let rail = ToolRailView()
            rail.frame = NSRect(x: (canvas.width - 330) / 2.0, y: 14, width: 330, height: 44)

            let pill = PageSwitcherPillView(frame: NSRect(x: 16, y: 16, width: 160, height: 32))
            pill.update(pageName: "Design 1", pageIndex: 1, pageCount: 1)

            let zoomBar = StudioBottomZoomBar(frame: NSRect(
                x: (canvas.width - StudioBottomZoomBar.preferredWidth) / 2.0,
                y: 16,
                width: StudioBottomZoomBar.preferredWidth,
                height: StudioBottomZoomBar.preferredHeight
            ))
            zoomBar.update(zoom: 0.58, canUndo: true, canRedo: false)

            let aiButton = VooAIFloatingButton(frame: NSRect(x: canvas.width - 60, y: 10, width: 44, height: 44))

            let island = ContextIslandBar(frame: NSRect(x: 400, y: 141, width: 600, height: 36))
            island.update(selectionLabel: "Rectangle")
            island.promptText = "Make it blue"

            let agentPanel = makeAgentPanel()
            agentPanel.addUserMessage("Make the hero purple")
            agentPanel.addAgentMessage("On it")

            let inspector = InspectorView(frame: NSRect(origin: .zero, size: canvas))
            inspector.setPropertiesVisible(true)

            let views: [NSView] = [titleBar, rail, pill, zoomBar, aiButton, island, agentPanel, inspector]
            for view in views {
                host.addSubview(view)
            }
            host.layoutSubtreeIfNeeded()

            try TestAssertions.assertEqual(host.subviews.count, views.count)
            try TestAssertions.assertTrue(pill.preferredWidth > 0)
            try TestAssertions.assertEqual(zoomBar.zoomLabelButton.text, "58%")
            try TestAssertions.assertFalse(island.isHidden)
            try TestAssertions.assertEqual(agentPanel.messageCount, 2)
            try TestAssertions.assertTrue(inspector.arePropertiesVisible)
            try TestAssertions.assertFalse(titleBar.saveButton.isHidden)

            // Everything must render into one offscreen frame without crashing.
            try renderSnapshot(size: canvas, views: [host])
        }

        registry.register(tier: 3, feature: "UIParity-CrossFeature", name: "test_UIParity_CrossFeature_DashboardModeTitleBarWithWelcomeDashboard") {
            let canvas = NSSize(width: 1436, height: 897)
            let host = NSView(frame: NSRect(origin: .zero, size: canvas))

            let titleBar = makeTitleBar(width: canvas.width)
            titleBar.frame = NSRect(x: 0, y: canvas.height - 40, width: canvas.width, height: 40)
            titleBar.setDocumentTitle("Moon.voo")
            titleBar.isDashboardMode = true

            let dashboard = WelcomeDashboardView(frame: NSRect(x: 0, y: 0, width: canvas.width, height: canvas.height - 40))
            dashboard.layoutSubtreeIfNeeded()
            var opened: [String] = []
            dashboard.onOpenEditor = { opened.append($0) }

            host.addSubview(dashboard)
            host.addSubview(titleBar)
            host.layoutSubtreeIfNeeded()

            try TestAssertions.assertTrue(titleBar.saveButton.isHidden, "Dashboard chrome hides save")
            try TestAssertions.assertTrue(titleBar.openButton.isHidden, "Dashboard chrome hides open")
            try TestAssertions.assertEqual(titleBar.docTitleField.stringValue, "Untitled")
            try TestAssertions.assertEqual(titleBar.state.documentTitle, "Moon.voo")
            try TestAssertions.assertNotNil(findView(dashboard, id: "Dashboard.Toolbar.New"))

            try requireView(dashboard, id: "Dashboard.ProjectCard.1").accessibilityPerformPress()
            try TestAssertions.assertEqual(opened, ["iPhone 16 Pro Prototype.voo"])

            try renderSnapshot(size: canvas, views: [host])
        }
    }

    // =====================================================================
    // MARK: - Round 3: Export / Tools / Transform / Layers / Text
    // =====================================================================

    private static func registerRound3Tests(_ registry: TestRegistry) {
        registerExportEngineTests(registry)
        registerCanvasToolTests(registry)
        registerTransformHandlesTests(registry)
        registerLayersPanelRound3Tests(registry)
        registerTextEditingTests(registry)
    }

    // MARK: Round-3 Fixtures

    private static func makeExportDocument() -> VOODocument {
        let rect = VOONode(kind: .rect, name: "Export Rect", x: 50, y: 50, width: 100, height: 80)
        return VOODocument(
            title: "Export Fixture",
            canvas: CanvasFrame(width: 400, height: 300),
            nodes: [rect]
        )
    }

    /// Reads the alpha byte of the first pixel of a `premultipliedLast` /
    /// `byteOrder32Big` CGImage (memory order R,G,B,A).
    private static func firstPixelAlpha(_ image: CGImage, file: String = #file, line: Int = #line) throws -> UInt8 {
        guard let provider = image.dataProvider,
              let data = provider.data,
              let bytes = CFDataGetBytePtr(data) else {
            throw TestFailure(message: "CGImage has no readable backing data", file: file, line: line)
        }
        return bytes[3]
    }

    private static func makeStage(width: CGFloat = 800, height: CGFloat = 600) -> CanvasStageView {
        let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: width, height: height))
        stage.layoutSubtreeIfNeeded()
        return stage
    }

    private static func makeTransformHandles(
        zoom: CGFloat = 0.58,
        pan: CGPoint = CGPoint(x: 300, y: 200),
        rulerOffset: CGFloat = 0,
        contentInset: CGFloat = 18
    ) -> TransformHandlesView {
        let handles = TransformHandlesView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
        handles.zoom = zoom
        handles.panOffset = pan
        handles.rulerOffset = rulerOffset
        handles.contentInset = contentInset
        return handles
    }

    // =====================================================================
    // MARK: - 9. ExportEngine (6 tests)
    // =====================================================================

    private static func registerExportEngineTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Export", name: "test_UIParity_Export_FormatMetadata") {
            let allFormats = ExportFormat.allCases
            try TestAssertions.assertEqual(allFormats.count, 5)
            try TestAssertions.assertEqual(allFormats, [ExportFormat.png, ExportFormat.jpg, ExportFormat.pdf, ExportFormat.svg, ExportFormat.html])

            try TestAssertions.assertEqual(ExportFormat.png.rawValue, "PNG")
            try TestAssertions.assertEqual(ExportFormat.jpg.rawValue, "JPG")
            try TestAssertions.assertEqual(ExportFormat.pdf.rawValue, "PDF")
            try TestAssertions.assertEqual(ExportFormat.svg.rawValue, "SVG")
            try TestAssertions.assertEqual(ExportFormat.html.rawValue, "HTML")

            try TestAssertions.assertEqual(ExportFormat.png.fileExtension, "png")
            try TestAssertions.assertEqual(ExportFormat.jpg.fileExtension, "jpg")
            try TestAssertions.assertEqual(ExportFormat.pdf.fileExtension, "pdf")
            try TestAssertions.assertEqual(ExportFormat.svg.fileExtension, "svg")
            try TestAssertions.assertEqual(ExportFormat.html.fileExtension, "html")

            try TestAssertions.assertTrue(ExportFormat.png.allowsScale, "PNG supports 1x-4x")
            try TestAssertions.assertTrue(ExportFormat.jpg.allowsScale, "JPG supports 1x-4x")
            try TestAssertions.assertFalse(ExportFormat.pdf.allowsScale, "PDF is vector")
            try TestAssertions.assertFalse(ExportFormat.svg.allowsScale, "SVG is vector")
            try TestAssertions.assertFalse(ExportFormat.html.allowsScale, "HTML is markup")

            try TestAssertions.assertEqual(ExportFormat.png.contentType, UTType.png)
            try TestAssertions.assertEqual(ExportFormat.jpg.contentType, UTType.jpeg)
            try TestAssertions.assertEqual(ExportFormat.pdf.contentType, UTType.pdf)
            let svgIdentifier = ExportFormat.svg.contentType.identifier
            try TestAssertions.assertTrue(!svgIdentifier.isEmpty, "SVG content type resolves")
            try TestAssertions.assertNotEqual(ExportFormat.svg.contentType, UTType.png)
        }

        registry.register(tier: 1, feature: "UIParity-Export", name: "test_UIParity_Export_OptionsClampScaleAndLabels") {
            let defaults = ExportOptions()
            try TestAssertions.assertEqual(defaults.format, .png)
            try TestAssertions.assertApproxEqual(defaults.scale, 2.0)
            try TestAssertions.assertFalse(defaults.transparentBackground)
            try TestAssertions.assertEqual(defaults.scaleLabel, "2x")

            let tooSmall = ExportOptions(scale: 0.25)
            try TestAssertions.assertApproxEqual(tooSmall.scale, 1.0, "Scale clamps up to 1x")
            try TestAssertions.assertEqual(tooSmall.scaleLabel, "1x")

            let tooLarge = ExportOptions(scale: 8.0)
            try TestAssertions.assertApproxEqual(tooLarge.scale, 4.0, "Scale clamps down to 4x")
            try TestAssertions.assertEqual(tooLarge.scaleLabel, "4x")

            let mid = ExportOptions(format: .jpg, scale: 3.0, transparentBackground: true)
            try TestAssertions.assertEqual(mid.format, .jpg)
            try TestAssertions.assertApproxEqual(mid.scale, 3.0)
            try TestAssertions.assertTrue(mid.transparentBackground)
            try TestAssertions.assertEqual(mid.scaleLabel, "3x")
        }

        registry.register(tier: 1, feature: "UIParity-Export", name: "test_UIParity_Export_RenderImagePixelSize") {
            let document = makeExportDocument()
            let engine = ExportEngine.shared

            let image1x = try engine.renderImage(document: document, scale: 1.0)
            try TestAssertions.assertEqual(image1x.width, 400)
            try TestAssertions.assertEqual(image1x.height, 300)

            let image2x = try engine.renderImage(document: document, scale: 2.0)
            try TestAssertions.assertEqual(image2x.width, 800, "2x doubles the canvas width")
            try TestAssertions.assertEqual(image2x.height, 600)

            let image4x = try engine.renderImage(document: document, scale: 4.0)
            try TestAssertions.assertEqual(image4x.width, 1600)
            try TestAssertions.assertEqual(image4x.height, 1200)
        }

        registry.register(tier: 1, feature: "UIParity-Export", name: "test_UIParity_Export_RenderPDFProducesValidHeader") {
            let document = makeExportDocument()
            let data = try ExportEngine.shared.renderPDF(document: document)

            try TestAssertions.assertGreaterThan(CGFloat(data.count), 100.0)
            let header = String(data: Data(data.prefix(4)), encoding: .ascii)
            try TestAssertions.assertEqual(header, "%PDF", "PDF payload starts with %PDF")
        }

        registry.register(tier: 1, feature: "UIParity-Export", name: "test_UIParity_Export_WriteArtifactsToTempDirectory") {
            let fileManager = FileManager.default
            let directory = fileManager.temporaryDirectory
                .appendingPathComponent("voo-uiparity-export-\(UUID().uuidString)", isDirectory: true)
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            defer { try? fileManager.removeItem(at: directory) }

            let document = makeExportDocument()
            let engine = ExportEngine.shared

            for format in [ExportFormat.png, .jpg, .svg, .pdf] {
                let url = directory.appendingPathComponent("artifact.\(format.fileExtension)")
                try engine.write(document: document, options: ExportOptions(format: format, scale: 1.0), to: url)

                try TestAssertions.assertEqual(url.pathExtension, format.fileExtension)
                let attributes = try fileManager.attributesOfItem(atPath: url.path)
                let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
                try TestAssertions.assertTrue(size > 0, "\(format.rawValue) file is non-empty")

                let data = try Data(contentsOf: url)
                try TestAssertions.assertTrue(!data.isEmpty)
                switch format {
                case .png:
                    try TestAssertions.assertEqual(Array(data.prefix(4)), [0x89, 0x50, 0x4E, 0x47], "PNG magic bytes")
                    guard let rep = NSBitmapImageRep(data: data) else {
                        throw TestFailure(message: "PNG did not decode", file: #file, line: #line)
                    }
                    try TestAssertions.assertEqual(rep.pixelsWide, 400)
                    try TestAssertions.assertEqual(rep.pixelsHigh, 300)
                case .jpg:
                    try TestAssertions.assertEqual(Array(data.prefix(3)), [0xFF, 0xD8, 0xFF], "JPEG magic bytes")
                case .svg:
                    guard let markup = String(data: data, encoding: .utf8) else {
                        throw TestFailure(message: "SVG was not UTF-8", file: #file, line: #line)
                    }
                    try TestAssertions.assertTrue(markup.contains("<svg"), "SVG payload contains an <svg root")
                case .pdf:
                    let header = String(data: Data(data.prefix(4)), encoding: .ascii)
                    try TestAssertions.assertEqual(header, "%PDF")
                case .html:
                    guard let markup = String(data: data, encoding: .utf8) else {
                        throw TestFailure(message: "HTML was not UTF-8", file: #file, line: #line)
                    }
                    try TestAssertions.assertTrue(markup.contains("<!DOCTYPE html>"), "HTML payload contains DOCTYPE")
                }
            }
        }

        registry.register(tier: 1, feature: "UIParity-Export", name: "test_UIParity_Export_TransparentBackgroundStillRenders") {
            let document = makeExportDocument()
            let engine = ExportEngine.shared

            let opaque = try engine.renderImage(document: document, scale: 1.0, transparent: false)
            let transparent = try engine.renderImage(document: document, scale: 1.0, transparent: true)

            try TestAssertions.assertEqual(opaque.width, 400)
            try TestAssertions.assertEqual(transparent.width, 400)
            try TestAssertions.assertEqual(transparent.height, 300)
            try TestAssertions.assertEqual(try firstPixelAlpha(opaque), 255, "Opaque export paints the canvas background")
            try TestAssertions.assertEqual(try firstPixelAlpha(transparent), 0, "Transparent export leaves the background clear")
        }
    }

    // =====================================================================
    // MARK: - 10. Canvas creation API surface (4 tests)
    // =====================================================================

    private static func registerCanvasToolTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Tools", name: "test_UIParity_Tools_CreationHooksAreAssignable") {
            let stage = makeStage()

            try TestAssertions.assertNil(stage.onCreateNode)
            try TestAssertions.assertNil(stage.onRequestTextInsertion)
            try TestAssertions.assertNil(stage.onEditTextNode)
            try TestAssertions.assertNil(stage.onPenPathCreated)
            try TestAssertions.assertNil(stage.onToolActionCompleted)

            stage.onCreateNode = { _ in }
            stage.onRequestTextInsertion = { _ in }
            stage.onEditTextNode = { _ in }
            stage.onPenPathCreated = { _ in }
            stage.onToolActionCompleted = { _ in }

            try TestAssertions.assertNotNil(stage.onCreateNode, "onCreateNode is host-assignable")
            try TestAssertions.assertNotNil(stage.onRequestTextInsertion)
            try TestAssertions.assertNotNil(stage.onEditTextNode)
            try TestAssertions.assertNotNil(stage.onPenPathCreated)
            try TestAssertions.assertNotNil(stage.onToolActionCompleted)

            // Legacy selection/zoom hooks stay assignable as well.
            stage.onSelectionChanged = { _ in }
            stage.onNodeTransformed = { _ in }
            stage.onZoomChanged = { _ in }
            stage.onCursorMoved = { _ in }
            try TestAssertions.assertNotNil(stage.onSelectionChanged)
            try TestAssertions.assertNotNil(stage.onZoomChanged)
        }

        registry.register(tier: 1, feature: "UIParity-Tools", name: "test_UIParity_Tools_DefaultCreationStateAndCancelIsSafe") {
            let stage = makeStage()

            try TestAssertions.assertFalse(stage.isCreatingShape, "No shape creation is in flight by default")
            try TestAssertions.assertEqual(stage.penAnchorCount, 0, "Pen tool has no anchors by default")
            try TestAssertions.assertEqual(stage.activeTool, .move)
            try TestAssertions.assertEqual(stage.accessibilityIdentifier(), AccessibilityCatalog.canvasViewport)
            try TestAssertions.assertEqual(stage.creationPreview.accessibilityIdentifier(), "Canvas.CreationPreview")

            var toolActions: [String] = []
            stage.onToolActionCompleted = { toolActions.append($0) }

            // Cancelling with no gesture in flight is a harmless no-op.
            stage.cancelCreation()
            try TestAssertions.assertFalse(stage.isCreatingShape)
            try TestAssertions.assertEqual(stage.penAnchorCount, 0)
            try TestAssertions.assertEqual(toolActions, [], "Idle cancel does not report a completed tool action")

            // Switching tools also abandons (no) in-flight creation safely.
            stage.activeTool = .shapes
            stage.activeTool = .pen
            stage.activeTool = .move
            stage.cancelCreation()
            try TestAssertions.assertEqual(toolActions, [])

            // Replacing the document clears creation state and prunes stale selection ids.
            stage.selectNode(id: "ghost")
            try TestAssertions.assertEqual(stage.selectedNodeIds, ["ghost"])
            stage.document = VOODocument(title: "Round 3 Stage", nodes: [VOONode(kind: .rect, name: "A")])
            try TestAssertions.assertEqual(stage.document.title, "Round 3 Stage")
            try TestAssertions.assertTrue(stage.selectedNodeIds.isEmpty, "Replaced document prunes stale selections")
        }

        registry.register(tier: 1, feature: "UIParity-Tools", name: "test_UIParity_Tools_ZoomPanRoundTripAndClamping") {
            let stage = makeStage()
            stage.showRulers = false
            stage.zoom = 0.58
            stage.panOffset = CGPoint(x: 300, y: 200)

            let documentPoint = CGPoint(x: 100, y: 50)
            let viewPoint = stage.viewPoint(from: documentPoint)
            try TestAssertions.assertPointApproxEqual(viewPoint, CGPoint(x: 100 * 0.58 + 300, y: 50 * 0.58 + 200), accuracy: 0.01)

            let roundTripped = stage.documentPoint(from: viewPoint)
            try TestAssertions.assertPointApproxEqual(roundTripped, documentPoint, accuracy: 0.001)

            // Overlays mirror the stage transform (transform-handle regression).
            try TestAssertions.assertApproxEqual(stage.transformHandles.zoom, 0.58)
            try TestAssertions.assertApproxEqual(stage.transformHandles.panOffset.x, 300)
            try TestAssertions.assertApproxEqual(stage.transformHandles.panOffset.y, 200)
            try TestAssertions.assertApproxEqual(stage.creationPreview.zoom, 0.58)
            try TestAssertions.assertApproxEqual(stage.creationPreview.panOffset.x, 300)

            // Zoom is clamped to the documented 5%...3200% range.
            stage.zoom = 0.001
            try TestAssertions.assertApproxEqual(stage.zoom, 0.05, "Zoom clamps up to 5%")
            stage.zoom = 100.0
            try TestAssertions.assertApproxEqual(stage.zoom, 32.0, "Zoom clamps down to 3200%")
            stage.zoom = 0.58
            try TestAssertions.assertApproxEqual(stage.transformHandles.zoom, 0.58)
        }

        registry.register(tier: 1, feature: "UIParity-Tools", name: "test_UIParity_Tools_CreationPreviewIsTransparentToHits") {
            let stage = makeStage()
            let preview = stage.creationPreview

            preview.shapePreviewRect = CGRect(x: 100, y: 50, width: 200, height: 100)
            preview.shapeIsEllipse = true
            preview.shapeIsArtboard = false
            preview.penAnchors = [PenAnchor(x: 0, y: 0, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)]

            try TestAssertions.assertEqual(preview.shapePreviewRect, CGRect(x: 100, y: 50, width: 200, height: 100))
            try TestAssertions.assertTrue(preview.shapeIsEllipse)
            try TestAssertions.assertFalse(preview.shapeIsArtboard)
            try TestAssertions.assertEqual(preview.penAnchors.count, 1)
            try TestAssertions.assertNil(preview.hitTest(NSPoint(x: 5, y: 5)), "Creation preview never intercepts canvas gestures")
            try TestAssertions.assertEqual(preview.accessibilityIdentifier(), "Canvas.CreationPreview")

            let path = CanvasCreationPreviewView.bezierPath(from: preview.penAnchors, closed: false)
            try TestAssertions.assertFalse(path.isEmpty)
        }
    }

    // =====================================================================
    // MARK: - 11. TransformHandlesView coordinate fix (4 tests)
    // =====================================================================

    private static func registerTransformHandlesTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Transform", name: "test_UIParity_Transform_ViewRectAppliesZoomPanAndContentInset") {
            let handles = makeTransformHandles(zoom: 0.58, pan: CGPoint(x: 300, y: 200), rulerOffset: 0, contentInset: 18)
            let documentRect = CGRect(x: 100, y: 50, width: 200, height: 100)
            let viewRect = handles.viewRect(forDocumentRect: documentRect)

            // ox = 300 + 0 - 18 = 282, oy = 200 + 0 - 18 = 182
            let expected = CGRect(
                x: 100 * 0.58 + 282,
                y: 50 * 0.58 + 182,
                width: 200 * 0.58,
                height: 100 * 0.58
            )
            try TestAssertions.assertRectApproxEqual(viewRect, expected, accuracy: 0.01)

            // Explicit numeric anchors for the regression: no double ruler shift.
            try TestAssertions.assertApproxEqual(viewRect.origin.x, 340.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(viewRect.origin.y, 211.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(viewRect.width, 116.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(viewRect.height, 58.0, accuracy: 0.01)
        }

        registry.register(tier: 1, feature: "UIParity-Transform", name: "test_UIParity_Transform_RulerOffsetCancelsContentInset") {
            let noRuler = makeTransformHandles(zoom: 0.58, pan: CGPoint(x: 300, y: 200), rulerOffset: 0, contentInset: 18)
            let withRuler = makeTransformHandles(zoom: 0.58, pan: CGPoint(x: 300, y: 200), rulerOffset: 18, contentInset: 18)
            let documentRect = CGRect(x: 100, y: 50, width: 200, height: 100)

            let noRulerRect = noRuler.viewRect(forDocumentRect: documentRect)
            let withRulerRect = withRuler.viewRect(forDocumentRect: documentRect)

            // When the handles view is inset (rulerOffset == contentInset) the
            // ruler shift cancels out: origin = doc * zoom + pan.
            let expected = CGRect(
                x: 100 * 0.58 + 300,
                y: 50 * 0.58 + 200,
                width: 200 * 0.58,
                height: 100 * 0.58
            )
            try TestAssertions.assertRectApproxEqual(withRulerRect, expected, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(withRulerRect.origin.x - noRulerRect.origin.x, 18.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(withRulerRect.origin.y - noRulerRect.origin.y, 18.0, accuracy: 0.01)
        }

        registry.register(tier: 1, feature: "UIParity-Transform", name: "test_UIParity_Transform_HandlePointsAndHitTesting") {
            let handles = makeTransformHandles(zoom: 1.0, pan: .zero, rulerOffset: 0, contentInset: 0)
            let target = CGRect(x: 100, y: 50, width: 200, height: 100)

            let points = handles.handlePoints(for: target)
            try TestAssertions.assertEqual(points.count, 9, "8 resize handles + rotation pin")
            try TestAssertions.assertEqual(Set(points.keys), Set(TransformHandleType.allCases))
            try TestAssertions.assertPointApproxEqual(points[.topLeft]!, CGPoint(x: 100, y: 50))
            try TestAssertions.assertPointApproxEqual(points[.topCenter]!, CGPoint(x: 200, y: 50))
            try TestAssertions.assertPointApproxEqual(points[.bottomRight]!, CGPoint(x: 300, y: 150))
            try TestAssertions.assertPointApproxEqual(points[.middleLeft]!, CGPoint(x: 100, y: 100))
            try TestAssertions.assertPointApproxEqual(
                points[.rotatePin]!,
                CGPoint(x: 200, y: 150 + ThemeTokens.rotateStalkOffset)
            )

            // Zoom scales the rotation stalk offset in document space.
            handles.zoom = 2.0
            let zoomedPoints = handles.handlePoints(for: target)
            try TestAssertions.assertPointApproxEqual(
                zoomedPoints[.rotatePin]!,
                CGPoint(x: 200, y: 150 + ThemeTokens.rotateStalkOffset / 2.0)
            )

            // Empty / zero-size targets never crash and never hit a handle.
            try TestAssertions.assertNil(handles.hitTestHandle(at: CGPoint(x: 100, y: 50)), "Default .zero targetRect has no handles")
            handles.targetRect = CGRect(x: 0, y: 0, width: 0, height: 0)
            try TestAssertions.assertNil(handles.hitTestHandle(at: .zero))
            handles.targetRect = CGRect(x: 10, y: 10, width: 0, height: 50)
            try TestAssertions.assertNil(handles.hitTestHandle(at: CGPoint(x: 10, y: 35)))

            // Valid target: exact handle + rotation pin hit, interior miss.
            handles.zoom = 1.0
            handles.targetRect = target
            try TestAssertions.assertEqual(handles.hitTestHandle(at: CGPoint(x: 100, y: 50)), .topLeft)
            try TestAssertions.assertEqual(
                handles.hitTestHandle(at: CGPoint(x: 200, y: 150 + ThemeTokens.rotateStalkOffset)),
                .rotatePin,
                "Rotation pin is hit-tested with priority"
            )
            try TestAssertions.assertNil(handles.hitTestHandle(at: CGPoint(x: 200, y: 100)), "Selection interior is not a handle")

            handles.isVisible = false
            try TestAssertions.assertNil(handles.hitTestHandle(at: CGPoint(x: 100, y: 50)), "Hidden handles never hit")
        }

        registry.register(tier: 3, feature: "UIParity-Transform", name: "test_UIParity_Transform_StageAndHandlesCoordinatesStayAligned") {
            let stage = makeStage()
            stage.showRulers = true
            stage.zoom = 0.58
            stage.panOffset = CGPoint(x: 300, y: 200)

            let documentPoint = CGPoint(x: 100, y: 50)
            let documentRect = CGRect(x: 100, y: 50, width: 200, height: 100)
            let thickness = ThemeTokens.rulerTrackThickness

            let stageOrigin = stage.viewPoint(from: documentPoint)
            let handlesRect = stage.transformHandles.viewRect(forDocumentRect: documentRect)

            // The handles view lives at (thickness, thickness) inside the stage, so its
            // local origin must be the stage origin shifted back by that inset. This is
            // exactly what rulerOffset - contentInset does since round 3.
            try TestAssertions.assertApproxEqual(handlesRect.minX, stageOrigin.x - thickness, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(handlesRect.minY, stageOrigin.y - thickness, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(handlesRect.width, documentRect.width * stage.zoom, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(handlesRect.height, documentRect.height * stage.zoom, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(stage.transformHandles.zoom, stage.zoom)
            try TestAssertions.assertApproxEqual(stage.transformHandles.panOffset.x, stage.panOffset.x)
            try TestAssertions.assertApproxEqual(stage.transformHandles.rulerOffset, thickness)
            try TestAssertions.assertApproxEqual(stage.transformHandles.contentInset, thickness)
        }
    }

    // =====================================================================
    // MARK: - 12. LayersPanel round-3 callbacks (4 tests)
    // =====================================================================

    private static func makeLayersPanel() -> LayersPanelView {
        let panel = LayersPanelView(frame: NSRect(x: 0, y: 0, width: 260, height: 420))
        panel.layoutSubtreeIfNeeded()
        return panel
    }

    private static func registerLayersPanelRound3Tests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_NewCallbacksAreAssignable") {
            let panel = makeLayersPanel()

            try TestAssertions.assertNil(panel.onAddLayer)
            try TestAssertions.assertNil(panel.onAddMask)
            try TestAssertions.assertNil(panel.onGroupLayers)
            try TestAssertions.assertNil(panel.onDeleteSelected)
            try TestAssertions.assertNil(panel.onOpacityChange)
            try TestAssertions.assertNil(panel.onBlendModeChange)
            try TestAssertions.assertNil(panel.onMoveLayer)
            try TestAssertions.assertNil(panel.onSearchTapped)
            try TestAssertions.assertNil(panel.onSortTapped)

            panel.onAddLayer = {}
            panel.onAddMask = {}
            panel.onGroupLayers = {}
            panel.onDeleteSelected = {}
            panel.onOpacityChange = { _ in }
            panel.onBlendModeChange = { _ in }
            panel.onMoveLayer = { _, _ in }
            panel.onSearchTapped = {}
            panel.onSortTapped = {}

            try TestAssertions.assertNotNil(panel.onAddLayer)
            try TestAssertions.assertNotNil(panel.onAddMask)
            try TestAssertions.assertNotNil(panel.onGroupLayers)
            try TestAssertions.assertNotNil(panel.onDeleteSelected)
            try TestAssertions.assertNotNil(panel.onOpacityChange)
            try TestAssertions.assertNotNil(panel.onBlendModeChange)
            try TestAssertions.assertNotNil(panel.onMoveLayer)
            try TestAssertions.assertNotNil(panel.onSearchTapped)
            try TestAssertions.assertNotNil(panel.onSortTapped)
        }

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_ConfigureAndSelectedNodeConvenience") {
            let panel = makeLayersPanel()
            let card = VOONode(kind: .rect, name: "Card A", x: 0, y: 0, width: 100, height: 80)
            let avatar = VOONode(kind: .ellipse, name: "Avatar B", x: 120, y: 0, width: 40, height: 40)

            try TestAssertions.assertTrue(panel.nodes.isEmpty)
            try TestAssertions.assertNil(panel.selectedNode)

            panel.configure(with: [card, avatar], selectedId: avatar.id)
            try TestAssertions.assertEqual(panel.nodes.count, 2)
            try TestAssertions.assertEqual(panel.selectedNodeId, avatar.id)
            try TestAssertions.assertEqual(panel.selectedNode?.id, avatar.id)
            try TestAssertions.assertEqual(panel.selectedNode?.name, "Avatar B")

            panel.configure(with: [card, avatar], selectedId: "missing-id")
            try TestAssertions.assertNil(panel.selectedNode, "Unknown selection id resolves to nil")

            panel.configure(with: [card], selectedId: nil)
            try TestAssertions.assertNil(panel.selectedNode)
            try TestAssertions.assertNil(panel.selectedNodeId)
            try TestAssertions.assertEqual(panel.nodes.count, 1)

            panel.configure(with: [], selectedId: nil)
            try TestAssertions.assertTrue(panel.nodes.isEmpty)
        }

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_ControlAccessibilityIdentifiers") {
            let panel = makeLayersPanel()
            try TestAssertions.assertEqual(panel.accessibilityIdentifier(), AccessibilityCatalog.layersTree)

            for identifier in [
                "Layers.Add", "Layers.Mask", "Layers.Group", "Layers.Delete",
                "Layers.Opacity", "Layers.Blend", "Layers.Search", "Layers.Sort"
            ] {
                let view = try requireView(panel, id: identifier)
                try TestAssertions.assertNotNil(view.accessibilityLabel(), "\(identifier) exposes an accessibility label")
            }

            // The scrollable layer table is also discoverable.
            try TestAssertions.assertNotNil(findView(panel, id: AccessibilityCatalog.layersTree))
        }

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_FooterAndHeaderActionsFireCallbacks") {
            let panel = makeLayersPanel()
            var addCount = 0
            var maskCount = 0
            var groupCount = 0
            var deleteCount = 0
            var searchCount = 0
            var sortCount = 0
            panel.onAddLayer = { addCount += 1 }
            panel.onAddMask = { maskCount += 1 }
            panel.onGroupLayers = { groupCount += 1 }
            panel.onDeleteSelected = { deleteCount += 1 }
            panel.onSearchTapped = { searchCount += 1 }
            panel.onSortTapped = { sortCount += 1 }

            try requireButton(panel, id: "Layers.Add").performClick(nil)
            try requireButton(panel, id: "Layers.Mask").performClick(nil)
            try requireButton(panel, id: "Layers.Group").performClick(nil)
            try requireButton(panel, id: "Layers.Delete").performClick(nil)
            try requireButton(panel, id: "Layers.Search").performClick(nil)
            try requireButton(panel, id: "Layers.Sort").performClick(nil)

            try TestAssertions.assertEqual(addCount, 1, "Footer + adds a layer")
            try TestAssertions.assertEqual(maskCount, 1, "Footer mask adds a mask")
            try TestAssertions.assertEqual(groupCount, 1, "Footer folder groups layers")
            try TestAssertions.assertEqual(deleteCount, 1, "Footer trash deletes the selection")
            try TestAssertions.assertEqual(searchCount, 1, "Header search button fires")
            try TestAssertions.assertEqual(sortCount, 1, "Header sort button fires")
        }
    }

    // =====================================================================
    // MARK: - 13. TextEditingOverlay (4 tests)
    // =====================================================================

    private static func registerTextEditingTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Text_DefaultTextNodeFactory") {
            let node = TextEditingOverlay.defaultTextNode(at: CGPoint(x: 120, y: 80), index: 3)

            try TestAssertions.assertEqual(node.kind, .text)
            try TestAssertions.assertEqual(node.name, "Text 3", "Factory names the node with its index")
            try TestAssertions.assertApproxEqual(node.x, 120)
            try TestAssertions.assertApproxEqual(node.y, 80)
            try TestAssertions.assertApproxEqual(node.width, 160)
            try TestAssertions.assertApproxEqual(node.height, 28)
            try TestAssertions.assertEqual(node.text ?? "", "Text")
            try TestAssertions.assertApproxEqual(node.fontSize ?? 0, 24)
            try TestAssertions.assertEqual(node.fontFamily ?? "", "Inter")
            try TestAssertions.assertEqual(node.style.fill, "#ffffff")
            try TestAssertions.assertEqual(node.style.stroke, "none")
            try TestAssertions.assertApproxEqual(node.style.strokeWidth, 0)
        }

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Text_EditorFrameMathAtZoom1And2") {
            let stage = makeStage()
            stage.showRulers = false
            stage.zoom = 1.0
            stage.panOffset = CGPoint(x: 40, y: 30)

            let node = TextEditingOverlay.defaultTextNode(at: CGPoint(x: 100, y: 50), index: 1)
            let frame1x = TextEditingOverlay.editorFrame(for: node, in: stage)
            let origin1x = stage.viewPoint(from: CGPoint(x: node.x, y: node.y))
            let expectedLineHeight1x = (node.fontSize ?? 16) * 1.4 * 1.0
            let expectedHeight1x = max(node.height, expectedLineHeight1x)
            let expectedY1x = stage.isFlipped
                ? origin1x.y
                : origin1x.y + node.height * 1.0 - expectedHeight1x

            try TestAssertions.assertApproxEqual(frame1x.minX, 140.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(frame1x.minY, expectedY1x, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(frame1x.width, 160.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(frame1x.height, expectedHeight1x, accuracy: 0.01)

            stage.zoom = 2.0
            let frame2x = TextEditingOverlay.editorFrame(for: node, in: stage)
            let origin2x = stage.viewPoint(from: CGPoint(x: node.x, y: node.y))
            let expectedLineHeight2x = (node.fontSize ?? 16) * 1.4 * 2.0
            let expectedHeight2x = max(node.height * 2.0, expectedLineHeight2x)
            let expectedY2x = stage.isFlipped
                ? origin2x.y
                : origin2x.y + node.height * 2.0 - expectedHeight2x

            try TestAssertions.assertApproxEqual(origin2x.x, 240.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(frame2x.minX, 240.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(frame2x.minY, expectedY2x, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(frame2x.width, 320.0, accuracy: 0.01)
            try TestAssertions.assertApproxEqual(frame2x.height, expectedHeight2x, accuracy: 0.01)
            try TestAssertions.assertGreaterThan(frame2x.height, frame1x.height, "Editor grows with zoom")
        }

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Text_BeginCommitFiresOnceAndHidesOverlay") {
            let stage = makeStage()
            let overlay = TextEditingOverlay(frame: .zero)
            var commits: [String] = []
            overlay.onCommit = { commits.append($0) }

            let node = TextEditingOverlay.defaultTextNode(at: CGPoint(x: 100, y: 50), index: 2)
            overlay.begin(editing: node, in: stage)

            try TestAssertions.assertTrue(overlay.isEditing)
            try TestAssertions.assertFalse(overlay.isHidden, "Editor overlay is visible while editing")
            try TestAssertions.assertTrue(overlay.attachedStage === stage)
            try TestAssertions.assertTrue(overlay.superview === stage, "Overlay attaches itself to the stage")
            try TestAssertions.assertEqual(overlay.editingNode?.id, node.id)
            try TestAssertions.assertEqual(overlay.editorTextView.string, "Text", "Editor seeds the node text")
            try TestAssertions.assertEqual(overlay.accessibilityIdentifier(), "Canvas.TextEditor")
            try TestAssertions.assertGreaterThan(overlay.editorFrame.width, 0)
            try TestAssertions.assertGreaterThan(overlay.editorFrame.height, 0)

            overlay.editorTextView.string = "Hello VOO"
            overlay.endEditing(commit: true)

            try TestAssertions.assertEqual(commits, ["Hello VOO"], "Commit reports the edited text exactly once")
            try TestAssertions.assertFalse(overlay.isEditing)
            try TestAssertions.assertTrue(overlay.isHidden, "Commit hides the overlay")
            try TestAssertions.assertNil(overlay.editingNode)

            // Second end without a new begin is a no-op (commit-once guard).
            overlay.endEditing(commit: true)
            try TestAssertions.assertEqual(commits.count, 1)
        }

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Text_RebeginFlushesPreviousSessionAndEscapeCancels") {
            let stage = makeStage()
            let overlay = TextEditingOverlay(frame: .zero)
            var commits: [String] = []
            var cancels = 0
            overlay.onCommit = { commits.append($0) }
            overlay.onCancel = { cancels += 1 }

            let firstNode = TextEditingOverlay.defaultTextNode(at: CGPoint(x: 40, y: 40), index: 1)
            let secondNode = TextEditingOverlay.defaultTextNode(at: CGPoint(x: 300, y: 200), index: 2)

            overlay.begin(editing: firstNode, in: stage)
            overlay.editorTextView.string = "First draft"

            // Starting a new session flushes the previous one as a commit.
            overlay.begin(editing: secondNode, in: stage)
            try TestAssertions.assertEqual(commits, ["First draft"], "Re-begin commits the previous edit once")
            try TestAssertions.assertTrue(overlay.isEditing)
            try TestAssertions.assertEqual(overlay.editingNode?.id, secondNode.id)
            try TestAssertions.assertEqual(overlay.editorTextView.string, "Text")

            // Escape path: endEditing(commit: false) → onCancel once, no commit.
            overlay.endEditing(commit: false)
            try TestAssertions.assertEqual(cancels, 1, "Cancel fires exactly once")
            try TestAssertions.assertEqual(commits.count, 1, "Cancel does not also commit")
            try TestAssertions.assertTrue(overlay.isHidden)
            try TestAssertions.assertFalse(overlay.isEditing)

            overlay.endEditing(commit: false)
            try TestAssertions.assertEqual(cancels, 1, "Repeated cancel is a no-op")
        }
    }

    // =====================================================================
    // MARK: - Round 4: Interaction upgrades (commits / menus / grid / type)
    // =====================================================================

    private static func registerInteractionRound4Tests(_ registry: TestRegistry) {
        registerCanvasInteractionRound4Tests(registry)
        registerLayersContextMenuTests(registry)
        registerPropertiesTypographyTests(registry)
        registerMenuInteractionTests(registry)
    }

    // MARK: Round-4 Helpers

    private static func allMenuItems(in menu: NSMenu) -> [NSMenuItem] {
        var items: [NSMenuItem] = []
        for item in menu.items {
            items.append(item)
            if let submenu = item.submenu {
                items.append(contentsOf: allMenuItems(in: submenu))
            }
        }
        return items
    }

    private static func findMenuItem(in menu: NSMenu, title: String) -> NSMenuItem? {
        allMenuItems(in: menu).first { $0.title == title }
    }

    private static func findLayersTable(_ root: NSView) -> LayersTableView? {
        for subview in root.subviews {
            if let table = subview as? LayersTableView { return table }
            if let found = findLayersTable(subview) { return found }
        }
        return nil
    }

    private static func makeTextLayerNode() -> VOONode {
        VOONode(
            kind: .text,
            name: "Headline",
            x: 40,
            y: 60,
            width: 200,
            height: 48,
            style: LayerStyle(fill: "#ffffff", stroke: "none", strokeWidth: 0),
            text: "Hello VOO",
            fontSize: 42,
            fontFamily: "Menlo"
        )
    }

    private static func makePropertiesPanel() -> PropertiesPanelView {
        let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 260, height: 450))
        panel.layoutSubtreeIfNeeded()
        return panel
    }

    // =====================================================================
    // MARK: - 14. CanvasStageView interaction upgrades (5 tests)
    // =====================================================================

    private static func registerCanvasInteractionRound4Tests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Canvas", name: "test_UIParity_Canvas_CommitAndContextMenuHooksAssignable") {
            let stage = makeStage()

            try TestAssertions.assertNil(stage.onMoveCommitted)
            try TestAssertions.assertNil(stage.onHandleTransformCommitted)
            try TestAssertions.assertNil(stage.contextMenuProvider)

            var moveCommits = 0
            var handleCommits = 0
            stage.onMoveCommitted = { before, after in
                _ = before
                _ = after
                moveCommits += 1
            }
            // Named parameters (six wildcards crash swiftc 6.x type-checking here).
            stage.onHandleTransformCommitted = { nodeId, before, beforeRotation, after, afterRotation in
                _ = nodeId
                _ = before
                _ = beforeRotation
                _ = after
                _ = afterRotation
                handleCommits += 1
            }
            stage.contextMenuProvider = { _ in NSMenu() }

            try TestAssertions.assertNotNil(stage.onMoveCommitted, "onMoveCommitted is host-assignable")
            try TestAssertions.assertNotNil(stage.onHandleTransformCommitted, "onHandleTransformCommitted is host-assignable")
            try TestAssertions.assertNotNil(stage.contextMenuProvider, "contextMenuProvider is host-assignable")

            // Retained closures must be invocable with the documented payloads.
            let beforeRects: [String: CGRect] = ["node-a": CGRect.zero]
            let afterRects: [String: CGRect] = ["node-a": CGRect(x: 10, y: 10, width: 50, height: 40)]
            stage.onMoveCommitted?(beforeRects, afterRects)
            stage.onHandleTransformCommitted?("node-a", CGRect.zero, 0, CGRect(x: 10, y: 10, width: 50, height: 40), 45)
            try TestAssertions.assertEqual(moveCommits, 1)
            try TestAssertions.assertEqual(handleCommits, 1)
        }

        registry.register(tier: 1, feature: "UIParity-Canvas", name: "test_UIParity_Canvas_GridAndSnappingDefaultsAndRender") {
            let stage = makeStage()
            try TestAssertions.assertFalse(stage.showGrid, "Design grid is off by default")
            try TestAssertions.assertTrue(stage.isSnappingEnabled, "Magnetic snapping is on by default")

            let canvasSize = stage.bounds.size
            let withoutGrid = try renderSnapshot(size: canvasSize, views: [stage])

            stage.showGrid = true
            try TestAssertions.assertTrue(stage.showGrid)
            try TestAssertions.assertTrue(stage.isSnappingEnabled, "Toggling the grid leaves snapping untouched")
            let withGrid = try renderSnapshot(size: canvasSize, views: [stage])

            guard let plainData = withoutGrid.tiffRepresentation,
                  let gridData = withGrid.tiffRepresentation else {
                throw TestFailure(message: "Stage snapshot has no TIFF representation", file: #file, line: #line)
            }
            try TestAssertions.assertNotEqual(gridData, plainData, "Grid overlay visibly changes the stage render")

            stage.showGrid = false
            stage.isSnappingEnabled = false
            try TestAssertions.assertFalse(stage.isSnappingEnabled)

            // Creation state helpers still cancel cleanly on the upgraded stage.
            stage.cancelCreation()
            try TestAssertions.assertFalse(stage.isCreatingShape)
            try TestAssertions.assertEqual(stage.penAnchorCount, 0)
        }

        registry.register(tier: 1, feature: "UIParity-Canvas", name: "test_UIParity_Canvas_ContextMenuProviderReturnsMenu") {
            let stage = makeStage()
            var requestedPoints: [CGPoint] = []
            let marker = NSMenuItem(title: "UIParity Marker", action: nil, keyEquivalent: "")

            stage.contextMenuProvider = { point in
                requestedPoints.append(point)
                let menu = NSMenu()
                menu.addItem(marker)
                return menu
            }

            try TestAssertions.assertNotNil(stage.contextMenuProvider)
            let menu = stage.contextMenuProvider?(CGPoint(x: 42, y: 24))
            try TestAssertions.assertNotNil(menu, "Provider returns the host menu")
            try TestAssertions.assertEqual(menu?.items.count, 1)
            try TestAssertions.assertEqual(menu?.items.first?.title, "UIParity Marker")
            try TestAssertions.assertEqual(requestedPoints, [CGPoint(x: 42, y: 24)], "Provider receives the document-space point")
        }

        registry.register(tier: 1, feature: "UIParity-Canvas", name: "test_UIParity_Canvas_CGBlendModeMapsNamedModes") {
            let canonical: [(String, CGBlendMode)] = [
                ("multiply", .multiply),
                ("screen", .screen),
                ("overlay", .overlay),
                ("darken", .darken),
                ("lighten", .lighten),
                ("color-dodge", .colorDodge),
                ("color-burn", .colorBurn),
                ("hard-light", .hardLight),
                ("soft-light", .softLight),
                ("difference", .difference),
                ("exclusion", .exclusion),
                ("hue", .hue),
                ("saturation", .saturation),
                ("color", .color),
                ("luminosity", .luminosity),
                ("normal", .normal)
            ]
            try TestAssertions.assertEqual(canonical.count, 16, "15 blend modes + normal")

            for (name, expected) in canonical {
                try TestAssertions.assertEqual(
                    CanvasStageView.cgBlendMode(for: name),
                    expected,
                    "cgBlendMode(\(name)) maps to the matching CGBlendMode"
                )
            }
        }

        registry.register(tier: 1, feature: "UIParity-Canvas", name: "test_UIParity_Canvas_CGBlendModeAliasesAndDefault") {
            let aliases: [(String, CGBlendMode)] = [
                ("color dodge", .colorDodge),
                ("color burn", .colorBurn),
                ("hard light", .hardLight),
                ("soft light", .softLight),
                ("MULTIPLY", .multiply),
                ("SCREEN", .screen)
            ]
            for (name, expected) in aliases {
                try TestAssertions.assertEqual(CanvasStageView.cgBlendMode(for: name), expected, "Alias/case \(name)")
            }

            for unknown in ["source-over", "", "unknown-mode", "multiply "] {
                try TestAssertions.assertEqual(
                    CanvasStageView.cgBlendMode(for: unknown),
                    .normal,
                    "Unmapped blend mode '\(unknown)' falls back to .normal"
                )
            }
        }

    }

    // =====================================================================
    // MARK: - 15. Layers context menu + duplicate (4 tests)
    // =====================================================================

    private static func registerLayersContextMenuTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_DuplicateSelectedCallbackAssignable") {
            let panel = makeLayersPanel()

            try TestAssertions.assertNil(panel.onDuplicateSelected)
            var duplicateCount = 0
            panel.onDuplicateSelected = { duplicateCount += 1 }
            try TestAssertions.assertNotNil(panel.onDuplicateSelected, "onDuplicateSelected is host-assignable")

            panel.onDuplicateSelected?()
            try TestAssertions.assertEqual(duplicateCount, 1)
        }

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_BuildRowContextMenuActions") {
            let panel = makeLayersPanel()
            let card = VOONode(kind: .rect, name: "Card A", x: 0, y: 0, width: 100, height: 80)
            let avatar = VOONode(kind: .ellipse, name: "Avatar B", x: 120, y: 0, width: 40, height: 40)
            panel.configure(with: [card, avatar], selectedId: nil)

            let menu = panel.buildRowContextMenu(row: 0)
            try TestAssertions.assertEqual(menu.items.count, 7, "6 actions + 1 separator")
            let actionItems = menu.items.filter { !$0.isSeparatorItem }
            try TestAssertions.assertEqual(actionItems.count, 6)
            try TestAssertions.assertEqual(menu.items.filter { $0.isSeparatorItem }.count, 1)

            try TestAssertions.assertEqual(
                actionItems.map { $0.title },
                [
                    "重命名 (Rename)",
                    "隐藏 (Hide)",
                    "锁定 (Lock)",
                    "创建副本 (Duplicate)",
                    "编组 (Group)",
                    "删除 (Delete)"
                ]
            )

            let expectedSelectors = [
                "contextRename:",
                "contextToggleVisibility:",
                "contextToggleLock:",
                "contextDuplicate:",
                "contextGroup:",
                "contextDelete:"
            ]
            for (index, item) in actionItems.enumerated() {
                try TestAssertions.assertTrue(
                    item.action == NSSelectorFromString(expectedSelectors[index]),
                    "Context action \(index) routes to \(expectedSelectors[index])"
                )
                try TestAssertions.assertTrue(item.target === panel, "Context action \(index) targets the panel")
                try TestAssertions.assertEqual(item.tag, 0, "Context action \(index) carries the row tag")
            }

            // Out-of-range rows yield an empty menu instead of crashing.
            try TestAssertions.assertTrue(panel.buildRowContextMenu(row: -1).items.isEmpty)
            try TestAssertions.assertTrue(panel.buildRowContextMenu(row: 99).items.isEmpty)

            // The visibility/lock titles flip with the node state.
            panel.configure(
                with: [VOONode(kind: .rect, name: "Hidden Locked", style: LayerStyle(visible: false, locked: true))],
                selectedId: nil
            )
            let flippedTitles = panel.buildRowContextMenu(row: 0).items
                .filter { !$0.isSeparatorItem }
                .map { $0.title }
            try TestAssertions.assertEqual(flippedTitles[1], "显示 (Show)")
            try TestAssertions.assertEqual(flippedTitles[2], "解锁 (Unlock)")
        }

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_SelectRowForContextMenuUpdatesSelection") {
            let panel = makeLayersPanel()
            let card = VOONode(kind: .rect, name: "Card A", x: 0, y: 0, width: 100, height: 80)
            let avatar = VOONode(kind: .ellipse, name: "Avatar B", x: 120, y: 0, width: 40, height: 40)
            panel.configure(with: [card, avatar], selectedId: nil)

            var selectedIds: [String] = []
            panel.onSelectNode = { selectedIds.append($0) }

            panel.selectRowForContextMenu(1)
            try TestAssertions.assertEqual(panel.selectedNodeId, avatar.id)
            try TestAssertions.assertEqual(panel.selectedNode?.id, avatar.id)
            try TestAssertions.assertEqual(selectedIds, [avatar.id], "Context selection notifies the host once")

            let retainedId = panel.selectedNodeId
            panel.selectRowForContextMenu(-1)
            panel.selectRowForContextMenu(99)
            try TestAssertions.assertEqual(panel.selectedNodeId, retainedId, "Out-of-range rows keep the current selection")
        }

        registry.register(tier: 1, feature: "UIParity-Layers", name: "test_UIParity_Layers_TableOwnerPanelWiring") {
            let panel = makeLayersPanel()
            guard let table = findLayersTable(panel) else {
                throw TestFailure(message: "LayersPanelView does not embed a LayersTableView", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(table.ownerPanel === panel, "The table's context-menu owner is its panel")
            try TestAssertions.assertEqual(table.accessibilityIdentifier(), AccessibilityCatalog.layersTree)

            // With no owner the table falls back to the default menu path (nil menu).
            let orphan = LayersTableView(frame: NSRect(x: 0, y: 0, width: 100, height: 100))
            try TestAssertions.assertNil(orphan.ownerPanel)
        }
    }

    // =====================================================================
    // MARK: - 16. PropertiesPanel / Inspector typography (4 tests)
    // =====================================================================

    private static func registerPropertiesTypographyTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Properties_TextTypographyCallbacksAndNode") {
            let panel = makePropertiesPanel()

            try TestAssertions.assertNil(panel.onFontFamilyChange)
            try TestAssertions.assertNil(panel.onFontSizeChange)
            try TestAssertions.assertNil(panel.node)

            var families: [String] = []
            var sizes: [CGFloat] = []
            panel.onFontFamilyChange = { families.append($0) }
            panel.onFontSizeChange = { sizes.append($0) }
            try TestAssertions.assertNotNil(panel.onFontFamilyChange, "onFontFamilyChange is host-assignable")
            try TestAssertions.assertNotNil(panel.onFontSizeChange, "onFontSizeChange is host-assignable")

            let textNode = makeTextLayerNode()
            panel.configure(with: textNode)
            try TestAssertions.assertEqual(panel.node?.id, textNode.id)
            try TestAssertions.assertEqual(panel.node?.kind, .text)
            try TestAssertions.assertEqual(panel.node?.fontFamily ?? "", "Menlo")
            try TestAssertions.assertApproxEqual(panel.node?.fontSize ?? 0, 42)

            // Closures must stay retained after configuration.
            panel.onFontFamilyChange?("Georgia")
            panel.onFontSizeChange?(18)
            try TestAssertions.assertEqual(families, ["Georgia"])
            try TestAssertions.assertApproxEqual(sizes.first ?? 0, 18)

            panel.configure(with: nil)
            try TestAssertions.assertNil(panel.node)
        }

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Properties_TextTypographyAccessibilityIdentifiers") {
            let panel = makePropertiesPanel()
            panel.configure(with: makeTextLayerNode())
            panel.layoutSubtreeIfNeeded()

            try TestAssertions.assertEqual(panel.accessibilityIdentifier(), "Inspector.Properties")
            for identifier in [
                "Inspector.Properties.Text",
                "Inspector.Properties.FontFamily",
                "Inspector.Properties.FontSize"
            ] {
                let view = try requireView(panel, id: identifier)
                try TestAssertions.assertNotNil(view.accessibilityLabel(), "\(identifier) has an accessibility label")
            }
        }

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Inspector_ConfigurePropertiesMirrorsTypography") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            inspector.layoutSubtreeIfNeeded()
            inspector.setPropertiesVisible(true)

            let textNode = makeTextLayerNode()
            inspector.configureProperties(with: textNode)

            try TestAssertions.assertEqual(inspector.propertiesPanel.node?.id, textNode.id)
            try TestAssertions.assertEqual(inspector.propertiesPanel.node?.kind, .text)
            try TestAssertions.assertEqual(inspector.propertiesPanel.node?.fontFamily ?? "", "Menlo")
            try TestAssertions.assertApproxEqual(inspector.propertiesPanel.node?.fontSize ?? 0, 42)

            inspector.configureProperties(with: nil)
            try TestAssertions.assertNil(inspector.propertiesPanel.node, "Clearing the selection empties the properties card")
        }

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_Inspector_MinimalDelegateUsesDefaultTypography") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            let spy = UIParityMinimalInspectorDelegate()
            inspector.delegate = spy
            try TestAssertions.assertTrue(inspector.delegate === spy)

            // Compiles only because the protocol extension supplies a default no-op.
            inspector.delegate?.inspectorDidChangeTextTypography(id: "node-1", fontFamily: "Menlo", fontSize: 42)

            // Exercise the real forwarding path: the spy intentionally does not
            // implement the typography callback, so this stays a safe no-op.
            let textNode = makeTextLayerNode()
            inspector.layersPanel.configure(with: [textNode], selectedId: textNode.id)
            inspector.configureProperties(with: textNode)
            inspector.propertiesPanel.onFontFamilyChange?("Georgia")
            inspector.propertiesPanel.onFontSizeChange?(20)

            try TestAssertions.assertTrue(inspector.delegate === spy, "Delegate stays attached through the default path")
            try TestAssertions.assertEqual(inspector.layersPanel.selectedNodeId, textNode.id)
        }
    }

    // =====================================================================
    // MARK: - 17. MenuController interaction items (1 test)
    // =====================================================================

    private static func registerMenuInteractionTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Menu", name: "test_UIParity_Menu_MainMenuContainsInteractionItems") {
            let mainMenu = MenuController.shared.buildMainMenu()
            let titles = allMenuItems(in: mainMenu).map { $0.title }

            for expectedTitle in [
                "显示网格 (Toggle Grid)",
                "磁性吸附 (Toggle Snapping)",
                "水平等距分布 (Distribute H)"
            ] {
                try TestAssertions.assertTrue(titles.contains(expectedTitle), "Main menu contains '\(expectedTitle)'")
            }

            guard let gridItem = findMenuItem(in: mainMenu, title: "显示网格 (Toggle Grid)") else {
                throw TestFailure(message: "Missing grid menu item", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(
                gridItem.action == #selector(StudioMenuActions.toggleGridAction(_:)),
                "Grid item routes to toggleGridAction:"
            )

            guard let snappingItem = findMenuItem(in: mainMenu, title: "磁性吸附 (Toggle Snapping)") else {
                throw TestFailure(message: "Missing snapping menu item", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(
                snappingItem.action == #selector(StudioMenuActions.toggleSnappingAction(_:)),
                "Snapping item routes to toggleSnappingAction:"
            )

            guard let distributeItem = findMenuItem(in: mainMenu, title: "水平等距分布 (Distribute H)") else {
                throw TestFailure(message: "Missing horizontal distribute menu item", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(
                distributeItem.action == #selector(StudioMenuActions.distributeSelectionAction(_:)),
                "Distribute H routes to distributeSelectionAction:"
            )
            try TestAssertions.assertEqual(distributeItem.representedObject as? String, "distributeH")

            guard let alignItem = findMenuItem(in: mainMenu, title: "左对齐 (Align Left)") else {
                throw TestFailure(message: "Missing align-left menu item", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(
                alignItem.action == #selector(StudioMenuActions.alignSelectionAction(_:)),
                "Align items route to alignSelectionAction:"
            )

            // The vertical variant shares the distribute selector and a distinct tag.
            guard let distributeV = findMenuItem(in: mainMenu, title: "垂直等距分布 (Distribute V)") else {
                throw TestFailure(message: "Missing vertical distribute menu item", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(distributeV.representedObject as? String, "distributeV")
            try TestAssertions.assertTrue(
                distributeV.action == #selector(StudioMenuActions.distributeSelectionAction(_:))
            )
        }
    }

    // =====================================================================
    // MARK: - Round 5: Typography, image import, path editing, CLI streaming
    // =====================================================================

    private static func registerRound5Tests(_ registry: TestRegistry) {
        registerTextFormattingTests(registry)
        registerTextStyleResolverTests(registry)
        registerImageImporterTests(registry)
        registerPathEditingAndRotatedHandlesTests(registry)
        registerLocalCLIBridgeTests(registry)
        registerAgentStreamingTests(registry)
        registerImportImageMenuTest(registry)
    }

    // MARK: Round-5 Helpers

    private static func makeFormattingTextNode(
        fontWeight: String? = nil,
        textAlign: String? = nil,
        lineHeight: CGFloat? = nil,
        letterSpacing: CGFloat? = nil
    ) -> VOONode {
        var node = VOONode(
            kind: .text,
            name: "Headline",
            x: 40,
            y: 60,
            width: 200,
            height: 48,
            style: LayerStyle(fill: "#ffffff", stroke: "none", strokeWidth: 0),
            text: "Hello VOO",
            fontSize: 42,
            fontFamily: "Inter"
        )
        node.fontWeight = fontWeight
        node.textAlign = textAlign
        node.lineHeight = lineHeight
        node.letterSpacing = letterSpacing
        return node
    }

    private static func formattingMarkerValue(
        _ panel: PropertiesPanelView,
        identifier: String,
        file: String = #file,
        line: Int = #line
    ) throws -> String {
        let marker = try requireView(panel, id: identifier, file: file, line: line)
        guard let value = marker.accessibilityValue() as? String else {
            throw TestFailure(message: "Marker \(identifier) has no string accessibility value", file: file, line: line)
        }
        return value
    }

    private static func makeTinyPNGData(file: String = #file, line: Int = #line) throws -> Data {
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: 2,
            pixelsHigh: 2,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else {
            throw TestFailure(message: "Failed to create 2x2 bitmap rep", file: file, line: line)
        }
        if let bitmap = rep.bitmapData {
            memset(bitmap, 0xFF, rep.bytesPerRow * rep.pixelsHigh)
        }
        guard let data = rep.representation(using: .png, properties: [:]) else {
            throw TestFailure(message: "Failed to encode 2x2 PNG", file: file, line: line)
        }
        return data
    }

    private static func capturedError<T>(_ body: () throws -> T) -> Error? {
        do {
            _ = try body()
            return nil
        } catch {
            return error
        }
    }

    /// Pumps the main run loop (bounded by `timeout`) until `condition` is true.
    @discardableResult
    private static func pumpRunLoop(timeout: TimeInterval, until condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            if Date() > deadline { return false }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.01))
        }
        return true
    }

    /// Runs an async operation to completion from a synchronous test closure with a
    /// hard 3s default timeout, pumping the run loop so main-queue hops can land.
    private static func awaitAsync<T>(
        timeout: TimeInterval = 3.0,
        _ operation: @escaping @Sendable () async -> T
    ) throws -> T {
        let box = UIParityAsyncBox<T>()
        let semaphore = DispatchSemaphore(value: 0)
        Task {
            let value = await operation()
            box.set(value)
            semaphore.signal()
        }
        let deadline = Date().addingTimeInterval(timeout)
        while semaphore.wait(timeout: .now()) == .timedOut {
            if Date() > deadline {
                throw TestFailure(
                    message: "Async operation timed out after \(timeout)s",
                    file: #file,
                    line: #line
                )
            }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.01))
        }
        guard let value = box.get() else {
            throw TestFailure(message: "Async operation produced no result", file: #file, line: #line)
        }
        return value
    }

    private static func findMessageBubbles(_ root: NSView) -> [AgentMessageBubbleView] {
        var bubbles: [AgentMessageBubbleView] = []
        for subview in root.subviews {
            if let bubble = subview as? AgentMessageBubbleView { bubbles.append(bubble) }
            bubbles.append(contentsOf: findMessageBubbles(subview))
        }
        return bubbles
    }

    // =====================================================================
    // MARK: - 18. Text formatting model + Properties/Inspector (6 tests)
    // =====================================================================

    private static func registerTextFormattingTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-TextFormatting", name: "test_UIParity_TextFormatting_NodeDefaultsAndJSONRoundTrip") {
            let defaults = VOONode(kind: .text, name: "Defaults", text: "Hi")
            try TestAssertions.assertNil(defaults.fontWeight)
            try TestAssertions.assertNil(defaults.textAlign)
            try TestAssertions.assertNil(defaults.lineHeight)
            try TestAssertions.assertNil(defaults.letterSpacing)

            var document = VOODocument(title: "Formatting Round Trip")
            var node = VOONode(
                kind: .text,
                name: "Title",
                x: 10,
                y: 20,
                width: 300,
                height: 60,
                text: "Hello",
                fontSize: 32,
                fontFamily: "Inter"
            )
            node.fontWeight = "bold"
            node.textAlign = "center"
            node.lineHeight = 1.5
            node.letterSpacing = 2
            document.nodes = [node]

            let data = try document.serializeToJSON()
            let restored = try VOODocument.deserialize(from: data)
            try TestAssertions.assertEqual(restored.nodes.count, 1)
            let restoredNode = restored.nodes[0]
            try TestAssertions.assertEqual(restoredNode.fontWeight ?? "", "bold")
            try TestAssertions.assertEqual(restoredNode.textAlign ?? "", "center")
            try TestAssertions.assertApproxEqual(restoredNode.lineHeight ?? 0, 1.5)
            try TestAssertions.assertApproxEqual(restoredNode.letterSpacing ?? 0, 2)
            try TestAssertions.assertEqual(restoredNode.text ?? "", "Hello")
            try TestAssertions.assertApproxEqual(restoredNode.fontSize ?? 0, 32)

            // Encoded JSON carries the new keys for formatting-aware documents.
            guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rawNodes = object["nodes"] as? [[String: Any]] else {
                throw TestFailure(message: "Serialized document has no nodes array", file: #file, line: #line)
            }
            try TestAssertions.assertNotNil(rawNodes.first?["fontWeight"])
            try TestAssertions.assertNotNil(rawNodes.first?["textAlign"])
            try TestAssertions.assertNotNil(rawNodes.first?["lineHeight"])
            try TestAssertions.assertNotNil(rawNodes.first?["letterSpacing"])
        }

        registry.register(tier: 1, feature: "UIParity-TextFormatting", name: "test_UIParity_TextFormatting_OldJSONWithoutFormattingKeysDecodes") {
            var document = VOODocument(title: "Legacy JSON")
            var node = VOONode(kind: .text, name: "Legacy", text: "Legacy", fontSize: 18)
            node.fontWeight = "bold"
            node.textAlign = "center"
            node.lineHeight = 1.5
            node.letterSpacing = 2
            document.nodes = [node]

            let data = try document.serializeToJSON()
            guard var object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  var rawNodes = object["nodes"] as? [[String: Any]] else {
                throw TestFailure(message: "Serialized document has no nodes array", file: #file, line: #line)
            }
            for key in ["fontWeight", "textAlign", "lineHeight", "letterSpacing"] {
                rawNodes[0].removeValue(forKey: key)
            }
            object["nodes"] = rawNodes
            let legacyData = try JSONSerialization.data(withJSONObject: object, options: [])

            let legacy = try VOODocument.deserialize(from: legacyData)
            let legacyNode = legacy.nodes[0]
            try TestAssertions.assertNil(legacyNode.fontWeight, "Old JSON without fontWeight decodes to nil")
            try TestAssertions.assertNil(legacyNode.textAlign)
            try TestAssertions.assertNil(legacyNode.lineHeight)
            try TestAssertions.assertNil(legacyNode.letterSpacing)
            try TestAssertions.assertEqual(legacyNode.text ?? "", "Legacy", "Legacy node content still decodes")
        }

        registry.register(tier: 1, feature: "UIParity-TextFormatting", name: "test_UIParity_Properties_FormattingCallbacksAndConfigureReflection") {
            let panel = makePropertiesPanel()
            try TestAssertions.assertNil(panel.onFontWeightChange)
            try TestAssertions.assertNil(panel.onTextAlignChange)
            try TestAssertions.assertNil(panel.onLineHeightChange)
            try TestAssertions.assertNil(panel.onLetterSpacingChange)

            var weights: [String] = []
            var aligns: [String] = []
            var lineHeights: [CGFloat] = []
            var spacings: [CGFloat] = []
            panel.onFontWeightChange = { weights.append($0) }
            panel.onTextAlignChange = { aligns.append($0) }
            panel.onLineHeightChange = { lineHeights.append($0) }
            panel.onLetterSpacingChange = { spacings.append($0) }
            try TestAssertions.assertNotNil(panel.onFontWeightChange)
            try TestAssertions.assertNotNil(panel.onTextAlignChange)
            try TestAssertions.assertNotNil(panel.onLineHeightChange)
            try TestAssertions.assertNotNil(panel.onLetterSpacingChange)

            panel.configure(with: makeFormattingTextNode(
                fontWeight: "bold", textAlign: "center", lineHeight: 1.5, letterSpacing: 2
            ))
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.Weight"), "bold")
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.Align"), "center")
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.LineHeight"), "1.5")
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.LetterSpacing"), "2")

            // Unformatted text nodes fall back to the documented defaults.
            panel.configure(with: makeFormattingTextNode())
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.Weight"), "regular")
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.Align"), "left")
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.LineHeight"), "1.2")
            try TestAssertions.assertEqual(try formattingMarkerValue(panel, identifier: "Inspector.Properties.LetterSpacing"), "0")

            // Retained callbacks are invocable with the documented payloads.
            panel.onFontWeightChange?("semibold")
            panel.onTextAlignChange?("right")
            panel.onLineHeightChange?(2)
            panel.onLetterSpacingChange?(-1)
            try TestAssertions.assertEqual(weights, ["semibold"])
            try TestAssertions.assertEqual(aligns, ["right"])
            try TestAssertions.assertApproxEqual(lineHeights.first ?? 0, 2)
            try TestAssertions.assertApproxEqual(spacings.first ?? 0, -1)
        }

        registry.register(tier: 1, feature: "UIParity-TextFormatting", name: "test_UIParity_Properties_FormattingAccessibilityIdentifiers") {
            let panel = makePropertiesPanel()
            panel.configure(with: makeFormattingTextNode(fontWeight: "bold", textAlign: "center", lineHeight: 1.5, letterSpacing: 2))
            panel.layoutSubtreeIfNeeded()

            for identifier in [
                "Inspector.Properties.Typography",
                "Inspector.Properties.Weight",
                "Inspector.Properties.Align",
                "Inspector.Properties.LineHeight",
                "Inspector.Properties.LetterSpacing"
            ] {
                let view = try requireView(panel, id: identifier)
                try TestAssertions.assertNotNil(view.accessibilityLabel(), "\(identifier) has an accessibility label")
            }
        }

        registry.register(tier: 1, feature: "UIParity-TextFormatting", name: "test_UIParity_Inspector_FormattingMirroringAndForwarding") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            inspector.layoutSubtreeIfNeeded()
            inspector.setPropertiesVisible(true)

            let spy = UIParityFormattingInspectorDelegate()
            inspector.delegate = spy

            let node = makeFormattingTextNode(fontWeight: "bold", textAlign: "center", lineHeight: 1.5, letterSpacing: 2)
            inspector.layersPanel.configure(with: [node], selectedId: node.id)
            inspector.configureProperties(with: node)

            // The mirrored properties node keeps every formatting attribute.
            try TestAssertions.assertEqual(inspector.propertiesPanel.node?.id, node.id)
            try TestAssertions.assertEqual(inspector.propertiesPanel.node?.fontWeight ?? "", "bold")
            try TestAssertions.assertEqual(inspector.propertiesPanel.node?.textAlign ?? "", "center")
            try TestAssertions.assertApproxEqual(inspector.propertiesPanel.node?.lineHeight ?? 0, 1.5)
            try TestAssertions.assertApproxEqual(inspector.propertiesPanel.node?.letterSpacing ?? 0, 2)
            try TestAssertions.assertEqual(try formattingMarkerValue(inspector.propertiesPanel, identifier: "Inspector.Properties.Weight"), "bold")
            try TestAssertions.assertEqual(try formattingMarkerValue(inspector.propertiesPanel, identifier: "Inspector.Properties.Align"), "center")

            // Forwarding sends all four values together through InspectorDelegate.
            inspector.propertiesPanel.onFontWeightChange?("heavy")
            try TestAssertions.assertEqual(spy.formattingRecords.count, 1, "One formatting payload per change")
            guard let record = spy.formattingRecords.first else {
                throw TestFailure(message: "No formatting record captured", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(record.id, node.id)
            try TestAssertions.assertEqual(record.fontWeight, "heavy")
            try TestAssertions.assertEqual(record.textAlign, "center")
            try TestAssertions.assertApproxEqual(record.lineHeight, 1.5)
            try TestAssertions.assertApproxEqual(record.letterSpacing, 2)

            inspector.configureProperties(with: nil)
            try TestAssertions.assertNil(inspector.propertiesPanel.node)
        }

        registry.register(tier: 1, feature: "UIParity-TextFormatting", name: "test_UIParity_Inspector_MinimalDelegateDefaultTextFormatting") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            let spy = UIParityMinimalInspectorDelegate()
            inspector.delegate = spy
            try TestAssertions.assertTrue(inspector.delegate === spy)

            // Compiles only because the protocol extension provides a default no-op.
            inspector.delegate?.inspectorDidChangeTextFormatting(
                id: "node-1",
                fontWeight: "bold",
                textAlign: "center",
                lineHeight: 1.5,
                letterSpacing: 2
            )
            try TestAssertions.assertTrue(inspector.delegate === spy)
        }
    }

    // =====================================================================
    // MARK: - 19. TextStyleResolver (2 tests)
    // =====================================================================

    private static func registerTextStyleResolverTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_TextStyle_WeightAndAlignmentMappings") {
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: nil), .regular)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "regular"), .regular)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "THIN"), .thin)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "light"), .light)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "medium"), .medium)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "semibold"), .semibold)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "semi-bold"), .semibold)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "Bold"), .bold)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "black"), .heavy)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "heavy"), .heavy)
            try TestAssertions.assertEqual(TextStyleResolver.nsWeight(for: "unknown-weight"), .regular)

            try TestAssertions.assertEqual(TextStyleResolver.alignment(for: nil), .left)
            try TestAssertions.assertEqual(TextStyleResolver.alignment(for: "left"), .left)
            try TestAssertions.assertEqual(TextStyleResolver.alignment(for: "CENTER"), .center)
            try TestAssertions.assertEqual(TextStyleResolver.alignment(for: "right"), .right)
            try TestAssertions.assertEqual(TextStyleResolver.alignment(for: "justify"), .justified)
            try TestAssertions.assertEqual(TextStyleResolver.alignment(for: "nonsense"), .left)
        }

        registry.register(tier: 1, feature: "UIParity-Text", name: "test_UIParity_TextStyle_ParagraphStyleAttributesAndFont") {
            let formatted = makeFormattingTextNode(fontWeight: "bold", textAlign: "center", lineHeight: 1.5, letterSpacing: 2)
            let paragraph = TextStyleResolver.paragraphStyle(for: formatted)
            try TestAssertions.assertApproxEqual(paragraph.lineHeightMultiple, 1.5)
            try TestAssertions.assertEqual(paragraph.alignment, .center)

            let defaults = makeFormattingTextNode()
            let defaultParagraph = TextStyleResolver.paragraphStyle(for: defaults)
            try TestAssertions.assertApproxEqual(defaultParagraph.lineHeightMultiple, 1.2, "Default line height is 1.2")
            try TestAssertions.assertEqual(defaultParagraph.alignment, .left)

            var cramped = makeFormattingTextNode(lineHeight: 0.1)
            cramped.lineHeight = 0.1
            try TestAssertions.assertApproxEqual(TextStyleResolver.paragraphStyle(for: cramped).lineHeightMultiple, 0.8, "Line height clamps to 0.8")

            let attributes = TextStyleResolver.attributes(for: formatted, color: .white, size: 20)
            try TestAssertions.assertNotNil(attributes[.font])
            try TestAssertions.assertNotNil(attributes[.foregroundColor])
            try TestAssertions.assertNotNil(attributes[.paragraphStyle])
            try TestAssertions.assertApproxEqual(attributes[.kern] as? CGFloat ?? 0, 2, "Letter spacing becomes kern")
            try TestAssertions.assertNil(TextStyleResolver.attributes(for: defaults, color: .white, size: 20)[.kern], "No kern without letter spacing")
            try TestAssertions.assertNil(TextStyleResolver.attributes(for: makeFormattingTextNode(letterSpacing: 0), color: .white, size: 20)[.kern], "Zero spacing omits kern")

            let font = TextStyleResolver.font(for: formatted, size: 20)
            try TestAssertions.assertApproxEqual(font.pointSize, 20, "Resolved font keeps the requested size")
            let tinyFont = TextStyleResolver.font(for: formatted, size: 0)
            try TestAssertions.assertApproxEqual(tinyFont.pointSize, 1, "Font size clamps to 1pt")
        }
    }

    // =====================================================================
    // MARK: - 20. ImageImporter (3 tests)
    // =====================================================================

    private static func registerImageImporterTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Image", name: "test_UIParity_ImageImporter_MakeNodeFromPNGData") {
            let data = try makeTinyPNGData()
            guard let image = NSImage(data: data) else {
                throw TestFailure(message: "Tiny PNG did not decode via NSImage", file: #file, line: #line)
            }
            let canvas = CanvasFrame(width: 400, height: 300)
            let result = try ImageImporter.shared.makeNode(from: data, name: "Tiny", canvas: canvas)

            try TestAssertions.assertEqual(result.node.kind, .image, "Imported node is an image layer")
            try TestAssertions.assertTrue(result.node.src?.hasPrefix("data:image/") == true, "Image is embedded as a data URL")
            try TestAssertions.assertNotNil(result.node.imageId, "Image node carries an imageId")
            try TestAssertions.assertNotNil(result.node.id)
            try TestAssertions.assertEqual(result.node.name, "Tiny 1", "Name gets an image index suffix")
            try TestAssertions.assertEqual(result.embeddedBytes, data.count)
            try TestAssertions.assertEqual(result.naturalSize, image.size)

            // Fitted inside 60% of the canvas, centered like the reference importer.
            let expected = ImageImporter.fittedRect(naturalSize: image.size, canvas: canvas)
            try TestAssertions.assertRectApproxEqual(
                CGRect(x: result.node.x, y: result.node.y, width: result.node.width, height: result.node.height),
                expected,
                accuracy: 0.01
            )
            try TestAssertions.assertTrue(result.node.width <= canvas.width * 0.6 + 0.01)
            try TestAssertions.assertTrue(result.node.height <= canvas.height * 0.6 + 0.01)

            let numbered = try ImageImporter.shared.makeNode(from: data, name: "Tiny", canvas: canvas, existingImageCount: 3)
            try TestAssertions.assertEqual(numbered.node.name, "Tiny 4")
        }

        registry.register(tier: 1, feature: "UIParity-Image", name: "test_UIParity_ImageImporter_FittedRectAndInvalidData") {
            let canvas = CanvasFrame(width: 400, height: 300)
            let largeRect = ImageImporter.fittedRect(
                naturalSize: CGSize(width: 4000, height: 3000),
                canvas: canvas
            )
            // maxW = 240, maxH = 180 -> scale 0.06 -> 240x180 centered at (80, 60).
            try TestAssertions.assertRectApproxEqual(largeRect, CGRect(x: 80, y: 60, width: 240, height: 180), accuracy: 0.01)

            let smallRect = ImageImporter.fittedRect(
                naturalSize: CGSize(width: 100, height: 50),
                canvas: canvas
            )
            // Small images keep their natural size and are centered.
            try TestAssertions.assertRectApproxEqual(smallRect, CGRect(x: 150, y: 125, width: 100, height: 50), accuracy: 0.01)

            try TestAssertions.assertEqual(ImageImporter.maximumEmbeddedBytes, 12 * 1_048_576)

            // A 1-byte payload cannot decode (and stays well under the size limit).
            let error = capturedError {
                try ImageImporter.shared.makeNode(from: Data([0x00]), name: "Bad", canvas: canvas)
            }
            guard let importError = error as? ImageImportError else {
                throw TestFailure(message: "Invalid data did not throw ImageImportError", file: #file, line: #line)
            }
            if case .decodeFailed = importError {
                // expected
            } else {
                throw TestFailure(message: "Expected .decodeFailed, got \(importError)", file: #file, line: #line)
            }
        }

        registry.register(tier: 1, feature: "UIParity-Image", name: "test_UIParity_ImageImporter_DataURLDecoding") {
            let data = try makeTinyPNGData()
            let validURL = "data:image/png;base64,\(data.base64EncodedString())"

            guard let decoded = ImageImporter.cgImage(fromDataURL: validURL) else {
                throw TestFailure(message: "Valid PNG data URL did not decode", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(decoded.width, 2)
            try TestAssertions.assertEqual(decoded.height, 2)

            guard let direct = ImageImporter.cgImage(from: data) else {
                throw TestFailure(message: "Raw PNG data did not decode", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(direct.width, 2)

            try TestAssertions.assertNil(ImageImporter.cgImage(fromDataURL: "data:image/png;base64,AAAA"), "Garbage base64 decodes to nil")
            try TestAssertions.assertNil(ImageImporter.cgImage(fromDataURL: "not-a-data-url"))
            try TestAssertions.assertNil(ImageImporter.cgImage(fromDataURL: "data:image/png,\(data.base64EncodedString())"), "Missing ;base64 marker")
            try TestAssertions.assertNil(ImageImporter.cgImage(from: Data([0x00, 0x01])), "Invalid raw bytes decode to nil")
        }
    }

    // =====================================================================
    // MARK: - 21. Path editing + rotated handles (2 tests)
    // =====================================================================

    private static func registerPathEditingAndRotatedHandlesTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Canvas", name: "test_UIParity_Canvas_PathEditingStateCallbacksAndOverlay") {
            let stage = makeStage()
            try TestAssertions.assertFalse(stage.isPathEditing, "Path editing starts off")
            try TestAssertions.assertNil(stage.selectedAnchorIndex)
            try TestAssertions.assertNil(stage.onPathPointsCommitted)
            try TestAssertions.assertNil(stage.onSelectionTransformCommitted)
            try TestAssertions.assertNil(stage.onDropFiles)

            var pathCommits: [(String, Int, Int)] = []
            var selectionCommits = 0
            var drops: [(Int, CGPoint)] = []
            stage.onPathPointsCommitted = { nodeId, before, after in
                pathCommits.append((nodeId, before.count, after.count))
            }
            stage.onSelectionTransformCommitted = { before, after, rotations, afterRotations in
                _ = before
                _ = after
                _ = rotations
                _ = afterRotations
                selectionCommits += 1
            }
            stage.onDropFiles = { urls, point in
                drops.append((urls.count, point))
            }
            try TestAssertions.assertNotNil(stage.onPathPointsCommitted, "onPathPointsCommitted is host-assignable")
            try TestAssertions.assertNotNil(stage.onSelectionTransformCommitted, "onSelectionTransformCommitted is host-assignable")
            try TestAssertions.assertNotNil(stage.onDropFiles, "onDropFiles is host-assignable")

            // The vector overlay is present and never intercepts canvas gestures.
            try TestAssertions.assertEqual(stage.pathEditingOverlay.accessibilityIdentifier(), "Canvas.PathEditor")
            try TestAssertions.assertNil(stage.pathEditingOverlay.hitTest(NSPoint(x: 1, y: 2)))
            stage.zoom = 0.58
            stage.panOffset = CGPoint(x: 300, y: 200)
            stage.showRulers = true
            try TestAssertions.assertApproxEqual(stage.pathEditingOverlay.zoom, 0.58)
            try TestAssertions.assertApproxEqual(stage.pathEditingOverlay.panOffset.x, 300)
            try TestAssertions.assertApproxEqual(stage.pathEditingOverlay.rulerOffset, ThemeTokens.rulerTrackThickness)

            // Retained callbacks accept the documented payloads.
            let anchor = PenAnchor(x: 0, y: 0, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
            stage.onPathPointsCommitted?("node-1", [anchor], [anchor, anchor])
            stage.onSelectionTransformCommitted?([:], [:], [:], [:])
            stage.onDropFiles?([URL(fileURLWithPath: "/tmp/image.png")], CGPoint(x: 10, y: 20))
            try TestAssertions.assertEqual(pathCommits.count, 1)
            try TestAssertions.assertEqual(pathCommits.first?.0 ?? "", "node-1")
            try TestAssertions.assertEqual(pathCommits.first?.1 ?? -1, 1)
            try TestAssertions.assertEqual(pathCommits.first?.2 ?? -1, 2)
            try TestAssertions.assertEqual(selectionCommits, 1)
            try TestAssertions.assertEqual(drops.first?.0 ?? -1, 1)
            try TestAssertions.assertPointApproxEqual(drops.first?.1 ?? .zero, CGPoint(x: 10, y: 20))

            // Cancelling with no active path edit is a harmless no-op.
            var toolActions: [String] = []
            stage.onToolActionCompleted = { toolActions.append($0) }
            stage.cancelPathEditing()
            try TestAssertions.assertFalse(stage.isPathEditing)
            try TestAssertions.assertNil(stage.selectedAnchorIndex)
            try TestAssertions.assertEqual(toolActions, [])
        }

        registry.register(tier: 1, feature: "UIParity-Transform", name: "test_UIParity_Transform_RotatedHandlesAndPointConverters") {
            let handles = makeTransformHandles(zoom: 1.0, pan: .zero, rulerOffset: 0, contentInset: 0)
            let rect = CGRect(x: 100, y: 50, width: 200, height: 100)
            let center = CGPoint(x: rect.midX, y: rect.midY)

            handles.rotationAngle = 0
            let unrotated = handles.rotatedHandlePoints(for: rect)
            try TestAssertions.assertEqual(unrotated.count, 9)
            try TestAssertions.assertPointApproxEqual(unrotated[.topCenter]!, CGPoint(x: 200, y: 50))

            handles.rotationAngle = 45
            let rotated = handles.rotatedHandlePoints(for: rect)
            try TestAssertions.assertEqual(rotated.count, 9)

            let diagonal = CGFloat(sin(Double.pi / 4.0))
            let expectedTopCenter = CGPoint(
                x: center.x + 50.0 * diagonal,
                y: center.y - 50.0 * diagonal
            )
            try TestAssertions.assertPointApproxEqual(rotated[.topCenter]!, expectedTopCenter, accuracy: 0.01)
            try TestAssertions.assertNotEqual(rotated[.topCenter]!, unrotated[.topCenter]!, "45deg rotation moves the top-center handle")
            try TestAssertions.assertNotEqual(rotated[.bottomRight]!, unrotated[.bottomRight]!)

            // Rotation preserves the radius from the selection centre.
            let unrotatedRadius = hypot(unrotated[.topCenter]!.x - center.x, unrotated[.topCenter]!.y - center.y)
            let rotatedRadius = hypot(rotated[.topCenter]!.x - center.x, rotated[.topCenter]!.y - center.y)
            try TestAssertions.assertApproxEqual(rotatedRadius, unrotatedRadius, accuracy: 0.01)

            // View/document converters round-trip with zoom + pan + ruler inset.
            handles.zoom = 0.58
            handles.panOffset = CGPoint(x: 300, y: 200)
            handles.rulerOffset = 18
            handles.contentInset = 18
            let documentPoint = CGPoint(x: 100, y: 50)
            let viewPoint = handles.viewPoint(forDocumentPoint: documentPoint)
            try TestAssertions.assertPointApproxEqual(viewPoint, CGPoint(x: 358, y: 229), accuracy: 0.01)
            let roundTripped = handles.documentPoint(forViewPoint: viewPoint)
            try TestAssertions.assertPointApproxEqual(roundTripped, documentPoint, accuracy: 0.001)
        }
    }

    // =====================================================================
    // MARK: - 22. LocalCLIBridge (2 tests)
    // =====================================================================

    private static func registerLocalCLIBridgeTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-CLI", name: "test_UIParity_CLI_AgentMetadata") {
            try TestAssertions.assertEqual(LocalCLIAgent.allCases.count, 5)
            try TestAssertions.assertEqual(LocalCLIAgent.claude.binaryName, "claude")
            try TestAssertions.assertEqual(LocalCLIAgent.codex.binaryName, "codex")
            try TestAssertions.assertEqual(LocalCLIAgent.antigravity.binaryName, "agy")
            try TestAssertions.assertEqual(LocalCLIAgent.opencode.binaryName, "opencode")
            try TestAssertions.assertEqual(LocalCLIAgent.deepseekHarness.binaryName, "dsh")

            for agent in LocalCLIAgent.allCases {
                try TestAssertions.assertFalse(agent.displayName.isEmpty)
                try TestAssertions.assertTrue(agent.installCommand.contains("npm install -g"), "\(agent.rawValue) exposes an install command")
                try TestAssertions.assertFalse(agent.installCommand.isEmpty)
                try TestAssertions.assertFalse(agent.packageName.isEmpty)
                try TestAssertions.assertFalse(agent.modelList.isEmpty)
                try TestAssertions.assertFalse(agent.defaultModel.isEmpty)
                try TestAssertions.assertEqual(agent.defaultModel, agent.modelList.first ?? "")
            }

            try TestAssertions.assertEqual(LocalCLIAgent.claude.arguments(forPrompt: "hi").first, "-p")
            try TestAssertions.assertEqual(LocalCLIAgent.codex.arguments(forPrompt: "hi").first, "exec")
            try TestAssertions.assertEqual(LocalCLIAgent.antigravity.arguments(forPrompt: "hi").first, "-p")
            try TestAssertions.assertTrue(
                LocalCLIAgent.claude.arguments(forPrompt: "hi", context: "ctx").last?.contains("ctx") == true,
                "Context is appended to the prompt"
            )
        }

        registry.register(tier: 1, feature: "UIParity-CLI", name: "test_UIParity_CLI_DetectAndMissingBinarySequence") {
            let bridge = LocalCLIBridge()
            bridge.searchPathsOverride = ["/bin"]
            defer {
                bridge.searchPathsOverride = nil
                bridge.cancelAll()
            }
            try TestAssertions.assertEqual(bridge.resolvedSearchPaths(), ["/bin"])

            let status = try awaitAsync { await bridge.detect(.claude) }
            try TestAssertions.assertFalse(status.installed, "No claude binary in /bin")
            try TestAssertions.assertFalse(status.ready)
            try TestAssertions.assertNil(status.binPath)
            try TestAssertions.assertNotNil(status.error)
            try TestAssertions.assertTrue(status.error?.contains("npm install") == true, "Missing-binary error suggests the install command")
            try TestAssertions.assertFalse(status.summary.isEmpty)

            // Missing binary must still produce exactly one .error then one .done(-1).
            let collector = UIParityEventCollector()
            _ = bridge.advance(agent: .codex, prompt: "hello") { event in
                collector.append(event)
            }
            let finished = pumpRunLoop(timeout: 3.0) { collector.hasTerminalDone }
            try TestAssertions.assertTrue(finished, "Missing-binary advance emits a terminal .done within 3s")

            let events = collector.events
            try TestAssertions.assertEqual(events.count, 2, "Exactly .error + .done(-1)")
            guard case .error(let message) = events[0] else {
                throw TestFailure(message: "First event is not .error", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(message.contains("not installed"))
            guard case .done(let code) = events[1] else {
                throw TestFailure(message: "Second event is not .done", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(code, -1)
            try TestAssertions.assertEqual(LocalCLIEvent.error("x").isTerminal, true)
            try TestAssertions.assertEqual(LocalCLIEvent.done(0).isTerminal, true)
            try TestAssertions.assertEqual(LocalCLIEvent.text("x").isTerminal, false)
        }
    }

    // =====================================================================
    // MARK: - 23. AgentPanel streaming (2 tests)
    // =====================================================================

    private static func registerAgentStreamingTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-AgentPanel", name: "test_UIParity_AgentPanel_StreamingLifecycle") {
            let panel = makeAgentPanel()
            try TestAssertions.assertFalse(panel.isStreamingAgentMessage)
            try TestAssertions.assertNil(panel.streamingMessageIndex)
            try TestAssertions.assertEqual(panel.messageTexts, [])

            let index = panel.beginStreamingAgentMessage()
            try TestAssertions.assertEqual(index, 0)
            try TestAssertions.assertTrue(panel.isStreamingAgentMessage)
            try TestAssertions.assertEqual(panel.messageCount, 1)
            try TestAssertions.assertEqual(panel.messageTexts, ["…"], "Stream starts with a placeholder bubble")
            try TestAssertions.assertEqual(panel.streamingMessageIndex, 0)

            // A double begin is idempotent: it resumes the same bubble.
            let resumedIndex = panel.beginStreamingAgentMessage()
            try TestAssertions.assertEqual(resumedIndex, 0)
            try TestAssertions.assertEqual(panel.messageCount, 1)

            panel.appendStreamingText("Hel")
            panel.appendStreamingText("lo")
            try TestAssertions.assertEqual(panel.messageTexts, ["Hello"], "Chunks accumulate in the single bubble")
            try TestAssertions.assertEqual(panel.streamingMessageIndex, 0)

            panel.endStreamingAgentMessage()
            try TestAssertions.assertFalse(panel.isStreamingAgentMessage)
            try TestAssertions.assertNil(panel.streamingMessageIndex)
            try TestAssertions.assertEqual(panel.messageCount, 1, "Ending keeps the single agent bubble")
            try TestAssertions.assertEqual(panel.messageTexts, ["Hello"])

            panel.appendStreamingText("ignored")
            try TestAssertions.assertEqual(panel.messageTexts, ["Hello"], "Late chunks after end are ignored")
        }

        registry.register(tier: 1, feature: "UIParity-AgentPanel", name: "test_UIParity_AgentPanel_ErrorBubbleAndEmptyStream") {
            let panel = makeAgentPanel()
            panel.beginStreamingAgentMessage()
            panel.appendStreamingText("Partial answer")
            panel.appendAgentError("CLI failed to launch")

            try TestAssertions.assertFalse(panel.isStreamingAgentMessage, "Error closes the active stream")
            try TestAssertions.assertEqual(panel.messageCount, 2)
            try TestAssertions.assertEqual(panel.messageTexts, ["Partial answer", "CLI failed to launch"])

            let bubbles = findMessageBubbles(panel)
            try TestAssertions.assertEqual(bubbles.count, 2)
            try TestAssertions.assertTrue(bubbles.last?.isError == true, "Error bubble carries the error treatment")
            try TestAssertions.assertFalse(bubbles.first?.isError == true)

            // A stream that never received text drops its placeholder on end.
            panel.clearConversation()
            try TestAssertions.assertEqual(panel.messageCount, 0)
            panel.beginStreamingAgentMessage()
            try TestAssertions.assertEqual(panel.messageCount, 1)
            panel.endStreamingAgentMessage()
            try TestAssertions.assertEqual(panel.messageCount, 0, "Empty streamed response removes the placeholder")
            try TestAssertions.assertFalse(panel.isStreamingAgentMessage)

            // Blank error text is ignored.
            panel.appendAgentError("   ")
            try TestAssertions.assertEqual(panel.messageCount, 0)
        }
    }

    // =====================================================================
    // MARK: - 24. MenuController image import (1 test)
    // =====================================================================

    private static func registerImportImageMenuTest(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Menu", name: "test_UIParity_Menu_ImportImageItem") {
            let mainMenu = MenuController.shared.buildMainMenu()
            guard let importItem = findMenuItem(in: mainMenu, title: "导入图片… (Import Image…)") else {
                throw TestFailure(message: "Main menu has no Import Image item", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(
                importItem.action == #selector(StudioMenuActions.importImageAction(_:)),
                "Import Image routes to importImageAction:"
            )
            try TestAssertions.assertEqual(importItem.keyEquivalent, "I")
            try TestAssertions.assertTrue(importItem.keyEquivalentModifierMask.contains(.command), "Import Image uses Command")
            try TestAssertions.assertTrue(importItem.keyEquivalentModifierMask.contains(.shift), "Import Image uses Shift (⌘⇧I)")
        }
    }

    // =====================================================================
    // MARK: - Round 6: Spacing / margin / icon alignment regression (15 tests)
    // =====================================================================

    private static func registerSpacingRound6Tests(_ registry: TestRegistry) {
        registerSpacingTitleBarAndToolRailTests(registry)
        registerSpacingEditorChromeTests(registry)
        registerSpacingInspectorAndLayersTests(registry)
        registerSpacingAgentPanelTests(registry)
        registerSpacingModalTests(registry)
    }

    // MARK: Round-6 Helpers

    /// Asserts a headless-layout frame size against the UI_SPEC with the ±1.5pt
    /// tolerance used across the pixel-align regression suite.
    private static func assertFrameSize(
        _ view: NSView,
        width: CGFloat,
        height: CGFloat,
        _ message: String = "",
        accuracy: CGFloat = 1.5,
        file: String = #file,
        line: Int = #line
    ) throws {
        let label = message.isEmpty ? view.accessibilityIdentifier() : message
        try TestAssertions.assertApproxEqual(view.frame.width, width, accuracy: accuracy, "\(label) width", file: file, line: line)
        try TestAssertions.assertApproxEqual(view.frame.height, height, accuracy: accuracy, "\(label) height", file: file, line: line)
    }

    // =====================================================================
    // MARK: - 25. TitleBar + ToolRail spacing (3 tests)
    // =====================================================================

    private static func registerSpacingTitleBarAndToolRailTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_TitleBar_IconAndActionSizes") {
            let bar = makeTitleBar(width: 1440)
            try TestAssertions.assertApproxEqual(bar.frame.height, 40, accuracy: 1.5, "Title bar height is 40")

            // UI_SPEC §1: brand h28, close 16, plus 24, settings 20, save/open h28.
            try TestAssertions.assertApproxEqual(bar.brandLogoButton.frame.height, 28, accuracy: 1.5, "Brand button height")
            try assertFrameSize(bar.tabCloseButton, width: 16, height: 16, "Tab close")
            try assertFrameSize(bar.tabPlusButton, width: 24, height: 24, "Tab plus")
            try assertFrameSize(bar.settingsButton, width: 20, height: 20, "Settings bolt")
            try TestAssertions.assertApproxEqual(bar.saveButton.frame.height, 28, accuracy: 1.5, "Save button height")
            try TestAssertions.assertApproxEqual(bar.openButton.frame.height, 28, accuracy: 1.5, "Open button height")

            // Every chrome control is vertically centred in the 40pt bar.
            let midY = bar.bounds.midY
            for control in [bar.brandLogoButton, bar.tabCloseButton, bar.tabPlusButton,
                            bar.settingsButton, bar.saveButton, bar.openButton] as [NSView] {
                try TestAssertions.assertApproxEqual(control.frame.midY, midY, accuracy: 1.5, "Control vertically centred")
            }

            // Outer margins: traffic-light inset on the left, 16pt right inset.
            try TestAssertions.assertApproxEqual(
                bar.brandLogoButton.frame.minX,
                ThemeTokens.macTrafficLightInset,
                accuracy: 1.5,
                "Brand starts at the traffic-light inset"
            )
            try TestAssertions.assertApproxEqual(
                bar.settingsButton.frame.maxX,
                bar.bounds.width - 16,
                accuracy: 1.5,
                "Settings keeps the 16pt trailing margin"
            )
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_ToolRail_ToolButtonSizes") {
            let rail = ToolRailView()
            rail.layoutSubtreeIfNeeded()
            try TestAssertions.assertApproxEqual(rail.frame.width, 512, accuracy: 1.5, "Default rail width is ~512")
            try TestAssertions.assertApproxEqual(rail.frame.height, 48, accuracy: 1.5, "Rail height is 48")
            try TestAssertions.assertEqual(rail.toolButtons.count, 8, "Eight canonical tools")

            for tool in StudioToolType.allCases {
                guard let button = rail.toolButtons[tool] else {
                    throw TestFailure(message: "Missing tool button \(tool.rawValue)", file: #file, line: #line)
                }
                try assertFrameSize(button, width: 36, height: 36, "Tool \(tool.rawValue)")
            }
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_ToolRail_AccessoryAndAvatarSizes") {
            let rail = ToolRailView()
            rail.layoutSubtreeIfNeeded()

            try TestAssertions.assertEqual(rail.accessoryButtons.count, 3, "hand / lasso / wand accessories")
            for accessory in ToolRailAccessory.allCases {
                guard let button = rail.accessoryButtons[accessory] else {
                    throw TestFailure(message: "Missing accessory \(accessory.rawValue)", file: #file, line: #line)
                }
                try assertFrameSize(button, width: 36, height: 36, "Accessory \(accessory.rawValue)")
            }
            try TestAssertions.assertNotNil(rail.handButton)
            try TestAssertions.assertNotNil(rail.lassoButton)
            try TestAssertions.assertNotNil(rail.wandButton)

            try assertFrameSize(rail.brandAvatarButton, width: 36, height: 36, "VOO brand avatar")
        }
    }

    // =====================================================================
    // MARK: - 26. EditorChrome spacing (4 tests)
    // =====================================================================

    private static func registerSpacingEditorChromeTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_PageSwitcher_Height") {
            try TestAssertions.assertApproxEqual(PageSwitcherPillView.preferredHeight, 36, accuracy: 1.5, "UI_SPEC §6 page pill height")
            let pill = PageSwitcherPillView(frame: NSRect(x: 0, y: 0, width: 160, height: PageSwitcherPillView.preferredHeight))
            try TestAssertions.assertApproxEqual(pill.preferredSize.height, 36, accuracy: 1.5)
            try TestAssertions.assertApproxEqual(pill.intrinsicContentSize.height, 36, accuracy: 1.5)
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_ZoomBar_MetricsAndButtonFrames") {
            try TestAssertions.assertApproxEqual(StudioBottomZoomBar.preferredWidth, 232, accuracy: 1.5, "UI_SPEC §6 zoom bar width")
            try TestAssertions.assertApproxEqual(StudioBottomZoomBar.preferredHeight, 32, accuracy: 1.5, "UI_SPEC §6 zoom bar height")

            let bar = StudioBottomZoomBar(frame: NSRect(
                x: 0,
                y: 0,
                width: StudioBottomZoomBar.preferredWidth,
                height: StudioBottomZoomBar.preferredHeight
            ))
            bar.layoutSubtreeIfNeeded()
            try assertFrameSize(bar, width: 232, height: 32, "Zoom bar")

            let iconButtons = [bar.undoButton, bar.redoButton, bar.gridButton,
                               bar.visibilityButton, bar.zoomInButton, bar.zoomOutButton]
            for button in iconButtons {
                try assertFrameSize(button, width: 28, height: 28, "Zoom bar icon")
                try TestAssertions.assertApproxEqual(button.frame.midY, bar.bounds.midY, accuracy: 1.5, "Icon vertically centred")
            }
            // The zoom readout is the text pill: 28pt tall, 30pt wide in the current
            // source (UI_SPEC lists 28x28 for icon buttons only).
            try TestAssertions.assertApproxEqual(bar.zoomLabelButton.frame.height, 28, accuracy: 1.5, "Zoom label height")
            try TestAssertions.assertApproxEqual(bar.zoomLabelButton.frame.width, 30, accuracy: 1.5, "Zoom label width")
            try TestAssertions.assertApproxEqual(bar.firstSeparator.frame.height, 14, accuracy: 1.5)
            try TestAssertions.assertApproxEqual(bar.secondSeparator.frame.height, 14, accuracy: 1.5)
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_ContextIsland_MetricsAndControlHeights") {
            try TestAssertions.assertApproxEqual(ContextIslandBar.preferredHeight, 32, accuracy: 1.5, "UI_SPEC §6 island height")
            try TestAssertions.assertApproxEqual(ContextIslandBar.glyphButtonSize, 24, accuracy: 1.5)
            try TestAssertions.assertApproxEqual(ContextIslandBar.chipHeight, 24, accuracy: 1.5)

            let island = ContextIslandBar(frame: NSRect(x: 0, y: 0, width: 900, height: ContextIslandBar.preferredHeight))
            island.update(selectionLabel: "Rectangle")
            island.layoutSubtreeIfNeeded()
            try TestAssertions.assertApproxEqual(island.preferredSize.height, 32, accuracy: 1.5)

            try TestAssertions.assertEqual(island.glyphButtons.count, 8)
            for (index, button) in island.glyphButtons.enumerated() {
                try assertFrameSize(button, width: 24, height: 24, "Island glyph \(index)")
            }
            try TestAssertions.assertApproxEqual(island.promptButton.frame.height, 24, accuracy: 1.5, "Island prompt pill height")
            try TestAssertions.assertApproxEqual(island.sparkleButton.frame.height, 24, accuracy: 1.5, "Island sparkle height")
            for chip in island.quickActionChips {
                try TestAssertions.assertApproxEqual(chip.frame.height, 24, accuracy: 1.5, "Island quick-action chip height")
            }
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_AIFloatingButton_IsFortyFour") {
            try TestAssertions.assertApproxEqual(VooAIFloatingButton.preferredSize, 44, accuracy: 1.5, "UI_SPEC §6 FAB size")
            let fab = VooAIFloatingButton(frame: NSRect(x: 0, y: 0, width: VooAIFloatingButton.preferredSize, height: VooAIFloatingButton.preferredSize))
            try assertFrameSize(fab, width: 44, height: 44, "AI FAB")
            try TestAssertions.assertApproxEqual(fab.intrinsicContentSize.width, 44, accuracy: 1.5)
            try TestAssertions.assertApproxEqual(fab.intrinsicContentSize.height, 44, accuracy: 1.5)
        }
    }

    // =====================================================================
    // MARK: - 27. Inspector + LayersPanel spacing (4 tests)
    // =====================================================================

    private static func registerSpacingInspectorAndLayersTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_Inspector_PanelFramesAndMargins") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            inspector.layoutSubtreeIfNeeded()

            try assertFrameSize(inspector.layersPanel, width: 256, height: 238, "UI_SPEC §4 layers card")
            try TestAssertions.assertApproxEqual(inspector.layersPanel.frame.minX, 16, accuracy: 1.5, "Layers card leading margin")
            try TestAssertions.assertApproxEqual(inspector.layersPanel.frame.midY, inspector.bounds.midY, accuracy: 1.5, "Layers card vertically centred")

            try assertFrameSize(inspector.propertiesCard, width: 256, height: 368, "UI_SPEC §5 properties card")
            try TestAssertions.assertApproxEqual(
                inspector.propertiesCard.frame.maxX,
                inspector.bounds.width - 16,
                accuracy: 1.5,
                "Properties card trailing margin"
            )
            try TestAssertions.assertApproxEqual(inspector.propertiesCard.frame.midY, inspector.bounds.midY, accuracy: 1.5, "Properties card vertically centred")

            try assertFrameSize(inspector.propertiesScrollView, width: 256, height: 368, "Properties scroll view fills the card")
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_Inspector_PropertiesDocumentHeight") {
            try TestAssertions.assertApproxEqual(
                PropertiesPanelView.preferredContentHeight,
                520,
                accuracy: 1.5,
                "UI_SPEC §5 scrollable properties content height"
            )

            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            inspector.layoutSubtreeIfNeeded()
            guard let document = inspector.propertiesScrollView.documentView else {
                throw TestFailure(message: "Properties scroll view has no document view", file: #file, line: #line)
            }
            try TestAssertions.assertApproxEqual(
                document.frame.height,
                PropertiesPanelView.preferredContentHeight,
                accuracy: 1.5,
                "Properties document height"
            )
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_LayersPanel_HeaderControlSizes") {
            let panel = LayersPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 238))
            panel.layoutSubtreeIfNeeded()

            try assertFrameSize(try requireButton(panel, id: "Layers.Search"), width: 21, height: 21, "Layers search button")
            try assertFrameSize(try requireButton(panel, id: "Layers.Sort"), width: 21, height: 21, "Layers sort button")
            try TestAssertions.assertApproxEqual(
                try requireView(panel, id: "Layers.Opacity").frame.height,
                28,
                accuracy: 1.5,
                "Opacity pill height"
            )
            try TestAssertions.assertApproxEqual(
                try requireView(panel, id: "Layers.Blend").frame.height,
                28,
                accuracy: 1.5,
                "Blend pill height"
            )
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_LayersPanel_FooterButtonsAndRowHeight") {
            let panel = LayersPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 238))
            panel.layoutSubtreeIfNeeded()

            for identifier in ["Layers.Add", "Layers.Mask", "Layers.Group", "Layers.Delete"] {
                try assertFrameSize(try requireButton(panel, id: identifier), width: 24, height: 24, "Footer \(identifier)")
            }

            let card = VOONode(kind: .rect, name: "Card A", x: 0, y: 0, width: 100, height: 80)
            panel.configure(with: [card], selectedId: card.id)
            panel.layoutSubtreeIfNeeded()

            guard let table = findLayersTable(panel) else {
                throw TestFailure(message: "Layers panel has no table view", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(table.rowHeight <= 32.0 + 1.5, "UI_SPEC §4 row height ~32 (actual \(table.rowHeight))")
            try TestAssertions.assertTrue(table.rowHeight >= 24.0, "Row height stays tappable (actual \(table.rowHeight))")
        }
    }

    // =====================================================================
    // MARK: - 28. AgentPanel spacing (2 tests)
    // =====================================================================

    private static func registerSpacingAgentPanelTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_AgentPanel_WidthAndComposer") {
            try TestAssertions.assertApproxEqual(AgentPanelMetrics.panelWidth, 364, accuracy: 1.5, "UI_SPEC §6 panel width")
            try TestAssertions.assertApproxEqual(AgentPanelMetrics.composerHeight, 130, accuracy: 1.5, "UI_SPEC §7 composer height")

            let panel = AgentPanelView(frame: NSRect(x: 0, y: 0, width: 364, height: 836))
            panel.layoutSubtreeIfNeeded()
            try TestAssertions.assertApproxEqual(panel.frame.width, 364, accuracy: 1.5)
            try TestAssertions.assertApproxEqual(panel.frame.height, 836, accuracy: 1.5)
            try TestAssertions.assertApproxEqual(panel.header.frame.height, AgentPanelMetrics.headerHeight, accuracy: 1.5, "Header height")

            try assertFrameSize(panel.composer, width: 340, height: 130, "Composer card")
            try TestAssertions.assertApproxEqual(panel.composer.frame.minX, 12, accuracy: 1.5, "Composer side inset")
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_AgentPanel_SuggestionChipsAndHeaderIcons") {
            try TestAssertions.assertApproxEqual(AgentPanelMetrics.suggestionChipHeight, 38, accuracy: 1.5)
            try TestAssertions.assertApproxEqual(AgentPanelMetrics.iconButtonSize, 32, accuracy: 1.5)

            let panel = AgentPanelView(frame: NSRect(x: 0, y: 0, width: 364, height: 836))
            panel.layoutSubtreeIfNeeded()

            try TestAssertions.assertEqual(panel.introView.chipViews.count, 3)
            for (index, chip) in panel.introView.chipViews.enumerated() {
                try assertFrameSize(chip, width: 332, height: 38, "Suggestion chip \(index)")
            }

            for button in [panel.header.historyButton, panel.header.newChatButton, panel.header.collapseButton] {
                try assertFrameSize(button, width: 32, height: 32, "Header icon")
            }
        }
    }

    // =====================================================================
    // MARK: - 29. Settings + Onboarding modal spacing (2 tests)
    // =====================================================================

    private static func registerSpacingModalTests(_ registry: TestRegistry) {

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_Settings_ModalSizes") {
            let preferred = SettingsDrawerView.preferredModalSize
            try TestAssertions.assertApproxEqual(preferred.width, 1040, accuracy: 1.5, "UI_SPEC §9 settings width")
            try TestAssertions.assertApproxEqual(preferred.height, 760, accuracy: 1.5, "UI_SPEC §9 settings height")
            try TestAssertions.assertEqual(preferred, NSSize(width: 1040, height: 760))

            let minimum = SettingsDrawerView.minimumModalSize
            try TestAssertions.assertTrue(minimum.width > 0)
            try TestAssertions.assertTrue(minimum.height > 0)
            try TestAssertions.assertTrue(minimum.width < preferred.width, "Minimum width is below the preferred width")
            try TestAssertions.assertTrue(minimum.height < preferred.height, "Minimum height is below the preferred height")
            try TestAssertions.assertTrue(minimum.width >= 800, "Minimum width stays usable (actual \(minimum.width))")
            try TestAssertions.assertTrue(minimum.height >= 500, "Minimum height stays usable (actual \(minimum.height))")
        }

        registry.register(tier: 1, feature: "UIParity-Spacing", name: "test_UIParity_Spacing_Onboarding_CloseButtonAndProgress") {
            defer { resetOnboardingState() }
            resetOnboardingState()

            let guide = OnboardingGuideView(frame: NSRect(x: 0, y: 0, width: 1440, height: 900))
            guide.present(step: 0)

            // UI_SPEC §8: 32x32 close button.
            let close = try requireButton(guide, id: "Onboarding.Close")
            try assertFrameSize(close, width: 32, height: 32, "Onboarding close button")
            let next = try requireButton(guide, id: "Onboarding.Next")
            try TestAssertions.assertApproxEqual(next.frame.height, 32, accuracy: 1.5, "Onboarding primary CTA height")
            try TestAssertions.assertNotNil(findView(guide, id: "Onboarding.StepProgress"), "Step progress element exists")
            try TestAssertions.assertNotNil(findView(guide, id: "Onboarding.Skip"))
        }
    }
}

// MARK: - Round-5 Mock Delegates & Async Helpers

/// Records the four-value text-formatting payload forwarded by InspectorView.
private final class UIParityFormattingInspectorDelegate: InspectorDelegate {
    struct FormattingRecord {
        let id: String
        let fontWeight: String
        let textAlign: String
        let lineHeight: CGFloat
        let letterSpacing: CGFloat
    }

    private(set) var formattingRecords: [FormattingRecord] = []
    private(set) var typographyRecords: [(id: String, fontFamily: String, fontSize: CGFloat)] = []

    func inspectorDidChangeTextFormatting(
        id: String,
        fontWeight: String,
        textAlign: String,
        lineHeight: CGFloat,
        letterSpacing: CGFloat
    ) {
        formattingRecords.append(FormattingRecord(
            id: id,
            fontWeight: fontWeight,
            textAlign: textAlign,
            lineHeight: lineHeight,
            letterSpacing: letterSpacing
        ))
    }

    func inspectorDidChangeTextTypography(id: String, fontFamily: String, fontSize: CGFloat) {
        typographyRecords.append((id: id, fontFamily: fontFamily, fontSize: fontSize))
    }
}

/// Thread-safe result slot used by `awaitAsync`.
private final class UIParityAsyncBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: T?

    func set(_ newValue: T) {
        lock.lock()
        value = newValue
        lock.unlock()
    }

    func get() -> T? {
        lock.lock()
        defer { lock.unlock() }
        return value
    }
}

/// Thread-safe event sink for the LocalCLIBridge streaming tests.
private final class UIParityEventCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [LocalCLIEvent] = []

    func append(_ event: LocalCLIEvent) {
        lock.lock()
        storage.append(event)
        lock.unlock()
    }

    var events: [LocalCLIEvent] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }

    var hasTerminalDone: Bool {
        for event in events {
            if case .done = event { return true }
        }
        return false
    }
}

// MARK: - Round-4 Mock Delegates

/// Intentionally implements NOTHING: every `InspectorDelegate` requirement is
/// satisfied by the protocol extension's default implementations. Its existence
/// proves the text-typography callback has a default no-op.
private final class UIParityMinimalInspectorDelegate: InspectorDelegate {}
