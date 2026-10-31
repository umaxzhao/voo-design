//
//  SettingsDrawerView.swift
//  native_studio
//
//  Native "Settings & Preferences" modal for VOO Design, replicating the web
//  settings drawer (web_settings.png): a dimmed scrim, a 1040×760 rounded-24
//  dialog, a 208pt sidebar with four tabs and a scroll-free content pane for
//  General / AI Assistant / AI Providers / Shortcuts.
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

/// The four sections of the settings drawer.
public enum SettingsTab: String, CaseIterable, Sendable {
    case general
    case aiAssistant
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

    static let tabPadding: CGFloat = 12
    static let tabGap: CGFloat = 8
    static let tabHeight: CGFloat = 48
    static let tabRadius: CGFloat = 12
    static let tabIconSize: CGFloat = 15
    static let tabIconInset: CGFloat = 12
    static let tabLabelGap: CGFloat = 8

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

    let profileLabel: String
    let guestName: String
    let guestBadge: String
    let nameFieldLabel: String
    let namePlaceholder: String

    let workspaceLabel: String
    let activeWorkspace: String
    let workspaceBadge: String
    let workspaceName: String
    let changeDirectory: String
    let rescan: String

    let languageLabel: String
    let chineseLabel: String
    let englishLabel: String

    // Canvas (web `settings.canvas.*`, persisted `voo.editor.showRulers`).
    let canvasLabel: String
    let showRulersLabel: String

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
        tabTitles: ["General", "AI Assistant", "AI Providers", "Shortcuts"],
        profileLabel: "PROFILE",
        guestName: "Guest",
        guestBadge: "Local guest profile",
        nameFieldLabel: "Display name",
        namePlaceholder: "Your name",
        workspaceLabel: "PROJECT WORKSPACE",
        activeWorkspace: "ACTIVE WORKSPACE",
        workspaceBadge: "[macOS Native]",
        workspaceName: "Browser Workspace",
        changeDirectory: "Change Directory",
        rescan: "Rescan",
        languageLabel: "LANGUAGE",
        chineseLabel: "简体中文",
        englishLabel: "English",
        canvasLabel: "CANVAS",
        showRulersLabel: "Show rulers",
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
        tabTitles: ["常规偏好", "AI 助手", "AI 供应商", "快捷键速查"],
        profileLabel: "个人资料",
        guestName: "访客",
        guestBadge: "本地访客资料",
        nameFieldLabel: "显示名称",
        namePlaceholder: "你的昵称",
        workspaceLabel: "项目工作区",
        activeWorkspace: "当前工作区",
        workspaceBadge: "[macOS 原生]",
        workspaceName: "Browser Workspace",
        changeDirectory: "更换目录",
        rescan: "重新扫描",
        languageLabel: "语言",
        chineseLabel: "简体中文",
        englishLabel: "English",
        canvasLabel: "画布",
        showRulersLabel: "显示标尺",
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
    }

    private var languageCode: String = "en"
    private var copy: SettingsCopy = .english
    private var selectedAgentIndex: Int = 0
    private var showsRulers: Bool = false
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
        field.font = ThemeFonts.mono(size: 12)
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
        // Live-sync with ⇧R / the zoom-bar toggle (both persist the same key).
        defaultsObserver = NotificationCenter.default.addObserver(
            forName: UserDefaults.didChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            let next = UserDefaults.standard.bool(forKey: SettingsDrawerView.showRulersDefaultsKey)
            guard next != self.showsRulers else { return }
            self.showsRulers = next
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
        // Re-read the ruler pref so an ⇧R / zoom-bar toggle made while the drawer
        // was closed shows up immediately (web live-syncs the same setting).
        showsRulers = UserDefaults.standard.bool(forKey: SettingsDrawerView.showRulersDefaultsKey)
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
                .font: ThemeFonts.mono(size: 12),
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

        // General
        let profileCard: CGRect
        let profileLabel: CGRect
        let profileAvatar: CGRect
        let profileName: CGRect
        let profileSubtitle: CGRect
        let nameLabel: CGRect
        let nameInput: CGRect
        let workspaceLabel: CGRect
        let workspaceCard: CGRect
        let workspaceChip: CGRect
        let workspacePath: CGRect
        let changeDirectory: CGRect
        let rescan: CGRect
        let languageLabel: CGRect
        let languageChinese: CGRect
        let languageEnglish: CGRect
        let canvasLabel: CGRect
        let canvasRow: CGRect
        let canvasSwitch: CGRect

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

        let contentX = sidebar.maxX + SettingsMetrics.contentPadding
        let contentWidth = modal.maxX - SettingsMetrics.contentPadding - contentX - 1
        let headingTop = header.minY - SettingsMetrics.contentPadding
        let heading = rect(top: headingTop - 3, height: SettingsMetrics.headingHeight,
                           x: contentX, width: contentWidth)
        let stackTop = headingTop - SettingsMetrics.headingHeight - SettingsMetrics.headingGap

        // MARK: General layout
        let profileCard = rect(top: stackTop, height: SettingsMetrics.profileCardHeight,
                               x: contentX, width: contentWidth)
        let cardTop = profileCard.maxY
        let profileLabel = rect(top: cardTop - 16, height: 14, x: contentX + 16, width: contentWidth - 32)
        let profileAvatar = rect(top: cardTop - 42, height: SettingsMetrics.avatarSize,
                                 x: contentX + 16, width: SettingsMetrics.avatarSize)
        let profileName = rect(top: cardTop - 47, height: 16,
                               x: profileAvatar.maxX + 12,
                               width: max(contentWidth - 32 - 52, 120))
        let profileSubtitle = rect(top: cardTop - 63, height: 14,
                                   x: profileName.minX, width: profileName.width)
        let nameLabel = rect(top: cardTop - 98, height: 15, x: contentX + 16, width: contentWidth - 32)
        let nameInput = rect(top: cardTop - 119, height: SettingsMetrics.inputHeight,
                             x: contentX + 16, width: contentWidth - 32)

        let sectionX = contentX + SettingsMetrics.sectionPadding
        let sectionWidth = contentWidth - SettingsMetrics.sectionPadding * 2
        let workspaceTop = profileCard.minY - SettingsMetrics.sectionGap
        let workspaceLabel = rect(top: workspaceTop - 16, height: 14, x: sectionX, width: sectionWidth)
        let workspaceCard = rect(
            top: workspaceTop - 16 - 14 - 16,
            height: SettingsMetrics.workspaceCardHeight,
            x: sectionX,
            width: sectionWidth
        )
        let chipTextSize = settingsTextSize(copy.workspaceBadge, font: ThemeFonts.mono(size: 10, weight: .medium))
        let chipWidth = ceil(chipTextSize.width) + 14
        // Badge centre matches the "Active Workspace" label row centre
        // (folder icon spans 14…29 from the card top → centre 21.5).
        let workspaceChip = rect(
            top: workspaceCard.maxY - 12.5,
            height: 18,
            x: workspaceCard.maxX - SettingsMetrics.workspaceCardPadding - chipWidth,
            width: chipWidth
        )
        let workspacePath = rect(
            top: workspaceCard.maxY - SettingsMetrics.workspaceCardPadding - 17 - 8,
            height: 18,
            x: workspaceCard.minX + SettingsMetrics.workspaceCardPadding,
            width: workspaceCard.width - SettingsMetrics.workspaceCardPadding * 2
        )
        let changeTextSize = settingsTextSize(copy.changeDirectory, font: ThemeFonts.mono(size: 12, weight: .medium))
        let rescanTextSize = settingsTextSize(copy.rescan, font: ThemeFonts.mono(size: 12, weight: .medium))
        let changeWidth = ceil(changeTextSize.width) + 45
        let rescanWidth = ceil(rescanTextSize.width) + 45
        let actionsTop = workspaceCard.minY - 12 - 4
        let changeDirectory = rect(top: actionsTop, height: SettingsMetrics.buttonHeight,
                                   x: sectionX, width: changeWidth)
        let rescan = rect(top: actionsTop, height: SettingsMetrics.buttonHeight,
                          x: changeDirectory.maxX + 8, width: rescanWidth)

        let languageTop = changeDirectory.minY - SettingsMetrics.sectionGap - 16
        let languageLabel = rect(top: languageTop - 16, height: 14, x: sectionX, width: sectionWidth)
        let segmentsTop = languageTop - 16 - 14 - 16
        let languageGap: CGFloat = 8
        let segmentWidth = (sectionWidth - languageGap) / 2
        let languageChinese = rect(top: segmentsTop, height: SettingsMetrics.languageHeight,
                                   x: sectionX, width: segmentWidth)
        let languageEnglish = rect(top: segmentsTop, height: SettingsMetrics.languageHeight,
                                   x: sectionX + segmentWidth + languageGap, width: segmentWidth)

        // Canvas: compact section label + one 28pt toggle row (UI_SPEC §9 content
        // rhythm: section label 48pt below the previous content, then 16pt gap).
        let segmentsBottom = segmentsTop - SettingsMetrics.languageHeight
        let canvasSectionTop = segmentsBottom - SettingsMetrics.sectionGap - 16
        let canvasLabel = rect(top: canvasSectionTop - 16, height: 14, x: sectionX, width: sectionWidth)
        let canvasRowTop = canvasSectionTop - 16 - 14 - 16
        let canvasRow = rect(top: canvasRowTop, height: 28, x: sectionX, width: sectionWidth)
        let canvasSwitchWidth: CGFloat = 32
        let canvasSwitchHeight: CGFloat = 20
        let canvasSwitch = rect(
            top: canvasRowTop - (28 - canvasSwitchHeight) / 2,
            height: canvasSwitchHeight,
            x: canvasRow.maxX - canvasSwitchWidth,
            width: canvasSwitchWidth
        )

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
            profileCard: profileCard,
            profileLabel: profileLabel,
            profileAvatar: profileAvatar,
            profileName: profileName,
            profileSubtitle: profileSubtitle,
            nameLabel: nameLabel,
            nameInput: nameInput,
            workspaceLabel: workspaceLabel,
            workspaceCard: workspaceCard,
            workspaceChip: workspaceChip,
            workspacePath: workspacePath,
            changeDirectory: changeDirectory,
            rescan: rescan,
            languageLabel: languageLabel,
            languageChinese: languageChinese,
            languageEnglish: languageEnglish,
            canvasLabel: canvasLabel,
            canvasRow: canvasRow,
            canvasSwitch: canvasSwitch,
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
            (.tab(.aiProviders), "Settings.Tab.AIProviders"),
            (.tab(.shortcuts), "Settings.Tab.Shortcuts"),
            (.language("zh"), "Settings.Language.zh"),
            (.language("en"), "Settings.Language.en"),
            (.workspaceChange, "Settings.Workspace.ChangeDirectory"),
            (.rescan, "Settings.Workspace.Rescan"),
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
        // The rulers control is a switch, not a button.
        proxies[.showRulers]?.setAccessibilityRole(.checkBox)
    }

    private func activeControlRects(_ layout: SettingsLayout) -> [(ControlID, CGRect)] {
        var rects: [(ControlID, CGRect)] = [
            (.close, layout.close),
            (.tab(.general), layout.tabRows[0]),
            (.tab(.aiAssistant), layout.tabRows[1]),
            (.tab(.aiProviders), layout.tabRows[2]),
            (.tab(.shortcuts), layout.tabRows[3])
        ]

        switch activeTab {
        case .general:
            rects.append((.language("zh"), layout.languageChinese))
            rects.append((.language("en"), layout.languageEnglish))
            rects.append((.workspaceChange, layout.changeDirectory))
            rects.append((.rescan, layout.rescan))
            rects.append((.showRulers, layout.canvasRow))
        case .aiAssistant:
            for (index, rect) in layout.agentCards.enumerated() {
                rects.append((.agent(index), rect))
            }
            for (index, rect) in layout.agentSegments.enumerated() {
                rects.append((.agentSegment(index), rect))
            }
        case .aiProviders:
            rects.append((.onboarding, layout.onboardingButton))
        case .shortcuts:
            break
        }
        return rects
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

        nameField.isHidden = activeTab != .general
        if activeTab == .general {
            nameField.frame = CGRect(
                x: layout.nameInput.minX + 12,
                y: layout.nameInput.midY - 6,
                width: layout.nameInput.width - 24,
                height: 18
            )
        }
    }

    private func accessibilityIdentifier(for control: ControlID) -> String? {
        switch control {
        case .close: return "Settings.Close"
        case .tab(.general): return "Settings.Tab.General"
        case .tab(.aiAssistant): return "Settings.Tab.AIAssistant"
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
            addCursorRect(layout.nameInput, cursor: .iBeam)
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
            if activeTab == .general,
               !nameField.isHidden,
               layout.nameInput.contains(point),
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
        // Swallow scrolling so the editor underneath never scrolls.
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

    private func selectAgent(_ index: Int) {
        guard copy.agents.indices.contains(index) else { return }
        selectedAgentIndex = index
        UserDefaults.standard.set(
            copy.agents[index].provider,
            forKey: SettingsDrawerView.agentProviderDefaultsKey
        )
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

        let titleFont = ThemeFonts.mono(size: 12, weight: .medium)
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

        let tabFont = ThemeFonts.mono(size: 11)
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

            let tint = isActive
                ? SettingsPalette.textSecondary
                : (isHovered ? SettingsPalette.textTertiary : SettingsPalette.textMuted)
            let iconRect = CGRect(
                x: row.minX + SettingsMetrics.tabIconInset,
                y: row.midY - SettingsMetrics.tabIconSize / 2,
                width: SettingsMetrics.tabIconSize,
                height: SettingsMetrics.tabIconSize
            )
            switch tab {
            case .general:
                SettingsGlyph.sliders.draw(in: iconRect, color: tint, strokeWidth: 1.7)
            case .aiAssistant, .aiProviders:
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
        // Content pane background is the dialog fill; the heading is shared.
        let headings: [SettingsTab: String] = [
            .general: copy.tabTitles[0],
            .aiAssistant: copy.tabTitles[1],
            .aiProviders: copy.tabTitles[2],
            .shortcuts: copy.tabTitles[3]
        ]
        settingsDrawText(
            headings[activeTab] ?? copy.tabTitles[0],
            in: layout.heading,
            font: ThemeFonts.mono(size: 12),
            color: SettingsPalette.textSecondary
        )

        switch activeTab {
        case .general:
            drawGeneral(ctx: ctx, layout: layout)
        case .aiAssistant:
            drawAIAssistant(ctx: ctx, layout: layout)
        case .aiProviders:
            drawAIProviders(ctx: ctx, layout: layout)
        case .shortcuts:
            drawShortcuts(ctx: ctx, layout: layout)
        }
    }

    // MARK: General Tab

    private func drawGeneral(ctx: CGContext, layout: SettingsLayout) {
        // Profile card.
        settingsFillRounded(layout.profileCard, radius: SettingsMetrics.cardRadius, color: SettingsPalette.card)
        drawSectionLabel(
            copy.profileLabel,
            in: layout.profileLabel,
            showsHint: true
        )
        drawAvatar(in: layout.profileAvatar)
        let displayName = nameField.stringValue.isEmpty ? copy.guestName : nameField.stringValue
        settingsDrawText(
            displayName,
            in: layout.profileName,
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: SettingsPalette.textSecondary,
            truncating: true
        )
        settingsDrawText(
            copy.guestBadge,
            in: layout.profileSubtitle,
            font: ThemeFonts.mono(size: 10),
            color: SettingsPalette.textFaint,
            truncating: true
        )
        settingsDrawText(
            copy.nameFieldLabel,
            in: layout.nameLabel,
            font: ThemeFonts.mono(size: 10, weight: .medium),
            color: SettingsPalette.textFaint,
            kern: 0.4
        )

        settingsFillRounded(layout.nameInput, radius: SettingsMetrics.inputRadius, color: SettingsPalette.input)
        if nameFieldEditing || nameField.currentEditor() != nil {
            settingsStrokeRounded(
                layout.nameInput.insetBy(dx: 0.5, dy: 0.5),
                radius: SettingsMetrics.inputRadius,
                color: SettingsPalette.mint.withAlphaComponent(0.65),
                lineWidth: 1.0
            )
        }

        // Project workspace.
        drawSectionLabel(copy.workspaceLabel, in: layout.workspaceLabel, showsHint: true)

        settingsFillRounded(
            layout.workspaceCard,
            radius: SettingsMetrics.workspaceCardRadius,
            color: SettingsPalette.hoverSoft
        )
        settingsStrokeRounded(
            layout.workspaceCard.insetBy(dx: 0.5, dy: 0.5),
            radius: SettingsMetrics.workspaceCardRadius,
            color: SettingsPalette.hairline,
            lineWidth: 1.0
        )

        let folderRect = CGRect(
            x: layout.workspaceCard.minX + SettingsMetrics.workspaceCardPadding,
            y: layout.workspaceCard.maxY - SettingsMetrics.workspaceCardPadding - 15,
            width: 15,
            height: 15
        )
        SettingsGlyph.folder.draw(in: folderRect, color: SettingsPalette.mint, strokeWidth: 1.7)
        settingsDrawText(
            copy.activeWorkspace,
            in: CGRect(
                x: folderRect.maxX + 8,
                y: folderRect.minY - 1,
                width: max(layout.workspaceChip.minX - folderRect.maxX - 20, 40),
                height: 17
            ),
            font: ThemeFonts.mono(size: 10, weight: .medium),
            color: SettingsPalette.textMuted,
            truncating: true,
            kern: 0.4
        )
        settingsFillRounded(layout.workspaceChip, radius: 9, color: SettingsPalette.hover)
        let wsConfig = WorkspaceManager.shared.getWorkspaceConfig()
        // Web shows the storage-driver platform badge (`settings.workspace.badgeDesktop`,
        // e.g. "[macOS Native]"), not a custom/default workspace label.
        settingsDrawText(
            copy.workspaceBadge,
            in: layout.workspaceChip,
            font: ThemeFonts.mono(size: 10, weight: .medium),
            color: SettingsPalette.textStrong,
            alignment: .center
        )
        settingsDrawText(
            wsConfig.path,
            in: layout.workspacePath,
            font: ThemeFonts.mono(size: 12),
            color: SettingsPalette.textSecondary,
            truncating: true
        )

        drawActionButton(
            layout.changeDirectory,
            title: copy.changeDirectory,
            glyph: .folderOpen,
            control: .workspaceChange
        )
        drawActionButton(
            layout.rescan,
            title: copy.rescan,
            glyph: .refresh,
            control: .rescan
        )

        // Language.
        drawSectionLabel(copy.languageLabel, in: layout.languageLabel, showsHint: true)
        drawLanguageSegment(
            layout.languageChinese,
            title: copy.chineseLabel,
            isSelected: languageCode == "zh",
            control: .language("zh")
        )
        drawLanguageSegment(
            layout.languageEnglish,
            title: copy.englishLabel,
            isSelected: languageCode == "en",
            control: .language("en")
        )

        // Canvas — one "Show rulers" toggle row (web settings.canvas.showRulers).
        drawSectionLabel(copy.canvasLabel, in: layout.canvasLabel, showsHint: false)
        drawShowRulersRow(layout.canvasRow, switchRect: layout.canvasSwitch)
    }

    private func drawShowRulersRow(_ row: CGRect, switchRect: CGRect) {
        let isHovered = hoveredControl == .showRulers
        let isPressed = pressedControl == .showRulers
        if isHovered || isPressed {
            settingsFillRounded(
                row,
                radius: 8,
                color: isPressed ? SettingsPalette.hover : SettingsPalette.hoverSoft
            )
        }
        settingsDrawText(
            copy.showRulersLabel,
            in: CGRect(
                x: row.minX,
                y: row.minY,
                width: max(row.width - switchRect.width - 12, 60),
                height: row.height
            ),
            font: ThemeFonts.mono(size: 12),
            color: isHovered ? SettingsPalette.textPrimary : SettingsPalette.textSecondary
        )
        drawSwitch(in: switchRect)
    }

    /// Square-ish web `Switch` (white/80 on, white/15 off, dark knob), sized to
    /// the settings 20pt control height.
    private func drawSwitch(in rect: CGRect) {
        settingsFillRounded(
            rect,
            radius: rect.height / 2,
            color: NSColor(white: 1.0, alpha: showsRulers ? 0.80 : 0.15)
        )
        let knobSize: CGFloat = 14
        let inset: CGFloat = 3
        let knob = CGRect(
            x: showsRulers ? rect.maxX - inset - knobSize : rect.minX + inset,
            y: rect.midY - knobSize / 2,
            width: knobSize,
            height: knobSize
        )
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.setFillColor(SettingsPalette.sidebarBackground.cgColor)
        ctx.fillEllipse(in: knob)
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
