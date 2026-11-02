import CoreGraphics
import Foundation

public struct GradientStop: Codable, Sendable, Equatable {
    public var offset: Double  // 0.0 .. 1.0
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

    public init(
        enabled: Bool = true, color: String = "#000000", blur: Double = 10, offsetX: Double = 0,
        offsetY: Double = 4, spread: Double = 0, opacity: Double = 0.5
    ) {
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

    public init(
        enabled: Bool = true, color: String = "#b2ffd6", blur: Double = 8, spread: Double = 0,
        opacity: Double = 0.6
    ) {
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

    public init(
        enabled: Bool = true, color: String = "#000000", blur: Double = 6, offsetX: Double = 0,
        offsetY: Double = 2, spread: Double = 0, opacity: Double = 0.4
    ) {
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

    public init(
        enabled: Bool = true, color: String = "#ffffff", blur: Double = 6, size: Double = 2,
        opacity: Double = 0.4
    ) {
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

    public init(
        enabled: Bool = true, color: String = "#000000", blur: Double = 8, distance: Double = 8,
        angle: Double = 45, invert: Bool = false, opacity: Double = 0.3
    ) {
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

    public init(
        enabled: Bool = true, depth: Double = 100, size: Double = 5, angle: Double = 45,
        softness: Double = 0
    ) {
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

    public init(
        enabled: Bool = true, stops: [GradientStop] = [], angle: Double = 90, opacity: Double = 1.0
    ) {
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

    public init(
        enabled: Bool = true, color: String = "#ffffff", width: Double = 1,
        position: String = "center",
        opacity: Double = 1.0
    ) {
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
        gaussianBlur == nil && shadow == nil && glow == nil && innerShadow == nil
            && innerGlow == nil
            && satin == nil && bevel == nil && fill == nil && gradientOverlay == nil
            && stroke == nil
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
        brightness == 0 && contrast == 0 && saturation == 0 && exposure == 0 && hue == 0
            && temperature == 0 && tint == 0 && highlights == 0 && shadows == 0 && vibrance == 0
            && blur == 0
    }
}

// MARK: - Vector Boolean Topology Elements
