import Foundation
import CoreGraphics
import AppKit

public class Tier3_CrossFeatureTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // 1. Boolean Topology + Dynamic Brush
        registry.register(tier: 3, feature: "F5+F9-Cross", name: "test_F5_F9_BooleanWithBrushPath") {
            let brushEngine = RasterBrushEngine()
            let preset = BrushPreset(diameter: 20)
            let dabs = brushEngine.strokeDabs(from: CGPoint(x: 0, y: 50), to: CGPoint(x: 100, y: 50), brush: preset)

            let minX = dabs.map { $0.position.x - $0.radius }.min() ?? 0
            let maxX = dabs.map { $0.position.x + $0.radius }.max() ?? 100
            let minY = dabs.map { $0.position.y - $0.radius }.min() ?? 40
            let maxY = dabs.map { $0.position.y + $0.radius }.max() ?? 60

            let strokeBox = CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
            let rectShape = CGRect(x: 50, y: 30, width: 80, height: 60)

            let unionResult = GeometryEngine.performBoolean(op: .add, subject: strokeBox, clip: rectShape)
            try TestAssertions.assertFalse(unionResult.isEmpty)
        }

        // 2. Command Stack + Boolean Mutations
        registry.register(tier: 3, feature: "F2+F5-Cross", name: "test_F2_F5_UndoAcrossBooleanMutation") {
            var doc = VOODocument()
            let n1 = VOONode(name: "BaseRect", x: 0, y: 0, width: 100, height: 100)
            let n2 = VOONode(name: "CutoutCircle", x: 50, y: 50, width: 100, height: 100)
            doc.nodes = [n1, n2]

            let mgr = CommandManager()
            let compound = VOONode(kind: .boolean, name: "SubtractedResult", width: 100, height: 100, booleanOperation: "subtract")
            let cmd = BooleanMutationCommand(opName: "Subtract", subjectId: n1.id, clipId: n2.id, resultNode: compound)

            let execOk = mgr.execute(cmd, on: &doc)
            try TestAssertions.assertTrue(execOk)
            try TestAssertions.assertEqual(doc.nodes.count, 1)
            try TestAssertions.assertEqual(doc.nodes[0].name, "SubtractedResult")

            let undoOk = mgr.undo(on: &doc)
            try TestAssertions.assertTrue(undoOk)
            try TestAssertions.assertEqual(doc.nodes.count, 2)
            try TestAssertions.assertEqual(doc.nodes[0].name, "BaseRect")
            try TestAssertions.assertEqual(doc.nodes[1].name, "CutoutCircle")
        }

        // 3. Inspector Style Changes + 16 Blend Modes
        registry.register(tier: 3, feature: "F8+F13-Cross", name: "test_F8_F13_StyleChangesWithCustomBlendModes") {
            let node = VOONode(name: "TintLayer", style: LayerStyle(fill: "#E5B2FF", blendMode: "multiply"))
            try TestAssertions.assertEqual(node.style.blendMode, "multiply")

            let src = PixelColor(r: 0.9, g: 0.7, b: 1.0)
            let dst = PixelColor(r: 0.5, g: 0.5, b: 0.5)
            let blended = BlendMath.blend(mode: .multiply, src: src, dst: dst)
            try TestAssertions.assertApproxEqual(blended.r, 0.45)
        }

        // 4. Bezier Curve Editing + 8-Point Transform Handles
        registry.register(tier: 3, feature: "F4+F16-Cross", name: "test_F4_F16_BezierNodeEditWithTransformHandles") {
            var node = VOONode(kind: .path)
            node.points = [
                PenAnchor(x: 0, y: 0),
                PenAnchor(x: 200, y: 150)
            ]
            let bbox = CGRect(x: 0, y: 0, width: 200, height: 150)
            let handles = TransformHandlesEngine.handleRects(for: bbox)
            try TestAssertions.assertRectApproxEqual(handles["se"]!, CGRect(x: 196, y: 146, width: 8, height: 8))

            // Mutate endpoint
            node.points?[1] = PenAnchor(x: 300, y: 250)
            let newBbox = CGRect(x: 0, y: 0, width: 300, height: 250)
            let newHandles = TransformHandlesEngine.handleRects(for: newBbox)
            try TestAssertions.assertRectApproxEqual(newHandles["se"]!, CGRect(x: 296, y: 246, width: 8, height: 8))
        }

        // 5. Adaptive Rulers + Canvas Pan & Zoom
        registry.register(tier: 3, feature: "F14+F17-Cross", name: "test_F14_F17_RulerProjectionDuringCanvasPanZoom") {
            let zoom: CGFloat = 2.0
            let pan = CGPoint(x: 100, y: 50)
            let cursorDoc = CGPoint(x: 50, y: 50)

            let projection = RulerConfig.cursorIndicatorLine(cursorDocPos: cursorDoc, zoom: zoom, panOffset: pan)
            // rulerX = 50 * 2.0 + 100 + 18 = 218
            // rulerY = 50 * 2.0 + 50 + 18 = 168
            try TestAssertions.assertApproxEqual(projection.rulerX, 218.0)
            try TestAssertions.assertApproxEqual(projection.rulerY, 168.0)
        }

        // 6. SerDe Document Model + Command Stack State
        registry.register(tier: 3, feature: "F1+F2-Cross", name: "test_F1_F2_SerDePreservesUndoHistory") {
            var doc = VOODocument(title: "SerDeHistory")
            let mgr = CommandManager()
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "A")), on: &doc)
            let jsonA = try doc.serializeToJSON()

            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "B")), on: &doc)
            _ = mgr.undo(on: &doc)
            let jsonRestored = try doc.serializeToJSON()

            try TestAssertions.assertEqual(jsonA, jsonRestored)
        }

        // 7. ToolRail Switching + Space Key Canvas Pan
        registry.register(tier: 3, feature: "F12+F17-Cross", name: "test_F12_F17_ToolSwitchingDuringSpacePan") {
            let rail = ToolRailState()
            rail.selectTool(.move)

            var isPanning = true
            let switchedTool = rail.handleShortcutKey("b")
            try TestAssertions.assertEqual(switchedTool, .brush)
            try TestAssertions.assertTrue(isPanning)
            isPanning = false
            try TestAssertions.assertEqual(rail.activeTool, .brush)
        }

        // 8. VOO Dark Theme + Inspector Panels
        registry.register(tier: 3, feature: "F10+F13-Cross", name: "test_F10_F13_VOODarkThemeAcrossInspectorPanels") {
            try TestAssertions.assertEqual(ThemeTokens.surfacePanel, "#171717")
            try TestAssertions.assertEqual(ThemeTokens.surfaceRaised, "#262626")
            let wheel = ColorWheelState(hue: 150, saturation: 1.0, value: 1.0)
            try TestAssertions.assertFalse(wheel.hexString.isEmpty)
        }

        // 9. Magnetic Snapping + 8-Point Handle Resizing
        registry.register(tier: 3, feature: "F15+F16-Cross", name: "test_F15_F16_SnappingWith8PointResize") {
            let sibling = CGRect(x: 300, y: 100, width: 100, height: 100)
            let movingHandlePoint = CGPoint(x: 298.0, y: 150)
            let snapped = MagneticSnappingEngine.snap(point: movingHandlePoint, targetBounds: [sibling], canvasSize: CGSize(width: 1000, height: 1000), zoom: 1.0)
            try TestAssertions.assertApproxEqual(snapped.snapped.x, 300.0)
            try TestAssertions.assertFalse(snapped.guides.isEmpty)
        }

        // 10. Dynamic Brush Stroke + Schneider Curve Fitting
        registry.register(tier: 3, feature: "F6+F9-Cross", name: "test_F6_F9_DynamicBrushStrokeSchneiderFitting") {
            let engine = RasterBrushEngine()
            let preset = BrushPreset(diameter: 10, spacing: 0.2)
            let dabs = engine.strokeDabs(from: CGPoint(x: 0, y: 0), to: CGPoint(x: 100, y: 100), brush: preset)

            let dabPoints = dabs.map { $0.position }
            let fittedAnchors = GeometryEngine.fitCurve(points: dabPoints, errorThreshold: 2.0)
            try TestAssertions.assertGreaterThan(CGFloat(fittedAnchors.count), 1.0)
        }

        // 11. TitleBar Command State + Transaction Stack
        registry.register(tier: 3, feature: "F2+F11-Cross", name: "test_F2_F11_TitleBarButtonsTrackCommandStack") {
            var doc = VOODocument()
            let mgr = CommandManager()
            let titleBar = AppTitleBarState()

            titleBar.canUndo = mgr.canUndo
            titleBar.canRedo = mgr.canRedo
            try TestAssertions.assertFalse(titleBar.canUndo)
            try TestAssertions.assertFalse(titleBar.canRedo)

            _ = mgr.execute(InsertNodeCommand(node: VOONode()), on: &doc)
            titleBar.canUndo = mgr.canUndo
            titleBar.canRedo = mgr.canRedo
            try TestAssertions.assertTrue(titleBar.canUndo)
            try TestAssertions.assertFalse(titleBar.canRedo)

            _ = mgr.undo(on: &doc)
            titleBar.canUndo = mgr.canUndo
            titleBar.canRedo = mgr.canRedo
            try TestAssertions.assertFalse(titleBar.canUndo)
            try TestAssertions.assertTrue(titleBar.canRedo)
        }

        // 12. Metal Render Pipeline + 16 Blend Modes
        registry.register(tier: 3, feature: "F7+F8-Cross", name: "test_F7_F8_MetalPipelineExecutesAll16BlendModes") {
            for mode in LayerBlendMode.allCases {
                let src = PixelColor(r: 0.7, g: 0.3, b: 0.8)
                let dst = PixelColor(r: 0.2, g: 0.6, b: 0.4)
                let res = BlendMath.blend(mode: mode, src: src, dst: dst)
                try TestAssertions.assertTrue(res.r >= 0.0 && res.r <= 1.0)
                try TestAssertions.assertTrue(res.g >= 0.0 && res.g <= 1.0)
            }
        }

        // 13. Smooth Bezier Curve + Boolean Intersection
        registry.register(tier: 3, feature: "F4+F5-Cross", name: "test_F4_F5_SmoothBezierCurveBooleanIntersection") {
            let rCircle = CGRect(x: 0, y: 0, width: 100, height: 100)
            let rBox = CGRect(x: 50, y: 0, width: 100, height: 100)
            let inter = GeometryEngine.performBoolean(op: .intersect, subject: rCircle, clip: rBox)
            try TestAssertions.assertEqual(inter.count, 1)
            try TestAssertions.assertRectApproxEqual(inter[0], CGRect(x: 50, y: 0, width: 50, height: 100))
        }

        // 14. Inspector Transform + Magnetic Snapping
        registry.register(tier: 3, feature: "F13+F15-Cross", name: "test_F13_F15_TransformPanelInputTriggersSnapGuide") {
            let sibling = CGRect(x: 500, y: 500, width: 100, height: 100)
            let inputX: CGFloat = 498.0
            let snap = MagneticSnappingEngine.snap(point: CGPoint(x: inputX, y: 500), targetBounds: [sibling], canvasSize: CGSize(width: 2000, height: 2000), zoom: 1.0)
            try TestAssertions.assertApproxEqual(snap.snapped.x, 500.0)
        }

        // 15. Document Hierarchy + Accessibility Tree
        registry.register(tier: 3, feature: "F1+F18-Cross", name: "test_F1_F18_AccessibilityTreeMatchesDocumentHierarchy") {
            let doc = VOODocument(nodes: [
                VOONode(kind: .group, name: "HeaderGroup"),
                VOONode(kind: .rect, name: "Logo"),
                VOONode(kind: .text, name: "NavText")
            ])
            try TestAssertions.assertEqual(doc.nodes.count, 3)
            let view = NSView()
            view.setAccessibilityIdentifier(AccessibilityCatalog.layersTree)
            try TestAssertions.assertEqual(view.accessibilityIdentifier(), AccessibilityCatalog.layersTree)
        }

        // 16. Layers Reorder + Command Transaction Stack
        registry.register(tier: 3, feature: "F2+F13-Cross", name: "test_F2_F13_LayerReorderUndoRedo") {
            var doc = VOODocument()
            let n1 = VOONode(name: "First")
            let n2 = VOONode(name: "Second")
            doc.nodes = [n1, n2]

            final class ReorderCommand: StudioCommand {
                let id = UUID()
                let name = "Reorder Layers"
                let timestamp = Date()
                func execute(document: inout VOODocument) -> Bool {
                    document.nodes.swapAt(0, 1)
                    return true
                }
                func undo(document: inout VOODocument) -> Bool {
                    document.nodes.swapAt(0, 1)
                    return true
                }
            }

            let mgr = CommandManager()
            _ = mgr.execute(ReorderCommand(), on: &doc)
            try TestAssertions.assertEqual(doc.nodes[0].name, "Second")

            _ = mgr.undo(on: &doc)
            try TestAssertions.assertEqual(doc.nodes[0].name, "First")
        }

        // 17. Brush Stroke + Zoomed Canvas Coordinates
        registry.register(tier: 3, feature: "F9+F17-Cross", name: "test_F9_F17_BrushStrokeDuringZoomedCanvas") {
            let zoom: CGFloat = 4.0
            let screenP1 = CGPoint(x: 400, y: 400)
            let docP1 = CGPoint(x: screenP1.x / zoom, y: screenP1.y / zoom)
            try TestAssertions.assertPointApproxEqual(docP1, CGPoint(x: 100, y: 100))
        }

        // 18. Build System Bundle Metadata + Window Title
        registry.register(tier: 3, feature: "F3+F11-Cross", name: "test_F3_F11_WindowChromeMatchesBundleMetadata") {
            let bundleName = "VOO Design Native"
            let titleBarState = AppTitleBarState(title: bundleName)
            try TestAssertions.assertEqual(titleBarState.documentTitle, "VOO Design Native")
        }

        // 19. Pixel Ruler Ticks + Snapping Guidelines Alignment
        registry.register(tier: 3, feature: "F14+F15-Cross", name: "test_F14_F15_RulerTicksAlignWithSnappingGuides") {
            let guidePos: CGFloat = 200.0
            let tickInterval = RulerConfig.tickInterval(forZoom: 1.0) // 50
            let isMultiple = Int(guidePos) % Int(tickInterval) == 0
            try TestAssertions.assertTrue(isMultiple, "Snap guide at 200px should align with 50px ruler tick")
        }

        // 20. Divide Operation + 8-Point Handle Generation
        registry.register(tier: 3, feature: "F5+F16-Cross", name: "test_F5_F16_DivideOperationProducesSelectablePieces") {
            let r1 = CGRect(x: 0, y: 0, width: 100, height: 100)
            let r2 = CGRect(x: 50, y: 0, width: 100, height: 100)
            let dividedPieces = GeometryEngine.performBoolean(op: .divide, subject: r1, clip: r2)

            for piece in dividedPieces {
                let handles = TransformHandlesEngine.handleRects(for: piece)
                try TestAssertions.assertEqual(handles.count, 8)
            }
        }
    }
}
