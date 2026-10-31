import AppKit
import Foundation

/// Exercises the production chrome, without replacing pointer input with a claim of pointer coverage.
public enum IslandAnchorTests {
  public static func registerTests() {
    let registry = TestRegistry.shared
    registry.register(
      tier: 3, feature: "Native-IslandAnchor",
      name: "test_IslandAnchor_NestedFramesUseOutermostBoard"
    ) {
      let outer = node("outer", kind: .frame, rect: CGRect(x: 150, y: 120, width: 600, height: 450))
      let inner = node(
        "inner", parent: "outer", kind: .frame,
        rect: CGRect(x: 240, y: 240, width: 250, height: 200))
      let child = node(
        "child", parent: "inner", rect: CGRect(x: 270, y: 280, width: 30, height: 30))
      try assertAnchor(nodes: [outer, inner, child], selected: ["child"], expected: outer.bounds)
    }
    registry.register(
      tier: 3, feature: "Native-IslandAnchor",
      name: "test_IslandAnchor_UnframedGroupKeepsSelectedArtworkAnchor"
    ) {
      let group = node("group", kind: .group, rect: CGRect(x: 100, y: 100, width: 700, height: 500))
      let child = node(
        "child", parent: "group", rect: CGRect(x: 300, y: 250, width: 100, height: 80))
      try assertAnchor(nodes: [group, child], selected: ["child"], expected: child.bounds)
    }
    registry.register(
      tier: 3, feature: "Native-IslandAnchor",
      name: "test_IslandAnchor_RotationUsesVisibleOuterBounds"
    ) {
      var rotated = node("rotated", rect: CGRect(x: 300, y: 200, width: 200, height: 100))
      rotated.rotation = 90
      try assertAnchor(
        nodes: [rotated], selected: ["rotated"],
        expected: CGRect(x: 350, y: 150, width: 100, height: 200))
    }
    registry.register(
      tier: 3, feature: "Native-IslandAnchor",
      name: "test_IslandAnchor_MixedSelectionTracksZoomAndPan"
    ) {
      let outer = node("outer", kind: .frame, rect: CGRect(x: 100, y: 100, width: 300, height: 300))
      let group = node(
        "group", parent: "outer", kind: .group,
        rect: CGRect(x: 150, y: 150, width: 100, height: 100))
      let child = node(
        "child", parent: "group", rect: CGRect(x: 170, y: 170, width: 40, height: 40))
      let loose = node("loose", rect: CGRect(x: 500, y: 250, width: 100, height: 100))
      try assertAnchor(
        nodes: [outer, group, child, loose], selected: ["child", "loose"],
        expected: outer.bounds.union(loose.bounds), zoom: 0.75)
    }
    registry.register(
      tier: 2, feature: "Native-IslandAnchor", name: "test_IslandAnchor_CyclicAncestryTerminates"
    ) {
      let first = node(
        "first", parent: "second", rect: CGRect(x: 300, y: 250, width: 100, height: 80))
      let second = node(
        "second", parent: "first", rect: CGRect(x: 100, y: 100, width: 600, height: 500))
      try assertAnchor(nodes: [first, second], selected: ["first"], expected: first.bounds)
    }
  }

  private static func node(
    _ id: String, parent: String? = nil, kind: NodeKind = .rect, rect: CGRect
  ) -> VOONode {
    VOONode(
      id: id, parentId: parent, kind: kind, name: id, x: rect.minX, y: rect.minY, width: rect.width,
      height: rect.height)
  }

  private static func assertAnchor(
    nodes: [VOONode], selected: Set<String>, expected: CGRect, zoom: CGFloat = 1
  ) throws {
    let view = MainContentView(frame: CGRect(x: 0, y: 0, width: 1440, height: 900))
    view.isWelcomeOpen = false
    view.layoutSubtreeIfNeeded()
    let stage = view.canvasStageView
    stage.document.nodes = nodes
    stage.zoom = zoom
    stage.panOffset = CGPoint(x: 35, y: 25)
    stage.selectedNodeIds = selected
    view.sessionHasSelection = true
    view.islandBar.update(selectionLabel: "Selection")
    view.refreshChromeVisibility()
    view.updateIslandBarPosition()
    let anchor = stage.viewRect(from: expected)
    let actual = view.islandBar.frame
    try TestAssertions.assertApproxEqual(
      actual.midX, stage.frame.minX + anchor.midX, accuracy: 0.01,
      "Chrome follows the Electron anchor centre")
    try TestAssertions.assertApproxEqual(
      actual.maxY, stage.frame.minY + anchor.minY - 8, accuracy: 0.01,
      "Chrome stays eight points below the outer bounds")
    try TestAssertions.assertEqual(
      stage.document.nodes, nodes, "Chrome positioning never mutates artwork")
  }
}
