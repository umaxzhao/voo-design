import CoreGraphics
import Foundation

public struct CropRect: Codable, Sendable, Equatable {
    public var x: CGFloat
    public var y: CGFloat
    public var width: CGFloat
    public var height: CGFloat

    public init(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    public var cgRect: CGRect {
        CGRect(x: x, y: y, width: width, height: height)
    }
}

/// Persistent ruler guide line across horizontal or vertical canvas axes.
public struct GuideLine: Codable, Sendable, Equatable {
    public var axis: String  // "h" or "v"
    public var position: CGFloat

    public init(axis: String, position: CGFloat) {
        self.axis = axis
        self.position = position
    }
}

/// Document-scoped shared color swatch variable.
public struct ColorVariable: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var value: String  // Hex string e.g. "#171717"

    public init(id: String = UUID().uuidString, name: String, value: String) {
        self.id = id
        self.name = name
        self.value = value
    }
}

/// Canvas stage configuration and metadata matching VOO CanvasFrame.
public struct CanvasFrame: Codable, Sendable, Equatable {
    public var x: CGFloat
    public var y: CGFloat
    public var width: CGFloat
    public var height: CGFloat
    public var backgroundColor: String
    public var crop: CropRect?
    public var guides: [GuideLine]
    public var colorVariables: [ColorVariable]

    public init(
        x: CGFloat = 0,
        y: CGFloat = 0,
        width: CGFloat = 1920,
        height: CGFloat = 1080,
        backgroundColor: String = "#000000",
        crop: CropRect? = nil,
        guides: [GuideLine] = [],
        colorVariables: [ColorVariable] = []
    ) {
        self.x = x
        self.y = y
        self.width = max(width, 1.0)
        self.height = max(height, 1.0)
        self.backgroundColor = backgroundColor
        self.crop = crop
        self.guides = guides
        self.colorVariables = colorVariables
    }

    public var rect: CGRect {
        CGRect(x: x, y: y, width: width, height: height)
    }

    public var bounds: CGRect {
        CGRect(x: 0, y: 0, width: width, height: height)
    }

    public var size: CGSize {
        get { CGSize(width: width, height: height) }
        set {
            width = max(newValue.width, 1.0)
            height = max(newValue.height, 1.0)
        }
    }
}

// MARK: - Node Kinds & Graph Classifiers

/// Node kind classification matching VOO Design NODE_KIND enum.
public enum NodeKind: String, Codable, Sendable, CaseIterable, Equatable {
    case rect = "rect"
    case ellipse = "ellipse"
    case path = "path"
    case text = "text"
    case image = "image"
    case group = "group"
    case boolean = "boolean"
    case frame = "frame"  // Artboard / Slice frame
    case adjustment = "adjustment"
    case region = "region"
    case video = "video"
    case canvasInstance = "canvasInstance"

    public var isShape: Bool {
        self == .rect || self == .ellipse || self == .boolean
    }

    public var isContainer: Bool {
        self == .group || self == .boolean || self == .frame
    }
}

// MARK: - Corner Radii & Geometry Helpers

/// Corner radii configuration supporting uniform or individual four-corner radii.
/// Figma-style auto-layout constraints: how a child layer reacts when its parent
/// frame is resized. `horizontal` is one of left/center/right/scale, `vertical`
/// one of top/middle/bottom/scale. Decoding is tolerant (malformed or missing
/// values fall back to left/top) so old `.voo` files keep loading.
public struct NodeConstraints: Codable, Sendable, Equatable {
    public var horizontal: String
    public var vertical: String

    public static let horizontalValues = ["left", "center", "right", "scale"]
    public static let verticalValues = ["top", "middle", "bottom", "scale"]

    public init(horizontal: String = "left", vertical: String = "top") {
        self.horizontal = NodeConstraints.normalized(
            horizontal,
            allowed: NodeConstraints.horizontalValues,
            fallback: "left")
        self.vertical = NodeConstraints.normalized(
            vertical,
            allowed: NodeConstraints.verticalValues,
            fallback: "top")
    }

    private static func normalized(_ raw: String, allowed: [String], fallback: String) -> String {
        let key = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return allowed.contains(key) ? key : fallback
    }

    private enum CodingKeys: String, CodingKey {
        case horizontal, vertical
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let h = (try? container.decodeIfPresent(String.self, forKey: .horizontal)) ?? nil ?? "left"
        let v = (try? container.decodeIfPresent(String.self, forKey: .vertical)) ?? nil ?? "top"
        self.init(horizontal: h, vertical: v)
    }
}

public struct CornerRadii: Codable, Sendable, Equatable {
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

    private enum CodingKeys: String, CodingKey {
        case tl, tr, br, bl
    }

    public init(from decoder: Decoder) throws {
        if let singleValue = try? decoder.singleValueContainer(),
            let uniform = try? singleValue.decode(CGFloat.self)
        {
            let v = max(0, uniform)
            self.tl = v
            self.tr = v
            self.br = v
            self.bl = v
            return
        }
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.tl = max(0, (try? container.decode(CGFloat.self, forKey: .tl)) ?? 0)
        self.tr = max(0, (try? container.decode(CGFloat.self, forKey: .tr)) ?? 0)
        self.br = max(0, (try? container.decode(CGFloat.self, forKey: .br)) ?? 0)
        self.bl = max(0, (try? container.decode(CGFloat.self, forKey: .bl)) ?? 0)
    }

    public func encode(to encoder: Encoder) throws {
        if tl == tr && tr == br && br == bl {
            var container = encoder.singleValueContainer()
            try container.encode(tl)
        } else {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(tl, forKey: .tl)
            try container.encode(tr, forKey: .tr)
            try container.encode(br, forKey: .br)
            try container.encode(bl, forKey: .bl)
        }
    }

    /// Normalizes corner radii proportionally so adjacent corners never exceed container dimensions.
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

    /// Whether all four corner radii are equal within floating-point tolerance.
    public var isUniform: Bool {
        abs(tl - tr) < 0.001 && abs(tr - br) < 0.001 && abs(br - bl) < 0.001
    }

    /// Returns the primary uniform radius value (tl).
    public var uniformRadius: CGFloat { tl }
}
