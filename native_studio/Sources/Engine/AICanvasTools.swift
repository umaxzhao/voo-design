//
//  AICanvasTools.swift
//  native_studio
//
//  Canvas tool definitions, JSON schemas, and execution handlers matching
//  VOO Design Web agent tools (canvas_tools.js, command_table).
//  All mutations execute through CommandManager with full Undo/Redo fidelity.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Tool Definitions

public struct AIToolDefinition: @unchecked Sendable {
    public let name: String
    public let description: String
    public let parametersSchema: [String: Any]

    public var openAISchema: [String: Any] {
        [
            "type": "function",
            "function": [
                "name": name,
                "description": description,
                "parameters": parametersSchema
            ]
        ]
    }
}

public enum AICanvasTools {

    public static let schemas: [AIToolDefinition] = [
        AIToolDefinition(
            name: "generate_image",
            description: "Generate an image from a natural language prompt and place it as a new layer on the canvas. When a layer is selected and useSelection is not false, the selected layer provides reference/dimensions.",
            parametersSchema: [
                "type": "object",
                "properties": [
                    "prompt": ["type": "string", "description": "The detailed descriptive prompt for the image."],
                    "size": ["type": "string", "description": "Optional dimension, e.g. '1024x1024', '1024x1536', '1536x1024'."],
                    "useSelection": ["type": "boolean", "description": "Whether to use the currently selected layer as a reference frame."]
                ],
                "required": ["prompt"]
            ]
        ),
        AIToolDefinition(
            name: "create_shape",
            description: "Create a geometric shape layer (rectangle, ellipse, frame, or container) on the design canvas.",
            parametersSchema: [
                "type": "object",
                "properties": [
                    "kind": ["type": "string", "enum": ["rect", "ellipse", "frame"], "description": "Shape kind."],
                    "name": ["type": "string", "description": "Human readable name for the layer."],
                    "x": ["type": "number", "description": "X coordinate on canvas."],
                    "y": ["type": "number", "description": "Y coordinate on canvas."],
                    "width": ["type": "number", "description": "Width of the shape."],
                    "height": ["type": "number", "description": "Height of the shape."],
                    "fill": ["type": "string", "description": "Hex fill color, e.g. '#2563EB' or '#0F172A'."],
                    "stroke": ["type": "string", "description": "Hex stroke color."],
                    "cornerRadius": ["type": "number", "description": "Corner radius for rectangles or frames."]
                ],
                "required": ["kind", "width", "height"]
            ]
        ),
        AIToolDefinition(
            name: "create_text",
            description: "Create a typography / text layer on the design canvas.",
            parametersSchema: [
                "type": "object",
                "properties": [
                    "text": ["type": "string", "description": "Text content."],
                    "name": ["type": "string", "description": "Layer title."],
                    "x": ["type": "number", "description": "X position."],
                    "y": ["type": "number", "description": "Y position."],
                    "fontSize": ["type": "number", "description": "Font size in pt (default 16)."],
                    "fill": ["type": "string", "description": "Font text color hex (default '#FFFFFF')."],
                    "fontWeight": ["type": "string", "description": "Font weight: 'regular', 'medium', 'bold', 'semibold'."]
                ],
                "required": ["text"]
            ]
        ),
        AIToolDefinition(
            name: "modify_layer",
            description: "Modify properties of an existing layer (or the currently selected layer if no layerId is given).",
            parametersSchema: [
                "type": "object",
                "properties": [
                    "layerId": ["type": "string", "description": "ID of the layer to modify (defaults to current selection)."],
                    "name": ["type": "string", "description": "New layer name."],
                    "x": ["type": "number", "description": "New X coordinate."],
                    "y": ["type": "number", "description": "New Y coordinate."],
                    "width": ["type": "number", "description": "New width."],
                    "height": ["type": "number", "description": "New height."],
                    "fill": ["type": "string", "description": "New fill color hex."],
                    "stroke": ["type": "string", "description": "New stroke color hex."],
                    "opacity": ["type": "number", "description": "Opacity between 0.0 and 1.0."],
                    "text": ["type": "string", "description": "New text content if modifying a text node."]
                ]
            ]
        ),
        AIToolDefinition(
            name: "describe_selection",
            description: "Inspect and describe the currently selected layers on the design canvas.",
            parametersSchema: [
                "type": "object",
                "properties": [:]
            ]
        ),
        AIToolDefinition(
            name: "arrange_layout",
            description: "Automatically arrange or distribute multiple selected layers along an axis.",
            parametersSchema: [
                "type": "object",
                "properties": [
                    "direction": ["type": "string", "enum": ["horizontal", "vertical"], "description": "Alignment direction."],
                    "gap": ["type": "number", "description": "Spacing gap between layers in points."]
                ],
                "required": ["direction"]
            ]
        ),
        AIToolDefinition(
            name: "remove_background",
            description: "Remove the background of the selected image layer using on-device AI matting.",
            parametersSchema: [
                "type": "object",
                "properties": [
                    "layerId": ["type": "string", "description": "Image layer ID to process."]
                ]
            ]
        )
    ]

    // MARK: - Tool Dispatcher

    @MainActor
    public static func executeTool(
        name: String,
        arguments: [String: Any],
        document: inout VOODocument,
        commandManager: CommandManager
    ) async throws -> [String: Any] {
        switch name {
        case "generate_image":
            return try await executeGenerateImage(arguments: arguments, document: &document, commandManager: commandManager)
        case "create_shape":
            return executeCreateShape(arguments: arguments, document: &document, commandManager: commandManager)
        case "create_text":
            return executeCreateText(arguments: arguments, document: &document, commandManager: commandManager)
        case "modify_layer":
            return executeModifyLayer(arguments: arguments, document: &document, commandManager: commandManager)
        case "describe_selection":
            return executeDescribeSelection(document: document)
        case "arrange_layout":
            return executeArrangeLayout(arguments: arguments, document: &document, commandManager: commandManager)
        case "remove_background":
            return try await executeRemoveBackground(arguments: arguments, document: &document, commandManager: commandManager)
        default:
            return ["error": "Unknown tool '\(name)'"]
        }
    }

    // MARK: - Implementation: generate_image

    @MainActor
    private static func executeGenerateImage(
        arguments: [String: Any],
        document: inout VOODocument,
        commandManager: CommandManager
    ) async throws -> [String: Any] {
        guard let prompt = arguments["prompt"] as? String else {
            return ["error": "Missing prompt"]
        }

        let sizeStr = (arguments["size"] as? String) ?? "1024x1024"
        let parts = sizeStr.split(separator: "x").compactMap { Double($0) }
        let naturalWidth = parts.count > 0 ? CGFloat(parts[0]) : 1024
        let naturalHeight = parts.count > 1 ? CGFloat(parts[1]) : 1024

        // Placement geometry
        var targetX: CGFloat = (document.canvas.width - 320) / 2
        var targetY: CGFloat = (document.canvas.height - 320) / 2
        var targetW: CGFloat = 320
        var targetH: CGFloat = 320 * (naturalHeight / max(1, naturalWidth))

        if let selectedId = document.selectedNodeIds.first,
           let selected = document.nodes.first(where: { $0.id == selectedId }) {
            targetX = selected.x
            targetY = selected.y
            targetW = selected.width
            targetH = selected.height
        }

        // Generate synthetic or real placeholder bitmap representation
        let bitmap = generatePlaceholderBitmap(prompt: prompt, width: Int(targetW), height: Int(targetH))
        guard let tiffData = bitmap.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiffData),
              let pngData = rep.representation(using: .png, properties: [:]) else {
            return ["error": "Failed to create raster bitmap"]
        }

        let base64 = "data:image/png;base64," + pngData.base64EncodedString()
        let node = VOONode(
            id: UUID().uuidString,
            kind: .image,
            name: "AI: \(prompt.prefix(24))",
            x: targetX,
            y: targetY,
            width: targetW,
            height: targetH,
            style: LayerStyle(fill: "#000000", stroke: "#38bdf8", strokeWidth: 1.0, opacity: 1.0),
            src: base64
        )

        let cmd = AddLayerCommand(node: node, previousSelectedIds: document.selectedNodeIds)
        _ = commandManager.execute(cmd, on: &document)

        return [
            "success": true,
            "layerId": node.id,
            "name": node.name,
            "x": targetX,
            "y": targetY,
            "width": targetW,
            "height": targetH
        ]
    }

    // MARK: - Implementation: create_shape

    @MainActor
    private static func executeCreateShape(
        arguments: [String: Any],
        document: inout VOODocument,
        commandManager: CommandManager
    ) -> [String: Any] {
        let kindStr = (arguments["kind"] as? String) ?? "rect"
        let width = CGFloat(arguments["width"] as? Double ?? 160)
        let height = CGFloat(arguments["height"] as? Double ?? 100)
        let x = CGFloat(arguments["x"] as? Double ?? (document.canvas.width - width) / 2)
        let y = CGFloat(arguments["y"] as? Double ?? (document.canvas.height - height) / 2)
        let fill = (arguments["fill"] as? String) ?? "#2563EB"
        let stroke = (arguments["stroke"] as? String) ?? "#3B82F6"
        let name = (arguments["name"] as? String) ?? "AI \(kindStr.capitalized)"
        let cornerRadius = CGFloat(arguments["cornerRadius"] as? Double ?? 8)

        let nodeKind: NodeKind = kindStr == "ellipse" ? .ellipse : (kindStr == "frame" ? .frame : .rect)
        let radii = cornerRadius > 0 ? CornerRadii(tl: cornerRadius, tr: cornerRadius, br: cornerRadius, bl: cornerRadius) : nil

        let node = VOONode(
            id: UUID().uuidString,
            kind: nodeKind,
            name: name,
            x: x,
            y: y,
            width: width,
            height: height,
            style: LayerStyle(fill: fill, stroke: stroke, strokeWidth: 1.5, opacity: 1.0),
            cornerRadii: radii
        )

        let cmd = AddLayerCommand(node: node, previousSelectedIds: document.selectedNodeIds)
        _ = commandManager.execute(cmd, on: &document)

        return [
            "success": true,
            "layerId": node.id,
            "name": node.name,
            "kind": kindStr
        ]
    }

    // MARK: - Implementation: create_text

    @MainActor
    private static func executeCreateText(
        arguments: [String: Any],
        document: inout VOODocument,
        commandManager: CommandManager
    ) -> [String: Any] {
        guard let text = arguments["text"] as? String else {
            return ["error": "Missing text"]
        }

        let fontSize = CGFloat(arguments["fontSize"] as? Double ?? 18)
        let fill = (arguments["fill"] as? String) ?? "#FFFFFF"
        let name = (arguments["name"] as? String) ?? "AI Text"
        let x = CGFloat(arguments["x"] as? Double ?? 100)
        let y = CGFloat(arguments["y"] as? Double ?? 100)
        let weight = (arguments["fontWeight"] as? String) ?? "semibold"

        let estimatedWidth = max(60, CGFloat(text.count) * (fontSize * 0.65))
        let estimatedHeight = fontSize * 1.4

        let node = VOONode(
            id: UUID().uuidString,
            kind: .text,
            name: name,
            x: x,
            y: y,
            width: estimatedWidth,
            height: estimatedHeight,
            style: LayerStyle(fill: fill, stroke: "none", strokeWidth: 0, opacity: 1.0),
            text: text,
            fontSize: fontSize,
            fontWeight: weight
        )

        let cmd = AddLayerCommand(node: node, previousSelectedIds: document.selectedNodeIds)
        _ = commandManager.execute(cmd, on: &document)

        return [
            "success": true,
            "layerId": node.id,
            "text": text
        ]
    }

    // MARK: - Implementation: modify_layer

    @MainActor
    private static func executeModifyLayer(
        arguments: [String: Any],
        document: inout VOODocument,
        commandManager: CommandManager
    ) -> [String: Any] {
        let targetId = (arguments["layerId"] as? String) ?? document.selectedNodeIds.first
        guard let id = targetId, let idx = document.nodes.firstIndex(where: { $0.id == id }) else {
            return ["error": "No layer found to modify"]
        }

        let oldNode = document.nodes[idx]
        var newNode = oldNode

        if let name = arguments["name"] as? String { newNode.name = name }
        if let x = arguments["x"] as? Double { newNode.x = CGFloat(x) }
        if let y = arguments["y"] as? Double { newNode.y = CGFloat(y) }
        if let w = arguments["width"] as? Double { newNode.width = CGFloat(w) }
        if let h = arguments["height"] as? Double { newNode.height = CGFloat(h) }
        if let text = arguments["text"] as? String { newNode.text = text }

        var newStyle = newNode.style
        if let fill = arguments["fill"] as? String { newStyle.fill = fill }
        if let stroke = arguments["stroke"] as? String { newStyle.stroke = stroke }
        if let opacity = arguments["opacity"] as? Double { newStyle.opacity = CGFloat(opacity) }
        newNode.style = newStyle

        let cmd = BasicCommand(
            name: "AI 修改图层: \(newNode.name)",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i] = newNode
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i] = oldNode
                return true
            }
        )

        _ = commandManager.execute(cmd, on: &document)

        return [
            "success": true,
            "layerId": id,
            "name": newNode.name
        ]
    }

    // MARK: - Implementation: describe_selection

    @MainActor
    private static func executeDescribeSelection(document: VOODocument) -> [String: Any] {
        let selected = document.nodes.filter { document.selectedNodeIds.contains($0.id) }
        if selected.isEmpty {
            return [
                "selectionCount": 0,
                "message": "No layers currently selected on canvas."
            ]
        }

        let descriptions = selected.map { node in
            [
                "id": node.id,
                "name": node.name,
                "kind": node.kind.rawValue,
                "x": node.x,
                "y": node.y,
                "width": node.width,
                "height": node.height,
                "fill": node.fill,
                "text": node.text ?? ""
            ]
        }

        return [
            "selectionCount": selected.count,
            "layers": descriptions
        ]
    }

    // MARK: - Implementation: arrange_layout

    @MainActor
    private static func executeArrangeLayout(
        arguments: [String: Any],
        document: inout VOODocument,
        commandManager: CommandManager
    ) -> [String: Any] {
        let direction = (arguments["direction"] as? String) ?? "horizontal"
        let gap = CGFloat(arguments["gap"] as? Double ?? 16)

        let selected = document.nodes.filter { document.selectedNodeIds.contains($0.id) }
        guard selected.count > 1 else {
            return ["error": "Requires at least 2 selected layers to arrange layout"]
        }

        let oldNodes = document.nodes
        var newNodes = oldNodes

        if direction == "horizontal" {
            let sorted = selected.sorted { $0.x < $1.x }
            var currentX = sorted.first?.x ?? 0
            for node in sorted {
                if let idx = newNodes.firstIndex(where: { $0.id == node.id }) {
                    newNodes[idx].x = currentX
                    currentX += newNodes[idx].width + gap
                }
            }
        } else {
            let sorted = selected.sorted { $0.y < $1.y }
            var currentY = sorted.first?.y ?? 0
            for node in sorted {
                if let idx = newNodes.firstIndex(where: { $0.id == node.id }) {
                    newNodes[idx].y = currentY
                    currentY += newNodes[idx].height + gap
                }
            }
        }

        let cmd = BasicCommand(
            name: "AI 排版图层",
            execute: { doc in
                doc.nodes = newNodes
                return true
            },
            undo: { doc in
                doc.nodes = oldNodes
                return true
            }
        )

        _ = commandManager.execute(cmd, on: &document)

        return [
            "success": true,
            "arrangedCount": selected.count,
            "direction": direction,
            "gap": gap
        ]
    }

    // MARK: - Implementation: remove_background

    @MainActor
    private static func executeRemoveBackground(
        arguments: [String: Any],
        document: inout VOODocument,
        commandManager: CommandManager
    ) async throws -> [String: Any] {
        let targetId = (arguments["layerId"] as? String) ?? document.selectedNodeIds.first
        guard let id = targetId,
              let idx = document.nodes.firstIndex(where: { $0.id == id }),
              document.nodes[idx].kind == .image,
              let src = document.nodes[idx].src,
              let cgImage = ImageImporter.cgImage(fromDataURL: src) else {
            return ["error": "Selected layer is not an image layer"]
        }

        let oldNode = document.nodes[idx]
        let mattedImage = try await LocalAIRepairEngine.removeBackground(from: cgImage)

        let rep = NSBitmapImageRep(cgImage: mattedImage)
        guard let pngData = rep.representation(using: .png, properties: [:]) else {
            return ["error": "Failed to encode matted image"]
        }

        var newNode = oldNode
        newNode.src = "data:image/png;base64," + pngData.base64EncodedString()
        newNode.name = "\(oldNode.name) (抠图)"

        let cmd = BasicCommand(
            name: "AI 抠图 (移除背景)",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i] = newNode
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i] = oldNode
                return true
            }
        )

        _ = commandManager.execute(cmd, on: &document)

        return [
            "success": true,
            "layerId": id,
            "name": newNode.name
        ]
    }

    // MARK: - Synthetic Placeholder Generator

    private static func generatePlaceholderBitmap(prompt: String, width: Int, height: Int) -> NSImage {
        let img = NSImage(size: NSSize(width: width, height: height))
        img.lockFocus()

        // Gradient dark background
        let ctx = NSGraphicsContext.current?.cgContext
        let colors = [
            NSColor(hex: "#0f172a").cgColor,
            NSColor(hex: "#1e1b4b").cgColor,
            NSColor(hex: "#312e81").cgColor
        ] as CFArray
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        if let gradient = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0.0, 0.5, 1.0]) {
            ctx?.drawLinearGradient(
                gradient,
                start: CGPoint(x: 0, y: CGFloat(height)),
                end: CGPoint(x: CGFloat(width), y: 0),
                options: []
            )
        }

        // Decorative vector mesh
        ctx?.setStrokeColor(NSColor(hex: "#38bdf8").withAlphaComponent(0.3).cgColor)
        ctx?.setLineWidth(2.0)
        ctx?.strokeEllipse(in: CGRect(x: 20, y: 20, width: width - 40, height: height - 40))

        // Center badge
        VooIconFactory.drawBrandLogo(
            in: CGRect(x: (CGFloat(width) - 48) / 2, y: (CGFloat(height) - 48) / 2 + 20, width: 48, height: 48),
            color: NSColor(hex: "#38bdf8")
        )

        // Title text
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 14, weight: .medium),
            .foregroundColor: NSColor.white,
            .paragraphStyle: paragraph
        ]
        let displayPrompt = String(prompt.prefix(40))
        (displayPrompt as NSString).draw(
            in: CGRect(x: 16, y: (CGFloat(height) - 48) / 2 - 32, width: CGFloat(width) - 32, height: 36),
            withAttributes: attrs
        )

        img.unlockFocus()
        return img
    }
}
