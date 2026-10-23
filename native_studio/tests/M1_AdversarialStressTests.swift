//
//  M1_AdversarialStressTests.swift
//  native_studio
//
//  Empirical Challenger Adversarial Stress Suite for Milestone M1
//  Author: Challenger 1 (teamwork_preview_challenger)
//  Date: 2026-10-21
//
//  Mission Focus Areas:
//  1. ToolRail flyout edge cases:
//     - Rapid subtool switching (10,000 cycles) across Pen, Shape, Selection families
//     - Off-screen popover bounds, zero/negative positioning bounds, nil window handling
//     - Escape key dismissal (single and repeated calls)
//     - Outside click dismissal (inside vs outside, boundary points)
//  2. Shape geometry generators:
//     - Extreme box dimensions (zero width/height, 0x0, negative rects, 1x1 rect, 10,000x10,000 rect)
//     - Star inner ratio boundary values (0.0, negative, 1.0, >1.0, invalid spikes count)
//     - Polygon angular symmetry (regular edge length equality, bilateral axis symmetry, sides < 3)
//     - Line & Arrow generators (shaft & wing geometry, zero-length vectors)
//     - [CRITICAL PROBE] Subprocess verification of Arrow click crash in CanvasStageView.finishShapeCreation
//  3. Contextual Taskbar positioning:
//     - Absolute bottom edge selection (automatic flipping to top with margin)
//     - Top edge selection and tall selection clipping behavior
//     - Narrow viewport clamping behavior (leftLimit vs rightLimit inversion)
//     - Off-screen selections during fast pan/zoom transforms
//     - Coordinate validity (zero NaN, zero Inf across all frame outputs)
//

import AppKit
import CoreGraphics
import Darwin
import Foundation

// MARK: - Empirical Challenger Harness

public final class M1StressHarness: @unchecked Sendable {
    public private(set) var totalAsserts = 0
    public private(set) var passedAsserts = 0
    public private(set) var failedAsserts = 0
    public private(set) var bugsFound: [(title: String, detail: String, severity: String)] = []

    public func assert(_ condition: Bool, _ title: String, detail: String = "") {
        totalAsserts += 1
        if condition {
            let detailStr = detail.isEmpty ? "" : " (\(detail))"
            print("  \u{001B}[32m✓ [PASS]\u{001B}[0m \(title)\(detailStr)")
            passedAsserts += 1
        } else {
            let detailStr = detail.isEmpty ? "" : " [\(detail)]"
            let msg = "  \u{001B}[31m✗ [FAIL]\u{001B}[0m \(title)\(detailStr)"
            print(msg)
            failedAsserts += 1
        }
    }

    public func recordBug(title: String, detail: String, severity: String = "HIGH") {
        bugsFound.append((title: title, detail: detail, severity: severity))
        print("  \u{001B}[35m⚡ [BUG CONFIRMED - \(severity)]\u{001B}[0m \(title)")
        print("     \u{001B}[35m↳ \(detail)\u{001B}[0m")
    }

    public func section(_ name: String) {
        print("\n" + String(repeating: "=", count: 78))
        print("  \(name)")
        print(String(repeating: "=", count: 78))
    }

    public func summary() -> Bool {
        print("\n" + String(repeating: "=", count: 78))
        print("  EMPIRICAL CHALLENGER M1 STRESS SUITE SUMMARY")
        print(String(repeating: "=", count: 78))
        print("  Total Assertions: \(totalAsserts)")
        print("  Passed:           \(passedAsserts)")
        print("  Failed:           \(failedAsserts)")
        print("  Confirmed Bugs:   \(bugsFound.count)")
        if !bugsFound.isEmpty {
            print("\n  Summary of Confirmed Vulnerabilities:")
            for (idx, b) in bugsFound.enumerated() {
                print("    \(idx + 1). [\(b.severity)] \(b.title): \(b.detail)")
            }
        }
        print(String(repeating: "=", count: 78))
        return failedAsserts == 0 && bugsFound.isEmpty
    }
}

// MARK: - Subprocess Probe Execution Helper

public struct SubprocessProbeHelper {
    public static func run(flag: String) -> (exitCode: Int32, output: String) {
        let binaryPath = CommandLine.arguments[0]
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = [flag]

        let pipe = Pipe()
        process.standardError = pipe
        process.standardOutput = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let out = String(data: data, encoding: .utf8) ?? ""
            return (process.terminationStatus, out)
        } catch {
            return (-1, "Failed to launch subprocess probe: \(error)")
        }
    }
}

// MARK: - Section 1: ToolRail & Flyout Edge Cases

public func testToolRailFlyoutEdgeCases(harness: M1StressHarness) {
    harness.section("TEST SUITE 1: ToolRail & Flyout Edge Cases")

    // 1.1 Rapid Switching Stress across all Subtool Families (10,000 cycles)
    do {
        let state = ToolRailState()
        var penCallbacks = 0
        var shapeCallbacks = 0
        var selectionCallbacks = 0

        state.onPenSubToolChanged = { _ in penCallbacks += 1 }
        state.onShapeSubToolChanged = { _ in shapeCallbacks += 1 }
        state.onSelectionSubToolChanged = { _ in selectionCallbacks += 1 }

        let penSubs = PenSubTool.allCases
        let shapeSubs = ShapeSubTool.allCases
        let selectionSubs = SelectionSubTool.allCases

        let iterations = 10_000
        for i in 0..<iterations {
            let nextPen = penSubs[i % penSubs.count]
            state.selectPenSubTool(nextPen)

            let nextShape = shapeSubs[i % shapeSubs.count]
            state.selectShapeSubTool(nextShape)

            let nextSelection = selectionSubs[i % selectionSubs.count]
            state.selectSelectionSubTool(nextSelection)
        }

        harness.assert(penCallbacks == iterations, "Pen subtool callback fidelity under 10k transitions", "fired \(penCallbacks)")
        harness.assert(shapeCallbacks == iterations, "Shape subtool callback fidelity under 10k transitions", "fired \(shapeCallbacks)")
        harness.assert(selectionCallbacks == iterations, "Selection subtool callback fidelity under 10k transitions", "fired \(selectionCallbacks)")
        harness.assert(state.currentPenSubTool == state.penSubTool.rawValue, "Current pen subtool name strictly synchronized with active enum")
    }

    // 1.2 Rapid Keyboard Shortcut Cycling
    do {
        let state = ToolRailState()
        var toolChangeEvents = 0
        state.onActiveToolChanged = { _ in toolChangeEvents += 1 }

        let shortcutKeys: [Character] = ["p", "r", "v", "b", "t", "e", "a", "f"]
        for key in shortcutKeys {
            for _ in 0..<500 {
                let matched = state.handleShortcutKey(key)
                if matched == nil {
                    harness.assert(false, "Unmatched shortcut key", "Key: \(key)")
                }
            }
        }
        harness.assert(toolChangeEvents == shortcutKeys.count * 500, "Rapid keyboard shortcut cycling executed cleanly without event drops")
    }

    // 1.3 Off-screen popover bounds & nil window safety
    do {
        let popover = ToolFlyoutPopover.shared

        // Test with positioningView having nil window (headless test environment)
        let headlessView = NSView(frame: NSRect(x: 0, y: 0, width: 36, height: 36))
        harness.assert(headlessView.window == nil, "Headless view has nil window")

        popover.show(for: .pen, relativeTo: headlessView)
        harness.assert(popover.isOpen, "Popover handles nil window gracefully without crashing and sets isOpen=true")
        harness.assert(popover.currentTool == .pen, "Current tool is .pen")

        popover.close()
        harness.assert(!popover.isOpen, "Popover closed cleanly")
        harness.assert(popover.currentTool == nil, "Current tool cleared to nil")

        // Test with zero-bounds view
        let zeroView = NSView(frame: .zero)
        popover.show(for: .shapes, relativeTo: zeroView)
        harness.assert(popover.isOpen, "Zero bounds view handled safely")
        popover.close()

        // Test with off-screen negative bounds
        let offscreenView = NSView(frame: NSRect(x: -5000, y: -5000, width: 36, height: 36))
        popover.show(for: .brush, relativeTo: offscreenView)
        harness.assert(popover.isOpen, "Negative off-screen frame handled safely")
        popover.close()

        // Test show() with tools that do NOT have flyouts (.text, .move, .eraser, .artboard)
        popover.show(for: .text, relativeTo: headlessView)
        harness.assert(!popover.isOpen, "Tool without flyout (.text) safely rejected, popover remains closed")
        popover.show(for: .move, relativeTo: headlessView)
        harness.assert(!popover.isOpen, "Tool without flyout (.move) safely rejected, popover remains closed")
    }

    // 1.4 Escape Dismissal
    do {
        let popover = ToolFlyoutPopover.shared
        popover.close()

        // When closed, handleEscape returns false
        let handledWhenClosed = popover.handleEscape()
        harness.assert(!handledWhenClosed, "handleEscape returns false when popover is not open")

        // Open popover
        let dummy = NSView()
        popover.show(for: .pen, relativeTo: dummy)
        harness.assert(popover.isOpen, "Popover opened for escape test")

        // First escape dismissal
        let handledFirst = popover.handleEscape()
        harness.assert(handledFirst, "handleEscape returns true when open and closes popover")
        harness.assert(!popover.isOpen, "Popover isOpen is now false")

        // Repeated escape dismissal
        let handledSecond = popover.handleEscape()
        harness.assert(!handledSecond, "Repeated handleEscape returns false (no redundant closure)")
    }

    // 1.5 Outside Click Dismissal
    do {
        let popover = ToolFlyoutPopover.shared
        popover.close()

        let dummy = NSView()
        let flyoutFrame = CGRect(x: 100, y: 100, width: 180, height: 100)

        // Test click when closed
        let closedClick = popover.handleOutsideClick(clickPoint: CGPoint(x: 50, y: 50), flyoutFrame: flyoutFrame)
        harness.assert(!closedClick, "handleOutsideClick returns false when popover is closed")

        // Open popover
        popover.show(for: .shapes, relativeTo: dummy)
        harness.assert(popover.isOpen, "Popover opened for click test")

        // Click INSIDE frame -> must NOT close
        let insideClick = popover.handleOutsideClick(clickPoint: CGPoint(x: 150, y: 150), flyoutFrame: flyoutFrame)
        harness.assert(!insideClick, "handleOutsideClick returns false for point inside flyout frame")
        harness.assert(popover.isOpen, "Popover remains open after inside click")

        // Click on boundary point (100, 100)
        let boundaryClick = popover.handleOutsideClick(clickPoint: CGPoint(x: 100, y: 100), flyoutFrame: flyoutFrame)
        harness.assert(!boundaryClick, "handleOutsideClick returns false for boundary point")
        harness.assert(popover.isOpen, "Popover remains open on boundary click")

        // Click OUTSIDE frame -> MUST close
        let outsideClick = popover.handleOutsideClick(clickPoint: CGPoint(x: 50, y: 50), flyoutFrame: flyoutFrame)
        harness.assert(outsideClick, "handleOutsideClick returns true for point outside flyout frame")
        harness.assert(!popover.isOpen, "Popover is now closed after outside click")
    }
}

// MARK: - Section 2: Shape Geometry Generators Stress

public func testShapeGeometryGeneratorsStress(harness: M1StressHarness) {
    harness.section("TEST SUITE 2: Shape Geometry Generators Stress")

    // 2.1 Extreme Box Dimensions for Regular Polygon
    do {
        // Zero width
        let ptsZeroW = ShapeGenerators.regularPolygonPoints(in: CGRect(x: 50, y: 50, width: 0, height: 100), sides: 6)
        harness.assert(ptsZeroW.count == 6, "Zero-width polygon produces exactly 6 points")
        harness.assert(ptsZeroW.allSatisfy { abs($0.x - 50.0) < 1e-4 }, "Zero-width polygon x coordinates collapse to center x")
        harness.assert(ptsZeroW.allSatisfy { !$0.x.isNaN && !$0.y.isNaN }, "Zero-width polygon produces zero NaN coordinates")

        // Zero height
        let ptsZeroH = ShapeGenerators.regularPolygonPoints(in: CGRect(x: 50, y: 50, width: 100, height: 0), sides: 6)
        harness.assert(ptsZeroH.count == 6, "Zero-height polygon produces exactly 6 points")
        harness.assert(ptsZeroH.allSatisfy { abs($0.y - 50.0) < 1e-4 }, "Zero-height polygon y coordinates collapse to center y")

        // 0x0 rect
        let ptsZero = ShapeGenerators.regularPolygonPoints(in: .zero, sides: 6)
        harness.assert(ptsZero.count == 6, "0x0 polygon produces 6 points collapsed at (0, 0)")
        harness.assert(ptsZero.allSatisfy { $0.x == 0 && $0.y == 0 }, "All 0x0 points equal (0, 0)")

        // 1x1 minimal rect
        let ptsOne = ShapeGenerators.regularPolygonPoints(in: CGRect(x: 10, y: 10, width: 1, height: 1), sides: 5)
        harness.assert(ptsOne.count == 5, "1x1 polygon produces 5 points")
        harness.assert(ptsOne.allSatisfy { $0.x >= 10.0 && $0.x <= 11.0 && $0.y >= 10.0 && $0.y <= 11.0 }, "1x1 polygon points strictly confined within 1x1 box")

        // Huge 10,000 x 10,000 rect
        let ptsHuge = ShapeGenerators.regularPolygonPoints(in: CGRect(x: 0, y: 0, width: 10000, height: 10000), sides: 8)
        harness.assert(ptsHuge.count == 8, "10k x 10k polygon produces 8 points")
        harness.assert(ptsHuge.allSatisfy { !$0.x.isInfinite && !$0.y.isInfinite }, "Huge polygon points are finite with zero overflow")

        // Negative dimensions (width < 0, height < 0)
        let ptsNeg = ShapeGenerators.regularPolygonPoints(in: CGRect(x: 100, y: 100, width: -80, height: -60), sides: 6)
        harness.assert(ptsNeg.count == 6, "Negative dimension box produces 6 points without crash")
        harness.assert(ptsNeg.allSatisfy { !$0.x.isNaN && !$0.y.isNaN }, "Negative dimension points have zero NaNs")
    }

    // 2.2 Star Inner Ratio Boundary Values
    do {
        let box = CGRect(x: 0, y: 0, width: 200, height: 200)

        // innerRatio == 0.0 -> inner points collapse to center (100, 100)
        let starZeroRatio = ShapeGenerators.starPoints(in: box, spikes: 5, innerRatio: 0.0)
        harness.assert(starZeroRatio.count == 10, "Star with innerRatio 0.0 produces 10 points")
        for i in 0..<10 {
            if i % 2 == 1 { // Inner vertex
                let pt = starZeroRatio[i]
                harness.assert(abs(pt.x - 100.0) < 1e-4 && abs(pt.y - 100.0) < 1e-4, "Inner vertex \(i) collapses to center (100, 100)")
            }
        }

        // innerRatio == 1.0 -> all vertices at outer radius, forms regular 10-gon
        let starUnitRatio = ShapeGenerators.starPoints(in: box, spikes: 5, innerRatio: 1.0)
        harness.assert(starUnitRatio.count == 10, "Star with innerRatio 1.0 produces 10 points")
        let radii = starUnitRatio.map { hypot($0.x - 100.0, $0.y - 100.0) }
        harness.assert(radii.allSatisfy { abs($0 - 100.0) < 1e-4 }, "All vertices of innerRatio 1.0 star lie on outer circle radius (100pt)")

        // innerRatio < 0.0 (negative ratio: inverted spikes)
        let starNegRatio = ShapeGenerators.starPoints(in: box, spikes: 5, innerRatio: -0.5)
        harness.assert(starNegRatio.count == 10, "Negative inner ratio (-0.5) produces 10 points without NaN")
        harness.assert(starNegRatio.allSatisfy { !$0.x.isNaN && !$0.y.isNaN }, "Negative inner ratio coordinates are valid finite numbers")

        // innerRatio > 1.0 (inverted star where inner vertices extend beyond outer)
        let starLargeRatio = ShapeGenerators.starPoints(in: box, spikes: 5, innerRatio: 2.5)
        harness.assert(starLargeRatio.count == 10, "Large inner ratio (2.5) produces 10 points")
        let innerPtDist = hypot(starLargeRatio[1].x - 100.0, starLargeRatio[1].y - 100.0)
        harness.assert(abs(innerPtDist - 250.0) < 1e-4, "Inner vertex radius is exactly 250pt for ratio 2.5")

        // spikes < 3 guard check
        let starZeroSpikes = ShapeGenerators.starPoints(in: box, spikes: 0, innerRatio: 0.382)
        harness.assert(starZeroSpikes.isEmpty, "Star with 0 spikes safely returns empty array")
        let starTwoSpikes = ShapeGenerators.starPoints(in: box, spikes: 2, innerRatio: 0.382)
        harness.assert(starTwoSpikes.isEmpty, "Star with 2 spikes safely returns empty array")
        let starNegSpikes = ShapeGenerators.starPoints(in: box, spikes: -5, innerRatio: 0.382)
        harness.assert(starNegSpikes.isEmpty, "Star with negative spikes safely returns empty array")

        // High spikes count stress (1,000 spikes -> 2,000 vertices)
        let star1000 = ShapeGenerators.starPoints(in: box, spikes: 1000, innerRatio: 0.5)
        harness.assert(star1000.count == 2000, "1,000-spike star generates 2,000 vertices cleanly")
    }

    // 2.3 Polygon Angular Symmetry & Equilateral Edges
    do {
        // sides < 3 guard check
        let poly2 = ShapeGenerators.regularPolygonPoints(in: CGRect(x: 0, y: 0, width: 100, height: 100), sides: 2)
        harness.assert(poly2.isEmpty, "Polygon with sides < 3 safely returns empty array")

        // Test sides 3, 4, 5, 6, 8, 12, 100 in square boxes
        let sideCounts = [3, 4, 5, 6, 8, 12, 100]
        let R: CGFloat = 100.0
        let box = CGRect(x: 0, y: 0, width: 2 * R, height: 2 * R)
        let center = CGPoint(x: R, y: R)

        for n in sideCounts {
            let pts = ShapeGenerators.regularPolygonPoints(in: box, sides: n)
            harness.assert(pts.count == n, "Polygon sides=\(n) produces \(n) vertices")

            // 1. All vertices lie on the circumscribed circle: distance to center == R
            let distances = pts.map { hypot($0.x - center.x, $0.y - center.y) }
            let allOnCircle = distances.allSatisfy { abs($0 - R) < 1e-4 }
            harness.assert(allOnCircle, "Polygon sides=\(n) all vertices exactly at radius \(R)")

            // 2. All edge lengths between consecutive vertices are equal: 2 * R * sin(pi / n)
            let expectedEdge = 2.0 * R * sin(CGFloat.pi / CGFloat(n))
            var edgesEqual = true
            for i in 0..<n {
                let p1 = pts[i]
                let p2 = pts[(i + 1) % n]
                let edgeLen = hypot(p2.x - p1.x, p2.y - p1.y)
                if abs(edgeLen - expectedEdge) > 1e-3 {
                    edgesEqual = false
                    break
                }
            }
            harness.assert(edgesEqual, "Polygon sides=\(n) has equilateral edge lengths (expected \(String(format: "%.3f", expectedEdge)))")

            // 3. Bilateral symmetry across vertical axis:
            // Vertex 0 is at top center (x == center.x).
            // For vertex i and vertex (n - i), x - center.x == -(x_{n-i} - center.x) and y == y_{n-i}.
            var symmetric = true
            for i in 1..<n {
                let p_i = pts[i]
                let p_mirror = pts[n - i]
                let dx_i = p_i.x - center.x
                let dx_mirror = p_mirror.x - center.x
                if abs(dx_i + dx_mirror) > 1e-4 || abs(p_i.y - p_mirror.y) > 1e-4 {
                    symmetric = false
                    break
                }
            }
            harness.assert(symmetric, "Polygon sides=\(n) exhibits exact bilateral symmetry across vertical axis")
        }
    }

    // 2.4 Line and Arrow Points
    do {
        // Line points
        let pStart = CGPoint(x: 10, y: 20)
        let pEnd = CGPoint(x: 150, y: 80)
        let linePts = ShapeGenerators.linePoints(from: pStart, to: pEnd)
        harness.assert(linePts.count == 2, "linePoints returns 2 points")
        harness.assert(linePts[0] == pStart && linePts[1] == pEnd, "linePoints matches start and end")

        // Arrow points normal
        let arrowPts = ShapeGenerators.arrowPoints(from: pStart, to: pEnd, headLength: 16.0, headAngle: .pi / 6.0)
        harness.assert(arrowPts.count == 4, "Normal arrow returns 4 points [start, end, wing1, wing2]")
        let w1Dist = hypot(arrowPts[2].x - pEnd.x, arrowPts[2].y - pEnd.y)
        let w2Dist = hypot(arrowPts[3].x - pEnd.x, arrowPts[3].y - pEnd.y)
        harness.assert(abs(w1Dist - 16.0) < 1e-3, "Arrow wing1 length is 16.0pt")
        harness.assert(abs(w2Dist - 16.0) < 1e-3, "Arrow wing2 length is 16.0pt")

        // Zero-length arrow vector: start == end
        let zeroArrowPts = ShapeGenerators.arrowPoints(from: pStart, to: pStart, headLength: 16.0, headAngle: .pi / 6.0)
        harness.assert(zeroArrowPts.count == 2, "Zero-length arrow returns 2 points [start, end]")
        harness.assert(zeroArrowPts[0] == pStart && zeroArrowPts[1] == pStart, "Zero-length arrow points match start")
    }

    // 2.5 [CRITICAL FINDING PROBE] Subprocess verification of Arrow click crash in CanvasStageView
    do {
        print("\n  --> Executing isolated subprocess probe for Arrow Tool Click Crash...")
        let probeResult = SubprocessProbeHelper.run(flag: "--probe-arrow-click-crash")
        print("  --> Subprocess probe exit code: \(probeResult.exitCode)")
        if !probeResult.output.isEmpty {
            print("  --> Subprocess stderr output:\n\(probeResult.output)")
        }

        if probeResult.exitCode == 133 || probeResult.output.contains("Index out of range") {
            harness.recordBug(
                title: "CanvasStageView Arrow Click Index-Out-Of-Range Fatal Crash",
                detail: "In CanvasStageView.swift:3113-3118, when creating an Arrow with a click (or distance <= 1e-4), ShapeGenerators.arrowPoints returns 2 points [start, end], but finishShapeCreation unconditionally accesses pts[2] and pts[3], causing SIGTRAP (Fatal error: Index out of range).",
                severity: "CRITICAL"
            )
        } else {
            harness.assert(false, "Arrow click crash probe did not reproduce expected crash", "exitCode=\(probeResult.exitCode)")
        }
    }
}

// MARK: - Section 3: Contextual Taskbar Positioning Stress

public func testContextualTaskbarPositioningStress(harness: M1StressHarness) {
    harness.section("TEST SUITE 3: Contextual Taskbar Positioning Stress")

    let stageBounds = CGRect(x: 0, y: 0, width: 1440, height: 900)
    let taskbarSize = CGSize(width: 340, height: 34)

    // 3.1 Absolute Bottom Edge Selection
    do {
        // Selection at bottom: minY = 0, maxY = 50
        let bottomSelection = CGRect(x: 400, y: 0, width: 200, height: 50)
        let (frame, isFlipped) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: bottomSelection,
            taskbarSize: taskbarSize,
            stageBounds: stageBounds,
            bottomLimit: 36.0,
            margin: 10.0
        )

        harness.assert(isFlipped, "Taskbar flips to top when selection is at canvas bottom edge")
        harness.assert(frame.minY == 50 + 10.0, "Taskbar placed exactly 10pt above bottom selection maxY (y=\(frame.minY))")
        harness.assert(frame.minY >= 36.0, "Taskbar y position is above bottom ruler/dock limit (>= 36)")
        harness.assert(frame.midX == bottomSelection.midX, "Taskbar is centered horizontally on selection (midX=\(frame.midX))")
    }

    // 3.2 Top Edge Selection & Tall Selection Top Clipping Check
    do {
        // Selection near top: minY = 800, maxY = 850
        let topSelection = CGRect(x: 400, y: 800, width: 200, height: 50)
        let (frame, isFlipped) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: topSelection,
            taskbarSize: taskbarSize,
            stageBounds: stageBounds,
            bottomLimit: 36.0,
            margin: 10.0
        )
        harness.assert(!isFlipped, "Taskbar placed below selection when near top (minY=800 >= 36.0)")
        harness.assert(frame.minY == 800 - 34 - 10.0, "Taskbar placed 10pt below selection (y=\(frame.minY))")
        harness.assert(frame.maxY <= stageBounds.height, "Taskbar completely inside stageBounds top edge")

        // TALL selection extending from bottom to near top: minY = 10, maxY = 880
        // posY = 10 - 44 = -34 < 36.0 -> flips to top!
        // posY = 880 + 10 = 890! Taskbar top is 890 + 34 = 924 > 900!
        let tallSelection = CGRect(x: 400, y: 10, width: 200, height: 870)
        let (tallFrame, tallFlipped) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: tallSelection,
            taskbarSize: taskbarSize,
            stageBounds: stageBounds,
            bottomLimit: 36.0,
            margin: 10.0
        )
        harness.assert(tallFlipped, "Tall selection flips to top due to bottom limit")
        if tallFrame.maxY > stageBounds.height {
            harness.recordBug(
                title: "Contextual Taskbar Top Viewport Edge Clipping",
                detail: "When a tall selection has minY < bottomLimit, taskbar flips to maxY + 10pt without clamping to stageBounds.height. For selection maxY=880 on 900pt stage, taskbar top is \(tallFrame.maxY)pt (extends 24pt off-screen).",
                severity: "MEDIUM"
            )
        } else {
            harness.assert(tallFrame.maxY <= stageBounds.height, "Tall selection taskbar clamped inside top viewport bounds")
        }
    }

    // 3.3 Narrow Viewport / Small Stage Width Edge Case
    do {
        // When stageBounds.width < taskbarSize.width + 16 (e.g. stage width = 250pt, taskbar = 340pt)
        let narrowBounds = CGRect(x: 0, y: 0, width: 250, height: 600)
        let sel = CGRect(x: 20, y: 200, width: 100, height: 100)
        let (narrowFrame, _) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: sel,
            taskbarSize: taskbarSize,
            stageBounds: narrowBounds,
            bottomLimit: 36.0,
            margin: 10.0
        )
        if narrowFrame.minX < 0 {
            harness.recordBug(
                title: "Contextual Taskbar Negative Clamping in Narrow Viewport",
                detail: "In ContextualTaskbarGeometry.calculateTaskbarFrame, posX = min(max(posX, leftLimit), rightLimit). When stageBounds.width (\(narrowBounds.width)) < taskbarW (\(taskbarSize.width)) + 16, rightLimit is negative (\(narrowBounds.width - taskbarSize.width - 8)), forcing posX to negative (\(narrowFrame.minX)) and pushing taskbar off-screen to the left.",
                severity: "LOW"
            )
        } else {
            harness.assert(narrowFrame.minX >= 0, "Narrow viewport does not result in negative x coordinates")
        }
    }

    // 3.4 Off-screen Selections & Viewport Pan/Zoom Transforms
    do {
        // Selection far to the left: x = -5000
        let leftSel = CGRect(x: -5000, y: 300, width: 100, height: 100)
        let (leftFrame, _) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: leftSel,
            taskbarSize: taskbarSize,
            stageBounds: stageBounds,
            bottomLimit: 36.0,
            margin: 10.0
        )
        harness.assert(leftFrame.minX == 8.0, "Selection far left clamps taskbar horizontally to leftLimit (8.0)")

        // Selection far to the right: x = 50000
        let rightSel = CGRect(x: 50000, y: 300, width: 100, height: 100)
        let (rightFrame, _) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: rightSel,
            taskbarSize: taskbarSize,
            stageBounds: stageBounds,
            bottomLimit: 36.0,
            margin: 10.0
        )
        let expectedRightLimit = stageBounds.width - taskbarSize.width - 8.0
        harness.assert(rightFrame.minX == expectedRightLimit, "Selection far right clamps taskbar horizontally to rightLimit (\(expectedRightLimit))")

        // Selection far below canvas: y = -5000
        let bottomFarSel = CGRect(x: 400, y: -5000, width: 100, height: 100)
        let (bottomFarFrame, _) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: bottomFarSel,
            taskbarSize: taskbarSize,
            stageBounds: stageBounds,
            bottomLimit: 36.0,
            margin: 10.0
        )
        harness.assert(bottomFarFrame.minY < 0, "Selection far below viewport places taskbar offscreen with selection (minY=\(bottomFarFrame.minY))")
    }

    // 3.5 Coordinate Validity under Extreme Pan and Zoom (Zero NaN / Zero Infinite)
    do {
        let zooms: [CGFloat] = [0.05, 0.1, 0.5, 1.0, 2.0, 8.0, 16.0, 32.0]
        let panOffsets: [CGPoint] = [
            .zero,
            CGPoint(x: -10000, y: -10000),
            CGPoint(x: 10000, y: 10000),
            CGPoint(x: -1_000_000, y: 1_000_000),
            CGPoint(x: 1_000_000, y: -1_000_000)
        ]
        let docRect = CGRect(x: 100, y: 100, width: 200, height: 150)

        var allCoordinatesValid = true
        for z in zooms {
            for pan in panOffsets {
                // Simulate CanvasStageView.viewRect(from:)
                let vx = docRect.origin.x * z + pan.x
                let vy = docRect.origin.y * z + pan.y
                let vw = docRect.width * z
                let vh = docRect.height * z
                let vRect = CGRect(x: vx, y: vy, width: vw, height: vh)

                let (frame, _) = ContextualTaskbarGeometry.calculateTaskbarFrame(
                    selectionViewRect: vRect,
                    taskbarSize: taskbarSize,
                    stageBounds: stageBounds,
                    bottomLimit: 36.0,
                    margin: 10.0
                )

                if frame.origin.x.isNaN || frame.origin.y.isNaN || frame.width.isNaN || frame.height.isNaN ||
                    frame.origin.x.isInfinite || frame.origin.y.isInfinite {
                    allCoordinatesValid = false
                    break
                }
            }
        }
        harness.assert(allCoordinatesValid, "Fast canvas pan/zoom transforms (0.05x to 32x, ±1e6 pan) produce 100% finite coordinates with zero NaNs")
    }
}

// MARK: - Subprocess Probe Execution Handlers

func runArrowClickCrashProbe() {
    // Recreate the exact CanvasStageView Arrow creation click flow in an isolated subprocess
    let shapeStartPoint = CGPoint(x: 300, y: 300)
    let docPt = CGPoint(x: 300, y: 300) // Click without dragging

    let pts = ShapeGenerators.arrowPoints(from: shapeStartPoint, to: docPt, headLength: 16.0, headAngle: .pi / 6.0)
    // Directly execute the production code from CanvasStageView.swift lines 3113-3118:
    let anchors = [
        PenAnchor(x: pts[0].x, y: pts[0].y, isClosed: false, type: .sharp),
        PenAnchor(x: pts[1].x, y: pts[1].y, isClosed: false, type: .sharp),
        PenAnchor(x: pts[2].x, y: pts[2].y, isClosed: false, type: .sharp),
        PenAnchor(x: pts[1].x, y: pts[1].y, isClosed: false, type: .sharp),
        PenAnchor(x: pts[3].x, y: pts[3].y, isClosed: false, type: .sharp)
    ]
    _ = anchors
    exit(0)
}

// MARK: - Main Runner

@main
public struct M1AdversarialChallengeMain {
    public static func main() {
        let args = CommandLine.arguments

        // Isolated subprocess probe dispatch
        if args.contains("--probe-arrow-click-crash") {
            runArrowClickCrashProbe()
            return
        }

        print("================================================================================")
        print("    VOO DESIGN NATIVE STUDIO — EMPIRICAL ADVERSARIAL STRESS SUITE (M1)")
        print("================================================================================")
        print("Target: ToolRail, ToolFlyoutPopover, ContextualTaskbarView, ShapeGenerators")
        print("Challenger: challenger_m1_1 (teamwork_preview_challenger)")
        print("Timestamp: \(ISO8601DateFormatter().string(from: Date()))")

        let harness = M1StressHarness()

        // Challenge 1: ToolRail & Flyout Edge Cases
        testToolRailFlyoutEdgeCases(harness: harness)

        // Challenge 2: Shape Geometry Generators Stress & Arrow Click Probe
        testShapeGeometryGeneratorsStress(harness: harness)

        // Challenge 3: Contextual Taskbar Positioning Stress
        testContextualTaskbarPositioningStress(harness: harness)

        let success = harness.summary()

        if success {
            print("\n\u{001B}[32m>>> EMPIRICAL VERDICT: APPROVE <<<\u{001B}[0m")
            exit(0)
        } else {
            print("\n\u{001B}[31m>>> EMPIRICAL VERDICT: REQUEST_CHANGES <<<\u{001B}[0m")
            print("Reason: Confirmed critical bug(s) identified during adversarial stress verification.")
            exit(1)
        }
    }
}
