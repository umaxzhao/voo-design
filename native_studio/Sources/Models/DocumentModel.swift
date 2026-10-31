//
//  DocumentModel.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M1.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import CoreGraphics
import Foundation

// MARK: - Canvas Stage Configuration & Metadata

/// Non-destructive rectangular crop frame on the canvas stage.
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
    public var axis: String // "h" or "v"
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
    public var value: String // Hex string e.g. "#171717"

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
        set { width = max(newValue.width, 1.0); height = max(newValue.height, 1.0) }
    }
}

// MARK: - Node Kinds & Graph Classifiers

/// Node kind classification matching VOO Design NODE_KIND enum.
public enum NodeKind: String, Codable, Sendable, CaseIterable, Equatable {
    case rect           = "rect"
    case ellipse        = "ellipse"
    case path           = "path"
    case text           = "text"
    case image          = "image"
    case group          = "group"
    case boolean        = "boolean"
    case frame          = "frame" // Artboard / Slice frame
    case adjustment     = "adjustment"
    case region         = "region"
    case video          = "video"
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
        self.horizontal = NodeConstraints.normalized(horizontal,
                                                     allowed: NodeConstraints.horizontalValues,
                                                     fallback: "left")
        self.vertical = NodeConstraints.normalized(vertical,
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
           let uniform = try? singleValue.decode(CGFloat.self) {
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

// MARK: - Pen Curve Node Anchors

public enum NodeType: String, Codable, Sendable, CaseIterable, Equatable {
    case sharp
    case smooth
    case symmetric
    case smart
}

/// Cubic Bezier pen anchor point with in/out control handles.
public struct PenAnchor: Codable, Sendable, Equatable {
    public var x: CGFloat
    public var y: CGFloat
    public var inHandle: CGPoint?
    public var outHandle: CGPoint?
    public var isClosed: Bool
    public var type: NodeType

    public init(
        x: CGFloat,
        y: CGFloat,
        inHandle: CGPoint? = nil,
        outHandle: CGPoint? = nil,
        isClosed: Bool = false,
        type: NodeType = .sharp
    ) {
        self.x = x
        self.y = y
        self.inHandle = inHandle
        self.outHandle = outHandle
        self.isClosed = isClosed
        self.type = type
    }

    public var point: CGPoint {
        CGPoint(x: x, y: y)
    }

    public var inLength: CGFloat {
        guard let inH = inHandle else { return 0 }
        return hypot(inH.x - x, inH.y - y)
    }

    public var outLength: CGFloat {
        guard let outH = outHandle else { return 0 }
        return hypot(outH.x - x, outH.y - y)
    }

    // Custom Codable to support both standard format and VOO Design JSON [in: [dx, dy], out: [dx, dy]]
    private enum CodingKeys: String, CodingKey {
        case x, y, inHandle, outHandle, isClosed, type
        case vooIn = "in"
        case vooOut = "out"
        case vooClose = "close"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.x = try container.decode(CGFloat.self, forKey: .x)
        self.y = try container.decode(CGFloat.self, forKey: .y)

        // Decode inHandle (CGPoint or [dx, dy])
        if let directIn = try? container.decode(CGPoint.self, forKey: .inHandle) {
            self.inHandle = directIn
        } else if let arr = try? container.decode([CGFloat].self, forKey: .vooIn), arr.count >= 2 {
            self.inHandle = CGPoint(x: x + arr[0], y: y + arr[1])
        } else {
            self.inHandle = nil
        }

        // Decode outHandle (CGPoint or [dx, dy])
        if let directOut = try? container.decode(CGPoint.self, forKey: .outHandle) {
            self.outHandle = directOut
        } else if let arr = try? container.decode([CGFloat].self, forKey: .vooOut), arr.count >= 2 {
            self.outHandle = CGPoint(x: x + arr[0], y: y + arr[1])
        } else {
            self.outHandle = nil
        }

        if let closed = try? container.decode(Bool.self, forKey: .isClosed) {
            self.isClosed = closed
        } else if let vooClose = try? container.decode(Bool.self, forKey: .vooClose) {
            self.isClosed = vooClose
        } else {
            self.isClosed = false
        }

        self.type = (try? container.decode(NodeType.self, forKey: .type)) ?? (inHandle == nil && outHandle == nil ? .sharp : .smooth)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(x, forKey: .x)
        try container.encode(y, forKey: .y)
        try container.encodeIfPresent(inHandle, forKey: .inHandle)
        try container.encodeIfPresent(outHandle, forKey: .outHandle)
        try container.encode(isClosed, forKey: .isClosed)
        try container.encode(type, forKey: .type)
    }
}

// MARK: - 25 Comprehensive Blend Modes

public enum BlendMode: String, Codable, Sendable, CaseIterable, Equatable {
    // 16 Canvas2D / CoreGraphics native modes
    case sourceOver    = "source-over"
    case multiply      = "multiply"
    case screen        = "screen"
    case overlay       = "overlay"
    case darken        = "darken"
    case lighten       = "lighten"
    case colorDodge    = "color-dodge"
    case colorBurn     = "color-burn"
    case hardLight     = "hard-light"
    case softLight     = "soft-light"
    case difference    = "difference"
    case exclusion     = "exclusion"
    case hue           = "hue"
    case saturation    = "saturation"
    case color         = "color"
    case luminosity    = "luminosity"

    // 9 Photoshop / Affinity per-pixel blend modes
    case dissolve      = "dissolve"
    case linearBurn    = "linear-burn"
    case linearDodge   = "linear-dodge"
    case vividLight    = "vivid-light"
    case linearLight   = "linear-light"
    case pinLight      = "pin-light"
    case hardMix       = "hard-mix"
    case subtract      = "subtract"
    case divide        = "divide"

    public var displayName: String {
        switch self {
        case .sourceOver: return "正常 (Normal)"
        case .multiply: return "正片叠底 (Multiply)"
        case .screen: return "滤色 (Screen)"
        case .overlay: return "叠加 (Overlay)"
        case .darken: return "变暗 (Darken)"
        case .lighten: return "变亮 (Lighten)"
        case .colorDodge: return "颜色减淡 (Color Dodge)"
        case .colorBurn: return "颜色加深 (Color Burn)"
        case .hardLight: return "强光 (Hard Light)"
        case .softLight: return "柔光 (Soft Light)"
        case .difference: return "差值 (Difference)"
        case .exclusion: return "排除 (Exclusion)"
        case .hue: return "色相 (Hue)"
        case .saturation: return "饱和度 (Saturation)"
        case .color: return "颜色 (Color)"
        case .luminosity: return "明度 (Luminosity)"
        case .dissolve: return "溶解 (Dissolve)"
        case .linearBurn: return "线性加深 (Linear Burn)"
        case .linearDodge: return "线性减淡 (Linear Dodge)"
        case .vividLight: return "点光 (Vivid Light)"
        case .linearLight: return "线性光 (Linear Light)"
        case .pinLight: return "点状光 (Pin Light)"
        case .hardMix: return "实色混合 (Hard Mix)"
        case .subtract: return "减去 (Subtract)"
        case .divide: return "划分 (Divide)"
        }
    }
}

// MARK: - Layer Style & Visual Appearance

public typealias VOOStyle = LayerStyle

public struct LayerStyle: Codable, Sendable, Equatable {
    public var fill: String
    public var stroke: String
    public var strokeWidth: CGFloat
    public var opacity: CGFloat
    public var blendMode: String
    public var visible: Bool
    public var locked: Bool
    public var strokeCap: String?         // "butt" | "round" | "square"
    public var strokeJoin: String?        // "miter" | "round" | "bevel"
    public var strokeMiterLimit: CGFloat? // default 4.0
    public var strokeDash: [CGFloat]?    // e.g. [8, 4]
    public var strokeAlign: String?       // "inside" | "center" | "outside"
    public var fillOpacity: CGFloat?
    public var strokeOpacity: CGFloat?

    public init(
        fill: String = "#262626",
        stroke: String = "#b2ffd6",
        strokeWidth: CGFloat = 1.0,
        opacity: CGFloat = 1.0,
        blendMode: String = "source-over",
        visible: Bool = true,
        locked: Bool = false,
        strokeCap: String? = nil,
        strokeJoin: String? = nil,
        strokeMiterLimit: CGFloat? = nil,
        strokeDash: [CGFloat]? = nil,
        strokeAlign: String? = nil,
        fillOpacity: CGFloat? = nil,
        strokeOpacity: CGFloat? = nil
    ) {
        self.fill = fill
        self.stroke = stroke
        self.strokeWidth = max(0, strokeWidth)
        self.opacity = min(max(opacity, 0.0), 1.0)
        self.blendMode = blendMode
        self.visible = visible
        self.locked = locked
        self.strokeCap = strokeCap
        self.strokeJoin = strokeJoin
        self.strokeMiterLimit = strokeMiterLimit
        self.strokeDash = strokeDash
        self.strokeAlign = strokeAlign
        self.fillOpacity = fillOpacity
        self.strokeOpacity = strokeOpacity
    }
}

// MARK: - Layer Visual Effects (FX)

public struct GradientStop: Codable, Sendable, Equatable {
    public var offset: Double // 0.0 .. 1.0
    public var color: String  // Hex or rgba

    public init(offset: Double, color: String) {
        self.offset = offset
        self.color = color
    }
}

public struct DropShadowEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var color: String
    public var blur: Double
    public var offsetX: Double
    public var offsetY: Double
    public var spread: Double
    public var opacity: Double

    public init(enabled: Bool = true, color: String = "#000000", blur: Double = 10, offsetX: Double = 0, offsetY: Double = 4, spread: Double = 0, opacity: Double = 0.5) {
        self.enabled = enabled
        self.color = color
        self.blur = blur
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.spread = spread
        self.opacity = opacity
    }

    public var x: Double {
        get { offsetX }
        set { offsetX = newValue }
    }
    public var y: Double {
        get { offsetY }
        set { offsetY = newValue }
    }
}

public struct OuterGlowEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var color: String
    public var blur: Double
    public var spread: Double
    public var opacity: Double

    public init(enabled: Bool = true, color: String = "#b2ffd6", blur: Double = 8, spread: Double = 0, opacity: Double = 0.6) {
        self.enabled = enabled
        self.color = color
        self.blur = blur
        self.spread = spread
        self.opacity = opacity
    }
}

public struct InnerShadowEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var color: String
    public var blur: Double
    public var offsetX: Double
    public var offsetY: Double
    public var spread: Double
    public var opacity: Double

    public init(enabled: Bool = true, color: String = "#000000", blur: Double = 6, offsetX: Double = 0, offsetY: Double = 2, spread: Double = 0, opacity: Double = 0.4) {
        self.enabled = enabled
        self.color = color
        self.blur = blur
        self.offsetX = offsetX
        self.offsetY = offsetY
        self.spread = spread
        self.opacity = opacity
    }

    public var x: Double {
        get { offsetX }
        set { offsetX = newValue }
    }
    public var y: Double {
        get { offsetY }
        set { offsetY = newValue }
    }
}

public struct InnerGlowEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var color: String
    public var blur: Double
    public var size: Double
    public var opacity: Double

    public init(enabled: Bool = true, color: String = "#ffffff", blur: Double = 6, size: Double = 2, opacity: Double = 0.4) {
        self.enabled = enabled
        self.color = color
        self.blur = blur
        self.size = size
        self.opacity = opacity
    }
}

public struct SatinEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var color: String
    public var blur: Double
    public var distance: Double
    public var angle: Double
    public var invert: Bool
    public var opacity: Double

    public init(enabled: Bool = true, color: String = "#000000", blur: Double = 8, distance: Double = 8, angle: Double = 45, invert: Bool = false, opacity: Double = 0.3) {
        self.enabled = enabled
        self.color = color
        self.blur = blur
        self.distance = distance
        self.angle = angle
        self.invert = invert
        self.opacity = opacity
    }
}

public struct BevelEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var depth: Double
    public var size: Double
    public var angle: Double
    public var softness: Double

    public init(enabled: Bool = true, depth: Double = 100, size: Double = 5, angle: Double = 45, softness: Double = 0) {
        self.enabled = enabled
        self.depth = depth
        self.size = size
        self.angle = angle
        self.softness = softness
    }
}

public struct FillOverlayEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var color: String
    public var opacity: Double

    public init(enabled: Bool = true, color: String = "#ffffff", opacity: Double = 0.5) {
        self.enabled = enabled
        self.color = color
        self.opacity = opacity
    }
}

public struct GradientOverlayEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var stops: [GradientStop]
    public var angle: Double
    public var opacity: Double

    public init(enabled: Bool = true, stops: [GradientStop] = [], angle: Double = 90, opacity: Double = 1.0) {
        self.enabled = enabled
        self.stops = stops
        self.angle = angle
        self.opacity = opacity
    }
}

public struct StrokeOverlayEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var color: String
    public var width: Double
    public var position: String
    public var opacity: Double

    public init(enabled: Bool = true, color: String = "#ffffff", width: Double = 1, position: String = "center", opacity: Double = 1.0) {
        self.enabled = enabled
        self.color = color
        self.width = width
        self.position = position
        self.opacity = opacity
    }
}

public struct BlurEffect: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var radius: Double

    public init(enabled: Bool = true, radius: Double = 10.0) {
        self.enabled = enabled
        self.radius = max(0, radius)
    }
}

public struct LayerEffects: Codable, Sendable, Equatable {
    public var gaussianBlur: BlurEffect?
    public var blur: BlurEffect? {
        get { gaussianBlur }
        set { gaussianBlur = newValue }
    }
    public var shadow: DropShadowEffect?
    public var glow: OuterGlowEffect?
    public var innerShadow: InnerShadowEffect?
    public var innerGlow: InnerGlowEffect?
    public var satin: SatinEffect?
    public var bevel: BevelEffect?
    public var fill: FillOverlayEffect?
    public var gradientOverlay: GradientOverlayEffect?
    public var stroke: StrokeOverlayEffect?

    public init(
        gaussianBlur: BlurEffect? = nil,
        shadow: DropShadowEffect? = nil,
        glow: OuterGlowEffect? = nil,
        innerShadow: InnerShadowEffect? = nil,
        innerGlow: InnerGlowEffect? = nil,
        satin: SatinEffect? = nil,
        bevel: BevelEffect? = nil,
        fill: FillOverlayEffect? = nil,
        gradientOverlay: GradientOverlayEffect? = nil,
        stroke: StrokeOverlayEffect? = nil
    ) {
        self.gaussianBlur = gaussianBlur
        self.shadow = shadow
        self.glow = glow
        self.innerShadow = innerShadow
        self.innerGlow = innerGlow
        self.satin = satin
        self.bevel = bevel
        self.fill = fill
        self.gradientOverlay = gradientOverlay
        self.stroke = stroke
    }

    public var isEmpty: Bool {
        gaussianBlur == nil && shadow == nil && glow == nil && innerShadow == nil &&
        innerGlow == nil && satin == nil && bevel == nil && fill == nil &&
        gradientOverlay == nil && stroke == nil
    }
}

// MARK: - Layer Adjustments (Non-destructive)

public struct LayerAdjustments: Codable, Sendable, Equatable {
    public var brightness: Double
    public var contrast: Double
    public var saturation: Double
    public var exposure: Double
    public var hue: Double
    public var temperature: Double
    public var tint: Double
    public var highlights: Double
    public var shadows: Double
    public var vibrance: Double
    public var blur: Double

    public init(
        brightness: Double = 0,
        contrast: Double = 0,
        saturation: Double = 0,
        exposure: Double = 0,
        hue: Double = 0,
        temperature: Double = 0,
        tint: Double = 0,
        highlights: Double = 0,
        shadows: Double = 0,
        vibrance: Double = 0,
        blur: Double = 0
    ) {
        self.brightness = brightness
        self.contrast = contrast
        self.saturation = saturation
        self.exposure = exposure
        self.hue = hue
        self.temperature = temperature
        self.tint = tint
        self.highlights = highlights
        self.shadows = shadows
        self.vibrance = vibrance
        self.blur = blur
    }

    public var isDefault: Bool {
        brightness == 0 && contrast == 0 && saturation == 0 && exposure == 0 &&
        hue == 0 && temperature == 0 && tint == 0 && highlights == 0 &&
        shadows == 0 && vibrance == 0 && blur == 0
    }
}

// MARK: - Vector Boolean Topology Elements

public enum BooleanOperationType: String, Codable, Sendable, CaseIterable, Equatable {
    case add       = "add"
    case subtract  = "subtract"
    case intersect = "intersect"
    case xor       = "xor"
    case divide    = "divide"
    case union     = "union"
    case exclude   = "exclude"
}

public struct BooleanSource: Codable, Sendable, Equatable {
    public var id: String
    public var type: String
    public var x: CGFloat
    public var y: CGFloat
    public var w: CGFloat
    public var h: CGFloat
    public var rotation: CGFloat
    public var cornerRadius: CGFloat?
    public var points: [CGPoint]?
    public var booleanOperation: String?
    public var booleanSources: [BooleanSource]?

    public init(id: String, type: String, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, rotation: CGFloat = 0) {
        self.id = id
        self.type = type
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.rotation = rotation
    }
}

// MARK: - Core Visual Node Model (`VOONode`)

/// Comprehensive VOO Node AST element representing all vector and raster scene layers.
public struct VOONode: Codable, Sendable, Equatable, Identifiable {
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

// MARK: - Root Scene Document AST (`VOODocument`)

/// Top-level VOO Design Scene Document AST.
public struct VOODocument: Codable, Sendable, Equatable {
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
