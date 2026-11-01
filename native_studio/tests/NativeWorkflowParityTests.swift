#if INTEGRATED
    import AppKit
    import Foundation

    public enum NativeWorkflowParityTests {
        public static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-Lifecycle",
                name: "test_MenuOpenLeavesWelcomeOnlyAfterSuccessfulLoad"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                controller.mainContentView.isWelcomeOpen = true
                let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(
                    UUID().uuidString + ".voo")
                defer { try? FileManager.default.removeItem(at: url) }
                let document = VOODocument(
                    title: "Opened", nodes: [VOONode(id: "opened", kind: .rect)])
                try DocumentIO.shared.saveDocument(document, to: url)
                controller.openDocumentFromURL(url)
                try TestAssertions.assertFalse(controller.mainContentView.isWelcomeOpen)
                try TestAssertions.assertEqual(
                    controller.mainContentView.canvasStageView.document.nodes.first?.id, "opened")
            }
            registry.register(
                tier: 3, feature: "Native-Lifecycle",
                name: "test_NewAndOpenCancelPreserveUnsavedArtworkAndUndo"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                let stage = controller.mainContentView.canvasStageView
                let node = VOONode(
                    id: "unsaved", kind: .rect, x: 100, y: 100, width: 40, height: 40)
                _ = controller.commandManager.execute(
                    InsertNodeCommand(node: node), on: &stage.document)
                let original = stage.document
                controller.documentReplacementDecision = { false }
                try TestAssertions.assertFalse(controller.requestNewDocument())
                try TestAssertions.assertEqual(stage.document, original)
                try TestAssertions.assertTrue(controller.commandManager.canUndo)
                let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(
                    UUID().uuidString + ".voo")
                defer { try? FileManager.default.removeItem(at: url) }
                try DocumentIO.shared.saveDocument(VOODocument(nodes: []), to: url)
                controller.openDocumentFromURL(url)
                try TestAssertions.assertEqual(stage.document, original)
                try TestAssertions.assertTrue(controller.commandManager.canUndo)
                controller.documentReplacementDecision = { true }
                try TestAssertions.assertTrue(controller.requestNewDocument())
                try TestAssertions.assertFalse(stage.document.nodes.contains { $0.id == "unsaved" })
            }
            registry.register(
                tier: 3, feature: "Native-AgentEntry",
                name: "test_WelcomeAndPanelDispatchTheSameRealAgentOperationOnce"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                var requests: [String] = []
                controller.agentRequestDispatcher = { requests.append($0) }
                controller.mainContentView.welcomeDashboard.onPromptSubmit?(
                    "Create a blue rectangle")
                try TestAssertions.assertEqual(requests, ["Create a blue rectangle"])
                try TestAssertions.assertFalse(controller.mainContentView.isWelcomeOpen)
                try TestAssertions.assertTrue(controller.mainContentView.isAgentPanelOpen)
                controller.mainContentView.agentPanel.onSend?("Refine the rectangle")
                try TestAssertions.assertEqual(
                    requests, ["Create a blue rectangle", "Refine the rectangle"])
            }
            registry.register(
                tier: 3, feature: "Native-Rendering",
                name: "test_GradientStageAndExportPixelsMatchAndTopLeftCoordinatesStayUpright"
            ) {
                let gradient = VOONode(
                    id: "gradient", kind: .rect, x: 0, y: 0, width: 64, height: 64,
                    style: LayerStyle(
                        fill: "linear-gradient(180deg, #FFFFFF 0%, #000000 100%)", stroke: "none",
                        strokeWidth: 0))
                let document = VOODocument(
                    canvas: CanvasFrame(width: 64, height: 64, backgroundColor: "#FFFFFF"),
                    nodes: [gradient])
                let stage = CanvasStageView(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
                stage.document = document
                stage.zoom = 1
                stage.panOffset = .zero
                stage.showRulers = false
                for view in stage.subviews { view.isHidden = true }
                let bitmap = stage.bitmapImageRepForCachingDisplay(in: stage.bounds)!
                stage.cacheDisplay(in: stage.bounds, to: bitmap)
                let stageColor = bitmap.colorAt(x: bitmap.pixelsWide / 2, y: bitmap.pixelsHigh / 2)!
                    .usingColorSpace(.deviceRGB)!
                let exported = NSBitmapImageRep(
                    cgImage: try ExportEngine.shared.renderImage(document: document, scale: 1))
                let exportedColor = exported.colorAt(x: 32, y: 32)!.usingColorSpace(.deviceRGB)!
                try TestAssertions.assertApproxEqual(
                    stageColor.redComponent, exportedColor.redComponent, accuracy: 0.04)
                try TestAssertions.assertTrue(stage.isFlipped)
                try TestAssertions.assertTrue(
                    stage.viewPoint(from: CGPoint(x: 0, y: 10)).y
                        < stage.viewPoint(from: CGPoint(x: 0, y: 50)).y)
            }
            registry.register(
                tier: 3, feature: "Native-PaintEditor",
                name: "test_OpeningGradientSwatchDoesNotCommitOrDestroyGradient"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                let stage = controller.mainContentView.canvasStageView
                let gradient = VOONode(
                    id: "gradient", kind: .rect, x: 100, y: 100, width: 50, height: 50,
                    style: LayerStyle(fill: "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)"))
                stage.document.nodes.append(gradient)
                stage.selectedNodeIds = [gradient.id]
                let before = stage.document
                let button = descendants(controller.mainContentView.inspector.propertiesPanel)
                    .compactMap {
                        $0 as? NSButton
                    }.first { $0.accessibilityLabel() == "Colour swatch" }
                try TestAssertions.assertNotNil(button)
                button?.performClick(nil)
                try TestAssertions.assertEqual(stage.document, before)
                NSColorPanel.shared.close()
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_SearchRetainsAncestorsAndLeavesDocumentUntouched"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                let stage = controller.mainContentView.canvasStageView
                let parent = VOONode(id: "parent", kind: .group, name: "Container")
                var child = VOONode(id: "child", kind: .rect, name: "Blue rectangle")
                child.parentId = parent.id
                let other = VOONode(id: "other", kind: .rect, name: "Other")
                stage.document.nodes = [parent, child, other]
                let panel = controller.mainContentView.inspector.layersPanel
                panel.configure(with: stage.document.nodes, selectedId: nil)
                let before = stage.document
                panel.searchQuery = "BLUE"
                try TestAssertions.assertEqual(panel.visibleNodes.map(\.id), ["parent", "child"])
                panel.searchQuery = "missing"
                try TestAssertions.assertEqual(panel.visibleRowCount, 0)
                panel.searchQuery = ""
                try TestAssertions.assertEqual(panel.visibleRowCount, 3)
                try TestAssertions.assertEqual(stage.document, before)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_CodeTabRefreshesSelectionAndBothSwapEntriesUseOneOperation"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                let inspector = controller.mainContentView.inspector
                let panel = inspector.propertiesPanel
                let first = VOONode(
                    id: "code-rect", kind: .rect, name: "Rectangle", width: 80, height: 40)
                panel.configure(with: first)
                panel.headerTabs.select(value: "code", notify: true)
                panel.layoutSubtreeIfNeeded()
                let source = descendants(panel).compactMap { $0 as? NSTextView }.first {
                    $0.accessibilityIdentifier() == "Inspector.Code.Source"
                }
                try TestAssertions.assertNotNil(source)
                try TestAssertions.assertTrue(source?.string.contains("width: 80px;") == true)
                var second = VOONode(id: "code-text", kind: .text, name: "Text")
                second.fontSize = 32
                panel.configure(with: second)
                try TestAssertions.assertTrue(source?.string.contains("font-size: 32px;") == true)
                panel.headerTabs.select(value: "design", notify: true)
                try TestAssertions.assertTrue(source?.enclosingScrollView?.isHidden == true)
                inspector.layersPanel.onSortTapped?()
                try TestAssertions.assertTrue(inspector.panelsAreSwapped)
                panel.onSwapPanels?()
                try TestAssertions.assertFalse(inspector.panelsAreSwapped)
            }
            registry.register(
                tier: 3, feature: "Native-ToolRail",
                name: "test_BrushReentryOpensBrushSettingsAndNarrowRailStaysInsideEditor"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                let content = controller.mainContentView
                controller.window?.setContentSize(NSSize(width: 960, height: 700))
                content.frame.size = NSSize(width: 960, height: 700)
                content.setAgentPanelOpen(true)
                content.layoutSubtreeIfNeeded()
                content.toolRail.layoutSubtreeIfNeeded()
                var opened = 0
                content.toolRail.onBrushSettingsRequested = { _ in opened += 1 }
                content.toolRail.brushToolButton.performClick(nil)
                content.toolRail.brushToolButton.performClick(nil)
                try TestAssertions.assertEqual(opened, 1)
                let railInWindow = content.toolRail.convert(content.toolRail.bounds, to: content)
                try TestAssertions.assertTrue(
                    railInWindow.minX >= 0 && railInWindow.maxX <= content.bounds.width)
                for button in content.toolRail.toolButtons.values {
                    try TestAssertions.assertTrue(
                        button.frame.minX >= 0
                            && button.frame.maxX <= content.toolRail.bounds.width,
                        "Tool remains inside rail")
                }
            }
        }
        private static func descendants(_ root: NSView) -> [NSView] {
            [root] + root.subviews.flatMap(descendants)
        }
    }
#endif
