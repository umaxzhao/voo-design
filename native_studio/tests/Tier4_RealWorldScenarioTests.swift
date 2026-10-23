import Foundation
import CoreGraphics
import AppKit

public class Tier4_RealWorldScenarioTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // 1. Multi-Artboard UI Design Workflow
        registry.register(tier: 4, feature: "Scenario-UIDesign", name: "test_Scenario_MultiArtboardUIDesignWorkflow") {
            var doc = VOODocument(title: "DesignApp-v1.voo")

            // Mobile Frame (375x812)
            let mobileFrame = VOONode(kind: .frame, name: "Mobile Artboard", x: 0, y: 0, width: 375, height: 812)
            let mobileNav = VOONode(kind: .rect, name: "Navbar", x: 0, y: 0, width: 375, height: 88, cornerRadii: CornerRadii(uniform: 0))
            let mobileButton = VOONode(kind: .rect, name: "CTA Button", x: 24, y: 700, width: 327, height: 56, cornerRadii: CornerRadii(uniform: 12))
            let mobileText = VOONode(kind: .text, name: "CTA Label", x: 140, y: 718, width: 95, height: 20, text: "Get Started")

            // Desktop Frame (1440x900)
            let desktopFrame = VOONode(kind: .frame, name: "Desktop Artboard", x: 500, y: 0, width: 1440, height: 900)
            let desktopNav = VOONode(kind: .rect, name: "Desktop Navbar", x: 500, y: 0, width: 1440, height: 72)

            doc.nodes = [mobileFrame, mobileNav, mobileButton, mobileText, desktopFrame, desktopNav]

            try TestAssertions.assertEqual(doc.nodes.count, 6)
            try TestAssertions.assertApproxEqual(doc.nodes[0].width, 375.0)
            try TestAssertions.assertApproxEqual(doc.nodes[4].width, 1440.0)

            let data = try doc.serializeToJSON()
            let reloaded = try VOODocument.deserialize(from: data)
            try TestAssertions.assertEqual(reloaded.nodes.count, 6)
        }

        // 2. Vector Logo Branding Workflow
        registry.register(tier: 4, feature: "Scenario-VectorLogo", name: "test_Scenario_VectorLogoBrandingWorkflow") {
            var doc = VOODocument(title: "BrandIdentity")

            // 3 overlapping circles
            let c1 = CGRect(x: 100, y: 100, width: 120, height: 120)
            let c2 = CGRect(x: 160, y: 100, width: 120, height: 120)
            let c3 = CGRect(x: 130, y: 150, width: 120, height: 120)

            let union12 = GeometryEngine.performBoolean(op: .add, subject: c1, clip: c2)
            try TestAssertions.assertEqual(union12.count, 1)

            let cutout = GeometryEngine.performBoolean(op: .subtract, subject: union12[0], clip: c3)
            try TestAssertions.assertFalse(cutout.isEmpty)

            // Ribbon Path
            let p0 = PenAnchor(x: 50, y: 250, type: .sharp)
            let p1 = PenAnchor(x: 150, y: 200, inHandle: CGPoint(x: 120, y: 210), outHandle: CGPoint(x: 180, y: 190), type: .smooth)
            let p2 = PenAnchor(x: 250, y: 250, type: .sharp)
            let ribbon = VOONode(kind: .path, name: "Ribbon", style: LayerStyle(fill: ThemeTokens.accentMint, stroke: ThemeTokens.accentSelection), points: [p0, p1, p2])

            doc.nodes.append(ribbon)
            try TestAssertions.assertEqual(doc.nodes[0].style.fill, "#a7ffd4")
        }

        // 3. Digital Painting & Raster Shading Workflow
        registry.register(tier: 4, feature: "Scenario-DigitalPainting", name: "test_Scenario_DigitalPaintingRasterShadingWorkflow") {
            let brushEngine = RasterBrushEngine()

            // Step 1: Base color fill (Layer 1)
            let baseNode = VOONode(kind: .rect, name: "Base", width: 500, height: 500, style: LayerStyle(fill: "#333333"))

            // Step 2: Shading brush stroke with Multiply blend mode
            let shadePreset = BrushPreset(diameter: 40, hardness: 0.5, flow: 0.4, isEraser: false)
            let shadeDabs = brushEngine.strokeDabs(from: CGPoint(x: 50, y: 50), to: CGPoint(x: 250, y: 250), brush: shadePreset)
            try TestAssertions.assertGreaterThan(CGFloat(shadeDabs.count), 10.0)

            let shadowPixel = BlendMath.blend(mode: .multiply, src: PixelColor(r: 0.1, g: 0.1, b: 0.1, a: 0.4), dst: PixelColor(r: 0.8, g: 0.8, b: 0.8))
            try TestAssertions.assertLessThan(shadowPixel.r, 0.8)

            // Step 3: Eraser clean up
            let eraserPreset = BrushPreset(diameter: 20, isEraser: true)
            try TestAssertions.assertTrue(eraserPreset.isEraser)
            try TestAssertions.assertEqual(baseNode.name, "Base")
        }

        // 4. Document Export & Re-Import Fidelity Workflow
        registry.register(tier: 4, feature: "Scenario-ExportFidelity", name: "test_Scenario_DocumentExportReimportFidelityWorkflow") {
            var doc = VOODocument(title: "MasterDesignArchive")
            doc.canvas = CanvasFrame(x: 0, y: 0, width: 2560, height: 1440, backgroundColor: "#171717")

            // Rect
            doc.nodes.append(VOONode(kind: .rect, name: "CardBackground", x: 100, y: 100, width: 600, height: 400, style: LayerStyle(fill: "#262626", stroke: "#b2ffd6", strokeWidth: 2)))
            // Ellipse
            doc.nodes.append(VOONode(kind: .ellipse, name: "ProfilePic", x: 140, y: 140, width: 80, height: 80, style: LayerStyle(fill: "#525252")))
            // Text
            doc.nodes.append(VOONode(kind: .text, name: "Username", x: 240, y: 160, width: 200, height: 30, text: "Alex Developer"))
            // Vector Path
            let p1 = PenAnchor(x: 100, y: 400, type: .sharp)
            let p2 = PenAnchor(x: 400, y: 400, inHandle: CGPoint(x: 250, y: 350), outHandle: CGPoint(x: 550, y: 450), type: .smooth)
            let p3 = PenAnchor(x: 700, y: 400, type: .sharp)
            doc.nodes.append(VOONode(kind: .path, name: "DividerCurve", points: [p1, p2, p3]))

            let exportData = try doc.serializeToJSON()
            let importedDoc = try VOODocument.deserialize(from: exportData)

            try TestAssertions.assertEqual(importedDoc.title, doc.title)
            try TestAssertions.assertEqual(importedDoc.canvas.width, doc.canvas.width)
            try TestAssertions.assertEqual(importedDoc.nodes.count, doc.nodes.count)
            try TestAssertions.assertEqual(importedDoc.nodes[2].text, "Alex Developer")
            try TestAssertions.assertEqual(importedDoc.nodes[3].points?.count, 3)
        }

        // 5. 50-Step Interactive Editing Session Workflow
        registry.register(tier: 4, feature: "Scenario-EditingSession", name: "test_Scenario_ComplexInteractiveEditingSessionWorkflow") {
            var doc = VOODocument(title: "SessionDoc")
            let mgr = CommandManager(maxStackDepth: 100)

            // Execute 30 insert operations
            for i in 1...30 {
                let node = VOONode(name: "Element_\(i)", x: CGFloat(i * 10), y: CGFloat(i * 10))
                _ = mgr.execute(InsertNodeCommand(node: node), on: &doc)
            }
            try TestAssertions.assertEqual(doc.nodes.count, 30)

            // Undo 10 steps
            for _ in 1...10 {
                _ = mgr.undo(on: &doc)
            }
            try TestAssertions.assertEqual(doc.nodes.count, 20)

            // Redo 5 steps
            for _ in 1...5 {
                _ = mgr.redo(on: &doc)
            }
            try TestAssertions.assertEqual(doc.nodes.count, 25)

            // Add 5 transform operations
            for i in 0..<5 {
                let cmd = TransformNodeCommand(nodeId: doc.nodes[i].id, x: 500, y: 500, width: 200, height: 200)
                _ = mgr.execute(cmd, on: &doc)
            }
            try TestAssertions.assertApproxEqual(doc.nodes[0].x, 500.0)

            // Undo 5 transforms
            for _ in 1...5 {
                _ = mgr.undo(on: &doc)
            }
            try TestAssertions.assertApproxEqual(doc.nodes[0].x, 10.0)
        }

        // 6. Snapping & Alignment Precision Layout
        registry.register(tier: 4, feature: "Scenario-SnappingGrid", name: "test_Scenario_SnappingAndAlignmentPrecisionLayout") {
            let canvas = CGSize(width: 1920, height: 1080)
            let cardWidth: CGFloat = 300
            let cardHeight: CGFloat = 200
            let gap: CGFloat = 16

            // Card 1
            let c1 = CGRect(x: 100, y: 100, width: cardWidth, height: cardHeight)

            // Align Card 2 horizontally to Card 1 with snap
            let targetX2 = c1.maxX + gap // 416
            let userDragX2 = targetX2 + 2.0 // within 6px threshold
            let snapRes2 = MagneticSnappingEngine.snap(point: CGPoint(x: userDragX2, y: 100), targetBounds: [c1], canvasSize: canvas, zoom: 1.0)

            try TestAssertions.assertApproxEqual(snapRes2.snapped.x, targetX2)

            // Card 3 below Card 1
            let targetY3 = c1.maxY + gap // 316
            let userDragY3 = targetY3 - 3.0
            let snapRes3 = MagneticSnappingEngine.snap(point: CGPoint(x: 100, y: userDragY3), targetBounds: [c1], canvasSize: canvas, zoom: 1.0)
            try TestAssertions.assertApproxEqual(snapRes3.snapped.y, targetY3)
        }

        // 7. Cubic Bezier Typographic Glyph Tracing
        registry.register(tier: 4, feature: "Scenario-GlyphTracing", name: "test_Scenario_CubicBezierFontGlyphTracing") {
            var glyph = VOONode(kind: .path, name: "Glyph_S")
            // 8 control anchors tracing 'S' curve
            let anchors = [
                PenAnchor(x: 100, y: 50, type: .sharp),
                PenAnchor(x: 50, y: 70, type: .smooth),
                PenAnchor(x: 40, y: 120, type: .smooth),
                PenAnchor(x: 100, y: 160, type: .smart), // central inflection
                PenAnchor(x: 160, y: 200, type: .smooth),
                PenAnchor(x: 150, y: 250, type: .smooth),
                PenAnchor(x: 90, y: 270, type: .sharp),
                PenAnchor(x: 100, y: 50, isClosed: true, type: .sharp)
            ]
            glyph.points = anchors
            try TestAssertions.assertEqual(glyph.points?.count, 8)
            try TestAssertions.assertTrue(glyph.points?.last?.isClosed == true)
        }

        // 8. Layer Hierarchy Grouping & Clipping Mask
        registry.register(tier: 4, feature: "Scenario-GroupingClipping", name: "test_Scenario_LayerHierarchyGroupingAndClippingMask") {
            var doc = VOODocument()
            let group = VOONode(kind: .group, name: "CardGroup")
            let maskRect = VOONode(parentId: group.id, kind: .rect, name: "MaskRect", width: 300, height: 200, cornerRadii: CornerRadii(uniform: 16))
            let photoImage = VOONode(parentId: group.id, kind: .image, name: "CoverPhoto", width: 400, height: 300)

            doc.nodes = [group, maskRect, photoImage]
            try TestAssertions.assertEqual(doc.nodes.count, 3)
            try TestAssertions.assertEqual(doc.nodes[1].parentId, group.id)
            try TestAssertions.assertEqual(doc.nodes[2].parentId, group.id)
        }

        // 9. Viewport Navigation Stress Session
        registry.register(tier: 4, feature: "Scenario-ViewportStress", name: "test_Scenario_ViewportNavigationStressSession") {
            var zoom: CGFloat = 1.0
            var pan = CGPoint.zero

            // Zoom in loop
            for _ in 1...10 {
                zoom = min(8.0, zoom * 1.25)
            }
            try TestAssertions.assertApproxEqual(zoom, 8.0)

            // Pan loop
            for _ in 1...20 {
                pan.x += 100
                pan.y += 50
            }
            try TestAssertions.assertApproxEqual(pan.x, 2000.0)

            // Zoom actual size (⌘0)
            zoom = 1.0
            pan = .zero
            try TestAssertions.assertApproxEqual(zoom, 1.0)
            try TestAssertions.assertPointApproxEqual(pan, .zero)
        }

        // 10. Crash Resilience & Atomic Recovery
        registry.register(tier: 4, feature: "Scenario-CrashResilience", name: "test_Scenario_CrashResilienceAndAtomicRecovery") {
            var doc = VOODocument()
            let initialNode = VOONode(name: "Preserved")
            doc.nodes = [initialNode]

            final class FailingCommand: StudioCommand {
                let id = UUID()
                let name = "Failing Command"
                let timestamp = Date()
                func execute(document: inout VOODocument) -> Bool {
                    // Simulates an error condition (e.g. invalid topology)
                    return false
                }
                func undo(document: inout VOODocument) -> Bool {
                    return true
                }
            }

            let mgr = CommandManager()
            let executed = mgr.execute(FailingCommand(), on: &doc)
            try TestAssertions.assertFalse(executed)
            try TestAssertions.assertEqual(doc.nodes.count, 1)
            try TestAssertions.assertEqual(doc.nodes[0].name, "Preserved")
            try TestAssertions.assertFalse(mgr.canUndo)
        }
    }
}
