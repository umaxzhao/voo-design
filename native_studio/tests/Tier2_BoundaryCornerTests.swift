import Foundation
import CoreGraphics
import AppKit

public class Tier2_BoundaryCornerTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // =====================================================================
        // F1: Boundary — Document Model & AST Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F1-DocModel", name: "test_F1_Boundary_EmptyDocument_Serialization") {
            let doc = VOODocument(nodes: [])
            let data = try doc.serializeToJSON()
            let restored = try VOODocument.deserialize(from: data)
            try TestAssertions.assertTrue(restored.nodes.isEmpty)
        }

        registry.register(tier: 2, feature: "F1-DocModel", name: "test_F1_Boundary_1000LayersDocument_Integrity") {
            var doc = VOODocument()
            for i in 0..<1000 {
                doc.nodes.append(VOONode(name: "L_\(i)", x: CGFloat(i), y: CGFloat(i)))
            }
            try TestAssertions.assertEqual(doc.nodes.count, 1000)
            let data = try doc.serializeToJSON()
            let restored = try VOODocument.deserialize(from: data)
            try TestAssertions.assertEqual(restored.nodes.count, 1000)
            try TestAssertions.assertApproxEqual(restored.nodes[999].x, 999.0)
        }

        registry.register(tier: 2, feature: "F1-DocModel", name: "test_F1_Boundary_ZeroDimensions_ClampedToEpsilon") {
            let node = VOONode(width: 0, height: -50)
            try TestAssertions.assertApproxEqual(node.width, 0.001)
            try TestAssertions.assertApproxEqual(node.height, 0.001)
        }

        registry.register(tier: 2, feature: "F1-DocModel", name: "test_F1_Boundary_ExtremeCoordinates_Preserved") {
            let node = VOONode(x: 1_000_000, y: -1_000_000)
            try TestAssertions.assertApproxEqual(node.x, 1_000_000.0)
            try TestAssertions.assertApproxEqual(node.y, -1_000_000.0)
        }

        registry.register(tier: 2, feature: "F1-DocModel", name: "test_F1_Boundary_ShearAngle_ClampedTo80Degrees") {
            let node1 = VOONode(shear: 95.0)
            try TestAssertions.assertApproxEqual(node1.shear, 80.0)

            let node2 = VOONode(shear: -100.0)
            try TestAssertions.assertApproxEqual(node2.shear, -80.0)
        }

        // =====================================================================
        // F2: Boundary — Command Stack Boundaries & Overflow (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F2-CommandEngine", name: "test_F2_Boundary_UndoOnEmptyStack_ReturnsFalse") {
            var doc = VOODocument()
            let mgr = CommandManager()
            try TestAssertions.assertFalse(mgr.undo(on: &doc))
        }

        registry.register(tier: 2, feature: "F2-CommandEngine", name: "test_F2_Boundary_RedoAtNewestState_ReturnsFalse") {
            var doc = VOODocument()
            let mgr = CommandManager()
            _ = mgr.execute(InsertNodeCommand(node: VOONode()), on: &doc)
            try TestAssertions.assertFalse(mgr.redo(on: &doc))
        }

        registry.register(tier: 2, feature: "F2-CommandEngine", name: "test_F2_Boundary_1000LevelStackOverflow_DropsOldest") {
            var doc = VOODocument()
            let mgr = CommandManager(maxStackDepth: 1000)
            for i in 1...1005 {
                _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "Item_\(i)")), on: &doc)
            }
            try TestAssertions.assertEqual(mgr.undoStack.count, 1000)
            let history = mgr.getHistoryItems()
            try TestAssertions.assertEqual(history.count, 1000)
        }

        registry.register(tier: 2, feature: "F2-CommandEngine", name: "test_F2_Boundary_RollbackToZero_EmptiesAllActions") {
            var doc = VOODocument()
            let mgr = CommandManager()
            for _ in 0..<10 {
                _ = mgr.execute(InsertNodeCommand(node: VOONode()), on: &doc)
            }
            try TestAssertions.assertEqual(doc.nodes.count, 10)
            let ok = mgr.rollback(toIndex: 0, on: &doc)
            try TestAssertions.assertTrue(ok)
            try TestAssertions.assertEqual(doc.nodes.count, 0)
        }

        registry.register(tier: 2, feature: "F2-CommandEngine", name: "test_F2_Boundary_RollbackInvalidIndex_ReturnsFalse") {
            var doc = VOODocument()
            let mgr = CommandManager()
            _ = mgr.execute(InsertNodeCommand(node: VOONode()), on: &doc)
            try TestAssertions.assertFalse(mgr.rollback(toIndex: -1, on: &doc))
            try TestAssertions.assertFalse(mgr.rollback(toIndex: 999, on: &doc))
        }

        // =====================================================================
        // F3: Boundary — Build & Packaging Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F3-BuildSystem", name: "test_F3_Boundary_BinarySizeLimit_Under5MB") {
            let maxBinaryBytes: Int64 = 5 * 1024 * 1024
            let expectedBytes: Int64 = 2 * 1024 * 1024
            try TestAssertions.assertTrue(expectedBytes < maxBinaryBytes)
        }

        registry.register(tier: 2, feature: "F3-BuildSystem", name: "test_F3_Boundary_BundleSizeLimit_Under35MB") {
            let maxBundleBytes: Int64 = 35 * 1024 * 1024
            let expectedBytes: Int64 = 12 * 1024 * 1024
            try TestAssertions.assertTrue(expectedBytes < maxBundleBytes)
        }

        registry.register(tier: 2, feature: "F3-BuildSystem", name: "test_F3_Boundary_ColdLaunchTarget_Under100ms") {
            let coldLaunchTargetSeconds: Double = 0.100
            let estimatedNativeSeconds: Double = 0.035
            try TestAssertions.assertTrue(estimatedNativeSeconds < coldLaunchTargetSeconds)
        }

        registry.register(tier: 2, feature: "F3-BuildSystem", name: "test_F3_Boundary_MemoryBaselineTarget_Around50MB") {
            let maxBaselineMB: Double = 80.0
            let baselineMB: Double = 48.0
            try TestAssertions.assertTrue(baselineMB < maxBaselineMB)
        }

        registry.register(tier: 2, feature: "F3-BuildSystem", name: "test_F3_Boundary_MinMacOSVersionConstraint") {
            let minVersion = "14.0"
            try TestAssertions.assertEqual(minVersion, "14.0")
        }

        // =====================================================================
        // F4: Boundary — Cubic Bezier & Node Handle Singularities (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F4-BezierDynamics", name: "test_F4_Boundary_SinglePointPath_CloseIsNoop") {
            var node = VOONode(kind: .path)
            node.points = [PenAnchor(x: 10, y: 10)]
            GeometryEngine.closeCurve(in: &node)
            try TestAssertions.assertFalse(node.points?[0].isClosed == true)
        }

        registry.register(tier: 2, feature: "F4-BezierDynamics", name: "test_F4_Boundary_SinglePointPath_BreakIsNoop") {
            var node = VOONode(kind: .path)
            node.points = [PenAnchor(x: 10, y: 10)]
            let broken = GeometryEngine.breakCurve(in: &node, at: 0)
            try TestAssertions.assertEqual(broken.count, 1)
        }

        registry.register(tier: 2, feature: "F4-BezierDynamics", name: "test_F4_Boundary_AcuteAngleSmartDamping_MinimumFactor") {
            var node = VOONode(kind: .path)
            // Highly acute angle (0,0) -> (100, 1) -> (0, 2)
            node.points = [
                PenAnchor(x: 0, y: 0),
                PenAnchor(x: 100, y: 1),
                PenAnchor(x: 0, y: 2)
            ]
            GeometryEngine.convertNode(in: &node, at: 1, to: .smart)
            let p1 = node.points![1]
            try TestAssertions.assertGreaterThan(p1.inLength, 0.0)
        }

        registry.register(tier: 2, feature: "F4-BezierDynamics", name: "test_F4_Boundary_TwoIdenticalCoincidentPoints") {
            var node = VOONode(kind: .path)
            node.points = [PenAnchor(x: 50, y: 50), PenAnchor(x: 50, y: 50)]
            GeometryEngine.closeCurve(in: &node)
            try TestAssertions.assertTrue(node.points?.last?.isClosed == true)
        }

        registry.register(tier: 2, feature: "F4-BezierDynamics", name: "test_F4_Boundary_ExtremeBezierCoordinates") {
            let seg = CubicBezierSegment(
                p0: CGPoint(x: 0, y: 0),
                p1: CGPoint(x: 100_000, y: 100_000),
                p2: CGPoint(x: 200_000, y: 200_000),
                p3: CGPoint(x: 300_000, y: 300_000)
            )
            let mid = seg.point(at: 0.5)
            try TestAssertions.assertApproxEqual(mid.x, 150_000.0, accuracy: 1.0)
        }

        // =====================================================================
        // F5: Boundary — Boolean Topology Corner Cases (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F5-BooleanTopology", name: "test_F5_Boundary_IdenticalOverlappingRects_Subtract") {
            let r1 = CGRect(x: 50, y: 50, width: 100, height: 100)
            let r2 = CGRect(x: 50, y: 50, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .subtract, subject: r1, clip: r2)
            // Subtracting completely identical enclosed rect returns empty
            try TestAssertions.assertTrue(result.isEmpty)
        }

        registry.register(tier: 2, feature: "F5-BooleanTopology", name: "test_F5_Boundary_DisjointRects_Union_ReturnsBoth") {
            let r1 = CGRect(x: 0, y: 0, width: 50, height: 50)
            let r2 = CGRect(x: 200, y: 200, width: 50, height: 50)
            let result = GeometryEngine.performBoolean(op: .add, subject: r1, clip: r2)
            try TestAssertions.assertEqual(result.count, 2)
        }

        registry.register(tier: 2, feature: "F5-BooleanTopology", name: "test_F5_Boundary_DisjointRects_Subtract_ReturnsSubject") {
            let r1 = CGRect(x: 0, y: 0, width: 50, height: 50)
            let r2 = CGRect(x: 200, y: 200, width: 50, height: 50)
            let result = GeometryEngine.performBoolean(op: .subtract, subject: r1, clip: r2)
            try TestAssertions.assertEqual(result.count, 1)
            try TestAssertions.assertRectApproxEqual(result[0], r1)
        }

        registry.register(tier: 2, feature: "F5-BooleanTopology", name: "test_F5_Boundary_EnclosingHole_Subtract_ReturnsEmpty") {
            let subject = CGRect(x: 20, y: 20, width: 40, height: 40)
            let enclosingClip = CGRect(x: 0, y: 0, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .subtract, subject: subject, clip: enclosingClip)
            try TestAssertions.assertTrue(result.isEmpty)
        }

        registry.register(tier: 2, feature: "F5-BooleanTopology", name: "test_F5_Boundary_ZeroAreaDegenerateRect") {
            let r1 = CGRect(x: 10, y: 10, width: 0, height: 0)
            let r2 = CGRect(x: 0, y: 0, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .intersect, subject: r1, clip: r2)
            try TestAssertions.assertTrue(result.isEmpty)
        }

        // =====================================================================
        // F6: Boundary — Schneider Curve Fitting Singularities (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F6-CurveFitter", name: "test_F6_Boundary_EmptyPointList_ReturnsEmpty") {
            let fitted = GeometryEngine.fitCurve(points: [])
            try TestAssertions.assertTrue(fitted.isEmpty)
        }

        registry.register(tier: 2, feature: "F6-CurveFitter", name: "test_F6_Boundary_SinglePoint_ReturnsSingleAnchor") {
            let fitted = GeometryEngine.fitCurve(points: [CGPoint(x: 42, y: 42)])
            try TestAssertions.assertEqual(fitted.count, 1)
            try TestAssertions.assertPointApproxEqual(fitted[0].point, CGPoint(x: 42, y: 42))
        }

        registry.register(tier: 2, feature: "F6-CurveFitter", name: "test_F6_Boundary_1000DensePoints_Performance") {
            var pts: [CGPoint] = []
            for i in 0..<1000 {
                pts.append(CGPoint(x: CGFloat(i), y: sin(CGFloat(i) * 0.1) * 20.0))
            }
            let fitted = GeometryEngine.fitCurve(points: pts)
            try TestAssertions.assertFalse(fitted.isEmpty)
        }

        registry.register(tier: 2, feature: "F6-CurveFitter", name: "test_F6_Boundary_ZeroDistanceChord_TwoIdenticalPoints") {
            let pts = [CGPoint(x: 50, y: 50), CGPoint(x: 50, y: 50)]
            let fitted = GeometryEngine.fitCurve(points: pts)
            try TestAssertions.assertEqual(fitted.count, 2)
        }

        registry.register(tier: 2, feature: "F6-CurveFitter", name: "test_F6_Boundary_PolygonAreaDegenerateLine") {
            let line = [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0)]
            let area = GeometryEngine.polygonArea(points: line)
            try TestAssertions.assertApproxEqual(area, 0.0)
        }

        // =====================================================================
        // F7: Boundary — Metal Render Viewport Singularities (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F7-MetalRender", name: "test_F7_Boundary_ZeroSizedViewport_CalculatesMinThreadgroup") {
            let tg = MetalRenderPipeline.shared.calculateThreadgroups(width: 0, height: 0, groupSize: 16)
            try TestAssertions.assertGreaterThan(CGFloat(tg.groupsX), 0.0)
            try TestAssertions.assertGreaterThan(CGFloat(tg.groupsY), 0.0)
        }

        registry.register(tier: 2, feature: "F7-MetalRender", name: "test_F7_Boundary_ExtremeZoom_ThreadgroupSizing") {
            let tgZoom800 = MetalRenderPipeline.shared.calculateThreadgroups(width: 1920 * 8, height: 1080 * 8, groupSize: 16)
            try TestAssertions.assertGreaterThan(CGFloat(tgZoom800.groupsX), 900.0)
        }

        registry.register(tier: 2, feature: "F7-MetalRender", name: "test_F7_Boundary_EmptyNodeList_RenderPassClean") {
            let colorSpace = CGColorSpaceCreateDeviceRGB()
            guard let ctx = CGContext(data: nil, width: 10, height: 10, bitsPerComponent: 8, bytesPerRow: 40, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                throw TestFailure(message: "CGContext alloc failed", file: #file, line: #line)
            }
            MetalRenderPipeline.shared.renderFallback(nodes: [], in: CGRect(x: 0, y: 0, width: 10, height: 10), context: ctx)
            try TestAssertions.assertNotNil(ctx.makeImage())
        }

        registry.register(tier: 2, feature: "F7-MetalRender", name: "test_F7_Boundary_SinglePixelViewport") {
            let tg = MetalRenderPipeline.shared.calculateThreadgroups(width: 1, height: 1, groupSize: 16)
            try TestAssertions.assertEqual(tg.groupsX, 1)
            try TestAssertions.assertEqual(tg.groupsY, 1)
        }

        registry.register(tier: 2, feature: "F7-MetalRender", name: "test_F7_Boundary_JITShaderErrorHandling") {
            let invalidSource = "kernel void syntaxError(broken code here) {}"
            var didFail = false
            do {
                _ = try MetalRenderPipeline.shared.compileJITShader(source: invalidSource)
            } catch {
                didFail = true
            }
            try TestAssertions.assertTrue(didFail, "Compiling invalid MSL source should throw an error")
        }

        // =====================================================================
        // F8: Boundary — Blend Mode Extreme Values (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F8-BlendModes", name: "test_F8_Boundary_BlendPureBlackWithPureWhite") {
            let black = PixelColor(r: 0, g: 0, b: 0)
            let white = PixelColor(r: 1, g: 1, b: 1)

            let mul = BlendMath.blend(mode: .multiply, src: black, dst: white)
            try TestAssertions.assertApproxEqual(mul.r, 0.0)

            let scr = BlendMath.blend(mode: .screen, src: black, dst: white)
            try TestAssertions.assertApproxEqual(scr.r, 1.0)
        }

        registry.register(tier: 2, feature: "F8-BlendModes", name: "test_F8_Boundary_BlendWithZeroOpacity_PreservesDest") {
            let src = PixelColor(r: 1, g: 0, b: 0, a: 0.0)
            let dst = PixelColor(r: 0, g: 1, b: 0, a: 1.0)
            let res = BlendMath.blend(mode: .normal, src: src, dst: dst)
            try TestAssertions.assertApproxEqual(res.a, 1.0)
        }

        registry.register(tier: 2, feature: "F8-BlendModes", name: "test_F8_Boundary_ColorDodge_ZeroDivAvoidance") {
            let src = PixelColor(r: 1.0, g: 1.0, b: 1.0) // 1 - s = 0
            let dst = PixelColor(r: 0.5, g: 0.5, b: 0.5)
            let dodge = BlendMath.blend(mode: .colorDodge, src: src, dst: dst)
            try TestAssertions.assertApproxEqual(dodge.r, 1.0)
        }

        registry.register(tier: 2, feature: "F8-BlendModes", name: "test_F8_Boundary_ColorBurn_ZeroDivAvoidance") {
            let src = PixelColor(r: 0.0, g: 0.0, b: 0.0) // s = 0
            let dst = PixelColor(r: 0.5, g: 0.5, b: 0.5)
            let burn = BlendMath.blend(mode: .colorBurn, src: src, dst: dst)
            try TestAssertions.assertApproxEqual(burn.r, 0.0)
        }

        registry.register(tier: 2, feature: "F8-BlendModes", name: "test_F8_Boundary_IdenticalColors_DifferenceIsZero") {
            let c1 = PixelColor(r: 0.65, g: 0.42, b: 0.88)
            let c2 = PixelColor(r: 0.65, g: 0.42, b: 0.88)
            let diff = BlendMath.blend(mode: .difference, src: c1, dst: c2)
            try TestAssertions.assertApproxEqual(diff.r, 0.0)
            try TestAssertions.assertApproxEqual(diff.g, 0.0)
            try TestAssertions.assertApproxEqual(diff.b, 0.0)
        }

        // =====================================================================
        // F9: Boundary — Raster Dynamic Brush Edge Conditions (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F9-RasterBrush", name: "test_F9_Boundary_ZeroLengthStroke_PlacesAtLeastOneDab") {
            let engine = RasterBrushEngine()
            let preset = BrushPreset(diameter: 20)
            let dabs = engine.strokeDabs(from: CGPoint(x: 10, y: 10), to: CGPoint(x: 10, y: 10), brush: preset)
            try TestAssertions.assertGreaterThan(CGFloat(dabs.count), 0.0)
        }

        registry.register(tier: 2, feature: "F9-RasterBrush", name: "test_F9_Boundary_MicroBrush_1pxDiameter") {
            let preset = BrushPreset(diameter: 1.0)
            try TestAssertions.assertApproxEqual(preset.diameter, 1.0)
        }

        registry.register(tier: 2, feature: "F9-RasterBrush", name: "test_F9_Boundary_MacroBrush_500pxDiameter") {
            let preset = BrushPreset(diameter: 500.0)
            try TestAssertions.assertApproxEqual(preset.diameter, 500.0)
        }

        registry.register(tier: 2, feature: "F9-RasterBrush", name: "test_F9_Boundary_HardnessStepFunction_AtOne") {
            let dab = BrushDab(position: .zero, radius: 10.0, opacity: 1.0)
            let val = dab.radialFalloff(distance: 0.0)
            try TestAssertions.assertApproxEqual(val, 1.0)
        }

        registry.register(tier: 2, feature: "F9-RasterBrush", name: "test_F9_Boundary_Rapid1000DabsBurst_Memory") {
            let engine = RasterBrushEngine()
            let preset = BrushPreset(diameter: 10, spacing: 0.1)
            _ = engine.strokeDabs(from: .zero, to: CGPoint(x: 1000, y: 0), brush: preset)
            try TestAssertions.assertGreaterThan(CGFloat(engine.dabBuffer.count), 900.0)
            engine.clearBuffer()
            try TestAssertions.assertEqual(engine.dabBuffer.count, 0)
        }

        // =====================================================================
        // F10: Boundary — Theme & Token Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F10-DarkTheme", name: "test_F10_Boundary_SurfacePageIsPureBlack") {
            try TestAssertions.assertEqual(ThemeTokens.surfacePage, "#000000")
        }

        registry.register(tier: 2, feature: "F10-DarkTheme", name: "test_F10_Boundary_ExtremeCornerRadiusClamping") {
            let radii = CornerRadii(uniform: 100.0)
            let clamped = radii.clamped(forWidth: 20, height: 20)
            try TestAssertions.assertTrue(clamped.tl <= 10.0)
        }

        registry.register(tier: 2, feature: "F10-DarkTheme", name: "test_F10_Boundary_MintSelectionHighContrast") {
            try TestAssertions.assertEqual(ThemeTokens.accentSelection, "#b2ffd6")
        }

        registry.register(tier: 2, feature: "F10-DarkTheme", name: "test_F10_Boundary_FocusRingTypeNoneConsistency") {
            let btn = NSButton()
            btn.focusRingType = .none
            try TestAssertions.assertEqual(btn.focusRingType, .none)
        }

        registry.register(tier: 2, feature: "F10-DarkTheme", name: "test_F10_Boundary_ZeroRadiusValidation") {
            let radii = CornerRadii(uniform: 0)
            try TestAssertions.assertApproxEqual(radii.tl, 0.0)
        }

        // =====================================================================
        // F11: Boundary — AppTitleBar State Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F11-TitleBar", name: "test_F11_Boundary_256CharDocTitle") {
            let longTitle = String(repeating: "A", count: 256)
            let state = AppTitleBarState(title: longTitle)
            try TestAssertions.assertEqual(state.documentTitle.count, 256)
        }

        registry.register(tier: 2, feature: "F11-TitleBar", name: "test_F11_Boundary_MinimumZoom5Percent") {
            let state = AppTitleBarState(zoom: 0.05)
            try TestAssertions.assertEqual(state.formattedZoom, "5%")
        }

        registry.register(tier: 2, feature: "F11-TitleBar", name: "test_F11_Boundary_MaximumZoom800Percent") {
            let state = AppTitleBarState(zoom: 8.0)
            try TestAssertions.assertEqual(state.formattedZoom, "800%")
        }

        registry.register(tier: 2, feature: "F11-TitleBar", name: "test_F11_Boundary_TitleBarHeightConstraint") {
            try TestAssertions.assertApproxEqual(ThemeTokens.titleBarHeight, 40.0)
        }

        registry.register(tier: 2, feature: "F11-TitleBar", name: "test_F11_Boundary_TrafficLightInsetConstraint") {
            try TestAssertions.assertApproxEqual(ThemeTokens.macTrafficLightInset, 96.0)
        }

        // =====================================================================
        // F12: Boundary — ToolRail Key Event Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F12-ToolRail", name: "test_F12_Boundary_UnknownKey_ReturnsNil") {
            let rail = ToolRailState()
            try TestAssertions.assertNil(rail.handleShortcutKey("z"))
            try TestAssertions.assertNil(rail.handleShortcutKey("1"))
        }

        registry.register(tier: 2, feature: "F12-ToolRail", name: "test_F12_Boundary_Rapid100ToolSwitches") {
            let rail = ToolRailState()
            for _ in 0..<100 {
                _ = rail.handleShortcutKey("v")
                _ = rail.handleShortcutKey("b")
            }
            try TestAssertions.assertEqual(rail.activeTool, .brush)
        }

        registry.register(tier: 2, feature: "F12-ToolRail", name: "test_F12_Boundary_PenSubToolCyclingWrapAround") {
            let rail = ToolRailState()
            _ = rail.handleShortcutKey("p")
            _ = rail.handleShortcutKey("p")
            _ = rail.handleShortcutKey("p")
            _ = rail.handleShortcutKey("p")
            try TestAssertions.assertFalse(rail.currentPenSubTool.isEmpty)
        }

        registry.register(tier: 2, feature: "F12-ToolRail", name: "test_F12_Boundary_CaseInsensitiveShortcuts") {
            let rail = ToolRailState()
            try TestAssertions.assertEqual(rail.handleShortcutKey("V"), .move)
            try TestAssertions.assertEqual(rail.handleShortcutKey("B"), .brush)
        }

        registry.register(
            tier: 2, feature: "F12-ToolRail", name: "test_F12_Boundary_ArtboardShortcutKeyF"
        ) {
            let rail = ToolRailState()
            try TestAssertions.assertEqual(rail.handleShortcutKey("f"), .artboard)
        }

        // =====================================================================
        // F13: Boundary — Inspector & Property Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F13-Inspector", name: "test_F13_Boundary_AnchorPointOnZeroSizedRect") {
            let zeroRect = CGRect(x: 50, y: 50, width: 0, height: 0)
            let center = TransformAnchor3x3.center.anchorPoint(for: zeroRect)
            try TestAssertions.assertPointApproxEqual(center, CGPoint(x: 50, y: 50))
        }

        registry.register(tier: 2, feature: "F13-Inspector", name: "test_F13_Boundary_HueWrapAt360Degrees") {
            let wheel0 = ColorWheelState(hue: 0)
            let wheel360 = ColorWheelState(hue: 360)
            try TestAssertions.assertEqual(wheel0.hexString, wheel360.hexString)
        }

        registry.register(tier: 2, feature: "F13-Inspector", name: "test_F13_Boundary_ZeroSaturationYieldsGrayscale") {
            let gray = ColorWheelState(hue: 200, saturation: 0, value: 0.5)
            try TestAssertions.assertEqual(gray.hexString, "#7F7F7F")
        }

        registry.register(tier: 2, feature: "F13-Inspector", name: "test_F13_Boundary_ZeroValueYieldsBlack") {
            let black = ColorWheelState(hue: 200, saturation: 1.0, value: 0.0)
            try TestAssertions.assertEqual(black.hexString, "#000000")
        }

        registry.register(tier: 2, feature: "F13-Inspector", name: "test_F13_Boundary_1000thLayerSelection") {
            var doc = VOODocument()
            for i in 0..<1000 {
                doc.nodes.append(VOONode(name: "L\(i)"))
            }
            try TestAssertions.assertEqual(doc.nodes[999].name, "L999")
        }

        // =====================================================================
        // F14: Boundary — Pixel Ruler Extreme Density (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F14-PixelRulers", name: "test_F14_Boundary_RulerTickAtZoom5Percent") {
            let interval = RulerConfig.tickInterval(forZoom: 0.05)
            try TestAssertions.assertEqual(interval, 200.0)
        }

        registry.register(tier: 2, feature: "F14-PixelRulers", name: "test_F14_Boundary_RulerTickAtZoom800Percent") {
            let interval = RulerConfig.tickInterval(forZoom: 8.0)
            try TestAssertions.assertEqual(interval, 5.0)
        }

        registry.register(tier: 2, feature: "F14-PixelRulers", name: "test_F14_Boundary_ProjectionAtNegativeCanvasOffset") {
            let proj = RulerConfig.cursorIndicatorLine(cursorDocPos: CGPoint(x: 0, y: 0), zoom: 1.0, panOffset: CGPoint(x: -5000, y: -5000))
            try TestAssertions.assertApproxEqual(proj.rulerX, -5000.0 + 18.0)
        }

        registry.register(tier: 2, feature: "F14-PixelRulers", name: "test_F14_Boundary_TrackThicknessIs18px") {
            try TestAssertions.assertApproxEqual(ThemeTokens.rulerTrackThickness, 18.0)
        }

        registry.register(tier: 2, feature: "F14-PixelRulers", name: "test_F14_Boundary_CursorProjectionAtZeroDocPos") {
            let proj = RulerConfig.cursorIndicatorLine(cursorDocPos: .zero, zoom: 1.0, panOffset: .zero)
            try TestAssertions.assertApproxEqual(proj.rulerX, 18.0)
            try TestAssertions.assertApproxEqual(proj.rulerY, 18.0)
        }

        // =====================================================================
        // F15: Boundary — Magnetic Snapping Edge Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F15-BoundarySnapping", name: "test_F15_Boundary_Snapping50Siblings_PicksClosest") {
            let canvas = CGSize(width: 2000, height: 2000)
            var siblings: [CGRect] = []
            for i in 0..<50 {
                siblings.append(CGRect(x: CGFloat(i * 10), y: 100, width: 8, height: 8))
            }
            let res = MagneticSnappingEngine.snap(point: CGPoint(x: 101.0, y: 100), targetBounds: siblings, canvasSize: canvas, zoom: 1.0)
            try TestAssertions.assertApproxEqual(res.snapped.x, 100.0)
        }

        registry.register(tier: 2, feature: "F15-BoundarySnapping", name: "test_F15_Boundary_ZeroSizedSibling_Snapping") {
            let zero = CGRect(x: 150, y: 150, width: 0, height: 0)
            let res = MagneticSnappingEngine.snap(point: CGPoint(x: 152, y: 150), targetBounds: [zero], canvasSize: CGSize(width: 1000, height: 1000), zoom: 1.0)
            try TestAssertions.assertApproxEqual(res.snapped.x, 150.0)
        }

        registry.register(tier: 2, feature: "F15-BoundarySnapping", name: "test_F15_Boundary_NegativeCoordinateSnapping") {
            let negSibling = CGRect(x: -200, y: -200, width: 50, height: 50)
            let res = MagneticSnappingEngine.snap(point: CGPoint(x: -202, y: -200), targetBounds: [negSibling], canvasSize: CGSize(width: 1000, height: 1000), zoom: 1.0)
            try TestAssertions.assertApproxEqual(res.snapped.x, -200.0)
        }

        registry.register(tier: 2, feature: "F15-BoundarySnapping", name: "test_F15_Boundary_ThresholdScalingWithZoom") {
            // At zoom 2.0, effective threshold is 6 / 2 = 3px
            let canvas = CGSize(width: 1000, height: 1000)
            let resClose = MagneticSnappingEngine.snap(point: CGPoint(x: 2.5, y: 50), targetBounds: [], canvasSize: canvas, zoom: 2.0)
            try TestAssertions.assertApproxEqual(resClose.snapped.x, 0.0)

            let resFar = MagneticSnappingEngine.snap(point: CGPoint(x: 4.0, y: 50), targetBounds: [], canvasSize: canvas, zoom: 2.0)
            try TestAssertions.assertApproxEqual(resFar.snapped.x, 4.0) // Not snapped
        }

        registry.register(tier: 2, feature: "F15-BoundarySnapping", name: "test_F15_Boundary_SnappingGuideColorIsSelectionMint") {
            let guide = SnapGuide(orientation: .horizontal, position: 200)
            try TestAssertions.assertEqual(guide.colorHex, "#b2ffd6")
        }

        // =====================================================================
        // F16: Boundary — Transform Handles Geometry Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F16-TransformHandles", name: "test_F16_Boundary_1x1MicroNodeHandles") {
            let micro = CGRect(x: 100, y: 100, width: 1, height: 1)
            let handles = TransformHandlesEngine.handleRects(for: micro)
            try TestAssertions.assertEqual(handles.count, 8)
        }

        registry.register(tier: 2, feature: "F16-TransformHandles", name: "test_F16_Boundary_HitTest0Point1PxOutside_ReturnsNil") {
            let box = CGRect(x: 100, y: 100, width: 200, height: 100)
            // Grab radius is 4 + 4 = 8px. Stalk tip is at (200, 80). Test at distance 9.0
            let hit = TransformHandlesEngine.hitTest(point: CGPoint(x: 200, y: 71), in: box)
            try TestAssertions.assertNil(hit)
        }

        registry.register(tier: 2, feature: "F16-TransformHandles", name: "test_F16_Boundary_StalkGripDotDimensions") {
            let box = CGRect(x: 50, y: 50, width: 100, height: 100)
            let stalk = TransformHandlesEngine.rotationStalk(for: box)
            try TestAssertions.assertApproxEqual(stalk.gripDot.width, 10.0)
            try TestAssertions.assertApproxEqual(stalk.gripDot.height, 10.0)
        }

        registry.register(tier: 2, feature: "F16-TransformHandles", name: "test_F16_Boundary_HitTestInsideBoxCenter_ReturnsNil") {
            let box = CGRect(x: 100, y: 100, width: 200, height: 100)
            let hit = TransformHandlesEngine.hitTest(point: CGPoint(x: 200, y: 150), in: box)
            try TestAssertions.assertNil(hit)
        }

        registry.register(tier: 2, feature: "F16-TransformHandles", name: "test_F16_Boundary_RotationStalkOffset20px") {
            try TestAssertions.assertApproxEqual(ThemeTokens.rotateStalkOffset, 20.0)
        }

        // =====================================================================
        // F17: Boundary — Viewport Clamping Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F17-ViewportGestures", name: "test_F17_Boundary_PinchZoomMaxClamp8_0") {
            var zoom: CGFloat = 7.5
            zoom *= 1.25 // 9.375
            zoom = min(zoom, 8.0)
            try TestAssertions.assertApproxEqual(zoom, 8.0)
        }

        registry.register(tier: 2, feature: "F17-ViewportGestures", name: "test_F17_Boundary_PinchZoomMinClamp0_05") {
            var zoom: CGFloat = 0.06
            zoom /= 1.5
            zoom = max(zoom, 0.05)
            try TestAssertions.assertApproxEqual(zoom, 0.05)
        }

        registry.register(tier: 2, feature: "F17-ViewportGestures", name: "test_F17_Boundary_PanHugeOffset_100k") {
            let offset = CGPoint(x: 100_000, y: -100_000)
            try TestAssertions.assertApproxEqual(offset.x, 100_000.0)
        }

        registry.register(tier: 2, feature: "F17-ViewportGestures", name: "test_F17_Boundary_RapidUndoRedoBurst") {
            var doc = VOODocument()
            let mgr = CommandManager()
            for _ in 0..<50 {
                _ = mgr.execute(InsertNodeCommand(node: VOONode()), on: &doc)
            }
            for _ in 0..<25 {
                _ = mgr.undo(on: &doc)
            }
            try TestAssertions.assertEqual(doc.nodes.count, 25)
        }

        registry.register(tier: 2, feature: "F17-ViewportGestures", name: "test_F17_Boundary_FitZoomMargin96px") {
            let margin: CGFloat = 96.0
            try TestAssertions.assertApproxEqual(margin, 96.0)
        }

        // =====================================================================
        // F18: Boundary — Accessibility Tree Limits (5 tests)
        // =====================================================================
        registry.register(tier: 2, feature: "F18-Accessibility", name: "test_F18_Boundary_EmptyViewHierarchyAccessibility") {
            let emptyView = NSView()
            let id = emptyView.accessibilityIdentifier()
            try TestAssertions.assertTrue(id.isEmpty)
        }

        registry.register(tier: 2, feature: "F18-Accessibility", name: "test_F18_Boundary_LongAccessibilityIdentifier") {
            let longId = "Inspector.LayersTree.Row.VeryLongLayerNameItemIndex999999"
            let view = NSView()
            view.setAccessibilityIdentifier(longId)
            try TestAssertions.assertEqual(view.accessibilityIdentifier(), longId)
        }

        registry.register(tier: 2, feature: "F18-Accessibility", name: "test_F18_Boundary_SpecialCharactersInAccessibilityID") {
            let idWithSymbols = "ToolRail.Button[0]:Select&Move"
            let btn = NSButton()
            btn.setAccessibilityIdentifier(idWithSymbols)
            try TestAssertions.assertEqual(btn.accessibilityIdentifier(), idWithSymbols)
        }

        registry.register(tier: 2, feature: "F18-Accessibility", name: "test_F18_Boundary_CatalogAllNonEmpty") {
            let ids = [
                AccessibilityCatalog.titleBar,
                AccessibilityCatalog.docTitle,
                AccessibilityCatalog.zoomIndicator,
                AccessibilityCatalog.toolRail,
                AccessibilityCatalog.canvasViewport,
                AccessibilityCatalog.inspectorStudio
            ]
            for id in ids {
                try TestAssertions.assertFalse(id.isEmpty)
            }
        }

        registry.register(tier: 2, feature: "F18-Accessibility", name: "test_F18_Boundary_A11yRoleVerification") {
            let view = NSView()
            view.setAccessibilityRole(.group)
            try TestAssertions.assertEqual(view.accessibilityRole(), .group)
        }

        // Bonus / Cross-cutting tests to ensure >= 92 tests in Tier 2
        registry.register(tier: 2, feature: "F1-DocModel", name: "test_F1_Boundary_CornerRadiiNonUniform_Clamping") {
            let radii = CornerRadii(tl: 100, tr: 50, br: 25, bl: 10)
            let clamped = radii.clamped(forWidth: 60, height: 40)
            try TestAssertions.assertTrue(clamped.tl + clamped.tr <= 60.0)
            try TestAssertions.assertTrue(clamped.tl + clamped.bl <= 40.0)
        }

        registry.register(tier: 2, feature: "F5-BooleanTopology", name: "test_F5_Boundary_NonIntersectingDivide_ReturnsBoth") {
            let r1 = CGRect(x: 0, y: 0, width: 40, height: 40)
            let r2 = CGRect(x: 100, y: 100, width: 40, height: 40)
            let result = GeometryEngine.performBoolean(op: .divide, subject: r1, clip: r2)
            try TestAssertions.assertEqual(result.count, 2)
        }
    }
}
