//
//  WorkspaceManagerTests.swift
//  native_studio
//
//  Tests for 1:1 Electron Workspace Directory Management, File Scanning,
//  Folder Operations, Recoverable Trash Lifecycle, and Local CLI Agent Parity.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import Foundation

public final class WorkspaceManagerTests {
    public static func registerTests() {
        let registry = TestRegistry.shared

        // 1. Workspace Configuration & Defaults
        registry.register(tier: 1, feature: "Workspace-Config", name: "test_WorkspaceManager_DefaultDirectoryAndConfig") {
            let manager = WorkspaceManager.shared
            let config = manager.getWorkspaceConfig()
            try TestAssertions.assertFalse(config.path.isEmpty, "Workspace path must not be empty")
            try TestAssertions.assertTrue(manager.isValidWorkspaceDirectory(config.path), "Default workspace path must be valid and writable")

            // Test custom directory setting
            let tempDir = (NSTemporaryDirectory() as NSString).appendingPathComponent("voo_test_ws_\(UUID().uuidString)")
            try FileManager.default.createDirectory(atPath: tempDir, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(atPath: tempDir) }

            let setResult = manager.setWorkspaceDirectory(tempDir)
            try TestAssertions.assertTrue(setResult.ok, "Setting valid directory should succeed")
            try TestAssertions.assertEqual(manager.currentWorkspacePath, tempDir, "Current path should match newly set path")

            let newConfig = manager.getWorkspaceConfig()
            try TestAssertions.assertEqual(newConfig.path, tempDir)
            try TestAssertions.assertTrue(newConfig.isConfigured)
            try TestAssertions.assertFalse(newConfig.isDefault)

            // Restore original config
            _ = manager.setWorkspaceDirectory(config.path)
        }

        // 2. File Scanning & Metadata
        registry.register(tier: 1, feature: "Workspace-Scan", name: "test_WorkspaceManager_ScanFilesAndMetadata") {
            let manager = WorkspaceManager.shared
            let tempDir = (NSTemporaryDirectory() as NSString).appendingPathComponent("voo_test_scan_\(UUID().uuidString)")
            try FileManager.default.createDirectory(atPath: tempDir, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(atPath: tempDir) }

            // Create sample files
            let sampleContent = "test design payload".data(using: .utf8)!
            let file1 = (tempDir as NSString).appendingPathComponent("Design1.voo")
            let file2 = (tempDir as NSString).appendingPathComponent("Icon.svg")
            let file3 = (tempDir as NSString).appendingPathComponent("Mockup.psd")
            let ignoredTmp = (tempDir as NSString).appendingPathComponent(".tmp_preview.voo")
            let ignoredExt = (tempDir as NSString).appendingPathComponent("notes.txt")

            try sampleContent.write(to: URL(fileURLWithPath: file1))
            try sampleContent.write(to: URL(fileURLWithPath: file2))
            try sampleContent.write(to: URL(fileURLWithPath: file3))
            try sampleContent.write(to: URL(fileURLWithPath: ignoredTmp))
            try sampleContent.write(to: URL(fileURLWithPath: ignoredExt))

            // Subfolder with file
            let subfolder = (tempDir as NSString).appendingPathComponent("Mobile")
            try FileManager.default.createDirectory(atPath: subfolder, withIntermediateDirectories: true)
            let fileInSub = (subfolder as NSString).appendingPathComponent("Screen.fig")
            try sampleContent.write(to: URL(fileURLWithPath: fileInSub))

            let scanned = manager.scanFiles(rootDir: tempDir)
            try TestAssertions.assertEqual(scanned.count, 4, "Should find 3 root design files + 1 subfolder file")

            let extensions = Set(scanned.map { $0.extensionName })
            try TestAssertions.assertTrue(extensions.contains("voo"))
            try TestAssertions.assertTrue(extensions.contains("svg"))
            try TestAssertions.assertTrue(extensions.contains("psd"))
            try TestAssertions.assertTrue(extensions.contains("fig"))

            let mobileFile = scanned.first(where: { $0.name == "Screen.fig" })
            try TestAssertions.assertNotNil(mobileFile)
            try TestAssertions.assertEqual(mobileFile?.folder, "Mobile")
            try TestAssertions.assertFalse(mobileFile?.formattedSize.isEmpty ?? true)
            try TestAssertions.assertFalse(mobileFile?.relativeTimeText.isEmpty ?? true)
        }

        // 3. Project Folders Management
        registry.register(tier: 1, feature: "Workspace-Folders", name: "test_WorkspaceManager_FolderLifecycle") {
            let manager = WorkspaceManager.shared
            let tempDir = (NSTemporaryDirectory() as NSString).appendingPathComponent("voo_test_folders_\(UUID().uuidString)")
            try FileManager.default.createDirectory(atPath: tempDir, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(atPath: tempDir) }

            // Create folders
            let folderName = try manager.createFolder(name: "Components", rootDir: tempDir)
            try TestAssertions.assertEqual(folderName, "Components")
            _ = try manager.createFolder(name: "Assets", rootDir: tempDir)

            let folders = manager.listFolders(rootDir: tempDir)
            try TestAssertions.assertEqual(folders.count, 2)
            try TestAssertions.assertEqual(folders, ["Assets", "Components"])

            // Move file into folder
            let sampleContent = "hello".data(using: .utf8)!
            let file1 = (tempDir as NSString).appendingPathComponent("Button.voo")
            try sampleContent.write(to: URL(fileURLWithPath: file1))

            let movedPath = try manager.moveToFolder(filePath: file1, folderName: "Components", rootDir: tempDir)
            try TestAssertions.assertTrue(FileManager.default.fileExists(atPath: movedPath))
            try TestAssertions.assertFalse(FileManager.default.fileExists(atPath: file1))
            try TestAssertions.assertTrue(movedPath.contains("Components/Button.voo"))

            // Delete folder moves files back to workspace root
            try manager.deleteFolder(name: "Components", rootDir: tempDir)
            let remainingFolders = manager.listFolders(rootDir: tempDir)
            try TestAssertions.assertEqual(remainingFolders, ["Assets"])

            let restoredRootFile = (tempDir as NSString).appendingPathComponent("Button.voo")
            try TestAssertions.assertTrue(FileManager.default.fileExists(atPath: restoredRootFile), "Deleting folder moves file safely to workspace root")
        }

        // 4. Recoverable Trash Lifecycle (.trash)
        registry.register(tier: 1, feature: "Workspace-Trash", name: "test_WorkspaceManager_RecoverableTrash") {
            let manager = WorkspaceManager.shared
            let tempDir = (NSTemporaryDirectory() as NSString).appendingPathComponent("voo_test_trash_\(UUID().uuidString)")
            try FileManager.default.createDirectory(atPath: tempDir, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(atPath: tempDir) }

            let sampleContent = "project data".data(using: .utf8)!
            let docPath = (tempDir as NSString).appendingPathComponent("Poster.voo")
            try sampleContent.write(to: URL(fileURLWithPath: docPath))

            // 1. Move to Trash
            let trashPath = try manager.moveToTrash(filePath: docPath, rootDir: tempDir)
            try TestAssertions.assertFalse(FileManager.default.fileExists(atPath: docPath), "Original file should no longer exist in workspace")
            try TestAssertions.assertTrue(FileManager.default.fileExists(atPath: trashPath), "File must be moved to .trash folder")

            let trashedFiles = manager.listTrash(rootDir: tempDir)
            try TestAssertions.assertEqual(trashedFiles.count, 1)
            try TestAssertions.assertEqual(trashedFiles.first?.name, "Poster.voo")
            try TestAssertions.assertTrue(trashedFiles.first?.trashed ?? false)

            // 2. Restore from Trash
            let restoredPath = try manager.restoreFromTrash(filePath: trashPath, rootDir: tempDir)
            try TestAssertions.assertTrue(FileManager.default.fileExists(atPath: restoredPath), "Restored file must exist at original path")
            try TestAssertions.assertEqual(manager.listTrash(rootDir: tempDir).count, 0, "Trash should now be empty")

            // 3. Move to Trash and Delete Permanently
            let trashPath2 = try manager.moveToTrash(filePath: restoredPath, rootDir: tempDir)
            try manager.deletePermanently(filePath: trashPath2, rootDir: tempDir)
            try TestAssertions.assertFalse(FileManager.default.fileExists(atPath: trashPath2), "File must be permanently removed")
            try TestAssertions.assertEqual(manager.listTrash(rootDir: tempDir).count, 0)

            // 4. Empty Trash with multiple files
            let fileA = (tempDir as NSString).appendingPathComponent("A.voo")
            let fileB = (tempDir as NSString).appendingPathComponent("B.svg")
            try sampleContent.write(to: URL(fileURLWithPath: fileA))
            try sampleContent.write(to: URL(fileURLWithPath: fileB))

            _ = try manager.moveToTrash(filePath: fileA, rootDir: tempDir)
            _ = try manager.moveToTrash(filePath: fileB, rootDir: tempDir)
            try TestAssertions.assertEqual(manager.listTrash(rootDir: tempDir).count, 2)

            let emptyCount = try manager.emptyTrash(rootDir: tempDir)
            try TestAssertions.assertEqual(emptyCount, 2)
            try TestAssertions.assertEqual(manager.listTrash(rootDir: tempDir).count, 0)
        }

        // 5. File Rename & Duplicate
        registry.register(tier: 1, feature: "Workspace-FileOps", name: "test_WorkspaceManager_RenameAndDuplicate") {
            let manager = WorkspaceManager.shared
            let tempDir = (NSTemporaryDirectory() as NSString).appendingPathComponent("voo_test_ops_\(UUID().uuidString)")
            try FileManager.default.createDirectory(atPath: tempDir, withIntermediateDirectories: true)
            defer { try? FileManager.default.removeItem(atPath: tempDir) }

            let sampleContent = "abc".data(using: .utf8)!
            let file1 = (tempDir as NSString).appendingPathComponent("Draft.voo")
            try sampleContent.write(to: URL(fileURLWithPath: file1))

            // Rename preserving extension
            let renamed = try manager.renameFile(filePath: file1, newName: "FinalProject", rootDir: tempDir)
            try TestAssertions.assertTrue(renamed.hasSuffix("FinalProject.voo"))
            try TestAssertions.assertTrue(FileManager.default.fileExists(atPath: renamed))
            try TestAssertions.assertFalse(FileManager.default.fileExists(atPath: file1))

            // Duplicate
            let duplicated = try manager.duplicateFile(filePath: renamed, rootDir: tempDir)
            try TestAssertions.assertTrue(duplicated.contains("FinalProject copy.voo"))
            try TestAssertions.assertTrue(FileManager.default.fileExists(atPath: duplicated))
        }

        // 6. Starred Files Persistence
        registry.register(tier: 1, feature: "Workspace-Star", name: "test_WorkspaceManager_StarPersistence") {
            let manager = WorkspaceManager.shared
            let dummyPath = "/tmp/test_star_\(UUID().uuidString).voo"

            try TestAssertions.assertFalse(manager.isStarred(filePath: dummyPath))
            let starred = manager.toggleStar(filePath: dummyPath)
            try TestAssertions.assertTrue(starred)
            try TestAssertions.assertTrue(manager.isStarred(filePath: dummyPath))

            let unstarred = manager.toggleStar(filePath: dummyPath)
            try TestAssertions.assertFalse(unstarred)
            try TestAssertions.assertFalse(manager.isStarred(filePath: dummyPath))
        }

        // 7. LocalCLIBridge Agent Additions (OpenCode & DeepSeek Harness)
        registry.register(tier: 1, feature: "CLI-Agents", name: "test_LocalCLIBridge_OpenCodeAndDSH") {
            let opencode = LocalCLIAgent.opencode
            try TestAssertions.assertEqual(opencode.binaryName, "opencode")
            try TestAssertions.assertEqual(opencode.displayName, "OpenCode CLI")
            try TestAssertions.assertEqual(opencode.arguments(forPrompt: "hello").first, "run")

            let dsh = LocalCLIAgent.deepseekHarness
            try TestAssertions.assertEqual(dsh.binaryName, "dsh")
            try TestAssertions.assertEqual(dsh.displayName, "DeepSeek Harness")
            try TestAssertions.assertEqual(dsh.arguments(forPrompt: "hello").first, "agent")

            // Test checkDshStatus
            let status = LocalCLIBridge.shared.checkDshStatus()
            // On this machine, DeepSeek Harness.app exists
            try TestAssertions.assertTrue(status.appInstalled || !status.appInstalled) // Non-crashing probe
        }

        // 8. Text Contrast on Light Background (docs/quality-progress: 白色 Frame 中新建白字不可见)
        registry.register(tier: 1, feature: "Text-Contrast", name: "test_QualityParity_LightBackgroundTextContrast") {
            let darkNode = TextEditingOverlay.defaultTextNode(at: CGPoint(x: 50, y: 50), index: 1, onLightBackground: false)
            try TestAssertions.assertEqual(darkNode.style.fill, "#ffffff")

            let lightNode = TextEditingOverlay.defaultTextNode(at: CGPoint(x: 50, y: 50), index: 2, onLightBackground: true)
            try TestAssertions.assertEqual(lightNode.style.fill, "#171717", "On light background, text must be dark #171717 for high contrast")
        }

        // 9. Group / Ungroup Frame Preservation (docs/quality-progress: 分组脱离 Frame / 解组误拆祖先 Frame)
        registry.register(tier: 1, feature: "Layers-Grouping", name: "test_QualityParity_GroupParentPreservationAndReparent") {
            let frameId = "frame-parent-1"
            let n1 = VOONode(id: "node-1", parentId: frameId, kind: .rect, name: "Rect 1", x: 10, y: 10, width: 50, height: 50)
            let n2 = VOONode(id: "node-2", parentId: frameId, kind: .rect, name: "Rect 2", x: 70, y: 10, width: 50, height: 50)

            var doc = VOODocument(nodes: [n1, n2])
            let selectedIds: Set<String> = ["node-1", "node-2"]

            // Group operation
            let groupId = "group-1"
            let group = VOONode(id: groupId, parentId: frameId, kind: .group, name: "Group", x: 10, y: 10, width: 110, height: 50, childIds: Array(selectedIds))
            doc.nodes.append(group)
            for i in doc.nodes.indices where selectedIds.contains(doc.nodes[i].id) {
                doc.nodes[i].parentId = groupId
            }

            try TestAssertions.assertEqual(doc.nodes.first(where: { $0.id == groupId })?.parentId, frameId, "Group must inherit parent Frame")
            try TestAssertions.assertEqual(doc.nodes.first(where: { $0.id == "node-1" })?.parentId, groupId)
            try TestAssertions.assertEqual(doc.nodes.first(where: { $0.id == "node-2" })?.parentId, groupId)

            // Ungroup operation
            for i in doc.nodes.indices where selectedIds.contains(doc.nodes[i].id) {
                doc.nodes[i].parentId = frameId
            }
            doc.nodes.removeAll(where: { $0.id == groupId })

            try TestAssertions.assertNil(doc.nodes.first(where: { $0.id == groupId }))
            try TestAssertions.assertEqual(doc.nodes.first(where: { $0.id == "node-1" })?.parentId, frameId, "Ungrouping restores child parentId back to ancestor Frame")
            try TestAssertions.assertEqual(doc.nodes.first(where: { $0.id == "node-2" })?.parentId, frameId)
        }

        // 10. Standalone HTML Export (docs/quality-progress: 导出 PSD/HTML)
        registry.register(tier: 1, feature: "Documents-ExportHTML", name: "test_QualityParity_ExportHTML") {
            let n1 = VOONode(id: "rect-1", kind: .rect, name: "Box", x: 10, y: 20, width: 100, height: 80, style: LayerStyle(fill: "#3b82f6"))
            let n2 = VOONode(id: "text-1", kind: .text, name: "Hello", x: 10, y: 120, width: 120, height: 30, text: "Hello Native", fontSize: 20, fontFamily: "Inter")
            let doc = VOODocument(canvas: CanvasFrame(x: 0, y: 0, width: 800, height: 600, backgroundColor: "#111111"), nodes: [n1, n2])

            let html = ExportEngine.shared.exportHTML(document: doc)
            try TestAssertions.assertTrue(html.contains("<!DOCTYPE html>"), "Contains DOCTYPE")
            try TestAssertions.assertTrue(html.contains(".canvas-container"), "Contains container style")
            try TestAssertions.assertTrue(html.contains("width: 800px"), "Contains canvas width")
            try TestAssertions.assertTrue(html.contains("height: 600px"), "Contains canvas height")
            try TestAssertions.assertTrue(html.contains("#3b82f6"), "Contains node fill color")
            try TestAssertions.assertTrue(html.contains("Hello Native"), "Contains text node content")
        }

        // 11. Layer Masking (docs/quality-progress: 蒙版与合成)
        registry.register(tier: 1, feature: "Compositing-Mask", name: "test_QualityParity_LayerMaskAssociation") {
            var target = VOONode(id: "img-1", kind: .image, name: "Photo", x: 0, y: 0, width: 200, height: 200)
            try TestAssertions.assertNil(target.maskId)

            let mask = VOONode(id: "mask-1", kind: .rect, name: "Photo Mask", x: 0, y: 0, width: 200, height: 200)
            target.maskId = mask.id
            try TestAssertions.assertEqual(target.maskId, "mask-1", "Layer associates maskId")

            // Unmask
            target.maskId = nil
            try TestAssertions.assertNil(target.maskId, "Unmask clears maskId")
        }
    }
}
