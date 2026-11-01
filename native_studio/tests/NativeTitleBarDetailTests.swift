#if INTEGRATED
    import AppKit

    /// The Electron reference has a 28pt capsule and centred text. The old
    /// NSTextField rendered the same title four pixels above the reference.
    enum NativeTitleBarDetailTests {
        static func registerTests() {
            let registry = TestRegistry.shared
            registry.register(
                tier: 3, feature: "Native-TitleBar",
                name: "test_TabTitlesKeepCaseStripExtensionAndRespectWebWidthCaps"
            ) {
                let bar = makeBar()
                let titles = [
                    "A.voo", "form-reference.VOO", "中文设计.voo",
                    String(repeating: "Long Title ", count: 20) + ".voo",
                ]
                for title in titles {
                    bar.setDocumentTitle(title)
                    bar.layoutSubtreeIfNeeded()
                    let expected = String(title.dropLast(4))
                    try TestAssertions.assertEqual(bar.docTitleField.stringValue, expected)
                    try TestAssertions.assertEqual(bar.state.documentTitle, title)
                    try TestAssertions.assertTrue(bar.docTitleField.frame.width <= 148)
                    try TestAssertions.assertTrue(bar.documentTabFrame.width <= 188)
                    try TestAssertions.assertApproxEqual(bar.documentTabFrame.height, 28)
                    try TestAssertions.assertApproxEqual(
                        bar.tabPlusButton.frame.minX - bar.documentTabFrame.maxX, 4)
                }
                bar.setDocumentTitle("A.voo")
                bar.layoutSubtreeIfNeeded()
                try TestAssertions.assertTrue(
                    bar.docTitleField.frame.width < 24,
                    "A short label must not inherit the old 24pt minimum")
                let attributes = bar.docTitleField.attributedStringValue.attributes(
                    at: 0,
                    effectiveRange: nil)
                try TestAssertions.assertApproxEqual(attributes[.kern] as! CGFloat, 0.3)
            }
            registry.register(
                tier: 3, feature: "Native-TitleBar",
                name: "test_TabTitleActualGlyphInkIsVerticallyCentredInsideCapsule"
            ) {
                let bar = makeBar()
                for title in ["form-reference", "中文设计", "Agjp"] {
                    bar.setDocumentTitle(title)
                    bar.layoutSubtreeIfNeeded()
                    let field = bar.docTitleField
                    let image = try render(field)
                    let ink = try visibleBounds(image)
                    try TestAssertions.assertApproxEqual(
                        ink.midY, field.bounds.midY,
                        accuracy: 1.5,
                        "Actual glyph ink must not retain the old four-pixel upward offset")
                    let cell = field.cell as! NativeDocumentTitleCell
                    let textRect = cell.drawingRect(forBounds: field.bounds)
                    try TestAssertions.assertApproxEqual(textRect.minX, field.bounds.minX)
                    try TestAssertions.assertApproxEqual(textRect.midY, field.bounds.midY)
                }
            }
            registry.register(
                tier: 3, feature: "Native-TitleBar",
                name: "test_DirtyTabMarkReservesSpaceWithoutMovingTitleBaseline"
            ) {
                let bar = makeBar()
                bar.setDocumentTitle(String(repeating: "Long", count: 30))
                bar.layoutSubtreeIfNeeded()
                let clean = bar.documentTabFrame
                let label = bar.docTitleField.frame
                bar.setDocumentDirty(true)
                bar.layoutSubtreeIfNeeded()
                try TestAssertions.assertTrue(bar.state.isDirty)
                try TestAssertions.assertApproxEqual(bar.documentTabFrame.width, clean.width + 12)
                try TestAssertions.assertApproxEqual(bar.documentTabFrame.width, 200)
                try TestAssertions.assertRectApproxEqual(bar.docTitleField.frame, label)
                try TestAssertions.assertApproxEqual(bar.documentDirtyMarkFrame.width, 6)
                try TestAssertions.assertApproxEqual(bar.documentDirtyMarkFrame.height, 6)
                try TestAssertions.assertApproxEqual(
                    bar.documentDirtyMarkFrame.minX - label.maxX, 6)
                try TestAssertions.assertApproxEqual(
                    bar.tabCloseButton.frame.minX - bar.documentDirtyMarkFrame.maxX, 0)
                bar.setDocumentDirty(false)
                bar.layoutSubtreeIfNeeded()
                try TestAssertions.assertRectApproxEqual(bar.documentTabFrame, clean)
            }
            registry.register(
                tier: 3, feature: "Native-TitleBar",
                name: "test_TabTitleEscapeRestoresValueAndReturnCommitsOnce"
            ) {
                let bar = makeBar()
                bar.setDocumentTitle("Original.voo")
                let field = bar.docTitleField
                var commits: [String] = []
                field.onTitleCommit = { commits.append($0) }
                field.beginTitleEditing()
                field.stringValue = "取消后的名字"
                try TestAssertions.assertTrue(
                    field.control(
                        field, textView: NSTextView(),
                        doCommandBy: NSSelectorFromString("cancelOperation:")))
                try TestAssertions.assertEqual(field.stringValue, "Original")
                try TestAssertions.assertTrue(commits.isEmpty)
                try TestAssertions.assertFalse(field.isEditable)
                field.beginTitleEditing()
                field.stringValue = "New Design"
                try TestAssertions.assertTrue(
                    field.control(
                        field, textView: NSTextView(),
                        doCommandBy: NSSelectorFromString("insertNewline:")))
                field.controlTextDidEndEditing(
                    Notification(name: NSControl.textDidEndEditingNotification))
                try TestAssertions.assertEqual(commits, ["New Design"])
                try TestAssertions.assertFalse(field.isEditable)
            }
            registry.register(
                tier: 3, feature: "Native-TitleBar",
                name: "test_TabEditingAndDirtyRefreshKeepOneTextRectangle"
            ) {
                let bar = makeBar()
                bar.setDocumentTitle("Original.voo")
                bar.layoutSubtreeIfNeeded()
                let field = bar.docTitleField
                let cell = field.cell as! NativeDocumentTitleCell
                let originalRect = cell.titleRect(forBounds: field.bounds)
                field.beginTitleEditing()
                field.stringValue = "正在编辑中文与 English"
                bar.setDocumentDirty(true)
                bar.layoutSubtreeIfNeeded()
                try TestAssertions.assertEqual(field.stringValue, "正在编辑中文与 English")
                try TestAssertions.assertApproxEqual(
                    cell.titleRect(forBounds: field.bounds).midY,
                    originalRect.midY)
                try TestAssertions.assertApproxEqual(
                    cell.titleRect(forBounds: field.bounds).minX,
                    originalRect.minX)
                try TestAssertions.assertTrue(field.intrinsicContentSize.width <= 148)
                try TestAssertions.assertFalse(
                    field.control(
                        field, textView: NSTextView(),
                        doCommandBy: NSSelectorFromString("moveLeft:")),
                    "Editing navigation stays with the field editor")
            }
            registry.register(
                tier: 3, feature: "Native-TitleBar",
                name: "test_TabCloseAndNewGlyphsMatchWebHitAreasAndRasterBounds"
            ) {
                let bar = makeBar()
                try TestAssertions.assertApproxEqual(bar.tabCloseButton.frame.width, 28)
                try TestAssertions.assertApproxEqual(bar.tabCloseButton.frame.height, 28)
                let closeInk = try visibleBounds(render(bar.tabCloseButton))
                try TestAssertions.assertTrue(
                    closeInk.width <= 8 && closeInk.height <= 8,
                    "Lucide X at 12px has a 6px path with a 1.1px rendered stroke")
                try TestAssertions.assertApproxEqual(closeInk.midX, 14, accuracy: 1)
                let plus = try render(bar.tabPlusButton)
                try TestAssertions.assertTrue(
                    plus.colorAt(x: 0, y: 12)!.alphaComponent > 0.1,
                    "The 24px creation background must not have the old one-pixel inset")
            }
            registry.register(
                tier: 3, feature: "Native-TitleBar",
                name: "test_TitleBarActionTrackingAndSettingsNegativeMarginMatchWeb"
            ) {
                let bar = makeBar()
                try TestAssertions.assertApproxEqual(bar.settingsButton.frame.maxX, 1440 - 12)
                try TestAssertions.assertApproxEqual(bar.settingsButton.frame.midX, 1414)
                try TestAssertions.assertApproxEqual(
                    bar.settingsButton.frame.minX - bar.browserButton.frame.maxX, 4)
                try TestAssertions.assertApproxEqual(bar.exportButton.letterSpacing, 0.275)
                try TestAssertions.assertApproxEqual(bar.openButton.letterSpacing, 0.275)
                try render(bar.settingsButton)
            }
        }

        private static func makeBar() -> AppTitleBar {
            let bar = AppTitleBar(frame: CGRect(x: 0, y: 0, width: 1440, height: 40))
            bar.layoutSubtreeIfNeeded()
            return bar
        }

        @discardableResult
        private static func render(_ view: NSView) throws -> NSBitmapImageRep {
            guard
                let bitmap = NSBitmapImageRep(
                    bitmapDataPlanes: nil,
                    pixelsWide: Int(ceil(view.bounds.width)),
                    pixelsHigh: Int(ceil(view.bounds.height)),
                    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
                let context = NSGraphicsContext(bitmapImageRep: bitmap)
            else { throw failure("Could not create title bar bitmap") }
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = context
            context.cgContext.clear(view.bounds)
            view.displayIgnoringOpacity(view.bounds, in: context)
            NSGraphicsContext.restoreGraphicsState()
            return bitmap
        }

        private static func visibleBounds(_ bitmap: NSBitmapImageRep) throws -> CGRect {
            var result = CGRect.null
            for y in 0..<bitmap.pixelsHigh {
                for x in 0..<bitmap.pixelsWide {
                    if bitmap.colorAt(x: x, y: y)!.alphaComponent > 0.5 {
                        result = result.union(CGRect(x: x, y: y, width: 1, height: 1))
                    }
                }
            }
            guard !result.isNull else { throw failure("The title bar control did not draw") }
            return result
        }

        private static func failure(_ message: String) -> TestFailure {
            TestFailure(message: message, file: #file, line: #line)
        }
    }
#endif
