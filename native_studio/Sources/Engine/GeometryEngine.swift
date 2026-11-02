//
//  GeometryEngine.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M2 (Feature F4, F5, F6).
//  Copyright © 2026 VOO Design. All rights reserved.
//

import CoreGraphics
import Foundation

// MARK: - 1. Line Segment Primitive

public struct LineSegment: Codable, Sendable, Equatable {
    public var p0: CGPoint
    public var p1: CGPoint

    public init(p0: CGPoint, p1: CGPoint) {
        self.p0 = p0
        self.p1 = p1
    }

    public var length: CGFloat {
        hypot(p1.x - p0.x, p1.y - p0.y)
    }

    public var unitTangent: CGPoint {
        let len = length
        guard len > 1e-9 else { return CGPoint(x: 1, y: 0) }
        return CGPoint(x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len)
    }

    public var unitNormal: CGPoint {
        let t = unitTangent
        return CGPoint(x: -t.y, y: t.x)
    }

    public func point(at t: CGFloat) -> CGPoint {
        let u = min(max(t, 0.0), 1.0)
        return CGPoint(x: p0.x + u * (p1.x - p0.x), y: p0.y + u * (p1.y - p0.y))
    }

    public func closestPoint(to p: CGPoint) -> (point: CGPoint, t: CGFloat, distance: CGFloat) {
        let dx = p1.x - p0.x
        let dy = p1.y - p0.y
        let lenSq = dx * dx + dy * dy
        if lenSq < 1e-9 {
            return (p0, 0.0, hypot(p.x - p0.x, p.y - p0.y))
        }
        let t = min(max(((p.x - p0.x) * dx + (p.y - p0.y) * dy) / lenSq, 0.0), 1.0)
        let pt = CGPoint(x: p0.x + t * dx, y: p0.y + t * dy)
        return (pt, t, hypot(p.x - pt.x, p.y - pt.y))
    }

    public var boundingBox: CGRect {
        let minX = min(p0.x, p1.x), maxX = max(p0.x, p1.x)
        let minY = min(p0.y, p1.y), maxY = max(p0.y, p1.y)
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }
}

// MARK: - 2. Quadratic Bezier Curve Segment

public struct QuadraticBezierSegment: Codable, Sendable, Equatable {
    public var p0: CGPoint
    public var p1: CGPoint
    public var p2: CGPoint

    public init(p0: CGPoint, p1: CGPoint, p2: CGPoint) {
        self.p0 = p0
        self.p1 = p1
        self.p2 = p2
    }

    public func point(at t: CGFloat) -> CGPoint {
        let u = min(max(t, 0.0), 1.0)
        let mt = 1.0 - u
        let x = mt * mt * p0.x + 2.0 * mt * u * p1.x + u * u * p2.x
        let y = mt * mt * p0.y + 2.0 * mt * u * p1.y + u * u * p2.y
        return CGPoint(x: x, y: y)
    }

    public func derivative(at t: CGFloat) -> CGPoint {
        let u = min(max(t, 0.0), 1.0)
        let mt = 1.0 - u
        let x = 2.0 * mt * (p1.x - p0.x) + 2.0 * u * (p2.x - p1.x)
        let y = 2.0 * mt * (p1.y - p0.y) + 2.0 * u * (p2.y - p1.y)
        return CGPoint(x: x, y: y)
    }

    /// Exact degree elevation to Cubic Bezier without approximation error.
    public func toCubic() -> CubicBezierSegment {
        let cp1 = CGPoint(x: p0.x + (2.0 / 3.0) * (p1.x - p0.x), y: p0.y + (2.0 / 3.0) * (p1.y - p0.y))
        let cp2 = CGPoint(x: p2.x + (2.0 / 3.0) * (p1.x - p2.x), y: p2.y + (2.0 / 3.0) * (p1.y - p2.y))
        return CubicBezierSegment(p0: p0, p1: cp1, p2: cp2, p3: p2)
    }

    public func tightBoundingBox() -> CGRect {
        var xVals = [p0.x, p2.x]
        var yVals = [p0.y, p2.y]

        let denomX = p0.x - 2.0 * p1.x + p2.x
        if abs(denomX) > 1e-9 {
            let tx = (p0.x - p1.x) / denomX
            if tx > 0.0 && tx < 1.0 { xVals.append(point(at: tx).x) }
        }

        let denomY = p0.y - 2.0 * p1.y + p2.y
        if abs(denomY) > 1e-9 {
            let ty = (p0.y - p1.y) / denomY
            if ty > 0.0 && ty < 1.0 { yVals.append(point(at: ty).y) }
        }

        let minX = xVals.min() ?? p0.x, maxX = xVals.max() ?? p2.x
        let minY = yVals.min() ?? p0.y, maxY = yVals.max() ?? p2.y
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }
}

// MARK: - 3. Cubic Bezier Curve Segment

public struct CubicBezierSegment: Codable, Sendable, Equatable {
    public var p0: CGPoint
    public var p1: CGPoint
    public var p2: CGPoint
    public var p3: CGPoint

    public init(p0: CGPoint, p1: CGPoint, p2: CGPoint, p3: CGPoint) {
        self.p0 = p0
        self.p1 = p1
        self.p2 = p2
        self.p3 = p3
    }

    // --- Dual Curve Evaluation ---

    /// Fast Bernstein O(1) polynomial evaluation.
    public func point(at t: CGFloat) -> CGPoint {
        let u = min(max(t, 0.0), 1.0)
        let mt = 1.0 - u
        let mt2 = mt * mt
        let mt3 = mt2 * mt
        let u2 = u * u
        let u3 = u2 * u

        let x = mt3 * p0.x + 3.0 * mt2 * u * p1.x + 3.0 * mt * u2 * p2.x + u3 * p3.x
        let y = mt3 * p0.y + 3.0 * mt2 * u * p1.y + 3.0 * mt * u2 * p2.y + u3 * p3.y
        return CGPoint(x: x, y: y)
    }

    /// Numerically stable de Casteljau pyramid recursion.
    public func pointDeCasteljau(at t: CGFloat) -> CGPoint {
        let u = min(max(t, 0.0), 1.0)
        let mt = 1.0 - u

        let q0x = mt * p0.x + u * p1.x, q0y = mt * p0.y + u * p1.y
        let q1x = mt * p1.x + u * p2.x, q1y = mt * p1.y + u * p2.y
        let q2x = mt * p2.x + u * p3.x, q2y = mt * p2.y + u * p3.y

        let r0x = mt * q0x + u * q1x, r0y = mt * q0y + u * q1y
        let r1x = mt * q1x + u * q2x, r1y = mt * q1y + u * q2y

        return CGPoint(x: mt * r0x + u * r1x, y: mt * r0y + u * r1y)
    }

    // --- Differential Geometry: Derivatives, Tangent, Normal, Curvature ---

    /// First derivative vector B'(t).
    public func derivative(at t: CGFloat) -> CGPoint {
        let u = min(max(t, 0.0), 1.0)
        let mt = 1.0 - u
        let c1 = 3.0 * mt * mt
        let c2 = 6.0 * mt * u
        let c3 = 3.0 * u * u

        let x = c1 * (p1.x - p0.x) + c2 * (p2.x - p1.x) + c3 * (p3.x - p2.x)
        let y = c1 * (p1.y - p0.y) + c2 * (p2.y - p1.y) + c3 * (p3.y - p2.y)
        return CGPoint(x: x, y: y)
    }

    /// Second derivative vector B''(t).
    public func secondDerivative(at t: CGFloat) -> CGPoint {
        let u = min(max(t, 0.0), 1.0)
        let mt = 1.0 - u
        let c1 = 6.0 * mt
        let c2 = 6.0 * u

        let x = c1 * (p2.x - 2.0 * p1.x + p0.x) + c2 * (p3.x - 2.0 * p2.x + p1.x)
        let y = c1 * (p2.y - 2.0 * p1.y + p0.y) + c2 * (p3.y - 2.0 * p2.y + p1.y)
        return CGPoint(x: x, y: y)
    }

    /// Unit tangent vector T̂(t) with degenerate cusp fallback.
    public func unitTangent(at t: CGFloat) -> CGPoint {
        let d = derivative(at: t)
        let len = hypot(d.x, d.y)
        if len > 1e-6 {
            return CGPoint(x: d.x / len, y: d.y / len)
        }

        // Degenerate cusp fallback
        if t <= 0.5 {
            let v = (hypot(p1.x - p0.x, p1.y - p0.y) > 1e-6) ? CGPoint(x: p1.x - p0.x, y: p1.y - p0.y) :
                    ((hypot(p2.x - p0.x, p2.y - p0.y) > 1e-6) ? CGPoint(x: p2.x - p0.x, y: p2.y - p0.y) : CGPoint(x: p3.x - p0.x, y: p3.y - p0.y))
            let l = hypot(v.x, v.y)
            return l > 1e-9 ? CGPoint(x: v.x / l, y: v.y / l) : CGPoint(x: 1, y: 0)
        } else {
            let v = (hypot(p3.x - p2.x, p3.y - p2.y) > 1e-6) ? CGPoint(x: p3.x - p2.x, y: p3.y - p2.y) :
                    ((hypot(p3.x - p1.x, p3.y - p1.y) > 1e-6) ? CGPoint(x: p3.x - p1.x, y: p3.y - p1.y) : CGPoint(x: p3.x - p0.x, y: p3.y - p0.y))
            let l = hypot(v.x, v.y)
            return l > 1e-9 ? CGPoint(x: v.x / l, y: v.y / l) : CGPoint(x: 1, y: 0)
        }
    }

    /// Unit normal vector N̂(t) = (-T_y, T_x).
    public func unitNormal(at t: CGFloat) -> CGPoint {
        let tan = unitTangent(at: t)
        return CGPoint(x: -tan.y, y: tan.x)
    }

    /// Signed curvature κ(t) = (x'y'' - y'x'') / (x'^2 + y'^2)^(3/2).
    public func curvature(at t: CGFloat) -> CGFloat {
        let d = derivative(at: t)
        let dd = secondDerivative(at: t)
        let speedSq = d.x * d.x + d.y * d.y
        if speedSq < 1e-9 { return 0.0 }
        let numerator = d.x * dd.y - d.y * dd.x
        return numerator / pow(speedSq, 1.5)
    }

    /// Radius of curvature ρ(t) = 1 / |κ(t)|.
    public func radiusOfCurvature(at t: CGFloat) -> CGFloat {
        let k = abs(curvature(at: t))
        return k > 1e-9 ? 1.0 / k : CGFloat.infinity
    }

    // --- Subdivision & Splitting ---

    /// Splits segment into two sub-curves at parameter t via de Casteljau.
    public func split(at t: CGFloat) -> (left: CubicBezierSegment, right: CubicBezierSegment) {
        let u = min(max(t, 0.0), 1.0)
        let mt = 1.0 - u

        let q0 = CGPoint(x: mt * p0.x + u * p1.x, y: mt * p0.y + u * p1.y)
        let q1 = CGPoint(x: mt * p1.x + u * p2.x, y: mt * p1.y + u * p2.y)
        let q2 = CGPoint(x: mt * p2.x + u * p3.x, y: mt * p2.y + u * p3.y)

        let r0 = CGPoint(x: mt * q0.x + u * q1.x, y: mt * q0.y + u * q1.y)
        let r1 = CGPoint(x: mt * q1.x + u * q2.x, y: mt * q1.y + u * q2.y)

        let s0 = CGPoint(x: mt * r0.x + u * r1.x, y: mt * r0.y + u * r1.y)

        let left = CubicBezierSegment(p0: p0, p1: q0, p2: r0, p3: s0)
        let right = CubicBezierSegment(p0: s0, p1: r1, p2: q2, p3: p3)
        return (left, right)
    }

    /// Subdivides segment across multiple sorted parameters t_1 < t_2 < ... < t_k.
    public func split(at parameters: [CGFloat]) -> [CubicBezierSegment] {
        let sortedT = parameters.filter { $0 > 1e-4 && $0 < 1.0 - 1e-4 }.sorted()
        guard !sortedT.isEmpty else { return [self] }

        var segments: [CubicBezierSegment] = []
        var current = self
        var lastT: CGFloat = 0.0

        for t in sortedT {
            let localT = (t - lastT) / (1.0 - lastT)
            let (left, right) = current.split(at: localT)
            segments.append(left)
            current = right
            lastT = t
        }
        segments.append(current)
        return segments
    }

    // --- Adaptive Polyline Flattening ---

    public func flatten(tolerance: CGFloat = 0.25, maxDepth: Int = 10) -> [CGPoint] {
        var points = [p0]
        subdivideFlatten(segment: self, tol: tolerance, depth: 0, maxDepth: maxDepth, result: &points)
        return points
    }

    private func subdivideFlatten(
        segment: CubicBezierSegment,
        tol: CGFloat,
        depth: Int,
        maxDepth: Int,
        result: inout [CGPoint]
    ) {
        if depth >= maxDepth || isFlat(segment: segment, tol: tol) {
            result.append(segment.p3)
            return
        }
        let (left, right) = segment.split(at: 0.5)
        subdivideFlatten(segment: left, tol: tol, depth: depth + 1, maxDepth: maxDepth, result: &result)
        subdivideFlatten(segment: right, tol: tol, depth: depth + 1, maxDepth: maxDepth, result: &result)
    }

    private func isFlat(segment: CubicBezierSegment, tol: CGFloat) -> Bool {
        let dx = segment.p3.x - segment.p0.x
        let dy = segment.p3.y - segment.p0.y
        let lenSq = dx * dx + dy * dy
        if lenSq < 1e-9 {
            let d1 = hypot(segment.p1.x - segment.p0.x, segment.p1.y - segment.p0.y)
            let d2 = hypot(segment.p2.x - segment.p0.x, segment.p2.y - segment.p0.y)
            return max(d1, d2) <= tol
        }
        let invLen = 1.0 / sqrt(lenSq)
        let d1 = abs(dx * (segment.p0.y - segment.p1.y) - (segment.p0.x - segment.p1.x) * dy) * invLen
        let d2 = abs(dx * (segment.p0.y - segment.p2.y) - (segment.p0.x - segment.p2.x) * dy) * invLen
        return max(d1, d2) <= tol
    }

    // --- Numerical Arc Length & Inversion (Gauss-Legendre 5-Point Quadrature) ---

    private static let glNodes: [CGFloat] = [
        0.0,
        -0.5384693101056831, 0.5384693101056831,
        -0.9061798459386640, 0.9061798459386640
    ]
    private static let glWeights: [CGFloat] = [
        0.5688888888888889,
        0.4786286704993665, 0.4786286704993665,
        0.2369268850561891, 0.2369268850561891
    ]

    public func arcLength(from a: CGFloat = 0.0, to b: CGFloat = 1.0) -> CGFloat {
        let t0 = min(max(a, 0.0), 1.0)
        let t1 = min(max(b, 0.0), 1.0)
        guard abs(t1 - t0) > 1e-9 else { return 0.0 }

        let halfDiff = (t1 - t0) * 0.5
        let halfSum = (t0 + t1) * 0.5
        var sum: CGFloat = 0.0

        for i in 0..<5 {
            let t = halfDiff * Self.glNodes[i] + halfSum
            let d = derivative(at: t)
            sum += Self.glWeights[i] * hypot(d.x, d.y)
        }

        return halfDiff * sum
    }

    /// Parameter inversion: finds t such that arcLength(0 ... t) == targetDistance.
    public func parameter(atDistance targetDist: CGFloat) -> CGFloat {
        let total = arcLength(from: 0.0, to: 1.0)
        if targetDist <= 0.0 || total < 1e-9 { return 0.0 }
        if targetDist >= total { return 1.0 }

        var t = targetDist / total
        for _ in 0..<5 {
            let distAtT = arcLength(from: 0.0, to: t)
            let err = distAtT - targetDist
            if abs(err) < 1e-4 { break }
            let d = derivative(at: t)
            let speed = hypot(d.x, d.y)
            if speed < 1e-6 { break }
            let nextT = t - (err / speed)
            t = min(max(nextT, 0.0), 1.0)
        }
        return t
    }

    // --- Tight Analytical Bounding Box ---

    public func tightBoundingBox() -> CGRect {
        var xVals = [p0.x, p3.x]
        var yVals = [p0.y, p3.y]

        // Solve dx/dt = a_x t^2 + b_x t + c_x = 0
        let ax = 3.0 * (-p0.x + 3.0 * p1.x - 3.0 * p2.x + p3.x)
        let bx = 6.0 * (p0.x - 2.0 * p1.x + p2.x)
        let cx = 3.0 * (p1.x - p0.x)
        solveQuadraticDerivativeRoots(a: ax, b: bx, c: cx).forEach { xVals.append(point(at: $0).x) }

        // Solve dy/dt = a_y t^2 + b_y t + c_y = 0
        let ay = 3.0 * (-p0.y + 3.0 * p1.y - 3.0 * p2.y + p3.y)
        let by = 6.0 * (p0.y - 2.0 * p1.y + p2.y)
        let cy = 3.0 * (p1.y - p0.y)
        solveQuadraticDerivativeRoots(a: ay, b: by, c: cy).forEach { yVals.append(point(at: $0).y) }

        let minX = xVals.min() ?? p0.x, maxX = xVals.max() ?? p3.x
        let minY = yVals.min() ?? p0.y, maxY = yVals.max() ?? p3.y
        return CGRect(x: minX, y: minY, width: max(0.0, maxX - minX), height: max(0.0, maxY - minY))
    }

    private func solveQuadraticDerivativeRoots(a: CGFloat, b: CGFloat, c: CGFloat) -> [CGFloat] {
        var roots: [CGFloat] = []
        if abs(a) < 1e-9 {
            if abs(b) > 1e-9 {
                let t = -c / b
                if t > 1e-5 && t < 1.0 - 1e-5 { roots.append(t) }
            }
        } else {
            let disc = b * b - 4.0 * a * c
            if disc >= 0.0 {
                let sqrtD = sqrt(disc)
                let t1 = (-b - sqrtD) / (2.0 * a)
                let t2 = (-b + sqrtD) / (2.0 * a)
                if t1 > 1e-5 && t1 < 1.0 - 1e-5 { roots.append(t1) }
                if t2 > 1e-5 && t2 < 1.0 - 1e-5 { roots.append(t2) }
            }
        }
        return roots
    }

    // --- Closest Point Projection ---

    public func closestPoint(to p: CGPoint) -> (point: CGPoint, t: CGFloat, distance: CGFloat) {
        // Coarse sampling: 16 equidistant parameter samples
        var bestT: CGFloat = 0.0
        var bestDist = CGFloat.infinity
        let samples = 16
        for i in 0...samples {
            let t = CGFloat(i) / CGFloat(samples)
            let pt = point(at: t)
            let d = hypot(pt.x - p.x, pt.y - p.y)
            if d < bestDist {
                bestDist = d
                bestT = t
            }
        }

        // Newton-Raphson refinement
        var t = bestT
        for _ in 0..<4 {
            let pt = point(at: t)
            let d1 = derivative(at: t)
            let d2 = secondDerivative(at: t)

            let diffX = pt.x - p.x
            let diffY = pt.y - p.y

            let f = 2.0 * (diffX * d1.x + diffY * d1.y)
            let fPrime = 2.0 * (d1.x * d1.x + d1.y * d1.y + diffX * d2.x + diffY * d2.y)

            if abs(fPrime) < 1e-9 { break }
            let nextT = min(max(t - (f / fPrime), 0.0), 1.0)
            t = nextT
        }

        let finalPt = point(at: t)
        let finalDist = hypot(finalPt.x - p.x, finalPt.y - p.y)

        // Compare against endpoints
        let d0 = hypot(p0.x - p.x, p0.y - p.y)
        let d1 = hypot(p3.x - p.x, p3.y - p.y)

        if d0 < finalDist && d0 <= d1 {
            return (p0, 0.0, d0)
        } else if d1 < finalDist {
            return (p3, 1.0, d1)
        }
        return (finalPt, t, finalDist)
    }
}

// MARK: - 4. Unified Geometry Engine

public final class GeometryEngine: @unchecked Sendable {

    // MARK: - Evaluators

    public static func evaluateCubic(p0: CGPoint, p1: CGPoint, p2: CGPoint, p3: CGPoint, t: CGFloat) -> CGPoint {
        let seg = CubicBezierSegment(p0: p0, p1: p1, p2: p2, p3: p3)
        return seg.point(at: t)
    }

    public static func evaluateBezier(points: [PenAnchor], t: CGFloat) -> CGPoint {
        guard !points.isEmpty else { return .zero }
        if points.count == 1 { return points[0].point }

        let clampedT = min(max(t, 0.0), 1.0)
        let segmentsCount = points.count - 1
        let segmentIndex = min(Int(clampedT * CGFloat(segmentsCount)), segmentsCount - 1)
        let localT = (clampedT * CGFloat(segmentsCount)) - CGFloat(segmentIndex)

        let a0 = points[segmentIndex]
        let a1 = points[segmentIndex + 1]

        let p0 = a0.point
        let p1 = a0.outHandle ?? p0
        let p2 = a1.inHandle ?? a1.point
        let p3 = a1.point

        return evaluateCubic(p0: p0, p1: p1, p2: p2, p3: p3, t: localT)
    }

    // MARK: - Node Handle Dynamic Conversions (Sharp, Smooth, Symmetric, Smart)

    public static func convertNode(in node: inout VOONode, at index: Int, to type: NodeType) {
        guard var points = node.points, index >= 0 && index < points.count else { return }
        var anchor = points[index]
        anchor.type = type

        let count = points.count
        let isClosed = points.last?.isClosed ?? false
        let curr = anchor.point

        switch type {
        case .sharp:
            anchor.inHandle = nil
            anchor.outHandle = nil

        case .smooth:
            let prevPoint = (index > 0) ? points[index - 1].point : (isClosed ? points[count - 1].point : CGPoint(x: curr.x - 50, y: curr.y))
            let nextPoint = (index + 1 < count) ? points[index + 1].point : (isClosed ? points[0].point : CGPoint(x: curr.x + 50, y: curr.y))

            let tangent = CGPoint(x: nextPoint.x - prevPoint.x, y: nextPoint.y - prevPoint.y)
            let len = hypot(tangent.x, tangent.y)
            let norm = (len > 1e-4) ? CGPoint(x: tangent.x / len, y: tangent.y / len) : CGPoint(x: 1, y: 0)

            let inDist = anchor.inLength > 0 ? anchor.inLength : 30.0
            let outDist = anchor.outLength > 0 ? anchor.outLength : 30.0

            anchor.inHandle = CGPoint(x: curr.x - norm.x * inDist, y: curr.y - norm.y * inDist)
            anchor.outHandle = CGPoint(x: curr.x + norm.x * outDist, y: curr.y + norm.y * outDist)

        case .symmetric:
            let prevPoint = (index > 0) ? points[index - 1].point : (isClosed ? points[count - 1].point : CGPoint(x: curr.x - 50, y: curr.y))
            let nextPoint = (index + 1 < count) ? points[index + 1].point : (isClosed ? points[0].point : CGPoint(x: curr.x + 50, y: curr.y))

            let tangent = CGPoint(x: nextPoint.x - prevPoint.x, y: nextPoint.y - prevPoint.y)
            let len = hypot(tangent.x, tangent.y)
            let norm = (len > 1e-4) ? CGPoint(x: tangent.x / len, y: tangent.y / len) : CGPoint(x: 1, y: 0)

            let currentAvg = (anchor.inLength + anchor.outLength) * 0.5
            let dist = currentAvg > 0 ? currentAvg : 30.0

            anchor.inHandle = CGPoint(x: curr.x - norm.x * dist, y: curr.y - norm.y * dist)
            anchor.outHandle = CGPoint(x: curr.x + norm.x * dist, y: curr.y + norm.y * dist)

        case .smart:
            let prevPoint = (index > 0) ? points[index - 1].point : (isClosed ? points[count - 1].point : CGPoint(x: curr.x - 40, y: curr.y))
            let nextPoint = (index + 1 < count) ? points[index + 1].point : (isClosed ? points[0].point : CGPoint(x: curr.x + 40, y: curr.y))

            let uPrev = CGPoint(x: prevPoint.x - curr.x, y: prevPoint.y - curr.y)
            let uNext = CGPoint(x: nextPoint.x - curr.x, y: nextPoint.y - curr.y)
            let dPrev = hypot(uPrev.x, uPrev.y)
            let dNext = hypot(uNext.x, uNext.y)

            let tangent = CGPoint(x: nextPoint.x - prevPoint.x, y: nextPoint.y - prevPoint.y)
            let tLen = hypot(tangent.x, tangent.y)
            let damp = max(0.15, min(1.0, tLen / (dPrev + dNext + 1e-4)))

            let inLen = dPrev * (1.0 / 3.0) * damp
            let outLen = dNext * (1.0 / 3.0) * damp

            let normT = tLen > 1e-4 ? CGPoint(x: tangent.x / tLen, y: tangent.y / tLen) : CGPoint(x: 1, y: 0)
            anchor.inHandle = CGPoint(x: curr.x - normT.x * inLen, y: curr.y - normT.y * inLen)
            anchor.outHandle = CGPoint(x: curr.x + normT.x * outLen, y: curr.y + normT.y * outLen)
        }

        points[index] = anchor
        node.points = points
    }

    // MARK: - Curve Topology Mutations

    public static func closeCurve(in node: inout VOONode) {
        guard var points = node.points, points.count >= 2 else { return }
        let p0 = points[0].point
        let pLast = points[points.count - 1].point
        let dist = hypot(p0.x - pLast.x, p0.y - pLast.y)

        if dist < 0.5 {
            points[points.count - 1] = points[0]
        }
        points[points.count - 1].isClosed = true
        node.points = points
    }

    public static func breakCurve(in node: inout VOONode, at index: Int) -> [VOONode] {
        guard let points = node.points, points.count >= 2 else {
            return [node]
        }
        let isClosed = points.last?.isClosed ?? false

        if isClosed {
            // Closed curve: split loop at index, returning single open curve
            let safeIndex = (index >= 0 && index < points.count) ? index : 0
            var newPoints: [PenAnchor] = []
            for i in 0..<points.count {
                let idx = (safeIndex + i) % points.count
                var p = points[idx]
                p.isClosed = false
                newPoints.append(p)
            }
            var closingAnchor = points[safeIndex]
            closingAnchor.isClosed = false
            closingAnchor.outHandle = nil
            newPoints[0].inHandle = nil
            newPoints.append(closingAnchor)

            var unwound = node
            unwound.points = newPoints
            return [unwound]
        } else {
            // Open curve: split into two separate paths at index
            guard index > 0 && index < points.count - 1 else {
                return [node]
            }
            var firstPart = Array(points[0...index])
            var secondPart = Array(points[index..<points.count])

            firstPart[firstPart.count - 1].outHandle = nil
            secondPart[0].inHandle = nil

            var n1 = node
            n1.id = UUID().uuidString
            n1.points = firstPart

            var n2 = node
            n2.id = UUID().uuidString
            n2.points = secondPart

            return [n1, n2]
        }
    }

    public static func reverseCurve(in node: inout VOONode) {
        guard let points = node.points else { return }
        var rev: [PenAnchor] = []
        for p in points.reversed() {
            var np = p
            np.inHandle = p.outHandle
            np.outHandle = p.inHandle
            rev.append(np)
        }
        node.points = rev
    }

    public static func smoothCurve(in node: inout VOONode) {
        guard let points = node.points, points.count >= 2 else { return }
        for i in 0..<points.count {
            convertNode(in: &node, at: i, to: .smooth)
        }
    }

    // MARK: - Schneider Curve Fitting

    public static func fitCurve(points: [CGPoint], errorThreshold: CGFloat = 2.0) -> [PenAnchor] {
        guard !points.isEmpty else { return [] }
        if points.count == 1 {
            return [PenAnchor(x: points[0].x, y: points[0].y, type: .sharp)]
        }
        if points.count == 2 {
            let p0 = points[0]
            let p1 = points[1]
            let a0 = PenAnchor(x: p0.x, y: p0.y, outHandle: CGPoint(x: p0.x + (p1.x - p0.x) / 3.0, y: p0.y + (p1.y - p0.y) / 3.0), type: .sharp)
            let a1 = PenAnchor(x: p1.x, y: p1.y, inHandle: CGPoint(x: p1.x - (p1.x - p0.x) / 3.0, y: p1.y - (p1.y - p0.y) / 3.0), type: .sharp)
            return [a0, a1]
        }

        return BezierCurveFitter.fitContourToBezier(polygon: points, isClosed: false, errorTolerance: errorThreshold)
    }

    // MARK: - Boolean Operations (Rect, CGPath, VOONode)

    public static func performBoolean(op: BooleanOperationType, subject: CGRect, clip: CGRect) -> [CGRect] {
        let inter = subject.intersection(clip)
        switch op {
        case .add, .union:
            if inter.isNull || inter.isEmpty {
                return [subject, clip]
            }
            return [subject.union(clip)]

        case .subtract:
            if inter.isNull || inter.isEmpty {
                return [subject]
            }
            if clip.contains(subject) {
                return []
            }
            var res: [CGRect] = []
            if subject.minY < inter.minY {
                res.append(CGRect(x: subject.minX, y: subject.minY, width: subject.width, height: inter.minY - subject.minY))
            }
            if subject.maxY > inter.maxY {
                res.append(CGRect(x: subject.minX, y: inter.maxY, width: subject.width, height: subject.maxY - inter.maxY))
            }
            if subject.minX < inter.minX {
                res.append(CGRect(x: subject.minX, y: inter.minY, width: inter.minX - subject.minX, height: inter.height))
            }
            if subject.maxX > inter.maxX {
                res.append(CGRect(x: inter.maxX, y: inter.minY, width: subject.maxX - inter.maxX, height: inter.height))
            }
            return res.isEmpty ? [subject] : res

        case .intersect:
            if inter.isNull || inter.isEmpty {
                return []
            }
            return [inter]

        case .xor, .exclude:
            if inter.isNull || inter.isEmpty {
                return [subject, clip]
            }
            let subA = performBoolean(op: .subtract, subject: subject, clip: clip)
            let subB = performBoolean(op: .subtract, subject: clip, clip: subject)
            return subA + subB

        case .divide:
            if inter.isNull || inter.isEmpty {
                return [subject, clip]
            }
            let subA = performBoolean(op: .subtract, subject: subject, clip: clip)
            let subB = performBoolean(op: .subtract, subject: clip, clip: subject)
            return [inter] + subA + subB
        }
    }

    public static func performBoolean(
        op: BooleanOperationType,
        subject: CGPath,
        clip: CGPath
    ) -> [CGPath] {
        let polyA = extractPolygonFromCGPath(subject)
        let polyB = extractPolygonFromCGPath(clip)

        let resultPolys = BooleanTopologyEngine.clipPolygons(polyA: polyA, polyB: polyB, op: op)
        return resultPolys.map { poly in
            let path = CGMutablePath()
            guard let first = poly.first else { return path }
            path.move(to: first)
            for pt in poly.dropFirst() {
                path.addLine(to: pt)
            }
            path.closeSubpath()
            return path
        }
    }

    public static func performBoolean(
        op: BooleanOperationType,
        subject: VOONode,
        clip: VOONode
    ) -> [VOONode] {
        BooleanTopologyEngine.performBoolean(op: op, subject: subject, clip: clip)
    }

    public static func polygonArea(points: [CGPoint]) -> CGFloat {
        abs(BooleanTopologyEngine.signedArea(points))
    }

    private static func extractPolygonFromCGPath(_ path: CGPath) -> [CGPoint] {
        var points: [CGPoint] = []
        path.applyWithBlock { element in
            switch element.pointee.type {
            case .moveToPoint:
                points.append(element.pointee.points[0])
            case .addLineToPoint:
                points.append(element.pointee.points[0])
            case .addQuadCurveToPoint:
                if let last = points.last {
                    let quad = QuadraticBezierSegment(p0: last, p1: element.pointee.points[0], p2: element.pointee.points[1])
                    points.append(contentsOf: quad.toCubic().flatten(tolerance: 0.5).dropFirst())
                } else {
                    points.append(element.pointee.points[1])
                }
            case .addCurveToPoint:
                if let last = points.last {
                    let cubic = CubicBezierSegment(p0: last, p1: element.pointee.points[0], p2: element.pointee.points[1], p3: element.pointee.points[2])
                    points.append(contentsOf: cubic.flatten(tolerance: 0.5).dropFirst())
                } else {
                    points.append(element.pointee.points[2])
                }
            case .closeSubpath:
                break
            @unknown default:
                break
            }
        }
        return BooleanTopologyEngine.normalizeWinding(points)
    }
}
