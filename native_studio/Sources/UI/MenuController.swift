//
//  MenuController.swift
//  native_studio
//
//  Authoritative Native macOS Main Menu Bar & Menu Item Action Protocol.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

// MARK: - Menu Action Protocol

@objc public protocol StudioMenuActions: AnyObject {
    func newDocument(_ sender: Any?)
    func openDocument(_ sender: Any?)
    func importImageAction(_ sender: Any?)
    func saveDocument(_ sender: Any?)
    func saveDocumentAs(_ sender: Any?)
    func exportDocument(_ sender: Any?)

    func undoAction(_ sender: Any?)
    func redoAction(_ sender: Any?)
    func cutAction(_ sender: Any?)
    func copyAction(_ sender: Any?)
    func pasteAction(_ sender: Any?)
    func deleteAction(_ sender: Any?)
    func duplicateAction(_ sender: Any?)
    func selectAllAction(_ sender: Any?)
    func deselectAllAction(_ sender: Any?)

    func groupAction(_ sender: Any?)
    func ungroupAction(_ sender: Any?)
    func convertToCurvesAction(_ sender: Any?)
    func closeCurveAction(_ sender: Any?)
    func reverseCurveAction(_ sender: Any?)
    func smoothCurveAction(_ sender: Any?)
    func booleanUnionAction(_ sender: Any?)
    func booleanSubtractAction(_ sender: Any?)
    func booleanIntersectAction(_ sender: Any?)
    func booleanXorAction(_ sender: Any?)
    func booleanDivideAction(_ sender: Any?)

    func zoomInAction(_ sender: Any?)
    func zoomOutAction(_ sender: Any?)
    func zoomActualAction(_ sender: Any?)
    func zoomFitAction(_ sender: Any?)
    func toggleRulersAction(_ sender: Any?)
    func showOnboardingAction(_ sender: Any?)
    func showSettingsAction(_ sender: Any?)
    func toggleAgentPanelAction(_ sender: Any?)
    func alignSelectionAction(_ sender: Any?)
    func distributeSelectionAction(_ sender: Any?)
    func toggleGridAction(_ sender: Any?)
    func toggleSnappingAction(_ sender: Any?)
    func bringForwardAction(_ sender: Any?)
    func sendBackwardAction(_ sender: Any?)
    func bringToFrontAction(_ sender: Any?)
    func sendToBackAction(_ sender: Any?)
}

@objc public protocol DocumentOpener: AnyObject {
    func openDocumentFromURL(_ url: URL)
}

// MARK: - Menu Bar Builder

public final class MenuController: NSObject, @unchecked Sendable {
    public static let shared = MenuController()

    public func buildMainMenu() -> NSMenu {
        let mainMenu = NSMenu()

        // 1. Application Menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu(title: "VOO Design Native")
        appMenuItem.submenu = appMenu
        appMenu.addItem(withTitle: "关于 VOO Design Native", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "偏好设置…", action: #selector(StudioMenuActions.showSettingsAction(_:)), keyEquivalent: ",")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "隐藏 VOO Design", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "全部显示", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "退出 VOO Design Native", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        // 2. File Menu
        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "文件 (File)")
        fileMenuItem.submenu = fileMenu

        fileMenu.addItem(withTitle: "新建 (New)", action: #selector(StudioMenuActions.newDocument(_:)), keyEquivalent: "n")
        fileMenu.addItem(withTitle: "打开… (Open)", action: #selector(StudioMenuActions.openDocument(_:)), keyEquivalent: "o")
        let importImage = fileMenu.addItem(withTitle: "导入图片… (Import Image…)", action: #selector(StudioMenuActions.importImageAction(_:)), keyEquivalent: "I")
        importImage.keyEquivalentModifierMask = [.command, .shift]

        // Recent Files Submenu
        let recentItem = NSMenuItem(title: "最近打开 (Open Recent)", action: nil, keyEquivalent: "")
        let recentMenu = NSMenu(title: "最近打开")
        recentItem.submenu = recentMenu
        buildRecentMenu(recentMenu)
        fileMenu.addItem(recentItem)

        fileMenu.addItem(withTitle: "关闭 (Close)", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(withTitle: "保存 (Save)", action: #selector(StudioMenuActions.saveDocument(_:)), keyEquivalent: "s")
        let saveAs = fileMenu.addItem(withTitle: "另存为… (Save As)", action: #selector(StudioMenuActions.saveDocumentAs(_:)), keyEquivalent: "S")
        saveAs.keyEquivalentModifierMask = [.command, .shift]
        fileMenu.addItem(NSMenuItem.separator())
        let exportItem = fileMenu.addItem(withTitle: "导出… (Export)", action: #selector(StudioMenuActions.exportDocument(_:)), keyEquivalent: "e")
        exportItem.keyEquivalentModifierMask = [.command, .shift]

        // 3. Edit Menu
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "编辑 (Edit)")
        editMenuItem.submenu = editMenu

        editMenu.addItem(withTitle: "撤销 (Undo)", action: #selector(StudioMenuActions.undoAction(_:)), keyEquivalent: "z")
        let redoItem = editMenu.addItem(withTitle: "重做 (Redo)", action: #selector(StudioMenuActions.redoAction(_:)), keyEquivalent: "Z")
        redoItem.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "剪切 (Cut)", action: #selector(StudioMenuActions.cutAction(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制 (Copy)", action: #selector(StudioMenuActions.copyAction(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴 (Paste)", action: #selector(StudioMenuActions.pasteAction(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "创建副本 (Duplicate)", action: #selector(StudioMenuActions.duplicateAction(_:)), keyEquivalent: "d")
        editMenu.addItem(withTitle: "删除 (Delete)", action: #selector(StudioMenuActions.deleteAction(_:)), keyEquivalent: "\u{08}")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "全选 (Select All)", action: #selector(StudioMenuActions.selectAllAction(_:)), keyEquivalent: "a")
        let deselect = editMenu.addItem(withTitle: "取消选择 (Deselect All)", action: #selector(StudioMenuActions.deselectAllAction(_:)), keyEquivalent: "d")
        deselect.keyEquivalentModifierMask = [.command, .shift]

        // 4. Geometry & Layer Menu
        let geomMenuItem = NSMenuItem()
        mainMenu.addItem(geomMenuItem)
        let geomMenu = NSMenu(title: "图层与几何 (Geometry)")
        geomMenuItem.submenu = geomMenu

        geomMenu.addItem(withTitle: "编组 (Group)", action: #selector(StudioMenuActions.groupAction(_:)), keyEquivalent: "g")
        let ungroup = geomMenu.addItem(withTitle: "取消编组 (Ungroup)", action: #selector(StudioMenuActions.ungroupAction(_:)), keyEquivalent: "g")
        ungroup.keyEquivalentModifierMask = [.command, .shift]
        geomMenu.addItem(NSMenuItem.separator())
        let convCurve = geomMenu.addItem(withTitle: "转换为曲线 (Convert to Curves)", action: #selector(StudioMenuActions.convertToCurvesAction(_:)), keyEquivalent: "O")
        convCurve.keyEquivalentModifierMask = [.command, .shift]
        geomMenu.addItem(withTitle: "闭合曲线 (Close Curve)", action: #selector(StudioMenuActions.closeCurveAction(_:)), keyEquivalent: "")
        geomMenu.addItem(withTitle: "反转曲线 (Reverse Curve)", action: #selector(StudioMenuActions.reverseCurveAction(_:)), keyEquivalent: "")
        geomMenu.addItem(withTitle: "平滑曲线 (Smooth Curve)", action: #selector(StudioMenuActions.smoothCurveAction(_:)), keyEquivalent: "")
        geomMenu.addItem(NSMenuItem.separator())
        geomMenu.addItem(withTitle: "布尔并集 (Union / Add)", action: #selector(StudioMenuActions.booleanUnionAction(_:)), keyEquivalent: "")
        geomMenu.addItem(withTitle: "布尔减去 (Subtract)", action: #selector(StudioMenuActions.booleanSubtractAction(_:)), keyEquivalent: "")
        geomMenu.addItem(withTitle: "布尔相交 (Intersect)", action: #selector(StudioMenuActions.booleanIntersectAction(_:)), keyEquivalent: "")
        geomMenu.addItem(withTitle: "布尔异或 (Xor)", action: #selector(StudioMenuActions.booleanXorAction(_:)), keyEquivalent: "")
        geomMenu.addItem(withTitle: "布尔面片分割 (Divide)", action: #selector(StudioMenuActions.booleanDivideAction(_:)), keyEquivalent: "")
        geomMenu.addItem(NSMenuItem.separator())
        for (title, key, symbol) in [("左对齐 (Align Left)", "left", "{"),
                                     ("水平居中 (Align Center)", "center", "{"),
                                     ("右对齐 (Align Right)", "right", "{"),
                                     ("顶对齐 (Align Top)", "top", "{"),
                                     ("垂直居中 (Align Middle)", "middle", "{"),
                                     ("底对齐 (Align Bottom)", "bottom", "{"),
                                     ("水平等距分布 (Distribute H)", "distributeH", "{"),
                                     ("垂直等距分布 (Distribute V)", "distributeV", "{")] {
            _ = symbol
            let selector = key.hasPrefix("distribute")
                ? #selector(StudioMenuActions.distributeSelectionAction(_:))
                : #selector(StudioMenuActions.alignSelectionAction(_:))
            let item = geomMenu.addItem(withTitle: title, action: selector, keyEquivalent: "")
            item.representedObject = key
        }

        geomMenu.addItem(NSMenuItem.separator())
        geomMenu.addItem(withTitle: "上移一层 (Bring Forward)", action: #selector(StudioMenuActions.bringForwardAction(_:)), keyEquivalent: "]")
        geomMenu.addItem(withTitle: "下移一层 (Send Backward)", action: #selector(StudioMenuActions.sendBackwardAction(_:)), keyEquivalent: "[")
        let bringToFront = geomMenu.addItem(withTitle: "置顶 (Bring to Front)", action: #selector(StudioMenuActions.bringToFrontAction(_:)), keyEquivalent: "]")
        bringToFront.keyEquivalentModifierMask = [.command]
        let sendToBack = geomMenu.addItem(withTitle: "置底 (Send to Back)", action: #selector(StudioMenuActions.sendToBackAction(_:)), keyEquivalent: "[")
        sendToBack.keyEquivalentModifierMask = [.command]

        // 5. View Menu
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "视图 (View)")
        viewMenuItem.submenu = viewMenu

        viewMenu.addItem(withTitle: "放大 (Zoom In)", action: #selector(StudioMenuActions.zoomInAction(_:)), keyEquivalent: "=")
        viewMenu.addItem(withTitle: "缩小 (Zoom Out)", action: #selector(StudioMenuActions.zoomOutAction(_:)), keyEquivalent: "-")
        viewMenu.addItem(withTitle: "实际大小 100% (Actual Size)", action: #selector(StudioMenuActions.zoomActualAction(_:)), keyEquivalent: "1")
        viewMenu.addItem(withTitle: "自适应画板 (Zoom to Fit)", action: #selector(StudioMenuActions.zoomFitAction(_:)), keyEquivalent: "0")
        viewMenu.addItem(NSMenuItem.separator())
        let toggleRulers = viewMenu.addItem(withTitle: "显示/隐藏标尺 (Toggle Rulers)", action: #selector(StudioMenuActions.toggleRulersAction(_:)), keyEquivalent: "R")
        toggleRulers.keyEquivalentModifierMask = [.shift]
        viewMenu.addItem(NSMenuItem.separator())
        viewMenu.addItem(withTitle: "显示网格 (Toggle Grid)", action: #selector(StudioMenuActions.toggleGridAction(_:)), keyEquivalent: "'")
        viewMenu.addItem(withTitle: "磁性吸附 (Toggle Snapping)", action: #selector(StudioMenuActions.toggleSnappingAction(_:)), keyEquivalent: ";")
        viewMenu.addItem(NSMenuItem.separator())
        viewMenu.addItem(withTitle: "新手引导 (Onboarding Guide)", action: #selector(StudioMenuActions.showOnboardingAction(_:)), keyEquivalent: "")
        viewMenu.addItem(NSMenuItem.separator())
        let agentItem = viewMenu.addItem(withTitle: "智能体面板 (Toggle AI Agent Panel)", action: #selector(StudioMenuActions.toggleAgentPanelAction(_:)), keyEquivalent: "\\")
        agentItem.keyEquivalentModifierMask = [.command]

        // 6. Window Menu
        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "窗口 (Window)")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")

        // 7. Help Menu
        let helpMenuItem = NSMenuItem()
        mainMenu.addItem(helpMenuItem)
        let helpMenu = NSMenu(title: "帮助 (Help)")
        helpMenuItem.submenu = helpMenu
        helpMenu.addItem(withTitle: "VOO Design 帮助与快捷键", action: #selector(showHelp), keyEquivalent: "?")

        return mainMenu
    }

    private func buildRecentMenu(_ menu: NSMenu) {
        menu.removeAllItems()
        let paths = RecentFilesManager.shared.recentFilePaths
        if paths.isEmpty {
            let empty = NSMenuItem(title: "无最近文件 (No Recent Files)", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
        } else {
            for path in paths {
                let name = (path as NSString).lastPathComponent
                let item = NSMenuItem(title: name, action: #selector(openRecentPath(_:)), keyEquivalent: "")
                item.representedObject = path
                menu.addItem(item)
            }
            menu.addItem(NSMenuItem.separator())
            menu.addItem(withTitle: "清除菜单 (Clear Menu)", action: #selector(clearRecents), keyEquivalent: "")
        }
    }

    @objc private func openRecentPath(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        let url = URL(fileURLWithPath: path)
        if let target = (NSApp.keyWindow?.windowController as? DocumentOpener) ??
                        (NSApp.windows.first?.windowController as? DocumentOpener) {
            target.openDocumentFromURL(url)
        }
    }

    @objc private func clearRecents() {
        RecentFilesManager.shared.clearRecentFiles()
        if let fileMenu = NSApp.mainMenu?.items[1].submenu,
           let recentItem = fileMenu.items.first(where: { $0.title.contains("Recent") }),
           let recentSubmenu = recentItem.submenu {
            buildRecentMenu(recentSubmenu)
        }
    }

    @objc private func showAbout() {
        let alert = NSAlert()
        alert.messageText = "VOO Design Native Studio"
        alert.informativeText = "High-Performance macOS Vector & Raster Studio\nSwift 6 + AppKit + Metal Hardware Pipeline\nVersion 1.0.0 (Universal Apple Silicon)"
        alert.alertStyle = .informational
        alert.runModal()
    }

    @objc private func showHelp() {
        let alert = NSAlert()
        alert.messageText = "VOO Design 快捷键速查"
        alert.informativeText = """
        • V: 选择与移动工具 (Move)
        • P: 钢笔与贝塞尔曲线工具 (Pen)
        • B: 动力学笔刷工具 (Brush)
        • T: 文本工具 (Text)
        • R: 矩形/形状工具 (Shapes)
        • ⌘Z / ⇧⌘Z: 撤销 / 重做
        • ⌘C / ⌘V / ⌘X: 复制 / 粘贴 / 剪切
        • ⌘D: 创建副本 (Duplicate)
        • ⌘G / ⇧⌘G: 编组 / 取消编组
        • ⇧R: 显示/隐藏双向自适应标尺
        • 空格 + 拖拽: 画布平移
        • ⌘+ / ⌘-: 画布缩放
        • ⌘0: 自适应画板居中
        • ⌘1: 实际大小 100%
        """
        alert.alertStyle = .informational
        alert.runModal()
    }
}
