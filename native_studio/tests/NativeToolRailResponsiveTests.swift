#if INTEGRATED
    import AppKit

    enum NativeToolRailResponsiveTests {
        static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-ToolRail",
                name: "test_NarrowRailKeepsFortyFourPointTargetsAndFourPointGaps"
            ) {
                let rail = makeRail(width: 560)
                let buttons = visibleButtons(rail)
                try TestAssertions.assertEqual(buttons.count, 12)
                for button in buttons {
                    try TestAssertions.assertApproxEqual(button.frame.width, 44)
                    try TestAssertions.assertApproxEqual(button.frame.height, 44)
                }
                for index in 1..<buttons.count {
                    try TestAssertions.assertApproxEqual(
                        buttons[index].frame.minX - buttons[index - 1].frame.maxX, 4)
                }
            }
            registry.register(
                tier: 3, feature: "Native-ToolRail",
                name: "test_NarrowRailScrollReachesBothEndToolsAndClampsAtBounds"
            ) {
                let rail = makeRail(width: 560)
                rail.scrollTools(by: 1000)
                try TestAssertions.assertApproxEqual(rail.toolScrollOffset, 26)
                let last = rail.healingButton!
                let endFrame = last.convert(last.bounds, to: rail)
                try TestAssertions.assertApproxEqual(endFrame.width, 44)
                try TestAssertions.assertTrue(
                    endFrame.minX >= 0 && endFrame.maxX <= rail.bounds.width)
                rail.scrollTools(by: -1000)
                try TestAssertions.assertApproxEqual(rail.toolScrollOffset, 0)
                let first = rail.moveToolButton
                let startFrame = first.convert(first.bounds, to: rail)
                try TestAssertions.assertApproxEqual(startFrame.minX, 7)
                try TestAssertions.assertApproxEqual(startFrame.width, 44)
            }
            registry.register(
                tier: 3, feature: "Native-ToolRail",
                name: "test_ExpandingRailRestoresDesktopGeometryWithoutReplacingButtons"
            ) {
                let rail = makeRail(width: 560)
                let first = rail.moveToolButton
                let last = rail.healingButton!
                rail.scrollTools(by: 1000)
                rail.frame.size.width = 586
                rail.needsLayout = true
                rail.layoutSubtreeIfNeeded()
                try TestAssertions.assertTrue(rail.moveToolButton === first)
                try TestAssertions.assertTrue(rail.healingButton === last)
                try TestAssertions.assertTrue(first.superview === rail)
                try TestAssertions.assertTrue(last.superview === rail)
                try TestAssertions.assertApproxEqual(first.frame.minX, 7)
                try TestAssertions.assertApproxEqual(last.frame.maxX, 579)
                try TestAssertions.assertApproxEqual(rail.toolScrollOffset, 0)
            }
            registry.register(
                tier: 3, feature: "Native-ToolRail",
                name: "test_AgentToggleAtNineSixtyKeepsRailAndToolTargetsInsideEditor"
            ) {
                let content = MainContentView(frame: CGRect(x: 0, y: 0, width: 960, height: 600))
                content.isWelcomeOpen = false
                for open in [false, true, false] {
                    content.setAgentPanelOpen(open)
                    content.layoutSubtreeIfNeeded()
                    try drainMainQueue()
                    content.layoutSubtreeIfNeeded()
                    content.toolRail.layoutSubtreeIfNeeded()
                    let rail = content.toolRail
                    let frame = rail.convert(rail.bounds, to: content)
                    try TestAssertions.assertTrue(frame.minX >= 4)
                    try TestAssertions.assertTrue(
                        frame.maxX <= (open ? content.agentPanel.frame.minX : 956))
                    let shell = rail.superview!
                    let topInset =
                        shell.isFlipped ? rail.frame.minY : shell.bounds.maxY - rail.frame.maxY
                    try TestAssertions.assertApproxEqual(topInset, open ? 8 : 16)
                    if open {
                        try TestAssertions.assertApproxEqual(rail.frame.minX, 8)
                    } else {
                        try TestAssertions.assertApproxEqual(rail.frame.midX, shell.bounds.midX)
                    }
                    try TestAssertions.assertApproxEqual(rail.moveToolButton.frame.width, 44)
                    try TestAssertions.assertApproxEqual(rail.healingButton!.frame.width, 44)
                }
            }
            registry.register(
                tier: 3, feature: "Native-Taskbar",
                name: "test_RepeatedLayoutKeepsTaskbarButtonsAndLatestCallbacks"
            ) {
                let bar = ContextualTaskbarView()
                var node = VOONode(id: "rect", kind: .rect, x: 0, y: 0, width: 20, height: 20)
                let original = taskbarButtons(bar).map(ObjectIdentifier.init)
                for index in 0..<30 {
                    node.x = CGFloat(index)
                    bar.update(selectedNodes: [node])
                    bar.needsLayout = true
                    bar.layoutSubtreeIfNeeded()
                }
                try TestAssertions.assertEqual(
                    taskbarButtons(bar).map(ObjectIdentifier.init), original)
                var oldCalls = 0
                var newCalls = 0
                bar.onDuplicate = { oldCalls += 1 }
                bar.onDuplicate = { newCalls += 1 }
                taskbarButtons(bar).first {
                    if case .duplicate = $0.glyph { return true }
                    return false
                }!
                .performClick(nil)
                try TestAssertions.assertEqual(oldCalls, 0)
                try TestAssertions.assertEqual(newCalls, 1)
            }
            registry.register(
                tier: 3, feature: "Native-Taskbar",
                name: "test_TaskbarChangedStateWaitsForLayoutExitAndUpdatesActions"
            ) {
                let bar = ContextualTaskbarView()
                let original = taskbarButtons(bar).map(ObjectIdentifier.init)
                var image = VOONode(id: "image", kind: .image, x: 0, y: 0, width: 20, height: 20)
                image.style.locked = true
                image.style.visible = false
                bar.update(selectedNodes: [image])
                try TestAssertions.assertEqual(
                    taskbarButtons(bar).map(ObjectIdentifier.init), original,
                    "No NSStackView structure may change inside the calling layout pass")
                try drainMainQueue()
                let glyphs = taskbarButtons(bar).map { String(describing: $0.glyph) }
                try TestAssertions.assertTrue(glyphs.contains("unlock"))
                try TestAssertions.assertTrue(glyphs.contains("eyeOff"))
                try TestAssertions.assertTrue(glyphs.contains("wand"))
                var mattingCalls = 0
                bar.onAIRemoveBackground = { mattingCalls += 1 }
                taskbarButtons(bar).first {
                    if case .wand = $0.glyph { return true }
                    return false
                }!
                .performClick(nil)
                try TestAssertions.assertEqual(mattingCalls, 1)
            }
            registry.register(
                tier: 3, feature: "Native-Taskbar",
                name: "test_TaskbarCoalescesRevertedChangesWithoutReplacingButtons"
            ) {
                let bar = ContextualTaskbarView()
                let original = taskbarButtons(bar).map(ObjectIdentifier.init)
                var node = VOONode(id: "rect", kind: .rect, x: 0, y: 0, width: 20, height: 20)
                node.style.locked = true
                bar.update(selectedNodes: [node])
                node.style.locked = false
                bar.update(selectedNodes: [node])
                try drainMainQueue()
                try TestAssertions.assertEqual(
                    taskbarButtons(bar).map(ObjectIdentifier.init), original)
            }
            registry.register(
                tier: 3, feature: "Native-Taskbar",
                name: "test_TaskbarModeAndGroupChangesPreserveCorrectButtonState"
            ) {
                let bar = ContextualTaskbarView()
                let rect = VOONode(id: "rect", kind: .rect, x: 0, y: 0, width: 20, height: 20)
                let group = VOONode(id: "group", kind: .group, x: 0, y: 0, width: 20, height: 20)
                bar.update(selectedNodes: [rect], isPathEditing: true)
                try TestAssertions.assertEqual(bar.currentMode, .pathEditing)
                try drainMainQueue()
                try TestAssertions.assertTrue(
                    taskbarButtons(bar).contains {
                        if case .finishPath = $0.glyph { return true }
                        return false
                    })
                bar.update(selectedNodes: [rect, group])
                try TestAssertions.assertEqual(bar.currentMode, .multiSelection)
                try drainMainQueue()
                let ungroup = taskbarButtons(bar).first {
                    if case .ungroup = $0.glyph { return true }
                    return false
                }!
                try TestAssertions.assertTrue(ungroup.isEnabled)
                bar.update(selectedNodes: [rect, rect])
                try drainMainQueue()
                let disabledUngroup = taskbarButtons(bar).first {
                    if case .ungroup = $0.glyph { return true }
                    return false
                }!
                try TestAssertions.assertFalse(disabledUngroup.isEnabled)
            }
            registry.register(
                tier: 3, feature: "Native-ToolRail",
                name: "test_AttachedWindowLayoutSettlesAcrossWelcomeAgentAndResizeCycles"
            ) {
                let window = NSWindow(
                    contentRect: CGRect(x: 0, y: 0, width: 960, height: 600),
                    styleMask: [.titled, .resizable], backing: .buffered, defer: false)
                window.isReleasedWhenClosed = false
                let content = MainContentView(frame: CGRect(x: 0, y: 0, width: 960, height: 600))
                window.contentView = content
                defer {
                    window.contentView = nil
                    window.close()
                }
                let stage = content.canvasStageView
                let node = VOONode(
                    id: "layout-regression", kind: .rect,
                    x: 0, y: 0, width: 20, height: 20)
                stage.document.nodes.append(node)
                stage.selectedNodeIds = [node.id]
                content.sessionHasSelection = true
                content.islandBar.update(selectionLabel: "Layout regression")
                let first = content.toolRail.moveToolButton
                for width in [CGFloat(960), 1152, 960] {
                    window.setContentSize(CGSize(width: width, height: 600))
                    for welcome in [false, true, false] {
                        content.isWelcomeOpen = welcome
                        for agent in [false, true, false] {
                            content.setAgentPanelOpen(agent)
                            for _ in 0..<3 {
                                content.needsLayout = true
                                window.layoutIfNeeded()
                                try drainMainQueue()
                                window.layoutIfNeeded()
                            }
                            try TestAssertions.assertNil(
                                stage.contextualTaskbar.superview,
                                "The retired taskbar must not participate in window layout")
                            try TestAssertions.assertTrue(content.islandBar.superview != nil)
                            try TestAssertions.assertEqual(
                                content.islandBar.isHidden, welcome || agent)
                            if !welcome && !agent {
                                try TestAssertions.assertTrue(content.islandBar.frame.width > 0)
                            }
                            try TestAssertions.assertTrue(content.toolRail.moveToolButton === first)
                            try TestAssertions.assertApproxEqual(first.frame.width, 44)
                            let rail = content.toolRail
                            let constraints = rail.superview!.constraints.filter {
                                $0.isActive && ($0.firstItem as? NSView) === rail
                                    && [.top, .centerX, .leading].contains($0.firstAttribute)
                            }
                            try TestAssertions.assertEqual(
                                constraints.count, 2,
                                "One placement owns exactly a top and one horizontal constraint")
                        }
                    }
                }
            }
            registry.register(
                tier: 3, feature: "Native-ToolRail",
                name: "test_ProductionWindowStaysAtMinimumSizeWhenAgentOpensAndCloses"
            ) {
                let controller = WindowController()
                let window = controller.studioWindow
                let content = controller.mainContentView
                let target = CGSize(width: 960, height: 600)
                defer {
                    // This fixture owns a fresh controller and never edits a document.
                    // Detach its delegate during cleanup so failures cannot open a discard alert.
                    window.orderOut(nil)
                    window.delegate = nil
                    window.close()
                }
                try TestAssertions.assertEqual(window.minSize, target)
                try TestAssertions.assertTrue(window.styleMask.contains(.fullSizeContentView))
                try TestAssertions.assertTrue(window.styleMask.contains(.resizable))
                content.isWelcomeOpen = false
                window.orderFront(nil)
                window.setFrame(CGRect(origin: window.frame.origin, size: target), display: true)
                try settleWindow(window)
                try TestAssertions.assertEqual(window.frame.size, target)
                for open in [true, false, true, false] {
                    content.setAgentPanelOpen(open)
                    try settleWindow(window)
                    try TestAssertions.assertEqual(
                        window.frame.size, target,
                        "Opening Agent must not increase the production window minimum to 986pt")
                    let rail = content.toolRail
                    try TestAssertions.assertApproxEqual(rail.moveToolButton.frame.width, 44)
                    if open {
                        try TestAssertions.assertTrue(
                            rail.bounds.width < 586,
                            "The real window must exercise toolbar overflow rather than grow")
                        rail.scrollTools(by: 1000)
                        try TestAssertions.assertTrue(rail.toolScrollOffset > 0)
                        let last = rail.healingButton!
                        let visible = last.convert(last.bounds, to: rail)
                        try TestAssertions.assertTrue(
                            visible.minX >= 0 && visible.maxX <= rail.bounds.width)
                        window.setFrame(
                            CGRect(
                                origin: window.frame.origin,
                                size: CGSize(width: 1024, height: 600)), display: true)
                        try settleWindow(window)
                        window.setFrame(
                            CGRect(origin: window.frame.origin, size: target), display: true)
                        try settleWindow(window)
                        try TestAssertions.assertEqual(
                            window.frame.size, target,
                            "The production window can resize back to 960pt while Agent is open")
                    } else {
                        try TestAssertions.assertApproxEqual(rail.toolScrollOffset, 0)
                        try TestAssertions.assertApproxEqual(rail.bounds.width, 586)
                    }
                }
                try TestAssertions.assertFalse(controller.hasUnsavedChanges)
            }
        }

        private static func settleWindow(_ window: NSWindow) throws {
            for _ in 0..<3 {
                window.contentView?.needsLayout = true
                window.layoutIfNeeded()
                try drainMainQueue()
                window.layoutIfNeeded()
            }
        }

        private static func taskbarButtons(_ bar: ContextualTaskbarView) -> [TaskbarIconButton] {
            let stack = bar.subviews.compactMap { $0 as? NSStackView }.first!
            return stack.arrangedSubviews.compactMap { $0 as? TaskbarIconButton }
        }

        private static func drainMainQueue() throws {
            let checkpoint = DispatchSemaphore(value: 0)
            // FIFO ordering proves that all earlier queued presentation work ran;
            // a fixed sleep does not establish that prerequisite under load.
            DispatchQueue.main.async { checkpoint.signal() }
            let deadline = Date(timeIntervalSinceNow: 2)
            while Date() < deadline {
                if checkpoint.wait(timeout: .now()) == .success { return }
                RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 0.01))
            }
            throw TestFailure(
                message: "The main queue did not reach its FIFO checkpoint",
                file: #file, line: #line)
        }

        private static func makeRail(width: CGFloat) -> ToolRailView {
            let rail = ToolRailView()
            rail.frame.size.width = width
            rail.needsLayout = true
            rail.layoutSubtreeIfNeeded()
            return rail
        }

        private static func visibleButtons(_ rail: ToolRailView) -> [NSButton] {
            let tools = rail.toolButtons.values.filter { !$0.isHidden }.map { $0 as NSButton }
            return (tools + rail.accessoryButtons.values.map { $0 as NSButton })
                .sorted { $0.frame.minX < $1.frame.minX }
        }
    }
#endif
