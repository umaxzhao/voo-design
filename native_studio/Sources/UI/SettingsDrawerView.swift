//
//  SettingsDrawerView.swift
//  native_studio
//
//  Native "Settings & Preferences" modal for VOO Design, replicating the web
//  settings drawer (docs/refs/web_20261031/web_settings.png): a dimmed scrim, a
//  1040×760 rounded-24 dialog, a 208pt sidebar with five tabs and a scrolling
//  card-based content pane for General / AI Assistant / Design Systems /
//  AI Providers / Shortcuts.
//
//  Everything is custom-drawn with AppKit / CoreGraphics. A single real
//  NSTextField provides the collaborator-name editing; every other control is
//  painted by this view and exposed to automation through transparent
//  NSButton accessibility proxies (same pattern as OnboardingGuideView).
//
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Settings Tab

/// The five sections of the settings drawer (web `SETTINGS_TABS` order).
public enum SettingsTab: String, CaseIterable, Sendable {
    case general
    case aiAssistant
    case designSystems
    case aiProviders
    case shortcuts

    /// Stable identifier used by `present(tab:)` and the accessibility catalog.
    public var identifier: String { rawValue }
}

// MARK: - Palette

/// Fixed sRGB palette for the settings drawer (deterministic, no OS appearance
/// drift). Values were sampled from the web reference at 1440×900.
private enum SettingsPalette {
    // Chrome
    static let scrim = NSColor(white: 0.0, alpha: 0.70)
    static let dialogBackground = NSColor(hex: "#0a0a0a")
    static let sidebarBackground = NSColor(hex: "#171717")
    static let divider = NSColor(white: 1.0, alpha: 0.10)
    static let hairline = NSColor(white: 1.0, alpha: 0.06)

    // Text
    static let textPrimary = NSColor(white: 0.96, alpha: 1.0)
    static let textSecondary = NSColor(white: 0.90, alpha: 1.0)
    static let textTertiary = NSColor(white: 0.72, alpha: 1.0)
    static let textStrong = NSColor(white: 0.83, alpha: 1.0)
    static let textMuted = NSColor(white: 0.64, alpha: 1.0)
    static let textFaint = NSColor(white: 0.45, alpha: 1.0)

    // Surfaces
    static let card = NSColor(hex: "#171717")
    static let raised = NSColor(hex: "#262626")
    static let input = NSColor(hex: "#191919")
    static let hoverSoft = NSColor(white: 1.0, alpha: 0.04)
    static let hover = NSColor(white: 1.0, alpha: 0.08)
    static let pressed = NSColor(white: 1.0, alpha: 0.12)
    static let activeRow = NSColor(white: 1.0, alpha: 0.08)

    // Card-based General tab (web `SettingsSection` cards, `Switch`, inputs)
    static let cardFill = NSColor(hex: "#171717")
    static let inputFill = NSColor(white: 1.0, alpha: 0.06)
    static let outlineButtonFill = NSColor(white: 1.0, alpha: 0.03)
    static let switchTrackOff = NSColor(white: 1.0, alpha: 0.15)
    static let switchTrackOn = NSColor(white: 1.0, alpha: 0.80)
    static let switchKnob = NSColor(hex: "#171717")

    // Accents
    static let mint = NSColor(hex: "#a7ffd4")
    static let mintBright = NSColor(hex: "#b2ffd6")
    static let mintText = NSColor(hex: "#0c1a13")
    static let purple = NSColor(hex: "#E5B2FF")
    static let statusIdle = NSColor(hex: "#525252")

    // Avatar gradient (pink → coral, like the reference guest avatar)
    static let avatarTop = NSColor(hex: "#ffb1ea")
    static let avatarBottom = NSColor(hex: "#ff543d")
    static let avatarInk = NSColor(hex: "#7d2422")
}

// MARK: - Metrics

/// Geometry constants measured from the web reference (1040×760 dialog at
/// 1440×900 with 48pt of breathing room).
private enum SettingsMetrics {
    static let modalWidth: CGFloat = 1040
    static let modalHeight: CGFloat = 760
    static let minModalWidth: CGFloat = 960
    static let minModalHeight: CGFloat = 600
    static let modalRadius: CGFloat = 24
    static let edgeMargin: CGFloat = 48

    static let headerHeight: CGFloat = 72
    static let closeSize: CGFloat = 48
    static let closeInset: CGFloat = 20
    static let titleInset: CGFloat = 20

    static let sidebarWidth: CGFloat = 208
    static let contentPadding: CGFloat = 24
    static let headingHeight: CGFloat = 16
    static let headingGap: CGFloat = 20

    static let tabPadding: CGFloat = 8
    static let tabGap: CGFloat = 4
    static let tabHeight: CGFloat = 40
    static let tabRadius: CGFloat = 8
    static let tabIconSize: CGFloat = 15
    static let tabIconInset: CGFloat = 12
    static let tabLabelGap: CGFloat = 8

    // General tab content pane (web: content `p-4`, section cards `rounded-xl p-3`,
    // card stack `gap-4`, cards `gap-2`, form fields `gap-1.5`).
    static let contentInset: CGFloat = 16
    static let cardGap: CGFloat = 16
    static let sectionCardRadius: CGFloat = 12
    static let sectionCardPadding: CGFloat = 12
    static let sectionTitleHeight: CGFloat = 16
    static let sectionRowGap: CGFloat = 8
    static let generalInputHeight: CGFloat = 36
    static let generalInputRadius: CGFloat = 12
    static let fieldLabelGap: CGFloat = 6
    static let switchWidth: CGFloat = 28
    static let switchHeight: CGFloat = 16
    static let switchKnobSize: CGFloat = 12
    static let rowHeight: CGFloat = 40
    static let workspaceRowHeight: CGFloat = 44
    static let smallActionHeight: CGFloat = 28

    static let cardRadius: CGFloat = 16
    static let sectionGap: CGFloat = 16
    static let sectionLabelHeight: CGFloat = 14
    static let sectionLabelGap: CGFloat = 16
    static let sectionPadding: CGFloat = 16

    static let profileCardHeight: CGFloat = 167
    static let avatarSize: CGFloat = 40
    static let inputHeight: CGFloat = 32
    static let inputRadius: CGFloat = 12

    static let workspaceCardHeight: CGFloat = 74
    static let workspaceCardRadius: CGFloat = 12
    static let workspaceCardPadding: CGFloat = 14
    static let buttonHeight: CGFloat = 34

    static let languageHeight: CGFloat = 40
    static let languageRadius: CGFloat = 8

    static let agentCardHeight: CGFloat = 84
    static let agentCardGap: CGFloat = 10
    static let agentCardRadius: CGFloat = 12

    static let providerRowHeight: CGFloat = 64
    static let providerRowGap: CGFloat = 10
    static let primaryButtonHeight: CGFloat = 36

    static let shortcutRowHeight: CGFloat = 40
    static let shortcutRowGap: CGFloat = 10
    static let shortcutColumnGap: CGFloat = 16
    static let keycapHeight: CGFloat = 20
}

// MARK: - Localised Copy

private struct SettingsAgentCopy {
    let title: String
    let badge: String?
    let handle: String
    let description: String
    let models: String
    let provider: String
}

private struct SettingsProviderCopy {
    let name: String
    let subtitle: String
    let monogram: String
}

private struct SettingsShortcutCopy {
    let name: String
    let keys: String
}

/// All visible copy for the drawer, in English and Simplified Chinese. Copy is
/// taken from the web i18n sources (`settings-ui-en/zh.js`, `core-en/zh.js`,
/// `en/zh.js`), never raw keys.
private struct SettingsCopy {
    let language: String

    let modalTitle: String
    let closeLabel: String
    let closeHelp: String
    let tabTitles: [String]

    // General → Profile card (web settings_profile.jsx).
    let profileTitle: String
    let guestName: String
    let guestBadge: String
    let continueWithGoogle: String
    let continueWithGitHub: String
    let oauthNote: String
    let orLabel: String
    let emailLabel: String
    let emailPlaceholder: String
    let passwordLabel: String
    let passwordPlaceholder: String
    let signInLabel: String
    let noAccountPrefix: String
    let signUpLabel: String
    let nameFieldLabel: String
    let namePlaceholder: String

    // General → Appearance card (web AppearanceSettingsSection + AutoSaveRow).
    let appearanceTitle: String
    let lightInterfaceLabel: String
    let lightInterfaceHint: String
    let autoSaveDraftsLabel: String
    let autoSaveDraftsHint: String

    // General → Canvas card (web CanvasSettingsSection; native keeps workspace
    // and language rows here so no existing control is lost).
    let canvasTitle: String
    let showRulersLabel: String
    let rulersHint: String
    let workspaceTitle: String
    let workspaceBadge: String
    let changeDirectory: String
    let rescan: String
    let languageTitle: String
    let languageHint: String
    let chineseLabel: String
    let englishLabel: String

    // Design Systems tab (native empty state; no design-system model yet).
    let designSystemsEmptyTitle: String
    let designSystemsEmptyHint: String

    let agentSectionLabel: String
    let agents: [SettingsAgentCopy]
    let defaultAgentLabel: String

    let providersSectionLabel: String
    let providersHint: String
    let providers: [SettingsProviderCopy]
    let notConfigured: String

    let setupSectionLabel: String
    let onboardingHint: String
    let onboardingButton: String

    let shortcutsSectionLabel: String
    let shortcutsHint: String
    let shortcuts: [SettingsShortcutCopy]

    static let sharedShortcuts: [SettingsShortcutCopy] = [
        SettingsShortcutCopy(name: "Save current project (.voo)", keys: "⌘S / Ctrl+S"),
        SettingsShortcutCopy(name: "Save as a new .voo file", keys: "⌘⇧S / Ctrl+Shift+S"),
        SettingsShortcutCopy(name: "Open a local .voo project", keys: "⌘O / Ctrl+O"),
        SettingsShortcutCopy(name: "New design file", keys: "⌘N / Ctrl+N"),
        SettingsShortcutCopy(name: "Select tool / move layers", keys: "V"),
        SettingsShortcutCopy(name: "Pen path tool (Bezier curves)", keys: "P"),
        SettingsShortcutCopy(name: "Rich text input and typesetting", keys: "T"),
        SettingsShortcutCopy(name: "Rectangle / ellipse tool", keys: "R / O"),
        SettingsShortcutCopy(name: "Pan the canvas", keys: "Space + drag"),
        SettingsShortcutCopy(name: "Zoom the canvas", keys: "⌘ + scroll"),
        SettingsShortcutCopy(name: "Undo / redo", keys: "⌘Z / ⌘⇧Z"),
        SettingsShortcutCopy(name: "Group / ungroup", keys: "⌘G / ⌘⇧G")
    ]

    static let english = SettingsCopy(
        language: "en",
        modalTitle: "SETTINGS & PREFERENCES",
        closeLabel: "Close",
        closeHelp: "Close settings (Esc)",
        tabTitles: ["General", "AI Assistant", "Design Systems", "AI Providers", "Shortcuts"],
        profileTitle: "Profile",
        guestName: "Guest",
        guestBadge: "Local guest profile",
        continueWithGoogle: "Continue with Google",
        continueWithGitHub: "Continue with GitHub",
        oauthNote: "Google and GitHub sign-in are not enabled in Voo Cloud yet.",
        orLabel: "or",
        emailLabel: "Email",
        emailPlaceholder: "name@example.com",
        passwordLabel: "Password",
        passwordPlaceholder: "Min. 6 characters",
        signInLabel: "Sign In",
        noAccountPrefix: "No account?",
        signUpLabel: "Sign up",
        nameFieldLabel: "Display name",
        namePlaceholder: "Your name",
        appearanceTitle: "Appearance",
        lightInterfaceLabel: "Light interface",
        lightInterfaceHint: "Switch the panels and chrome to a light theme. The canvas keeps its own colors.",
        autoSaveDraftsLabel: "Auto-save edit drafts",
        autoSaveDraftsHint: "Keep an additional local recovery copy while editing, so you can restore changes after a crash.",
        canvasTitle: "Canvas",
        showRulersLabel: "Show rulers",
        rulersHint: "Hidden by default. You can also toggle rulers with Shift+R (⇧R).",
        workspaceTitle: "Project Workspace",
        workspaceBadge: "[macOS Native]",
        changeDirectory: "Change Directory",
        rescan: "Rescan",
        languageTitle: "Language",
        languageHint: "Select the interface language for the canvas editor.",
        chineseLabel: "简体中文",
        englishLabel: "English",
        designSystemsEmptyTitle: "No design systems yet",
        designSystemsEmptyHint: "Saved component libraries and token sets will appear here.",
        agentSectionLabel: "LOCAL AGENT",
        agents: [
            SettingsAgentCopy(
                title: "Claude Code",
                badge: "Recommended · Default",
                handle: "@anthropic-ai/claude-code",
                description: "Anthropic's official coding agent for high-fidelity UI recreation, context linking and precise refactors.",
                models: "Models: Claude 3.7 Sonnet / Opus",
                provider: "claude"
            ),
            SettingsAgentCopy(
                title: "OpenAI Codex",
                badge: nil,
                handle: "@openai/codex",
                description: "OpenAI's coding agent for complex layer logic, data transforms and scheduled tool calls.",
                models: "Models: GPT-4o / o3-mini",
                provider: "codex"
            ),
            SettingsAgentCopy(
                title: "Google Antigravity CLI",
                badge: "Multi-agent native",
                handle: "@google/antigravity-cli (agy)",
                description: "Google's multi-agent orchestration engine for deep canvas understanding and end-to-end collaboration.",
                models: "Models: Gemini 2.5 Flash / Pro",
                provider: "antigravity"
            ),
            SettingsAgentCopy(
                title: "OpenCode CLI",
                badge: nil,
                handle: "@opencode/cli",
                description: "Open-source coding agent supporting multi-model pipelines and local filesystem context.",
                models: "Models: Configurable / Local",
                provider: "opencode"
            ),
            SettingsAgentCopy(
                title: "DeepSeek Harness",
                badge: "Native Connector",
                handle: "DeepSeek Harness desktop app",
                description: "DeepSeek Harness integration via high-performance MCP socket connector.",
                models: "Models: DeepSeek Chat / Reasoner (R1)",
                provider: "deepseekHarness"
            )
        ],
        defaultAgentLabel: "DEFAULT AGENT",
        providersSectionLabel: "PROVIDERS",
        providersHint: "API keys stay on this machine. Add or rotate keys here; the agent reads them from the local vault.",
        providers: [
            SettingsProviderCopy(name: "Anthropic", subtitle: "Claude API · claude-opus-4-5", monogram: "A"),
            SettingsProviderCopy(name: "OpenAI", subtitle: "GPT-4o / o3-mini API", monogram: "O"),
            SettingsProviderCopy(name: "Google", subtitle: "Gemini 2.5 Flash / Pro API", monogram: "G")
        ],
        notConfigured: "Not configured",
        setupSectionLabel: "GUIDED SETUP",
        onboardingHint: "Re-run the guided setup to re-detect your workspace and local AI CLI bridge.",
        onboardingButton: "Re-run onboarding",
        shortcutsSectionLabel: "KEYBOARD SHORTCUTS",
        shortcutsHint: "Essential editor shortcuts — the same reference as the welcome dashboard.",
        shortcuts: SettingsCopy.sharedShortcuts
    )

    static let chinese = SettingsCopy(
        language: "zh",
        modalTitle: "设置与偏好",
        closeLabel: "关闭",
        closeHelp: "关闭设置 (Esc)",
        tabTitles: ["常规偏好", "AI 助手", "设计系统", "AI 供应商", "快捷键速查"],
        profileTitle: "个人资料",
        guestName: "访客",
        guestBadge: "本地访客资料",
        continueWithGoogle: "通过Google登录",
        continueWithGitHub: "通过GitHub登录",
        oauthNote: "Google 和 GitHub 登录尚未在 Voo Cloud 后台启用。",
        orLabel: "或",
        emailLabel: "邮箱",
        emailPlaceholder: "name@example.com",
        passwordLabel: "密码",
        passwordPlaceholder: "至少6位",
        signInLabel: "登录",
        noAccountPrefix: "还没有账号？",
        signUpLabel: "注册",
        nameFieldLabel: "显示名称",
        namePlaceholder: "你的昵称",
        appearanceTitle: "外观",
        lightInterfaceLabel: "浅色界面",
        lightInterfaceHint: "将面板和界面切换为浅色；画布保持自身颜色。",
        autoSaveDraftsLabel: "自动保存编辑草稿",
        autoSaveDraftsHint: "编辑时额外保留一份本地恢复副本，便于在意外退出后还原改动。",
        canvasTitle: "画布",
        showRulersLabel: "显示标尺",
        rulersHint: "默认隐藏。也可按 Shift+R（⇧R）切换标尺。",
        workspaceTitle: "项目工作区",
        workspaceBadge: "[macOS 原生]",
        changeDirectory: "更换目录",
        rescan: "重新扫描",
        languageTitle: "语言",
        languageHint: "选择画布编辑器的界面显示语言。",
        chineseLabel: "简体中文",
        englishLabel: "English",
        designSystemsEmptyTitle: "暂无设计系统",
        designSystemsEmptyHint: "已保存的组件库与 Token 集将显示在这里。",
        agentSectionLabel: "本地智能体",
        agents: [
            SettingsAgentCopy(
                title: "Claude Code",
                badge: "推荐 · 默认",
                handle: "@anthropic-ai/claude-code",
                description: "Anthropic 官方代码智能体，擅长高质量 UI 设计还原、上下文关联与精细重构。",
                models: "支持模型: Claude 3.7 Sonnet / Opus",
                provider: "claude"
            ),
            SettingsAgentCopy(
                title: "OpenAI Codex",
                badge: nil,
                handle: "@openai/codex",
                description: "OpenAI 代码智能体，支持复杂逻辑图层编排、数据流转换与函数调用调度。",
                models: "支持模型: GPT-4o / o3-mini",
                provider: "codex"
            ),
            SettingsAgentCopy(
                title: "Google Antigravity CLI",
                badge: "多 Agent 原生",
                handle: "@google/antigravity-cli (agy)",
                description: "Google 先锋多 Agent 编排引擎，支持画布节点深度理解与端到端协同。",
                models: "支持模型: Gemini 2.5 Flash / Pro",
                provider: "antigravity"
            ),
            SettingsAgentCopy(
                title: "OpenCode CLI",
                badge: nil,
                handle: "@opencode/cli",
                description: "开源代码智能体，支持多模型流水线与本地上下文执行。",
                models: "支持模型: 自定义 / 本地模型",
                provider: "opencode"
            ),
            SettingsAgentCopy(
                title: "DeepSeek Harness",
                badge: "原生连接器",
                handle: "DeepSeek Harness 桌面应用",
                description: "通过高性能 MCP 接口直连 DeepSeek Harness 智能体，支持双向画布通信。",
                models: "支持模型: DeepSeek Chat / Reasoner (R1)",
                provider: "deepseekHarness"
            )
        ],
        defaultAgentLabel: "默认智能体",
        providersSectionLabel: "AI 服务商",
        providersHint: "API 密钥仅保存在本机。在此添加或轮换密钥，智能体会从本地密钥库读取。",
        providers: [
            SettingsProviderCopy(name: "Anthropic", subtitle: "Claude API · claude-opus-4-5", monogram: "A"),
            SettingsProviderCopy(name: "OpenAI", subtitle: "GPT-4o / o3-mini API", monogram: "O"),
            SettingsProviderCopy(name: "Google", subtitle: "Gemini 2.5 Flash / Pro API", monogram: "G")
        ],
        notConfigured: "未配置",
        setupSectionLabel: "配置引导",
        onboardingHint: "重新运行引导以重新检测工作区与本地 AI CLI 桥接。",
        onboardingButton: "重新运行新手引导",
        shortcutsSectionLabel: "键盘快捷键",
        shortcutsHint: "编辑器常用快捷键 — 与欢迎页保持一致。",
        shortcuts: SettingsCopy.sharedShortcuts
    )

    static func forLanguage(_ language: String) -> SettingsCopy {
        language == "zh" ? chinese : english
    }
}

// MARK: - Glyphs

/// Small vector glyphs used by the settings drawer. Anything the shared
/// `VooIconFactory` already provides is reused; the rest is drawn here so the
/// drawer stays self-contained.
private enum SettingsGlyph {
    case sliders
    case sparkle
    case keyboard
    case close
    case folder
    case folderOpen
    case refresh
    case check
    case claude
    case codex
    case antigravity
    case lock
    case palette

    func draw(in rect: CGRect, color: NSColor, strokeWidth: CGFloat = 1.7) {
        switch self {
        case .sliders:
            VooIconFactory.drawSliders(in: rect, color: color, strokeWidth: strokeWidth)
        case .sparkle:
            VooIconFactory.drawSparkles(in: rect, color: color, strokeWidth: strokeWidth)
        case .keyboard:
            VooIconFactory.drawKeyboard(in: rect, color: color, strokeWidth: strokeWidth)
        case .close:
            VooIconFactory.drawClose(in: rect, color: color, strokeWidth: strokeWidth)
        case .folder:
            VooIconFactory.drawFolder(in: rect, color: color, strokeWidth: strokeWidth)
        case .folderOpen:
            VooIconFactory.drawFolderOpen(in: rect, color: color, strokeWidth: strokeWidth)
        case .refresh:
            VooIconFactory.drawRefresh(in: rect, color: color, strokeWidth: strokeWidth)
        case .check:
            VooIconFactory.drawCheckmark(in: rect, color: color, strokeWidth: strokeWidth)
        case .claude:
            Self.drawClaudeMark(in: rect, color: color, strokeWidth: strokeWidth)
        case .codex:
            Self.drawCodexMark(in: rect, color: color, strokeWidth: strokeWidth)
        case .antigravity:
            Self.drawAntigravityMark(in: rect, color: color, strokeWidth: strokeWidth)
        case .lock:
            VooIconFactory.drawLock(in: rect, color: color, strokeWidth: strokeWidth)
        case .palette:
            Self.drawPalette(in: rect, color: color, strokeWidth: strokeWidth)
        }
    }

    /// Painter's-palette glyph (web `IconPalette`) used by the Design Systems tab.
    private static func drawPalette(in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        withCanvas(rect) { ctx in
            strokeStyle(ctx, color, strokeWidth)
            ctx.strokeEllipse(in: CGRect(x: 3.4, y: 4.4, width: 17.2, height: 15.2))
            ctx.setFillColor(color.cgColor)
            for point in [CGPoint(x: 8.6, y: 9.4), CGPoint(x: 12.0, y: 7.4), CGPoint(x: 15.4, y: 9.4)] {
                ctx.fillEllipse(in: CGRect(x: point.x - 1.4, y: point.y - 1.4,
                                           width: 2.8, height: 2.8))
            }
            ctx.fillEllipse(in: CGRect(x: 15.0, y: 14.0, width: 3.4, height: 3.4))
        }
    }

    private static func withCanvas(_ rect: CGRect, _ body: (CGContext) -> Void) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        let scale = min(rect.width, rect.height) / 24.0
        ctx.translateBy(x: rect.origin.x, y: rect.origin.y + rect.height)
        ctx.scaleBy(x: scale, y: -scale)
        body(ctx)
        ctx.restoreGState()
    }

    private static func strokeStyle(_ ctx: CGContext, _ color: NSColor, _ width: CGFloat) {
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(max(0.7, width))
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
    }









    private static func drawRefresh(in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        withCanvas(rect) { ctx in
            strokeStyle(ctx, color, strokeWidth)
            let center = CGPoint(x: 12, y: 12)
            let radius: CGFloat = 8.2
            let gapStart = 150.0 * Double.pi / 180.0
            let sweep = 295.0 * Double.pi / 180.0
            let steps = 40
            let arc = CGMutablePath()
            for index in 0...steps {
                let angle = gapStart + sweep * Double(index) / Double(steps)
                let point = CGPoint(
                    x: center.x + radius * CGFloat(cos(angle)),
                    y: center.y + radius * CGFloat(sin(angle))
                )
                if index == 0 { arc.move(to: point) } else { arc.addLine(to: point) }
            }
            ctx.addPath(arc)
            ctx.strokePath()

            let endAngle = gapStart + sweep
            let tip = CGPoint(
                x: center.x + radius * CGFloat(cos(endAngle)),
                y: center.y + radius * CGFloat(sin(endAngle))
            )
            let radial = CGPoint(x: CGFloat(cos(endAngle)), y: CGFloat(sin(endAngle)))
            let tangent = CGPoint(x: -radial.y, y: radial.x)
            let normal = CGPoint(x: radial.x, y: radial.y)
            let head = CGMutablePath()
            head.move(to: CGPoint(
                x: tip.x - tangent.x * 4.2 + normal.x * 2.8,
                y: tip.y - tangent.y * 4.2 + normal.y * 2.8
            ))
            head.addLine(to: tip)
            head.addLine(to: CGPoint(
                x: tip.x - tangent.x * 4.2 - normal.x * 2.8,
                y: tip.y - tangent.y * 4.2 - normal.y * 2.8
            ))
            ctx.addPath(head)
            ctx.strokePath()
        }
    }

    private static func drawCheck(in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        withCanvas(rect) { ctx in
            strokeStyle(ctx, color, strokeWidth)
            let path = CGMutablePath()
            path.move(to: CGPoint(x: 5, y: 12.5))
            path.addLine(to: CGPoint(x: 10, y: 17.5))
            path.addLine(to: CGPoint(x: 19, y: 7))
            ctx.addPath(path)
            ctx.strokePath()
        }
    }

    private static func drawClaudeMark(in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        withCanvas(rect) { ctx in
            strokeStyle(ctx, color, strokeWidth)
            let center = CGPoint(x: 12, y: 12)
            let path = CGMutablePath()
            for index in 0..<6 {
                let angle = Double(index) * Double.pi / 3.0 - Double.pi / 2.0
                path.move(to: CGPoint(
                    x: center.x + CGFloat(cos(angle)) * 3.2,
                    y: center.y + CGFloat(sin(angle)) * 3.2
                ))
                path.addLine(to: CGPoint(
                    x: center.x + CGFloat(cos(angle)) * 8.4,
                    y: center.y + CGFloat(sin(angle)) * 8.4
                ))
            }
            ctx.addPath(path)
            ctx.strokePath()
            ctx.setFillColor(color.cgColor)
            ctx.fillEllipse(in: CGRect(x: 10.4, y: 10.4, width: 3.2, height: 3.2))
        }
    }

    private static func drawCodexMark(in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        withCanvas(rect) { ctx in
            strokeStyle(ctx, color, strokeWidth)
            let path = CGMutablePath()
            path.move(to: CGPoint(x: 9, y: 5.5))
            path.addLine(to: CGPoint(x: 3.8, y: 12))
            path.addLine(to: CGPoint(x: 9, y: 18.5))
            path.move(to: CGPoint(x: 15, y: 5.5))
            path.addLine(to: CGPoint(x: 20.2, y: 12))
            path.addLine(to: CGPoint(x: 15, y: 18.5))
            ctx.addPath(path)
            ctx.strokePath()
        }
    }

    private static func drawAntigravityMark(in rect: CGRect, color: NSColor, strokeWidth: CGFloat) {
        withCanvas(rect) { ctx in
            strokeStyle(ctx, color, strokeWidth)
            let diamond = CGMutablePath()
            diamond.move(to: CGPoint(x: 12, y: 3.2))
            diamond.addLine(to: CGPoint(x: 20.6, y: 12))
            diamond.addLine(to: CGPoint(x: 12, y: 20.8))
            diamond.addLine(to: CGPoint(x: 3.4, y: 12))
            diamond.closeSubpath()
            ctx.addPath(diamond)
            ctx.strokePath()

            ctx.setFillColor(color.cgColor)
            ctx.fillEllipse(in: CGRect(x: 10.6, y: 10.6, width: 2.8, height: 2.8))
        }
    }
}

// MARK: - Accessibility Proxy

/// Transparent NSButton used purely as an accessibility / automation proxy for
/// the custom-drawn controls. The overlay's `hitTest` always resolves to the
/// overlay itself (except for the name field), so this button never draws or
/// receives pointer events.
private final class SettingsProxyButton: NSButton {

    var onActivate: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        bezelStyle = .regularSquare
        title = ""
        focusRingType = .none
        isTransparent = true
        setAccessibilityElement(true)
        target = self
        action = #selector(handleClick)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    @objc private func handleClick() {
        onActivate?()
    }

    override func accessibilityPerformPress() -> Bool {
        onActivate?()
        return true
    }

    override func draw(_ dirtyRect: NSRect) {
        // Intentionally empty: visuals are painted by SettingsDrawerView.
    }
}

// MARK: - Drawing Helpers

private func settingsRoundedPath(_ rect: CGRect, radius: CGFloat) -> CGPath {
    let clamped = max(0, min(radius, min(rect.width, rect.height) / 2.0))
    return CGPath(roundedRect: rect, cornerWidth: clamped, cornerHeight: clamped, transform: nil)
}

private func settingsFillRounded(_ rect: CGRect, radius: CGFloat, color: NSColor) {
    guard rect.width > 0, rect.height > 0, let ctx = NSGraphicsContext.current?.cgContext else { return }
    ctx.setFillColor(color.cgColor)
    ctx.addPath(settingsRoundedPath(rect, radius: radius))
    ctx.fillPath()
}

private func settingsStrokeRounded(_ rect: CGRect, radius: CGFloat, color: NSColor, lineWidth: CGFloat) {
    guard rect.width > 0, rect.height > 0, let ctx = NSGraphicsContext.current?.cgContext else { return }
    ctx.setStrokeColor(color.cgColor)
    ctx.setLineWidth(lineWidth)
    ctx.addPath(settingsRoundedPath(rect, radius: radius))
    ctx.strokePath()
}

private func settingsTextSize(_ text: String, font: NSFont, kern: CGFloat = 0) -> CGSize {
    var attributes: [NSAttributedString.Key: Any] = [.font: font]
    if kern != 0 { attributes[.kern] = kern }
    return NSAttributedString(string: text, attributes: attributes).size()
}

private func settingsDrawText(
    _ text: String,
    in rect: CGRect,
    font: NSFont,
    color: NSColor,
    alignment: NSTextAlignment = .left,
    truncating: Bool = false,
    kern: CGFloat = 0,
    verticalNudge: CGFloat = 0
) {
    let style = NSMutableParagraphStyle()
    style.alignment = alignment
    style.lineBreakMode = truncating ? .byTruncatingTail : .byClipping
    var attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: style
    ]
    if kern != 0 { attributes[.kern] = kern }
    let attributed = NSAttributedString(string: text, attributes: attributes)
    let size = attributed.size()
    let height = min(rect.height, ceil(size.height))
    let drawRect = CGRect(
        x: rect.minX,
        y: rect.midY - height / 2.0 + verticalNudge,
        width: rect.width,
        height: height
    )
    if truncating {
        attributed.draw(with: drawRect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine])
    } else {
        attributed.draw(in: drawRect)
    }
}

private func settingsDrawParagraph(
    _ text: String,
    in rect: CGRect,
    font: NSFont,
    color: NSColor,
    lineHeight: CGFloat,
    alignment: NSTextAlignment = .left
) {
    let style = NSMutableParagraphStyle()
    style.alignment = alignment
    style.lineBreakMode = .byWordWrapping
    style.minimumLineHeight = lineHeight
    style.maximumLineHeight = lineHeight
    let attributed = NSAttributedString(
        string: text,
        attributes: [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style
        ]
    )
    attributed.draw(
        with: rect,
        options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine]
    )
}

// MARK: - Settings Drawer

/// Full-window settings overlay. Attach it above the editor shell, call
/// `present(tab:)`, and wire the callbacks to the window controller.
public final class SettingsDrawerView: NSView {

    // MARK: Defaults keys

    public static let languageDefaultsKey = "voo.locale"
    public static let collabNameDefaultsKey = "voo.collab.name"
    public static let agentProviderDefaultsKey = "voo.agent.llmProvider"
    /// Mirrors the web canvas ruler preference (`voo.editor.showRulers`), default off.
    public static let showRulersDefaultsKey = "voo.editor.showRulers"
    /// Mirrors the web editor theme preference (`voo.editor.theme`, "light"/"dark").
    public static let editorThemeDefaultsKey = "voo.editor.theme"
    /// Mirrors the web auto-save-drafts preference (`voo.editor.autoSaveDrafts`).
    public static let autoSaveDraftsDefaultsKey = "voo.editor.autoSaveDrafts"

    public static let preferredModalSize = NSSize(
        width: SettingsMetrics.modalWidth,
        height: SettingsMetrics.modalHeight
    )
    public static let minimumModalSize = NSSize(
        width: SettingsMetrics.minModalWidth,
        height: SettingsMetrics.minModalHeight
    )

    // MARK: Callbacks

    /// Invoked for user-initiated dismissal (close button, Esc key, scrim click).
    public var onClose: (() -> Void)?
    /// Invoked by the "Re-run onboarding" button in AI Providers.
    public var onOpenOnboarding: (() -> Void)?
    /// Invoked by the "Change Directory" button.
    public var onWorkspaceChange: (() -> Void)?
    /// Invoked by the "Rescan" button.
    public var onRescan: (() -> Void)?
    /// Invoked after the user changes the language (already persisted).
    public var onLanguageChange: ((String) -> Void)?
    /// Invoked after the "Show rulers" switch is toggled (already persisted).
    public var onToggleRulers: ((Bool) -> Void)?
    /// Invoked after the "Light interface" switch is toggled (already persisted).
    public var onToggleLightInterface: ((Bool) -> Void)?
    /// Invoked after the "Auto-save edit drafts" switch is toggled (already persisted).
    public var onToggleAutoSaveDrafts: ((Bool) -> Void)?
    /// Invoked when the user selects a different AI Agent / Provider.
    public var onAgentChange: ((String) -> Void)?

    // MARK: Public state

    public private(set) var activeTab: SettingsTab = .general

    /// Current drawer language, `"en"` or `"zh"`. Persisted to UserDefaults.
    public var currentLanguage: String {
        get { languageCode }
        set { applyLanguage(newValue, notify: true) }
    }

    public var isPresented: Bool { !isHidden }

    /// Optional size override for hosts that want a different dialog footprint
    /// than the measured reference (1040×760). The value is still clamped to
    /// the available window area and the 960×600 minimum.
    public var modalSizeOverride: NSSize?

    /// Collaborator display name (persisted to `voo.collab.name`).
    public var collaboratorName: String {
        get { nameField.stringValue }
        set {
            nameField.stringValue = newValue
            UserDefaults.standard.set(newValue, forKey: SettingsDrawerView.collabNameDefaultsKey)
            needsDisplay = true
        }
    }

    // MARK: Private state

    private enum ControlID: Hashable {
        case close
        case tab(SettingsTab)
        case language(String)
        case workspaceChange
        case rescan
        case agent(Int)
        case agentSegment(Int)
        case onboarding
        case showRulers
        case lightInterface
        case autoSaveDrafts
    }

    private var languageCode: String = "en"
    private var copy: SettingsCopy = .english
    private var selectedAgentIndex: Int = 0
    private var showsRulers: Bool = false
    private var lightInterface: Bool = false
    private var autoSaveDrafts: Bool = false
    /// Vertical scroll of the tab content pane (0 = top, positive = content
    /// moved up to reveal lower sections).
    private var contentScrollOffset: CGFloat = 0
    private var hoveredControl: ControlID?
    private var pressedControl: ControlID?
    private var scrimPress = false
    private var nameFieldEditing = false
    private var keyMonitor: Any?
    private var trackingAreaReference: NSTrackingArea?
    private var defaultsObserver: NSObjectProtocol?

    private var proxies: [ControlID: SettingsProxyButton] = [:]

    /// Backdrop blur sits *behind* this overlay (a sibling in the host view) so
    /// the custom-drawn chrome stays crisp above it.
    private lazy var blurBackdrop: NSVisualEffectView = {
        let view = NSVisualEffectView(frame: .zero)
        view.material = .hudWindow
        view.blendingMode = .withinWindow
        view.state = .active
        view.autoresizingMask = [.width, .height]
        return view
    }()

    private lazy var nameField: NSTextField = {
        let field = NSTextField(frame: .zero)
        field.isBordered = false
        field.isBezeled = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.isEditable = true
        field.isSelectable = true
        field.font = ThemeFonts.system(size: 12)
        field.textColor = SettingsPalette.textSecondary
        field.usesSingleLineMode = true
        field.lineBreakMode = .byTruncatingTail
        field.cell?.wraps = false
        field.cell?.isScrollable = true
        field.delegate = self
        field.target = self
        field.action = #selector(handleNameFieldAction)
        field.setAccessibilityElement(true)
        field.setAccessibilityRole(.textField)
        field.setAccessibilityIdentifier("Settings.NameField")
        field.stringValue = UserDefaults.standard.string(forKey: SettingsDrawerView.collabNameDefaultsKey) ?? ""
        return field
    }()

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        wantsLayer = true
        layerContentsRedrawPolicy = .onSetNeedsDisplay
        autoresizingMask = [.width, .height]

        setAccessibilityElement(true)
        setAccessibilityRole(.group)
        setAccessibilityIdentifier("Settings.Drawer")
        setAccessibilityLabel("Settings & Preferences")

        languageCode = Self.normalizedLanguage(
            UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en"
        )
        copy = SettingsCopy.forLanguage(languageCode)

        if let storedAgent = UserDefaults.standard.string(forKey: SettingsDrawerView.agentProviderDefaultsKey) {
            selectedAgentIndex = Self.agentIndex(forProvider: storedAgent)
        }
        showsRulers = UserDefaults.standard.bool(forKey: SettingsDrawerView.showRulersDefaultsKey)
        lightInterface = UserDefaults.standard.string(forKey: SettingsDrawerView.editorThemeDefaultsKey) == "light"
        autoSaveDrafts = UserDefaults.standard.bool(forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)
        // Live-sync with ⇧R / the zoom-bar toggle and with the web settings keys
        // (all of them persist to UserDefaults).
        defaultsObserver = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            let nextRulers = UserDefaults.standard.bool(forKey: SettingsDrawerView.showRulersDefaultsKey)
            let nextLight = UserDefaults.standard.string(forKey: SettingsDrawerView.editorThemeDefaultsKey) == "light"
            let nextAutoSave = UserDefaults.standard.bool(forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)
            guard nextRulers != self.showsRulers
                || nextLight != self.lightInterface
                || nextAutoSave != self.autoSaveDrafts else { return }
            self.showsRulers = nextRulers
            self.lightInterface = nextLight
            self.autoSaveDrafts = nextAutoSave
            self.refreshProxyLabels()
            self.needsDisplay = true
        }

        addSubview(nameField)
        nameField.isHidden = true

        buildAccessibilityProxies()
        updateLocalizedLabels()
        isHidden = true
    }

    deinit {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
        }
        if let defaultsObserver {
            NotificationCenter.default.removeObserver(defaultsObserver)
        }
        blurBackdrop.removeFromSuperview()
    }

    public override var isHidden: Bool {
        didSet {
            blurBackdrop.isHidden = isHidden
        }
    }

    public override func viewWillMove(toSuperview newSuperview: NSView?) {
        // Keep the backdrop attached only while this overlay lives in the same host.
        if newSuperview !== superview {
            blurBackdrop.removeFromSuperview()
        }
        super.viewWillMove(toSuperview: newSuperview)
    }

    public override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        syncBlurBackdrop()
    }

    private func syncBlurBackdrop() {
        guard let superview else {
            blurBackdrop.removeFromSuperview()
            return
        }
        if blurBackdrop.superview !== superview {
            blurBackdrop.removeFromSuperview()
            superview.addSubview(blurBackdrop, positioned: .below, relativeTo: self)
        }
        blurBackdrop.frame = frame
        blurBackdrop.isHidden = isHidden
        blurBackdrop.needsDisplay = true
    }

    // MARK: Presentation API

    /// Shows the overlay and selects the requested tab. Unknown tab names fall
    /// back to `general`.
    public func present(tab: String = "general") {
        selectTab(Self.tab(for: tab))

        // Pick up any values changed elsewhere while the drawer was closed.
        if let storedLanguage = UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) {
            applyLanguage(storedLanguage, notify: false)
        }
        nameField.stringValue = UserDefaults.standard.string(forKey: SettingsDrawerView.collabNameDefaultsKey) ?? ""
        if let storedAgent = UserDefaults.standard.string(forKey: SettingsDrawerView.agentProviderDefaultsKey) {
            selectedAgentIndex = Self.agentIndex(forProvider: storedAgent)
        }
        // Re-read the editor prefs so an ⇧R / zoom-bar toggle or a theme change
        // made while the drawer was closed shows up immediately.
        showsRulers = UserDefaults.standard.bool(forKey: SettingsDrawerView.showRulersDefaultsKey)
        lightInterface = UserDefaults.standard.string(forKey: SettingsDrawerView.editorThemeDefaultsKey) == "light"
        autoSaveDrafts = UserDefaults.standard.bool(forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)
        refreshProxyLabels()

        hoveredControl = nil
        pressedControl = nil
        scrimPress = false
        isHidden = false
        alphaValue = 1.0
        if let superview {
            superview.addSubview(self, positioned: .above, relativeTo: nil)
        }
        syncBlurBackdrop()
        installKeyMonitorIfNeeded()
        updateAccessibilityElementFrames()
        window?.invalidateCursorRects(for: self)
        needsLayout = true
        needsDisplay = true

        if let window {
            window.makeFirstResponder(self)
        }
    }

    /// Hides the overlay. Does not call `onClose`; use the close control / Esc
    /// for user-initiated dismissal.
    public func dismiss() {
        if let editor = nameField.currentEditor(), editor.window != nil {
            window?.makeFirstResponder(nil)
        }
        nameFieldEditing = false
        hoveredControl = nil
        pressedControl = nil
        scrimPress = false
        isHidden = true
        blurBackdrop.isHidden = true
        removeKeyMonitor()
        needsDisplay = true
    }

    /// Switches tabs without presenting the drawer.
    public func selectTab(_ tab: SettingsTab) {
        if tab != .general, nameField.currentEditor() != nil {
            window?.makeFirstResponder(self)
        }
        activeTab = tab
        contentScrollOffset = 0
        hoveredControl = nil
        pressedControl = nil
        updateAccessibilityElementFrames()
        window?.invalidateCursorRects(for: self)
        needsLayout = true
        needsDisplay = true
    }

    // MARK: Persistence

    private static func normalizedLanguage(_ raw: String) -> String {
        let lowered = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return lowered.hasPrefix("zh") ? "zh" : "en"
    }

    private static func tab(for raw: String) -> SettingsTab {
        switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "general", "profile", "":
            return .general
        case "aiassistant", "assistant", "ai_assistant", "agent", "ai-assistant":
            return .aiAssistant
        case "designsystems", "design-systems", "design_systems", "design":
            return .designSystems
        case "aiproviders", "providers", "ai_providers", "ai-providers":
            return .aiProviders
        case "shortcuts", "shortcut", "keys":
            return .shortcuts
        default:
            return .general
        }
    }

    private static func agentIndex(forProvider provider: String) -> Int {
        switch provider {
        case "claude", "claude-cli", "anthropic": return 0
        case "codex", "cli", "openai": return 1
        case "antigravity", "antigravity-cli", "google", "gemini": return 2
        default: return 0
        }
    }

    private func applyLanguage(_ raw: String, notify: Bool) {
        let normalized = Self.normalizedLanguage(raw)
        if normalized == languageCode && copy.language == normalized {
            return
        }
        languageCode = normalized
        copy = SettingsCopy.forLanguage(normalized)
        UserDefaults.standard.set(normalized, forKey: SettingsDrawerView.languageDefaultsKey)
        updateLocalizedLabels()
        updateAccessibilityElementFrames()
        needsLayout = true
        needsDisplay = true
        if notify {
            onLanguageChange?(normalized)
        }
    }

    private func updateLocalizedLabels() {
        setAccessibilityLabel(copy.modalTitle.capitalized)
        nameField.placeholderAttributedString = NSAttributedString(
            string: copy.namePlaceholder,
            attributes: [
                .font: ThemeFonts.system(size: 12),
                .foregroundColor: SettingsPalette.textMuted
            ]
        )
        nameField.setAccessibilityLabel(copy.namePlaceholder)
        refreshProxyLabels()
    }

    private func refreshProxyLabels() {
        proxies[.close]?.setAccessibilityLabel(copy.closeLabel)
        proxies[.close]?.setAccessibilityHelp(copy.closeHelp)
        proxies[.close]?.toolTip = copy.closeHelp

        for (index, tab) in SettingsTab.allCases.enumerated() {
            proxies[.tab(tab)]?.setAccessibilityLabel(copy.tabTitles[index])
            proxies[.tab(tab)]?.setAccessibilityHelp("\(copy.tabTitles[index]) tab")
        }
        proxies[.language("zh")]?.setAccessibilityLabel(copy.chineseLabel)
        proxies[.language("en")]?.setAccessibilityLabel(copy.englishLabel)
        proxies[.workspaceChange]?.setAccessibilityLabel(copy.changeDirectory)
        proxies[.workspaceChange]?.toolTip = copy.changeDirectory
        proxies[.rescan]?.setAccessibilityLabel(copy.rescan)
        proxies[.rescan]?.toolTip = copy.rescan
        proxies[.onboarding]?.setAccessibilityLabel(copy.onboardingButton)
        proxies[.onboarding]?.toolTip = copy.onboardingButton
        proxies[.showRulers]?.setAccessibilityLabel(copy.showRulersLabel)
        proxies[.showRulers]?.setAccessibilityValue(showsRulers ? 1 : 0)
        proxies[.showRulers]?.toolTip = copy.showRulersLabel
        proxies[.lightInterface]?.setAccessibilityLabel(copy.lightInterfaceLabel)
        proxies[.lightInterface]?.setAccessibilityValue(lightInterface ? 1 : 0)
        proxies[.lightInterface]?.toolTip = copy.lightInterfaceHint
        proxies[.autoSaveDrafts]?.setAccessibilityLabel(copy.autoSaveDraftsLabel)
        proxies[.autoSaveDrafts]?.setAccessibilityValue(autoSaveDrafts ? 1 : 0)
        proxies[.autoSaveDrafts]?.toolTip = copy.autoSaveDraftsHint

        for (index, agent) in copy.agents.enumerated() {
            proxies[.agent(index)]?.setAccessibilityLabel(agent.title)
            proxies[.agent(index)]?.setAccessibilityHelp(agent.description)
            proxies[.agentSegment(index)]?.setAccessibilityLabel(agent.title)
            proxies[.agentSegment(index)]?.setAccessibilityHelp("Use \(agent.title) by default")
        }
    }

    // MARK: Key Monitor

    private func installKeyMonitorIfNeeded() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, !self.isHidden else { return event }
            if event.keyCode == 53 { // Escape
                self.requestClose()
                return nil
            }
            return event
        }
    }

    private func removeKeyMonitor() {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
            self.keyMonitor = nil
        }
    }

    // MARK: Close

    private func requestClose() {
        dismiss()
        onClose?()
    }

    // MARK: Layout

    private struct SettingsLayout {
        let modal: CGRect
        let header: CGRect
        let title: CGRect
        let close: CGRect
        let sidebar: CGRect
        let tabRows: [CGRect]
        let bodyTop: CGFloat
        let contentX: CGFloat
        let contentWidth: CGFloat
        let heading: CGRect
        let stackTop: CGFloat

        // Scrollable content pane + heading used by the card-based tabs.
        let pane: CGRect
        let generalHeading: CGRect
        let maxContentScroll: CGFloat

        // General — card-based sections (web settings_general.jsx order).
        let profileCard: CGRect
        let appearanceCard: CGRect
        let canvasCard: CGRect
        let profileAvatar: CGRect
        let profileName: CGRect
        let profileSubtitle: CGRect
        let oauthGoogle: CGRect
        let oauthGitHub: CGRect
        let oauthNote: CGRect
        let orRow: CGRect
        let emailLabel: CGRect
        let emailInput: CGRect
        let passwordLabel: CGRect
        let passwordInput: CGRect
        let signInButton: CGRect
        let noAccountRow: CGRect
        let nameLabel: CGRect
        let nameInput: CGRect
        let appearanceLightRow: CGRect
        let appearanceLightSwitch: CGRect
        let appearanceAutoSaveRow: CGRect
        let appearanceAutoSaveSwitch: CGRect
        let canvasShowRulersRow: CGRect
        let canvasShowRulersSwitch: CGRect
        let canvasWorkspaceRow: CGRect
        let canvasLanguageRow: CGRect
        let changeDirectory: CGRect
        let rescan: CGRect
        let languageChinese: CGRect
        let languageEnglish: CGRect

        // Design Systems — empty-state card.
        let designSystemsCard: CGRect
        let designSystemsIcon: CGRect
        let designSystemsTitle: CGRect
        let designSystemsHint: CGRect

        // AI Assistant
        let agentSectionLabel: CGRect
        let agentCards: [CGRect]
        let defaultAgentLabel: CGRect
        let agentSegments: [CGRect]

        // AI Providers
        let providersLabel: CGRect
        let providerRows: [CGRect]
        let providersHint: CGRect
        let setupLabel: CGRect
        let setupHint: CGRect
        let onboardingButton: CGRect

        // Shortcuts
        let shortcutsHint: CGRect
        let shortcutRows: [CGRect]
    }

    private var modalFrame: CGRect {
        let available = NSSize(
            width: max(bounds.width - SettingsMetrics.edgeMargin, 480),
            height: max(bounds.height - SettingsMetrics.edgeMargin, 420)
        )
        let desired = modalSizeOverride ?? SettingsDrawerView.preferredModalSize
        let width = min(desired.width, max(available.width, SettingsMetrics.minModalWidth))
        let height = min(desired.height, max(available.height, SettingsMetrics.minModalHeight))
        // The web dialog is centred in the 900pt viewport; the native overlay is
        // anchored to the editor shell (which begins below the 40pt title bar),
        // so lift it by the title-bar half-height to land on the same pixels.
        let verticalOffset: CGFloat = 19
        return CGRect(
            x: floor((bounds.width - width) / 2),
            y: floor((bounds.height - height) / 2 + verticalOffset),
            width: width,
            height: height
        )
    }

    private func computeLayout() -> SettingsLayout {
        let modal = modalFrame

        let innerX = modal.minX + 1
        let innerY = modal.minY + 1
        let innerWidth = modal.width - 2
        let innerHeight = modal.height - 2

        // AppKit's y axis grows upward while the reference was measured from the
        // top edge, so every rect below is placed by its top edge.
        func rect(top: CGFloat, height: CGFloat, x: CGFloat, width: CGFloat) -> CGRect {
            CGRect(x: x, y: top - height, width: width, height: height)
        }

        let header = CGRect(x: innerX, y: innerY + innerHeight - SettingsMetrics.headerHeight,
                            width: innerWidth, height: SettingsMetrics.headerHeight)
        let title = CGRect(
            x: modal.minX + SettingsMetrics.titleInset,
            y: header.midY - 8,
            width: max(innerWidth - SettingsMetrics.titleInset * 2 - SettingsMetrics.closeSize - 16, 80),
            height: 16
        )
        let close = CGRect(
            x: modal.maxX - SettingsMetrics.closeInset - SettingsMetrics.closeSize,
            y: header.midY - SettingsMetrics.closeSize / 2,
            width: SettingsMetrics.closeSize,
            height: SettingsMetrics.closeSize
        )

        let sidebar = CGRect(
            x: innerX,
            y: innerY,
            width: SettingsMetrics.sidebarWidth,
            height: header.minY - innerY
        )

        var tabRows: [CGRect] = []
        var tabTop = sidebar.maxY - SettingsMetrics.tabPadding
        for _ in SettingsTab.allCases {
            tabRows.append(rect(
                top: tabTop,
                height: SettingsMetrics.tabHeight,
                x: sidebar.minX + SettingsMetrics.tabPadding,
                width: sidebar.width - SettingsMetrics.tabPadding * 2
            ))
            tabTop -= SettingsMetrics.tabHeight + SettingsMetrics.tabGap
        }

        // Content pane: web drawer main is `p-4` and scrolls (all section cards
        // live inside it). Coordinates are unscrolled; drawing/hit-testing apply
        // `contentScrollOffset` so the same rects serve both.
        let contentX = sidebar.maxX + SettingsMetrics.contentInset
        let contentWidth = modal.maxX - SettingsMetrics.contentInset - contentX - 1
        let pane = CGRect(
            x: sidebar.maxX,
            y: innerY,
            width: modal.maxX - sidebar.maxX,
            height: header.minY - innerY
        )
        let generalHeading = rect(
            top: header.minY - SettingsMetrics.contentInset,
            height: SettingsMetrics.headingHeight,
            x: contentX,
            width: contentWidth
        )
        // Legacy headings for the non-card tabs (AI Assistant / Providers /
        // Shortcuts) keep their previous rhythm.
        let headingTop = header.minY - SettingsMetrics.contentPadding
        let heading = rect(top: headingTop - 3, height: SettingsMetrics.headingHeight,
                           x: contentX, width: contentWidth)
        let stackTop = headingTop - SettingsMetrics.headingHeight - SettingsMetrics.headingGap

        // MARK: General layout — card-based sections (web cards: `p-3`, `gap-2`)
        let cardInnerX = contentX + SettingsMetrics.sectionCardPadding
        let cardInnerWidth = contentWidth - SettingsMetrics.sectionCardPadding * 2
        let cardInnerRight = cardInnerX + cardInnerWidth
        let profileTop = generalHeading.minY - SettingsMetrics.cardGap
        let profileCard = rect(top: profileTop, height: 446,
                               x: contentX, width: contentWidth)

        // Profile card rows, top edges (measured from web_settings.png).
        let profileInnerTop = profileCard.maxY - SettingsMetrics.sectionCardPadding
        let profileTitleTop = profileInnerTop
        let profileRow1Top = profileTitleTop - SettingsMetrics.sectionTitleHeight
            - SettingsMetrics.sectionRowGap
        let profileAvatar = rect(top: profileRow1Top, height: SettingsMetrics.avatarSize,
                                 x: cardInnerX, width: SettingsMetrics.avatarSize)
        let profileName = rect(top: profileAvatar.maxY - 4, height: 16,
                               x: profileAvatar.maxX + 12,
                               width: cardInnerWidth - SettingsMetrics.avatarSize - 12)
        let profileSubtitle = rect(top: profileName.minY, height: 16,
                                   x: profileName.minX, width: profileName.width)
        let oauthGap: CGFloat = 8
        let oauthTop = profileAvatar.minY - oauthGap
        let oauthButtonWidth = (cardInnerWidth - oauthGap) / 2
        let oauthGoogle = rect(top: oauthTop, height: SettingsMetrics.generalInputHeight,
                               x: cardInnerX, width: oauthButtonWidth)
        let oauthGitHub = rect(top: oauthTop, height: SettingsMetrics.generalInputHeight,
                               x: oauthGoogle.maxX + oauthGap, width: oauthButtonWidth)
        let oauthNote = rect(top: oauthGoogle.minY - oauthGap, height: 16,
                             x: cardInnerX, width: cardInnerWidth)
        let orRow = rect(top: oauthNote.minY - oauthGap, height: 16,
                         x: cardInnerX, width: cardInnerWidth)
        let emailLabel = rect(top: orRow.minY - oauthGap, height: 16,
                              x: cardInnerX, width: cardInnerWidth)
        let emailInput = rect(top: emailLabel.minY - SettingsMetrics.fieldLabelGap,
                              height: SettingsMetrics.generalInputHeight,
                              x: cardInnerX, width: cardInnerWidth)
        let passwordLabel = rect(top: emailInput.minY - oauthGap, height: 16,
                                 x: cardInnerX, width: cardInnerWidth)
        let passwordInput = rect(top: passwordLabel.minY - SettingsMetrics.fieldLabelGap,
                                 height: SettingsMetrics.generalInputHeight,
                                 x: cardInnerX, width: cardInnerWidth)
        let signInButton = rect(top: passwordInput.minY - oauthGap,
                                height: SettingsMetrics.generalInputHeight,
                                x: cardInnerX, width: cardInnerWidth)
        let noAccountRow = rect(top: signInButton.minY - oauthGap, height: 16,
                                x: cardInnerX, width: cardInnerWidth)
        let nameLabel = rect(top: noAccountRow.minY - oauthGap, height: 16,
                             x: cardInnerX, width: cardInnerWidth)
        let nameInput = rect(top: nameLabel.minY - SettingsMetrics.fieldLabelGap,
                             height: SettingsMetrics.generalInputHeight,
                             x: cardInnerX, width: cardInnerWidth)

        // Appearance card: two 40pt settings rows with a 28×16 switch each.
        let appearanceCard = rect(top: profileCard.minY - SettingsMetrics.cardGap,
                                  height: 136, x: contentX, width: contentWidth)
        let appearanceInnerTop = appearanceCard.maxY - SettingsMetrics.sectionCardPadding
        let appearanceRow1Top = appearanceInnerTop - SettingsMetrics.sectionTitleHeight
            - SettingsMetrics.sectionRowGap
        let appearanceLightRow = rect(top: appearanceRow1Top, height: SettingsMetrics.rowHeight,
                                      x: cardInnerX, width: cardInnerWidth)
        let appearanceAutoSaveRow = rect(
            top: appearanceLightRow.minY - SettingsMetrics.sectionRowGap,
            height: SettingsMetrics.rowHeight,
            x: cardInnerX, width: cardInnerWidth
        )
        func switchRect(in row: CGRect) -> CGRect {
            CGRect(
                x: cardInnerRight - SettingsMetrics.switchWidth,
                y: row.midY - SettingsMetrics.switchHeight / 2,
                width: SettingsMetrics.switchWidth,
                height: SettingsMetrics.switchHeight
            )
        }
        let appearanceLightSwitch = switchRect(in: appearanceLightRow)
        let appearanceAutoSaveSwitch = switchRect(in: appearanceAutoSaveRow)

        // Canvas card: Show rulers + Project Workspace + Language rows.
        let canvasCard = rect(top: appearanceCard.minY - SettingsMetrics.cardGap,
                              height: 188, x: contentX, width: contentWidth)
        let canvasInnerTop = canvasCard.maxY - SettingsMetrics.sectionCardPadding
        let canvasShowRulersRow = rect(
            top: canvasInnerTop - SettingsMetrics.sectionTitleHeight - SettingsMetrics.sectionRowGap,
            height: SettingsMetrics.rowHeight,
            x: cardInnerX, width: cardInnerWidth
        )
        let canvasShowRulersSwitch = switchRect(in: canvasShowRulersRow)
        let canvasWorkspaceRow = rect(
            top: canvasShowRulersRow.minY - SettingsMetrics.sectionRowGap,
            height: SettingsMetrics.workspaceRowHeight,
            x: cardInnerX, width: cardInnerWidth
        )
        let canvasLanguageRow = rect(
            top: canvasWorkspaceRow.minY - SettingsMetrics.sectionRowGap,
            height: SettingsMetrics.rowHeight,
            x: cardInnerX, width: cardInnerWidth
        )

        // Workspace row controls (right aligned).
        let smallFont = ThemeFonts.system(size: 11)
        let changeTextSize = settingsTextSize(copy.changeDirectory, font: smallFont)
        let rescanTextSize = settingsTextSize(copy.rescan, font: smallFont)
        let changeWidth = ceil(changeTextSize.width) + 13 + 6 + 20
        let rescanWidth = ceil(rescanTextSize.width) + 13 + 6 + 20
        let actionsY = canvasWorkspaceRow.midY - SettingsMetrics.smallActionHeight / 2
        let rescan = CGRect(
            x: cardInnerRight - rescanWidth, y: actionsY,
            width: rescanWidth, height: SettingsMetrics.smallActionHeight
        )
        let changeDirectory = CGRect(
            x: rescan.minX - 8 - changeWidth, y: actionsY,
            width: changeWidth, height: SettingsMetrics.smallActionHeight
        )

        // Language row: two 28pt pills, right aligned.
        let languageGap: CGFloat = 4
        let chineseWidth = ceil(settingsTextSize(copy.chineseLabel, font: ThemeFonts.system(size: 12)).width) + 20
        let englishWidth = ceil(settingsTextSize(copy.englishLabel, font: ThemeFonts.system(size: 12)).width) + 20
        let languageY = canvasLanguageRow.midY - SettingsMetrics.smallActionHeight / 2
        let languageEnglish = CGRect(
            x: cardInnerRight - englishWidth, y: languageY,
            width: englishWidth, height: SettingsMetrics.smallActionHeight
        )
        let languageChinese = CGRect(
            x: languageEnglish.minX - languageGap - chineseWidth, y: languageY,
            width: chineseWidth, height: SettingsMetrics.smallActionHeight
        )

        // Design Systems tab: one empty-state card that comfortably fits. The
        // 24+12+16+6+16 content block is vertically centred inside the 180pt card.
        let designSystemsCard = rect(top: generalHeading.minY - SettingsMetrics.cardGap,
                                     height: 180, x: contentX, width: contentWidth)
        let designSystemsIcon = CGRect(
            x: designSystemsCard.midX - 12, y: designSystemsCard.maxY - 53 - 24,
            width: 24, height: 24
        )
        let designSystemsTitle = CGRect(
            x: designSystemsCard.minX + 24, y: designSystemsIcon.minY - 12 - 16,
            width: designSystemsCard.width - 48, height: 16
        )
        let designSystemsHint = CGRect(
            x: designSystemsCard.minX + 24, y: designSystemsTitle.minY - 6 - 16,
            width: designSystemsCard.width - 48, height: 16
        )

        // Scroll range: when fully scrolled the last card's bottom padding sits on
        // the pane bottom (the web scroll container includes its own p-4 padding).
        let contentBottomEdge: CGFloat
        switch activeTab {
        case .general:
            contentBottomEdge = canvasCard.minY - SettingsMetrics.contentInset
        case .designSystems:
            contentBottomEdge = designSystemsCard.minY - SettingsMetrics.contentInset
        default:
            contentBottomEdge = pane.minY
        }
        let maxContentScroll = max(0, pane.minY - contentBottomEdge)

        // Shared column used by the legacy AI Assistant / Providers / Shortcuts tabs.
        let sectionX = contentX + SettingsMetrics.sectionPadding
        let sectionWidth = contentWidth - SettingsMetrics.sectionPadding * 2

        // MARK: AI Assistant layout
        let agentSectionLabel = rect(top: stackTop, height: 14, x: sectionX, width: sectionWidth)
        var agentCards: [CGRect] = []
        var agentCardTop = stackTop - 14 - 16
        let agentCount = copy.agents.count
        for _ in 0..<agentCount {
            agentCards.append(rect(top: agentCardTop, height: SettingsMetrics.agentCardHeight,
                                   x: sectionX, width: sectionWidth))
            agentCardTop -= SettingsMetrics.agentCardHeight + SettingsMetrics.agentCardGap
        }
        let assistantSectionTwoTop = (agentCards.last?.minY ?? stackTop) - SettingsMetrics.sectionGap
        let defaultAgentLabel = rect(top: assistantSectionTwoTop - 16, height: 14,
                                     x: sectionX, width: sectionWidth)
        let agentSegmentsTop = assistantSectionTwoTop - 16 - 14 - 16
        let agentSegmentGap: CGFloat = 6
        let agentSegmentWidth = max(30, (sectionWidth - agentSegmentGap * CGFloat(agentCount - 1)) / CGFloat(agentCount))
        var agentSegments: [CGRect] = []
        for index in 0..<agentCount {
            agentSegments.append(rect(
                top: agentSegmentsTop,
                height: SettingsMetrics.languageHeight,
                x: sectionX + CGFloat(index) * (agentSegmentWidth + agentSegmentGap),
                width: agentSegmentWidth
            ))
        }

        // MARK: AI Providers layout
        let providersLabel = rect(top: stackTop, height: 14, x: sectionX, width: sectionWidth)
        var providerRows: [CGRect] = []
        var providerTop = stackTop - 14 - 16
        for _ in 0..<3 {
            providerRows.append(rect(top: providerTop, height: SettingsMetrics.providerRowHeight,
                                     x: sectionX, width: sectionWidth))
            providerTop -= SettingsMetrics.providerRowHeight + SettingsMetrics.providerRowGap
        }
        let providersHint = rect(
            top: (providerRows.last?.minY ?? stackTop) - 16,
            height: 32,
            x: sectionX,
            width: sectionWidth
        )
        let setupSectionTop = providersHint.minY - SettingsMetrics.sectionGap - 16
        let setupLabel = rect(top: setupSectionTop - 16, height: 14, x: sectionX, width: sectionWidth)
        let setupHint = rect(top: setupLabel.minY - 8, height: 32, x: sectionX, width: sectionWidth)
        let primaryTextSize = settingsTextSize(copy.onboardingButton,
                                               font: ThemeFonts.mono(size: 12, weight: .semibold))
        let primaryWidth = ceil(primaryTextSize.width) + 50
        let onboardingButton = rect(top: setupHint.minY - 14, height: SettingsMetrics.primaryButtonHeight,
                                    x: sectionX, width: primaryWidth)

        // MARK: Shortcuts layout
        let shortcutsHint = rect(top: stackTop, height: 16, x: contentX, width: contentWidth)
        let shortcutRowsTop = stackTop - 16 - 16
        let shortcutRowWidth = (contentWidth - SettingsMetrics.shortcutColumnGap) / 2
        var shortcutRows: [CGRect] = []
        for index in 0..<12 {
            let column = index % 2
            let row = index / 2
            shortcutRows.append(rect(
                top: shortcutRowsTop - CGFloat(row) * (SettingsMetrics.shortcutRowHeight
                    + SettingsMetrics.shortcutRowGap),
                height: SettingsMetrics.shortcutRowHeight,
                x: contentX + CGFloat(column) * (shortcutRowWidth + SettingsMetrics.shortcutColumnGap),
                width: shortcutRowWidth
            ))
        }

        return SettingsLayout(
            modal: modal,
            header: header,
            title: title,
            close: close,
            sidebar: sidebar,
            tabRows: tabRows,
            bodyTop: header.minY,
            contentX: contentX,
            contentWidth: contentWidth,
            heading: heading,
            stackTop: stackTop,
            pane: pane,
            generalHeading: generalHeading,
            maxContentScroll: maxContentScroll,
            profileCard: profileCard,
            appearanceCard: appearanceCard,
            canvasCard: canvasCard,
            profileAvatar: profileAvatar,
            profileName: profileName,
            profileSubtitle: profileSubtitle,
            oauthGoogle: oauthGoogle,
            oauthGitHub: oauthGitHub,
            oauthNote: oauthNote,
            orRow: orRow,
            emailLabel: emailLabel,
            emailInput: emailInput,
            passwordLabel: passwordLabel,
            passwordInput: passwordInput,
            signInButton: signInButton,
            noAccountRow: noAccountRow,
            nameLabel: nameLabel,
            nameInput: nameInput,
            appearanceLightRow: appearanceLightRow,
            appearanceLightSwitch: appearanceLightSwitch,
            appearanceAutoSaveRow: appearanceAutoSaveRow,
            appearanceAutoSaveSwitch: appearanceAutoSaveSwitch,
            canvasShowRulersRow: canvasShowRulersRow,
            canvasShowRulersSwitch: canvasShowRulersSwitch,
            canvasWorkspaceRow: canvasWorkspaceRow,
            canvasLanguageRow: canvasLanguageRow,
            changeDirectory: changeDirectory,
            rescan: rescan,
            languageChinese: languageChinese,
            languageEnglish: languageEnglish,
            designSystemsCard: designSystemsCard,
            designSystemsIcon: designSystemsIcon,
            designSystemsTitle: designSystemsTitle,
            designSystemsHint: designSystemsHint,
            agentSectionLabel: agentSectionLabel,
            agentCards: agentCards,
            defaultAgentLabel: defaultAgentLabel,
            agentSegments: agentSegments,
            providersLabel: providersLabel,
            providerRows: providerRows,
            providersHint: providersHint,
            setupLabel: setupLabel,
            setupHint: setupHint,
            onboardingButton: onboardingButton,
            shortcutsHint: shortcutsHint,
            shortcutRows: shortcutRows
        )
    }

    // MARK: Accessibility & Control Frames

    private func buildAccessibilityProxies() {
        let identifiers: [(ControlID, String)] = [
            (.close, "Settings.Close"),
            (.tab(.general), "Settings.Tab.General"),
            (.tab(.aiAssistant), "Settings.Tab.AIAssistant"),
            (.tab(.designSystems), "Settings.Tab.DesignSystems"),
            (.tab(.aiProviders), "Settings.Tab.AIProviders"),
            (.tab(.shortcuts), "Settings.Tab.Shortcuts"),
            (.language("zh"), "Settings.Language.zh"),
            (.language("en"), "Settings.Language.en"),
            (.workspaceChange, "Settings.Workspace.ChangeDirectory"),
            (.rescan, "Settings.Workspace.Rescan"),
            (.lightInterface, "Settings.Appearance.LightInterface"),
            (.autoSaveDrafts, "Settings.Appearance.AutoSaveDrafts"),
            (.agent(0), "Settings.Agent.Claude"),
            (.agent(1), "Settings.Agent.Codex"),
            (.agent(2), "Settings.Agent.Antigravity"),
            (.agent(3), "Settings.Agent.OpenCode"),
            (.agent(4), "Settings.Agent.DeepSeekHarness"),
            (.agentSegment(0), "Settings.DefaultAgent.Claude"),
            (.agentSegment(1), "Settings.DefaultAgent.Codex"),
            (.agentSegment(2), "Settings.DefaultAgent.Antigravity"),
            (.agentSegment(3), "Settings.DefaultAgent.OpenCode"),
            (.agentSegment(4), "Settings.DefaultAgent.DeepSeekHarness"),
            (.onboarding, "Settings.Onboarding"),
            (.showRulers, "Settings.Canvas.ShowRulers")
        ]

        for (control, identifier) in identifiers {
            let proxy = SettingsProxyButton(frame: .zero)
            proxy.setAccessibilityIdentifier(identifier)
            proxy.setAccessibilityRole(.button)
            proxy.isHidden = true
            proxy.onActivate = { [weak self] in
                self?.activate(control)
            }
            addSubview(proxy)
            proxies[control] = proxy
        }
        // The toggle rows expose a switch/checkbox role, not a button.
        for control in [ControlID.showRulers, .lightInterface, .autoSaveDrafts] {
            proxies[control]?.setAccessibilityRole(.checkBox)
        }
    }

    private func activeControlRects(_ layout: SettingsLayout) -> [(ControlID, CGRect)] {
        var rects: [(ControlID, CGRect)] = [
            (.close, layout.close),
            (.tab(.general), layout.tabRows[0]),
            (.tab(.aiAssistant), layout.tabRows[1]),
            (.tab(.designSystems), layout.tabRows[2]),
            (.tab(.aiProviders), layout.tabRows[3]),
            (.tab(.shortcuts), layout.tabRows[4])
        ]

        // Content controls scroll with the pane; clip them to its visible area
        // so partially scrolled rows never capture clicks in the header.
        let pane = layout.pane
        let offset = contentScrollOffset
        func visible(_ rect: CGRect) -> CGRect {
            rect.offsetBy(dx: 0, dy: offset).intersection(pane)
        }

        switch activeTab {
        case .general:
            rects.append((.language("zh"), visible(layout.languageChinese)))
            rects.append((.language("en"), visible(layout.languageEnglish)))
            rects.append((.workspaceChange, visible(layout.changeDirectory)))
            rects.append((.rescan, visible(layout.rescan)))
            rects.append((.showRulers, visible(layout.canvasShowRulersRow)))
            rects.append((.lightInterface, visible(layout.appearanceLightRow)))
            rects.append((.autoSaveDrafts, visible(layout.appearanceAutoSaveRow)))
        case .aiAssistant:
            for (index, rect) in layout.agentCards.enumerated() {
                rects.append((.agent(index), visible(rect)))
            }
            for (index, rect) in layout.agentSegments.enumerated() {
                rects.append((.agentSegment(index), visible(rect)))
            }
        case .aiProviders:
            rects.append((.onboarding, visible(layout.onboardingButton)))
        case .shortcuts, .designSystems:
            break
        }
        return rects.filter { !$0.1.isNull && $0.1.width > 0 && $0.1.height > 0 }
    }

    private func updateAccessibilityElementFrames() {
        guard !isHidden else { return }
        let layout = computeLayout()
        let active = activeControlRects(layout)

        for (_, proxy) in proxies {
            proxy.isHidden = true
        }
        for (control, rect) in active {
            guard let proxy = proxies[control] else { continue }
            proxy.frame = rect
            proxy.isHidden = false
        }

        let inputFrame = layout.nameInput.offsetBy(dx: 0, dy: contentScrollOffset)
        // The NSTextField is a subview and is not affected by the CoreGraphics
        // pane clip, so only show it while its input row is fully visible.
        let inputVisible = activeTab == .general && layout.pane.contains(inputFrame)
        nameField.isHidden = !inputVisible
        if inputVisible {
            nameField.frame = CGRect(
                x: inputFrame.minX + 12,
                y: inputFrame.midY - 6,
                width: inputFrame.width - 24,
                height: 18
            )
        }
    }

    private func accessibilityIdentifier(for control: ControlID) -> String? {
        switch control {
        case .close: return "Settings.Close"
        case .tab(.general): return "Settings.Tab.General"
        case .tab(.aiAssistant): return "Settings.Tab.AIAssistant"
        case .tab(.designSystems): return "Settings.Tab.DesignSystems"
        case .tab(.aiProviders): return "Settings.Tab.AIProviders"
        case .tab(.shortcuts): return "Settings.Tab.Shortcuts"
        case .language("zh"): return "Settings.Language.zh"
        case .language("en"): return "Settings.Language.en"
        case .workspaceChange: return "Settings.Workspace.ChangeDirectory"
        case .rescan: return "Settings.Workspace.Rescan"
        case .agent(0): return "Settings.Agent.Claude"
        case .agent(1): return "Settings.Agent.Codex"
        case .agent(2): return "Settings.Agent.Antigravity"
        case .agent(3): return "Settings.Agent.OpenCode"
        case .agent(4): return "Settings.Agent.DeepSeekHarness"
        case .agentSegment(0): return "Settings.DefaultAgent.Claude"
        case .agentSegment(1): return "Settings.DefaultAgent.Codex"
        case .agentSegment(2): return "Settings.DefaultAgent.Antigravity"
        case .agentSegment(3): return "Settings.DefaultAgent.OpenCode"
        case .agentSegment(4): return "Settings.DefaultAgent.DeepSeekHarness"
        case .onboarding: return "Settings.Onboarding"
        default: return nil
        }
    }

    public override func layout() {
        super.layout()
        let maxScroll = computeLayout().maxContentScroll
        if contentScrollOffset > maxScroll {
            contentScrollOffset = max(0, maxScroll)
        }
        syncBlurBackdrop()
        updateAccessibilityElementFrames()
        needsDisplay = true
    }

    // MARK: Hit Testing & Interaction

    public override func hitTest(_ point: NSPoint) -> NSView? {
        guard !isHidden else { return nil }
        let local = convert(point, from: superview)
        guard bounds.contains(local) else { return nil }
        if activeTab == .general,
           !nameField.isHidden,
           nameField.frame.insetBy(dx: -12, dy: -7).contains(local) {
            return nameField
        }
        return self
    }

    public override var acceptsFirstResponder: Bool { true }

    private func controlRects() -> [(ControlID, CGRect)] {
        activeControlRects(computeLayout())
    }

    private func control(at point: CGPoint) -> ControlID? {
        for (control, rect) in controlRects() where rect.contains(point) {
            return control
        }
        return nil
    }

    public override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let existing = trackingAreaReference {
            removeTrackingArea(existing)
        }
        let area = NSTrackingArea(
            rect: .zero,
            options: [.mouseEnteredAndExited, .mouseMoved, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        trackingAreaReference = area
    }

    public override func resetCursorRects() {
        let layout = computeLayout()
        addCursorRect(layout.close, cursor: .pointingHand)
        for rect in activeControlRects(layout).map({ $0.1 }) {
            addCursorRect(rect, cursor: .pointingHand)
        }
        if activeTab == .general {
            let input = layout.nameInput.offsetBy(dx: 0, dy: contentScrollOffset)
                .intersection(layout.pane)
            if !input.isNull && !input.isEmpty {
                addCursorRect(input, cursor: .iBeam)
            }
        }
    }

    public override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let layout = computeLayout()

        if nameField.currentEditor() != nil {
            window?.makeFirstResponder(self)
        }

        if layout.modal.contains(point) {
            scrimPress = false
            let input = layout.nameInput.offsetBy(dx: 0, dy: contentScrollOffset)
            if activeTab == .general,
               !nameField.isHidden,
               input.contains(point),
               !nameField.frame.contains(point) {
                window?.makeFirstResponder(nameField)
                pressedControl = nil
                return
            }
            pressedControl = control(at: point)
        } else {
            scrimPress = true
            pressedControl = nil
        }
        needsDisplay = true
    }

    public override func mouseUp(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let layout = computeLayout()

        if scrimPress {
            scrimPress = false
            if !layout.modal.contains(point) {
                requestClose()
            }
            return
        }

        if let pressed = pressedControl, control(at: point) == pressed {
            pressedControl = nil
            needsDisplay = true
            activate(pressed)
            return
        }
        pressedControl = nil
        needsDisplay = true
    }

    public override func mouseMoved(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        let newHover = control(at: point)
        if newHover != hoveredControl {
            hoveredControl = newHover
            needsDisplay = true
        }
    }

    public override func mouseExited(with event: NSEvent) {
        if hoveredControl != nil {
            hoveredControl = nil
            needsDisplay = true
        }
    }

    public override func scrollWheel(with event: NSEvent) {
        // Scroll the tab content pane only; never the editor underneath.
        let layout = computeLayout()
        guard layout.maxContentScroll > 0 else { return }
        let point = convert(event.locationInWindow, from: nil)
        guard layout.pane.contains(point) else { return }
        let delta = event.hasPreciseScrollingDeltas
            ? event.scrollingDeltaY
            : event.scrollingDeltaY * 8.0
        setContentScrollOffset(contentScrollOffset - delta)
    }

    private func setContentScrollOffset(_ value: CGFloat) {
        let layout = computeLayout()
        let clamped = min(max(value, 0), layout.maxContentScroll)
        guard clamped != contentScrollOffset else { return }
        contentScrollOffset = clamped
        hoveredControl = nil
        pressedControl = nil
        updateAccessibilityElementFrames()
        window?.invalidateCursorRects(for: self)
        needsDisplay = true
    }

    public override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 53: // Escape
            requestClose()
        case 36, 76: // Return / keypad Enter
            if nameField.currentEditor() != nil {
                window?.makeFirstResponder(self)
            } else {
                super.keyDown(with: event)
            }
        default:
            super.keyDown(with: event)
        }
    }

    public override func cancelOperation(_ sender: Any?) {
        requestClose()
    }

    private func activate(_ control: ControlID) {
        switch control {
        case .close:
            requestClose()
        case .tab(let tab):
            selectTab(tab)
        case .language(let code):
            applyLanguage(code, notify: true)
        case .workspaceChange:
            onWorkspaceChange?()
        case .rescan:
            onRescan?()
        case .agent(let index):
            selectAgent(index)
        case .agentSegment(let index):
            selectAgent(index)
        case .onboarding:
            onOpenOnboarding?()
        case .showRulers:
            toggleShowRulers()
        case .lightInterface:
            toggleLightInterface()
        case .autoSaveDrafts:
            toggleAutoSaveDrafts()
        }
    }

    /// Flips the canvas rulers preference (same `voo.editor.showRulers` key the
    /// web settings drawer and the ⇧R shortcut use) and forwards it to the host.
    private func toggleShowRulers() {
        showsRulers.toggle()
        UserDefaults.standard.set(showsRulers, forKey: SettingsDrawerView.showRulersDefaultsKey)
        refreshProxyLabels()
        onToggleRulers?(showsRulers)
        needsDisplay = true
    }

    /// Flips the editor theme preference (web `voo.editor.theme`: "light"/"dark").
    private func toggleLightInterface() {
        lightInterface.toggle()
        UserDefaults.standard.set(
            lightInterface ? "light" : "dark",
            forKey: SettingsDrawerView.editorThemeDefaultsKey
        )
        refreshProxyLabels()
        onToggleLightInterface?(lightInterface)
        needsDisplay = true
    }

    /// Flips the auto-save-drafts preference (web `voo.editor.autoSaveDrafts`).
    private func toggleAutoSaveDrafts() {
        autoSaveDrafts.toggle()
        UserDefaults.standard.set(autoSaveDrafts, forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)
        refreshProxyLabels()
        onToggleAutoSaveDrafts?(autoSaveDrafts)
        needsDisplay = true
    }

    private func selectAgent(_ index: Int) {
        guard copy.agents.indices.contains(index) else { return }
        selectedAgentIndex = index
        let provider = copy.agents[index].provider
        UserDefaults.standard.set(
            provider,
            forKey: SettingsDrawerView.agentProviderDefaultsKey
        )
        onAgentChange?(provider)
        needsDisplay = true
    }

    @objc private func handleNameFieldAction() {
        window?.makeFirstResponder(self)
    }

    // MARK: Drawing

    public override var isOpaque: Bool { false }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let layout = computeLayout()

        ctx.saveGState()
        // Scrim.
        ctx.setFillColor(SettingsPalette.scrim.cgColor)
        ctx.fill(bounds)

        // Dialog shadow + fill.
        let modalPath = settingsRoundedPath(layout.modal, radius: SettingsMetrics.modalRadius)
        ctx.saveGState()
        let shadow = NSShadow()
        shadow.shadowColor = NSColor(white: 0.0, alpha: 0.55)
        shadow.shadowBlurRadius = 48
        shadow.shadowOffset = .zero
        shadow.set()
        ctx.setFillColor(SettingsPalette.dialogBackground.cgColor)
        ctx.addPath(modalPath)
        ctx.fillPath()
        ctx.restoreGState()

        // Clip all chrome inside the dialog.
        ctx.saveGState()
        ctx.addPath(modalPath)
        ctx.clip()
        drawHeader(ctx: ctx, layout: layout)
        drawSidebar(ctx: ctx, layout: layout)
        drawContent(ctx: ctx, layout: layout)
        ctx.restoreGState()

        // Border.
        settingsStrokeRounded(
            layout.modal.insetBy(dx: 0.5, dy: 0.5),
            radius: SettingsMetrics.modalRadius,
            color: SettingsPalette.divider,
            lineWidth: 1.0
        )

        ctx.restoreGState()
    }

    private func drawHeader(ctx: CGContext, layout: SettingsLayout) {
        // Header shares the dialog fill; only the divider and controls show.
        ctx.setFillColor(SettingsPalette.divider.cgColor)
        ctx.fill(CGRect(
            x: layout.header.minX,
            y: layout.header.minY,
            width: layout.header.width,
            height: 1
        ))

        let titleFont = ThemeFonts.system(size: 12, weight: .medium)
        settingsDrawText(
            copy.modalTitle,
            in: layout.title,
            font: titleFont,
            color: SettingsPalette.textMuted,
            kern: 1.68
        )

        let closeHovered = hoveredControl == .close
        let closePressed = pressedControl == .close
        let closeFill = closePressed
            ? SettingsPalette.pressed
            : (closeHovered ? SettingsPalette.hover : SettingsPalette.hoverSoft)
        settingsFillRounded(layout.close, radius: 8, color: closeFill)
        SettingsGlyph.close.draw(
            in: CGRect(x: layout.close.midX - 8, y: layout.close.midY - 8, width: 16, height: 16),
            color: closeHovered ? SettingsPalette.textSecondary : SettingsPalette.textMuted,
            strokeWidth: 1.8
        )
    }

    private func drawSidebar(ctx: CGContext, layout: SettingsLayout) {
        settingsFillRounded(layout.sidebar, radius: 0, color: SettingsPalette.sidebarBackground)

        let tabFont = ThemeFonts.system(size: 12)
        for (index, tab) in SettingsTab.allCases.enumerated() {
            guard layout.tabRows.indices.contains(index) else { continue }
            let row = layout.tabRows[index]
            let isActive = activeTab == tab
            let control = ControlID.tab(tab)
            let isHovered = hoveredControl == control
            let isPressed = pressedControl == control

            if isActive {
                settingsFillRounded(row, radius: SettingsMetrics.tabRadius, color: SettingsPalette.activeRow)
            } else if isPressed {
                settingsFillRounded(row, radius: SettingsMetrics.tabRadius, color: SettingsPalette.pressed)
            } else if isHovered {
                settingsFillRounded(row, radius: SettingsMetrics.tabRadius, color: SettingsPalette.hoverSoft)
            }

            // Web: active `text-neutral-100`, idle `text-neutral-400`, hover `neutral-200`.
            let tint = isActive
                ? SettingsPalette.textPrimary
                : (isHovered ? SettingsPalette.textSecondary : SettingsPalette.textMuted)
            let iconRect = CGRect(
                x: row.minX + SettingsMetrics.tabIconInset,
                y: row.midY - SettingsMetrics.tabIconSize / 2,
                width: SettingsMetrics.tabIconSize,
                height: SettingsMetrics.tabIconSize
            )
            switch tab {
            case .general:
                SettingsGlyph.sliders.draw(in: iconRect, color: tint, strokeWidth: 1.7)
            case .aiAssistant:
                SettingsGlyph.sparkle.draw(in: iconRect, color: tint, strokeWidth: 1.7)
            case .designSystems:
                SettingsGlyph.palette.draw(in: iconRect, color: tint, strokeWidth: 1.6)
            case .aiProviders:
                SettingsGlyph.sparkle.draw(in: iconRect, color: tint, strokeWidth: 1.7)
            case .shortcuts:
                SettingsGlyph.keyboard.draw(in: iconRect, color: tint, strokeWidth: 1.6)
            }

            settingsDrawText(
                copy.tabTitles[index],
                in: CGRect(
                    x: iconRect.maxX + SettingsMetrics.tabLabelGap,
                    y: row.minY,
                    width: max(row.width - SettingsMetrics.tabIconInset - SettingsMetrics.tabIconSize
                        - SettingsMetrics.tabLabelGap - 10, 40),
                    height: row.height
                ),
                font: tabFont,
                color: tint,
                truncating: true
            )
        }
    }

    private func drawContent(ctx: CGContext, layout: SettingsLayout) {
        // Web drawer main (`p-4`) scrolls; heading + cards live inside the pane,
        // so clip to it and apply the content scroll offset before drawing.
        ctx.saveGState()
        ctx.clip(to: layout.pane)
        ctx.translateBy(x: 0, y: contentScrollOffset)

        let headingText: String
        let headingRect: CGRect
        switch activeTab {
        case .general:
            headingText = copy.tabTitles[0]
            headingRect = layout.generalHeading
        case .designSystems:
            headingText = copy.tabTitles[2]
            headingRect = layout.generalHeading
        case .aiAssistant:
            headingText = copy.tabTitles[1]
            headingRect = layout.heading
        case .aiProviders:
            headingText = copy.tabTitles[3]
            headingRect = layout.heading
        case .shortcuts:
            headingText = copy.tabTitles[4]
            headingRect = layout.heading
        }
        settingsDrawText(
            headingText,
            in: headingRect,
            font: ThemeFonts.system(size: 12, weight: .medium),
            color: SettingsPalette.textSecondary
        )

        switch activeTab {
        case .general:
            drawGeneral(ctx: ctx, layout: layout)
        case .designSystems:
            drawDesignSystems(ctx: ctx, layout: layout)
        case .aiAssistant:
            drawAIAssistant(ctx: ctx, layout: layout)
        case .aiProviders:
            drawAIProviders(ctx: ctx, layout: layout)
        case .shortcuts:
            drawShortcuts(ctx: ctx, layout: layout)
        }

        ctx.restoreGState()
    }

    // MARK: General Tab (card-based, web settings_general.jsx)

    private func drawGeneral(ctx: CGContext, layout: SettingsLayout) {
        drawCard(layout.profileCard)
        drawCardTitle(copy.profileTitle, card: layout.profileCard, showsHint: true)

        drawAvatar(in: layout.profileAvatar)
        let displayName = nameField.stringValue.isEmpty ? copy.guestName : nameField.stringValue
        settingsDrawText(
            displayName,
            in: layout.profileName,
            font: ThemeFonts.system(size: 12, weight: .medium),
            color: SettingsPalette.textSecondary,
            truncating: true
        )
        settingsDrawText(
            copy.guestBadge,
            in: layout.profileSubtitle,
            font: ThemeFonts.system(size: 12),
            color: SettingsPalette.textMuted,
            truncating: true
        )

        drawOutlineButton(layout.oauthGoogle, title: copy.continueWithGoogle, monogram: "G")
        drawOutlineButton(layout.oauthGitHub, title: copy.continueWithGitHub, monogram: "GH")
        settingsDrawText(
            copy.oauthNote,
            in: layout.oauthNote,
            font: ThemeFonts.system(size: 12),
            color: SettingsPalette.textMuted
        )

        drawOrDivider(layout.orRow, ctx: ctx)

        drawFieldLabel(copy.emailLabel, in: layout.emailLabel)
        drawInput(layout.emailInput, placeholder: copy.emailPlaceholder)
        drawFieldLabel(copy.passwordLabel, in: layout.passwordLabel)
        drawInput(layout.passwordInput, placeholder: copy.passwordPlaceholder)
        drawMintButton(layout.signInButton, title: copy.signInLabel)
        drawNoAccountRow(layout.noAccountRow)

        drawFieldLabel(copy.nameFieldLabel, in: layout.nameLabel)
        settingsFillRounded(
            layout.nameInput,
            radius: SettingsMetrics.generalInputRadius,
            color: SettingsPalette.inputFill
        )
        if nameFieldEditing || nameField.currentEditor() != nil {
            settingsStrokeRounded(
                layout.nameInput.insetBy(dx: 0.5, dy: 0.5),
                radius: SettingsMetrics.generalInputRadius,
                color: SettingsPalette.mint.withAlphaComponent(0.65),
                lineWidth: 1.0
            )
        }

        // Appearance card.
        drawCard(layout.appearanceCard)
        drawCardTitle(copy.appearanceTitle, card: layout.appearanceCard, showsHint: true)
        drawToggleRow(
            layout.appearanceLightRow,
            switchRect: layout.appearanceLightSwitch,
            title: copy.lightInterfaceLabel,
            hint: copy.lightInterfaceHint,
            isOn: lightInterface,
            control: .lightInterface
        )
        drawToggleRow(
            layout.appearanceAutoSaveRow,
            switchRect: layout.appearanceAutoSaveSwitch,
            title: copy.autoSaveDraftsLabel,
            hint: copy.autoSaveDraftsHint,
            isOn: autoSaveDrafts,
            control: .autoSaveDrafts
        )

        // Canvas card: Show rulers, then the existing workspace + language rows.
        drawCard(layout.canvasCard)
        drawCardTitle(copy.canvasTitle, card: layout.canvasCard, showsHint: true)
        drawToggleRow(
            layout.canvasShowRulersRow,
            switchRect: layout.canvasShowRulersSwitch,
            title: copy.showRulersLabel,
            hint: copy.rulersHint,
            isOn: showsRulers,
            control: .showRulers
        )
        drawWorkspaceRow(layout)
        drawLanguageRow(layout)
    }

    private func drawDesignSystems(ctx: CGContext, layout: SettingsLayout) {
        drawCard(layout.designSystemsCard)
        SettingsGlyph.palette.draw(
            in: layout.designSystemsIcon,
            color: SettingsPalette.textMuted,
            strokeWidth: 1.6
        )
        settingsDrawText(
            copy.designSystemsEmptyTitle,
            in: layout.designSystemsTitle,
            font: ThemeFonts.system(size: 12, weight: .semibold),
            color: SettingsPalette.textSecondary,
            alignment: .center
        )
        settingsDrawText(
            copy.designSystemsEmptyHint,
            in: layout.designSystemsHint,
            font: ThemeFonts.system(size: 11),
            color: SettingsPalette.textMuted,
            alignment: .center
        )
    }

    /// Rounded section card on the dialog background (web `rounded-xl bg-neutral-900 p-3`).
    private func drawCard(_ rect: CGRect) {
        settingsFillRounded(rect, radius: SettingsMetrics.sectionCardRadius, color: SettingsPalette.cardFill)
    }

    private func drawCardTitle(_ title: String, card: CGRect, showsHint: Bool) {
        let font = ThemeFonts.system(size: 12, weight: .medium)
        let rect = CGRect(
            x: card.minX + SettingsMetrics.sectionCardPadding,
            y: card.maxY - SettingsMetrics.sectionCardPadding - SettingsMetrics.sectionTitleHeight,
            width: card.width - SettingsMetrics.sectionCardPadding * 2,
            height: SettingsMetrics.sectionTitleHeight
        )
        settingsDrawText(title, in: rect, font: font, color: SettingsPalette.textMuted)
        if showsHint {
            let width = ceil(settingsTextSize(title, font: font).width)
            drawHintBadge(center: CGPoint(x: rect.minX + width + 12, y: rect.midY))
        }
    }

    private func drawFieldLabel(_ title: String, in rect: CGRect) {
        settingsDrawText(title, in: rect, font: ThemeFonts.system(size: 12), color: SettingsPalette.textMuted)
    }

    private func drawInput(_ rect: CGRect, placeholder: String) {
        settingsFillRounded(rect, radius: SettingsMetrics.generalInputRadius, color: SettingsPalette.inputFill)
        settingsDrawText(
            placeholder,
            in: CGRect(x: rect.minX + 12, y: rect.minY, width: rect.width - 24, height: rect.height),
            font: ThemeFonts.system(size: 12),
            color: SettingsPalette.textMuted,
            truncating: true
        )
    }

    private func drawOutlineButton(_ rect: CGRect, title: String, monogram: String) {
        settingsFillRounded(
            rect,
            radius: SettingsMetrics.generalInputRadius,
            color: SettingsPalette.outlineButtonFill
        )
        settingsStrokeRounded(
            rect.insetBy(dx: 0.5, dy: 0.5),
            radius: SettingsMetrics.generalInputRadius,
            color: SettingsPalette.divider,
            lineWidth: 1.0
        )
        let monogramFont = ThemeFonts.system(size: 11, weight: .semibold)
        let titleFont = ThemeFonts.system(size: 12)
        let monogramWidth = ceil(settingsTextSize(monogram, font: monogramFont).width)
        let titleWidth = ceil(settingsTextSize(title, font: titleFont).width)
        let gap: CGFloat = 8
        let startX = rect.midX - (monogramWidth + gap + titleWidth) / 2
        settingsDrawText(
            monogram,
            in: CGRect(x: startX, y: rect.minY, width: monogramWidth + 2, height: rect.height),
            font: monogramFont,
            color: SettingsPalette.textSecondary
        )
        settingsDrawText(
            title,
            in: CGRect(x: startX + monogramWidth + gap, y: rect.minY,
                       width: titleWidth + 2, height: rect.height),
            font: titleFont,
            color: SettingsPalette.textSecondary
        )
    }

    private func drawMintButton(_ rect: CGRect, title: String) {
        settingsFillRounded(rect, radius: SettingsMetrics.generalInputRadius, color: SettingsPalette.mint)
        settingsDrawText(
            title,
            in: rect,
            font: ThemeFonts.system(size: 12, weight: .semibold),
            color: SettingsPalette.mintText,
            alignment: .center
        )
    }

    private func drawOrDivider(_ rect: CGRect, ctx: CGContext) {
        let labelFont = ThemeFonts.system(size: 12)
        let labelWidth = ceil(settingsTextSize(copy.orLabel, font: labelFont).width) + 16
        let centerX = rect.midX
        let midY = rect.midY
        ctx.setFillColor(SettingsPalette.divider.cgColor)
        let leftWidth = max(centerX - labelWidth / 2 - rect.minX, 0)
        if leftWidth > 0 {
            ctx.fill(CGRect(x: rect.minX, y: midY, width: leftWidth, height: 1))
        }
        let rightStart = centerX + labelWidth / 2
        let rightWidth = max(rect.maxX - rightStart, 0)
        if rightWidth > 0 {
            ctx.fill(CGRect(x: rightStart, y: midY, width: rightWidth, height: 1))
        }
        settingsDrawText(
            copy.orLabel,
            in: CGRect(x: centerX - labelWidth / 2, y: rect.minY, width: labelWidth, height: rect.height),
            font: labelFont,
            color: SettingsPalette.textMuted,
            alignment: .center
        )
    }

    private func drawNoAccountRow(_ rect: CGRect) {
        let mutedFont = ThemeFonts.system(size: 12)
        let linkFont = ThemeFonts.system(size: 12, weight: .medium)
        let prefixWidth = ceil(settingsTextSize(copy.noAccountPrefix, font: mutedFont).width)
        let linkWidth = ceil(settingsTextSize(copy.signUpLabel, font: linkFont).width)
        let gap: CGFloat = 4
        let startX = rect.midX - (prefixWidth + gap + linkWidth) / 2
        settingsDrawText(
            copy.noAccountPrefix,
            in: CGRect(x: startX, y: rect.minY, width: prefixWidth + 2, height: rect.height),
            font: mutedFont,
            color: SettingsPalette.textMuted
        )
        settingsDrawText(
            copy.signUpLabel,
            in: CGRect(x: startX + prefixWidth + gap, y: rect.minY,
                       width: linkWidth + 2, height: rect.height),
            font: linkFont,
            color: SettingsPalette.textSecondary
        )
    }

    private func drawToggleRow(
        _ row: CGRect,
        switchRect: CGRect,
        title: String,
        hint: String,
        isOn: Bool,
        control: ControlID
    ) {
        let hovered = hoveredControl == control
        let pressed = pressedControl == control
        if hovered || pressed {
            settingsFillRounded(
                row,
                radius: 8,
                color: pressed ? SettingsPalette.hover : SettingsPalette.hoverSoft
            )
        }
        let textWidth = max(row.width - switchRect.width - 16, 80)
        settingsDrawText(
            title,
            in: CGRect(x: row.minX, y: row.maxY - 4 - 16, width: textWidth, height: 16),
            font: ThemeFonts.system(size: 12),
            color: hovered ? SettingsPalette.textPrimary : SettingsPalette.textSecondary
        )
        settingsDrawText(
            hint,
            in: CGRect(x: row.minX, y: row.maxY - 36, width: textWidth, height: 16),
            font: ThemeFonts.system(size: 12),
            color: SettingsPalette.textMuted,
            truncating: true
        )
        drawSwitch(in: switchRect, isOn: isOn)
    }

    /// Web `Switch`: 28×16 track (white/80 on, white/15 off), 12pt neutral-900 knob.
    private func drawSwitch(in rect: CGRect, isOn: Bool) {
        settingsFillRounded(
            rect,
            radius: rect.height / 2,
            color: isOn ? SettingsPalette.switchTrackOn : SettingsPalette.switchTrackOff
        )
        let knobSize = SettingsMetrics.switchKnobSize
        let inset: CGFloat = 2
        let knob = CGRect(
            x: isOn ? rect.maxX - inset - knobSize : rect.minX + inset,
            y: rect.midY - knobSize / 2,
            width: knobSize,
            height: knobSize
        )
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(SettingsPalette.switchKnob.cgColor)
        ctx.fillEllipse(in: knob)
    }

    private func drawWorkspaceRow(_ layout: SettingsLayout) {
        let row = layout.canvasWorkspaceRow
        let titleFont = ThemeFonts.system(size: 12)
        let titleRect = CGRect(x: row.minX, y: row.maxY - 6 - 16, width: 220, height: 16)
        settingsDrawText(copy.workspaceTitle, in: titleRect, font: titleFont,
                         color: SettingsPalette.textSecondary)
        let titleWidth = ceil(settingsTextSize(copy.workspaceTitle, font: titleFont).width)
        drawInlineBadge(
            copy.workspaceBadge,
            x: titleRect.minX + titleWidth + 8,
            centerY: titleRect.midY
        )
        let path = WorkspaceManager.shared.getWorkspaceConfig().path
        settingsDrawText(
            path,
            in: CGRect(x: row.minX, y: row.maxY - 38,
                       width: max(layout.changeDirectory.minX - row.minX - 12, 80), height: 16),
            font: ThemeFonts.system(size: 12),
            color: SettingsPalette.textFaint,
            truncating: true
        )
        drawSmallActionButton(
            layout.changeDirectory,
            title: copy.changeDirectory,
            glyph: .folderOpen,
            control: .workspaceChange
        )
        drawSmallActionButton(
            layout.rescan,
            title: copy.rescan,
            glyph: .refresh,
            control: .rescan
        )
    }

    private func drawLanguageRow(_ layout: SettingsLayout) {
        let row = layout.canvasLanguageRow
        settingsDrawText(
            copy.languageTitle,
            in: CGRect(x: row.minX, y: row.maxY - 4 - 16, width: 200, height: 16),
            font: ThemeFonts.system(size: 12),
            color: SettingsPalette.textSecondary
        )
        settingsDrawText(
            copy.languageHint,
            in: CGRect(x: row.minX, y: row.maxY - 36,
                       width: max(layout.languageChinese.minX - row.minX - 12, 80), height: 16),
            font: ThemeFonts.system(size: 12),
            color: SettingsPalette.textMuted,
            truncating: true
        )
        drawLanguagePill(
            layout.languageChinese,
            title: copy.chineseLabel,
            isSelected: languageCode == "zh",
            control: .language("zh")
        )
        drawLanguagePill(
            layout.languageEnglish,
            title: copy.englishLabel,
            isSelected: languageCode == "en",
            control: .language("en")
        )
    }

    private func drawLanguagePill(_ rect: CGRect, title: String, isSelected: Bool, control: ControlID) {
        let hovered = hoveredControl == control
        let pressed = pressedControl == control
        let fill: NSColor
        if isSelected {
            fill = SettingsPalette.pressed
        } else if pressed {
            fill = SettingsPalette.hover
        } else if hovered {
            fill = SettingsPalette.hover
        } else {
            fill = SettingsPalette.hoverSoft
        }
        settingsFillRounded(rect, radius: 8, color: fill)
        settingsDrawText(
            title,
            in: rect,
            font: ThemeFonts.system(size: 12, weight: isSelected ? .medium : .regular),
            color: isSelected ? SettingsPalette.textPrimary
                : (hovered ? SettingsPalette.textSecondary : SettingsPalette.textMuted),
            alignment: .center
        )
    }

    private func drawSmallActionButton(
        _ rect: CGRect,
        title: String,
        glyph: SettingsGlyph,
        control: ControlID
    ) {
        let hovered = hoveredControl == control
        let pressed = pressedControl == control
        let fill = pressed
            ? SettingsPalette.pressed
            : (hovered ? SettingsPalette.hover : SettingsPalette.hoverSoft)
        settingsFillRounded(rect, radius: 8, color: fill)
        settingsStrokeRounded(
            rect.insetBy(dx: 0.5, dy: 0.5),
            radius: 8,
            color: SettingsPalette.divider,
            lineWidth: 1.0
        )
        let iconRect = CGRect(x: rect.minX + 10, y: rect.midY - 6.5, width: 13, height: 13)
        glyph.draw(
            in: iconRect,
            color: hovered ? SettingsPalette.textSecondary : SettingsPalette.textMuted,
            strokeWidth: 1.6
        )
        settingsDrawText(
            title,
            in: CGRect(x: iconRect.maxX + 6, y: rect.minY,
                       width: rect.width - 10 - 13 - 6 - 8, height: rect.height),
            font: ThemeFonts.system(size: 11),
            color: hovered ? SettingsPalette.textPrimary : SettingsPalette.textSecondary,
            truncating: true
        )
    }

    private func drawInlineBadge(_ text: String, x: CGFloat, centerY: CGFloat) {
        let font = ThemeFonts.system(size: 9, weight: .medium)
        let width = ceil(settingsTextSize(text, font: font).width) + 10
        let rect = CGRect(x: x, y: centerY - 7, width: width, height: 14)
        // Web platform badge: rounded-full, bg-white/[0.08], neutral-300 text.
        settingsFillRounded(rect, radius: rect.height / 2, color: SettingsPalette.hover)
        settingsDrawText(text, in: rect, font: font, color: SettingsPalette.textStrong,
                         alignment: .center)
    }

    private func drawAvatar(in rect: CGRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        ctx.addPath(CGPath(ellipseIn: rect, transform: nil))
        ctx.clip()
        let gradient = NSGradient(colors: [SettingsPalette.avatarTop, SettingsPalette.avatarBottom])
        gradient?.draw(in: rect, angle: -90)
        ctx.restoreGState()

        // A tiny, friendly guest face: two eyes and a soft frown.
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.saveGState()
        ctx.setFillColor(SettingsPalette.avatarInk.withAlphaComponent(0.85).cgColor)
        let eyeSize = rect.width * 0.11
        ctx.fillEllipse(in: CGRect(
            x: rect.minX + rect.width * 0.30 - eyeSize / 2,
            y: rect.minY + rect.height * 0.46,
            width: eyeSize,
            height: eyeSize * 1.25
        ))
        ctx.fillEllipse(in: CGRect(
            x: rect.minX + rect.width * 0.70 - eyeSize / 2,
            y: rect.minY + rect.height * 0.46,
            width: eyeSize,
            height: eyeSize * 1.25
        ))
        ctx.setStrokeColor(SettingsPalette.avatarInk.withAlphaComponent(0.85).cgColor)
        ctx.setLineWidth(1.6)
        ctx.setLineCap(.round)
        let mouth = CGMutablePath()
        mouth.move(to: CGPoint(x: rect.minX + rect.width * 0.34, y: rect.minY + rect.height * 0.24))
        mouth.addQuadCurve(
            to: CGPoint(x: rect.minX + rect.width * 0.66, y: rect.minY + rect.height * 0.24),
            control: CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.38)
        )
        ctx.addPath(mouth)
        ctx.strokePath()
        ctx.restoreGState()
    }

    private func drawSectionLabel(_ text: String, in rect: CGRect, showsHint: Bool) {
        settingsDrawText(
            text,
            in: rect,
            font: ThemeFonts.mono(size: 9, weight: .medium),
            color: SettingsPalette.textFaint,
            kern: 1.3
        )
        if showsHint {
            let width = ceil(settingsTextSize(text, font: ThemeFonts.mono(size: 9, weight: .medium), kern: 1.3).width)
            drawHintBadge(center: CGPoint(x: rect.minX + width + 13, y: rect.midY))
        }
    }

    private func drawHintBadge(center: CGPoint) {
        let radius: CGFloat = 6
        let rect = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
        settingsStrokeRounded(rect, radius: radius, color: NSColor(white: 1.0, alpha: 0.22), lineWidth: 1.0)
        settingsDrawText(
            "?",
            in: rect,
            font: ThemeFonts.mono(size: 8, weight: .medium),
            color: NSColor(white: 1.0, alpha: 0.42),
            alignment: .center
        )
    }

    private func drawActionButton(_ rect: CGRect, title: String, glyph: SettingsGlyph, control: ControlID) {
        let hovered = hoveredControl == control
        let pressed = pressedControl == control
        let fill = pressed
            ? SettingsPalette.pressed
            : (hovered ? SettingsPalette.hover : SettingsPalette.hoverSoft)
        settingsFillRounded(rect, radius: 12, color: fill)
        settingsStrokeRounded(rect.insetBy(dx: 0.5, dy: 0.5), radius: 12,
                              color: SettingsPalette.divider, lineWidth: 1.0)

        let iconRect = CGRect(x: rect.minX + 12, y: rect.midY - 7, width: 14, height: 14)
        glyph.draw(in: iconRect, color: hovered ? SettingsPalette.textSecondary : SettingsPalette.textTertiary,
                   strokeWidth: 1.7)
        settingsDrawText(
            title,
            in: CGRect(x: iconRect.maxX + 7, y: rect.minY,
                       width: rect.width - 12 - 14 - 7 - 10, height: rect.height),
            font: ThemeFonts.mono(size: 12, weight: .medium),
            color: hovered ? SettingsPalette.textPrimary : SettingsPalette.textSecondary,
            truncating: true
        )
    }

    private func drawLanguageSegment(_ rect: CGRect, title: String, isSelected: Bool, control: ControlID) {
        let hovered = hoveredControl == control
        let fill: NSColor = isSelected
            ? SettingsPalette.pressed
            : (hovered ? SettingsPalette.hover : SettingsPalette.hoverSoft)
        settingsFillRounded(rect, radius: SettingsMetrics.languageRadius, color: fill)
        if isSelected {
            settingsStrokeRounded(rect.insetBy(dx: 0.5, dy: 0.5), radius: SettingsMetrics.languageRadius,
                                  color: SettingsPalette.hairline, lineWidth: 1.0)
        }
        settingsDrawText(
            title,
            in: rect,
            font: ThemeFonts.mono(size: 12, weight: isSelected ? .semibold : .regular),
            color: isSelected ? SettingsPalette.textPrimary : (hovered ? SettingsPalette.textSecondary : SettingsPalette.textMuted),
            alignment: .center
        )
    }

    // MARK: AI Assistant Tab

    private func drawAIAssistant(ctx: CGContext, layout: SettingsLayout) {
        drawSectionLabel(copy.agentSectionLabel, in: layout.agentSectionLabel, showsHint: true)

        for (index, agent) in copy.agents.enumerated() where layout.agentCards.indices.contains(index) {
            drawAgentCard(layout.agentCards[index], index: index, agent: agent)
        }

        drawSectionLabel(copy.defaultAgentLabel, in: layout.defaultAgentLabel, showsHint: true)
        for (index, segment) in layout.agentSegments.enumerated() where copy.agents.indices.contains(index) {
            let isSelected = selectedAgentIndex == index
            drawLanguageSegment(
                segment,
                title: copy.agents[index].title,
                isSelected: isSelected,
                control: .agentSegment(index)
            )
        }
    }

    private func drawAgentCard(_ rect: CGRect, index: Int, agent: SettingsAgentCopy) {
        let isSelected = selectedAgentIndex == index
        let hovered = hoveredControl == .agent(index)
        let pressed = pressedControl == .agent(index)

        let fill: NSColor
        if isSelected {
            fill = NSColor(hex: "#1b2420")
        } else if pressed {
            fill = NSColor(hex: "#232323")
        } else if hovered {
            fill = NSColor(hex: "#1c1c1c")
        } else {
            fill = SettingsPalette.card
        }
        settingsFillRounded(rect, radius: SettingsMetrics.agentCardRadius, color: fill)
        settingsStrokeRounded(
            rect.insetBy(dx: 0.5, dy: 0.5),
            radius: SettingsMetrics.agentCardRadius,
            color: isSelected ? SettingsPalette.mint.withAlphaComponent(0.75) : SettingsPalette.hairline,
            lineWidth: isSelected ? 1.4 : 1.0
        )

        let contentX = rect.minX + 14
        let contentRight = rect.maxX - 14
        let titleFont = ThemeFonts.mono(size: 12, weight: .semibold)
        let titleRect = CGRect(x: contentX, y: rect.maxY - 12 - 16, width: contentRight - contentX - 30, height: 16)
        settingsDrawText(agent.title, in: titleRect, font: titleFont,
                         color: SettingsPalette.textPrimary, truncating: true)

        var badgeCursor = contentX + ceil(settingsTextSize(agent.title, font: titleFont).width) + 8
        if let badge = agent.badge {
            let badgeFont = ThemeFonts.mono(size: 9, weight: .medium)
            let badgeWidth = ceil(settingsTextSize(badge, font: badgeFont).width) + 12
            let badgeRect = CGRect(x: badgeCursor, y: titleRect.midY - 8, width: badgeWidth, height: 16)
            settingsFillRounded(badgeRect, radius: 8, color: SettingsPalette.mint)
            settingsDrawText(badge, in: badgeRect, font: badgeFont,
                             color: SettingsPalette.mintText, alignment: .center)
            badgeCursor = badgeRect.maxX + 8
        }
        settingsDrawText(
            agent.handle,
            in: CGRect(x: badgeCursor, y: titleRect.minY, width: contentRight - badgeCursor - 30, height: 16),
            font: ThemeFonts.mono(size: 11),
            color: SettingsPalette.textFaint,
            truncating: true
        )

        // Radio / check on the right.
        let radioSize: CGFloat = 20
        let radioRect = CGRect(x: contentRight - radioSize, y: titleRect.midY - radioSize / 2,
                               width: radioSize, height: radioSize)
        if isSelected {
            guard let ctx = NSGraphicsContext.current?.cgContext else { return }
            ctx.setFillColor(SettingsPalette.mint.cgColor)
            ctx.fillEllipse(in: radioRect)
            SettingsGlyph.check.draw(
                in: radioRect.insetBy(dx: 4, dy: 4),
                color: SettingsPalette.mintText,
                strokeWidth: 2.2
            )
        } else {
            settingsStrokeRounded(radioRect.insetBy(dx: 0.5, dy: 0.5), radius: radioSize / 2,
                                  color: NSColor(white: 1.0, alpha: 0.18), lineWidth: 1.2)
        }

        settingsDrawText(
            agent.description,
            in: CGRect(x: contentX, y: rect.minY + 32, width: contentRight - contentX, height: 16),
            font: ThemeFonts.mono(size: 11.5),
            color: SettingsPalette.textStrong,
            truncating: true
        )
        settingsDrawText(
            agent.models,
            in: CGRect(x: contentX, y: rect.minY + 12, width: contentRight - contentX, height: 14),
            font: ThemeFonts.mono(size: 10.5),
            color: SettingsPalette.textFaint,
            truncating: true
        )
    }

    // MARK: AI Providers Tab

    private func drawAIProviders(ctx: CGContext, layout: SettingsLayout) {
        drawSectionLabel(copy.providersSectionLabel, in: layout.providersLabel, showsHint: true)

        for (index, provider) in copy.providers.enumerated() where layout.providerRows.indices.contains(index) {
            drawProviderRow(layout.providerRows[index], provider: provider)
        }
        settingsDrawParagraph(
            copy.providersHint,
            in: layout.providersHint,
            font: ThemeFonts.mono(size: 10.5),
            color: SettingsPalette.textFaint,
            lineHeight: 15
        )

        drawSectionLabel(copy.setupSectionLabel, in: layout.setupLabel, showsHint: false)
        settingsDrawParagraph(
            copy.onboardingHint,
            in: layout.setupHint,
            font: ThemeFonts.mono(size: 10.5),
            color: SettingsPalette.textFaint,
            lineHeight: 15
        )
        drawPrimaryButton(
            layout.onboardingButton,
            title: copy.onboardingButton,
            glyph: .sparkle,
            control: .onboarding
        )
    }

    private func drawProviderRow(_ rect: CGRect, provider: SettingsProviderCopy) {
        settingsFillRounded(rect, radius: SettingsMetrics.agentCardRadius, color: SettingsPalette.hoverSoft)
        settingsStrokeRounded(
            rect.insetBy(dx: 0.5, dy: 0.5),
            radius: SettingsMetrics.agentCardRadius,
            color: SettingsPalette.hairline,
            lineWidth: 1.0
        )

        let badgeSize: CGFloat = 32
        let badgeRect = CGRect(x: rect.minX + 14, y: rect.midY - badgeSize / 2,
                               width: badgeSize, height: badgeSize)
        settingsFillRounded(badgeRect, radius: badgeSize / 2, color: SettingsPalette.hoverSoft)
        settingsStrokeRounded(badgeRect.insetBy(dx: 0.5, dy: 0.5), radius: badgeSize / 2,
                              color: SettingsPalette.hairline, lineWidth: 1.0)
        settingsDrawText(
            provider.monogram,
            in: badgeRect,
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: SettingsPalette.textTertiary,
            alignment: .center
        )

        // Two-line label block vertically centred in the row: name (16) above
        // subtitle (14) with a 2pt gap, so their centres straddle midY evenly.
        settingsDrawText(
            provider.name,
            in: CGRect(x: badgeRect.maxX + 12, y: rect.midY, width: rect.width * 0.4, height: 16),
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: SettingsPalette.textSecondary,
            truncating: true
        )
        settingsDrawText(
            provider.subtitle,
            in: CGRect(x: badgeRect.maxX + 12, y: rect.midY - 16, width: rect.width * 0.5, height: 14),
            font: ThemeFonts.mono(size: 10.5),
            color: SettingsPalette.textFaint,
            truncating: true
        )

        let statusFont = ThemeFonts.mono(size: 10.5)
        let statusWidth = ceil(settingsTextSize(copy.notConfigured, font: statusFont).width)
        settingsDrawText(
            copy.notConfigured,
            in: CGRect(x: rect.maxX - 14 - statusWidth, y: rect.minY, width: statusWidth, height: rect.height),
            font: statusFont,
            color: SettingsPalette.textFaint,
            alignment: .right
        )
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(SettingsPalette.statusIdle.cgColor)
        ctx.fillEllipse(in: CGRect(
            x: rect.maxX - 14 - statusWidth - 10,
            y: rect.midY - 3,
            width: 6,
            height: 6
        ))
    }

    private func drawPrimaryButton(_ rect: CGRect, title: String, glyph: SettingsGlyph, control: ControlID) {
        let hovered = hoveredControl == control
        let pressed = pressedControl == control
        let fill: NSColor
        if pressed {
            fill = SettingsPalette.mintBright.blended(withFraction: 0.12, of: .black) ?? SettingsPalette.mintBright
        } else if hovered {
            fill = SettingsPalette.mintBright.blended(withFraction: 0.22, of: .white) ?? SettingsPalette.mintBright
        } else {
            fill = SettingsPalette.mintBright
        }
        settingsFillRounded(rect, radius: 12, color: fill)

        let iconRect = CGRect(x: rect.minX + 14, y: rect.midY - 7, width: 14, height: 14)
        glyph.draw(in: iconRect, color: SettingsPalette.mintText, strokeWidth: 1.8)
        settingsDrawText(
            title,
            in: CGRect(x: iconRect.maxX + 8, y: rect.minY,
                       width: rect.width - 14 - 14 - 8 - 1, height: rect.height),
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: SettingsPalette.mintText
        )
    }

    // MARK: Shortcuts Tab

    private func drawShortcuts(ctx: CGContext, layout: SettingsLayout) {
        settingsDrawParagraph(
            copy.shortcutsHint,
            in: layout.shortcutsHint,
            font: ThemeFonts.mono(size: 10.5),
            color: SettingsPalette.textFaint,
            lineHeight: 16
        )

        let labelFont = ThemeFonts.mono(size: 11.5)
        let keyFont = ThemeFonts.mono(size: 10, weight: .medium)
        for (index, shortcut) in copy.shortcuts.enumerated() where layout.shortcutRows.indices.contains(index) {
            let row = layout.shortcutRows[index]
            settingsFillRounded(row, radius: 10, color: SettingsPalette.hoverSoft)

            let keyRects = keycapRects(for: shortcut.keys, in: row, font: keyFont)
            let keyClusterLeft = keyRects.first?.minX ?? row.maxX
            settingsDrawText(
                shortcut.name,
                in: CGRect(x: row.minX + 12, y: row.minY,
                           width: max(keyClusterLeft - row.minX - 24, 40), height: row.height),
                font: labelFont,
                color: SettingsPalette.textStrong,
                truncating: true
            )

            let slashFont = ThemeFonts.mono(size: 10)
            var cursorX = keyClusterLeft
            for (keyIndex, key) in shortcut.keys.components(separatedBy: " / ").enumerated() {
                guard keyIndex < keyRects.count else { break }
                if keyIndex > 0 {
                    settingsDrawText(
                        "/",
                        in: CGRect(x: cursorX, y: row.minY, width: 8, height: row.height),
                        font: slashFont,
                        color: SettingsPalette.textFaint,
                        alignment: .center
                    )
                    cursorX += 8
                }
                let keyRect = CGRect(x: cursorX, y: row.midY - SettingsMetrics.keycapHeight / 2,
                                     width: keyRects[keyIndex].width, height: SettingsMetrics.keycapHeight)
                settingsFillRounded(keyRect, radius: 5, color: SettingsPalette.hover)
                settingsStrokeRounded(keyRect.insetBy(dx: 0.5, dy: 0.5), radius: 5,
                                      color: SettingsPalette.divider, lineWidth: 1.0)
                settingsDrawText(key, in: keyRect, font: keyFont,
                                 color: SettingsPalette.textSecondary, alignment: .center)
                cursorX += keyRect.width
            }
        }
    }

    private func keycapRects(for keys: String, in row: CGRect, font: NSFont) -> [CGRect] {
        let parts = keys.components(separatedBy: " / ")
        let widths = parts.map { max(22, ceil(settingsTextSize($0, font: font).width) + 12) }
        let total = widths.reduce(0, +) + CGFloat(max(parts.count - 1, 0)) * 8
        var x = row.maxX - 12 - total
        var rects: [CGRect] = []
        for width in widths {
            rects.append(CGRect(x: x, y: row.midY - SettingsMetrics.keycapHeight / 2,
                                width: width, height: SettingsMetrics.keycapHeight))
            x += width + 8
        }
        return rects
    }
}

// MARK: - NSTextFieldDelegate

extension SettingsDrawerView: NSTextFieldDelegate {

    public func controlTextDidChange(_ obj: Notification) {
        guard let field = obj.object as? NSTextField, field === nameField else { return }
        UserDefaults.standard.set(field.stringValue, forKey: SettingsDrawerView.collabNameDefaultsKey)
        needsDisplay = true
    }

    public func controlTextDidBeginEditing(_ obj: Notification) {
        guard let field = obj.object as? NSTextField, field === nameField else { return }
        nameFieldEditing = true
        needsDisplay = true
    }

    public func controlTextDidEndEditing(_ obj: Notification) {
        guard let field = obj.object as? NSTextField, field === nameField else { return }
        nameFieldEditing = false
        UserDefaults.standard.set(field.stringValue, forKey: SettingsDrawerView.collabNameDefaultsKey)
        needsDisplay = true
    }
}
