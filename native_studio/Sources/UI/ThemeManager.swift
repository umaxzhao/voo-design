//
//  ThemeManager.swift
//  native_studio
//
//  Light and dark chrome theme coordinator (web parity with `use_editor_theme.js`
//  and `theme-light.css`).
//
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

public final class ThemeManager: @unchecked Sendable {
    public static let shared = ThemeManager()

    public enum Mode: String, Sendable, CaseIterable {
        case dark
        case light
    }

    public var currentMode: Mode {
        get {
            let val = UserDefaults.standard.string(forKey: SettingsDrawerView.editorThemeDefaultsKey)
            return val == "light" ? .light : .dark
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: SettingsDrawerView.editorThemeDefaultsKey)
            onThemeChanged?(newValue)
        }
    }

    public var isLight: Bool {
        currentMode == .light
    }

    public var onThemeChanged: ((Mode) -> Void)?

    public init() {}
}
