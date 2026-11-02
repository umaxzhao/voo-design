//
//  M1_UnitTests.swift
//  native_studio
//
//  Milestone M1 Comprehensive Unit Tests:
//  - Document AST & SerDe
//  - Normalization Pipeline (Cycles, Crops, Clipping)
//  - VOOBIN01 Binary Container
//  - CommandManager & Undo/Redo Engine
//  - 1,000-Step Stack & Batch Rollback
//

import AppKit
import CoreGraphics
import Foundation

func runM1Tests() {
    print("============================================================")
    print(" Running Milestone M1 Comprehensive Verification Suite")
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

    // 1. VOODocument Default Initialization
    let defaultDoc = VOODocument(title: "Default Canvas")
    assert(defaultDoc.title == "Default Canvas", "VOODocument default title")
    assert(defaultDoc.version == 2, "VOODocument default version == 2")
    assert(defaultDoc.canvas.width == 1920, "CanvasFrame width == 1920")
    assert(defaultDoc.canvas.height == 1080, "CanvasFrame height == 1080")
    assert(defaultDoc.nodes.isEmpty, "Initial nodes list is empty")

    // 2. Node Kinds & Categories
    let allKinds = NodeKind.allCases
    assert(allKinds.count >= 8, "All required node kinds supported")
    assert(NodeKind.rect.isShape, "Rect is shape")
    assert(NodeKind.group.isContainer, "Group is container")

    // 3. Document JSON Serialization Round-Trip
    var doc1 = VOODocument(title: "SerDe Test")
    let rectNode = VOONode(kind: .rect, name: "CardRect", x: 50, y: 80, width: 200, height: 150)
    let ellipseNode = VOONode(kind: .ellipse, name: "Badge", x: 100, y: 120, width: 40, height: 40)
    doc1.nodes = [rectNode, ellipseNode]

    do {
        let json = try doc1.serializeToJSON()
        assert(json.count > 50, "JSON payload generated (>50 bytes)")
        let decoded = try VOODocument.deserialize(from: json)
        assert(decoded.title == "SerDe Test", "Deserialized document title matches")
        assert(decoded.nodes.count == 2, "Deserialized nodes count == 2")
        assert(decoded.nodes[0].name == "CardRect", "Node 0 name restored")
        assert(decoded.nodes[0].x == 50, "Node 0 x restored")
        assert(decoded.nodes[1].name == "Badge", "Node 1 name restored")
    } catch {
        assert(false, "JSON round-trip error: \(error)")
    }

    // 4. PenAnchor Cubic Bezier Round-Trip
    let p1 = PenAnchor(x: 10, y: 20, inHandle: CGPoint(x: 5, y: 15), outHandle: CGPoint(x: 15, y: 25), isClosed: false, type: .smooth)
    let p2 = PenAnchor(x: 100, y: 200, inHandle: nil, outHandle: nil, isClosed: true, type: .sharp)
    assert(p1.inLength > 0, "PenAnchor inLength calculated")
    assert(p1.outLength > 0, "PenAnchor outLength calculated")

    var pathDoc = VOODocument(title: "Path Document")
    pathDoc.nodes = [VOONode(kind: .path, name: "WavePath", points: [p1, p2])]
    do {
        let pathJson = try pathDoc.serializeToJSON()
        let decodedPath = try VOODocument.deserialize(from: pathJson)
        assert(decodedPath.nodes[0].points?.count == 2, "PenAnchors restored")
        assert(decodedPath.nodes[0].points?[0].type == .smooth, "Anchor 0 smooth type restored")
        assert(decodedPath.nodes[0].points?[1].isClosed == true, "Anchor 1 closed flag restored")
    } catch {
        assert(false, "PenAnchor round-trip error: \(error)")
    }

    // 5. CornerRadii Clamping
    let uniformRadii = CornerRadii(uniform: 16.0)
    assert(uniformRadii.tl == 16.0 && uniformRadii.br == 16.0, "Uniform CornerRadii")
    let r4 = CornerRadii(tl: 20, tr: 20, br: 30, bl: 30)
    let clamped = r4.clamped(forWidth: 30, height: 30)
    assert(clamped.tl + clamped.tr <= 30.0, "Corner radii clamping avoids overlap")

    // 6. Normalization: Acyclic ParentId Validation
    var cyclicDoc = VOODocument(title: "Cycle Doc")
    var nodeA = VOONode(kind: .group, name: "NodeA")
    var nodeB = VOONode(kind: .group, name: "NodeB")
    nodeA.parentId = nodeB.id
    nodeB.parentId = nodeA.id // Circular reference A -> B -> A
    cyclicDoc.nodes = [nodeA, nodeB]
    let normalizedCyclic = VOOSerializer.shared.normalizeOnImport(cyclicDoc)
    assert(normalizedCyclic.nodes[0].parentId == nil || normalizedCyclic.nodes[1].parentId == nil, "Cyclic parentId chain broken successfully")

    // 7. Normalization: Clipping Mask Validation
    var clipDoc = VOODocument(title: "Clip Doc")
    let maskTarget = VOONode(kind: .rect, name: "MaskShape")
    let clippedNode = VOONode(kind: .rect, name: "Content", clipTo: maskTarget.id)
    // Put clippedNode BEFORE maskTarget in array (invalid paint order)
    clipDoc.nodes = [clippedNode, maskTarget]
    let normalizedClip = VOOSerializer.shared.normalizeOnImport(clipDoc)
    assert(normalizedClip.nodes[0].clipTo == nil, "Invalid paint-order clipTo invalidated")

    // 8. Normalization: Default Adjustments Pruning
    var adjDoc = VOODocument(title: "Adjustments Doc")
    var styledNode = VOONode(kind: .image, name: "Photo")
    styledNode.adjustments = LayerAdjustments() // All 0 neutral defaults
    adjDoc.nodes = [styledNode]
    let exported = VOOSerializer.shared.normalizeForExport(adjDoc)
    assert(exported.nodes[0].adjustments == nil, "Default neutral adjustments pruned from export")

    // 9. VOOBIN01 Binary Container Round-Trip
    var binDoc = VOODocument(title: "Binary Package")
    binDoc.nodes = [VOONode(kind: .rect, name: "Layer1")]
    let mockAssetData = "PNG_MOCK_IMAGE_DATA_0123456789".data(using: .utf8)!
    let mockPreviewData = "PREVIEW_THUMBNAIL_BYTES".data(using: .utf8)!
    do {
        let binData = try VOOBinaryContainer.encode(
            document: binDoc,
            assets: ["asset_1": (data: mockAssetData, mime: "image/png")],
            preview: mockPreviewData
        )
        assert(VOOBinaryContainer.isVooBinary(data: binData), "VOOBIN01 magic header verified")

        let decodedBin = try VOOBinaryContainer.decode(data: binData)
        assert(decodedBin.document.title == "Binary Package", "VOOBIN01 document title restored")
        assert(decodedBin.assets["asset_1"]?.data == mockAssetData, "VOOBIN01 asset data byte-exact")
        assert(decodedBin.preview == mockPreviewData, "VOOBIN01 preview thumbnail restored")
    } catch {
        assert(false, "VOOBIN01 error: \(error)")
    }

    // 10. CommandManager Execute & Undo
    var cmdDoc = VOODocument(title: "Cmd Doc")
    let mgr = CommandManager(maxStackDepth: 1000)
    let btnNode = VOONode(name: "ButtonLayer")
    let insertCmd = InsertNodeCommand(node: btnNode)

    assert(!mgr.canUndo, "Initial canUndo == false")
    assert(!mgr.canRedo, "Initial canRedo == false")

    let execResult = mgr.execute(insertCmd, on: &cmdDoc)
    assert(execResult, "InsertNodeCommand executed")
    assert(cmdDoc.nodes.count == 1, "Document has 1 node after execute")
    assert(mgr.canUndo, "canUndo == true after execute")

    let undoResult = mgr.undo(on: &cmdDoc)
    assert(undoResult, "Undo executed successfully")
    assert(cmdDoc.nodes.isEmpty, "Document has 0 nodes after undo")
    assert(!mgr.canUndo, "canUndo == false after full undo")
    assert(mgr.canRedo, "canRedo == true after undo")

    let redoResult = mgr.redo(on: &cmdDoc)
    assert(redoResult, "Redo executed successfully")
    assert(cmdDoc.nodes.count == 1, "Document restored node after redo")
    assert(cmdDoc.nodes[0].name == "ButtonLayer", "Restored node name matches")

    // 11. Branch Invalidation on New Action
    _ = mgr.undo(on: &cmdDoc)
    assert(mgr.canRedo, "canRedo == true before new branch")
    _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "BranchLayer")), on: &cmdDoc)
    assert(!mgr.canRedo, "Redo stack purged on new branch action")
    assert(cmdDoc.nodes.count == 1 && cmdDoc.nodes[0].name == "BranchLayer", "New branch node established")

    // 12. 1,000-Step Stack Depth & FIFO Pruning
    var stackDoc = VOODocument(title: "Stress Doc")
    let stressMgr = CommandManager(maxStackDepth: 1000)
    for i in 1...1005 {
        _ = stressMgr.execute(InsertNodeCommand(node: VOONode(name: "Item_\(i)")), on: &stackDoc)
    }
    assert(stressMgr.undoStack.count == 1000, "1,000 step stack ceiling strictly enforced (count == 1000)")
    assert(stackDoc.nodes.count == 1005, "All 1005 nodes exist in document")

    // 13. Batch Rollback
    var rollbackDoc = VOODocument(title: "Rollback Doc")
    let rbMgr = CommandManager(maxStackDepth: 100)
    for i in 1...10 {
        _ = rbMgr.execute(InsertNodeCommand(node: VOONode(name: "R_\(i)")), on: &rollbackDoc)
    }
    assert(rollbackDoc.nodes.count == 10, "10 items inserted")
    _ = rbMgr.rollback(toIndex: 3, on: &rollbackDoc)
    assert(rollbackDoc.nodes.count == 3, "Rollback to index 3 reduced count to 3")
    assert(rbMgr.undoStack.count == 3, "Undo stack count is 3")
    assert(rbMgr.redoStack.count == 7, "Redo stack count is 7")

    // Rollback forward
    _ = rbMgr.rollback(toIndex: 8, on: &rollbackDoc)
    assert(rollbackDoc.nodes.count == 8, "Rollback forward to index 8 increased count to 8")

    // 14. Concrete Transactions (Transform, Style, Move, Boolean)
    var transDoc = VOODocument(title: "Trans Doc")
    let tNode = VOONode(name: "TransTarget", x: 10, y: 20, width: 100, height: 100)
    transDoc.nodes = [tNode]

    let moveCmd = MoveLayerCommand(nodeId: tNode.id, oldPosition: CGPoint(x: 10, y: 20), newPosition: CGPoint(x: 50, y: 70))
    _ = rbMgr.execute(moveCmd, on: &transDoc)
    assert(transDoc.nodes[0].x == 50 && transDoc.nodes[0].y == 70, "MoveLayerCommand forward position")
    _ = rbMgr.undo(on: &transDoc)
    assert(transDoc.nodes[0].x == 10 && transDoc.nodes[0].y == 20, "MoveLayerCommand undo position")

    let transCmd = TransformLayerCommand(
        nodeId: tNode.id,
        oldFrame: CGRect(x: 10, y: 20, width: 100, height: 100),
        newFrame: CGRect(x: 15, y: 25, width: 250, height: 180),
        oldRotation: 0,
        newRotation: 45,
        oldShear: 0,
        newShear: 15
    )
    _ = rbMgr.execute(transCmd, on: &transDoc)
    assert(transDoc.nodes[0].width == 250 && transDoc.nodes[0].rotation == 45, "TransformLayerCommand forward")
    _ = rbMgr.undo(on: &transDoc)
    assert(transDoc.nodes[0].width == 100 && transDoc.nodes[0].rotation == 0, "TransformLayerCommand undo")

    // 15. History Timeline Model
    let history = rbMgr.getHistoryItems()
    assert(!history.isEmpty, "getHistoryItems() returns timeline items")
    let richTimeline = rbMgr.getHistoryTimeline()
    assert(richTimeline.first?.name == "创建文档", "History timeline has baseline '创建文档'")

    // =========================================================================
    // 16. Window Controller Hierarchy & Anti-Facade Attachment
    // =========================================================================
    print("\n--- [Area 16: Window Controller Hierarchy & View Attachment] ---")
    let wcDefault = WindowController()
    assert(wcDefault.studioWindow.contentView === wcDefault.mainContentView, "WindowController().studioWindow.contentView === mainContentView")
    assert(wcDefault.window?.contentView === wcDefault.mainContentView, "WindowController().window?.contentView === mainContentView")

    let wcNil = WindowController(window: nil)
    assert(wcNil.studioWindow.contentView === wcNil.mainContentView, "WindowController(window: nil) attaches mainContentView")

    let customView = MainContentView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
    let wcCustom = WindowController(contentView: customView)
    assert(wcCustom.studioWindow.contentView === customView, "WindowController(contentView:) attaches injected view")
    assert(wcCustom.mainContentView === customView, "WindowController.mainContentView references injected view")

    // =========================================================================
    // 17. Window Accessibility Hierarchy & Identifier Verification
    // =========================================================================
    print("\n--- [Area 17: Window Accessibility Root & Role Verification] ---")
    assert(wcDefault.studioWindow.accessibilityIdentifier() == "main_window", "studioWindow.accessibilityIdentifier == 'main_window'")
    assert(wcDefault.studioWindow.accessibilityRole() == .window, "studioWindow.accessibilityRole == .window")
    assert(wcDefault.studioWindow.accessibilityLabel() == "VOO Design Native Main Window", "studioWindow.accessibilityLabel set")
    assert(wcDefault.mainContentView.accessibilityIdentifier() == "main_content_view", "mainContentView.accessibilityIdentifier == 'main_content_view'")
    assert(wcDefault.mainContentView.accessibilityRole() == .group, "mainContentView.accessibilityRole == .group")

    // =========================================================================
    // 18. Full AccessibilityCatalog Subview Tree Reachability
    // =========================================================================
    print("\n--- [Area 18: AccessibilityCatalog Subview Tree Reachability] ---")
    func collectAccessibilityTree(from root: NSView) -> Set<String> {
        var idents = Set<String>()
        func walk(_ v: NSView) {
            let ident = v.accessibilityIdentifier()
            if !ident.isEmpty {
                idents.insert(ident)
            }
            for sub in v.subviews {
                walk(sub)
            }
        }
        walk(root)
        return idents
    }

    let rootContentView = wcDefault.studioWindow.contentView!
    let treeIdentifiers = collectAccessibilityTree(from: rootContentView)

    let expectedCatalogIds: [String] = [
        AccessibilityCatalog.titleBar,
        AccessibilityCatalog.docTitle,
        AccessibilityCatalog.zoomIndicator,
        AccessibilityCatalog.undoButton,
        AccessibilityCatalog.redoButton,
        AccessibilityCatalog.toolRail,
        AccessibilityCatalog.toolMove,
        AccessibilityCatalog.toolPen,
        AccessibilityCatalog.toolBrush,
        AccessibilityCatalog.inspectorStudio,
        AccessibilityCatalog.layersTree,
        AccessibilityCatalog.transformPanel,
        AccessibilityCatalog.canvasViewport,
        AccessibilityCatalog.rulerHorizontal,
        AccessibilityCatalog.rulerVertical
    ]

    var allCatalogItemsPresent = true
    for catalogId in expectedCatalogIds {
        let isPresent = treeIdentifiers.contains(catalogId)
        if !isPresent {
            allCatalogItemsPresent = false
            print("     Missing Accessibility ID: \(catalogId)")
        }
    }
    assert(allCatalogItemsPresent, "All 15 AccessibilityCatalog subviews are attached and reachable in view tree")

    // Verify view hierarchy containment
    assert(wcDefault.mainContentView.docTitleLabel.isDescendant(of: rootContentView), "docTitleLabel is descendant of contentView")
    assert(wcDefault.mainContentView.moveToolButton.isDescendant(of: rootContentView), "moveToolButton is descendant of contentView")
    assert(wcDefault.mainContentView.layersTreeView.isDescendant(of: rootContentView), "layersTreeView is descendant of contentView")
    assert(wcDefault.mainContentView.canvasViewportView.isDescendant(of: rootContentView), "canvasViewportView is descendant of contentView")

    // =========================================================================
    // 19. Headless Window Snapshot Pixel Integrity & Dark Chrome (#171717)
    // =========================================================================
    print("\n--- [Area 19: Headless Window Snapshot Pixel Integrity] ---")
    let snapshotWindow = NSWindow(
        contentRect: NSRect(x: 100, y: 100, width: 960, height: 600),
        styleMask: [.titled, .closable, .miniaturizable, .resizable],
        backing: .buffered,
        defer: false
    )
    let snapContentView = MainContentView(frame: NSRect(x: 0, y: 0, width: 960, height: 600))
    snapshotWindow.contentView = snapContentView
    snapshotWindow.layoutIfNeeded()
    snapContentView.layoutSubtreeIfNeeded()

    let snapBounds = snapContentView.bounds
    guard let snapRep = snapContentView.bitmapImageRepForCachingDisplay(in: snapBounds) else {
        assert(false, "bitmapImageRepForCachingDisplay failed")
        return
    }
    snapContentView.cacheDisplay(in: snapBounds, to: snapRep)

    guard let snapImage = snapRep.cgImage else {
        assert(false, "Failed to obtain CGImage from snapshot rep")
        return
    }

    let snapWidth = snapImage.width
    let snapHeight = snapImage.height
    let totalPixelCount = snapWidth * snapHeight
    var rawPixelData = [UInt8](repeating: 0, count: totalPixelCount * 4)

    let snapContext = CGContext(
        data: &rawPixelData,
        width: snapWidth,
        height: snapHeight,
        bitsPerComponent: 8,
        bytesPerRow: snapWidth * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )

    if let ctx = snapContext {
        ctx.draw(snapImage, in: CGRect(x: 0, y: 0, width: snapWidth, height: snapHeight))

        var darkChromePixels = 0
        var transparentPixels = 0
        var stageBackgroundPixels = 0

        for i in 0..<totalPixelCount {
            let offset = i * 4
            let r = rawPixelData[offset]
            let g = rawPixelData[offset + 1]
            let b = rawPixelData[offset + 2]
            let a = rawPixelData[offset + 3]

            if a == 0 {
                transparentPixels += 1
            } else if a == 255 {
                // #171717 dark chrome: R=23, G=23, B=23 (tolerance 21...25)
                if r >= 21 && r <= 25 && g >= 21 && g <= 25 && b >= 21 && b <= 25 {
                    darkChromePixels += 1
                }
                // Stage canvas #0f0f0f: R=15, G=15, B=15 (tolerance 13...17)
                if r >= 13 && r <= 17 && g >= 13 && g <= 17 && b >= 13 && b <= 17 {
                    stageBackgroundPixels += 1
                }
            }
        }

        assert(transparentPixels == 0, "Snapshot contains 0% transparent blank pixels (transparent count: \(transparentPixels))")
        assert(darkChromePixels >= 100_000, "Snapshot contains non-zero genuine #171717 dark chrome pixels (found \(darkChromePixels)/\(totalPixelCount) pixels, \(String(format: "%.1f", Double(darkChromePixels)/Double(totalPixelCount)*100))%)")
        assert(stageBackgroundPixels > 0, "Snapshot contains stage canvas background pixels (found \(stageBackgroundPixels) pixels)")
    } else {
        assert(false, "Failed to create CGContext for pixel inspection")
    }

    // =========================================================================
    // 20. Malformed JSON Duplicate IDs & Crash Safety (SIGTRAP Immunity)
    // =========================================================================
    print("\n--- [Area 20: Malformed JSON Duplicate IDs & Crash Safety] ---")

    // 20.1 Duplicate Node IDs in JSON
    let dupNodesJson = """
    {
      "id": "dup_nodes_doc",
      "title": "Dup Nodes Doc",
      "version": 2,
      "canvasType": "design",
      "canvas": { "x": 0, "y": 0, "width": 1920, "height": 1080, "backgroundColor": "#000000", "guides": [], "colorVariables": [] },
      "nodes": [
        { "id": "collision_node", "kind": "rect", "name": "Box1", "x": 0, "y": 0, "width": 100, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } },
        { "id": "collision_node", "kind": "ellipse", "name": "Box2", "x": 10, "y": 10, "width": 100, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } },
        { "id": "collision_node", "kind": "text", "name": "Text3", "x": 20, "y": 20, "width": 100, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } }
      ],
      "selectedNodeIds": []
    }
    """.data(using: .utf8)!

    do {
        let docDup = try VOODocument.deserialize(from: dupNodesJson)
        assert(docDup.nodes.count == 3, "Duplicate node IDs parsed and handled without SIGTRAP crash")
    } catch {
        assert(false, "Duplicate node IDs threw unexpected error: \(error)")
    }

    // 20.2 Duplicate Color Variable IDs in JSON
    let dupColorsJson = """
    {
      "id": "dup_colors_doc",
      "title": "Dup Colors Doc",
      "version": 2,
      "canvasType": "design",
      "canvas": {
        "x": 0, "y": 0, "width": 1920, "height": 1080,
        "backgroundColor": "#000000",
        "guides": [],
        "colorVariables": [
          { "id": "var_dup", "name": "Primary", "value": "#ffffff" },
          { "id": "var_dup", "name": "Secondary", "value": "#000000" }
        ]
      },
      "nodes": [
        { "id": "n1", "kind": "rect", "name": "Rect1", "x": 0, "y": 0, "width": 100, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#262626", "stroke": "#b2ffd6", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }, "fillVariableId": "var_dup" }
      ],
      "selectedNodeIds": []
    }
    """.data(using: .utf8)!

    do {
        let docColorDup = try VOODocument.deserialize(from: dupColorsJson)
        assert(docColorDup.canvas.colorVariables.count == 2, "Duplicate color variable IDs parsed without SIGTRAP crash")
        assert(docColorDup.nodes.first?.fill == "#ffffff", "Duplicate color variable resolved safely to first occurrence")
    } catch {
        assert(false, "Duplicate color variables threw unexpected error: \(error)")
    }

    // 20.3 In-Memory sanitizeCyclicHierarchy() with Duplicate Node IDs
    var inMemDupDoc = VOODocument(title: "In-Mem Dup")
    let dupNodeA = VOONode(id: "dup_key", parentId: nil, kind: .group, name: "GroupA")
    let dupNodeB = VOONode(id: "dup_key", parentId: "dup_key", kind: .rect, name: "RectB")
    inMemDupDoc.nodes = [dupNodeA, dupNodeB]
    inMemDupDoc.sanitizeCyclicHierarchy()
    assert(inMemDupDoc.nodes[1].parentId == nil, "sanitizeCyclicHierarchy() with duplicate node IDs completes safely without SIGTRAP")

    // 20.4 Duplicate Node IDs with Clipping Mask Normalization
    let dupClipJson = """
    {
      "id": "dup_clip_doc",
      "title": "Dup Clip Doc",
      "version": 2,
      "canvasType": "design",
      "canvas": { "x": 0, "y": 0, "width": 1920, "height": 1080, "backgroundColor": "#000000", "guides": [], "colorVariables": [] },
      "nodes": [
        { "id": "mask_node", "kind": "rect", "name": "Mask", "x": 0, "y": 0, "width": 100, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } },
        { "id": "dup_child", "kind": "rect", "name": "Clipped1", "x": 0, "y": 0, "width": 50, "height": 50, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }, "clipTo": "mask_node" },
        { "id": "dup_child", "kind": "rect", "name": "Clipped2", "x": 0, "y": 0, "width": 50, "height": 50, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }, "clipTo": "mask_node" }
      ],
      "selectedNodeIds": []
    }
    """.data(using: .utf8)!

    do {
        let docClipDup = try VOODocument.deserialize(from: dupClipJson)
        assert(docClipDup.nodes.count == 3, "Duplicate node IDs with clipping masks deserialized without crash")
    } catch {
        assert(false, "Duplicate clipping mask nodes threw unexpected error: \(error)")
    }

    print("============================================================")
    print(" SUMMARY: \(passed) PASSED, \(failed) FAILED")
    print("============================================================")

    if failed > 0 {
        exit(1)
    }
}

@main
struct M1TestMain {
    static func main() {
        runM1Tests()
    }
}
