import Foundation

final class NativePaintCommand: StudioCommand, @unchecked Sendable {
    let id = UUID()
    let timestamp = Date()
    let name = NativeCopy.text(.editPaint)
    let oldNodes: [VOONode]
    var newNodes: [VOONode]
    init(oldNodes: [VOONode], newNodes: [VOONode]) {
        self.oldNodes = oldNodes
        self.newNodes = newNodes
    }
    var isPaintNoOp: Bool {
        zip(oldNodes, newNodes).allSatisfy { old, new in
            [NativePaintChannel.fill, .stroke].allSatisfy { channel in
                let before = old.nativePaints(channel)
                let after = new.nativePaints(channel)
                guard before.count == after.count else { return false }
                return zip(before, after).allSatisfy { first, second in
                    canonical(first, channel: channel) == canonical(second, channel: channel)
                }
            }
        }
    }
    private func canonical(_ paint: NativePaint, channel: NativePaintChannel) -> [String:
        PortableJSONValue]
    {
        var properties = paint.properties
        properties[channel.opacityKey] = .number(Double(paint.opacity))
        properties["visible"] = .bool(paint.isVisible)
        properties["blendMode"] = .string(paint.blendMode)
        return properties
    }
    func execute(document: inout VOODocument) -> Bool { replace(newNodes, in: &document) }
    func undo(document: inout VOODocument) -> Bool { replace(oldNodes, in: &document) }
    private func replace(_ nodes: [VOONode], in document: inout VOODocument) -> Bool {
        let indices = nodes.compactMap { node in document.nodes.firstIndex { $0.id == node.id } }
        guard indices.count == nodes.count else { return false }
        for (index, node) in zip(indices, nodes) { document.nodes[index] = node }
        return true
    }
}
