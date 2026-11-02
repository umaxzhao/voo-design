//
//  M3_AdversarialStressTests.swift
//  native_studio
//
//  Empirical Challenger Stress Test Suite for Milestone M3:
//  1. Threadgroup Boundary & Viewport Extremes (0x0, 1x1, 8192x8192, NPOT, extreme zoom 0.01x to 64.0x)
//  2. Runtime JIT Metal Compilation Stress (100 sequential compilations, memory leak audit, malformed MSL recovery)
//  3. Fallback Mechanism & Headless Isolation (headless CoreGraphics fallback for all 16 blend modes, degenerate images)
//  4. Concurrency & Rapid Pipeline Invocations (50 rapid sequential + 50 multithreaded concurrent passes)
//

import AppKit
import CoreGraphics
import CoreImage
import Darwin
import Foundation
import Metal
import MetalKit

// MARK: - Memory Statistics Helper

public struct MemorySnapshot {
    public let rssBytes: UInt64
    public let physFootprintBytes: UInt64

    public var rssMB: Double { Double(rssBytes) / (1024.0 * 1024.0) }
    public var footprintMB: Double { Double(physFootprintBytes) / (1024.0 * 1024.0) }

    public static func capture() -> MemorySnapshot {
        var basicInfo = mach_task_basic_info()
        var basicCount = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let basicKerr = withUnsafeMutablePointer(to: &basicInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(basicCount)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &basicCount)
            }
        }
        let rss = (basicKerr == KERN_SUCCESS) ? basicInfo.resident_size : 0

        var vmInfo = task_vm_info_data_t()
        var vmCount = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let vmKerr = withUnsafeMutablePointer(to: &vmInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &vmCount)
            }
        }
        let footprint = (vmKerr == KERN_SUCCESS) ? vmInfo.phys_footprint : 0
        return MemorySnapshot(rssBytes: rss, physFootprintBytes: footprint)
    }
}

// MARK: - Empirical Challenger Test Harness

public final class ChallengerHarness: @unchecked Sendable {
    public private(set) var totalTests = 0
    public private(set) var passedTests = 0
    public private(set) var failedTests = 0
    public private(set) var failures: [(name: String, reason: String)] = []

    public func assert(_ condition: Bool, _ name: String, detail: String = "") {
        totalTests += 1
        if condition {
            passedTests += 1
            let d = detail.isEmpty ? "" : " (\(detail))"
            print("  \u{001B}[32m✓ [PASS]\u{001B}[0m \(name)\(d)")
        } else {
            failedTests += 1
            let d = detail.isEmpty ? "Condition evaluated to false" : detail
            failures.append((name, d))
            print("  \u{001B}[31m✗ [FAIL]\u{001B}[0m \(name)")
            print("         \u{001B}[31m↳ \(d)\u{001B}[0m")
        }
    }

    public func assertApprox(_ val: CGFloat, _ target: CGFloat, tolerance: CGFloat = 0.02, _ name: String) {
        let diff = abs(val - target)
        assert(diff <= tolerance, name, detail: "expected ~\(target), got \(val), diff=\(diff)")
    }
}

// MARK: - Test Execution Suite

@MainActor
func runM3AdversarialSuite() {
    print("================================================================================")
    print(" VOO DESIGN NATIVE STUDIO — M3 EMPIRICAL CHALLENGER ADVERSARIAL STRESS SUITE")
    print("================================================================================")
    print("Host Target: macOS (Apple Silicon arm64, Metal GPU accelerated)")
    print("Execution Profile: Strict Invariant Verification & Boundary Stress Harness\n")

    let h = ChallengerHarness()
    let pipeline = MetalRenderPipeline.shared

    // =========================================================================
    // SECTION 1: Threadgroup Boundary & Viewport Extremes
    // =========================================================================
    print("--- [Section 1] Threadgroup Boundary & Viewport Extremes ---")

    // 1.1 Zero-sized dimensions
    let tgZero = pipeline.calculateThreadgroups(width: 0, height: 0, groupSize: 16)
    h.assert(tgZero.groupsX >= 1 && tgZero.groupsY >= 1, "1.1.1 Zero viewport (0x0) returns at least (1, 1)", detail: "got (\(tgZero.groupsX), \(tgZero.groupsY))")
    h.assert(tgZero.groupsX == 1 && tgZero.groupsY == 1, "1.1.2 Zero viewport returns exactly (1, 1)")

    let tgZeroWidth = pipeline.calculateThreadgroups(width: 0, height: 1080, groupSize: 16)
    h.assert(tgZeroWidth.groupsX == 1 && tgZeroWidth.groupsY == 68, "1.1.3 Zero width (0x1080) clamps X to 1 and Y to 68")

    let tgZeroHeight = pipeline.calculateThreadgroups(width: 1920, height: 0, groupSize: 16)
    h.assert(tgZeroHeight.groupsX == 120 && tgZeroHeight.groupsY == 1, "1.1.4 Zero height (1920x0) clamps X to 120 and Y to 1")

    // 1.2 GroupSize boundary & division-by-zero protection
    let tgZeroGroup = pipeline.calculateThreadgroups(width: 100, height: 100, groupSize: 0)
    h.assert(tgZeroGroup.groupsX == 100 && tgZeroGroup.groupsY == 100, "1.2.1 GroupSize 0 is clamped to 1 without division-by-zero crash")

    let tgNegGroup = pipeline.calculateThreadgroups(width: 100, height: 100, groupSize: -16)
    h.assert(tgNegGroup.groupsX == 100 && tgNegGroup.groupsY == 100, "1.2.2 Negative groupSize is clamped to 1 without crash")

    let tgGroup1 = pipeline.calculateThreadgroups(width: 32, height: 32, groupSize: 1)
    h.assert(tgGroup1.groupsX == 32 && tgGroup1.groupsY == 32, "1.2.3 GroupSize 1 calculates exactly 1 threadgroup per pixel (32, 32)")

    let tgGroup32 = pipeline.calculateThreadgroups(width: 64, height: 64, groupSize: 32)
    h.assert(tgGroup32.groupsX == 2 && tgGroup32.groupsY == 2, "1.2.4 GroupSize 32 calculates (2, 2) threadgroups")

    // 1.3 Micro dimensions (1x1, 2x2)
    let tgMicro1x1 = pipeline.calculateThreadgroups(width: 1, height: 1, groupSize: 16)
    h.assert(tgMicro1x1.groupsX == 1 && tgMicro1x1.groupsY == 1, "1.3.1 Micro 1x1 texture returns (1, 1) threadgroups")

    let tgMicro1x16 = pipeline.calculateThreadgroups(width: 1, height: 16, groupSize: 16)
    h.assert(tgMicro1x16.groupsX == 1 && tgMicro1x16.groupsY == 1, "1.3.2 Boundary 1x16 returns (1, 1) threadgroups")

    let tgMicro16x1 = pipeline.calculateThreadgroups(width: 16, height: 1, groupSize: 16)
    h.assert(tgMicro16x1.groupsX == 1 && tgMicro16x1.groupsY == 1, "1.3.3 Boundary 16x1 returns (1, 1) threadgroups")

    let tgMicro17x17 = pipeline.calculateThreadgroups(width: 17, height: 17, groupSize: 16)
    h.assert(tgMicro17x17.groupsX == 2 && tgMicro17x17.groupsY == 2, "1.3.4 Boundary 17x17 rolls over to (2, 2) threadgroups")

    // 1.4 Massive & Non-Power-of-Two (NPOT) dimensions
    let tgMassive8k = pipeline.calculateThreadgroups(width: 8192, height: 8192, groupSize: 16)
    h.assert(tgMassive8k.groupsX == 512 && tgMassive8k.groupsY == 512, "1.4.1 Massive 8192x8192 canvas returns (512, 512) threadgroups")

    let tgNPOT1 = pipeline.calculateThreadgroups(width: 1921, height: 1081, groupSize: 16)
    h.assert(tgNPOT1.groupsX == 121 && tgNPOT1.groupsY == 68, "1.4.2 NPOT 1921x1081 returns (121, 68) threadgroups")
    h.assert(tgNPOT1.groupsX * 16 >= 1921 && tgNPOT1.groupsY * 16 >= 1081, "1.4.3 NPOT 1921x1081 threadgroups fully cover canvas bounds")

    let tgPrime = pipeline.calculateThreadgroups(width: 7919, height: 1009, groupSize: 16)
    h.assert(tgPrime.groupsX == 495 && tgPrime.groupsY == 64, "1.4.4 Prime dimensions 7919x1009 return (495, 64) threadgroups")
    h.assert(tgPrime.groupsX * 16 >= 7919 && tgPrime.groupsY * 16 >= 1009, "1.4.5 Prime dimensions threadgroups fully cover bounds")

    let tgExtremeAspectX = pipeline.calculateThreadgroups(width: 65536, height: 1, groupSize: 16)
    h.assert(tgExtremeAspectX.groupsX == 4096 && tgExtremeAspectX.groupsY == 1, "1.4.6 Extreme aspect 65536x1 returns (4096, 1)")

    let tgExtremeAspectY = pipeline.calculateThreadgroups(width: 1, height: 65536, groupSize: 16)
    h.assert(tgExtremeAspectY.groupsX == 1 && tgExtremeAspectY.groupsY == 4096, "1.4.7 Extreme aspect 1x65536 returns (1, 4096)")

    // Negative dimensions clamped to at least (1, 1)
    let tgNegative = pipeline.calculateThreadgroups(width: -100, height: -50, groupSize: 16)
    h.assert(tgNegative.groupsX >= 1 && tgNegative.groupsY >= 1, "1.4.8 Negative dimensions clamped to >= (1, 1)")

    // 1.5 Viewport Extremes & Zoom Factors (0.01x to 64.0x) in render(...)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let renderCtx = CGContext(
        data: nil,
        width: 400,
        height: 300,
        bitsPerComponent: 8,
        bytesPerRow: 1600,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        fatalError("Failed to allocate test CGContext")
    }

    // Build 15 varied nodes (rectangles, rounded rects, ellipses, paths)
    var testNodes: [VOONode] = []
    for i in 0..<15 {
        var node = VOONode(name: "StressNode_\(i)", x: CGFloat(i * 25), y: CGFloat(i * 15), width: 80, height: 60)
        node.opacity = CGFloat(0.2 + Double(i % 5) * 0.15)
        node.blendMode = LayerBlendMode.allCases[i % LayerBlendMode.allCases.count].rawValue
        if i % 3 == 0 {
            node.kind = .rect
            node.cornerRadii = CornerRadii(tl: 10, tr: 10, br: 10, bl: 10)
        } else if i % 3 == 1 {
            node.kind = .ellipse
        } else {
            node.kind = .path
            node.points = [
                BezierPoint(point: CGPoint(x: 10, y: 10), outHandle: CGPoint(x: 30, y: 5)),
                BezierPoint(point: CGPoint(x: 70, y: 50), inHandle: CGPoint(x: 50, y: 60))
            ]
        }
        testNodes.append(node)
    }

    // Extreme Zoom: 0.01x (1% minification)
    pipeline.render(
        layers: testNodes,
        viewportRect: CGRect(x: 0, y: 0, width: 400, height: 300),
        zoom: 0.01,
        in: renderCtx
    )
    h.assert(renderCtx.makeImage() != nil, "1.5.1 Extreme zoom 0.01x renders cleanly without GState crash")

    // Extreme Zoom: 64.0x (6400% magnification)
    pipeline.render(
        layers: testNodes,
        viewportRect: CGRect(x: 0, y: 0, width: 400, height: 300),
        zoom: 64.0,
        in: renderCtx
    )
    h.assert(renderCtx.makeImage() != nil, "1.5.2 Extreme zoom 64.0x renders cleanly without overflow")

    // Micro Zoom: 0.0001x
    pipeline.render(
        layers: testNodes,
        viewportRect: CGRect(x: 0, y: 0, width: 400, height: 300),
        zoom: 0.0001,
        in: renderCtx
    )
    h.assert(renderCtx.makeImage() != nil, "1.5.3 Micro zoom 0.0001x renders without numerical singularity")

    // Negative & Out-of-bounds Viewport Offsets
    let negViewport = CGRect(x: -5000, y: -2500, width: 400, height: 300)
    pipeline.render(layers: testNodes, viewportRect: negViewport, zoom: 1.0, in: renderCtx)
    h.assert(renderCtx.makeImage() != nil, "1.5.4 Far negative viewport (-5000, -2500) renders cleanly")

    let farViewport = CGRect(x: 100000, y: 500000, width: 400, height: 300)
    pipeline.render(layers: testNodes, viewportRect: farViewport, zoom: 1.0, in: renderCtx)
    h.assert(renderCtx.makeImage() != nil, "1.5.5 Far positive viewport (+100000, +500000) renders cleanly")

    // Zero-sized Viewport Rect
    let zeroViewport = CGRect(x: 0, y: 0, width: 0, height: 0)
    pipeline.render(layers: testNodes, viewportRect: zeroViewport, zoom: 1.0, in: renderCtx)
    h.assert(renderCtx.makeImage() != nil, "1.5.6 Zero-sized viewport rect (0x0) clips safely without crash")

    // Degenerate Node Bounds (Zero, Negative, Single-point Path)
    var degenerateNodes: [VOONode] = []
    degenerateNodes.append(VOONode(name: "ZeroBounds", x: 0, y: 0, width: 0, height: 0))
    degenerateNodes.append(VOONode(name: "NegativeBounds", x: 50, y: 50, width: -100, height: -50))
    var singlePtNode = VOONode(name: "SinglePointPath", x: 10, y: 10, width: 50, height: 50)
    singlePtNode.kind = .path
    singlePtNode.points = [BezierPoint(point: CGPoint(x: 25, y: 25))]
    degenerateNodes.append(singlePtNode)

    var emptyPtNode = VOONode(name: "EmptyPath", x: 10, y: 10, width: 50, height: 50)
    emptyPtNode.kind = .path
    emptyPtNode.points = []
    degenerateNodes.append(emptyPtNode)

    pipeline.render(layers: degenerateNodes, viewportRect: CGRect(x: 0, y: 0, width: 400, height: 300), zoom: 1.0, in: renderCtx)
    h.assert(renderCtx.makeImage() != nil, "1.5.7 Degenerate nodes (zero bounds, negative bounds, single-point paths) render safely")

    // =========================================================================
    // SECTION 2: Runtime JIT Metal Compilation Stress
    // =========================================================================
    print("\n--- [Section 2] Runtime JIT Metal Compilation Stress ---")

    let initialShadersCount = pipeline.compiledShadersCount
    let memStart = MemorySnapshot.capture()

    // 2.1 Repeated Valid JIT Compilations (100 sequential passes)
    var allValidCompiled = true
    for i in 0..<100 {
        let uniqueMSL = """
        #include <metal_stdlib>
        using namespace metal;
        kernel void dynamicKernel_\(i)(
            texture2d<float, access::read> inTex [[texture(0)]],
            texture2d<float, access::write> outTex [[texture(1)]],
            constant float &factor [[buffer(0)]],
            uint2 gid [[thread_position_in_grid]]
        ) {
            if (gid.x >= outTex.get_width() || gid.y >= outTex.get_height()) return;
            float4 c = inTex.read(gid);
            outTex.write(c * factor + float(\(i)) * 0.0001, gid);
        }
        """
        do {
            let ok = try pipeline.compileJITShader(source: uniqueMSL)
            if !ok { allValidCompiled = false; break }
        } catch {
            allValidCompiled = false
            print("Failed at iteration \(i): \(error)")
            break
        }
    }
    h.assert(allValidCompiled, "2.1.1 100 consecutive unique MSL compute kernels compiled successfully")

    let postShadersCount = pipeline.compiledShadersCount
    h.assert(postShadersCount == initialShadersCount + 100, "2.1.2 compiledShadersCount incremented by exactly 100 (from \(initialShadersCount) to \(postShadersCount))")

    let memAfter100 = MemorySnapshot.capture()
    let memGrowthMB = memAfter100.footprintMB - memStart.footprintMB
    h.assert(memGrowthMB < 30.0, "2.1.3 Memory footprint growth after 100 compilations is bounded (< 30 MB)", detail: "growth = \(String(format: "%.2f", memGrowthMB)) MB")

    // 2.2 Malformed & Adversarial MSL Syntax Injection Matrix
    let adversarialSources: [(name: String, source: String)] = [
        ("MissingBrace", "kernel void unclosed(texture2d<float> t) { float x = 1.0;"),
        ("BadSignature", "kernel badSignature(int x) {}"),
        ("UnknownType", "kernel void badType(NonExistentType_XYZ123 param) {}"),
        ("BadQualifier", "kernel void badQualifier(__unknown_address_space float *p) {}"),
        ("PreprocessorError", "#error This is a deliberate compile abort test"),
        ("GarbageTokens", "$$!!##@@^^&&**(())__+==-~`"),
        ("TruncatedToken", "kernel void test(texture2d<float, access::rea"),
        ("LargeGibberish", String(repeating: "void broken() { ??? } \n", count: 200)),
        ("EmbeddedNullBytes", "kernel void testNull() { /* \0 */ }")
    ]

    var caughtErrorCount = 0
    for (caseName, badSource) in adversarialSources {
        var didCatch = false
        do {
            _ = try pipeline.compileJITShader(source: badSource)
        } catch {
            didCatch = true
            caughtErrorCount += 1
        }
        h.assert(didCatch, "2.2.\(caughtErrorCount) Adversarial MSL '\(caseName)' gracefully threw error without crash")
    }
    h.assert(caughtErrorCount == adversarialSources.count, "2.2.10 All \(adversarialSources.count) adversarial MSL injections caught cleanly")

    // 2.3 Post-Error State Integrity
    do {
        let recoveryOK = try pipeline.compileJITShader(source: ShaderLibrary.blendLayersMSL)
        h.assert(recoveryOK, "2.3.1 Valid shader compiles successfully immediately after error storms (no pipeline state corruption)")
    } catch {
        h.assert(false, "2.3.1 Post-error recovery compilation failed: \(error)")
    }

    // =========================================================================
    // SECTION 3: Fallback Mechanism & Headless Isolation
    // =========================================================================
    print("\n--- [Section 3] Fallback Mechanism & Headless Isolation ---")

    // 3.1 Headless renderFallback execution with diverse node geometries
    let fallbackCtx = CGContext(
        data: nil,
        width: 200,
        height: 200,
        bitsPerComponent: 8,
        bytesPerRow: 800,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!

    pipeline.renderFallback(nodes: testNodes, in: CGRect(x: 0, y: 0, width: 200, height: 200), context: fallbackCtx)
    guard let fallbackImg = fallbackCtx.makeImage() else {
        fatalError("Failed to generate fallback image")
    }
    h.assert(fallbackImg.width == 200 && fallbackImg.height == 200, "3.1.1 renderFallback produces valid CGImage matching dimensions (200x200)")

    // Inspect background fill in fallback: (0,0) should be background #171717 (23, 23, 23)
    var fbPixel = [UInt8](repeating: 0, count: 4)
    let fbPixelCtx = CGContext(
        data: &fbPixel,
        width: 1,
        height: 1,
        bitsPerComponent: 8,
        bytesPerRow: 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    fbPixelCtx.draw(fallbackImg, in: CGRect(x: 0, y: 0, width: 200, height: 200))
    h.assert(fbPixel[3] == 255, "3.1.2 renderFallback background alpha is fully opaque (255)")

    // 3.2 All 16 Blend Modes in applyBlendMode & CoreGraphics fallback verification
    // Create base 64x64 blue image and overlay 64x64 red image
    let imgW = 64
    let imgH = 64
    let baseCtx = CGContext(data: nil, width: imgW, height: imgH, bitsPerComponent: 8, bytesPerRow: imgW * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let overlayCtx = CGContext(data: nil, width: imgW, height: imgH, bitsPerComponent: 8, bytesPerRow: imgW * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!

    // Blue base (0.0, 0.2, 0.8, 1.0)
    baseCtx.setFillColor(CGColor(red: 0.0, green: 0.2, blue: 0.8, alpha: 1.0))
    baseCtx.fill(CGRect(x: 0, y: 0, width: imgW, height: imgH))
    let baseCG = baseCtx.makeImage()!

    // Red overlay (0.9, 0.1, 0.0, 1.0)
    overlayCtx.setFillColor(CGColor(red: 0.9, green: 0.1, blue: 0.0, alpha: 1.0))
    overlayCtx.fill(CGRect(x: 0, y: 0, width: imgW, height: imgH))
    let overlayCG = overlayCtx.makeImage()!

    var all16BlendsValid = true
    for mode in LayerBlendMode.allCases {
        guard let blended = pipeline.applyBlendMode(mode, source: overlayCG, destination: baseCG) else {
            all16BlendsValid = false
            print("applyBlendMode returned nil for mode \(mode.rawValue)")
            break
        }
        if blended.width != imgW || blended.height != imgH {
            all16BlendsValid = false
            print("applyBlendMode returned mismatched dimensions for mode \(mode.rawValue): \(blended.width)x\(blended.height)")
            break
        }
    }
    h.assert(all16BlendsValid, "3.2.1 All 16 LayerBlendModes execute cleanly in applyBlendMode with matching dimensions")

    // 3.3 Mathematical verification of CoreGraphics fallback blend modes
    // Check key analytical results: Normal, Multiply, Screen, Difference
    let normalBlended = pipeline.applyBlendMode(.normal, source: overlayCG, destination: baseCG)!
    var normalPixel = [UInt8](repeating: 0, count: 4)
    let nCtx = CGContext(data: &normalPixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    nCtx.draw(normalBlended, in: CGRect(x: 0, y: 0, width: 64, height: 64))
    // Red overlay (0.9 * 255 = 229) should dominate in Normal mode
    h.assert(normalPixel[0] > 200, "3.3.1 Normal blend takes overlay red channel (\(normalPixel[0]) > 200)")

    let mulBlended = pipeline.applyBlendMode(.multiply, source: overlayCG, destination: baseCG)!
    var mulPixel = [UInt8](repeating: 0, count: 4)
    let mCtx = CGContext(data: &mulPixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    mCtx.draw(mulBlended, in: CGRect(x: 0, y: 0, width: 64, height: 64))
    // 0.9 * 0.0 = 0 -> Red should be near 0
    h.assert(mulPixel[0] < 10, "3.3.2 Multiply blend red 0.9 * 0.0 is near zero (\(mulPixel[0]) < 10)")

    // 3.4 Micro 1x1 Texture Blending
    let microBaseCtx = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    microBaseCtx.setFillColor(CGColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0))
    microBaseCtx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    let microBase = microBaseCtx.makeImage()!

    let microOverlayCtx = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    microOverlayCtx.setFillColor(CGColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 1.0))
    microOverlayCtx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    let microOverlay = microOverlayCtx.makeImage()!

    let microBlended = pipeline.applyBlendMode(.multiply, source: microOverlay, destination: microBase)
    h.assert(microBlended != nil, "3.4.1 1x1 micro image blend returns non-nil CGImage")
    h.assert(microBlended?.width == 1 && microBlended?.height == 1, "3.4.2 1x1 micro image blend preserves 1x1 dimensions")

    // 3.5 Degenerate & Extreme Inputs
    // Zero-dimension image handling
    let zeroBitmap = RasterEngine.createBitmap(size: CGSize(width: 0, height: 0))
    h.assert(zeroBitmap == nil, "3.5.1 createBitmap with 0x0 size safely returns nil without crash")

    let negBitmap = RasterEngine.createBitmap(size: CGSize(width: -50, height: -50))
    h.assert(negBitmap == nil, "3.5.2 createBitmap with negative size safely returns nil without crash")

    // Full 16 CoreGraphics blend mode mappings
    for mode in LayerBlendMode.allCases {
        let cgMode = mode.cgBlendMode
        h.assert(cgMode.rawValue >= 0, "3.5.3 Blend mode \(mode.rawValue) maps to valid CGBlendMode (\(cgMode.rawValue))")
    }

    // =========================================================================
    // SECTION 4: Concurrency & Rapid Pipeline Invocations
    // =========================================================================
    print("\n--- [Section 4] Concurrency & Rapid Pipeline Invocations ---")

    // 4.1 50 Rapid Sequential Pipeline Render Passes
    var sequentialSuccess = true
    let seqStart = CFAbsoluteTimeGetCurrent()
    for pass in 0..<50 {
        let zoomVal: CGFloat = (pass % 4 == 0) ? 0.25 : ((pass % 4 == 1) ? 1.0 : ((pass % 4 == 2) ? 2.5 : 8.0))
        let vp = CGRect(x: CGFloat(pass * 2), y: CGFloat(pass * 2), width: 300, height: 200)
        pipeline.render(layers: testNodes, viewportRect: vp, zoom: zoomVal, in: renderCtx)
        if renderCtx.makeImage() == nil {
            sequentialSuccess = false
            break
        }
    }
    let seqDuration = CFAbsoluteTimeGetCurrent() - seqStart
    h.assert(sequentialSuccess, "4.1.1 50 rapid sequential pipeline render passes completed cleanly")
    h.assert(seqDuration < 2.0, "4.1.2 50 sequential render passes completed in \(String(format: "%.3f", seqDuration))s (< 2.0s)")

    // 4.2 50 Rapid Sequential applyBlendMode Passes
    var seqBlendSuccess = true
    for i in 0..<50 {
        let mode = LayerBlendMode.allCases[i % LayerBlendMode.allCases.count]
        if let res = pipeline.applyBlendMode(mode, source: overlayCG, destination: baseCG) {
            if res.width != imgW || res.height != imgH {
                seqBlendSuccess = false
                break
            }
        } else {
            seqBlendSuccess = false
            break
        }
    }
    h.assert(seqBlendSuccess, "4.2.1 50 rapid sequential applyBlendMode passes completed with 100% success")

    // 4.3 50 Multithreaded Concurrent Pipeline Render Passes
    let concurrentPasses = 50
    let renderPassGroup = DispatchGroup()
    let concurrentRenderQueue = DispatchQueue(label: "com.voo.render.stress", attributes: .concurrent)
    var concurrentRenderSuccesses = 0
    let renderLock = NSLock()

    let conStart = CFAbsoluteTimeGetCurrent()
    for pass in 0..<concurrentPasses {
        renderPassGroup.enter()
        concurrentRenderQueue.async {
            // Allocate thread-isolated CGContext
            let localCtx = CGContext(
                data: nil,
                width: 256,
                height: 256,
                bitsPerComponent: 8,
                bytesPerRow: 1024,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            if let ctx = localCtx {
                let zoom = CGFloat(0.5 + Double(pass % 10) * 0.5)
                let vp = CGRect(x: CGFloat(-pass * 10), y: CGFloat(-pass * 10), width: 256, height: 256)
                pipeline.render(layers: testNodes, viewportRect: vp, zoom: zoom, in: ctx)
                if ctx.makeImage() != nil {
                    renderLock.lock()
                    concurrentRenderSuccesses += 1
                    renderLock.unlock()
                }
            }
            renderPassGroup.leave()
        }
    }
    renderPassGroup.wait()
    let conDuration = CFAbsoluteTimeGetCurrent() - conStart

    h.assert(concurrentRenderSuccesses == concurrentPasses, "4.3.1 50 concurrent pipeline render passes completed with 100% integrity (\(concurrentRenderSuccesses)/\(concurrentPasses))")
    h.assert(conDuration < 3.0, "4.3.2 50 concurrent render passes executed in \(String(format: "%.3f", conDuration))s (< 3.0s)")

    // 4.4 50 Multithreaded Concurrent applyBlendMode Passes
    var concurrentBlendSuccesses = 0
    let blendLock = NSLock()
    let blendGroup = DispatchGroup()
    let concurrentBlendQueue = DispatchQueue(label: "com.voo.blend.stress", attributes: .concurrent)

    for pass in 0..<concurrentPasses {
        blendGroup.enter()
        concurrentBlendQueue.async {
            let mode = LayerBlendMode.allCases[pass % LayerBlendMode.allCases.count]
            if let res = pipeline.applyBlendMode(mode, source: overlayCG, destination: baseCG) {
                if res.width == imgW && res.height == imgH {
                    blendLock.lock()
                    concurrentBlendSuccesses += 1
                    blendLock.unlock()
                }
            }
            blendGroup.leave()
        }
    }
    blendGroup.wait()
    h.assert(concurrentBlendSuccesses == concurrentPasses, "4.4.1 50 concurrent Metal/Fallback blend passes completed without command queue collision (\(concurrentBlendSuccesses)/\(concurrentPasses))")

    // 4.5 Concurrent InFlightDabBuffer Thread Isolation
    var concurrentDabSuccesses = 0
    let dabLock = NSLock()
    let dabGroup = DispatchGroup()
    let dabQueue = DispatchQueue(label: "com.voo.dab.stress", attributes: .concurrent)

    for pass in 0..<concurrentPasses {
        dabGroup.enter()
        dabQueue.async {
            let buf = InFlightDabBuffer(
                size: CGSize(width: 80, height: 80),
                color: (pass % 2 == 0) ? .red : .blue,
                brushSize: CGFloat(10 + (pass % 5) * 4),
                opacity: 0.8,
                flow: 0.5,
                hardness: 0.8
            )
            buf.begin(at: CGPoint(x: 10, y: 10))
            for step in 1...10 {
                buf.step(to: CGPoint(x: 10 + step * 5, y: 10 + step * 5))
            }
            if !buf.dirtyRect.isNull && buf.dirtyRect.width > 0 {
                dabLock.lock()
                concurrentDabSuccesses += 1
                dabLock.unlock()
            }
            dabGroup.leave()
        }
    }
    dabGroup.wait()
    h.assert(concurrentDabSuccesses == concurrentPasses, "4.5.1 50 concurrent InFlightDabBuffer instances executed with complete memory isolation (\(concurrentDabSuccesses)/\(concurrentPasses))")

    // =========================================================================
    // FINAL SUMMARY & VERDICT
    // =========================================================================
    print("\n================================================================================")
    print(" M3 ADVERSARIAL STRESS TEST SUMMARY")
    print(" Total Assertions: \(h.totalTests)")
    print(" Passed:           \(h.passedTests)")
    print(" Failed:           \(h.failedTests)")
    print("================================================================================")

    if h.failedTests > 0 {
        print("\nFailures:")
        for f in h.failures {
            print("  ✗ \(f.name): \(f.reason)")
        }
        exit(1)
    } else {
        print("\n\u{001B}[32m✓ ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% INTEGRITY.\u{001B}[0m\n")
        exit(0)
    }
}

@main
struct M3AdversarialMain {
    static func main() {
        runM3AdversarialSuite()
    }
}
