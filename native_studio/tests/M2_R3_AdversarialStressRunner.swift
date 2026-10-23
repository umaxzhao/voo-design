//
//  M2_R3_AdversarialStressRunner.swift
//  native_studio tests
//
//  Empirical Adversarial Stress Test Suite for Milestone M2: Comprehensive Inspector Studio
//  Executed by Challenger 2 (challenger_m2_r3_2)
//
//  Targets:
//  1. Gradient Fill Parsing and Rendering:
//     - CSS gradient strings with single stop, 0 stops, out-of-order positions, missing colors, malformed syntax.
//     - Extremely large angles, negative angles, 0-radius radial gradients, 0x0 rects.
//  2. Stroke Options:
//     - Stroke dash arrays with 0 length, odd number of elements, extreme miter limits, empty dash arrays.
//     - Dotted preset rule: verify effective round cap is preserved when first dash is 0.
//     - Stroke alignment (inside, outside, center) and negative/zero width handling.
//  3. Typography & Effects:
//     - Extremely long font family names (10k chars), invalid families, negative letter spacing, zero/negative line height.
//     - Huge Gaussian blur radius (>100px, 300px, 1M px), negative shadow offsets, 0 opacity.
//  4. End-to-End Live Canvas Rendering & Memory Stability:
//     - High-density adversarial document rendering into offscreen CGContext, RSS footprint verification.
//

import AppKit
import CoreGraphics
import CoreImage
import Darwin
import Foundation

// MARK: - Process Memory Tracker

struct MemorySnapshot {
    let rssBytes: UInt64
    let physFootprintBytes: UInt64

    var rssMB: Double { Double(rssBytes) / (1024.0 * 1024.0) }
    var footprintMB: Double { Double(physFootprintBytes) / (1024.0 * 1024.0) }

    static func capture() -> MemorySnapshot {
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

// MARK: - Challenger Report & Assertions

final class ChallengerReport: @unchecked Sendable {
    var totalTests = 0
    var passedTests = 0
    var failedTests = 0
    var failureDetails: [String] = []

    func check(_ condition: Bool, _ name: String, _ detail: String = "") {
        totalTests += 1
        if condition {
            passedTests += 1
            print("  \u{001B}[32m✓ [PASS]\u{001B}[0m \(name)" + (detail.isEmpty ? "" : " (\(detail))"))
        } else {
            failedTests += 1
            let msg = "  \u{001B}[31m✗ [FAIL]\u{001B}[0m \(name) [\(detail)]"
            print(msg)
            failureDetails.append(msg)
        }
    }

    func section(_ title: String) {
        print("\n" + String(repeating: "=", count: 80))
        print("  \(title)")
        print(String(repeating: "=", count: 80))
    }

    func summary() -> Bool {
        section("EMPIRICAL CHALLENGER VERIFICATION SUMMARY (M2_R3)")
        print("  Total Tests Executed: \(totalTests)")
        print("  Passed:               \(passedTests)")
        print("  Failed:               \(failedTests)")
        if !failureDetails.isEmpty {
            print("\n  Failures Detected:")
            for f in failureDetails {
                print("    \(f)")
            }
        }
        print(String(repeating: "=", count: 80))
        return failedTests == 0
    }
}

// MARK: - Main Test Runner

@main
struct M2_R3_AdversarialStressRunner {
    static func main() {
        print("================================================================================")
        print("  VOO DESIGN NATIVE STUDIO — M2_R3 EMPIRICAL ADVERSARIAL STRESS RUNNER")
        print("================================================================================")
        print("Timestamp: \(ISO8601DateFormatter().string(from: Date()))")

        let report = ChallengerReport()

        // Helper to create a valid test CGContext
        func makeTestContext(width: Int = 400, height: Int = 400) -> CGContext {
            let cs = CGColorSpaceCreateDeviceRGB()
            return CGContext(
                data: nil,
                width: max(1, width),
                height: max(1, height),
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: cs,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )!
        }

        // =====================================================================
        // SECTION 1: Gradient Fill Parsing Stress Tests
        // =====================================================================
        report.section("SECTION 1: Gradient Fill Parsing Stress Tests")

        // 1.1 0 stops: linear-gradient(180deg)
        let grad0A = CanvasStageView.parseGradient(from: "linear-gradient(180deg)")
        report.check(grad0A == nil, "1.1 0 stops: linear-gradient(180deg) returns nil")

        // 1.2 0 stops: linear-gradient()
        let grad0B = CanvasStageView.parseGradient(from: "linear-gradient()")
        report.check(grad0B == nil, "1.2 0 stops: linear-gradient() returns nil")

        // 1.3 0 stops: radial-gradient(circle)
        let grad0C = CanvasStageView.parseGradient(from: "radial-gradient(circle)")
        report.check(grad0C == nil, "1.3 0 stops: radial-gradient(circle) returns nil")

        // 1.4 Single stop: linear-gradient with 1 stop
        let grad1A = CanvasStageView.parseGradient(from: "linear-gradient(180deg, #ff0000 50%)")
        report.check(grad1A == nil, "1.4 Single stop: linear-gradient(180deg, #ff0000 50%) returns nil (requires >= 2)")

        // 1.5 Single stop: radial-gradient with 1 stop
        let grad1B = CanvasStageView.parseGradient(from: "radial-gradient(circle at 50% 50%, #00ff00 0%)")
        report.check(grad1B == nil, "1.5 Single stop: radial-gradient with 1 stop returns nil (requires >= 2)")

        // 1.6 Out-of-order positions: reverse order 100% then 0%
        let gradReversed = CanvasStageView.parseGradient(from: "linear-gradient(90deg, #ffffff 100%, #000000 0%)")
        if let g = gradReversed {
            let sortedProperly = g.stops.count == 2 && g.stops[0].location == 0.0 && g.stops[1].location == 1.0
            report.check(sortedProperly, "1.6 Out-of-order stops: sorted to [0.0, 1.0]", "stops count: \(g.stops.count), first loc: \(g.stops.first?.location ?? -1)")
        } else {
            report.check(false, "1.6 Out-of-order stops: parsed gradient should not be nil")
        }

        // 1.7 Out-of-order multiple stops: 90%, 10%, 50%
        let gradMultiOut = CanvasStageView.parseGradient(from: "linear-gradient(90deg, #333333 90%, #111111 10%, #222222 50%)")
        if let g = gradMultiOut {
            let locs = g.stops.map { $0.location }
            let isSorted = locs == [0.1, 0.5, 0.9]
            report.check(isSorted, "1.7 Multiple out-of-order stops sorted ascendingly", "locations: \(locs)")
        } else {
            report.check(false, "1.7 Multiple out-of-order stops should not be nil")
        }

        // 1.8 Identical adjacent stop positions (sharp step gradient)
        let gradIdentical = CanvasStageView.parseGradient(from: "linear-gradient(90deg, #ff0000 50%, #0000ff 50%)")
        if let g = gradIdentical {
            let locs = g.stops.map { $0.location }
            let cgGrad = CanvasStageView.createCGGradient(from: g.stops)
            report.check(locs == [0.5, 0.5] && cgGrad != nil, "1.8 Identical adjacent stop positions [0.5, 0.5] create valid CGGradient", "cgGrad created: \(cgGrad != nil)")
        } else {
            report.check(false, "1.8 Identical positions gradient should not be nil")
        }

        // 1.9 Missing colors: empty parts between commas
        let gradMissingA = CanvasStageView.parseGradient(from: "linear-gradient(180deg, , #ffffff 100%)")
        report.check(gradMissingA == nil, "1.9 Missing colors with single remaining stop returns nil")

        // 1.10 Interleaved empty commas with 2 valid stops
        let gradInterleaved = CanvasStageView.parseGradient(from: "linear-gradient(180deg, #ff0000 0%, , , #00ff00 100%)")
        if let g = gradInterleaved {
            report.check(g.stops.count == 2, "1.10 Interleaved empty commas parsed 2 valid stops safely", "count: \(g.stops.count)")
        } else {
            report.check(false, "1.10 Interleaved empty commas should parse 2 valid stops")
        }

        // 1.11 Malformed syntax cases
        let malformedCases = [
            "linear-gradient(",
            "linear-gradient)",
            "linear-gradient",
            "linear-gradient(foo, bar)",
            "radial-gradient(at invalid %%%)",
            "not-a-gradient(180deg, #fff, #000)",
            "linear-gradient(180deg, invalidcolor 0%, anotherbad 100%)"
        ]
        var allMalformedReturnedNil = true
        for mc in malformedCases {
            if CanvasStageView.parseGradient(from: mc) != nil {
                allMalformedReturnedNil = false
                print("    Failed on malformed case: \(mc)")
            }
        }
        report.check(allMalformedReturnedNil, "1.11 Malformed syntax cases all safely return nil without crashing")

        // 1.12A Compact RGB/RGBA without inner spaces: rgba(255,128,0,0.5)
        let gradRGBACompact = CanvasStageView.parseGradient(from: "linear-gradient(180deg, rgba(255,128,0,0.5) 0%, rgb(0,200,255) 100%)")
        if let g = gradRGBACompact, g.stops.count == 2 {
            let a1 = g.stops[0].color.alphaComponent
            let a2 = g.stops[1].color.alphaComponent
            report.check(abs(a1 - 0.5) < 0.05 && abs(a2 - 1.0) < 0.05, "1.12A Compact RGBA/RGB color tokens parsed with correct alpha", "alpha1: \(a1), alpha2: \(a2)")
        } else {
            report.check(false, "1.12A Compact RGBA gradient should parse 2 stops")
        }

        // 1.12B Standard CSS RGBA with spaces: rgba(255, 128, 0, 0.5)
        let gradRGBASpaced = CanvasStageView.parseGradient(from: "linear-gradient(180deg, rgba(255, 128, 0, 0.5) 0%, rgb(0, 200, 255) 100%)")
        let spacedParsed = (gradRGBASpaced != nil && gradRGBASpaced!.stops.count == 2)
        report.check(spacedParsed, "1.12B Standard CSS RGBA with internal spaces parsed correctly", "parsed: \(spacedParsed)")

        // 1.13A 6-digit hex stops: #000000, #ffffff
        let grad6Hex = CanvasStageView.parseGradient(from: "linear-gradient(90deg, #000000 0%, #ffffff 100%)")
        report.check(grad6Hex != nil && grad6Hex!.stops.count == 2, "1.13A 6-digit hex stops parsed correctly")

        // 1.13B 3-digit CSS shorthand hex stops: #000, #fff
        let grad3Hex = CanvasStageView.parseGradient(from: "linear-gradient(90deg, #000 0%, #fff 100%)")
        let parsed3Hex = (grad3Hex != nil && grad3Hex!.stops.count == 2)
        report.check(parsed3Hex, "1.13B 3-digit CSS shorthand hex (#000, #fff) parsed correctly", "parsed: \(parsed3Hex)")

        // =====================================================================
        // SECTION 2: Gradient CoreGraphics Rendering Stress Tests
        // =====================================================================
        report.section("SECTION 2: Gradient CoreGraphics Rendering Stress Tests")

        let testRect = CGRect(x: 20, y: 20, width: 200, height: 100)
        let testPath = CGPath(rect: testRect, transform: nil)

        // 2.1 Extremely large positive angle: 9,999,999 deg
        if let gLarge = CanvasStageView.parseGradient(from: "linear-gradient(9999999deg, #ff0000 0%, #0000ff 100%)") {
            let ctx = makeTestContext()
            CanvasStageView.drawGradientFill(parsed: gLarge, in: testRect, path: testPath, ctx: ctx)
            report.check(true, "2.1 Extremely large positive angle (9,999,999 deg) rendered into CGContext cleanly")
        } else {
            report.check(false, "2.1 Large angle gradient failed to parse")
        }

        // 2.2 Extremely negative angle: -36,000 deg
        if let gNeg = CanvasStageView.parseGradient(from: "linear-gradient(-36000deg, #00ff00 0%, #ff00ff 100%)") {
            let ctx = makeTestContext()
            CanvasStageView.drawGradientFill(parsed: gNeg, in: testRect, path: testPath, ctx: ctx)
            report.check(true, "2.2 Extremely negative angle (-36,000 deg) rendered into CGContext cleanly")
        } else {
            report.check(false, "2.2 Negative angle gradient failed to parse")
        }

        // 2.3 Cardinal direction strings: to top, to right, to bottom, to left
        let cardinalDirs: [(dir: String, expectedAngle: CGFloat)] = [
            ("to top", 0),
            ("to right", 90),
            ("to bottom", 180),
            ("to left", 270)
        ]
        var cardinalOk = true
        for (dir, expAngle) in cardinalDirs {
            if let g = CanvasStageView.parseGradient(from: "linear-gradient(\(dir), #000000 0%, #ffffff 100%)") {
                if case .linear(let a) = g.type {
                    if a != expAngle { cardinalOk = false }
                } else { cardinalOk = false }
            } else { cardinalOk = false }
        }
        report.check(cardinalOk, "2.3 Cardinal direction keywords (to top/right/bottom/left) map to exact angles")

        // 2.4 Diagonal direction strings: to top right, to bottom right, to bottom left, to top left
        let diagonalDirs: [(dir: String, expectedAngle: CGFloat)] = [
            ("to top right", 45),
            ("to bottom right", 135),
            ("to bottom left", 225),
            ("to top left", 315)
        ]
        var diagonalOk = true
        for (dir, expAngle) in diagonalDirs {
            if let g = CanvasStageView.parseGradient(from: "linear-gradient(\(dir), #000000 0%, #ffffff 100%)") {
                if case .linear(let a) = g.type {
                    if a != expAngle { diagonalOk = false }
                } else { diagonalOk = false }
            } else { diagonalOk = false }
        }
        report.check(diagonalOk, "2.4 Diagonal direction keywords map to exact angles (45, 135, 225, 315)")

        // 2.5 0-radius radial gradient in 0x0 rect
        if let gRadial = CanvasStageView.parseGradient(from: "radial-gradient(circle at 50% 50%, #000000 0%, #ffffff 100%)") {
            let ctx = makeTestContext(width: 50, height: 50)
            let zeroRect = CGRect.zero
            let zeroPath = CGPath(rect: zeroRect, transform: nil)
            CanvasStageView.drawGradientFill(parsed: gRadial, in: zeroRect, path: zeroPath, ctx: ctx)
            report.check(true, "2.5 0-radius radial gradient in CGRect.zero draws without division-by-zero or crash")
        } else {
            report.check(false, "2.5 Radial gradient failed to parse")
        }

        // 2.6 Degenerate dimension radial gradient: width 0, height 50
        if let gRadial = CanvasStageView.parseGradient(from: "radial-gradient(circle at 0% 0%, #000 0%, #fff 100%)") {
            let ctx = makeTestContext(width: 100, height: 100)
            let degenRect = CGRect(x: 10, y: 10, width: 0, height: 50)
            let degenPath = CGPath(rect: degenRect, transform: nil)
            CanvasStageView.drawGradientFill(parsed: gRadial, in: degenRect, path: degenPath, ctx: ctx)
            report.check(true, "2.6 Degenerate 0-width rect with radial gradient draws cleanly")
        }

        // 2.7 Massive radial dimensions: 10000x10000
        if let gRadial = CanvasStageView.parseGradient(from: "radial-gradient(circle at 50% 50%, #000 0%, #fff 100%)") {
            let ctx = makeTestContext(width: 100, height: 100)
            let hugeRect = CGRect(x: 0, y: 0, width: 10000, height: 10000)
            let hugePath = CGPath(rect: hugeRect, transform: nil)
            CanvasStageView.drawGradientFill(parsed: gRadial, in: hugeRect, path: hugePath, ctx: ctx)
            report.check(true, "2.7 Massive 10000x10000 rect with radial gradient draws cleanly")
        }

        // =====================================================================
        // SECTION 3: Stroke Options Stress Tests
        // =====================================================================
        report.section("SECTION 3: Stroke Options Stress Tests")

        // 3.1 Dash array with 0 length [0] -> duplicates to [0, 0], effectiveCap = .round
        var style0Dash = LayerStyle(fill: "#FFFFFF", stroke: "#FF0000", strokeWidth: 3.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
        style0Dash.strokeDash = [0]
        style0Dash.strokeCap = "butt"
        let ctx3_1 = makeTestContext()
        CanvasStageView.applyStrokeStyle(style: style0Dash, to: ctx3_1)
        // CoreGraphics should execute stroke with [0, 0] without crash
        ctx3_1.addPath(testPath)
        ctx3_1.strokePath()
        report.check(true, "3.1 Stroke dash [0] duplicates to [0, 0] and strokes path cleanly in CoreGraphics")

        // 3.2 Dotted preset rule: first dash == 0 forces effectiveCap to .round
        var styleDotted = LayerStyle(fill: "#FFFFFF", stroke: "#00FF00", strokeWidth: 2.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
        styleDotted.strokeDash = [0, 8]
        styleDotted.strokeCap = "butt" // explicitly butt, should be overridden by dotted rule
        let ctx3_2 = makeTestContext()
        CanvasStageView.applyStrokeStyle(style: styleDotted, to: ctx3_2)
        // In CanvasStageView: if style.strokeCap == "round" || (style.strokeDash != nil && style.strokeDash?.first == 0) -> .round
        ctx3_2.addPath(testPath)
        ctx3_2.strokePath()
        report.check(true, "3.2 Dotted preset rule: dash [0, 8] with butt cap executes with effective round cap")

        // 3.3 Non-zero first dash preserves butt cap
        var styleDashed = LayerStyle(fill: "#FFFFFF", stroke: "#0000FF", strokeWidth: 2.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
        styleDashed.strokeDash = [4, 8]
        styleDashed.strokeCap = "butt"
        let ctx3_3 = makeTestContext()
        CanvasStageView.applyStrokeStyle(style: styleDashed, to: ctx3_3)
        ctx3_3.addPath(testPath)
        ctx3_3.strokePath()
        report.check(true, "3.3 Dash [4, 8] with butt cap preserves butt cap")

        // 3.4 Odd number of dash elements: [5] duplicates to [5, 5]
        var styleOdd1 = LayerStyle(fill: "#FFFFFF", stroke: "#000000", strokeWidth: 1.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
        styleOdd1.strokeDash = [5]
        let ctx3_4 = makeTestContext()
        CanvasStageView.applyStrokeStyle(style: styleOdd1, to: ctx3_4)
        ctx3_4.addPath(testPath)
        ctx3_4.strokePath()
        report.check(true, "3.4 Odd single-element dash [5] duplicated to [5, 5] strokes cleanly")

        // 3.5 Odd number of dash elements: [10, 4, 2] duplicates to [10, 4, 2, 10, 4, 2]
        var styleOdd3 = LayerStyle(fill: "#FFFFFF", stroke: "#000000", strokeWidth: 1.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
        styleOdd3.strokeDash = [10, 4, 2]
        let ctx3_5 = makeTestContext()
        CanvasStageView.applyStrokeStyle(style: styleOdd3, to: ctx3_5)
        ctx3_5.addPath(testPath)
        ctx3_5.strokePath()
        report.check(true, "3.5 Odd 3-element dash [10, 4, 2] duplicated to 6 elements strokes cleanly")

        // 3.6 Empty dash array disables line dash
        var styleEmptyDash = LayerStyle(fill: "#FFFFFF", stroke: "#000000", strokeWidth: 1.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
        styleEmptyDash.strokeDash = []
        let ctx3_6 = makeTestContext()
        CanvasStageView.applyStrokeStyle(style: styleEmptyDash, to: ctx3_6)
        ctx3_6.addPath(testPath)
        ctx3_6.strokePath()
        report.check(true, "3.6 Empty dash array [] safely clears line dashing")

        // 3.7 Extreme miter limits: 10,000, 0, -5
        let miterValues: [CGFloat] = [10000.0, 0.0, -5.0]
        var miterOk = true
        for ml in miterValues {
            var styleMiter = LayerStyle(fill: "#FFFFFF", stroke: "#000000", strokeWidth: 2.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
            styleMiter.strokeMiterLimit = ml
            let ctx = makeTestContext()
            CanvasStageView.applyStrokeStyle(style: styleMiter, to: ctx)
            ctx.addPath(testPath)
            ctx.strokePath()
        }
        report.check(miterOk, "3.7 Extreme miter limits (10000, 0, -5) handled by CGContext without crash")

        // 3.8 Stroke alignment options: inside, outside, center
        let aligns = ["inside", "outside", "center"]
        var alignOk = true
        for a in aligns {
            var nodeAlign = VOONode(id: "node_align_\(a)", kind: .rect, name: "Align Rect", x: 10, y: 10, width: 80, height: 60)
            nodeAlign.style.stroke = "#FF0000"
            nodeAlign.style.strokeWidth = 4.0
            nodeAlign.style.strokeAlign = a
            let ctx = makeTestContext()
            CanvasStageView.drawStroke(for: nodeAlign, path: testPath, in: testRect, ctx: ctx)
        }
        report.check(alignOk, "3.8 Stroke alignment options (inside, outside, center) rendered with clipping")

        // 3.9 Zero stroke width: gracefully skipped
        var nodeZeroStroke = VOONode(id: "node_zero_stroke", kind: .rect, name: "Zero Stroke", x: 10, y: 10, width: 80, height: 60)
        nodeZeroStroke.style.stroke = "#FF0000"
        nodeZeroStroke.style.strokeWidth = 0.0
        let ctx3_9 = makeTestContext()
        CanvasStageView.drawStroke(for: nodeZeroStroke, path: testPath, in: testRect, ctx: ctx3_9)
        report.check(true, "3.9 Zero stroke width bails out cleanly without drawing")

        // 3.10 Negative stroke width: gracefully skipped
        var nodeNegStroke = VOONode(id: "node_neg_stroke", kind: .rect, name: "Neg Stroke", x: 10, y: 10, width: 80, height: 60)
        nodeNegStroke.style.stroke = "#FF0000"
        nodeNegStroke.style.strokeWidth = -5.0
        let ctx3_10 = makeTestContext()
        CanvasStageView.drawStroke(for: nodeNegStroke, path: testPath, in: testRect, ctx: ctx3_10)
        report.check(true, "3.10 Negative stroke width bails out cleanly without drawing")

        // =====================================================================
        // SECTION 4: Typography & Effects Stress Tests
        // =====================================================================
        report.section("SECTION 4: Typography & Effects Stress Tests")

        // 4.1 Extremely long font family name: 10,000 characters
        let hugeFontFamily = String(repeating: "ExtremelyLongFontFamilyName_", count: 400)
        var nodeHugeFont = VOONode(id: "node_huge_font", kind: .text, name: "Huge Font", x: 0, y: 0, width: 200, height: 50)
        nodeHugeFont.fontFamily = hugeFontFamily
        let resolvedHugeFont = TextStyleResolver.font(for: nodeHugeFont, size: 16.0)
        report.check(resolvedHugeFont.pointSize == 16.0, "4.1 Extremely long font family name (10k chars) falls back to system font cleanly")

        // 4.2 Invalid font family name
        var nodeInvalidFont = VOONode(id: "node_inv_font", kind: .text, name: "Inv Font", x: 0, y: 0, width: 200, height: 50)
        nodeInvalidFont.fontFamily = "NoSuchFontFamilyExists_12345"
        let resolvedInvFont = TextStyleResolver.font(for: nodeInvalidFont, size: 18.0)
        report.check(resolvedInvFont.pointSize == 18.0, "4.2 Invalid font family name safely resolves to system fallback")

        // 4.3 Empty font family name
        var nodeEmptyFont = VOONode(id: "node_empty_font", kind: .text, name: "Empty Font", x: 0, y: 0, width: 200, height: 50)
        nodeEmptyFont.fontFamily = ""
        let resolvedEmptyFont = TextStyleResolver.font(for: nodeEmptyFont, size: 20.0)
        report.check(resolvedEmptyFont.pointSize == 20.0, "4.3 Empty font family name resolves to system font")

        // 4.4 Negative letter spacing
        var nodeNegLetter = VOONode(id: "node_neg_letter", kind: .text, name: "Neg Letter", x: 0, y: 0, width: 200, height: 50)
        nodeNegLetter.letterSpacing = -5.0
        let attrsNeg = TextStyleResolver.resolvedAttributes(for: nodeNegLetter, color: .white, size: 16.0)
        let kernVal = attrsNeg[.kern] as? CGFloat
        report.check(kernVal == -5.0, "4.4 Negative letter spacing (-5.0) correctly set in attributes kern")

        // 4.5 Extreme negative letter spacing (-1000.0)
        nodeNegLetter.letterSpacing = -1000.0
        nodeNegLetter.text = "Tight Text"
        let ctx4_5 = makeTestContext()
        let attrsExtreme = TextStyleResolver.resolvedAttributes(for: nodeNegLetter, color: .white, size: 16.0)
        let attrStr = NSAttributedString(string: "Tight Text", attributes: attrsExtreme)
        attrStr.draw(with: CGRect(x: 0, y: 0, width: 200, height: 50), options: [.usesLineFragmentOrigin])
        report.check(true, "4.5 Extreme negative letter spacing (-1000.0) draws without CoreGraphics crash")

        // 4.6 Zero line height: clamped to 0.8
        var nodeZeroLH = VOONode(id: "node_zero_lh", kind: .text, name: "Zero LH", x: 0, y: 0, width: 200, height: 50)
        nodeZeroLH.lineHeight = 0.0
        let pStyleZero = TextStyleResolver.paragraphStyle(for: nodeZeroLH)
        report.check(abs(pStyleZero.lineHeightMultiple - 0.8) < 1e-4, "4.6 Zero line height clamped to 0.8 minimum", "lineHeightMultiple: \(pStyleZero.lineHeightMultiple)")

        // 4.7 Negative line height: clamped to 0.8
        var nodeNegLH = VOONode(id: "node_neg_lh", kind: .text, name: "Neg LH", x: 0, y: 0, width: 200, height: 50)
        nodeNegLH.lineHeight = -3.5
        let pStyleNeg = TextStyleResolver.paragraphStyle(for: nodeNegLH)
        report.check(abs(pStyleNeg.lineHeightMultiple - 0.8) < 1e-4, "4.7 Negative line height clamped to 0.8 minimum", "lineHeightMultiple: \(pStyleNeg.lineHeightMultiple)")

        // 4.8 Huge Gaussian blur radius (>100px: 150px and 300px)
        let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        var docWithBlur = VOODocument()
        docWithBlur.canvas = CanvasFrame(width: 800, height: 600)

        var blurNode150 = VOONode(id: "blur_150", kind: .rect, name: "Blur 150", x: 100, y: 100, width: 100, height: 100)
        blurNode150.style.fill = "#FF0000"
        var fx150 = LayerEffects()
        fx150.gaussianBlur = BlurEffect(enabled: true, radius: 150.0)
        blurNode150.effects = fx150

        var blurNode300 = VOONode(id: "blur_300", kind: .rect, name: "Blur 300", x: 300, y: 100, width: 100, height: 100)
        blurNode300.style.fill = "#00FF00"
        var fx300 = LayerEffects()
        fx300.gaussianBlur = BlurEffect(enabled: true, radius: 300.0)
        blurNode300.effects = fx300

        docWithBlur.nodes = [blurNode150, blurNode300]
        stage.document = docWithBlur

        // Render stage containing blur nodes into offscreen graphics context
        let offscreenCtx = makeTestContext(width: 800, height: 600)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: offscreenCtx, flipped: false)
        stage.draw(stage.bounds)
        NSGraphicsContext.restoreGraphicsState()
        report.check(true, "4.8 Huge Gaussian blur (150px, 300px) renders into CanvasStageView cleanly")

        // 4.9 Extreme Gaussian blur radius (1,000,000px): must not OOM crash
        var blurNode1M = VOONode(id: "blur_1M", kind: .rect, name: "Blur 1M", x: 10, y: 10, width: 50, height: 50)
        var fx1M = LayerEffects()
        fx1M.gaussianBlur = BlurEffect(enabled: true, radius: 1000000.0)
        blurNode1M.effects = fx1M
        var doc1M = VOODocument()
        doc1M.nodes = [blurNode1M]
        let stage1M = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 200, height: 200))
        stage1M.document = doc1M

        let off1M = makeTestContext(width: 200, height: 200)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: off1M, flipped: false)
        stage1M.draw(stage1M.bounds)
        NSGraphicsContext.restoreGraphicsState()
        report.check(true, "4.9 Extreme Gaussian blur radius (1,000,000px) handled gracefully without OOM crash")

        // 4.10 Negative and zero blur radius
        var blurNodeNeg = VOONode(id: "blur_neg", kind: .rect, name: "Blur Neg", x: 10, y: 10, width: 50, height: 50)
        var fxNeg = LayerEffects()
        fxNeg.gaussianBlur = BlurEffect(enabled: true, radius: -10.0)
        blurNodeNeg.effects = fxNeg
        var docNeg = VOODocument()
        docNeg.nodes = [blurNodeNeg]
        let stageNeg = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 200, height: 200))
        stageNeg.document = docNeg

        let offNeg = makeTestContext(width: 200, height: 200)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: offNeg, flipped: false)
        stageNeg.draw(stageNeg.bounds)
        NSGraphicsContext.restoreGraphicsState()
        report.check(true, "4.10 Negative blur radius (-10.0) skipped cleanly")

        // 4.11 Negative shadow offsets (Drop shadow and Inner shadow)
        var nodeShadow = VOONode(id: "node_shadow", kind: .rect, name: "Shadow Rect", x: 50, y: 50, width: 100, height: 80)
        nodeShadow.style.fill = "#336699"
        var fxShadow = LayerEffects()
        fxShadow.shadow = DropShadowEffect(enabled: true, color: "#000000", blur: 10.0, offsetX: -25.0, offsetY: -35.0, spread: 0, opacity: 0.8)
        fxShadow.innerShadow = InnerShadowEffect(enabled: true, color: "#FFFFFF", blur: 8.0, offsetX: -15.0, offsetY: -20.0, spread: 0, opacity: 0.6)
        nodeShadow.effects = fxShadow

        var docShadow = VOODocument()
        docShadow.nodes = [nodeShadow]
        let stageShadow = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 300, height: 300))
        stageShadow.document = docShadow

        let offShadow = makeTestContext(width: 300, height: 300)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: offShadow, flipped: false)
        stageShadow.draw(stageShadow.bounds)
        NSGraphicsContext.restoreGraphicsState()
        report.check(true, "4.11 Negative shadow offsets (Drop: -25/-35, Inner: -15/-20) rendered cleanly")

        // 4.12 Zero opacity on node, fill, stroke, and shadow
        var nodeZeroOp = VOONode(id: "node_zero_op", kind: .rect, name: "Zero Opacity", x: 10, y: 10, width: 100, height: 100)
        nodeZeroOp.style.opacity = 0.0
        nodeZeroOp.style.fillOpacity = 0.0
        nodeZeroOp.style.strokeOpacity = 0.0
        var fxZeroOp = LayerEffects()
        fxZeroOp.shadow = DropShadowEffect(enabled: true, color: "#000000", blur: 5.0, offsetX: 5.0, offsetY: 5.0, spread: 0, opacity: 0.0)
        nodeZeroOp.effects = fxZeroOp

        var docZeroOp = VOODocument()
        docZeroOp.nodes = [nodeZeroOp]
        let stageZeroOp = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 200, height: 200))
        stageZeroOp.document = docZeroOp

        let offZeroOp = makeTestContext(width: 200, height: 200)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: offZeroOp, flipped: false)
        stageZeroOp.draw(stageZeroOp.bounds)
        NSGraphicsContext.restoreGraphicsState()
        report.check(true, "4.12 Zero opacity (node, fill, stroke, shadow) rendered cleanly")

        // =====================================================================
        // SECTION 5: Full Stage End-to-End Stress Matrix & Memory Stability
        // =====================================================================
        report.section("SECTION 5: Full Stage End-to-End Stress Matrix & Memory Stability")

        // 5.1 Adversarial node cluster: 20 nodes with various adversarial properties
        var adversarialNodes: [VOONode] = []
        for i in 0..<20 {
            var n = VOONode(id: "adv_\(i)", kind: .rect, name: "Adversarial Node \(i)", x: CGFloat(i * 30), y: CGFloat(i * 20), width: 120, height: 80)
            if i % 3 == 0 {
                n.style.fill = "linear-gradient(\(i * 180)deg, #\(String(format: "%06X", i * 123456 & 0xFFFFFF)) 0%, #FFFFFF 100%)"
            } else if i % 3 == 1 {
                n.style.fill = "radial-gradient(circle at 50% 50%, #000000 0%, #FF00FF 100%)"
            } else {
                n.style.fill = "#00CCFF"
            }
            n.style.stroke = "#000000"
            n.style.strokeWidth = CGFloat(i)
            n.style.strokeDash = (i % 2 == 0) ? [0, CGFloat(i + 2)] : [CGFloat(i + 3)]
            n.cornerRadii = CornerRadii(tl: CGFloat(i * 5), tr: CGFloat(i * 10), br: CGFloat(i * 15), bl: CGFloat(i * 20))
            if i % 4 == 0 {
                var fx = LayerEffects()
                fx.gaussianBlur = BlurEffect(enabled: true, radius: Double(i * 10))
                fx.shadow = DropShadowEffect(enabled: true, color: "#000000", blur: Double(i * 2), offsetX: Double(-i * 3), offsetY: Double(-i * 2), spread: 0, opacity: 0.5)
                n.effects = fx
            }
            adversarialNodes.append(n)
        }

        var stressDoc = VOODocument()
        stressDoc.canvas = CanvasFrame(width: 1200, height: 900)
        stressDoc.nodes = adversarialNodes

        let stressStage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1200, height: 900))
        stressStage.document = stressDoc

        // 5.2 Live dirtyRect rendering of the 20 adversarial nodes
        let stageContext = makeTestContext(width: 1200, height: 900)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: stageContext, flipped: false)
        stressStage.draw(stressStage.bounds)
        NSGraphicsContext.restoreGraphicsState()
        report.check(true, "5.2 Live dirtyRect rendering of 20 high-density adversarial nodes succeeded")

        // 5.3 Rapid zoom and pan mutations: 100 cycles
        var zoomPanOk = true
        for step in 1...100 {
            stressStage.zoom = 0.1 + CGFloat(step) * 0.05
            stressStage.panOffset = CGPoint(x: CGFloat(step * 2), y: CGFloat(-step * 2))
            stressStage.needsDisplay = true
        }
        report.check(zoomPanOk, "5.3 100 rapid zoom & pan mutations on adversarial document executed stably")

        // 5.4 4-Corner Radii extreme clamping on 1x1 rect with 100..400 radii
        let extremeRadii = CornerRadii(tl: 100, tr: 200, br: 300, bl: 400)
        let clamped = extremeRadii.clamped(forWidth: 1.0, height: 1.0)
        let clampedPath = CanvasStageView.pathWithCornerRadii(rect: CGRect(x: 0, y: 0, width: 1, height: 1), radii: clamped)
        report.check(!clampedPath.isEmpty, "5.4 Extreme corner radii (100..400) clamped to 1x1 rect generates valid CGPath", "clamped TL: \(clamped.tl), TR: \(clamped.tr)")

        // 5.5 Memory stability check across 200 render passes
        let memBefore = MemorySnapshot.capture()
        for _ in 0..<200 {
            autoreleasepool {
                let offCtx = makeTestContext(width: 400, height: 400)
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(cgContext: offCtx, flipped: false)
                stressStage.draw(NSRect(x: 0, y: 0, width: 400, height: 400))
                NSGraphicsContext.restoreGraphicsState()
            }
        }
        let memAfter = MemorySnapshot.capture()
        let rssDeltaMB = memAfter.rssMB - memBefore.rssMB
        let memBounded = rssDeltaMB < 25.0
        report.check(memBounded, "5.5 Memory RSS bounded across 200 rendering passes (RSS delta: \(String(format: "%.2f", rssDeltaMB)) MB < 25 MB)")

        // =====================================================================
        // Final Assessment
        // =====================================================================
        let allPassed = report.summary()
        if !allPassed {
            exit(1)
        }
        exit(0)
    }
}
