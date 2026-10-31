//
//  WindowController.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M1 & M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation
import UniformTypeIdentifiers
import QuartzCore

// MARK: - Root Window Controller

public class WindowController: NSWindowController, AppTitleBarDelegate, StudioDelegate, StudioMenuActions, NSMenuItemValidation, DocumentOpener, InspectorDelegate {
    public let studioWindow: NSWindow
    public let mainContentView: MainContentView
    public weak var delegate: StudioDelegate?
    public var commandManager = CommandManager()
    public var currentFileURL: URL?
    public let textEditingOverlay = TextEditingOverlay()
    private var keyEventMonitor: Any?
    private var keyUpEventMonitor: Any?

    public override var window: NSWindow? {
        get { studioWindow }
        set { super.window = newValue }
    }

    /// Authoritative Designated Initializer
    /// Guarantees unconditional window chrome styling, accessibility configuration,
    /// and view hierarchy attachment.
    public override init(window: NSWindow?) {
        let actualWindow = window ?? NSWindow(
            contentRect: NSRect(x: 100, y: 100, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: true
        )
        let view = (actualWindow.contentView as? MainContentView) ?? MainContentView()

        // 1. Unconditional Window Configuration
        actualWindow.title = "VOO Design Native"
        actualWindow.titleVisibility = .hidden
        actualWindow.titlebarAppearsTransparent = true
        actualWindow.isReleasedWhenClosed = false
        actualWindow.backgroundColor = ThemeTokens.colorPanel
        actualWindow.acceptsMouseMovedEvents = true
        actualWindow.minSize = NSSize(width: 960, height: 600)
        if window == nil {
            actualWindow.center()
        }

        // 2. Unconditional Root Accessibility
        actualWindow.setAccessibilityIdentifier("main_window")
        actualWindow.setAccessibilityRole(.window)
        actualWindow.setAccessibilityLabel("VOO Design Native Main Window")

        // 3. Unconditional View Hierarchy Attachment
        let rect = actualWindow.contentRect(forFrameRect: actualWindow.frame)
        view.frame = rect
        actualWindow.contentView = view

        self.studioWindow = actualWindow
        self.mainContentView = view
        super.init(window: actualWindow)

        // 4. Wire Delegates & Setup Event Monitoring
        view.titleBar.delegate = self
        view.toolRail.delegate = self
        view.inspector.delegate = self

        // Wire CanvasStageView Events
        view.canvasStageView.onSelectionChanged = { [weak self] selectedIds in
            guard let self = self else { return }
            let nodes = self.mainContentView.canvasStageView.document.nodes
            self.mainContentView.inspector.layersPanel.configure(with: nodes, selectedId: selectedIds.first)
            if let firstId = selectedIds.first, let node = nodes.first(where: { $0.id == firstId }) {
                self.mainContentView.inspector.configureProperties(with: node)
                self.mainContentView.inspector.transformPanel.configure(with: node)
                self.mainContentView.inspector.appearancePanel.configure(with: node)
            } else {
                self.mainContentView.inspector.configureProperties(with: nil)
            }
            let hasSelection = !selectedIds.isEmpty
            self.mainContentView.inspector.setPropertiesVisible(hasSelection)
            let selectionName = nodes.first(where: { $0.id == selectedIds.first })?.name
            self.mainContentView.islandBar.update(selectionLabel: hasSelection ? (selectionName ?? "Selection") : nil)
            self.mainContentView.sessionHasSelection = hasSelection
            self.mainContentView.refreshChromeVisibility()
            self.mainContentView.updateIslandBarPosition()
        }

        // Panning / ruler toggles move the stage without changing zoom; keep the
        // selection island bar glued to its anchor frame (web parity).
        view.canvasStageView.onViewportChanged = { [weak self] in
            self?.mainContentView.updateIslandBarPosition()
        }

        view.canvasStageView.onZoomChanged = { [weak self] zoom in
            guard let self = self else { return }
            self.mainContentView.titleBar.zoomIndicator.stringValue = "\(Int(round(zoom * 100)))%"
            self.mainContentView.bottomZoomBar.update(
                zoom: zoom,
                canUndo: self.commandManager.canUndo,
                canRedo: self.commandManager.canRedo
            )
            if self.textEditingOverlay.isEditing {
                self.textEditingOverlay.refreshGeometry()
            }
            self.mainContentView.updateIslandBarPosition()
        }

        // Wire Dashboard & Editor Navigation
        view.welcomeDashboard.onOpenEditor = { [weak self] projName in
            self?.openEditor(project: projName)
        }
        view.welcomeDashboard.onOpenFile = { [weak self] in
            self?.openDocument(nil)
        }
        view.welcomeDashboard.onNewFile = { [weak self] in
            self?.newDocument(nil)
            self?.mainContentView.isWelcomeOpen = false
            self?.syncChromeState()
        }
        view.welcomeDashboard.onPromptSubmit = { [weak self] prompt in
            guard let self = self else { return }
            self.mainContentView.isWelcomeOpen = false
            self.newDocument(nil)
            if !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                self.setAgentPanelOpen(true)
                self.mainContentView.agentPanel.addUserMessage(prompt)
                self.mainContentView.agentPanel.addAgentMessage("正在为「\(prompt)」准备工作区与画板。你可以在左侧 LAYERS 面板中继续调整，或直接告诉我要生成的布局。")
            }
        }
        view.welcomeDashboard.onImportAction = { kind in
            let alert = NSAlert()
            alert.messageText = kind
            switch kind {
            case "Import from Figma":
                alert.informativeText = "原生版本通过「打开…」读取 .fig / .voo 工程；导入流水线将在后续版本接入。"
            case "Import from browser":
                alert.informativeText = "浏览器抓取接口仅在桌面 Web 版本可用；原生版本支持直接打开本地工程文件。"
            default:
                alert.informativeText = "截图重组需要使用本地 AI 模型；原生版本会使用当前选区作为上下文。"
            }
            alert.alertStyle = .informational
            alert.runModal()
        }
        // Wire Workspace Manager
        WorkspaceManager.shared.onWorkspaceChanged = { [weak self] in
            self?.refreshWorkspaceFiles()
        }
        refreshWorkspaceFiles()

        view.welcomeDashboard.onChangeWorkspace = { [weak self] in
            guard let self = self else { return }
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.prompt = "选择工作区"
            if panel.runModal() == .OK, let url = panel.url {
                let res = WorkspaceManager.shared.setWorkspaceDirectory(url.path)
                if res.ok {
                    self.refreshWorkspaceFiles()
                    self.showChromeToast("工作区已切换: \(url.lastPathComponent)")
                } else {
                    self.showChromeToast("切换失败: \(res.error ?? "")")
                }
            }
        }
        view.welcomeDashboard.onRescan = { [weak self] in
            guard let self = self else { return }
            _ = WorkspaceManager.shared.rescan()
            self.refreshWorkspaceFiles()
            self.showChromeToast("工作区已重新扫描")
        }
        // Dashboard "Settings" floating button + "Configure provider" (web parity).
        view.welcomeDashboard.onOpenSettings = { [weak self] in
            self?.mainContentView.showSettings(tab: "general")
        }
        // The web title bar opens an embedded browser drawer; native has no drawer yet.
        view.titleBar.onBrowserTapped = { [weak self] in
            self?.showChromeToast("内嵌浏览器抽屉在原生版本尚未接入")
        }
        // Live collaboration button (web parity)
        view.titleBar.onCollabTapped = { [weak self] in
            self?.showChromeToast("实时协作：已生成协作分享链接")
        }
        view.welcomeDashboard.onEmptyTrash = { [weak self] in
            guard let self = self else { return }
            let alert = NSAlert()
            alert.messageText = "清空回收站"
            alert.informativeText = "确定要永久删除回收站中的所有文件吗？此操作无法撤销。"
            alert.alertStyle = .critical
            alert.addButton(withTitle: "清空")
            alert.addButton(withTitle: "取消")
            if alert.runModal() == .alertFirstButtonReturn {
                do {
                    let count = try WorkspaceManager.shared.emptyTrash()
                    self.refreshWorkspaceFiles()
                    self.showChromeToast("已永久删除 \(count) 个文件")
                } catch {
                    self.showChromeToast("清空失败: \(error.localizedDescription)")
                }
            }
        }
        view.welcomeDashboard.onCreateFolder = { [weak self] in
            guard let self = self else { return }
            let alert = NSAlert()
            alert.messageText = "新建文件夹"
            alert.informativeText = "请输入新文件夹名称："
            alert.addButton(withTitle: "创建")
            alert.addButton(withTitle: "取消")
            let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 220, height: 24))
            input.placeholderString = "新文件夹"
            alert.accessoryView = input
            if alert.runModal() == .alertFirstButtonReturn {
                let name = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty {
                    do {
                        _ = try WorkspaceManager.shared.createFolder(name: name)
                        self.refreshWorkspaceFiles()
                        self.showChromeToast("已创建文件夹: \(name)")
                    } catch {
                        self.showChromeToast("创建失败: \(error.localizedDescription)")
                    }
                }
            }
        }
        view.welcomeDashboard.onFileAction = { [weak self] action, filePath in
            guard let self = self else { return }
            do {
                switch action {
                case .revealInFinder:
                    WorkspaceManager.shared.revealInFinder(filePath: filePath)
                case .duplicate:
                    let newPath = try WorkspaceManager.shared.duplicateFile(filePath: filePath)
                    self.refreshWorkspaceFiles()
                    self.showChromeToast("已创建副本: \((newPath as NSString).lastPathComponent)")
                case .rename(let newName):
                    let newPath = try WorkspaceManager.shared.renameFile(filePath: filePath, newName: newName)
                    self.refreshWorkspaceFiles()
                    self.showChromeToast("已重命名为: \((newPath as NSString).lastPathComponent)")
                case .moveToFolder(let folder):
                    _ = try WorkspaceManager.shared.moveToFolder(filePath: filePath, folderName: folder)
                    self.refreshWorkspaceFiles()
                    let targetName = folder ?? "工作区根目录"
                    self.showChromeToast("已移至: \(targetName)")
                case .toggleStar:
                    let starred = WorkspaceManager.shared.toggleStar(filePath: filePath)
                    self.refreshWorkspaceFiles()
                    self.showChromeToast(starred ? "已加入星标" : "已取消星标")
                case .moveToTrash:
                    _ = try WorkspaceManager.shared.moveToTrash(filePath: filePath)
                    self.refreshWorkspaceFiles()
                    self.showChromeToast("已移至回收站")
                case .restoreFromTrash:
                    let restoredPath = try WorkspaceManager.shared.restoreFromTrash(filePath: filePath)
                    self.refreshWorkspaceFiles()
                    self.showChromeToast("已恢复: \((restoredPath as NSString).lastPathComponent)")
                case .deletePermanently:
                    try WorkspaceManager.shared.deletePermanently(filePath: filePath)
                    self.refreshWorkspaceFiles()
                    self.showChromeToast("已永久删除")
                }
            } catch {
                self.showChromeToast("操作失败: \(error.localizedDescription)")
            }
        }
        view.canvasStageView.onUndoRequested = { [weak self] in
            self?.undoAction(nil)
        }
        view.canvasStageView.onRedoRequested = { [weak self] in
            self?.redoAction(nil)
        }

        // Wire ContextToolbar (Boolean, Align, Curve Node editing)
        view.contextToolbar.onBooleanOperation = { [weak self] op in
            self?.performBoolean(op, name: "\(op)")
        }
        view.contextToolbar.onAlignAction = { [weak self] alignKey in
            self?.performAlign(alignKey)
        }
        view.contextToolbar.onNodeTypeAction = { [weak self] nodeKey in
            self?.performNodeTypeChange(nodeKey)
        }

        // Wire VOO editor chrome (bottom controls, island bar, AI panel, onboarding)
        view.toolRail.onBrandAvatarTapped = { [weak self] in
            self?.setAgentPanelOpen(true)
        }
        view.toolRail.onAccessoryAction = { [weak self] accessory in
            self?.activateAccessoryTool(accessory)
        }
        view.aiButton.onActivate = { [weak self] in
            self?.setAgentPanelOpen(true)
        }
        view.agentPanel.onClose = { [weak self] in
            self?.cancelActiveAgentTask()
            self?.setAgentPanelOpen(false)
        }
        view.agentPanel.onNewChat = { [weak self] in
            self?.agentChatHistory.removeAll()
            self?.cancelActiveAgentTask()
            self?.mainContentView.agentPanel.newConversation()
        }
        view.agentPanel.onSend = { [weak self] text in
            self?.handleAgentPrompt(text)
        }
        view.agentPanel.onSuggestion = { [weak self] text in
            self?.handleAgentPrompt(text)
        }
        view.pageSwitcher.onTap = { [weak self] in
            self?.showPageSwitcherMenu()
        }
        view.bottomZoomBar.onUndo = { [weak self] in
            self?.undoAction(nil)
        }
        view.bottomZoomBar.onRedo = { [weak self] in
            self?.redoAction(nil)
        }
        view.bottomZoomBar.onZoomIn = { [weak self] in
            self?.mainContentView.canvasStageView.zoomIn()
        }
        view.bottomZoomBar.onZoomOut = { [weak self] in
            self?.mainContentView.canvasStageView.zoomOut()
        }
        view.bottomZoomBar.onZoomReset = { [weak self] in
            self?.mainContentView.canvasStageView.zoomActual()
        }
        view.bottomZoomBar.onGridToggle = { [weak self] enabled in
            self?.mainContentView.canvasStageView.showGrid = enabled
        }
        view.bottomZoomBar.onZoomFit = { [weak self] in
            self?.mainContentView.canvasStageView.zoomFit()
        }
        view.bottomZoomBar.onClearGuides = { [weak self] in
            guard let self = self else { return }
            self.mainContentView.canvasStageView.document.guides?.removeAll()
            self.mainContentView.canvasStageView.needsDisplay = true
            self.showChromeToast("参考线已清除")
        }
        // Web `editor_zoom.jsx`: "Rulers and guides live inside this one bar", so the
        // middle control toggles rulers; snapping moved behind the "..." menu.
        view.bottomZoomBar.onVisibilityToggle = { [weak self] enabled in
            guard let self = self else { return }
            self.mainContentView.canvasStageView.showRulers = enabled
            UserDefaults.standard.set(enabled, forKey: SettingsDrawerView.showRulersDefaultsKey)
            self.mainContentView.bottomZoomBar.setRulersEnabled(enabled)
            self.mainContentView.updateIslandBarPosition()
        }
        view.bottomZoomBar.onToggleRulers = { [weak self] enabled in
            guard let self = self else { return }
            self.mainContentView.canvasStageView.showRulers = enabled
            UserDefaults.standard.set(enabled, forKey: SettingsDrawerView.showRulersDefaultsKey)
            self.mainContentView.bottomZoomBar.setVisibilityEnabled(enabled)
            self.mainContentView.updateIslandBarPosition()
        }
        view.bottomZoomBar.onSnapToggle = { [weak self] enabled in
            self?.mainContentView.canvasStageView.isSnappingEnabled = enabled
        }
        view.addArtboardButton.onAddArtboard = { [weak self] in
            guard let self = self else { return }
            self.newPageAction(nil)
            self.showChromeToast("已新建画板")
        }
        view.islandBar.onAskAI = { [weak self] prompt in
            self?.setAgentPanelOpen(true)
            if !prompt.isEmpty {
                self?.handleAgentPrompt(prompt)
            }
        }
        view.islandBar.onQuickAction = { [weak self] action in
            guard let self = self else { return }
            switch action {
            case "Boolean":
                self.performBoolean(.union, name: "Union")
            case "Vectorize":
                self.showChromeToast("矢量化任务已加入队列 (Vectorize queued)")
            case "Style Transfer":
                self.showChromeToast("风格迁移需要本地 AI 模型 (Style Transfer needs local AI)")
            default:
                break
            }
        }
        view.islandBar.onGlyphAction = { [weak self] glyph in
            guard let self = self else { return }
            switch glyph {
            case .trash:
                self.deleteAction(nil)
            case .copy:
                self.duplicateAction(nil)
            case .lock:
                self.toggleLockAction(nil)
            case .eye:
                self.toggleVisibilityAction(nil)
            case .alignLeftH:
                self.performAlign("left")
            case .alignCenterH:
                self.performAlign("center")
            case .distributeH:
                self.performDistribute(horizontal: true)
            case .arrowUp:
                self.moveSelectionInLayerOrder(forward: true)
            case .arrowDown:
                self.moveSelectionInLayerOrder(forward: false)
            case .fillSwatch:
                self.presentSelectionColourPanel(isStroke: false)
            case .strokeSwatch:
                self.presentSelectionColourPanel(isStroke: true)
            case .flipHorizontal, .flipVertical:
                self.showChromeToast("翻转选区 (Flip selection)")
            default:
                break
            }
        }
        // Canvas creation tools (shapes / artboards / pen / inline text)
        view.canvasStageView.onCreateNode = { [weak self] node in
            self?.insertNodeFromCanvas(node)
        }
        view.canvasStageView.onRequestTextInsertion = { [weak self] point in
            self?.createTextNodeFromCanvas(at: point)
        }
        view.canvasStageView.onEditTextNode = { [weak self] node in
            self?.beginTextEditing(node)
        }
        view.canvasStageView.onToolActionCompleted = { action in
            NSLog("[VOO Design Native] canvas tool: %@", action)
        }
        // Canvas drag / handle transforms become single undoable commands.
        view.canvasStageView.onMoveCommitted = { [weak self] before, after in
            self?.recordGeometryCommit(before: before, after: after)
        }
        view.canvasStageView.onHandleTransformCommitted = { [weak self] nodeId, beforeRect, beforeRotation, afterRect, afterRotation in
            self?.recordHandleCommit(nodeId: nodeId, beforeRect: beforeRect, beforeRotation: beforeRotation,
                                     afterRect: afterRect, afterRotation: afterRotation)
        }
        view.canvasStageView.onSelectionTransformCommitted = { [weak self] beforeRects, afterRects, beforeRots, afterRots in
            self?.recordMultiTransformCommit(beforeRects: beforeRects, afterRects: afterRects,
                                             beforeRotations: beforeRots, afterRotations: afterRots)
        }
        view.canvasStageView.onPathPointsCommitted = { [weak self] nodeId, beforePoints, afterPoints in
            self?.recordPathPointsCommit(nodeId: nodeId, before: beforePoints, after: afterPoints)
        }
        view.canvasStageView.onDropFiles = { [weak self] urls, point in
            guard let self = self else { return }
            for url in urls { self.importImage(from: url, at: point) }
        }
        view.canvasStageView.onPaintStrokeCommitted = { [weak self] nodeId, dataURL in
            self?.commitPaintStroke(nodeId: nodeId, dataURL: dataURL)
        }
        // Native right-click context menu for the canvas.
        view.canvasStageView.contextMenuProvider = { [weak self] _ in
            self?.buildCanvasContextMenu()
        }

        // Floating Contextual Taskbar Callbacks
        let taskbar = view.canvasStageView.contextualTaskbar
        taskbar.onDuplicate = { [weak self] in self?.duplicateAction(nil) }
        taskbar.onFlipH = { [weak self] in self?.flipHorizontalAction(nil) }
        taskbar.onFlipV = { [weak self] in self?.flipVerticalAction(nil) }
        taskbar.onToggleLock = { [weak self] in self?.toggleLockAction(nil) }
        taskbar.onToggleVisibility = { [weak self] in self?.toggleVisibilityAction(nil) }
        taskbar.onCopySvg = { [weak self] in self?.copySvgAction(nil) }
        taskbar.onCopyCode = { [weak self] in self?.copyCodeAction(nil) }
        taskbar.onDelete = { [weak self] in self?.deleteAction(nil) }
        taskbar.onAlign = { [weak self] mode in
            let item = NSMenuItem()
            item.representedObject = mode
            self?.alignSelectionAction(item)
        }
        taskbar.onDistribute = { [weak self] axis in
            let item = NSMenuItem()
            item.representedObject = axis
            self?.distributeSelectionAction(item)
        }
        taskbar.onGroup = { [weak self] in self?.groupAction(nil) }
        taskbar.onUngroup = { [weak self] in self?.ungroupAction(nil) }
        taskbar.onBoolean = { [weak self] op in
            switch op {
            case .union, .add: self?.booleanUnionAction(nil)
            case .subtract: self?.booleanSubtractAction(nil)
            case .intersect: self?.booleanIntersectAction(nil)
            case .xor, .exclude: self?.booleanXorAction(nil)
            case .divide: self?.booleanDivideAction(nil)
            }
        }
        taskbar.onFinishPath = { [weak self] in
            self?.mainContentView.canvasStageView.activeTool = .move
        }
        taskbar.onDeleteAnchor = { [weak self] in
            self?.mainContentView.canvasStageView.deleteSelectedPathAnchor()
        }
        taskbar.onConvertAnchor = { [weak self] type in
            self?.mainContentView.canvasStageView.convertSelectedPathAnchor(to: type)
        }
        taskbar.onBreakCurve = { [weak self] in
            self?.mainContentView.canvasStageView.breakSelectedPathAnchor()
            self?.refreshAfterDocumentMutation()
        }
        taskbar.onCloseCurve = { [weak self] in
            self?.closeCurveAction(nil)
        }
        taskbar.onAIRemoveBackground = { [weak self] in
            self?.aiRemoveBackgroundAction()
        }
        taskbar.onAIRewrite = { [weak self] in
            self?.aiRewriteAction()
        }

        // ToolRail sub-tool callbacks
        view.toolRail.state.onPenSubToolChanged = { [weak self] sub in
            if let penSub = PenSubTool(rawValue: sub) {
                self?.mainContentView.canvasStageView.activePenSubTool = penSub
            }
        }
        view.toolRail.state.onShapeSubToolChanged = { [weak self] shapeSub in
            self?.mainContentView.canvasStageView.activeShapeSubTool = shapeSub
        }
        view.toolRail.state.onSelectionSubToolChanged = { [weak self] selSub in
            self?.mainContentView.canvasStageView.activeSelectionSubTool = selSub
        }

        // Inline text editing overlay
        textEditingOverlay.attach(to: view.canvasStageView)
        textEditingOverlay.onCommit = { [weak self] text in
            self?.commitTextEditing(text)
        }
        textEditingOverlay.onCancel = { [weak self] in
            self?.textEditingOverlay.isHidden = true
            self?.refreshAfterDocumentMutation()
        }

        // Layers panel interactions (VOO web parity)
        let layers = view.inspector.layersPanel
        layers.onAddLayer = { [weak self] in
            self?.addRectangleLayer()
        }
        layers.onAddMask = { [weak self] in
            self?.addMaskToSelection()
        }
        layers.onGroupLayers = { [weak self] in
            self?.groupAction(nil)
        }
        layers.onDeleteSelected = { [weak self] in
            self?.deleteAction(nil)
        }
        layers.onDuplicateSelected = { [weak self] in
            self?.duplicateAction(nil)
        }
        layers.onOpacityChange = { [weak self] opacity in
            self?.applyOpacityToSelection(opacity)
        }
        layers.onBlendModeChange = { [weak self] mode in
            self?.applyBlendModeToSelection(mode)
        }
        layers.onMoveLayer = { [weak self] nodeId, targetIndex in
            self?.moveLayer(nodeId, to: targetIndex)
        }

        view.onboardingGuide.onComplete = { [weak self] in
            self?.mainContentView.hideOnboarding()
        }
        view.onboardingGuide.onClose = { [weak self] in
            self?.mainContentView.hideOnboarding()
        }
        view.settingsDrawer.onClose = { [weak self] in
            self?.mainContentView.hideSettings()
        }
        view.settingsDrawer.onOpenOnboarding = { [weak self] in
            self?.mainContentView.hideSettings()
            self?.mainContentView.showOnboarding()
        }
        view.settingsDrawer.onWorkspaceChange = { [weak self] in
            guard let self = self else { return }
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.prompt = "选择工作区"
            if panel.runModal() == .OK, let url = panel.url {
                let res = WorkspaceManager.shared.setWorkspaceDirectory(url.path)
                if res.ok {
                    self.refreshWorkspaceFiles()
                    self.mainContentView.settingsDrawer.needsDisplay = true
                    self.showChromeToast("工作区已切换: \(url.lastPathComponent)")
                } else {
                    self.showChromeToast("切换失败: \(res.error ?? "")")
                }
            }
        }
        view.settingsDrawer.onRescan = { [weak self] in
            guard let self = self else { return }
            _ = WorkspaceManager.shared.rescan()
            self.refreshWorkspaceFiles()
            self.mainContentView.settingsDrawer.needsDisplay = true
            self.showChromeToast("工作区已重新扫描")
        }
        // Settings → General → Canvas: "Show rulers" mirrors `voo.editor.showRulers`
        // and stays in sync with ⇧R / the zoom bar (web parity).
        view.settingsDrawer.onToggleRulers = { [weak self] show in
            guard let self = self else { return }
            self.mainContentView.canvasStageView.showRulers = show
            self.mainContentView.canvasStageView.needsDisplay = true
            self.mainContentView.updateIslandBarPosition()
        }
        view.settingsDrawer.onToggleLightInterface = { [weak self] isLight in
            guard let self = self else { return }
            ThemeManager.shared.currentMode = isLight ? .light : .dark
            self.applyTheme(ThemeManager.shared.currentMode)
        }
        view.settingsDrawer.onAgentChange = { [weak self] _ in
            self?.syncAgentModelLabel()
        }
        syncAgentModelLabel()

        // Apply saved theme mode (default dark)
        applyTheme(ThemeManager.shared.currentMode)

        // Rulers stay hidden unless the persisted preference says otherwise (web default off).
        view.canvasStageView.showRulers = UserDefaults.standard.bool(
            forKey: SettingsDrawerView.showRulersDefaultsKey
        )

        setupKeyMonitoring()
    }

    /// Convenience initializer with custom content view
    public convenience init(contentView: MainContentView) {
        let window = NSWindow(
            contentRect: NSRect(x: 100, y: 100, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: true
        )
        window.contentView = contentView
        self.init(window: window)
    }

    /// Default convenience initializer
    public convenience init() {
        self.init(window: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    // MARK: - Single-Key Tool Switching Event Monitor

    private func setupKeyMonitoring() {
        keyEventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self else { return event }
            if self.handleKeyDown(event) {
                return nil // Event consumed by single-key tool switching
            }
            return event
        }
        keyUpEventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyUp) { [weak self] event in
            guard let self = self else { return event }
            if event.keyCode == 49 {
                self.mainContentView.canvasStageView.endSpacePan()
                return nil
            }
            return event
        }
    }

    public func handleKeyDown(_ event: NSEvent) -> Bool {
        // Space-bar panning works globally for the editor, even before the canvas
        // has keyboard focus (web parity). Let the canvas own the actual gesture.
        if event.keyCode == 49 {
            if mainContentView.isWelcomeOpen
                || !mainContentView.onboardingGuide.isHidden
                || !mainContentView.settingsDrawer.isHidden {
                return false
            }
            if let responder = studioWindow.firstResponder,
               responder is NSText || responder is NSTextView || responder is NSTextField {
                return false
            }
            mainContentView.canvasStageView.beginSpacePan()
            return true
        }

        // 0. Escape dismisses transient overlays and cancels canvas in-flight creation gestures.
        if event.keyCode == 53 {
            mainContentView.canvasStageView.cancelCreation()
            mainContentView.canvasStageView.cancelPathEditing()
            if mainContentView.isAgentPanelOpen {
                setAgentPanelOpen(false)
                return true
            }
            if !mainContentView.settingsDrawer.isHidden {
                mainContentView.hideSettings()
                return true
            }
            if !mainContentView.onboardingGuide.isHidden {
                mainContentView.hideOnboarding()
                return true
            }
            return false
        }

        // Guard against active text editing in first responder
        if let responder = studioWindow.firstResponder {
            if responder is NSText || responder is NSTextView || responder is NSTextField {
                return false
            }
        }

        // Command shortcuts (web / Figma parity): ⌘\ and ⌘J for Agent panel, ⌘] / ⌘[ for front / back
        if event.modifierFlags.contains(.command) && !event.modifierFlags.contains(.shift) && !event.modifierFlags.contains(.option) {
            if let chars = event.charactersIgnoringModifiers, let first = chars.first {
                if first == "j" || first == "J" || first == "\\" {
                    toggleAgentPanel()
                    return true
                }
                if first == "]" {
                    bringToFrontAction(nil)
                    return true
                }
                if first == "[" {
                    sendToBackAction(nil)
                    return true
                }
            }
        }

        // 1. Guard against system modifier keys (⌘, ⌃, ⌥)
        let relevantModifiers = event.modifierFlags.intersection([.command, .control, .option])
        guard relevantModifiers.isEmpty else { return false }

        // 3. Extract character
        guard let chars = event.charactersIgnoringModifiers, let first = chars.first else {
            return false
        }

        // 4. Arrow-key nudging (1pt, ⇧ = 10pt) for the current selection.
        if let nudge = nudgeSelection(for: event) {
            return nudge
        }

        // 5. Delete / Backspace removes the selection.
        if event.keyCode == 51 || event.keyCode == 117 {
            if !mainContentView.canvasStageView.selectedNodeIds.isEmpty {
                deleteAction(nil)
                return true
            }
        }

        // 5.4 Layer order shortcuts (Figma / VOO web parity): [ = send backward, ] = bring forward
        if first == "]" {
            bringForwardAction(nil)
            return true
        }
        if first == "[" {
            sendBackwardAction(nil)
            return true
        }

        // 5.5 R / O shape tool switching (Figma / VOO web parity)
        if first == "o" || first == "O" {
            mainContentView.canvasStageView.activeShapeSubTool = .ellipse
            mainContentView.toolRail.state.selectTool(.shapes)
            mainContentView.toolRail.updateSelection()
            didSelectTool(.shapes)
            return true
        }
        if first == "r" || first == "R" {
            mainContentView.canvasStageView.activeShapeSubTool = .rect
            mainContentView.toolRail.state.selectTool(.shapes)
            mainContentView.toolRail.updateSelection()
            didSelectTool(.shapes)
            return true
        }

        // 6. Dispatch to ToolRail
        if let tool = mainContentView.toolRail.state.handleShortcutKey(first) {
            mainContentView.toolRail.updateSelection()
            didSelectTool(tool)
            return true
        }

        return false
    }

    /// Moves the selected layers with the arrow keys (⇧ = 10pt). Recorded as one
    /// undoable command per key press, matching Figma / VOO behaviour.
    private func nudgeSelection(for event: NSEvent) -> Bool? {
        let directions: [UInt16: CGPoint] = [
            123: CGPoint(x: -1, y: 0),
            124: CGPoint(x: 1, y: 0),
            125: CGPoint(x: 0, y: 1),
            126: CGPoint(x: 0, y: -1)
        ]
        guard let direction = directions[event.keyCode] else { return nil }
        let selected = mainContentView.canvasStageView.selectedNodeIds
        guard !selected.isEmpty else { return false }
        let step: CGFloat = event.modifierFlags.contains(.shift) ? 10 : 1
        let delta = CGPoint(x: direction.x * step, y: direction.y * step)
        let nodes = mainContentView.canvasStageView.document.nodes
        for id in selected {
            guard nodes.contains(where: { $0.id == id }) else { continue }
            let cmd = BasicCommand(
                name: "移动图层",
                execute: { doc in
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                    doc.nodes[i].x += delta.x
                    doc.nodes[i].y += delta.y
                    return true
                },
                undo: { doc in
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                    doc.nodes[i].x -= delta.x
                    doc.nodes[i].y -= delta.y
                    return true
                }
            )
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        }
        refreshAfterDocumentMutation()
        return true
    }

    deinit {
        studioWindow.close()
        if let monitor = keyEventMonitor {
            NSEvent.removeMonitor(monitor)
            keyEventMonitor = nil
        }
        if let monitor = keyUpEventMonitor {
            NSEvent.removeMonitor(monitor)
            keyUpEventMonitor = nil
        }
    }

    // MARK: - AppTitleBarDelegate

    public func titleBar(_ titleBar: AppTitleBar, didChangeTitle newTitle: String) {}
    public func titleBarDidRequestUndo(_ titleBar: AppTitleBar) {
        delegate?.didRequestUndo()
    }
    public func titleBarDidRequestRedo(_ titleBar: AppTitleBar) {
        delegate?.didRequestRedo()
    }
    public func titleBarDidRequestExport(_ titleBar: AppTitleBar) {
        saveDocument(nil)
    }
    public func titleBarDidClickZoom(_ titleBar: AppTitleBar) {
        mainContentView.canvasStageView.zoomActual()
    }
    public func titleBarDidRequestNewProject(_ titleBar: AppTitleBar) {
        newDocument(nil)
        mainContentView.isWelcomeOpen = false
        setAgentPanelOpen(false)
    }
    public func titleBarDidRequestCloseProject(_ titleBar: AppTitleBar) {
        mainContentView.isWelcomeOpen = true
        setAgentPanelOpen(false)
    }
    public func titleBarDidRequestSettings(_ titleBar: AppTitleBar) {
        showSettingsMenu()
    }
    public func titleBarDidRequestOpenDocument(_ titleBar: AppTitleBar) {
        openDocument(nil)
    }
    public func showSettingsAction(_ sender: Any?) {
        showSettingsMenu()
    }
    public func toggleAgentPanelAction(_ sender: Any?) {
        toggleAgentPanel()
    }

    public func toggleGridAction(_ sender: Any?) {
        let stage = mainContentView.canvasStageView
        stage.showGrid.toggle()
        mainContentView.bottomZoomBar.setGridEnabled(stage.showGrid)
        showChromeToast(stage.showGrid ? "网格已开启" : "网格已关闭")
    }

    public func toggleSnappingAction(_ sender: Any?) {
        let stage = mainContentView.canvasStageView
        stage.isSnappingEnabled.toggle()
        mainContentView.bottomZoomBar.setSnapToGridEnabled(stage.isSnappingEnabled)
        showChromeToast(stage.isSnappingEnabled ? "磁性吸附已开启" : "磁性吸附已关闭")
    }

    // MARK: - InspectorDelegate (properties card + layers interactions)

    public func inspectorDidSelectNode(id: String) {
        mainContentView.canvasStageView.selectNode(id: id)
        mainContentView.canvasStageView.needsDisplay = true
    }

    public func inspectorDidChangeNodeGeometry(id: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, rotation: CGFloat, cornerRadius: CGFloat?) {
        guard let idx = mainContentView.canvasStageView.document.nodes.firstIndex(where: { $0.id == id }) else { return }
        let oldNode = mainContentView.canvasStageView.document.nodes[idx]

        // Geometry: undoable transform command.
        let cmd = TransformNodeCommand(nodeId: id, x: x, y: y, width: width, height: height, rotation: rotation)
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        if oldNode.kind == .frame, oldNode.width != width || oldNode.height != height {
            mainContentView.canvasStageView.applyConstraints(
                frameId: id,
                previousFrame: CGRect(x: oldNode.x, y: oldNode.y, width: oldNode.width, height: oldNode.height)
            )
        }

        // Corner radius: keep it on the node (rounded rect) and record through a
        // lightweight style-preserving command so undo restores it too.
        if let cr = cornerRadius {
            if let nowIdx = mainContentView.canvasStageView.document.nodes.firstIndex(where: { $0.id == id }) {
                let radii = CornerRadii(uniform: max(0, cr))
                let newNode = mainContentView.canvasStageView.document.nodes[nowIdx]
                let radiusCmd = BasicCommand(
                    name: "修改圆角",
                    execute: { doc in
                        guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                        doc.nodes[i].cornerRadii = radii
                        return true
                    },
                    undo: { doc in
                        guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                        doc.nodes[i].cornerRadii = oldNode.cornerRadii
                        return true
                    }
                )
                _ = commandManager.execute(radiusCmd, on: &mainContentView.canvasStageView.document)
                _ = newNode
            }
        }
        refreshAfterDocumentMutation()
    }

    public func inspectorDidChangeConstraints(id: String, horizontal: String, vertical: String) {
        guard let index = mainContentView.canvasStageView.document.nodes.firstIndex(where: { $0.id == id }) else { return }
        let previous = mainContentView.canvasStageView.document.nodes[index].constraints
        let updated = NodeConstraints(horizontal: horizontal, vertical: vertical)
        let cmd = BasicCommand(
            name: "修改约束",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i].constraints = updated
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i].constraints = previous
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    public func inspectorDidChangeNodeStyle(id: String, fill: String, stroke: String, strokeWidth: CGFloat, opacity: CGFloat, blendMode: String) {
        guard let idx = mainContentView.canvasStageView.document.nodes.firstIndex(where: { $0.id == id }) else { return }
        let old = mainContentView.canvasStageView.document.nodes[idx].style
        var new = old
        new.fill = fill
        new.stroke = stroke
        new.strokeWidth = strokeWidth
        new.opacity = opacity
        new.blendMode = blendMode
        guard new != old else { return }
        let cmd = UpdateStyleCommand(nodeId: id, newStyle: new)
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    public func inspectorDidChangeTextFormatting(id: String, fontWeight: String, textAlign: String,
                                                 lineHeight: CGFloat, letterSpacing: CGFloat) {
        guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { return }
        let oldWeight = node.fontWeight
        let oldAlign = node.textAlign
        let oldLineHeight = node.lineHeight
        let oldSpacing = node.letterSpacing
        guard oldWeight != fontWeight || oldAlign != textAlign ||
              oldLineHeight != lineHeight || oldSpacing != letterSpacing else { return }
        let cmd = BasicCommand(
            name: "修改文本格式",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i].fontWeight = fontWeight
                doc.nodes[i].textAlign = textAlign
                doc.nodes[i].lineHeight = lineHeight
                doc.nodes[i].letterSpacing = letterSpacing
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i].fontWeight = oldWeight
                doc.nodes[i].textAlign = oldAlign
                doc.nodes[i].lineHeight = oldLineHeight
                doc.nodes[i].letterSpacing = oldSpacing
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    public func inspectorDidChangeTextTypography(id: String, fontFamily: String, fontSize: CGFloat) {
        guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { return }
        let oldFamily = node.fontFamily
        let oldSize = node.fontSize
        guard oldFamily != fontFamily || oldSize != fontSize else { return }
        let cmd = BasicCommand(
            name: "修改字体",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i].fontFamily = fontFamily
                doc.nodes[i].fontSize = fontSize
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { return false }
                doc.nodes[i].fontFamily = oldFamily
                doc.nodes[i].fontSize = oldSize
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    public func inspectorDidToggleVisibility(id: String, visible: Bool) {
        guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { return }
        let change = NodeStylePropertyChange.visible(old: node.style.visible, new: visible)
        let cmd = StyleChangeCommand(nodeId: id, change: change, name: "切换可见性")
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    public func inspectorDidToggleLock(id: String, locked: Bool) {
        guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { return }
        let change = NodeStylePropertyChange.locked(old: node.style.locked, new: locked)
        let cmd = StyleChangeCommand(nodeId: id, change: change, name: "切换锁定")
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    // MARK: - StudioDelegate

    public func didSelectTool(_ tool: StudioToolType) {
        // Selecting a standard tool leaves the lasso/wand/hand modes and — most
        // importantly — drives the canvas drawing/selection engine.
        mainContentView.canvasStageView.activeTool = tool
        mainContentView.canvasStageView.selectionStyle = .marquee
        mainContentView.canvasStageView.panModeEnabled = false
        mainContentView.toolRail.setAccessoryActive(nil)
        delegate?.didSelectTool(tool)
    }

    /// Hand / Lasso / Magic Wand accessory buttons from the web tool rail.
    public func activateAccessoryTool(_ accessory: ToolRailAccessory) {
        let stage = mainContentView.canvasStageView
        switch accessory {
        case .hand:
            let enable = !stage.panModeEnabled
            stage.panModeEnabled = enable
            stage.selectionStyle = .marquee
            mainContentView.toolRail.setAccessoryActive(enable ? .hand : nil)
            if enable {
                mainContentView.toolRail.state.selectTool(.move)
                stage.activeTool = .move
                mainContentView.toolRail.updateSelection()
                showChromeToast("抓手工具：拖拽平移画布")
            }
        case .lasso:
            stage.panModeEnabled = false
            stage.selectionStyle = .lasso
            mainContentView.toolRail.state.selectTool(.move)
            stage.activeTool = .move
            mainContentView.toolRail.updateSelection()
            mainContentView.toolRail.setAccessoryActive(.lasso)
            showChromeToast("套索选择：拖拽圈选图层")
        case .wand:
            stage.panModeEnabled = false
            stage.selectionStyle = .wand
            mainContentView.toolRail.state.selectTool(.move)
            stage.activeTool = .move
            mainContentView.toolRail.updateSelection()
            mainContentView.toolRail.setAccessoryActive(.wand)
            showChromeToast("魔棒选择：点击选中相同填充色的图层")
        }
    }
    public func didChangeZoom(_ zoom: CGFloat) {
        delegate?.didChangeZoom(zoom)
    }
    public func didRequestUndo() {
        undoAction(nil)
        delegate?.didRequestUndo()
    }
    public func didRequestRedo() {
        redoAction(nil)
        delegate?.didRequestRedo()
    }

    // MARK: - StudioMenuActions Implementation

    /// Restores a newer local recovery copy after a crash (silent when disabled).
    public func restoreDraftIfAvailable() {
        guard let draft = DraftAutosave.shared.recoverableDrafts().first,
              let document = DraftAutosave.shared.loadDraft(draft) else { return }
        mainContentView.canvasStageView.document = document
        mainContentView.canvasStageView.clearSelection()
        commandManager.clear()
        currentFileURL = draft.originalFileURL
        mainContentView.titleBar.setDocumentTitle(document.title)
        mainContentView.inspector.layersPanel.configure(with: document.nodes, selectedId: nil)
        mainContentView.inspector.setPropertiesVisible(false)
        syncChromeState()
        DraftAutosave.shared.discard(draft)
        showChromeToast("已恢复上次未保存的草稿")
    }

    public func newDocument(_ sender: Any?) {
        // Web `newVooProject` → `promoteFixedPageToFrame("Frame")`: a 1200x800 frame
        // named "Frame" whose background child carries the page colour.
        var doc = VOODocument()
        doc.title = "Design 1"
        doc.canvas = CanvasFrame(x: 0, y: 0, width: 1200, height: 800, backgroundColor: "#171717")
        let artboard = VOONode(
            id: "design_1",
            kind: .frame,
            name: "Frame",
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
            // Web `promoteFixedPageToFrame`: frame stroke stays null and the outline
            // seen on screen is the 1px selection border drawn by the stage.
            style: LayerStyle(fill: "#171717", stroke: "none", strokeWidth: 1.0)
        )
        // The web layer list also shows a "Background" child carrying the page colour;
        // the frame fill already paints that surface, so no extra node is inserted
        // (a child would paint over the frame and change the artboard colour).
        doc.nodes = [artboard]
        mainContentView.canvasStageView.document = doc
        mainContentView.canvasStageView.clearSelection()
        commandManager.clear()
        currentFileURL = nil
        mainContentView.titleBar.setDocumentTitle("Design 1")
        mainContentView.inspector.layersPanel.configure(with: doc.nodes, selectedId: nil)
        mainContentView.inspector.setPropertiesVisible(false)
        mainContentView.canvasStageView.setPaintNode(id: nil, dataURL: nil)
        // Match the web "Design 1" empty document: 1200x800 artboard at 58%.
        let stage = mainContentView.canvasStageView
        let targetZoom: CGFloat = 0.58
        stage.zoom = targetZoom
        let availW = max(0, stage.bounds.width - 80)
        let availH = max(0, stage.bounds.height - 80)
        stage.panOffset = CGPoint(
            x: (availW - doc.canvas.width * targetZoom) / 2.0 + 40.0,
            y: (availH - doc.canvas.height * targetZoom) / 2.0 + 40.0
        )
        syncChromeState()
        DispatchQueue.main.async { [weak self] in self?.focusCanvas() }
    }

    public func openDocument(_ sender: Any?) {
        DocumentIO.shared.promptOpenDocument(window: studioWindow) { [weak self] result in
            switch result {
            case .success(let url):
                self?.openDocumentFromURL(url)
            case .failure(let err):
                NSLog("[WindowController] openDocument cancelled or error: %@", err.localizedDescription)
            }
        }
    }

    public func importImageAction(_ sender: Any?) {
        ImageImporter.shared.promptImport(window: studioWindow) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let url):
                self.importImage(from: url)
            case .failure:
                break
            }
        }
    }

    /// Imports an image into the current document (undoable) and selects it.
    public func importImage(from url: URL) {
        do {
            let canvas = mainContentView.canvasStageView.document.canvas
            let existing = mainContentView.canvasStageView.document.nodes.filter { $0.kind == .image }.count
            let imported = try ImageImporter.shared.makeNode(from: url, canvas: canvas, existingImageCount: existing)
            let cmd = InsertNodeCommand(node: imported.node)
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
            mainContentView.canvasStageView.selectedNodeIds = [imported.node.id]
            mainContentView.canvasStageView.needsDisplay = true
            refreshAfterDocumentMutation()
            showChromeToast("已导入图片: \(url.lastPathComponent)")
        } catch {
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    public func openDocumentFromURL(_ url: URL) {
        do {
            let doc = try DocumentIO.shared.loadDocument(from: url)
            mainContentView.canvasStageView.document = doc
            mainContentView.canvasStageView.clearSelection()
            commandManager.clear()
            currentFileURL = url
            mainContentView.titleBar.setDocumentTitle((url.lastPathComponent as NSString).deletingPathExtension)
            mainContentView.inspector.layersPanel.configure(with: doc.nodes, selectedId: nil)
            mainContentView.canvasStageView.zoomToFit()
            refreshPaintLayerFromDocument()
            focusCanvas()
        } catch {
            NSLog("[WindowController] Failed to load document from %@: %@", url.path, error.localizedDescription)
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    public func saveDocument(_ sender: Any?) {
        if let url = currentFileURL {
            do {
                try DocumentIO.shared.saveDocument(mainContentView.canvasStageView.document, to: url)
                // The work is on disk now, so the recovery copy is no longer needed.
                DraftAutosave.shared.flush(document: mainContentView.canvasStageView.document,
                                           currentFileURL: currentFileURL)
                if let draft = DraftAutosave.shared.recoverableDrafts().first,
                   draft.originalFileURL?.standardizedFileURL == url.standardizedFileURL {
                    DraftAutosave.shared.discard(draft)
                }
            } catch {
                let alert = NSAlert(error: error)
                alert.runModal()
            }
        } else {
            saveDocumentAs(sender)
        }
    }

    public func saveDocumentAs(_ sender: Any?) {
        let suggested = currentFileURL?.lastPathComponent ?? "Untitled.voo"
        DocumentIO.shared.promptSaveDocument(suggestedName: suggested, window: studioWindow) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let url):
                do {
                    try DocumentIO.shared.saveDocument(self.mainContentView.canvasStageView.document, to: url)
                    self.currentFileURL = url
                    self.mainContentView.titleBar.setDocumentTitle((url.lastPathComponent as NSString).deletingPathExtension)
                } catch {
                    let alert = NSAlert(error: error)
                    alert.runModal()
                }
            case .failure:
                break
            }
        }
    }

    public func exportDocument(_ sender: Any?) {
        let document = mainContentView.canvasStageView.document

        // VOO-style export sheet: format + scale, then the native save panel.
        let alert = NSAlert()
        alert.messageText = "导出设计 (Export)"
        alert.informativeText = "选择导出格式与缩放倍率。PNG / JPG 支持 1x–4x，PDF / SVG 为矢量输出。"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "导出…")
        alert.addButton(withTitle: "取消")

        let accessory = NSView(frame: NSRect(x: 0, y: 0, width: 280, height: 66))

        let formatLabel = NSTextField(labelWithString: "格式")
        formatLabel.frame = NSRect(x: 0, y: 40, width: 40, height: 20)
        formatLabel.font = ThemeFonts.system(size: 11)
        accessory.addSubview(formatLabel)

        let formatPopup = NSPopUpButton(frame: NSRect(x: 48, y: 36, width: 100, height: 26), pullsDown: false)
        formatPopup.addItems(withTitles: ExportFormat.allCases.map { $0.rawValue })
        formatPopup.selectItem(at: 0)
        accessory.addSubview(formatPopup)

        let scaleLabel = NSTextField(labelWithString: "倍率")
        scaleLabel.frame = NSRect(x: 164, y: 40, width: 40, height: 20)
        scaleLabel.font = ThemeFonts.system(size: 11)
        accessory.addSubview(scaleLabel)

        let scalePopup = NSPopUpButton(frame: NSRect(x: 208, y: 36, width: 68, height: 26), pullsDown: false)
        scalePopup.addItems(withTitles: ["1x", "2x", "3x", "4x"])
        scalePopup.selectItem(at: 1)
        accessory.addSubview(scalePopup)

        alert.accessoryView = accessory
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        let formatIndex = max(0, formatPopup.indexOfSelectedItem)
        let format = ExportFormat.allCases[min(formatIndex, ExportFormat.allCases.count - 1)]
        let scale = CGFloat(max(1, scalePopup.indexOfSelectedItem + 1))
        var options = ExportOptions(format: format, scale: scale)
        options.transparentBackground = false

        let baseName = (document.title as NSString).deletingPathExtension
        let panel = NSSavePanel()
        panel.allowedContentTypes = [format.contentType]
        panel.nameFieldStringValue = "\(baseName.isEmpty ? "Export" : baseName).\(format.fileExtension)"
        panel.prompt = "导出 (Export)"
        panel.beginSheetModal(for: studioWindow) { [weak self] response in
            guard response == .OK, let url = panel.url, let self = self else { return }
            do {
                try ExportEngine.shared.write(document: self.mainContentView.canvasStageView.document,
                                             options: options,
                                             to: url)
                self.showChromeToast("已导出: \(url.lastPathComponent)")
            } catch {
                let errorAlert = NSAlert(error: error)
                errorAlert.runModal()
            }
        }
    }

    public func undoAction(_ sender: Any?) {
        guard commandManager.canUndo else { return }
        if commandManager.undo(on: &mainContentView.canvasStageView.document) {
            refreshPaintLayerFromDocument()
            refreshAfterDocumentMutation()
        }
    }

    public func redoAction(_ sender: Any?) {
        guard commandManager.canRedo else { return }
        if commandManager.redo(on: &mainContentView.canvasStageView.document) {
            refreshPaintLayerFromDocument()
            refreshAfterDocumentMutation()
        }
    }

    public func cutAction(_ sender: Any?) {
        copyAction(sender)
        deleteAction(sender)
    }

    public func copyAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }
        let nodes = mainContentView.canvasStageView.document.nodes.filter { selectedIds.contains($0.id) }
        _ = ClipboardManager.shared.copyNodes(nodes)
    }

    public func pasteAction(_ sender: Any?) {
        guard let pastedNodes = ClipboardManager.shared.pasteNodes() else {
            // Fall back to an image on the system pasteboard (screenshot / copied image).
            let pasteboard = NSPasteboard.general
            let imageTypes: [NSPasteboard.PasteboardType] = [.png, .tiff]
            for type in imageTypes {
                if let data = pasteboard.data(forType: type) {
                    let canvas = mainContentView.canvasStageView.document.canvas
                    importImageData(data, name: "Pasted Image",
                                    at: CGPoint(x: canvas.x + canvas.width / 2.0,
                                                y: canvas.y + canvas.height / 2.0))
                    return
                }
            }
            return
        }
        var pastedIds = Set<String>()
        for node in pastedNodes {
            let cmd = InsertNodeCommand(node: node)
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
            pastedIds.insert(node.id)
        }
        mainContentView.canvasStageView.selectedNodeIds = pastedIds
        refreshAfterDocumentMutation()
    }

    public func deleteAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }
        for id in selectedIds {
            let cmd = DeleteNodeCommand(nodeId: id)
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        }
        mainContentView.canvasStageView.clearSelection()
        refreshAfterDocumentMutation()
    }

    public func duplicateAction(_ sender: Any?) {
        copyAction(sender)
        pasteAction(sender)
    }

    public func selectAllAction(_ sender: Any?) {
        let allIds = Set(mainContentView.canvasStageView.document.nodes.filter { $0.style.visible && !$0.style.locked }.map { $0.id })
        mainContentView.canvasStageView.selectedNodeIds = allIds
        refreshAfterDocumentMutation()
    }

    public func deselectAllAction(_ sender: Any?) {
        mainContentView.canvasStageView.clearSelection()
        refreshAfterDocumentMutation()
    }

    @objc public func groupAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard selectedIds.count >= 2 else { return }
        let selectedNodes = mainContentView.canvasStageView.document.nodes.filter { selectedIds.contains($0.id) }
        let minX = selectedNodes.map { $0.x }.min() ?? 0
        let minY = selectedNodes.map { $0.y }.min() ?? 0
        let maxX = selectedNodes.map { $0.x + $0.width }.max() ?? 100
        let maxY = selectedNodes.map { $0.y + $0.height }.max() ?? 100

        // Determine if selected nodes share a common parent Frame (prevent detaching from Frame)
        let commonParentId = selectedNodes.first?.parentId
        let sharesParent = selectedNodes.allSatisfy { $0.parentId == commonParentId }
        let parentFrameId = sharesParent ? commonParentId : nil

        let groupId = UUID().uuidString
        let groupNode = VOONode(
            id: groupId,
            parentId: parentFrameId,
            kind: .group,
            name: "Group",
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            childIds: Array(selectedIds)
        )

        let cmd = BasicCommand(
            name: "编组",
            execute: { doc in
                doc.nodes.append(groupNode)
                for idx in doc.nodes.indices {
                    if selectedIds.contains(doc.nodes[idx].id) {
                        doc.nodes[idx].parentId = groupId
                    }
                }
                return true
            },
            undo: { doc in
                doc.nodes.removeAll(where: { $0.id == groupId })
                for idx in doc.nodes.indices {
                    if selectedIds.contains(doc.nodes[idx].id) {
                        doc.nodes[idx].parentId = parentFrameId
                    }
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        mainContentView.canvasStageView.selectedNodeIds = [groupId]
        refreshAfterDocumentMutation()
    }

    @objc public func ungroupAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard let firstId = selectedIds.first,
              let groupNode = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == firstId && $0.kind == .group }) else { return }

        let parentId = groupNode.parentId
        let childIds = Set(groupNode.childIds ?? [])

        let cmd = BasicCommand(
            name: "取消编组",
            execute: { doc in
                // 1. Reparent children to group's parent Frame / container (prevents dismantling ancestor Frame)
                for idx in doc.nodes.indices {
                    if childIds.contains(doc.nodes[idx].id) {
                        doc.nodes[idx].parentId = parentId
                    }
                }
                // 2. Remove group node
                doc.nodes.removeAll(where: { $0.id == groupNode.id })
                return true
            },
            undo: { doc in
                // 1. Restore group node
                doc.nodes.append(groupNode)
                // 2. Repoint children back to group
                for idx in doc.nodes.indices {
                    if childIds.contains(doc.nodes[idx].id) {
                        doc.nodes[idx].parentId = groupNode.id
                    }
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        mainContentView.canvasStageView.selectedNodeIds = childIds
        refreshAfterDocumentMutation()
    }

    @objc public func booleanUnionAction(_ sender: Any?) {
        performBoolean(.union, name: "Union")
    }

    @objc public func booleanSubtractAction(_ sender: Any?) {
        performBoolean(.subtract, name: "Subtract")
    }

    @objc public func booleanIntersectAction(_ sender: Any?) {
        performBoolean(.intersect, name: "Intersect")
    }

    @objc public func booleanXorAction(_ sender: Any?) {
        performBoolean(.xor, name: "Xor")
    }

    @objc public func booleanDivideAction(_ sender: Any?) {
        performBoolean(.divide, name: "Divide")
    }

    @objc public func convertToCurvesAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }

        var beforeNodes: [String: VOONode] = [:]
        var afterNodes: [String: VOONode] = [:]

        for id in selectedIds {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            beforeNodes[id] = node
            afterNodes[id] = CurveConversionEngine.convertToCurves(node: node)
        }

        let cmd = BasicCommand(name: "Convert to Curves", execute: { doc in
            for (id, after) in afterNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = after
                }
            }
            return true
        }, undo: { doc in
            for (id, before) in beforeNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = before
                }
            }
            return true
        })

        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    @objc public func closeCurveAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }

        var beforeNodes: [String: VOONode] = [:]
        var afterNodes: [String: VOONode] = [:]

        for id in selectedIds {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            beforeNodes[id] = node
            var mut = node
            GeometryEngine.closeCurve(in: &mut)
            afterNodes[id] = mut
        }

        let cmd = BasicCommand(name: "Close Curve", execute: { doc in
            for (id, after) in afterNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = after
                }
            }
            return true
        }, undo: { doc in
            for (id, before) in beforeNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = before
                }
            }
            return true
        })

        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    @objc public func reverseCurveAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }

        var beforeNodes: [String: VOONode] = [:]
        var afterNodes: [String: VOONode] = [:]

        for id in selectedIds {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            beforeNodes[id] = node
            var mut = node
            GeometryEngine.reverseCurve(in: &mut)
            afterNodes[id] = mut
        }

        let cmd = BasicCommand(name: "Reverse Curve", execute: { doc in
            for (id, after) in afterNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = after
                }
            }
            return true
        }, undo: { doc in
            for (id, before) in beforeNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = before
                }
            }
            return true
        })

        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    @objc public func smoothCurveAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }

        var beforeNodes: [String: VOONode] = [:]
        var afterNodes: [String: VOONode] = [:]

        for id in selectedIds {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            beforeNodes[id] = node
            var mut = node
            GeometryEngine.smoothCurve(in: &mut)
            afterNodes[id] = mut
        }

        let cmd = BasicCommand(name: "Smooth Curve", execute: { doc in
            for (id, after) in afterNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = after
                }
            }
            return true
        }, undo: { doc in
            for (id, before) in beforeNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = before
                }
            }
            return true
        })

        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    @objc public func flipHorizontalAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }

        var beforeNodes: [String: VOONode] = [:]
        var afterNodes: [String: VOONode] = [:]

        for id in selectedIds {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            beforeNodes[id] = node
            var flipped = node
            if let pts = node.points, !pts.isEmpty {
                flipped.points = pts.map { pt in
                    var p = pt
                    p.x = 2 * node.x + node.width - pt.x
                    if let inh = pt.inHandle {
                        p.inHandle = CGPoint(x: 2 * node.x + node.width - inh.x, y: inh.y)
                    }
                    if let outh = pt.outHandle {
                        p.outHandle = CGPoint(x: 2 * node.x + node.width - outh.x, y: outh.y)
                    }
                    return p
                }
            } else {
                var curveNode = CurveConversionEngine.convertToCurves(node: node)
                if let pts = curveNode.points {
                    curveNode.points = pts.map { pt in
                        var p = pt
                        p.x = 2 * node.x + node.width - pt.x
                        if let inh = pt.inHandle {
                            p.inHandle = CGPoint(x: 2 * node.x + node.width - inh.x, y: inh.y)
                        }
                        if let outh = pt.outHandle {
                            p.outHandle = CGPoint(x: 2 * node.x + node.width - outh.x, y: outh.y)
                        }
                        return p
                    }
                }
                flipped = curveNode
            }
            afterNodes[id] = flipped
        }

        let cmd = BasicCommand(name: "Flip Horizontal", execute: { doc in
            for (id, after) in afterNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = after
                }
            }
            return true
        }, undo: { doc in
            for (id, before) in beforeNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = before
                }
            }
            return true
        })

        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    @objc public func flipVerticalAction(_ sender: Any?) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }

        var beforeNodes: [String: VOONode] = [:]
        var afterNodes: [String: VOONode] = [:]

        for id in selectedIds {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            beforeNodes[id] = node
            var flipped = node
            if let pts = node.points, !pts.isEmpty {
                flipped.points = pts.map { pt in
                    var p = pt
                    p.y = 2 * node.y + node.height - pt.y
                    if let inh = pt.inHandle {
                        p.inHandle = CGPoint(x: inh.x, y: 2 * node.y + node.height - inh.y)
                    }
                    if let outh = pt.outHandle {
                        p.outHandle = CGPoint(x: outh.x, y: 2 * node.y + node.height - outh.y)
                    }
                    return p
                }
            } else {
                var curveNode = CurveConversionEngine.convertToCurves(node: node)
                if let pts = curveNode.points {
                    curveNode.points = pts.map { pt in
                        var p = pt
                        p.y = 2 * node.y + node.height - pt.y
                        if let inh = pt.inHandle {
                            p.inHandle = CGPoint(x: inh.x, y: 2 * node.y + node.height - inh.y)
                        }
                        if let outh = pt.outHandle {
                            p.outHandle = CGPoint(x: outh.x, y: 2 * node.y + node.height - outh.y)
                        }
                        return p
                    }
                }
                flipped = curveNode
            }
            afterNodes[id] = flipped
        }

        let cmd = BasicCommand(name: "Flip Vertical", execute: { doc in
            for (id, after) in afterNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = after
                }
            }
            return true
        }, undo: { doc in
            for (id, before) in beforeNodes {
                if let idx = doc.nodes.firstIndex(where: { $0.id == id }) {
                    doc.nodes[idx] = before
                }
            }
            return true
        })

        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    @objc public func toggleLockAction(_ sender: Any?) {
        for id in mainContentView.canvasStageView.selectedNodeIds {
            if let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) {
                inspectorDidToggleLock(id: id, locked: !node.style.locked)
            }
        }
    }

    @objc public func toggleVisibilityAction(_ sender: Any?) {
        for id in mainContentView.canvasStageView.selectedNodeIds {
            if let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) {
                inspectorDidToggleVisibility(id: id, visible: !node.style.visible)
            }
        }
    }

    @objc public func copySvgAction(_ sender: Any?) {
        let selectedNodes = mainContentView.canvasStageView.document.nodes.filter {
            mainContentView.canvasStageView.selectedNodeIds.contains($0.id)
        }
        guard !selectedNodes.isEmpty else { return }

        var doc = VOODocument()
        var minX = selectedNodes[0].x, minY = selectedNodes[0].y
        var maxX = selectedNodes[0].x + selectedNodes[0].width, maxY = selectedNodes[0].y + selectedNodes[0].height
        for n in selectedNodes.dropFirst() {
            minX = min(minX, n.x); minY = min(minY, n.y)
            maxX = max(maxX, n.x + n.width); maxY = max(maxY, n.y + n.height)
        }
        doc.canvas = CanvasFrame(x: 0, y: 0, width: max(maxX - minX, 10), height: max(maxY - minY, 10), backgroundColor: "#000000")
        doc.nodes = selectedNodes.map { node in
            var copy = node
            copy.x -= minX
            copy.y -= minY
            if let pts = node.points {
                copy.points = pts.map { pt in
                    var p = pt
                    p.x -= minX
                    p.y -= minY
                    if let inh = pt.inHandle { p.inHandle = CGPoint(x: inh.x - minX, y: inh.y - minY) }
                    if let outh = pt.outHandle { p.outHandle = CGPoint(x: outh.x - minX, y: outh.y - minY) }
                    return p
                }
            }
            return copy
        }

        let svg = DocumentIO.shared.exportToSVG(document: doc)
        let pboard = NSPasteboard.general
        pboard.clearContents()
        pboard.setString(svg, forType: .string)
        showChromeToast("SVG 已复制到剪贴板 (SVG copied)")
    }

    @objc public func copyCodeAction(_ sender: Any?) {
        let selectedNodes = mainContentView.canvasStageView.document.nodes.filter {
            mainContentView.canvasStageView.selectedNodeIds.contains($0.id)
        }
        guard !selectedNodes.isEmpty else { return }

        var code = ""
        for node in selectedNodes {
            code += "// Layer: \(node.name) (\(node.kind.rawValue))\n"
            code += "let view = NSView(frame: NSRect(x: \(node.x), y: \(node.y), width: \(node.width), height: \(node.height)))\n"
            code += "view.wantsLayer = true\n"
            code += "view.layer?.backgroundColor = NSColor(hexString: \"\(node.style.fill)\")?.cgColor\n\n"
        }

        let pboard = NSPasteboard.general
        pboard.clearContents()
        pboard.setString(code, forType: .string)
        showChromeToast("代码已复制到剪贴板 (Code copied)")
    }

    private func performBoolean(_ op: BooleanOperationType, name: String) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        let nodes = mainContentView.canvasStageView.document.nodes.filter { selectedIds.contains($0.id) }
        guard nodes.count >= 2 else { return }

        let subject = nodes[0]
        let clip = nodes[1]
        let results = BooleanTopologyEngine.performBoolean(op: op, subject: subject, clip: clip)

        let indexedInputs = nodes.prefix(2).compactMap { n -> (node: VOONode, index: Int)? in
            guard let idx = mainContentView.canvasStageView.document.nodes.firstIndex(where: { $0.id == n.id }) else { return nil }
            return (n, idx)
        }

        let cmd = BooleanCommand(
            op: op,
            inputNodes: indexedInputs,
            resultNodes: results,
            previousSelectedIds: selectedIds,
            name: "Boolean \(name)"
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        mainContentView.canvasStageView.selectedNodeIds = Set(results.map { $0.id })
        refreshAfterDocumentMutation()
    }

    private func performAlign(_ alignKey: String) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard !selectedIds.isEmpty else { return }
        let nodes = mainContentView.canvasStageView.document.nodes.filter { selectedIds.contains($0.id) }
        guard !nodes.isEmpty else { return }

        // Web `align_layers`: a single layer aligns inside its container (parent
        // frame, else the page canvas); a multi-selection aligns to its own bounds.
        let container: CGRect?
        if nodes.count == 1, let node = nodes.first {
            let all = mainContentView.canvasStageView.document.nodes
            if let parentId = node.parentId, let parent = all.first(where: { $0.id == parentId }) {
                container = CGRect(x: parent.x, y: parent.y, width: parent.width, height: parent.height)
            } else {
                let canvas = mainContentView.canvasStageView.document.canvas
                container = CGRect(x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height)
            }
        } else {
            container = nil
        }

        let minX = container?.minX ?? nodes.map { $0.x }.min() ?? 0
        let maxX = container?.maxX ?? nodes.map { $0.x + $0.width }.max() ?? 0
        let minY = container?.minY ?? nodes.map { $0.y }.min() ?? 0
        let maxY = container?.maxY ?? nodes.map { $0.y + $0.height }.max() ?? 0
        let midX = (minX + maxX) / 2.0
        let midY = (minY + maxY) / 2.0

        var before: [String: CGRect] = [:]
        var after: [String: CGRect] = [:]
        for node in nodes {
            let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            before[node.id] = rect
            var updated = rect
            switch alignKey {
            case "left": updated.origin.x = minX
            case "center": updated.origin.x = midX - updated.width / 2.0
            case "right": updated.origin.x = maxX - updated.width
            case "top": updated.origin.y = maxY - updated.height
            case "middle": updated.origin.y = midY - updated.height / 2.0
            case "bottom": updated.origin.y = minY
            default: break
            }
            after[node.id] = updated
        }
        guard before != after else { return }
        let cmd = BasicCommand(
            name: "对齐图层",
            execute: { doc in
                for (id, rect) in after {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                }
                return true
            },
            undo: { doc in
                for (id, rect) in before {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    /// Distributes the selected layers evenly between the first and last layer,
    /// preserving the outermost positions (Figma / VOO behaviour).
    private func performDistribute(horizontal: Bool) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard selectedIds.count >= 3 else { return }
        let nodes = mainContentView.canvasStageView.document.nodes.filter { selectedIds.contains($0.id) }
        guard nodes.count >= 3 else { return }

        let sorted = nodes.sorted {
            horizontal ? ($0.x + $0.width / 2.0) < ($1.x + $1.width / 2.0)
                       : ($0.y + $0.height / 2.0) < ($1.y + $1.height / 2.0)
        }
        let first = sorted.first!
        let last = sorted.last!
        var before: [String: CGRect] = [:]
        var after: [String: CGRect] = [:]
        for node in sorted {
            before[node.id] = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
        }
        let startCenter = horizontal ? first.x + first.width / 2.0 : first.y + first.height / 2.0
        let endCenter = horizontal ? last.x + last.width / 2.0 : last.y + last.height / 2.0
        let step = (endCenter - startCenter) / CGFloat(sorted.count - 1)
        for (index, node) in sorted.enumerated() {
            var rect = before[node.id]!
            if index > 0 && index < sorted.count - 1 {
                let center = startCenter + step * CGFloat(index)
                if horizontal { rect.origin.x = center - rect.width / 2.0 }
                else { rect.origin.y = center - rect.height / 2.0 }
            }
            after[node.id] = rect
        }
        guard before != after else { return }
        let cmd = BasicCommand(
            name: "分布图层",
            execute: { doc in
                for (id, rect) in after {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                }
                return true
            },
            undo: { doc in
                for (id, rect) in before {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    private func performNodeTypeChange(_ nodeKey: String) {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard let firstId = selectedIds.first,
              let idx = mainContentView.canvasStageView.document.nodes.firstIndex(where: { $0.id == firstId }) else { return }
        var node = mainContentView.canvasStageView.document.nodes[idx]

        // 1. If node has Bezier curve anchor points, convert the anchor point types (Affinity Curve Engine)
        if var pts = node.points, !pts.isEmpty {
            let targetType: NodeType
            switch nodeKey {
            case "sharp": targetType = .sharp
            case "smooth": targetType = .smooth
            default: targetType = .smart
            }
            for i in 0..<pts.count {
                pts[i].type = targetType
            }
            node.points = pts
        } else {
            // 2. Otherwise update corner radii
            switch nodeKey {
            case "sharp":
                node.cornerRadii = CornerRadii(uniform: 0)
            case "smooth":
                node.cornerRadii = CornerRadii(uniform: 16)
            case "smart":
                node.cornerRadii = CornerRadii(uniform: 24)
            default:
                break
            }
        }

        mainContentView.canvasStageView.document.nodes[idx] = node
        refreshAfterDocumentMutation()
    }

    public func zoomInAction(_ sender: Any?) {
        mainContentView.canvasStageView.zoomIn()
    }

    public func zoomOutAction(_ sender: Any?) {
        mainContentView.canvasStageView.zoomOut()
    }

    public func zoomActualAction(_ sender: Any?) {
        mainContentView.canvasStageView.zoomActual()
    }

    public func zoomFitAction(_ sender: Any?) {
        mainContentView.canvasStageView.zoomFit()
    }

    public func toggleRulersAction(_ sender: Any?) {
        mainContentView.canvasStageView.showRulers.toggle()
        // Persist + let the Settings drawer stay in sync (web `voo.editor.showRulers`).
        UserDefaults.standard.set(
            mainContentView.canvasStageView.showRulers,
            forKey: SettingsDrawerView.showRulersDefaultsKey
        )
        mainContentView.updateIslandBarPosition()
    }

    private func refreshAfterDocumentMutation() {
        let nodes = mainContentView.canvasStageView.document.nodes
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        mainContentView.inspector.layersPanel.configure(with: nodes, selectedId: selectedIds.first)
        if let firstId = selectedIds.first, let node = nodes.first(where: { $0.id == firstId }) {
            mainContentView.inspector.transformPanel.configure(with: node)
            mainContentView.inspector.appearancePanel.configure(with: node)
            mainContentView.inspector.configureProperties(with: node)
        } else {
            mainContentView.inspector.configureProperties(with: nil)
        }
        mainContentView.canvasStageView.needsDisplay = true
        syncChromeState()
        // Local recovery copy (Settings → Appearance → Auto-save edit drafts).
        DraftAutosave.shared.scheduleAutosave(
            document: mainContentView.canvasStageView.document,
            currentFileURL: currentFileURL
        )
    }

    // MARK: - NSMenuItemValidation

    public func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        guard let action = menuItem.action else { return true }

        switch action {
        case #selector(StudioMenuActions.undoAction(_:)):
            return commandManager.canUndo
        case #selector(StudioMenuActions.redoAction(_:)):
            return commandManager.canRedo
        case #selector(StudioMenuActions.cutAction(_:)),
             #selector(StudioMenuActions.copyAction(_:)),
             #selector(StudioMenuActions.deleteAction(_:)),
             #selector(StudioMenuActions.duplicateAction(_:)):
            return !mainContentView.canvasStageView.selectedNodeIds.isEmpty
        case #selector(StudioMenuActions.pasteAction(_:)):
            return ClipboardManager.shared.canPaste
        case #selector(StudioMenuActions.groupAction(_:)):
            return mainContentView.canvasStageView.selectedNodeIds.count >= 2
        case #selector(StudioMenuActions.ungroupAction(_:)):
            guard let firstId = mainContentView.canvasStageView.selectedNodeIds.first,
                  let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == firstId }) else { return false }
            return node.kind == .group
        case #selector(StudioMenuActions.booleanUnionAction(_:)),
             #selector(StudioMenuActions.booleanSubtractAction(_:)),
             #selector(StudioMenuActions.booleanIntersectAction(_:)),
             #selector(StudioMenuActions.booleanXorAction(_:)),
             #selector(StudioMenuActions.booleanDivideAction(_:)):
            return mainContentView.canvasStageView.selectedNodeIds.count >= 2
        default:
            return true
        }
    }

    // MARK: - Demo Showcase Project Generator

    public func loadDemoProject() {
        var doc = VOODocument(title: "Mobile App Dashboard.voo")
        doc.canvas = CanvasFrame(x: 100, y: 80, width: 920, height: 640, backgroundColor: "#0f172a")

        // 1. Mobile Phone Artboard Card
        let phoneCard = VOONode(
            id: "card_phone",
            kind: .rect,
            name: "iPhone Frame",
            x: 160,
            y: 120,
            width: 320,
            height: 540,
            style: LayerStyle(fill: "#1e293b", stroke: "#334155", strokeWidth: 2.0, opacity: 1.0),
            cornerRadii: CornerRadii(uniform: 36.0)
        )

        // 2. Status Bar Notch
        let notch = VOONode(
            id: "notch",
            kind: .rect,
            name: "Dynamic Island",
            x: 270,
            y: 135,
            width: 100,
            height: 24,
            style: LayerStyle(fill: "#000000", stroke: "#000000", strokeWidth: 0, opacity: 1.0),
            cornerRadii: CornerRadii(uniform: 12.0)
        )

        // 3. Header Card
        let headerCard = VOONode(
            id: "header_card",
            kind: .rect,
            name: "Hero Banner",
            x: 180,
            y: 180,
            width: 280,
            height: 140,
            style: LayerStyle(fill: "#3b82f6", stroke: "#60a5fa", strokeWidth: 1.5, opacity: 0.95),
            cornerRadii: CornerRadii(uniform: 20.0)
        )

        // 4. Hero Text
        let heroText = VOONode(
            id: "hero_text",
            kind: .text,
            name: "VOO Native Studio",
            x: 200,
            y: 205,
            width: 240,
            height: 30,
            style: LayerStyle(fill: "#ffffff"),
            text: "VOO Native Studio",
            fontSize: 20.0
        )

        // 5. Subtitle Text
        let subText = VOONode(
            id: "sub_text",
            kind: .text,
            name: "Subtitle",
            x: 200,
            y: 245,
            width: 240,
            height: 24,
            style: LayerStyle(fill: "#93c5fd"),
            text: "Swift 6 + AppKit + Metal",
            fontSize: 13.0
        )

        // 6. Action Button (selected by default to showcase 8-point handles & rotation pin)
        let actionBtn = VOONode(
            id: "action_button",
            kind: .rect,
            name: "CTA Button",
            x: 200,
            y: 280,
            width: 120,
            height: 32,
            style: LayerStyle(fill: "#b2ffd6", stroke: "#ffffff", strokeWidth: 1.0, opacity: 1.0),
            cornerRadii: CornerRadii(uniform: 16.0)
        )

        // 7. Avatar Circle
        let avatar = VOONode(
            id: "avatar_circle",
            kind: .ellipse,
            name: "User Avatar",
            x: 390,
            y: 275,
            width: 44,
            height: 44,
            style: LayerStyle(fill: "#f59e0b", stroke: "#ffffff", strokeWidth: 2.0, opacity: 1.0)
        )

        // 8. Stats Widget on Right
        let statsCard = VOONode(
            id: "stats_card",
            kind: .rect,
            name: "Telemetry Metric",
            x: 520,
            y: 120,
            width: 380,
            height: 240,
            style: LayerStyle(fill: "#18181b", stroke: "#27272a", strokeWidth: 1.5, opacity: 1.0),
            cornerRadii: CornerRadii(uniform: 24.0)
        )

        // 9. Stats Text
        let statsTitle = VOONode(
            id: "stats_title",
            kind: .text,
            name: "Telemetry Header",
            x: 545,
            y: 145,
            width: 330,
            height: 28,
            style: LayerStyle(fill: "#ffffff"),
            text: "Engine Performance",
            fontSize: 17.0
        )

        // 10. Metric Chip 1
        let chip1 = VOONode(
            id: "chip_bundle",
            kind: .rect,
            name: "Bundle Chip",
            x: 545,
            y: 185,
            width: 155,
            height: 64,
            style: LayerStyle(fill: "#27272a", stroke: "#3f3f46", strokeWidth: 1.0),
            cornerRadii: CornerRadii(uniform: 12.0)
        )
        let chip1Text = VOONode(
            id: "chip1_text",
            kind: .text,
            name: "Bundle Stat",
            x: 555,
            y: 200,
            width: 135,
            height: 34,
            style: LayerStyle(fill: "#4ade80"),
            text: "Bundle: 2.32 MB",
            fontSize: 14.0
        )

        // 11. Metric Chip 2
        let chip2 = VOONode(
            id: "chip_ram",
            kind: .rect,
            name: "RAM Chip",
            x: 720,
            y: 185,
            width: 155,
            height: 64,
            style: LayerStyle(fill: "#27272a", stroke: "#3f3f46", strokeWidth: 1.0),
            cornerRadii: CornerRadii(uniform: 12.0)
        )
        let chip2Text = VOONode(
            id: "chip2_text",
            kind: .text,
            name: "RAM Stat",
            x: 730,
            y: 200,
            width: 135,
            height: 34,
            style: LayerStyle(fill: "#38bdf8"),
            text: "RAM: ~50 MB",
            fontSize: 14.0
        )

        // 12. Metric Chip 3
        let chip3 = VOONode(
            id: "chip_launch",
            kind: .rect,
            name: "Launch Chip",
            x: 545,
            y: 265,
            width: 330,
            height: 64,
            style: LayerStyle(fill: "#27272a", stroke: "#3f3f46", strokeWidth: 1.0),
            cornerRadii: CornerRadii(uniform: 12.0)
        )
        let chip3Text = VOONode(
            id: "chip3_text",
            kind: .text,
            name: "Launch Stat",
            x: 555,
            y: 280,
            width: 310,
            height: 34,
            style: LayerStyle(fill: "#facc15"),
            text: "Cold Launch: 0.04s",
            fontSize: 14.0
        )

        doc.nodes = [phoneCard, notch, headerCard, heroText, subText, actionBtn, avatar, statsCard, statsTitle, chip1, chip1Text, chip2, chip2Text, chip3, chip3Text]
        doc.guides = [
            GuideLine(axis: "v", position: 160.0),
            GuideLine(axis: "h", position: 120.0)
        ]

        mainContentView.canvasStageView.document = doc
        mainContentView.canvasStageView.showRulers = false
        mainContentView.titleBar.setDocumentTitle((doc.title as NSString).deletingPathExtension)
        mainContentView.isWelcomeOpen = false

        // Select the action button to showcase transform handles & rotation stalk
        mainContentView.canvasStageView.selectNode(id: "action_button")
        refreshAfterDocumentMutation()
        mainContentView.canvasStageView.zoomFit()
        refreshPaintLayerFromDocument()
        focusCanvas()
    }

    /// Loads the clean 1:1 Web App artboard matching docs/screenshots/editor.jpg
    public func loadWebAppProject() {
        var doc = VOODocument()
        doc.title = "Web app"
        doc.canvas = CanvasFrame(x: 0, y: 0, width: 1060, height: 1440)
        let webAppNode = VOONode(
            id: "web_app",
            kind: .frame,
            name: "Web app",
            x: 0,
            y: 0,
            width: 1060,
            height: 1440,
            style: LayerStyle(fill: "#202022", stroke: "#2e2e32", strokeWidth: 1.0, opacity: 1.0, blendMode: "normal")
        )
        doc.nodes = [webAppNode]
        doc.guides = []

        mainContentView.canvasStageView.document = doc
        mainContentView.canvasStageView.showRulers = false
        mainContentView.titleBar.setDocumentTitle("Web app")
        mainContentView.isWelcomeOpen = false

        mainContentView.canvasStageView.selectNode(id: "web_app")
        mainContentView.canvasStageView.zoom = 0.39
        mainContentView.canvasStageView.bottomToolsPill.zoomText = "39%"
        refreshAfterDocumentMutation()
        refreshPaintLayerFromDocument()
        focusCanvas()
    }

    // MARK: - Undoable Canvas Gestures

    private func recordGeometryCommit(before: [String: CGRect], after: [String: CGRect]) {
        guard before != after else { return }
        let cmd = BasicCommand(
            name: "移动图层",
            execute: { doc in
                for (id, rect) in after {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                    doc.nodes[i].width = rect.size.width
                    doc.nodes[i].height = rect.size.height
                }
                return true
            },
            undo: { doc in
                for (id, rect) in before {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                    doc.nodes[i].width = rect.size.width
                    doc.nodes[i].height = rect.size.height
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    private func recordHandleCommit(nodeId: String, beforeRect: CGRect, beforeRotation: CGFloat,
                                    afterRect: CGRect, afterRotation: CGFloat) {
        let isFrame = mainContentView.canvasStageView.document.nodes.first { $0.id == nodeId }?.kind == .frame
        let sizeChanged = beforeRect.size != afterRect.size
        defer {
            // A frame resize re-pins its children according to their constraints
            // (web "Constraints" behaviour); ordinary layers keep their geometry.
            if isFrame && sizeChanged {
                mainContentView.canvasStageView.applyConstraints(frameId: nodeId, previousFrame: beforeRect)
                refreshAfterDocumentMutation()
            }
        }
        let cmd = BasicCommand(
            name: "变换图层",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
                doc.nodes[i].x = afterRect.origin.x
                doc.nodes[i].y = afterRect.origin.y
                doc.nodes[i].width = afterRect.size.width
                doc.nodes[i].height = afterRect.size.height
                doc.nodes[i].rotation = afterRotation
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
                doc.nodes[i].x = beforeRect.origin.x
                doc.nodes[i].y = beforeRect.origin.y
                doc.nodes[i].width = beforeRect.size.width
                doc.nodes[i].height = beforeRect.size.height
                doc.nodes[i].rotation = beforeRotation
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    private func recordMultiTransformCommit(beforeRects: [String: CGRect], afterRects: [String: CGRect],
                                            beforeRotations: [String: CGFloat], afterRotations: [String: CGFloat]) {
        guard beforeRects != afterRects || beforeRotations != afterRotations else { return }
        let cmd = BasicCommand(
            name: "变换多选图层",
            execute: { doc in
                for (id, rect) in afterRects {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                    doc.nodes[i].width = rect.size.width
                    doc.nodes[i].height = rect.size.height
                    if let rotation = afterRotations[id] { doc.nodes[i].rotation = rotation }
                }
                return true
            },
            undo: { doc in
                for (id, rect) in beforeRects {
                    guard let i = doc.nodes.firstIndex(where: { $0.id == id }) else { continue }
                    doc.nodes[i].x = rect.origin.x
                    doc.nodes[i].y = rect.origin.y
                    doc.nodes[i].width = rect.size.width
                    doc.nodes[i].height = rect.size.height
                    if let rotation = beforeRotations[id] { doc.nodes[i].rotation = rotation }
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    private func recordPathPointsCommit(nodeId: String, before: [PenAnchor], after: [PenAnchor]) {
        guard before != after else { return }
        let cmd = BasicCommand(
            name: "编辑路径节点",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
                doc.nodes[i].points = after
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
                doc.nodes[i].points = before
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    /// Imports a dropped/selected image centered on a document point.
    public func importImage(from url: URL, at documentPoint: CGPoint) {
        do {
            let canvas = mainContentView.canvasStageView.document.canvas
            let existing = mainContentView.canvasStageView.document.nodes.filter { $0.kind == .image }.count
            let imported = try ImageImporter.shared.makeNode(from: url, canvas: canvas, existingImageCount: existing)
            let node = imported.node
            let repositioned = VOONode(
                id: node.id,
                kind: node.kind,
                name: node.name,
                x: documentPoint.x - node.width / 2.0,
                y: documentPoint.y - node.height / 2.0,
                width: node.width,
                height: node.height,
                style: node.style,
                src: node.src,
                imageId: node.imageId
            )
            let cmd = InsertNodeCommand(node: repositioned)
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
            mainContentView.canvasStageView.selectedNodeIds = [repositioned.id]
            mainContentView.canvasStageView.needsDisplay = true
            refreshAfterDocumentMutation()
            _ = imported
            showChromeToast("已导入图片: \(url.lastPathComponent)")
        } catch {
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    /// Imports raw image data (e.g. pasted from the system clipboard).
    public func importImageData(_ data: Data, name: String, at documentPoint: CGPoint?) {
        do {
            let canvas = mainContentView.canvasStageView.document.canvas
            let existing = mainContentView.canvasStageView.document.nodes.filter { $0.kind == .image }.count
            let imported = try ImageImporter.shared.makeNode(from: data, name: name, canvas: canvas,
                                                             existingImageCount: existing)
            var node = imported.node
            if let point = documentPoint {
                node.x = point.x - node.width / 2.0
                node.y = point.y - node.height / 2.0
            }
            let cmd = InsertNodeCommand(node: node)
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
            mainContentView.canvasStageView.selectedNodeIds = [node.id]
            mainContentView.canvasStageView.needsDisplay = true
            refreshAfterDocumentMutation()
        } catch {
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    // MARK: - Canvas Context Menu

    private func buildCanvasContextMenu() -> NSMenu {
        let menu = NSMenu()
        let selection = mainContentView.canvasStageView.selectedNodeIds

        let duplicate = NSMenuItem(title: "创建副本 (Duplicate)", action: #selector(duplicateAction(_:)), keyEquivalent: "")
        duplicate.target = self
        menu.addItem(duplicate)

        let copy = NSMenuItem(title: "复制 (Copy)", action: #selector(copyAction(_:)), keyEquivalent: "")
        copy.target = self
        menu.addItem(copy)

        let paste = NSMenuItem(title: "粘贴 (Paste)", action: #selector(pasteAction(_:)), keyEquivalent: "")
        paste.target = self
        paste.isEnabled = ClipboardManager.shared.canPaste
        menu.addItem(paste)

        menu.addItem(NSMenuItem.separator())

        if !selection.isEmpty {
            let delete = NSMenuItem(title: "删除 (Delete)", action: #selector(deleteAction(_:)), keyEquivalent: "")
            delete.target = self
            menu.addItem(delete)

            // Contextual AI Actions
            menu.addItem(NSMenuItem.separator())
            let selectedNodes = mainContentView.canvasStageView.document.nodes.filter { selection.contains($0.id) }
            let hasImage = selectedNodes.contains(where: { $0.kind == .image })
            if hasImage {
                let mattingItem = NSMenuItem(title: "AI 一键抠图去背景 (Remove Background)", action: #selector(aiRemoveBackgroundMenuItemAction(_:)), keyEquivalent: "")
                mattingItem.target = self
                mattingItem.image = VooIconFactory.image(named: .wand, size: NSSize(width: 14, height: 14), color: .labelColor)
                menu.addItem(mattingItem)
            }
            let rewriteItem = NSMenuItem(title: "AI 智能改写与变体 (AI Variant / Rewrite)...", action: #selector(aiRewriteMenuItemAction(_:)), keyEquivalent: "")
            rewriteItem.target = self
            rewriteItem.image = VooIconFactory.image(named: .sparkles, size: NSSize(width: 14, height: 14), color: .labelColor)
            menu.addItem(rewriteItem)
            menu.addItem(NSMenuItem.separator())

            let convertCurves = NSMenuItem(title: "转换为曲线 (Convert to Curves)", action: #selector(convertToCurvesAction(_:)), keyEquivalent: "O")
            convertCurves.keyEquivalentModifierMask = [.command, .shift]
            convertCurves.target = self
            menu.addItem(convertCurves)

            let hasPath = mainContentView.canvasStageView.document.nodes.contains(where: { selection.contains($0.id) && ($0.kind == .path || $0.points != nil) })
            if hasPath {
                let closeCurve = NSMenuItem(title: "闭合曲线 (Close Curve)", action: #selector(closeCurveAction(_:)), keyEquivalent: "")
                closeCurve.target = self
                menu.addItem(closeCurve)

                let reverseCurve = NSMenuItem(title: "反转曲线 (Reverse Curve)", action: #selector(reverseCurveAction(_:)), keyEquivalent: "")
                reverseCurve.target = self
                menu.addItem(reverseCurve)

                let smoothCurve = NSMenuItem(title: "平滑曲线 (Smooth Curve)", action: #selector(smoothCurveAction(_:)), keyEquivalent: "")
                smoothCurve.target = self
                menu.addItem(smoothCurve)
            }

            let hasGroup = mainContentView.canvasStageView.document.nodes.contains(where: { selection.contains($0.id) && $0.kind == .group })
            if hasGroup {
                let ungroup = NSMenuItem(title: "取消编组 (Ungroup)", action: #selector(ungroupAction(_:)), keyEquivalent: "G")
                ungroup.keyEquivalentModifierMask = [.command, .shift]
                ungroup.target = self
                menu.addItem(ungroup)
            }

            if selection.count >= 2 {
                let group = NSMenuItem(title: "编组 (Group)", action: #selector(groupAction(_:)), keyEquivalent: "")
                group.target = self
                menu.addItem(group)
                let alignMenu = NSMenu()
                for (title, key) in [("左对齐", "left"), ("水平居中", "center"), ("右对齐", "right"),
                                     ("顶对齐", "top"), ("垂直居中", "middle"), ("底对齐", "bottom")] {
                    let item = NSMenuItem(title: title, action: #selector(alignSelectionAction(_:)), keyEquivalent: "")
                    item.target = self
                    item.representedObject = key
                    alignMenu.addItem(item)
                }
                alignMenu.addItem(NSMenuItem.separator())
                for (title, key) in [("水平等距分布", "distributeH"), ("垂直等距分布", "distributeV")] {
                    let item = NSMenuItem(title: title, action: #selector(distributeSelectionAction(_:)), keyEquivalent: "")
                    item.target = self
                    item.representedObject = key
                    alignMenu.addItem(item)
                }
                let alignItem = NSMenuItem(title: "对齐与分布 (Align)", action: nil, keyEquivalent: "")
                alignItem.submenu = alignMenu
                menu.addItem(alignItem)
            }

            let booleanMenu = NSMenu()
            for (title, selector) in [("并集 (Union)", #selector(booleanUnionAction(_:))),
                                      ("减去 (Subtract)", #selector(booleanSubtractAction(_:))),
                                      ("相交 (Intersect)", #selector(booleanIntersectAction(_:))),
                                      ("异或 (Xor)", #selector(booleanXorAction(_:))),
                                      ("分割 (Divide)", #selector(booleanDivideAction(_:)))] {
                let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
                item.target = self
                booleanMenu.addItem(item)
            }
            let booleanItem = NSMenuItem(title: "布尔运算 (Boolean)", action: nil, keyEquivalent: "")
            booleanItem.submenu = booleanMenu
            booleanItem.isEnabled = selection.count >= 2
            menu.addItem(booleanItem)

            menu.addItem(NSMenuItem.separator())
            let copySvg = NSMenuItem(title: "复制 SVG (Copy SVG)", action: #selector(copySvgAction(_:)), keyEquivalent: "")
            copySvg.target = self
            menu.addItem(copySvg)

            let copyCode = NSMenuItem(title: "复制代码 (Copy Code)", action: #selector(copyCodeAction(_:)), keyEquivalent: "")
            copyCode.target = self
            menu.addItem(copyCode)

            menu.addItem(NSMenuItem.separator())
            let forward = NSMenuItem(title: "上移一层 (Bring Forward)", action: #selector(bringForwardAction(_:)), keyEquivalent: "]")
            forward.target = self
            menu.addItem(forward)

            let backward = NSMenuItem(title: "下移一层 (Send Backward)", action: #selector(sendBackwardAction(_:)), keyEquivalent: "[")
            backward.target = self
            menu.addItem(backward)

            let front = NSMenuItem(title: "置顶 (Bring to Front)", action: #selector(bringToFrontAction(_:)), keyEquivalent: "]")
            front.keyEquivalentModifierMask = [.command]
            front.target = self
            menu.addItem(front)

            let back = NSMenuItem(title: "置底 (Send to Back)", action: #selector(sendToBackAction(_:)), keyEquivalent: "[")
            back.keyEquivalentModifierMask = [.command]
            back.target = self
            menu.addItem(back)
        } else {
            let selectAll = NSMenuItem(title: "全选 (Select All)", action: #selector(selectAllAction(_:)), keyEquivalent: "")
            selectAll.target = self
            menu.addItem(selectAll)
        }

        menu.addItem(NSMenuItem.separator())
        let exportItem = NSMenuItem(title: "导出… (Export)", action: #selector(exportDocument(_:)), keyEquivalent: "")
        exportItem.target = self
        menu.addItem(exportItem)
        return menu
    }

    @objc public func alignSelectionAction(_ sender: Any?) {
        guard let sender = sender as? NSMenuItem else { return }
        guard let key = sender.representedObject as? String else { return }
        performAlign(key)
    }

    @objc public func distributeSelectionAction(_ sender: Any?) {
        guard let sender = sender as? NSMenuItem else { return }
        guard let key = sender.representedObject as? String else { return }
        performDistribute(horizontal: key == "distributeH")
    }

    @objc public func bringForwardAction(_ sender: Any?) {
        moveSelectionInLayerOrder(forward: true)
    }

    @objc public func sendBackwardAction(_ sender: Any?) {
        moveSelectionInLayerOrder(forward: false)
    }

    @objc public func bringToFrontAction(_ sender: Any?) {
        reorderSelection(toFront: true)
    }

    @objc public func sendToBackAction(_ sender: Any?) {
        reorderSelection(toFront: false)
    }

    private func reorderSelection(toFront: Bool) {
        let ids = mainContentView.canvasStageView.selectedNodeIds
        guard !ids.isEmpty else { return }
        for id in ids {
            guard let from = mainContentView.canvasStageView.document.nodes.firstIndex(where: { $0.id == id }) else { continue }
            let target = toFront ? max(0, mainContentView.canvasStageView.document.nodes.count - 1) : 0
            let cmd = ReorderLayerCommand(nodeId: id, fromIndex: from, toIndex: target)
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        }
        refreshAfterDocumentMutation()
    }

    // MARK: - Direct Contextual AI Actions

    @objc private func aiRemoveBackgroundMenuItemAction(_ sender: Any?) {
        aiRemoveBackgroundAction()
    }

    @objc private func aiRewriteMenuItemAction(_ sender: Any?) {
        aiRewriteAction()
    }

    public func aiRemoveBackgroundAction() {
        let selection = mainContentView.canvasStageView.selectedNodeIds
        guard let node = mainContentView.canvasStageView.document.nodes.first(where: { selection.contains($0.id) && $0.kind == .image }) else {
            showChromeToast("请先选择一个图片图层")
            return
        }

        let targetId = node.id
        showChromeToast("AI 正在分析并抠图去背景...")

        Task {
            var sourceCG: CGImage?
            if let base64 = node.text, let data = Data(base64Encoded: base64), let img = NSImage(data: data) {
                sourceCG = img.cgImage(forProposedRect: nil, context: nil, hints: nil)
            }

            if sourceCG == nil {
                let w = max(Int(node.width), 64)
                let h = max(Int(node.height), 64)
                let colorSpace = CGColorSpaceCreateDeviceRGB()
                if let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
                    ctx.setFillColor(NSColor(hex: node.style.fill).cgColor)
                    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
                    sourceCG = ctx.makeImage()
                }
            }

            guard let inputCG = sourceCG else {
                await MainActor.run { self.showChromeToast("未能读取图片数据") }
                return
            }

            do {
                let mattedCG = try await LocalAIRepairEngine.removeBackground(from: inputCG)
                let rep = NSBitmapImageRep(cgImage: mattedCG)
                guard let pngData = rep.representation(using: .png, properties: [:]) else { return }
                let newBase64 = pngData.base64EncodedString()

                await MainActor.run {
                    var updated = node
                    updated.text = newBase64
                    let cmd = BasicCommand(
                        name: "AI 一键去背景",
                        iconName: "wand",
                        execute: { doc in
                            guard let idx = doc.nodes.firstIndex(where: { $0.id == targetId }) else { return false }
                            doc.nodes[idx] = updated
                            return true
                        },
                        undo: { doc in
                            guard let idx = doc.nodes.firstIndex(where: { $0.id == targetId }) else { return false }
                            doc.nodes[idx] = node
                            return true
                        }
                    )
                    _ = self.commandManager.execute(
                        cmd,
                        on: &self.mainContentView.canvasStageView.document
                    )
                    self.mainContentView.canvasStageView.setNeedsDisplay(self.mainContentView.canvasStageView.bounds)
                    self.refreshAfterDocumentMutation()
                    self.showChromeToast("去背景成功，已就地更新图层！(可 ⌘Z 撤销)")
                }
            } catch {
                await MainActor.run {
                    self.showChromeToast("抠图失败: \(error.localizedDescription)")
                }
            }
        }
    }

    public func aiRewriteAction() {
        let selection = mainContentView.canvasStageView.selectedNodeIds
        let nodes = mainContentView.canvasStageView.document.nodes.filter { selection.contains($0.id) }
        setAgentPanelOpen(true)
        if nodes.isEmpty {
            handleAgentPrompt("在画布上生成一套现代风格的 UI 界面卡片组件")
        } else if nodes.count == 1, let node = nodes.first {
            if node.kind == .text {
                let currentText = node.text ?? node.name
                handleAgentPrompt("为当前选中的文本「\(currentText)」生成 3 个更具吸引力的文案变体")
            } else {
                handleAgentPrompt("优化当前选中的「\(node.name)」样式与圆角布局，增强视觉层次")
            }
        } else {
            handleAgentPrompt("将当前选中的 \(nodes.count) 个图层进行整齐自适应排版与对齐")
        }
    }

    // MARK: - Paint Layer Persistence

    private static let paintNodeName = "Paint Layer"

    private func commitPaintStroke(nodeId: String?, dataURL: String) {
        let document = mainContentView.canvasStageView.document
        var targetId = nodeId
        if targetId == nil {
            if let existing = document.nodes.first(where: { $0.name == Self.paintNodeName && $0.kind == .image }) {
                targetId = existing.id
            }
        }
        if let targetId = targetId,
           let index = document.nodes.firstIndex(where: { $0.id == targetId }) {
            let previous = document.nodes[index].src
            let cmd = BasicCommand(
                name: "画笔笔触",
                execute: { doc in
                    guard let i = doc.nodes.firstIndex(where: { $0.id == targetId }) else { return false }
                    doc.nodes[i].src = dataURL
                    return true
                },
                undo: { doc in
                    guard let i = doc.nodes.firstIndex(where: { $0.id == targetId }) else { return false }
                    doc.nodes[i].src = previous
                    return true
                }
            )
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
            mainContentView.canvasStageView.setPaintNode(id: targetId, dataURL: dataURL)
        } else {
            let canvas = document.canvas
            var node = VOONode(
                name: Self.paintNodeName,
                x: canvas.x,
                y: canvas.y,
                width: canvas.width,
                height: canvas.height,
                style: LayerStyle(fill: "none", stroke: "none", strokeWidth: 0)
            )
            node.kind = .image
            node.src = dataURL
            node.imageId = "paint-" + UUID().uuidString
            let cmd = InsertNodeCommand(node: node)
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
            mainContentView.canvasStageView.setPaintNode(id: node.id, dataURL: dataURL)
        }
        refreshAfterDocumentMutation()
    }

    /// Re-hydrates the in-memory paint bitmap from the document's persisted layer.
    private func refreshPaintLayerFromDocument() {
        let nodes = mainContentView.canvasStageView.document.nodes
        if let paint = nodes.first(where: { $0.kind == .image && ($0.name == Self.paintNodeName || ($0.imageId ?? "").hasPrefix("paint-")) }) {
            mainContentView.canvasStageView.setPaintNode(id: paint.id, dataURL: paint.src)
        } else {
            mainContentView.canvasStageView.setPaintNode(id: nil, dataURL: nil)
        }
    }

    // MARK: - Canvas Creation & Inline Text

    /// Inserts a node produced by the canvas tool layer through the undo stack.
    private func insertNodeFromCanvas(_ node: VOONode) {
        let cmd = InsertNodeCommand(node: node)
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        mainContentView.canvasStageView.selectedNodeIds = [node.id]
        mainContentView.inspector.setPropertiesVisible(true)
        mainContentView.canvasStageView.needsDisplay = true
        refreshAfterDocumentMutation()

        // The web shape / artboard tool returns to the select tool after a draw.
        if node.kind == .rect || node.kind == .ellipse || node.kind == .frame {
            mainContentView.canvasStageView.activeTool = .move
            mainContentView.toolRail.state.selectTool(.move)
            mainContentView.toolRail.updateSelection()
        }
    }

    private func createTextNodeFromCanvas(at point: CGPoint) {
        let textCount = mainContentView.canvasStageView.document.nodes.filter { $0.kind == .text }.count

        // Contrast check: if point is on a white / light frame or rect, use dark text (#171717)
        var isLightBg = false
        for node in mainContentView.canvasStageView.document.nodes.reversed() {
            let r = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            if r.contains(point) && (node.kind == .frame || node.kind == .rect) {
                let color = NSColor(hex: node.style.fill)
                let lum = 0.299 * color.redComponent + 0.587 * color.greenComponent + 0.114 * color.blueComponent
                if lum > 0.6 && color.alphaComponent > 0.5 {
                    isLightBg = true
                }
                break
            }
        }

        let node = TextEditingOverlay.defaultTextNode(at: point, index: textCount + 1, onLightBackground: isLightBg)
        let cmd = InsertNodeCommand(node: node)
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        mainContentView.canvasStageView.selectedNodeIds = [node.id]
        mainContentView.canvasStageView.needsDisplay = true
        refreshAfterDocumentMutation()

        // Let the inline overlay update the freshly inserted node.
        var liveNode = node
        if let current = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == node.id }) {
            liveNode = current
        }
        DispatchQueue.main.async { [weak self] in
            self?.beginTextEditing(liveNode)
        }
    }

    private func beginTextEditing(_ node: VOONode) {
        mainContentView.canvasStageView.selectNode(id: node.id)
        mainContentView.inspector.setPropertiesVisible(true)
        textEditingOverlay.begin(editing: node, in: mainContentView.canvasStageView)
    }

    private func commitTextEditing(_ text: String) {
        guard let node = textEditingOverlay.editingNode else { return }
        let newText = text
        let cmd = BasicCommand(
            name: "编辑文本",
            execute: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == node.id }) else { return false }
                doc.nodes[i].text = newText
                doc.nodes[i].name = newText.isEmpty ? "Text" : String(newText.prefix(24))
                return true
            },
            undo: { doc in
                guard let i = doc.nodes.firstIndex(where: { $0.id == node.id }) else { return false }
                doc.nodes[i].text = node.text
                doc.nodes[i].name = node.name
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        textEditingOverlay.isHidden = true
        refreshAfterDocumentMutation()
    }

    public func addMaskToSelection() {
        let selectedIds = mainContentView.canvasStageView.selectedNodeIds
        guard let firstId = selectedIds.first,
              let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == firstId }) else {
            showChromeToast("请先选择一个图层添加蒙版")
            return
        }

        if let existingMaskId = node.maskId {
            let cmd = BasicCommand(
                name: "取消蒙版",
                execute: { doc in
                    guard let i = doc.nodes.firstIndex(where: { $0.id == firstId }) else { return false }
                    doc.nodes[i].maskId = nil
                    return true
                },
                undo: { doc in
                    guard let i = doc.nodes.firstIndex(where: { $0.id == firstId }) else { return false }
                    doc.nodes[i].maskId = existingMaskId
                    return true
                }
            )
            _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
            refreshAfterDocumentMutation()
            showChromeToast("已取消蒙版: \(node.name)")
            return
        }

        let maskId = UUID().uuidString
        let maskNode = VOONode(
            id: maskId,
            parentId: node.parentId,
            kind: .rect,
            name: "\(node.name) Mask",
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            style: LayerStyle(
                fill: "#ffffff",
                stroke: "none",
                strokeWidth: 0,
                opacity: 1.0
            ),
            cornerRadii: node.cornerRadii
        )

        let cmd = BasicCommand(
            name: "添加蒙版",
            execute: { doc in
                doc.nodes.append(maskNode)
                if let i = doc.nodes.firstIndex(where: { $0.id == firstId }) {
                    doc.nodes[i].maskId = maskId
                }
                return true
            },
            undo: { doc in
                doc.nodes.removeAll(where: { $0.id == maskId })
                if let i = doc.nodes.firstIndex(where: { $0.id == firstId }) {
                    doc.nodes[i].maskId = nil
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
        showChromeToast("已为「\(node.name)」添加蒙版")
    }

    // MARK: - Layers Panel Actions

    private func addRectangleLayer() {
        let canvas = mainContentView.canvasStageView.document.canvas
        let width: CGFloat = 220
        let height: CGFloat = 160
        let node = VOONode(
            kind: .rect,
            name: "Rectangle \(mainContentView.canvasStageView.document.nodes.filter { $0.kind == .rect }.count + 1)",
            x: canvas.x + (canvas.width - width) / 2.0,
            y: canvas.y + (canvas.height - height) / 2.0,
            width: width,
            height: height,
            style: LayerStyle(fill: "#b2ffd6", stroke: "#000000", strokeWidth: 0)
        )
        insertNodeFromCanvas(node)
    }

    private func applyOpacityToSelection(_ opacity: CGFloat) {
        let ids = mainContentView.canvasStageView.selectedNodeIds
        guard !ids.isEmpty else { return }
        for id in ids {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            let change = NodeStylePropertyChange.opacity(old: node.style.opacity, new: min(max(opacity, 0), 1))
            _ = commandManager.execute(StyleChangeCommand(nodeId: id, change: change, name: "修改不透明度"),
                                       on: &mainContentView.canvasStageView.document)
        }
        refreshAfterDocumentMutation()
    }

    private func applyBlendModeToSelection(_ blendMode: String) {
        let ids = mainContentView.canvasStageView.selectedNodeIds
        guard !ids.isEmpty else { return }
        for id in ids {
            guard let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == id }) else { continue }
            let normalized = blendMode.lowercased().replacingOccurrences(of: " ", with: "-")
            let change = NodeStylePropertyChange.blendMode(old: node.style.blendMode, new: normalized)
            _ = commandManager.execute(StyleChangeCommand(nodeId: id, change: change, name: "修改混合模式"),
                                       on: &mainContentView.canvasStageView.document)
        }
        refreshAfterDocumentMutation()
    }

    /// Island bar ↑/↓: shifts every selected layer one step in the paint order
    /// (web "move up / move down"), recorded as one undoable command per step.
    private func moveSelectionInLayerOrder(forward: Bool) {
        let stage = mainContentView.canvasStageView
        let selected = stage.selectedNodeIds
        guard !selected.isEmpty else { return }
        let indices = stage.document.nodes.enumerated()
            .filter { selected.contains($0.element.id) }
            .map { $0.offset }
        guard !indices.isEmpty else { return }
        // Forward = toward the front of the list (painted last).
        let ordered = forward ? indices.sorted(by: >) : indices.sorted()
        for index in ordered {
            let target = forward ? index + 1 : index - 1
            guard target >= 0, target < stage.document.nodes.count else { continue }
            let nodeId = stage.document.nodes[index].id
            guard !selected.contains(stage.document.nodes[target].id) else { continue }
            moveLayer(nodeId, to: target)
        }
        refreshAfterDocumentMutation()
    }

    /// Island bar colour swatches: applies a fill/stroke colour to the selection.
    private func presentSelectionColourPanel(isStroke: Bool) {
        let stage = mainContentView.canvasStageView
        guard !stage.selectedNodeIds.isEmpty else { return }
        let panel = NSColorPanel.shared
        panel.setTarget(self)
        panel.setAction(#selector(selectionColourPanelChanged(_:)))
        colourPanelStrokeTarget = isStroke
        panel.orderFront(nil)
    }

    @objc private func selectionColourPanelChanged(_ sender: NSColorPanel) {
        let hex = sender.color.hexString
        applyColourToSelection(hex, isStroke: colourPanelStrokeTarget)
    }

    private func applyColourToSelection(_ hex: String, isStroke: Bool) {
        let stage = mainContentView.canvasStageView
        let selected = stage.selectedNodeIds
        guard !selected.isEmpty else { return }
        let before: [String: LayerStyle] = stage.document.nodes
            .filter { selected.contains($0.id) }
            .reduce(into: [:]) { $0[$1.id] = $1.style }
        let cmd = BasicCommand(
            name: isStroke ? "修改描边颜色" : "修改填充颜色",
            execute: { doc in
                for index in doc.nodes.indices where selected.contains(doc.nodes[index].id) {
                    if isStroke { doc.nodes[index].style.stroke = hex } else { doc.nodes[index].style.fill = hex }
                }
                return true
            },
            undo: { doc in
                for index in doc.nodes.indices {
                    if let style = before[doc.nodes[index].id] { doc.nodes[index].style = style }
                }
                return true
            }
        )
        _ = commandManager.execute(cmd, on: &stage.document)
        refreshAfterDocumentMutation()
    }

    private func moveLayer(_ nodeId: String, to targetIndex: Int) {
        let nodes = mainContentView.canvasStageView.document.nodes
        guard let from = nodes.firstIndex(where: { $0.id == nodeId }) else { return }
        let safeTarget = max(0, min(targetIndex, nodes.count - 1))
        guard from != safeTarget else { return }
        let cmd = ReorderLayerCommand(nodeId: nodeId, fromIndex: from, toIndex: safeTarget)
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        refreshAfterDocumentMutation()
    }

    // MARK: - VOO Editor Chrome Integration

    /// Shows / hides the AI agent panel and reflows the editor shell (web parity).
    public func setAgentPanelOpen(_ open: Bool) {
        if open {
            syncAgentModelLabel()
        }
        mainContentView.setAgentPanelOpen(open)
        mainContentView.refreshChromeVisibility()
    }

    /// Syncs the composer model chip label ("Opus 5.5", "GPT-5", "Gemini 3.8", etc.) with the active agent provider.
    public func syncAgentModelLabel() {
        let raw = UserDefaults.standard.string(forKey: SettingsDrawerView.agentProviderDefaultsKey) ?? "claude"
        let customModel = UserDefaults.standard.string(forKey: "voo.agent.model")
        if let customModel, !customModel.isEmpty {
            mainContentView.agentPanel.modelLabel = customModel
            return
        }
        let friendly: String
        switch raw.lowercased() {
        case "claude":
            friendly = "Opus 5.5"
        case "codex", "openai":
            friendly = "GPT-5"
        case "antigravity", "agy":
            friendly = "Gemini 3.8"
        case "deepseekharness", "deepseek-harness", "dsh":
            friendly = "DeepSeek V3"
        case "opencode":
            friendly = "OpenCode"
        default:
            friendly = "Opus 5.5"
        }
        mainContentView.agentPanel.modelLabel = friendly
    }

    public func toggleAgentPanel() {
        setAgentPanelOpen(!mainContentView.isAgentPanelOpen)
    }

    /// Opens the onboarding guide (titlebar settings / View menu / Help).
    public func showOnboarding() {
        mainContentView.showOnboarding()
    }

    /// Snapshot/QA helper: adds a demo rectangle and text node to the canvas.
    public func addSnapshotContent() {
        addRectangleLayer()
        let textCount = mainContentView.canvasStageView.document.nodes.filter { $0.kind == .text }.count
        var textNode = TextEditingOverlay.defaultTextNode(
            at: CGPoint(x: mainContentView.canvasStageView.document.canvas.x + 80,
                        y: mainContentView.canvasStageView.document.canvas.y + 120),
            index: textCount + 1
        )
        textNode.text = "Hello VOO"
        textNode.name = "Hello VOO"
        var styledText = textNode
        if ProcessInfo.processInfo.environment["VOO_SNAPSHOT_TYPO"] == "1" {
            styledText.fontWeight = "bold"
            styledText.textAlign = "center"
            styledText.lineHeight = 1.5
            styledText.letterSpacing = 1.0
        }
        let cmd = InsertNodeCommand(node: styledText)
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        mainContentView.canvasStageView.selectedNodeIds = [styledText.id]
        refreshAfterDocumentMutation()

        // Optional QA hooks: image import, path editing overlay.
        if let imagePath = ProcessInfo.processInfo.environment["VOO_SNAPSHOT_IMAGE"], !imagePath.isEmpty {
            importImage(from: URL(fileURLWithPath: imagePath),
                        at: CGPoint(x: mainContentView.canvasStageView.document.canvas.x + 900,
                                    y: mainContentView.canvasStageView.document.canvas.y + 220))
        }
        if ProcessInfo.processInfo.environment["VOO_SNAPSHOT_PATH_EDIT"] == "1" {
            let pathPoints = [
                PenAnchor(x: 700, y: 140, outHandle: CGPoint(x: 800, y: 260), isClosed: false, type: .smooth),
                PenAnchor(x: 980, y: 420, inHandle: CGPoint(x: 840, y: 360), isClosed: false, type: .smooth),
                PenAnchor(x: 1120, y: 180, isClosed: false, type: .sharp)
            ]
            var pathNode = VOONode(kind: .path, name: "Path 1", x: 690, y: 130, width: 440, height: 300,
                                   style: LayerStyle(fill: "none", stroke: "#b2ffd6", strokeWidth: 3.0))
            pathNode.points = pathPoints
            let pathCmd = InsertNodeCommand(node: pathNode)
            _ = commandManager.execute(pathCmd, on: &mainContentView.canvasStageView.document)
            mainContentView.canvasStageView.activeTool = .node
            mainContentView.toolRail.state.selectTool(.node)
            mainContentView.toolRail.updateSelection()
            mainContentView.canvasStageView.selectedNodeIds = [pathNode.id]
            refreshAfterDocumentMutation()
        }

        if ProcessInfo.processInfo.environment["VOO_SNAPSHOT_TEXT_EDIT"] == "1",
           let live = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == textNode.id }) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.beginTextEditing(live)
            }
        }
    }

    public func showOnboardingAction(_ sender: Any?) {
        showOnboarding()
    }

    private var agentChatHistory: [AIChatMessage] = []
    private var activeAgentTask: Task<Void, Never>?

    private func cancelActiveAgentTask() {
        activeAgentTask?.cancel()
        activeAgentTask = nil
        cancelActiveCLIRun()
    }

    /// Routes the agent panel prompt to either a locally installed CLI or the
    /// native full-featured `AIAgentClient` multi-turn tool loop.
    private func handleAgentPrompt(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        mainContentView.agentPanel.addUserMessage(trimmed)
        setAgentPanelOpen(true)

        cancelActiveAgentTask()
        let agent = activeCLIAgent

        activeAgentTask = Task { @MainActor [weak self] in
            guard let self = self else { return }
            let status = await LocalCLIBridge.shared.detect(agent)
            if status.installed {
                // Route through detected CLI
                self.mainContentView.agentPanel.beginStreamingAgentMessage()
                let runID = LocalCLIBridge.shared.advance(
                    agent: agent,
                    prompt: trimmed,
                    context: self.currentSelectionContext(),
                    workingDirectory: UserDefaults.standard.string(forKey: "voo.workspace.path").map { URL(fileURLWithPath: $0) }
                ) { [weak self] event in
                    guard let self = self else { return }
                    Task { @MainActor in
                        switch event {
                        case .started:
                            break
                        case .text(let chunk):
                            self.mainContentView.agentPanel.appendStreamingText(chunk)
                        case .toolCall(let tool):
                            self.mainContentView.agentPanel.appendStreamingText("\n`[tool] \(tool)`\n")
                            self.refreshAfterDocumentMutation()
                        case .done:
                            self.mainContentView.agentPanel.endStreamingAgentMessage()
                            self.refreshAfterDocumentMutation()
                            self.activeCLIRunID = nil
                        case .error(let message):
                            self.mainContentView.agentPanel.appendAgentError(message)
                            self.activeCLIRunID = nil
                        }
                    }
                }
                self.activeCLIRunID = runID
            } else {
                // Route through fully native AIAgentClient (matches VOO Design Web canvas_agent loop)
                self.mainContentView.agentPanel.beginStreamingAgentMessage()
                do {
                    var doc = self.mainContentView.canvasStageView.document
                    var currentHistory = self.agentChatHistory
                    _ = try await AIAgentClient.shared.runAgentTurn(
                        userText: trimmed,
                        history: &currentHistory,
                        document: &doc,
                        commandManager: self.commandManager,
                        onText: { [weak self] chunk in
                            self?.mainContentView.agentPanel.appendStreamingText(chunk)
                        },
                        onToolEvent: { [weak self] event in
                            guard let self = self else { return }
                            switch event {
                            case .starting(let name, let args):
                                let desc = args["title"] as? String ?? args["prompt"] as? String ?? args["name"] as? String ?? ""
                                let suffix = desc.isEmpty ? "" : ": \(desc)"
                                self.mainContentView.agentPanel.appendStreamingText("\n⚡️ `[\(name)\(suffix)]`\n")
                            case .completed(_, let res):
                                if let nodeId = res["nodeId"] as? String {
                                    self.mainContentView.canvasStageView.focusOnNode(id: nodeId)
                                    let nodeName = self.mainContentView.canvasStageView.document.nodes.first(where: { $0.id == nodeId })?.name ?? "图层"
                                    self.mainContentView.agentPanel.appendStreamingText("  ↳ 📍 已对焦图层: [\(nodeName)]\n")
                                }
                                self.mainContentView.canvasStageView.setNeedsDisplay(self.mainContentView.canvasStageView.bounds)
                                self.refreshAfterDocumentMutation()
                            case .failed(let name, let err):
                                self.mainContentView.agentPanel.appendStreamingText("\n⚠️ `[\(name) failed: \(err)]`\n")
                            }
                        }
                    )
                    self.agentChatHistory = currentHistory
                    self.mainContentView.canvasStageView.document = doc
                    self.mainContentView.agentPanel.endStreamingAgentMessage()
                    self.refreshAfterDocumentMutation()
                } catch {
                    if !Task.isCancelled {
                        self.mainContentView.agentPanel.appendAgentError(error.localizedDescription)
                    }
                }
            }
        }
    }

    /// Which channel the shared NSColorPanel is currently editing.
    private var colourPanelStrokeTarget: Bool = false

    private var activeCLIRunID: UUID?

    private var activeCLIAgent: LocalCLIAgent {
        let raw = UserDefaults.standard.string(forKey: "voo.agent.llmProvider") ?? "claude"
        if let agent = LocalCLIAgent(rawValue: raw) { return agent }
        switch raw.lowercased() {
        case "codex", "openai": return .codex
        case "antigravity", "agy": return .antigravity
        case "opencode": return .opencode
        case "deepseekharness", "deepseek-harness", "dsh": return .deepseekHarness
        default: return .claude
        }
    }

    private func currentSelectionContext() -> String? {
        let ids = mainContentView.canvasStageView.selectedNodeIds
        guard !ids.isEmpty else { return nil }
        let nodes = mainContentView.canvasStageView.document.nodes.filter { ids.contains($0.id) }
        guard !nodes.isEmpty else { return nil }
        let lines = nodes.map { node in
            "- \(node.name) [\(node.kind.rawValue)] x=\(Int(node.x)) y=\(Int(node.y)) w=\(Int(node.width)) h=\(Int(node.height)) fill=\(node.style.fill)"
        }
        return "Selected layers:\n" + lines.joined(separator: "\n")
    }

    private func cancelActiveCLIRun() {
        if let id = activeCLIRunID {
            LocalCLIBridge.shared.cancel(id)
            activeCLIRunID = nil
        }
    }

    private func appendCLIFallback(for agent: LocalCLIAgent, prompt: String, status: LocalCLIStatus) {
        let selection = mainContentView.canvasStageView.selectedNodeIds.count
        let contextLine = selection > 0 ? "已接收选区上下文（\(selection) 个图层）。" : "请先在画布中选中图层，我会把选区作为上下文派发给本地智能体。"
        let detail: String
        if !status.installed {
            detail = "未检测到 \(agent.displayName) CLI。安装后即可由本地智能体直接修改画布：\n\(agent.installCommand)"
        } else {
            detail = "已检测到 \(agent.displayName)\(status.version.map { " \($0)" } ?? "")，但当前不可用：\(status.error ?? "未就绪")。"
        }
        self.mainContentView.agentPanel.addAgentMessage("收到：「\(prompt)」。\(detail)\n\(contextLine)")
    }

    public func applyTheme(_ mode: ThemeManager.Mode) {
        let isLight = mode == .light
        studioWindow.backgroundColor = isLight ? NSColor(hex: "#f5f5f5") : ThemeTokens.colorPanel
        mainContentView.editorShell.layer?.backgroundColor = isLight ? NSColor(hex: "#f5f5f5").cgColor : NSColor.black.cgColor
        mainContentView.titleBar.needsDisplay = true
        mainContentView.toolRail.needsDisplay = true
        mainContentView.bottomZoomBar.needsDisplay = true
        mainContentView.inspector.needsDisplay = true
        mainContentView.welcomeDashboard.needsDisplay = true
        mainContentView.settingsDrawer.needsDisplay = true
        mainContentView.agentPanel.needsDisplay = true
        mainContentView.canvasStageView.needsDisplay = true
    }

    private func showChromeToast(_ message: String) {
        NSSound.beep()
        NSLog("[VOO Design Native] %@", message)
    }

    private var activePageNodeId: String?

    public func updatePageSwitcherState() {
        let doc = mainContentView.canvasStageView.document
        let frameNodes = doc.nodes.filter { $0.kind == .frame }
        if frameNodes.isEmpty {
            let title = doc.title.isEmpty ? "Design 1" : doc.title
            mainContentView.pageSwitcher.update(pageName: title, pageIndex: 1, pageCount: 1)
        } else {
            let selectedIds = mainContentView.canvasStageView.selectedNodeIds
            var activeIndex = 0
            if let matchedIndex = frameNodes.firstIndex(where: { selectedIds.contains($0.id) }) {
                activeIndex = matchedIndex
                activePageNodeId = frameNodes[matchedIndex].id
            } else if let currentId = activePageNodeId, let matchedIndex = frameNodes.firstIndex(where: { $0.id == currentId }) {
                activeIndex = matchedIndex
            } else {
                activeIndex = 0
                activePageNodeId = frameNodes.first?.id
            }
            // Web `page_switcher` labels the pill with the DOCUMENT name
            // ("Design1 1/1"), not the frame name, which stays "Frame".
            let currentPage = frameNodes[activeIndex]
            let pillName = doc.title.isEmpty ? currentPage.name : doc.title
            mainContentView.pageSwitcher.update(
                pageName: pillName,
                pageIndex: activeIndex + 1,
                pageCount: frameNodes.count
            )
        }
    }

    private func showPageSwitcherMenu() {
        let menu = NSMenu()
        let doc = mainContentView.canvasStageView.document
        let frameNodes = doc.nodes.filter { $0.kind == .frame }

        if frameNodes.isEmpty {
            let title = doc.title.isEmpty ? "Design 1" : doc.title
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            item.state = .on
            item.image = VooIconFactory.image(named: .frame, size: NSSize(width: 14, height: 14), color: .labelColor)
            menu.addItem(item)
        } else {
            for (idx, frameNode) in frameNodes.enumerated() {
                let item = NSMenuItem(title: frameNode.name, action: #selector(selectPageMenuItemAction(_:)), keyEquivalent: "")
                item.target = self
                item.tag = idx
                item.representedObject = frameNode.id
                if frameNode.id == activePageNodeId || (activePageNodeId == nil && idx == 0) {
                    item.state = .on
                }
                item.image = VooIconFactory.image(named: .frame, size: NSSize(width: 14, height: 14), color: .labelColor)
                menu.addItem(item)
            }
        }

        menu.addItem(NSMenuItem.separator())
        let newPage = NSMenuItem(title: "新建页面 (New Page)", action: #selector(newPageAction(_:)), keyEquivalent: "")
        newPage.target = self
        menu.addItem(newPage)

        if let anchor = mainContentView.pageSwitcher.superview {
            let point = mainContentView.pageSwitcher.convert(
                NSPoint(x: 0, y: mainContentView.pageSwitcher.bounds.height + 6),
                to: anchor
            )
            menu.popUp(positioning: nil, at: point, in: anchor)
        }
    }

    @objc private func selectPageMenuItemAction(_ sender: NSMenuItem) {
        guard let nodeId = sender.representedObject as? String,
              let node = mainContentView.canvasStageView.document.nodes.first(where: { $0.id == nodeId }) else { return }
        activePageNodeId = nodeId
        mainContentView.canvasStageView.selectNode(id: nodeId)
        let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
        mainContentView.canvasStageView.zoomToFitRect(rect)
        syncChromeState()
    }

    @objc private func newPageAction(_ sender: Any?) {
        let doc = mainContentView.canvasStageView.document
        let frameNodes = doc.nodes.filter { $0.kind == .frame }

        var maxX: CGFloat = doc.canvas.width
        var standardW: CGFloat = doc.canvas.width > 0 ? doc.canvas.width : 1920.0
        var standardH: CGFloat = doc.canvas.height > 0 ? doc.canvas.height : 1080.0
        var standardY: CGFloat = doc.canvas.y

        if let lastFrame = frameNodes.last {
            maxX = max(maxX, lastFrame.x + lastFrame.width)
            standardW = lastFrame.width
            standardH = lastFrame.height
            standardY = lastFrame.y
        }

        let newIndex = frameNodes.count + (frameNodes.isEmpty && doc.canvas.width > 0 ? 2 : 1)
        let newName = "Page \(newIndex)"
        let newX = maxX + 160.0

        let newNode = VOONode(
            kind: .frame,
            name: newName,
            x: newX,
            y: standardY,
            width: standardW,
            height: standardH,
            style: LayerStyle(
                fill: "#171717",
                stroke: "#2e2e32",
                strokeWidth: 1.0,
                opacity: 1.0,
                blendMode: "normal"
            )
        )

        let cmd = InsertNodeCommand(node: newNode)
        _ = commandManager.execute(cmd, on: &mainContentView.canvasStageView.document)
        activePageNodeId = newNode.id
        mainContentView.canvasStageView.selectNode(id: newNode.id)
        let targetRect = CGRect(x: newNode.x, y: newNode.y, width: newNode.width, height: newNode.height)
        mainContentView.canvasStageView.zoomToFitRect(targetRect)
        refreshAfterDocumentMutation()
        showChromeToast("已创建页面: \(newName)")
    }

    private func showSettingsMenu() {
        mainContentView.showSettings(tab: "general")
    }

    public func showSettings() {
        mainContentView.showSettings(tab: "general")
    }

    @objc private func showAboutPanel(_ sender: Any?) {
        let alert = NSAlert()
        alert.messageText = "VOO Design Native"
        alert.informativeText = "1:1 native replication of VOO Design\nSwift 6 · AppKit · CoreGraphics · Metal\nVersion 1.0.0 (arm64)"
        alert.alertStyle = .informational
        alert.runModal()
    }

    /// Keeps every chrome surface in sync after document / dashboard transitions.
    public func syncChromeState() {
        mainContentView.bottomZoomBar.update(
            zoom: mainContentView.canvasStageView.zoom,
            canUndo: commandManager.canUndo,
            canRedo: commandManager.canRedo
        )
        mainContentView.bottomZoomBar.setRulersEnabled(mainContentView.canvasStageView.showRulers)
        mainContentView.bottomZoomBar.setVisibilityEnabled(mainContentView.canvasStageView.showRulers)
        mainContentView.bottomZoomBar.setGridEnabled(mainContentView.canvasStageView.showGrid)
        mainContentView.bottomZoomBar.setSnapToGridEnabled(mainContentView.canvasStageView.isSnappingEnabled)
        let hasSelection = !mainContentView.canvasStageView.selectedNodeIds.isEmpty
        let nodes = mainContentView.canvasStageView.document.nodes
        let name = nodes.first(where: { $0.id == mainContentView.canvasStageView.selectedNodeIds.first })?.name
        mainContentView.islandBar.update(selectionLabel: hasSelection ? (name ?? "Selection") : nil)
        mainContentView.sessionHasSelection = hasSelection
        mainContentView.inspector.setPropertiesVisible(hasSelection)
        updatePageSwitcherState()
        mainContentView.refreshChromeVisibility()
    }

    // MARK: - Dashboard & Editor Navigation

    public func titleBarDidToggleDashboard(_ titleBar: AppTitleBar) {
        toggleDashboard()
    }

    public func toggleDashboard() {
        mainContentView.isWelcomeOpen.toggle()
        if mainContentView.isWelcomeOpen {
            setAgentPanelOpen(false)
        } else {
            mainContentView.canvasStageView.zoomFit()
            focusCanvas()
        }
        syncChromeState()
    }

    /// Gives the canvas keyboard focus so tool shortcuts, space-pan,
    /// Return/Escape and Delete work immediately after entering the editor.
    public func focusCanvas() {
        studioWindow.makeFirstResponder(mainContentView.canvasStageView)
    }

    public func refreshWorkspaceFiles() {
        let files = WorkspaceManager.shared.scanFiles()
        mainContentView.welcomeDashboard.setWorkspaceFiles(files)
        mainContentView.welcomeDashboard.needsDisplay = true
    }

    public func openEditor(project: String) {
        mainContentView.isWelcomeOpen = false
        let title = (project as NSString).lastPathComponent.replacingOccurrences(of: ".voo", with: "")
        mainContentView.titleBar.setDocumentTitle(title)
        mainContentView.canvasStageView.document.title = title

        let fileManager = FileManager.default
        let wsPath = WorkspaceManager.shared.currentWorkspacePath
        let possiblePaths = [
            project,
            (wsPath as NSString).appendingPathComponent(project),
            (wsPath as NSString).appendingPathComponent("\(project).voo")
        ]
        var loaded = false
        for candidate in possiblePaths {
            if fileManager.fileExists(atPath: candidate) {
                let url = URL(fileURLWithPath: candidate)
                openDocumentFromURL(url)
                loaded = true
                break
            }
        }
        if !loaded {
            // Web parity: a project that is no longer on disk opens the same blank
            // "Design 1" document as the New action instead of fabricated demo art.
            if project.contains("Web app") {
                loadWebAppProject()
            } else {
                newDocument(nil)
                mainContentView.isWelcomeOpen = false
                showChromeToast("找不到工程文件，已新建空白文档")
            }
        }
        mainContentView.canvasStageView.zoomFit()
        syncChromeState()
        refreshAfterDocumentMutation()
        focusCanvas()
    }
}

// MARK: - Main Content Viewport Shell

public class StageViewportView: NSView {
    public override func draw(_ dirtyRect: NSRect) {
        ThemeTokens.colorStage.setFill()
        bounds.fill()
    }
}

// MARK: - Editor Shell Container (web `.editor-shell`: 2px mint border, 16px radius)

public final class EditorShellView: NSView {
    private static func applyShellStyle(to view: NSView) {
        view.wantsLayer = true
        view.layer?.cornerRadius = 16
        view.layer?.masksToBounds = true
        view.layer?.borderColor = ThemeTokens.colorMint.cgColor
        view.layer?.borderWidth = 2.0
        view.layer?.backgroundColor = NSColor.black.cgColor
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        Self.applyShellStyle(to: self)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        Self.applyShellStyle(to: self)
    }
}

public class MainContentView: NSView {
    // Primary Views
    public let titleBar = AppTitleBar()
    public var titleBarView: NSView { titleBar }

    public let editorShell = EditorShellView()
    public var editorShellView: NSView { editorShell }

    public let welcomeDashboard = WelcomeDashboardView()
    public var welcomeDashboardView: NSView { welcomeDashboard }

    public let canvasStageView = CanvasStageView()
    public var canvasViewportView: NSView { canvasStageView }

    public let toolRail = ToolRailView()
    public var toolRailView: NSView { toolRail }

    public let contextToolbar = ContextToolbarPillView()
    public var contextToolbarView: NSView { contextToolbar }

    public let inspector = InspectorView()
    public var inspectorStudioView: NSView { inspector }

    // VOO Editor Chrome (bottom floating controls + agent panel + onboarding)
    public let pageSwitcher = PageSwitcherPillView()
    public let bottomZoomBar = StudioBottomZoomBar()
    public let aiButton = VooAIFloatingButton()
    /// Small "add artboard" affordance above the page pill (web `editor_free_page`).
    public let addArtboardButton = EditorAddArtboardButton()
    public let islandBar = ContextIslandBar()
    public let agentPanel = AgentPanelView()
    public let onboardingGuide = OnboardingGuideView()
    public let settingsDrawer = SettingsDrawerView()
    public private(set) var isAgentPanelOpen: Bool = false
    public var sessionHasSelection: Bool = false
    private var editorTrailingToRoot: NSLayoutConstraint!
    private var editorTrailingToPanel: NSLayoutConstraint!

    public var isWelcomeOpen: Bool = true {
        didSet {
            updatePresentation()
            needsDisplay = true
        }
    }

    // TitleBar Controls Forwarding (Backward Compatibility with Tests)
    public var docTitleLabel: NSTextField { titleBar.docTitleField }
    public var zoomIndicator: NSTextField { titleBar.zoomIndicator }
    public var undoButton: NSButton { titleBar.undoButton }
    public var redoButton: NSButton { titleBar.redoButton }
    public var exportButton: NSButton { titleBar.exportButton }

    // ToolRail Controls Forwarding (Backward Compatibility with Tests)
    public var moveToolButton: NSButton { toolRail.moveToolButton }
    public var penToolButton: NSButton { toolRail.penToolButton }
    public var brushToolButton: NSButton { toolRail.brushToolButton }
    public var nodeToolButton: NSButton { toolRail.nodeToolButton }
    public var shapesToolButton: NSButton { toolRail.shapesToolButton }
    public var eraserToolButton: NSButton { toolRail.eraserToolButton }
    public var textToolButton: NSButton { toolRail.textToolButton }
    public var artboardToolButton: NSButton { toolRail.artboardToolButton }

    // Inspector Subviews Forwarding
    public var layersTreeView: NSView { inspector.layersPanel }
    public var transformPanelView: NSView { inspector.transformPanel }
    public var appearancePanelView: NSView { inspector.appearancePanel }

    // Canvas Subviews (Rulers & Handles)
    public var rulerHorizontalView: NSView { canvasStageView.horizontalRuler }
    public var rulerVerticalView: NSView { canvasStageView.verticalRuler }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupHierarchy()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupHierarchy()
    }

    private func setupHierarchy() {
        setAccessibilityIdentifier("main_content_view")
        setAccessibilityRole(.group)

        // 1. AppTitleBar (Height: 40px)
        titleBar.translatesAutoresizingMaskIntoConstraints = false
        addSubview(titleBar)

        // 2. EditorShell Container (Iconic 2px Mint Border with 16px Radius)
        editorShell.translatesAutoresizingMaskIntoConstraints = false
        addSubview(editorShell)

        // 2.1 Canvas Stage Viewport (Inside editorShell)
        canvasStageView.translatesAutoresizingMaskIntoConstraints = false
        editorShell.addSubview(canvasStageView)

        // 2.2 ToolRail (Floating top horizontal pill inside editorShell)
        toolRail.translatesAutoresizingMaskIntoConstraints = false
        editorShell.addSubview(toolRail)

        // 2.3 ContextToolbar (Floating contextual pill below ToolRail inside editorShell)
        contextToolbar.translatesAutoresizingMaskIntoConstraints = false
        editorShell.addSubview(contextToolbar)

        // 2.4 Inspector Studio (Floating overlay inside editorShell)
        inspector.translatesAutoresizingMaskIntoConstraints = false
        editorShell.addSubview(inspector)

        // 2.5 Bottom floating chrome (web parity): page pill, zoom bar, island bar, AI FAB
        for chromeView in [pageSwitcher, bottomZoomBar, islandBar, aiButton, addArtboardButton] as [NSView] {
            chromeView.translatesAutoresizingMaskIntoConstraints = false
            editorShell.addSubview(chromeView)
        }
        // The island bar is anchored to the selection's outer frame rather than pinned
        // to the bottom chrome, so it lays itself out with an explicit frame.
        islandBar.translatesAutoresizingMaskIntoConstraints = true
        islandBar.frame = CGRect(x: 0, y: 0, width: 0, height: ContextIslandBar.preferredHeight)
        // The legacy silver canvas pill is replaced by the dark VOO zoom bar.
        canvasStageView.bottomToolsPill.isHidden = true
        // The legacy Affinity-style contextual toolbar is hidden by default; the
        // VOO selection island bar replaces it (reachable through the View menu).
        contextToolbar.isHidden = true

        // 2.6 AI agent side panel (outside the mint frame, right column)
        agentPanel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(agentPanel)
        agentPanel.isHidden = true

        // 2.7 Onboarding overlay (above everything inside the shell)
        onboardingGuide.translatesAutoresizingMaskIntoConstraints = false
        onboardingGuide.isHidden = true
        editorShell.addSubview(onboardingGuide)

        // 2.8 Settings & Preferences modal (above the workspace, below nothing)
        settingsDrawer.translatesAutoresizingMaskIntoConstraints = false
        settingsDrawer.isHidden = true
        editorShell.addSubview(settingsDrawer)

        // 2.5 Welcome Dashboard (Inside editorShell)
        welcomeDashboard.translatesAutoresizingMaskIntoConstraints = false
        editorShell.addSubview(welcomeDashboard)

        // Layout Constraints
        editorTrailingToRoot = editorShell.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4)
        editorTrailingToPanel = editorShell.trailingAnchor.constraint(equalTo: agentPanel.leadingAnchor, constant: 0)
        NSLayoutConstraint.activate([
            // App frame inset: web `.app-root-frame` pads 4px around the title bar and
            // the editor shell (`shell` border box sits at x4/y44 inside a 1440x900 window).
            titleBar.topAnchor.constraint(equalTo: topAnchor, constant: 4),
            titleBar.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
            titleBar.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
            titleBar.heightAnchor.constraint(equalToConstant: ThemeTokens.titleBarHeight),

            // EditorShell Container: 2px mint border, 16 radius, 4px frame inset.
            editorShell.topAnchor.constraint(equalTo: titleBar.bottomAnchor, constant: 0),
            editorShell.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
            editorTrailingToRoot,
            editorShell.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),

            // AI agent panel: right column outside the editor shell
            // Web `aside`: panel content starts 12pt below the app content top and
            // keeps a 16pt gutter on the right (measured 1440×900: y56..888, w364).
            agentPanel.topAnchor.constraint(equalTo: titleBar.bottomAnchor, constant: 16),
            agentPanel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            agentPanel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
            agentPanel.widthAnchor.constraint(equalToConstant: 364),

            // Onboarding overlay fills the editor shell
            onboardingGuide.topAnchor.constraint(equalTo: editorShell.topAnchor),
            onboardingGuide.leadingAnchor.constraint(equalTo: editorShell.leadingAnchor),
            onboardingGuide.trailingAnchor.constraint(equalTo: editorShell.trailingAnchor),
            onboardingGuide.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor),

            // Settings modal fills the editor shell
            settingsDrawer.topAnchor.constraint(equalTo: editorShell.topAnchor),
            settingsDrawer.leadingAnchor.constraint(equalTo: editorShell.leadingAnchor),
            settingsDrawer.trailingAnchor.constraint(equalTo: editorShell.trailingAnchor),
            settingsDrawer.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor),

            // Bottom-left "add artboard" button sits just above the page pill
            addArtboardButton.leadingAnchor.constraint(equalTo: editorShell.leadingAnchor, constant: 14),
            addArtboardButton.bottomAnchor.constraint(equalTo: pageSwitcher.topAnchor, constant: -8),
            addArtboardButton.widthAnchor.constraint(equalToConstant: EditorAddArtboardButton.preferredSize),
            addArtboardButton.heightAnchor.constraint(equalToConstant: EditorAddArtboardButton.preferredSize),

            // Bottom-left page switcher
            pageSwitcher.leadingAnchor.constraint(equalTo: editorShell.leadingAnchor, constant: 16),
            pageSwitcher.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor, constant: -16),
            pageSwitcher.heightAnchor.constraint(equalToConstant: PageSwitcherPillView.preferredHeight),
            pageSwitcher.widthAnchor.constraint(greaterThanOrEqualToConstant: 70),
            pageSwitcher.widthAnchor.constraint(lessThanOrEqualToConstant: 220),

            // Bottom-center zoom bar (web `absolute bottom-3`)
            bottomZoomBar.centerXAnchor.constraint(equalTo: editorShell.centerXAnchor),
            bottomZoomBar.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor, constant: -12),
            bottomZoomBar.widthAnchor.constraint(equalToConstant: StudioBottomZoomBar.preferredWidth),
            bottomZoomBar.heightAnchor.constraint(equalToConstant: StudioBottomZoomBar.preferredHeight),

            // Bottom-right AI floating button
            aiButton.trailingAnchor.constraint(equalTo: editorShell.trailingAnchor, constant: -16),
            aiButton.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor, constant: -16),
            aiButton.widthAnchor.constraint(equalToConstant: 44),
            aiButton.heightAnchor.constraint(equalToConstant: 44),

            // Selection island bar: the contextual taskbar floats at the selection's
            // outermost frame (web `use_contextual_taskbar_rect.js`), so its frame is
            // positioned imperatively in `updateIslandBarPosition()`.

            // Canvas Stage Viewport: Fills editorShell
            canvasStageView.topAnchor.constraint(equalTo: editorShell.topAnchor),
            canvasStageView.leadingAnchor.constraint(equalTo: editorShell.leadingAnchor),
            canvasStageView.trailingAnchor.constraint(equalTo: editorShell.trailingAnchor),
            canvasStageView.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor),

            // Welcome Dashboard: Fills editorShell
            welcomeDashboard.topAnchor.constraint(equalTo: editorShell.topAnchor),
            welcomeDashboard.leadingAnchor.constraint(equalTo: editorShell.leadingAnchor),
            welcomeDashboard.trailingAnchor.constraint(equalTo: editorShell.trailingAnchor),
            welcomeDashboard.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor),

            // ToolRail: Floating centered pill at top of editorShell (web `top-[14px]`,
            // p-1.5 + 44px tool buttons => 56pt tall; 11 native tools + gaps => 536pt).
            toolRail.topAnchor.constraint(equalTo: editorShell.topAnchor, constant: 14),
            toolRail.centerXAnchor.constraint(equalTo: editorShell.centerXAnchor),
            toolRail.widthAnchor.constraint(equalToConstant: 589),
            toolRail.heightAnchor.constraint(equalToConstant: 56),

            // ContextToolbar: Floating centered pill below ToolRail
            contextToolbar.topAnchor.constraint(equalTo: toolRail.bottomAnchor, constant: 8),
            contextToolbar.centerXAnchor.constraint(equalTo: editorShell.centerXAnchor),
            contextToolbar.widthAnchor.constraint(equalToConstant: 340),
            contextToolbar.heightAnchor.constraint(equalToConstant: 38),

            // Inspector Studio: Overlays canvas area inside editorShell
            inspector.topAnchor.constraint(equalTo: editorShell.topAnchor),
            inspector.leadingAnchor.constraint(equalTo: editorShell.leadingAnchor),
            inspector.trailingAnchor.constraint(equalTo: editorShell.trailingAnchor),
            inspector.bottomAnchor.constraint(equalTo: editorShell.bottomAnchor)
        ])

        updatePresentation()
    }

    private func updatePresentation() {
        welcomeDashboard.isHidden = !isWelcomeOpen
        canvasStageView.isHidden = isWelcomeOpen
        toolRail.isHidden = isWelcomeOpen
        contextToolbar.isHidden = true
        inspector.isHidden = isWelcomeOpen
        titleBar.isDashboardMode = isWelcomeOpen
        refreshChromeVisibility()
        needsDisplay = true
    }

    /// Recomputes bottom-chrome visibility for dashboard / selection / agent states.
    public func refreshChromeVisibility() {
        let dashboard = isWelcomeOpen
        pageSwitcher.isHidden = dashboard
        addArtboardButton.isHidden = dashboard
        bottomZoomBar.isHidden = dashboard
        islandBar.isHidden = dashboard || !sessionHasSelection || isAgentPanelOpen
        aiButton.isHidden = dashboard || isAgentPanelOpen
        agentPanel.isHidden = !isAgentPanelOpen || dashboard
        needsLayout = true
        updateIslandBarPosition()
    }

    // MARK: - Agent panel & onboarding presentation

    public func setAgentPanelOpen(_ open: Bool) {
        guard isAgentPanelOpen != open else { return }
        isAgentPanelOpen = open
        agentPanel.isHidden = !open
        editorTrailingToRoot.isActive = !open
        editorTrailingToPanel.isActive = open
        refreshChromeVisibility()
        needsLayout = true
        layoutSubtreeIfNeeded()
    }

    public func showOnboarding(step: Int = 0) {
        onboardingGuide.isHidden = false
        editorShell.addSubview(onboardingGuide, positioned: .above, relativeTo: nil)
        onboardingGuide.present(step: step)
        needsLayout = true
    }

    public func hideOnboarding() {
        onboardingGuide.dismiss()
        onboardingGuide.isHidden = true
    }

    public func showSettings(tab: String = "general") {
        settingsDrawer.isHidden = false
        editorShell.addSubview(settingsDrawer, positioned: .above, relativeTo: nil)
        settingsDrawer.present(tab: tab)
        needsLayout = true
    }

    public func hideSettings() {
        settingsDrawer.dismiss()
        settingsDrawer.isHidden = true
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Root Background
        ctx.setFillColor(NSColor.black.cgColor)
        ctx.fill(bounds)
    }
}
