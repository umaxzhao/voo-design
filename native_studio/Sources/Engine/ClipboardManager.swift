//
//  ClipboardManager.swift
//  native_studio
//
//  High-Performance System Clipboard & Node Serialization Engine.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

// MARK: - Custom Pasteboard Type

public extension NSPasteboard.PasteboardType {
    static let vooNodes = NSPasteboard.PasteboardType("run.voo.editor.nodes")
}

// MARK: - Clipboard Engine

public final class ClipboardManager: @unchecked Sendable {
    public static let shared = ClipboardManager()

    private let pasteboard = NSPasteboard.general
    public private(set) var pasteOffsetDelta: CGFloat = 20.0
    private var consecutivePasteCount: Int = 0

    public init() {}

    // MARK: - Copy & Cut

    /// Copies an array of nodes to the system pasteboard.
    public func copyNodes(_ nodes: [VOONode]) -> Bool {
        guard !nodes.isEmpty else { return false }
        consecutivePasteCount = 0

        do {
            let data = try JSONEncoder().encode(nodes)
            guard let jsonString = String(data: data, encoding: .utf8) else { return false }

            pasteboard.clearContents()
            pasteboard.setString(jsonString, forType: .string)
            pasteboard.setData(data, forType: .vooNodes)
            return true
        } catch {
            NSLog("[ClipboardManager] Failed to encode copied nodes: %@", error.localizedDescription)
            return false
        }
    }

    /// Checks whether valid VOONode elements are present on the system pasteboard.
    public var canPaste: Bool {
        if pasteboard.data(forType: .vooNodes) != nil {
            return true
        }
        if let str = pasteboard.string(forType: .string),
           let data = str.data(using: .utf8) {
            return (try? JSONDecoder().decode([VOONode].self, from: data)) != nil
        }
        return false
    }

    /// Retrieves nodes from pasteboard, generating new unique IDs and applying positional cascading offset.
    public func pasteNodes() -> [VOONode]? {
        var rawData: Data? = pasteboard.data(forType: .vooNodes)
        if rawData == nil, let str = pasteboard.string(forType: .string) {
            rawData = str.data(using: .utf8)
        }
        guard let data = rawData else { return nil }

        do {
            let nodes = try JSONDecoder().decode([VOONode].self, from: data)
            guard !nodes.isEmpty else { return nil }

            consecutivePasteCount += 1
            let offset = pasteOffsetDelta * CGFloat(consecutivePasteCount)

            // Remap old IDs to new UUIDs to preserve internal parent/mask references
            var idMap: [String: String] = [:]
            for node in nodes {
                idMap[node.id] = UUID().uuidString
            }

            var pastedNodes: [VOONode] = []
            for var node in nodes {
                let newId = idMap[node.id] ?? UUID().uuidString
                node.id = newId

                if let pid = node.parentId, let newPid = idMap[pid] {
                    node.parentId = newPid
                }
                if let mid = node.maskId, let newMid = idMap[mid] {
                    node.maskId = newMid
                }
                if let cids = node.childIds {
                    node.childIds = cids.compactMap { idMap[$0] }
                }

                // Apply cascading paste offset
                node.x += offset
                node.y += offset
                pastedNodes.append(node)
            }

            return pastedNodes
        } catch {
            NSLog("[ClipboardManager] Failed to decode pasteboard nodes: %@", error.localizedDescription)
            return nil
        }
    }

    /// Resets consecutive paste cascading counter.
    public func resetPasteCount() {
        consecutivePasteCount = 0
    }
}
