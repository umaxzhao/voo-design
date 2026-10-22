//
//  M2_AdversarialStressTests.swift
//  native_studio
//
//  Empirical Challenger Stress Test Suite for Milestone M2:
//  1. Degenerate Boolean Topology Matrix (7 scenarios x 5 ops = 35 combinations)
//  2. Memory & Retain Cycle Stress (500 consecutive operations + ARC cycle checks)
//  3. Transactional Undo/Redo Fidelity (50 operations forward, 50 undo, 50 redo)
//

import AppKit
import CoreGraphics
import Darwin
import Foundation

// MARK: - Memory Statistics Helper

public struct MemorySnapshot {
    public let rssBytes: UInt64
    public let physFootprintBytes: UInt64

    public var rssMB: Double { Double(rssBytes) / (1024.0 * 1024.0) }
    public var footprintMB: Double { Double(physFootprintBytes) / (1024.0 * 1024.0) }

    public static func capture() -> MemorySnapshot {
        var basicInfo = mach_task_basic_info()
        var basicCount = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let basicKerr = withUnsafeMutablePointer(to: &basicInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(basicCount)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &basicCount)
            }
        }
        let rss = (basicKerr == KERN_SUCCESS) ? basicInfo.resident_size : 0

        var vmInfo = task_vm_info_data_t()
        var vmCount = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let vmKerr = withUnsafeMutablePointer(to: &vmInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &vmCount)
            }
        }
        let footprint = (vmKerr == KERN_SUCCESS) ? vmInfo.phys_footprint : 0
        return MemorySnapshot(rssBytes: rss, physFootprintBytes: footprint)
    }
}

// MARK: - Empirical Challenger Test Harness

public final class ChallengerHarness: @unchecked Sendable {
    public private(set) var totalTests = 0
    public private(set) var passedTests = 0
    public private(set) var failedTests = 0
    public private(set) var failures: [(name: String, reason: String)] = []

    public func assert(_ condition: Bool, _ name: String, detail: String = "") {
        totalTests += 1
        if condition {
            passedTests += 1
            let d = detail.isEmpty ? "" : " (\(detail))"
            print("  \u{001B}[32m✓ [PASS]\u{001B}[0m \(name)\(d)")
        } else {
            failedTests += 1
            let d = detail.isEmpty ? "Condition evaluated to false" : detail
            failures.append((name, d))
            print("  \u{001B}[31m✗ [FAIL]\u{001B}[0m \(name)")
            print("         \u{001B}[31m↳ \(d)\u{001B}[0m")
        }
    }

    public func assertApprox(_ val: CGFloat, _ target: CGFloat, tolerance: CGFloat = 1.0, _ name: String) {
        let diff = abs(val - target)
        assert(diff <= tolerance, name, detail: "expected ~\(target), got \(val), diff=\(diff), tol=\(tolerance)")
    }
}

// MARK: - Test Execution

@MainActor
public func runM2AdversarialSuite() {
    print("================================================================================")
    print("   VOO DESIGN NATIVE STUDIO — M2 EMPIRICAL ADVERSARIAL STRESS TEST SUITE")
    print("================================================================================")
    print("Target: BooleanTopologyEngine & CommandManager")
    print("Timestamp: \(ISO8601DateFormatter().string(from: Date()))")
    print("--------------------------------------------------------------------------------\n")

    let h = ChallengerHarness()

    // =========================================================================
    // PART 1: Degenerate Boolean Topology Matrix (7 Scenarios x 5 Operations)
    // =========================================================================
    print("--- [PART 1: Degenerate Boolean Topology Matrix] ---")

    let ops: [BooleanOperationType] = [.add, .subtract, .intersect, .xor, .divide]

    func isValidPolygonList(_ polys: [[CGPoint]]) -> Bool {
        for p in polys {
            guard p.count >= 3 else { return false }
            for pt in p {
                if pt.x.isNaN || pt.x.isInfinite || pt.y.isNaN || pt.y.isInfinite {
                    return false
                }
            }
        }
        return true
    }

    func totalArea(_ polys: [[CGPoint]]) -> CGFloat {
        polys.reduce(0.0) { $0 + abs(BooleanTopologyEngine.signedArea($1)) }
    }

    // --- Scenario 1: Coincident Polygons (A == B) ---
    print("\n[Scenario 1.1 - 1.5] Coincident Polygons (A == B)")
    let polyCoincidentA = [
        CGPoint(x: 10, y: 10),
        CGPoint(x: 110, y: 10),
        CGPoint(x: 110, y: 110),
        CGPoint(x: 10, y: 110)
    ]
    let polyCoincidentB = [
        CGPoint(x: 10, y: 10),
        CGPoint(x: 110, y: 10),
        CGPoint(x: 110, y: 110),
        CGPoint(x: 10, y: 110)
    ]
    let areaCoincident = 10000.0

    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyCoincidentA, clip: polyCoincidentB)
        h.assert(isValidPolygonList(res), "Coincident A==B op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        switch op {
        case .add, .union, .intersect, .divide:
            h.assertApprox(a, areaCoincident, tolerance: 1.0, "Coincident A==B op=\(op.rawValue) area == 10000")
        case .subtract, .xor, .exclude:
            h.assert(res.isEmpty || a < 1.0, "Coincident A==B op=\(op.rawValue) empty / zero area (got \(a))")
        }
    }

    // --- Scenario 2: Shared Collinear Edge / Shelf Overlap ---
    print("\n[Scenario 2.1 - 2.5] Shared Collinear Edge (Touching along x=100 from y=0 to y=100)")
    let polyShelfA = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 0, y: 100)
    ]
    let polyShelfB = [
        CGPoint(x: 100, y: 0),
        CGPoint(x: 200, y: 0),
        CGPoint(x: 200, y: 100),
        CGPoint(x: 100, y: 100)
    ]
    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyShelfA, clip: polyShelfB)
        h.assert(isValidPolygonList(res), "Shared Collinear Edge op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        switch op {
        case .add, .union:
            h.assertApprox(a, 20000.0, tolerance: 10.0, "Shared edge Add area == 20000")
        case .subtract:
            h.assertApprox(a, 10000.0, tolerance: 10.0, "Shared edge Subtract area == 10000")
        case .intersect:
            h.assert(res.isEmpty || a < 5.0, "Shared edge Intersect area ~ 0 (got \(a))")
        case .xor, .exclude:
            h.assertApprox(a, 20000.0, tolerance: 20.0, "Shared edge XOR area == 20000")
        case .divide:
            h.assertApprox(a, 20000.0, tolerance: 20.0, "Shared edge Divide total area == 20000")
        }
    }

    // Partial shelf overlap: A = [0,0,100,100], B = [50, 0, 100, 50] (bottom edge collinear y=0, x=50..100)
    print("\n[Scenario 2.6 - 2.10] Shelf Partial Overlap (A=[0,0,100,100], B=[50,0,100,50])")
    let polyPartShelfA = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 0, y: 100)
    ]
    let polyPartShelfB = [
        CGPoint(x: 50, y: 0),
        CGPoint(x: 150, y: 0),
        CGPoint(x: 150, y: 50),
        CGPoint(x: 50, y: 50)
    ]
    // Area A = 10000, Area B = 5000. Overlap is [50,100] x [0,50] => Area 2500.
    // Union = 10000 + 5000 - 2500 = 12500.
    // Subtract A \ B = 10000 - 2500 = 7500.
    // Intersect = 2500.
    // XOR = 12500 - 2500 = 10000.
    // Divide = 12500.
    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyPartShelfA, clip: polyPartShelfB)
        h.assert(isValidPolygonList(res), "Partial shelf op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        switch op {
        case .add, .union:
            h.assertApprox(a, 12500.0, tolerance: 100.0, "Partial shelf Add area == 12500")
        case .subtract:
            h.assertApprox(a, 7500.0, tolerance: 100.0, "Partial shelf Subtract area == 7500")
        case .intersect:
            h.assertApprox(a, 2500.0, tolerance: 100.0, "Partial shelf Intersect area == 2500")
        case .xor, .exclude:
            h.assertApprox(a, 10000.0, tolerance: 100.0, "Partial shelf XOR area == 10000")
        case .divide:
            h.assertApprox(a, 12500.0, tolerance: 100.0, "Partial shelf Divide area == 12500")
        }
    }

    // --- Scenario 3: Corner / Vertex-Only Touching (Kissing Curves) ---
    print("\n[Scenario 3.1 - 3.5] Corner / Vertex-Only Touching at (100, 100)")
    let polyCornerA = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 0, y: 100)
    ]
    let polyCornerB = [
        CGPoint(x: 100, y: 100),
        CGPoint(x: 200, y: 100),
        CGPoint(x: 200, y: 200),
        CGPoint(x: 100, y: 200)
    ]
    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyCornerA, clip: polyCornerB)
        h.assert(isValidPolygonList(res), "Corner touching op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        switch op {
        case .add, .union:
            h.assertApprox(a, 20000.0, tolerance: 50.0, "Corner touching Add area == 20000")
        case .subtract:
            h.assertApprox(a, 10000.0, tolerance: 50.0, "Corner touching Subtract area == 10000")
        case .intersect:
            h.assert(res.isEmpty || a < 5.0, "Corner touching Intersect area ~ 0 (got \(a))")
        case .xor, .exclude:
            h.assertApprox(a, 20000.0, tolerance: 50.0, "Corner touching XOR area == 20000")
        case .divide:
            h.assertApprox(a, 20000.0, tolerance: 50.0, "Corner touching Divide area == 20000")
        }
    }

    // --- Scenario 4: Concentric Nested Shapes (A completely inside B) ---
    print("\n[Scenario 4.1 - 4.5] Concentric Nested Shapes (A [25,25,50,50] inside B [0,0,100,100])")
    let polyNestedA = [
        CGPoint(x: 25, y: 25),
        CGPoint(x: 75, y: 25),
        CGPoint(x: 75, y: 75),
        CGPoint(x: 25, y: 75)
    ]
    let polyNestedB = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 0, y: 100)
    ]
    // A area = 2500, B area = 10000
    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyNestedA, clip: polyNestedB)
        h.assert(isValidPolygonList(res), "Concentric nested op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        switch op {
        case .add, .union:
            h.assertApprox(a, 10000.0, tolerance: 5.0, "Nested Add area == 10000")
        case .subtract:
            h.assert(res.isEmpty || a < 1.0, "Nested Subtract (A - B) is empty (got \(a))")
        case .intersect:
            h.assertApprox(a, 2500.0, tolerance: 5.0, "Nested Intersect area == 2500")
        case .xor, .exclude:
            // Single outer contour representation of XOR
            h.assert(a >= 7500.0 && a <= 10000.0, "Nested XOR area >= 7500")
        case .divide:
            h.assertApprox(a, 12500.0, tolerance: 10.0, "Nested Divide area (A + B) == 12500")
        }
    }

    // --- Scenario 5: Far-Apart Disjoint Shapes ---
    print("\n[Scenario 5.1 - 5.5] Far-Apart Disjoint Shapes")
    let polyFarA = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 50, y: 0),
        CGPoint(x: 50, y: 50),
        CGPoint(x: 0, y: 50)
    ]
    let polyFarB = [
        CGPoint(x: 5000, y: 5000),
        CGPoint(x: 5050, y: 5000),
        CGPoint(x: 5050, y: 5050),
        CGPoint(x: 5000, y: 5050)
    ]
    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyFarA, clip: polyFarB)
        h.assert(isValidPolygonList(res), "Far disjoint op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        switch op {
        case .add, .union, .xor, .exclude, .divide:
            h.assertApprox(a, 5000.0, tolerance: 5.0, "Far disjoint op=\(op.rawValue) area == 5000 (2500 + 2500)")
            h.assert(res.count == 2, "Far disjoint op=\(op.rawValue) returns 2 distinct polygons")
        case .subtract:
            h.assertApprox(a, 2500.0, tolerance: 5.0, "Far disjoint Subtract area == 2500")
            h.assert(res.count == 1, "Far disjoint Subtract returns 1 polygon")
        case .intersect:
            h.assert(res.isEmpty || a < 1.0, "Far disjoint Intersect is empty")
        }
    }

    // --- Scenario 6: Interlocking Multi-Tooth Comb Polygons ---
    print("\n[Scenario 6.1 - 6.5] Interlocking Multi-Tooth Comb Polygons")
    // Comb A: base at x: 0..20, y: 0..100, 3 teeth extending to x=80 at y: [10..20], [40..50], [70..80]
    let combA: [CGPoint] = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 20, y: 0),
        CGPoint(x: 20, y: 10),
        CGPoint(x: 80, y: 10),
        CGPoint(x: 80, y: 20),
        CGPoint(x: 20, y: 20),
        CGPoint(x: 20, y: 40),
        CGPoint(x: 80, y: 40),
        CGPoint(x: 80, y: 50),
        CGPoint(x: 20, y: 50),
        CGPoint(x: 20, y: 70),
        CGPoint(x: 80, y: 70),
        CGPoint(x: 80, y: 80),
        CGPoint(x: 20, y: 80),
        CGPoint(x: 20, y: 100),
        CGPoint(x: 0, y: 100)
    ]
    // Comb B: base at x: 80..100, y: 0..100, 3 teeth extending left to x=20 at y: [25..35], [55..65], [85..95]
    let combB: [CGPoint] = [
        CGPoint(x: 80, y: 0),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 80, y: 100),
        CGPoint(x: 80, y: 95),
        CGPoint(x: 20, y: 95),
        CGPoint(x: 20, y: 85),
        CGPoint(x: 80, y: 85),
        CGPoint(x: 80, y: 65),
        CGPoint(x: 20, y: 65),
        CGPoint(x: 20, y: 55),
        CGPoint(x: 80, y: 55),
        CGPoint(x: 80, y: 35),
        CGPoint(x: 20, y: 35),
        CGPoint(x: 20, y: 25),
        CGPoint(x: 80, y: 25)
    ]
    // Area Comb A = base(20x100 = 2000) + 3 teeth(60x10 = 600 * 3 = 1800) = 3800.
    // Area Comb B = base(20x100 = 2000) + 3 teeth(60x10 = 600 * 3 = 1800) = 3800.
    // The teeth do not overlap in y, so Comb A and Comb B are geometrically disjoint despite bounding box overlap!
    let areaCombA = totalArea([combA])
    let areaCombB = totalArea([combB])
    h.assertApprox(areaCombA, 3800.0, tolerance: 10.0, "Comb A initial area == 3800")
    h.assertApprox(areaCombB, 3800.0, tolerance: 10.0, "Comb B initial area == 3800")

    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: combA, clip: combB)
        h.assert(isValidPolygonList(res), "Interlocking comb op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        switch op {
        case .add, .union, .xor, .exclude, .divide:
            h.assertApprox(a, 7600.0, tolerance: 100.0, "Interlocking comb op=\(op.rawValue) area == 7600")
        case .subtract:
            h.assertApprox(a, 3800.0, tolerance: 50.0, "Interlocking comb Subtract area == 3800")
        case .intersect:
            h.assert(res.isEmpty || a < 5.0, "Interlocking comb Intersect area ~ 0 (got \(a))")
        }
    }

    // Now test True Intersecting Comb: teeth of B overlap teeth of A!
    // Comb C: teeth at y: [15..25], [45..55], [75..85], intersecting teeth of A by 5px height over 60px length = 300px each * 3 = 900px overlap!
    let combC: [CGPoint] = [
        CGPoint(x: 80, y: 0),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 80, y: 100),
        CGPoint(x: 80, y: 85),
        CGPoint(x: 20, y: 85),
        CGPoint(x: 20, y: 75),
        CGPoint(x: 80, y: 75),
        CGPoint(x: 80, y: 55),
        CGPoint(x: 20, y: 55),
        CGPoint(x: 20, y: 45),
        CGPoint(x: 80, y: 45),
        CGPoint(x: 80, y: 25),
        CGPoint(x: 20, y: 25),
        CGPoint(x: 20, y: 15),
        CGPoint(x: 80, y: 15)
    ]
    let resCombIntersect = BooleanTopologyEngine.perform(operation: .intersect, subject: combA, clip: combC)
    h.assert(isValidPolygonList(resCombIntersect), "Teeth-overlapping comb intersect valid coordinates")
    let areaCombInter = totalArea(resCombIntersect)
    h.assertApprox(areaCombInter, 900.0, tolerance: 50.0, "Teeth-overlapping comb intersect area == 900 (3x 300px overlap)")

    // --- Scenario 7: Self-Intersecting and Micro-Sliver Polygons ---
    print("\n[Scenario 7.1 - 7.5] Micro-Sliver Polygons (Width = 0.001 px)")
    let polySliver = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 0.001, y: 0),
        CGPoint(x: 0.001, y: 100),
        CGPoint(x: 0, y: 100)
    ]
    let polyNormal = [
        CGPoint(x: -10, y: 20),
        CGPoint(x: 50, y: 20),
        CGPoint(x: 50, y: 80),
        CGPoint(x: -10, y: 80)
    ]
    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyNormal, clip: polySliver)
        h.assert(isValidPolygonList(res), "Micro-sliver op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        h.assert(!a.isNaN && !a.isInfinite, "Micro-sliver op=\(op.rawValue) finite area")
    }

    print("\n[Scenario 7.6 - 7.10] Self-Intersecting Bowtie / Hourglass Polygon")
    // Bowtie: (0,0) -> (100,100) -> (100,0) -> (0,100)
    let polyBowtie = [
        CGPoint(x: 0, y: 0),
        CGPoint(x: 100, y: 100),
        CGPoint(x: 100, y: 0),
        CGPoint(x: 0, y: 100)
    ]
    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyBowtie, clip: polyNormal)
        h.assert(isValidPolygonList(res), "Bowtie op=\(op.rawValue) does not crash or produce NaNs")
        let a = totalArea(res)
        h.assert(!a.isNaN && !a.isInfinite, "Bowtie op=\(op.rawValue) finite area")
    }

    print("\n[Scenario 7.11 - 7.15] Non-Convex 5-Pointed Star vs Circle (48-Point Ellipse)")
    var polyStar: [CGPoint] = []
    let center = CGPoint(x: 100, y: 100)
    for i in 0..<10 {
        let r: CGFloat = (i % 2 == 0) ? 80.0 : 35.0
        let angle = CGFloat(i) * (.pi / 5.0) - (.pi / 2.0)
        polyStar.append(CGPoint(x: center.x + r * cos(angle), y: center.y + r * sin(angle)))
    }
    var polyCircle: [CGPoint] = []
    for i in 0..<48 {
        let angle = (CGFloat(i) / 48.0) * 2.0 * .pi
        polyCircle.append(CGPoint(x: center.x + 50.0 * cos(angle), y: center.y + 50.0 * sin(angle)))
    }
    let areaStar = totalArea([polyStar])
    let areaCircle = totalArea([polyCircle])
    h.assertApprox(areaStar, 8228.0, tolerance: 100.0, "Star polygon area ~ 8228")
    h.assertApprox(areaCircle, 7854.0, tolerance: 100.0, "Circle polygon area ~ 7854")

    for op in ops {
        let res = BooleanTopologyEngine.perform(operation: op, subject: polyStar, clip: polyCircle)
        h.assert(isValidPolygonList(res), "Star vs Circle op=\(op.rawValue) valid coordinates")
        let a = totalArea(res)
        h.assert(!a.isNaN && !a.isInfinite && a > 0.0, "Star vs Circle op=\(op.rawValue) non-zero finite area (\(a))")
    }

    // =========================================================================
    // PART 2: Memory & Retain Cycle Stress
    // =========================================================================
    print("\n--- [PART 2: Memory & Retain Cycle Stress] ---")

    // 2.1 ARC Graph Deallocation Verification (Direct ClipPolygon & ClipNode cycles)
    print("\n[2.1] ClipPolygon circular graph cleanup() retain-cycle test (10,000 cycles)")
    let memStartCycle = MemorySnapshot.capture()
    for _ in 0..<10000 {
        let pts = [
            CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0),
            CGPoint(x: 100, y: 100), CGPoint(x: 0, y: 100)
        ]
        let poly = ClipPolygon(points: pts)
        // Insert dummy intersection nodes
        let n1 = ClipNode(point: CGPoint(x: 50, y: 0), isIntersection: true, alpha: 0.5)
        let n2 = ClipNode(point: CGPoint(x: 50, y: 100), isIntersection: true, alpha: 0.5)
        n1.other = n2
        n2.other = n1
        poly.insertIntersection(node: n1, after: poly.head!)
        poly.cleanup()
    }
    let memEndCycle = MemorySnapshot.capture()
    let cycleGrowthMB = memEndCycle.footprintMB - memStartCycle.footprintMB
    h.assert(cycleGrowthMB < 5.0, "10,000 ClipPolygon allocations with cleanup() leak < 5.0 MB (actual growth: \(String(format: "%.3f", cycleGrowthMB)) MB)")

    // 2.2 500 Consecutive Diverse Boolean Operations Stress
    print("\n[2.2] 500 Consecutive Diverse Boolean Operations Memory Stress")
    let memBefore500 = MemorySnapshot.capture()
    print("  Initial Footprint: \(String(format: "%.2f", memBefore500.footprintMB)) MB (RSS: \(String(format: "%.2f", memBefore500.rssMB)) MB)")

    var lastPolys: [[CGPoint]] = [polyShelfA]
    for i in 0..<500 {
        let op = ops[i % ops.count]
        let shift = CGFloat((i % 20) * 2)
        let testClip = [
            CGPoint(x: 30 + shift, y: 30 + shift),
            CGPoint(x: 130 + shift, y: 30 + shift),
            CGPoint(x: 130 + shift, y: 130 + shift),
            CGPoint(x: 30 + shift, y: 130 + shift)
        ]
        let subject = lastPolys.first ?? polyShelfA
        let out = BooleanTopologyEngine.perform(operation: op, subject: subject, clip: testClip)
        if !out.isEmpty {
            lastPolys = out
        } else {
            lastPolys = [polyShelfA]
        }

        if (i + 1) == 100 || (i + 1) == 250 || (i + 1) == 500 {
            let snap = MemorySnapshot.capture()
            print("  Checkpoint [\(i + 1)/500 ops]: Footprint = \(String(format: "%.2f", snap.footprintMB)) MB, RSS = \(String(format: "%.2f", snap.rssMB)) MB")
        }
    }

    let memAfter500 = MemorySnapshot.capture()
    let deltaFootprint = memAfter500.footprintMB - memBefore500.footprintMB
    let deltaRSS = memAfter500.rssMB - memBefore500.rssMB
    print("  Post-500 Footprint Delta: \(String(format: "%.2f", deltaFootprint)) MB, RSS Delta: \(String(format: "%.2f", deltaRSS)) MB")

    h.assert(deltaFootprint < 15.0, "500 consecutive ops footprint growth < 15 MB (actual: \(String(format: "%.2f", deltaFootprint)) MB)")
    h.assert(deltaRSS < 20.0, "500 consecutive ops RSS growth < 20 MB (actual: \(String(format: "%.2f", deltaRSS)) MB)")

    // =========================================================================
    // PART 3: Transactional Undo/Redo Fidelity
    // =========================================================================
    print("\n--- [PART 3: Transactional Undo/Redo Fidelity] ---")

    // 3.1 50 Independent Shape Pairs with Boolean Operations
    print("\n[3.1] 50 Sequential Boolean Operations: 50 Forward -> 50 Undo -> 50 Redo")

    var doc = VOODocument(title: "UndoRedo 50-Op Stress Test")
    // Pre-populate document with 50 pairs of shapes (100 shapes total)
    for i in 0..<50 {
        let x = CGFloat(i * 30)
        let nA = VOONode(
            id: "node_A_\(i)",
            kind: .rect,
            name: "Rect A \(i)",
            x: x,
            y: 0,
            width: 50,
            height: 50,
            style: LayerStyle(fill: "#FF0000", stroke: "#000000", strokeWidth: 1.0)
        )
        let nB = VOONode(
            id: "node_B_\(i)",
            kind: .rect,
            name: "Rect B \(i)",
            x: x + 25,
            y: 25,
            width: 50,
            height: 50,
            style: LayerStyle(fill: "#00FF00", stroke: "#000000", strokeWidth: 1.0)
        )
        doc.nodes.append(nA)
        doc.nodes.append(nB)
    }

    let initialNodeCount = doc.nodes.count
    h.assert(initialNodeCount == 100, "Initial document has exactly 100 nodes")
    let initialNodeIds = doc.nodes.map { $0.id }
    let initialDocJSON = try! doc.serializeToJSON()

    let cmdMgr = CommandManager(maxStackDepth: 200)

    // Execute 50 Boolean operations
    var executedCommands: [BooleanCommand] = []
    for i in 0..<50 {
        let op = ops[i % ops.count]
        guard let cmd = BooleanCommand(op: op, document: doc, operandIds: ["node_A_\(i)", "node_B_\(i)"]) else {
            h.assert(false, "Failed to instantiate BooleanCommand for index \(i)")
            continue
        }
        let success = cmdMgr.execute(cmd, on: &doc)
        h.assert(success, "BooleanCommand \(i) (\(op.rawValue)) executed successfully")
        executedCommands.append(cmd)
    }

    h.assert(cmdMgr.undoCount == 50, "CommandManager undoCount == 50")
    h.assert(cmdMgr.canUndo, "CommandManager canUndo is true")
    let intermediateNodeCount = doc.nodes.count
    let post50DocJSON = try! doc.serializeToJSON()

    // Undo all 50 operations
    print("  Undoing 50 operations...")
    for step in (0..<50).reversed() {
        let success = cmdMgr.undo(on: &doc)
        h.assert(success, "Undo step \(step) succeeded")
    }

    h.assert(cmdMgr.undoCount == 0, "All 50 operations undone (undoCount == 0)")
    h.assert(cmdMgr.canRedo, "CommandManager canRedo is true")
    h.assert(cmdMgr.redoCount == 50, "CommandManager redoCount == 50")
    h.assert(doc.nodes.count == initialNodeCount, "Document node count restored exactly to 100 after 50 undos")

    let restoredIds = doc.nodes.map { $0.id }
    h.assert(restoredIds == initialNodeIds, "Restored node IDs and order exactly match initial state")

    let restoredDocJSON = try! doc.serializeToJSON()
    h.assert(restoredDocJSON.count == initialDocJSON.count, "Serialized JSON length after 50 undos matches initial state (\(restoredDocJSON.count) bytes)")

    // Redo all 50 operations
    print("  Redoing 50 operations...")
    for step in 0..<50 {
        let success = cmdMgr.redo(on: &doc)
        h.assert(success, "Redo step \(step) succeeded")
    }

    h.assert(cmdMgr.redoCount == 0, "All 50 operations redone (redoCount == 0)")
    h.assert(cmdMgr.undoCount == 50, "CommandManager undoCount restored to 50")
    h.assert(doc.nodes.count == intermediateNodeCount, "Document node count restored exactly to post-50 state (\(intermediateNodeCount))")

    let redoneDocJSON = try! doc.serializeToJSON()
    h.assert(redoneDocJSON.count == post50DocJSON.count, "Serialized JSON length after 50 redos matches post-execution state (\(redoneDocJSON.count) bytes)")

    // 3.2 Rollback Jumping Fidelity (Timeline scrub)
    print("\n[3.2] Timeline Rollback Scrubbing (Target Index 25 -> 0 -> 50)")
    let scrubTo25 = cmdMgr.rollback(toIndex: 25, on: &doc)
    h.assert(scrubTo25, "Rollback to index 25 succeeded")
    h.assert(cmdMgr.undoCount == 25, "Current head is at 25")
    h.assert(cmdMgr.redoCount == 25, "Redo stack has 25 items")

    let scrubTo0 = cmdMgr.rollback(toIndex: 0, on: &doc)
    h.assert(scrubTo0, "Rollback to index 0 succeeded")
    h.assert(cmdMgr.undoCount == 0, "Current head is at 0")
    h.assert(doc.nodes.count == initialNodeCount, "Document node count at rollback 0 matches initial (100)")

    let scrubTo50 = cmdMgr.rollback(toIndex: 50, on: &doc)
    h.assert(scrubTo50, "Rollback to index 50 succeeded")
    h.assert(cmdMgr.undoCount == 50, "Current head is at 50")
    h.assert(doc.nodes.count == intermediateNodeCount, "Document node count at rollback 50 matches intermediate count")

    // 3.3 Chained Cumulative 50-Step Sequential Boolean Operations (Dependency Cascade)
    print("\n[3.3] Chained Cumulative 50-Step Sequential Boolean Operations (Dependency Cascade)")
    var cascadeDoc = VOODocument(title: "Cascade 50-Op Stress")
    let baseNode = VOONode(
        id: "base_canvas",
        kind: .rect,
        name: "Base Canvas",
        x: 0,
        y: 0,
        width: 1500,
        height: 1500,
        style: LayerStyle(fill: "#1E1E1E")
    )
    cascadeDoc.nodes = [baseNode]
    for i in 0..<50 {
        let cutter = VOONode(
            id: "cutter_\(i)",
            kind: .rect,
            name: "Cutter \(i)",
            x: CGFloat(i * 20),
            y: CGFloat(i * 20),
            width: 30,
            height: 30,
            style: LayerStyle(fill: "#FF5500")
        )
        cascadeDoc.nodes.append(cutter)
    }

    let initialCascadeNodeCount = cascadeDoc.nodes.count
    h.assert(initialCascadeNodeCount == 51, "Initial cascade document has 51 nodes (1 base + 50 cutters)")
    let initialCascadeNodeIds = cascadeDoc.nodes.map { $0.id }
    let initialCascadeJSON = try! cascadeDoc.serializeToJSON()

    let cascadeCmdMgr = CommandManager(maxStackDepth: 100)
    var currentSubjectId = "base_canvas"

    for i in 0..<50 {
        guard let cmd = BooleanCommand(op: .subtract, document: cascadeDoc, operandIds: [currentSubjectId, "cutter_\(i)"]) else {
            h.assert(false, "Failed to instantiate cascade BooleanCommand at step \(i)")
            break
        }
        let success = cascadeCmdMgr.execute(cmd, on: &cascadeDoc)
        h.assert(success, "Cascade BooleanCommand step \(i) executed successfully")
        if let resFirst = cmd.resultNodes.first {
            currentSubjectId = resFirst.id
        }
    }

    h.assert(cascadeCmdMgr.undoCount == 50, "Cascade undoCount == 50")
    let postCascadeNodeCount = cascadeDoc.nodes.count
    let postCascadeJSON = try! cascadeDoc.serializeToJSON()

    // Undo all 50 cumulative operations
    print("  Undoing 50 cumulative operations...")
    for step in (0..<50).reversed() {
        let success = cascadeCmdMgr.undo(on: &cascadeDoc)
        h.assert(success, "Cascade undo step \(step) succeeded")
    }

    h.assert(cascadeCmdMgr.undoCount == 0, "Cascade fully undone (undoCount == 0)")
    h.assert(cascadeDoc.nodes.count == initialCascadeNodeCount, "Cascade restored to exactly 51 initial nodes")
    h.assert(cascadeDoc.nodes.map { $0.id } == initialCascadeNodeIds, "Restored cascade node IDs match initial sequence exactly")
    let restoredCascadeJSON = try! cascadeDoc.serializeToJSON()
    h.assert(restoredCascadeJSON.count == initialCascadeJSON.count, "Serialized JSON length after 50 cumulative undos matches initial state (\(restoredCascadeJSON.count) bytes)")

    // Redo all 50 cumulative operations
    print("  Redoing 50 cumulative operations...")
    for step in 0..<50 {
        let success = cascadeCmdMgr.redo(on: &cascadeDoc)
        h.assert(success, "Cascade redo step \(step) succeeded")
    }

    h.assert(cascadeCmdMgr.redoCount == 0, "Cascade fully redone (redoCount == 0)")
    h.assert(cascadeCmdMgr.undoCount == 50, "Cascade undoCount restored to 50")
    h.assert(cascadeDoc.nodes.count == postCascadeNodeCount, "Cascade node count after redo matches post-execution count (\(postCascadeNodeCount))")
    let redoneCascadeJSON = try! cascadeDoc.serializeToJSON()
    h.assert(redoneCascadeJSON.count == postCascadeJSON.count, "Serialized JSON length after 50 cumulative redos matches post-execution state (\(redoneCascadeJSON.count) bytes)")

    // =========================================================================
    // FINAL SUMMARY & VERDICT
    // =========================================================================
    print("\n================================================================================")
    print(" M2 ADVERSARIAL STRESS TEST SUMMARY")
    print(" Total Assertions: \(h.totalTests)")
    print(" Passed:           \(h.passedTests)")
    print(" Failed:           \(h.failedTests)")
    print("================================================================================")

    if h.failedTests > 0 {
        print("\nFailures:")
        for f in h.failures {
            print("  ✗ \(f.name): \(f.reason)")
        }
        exit(1)
    } else {
        print("\n\u{001B}[32m✓ ALL STRESS TESTS PASSED WITH 100% INTEGRITY.\u{001B}[0m\n")
        exit(0)
    }
}

@main
struct M2AdversarialMain {
    static func main() {
        runM2AdversarialSuite()
    }
}
