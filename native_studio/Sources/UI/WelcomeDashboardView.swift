//
//  WelcomeDashboardView.swift
//  native_studio
//
//  Mac native 1:1 replica of the current VOO Design Welcome Dashboard (工作台).
//  Pure AppKit + CoreGraphics custom drawing (no SwiftUI).
//  Reference: docs/refs/web_20261031/web_dashboard.png (live web build, 1440x900) and
//             src/canvas/components/welcome_dashboard/*.jsx.
//  Geometry: the web app inscribes the dashboard panel at window (6,46). Every metric
//  below is expressed in that panel-local space, i.e. webWindow - (6,46); the sidebar
//  column additionally starts 2pt inside the editor shell's stroke. Bottom-anchored
//  chrome (Settings) is measured from the window bottom like the web's `bottom-3`.
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
    /// Hook for the workspace "Change" affordances (kept for API compatibility; the
    /// current web dashboard exposes workspace switching through the Settings drawer).
    public var onChangeWorkspace: (() -> Void)?
    /// Hook for the toolbar "Rescan" chip (kept for API compatibility).
    public var onRescan: (() -> Void)?
    /// Opens the settings drawer (web dashboard: sidebar "Settings" button and the
    /// composer's "Configure provider" action).
    public var onOpenSettings: (() -> Void)?
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
        static let importCardHover = NSColor(hex: "#262626")
        static let searchField = NSColor(hex: "#121212")
        static let chip = NSColor(hex: "#212121")
        static let activeRow = NSColor(hex: "#222222")
        static let activePill = NSColor(hex: "#262626")
        static let chipRaised = NSColor(hex: "#262626")
        static let control = NSColor(hex: "#141414")
        static let controlHover = NSColor(hex: "#1c1c1c")
        static let badge = NSColor(hex: "#171717")
        static let sendButton = NSColor(hex: "#323232")
        static let hover = NSColor(white: 1.0, alpha: 0.05)
        static let hoverSoft = NSColor(white: 1.0, alpha: 0.035)
        static let iconHover = NSColor(white: 1.0, alpha: 0.08)
        static let divider = NSColor(white: 1.0, alpha: 0.10)
        static let border = NSColor(white: 1.0, alpha: 0.06)
        static let borderStrong = NSColor(white: 1.0, alpha: 0.10)
        static let borderHover = NSColor(white: 1.0, alpha: 0.18)
        static let pillBorder = NSColor(white: 1.0, alpha: 0.10)
        static let pillBorderActive = NSColor(white: 1.0, alpha: 0.50)
        static let pillFillActive = NSColor(white: 1.0, alpha: 0.10)
        static let textBright = NSColor(hex: "#ffffff")
        static let textPrimary = NSColor(hex: "#f5f5f5")
        static let textSecondary = NSColor(hex: "#e5e5e5")
        static let textTertiary = NSColor(hex: "#d4d4d4")
        static let textMuted = NSColor(hex: "#a3a3a3")
        static let textFaint = NSColor(hex: "#737373")
        static let sendArrowDisabled = NSColor(white: 0.47, alpha: 1.0)
        // First-run design-type tiles: sampled from the live build's wireframe previews.
        static let tileHover = NSColor(white: 1.0, alpha: 0.05)
        static let previewCanvas = NSColor(hex: "#262626")
        static let previewBar = NSColor(hex: "#5c5c5c")
        static let previewBlock = NSColor(hex: "#4d4d4d")
        static let previewBlockAlt = NSColor(hex: "#525252")
        static let previewMid = NSColor(hex: "#737373")
        static let previewDim = NSColor(hex: "#404040")
        static let previewLight = NSColor(hex: "#d4d4d4")
        static let previewBright = NSColor(hex: "#adadad")
        static let previewLine = NSColor(hex: "#6b6b6b")
        static let previewMuted = NSColor(hex: "#7d7d7d")
        static let previewScreen = NSColor(hex: "#171717")
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
            // Web label for `welcome.nav.designSystems` is "Community Templates".
            case .designSystems: return "Community Templates"
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

    /// Web `AI_GEN_TYPES` order (welcome_constants.js): the design-type selectors are
    /// generation presets, not file filters. First run renders them as the large
    /// wireframe tiles; once a type is picked the row collapses to the compact pills.
    private static let presets: [String] = [
        "Landing page", "Mobile app", "Web app", "Poster",
        "Slides", "Storyboard", "Dashboard", "Something else..."
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
    /// Currently highlighted generation preset (mirrors web `activePill`, default "landing").
    private var activePreset: String = "Landing page"
    /// `nil` => first-run state (large type tiles). Once the user picks a type the
    /// row collapses to the compact pills for the rest of the session (web parity).
    private var selectedDesignKind: String?
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
    private var presetTargets: [String: HitTarget] = [:]
    private var importTargets: [HitTarget] = []
    private var projectTargets: [HitTarget] = []
    private var listTargets: [HitTarget] = []
    private var templateTargets: [HitTarget] = []
    private var promptCardTarget: HitTarget?
    private var promptPlusTarget: HitTarget?
    private var promptConfigureTarget: HitTarget?
    private var promptSendTarget: HitTarget?
    private var projectsAddTarget: HitTarget?
    private var settingsTarget: HitTarget?
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
        var navRows: [CGRect] = []
        var divider1 = CGRect.zero
        var projectsHeader = CGRect.zero
        var projectsAdd = CGRect.zero
        var divider2 = CGRect.zero
        var templatesHeader = CGRect.zero
        var templateRows: [CGRect] = []
        var settingsButton = CGRect.zero
        var heading = CGRect.zero
        var presetPills: [CGRect] = []
        var designTiles: [CGRect] = []
        var showsTiles = false
        var promptCard = CGRect.zero
        var promptFieldRect = CGRect.zero
        var promptPlus = CGRect.zero
        var promptCandidates = CGRect.zero
        var promptConfigure = CGRect.zero
        var promptSend = CGRect.zero
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
        searchField.font = ThemeFonts.system(size: 12)
        searchField.textColor = Palette.textSecondary
        searchField.placeholderAttributedString = NSAttributedString(
            string: "Search files, drafts...",
            attributes: [
                .font: ThemeFonts.system(size: 12),
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
        // Web composer textarea: `text-[15px] leading-relaxed` in the UI sans face.
        promptField.font = ThemeFonts.system(size: 15)
        promptField.textColor = Palette.textPrimary
        promptField.placeholderAttributedString = NSAttributedString(
            string: "Design anything...",
            attributes: [
                .font: ThemeFonts.system(size: 15),
                .foregroundColor: Palette.textMuted
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
        // Legacy hooks: the current web dashboard has no workspace "Change"/"Rescan"
        // control (workspace switching moved into the Settings drawer) and the file
        // import/new actions live in the window title bar. The identifiers and
        // callbacks stay reachable for the E2E suite as zero-frame accessibility
        // hooks, so no phantom click area is introduced over the new layout.
        searchTargets["change"] = makeTarget(
            key: "sidebar.change",
            label: "Change workspace",
            accessibilityID: "Dashboard.Sidebar.WorkspaceChange"
        ) { [weak self] in self?.onChangeWorkspace?() }
        searchTargets["rescan"] = makeTarget(
            key: "sidebar.rescan",
            label: "Rescan workspace",
            accessibilityID: "Dashboard.Sidebar.Rescan"
        ) { [weak self] in self?.onRescan?() }
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

        // Sidebar: "PROJECTS" add-folder button and the floating "Settings" button.
        projectsAddTarget = makeTarget(
            key: "sidebar.projectsAdd",
            label: "New project folder",
            accessibilityID: "Dashboard.Sidebar.ProjectsAdd"
        ) { [weak self] in self?.onCreateFolder?() }
        settingsTarget = makeTarget(
            key: "sidebar.settings",
            label: "Settings",
            accessibilityID: "Dashboard.Sidebar.Settings"
        ) { [weak self] in self?.onOpenSettings?() }

        // Generation-type preset pills (web `WelcomePromptTypes`, no "All" pill).
        for preset in Self.presets {
            let target = makeTarget(
                key: "preset.\(preset)",
                label: "Design \(preset)",
                accessibilityID: "Dashboard.Filter.\(preset.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: ".", with: ""))"
            ) { [weak self] in self?.selectDesignKind(preset) }
            presetTargets[preset] = target
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
        // Web composer shows the model trigger as a "Configure provider" text button
        // when no agent is configured; it routes to the settings drawer.
        promptConfigureTarget = makeTarget(
            key: "prompt.configure",
            label: "Configure provider",
            accessibilityID: "Dashboard.Prompt.Configure"
        ) { [weak self] in self?.onOpenSettings?() }
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

    /// Picks a design type: highlights it and collapses the first-run tile row to the
    /// compact pill row for the rest of the session (web parity).
    private func selectDesignKind(_ kind: String) {
        activePreset = kind
        selectedDesignKind = kind
        rebuildMetrics()
        needsDisplay = true
    }

    /// Tile label: 11pt medium for every type; the highlighted one is painted white
    /// (measured: "Landing page" is 72px wide in both states, so the size does not grow).
    private static let typeTileLabelFont = ThemeFonts.system(size: 11, weight: .medium)

    /// Wireframe preview box for a design type (web `TypePreview` intrinsic sizes).
    private static func previewSize(for kind: String) -> CGSize {
        switch kind {
        case "Mobile app": return CGSize(width: 18, height: 32)
        case "Poster": return CGSize(width: 24, height: 32)
        default: return CGSize(width: 48, height: 28)
        }
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
        // The web panel is inscribed 6pt inside the window with a 1px border; the
        // native dashboard sits inside the editor shell's 2pt border. A 2pt inset
        // keeps every child clear of the shell stroke while matching the web's
        // panel-local layout (native = webWindow - (4,44)).
        let shellInset: CGFloat = 2
        let sidebarWidth: CGFloat = 240
        let mainStartX = shellInset + sidebarWidth
        let mainWidth = max(width - mainStartX - shellInset, 0)
        let contentMaxWidth: CGFloat = 1088
        let contentWidth = min(contentMaxWidth, max(mainWidth - 64, 0))
        let contentX = mainStartX + max((mainWidth - contentWidth) / 2, 0)
        let contentRight = contentX + contentWidth
        let mainCenterX = mainStartX + mainWidth / 2

        // Sidebar chrome: web x6 y46 w240, pt-3/pb-3 px-2 (12 / 8 padding).
        m.sidebar = CGRect(x: shellInset, y: shellInset, width: sidebarWidth, height: max(height - shellInset * 2, 0))
        m.main = CGRect(x: mainStartX, y: 0, width: mainWidth, height: height)
        let sideX = m.sidebar.minX
        let sideY = m.sidebar.minY
        let sideRowX = sideX + 8
        let sideRowWidth: CGFloat = 224
        m.searchRect = CGRect(x: sideRowX, y: sideY + 12, width: sideRowWidth, height: 32)
        // nav rows: y106/136/166/196 in the web window, h28, 2pt gap.
        m.navRows = (0..<4).map { index in
            CGRect(x: sideRowX, y: sideY + 60 + CGFloat(index) * 30, width: sideRowWidth, height: 28)
        }
        m.divider1 = CGRect(x: sideX + 18, y: sideY + 194, width: sidebarWidth - 36, height: 1)
        // PROJECTS header row (pt-2 pb-1): 11pt uppercase + 16pt "+" button right.
        m.projectsHeader = CGRect(x: sideRowX, y: sideY + 213, width: sideRowWidth, height: 28)
        m.projectsAdd = CGRect(
            x: m.projectsHeader.maxX - 22,
            y: m.projectsHeader.minY + 6,
            width: 16,
            height: 16
        )
        m.divider2 = CGRect(x: sideX + 18, y: sideY + 256, width: sidebarWidth - 36, height: 1)
        m.templatesHeader = CGRect(x: sideRowX, y: sideY + 275, width: sideRowWidth, height: 28)
        m.templateRows = (0..<2).map { index in
            CGRect(x: sideRowX, y: sideY + 303 + CGFloat(index) * 30, width: sideRowWidth, height: 28)
        }
        // Web `fixed bottom-3 left-6`: 48pt tall floating button, 12pt above the
        // window bottom (x24 window => x20 here).
        let settingsFont = ThemeFonts.system(size: 12, weight: .medium)
        let settingsWidth = 12 + 14 + 8 + textWidth("Settings", font: settingsFont) + 12
        m.settingsButton = CGRect(
            x: 20,
            y: max(height - 12 - 48, sideY),
            width: settingsWidth,
            height: 48
        )

        // Heading: web `text-[15px] font-medium`, centred (glyph bbox y83..97).
        m.heading = CGRect(x: contentX, y: 34, width: contentWidth, height: 22)

        // Web first run shows the design types as large wireframe tiles (h64 for the
        // 48x28 previews, h68 for the 32pt-tall mobile/poster previews); once a kind is
        // picked the row collapses to compact h32 pills and every block below moves up
        // by 36pt (measured composer rim 217 → 181 in the live build).
        let showsTypeTiles = activeTab == .recents && selectedDesignKind == nil
        m.showsTiles = showsTypeTiles
        m.designTiles = []
        m.presetPills = []
        var typeRowShift: CGFloat = 0
        if showsTypeTiles {
            typeRowShift = 36
            // Tile content is centred on this row axis (measured window y167).
            let tileRowCenterY: CGFloat = 121
            func tileLayout(_ sidePadding: CGFloat, _ minWidth: CGFloat, _ gap: CGFloat) -> ([CGFloat], CGFloat) {
                let widths = Self.presets.map {
                    max(minWidth, textWidth($0, font: Self.typeTileLabelFont) + sidePadding * 2)
                }
                let total = widths.reduce(0, +) + gap * CGFloat(max(Self.presets.count - 1, 0))
                return (widths, total)
            }
            // Web markup is `flex flex-wrap gap-1.5 px-2.5` with `min-w-[4.75rem]`;
            // narrow windows tighten the gutters (single row, like the compact pills).
            let availableTileWidth = max(m.main.width - 32, 200)
            var (tileWidths, totalTiles) = tileLayout(10, 76, 8)
            var tileGap: CGFloat = 8
            if totalTiles > availableTileWidth {
                (tileWidths, totalTiles) = tileLayout(8, 68, 4)
                tileGap = 4
            }
            if totalTiles > availableTileWidth {
                (tileWidths, totalTiles) = tileLayout(5, 58, 2)
                tileGap = 2
            }
            var tileX = mainCenterX - totalTiles / 2
            for (index, kind) in Self.presets.enumerated() {
                let tileHeight = Self.previewSize(for: kind).height + 36
                m.designTiles.append(CGRect(
                    x: tileX,
                    y: tileRowCenterY - tileHeight / 2,
                    width: tileWidths[index],
                    height: tileHeight
                ))
                tileX += tileWidths[index] + tileGap
            }
        } else {
            // Compact pills: h32, gap 8, centred on the main column.
            let pillFont = ThemeFonts.system(size: 12, weight: .medium)
            func presetPillWidths(_ sidePadding: CGFloat) -> [CGFloat] {
                // px-3.5 + icon 14 + gap-1.5 + label + px-3.5
                Self.presets.map { sidePadding + 14 + 6 + textWidth($0, font: pillFont) + sidePadding }
            }
            let pillGap: CGFloat = 8
            var pillWidths = presetPillWidths(14)
            let naturalPillTotal = pillWidths.reduce(0, +) + pillGap * CGFloat(max(Self.presets.count - 1, 0))
            if naturalPillTotal > max(m.main.width - 40, 120) {
                // Narrow window: tighten the horizontal padding like the web's flex-wrap
                // layout would (one row, smaller gutters).
                pillWidths = presetPillWidths(8)
            }
            let totalPills = pillWidths.reduce(0, +) + pillGap * CGFloat(max(Self.presets.count - 1, 0))
            var pillX = mainCenterX - totalPills / 2
            for pillWidth in pillWidths {
                m.presetPills.append(CGRect(x: pillX, y: 86, width: pillWidth, height: 32))
                pillX += pillWidth + pillGap
            }
        }

        // Composer: web `max-w-3xl` (768) incl. the 1px rim; measured card 766x141,
        // radius rounded-2xl (16), px-4 pt-4, bottom row px-3 py-2. Clamped to the
        // main column so narrow windows never overlap the sidebar.
        let promptCardWidth = min(766, max(m.main.width - 48, 260))
        m.promptCard = CGRect(
            x: mainCenterX - promptCardWidth / 2,
            y: 136 + typeRowShift,
            width: promptCardWidth,
            height: 141
        )
        m.promptFieldRect = CGRect(
            x: m.promptCard.minX + 16,
            y: m.promptCard.minY + 19,
            width: m.promptCard.width - 32,
            height: 28
        )
        let promptBottomRowY = m.promptCard.maxY - 36
        m.promptPlus = CGRect(x: m.promptCard.minX + 12, y: promptBottomRowY, width: 28, height: 28)
        m.promptSend = CGRect(x: m.promptCard.maxX - 12 - 28, y: promptBottomRowY, width: 28, height: 28)
        let configureFont = ThemeFonts.system(size: 12)
        let configureWidth = textWidth("Configure provider", font: configureFont)
        m.promptConfigure = CGRect(
            x: m.promptSend.minX - 8 - configureWidth,
            y: promptBottomRowY,
            width: configureWidth,
            height: 28
        )
        // Variants chip: px-2 + icon 13 + gap 4 + "1x" (12 mono) + px-2, h24.
        let candidatesWidth = 8 + 13 + 4 + textWidth("1x", font: ThemeFonts.mono(size: 12)) + 8
        m.promptCandidates = CGRect(
            x: m.promptConfigure.minX - 8 - candidatesWidth,
            y: promptBottomRowY + 2,
            width: candidatesWidth,
            height: 24
        )

        // Import cards: 3 columns of the content width, h48, gap 12.
        let importGap: CGFloat = 12
        let importWidth = max((contentWidth - importGap * 2) / 3, 0)
        m.importCards = (0..<3).map { index in
            CGRect(
                x: contentX + CGFloat(index) * (importWidth + importGap),
                y: 310 + typeRowShift,
                width: importWidth,
                height: 48
            )
        }

        // Results header (Recents count + sort chip + grid/list toggle).
        let headerTop: CGFloat = activeTab == .recents ? 398 + typeRowShift : 88
        m.headerTitle = CGRect(x: contentX, y: headerTop + 6, width: 200, height: 16)
        m.headerBadge = CGRect(x: contentX + 60, y: headerTop + 2, width: 25, height: 22)
        m.viewToggle = CGRect(x: contentRight - 46, y: headerTop, width: 46, height: 28)
        m.sortChip = CGRect(x: m.viewToggle.minX - 10 - 115, y: headerTop, width: 115, height: 28)
        m.gridToggle = CGRect(x: m.viewToggle.minX + 2, y: headerTop + 4, width: 21, height: 21)
        m.listToggle = CGRect(x: m.viewToggle.minX + 23, y: headerTop + 4, width: 21, height: 21)

        // Project cards layout (grid + list variants).
        let cardsTop: CGFloat = activeTab == .recents ? 442 + typeRowShift : 138
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
        m.emptyBox = CGRect(x: contentX, y: 138, width: contentWidth, height: 205)
        m.recentsEmptyBox = CGRect(x: contentX, y: 442 + typeRowShift, width: contentWidth, height: 205)

        // Template grid.
        let gridTop: CGFloat = 88
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
                y: gridTop + CGFloat(row) * (156 + templateGap),
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

        // Web search input is h-8 pl-8 pr-7: the NSTextField fills the pill interior.
        searchField.frame = CGRect(
            x: m.searchRect.minX + 32,
            y: m.searchRect.minY + 8,
            width: max(m.searchRect.width - 32 - 24, 10),
            height: m.searchRect.height - 8
        )
        promptField.frame = m.promptFieldRect
        promptField.isHidden = activeTab != .recents

        // Sidebar.
        setFrame(navTargets[.recents], m.navRows.count > 0 ? m.navRows[0] : .zero)
        setFrame(navTargets[.drafts], m.navRows.count > 1 ? m.navRows[1] : .zero)
        setFrame(navTargets[.starred], m.navRows.count > 2 ? m.navRows[2] : .zero)
        setFrame(navTargets[.trash], m.navRows.count > 3 ? m.navRows[3] : .zero)
        setFrame(navTargets[.designSystems], m.templateRows.count > 0 ? m.templateRows[0] : .zero)
        setFrame(navTargets[.shortcuts], m.templateRows.count > 1 ? m.templateRows[1] : .zero)
        setFrame(projectsAddTarget, m.projectsAdd.insetBy(dx: -6, dy: -6))
        setFrame(settingsTarget, m.settingsButton)
        // No visible workspace / rescan / open / new control remains in the dashboard
        // column (web moved them to the title bar & Settings drawer); keep the legacy
        // hooks hidden so they never intercept clicks.
        searchTargets["change"]?.frame = .zero
        searchTargets["change"]?.isHidden = true
        searchTargets["rescan"]?.frame = .zero
        searchTargets["rescan"]?.isHidden = true
        searchTargets["toolbar.change"]?.frame = .zero
        searchTargets["toolbar.change"]?.isHidden = true
        searchTargets["toolbar.rescan"]?.frame = .zero
        searchTargets["toolbar.rescan"]?.isHidden = true
        searchTargets["toolbar.open"]?.frame = .zero
        searchTargets["toolbar.open"]?.isHidden = true
        searchTargets["toolbar.new"]?.frame = .zero
        searchTargets["toolbar.new"]?.isHidden = true

        // Design-type selectors (tiles on first run, compact pills afterwards; only
        // on the Recents tab, above the composer).
        let showRecentsChrome = activeTab == .recents
        for (index, preset) in Self.presets.enumerated() {
            let target = presetTargets[preset]
            if m.showsTiles {
                target?.frame = m.designTiles.indices.contains(index) ? m.designTiles[index] : .zero
            } else {
                target?.frame = m.presetPills.indices.contains(index) ? m.presetPills[index] : .zero
            }
            target?.isHidden = !showRecentsChrome
        }

        // Prompt.
        promptCardTarget?.frame = m.promptCard
        promptCardTarget?.isHidden = !showRecentsChrome
        promptPlusTarget?.frame = m.promptPlus
        promptPlusTarget?.isHidden = !showRecentsChrome
        promptConfigureTarget?.frame = m.promptConfigure
        promptConfigureTarget?.isHidden = !showRecentsChrome
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
        // Web: the dashboard search filters by name only; the preset pills above the
        // composer pick an AI generation type and never filter the file list.
        var items = sourceProjects.filter { project in
            query.isEmpty
                || project.title.lowercased().contains(query)
                || project.category.lowercased().contains(query)
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
        // Search pill (web h-8 rounded-xl bg-neutral-900/80; the NSTextField floats above).
        fillRounded(m.searchRect, radius: 12, color: Palette.searchField)
        drawVooIcon(CGRect(x: m.searchRect.minX + 12, y: m.searchRect.minY + 9, width: 13, height: 13)) { iconRect in
            VooIconFactory.drawSearch(in: iconRect, color: Palette.textMuted, strokeWidth: 1.7)
        }

        // Core navigation rows (Recents / Drafts / Starred / Trash).
        let navTabs: [Tab] = [.recents, .drafts, .starred, .trash]
        for (index, tab) in navTabs.enumerated() {
            guard m.navRows.indices.contains(index) else { continue }
            drawNavRow(m.navRows[index], tab: tab)
        }

        // Separator + "PROJECTS" header with its "+" add-folder button.
        ctx.setFillColor(Palette.divider.cgColor)
        ctx.fill(m.divider1)
        drawSectionHeader("PROJECTS", in: m.projectsHeader)
        let addHovered = hoveredKey == "sidebar.projectsAdd"
        if addHovered {
            fillRounded(m.projectsAdd.insetBy(dx: -4, dy: -4), radius: 6, color: Palette.iconHover)
        }
        drawVooIcon(CGRect(x: m.projectsAdd.minX + 2, y: m.projectsAdd.minY + 2, width: 12, height: 12)) { iconRect in
            VooIconFactory.drawPlus(
                in: iconRect,
                color: addHovered ? Palette.textBright : Palette.textMuted,
                strokeWidth: 1.6
            )
        }

        // Separator + "TEMPLATES" header and its two rows.
        ctx.setFillColor(Palette.divider.cgColor)
        ctx.fill(m.divider2)
        drawSectionHeader("TEMPLATES", in: m.templatesHeader)
        let templateTabs: [Tab] = [.designSystems, .shortcuts]
        for (index, tab) in templateTabs.enumerated() {
            guard m.templateRows.indices.contains(index) else { continue }
            drawNavRow(m.templateRows[index], tab: tab)
        }

        // Floating bottom-left "Settings" button (web `fixed bottom-3 left-6`,
        // bg-black min-h-12 rounded-xl px-3, gear 14 + 8 gap + 12pt label).
        let settingsHovered = hoveredKey == "sidebar.settings"
        if settingsHovered {
            fillRounded(m.settingsButton, radius: 12, color: Palette.activePill)
        }
        let gearRect = CGRect(
            x: m.settingsButton.minX + 12,
            y: m.settingsButton.midY - 7,
            width: 14,
            height: 14
        )
        drawVooIcon(gearRect) { iconRect in
            VooIconFactory.drawSettings(
                in: iconRect,
                color: settingsHovered ? Palette.textBright : Palette.textMuted,
                strokeWidth: 1.5
            )
        }
        drawText(
            "Settings",
            x: gearRect.maxX + 8,
            top: m.settingsButton.midY - 8,
            width: max(m.settingsButton.maxX - gearRect.maxX - 20, 10),
            height: 16,
            font: ThemeFonts.system(size: 12, weight: .medium),
            color: settingsHovered ? Palette.textBright : Palette.textMuted
        )
    }

    /// One sidebar navigation row: h28, radius 12, icon 14 at x+10, label 12 at x+34.
    private func drawNavRow(_ row: CGRect, tab: Tab) {
        let isActive = activeTab == tab
        let isHovered = hoveredKey == "nav.\(tab.navTitle)"
        if isActive {
            fillRounded(row, radius: 12, color: Palette.activeRow)
        } else if isHovered {
            fillRounded(row, radius: 12, color: Palette.hover)
        }
        let iconRect = CGRect(x: row.minX + 10, y: row.midY - 7, width: 14, height: 14)
        switch tab {
        case .recents:
            drawVooIcon(iconRect) { r in VooIconFactory.drawClock(in: r, color: Palette.textMuted, strokeWidth: 1.6) }
        case .drafts:
            drawVooIcon(iconRect) { r in VooIconFactory.drawFileText(in: r, color: Palette.textMuted, strokeWidth: 1.6) }
        case .starred:
            drawVooIcon(iconRect) { r in VooIconFactory.drawStar(in: r, color: Palette.textMuted, strokeWidth: 1.6) }
        case .trash:
            drawVooIcon(iconRect) { r in VooIconFactory.drawTrash(in: r, color: Palette.textMuted, strokeWidth: 1.6) }
        case .designSystems:
            drawVooIcon(iconRect) { r in VooIconFactory.drawLayoutGrid(in: r, color: Palette.textMuted, strokeWidth: 1.6) }
        case .shortcuts:
            drawVooIcon(iconRect) { r in VooIconFactory.drawCompass(in: r, color: Palette.textMuted, strokeWidth: 1.6) }
        }
        drawText(
            tab.navTitle,
            x: row.minX + 34,
            top: row.minY + 6,
            width: max(row.width - 44, 10),
            height: 16,
            font: ThemeFonts.system(size: 12, weight: .medium),
            color: isActive ? Palette.textBright : Palette.textMuted
        )
    }

    /// 11pt uppercase section header (`text-[11px] font-semibold uppercase tracking-wider`).
    private func drawSectionHeader(_ title: String, in row: CGRect) {
        drawText(
            title,
            x: row.minX + 10,
            top: row.minY + 7,
            width: row.width - 20,
            height: 14,
            font: ThemeFonts.system(size: 11, weight: .semibold),
            color: Palette.textFaint,
            tracking: 0.55
        )
    }

    // MARK: Recents tab

    private func drawRecents(ctx: CGContext, metrics m: Metrics) {
        drawHeading(metrics: m)
        if m.showsTiles {
            drawDesignTiles(metrics: m)
        } else {
            drawPresetPills(metrics: m)
        }
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

    /// Centered heading above the composer (web `text-center text-[15px] font-medium text-neutral-100`).
    private func drawHeading(metrics m: Metrics) {
        drawText(
            "What would you like to design?",
            x: m.heading.minX,
            top: m.heading.minY,
            width: m.heading.width,
            height: m.heading.height,
            font: ThemeFonts.system(size: 15, weight: .medium),
            color: Palette.textPrimary,
            alignment: .center
        )
    }

    /// First-run design-type tiles (web `WelcomePromptTypes` tiles state): a rounded-12
    /// box with a wireframe preview and an 11pt label (12pt + white when highlighted).
    private func drawDesignTiles(metrics m: Metrics) {
        for (index, kind) in Self.presets.enumerated() {
            guard m.designTiles.indices.contains(index) else { continue }
            let rect = m.designTiles[index]
            let isActive = kind == activePreset
            let isHovered = hoveredKey == "preset.\(kind)"
            if isActive {
                fillRounded(rect, radius: 12, color: Palette.pillFillActive)
            } else if isHovered {
                fillRounded(rect, radius: 12, color: Palette.tileHover)
            }
            let preview = Self.previewSize(for: kind)
            let contentHeight = preview.height + 4 + 16
            let contentTop = rect.midY - contentHeight / 2
            drawDesignPreview(
                kind,
                in: CGRect(
                    x: rect.midX - preview.width / 2,
                    y: contentTop,
                    width: preview.width,
                    height: preview.height
                )
            )
            drawText(
                kind,
                x: rect.minX,
                top: contentTop + preview.height + 4,
                width: rect.width,
                height: 16,
                font: Self.typeTileLabelFont,
                color: isActive ? Palette.textBright : Palette.textMuted,
                alignment: .center
            )
        }
    }

    /// Mini wireframe thumbnail for one design type, sampled from the live build
    /// (`welcome_prompt_types.jsx` TypePreview, 48x28 canvas / 18x32 phone / 24x32 poster).
    private func drawDesignPreview(_ kind: String, in rect: CGRect) {
        func bar(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat, _ color: NSColor, _ radius: CGFloat = 2) {
            fillRounded(
                CGRect(x: rect.minX + x, y: rect.minY + y, width: width, height: height),
                radius: radius,
                color: color
            )
        }
        switch kind {
        case "Mobile app":
            fillRounded(rect, radius: 5, color: Palette.previewLight)
            let screen = rect.insetBy(dx: 2, dy: 2)
            fillRounded(screen, radius: 3, color: Palette.previewScreen)
            fillRounded(
                CGRect(x: screen.minX + 2, y: screen.minY + 8, width: max(screen.width - 4, 2), height: 8),
                radius: 2,
                color: Palette.previewBlockAlt
            )
            fillRounded(
                CGRect(x: screen.minX + 3, y: screen.minY + 18, width: max(screen.width - 6, 2), height: 4),
                radius: 2,
                color: Palette.previewLine
            )
        case "Poster":
            fillRounded(rect, radius: 5, color: Palette.previewCanvas)
            bar(5, 4, 10, 4, Palette.previewLight)
            bar(5, 24, 14, 4, Palette.previewMuted)
        case "Slides":
            fillRounded(rect, radius: 5, color: Palette.previewCanvas)
            bar(5, 3, 11, 4, Palette.previewLight)
        case "Storyboard":
            fillRounded(CGRect(x: rect.minX, y: rect.minY, width: 14, height: rect.height), radius: 3, color: Palette.previewBlockAlt)
            fillRounded(CGRect(x: rect.minX + 17, y: rect.minY, width: 14, height: rect.height), radius: 3, color: Palette.previewMid)
            bar(17, 4, 14, 12, Palette.previewDim)
            fillRounded(CGRect(x: rect.minX + 33, y: rect.minY, width: 15, height: rect.height), radius: 3, color: Palette.previewBlockAlt)
            bar(33, 8, 15, 8, Palette.previewBright)
        case "Dashboard":
            fillRounded(rect, radius: 5, color: Palette.previewCanvas)
            bar(15, 4, 14, 8, Palette.previewMid)
            bar(31, 4, 13, 8, Palette.previewBlockAlt)
            bar(15, 14, 29, 10, Palette.previewDim)
        case "Landing page":
            fillRounded(rect, radius: 5, color: Palette.previewCanvas)
            bar(4, 4, 7, 20, Palette.previewBlockAlt)
            bar(15, 10, 29, 8, Palette.previewBar, 4)
            bar(16, 20, 11, 4, Palette.previewBlock)
            bar(31, 20, 12, 4, Palette.previewBlockAlt)
        default:
            // Web app and "Something else..." share the default TypePreview (no left rail).
            fillRounded(rect, radius: 5, color: Palette.previewCanvas)
            bar(4, 10, 40, 8, Palette.previewBar, 4)
            bar(5, 20, 17, 4, Palette.previewBlock)
            bar(26, 20, 17, 4, Palette.previewBlockAlt)
        }
    }

    /// Generation-type preset pills (web `WelcomePromptTypes`): h32, radius-xl, gap 8,
    /// 1px border, 14pt icon + 6pt gap + 12pt/500 label. `activePill` (first by
    /// default) tints the pill white/10 with a white/50 border and white copy.
    private func drawPresetPills(metrics m: Metrics) {
        let font = ThemeFonts.system(size: 12, weight: .medium)
        for (index, preset) in Self.presets.enumerated() {
            guard m.presetPills.indices.contains(index) else { continue }
            let rect = m.presetPills[index]
            let isActive = preset == activePreset
            let isHovered = hoveredKey == "preset.\(preset)"
            fillRounded(rect, radius: 12, color: isActive ? Palette.pillFillActive : Palette.control)
            strokeRounded(
                rect,
                radius: 12,
                color: isActive ? Palette.pillBorderActive : (isHovered ? Palette.borderHover : Palette.pillBorder),
                lineWidth: 1
            )
            let tint = isActive ? Palette.textBright : Palette.textMuted
            let labelWidth = textWidth(preset, font: font)
            let clusterWidth = 14 + 6 + labelWidth
            let clusterX = rect.midX - clusterWidth / 2
            drawPresetIcon(preset, in: CGRect(x: clusterX, y: rect.midY - 7, width: 14, height: 14), color: tint)
            drawText(
                preset,
                x: clusterX + 20,
                top: rect.midY - 8,
                width: labelWidth + 4,
                height: 16,
                font: font,
                color: tint
            )
        }
    }

    /// Lucide-equivalent glyphs for the web AI generation presets.
    private func drawPresetIcon(_ preset: String, in rect: CGRect, color: NSColor) {
        switch preset {
        case "Landing page":
            drawGalleryGlyph(in: rect, color: color)
        case "Mobile app":
            drawVooIcon(rect) { r in VooIconFactory.drawSmartphone(in: r, color: color, strokeWidth: 1.5) }
        case "Web app":
            drawAppWindowGlyph(in: rect, color: color)
        case "Slides":
            drawVooIcon(rect) { r in VooIconFactory.drawPresentation(in: r, color: color, strokeWidth: 1.5) }
        case "Dashboard":
            drawDashboardGlyph(in: rect, color: color)
        case "Poster":
            drawPosterGlyph(in: rect, color: color)
        case "Storyboard":
            drawStoryboardGlyph(in: rect, color: color)
        default:
            drawVooIcon(rect) { r in VooIconFactory.drawImage(in: r, color: color, strokeWidth: 1.5) }
        }
    }

    private func drawPromptCard(ctx: CGContext, metrics m: Metrics) {
        let rect = m.promptCard
        guard rect.width > 2 && rect.height > 2 else { return }
        // Web `.prompt-composer`: rounded-2xl, `linear-gradient(#171717,#171717)`,
        // box-shadow 0 0 18px mint/16 + 0 0 36px purple/12.
        let radius: CGFloat = 16
        let path = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

        ctx.saveGState()
        ctx.setShadow(offset: .zero, blur: 20, color: Palette.mint.withAlphaComponent(0.18).cgColor)
        ctx.setFillColor(Palette.prompt.cgColor)
        ctx.addPath(path)
        ctx.fillPath()
        ctx.restoreGState()

        ctx.saveGState()
        ctx.setShadow(offset: .zero, blur: 40, color: Palette.purple.withAlphaComponent(0.14).cgColor)
        ctx.setFillColor(Palette.prompt.cgColor)
        ctx.addPath(path)
        ctx.fillPath()
        ctx.restoreGState()

        // Core surface.
        ctx.setFillColor(Palette.prompt.cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // Animated rim: `conic-gradient(#b2ffd6, #e5b2ff, transparent 35%, #b2ffd6)`
        // on a 1px ring that sits OUTSIDE the card box (web `::before { inset: -1px }`),
        // idle opacity 0.35.
        drawConicRim(rect: rect.insetBy(dx: -1, dy: -1), radius: radius + 1, opacity: 0.35)

        // Bottom-left "+" add-to-context button (size-7, radius 8, icon 16).
        let plusHovered = hoveredKey == "prompt.plus"
        if plusHovered {
            fillRounded(m.promptPlus, radius: 8, color: Palette.iconHover)
        }
        drawVooIcon(CGRect(x: m.promptPlus.midX - 8, y: m.promptPlus.midY - 8, width: 16, height: 16)) { iconRect in
            VooIconFactory.drawPlus(in: iconRect, color: plusHovered ? Palette.textBright : Palette.textMuted, strokeWidth: 1.7)
        }

        // Right cluster: variants chip ("⊞ 1x"), "Configure provider" text button, send.
        drawVooIcon(CGRect(x: m.promptCandidates.minX + 8, y: m.promptCandidates.midY - 6.5, width: 13, height: 13)) { iconRect in
            VooIconFactory.drawLayoutGrid(in: iconRect, color: Palette.textMuted, strokeWidth: 1.4)
        }
        drawText(
            "1x",
            x: m.promptCandidates.minX + 25,
            top: m.promptCandidates.midY - 7,
            width: max(m.promptCandidates.width - 33, 10),
            height: 14,
            font: ThemeFonts.mono(size: 12),
            color: Palette.textMuted
        )
        drawText(
            "Configure provider",
            x: m.promptConfigure.minX,
            top: m.promptConfigure.midY - 7,
            width: m.promptConfigure.width,
            height: 16,
            font: ThemeFonts.system(size: 12),
            color: hoveredKey == "prompt.configure" ? Palette.textBright : Palette.textTertiary
        )

        // Send button (size-7 circle): white when the prompt has copy, white/10 otherwise.
        let hasText = !currentText(of: promptField).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let sendFill: NSColor
        if hasText {
            sendFill = Palette.textBright
        } else {
            sendFill = hoveredKey == "prompt.send" ? NSColor(hex: "#3c3c3c") : Palette.sendButton
        }
        ctx.setFillColor(sendFill.cgColor)
        ctx.fillEllipse(in: m.promptSend)
        drawVooIcon(CGRect(x: m.promptSend.midX - 7, y: m.promptSend.midY - 7, width: 14, height: 14)) { iconRect in
            VooIconFactory.drawArrowUp(
                in: iconRect,
                color: hasText ? NSColor.black : Palette.sendArrowDisabled,
                strokeWidth: 2
            )
        }
    }

    private func drawImportCards(ctx: CGContext, metrics m: Metrics) {
        let titles = ["Import from Figma", "Import from browser", "Recreate a screenshot"]
        let font = ThemeFonts.system(size: 12, weight: .medium)
        for (index, title) in titles.enumerated() {
            guard m.importCards.indices.contains(index) else { continue }
            let rect = m.importCards[index]
            let isHovered = hoveredKey == "import.\(index)"
            // Web: `rounded-2xl bg-neutral-800/70 p-4 gap-2.5 text-xs font-medium
            // text-neutral-300`, 16pt icon, no border.
            fillRounded(rect, radius: 16, color: isHovered ? Palette.importCardHover : Palette.importCard)
            let titleWidth = textWidth(title, font: font)
            let clusterWidth = 16 + 10 + titleWidth
            let startX = rect.midX - clusterWidth / 2
            let iconRect = CGRect(x: startX, y: rect.midY - 8, width: 16, height: 16)
            switch index {
            case 0:
                drawVooIcon(iconRect) { r in VooIconFactory.drawFigma(in: r, color: Palette.textMuted, strokeWidth: 1.5) }
            case 1:
                drawVooIcon(iconRect) { r in VooIconFactory.drawGlobe(in: r, color: Palette.textMuted, strokeWidth: 1.5) }
            default:
                drawVooIcon(iconRect) { r in VooIconFactory.drawImage(in: r, color: Palette.textMuted, strokeWidth: 1.5) }
            }
            drawText(
                title,
                x: startX + 26,
                top: rect.midY - 8,
                width: titleWidth + 4,
                height: 16,
                font: font,
                color: isHovered ? Palette.textBright : Palette.textTertiary
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
        // Web `text-xs font-semibold tracking-wide text-neutral-200`.
        let headerFont = ThemeFonts.system(size: 12, weight: .semibold)
        drawText(
            title,
            x: m.headerTitle.minX,
            top: m.headerTitle.minY,
            width: 120,
            height: 16,
            font: headerFont,
            color: Palette.textSecondary,
            tracking: 0.3
        )
        // Count badge: `text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded-md`.
        let badgeFont = ThemeFonts.mono(size: 11)
        let badgeText = "\(count)"
        let badgeWidth = max(textWidth(badgeText, font: badgeFont) + 16, 24)
        let badge = CGRect(
            x: m.headerTitle.minX + textWidth(title, font: headerFont) + 14,
            y: m.headerBadge.minY,
            width: badgeWidth,
            height: 22
        )
        fillRounded(badge, radius: 6, color: Palette.badge)
        drawText(
            badgeText,
            x: badge.minX,
            top: badge.minY + 5,
            width: badge.width,
            height: 14,
            font: badgeFont,
            color: Palette.textMuted,
            alignment: .center
        )

        // Trash-only "Empty Trash" action (web places it in the h-14 header strip).
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
                font: ThemeFonts.system(size: 11, weight: .medium),
                color: NSColor(hex: "#ff6b6b"),
                alignment: .center
            )
        }

        // Sort chip: web `rounded-xl bg-neutral-900/80 px-2.5 py-1.5 text-xs` + 12pt chevron.
        let sortHovered = hoveredKey == "sort"
        fillRounded(m.sortChip, radius: 12, color: sortHovered ? Palette.controlHover : Palette.control)
        drawText(
            sortsByName ? "Name" : "Last modified",
            x: m.sortChip.minX + 10,
            top: m.sortChip.minY + 7,
            width: m.sortChip.width - 34,
            height: 16,
            font: ThemeFonts.system(size: 12),
            color: Palette.textTertiary
        )
        drawVooIcon(CGRect(x: m.sortChip.maxX - 24, y: m.sortChip.minY + 8, width: 12, height: 12)) { iconRect in
            VooIconFactory.drawChevronDown(in: iconRect, color: Palette.textMuted, strokeWidth: 1.6)
        }

        // Grid / list segmented toggle: container radius-xl p-0.5, 21x21 segments.
        fillRounded(m.viewToggle, radius: 12, color: Palette.control)
        if usesGridView {
            fillRounded(m.gridToggle, radius: 8, color: Palette.activePill)
        } else if hoveredKey == "view.grid" {
            fillRounded(m.gridToggle, radius: 8, color: Palette.hover)
        }
        drawVooIcon(CGRect(x: m.gridToggle.midX - 6.5, y: m.gridToggle.midY - 6.5, width: 13, height: 13)) { iconRect in
            VooIconFactory.drawLayoutGrid(in: iconRect, color: usesGridView ? Palette.textBright : Palette.textMuted, strokeWidth: 1.5)
        }
        if !usesGridView {
            fillRounded(m.listToggle, radius: 8, color: Palette.activePill)
        } else if hoveredKey == "view.list" {
            fillRounded(m.listToggle, radius: 8, color: Palette.hover)
        }
        drawVooIcon(CGRect(x: m.listToggle.midX - 6.5, y: m.listToggle.midY - 6.5, width: 13, height: 13)) { iconRect in
            VooIconFactory.drawLayoutList(in: iconRect, color: !usesGridView ? Palette.textBright : Palette.textMuted, strokeWidth: 1.5)
        }
    }

    // MARK: - Fast Cover Image Extraction & Caching

    private static let previewCache = NSCache<NSString, NSImage>()

    public static func previewImage(forPath path: String) -> NSImage? {
        let nsPath = path as NSString
        if let cached = previewCache.object(forKey: nsPath) {
            return cached
        }
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)), data.count >= 12 else {
            return nil
        }
        guard VOOBinaryContainer.isVooBinary(data: data) else {
            return nil
        }
        let headerLength: UInt32 = data.subdata(in: 8..<12).withUnsafeBytes { $0.load(as: UInt32.self) }.littleEndian
        let headerStart = 12
        let headerEnd = headerStart + Int(headerLength)
        guard data.count >= headerEnd else { return nil }
        let headerData = data.subdata(in: headerStart..<headerEnd)

        guard let json = try? JSONSerialization.jsonObject(with: headerData) as? [String: Any],
              let assetIndex = json["assetIndex"] as? [String: Any],
              let previewEntry = assetIndex["__preview"] as? [String: Any],
              let offset = previewEntry["offset"] as? Int,
              let length = previewEntry["length"] as? Int else {
            return nil
        }

        let previewStart = headerEnd + offset
        guard data.count >= previewStart + length else { return nil }
        let previewData = data.subdata(in: previewStart..<(previewStart + length))
        guard let image = NSImage(data: previewData) else { return nil }
        previewCache.setObject(image, forKey: nsPath)
        return image
    }

    private func drawProjectCard(item: ProjectItem, rect: CGRect, index: Int) {
        let isHovered = hoveredKey == "project.\(index)"
        fillRounded(rect, radius: 16, color: isHovered ? NSColor(hex: "#141414") : Palette.card)
        strokeRounded(rect, radius: 16, color: isHovered ? Palette.borderHover : Palette.border, lineWidth: 1)

        let thumbnail = CGRect(x: rect.minX + 8, y: rect.minY + 8, width: rect.width - 16, height: 124)
        fillRounded(thumbnail, radius: 8, color: NSColor(hex: "#171717"))

        if let image = Self.previewImage(forPath: item.openName) {
            let ctx = NSGraphicsContext.current?.cgContext
            ctx?.saveGState()
            let thumbPath = CGPath(roundedRect: thumbnail, cornerWidth: 8, cornerHeight: 8, transform: nil)
            ctx?.addPath(thumbPath)
            ctx?.clip()

            let imgSize = image.size
            if imgSize.width > 0, imgSize.height > 0 {
                // In non-flipped NSView, flip vertically so PNG row 0 stays at top
                ctx?.translateBy(x: 0, y: thumbnail.minY + thumbnail.maxY)
                ctx?.scaleBy(x: 1.0, y: -1.0)

                let scale = max(thumbnail.width / imgSize.width, thumbnail.height / imgSize.height)
                let drawW = imgSize.width * scale
                let drawH = imgSize.height * scale
                let drawX = thumbnail.midX - drawW / 2.0
                let drawY = thumbnail.midY - drawH / 2.0
                image.draw(in: CGRect(x: drawX, y: drawY, width: drawW, height: drawH),
                           from: NSRect(origin: .zero, size: imgSize),
                           operation: .sourceOver,
                           fraction: 1.0)
            }
            ctx?.restoreGState()
            strokeRounded(thumbnail, radius: 8, color: NSColor(white: 1.0, alpha: 0.12), lineWidth: 1)
        } else {
            strokeRounded(thumbnail, radius: 8, color: NSColor(white: 1.0, alpha: 0.04), lineWidth: 1)
            drawThumbnailWireframe(kind: item.kind, rect: thumbnail)
        }

        drawText(
            item.title,
            x: rect.minX + 12,
            top: rect.minY + 146,
            width: rect.width - 24,
            height: 16,
            font: ThemeFonts.system(size: 12, weight: .semibold),
            color: Palette.textPrimary
        )
        drawText(
            "\(item.dimensions) • \(item.category)",
            x: rect.minX + 12,
            top: rect.minY + 165,
            width: rect.width - 24,
            height: 14,
            font: ThemeFonts.system(size: 10),
            color: Palette.textMuted
        )
    }

    private func drawProjectRow(item: ProjectItem, rect: CGRect, index: Int) {
        let isHovered = hoveredKey == "list.\(index)"
        fillRounded(rect, radius: 10, color: isHovered ? NSColor(hex: "#141414") : Palette.card)
        strokeRounded(rect, radius: 10, color: isHovered ? Palette.borderHover : Palette.border, lineWidth: 1)

        let thumbnail = CGRect(x: rect.minX + 12, y: rect.minY + 10, width: 44, height: 36)
        fillRounded(thumbnail, radius: 6, color: NSColor(hex: "#171717"))

        if let image = Self.previewImage(forPath: item.openName) {
            let ctx = NSGraphicsContext.current?.cgContext
            ctx?.saveGState()
            let thumbPath = CGPath(roundedRect: thumbnail, cornerWidth: 6, cornerHeight: 6, transform: nil)
            ctx?.addPath(thumbPath)
            ctx?.clip()

            let imgSize = image.size
            if imgSize.width > 0, imgSize.height > 0 {
                ctx?.translateBy(x: 0, y: thumbnail.minY + thumbnail.maxY)
                ctx?.scaleBy(x: 1.0, y: -1.0)

                let scale = max(thumbnail.width / imgSize.width, thumbnail.height / imgSize.height)
                let drawW = imgSize.width * scale
                let drawH = imgSize.height * scale
                let drawX = thumbnail.midX - drawW / 2.0
                let drawY = thumbnail.midY - drawH / 2.0
                image.draw(in: CGRect(x: drawX, y: drawY, width: drawW, height: drawH),
                           from: NSRect(origin: .zero, size: imgSize),
                           operation: .sourceOver,
                           fraction: 1.0)
            }
            ctx?.restoreGState()
            strokeRounded(thumbnail, radius: 6, color: NSColor(white: 1.0, alpha: 0.12), lineWidth: 1)
        } else {
            drawThumbnailWireframe(kind: item.kind, rect: thumbnail)
        }
        drawText(
            item.title,
            x: rect.minX + 68,
            top: rect.minY + 10,
            width: max(rect.width - 68 - 160, 80),
            height: 16,
            font: ThemeFonts.system(size: 12, weight: .semibold),
            color: Palette.textPrimary
        )
        drawText(
            "\(item.dimensions) • \(item.category)",
            x: rect.minX + 68,
            top: rect.minY + 29,
            width: max(rect.width - 68 - 160, 80),
            height: 14,
            font: ThemeFonts.system(size: 10),
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
            font: ThemeFonts.system(size: 12, weight: .semibold),
            color: Palette.textPrimary,
            alignment: .center
        )
        drawText(
            hint,
            x: rect.minX + 24,
            top: rect.midY + 27,
            width: rect.width - 48,
            height: 16,
            font: ThemeFonts.system(size: 11),
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
                font: ThemeFonts.system(size: 12, weight: .semibold),
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
                font: ThemeFonts.system(size: 12),
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

        let titleFont = ThemeFonts.system(size: 12, weight: .semibold)
        let suffixFont = ThemeFonts.system(size: 12)
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

        let labelFont = ThemeFonts.system(size: 12)
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
            font: ThemeFonts.system(size: 12, weight: .semibold),
            color: Palette.textPrimary
        )
        drawText(
            Self.aboutProjectFormat,
            x: about.minX + 24,
            top: about.minY + 48,
            width: about.width - 48,
            height: max(about.height - 68, 16),
            font: ThemeFonts.system(size: 12),
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

    /// Maps a 24x24 Lucide viewBox rect into `rect`, preserving aspect ratio.
    private func glyphRect(_ unit: CGRect, in rect: CGRect) -> CGRect {
        let scale = min(rect.width, rect.height) / 24
        let originX = rect.midX - 12 * scale
        let originY = rect.midY - 12 * scale
        return CGRect(
            x: originX + unit.minX * scale,
            y: originY + unit.minY * scale,
            width: unit.width * scale,
            height: unit.height * scale
        )
    }

    private func strokeGlyphRect(
        _ unit: CGRect,
        in rect: CGRect,
        color: NSColor,
        lineWidth: CGFloat,
        radius: CGFloat = 1
    ) {
        let scale = min(rect.width, rect.height) / 24
        strokeRounded(
            glyphRect(unit, in: rect),
            radius: radius * scale,
            color: color,
            lineWidth: lineWidth
        )
    }

    private func strokeGlyphLine(
        from start: CGPoint,
        to end: CGPoint,
        in rect: CGRect,
        color: NSColor,
        lineWidth: CGFloat
    ) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let scale = min(rect.width, rect.height) / 24
        let originX = rect.midX - 12 * scale
        let originY = rect.midY - 12 * scale
        ctx.saveGState()
        ctx.setStrokeColor(color.cgColor)
        ctx.setLineWidth(lineWidth)
        ctx.setLineCap(.round)
        ctx.setLineJoin(.round)
        ctx.move(to: CGPoint(x: originX + start.x * scale, y: originY + start.y * scale))
        ctx.addLine(to: CGPoint(x: originX + end.x * scale, y: originY + end.y * scale))
        ctx.strokePath()
        ctx.restoreGState()
    }

    /// Lucide `gallery-horizontal-end` (web "Landing page" preset).
    private func drawGalleryGlyph(in rect: CGRect, color: NSColor) {
        let lineWidth = max(1.3, rect.width / 14)
        strokeGlyphRect(CGRect(x: 10, y: 3, width: 12, height: 18), in: rect, color: color, lineWidth: lineWidth, radius: 2)
        strokeGlyphLine(from: CGPoint(x: 6, y: 5), to: CGPoint(x: 6, y: 19), in: rect, color: color, lineWidth: lineWidth)
        strokeGlyphLine(from: CGPoint(x: 2, y: 7), to: CGPoint(x: 2, y: 17), in: rect, color: color, lineWidth: lineWidth)
    }

    /// Portrait card glyph for the "Poster" preset pill.
    private func drawPosterGlyph(in rect: CGRect, color: NSColor) {
        let lineWidth = max(1.2, rect.width / 16)
        let card = CGRect(x: rect.midX - 5, y: rect.minY + 1, width: 10, height: rect.height - 2)
        strokeRounded(card, radius: 2, color: color, lineWidth: lineWidth)
        fillRounded(CGRect(x: card.minX + 2, y: card.minY + 3, width: 6, height: 2), radius: 1, color: color)
        fillRounded(CGRect(x: card.minX + 2, y: card.maxY - 5, width: 4, height: 2), radius: 1, color: color)
    }

    /// Three storyboard columns for the "Storyboard" preset pill.
    private func drawStoryboardGlyph(in rect: CGRect, color: NSColor) {
        let lineWidth = max(1.1, rect.width / 18)
        let columnWidth = (rect.width - 2) / 3 - 1
        for index in 0..<3 {
            let column = CGRect(
                x: rect.minX + CGFloat(index) * (columnWidth + 1),
                y: rect.minY + 1,
                width: columnWidth,
                height: rect.height - 2
            )
            strokeRounded(column, radius: 1.5, color: color, lineWidth: lineWidth)
        }
    }

    /// Lucide `app-window` (web "Web app" preset).
    private func drawAppWindowGlyph(in rect: CGRect, color: NSColor) {
        let lineWidth = max(1.3, rect.width / 14)
        strokeGlyphRect(CGRect(x: 2, y: 4, width: 20, height: 16), in: rect, color: color, lineWidth: lineWidth, radius: 2)
        strokeGlyphLine(from: CGPoint(x: 10, y: 4), to: CGPoint(x: 10, y: 8), in: rect, color: color, lineWidth: lineWidth)
        strokeGlyphLine(from: CGPoint(x: 2, y: 8), to: CGPoint(x: 22, y: 8), in: rect, color: color, lineWidth: lineWidth)
    }

    /// Lucide `layout-dashboard` (web "Dashboard" preset).
    private func drawDashboardGlyph(in rect: CGRect, color: NSColor) {
        let lineWidth = max(1.3, rect.width / 14)
        strokeGlyphRect(CGRect(x: 3, y: 3, width: 7, height: 9), in: rect, color: color, lineWidth: lineWidth)
        strokeGlyphRect(CGRect(x: 14, y: 3, width: 7, height: 5), in: rect, color: color, lineWidth: lineWidth)
        strokeGlyphRect(CGRect(x: 14, y: 12, width: 7, height: 9), in: rect, color: color, lineWidth: lineWidth)
        strokeGlyphRect(CGRect(x: 3, y: 16, width: 7, height: 5), in: rect, color: color, lineWidth: lineWidth)
    }

    /// Conic mint -> purple rim (web `.prompt-composer::before`: conic-gradient
    /// #b2ffd6, #e5b2ff, transparent 35%, #b2ffd6 at opacity .35). CoreGraphics has
    /// no conic gradient, so the 1pt ring is clipped and filled by angle wedges.
    private func drawConicRim(rect: CGRect, radius: CGFloat, opacity: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext, rect.width > 4, rect.height > 4 else { return }
        let lineWidth: CGFloat = 1
        let outer = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)
        let inner = CGPath(
            roundedRect: rect.insetBy(dx: lineWidth, dy: lineWidth),
            cornerWidth: max(radius - lineWidth, 0),
            cornerHeight: max(radius - lineWidth, 0),
            transform: nil
        )
        ctx.saveGState()
        ctx.addPath(outer)
        ctx.addPath(inner)
        ctx.clip(using: .evenOdd)

        let stops: [(CGFloat, NSColor)] = [
            (0.000, Palette.mint.withAlphaComponent(opacity)),
            (0.175, Palette.purple.withAlphaComponent(opacity)),
            (0.350, Palette.purple.withAlphaComponent(0)),
            (1.000, Palette.mint.withAlphaComponent(opacity))
        ]
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let reach = hypot(rect.width, rect.height) / 2 + 2
        let segments = 144
        for index in 0..<segments {
            let t0 = CGFloat(index) / CGFloat(segments)
            let t1 = CGFloat(index + 1) / CGFloat(segments)
            let angle0 = t0 * 2 * .pi
            let angle1 = t1 * 2 * .pi
            let color = conicColor(at: (t0 + t1) / 2, stops: stops)
            ctx.setFillColor(color.cgColor)
            ctx.beginPath()
            ctx.move(to: center)
            ctx.addLine(to: CGPoint(x: center.x + reach * sin(angle0), y: center.y - reach * cos(angle0)))
            ctx.addLine(to: CGPoint(x: center.x + reach * sin(angle1), y: center.y - reach * cos(angle1)))
            ctx.closePath()
            ctx.fillPath()
        }
        ctx.restoreGState()
    }

    /// Samples a conic stop list at `t` (0...1) with linear sRGB/alpha interpolation.
    private func conicColor(at t: CGFloat, stops: [(CGFloat, NSColor)]) -> NSColor {
        guard let first = stops.first else { return .clear }
        if t <= first.0 { return first.1 }
        for index in 1..<stops.count {
            let next = stops[index]
            if t <= next.0 {
                let previous = stops[index - 1]
                let span = max(next.0 - previous.0, 0.0001)
                return blend(previous.1, next.1, fraction: (t - previous.0) / span)
            }
        }
        return stops.last?.1 ?? first.1
    }

    private func blend(_ from: NSColor, _ to: NSColor, fraction: CGFloat) -> NSColor {
        guard let a = from.usingColorSpace(.sRGB), let b = to.usingColorSpace(.sRGB) else { return to }
        let f = min(max(fraction, 0), 1)
        return NSColor(
            srgbRed: a.redComponent + (b.redComponent - a.redComponent) * f,
            green: a.greenComponent + (b.greenComponent - a.greenComponent) * f,
            blue: a.blueComponent + (b.blueComponent - a.blueComponent) * f,
            alpha: a.alphaComponent + (b.alphaComponent - a.alphaComponent) * f
        )
    }

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
