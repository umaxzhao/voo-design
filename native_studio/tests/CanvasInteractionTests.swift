//
//  CanvasInteractionTests.swift
//  native_studio
//
//  Round 7: real-document canvas interaction regression tests.
//  These tests exercise WindowController + CanvasStageView with synthesized
//  mouse/keyboard events so tool wiring cannot silently regress again.
//

#if INTEGRATED
import AppKit
import CoreGraphics
import Foundation

public class CanvasInteractionTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_ToolButtonsDriveCanvasActiveTool") {
            let (controller, stage) = makeEditor()
            let content = controller.mainContentView
            let pairs: [(NSButton, StudioToolType)] = [
                (content.toolRail.moveToolButton, .move),
                (content.toolRail.nodeToolButton, .node),
                (content.toolRail.penToolButton, .pen),
                (content.toolRail.shapesToolButton, .shapes),
                (content.toolRail.brushToolButton, .brush),
                (content.toolRail.eraserToolButton, .eraser),
                (content.toolRail.textToolButton, .text),
                (content.toolRail.artboardToolButton, .artboard)
            ]
            for (button, tool) in pairs {
                button.performClick(nil)
                try TestAssertions.assertEqual(stage.activeTool, tool,
                                               "Clicking \(tool.rawValue) tool must drive canvas.activeTool")
            }
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_KeyboardShortcutsDriveCanvasActiveTool") {
            let (controller, stage) = makeEditor()
            let cases: [(String, UInt16, StudioToolType)] = [
                    ("v", 9, .move), ("f", 3, .artboard), ("p", 35, .pen), ("r", 15, .shapes),
                    ("b", 11, .brush), ("e", 14, .eraser), ("t", 17, .text), ("a", 0, .node),
                ]
                for (chars, code, tool) in cases {
                let handled = sendKey(controller, chars: chars, keyCode: code)
                try TestAssertions.assertTrue(handled, "Shortcut \(chars) should be handled")
                try TestAssertions.assertEqual(stage.activeTool, tool,
                                               "Keyboard \(chars) must drive canvas.activeTool")
            }
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_ShapeToolCreatesUndoableRectangle") {
            let (controller, stage) = makeEditor()
            let before = stage.document.nodes.count
            controller.mainContentView.toolRail.shapesToolButton.performClick(nil)
            let start = stage.viewPoint(from: CGPoint(x: 300, y: 300))
            let end = stage.viewPoint(from: CGPoint(x: 700, y: 600))
            sendMouse(stage, .leftMouseDown, start)
            sendMouse(stage, .leftMouseDragged, end)
            sendMouse(stage, .leftMouseUp, end)

            try TestAssertions.assertEqual(stage.document.nodes.count, before + 1, "Shape drag must insert a node")
            guard let rect = stage.document.nodes.last else { throw TestFailure(message: "missing rect", file: #file, line: #line) }
            try TestAssertions.assertEqual(rect.kind, .rect)
            try TestAssertions.assertTrue(rect.width > 100 && rect.height > 100, "Rect should follow the drag size")
            try TestAssertions.assertTrue(stage.selectedNodeIds.contains(rect.id), "New shape must be selected")
                try TestAssertions.assertEqual(
                    stage.activeTool, .shapes, "Shape tool stays active for continuous creation")

                controller.undoAction(nil)
                try TestAssertions.assertEqual(stage.document.nodes.count, before, "Undo must remove the created shape")
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_ClickAndDragSelectAndMoveNode") {
            let (controller, stage) = makeEditor()
            // Insert a rect programmatically at a known document position.
            let node = VOONode(kind: .rect, name: "Probe", x: 300, y: 300, width: 200, height: 120,
                               style: LayerStyle(fill: "#b2ffd6"))
            controller.commandManager.execute(InsertNodeCommand(node: node), on: &stage.document)
            controller.mainContentView.toolRail.moveToolButton.performClick(nil)

            let center = stage.viewPoint(from: CGPoint(x: 400, y: 360))
            sendMouse(stage, .leftMouseDown, center)
            sendMouse(stage, .leftMouseUp, center)
            try TestAssertions.assertTrue(stage.selectedNodeIds.contains(node.id), "Click must select the node")

            let beforeX = stage.document.nodes.first(where: { $0.id == node.id })!.x
            sendMouse(stage, .leftMouseDown, center)
            sendMouse(stage, .leftMouseDragged, CGPoint(x: center.x + 80, y: center.y + 40))
            sendMouse(stage, .leftMouseUp, CGPoint(x: center.x + 80, y: center.y + 40))
            let afterX = stage.document.nodes.first(where: { $0.id == node.id })!.x
            try TestAssertions.assertTrue(abs(afterX - beforeX - 80.0 / stage.zoom) < 2.0,
                                          "Drag must move the node by the pointer delta")
            controller.undoAction(nil)
            let undoneX = stage.document.nodes.first(where: { $0.id == node.id })!.x
            try TestAssertions.assertApproxEqual(undoneX, beforeX, accuracy: 0.5, "Move must be undoable")
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_TransformHandlesResizeNode") {
            let (controller, stage) = makeEditor()
            let node = VOONode(kind: .rect, name: "Resizable", x: 300, y: 300, width: 200, height: 120,
                               style: LayerStyle(fill: "#b2ffd6"))
            controller.commandManager.execute(InsertNodeCommand(node: node), on: &stage.document)
            stage.selectNode(id: node.id)
            stage.layoutSubtreeIfNeeded()

            let handles = stage.transformHandles
            let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            let viewRect = handles.viewRect(forDocumentRect: rect)
            let inset = handles.contentInset
            let handlePoint = CGPoint(x: viewRect.maxX + inset, y: viewRect.maxY + inset)
            let target = CGPoint(x: handlePoint.x + 80, y: handlePoint.y + 60)
            sendMouse(stage, .leftMouseDown, handlePoint)
            sendMouse(stage, .leftMouseDragged, target)
            sendMouse(stage, .leftMouseUp, target)

            let resized = stage.document.nodes.first(where: { $0.id == node.id })!
            try TestAssertions.assertTrue(resized.width > node.width + 20, "Bottom-right handle must grow width")
            try TestAssertions.assertTrue(resized.height > node.height + 20, "Bottom-right handle must grow height")
            controller.undoAction(nil)
            let restored = stage.document.nodes.first(where: { $0.id == node.id })!
            try TestAssertions.assertApproxEqual(restored.width, node.width, accuracy: 0.5)
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_TextToolCreatesAndCommitsText") {
            let (controller, stage) = makeEditor()
            controller.mainContentView.toolRail.textToolButton.performClick(nil)
            let point = stage.viewPoint(from: CGPoint(x: 420, y: 380))
            sendMouse(stage, .leftMouseDown, point)
            sendMouse(stage, .leftMouseUp, point)
            RunLoop.current.run(until: Date().addingTimeInterval(0.35))

            let textNodes = stage.document.nodes.filter { $0.kind == .text }
            try TestAssertions.assertEqual(textNodes.count, 1, "Text click must insert a text node")
            try TestAssertions.assertTrue(controller.textEditingOverlay.isEditing, "Inline editor must open")

            controller.textEditingOverlay.editorTextView.string = "Hello Native"
            controller.textEditingOverlay.endEditing(commit: true)
            let committed = stage.document.nodes.first(where: { $0.kind == .text })?.text
            try TestAssertions.assertEqual(committed, "Hello Native", "Commit must write the edited text")
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_PenToolCreatesPath") {
            let (controller, stage) = makeEditor()
            controller.mainContentView.toolRail.penToolButton.performClick(nil)
            for docPoint in [CGPoint(x: 800, y: 300), CGPoint(x: 1000, y: 450), CGPoint(x: 1150, y: 250)] {
                let point = stage.viewPoint(from: docPoint)
                sendMouse(stage, .leftMouseDown, point)
                sendMouse(stage, .leftMouseUp, point)
            }
            try TestAssertions.assertEqual(stage.penAnchorCount, 3, "Three clicks must create three anchors")
            if let event = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                                            windowNumber: controller.window?.windowNumber ?? 0, context: nil,
                                            characters: "\r", charactersIgnoringModifiers: "\r",
                                            isARepeat: false, keyCode: 36) {
                stage.keyDown(with: event)
            }
            let paths = stage.document.nodes.filter { $0.kind == .path }
            try TestAssertions.assertEqual(paths.count, 1, "Return must finish the pen path")
            try TestAssertions.assertEqual(paths.first?.points?.count, 3)
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_AccessoryToolsSetCanvasModes") {
            let (controller, stage) = makeEditor()
            let rail = controller.mainContentView.toolRail
            rail.handButton?.performClick(nil)
            try TestAssertions.assertTrue(stage.panModeEnabled, "Hand tool enables pan mode")
            rail.lassoButton?.performClick(nil)
            try TestAssertions.assertEqual(stage.selectionStyle, .lasso, "Lasso sets selection style")
            rail.wandButton?.performClick(nil)
            try TestAssertions.assertEqual(stage.selectionStyle, .wand, "Magic wand sets selection style")
            rail.moveToolButton.performClick(nil)
            try TestAssertions.assertEqual(stage.selectionStyle, .marquee, "Move tool resets selection style")
            try TestAssertions.assertFalse(stage.panModeEnabled)
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_SpaceBarPanAndZoomBar") {
            let (controller, stage) = makeEditor()
            controller.mainContentView.toolRail.moveToolButton.performClick(nil)
            let before = stage.panOffset
            let start = CGPoint(x: 700, y: 450)
            let end = CGPoint(x: 760, y: 500)
            if let spaceDown = NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                                                windowNumber: controller.window?.windowNumber ?? 0, context: nil,
                                                characters: " ", charactersIgnoringModifiers: " ", isARepeat: false, keyCode: 49) {
                stage.keyDown(with: spaceDown)
            }
            sendMouse(stage, .leftMouseDown, start)
            sendMouse(stage, .leftMouseDragged, end)
            sendMouse(stage, .leftMouseUp, end)
            try TestAssertions.assertTrue(stage.panOffset.x != before.x || stage.panOffset.y != before.y,
                                          "Space + drag must pan the viewport")

            let zoomBefore = stage.zoom
            controller.mainContentView.bottomZoomBar.onZoomIn?()
            try TestAssertions.assertTrue(stage.zoom > zoomBefore, "Zoom bar + must zoom in")
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_LayerAddAndDeleteButtonsWork") {
            let (controller, stage) = makeEditor()
            let before = stage.document.nodes.count
            guard let addButton = findButton(in: controller.mainContentView.inspector.layersPanel, id: "Layers.Add") else {
                throw TestFailure(message: "Layers.Add missing", file: #file, line: #line)
            }
            addButton.performClick(nil)
            try TestAssertions.assertEqual(stage.document.nodes.count, before + 1, "Layer + must add a rectangle")

            if let lastId = stage.document.nodes.last?.id {
                stage.selectNode(id: lastId)
            }
            guard let deleteButton = findButton(in: controller.mainContentView.inspector.layersPanel, id: "Layers.Delete") else {
                throw TestFailure(message: "Layers.Delete missing", file: #file, line: #line)
            }
            deleteButton.performClick(nil)
            try TestAssertions.assertEqual(stage.document.nodes.count, before, "Layer trash must delete the selection")
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_BrushStrokeCreatesPersistentPaintLayer") {
            let (controller, stage) = makeEditor()
            let before = stage.document.nodes.count
            controller.mainContentView.toolRail.brushToolButton.performClick(nil)
            try TestAssertions.assertEqual(stage.activeTool, .brush)
            let start = stage.viewPoint(from: CGPoint(x: 350, y: 350))
            let mid = stage.viewPoint(from: CGPoint(x: 500, y: 450))
            let end = stage.viewPoint(from: CGPoint(x: 650, y: 380))
            sendMouse(stage, .leftMouseDown, start)
            sendMouse(stage, .leftMouseDragged, mid)
            sendMouse(stage, .leftMouseDragged, end)
            sendMouse(stage, .leftMouseUp, end)

            try TestAssertions.assertEqual(stage.document.nodes.count, before + 1, "First brush stroke must create a paint layer node")
            let paint = stage.document.nodes.last
            try TestAssertions.assertEqual(paint?.kind, .image)
            try TestAssertions.assertTrue((paint?.src ?? "").hasPrefix("data:image/png;base64,"), "Paint layer must store a PNG data URL")
            try TestAssertions.assertTrue(stage.paintNodeId == paint?.id, "Stage must track the paint layer id")
            try TestAssertions.assertTrue(controller.commandManager.canUndo)
            controller.undoAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.count, before, "Undo must remove the first paint layer")
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_EraserUpdatesSamePaintLayer") {
            let (controller, stage) = makeEditor()
            controller.mainContentView.toolRail.brushToolButton.performClick(nil)
            let a = stage.viewPoint(from: CGPoint(x: 350, y: 350))
            let b = stage.viewPoint(from: CGPoint(x: 650, y: 450))
            sendMouse(stage, .leftMouseDown, a)
            sendMouse(stage, .leftMouseDragged, b)
            sendMouse(stage, .leftMouseUp, b)
            guard let paintNode = stage.document.nodes.last, let firstSrc = paintNode.src else {
                throw TestFailure(message: "brush layer missing", file: #file, line: #line)
            }
            let countAfterBrush = stage.document.nodes.count

            controller.mainContentView.toolRail.eraserToolButton.performClick(nil)
            try TestAssertions.assertEqual(stage.activeTool, .eraser)
            let e1 = stage.viewPoint(from: CGPoint(x: 450, y: 390))
            let e2 = stage.viewPoint(from: CGPoint(x: 550, y: 420))
            sendMouse(stage, .leftMouseDown, e1)
            sendMouse(stage, .leftMouseDragged, e2)
            sendMouse(stage, .leftMouseUp, e2)

            try TestAssertions.assertEqual(stage.document.nodes.count, countAfterBrush, "Eraser must reuse the existing paint layer")
            let updated = stage.document.nodes.first(where: { $0.id == paintNode.id })
            try TestAssertions.assertTrue((updated?.src ?? "") != firstSrc, "Eraser must change the paint layer image")
            try TestAssertions.assertEqual(stage.paintNodeId, paintNode.id)
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_RightClickMenuProvider") {
            let (controller, stage) = makeEditor()
            _ = controller
            stage.selectNode(id: stage.document.nodes.last?.id ?? "")
            guard let menu = stage.contextMenuProvider?(.zero) else {
                throw TestFailure(message: "context menu provider missing", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(menu.items.count >= 3, "Canvas right-click menu should expose actions")
        }

        registry.register(tier: 1, feature: "F43-CanvasWiring", name: "test_F43_PageSwitcher_DynamicSyncAndNewPage") {
            let (controller, stage) = makeEditor()
            controller.mainContentView.isWelcomeOpen = false

            // Initially single page / document canvas
            controller.syncChromeState()
            try TestAssertions.assertEqual(controller.mainContentView.pageSwitcher.pageIndex, 1)

            // Add new page via newPageAction
            controller.perform(Selector(("newPageAction:")), with: nil)
            let frameNodes = stage.document.nodes.filter { $0.kind == .frame }
            try TestAssertions.assertTrue(!frameNodes.isEmpty, "New page frame node must be inserted")
            try TestAssertions.assertEqual(controller.mainContentView.pageSwitcher.pageCount, frameNodes.count)
        }
    }

    // MARK: - Helpers

    private static func makeEditor() -> (WindowController, CanvasStageView) {
        let controller = WindowController()
        guard let window = controller.window else {
            fatalError("WindowController has no window")
        }
        window.setContentSize(NSSize(width: 1440, height: 900))
        window.contentView?.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        controller.mainContentView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        controller.mainContentView.layoutSubtreeIfNeeded()

        controller.newDocument(nil)
        controller.mainContentView.isWelcomeOpen = false
        controller.mainContentView.layoutSubtreeIfNeeded()
        let stage = controller.mainContentView.canvasStageView
        stage.layoutSubtreeIfNeeded()
        return (controller, stage)
    }

    private static func sendMouse(_ stage: CanvasStageView, _ type: NSEvent.EventType, _ windowPoint: CGPoint) {
        guard let window = stage.window,
              let event = NSEvent.mouseEvent(with: type,
                    location: stage.convert(windowPoint, to: nil),
                    modifierFlags: [],
                    timestamp: ProcessInfo.processInfo.systemUptime,
                                             windowNumber: window.windowNumber,
                                             context: nil,
                                             eventNumber: 0,
                                             clickCount: 1,
                                             pressure: 1.0) else { return }
        switch type {
        case .leftMouseDown: stage.mouseDown(with: event)
        case .leftMouseDragged: stage.mouseDragged(with: event)
        case .leftMouseUp: stage.mouseUp(with: event)
        default: break
        }
    }

    @discardableResult
    private static func sendKey(_ controller: WindowController, chars: String, keyCode: UInt16) -> Bool {
        guard let window = controller.window,
              let event = NSEvent.keyEvent(with: .keyDown,
                                           location: .zero,
                                           modifierFlags: [],
                                           timestamp: ProcessInfo.processInfo.systemUptime,
                                           windowNumber: window.windowNumber,
                                           context: nil,
                                           characters: chars,
                                           charactersIgnoringModifiers: chars,
                                           isARepeat: false,
                                           keyCode: keyCode) else { return false }
        return controller.handleKeyDown(event)
    }

    private static func findButton(in root: NSView, id: String) -> NSButton? {
        if let button = root as? NSButton, button.accessibilityIdentifier() == id { return button }
        for subview in root.subviews {
            if let found = findButton(in: subview, id: id) { return found }
        }
        return nil
    }
}
#else
import Foundation
public class CanvasInteractionTests {
    public static func registerTests() {}
}
#endif
