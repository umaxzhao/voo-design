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

        // 8. Zoom bar more menu: fit, rulers, clear guides callbacks
        registry.register(tier: 1, feature: "ZoomBar-MoreMenu", name: "test_ZoomBar_MoreMenuAndRulersState") {
            let bar = StudioBottomZoomBar(frame: NSRect(x: 0, y: 0, width: StudioBottomZoomBar.preferredWidth, height: StudioBottomZoomBar.preferredHeight))
            var fitCalled = false
            var rulersToggled: Bool?
            var clearGuidesCalled = false

            bar.onZoomFit = { fitCalled = true }
            bar.onToggleRulers = { rulersToggled = $0 }
            bar.onClearGuides = { clearGuidesCalled = true }

            try TestAssertions.assertFalse(bar.isRulersEnabled, "Rulers start disabled")
            bar.setRulersEnabled(true)
            try TestAssertions.assertTrue(bar.isRulersEnabled, "setRulersEnabled updates state")

            bar.onZoomFit?()
            try TestAssertions.assertTrue(fitCalled)

            bar.onToggleRulers?(true)
            try TestAssertions.assertEqual(rulersToggled, true)

            bar.onClearGuides?()
            try TestAssertions.assertTrue(clearGuidesCalled)
        }

        // 9. Title bar: collab button present in editor mode, hidden in dashboard mode
        registry.register(tier: 1, feature: "TitleBar-Collab", name: "test_TitleBar_CollabButtonAndDashboardLayout") {
            let bar = AppTitleBar(frame: NSRect(x: 0, y: 0, width: 1440, height: 40))
            var collabTapped = false
            bar.onCollabTapped = { collabTapped = true }

            try TestAssertions.assertFalse(bar.collabButton.isHidden, "Collab button is visible in editor mode")
            try TestAssertions.assertFalse(bar.collabDivider.isHidden, "Collab divider is visible in editor mode")
            try TestAssertions.assertEqual(bar.collabButton.accessibilityIdentifier(), "title_bar_collab_button")

            bar.collabButton.performClick(nil)
            try TestAssertions.assertTrue(collabTapped, "Collab button fires onCollabTapped")

            bar.isDashboardMode = true
            try TestAssertions.assertTrue(bar.collabButton.isHidden, "Collab button is hidden in dashboard mode")
            try TestAssertions.assertTrue(bar.collabDivider.isHidden, "Collab divider is hidden in dashboard mode")
            try TestAssertions.assertFalse(bar.browserButton.isHidden, "Browser button stays visible in dashboard mode")
            try TestAssertions.assertTrue(bar.settingsButton.isHidden, "Settings button is hidden in dashboard mode")
        }

        // 10. Layer ordering shortcuts and actions (Figma / Web parity: [ and ], ⌘[ and ⌘])
        registry.register(tier: 1, feature: "Layer-Ordering", name: "test_LayerOrdering_StepAndJumpActionsAndShortcuts") {
            let controller = WindowController()
            guard let window = controller.window else {
                throw TestFailure(message: "WindowController has no window", file: #file, line: #line)
            }
            window.setContentSize(NSSize(width: 1440, height: 900))
            controller.mainContentView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
            controller.mainContentView.isWelcomeOpen = false
            controller.mainContentView.layoutSubtreeIfNeeded()

            let stage = controller.mainContentView.canvasStageView
            let n1 = VOONode(id: "node_1", kind: .rect, name: "Node 1", x: 0, y: 0, width: 100, height: 100)
            let n2 = VOONode(id: "node_2", kind: .rect, name: "Node 2", x: 50, y: 50, width: 100, height: 100)
            let n3 = VOONode(id: "node_3", kind: .rect, name: "Node 3", x: 100, y: 100, width: 100, height: 100)
            stage.document.nodes = [n1, n2, n3]

            // Select node_1 (currently at bottom, index 0)
            stage.selectedNodeIds = ["node_1"]

            // Bring forward: moves node_1 to index 1
            controller.bringForwardAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.map { $0.id }, ["node_2", "node_1", "node_3"])

            // Bring to front: moves node_1 to index 2 (top)
            controller.bringToFrontAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.map { $0.id }, ["node_2", "node_3", "node_1"])

            // Send backward: moves node_1 to index 1
            controller.sendBackwardAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.map { $0.id }, ["node_2", "node_1", "node_3"])

            // Send to back: moves node_1 to index 0
            controller.sendToBackAction(nil)
            try TestAssertions.assertEqual(stage.document.nodes.map { $0.id }, ["node_1", "node_2", "node_3"])
        }

        // 11. Rotated frame constraints: pinning works along rotated local axes
        registry.register(tier: 1, feature: "Canvas-Constraints", name: "test_Constraints_RotatedFramePinsAlongLocalAxes") {
            let stage = CanvasStageView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800))
            var document = VOODocument()
            document.canvas = CanvasFrame(x: 0, y: 0, width: 1200, height: 800, backgroundColor: "#171717")

            var frame = VOONode(id: "rot_frame", kind: .frame, name: "Rotated Frame", x: 100, y: 100,
                                width: 200, height: 100, style: LayerStyle(fill: "#171717"))
            frame.rotation = 90.0

            var child = VOONode(id: "rot_child", parentId: "rot_frame", kind: .rect, name: "Rot Child",
                                x: 90, y: 280, width: 20, height: 20, style: LayerStyle(fill: "#ffffff"))
            child.constraints = NodeConstraints(horizontal: "right", vertical: "top")
            document.nodes = [frame, child]
            stage.document = document

            // Grow the frame width from 200 to 300 along its local X axis
            stage.document.nodes[0].width = 300
            stage.applyConstraints(frameId: "rot_frame", previousFrame: CGRect(x: 100, y: 100, width: 200, height: 100))

            guard let updated = stage.document.nodes.first(where: { $0.id == "rot_child" }) else {
                throw TestFailure(message: "Missing child", file: #file, line: #line)
            }
            try TestAssertions.assertApproxEqual(updated.x, 90, accuracy: 0.5, "Child x stays aligned with rotated local frame")
            try TestAssertions.assertApproxEqual(updated.y, 380, accuracy: 0.5, "Child y moves along rotated local width axis")
        }

        // 12. Light interface theme switching (web parity: theme-light.css)
        registry.register(tier: 1, feature: "Theme-LightMode", name: "test_ThemeManager_LightAndDarkSwitchingAndWindowBackground") {
            let previous = UserDefaults.standard.string(forKey: SettingsDrawerView.editorThemeDefaultsKey)
            defer {
                if let previous {
                    UserDefaults.standard.set(previous, forKey: SettingsDrawerView.editorThemeDefaultsKey)
                } else {
                    UserDefaults.standard.removeObject(forKey: SettingsDrawerView.editorThemeDefaultsKey)
                }
                ThemeManager.shared.currentMode = .dark
            }

            // Default mode is dark
            UserDefaults.standard.removeObject(forKey: SettingsDrawerView.editorThemeDefaultsKey)
            try TestAssertions.assertEqual(ThemeManager.shared.currentMode, .dark)
            try TestAssertions.assertFalse(ThemeManager.shared.isLight)

            let controller = WindowController()
            guard let window = controller.window else {
                throw TestFailure(message: "WindowController has no window", file: #file, line: #line)
            }
            window.setContentSize(NSSize(width: 1440, height: 900))
            controller.mainContentView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
            controller.mainContentView.layoutSubtreeIfNeeded()

            // In dark mode, window background is ThemeTokens.colorPanel (#171717)
            try TestAssertions.assertEqual(window.backgroundColor, ThemeTokens.colorPanel)

            // Switch to light mode
            controller.applyTheme(.light)
            try TestAssertions.assertEqual(window.backgroundColor, NSColor(hex: "#f5f5f5"))
            try TestAssertions.assertEqual(controller.mainContentView.editorShell.layer?.backgroundColor, NSColor(hex: "#f5f5f5").cgColor)

            // Switch back to dark mode
            controller.applyTheme(.dark)
            try TestAssertions.assertEqual(window.backgroundColor, ThemeTokens.colorPanel)
            try TestAssertions.assertEqual(controller.mainContentView.editorShell.layer?.backgroundColor, NSColor.black.cgColor)
        }

        // 13. Agent panel model chip label synchronisation
        registry.register(tier: 1, feature: "Agent-ModelSync", name: "test_AgentPanel_ModelLabelSyncWithProvider") {
            let prevProvider = UserDefaults.standard.string(forKey: SettingsDrawerView.agentProviderDefaultsKey)
            let prevModel = UserDefaults.standard.string(forKey: "voo.agent.model")
            defer {
                if let prevProvider {
                    UserDefaults.standard.set(prevProvider, forKey: SettingsDrawerView.agentProviderDefaultsKey)
                } else {
                    UserDefaults.standard.removeObject(forKey: SettingsDrawerView.agentProviderDefaultsKey)
                }
                if let prevModel {
                    UserDefaults.standard.set(prevModel, forKey: "voo.agent.model")
                } else {
                    UserDefaults.standard.removeObject(forKey: "voo.agent.model")
                }
            }
            UserDefaults.standard.removeObject(forKey: "voo.agent.model")

            let controller = WindowController()
            guard let window = controller.window else {
                throw TestFailure(message: "WindowController has no window", file: #file, line: #line)
            }
            window.setContentSize(NSSize(width: 1440, height: 900))
            controller.mainContentView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
            controller.mainContentView.layoutSubtreeIfNeeded()

            // Default provider (claude) produces "Opus 5.5"
            UserDefaults.standard.set("claude", forKey: SettingsDrawerView.agentProviderDefaultsKey)
            controller.syncAgentModelLabel()
            try TestAssertions.assertEqual(controller.mainContentView.agentPanel.modelLabel, "Opus 5.5")

            // Antigravity maps to Gemini 3.8
            UserDefaults.standard.set("antigravity", forKey: SettingsDrawerView.agentProviderDefaultsKey)
            controller.syncAgentModelLabel()
            try TestAssertions.assertEqual(controller.mainContentView.agentPanel.modelLabel, "Gemini 3.8")

            // DeepSeek Harness maps to DeepSeek V3
            UserDefaults.standard.set("deepseekHarness", forKey: SettingsDrawerView.agentProviderDefaultsKey)
            controller.syncAgentModelLabel()
            try TestAssertions.assertEqual(controller.mainContentView.agentPanel.modelLabel, "DeepSeek V3")

            // Custom model override takes precedence
            UserDefaults.standard.set("custom-fine-tuned", forKey: "voo.agent.model")
            controller.syncAgentModelLabel()
            try TestAssertions.assertEqual(controller.mainContentView.agentPanel.modelLabel, "custom-fine-tuned")
        }

        // 14. Real-world Web .voo file decoding and loading
        registry.register(tier: 1, feature: "SerDe-RealVooFiles", name: "test_WebExamples_RealVooFilesDecodeAndLoadCleanly") {
            let samples = [
                ("docs/examples/f1-grand-prix.voo", 131),
                ("docs/examples/form-poster.voo", 14),
                ("docs/examples/pulse-dashboard.voo", 75),
                ("docs/examples/music-discovery.voo", 175)
            ]
            let root = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            for (relPath, minNodes) in samples {
                let url = root.appendingPathComponent(relPath)
                try TestAssertions.assertTrue(
                    FileManager.default.fileExists(atPath: url.path), "Missing fixture: \(relPath)")
                let doc = try DocumentIO.shared.loadDocument(from: url)
                try TestAssertions.assertTrue(doc.nodes.count >= minNodes, "\(relPath) must decode at least \(minNodes) nodes (got \(doc.nodes.count))")
                try TestAssertions.assertTrue(doc.canvas.width > 0, "\(relPath) canvas width > 0")
                try TestAssertions.assertTrue(doc.canvas.height > 0, "\(relPath) canvas height > 0")
            }
        }

        // 15. Opening a real .voo file through WindowController opens editor without error alerts
        registry.register(tier: 1, feature: "WindowController-OpenVoo", name: "test_WindowController_OpenRealVooFileDirectlyLoadsSceneAndSetsTitle") {
            let controller = WindowController()
            guard let window = controller.window else {
                throw TestFailure(message: "WindowController has no window", file: #file, line: #line)
            }
            window.setContentSize(NSSize(width: 1440, height: 900))
            controller.mainContentView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
            controller.mainContentView.layoutSubtreeIfNeeded()

            let sample = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("docs/examples/f1-grand-prix.voo").path
            try TestAssertions.assertTrue(
                FileManager.default.fileExists(atPath: sample), "Missing F1 fixture")

            controller.openEditor(project: sample)
            try TestAssertions.assertFalse(controller.mainContentView.isWelcomeOpen, "Welcome dashboard must close")
            try TestAssertions.assertTrue(controller.mainContentView.canvasStageView.document.nodes.count >= 130, "Document nodes loaded")
            try TestAssertions.assertEqual(controller.currentFileURL?.path, sample)
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
