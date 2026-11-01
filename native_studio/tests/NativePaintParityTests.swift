#if INTEGRATED
    import AppKit
    import Foundation

    public enum NativePaintParityTests {
        public static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-PaintControls",
                name: "test_CodeSelectionChangeToEmptyPaintRestoresOnlyAddEntry"
            ) {
                let panel = PropertiesPanelView(frame: CGRect(x: 0, y: 0, width: 288, height: 800))
                var node = shape()
                panel.configure(with: node)
                panel.headerTabs.select(value: "code", notify: true)
                node.id = "empty"
                node.portableProperties["fills"] = .array([])
                panel.configure(with: node)
                panel.headerTabs.select(value: "design", notify: true)
                panel.layoutSubtreeIfNeeded()
                let add = descendants(panel).first {
                    $0.accessibilityIdentifier() == "Inspector.Properties.FillAdd"
                }!
                let eye = descendants(panel).first {
                    $0.accessibilityIdentifier() == "Inspector.Properties.FillEye"
                }!
                try TestAssertions.assertFalse(add.isHidden)
                try TestAssertions.assertTrue(eye.isHidden)
                let strokeAdd = descendants(panel).first {
                    $0.accessibilityIdentifier() == "Inspector.Properties.StrokeAdd"
                }!
                try TestAssertions.assertFalse(strokeAdd.isHidden)
                try TestAssertions.assertTrue(panel.strokeOpacityPill.isHidden)
            }
            registry.register(
                tier: 2, feature: "Native-PaintStack",
                name: "test_PixelSamplerUsesTheBitmapICCProfileWithoutDoubleConversion"
            ) {
                let context = CGContext(
                    data: nil, width: 2, height: 2, bitsPerComponent: 8, bytesPerRow: 8,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
                context.setFillColor(NSColor(srgbRed: 1, green: 0, blue: 0, alpha: 1).cgColor)
                context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
                context.setFillColor(NSColor(srgbRed: 0, green: 0, blue: 1, alpha: 0.5).cgColor)
                context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
                let sample = TestBitmapSampling.color(
                    NSBitmapImageRep(cgImage: context.makeImage()!), x: 1, y: 1)
                try TestAssertions.assertApproxEqual(sample.redComponent, 0.5, accuracy: 0.01)
                try TestAssertions.assertApproxEqual(sample.greenComponent, 0, accuracy: 0.01)
                try TestAssertions.assertApproxEqual(sample.blueComponent, 0.5, accuracy: 0.01)
            }
            registry.register(
                tier: 3, feature: "Native-PaintStack",
                name: "test_WebFillStackStageAndPNGOrderAlphaAndHiddenPaints"
            ) {
                var node = shape()
                node.portableProperties["fills"] = .array([
                    .object([
                        "id": .string("red"), "fill": .string("#FF0000"), "opacity": .number(1),
                    ]),
                    .object([
                        "id": .string("blue"), "fill": .string("#0000FF"), "opacity": .number(0.5),
                    ]),
                ])
                let color = try exportedPixel(node, x: 32, y: 32)
                try TestAssertions.assertApproxEqual(color.redComponent, 0.5, accuracy: 0.03)
                try TestAssertions.assertApproxEqual(color.blueComponent, 0.5, accuracy: 0.03)
                let stage = stagePixel(node)
                try TestAssertions.assertApproxEqual(
                    stage.redComponent, color.redComponent, accuracy: 0.03)
                try TestAssertions.assertApproxEqual(
                    stage.blueComponent, color.blueComponent, accuracy: 0.03)
                try node.applyPaintMutation(.visibility(.fill, 1, false))
                try TestAssertions.assertTrue(
                    try exportedPixel(node, x: 32, y: 32).redComponent > 0.95)
                try node.applyPaintMutation(.move(.fill, 1, 0))
                try node.applyPaintMutation(.visibility(.fill, 0, true))
                let reordered = try exportedPixel(node, x: 32, y: 32)
                try TestAssertions.assertTrue(
                    reordered.redComponent > 0.95 && reordered.blueComponent < 0.05)
                node.portableProperties["fills"] = .array([])
                let empty = try exportedPixel(node, x: 32, y: 32)
                try TestAssertions.assertTrue(
                    empty.greenComponent > 0.95,
                    "An empty stack never resurrects the legacy red fill")
            }
            registry.register(
                tier: 3, feature: "Native-PaintStack",
                name: "test_GradientOpacityIntrinsicAlphaAndNodeOpacityMultiply"
            ) {
                var node = shape()
                node.style.fill = "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)"
                node.style.fillOpacity = 0.25
                node.style.opacity = 0.5
                let exported = try exportedPixel(node, x: 32, y: 32)
                let live = stagePixel(node)
                try TestAssertions.assertApproxEqual(exported.greenComponent, 0.875, accuracy: 0.03)
                try TestAssertions.assertApproxEqual(
                    live.greenComponent, exported.greenComponent, accuracy: 0.03)
                node.style.fill = "#FF000080"
                let intrinsic = try exportedPixel(node, x: 32, y: 32)
                try TestAssertions.assertApproxEqual(
                    intrinsic.greenComponent, 0.9375, accuracy: 0.03)
            }
            registry.register(
                tier: 3, feature: "Native-PaintStack",
                name: "test_PrimaryStrokeEditsNeverOverwriteAdditionalStrokes"
            ) {
                var node = shape()
                node.style.stroke = "#FF0000"
                node.style.strokeWidth = 4
                let extra: PortableJSONValue = .object([
                    "id": .string("extra"), "stroke": .string("#0000FF"),
                    "strokeWidth": .number(12), "strokeOpacity": .number(1),
                    "future": .string("keep"),
                ])
                node.portableProperties["strokes"] = .array([extra])
                node.style.stroke = "#00FF00"
                try TestAssertions.assertEqual(node.portableProperties["strokes"], .array([extra]))
                try node.applyPaintMutation(.visibility(.stroke, 0, false))
                let edge = try exportedPixel(node, x: 2, y: 32)
                try TestAssertions.assertTrue(edge.blueComponent > 0.95 && edge.redComponent < 0.05)
                try node.applyPaintMutation(.remove(.stroke, 0))
                try TestAssertions.assertEqual(node.portableProperties["strokes"], .array([extra]))
                let restored = try JSONDecoder().decode(
                    VOONode.self, from: JSONEncoder().encode(node))
                try TestAssertions.assertEqual(
                    restored.portableProperties["strokes"], .array([extra]))
                try TestAssertions.assertTrue(
                    try exportedPixel(restored, x: 2, y: 32).blueComponent > 0.95)
            }
            registry.register(
                tier: 3, feature: "Native-PaintControls",
                name: "test_OpacityScrubUpdatesTwoSelectionsWithOneUndoAndRedo"
            ) {
                let (controller, first, second) = editor()
                let panel = controller.mainContentView.inspector.propertiesPanel
                let original = controller.mainContentView.canvasStageView.document.nodes
                panel.onPaintInteraction?(true)
                panel.fillOpacityPill.onValueChanged?(70)
                panel.fillOpacityPill.onValueChanged?(25)
                panel.onPaintInteraction?(false)
                let stage = controller.mainContentView.canvasStageView
                try TestAssertions.assertEqual(controller.commandManager.undoCount, 1)
                for id in [first.id, second.id] {
                    try TestAssertions.assertEqual(
                        stage.document.nodes.first { $0.id == id }?.style.fillOpacity, 0.25)
                }
                controller.undoAction(nil)
                try TestAssertions.assertEqual(stage.document.nodes, original)
                controller.redoAction(nil)
                try TestAssertions.assertEqual(
                    stage.document.nodes.first { $0.id == first.id }?.style.fillOpacity, 0.25)
            }
            registry.register(
                tier: 3, feature: "Native-PaintControls",
                name: "test_OpacityScrubReturningToStartPreservesRedoAndDocument"
            ) {
                let (controller, _, _) = editor()
                let stage = controller.mainContentView.canvasStageView
                _ = controller.commandManager.execute(
                    InsertNodeCommand(node: VOONode(id: "temporary")), on: &stage.document)
                controller.undoAction(nil)
                stage.selectedNodeIds = ["paint", "second"]
                let original = stage.document
                let panel = controller.mainContentView.inspector.propertiesPanel
                panel.onPaintInteraction?(true)
                panel.fillOpacityPill.onValueChanged?(60)
                try TestAssertions.assertEqual(
                    stage.document.nodes.first { $0.id == "paint" }?.style.fillOpacity, 0.6)
                panel.fillOpacityPill.onValueChanged?(100)
                panel.onPaintInteraction?(false)
                try TestAssertions.assertEqual(stage.document, original)
                try TestAssertions.assertEqual(controller.commandManager.undoCount, 0)
                try TestAssertions.assertEqual(controller.commandManager.redoCount, 1)
            }
            registry.register(
                tier: 3, feature: "Native-PaintControls",
                name: "test_HideGradientKeepsValueAndPrimaryPaintMetadataAcrossUndoAndSave"
            ) {
                let (controller, first, _) = editor()
                let stage = controller.mainContentView.canvasStageView
                let before = stage.document.nodes.first { $0.id == first.id }!
                _ = try controller.applyPaintChange(
                    ids: [first.id], mutation: .visibility(.fill, 0, false))
                let hidden = stage.document.nodes.first { $0.id == first.id }!
                try TestAssertions.assertEqual(hidden.fill, before.fill)
                try TestAssertions.assertFalse(hidden.nativePaints(.fill)[0].isVisible)
                let restored = try JSONDecoder().decode(
                    VOONode.self, from: JSONEncoder().encode(hidden))
                try TestAssertions.assertFalse(restored.nativePaints(.fill)[0].isVisible)
                controller.undoAction(nil)
                try TestAssertions.assertEqual(
                    stage.document.nodes.first { $0.id == first.id }, before)
            }
            registry.register(
                tier: 3, feature: "Native-Effects",
                name: "test_FormNullEffectsAllowAddUndoAndSaveReopen"
            ) { try NativeEffectsImportRegression.verifyFormNullEffects() }
            registry.register(
                tier: 3, feature: "Native-Effects",
                name: "test_EffectsAddMenuCommitsToDocumentAndRetainsUnknownMetadata"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                let payload =
                    ##"{"id":"effect","kind":"rect","effects":{"futureEffect":{"strength":0.75}}}"##
                let node = try JSONDecoder().decode(VOONode.self, from: Data(payload.utf8))
                let stage = controller.mainContentView.canvasStageView
                stage.document.nodes.append(node)
                stage.selectedNodeIds = [node.id]
                let panel = controller.mainContentView.inspector.propertiesPanel
                panel.layoutSubtreeIfNeeded()
                try TestAssertions.assertTrue(
                    panel.blurCheckbox.isHidden && panel.dropShadowCheckbox.isHidden
                        && panel.innerShadowCheckbox.isHidden)
                panel.makeEffectsMenu().performActionForItem(at: 0)
                let changed = stage.document.nodes.first { $0.id == node.id }!
                try TestAssertions.assertTrue(changed.effects?.gaussianBlur?.enabled == true)
                try TestAssertions.assertFalse(
                    panel.blurPill.isHidden, "Adding an effect opens its parameter editor")
                try TestAssertions.assertTrue(panel.dropShadowCheckbox.isHidden)
                try TestAssertions.assertEqual(controller.commandManager.undoCount, 1)
                let output = try JSONDecoder().decode(
                    PortableJSONValue.self, from: JSONEncoder().encode(changed))
                try TestAssertions.assertEqual(
                    output.object!["effects"]!.object!["futureEffect"],
                    .object(["strength": .number(0.75)]))
                controller.undoAction(nil)
                try TestAssertions.assertEqual(
                    stage.document.nodes.first { $0.id == node.id }, node)
            }
            registry.register(
                tier: 3, feature: "Native-Effects",
                name: "test_UnsupportedEffectArrayCannotBeOverwrittenByNativeControls"
            ) {
                let controller = WindowController()
                controller.newDocument(nil)
                let payload =
                    ##"{"id":"effect-array","kind":"rect","effects":[{"kind":"future","strength":1}]}"##
                let node = try JSONDecoder().decode(VOONode.self, from: Data(payload.utf8))
                let stage = controller.mainContentView.canvasStageView
                stage.document.nodes.append(node)
                stage.selectedNodeIds = [node.id]
                let panel = controller.mainContentView.inspector.propertiesPanel
                panel.layoutSubtreeIfNeeded()
                let button = descendants(panel).compactMap { $0 as? NSButton }.first {
                    $0.accessibilityIdentifier() == "Inspector.Properties.EffectsAdd"
                }
                try TestAssertions.assertNotNil(button)
                try TestAssertions.assertFalse(node.supportsNativeEffects)
                try TestAssertions.assertFalse(button!.isEnabled)
                controller.inspectorDidChangeEffects(
                    id: node.id, effects: LayerEffects(gaussianBlur: BlurEffect()))
                try TestAssertions.assertEqual(
                    stage.document.nodes.first { $0.id == node.id }, node)
            }
            registry.register(
                tier: 3, feature: "Native-PaintStack",
                name: "test_SolidTextRawCharactersAndAlphaMatchStageAndExport"
            ) {
                let node = VOONode(
                    id: "text", kind: .text, x: 8, y: 8, width: 300, height: 90,
                    style: LayerStyle(
                        fill: "#000000", stroke: "none", strokeWidth: 0, fillOpacity: 0.5),
                    text: "R&D <raw>", fontSize: 32)
                let document = VOODocument(
                    canvas: CanvasFrame(width: 320, height: 120, backgroundColor: "#FFFFFF"),
                    nodes: [node])
                let live = CanvasStageView(frame: CGRect(x: 0, y: 0, width: 320, height: 120))
                live.document = document
                live.zoom = 1
                live.panOffset = .zero
                live.showRulers = false
                live.showGrid = false
                for view in live.subviews { view.isHidden = true }
                let bitmap = live.bitmapImageRepForCachingDisplay(in: live.bounds)!
                live.cacheDisplay(in: live.bounds, to: bitmap)
                let exported = NSBitmapImageRep(
                    cgImage: try ExportEngine.shared.renderImage(document: document, scale: 1))
                var difference: CGFloat = 0
                var ink = 0
                for y in 0..<120 {
                    for x in 0..<320 {
                        let a = TestBitmapSampling.color(
                            bitmap, x: x * bitmap.pixelsWide / 320, y: y * bitmap.pixelsHigh / 120)
                        let b = TestBitmapSampling.color(exported, x: x, y: y)
                        difference += abs(a.redComponent - b.redComponent)
                        if b.redComponent < 0.8 { ink += 1 }
                    }
                }
                try TestAssertions.assertTrue(ink > 200, "Text must paint actual glyphs")
                try TestAssertions.assertTrue(
                    difference / 38400 < 0.025,
                    "Stage and export share glyph, raw text and opacity rendering")
            }
            registry.register(
                tier: 2, feature: "Native-PaintControls",
                name: "test_NumericPaintFieldRejectsNonFiniteInput"
            ) {
                let pill = PropertiesNumberPill(label: "", suffix: "%")
                pill.minimumValue = 0
                pill.maximumValue = 100
                pill.setValue(100)
                let input = pill.subviews.compactMap { $0 as? NSTextField }.first {
                    $0.delegate === pill
                }!
                var changes = 0
                pill.onValueChanged = { _ in changes += 1 }
                input.stringValue = "nan"
                pill.controlTextDidEndEditing(
                    Notification(name: NSControl.textDidEndEditingNotification, object: input))
                try TestAssertions.assertEqual(pill.value, 100)
                try TestAssertions.assertEqual(changes, 0)
            }
            registry.register(
                tier: 2, feature: "Native-PaintStack",
                name: "test_InvalidPaintMutationIsAtomicAcrossSelections"
            ) {
                let (controller, _, _) = editor()
                let stage = controller.mainContentView.canvasStageView
                let before = stage.document
                do {
                    _ = try controller.applyPaintChange(
                        ids: stage.selectedNodeIds, mutation: .opacity(.fill, 0, .nan))
                    throw TestFailure(
                        message: "Invalid alpha was accepted", file: #file, line: #line)
                } catch NativePaintError.invalidOpacity {}
                try TestAssertions.assertEqual(stage.document, before)
                try TestAssertions.assertFalse(controller.commandManager.canUndo)
            }
        }

        private static func shape() -> VOONode {
            VOONode(
                id: "paint", kind: .rect, x: 0, y: 0, width: 64, height: 64,
                style: LayerStyle(fill: "#FF0000", stroke: "none", strokeWidth: 0))
        }
        private static func editor() -> (WindowController, VOONode, VOONode) {
            let controller = WindowController()
            controller.newDocument(nil)
            var first = shape()
            first.style.fill = "linear-gradient(90deg, #FF0000 0%, #0000FF 100%)"
            var second = shape()
            second.id = "second"
            let stage = controller.mainContentView.canvasStageView
            stage.document.nodes += [first, second]
            stage.selectedNodeIds = [first.id, second.id]
            return (controller, first, second)
        }
        private static func exportedPixel(_ node: VOONode, x: Int, y: Int) throws -> NSColor {
            let document = VOODocument(
                canvas: CanvasFrame(width: 64, height: 64, backgroundColor: "#FFFFFF"),
                nodes: [node])
            let bitmap = NSBitmapImageRep(
                cgImage: try ExportEngine.shared.renderImage(document: document, scale: 1))
            return TestBitmapSampling.color(bitmap, x: x, y: y)
        }
        private static func stagePixel(_ node: VOONode) -> NSColor {
            let stage = CanvasStageView(frame: CGRect(x: 0, y: 0, width: 64, height: 64))
            stage.document = VOODocument(
                canvas: CanvasFrame(width: 64, height: 64, backgroundColor: "#FFFFFF"),
                nodes: [node])
            let window = NSWindow(
                contentRect: stage.bounds, styleMask: .borderless, backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.colorSpace = .sRGB
            window.contentView = stage
            defer { window.close() }
            stage.zoom = 1
            stage.panOffset = .zero
            stage.showRulers = false
            stage.showGrid = false
            for view in stage.subviews { view.isHidden = true }
            let bitmap = stage.bitmapImageRepForCachingDisplay(in: stage.bounds)!
            stage.cacheDisplay(in: stage.bounds, to: bitmap)
            return TestBitmapSampling.color(
                bitmap, x: bitmap.pixelsWide / 2, y: bitmap.pixelsHigh / 2)
        }
        private static func descendants(_ root: NSView) -> [NSView] {
            [root] + root.subviews.flatMap(descendants)
        }
    }
#endif
