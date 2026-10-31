//
//  InspectorBehaviourTests.swift
//  native_studio tests
//
//  Regression checks for the inspector controls that were previously visual-only:
//  - FILL / STROKE row eye + remove toggles drive real style changes
//  - CONSTRAINTS dropdowns round-trip through the model and survive Codable
//  - CanvasStageView.applyConstraints re-pins children after a frame resize
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

public final class InspectorBehaviourTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // 1. Fill row: remove → "none", eye restores the colour that was hidden.
        registry.register(tier: 1, feature: "Inspector-PaintRows", name: "test_Inspector_FillRowRemoveAndEyeTogglePaint") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 288, height: 720))
            let node = VOONode(id: "rect_1", kind: .rect, name: "Rectangle", x: 0, y: 0,
                               width: 100, height: 100, style: LayerStyle(fill: "#4ade80"))
            var fills: [String] = []
            panel.onFillChange = { fills.append($0) }
            panel.configure(with: node)
            panel.layoutSubtreeIfNeeded()

            let remove = try requireButton(panel, id: "Inspector.Properties.FillRemove")
            remove.performClick(nil)
            try TestAssertions.assertEqual(fills.last, "none", "Fill remove sets the paint to none")

            let eye = try requireButton(panel, id: "Inspector.Properties.FillEye")
            eye.performClick(nil)
            try TestAssertions.assertEqual(fills.last?.uppercased(), "#4ADE80", "Fill eye restores the hidden colour")
        }

        // 2. Stroke row mirrors the fill row behaviour.
        registry.register(tier: 1, feature: "Inspector-PaintRows", name: "test_Inspector_StrokeRowRemoveAndEyeTogglePaint") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 288, height: 720))
            let node = VOONode(id: "rect_2", kind: .rect, name: "Rectangle", x: 0, y: 0,
                               width: 100, height: 100,
                               style: LayerStyle(fill: "#ffffff", stroke: "#b2ffd6", strokeWidth: 2))
            var strokes: [String] = []
            panel.onStrokeChange = { strokes.append($0) }
            panel.configure(with: node)
            panel.layoutSubtreeIfNeeded()

            let remove = try requireButton(panel, id: "Inspector.Properties.StrokeRemove")
            remove.performClick(nil)
            try TestAssertions.assertEqual(strokes.last, "none", "Stroke remove sets the paint to none")

            let eye = try requireButton(panel, id: "Inspector.Properties.StrokeVisible")
            eye.performClick(nil)
            try TestAssertions.assertEqual(strokes.last?.uppercased(), "#B2FFD6", "Stroke eye restores the hidden colour")
        }

        // 3. Constraints survive the model round trip (old files have no key).
        registry.register(tier: 1, feature: "Model-Constraints", name: "test_Constraints_CodableRoundTripAndBackwardsCompatibility") {
            var node = VOONode(id: "frame_child", kind: .rect, name: "Child", x: 10, y: 10,
                               width: 40, height: 40, style: LayerStyle(fill: "#ffffff"))
            node.constraints = NodeConstraints(horizontal: "right", vertical: "bottom")

            let encoder = JSONEncoder()
            let data = try encoder.encode(node)
            let json = String(data: data, encoding: .utf8) ?? ""
            try TestAssertions.assertTrue(json.contains("\"constraints\""), "Constraints are encoded when set")

            let decoded = try JSONDecoder().decode(VOONode.self, from: data)
            try TestAssertions.assertEqual(decoded.constraints?.horizontal, "right")
            try TestAssertions.assertEqual(decoded.constraints?.vertical, "bottom")

            // An unset constraint is omitted so untouched documents stay byte-identical,
            // which is also what makes pre-constraints .voo files decode unchanged.
            let plain = VOONode(id: "plain", kind: .rect, name: "Plain", x: 0, y: 0,
                                width: 10, height: 10, style: LayerStyle(fill: "#000000"))
            let plainJSON = String(data: try encoder.encode(plain), encoding: .utf8) ?? ""
            try TestAssertions.assertFalse(plainJSON.contains("\"constraints\""), "Nil constraints are omitted from the JSON")

            let legacyNode = try JSONDecoder().decode(VOONode.self, from: Data(plainJSON.utf8))
            try TestAssertions.assertNil(legacyNode.constraints, "Documents written without constraints decode to nil")
        }

        // 4. Unknown constraint values normalize instead of throwing.
        registry.register(tier: 2, feature: "Model-Constraints", name: "test_Constraints_UnknownValuesNormalize") {
            let constraints = NodeConstraints(horizontal: "diagonal", vertical: "sideways")
            try TestAssertions.assertEqual(constraints.horizontal, "left", "Unknown horizontal falls back to left")
            try TestAssertions.assertEqual(constraints.vertical, "top", "Unknown vertical falls back to top")

            let payload = #"{"horizontal":"scale","vertical":"weird"}"#
            let decoded = try JSONDecoder().decode(NodeConstraints.self, from: Data(payload.utf8))
            try TestAssertions.assertEqual(decoded.horizontal, "scale")
            try TestAssertions.assertEqual(decoded.vertical, "top")
        }

        // 5. Frame resize re-pins children according to their constraints.
        registry.register(tier: 3, feature: "Canvas-Constraints", name: "test_Constraints_ApplyPinsChildrenAfterFrameResize") {
            let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
            var document = VOODocument()
            document.canvas = CanvasFrame(x: 0, y: 0, width: 1200, height: 800, backgroundColor: "#171717")

            let frame = VOONode(id: "frame", kind: .frame, name: "Frame", x: 0, y: 0,
                                width: 200, height: 200, style: LayerStyle(fill: "#171717"))
            var pinnedRight = VOONode(id: "right", parentId: "frame", kind: .rect, name: "Right", x: 150, y: 10,
                                      width: 40, height: 40, style: LayerStyle(fill: "#ffffff"))
            pinnedRight.constraints = NodeConstraints(horizontal: "right", vertical: "top")
            var pinnedLeft = VOONode(id: "left", parentId: "frame", kind: .rect, name: "Left", x: 10, y: 10,
                                     width: 40, height: 40, style: LayerStyle(fill: "#ffffff"))
            pinnedLeft.constraints = NodeConstraints(horizontal: "left", vertical: "top")
            document.nodes = [frame, pinnedRight, pinnedLeft]
            stage.document = document

            // Grow the frame by 100pt, then re-apply the constraints.
            stage.document.nodes[0].width = 300
            stage.applyConstraints(frameId: "frame", previousFrame: CGRect(x: 0, y: 0, width: 200, height: 200))

            guard let left = stage.document.nodes.first(where: { $0.id == "left" }),
                  let right = stage.document.nodes.first(where: { $0.id == "right" }) else {
                throw TestFailure(message: "Children missing after constraint pass", file: #file, line: #line)
            }
            try TestAssertions.assertApproxEqual(left.x, 10, accuracy: 0.5, "Left-pinned child keeps its offset")
            try TestAssertions.assertApproxEqual(right.x, 250, accuracy: 0.5, "Right-pinned child keeps its right inset")
        }

        // 6. Island bar actions reach the document (align / lock / visibility).
        registry.register(tier: 3, feature: "Island-Actions", name: "test_IslandBar_ActionsDriveTheDocument") {
            let controller = WindowController()
            guard let window = controller.window else {
                throw TestFailure(message: "WindowController has no window", file: #file, line: #line)
            }
            window.setContentSize(NSSize(width: 1440, height: 900))
            controller.mainContentView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
            controller.mainContentView.isWelcomeOpen = false
            controller.mainContentView.layoutSubtreeIfNeeded()

            let stage = controller.mainContentView.canvasStageView
            let a = VOONode(id: "a", kind: .rect, name: "A", x: 100, y: 100, width: 50, height: 50,
                            style: LayerStyle(fill: "#ffffff"))
            let b = VOONode(id: "b", kind: .rect, name: "B", x: 300, y: 200, width: 50, height: 50,
                            style: LayerStyle(fill: "#ffffff"))
            stage.document.nodes = [a, b]
            stage.selectedNodeIds = ["a", "b"]
            stage.needsDisplay = true

            let island = controller.mainContentView.islandBar
            island.update(selectionLabel: "2 layers")
            island.layoutSubtreeIfNeeded()

            // glyphButtons[2] is "align left" in the web order.
            island.glyphButtons[2].performClick(nil)
            let lefts = stage.document.nodes.map { $0.x }
            try TestAssertions.assertApproxEqual(lefts.max() ?? -1, lefts.min() ?? -2, accuracy: 0.5,
                                                 "Align left gives every selected layer the same x")

            // Lock and visibility act on the selection.
            island.glyphButtons[6].performClick(nil)
            try TestAssertions.assertTrue(stage.document.nodes.allSatisfy { $0.style.locked }, "Lock marks every selected layer locked")
            island.glyphButtons[7].performClick(nil)
            try TestAssertions.assertTrue(stage.document.nodes.allSatisfy { !$0.style.visible }, "Eye hides every selected layer")
        }

        // 7. Draft autosave: writes only when enabled, restores newer-than-file drafts.
        registry.register(tier: 2, feature: "Draft-Autosave", name: "test_DraftAutosave_DisabledByDefaultAndWritesWhenEnabled") {
            let previous = UserDefaults.standard.object(forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)
            defer {
                if let previous { UserDefaults.standard.set(previous, forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey) }
                else { UserDefaults.standard.removeObject(forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey) }
                DraftAutosave.shared.discardAll()
            }
            // Never touch the real Application Support directory from tests.
            let sandboxDir = (NSTemporaryDirectory() as NSString)
                .appendingPathComponent("voo_draft_test_\(UUID().uuidString)")
            setenv("VOO_DRAFT_DIR", sandboxDir, 1)
            defer {
                setenv("VOO_DRAFT_DIR", "", 1)
                try? FileManager.default.removeItem(atPath: sandboxDir)
            }
            UserDefaults.standard.set(false, forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)

            var document = VOODocument()
            document.title = "DraftProbe"
            document.canvas = CanvasFrame(x: 0, y: 0, width: 200, height: 100, backgroundColor: "#171717")
            document.nodes = [VOONode(id: "n1", kind: .rect, name: "R", x: 0, y: 0, width: 50, height: 50,
                                      style: LayerStyle(fill: "#ffffff"))]

            try TestAssertions.assertFalse(DraftAutosave.shared.isEnabled, "Drafts are off by default")
            DraftAutosave.shared.flush(document: document, currentFileURL: nil)
            try TestAssertions.assertTrue(DraftAutosave.shared.recoverableDrafts().isEmpty,
                                          "Disabled autosave writes nothing")

            UserDefaults.standard.set(true, forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)
            try TestAssertions.assertTrue(DraftAutosave.shared.isEnabled, "Autosave follows the defaults key")
            DraftAutosave.shared.flush(document: document, currentFileURL: nil)
            let drafts = DraftAutosave.shared.recoverableDrafts()
            try TestAssertions.assertEqual(drafts.count, 1, "Enabled autosave writes one recovery copy")
            try TestAssertions.assertNotNil(DraftAutosave.shared.loadDraft(drafts[0]), "Draft decodes")
            let restored = DraftAutosave.shared.loadDraft(drafts[0])
            try TestAssertions.assertEqual(restored?.title, "DraftProbe")
            try TestAssertions.assertEqual(restored?.nodes.count, 1)

            DraftAutosave.shared.discard(drafts[0])
            try TestAssertions.assertTrue(DraftAutosave.shared.recoverableDrafts().isEmpty, "Discarding removes the draft")
        }
    }

    private static func requireButton(_ root: NSView, id: String) throws -> PropertiesIconButton {
        guard let button = findView(in: root, where: { $0.accessibilityIdentifier() == id }) as? PropertiesIconButton else {
            throw TestFailure(message: "Missing button \(id)", file: #file, line: #line)
        }
        return button
    }

    private static func findView(in root: NSView, where predicate: (NSView) -> Bool) -> NSView? {
        if predicate(root) { return root }
        for subview in root.subviews {
            if let match = findView(in: subview, where: predicate) { return match }
        }
        return nil
    }
}
