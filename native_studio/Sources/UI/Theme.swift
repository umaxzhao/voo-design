//
//  Theme.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreText
import Foundation

// MARK: - VOO Dark Theme Design Tokens

public struct ThemeTokens {
    // MARK: - 6-Tier Surface Lightness Ladder (VOO Dark)
    public static let surfacePage = "#000000"     // html/body, window background
    /// Design-system "surface-canvas" token (web `WORKSPACE_BACKGROUND`). The
    /// editor stage renders this exact value (`colorStageStudio` below); this
    /// token stays as the documented ladder rung the test suite pins.
    public static let surfaceStage = "#525252"
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

    // MARK: - Stage Dot Grid (web `radial-gradient(rgba(255,255,255,0.14) 1.2px, transparent 1.2px)`)
    /// Tile pitch in DOCUMENT-independent screen px at 100% zoom (web multiplies
    /// it by the camera zoom: `backgroundSize: 20 * zoom`).
    public static let dotGridSpacing: CGFloat = 20.0
    /// Dot radius in SCREEN px (not scaled by zoom).
    public static let dotGridRadius: CGFloat = 1.2
    /// Dot fill alpha: web `rgba(255,255,255,0.14)`.
    public static let dotGridAlpha: CGFloat = 0.14

    // MARK: - NSColor Instances (Deterministic sRGB, Zero OS Theme Drift)
    public static let colorPanel = NSColor(red: 0.09, green: 0.09, blue: 0.09, alpha: 1.0) // #171717 (23/255)
    public static let colorStage = NSColor(red: 0.06, green: 0.06, blue: 0.06, alpha: 1.0) // #0f0f0f (15/255)
    /// Editor workspace ground around the artboards. Pixel-sampled from the
    /// current web build (2026-10-31): `rgb(82,82,82)` = `#525252`.
    public static let colorStageStudio = NSColor(hex: "#525252")
    /// Default canvas/artboard surface when a document carries no explicit
    /// background: web document background `#171717`.
    public static let colorArtboard = NSColor(hex: "#171717")
    /// Focused/selected frame outline: web `ring-1 ring-[#b2ffd6]/60`. The ref's
    /// 1px ring samples `rgb(122,171,144)` over `#525252` (mint at ~55-60%), so
    /// this is mint #b2ffd6 at 60% alpha rather than a solid stroke.
    public static let colorFrameSelection = NSColor(hex: "#b2ffd6").withAlphaComponent(0.60)
    /// Unselected frame outline: `ring-1 ring-white/10`.
    public static let colorFrameIdleBorder = NSColor(white: 1.0, alpha: 0.10)
    /// Canvas type / frame label colour for a selected (or focused) frame:
    /// web `text-[#a7ffd4]`.
    public static let colorFrameLabelSelected = NSColor(hex: "#a7ffd4")
    /// Frame label colour for an unselected frame: web `text-neutral-400`.
    public static let colorFrameLabelIdle = NSColor(hex: "#a3a3a3")
    /// Ruler strip ground. The current web rulers overlay the stage with the
    /// same `#525252` ground (only the separators/ticks distinguish them).
    public static let colorRulerBackground = NSColor(hex: "#525252")
    /// Ruler tick labels: web `text-[9px] ... text-neutral-400`.
    public static let colorRulerLabel = NSColor(hex: "#a3a3a3")
    /// Ruler ticks: web `bg-white/25` for major and minor ticks.
    public static let colorRulerTick = NSColor(white: 1.0, alpha: 0.25)
    public static let colorRulerSeparator = NSColor(white: 1.0, alpha: 0.10)
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

/// The bundled UI typeface. The web editor renders all chrome in **Intel One Mono**
/// (`src/index.css` `--font-mono`), so the native shell bundles the same three OFL
/// weights (`Resources/Fonts`) and resolves them by weight instead of falling back
/// to SF Mono, which has different advance widths (±0.3pt at 11–12pt).
public enum VooMonoTypeface {
    /// PostScript names shipped in `Resources/Fonts` (see `Info.plist`
    /// `ATSApplicationFontsPath`, plus the programmatic fallback below).
    public enum Weight: String, CaseIterable {
        case regular = "IntelOneMono-Regular"
        case medium = "IntelOneMono-Medium"
        case bold = "IntelOneMono-Bold"
    }

    /// True once at least the regular face resolved; the theme falls back to the
    /// system monospaced design when a build ships without the font resources.
    public private(set) static var isAvailable: Bool = false

    private static var didRegister = false

    /// Registers every `.ttf` in `Resources/Fonts` for this process: the three
    /// Intel One Mono weights (chrome) plus the OFL text faces the web build also
    /// ships — Inter, Archivo Black, Bitter, Caveat, Playfair Display and ZCOOL
    /// KuaiLe — so `TextStyleResolver` can resolve web-authored CSS stacks without
    /// a fallback. Called once at launch; also covers the un-bundled (test /
    /// `swiftc` binary) case by looking next to the executable and in the source
    /// resource folder.
    public static func registerBundledFonts() {
        guard !didRegister else { return }
        didRegister = true

        let urls = candidateFontURLs()
        for url in urls {
            var error: Unmanaged<CFError>?
            _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
        }
        isAvailable = NSFont(name: Weight.regular.rawValue, size: 12) != nil
        NSLog(
            "[VOO Design Native] bundled fonts: Intel One Mono %@; %d face file(s) found",
            isAvailable ? "ready" : "missing — falling back to SF Mono",
            urls.count
        )
    }

    private static func candidateFontURLs() -> [URL] {
        var urls: [URL] = []
        let fileManager = FileManager.default
        var directories: [URL] = []
        // Test/source-tree override so the harness exercises the real faces.
        if let override = ProcessInfo.processInfo.environment["VOO_FONT_DIR"], !override.isEmpty {
            directories.append(URL(fileURLWithPath: override, isDirectory: true))
        }
        if let resources = Bundle.main.resourceURL {
            directories.append(resources.appendingPathComponent("Fonts", isDirectory: true))
        }
        // Un-bundled binaries (test harness / swiftc output) still sit in the repo.
        let executableDir = URL(fileURLWithPath: CommandLine.arguments.first ?? "")
            .deletingLastPathComponent()
        directories.append(executableDir.appendingPathComponent("Fonts", isDirectory: true))
        directories.append(executableDir.appendingPathComponent("Resources/Fonts", isDirectory: true))

        for directory in directories {
            guard let entries = try? fileManager.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: nil
            ) else { continue }
            urls.append(contentsOf: entries.filter { $0.pathExtension.lowercased() == "ttf" })
        }
        return urls
    }

    /// Resolves the bundled face closest to `weight` (CSS-like matching: the web
    /// build only ships 400/500/700, so ≥600 uses the bold face).
    public static func font(size: CGFloat, weight: NSFont.Weight) -> NSFont? {
        if !didRegister { registerBundledFonts() }
        let face: Weight
        if weight >= .semibold {
            face = .bold
        } else if weight >= .medium {
            face = .medium
        } else {
            face = .regular
        }
        if let font = NSFont(name: face.rawValue, size: size) {
            return font
        }
        return NSFont(name: Weight.regular.rawValue, size: size)
    }
}

public struct ThemeFonts {
    /// Chrome / body mono face (`font-mono` in the web build): Intel One Mono when
    /// bundled, otherwise the system monospaced font with the same metrics request.
    public static func mono(size: CGFloat, weight: NSFont.Weight = .regular) -> NSFont {
        if let bundled = VooMonoTypeface.font(size: size, weight: weight) {
            return bundled
        }
        return NSFont.monospacedSystemFont(ofSize: size, weight: weight)
    }

    /// Tabular figures. Intel One Mono is fixed-advance, so the same face is used.
    public static func monoDigit(size: CGFloat, weight: NSFont.Weight = .regular) -> NSFont {
        if let bundled = VooMonoTypeface.font(size: size, weight: weight) {
            return bundled
        }
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
