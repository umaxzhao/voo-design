import CoreGraphics
import Foundation

public struct VOONode: Codable, Sendable, Equatable, Identifiable {
    public var portableProperties: [String: PortableJSONValue] = [:]
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
    public var style: LayerStyle {
        didSet { synchronizePortablePaints(previous: oldValue) }
    }
    public var cornerRadii: CornerRadii?
    public var lockRatio: Bool?
    public var points: [PenAnchor]?
    public var text: String?
    public var fontSize: CGFloat?
    public var fontFamily: String?
    /// Text weight: "regular" / "medium" / "semibold" / "bold". `nil` = regular.
    public var fontWeight: String?
    /// Text alignment: "left" / "center" / "right" / "justify". `nil` = left.
    public var textAlign: String?
    /// Line-height multiplier. `nil` = 1.2.
    public var lineHeight: CGFloat?
    /// Letter spacing in points. `nil` = 0.
    public var letterSpacing: CGFloat?
    public var italic: Bool?
    public var underline: Bool?
    public var boxWidth: CGFloat?
    public var booleanOperation: String?
    public var clipTo: String?
    public var maskId: String?
    public var fillVariableId: String?
    public var strokeVariableId: String?
    public var adjustments: LayerAdjustments?
    public var effects: LayerEffects?
    public var src: String?
    public var imageId: String?
    public var paint: Bool?
    public var childIds: [String]?
    /// Optional auto-layout constraints. `nil` means the default left/top pinning,
    /// and old documents without the key decode to `nil` (backwards compatible).
    public var constraints: NodeConstraints?

    // Convenience computed accessors bridging LayerStyle
    public var fill: String {
        get { style.fill }
        set { style.fill = newValue }
    }

    public var stroke: String {
        get { style.stroke }
        set { style.stroke = newValue }
    }

    public var strokeWidth: CGFloat {
        get { style.strokeWidth }
        set { style.strokeWidth = max(0, newValue) }
    }

    public var opacity: CGFloat {
        get { style.opacity }
        set { style.opacity = min(max(newValue, 0.0), 1.0) }
    }

    public var blendMode: String {
        get { style.blendMode }
        set { style.blendMode = newValue }
    }

    public var visible: Bool {
        get { style.visible }
        set { style.visible = newValue }
    }

    public var locked: Bool {
        get { style.locked }
        set { style.locked = newValue }
    }

    public var strokeCap: String? {
        get { style.strokeCap }
        set { style.strokeCap = newValue }
    }

    public var strokeJoin: String? {
        get { style.strokeJoin }
        set { style.strokeJoin = newValue }
    }

    public var strokeMiterLimit: CGFloat? {
        get { style.strokeMiterLimit }
        set { style.strokeMiterLimit = newValue }
    }

    public var strokeDash: [CGFloat]? {
        get { style.strokeDash }
        set { style.strokeDash = newValue }
    }

    public var strokeAlign: String? {
        get { style.strokeAlign }
        set { style.strokeAlign = newValue }
    }

    public var bounds: CGRect {
        CGRect(x: x, y: y, width: width, height: height)
    }

    // Primary Initializer (kind before name)
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
        lockRatio: Bool? = nil,
        points: [PenAnchor]? = nil,
        text: String? = nil,
        fontSize: CGFloat? = nil,
        fontFamily: String? = nil,
        fontWeight: String? = nil,
        textAlign: String? = nil,
        lineHeight: CGFloat? = nil,
        letterSpacing: CGFloat? = nil,
        italic: Bool? = nil,
        underline: Bool? = nil,
        boxWidth: CGFloat? = nil,
        booleanOperation: String? = nil,
        clipTo: String? = nil,
        maskId: String? = nil,
        fillVariableId: String? = nil,
        strokeVariableId: String? = nil,
        adjustments: LayerAdjustments? = nil,
        effects: LayerEffects? = nil,
        src: String? = nil,
        imageId: String? = nil,
        paint: Bool? = nil,
        childIds: [String]? = nil,
        constraints: NodeConstraints? = nil
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
        self.shear = min(max(shear, -80.0), 80.0)
        self.style = style
        self.cornerRadii = cornerRadii
        self.lockRatio = lockRatio
        self.points = points
        self.text = text
        self.fontSize = fontSize
        self.fontFamily = fontFamily
        self.fontWeight = fontWeight
        self.textAlign = textAlign
        self.lineHeight = lineHeight
        self.letterSpacing = letterSpacing
        self.italic = italic
        self.underline = underline
        self.boxWidth = boxWidth
        self.booleanOperation = booleanOperation
        self.clipTo = clipTo
        self.maskId = maskId
        self.fillVariableId = fillVariableId
        self.strokeVariableId = strokeVariableId
        self.adjustments = adjustments
        self.effects = effects
        self.src = src
        self.imageId = imageId
        self.paint = paint
        self.childIds = childIds
        self.constraints = constraints
    }

    // Convenience Initializer (name before kind)
    public init(name: String, kind: NodeKind) {
        self.init(kind: kind, name: name)
    }

}

public struct VOODocument: Codable, Sendable, Equatable {
    public var assets: [String: String] = [:]
    public var portableProperties: [String: PortableJSONValue] = [:]
    public var id: String
    public var title: String
    public var version: Int
    public var canvasType: String
    public var canvas: CanvasFrame
    public var nodes: [VOONode]
    public var selectedNodeIds: Set<String>
    public var guides: [GuideLine]?

    public init(
        id: String = UUID().uuidString,
        title: String = "Untitled",
        version: Int = 2,
        canvasType: String = "design",
        canvas: CanvasFrame = CanvasFrame(),
        nodes: [VOONode] = [],
        selectedNodeIds: Set<String> = [],
        guides: [GuideLine]? = []
    ) {
        self.id = id
        self.title = title
        self.version = version
        self.canvasType = canvasType
        self.canvas = canvas
        self.nodes = nodes
        self.selectedNodeIds = selectedNodeIds
        self.guides = guides
    }

    // Direct JSON SerDe API (Required by PROJECT.md Contract)
    public func serializeToJSON() throws -> Data {
        try VOOSerializer.shared.serialize(document: self)
    }

    public static func deserialize(from data: Data) throws -> VOODocument {
        try VOOSerializer.shared.deserialize(from: data)
    }

    /// Detects and breaks cyclic parentId relationships among hierarchical groups.
    public mutating func sanitizeCyclicHierarchy() {
        let validIds = Set(nodes.map { $0.id })
        let parentMap = Dictionary(nodes.map { ($0.id, $0.parentId) }, uniquingKeysWith: { first, _ in first })

        for i in 0..<nodes.count {
            guard let pid = nodes[i].parentId else { continue }
            if !validIds.contains(pid) || pid == nodes[i].id {
                nodes[i].parentId = nil
                continue
            }
            // Cycle traversal
            var visited = Set<String>([nodes[i].id])
            var cursor: String? = pid
            var hasCycle = false
            while let cur = cursor {
                if visited.contains(cur) {
                    hasCycle = true
                    break
                }
                visited.insert(cur)
                cursor = parentMap[cur] ?? nil
            }
            if hasCycle {
                nodes[i].parentId = nil
            }
        }
    }
}
