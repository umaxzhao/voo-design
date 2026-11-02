//
//  M6_UnitTests.swift
//  native_studio
//
//  Unit Test Suite for Milestone M6: Native MenuBar, Shortcuts, Clipboard & Document File I/O.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Assertion Helper

private var totalAsserts = 0
private var passedAsserts = 0

private func assert(_ condition: Bool, _ description: String) {
    totalAsserts += 1
    if condition {
        passedAsserts += 1
        print("  ✓ [PASS] \(description)")
    } else {
        print("  ✗ [FAIL] \(description)")
    }
}

private func assertEqual<T: Equatable>(_ a: T, _ b: T, _ description: String) {
    totalAsserts += 1
    if a == b {
        passedAsserts += 1
        print("  ✓ [PASS] \(description)")
    } else {
        print("  ✗ [FAIL] \(description) (expected: \(b), got: \(a))")
    }
}

private func assertClose(_ a: CGFloat, _ b: CGFloat, tolerance: CGFloat = 0.001, _ description: String) {
    totalAsserts += 1
    if abs(a - b) <= tolerance {
        passedAsserts += 1
        print("  ✓ [PASS] \(description)")
    } else {
        print("  ✗ [FAIL] \(description) (expected: \(b), got: \(a), diff: \(abs(a - b)))")
    }
}

// MARK: - Main Test Entrypoint

@main
struct M6UnitTests {
    static func main() {
        print("============================================================")
        print("  VOO DESIGN NATIVE STUDIO — MILESTONE M6 UNIT TESTS")
        print("  Module: Native MenuBar, Shortcuts, Clipboard & File I/O")
        print("============================================================\n")

        testClipboardManager()
        testDocumentIOAndRecentFiles()
        testSVGExportPipeline()
        testMenuControllerStructure()
        testMenuItemValidationStateMachine()
        testWindowControllerMenuActions()

        print("\n============================================================")
        print("  M6 TEST SUMMARY: \(passedAsserts)/\(totalAsserts) passed (\(String(format: "%.1f", Double(passedAsserts) / Double(max(1, totalAsserts)) * 100))%)")
        print("============================================================\n")

        if passedAsserts != totalAsserts {
            exit(1)
        }
    }

    // ============================================================
    // Section 1: Clipboard Manager & Pasteboard Serialization
    // ============================================================
    static func testClipboardManager() {
        print("--- Section 1: Clipboard Manager & Pasteboard ---")

        let clip = ClipboardManager.shared
        clip.resetPasteCount()

        // 1.1 Copy Nodes
        let node1 = VOONode(id: "orig_1", kind: .rect, name: "Card", x: 100, y: 100, width: 200, height: 150)
        let node2 = VOONode(id: "orig_2", kind: .ellipse, name: "Avatar", x: 120, y: 120, width: 60, height: 60)
        let copySuccess = clip.copyNodes([node1, node2])
        assertEqual(copySuccess, true, "1.1 copyNodes returns true for non-empty node array")
        assertEqual(clip.canPaste, true, "1.2 canPaste returns true after successful copy")

        // 1.3 Paste Nodes Generates New Distinct IDs
        guard let pasted = clip.pasteNodes() else {
            assert(false, "1.3 pasteNodes returned non-nil")
            return
        }
        assertEqual(pasted.count, 2, "1.3 pasteNodes returns exactly 2 nodes")
        assert(pasted[0].id != node1.id, "1.4 Pasted node 1 receives a new unique UUID")
        assert(pasted[1].id != node2.id, "1.5 Pasted node 2 receives a new unique UUID")
        assertEqual(pasted[0].name, "Card", "1.6 Pasted node 1 name preserved")
        assertEqual(pasted[1].name, "Avatar", "1.7 Pasted node 2 name preserved")

        // 1.8 Cascading Positional Offset (+20px on first paste)
        assertClose(pasted[0].x, 120.0, "1.8 Pasted node 1 X offset by +20px (100 -> 120)")
        assertClose(pasted[0].y, 120.0, "1.9 Pasted node 1 Y offset by +20px (100 -> 120)")

        // 1.10 Consecutive Paste Applies Compounding Offset (+40px on second paste)
        guard let secondPaste = clip.pasteNodes() else {
            assert(false, "1.10 Second paste returned non-nil")
            return
        }
        assertClose(secondPaste[0].x, 140.0, "1.10 Second paste X offset by +40px (100 -> 140)")
        assertClose(secondPaste[0].y, 140.0, "1.11 Second paste Y offset by +40px (100 -> 140)")

        // 1.12 Reset Paste Count Restores Delta
        clip.resetPasteCount()
        guard let resetPaste = clip.pasteNodes() else {
            assert(false, "1.12 Reset paste returned non-nil")
            return
        }
        assertClose(resetPaste[0].x, 120.0, "1.12 resetPasteCount restores first-level +20px offset")
    }

    // ============================================================
    // Section 2: Document I/O & Recent Files Manager
    // ============================================================
    static func testDocumentIOAndRecentFiles() {
        print("\n--- Section 2: Document I/O & Recent Files ---")

        let io = DocumentIO.shared
        let recents = RecentFilesManager.shared
        recents.clearRecentFiles()
        assertEqual(recents.recentFilePaths.isEmpty, true, "2.1 Recent files list is empty after clear")

        // 2.2 Save and Load JSON Document Round-Trip
        let tempDir = FileManager.default.temporaryDirectory
        let jsonURL = tempDir.appendingPathComponent("test_doc_\(UUID().uuidString).voo")

        var doc = VOODocument(title: "Project Alpha")
        doc.nodes = [
            VOONode(id: "n_rect", kind: .rect, name: "Background", x: 0, y: 0, width: 1920, height: 1080),
            VOONode(id: "n_btn", kind: .rect, name: "CTA Button", x: 200, y: 300, width: 160, height: 48)
        ]

        do {
            try io.saveDocument(doc, to: jsonURL)
            assert(FileManager.default.fileExists(atPath: jsonURL.path), "2.2 saveDocument writes file to disk")

            let loadedDoc = try io.loadDocument(from: jsonURL)
            assertEqual(loadedDoc.title, "Project Alpha", "2.3 Loaded document title matches")
            assertEqual(loadedDoc.nodes.count, 2, "2.4 Loaded document nodes count matches")
            assertEqual(loadedDoc.nodes[1].name, "CTA Button", "2.5 Loaded document node name matches")
        } catch {
            assert(false, "2.2-2.5 JSON save/load failed: \(error.localizedDescription)")
        }

        // 2.6 Binary VOOBIN01 Format Round-Trip
        let binURL = tempDir.appendingPathComponent("test_bin_\(UUID().uuidString).voo")
        do {
            try io.saveBinaryDocument(doc, to: binURL)
            assert(FileManager.default.fileExists(atPath: binURL.path), "2.6 saveBinaryDocument writes binary file")

            let loadedBin = try io.loadDocument(from: binURL)
            assertEqual(loadedBin.title, "Project Alpha", "2.7 Binary loaded document title matches")
            assertEqual(loadedBin.nodes.count, 2, "2.8 Binary loaded document nodes count matches")
        } catch {
            assert(false, "2.6-2.8 Binary save/load failed: \(error.localizedDescription)")
        }

        // 2.9 Recent Files Tracking
        assert(recents.recentFilePaths.contains(jsonURL.path), "2.9 Recent files includes saved JSON document path")
        assert(recents.recentFilePaths.contains(binURL.path), "2.10 Recent files includes saved Binary document path")

        // 2.11 Deduplication & Capping at 10 items
        for i in 1...15 {
            let fakeURL = tempDir.appendingPathComponent("fake_\(i).voo")
            recents.addRecentFile(at: fakeURL)
        }
        assertEqual(recents.recentFilePaths.count, 10, "2.11 Recent files strictly capped at 10 items")

        // Clean up
        try? FileManager.default.removeItem(at: jsonURL)
        try? FileManager.default.removeItem(at: binURL)
        recents.clearRecentFiles()
    }

    // ============================================================
    // Section 3: Vector SVG Export Pipeline
    // ============================================================
    static func testSVGExportPipeline() {
        print("\n--- Section 3: Vector SVG Export Pipeline ---")

        let io = DocumentIO.shared
        var doc = VOODocument(title: "SVG Export Demo")
        doc.canvas = CanvasFrame(x: 0, y: 0, width: 800, height: 600, backgroundColor: "#1e1e1e")

        let rectNode = VOONode(
            id: "rect_1",
            kind: .rect,
            name: "Card",
            x: 50,
            y: 50,
            width: 300,
            height: 200,
            style: LayerStyle(fill: "#ffffff", stroke: "#00c8ff", strokeWidth: 2.0, opacity: 0.95),
            cornerRadii: CornerRadii(uniform: 12.0)
        )

        let ellipseNode = VOONode(
            id: "circle_1",
            kind: .ellipse,
            name: "Badge",
            x: 400,
            y: 100,
            width: 80,
            height: 80,
            style: LayerStyle(fill: "#b2ffd6")
        )

        let textNode = VOONode(
            id: "text_1",
            kind: .text,
            name: "Heading",
            x: 50,
            y: 300,
            width: 200,
            height: 30,
            text: "Hello VOO Native"
        )

        doc.nodes = [rectNode, ellipseNode, textNode]

        let svg = io.exportToSVG(document: doc)
        assert(svg.contains("<svg"), "3.1 SVG output contains root <svg> tag")
        assert(svg.contains("viewBox=\"0 0 800.0 600.0\""), "3.2 SVG viewBox matches canvas frame dimensions")
        assert(svg.contains("fill=\"#1e1e1e\""), "3.3 SVG includes canvas background color rect")
        assert(svg.contains("<rect x=\"50.0\" y=\"50.0\" width=\"300.0\" height=\"200.0\" rx=\"12.0\""), "3.4 SVG renders rect with correct dimensions and corner radius")
        assert(svg.contains("<ellipse cx=\"440.0\" cy=\"140.0\" rx=\"40.0\" ry=\"40.0\""), "3.5 SVG renders ellipse with correct center and radii")
        assert(svg.contains("<text x=\"50.0\""), "3.6 SVG renders text element with coordinates")
        assert(svg.contains("Hello VOO Native</text>"), "3.7 SVG renders text string content")
        assert(svg.contains("</svg>"), "3.8 SVG concludes with closing </svg> tag")
    }

    // ============================================================
    // Section 4: MenuController Structure & Standard Shortcuts
    // ============================================================
    static func testMenuControllerStructure() {
        print("\n--- Section 4: MenuController Structure & Shortcuts ---")

        let menu = MenuController.shared.buildMainMenu()
        assertEqual(menu.items.count, 7, "4.1 MainMenu contains exactly 7 top-level menus")

        let titles = menu.items.compactMap { $0.submenu?.title }
        assert(titles.contains("VOO Design Native"), "4.2 Contains App Menu")
        assert(titles.contains("文件 (File)"), "4.3 Contains File Menu")
        assert(titles.contains("编辑 (Edit)"), "4.4 Contains Edit Menu")
        assert(titles.contains("图层与几何 (Geometry)"), "4.5 Contains Geometry Menu")
        assert(titles.contains("视图 (View)"), "4.6 Contains View Menu")
        assert(titles.contains("窗口 (Window)"), "4.7 Contains Window Menu")
        assert(titles.contains("帮助 (Help)"), "4.8 Contains Help Menu")

        // 4.9 Key Equivalents Verification
        let fileSubmenu = menu.items[1].submenu!
        let newItem = fileSubmenu.items.first(where: { $0.title.contains("New") })
        assertEqual(newItem?.keyEquivalent, "n", "4.9 New document shortcut is ⌘N")

        let openItem = fileSubmenu.items.first(where: { $0.title.contains("Open") })
        assertEqual(openItem?.keyEquivalent, "o", "4.10 Open document shortcut is ⌘O")

        let saveItem = fileSubmenu.items.first(where: { $0.title.contains("Save") && !$0.title.contains("Save As") })
        assertEqual(saveItem?.keyEquivalent, "s", "4.11 Save document shortcut is ⌘S")

        let editSubmenu = menu.items[2].submenu!
        let undoItem = editSubmenu.items.first(where: { $0.title.contains("Undo") })
        assertEqual(undoItem?.keyEquivalent, "z", "4.12 Undo shortcut is ⌘Z")

        let redoItem = editSubmenu.items.first(where: { $0.title.contains("Redo") })
        assertEqual(redoItem?.keyEquivalent, "Z", "4.13 Redo shortcut is ⇧⌘Z")
        assertEqual(redoItem?.keyEquivalentModifierMask, [.command, .shift], "4.14 Redo modifier mask is [.command, .shift]")

        let copyItem = editSubmenu.items.first(where: { $0.title.contains("Copy") })
        assertEqual(copyItem?.keyEquivalent, "c", "4.15 Copy shortcut is ⌘C")

        let pasteItem = editSubmenu.items.first(where: { $0.title.contains("Paste") })
        assertEqual(pasteItem?.keyEquivalent, "v", "4.16 Paste shortcut is ⌘V")

        let dupItem = editSubmenu.items.first(where: { $0.title.contains("Duplicate") })
        assertEqual(dupItem?.keyEquivalent, "d", "4.17 Duplicate shortcut is ⌘D")

        let selectAllItem = editSubmenu.items.first(where: { $0.title.contains("Select All") })
        assertEqual(selectAllItem?.keyEquivalent, "a", "4.18 Select All shortcut is ⌘A")

        let geomSubmenu = menu.items[3].submenu!
        let groupItem = geomSubmenu.items.first(where: { $0.title.contains("Group") && !$0.title.contains("Ungroup") })
        assertEqual(groupItem?.keyEquivalent, "g", "4.19 Group shortcut is ⌘G")

        let ungroupItem = geomSubmenu.items.first(where: { $0.title.contains("Ungroup") })
        assertEqual(ungroupItem?.keyEquivalent, "g", "4.20 Ungroup shortcut is ⇧⌘G")
        assertEqual(ungroupItem?.keyEquivalentModifierMask, [.command, .shift], "4.21 Ungroup modifier mask is [.command, .shift]")
    }

    // ============================================================
    // Section 5: Menu Item Validation State Machine
    // ============================================================
    static func testMenuItemValidationStateMachine() {
        print("\n--- Section 5: Menu Item Validation State Machine ---")

        let wc = WindowController()
        let stage = wc.mainContentView.canvasStageView
        stage.document.nodes = [
            VOONode(id: "n1", kind: .rect, name: "Node 1", x: 0, y: 0, width: 100, height: 100),
            VOONode(id: "n2", kind: .ellipse, name: "Node 2", x: 120, y: 0, width: 100, height: 100)
        ]
        stage.clearSelection()

        // 5.1 Undo/Redo Validation when Stack is Empty
        let undoItem = NSMenuItem(title: "Undo", action: #selector(StudioMenuActions.undoAction(_:)), keyEquivalent: "z")
        let redoItem = NSMenuItem(title: "Redo", action: #selector(StudioMenuActions.redoAction(_:)), keyEquivalent: "Z")
        assertEqual(wc.validateMenuItem(undoItem), false, "5.1 Undo is disabled when undo stack is empty")
        assertEqual(wc.validateMenuItem(redoItem), false, "5.2 Redo is disabled when redo stack is empty")

        // 5.3 Selection-Dependent Actions when Selection is Empty
        let cutItem = NSMenuItem(title: "Cut", action: #selector(StudioMenuActions.cutAction(_:)), keyEquivalent: "x")
        let copyItem = NSMenuItem(title: "Copy", action: #selector(StudioMenuActions.copyAction(_:)), keyEquivalent: "c")
        let deleteItem = NSMenuItem(title: "Delete", action: #selector(StudioMenuActions.deleteAction(_:)), keyEquivalent: "")
        assertEqual(wc.validateMenuItem(cutItem), false, "5.3 Cut disabled when no node is selected")
        assertEqual(wc.validateMenuItem(copyItem), false, "5.4 Copy disabled when no node is selected")
        assertEqual(wc.validateMenuItem(deleteItem), false, "5.5 Delete disabled when no node is selected")

        // 5.6 Selection-Dependent Actions when 1 Node is Selected
        stage.selectNode(id: "n1")
        assertEqual(wc.validateMenuItem(cutItem), true, "5.6 Cut enabled when 1 node is selected")
        assertEqual(wc.validateMenuItem(copyItem), true, "5.7 Copy enabled when 1 node is selected")
        assertEqual(wc.validateMenuItem(deleteItem), true, "5.8 Delete enabled when 1 node is selected")

        // 5.9 Group & Boolean Operations Require >= 2 Nodes
        let groupItem = NSMenuItem(title: "Group", action: #selector(StudioMenuActions.groupAction(_:)), keyEquivalent: "g")
        let unionItem = NSMenuItem(title: "Union", action: #selector(StudioMenuActions.booleanUnionAction(_:)), keyEquivalent: "")
        assertEqual(wc.validateMenuItem(groupItem), false, "5.9 Group disabled when only 1 node is selected")
        assertEqual(wc.validateMenuItem(unionItem), false, "5.10 Boolean Union disabled when only 1 node is selected")

        // 5.11 Group & Boolean Operations Enabled with 2 Selected Nodes
        stage.selectedNodeIds = ["n1", "n2"]
        assertEqual(wc.validateMenuItem(groupItem), true, "5.11 Group enabled when 2 nodes are selected")
        assertEqual(wc.validateMenuItem(unionItem), true, "5.12 Boolean Union enabled when 2 nodes are selected")

        // 5.13 Ungroup only enabled when selected node is a Group
        let ungroupItem = NSMenuItem(title: "Ungroup", action: #selector(StudioMenuActions.ungroupAction(_:)), keyEquivalent: "g")
        assertEqual(wc.validateMenuItem(ungroupItem), false, "5.13 Ungroup disabled when selected nodes are not a group")
    }

    // ============================================================
    // Section 6: WindowController Menu Actions Execution
    // ============================================================
    static func testWindowControllerMenuActions() {
        print("\n--- Section 6: WindowController Menu Actions ---")

        let wc = WindowController()
        let stage = wc.mainContentView.canvasStageView
        stage.document.nodes = [
            VOONode(id: "node_alpha", kind: .rect, name: "Alpha", x: 10, y: 10, width: 100, height: 100),
            VOONode(id: "node_beta", kind: .rect, name: "Beta", x: 50, y: 50, width: 100, height: 100)
        ]
        stage.clearSelection()

        // 6.1 Select All Action
        wc.selectAllAction(nil)
        assertEqual(stage.selectedNodeIds.count, 2, "6.1 selectAllAction selects both nodes")

        // 6.2 Deselect All Action
        wc.deselectAllAction(nil)
        assertEqual(stage.selectedNodeIds.isEmpty, true, "6.2 deselectAllAction empties selection")

        // 6.3 Group Action
        stage.selectedNodeIds = ["node_alpha", "node_beta"]
        wc.groupAction(nil)
        assertEqual(stage.selectedNodeIds.count, 1, "6.3 groupAction creates group node and selects it")
        let groupNode = stage.document.nodes.first(where: { $0.id == stage.selectedNodeIds.first })
        assertEqual(groupNode?.kind, .group, "6.4 Selected node is of kind .group")

        // 6.5 Ungroup Action
        wc.ungroupAction(nil)
        assertEqual(stage.selectedNodeIds.count, 2, "6.5 ungroupAction dissolves group and restores constituent selection")

        // 6.6 Boolean Union Action & Undo
        stage.selectedNodeIds = ["node_alpha", "node_beta"]
        wc.booleanUnionAction(nil)
        assertEqual(wc.commandManager.canUndo, true, "6.6 booleanUnionAction executes via CommandManager (canUndo == true)")
        wc.undoAction(nil)
        assertEqual(stage.document.nodes.count, 2, "6.7 undoAction restores original operand nodes")

        // 6.8 New Document Action
        wc.newDocument(nil)
        assertEqual(stage.document.nodes.isEmpty, true, "6.8 newDocumentAction clears all document nodes")
        assertEqual(stage.selectedNodeIds.isEmpty, true, "6.9 newDocumentAction clears selectedNodeIds")
        assertEqual(wc.commandManager.canUndo, false, "6.10 newDocumentAction resets undo history")
        assertEqual(wc.mainContentView.docTitleLabel.stringValue, "Untitled.voo", "6.11 newDocumentAction resets title to Untitled.voo")
    }
}
