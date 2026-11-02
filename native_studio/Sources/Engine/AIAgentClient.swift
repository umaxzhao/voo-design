//
//  AIAgentClient.swift
//  native_studio
//
//  Native Swift async LLM streaming client & multi-turn agent loop replicating
//  VOO Design Web agent architecture (canvas_agent.js, chat_stream.js).
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

// MARK: - Message Models

public struct AIChatMessage: Codable, Sendable {
    public var role: String
    public var content: String?
    public var tool_calls: [AIToolCallMessage]?
    public var tool_call_id: String?
    public var name: String?

    public init(
        role: String,
        content: String? = nil,
        tool_calls: [AIToolCallMessage]? = nil,
        tool_call_id: String? = nil,
        name: String? = nil
    ) {
        self.role = role
        self.content = content
        self.tool_calls = tool_calls
        self.tool_call_id = tool_call_id
        self.name = name
    }
}

public struct AIToolCallMessage: Codable, Sendable {
    public var id: String
    public var type: String
    public var function: AIFunctionCall

    public init(id: String, type: String = "function", function: AIFunctionCall) {
        self.id = id
        self.type = type
        self.function = function
    }
}

public struct AIFunctionCall: Codable, Sendable {
    public var name: String
    public var arguments: String

    public init(name: String, arguments: String) {
        self.name = name
        self.arguments = arguments
    }
}

public enum AIToolEvent: @unchecked Sendable {
    case starting(name: String, args: [String: Any])
    case completed(name: String, result: [String: Any])
    case failed(name: String, error: String)
}

// MARK: - Agent Client

public final class AIAgentClient: @unchecked Sendable {
    public static let shared = AIAgentClient()

    private let urlSession: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60.0
        config.timeoutIntervalForResource = 300.0
        self.urlSession = URLSession(configuration: config)
    }

    // MARK: - Multi-Turn Agent Loop (Matching canvas_agent.js)

    @MainActor
    public func runAgentTurn(
        userText: String,
        history: inout [AIChatMessage],
        document: inout VOODocument,
        commandManager: CommandManager,
        onText: @escaping @MainActor (String) -> Void,
        onToolEvent: @escaping @MainActor (AIToolEvent) -> Void
    ) async throws -> String {
        let settings = AISettings.shared
        let systemPrompt = settings.styleNote.isEmpty ?
            settings.systemPrompt :
            "\(settings.systemPrompt)\n\nStyle notes from the user: \(settings.styleNote)"

        var messages: [AIChatMessage] = [
            AIChatMessage(role: "system", content: systemPrompt)
        ]
        messages.append(contentsOf: history)
        messages.append(AIChatMessage(role: "user", content: userText))

        let apiKey = settings.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)

        // Offline / Simulation fallback if no API key is provided
        if apiKey.isEmpty && !settings.baseURL.contains("localhost") && !settings.baseURL.contains("127.0.0.1") {
            return try await runLocalHeuristicAgentTurn(
                userText: userText,
                history: &history,
                document: &document,
                commandManager: commandManager,
                onText: onText,
                onToolEvent: onToolEvent
            )
        }

        let maxSteps = settings.maxSteps

        for _ in 0..<maxSteps {
            let (assistantText, toolCalls) = try await streamChatTurn(
                messages: messages,
                onText: onText
            )

            if toolCalls.isEmpty {
                // Agent loop completed turn without requesting further tools
                history.append(AIChatMessage(role: "user", content: userText))
                history.append(AIChatMessage(role: "assistant", content: assistantText))
                return assistantText
            }

            // Append assistant response with tool calls
            let toolCallMessages = toolCalls.map {
                AIToolCallMessage(
                    id: $0.id,
                    type: "function",
                    function: AIFunctionCall(name: $0.name, arguments: $0.rawArguments)
                )
            }
            messages.append(AIChatMessage(role: "assistant", content: assistantText.isEmpty ? nil : assistantText, tool_calls: toolCallMessages))

            // Execute each requested tool sequentially
            for tool in toolCalls {
                onToolEvent(.starting(name: tool.name, args: tool.parsedArguments))
                do {
                    let result = try await AICanvasTools.executeTool(
                        name: tool.name,
                        arguments: tool.parsedArguments,
                        document: &document,
                        commandManager: commandManager
                    )
                    onToolEvent(.completed(name: tool.name, result: result))

                    let resultData = try JSONSerialization.data(withJSONObject: result, options: [])
                    let resultString = String(data: resultData, encoding: .utf8) ?? "{}"

                    messages.append(AIChatMessage(
                        role: "tool",
                        content: resultString,
                        tool_call_id: tool.id,
                        name: tool.name
                    ))
                } catch {
                    onToolEvent(.failed(name: tool.name, error: error.localizedDescription))
                    messages.append(AIChatMessage(
                        role: "tool",
                        content: "{\"error\": \"\(error.localizedDescription)\"}",
                        tool_call_id: tool.id,
                        name: tool.name
                    ))
                }
            }
        }

        throw NSError(domain: "VOO.AI", code: 429, userInfo: [NSLocalizedDescriptionKey: "agentStepLimit: Reached max steps limit (\(maxSteps))"])
    }

    // MARK: - Streaming SSE Client (OpenAI Compatible)

    public struct ParsedToolCall: @unchecked Sendable {
        public var id: String
        public var name: String
        public var rawArguments: String
        public var parsedArguments: [String: Any]
    }

    private func streamChatTurn(
        messages: [AIChatMessage],
        onText: @escaping @MainActor (String) -> Void
    ) async throws -> (String, [ParsedToolCall]) {
        let settings = AISettings.shared
        guard let url = URL(string: "\(settings.baseURL)/chat/completions") else {
            throw NSError(domain: "VOO.AI", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid API endpoint URL"])
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !settings.apiKey.isEmpty {
            request.setValue("Bearer \(settings.apiKey)", forHTTPHeaderField: "Authorization")
        }

        let toolSchemas = AICanvasTools.schemas.map { $0.openAISchema }
        let payload: [String: Any] = [
            "model": settings.activeModel,
            "messages": messages.map { msg -> [String: Any] in
                var dict: [String: Any] = ["role": msg.role]
                if let content = msg.content { dict["content"] = content }
                if let tool_calls = msg.tool_calls {
                    dict["tool_calls"] = tool_calls.map { tc in
                        [
                            "id": tc.id,
                            "type": tc.type,
                            "function": [
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            ]
                        ]
                    }
                }
                if let tool_call_id = msg.tool_call_id { dict["tool_call_id"] = tool_call_id }
                if let name = msg.name { dict["name"] = name }
                return dict
            },
            "tools": toolSchemas,
            "stream": true
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (bytes, response) = try await urlSession.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 500
            throw NSError(domain: "VOO.AI", code: code, userInfo: [NSLocalizedDescriptionKey: "HTTP Request failed with status code \(code)"])
        }

        var fullAssistantText = ""
        var toolCallsInProgress: [Int: (id: String, name: String, args: String)] = [:]

        for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.hasPrefix("data: ") else { continue }
            let payloadStr = String(trimmed.dropFirst(6))
            if payloadStr == "[DONE]" { break }

            guard let data = payloadStr.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let choices = json["choices"] as? [[String: Any]],
                  let firstChoice = choices.first,
                  let delta = firstChoice["delta"] as? [String: Any] else {
                continue
            }

            // Stream text chunk
            if let content = delta["content"] as? String {
                fullAssistantText += content
                await MainActor.run {
                    onText(content)
                }
            }

            // Stream tool call delta
            if let toolCallsDelta = delta["tool_calls"] as? [[String: Any]] {
                for tc in toolCallsDelta {
                    let index = (tc["index"] as? Int) ?? 0
                    var current = toolCallsInProgress[index] ?? (id: "", name: "", args: "")
                    if let id = tc["id"] as? String { current.id += id }
                    if let fn = tc["function"] as? [String: Any] {
                        if let name = fn["name"] as? String { current.name += name }
                        if let args = fn["arguments"] as? String { current.args += args }
                    }
                    toolCallsInProgress[index] = current
                }
            }
        }

        let parsedTools = toolCallsInProgress.keys.sorted().compactMap { idx -> ParsedToolCall? in
            guard let entry = toolCallsInProgress[idx], !entry.name.isEmpty else { return nil }
            let parsedArgs = (try? JSONSerialization.jsonObject(with: entry.args.data(using: .utf8) ?? Data()) as? [String: Any]) ?? [:]
            return ParsedToolCall(
                id: entry.id.isEmpty ? UUID().uuidString : entry.id,
                name: entry.name,
                rawArguments: entry.args,
                parsedArguments: parsedArgs
            )
        }

        return (fullAssistantText, parsedTools)
    }

    // MARK: - Intelligent Local Offline Heuristic Mode

    @MainActor
    private func runLocalHeuristicAgentTurn(
        userText: String,
        history: inout [AIChatMessage],
        document: inout VOODocument,
        commandManager: CommandManager,
        onText: @escaping @MainActor (String) -> Void,
        onToolEvent: @escaping @MainActor (AIToolEvent) -> Void
    ) async throws -> String {
        let lower = userText.lowercased()

        // 1. Image Generation Intent
        if lower.contains("画") || lower.contains("图") || lower.contains("generate") || lower.contains("image") || lower.contains("photo") {
            let cleanPrompt = userText
                .replacingOccurrences(of: "帮我画一个", with: "")
                .replacingOccurrences(of: "生成一张", with: "")
                .replacingOccurrences(of: "generate an image of ", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)

            let args: [String: Any] = ["prompt": cleanPrompt, "size": "1024x1024"]
            onToolEvent(.starting(name: "generate_image", args: args))
            let result = try await AICanvasTools.executeTool(
                name: "generate_image",
                arguments: args,
                document: &document,
                commandManager: commandManager
            )
            onToolEvent(.completed(name: "generate_image", result: result))

            let reply = "已为您在画布生成了图像图层: “\(cleanPrompt)”。"
            for char in reply {
                onText(String(char))
                try? await Task.sleep(nanoseconds: 15_000_000)
            }
            history.append(AIChatMessage(role: "user", content: userText))
            history.append(AIChatMessage(role: "assistant", content: reply))
            return reply
        }

        // 2. Shape Creation Intent
        if lower.contains("矩形") || lower.contains("卡片") || lower.contains("rect") || lower.contains("圆") || lower.contains("circle") || lower.contains("ellipse") {
            let isCircle = lower.contains("圆") || lower.contains("circle") || lower.contains("ellipse")
            let fill = lower.contains("蓝") ? "#2563EB" : (lower.contains("红") ? "#DC2626" : (lower.contains("黑") ? "#0F172A" : "#10B981"))
            let args: [String: Any] = [
                "kind": isCircle ? "ellipse" : "rect",
                "width": 240.0,
                "height": isCircle ? 240.0 : 160.0,
                "fill": fill,
                "cornerRadius": isCircle ? 0.0 : 16.0
            ]
            onToolEvent(.starting(name: "create_shape", args: args))
            let result = try await AICanvasTools.executeTool(
                name: "create_shape",
                arguments: args,
                document: &document,
                commandManager: commandManager
            )
            onToolEvent(.completed(name: "create_shape", result: result))

            let reply = "已为您创建了 \(isCircle ? "圆形" : "圆角卡片") 图层。"
            for char in reply {
                onText(String(char))
                try? await Task.sleep(nanoseconds: 15_000_000)
            }
            history.append(AIChatMessage(role: "user", content: userText))
            history.append(AIChatMessage(role: "assistant", content: reply))
            return reply
        }

        // 3. Text Creation Intent
        if lower.contains("文字") || lower.contains("标题") || lower.contains("text") || lower.contains("title") {
            let content = userText
                .replacingOccurrences(of: "添加文字", with: "")
                .replacingOccurrences(of: "写一个标题", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let args: [String: Any] = ["text": content.isEmpty ? "Hello VOO Design" : content, "fontSize": 24.0]
            onToolEvent(.starting(name: "create_text", args: args))
            let result = try await AICanvasTools.executeTool(
                name: "create_text",
                arguments: args,
                document: &document,
                commandManager: commandManager
            )
            onToolEvent(.completed(name: "create_text", result: result))

            let reply = "已为您添加文本图层: “\(content.isEmpty ? "Hello VOO Design" : content)”。"
            for char in reply {
                onText(String(char))
                try? await Task.sleep(nanoseconds: 15_000_000)
            }
            history.append(AIChatMessage(role: "user", content: userText))
            history.append(AIChatMessage(role: "assistant", content: reply))
            return reply
        }

        // 4. Background Removal Intent
        if lower.contains("抠图") || lower.contains("去背景") || lower.contains("remove background") || lower.contains("matting") {
            let args: [String: Any] = [:]
            onToolEvent(.starting(name: "remove_background", args: args))
            let result = try await AICanvasTools.executeTool(
                name: "remove_background",
                arguments: args,
                document: &document,
                commandManager: commandManager
            )
            onToolEvent(.completed(name: "remove_background", result: result))

            let reply = result["error"] != nil ?
                "请先选中一张需要抠图的图像图层。" :
                "已通过端侧 Vision / CoreImage AI 引擎完成高精度抠图。"
            for char in reply {
                onText(String(char))
                try? await Task.sleep(nanoseconds: 15_000_000)
            }
            history.append(AIChatMessage(role: "user", content: userText))
            history.append(AIChatMessage(role: "assistant", content: reply))
            return reply
        }

        // 5. General conversational response
        let reply = "我是 VOO Design 原生 AI 助手。您可以让我为您生成图片、创建几何形状/卡片、添加文字排版，或对选中图层进行端侧 AI 抠图与修复。"
        for char in reply {
            onText(String(char))
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        history.append(AIChatMessage(role: "user", content: userText))
        history.append(AIChatMessage(role: "assistant", content: reply))
        return reply
    }
}
