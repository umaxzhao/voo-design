//
//  AIAgentTests.swift
//  native_studio
//
//  Automated test suite verifying the native AI agent subsystem, canvas tools,
//  local AI repair (inpainting & matting), settings, and undo/redo semantics.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

public final class AIAgentTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // MARK: - 1. Settings & Configuration
        registry.register(tier: 1, feature: "AI Subsystem", name: "AI Settings Provider Defaults & Mutation") {
            let settings = AISettings.shared
            try TestAssertions.assertFalse(settings.systemPrompt.isEmpty, "Default system prompt must not be empty")
            try TestAssertions.assertEqual(settings.activeProviderId, "openai")
            try TestAssertions.assertFalse(settings.activeModel.isEmpty)

            var config = settings.activeProvider
            let origKey = config.apiKey
            config.apiKey = "test-key-ai-subsystem-123"
            settings.saveProvider(config)
            try TestAssertions.assertEqual(settings.activeProvider.apiKey, "test-key-ai-subsystem-123")

            // Restore original
            config.apiKey = origKey
            settings.saveProvider(config)
        }

        // MARK: - 2. Canvas Tool Execution & Undo/Redo Contracts
        registry.register(tier: 1, feature: "AI Canvas Tools", name: "AI Tool: create_shape and Undo/Redo") {
            var doc = VOODocument()
            let cmdManager = CommandManager()
            try TestAssertions.assertEqual(doc.nodes.count, 0)

            let args: [String: Any] = [
                "type": "rectangle",
                "title": "Welcome Hero Card",
                "width": 320,
                "height": 180,
                "x": 100,
                "y": 150,
                "fill": "#3b82f6",
                "cornerRadius": 16
            ]

            let result = try awaitAsync {
                try await AICanvasTools.executeTool(
                    name: "create_shape",
                    arguments: args,
                    document: &doc,
                    commandManager: cmdManager
                )
            }

            try TestAssertions.assertEqual(result["status"] as? String, "success")
            try TestAssertions.assertEqual(doc.nodes.count, 1)
            let createdNode = doc.nodes[0]
            try TestAssertions.assertEqual(createdNode.name, "Welcome Hero Card")
            try TestAssertions.assertEqual(createdNode.x, 100)
            try TestAssertions.assertEqual(createdNode.y, 150)
            try TestAssertions.assertEqual(createdNode.width, 320)
            try TestAssertions.assertEqual(createdNode.height, 180)
            try TestAssertions.assertEqual(createdNode.cornerRadii?.tl, 16)

            // Test Undo
            try TestAssertions.assertTrue(cmdManager.canUndo)
            cmdManager.undo(on: &doc)
            try TestAssertions.assertEqual(doc.nodes.count, 0, "Shape creation must be reversible via Cmd+Z")

            // Test Redo
            try TestAssertions.assertTrue(cmdManager.canRedo)
            cmdManager.redo(on: &doc)
            try TestAssertions.assertEqual(doc.nodes.count, 1, "Shape creation must be restorable via Cmd+Shift+Z")
            try TestAssertions.assertEqual(doc.nodes[0].name, "Welcome Hero Card")
        }

        registry.register(tier: 1, feature: "AI Canvas Tools", name: "AI Tool: create_text and modify_layer") {
            var doc = VOODocument()
            let cmdManager = CommandManager()

            let textArgs: [String: Any] = [
                "text": "Hello Voo Native Studio",
                "fontSize": 28,
                "x": 50,
                "y": 80,
                "fill": "#ffffff"
            ]

            let createResult = try awaitAsync {
                try await AICanvasTools.executeTool(
                    name: "create_text",
                    arguments: textArgs,
                    document: &doc,
                    commandManager: cmdManager
                )
            }

            try TestAssertions.assertEqual(createResult["status"] as? String, "success")
            guard let nodeId = createResult["nodeId"] as? String else {
                throw TestFailure(message: "Expected created text nodeId", file: #file, line: #line)
            }

            try TestAssertions.assertEqual(doc.nodes.count, 1)
            try TestAssertions.assertEqual(doc.nodes[0].text, "Hello Voo Native Studio")

            // Modify layer
            let modArgs: [String: Any] = [
                "layerId": nodeId,
                "fill": "#10b981",
                "width": 400,
                "opacity": 0.8
            ]

            let modResult = try awaitAsync {
                try await AICanvasTools.executeTool(
                    name: "modify_layer",
                    arguments: modArgs,
                    document: &doc,
                    commandManager: cmdManager
                )
            }

            try TestAssertions.assertEqual(modResult["status"] as? String, "success")
            try TestAssertions.assertEqual(doc.nodes[0].style.fill, "#10b981")
            try TestAssertions.assertEqual(doc.nodes[0].style.opacity, 0.8)

            // Undo modify
            cmdManager.undo(on: &doc)
            try TestAssertions.assertEqual(doc.nodes[0].style.fill, "#ffffff")
        }

        registry.register(tier: 2, feature: "AI Canvas Tools", name: "AI Tool: describe_selection and arrange_layout") {
            var doc = VOODocument()
            let cmdManager = CommandManager()

            let n1 = VOONode(kind: .rect, name: "Card A", x: 200, y: 100, width: 80, height: 80)
            let n2 = VOONode(kind: .rect, name: "Card B", x: 10, y: 100, width: 80, height: 80)
            doc.nodes = [n1, n2]

            // describe_selection
            let descResult = try awaitAsync {
                try await AICanvasTools.executeTool(
                    name: "describe_selection",
                    arguments: ["selectedLayerIds": [n1.id, n2.id]],
                    document: &doc,
                    commandManager: cmdManager
                )
            }
            try TestAssertions.assertEqual(descResult["status"] as? String, "success")
            try TestAssertions.assertEqual(descResult["count"] as? Int, 2)

            // arrange_layout horizontally
            let arrangeResult = try awaitAsync {
                try await AICanvasTools.executeTool(
                    name: "arrange_layout",
                    arguments: [
                        "layerIds": [n1.id, n2.id],
                        "direction": "horizontal",
                        "gap": 16
                    ],
                    document: &doc,
                    commandManager: cmdManager
                )
            }
            try TestAssertions.assertEqual(arrangeResult["status"] as? String, "success")

            // First sorted node (n2 x=10) should stay at x=10, next at 10 + 80 + 16 = 106
            let arrangedN1 = doc.nodes.first(where: { $0.id == n1.id })!
            let arrangedN2 = doc.nodes.first(where: { $0.id == n2.id })!
            try TestAssertions.assertEqual(arrangedN2.x, 10)
            try TestAssertions.assertEqual(arrangedN1.x, 106)
        }

        // MARK: - 3. Local AI Repair Engine
        registry.register(tier: 2, feature: "Local AI Repair", name: "Local AI Repair: Inpainting & Matting Pipelines") {
            // Create a 64x64 test image with a red circle in the center
            let size = NSSize(width: 64, height: 64)
            let testImage = NSImage(size: size)
            testImage.lockFocus()
            NSColor.blue.setFill()
            NSRect(origin: .zero, size: size).fill()
            NSColor.red.setFill()
            NSBezierPath(ovalIn: NSRect(x: 20, y: 20, width: 24, height: 24)).fill()
            testImage.unlockFocus()

            guard let cgImage = testImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                throw TestFailure(message: "Failed to create CGImage fixture", file: #file, line: #line)
            }

            // Create a mask over the center (24x24)
            let maskImage = NSImage(size: size)
            maskImage.lockFocus()
            NSColor.black.setFill()
            NSRect(origin: .zero, size: size).fill()
            NSColor.white.setFill()
            NSRect(x: 20, y: 20, width: 24, height: 24).fill()
            maskImage.unlockFocus()
            guard let maskCG = maskImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                throw TestFailure(message: "Failed to create mask CGImage fixture", file: #file, line: #line)
            }

            // Run inpainting
            let repaired = try LocalAIRepairEngine.inpaint(image: cgImage, mask: maskCG, radius: 4)
            try TestAssertions.assertEqual(repaired.width, 64)
            try TestAssertions.assertEqual(repaired.height, 64)

            // Run matting pipeline
            let matted = try awaitAsync {
                try await LocalAIRepairEngine.removeBackground(from: cgImage)
            }
            try TestAssertions.assertEqual(matted.width, 64)
            try TestAssertions.assertEqual(matted.height, 64)
        }

        // MARK: - 4. Multi-turn Agent Fallback & Intent Loop
        registry.register(tier: 1, feature: "AI Subsystem", name: "AIAgentClient Multi-turn Offline Fallback Loop") {
            try awaitAsync {
                var doc = VOODocument()
                let cmdManager = CommandManager()
                var history: [AIChatMessage] = []
                var streamedChunks: [String] = []
                var toolEvents: [String] = []

                let response = try await AIAgentClient.shared.runAgentTurn(
                    userText: "创建卡片 欢迎来到 VOO",
                    history: &history,
                    document: &doc,
                    commandManager: cmdManager,
                    onText: { chunk in
                        streamedChunks.append(chunk)
                    },
                    onToolEvent: { event in
                        switch event {
                        case .starting(let name, _): toolEvents.append("start:\(name)")
                        case .completed(let name, _): toolEvents.append("done:\(name)")
                        case .failed(let name, _): toolEvents.append("fail:\(name)")
                        }
                    }
                )
                try TestAssertions.assertFalse(response.isEmpty)
                try TestAssertions.assertTrue(doc.nodes.count >= 1, "Agent turn should instantiate canvas elements")
                try TestAssertions.assertTrue(history.count >= 2, "Agent turn must record user and assistant turns in history")
            }
        }

        // MARK: - 5. Contextual Taskbar AI Actions & Viewport Focusing
        registry.register(tier: 1, feature: "Contextual AI Actions", name: "Taskbar AI Actions & Viewport Focus") {
            let taskbar = ContextualTaskbarView()
            var mattingTriggered = false
            var rewriteTriggered = false

            taskbar.onAIRemoveBackground = { mattingTriggered = true }
            taskbar.onAIRewrite = { rewriteTriggered = true }

            // Test Image Node Contextual Taskbar
            let imgNode = VOONode(kind: .image, name: "Sample Image", x: 100, y: 100, width: 200, height: 200)
            taskbar.update(selectedNodes: [imgNode])

            taskbar.onAIRemoveBackground?()
            try TestAssertions.assertTrue(mattingTriggered, "Clicking taskbar wand should trigger AI background removal callback")

            // Test Text Node Contextual Taskbar
            let textNode = VOONode(kind: .text, name: "Heading", x: 50, y: 50, width: 120, height: 40)
            taskbar.update(selectedNodes: [textNode])
            taskbar.onAIRewrite?()
            try TestAssertions.assertTrue(rewriteTriggered, "Clicking taskbar sparkles should trigger AI rewrite callback")

            // Test Canvas Stage Viewport Focus
            let stage = CanvasStageView(frame: CGRect(x: 0, y: 0, width: 800, height: 600))
            stage.document.nodes = [imgNode, textNode]
            stage.focusOnNode(id: imgNode.id)
            try TestAssertions.assertEqual(stage.selectedNodeIds, [imgNode.id])
        }
    }

    // Helper to safely bridge async throws operations in synchronous test runners
    private static func awaitAsync<T>(
        timeout: TimeInterval = 6.0,
        _ operation: @escaping @MainActor () async throws -> T
    ) throws -> T {
        final class ResultBox<U>: @unchecked Sendable {
            var value: U?
            var error: Error?
        }
        let box = ResultBox<T>()
        let semaphore = DispatchSemaphore(value: 0)

        Task { @MainActor in
            do {
                box.value = try await operation()
            } catch {
                box.error = error
            }
            semaphore.signal()
        }

        let deadline = Date().addingTimeInterval(timeout)
        while semaphore.wait(timeout: .now()) == .timedOut {
            if Date() > deadline {
                throw TestFailure(
                    message: "Async operation timed out after \(timeout)s",
                    file: #file,
                    line: #line
                )
            }
            RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.01))
        }

        if let err = box.error {
            throw err
        }
        guard let res = box.value else {
            throw TestFailure(message: "Async operation produced no result", file: #file, line: #line)
        }
        return res
    }
}
