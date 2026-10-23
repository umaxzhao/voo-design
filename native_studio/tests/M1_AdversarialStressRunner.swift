//
//  M1_AdversarialStressRunner.swift
//  native_studio tests
//
//  Empirical Challenger Stress Harness for Milestone M1
//  Targets:
//  1. Text direct double-click & IME boundary conditions
//  2. Context menu actions (Convert to Curves, Ungroup with edge cases)
//  3. Contextual taskbar actions (Duplicate, Flip H/V, Boolean ops with complex shapes, Undo/Redo)
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Standalone Challenger Assertions

final class ChallengerReport {
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
        section("EMPIRICAL CHALLENGER VERIFICATION SUMMARY")
        print("  Total Tests Executed: \(totalTests)")
        print("  Passed:               \(passedTests)")
        print("  Failed:               \(failedTests)")
        if !failureDetails.isEmpty {
            print("\n  Failures:")
            for f in failureDetails {
                print("    \(f)")
            }
        }
        print(String(repeating: "=", count: 80))
        return failedTests == 0
    }
}

// MARK: - Test Harness Main

@main
struct M1_AdversarialStressRunner {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)

        let report = ChallengerReport()

        // Helper to construct a real WindowController and CanvasStageView
        func makeEnvironment() -> (WindowController, CanvasStageView) {
            let wc = WindowController()
            let stage = wc.mainContentView.canvasStageView
            stage.frame = CGRect(x: 0, y: 0, width: 1200, height: 800)
            stage.document = VOODocument()
            stage.selectedNodeIds.removeAll()
            return (wc, stage)
        }

        func makeMouseEvent(type: NSEvent.EventType, location: CGPoint, clickCount: Int, modifierFlags: NSEvent.ModifierFlags = []) -> NSEvent {
            return NSEvent.mouseEvent(
                with: type,
                location: location,
                modifierFlags: modifierFlags,
                timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: 0,
                context: nil,
                eventNumber: 0,
                clickCount: clickCount,
                pressure: 1.0
            )!
        }

        // =====================================================================
        // SECTION 1: Text Direct Double-Click & IME Stress Tests
        // =====================================================================
        report.section("CHALLENGE 1: Text Direct Double-Click & IME")

        // 1.1 Rapid successive clicks on empty canvas in .text tool
        do {
            let (_, stage) = makeEnvironment()
            stage.activeTool = .text
            var insertionCount = 0
            stage.onRequestTextInsertion = { _ in insertionCount += 1 }

            let pt = stage.viewPoint(from: CGPoint(x: 200, y: 300))
            // Click 1 (clickCount: 1)
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: pt, clickCount: 1))
            // Click 2 (clickCount: 2)
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: pt, clickCount: 2))
            // Rapid Click 3 (clickCount: 3)
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: pt, clickCount: 3))
            // Rapid Click 4 (clickCount: 4)
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: pt, clickCount: 4))

            report.check(
                insertionCount == 1,
                "Text Tool: Rapid multiple clicks (clickCount 1..4) requests insertion exactly once",
                "insertionCount = \(insertionCount)"
            )
        }

        // 1.2 Move tool double click: empty canvas vs existing text node
        do {
            let (wc, stage) = makeEnvironment()
            stage.activeTool = .move
            var insertionPoints: [CGPoint] = []
            var editedNodes: [VOONode] = []

            stage.onRequestTextInsertion = { insertionPoints.append($0) }
            stage.onEditTextNode = { editedNodes.append($0) }

            let emptyDocPt = CGPoint(x: 400, y: 400)
            let emptyViewPt = stage.viewPoint(from: emptyDocPt)

            // ClickCount 1 on empty canvas
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: emptyViewPt, clickCount: 1))
            report.check(
                insertionPoints.isEmpty,
                "Move Tool: Single click on empty canvas does NOT trigger text insertion",
                "count = \(insertionPoints.count)"
            )

            // ClickCount 2 on empty canvas
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: emptyViewPt, clickCount: 2))
            report.check(
                insertionPoints.count == 1,
                "Move Tool: Double click on empty canvas triggers text insertion",
                "count = \(insertionPoints.count)"
            )

            // Now create a text node at that position
            let textNode = VOONode(
                id: "test-text-1",
                kind: .text,
                name: "Text 1",
                x: 400, y: 400,
                width: 160, height: 28,
                text: "Hello World",
                fontSize: 24
            )
            stage.document.nodes.append(textNode)

            // Double click on existing text node with move tool
            let insideViewPt = stage.viewPoint(from: CGPoint(x: 450, y: 410))
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: insideViewPt, clickCount: 2))

            report.check(
                editedNodes.count == 1 && editedNodes.first?.id == "test-text-1",
                "Move Tool: Double click on existing text node triggers onEditTextNode",
                "editedCount = \(editedNodes.count), id = \(editedNodes.first?.id ?? "none")"
            )
            report.check(
                insertionPoints.count == 1,
                "Move Tool: Double click on existing text node does NOT trigger text insertion",
                "insertionCount stayed at \(insertionPoints.count)"
            )
        }

        // 1.3 Move tool double click on non-text shapes (rect, ellipse, path)
        do {
            let (_, stage) = makeEnvironment()
            stage.activeTool = .move
            var insertionCount = 0
            var editCount = 0
            stage.onRequestTextInsertion = { _ in insertionCount += 1 }
            stage.onEditTextNode = { _ in editCount += 1 }

            let rectNode = VOONode(id: "rect-1", kind: .rect, name: "Rect", x: 100, y: 100, width: 200, height: 200)
            let ellipseNode = VOONode(id: "ellipse-1", kind: .ellipse, name: "Ellipse", x: 350, y: 100, width: 100, height: 100)
            stage.document.nodes.append(contentsOf: [rectNode, ellipseNode])

            // Double click on rect
            let rectViewPt = stage.viewPoint(from: CGPoint(x: 150, y: 150))
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: rectViewPt, clickCount: 2))

            // Double click on ellipse
            let ellipseViewPt = stage.viewPoint(from: CGPoint(x: 380, y: 130))
            stage.mouseDown(with: makeMouseEvent(type: .leftMouseDown, location: ellipseViewPt, clickCount: 2))

            report.check(
                insertionCount == 0 && editCount == 0,
                "Move Tool: Double clicking non-text shapes does NOT create text or enter text editing",
                "insertionCount = \(insertionCount), editCount = \(editCount)"
            )
        }

        // 1.4 IME firstRect boundary calculations with CJK, empty text, and zero character range
        do {
            let tv = CanvasInlineTextView(frame: CGRect(x: 50, y: 50, width: 300, height: 100))
            let window = NSWindow(
                contentRect: CGRect(x: 100, y: 100, width: 600, height: 400),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.contentView?.addSubview(tv)

            // CJK text
            tv.string = "你好，世界！这是一段中文输入法测试文本。"
            tv.font = NSFont.systemFont(ofSize: 18)

            let r0 = tv.firstRect(forCharacterRange: NSRange(location: 0, length: 0), actualRange: nil)
            report.check(
                r0.width >= 2.0 && r0.height >= 18.0 && !r0.origin.x.isNaN && !r0.origin.y.isNaN,
                "IME firstRect: CJK caret range (0, 0) returns positive width and height >= font size",
                "r0 = \(r0)"
            )

            let rMid = tv.firstRect(forCharacterRange: NSRange(location: 4, length: 2), actualRange: nil)
            report.check(
                rMid.width > 2.0 && rMid.height >= 18.0 && !rMid.origin.x.isNaN,
                "IME firstRect: CJK glyph range (4, 2) returns bounding rect for marked text",
                "rMid = \(rMid)"
            )

            // Empty text
            tv.string = ""
            let rEmpty = tv.firstRect(forCharacterRange: NSRange(location: 0, length: 0), actualRange: nil)
            report.check(
                rEmpty.width >= 2.0 && rEmpty.height >= 16.0 && !rEmpty.origin.x.isNaN && !rEmpty.origin.y.isNaN,
                "IME firstRect: Empty string range (0, 0) falls back to safe caret dimensions",
                "rEmpty = \(rEmpty)"
            )
        }

        // 1.5 IME firstRect with multi-byte emoji and complex ZWJ sequences
        do {
            let tv = CanvasInlineTextView(frame: CGRect(x: 50, y: 50, width: 300, height: 100))
            let window = NSWindow(contentRect: CGRect(x: 100, y: 100, width: 600, height: 400), styleMask: [.titled], backing: .buffered, defer: false)
            window.contentView?.addSubview(tv)

            let emojiText = "👨‍👩‍👧‍👦 🏳️‍🌈 👍🏽 🚀"
            tv.string = emojiText
            tv.font = NSFont.systemFont(ofSize: 20)

            let utf16Len = (emojiText as NSString).length
            var emojiCheckSuccess = true
            for loc in [0, 4, 11, utf16Len] {
                let rect = tv.firstRect(forCharacterRange: NSRange(location: loc, length: 0), actualRange: nil)
                if rect.width < 2.0 || rect.height < 16.0 || rect.origin.x.isNaN || rect.origin.y.isNaN {
                    emojiCheckSuccess = false
                    break
                }
            }
            report.check(
                emojiCheckSuccess,
                "IME firstRect: ZWJ family emoji, rainbow flag, and skin tone modifier ranges calculate cleanly",
                "length = \(utf16Len)"
            )

            // Out-of-bounds range safety (should not crash)
            let outOfBounds = tv.firstRect(forCharacterRange: NSRange(location: 99999, length: 5), actualRange: nil)
            report.check(
                outOfBounds.width >= 2.0 && outOfBounds.height >= 16.0,
                "IME firstRect: Out of bounds range query handled safely without fatal exception",
                "outOfBounds = \(outOfBounds)"
            )
        }

        // =====================================================================
        // SECTION 2: Context Menu & Actions Stress Tests
        // =====================================================================
        report.section("CHALLENGE 2: Context Menu Actions (Curves, Ungroup)")

        // 2.1 Convert to Curves on Rect, Ellipse, Path
        do {
            let rectNode = VOONode(id: "r1", kind: .rect, name: "R1", x: 10, y: 20, width: 100, height: 50)
            let curveRect = CurveConversionEngine.convertToCurves(node: rectNode)
            report.check(
                curveRect.kind == .path && curveRect.points?.count == 4 && curveRect.points?.last?.isClosed == true,
                "CurveConversion: Rect converts to 4-point closed cubic bezier path",
                "points = \(curveRect.points?.count ?? 0)"
            )

            let ellipseNode = VOONode(id: "e1", kind: .ellipse, name: "E1", x: 0, y: 0, width: 80, height: 80)
            let curveEllipse = CurveConversionEngine.convertToCurves(node: ellipseNode)
            let hasKappaHandles = curveEllipse.points?.allSatisfy { $0.inHandle != nil && $0.outHandle != nil } ?? false
            report.check(
                curveEllipse.kind == .path && curveEllipse.points?.count == 4 && hasKappaHandles,
                "CurveConversion: Ellipse converts to 4 smooth anchors with cubic kappa handles",
                "handles = \(hasKappaHandles)"
            )

            // Existing path conversion is idempotent
            let existingPath = VOONode(id: "p1", kind: .path, name: "P1", x: 0, y: 0, width: 50, height: 50,
                                       points: [PenAnchor(x: 0, y: 0), PenAnchor(x: 50, y: 50)])
            let convertedPath = CurveConversionEngine.convertToCurves(node: existingPath)
            report.check(
                convertedPath.kind == .path && convertedPath.points?.count == 2,
                "CurveConversion: Path node is preserved identically (idempotent)",
                "count = \(convertedPath.points?.count ?? 0)"
            )
        }

        // 2.2 Convert to Curves on Multi-line text & Empty text
        do {
            let multilineText = VOONode(
                id: "t-multi",
                kind: .text,
                name: "Multiline",
                x: 100, y: 100,
                width: 250, height: 120,
                text: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
                fontSize: 20
            )
            let curveMulti = CurveConversionEngine.convertToCurves(node: multilineText)
            report.check(
                curveMulti.kind == .path && curveMulti.points?.count == 4 &&
                (curveMulti.points?[1].x ?? 0) == 350,
                "CurveConversion: Multiline text converts to cubic bezier bbox without distortion",
                "p1.x = \(curveMulti.points?[1].x ?? 0)"
            )

            // Empty text
            let emptyText = VOONode(
                id: "t-empty",
                kind: .text,
                name: "Empty",
                x: 50, y: 50,
                width: 0, height: 0,
                text: "",
                fontSize: 16
            )
            let curveEmpty = CurveConversionEngine.convertToCurves(node: emptyText)
            let allFinite = curveEmpty.points?.allSatisfy { !$0.x.isNaN && !$0.y.isNaN } ?? false
            report.check(
                curveEmpty.kind == .path && curveEmpty.points?.count == 4 && allFinite,
                "CurveConversion: Zero-dimension empty text converts safely without NaN / Inf",
                "allFinite = \(allFinite)"
            )
        }

        // 2.3 WindowController convertToCurvesAction with Undo / Redo
        do {
            let (wc, stage) = makeEnvironment()
            let rectNode = VOONode(id: "r1", kind: .rect, name: "Rect 1", x: 10, y: 10, width: 80, height: 80)
            stage.document.nodes = [rectNode]
            stage.selectedNodeIds = ["r1"]

            wc.convertToCurvesAction(nil)
            let convertedNode = stage.document.nodes.first(where: { $0.id == "r1" })
            report.check(
                convertedNode?.kind == .path && convertedNode?.points?.count == 4,
                "WindowController.convertToCurvesAction: Converts selected rect to .path in document",
                "kind = \(convertedNode?.kind.rawValue ?? "")"
            )

            // Undo
            _ = wc.commandManager.undo(on: &stage.document)
            let undoneNode = stage.document.nodes.first(where: { $0.id == "r1" })
            report.check(
                undoneNode?.kind == .rect && undoneNode?.points == nil,
                "WindowController.convertToCurvesAction: Single-step Undo restores original .rect kind",
                "undoneKind = \(undoneNode?.kind.rawValue ?? "")"
            )

            // Redo
            _ = wc.commandManager.redo(on: &stage.document)
            let redoneNode = stage.document.nodes.first(where: { $0.id == "r1" })
            report.check(
                redoneNode?.kind == .path && redoneNode?.points?.count == 4,
                "WindowController.convertToCurvesAction: Redo cleanly re-applies .path conversion",
                "redoneKind = \(redoneNode?.kind.rawValue ?? "")"
            )
        }

        // 2.4 Ungroup single child, zero children, and nested groups
        do {
            let (wc, stage) = makeEnvironment()

            // A. Single child group
            let child1 = VOONode(id: "c1", kind: .rect, name: "Child 1", x: 10, y: 10, width: 50, height: 50)
            let group1 = VOONode(id: "g1", kind: .group, name: "Group 1", x: 10, y: 10, width: 50, height: 50, childIds: ["c1"])
            stage.document.nodes = [child1, group1]
            stage.selectedNodeIds = ["g1"]

            wc.ungroupAction(nil)
            report.check(
                !stage.document.nodes.contains(where: { $0.id == "g1" }) &&
                stage.document.nodes.contains(where: { $0.id == "c1" }) &&
                stage.selectedNodeIds.contains("c1"),
                "Ungroup: Single-child group dissolves and transfers selection to child",
                "selected = \(stage.selectedNodeIds)"
            )

            // Undo ungroup
            _ = wc.commandManager.undo(on: &stage.document)
            report.check(
                stage.document.nodes.contains(where: { $0.id == "g1" }),
                "Ungroup: Undo restores the dissolved group node",
                "nodes = \(stage.document.nodes.map { $0.id })"
            )

            // B. Zero child group (degenerate group)
            let emptyGroup = VOONode(id: "g-empty", kind: .group, name: "Empty Group", x: 0, y: 0, width: 10, height: 10, childIds: [])
            stage.document.nodes = [emptyGroup]
            stage.selectedNodeIds = ["g-empty"]

            wc.ungroupAction(nil)
            report.check(
                !stage.document.nodes.contains(where: { $0.id == "g-empty" }) &&
                stage.selectedNodeIds.isEmpty,
                "Ungroup: Zero-child empty group is deleted without crash, selection cleared",
                "nodes count = \(stage.document.nodes.count)"
            )

            // C. Nested group: G_Outer -> G_Inner -> Leaf
            let leaf = VOONode(id: "leaf", kind: .ellipse, name: "Leaf", x: 0, y: 0, width: 30, height: 30)
            let gInner = VOONode(id: "g-inner", kind: .group, name: "Inner", x: 0, y: 0, width: 30, height: 30, childIds: ["leaf"])
            let gOuter = VOONode(id: "g-outer", kind: .group, name: "Outer", x: 0, y: 0, width: 30, height: 30, childIds: ["g-inner"])
            stage.document.nodes = [leaf, gInner, gOuter]
            stage.selectedNodeIds = ["g-outer"]

            // First ungroup dissolves outer
            wc.ungroupAction(nil)
            report.check(
                !stage.document.nodes.contains(where: { $0.id == "g-outer" }) &&
                stage.selectedNodeIds == ["g-inner"],
                "Ungroup: Dissolving outer group selects inner group",
                "selected = \(stage.selectedNodeIds)"
            )

            // Second ungroup dissolves inner
            wc.ungroupAction(nil)
            report.check(
                !stage.document.nodes.contains(where: { $0.id == "g-inner" }) &&
                stage.selectedNodeIds == ["leaf"],
                "Ungroup: Dissolving inner group selects leaf node",
                "selected = \(stage.selectedNodeIds)"
            )
        }

        // =====================================================================
        // SECTION 3: Contextual Taskbar Action Executions & Undo/Redo Cycles
        // =====================================================================
        report.section("CHALLENGE 3: Contextual Taskbar & Command Transactions")

        // 3.1 Duplicate single node and single-step undo/redo
        do {
            let (wc, stage) = makeEnvironment()
            let rectNode = VOONode(id: "r-dup", kind: .rect, name: "Rect Dup", x: 50, y: 60, width: 100, height: 80)
            stage.document.nodes = [rectNode]
            stage.selectedNodeIds = ["r-dup"]

            wc.duplicateAction(nil)
            report.check(
                stage.document.nodes.count == 2,
                "Duplicate: Creates duplicate node, increasing document count from 1 to 2",
                "count = \(stage.document.nodes.count)"
            )
            let newId = stage.selectedNodeIds.first ?? ""
            report.check(
                newId != "r-dup" && !newId.isEmpty,
                "Duplicate: Selects the newly duplicated node",
                "newId = \(newId)"
            )

            // Single step Undo
            _ = wc.commandManager.undo(on: &stage.document)
            report.check(
                stage.document.nodes.count == 1 && stage.document.nodes.first?.id == "r-dup",
                "Duplicate: Single-step Undo completely removes duplicated node",
                "nodes count = \(stage.document.nodes.count)"
            )

            // Redo
            _ = wc.commandManager.redo(on: &stage.document)
            report.check(
                stage.document.nodes.count == 2,
                "Duplicate: Redo restores duplicated node cleanly",
                "nodes count = \(stage.document.nodes.count)"
            )
        }

        // 3.2 Flip Horizontal & Flip Vertical involution & undo/redo
        do {
            let (wc, stage) = makeEnvironment()
            let p0 = PenAnchor(x: 10, y: 20, inHandle: nil, outHandle: CGPoint(x: 25, y: 35))
            let p1 = PenAnchor(x: 70, y: 80, inHandle: CGPoint(x: 55, y: 65), outHandle: nil)
            let originalPath = VOONode(id: "path-flip", kind: .path, name: "Flip Path", x: 10, y: 20, width: 60, height: 60, points: [p0, p1])
            stage.document.nodes = [originalPath]
            stage.selectedNodeIds = ["path-flip"]

            // Flip H once
            wc.flipHorizontalAction(nil)
            let flipped1 = stage.document.nodes.first(where: { $0.id == "path-flip" })!
            // x' = 2*10 + 60 - 10 = 70; p1.x' = 2*10 + 60 - 70 = 10
            let p0_flipped_x = flipped1.points![0].x
            let p1_flipped_x = flipped1.points![1].x
            report.check(
                abs(p0_flipped_x - 70.0) < 1e-4 && abs(p1_flipped_x - 10.0) < 1e-4,
                "Flip H: Mirrors anchor X coordinates across center line",
                "p0.x: \(p0_flipped_x), p1.x: \(p1_flipped_x)"
            )

            // Flip H second time (Involution check)
            wc.flipHorizontalAction(nil)
            let flipped2 = stage.document.nodes.first(where: { $0.id == "path-flip" })!
            let p0_orig_x = flipped2.points![0].x
            let p1_orig_x = flipped2.points![1].x
            report.check(
                abs(p0_orig_x - 10.0) < 1e-4 && abs(p1_orig_x - 70.0) < 1e-4,
                "Flip H: Double flip is an involution, restoring exact original X positions",
                "p0.x: \(p0_orig_x), p1.x: \(p1_orig_x)"
            )

            // Undo involution step
            _ = wc.commandManager.undo(on: &stage.document)
            let undoneOnce = stage.document.nodes.first(where: { $0.id == "path-flip" })!
            report.check(
                abs(undoneOnce.points![0].x - 70.0) < 1e-4,
                "Flip H: Undo returns to first flipped state",
                "x = \(undoneOnce.points![0].x)"
            )

            // Undo first flip
            _ = wc.commandManager.undo(on: &stage.document)
            let undoneTwice = stage.document.nodes.first(where: { $0.id == "path-flip" })!
            report.check(
                abs(undoneTwice.points![0].x - 10.0) < 1e-4,
                "Flip H: Second Undo returns to pristine initial state",
                "x = \(undoneTwice.points![0].x)"
            )

            // Flip V test
            wc.flipVerticalAction(nil)
            let flippedV = stage.document.nodes.first(where: { $0.id == "path-flip" })!
            // y' = 2*20 + 60 - 20 = 80; p1.y' = 2*20 + 60 - 80 = 20
            report.check(
                abs(flippedV.points![0].y - 80.0) < 1e-4 && abs(flippedV.points![1].y - 20.0) < 1e-4,
                "Flip V: Mirrors anchor Y coordinates across center line",
                "p0.y: \(flippedV.points![0].y), p1.y: \(flippedV.points![1].y)"
            )
            _ = wc.commandManager.undo(on: &stage.document)
        }

        // 3.3 Boolean operations with complex shapes (Union, Subtract, Intersect, Xor, Divide)
        do {
            let (wc, stage) = makeEnvironment()

            // Create Star and Polygon nodes
            let starPoints = M1_ShapeGenerators.starPoints(in: CGRect(x: 50, y: 50, width: 100, height: 100), spikes: 5)
            let starAnchors = starPoints.enumerated().map { (i, pt) in
                PenAnchor(x: pt.x, y: pt.y, isClosed: i == starPoints.count - 1)
            }
            let starNode = VOONode(id: "star-1", kind: .path, name: "Star", x: 50, y: 50, width: 100, height: 100, points: starAnchors)

            let polyPoints = M1_ShapeGenerators.regularPolygonPoints(in: CGRect(x: 100, y: 50, width: 100, height: 100), sides: 6)
            let polyAnchors = polyPoints.enumerated().map { (i, pt) in
                PenAnchor(x: pt.x, y: pt.y, isClosed: i == polyPoints.count - 1)
            }
            let polyNode = VOONode(id: "poly-1", kind: .path, name: "Hexagon", x: 100, y: 50, width: 100, height: 100, points: polyAnchors)

            let booleanOps: [(BooleanOperationType, String, () -> Void)] = [
                (.union, "Union", { wc.booleanUnionAction(nil) }),
                (.subtract, "Subtract", { wc.booleanSubtractAction(nil) }),
                (.intersect, "Intersect", { wc.booleanIntersectAction(nil) }),
                (.xor, "Xor", { wc.booleanXorAction(nil) }),
                (.divide, "Divide", { wc.booleanDivideAction(nil) })
            ]

            for (op, opName, action) in booleanOps {
                stage.document.nodes = [starNode, polyNode]
                stage.selectedNodeIds = ["star-1", "poly-1"]

                action()

                report.check(
                    !stage.document.nodes.contains(where: { $0.id == "star-1" }) &&
                    !stage.document.nodes.contains(where: { $0.id == "poly-1" }),
                    "Boolean \(opName): Original operands replaced in document",
                    "remaining nodes = \(stage.document.nodes.count)"
                )
                report.check(
                    !stage.document.nodes.isEmpty,
                    "Boolean \(opName): Generates valid non-empty result nodes",
                    "result count = \(stage.document.nodes.count)"
                )

                // Single step Undo
                _ = wc.commandManager.undo(on: &stage.document)
                let restoredIds = Set(stage.document.nodes.map { $0.id })
                report.check(
                    restoredIds.contains("star-1") && restoredIds.contains("poly-1") && stage.document.nodes.count == 2,
                    "Boolean \(opName): Single-step Undo restores BOTH original operands at original positions",
                    "restored count = \(stage.document.nodes.count)"
                )

                // Single step Redo
                _ = wc.commandManager.redo(on: &stage.document)
                let redoneIds = Set(stage.document.nodes.map { $0.id })
                report.check(
                    !redoneIds.contains("star-1") && !redoneIds.contains("poly-1"),
                    "Boolean \(opName): Redo cleanly re-applies boolean result",
                    "redone count = \(stage.document.nodes.count)"
                )
            }
        }

        // 3.4 Boolean on Disjoint (non-intersecting) shapes
        do {
            let (wc, stage) = makeEnvironment()
            let r1 = VOONode(id: "r-disjoint-1", kind: .rect, name: "Disjoint 1", x: 0, y: 0, width: 50, height: 50)
            let r2 = VOONode(id: "r-disjoint-2", kind: .rect, name: "Disjoint 2", x: 200, y: 200, width: 50, height: 50)
            stage.document.nodes = [r1, r2]
            stage.selectedNodeIds = ["r-disjoint-1", "r-disjoint-2"]

            wc.booleanSubtractAction(nil)
            report.check(
                !stage.document.nodes.isEmpty,
                "Boolean Subtract: Disjoint shapes execute without crash",
                "nodes count = \(stage.document.nodes.count)"
            )
            _ = wc.commandManager.undo(on: &stage.document)
            report.check(
                stage.document.nodes.count == 2,
                "Boolean Subtract Disjoint: Undo restores both disjoint shapes",
                "count = \(stage.document.nodes.count)"
            )
        }

        // 3.5 ContextualTaskbar Geometry adaptive boundary clamping
        do {
            let viewBounds = CGRect(x: 0, y: 0, width: 800, height: 600)
            let taskbarSize = CGSize(width: 280, height: 38)

            // Selection near bottom: should flip to 10pt ABOVE
            let selNearBottom = CGRect(x: 300, y: 15, width: 100, height: 50)
            let resultBottom = ContextualTaskbarGeometry.calculateTaskbarFrame(
                selectionViewRect: selNearBottom,
                taskbarSize: taskbarSize,
                stageBounds: viewBounds,
                bottomLimit: 36.0,
                margin: 10.0
            )
            report.check(
                resultBottom.isFlippedTop && resultBottom.frame.minY >= selNearBottom.maxY + 8.0,
                "ContextualTaskbar: Automatically flips above selection when too close to bottom",
                "taskbar.minY = \(resultBottom.frame.minY), sel.maxY = \(selNearBottom.maxY)"
            )

            // Selection near right edge: should clamp inside viewport with 8pt margin
            let selNearRight = CGRect(x: 750, y: 300, width: 40, height: 40)
            let resultRight = ContextualTaskbarGeometry.calculateTaskbarFrame(
                selectionViewRect: selNearRight,
                taskbarSize: taskbarSize,
                stageBounds: viewBounds,
                bottomLimit: 36.0,
                margin: 10.0
            )
            report.check(
                resultRight.frame.maxX <= viewBounds.maxX - 8.0,
                "ContextualTaskbar: Clamps within right edge with >= 8pt margin",
                "frameRight.maxX = \(resultRight.frame.maxX), view.maxX = \(viewBounds.maxX)"
            )
        }

        let allPassed = report.summary()
        if !allPassed {
            exit(1)
        }
    }
}
