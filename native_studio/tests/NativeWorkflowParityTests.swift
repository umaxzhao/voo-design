#if INTEGRATED
    import AppKit
    import Foundation

    public enum NativeWorkflowParityTests {
        public static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-Titlebar",
                name: "test_TabDirtyIndicatorFollowsDocumentMutationAndUndo"
            ) {
                let controller = WindowController(contentView: MainContentView())
                let stage = controller.mainContentView.canvasStageView
                controller.savedDocumentSnapshot = stage.document
                controller.syncChromeState()
                try TestAssertions.assertFalse(controller.mainContentView.titleBar.state.isDirty)
                let color =
                    stage.document.workspaceBackgroundColor == "#FFFFFF" ? "#262626" : "#FFFFFF"
                try TestAssertions.assertTrue(controller.applyCanvasBackground(color))
                try TestAssertions.assertTrue(controller.mainContentView.titleBar.state.isDirty)
                _ = controller.commandManager.undo(on: &stage.document)
                controller.syncChromeState()
                try TestAssertions.assertFalse(controller.mainContentView.titleBar.state.isDirty)
                let file = FileManager.default.temporaryDirectory
                    .appendingPathComponent("voo-tab-save-\(UUID().uuidString).voo")
                controller.currentFileURL = file
                try TestAssertions.assertTrue(controller.applyCanvasBackground(color))
                controller.saveDocument(nil)
                try TestAssertions.assertTrue(FileManager.default.fileExists(atPath: file.path))
                try TestAssertions.assertFalse(controller.mainContentView.titleBar.state.isDirty)
                _ = controller.commandManager.undo(on: &stage.document)
                controller.syncChromeState()
                try TestAssertions.assertTrue(controller.mainContentView.titleBar.state.isDirty)
                _ = controller.commandManager.redo(on: &stage.document)
                controller.syncChromeState()
                try TestAssertions.assertFalse(controller.mainContentView.titleBar.state.isDirty)
                try FileManager.default.removeItem(at: file)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_FormLayerCardShowsAllRowsAndCanvasBackgroundWithoutScrolling"
            ) {
                let root = URL(fileURLWithPath: #filePath)
                    .deletingLastPathComponent().deletingLastPathComponent()
                    .deletingLastPathComponent()
                let document = try DocumentIO.shared.loadDocument(
                    from: root.appendingPathComponent("docs/examples/form-poster.voo"))
                try TestAssertions.assertEqual(document.nodes.count, 14)
                let inspector = InspectorView(
                    frame: CGRect(x: 0, y: 0, width: 1908, height: 944))
                inspector.layersPanel.canvasBackgroundColor = document.workspaceBackgroundColor
                inspector.layersPanel.configure(
                    with: document.nodes, selectedId: document.nodes.last?.id)
                for _ in 0..<3 { inspector.layoutSubtreeIfNeeded() }
                let panel = inspector.layersPanel
                try TestAssertions.assertEqual(
                    panel.visibleNodes.first?.name, "FORM — Design Culture")
                try TestAssertions.assertEqual(panel.visibleNodes.dropFirst().first?.name, "Number")
                try TestAssertions.assertEqual(panel.visibleNodes.last?.name, "Frame")
                try TestAssertions.assertEqual(panel.nodes, document.nodes)
                try TestAssertions.assertApproxEqual(panel.frame.height, 676)
                try TestAssertions.assertApproxEqual(panel.frame.midY, inspector.bounds.midY)
                guard let table = descendants(panel).compactMap({ $0 as? LayersTableView }).first,
                    let scroll = table.enclosingScrollView
                else { throw TestFailure(message: "Layer tree missing", file: #file, line: #line) }
                try TestAssertions.assertEqual(table.numberOfRows, 14)
                try TestAssertions.assertApproxEqual(scroll.contentView.bounds.minY, 0)
                for row in 0..<table.numberOfRows {
                    try TestAssertions.assertTrue(
                        scroll.contentView.bounds.contains(table.rect(ofRow: row)),
                        "Every authored FORM row is fully visible: row=\(row), "
                            + "rowRect=\(table.rect(ofRow: row)), clip=\(scroll.contentView.bounds), "
                            + "table=\(table.frame), scroll=\(scroll.frame)")
                }
                guard
                    let background = descendants(panel).first(where: {
                        $0.accessibilityIdentifier() == "Layers.CanvasBackground"
                    })
                else {
                    throw TestFailure(
                        message: "Canvas background row missing", file: #file, line: #line)
                }
                try TestAssertions.assertFalse(background.isHidden)
                panel.searchQuery = "Artwork field"
                for _ in 0..<3 { inspector.layoutSubtreeIfNeeded() }
                try TestAssertions.assertTrue(panel.frame.height < 676)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_InspectorFlipUsesTheSharedUndoableSelectionOperation"
            ) {
                let controller = WindowController()
                let stage = controller.mainContentView.canvasStageView
                let node = VOONode(
                    id: "flip-target", kind: .path, x: 10, y: 20, width: 80, height: 60,
                    points: [PenAnchor(x: 30, y: 40)])
                stage.document.nodes = [node]
                stage.selectedNodeIds = [node.id]
                controller.mainContentView.inspector.propertiesPanel.onFlipRequest?(true)
                try TestAssertions.assertApproxEqual(stage.document.nodes[0].points![0].x, 70)
                try TestAssertions.assertEqual(controller.commandManager.undoStack.count, 1)
                try TestAssertions.assertTrue(controller.commandManager.undo(on: &stage.document))
                try TestAssertions.assertEqual(stage.document.nodes[0], node)
                controller.mainContentView.inspector.propertiesPanel.onFlipRequest?(false)
                try TestAssertions.assertApproxEqual(stage.document.nodes[0].points![0].y, 60)
                try TestAssertions.assertEqual(controller.commandManager.undoStack.count, 1)
                try TestAssertions.assertTrue(controller.commandManager.undo(on: &stage.document))
                try TestAssertions.assertEqual(stage.document.nodes[0], node)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_UnavailableRailToolsPreserveArtworkAndCurrentTool"
            ) {
                let controller = WindowController()
                let stage = controller.mainContentView.canvasStageView
                stage.document.nodes = [VOONode(id: "untouched", kind: .rect)]
                stage.selectedNodeIds = ["untouched"]
                let before = stage.document
                let tool = stage.activeTool
                for accessory: ToolRailAccessory in [.crop, .healing] {
                    controller.activateAccessoryTool(accessory)
                    try TestAssertions.assertEqual(stage.document, before)
                    try TestAssertions.assertEqual(stage.activeTool, tool)
                    try TestAssertions.assertTrue(controller.commandManager.undoStack.isEmpty)
                    try TestAssertions.assertFalse(controller.nativeStatusBanner.isHidden)
                }
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_DefaultSelectionRailUsesMarqueeAndRetainsLegacyLasso"
            ) {
                let controller = WindowController()
                let stage = controller.mainContentView.canvasStageView
                controller.activateAccessoryTool(.marquee)
                try TestAssertions.assertTrue(stage.selectionStyle == .marquee)
                controller.activateAccessoryTool(.lasso)
                try TestAssertions.assertTrue(stage.selectionStyle == .lasso)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_DesignSelectionNotifiesHostAfterMeasuringConfiguredPaintRows"
            ) {
                let panel = PropertiesPanelView(frame: CGRect(x: 0, y: 0, width: 288, height: 800))
                var measured: [CGFloat] = []
                panel.onPresentationChange = { measured.append(panel.contentHeight) }
                var node = VOONode(
                    kind: .rect, style: LayerStyle(fill: "#FF0000", stroke: "none", strokeWidth: 0))
                panel.configure(with: node)
                node.style.stroke = "#191919"
                node.style.strokeWidth = 2
                panel.configure(with: node)
                try TestAssertions.assertEqual(measured.count, 2)
                try TestAssertions.assertTrue(
                    measured[1] > measured[0],
                    "Adding a visible stroke changes the measured card height")
                try TestAssertions.assertApproxEqual(measured[1], panel.contentHeight)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_CodeModeDoesNotPaintDesignRowSurfaces"
            ) {
                let panel = PropertiesPanelView(frame: CGRect(x: 0, y: 0, width: 288, height: 800))
                panel.configure(with: VOONode(kind: .rect))
                panel.layoutSubtreeIfNeeded()
                panel.headerTabs.select(value: "code", notify: true)
                panel.layoutSubtreeIfNeeded()
                let bitmap = panel.bitmapImageRepForCachingDisplay(in: panel.bounds)!
                panel.cacheDisplay(in: panel.bounds, to: bitmap)
                let scale = CGFloat(bitmap.pixelsHigh) / panel.bounds.height
                for y in stride(from: 480, through: 700, by: 16) {
                    let pixel = bitmap.colorAt(x: Int(30 * scale), y: Int(CGFloat(y) * scale))!
                    try TestAssertions.assertTrue(
                        pixel.alphaComponent < 0.01,
                        "Code mode must not draw old Design row backgrounds")
                }
            }
            registry.register(
                tier: 3, feature: "Native-Lifecycle",
                name: "test_MenuOpenLeavesWelcomeOnlyAfterSuccessfulLoad"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                controller.mainContentView.isWelcomeOpen = true
                controller.mainContentView.frame.size = NSSize(width: 1440, height: 900)
                let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(
                    UUID().uuidString + ".voo")
                defer { try? FileManager.default.removeItem(at: url) }
                let document = VOODocument(
                    title: "Opened", nodes: [VOONode(id: "opened", kind: .rect)])
                try DocumentIO.shared.saveDocument(document, to: url)
                controller.openDocumentFromURL(url)
                let stage = controller.mainContentView.canvasStageView
                let origin = stage.viewPoint(from: .zero)
                try TestAssertions.assertTrue(
                    origin.x >= 0 && origin.y >= 0,
                    "Opening from Welcome fits only after editor layout")
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
                        fill: "linear-gradient(180deg, #FFFFFF 0%, #000000 100%)",
                        stroke: "#00FF00",
                        strokeWidth: 8))
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
                let stageColor = TestBitmapSampling.color(
                    bitmap, x: bitmap.pixelsWide / 2, y: bitmap.pixelsHigh / 2)
                let exported = NSBitmapImageRep(
                    cgImage: try ExportEngine.shared.renderImage(document: document, scale: 1))
                let exportedColor = TestBitmapSampling.color(exported, x: 32, y: 32)
                try TestAssertions.assertApproxEqual(
                    stageColor.redComponent, exportedColor.redComponent, accuracy: 0.04)
                let edge = TestBitmapSampling.color(exported, x: 2, y: 32)
                try TestAssertions.assertTrue(
                    edge.greenComponent > 0.9 && edge.redComponent < 0.1,
                    "Gradient export retains the solid outline")
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
                for button in content.toolRail.toolButtons.values where !button.isHidden {
                    try TestAssertions.assertApproxEqual(button.frame.width, 44)
                }
                content.toolRail.scrollTools(by: 1000)
                let last = content.toolRail.healingButton!
                let end = last.convert(last.bounds, to: content.toolRail)
                try TestAssertions.assertTrue(end.maxX <= content.toolRail.bounds.width)
                content.toolRail.scrollTools(by: -1000)
                let first = content.toolRail.moveToolButton
                try TestAssertions.assertTrue(
                    first.convert(first.bounds, to: content.toolRail).minX >= 0)
            }
        }
        private static func descendants(_ root: NSView) -> [NSView] {
            [root] + root.subviews.flatMap(descendants)
        }
    }
#endif
