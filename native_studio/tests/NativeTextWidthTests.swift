#if INTEGRATED
    import AppKit

    enum NativeTextWidthTests {
        static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-TextWidth",
                name: "test_TextWidthPanelCommitsRealModeAndPersistsUndoRedo"
            ) {
                let controller = WindowController()
                let stage = controller.mainContentView.canvasStageView
                var original = fixture()
                original.width = 100
                original.portableProperties["customTextData"] = .string("preserved")
                stage.document = VOODocument(nodes: [original])
                stage.selectNode(id: original.id)
                controller.refreshAfterDocumentMutation()
                let panel = controller.mainContentView.inspector.propertiesPanel
                try TestAssertions.assertTrue(panel.textBoxWidthPill.isHidden)
                panel.textWidthModeControl.select(value: "fixed", notify: true)
                let fixed = stage.document.nodes[0]
                try TestAssertions.assertEqual(fixed.boxWidth, 100)
                try TestAssertions.assertTrue(fixed.height > 25)
                try TestAssertions.assertFalse(panel.textBoxWidthPill.isHidden)
                try TestAssertions.assertApproxEqual(panel.textWidthModeControl.frame.height, 32)
                try TestAssertions.assertApproxEqual(panel.textBoxWidthPill.frame.height, 32)
                try TestAssertions.assertEqual(controller.commandManager.undoCount, 1)
                controller.undoAction(nil)
                try TestAssertions.assertEqual(stage.document.nodes[0], original)
                controller.redoAction(nil)
                try TestAssertions.assertEqual(stage.document.nodes[0], fixed)
                let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(
                    UUID().uuidString + ".voo")
                defer { try? FileManager.default.removeItem(at: url) }
                try DocumentIO.shared.saveDocument(stage.document, to: url)
                let reopened = try DocumentIO.shared.loadDocument(from: url)
                try TestAssertions.assertEqual(reopened.nodes[0].boxWidth, fixed.boxWidth)
                try TestAssertions.assertEqual(reopened.nodes[0].height, fixed.height)
                try TestAssertions.assertEqual(
                    reopened.nodes[0].portableProperties["customTextData"], .string("preserved"))
                panel.textWidthModeControl.select(value: "auto", notify: true)
                try TestAssertions.assertEqual(stage.document.nodes[0].boxWidth, 0)
                try TestAssertions.assertApproxEqual(stage.document.nodes[0].height, 25)
            }
            registry.register(
                tier: 3, feature: "Native-TextWidth",
                name: "test_TextWidthScrubIsOneUndoAndReturnToStartRetainsRedo"
            ) {
                let controller = WindowController()
                let stage = controller.mainContentView.canvasStageView
                let original = fixture()
                stage.document = VOODocument(nodes: [original])
                controller.inspectorTextBoxInteractionChanged(active: true)
                _ = try controller.applyTextLayout(id: original.id, boxWidth: 110)
                _ = try controller.applyTextLayout(id: original.id, boxWidth: 80)
                controller.inspectorTextBoxInteractionChanged(active: false)
                try TestAssertions.assertEqual(controller.commandManager.undoCount, 1)
                controller.undoAction(nil)
                try TestAssertions.assertEqual(stage.document.nodes[0], original)
                try TestAssertions.assertEqual(controller.commandManager.redoCount, 1)
                controller.inspectorTextBoxInteractionChanged(active: true)
                _ = try controller.applyTextLayout(id: original.id, boxWidth: 90)
                _ = try controller.applyTextLayout(
                    id: original.id, italic: false, underline: false, boxWidth: 0)
                controller.inspectorTextBoxInteractionChanged(active: false)
                try TestAssertions.assertEqual(stage.document.nodes[0], original)
                try TestAssertions.assertEqual(controller.commandManager.undoCount, 0)
                try TestAssertions.assertEqual(controller.commandManager.redoCount, 1)
            }
            registry.register(
                tier: 3, feature: "Native-TextWidth",
                name: "test_TextWidthWrapsWordsLongTokensCJKAndPreservesNewlines"
            ) {
                var node = fixture()
                let auto = try NativeTextBoxLayout.settingWidth(0, on: node)
                try TestAssertions.assertApproxEqual(auto.height, 25)
                let fixed = try NativeTextBoxLayout.settingWidth(70, on: node)
                try TestAssertions.assertApproxEqual(fixed.width, 70)
                try TestAssertions.assertTrue(fixed.height > auto.height)
                node.text = "WWWWWWWWWWWW"
                try TestAssertions.assertTrue(
                    try NativeTextBoxLayout.settingWidth(40, on: node).height > 25)
                node.text = "中文测试文本自动换行"
                try TestAssertions.assertTrue(
                    try NativeTextBoxLayout.settingWidth(40, on: node).height > 25)
                node.text = "中"
                node.fontSize = 40
                let glyphWidth = try NativeTextBoxLayout.settingWidth(0, on: node).width
                let tiny = try NativeTextBoxLayout.settingWidth(8, on: node)
                try TestAssertions.assertEqual(tiny.boxWidth, 8)
                try TestAssertions.assertApproxEqual(tiny.width, max(8, glyphWidth))
                node.fontSize = 20
                node.text = "one\ntwo\n"
                try TestAssertions.assertApproxEqual(
                    try NativeTextBoxLayout.settingWidth(0, on: node).height, 75)
                do {
                    _ = try NativeTextBoxLayout.settingWidth(.nan, on: node)
                    throw TestFailure(message: "NaN width was accepted", file: #file, line: #line)
                } catch NativeTextBoxLayout.Failure.invalidWidth {}
            }
            registry.register(
                tier: 3, feature: "Native-TextWidth",
                name: "test_TextRendererUsesBoxConstraintInsteadOfStaleNodeWidth"
            ) {
                var node = fixture()
                node.boxWidth = 60
                node.width = 280
                let context = CGContext(
                    data: nil, width: 300, height: 200, bitsPerComponent: 8, bytesPerRow: 1200,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
                NativePaintRenderer.text(
                    node, rect: CGRect(x: 4, y: 4, width: 280, height: 192), opacity: 1,
                    context: context)
                let bytes = context.data!.assumingMemoryBound(to: UInt8.self)
                var painted = 0
                var overflow = 0
                for y in 0..<200 {
                    for x in 0..<300 where bytes[y * 1200 + x * 4 + 3] > 0 {
                        painted += 1
                        if x > 70 { overflow += 1 }
                    }
                }
                try TestAssertions.assertTrue(painted > 0)
                try TestAssertions.assertEqual(
                    overflow, 0, "Stage and PNG painter must wrap to boxWidth, not stale node.width"
                )
            }
            registry.register(
                tier: 3, feature: "Native-TextWidth",
                name: "test_InlineTextWidthUsesFixedBoxAndAutoInputGrowsWithoutMutatingDocument"
            ) {
                let stage = CanvasStageView(frame: CGRect(x: 0, y: 0, width: 800, height: 600))
                stage.zoom = 1
                var node = fixture()
                node.boxWidth = 40
                node.width = 280
                try TestAssertions.assertApproxEqual(
                    TextEditingOverlay.editorFrame(for: node, in: stage).width, 40)
                node.boxWidth = 0
                node.width = 80
                node.text = "one"
                stage.document = VOODocument(nodes: [node])
                let overlay = TextEditingOverlay(frame: stage.bounds)
                overlay.begin(editing: node, in: stage)
                overlay.editorTextView.string =
                    "a very long text that expands the automatic width while typing"
                overlay.editorTextView.didChangeText()
                try TestAssertions.assertTrue(overlay.editorFrame.width > 80)
                try TestAssertions.assertEqual(stage.document.nodes[0], node)
                overlay.endEditing(commit: false)
            }
        }

        private static func fixture() -> VOONode {
            var node = VOONode(
                id: "text-width", kind: .text, name: "Copy", width: 160, height: 25,
                style: LayerStyle(fill: "#FFFFFF", stroke: "none", strokeWidth: 0))
            node.text = "one two three four five six seven"
            node.fontSize = 20
            node.fontFamily = "Inter"
            node.lineHeight = 1.25
            return node
        }
    }
#endif
