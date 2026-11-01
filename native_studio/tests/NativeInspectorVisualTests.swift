#if INTEGRATED
    import AppKit

    /// Regressions for the visible mismatches reproduced against the Electron inspector.
    enum NativeInspectorVisualTests {
        static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_DefaultInspectorRowsMatchMeasuredElectronScreenshot"
            ) {
                let panel = makePanel()
                // Independent 1920x990 Electron screenshot: card y=118, field rows
                // y=239/551/634/717 and x=1625 in a card starting at x=1610.
                let rows: [(String, CGFloat)] = [
                    ("Transform X", 121), ("Inspector.Properties.Opacity", 433),
                    ("Inspector.Properties.FillOpacity", 520),
                    ("Inspector.Properties.StrokeOpacity", 603),
                ]
                for (id, expectedY) in rows {
                    let control = try requireView(panel, id: id)
                    let actual = control.convert(control.bounds, to: panel)
                    try TestAssertions.assertApproxEqual(actual.minY, expectedY)
                }
                let opacity = try requireView(panel, id: "Inspector.Properties.Opacity")
                try TestAssertions.assertApproxEqual(opacity.frame.minX, 15)
            }
            registry.register(
                tier: 3, feature: "Native-CanvasInspector",
                name: "test_CanvasBackgroundEditIsUndoableWithoutChangingLayers"
            ) {
                let controller = WindowController(contentView: MainContentView())
                let stage = controller.mainContentView.canvasStageView
                let original = stage.document
                let next = original.workspaceBackgroundColor == "#FFFFFF" ? "#262626" : "#FFFFFF"
                try TestAssertions.assertTrue(controller.applyCanvasBackground(next))
                try TestAssertions.assertEqual(stage.document.workspaceBackgroundColor, next)
                try TestAssertions.assertEqual(stage.document.nodes, original.nodes)
                try TestAssertions.assertEqual(stage.document.canvas, original.canvas)
                try TestAssertions.assertFalse(controller.applyCanvasBackground(next))
                let encoded = try VOOSerializer.shared.serialize(document: stage.document)
                let decoded = try VOOSerializer.shared.deserialize(from: encoded)
                try TestAssertions.assertEqual(decoded.workspaceBackgroundColor, next)
                let preview = CanvasStageView(frame: CGRect(x: 0, y: 0, width: 100, height: 80))
                preview.document = VOODocument(
                    canvas: CanvasFrame(
                        x: 1000, y: 1000, width: 10, height: 10,
                        backgroundColor: "#FF0000"))
                preview.document.portableProperties["canvasBackgroundColor"] = .string("#FFFFFF")
                let bitmap = preview.bitmapImageRepForCachingDisplay(in: preview.bounds)!
                preview.cacheDisplay(in: preview.bounds, to: bitmap)
                let color = bitmap.colorAt(x: 20, y: 20)!.usingColorSpace(.sRGB)!
                try TestAssertions.assertTrue(
                    color.redComponent > 0.99 && color.greenComponent > 0.99
                        && color.blueComponent > 0.99,
                    "Workspace background paints independently of the red document canvas")
                _ = controller.commandManager.undo(on: &stage.document)
                try TestAssertions.assertEqual(
                    stage.document, original)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_CanvasPropertiesPresetsUpdateOnlyBackgroundAndKeepPagePalette"
            ) {
                let view = NativeCanvasPropertiesView(
                    frame: CGRect(x: 0, y: 0, width: 288, height: 252))
                var document = VOODocument(nodes: [
                    VOONode(
                        kind: .rect,
                        style: LayerStyle(fill: "#EF512D", stroke: "#FFFFFF", strokeWidth: 0)),
                    VOONode(kind: .rect, style: LayerStyle(fill: "#EF512D", stroke: "none")),
                ])
                document.canvas.backgroundColor = "#525252"
                document.canvas.width = 1200
                document.canvas.height = 900
                view.configure(document: document)
                try TestAssertions.assertEqual(view.pageColors, ["#EF512D", "#FFFFFF"])
                let size =
                    try requireView(view, id: "Inspector.CanvasProperties.Size") as! NSTextField
                try TestAssertions.assertEqual(size.stringValue, "1200 × 900")
                var changed: [String] = []
                view.onBackgroundChange = { changed.append($0) }
                let preset =
                    try requireView(view, id: "Inspector.CanvasProperties.Preset.#FFFFFF")
                    as! NSButton
                preset.performClick(nil)
                try TestAssertions.assertEqual(changed, ["#FFFFFF"])
                try TestAssertions.assertEqual(view.backgroundColor, "#FFFFFF")
                try TestAssertions.assertEqual(view.pageColors, ["#EF512D", "#FFFFFF"])
                try TestAssertions.assertEqual(
                    document.canvas.backgroundColor, "#525252",
                    "The view delegates persistence to the host operation")
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_InspectorConstraintPinsUpdateDropdownAndHostTogether"
            ) {
                let panel = makePanel()
                var changes: [(String, String)] = []
                panel.onConstraintsChange = { changes.append(($0, $1)) }
                let pin =
                    try requireView(panel, id: "Inspector.Properties.ConstraintPin.1") as! NSButton
                pin.performClick(nil)
                try TestAssertions.assertEqual(panel.hConstraintDropdown.selectedValue, "right")
                try TestAssertions.assertEqual(changes.count, 1)
                try TestAssertions.assertEqual(changes[0].0, "right")
                try TestAssertions.assertEqual(changes[0].1, "top")
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_InspectorAnchorGridUsesInsetDotsWithoutBorder"
            ) {
                let grid = AnchorGridView(frame: CGRect(x: 0, y: 0, width: 56, height: 56))
                let bitmap = grid.bitmapImageRepForCachingDisplay(in: grid.bounds)!
                grid.cacheDisplay(in: grid.bounds, to: bitmap)
                let scale = CGFloat(bitmap.pixelsWide) / 56
                let border = bitmap.colorAt(x: Int(2 * scale), y: Int(28 * scale))!
                let dot = bitmap.colorAt(x: Int(15 * scale), y: Int(14 * scale))!
                try TestAssertions.assertTrue(
                    border.alphaComponent < 0.01, "The Electron selector has no connecting frame")
                try TestAssertions.assertTrue(
                    dot.alphaComponent > 0.9, "The active dot is inset from the selector edge")
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_InspectorUsesThreeTabsAndSharedDimensionSurface"
            ) {
                let panel = makePanel()
                try TestAssertions.assertEqual(
                    panel.headerTabs.segments.map(\.value), ["design", "prototype", "code"])
                try TestAssertions.assertApproxEqual(panel.headerTabs.frame.height, 40)
                let x = try requireView(panel, id: "Transform X")
                let width = try requireView(panel, id: "Transform W")
                let height = try requireView(panel, id: "Transform H")
                try TestAssertions.assertApproxEqual(x.frame.height, 32)
                try TestAssertions.assertApproxEqual(width.frame.height, 32)
                try TestAssertions.assertApproxEqual(width.frame.minY, height.frame.minY)
                try TestAssertions.assertTrue((width as! PropertiesNumberPill).isBare)
                try TestAssertions.assertTrue((height as! PropertiesNumberPill).isBare)
                let names = descendants(panel).compactMap { ($0 as? NSTextField)?.stringValue }
                try TestAssertions.assertTrue(
                    names.contains("Artwork field"), "Layer names retain authored case")
                try TestAssertions.assertFalse(names.contains("ARTWORK FIELD"))
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_InspectorRetainsConfiguredZeroWidthStrokeControls"
            ) {
                let panel = makePanel()
                let width = try requireView(panel, id: "Inspector.Properties.StrokeWidth")
                let opacity = try requireView(panel, id: "Inspector.Properties.StrokeOpacity")
                try TestAssertions.assertFalse(
                    width.isHidden, "A zero-width configured stroke stays editable like Electron")
                try TestAssertions.assertFalse(opacity.isHidden)
                try TestAssertions.assertApproxEqual((width as! PropertiesNumberPill).value, 0)
                try TestAssertions.assertFalse(panel.strokeAlignControl.isHidden)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_InspectorPaintSwatchHasCircularCorners"
            ) {
                let swatch = PropertiesColorSwatchButton(hex: "#FF0000")
                swatch.frame = CGRect(x: 0, y: 0, width: 20, height: 20)
                let bitmap = swatch.bitmapImageRepForCachingDisplay(in: swatch.bounds)!
                swatch.cacheDisplay(in: swatch.bounds, to: bitmap)
                let scale = CGFloat(bitmap.pixelsWide) / 20
                let corner = bitmap.colorAt(x: Int(scale), y: Int(scale))!
                let center = bitmap.colorAt(x: Int(10 * scale), y: Int(10 * scale))!
                try TestAssertions.assertTrue(
                    corner.alphaComponent < 0.05, "Circular swatches leave transparent corners")
                try TestAssertions.assertTrue(center.alphaComponent > 0.95)
            }
            registry.register(
                tier: 3, feature: "Native-Inspector",
                name: "test_InspectorModeRoundTripRestoresOnlyDesignControls"
            ) {
                let panel = makePanel()
                let width = try requireView(panel, id: "Inspector.Properties.StrokeWidth")
                panel.headerTabs.select(value: "code", notify: true)
                try TestAssertions.assertTrue(width.isHidden)
                let bitmap = panel.bitmapImageRepForCachingDisplay(in: panel.bounds)!
                panel.cacheDisplay(in: panel.bounds, to: bitmap)
                let scale = CGFloat(bitmap.pixelsHigh) / panel.bounds.height
                let lower = bitmap.colorAt(x: Int(32 * scale), y: Int(650 * scale))!
                try TestAssertions.assertTrue(
                    lower.alphaComponent < 0.01,
                    "Code does not retain painted Design row backgrounds")
                panel.headerTabs.select(value: "design", notify: true)
                try TestAssertions.assertFalse(width.isHidden)
                try TestAssertions.assertTrue(panel.strokeAlignControl.isHidden == false)
                try TestAssertions.assertTrue(panel.contentHeight > 600)
            }
        }

        private static func makePanel() -> PropertiesPanelView {
            let panel = PropertiesPanelView(frame: CGRect(x: 0, y: 0, width: 288, height: 950))
            panel.configure(
                with: VOONode(
                    id: "artwork", kind: .rect, name: "Artwork field",
                    width: 1096, height: 358,
                    style: LayerStyle(fill: "#EF512D", stroke: "#FFFFFF", strokeWidth: 0)))
            panel.layoutSubtreeIfNeeded()
            return panel
        }

        private static func descendants(_ root: NSView) -> [NSView] {
            [root] + root.subviews.flatMap { descendants($0) }
        }

        private static func requireView(_ root: NSView, id: String) throws -> NSView {
            guard
                let view = descendants(root).first(where: {
                    $0.identifier?.rawValue == id || $0.accessibilityIdentifier() == id
                        || $0.accessibilityLabel() == id
                })
            else {
                throw TestFailure(
                    message: "Missing inspector control: \(id)", file: #file, line: #line)
            }
            return view
        }
    }
#endif
