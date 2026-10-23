//
//  M5_UnitTests.swift
//  native_studio
//
//  Unit Test Suite for Milestone M5: Canvas Viewport Dual Rulers & Interactive Handles.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Assertion Helper

private var totalAsserts = 0
private var passedAsserts = 0

private func assert(_ condition: Bool, _ description: String) {
    totalAsserts += 1
    if condition {
        passedAsserts += 1
        print("  ✓ [PASS] \(description)")
    } else {
        print("  ✗ [FAIL] \(description)")
    }
}

private func assertEqual<T: Equatable>(_ a: T, _ b: T, _ description: String) {
    totalAsserts += 1
    if a == b {
        passedAsserts += 1
        print("  ✓ [PASS] \(description)")
    } else {
        print("  ✗ [FAIL] \(description) (expected: \(b), got: \(a))")
    }
}

private func assertClose(_ a: CGFloat, _ b: CGFloat, tolerance: CGFloat = 0.001, _ description: String) {
    totalAsserts += 1
    if abs(a - b) <= tolerance {
        passedAsserts += 1
        print("  ✓ [PASS] \(description)")
    } else {
        print("  ✗ [FAIL] \(description) (expected: \(b), got: \(a), diff: \(abs(a - b)))")
    }
}

// MARK: - Main Test Entrypoint

@main
struct M5UnitTests {
    static func main() {
        print("============================================================")
        print("  VOO DESIGN NATIVE STUDIO — MILESTONE M5 UNIT TESTS")
        print("  Module: Canvas Viewport Dual Rulers & Interactive Handles")
        print("============================================================\n")

        testRulerViews()
        testTransformHandles()
        testCanvasStageCoordinates()
        testViewportZoomAndPan()
        testMagneticSnapping()
        testMarqueeAndHitTesting()
        testHandleTransformInteraction()

        print("\n============================================================")
        print("  M5 TEST SUMMARY: \(passedAsserts)/\(totalAsserts) passed (\(String(format: "%.1f", Double(passedAsserts) / Double(max(1, totalAsserts)) * 100))%)")
        print("============================================================\n")

        if passedAsserts != totalAsserts {
            exit(1)
        }
    }

    // ============================================================
    // Section 1: Canvas Ruler Views (Horizontal & Vertical)
    // ============================================================
    static func testRulerViews() {
        print("--- Section 1: Canvas Ruler Views ---")

        let hRuler = CanvasRulerView(orientation: .horizontal)
        let vRuler = CanvasRulerView(orientation: .vertical)

        // 1.1 Orientation & Invariants
        assertEqual(hRuler.orientation, .horizontal, "1.1 Horizontal ruler orientation verified")
        assertEqual(vRuler.orientation, .vertical, "1.2 Vertical ruler orientation verified")
        assertEqual(hRuler.wantsLayer, false, "1.3 Horizontal ruler uses direct CoreGraphics (wantsLayer == false)")
        assertEqual(vRuler.wantsLayer, false, "1.4 Vertical ruler uses direct CoreGraphics (wantsLayer == false)")

        // 1.2 Accessibility Catalog Identifiers
        assertEqual(hRuler.accessibilityIdentifier(), AccessibilityCatalog.rulerHorizontal, "1.5 Horizontal ruler accessibility identifier")
        assertEqual(vRuler.accessibilityIdentifier(), AccessibilityCatalog.rulerVertical, "1.6 Vertical ruler accessibility identifier")
        assertEqual(hRuler.accessibilityRole(), .ruler, "1.7 Horizontal ruler accessibility role is .ruler")
        assertEqual(vRuler.accessibilityRole(), .ruler, "1.8 Vertical ruler accessibility role is .ruler")

        // 1.3 Zoom & Pan Offset Mutation
        hRuler.zoom = 2.0
        hRuler.panOffset = 150.0
        assertClose(hRuler.zoom, 2.0, "1.9 Ruler zoom property update preserved")
        assertClose(hRuler.panOffset, 150.0, "1.10 Ruler panOffset property update preserved")

        // 1.4 Cursor Projection Tracking
        hRuler.cursorPosition = 350.0
        assertEqual(hRuler.cursorPosition, 350.0, "1.11 Cursor position indicator tracking set")
        hRuler.cursorPosition = nil
        assertEqual(hRuler.cursorPosition, nil, "1.12 Cursor position indicator cleared")

        // 1.5 Guide Line Creation Callback
        var createdAxis: String?
        var createdPosition: CGFloat?
        hRuler.onGuideCreated = { axis, pos in
            createdAxis = axis
            createdPosition = pos
        }
        hRuler.onGuideCreated?("h", 420.0)
        assertEqual(createdAxis, "h", "1.13 Horizontal ruler guide creation callback axis")
        assertEqual(createdPosition, 420.0, "1.14 Horizontal ruler guide creation callback position")

        vRuler.onGuideCreated = { axis, pos in
            createdAxis = axis
            createdPosition = pos
        }
        vRuler.onGuideCreated?("v", 180.0)
        assertEqual(createdAxis, "v", "1.15 Vertical ruler guide creation callback axis")
        assertEqual(createdPosition, 180.0, "1.16 Vertical ruler guide creation callback position")
    }

    // ============================================================
    // Section 2: Transform Handles View (8-Point Bounding Box & Rotation)
    // ============================================================
    static func testTransformHandles() {
        print("\n--- Section 2: Transform Handles View ---")

        let handles = TransformHandlesView()
        assertEqual(handles.wantsLayer, false, "2.1 TransformHandlesView uses direct CoreGraphics")
        assertEqual(handles.accessibilityIdentifier(), "transform_handles_overlay", "2.2 TransformHandlesView identifier")

        // 2.2 Handle Types Enumeration
        assertEqual(TransformHandleType.allCases.count, 9, "2.3 Exactly 9 transform handle types defined")
        assert(TransformHandleType.allCases.contains(.topLeft), "2.4 Contains topLeft")
        assert(TransformHandleType.allCases.contains(.topCenter), "2.5 Contains topCenter")
        assert(TransformHandleType.allCases.contains(.topRight), "2.6 Contains topRight")
        assert(TransformHandleType.allCases.contains(.middleRight), "2.7 Contains middleRight")
        assert(TransformHandleType.allCases.contains(.bottomRight), "2.8 Contains bottomRight")
        assert(TransformHandleType.allCases.contains(.bottomCenter), "2.9 Contains bottomCenter")
        assert(TransformHandleType.allCases.contains(.bottomLeft), "2.10 Contains bottomLeft")
        assert(TransformHandleType.allCases.contains(.middleLeft), "2.11 Contains middleLeft")
        assert(TransformHandleType.allCases.contains(.rotatePin), "2.12 Contains rotatePin")

        // 2.3 Handle Coordinates Geometry Mapping
        let rect = CGRect(x: 100, y: 100, width: 200, height: 100)
        handles.targetRect = rect
        handles.zoom = 1.0
        let pts = handles.handlePoints(for: rect)

        assertClose(pts[.topLeft]!.x, 100, "2.13 topLeft X matches minX")
        assertClose(pts[.topLeft]!.y, 100, "2.14 topLeft Y matches minY")
        assertClose(pts[.topCenter]!.x, 200, "2.15 topCenter X matches midX")
        assertClose(pts[.topCenter]!.y, 100, "2.16 topCenter Y matches minY")
        assertClose(pts[.topRight]!.x, 300, "2.17 topRight X matches maxX")
        assertClose(pts[.topRight]!.y, 100, "2.18 topRight Y matches minY")
        assertClose(pts[.middleRight]!.x, 300, "2.19 middleRight X matches maxX")
        assertClose(pts[.middleRight]!.y, 150, "2.20 middleRight Y matches midY")
        assertClose(pts[.bottomRight]!.x, 300, "2.21 bottomRight X matches maxX")
        assertClose(pts[.bottomRight]!.y, 200, "2.22 bottomRight Y matches maxY")
        assertClose(pts[.bottomCenter]!.x, 200, "2.23 bottomCenter X matches midX")
        assertClose(pts[.bottomCenter]!.y, 200, "2.24 bottomCenter Y matches maxY")
        assertClose(pts[.bottomLeft]!.x, 100, "2.25 bottomLeft X matches minX")
        assertClose(pts[.bottomLeft]!.y, 200, "2.26 bottomLeft Y matches maxY")
        assertClose(pts[.middleLeft]!.x, 100, "2.27 middleLeft X matches minX")
        assertClose(pts[.middleLeft]!.y, 150, "2.28 middleLeft Y matches midY")

        // Rotation stalk is 20px above top center (minY - 20)
        assertClose(pts[.rotatePin]!.x, 200, "2.29 rotatePin X matches midX")
        assertClose(pts[.rotatePin]!.y, 80, "2.30 rotatePin Y is exactly 20px above top edge")

        // 2.4 Hit Testing with Slop Distance
        let hitTopLeft = handles.hitTestHandle(at: CGPoint(x: 101, y: 99))
        assertEqual(hitTopLeft, .topLeft, "2.31 Hit test detects topLeft handle near coordinates")

        let hitRotate = handles.hitTestHandle(at: CGPoint(x: 200, y: 79))
        assertEqual(hitRotate, .rotatePin, "2.32 Hit test detects rotatePin handle on stalk")

        let hitMiss = handles.hitTestHandle(at: CGPoint(x: 150, y: 150))
        assertEqual(hitMiss, nil, "2.33 Hit test inside rect body returns nil (allows body dragging)")
    }

    // ============================================================
    // Section 3: Canvas Stage View Coordinates Transformations
    // ============================================================
    static func testCanvasStageCoordinates() {
        print("\n--- Section 3: Canvas Stage View Coordinates ---")

        let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1000, height: 800))
        stage.panOffset = CGPoint(x: 50, y: 100)
        stage.zoom = 1.5

        // Invertibility test: doc -> view -> doc
        let testPoints: [CGPoint] = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 100, y: 200),
            CGPoint(x: -50, y: 350),
            CGPoint(x: 1920, y: 1080),
            CGPoint(x: 428.5, y: 926.3)
        ]

        for (idx, pt) in testPoints.enumerated() {
            let vPt = stage.viewPoint(from: pt)
            let roundTrip = stage.documentPoint(from: vPt)
            assertClose(roundTrip.x, pt.x, "3.\(idx + 1) X-coordinate invertibility for point \(pt)")
            assertClose(roundTrip.y, pt.y, "3.\(idx + 1) Y-coordinate invertibility for point \(pt)")
        }

        // Test at different zoom and pan offsets
        stage.zoom = 0.25
        stage.panOffset = CGPoint(x: -300, y: -200)
        let docPt = CGPoint(x: 800, y: 600)
        let vPt = stage.viewPoint(from: docPt)
        let recovered = stage.documentPoint(from: vPt)
        assertClose(recovered.x, docPt.x, "3.6 Invertibility preserved at 25% zoom")
        assertClose(recovered.y, docPt.y, "3.7 Invertibility preserved with negative pan offset")
    }

    // ============================================================
    // Section 4: Viewport Zoom & Pan Ergonomics
    // ============================================================
    static func testViewportZoomAndPan() {
        print("\n--- Section 4: Viewport Zoom & Pan Ergonomics ---")

        let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
        stage.zoom = 1.0

        // 4.1 Zoom In step (1.25x)
        stage.zoomIn()
        assertClose(stage.zoom, 1.25, "4.1 zoomIn multiplies by 1.25")

        // 4.2 Zoom Out step (/ 1.25)
        stage.zoomOut()
        assertClose(stage.zoom, 1.0, "4.2 zoomOut restores zoom level")

        // 4.3 Zoom Reset
        stage.zoom = 3.5
        stage.zoomReset()
        assertClose(stage.zoom, 1.0, "4.3 zoomReset restores exact 100% (1.0)")

        // 4.4 Zoom Clamping Envelopes [0.05, 32.0]
        stage.zoom = 100.0
        assert(stage.zoom <= 32.0, "4.4 Zoom ceiling clamped to 32.0x")
        stage.zoom = 0.001
        assert(stage.zoom >= 0.05, "4.5 Zoom floor clamped to 0.05x (5%)")

        // 4.5 Zoom to Fit
        stage.zoom = 1.0
        stage.document.canvas = CanvasFrame(x: 0, y: 0, width: 1920, height: 1080)
        stage.zoomToFit()
        assert(stage.zoom > 0.05 && stage.zoom < 2.0, "4.6 zoomToFit calculates reasonable viewport zoom (\(stage.zoom))")

        // 4.6 Rulers Visibility Toggle
        assertEqual(stage.showRulers, false, "4.7 Default showRulers is false for headless forensics")
        stage.showRulers = true
        assertEqual(stage.showRulers, true, "4.8 showRulers toggle to true")
        assertEqual(stage.horizontalRuler.isHidden, false, "4.9 Horizontal ruler visible when showRulers == true")
        assertEqual(stage.verticalRuler.isHidden, false, "4.10 Vertical ruler visible when showRulers == true")
        stage.showRulers = false
        assertEqual(stage.horizontalRuler.isHidden, true, "4.11 Horizontal ruler hidden when showRulers == false")
        assertEqual(stage.verticalRuler.isHidden, true, "4.12 Vertical ruler hidden when showRulers == false")
    }

    // ============================================================
    // Section 5: Magnetic Alignment Snapping Engine
    // ============================================================
    static func testMagneticSnapping() {
        print("\n--- Section 5: Magnetic Snapping Engine ---")

        let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
        stage.document.canvas = CanvasFrame(x: 0, y: 0, width: 1920, height: 1080)

        // Add a reference node at (400, 300, 200, 100)
        let refNode = VOONode(
            id: "ref_node_1",
            kind: .rect,
            name: "Ref Node",
            x: 400,
            y: 300,
            width: 200,
            height: 100
        )
        stage.document.nodes = [refNode]

        // 5.1 Snapping near Reference Left Edge (400) within 6px threshold
        // Moving object at X = 403, width = 100. Target point = 403.
        let snapNear = stage.computeSnapping(for: CGPoint(x: 403, y: 500), movingEdge: "x", excludeId: "moving_node")
        assertEqual(snapNear.snapped, true, "5.1 Snapping engages within 6px threshold (at delta = 3px)")
        assertClose(snapNear.snappedPoint.x, 400.0, "5.2 Snapped coordinate aligns exactly to reference edge 400.0")

        // 5.2 Distance Beyond Threshold (415) Should Not Snap
        let snapFar = stage.computeSnapping(for: CGPoint(x: 415, y: 500), movingEdge: "x", excludeId: "moving_node")
        assertEqual(snapFar.snapped, false, "5.3 Snapping does not engage beyond 6px threshold (at delta = 15px)")
        assertClose(snapFar.snappedPoint.x, 415.0, "5.4 Coordinate remains unchanged when outside snap threshold")

        // 5.3 Snapping to Canvas Boundary (0.0)
        let snapOrigin = stage.computeSnapping(for: CGPoint(x: 4, y: 500), movingEdge: "x", excludeId: "moving_node")
        assertEqual(snapOrigin.snapped, true, "5.5 Snaps to canvas artboard origin (0.0)")
        assertClose(snapOrigin.snappedPoint.x, 0.0, "5.6 Coordinate snapped to 0.0")

        // 5.4 Snapping to User Guide Line
        stage.addGuide(axis: "v", position: 750.0)
        let snapGuide = stage.computeSnapping(for: CGPoint(x: 752, y: 500), movingEdge: "x", excludeId: "moving_node")
        assertEqual(snapGuide.snapped, true, "5.7 Snaps to persistent user guide line at 750.0")
        assertClose(snapGuide.snappedPoint.x, 750.0, "5.8 Coordinate snapped to guide position 750.0")
    }

    // ============================================================
    // Section 6: Node Hit Testing & Marquee Selection
    // ============================================================
    static func testMarqueeAndHitTesting() {
        print("\n--- Section 6: Node Hit Testing & Marquee Selection ---")

        let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
        let nodeA = VOONode(id: "node_a", kind: .rect, name: "Node A", x: 100, y: 100, width: 150, height: 100)
        let nodeB = VOONode(id: "node_b", kind: .rect, name: "Node B", x: 300, y: 200, width: 200, height: 150)
        let nodeHidden = VOONode(id: "node_hidden", kind: .rect, name: "Hidden", x: 120, y: 120, width: 50, height: 50, style: LayerStyle(visible: false))
        let nodeLocked = VOONode(id: "node_locked", kind: .rect, name: "Locked", x: 320, y: 220, width: 50, height: 50, style: LayerStyle(locked: true))

        stage.document.nodes = [nodeA, nodeB, nodeHidden, nodeLocked]

        // 6.1 Hit Test on Visible Unlocked Node A
        let hitA = stage.hitTestNode(at: CGPoint(x: 150, y: 150))
        assertEqual(hitA?.id, "node_a", "6.1 Hit test returns node_a at inside coordinate")

        // 6.2 Hit Test Miss
        let hitEmpty = stage.hitTestNode(at: CGPoint(x: 50, y: 50))
        assertEqual(hitEmpty, nil, "6.2 Hit test on empty stage returns nil")

        // 6.3 Hit Test on Hidden Node is Skipped
        let hitHiddenCoord = stage.hitTestNode(at: CGPoint(x: 130, y: 130))
        // Should hit nodeA (underneath), not nodeHidden
        assertEqual(hitHiddenCoord?.id, "node_a", "6.3 Hidden node is ignored by hit testing")

        // 6.4 Marquee Rect Intersection
        // Marquee from (50, 50) to (550, 400) covers nodeA and nodeB
        let marqueeBox = CGRect(x: 50, y: 50, width: 500, height: 350)
        var intersectedIds: [String] = []
        for node in stage.document.nodes where node.style.visible && !node.style.locked {
            let nodeRect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            if marqueeBox.intersects(nodeRect) {
                intersectedIds.append(node.id)
            }
        }
        assertEqual(intersectedIds.count, 2, "6.4 Marquee selection intersects exactly 2 selectable nodes")
        assert(intersectedIds.contains("node_a"), "6.5 Marquee selection includes node_a")
        assert(intersectedIds.contains("node_b"), "6.6 Marquee selection includes node_b")
    }

    // ============================================================
    // Section 7: Transform Handle Live Synchronization
    // ============================================================
    static func testHandleTransformInteraction() {
        print("\n--- Section 7: Transform Handle Live Synchronization ---")

        let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
        let targetNode = VOONode(id: "target_node", kind: .rect, name: "Target", x: 250, y: 150, width: 300, height: 200, rotation: 15.0)
        stage.document.nodes = [targetNode]

        // 7.1 Select Single Node Updates Transform Handles
        stage.selectNode(id: "target_node")
        assertEqual(stage.selectedNodeIds.count, 1, "7.1 Exactly one node selected")
        assertClose(stage.transformHandles.targetRect.origin.x, 250.0, "7.2 Handles targetRect X synchronized to selected node")
        assertClose(stage.transformHandles.targetRect.origin.y, 150.0, "7.3 Handles targetRect Y synchronized to selected node")
        assertClose(stage.transformHandles.targetRect.size.width, 300.0, "7.4 Handles targetRect width synchronized to selected node")
        assertClose(stage.transformHandles.targetRect.size.height, 200.0, "7.5 Handles targetRect height synchronized to selected node")
        assertClose(stage.transformHandles.rotationAngle, 15.0, "7.6 Handles rotationAngle synchronized to selected node")

        // 7.2 Apply Handle Transformation Mutation
        var notifiedNode: VOONode?
        stage.onNodeTransformed = { node in
            notifiedNode = node
        }

        let transformedRect = CGRect(x: 280, y: 160, width: 400, height: 250)
        stage.applyHandleTransform(newRect: transformedRect, newRotation: 45.0)

        let updatedNode = stage.document.nodes.first(where: { $0.id == "target_node" })
        assertClose(updatedNode!.x, 280.0, "7.7 Document node X updated via handle transform")
        assertClose(updatedNode!.y, 160.0, "7.8 Document node Y updated via handle transform")
        assertClose(updatedNode!.width, 400.0, "7.9 Document node width updated via handle transform")
        assertClose(updatedNode!.height, 250.0, "7.10 Document node height updated via handle transform")
        assertClose(updatedNode!.rotation, 45.0, "7.11 Document node rotation updated via handle transform")
        assertEqual(notifiedNode?.id, "target_node", "7.12 onNodeTransformed delegate callback dispatched with updated node")

        // 7.3 Deselect Clears Handles
        stage.clearSelection()
        assertEqual(stage.selectedNodeIds.isEmpty, true, "7.13 clearSelection empties selectedNodeIds")
        assertEqual(stage.transformHandles.targetRect, .zero, "7.14 Handles targetRect reset to .zero on deselection")
    }
}
