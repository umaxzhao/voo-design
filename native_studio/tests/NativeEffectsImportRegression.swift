#if INTEGRATED
    import AppKit
    import Foundation

    /// Exercises the real Web fixture whose empty effects are explicitly JSON null.
    enum NativeEffectsImportRegression {
        static func verifyFormNullEffects() throws {
            let root = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent()
            let form = try DocumentIO.shared.loadDocument(
                from: root.appendingPathComponent("docs/examples/form-poster.voo"))
            guard let number = form.nodes.first(where: { $0.name == "Number" }) else {
                throw TestFailure(message: "FORM Number fixture missing", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(number.portableProperties["effects"], .null)
            try TestAssertions.assertTrue(number.supportsNativeEffects)
            try TestAssertions.assertTrue(VOONode(kind: .rect).supportsNativeEffects)
            let controller = WindowController()
            controller.newDocument(nil)
            let stage = controller.mainContentView.canvasStageView
            stage.document = form
            stage.selectedNodeIds = [number.id]
            let panel = controller.mainContentView.inspector.propertiesPanel
            panel.layoutSubtreeIfNeeded()
            guard
                let add = descendants(panel).compactMap({ $0 as? NSButton }).first(where: {
                    $0.accessibilityIdentifier() == "Inspector.Properties.EffectsAdd"
                })
            else {
                throw TestFailure(message: "Effects Add button missing", file: #file, line: #line)
            }
            try TestAssertions.assertTrue(add.isEnabled, "JSON null is an editable empty stack")
            panel.makeEffectsMenu().performActionForItem(at: 0)
            try TestAssertions.assertTrue(
                stage.document.nodes.first { $0.id == number.id }?.effects?.gaussianBlur?.enabled
                    == true)
            try TestAssertions.assertEqual(controller.commandManager.undoCount, 1)
            let url = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent(UUID().uuidString + ".voo")
            defer { try? FileManager.default.removeItem(at: url) }
            try DocumentIO.shared.saveDocument(stage.document, to: url)
            let reopened = try DocumentIO.shared.loadDocument(from: url)
            try TestAssertions.assertTrue(
                reopened.nodes.first { $0.id == number.id }?.effects?.gaussianBlur?.enabled == true)
            controller.undoAction(nil)
            try TestAssertions.assertEqual(
                stage.document.nodes.first { $0.id == number.id }, number)
            try DocumentIO.shared.saveDocument(stage.document, to: url)
            let undone = try DocumentIO.shared.loadDocument(from: url)
            try TestAssertions.assertEqual(
                undone.nodes.first { $0.id == number.id }?.portableProperties["effects"], .null)
        }

        private static func descendants(_ root: NSView) -> [NSView] {
            [root] + root.subviews.flatMap(descendants)
        }
    }
#endif
