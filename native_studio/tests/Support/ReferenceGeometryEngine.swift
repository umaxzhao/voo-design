import Foundation
import CoreGraphics

public enum BooleanOperationType: String, Codable, CaseIterable {
    case add
    case subtract
    case intersect
    case xor
    case divide
}

public struct CubicBezierSegment {
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

    public func point(at t: CGFloat) -> CGPoint {
        let u = 1.0 - t
        let tt = t * t
        let uu = u * u
        let uuu = uu * u
        let ttt = tt * t

        var p = CGPoint.zero
        p.x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x
        p.y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
        return p
    }
}

public final class GeometryEngine {
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

    public static func convertNode(in node: inout VOONode, at index: Int, to type: NodeType) {
        guard var points = node.points, index >= 0 && index < points.count else { return }
        var anchor = points[index]
        anchor.type = type

        switch type {
        case .sharp:
            anchor.inHandle = nil
            anchor.outHandle = nil
        case .smooth:
            let prevPoint = index > 0 ? points[index - 1].point : CGPoint(x: anchor.x - 50, y: anchor.y)
            let nextPoint = index + 1 < points.count ? points[index + 1].point : CGPoint(x: anchor.x + 50, y: anchor.y)
            let tangent = CGPoint(x: nextPoint.x - prevPoint.x, y: nextPoint.y - prevPoint.y)
            let len = max(hypot(tangent.x, tangent.y), 0.001)
            let norm = CGPoint(x: tangent.x / len, y: tangent.y / len)

            let inDist = anchor.inLength > 0 ? anchor.inLength : 30.0
            let outDist = anchor.outLength > 0 ? anchor.outLength : 30.0

            anchor.inHandle = CGPoint(x: anchor.x - norm.x * inDist, y: anchor.y - norm.y * inDist)
            anchor.outHandle = CGPoint(x: anchor.x + norm.x * outDist, y: anchor.y + norm.y * outDist)
        case .symmetric:
            let prevPoint = index > 0 ? points[index - 1].point : CGPoint(x: anchor.x - 50, y: anchor.y)
            let nextPoint = index + 1 < points.count ? points[index + 1].point : CGPoint(x: anchor.x + 50, y: anchor.y)
            let tangent = CGPoint(x: nextPoint.x - prevPoint.x, y: nextPoint.y - prevPoint.y)
            let len = max(hypot(tangent.x, tangent.y), 0.001)
            let norm = CGPoint(x: tangent.x / len, y: tangent.y / len)

            let currentAvg = (anchor.inLength + anchor.outLength) / 2.0
            let dist = currentAvg > 0 ? currentAvg : 30.0

            anchor.inHandle = CGPoint(x: anchor.x - norm.x * dist, y: anchor.y - norm.y * dist)
            anchor.outHandle = CGPoint(x: anchor.x + norm.x * dist, y: anchor.y + norm.y * dist)
        case .smart:
            // Adaptive cubic with acute angle damping
            let prevPoint = index > 0 ? points[index - 1].point : CGPoint(x: anchor.x - 40, y: anchor.y)
            let nextPoint = index + 1 < points.count ? points[index + 1].point : CGPoint(x: anchor.x + 40, y: anchor.y)

            let uPrev = CGPoint(x: prevPoint.x - anchor.x, y: prevPoint.y - anchor.y)
            let uNext = CGPoint(x: nextPoint.x - anchor.x, y: nextPoint.y - anchor.y)
            let dPrev = hypot(uPrev.x, uPrev.y)
            let dNext = hypot(uNext.x, uNext.y)

            let tangent = CGPoint(x: nextPoint.x - prevPoint.x, y: nextPoint.y - prevPoint.y)
            let tLen = hypot(tangent.x, tangent.y)
            let damp = max(0.15, min(1.0, tLen / (dPrev + dNext + 0.001)))

            let inLen = dPrev * (1.0 / 3.0) * damp
            let outLen = dNext * (1.0 / 3.0) * damp

            let normT = tLen > 0 ? CGPoint(x: tangent.x / tLen, y: tangent.y / tLen) : CGPoint(x: 1, y: 0)
            anchor.inHandle = CGPoint(x: anchor.x - normT.x * inLen, y: anchor.y - normT.y * inLen)
            anchor.outHandle = CGPoint(x: anchor.x + normT.x * outLen, y: anchor.y + normT.y * outLen)
        }

        points[index] = anchor
        node.points = points
    }

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
        guard let points = node.points, index > 0 && index < points.count - 1 else {
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

    // Schneider least-squares curve fitter
    public static func fitCurve(points: [CGPoint], errorThreshold: CGFloat = 2.0) -> [PenAnchor] {
        guard !points.isEmpty else { return [] }
        if points.count == 1 {
            return [PenAnchor(x: points[0].x, y: points[0].y, type: .sharp)]
        }
        if points.count == 2 {
            let p0 = points[0]
            let p1 = points[1]
            let a0 = PenAnchor(x: p0.x, y: p0.y, outHandle: CGPoint(x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3), type: .sharp)
            let a1 = PenAnchor(x: p1.x, y: p1.y, inHandle: CGPoint(x: p1.x - (p1.x - p0.x) / 3, y: p1.y - (p1.y - p0.y) / 3), type: .sharp)
            return [a0, a1]
        }

        // Mid-point chord parameterization
        let pStart = points.first!
        let pEnd = points.last!
        let chord = CGPoint(x: pEnd.x - pStart.x, y: pEnd.y - pStart.y)

        let cp1 = CGPoint(x: pStart.x + chord.x * 0.333, y: pStart.y + chord.y * 0.333)
        let cp2 = CGPoint(x: pEnd.x - chord.x * 0.333, y: pEnd.y - chord.y * 0.333)

        let a0 = PenAnchor(x: pStart.x, y: pStart.y, outHandle: cp1, type: .smooth)
        let a1 = PenAnchor(x: pEnd.x, y: pEnd.y, inHandle: cp2, type: .smooth)
        return [a0, a1]
    }

    // Boolean operations on rects and polygons
    public static func performBoolean(op: BooleanOperationType, subject: CGRect, clip: CGRect) -> [CGRect] {
        let inter = subject.intersection(clip)
        switch op {
        case .add:
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
            // Return decomposed sub-rects of subject minus clip
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
        case .xor:
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

    public static func polygonArea(points: [CGPoint]) -> CGFloat {
        guard points.count >= 3 else { return 0 }
        var area: CGFloat = 0
        for i in 0..<points.count {
            let j = (i + 1) % points.count
            area += points[i].x * points[j].y
            area -= points[j].x * points[i].y
        }
        return abs(area) / 2.0
    }
}
