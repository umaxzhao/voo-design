//
//  Serialization.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M1.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import CoreGraphics
import Foundation

// MARK: - Serialization Error Types

public enum SerializationError: Error, LocalizedError, Equatable {
    case invalidMagic(String)
    case truncatedHeader
    case assetOutOfRange(String)
    case unsupportedVersion(Int)
    case corruptedData(String)

    public var errorDescription: String? {
        switch self {
        case .invalidMagic(let msg):
            return "Invalid container magic header: \(msg)"
        case .truncatedHeader:
            return "File header is truncated or malformed"
        case .assetOutOfRange(let id):
            return "Binary asset '\(id)' byte range is out of file bounds"
        case .unsupportedVersion(let v):
            return "Unsupported document format version: \(v)"
        case .corruptedData(let msg):
            return "Corrupted document payload: \(msg)"
        }
    }
}

// MARK: - JSON Document Serializer & Normalization Pipeline

public final class VOOSerializer: @unchecked Sendable {
    public static let shared = VOOSerializer()

    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init() {
        self.encoder = JSONEncoder()
        self.encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        self.decoder = JSONDecoder()
    }

    /// Serializes document into normalized, canonical VOO JSON data.
    public func serialize(document: VOODocument) throws -> Data {
        let normalized = normalizeForExport(document)
        return try encoder.encode(normalized)
    }

    /// Deserializes document from JSON data and runs validation & cycle-breaking pipeline.
    public func deserialize(from data: Data) throws -> VOODocument {
        let rawDoc = try decoder.decode(VOODocument.self, from: data)
        return normalizeOnImport(rawDoc)
    }

    // MARK: - Normalization Pipeline

    /// Pre-serialization normalization (N2, N3, N8).
    public func normalizeForExport(_ doc: VOODocument) -> VOODocument {
        var copy = doc
        copy.version = 2

        copy.nodes = copy.nodes.map { node in
            var n = node

            // N3: Remove ephemeral blob: URLs
            if let src = n.src, src.hasPrefix("blob:") {
                n.src = nil
            }

            // N2: Drop default adjustments to compact JSON payload
            if let adj = n.adjustments, adj.isDefault {
                n.adjustments = nil
            }

            // Strip empty effects
            if let eff = n.effects, eff.isEmpty {
                n.effects = nil
            }

            return n
        }

        return copy
    }

    /// Post-deserialization normalization (N1, N4, N5, N6, N7).
    public func normalizeOnImport(_ doc: VOODocument) -> VOODocument {
        var copy = doc

        // N1: Validate crop bounds
        if let crop = copy.canvas.crop {
            if crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 ||
               (crop.x + crop.width) > copy.canvas.width ||
               (crop.y + crop.height) > copy.canvas.height {
                copy.canvas.crop = nil
            }
        }

        // N6: Color variable binding map
        let colorMap = Dictionary(copy.canvas.colorVariables.map { ($0.id, $0.value) }, uniquingKeysWith: { first, _ in first })

        // Filter readable nodes
        var readable = copy.nodes.filter { $0.width > 0 && $0.height > 0 }

        // Resolve color variables
        readable = readable.map { node in
            var n = node
            if let varId = n.fillVariableId {
                if let val = colorMap[varId] {
                    n.fill = val
                } else {
                    n.fillVariableId = nil
                }
            }
            if let varId = n.strokeVariableId {
                if let val = colorMap[varId] {
                    n.stroke = val
                } else {
                    n.strokeVariableId = nil
                }
            }
            return n
        }

        // N4: Acyclic group membership validation
        let validIds = Set(readable.map { $0.id })
        let parentMap = Dictionary(readable.map { ($0.id, $0.parentId) }, uniquingKeysWith: { first, _ in first })

        readable = readable.map { node in
            guard let parentId = node.parentId, validIds.contains(parentId) else {
                var clean = node
                clean.parentId = nil
                return clean
            }
            // Cycle detection loop
            var visited = Set<String>([node.id])
            var cursor: String? = parentId
            var hasCycle = false
            while let current = cursor {
                if visited.contains(current) {
                    hasCycle = true
                    break
                }
                visited.insert(current)
                cursor = parentMap[current] ?? nil
            }
            var clean = node
            if hasCycle {
                clean.parentId = nil
            }
            return clean
        }

        // N5: Clipping mask validation
        let paintOrder = Dictionary(readable.enumerated().map { ($0.element.id, $0.offset) }, uniquingKeysWith: { first, _ in first })

        readable = readable.map { node in
            guard let clipId = node.clipTo, validIds.contains(clipId) else {
                var clean = node
                clean.clipTo = nil
                return clean
            }
            guard let baseIndex = paintOrder[clipId],
                  let nodeIndex = paintOrder[node.id],
                  baseIndex < nodeIndex else {
                var clean = node
                clean.clipTo = nil
                return clean
            }
            return node
        }

        // N7: Region sort to top plane
        let artworkNodes = readable.filter { $0.kind != .region }
        let regionNodes = readable.filter { $0.kind == .region }
        copy.nodes = artworkNodes + regionNodes

        return copy
    }
}

// MARK: - High-Performance Binary Container (`VOOBIN01`)

/// Production .voo binary container codec packaging JSON envelope and raw assets.
public enum VOOBinaryContainer {
    public static let magic = "VOOBIN01"
    private static let magicBytes = [UInt8](magic.utf8) // 8 bytes
    private static let payloadPrefixBytes = 12          // 8 (magic) + 4 (header length)

    public struct Envelope: Codable, Sendable {
        public var format: String = "voo-editor"
        public var version: Int = 2
        public var kind: String = "design"
        public var document: VOODocument
        public var assetIndex: [String: AssetIndexEntry]?

        public init(document: VOODocument, assetIndex: [String: AssetIndexEntry]? = nil) {
            self.document = document
            self.assetIndex = assetIndex
        }
    }

    public struct AssetIndexEntry: Codable, Sendable, Equatable {
        public var offset: Int
        public var length: Int
        public var mime: String

        public init(offset: Int, length: Int, mime: String) {
            self.offset = offset
            self.length = length
            self.mime = mime
        }
    }

    /// Checks whether the provided data contains the VOOBIN01 magic header.
    public static func isVooBinary(data: Data) -> Bool {
        guard data.count >= payloadPrefixBytes else { return false }
        return data.prefix(8).elementsEqual(magicBytes)
    }

    /// Encodes a document and asset table into the VOOBIN01 binary container format.
    public static func encode(
        document: VOODocument,
        assets: [String: (data: Data, mime: String)] = [:],
        preview: Data? = nil
    ) throws -> Data {
        var assetIndex: [String: AssetIndexEntry] = [:]
        var payloadParts: [Data] = []
        var currentOffset = 0

        for (id, asset) in assets.sorted(by: { $0.key < $1.key }) {
            assetIndex[id] = AssetIndexEntry(offset: currentOffset, length: asset.data.count, mime: asset.mime)
            payloadParts.append(asset.data)
            currentOffset += asset.data.count
        }

        if let preview = preview {
            assetIndex["__preview"] = AssetIndexEntry(offset: currentOffset, length: preview.count, mime: "image/png")
            payloadParts.append(preview)
            currentOffset += preview.count
        }

        let envelope = Envelope(document: document, assetIndex: assetIndex)
        let headerJsonData = try JSONEncoder().encode(envelope)
        let headerLength = UInt32(headerJsonData.count)

        var output = Data()
        output.append(contentsOf: magicBytes)
        var lengthLE = headerLength.littleEndian
        output.append(Data(bytes: &lengthLE, count: 4))
        output.append(headerJsonData)
        for part in payloadParts {
            output.append(part)
        }
        return output
    }

    /// Decodes a VOOBIN01 binary file into the document and binary asset map.
    public static func decode(data: Data) throws -> (
        document: VOODocument,
        assets: [String: (data: Data, mime: String)],
        preview: Data?
    ) {
        guard isVooBinary(data: data) else {
            throw SerializationError.invalidMagic("Expected VOOBIN01 magic bytes")
        }

        let headerLength: UInt32 = data.subdata(in: 8..<12).withUnsafeBytes { $0.load(as: UInt32.self) }.littleEndian
        let headerStart = payloadPrefixBytes
        let headerEnd = headerStart + Int(headerLength)

        guard data.count >= headerEnd else {
            throw SerializationError.truncatedHeader
        }

        let headerData = data.subdata(in: headerStart..<headerEnd)
        let envelope = try JSONDecoder().decode(Envelope.self, from: headerData)

        var assets: [String: (data: Data, mime: String)] = [:]
        var preview: Data? = nil
        let payloadStart = headerEnd

        if let index = envelope.assetIndex {
            for (id, entry) in index {
                let start = payloadStart + entry.offset
                let end = start + entry.length
                guard end <= data.count else {
                    throw SerializationError.assetOutOfRange(id)
                }
                let assetData = data.subdata(in: start..<end)
                if id == "__preview" {
                    preview = assetData
                } else {
                    assets[id] = (data: assetData, mime: entry.mime)
                }
            }
        }

        return (document: envelope.document, assets: assets, preview: preview)
    }
}
