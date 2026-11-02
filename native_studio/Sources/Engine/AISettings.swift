//
//  AISettings.swift
//  native_studio
//
//  Configuration and persistent credential management for VOO Design AI capabilities.
//  Supports OpenAI, Anthropic, Qwen, DeepSeek, local Ollama, and custom endpoints.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import Foundation

public struct AIProviderConfig: Codable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var baseURL: String
    public var apiKey: String
    public var defaultModel: String
    public var imageModel: String
    public var isCustom: Bool

    public init(
        id: String,
        name: String,
        baseURL: String,
        apiKey: String = "",
        defaultModel: String,
        imageModel: String = "dall-e-3",
        isCustom: Bool = false
    ) {
        self.id = id
        self.name = name
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.defaultModel = defaultModel
        self.imageModel = imageModel
        self.isCustom = isCustom
    }
}

public final class AISettings: @unchecked Sendable {
    public static let shared = AISettings()

    private let defaults = UserDefaults.standard
    private let queue = DispatchQueue(label: "com.voo.design.ai.settings", attributes: .concurrent)

    // Preset Providers matching Voo Design Web
    public static let presetProviders: [AIProviderConfig] = [
        AIProviderConfig(
            id: "openai",
            name: "OpenAI",
            baseURL: "https://api.openai.com/v1",
            defaultModel: "gpt-4o-mini",
            imageModel: "dall-e-3"
        ),
        AIProviderConfig(
            id: "anthropic",
            name: "Anthropic Claude",
            baseURL: "https://api.anthropic.com/v1",
            defaultModel: "claude-3-5-sonnet-20241022",
            imageModel: ""
        ),
        AIProviderConfig(
            id: "qwen",
            name: "Qwen / DashScope",
            baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            defaultModel: "qwen-max",
            imageModel: "wanx-v1"
        ),
        AIProviderConfig(
            id: "deepseek",
            name: "DeepSeek",
            baseURL: "https://api.deepseek.com/v1",
            defaultModel: "deepseek-chat",
            imageModel: ""
        ),
        AIProviderConfig(
            id: "ollama",
            name: "Ollama (Local)",
            baseURL: "http://localhost:11434/v1",
            defaultModel: "llama3.2",
            imageModel: ""
        )
    ]

    private init() {}

    // Active Provider ID
    public var activeProviderId: String {
        get { defaults.string(forKey: "voo.ai.activeProviderId") ?? "openai" }
        set { defaults.set(newValue, forKey: "voo.ai.activeProviderId") }
    }

    // Active LLM Model
    public var activeModel: String {
        get {
            if let custom = defaults.string(forKey: "voo.ai.activeModel"), !custom.isEmpty {
                return custom
            }
            return activeProvider.defaultModel
        }
        set { defaults.set(newValue, forKey: "voo.ai.activeModel") }
    }

    // Active Image Model
    public var activeImageModel: String {
        get {
            if let custom = defaults.string(forKey: "voo.ai.activeImageModel"), !custom.isEmpty {
                return custom
            }
            return activeProvider.imageModel
        }
        set { defaults.set(newValue, forKey: "voo.ai.activeImageModel") }
    }

    // System prompt override
    public var systemPrompt: String {
        get {
            defaults.string(forKey: "voo.ai.systemPrompt") ??
            "You are a design assistant inside a free-form design canvas. " +
            "Create and edit content by calling tools. Generate images with generate_image; " +
            "when the user has selected a layer, pass useSelection so it is used as the reference. " +
            "Keep replies short."
        }
        set { defaults.set(newValue, forKey: "voo.ai.systemPrompt") }
    }

    // Max tool steps per turn
    public var maxSteps: Int {
        get {
            let val = defaults.integer(forKey: "voo.ai.maxSteps")
            return val > 0 ? val : 8
        }
        set { defaults.set(newValue, forKey: "voo.ai.maxSteps") }
    }

    // Style notes
    public var styleNote: String {
        get { defaults.string(forKey: "voo.ai.styleNote") ?? "" }
        set { defaults.set(newValue, forKey: "voo.ai.styleNote") }
    }

    // Active Provider
    public var activeProvider: AIProviderConfig {
        let currentId = activeProviderId
        let saved = getSavedProviders()
        if let found = saved.first(where: { $0.id == currentId }) {
            return found
        }
        if let preset = Self.presetProviders.first(where: { $0.id == currentId }) {
            return preset
        }
        return Self.presetProviders[0]
    }

    // Retrieve or save custom provider configs
    public func getSavedProviders() -> [AIProviderConfig] {
        guard let data = defaults.data(forKey: "voo.ai.providers"),
              let decoded = try? JSONDecoder().decode([AIProviderConfig].self, from: data) else {
            return Self.presetProviders
        }
        return decoded
    }

    public func saveProvider(_ config: AIProviderConfig) {
        var providers = getSavedProviders()
        if let idx = providers.firstIndex(where: { $0.id == config.id }) {
            providers[idx] = config
        } else {
            providers.append(config)
        }
        if let encoded = try? JSONEncoder().encode(providers) {
            defaults.set(encoded, forKey: "voo.ai.providers")
        }
    }

    // API Key accessor for active provider
    public var apiKey: String {
        get {
            // Environment variable fallback if not set in defaults
            let key = activeProvider.apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
            if !key.isEmpty { return key }
            if activeProvider.id == "openai", let env = ProcessInfo.processInfo.environment["OPENAI_API_KEY"], !env.isEmpty {
                return env
            }
            if activeProvider.id == "anthropic", let env = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"], !env.isEmpty {
                return env
            }
            if activeProvider.id == "qwen", let env = ProcessInfo.processInfo.environment["DASHSCOPE_API_KEY"], !env.isEmpty {
                return env
            }
            if activeProvider.id == "deepseek", let env = ProcessInfo.processInfo.environment["DEEPSEEK_API_KEY"], !env.isEmpty {
                return env
            }
            return ""
        }
        set {
            var current = activeProvider
            current.apiKey = newValue
            saveProvider(current)
        }
    }

    public var baseURL: String {
        get { activeProvider.baseURL }
        set {
            var current = activeProvider
            current.baseURL = newValue
            saveProvider(current)
        }
    }
}
