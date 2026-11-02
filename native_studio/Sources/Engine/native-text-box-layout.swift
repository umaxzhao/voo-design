import AppKit

/// boxWidth is the wrap constraint; node width/height are the measured hit-test bounds.
enum NativeTextBoxLayout {
    enum Failure: Error { case invalidWidth, missingTextNode }

    static func settingWidth(_ width: CGFloat, on node: VOONode) throws -> VOONode {
        guard node.kind == .text else { throw Failure.missingTextNode }
        guard width.isFinite && width >= 0 else { throw Failure.invalidWidth }
        var result = node
        result.boxWidth = width
        resizeToContent(&result)
        return result
    }

    static func resizeToContent(_ node: inout VOONode) {
        guard node.kind == .text else { return }
        let result = layout(node)
        node.width = result.size.width
        node.height = result.size.height
    }

    /// Use the same wrapped lines for bounds and paint; a glyph wider than its
    /// box may overflow, exactly as Web's hard-break fallback permits.
    static func layout(_ node: VOONode) -> (text: String, size: CGSize) {
        let text = node.text ?? node.name
        let lineHeight = max(1, (node.fontSize ?? 16) * max(node.lineHeight ?? 1.2, 0.8))
        let attributes = TextStyleResolver.resolvedAttributes(
            for: node, color: .black, size: node.fontSize ?? 16)
        let box = node.boxWidth ?? 0
        var width: CGFloat
        var lines: [String]
        if box > 0 {
            let storage = NSTextStorage(string: text, attributes: attributes)
            let manager = NSLayoutManager()
            let container = NSTextContainer(
                size: CGSize(width: box, height: CGFloat.greatestFiniteMagnitude))
            container.lineFragmentPadding = 0
            manager.addTextContainer(container)
            storage.addLayoutManager(manager)
            manager.ensureLayout(for: container)
            width = box
            lines = []
            manager.enumerateLineFragments(forGlyphRange: manager.glyphRange(for: container)) {
                _, _, _, glyphs, _ in
                let range = manager.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil)
                let line = (text as NSString).substring(with: range).trimmingCharacters(
                    in: .whitespacesAndNewlines)
                lines.append(line)
                width = max(width, (line as NSString).size(withAttributes: attributes).width)
            }
            if text.hasSuffix("\n") { lines.append("") }
        } else {
            width = (text as NSString).size(withAttributes: attributes).width
            lines = text.components(separatedBy: "\n")
        }
        let stroke = PropertiesColorMath.isVisiblePaint(node.stroke) ? node.strokeWidth : 0
        return (
            lines.joined(separator: "\n"),
            CGSize(
                width: max(1, ceil(width + stroke)),
                height: ceil(CGFloat(max(lines.count, 1)) * lineHeight))
        )
    }

}

/// Mutable final state coalesces one numeric scrub into one reversible operation.
final class NativeTextBoxWidthCommand: StudioCommand, @unchecked Sendable {
    let id = UUID()
    let timestamp = Date()
    let name: String
    let oldNode: VOONode
    var newNode: VOONode
    var isNoOp: Bool {
        var candidate = newNode
        candidate.width = oldNode.width
        candidate.height = oldNode.height
        if (candidate.boxWidth ?? 0) == (oldNode.boxWidth ?? 0) {
            candidate.boxWidth = oldNode.boxWidth
        }
        if (candidate.italic ?? false) == (oldNode.italic ?? false) {
            candidate.italic = oldNode.italic
        }
        if (candidate.underline ?? false) == (oldNode.underline ?? false) {
            candidate.underline = oldNode.underline
        }
        return candidate == oldNode
    }
    init(oldNode: VOONode, newNode: VOONode, name: String = NativeCopy.text(.editTextLayout)) {
        self.oldNode = oldNode
        self.newNode = newNode
        self.name = name
    }
    func execute(document: inout VOODocument) -> Bool { replace(newNode, in: &document) }
    func undo(document: inout VOODocument) -> Bool { replace(oldNode, in: &document) }
    private func replace(_ node: VOONode, in document: inout VOODocument) -> Bool {
        guard let index = document.nodes.firstIndex(where: { $0.id == node.id }) else {
            return false
        }
        document.nodes[index] = node
        return true
    }
}
