import CoreGraphics
import Foundation

public enum BlendMode: String, Codable, Sendable, CaseIterable, Equatable {
    // 16 Canvas2D / CoreGraphics native modes
    case sourceOver = "source-over"
    case multiply = "multiply"
    case screen = "screen"
    case overlay = "overlay"
    case darken = "darken"
    case lighten = "lighten"
    case colorDodge = "color-dodge"
    case colorBurn = "color-burn"
    case hardLight = "hard-light"
    case softLight = "soft-light"
    case difference = "difference"
    case exclusion = "exclusion"
    case hue = "hue"
    case saturation = "saturation"
    case color = "color"
    case luminosity = "luminosity"

    // 9 Photoshop / Affinity per-pixel blend modes
    case dissolve = "dissolve"
    case linearBurn = "linear-burn"
    case linearDodge = "linear-dodge"
    case vividLight = "vivid-light"
    case linearLight = "linear-light"
    case pinLight = "pin-light"
    case hardMix = "hard-mix"
    case subtract = "subtract"
    case divide = "divide"

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
    public var strokeCap: String?  // "butt" | "round" | "square"
    public var strokeJoin: String?  // "miter" | "round" | "bevel"
    public var strokeMiterLimit: CGFloat?  // default 4.0
    public var strokeDash: [CGFloat]?  // e.g. [8, 4]
    public var strokeAlign: String?  // "inside" | "center" | "outside"
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
