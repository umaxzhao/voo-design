//
//  RasterEngine.swift
//  native_studio
//
//  Dynamic Nozzle Raster Brush Engine & In-Flight Dab Buffer
//  for VOO Design Native Studio (Milestone M3).
//

import AppKit
import CoreGraphics
import CoreImage
import Foundation

// MARK: - Brush Data Models & Presets

public struct BrushPreset: Equatable, @unchecked Sendable {
    public var name: String
    public var diameter: CGFloat
    public var hardness: CGFloat // 0.0 (soft airbrush) to 1.0 (hard edge)
    public var flow: CGFloat     // 0.0 to 1.0
    public var opacity: CGFloat  // 0.0 to 1.0
    public var spacing: CGFloat  // fraction of diameter, e.g. 0.15 = 15%
    public var color: NSColor
    public var isEraser: Bool
    public var desc: String

    public var size: CGFloat {
        get { diameter }
        set { diameter = newValue }
    }

    public init(
        name: String = "Standard Round",
        diameter: CGFloat = 20.0,
        hardness: CGFloat = 0.8,
        flow: CGFloat = 0.5,
        opacity: CGFloat = 1.0,
        spacing: CGFloat = 0.15,
        color: NSColor = .black,
        isEraser: Bool = false,
        desc: String = ""
    ) {
        self.name = name
        self.diameter = max(1.0, diameter)
        self.hardness = min(max(hardness, 0.0), 1.0)
        self.flow = min(max(flow, 0.0), 1.0)
        self.opacity = min(max(opacity, 0.0), 1.0)
        self.spacing = max(0.01, spacing)
        self.color = color
        self.isEraser = isEraser
        self.desc = desc
    }

    public init(
        diameter: CGFloat,
        hardness: CGFloat = 0.8,
        flow: CGFloat = 0.5,
        spacing: CGFloat = 0.15,
        isEraser: Bool = false
    ) {
        self.init(
            name: "Standard Round",
            diameter: diameter,
            hardness: hardness,
            flow: flow,
            opacity: 1.0,
            spacing: spacing,
            color: .black,
            isEraser: isEraser,
            desc: ""
        )
    }

    public init(diameter: CGFloat, spacing: CGFloat) {
        self.init(
            name: "Standard Round",
            diameter: diameter,
            hardness: 0.8,
            flow: 0.5,
            opacity: 1.0,
            spacing: spacing,
            color: .black,
            isEraser: false,
            desc: ""
        )
    }

    public init(name: String, size: CGFloat, hardness: CGFloat, flow: CGFloat, desc: String = "") {
        self.init(
            name: name,
            diameter: size,
            hardness: hardness,
            flow: flow,
            opacity: 1.0,
            spacing: 0.15,
            color: .black,
            isEraser: false,
            desc: desc
        )
    }

    public static func == (lhs: BrushPreset, rhs: BrushPreset) -> Bool {
        return lhs.name == rhs.name &&
            abs(lhs.diameter - rhs.diameter) < 0.0001 &&
            abs(lhs.hardness - rhs.hardness) < 0.0001 &&
            abs(lhs.flow - rhs.flow) < 0.0001 &&
            abs(lhs.opacity - rhs.opacity) < 0.0001 &&
            abs(lhs.spacing - rhs.spacing) < 0.0001 &&
            lhs.isEraser == rhs.isEraser &&
            lhs.desc == rhs.desc
    }
}

public struct BrushDab: Equatable, Sendable {
    public var position: CGPoint
    public var radius: CGFloat
    public var opacity: CGFloat

    public init(position: CGPoint, radius: CGFloat, opacity: CGFloat) {
        self.position = position
        self.radius = max(0.5, radius)
        self.opacity = min(max(opacity, 0.0), 1.0)
    }

    /// Evaluates smoothstep radial falloff at a given Euclidean distance from dab center.
    /// Uses cubic Hermite polynomial t^2 * (3 - 2t) to eliminate edge banding.
    public func radialFalloff(distance: CGFloat) -> CGFloat {
        let normDist = distance / radius
        if normDist >= 1.0 { return 0.0 }
        let t = 1.0 - normDist
        return t * t * (3.0 - 2.0 * t)
    }
}

// MARK: - In-Flight Dab Buffer

public final class InFlightDabBuffer {
    public let size: CGSize
    public let color: NSColor
    public let brushSize: CGFloat
    public let opacity: CGFloat
    public let flow: CGFloat
    public let hardness: CGFloat
    public let blendMode: BlendMode
    public let isEraser: Bool

    public var residualDistance: CGFloat = 0.0
    public var lastPoint: CGPoint = .zero

    public let strokeBitmap: NSBitmapImageRep
    public private(set) var dirtyRect: CGRect = .null

    private let width: Int
    private let height: Int
    private let bytesPerRow: Int
    private let bitmapData: UnsafeMutablePointer<UInt8>

    private let redByte: UInt8
    private let greenByte: UInt8
    private let blueByte: UInt8

    public init(
        size: CGSize,
        color: NSColor = .black,
        brushSize: CGFloat = 20.0,
        opacity: CGFloat = 1.0,
        flow: CGFloat = 0.5,
        hardness: CGFloat = 0.8,
        blendMode: BlendMode = .sourceOver,
        isEraser: Bool = false
    ) {
        self.size = size
        self.brushSize = max(0.5, brushSize)
        self.opacity = max(0.0, min(1.0, opacity))
        self.flow = max(0.0, min(1.0, flow))
        self.hardness = max(0.0, min(1.0, hardness))
        self.blendMode = blendMode
        self.isEraser = isEraser

        let effectiveWidth = max(1, Int(size.width))
        let effectiveHeight = max(1, Int(size.height))
        self.width = effectiveWidth
        self.height = effectiveHeight

        guard let rep = RasterEngine.createBitmap(size: CGSize(width: effectiveWidth, height: effectiveHeight)) else {
            fatalError("Failed to allocate in-flight stroke bitmap")
        }
        self.strokeBitmap = rep
        self.bytesPerRow = rep.bytesPerRow
        self.bitmapData = rep.bitmapData!

        let rgbColor = color.usingColorSpace(.sRGB) ?? color.usingColorSpace(.deviceRGB) ?? NSColor(srgbRed: 0, green: 0, blue: 0, alpha: 1)
        self.color = rgbColor
        self.redByte = UInt8(max(0.0, min(255.0, round(rgbColor.redComponent * 255.0))))
        self.greenByte = UInt8(max(0.0, min(255.0, round(rgbColor.greenComponent * 255.0))))
        self.blueByte = UInt8(max(0.0, min(255.0, round(rgbColor.blueComponent * 255.0))))
    }

    /// Begin a stroke by stamping the initial dab at starting point
    public func begin(at point: CGPoint) {
        lastPoint = point
        residualDistance = 0.0
        dab(at: point)
    }

    /// Step stroke from lastPoint to destination point with adaptive sub-spacing stepping and residual tracking
    public func step(to point: CGPoint) {
        let from = lastPoint
        let to = point
        let dist = hypot(to.x - from.x, to.y - from.y)
        guard dist > 0.0001 else { return }

        // Adaptive spacing: 15% of brush diameter, at least 1.0 pixel
        let spacing = max(1.0, brushSize * 0.15)
        let totalDistance = residualDistance + dist

        if totalDistance < spacing {
            residualDistance += dist
            lastPoint = to
            return
        }

        var currentDistance = spacing - residualDistance
        while currentDistance <= dist {
            let t = currentDistance / dist
            let dabPoint = CGPoint(
                x: from.x + (to.x - from.x) * t,
                y: from.y + (to.y - from.y) * t
            )
            dab(at: dabPoint)
            currentDistance += spacing
        }

        residualDistance = dist - (currentDistance - spacing)
        lastPoint = to
    }

    /// Stamp a single continuous radial gradient dab with smoothstep falloff and opacity ceiling
    public func dab(at point: CGPoint) {
        guard opacity > 0.001 && flow > 0.001 else { return }
        let cx = point.x
        let cy = point.y
        let radius = brushSize / 2.0
        guard radius >= 0.5 else { return }

        let minX = max(0, Int(floor(cx - radius)))
        let maxX = min(width - 1, Int(ceil(cx + radius)))
        let minY = max(0, Int(floor(cy - radius)))
        let maxY = min(height - 1, Int(ceil(cy + radius)))
        guard minX <= maxX && minY <= maxY else { return }

        let dabRect = CGRect(
            x: CGFloat(minX),
            y: CGFloat(minY),
            width: CGFloat(maxX - minX + 1),
            height: CGFloat(maxY - minY + 1)
        )
        dirtyRect = dirtyRect.isNull ? dabRect : dirtyRect.union(dabRect)

        let R = Double(radius)
        let R2 = R * R
        let h = Double(hardness)
        let op = Double(opacity)
        let fl = Double(flow)

        for y in minY...maxY {
            let dy = Double(y) + 0.5 - Double(cy)
            let dy2 = dy * dy
            let rowOffset = y * bytesPerRow

            for x in minX...maxX {
                let dx = Double(x) + 0.5 - Double(cx)
                let d2 = dx * dx + dy2
                if d2 > R2 { continue }

                let dist = sqrt(d2)
                let norm = dist / R

                // Continuous radial falloff using smoothstep: A(r) = 1 - smoothstep(h, 1.0, r/R)
                let dabAlpha: Double
                if h >= 0.99 {
                    dabAlpha = 1.0
                } else if norm <= h {
                    dabAlpha = 1.0
                } else {
                    let t = (norm - h) / max(0.0001, 1.0 - h)
                    let smooth = t * t * (3.0 - 2.0 * t)
                    dabAlpha = max(0.0, 1.0 - smooth)
                }

                let off = rowOffset + x * 4
                let currentAlpha = Double(bitmapData[off + 3]) / 255.0

                // In-flight flow accumulation with strict opacity ceiling:
                // deltaAlpha = alpha_dab * flow * (opacity - alpha_current)
                let deltaAlpha = dabAlpha * fl * (op - currentAlpha)
                if deltaAlpha > 0.0001 {
                    let newAlpha = min(op, currentAlpha + deltaAlpha)
                    bitmapData[off + 3] = UInt8(max(0, min(255, round(newAlpha * 255.0))))
                    bitmapData[off + 0] = redByte
                    bitmapData[off + 1] = greenByte
                    bitmapData[off + 2] = blueByte
                }
            }
        }
    }

    /// Commit accumulated stroke into destination raster bitmap
    public func commit(into destination: NSBitmapImageRep) {
        guard !dirtyRect.isNull, let destData = destination.bitmapData else { return }

        let destWidth = destination.pixelsWide
        let destHeight = destination.pixelsHigh
        let destBytesPerRow = destination.bytesPerRow

        let minX = max(0, min(destWidth - 1, Int(floor(dirtyRect.minX))))
        let maxX = max(0, min(destWidth - 1, Int(ceil(dirtyRect.maxX))))
        let minY = max(0, min(destHeight - 1, Int(floor(dirtyRect.minY))))
        let maxY = max(0, min(destHeight - 1, Int(ceil(dirtyRect.maxY))))
        guard minX <= maxX && minY <= maxY else { return }

        if isEraser {
            for y in minY...maxY {
                let rowOff = y * bytesPerRow
                let destRowOff = y * destBytesPerRow
                for x in minX...maxX {
                    let off = rowOff + x * 4
                    let strokeA = Double(bitmapData[off + 3]) / 255.0
                    guard strokeA > 0.0001 else { continue }

                    let factor = max(0.0, 1.0 - strokeA)
                    let destOff = destRowOff + x * 4
                    destData[destOff + 0] = UInt8(round(Double(destData[destOff + 0]) * factor))
                    destData[destOff + 1] = UInt8(round(Double(destData[destOff + 1]) * factor))
                    destData[destOff + 2] = UInt8(round(Double(destData[destOff + 2]) * factor))
                    destData[destOff + 3] = UInt8(round(Double(destData[destOff + 3]) * factor))
                }
            }
        } else {
            NSGraphicsContext.saveGraphicsState()
            if let ctx = NSGraphicsContext(bitmapImageRep: destination) {
                NSGraphicsContext.current = ctx
                let cgCtx = ctx.cgContext
                cgCtx.setBlendMode(RasterEngine.cgBlendMode(for: blendMode))
                if let cgImage = strokeBitmap.cgImage {
                    cgCtx.draw(cgImage, in: CGRect(origin: .zero, size: destination.size))
                }
            }
            NSGraphicsContext.restoreGraphicsState()
        }
    }
}

// MARK: - Raster Brush Engine

public final class RasterBrushEngine {
    public private(set) var dabBuffer: [BrushDab] = []

    public init() {}

    /// Test-compatible dab generator returning an array of evaluated BrushDab tokens
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

    /// PROJECT.md Contract: Stroke dabs directly into a CGContext
    public func strokeDabs(
        from: CGPoint,
        to: CGPoint,
        brush: BrushPreset,
        target: CGContext
    ) {
        let dabs = strokeDabs(from: from, to: to, brush: brush)
        target.saveGState()
        target.setAlpha(brush.opacity)
        for dab in dabs {
            let rect = CGRect(
                x: dab.position.x - dab.radius,
                y: dab.position.y - dab.radius,
                width: dab.radius * 2.0,
                height: dab.radius * 2.0
            )
            target.setFillColor(brush.color.withAlphaComponent(dab.opacity).cgColor)
            target.fillEllipse(in: rect)
        }
        target.restoreGState()
    }

    public func clearBuffer() {
        dabBuffer.removeAll()
    }
}

// MARK: - Main Raster Engine

public class RasterEngine {
    public static func createBitmap(size: CGSize) -> NSBitmapImageRep? {
        guard size.width > 0 && size.height > 0 else { return nil }
        let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: Int(size.width),
            pixelsHigh: Int(size.height),
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .calibratedRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        )
        if let data = rep?.bitmapData, let r = rep {
            memset(data, 0, r.bytesPerRow * r.pixelsHigh)
        }
        return rep
    }

    public static func cgBlendMode(for mode: BlendMode) -> CGBlendMode {
        switch mode {
        case .sourceOver: return .normal
        case .multiply: return .multiply
        case .screen: return .screen
        case .overlay: return .overlay
        case .darken: return .darken
        case .lighten: return .lighten
        case .colorDodge: return .colorDodge
        case .colorBurn: return .colorBurn
        case .hardLight: return .hardLight
        case .softLight: return .softLight
        case .difference: return .difference
        case .exclusion: return .exclusion
        case .hue: return .hue
        case .saturation: return .saturation
        case .color: return .color
        case .luminosity: return .luminosity
        default: return .normal
        }
    }

    public static func blendLayers(
        base: NSBitmapImageRep,
        overlay: NSBitmapImageRep,
        mode: BlendMode,
        opacity: CGFloat = 1.0
    ) {
        NSGraphicsContext.saveGraphicsState()
        if let ctx = NSGraphicsContext(bitmapImageRep: base) {
            NSGraphicsContext.current = ctx
            let cgCtx = ctx.cgContext
            cgCtx.setAlpha(opacity)
            cgCtx.setBlendMode(cgBlendMode(for: mode))
            if let cgImage = overlay.cgImage {
                cgCtx.draw(cgImage, in: CGRect(origin: .zero, size: base.size))
            }
        }
        NSGraphicsContext.restoreGraphicsState()
    }
}
