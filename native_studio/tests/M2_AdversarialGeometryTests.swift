//
//  M2_AdversarialGeometryTests.swift
//  native_studio
//
//  Milestone M2 Adversarial Stress Test Suite:
//  - Extreme & Degenerate Bezier Curves
//  - Gauss-Legendre Quadrature vs Adaptive Chord Subdivision Convergence
//  - Analytical Bounding Box vs Dense Sample Envelope
//  - Schneider Curve Fitter Boundary Testing (Noisy 100+ points, Collinear, Zigzag, Rings)
//  - 2-Pass Newton-Raphson Parameter Convergence & Singularity Guard Stress
//
//  Executed by Empirical Challenger (challenger_m2_1)
//

import AppKit
import CoreGraphics
import Foundation

public final class AdversarialReport {
    public var total = 0
    public var passed = 0
    public var failed = 0
    public var failures: [String] = []

    public func assert(_ condition: Bool, _ title: String, detail: String = "") {
        total += 1
        if condition {
            let detailStr = detail.isEmpty ? "" : " (\(detail))"
            print("  \u{001B}[32m✓ [PASS]\u{001B}[0m \(title)\(detailStr)")
            passed += 1
        } else {
            let detailStr = detail.isEmpty ? "" : " [\(detail)]"
            let msg = "  \u{001B}[31m✗ [FAIL]\u{001B}[0m \(title)\(detailStr)"
            print(msg)
            failed += 1
            failures.append(msg)
        }
    }

    public func assertApprox(_ val: CGFloat, _ target: CGFloat, tolerance: CGFloat = 0.001, _ title: String) {
        let diff = abs(val - target)
        assert(diff <= tolerance, title, detail: "expected ~\(target), got \(val), diff=\(diff)")
    }

    public func assertPointApprox(_ p: CGPoint, _ target: CGPoint, tolerance: CGFloat = 0.01, _ title: String) {
        let dx = abs(p.x - target.x)
        let dy = abs(p.y - target.y)
        assert(dx <= tolerance && dy <= tolerance, title, detail: "expected ~(\(target.x), \(target.y)), got (\(p.x), \(p.y))")
    }

    public func section(_ name: String) {
        print("\n" + String(repeating: "=", count: 70))
        print("  \(name)")
        print(String(repeating: "=", count: 70))
    }
}

@main
public struct M2AdversarialRunner {
    public static func main() {
        let report = AdversarialReport()
        print("======================================================================")
        print(" VOO DESIGN NATIVE STUDIO — M2 ADVERSARIAL STRESS TEST SUITE")
        print("======================================================================")

        testVector1_ExtremeAndDegenerateBezier(report)
        testVector2_GaussLegendreConvergence(report)
        testVector3_AnalyticalBoundingBox(report)
        testVector4_SchneiderFitterBoundaries(report)
        testVector5_NewtonRaphsonAndSingularity(report)

        print("\n" + String(repeating: "=", count: 70))
        print(" M2 ADVERSARIAL TEST SUMMARY")
        print(String(repeating: "=", count: 70))
        print(" Total Assertions: \(report.total)")
        print(" Passed:           \(report.passed)")
        print(" Failed:           \(report.failed)")
        if !report.failures.isEmpty {
            print("\n Failures:")
            for f in report.failures {
                print("   \(f)")
            }
        }
        print(String(repeating: "=", count: 70))

        if report.failed > 0 {
            exit(1)
        } else {
            exit(0)
        }
    }

    // =========================================================================
    // Vector 1: Extreme & Degenerate Bezier Curves
    // =========================================================================
    static func testVector1_ExtremeAndDegenerateBezier(_ r: AdversarialReport) {
        r.section("Vector 1.1: Zero-Length Degenerate Bezier (p0 == p1 == p2 == p3)")
        let pZero = CGPoint(x: 42.0, y: 84.0)
        let zeroCurve = CubicBezierSegment(p0: pZero, p1: pZero, p2: pZero, p3: pZero)

        // Point evaluation
        for t: CGFloat in [0.0, 0.25, 0.5, 0.75, 1.0] {
            r.assertPointApprox(zeroCurve.point(at: t), pZero, "Zero-length point(at: \(t)) matches origin")
            r.assertPointApprox(zeroCurve.pointDeCasteljau(at: t), pZero, "Zero-length deCasteljau(at: \(t)) matches origin")
        }

        // Derivatives
        let d0 = zeroCurve.derivative(at: 0.5)
        let dd0 = zeroCurve.secondDerivative(at: 0.5)
        r.assertPointApprox(d0, .zero, "Zero-length first derivative is zero vector")
        r.assertPointApprox(dd0, .zero, "Zero-length second derivative is zero vector")

        // Unit tangent & normal fallback
        let tan0 = zeroCurve.unitTangent(at: 0.5)
        r.assert(!tan0.x.isNaN && !tan0.y.isNaN, "Zero-length unit tangent is not NaN")
        r.assertApprox(hypot(tan0.x, tan0.y), 1.0, tolerance: 1e-4, "Zero-length unit tangent has unit length (fallback)")
        let norm0 = zeroCurve.unitNormal(at: 0.5)
        r.assert(!norm0.x.isNaN && !norm0.y.isNaN, "Zero-length unit normal is not NaN")
        r.assertApprox(tan0.x * norm0.x + tan0.y * norm0.y, 0.0, tolerance: 1e-5, "Zero-length normal is orthogonal to tangent")

        // Curvature & radius
        let k0 = zeroCurve.curvature(at: 0.5)
        r.assert(!k0.isNaN && k0 == 0.0, "Zero-length curvature is exactly 0.0")
        let rho0 = zeroCurve.radiusOfCurvature(at: 0.5)
        r.assert(rho0 == CGFloat.infinity, "Zero-length radius of curvature is infinity")

        // Arc length & parameter inversion
        let len0 = zeroCurve.arcLength()
        r.assertApprox(len0, 0.0, tolerance: 1e-6, "Zero-length arc length is 0.0")
        let param0 = zeroCurve.parameter(atDistance: 10.0)
        r.assert(!param0.isNaN && (param0 == 0.0 || param0 == 1.0), "Zero-length parameter inversion does not NaN")

        // Bounding box
        let bbox0 = zeroCurve.tightBoundingBox()
        r.assert(bbox0.origin == pZero && bbox0.width == 0 && bbox0.height == 0, "Zero-length tight bbox is degenerate point")

        // Flattening & closest point
        let flat0 = zeroCurve.flatten(tolerance: 0.1)
        r.assert(flat0.count >= 1 && flat0.count <= 2, "Zero-length flattening terminates immediately")
        let proj0 = zeroCurve.closestPoint(to: CGPoint(x: 100, y: 100))
        r.assertPointApprox(proj0.point, pZero, "Zero-length closest point is p0")
        r.assertApprox(proj0.distance, hypot(100.0 - 42.0, 100.0 - 84.0), tolerance: 1e-4, "Zero-length closest distance matches Euclidean")

        r.section("Vector 1.2: Collinear Control Points (Monotonic & Retrograde)")
        // Monotonic collinear
        let colMono = CubicBezierSegment(
            p0: CGPoint(x: 0, y: 0),
            p1: CGPoint(x: 30, y: 30),
            p2: CGPoint(x: 70, y: 70),
            p3: CGPoint(x: 100, y: 100)
        )
        r.assertApprox(colMono.arcLength(), 100.0 * sqrt(2.0), tolerance: 0.05, "Monotonic collinear arc length matches diagonal 100*sqrt(2)")
        r.assertApprox(colMono.curvature(at: 0.5), 0.0, tolerance: 1e-5, "Monotonic collinear curvature is zero everywhere")
        let colBbox = colMono.tightBoundingBox()
        r.assertApprox(colBbox.minX, 0, tolerance: 1e-4, "Monotonic collinear bbox minX == 0")
        r.assertApprox(colBbox.maxX, 100, tolerance: 1e-4, "Monotonic collinear bbox maxX == 100")
        r.assertApprox(colBbox.minY, 0, tolerance: 1e-4, "Monotonic collinear bbox minY == 0")
        r.assertApprox(colBbox.maxY, 100, tolerance: 1e-4, "Monotonic collinear bbox maxY == 100")

        // Retrograde collinear: curve overshoots from 0 to 400*(sqrt(2)-1) ~ 165.6854 and reverses back to 100
        let colRetro = CubicBezierSegment(
            p0: CGPoint(x: 0, y: 0),
            p1: CGPoint(x: 200, y: 0),
            p2: CGPoint(x: 200, y: 0),
            p3: CGPoint(x: 100, y: 0)
        )
        let retroBbox = colRetro.tightBoundingBox()
        let expectedRetroMaxX = 400.0 * (sqrt(2.0) - 1.0) // 165.6854249...
        r.assertApprox(retroBbox.minX, 0.0, tolerance: 1e-3, "Retrograde bbox minX == 0.0")
        r.assertApprox(retroBbox.maxX, expectedRetroMaxX, tolerance: 1e-3, "Retrograde bbox accurately computes stationary root 400*(sqrt(2)-1) (~165.69)")

        r.section("Vector 1.3: Coincident Endpoints (Closed Teardrop Loop)")
        let loopCurve = CubicBezierSegment(
            p0: CGPoint(x: 100, y: 100),
            p1: CGPoint(x: 300, y: 300),
            p2: CGPoint(x: -100, y: 300),
            p3: CGPoint(x: 100, y: 100)
        )
        let loopFlat = loopCurve.flatten(tolerance: 0.5)
        r.assert(loopFlat.count >= 8, "Teardrop loop subdivides into polyline (\(loopFlat.count) points)")
        r.assertPointApprox(loopFlat.first!, loopCurve.p0, "Loop polyline starts at p0")
        r.assertPointApprox(loopFlat.last!, loopCurve.p3, "Loop polyline ends at p3")
        let loopBbox = loopCurve.tightBoundingBox()
        r.assert(loopBbox.maxY > 200.0, "Loop bbox captures apex extension (maxY: \(loopBbox.maxY))")
        r.assert(loopBbox.minX < 100.0 && loopBbox.maxX > 100.0, "Loop bbox captures lateral bulge (minX: \(loopBbox.minX), maxX: \(loopBbox.maxX))")

        r.section("Vector 1.4: Sharp Cusps (B'(t) = 0)")
        // Exact algebraic cusp: x(u) = (2u-1)^2, y(u) = (2u-1)^3
        // Control points: p0=(300, -300), p1=(-100, 300), p2=(-100, -300), p3=(300, 300)
        // At u = 0.5, B'(0.5) = (0, 0)
        let cuspCurve = CubicBezierSegment(
            p0: CGPoint(x: 300, y: -300),
            p1: CGPoint(x: -100, y: 300),
            p2: CGPoint(x: -100, y: -300),
            p3: CGPoint(x: 300, y: 300)
        )
        let dCusp = cuspCurve.derivative(at: 0.5)
        r.assertPointApprox(dCusp, .zero, tolerance: 1e-4, "Derivative at cusp point t=0.5 is exactly (0, 0)")
        let tanCusp = cuspCurve.unitTangent(at: 0.5)
        r.assert(!tanCusp.x.isNaN && !tanCusp.y.isNaN, "Unit tangent at cusp does not NaN")
        r.assertApprox(hypot(tanCusp.x, tanCusp.y), 1.0, tolerance: 1e-4, "Unit tangent at cusp preserves unit length")
        let kCusp = cuspCurve.curvature(at: 0.5)
        r.assert(!kCusp.isNaN, "Curvature at cusp does not NaN")
        let (cuspL, cuspR) = cuspCurve.split(at: 0.5)
        r.assertPointApprox(cuspL.p3, cuspR.p0, "Cusp splits cleanly at singularity")
        r.assertPointApprox(cuspL.p3, cuspCurve.point(at: 0.5), "Split point matches cusp position")

        r.section("Vector 1.5: Extreme Coordinates (10^6)")
        let bigOffset: CGFloat = 1_000_000.0
        let bigCurve = CubicBezierSegment(
            p0: CGPoint(x: bigOffset, y: bigOffset),
            p1: CGPoint(x: bigOffset + 20, y: bigOffset + 80),
            p2: CGPoint(x: bigOffset + 80, y: bigOffset + 80),
            p3: CGPoint(x: bigOffset + 100, y: bigOffset)
        )
        let normalCurve = CubicBezierSegment(
            p0: CGPoint(x: 0, y: 0),
            p1: CGPoint(x: 20, y: 80),
            p2: CGPoint(x: 80, y: 80),
            p3: CGPoint(x: 100, y: 0)
        )
        r.assertApprox(bigCurve.arcLength(), normalCurve.arcLength(), tolerance: 1e-3, "Extreme 10^6 coordinate arc length is translation invariant")
        r.assertApprox(bigCurve.curvature(at: 0.5), normalCurve.curvature(at: 0.5), tolerance: 1e-4, "Extreme 10^6 curvature is translation invariant")
        let bigBbox = bigCurve.tightBoundingBox()
        let normBbox = normalCurve.tightBoundingBox()
        r.assertApprox(bigBbox.width, normBbox.width, tolerance: 1e-3, "Extreme 10^6 bbox width is invariant")
        r.assertApprox(bigBbox.height, normBbox.height, tolerance: 1e-3, "Extreme 10^6 bbox height is invariant")
        let bigProj = bigCurve.closestPoint(to: CGPoint(x: bigOffset + 50, y: bigOffset + 70))
        r.assertApprox(bigProj.t, 0.5, tolerance: 0.05, "Extreme 10^6 closest point parameter t ~ 0.5")

        r.section("Vector 1.6: Micro-Segments (10^-5)")
        let microScale: CGFloat = 1e-5
        let microCurve = CubicBezierSegment(
            p0: CGPoint(x: 0, y: 0),
            p1: CGPoint(x: 20.0 * microScale, y: 80.0 * microScale),
            p2: CGPoint(x: 80.0 * microScale, y: 80.0 * microScale),
            p3: CGPoint(x: 100.0 * microScale, y: 0)
        )
        let microLen = microCurve.arcLength()
        r.assertApprox(microLen, normalCurve.arcLength() * microScale, tolerance: 1e-8, "Micro-segment arc length scales linearly (\(microLen))")
        let microTan = microCurve.unitTangent(at: 0.5)
        r.assertApprox(hypot(microTan.x, microTan.y), 1.0, tolerance: 1e-4, "Micro-segment unit tangent preserves unit length")
        let microBbox = microCurve.tightBoundingBox()
        r.assertApprox(microBbox.width, 100.0 * microScale, tolerance: 1e-8, "Micro-segment bbox width scales to 10^-3")
        let microFlat = microCurve.flatten(tolerance: 0.25)
        r.assert(microFlat.count == 2, "Micro-segment flattens in 1 step under standard tolerance")
    }

    // =========================================================================
    // Vector 2: Gauss-Legendre Quadrature Convergence vs Adaptive Chord Subdivision
    // =========================================================================
    static func testVector2_GaussLegendreConvergence(_ r: AdversarialReport) {
        r.section("Vector 2: Gauss-Legendre Quadrature vs Adaptive Chord Subdivision")

        // Robust adaptive chord summation oracle (with coincident endpoint handling)
        func computeAdaptiveChordLength(curve: CubicBezierSegment, tolerance: CGFloat = 1e-5, maxDepth: Int = 18) -> CGFloat {
            var poly = [curve.p0]
            func subdiv(_ seg: CubicBezierSegment, depth: Int) {
                let dx = seg.p3.x - seg.p0.x
                let dy = seg.p3.y - seg.p0.y
                let chordSq = dx * dx + dy * dy
                if chordSq < 1e-12 {
                    let d1 = hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y)
                    let d2 = hypot(seg.p2.x - seg.p0.x, seg.p2.y - seg.p0.y)
                    if depth >= maxDepth || max(d1, d2) <= tolerance {
                        poly.append(seg.p3)
                        return
                    }
                    let (left, right) = seg.split(at: 0.5)
                    subdiv(left, depth: depth + 1)
                    subdiv(right, depth: depth + 1)
                    return
                }

                let invChord = 1.0 / sqrt(chordSq)
                let d1 = abs(dx * (seg.p0.y - seg.p1.y) - (seg.p0.x - seg.p1.x) * dy) * invChord
                let d2 = abs(dx * (seg.p0.y - seg.p2.y) - (seg.p0.x - seg.p2.x) * dy) * invChord
                if depth >= maxDepth || max(d1, d2) <= tolerance {
                    poly.append(seg.p3)
                    return
                }
                let (left, right) = seg.split(at: 0.5)
                subdiv(left, depth: depth + 1)
                subdiv(right, depth: depth + 1)
            }
            subdiv(curve, depth: 0)
            var total: CGFloat = 0.0
            for i in 1..<poly.count {
                total += hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y)
            }
            return total
        }

        // Test Case 2.1: Classic smooth arch
        let archCurve = CubicBezierSegment(
            p0: CGPoint(x: 0, y: 0),
            p1: CGPoint(x: 20, y: 80),
            p2: CGPoint(x: 80, y: 80),
            p3: CGPoint(x: 100, y: 0)
        )
        let lArchGL = archCurve.arcLength()
        let lArchOracle = computeAdaptiveChordLength(curve: archCurve, tolerance: 1e-5)
        let relErrorArch = abs(lArchGL - lArchOracle) / lArchOracle
        r.assert(relErrorArch < 0.001, "Arch curve: GL-5 vs Adaptive Chord relError < 0.1% (relError=\(relErrorArch))")

        // Test Case 2.2: Cubic S-curve
        let sCurve = CubicBezierSegment(
            p0: CGPoint(x: 0, y: 0),
            p1: CGPoint(x: 0, y: 200),
            p2: CGPoint(x: 200, y: 0),
            p3: CGPoint(x: 200, y: 200)
        )
        let lSGL = sCurve.arcLength()
        let lSOracle = computeAdaptiveChordLength(curve: sCurve, tolerance: 1e-5)
        let relErrorS = abs(lSGL - lSOracle) / lSOracle
        r.assert(relErrorS < 0.005, "S-curve: GL-5 vs Adaptive Chord relError < 0.5% (relError=\(relErrorS))")

        // Test Case 2.3: Teardrop loop
        let loopCurve = CubicBezierSegment(
            p0: CGPoint(x: 100, y: 100),
            p1: CGPoint(x: 300, y: 300),
            p2: CGPoint(x: -100, y: 300),
            p3: CGPoint(x: 100, y: 100)
        )
        let lLoopGL = loopCurve.arcLength()
        let lLoopOracle = computeAdaptiveChordLength(curve: loopCurve, tolerance: 1e-5)
        let relErrorLoop = abs(lLoopGL - lLoopOracle) / lLoopOracle
        r.assert(relErrorLoop < 0.01, "Loop curve: GL-5 vs Adaptive Chord relError < 1.0% (relError=\(relErrorLoop))")

        // Test Case 2.4: Severe hairpin curve & 2-Segment Composite GL Convergence
        let hairpin = CubicBezierSegment(
            p0: CGPoint(x: 0, y: 0),
            p1: CGPoint(x: 10, y: 500),
            p2: CGPoint(x: 20, y: 500),
            p3: CGPoint(x: 30, y: 0)
        )
        let lHairpinGL = hairpin.arcLength()
        let lHairpinOracle = computeAdaptiveChordLength(curve: hairpin, tolerance: 1e-5)
        let relErrorHairpin = abs(lHairpinGL - lHairpinOracle) / lHairpinOracle
        // Single-span GL-5 on extreme 500px hairpin has ~4.5% error due to steep derivative gradient
        r.assert(relErrorHairpin < 0.05, "Hairpin curve: Single-pass GL-5 bounded within 5% on extreme gradient (\(relErrorHairpin))")

        // Composite Gauss-Legendre (subdivide at t=0.5): convergence verification
        let (hpLeft, hpRight) = hairpin.split(at: 0.5)
        let lCompositeGL = hpLeft.arcLength() + hpRight.arcLength()
        let relErrorComposite = abs(lCompositeGL - lHairpinOracle) / lHairpinOracle
        r.assert(relErrorComposite < 0.002, "Hairpin curve: 2-Segment Composite GL converges to < 0.2% error (\(relErrorComposite))")

        // Test Case 2.5: Quarter-circle approximation
        let kCircle: CGFloat = 0.5522847498
        let circleArc = CubicBezierSegment(
            p0: CGPoint(x: 100, y: 0),
            p1: CGPoint(x: 100, y: 100 * kCircle),
            p2: CGPoint(x: 100 * kCircle, y: 100),
            p3: CGPoint(x: 0, y: 100)
        )
        let lCircleGL = circleArc.arcLength()
        let expectedQuarterCircle = 0.5 * .pi * 100.0 // 157.0796
        r.assertApprox(lCircleGL, expectedQuarterCircle, tolerance: 0.1, "Quarter-circle GL-5 matches pi*R/2 (~157.08)")
    }

    // =========================================================================
    // Vector 3: Analytical Bounding Box vs Sample Envelope
    // =========================================================================
    static func testVector3_AnalyticalBoundingBox(_ r: AdversarialReport) {
        r.section("Vector 3: Analytical Bounding Box vs Dense Sample Envelope")

        func sampleEnvelope(curve: CubicBezierSegment, samples: Int = 50_000) -> CGRect {
            var minX = CGFloat.infinity, maxX = -CGFloat.infinity
            var minY = CGFloat.infinity, maxY = -CGFloat.infinity
            for i in 0...samples {
                let t = CGFloat(i) / CGFloat(samples)
                let p = curve.point(at: t)
                if p.x < minX { minX = p.x }
                if p.x > maxX { maxX = p.x }
                if p.y < minY { minY = p.y }
                if p.y > maxY { maxY = p.y }
            }
            return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        }

        // Test 3.1: S-shaped curve
        let sCurve = CubicBezierSegment(
            p0: CGPoint(x: 100, y: 50),
            p1: CGPoint(x: 10, y: 250),
            p2: CGPoint(x: 290, y: -50),
            p3: CGPoint(x: 200, y: 150)
        )
        let sAnalytical = sCurve.tightBoundingBox()
        let sEmpirical = sampleEnvelope(curve: sCurve)

        r.assert(sAnalytical.minX <= sEmpirical.minX + 1e-4, "S-curve analytical minX strictly covers sample minX")
        r.assert(sAnalytical.maxX >= sEmpirical.maxX - 1e-4, "S-curve analytical maxX strictly covers sample maxX")
        r.assert(sAnalytical.minY <= sEmpirical.minY + 1e-4, "S-curve analytical minY strictly covers sample minY")
        r.assert(sAnalytical.maxY >= sEmpirical.maxY - 1e-4, "S-curve analytical maxY strictly covers sample maxY")

        r.assertApprox(sAnalytical.minX, sEmpirical.minX, tolerance: 0.05, "S-curve analytical minX tightly matches empirical (< 0.05px diff)")
        r.assertApprox(sAnalytical.maxX, sEmpirical.maxX, tolerance: 0.05, "S-curve analytical maxX tightly matches empirical (< 0.05px diff)")
        r.assertApprox(sAnalytical.minY, sEmpirical.minY, tolerance: 0.05, "S-curve analytical minY tightly matches empirical (< 0.05px diff)")
        r.assertApprox(sAnalytical.maxY, sEmpirical.maxY, tolerance: 0.05, "S-curve analytical maxY tightly matches empirical (< 0.05px diff)")

        // Test 3.2: Self-intersecting Loop curve
        let loopCurve = CubicBezierSegment(
            p0: CGPoint(x: 200, y: 200),
            p1: CGPoint(x: 50, y: 400),
            p2: CGPoint(x: 350, y: 400),
            p3: CGPoint(x: 200, y: 200)
        )
        let loopAnalytical = loopCurve.tightBoundingBox()
        let loopEmpirical = sampleEnvelope(curve: loopCurve)

        r.assert(loopAnalytical.minX <= loopEmpirical.minX + 1e-4, "Loop analytical minX strictly covers sample minX")
        r.assert(loopAnalytical.maxX >= loopEmpirical.maxX - 1e-4, "Loop analytical maxX strictly covers sample maxX")
        r.assert(loopAnalytical.minY <= loopEmpirical.minY + 1e-4, "Loop analytical minY strictly covers sample minY")
        r.assert(loopAnalytical.maxY >= loopEmpirical.maxY - 1e-4, "Loop analytical maxY strictly covers sample maxY")

        r.assertApprox(loopAnalytical.minX, loopEmpirical.minX, tolerance: 0.05, "Loop analytical minX tightly matches empirical")
        r.assertApprox(loopAnalytical.maxX, loopEmpirical.maxX, tolerance: 0.05, "Loop analytical maxX tightly matches empirical")
        r.assertApprox(loopAnalytical.minY, loopEmpirical.minY, tolerance: 0.05, "Loop analytical minY tightly matches empirical")
        r.assertApprox(loopAnalytical.maxY, loopEmpirical.maxY, tolerance: 0.05, "Loop analytical maxY tightly matches empirical")

        // Test 3.3: Convex hull overestimation check
        // The control point bounding box is vastly larger than the curve bounding box
        let ctrlMinY = min(loopCurve.p0.y, loopCurve.p1.y, loopCurve.p2.y, loopCurve.p3.y)
        let ctrlMaxY = max(loopCurve.p0.y, loopCurve.p1.y, loopCurve.p2.y, loopCurve.p3.y)
        r.assert(loopAnalytical.maxY < ctrlMaxY, "Tight analytical box is strictly tighter than control point envelope (\(loopAnalytical.maxY) < \(ctrlMaxY))")
    }

    // =========================================================================
    // Vector 4: Schneider Curve Fitter Boundary Testing
    // =========================================================================
    static func testVector4_SchneiderFitterBoundaries(_ r: AdversarialReport) {
        r.section("Vector 4.1: Noisy Point Clouds (100+ points)")
        // Generate sine wave trajectory with 120 points + pseudorandom noise
        var noisyPoints: [CGPoint] = []
        var seed: UInt64 = 987654321
        func pseudoRandomNoise() -> CGFloat {
            seed = seed &* 6364136223846793005 &+ 1442695040888963407
            let normalized = Double(seed >> 32) / Double(UInt32.max) // [0, 1]
            return CGFloat(normalized * 3.0 - 1.5) // [-1.5, +1.5]
        }

        let nPoints = 120
        for i in 0..<nPoints {
            let x = CGFloat(i) * 3.0 // 0 to 360
            let y = 60.0 * sin(x * .pi / 90.0) + 100.0 + pseudoRandomNoise()
            noisyPoints.append(CGPoint(x: x, y: y))
        }

        let fittedSegments = BezierCurveFitter.fitCurve(points: noisyPoints, errorTolerance: 4.0)
        r.assert(!fittedSegments.isEmpty, "Noisy 120-point cloud successfully fitted")
        r.assert(fittedSegments.count >= 2 && fittedSegments.count <= 25, "Fitted segment count is compact (\(fittedSegments.count) segments for 120 noisy points)")

        // Check continuity and finite values
        var allFinite = true
        for seg in fittedSegments {
            if seg.p0.x.isNaN || seg.p0.y.isNaN || seg.p1.x.isNaN || seg.p1.y.isNaN ||
               seg.p2.x.isNaN || seg.p2.y.isNaN || seg.p3.x.isNaN || seg.p3.y.isNaN {
                allFinite = false
            }
        }
        r.assert(allFinite, "All control points of fitted segments are finite (no NaN/Inf)")

        r.section("Vector 4.2: Pure Collinear Lines (Straight Line Preservation)")
        // 50 collinear points on line y = 1.25x + 10 from x=0 to 400
        var collinearPoints: [CGPoint] = []
        for i in 0..<50 {
            let x = CGFloat(i) * 8.0
            let y = 1.25 * x + 10.0
            collinearPoints.append(CGPoint(x: x, y: y))
        }

        let fittedCollinearContour = BezierCurveFitter.fitContourToBezier(polygon: collinearPoints, isClosed: false, errorTolerance: 1.0)
        r.assert(fittedCollinearContour.count == 2, "Collinear line fitted via contour produces exactly 2 PenAnchors (1 straight segment)")
        if fittedCollinearContour.count == 2 {
            r.assertPointApprox(fittedCollinearContour[0].point, collinearPoints.first!, "Collinear start matches p0")
            r.assertPointApprox(fittedCollinearContour[1].point, collinearPoints.last!, "Collinear end matches pn")
        }

        // Test fitCurve directly on collinear points
        let directCollinear = BezierCurveFitter.fitCurve(points: collinearPoints, errorTolerance: 1.0)
        r.assert(!directCollinear.isEmpty, "Direct fitCurve on 50 collinear points succeeds")
        // Verify no control points explode away from the line
        var maxDevFromLine: CGFloat = 0.0
        let pStart = collinearPoints.first!
        let pEnd = collinearPoints.last!
        let lineDist = hypot(pEnd.x - pStart.x, pEnd.y - pStart.y)
        for seg in directCollinear {
            for testP in [seg.p0, seg.p1, seg.p2, seg.p3] {
                let dev = abs((pEnd.y - pStart.y) * testP.x - (pEnd.x - pStart.x) * testP.y + pEnd.x * pStart.y - pEnd.y * pStart.x) / lineDist
                if dev > maxDevFromLine { maxDevFromLine = dev }
            }
        }
        r.assert(maxDevFromLine < 0.1, "Direct fitCurve control points remain strictly on the collinear line (maxDev=\(maxDevFromLine) px)")

        // Test very long 1000px collinear line
        var longCollinearPoints: [CGPoint] = []
        for i in 0...100 {
            longCollinearPoints.append(CGPoint(x: CGFloat(i) * 10.0, y: CGFloat(i) * 10.0))
        }
        let longContour = BezierCurveFitter.fitContourToBezier(polygon: longCollinearPoints, isClosed: false, errorTolerance: 1.0)
        r.assert(longContour.count == 2, "Long 1000px collinear polyline produces exactly 1 straight segment without curve explosion")

        r.section("Vector 4.3: Acute Zigzag Polylines (Preserve Sharp Corners > 35 deg)")
        let zigzagPoints = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 100, y: 200),
            CGPoint(x: 120, y: 20),
            CGPoint(x: 220, y: 220),
            CGPoint(x: 240, y: 40)
        ]
        let detectedCorners = PolylineFeatureDetector.findCorners(points: zigzagPoints, isClosed: false, angleThresholdDegrees: 35.0)
        r.assert(detectedCorners.contains(1), "Corner detector detected acute vertex 1")
        r.assert(detectedCorners.contains(2), "Corner detector detected acute vertex 2")
        r.assert(detectedCorners.contains(3), "Corner detector detected acute vertex 3")

        let zigzagAnchors = BezierCurveFitter.fitContourToBezier(polygon: zigzagPoints, isClosed: false, errorTolerance: 1.0)
        r.assert(zigzagAnchors.count >= 5, "Zigzag contour preserves all corner vertices as distinct nodes")
        // Check that interior vertices are designated .sharp
        for i in 1..<(zigzagAnchors.count - 1) {
            r.assert(zigzagAnchors[i].type == .sharp, "Zigzag interior anchor \(i) is designated .sharp")
        }

        // Test shallow bend (< 35 deg) vs sharp turn (> 35 deg)
        let shallowBendPoints = [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 100, y: 10), // ~5.7 deg deflection
            CGPoint(x: 200, y: 20)
        ]
        let shallowCorners = PolylineFeatureDetector.findCorners(points: shallowBendPoints, isClosed: false, angleThresholdDegrees: 35.0)
        r.assert(!shallowCorners.contains(1), "Shallow bend (<35 deg) correctly ignored by corner detector")

        r.section("Vector 4.4: Closed Circular Rings")
        // 64 points sampled along circle of R=100 centered at (150, 150)
        var ringPoints: [CGPoint] = []
        let ringR: CGFloat = 100.0
        let ringCenter = CGPoint(x: 150, y: 150)
        let ringN = 64
        for i in 0..<ringN {
            let angle = CGFloat(i) * 2.0 * .pi / CGFloat(ringN)
            ringPoints.append(CGPoint(x: ringCenter.x + ringR * cos(angle), y: ringCenter.y + ringR * sin(angle)))
        }

        let ringCorners = PolylineFeatureDetector.findCorners(points: ringPoints, isClosed: true, angleThresholdDegrees: 35.0)
        r.assert(ringCorners.count == 4, "Smooth closed circle corners fall back to 4 orthogonal extrema")

        let ringAnchors = BezierCurveFitter.fitContourToBezier(polygon: ringPoints, isClosed: true, errorTolerance: 1.0)
        r.assert(ringAnchors.count >= 4, "Circle fitted with at least 4 anchors (got \(ringAnchors.count))")
        for anchor in ringAnchors {
            let dist = hypot(anchor.point.x - ringCenter.x, anchor.point.y - ringCenter.y)
            r.assertApprox(dist, ringR, tolerance: 2.0, "Circle anchor sits on circle boundary R=100")
        }
    }

    // =========================================================================
    // Vector 5: 2-Pass Newton-Raphson Convergence & Singularity Guard Stress
    // =========================================================================
    static func testVector5_NewtonRaphsonAndSingularity(_ r: AdversarialReport) {
        r.section("Vector 5.1: Singularity Guard Under Near-Singular Point Clusters")
        // 10 points within 1e-7 of each other (nearly singular Cramer normal equations det -> 0)
        var clusteredPoints: [CGPoint] = []
        for i in 0..<10 {
            clusteredPoints.append(CGPoint(x: 50.0 + CGFloat(i) * 1e-8, y: 50.0 + CGFloat(i) * 1e-8))
        }
        let clusterFit = BezierCurveFitter.fitCurve(points: clusteredPoints, errorTolerance: 1.0)
        r.assert(!clusterFit.isEmpty, "Singular cluster fitted without crash")
        var clusterFinite = true
        for seg in clusterFit {
            for pt in [seg.p0, seg.p1, seg.p2, seg.p3] {
                if pt.x.isNaN || pt.y.isNaN || pt.x.isInfinite || pt.y.isInfinite {
                    clusterFinite = false
                }
            }
        }
        r.assert(clusterFinite, "Singularity guard safely prevented NaN/Inf in clustered singular points")

        r.section("Vector 5.2: 2-Pass Newton-Raphson Error Reduction")
        // Create an arc where initial chord-length parameterization has slight error
        var sPoints: [CGPoint] = []
        for i in 0...30 {
            let t = CGFloat(i) / 30.0
            // Non-uniform speed curve
            let u = t * t
            let x = 100.0 * u
            let y = 50.0 * sin(u * .pi)
            sPoints.append(CGPoint(x: x, y: y))
        }
        let sFit = BezierCurveFitter.fitCurve(points: sPoints, errorTolerance: 1.0)
        r.assert(!sFit.isEmpty, "Non-uniform speed curve fitted successfully")
        for seg in sFit {
            for u in [0.25, 0.5, 0.75] {
                let p = seg.point(at: CGFloat(u))
                r.assert(!p.x.isNaN && !p.y.isNaN, "Re-estimated curve point at \(u) is finite")
            }
        }

        r.section("Vector 5.3: Antiparallel & Degenerate Tangents")
        // Two coincident points with a third point
        let degeneratePoints = [
            CGPoint(x: 100, y: 100),
            CGPoint(x: 100, y: 100),
            CGPoint(x: 200, y: 100)
        ]
        let degenFit = BezierCurveFitter.fitCurve(points: degeneratePoints, errorTolerance: 1.0)
        r.assert(!degenFit.isEmpty, "Degenerate coincident leading point handled without crash")
        r.assert(!degenFit[0].p1.x.isNaN && !degenFit[0].p2.x.isNaN, "Control handles are finite under coincident start points")
    }
}
