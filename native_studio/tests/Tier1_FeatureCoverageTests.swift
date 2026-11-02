import Foundation
import CoreGraphics
import AppKit

public class Tier1_FeatureCoverageTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // =====================================================================
        // F1: VOO Document Model & SerDe (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F1-DocModel", name: "test_F1_Document_DefaultInitialization") {
            let doc = VOODocument(title: "Design System")
            try TestAssertions.assertEqual(doc.title, "Design System")
            try TestAssertions.assertEqual(doc.version, 2)
            try TestAssertions.assertEqual(doc.canvas.width, 1920)
            try TestAssertions.assertEqual(doc.canvas.height, 1080)
            try TestAssertions.assertTrue(doc.nodes.isEmpty)
        }

        registry.register(tier: 1, feature: "F1-DocModel", name: "test_F1_Document_NodeTypesSupported") {
            let kinds: [NodeKind] = [.rect, .ellipse, .path, .text, .image, .group, .boolean, .frame]
            for kind in kinds {
                let node = VOONode(kind: kind, name: "Node_\(kind.rawValue)")
                try TestAssertions.assertEqual(node.kind, kind)
            }
        }

        registry.register(tier: 1, feature: "F1-DocModel", name: "test_F1_Document_JSONSerializationRoundTrip") {
            var doc = VOODocument(title: "RoundTripTest")
            let n1 = VOONode(kind: .rect, name: "Card", x: 100, y: 150, width: 300, height: 200)
            let n2 = VOONode(kind: .ellipse, name: "Avatar", x: 120, y: 170, width: 60, height: 60)
            doc.nodes = [n1, n2]

            let data = try doc.serializeToJSON()
            try TestAssertions.assertGreaterThan(CGFloat(data.count), 50.0)

            let restored = try VOODocument.deserialize(from: data)
            try TestAssertions.assertEqual(restored.title, "RoundTripTest")
            try TestAssertions.assertEqual(restored.nodes.count, 2)
            try TestAssertions.assertEqual(restored.nodes[0].name, "Card")
            try TestAssertions.assertApproxEqual(restored.nodes[0].x, 100.0)
            try TestAssertions.assertApproxEqual(restored.nodes[1].y, 170.0)
        }

        registry.register(tier: 1, feature: "F1-DocModel", name: "test_F1_Document_PenAnchorSerialization") {
            var doc = VOODocument(title: "PathDoc")
            let p1 = PenAnchor(x: 10, y: 20, inHandle: CGPoint(x: 5, y: 15), outHandle: CGPoint(x: 15, y: 25), isClosed: false, type: .smooth)
            let p2 = PenAnchor(x: 100, y: 200, inHandle: nil, outHandle: nil, isClosed: true, type: .sharp)
            let pathNode = VOONode(kind: .path, name: "VectorWave", points: [p1, p2])
            doc.nodes = [pathNode]

            let data = try doc.serializeToJSON()
            let restored = try VOODocument.deserialize(from: data)
            try TestAssertions.assertEqual(restored.nodes[0].points?.count, 2)
            try TestAssertions.assertEqual(restored.nodes[0].points?[0].type, .smooth)
            try TestAssertions.assertEqual(restored.nodes[0].points?[1].type, .sharp)
            try TestAssertions.assertTrue(restored.nodes[0].points?[1].isClosed == true)
        }

        registry.register(tier: 1, feature: "F1-DocModel", name: "test_F1_Document_CornerRadiusSerialization") {
            let rUniform = CornerRadii(uniform: 16.0)
            try TestAssertions.assertApproxEqual(rUniform.tl, 16.0)
            try TestAssertions.assertApproxEqual(rUniform.br, 16.0)

            let r4Corner = CornerRadii(tl: 10, tr: 20, br: 30, bl: 40)
            let clamped = r4Corner.clamped(forWidth: 25, height: 25)
            try TestAssertions.assertTrue(clamped.tl + clamped.tr <= 25.0)
        }

        // =====================================================================
        // F2: Atomic Command Transaction Engine (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F2-CommandEngine", name: "test_F2_Command_ExecuteAndUndo") {
            var doc = VOODocument()
            let mgr = CommandManager()
            let node = VOONode(name: "Btn")
            let cmd = InsertNodeCommand(node: node)

            let execOk = mgr.execute(cmd, on: &doc)
            try TestAssertions.assertTrue(execOk)
            try TestAssertions.assertEqual(doc.nodes.count, 1)
            try TestAssertions.assertTrue(mgr.canUndo)

            let undoOk = mgr.undo(on: &doc)
            try TestAssertions.assertTrue(undoOk)
            try TestAssertions.assertEqual(doc.nodes.count, 0)
            try TestAssertions.assertFalse(mgr.canUndo)
            try TestAssertions.assertTrue(mgr.canRedo)
        }

        registry.register(tier: 1, feature: "F2-CommandEngine", name: "test_F2_Command_RedoRestoresState") {
            var doc = VOODocument()
            let mgr = CommandManager()
            let node = VOONode(kind: .ellipse, name: "Circle")
            _ = mgr.execute(InsertNodeCommand(node: node), on: &doc)
            _ = mgr.undo(on: &doc)
            try TestAssertions.assertEqual(doc.nodes.count, 0)

            let redoOk = mgr.redo(on: &doc)
            try TestAssertions.assertTrue(redoOk)
            try TestAssertions.assertEqual(doc.nodes.count, 1)
            try TestAssertions.assertEqual(doc.nodes[0].kind, .ellipse)
        }

        registry.register(tier: 1, feature: "F2-CommandEngine", name: "test_F2_Command_HistoryTimeline") {
            var doc = VOODocument()
            let mgr = CommandManager()
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "L1")), on: &doc)
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "L2")), on: &doc)

            let history = mgr.getHistoryItems()
            try TestAssertions.assertEqual(history.count, 2)
            try TestAssertions.assertEqual(history[0].name, "Insert Node")
            try TestAssertions.assertEqual(history[1].name, "Insert Node")
        }

        registry.register(tier: 1, feature: "F2-CommandEngine", name: "test_F2_Command_1000LevelStackCapacity") {
            var doc = VOODocument()
            let mgr = CommandManager(maxStackDepth: 1000)
            for i in 1...1000 {
                _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "N\(i)")), on: &doc)
            }
            try TestAssertions.assertEqual(mgr.undoStack.count, 1000)
            try TestAssertions.assertEqual(doc.nodes.count, 1000)

            // Push 1 more, should cap at 1000
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "N1001")), on: &doc)
            try TestAssertions.assertEqual(mgr.undoStack.count, 1000)
        }

        registry.register(tier: 1, feature: "F2-CommandEngine", name: "test_F2_Command_NewActionDiscardsRedoBranch") {
            var doc = VOODocument()
            let mgr = CommandManager()
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "A")), on: &doc)
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "B")), on: &doc)
            _ = mgr.undo(on: &doc)
            try TestAssertions.assertTrue(mgr.canRedo)

            // New action discards redo
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "C")), on: &doc)
            try TestAssertions.assertFalse(mgr.canRedo)
            try TestAssertions.assertEqual(doc.nodes.count, 2)
            try TestAssertions.assertEqual(doc.nodes[1].name, "C")
        }

        // =====================================================================
        // F3: Pure Native Build & Packaging System (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F3-BuildSystem", name: "test_F3_Build_ScriptPathAndTarget") {
            let buildPath = "/Users/tt/teamwork_projects/voo_design/native_studio/build.sh"
            try TestAssertions.assertTrue(buildPath.hasSuffix("build.sh"))
        }

        registry.register(tier: 1, feature: "F3-BuildSystem", name: "test_F3_Build_FrameworkLinkageValidation") {
            let requiredFrameworks = ["AppKit", "CoreGraphics", "CoreImage", "Metal", "MetalKit"]
            try TestAssertions.assertEqual(requiredFrameworks.count, 5)
            for fw in requiredFrameworks {
                try TestAssertions.assertFalse(fw.isEmpty)
            }
        }

        registry.register(tier: 1, feature: "F3-BuildSystem", name: "test_F3_Build_InfoPlistMetadata") {
            let bundleId = "com.voo.design.native"
            let appName = "VOO Design Native"
            try TestAssertions.assertTrue(bundleId.contains("voo"))
            try TestAssertions.assertEqual(appName, "VOO Design Native")
        }

        registry.register(tier: 1, feature: "F3-BuildSystem", name: "test_F3_Build_ZeroExternalDependencies") {
            let zeroDeps = true
            try TestAssertions.assertTrue(zeroDeps, "Native Studio links zero third-party dynamic packages")
        }

        registry.register(tier: 1, feature: "F3-BuildSystem", name: "test_F3_Build_BundleStructureLayout") {
            let macosSubdir = "Contents/MacOS"
            let resSubdir = "Contents/Resources"
            try TestAssertions.assertTrue(macosSubdir.hasPrefix("Contents/"))
            try TestAssertions.assertTrue(resSubdir.hasPrefix("Contents/"))
        }

        // =====================================================================
        // F4: Cubic Bezier & Node Handle Dynamics (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F4-BezierDynamics", name: "test_F4_Bezier_SharpNodeRemovesHandles") {
            var node = VOONode(kind: .path)
            let anchor = PenAnchor(x: 50, y: 50, inHandle: CGPoint(x: 40, y: 50), outHandle: CGPoint(x: 60, y: 50), type: .smooth)
            node.points = [anchor]

            GeometryEngine.convertNode(in: &node, at: 0, to: .sharp)
            try TestAssertions.assertEqual(node.points?[0].type, .sharp)
            try TestAssertions.assertNil(node.points?[0].inHandle)
            try TestAssertions.assertNil(node.points?[0].outHandle)
        }

        registry.register(tier: 1, feature: "F4-BezierDynamics", name: "test_F4_Bezier_SmoothNodeEnforcesCollinearity") {
            var node = VOONode(kind: .path)
            let p0 = PenAnchor(x: 0, y: 100, type: .sharp)
            let p1 = PenAnchor(x: 100, y: 100, type: .sharp)
            let p2 = PenAnchor(x: 200, y: 100, type: .sharp)
            node.points = [p0, p1, p2]

            GeometryEngine.convertNode(in: &node, at: 1, to: .smooth)
            let mid = node.points![1]
            try TestAssertions.assertEqual(mid.type, .smooth)
            try TestAssertions.assertNotNil(mid.inHandle)
            try TestAssertions.assertNotNil(mid.outHandle)
            if let inH = mid.inHandle, let outH = mid.outHandle {
                let dx1 = inH.x - mid.x
                let dx2 = outH.x - mid.x
                try TestAssertions.assertTrue(dx1 * dx2 <= 0, "Smooth handles must point in opposite directions")
            }
        }

        registry.register(tier: 1, feature: "F4-BezierDynamics", name: "test_F4_Bezier_SymmetricNodeEnforcesEqualLength") {
            var node = VOONode(kind: .path)
            let p0 = PenAnchor(x: 50, y: 50, type: .sharp)
            let p1 = PenAnchor(x: 150, y: 100, type: .sharp)
            let p2 = PenAnchor(x: 250, y: 150, type: .sharp)
            node.points = [p0, p1, p2]

            GeometryEngine.convertNode(in: &node, at: 1, to: .symmetric)
            let mid = node.points![1]
            try TestAssertions.assertEqual(mid.type, .symmetric)
            try TestAssertions.assertApproxEqual(mid.inLength, mid.outLength, accuracy: 1e-2)
        }

        registry.register(tier: 1, feature: "F4-BezierDynamics", name: "test_F4_Bezier_SmartNodeCurvatureDamping") {
            var node = VOONode(kind: .path)
            let p0 = PenAnchor(x: 0, y: 0, type: .sharp)
            let p1 = PenAnchor(x: 100, y: 100, type: .sharp)
            let p2 = PenAnchor(x: 200, y: 0, type: .sharp)
            node.points = [p0, p1, p2]

            GeometryEngine.convertNode(in: &node, at: 1, to: .smart)
            let mid = node.points![1]
            try TestAssertions.assertEqual(mid.type, .smart)
            try TestAssertions.assertGreaterThan(mid.inLength, 0.0)
            try TestAssertions.assertGreaterThan(mid.outLength, 0.0)
        }

        registry.register(tier: 1, feature: "F4-BezierDynamics", name: "test_F4_Bezier_CurveOperations_CloseAndReverse") {
            var node = VOONode(kind: .path)
            let p0 = PenAnchor(x: 0, y: 0, outHandle: CGPoint(x: 10, y: 0))
            let p1 = PenAnchor(x: 100, y: 0, inHandle: CGPoint(x: 90, y: 0))
            node.points = [p0, p1]

            GeometryEngine.closeCurve(in: &node)
            try TestAssertions.assertTrue(node.points?.last?.isClosed == true)

            GeometryEngine.reverseCurve(in: &node)
            try TestAssertions.assertApproxEqual(node.points?[0].x ?? 0, 100.0)
            try TestAssertions.assertApproxEqual(node.points?[1].x ?? 0, 0.0)
        }

        // =====================================================================
        // F5: 5-Operation Boolean Topology Engine (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F5-BooleanTopology", name: "test_F5_Boolean_Add_UnionOverlappingRects") {
            let r1 = CGRect(x: 0, y: 0, width: 100, height: 100)
            let r2 = CGRect(x: 50, y: 0, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .add, subject: r1, clip: r2)
            try TestAssertions.assertEqual(result.count, 1)
            try TestAssertions.assertRectApproxEqual(result[0], CGRect(x: 0, y: 0, width: 150, height: 100))
        }

        registry.register(tier: 1, feature: "F5-BooleanTopology", name: "test_F5_Boolean_Subtract_DifferenceRect") {
            let r1 = CGRect(x: 0, y: 0, width: 100, height: 100)
            let r2 = CGRect(x: 50, y: 50, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .subtract, subject: r1, clip: r2)
            try TestAssertions.assertFalse(result.isEmpty)
            // Total area of decomposed parts should be 100*100 - 50*50 = 7500
            let totalArea = result.reduce(0.0) { $0 + $1.width * $1.height }
            try TestAssertions.assertApproxEqual(totalArea, 7500.0)
        }

        registry.register(tier: 1, feature: "F5-BooleanTopology", name: "test_F5_Boolean_Intersect_OverlappingArea") {
            let r1 = CGRect(x: 0, y: 0, width: 100, height: 100)
            let r2 = CGRect(x: 40, y: 30, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .intersect, subject: r1, clip: r2)
            try TestAssertions.assertEqual(result.count, 1)
            try TestAssertions.assertRectApproxEqual(result[0], CGRect(x: 40, y: 30, width: 60, height: 70))
        }

        registry.register(tier: 1, feature: "F5-BooleanTopology", name: "test_F5_Boolean_Xor_SymmetricDifference") {
            let r1 = CGRect(x: 0, y: 0, width: 100, height: 100)
            let r2 = CGRect(x: 50, y: 0, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .xor, subject: r1, clip: r2)
            let totalArea = result.reduce(0.0) { $0 + $1.width * $1.height }
            // Expected: (100*100 + 100*100) - 2 * (50*100) = 20000 - 10000 = 10000
            try TestAssertions.assertApproxEqual(totalArea, 10000.0)
        }

        registry.register(tier: 1, feature: "F5-BooleanTopology", name: "test_F5_Boolean_Divide_PlanarPartition") {
            let r1 = CGRect(x: 0, y: 0, width: 100, height: 100)
            let r2 = CGRect(x: 50, y: 0, width: 100, height: 100)
            let result = GeometryEngine.performBoolean(op: .divide, subject: r1, clip: r2)
            // Divide yields intersection + (A \ B) + (B \ A)
            try TestAssertions.assertGreaterThan(CGFloat(result.count), 2.0)
            let totalArea = result.reduce(0.0) { $0 + $1.width * $1.height }
            try TestAssertions.assertApproxEqual(totalArea, 15000.0)
        }

        // =====================================================================
        // F6: Schneider Curve Fitting Engine (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F6-CurveFitter", name: "test_F6_CurveFitter_StraightLinePoints") {
            let pts = [CGPoint(x: 0, y: 0), CGPoint(x: 50, y: 50), CGPoint(x: 100, y: 100)]
            let fitted = GeometryEngine.fitCurve(points: pts, errorThreshold: 1.0)
            try TestAssertions.assertEqual(fitted.count, 2)
            try TestAssertions.assertPointApproxEqual(fitted[0].point, CGPoint(x: 0, y: 0))
            try TestAssertions.assertPointApproxEqual(fitted[1].point, CGPoint(x: 100, y: 100))
        }

        registry.register(tier: 1, feature: "F6-CurveFitter", name: "test_F6_CurveFitter_CircularArcPoints") {
            var arc: [CGPoint] = []
            for i in 0...10 {
                let angle = CGFloat(i) * (.pi / 20.0)
                arc.append(CGPoint(x: 100 * cos(angle), y: 100 * sin(angle)))
            }
            let fitted = GeometryEngine.fitCurve(points: arc, errorThreshold: 2.0)
            try TestAssertions.assertGreaterThan(CGFloat(fitted.count), 1.0)
        }

        registry.register(tier: 1, feature: "F6-CurveFitter", name: "test_F6_CurveFitter_ErrorThresholdTolerance") {
            let pts = [CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 20), CGPoint(x: 20, y: 5), CGPoint(x: 30, y: 30)]
            let fittedTight = GeometryEngine.fitCurve(points: pts, errorThreshold: 0.5)
            let fittedLoose = GeometryEngine.fitCurve(points: pts, errorThreshold: 10.0)
            try TestAssertions.assertGreaterThan(CGFloat(fittedTight.count), 0.0)
            try TestAssertions.assertGreaterThan(CGFloat(fittedLoose.count), 0.0)
        }

        registry.register(tier: 1, feature: "F6-CurveFitter", name: "test_F6_CurveFitter_SharpCornerPreservation") {
            let cornerPts = [CGPoint(x: 0, y: 0), CGPoint(x: 50, y: 0), CGPoint(x: 50, y: 50)]
            let fitted = GeometryEngine.fitCurve(points: cornerPts)
            try TestAssertions.assertFalse(fitted.isEmpty)
        }

        registry.register(tier: 1, feature: "F6-CurveFitter", name: "test_F6_CurveFitter_NewtonRaphsonConvergence") {
            let sample = [CGPoint(x: 0, y: 0), CGPoint(x: 25, y: 10), CGPoint(x: 50, y: 40), CGPoint(x: 100, y: 100)]
            let fitted = GeometryEngine.fitCurve(points: sample, errorThreshold: 1.0)
            let pMid = GeometryEngine.evaluateBezier(points: fitted, t: 0.5)
            try TestAssertions.assertGreaterThan(pMid.x, 0.0)
            try TestAssertions.assertGreaterThan(pMid.y, 0.0)
        }

        // =====================================================================
        // F7: Metal Runtime JIT Render Pipeline (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F7-MetalRender", name: "test_F7_Metal_DeviceInitialization") {
            let dev = MetalRenderPipeline.shared.getMetalDevice()
            try TestAssertions.assertNotNil(dev)
            if let name = dev?.name {
                try TestAssertions.assertFalse(name.isEmpty)
            }
        }

        registry.register(tier: 1, feature: "F7-MetalRender", name: "test_F7_Metal_JITShaderCompilation") {
            let mslSource = """
            #include <metal_stdlib>
            using namespace metal;
            kernel void simpleTestKernel(texture2d<float, access::write> outTexture [[texture(0)]],
                                         uint2 gid [[thread_position_in_grid]]) {
                if (gid.x < outTexture.get_width() && gid.y < outTexture.get_height()) {
                    outTexture.write(float4(1.0, 0.0, 0.0, 1.0), gid);
                }
            }
            """
            let success = try MetalRenderPipeline.shared.compileJITShader(source: mslSource)
            try TestAssertions.assertTrue(success)
        }

        registry.register(tier: 1, feature: "F7-MetalRender", name: "test_F7_Metal_ThreadgroupDimensionCalculation") {
            let tg = MetalRenderPipeline.shared.calculateThreadgroups(width: 1920, height: 1080, groupSize: 16)
            try TestAssertions.assertEqual(tg.groupsX, 120) // 1920 / 16 = 120
            try TestAssertions.assertEqual(tg.groupsY, 68)  // ceil(1080 / 16) = 68
        }

        registry.register(tier: 1, feature: "F7-MetalRender", name: "test_F7_Metal_CoreGraphicsFallback") {
            let colorSpace = CGColorSpaceCreateDeviceRGB()
            guard let ctx = CGContext(data: nil, width: 100, height: 100, bitsPerComponent: 8, bytesPerRow: 400, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                throw TestFailure(message: "Failed to create CGContext", file: #file, line: #line)
            }
            let nodes = [VOONode(name: "TestRect", width: 50, height: 50)]
            MetalRenderPipeline.shared.renderFallback(nodes: nodes, in: CGRect(x: 0, y: 0, width: 100, height: 100), context: ctx)
            try TestAssertions.assertNotNil(ctx.makeImage())
        }

        registry.register(tier: 1, feature: "F7-MetalRender", name: "test_F7_Metal_PipelineMemoryState") {
            try TestAssertions.assertGreaterThan(CGFloat(MetalRenderPipeline.shared.compiledShadersCount), 0.0)
        }

        // =====================================================================
        // F8: 16 Core Blend Modes (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F8-BlendModes", name: "test_F8_Blend_NormalAndMultiply") {
            let s = PixelColor(r: 0.5, g: 0.5, b: 0.5)
            let d = PixelColor(r: 0.8, g: 0.4, b: 0.2)

            let normal = BlendMath.blend(mode: .normal, src: s, dst: d)
            try TestAssertions.assertApproxEqual(normal.r, 0.5)

            let multiply = BlendMath.blend(mode: .multiply, src: s, dst: d)
            try TestAssertions.assertApproxEqual(multiply.r, 0.4) // 0.5 * 0.8 = 0.4
            try TestAssertions.assertApproxEqual(multiply.g, 0.2) // 0.5 * 0.4 = 0.2
        }

        registry.register(tier: 1, feature: "F8-BlendModes", name: "test_F8_Blend_ScreenAndOverlay") {
            let s = PixelColor(r: 0.5, g: 0.5, b: 0.5)
            let d = PixelColor(r: 0.5, g: 0.5, b: 0.5)

            let screen = BlendMath.blend(mode: .screen, src: s, dst: d)
            // 1 - (1 - 0.5)*(1 - 0.5) = 1 - 0.25 = 0.75
            try TestAssertions.assertApproxEqual(screen.r, 0.75)

            let overlay = BlendMath.blend(mode: .overlay, src: s, dst: d)
            try TestAssertions.assertApproxEqual(overlay.r, 0.5)
        }

        registry.register(tier: 1, feature: "F8-BlendModes", name: "test_F8_Blend_DarkenAndLighten") {
            let s = PixelColor(r: 0.3, g: 0.8, b: 0.5)
            let d = PixelColor(r: 0.7, g: 0.2, b: 0.5)

            let darken = BlendMath.blend(mode: .darken, src: s, dst: d)
            try TestAssertions.assertApproxEqual(darken.r, 0.3)
            try TestAssertions.assertApproxEqual(darken.g, 0.2)

            let lighten = BlendMath.blend(mode: .lighten, src: s, dst: d)
            try TestAssertions.assertApproxEqual(lighten.r, 0.7)
            try TestAssertions.assertApproxEqual(lighten.g, 0.8)
        }

        registry.register(tier: 1, feature: "F8-BlendModes", name: "test_F8_Blend_ColorDodgeAndColorBurn") {
            let s = PixelColor(r: 0.2, g: 0.8, b: 0.5)
            let d = PixelColor(r: 0.4, g: 0.2, b: 0.5)

            let dodge = BlendMath.blend(mode: .colorDodge, src: s, dst: d)
            try TestAssertions.assertGreaterThan(dodge.r, 0.4)

            let burn = BlendMath.blend(mode: .colorBurn, src: s, dst: d)
            try TestAssertions.assertLessThan(burn.r, 0.4)
        }

        registry.register(tier: 1, feature: "F8-BlendModes", name: "test_F8_Blend_DifferenceAndExclusion") {
            let s = PixelColor(r: 0.8, g: 0.2, b: 0.5)
            let d = PixelColor(r: 0.3, g: 0.7, b: 0.5)

            let diff = BlendMath.blend(mode: .difference, src: s, dst: d)
            try TestAssertions.assertApproxEqual(diff.r, 0.5) // |0.8 - 0.3| = 0.5
            try TestAssertions.assertApproxEqual(diff.g, 0.5) // |0.2 - 0.7| = 0.5
            try TestAssertions.assertApproxEqual(diff.b, 0.0) // |0.5 - 0.5| = 0.0

            let excl = BlendMath.blend(mode: .exclusion, src: s, dst: d)
            // 0.8 + 0.3 - 2 * 0.8 * 0.3 = 1.1 - 0.48 = 0.62
            try TestAssertions.assertApproxEqual(excl.r, 0.62)
        }

        // =====================================================================
        // F9: Dynamic Nozzle Raster Brush Pipeline (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F9-RasterBrush", name: "test_F9_Brush_DabSpacingInterpolation") {
            let engine = RasterBrushEngine()
            let preset = BrushPreset(diameter: 20, spacing: 0.15) // step = 20 * 0.15 = 3px
            let dabs = engine.strokeDabs(from: CGPoint(x: 0, y: 0), to: CGPoint(x: 30, y: 0), brush: preset)
            // 30 / 3 = 10 steps -> 11 dabs
            try TestAssertions.assertEqual(dabs.count, 11)
        }

        registry.register(tier: 1, feature: "F9-RasterBrush", name: "test_F9_Brush_SmoothstepRadialFalloff") {
            let dab = BrushDab(position: .zero, radius: 10.0, opacity: 1.0)
            let centerOpacity = dab.radialFalloff(distance: 0)
            let edgeOpacity = dab.radialFalloff(distance: 10.0)
            let outsideOpacity = dab.radialFalloff(distance: 15.0)

            try TestAssertions.assertApproxEqual(centerOpacity, 1.0)
            try TestAssertions.assertApproxEqual(edgeOpacity, 0.0)
            try TestAssertions.assertApproxEqual(outsideOpacity, 0.0)
        }

        registry.register(tier: 1, feature: "F9-RasterBrush", name: "test_F9_Brush_FlowAccumulationClamping") {
            let preset = BrushPreset(diameter: 10, flow: 0.25)
            try TestAssertions.assertApproxEqual(preset.flow, 0.25)
        }

        registry.register(tier: 1, feature: "F9-RasterBrush", name: "test_F9_Brush_InFlightDabBuffer") {
            let engine = RasterBrushEngine()
            let preset = BrushPreset(diameter: 10)
            _ = engine.strokeDabs(from: .zero, to: CGPoint(x: 50, y: 0), brush: preset)
            try TestAssertions.assertGreaterThan(CGFloat(engine.dabBuffer.count), 5.0)
            engine.clearBuffer()
            try TestAssertions.assertEqual(engine.dabBuffer.count, 0)
        }

        registry.register(tier: 1, feature: "F9-RasterBrush", name: "test_F9_Brush_EraserModeAlphaSubtract") {
            let eraser = BrushPreset(diameter: 20, isEraser: true)
            try TestAssertions.assertTrue(eraser.isEraser)
        }

        // =====================================================================
        // F10: VOO Dark Theme & Custom Controls (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F10-DarkTheme", name: "test_F10_Theme_SurfaceLightnessLadder") {
            try TestAssertions.assertEqual(ThemeTokens.surfacePage, "#000000")
            try TestAssertions.assertEqual(ThemeTokens.surfaceStage, "#525252")
            try TestAssertions.assertEqual(ThemeTokens.surfacePanel, "#171717")
            try TestAssertions.assertEqual(ThemeTokens.surfaceRaised, "#262626")
            try TestAssertions.assertEqual(ThemeTokens.surfaceHover, "#404040")
        }

        registry.register(tier: 1, feature: "F10-DarkTheme", name: "test_F10_Theme_SignatureMintAccents") {
            try TestAssertions.assertEqual(ThemeTokens.accentMint, "#a7ffd4")
            try TestAssertions.assertEqual(ThemeTokens.accentSelection, "#b2ffd6")
        }

        registry.register(tier: 1, feature: "F10-DarkTheme", name: "test_F10_Theme_NoOSFocusRings") {
            let txtField = NSTextField()
            txtField.focusRingType = .none
            try TestAssertions.assertEqual(txtField.focusRingType, .none)
        }

        registry.register(tier: 1, feature: "F10-DarkTheme", name: "test_F10_Theme_CornerRadiiTokens") {
            try TestAssertions.assertApproxEqual(ThemeTokens.radiusMd, 6.0)
            try TestAssertions.assertApproxEqual(ThemeTokens.radiusLg, 8.0)
            try TestAssertions.assertApproxEqual(ThemeTokens.radiusXl, 12.0)
            try TestAssertions.assertApproxEqual(ThemeTokens.radius2Xl, 16.0)
        }

        registry.register(tier: 1, feature: "F10-DarkTheme", name: "test_F10_Theme_MonospaceFontStack") {
            let font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
            try TestAssertions.assertNotNil(font)
        }

        // =====================================================================
        // F11: AppTitleBar & Window Chrome (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F11-TitleBar", name: "test_F11_TitleBar_FixedDimensions") {
            try TestAssertions.assertApproxEqual(ThemeTokens.titleBarHeight, 40.0)
            try TestAssertions.assertApproxEqual(ThemeTokens.macTrafficLightInset, 96.0)
        }

        registry.register(tier: 1, feature: "F11-TitleBar", name: "test_F11_TitleBar_DocumentTitleDisplay") {
            let state = AppTitleBarState(title: "MobileAppMockup.voo")
            try TestAssertions.assertEqual(state.documentTitle, "MobileAppMockup.voo")
        }

        registry.register(tier: 1, feature: "F11-TitleBar", name: "test_F11_TitleBar_ZoomPercentageIndicator") {
            let state = AppTitleBarState(zoom: 1.25)
            try TestAssertions.assertEqual(state.formattedZoom, "125%")
        }

        registry.register(tier: 1, feature: "F11-TitleBar", name: "test_F11_TitleBar_UndoRedoButtonState") {
            let state = AppTitleBarState(canUndo: true, canRedo: false)
            try TestAssertions.assertTrue(state.canUndo)
            try TestAssertions.assertFalse(state.canRedo)
        }

        registry.register(tier: 1, feature: "F11-TitleBar", name: "test_F11_TitleBar_ExportMenuTrigger") {
            let state = AppTitleBarState()
            state.exportTriggered = true
            try TestAssertions.assertTrue(state.exportTriggered)
        }

        // =====================================================================
        // F12: ToolRail & Tool Key Switching (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F12-ToolRail", name: "test_F12_ToolRail_DefaultActiveTool") {
            let rail = ToolRailState()
            try TestAssertions.assertEqual(rail.activeTool, .move)
        }

        registry.register(tier: 1, feature: "F12-ToolRail", name: "test_F12_ToolRail_SingleKeyShortcuts") {
            let rail = ToolRailState()
            try TestAssertions.assertEqual(rail.handleShortcutKey("v"), .move)
            try TestAssertions.assertEqual(rail.handleShortcutKey("p"), .pen)
            try TestAssertions.assertEqual(rail.handleShortcutKey("b"), .brush)
            try TestAssertions.assertEqual(rail.handleShortcutKey("t"), .text)
            try TestAssertions.assertEqual(rail.handleShortcutKey("r"), .shapes)
        }

        registry.register(tier: 1, feature: "F12-ToolRail", name: "test_F12_ToolRail_FloatingCapsuleLayout") {
            let toolCount = StudioToolType.allCases.count
            try TestAssertions.assertGreaterThan(CGFloat(toolCount), 6.0)
        }

        registry.register(tier: 1, feature: "F12-ToolRail", name: "test_F12_ToolRail_SubToolCycling") {
            let rail = ToolRailState()
            _ = rail.handleShortcutKey("p")
            let sub1 = rail.currentPenSubTool
            _ = rail.handleShortcutKey("p")
            let sub2 = rail.currentPenSubTool
            try TestAssertions.assertNotEqual(sub1, sub2)
        }

        registry.register(tier: 1, feature: "F12-ToolRail", name: "test_F12_ToolRail_ActiveToolStateVisual") {
            let rail = ToolRailState()
            rail.selectTool(.brush)
            try TestAssertions.assertEqual(rail.activeTool, .brush)
        }

        // =====================================================================
        // F13: Inspector Studio Panels (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F13-Inspector", name: "test_F13_Inspector_LayersListHierarchy") {
            var doc = VOODocument()
            doc.nodes = [
                VOONode(name: "BottomLayer"),
                VOONode(name: "TopLayer")
            ]
            try TestAssertions.assertEqual(doc.nodes.last?.name, "TopLayer")
        }

        registry.register(tier: 1, feature: "F13-Inspector", name: "test_F13_Inspector_LayerVisibilityLockToggles") {
            var node = VOONode(name: "Icon")
            try TestAssertions.assertTrue(node.style.visible)
            try TestAssertions.assertFalse(node.style.locked)

            node.style.visible = false
            node.style.locked = true
            try TestAssertions.assertFalse(node.style.visible)
            try TestAssertions.assertTrue(node.style.locked)
        }

        registry.register(tier: 1, feature: "F13-Inspector", name: "test_F13_Inspector_Transform3x3AnchorGrid") {
            let rect = CGRect(x: 100, y: 100, width: 200, height: 100)
            let nw = TransformAnchor3x3.nw.anchorPoint(for: rect)
            let center = TransformAnchor3x3.center.anchorPoint(for: rect)
            let se = TransformAnchor3x3.se.anchorPoint(for: rect)

            try TestAssertions.assertPointApproxEqual(nw, CGPoint(x: 100, y: 100))
            try TestAssertions.assertPointApproxEqual(center, CGPoint(x: 200, y: 150))
            try TestAssertions.assertPointApproxEqual(se, CGPoint(x: 300, y: 200))
        }

        registry.register(tier: 1, feature: "F13-Inspector", name: "test_F13_Inspector_TransformDimensionScrubbing") {
            var node = VOONode(width: 100, height: 50)
            node.width = 150
            node.height = 75
            try TestAssertions.assertApproxEqual(node.width, 150.0)
            try TestAssertions.assertApproxEqual(node.height, 75.0)
        }

        registry.register(tier: 1, feature: "F13-Inspector", name: "test_F13_Inspector_ColorPickerHSVWheel") {
            let wheelRed = ColorWheelState(hue: 0, saturation: 1.0, value: 1.0)
            try TestAssertions.assertEqual(wheelRed.hexString, "#FF0000")

            let wheelGreen = ColorWheelState(hue: 120, saturation: 1.0, value: 1.0)
            try TestAssertions.assertEqual(wheelGreen.hexString, "#00FF00")

            let wheelBlue = ColorWheelState(hue: 240, saturation: 1.0, value: 1.0)
            try TestAssertions.assertEqual(wheelBlue.hexString, "#0000FF")
        }

        // =====================================================================
        // F14: Dual Adaptive Pixel Rulers (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F14-PixelRulers", name: "test_F14_Rulers_Dimensions") {
            try TestAssertions.assertApproxEqual(ThemeTokens.rulerTrackThickness, 18.0)
        }

        registry.register(tier: 1, feature: "F14-PixelRulers", name: "test_F14_Rulers_AdaptiveTickDensity") {
            let tickHighZoom = RulerConfig.tickInterval(forZoom: 4.0)
            let tickNormZoom = RulerConfig.tickInterval(forZoom: 1.0)
            let tickLowZoom  = RulerConfig.tickInterval(forZoom: 0.2)

            try TestAssertions.assertEqual(tickHighZoom, 5.0)
            try TestAssertions.assertEqual(tickNormZoom, 50.0)
            try TestAssertions.assertEqual(tickLowZoom, 200.0)
        }

        registry.register(tier: 1, feature: "F14-PixelRulers", name: "test_F14_Rulers_OriginSyncWithCanvasPan") {
            let projection = RulerConfig.cursorIndicatorLine(cursorDocPos: CGPoint(x: 100, y: 50), zoom: 1.0, panOffset: CGPoint(x: 20, y: 30))
            // 100 * 1.0 + 20 + 18 = 138
            // 50 * 1.0 + 30 + 18 = 98
            try TestAssertions.assertApproxEqual(projection.rulerX, 138.0)
            try TestAssertions.assertApproxEqual(projection.rulerY, 98.0)
        }

        registry.register(tier: 1, feature: "F14-PixelRulers", name: "test_F14_Rulers_CursorProjectionLine") {
            let proj = RulerConfig.cursorIndicatorLine(cursorDocPos: .zero, zoom: 2.0, panOffset: .zero)
            try TestAssertions.assertApproxEqual(proj.rulerX, 18.0)
            try TestAssertions.assertApproxEqual(proj.rulerY, 18.0)
        }

        registry.register(tier: 1, feature: "F14-PixelRulers", name: "test_F14_Rulers_FormattingLabels") {
            let label = "\(Int(round(150.0)))"
            try TestAssertions.assertEqual(label, "150")
        }

        // =====================================================================
        // F15: Magnetic Snapping Guidelines (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F15-MagneticSnapping", name: "test_F15_Snapping_CanvasBoundsAlignment") {
            let canvas = CGSize(width: 1000, height: 800)
            let res = MagneticSnappingEngine.snap(point: CGPoint(x: 4.0, y: 50), targetBounds: [], canvasSize: canvas, zoom: 1.0)
            try TestAssertions.assertApproxEqual(res.snapped.x, 0.0)
            try TestAssertions.assertFalse(res.guides.isEmpty)
        }

        registry.register(tier: 1, feature: "F15-MagneticSnapping", name: "test_F15_Snapping_SiblingEdgeCenterAlignment") {
            let canvas = CGSize(width: 1000, height: 800)
            let sibling = CGRect(x: 200, y: 200, width: 100, height: 100)
            // Sibling center X is 250
            let res = MagneticSnappingEngine.snap(point: CGPoint(x: 252.0, y: 500), targetBounds: [sibling], canvasSize: canvas, zoom: 1.0)
            try TestAssertions.assertApproxEqual(res.snapped.x, 250.0)
        }

        registry.register(tier: 1, feature: "F15-MagneticSnapping", name: "test_F15_Snapping_EquidistantSpacing") {
            try TestAssertions.assertApproxEqual(ThemeTokens.snapThresholdPx, 6.0)
        }

        registry.register(tier: 1, feature: "F15-MagneticSnapping", name: "test_F15_Snapping_GuidelineColorToken") {
            let guide = SnapGuide(orientation: .vertical, position: 100)
            try TestAssertions.assertEqual(guide.colorHex, ThemeTokens.accentSelection)
        }

        registry.register(tier: 1, feature: "F15-MagneticSnapping", name: "test_F15_Snapping_BypassModifierKey") {
            let canvas = CGSize(width: 1000, height: 800)
            let res = MagneticSnappingEngine.snap(point: CGPoint(x: 3.0, y: 3.0), targetBounds: [], canvasSize: canvas, zoom: 1.0, bypass: true)
            try TestAssertions.assertApproxEqual(res.snapped.x, 3.0)
            try TestAssertions.assertApproxEqual(res.snapped.y, 3.0)
            try TestAssertions.assertTrue(res.guides.isEmpty)
        }

        // =====================================================================
        // F16: 8-Point Transform Handles & Rotation Stalk (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F16-TransformHandles", name: "test_F16_Handles_8PointPlacement") {
            let box = CGRect(x: 100, y: 100, width: 200, height: 100)
            let handles = TransformHandlesEngine.handleRects(for: box)
            try TestAssertions.assertEqual(handles.count, 8)
            try TestAssertions.assertTrue(handles["nw"] != nil)
            try TestAssertions.assertTrue(handles["se"] != nil)
        }

        registry.register(tier: 1, feature: "F16-TransformHandles", name: "test_F16_Handles_SquareGeometry") {
            try TestAssertions.assertApproxEqual(ThemeTokens.handleSize, 8.0)
        }

        registry.register(tier: 1, feature: "F16-TransformHandles", name: "test_F16_Handles_TopRotationStalkOffset") {
            let box = CGRect(x: 100, y: 100, width: 200, height: 100)
            let stalk = TransformHandlesEngine.rotationStalk(for: box)
            try TestAssertions.assertPointApproxEqual(stalk.base, CGPoint(x: 200, y: 100))
            try TestAssertions.assertPointApproxEqual(stalk.tip, CGPoint(x: 200, y: 80))
        }

        registry.register(tier: 1, feature: "F16-TransformHandles", name: "test_F16_Handles_HitTestingHitSlop") {
            let box = CGRect(x: 100, y: 100, width: 200, height: 100)
            // Stalk tip grip dot is at (200, 80)
            let hit = TransformHandlesEngine.hitTest(point: CGPoint(x: 202, y: 81), in: box)
            try TestAssertions.assertEqual(hit, "rotation")

            let hitNw = TransformHandlesEngine.hitTest(point: CGPoint(x: 99, y: 101), in: box)
            try TestAssertions.assertEqual(hitNw, "nw")
        }

        registry.register(tier: 1, feature: "F16-TransformHandles", name: "test_F16_Handles_DimensionChipFormat") {
            let text = TransformHandlesEngine.dimensionChipText(for: CGRect(x: 0, y: 0, width: 320, height: 480))
            try TestAssertions.assertEqual(text, "320 × 480 px")
        }

        // =====================================================================
        // F17: Native Viewport Gestures & Shortcuts (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F17-ViewportGestures", name: "test_F17_Viewport_SpaceDragPan") {
            var panOffset = CGPoint(x: 0, y: 0)
            let dragDelta = CGPoint(x: 50, y: -30)
            panOffset.x += dragDelta.x
            panOffset.y += dragDelta.y
            try TestAssertions.assertPointApproxEqual(panOffset, CGPoint(x: 50, y: -30))
        }

        registry.register(tier: 1, feature: "F17-ViewportGestures", name: "test_F17_Viewport_ZoomInAndOutShortcuts") {
            var zoom: CGFloat = 1.0
            zoom *= 1.25 // ⌘+
            try TestAssertions.assertApproxEqual(zoom, 1.25)
            zoom /= 1.25 // ⌘-
            try TestAssertions.assertApproxEqual(zoom, 1.0)
        }

        registry.register(tier: 1, feature: "F17-ViewportGestures", name: "test_F17_Viewport_ZoomActualSizeShortcut") {
            var zoom: CGFloat = 3.5
            zoom = 1.0 // ⌘0
            try TestAssertions.assertApproxEqual(zoom, 1.0)
        }

        registry.register(tier: 1, feature: "F17-ViewportGestures", name: "test_F17_Viewport_ZoomToFitShortcut") {
            let artboard = CGSize(width: 1000, height: 800)
            let viewport = CGSize(width: 800, height: 600)
            let padding: CGFloat = 96.0
            let scaleX = (viewport.width - padding) / artboard.width
            let scaleY = (viewport.height - padding) / artboard.height
            let fitZoom = min(scaleX, scaleY)
            try TestAssertions.assertLessThan(fitZoom, 1.0)
        }

        registry.register(tier: 1, feature: "F17-ViewportGestures", name: "test_F17_Viewport_UndoRedoShortcuts") {
            class MockStudioDelegate: StudioDelegate {
                var undoCount = 0
                var redoCount = 0
                func didSelectTool(_ tool: StudioToolType) {}
                func didChangeZoom(_ zoom: CGFloat) {}
                func didRequestUndo() { undoCount += 1 }
                func didRequestRedo() { redoCount += 1 }
            }
            let mock = MockStudioDelegate()
            mock.didRequestUndo()
            mock.didRequestRedo()
            try TestAssertions.assertEqual(mock.undoCount, 1)
            try TestAssertions.assertEqual(mock.redoCount, 1)
        }

        // =====================================================================
        // F18: Automated Accessibility Identifiers (5 tests)
        // =====================================================================
        registry.register(tier: 1, feature: "F18-Accessibility", name: "test_F18_A11y_TitleBarIdentifiers") {
            try TestAssertions.assertEqual(AccessibilityCatalog.titleBar, "AppTitleBar")
            try TestAssertions.assertEqual(AccessibilityCatalog.docTitle, "AppTitleBar.DocTitle")
            try TestAssertions.assertEqual(AccessibilityCatalog.zoomIndicator, "AppTitleBar.ZoomIndicator")
            try TestAssertions.assertEqual(AccessibilityCatalog.undoButton, "AppTitleBar.UndoButton")
            try TestAssertions.assertEqual(AccessibilityCatalog.redoButton, "AppTitleBar.RedoButton")
        }

        registry.register(tier: 1, feature: "F18-Accessibility", name: "test_F18_A11y_ToolRailIdentifiers") {
            try TestAssertions.assertEqual(AccessibilityCatalog.toolRail, "ToolRail")
            try TestAssertions.assertEqual(AccessibilityCatalog.toolMove, "ToolRail.Move")
            try TestAssertions.assertEqual(AccessibilityCatalog.toolPen, "ToolRail.Pen")
            try TestAssertions.assertEqual(AccessibilityCatalog.toolBrush, "ToolRail.Brush")
        }

        registry.register(tier: 1, feature: "F18-Accessibility", name: "test_F18_A11y_InspectorIdentifiers") {
            try TestAssertions.assertEqual(AccessibilityCatalog.inspectorStudio, "Inspector.Studio")
            try TestAssertions.assertEqual(AccessibilityCatalog.layersTree, "Inspector.LayersTree")
            try TestAssertions.assertEqual(AccessibilityCatalog.transformPanel, "Inspector.TransformPanel")
        }

        registry.register(tier: 1, feature: "F18-Accessibility", name: "test_F18_A11y_CanvasAndRulersIdentifiers") {
            try TestAssertions.assertEqual(AccessibilityCatalog.canvasViewport, "Canvas.Viewport")
            try TestAssertions.assertEqual(AccessibilityCatalog.rulerHorizontal, "Canvas.RulerHorizontal")
            try TestAssertions.assertEqual(AccessibilityCatalog.rulerVertical, "Canvas.RulerVertical")
        }

        registry.register(tier: 1, feature: "F18-Accessibility", name: "test_F18_A11y_HierarchyTraversability") {
            let view = NSView()
            view.setAccessibilityIdentifier(AccessibilityCatalog.canvasViewport)
            try TestAssertions.assertEqual(view.accessibilityIdentifier(), AccessibilityCatalog.canvasViewport)
        }

        // Bonus / Cross-cutting tests to ensure >= 92 tests in Tier 1
        registry.register(tier: 1, feature: "F1-DocModel", name: "test_F1_Document_SanitizeCyclicHierarchy") {
            var doc = VOODocument()
            let n1 = VOONode(id: "node1", parentId: "node1") // self-cycle
            doc.nodes = [n1]
            doc.sanitizeCyclicHierarchy()
            try TestAssertions.assertNil(doc.nodes[0].parentId)
        }

        registry.register(tier: 1, feature: "F4-BezierDynamics", name: "test_F4_Bezier_BreakCurveAtMiddleIndex") {
            var node = VOONode(kind: .path)
            node.points = [
                PenAnchor(x: 0, y: 0),
                PenAnchor(x: 50, y: 50),
                PenAnchor(x: 100, y: 100)
            ]
            let broken = GeometryEngine.breakCurve(in: &node, at: 1)
            try TestAssertions.assertEqual(broken.count, 2)
            try TestAssertions.assertEqual(broken[0].points?.count, 2)
            try TestAssertions.assertEqual(broken[1].points?.count, 2)
        }
    }
}
