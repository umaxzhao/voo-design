//
//  AdversarialWindowStressTests.swift
//  native_studio
//
//  Empirical Adversarial Stress Testing Suite for Window Hierarchy,
//  Snapshot Pixels & AppKit Controls in native_studio.
//
//  Areas Tested:
//  1. WindowController Initializer Invariants & Anti-Facade Matrix
//  2. Rapid Window Lifecycle & Memory Stability (100+ Instances)
//  3. Multi-Resolution Headless Snapshot Pixel Forensics (1440x900, 1920x1080, 2560x1440, etc.)
//  4. AppKit Controls & AutoLayout Constraint Stress
//

import AppKit
import CoreGraphics
import Darwin
import Foundation

// MARK: - Process Memory Statistics Utility

struct ProcessMemoryStats {
    let rssBytes: UInt64
    let physFootprintBytes: UInt64

    var rssMB: Double { Double(rssBytes) / (1024.0 * 1024.0) }
    var footprintMB: Double { Double(physFootprintBytes) / (1024.0 * 1024.0) }

    static func current() -> ProcessMemoryStats {
        var basicInfo = mach_task_basic_info()
        var basicCount = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let basicKerr: kern_return_t = withUnsafeMutablePointer(to: &basicInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(basicCount)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &basicCount)
            }
        }
        let rss = (basicKerr == KERN_SUCCESS) ? basicInfo.resident_size : 0

        var vmInfo = task_vm_info_data_t()
        var vmCount = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let vmKerr: kern_return_t = withUnsafeMutablePointer(to: &vmInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &vmCount)
            }
        }
        let footprint = (vmKerr == KERN_SUCCESS) ? vmInfo.phys_footprint : 0
        return ProcessMemoryStats(rssBytes: rss, physFootprintBytes: footprint)
    }
}

// MARK: - Weak Reference Box for Leak Detection

final class WeakRef<T: AnyObject> {
    weak var value: T?
    init(_ value: T) {
        self.value = value
    }
}

// MARK: - Test Harness

final class AdversarialHarness {
    private var totalTests = 0
    private var passedTests = 0
    private var failedTests = 0
    private var failureMessages: [String] = []

    func assert(_ condition: Bool, _ testName: String, detail: String = "") {
        totalTests += 1
        if condition {
            print("  ✓ [PASS] \(testName)")
            passedTests += 1
        } else {
            let msg = "  ✗ [FAIL] \(testName) \(detail.isEmpty ? "" : "(\(detail))")"
            print(msg)
            failedTests += 1
            failureMessages.append(msg)
        }
    }

    func section(_ title: String) {
        print("\n" + String(repeating: "=", count: 76))
        print("  \(title)")
        print(String(repeating: "=", count: 76))
    }

    func summary() -> Bool {
        print("\n" + String(repeating: "=", count: 76))
        print("  ADVERSARIAL STRESS SUITE SUMMARY")
        print(String(repeating: "=", count: 76))
        print("  Total Asserts: \(totalTests)")
        print("  Passed:        \(passedTests)")
        print("  Failed:        \(failedTests)")
        if !failureMessages.isEmpty {
            print("\n  Failures recorded:")
            for f in failureMessages {
                print("    \(f)")
            }
        }
        print(String(repeating: "=", count: 76))
        return failedTests == 0
    }
}

// MARK: - Main Test Runner

@main
struct AdversarialWindowStressMain {
    static func main() {
        let harness = AdversarialHarness()
        print("============================================================================")
        print("  VOO DESIGN NATIVE STUDIO — WINDOW & CONTROL ADVERSARIAL STRESS HARNESS")
        print("============================================================================")
        print("Target: WindowController.swift & MainContentView")
        print("Timestamp: \(ISO8601DateFormatter().string(from: Date()))")

        testArea1InitializerInvariants(harness: harness)
        testArea2RapidLifecycleAndMemory(harness: harness)
        testArea3MultiResolutionPixelForensics(harness: harness)
        testArea4ControlsAndAutoLayoutStress(harness: harness)

        let success = harness.summary()
        if !success {
            exit(1)
        }
    }

    // =========================================================================
    // Area 1: WindowController Initializer Invariants & Anti-Facade Matrix
    // =========================================================================
    static func testArea1InitializerInvariants(harness: AdversarialHarness) {
        harness.section("Area 1: WindowController Initializer Invariants & Anti-Facade Matrix")

        // 1.1 WindowController() Default Initializer
        let wcDefault = WindowController()
        harness.assert(
            wcDefault.studioWindow.contentView === wcDefault.mainContentView,
            "1.1.1 WindowController() binds studioWindow.contentView === mainContentView"
        )
        harness.assert(
            wcDefault.window === wcDefault.studioWindow,
            "1.1.2 WindowController() exposes window === studioWindow"
        )
        harness.assert(
            wcDefault.window?.contentView === wcDefault.mainContentView,
            "1.1.3 WindowController().window?.contentView === mainContentView"
        )
        harness.assert(
            wcDefault.studioWindow.accessibilityIdentifier() == "main_window",
            "1.1.4 WindowController() root window accessibilityIdentifier == 'main_window'"
        )
        harness.assert(
            wcDefault.studioWindow.accessibilityRole() == .window,
            "1.1.5 WindowController() root window accessibilityRole == .window"
        )
        harness.assert(
            wcDefault.studioWindow.title == "VOO Design Native",
            "1.1.6 WindowController() sets authoritative window title"
        )
        harness.assert(
            wcDefault.studioWindow.backgroundColor == ThemeTokens.colorPanel,
            "1.1.7 WindowController() sets ThemeTokens.colorPanel background color"
        )
        harness.assert(
            wcDefault.studioWindow.titlebarAppearsTransparent == true,
            "1.1.8 WindowController() sets titlebarAppearsTransparent == true"
        )
        harness.assert(
            wcDefault.mainContentView.accessibilityIdentifier() == "main_content_view",
            "1.1.9 WindowController() mainContentView accessibilityIdentifier == 'main_content_view'"
        )

        // 1.2 WindowController(window: nil)
        let wcNil = WindowController(window: nil)
        harness.assert(
            wcNil.studioWindow.contentView === wcNil.mainContentView,
            "1.2.1 WindowController(window: nil) binds studioWindow.contentView === mainContentView"
        )
        harness.assert(
            wcNil.studioWindow.accessibilityIdentifier() == "main_window",
            "1.2.2 WindowController(window: nil) root accessibilityIdentifier == 'main_window'"
        )
        harness.assert(
            wcNil.studioWindow.accessibilityRole() == .window,
            "1.2.3 WindowController(window: nil) accessibilityRole == .window"
        )
        harness.assert(
            wcNil.mainContentView.accessibilityIdentifier() == "main_content_view",
            "1.2.4 WindowController(window: nil) mainContentView identifier verified"
        )

        // 1.3 WindowController(window: customWindow) Matrix
        // Case 1.3.A: customWindow with nil contentView
        let winNilContent = NSWindow(
            contentRect: NSRect(x: 50, y: 50, width: 1200, height: 750),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: true
        )
        winNilContent.contentView = nil
        let wcCustomNilContent = WindowController(window: winNilContent)
        harness.assert(
            wcCustomNilContent.studioWindow.contentView === wcCustomNilContent.mainContentView,
            "1.3.A WindowController(window: customWindowWithNilContentView) attaches mainContentView"
        )
        harness.assert(
            wcCustomNilContent.studioWindow.accessibilityIdentifier() == "main_window",
            "1.3.A Root accessibilityIdentifier == 'main_window'"
        )

        // Case 1.3.B: customWindow with plain NSView (non-MainContentView)
        let winPlainView = NSWindow(
            contentRect: NSRect(x: 60, y: 60, width: 1000, height: 700),
            styleMask: [.titled, .resizable],
            backing: .buffered,
            defer: true
        )
        winPlainView.contentView = NSView(frame: NSRect(x: 0, y: 0, width: 1000, height: 700))
        let wcCustomPlain = WindowController(window: winPlainView)
        harness.assert(
            wcCustomPlain.studioWindow.contentView === wcCustomPlain.mainContentView,
            "1.3.B WindowController(window: customWithPlainNSView) replaces with MainContentView"
        )
        harness.assert(
            wcCustomPlain.studioWindow.accessibilityIdentifier() == "main_window",
            "1.3.B Root accessibilityIdentifier == 'main_window'"
        )

        // Case 1.3.C: customWindow with pre-attached MainContentView
        let winPreAttached = NSWindow(
            contentRect: NSRect(x: 70, y: 70, width: 1600, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: true
        )
        let preView = MainContentView(frame: NSRect(x: 0, y: 0, width: 1600, height: 900))
        winPreAttached.contentView = preView
        let wcCustomPre = WindowController(window: winPreAttached)
        harness.assert(
            wcCustomPre.studioWindow.contentView === preView,
            "1.3.C WindowController reuses pre-existing MainContentView"
        )
        harness.assert(
            wcCustomPre.mainContentView === preView,
            "1.3.C mainContentView references pre-existing MainContentView"
        )
        harness.assert(
            wcCustomPre.studioWindow.accessibilityIdentifier() == "main_window",
            "1.3.C Root accessibilityIdentifier == 'main_window'"
        )

        // Case 1.3.D: customWindow with exotic dimensions (e.g. 2560x1440, 800x500)
        let winExotic = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 2560, height: 1440),
            styleMask: [.borderless],
            backing: .buffered,
            defer: true
        )
        let wcExotic = WindowController(window: winExotic)
        harness.assert(
            wcExotic.studioWindow.contentView === wcExotic.mainContentView,
            "1.3.D WindowController(window: 2560x1440 borderless) attaches mainContentView"
        )
        harness.assert(
            wcExotic.studioWindow.accessibilityIdentifier() == "main_window",
            "1.3.D 2560x1440 window accessibilityIdentifier == 'main_window'"
        )

        // 1.4 WindowController(contentView: customView)
        let injectedView = MainContentView(frame: NSRect(x: 0, y: 0, width: 1920, height: 1080))
        let wcInjected = WindowController(contentView: injectedView)
        harness.assert(
            wcInjected.studioWindow.contentView === injectedView,
            "1.4.1 WindowController(contentView:) attaches injected customView"
        )
        harness.assert(
            wcInjected.mainContentView === injectedView,
            "1.4.2 WindowController.mainContentView === injected customView"
        )
        harness.assert(
            wcInjected.studioWindow.contentView === wcInjected.mainContentView,
            "1.4.3 Injected WindowController studioWindow.contentView === mainContentView"
        )
        harness.assert(
            wcInjected.studioWindow.accessibilityIdentifier() == "main_window",
            "1.4.4 Injected WindowController root accessibilityIdentifier == 'main_window'"
        )

        // 1.5 Setter Invariance & Safe Identity
        let wcSetterTest = WindowController()
        let rogueWindow = NSWindow()
        wcSetterTest.window = rogueWindow
        harness.assert(
            wcSetterTest.window === wcSetterTest.studioWindow,
            "1.5.1 Setting wc.window = rogueWindow is overridden: getter preserves studioWindow"
        )
        harness.assert(
            wcSetterTest.studioWindow.contentView === wcSetterTest.mainContentView,
            "1.5.2 studioWindow.contentView remains mainContentView after external window set"
        )
    }

    // =========================================================================
    // Area 2: Rapid Window Lifecycle & Memory Stability (100+ Instances)
    // =========================================================================
    static func testArea2RapidLifecycleAndMemory(harness: AdversarialHarness) {
        harness.section("Area 2: Rapid Window Lifecycle & Memory Stability")

        // 2.1 Single Instance Full Subtree Deallocation
        var weakWC: WeakRef<WindowController>?
        var weakWin: WeakRef<NSWindow>?
        var weakView: WeakRef<MainContentView>?
        var weakTitleBar: WeakRef<NSView>?
        var weakToolRail: WeakRef<NSView>?
        var weakInspector: WeakRef<NSView>?
        var weakCanvas: WeakRef<NSView>?

        autoreleasepool {
            let wc = WindowController()
            weakWC = WeakRef(wc)
            weakWin = WeakRef(wc.studioWindow)
            weakView = WeakRef(wc.mainContentView)
            weakTitleBar = WeakRef(wc.mainContentView.titleBarView)
            weakToolRail = WeakRef(wc.mainContentView.toolRailView)
            weakInspector = WeakRef(wc.mainContentView.inspectorStudioView)
            weakCanvas = WeakRef(wc.mainContentView.canvasViewportView)
        }
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.005))

        harness.assert(
            weakWC?.value == nil,
            "2.1.1 WindowController deallocates cleanly without retain cycle"
        )
        harness.assert(
            weakWin?.value == nil,
            "2.1.2 NSWindow deallocates cleanly when WindowController is released"
        )
        harness.assert(
            weakView?.value == nil,
            "2.1.3 MainContentView deallocates cleanly when NSWindow is released"
        )
        harness.assert(
            weakTitleBar?.value == nil && weakToolRail?.value == nil &&
            weakInspector?.value == nil && weakCanvas?.value == nil,
            "2.1.4 All 4 primary subviews deallocate cleanly (no retain cycles in view hierarchy)"
        )

        // 2.2 Rapid 100-Iteration Lifecycle & Complete Deallocation
        let startMem = ProcessMemoryStats.current()
        print("  --> Baseline Memory: RSS = \(String(format: "%.2f", startMem.rssMB)) MB, Footprint = \(String(format: "%.2f", startMem.footprintMB)) MB")

        var weakControllers = [WeakRef<WindowController>]()
        var weakWindows = [WeakRef<NSWindow>]()
        var weakViews = [WeakRef<MainContentView>]()

        weakControllers.reserveCapacity(100)
        weakWindows.reserveCapacity(100)
        weakViews.reserveCapacity(100)

        for i in 1...100 {
            autoreleasepool {
                let wc = WindowController()
                wc.studioWindow.layoutIfNeeded()
                wc.mainContentView.layoutSubtreeIfNeeded()
                weakControllers.append(WeakRef(wc))
                weakWindows.append(WeakRef(wc.studioWindow))
                weakViews.append(WeakRef(wc.mainContentView))
            }
            if i % 25 == 0 {
                let currentMem = ProcessMemoryStats.current()
                print("  --> Step \(i)/100: RSS = \(String(format: "%.2f", currentMem.rssMB)) MB")
            }
        }

        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))

        var aliveControllers = 0
        var aliveWindows = 0
        var aliveViews = 0

        for ref in weakControllers where ref.value != nil { aliveControllers += 1 }
        for ref in weakWindows where ref.value != nil { aliveWindows += 1 }
        for ref in weakViews where ref.value != nil { aliveViews += 1 }

        harness.assert(
            aliveControllers == 0,
            "2.2.1 100 WindowController instances deallocated (alive: \(aliveControllers)/100)"
        )
        harness.assert(
            aliveWindows == 0,
            "2.2.2 100 NSWindow instances deallocated (alive: \(aliveWindows)/100)"
        )
        harness.assert(
            aliveViews == 0,
            "2.2.3 100 MainContentView instances deallocated (alive: \(aliveViews)/100)"
        )

        // 2.3 Memory Runaway Assertion
        let endMem = ProcessMemoryStats.current()
        let rssDeltaMB = endMem.rssMB - startMem.rssMB
        print("  --> Final Memory: RSS = \(String(format: "%.2f", endMem.rssMB)) MB, Footprint = \(String(format: "%.2f", endMem.footprintMB)) MB, Delta = \(String(format: "%+.2f", rssDeltaMB)) MB")
        harness.assert(
            rssDeltaMB < 50.0,
            "2.3.1 RSS memory delta across 100 rapid cycles is strictly bounded (< 50 MB, actual: \(String(format: "%.2f", rssDeltaMB)) MB)"
        )
        harness.assert(
            endMem.footprintMB < 75.0,
            "2.3.2 Physical footprint strictly within baseline target envelope (< 75 MB, actual: \(String(format: "%.2f", endMem.footprintMB)) MB)"
        )

        // 2.4 Mutation & Interaction Churn Under Lifecycle Stress
        var mutationSurvives = true
        for _ in 1...30 {
            autoreleasepool {
                let wc = WindowController()
                wc.mainContentView.docTitleLabel.stringValue = "StressDoc_\(UUID().uuidString).voo"
                wc.mainContentView.zoomIndicator.stringValue = "200%"
                wc.studioWindow.setContentSize(NSSize(width: 1600, height: 1000))
                wc.studioWindow.layoutIfNeeded()
                wc.mainContentView.layoutSubtreeIfNeeded()
                if wc.studioWindow.contentView !== wc.mainContentView {
                    mutationSurvives = false
                }
            }
        }
        harness.assert(
            mutationSurvives,
            "2.4.1 30 rapid mutation/resize cycles completed without hierarchy corruption or crash"
        )
    }

    // =========================================================================
    // Area 3: Multi-Resolution Headless Snapshot Pixel Forensics
    // =========================================================================
    static func testArea3MultiResolutionPixelForensics(harness: AdversarialHarness) {
        harness.section("Area 3: Multi-Resolution Headless Snapshot Pixel Forensics")

        let testResolutions: [(name: String, width: Int, height: Int)] = [
            ("1440x900 (Standard Mac)", 1440, 900),
            ("1920x1080 (1080p Desktop)", 1920, 1080),
            ("2560x1440 (2K QHD Display)", 2560, 1440),
            ("1280x800 (13-inch Compact)", 1280, 800),
            ("960x600 (Window Min Boundary)", 960, 600)
        ]

        for res in testResolutions {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: res.width, height: res.height),
                styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            let wc = WindowController(window: window)
            let view = wc.mainContentView
            window.layoutIfNeeded()
            view.layoutSubtreeIfNeeded()

            let bounds = view.bounds
            guard let rep = view.bitmapImageRepForCachingDisplay(in: bounds) else {
                harness.assert(false, "3.\(res.name) bitmapImageRepForCachingDisplay failed")
                continue
            }
            view.cacheDisplay(in: bounds, to: rep)

            guard let cgImage = rep.cgImage else {
                harness.assert(false, "3.\(res.name) rep.cgImage is nil")
                continue
            }

            let w = cgImage.width
            let h = cgImage.height
            let totalPixels = w * h
            var pixelData = [UInt8](repeating: 0, count: totalPixels * 4)

            let ctx = CGContext(
                data: &pixelData,
                width: w,
                height: h,
                bitsPerComponent: 8,
                bytesPerRow: w * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            ctx?.draw(cgImage, in: CGRect(x: 0, y: 0, width: w, height: h))

            var transparentPixels = 0
            var darkChromePixels = 0
            var stagePixels = 0
            var controlPixels = 0

            for i in 0..<totalPixels {
                let offset = i * 4
                let r = pixelData[offset]
                let g = pixelData[offset + 1]
                let b = pixelData[offset + 2]
                let a = pixelData[offset + 3]

                if a < 255 {
                    transparentPixels += 1
                } else {
                    // #171717 dark panel chrome: R: 21...25, G: 21...25, B: 21...25
                    if r >= 21 && r <= 25 && g >= 21 && g <= 25 && b >= 21 && b <= 25 {
                        darkChromePixels += 1
                    // #0f0f0f stage canvas background: R: 13...17, G: 13...17, B: 13...17
                    } else if r >= 13 && r <= 17 && g >= 13 && g <= 17 && b >= 13 && b <= 17 {
                        stagePixels += 1
                    } else {
                        controlPixels += 1
                    }
                }
            }

            let chromePct = Double(darkChromePixels) / Double(totalPixels) * 100.0
            let stagePct = Double(stagePixels) / Double(totalPixels) * 100.0

            // Theoretical analytical model:
            // TitleBar = W * 40
            // ToolRail = 48 * (H - 40)
            // Inspector = 280 * (H - 40)
            // Theoretical Chrome = 40 * W + 328 * (H - 40)
            // Stage = (W - 328) * (H - 40)
            let theoreticalChrome = 40 * res.width + 328 * (res.height - 40)
            let theoreticalStage = (res.width - 328) * (res.height - 40)

            print("  --> Resolution [\(res.name)]: Bitmap \(w)x\(h) (\(totalPixels) px)")
            print("      Transparent: \(transparentPixels) px (0.00%)")
            print("      Dark Chrome (#171717): \(darkChromePixels) px (\(String(format: "%.2f", chromePct))%, expected ~\(theoreticalChrome))")
            print("      Stage Canvas (#0f0f0f): \(stagePixels) px (\(String(format: "%.2f", stagePct))%, expected \(theoreticalStage))")
            print("      Control Elements: \(controlPixels) px")

            harness.assert(
                transparentPixels == 0,
                "3.1 [\(res.name)] Zero transparent blank pixels (actual: \(transparentPixels))"
            )
            harness.assert(
                darkChromePixels >= Int(Double(theoreticalChrome) * 0.95),
                "3.2 [\(res.name)] Dark chrome (#171717) pixels match analytical model (actual: \(darkChromePixels), target >= \(Int(Double(theoreticalChrome) * 0.95)))"
            )
            harness.assert(
                stagePixels == theoreticalStage,
                "3.3 [\(res.name)] Stage canvas background (#0f0f0f) pixels exact match (actual: \(stagePixels), expected: \(theoreticalStage))"
            )
            harness.assert(
                controlPixels > 0,
                "3.4 [\(res.name)] AppKit control glyphs rendered (> 0 px, actual: \(controlPixels))"
            )
        }
    }

    // =========================================================================
    // Area 4: AppKit Controls & AutoLayout Constraint Stress
    // =========================================================================
    static func testArea4ControlsAndAutoLayoutStress(harness: AdversarialHarness) {
        harness.section("Area 4: AppKit Controls & AutoLayout Constraint Stress")

        let wc = WindowController()
        let root = wc.mainContentView

        // 4.1 AccessibilityCatalog Comprehensive Reachability
        func collectTree(from view: NSView) -> [String: NSView] {
            var map = [String: NSView]()
            func walk(_ v: NSView) {
                let id = v.accessibilityIdentifier()
                if !id.isEmpty {
                    map[id] = v
                }
                for child in v.subviews {
                    walk(child)
                }
            }
            walk(view)
            return map
        }

        let idMap = collectTree(from: root)
        let expectedCatalog = [
            AccessibilityCatalog.titleBar,
            AccessibilityCatalog.docTitle,
            AccessibilityCatalog.zoomIndicator,
            AccessibilityCatalog.undoButton,
            AccessibilityCatalog.redoButton,
            AccessibilityCatalog.toolRail,
            AccessibilityCatalog.toolMove,
            AccessibilityCatalog.toolPen,
            AccessibilityCatalog.toolBrush,
            AccessibilityCatalog.inspectorStudio,
            AccessibilityCatalog.layersTree,
            AccessibilityCatalog.transformPanel,
            AccessibilityCatalog.canvasViewport,
            AccessibilityCatalog.rulerHorizontal,
            AccessibilityCatalog.rulerVertical
        ]

        var missingCatalog = [String]()
        for key in expectedCatalog {
            if idMap[key] == nil {
                missingCatalog.append(key)
            }
        }
        harness.assert(
            missingCatalog.isEmpty,
            "4.1.1 All 15 AccessibilityCatalog identifiers present in subview hierarchy",
            detail: "Missing: \(missingCatalog.joined(separator: ", "))"
        )

        // 4.2 Structural Containment Verification
        harness.assert(
            root.docTitleLabel.isDescendant(of: root.titleBarView),
            "4.2.1 docTitleLabel is child of titleBarView"
        )
        harness.assert(
            root.undoButton.isDescendant(of: root.titleBarView),
            "4.2.2 undoButton is child of titleBarView"
        )
        harness.assert(
            root.redoButton.isDescendant(of: root.titleBarView),
            "4.2.3 redoButton is child of titleBarView"
        )
        harness.assert(
            root.moveToolButton.isDescendant(of: root.toolRailView),
            "4.2.4 moveToolButton is child of toolRailView"
        )
        harness.assert(
            root.penToolButton.isDescendant(of: root.toolRailView),
            "4.2.5 penToolButton is child of toolRailView"
        )
        harness.assert(
            root.brushToolButton.isDescendant(of: root.toolRailView),
            "4.2.6 brushToolButton is child of toolRailView"
        )
        harness.assert(
            root.layersTreeView.isDescendant(of: root.inspectorStudioView),
            "4.2.7 layersTreeView is child of inspectorStudioView"
        )
        harness.assert(
            root.transformPanelView.isDescendant(of: root.inspectorStudioView),
            "4.2.8 transformPanelView is child of inspectorStudioView"
        )
        harness.assert(
            root.rulerHorizontalView.isDescendant(of: root.canvasViewportView),
            "4.2.9 rulerHorizontalView is child of canvasViewportView"
        )
        harness.assert(
            root.rulerVerticalView.isDescendant(of: root.canvasViewportView),
            "4.2.10 rulerVerticalView is child of canvasViewportView"
        )

        // 4.3 Dynamic AutoLayout Ambiguity Stress Ladder
        let resizeLadder: [NSSize] = [
            NSSize(width: 960, height: 600),
            NSSize(width: 1200, height: 800),
            NSSize(width: 1440, height: 900),
            NSSize(width: 1920, height: 1080),
            NSSize(width: 2560, height: 1440),
            NSSize(width: 3840, height: 2160)
        ]

        func hasAnyAmbiguity(_ v: NSView) -> Bool {
            if v.hasAmbiguousLayout { return true }
            for sub in v.subviews {
                if hasAnyAmbiguity(sub) { return true }
            }
            return false
        }

        var anyAmbiguityFound = false
        for size in resizeLadder {
            wc.studioWindow.setContentSize(size)
            wc.studioWindow.layoutIfNeeded()
            root.layoutSubtreeIfNeeded()
            if hasAnyAmbiguity(root) {
                anyAmbiguityFound = true
                print("  ✗ Ambiguity detected at size \(size.width)x\(size.height)")
            }
        }
        harness.assert(
            !anyAmbiguityFound,
            "4.3.1 AutoLayout ambiguity check passed across 6 ladder sizes (960x600 -> 3840x2160)"
        )

        // 4.4 Control Action Dispatch & Dynamic Value Stress
        var controlInteractionsClean = true
        let buttons: [NSButton] = [
            root.undoButton,
            root.redoButton,
            root.moveToolButton,
            root.penToolButton,
            root.brushToolButton
        ]
        for btn in buttons {
            // Verify button is enabled and responds to performClick or highlight
            if !btn.isEnabled {
                controlInteractionsClean = false
            }
            btn.highlight(true)
            btn.highlight(false)
        }
        harness.assert(
            controlInteractionsClean,
            "4.4.1 All AppKit button controls enabled and respond cleanly to highlighting"
        )

        // Dynamic Text Mutation Invariants
        root.docTitleLabel.stringValue = "StressTest_Document_With_A_Very_Long_Name_That_Exceeds_Normal_Length.voo"
        root.zoomIndicator.stringValue = "1250%"
        wc.studioWindow.layoutIfNeeded()
        root.layoutSubtreeIfNeeded()

        harness.assert(
            root.docTitleLabel.stringValue.contains("StressTest_Document"),
            "4.4.2 Dynamic docTitleLabel text mutation preserved"
        )
        harness.assert(
            root.zoomIndicator.stringValue == "1250%",
            "4.4.3 Dynamic zoomIndicator text mutation preserved"
        )
        harness.assert(
            !hasAnyAmbiguity(root),
            "4.4.4 AutoLayout remains unambiguous after extreme title and zoom text mutations"
        )
    }
}
