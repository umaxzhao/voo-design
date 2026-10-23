//
//  OnboardingGuideView.swift
//  native_studio
//
//  1:1 AppKit / CoreGraphics replica of the VOO Design 4-step onboarding guide.
//  960×656 split modal (320pt cover art + content), sliding 4-slot progress rail,
//  workspace setup → local agent choice → environment probe → ready.
//  Pure custom drawing — no SwiftUI, no third-party dependencies.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Onboarding Guide Overlay

public final class OnboardingGuideView: NSView {

    // MARK: Public API

    /// Fired after the final "进入画布工作台" action (onboarding completed).
    public var onComplete: (() -> Void)?
    /// Fired when the guide is dismissed through the close X or the skip action.
    public var onClose: (() -> Void)?

    /// Zero-based index of the step currently displayed (0...3).
    public var currentStep: Int { stepIndex }

    // MARK: Persistence Keys

    public static let completedVersionKey = "voo.onboarding.completedVersion"
    public static let agentProviderKey = "voo.agent.llmProvider"
    public static let skipEnvironmentKey = "VOO_SKIP_ONBOARDING"
    public static let completedVersionValue = "2.2.0"
    public static let stepCount = 4

    // MARK: Static Lifecycle Helpers

    /// Whether the guide should be presented at launch. Disabled by the
    /// `VOO_SKIP_ONBOARDING=1` environment override, or once a completed version
    /// has been recorded in UserDefaults.
    public static func shouldPresentOnLaunch() -> Bool {
        let environment = ProcessInfo.processInfo.environment
        if environment[skipEnvironmentKey] == "1" { return false }
        if environment[skipEnvironmentKey]?.lowercased() == "true" { return false }
        if let completed = UserDefaults.standard.string(forKey: completedVersionKey),
           !completed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return false
        }
        return true
    }

    /// Marks the onboarding guide as completed for this installation.
    public static func markCompleted() {
        UserDefaults.standard.set(completedVersionValue, forKey: completedVersionKey)
    }

    // MARK: Metrics

    private enum Metrics {
        // Modal shell (UI_SPEC §8): 960×656, radius 24, #161616.
        static let modalWidth: CGFloat = 960
        static let modalHeight: CGFloat = 656
        static let modalRadius: CGFloat = ThemeTokens.radius3Xl
        static let coverWidth: CGFloat = 320 // exactly 1/3 of the dialog
        static let contentPadding: CGFloat = 24
        static let footerHeight: CGFloat = 64
        static let footerButtonHeight: CGFloat = 32
        static let verticalOffset: CGFloat = -19

        // Header (UI_SPEC §8): px24 pt20 pb16 gap12.
        static let headerTop: CGFloat = 20
        static let headerRowHeight: CGFloat = 32
        static let headerGap: CGFloat = 12
        static let headerLabelHeight: CGFloat = 20
        static let headerBottomPadding: CGFloat = 16
        static let headerBottom: CGFloat = headerTop + headerRowHeight + headerGap
            + headerLabelHeight + headerBottomPadding

        // Body (UI_SPEC §8): px24 pb24 pt8.
        static let bodyTopPadding: CGFloat = 8
        static let bodyTop: CGFloat = headerBottom + bodyTopPadding
        static let titleTop: CGFloat = bodyTop + 3
        static let subtitleTop: CGFloat = bodyTop + 30
        static let contentTop: CGFloat = bodyTop + 61

        static let closeSize: CGFloat = 32
        static let progressSegmentWidth: CGFloat = 16
        static let progressSegmentHeight: CGFloat = 4
        static let progressSegmentGap: CGFloat = 6
        static let progressCount = 4
        static let cardRadius: CGFloat = ThemeTokens.radiusXl
    }

    // MARK: Palette (onboarding-specific hue calibration)

    private enum Palette {
        static let scrim = NSColor(white: 0.0, alpha: 0.70)
        static let modalBackground = NSColor(hex: "#161616")
        static let coverBackground = NSColor(hex: "#1c1c1c")
        static let footerBackground = NSColor(hex: "#121212")
        static let mint = NSColor(hex: "#a7ffd4")
        static let mintHover = NSColor(hex: "#b8ffe0")
        static let mintPressed = NSColor(hex: "#8fe9c1")
        static let primaryText = NSColor.black
        static let textPrimary = NSColor(white: 0.96, alpha: 1.0)
        static let textBright = NSColor(white: 0.90, alpha: 1.0)
        static let textSecondary = NSColor(white: 0.70, alpha: 1.0)
        static let textMuted = NSColor(white: 0.64, alpha: 1.0)
        static let textHint = NSColor(white: 0.40, alpha: 1.0)
        static let cardFill = NSColor(white: 1.0, alpha: 0.030)
        static let cardFillHover = NSColor(white: 1.0, alpha: 0.052)
        static let cardFillSelected = NSColor(white: 1.0, alpha: 0.060)
        static let cardBorder = NSColor(white: 1.0, alpha: 0.08)
        static let cardBorderSelected = NSColor(white: 1.0, alpha: 0.22)
        static let controlFill = NSColor(white: 1.0, alpha: 0.06)
        static let controlFillHover = NSColor(white: 1.0, alpha: 0.12)
        static let controlFillPressed = NSColor(white: 1.0, alpha: 0.16)
        static let controlBorder = NSColor(white: 1.0, alpha: 0.10)
        static let closeFill = NSColor(white: 1.0, alpha: 0.04)
        static let closeFillHover = NSColor(white: 1.0, alpha: 0.08)
        static let closeIcon = NSColor(hex: "#a3a3a3")
        static let closeIconHover = NSColor(hex: "#e5e5e5")
        static let progressTrack = NSColor(white: 1.0, alpha: 0.08)
        static let progressPassed = NSColor(white: 1.0, alpha: 0.25)
        static let divider = NSColor(white: 1.0, alpha: 0.07)
        static let subtleFill = NSColor(white: 1.0, alpha: 0.025)
        static let mintBadgeFill = NSColor(hex: "#a7ffd4").withAlphaComponent(0.14)
        static let mintPillFill = NSColor(hex: "#a7ffd4").withAlphaComponent(0.13)
        static let codeBoxFill = NSColor(white: 0.0, alpha: 0.30)
        static let modalBorder = NSColor(white: 1.0, alpha: 0.10)
    }

    // MARK: Fonts

    private enum Fonts {
        // Header step label: 12/500 (web h2 text-xs font-medium).
        static let eyebrow = ThemeFonts.system(size: 12, weight: .medium)
        static let title = ThemeFonts.system(size: 18, weight: .bold)
        static let description = ThemeFonts.system(size: 11, weight: .regular)
        static let cardTitle = ThemeFonts.system(size: 12, weight: .semibold)
        static let body = ThemeFonts.system(size: 11, weight: .regular)
        static let bodyMedium = ThemeFonts.system(size: 11, weight: .medium)
        static let small = ThemeFonts.system(size: 10.5, weight: .regular)
        static let smallMedium = ThemeFonts.system(size: 10.5, weight: .medium)
        static let micro = ThemeFonts.system(size: 10, weight: .medium)
        static let mono = ThemeFonts.mono(size: 10.5, weight: .regular)
        static let monoSmall = ThemeFonts.mono(size: 10, weight: .regular)
        static let monoCode = ThemeFonts.mono(size: 11, weight: .regular)
        static let button = ThemeFonts.system(size: 12, weight: .medium)
        static let buttonSecondary = ThemeFonts.system(size: 12, weight: .medium)
        static let skip = ThemeFonts.system(size: 12, weight: .regular)
        static let counter = ThemeFonts.monoDigit(size: 10, weight: .medium)
        static let watermark = ThemeFonts.system(size: 15, weight: .semibold)
    }

    // MARK: Local Copy Models

    private struct StepCopy {
        let eyebrow: String
        let title: String
        let description: String
    }

    private struct AgentCopy {
        let title: String
        let badge: String?
        let handle: String
        let description: String
        let supported: String
        let provider: String
    }

    private static let steps: [StepCopy] = [
        StepCopy(
            eyebrow: "工作区设置",
            title: "设置项目工作区（Workspace Setup）",
            description: "VOO Design 统一通过工作区目录管理您的设计工程，支持自动扫描、物理同步与版本回溯。"
        ),
        StepCopy(
            eyebrow: "智能体偏好",
            title: "选择默认本地智能体（Local Agent）",
            description: "VOO Design 深度连接你本地安装的 AI CLI 工具，通过进程间桥接驱动设计生成。"
        ),
        StepCopy(
            eyebrow: "环境探针",
            title: "本地环境检测与连通测试",
            description: "VOO Design 正在尝试与本地 CLAUDE CLI 建立桥接通讯。"
        ),
        StepCopy(
            eyebrow: "就绪启用",
            title: "配置完成，准备就绪！",
            description: "VOO Design 已完成工作区与本地智能体的协同配置，点击下方按钮即可进入画布开始创作。"
        )
    ]

    private static let agents: [AgentCopy] = [
        AgentCopy(
            title: "Claude Code",
            badge: "推荐 · 默认",
            handle: "@anthropic-ai/claude-code",
            description: "Anthropic 官方代码智能体，擅长高质量 UI 设计还原、上下文关联与精细重构。",
            supported: "支持模型: Claude 3.7 Sonnet / Opus",
            provider: "claude"
        ),
        AgentCopy(
            title: "OpenAI Codex",
            badge: nil,
            handle: "@openai/codex",
            description: "OpenAI 代码智能体，支持复杂逻辑图层编排、数据流转换与函数调用调度。",
            supported: "支持模型: GPT-4o / o3-mini",
            provider: "codex"
        ),
        AgentCopy(
            title: "Google Antigravity CLI",
            badge: "多 Agent 原生",
            handle: "@google/antigravity-cli (agy)",
            description: "Google 先锋多 Agent 编排引擎，支持画布节点深度理解与端到端协同。",
            supported: "支持模型: Gemini 2.5 Flash / Pro",
            provider: "antigravity"
        )
    ]

    private static let installCommand = "npm install -g @anthropic-ai/claude-code"

    // MARK: Control Identity

    private enum BadgeStyle {
        case mint
        case neutral
        case dark
    }

    private enum GuideControl: Equatable {
        case close
        case skip
        case previous
        case next
        case workspaceCard(Int)
        case folderAuthorization
        case agentCard(Int)
        case retest
        case copyCommand
    }

    private struct GuideLayout {
        let modal: CGRect
        let contentX: CGFloat
        let contentWidth: CGFloat
        let close: CGRect
        let progress: CGRect
        let footerTop: CGFloat
        let skip: CGRect
        let previous: CGRect
        let next: CGRect
        let workspaceCards: [CGRect]
        let workspaceAuthorization: CGRect
        let selectedWorkspaceRow: CGRect
        let agentCards: [CGRect]
        let transportCard: CGRect
        let installCard: CGRect
        let retestButton: CGRect
        let copyButton: CGRect
        let readyCard: CGRect
    }

    // MARK: State

    private var stepIndex = 0
    private var selectedWorkspaceIndex = 1 // 0 = local filesystem, 1 = virtual (IndexedDB)
    private var selectedAgentIndex = 0
    private var hoveredControl: GuideControl?
    private var pressedControl: GuideControl?
    private var didCopyCommand = false

    /// Fractional slot position of the sliding mint progress indicator.
    private var displayedProgressSlot: CGFloat = 0
    private var progressAnimationTimer: Timer?
    private var progressAnimationFrom: CGFloat = 0
    private var progressAnimationTo: CGFloat = 0
    private var progressAnimationStart: TimeInterval = 0

    private var coverImage: NSImage?
    private var didAttemptCoverLoad = false
    private var trackingAreaReference: NSTrackingArea?

    // MARK: Accessibility Proxies

    private lazy var closeButton: GuideAccessibilityButton = {
        let button = GuideAccessibilityButton(frame: .zero)
        button.setAccessibilityIdentifier("Onboarding.Close")
        button.setAccessibilityRole(.button)
        button.setAccessibilityLabel("关闭引导")
        button.target = self
        button.action = #selector(handleCloseButton)
        return button
    }()

    private lazy var nextButton: GuideAccessibilityButton = {
        let button = GuideAccessibilityButton(frame: .zero)
        button.setAccessibilityIdentifier("Onboarding.Next")
        button.setAccessibilityRole(.button)
        button.setAccessibilityLabel("下一步")
        button.target = self
        button.action = #selector(handleNextButton)
        return button
    }()

    private lazy var previousButton: GuideAccessibilityButton = {
        let button = GuideAccessibilityButton(frame: .zero)
        button.setAccessibilityIdentifier("Onboarding.Previous")
        button.setAccessibilityRole(.button)
        button.setAccessibilityLabel("上一步")
        button.target = self
        button.action = #selector(handlePreviousButton)
        return button
    }()

    private lazy var skipButton: GuideAccessibilityButton = {
        let button = GuideAccessibilityButton(frame: .zero)
        button.setAccessibilityIdentifier("Onboarding.Skip")
        button.setAccessibilityRole(.button)
        button.setAccessibilityLabel("稍后配置（跳过）")
        button.target = self
        button.action = #selector(handleSkipButton)
        return button
    }()

    private lazy var progressElement: NSView = {
        let element = NSView(frame: .zero)
        element.setAccessibilityIdentifier("Onboarding.StepProgress")
        element.setAccessibilityElement(true)
        element.setAccessibilityRole(.progressIndicator)
        element.setAccessibilityLabel("引导步骤进度")
        element.setAccessibilityValue("第 1 步，共 4 步")
        return element
    }()

    // MARK: Init

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        wantsLayer = true
        layerContentsRedrawPolicy = .onSetNeedsDisplay
        autoresizingMask = [.width, .height]

        setAccessibilityIdentifier("Onboarding.Guide")
        setAccessibilityRole(.group)
        setAccessibilityLabel("VOO Design 新手引导")

        if let stored = UserDefaults.standard.string(forKey: Self.agentProviderKey) {
            if let index = Self.agents.firstIndex(where: { $0.provider == stored }) {
                selectedAgentIndex = index
            }
        }

        setupAccessibilityElements()
        updateAccessibilityElementFrames()
    }

    private func setupAccessibilityElements() {
        addSubview(closeButton)
        addSubview(previousButton)
        addSubview(nextButton)
        addSubview(skipButton)
        addSubview(progressElement)
    }

    // MARK: Presentation

    /// Shows the overlay at the given zero-based step. The step is clamped to 0...3.
    public func present(step: Int = 0) {
        stepIndex = min(max(step, 0), Self.stepCount - 1)
        didCopyCommand = false
        isHidden = false
        alphaValue = 1.0
        hoveredControl = nil
        pressedControl = nil
        stopProgressAnimation()
        displayedProgressSlot = CGFloat(stepIndex)
        if let superview = superview {
            superview.addSubview(self, positioned: .above, relativeTo: nil)
        }
        updateAccessibilityElementFrames()
        window?.makeFirstResponder(self)
        window?.invalidateCursorRects(for: self)
        needsLayout = true
        needsDisplay = true
    }

    /// Hides the overlay, leaving it attached to its superview so it can be
    /// presented again later.
    public func dismiss() {
        pressedControl = nil
        hoveredControl = nil
        stopProgressAnimation()
        isHidden = true
        needsDisplay = true
    }

    // MARK: Step Navigation

    private func advanceStep() {
        guard stepIndex < Self.stepCount - 1 else {
            completeGuide()
            return
        }
        stepIndex += 1
        didCopyCommand = false
        hoveredControl = nil
        animateProgressIndicator(to: CGFloat(stepIndex))
        updateAccessibilityElementFrames()
        window?.invalidateCursorRects(for: self)
        needsDisplay = true
    }

    private func retreatStep() {
        guard stepIndex > 0 else { return }
        stepIndex -= 1
        didCopyCommand = false
        hoveredControl = nil
        animateProgressIndicator(to: CGFloat(stepIndex))
        updateAccessibilityElementFrames()
        window?.invalidateCursorRects(for: self)
        needsDisplay = true
    }

    private func completeGuide() {
        Self.markCompleted()
        dismiss()
        onComplete?()
    }

    private func closeGuide() {
        Self.markCompleted()
        dismiss()
        onClose?()
    }

    private func persistAgentSelection() {
        let provider = Self.agents[selectedAgentIndex].provider
        UserDefaults.standard.set(provider, forKey: Self.agentProviderKey)
    }

    private func copyInstallCommand() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(Self.installCommand, forType: .string)
        didCopyCommand = true
        needsDisplay = true
    }

    // MARK: Layout

    private var modalFrame: CGRect {
        let availableWidth = max(bounds.width - 48, 480)
        let availableHeight = max(bounds.height - 48, 420)
        let width = min(Metrics.modalWidth, availableWidth)
        let height = min(Metrics.modalHeight, availableHeight)
        return CGRect(
            x: floor((bounds.width - width) / 2),
            y: floor((bounds.height - height) / 2 + Metrics.verticalOffset),
            width: width,
            height: height
        )
    }

    private func computeLayout() -> GuideLayout {
        let modal = modalFrame
        let contentX = modal.minX + Metrics.coverWidth + Metrics.contentPadding
        let contentWidth = modal.maxX - Metrics.contentPadding - contentX
        let footerTop = modal.maxY - Metrics.footerHeight
        let headerRowTop = modal.minY + Metrics.headerTop
        let contentTop = modal.minY + Metrics.contentTop

        // Header row (px24 pt20 pb16 gap12): progress rail + counter + close.
        let close = CGRect(
            x: modal.maxX - Metrics.contentPadding - Metrics.closeSize,
            y: headerRowTop,
            width: Metrics.closeSize,
            height: Metrics.closeSize
        )
        let progressWidth = Metrics.progressSegmentWidth * CGFloat(Metrics.progressCount)
            + Metrics.progressSegmentGap * CGFloat(Metrics.progressCount - 1)
        let progress = CGRect(
            x: contentX,
            y: headerRowTop + (Metrics.headerRowHeight - Metrics.progressSegmentHeight) / 2,
            width: progressWidth,
            height: Metrics.progressSegmentHeight
        )

        // Footer (bg #121212, px24 py16, 32pt controls).
        let buttonY = footerTop + 16
        let nextLabel = primaryButtonTitle
        let nextWidth = max(76, textWidth(nextLabel, font: Fonts.button) + 40)
        let next = CGRect(
            x: modal.maxX - Metrics.contentPadding - nextWidth,
            y: buttonY,
            width: nextWidth,
            height: Metrics.footerButtonHeight
        )
        let previousWidth = max(68, textWidth("上一步", font: Fonts.buttonSecondary) + 32)
        let previous = CGRect(
            x: next.minX - 8 - previousWidth,
            y: buttonY,
            width: previousWidth,
            height: Metrics.footerButtonHeight
        )
        let skipWidth = textWidth("稍后配置（跳过）", font: Fonts.skip) + 24
        let skip = CGRect(x: contentX, y: buttonY, width: skipWidth, height: Metrics.footerButtonHeight)

        // Step 1 — two option cards (padding 16, gap 10).
        let workspaceCards = [
            CGRect(x: contentX, y: contentTop, width: contentWidth, height: 120),
            CGRect(x: contentX, y: contentTop + 120 + 10, width: contentWidth, height: 74)
        ]
        let authorizationWidth = max(130, textWidth("选择本地文件夹授权...", font: Fonts.bodyMedium) + 32)
        let workspaceAuthorization = CGRect(
            x: contentX + 40,
            y: contentTop + 73,
            width: authorizationWidth,
            height: 32
        )
        let selectedWorkspaceRow = CGRect(
            x: contentX,
            y: contentTop + 120 + 10 + 74 + 16,
            width: contentWidth,
            height: 46
        )

        // Step 2 — three agent option cards (padding 16, gap 10).
        var agentCards: [CGRect] = []
        var agentY = contentTop + 8
        for index in 0..<Self.agents.count {
            let height: CGFloat = index == 0 ? 86 : 80
            agentCards.append(CGRect(x: contentX, y: agentY, width: contentWidth, height: height))
            agentY += height + 10
        }

        // Step 3 — transport + install cards.
        let transportCard = CGRect(x: contentX, y: contentTop, width: contentWidth, height: 126)
        let installCard = CGRect(x: contentX, y: transportCard.maxY + 10, width: contentWidth, height: 88)
        let retestButton = CGRect(
            x: transportCard.maxX - 16 - 64,
            y: transportCard.minY + 80,
            width: 64,
            height: 26
        )
        let commandBox = CGRect(
            x: installCard.minX + 16,
            y: installCard.minY + 42,
            width: installCard.width - 32,
            height: 30
        )
        let copyButton = CGRect(
            x: commandBox.maxX - 12 - 46,
            y: commandBox.minY + 3,
            width: 46,
            height: 24
        )

        // Step 4 — ready summary.
        let readyCard = CGRect(x: contentX, y: contentTop, width: contentWidth, height: 204)

        return GuideLayout(
            modal: modal,
            contentX: contentX,
            contentWidth: contentWidth,
            close: close,
            progress: progress,
            footerTop: footerTop,
            skip: skip,
            previous: previous,
            next: next,
            workspaceCards: workspaceCards,
            workspaceAuthorization: workspaceAuthorization,
            selectedWorkspaceRow: selectedWorkspaceRow,
            agentCards: agentCards,
            transportCard: transportCard,
            installCard: installCard,
            retestButton: retestButton,
            copyButton: copyButton,
            readyCard: readyCard
        )
    }

    private var primaryButtonTitle: String {
        stepIndex == Self.stepCount - 1 ? "进入画布工作台" : "下一步"
    }

    /// Moves the mint progress indicator to the given fractional slot, animating
    /// the horizontal slide when a window is available (web: 300ms ease-out).
    private func animateProgressIndicator(to slot: CGFloat) {
        stopProgressAnimation()
        guard window != nil, !isHidden else {
            displayedProgressSlot = slot
            needsDisplay = true
            return
        }
        progressAnimationFrom = displayedProgressSlot
        progressAnimationTo = slot
        progressAnimationStart = ProcessInfo.processInfo.systemUptime
        let timer = Timer(
            timeInterval: 1.0 / 60.0,
            target: self,
            selector: #selector(handleProgressAnimationTick(_:)),
            userInfo: nil,
            repeats: true
        )
        RunLoop.main.add(timer, forMode: .common)
        progressAnimationTimer = timer
    }

    private func stopProgressAnimation() {
        progressAnimationTimer?.invalidate()
        progressAnimationTimer = nil
    }

    @objc private func handleProgressAnimationTick(_ timer: Timer) {
        let elapsed = ProcessInfo.processInfo.systemUptime - progressAnimationStart
        let progress = min(max(elapsed / 0.22, 0.0), 1.0)
        // ease-out-cubic matches the web `ease-out` transition.
        let eased = 1.0 - pow(1.0 - progress, 3.0)
        displayedProgressSlot = progressAnimationFrom
            + (progressAnimationTo - progressAnimationFrom) * CGFloat(eased)
        needsDisplay = true
        if progress >= 1.0 {
            displayedProgressSlot = progressAnimationTo
            stopProgressAnimation()
        }
    }

    private func updateAccessibilityElementFrames() {
        let layout = computeLayout()
        closeButton.frame = layout.close
        nextButton.frame = layout.next
        previousButton.frame = layout.previous
        skipButton.frame = layout.skip
        progressElement.frame = layout.progress
        previousButton.isHidden = stepIndex == 0
        nextButton.setAccessibilityLabel(primaryButtonTitle)
        progressElement.setAccessibilityValue("第 \(stepIndex + 1) 步，共 \(Self.stepCount) 步")
    }

    public override func layout() {
        super.layout()
        updateAccessibilityElementFrames()
    }

    private func control(at point: CGPoint) -> GuideControl? {
        let layout = computeLayout()
        if layout.close.contains(point) { return .close }
        if layout.next.contains(point) { return .next }
        if stepIndex > 0, layout.previous.contains(point) { return .previous }
        if layout.skip.contains(point) { return .skip }

        switch stepIndex {
        case 0:
            if layout.workspaceAuthorization.contains(point) { return .folderAuthorization }
            for (index, rect) in layout.workspaceCards.enumerated() where rect.contains(point) {
                return .workspaceCard(index)
            }
        case 1:
            for (index, rect) in layout.agentCards.enumerated() where rect.contains(point) {
                return .agentCard(index)
            }
        case 2:
            if layout.retestButton.contains(point) { return .retest }
            if layout.copyButton.contains(point) { return .copyCommand }
        default:
            break
        }
        return nil
    }

    private func activate(_ control: GuideControl) {
        switch control {
        case .close:
            closeGuide()
        case .skip:
            closeGuide()
        case .previous:
            retreatStep()
        case .next:
            if stepIndex == 0 {
                advanceStep()
            } else if stepIndex == 1 {
                persistAgentSelection()
                advanceStep()
            } else if stepIndex == 2 {
                advanceStep()
            } else {
                completeGuide()
            }
        case .workspaceCard(let index):
            selectedWorkspaceIndex = index
            needsDisplay = true
        case .folderAuthorization:
            selectedWorkspaceIndex = 0
            needsDisplay = true
        case .agentCard(let index):
            selectedAgentIndex = index
            needsDisplay = true
        case .retest:
            needsDisplay = true
        case .copyCommand:
            copyInstallCommand()
        }
    }

    @objc private func handleCloseButton() { activate(.close) }
    @objc private func handleNextButton() { activate(.next) }
    @objc private func handlePreviousButton() { activate(.previous) }
    @objc private func handleSkipButton() { activate(.skip) }

    // MARK: - Drawing

    public override var isFlipped: Bool { true }

    public override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        // Full-window scrim behind the modal.
        context.setFillColor(Palette.scrim.cgColor)
        context.fill(bounds)

        let modal = modalFrame
        let modalPath = CGPath(
            roundedRect: modal,
            cornerWidth: Metrics.modalRadius,
            cornerHeight: Metrics.modalRadius,
            transform: nil
        )

        // Soft elevation shadow + modal shell.
        context.saveGState()
        context.setShadow(
            offset: CGSize(width: 0, height: 18),
            blur: 46,
            color: NSColor.black.withAlphaComponent(0.62).cgColor
        )
        context.setFillColor(Palette.modalBackground.cgColor)
        context.addPath(modalPath)
        context.fillPath()
        context.restoreGState()

        // Clip all interior artwork to the rounded shell.
        context.saveGState()
        context.addPath(modalPath)
        context.clip()

        drawCoverArt(in: CGRect(x: modal.minX, y: modal.minY, width: Metrics.coverWidth, height: modal.height))
        drawContentColumn(in: modal)
        drawFooter(in: modal)

        context.restoreGState()

        // Hairline border on top of the artwork.
        context.setStrokeColor(Palette.modalBorder.cgColor)
        context.setLineWidth(1)
        context.addPath(modalPath)
        context.strokePath()
    }

    // MARK: Cover Art Column

    private func drawCoverArt(in rect: CGRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        context.saveGState()
        context.clip(to: rect)

        // Cover column background (#1c1c1c) — visible while the image loads or
        // when the artwork resource is missing entirely.
        context.setFillColor(Palette.coverBackground.cgColor)
        context.fill(rect)

        if let image = resolvedCoverImage() {
            drawAspectFill(image, in: rect)
        } else {
            drawProceduralCover(in: rect)
        }

        // Bottom vignette so the watermark stays legible.
        if let gradient = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                NSColor.black.withAlphaComponent(0.0).cgColor,
                NSColor.black.withAlphaComponent(0.58).cgColor
            ] as CFArray,
            locations: [0.0, 1.0]
        ) {
            context.drawLinearGradient(
                gradient,
                start: CGPoint(x: rect.minX, y: rect.maxY - 190),
                end: CGPoint(x: rect.minX, y: rect.maxY),
                options: []
            )
        }

        // VOO brand mark: bottom 24 / right 32, 28pt glyph + 15/600 wordmark.
        let wordmarkFont = Fonts.watermark
        let wordmarkWidth = textWidth("VOO", font: wordmarkFont, kern: 0.0)
        let logoSize: CGFloat = 28
        let logoGap: CGFloat = 6
        let totalWidth = logoSize + logoGap + wordmarkWidth
        let originX = rect.maxX - 32 - totalWidth
        let originY = rect.maxY - 24 - logoSize
        let wordmarkHeight = lineHeight(for: wordmarkFont)

        context.saveGState()
        context.setShadow(
            offset: CGSize(width: 0, height: 1),
            blur: 8,
            color: NSColor.black.withAlphaComponent(0.55).cgColor
        )
        VooIconFactory.drawBrandLogo(
            in: CGRect(x: originX, y: originY, width: logoSize, height: logoSize),
            color: .white
        )
        drawText(
            "VOO",
            x: originX + logoSize + logoGap,
            top: originY + (logoSize - wordmarkHeight) / 2,
            font: wordmarkFont,
            color: .white
        )
        context.restoreGState()

        context.restoreGState()
    }

    private func resolvedCoverImage() -> NSImage? {
        if didAttemptCoverLoad { return coverImage }
        didAttemptCoverLoad = true

        var candidates: [URL] = []
        if let url = Bundle.main.url(forResource: "cover", withExtension: "png", subdirectory: "Onboarding") {
            candidates.append(url)
        }
        if let resourceURL = Bundle.main.resourceURL {
            candidates.append(resourceURL.appendingPathComponent("Onboarding/cover.png"))
            candidates.append(resourceURL.appendingPathComponent("cover.png"))
        }

        for url in candidates where FileManager.default.fileExists(atPath: url.path) {
            if let image = NSImage(contentsOf: url) {
                coverImage = image
                break
            }
        }
        return coverImage
    }

    private func drawAspectFill(_ image: NSImage, in rect: CGRect) {
        let imageSize = image.size
        guard imageSize.width > 0, imageSize.height > 0 else { return }
        let scale = max(rect.width / imageSize.width, rect.height / imageSize.height)
        let drawnSize = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        let target = CGRect(
            x: rect.midX - drawnSize.width / 2,
            y: rect.midY - drawnSize.height / 2,
            width: drawnSize.width,
            height: drawnSize.height
        )
        image.draw(
            in: target,
            from: .zero,
            operation: .sourceOver,
            fraction: 1.0,
            respectFlipped: true,
            hints: nil
        )
    }

    private func drawProceduralCover(in rect: CGRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        if let base = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                NSColor(hex: "#302633").cgColor,
                NSColor(hex: "#1a1420").cgColor,
                NSColor(hex: "#0b0910").cgColor
            ] as CFArray,
            locations: [0.0, 0.55, 1.0]
        ) {
            context.drawLinearGradient(
                base,
                start: CGPoint(x: rect.minX, y: rect.minY),
                end: CGPoint(x: rect.minX, y: rect.maxY),
                options: []
            )
        }

        drawRadialGlow(
            center: CGPoint(x: rect.minX + rect.width * 0.76, y: rect.minY + rect.height * 0.24),
            radius: rect.width * 1.05,
            color: NSColor(hex: "#8d55e8").withAlphaComponent(0.52)
        )
        drawRadialGlow(
            center: CGPoint(x: rect.minX + rect.width * 0.18, y: rect.minY + rect.height * 0.68),
            radius: rect.width * 0.82,
            color: NSColor(hex: "#ff7a4d").withAlphaComponent(0.34)
        )
        drawRadialGlow(
            center: CGPoint(x: rect.minX + rect.width * 0.44, y: rect.minY + rect.height * 0.12),
            radius: rect.width * 0.6,
            color: NSColor(hex: "#f3c9d8").withAlphaComponent(0.22)
        )

        // Abstract portrait silhouette in case the cover asset is unavailable.
        context.saveGState()
        let headRect = CGRect(
            x: rect.midX - rect.width * 0.28,
            y: rect.minY + rect.height * 0.20,
            width: rect.width * 0.56,
            height: rect.width * 0.70
        )
        context.setFillColor(NSColor(white: 1.0, alpha: 0.045).cgColor)
        context.fillEllipse(in: headRect)

        let shoulders = CGMutablePath()
        shoulders.move(to: CGPoint(x: rect.minX + rect.width * 0.06, y: rect.maxY))
        shoulders.addCurve(
            to: CGPoint(x: rect.minX + rect.width * 0.94, y: rect.maxY),
            control1: CGPoint(x: rect.minX + rect.width * 0.10, y: rect.minY + rect.height * 0.66),
            control2: CGPoint(x: rect.minX + rect.width * 0.90, y: rect.minY + rect.height * 0.66)
        )
        shoulders.closeSubpath()
        context.setFillColor(NSColor(white: 1.0, alpha: 0.05).cgColor)
        context.addPath(shoulders)
        context.fillPath()

        context.setStrokeColor(NSColor(white: 1.0, alpha: 0.07).cgColor)
        context.setLineWidth(1)
        context.strokeEllipse(in: headRect.insetBy(dx: -14, dy: -14))
        context.restoreGState()

        // Diagonal light streak for a bit of depth.
        context.saveGState()
        context.setStrokeColor(NSColor(white: 1.0, alpha: 0.06).cgColor)
        context.setLineWidth(46)
        context.strokeLineSegments(between: [
            CGPoint(x: rect.minX - 40, y: rect.maxY),
            CGPoint(x: rect.maxX + 40, y: rect.minY + rect.height * 0.34)
        ])
        context.restoreGState()
    }

    private func drawRadialGlow(center: CGPoint, radius: CGFloat, color: NSColor) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        guard let gradient = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [color.cgColor, color.withAlphaComponent(0.0).cgColor] as CFArray,
            locations: [0.0, 1.0]
        ) else { return }
        context.drawRadialGradient(
            gradient,
            startCenter: center,
            startRadius: 0,
            endCenter: center,
            endRadius: radius,
            options: []
        )
    }

    // MARK: Content Column

    private func drawContentColumn(in modal: CGRect) {
        let layout = computeLayout()
        let copy = Self.steps[min(stepIndex, Self.steps.count - 1)]

        // Header — px24 pt20 pb16 gap12: progress rail + close X on row one,
        // the 12/500 step label wrapping below them.
        drawProgress(in: layout.progress)
        drawCloseButton(in: layout.close)
        drawText(
            copy.eyebrow,
            x: layout.contentX,
            top: modal.minY + Metrics.headerTop + Metrics.headerRowHeight + Metrics.headerGap,
            font: Fonts.eyebrow,
            color: Palette.textPrimary
        )

        // Body — px24 pt8: bold step heading, muted description, step content.
        drawText(
            copy.title,
            x: layout.contentX,
            top: modal.minY + Metrics.titleTop,
            font: Fonts.title,
            color: Palette.textPrimary,
            maxWidth: layout.contentWidth
        )
        drawText(
            copy.description,
            x: layout.contentX,
            top: modal.minY + Metrics.subtitleTop,
            font: Fonts.description,
            color: Palette.textSecondary,
            maxWidth: layout.contentWidth
        )

        switch stepIndex {
        case 0:
            drawWorkspaceStep(layout)
        case 1:
            drawAgentStep(layout)
        case 2:
            drawProbeStep(layout)
        default:
            drawReadyStep(layout)
        }
    }

    private func drawProgress(in rect: CGRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }

        let segmentWidth = Metrics.progressSegmentWidth
        let segmentHeight = Metrics.progressSegmentHeight
        let segmentGap = Metrics.progressSegmentGap
        let radius = segmentHeight / 2

        // Four 16×4 rounded slots: white/25 once passed, white/8 otherwise.
        for index in 0..<Metrics.progressCount {
            let segment = CGRect(
                x: rect.minX + CGFloat(index) * (segmentWidth + segmentGap),
                y: rect.minY,
                width: segmentWidth,
                height: segmentHeight
            )
            let path = CGPath(roundedRect: segment, cornerWidth: radius, cornerHeight: radius, transform: nil)
            let isPassed = index < stepIndex
            context.setFillColor(isPassed ? Palette.progressPassed.cgColor : Palette.progressTrack.cgColor)
            context.addPath(path)
            context.fillPath()
        }

        // Single mint indicator that slides between slots.
        let indicator = CGRect(
            x: rect.minX + displayedProgressSlot * (segmentWidth + segmentGap),
            y: rect.minY,
            width: segmentWidth,
            height: segmentHeight
        )
        let indicatorPath = CGPath(
            roundedRect: indicator,
            cornerWidth: radius,
            cornerHeight: radius,
            transform: nil
        )
        context.setFillColor(Palette.mint.cgColor)
        context.addPath(indicatorPath)
        context.fillPath()

        // 10pt tabular counter, 12pt after the rail.
        let counterHeight = lineHeight(for: Fonts.counter)
        drawText(
            "\(stepIndex + 1) / \(Self.stepCount)",
            x: rect.maxX + 12,
            top: rect.midY - counterHeight / 2,
            font: Fonts.counter,
            color: Palette.textMuted
        )
    }

    private func drawCloseButton(in rect: CGRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let isHovered = hoveredControl == .close
        let isPressed = pressedControl == .close
        let fill = isPressed
            ? NSColor(white: 1.0, alpha: 0.12)
            : (isHovered ? Palette.closeFillHover : Palette.closeFill)
        let path = CGPath(roundedRect: rect, cornerWidth: 8, cornerHeight: 8, transform: nil)
        context.setFillColor(fill.cgColor)
        context.addPath(path)
        context.fillPath()

        // 14×14 close glyph inside the 32pt hit target.
        let inset: CGFloat = 9
        context.setStrokeColor((isHovered ? Palette.closeIconHover : Palette.closeIcon).cgColor)
        context.setLineWidth(1.6)
        context.setLineCap(.round)
        context.strokeLineSegments(between: [
            CGPoint(x: rect.minX + inset, y: rect.minY + inset),
            CGPoint(x: rect.maxX - inset, y: rect.maxY - inset)
        ])
        context.strokeLineSegments(between: [
            CGPoint(x: rect.minX + inset, y: rect.maxY - inset),
            CGPoint(x: rect.maxX - inset, y: rect.minY + inset)
        ])
    }

    // MARK: Step 1 — Workspace Setup

    private func drawWorkspaceStep(_ layout: GuideLayout) {
        let context = NSGraphicsContext.current?.cgContext
        let firstCard = layout.workspaceCards[0]
        let secondCard = layout.workspaceCards[1]

        drawCardBackground(
            firstCard,
            selected: selectedWorkspaceIndex == 0,
            hovered: hoveredControl == .workspaceCard(0)
        )
        drawFolder(
            in: CGRect(x: firstCard.minX + 16, y: firstCard.minY + 16, width: 16, height: 16),
            color: Palette.textSecondary
        )
        drawText(
            "本地文件夹挂载（File System Access）",
            x: firstCard.minX + 40,
            top: firstCard.minY + 16,
            font: Fonts.cardTitle,
            color: Palette.textPrimary
        )
        let firstTitleWidth = textWidth("本地文件夹挂载（File System Access）", font: Fonts.cardTitle)
        drawBadge(
            "「浏览器挂载」",
            x: firstCard.minX + 40 + firstTitleWidth + 8,
            centerY: firstCard.minY + 24,
            style: .neutral
        )
        drawText(
            "通过现代浏览器授权并挂载本地文件夹，设计文件直接保存在本地硬盘中。",
            x: firstCard.minX + 40,
            top: firstCard.minY + 40,
            font: Fonts.body,
            color: Palette.textSecondary,
            maxWidth: firstCard.width - 40 - 40
        )
        drawSecondaryButton(
            layout.workspaceAuthorization,
            title: "选择本地文件夹授权...",
            font: Fonts.bodyMedium,
            hovered: hoveredControl == .folderAuthorization,
            pressed: pressedControl == .folderAuthorization
        )
        drawSelectionIndicator(
            center: CGPoint(x: firstCard.maxX - 24, y: firstCard.minY + 24),
            selected: selectedWorkspaceIndex == 0
        )

        drawCardBackground(
            secondCard,
            selected: selectedWorkspaceIndex == 1,
            hovered: hoveredControl == .workspaceCard(1)
        )
        drawFolder(
            in: CGRect(x: secondCard.minX + 16, y: secondCard.minY + 16, width: 16, height: 16),
            color: Palette.textSecondary
        )
        drawText(
            "浏览器虚拟工作区（IndexedDB）",
            x: secondCard.minX + 40,
            top: secondCard.minY + 16,
            font: Fonts.cardTitle,
            color: Palette.textPrimary
        )
        let secondTitleWidth = textWidth("浏览器虚拟工作区（IndexedDB）", font: Fonts.cardTitle)
        drawBadge(
            "「免授权」",
            x: secondCard.minX + 40 + secondTitleWidth + 8,
            centerY: secondCard.minY + 24,
            style: .neutral
        )
        drawText(
            "无需授权本地目录，所有设计工程保存在浏览器沙盒数据库中，开箱即用。",
            x: secondCard.minX + 40,
            top: secondCard.minY + 40,
            font: Fonts.body,
            color: Palette.textSecondary,
            maxWidth: secondCard.width - 40 - 40
        )
        drawSelectionIndicator(
            center: CGPoint(x: secondCard.maxX - 24, y: secondCard.minY + 24),
            selected: selectedWorkspaceIndex == 1
        )

        // Selected workspace summary row.
        let row = layout.selectedWorkspaceRow
        guard let ctx = context else { return }
        let rowPath = CGPath(roundedRect: row, cornerWidth: 10, cornerHeight: 10, transform: nil)
        ctx.setFillColor(Palette.subtleFill.cgColor)
        ctx.addPath(rowPath)
        ctx.fillPath()
        ctx.setStrokeColor(Palette.cardBorder.cgColor)
        ctx.setLineWidth(1)
        ctx.addPath(rowPath)
        ctx.strokePath()

        drawFolder(
            in: CGRect(x: row.minX + 16, y: row.midY - 8, width: 16, height: 16),
            color: Palette.textMuted
        )
        let textTop = row.midY - lineHeight(for: Fonts.body) / 2
        let label = "已选工作区:"
        drawText(
            label,
            x: row.minX + 40,
            top: textTop,
            font: Fonts.body,
            color: Palette.textMuted
        )
        let labelWidth = textWidth(label, font: Fonts.body)
        let value = selectedWorkspaceIndex == 1 ? "Virtual Workspace" : "Local Folder"
        drawText(
            value,
            x: row.minX + 40 + labelWidth + 8,
            top: textTop,
            font: Fonts.bodyMedium,
            color: Palette.textPrimary
        )
        let badgeText = selectedWorkspaceIndex == 1 ? "［虚拟工作区］" : "［本地挂载］"
        let badgeWidth = textWidth(badgeText, font: Fonts.micro) + 14
        drawBadge(
            badgeText,
            x: row.maxX - 16 - badgeWidth + 7,
            centerY: row.midY,
            style: .dark
        )
    }

    // MARK: Step 2 — Local Agent Choice

    private func drawAgentStep(_ layout: GuideLayout) {
        for (index, agent) in Self.agents.enumerated() {
            let card = layout.agentCards[index]
            drawCardBackground(
                card,
                selected: selectedAgentIndex == index,
                hovered: hoveredControl == .agentCard(index)
            )

            let titleX = card.minX + 16
            drawText(
                agent.title,
                x: titleX,
                top: card.minY + 16,
                font: Fonts.cardTitle,
                color: Palette.textPrimary
            )
            var cursorX = titleX + textWidth(agent.title, font: Fonts.cardTitle) + 8
            if let badge = agent.badge {
                cursorX += drawBadge(badge, x: cursorX, centerY: card.minY + 24, style: .mint) + 8
            }
            drawText(
                agent.handle,
                x: cursorX,
                top: card.minY + 18,
                font: Fonts.mono,
                color: Palette.textMuted,
                maxWidth: card.maxX - 60 - cursorX
            )
            drawText(
                agent.description,
                x: titleX,
                top: card.minY + 40,
                font: Fonts.body,
                color: Palette.textSecondary,
                maxWidth: card.width - 32 - 40
            )
            drawText(
                agent.supported,
                x: titleX,
                top: card.minY + 62,
                font: Fonts.small,
                color: Palette.textHint,
                maxWidth: card.width - 32 - 40
            )
            drawSelectionIndicator(
                center: CGPoint(x: card.maxX - 24, y: card.minY + 24),
                selected: selectedAgentIndex == index
            )
        }
    }

    // MARK: Step 3 — Environment Probe

    private func drawProbeStep(_ layout: GuideLayout) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let card = layout.transportCard
        drawCardBackground(card, selected: false, hovered: false)

        drawText(
            "通讯通道架构（Transport）",
            x: card.minX + 16,
            top: card.minY + 16,
            font: Fonts.bodyMedium,
            color: Palette.textPrimary
        )
        drawText(
            "Web Loopback Bridge ws://127.0.0.1:4179",
            x: card.minX + 16,
            top: card.minY + 34,
            font: Fonts.monoSmall,
            color: Palette.textMuted
        )
        drawStatusPill(
            "连接就绪",
            x: card.maxX - 16 - 78,
            centerY: card.minY + 28,
            width: 78
        )

        context.setStrokeColor(Palette.divider.cgColor)
        context.setLineWidth(1)
        context.strokeLineSegments(between: [
            CGPoint(x: card.minX + 16, y: card.minY + 62),
            CGPoint(x: card.maxX - 16, y: card.minY + 62)
        ])

        drawText(
            "CLI 安装状态（claude）",
            x: card.minX + 16,
            top: card.minY + 76,
            font: Fonts.bodyMedium,
            color: Palette.textPrimary
        )
        drawText(
            "本地双通道连接通畅（Ready）",
            x: card.minX + 16,
            top: card.minY + 95,
            font: Fonts.monoSmall,
            color: Palette.textMuted
        )
        drawSecondaryButton(
            layout.retestButton,
            title: "重新测试",
            font: Fonts.smallMedium,
            hovered: hoveredControl == .retest,
            pressed: pressedControl == .retest
        )

        let install = layout.installCard
        drawCardBackground(install, selected: false, hovered: false)
        drawText(
            "如尚未安装该 CLI，请在终端执行:",
            x: install.minX + 16,
            top: install.minY + 16,
            font: Fonts.body,
            color: Palette.textSecondary
        )

        let box = CGRect(
            x: install.minX + 16,
            y: install.minY + 42,
            width: install.width - 32,
            height: 30
        )
        let boxPath = CGPath(roundedRect: box, cornerWidth: 8, cornerHeight: 8, transform: nil)
        context.setFillColor(Palette.codeBoxFill.cgColor)
        context.addPath(boxPath)
        context.fillPath()
        context.setStrokeColor(NSColor(white: 1.0, alpha: 0.07).cgColor)
        context.setLineWidth(1)
        context.addPath(boxPath)
        context.strokePath()

        drawText(
            Self.installCommand,
            x: box.minX + 14,
            top: box.minY + 7,
            font: Fonts.monoCode,
            color: NSColor(white: 0.84, alpha: 1.0)
        )
        drawSecondaryButton(
            layout.copyButton,
            title: didCopyCommand ? "已复制" : "复制",
            font: Fonts.micro,
            hovered: hoveredControl == .copyCommand,
            pressed: pressedControl == .copyCommand
        )
    }

    private func drawStatusPill(_ title: String, x: CGFloat, centerY: CGFloat, width: CGFloat) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let rect = CGRect(x: x, y: centerY - 11, width: width, height: 22)
        let path = CGPath(roundedRect: rect, cornerWidth: 11, cornerHeight: 11, transform: nil)
        context.setFillColor(Palette.mintPillFill.cgColor)
        context.addPath(path)
        context.fillPath()

        context.setFillColor(Palette.mint.cgColor)
        context.fillEllipse(in: CGRect(x: rect.minX + 10, y: centerY - 2.5, width: 5, height: 5))
        drawText(
            title,
            x: rect.minX + 21,
            top: centerY - 7,
            font: Fonts.smallMedium,
            color: Palette.mint
        )
    }

    // MARK: Step 4 — Ready Summary

    private func drawReadyStep(_ layout: GuideLayout) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let card = layout.readyCard
        drawCardBackground(card, selected: false, hovered: false)

        // Row 1 — workspace.
        drawFolder(
            in: CGRect(x: card.minX + 16, y: card.minY + 26, width: 17, height: 17),
            color: Palette.textSecondary
        )
        drawText(
            "项目工作区",
            x: card.minX + 40,
            top: card.minY + 18,
            font: Fonts.cardTitle,
            color: Palette.textPrimary
        )
        let workspaceTitleWidth = textWidth("项目工作区", font: Fonts.cardTitle)
        drawBadge(
            "［虚拟工作区］",
            x: card.minX + 40 + workspaceTitleWidth + 8,
            centerY: card.minY + 27,
            style: .neutral
        )
        drawText(
            "Virtual Workspace",
            x: card.minX + 40,
            top: card.minY + 41,
            font: Fonts.mono,
            color: Palette.textMuted
        )

        context.setStrokeColor(Palette.divider.cgColor)
        context.setLineWidth(1)
        context.strokeLineSegments(between: [
            CGPoint(x: card.minX + 16, y: card.minY + 68),
            CGPoint(x: card.maxX - 16, y: card.minY + 68)
        ])

        // Row 2 — default local agent.
        drawSelectionIndicator(center: CGPoint(x: card.minX + 25, y: card.minY + 98), selected: true)
        drawText(
            "默认本地智能体",
            x: card.minX + 40,
            top: card.minY + 84,
            font: Fonts.cardTitle,
            color: Palette.textPrimary
        )
        let agent = Self.agents[selectedAgentIndex]
        drawText(
            "\(agent.title) (\(agent.handle))",
            x: card.minX + 40,
            top: card.minY + 106,
            font: Fonts.mono,
            color: Palette.textMuted,
            maxWidth: card.width - 40 - 30
        )

        // Info strip — interaction + safety.
        let infoRect = CGRect(
            x: card.minX + 10,
            y: card.minY + 134,
            width: card.width - 20,
            height: 60
        )
        let infoPath = CGPath(roundedRect: infoRect, cornerWidth: 8, cornerHeight: 8, transform: nil)
        context.setFillColor(Palette.subtleFill.cgColor)
        context.addPath(infoPath)
        context.fillPath()
        context.setStrokeColor(NSColor(white: 1.0, alpha: 0.05).cgColor)
        context.setLineWidth(1)
        context.addPath(infoPath)
        context.strokePath()

        let columnWidth = (infoRect.width - 36) / 2
        drawText(
            "上下文交互",
            x: infoRect.minX + 18,
            top: infoRect.minY + 12,
            font: Fonts.bodyMedium,
            color: Palette.textPrimary
        )
        drawText(
            "底部 Island Bar 选框直接派发",
            x: infoRect.minX + 18,
            top: infoRect.minY + 30,
            font: Fonts.small,
            color: Palette.textMuted,
            maxWidth: columnWidth
        )
        drawText(
            "安全防护",
            x: infoRect.minX + 18 + columnWidth + 18,
            top: infoRect.minY + 12,
            font: Fonts.bodyMedium,
            color: Palette.textPrimary
        )
        drawText(
            "全量 Undo/Redo 历史保护",
            x: infoRect.minX + 18 + columnWidth + 18,
            top: infoRect.minY + 30,
            font: Fonts.small,
            color: Palette.textMuted,
            maxWidth: columnWidth
        )

        drawText(
            "提示：你可以随时在系统“设置”中更改工作区目录，或在“AI Providers”中切换智能体偏好。",
            x: card.minX,
            top: card.maxY + 14,
            font: Fonts.small,
            color: Palette.textHint,
            maxWidth: card.width
        )
    }

    // MARK: Footer

    private func drawFooter(in modal: CGRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let layout = computeLayout()

        // Footer surface: #121212, spans the content column only (the cover art
        // remains full-bleed under it), px24 py16.
        let footerRect = CGRect(
            x: modal.minX + Metrics.coverWidth,
            y: layout.footerTop,
            width: modal.width - Metrics.coverWidth,
            height: Metrics.footerHeight
        )
        context.setFillColor(Palette.footerBackground.cgColor)
        context.fill(footerRect)

        // Skip: px12 py8, 12pt, neutral-400.
        let skipFont = Fonts.skip
        drawText(
            "稍后配置（跳过）",
            x: layout.skip.minX + 12,
            top: layout.skip.midY - lineHeight(for: skipFont) / 2,
            font: skipFont,
            color: hoveredControl == .skip ? Palette.textBright : Palette.textMuted
        )

        if stepIndex > 0 {
            drawSecondaryButton(
                layout.previous,
                title: "上一步",
                font: Fonts.buttonSecondary,
                hovered: hoveredControl == .previous,
                pressed: pressedControl == .previous,
                bordered: false
            )
        }

        drawPrimaryButton(layout.next, title: primaryButtonTitle)
    }

    // MARK: Reusable Drawing Helpers

    private func drawCardBackground(_ rect: CGRect, selected: Bool, hovered: Bool) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let fill: NSColor
        if selected {
            fill = Palette.cardFillSelected
        } else if hovered {
            fill = Palette.cardFillHover
        } else {
            fill = Palette.cardFill
        }
        let border = selected ? Palette.cardBorderSelected : Palette.cardBorder
        let path = CGPath(roundedRect: rect, cornerWidth: Metrics.cardRadius, cornerHeight: Metrics.cardRadius, transform: nil)
        context.setFillColor(fill.cgColor)
        context.addPath(path)
        context.fillPath()
        context.setStrokeColor(border.cgColor)
        context.setLineWidth(1)
        context.addPath(path)
        context.strokePath()
    }

    private func drawSecondaryButton(
        _ rect: CGRect,
        title: String,
        font: NSFont,
        hovered: Bool,
        pressed: Bool,
        bordered: Bool = true
    ) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let fill = pressed ? Palette.controlFillPressed : (hovered ? Palette.controlFillHover : Palette.controlFill)
        let path = CGPath(roundedRect: rect, cornerWidth: 8, cornerHeight: 8, transform: nil)
        context.setFillColor(fill.cgColor)
        context.addPath(path)
        context.fillPath()
        if bordered {
            context.setStrokeColor(Palette.controlBorder.cgColor)
            context.setLineWidth(1)
            context.addPath(path)
            context.strokePath()
        }
        drawCenteredText(title, in: rect, font: font, color: Palette.textBright)
    }

    private func drawPrimaryButton(_ rect: CGRect, title: String) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        let isHovered = hoveredControl == .next
        let isPressed = pressedControl == .next
        let fill = isPressed ? Palette.mintPressed : (isHovered ? Palette.mintHover : Palette.mint)
        let path = CGPath(roundedRect: rect, cornerWidth: 8, cornerHeight: 8, transform: nil)
        context.setFillColor(fill.cgColor)
        context.addPath(path)
        context.fillPath()
        drawCenteredText(title, in: rect, font: Fonts.button, color: Palette.primaryText)
    }

    @discardableResult
    private func drawBadge(_ title: String, x: CGFloat, centerY: CGFloat, style: BadgeStyle) -> CGFloat {
        guard let context = NSGraphicsContext.current?.cgContext else { return 0 }
        let font = Fonts.micro
        let width = textWidth(title, font: font) + 12
        let rect = CGRect(x: x, y: centerY - 9, width: width, height: 18)
        let path = CGPath(roundedRect: rect, cornerWidth: 5, cornerHeight: 5, transform: nil)

        switch style {
        case .mint:
            context.setFillColor(Palette.mintBadgeFill.cgColor)
            context.addPath(path)
            context.fillPath()
            drawCenteredText(title, in: rect, font: font, color: Palette.mint)
        case .neutral:
            context.setFillColor(NSColor(white: 1.0, alpha: 0.06).cgColor)
            context.addPath(path)
            context.fillPath()
            context.setStrokeColor(NSColor(white: 1.0, alpha: 0.06).cgColor)
            context.setLineWidth(1)
            context.addPath(path)
            context.strokePath()
            drawCenteredText(title, in: rect, font: font, color: Palette.textMuted)
        case .dark:
            context.setFillColor(NSColor(white: 1.0, alpha: 0.07).cgColor)
            context.addPath(path)
            context.fillPath()
            drawCenteredText(title, in: rect, font: font, color: Palette.textSecondary)
        }
        return width
    }

    private func drawSelectionIndicator(center: CGPoint, selected: Bool) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        if selected {
            let radius: CGFloat = 9
            context.setFillColor(Palette.mint.cgColor)
            context.fillEllipse(in: CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            ))
            drawCheckmark(
                in: CGRect(x: center.x - 5.5, y: center.y - 5.5, width: 11, height: 11),
                color: Palette.primaryText,
                lineWidth: 1.9
            )
        } else {
            let radius: CGFloat = 7
            context.setStrokeColor(NSColor(white: 1.0, alpha: 0.22).cgColor)
            context.setLineWidth(1.2)
            context.strokeEllipse(in: CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            ))
        }
    }

    private func drawCheckmark(in rect: CGRect, color: NSColor, lineWidth: CGFloat) {
        VooIconFactory.drawCheckmark(in: rect, color: color, strokeWidth: lineWidth)
    }

    /// Lucide-style outlined folder glyph, drawn in flipped view coordinates.
    private func drawFolder(in rect: CGRect, color: NSColor) {
        VooIconFactory.drawFolder(in: rect, color: color, strokeWidth: 1.5)
    }

    // MARK: Text Drawing

    private func lineHeight(for font: NSFont) -> CGFloat {
        return ceil(font.ascender - font.descender + font.leading)
    }

    private func textWidth(_ text: String, font: NSFont, kern: CGFloat = 0) -> CGFloat {
        var attributes: [NSAttributedString.Key: Any] = [.font: font]
        if kern != 0 { attributes[.kern] = kern }
        return ceil((text as NSString).size(withAttributes: attributes).width)
    }

    private func drawText(
        _ text: String,
        x: CGFloat,
        top: CGFloat,
        font: NSFont,
        color: NSColor,
        kern: CGFloat = 0,
        maxWidth: CGFloat = 2000
    ) {
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byTruncatingTail
        style.alignment = .left
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style
        ]
        if kern != 0 { attributes[.kern] = kern }
        let attributed = NSAttributedString(string: text, attributes: attributes)
        attributed.draw(in: CGRect(
            x: x,
            y: top,
            width: max(maxWidth, 8),
            height: lineHeight(for: font) + 2
        ))
    }

    private func drawCenteredText(
        _ text: String,
        in rect: CGRect,
        font: NSFont,
        color: NSColor,
        kern: CGFloat = 0
    ) {
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byTruncatingTail
        style.alignment = .center
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style
        ]
        if kern != 0 { attributes[.kern] = kern }
        let attributed = NSAttributedString(string: text, attributes: attributes)
        let height = lineHeight(for: font)
        attributed.draw(in: CGRect(
            x: rect.minX + 2,
            y: rect.midY - height / 2,
            width: max(rect.width - 4, 8),
            height: height + 2
        ))
    }

    // MARK: - Interaction

    public override func hitTest(_ point: NSPoint) -> NSView? {
        guard !isHidden else { return nil }
        return self
    }

    public override var acceptsFirstResponder: Bool { true }

    public override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        pressedControl = control(at: point)
        needsDisplay = true
    }

    public override func mouseUp(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
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
        addCursorRect(layout.next, cursor: .pointingHand)
        addCursorRect(layout.skip, cursor: .pointingHand)
        if stepIndex > 0 {
            addCursorRect(layout.previous, cursor: .pointingHand)
        }
        switch stepIndex {
        case 0:
            for card in layout.workspaceCards { addCursorRect(card, cursor: .pointingHand) }
            addCursorRect(layout.workspaceAuthorization, cursor: .pointingHand)
        case 1:
            for card in layout.agentCards { addCursorRect(card, cursor: .pointingHand) }
        case 2:
            addCursorRect(layout.retestButton, cursor: .pointingHand)
            addCursorRect(layout.copyButton, cursor: .pointingHand)
        default:
            break
        }
    }

    public override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 53: // Escape
            closeGuide()
        case 123: // Left arrow
            retreatStep()
        case 124: // Right arrow
            activate(.next)
        case 36, 76: // Return / keypad Enter
            activate(.next)
        default:
            super.keyDown(with: event)
        }
    }

    public override func cancelOperation(_ sender: Any?) {
        closeGuide()
    }
}

// MARK: - Invisible Accessibility Proxy Button

/// Fully transparent NSButton used purely as an accessibility / automation proxy
/// for the custom-drawn controls. Pointer interaction is handled by the overlay
/// itself (`hitTest` returns the overlay), so this button never draws.
private final class GuideAccessibilityButton: NSButton {

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        isBordered = false
        bezelStyle = .regularSquare
        title = ""
        focusRingType = .none
        isTransparent = true
        setAccessibilityElement(true)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func draw(_ dirtyRect: NSRect) {
        // Intentionally empty: visuals are painted by the onboarding overlay.
    }
}
