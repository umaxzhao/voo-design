//
//  MetalRenderPipeline.swift
//  native_studio
//
//  Metal Runtime JIT Render Pipeline & 16 Core Blend Modes Engine
//  for VOO Design Native Studio (Milestone M3).
//

import AppKit
import CoreGraphics
import CoreImage
import Foundation
import Metal
import MetalKit

// MARK: - Layer Blend Mode Definition (16 Core Modes)

public enum LayerBlendMode: String, Codable, CaseIterable, Sendable, Equatable {
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

    public var metalIndex: Int32 {
        switch self {
        case .normal: return 0
        case .multiply: return 1
        case .screen: return 2
        case .overlay: return 3
        case .darken: return 4
        case .lighten: return 5
        case .colorDodge: return 6
        case .colorBurn: return 7
        case .hardLight: return 8
        case .softLight: return 9
        case .difference: return 10
        case .exclusion: return 11
        case .hue: return 12
        case .saturation: return 13
        case .color: return 14
        case .luminosity: return 15
        }
    }

    /// Apple CoreGraphics CGBlendMode mapping.
    /// Note: CGBlendMode.softLight is 8 and CGBlendMode.hardLight is 9 in Apple SDK.
    public var cgBlendMode: CGBlendMode {
        switch self {
        case .normal: return .normal
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
        }
    }

    public var displayName: String {
        switch self {
        case .normal: return "正常 (Normal)"
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
        }
    }

    public init?(blendMode: BlendMode) {
        self.init(rawValue: blendMode.rawValue)
    }

    public var blendMode: BlendMode? {
        return BlendMode(rawValue: self.rawValue)
    }
}

// MARK: - Pixel Color Representation

public struct PixelColor: Equatable, Sendable {
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

// MARK: - Analytical Blend Mathematics (W3C Standard)

public final class BlendMath {
    /// Evaluates single-channel separable blend math matching MSL shader kernels.
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
            if d <= 0.0 { return 0.0 }
            return min(1.0, d / (1.0 - s))
        case .colorBurn:
            if s <= 0.0 { return 0.0 }
            if d >= 1.0 { return 1.0 }
            return max(0.0, 1.0 - (1.0 - d) / s)
        case .hardLight:
            return s < 0.5 ? (2.0 * s * d) : (1.0 - 2.0 * (1.0 - s) * (1.0 - d))
        case .softLight:
            if s <= 0.5 {
                return d - (1.0 - 2.0 * s) * d * (1.0 - d)
            } else {
                let dVal: CGFloat = (d <= 0.25) ? (((16.0 * d - 12.0) * d + 4.0) * d) : sqrt(d)
                return d + (2.0 * s - 1.0) * (dVal - d)
            }
        case .difference:
            return abs(s - d)
        case .exclusion:
            return s + d - 2.0 * s * d
        case .hue, .saturation, .color, .luminosity:
            return 0.5 * s + 0.5 * d
        }
    }

    /// Evaluates full Porter-Duff alpha composited blend of source over destination.
    public static func blend(mode: LayerBlendMode, src: PixelColor, dst: PixelColor) -> PixelColor {
        let outR = blendComponent(mode: mode, s: src.r, d: dst.r)
        let outG = blendComponent(mode: mode, s: src.g, d: dst.g)
        let outB = blendComponent(mode: mode, s: src.b, d: dst.b)
        let outA = src.a + dst.a * (1.0 - src.a)
        if outA > 0.0001 && src.a < 1.0 {
            let blendedR = (src.a * outR + dst.a * (1.0 - src.a) * dst.r) / outA
            let blendedG = (src.a * outG + dst.a * (1.0 - src.a) * dst.g) / outA
            let blendedB = (src.a * outB + dst.a * (1.0 - src.a) * dst.b) / outA
            return PixelColor(r: blendedR, g: blendedG, b: blendedB, a: outA)
        }
        return PixelColor(r: outR, g: outG, b: outB, a: outA)
    }
}

// MARK: - Metal Render Pipeline

public final class MetalRenderPipeline {
    public static let shared = MetalRenderPipeline()

    public let device: MTLDevice?
    public let commandQueue: MTLCommandQueue?
    public let ciContext: CIContext
    private var blendPipelineState: MTLComputePipelineState?
    public private(set) var compiledShadersCount: Int = 0

    public var isMetalAvailable: Bool {
        return device != nil && commandQueue != nil && blendPipelineState != nil
    }

    public init() {
        if let dev = MTLCreateSystemDefaultDevice() {
            self.device = dev
            self.commandQueue = dev.makeCommandQueue()
            self.ciContext = CIContext(mtlDevice: dev, options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
            let (pso, count) = Self.compileBlendPipeline(on: dev)
            self.blendPipelineState = pso
            self.compiledShadersCount = count
        } else {
            self.device = nil
            self.commandQueue = nil
            self.ciContext = CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
            self.blendPipelineState = nil
            self.compiledShadersCount = 0
        }
    }

    private static func compileBlendPipeline(on device: MTLDevice) -> (pipeline: MTLComputePipelineState?, count: Int) {
        do {
            let library = try device.makeLibrary(source: ShaderLibrary.blendLayersMSL, options: nil)
            guard let function = library.makeFunction(name: "blendLayers") else {
                return (nil, 0)
            }
            let pso = try device.makeComputePipelineState(function: function)
            return (pso, 1)
        } catch {
            return (nil, 0)
        }
    }

    public func getMetalDevice() -> MTLDevice? {
        return device ?? MTLCreateSystemDefaultDevice()
    }

    public func compileJITShader(source: String) throws -> Bool {
        guard let dev = getMetalDevice() else { return false }
        let _ = try dev.makeLibrary(source: source, options: nil)
        compiledShadersCount += 1
        return true
    }

    public func calculateThreadgroups(width: Int, height: Int, groupSize: Int = 16) -> (groupsX: Int, groupsY: Int) {
        let g = max(1, groupSize)
        let gx = (width + g - 1) / g
        let gy = (height + g - 1) / g
        return (max(1, gx), max(1, gy))
    }

    public func metalBlendModeIndex(for mode: LayerBlendMode) -> Int32 {
        return mode.metalIndex
    }

    public func cgBlendMode(for mode: LayerBlendMode) -> CGBlendMode {
        return mode.cgBlendMode
    }

    // MARK: - Texture & Image Conversion

    public func createTexture(from image: CGImage) -> MTLTexture? {
        guard let device = device else { return nil }
        let width = image.width
        let height = image.height
        guard width > 0 && height > 0 else { return nil }

        let desc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .rgba8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        desc.usage = [.shaderRead, .shaderWrite]
        guard let texture = device.makeTexture(descriptor: desc) else { return nil }

        let bytesPerRow = width * 4
        var rawData = [UInt8](repeating: 0, count: bytesPerRow * height)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        if let ctx = CGContext(
            data: &rawData,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) {
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            texture.replace(
                region: MTLRegionMake2D(0, 0, width, height),
                mipmapLevel: 0,
                withBytes: rawData,
                bytesPerRow: bytesPerRow
            )
            return texture
        }
        return nil
    }

    public func createTexture(from bitmap: NSBitmapImageRep) -> MTLTexture? {
        guard let device = device,
              let bitmapData = bitmap.bitmapData else { return nil }
        let width = bitmap.pixelsWide
        let height = bitmap.pixelsHigh
        guard width > 0 && height > 0 else { return nil }

        let desc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .rgba8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        desc.usage = [.shaderRead, .shaderWrite]
        guard let texture = device.makeTexture(descriptor: desc) else { return nil }
        texture.replace(
            region: MTLRegionMake2D(0, 0, width, height),
            mipmapLevel: 0,
            withBytes: bitmapData,
            bytesPerRow: bitmap.bytesPerRow
        )
        return texture
    }

    public func createCGImage(from texture: MTLTexture) -> CGImage? {
        let width = texture.width
        let height = texture.height
        let bytesPerRow = width * 4
        var rawData = [UInt8](repeating: 0, count: bytesPerRow * height)
        texture.getBytes(
            &rawData,
            bytesPerRow: bytesPerRow,
            from: MTLRegionMake2D(0, 0, width, height),
            mipmapLevel: 0
        )
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let provider = CGDataProvider(data: Data(rawData) as CFData) else { return nil }
        return CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
        )
    }

    // MARK: - Blending & Rendering Execution

    public func applyBlendMode(
        _ mode: LayerBlendMode,
        source: CGImage,
        destination: CGImage
    ) -> CGImage? {
        let width = destination.width
        let height = destination.height
        guard width > 0 && height > 0 else { return nil }

        if isMetalAvailable,
           let baseTex = createTexture(from: destination),
           let overlayTex = createTexture(from: source),
           let queue = commandQueue,
           let pso = blendPipelineState {

            let desc = MTLTextureDescriptor.texture2DDescriptor(
                pixelFormat: .rgba8Unorm,
                width: width,
                height: height,
                mipmapped: false
            )
            desc.usage = [.shaderRead, .shaderWrite]
            guard let destTex = device?.makeTexture(descriptor: desc),
                  let cmdBuffer = queue.makeCommandBuffer(),
                  let encoder = cmdBuffer.makeComputeCommandEncoder() else {
                return applyBlendModeFallback(mode, source: source, destination: destination)
            }

            encoder.setComputePipelineState(pso)
            encoder.setTexture(baseTex, index: 0)
            encoder.setTexture(overlayTex, index: 1)
            encoder.setTexture(destTex, index: 2)
            var modeIdx = mode.metalIndex
            var opVal: Float = 1.0
            encoder.setBytes(&modeIdx, length: MemoryLayout<Int32>.size, index: 0)
            encoder.setBytes(&opVal, length: MemoryLayout<Float>.size, index: 1)

            let tgSize = MTLSize(width: 16, height: 16, depth: 1)
            let (gx, gy) = calculateThreadgroups(width: width, height: height, groupSize: 16)
            let tgCount = MTLSize(width: gx, height: gy, depth: 1)
            encoder.dispatchThreadgroups(tgCount, threadsPerThreadgroup: tgSize)
            encoder.endEncoding()
            cmdBuffer.commit()
            cmdBuffer.waitUntilCompleted()

            if let resultImage = createCGImage(from: destTex) {
                return resultImage
            }
        }

        return applyBlendModeFallback(mode, source: source, destination: destination)
    }

    private func applyBlendModeFallback(
        _ mode: LayerBlendMode,
        source: CGImage,
        destination: CGImage
    ) -> CGImage? {
        let width = destination.width
        let height = destination.height
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }

        let rect = CGRect(x: 0, y: 0, width: width, height: height)
        ctx.draw(destination, in: rect)
        ctx.setBlendMode(mode.cgBlendMode)
        ctx.draw(source, in: rect)
        return ctx.makeImage()
    }

    public func blend(
        base: NSBitmapImageRep,
        overlay: NSBitmapImageRep,
        mode: LayerBlendMode,
        opacity: CGFloat = 1.0
    ) -> Bool {
        guard let device = device, let queue = commandQueue, let pso = blendPipelineState else {
            return false
        }
        guard let baseTex = createTexture(from: base),
              let overlayTex = createTexture(from: overlay) else {
            return false
        }
        let width = base.pixelsWide
        let height = base.pixelsHigh
        guard overlay.pixelsWide == width && overlay.pixelsHigh == height else {
            return false
        }

        let desc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .rgba8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        desc.usage = [.shaderRead, .shaderWrite]
        guard let destTex = device.makeTexture(descriptor: desc) else { return false }

        guard let cmdBuffer = queue.makeCommandBuffer(),
              let encoder = cmdBuffer.makeComputeCommandEncoder() else { return false }

        encoder.setComputePipelineState(pso)
        encoder.setTexture(baseTex, index: 0)
        encoder.setTexture(overlayTex, index: 1)
        encoder.setTexture(destTex, index: 2)
        var modeIdx = metalBlendModeIndex(for: mode)
        var opVal = Float(opacity)
        encoder.setBytes(&modeIdx, length: MemoryLayout<Int32>.size, index: 0)
        encoder.setBytes(&opVal, length: MemoryLayout<Float>.size, index: 1)

        let threadgroupSize = MTLSize(width: 16, height: 16, depth: 1)
        let (gx, gy) = calculateThreadgroups(width: width, height: height, groupSize: 16)
        let threadgroups = MTLSize(width: gx, height: gy, depth: 1)
        encoder.dispatchThreadgroups(threadgroups, threadsPerThreadgroup: threadgroupSize)
        encoder.endEncoding()
        cmdBuffer.commit()
        cmdBuffer.waitUntilCompleted()

        if let basePtr = base.bitmapData {
            destTex.getBytes(
                basePtr,
                bytesPerRow: base.bytesPerRow,
                from: MTLRegionMake2D(0, 0, width, height),
                mipmapLevel: 0
            )
            return true
        }
        return false
    }

    public func render(
        layers: [VOONode],
        viewportRect: CGRect,
        zoom: CGFloat,
        in context: CGContext
    ) {
        context.saveGState()
        context.clip(to: viewportRect)
        context.scaleBy(x: zoom, y: zoom)
        context.translateBy(x: -viewportRect.origin.x, y: -viewportRect.origin.y)

        for layer in layers where layer.visible {
            context.saveGState()
            context.setAlpha(layer.opacity)
            if let blend = LayerBlendMode(rawValue: layer.blendMode) {
                context.setBlendMode(blend.cgBlendMode)
            } else if let mode = BlendMode(rawValue: layer.blendMode) {
                context.setBlendMode(RasterEngine.cgBlendMode(for: mode))
            }

            let b = layer.bounds
            switch layer.kind {
            case .rect:
                if let radii = layer.cornerRadii, (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0) {
                    let r = min(radii.tl, min(b.width / 2, b.height / 2))
                    let path = CGPath(roundedRect: b, cornerWidth: r, cornerHeight: r, transform: nil)
                    context.addPath(path)
                    context.setFillColor(CGColor(red: 0.7, green: 1.0, blue: 0.84, alpha: 1.0))
                    context.fillPath()
                } else {
                    context.setFillColor(CGColor(red: 0.7, green: 1.0, blue: 0.84, alpha: 1.0))
                    context.fill(b)
                }
            case .ellipse:
                context.setFillColor(CGColor(red: 0.7, green: 1.0, blue: 0.84, alpha: 1.0))
                context.fillEllipse(in: b)
            case .path:
                if let points = layer.points, !points.isEmpty {
                    let cgPath = CGMutablePath()
                    cgPath.move(to: points[0].point)
                    for i in 1..<points.count {
                        let prev = points[i - 1]
                        let curr = points[i]
                        let cp1 = prev.outHandle ?? prev.point
                        let cp2 = curr.inHandle ?? curr.point
                        cgPath.addCurve(to: curr.point, control1: cp1, control2: cp2)
                    }
                    context.addPath(cgPath)
                    context.setFillColor(CGColor(red: 0.7, green: 1.0, blue: 0.84, alpha: 1.0))
                    context.fillPath()
                } else {
                    context.setFillColor(CGColor(red: 0.7, green: 1.0, blue: 0.84, alpha: 1.0))
                    context.fill(b)
                }
            default:
                context.setFillColor(CGColor(red: 0.7, green: 1.0, blue: 0.84, alpha: 1.0))
                context.fill(b)
            }
            context.restoreGState()
        }
        context.restoreGState()
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
