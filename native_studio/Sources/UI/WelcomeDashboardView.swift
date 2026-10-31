//
//  WelcomeDashboardView.swift
//  native_studio
//
//  Mac native 1:1 replica of the VOO Design Welcome Dashboard / Workspace (工作台).
//  Pure AppKit + CoreGraphics custom drawing (no SwiftUI).
//  Reference: web_dashboard_full.png / web_dash_starred.png / web_dash_trash.png
//             web_dash_designsystems.png / web_dash_shortcuts.png (1440x900, title bar 40).
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics

public class WelcomeDashboardView: NSView, NSTextFieldDelegate {

    // MARK: - Public Navigation API

    /// Opens the editor with a project name (recents card / template / new document).
    public var onOpenEditor: ((String) -> Void)?
    /// Opens a local `.voo` document (toolbar "Open").
    public var onOpenFile: (() -> Void)?
    /// Creates a brand new document (toolbar "+ New"); falls back to `onOpenEditor("Untitled.voo")`.
    public var onNewFile: (() -> Void)?
    /// Hook for AI prompt submission from the composer card.
    public var onPromptSubmit: ((String) -> Void)?
    /// Hook for the import action cards ("Import from Figma" ...).
    public var onImportAction: ((String) -> Void)?
    /// Hook for the workspace "Change" affordances.
    public var onChangeWorkspace: (() -> Void)?
    /// Hook for the toolbar "Rescan" chip.
    public var onRescan: (() -> Void)?
    /// Actions on workspace files (reveal, duplicate, rename, move, star, trash)
    public var onFileAction: ((FileActionKind, String) -> Void)?
    /// Hook to empty the workspace .trash folder
    public var onEmptyTrash: (() -> Void)?
    /// Hook to create a new folder in the workspace
    public var onCreateFolder: (() -> Void)?

    public enum FileActionKind {
        case revealInFinder
        case duplicate
        case rename(String)
        case moveToFolder(String?)
        case toggleStar
        case moveToTrash
        case restoreFromTrash
        case deletePermanently
    }

    // MARK: - Visual Tokens (mirrors the web dashboard palette)

    private enum Palette {
        static let sidebar = NSColor.black
        static let main = NSColor(hex: "#0a0a0a")
        static let card = NSColor(hex: "#0f0f0f")
        static let emptyBox = NSColor(hex: "#0d0d0d")
        static let row = NSColor(hex: "#131313")
        static let prompt = NSColor(hex: "#171717")
        static let importCard = NSColor(hex: "#1e1e1e")
        static let chip = NSColor(hex: "#212121")
        static let activeRow = NSColor(hex: "#222222")
        static let activePill = NSColor(hex: "#262626")
        static let chipRaised = NSColor(hex: "#262626")
        static let sendButton = NSColor(hex: "#404040")
        static let inputField = NSColor(hex: "#121212")
        static let hover = NSColor(white: 1.0, alpha: 0.05)
        static let hoverSoft = NSColor(white: 1.0, alpha: 0.035)
        static let border = NSColor(white: 1.0, alpha: 0.06)
        static let borderStrong = NSColor(white: 1.0, alpha: 0.10)
        static let borderHover = NSColor(white: 1.0, alpha: 0.18)
        static let textBright = NSColor(hex: "#ffffff")
        static let textPrimary = NSColor(hex: "#e5e5e5")
        static let textSecondary = NSColor(hex: "#d4d4d4")
        static let textTertiary = NSColor(hex: "#a3a3a3")
        static let textMuted = NSColor(hex: "#737373")
        static let mint = ThemeTokens.colorMint
        static let purple = NSColor(hex: ThemeTokens.accentPurple)
        static let gold = NSColor(hex: "#fbbf24")
    }

    // MARK: - Data Model

    private enum Tab: Int, CaseIterable {
        case recents, drafts, starred, trash, designSystems, shortcuts

        var navTitle: String {
            switch self {
            case .recents: return "Recents"
            case .drafts: return "Drafts"
            case .starred: return "Starred"
            case .trash: return "Trash"
            case .designSystems: return "Design Systems"
            case .shortcuts: return "Shortcuts & Guide"
            }
        }
    }

    public enum ProjectKind: Sendable { case web, mobile }

    public struct ProjectItem: Sendable {
        public let title: String
        public let dimensions: String
        public let category: String
        public let openName: String
        public let kind: ProjectKind
        public let realFile: WorkspaceFile?

        public init(
            title: String,
            dimensions: String,
            category: String,
            openName: String,
            kind: ProjectKind,
            realFile: WorkspaceFile? = nil
        ) {
            self.title = title
            self.dimensions = dimensions
            self.category = category
            self.openName = openName
            self.kind = kind
            self.realFile = realFile
        }
    }

    private struct TemplateItem {
        let title: String
        let dimensions: String
    }

    private struct ShortcutItem {
        let name: String
        let keys: String
    }

    public var workspaceFiles: [WorkspaceFile] = [] {
        didSet {
            rebuildProjectItems()
            rebuildMetrics()
            needsDisplay = true
        }
    }

    private var customProjects: [ProjectItem] = []

    public func setWorkspaceFiles(_ files: [WorkspaceFile]) {
        self.workspaceFiles = files
    }

    private func rebuildProjectItems() {
        if workspaceFiles.isEmpty {
            customProjects = []
        } else {
            customProjects = workspaceFiles.map { file in
                let title = (file.name as NSString).deletingPathExtension
                let dim = file.formattedSize
                let cat = file.folder ?? file.extensionName.uppercased()
                let kind: ProjectKind = file.name.lowercased().contains("mobile") || file.name.lowercased().contains("iphone") ? .mobile : .web
                return ProjectItem(
                    title: title,
                    dimensions: dim,
                    category: cat,
                    openName: file.path,
                    kind: kind,
                    realFile: file
                )
            }
        }
    }

    private static let filters: [String] = [
        "All", "Landing page", "Mobile app", "Web app", "Slides", "Dashboard", "Something else..."
    ]

    private static let templates: [TemplateItem] = [
        TemplateItem(title: "Landing page", dimensions: "1440 × 900"),
        TemplateItem(title: "Mobile app", dimensions: "393 × 852"),
        TemplateItem(title: "Web app", dimensions: "1440 × 900"),
        TemplateItem(title: "Slides", dimensions: "1920 × 1080"),
        TemplateItem(title: "Dashboard", dimensions: "1440 × 960"),
        TemplateItem(title: "Something else...", dimensions: "1200 × 800")
    ]

    private static let shortcuts: [ShortcutItem] = [
        ShortcutItem(name: "Save current project (.voo)", keys: "⌘S / Ctrl+S"),
        ShortcutItem(name: "Save as a new .voo file", keys: "⌘⇧S / Ctrl+Shift+S"),
        ShortcutItem(name: "Open a local .voo project", keys: "⌘O / Ctrl+O"),
        ShortcutItem(name: "New design file", keys: "⌘N / Ctrl+N"),
        ShortcutItem(name: "Select tool / move layers", keys: "V"),
        ShortcutItem(name: "Pen path tool (Bezier curves)", keys: "P"),
        ShortcutItem(name: "Rich text input and typesetting", keys: "T"),
        ShortcutItem(name: "Rectangle / ellipse tool", keys: "R / O"),
        ShortcutItem(name: "Pan the canvas", keys: "Space + drag"),
        ShortcutItem(name: "Zoom the canvas", keys: "⌘ + scroll"),
        ShortcutItem(name: "Undo / redo", keys: "⌘Z / ⌘⇧Z"),
        ShortcutItem(name: "Group / ungroup", keys: "⌘G / ⌘⇧G")
    ]

    private static let aboutProjectFormat =
        "VOO Design uses a self-contained .voo project format that embeds all artboards, " +
        "vector Bezier nodes, layer masks and referenced images. Files can be copied to any " +
        "device and opened there."

    // MARK: - State

    private var activeTab: Tab = .recents
    private var activeFilter: String = "All"
    private var usesGridView = true
    private var sortsByName = false
    private var searchQuery: String = ""
    private var hoveredKey: String?
    private var hasSetup = false
    private var isApplyingFrames = false

    // MARK: - Subviews

    private let searchField = NSTextField()
    private let promptField = NSTextField()
    private var searchTargets: [String: HitTarget] = [:]
    private var navTargets: [Tab: HitTarget] = [:]
    private var filterTargets: [String: HitTarget] = [:]
    private var importTargets: [HitTarget] = []
    private var projectTargets: [HitTarget] = []
    private var listTargets: [HitTarget] = []
    private var templateTargets: [HitTarget] = []
    private var promptCardTarget: HitTarget?
    private var promptPlusTarget: HitTarget?
    private var promptSendTarget: HitTarget?
    private var sortTarget: HitTarget?
    private var gridTarget: HitTarget?
    private var listViewTarget: HitTarget?
    private var allTargets: [HitTarget] = []

    private var metrics = Metrics()

    // MARK: - Layout Metrics

    private struct Metrics {
        var sidebar = CGRect.zero
        var main = CGRect.zero
        var searchRect = CGRect.zero
        var workspaceRow = CGRect.zero
        var navRows: [CGRect] = []
        var templatesHeader = CGRect.zero
        var templateRows: [CGRect] = []
        var footerText = CGRect.zero
        var toolbarPill = CGRect.zero
        var toolbarLabel = CGRect.zero
        var toolbarChange = CGRect.zero
        var toolbarRescan = CGRect.zero
        var openButton = CGRect.zero
        var newButton = CGRect.zero
        var filterPills: [CGRect] = []
        var promptCard = CGRect.zero
        var promptFieldRect = CGRect.zero
        var promptPlus = CGRect.zero
        var promptSend = CGRect.zero
        var promptChip = CGRect.zero
        var promptStat1 = CGRect.zero
        var promptStat2 = CGRect.zero
        var importCards: [CGRect] = []
        var headerTitle = CGRect.zero
        var headerBadge = CGRect.zero
        var sortChip = CGRect.zero
        var viewToggle = CGRect.zero
        var gridToggle = CGRect.zero
        var listToggle = CGRect.zero
        var projectCards: [CGRect] = []
        var projectListRows: [CGRect] = []
        var emptyBox = CGRect.zero
        var recentsEmptyBox = CGRect.zero
        var templateCards: [CGRect] = []
        var shortcutsCard = CGRect.zero
        var shortcutsRows: [CGRect] = []
        var aboutCard = CGRect.zero
    }

    // MARK: - Init

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        commonInit()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    public override var isFlipped: Bool { true }
    public override var isOpaque: Bool { true }
    public override var acceptsFirstResponder: Bool { true }

    private func commonInit() {
        guard !hasSetup else { return }
        hasSetup = true
        wantsLayer = true
        setAccessibilityIdentifier("Welcome.Dashboard")
        setAccessibilityRole(.group)
        setAccessibilityLabel("VOO Design workspace dashboard")

        registerForDraggedTypes([.fileURL])

        configureSearchField()
        configurePromptField()
        buildHitTargets()
        rebuildMetrics()
    }

    // MARK: - Drag & Drop (Finder file drops)

    public override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        let pboard = sender.draggingPasteboard
        if let types = pboard.types, types.contains(.fileURL) {
            return .copy
        }
        return []
    }

    public override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let pboard = sender.draggingPasteboard
        guard let urls = pboard.readObjects(forClasses: [NSURL.self], options: nil) as? [URL], !urls.isEmpty else {
            return false
        }
        for url in urls {
            let ext = url.pathExtension.lowercased()
            if ext == "voo" || ext == "fig" {
                onOpenEditor?(url.path)
                return true
            } else if ["png", "jpg", "jpeg", "webp", "svg"].contains(ext) {
                let wsPath = WorkspaceManager.shared.currentWorkspacePath
                let dest = (wsPath as NSString).appendingPathComponent(url.lastPathComponent)
                try? FileManager.default.copyItem(at: url, to: URL(fileURLWithPath: dest))
                _ = WorkspaceManager.shared.rescan()
                onOpenEditor?(url.path)
                return true
            }
        }
        return false
    }

    // MARK: - Text Fields

    private func configureSearchField() {
        searchField.isBordered = false
        searchField.isEditable = true
        searchField.isSelectable = true
        searchField.drawsBackground = false
        searchField.backgroundColor = .clear
        searchField.focusRingType = .none
        searchField.font = ThemeFonts.mono(size: 12)
        searchField.textColor = Palette.textPrimary
        searchField.placeholderAttributedString = NSAttributedString(
            string: "Search files, drafts..",
            attributes: [
                .font: ThemeFonts.mono(size: 12),
                .foregroundColor: Palette.textMuted
            ]
        )
        if let cell = searchField.cell as? NSTextFieldCell {
            cell.usesSingleLineMode = true
            cell.isScrollable = true
            cell.wraps = false
        }
        searchField.delegate = self
        searchField.setAccessibilityIdentifier("Dashboard.Search")
        searchField.setAccessibilityLabel("Search files, drafts")
        addSubview(searchField)
    }

    private func configurePromptField() {
        promptField.isBordered = false
        promptField.isEditable = true
        promptField.isSelectable = true
        promptField.drawsBackground = false
        promptField.backgroundColor = .clear
        promptField.focusRingType = .none
        promptField.font = ThemeFonts.mono(size: 12)
        promptField.textColor = Palette.textPrimary
        promptField.placeholderAttributedString = NSAttributedString(
            string: "Design anything...",
            attributes: [
                .font: ThemeFonts.mono(size: 12),
                .foregroundColor: Palette.textTertiary
            ]
        )
        if let cell = promptField.cell as? NSTextFieldCell {
            cell.usesSingleLineMode = true
            cell.isScrollable = true
            cell.wraps = false
        }
        promptField.delegate = self
        promptField.setAccessibilityIdentifier("Dashboard.Prompt.Input")
        promptField.setAccessibilityLabel("Design anything prompt")
        addSubview(promptField)
    }

    @objc private func searchFieldChanged(_ sender: Any?) {
        searchQuery = currentText(of: searchField)
        if !searchQuery.isEmpty && activeTab != .recents {
            activeTab = .recents
        }
        rebuildMetrics()
        needsDisplay = true
    }

    private func currentText(of field: NSTextField) -> String {
        if let editor = field.currentEditor() {
            return editor.string
        }
        return field.stringValue
    }

    // MARK: - Hit Target Plumbing

    private final class HitTarget: NSView {
        var onClick: (() -> Void)?
        var onRightClick: ((NSEvent) -> Void)?
        var onHover: ((Bool) -> Void)?
        var hoverKey: String?
        var cursor: NSCursor = .pointingHand
        private var tracking: NSTrackingArea?

        override var isFlipped: Bool { true }
        override var acceptsFirstResponder: Bool { false }

        override func updateTrackingAreas() {
            super.updateTrackingAreas()
            if let tracking = tracking {
                removeTrackingArea(tracking)
                self.tracking = nil
            }
            let area = NSTrackingArea(
                rect: .zero,
                options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect],
                owner: self,
                userInfo: nil
            )
            addTrackingArea(area)
            tracking = area
        }

        override func mouseEntered(with event: NSEvent) { onHover?(true) }
        override func mouseExited(with event: NSEvent) { onHover?(false) }
        override func mouseDown(with event: NSEvent) { onClick?() }
        override func rightMouseDown(with event: NSEvent) {
            if let onRightClick = onRightClick {
                onRightClick(event)
            } else {
                super.rightMouseDown(with: event)
            }
        }
        override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
        override func resetCursorRects() { addCursorRect(bounds, cursor: cursor) }
        override func accessibilityPerformPress() -> Bool {
            onClick?()
            return true
        }
    }

    private func makeTarget(
        key: String,
        label: String,
        accessibilityID: String,
        cursor: NSCursor? = .pointingHand,
        action: @escaping () -> Void
    ) -> HitTarget {
        let target = HitTarget(frame: .zero)
        target.hoverKey = key
        target.setAccessibilityElement(true)
        target.setAccessibilityRole(.button)
        target.setAccessibilityLabel(label)
        target.setAccessibilityIdentifier(accessibilityID)
        target.onClick = action
        target.onHover = { [weak self] inside in
            guard let self = self else { return }
            if inside {
                self.hoveredKey = key
            } else if self.hoveredKey == key {
                self.hoveredKey = nil
            }
            self.needsDisplay = true
        }
        target.isHidden = true
        addSubview(target)
        allTargets.append(target)
        return target
    }

    private func buildHitTargets() {
        // Sidebar: workspace "Change".
        searchTargets["change"] = makeTarget(
            key: "sidebar.change",
            label: "Change workspace",
            accessibilityID: "Dashboard.Sidebar.WorkspaceChange"
        ) { [weak self] in self?.onChangeWorkspace?() }

        // Sidebar navigation.
        for tab in Tab.allCases where tab.rawValue < 4 {
            let target = makeTarget(
                key: "nav.\(tab.navTitle)",
                label: tab.navTitle,
                accessibilityID: "Dashboard.Sidebar.\(tab.navTitle.replacingOccurrences(of: " ", with: ""))"
            ) { [weak self] in self?.selectTab(tab) }
            navTargets[tab] = target
            if tab == .recents {
                searchTargets["nav.recents"] = target
            }
        }
        for tab in [Tab.designSystems, .shortcuts] {
            let target = makeTarget(
                key: "nav.\(tab.navTitle)",
                label: tab.navTitle,
                accessibilityID: "Dashboard.Sidebar.\(tab == .designSystems ? "DesignSystems" : "ShortcutsGuide")"
            ) { [weak self] in self?.selectTab(tab) }
            navTargets[tab] = target
        }

        // Toolbar.
        searchTargets["toolbar.change"] = makeTarget(
            key: "toolbar.change",
            label: "Change workspace",
            accessibilityID: "Dashboard.Toolbar.Change"
        ) { [weak self] in self?.onChangeWorkspace?() }
        searchTargets["toolbar.rescan"] = makeTarget(
            key: "toolbar.rescan",
            label: "Rescan workspace",
            accessibilityID: "Dashboard.Toolbar.Rescan"
        ) { [weak self] in self?.onRescan?() }
        searchTargets["toolbar.emptyTrash"] = makeTarget(
            key: "toolbar.emptyTrash",
            label: "Empty Trash",
            accessibilityID: "Dashboard.Toolbar.EmptyTrash"
        ) { [weak self] in self?.onEmptyTrash?() }
        searchTargets["toolbar.open"] = makeTarget(
            key: "toolbar.open",
            label: "Open a .voo file",
            accessibilityID: "Dashboard.Toolbar.Open"
        ) { [weak self] in self?.onOpenFile?() }
        searchTargets["toolbar.new"] = makeTarget(
            key: "toolbar.new",
            label: "New design file",
            accessibilityID: "Dashboard.Toolbar.New"
        ) { [weak self] in self?.createNewDocument() }

        // Filter pills.
        for filter in Self.filters {
            let target = makeTarget(
                key: "filter.\(filter)",
                label: "Filter \(filter)",
                accessibilityID: "Dashboard.Filter.\(filter.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ".", with: ""))"
            ) { [weak self] in
                guard let self = self else { return }
                self.activeFilter = filter
                self.rebuildMetrics()
                self.needsDisplay = true
            }
            filterTargets[filter] = target
        }

        // Prompt composer.
        promptCardTarget = makeTarget(
            key: "prompt.card",
            label: "Design anything prompt",
            accessibilityID: "Dashboard.Prompt"
        ) { [weak self] in
            guard let self = self else { return }
            self.window?.makeFirstResponder(self.promptField)
        }
        promptCardTarget?.cursor = .iBeam
        promptPlusTarget = makeTarget(
            key: "prompt.plus",
            label: "Add attachment to prompt",
            accessibilityID: "Dashboard.Prompt.Add"
        ) { [weak self] in
            guard let self = self else { return }
            self.window?.makeFirstResponder(self.promptField)
        }
        promptSendTarget = makeTarget(
            key: "prompt.send",
            label: "Send prompt to VOO Agent",
            accessibilityID: "Dashboard.Prompt.Send"
        ) { [weak self] in self?.submitPrompt() }

        // Import cards.
        let imports = ["Import from Figma", "Import from browser", "Recreate a screenshot"]
        for (index, title) in imports.enumerated() {
            let target = makeTarget(
                key: "import.\(index)",
                label: title,
                accessibilityID: "Dashboard.Import.\(index)"
            ) { [weak self] in self?.onImportAction?(title) }
            importTargets.append(target)
        }

        // Recents header controls.
        sortTarget = makeTarget(
            key: "sort",
            label: "Change sort order",
            accessibilityID: "Dashboard.Sort"
        ) { [weak self] in
            guard let self = self else { return }
            self.sortsByName.toggle()
            self.needsDisplay = true
        }
        gridTarget = makeTarget(
            key: "view.grid",
            label: "Grid view",
            accessibilityID: "Dashboard.ViewGrid"
        ) { [weak self] in
            guard let self = self else { return }
            self.usesGridView = true
            self.rebuildMetrics()
            self.needsDisplay = true
        }
        listViewTarget = makeTarget(
            key: "view.list",
            label: "List view",
            accessibilityID: "Dashboard.ViewList"
        ) { [weak self] in
            guard let self = self else { return }
            self.usesGridView = false
            self.rebuildMetrics()
            self.needsDisplay = true
        }

        // Recents project cards (grid + list variants).
        for index in 0..<100 {
            let target = makeTarget(
                key: "project.\(index)",
                label: "Project Card \(index)",
                accessibilityID: "Dashboard.ProjectCard.\(index)"
            ) { [weak self] in
                guard let self = self else { return }
                let items = self.filteredProjects()
                if items.indices.contains(index) {
                    self.onOpenEditor?(items[index].openName)
                }
            }
            target.onRightClick = { [weak self] event in
                self?.showContextMenu(for: index, event: event)
            }
            projectTargets.append(target)
        }
        for index in 0..<100 {
            let target = makeTarget(
                key: "list.\(index)",
                label: "Project Row \(index)",
                accessibilityID: "Dashboard.ProjectRow.\(index)"
            ) { [weak self] in
                guard let self = self else { return }
                let items = self.filteredProjects()
                if items.indices.contains(index) {
                    self.onOpenEditor?(items[index].openName)
                }
            }
            target.onRightClick = { [weak self] event in
                self?.showContextMenu(for: index, event: event)
            }
            listTargets.append(target)
        }

        // Design system template cards.
        for (index, template) in Self.templates.enumerated() {
            let target = makeTarget(
                key: "template.\(index)",
                label: template.title,
                accessibilityID: "Dashboard.Template.\(index)"
            ) { [weak self] in self?.onOpenEditor?("\(template.title).voo") }
            templateTargets.append(target)
        }

        // Text fields sit above hit targets.
        addSubview(searchField, positioned: .above, relativeTo: nil)
        addSubview(promptField, positioned: .above, relativeTo: nil)
    }

    private func selectTab(_ tab: Tab) {
        activeTab = tab
        if window?.firstResponder === promptField.currentEditor() {
            window?.makeFirstResponder(nil)
        }
        rebuildMetrics()
        needsDisplay = true
    }

    private func createNewDocument() {
        if let onNewFile = onNewFile {
            onNewFile()
        } else {
            onOpenEditor?("Untitled.voo")
        }
    }

    private func submitPrompt() {
        let text = currentText(of: promptField).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            window?.makeFirstResponder(promptField)
            return
        }
        if let onPromptSubmit = onPromptSubmit {
            onPromptSubmit(text)
        } else {
            onOpenEditor?("AI Generated Prototype.voo")
        }
        promptField.stringValue = ""
        promptField.currentEditor()?.string = ""
        needsDisplay = true
    }

    // MARK: - Layout

    public override func layout() {
        super.layout()
        rebuildMetrics()
    }

    private func rebuildMetrics() {
        guard hasSetup, !isApplyingFrames else { return }
        isApplyingFrames = true
        metrics = buildMetrics()
        applyFrames()
        isApplyingFrames = false
    }

    private func buildMetrics() -> Metrics {
        var m = Metrics()
        let width = max(bounds.width, 0)
        let height = max(bounds.height, 0)
        let shellInset: CGFloat = 2
        let sidebarWidth: CGFloat = 240
        let mainStartX = shellInset + sidebarWidth
        let mainWidth = max(width - mainStartX - shellInset, 0)
        let contentMaxWidth: CGFloat = 1088
        let contentWidth = min(contentMaxWidth, max(mainWidth - 64, 0))
        let contentX = mainStartX + max((mainWidth - contentWidth) / 2, 0)
        let mainCenterX = mainStartX + mainWidth / 2

        // Sidebar chrome: x2 y2 w240 h-4, 12/8 padding. The left-only 24pt rounding is
        // provided by the editor shell clip (this view is flush inside the shell).
        m.sidebar = CGRect(x: shellInset, y: shellInset, width: sidebarWidth, height: max(height - shellInset * 2, 0))
        m.main = CGRect(x: mainStartX, y: shellInset, width: mainWidth, height: max(height - shellInset * 2, 0))
        let sideRowX: CGFloat = 10
        let sideRowWidth: CGFloat = 224
        m.searchRect = CGRect(x: sideRowX, y: 14, width: sideRowWidth, height: 32)
        m.workspaceRow = CGRect(x: sideRowX, y: 62, width: sideRowWidth, height: 32)
        m.navRows = (0..<4).map { index in
            CGRect(x: sideRowX, y: 111 + CGFloat(index) * 30, width: sideRowWidth, height: 28)
        }
        m.templatesHeader = CGRect(x: 21, y: 254, width: 200, height: 14)
        m.templateRows = (0..<2).map { index in
            CGRect(x: sideRowX, y: 273 + CGFloat(index) * 30, width: sideRowWidth, height: 28)
        }
        m.footerText = CGRect(x: 19, y: height - 28, width: 130, height: 14)

        // Toolbar workspace bar (aligned with the shell top inset; y56 window = y16 view buttons).
        let toolbarLeft = mainStartX + 32
        let toolbarRight = max(width - shellInset - 32, toolbarLeft)
        let pillWidth = min(414, max(toolbarRight - toolbarLeft - 170, 0))
        m.toolbarPill = CGRect(x: toolbarLeft, y: 13, width: pillWidth, height: 34)
        let changeX = toolbarLeft + min(279, pillWidth * 0.68)
        let rescanX = max(changeX + 56, toolbarLeft + min(339, pillWidth * 0.83))
        m.toolbarLabel = CGRect(x: toolbarLeft + 40, y: 24, width: max(changeX - toolbarLeft - 52, 0), height: 16)
        m.toolbarChange = CGRect(x: changeX, y: 24, width: 48, height: 16)
        m.toolbarRescan = CGRect(x: rescanX, y: 24, width: 60, height: 16)

        let newWidth: CGFloat = 70
        let openWidth: CGFloat = 73
        m.newButton = CGRect(x: max(toolbarRight - newWidth, mainStartX + 8), y: 16, width: newWidth, height: 28)
        m.openButton = CGRect(x: max(m.newButton.minX - 12 - openWidth, mainStartX + 8), y: 16, width: openWidth, height: 28)

        // Filter pills: h28, 12pt horizontal padding, 8pt gaps, centered in the workspace column.
        let pillFont = ThemeFonts.mono(size: 12, weight: .medium)
        let pillAttributes: [NSAttributedString.Key: Any] = [.font: pillFont]
        var pillWidths: [CGFloat] = []
        for filter in Self.filters {
            pillWidths.append((filter as NSString).size(withAttributes: pillAttributes).width + 23.5)
        }
        let gap: CGFloat = 8
        let totalPills = pillWidths.reduce(0, +) + gap * CGFloat(max(Self.filters.count - 1, 0))
        var pillX = mainCenterX - totalPills / 2
        m.filterPills = []
        for pillWidth in pillWidths {
            m.filterPills.append(CGRect(x: pillX, y: 90, width: pillWidth, height: 28))
            pillX += pillWidth + gap
        }

        // Prompt composer: x296 y190 w1088 h124 (view y = web y - 40), padding 16, radius 24.
        m.promptCard = CGRect(x: contentX, y: 150, width: contentWidth, height: 124)
        let cardMaxX = m.promptCard.maxX
        m.promptSend = CGRect(x: cardMaxX - 12 - 26, y: 236, width: 26, height: 26)
        m.promptChip = CGRect(x: m.promptSend.minX - 12 - 116, y: 238, width: 116, height: 22)
        m.promptStat2 = CGRect(x: m.promptChip.minX - 16 - 31, y: 242, width: 31, height: 14)
        m.promptStat1 = CGRect(x: m.promptStat2.minX - 14 - 31, y: 242, width: 31, height: 14)
        m.promptPlus = CGRect(x: contentX + 16, y: 238, width: 24, height: 24)
        m.promptFieldRect = CGRect(
            x: contentX + 16,
            y: 169,
            width: max(m.promptStat1.minX - contentX - 32, 120),
            height: 20
        )

        // Import cards: h48, 12pt gap, radius 16.
        let importGap: CGFloat = 12
        let importWidth = max((contentWidth - importGap * 2) / 3, 0)
        m.importCards = (0..<3).map { index in
            CGRect(x: contentX + CGFloat(index) * (importWidth + importGap), y: 306, width: importWidth, height: 48)
        }

        // Content header (recents / drafts / starred / trash).
        let headerTop: CGFloat = activeTab == .recents ? 394 : 90
        m.headerTitle = CGRect(x: contentX, y: headerTop + 8, width: 160, height: 14)
        m.headerBadge = CGRect(x: contentX + 72, y: headerTop + 4, width: 26, height: 20)
        m.sortChip = CGRect(x: contentX + contentWidth - 46 - 12 - 132, y: headerTop, width: 132, height: 28)
        m.viewToggle = CGRect(x: contentX + contentWidth - 45, y: headerTop, width: 45, height: 28)
        m.gridToggle = CGRect(x: m.viewToggle.minX + 2, y: headerTop + 4, width: 21, height: 21)
        m.listToggle = CGRect(x: m.viewToggle.minX + 24, y: headerTop + 4, width: 21, height: 21)

        // Project cards layout (grid + list variants).
        let cardsTop: CGFloat = activeTab == .recents ? 442 : 138
        let cardWidth: CGFloat = 220
        let cardHeight: CGFloat = 190
        let cardGap: CGFloat = 16
        let cols = max(1, Int((contentWidth + cardGap) / (cardWidth + cardGap)))
        let items = filteredProjects()
        let cardCount = items.count
        m.projectCards = (0..<cardCount).map { index in
            let col = index % cols
            let row = index / cols
            return CGRect(
                x: contentX + CGFloat(col) * (cardWidth + cardGap),
                y: cardsTop + CGFloat(row) * (cardHeight + cardGap),
                width: cardWidth,
                height: cardHeight
            )
        }
        let listRowHeight: CGFloat = 56
        m.projectListRows = (0..<cardCount).map { index in
            CGRect(x: contentX, y: cardsTop + CGFloat(index) * (listRowHeight + 8), width: contentWidth, height: listRowHeight)
        }
        m.emptyBox = CGRect(x: contentX, y: 134, width: contentWidth, height: 205)
        m.recentsEmptyBox = CGRect(x: contentX, y: 442, width: contentWidth, height: 205)

        // Template grid.
        let gridMaxWidth = min(960, contentWidth)
        let gridX = contentX + max((contentWidth - gridMaxWidth) / 2, 0)
        let templateGap: CGFloat = 16
        let columns: Int
        if gridMaxWidth >= 880 {
            columns = 3
        } else if gridMaxWidth >= 560 {
            columns = 2
        } else {
            columns = 1
        }
        let templateWidth = max((gridMaxWidth - templateGap * CGFloat(columns - 1)) / CGFloat(columns), 0)
        m.templateCards = (0..<Self.templates.count).map { index in
            let column = index % columns
            let row = index / columns
            return CGRect(
                x: gridX + CGFloat(column) * (templateWidth + templateGap),
                y: 90 + CGFloat(row) * (156 + templateGap),
                width: templateWidth,
                height: 156
            )
        }

        // Shortcuts & guide.
        let shortcutsWidth = min(832, contentWidth)
        let shortcutsX = contentX + max((contentWidth - shortcutsWidth) / 2, 0)
        let twoColumns = shortcutsWidth >= 720
        let shortcutColumns = twoColumns ? 2 : 1
        let shortcutRowCount = Int(ceil(Double(Self.shortcuts.count) / Double(shortcutColumns)))
        let rowGap: CGFloat = twoColumns ? 12 : 8
        let rowHeight: CGFloat = twoColumns ? 40 : 36
        let shortcutsCardHeight = 64 + CGFloat(shortcutRowCount) * rowHeight + CGFloat(shortcutRowCount - 1) * rowGap + 24
        m.shortcutsCard = CGRect(x: shortcutsX, y: 90, width: shortcutsWidth, height: shortcutsCardHeight)
        let rowGapBetweenColumns: CGFloat = 16
        let rowWidth = max((shortcutsWidth - 48 - rowGapBetweenColumns * CGFloat(shortcutColumns - 1)) / CGFloat(shortcutColumns), 0)
        m.shortcutsRows = (0..<Self.shortcuts.count).map { index in
            let column = index % shortcutColumns
            let row = index / shortcutColumns
            return CGRect(
                x: shortcutsX + 24 + CGFloat(column) * (rowWidth + rowGapBetweenColumns),
                y: 90 + 64 + CGFloat(row) * (rowHeight + rowGap),
                width: rowWidth,
                height: rowHeight
            )
        }
        let aboutY = m.shortcutsCard.maxY + 24
        let aboutWidth = shortcutsWidth
        let aboutTextWidth = max(aboutWidth - 48, 40)
        let aboutTextHeight = measuredTextHeight(
            Self.aboutProjectFormat,
            font: ThemeFonts.mono(size: 12),
            width: aboutTextWidth,
            lineHeight: 16
        )
        m.aboutCard = CGRect(x: shortcutsX, y: aboutY, width: aboutWidth, height: 48 + aboutTextHeight + 24)

        return m
    }

    private func applyFrames() {
        let m = metrics

        searchField.frame = CGRect(
            x: m.searchRect.minX + 30,
            y: m.searchRect.minY + 10,
            width: max(m.searchRect.width - 30 - 28, 10),
            height: 18
        )
        promptField.frame = m.promptFieldRect
        promptField.isHidden = activeTab != .recents

        // Sidebar.
        setFrame(searchTargets["change"], CGRect(
            x: m.workspaceRow.maxX - 72,
            y: m.workspaceRow.minY,
            width: 66,
            height: m.workspaceRow.height
        ))
        setFrame(navTargets[.recents], m.navRows.count > 0 ? m.navRows[0] : .zero)
        setFrame(navTargets[.drafts], m.navRows.count > 1 ? m.navRows[1] : .zero)
        setFrame(navTargets[.starred], m.navRows.count > 2 ? m.navRows[2] : .zero)
        setFrame(navTargets[.trash], m.navRows.count > 3 ? m.navRows[3] : .zero)
        setFrame(navTargets[.designSystems], m.templateRows.count > 0 ? m.templateRows[0] : .zero)
        setFrame(navTargets[.shortcuts], m.templateRows.count > 1 ? m.templateRows[1] : .zero)

        // Toolbar.
        setFrame(searchTargets["toolbar.change"], CGRect(x: m.toolbarChange.minX - 8, y: m.toolbarPill.minY, width: m.toolbarChange.width + 16, height: m.toolbarPill.height))
        setFrame(searchTargets["toolbar.rescan"], CGRect(x: m.toolbarRescan.minX - 8, y: m.toolbarPill.minY, width: m.toolbarRescan.width + 16, height: m.toolbarPill.height))
        setFrame(searchTargets["toolbar.open"], m.openButton)
        setFrame(searchTargets["toolbar.new"], m.newButton)

        // Filters.
        let showRecentsChrome = activeTab == .recents
        for (index, filter) in Self.filters.enumerated() {
            let target = filterTargets[filter]
            target?.frame = m.filterPills.indices.contains(index) ? m.filterPills[index] : .zero
            target?.isHidden = !showRecentsChrome
        }

        // Prompt.
        promptCardTarget?.frame = m.promptCard
        promptCardTarget?.isHidden = !showRecentsChrome
        promptPlusTarget?.frame = m.promptPlus
        promptPlusTarget?.isHidden = !showRecentsChrome
        promptSendTarget?.frame = m.promptSend
        promptSendTarget?.isHidden = !showRecentsChrome

        // Imports.
        for (index, target) in importTargets.enumerated() {
            target.frame = m.importCards.indices.contains(index) ? m.importCards[index] : .zero
            target.isHidden = !showRecentsChrome
        }

        // Recents header controls.
        let showsHeader = activeTab != .designSystems && activeTab != .shortcuts
        sortTarget?.frame = m.sortChip
        sortTarget?.isHidden = !showsHeader
        gridTarget?.frame = m.gridToggle
        gridTarget?.isHidden = !showsHeader
        listViewTarget?.frame = m.listToggle
        listViewTarget?.isHidden = !showsHeader

        // Project cards / rows.
        let visibleProjects = filteredProjects()
        let isProjectTab = (activeTab == .recents || activeTab == .drafts || activeTab == .starred || activeTab == .trash)
        for (index, target) in projectTargets.enumerated() {
            let visible = isProjectTab && usesGridView && visibleProjects.indices.contains(index) && m.projectCards.indices.contains(index)
            target.frame = visible ? m.projectCards[index] : .zero
            target.isHidden = !visible
        }
        for (index, target) in listTargets.enumerated() {
            let visible = isProjectTab && !usesGridView && visibleProjects.indices.contains(index) && m.projectListRows.indices.contains(index)
            target.frame = visible ? m.projectListRows[index] : .zero
            target.isHidden = !visible
        }

        let emptyTrashTarget = searchTargets["toolbar.emptyTrash"]
        if activeTab == .trash && visibleProjects.count > 0 {
            emptyTrashTarget?.frame = CGRect(x: m.sortChip.minX - 110, y: m.sortChip.minY, width: 100, height: 28)
            emptyTrashTarget?.isHidden = false
        } else {
            emptyTrashTarget?.frame = .zero
            emptyTrashTarget?.isHidden = true
        }

        // Template cards.
        for (index, target) in templateTargets.enumerated() {
            target.frame = m.templateCards.indices.contains(index) ? m.templateCards[index] : .zero
            target.isHidden = activeTab != .designSystems
        }

        // Clear hover when the hovered control disappeared.
        if let hovered = hoveredKey,
           let target = allTargets.first(where: { $0.hoverKey == hovered }),
           target.isHidden {
            hoveredKey = nil
        }
    }

    private func setFrame(_ target: HitTarget?, _ frame: CGRect) {
        guard let target = target else { return }
        target.frame = frame
        target.isHidden = frame.width <= 0 || frame.height <= 0
    }

    // MARK: - Filtering / Sorting

    private func filteredProjects() -> [ProjectItem] {
        // Web parity: the dashboard only renders real workspace files. An empty
        // workspace shows the "Recents 0" state with no cards (no demo fallback).
        let sourceProjects: [ProjectItem]
        switch activeTab {
        case .recents:
            sourceProjects = customProjects.filter { !($0.realFile?.trashed ?? false) }
        case .drafts:
            sourceProjects = customProjects.filter {
                !($0.realFile?.trashed ?? false) &&
                ($0.title.hasPrefix("Untitled") || $0.category.lowercased() == "drafts" || $0.title.lowercased().contains("draft"))
            }
        case .starred:
            sourceProjects = customProjects.filter {
                !($0.realFile?.trashed ?? false) && ($0.realFile?.starred ?? false)
            }
        case .trash:
            sourceProjects = customProjects.filter { $0.realFile?.trashed ?? false }
        case .designSystems, .shortcuts:
            sourceProjects = []
        }

        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var items = sourceProjects.filter { project in
            let matchesFilter = activeFilter == "All" || project.category == activeFilter
            let matchesQuery = query.isEmpty
                || project.title.lowercased().contains(query)
                || project.category.lowercased().contains(query)
            return matchesFilter && matchesQuery
        }
        if sortsByName {
            items.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        }
        return items
    }

    // MARK: - Drawing

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let m = metrics

        Palette.sidebar.setFill()
        m.sidebar.fill()
        Palette.main.setFill()
        m.main.fill()

        drawSidebar(ctx: ctx, metrics: m)
        drawToolbar(ctx: ctx, metrics: m)

        switch activeTab {
        case .recents:
            drawRecents(ctx: ctx, metrics: m)
        case .drafts, .starred, .trash:
            drawFileTab(ctx: ctx, metrics: m)
        case .designSystems:
            drawDesignSystems(ctx: ctx, metrics: m)
        case .shortcuts:
            drawShortcuts(ctx: ctx, metrics: m)
        }

        // The text fields (subviews) paint themselves on top.
    }

    public override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(nil)
        super.mouseDown(with: event)
    }

    // MARK: Sidebar

    private func drawSidebar(ctx: CGContext, metrics m: Metrics) {
        // Search pill background (the NSTextField floats above).
        fillRounded(m.searchRect, radius: 12, color: Palette.inputField)
        drawVooIcon(CGRect(x: m.searchRect.minX + 12, y: m.searchRect.minY + 9, width: 12, height: 12)) { iconRect in VooIconFactory.drawSearch(in: iconRect, color: Palette.textMuted, strokeWidth: 1.7) }

        // Workspace row.
        let workspaceHovered = hoveredKey == "sidebar.change"
        if workspaceHovered {
            fillRounded(m.workspaceRow, radius: 12, color: Palette.hoverSoft)
        }
        strokeRounded(m.workspaceRow, radius: 12, color: Palette.border, lineWidth: 1)
        drawVooIcon(CGRect(x: m.workspaceRow.minX + 10, y: m.workspaceRow.minY + 10, width: 14, height: 14)) { iconRect in VooIconFactory.drawFolder(in: iconRect, color: Palette.mint.withAlphaComponent(0.8), strokeWidth: 1.6) }
        let wsConfig = WorkspaceManager.shared.getWorkspaceConfig()
        let wsName = (wsConfig.path as NSString).lastPathComponent
        drawText(
            wsName,
            x: m.workspaceRow.minX + 30,
            top: m.workspaceRow.minY + 10,
            width: max(m.workspaceRow.width - 30 - 84, 10),
            height: 16,
            font: ThemeFonts.mono(size: 12),
            color: Palette.textSecondary
        )
        drawText(
            "Change",
            x: m.workspaceRow.maxX - 67,
            top: m.workspaceRow.minY + 10,
            width: 52,
            height: 14,
            font: ThemeFonts.mono(size: 10),
            color: workspaceHovered ? Palette.textPrimary : Palette.textMuted,
            alignment: .right
        )

        // Navigation rows.
        let navTabs: [Tab] = [.recents, .drafts, .starred, .trash]
        for (index, tab) in navTabs.enumerated() {
            guard m.navRows.indices.contains(index) else { continue }
            let row = m.navRows[index]
            let isActive = activeTab == tab
            let isHovered = hoveredKey == "nav.\(tab.navTitle)"
            if isActive {
                fillRounded(row, radius: 12, color: Palette.activeRow)
            } else if isHovered {
                fillRounded(row, radius: 12, color: Palette.hover)
            }
            let tint = isActive ? Palette.textPrimary : Palette.textTertiary
            let iconRect = CGRect(x: row.minX + 10, y: row.minY + 7, width: 14, height: 14)
            switch tab {
            case .recents:
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawClock(in: iconRect, color: tint, strokeWidth: 1.6) }
            case .drafts:
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawFileText(in: iconRect, color: tint, strokeWidth: 1.6) }
            case .starred:
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawStar(in: iconRect, color: tint, strokeWidth: 1.6) }
            case .trash:
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawTrash(in: iconRect, color: tint, strokeWidth: 1.6) }
            default:
                break
            }
            drawText(
                tab.navTitle,
                x: row.minX + 34,
                top: row.minY + 9,
                width: max(row.width - 44, 10),
                height: 16,
                font: ThemeFonts.mono(size: 12, weight: isActive ? .semibold : .regular),
                color: tint
            )
        }

        // Templates section.
        drawText(
            "TEMPLATES",
            x: m.templatesHeader.minX,
            top: m.templatesHeader.minY,
            width: m.templatesHeader.width,
            height: 14,
            font: ThemeFonts.mono(size: 11, weight: .semibold),
            color: Palette.textMuted,
            tracking: 0.55
        )
        let templateTabs: [Tab] = [.designSystems, .shortcuts]
        for (index, tab) in templateTabs.enumerated() {
            guard m.templateRows.indices.contains(index) else { continue }
            let row = m.templateRows[index]
            let isActive = activeTab == tab
            let isHovered = hoveredKey == "nav.\(tab.navTitle)"
            if isActive {
                fillRounded(row, radius: 12, color: Palette.activeRow)
            } else if isHovered {
                fillRounded(row, radius: 12, color: Palette.hover)
            }
            let tint = isActive ? Palette.textPrimary : Palette.textTertiary
            let iconRect = CGRect(x: row.minX + 10, y: row.minY + 8, width: 14, height: 14)
            if tab == .designSystems {
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawLayoutGrid(in: iconRect, color: tint, strokeWidth: 1.6) }
            } else {
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawCompass(in: iconRect, color: tint, strokeWidth: 1.6) }
            }
            drawText(
                tab.navTitle,
                x: row.minX + 34,
                top: row.minY + 9,
                width: max(row.width - 44, 10),
                height: 16,
                font: ThemeFonts.mono(size: 12, weight: isActive ? .semibold : .regular),
                color: tint
            )
        }

        // Footer: web only shows the version label at the bottom-left.
        drawText(
            "VOO Design 1.0",
            x: m.footerText.minX,
            top: m.footerText.minY,
            width: m.footerText.width,
            height: 14,
            font: ThemeFonts.mono(size: 11),
            color: Palette.textMuted
        )
    }

    // MARK: Toolbar

    private func drawToolbar(ctx: CGContext, metrics m: Metrics) {
        fillRounded(m.toolbarPill, radius: 12, color: NSColor(hex: "#141414"))
        strokeRounded(m.toolbarPill, radius: 12, color: Palette.border, lineWidth: 1)
        drawVooIcon(CGRect(x: m.toolbarPill.minX + 14, y: m.toolbarPill.minY + 9, width: 16, height: 16)) { iconRect in VooIconFactory.drawFolder(in: iconRect, color: Palette.mint.withAlphaComponent(0.85), strokeWidth: 1.6) }
        let wsConfig = WorkspaceManager.shared.getWorkspaceConfig()
        let wsName = (wsConfig.path as NSString).lastPathComponent
        // Web shows the storage-driver badge (welcome.workspace.badgeDesktop),
        // e.g. "Browser Workspace [Browser Mount]"; native is a macOS workspace.
        drawText(
            "\(wsName) [macOS Native]",
            x: m.toolbarLabel.minX,
            top: m.toolbarLabel.minY,
            width: m.toolbarLabel.width,
            height: 16,
            font: ThemeFonts.mono(size: 11),
            color: Palette.textPrimary
        )
        drawText(
            "Change",
            x: m.toolbarChange.minX,
            top: m.toolbarChange.minY,
            width: m.toolbarChange.width,
            height: 16,
            font: ThemeFonts.mono(size: 11),
            color: hoveredKey == "toolbar.change" ? Palette.textPrimary : Palette.textTertiary
        )
        drawVooIcon(CGRect(x: m.toolbarRescan.minX, y: m.toolbarRescan.minY + 2, width: 13, height: 13)) { iconRect in VooIconFactory.drawRefresh(in: iconRect, color: hoveredKey == "toolbar.rescan" ? Palette.textPrimary : Palette.textTertiary, strokeWidth: 1.5) }
        drawText(
            "Rescan",
            x: m.toolbarRescan.minX + 16,
            top: m.toolbarRescan.minY,
            width: 48,
            height: 16,
            font: ThemeFonts.mono(size: 11),
            color: hoveredKey == "toolbar.rescan" ? Palette.textPrimary : Palette.textTertiary
        )

        // Open button.
        if hoveredKey == "toolbar.open" {
            fillRounded(m.openButton, radius: 12, color: NSColor(hex: "#1f1f1f"))
        } else {
            fillRounded(m.openButton, radius: 12, color: NSColor(hex: "#141414"))
        }
        strokeRounded(m.openButton, radius: 12, color: Palette.border, lineWidth: 1)
        drawVooIcon(CGRect(x: m.openButton.minX + 12, y: m.openButton.minY + 8, width: 13, height: 13)) { iconRect in VooIconFactory.drawFolder(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.6) }
        drawText(
            "Open",
            x: m.openButton.minX + 31,
            top: m.openButton.minY + 7,
            width: m.openButton.width - 38,
            height: 16,
            font: ThemeFonts.mono(size: 12, weight: .medium),
            color: Palette.textPrimary
        )

        // New button (solid white).
        fillRounded(m.newButton, radius: 12, color: hoveredKey == "toolbar.new" ? NSColor(hex: "#d4d4d4") : Palette.textBright)
        drawVooIcon(CGRect(x: m.newButton.minX + 14, y: m.newButton.minY + 7, width: 14, height: 14)) { iconRect in VooIconFactory.drawPlus(in: iconRect, color: NSColor.black, strokeWidth: 1.8) }
        drawText(
            "New",
            x: m.newButton.minX + 34,
            top: m.newButton.minY + 7,
            width: m.newButton.width - 38,
            height: 16,
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: NSColor.black
        )
    }

    // MARK: Recents tab

    private func drawRecents(ctx: CGContext, metrics m: Metrics) {
        drawFilterPills(metrics: m)
        drawPromptCard(ctx: ctx, metrics: m)
        drawImportCards(ctx: ctx, metrics: m)
        drawContentHeader(count: filteredProjects().count, metrics: m)

        let items = filteredProjects()
        if items.isEmpty {
            // Web parity: an empty Recents tab renders no cards and no empty-state
            // panel; the search empty state only appears while filtering by query.
            let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            if !query.isEmpty {
                drawEmptyState(
                    ctx: ctx,
                    rect: m.recentsEmptyBox,
                    icon: .search,
                    title: "No matching files found",
                    hint: "\"\(query)\""
                )
            }
            return
        }
        if usesGridView {
            for (index, item) in items.enumerated() where m.projectCards.indices.contains(index) {
                drawProjectCard(item: item, rect: m.projectCards[index], index: index)
            }
        } else {
            for (index, item) in items.enumerated() where m.projectListRows.indices.contains(index) {
                drawProjectRow(item: item, rect: m.projectListRows[index], index: index)
            }
        }
    }

    private func drawFilterPills(metrics m: Metrics) {
        for (index, filter) in Self.filters.enumerated() {
            guard m.filterPills.indices.contains(index) else { continue }
            let rect = m.filterPills[index]
            let isActive = filter == activeFilter
            let isHovered = hoveredKey == "filter.\(filter)"
            if isActive {
                fillRounded(rect, radius: 12, color: isHovered ? NSColor(hex: "#2e2e2e") : Palette.activePill)
            } else if isHovered {
                fillRounded(rect, radius: 12, color: Palette.hover)
            }
            drawText(
                filter,
                x: rect.minX,
                top: rect.minY + 8,
                width: rect.width,
                height: 16,
                font: ThemeFonts.mono(size: 12, weight: .medium),
                color: isActive ? Palette.textBright : Palette.textTertiary,
                alignment: .center
            )
        }
    }

    private func drawPromptCard(ctx: CGContext, metrics m: Metrics) {
        let rect = m.promptCard
        guard rect.width > 2 && rect.height > 2 else { return }
        let radius: CGFloat = 24
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

        // Soft mint → purple halo: offset coloured shadows (smooth, no seams).
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: -4, height: 2), blur: 18, color: Palette.mint.withAlphaComponent(0.15).cgColor)
        ctx.setFillColor(Palette.prompt.cgColor)
        ctx.addPath(path)
        ctx.fillPath()
        ctx.restoreGState()

        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 4, height: -2), blur: 18, color: Palette.purple.withAlphaComponent(0.13).cgColor)
        ctx.setFillColor(Palette.prompt.cgColor)
        ctx.addPath(path)
        ctx.fillPath()
        ctx.restoreGState()

        // Core surface.
        ctx.setFillColor(Palette.prompt.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // Gradient 1px border (mint → purple) like the web "AI composer" glow ring.
        ctx.saveGState()
        ctx.addPath(path)
        ctx.clip()
        let colors = [
            Palette.mint.withAlphaComponent(0.10).cgColor,
            Palette.mint.withAlphaComponent(0.30).cgColor,
            Palette.purple.withAlphaComponent(0.40).cgColor,
            Palette.purple.withAlphaComponent(0.20).cgColor
        ] as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.0, 0.30, 0.65, 1.0]) {
            ctx.drawLinearGradient(
                gradient,
                start: CGPoint(x: rect.minX, y: rect.midY),
                end: CGPoint(x: rect.maxX, y: rect.midY),
                options: []
            )
        }
        ctx.restoreGState()
        let insetPath = CGPath(
            roundedRect: rect.insetBy(dx: 1, dy: 1),
            cornerWidth: radius - 1,
            cornerHeight: radius - 1,
            transform: nil
        )
        ctx.setFillColor(Palette.prompt.cgColor)
        ctx.addPath(insetPath)
        ctx.fillPath()

        // Plus circle.
        ctx.setFillColor((hoveredKey == "prompt.plus" ? NSColor(hex: "#2e2e2e") : NSColor(hex: "#202020")).cgColor)
        ctx.fillEllipse(in: m.promptPlus)
        drawVooIcon(CGRect(x: m.promptPlus.midX - 6, y: m.promptPlus.midY - 6, width: 12, height: 12)) { iconRect in VooIconFactory.drawPlus(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.6) }

        // Stats: "⚡ 1x  ⊞ 1x".
        drawVooIcon(CGRect(x: m.promptStat1.minX, y: m.promptStat1.minY + 1, width: 12, height: 12)) { iconRect in VooIconFactory.drawZap(in: iconRect, color: Palette.gold, strokeWidth: 1.6) }
        drawText(
            "1x",
            x: m.promptStat1.minX + 17,
            top: m.promptStat1.minY,
            width: 20,
            height: 14,
            font: ThemeFonts.mono(size: 11),
            color: Palette.gold
        )
        drawVooIcon(CGRect(x: m.promptStat2.minX, y: m.promptStat2.minY + 1, width: 12, height: 12)) { iconRect in VooIconFactory.drawGrid(in: iconRect, color: Palette.textMuted, strokeWidth: 1.4) }
        drawText(
            "1x",
            x: m.promptStat2.minX + 17,
            top: m.promptStat2.minY,
            width: 20,
            height: 14,
            font: ThemeFonts.mono(size: 11),
            color: Palette.textMuted
        )

        // Agent chip.
        fillRounded(m.promptChip, radius: 8, color: Palette.chip)
        drawText(
            "VOO Agent 3.5",
            x: m.promptChip.minX,
            top: m.promptChip.minY + 4,
            width: m.promptChip.width,
            height: 14,
            font: ThemeFonts.mono(size: 11),
            color: Palette.textTertiary,
            alignment: .center
        )

        // Send button.
        let hasText = !currentText(of: promptField).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let sendColor = hasText ? Palette.textSecondary : Palette.sendButton
        ctx.setFillColor((hoveredKey == "prompt.send" ? sendColor.blended(withFraction: 0.12, of: .white) ?? sendColor : sendColor).cgColor)
        ctx.fillEllipse(in: m.promptSend)
        drawVooIcon(CGRect(x: m.promptSend.midX - 6, y: m.promptSend.midY - 6, width: 12, height: 12)) { iconRect in VooIconFactory.drawArrowUp(in: iconRect, color: hasText ? NSColor.black : Palette.textBright, strokeWidth: 1.9) }
    }

    private func drawImportCards(ctx: CGContext, metrics m: Metrics) {
        let titles = ["Import from Figma", "Import from browser", "Recreate a screenshot"]
        let font = ThemeFonts.mono(size: 12, weight: .medium)
        for (index, title) in titles.enumerated() {
            guard m.importCards.indices.contains(index) else { continue }
            let rect = m.importCards[index]
            let isHovered = hoveredKey == "import.\(index)"
            fillRounded(rect, radius: 16, color: isHovered ? NSColor(hex: "#262626") : Palette.importCard)
            strokeRounded(rect, radius: 16, color: isHovered ? Palette.borderStrong : Palette.border, lineWidth: 1)
            let titleWidth = textWidth(title, font: font)
            let contentWidth = 16 + 10 + titleWidth
            let startX = rect.midX - contentWidth / 2
            let iconRect = CGRect(x: startX, y: rect.midY - 8, width: 16, height: 16)
            switch index {
            case 0:
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawFigma(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.5) }
            case 1:
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawGlobe(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.5) }
            default:
                drawVooIcon(iconRect) { iconRect in VooIconFactory.drawImage(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.5) }
            }
            drawText(
                title,
                x: startX + 26,
                top: rect.minY + 17,
                width: titleWidth + 4,
                height: 16,
                font: font,
                color: Palette.textSecondary
            )
        }
    }

    private func drawContentHeader(count: Int, metrics m: Metrics) {
        let title: String
        switch activeTab {
        case .recents: title = "Recents"
        case .drafts: title = "Drafts"
        case .starred: title = "Starred"
        case .trash: title = "Trash"
        default: title = ""
        }
        let headerFont = ThemeFonts.mono(size: 11, weight: .bold)
        drawText(
            title,
            x: m.headerTitle.minX,
            top: m.headerTitle.minY,
            width: 120,
            height: 14,
            font: headerFont,
            color: Palette.textPrimary,
            tracking: 0.3
        )
        let badgeText = "\(count)"
        let badgeWidth = max(textWidth(badgeText, font: ThemeFonts.mono(size: 10)) + 16, 24)
        let badge = CGRect(x: m.headerTitle.minX + textWidth(title, font: headerFont) + 12,
                           y: m.headerBadge.minY,
                           width: badgeWidth,
                           height: 20)
        fillRounded(badge, radius: 6, color: Palette.prompt)
        drawText(
            badgeText,
            x: badge.minX,
            top: badge.minY + 4,
            width: badge.width,
            height: 14,
            font: ThemeFonts.mono(size: 10),
            color: Palette.textMuted,
            alignment: .center
        )

        // Sort chip (h28, 10pt horizontal padding, radius 12, 12/400, 13pt chevron).
        if activeTab == .trash && count > 0 {
            let emptyTrashRect = CGRect(x: m.sortChip.minX - 110, y: m.sortChip.minY, width: 100, height: 28)
            let isHovered = hoveredKey == "toolbar.emptyTrash"
            fillRounded(emptyTrashRect, radius: 12, color: isHovered ? NSColor(hex: "#3a1d1d") : NSColor(hex: "#261515"))
            strokeRounded(emptyTrashRect, radius: 12, color: NSColor(hex: "#ff4444").withAlphaComponent(0.3), lineWidth: 1)
            drawText(
                "Empty Trash",
                x: emptyTrashRect.minX,
                top: emptyTrashRect.minY + 7,
                width: emptyTrashRect.width,
                height: 14,
                font: ThemeFonts.mono(size: 11, weight: .medium),
                color: NSColor(hex: "#ff6b6b"),
                alignment: .center
            )
        }

        let sortHovered = hoveredKey == "sort"
        fillRounded(m.sortChip, radius: 12, color: sortHovered ? NSColor(hex: "#1a1a1a") : NSColor(hex: "#141414"))
        drawText(
            sortsByName ? "Name" : "Last modified",
            x: m.sortChip.minX + 10,
            top: m.sortChip.minY + 8,
            width: m.sortChip.width - 36,
            height: 16,
            font: ThemeFonts.mono(size: 12),
            color: Palette.textSecondary
        )
        drawVooIcon(CGRect(x: m.sortChip.maxX - 23, y: m.sortChip.minY + 8, width: 13, height: 13)) { iconRect in VooIconFactory.drawChevronDown(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.6) }

        // Grid / list toggle (21x21 targets, radius 8, 4pt gap).
        fillRounded(m.viewToggle, radius: 8, color: NSColor(hex: "#141414"))
        if usesGridView {
            fillRounded(m.gridToggle, radius: 8, color: Palette.activePill)
        } else if hoveredKey == "view.grid" {
            fillRounded(m.gridToggle, radius: 8, color: Palette.hover)
        }
        drawVooIcon(CGRect(x: m.gridToggle.midX - 6.5, y: m.gridToggle.midY - 6.5, width: 13, height: 13)) { iconRect in VooIconFactory.drawLayoutGrid(in: iconRect, color: usesGridView ? Palette.textBright : Palette.textMuted, strokeWidth: 1.5) }
        if !usesGridView {
            fillRounded(m.listToggle, radius: 8, color: Palette.activePill)
        } else if hoveredKey == "view.list" {
            fillRounded(m.listToggle, radius: 8, color: Palette.hover)
        }
        drawVooIcon(CGRect(x: m.listToggle.midX - 6.5, y: m.listToggle.midY - 6.5, width: 13, height: 13)) { iconRect in VooIconFactory.drawLayoutList(in: iconRect, color: !usesGridView ? Palette.textBright : Palette.textMuted, strokeWidth: 1.5) }
    }

    private func drawProjectCard(item: ProjectItem, rect: CGRect, index: Int) {
        let isHovered = hoveredKey == "project.\(index)"
        fillRounded(rect, radius: 16, color: isHovered ? NSColor(hex: "#141414") : Palette.card)
        strokeRounded(rect, radius: 16, color: isHovered ? Palette.borderHover : Palette.border, lineWidth: 1)

        let thumbnail = CGRect(x: rect.minX + 8, y: rect.minY + 8, width: rect.width - 16, height: 124)
        fillRounded(thumbnail, radius: 8, color: NSColor(hex: "#171717"))
        strokeRounded(thumbnail, radius: 8, color: NSColor(white: 1.0, alpha: 0.04), lineWidth: 1)
        drawThumbnailWireframe(kind: item.kind, rect: thumbnail)

        drawText(
            item.title,
            x: rect.minX + 12,
            top: rect.minY + 146,
            width: rect.width - 24,
            height: 16,
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: Palette.textPrimary
        )
        drawText(
            "\(item.dimensions) • \(item.category)",
            x: rect.minX + 12,
            top: rect.minY + 165,
            width: rect.width - 24,
            height: 14,
            font: ThemeFonts.mono(size: 10),
            color: Palette.textMuted
        )
    }

    private func drawProjectRow(item: ProjectItem, rect: CGRect, index: Int) {
        let isHovered = hoveredKey == "list.\(index)"
        fillRounded(rect, radius: 10, color: isHovered ? NSColor(hex: "#141414") : Palette.card)
        strokeRounded(rect, radius: 10, color: isHovered ? Palette.borderHover : Palette.border, lineWidth: 1)

        let thumbnail = CGRect(x: rect.minX + 12, y: rect.minY + 10, width: 44, height: 36)
        fillRounded(thumbnail, radius: 6, color: NSColor(hex: "#171717"))
        drawThumbnailWireframe(kind: item.kind, rect: thumbnail)
        drawText(
            item.title,
            x: rect.minX + 68,
            top: rect.minY + 10,
            width: max(rect.width - 68 - 160, 80),
            height: 16,
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: Palette.textPrimary
        )
        drawText(
            "\(item.dimensions) • \(item.category)",
            x: rect.minX + 68,
            top: rect.minY + 29,
            width: max(rect.width - 68 - 160, 80),
            height: 14,
            font: ThemeFonts.mono(size: 10),
            color: Palette.textMuted
        )
        let chipFont = ThemeFonts.mono(size: 10)
        let chipWidth = textWidth(item.dimensions, font: chipFont) + 16
        let chipRect = CGRect(x: rect.maxX - 12 - chipWidth, y: rect.minY + 18, width: chipWidth, height: 20)
        fillRounded(chipRect, radius: 6, color: Palette.chipRaised)
        drawText(
            item.dimensions,
            x: chipRect.minX,
            top: chipRect.minY + 4,
            width: chipRect.width,
            height: 14,
            font: chipFont,
            color: Palette.textTertiary,
            alignment: .center
        )
    }

    private func drawThumbnailWireframe(kind: ProjectKind, rect: CGRect) {
        let ctx = NSGraphicsContext.current?.cgContext
        ctx?.saveGState()
        ctx?.clip(to: rect)
        switch kind {
        case .web:
            let inset: CGFloat = 14
            let columnTop = rect.minY + inset
            let columnHeight = rect.height - inset * 2
            let availableWidth = rect.width - inset * 2
            let columnGap: CGFloat = 6
            let columnWidth = (availableWidth - columnGap * 2) / 3
            for column in 0..<3 {
                let columnRect = CGRect(
                    x: rect.minX + inset + CGFloat(column) * (columnWidth + columnGap),
                    y: columnTop,
                    width: columnWidth,
                    height: columnHeight
                )
                fillRounded(columnRect, radius: 3, color: NSColor(white: 1.0, alpha: 0.07))
            }
            fillRounded(
                CGRect(x: rect.minX + inset, y: rect.minY + inset - 6, width: 40, height: 3),
                radius: 1.5,
                color: NSColor(white: 1.0, alpha: 0.16)
            )
        case .mobile:
            let phoneWidth: CGFloat = min(rect.width * 0.26, 54)
            let phoneHeight = min(rect.height - 16, 96)
            let phone = CGRect(
                x: rect.midX - phoneWidth / 2,
                y: rect.midY - phoneHeight / 2,
                width: phoneWidth,
                height: phoneHeight
            )
            strokeRounded(phone, radius: 8, color: NSColor(white: 1.0, alpha: 0.18), lineWidth: 1.4)
            fillRounded(
                CGRect(x: phone.midX - 7, y: phone.minY + 6, width: 14, height: 3),
                radius: 1.5,
                color: NSColor(white: 1.0, alpha: 0.22)
            )
        }
        ctx?.restoreGState()
    }

    // MARK: File tabs (drafts / starred / trash)

    private func drawFileTab(ctx: CGContext, metrics m: Metrics) {
        let items = filteredProjects()
        drawContentHeader(count: items.count, metrics: m)

        if items.isEmpty {
            switch activeTab {
            case .drafts:
                drawEmptyState(
                    ctx: ctx,
                    rect: m.emptyBox,
                    icon: .draft,
                    title: "No drafts yet",
                    hint: "Unsaved canvases will be organized as local drafts here."
                )
            case .starred:
                drawEmptyState(
                    ctx: ctx,
                    rect: m.emptyBox,
                    icon: .star,
                    title: "No starred files yet",
                    hint: "Star files to keep them easily accessible here."
                )
            case .trash:
                drawEmptyState(
                    ctx: ctx,
                    rect: m.emptyBox,
                    icon: .trash,
                    title: "Trash is empty",
                    hint: "Deleted files will appear here and can be restored."
                )
            default:
                break
            }
            return
        }

        if usesGridView {
            for (index, item) in items.enumerated() where m.projectCards.indices.contains(index) {
                drawProjectCard(item: item, rect: m.projectCards[index], index: index)
            }
        } else {
            for (index, item) in items.enumerated() where m.projectListRows.indices.contains(index) {
                drawProjectRow(item: item, rect: m.projectListRows[index], index: index)
            }
        }
    }

    // MARK: - Context Menu for Project Items

    public func showContextMenu(for index: Int, event: NSEvent) {
        let items = filteredProjects()
        guard items.indices.contains(index) else { return }
        let item = items[index]
        let menu = NSMenu(title: "Project Actions")

        if item.realFile?.trashed ?? false {
            let restoreItem = NSMenuItem(title: "Restore to Original Location", action: #selector(contextMenuRestore(_:)), keyEquivalent: "")
            restoreItem.target = self
            restoreItem.representedObject = item
            menu.addItem(restoreItem)

            let deleteItem = NSMenuItem(title: "Delete Permanently", action: #selector(contextMenuDeletePermanently(_:)), keyEquivalent: "")
            deleteItem.target = self
            deleteItem.representedObject = item
            menu.addItem(deleteItem)
            NSMenu.popUpContextMenu(menu, with: event, for: self)
            return
        }

        let openItem = NSMenuItem(title: "Open", action: #selector(contextMenuOpen(_:)), keyEquivalent: "")
        openItem.target = self
        openItem.representedObject = item
        menu.addItem(openItem)

        let revealItem = NSMenuItem(title: "Reveal in Finder", action: #selector(contextMenuReveal(_:)), keyEquivalent: "")
        revealItem.target = self
        revealItem.representedObject = item
        menu.addItem(revealItem)

        menu.addItem(NSMenuItem.separator())

        let dupItem = NSMenuItem(title: "Duplicate", action: #selector(contextMenuDuplicate(_:)), keyEquivalent: "")
        dupItem.target = self
        dupItem.representedObject = item
        menu.addItem(dupItem)

        let renameItem = NSMenuItem(title: "Rename...", action: #selector(contextMenuRename(_:)), keyEquivalent: "")
        renameItem.target = self
        renameItem.representedObject = item
        menu.addItem(renameItem)

        let folders = WorkspaceManager.shared.listFolders()
        let moveMenu = NSMenu(title: "Move to Folder")
        let rootItem = NSMenuItem(title: "Workspace Root", action: #selector(contextMenuMoveToFolder(_:)), keyEquivalent: "")
        rootItem.target = self
        rootItem.representedObject = (item, "")
        moveMenu.addItem(rootItem)

        for folder in folders {
            let folderItem = NSMenuItem(title: folder, action: #selector(contextMenuMoveToFolder(_:)), keyEquivalent: "")
            folderItem.target = self
            folderItem.representedObject = (item, folder)
            moveMenu.addItem(folderItem)
        }
        let moveMenuItem = NSMenuItem(title: "Move to Folder", action: nil, keyEquivalent: "")
        moveMenuItem.submenu = moveMenu
        menu.addItem(moveMenuItem)

        menu.addItem(NSMenuItem.separator())

        let isStarred = item.realFile?.starred ?? false
        let starItem = NSMenuItem(title: isStarred ? "Unstar" : "Star", action: #selector(contextMenuToggleStar(_:)), keyEquivalent: "")
        starItem.target = self
        starItem.representedObject = item
        menu.addItem(starItem)

        menu.addItem(NSMenuItem.separator())

        let trashItem = NSMenuItem(title: "Move to Trash", action: #selector(contextMenuTrash(_:)), keyEquivalent: "")
        trashItem.target = self
        trashItem.representedObject = item
        menu.addItem(trashItem)

        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }

    @objc private func contextMenuOpen(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem else { return }
        onOpenEditor?(item.openName)
    }

    @objc private func contextMenuReveal(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem, let path = item.realFile?.path else { return }
        onFileAction?(.revealInFinder, path)
    }

    @objc private func contextMenuDuplicate(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem, let path = item.realFile?.path else { return }
        onFileAction?(.duplicate, path)
    }

    @objc private func contextMenuRename(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem, let path = item.realFile?.path else { return }
        let alert = NSAlert()
        alert.messageText = "Rename File"
        alert.informativeText = "Enter a new name for \(item.title):"
        alert.addButton(withTitle: "Rename")
        alert.addButton(withTitle: "Cancel")
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 220, height: 24))
        input.stringValue = item.title
        alert.accessoryView = input
        if alert.runModal() == .alertFirstButtonReturn {
            let newName = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if !newName.isEmpty && newName != item.title {
                onFileAction?(.rename(newName), path)
            }
        }
    }

    @objc private func contextMenuMoveToFolder(_ sender: NSMenuItem) {
        guard let pair = sender.representedObject as? (ProjectItem, String),
              let path = pair.0.realFile?.path else { return }
        let folderName = pair.1.isEmpty ? nil : pair.1
        onFileAction?(.moveToFolder(folderName), path)
    }

    @objc private func contextMenuToggleStar(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem, let path = item.realFile?.path else { return }
        onFileAction?(.toggleStar, path)
    }

    @objc private func contextMenuTrash(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem, let path = item.realFile?.path else { return }
        onFileAction?(.moveToTrash, path)
    }

    @objc private func contextMenuRestore(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem, let path = item.realFile?.path else { return }
        onFileAction?(.restoreFromTrash, path)
    }

    @objc private func contextMenuDeletePermanently(_ sender: NSMenuItem) {
        guard let item = sender.representedObject as? ProjectItem, let path = item.realFile?.path else { return }
        onFileAction?(.deletePermanently, path)
    }

    private enum EmptyIcon { case search, star, trash, draft }

    private func drawEmptyState(ctx: CGContext, rect: CGRect, icon: EmptyIcon, title: String, hint: String) {
        guard rect.width > 10 && rect.height > 10 else { return }
        // Web empty state: rounded-3xl (24) bg-neutral-900/20, 28px muted icon.
        fillRounded(rect, radius: 24, color: Palette.emptyBox)
        strokeRounded(rect, radius: 24, color: NSColor(white: 1.0, alpha: 0.035), lineWidth: 1)

        let iconRect = CGRect(x: rect.midX - 14, y: rect.midY - 41, width: 28, height: 28)
        switch icon {
        case .search:
            drawVooIcon(iconRect) { iconRect in VooIconFactory.drawSearch(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.5) }
        case .star:
            drawVooIcon(iconRect) { iconRect in VooIconFactory.drawStar(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.5) }
        case .trash:
            drawVooIcon(iconRect) { iconRect in VooIconFactory.drawTrash(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.5) }
        case .draft:
            drawVooIcon(iconRect) { iconRect in VooIconFactory.drawFileText(in: iconRect, color: Palette.textTertiary, strokeWidth: 1.5) }
        }

        drawText(
            title,
            x: rect.minX,
            top: rect.midY + 6,
            width: rect.width,
            height: 18,
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: Palette.textPrimary,
            alignment: .center
        )
        drawText(
            hint,
            x: rect.minX + 24,
            top: rect.midY + 27,
            width: rect.width - 48,
            height: 16,
            font: ThemeFonts.mono(size: 11),
            color: Palette.textMuted,
            alignment: .center
        )
    }

    // MARK: Design systems tab

    private func drawDesignSystems(ctx: CGContext, metrics m: Metrics) {
        for (index, template) in Self.templates.enumerated() where m.templateCards.indices.contains(index) {
            let rect = m.templateCards[index]
            let isHovered = hoveredKey == "template.\(index)"
            fillRounded(rect, radius: 12, color: isHovered ? NSColor(hex: "#141414") : Palette.card)
            strokeRounded(rect, radius: 12, color: isHovered ? Palette.borderHover : NSColor(white: 1.0, alpha: 0.035), lineWidth: 1)

            drawText(
                template.title,
                x: rect.minX + 20,
                top: rect.minY + 24,
                width: max(rect.width - 40 - 90, 40),
                height: 16,
                font: ThemeFonts.mono(size: 12, weight: .semibold),
                color: Palette.textPrimary
            )

            let chipFont = ThemeFonts.mono(size: 10)
            let chipWidth = textWidth(template.dimensions, font: chipFont) + 16
            let chipRect = CGRect(x: rect.maxX - 20 - chipWidth, y: rect.minY + 20, width: chipWidth, height: 20)
            fillRounded(chipRect, radius: 6, color: Palette.chipRaised)
            drawText(
                template.dimensions,
                x: chipRect.minX,
                top: chipRect.minY + 4,
                width: chipRect.width,
                height: 14,
                font: chipFont,
                color: Palette.textTertiary,
                alignment: .center
            )

            drawText(
                "Standard canvas with an adaptive layout grid and responsive artboards.",
                x: rect.minX + 20,
                top: rect.minY + 53,
                width: max(rect.width - 40, 40),
                height: 52,
                font: ThemeFonts.mono(size: 12),
                color: Palette.textTertiary,
                lineBreak: .byWordWrapping,
                lineHeight: 16
            )
        }
    }

    // MARK: Shortcuts tab

    private func drawShortcuts(ctx: CGContext, metrics m: Metrics) {
        let card = m.shortcutsCard
        fillRounded(card, radius: 16, color: Palette.emptyBox)
        strokeRounded(card, radius: 16, color: NSColor(white: 1.0, alpha: 0.035), lineWidth: 1)

        let titleFont = ThemeFonts.mono(size: 12, weight: .semibold)
        let suffixFont = ThemeFonts.mono(size: 12)
        let titleRect = CGRect(x: card.minX + 24, y: card.minY + 25, width: card.width - 48, height: 16)
        let titleAttributed = NSMutableAttributedString(
            string: "Common shortcuts",
            attributes: [.font: titleFont, .foregroundColor: Palette.textPrimary]
        )
        titleAttributed.append(NSAttributedString(
            string: " (Photoshop / Figma habits)",
            attributes: [.font: suffixFont, .foregroundColor: Palette.textMuted]
        ))
        titleAttributed.draw(in: titleRect)

        let labelFont = ThemeFonts.mono(size: 12)
        let keyFont = NSFont(name: "Menlo", size: 12) ?? ThemeFonts.mono(size: 12)
        for (index, shortcut) in Self.shortcuts.enumerated() where m.shortcutsRows.indices.contains(index) {
            let row = m.shortcutsRows[index]
            fillRounded(row, radius: 10, color: Palette.row)

            let keyWidth = textWidth(shortcut.keys, font: keyFont) + 16
            let chipRect = CGRect(x: row.maxX - 10 - keyWidth, y: row.minY + 10, width: keyWidth, height: 20)
            fillRounded(chipRect, radius: 6, color: Palette.chipRaised)

            drawText(
                shortcut.name,
                x: row.minX + 12,
                top: row.minY + 12,
                width: max(row.width - 24 - keyWidth - 12, 40),
                height: 16,
                font: labelFont,
                color: Palette.textTertiary
            )
            drawText(
                shortcut.keys,
                x: chipRect.minX,
                top: chipRect.minY + 4,
                width: chipRect.width,
                height: 14,
                font: keyFont,
                color: Palette.textTertiary,
                alignment: .center
            )
        }

        // About the .voo project format.
        let about = m.aboutCard
        fillRounded(about, radius: 12, color: Palette.emptyBox)
        strokeRounded(about, radius: 12, color: NSColor(white: 1.0, alpha: 0.035), lineWidth: 1)
        drawText(
            "About the .voo project format",
            x: about.minX + 24,
            top: about.minY + 24,
            width: about.width - 48,
            height: 16,
            font: ThemeFonts.mono(size: 12, weight: .semibold),
            color: Palette.textPrimary
        )
        drawText(
            Self.aboutProjectFormat,
            x: about.minX + 24,
            top: about.minY + 48,
            width: about.width - 48,
            height: max(about.height - 68, 16),
            font: ThemeFonts.mono(size: 12),
            color: Palette.textMuted,
            lineBreak: .byWordWrapping,
            lineHeight: 16
        )
    }

    // MARK: - Drawing Primitives

    private func fillRounded(_ rect: CGRect, radius: CGFloat, color: NSColor) {
        guard rect.width > 0 && rect.height > 0 else { return }
        let path = roundedPath(rect, radius: radius)
        color.setFill()
        path.fill()
    }

    private func strokeRounded(_ rect: CGRect, radius: CGFloat, color: NSColor, lineWidth: CGFloat) {
        guard rect.width > 0 && rect.height > 0 else { return }
        let path = roundedPath(rect, radius: radius)
        color.setStroke()
        path.lineWidth = lineWidth
        path.stroke()
    }

    private func roundedPath(_ rect: CGRect, radius: CGFloat) -> NSBezierPath {
        let clampedRadius = min(radius, min(rect.width, rect.height) / 2)
        return NSBezierPath(roundedRect: rect, xRadius: clampedRadius, yRadius: clampedRadius)
    }

    @discardableResult
    private func drawText(
        _ text: String,
        x: CGFloat,
        top: CGFloat,
        width: CGFloat,
        height: CGFloat = 16,
        font: NSFont,
        color: NSColor,
        alignment: NSTextAlignment = .left,
        lineBreak: NSLineBreakMode = .byTruncatingTail,
        lineHeight: CGFloat? = nil,
        tracking: CGFloat = 0
    ) -> CGRect {
        guard width > 0 else { return .zero }
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = alignment
        paragraph.lineBreakMode = lineBreak
        if let lineHeight = lineHeight {
            paragraph.minimumLineHeight = lineHeight
            paragraph.maximumLineHeight = lineHeight
        }
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: paragraph
        ]
        if tracking != 0 {
            attributes[.kern] = tracking
        }
        let rect = CGRect(x: x, y: top, width: width, height: height)
        (text as NSString).draw(in: rect, withAttributes: attributes)
        return rect
    }

    private func textWidth(_ text: String, font: NSFont, tracking: CGFloat = 0) -> CGFloat {
        var attributes: [NSAttributedString.Key: Any] = [.font: font]
        if tracking != 0 {
            attributes[.kern] = tracking
        }
        return ceil((text as NSString).size(withAttributes: attributes).width)
    }

    /// Draws a vector icon into `rect`. VooIconFactory reads the current graphics context's
    /// flipped state itself, so this flipped view needs no extra transform; flipping the CTM
    /// here as well mirrored every icon vertically.
    private func drawVooIcon(_ rect: CGRect, _ body: (CGRect) -> Void) {
        guard rect.width > 0 && rect.height > 0 else { return }
        body(rect)
    }

    private func measuredTextHeight(_ text: String, font: NSFont, width: CGFloat, lineHeight: CGFloat) -> CGFloat {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byWordWrapping
        paragraph.minimumLineHeight = lineHeight
        paragraph.maximumLineHeight = lineHeight
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .paragraphStyle: paragraph]
        let bounding = (text as NSString).boundingRect(
            with: CGSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: attributes
        )
        return ceil(bounding.height)
    }

    // MARK: - Private Icon Helpers



    // MARK: - NSTextFieldDelegate

    public func controlTextDidBeginEditing(_ obj: Notification) {
        guard let editor = obj.userInfo?["NSFieldEditor"] as? NSTextView else { return }
        editor.drawsBackground = false
        editor.backgroundColor = .clear
        editor.insertionPointColor = Palette.textPrimary
        editor.selectedTextAttributes = [
            .backgroundColor: Palette.chipRaised,
            .foregroundColor: Palette.textBright
        ]
    }

    public func controlTextDidChange(_ obj: Notification) {
        guard let field = obj.object as? NSTextField else { return }
        if field === searchField {
            searchQuery = currentText(of: searchField)
            if !searchQuery.isEmpty && activeTab != .recents {
                activeTab = .recents
            }
            rebuildMetrics()
            needsDisplay = true
        } else if field === promptField {
            needsDisplay = true
        }
    }

    public func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        if control === searchField {
            if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
                searchField.stringValue = ""
                searchField.currentEditor()?.string = ""
                searchQuery = ""
                rebuildMetrics()
                needsDisplay = true
                return true
            }
            if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                let items = filteredProjects()
                if let first = items.first {
                    onOpenEditor?(first.openName)
                }
                return true
            }
        } else if control === promptField {
            if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                submitPrompt()
                return true
            }
            if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
                window?.makeFirstResponder(nil)
                return true
            }
        }
        return false
    }
}
