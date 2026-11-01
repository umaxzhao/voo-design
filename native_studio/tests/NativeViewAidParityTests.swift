#if INTEGRATED
    import AppKit

    enum NativeViewAidParityTests {
        static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-ViewAids",
                name: "test_GuidesAndRulersHaveIndependentPersistedViewState"
            ) {
                try withPreferences {
                    let controller = makeController()
                    let stage = controller.mainContentView.canvasStageView
                    let document = stage.document
                    let origin = stage.viewPoint(from: .zero)
                    controller.mainContentView.bottomZoomBar.visibilityButton.performClick(nil)
                    try TestAssertions.assertFalse(stage.showGuides)
                    try TestAssertions.assertFalse(stage.showRulers)
                    try TestAssertions.assertEqual(stage.document, document)
                    try TestAssertions.assertPointApproxEqual(stage.viewPoint(from: .zero), origin)
                    try TestAssertions.assertEqual(controller.commandManager.undoCount, 0)
                    controller.setRulersVisible(true)
                    try TestAssertions.assertFalse(stage.showGuides)
                    try TestAssertions.assertFalse(
                        controller.mainContentView.bottomZoomBar.isVisibilityEnabled)
                    let reopened = WindowController()
                    try TestAssertions.assertFalse(
                        reopened.mainContentView.canvasStageView.showGuides)
                    try TestAssertions.assertTrue(
                        reopened.mainContentView.canvasStageView.showRulers)
                }
            }
            registry.register(
                tier: 3, feature: "Native-ViewAids",
                name: "test_ViewAidShortcutsDoNotSelectTheRectangleToolOrMutateDocument"
            ) {
                try withPreferences {
                    let controller = makeController()
                    let stage = controller.mainContentView.canvasStageView
                    let tool = stage.activeTool
                    let document = stage.document
                    try TestAssertions.assertTrue(
                        controller.handleKeyDown(key(";", code: 41, flags: .command)))
                    try TestAssertions.assertFalse(stage.showGuides)
                    try TestAssertions.assertFalse(stage.showRulers)
                    try TestAssertions.assertTrue(
                        controller.handleKeyDown(key("r", code: 15, flags: .shift)))
                    try TestAssertions.assertTrue(stage.showRulers)
                    try TestAssertions.assertFalse(stage.showGuides)
                    try TestAssertions.assertEqual(stage.activeTool, tool)
                    try TestAssertions.assertEqual(stage.document, document)
                    try TestAssertions.assertEqual(controller.commandManager.undoCount, 0)
                }
            }
            registry.register(
                tier: 3, feature: "Native-ViewAids",
                name: "test_GuidePixelsRemainVisibleWithoutRulerTracksAndHideIndependently"
            ) {
                let stage = CanvasStageView(frame: CGRect(x: 0, y: 0, width: 100, height: 100))
                stage.document = VOODocument(
                    canvas: CanvasFrame(width: 100, height: 100, backgroundColor: "#000000"))
                stage.document.guides = [GuideLine(axis: "v", position: 37.5)]
                stage.zoom = 1
                stage.panOffset = .zero
                stage.showRulers = false
                for view in stage.subviews { view.isHidden = true }
                stage.showGuides = true
                let shown = guideGreen(stage)
                stage.showGuides = false
                let hidden = guideGreen(stage)
                try TestAssertions.assertTrue(shown > hidden + 0.15)
                try TestAssertions.assertFalse(stage.showRulers)
            }
            registry.register(
                tier: 3, feature: "Native-ViewAids",
                name: "test_HiddenGuidesStopSnappingWithoutDisablingOtherSnapTargets"
            ) {
                let stage = CanvasStageView(frame: .zero)
                stage.document = VOODocument(canvas: CanvasFrame(width: 1000, height: 1000))
                stage.document.guides = [GuideLine(axis: "v", position: 137.5)]
                stage.zoom = 1
                stage.showGuides = true
                let visible = stage.computeSnapping(for: CGPoint(x: 140, y: 350), movingEdge: "x")
                try TestAssertions.assertApproxEqual(visible.snappedPoint.x, 137.5)
                stage.showGuides = false
                let hidden = stage.computeSnapping(for: CGPoint(x: 140, y: 350), movingEdge: "x")
                try TestAssertions.assertApproxEqual(hidden.snappedPoint.x, 140)
                let canvas = stage.computeSnapping(for: CGPoint(x: 498, y: 350), movingEdge: "x")
                try TestAssertions.assertApproxEqual(canvas.snappedPoint.x, 500)
            }
            registry.register(
                tier: 3, feature: "Native-ViewAids",
                name: "test_ClearGuidesShortcutHasOneUndoRedoAndPortableRoundTrip"
            ) {
                try withPreferences {
                    let controller = makeController()
                    let stage = controller.mainContentView.canvasStageView
                    let guides = [
                        GuideLine(axis: "v", position: 137.5),
                        GuideLine(axis: "h", position: 237.5),
                    ]
                    stage.document.guides = guides
                    try TestAssertions.assertTrue(
                        controller.handleKeyDown(key(";", code: 41, flags: [.command, .option])))
                    try TestAssertions.assertEqual(stage.document.guides, [])
                    try TestAssertions.assertEqual(controller.commandManager.undoCount, 1)
                    controller.undoAction(nil)
                    try TestAssertions.assertEqual(stage.document.guides, guides)
                    let restored = try VOODocument.deserialize(
                        from: stage.document.serializeToJSON())
                    try TestAssertions.assertEqual(restored.guides, guides)
                    controller.redoAction(nil)
                    try TestAssertions.assertEqual(stage.document.guides, [])
                }
            }
        }

        private static func makeController() -> WindowController {
            let controller = WindowController()
            controller.newDocument(nil)
            controller.mainContentView.isWelcomeOpen = false
            controller.focusCanvas()
            controller.mainContentView.onboardingGuide.isHidden = true
            controller.mainContentView.settingsDrawer.isHidden = true
            controller.setGuidesVisible(true)
            controller.setRulersVisible(false)
            return controller
        }

        private static func key(_ text: String, code: UInt16, flags: NSEvent.ModifierFlags)
            -> NSEvent
        {
            NSEvent.keyEvent(
                with: .keyDown, location: .zero, modifierFlags: flags, timestamp: 0,
                windowNumber: 0, context: nil, characters: text, charactersIgnoringModifiers: text,
                isARepeat: false, keyCode: code)!
        }

        private static func guideGreen(_ stage: CanvasStageView) -> CGFloat {
            let bitmap = stage.bitmapImageRepForCachingDisplay(in: stage.bounds)!
            stage.cacheDisplay(in: stage.bounds, to: bitmap)
            let scale = CGFloat(bitmap.pixelsWide) / stage.bounds.width
            let left = Int(36 * scale)
            let right = Int(39 * scale)
            return (left...right).map {
                TestBitmapSampling.color(bitmap, x: $0, y: Int(70 * scale)).greenComponent
            }.max()!
        }

        private static func withPreferences(_ body: () throws -> Void) rethrows {
            let defaults = UserDefaults.standard
            let keys = [
                NativeViewAidPreferences.guidesKey, SettingsDrawerView.showRulersDefaultsKey,
            ]
            let previous = keys.map { defaults.object(forKey: $0) }
            defer {
                for (key, value) in zip(keys, previous) {
                    if let value {
                        defaults.set(value, forKey: key)
                    } else {
                        defaults.removeObject(forKey: key)
                    }
                }
            }
            try body()
        }
    }
#endif
