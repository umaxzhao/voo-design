//
//  Theme.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

// MARK: - VOO Dark Theme Design Tokens

public struct ThemeTokens {
    // MARK: - 6-Tier Surface Lightness Ladder (VOO Dark)
    public static let surfacePage = "#000000"     // html/body, window background
    public static let surfaceStage = "#525252"    // Canvas stage work area background (neutral-600)
    public static let surfacePanel = "#171717"    // Studio Inspector & floating overlay panels, TitleBar chrome
    public static let surfaceRaised = "#262626"   // Control resting surface, input fields, cards
    public static let surfaceHover = "#404040"    // Hover wash over raised controls
    public static let surfaceCard = "#262626"     // Layer rows & card containers

    // MARK: - Signature Accents
    public static let accentMint = "#a7ffd4"      // Primary VOO Mint: system flow, wire connections
    public static let accentSelection = "#b2ffd6" // Selection box stroke, magnetic snap guidelines
    public static let accentPurple = "#E5B2FF"    // AI generation, inpainting, mask highlight
    public static let accentPurpleText = "#eed0ff"// Text on purple wash
    public static let accentYellow = "#ffe066"    // Asset library highlights

    // MARK: - Corner Radii
    public static let radiusMd: CGFloat = 6.0     // Swatches, thumbnails, tags, small buttons
    public static let radiusLg: CGFloat = 8.0     // Buttons, menu items, small controls
    public static let radiusXl: CGFloat = 12.0    // Inputs, list rows, cards
    public static let radius2Xl: CGFloat = 16.0   // Floating studio panels, popovers
    public static let radius3Xl: CGFloat = 24.0   // Drawers, dialog shells
    public static let radiusFull: CGFloat = 9999.0// Capsule pill buttons, handle dots

    // MARK: - Dimensions & Offsets
    public static let titleBarHeight: CGFloat = 40.0
    public static let macTrafficLightInset: CGFloat = 96.0
    public static let rulerTrackThickness: CGFloat = 18.0
    public static let handleSize: CGFloat = 8.0
    public static let handleHitSlop: CGFloat = 4.0
    public static let rotateStalkOffset: CGFloat = 20.0
    public static let snapThresholdPx: CGFloat = 6.0

    // MARK: - NSColor Instances (Deterministic sRGB, Zero OS Theme Drift)
    public static let colorPanel = NSColor(red: 0.09, green: 0.09, blue: 0.09, alpha: 1.0) // #171717 (23/255)
    public static let colorStage = NSColor(red: 0.06, green: 0.06, blue: 0.06, alpha: 1.0) // #0f0f0f (15/255)
    public static let colorStageStudio = NSColor(red: 0.28, green: 0.28, blue: 0.30, alpha: 1.0) // Sleek neutral studio gray
    public static let colorArtboard = NSColor(red: 0.13, green: 0.13, blue: 0.14, alpha: 1.0) // #202022
    public static let colorFloatingCard = NSColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 0.96) // #121214 with blur
    public static let colorBottomTools = NSColor(red: 0.89, green: 0.89, blue: 0.89, alpha: 1.0) // #e3e3e3 silver pill
    public static let colorMintDark = NSColor(red: 0.12, green: 0.22, blue: 0.18, alpha: 1.0) // #1e382d highlight
    public static let colorMint = NSColor(red: 0.70, green: 1.00, blue: 0.84, alpha: 1.0)  // #b2ffd6
    public static let colorPage = NSColor(hex: surfacePage)
    public static let colorRaised = NSColor(hex: surfaceRaised)
    public static let colorHover = NSColor(hex: surfaceHover)
    public static let borderDefault = NSColor(white: 1.0, alpha: 0.06)
    public static let borderStrong = NSColor(white: 1.0, alpha: 0.14)
    public static let textPrimary = NSColor(white: 1.0, alpha: 1.0)
    public static let textSecondary = NSColor(white: 0.70, alpha: 1.0)
    public static let textMuted = NSColor(white: 0.45, alpha: 1.0)
}

// MARK: - Typography & Focus Helpers

public struct ThemeFonts {
    public static func mono(size: CGFloat, weight: NSFont.Weight = .regular) -> NSFont {
        return NSFont.monospacedSystemFont(ofSize: size, weight: weight)
    }

    public static func monoDigit(size: CGFloat, weight: NSFont.Weight = .regular) -> NSFont {
        return NSFont.monospacedDigitSystemFont(ofSize: size, weight: weight)
    }

    public static func system(size: CGFloat, weight: NSFont.Weight = .regular) -> NSFont {
        return NSFont.systemFont(ofSize: size, weight: weight)
    }
}

// MARK: - NSColor Hex Extension

extension NSColor {
    /// Initializes an NSColor in the sRGB color space from a hex string.
    /// Supports: "#RGB", "RGB", "#RGBA", "RGBA", "#RRGGBB", "RRGGBB", "#RRGGBBAA", "RRGGBBAA".
    public convenience init(hex: String, defaultColor: NSColor = .black) {
        var cleanHex = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanHex.hasPrefix("#") {
            cleanHex.removeFirst()
        }

        var rgbValue: UInt64 = 0
        guard Scanner(string: cleanHex).scanHexInt64(&rgbValue) else {
            self.init(cgColor: defaultColor.cgColor)!
            return
        }

        let length = cleanHex.count
        let r, g, b, a: CGFloat

        switch length {
        case 3: // RGB (12-bit)
            r = CGFloat((rgbValue & 0xF00) >> 8) / 15.0
            g = CGFloat((rgbValue & 0x0F0) >> 4) / 15.0
            b = CGFloat(rgbValue & 0x00F) / 15.0
            a = 1.0
        case 4: // RGBA (16-bit)
            r = CGFloat((rgbValue & 0xF000) >> 12) / 15.0
            g = CGFloat((rgbValue & 0x0F00) >> 8) / 15.0
            b = CGFloat((rgbValue & 0x00F0) >> 4) / 15.0
            a = CGFloat(rgbValue & 0x000F) / 15.0
        case 6: // RRGGBB (24-bit)
            r = CGFloat((rgbValue & 0xFF0000) >> 16) / 255.0
            g = CGFloat((rgbValue & 0x00FF00) >> 8) / 255.0
            b = CGFloat(rgbValue & 0x0000FF) / 255.0
            a = 1.0
        case 8: // RRGGBBAA (32-bit)
            r = CGFloat((rgbValue & 0xFF000000) >> 24) / 255.0
            g = CGFloat((rgbValue & 0x00FF0000) >> 16) / 255.0
            b = CGFloat((rgbValue & 0x0000FF00) >> 8) / 255.0
            a = CGFloat(rgbValue & 0x000000FF) / 255.0
        default:
            self.init(cgColor: defaultColor.cgColor)!
            return
        }

        self.init(srgbRed: r, green: g, blue: b, alpha: a)
    }

    /// Convenience failable initializer for hex strings
    public convenience init?(hexString hex: String) {
        var clean = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if clean.hasPrefix("#") { clean.removeFirst() }
        guard clean.count == 6 || clean.count == 8, let val = UInt64(clean, radix: 16) else { return nil }

        if clean.count == 6 {
            let r = CGFloat((val >> 16) & 0xFF) / 255.0
            let g = CGFloat((val >> 8) & 0xFF) / 255.0
            let b = CGFloat(val & 0xFF) / 255.0
            self.init(srgbRed: r, green: g, blue: b, alpha: 1.0)
        } else {
            let r = CGFloat((val >> 24) & 0xFF) / 255.0
            let g = CGFloat((val >> 16) & 0xFF) / 255.0
            let b = CGFloat((val >> 8) & 0xFF) / 255.0
            let a = CGFloat(val & 0xFF) / 255.0
            self.init(srgbRed: r, green: g, blue: b, alpha: a)
        }
    }

    /// Serializes NSColor to uppercase hex string (e.g. "#171717" or "#171717FF" if alpha < 1.0).
    public var hexString: String {
        guard let rgbColor = usingColorSpace(.sRGB) else {
            return "#000000"
        }
        let r = Int(round(rgbColor.redComponent * 255.0))
        let g = Int(round(rgbColor.greenComponent * 255.0))
        let b = Int(round(rgbColor.blueComponent * 255.0))
        let a = Int(round(rgbColor.alphaComponent * 255.0))

        if a < 255 {
            return String(format: "#%02X%02X%02X%02X", r, g, b, a)
        } else {
            return String(format: "#%02X%02X%02X", r, g, b)
        }
    }
}
