//
//  M3_UnitTests.swift
//  native_studio
//
//  Milestone M3 Comprehensive Verification Suite:
//  - Metal Device & Runtime JIT Shader Compilation (MSL)
//  - 16 Core Blend Modes & W3C Color Space Mathematics
//  - Dynamic Nozzle Radial Falloff (Cubic Hermite Smoothstep)
//  - Flow Accumulation with Strict Opacity Ceiling
//  - Adaptive Step Interpolation & Fractional Residual Tracking
//  - InFlightDabBuffer DirtyRect Tracking & Eraser Mode Attenuation
//

import AppKit
import CoreGraphics
import Foundation
import Metal

@MainActor
func runM3Tests() {
    print("============================================================")
    print(" Running Milestone M3 Comprehensive Verification Suite")
    print("============================================================")

    var passed = 0
    var failed = 0

    func assert(_ condition: Bool, _ name: String) {
        if condition {
            print("  ✓ [PASS] \(name)")
            passed += 1
        } else {
            print("  ✗ [FAIL] \(name)")
            failed += 1
        }
    }

    func assertApprox(_ val: CGFloat, _ target: CGFloat, tolerance: CGFloat = 0.01, _ name: String) {
        if abs(val - target) <= tolerance {
            print("  ✓ [PASS] \(name)")
            passed += 1
        } else {
            print("  ✗ [FAIL] \(name) (expected ~\(target), got \(val))")
            failed += 1
        }
    }

    // ============================================================
    // Section 1: Metal Device & Runtime JIT Shader Compilation
    // ============================================================
    print("\n--- [Section 1] Metal Device & JIT Shader Compilation ---")

    let pipeline = MetalRenderPipeline.shared
    let device = pipeline.getMetalDevice()
    assert(device != nil, "1.1 Metal system default device initialized")
    if let dev = device {
        print("      Device name: \(dev.name)")
    }

    let initialCompiledCount = pipeline.compiledShadersCount
    assert(initialCompiledCount >= 1, "1.2 Initial pipeline contains compiled blend shader (count >= 1)")

    // JIT compilation of blendLayers MSL
    do {
        let compiledBlend = try pipeline.compileJITShader(source: ShaderLibrary.blendLayersMSL)
        assert(compiledBlend, "1.3 JIT compiled ShaderLibrary.blendLayersMSL successfully")
    } catch {
        assert(false, "1.3 JIT compiled ShaderLibrary.blendLayersMSL failed: \(error)")
    }

    // JIT compilation of brushKernelSource MSL
    do {
        let compiledBrush = try pipeline.compileJITShader(source: ShaderLibrary.brushKernelSource)
        assert(compiledBrush, "1.4 JIT compiled ShaderLibrary.brushKernelSource successfully")
    } catch {
        assert(false, "1.4 JIT compiled ShaderLibrary.brushKernelSource failed: \(error)")
    }

    // JIT compilation error handling for broken MSL
    var didCatchError = false
    do {
        _ = try pipeline.compileJITShader(source: "kernel void brokenSyntax(invalid input) {}")
    } catch {
        didCatchError = true
    }
    assert(didCatchError, "1.5 Malformed MSL syntax triggers compile error as expected")

    // Threadgroup calculations & boundary handling
    let tgZero = pipeline.calculateThreadgroups(width: 0, height: 0, groupSize: 16)
    assert(tgZero.groupsX >= 1 && tgZero.groupsY >= 1, "1.6 Zero-sized viewport returns >= 1 threadgroups (\(tgZero.groupsX), \(tgZero.groupsY))")

    let tgSingle = pipeline.calculateThreadgroups(width: 1, height: 1, groupSize: 16)
    assert(tgSingle.groupsX == 1 && tgSingle.groupsY == 1, "1.7 Single-pixel viewport returns (1, 1)")

    let tgFullHD = pipeline.calculateThreadgroups(width: 1920, height: 1080, groupSize: 16)
    assert(tgFullHD.groupsX == 120 && tgFullHD.groupsY == 68, "1.8 1920x1080 canvas returns (120, 68)")

    let tgZoom = pipeline.calculateThreadgroups(width: 1920 * 8, height: 1080 * 8, groupSize: 16)
    assert(tgZoom.groupsX == 960 && tgZoom.groupsY == 540, "1.9 800% extreme zoom returns (960, 540)")

    assert(pipeline.isMetalAvailable, "1.10 isMetalAvailable returns true on Metal-capable hardware")

    // ============================================================
    // Section 2: 16 Core Blend Modes & Color Space Mathematics
    // ============================================================
    print("\n--- [Section 2] 16 Core Blend Modes & W3C Color Math ---")

    // 2.1 Normal mode
    let cNormal = BlendMath.blend(mode: .normal, src: PixelColor(r: 0.7, g: 0.2, b: 0.9), dst: PixelColor(r: 0.1, g: 0.8, b: 0.3))
    assertApprox(cNormal.r, 0.7, "2.1 Normal blend takes source red")
    assertApprox(cNormal.g, 0.2, "2.1 Normal blend takes source green")
    assertApprox(cNormal.b, 0.9, "2.1 Normal blend takes source blue")

    // 2.2 Multiply mode (Cb * Cs)
    let cMul = BlendMath.blend(mode: .multiply, src: PixelColor(r: 0.5, g: 0.4, b: 0.2), dst: PixelColor(r: 0.8, g: 0.5, b: 1.0))
    assertApprox(cMul.r, 0.40, "2.2 Multiply 0.5 * 0.8 = 0.40")
    assertApprox(cMul.g, 0.20, "2.2 Multiply 0.4 * 0.5 = 0.20")
    assertApprox(cMul.b, 0.20, "2.2 Multiply 0.2 * 1.0 = 0.20")

    // 2.3 Screen mode (Cb + Cs - Cb * Cs)
    let cScreen = BlendMath.blend(mode: .screen, src: PixelColor(r: 0.5, g: 0.5, b: 0.5), dst: PixelColor(r: 0.5, g: 0.5, b: 0.5))
    assertApprox(cScreen.r, 0.75, "2.3 Screen 0.5 over 0.5 = 0.75")

    // 2.4 Overlay mode (Piecewise based on Cb)
    let cOverlayDark = BlendMath.blend(mode: .overlay, src: PixelColor(r: 0.5, g: 0.5, b: 0.5), dst: PixelColor(r: 0.25, g: 0.25, b: 0.25))
    // Cb = 0.25 <= 0.5 -> 2 * Cb * Cs = 2 * 0.25 * 0.5 = 0.25
    assertApprox(cOverlayDark.r, 0.25, "2.4 Overlay dark backdrop (Cb <= 0.5) multiplies")

    let cOverlayLight = BlendMath.blend(mode: .overlay, src: PixelColor(r: 0.5, g: 0.5, b: 0.5), dst: PixelColor(r: 0.75, g: 0.75, b: 0.75))
    // Cb = 0.75 > 0.5 -> 1 - 2*(1-0.75)*(1-0.5) = 1 - 2*0.25*0.5 = 0.75
    assertApprox(cOverlayLight.r, 0.75, "2.4 Overlay light backdrop (Cb > 0.5) screens")

    // 2.5 Darken & Lighten (min / max)
    let cDarken = BlendMath.blend(mode: .darken, src: PixelColor(r: 0.3, g: 0.9, b: 0.5), dst: PixelColor(r: 0.7, g: 0.2, b: 0.5))
    assertApprox(cDarken.r, 0.3, "2.5 Darken selects min red (0.3)")
    assertApprox(cDarken.g, 0.2, "2.5 Darken selects min green (0.2)")

    let cLighten = BlendMath.blend(mode: .lighten, src: PixelColor(r: 0.3, g: 0.9, b: 0.5), dst: PixelColor(r: 0.7, g: 0.2, b: 0.5))
    assertApprox(cLighten.r, 0.7, "2.5 Lighten selects max red (0.7)")
    assertApprox(cLighten.g, 0.9, "2.5 Lighten selects max green (0.9)")

    // 2.6 Color Dodge & Color Burn (with singularity avoidance)
    let cDodgeMax = BlendMath.blend(mode: .colorDodge, src: PixelColor(r: 1.0, g: 0.5, b: 0.0), dst: PixelColor(r: 0.4, g: 0.4, b: 0.4))
    assertApprox(cDodgeMax.r, 1.0, "2.6 Color Dodge with source=1.0 avoids division by zero and clamps to 1.0")

    let cBurnMin = BlendMath.blend(mode: .colorBurn, src: PixelColor(r: 0.0, g: 0.5, b: 1.0), dst: PixelColor(r: 0.4, g: 0.4, b: 0.4))
    assertApprox(cBurnMin.r, 0.0, "2.6 Color Burn with source=0.0 avoids division by zero and clamps to 0.0")

    // 2.7 Hard Light (Piecewise based on Cs)
    let cHardLight = BlendMath.blend(mode: .hardLight, src: PixelColor(r: 0.25, g: 0.75, b: 0.5), dst: PixelColor(r: 0.5, g: 0.5, b: 0.5))
    // For r: Cs=0.25 <= 0.5 -> 2 * Cb * Cs = 2 * 0.5 * 0.25 = 0.25
    assertApprox(cHardLight.r, 0.25, "2.7 Hard Light with source <= 0.5 multiplies")
    // For g: Cs=0.75 > 0.5 -> 1 - 2*(1-0.5)*(1-0.75) = 1 - 2*0.5*0.25 = 0.75
    assertApprox(cHardLight.g, 0.75, "2.7 Hard Light with source > 0.5 screens")

    // 2.8 Soft Light (W3C Pegtop continuous curve with D(Cb) at 0.25)
    let dVal: CGFloat = 0.25
    let dCb = ((16.0 * dVal - 12.0) * dVal + 4.0) * dVal
    let sqrtD = sqrt(dVal)
    assertApprox(dCb, sqrtD, tolerance: 0.0001, "2.8 Soft Light D(Cb) function is continuous at Cb = 0.25 (\(dCb) == \(sqrtD))")

    let cSoftLight = BlendMath.blend(mode: .softLight, src: PixelColor(r: 0.5, g: 0.5, b: 0.5), dst: PixelColor(r: 0.4, g: 0.4, b: 0.4))
    assertApprox(cSoftLight.r, 0.4, "2.8 Soft Light with neutral grey source (0.5) preserves backdrop (0.4)")

    // 2.9 Difference & Exclusion
    let cDiff = BlendMath.blend(mode: .difference, src: PixelColor(r: 0.9, g: 0.4, b: 0.5), dst: PixelColor(r: 0.2, g: 0.7, b: 0.5))
    assertApprox(cDiff.r, 0.7, "2.9 Difference |0.9 - 0.2| = 0.7")
    assertApprox(cDiff.g, 0.3, "2.9 Difference |0.4 - 0.7| = 0.3")
    assertApprox(cDiff.b, 0.0, "2.9 Difference |0.5 - 0.5| = 0.0")

    let cExcl = BlendMath.blend(mode: .exclusion, src: PixelColor(r: 0.8, g: 0.0, b: 1.0), dst: PixelColor(r: 0.3, g: 0.5, b: 0.5))
    // 0.8 + 0.3 - 2 * 0.8 * 0.3 = 1.1 - 0.48 = 0.62
    assertApprox(cExcl.r, 0.62, "2.9 Exclusion 0.8 + 0.3 - 2*0.8*0.3 = 0.62")

    // 2.10 Non-separable modes (Hue, Saturation, Color, Luminosity) stay in bounds
    for mode in [LayerBlendMode.hue, .saturation, .color, .luminosity] {
        let res = BlendMath.blend(mode: mode, src: PixelColor(r: 0.8, g: 0.3, b: 0.2), dst: PixelColor(r: 0.1, g: 0.6, b: 0.9))
        assert(res.r >= 0.0 && res.r <= 1.0 && res.g >= 0.0 && res.g <= 1.0 && res.b >= 0.0 && res.b <= 1.0,
               "2.10 Non-separable mode \(mode.rawValue) keeps all channels within [0.0, 1.0]")
    }

    // 2.11 Translucent Porter-Duff alpha compositing
    let transparentSrc = PixelColor(r: 1.0, g: 0.0, b: 0.0, a: 0.0)
    let opaqueDst = PixelColor(r: 0.0, g: 0.0, b: 1.0, a: 1.0)
    let compPreserve = BlendMath.blend(mode: .normal, src: transparentSrc, dst: opaqueDst)
    assertApprox(compPreserve.a, 1.0, "2.11 Compositing with zero source opacity preserves destination alpha")
    assertApprox(compPreserve.b, 1.0, "2.11 Compositing with zero source opacity preserves destination color")

    // 2.12 applyBlendMode produces valid CGImage via Metal or fallback
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    if let srcCtx = CGContext(data: nil, width: 32, height: 32, bitsPerComponent: 8, bytesPerRow: 128, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
       let dstCtx = CGContext(data: nil, width: 32, height: 32, bitsPerComponent: 8, bytesPerRow: 128, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
        srcCtx.setFillColor(CGColor(red: 1.0, green: 0.5, blue: 0.0, alpha: 0.8))
        srcCtx.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
        dstCtx.setFillColor(CGColor(red: 0.0, green: 0.5, blue: 1.0, alpha: 1.0))
        dstCtx.fill(CGRect(x: 0, y: 0, width: 32, height: 32))

        if let srcImg = srcCtx.makeImage(), let dstImg = dstCtx.makeImage() {
            let blendedImg = pipeline.applyBlendMode(.multiply, source: srcImg, destination: dstImg)
            assert(blendedImg != nil, "2.12 applyBlendMode returns non-nil blended CGImage")
            if let img = blendedImg {
                assert(img.width == 32 && img.height == 32, "2.12 Blended CGImage matches destination dimensions (32x32)")
            }
        }
    }

    // ============================================================
    // Section 3: Dynamic Nozzle Radial Falloff (Smoothstep Hermite)
    // ============================================================
    print("\n--- [Section 3] Smoothstep Radial Falloff Nozzle ---")

    let dab = BrushDab(position: CGPoint(x: 50, y: 50), radius: 20.0, opacity: 1.0)
    assertApprox(dab.radialFalloff(distance: 0.0), 1.0, "3.1 Nozzle falloff at center (d=0) is 1.0")
    // At d = 10 (half radius): normDist = 0.5, t = 0.5, t^2*(3 - 2t) = 0.25 * 2 = 0.50
    assertApprox(dab.radialFalloff(distance: 10.0), 0.50, "3.2 Nozzle falloff at mid-radius (d=R/2) is exactly 0.50")
    assertApprox(dab.radialFalloff(distance: 20.0), 0.0, "3.3 Nozzle falloff at boundary (d=R) is 0.0")
    assertApprox(dab.radialFalloff(distance: 30.0), 0.0, "3.4 Nozzle falloff outside radius (d>R) is 0.0")

    // InFlightDabBuffer with hardness plateau
    let dabBuffer = InFlightDabBuffer(size: CGSize(width: 100, height: 100), color: .black, brushSize: 20.0, opacity: 1.0, flow: 1.0, hardness: 0.8)
    dabBuffer.dab(at: CGPoint(x: 50, y: 50))
    assert(!dabBuffer.dirtyRect.isNull, "3.5 Stamping dab marks dirtyRect")
    assert(dabBuffer.dirtyRect.contains(CGPoint(x: 50, y: 50)), "3.6 dirtyRect encloses dab center")

    // ============================================================
    // Section 4: Flow Accumulation & Strict Opacity Ceiling
    // ============================================================
    print("\n--- [Section 4] Flow Accumulation & Opacity Ceiling ---")

    let flowBuffer = InFlightDabBuffer(
        size: CGSize(width: 50, height: 50),
        color: .red,
        brushSize: 10.0,
        opacity: 0.60,
        flow: 0.30,
        hardness: 1.0
    )

    // Stamp 50 overlapping dabs at the identical center position
    for _ in 0..<50 {
        flowBuffer.dab(at: CGPoint(x: 25, y: 25))
    }

    // Inspect the pixel alpha at (25, 25)
    let bitmapRep = flowBuffer.strokeBitmap
    if let data = bitmapRep.bitmapData {
        let centerOffset = 25 * bitmapRep.bytesPerRow + 25 * 4
        let finalAlphaByte = data[centerOffset + 3]
        let finalAlpha = CGFloat(finalAlphaByte) / 255.0

        // Strict ceiling check: finalAlpha must be <= 0.60 (user opacity) + rounding margin
        assert(finalAlpha <= 0.61, "4.1 Repeated dabs do not exceed user opacity ceiling (got \(finalAlpha) <= 0.60)")
        // Asymptotic accumulation check: after 50 dabs, it should have converged close to 0.60
        assertApprox(finalAlpha, 0.60, tolerance: 0.02, "4.2 Overlapping dabs asymptotically converge to opacity ceiling (0.60)")
    } else {
        assert(false, "4.1 Failed to access strokeBitmap data")
    }

    // ============================================================
    // Section 5: Adaptive Step Interpolation & Residual Tracking
    // ============================================================
    print("\n--- [Section 5] Adaptive Step Interpolation & Residual Tracking ---")

    let engine = RasterBrushEngine()
    let preset = BrushPreset(diameter: 20.0, spacing: 0.15) // step = 3.0px
    let strokeDabs = engine.strokeDabs(from: CGPoint(x: 0, y: 0), to: CGPoint(x: 60, y: 0), brush: preset)
    // 60 / 3 = 20 steps -> 21 dabs
    assert(strokeDabs.count == 21, "5.1 Adaptive step interpolation produces exactly 21 dabs over 60px (expected 21, got \(strokeDabs.count))")

    // InFlightDabBuffer fractional residual carryover across mouse events
    let stepBuffer = InFlightDabBuffer(size: CGSize(width: 100, height: 100), brushSize: 20.0) // spacing = 3.0px
    stepBuffer.begin(at: CGPoint(x: 0, y: 0))

    // Step 1: move 1.0px (less than spacing 3.0px) -> residual distance accumulates
    stepBuffer.step(to: CGPoint(x: 1.0, y: 0.0))
    assertApprox(stepBuffer.residualDistance, 1.0, "5.2 Sub-step distance (1.0px < 3.0px) accumulates in residualDistance")

    // Step 2: move another 1.0px -> residual = 2.0px (< 3.0px)
    stepBuffer.step(to: CGPoint(x: 2.0, y: 0.0))
    assertApprox(stepBuffer.residualDistance, 2.0, "5.3 Consecutive sub-step accumulates residual to 2.0px")

    // Step 3: move another 1.5px -> total distance 3.5px >= 3.0px -> stamps dab, residual becomes 0.5px
    stepBuffer.step(to: CGPoint(x: 3.5, y: 0.0))
    assertApprox(stepBuffer.residualDistance, 0.5, "5.4 Stepping over threshold stamps dab and maintains leftover residual (0.5px)")

    // Boundary brushes: micro (1px) and macro (500px)
    let microPreset = BrushPreset(diameter: 1.0)
    assertApprox(microPreset.diameter, 1.0, "5.5 Micro brush diameter 1.0px clamped properly")

    let macroPreset = BrushPreset(diameter: 500.0)
    assertApprox(macroPreset.diameter, 500.0, "5.6 Macro brush diameter 500.0px clamped properly")

    // ============================================================
    // Section 6: InFlightDabBuffer Commit & Eraser Attenuation
    // ============================================================
    print("\n--- [Section 6] InFlightDabBuffer Commit & Eraser Mode ---")

    guard let testCanvas = RasterEngine.createBitmap(size: CGSize(width: 50, height: 50)) else {
        fatalError("Failed to allocate testCanvas")
    }

    // Fill canvas with opaque blue (0, 0, 255, 255)
    if let cData = testCanvas.bitmapData {
        for y in 0..<50 {
            let row = y * testCanvas.bytesPerRow
            for x in 0..<50 {
                let off = row + x * 4
                cData[off + 0] = 0   // R
                cData[off + 1] = 0   // G
                cData[off + 2] = 255 // B
                cData[off + 3] = 255 // A
            }
        }
    }

    // Create eraser stroke with hardness 1.0, opacity 1.0, flow 1.0
    let eraserBuffer = InFlightDabBuffer(
        size: CGSize(width: 50, height: 50),
        brushSize: 10.0,
        opacity: 1.0,
        flow: 1.0,
        hardness: 1.0,
        isEraser: true
    )
    eraserBuffer.dab(at: CGPoint(x: 25, y: 25))
    eraserBuffer.commit(into: testCanvas)

    if let cData = testCanvas.bitmapData {
        let centerOff = 25 * testCanvas.bytesPerRow + 25 * 4
        let erasedAlpha = cData[centerOff + 3]
        assert(erasedAlpha == 0, "6.1 Full eraser stroke attenuates destination alpha to 0 (got \(erasedAlpha))")

        // Untouched pixel at (5, 5) remains 255
        let untouchedOff = 5 * testCanvas.bytesPerRow + 5 * 4
        let untouchedAlpha = cData[untouchedOff + 3]
        assert(untouchedAlpha == 255, "6.2 Untouched pixel outside eraser radius remains alpha 255")
    } else {
        assert(false, "6.1 Failed to read testCanvas data")
    }

    // Partial eraser attenuation (50% opacity)
    guard let partialCanvas = RasterEngine.createBitmap(size: CGSize(width: 50, height: 50)) else {
        fatalError("Failed to allocate partialCanvas")
    }
    if let pData = partialCanvas.bitmapData {
        for i in 0..<(50 * 50 * 4) {
            pData[i] = (i % 4 == 3) ? 200 : 100 // A = 200, RGB = 100
        }
    }

    let partialEraser = InFlightDabBuffer(
        size: CGSize(width: 50, height: 50),
        brushSize: 10.0,
        opacity: 0.50,
        flow: 1.0,
        hardness: 1.0,
        isEraser: true
    )
    partialEraser.dab(at: CGPoint(x: 25, y: 25))
    partialEraser.commit(into: partialCanvas)

    if let pData = partialCanvas.bitmapData {
        let off = 25 * partialCanvas.bytesPerRow + 25 * 4
        let attenuatedA = CGFloat(pData[off + 3])
        // factor = 1.0 - 0.5 = 0.5 -> 200 * 0.5 = 100
        assertApprox(attenuatedA, 100.0, tolerance: 2.0, "6.3 50% eraser stroke attenuates destination alpha by 50% (expected ~100, got \(attenuatedA))")
    } else {
        assert(false, "6.3 Failed to read partialCanvas data")
    }

    // ============================================================
    // Test Summary
    // ============================================================
    print("\n============================================================")
    print(" MILESTONE M3 TEST SUMMARY: \(passed) PASSED, \(failed) FAILED")
    print("============================================================")

    if failed > 0 {
        exit(1)
    }
}

@main
struct M3TestMain {
    static func main() {
        runM3Tests()
    }
}
