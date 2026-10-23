//
//  Main.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M1.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

@main
public final class AppDelegate: NSObject, NSApplicationDelegate {
    public static var shared: AppDelegate?
    public var windowController: WindowController?
    private let launchTimestamp = ProcessInfo.processInfo.systemUptime

    public static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        shared = delegate
        app.delegate = delegate

        // Headless execution support for automated testing and CI runners
        if ProcessInfo.processInfo.environment["VOO_HEADLESS"] == "1" {
            app.setActivationPolicy(.accessory)
        } else {
            app.setActivationPolicy(.regular)
        }

        app.run()
    }

    public func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()

        let controller = WindowController()
        self.windowController = controller

        if ProcessInfo.processInfo.environment["VOO_EMPTY_DOCUMENT"] != "1" {
            controller.loadDemoProject()
        }

        // By default, open the Welcome Dashboard (工作台) first, matching VOO Design!
        if ProcessInfo.processInfo.environment["VOO_SHOW_EDITOR"] == "1" {
            controller.mainContentView.isWelcomeOpen = false
        } else {
            controller.mainContentView.isWelcomeOpen = true
        }

        NSLog("[VOO Design Native] controller.window = %@", String(describing: controller.window))
        controller.showWindow(nil)
        if let window = controller.window {
            window.makeKeyAndOrderFront(nil)
            window.layoutIfNeeded()
        }

        if ProcessInfo.processInfo.environment["VOO_HEADLESS"] != "1" {
            NSApp.activate(ignoringOtherApps: true)
        }

        // First-launch guide: mirrors the web app's onboarding modal (skippable,
        // persisted in UserDefaults, bypassed by VOO_SKIP_ONBOARDING=1).
        if OnboardingGuideView.shouldPresentOnLaunch() {
            let step = Int(ProcessInfo.processInfo.environment["VOO_ONBOARDING_STEP"] ?? "") ?? 0
            controller.mainContentView.showOnboarding(step: step)
        }

        // Automated snapshot hook: open the AI agent panel on launch.
        if ProcessInfo.processInfo.environment["VOO_OPEN_AGENT"] == "1" {
            controller.setAgentPanelOpen(true)
        }

        // Automated snapshot hook: create a fresh "Design 1" project (web New).
        if ProcessInfo.processInfo.environment["VOO_NEW_PROJECT"] == "1" {
            controller.newDocument(nil)
            controller.mainContentView.isWelcomeOpen = false
            controller.syncChromeState()
        }

        // Automated snapshot hook: show the design grid overlay.
        if ProcessInfo.processInfo.environment["VOO_GRID"] == "1" {
            controller.mainContentView.canvasStageView.showGrid = true
            controller.mainContentView.bottomZoomBar.setGridEnabled(true)
        }

        // Automated snapshot hook: open the settings & preferences modal.
        if ProcessInfo.processInfo.environment["VOO_OPEN_SETTINGS"] == "1" {
            let tab = ProcessInfo.processInfo.environment["VOO_SETTINGS_TAB"] ?? "general"
            controller.mainContentView.showSettings(tab: tab)
        }

        // Automated snapshot hook: add a demo shape + text for rendering QA.
        if ProcessInfo.processInfo.environment["VOO_SNAPSHOT_CONTENT"] == "1" {
            controller.mainContentView.isWelcomeOpen = false
            controller.addSnapshotContent()
        }

        let readyTime = ProcessInfo.processInfo.systemUptime - launchTimestamp
        NSLog("[VOO Design Native] Cold launch window ready in %.4f seconds", readyTime)

        // Automated snapshot hook for regression test runs
        if let snapshotPath = ProcessInfo.processInfo.environment["VOO_SNAPSHOT_PATH"] {
            let ms = Double(ProcessInfo.processInfo.environment["VOO_SNAPSHOT_DELAY_MS"] ?? "100") ?? 100.0
            let delaySec = ms / 1000.0
            DispatchQueue.main.asyncAfter(deadline: .now() + delaySec) { [weak self] in
                self?.captureWindowSnapshot(to: snapshotPath)
                if ProcessInfo.processInfo.environment["VOO_AUTO_TERMINATE"] == "1" {
                    NSApp.terminate(nil)
                }
            }
        }

        // Automated auto-termination hook for launch latency and memory benchmarks
        if let termMsStr = ProcessInfo.processInfo.environment["VOO_AUTO_TERMINATE_MS"],
           let termMs = Double(termMsStr) {
            DispatchQueue.main.asyncAfter(deadline: .now() + (termMs / 1000.0)) {
                NSApp.terminate(nil)
            }
        } else if ProcessInfo.processInfo.environment["VOO_AUTO_TERMINATE"] == "1" &&
                  ProcessInfo.processInfo.environment["VOO_SNAPSHOT_PATH"] == nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                NSApp.terminate(nil)
            }
        }
    }

    public func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    // MARK: - MenuBar Configuration

    public func setupMainMenu() {
        NSApp.mainMenu = MenuController.shared.buildMainMenu()
    }

    @objc private func showAbout() {
        let alert = NSAlert()
        alert.messageText = "VOO Design Native"
        alert.informativeText = "High-Performance macOS Vector Studio\nSwift 6 + AppKit + Metal\nVersion 1.0.0 (arm64)"
        alert.alertStyle = .informational
        alert.runModal()
    }

    private func captureWindowSnapshot(to path: String) {
        guard let window = windowController?.window,
              let view = window.contentView else {
            NSLog("[VOO Design Native] captureWindowSnapshot: window or view is nil")
            return
        }
        window.layoutIfNeeded()
        view.layoutSubtreeIfNeeded()
        let bounds = view.bounds
        NSLog("[VOO Design Native] captureWindowSnapshot: view bounds = %@", NSStringFromRect(bounds))
        guard bounds.width > 0 && bounds.height > 0 else {
            NSLog("[VOO Design Native] captureWindowSnapshot: bounds width or height is 0")
            return
        }
        guard let rep = view.bitmapImageRepForCachingDisplay(in: bounds) else {
            NSLog("[VOO Design Native] captureWindowSnapshot: rep is nil")
            return
        }
        view.cacheDisplay(in: bounds, to: rep)
        if let data = rep.representation(using: .png, properties: [:]) {
            do {
                try data.write(to: URL(fileURLWithPath: path))
                NSLog("[VOO Design Native] Snapshot saved to %@ (%ld bytes)", path, data.count)
            } catch {
                NSLog("[VOO Design Native] Snapshot write error: %@", error.localizedDescription)
            }
        } else {
            NSLog("[VOO Design Native] captureWindowSnapshot: PNG data is nil")
        }
    }
}
