import CoreGraphics
import Foundation

extension VOODocument {
    enum CodingKeys: String, CodingKey, CaseIterable {
        case id, title, version, canvasType, canvas, nodes, selectedNodeIds, guides
        case canvasId, width, height, backgroundColor, document, assets
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if c.contains(.document) {
            self = try c.decode(VOODocument.self, forKey: .document)
            assets.merge(try c.decodeIfPresent([String: String].self, forKey: .assets) ?? [:]) {
                _, newer in newer
            }
            hydratePortableImages()
            return
        }
        let raw = try [String: PortableJSONValue](from: decoder)
        let known = Set(CodingKeys.allCases.map { $0.rawValue })
        portableProperties = raw.filter { !known.contains($0.key) }
        id =
            try c.decodeIfPresent(String.self, forKey: .id)
            ?? c.decodeIfPresent(String.self, forKey: .canvasId) ?? UUID().uuidString
        let pages = raw["pages"]?.array ?? []
        let activePage = pages.compactMap(\.object).first { [id] in $0["id"]?.string == id }
        title =
            try c.decodeIfPresent(String.self, forKey: .title) ?? activePage?["label"]?.string
            ?? "Untitled"
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 2
        canvasType = try c.decodeIfPresent(String.self, forKey: .canvasType) ?? "design"
        if c.contains(.canvas) {
            canvas = try c.decode(CanvasFrame.self, forKey: .canvas)
        } else {
            let width =
                try c.decodeIfPresent(FlexibleNumber.self, forKey: .width)?.cgFloatValue ?? 1200
            let height =
                try c.decodeIfPresent(FlexibleNumber.self, forKey: .height)?.cgFloatValue ?? 800
            canvas = CanvasFrame(
                width: width, height: height,
                backgroundColor: try c.decodeIfPresent(String.self, forKey: .backgroundColor)
                    ?? "#171717")
        }
        nodes = try c.decode([VOONode].self, forKey: .nodes)
        selectedNodeIds = try c.decodeIfPresent(Set<String>.self, forKey: .selectedNodeIds) ?? []
        guides = try c.decodeIfPresent([GuideLine].self, forKey: .guides)
        assets = try c.decodeIfPresent([String: String].self, forKey: .assets) ?? [:]
        hydratePortableImages()
    }

    public func encode(to encoder: Encoder) throws {
        var portable = encoder.container(keyedBy: PortableCodingKey.self)
        var properties = portableProperties
        // The active scene is mirrored in both root nodes and its page snapshot.
        // Preserve inactive pages verbatim and never overwrite them with this scene.
        if var pages = properties["pages"]?.array {
            for index in pages.indices {
                guard var page = pages[index].object, page["id"]?.string == id,
                    var scene = page["sceneDoc"]?.object
                else { continue }
                scene["nodes"] = try .encoded(nodes)
                scene["width"] = .number(Double(canvas.width))
                scene["height"] = .number(Double(canvas.height))
                scene["backgroundColor"] = .string(canvas.backgroundColor)
                page["sceneDoc"] = .object(scene)
                page["label"] = .string(title)
                pages[index] = .object(page)
            }
            properties["pages"] = .array(pages)
        }
        for (key, value) in properties {
            try portable.encode(value, forKey: PortableCodingKey(key))
        }
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(id, forKey: .canvasId)
        try c.encode(title, forKey: .title)
        try c.encode(version, forKey: .version)
        try c.encode(canvasType, forKey: .canvasType)
        try c.encode(canvas, forKey: .canvas)
        try c.encode(canvas.width, forKey: .width)
        try c.encode(canvas.height, forKey: .height)
        try c.encode(canvas.backgroundColor, forKey: .backgroundColor)
        try c.encode(nodes, forKey: .nodes)
        try c.encode(selectedNodeIds, forKey: .selectedNodeIds)
        try c.encodeIfPresent(guides, forKey: .guides)
        if !assets.isEmpty { try c.encode(assets, forKey: .assets) }
    }

    public mutating func hydratePortableImages() {
        for index in nodes.indices {
            if let imageId = nodes[index].imageId, let source = assets[imageId] {
                nodes[index].src = source
            }
        }
    }
}
