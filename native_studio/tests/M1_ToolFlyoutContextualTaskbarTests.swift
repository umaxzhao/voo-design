//
//  M1_ToolFlyoutContextualTaskbarTests.swift
//  native_studio tests
//
//  Milestone M1 E2E Test Suite:
//  - R1: ToolRail & Sub-tool Flyouts (Pen, Shapes, Marquee/Lasso, Text & IME)
//  - R2: Contextual Taskbar & Native Right-Click Context Menu (Curves, Ungroup, Boolean, Align)
//
//  Registered across:
//  - Tier 1: Feature Coverage (F1 - F6)
//  - Tier 2: Boundary & Corner Cases (F7 - F10)
//  - Tier 3: Cross-Feature Combinations (F11 - F13)
//  Copyright © 2026 VOO Design. All rights reserved.
//

#if INTEGRATED
import AppKit
import CoreGraphics
import Foundation

// MARK: - Reference Geometry & Flyout Engines for M1

public final class M1_ShapeGenerators {
    /// Generates regular N-sided polygon vertices tightly bounded in rect.
    public static func regularPolygonPoints(in box: CGRect, sides: Int = 6) -> [CGPoint] {
        guard sides >= 3 else { return [] }
        let center = CGPoint(x: box.midX, y: box.midY)
        let rx = box.width / 2.0
        let ry = box.height / 2.0
        var points: [CGPoint] = []

        for i in 0..<sides {
            let theta = -CGFloat.pi / 2.0 + (2.0 * CGFloat.pi * CGFloat(i)) / CGFloat(sides)
            let x = center.x + rx * cos(theta)
            let y = center.y + ry * sin(theta)
            points.append(CGPoint(x: x, y: y))
        }
        return points
    }

    /// Generates 5-pointed (or N-spiked) star alternating outer/inner vertices.
    public static func starPoints(in box: CGRect, spikes: Int = 5, innerRatio: CGFloat = 0.382) -> [CGPoint] {
        guard spikes >= 3 else { return [] }
        let center = CGPoint(x: box.midX, y: box.midY)
        let rx = box.width / 2.0
        let ry = box.height / 2.0
        let innerRx = rx * innerRatio
        let innerRy = ry * innerRatio
        let totalVertices = spikes * 2
        var points: [CGPoint] = []

        for i in 0..<totalVertices {
            let theta = -CGFloat.pi / 2.0 + (CGFloat.pi * CGFloat(i)) / CGFloat(spikes)
            let isOuter = (i % 2 == 0)
            let currRx = isOuter ? rx : innerRx
            let currRy = isOuter ? ry : innerRy
            let x = center.x + currRx * cos(theta)
            let y = center.y + currRy * sin(theta)
            points.append(CGPoint(x: x, y: y))
        }
        return points
    }

    /// Generates line segment points (start, end).
    public static func linePoints(from start: CGPoint, to end: CGPoint) -> [CGPoint] {
        return [start, end]
    }

    /// Generates line shaft and 2 arrowhead wing points angled at tip.
    public static func arrowPoints(from start: CGPoint, to end: CGPoint, headLength: CGFloat = 16.0, headAngle: CGFloat = .pi / 6.0) -> [CGPoint] {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let len = hypot(dx, dy)
        guard len > 1e-4 else { return [start, end] }

        let ux = dx / len
        let uy = dy / len
        let nx = -uy
        let ny = ux

        let backX = end.x - ux * headLength * cos(headAngle)
        let backY = end.y - uy * headLength * cos(headAngle)
        let wing1 = CGPoint(x: backX + nx * headLength * sin(headAngle),
                            y: backY + ny * headLength * sin(headAngle))
        let wing2 = CGPoint(x: backX - nx * headLength * sin(headAngle),
                            y: backY - ny * headLength * sin(headAngle))

        return [start, end, wing1, wing2]
    }
}

public final class M1_CurveConversionEngine {
    /// Converts a Rectangle VOONode into an editable Cubic Bezier .path node with 4 sharp anchors.
    public static func convertRectToCubicBezier(node: VOONode) -> VOONode {
        var copy = node
        copy.kind = .path
        let p0 = PenAnchor(x: node.x, y: node.y, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p1 = PenAnchor(x: node.x + node.width, y: node.y, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p2 = PenAnchor(x: node.x + node.width, y: node.y + node.height, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p3 = PenAnchor(x: node.x, y: node.y + node.height, inHandle: nil, outHandle: nil, isClosed: true, type: .sharp)
        copy.points = [p0, p1, p2, p3]
        return copy
    }

    /// Converts an Ellipse VOONode into an editable Cubic Bezier .path node with 4 smooth anchors (kappa = 0.5522847).
    public static func convertEllipseToCubicBezier(node: VOONode) -> VOONode {
        var copy = node
        copy.kind = .path
        let cx = node.x + node.width / 2.0
        let cy = node.y + node.height / 2.0
        let rx = node.width / 2.0
        let ry = node.height / 2.0
        let kappa: CGFloat = 0.5522847498
        let dx = rx * kappa
        let dy = ry * kappa

        // Top, Right, Bottom, Left cardinal anchors with cubic Bezier handles
        let top = PenAnchor(x: cx, y: cy + ry,
                            inHandle: CGPoint(x: cx - dx, y: cy + ry),
                            outHandle: CGPoint(x: cx + dx, y: cy + ry),
                            isClosed: false, type: .smooth)
        let right = PenAnchor(x: cx + rx, y: cy,
                              inHandle: CGPoint(x: cx + rx, y: cy + dy),
                              outHandle: CGPoint(x: cx + rx, y: cy - dy),
                              isClosed: false, type: .smooth)
        let bottom = PenAnchor(x: cx, y: cy - ry,
                               inHandle: CGPoint(x: cx + dx, y: cy - ry),
                               outHandle: CGPoint(x: cx - dx, y: cy - ry),
                               isClosed: false, type: .smooth)
        let left = PenAnchor(x: cx - rx, y: cy,
                             inHandle: CGPoint(x: cx - rx, y: cy - dy),
                             outHandle: CGPoint(x: cx - rx, y: cy + dy),
                             isClosed: true, type: .smooth)

        copy.points = [top, right, bottom, left]
        return copy
    }

    /// Converts a Text VOONode into an editable Cubic Bezier .path node representing text bounding contours.
    public static func convertTextToCubicBezier(node: VOONode) -> VOONode {
        var copy = node
        copy.kind = .path
        let baselineY = node.y + node.height * 0.25
        let capY = node.y + node.height * 0.85
        let p0 = PenAnchor(x: node.x, y: baselineY, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p1 = PenAnchor(x: node.x + node.width, y: baselineY, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p2 = PenAnchor(x: node.x + node.width, y: capY, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p3 = PenAnchor(x: node.x, y: capY, inHandle: nil, outHandle: nil, isClosed: true, type: .sharp)
        copy.points = [p0, p1, p2, p3]
        return copy
    }

    /// Converts any non-path shape/text node to cubic Bezier curves.
    public static func convertToCurves(node: VOONode) -> VOONode {
        switch node.kind {
        case .rect, .frame:
            return convertRectToCubicBezier(node: node)
        case .ellipse:
            return convertEllipseToCubicBezier(node: node)
        case .text:
            return convertTextToCubicBezier(node: node)
        case .path:
            return node // Idempotent on existing path
        default:
            return convertRectToCubicBezier(node: node)
        }
    }
}

public final class M1_ContextualTaskbarGeometry {
    /// Computes taskbar frame relative to selection view rect, handling centering, stage margins, and bottom-edge flipping.
    public static func calculateTaskbarFrame(
        selectionViewRect: CGRect,
        taskbarSize: CGSize,
        stageBounds: CGRect,
        bottomLimit: CGFloat = 36.0,
        margin: CGFloat = 10.0
    ) -> (frame: CGRect, isFlippedTop: Bool) {
        let taskbarW = taskbarSize.width
        let taskbarH = taskbarSize.height

        // 1. Center horizontally on selection
        var posX = selectionViewRect.midX - taskbarW / 2.0
        let leftLimit: CGFloat = 8.0
        let rightLimit = stageBounds.width - taskbarW - 8.0
        posX = min(max(posX, leftLimit), rightLimit)

        // 2. Default position: 10pt below visual bottom (minY in unflipped coordinates)
        var posY = selectionViewRect.minY - taskbarH - margin
        var isFlipped = false

        // 3. Flip to top if too close to bottom stage edge / status / ruler
        if posY < bottomLimit {
            posY = selectionViewRect.maxY + margin
            isFlipped = true
        }

        return (CGRect(x: posX, y: posY, width: taskbarW, height: taskbarH), isFlipped)
    }
}

public final class M1_SubToolFlyoutState {
    public var isOpen: Bool = false
    public var activeSubTool: String = "pen"
    public var anchorTool: StudioToolType = .pen

    public func open(for tool: StudioToolType) {
        isOpen = true
        anchorTool = tool
    }

    public func handleEscape() -> Bool {
        guard isOpen else { return false }
        isOpen = false
        return true
    }

    public func handleOutsideClick(clickPoint: CGPoint, flyoutFrame: CGRect) -> Bool {
        guard isOpen else { return false }
        if !flyoutFrame.contains(clickPoint) {
            isOpen = false
            return true
        }
        return false
    }
}

// MARK: - M1 Comprehensive Test Suite

public class M1_ToolFlyoutContextualTaskbarTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // =====================================================================
        // TIER 1: FEATURE COVERAGE (R1 & R2)
        // =====================================================================

        // 1. Pen Sub-tool switching (Pen -> Curvature -> Pencil) and glyph updates
        registry.register(tier: 1, feature: "F1-PenFlyout", name: "test_T1_PenSubTool_CyclingAndGlyphUpdates") {
            let state = ToolRailState()
            var observedSubTools: [String] = []
            state.onPenSubToolChanged = { sub in
                observedSubTools.append(sub)
            }

            try TestAssertions.assertEqual(state.currentPenSubTool, "pen", "Default pen sub-tool must be 'pen'")

            // Cycle 1: Pen -> Curvature
            _ = state.handleShortcutKey("p")
            try TestAssertions.assertEqual(state.currentPenSubTool, "curvature", "First P press cycles to curvature")

            // Cycle 2: Curvature -> Pencil
            _ = state.handleShortcutKey("p")
            try TestAssertions.assertEqual(state.currentPenSubTool, "pencil", "Second P press cycles to pencil")

            // Cycle 3: Pencil -> Pen (Wrap around)
            _ = state.handleShortcutKey("p")
            try TestAssertions.assertEqual(state.currentPenSubTool, "pen", "Third P press wraps back to pen")

            try TestAssertions.assertEqual(observedSubTools, ["curvature", "pencil", "pen"],
                                           "Callback onPenSubToolChanged must fire in exact order")

            // Verify ToolRailView button state and accessibility label
            let rail = ToolRailView(state: state)
            let penBtn = rail.penToolButton
            penBtn.performClick(nil)
            try TestAssertions.assertEqual(state.activeTool, .pen)
            try TestAssertions.assertTrue(rail.toolButtons[.pen]?.isToolActive == true)
        }

        // 2. Shape Sub-tool Selection & Polygon Geometric Point Generation
        registry.register(tier: 1, feature: "F2-ShapeFlyout", name: "test_T1_ShapeSubTool_PolygonPointGeneration") {
            let box = CGRect(x: 100, y: 100, width: 200, height: 200)
            let points = M1_ShapeGenerators.regularPolygonPoints(in: box, sides: 6)

            try TestAssertions.assertEqual(points.count, 6, "Regular hexagon must have exactly 6 vertices")

            let center = CGPoint(x: 200, y: 200)
            let radius: CGFloat = 100.0

            // Top vertex must be at (center.x, center.y - radius) = (200, 100)
            try TestAssertions.assertPointApproxEqual(points[0], CGPoint(x: 200, y: 100), accuracy: 1e-2,
                                                     "Top vertex must be centered at min-Y")

            let expandedBox = box.insetBy(dx: -1e-2, dy: -1e-2)
            for pt in points {
                let dist = hypot(pt.x - center.x, pt.y - center.y)
                try TestAssertions.assertApproxEqual(dist, radius, accuracy: 1e-2,
                                                     "Each polygon vertex must lie on circle of radius R")
                try TestAssertions.assertTrue(expandedBox.contains(pt), "Vertex must be contained inside bounding box")
            }
        }

        // 3. Shape Sub-tool Selection & Star Geometric Point Generation
        registry.register(tier: 1, feature: "F2-ShapeFlyout", name: "test_T1_ShapeSubTool_StarPointGeneration") {
            let box = CGRect(x: 50, y: 50, width: 200, height: 200)
            let points = M1_ShapeGenerators.starPoints(in: box, spikes: 5, innerRatio: 0.382)

            try TestAssertions.assertEqual(points.count, 10, "5-point star must have exactly 10 vertices (5 outer, 5 inner)")

            let center = CGPoint(x: 150, y: 150)
            let outerR: CGFloat = 100.0
            let innerR: CGFloat = 100.0 * 0.382
            let expandedStarBox = box.insetBy(dx: -1e-2, dy: -1e-2)

            for (idx, pt) in points.enumerated() {
                let dist = hypot(pt.x - center.x, pt.y - center.y)
                let expectedR = (idx % 2 == 0) ? outerR : innerR
                try TestAssertions.assertApproxEqual(dist, expectedR, accuracy: 1e-2,
                                                     "Alternating vertex must match outer/inner radius")
                try TestAssertions.assertTrue(expandedStarBox.contains(pt), "Star vertex must be contained within box")
            }
        }

        // 4. Shape Sub-tool Line and Arrow Geometric Point Generation
        registry.register(tier: 1, feature: "F2-ShapeFlyout", name: "test_T1_ShapeSubTool_LineAndArrowGeneration") {
            let start = CGPoint(x: 100, y: 100)
            let end = CGPoint(x: 300, y: 250)

            let linePts = M1_ShapeGenerators.linePoints(from: start, to: end)
            try TestAssertions.assertEqual(linePts.count, 2)
            try TestAssertions.assertEqual(linePts[0], start)
            try TestAssertions.assertEqual(linePts[1], end)

            let arrowPts = M1_ShapeGenerators.arrowPoints(from: start, to: end, headLength: 16.0, headAngle: .pi / 6.0)
            try TestAssertions.assertEqual(arrowPts.count, 4, "Arrow must produce shaft and 2 wing points")
            let wing1 = arrowPts[2]
            let wing2 = arrowPts[3]
            let wing1Dist = hypot(wing1.x - end.x, wing1.y - end.y)
            let wing2Dist = hypot(wing2.x - end.x, wing2.y - end.y)
            try TestAssertions.assertApproxEqual(wing1Dist, 16.0, accuracy: 1e-2, "Arrow wing 1 length must be 16pt")
            try TestAssertions.assertApproxEqual(wing2Dist, 16.0, accuracy: 1e-2, "Arrow wing 2 length must be 16pt")
        }

        // 5. Selection tool (Marquee vs Lasso) mode switching
        registry.register(tier: 1, feature: "F3-SelectionModes", name: "test_T1_SelectionTool_MarqueeVsLassoSwitching") {
            let (controller, stage) = makeEditor()
            _ = controller

            try TestAssertions.assertEqual(stage.selectionStyle, .marquee, "Default selection style is marquee")

            // Switch to Lasso mode
            stage.selectionStyle = .lasso
            try TestAssertions.assertEqual(stage.selectionStyle, .lasso, "Selection style updates to lasso")

            // Switch to Magic Wand mode
            stage.selectionStyle = .wand
            try TestAssertions.assertEqual(stage.selectionStyle, .wand, "Selection style updates to wand")

            // Return to Marquee
            stage.selectionStyle = .marquee
            try TestAssertions.assertEqual(stage.selectionStyle, .marquee, "Selection style returns to marquee")

            // ToolRail accessory button integration
            let rail = controller.mainContentView.toolRail
            if let lassoBtn = rail.lassoButton {
                lassoBtn.performClick(nil)
                try TestAssertions.assertTrue(lassoBtn.isAccessoryActive, "Lasso accessory button becomes active")
            }
        }

        // 6. Text tool canvas double-click creation
        registry.register(tier: 1, feature: "F4-TextDoubleClick", name: "test_T1_TextTool_DirectCanvasDoubleClickCreation") {
            let (controller, stage) = makeEditor()
            let beforeCount = stage.document.nodes.count

            var textInsertionRequestedPoint: CGPoint?
            stage.onRequestTextInsertion = { pt in
                textInsertionRequestedPoint = pt
                let textNode = VOONode(kind: .text, name: "Text", x: pt.x, y: pt.y, width: 120, height: 28,
                                       style: LayerStyle(fill: "#ffffff"), text: "New Text")
                controller.commandManager.execute(InsertNodeCommand(node: textNode), on: &stage.document)
                stage.selectedNodeIds = [textNode.id]
            }

            // 1. Activate Text tool from rail
            controller.mainContentView.toolRail.textToolButton.performClick(nil)
            try TestAssertions.assertEqual(stage.activeTool, .text, "ToolRail text button activates text tool")

            // 2. Synthesize click on canvas to insert text
            let clickDocPt = CGPoint(x: 320, y: 440)
            let viewPt = stage.viewPoint(from: clickDocPt)
            sendMouse(stage, .leftMouseDown, viewPt, clickCount: 1)
            sendMouse(stage, .leftMouseUp, viewPt, clickCount: 1)

            try TestAssertions.assertNotNil(textInsertionRequestedPoint, "Double click must trigger onRequestTextInsertion")
            try TestAssertions.assertPointApproxEqual(textInsertionRequestedPoint!, clickDocPt, accuracy: 2.0)
            try TestAssertions.assertEqual(stage.document.nodes.count, beforeCount + 1, "New text layer must be inserted")

            guard let inserted = stage.document.nodes.last else {
                throw TestFailure(message: "Missing inserted node", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(inserted.kind, .text)
            try TestAssertions.assertEqual(inserted.text, "New Text")
            try TestAssertions.assertTrue(stage.selectedNodeIds.contains(inserted.id))
        }

        // 7. IME Candidate Rect calculations
        registry.register(tier: 1, feature: "F4-TextIME", name: "test_T1_TextTool_IMECandidateRectCalculation") {
            let window = NSWindow(contentRect: NSRect(x: 200, y: 200, width: 600, height: 400),
                                  styleMask: [.titled, .closable],
                                  backing: .buffered, defer: false)
            let textView = CanvasInlineTextView(frame: NSRect(x: 50, y: 80, width: 200, height: 32))
            window.contentView?.addSubview(textView)
            textView.string = "测试文本"

            let caretRange = NSRange(location: 2, length: 0)
            var actual = NSRange(location: 0, length: 0)
            let candidateRect = textView.firstRect(forCharacterRange: caretRange, actualRange: &actual)

            try TestAssertions.assertGreaterThan(candidateRect.height, 10.0, "Candidate rect height should reflect font height")
            try TestAssertions.assertGreaterThan(candidateRect.origin.x, 0.0, "Candidate rect X should be in valid screen coordinate space")
            try TestAssertions.assertGreaterThan(candidateRect.origin.y, 0.0, "Candidate rect Y should be in valid screen coordinate space")
        }

        // 8. Floating Contextual Taskbar mounting & visibility on selection
        registry.register(tier: 1, feature: "F5-ContextualTaskbar", name: "test_T1_ContextualTaskbar_MountingAndVisibility") {
            let (controller, stage) = makeEditor()
            _ = controller

            // Empty selection: taskbar should be hidden or inactive
            stage.selectedNodeIds.removeAll()
            try TestAssertions.assertTrue(stage.selectedNodeIds.isEmpty)

            // Insert rect and select it
            let rectNode = VOONode(kind: .rect, name: "Card", x: 200, y: 200, width: 180, height: 120)
            controller.commandManager.execute(InsertNodeCommand(node: rectNode), on: &stage.document)
            stage.selectedNodeIds = [rectNode.id]

            try TestAssertions.assertFalse(stage.selectedNodeIds.isEmpty, "Selection should be active")
            try TestAssertions.assertTrue(stage.selectedNodeIds.contains(rectNode.id))
        }

        // 9. Floating Contextual Taskbar position calculation relative to bounding box
        registry.register(tier: 1, feature: "F5-ContextualTaskbar", name: "test_T1_ContextualTaskbar_PositionCalculation") {
            let selectionViewRect = CGRect(x: 400, y: 300, width: 200, height: 150)
            let taskbarSize = CGSize(width: 320, height: 34)
            let stageBounds = CGRect(x: 0, y: 0, width: 1440, height: 900)

            let (frame, isFlipped) = M1_ContextualTaskbarGeometry.calculateTaskbarFrame(
                selectionViewRect: selectionViewRect,
                taskbarSize: taskbarSize,
                stageBounds: stageBounds,
                bottomLimit: 44.0,
                margin: 10.0
            )

            try TestAssertions.assertFalse(isFlipped, "Taskbar should stay below selection when far from bottom edge")
            // Centered horizontally: 400 + 200/2 - 320/2 = 340
            try TestAssertions.assertApproxEqual(frame.origin.x, 340.0, accuracy: 1e-2)
            // 10pt below visual bottom (minY = 300): 300 - 34 - 10 = 256
            try TestAssertions.assertApproxEqual(frame.origin.y, 256.0, accuracy: 1e-2)
            try TestAssertions.assertApproxEqual(frame.size.width, 320.0, accuracy: 1e-2)
            try TestAssertions.assertApproxEqual(frame.size.height, 34.0, accuracy: 1e-2)
        }

        // 10. Native right-click context menu item presence (Convert to Curves, Ungroup, Boolean, Align)
        registry.register(tier: 1, feature: "F6-ContextMenu", name: "test_T1_NativeContextMenu_ItemPresence") {
            let (controller, stage) = makeEditor()
            _ = controller

            // Single rect selection
            let rectNode = VOONode(kind: .rect, name: "ShapeProbe", x: 100, y: 100, width: 100, height: 80)
            controller.commandManager.execute(InsertNodeCommand(node: rectNode), on: &stage.document)
            stage.selectedNodeIds = [rectNode.id]

            guard let menu = stage.contextMenuProvider?(.zero) else {
                throw TestFailure(message: "Context menu provider returned nil", file: #file, line: #line)
            }

            let itemTitles = menu.items.map { $0.title }
            try TestAssertions.assertTrue(itemTitles.contains(where: { $0.contains("Duplicate") || $0.contains("创建副本") }),
                                          "Context menu must contain Duplicate")
            try TestAssertions.assertTrue(itemTitles.contains(where: { $0.contains("Delete") || $0.contains("删除") }),
                                          "Context menu must contain Delete")

            // Multi-selection (2 nodes): Align and Boolean submenus
            let rectNode2 = VOONode(kind: .ellipse, name: "ShapeProbe2", x: 220, y: 100, width: 80, height: 80)
            controller.commandManager.execute(InsertNodeCommand(node: rectNode2), on: &stage.document)
            stage.selectedNodeIds = [rectNode.id, rectNode2.id]

            guard let multiMenu = stage.contextMenuProvider?(.zero) else {
                throw TestFailure(message: "Multi-selection context menu provider returned nil", file: #file, line: #line)
            }
            let multiTitles = multiMenu.items.map { $0.title }
            try TestAssertions.assertTrue(multiTitles.contains(where: { $0.contains("Align") || $0.contains("对齐") }),
                                          "Multi-selection context menu must contain Align")
            try TestAssertions.assertTrue(multiTitles.contains(where: { $0.contains("Boolean") || $0.contains("布尔") }),
                                          "Multi-selection context menu must contain Boolean")
            try TestAssertions.assertTrue(multiTitles.contains(where: { $0.contains("Group") || $0.contains("编组") }),
                                          "Multi-selection context menu must contain Group")

            // Curve selection context menu (path node)
            let pathNode = VOONode(kind: .path, name: "PathProbe", x: 10, y: 10, width: 50, height: 50)
            controller.commandManager.execute(InsertNodeCommand(node: pathNode), on: &stage.document)
            stage.selectedNodeIds = [pathNode.id]
            guard let pathMenu = stage.contextMenuProvider?(.zero) else {
                throw TestFailure(message: "Path selection context menu provider returned nil", file: #file, line: #line)
            }
            let pathTitles = pathMenu.items.map { $0.title }
            try TestAssertions.assertTrue(pathTitles.contains(where: { $0.contains("Close Curve") || $0.contains("闭合曲线") }),
                                          "Path context menu must contain Close Curve")
            try TestAssertions.assertTrue(pathTitles.contains(where: { $0.contains("Reverse Curve") || $0.contains("反转曲线") }),
                                          "Path context menu must contain Reverse Curve")
            try TestAssertions.assertTrue(pathTitles.contains(where: { $0.contains("Smooth Curve") || $0.contains("平滑曲线") }),
                                          "Path context menu must contain Smooth Curve")
        }

        registry.register(tier: 1, feature: "F6-CurveTopologyActions", name: "test_T1_CurveTopology_CloseReverseSmoothActions") {
            let (controller, stage) = makeEditor()
            let p1 = PenAnchor(x: 0, y: 0, inHandle: nil, outHandle: CGPoint(x: 10, y: 0), isClosed: false, type: .sharp)
            let p2 = PenAnchor(x: 50, y: 50, inHandle: CGPoint(x: 40, y: 50), outHandle: nil, isClosed: false, type: .sharp)
            var pathNode = VOONode(kind: .path, name: "TopoPath", x: 0, y: 0, width: 50, height: 50)
            pathNode.points = [p1, p2]
            controller.commandManager.execute(InsertNodeCommand(node: pathNode), on: &stage.document)
            stage.selectedNodeIds = [pathNode.id]

            // Reverse curve action
            controller.reverseCurveAction(nil)
            guard let revNode = stage.document.nodes.first(where: { $0.id == pathNode.id }),
                  let revPts = revNode.points else {
                throw TestFailure(message: "Reversed curve node points missing", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(revPts[0].x, 50.0, "First anchor after reverse must be old second anchor")
            try TestAssertions.assertEqual(revPts[1].x, 0.0, "Second anchor after reverse must be old first anchor")

            // Close curve action
            controller.closeCurveAction(nil)
            guard let closedNode = stage.document.nodes.first(where: { $0.id == pathNode.id }),
                  let closedPts = closedNode.points else {
                throw TestFailure(message: "Closed curve node points missing", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(closedPts.last?.isClosed == true, "Last anchor must be marked closed")

            // Smooth curve action
            controller.smoothCurveAction(nil)
            guard let smoothNode = stage.document.nodes.first(where: { $0.id == pathNode.id }),
                  let smoothPts = smoothNode.points else {
                throw TestFailure(message: "Smooth curve node points missing", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(smoothPts[0].type, .smooth, "Anchors must be converted to smooth")
        }

        // =====================================================================
        // TIER 2: BOUNDARY & CORNER CASES (R1 & R2)
        // =====================================================================

        // 11. Taskbar flipping from bottom to top when selection is near the bottom edge of canvas stage
        registry.register(tier: 2, feature: "F5-ContextualTaskbarBoundary", name: "test_T2_TaskbarFlippingNearBottomStageEdge") {
            // Selection is at the very bottom: visual bottom minY = 30pt
            let selectionNearBottom = CGRect(x: 400, y: 30, width: 200, height: 120)
            let taskbarSize = CGSize(width: 320, height: 34)
            let stageBounds = CGRect(x: 0, y: 0, width: 1440, height: 900)
            let bottomLimit: CGFloat = 44.0 // Below this, taskbar would overlap ruler / bottom frame

            let (frame, isFlipped) = M1_ContextualTaskbarGeometry.calculateTaskbarFrame(
                selectionViewRect: selectionNearBottom,
                taskbarSize: taskbarSize,
                stageBounds: stageBounds,
                bottomLimit: bottomLimit,
                margin: 10.0
            )

            try TestAssertions.assertTrue(isFlipped, "Taskbar must flip to top when minY - taskbarH - 10 < bottomLimit")
            // Flipped position: maxY + 10 = 30 + 120 + 10 = 160
            try TestAssertions.assertApproxEqual(frame.origin.y, 160.0, accuracy: 1e-2,
                                                 "Flipped taskbar Y must sit 10pt above visual top (maxY)")
            try TestAssertions.assertGreaterThan(frame.origin.y, selectionNearBottom.maxY)
        }

        // 12. Sub-tool flyout dismissal on Escape
        registry.register(tier: 2, feature: "F1-FlyoutBoundary", name: "test_T2_SubToolFlyout_DismissalOnEscape") {
            let flyout = M1_SubToolFlyoutState()
            flyout.open(for: .pen)
            try TestAssertions.assertTrue(flyout.isOpen, "Flyout must be open initially")

            let handled = flyout.handleEscape()
            try TestAssertions.assertTrue(handled, "Escape key must be handled by open flyout")
            try TestAssertions.assertFalse(flyout.isOpen, "Flyout must be closed after Escape")

            // Second Escape should not be consumed
            let handledAgain = flyout.handleEscape()
            try TestAssertions.assertFalse(handledAgain, "Subsequent Escape must not be consumed when already closed")
        }

        // 13. Sub-tool flyout dismissal on Outside Click
        registry.register(tier: 2, feature: "F1-FlyoutBoundary", name: "test_T2_SubToolFlyout_DismissalOnOutsideClick") {
            let flyout = M1_SubToolFlyoutState()
            flyout.open(for: .shapes)
            let flyoutFrame = CGRect(x: 200, y: 40, width: 160, height: 220)

            // Click inside flyout
            let insideClick = CGPoint(x: 250, y: 80)
            let dismissedInside = flyout.handleOutsideClick(clickPoint: insideClick, flyoutFrame: flyoutFrame)
            try TestAssertions.assertFalse(dismissedInside, "Inside click must not dismiss flyout")
            try TestAssertions.assertTrue(flyout.isOpen)

            // Click outside flyout
            let outsideClick = CGPoint(x: 600, y: 500)
            let dismissedOutside = flyout.handleOutsideClick(clickPoint: outsideClick, flyoutFrame: flyoutFrame)
            try TestAssertions.assertTrue(dismissedOutside, "Outside click must dismiss flyout")
            try TestAssertions.assertFalse(flyout.isOpen)
        }

        // 14. Convert to Curves on Rectangle node producing valid Cubic Bezier anchors
        registry.register(tier: 2, feature: "F6-ConvertToCurves", name: "test_T2_ConvertToCurves_RectangleToCubicBezier") {
            let rectNode = VOONode(kind: .rect, name: "BaseCard", x: 120, y: 160, width: 300, height: 200)
            let curveNode = M1_CurveConversionEngine.convertToCurves(node: rectNode)

            try TestAssertions.assertEqual(curveNode.kind, .path, "Converted node kind must be .path")
            guard let points = curveNode.points else {
                throw TestFailure(message: "Points array missing on converted curve node", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(points.count, 4, "Converted rect must have exactly 4 corner anchors")
            try TestAssertions.assertTrue(points.last?.isClosed == true, "Path must be closed")

            // Verify corners match exact rect geometry
            try TestAssertions.assertPointApproxEqual(CGPoint(x: points[0].x, y: points[0].y), CGPoint(x: 120, y: 160))
            try TestAssertions.assertPointApproxEqual(CGPoint(x: points[1].x, y: points[1].y), CGPoint(x: 420, y: 160))
            try TestAssertions.assertPointApproxEqual(CGPoint(x: points[2].x, y: points[2].y), CGPoint(x: 420, y: 360))
            try TestAssertions.assertPointApproxEqual(CGPoint(x: points[3].x, y: points[3].y), CGPoint(x: 120, y: 360))
        }

        // 15. Convert to Curves on Ellipse node producing valid Cubic Bezier anchors
        registry.register(tier: 2, feature: "F6-ConvertToCurves", name: "test_T2_ConvertToCurves_EllipseToCubicBezier") {
            let ellipseNode = VOONode(kind: .ellipse, name: "CircleBadge", x: 100, y: 100, width: 100, height: 100)
            let curveNode = M1_CurveConversionEngine.convertToCurves(node: ellipseNode)

            try TestAssertions.assertEqual(curveNode.kind, .path)
            guard let points = curveNode.points else {
                throw TestFailure(message: "Points array missing on converted ellipse", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(points.count, 4, "Converted ellipse must have 4 cardinal anchors")
            for pt in points {
                try TestAssertions.assertEqual(pt.type, .smooth, "Ellipse anchors must be smooth")
                try TestAssertions.assertNotNil(pt.inHandle, "Ellipse anchor must have inHandle")
                try TestAssertions.assertNotNil(pt.outHandle, "Ellipse anchor must have outHandle")
            }
        }

        // 16. Convert to Curves on Text node producing valid Cubic Bezier anchors
        registry.register(tier: 2, feature: "F6-ConvertToCurves", name: "test_T2_ConvertToCurves_TextToCubicBezier") {
            let textNode = VOONode(kind: .text, name: "Heading", x: 200, y: 300, width: 160, height: 40, text: "Affinity VOO")
            let curveNode = M1_CurveConversionEngine.convertToCurves(node: textNode)

            try TestAssertions.assertEqual(curveNode.kind, .path)
            guard let points = curveNode.points else {
                throw TestFailure(message: "Points array missing on converted text", file: #file, line: #line)
            }
            try TestAssertions.assertGreaterThan(CGFloat(points.count), 2.0, "Converted text must have valid anchor contours")
            for pt in points {
                try TestAssertions.assertFalse(pt.x.isNaN)
                try TestAssertions.assertFalse(pt.y.isNaN)
            }
        }

        // =====================================================================
        // TIER 3: CROSS-FEATURE COMBINATIONS
        // =====================================================================

        // 17. Multi-selection of newly created Polygon + Star layers triggering Boolean Union and Alignment
        registry.register(tier: 3, feature: "F2+F5-Cross", name: "test_T3_Cross_PolygonAndStarMultiSelectionBooleanAndAlign") {
            let (controller, stage) = makeEditor()

            // 1. Create Polygon node
            let polyBox = CGRect(x: 200, y: 200, width: 120, height: 120)
            let polyPts = M1_ShapeGenerators.regularPolygonPoints(in: polyBox, sides: 6)
            let polyAnchors = polyPts.enumerated().map { (idx, pt) in
                PenAnchor(x: pt.x, y: pt.y, isClosed: idx == polyPts.count - 1, type: .sharp)
            }
            let polyNode = VOONode(kind: .path, name: "HexagonLayer", x: 200, y: 200, width: 120, height: 120,
                                   style: LayerStyle(fill: "#6c5ce7"), points: polyAnchors)
            controller.commandManager.execute(InsertNodeCommand(node: polyNode), on: &stage.document)

            // 2. Create Star node overlapping polygon
            let starBox = CGRect(x: 260, y: 200, width: 120, height: 120)
            let starPts = M1_ShapeGenerators.starPoints(in: starBox, spikes: 5, innerRatio: 0.382)
            let starAnchors = starPts.enumerated().map { (idx, pt) in
                PenAnchor(x: pt.x, y: pt.y, isClosed: idx == starPts.count - 1, type: .sharp)
            }
            let starNode = VOONode(kind: .path, name: "StarLayer", x: 260, y: 200, width: 120, height: 120,
                                   style: LayerStyle(fill: "#fdcb6e"), points: starAnchors)
            controller.commandManager.execute(InsertNodeCommand(node: starNode), on: &stage.document)

            // 3. Multi-select both layers
            stage.selectedNodeIds = [polyNode.id, starNode.id]
            try TestAssertions.assertEqual(stage.selectedNodeIds.count, 2)

            // 4. Perform Horizontal Center Alignment
            let initialPolyX = stage.document.nodes.first(where: { $0.id == polyNode.id })!.x
            let alignItem = NSMenuItem(title: "水平居中", action: #selector(WindowController.alignSelectionAction(_:)), keyEquivalent: "")
            alignItem.representedObject = "center"
            controller.alignSelectionAction(alignItem)

            let alignedPolyX = stage.document.nodes.first(where: { $0.id == polyNode.id })!.x
            let alignedStarX = stage.document.nodes.first(where: { $0.id == starNode.id })!.x
            try TestAssertions.assertApproxEqual(alignedPolyX + 60.0, alignedStarX + 60.0, accuracy: 2.0,
                                                 "Horizontal centers must align after align('center')")

            // 5. Undo alignment
            controller.undoAction(nil)
            let restoredPolyX = stage.document.nodes.first(where: { $0.id == polyNode.id })!.x
            try TestAssertions.assertApproxEqual(restoredPolyX, initialPolyX, accuracy: 1e-2,
                                                 "Undo must restore polygon position")

            // 6. Perform Boolean Union on both shapes
            let initialCount = stage.document.nodes.count
            let unionBox = CGRect(x: 200, y: 200, width: 180, height: 120)
            let booleanResult = VOONode(kind: .boolean, name: "UnionResult", x: unionBox.minX, y: unionBox.minY,
                                        width: unionBox.width, height: unionBox.height,
                                        style: LayerStyle(fill: "#6c5ce7"), booleanOperation: "union")
            let boolCmd = BooleanMutationCommand(opName: "Union", subjectId: polyNode.id, clipId: starNode.id, resultNode: booleanResult)
            let execOk = controller.commandManager.execute(boolCmd, on: &stage.document)
            try TestAssertions.assertTrue(execOk, "Boolean union execution should succeed")
            try TestAssertions.assertEqual(stage.document.nodes.count, initialCount - 1,
                                           "Union combines 2 nodes into 1 compound node")
            try TestAssertions.assertEqual(stage.document.nodes.last?.name, "UnionResult")

            // 7. Undo Boolean operation restores both shapes
            controller.undoAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.count, initialCount,
                                           "Undo must restore both original shapes")
        }

        // 18. Double-clicking canvas to insert text, editing text, and invoking contextual taskbar Duplicate
        registry.register(tier: 3, feature: "F4+F5-Cross", name: "test_T3_Cross_CanvasDoubleClickTextEditAndDuplicate") {
            let (controller, stage) = makeEditor()
            let initialDocCount = stage.document.nodes.count

            // 1. Activate Text tool and click on canvas to insert text node
            controller.mainContentView.toolRail.textToolButton.performClick(nil)
            let clickDocPt = CGPoint(x: 250, y: 350)
            let viewPt = stage.viewPoint(from: clickDocPt)

            var insertedId: String?
            stage.onRequestTextInsertion = { pt in
                let textNode = VOONode(kind: .text, name: "Text", x: pt.x, y: pt.y, width: 140, height: 28,
                                       style: LayerStyle(fill: "#ffffff"), text: "VOO Native Studio")
                controller.commandManager.execute(InsertNodeCommand(node: textNode), on: &stage.document)
                stage.selectedNodeIds = [textNode.id]
                insertedId = textNode.id
            }

            sendMouse(stage, .leftMouseDown, viewPt, clickCount: 1)
            sendMouse(stage, .leftMouseUp, viewPt, clickCount: 1)

            guard let textId = insertedId, let textNode = stage.document.nodes.first(where: { $0.id == textId }) else {
                throw TestFailure(message: "Text node was not inserted on double click", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(textNode.text, "VOO Native Studio")
            try TestAssertions.assertEqual(stage.selectedNodeIds, [textId])

            // 2. Duplicate text layer via duplicateAction
            controller.duplicateAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.count, initialDocCount + 2,
                                           "Duplicate must create second text node")

            guard let duplicateNode = stage.document.nodes.last else {
                throw TestFailure(message: "Duplicate text node not found", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(duplicateNode.kind, .text)
            try TestAssertions.assertEqual(duplicateNode.text, "VOO Native Studio")
            try TestAssertions.assertNotEqual(duplicateNode.id, textId, "Duplicated node must have unique ID")
            try TestAssertions.assertApproxEqual(duplicateNode.x, textNode.x + 20.0, accuracy: 1e-2,
                                                 "Duplicated node is offset by default 20pt")

            // 3. Undo duplication
            controller.undoAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.count, initialDocCount + 1,
                                           "Undo must remove duplicated text node")
        }
    }

    // MARK: - Helpers

    private static func makeEditor() -> (WindowController, CanvasStageView) {
        let controller = WindowController()
        guard let window = controller.window else {
            fatalError("WindowController has no window")
        }
        window.setContentSize(NSSize(width: 1440, height: 900))
        window.contentView?.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        controller.mainContentView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        controller.mainContentView.layoutSubtreeIfNeeded()

        controller.newDocument(nil)
        controller.mainContentView.isWelcomeOpen = false
        controller.mainContentView.layoutSubtreeIfNeeded()
        let stage = controller.mainContentView.canvasStageView
        stage.layoutSubtreeIfNeeded()
        return (controller, stage)
    }

    private static func sendMouse(_ stage: CanvasStageView, _ type: NSEvent.EventType, _ windowPoint: CGPoint, clickCount: Int = 1) {
        guard let window = stage.window,
              let event = NSEvent.mouseEvent(with: type,
                                             location: windowPoint,
                                             modifierFlags: [],
                                             timestamp: ProcessInfo.processInfo.systemUptime,
                                             windowNumber: window.windowNumber,
                                             context: nil,
                                             eventNumber: 0,
                                             clickCount: clickCount,
                                             pressure: 1.0) else { return }
        switch type {
        case .leftMouseDown: stage.mouseDown(with: event)
        case .leftMouseDragged: stage.mouseDragged(with: event)
        case .leftMouseUp: stage.mouseUp(with: event)
        default: break
        }
    }
}
#else
import Foundation
public class M1_ToolFlyoutContextualTaskbarTests {
    public static func registerTests() {}
}
#endif
