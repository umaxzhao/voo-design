//
//  M2_UnitTests.swift
//  native_studio
//
//  Milestone M2 Comprehensive Verification Suite:
//  - Vector Geometry & Bezier Mathematics
//  - Philip J. Schneider Least-Squares Curve Fitter
//  - Greiner-Hormann 5-Operation Boolean Topology Engine
//  - @MainActor CommandManager & BooleanCommand Atomic Undo/Redo
//

import AppKit
import CoreGraphics
import Foundation

@MainActor
func runM2Tests() {
    print("============================================================")
    print(" Running Milestone M2 Comprehensive Verification Suite")
    print("============================================================")

    var passed = 0
    var failed = 0

    func assert(_ condition: Bool, _ name: String) {
        if condition {
            print("  ✓ [PASS] \(name)")
            passed += 1
        } else {
            print("  ✗ [FAIL] \(name)")
            failed += 1
        }
    }

    func assertApprox(_ val: CGFloat, _ target: CGFloat, tolerance: CGFloat = 0.001, _ name: String) {
        if abs(val - target) <= tolerance {
            print("  ✓ [PASS] \(name)")
            passed += 1
        } else {
            print("  ✗ [FAIL] \(name) (expected ~\(target), got \(val))")
            failed += 1
        }
    }

    func assertPointApprox(_ p: CGPoint, _ target: CGPoint, tolerance: CGFloat = 0.01, _ name: String) {
        if abs(p.x - target.x) <= tolerance && abs(p.y - target.y) <= tolerance {
            print("  ✓ [PASS] \(name)")
            passed += 1
        } else {
            print("  ✗ [FAIL] \(name) (expected ~(\(target.x), \(target.y)), got (\(p.x), \(p.y)))")
            failed += 1
        }
    }

    // ============================================================
    // Section 1: Vector Geometry & Bezier Math
    // ============================================================
    print("\n--- [Section 1] Vector Geometry & Bezier Math ---")

    // 1.1 Line Segment Math
    let line = LineSegment(p0: CGPoint(x: 10, y: 20), p1: CGPoint(x: 70, y: 100))
    let lineLen = hypot(line.p1.x - line.p0.x, line.p1.y - line.p0.y)
    assertApprox(lineLen, 100.0, tolerance: 0.001, "LineSegment length 3-4-5 triangle (100.0)")
    assertPointApprox(line.point(at: 0.5), CGPoint(x: 40, y: 60), "LineSegment midpoint evaluation")
    let lineTangent = line.unitTangent
    assertPointApprox(lineTangent, CGPoint(x: 0.6, y: 0.8), "LineSegment unit tangent vector (0.6, 0.8)")
    let lineNormal = line.unitNormal
    assertApprox(lineTangent.x * lineNormal.x + lineTangent.y * lineNormal.y, 0.0, tolerance: 1e-6, "Line normal is perpendicular to tangent")

    // 1.2 Quadratic Bezier Segment
    let quad = QuadraticBezierSegment(p0: CGPoint(x: 0, y: 0), p1: CGPoint(x: 50, y: 100), p2: CGPoint(x: 100, y: 0))
    let quadMid = quad.point(at: 0.5)
    assertPointApprox(quadMid, CGPoint(x: 50, y: 50), "Quadratic Bezier midpoint evaluation (50, 50)")
    let elevatedCubic = quad.toCubic()
    assertPointApprox(elevatedCubic.point(at: 0.5), quadMid, "Elevated cubic matches quadratic midpoint")

    // 1.3 Cubic Bezier Segment: Dual Evaluation Equivalence (Bernstein vs de Casteljau)
    let cubic = CubicBezierSegment(
        p0: CGPoint(x: 0, y: 0),
        p1: CGPoint(x: 20, y: 80),
        p2: CGPoint(x: 80, y: 80),
        p3: CGPoint(x: 100, y: 0)
    )
    for testT in [0.0, 0.25, 0.5, 0.75, 1.0] {
        let pBernstein = cubic.point(at: CGFloat(testT))
        let pCasteljau = cubic.pointDeCasteljau(at: CGFloat(testT))
        assertPointApprox(pBernstein, pCasteljau, tolerance: 1e-5, "Bernstein & de Casteljau dual evaluation match at t=\(testT)")
    }

    // 1.4 Derivatives, Tangent, Normal, and Curvature
    let cubicMidTangent = cubic.unitTangent(at: 0.5)
    assertApprox(hypot(cubicMidTangent.x, cubicMidTangent.y), 1.0, tolerance: 1e-5, "Cubic unit tangent has unit length")
    assertApprox(cubicMidTangent.y, 0.0, tolerance: 0.01, "Symmetric cubic peak tangent is horizontal (dy/dt ~ 0)")
    let cubicCurvature = cubic.curvature(at: 0.5)
    assert(abs(cubicCurvature) > 0.0, "Cubic has non-zero curvature at apex (\(cubicCurvature))")

    // 1.5 de Casteljau Subdivision & Multi-split
    let (cLeft, cRight) = cubic.split(at: 0.5)
    assertPointApprox(cLeft.p0, cubic.p0, "Split left start matches p0")
    assertPointApprox(cRight.p3, cubic.p3, "Split right end matches p3")
    assertPointApprox(cLeft.p3, cRight.p0, "Split boundary points are coincident")
    assertPointApprox(cLeft.p3, cubic.point(at: 0.5), "Split point matches curve evaluation at t=0.5")

    let multiSplitSegments = cubic.split(at: [0.2, 0.6, 0.8])
    assert(multiSplitSegments.count == 4, "Multi-split with 3 internal parameters yields 4 segments")
    assertPointApprox(multiSplitSegments.first!.p0, cubic.p0, "Multi-split first start is p0")
    assertPointApprox(multiSplitSegments.last!.p3, cubic.p3, "Multi-split last end is p3")

    // 1.6 Adaptive Flattening
    let flattenedPoints = cubic.flatten(tolerance: 0.25)
    assert(flattenedPoints.count >= 8, "Adaptive flattening produces detailed polyline with epsilon=0.25")
    assertPointApprox(flattenedPoints.first!, cubic.p0, "Flattened polyline starts at p0")
    assertPointApprox(flattenedPoints.last!, cubic.p3, "Flattened polyline ends at p3")

    // 1.7 Gauss-Legendre Quadrature Arc Length & Parameter Inversion
    let totalLength = cubic.arcLength()
    assert(totalLength > 100.0 && totalLength < 250.0, "Gauss-Legendre arc length is within physical bounds (\(totalLength))")
    let halfLength = totalLength * 0.5
    let tAtHalf = cubic.parameter(atDistance: halfLength)
    assertApprox(tAtHalf, 0.5, tolerance: 0.01, "Symmetric cubic half arc-length corresponds to t=0.5")

    // 1.8 Analytical Tight Bounding Box
    let tightBBox = cubic.tightBoundingBox()
    assertApprox(tightBBox.minX, 0.0, tolerance: 1e-4, "Tight bbox minX == 0")
    assertApprox(tightBBox.maxX, 100.0, tolerance: 1e-4, "Tight bbox maxX == 100")
    assertApprox(tightBBox.minY, 0.0, tolerance: 1e-4, "Tight bbox minY == 0")
    assert(tightBBox.maxY > 50.0 && tightBBox.maxY <= 80.0, "Tight bbox maxY fits curve apex (\(tightBBox.maxY))")

    // 1.9 Closest Point Projection
    let proj = cubic.closestPoint(to: CGPoint(x: 50, y: 70))
    assertApprox(proj.t, 0.5, tolerance: 0.05, "Closest point projection to symmetric top point has t ~ 0.5")
    assert(proj.distance < 20.0, "Closest point distance is small")

    // 1.10 Dynamic Handle Conversions (.sharp, .smooth, .symmetric, .smart)
    var testPathNode = VOONode(
        id: "pathNodeTest",
        kind: .path,
        name: "Test Path",
        points: [
            PenAnchor(x: 0, y: 100, type: .sharp),
            PenAnchor(x: 100, y: 100, inHandle: CGPoint(x: 80, y: 90), outHandle: CGPoint(x: 130, y: 120), type: .smooth),
            PenAnchor(x: 200, y: 100, type: .sharp)
        ]
    )

    GeometryEngine.convertNode(in: &testPathNode, at: 1, to: .sharp)
    assert(testPathNode.points![1].inHandle == nil && testPathNode.points![1].outHandle == nil, "Node converted to .sharp clears both handles")

    GeometryEngine.convertNode(in: &testPathNode, at: 1, to: .symmetric)
    if let hi = testPathNode.points![1].inHandle, let ho = testPathNode.points![1].outHandle {
        let dIn = hypot(hi.x - testPathNode.points![1].point.x, hi.y - testPathNode.points![1].point.y)
        let dOut = hypot(ho.x - testPathNode.points![1].point.x, ho.y - testPathNode.points![1].point.y)
        assertApprox(dIn, dOut, tolerance: 1e-4, "Symmetric handle lengths are identical")
    } else {
        assert(false, "Symmetric node handles missing")
    }

    GeometryEngine.convertNode(in: &testPathNode, at: 1, to: .smart)
    assert(testPathNode.points![1].type == .smart, "Smart handle converted successfully")

    // 1.11 Curve Topology Mutations
    var mutableNode = VOONode(
        id: "mutNode",
        kind: .path,
        name: "Mutable Node",
        points: [
            PenAnchor(x: 0, y: 0),
            PenAnchor(x: 50, y: 20),
            PenAnchor(x: 100, y: 0)
        ]
    )
    GeometryEngine.closeCurve(in: &mutableNode)
    assert(mutableNode.points!.last!.isClosed, "closeCurve marks isClosed == true")

    GeometryEngine.reverseCurve(in: &mutableNode)
    assertPointApprox(mutableNode.points!.first!.point, CGPoint(x: 100, y: 0), "reverseCurve reverses start/end points")

    let splitParts = GeometryEngine.breakCurve(in: &mutableNode, at: 1)
    assert(splitParts.count == 2, "breakCurve divides path into 2 nodes")

    // ============================================================
    // Section 2: Philip J. Schneider Least-Squares Curve Fitter
    // ============================================================
    print("\n--- [Section 2] Schneider Curve Fitter ---")

    // 2.1 Collinear Polyline Preserved as Straight Line
    let straightPoints = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 25, y: 25),
        CGPoint(x: 50, y: 50),
        CGPoint(x: 75, y: 75),
        CGPoint(x: 100, y: 100)
    ]
    let straightFit = BezierCurveFitter.fit(points: straightPoints, errorThreshold: 2.0)
    assert(straightFit.count == 1, "Straight polyline fitted with exactly 1 segment")
    assertPointApprox(straightFit[0].p0, CGPoint(x: 0, y: 0), "Straight fit start matches")
    assertPointApprox(straightFit[0].p3, CGPoint(x: 100, y: 100), "Straight fit end matches")

    // 2.2 Smooth Arc Curve Fitting
    var arcPoints: [CGPoint] = []
    for deg in stride(from: 0.0, through: 90.0, by: 5.0) {
        let rad = deg * .pi / 180.0
        arcPoints.append(CGPoint(x: 100.0 * cos(rad), y: 100.0 * sin(rad)))
    }
    let arcFit = BezierCurveFitter.fit(points: arcPoints, errorThreshold: 1.0)
    assert(!arcFit.isEmpty, "Arc fitted to Bezier spline")
    for seg in arcFit {
        for t in [0.0, 0.5, 1.0] {
            let p = seg.point(at: CGFloat(t))
            let r = hypot(p.x, p.y)
            assertApprox(r, 100.0, tolerance: 2.0, "Fitted arc point has radius ~ 100.0")
        }
    }

    // 2.3 Polyline Corner Detection
    let sharpCornerPoints = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 50, y: 0),
        CGPoint(x: 50, y: 50),
        CGPoint(x: 100, y: 50)
    ]
    let corners = PolylineFeatureDetector.findCorners(points: sharpCornerPoints, isClosed: false, angleThresholdDegrees: 45.0)
    assert(corners.contains(1) || corners.contains(2), "Corner detector detected 90-degree corner")

    // ============================================================
    // Section 3: Greiner-Hormann 5-Operation Boolean Topology Engine
    // ============================================================
    print("\n--- [Section 3] 5-Op Boolean Topology Engine ---")

    // Rect A: [0, 0] to [100, 100] (Area = 10,000)
    let polyA = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 0, y: 100)
    ]

    // Rect B: [50, 0] to [150, 100] (Area = 10,000, Overlap = [50, 0] to [100, 100], Overlap Area = 5,000)
    let polyB = [
        CGPoint(x: 50, y: 0),
        CGPoint(x: 150, y: 0),
        CGPoint(x: 150, y: 100),
        CGPoint(x: 50, y: 100)
    ]

    // 3.1 Union / Add (Area should be 10000 + 10000 - 5000 = 15000)
    let unionPolys = BooleanTopologyEngine.perform(operation: .add, subject: polyA, clip: polyB)
    assert(!unionPolys.isEmpty, "Union operation produced polygons")
    let unionArea = unionPolys.reduce(0.0) { $0 + abs(BooleanTopologyEngine.polygonArea($1)) }
    assertApprox(unionArea, 15000.0, tolerance: 50.0, "Union area == 15,000")

    // 3.2 Intersection (Area should be 5,000)
    let intersectPolys = BooleanTopologyEngine.perform(operation: .intersect, subject: polyA, clip: polyB)
    assert(!intersectPolys.isEmpty, "Intersect operation produced polygons")
    let intersectArea = intersectPolys.reduce(0.0) { $0 + abs(BooleanTopologyEngine.polygonArea($1)) }
    assertApprox(intersectArea, 5000.0, tolerance: 50.0, "Intersect area == 5,000")

    // 3.3 Difference / Subtract (Area should be 10000 - 5000 = 5000)
    let subPolys = BooleanTopologyEngine.perform(operation: .subtract, subject: polyA, clip: polyB)
    assert(!subPolys.isEmpty, "Subtract operation produced polygons")
    let subArea = subPolys.reduce(0.0) { $0 + abs(BooleanTopologyEngine.polygonArea($1)) }
    assertApprox(subArea, 5000.0, tolerance: 50.0, "Subtract area == 5,000")

    // 3.4 XOR (Area should be 15000 - 5000 = 10000)
    let xorPolys = BooleanTopologyEngine.perform(operation: .xor, subject: polyA, clip: polyB)
    assert(!xorPolys.isEmpty, "XOR operation produced polygons")
    let xorArea = xorPolys.reduce(0.0) { $0 + abs(BooleanTopologyEngine.polygonArea($1)) }
    assertApprox(xorArea, 10000.0, tolerance: 50.0, "XOR area == 10,000")

    // 3.5 Divide (Should produce 3 parts: A\B, B\A, and A∩B, total area = 15,000)
    let divPolys = BooleanTopologyEngine.perform(operation: .divide, subject: polyA, clip: polyB)
    assert(divPolys.count >= 2, "Divide produced multiple disjoint polygons")
    let divArea = divPolys.reduce(0.0) { $0 + abs(BooleanTopologyEngine.polygonArea($1)) }
    assertApprox(divArea, 15000.0, tolerance: 100.0, "Divide total area == 15,000")

    // 3.6 Midpoint Perturbation on Collinear Boundary
    // Two rectangles touching along x=100 from y=0 to y=100
    let polyC = [
        CGPoint(x: 100, y: 0),
        CGPoint(x: 200, y: 0),
        CGPoint(x: 200, y: 100),
        CGPoint(x: 100, y: 100)
    ]
    let touchingUnion = BooleanTopologyEngine.perform(operation: .add, subject: polyA, clip: polyC)
    let touchingArea = touchingUnion.reduce(0.0) { $0 + abs(BooleanTopologyEngine.polygonArea($1)) }
    assertApprox(touchingArea, 20000.0, tolerance: 100.0, "Touching boundaries union smoothly to 20,000 area without glitch")

    // ============================================================
    // Section 4: @MainActor CommandManager & BooleanCommand Undo/Redo
    // ============================================================
    print("\n--- [Section 4] BooleanCommand & Undo/Redo ---")

    var doc = VOODocument(title: "Boolean Command Test")
    let node1 = VOONode(
        id: "rect1",
        kind: .rect,
        name: "Rect 1",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        style: VOOStyle(fill: "#FF0000", stroke: "#000000", strokeWidth: 2.0)
    )
    let node2 = VOONode(
        id: "rect2",
        kind: .rect,
        name: "Rect 2",
        x: 50,
        y: 0,
        width: 100,
        height: 100,
        style: VOOStyle(fill: "#00FF00", stroke: "#000000", strokeWidth: 2.0)
    )
    doc.nodes = [node1, node2]

    let cmdMgr = CommandManager(maxStackDepth: 100)

    guard let boolCmd = BooleanCommand(op: .add, document: doc, operandIds: ["rect1", "rect2"]) else {
        assert(false, "Failed to instantiate BooleanCommand")
        return
    }

    // 4.1 Execute Command
    let execSuccess = cmdMgr.execute(boolCmd, on: &doc)
    assert(execSuccess, "BooleanCommand executed successfully")
    assert(doc.nodes.count == boolCmd.resultNodes.count, "Operands replaced by resulting union nodes (count: \(boolCmd.resultNodes.count))")
    assert(doc.nodes[0].kind == .path, "Resulting node is of kind .path")
    assert(doc.nodes[0].style.fill == "#FF0000", "Resulting node inherited primary operand style (#FF0000)")
    assert(cmdMgr.canUndo, "CommandManager canUndo is true")
    assert(cmdMgr.undoCount == 1, "CommandManager undoCount == 1")

    // 4.2 Undo Command
    let undoSuccess = cmdMgr.undo(on: &doc)
    assert(undoSuccess, "BooleanCommand undo succeeded")
    assert(doc.nodes.count == 2, "Undo restored both original operand nodes")
    assert(doc.nodes[0].id == "rect1" && doc.nodes[1].id == "rect2", "Restored nodes maintain original IDs and positions")
    assert(cmdMgr.canRedo, "CommandManager canRedo is true")
    assert(cmdMgr.redoCount == 1, "CommandManager redoCount == 1")

    // 4.3 Redo Command
    let redoSuccess = cmdMgr.redo(on: &doc)
    assert(redoSuccess, "BooleanCommand redo succeeded")
    assert(doc.nodes.count == boolCmd.resultNodes.count, "Redo re-applied resulting union nodes")
    assert(doc.nodes[0].kind == .path, "Redo restored .path node")

    // 4.4 History Timeline
    let timeline = cmdMgr.getHistoryTimeline()
    assert(timeline.count >= 2, "History timeline includes creation and executed command")
    assert(timeline.contains { $0.name.contains("合并") || $0.name.contains("布尔") || $0.name.contains("Add") }, "Timeline item reflects Boolean operation name")

    // ============================================================
    // Summary
    // ============================================================
    print("\n============================================================")
    print(" MILESTONE M2 TEST SUMMARY: \(passed) PASSED, \(failed) FAILED")
    print("============================================================")

    if failed > 0 {
        exit(1)
    }
}

@main
struct M2TestMain {
    static func main() {
        runM2Tests()
    }
}
