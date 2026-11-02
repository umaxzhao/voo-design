import Foundation
import CoreGraphics

public struct CanvasFrame: Codable, Equatable {
    public var x: CGFloat
    public var y: CGFloat
    public var width: CGFloat
    public var height: CGFloat
    public var backgroundColor: String

    public init(x: CGFloat = 0, y: CGFloat = 0, width: CGFloat = 1920, height: CGFloat = 1080, backgroundColor: String = "#000000") {
        self.x = x
        self.y = y
        self.width = max(width, 1.0)
        self.height = max(height, 1.0)
        self.backgroundColor = backgroundColor
    }

    public var rect: CGRect {
        return CGRect(x: x, y: y, width: width, height: height)
    }
}

public enum NodeKind: String, Codable, Equatable {
    case rect
    case ellipse
    case path
    case text
    case image
    case group
    case boolean
    case frame
}

public struct CornerRadii: Codable, Equatable {
    public var tl: CGFloat
    public var tr: CGFloat
    public var br: CGFloat
    public var bl: CGFloat

    public init(uniform: CGFloat) {
        let v = max(0, uniform)
        self.tl = v
        self.tr = v
        self.br = v
        self.bl = v
    }

    public init(tl: CGFloat, tr: CGFloat, br: CGFloat, bl: CGFloat) {
        self.tl = max(0, tl)
        self.tr = max(0, tr)
        self.br = max(0, br)
        self.bl = max(0, bl)
    }

    public func clamped(forWidth width: CGFloat, height: CGFloat) -> CornerRadii {
        let topSum = tl + tr
        let bottomSum = bl + br
        let leftSum = tl + bl
        let rightSum = tr + br

        var factor: CGFloat = 1.0
        if topSum > width && topSum > 0 { factor = min(factor, width / topSum) }
        if bottomSum > width && bottomSum > 0 { factor = min(factor, width / bottomSum) }
        if leftSum > height && leftSum > 0 { factor = min(factor, height / leftSum) }
        if rightSum > height && rightSum > 0 { factor = min(factor, height / rightSum) }

        if factor < 1.0 {
            return CornerRadii(tl: tl * factor, tr: tr * factor, br: br * factor, bl: bl * factor)
        }
        return self
    }
}

public enum NodeType: String, Codable, Equatable {
    case sharp
    case smooth
    case symmetric
    case smart
}

public struct PenAnchor: Codable, Equatable {
    public var x: CGFloat
    public var y: CGFloat
    public var inHandle: CGPoint?
    public var outHandle: CGPoint?
    public var isClosed: Bool
    public var type: NodeType

    public init(x: CGFloat, y: CGFloat, inHandle: CGPoint? = nil, outHandle: CGPoint? = nil, isClosed: Bool = false, type: NodeType = .sharp) {
        self.x = x
        self.y = y
        self.inHandle = inHandle
        self.outHandle = outHandle
        self.isClosed = isClosed
        self.type = type
    }

    public var point: CGPoint {
        return CGPoint(x: x, y: y)
    }

    public var inLength: CGFloat {
        guard let inH = inHandle else { return 0 }
        return hypot(inH.x - x, inH.y - y)
    }

    public var outLength: CGFloat {
        guard let outH = outHandle else { return 0 }
        return hypot(outH.x - x, outH.y - y)
    }
}

public struct LayerStyle: Codable, Equatable {
    public var fill: String
    public var stroke: String
    public var strokeWidth: CGFloat
    public var opacity: CGFloat
    public var blendMode: String
    public var visible: Bool
    public var locked: Bool

    public init(
        fill: String = "#262626",
        stroke: String = "#b2ffd6",
        strokeWidth: CGFloat = 1.0,
        opacity: CGFloat = 1.0,
        blendMode: String = "source-over",
        visible: Bool = true,
        locked: Bool = false
    ) {
        self.fill = fill
        self.stroke = stroke
        self.strokeWidth = max(0, strokeWidth)
        self.opacity = min(max(opacity, 0.0), 1.0)
        self.blendMode = blendMode
        self.visible = visible
        self.locked = locked
    }
}

public struct VOONode: Codable, Equatable, Identifiable {
    public var id: String
    public var parentId: String?
    public var kind: NodeKind
    public var name: String
    public var x: CGFloat
    public var y: CGFloat
    public var width: CGFloat
    public var height: CGFloat
    public var rotation: CGFloat
    public var shear: CGFloat
    public var style: LayerStyle
    public var cornerRadii: CornerRadii?
    public var points: [PenAnchor]?
    public var text: String?
    public var booleanOperation: String?

    public init(
        id: String = UUID().uuidString,
        parentId: String? = nil,
        kind: NodeKind = .rect,
        name: String = "Layer",
        x: CGFloat = 0,
        y: CGFloat = 0,
        width: CGFloat = 100,
        height: CGFloat = 100,
        rotation: CGFloat = 0,
        shear: CGFloat = 0,
        style: LayerStyle = LayerStyle(),
        cornerRadii: CornerRadii? = nil,
        points: [PenAnchor]? = nil,
        text: String? = nil,
        booleanOperation: String? = nil
    ) {
        self.id = id
        self.parentId = parentId
        self.kind = kind
        self.name = name
        self.x = x
        self.y = y
        self.width = max(width, 0.001)
        self.height = max(height, 0.001)
        self.rotation = rotation
        self.shear = min(max(shear, -80), 80)
        self.style = style
        self.cornerRadii = cornerRadii
        self.points = points
        self.text = text
        self.booleanOperation = booleanOperation
    }

    public var bounds: CGRect {
        return CGRect(x: x, y: y, width: width, height: height)
    }
}

public struct VOODocument: Codable, Equatable {
    public var id: String
    public var title: String
    public var version: Int
    public var canvas: CanvasFrame
    public var nodes: [VOONode]

    public init(
        id: String = UUID().uuidString,
        title: String = "Untitled",
        version: Int = 2,
        canvas: CanvasFrame = CanvasFrame(),
        nodes: [VOONode] = []
    ) {
        self.id = id
        self.title = title
        self.version = version
        self.canvas = canvas
        self.nodes = nodes
    }

    public func serializeToJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(self)
    }

    public static func deserialize(from data: Data) throws -> VOODocument {
        let decoder = JSONDecoder()
        return try decoder.decode(VOODocument.self, from: data)
    }

    public mutating func sanitizeCyclicHierarchy() {
        let validParentIds = Set(nodes.map { $0.id })
        for i in 0..<nodes.count {
            if let pid = nodes[i].parentId {
                if !validParentIds.contains(pid) || pid == nodes[i].id {
                    nodes[i].parentId = nil
                }
            }
        }
    }
}
