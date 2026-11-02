import Foundation
import CoreGraphics
import Metal

public enum LayerBlendMode: String, Codable, CaseIterable {
    case normal = "source-over"
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
}

public struct PixelColor: Equatable {
    public var r: CGFloat // 0.0 - 1.0
    public var g: CGFloat
    public var b: CGFloat
    public var a: CGFloat

    public init(r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat = 1.0) {
        self.r = min(max(r, 0.0), 1.0)
        self.g = min(max(g, 0.0), 1.0)
        self.b = min(max(b, 0.0), 1.0)
        self.a = min(max(a, 0.0), 1.0)
    }

    public static let black = PixelColor(r: 0, g: 0, b: 0, a: 1)
    public static let white = PixelColor(r: 1, g: 1, b: 1, a: 1)
    public static let red   = PixelColor(r: 1, g: 0, b: 0, a: 1)
}

public final class BlendMath {
    public static func blendComponent(mode: LayerBlendMode, s: CGFloat, d: CGFloat) -> CGFloat {
        switch mode {
        case .normal:
            return s
        case .multiply:
            return s * d
        case .screen:
            return 1.0 - (1.0 - s) * (1.0 - d)
        case .overlay:
            return d < 0.5 ? (2.0 * s * d) : (1.0 - 2.0 * (1.0 - s) * (1.0 - d))
        case .darken:
            return min(s, d)
        case .lighten:
            return max(s, d)
        case .colorDodge:
            if s >= 1.0 { return 1.0 }
            return min(1.0, d / (1.0 - s))
        case .colorBurn:
            if s <= 0.0 { return 0.0 }
            return max(0.0, 1.0 - (1.0 - d) / s)
        case .hardLight:
            return s < 0.5 ? (2.0 * s * d) : (1.0 - 2.0 * (1.0 - s) * (1.0 - d))
        case .softLight:
            return (1.0 - 2.0 * s) * d * d + 2.0 * s * d
        case .difference:
            return abs(s - d)
        case .exclusion:
            return s + d - 2.0 * s * d
        case .hue, .saturation, .color, .luminosity:
            // Approximate component mix for non-separable modes
            return 0.5 * s + 0.5 * d
        }
    }

    public static func blend(mode: LayerBlendMode, src: PixelColor, dst: PixelColor) -> PixelColor {
        let outR = blendComponent(mode: mode, s: src.r, d: dst.r)
        let outG = blendComponent(mode: mode, s: src.g, d: dst.g)
        let outB = blendComponent(mode: mode, s: src.b, d: dst.b)
        let outA = src.a + dst.a * (1.0 - src.a)
        return PixelColor(r: outR, g: outG, b: outB, a: outA)
    }
}

public final class MetalRenderPipeline {
    public static let shared = MetalRenderPipeline()
    public private(set) var compiledShadersCount: Int = 0

    public func getMetalDevice() -> MTLDevice? {
        return MTLCreateSystemDefaultDevice()
    }

    public func compileJITShader(source: String) throws -> Bool {
        guard let device = getMetalDevice() else { return false }
        let _ = try device.makeLibrary(source: source, options: nil)
        compiledShadersCount += 1
        return true
    }

    public func calculateThreadgroups(width: Int, height: Int, groupSize: Int = 16) -> (groupsX: Int, groupsY: Int) {
        let gx = (width + groupSize - 1) / groupSize
        let gy = (height + groupSize - 1) / groupSize
        return (max(1, gx), max(1, gy))
    }

    public func renderFallback(nodes: [VOONode], in rect: CGRect, context: CGContext) {
        context.setFillColor(CGColor(red: 0.09, green: 0.09, blue: 0.09, alpha: 1.0))
        context.fill(rect)
        for node in nodes where node.style.visible {
            context.saveGState()
            context.setAlpha(node.style.opacity)
            context.setFillColor(CGColor(red: 0.7, green: 1.0, blue: 0.84, alpha: 1.0))
            context.fill(node.bounds)
            context.restoreGState()
        }
    }
}

public struct BrushPreset: Equatable {
    public var diameter: CGFloat
    public var hardness: CGFloat // 0.0 (soft airbrush) to 1.0 (hard edge)
    public var flow: CGFloat     // 0.0 to 1.0
    public var spacing: CGFloat  // 0.15 = 15% diameter
    public var isEraser: Bool

    public init(diameter: CGFloat = 20.0, hardness: CGFloat = 0.8, flow: CGFloat = 0.5, spacing: CGFloat = 0.15, isEraser: Bool = false) {
        self.diameter = max(1.0, diameter)
        self.hardness = min(max(hardness, 0.0), 1.0)
        self.flow = min(max(flow, 0.0), 1.0)
        self.spacing = max(0.01, spacing)
        self.isEraser = isEraser
    }
}

public struct BrushDab: Equatable {
    public var position: CGPoint
    public var radius: CGFloat
    public var opacity: CGFloat

    public func radialFalloff(distance: CGFloat) -> CGFloat {
        let normDist = distance / radius
        if normDist >= 1.0 { return 0.0 }
        // Smoothstep: 3x^2 - 2x^3
        let t = 1.0 - normDist
        return t * t * (3.0 - 2.0 * t)
    }
}

public final class RasterBrushEngine {
    public private(set) var dabBuffer: [BrushDab] = []

    public init() {}

    public func strokeDabs(from p1: CGPoint, to p2: CGPoint, brush: BrushPreset) -> [BrushDab] {
        let dist = hypot(p2.x - p1.x, p2.y - p1.y)
        let step = max(1.0, brush.diameter * brush.spacing)
        let count = max(1, Int(dist / step))

        var dabs: [BrushDab] = []
        for i in 0...count {
            let t = count > 0 ? CGFloat(i) / CGFloat(count) : 0
            let pt = CGPoint(x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t)
            let dab = BrushDab(position: pt, radius: brush.diameter / 2.0, opacity: brush.flow)
            dabs.append(dab)
        }
        dabBuffer.append(contentsOf: dabs)
        return dabs
    }

    public func clearBuffer() {
        dabBuffer.removeAll()
    }
}
