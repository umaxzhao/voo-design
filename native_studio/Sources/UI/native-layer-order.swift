import Foundation

/// Layers show topmost paint first within each parent, without changing scene order.
enum NativeLayerOrder {
    static func rows(_ nodes: [VOONode]) -> [VOONode] {
        let ids = Set(nodes.map(\.id))
        let children = Dictionary(grouping: nodes, by: { $0.parentId ?? "" })
        let roots = nodes.filter { node in
            guard let parentId = node.parentId else { return true }
            return !ids.contains(parentId)
        }
        var visited: Set<String> = []
        var result: [VOONode] = []
        func append(_ node: VOONode) {
            guard visited.insert(node.id).inserted else { return }
            result.append(node)
            for child in (children[node.id] ?? []).reversed() { append(child) }
        }
        for root in roots.reversed() { append(root) }
        // Keep malformed orphan/cycle rows inspectable while preventing recursion.
        for node in nodes.reversed() { append(node) }
        return result
    }
}
