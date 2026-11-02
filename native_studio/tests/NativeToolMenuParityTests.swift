#if INTEGRATED
    import AppKit

    enum NativeToolMenuParityTests {
        static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-ToolMenu",
                name: "test_ToolFamilyMenuMatchesWebRowsAndInactiveSelection"
            ) {
                let items = NativeToolMenuModel.items(for: .shapes, selection: "")
                try TestAssertions.assertEqual(items.count, 6)
                try TestAssertions.assertTrue(
                    items.allSatisfy { !$0.isSelected && $0.shortcut.isEmpty })
                let content = ToolFlyoutContentView(items: items)
                try TestAssertions.assertApproxEqual(content.frame.width, 142)
                try TestAssertions.assertApproxEqual(content.frame.height, 176)
                try TestAssertions.assertApproxEqual(content.rows[0].frame.minY, 5)
                try TestAssertions.assertApproxEqual(content.rows[1].frame.minY, 33)
                try TestAssertions.assertApproxEqual(content.rows[0].frame.height, 26)
                try TestAssertions.assertApproxEqual(NativeToolMenuModel.font.pointSize, 11)
                try TestAssertions.assertTrue(
                    content.rows.allSatisfy { !$0.item.title.contains("(") })
            }
            registry.register(
                tier: 3, feature: "Native-ToolMenu",
                name: "test_InactiveShapeMenuChoiceActivatesActualCanvasFamily"
            ) {
                let controller = WindowController(contentView: MainContentView())
                let rail = controller.mainContentView.toolRail
                let menu = ToolFlyoutPopover.shared
                defer { menu.close() }
                rail.moveToolButton.performClick(nil)
                rail.showFlyout(for: rail.toolButtons[.shapes]!)
                try TestAssertions.assertTrue(menu.selectItem(id: "ellipse"))
                try TestAssertions.assertEqual(rail.state.activeTool, .shapes)
                try TestAssertions.assertEqual(rail.state.shapeSubTool, .ellipse)
                try TestAssertions.assertEqual(
                    controller.mainContentView.canvasStageView.activeTool, .shapes)
                try TestAssertions.assertEqual(
                    controller.mainContentView.canvasStageView.activeShapeSubTool, .ellipse)
                try TestAssertions.assertEqual(
                    rail.shapesToolButton.accessibilityLabel(),
                    NativeToolMenuModel.title("ellipse"))
                try TestAssertions.assertFalse(menu.isOpen)
                rail.shapesToolButton.performClick(nil)
                try TestAssertions.assertEqual(
                    rail.state.shapeSubTool, .rect,
                    "The main shape button chooses Rectangle; the caret owns the menu")
                rail.toolButtons[.shapes]!.menuTrigger!.performClick(nil)
                try TestAssertions.assertTrue(menu.isOpen)
            }
            registry.register(
                tier: 3, feature: "Native-ToolMenu",
                name: "test_PenFamilyMenuSelectionAndMainButtonUseSharedToolActions"
            ) {
                let controller = WindowController(contentView: MainContentView())
                let rail = controller.mainContentView.toolRail
                let menu = ToolFlyoutPopover.shared
                defer { menu.close() }
                rail.showFlyout(for: rail.toolButtons[.pen]!)
                try TestAssertions.assertTrue(menu.selectItem(id: "curvature"))
                try TestAssertions.assertEqual(rail.state.activeTool, .pen)
                try TestAssertions.assertEqual(
                    controller.mainContentView.canvasStageView.activePenSubTool, .curvature)
                rail.penToolButton.performClick(nil)
                try TestAssertions.assertEqual(rail.state.penSubTool, .pen)
                try TestAssertions.assertFalse(menu.isOpen)
            }
            registry.register(
                tier: 3, feature: "Native-ToolMenu",
                name: "test_FamilyHoverDelaysHandoffAndExplicitCaretPin"
            ) {
                let rail = ToolRailView()
                let button = rail.toolButtons[.pen]!
                let menu = ToolFlyoutPopover.shared
                menu.close()
                defer {
                    rail.familyMenuHover.cancel()
                    menu.close()
                }
                rail.handleFamilyHover(for: button, entered: true)
                try TestAssertions.assertEqual(rail.familyMenuHover.pendingDelay, 0.120)
                try TestAssertions.assertFalse(menu.isOpen)
                rail.familyMenuHover.runPendingAction()
                try TestAssertions.assertTrue(menu.isHoverOpened)
                try TestAssertions.assertNil(
                    menu.menuView?.focusedIndex,
                    "Hover must not steal keyboard focus")
                rail.handleFamilyHover(for: button, entered: false)
                try TestAssertions.assertEqual(rail.familyMenuHover.pendingDelay, 0.220)
                menu.onPointerEntered?()
                try TestAssertions.assertNil(rail.familyMenuHover.pendingDelay)
                rail.toggleFamilyMenu(for: button)
                try TestAssertions.assertFalse(menu.isHoverOpened)
                try TestAssertions.assertEqual(menu.menuView?.focusedIndex, 0)
                rail.handleFamilyHover(for: button, entered: false)
                try TestAssertions.assertNil(
                    rail.familyMenuHover.pendingDelay,
                    "A clicked menu stays pinned after the pointer leaves")
                rail.toggleFamilyMenu(for: button)
                try TestAssertions.assertFalse(menu.isOpen)
            }
            registry.register(
                tier: 3, feature: "Native-ToolMenu",
                name: "test_FamilyMenuKeyboardSelectionAndEscapeDismissal"
            ) {
                let rail = ToolRailView()
                let menu = ToolFlyoutPopover.shared
                defer { menu.close() }
                rail.showFlyout(for: rail.toolButtons[.shapes]!)
                let content = menu.menuView!
                try TestAssertions.assertEqual(content.focusedIndex, 0)
                try TestAssertions.assertTrue(content.handleMenuKey(119))
                try TestAssertions.assertEqual(content.focusedIndex, 5)
                try TestAssertions.assertTrue(content.handleMenuKey(125))
                try TestAssertions.assertEqual(content.focusedIndex, 0)
                try TestAssertions.assertFalse(menu.selectItem(id: "unknown"))
                try TestAssertions.assertTrue(content.handleMenuKey(36))
                try TestAssertions.assertEqual(rail.state.shapeSubTool, .rect)
                try TestAssertions.assertFalse(menu.isOpen)
                rail.showFlyout(for: rail.toolButtons[.pen]!)
                try TestAssertions.assertTrue(menu.handleEscape())
                try TestAssertions.assertFalse(menu.isOpen)
            }
            registry.register(
                tier: 3, feature: "Native-ToolMenu",
                name: "test_FamilyMenuAnchorUsesWebEightPixelGapAndScreenClamp"
            ) {
                let frame = NativeToolMenuPresenter.frame(
                    anchor: CGRect(x: 10, y: 500, width: 44, height: 44),
                    size: CGSize(width: 142, height: 92),
                    visibleFrame: CGRect(x: 0, y: 0, width: 1440, height: 900))
                try TestAssertions.assertApproxEqual(frame.minX, 8)
                try TestAssertions.assertApproxEqual(frame.maxY, 492)
            }
        }
    }
#endif
