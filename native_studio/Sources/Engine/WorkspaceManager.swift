//
//  WorkspaceManager.swift
//  native_studio
//
//  1:1 native Swift replication of Electron's workspace_manager.cjs and workspace-trash.cjs.
//  Provides workspace directory management, file scanning, folder operations,
//  recoverable trash (.trash) lifecycle, file operations, and live file watching.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

// MARK: - Workspace File Model

public struct WorkspaceFile: Sendable, Equatable, Identifiable {
    public var id: String { path }
    public var name: String
    public var path: String
    public var folder: String?
    public var extensionName: String
    public var size: Int64
    public var updatedAt: Int64
    public var createdAt: Int64
    public var starred: Bool
    public var trashed: Bool
    public var trashedAt: Int64?
    public var isFolder: Bool

    public init(
        name: String,
        path: String,
        folder: String? = nil,
        extensionName: String,
        size: Int64,
        updatedAt: Int64,
        createdAt: Int64,
        starred: Bool = false,
        trashed: Bool = false,
        trashedAt: Int64? = nil,
        isFolder: Bool = false
    ) {
        self.name = name
        self.path = path
        self.folder = folder
        self.extensionName = extensionName.lowercased()
        self.size = size
        self.updatedAt = updatedAt
        self.createdAt = createdAt
        self.starred = starred
        self.trashed = trashed
        self.trashedAt = trashedAt
        self.isFolder = isFolder
    }

    /// Formatted human-readable size (e.g., "128 KB", "2.4 MB")
    public var formattedSize: String {
        if isFolder { return "Folder" }
        if size < 1024 { return "\(size) B" }
        let kb = Double(size) / 1024.0
        if kb < 1024.0 { return String(format: "%.0f KB", kb) }
        let mb = kb / 1024.0
        return String(format: "%.1f MB", mb)
    }

    /// Formatted relative update time (e.g. "Just now", "2m ago", "Today", "Yesterday")
    public var relativeTimeText: String {
        let now = Date().timeIntervalSince1970 * 1000.0
        let diffMs = max(0, now - Double(updatedAt))
        let diffSec = diffMs / 1000.0
        if diffSec < 60 { return "Just now" }
        let diffMin = diffSec / 60.0
        if diffMin < 60 { return "\(Int(diffMin))m ago" }
        let diffHours = diffMin / 60.0
        if diffHours < 24 { return "\(Int(diffHours))h ago" }
        let diffDays = diffHours / 24.0
        if diffDays < 2 { return "Yesterday" }
        if diffDays < 7 { return "\(Int(diffDays))d ago" }
        let date = Date(timeIntervalSince1970: Double(updatedAt) / 1000.0)
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}

// MARK: - Workspace Configuration

public struct WorkspaceConfig: Sendable, Equatable {
    public var type: String = "native"
    public var path: String
    public var isDefault: Bool
    public var isConfigured: Bool

    public init(path: String, isDefault: Bool, isConfigured: Bool) {
        self.type = "native"
        self.path = path
        self.isDefault = isDefault
        self.isConfigured = isConfigured
    }
}

// MARK: - Trash Index Record

private struct TrashRecord: Codable {
    var relativePath: String
    var trashedAt: Int64?
    var isDirectory: Bool?
}

// MARK: - Workspace Manager

public final class WorkspaceManager: @unchecked Sendable {
    public static let shared = WorkspaceManager()

    public static let allowedExtensions: Set<String> = ["voo", "fig", "psd", "svg"]
    public static let maxScanEntries: Int = 500
    public static let configFile: String = "projects_config.json"
    public static let trashDirectoryName: String = ".trash"
    public static let trashIndexName: String = ".index.json"

    private let fileManager = FileManager.default
    private let lock = NSRecursiveLock()

    // Watcher state
    private var fileWatcherSource: DispatchSourceFileSystemObject?
    private var fileWatcherFD: Int32 = -1
    private var watcherDebounceWorkItem: DispatchWorkItem?

    /// Change notification callback (broadcast when files are added, removed, modified, or trashed)
    public var onWorkspaceChanged: (() -> Void)?

    public init() {
        // Ensure default directory exists
        let defaultDir = defaultDirectoryPath()
        if !fileManager.fileExists(atPath: defaultDir) {
            try? fileManager.createDirectory(atPath: defaultDir, withIntermediateDirectories: true)
        }
        setupWatcher()
    }

    deinit {
        stopWatcher()
    }

    // MARK: - Path Resolution

    public func userDataDirectory() -> String {
        if let env = ProcessInfo.processInfo.environment["VOO_USER_DATA_DIR"], !env.isEmpty {
            return (env as NSString).standardizingPath
        }
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.path
            ?? ("~/Library/Application Support" as NSString).expandingTildeInPath
        let dir = (appSupport as NSString).appendingPathComponent("VOO Design")
        do {
            if !fileManager.fileExists(atPath: dir) {
                try fileManager.createDirectory(atPath: dir, withIntermediateDirectories: true)
            }
            if fileManager.isWritableFile(atPath: dir) {
                return dir
            }
        } catch {}
        let fallback = (NSTemporaryDirectory() as NSString).appendingPathComponent("VOO_Design_UserData")
        try? fileManager.createDirectory(atPath: fallback, withIntermediateDirectories: true)
        return fallback
    }

    public func documentsRootDirectory() -> String {
        if let env = ProcessInfo.processInfo.environment["VOO_DOCUMENTS_ROOT"], !env.isEmpty {
            return (env as NSString).standardizingPath
        }
        let docs = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first?.path
            ?? ("~/Documents" as NSString).expandingTildeInPath
        return docs
    }

    public func defaultDirectoryPath() -> String {
        let root = documentsRootDirectory()
        let dir = ((root as NSString).appendingPathComponent("VOO") as NSString).appendingPathComponent("Projects")
        do {
            if !fileManager.fileExists(atPath: dir) {
                try fileManager.createDirectory(atPath: dir, withIntermediateDirectories: true)
            }
            if fileManager.isWritableFile(atPath: dir) {
                return dir
            }
        } catch {}
        let fallback = ((NSTemporaryDirectory() as NSString).appendingPathComponent("VOO") as NSString).appendingPathComponent("Projects")
        try? fileManager.createDirectory(atPath: fallback, withIntermediateDirectories: true)
        return fallback
    }

    public func configFilePath() -> String {
        let userDir = userDataDirectory()
        return (userDir as NSString).appendingPathComponent(Self.configFile)
    }

    // MARK: - Validation

    public func isValidWorkspaceDirectory(_ path: String) -> Bool {
        let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let resolved = (trimmed as NSString).standardizingPath
        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: resolved, isDirectory: &isDir), isDir.boolValue else {
            return false
        }
        return fileManager.isWritableFile(atPath: resolved)
    }

    private func isInside(root: String, target: String) -> Bool {
        let resolvedRoot = URL(fileURLWithPath: (root as NSString).standardizingPath).resolvingSymlinksInPath().path
        let resolvedTarget = URL(fileURLWithPath: (target as NSString).standardizingPath).resolvingSymlinksInPath().path
        if resolvedTarget == resolvedRoot { return false }
        return resolvedTarget.hasPrefix(resolvedRoot.hasSuffix("/") ? resolvedRoot : resolvedRoot + "/")
    }

    // MARK: - Configuration I/O

    public func getWorkspaceConfig() -> WorkspaceConfig {
        lock.lock()
        defer { lock.unlock() }

        let cfgPath = configFilePath()
        var configuredRoot: String?
        var isConfigured = false

        if fileManager.fileExists(atPath: cfgPath),
           let data = try? Data(contentsOf: URL(fileURLWithPath: cfgPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let candidate = json["workspaceRoot"] as? String ?? json["projectsRoot"] as? String {
                let resolved = (candidate as NSString).standardizingPath
                if isValidWorkspaceDirectory(resolved) {
                    configuredRoot = resolved
                    isConfigured = true
                }
            }
        }

        let activePath = configuredRoot ?? defaultDirectoryPath()
        return WorkspaceConfig(path: activePath, isDefault: !isConfigured, isConfigured: isConfigured)
    }

    public var currentWorkspacePath: String {
        return getWorkspaceConfig().path
    }

    @discardableResult
    public func setWorkspaceDirectory(_ targetPath: String) -> (ok: Bool, error: String?) {
        lock.lock()
        defer { lock.unlock() }

        let trimmed = targetPath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return (false, "invalid_path") }
        let resolved = (trimmed as NSString).standardizingPath
        guard isValidWorkspaceDirectory(resolved) else { return (false, "invalid_directory") }

        let cfgPath = configFilePath()
        var current: [String: Any] = [:]
        if fileManager.fileExists(atPath: cfgPath),
           let data = try? Data(contentsOf: URL(fileURLWithPath: cfgPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            current = json
        }

        current["workspaceRoot"] = resolved
        current["projectsRoot"] = resolved
        current["updatedAt"] = Int64(Date().timeIntervalSince1970 * 1000)

        do {
            let data = try JSONSerialization.data(withJSONObject: current, options: [.prettyPrinted])
            try data.write(to: URL(fileURLWithPath: cfgPath))
            setupWatcher()
            notifyChanged()
            return (true, nil)
        } catch {
            return (false, error.localizedDescription)
        }
    }

    // MARK: - Starred Files Persistence

    public func isStarred(filePath: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        let set = starredFilePaths()
        let normalized = (filePath as NSString).standardizingPath
        return set.contains(normalized)
    }

    public func toggleStar(filePath: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        let normalized = (filePath as NSString).standardizingPath
        var set = starredFilePaths()
        let newState: Bool
        if set.contains(normalized) {
            set.remove(normalized)
            newState = false
        } else {
            set.insert(normalized)
            newState = true
        }
        saveStarredFilePaths(set)
        notifyChanged()
        return newState
    }

    private var inMemoryStarred: Set<String> = []

    private func starredFilePaths() -> Set<String> {
        let cfgPath = configFilePath()
        if fileManager.fileExists(atPath: cfgPath),
           let data = try? Data(contentsOf: URL(fileURLWithPath: cfgPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let starredList = json["starredFiles"] as? [String] {
            return inMemoryStarred.union(Set(starredList))
        }
        return inMemoryStarred
    }

    private func saveStarredFilePaths(_ set: Set<String>) {
        inMemoryStarred = set
        let cfgPath = configFilePath()
        var current: [String: Any] = [:]
        if fileManager.fileExists(atPath: cfgPath),
           let data = try? Data(contentsOf: URL(fileURLWithPath: cfgPath)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            current = json
        }
        current["starredFiles"] = Array(set)
        if let data = try? JSONSerialization.data(withJSONObject: current, options: [.prettyPrinted]) {
            try? data.write(to: URL(fileURLWithPath: cfgPath))
        }
    }

    // MARK: - File Scanning

    private func isProjectFolderName(_ name: String) -> Bool {
        return !name.isEmpty && !name.hasPrefix(".") && !name.hasPrefix("__voo_") && name != Self.trashDirectoryName
    }

    private func collectDesignFiles(dir: String, folder: String?, into files: inout [WorkspaceFile]) {
        guard files.count < Self.maxScanEntries else { return }
        guard let entries = try? fileManager.contentsOfDirectory(atPath: dir) else { return }

        let starredSet = starredFilePaths()

        for name in entries {
            if files.count >= Self.maxScanEntries { break }
            if name.hasPrefix(".") || name.hasPrefix("__voo_") || name.contains(".tmp_") || name.contains(".bak_") {
                continue
            }
            let ext = (name as NSString).pathExtension.lowercased()
            guard Self.allowedExtensions.contains(ext) else { continue }

            let fullPath = (dir as NSString).appendingPathComponent(name)
            guard let attrs = try? fileManager.attributesOfItem(atPath: fullPath) else { continue }
            let fileType = attrs[.type] as? FileAttributeType
            if fileType != .typeRegular { continue }

            let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
            let mdate = (attrs[.modificationDate] as? Date) ?? Date()
            let cdate = (attrs[.creationDate] as? Date) ?? mdate

            let updatedAt = Int64(mdate.timeIntervalSince1970 * 1000)
            let createdAt = Int64(cdate.timeIntervalSince1970 * 1000)
            let isStarred = starredSet.contains(fullPath)

            files.append(WorkspaceFile(
                name: name,
                path: fullPath,
                folder: folder,
                extensionName: ext,
                size: size,
                updatedAt: updatedAt,
                createdAt: createdAt,
                starred: isStarred,
                trashed: false,
                trashedAt: nil,
                isFolder: false
            ))
        }
    }

    public func scanFiles(rootDir: String? = nil) -> [WorkspaceFile] {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { return [] }

        var files: [WorkspaceFile] = []
        // 1. Files in workspace root
        collectDesignFiles(dir: root, folder: nil, into: &files)

        // 2. Files in 1-level project folders
        if let children = try? fileManager.contentsOfDirectory(atPath: root) {
            for child in children {
                if files.count >= Self.maxScanEntries { break }
                guard isProjectFolderName(child) else { continue }
                let subDir = (root as NSString).appendingPathComponent(child)
                var isDir: ObjCBool = false
                if fileManager.fileExists(atPath: subDir, isDirectory: &isDir), isDir.boolValue {
                    collectDesignFiles(dir: subDir, folder: child, into: &files)
                }
            }
        }

        // 3. Merged with trashed files
        let trashed = listTrash(rootDir: root)
        let remainingBudget = max(0, Self.maxScanEntries - files.count)
        files.append(contentsOf: trashed.prefix(remainingBudget))

        // Sort descending by updatedAt
        files.sort { $0.updatedAt > $1.updatedAt }
        return files
    }

    public func rescan() -> [WorkspaceFile] {
        let results = scanFiles()
        notifyChanged()
        return results
    }

    // MARK: - Project Folders Management

    public func listFolders(rootDir: String? = nil) -> [String] {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { return [] }
        guard let entries = try? fileManager.contentsOfDirectory(atPath: root) else { return [] }

        var folders: [String] = []
        for name in entries {
            guard isProjectFolderName(name) else { continue }
            let fullPath = (root as NSString).appendingPathComponent(name)
            var isDir: ObjCBool = false
            if fileManager.fileExists(atPath: fullPath, isDirectory: &isDir), isDir.boolValue {
                folders.append(name)
            }
        }
        folders.sort { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
        return folders
    }

    public func createFolder(name: String, rootDir: String? = nil) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { throw NSError(domain: "WorkspaceManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workspace directory"]) }

        let sanitized = sanitizeFileName(name)
        guard isProjectFolderName(sanitized) else {
            throw NSError(domain: "WorkspaceManager", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid folder name"])
        }

        let targetDir = (root as NSString).appendingPathComponent(sanitized)
        if fileManager.fileExists(atPath: targetDir) {
            throw NSError(domain: "WorkspaceManager", code: 3, userInfo: [NSLocalizedDescriptionKey: "Folder already exists"])
        }

        try fileManager.createDirectory(atPath: targetDir, withIntermediateDirectories: false)
        notifyChanged()
        return sanitized
    }

    public func deleteFolder(name: String, rootDir: String? = nil) throws {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { throw NSError(domain: "WorkspaceManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workspace directory"]) }

        let folderPath = (root as NSString).appendingPathComponent(name)
        guard fileManager.fileExists(atPath: folderPath) else {
            throw NSError(domain: "WorkspaceManager", code: 4, userInfo: [NSLocalizedDescriptionKey: "Folder does not exist"])
        }

        // Move contained files to workspace root before removing directory (matching Electron behavior)
        if let entries = try? fileManager.contentsOfDirectory(atPath: folderPath) {
            for entry in entries {
                let sourceFile = (folderPath as NSString).appendingPathComponent(entry)
                let destFile = availablePath(directory: root, filename: entry)
                try? fileManager.moveItem(atPath: sourceFile, toPath: destFile)
            }
        }

        try fileManager.removeItem(atPath: folderPath)
        notifyChanged()
    }

    public func moveToFolder(filePath: String, folderName: String?, rootDir: String? = nil) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { throw NSError(domain: "WorkspaceManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workspace directory"]) }
        guard isInside(root: root, target: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 5, userInfo: [NSLocalizedDescriptionKey: "File is outside workspace"])
        }
        guard fileManager.fileExists(atPath: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 6, userInfo: [NSLocalizedDescriptionKey: "File not found"])
        }

        let baseName = (filePath as NSString).lastPathComponent
        let targetDirectory: String
        if let folderName = folderName, !folderName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let sanitizedFolder = sanitizeFileName(folderName)
            targetDirectory = (root as NSString).appendingPathComponent(sanitizedFolder)
            if !fileManager.fileExists(atPath: targetDirectory) {
                try fileManager.createDirectory(atPath: targetDirectory, withIntermediateDirectories: true)
            }
        } else {
            targetDirectory = root
        }

        let destPath = availablePath(directory: targetDirectory, filename: baseName)
        if destPath != filePath {
            try fileManager.moveItem(atPath: filePath, toPath: destPath)
        }
        notifyChanged()
        return destPath
    }

    // MARK: - File Operations

    public func renameFile(filePath: String, newName: String, rootDir: String? = nil) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { throw NSError(domain: "WorkspaceManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workspace directory"]) }
        guard isInside(root: root, target: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 5, userInfo: [NSLocalizedDescriptionKey: "File is outside workspace"])
        }
        guard fileManager.fileExists(atPath: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 6, userInfo: [NSLocalizedDescriptionKey: "File not found"])
        }

        let oldExt = (filePath as NSString).pathExtension
        var sanitized = sanitizeFileName(newName)
        if (sanitized as NSString).pathExtension.isEmpty && !oldExt.isEmpty {
            sanitized = "\(sanitized).\(oldExt)"
        }

        let parentDir = (filePath as NSString).deletingLastPathComponent
        let targetPath = availablePath(directory: parentDir, filename: sanitized)
        try fileManager.moveItem(atPath: filePath, toPath: targetPath)
        notifyChanged()
        return targetPath
    }

    public func duplicateFile(filePath: String, rootDir: String? = nil) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { throw NSError(domain: "WorkspaceManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workspace directory"]) }
        guard isInside(root: root, target: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 5, userInfo: [NSLocalizedDescriptionKey: "File is outside workspace"])
        }
        guard fileManager.fileExists(atPath: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 6, userInfo: [NSLocalizedDescriptionKey: "File not found"])
        }

        let parentDir = (filePath as NSString).deletingLastPathComponent
        let fileName = (filePath as NSString).lastPathComponent
        let ext = (fileName as NSString).pathExtension
        let base = (fileName as NSString).deletingPathExtension

        let copyName = ext.isEmpty ? "\(base) copy" : "\(base) copy.\(ext)"
        let targetPath = availablePath(directory: parentDir, filename: copyName)
        try fileManager.copyItem(atPath: filePath, toPath: targetPath)
        notifyChanged()
        return targetPath
    }

    public func revealInFinder(filePath: String) {
        let url = URL(fileURLWithPath: filePath)
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    // MARK: - Recoverable Trash Management (.trash)

    private func trashDirectory(rootDir: String, create: Bool = false) throws -> String {
        let trashDir = (rootDir as NSString).appendingPathComponent(Self.trashDirectoryName)
        if fileManager.fileExists(atPath: trashDir) {
            var isDir: ObjCBool = false
            guard fileManager.fileExists(atPath: trashDir, isDirectory: &isDir), isDir.boolValue else {
                throw NSError(domain: "WorkspaceManager", code: 7, userInfo: [NSLocalizedDescriptionKey: "Invalid trash directory"])
            }
        } else if create {
            try fileManager.createDirectory(atPath: trashDir, withIntermediateDirectories: true)
        }
        return trashDir
    }

    private func readTrashIndex(trashDir: String) -> [String: TrashRecord] {
        let indexFile = (trashDir as NSString).appendingPathComponent(Self.trashIndexName)
        guard fileManager.fileExists(atPath: indexFile),
              let data = try? Data(contentsOf: URL(fileURLWithPath: indexFile)),
              let decoded = try? JSONDecoder().decode([String: TrashRecord].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private func writeTrashIndex(trashDir: String, index: [String: TrashRecord]) throws {
        let indexFile = (trashDir as NSString).appendingPathComponent(Self.trashIndexName)
        let tmpFile = "\(indexFile).tmp"
        let data = try JSONEncoder().encode(index)
        try data.write(to: URL(fileURLWithPath: tmpFile))
        _ = try? fileManager.removeItem(atPath: indexFile)
        try fileManager.moveItem(atPath: tmpFile, toPath: indexFile)
    }

    public func moveToTrash(filePath: String, rootDir: String? = nil) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { throw NSError(domain: "WorkspaceManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workspace directory"]) }
        guard isInside(root: root, target: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 5, userInfo: [NSLocalizedDescriptionKey: "File is outside workspace"])
        }
        guard fileManager.fileExists(atPath: filePath) else {
            throw NSError(domain: "WorkspaceManager", code: 6, userInfo: [NSLocalizedDescriptionKey: "File not found"])
        }

        let trashDir = try trashDirectory(rootDir: root, create: true)
        var index = readTrashIndex(trashDir: trashDir)

        let baseName = (filePath as NSString).lastPathComponent
        let availableName = availableFileName(in: trashDir, candidate: baseName)
        let destination = (trashDir as NSString).appendingPathComponent(availableName)

        // Compute relative path from workspace root
        let resolvedRoot = URL(fileURLWithPath: root).resolvingSymlinksInPath().path
        let resolvedFile = URL(fileURLWithPath: filePath).resolvingSymlinksInPath().path
        let relative = resolvedFile.hasPrefix(resolvedRoot)
            ? String(resolvedFile.dropFirst(resolvedRoot.count).drop(while: { $0 == "/" }))
            : baseName

        var isDir: ObjCBool = false
        fileManager.fileExists(atPath: filePath, isDirectory: &isDir)

        index[availableName] = TrashRecord(
            relativePath: relative,
            trashedAt: Int64(Date().timeIntervalSince1970 * 1000),
            isDirectory: isDir.boolValue
        )

        try fileManager.moveItem(atPath: filePath, toPath: destination)
        try writeTrashIndex(trashDir: trashDir, index: index)
        notifyChanged()
        return destination
    }

    public func restoreFromTrash(filePath: String, rootDir: String? = nil) throws -> String {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { throw NSError(domain: "WorkspaceManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid workspace directory"]) }
        let trashDir = try trashDirectory(rootDir: root, create: false)
        var index = readTrashIndex(trashDir: trashDir)

        // Locate entry by file path or record
        let trashName = (filePath as NSString).lastPathComponent
        guard let record = index[trashName] else {
            throw NSError(domain: "WorkspaceManager", code: 8, userInfo: [NSLocalizedDescriptionKey: "File not found in trash index"])
        }

        let source = (trashDir as NSString).appendingPathComponent(trashName)
        guard fileManager.fileExists(atPath: source) else {
            throw NSError(domain: "WorkspaceManager", code: 6, userInfo: [NSLocalizedDescriptionKey: "Trash file does not exist on disk"])
        }

        let destination = (root as NSString).appendingPathComponent(record.relativePath)
        let parentDir = (destination as NSString).deletingLastPathComponent
        if !fileManager.fileExists(atPath: parentDir) {
            try fileManager.createDirectory(atPath: parentDir, withIntermediateDirectories: true)
        }

        let finalDest = availablePath(directory: parentDir, filename: (destination as NSString).lastPathComponent)
        try fileManager.moveItem(atPath: source, toPath: finalDest)

        index.removeValue(forKey: trashName)
        try? writeTrashIndex(trashDir: trashDir, index: index)
        notifyChanged()
        return finalDest
    }

    public func deletePermanently(filePath: String, rootDir: String? = nil) throws {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        let trashDir = try trashDirectory(rootDir: root, create: false)
        var index = readTrashIndex(trashDir: trashDir)

        let trashName = (filePath as NSString).lastPathComponent
        let targetPath = (trashDir as NSString).appendingPathComponent(trashName)

        if fileManager.fileExists(atPath: targetPath) {
            try fileManager.removeItem(atPath: targetPath)
        } else if fileManager.fileExists(atPath: filePath) {
            try fileManager.removeItem(atPath: filePath)
        }

        if index[trashName] != nil {
            index.removeValue(forKey: trashName)
            try? writeTrashIndex(trashDir: trashDir, index: index)
        }
        notifyChanged()
    }

    public func emptyTrash(rootDir: String? = nil) throws -> Int {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        let trashDir = try trashDirectory(rootDir: root, create: false)
        guard fileManager.fileExists(atPath: trashDir) else { return 0 }

        let entries = (try? fileManager.contentsOfDirectory(atPath: trashDir)) ?? []
        var count = 0
        for entry in entries {
            if entry == Self.trashIndexName { continue }
            let itemPath = (trashDir as NSString).appendingPathComponent(entry)
            try? fileManager.removeItem(atPath: itemPath)
            count += 1
        }

        try? writeTrashIndex(trashDir: trashDir, index: [:])
        notifyChanged()
        return count
    }

    public func listTrash(rootDir: String? = nil) -> [WorkspaceFile] {
        lock.lock()
        defer { lock.unlock() }

        let root = rootDir ?? currentWorkspacePath
        guard let trashDir = try? trashDirectory(rootDir: root, create: false),
              fileManager.fileExists(atPath: trashDir) else {
            return []
        }

        let index = readTrashIndex(trashDir: trashDir)
        let entries = (try? fileManager.contentsOfDirectory(atPath: trashDir)) ?? []

        var results: [WorkspaceFile] = []
        for name in entries {
            if name == Self.trashIndexName || name.hasPrefix(".") { continue }
            let filePath = (trashDir as NSString).appendingPathComponent(name)
            guard let attrs = try? fileManager.attributesOfItem(atPath: filePath) else { continue }

            let record = index[name]
            let relativePath = record?.relativePath ?? name
            let originalName = (relativePath as NSString).lastPathComponent
            let folder = (relativePath as NSString).deletingLastPathComponent
            let cleanFolder = (folder == "." || folder.isEmpty) ? nil : folder
            let ext = (originalName as NSString).pathExtension.lowercased()

            let size = (attrs[.size] as? NSNumber)?.int64Value ?? 0
            let mdate = (attrs[.modificationDate] as? Date) ?? Date()
            let cdate = (attrs[.creationDate] as? Date) ?? mdate

            let updatedAt = Int64(mdate.timeIntervalSince1970 * 1000)
            let createdAt = Int64(cdate.timeIntervalSince1970 * 1000)
            let trashedAt = record?.trashedAt ?? updatedAt

            results.append(WorkspaceFile(
                name: originalName,
                path: filePath,
                folder: cleanFolder,
                extensionName: ext,
                size: size,
                updatedAt: updatedAt,
                createdAt: createdAt,
                starred: false,
                trashed: true,
                trashedAt: trashedAt,
                isFolder: record?.isDirectory ?? false
            ))
        }

        results.sort { ($0.trashedAt ?? $0.updatedAt) > ($1.trashedAt ?? $1.updatedAt) }
        return results
    }

    // MARK: - File System Watcher

    private func setupWatcher() {
        stopWatcher()
        let root = currentWorkspacePath
        guard isValidWorkspaceDirectory(root) else { return }

        let fd = open(root, O_EVTONLY)
        guard fd >= 0 else { return }
        self.fileWatcherFD = fd

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .delete, .extend, .attrib, .rename],
            queue: DispatchQueue.global(qos: .utility)
        )

        source.setEventHandler { [weak self] in
            self?.scheduleDebouncedNotification()
        }

        source.setCancelHandler {
            close(fd)
        }

        source.resume()
        self.fileWatcherSource = source
    }

    private func stopWatcher() {
        if let source = fileWatcherSource {
            source.cancel()
            fileWatcherSource = nil
        }
        fileWatcherFD = -1
    }

    private func scheduleDebouncedNotification() {
        lock.lock()
        watcherDebounceWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            DispatchQueue.main.async {
                self?.onWorkspaceChanged?()
            }
        }
        watcherDebounceWorkItem = workItem
        lock.unlock()

        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 0.3, execute: workItem)
    }

    private func notifyChanged() {
        DispatchQueue.main.async { [weak self] in
            self?.onWorkspaceChanged?()
        }
    }

    // MARK: - Helper Methods

    private func sanitizeFileName(_ name: String) -> String {
        var result = name.replacingOccurrences(of: "/", with: "-")
        result = result.replacingOccurrences(of: ":", with: "-")
        result = result.trimmingCharacters(in: .whitespacesAndNewlines)
        return result.isEmpty ? "Untitled" : result
    }

    private func availablePath(directory: String, filename: String) -> String {
        let ext = (filename as NSString).pathExtension
        let stem = (filename as NSString).deletingPathExtension
        var candidate = filename
        var suffix = 2
        var target = (directory as NSString).appendingPathComponent(candidate)
        while fileManager.fileExists(atPath: target) {
            candidate = ext.isEmpty ? "\(stem)-\(suffix)" : "\(stem)-\(suffix).\(ext)"
            target = (directory as NSString).appendingPathComponent(candidate)
            suffix += 1
        }
        return target
    }

    private func availableFileName(in directory: String, candidate: String) -> String {
        let ext = (candidate as NSString).pathExtension
        let stem = (candidate as NSString).deletingPathExtension
        var name = candidate
        var suffix = 2
        var target = (directory as NSString).appendingPathComponent(name)
        while fileManager.fileExists(atPath: target) {
            name = ext.isEmpty ? "\(stem)-\(suffix)" : "\(stem)-\(suffix).\(ext)"
            target = (directory as NSString).appendingPathComponent(name)
            suffix += 1
        }
        return name
    }
}
