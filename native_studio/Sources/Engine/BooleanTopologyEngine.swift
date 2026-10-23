//
//  BooleanTopologyEngine.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M2 (Feature F5).
//  Copyright © 2026 VOO Design. All rights reserved.
//

import CoreGraphics
import Foundation

// MARK: - Circular Doubly Linked Topology Node

public final class ClipNode {
    public var point: CGPoint
    public var next: ClipNode!
    public var prev: ClipNode!

    public var isIntersection: Bool = false
    public weak var other: ClipNode?
    public var alpha: CGFloat = 0.0

    /// Outgoing edge traversal classification:
    /// true = enters the other polygon interior (Entry); false = exits to exterior (Exit)
    public var isEntry: Bool = false
    public var visited: Bool = false

    public init(point: CGPoint, isIntersection: Bool = false, alpha: CGFloat = 0.0) {
        self.point = point
        self.isIntersection = isIntersection
        self.alpha = alpha
    }
}

// MARK: - Circular Linked Polygon Graph

public final class ClipPolygon {
    public var head: ClipNode?
    public var count: Int = 0

    public init(points: [CGPoint]) {
        guard !points.isEmpty else { return }
        var current: ClipNode?
        for (i, pt) in points.enumerated() {
            let node = ClipNode(point: pt)
            if i == 0 {
                head = node
                current = node
            } else {
                current?.next = node
                node.prev = current
                current = node
            }
            count += 1
        }
        current?.next = head
        head?.prev = current
    }

    /// Inserts intersection node along original edge (startNode -> endNode) ordered monotonically by alpha ∈ [0, 1].
    public func insertIntersection(node: ClipNode, after startNode: ClipNode) {
        var curr = startNode
        while curr.next !== startNode && curr.next.isIntersection && curr.next.alpha < node.alpha {
            curr = curr.next
        }
        node.next = curr.next
        node.prev = curr
        curr.next.prev = node
        curr.next = node
        count += 1
    }

    /// Sever circular strong references to eliminate ARC memory leaks.
    public func cleanup() {
        guard let start = head else { return }
        var curr: ClipNode? = start
        var visitedNodes: Set<ObjectIdentifier> = []
        while let node = curr {
            let id = ObjectIdentifier(node)
            if visitedNodes.contains(id) { break }
            visitedNodes.insert(id)
            let nextNode = node.next
            node.next = nil
            node.prev = nil
            node.other = nil
            curr = nextNode
        }
        head = nil
        count = 0
    }
}

// MARK: - Midpoint-Sampled Greiner-Hormann Boolean Topology Engine

public class BooleanTopologyEngine: @unchecked Sendable {

    // MARK: - 1. Adaptive Bezier Curve Discretization
    public static func subdivideCubicBezier(
        p0: CGPoint, p1: CGPoint, p2: CGPoint, p3: CGPoint,
        tolerance: CGFloat = 0.5, depth: Int = 0
    ) -> [CGPoint] {
        if depth >= 8 || isSegmentFlat(p0: p0, p1: p1, p2: p2, p3: p3, tol: tolerance) {
            return [p3]
        }
        let m01 = midpoint(p0, p1)
        let m12 = midpoint(p1, p2)
        let m23 = midpoint(p2, p3)
        let m012 = midpoint(m01, m12)
        let m123 = midpoint(m12, m23)
        let m0123 = midpoint(m012, m123)

        var left = subdivideCubicBezier(p0: p0, p1: m01, p2: m012, p3: m0123, tolerance: tolerance, depth: depth + 1)
        let right = subdivideCubicBezier(p0: m0123, p1: m123, p2: m23, p3: p3, tolerance: tolerance, depth: depth + 1)
        left.append(contentsOf: right)
        return left
    }

    private static func isSegmentFlat(p0: CGPoint, p1: CGPoint, p2: CGPoint, p3: CGPoint, tol: CGFloat) -> Bool {
        let d1 = pointToLineDistance(point: p1, lineStart: p0, lineEnd: p3)
        let d2 = pointToLineDistance(point: p2, lineStart: p0, lineEnd: p3)
        return max(d1, d2) <= tol
    }

    private static func pointToLineDistance(point: CGPoint, lineStart: CGPoint, lineEnd: CGPoint) -> CGFloat {
        let dx = lineEnd.x - lineStart.x
        let dy = lineEnd.y - lineStart.y
        let lenSq = dx * dx + dy * dy
        if lenSq < 1e-9 {
            return hypot(point.x - lineStart.x, point.y - lineStart.y)
        }
        let cross = abs(dx * (lineStart.y - point.y) - (lineStart.x - point.x) * dy)
        return cross / sqrt(lenSq)
    }

    private static func midpoint(_ a: CGPoint, _ b: CGPoint) -> CGPoint {
        CGPoint(x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5)
    }

    // MARK: - 2. Extract Polygon Contour from VOONode
    public static func extractPolygon(from node: VOONode, tolerance: CGFloat = 0.5) -> [CGPoint] {
        let b = node.bounds
        switch node.kind {
        case .rect:
            if let radii = node.cornerRadii, (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0) {
                let maxR = min(b.width, b.height) / 2.0
                let rTL = min(radii.tl, maxR)
                let rTR = min(radii.tr, maxR)
                let rBR = min(radii.br, maxR)
                let rBL = min(radii.bl, maxR)
                var pts: [CGPoint] = []
                let steps = 8

                // Top-right corner
                for i in 0...steps {
                    let a = CGFloat(i) * (.pi / 2.0) / CGFloat(steps)
                    let px = b.maxX - rTR + rTR * sin(a)
                    let py = b.maxY - rTR + rTR * cos(a)
                    pts.append(CGPoint(x: px, y: py))
                }
                // Bottom-right corner
                for i in 0...steps {
                    let a = CGFloat(i) * (.pi / 2.0) / CGFloat(steps)
                    let px = b.maxX - rBR + rBR * cos(a)
                    let py = b.minY + rBR - rBR * sin(a)
                    pts.append(CGPoint(x: px, y: py))
                }
                // Bottom-left corner
                for i in 0...steps {
                    let a = CGFloat(i) * (.pi / 2.0) / CGFloat(steps)
                    let px = b.minX + rBL - rBL * sin(a)
                    let py = b.minY + rBL - rBL * cos(a)
                    pts.append(CGPoint(x: px, y: py))
                }
                // Top-left corner
                for i in 0...steps {
                    let a = CGFloat(i) * (.pi / 2.0) / CGFloat(steps)
                    let px = b.minX + rTL - rTL * cos(a)
                    let py = b.maxY - rTL + rTL * sin(a)
                    pts.append(CGPoint(x: px, y: py))
                }
                return normalizeWinding(pts)
            }
            return normalizeWinding([
                CGPoint(x: b.minX, y: b.minY),
                CGPoint(x: b.maxX, y: b.minY),
                CGPoint(x: b.maxX, y: b.maxY),
                CGPoint(x: b.minX, y: b.maxY)
            ])

        case .ellipse:
            var pts: [CGPoint] = []
            let cx = b.midX, cy = b.midY
            let rx = b.width / 2.0, ry = b.height / 2.0
            let count = 48
            for i in 0..<count {
                let theta = (CGFloat(i) / CGFloat(count)) * 2.0 * .pi
                pts.append(CGPoint(x: cx + rx * cos(theta), y: cy + ry * sin(theta)))
            }
            return normalizeWinding(pts)

        case .path:
            guard let anchors = node.points, anchors.count >= 2 else { return [] }
            var pts: [CGPoint] = [anchors[0].point]

            for i in 1..<anchors.count {
                let prev = anchors[i - 1]
                let curr = anchors[i]
                if let cp1 = prev.outHandle, let cp2 = curr.inHandle {
                    let sub = subdivideCubicBezier(p0: prev.point, p1: cp1, p2: cp2, p3: curr.point, tolerance: tolerance)
                    pts.append(contentsOf: sub)
                } else if let cp1 = prev.outHandle {
                    let sub = subdivideCubicBezier(p0: prev.point, p1: cp1, p2: curr.point, p3: curr.point, tolerance: tolerance)
                    pts.append(contentsOf: sub)
                } else if let cp2 = curr.inHandle {
                    let sub = subdivideCubicBezier(p0: prev.point, p1: prev.point, p2: cp2, p3: curr.point, tolerance: tolerance)
                    pts.append(contentsOf: sub)
                } else {
                    pts.append(curr.point)
                }
            }

            let isClosed = anchors.last?.isClosed ?? false
            if isClosed, let first = anchors.first, let last = anchors.last {
                if let cp1 = last.outHandle, let cp2 = first.inHandle {
                    let sub = subdivideCubicBezier(p0: last.point, p1: cp1, p2: cp2, p3: first.point, tolerance: tolerance)
                    pts.append(contentsOf: sub)
                } else if let cp1 = last.outHandle {
                    let sub = subdivideCubicBezier(p0: last.point, p1: cp1, p2: first.point, p3: first.point, tolerance: tolerance)
                    pts.append(contentsOf: sub)
                } else if let cp2 = first.inHandle {
                    let sub = subdivideCubicBezier(p0: last.point, p1: last.point, p2: cp2, p3: first.point, tolerance: tolerance)
                    pts.append(contentsOf: sub)
                }
            }
            return normalizeWinding(pts)

        default:
            return normalizeWinding([
                CGPoint(x: b.minX, y: b.minY),
                CGPoint(x: b.maxX, y: b.minY),
                CGPoint(x: b.maxX, y: b.maxY),
                CGPoint(x: b.minX, y: b.maxY)
            ])
        }
    }

    // MARK: - 3. Geometric Helpers & Winding Normalization
    public static func signedArea(_ points: [CGPoint]) -> CGFloat {
        guard points.count >= 3 else { return 0 }
        var area: CGFloat = 0.0
        let n = points.count
        for i in 0..<n {
            let j = (i + 1) % n
            area += points[i].x * points[j].y - points[j].x * points[i].y
        }
        return area * 0.5
    }

    public static func polygonArea(_ points: [CGPoint]) -> CGFloat {
        abs(signedArea(points))
    }

    public static func perform(
        operation: BooleanOperationType,
        subject: [CGPoint],
        clip: [CGPoint]
    ) -> [[CGPoint]] {
        clipPolygons(polyA: subject, polyB: clip, op: operation)
    }

    /// Normalizes polygon vertices to Counter-Clockwise (CCW) winding.
    public static func normalizeWinding(_ points: [CGPoint]) -> [CGPoint] {
        guard points.count >= 3 else { return points }
        var clean: [CGPoint] = []
        for pt in points {
            if let last = clean.last, hypot(pt.x - last.x, pt.y - last.y) < 0.1 {
                continue
            }
            clean.append(pt)
        }
        if clean.count >= 3, let first = clean.first, let last = clean.last, hypot(first.x - last.x, first.y - last.y) < 0.1 {
            clean.removeLast()
        }
        guard clean.count >= 3 else { return clean }
        let area = signedArea(clean)
        return (area < 0) ? clean.reversed() : clean
    }

    public static func pointInPolygon(point: CGPoint, poly: [CGPoint]) -> Bool {
        guard poly.count >= 3 else { return false }
        var inside = false
        var j = poly.count - 1
        for i in 0..<poly.count {
            let pi = poly[i]
            let pj = poly[j]
            if ((pi.y > point.y) != (pj.y > point.y)) &&
               (point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x) {
                inside.toggle()
            }
            j = i
        }
        return inside
    }

    public static func pointInPolygonOrOnBoundary(point: CGPoint, poly: [CGPoint], tolerance: CGFloat = 1e-4) -> Bool {
        if pointInPolygon(point: point, poly: poly) { return true }
        for i in 0..<poly.count {
            let p1 = poly[i]
            let p2 = poly[(i + 1) % poly.count]
            let l2 = (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y)
            if l2 < 1e-8 {
                if hypot(point.x - p1.x, point.y - p1.y) <= tolerance { return true }
                continue
            }
            let t = max(0.0, min(1.0, ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y)) / l2))
            let proj = CGPoint(x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y))
            if hypot(point.x - proj.x, point.y - proj.y) <= tolerance {
                return true
            }
        }
        return false
    }

    public static func arePolygonsCoincident(_ polyA: [CGPoint], _ polyB: [CGPoint], tolerance: CGFloat = 1e-4) -> Bool {
        guard polyA.count == polyB.count && polyA.count >= 3 else { return false }
        let n = polyA.count
        for offset in 0..<n {
            var match = true
            for i in 0..<n {
                let pA = polyA[(i + offset) % n]
                let pB = polyB[i]
                if hypot(pA.x - pB.x, pA.y - pB.y) > tolerance {
                    match = false
                    break
                }
            }
            if match { return true }
        }
        return false
    }

    public static func boundingBox(of points: [CGPoint]) -> CGRect {
        guard let first = points.first else { return .zero }
        var minX = first.x, maxX = first.x
        var minY = first.y, maxY = first.y
        for p in points {
            minX = min(minX, p.x); maxX = max(maxX, p.x)
            minY = min(minY, p.y); maxY = max(maxY, p.y)
        }
        return CGRect(x: minX, y: minY, width: max(0.1, maxX - minX), height: max(0.1, maxY - minY))
    }

    // MARK: - 4. Precise Segment-Segment Intersection
    private struct SegmentIntersection {
        let point: CGPoint
        let t: CGFloat
        let u: CGFloat
    }

    private static func findIntersection(p1: CGPoint, p2: CGPoint, q1: CGPoint, q2: CGPoint) -> SegmentIntersection? {
        let dxP = p2.x - p1.x
        let dyP = p2.y - p1.y
        let dxQ = q2.x - q1.x
        let dyQ = q2.y - q1.y

        let det = dxP * dyQ - dyP * dxQ
        guard abs(det) > 1e-9 else { return nil }

        let dxStart = q1.x - p1.x
        let dyStart = q1.y - p1.y

        var t = (dxStart * dyQ - dyStart * dxQ) / det
        var u = (dxStart * dyP - dyStart * dxP) / det

        let eps: CGFloat = 1e-5
        if abs(t) < eps { t = 0 }
        if abs(t - 1.0) < eps { t = 1.0 }
        if abs(u) < eps { u = 0 }
        if abs(u - 1.0) < eps { u = 1.0 }

        guard t >= 0.0 && t <= 1.0 && u >= 0.0 && u <= 1.0 else { return nil }

        let x = p1.x + t * dxP
        let y = p1.y + t * dyP
        return SegmentIntersection(point: CGPoint(x: x, y: y), t: t, u: u)
    }

    // MARK: - 5. Core Midpoint-Sampled Greiner-Hormann Clipping Engine
    public static func clipPolygons(
        polyA: [CGPoint],
        polyB: [CGPoint],
        op: BooleanOperationType
    ) -> [[CGPoint]] {
        let normA = normalizeWinding(polyA)
        let normB = normalizeWinding(polyB)

        guard normA.count >= 3 && normB.count >= 3 else {
            return fallbackNoIntersections(polyA: normA, polyB: normB, op: op)
        }

        // 0. Coincident polygon identity
        if arePolygonsCoincident(normA, normB) {
            switch op {
            case .add, .union, .intersect, .divide:
                return [normA]
            case .subtract, .xor, .exclude:
                return []
            }
        }

        // Bounding box rejection
        let boxA = boundingBox(of: normA)
        let boxB = boundingBox(of: normB)
        if !boxA.intersects(boxB) {
            return handleDisjointPolygons(polyA: normA, polyB: normB, op: op)
        }

        if op == .xor || op == .exclude {
            let remA = clipPolygons(polyA: normA, polyB: normB, op: .subtract)
            let remB = clipPolygons(polyA: normB, polyB: normA, op: .subtract)
            return remA + remB
        }

        if op == .divide {
            let inter = clipPolygons(polyA: normA, polyB: normB, op: .intersect)
            let remA = clipPolygons(polyA: normA, polyB: normB, op: .subtract)
            let remB = clipPolygons(polyA: normB, polyB: normA, op: .subtract)
            return inter + remA + remB
        }

        let listA = ClipPolygon(points: normA)
        let listB = ClipPolygon(points: normB)
        defer {
            listA.cleanup()
            listB.cleanup()
        }

        var originalEdgesA: [(node: ClipNode, next: ClipNode)] = []
        var currA = listA.head
        for _ in 0..<listA.count {
            originalEdgesA.append((currA!, currA!.next!))
            currA = currA!.next
        }

        var originalEdgesB: [(node: ClipNode, next: ClipNode)] = []
        var currB = listB.head
        for _ in 0..<listB.count {
            originalEdgesB.append((currB!, currB!.next!))
            currB = currB!.next
        }

        // Find all segment intersections and insert into lists
        var intersectionCount = 0
        for edgeA in originalEdgesA {
            for edgeB in originalEdgesB {
                if let inter = findIntersection(
                    p1: edgeA.node.point, p2: edgeA.next.point,
                    q1: edgeB.node.point, q2: edgeB.next.point
                ) {
                    if (inter.t < 1e-4 && edgeA.node.isIntersection) || (inter.u < 1e-4 && edgeB.node.isIntersection) {
                        continue
                    }

                    let nodeA = ClipNode(point: inter.point, isIntersection: true, alpha: inter.t)
                    let nodeB = ClipNode(point: inter.point, isIntersection: true, alpha: inter.u)
                    nodeA.other = nodeB
                    nodeB.other = nodeA

                    listA.insertIntersection(node: nodeA, after: edgeA.node)
                    listB.insertIntersection(node: nodeB, after: edgeB.node)
                    intersectionCount += 1
                }
            }
        }

        if intersectionCount == 0 {
            return handleDisjointOrContained(polyA: normA, polyB: normB, op: op)
        }

        // Midpoint-sampling edge classification with normal perturbation
        classifyIntersections(list: listA, againstPolygon: normB)
        classifyIntersections(list: listB, againstPolygon: normA)

        switch op {
        case .add, .union:
            let loops = traceUnionLoops(listA: listA, listB: listB)
            if loops.isEmpty {
                return [normA, normB]
            }
            let areaA = signedArea(normA)
            let areaB = signedArea(normB)
            let totLoopArea = loops.reduce(0.0) { $0 + signedArea($1) }
            if totLoopArea < max(areaA, areaB) + 1.0 {
                let remB = clipPolygons(polyA: normB, polyB: normA, op: .subtract)
                let remBArea = remB.reduce(0.0) { $0 + signedArea($1) }
                if remBArea > 1.0 && totLoopArea + remBArea <= areaA + areaB + 5.0 {
                    return loops + remB
                }
            }
            return loops

        case .subtract:
            let loops = traceDifferenceLoops(listA: listA, listB: listB)
            if loops.isEmpty {
                let allAInB = normA.allSatisfy { pointInPolygonOrOnBoundary(point: $0, poly: normB) }
                return allAInB ? [] : [normA]
            }
            return loops

        case .intersect:
            let loops = traceIntersectionLoops(listA: listA, listB: listB)
            let areaA = signedArea(normA)
            let areaB = signedArea(normB)
            let totLoopArea = loops.reduce(0.0) { $0 + signedArea($1) }
            if !loops.isEmpty && totLoopArea >= min(areaA, areaB) - 1.0 {
                let remA = clipPolygons(polyA: normA, polyB: normB, op: .subtract)
                let remB = clipPolygons(polyA: normB, polyB: normA, op: .subtract)
                let remAArea = remA.reduce(0.0) { $0 + signedArea($1) }
                let remBArea = remB.reduce(0.0) { $0 + signedArea($1) }
                if remAArea > 1.0 && remBArea > 1.0 && !remA.isEmpty {
                    let fallbackInter = clipPolygons(polyA: normA, polyB: remA[0], op: .subtract)
                    if !fallbackInter.isEmpty {
                        return fallbackInter
                    }
                }
            }
            return loops

        case .xor, .exclude, .divide:
            return []
        }
    }

    // MARK: - 6. Midpoint Classification
    private static func classifyIntersections(list: ClipPolygon, againstPolygon otherPoly: [CGPoint]) {
        guard let head = list.head else { return }
        var curr = head
        let total = list.count
        for _ in 0..<total {
            if curr.isIntersection {
                let p1 = curr.point
                var nextNode = curr.next!
                while hypot(nextNode.point.x - p1.x, nextNode.point.y - p1.y) < 1e-4 && nextNode !== curr {
                    nextNode = nextNode.next!
                }
                let p2 = nextNode.point
                let dx = p2.x - p1.x
                let dy = p2.y - p1.y
                let len = hypot(dx, dy)
                if len > 1e-4 {
                    let nx = -dy / len
                    let ny = dx / len
                    let testPt = CGPoint(
                        x: (p1.x + p2.x) * 0.5 + nx * 0.1,
                        y: (p1.y + p2.y) * 0.5 + ny * 0.1
                    )
                    curr.isEntry = pointInPolygon(point: testPt, poly: otherPoly)
                } else {
                    let mid = CGPoint(x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5)
                    curr.isEntry = pointInPolygon(point: mid, poly: otherPoly)
                }
            }
            curr = curr.next
        }
    }

    // MARK: - 7. Traversal Algorithms
    private static func traceUnionLoops(listA: ClipPolygon, listB: ClipPolygon) -> [[CGPoint]] {
        var loops: [[CGPoint]] = []
        guard let headA = listA.head else { return loops }

        var currA = headA
        for _ in 0..<listA.count {
            if currA.isIntersection && !currA.visited && !currA.isEntry {
                if let loop = traceLoop(start: currA, forwardA: true, forwardB: true) {
                    loops.append(loop)
                }
            }
            currA = currA.next
        }
        return filterValidLoops(loops)
    }

    private static func traceDifferenceLoops(listA: ClipPolygon, listB: ClipPolygon) -> [[CGPoint]] {
        var loops: [[CGPoint]] = []
        guard let headA = listA.head else { return loops }

        var currA = headA
        for _ in 0..<listA.count {
            if currA.isIntersection && !currA.visited && !currA.isEntry {
                if let loop = traceLoop(start: currA, forwardA: true, forwardB: false) {
                    loops.append(loop)
                }
            }
            currA = currA.next
        }
        return filterValidLoops(loops)
    }

    private static func traceIntersectionLoops(listA: ClipPolygon, listB: ClipPolygon) -> [[CGPoint]] {
        var loops: [[CGPoint]] = []
        guard let headA = listA.head else { return loops }

        var currA = headA
        for _ in 0..<listA.count {
            if currA.isIntersection && !currA.visited && currA.isEntry {
                if let loop = traceLoop(start: currA, forwardA: true, forwardB: true) {
                    loops.append(loop)
                }
            }
            currA = currA.next
        }
        return filterValidLoops(loops)
    }

    private static func traceLoop(start: ClipNode, forwardA: Bool, forwardB: Bool) -> [CGPoint]? {
        var pts: [CGPoint] = []
        var curr = start
        var onA = true
        let maxSteps = 10000
        var steps = 0

        while steps < maxSteps {
            steps += 1
            if curr.isIntersection {
                curr.visited = true
                curr.other?.visited = true
            }

            pts.append(curr.point)

            let forward = onA ? forwardA : forwardB
            let nextNode = forward ? curr.next! : curr.prev!

            if nextNode.isIntersection {
                if nextNode === start || nextNode.other === start {
                    break
                }
                nextNode.visited = true
                nextNode.other?.visited = true
                pts.append(nextNode.point)
                curr = nextNode.other!
                onA.toggle()
            } else {
                curr = nextNode
            }

            if curr === start || curr.other === start {
                break
            }
        }

        return pts.count >= 3 ? normalizeWinding(pts) : nil
    }

    private static func filterValidLoops(_ loops: [[CGPoint]]) -> [[CGPoint]] {
        loops.filter { loop in
            guard loop.count >= 3 else { return false }
            return abs(signedArea(loop)) > 1.0
        }
    }

    // MARK: - 8. Non-intersecting Fallbacks
    private static func handleDisjointPolygons(polyA: [CGPoint], polyB: [CGPoint], op: BooleanOperationType) -> [[CGPoint]] {
        switch op {
        case .add, .union: return [polyA, polyB]
        case .subtract: return [polyA]
        case .intersect: return []
        case .xor, .exclude: return [polyA, polyB]
        case .divide: return [polyA, polyB]
        }
    }

    private static func handleDisjointOrContained(polyA: [CGPoint], polyB: [CGPoint], op: BooleanOperationType) -> [[CGPoint]] {
        let aInB = pointInPolygon(point: polyA[0], poly: polyB)
        let bInA = pointInPolygon(point: polyB[0], poly: polyA)

        if aInB {
            switch op {
            case .add, .union: return [polyB]
            case .subtract: return []
            case .intersect: return [polyA]
            case .xor, .exclude: return [polyB]
            case .divide: return [polyA, polyB]
            }
        } else if bInA {
            switch op {
            case .add, .union: return [polyA]
            case .subtract: return [polyA]
            case .intersect: return [polyB]
            case .xor, .exclude: return [polyA]
            case .divide: return [polyA, polyB]
            }
        } else {
            return handleDisjointPolygons(polyA: polyA, polyB: polyB, op: op)
        }
    }

    private static func fallbackNoIntersections(polyA: [CGPoint], polyB: [CGPoint], op: BooleanOperationType) -> [[CGPoint]] {
        switch op {
        case .add, .union: return [polyA, polyB].filter { $0.count >= 3 }
        case .subtract: return [polyA].filter { $0.count >= 3 }
        case .intersect: return []
        case .xor, .exclude: return [polyA, polyB].filter { $0.count >= 3 }
        case .divide: return [polyA, polyB].filter { $0.count >= 3 }
        }
    }

    // MARK: - 9. High-Level VOONode Topology Transformation
    public static func performBoolean(
        op: BooleanOperationType,
        subject: VOONode,
        clip: VOONode
    ) -> [VOONode] {
        let polyA = extractPolygon(from: subject)
        let polyB = extractPolygon(from: clip)

        let resultPolys = clipPolygons(polyA: polyA, polyB: polyB, op: op)
        guard !resultPolys.isEmpty else { return [] }

        var resultNodes: [VOONode] = []
        for poly in resultPolys {
            let anchors = BezierCurveFitter.fitContourToBezier(polygon: poly, isClosed: true)
            let b = boundingBox(of: poly)

            var node = VOONode(
                id: UUID().uuidString,
                kind: .path,
                name: "\(subject.name) (\(op.rawValue))",
                x: b.minX,
                y: b.minY,
                width: b.width,
                height: b.height,
                style: subject.style,
                effects: subject.effects
            )
            node.points = anchors
            resultNodes.append(node)
        }

        return resultNodes
    }
}
