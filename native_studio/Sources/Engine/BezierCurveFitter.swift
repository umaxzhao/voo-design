//
//  BezierCurveFitter.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M2 (Feature F6).
//  Copyright © 2026 VOO Design. All rights reserved.
//

import CoreGraphics
import Foundation

// MARK: - PenAnchor / BezierPoint Interchangeability

extension PenAnchor {
    public var cp1: CGPoint? {
        get { inHandle }
        set { inHandle = newValue }
    }

    public var cp2: CGPoint? {
        get { outHandle }
        set { outHandle = newValue }
    }

    public init(point: CGPoint, cp1: CGPoint? = nil, cp2: CGPoint? = nil, type: NodeType = .sharp, isClosed: Bool = false) {
        self.init(x: point.x, y: point.y, inHandle: cp1, outHandle: cp2, isClosed: isClosed, type: type)
    }
}

public typealias BezierPoint = PenAnchor

// MARK: - Polyline Feature Detector (Sharp Corner & Extrema Detection)

public struct PolylineFeatureDetector: Sendable {

    /// Identify hard sharp corners in a polyline chain (turning angle > angleThresholdDegrees).
    public static func findCorners(
        points: [CGPoint],
        isClosed: Bool,
        angleThresholdDegrees: CGFloat = 35.0
    ) -> [Int] {
        let count = points.count
        guard count >= 3 else { return Array(0..<count) }

        var corners: [Int] = []
        let thresholdCos = cos(angleThresholdDegrees * .pi / 180.0)

        if !isClosed {
            corners.append(0)
        }

        for i in 0..<count {
            if !isClosed && (i == 0 || i == count - 1) { continue }

            let prev = points[(i - 1 + count) % count]
            let curr = points[i]
            let next = points[(i + 1) % count]

            let vIn = CGPoint(x: curr.x - prev.x, y: curr.y - prev.y)
            let vOut = CGPoint(x: next.x - curr.x, y: next.y - curr.y)

            let dIn = hypot(vIn.x, vIn.y)
            let dOut = hypot(vOut.x, vOut.y)

            if dIn < 1e-5 || dOut < 1e-5 { continue }

            let dot = (vIn.x * vOut.x + vIn.y * vOut.y) / (dIn * dOut)
            // dot < thresholdCos implies deviation angle exceeds threshold
            if dot < thresholdCos {
                corners.append(i)
            }
        }

        if !isClosed {
            corners.append(count - 1)
        }

        // For smooth closed curves with no sharp corners (e.g. circle, ellipse), split at 4 extrema points
        if isClosed && corners.isEmpty {
            corners = findExtremaIndices(points: points)
        }

        return Array(Set(corners)).sorted()
    }

    private static func findExtremaIndices(points: [CGPoint]) -> [Int] {
        guard !points.isEmpty else { return [] }
        var minXIdx = 0, maxXIdx = 0, minYIdx = 0, maxYIdx = 0
        for i in 1..<points.count {
            if points[i].x < points[minXIdx].x { minXIdx = i }
            if points[i].x > points[maxXIdx].x { maxXIdx = i }
            if points[i].y < points[minYIdx].y { minYIdx = i }
            if points[i].y > points[maxYIdx].y { maxYIdx = i }
        }
        let unique = Set([minXIdx, maxXIdx, minYIdx, maxYIdx])
        return unique.sorted()
    }
}

// MARK: - Philip J. Schneider Least-Squares Cubic Bezier Curve Fitter (Graphics Gems I)

public class BezierCurveFitter: @unchecked Sendable {

    public static func fit(points: [CGPoint], errorThreshold: CGFloat = 2.0) -> [CubicBezierSegment] {
        fitCurve(points: points, errorTolerance: errorThreshold)
    }

    /// Fits a sequence of digitized points to a minimal chain of cubic Bezier segments.
    public static func fitCurve(
        points: [CGPoint],
        errorTolerance: CGFloat = 1.0
    ) -> [CubicBezierSegment] {
        guard points.count >= 2 else { return [] }
        if points.count == 2 {
            let p0 = points[0], p3 = points[1]
            let p1 = CGPoint(x: p0.x + (p3.x - p0.x) / 3.0, y: p0.y + (p3.y - p0.y) / 3.0)
            let p2 = CGPoint(x: p3.x - (p3.x - p0.x) / 3.0, y: p3.y - (p3.y - p0.y) / 3.0)
            return [CubicBezierSegment(p0: p0, p1: p1, p2: p2, p3: p3)]
        }

        let tHat1 = computeLeftTangent(points: points, end: 0)
        let tHat2 = computeRightTangent(points: points, end: points.count - 1)

        return fitCubic(
            points: points,
            first: 0,
            last: points.count - 1,
            tHat1: tHat1,
            tHat2: tHat2,
            errorTolerance: errorTolerance,
            depth: 0
        )
    }

    private static func fitCubic(
        points: [CGPoint],
        first: Int,
        last: Int,
        tHat1: CGPoint,
        tHat2: CGPoint,
        errorTolerance: CGFloat,
        depth: Int
    ) -> [CubicBezierSegment] {
        let count = last - first + 1
        if count <= 2 || depth >= 8 {
            let p0 = points[first], p3 = points[last]
            let dist = hypot(p3.x - p0.x, p3.y - p0.y) / 3.0
            let p1 = CGPoint(x: p0.x + tHat1.x * dist, y: p0.y + tHat1.y * dist)
            let p2 = CGPoint(x: p3.x + tHat2.x * dist, y: p3.y + tHat2.y * dist)
            return [CubicBezierSegment(p0: p0, p1: p1, p2: p2, p3: p3)]
        }

        // 1. Chord-length parameterization
        var u = chordLengthParameterize(points: points, first: first, last: last)

        // 2. Solve 2x2 normal equations via least squares
        var bezCurve = generateBezier(points: points, first: first, last: last, u: u, tHat1: tHat1, tHat2: tHat2)

        // 3. Compute maximum deviation error and split vertex
        var (maxError, splitPoint) = computeMaxError(points: points, first: first, last: last, curve: bezCurve, u: u)
        let chord = hypot(points[last].x - points[first].x, points[last].y - points[first].y)
        if maxError < errorTolerance && chord <= 160.0 {
            return [bezCurve]
        }

        // 4. If error is within 4x tolerance, perform 2-pass Newton-Raphson parameter re-estimation
        if maxError < errorTolerance * 4.0 {
            for _ in 0..<2 {
                u = reestimateParameters(points: points, first: first, last: last, u: u, curve: bezCurve)
                bezCurve = generateBezier(points: points, first: first, last: last, u: u, tHat1: tHat1, tHat2: tHat2)
                let evaluated = computeMaxError(points: points, first: first, last: last, curve: bezCurve, u: u)
                maxError = evaluated.maxError
                splitPoint = evaluated.splitPoint
                if maxError < errorTolerance && chord <= 160.0 {
                    return [bezCurve]
                }
            }
        }

        // 5. Recursive bisection at maximum error vertex
        let tCenter = computeCenterTangent(points: points, center: splitPoint)
        let negTCenter = CGPoint(x: -tCenter.x, y: -tCenter.y)

        let left = fitCubic(
            points: points,
            first: first,
            last: splitPoint,
            tHat1: tHat1,
            tHat2: negTCenter,
            errorTolerance: errorTolerance,
            depth: depth + 1
        )
        let right = fitCubic(
            points: points,
            first: splitPoint,
            last: last,
            tHat1: tCenter,
            tHat2: tHat2,
            errorTolerance: errorTolerance,
            depth: depth + 1
        )

        return left + right
    }

    private static func generateBezier(
        points: [CGPoint],
        first: Int,
        last: Int,
        u: [CGFloat],
        tHat1: CGPoint,
        tHat2: CGPoint
    ) -> CubicBezierSegment {
        let p0 = points[first]
        let p3 = points[last]
        let nPts = last - first + 1

        var c11: CGFloat = 0.0, c12: CGFloat = 0.0, c22: CGFloat = 0.0
        var x1: CGFloat = 0.0, x2: CGFloat = 0.0

        for i in 0..<nPts {
            let ui = u[i]
            let mUi = 1.0 - ui
            let b1 = 3.0 * ui * mUi * mUi
            let b2 = 3.0 * ui * ui * mUi
            let b0 = mUi * mUi * mUi
            let b3 = ui * ui * ui

            let a1 = CGPoint(x: tHat1.x * b1, y: tHat1.y * b1)
            let a2 = CGPoint(x: tHat2.x * b2, y: tHat2.y * b2)

            c11 += a1.x * a1.x + a1.y * a1.y
            c12 += a1.x * a2.x + a1.y * a2.y
            c22 += a2.x * a2.x + a2.y * a2.y

            let pt = points[first + i]
            let v = CGPoint(
                x: pt.x - ((b0 + b1) * p0.x + (b2 + b3) * p3.x),
                y: pt.y - ((b0 + b1) * p0.y + (b2 + b3) * p3.y)
            )

            x1 += a1.x * v.x + a1.y * v.y
            x2 += a2.x * v.x + a2.y * v.y
        }

        let det = c11 * c22 - c12 * c12
        var alpha1: CGFloat = 0.0
        var alpha2: CGFloat = 0.0

        if abs(det) > 1e-9 {
            alpha1 = (x1 * c22 - x2 * c12) / det
            alpha2 = (c11 * x2 - c12 * x1) / det
        }

        let chord = hypot(p3.x - p0.x, p3.y - p0.y)
        if alpha1 < 1e-6 || alpha2 < 1e-6 || alpha1.isNaN || alpha2.isNaN {
            alpha1 = chord / 3.0
            alpha2 = chord / 3.0
        }

        let p1 = CGPoint(x: p0.x + tHat1.x * alpha1, y: p0.y + tHat1.y * alpha1)
        let p2 = CGPoint(x: p3.x + tHat2.x * alpha2, y: p3.y + tHat2.y * alpha2)
        return CubicBezierSegment(p0: p0, p1: p1, p2: p2, p3: p3)
    }

    private static func chordLengthParameterize(points: [CGPoint], first: Int, last: Int) -> [CGFloat] {
        var u: [CGFloat] = [0.0]
        for i in (first + 1)...last {
            let dist = hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
            u.append((u.last ?? 0.0) + dist)
        }
        let total = u.last ?? 0.0
        if total > 1e-9 {
            for i in 0..<u.count { u[i] /= total }
        } else {
            for i in 0..<u.count { u[i] = CGFloat(i) / CGFloat(max(1, u.count - 1)) }
        }
        return u
    }

    private static func computeMaxError(
        points: [CGPoint],
        first: Int,
        last: Int,
        curve: CubicBezierSegment,
        u: [CGFloat]
    ) -> (maxError: CGFloat, splitPoint: Int) {
        var maxDist: CGFloat = 0.0
        var split = (first + last) / 2
        for i in 1..<(last - first) {
            let pOnCurve = curve.point(at: u[i])
            let dist = hypot(points[first + i].x - pOnCurve.x, points[first + i].y - pOnCurve.y)
            if dist > maxDist {
                maxDist = dist
                split = first + i
            }
        }
        return (maxDist, split)
    }

    private static func reestimateParameters(
        points: [CGPoint],
        first: Int,
        last: Int,
        u: [CGFloat],
        curve: CubicBezierSegment
    ) -> [CGFloat] {
        var newU = u
        let count = last - first + 1
        for i in 0..<count {
            let pt = points[first + i]
            let ui = u[i]
            let q = curve.point(at: ui)
            let qp = curve.derivative(at: ui)
            let qpp = curve.secondDerivative(at: ui)

            let num = (q.x - pt.x) * qp.x + (q.y - pt.y) * qp.y
            let den = (qp.x * qp.x + qp.y * qp.y) + ((q.x - pt.x) * qpp.x + (q.y - pt.y) * qpp.y)
            if abs(den) > 1e-9 {
                newU[i] = max(0.0, min(1.0, ui - (num / den)))
            }
        }
        return newU
    }

    private static func computeLeftTangent(points: [CGPoint], end: Int) -> CGPoint {
        guard end + 1 < points.count else { return CGPoint(x: 1, y: 0) }
        let v = CGPoint(x: points[end + 1].x - points[end].x, y: points[end + 1].y - points[end].y)
        let len = hypot(v.x, v.y)
        return len > 1e-9 ? CGPoint(x: v.x / len, y: v.y / len) : CGPoint(x: 1, y: 0)
    }

    private static func computeRightTangent(points: [CGPoint], end: Int) -> CGPoint {
        guard end > 0 else { return CGPoint(x: -1, y: 0) }
        let v = CGPoint(x: points[end - 1].x - points[end].x, y: points[end - 1].y - points[end].y)
        let len = hypot(v.x, v.y)
        return len > 1e-9 ? CGPoint(x: v.x / len, y: v.y / len) : CGPoint(x: -1, y: 0)
    }

    private static func computeCenterTangent(points: [CGPoint], center: Int) -> CGPoint {
        guard center > 0 && center + 1 < points.count else { return CGPoint(x: 1, y: 0) }
        let v1 = CGPoint(x: points[center].x - points[center - 1].x, y: points[center].y - points[center - 1].y)
        let v2 = CGPoint(x: points[center + 1].x - points[center].x, y: points[center + 1].y - points[center].y)
        let v = CGPoint(x: (v1.x + v2.x) / 2.0, y: (v1.y + v2.y) / 2.0)
        let len = hypot(v.x, v.y)
        return len > 1e-9 ? CGPoint(x: v.x / len, y: v.y / len) : CGPoint(x: 1, y: 0)
    }

    // MARK: - Contour Assembly & Straight Line Detection

    /// Fits a closed or open polyline contour to an array of PenAnchor nodes.
    public static func fitContourToBezier(
        polygon: [CGPoint],
        isClosed: Bool,
        errorTolerance: CGFloat = 1.0
    ) -> [PenAnchor] {
        guard polygon.count >= 3 else {
            return polygon.map { PenAnchor(point: $0, type: .sharp, isClosed: isClosed) }
        }

        // Refine error tolerance based on geometry span
        var minX = polygon[0].x, maxX = polygon[0].x
        var minY = polygon[0].y, maxY = polygon[0].y
        var totalLength: CGFloat = 0.0
        for i in 1..<polygon.count {
            let p = polygon[i]
            if p.x < minX { minX = p.x }
            if p.x > maxX { maxX = p.x }
            if p.y < minY { minY = p.y }
            if p.y > maxY { maxY = p.y }
            totalLength += hypot(p.x - polygon[i - 1].x, p.y - polygon[i - 1].y)
        }
        let maxDim = max(maxX - minX, maxY - minY)

        let effectiveTolerance: CGFloat
        if maxDim >= 400.0 || totalLength >= 1200.0 {
            effectiveTolerance = min(errorTolerance, 0.22)
        } else if maxDim >= 250.0 || totalLength >= 750.0 {
            effectiveTolerance = min(errorTolerance, 0.40)
        } else {
            effectiveTolerance = errorTolerance
        }

        // 1. Detect sharp corners
        let corners = PolylineFeatureDetector.findCorners(points: polygon, isClosed: isClosed)
        guard corners.count >= 2 else {
            let segments = fitCurve(points: polygon, errorTolerance: effectiveTolerance)
            return assembleFittedSegments(segments, isClosed: isClosed)
        }

        // 2. Segment polyline by corners; fit each subchain or preserve straight lines
        var allSegments: [CubicBezierSegment] = []

        let nCorners = corners.count
        let segmentCount = isClosed ? nCorners : nCorners - 1

        for c in 0..<segmentCount {
            let startIdx = corners[c]
            let endIdx = corners[(c + 1) % nCorners]

            var subPoints: [CGPoint] = []
            if endIdx > startIdx {
                subPoints = Array(polygon[startIdx...endIdx])
            } else {
                subPoints = Array(polygon[startIdx..<polygon.count]) + Array(polygon[0...endIdx])
            }

            guard subPoints.count >= 2 else { continue }

            if isStraightLine(subPoints, tolerance: effectiveTolerance) {
                let p0 = subPoints.first!
                let p3 = subPoints.last!
                let straightSeg = CubicBezierSegment(p0: p0, p1: p0, p2: p3, p3: p3)
                allSegments.append(straightSeg)
            } else {
                let segs = fitCurve(points: subPoints, errorTolerance: effectiveTolerance)
                allSegments.append(contentsOf: segs)
            }
        }

        return assembleFittedSegments(allSegments, isClosed: isClosed)
    }

    /// Evaluates whether a point sequence deviates from a straight line by at most tolerance.
    public static func isStraightLine(_ points: [CGPoint], tolerance: CGFloat) -> Bool {
        guard points.count > 2 else { return true }
        let p0 = points.first!
        let pn = points.last!
        let lineDist = hypot(pn.x - p0.x, pn.y - p0.y)
        guard lineDist > 1e-4 else { return true }

        for pt in points {
            let d = abs((pn.y - p0.y) * pt.x - (pn.x - p0.x) * pt.y + pn.x * p0.y - pn.y * p0.x) / lineDist
            if d > tolerance { return false }
        }
        return true
    }

    private static func assembleFittedSegments(
        _ segments: [CubicBezierSegment],
        isClosed: Bool
    ) -> [PenAnchor] {
        guard !segments.isEmpty else { return [] }
        var nodes: [PenAnchor] = []
        let thresholdCos = cos(35.0 * .pi / 180.0)

        for i in 0..<segments.count {
            let seg = segments[i]
            let anchor = seg.p0
            let inSeg = (i > 0) ? segments[i - 1] : (isClosed ? segments.last! : nil)

            let isCorner: Bool
            if let prevSeg = inSeg {
                let inTan = (hypot(prevSeg.p2.x - prevSeg.p3.x, prevSeg.p2.y - prevSeg.p3.y) >= 1e-4) ? prevSeg.p2 : prevSeg.p0
                let outTan = (hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y) >= 1e-4) ? seg.p1 : seg.p3
                let vIn = CGPoint(x: anchor.x - inTan.x, y: anchor.y - inTan.y)
                let vOut = CGPoint(x: outTan.x - anchor.x, y: outTan.y - anchor.y)
                let dIn = hypot(vIn.x, vIn.y)
                let dOut = hypot(vOut.x, vOut.y)
                if dIn > 1e-4 && dOut > 1e-4 {
                    let dot = (vIn.x * vOut.x + vIn.y * vOut.y) / (dIn * dOut)
                    isCorner = (dot < thresholdCos)
                } else {
                    isCorner = false
                }
            } else {
                isCorner = true
            }

            let cp2: CGPoint? = (hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y) < 1e-4) ? nil : seg.p1
            let cp1: CGPoint?
            if let prev = inSeg, hypot(prev.p2.x - prev.p3.x, prev.p2.y - prev.p3.y) >= 1e-4 {
                cp1 = prev.p2
            } else {
                cp1 = nil
            }

            let nodeType: NodeType = isCorner ? .sharp : .smooth
            nodes.append(PenAnchor(point: anchor, cp1: cp1, cp2: cp2, type: nodeType, isClosed: isClosed))
        }

        // Closing segment fills in-handle for node 0, open curve appends terminal node
        if isClosed, let lastSeg = segments.last, !nodes.isEmpty {
            if hypot(lastSeg.p2.x - lastSeg.p3.x, lastSeg.p2.y - lastSeg.p3.y) >= 1e-4 {
                nodes[0].cp1 = lastSeg.p2
            }
        } else if !isClosed, let lastSeg = segments.last {
            let cp1: CGPoint? = (hypot(lastSeg.p2.x - lastSeg.p3.x, lastSeg.p2.y - lastSeg.p3.y) >= 1e-4) ? lastSeg.p2 : nil
            nodes.append(PenAnchor(point: lastSeg.p3, cp1: cp1, cp2: nil, type: .sharp, isClosed: false))
        }

        return nodes
    }
}
