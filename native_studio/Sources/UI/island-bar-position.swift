import AppKit
import CoreGraphics

extension MainContentView {
  /// Match Electron's outerFrame walk through groups and nested boards. An
  /// unframed group does not replace the selected artwork as the anchor.
  private func islandAnchorDocRect() -> CGRect? {
    let stage = canvasStageView
    let nodes = stage.document.nodes
    let byId = Dictionary(nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var anchors: [String: VOONode] = [:]
    for id in stage.selectedNodeIds {
      guard let selected = byId[id] else { continue }
      var cursor: VOONode? = selected
      var frame: VOONode?
      var visited = Set<String>()
      // Imported malformed ancestry must terminate without an arbitrary depth cap.
      while let node = cursor, visited.insert(node.id).inserted {
        if node.kind == .frame { frame = node }
        cursor = node.parentId.flatMap { byId[$0] }
      }
      let anchor = frame ?? selected
      anchors[anchor.id] = anchor
    }
    return anchors.values.map(Self.islandVisibleBounds).reduce(nil) { union, rect in
      union.map { $0.union(rect) } ?? rect
    }
  }

  /// Electron nodesBounds includes the visible corners of rotated artwork.
  private static func islandVisibleBounds(_ node: VOONode) -> CGRect {
    guard node.rotation != 0 else { return node.bounds }
    let angle = node.rotation * .pi / 180
    let width = abs(node.width * cos(angle)) + abs(node.height * sin(angle))
    let height = abs(node.width * sin(angle)) + abs(node.height * cos(angle))
    return CGRect(
      x: node.bounds.midX - width / 2, y: node.bounds.midY - height / 2,
      width: width, height: height)
  }

  /// Anchor below the visible outer board, flipping above the bottom zoom bar.
  public func updateIslandBarPosition() {
    guard !islandBar.isHidden, let docRect = islandAnchorDocRect() else { return }
    let stage = canvasStageView
    let stageRect = stage.viewRect(from: docRect)
    let size = islandBar.intrinsicContentSize
    let barSize = CGSize(width: max(size.width, 120), height: ContextIslandBar.preferredHeight)
    let bounds = stage.bounds
    let gap: CGFloat = 8
    let inset: CGFloat = 8
    let bottomLimit: CGFloat = 56
    let x = min(
      max(stageRect.midX - barSize.width / 2, inset),
      max(bounds.width - barSize.width - inset, inset))

    // AppKit's stage is not flipped: below is toward decreasing y.
    var y = stageRect.minY - gap - barSize.height
    if y < bottomLimit {
      let above = stageRect.maxY + gap
      y = above + barSize.height <= bounds.height - inset ? above : bottomLimit
    }
    y = min(max(y, inset), max(bounds.height - barSize.height - inset, inset))
    // Convert through AppKit rather than assuming sibling coordinate systems.
    islandBar.frame = stage.convert(
      CGRect(x: x, y: y, width: barSize.width, height: barSize.height),
      to: islandBar.superview)
  }
}
