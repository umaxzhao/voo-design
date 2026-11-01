//
//  DraftAutosave.swift
//  native_studio
//
//  Local recovery copies ("Auto-save edit drafts" in Settings → Appearance).
//
//  The web build keeps an additional local recovery copy while editing so a crash
//  does not lose work. This engine mirrors that promise natively: while a document
//  is being edited it writes a normalised `.voo` snapshot into
//  `Application Support/VOO Design/Drafts/` (debounced), and on the next launch a
//  draft that is newer than the file on disk is offered back to the user.
//
//  Copyright © 2026 VOO Design. All rights reserved.
//

import Foundation

public final class DraftAutosave: @unchecked Sendable {

    public static let shared = DraftAutosave()

    /// Debounce window: edits are coalesced into one write at most this often.
    public static let debounceInterval: TimeInterval = 3.0

    private let fileManager = FileManager.default
    private let serializer = VOOSerializer.shared
    private let queue = DispatchQueue(label: "voo.draft-autosave", qos: .utility)
    private var pendingWorkItem: DispatchWorkItem?
    private let lock = NSLock()

    public init() {}

    // MARK: - Locations

    /// `~/Library/Application Support/VOO Design/Drafts`
    /// (`VOO_DRAFT_DIR` overrides it for the test harness, which must not touch
    /// the real user directory).
    public var draftsDirectory: URL {
        if let override = ProcessInfo.processInfo.environment["VOO_DRAFT_DIR"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return base
            .appendingPathComponent("VOO Design", isDirectory: true)
            .appendingPathComponent("Drafts", isDirectory: true)
    }

    /// A stable draft file name for a document: the current file name when the
    /// document has been saved, otherwise its title.
    public func draftURL(for document: VOODocument, currentFileURL: URL?) -> URL {
        let base: String
        if let currentFileURL {
            base = currentFileURL.deletingPathExtension().lastPathComponent
        } else {
            base = document.title.isEmpty ? "Untitled" : document.title
        }
        // Keep the mapping stable per document but never let the title escape the folder.
        let safe = base
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return draftsDirectory.appendingPathComponent(safe.isEmpty ? "Untitled" : safe)
            .appendingPathExtension("draft.voo")
    }

    // MARK: - Enablement

    /// Reads the same defaults key the Settings → Appearance toggle writes.
    public var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: SettingsDrawerView.autoSaveDraftsDefaultsKey)
    }

    // MARK: - Writing

    /// Queues a debounced draft write. Disabled drafts and empty documents are skipped.
    public func scheduleAutosave(document: VOODocument, currentFileURL: URL?) {
        guard isEnabled, !document.nodes.isEmpty else { return }
        let data: Data
        do {
            data = try serializer.serialize(document: document)
        } catch {
            NSLog("[VOO Design Native] draft autosave skipped: %@", String(describing: error))
            return
        }
        let target = draftURL(for: document, currentFileURL: currentFileURL)

        lock.lock()
        pendingWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self else { return }
            do {
                try self.fileManager.createDirectory(at: self.draftsDirectory, withIntermediateDirectories: true)
                try data.write(to: target, options: .atomic)
            } catch {
                NSLog("[VOO Design Native] draft autosave failed: %@", String(describing: error))
            }
        }
        pendingWorkItem = item
        lock.unlock()
        queue.asyncAfter(deadline: .now() + Self.debounceInterval, execute: item)
    }

    /// Flushes any pending write immediately (called when a document closes/saves).
    public func flush(document: VOODocument, currentFileURL: URL?) {
        guard isEnabled, !document.nodes.isEmpty else { return }
        guard let data = try? serializer.serialize(document: document) else { return }
        let target = draftURL(for: document, currentFileURL: currentFileURL)
        try? fileManager.createDirectory(at: draftsDirectory, withIntermediateDirectories: true)
        try? data.write(to: target, options: .atomic)
    }

    // MARK: - Recovery

    /// A restorable draft: the saved payload plus the file it belongs to (if any).
    public struct RecoverableDraft {
        public let url: URL
        public let modifiedAt: Date
        public let originalFileURL: URL?
    }

    /// Drafts whose content is newer than the file they mirror (or that have no
    /// file at all, i.e. work that never reached disk). Newest first.
    public func recoverableDrafts(workspacePath: String? = nil) -> [RecoverableDraft] {
        guard isEnabled else { return [] }
        guard let urls = try? fileManager.contentsOfDirectory(
            at: draftsDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }

        var drafts: [RecoverableDraft] = []
        for url in urls where url.pathExtension == "voo" {
            let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
                ?? Date.distantPast
            let name = url.lastPathComponent
                .replacingOccurrences(of: ".draft.voo", with: "")
            guard !name.isEmpty else { continue }
            let originalFile = mirroredFileURL(named: name, workspacePath: workspacePath)
            if let originalFile,
               let fileDate = try? fileManager.attributesOfItem(atPath: originalFile.path)[.modificationDate] as? Date,
               fileDate >= modified {
                continue
            }
            drafts.append(RecoverableDraft(url: url, modifiedAt: modified, originalFileURL: originalFile))
        }
        return drafts.sorted { $0.modifiedAt > $1.modifiedAt }
    }

    /// Loads a draft's document, or nil when it cannot be decoded.
    public func loadDraft(_ draft: RecoverableDraft) -> VOODocument? {
        guard let data = try? Data(contentsOf: draft.url) else { return nil }
        return try? serializer.deserialize(from: data)
    }

    /// Deletes a single draft (after a successful restore or a user discard).
    public func discard(_ draft: RecoverableDraft) {
        try? fileManager.removeItem(at: draft.url)
    }

    /// Deletes every draft (used when the workspace is reset).
    public func discardAll() {
        try? fileManager.removeItem(at: draftsDirectory)
    }

    // MARK: - Helpers

    private func mirroredFileURL(named name: String, workspacePath: String?) -> URL? {
        let root = workspacePath ?? WorkspaceManager.shared.currentWorkspacePath
        guard !root.isEmpty else { return nil }
        let direct = URL(fileURLWithPath: root).appendingPathComponent(name).appendingPathExtension("voo")
        if fileManager.fileExists(atPath: direct.path) { return direct }
        // Files may live in sub-folders; take the newest match by name.
        guard let enumerator = fileManager.enumerator(
            at: URL(fileURLWithPath: root),
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return nil }
        var best: (url: URL, date: Date)?
        for case let candidate as URL in enumerator {
            guard candidate.pathExtension == "voo",
                  candidate.deletingPathExtension().lastPathComponent == name else { continue }
            let date = (try? candidate.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate)
                ?? Date.distantPast
            if best == nil || date > best!.date { best = (candidate, date) }
        }
        return best?.url
    }
}
