//
//  TextStyle.swift
//  native_studio
//
//  Shared typography resolution for text layers. Used by the canvas renderer,
//  the export engine and the inline text editor so all three stay identical.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

public enum TextStyleResolver {

    // MARK: Fonts

    /// Regular-instance PostScript names for the bundled OFL text faces whose CSS
    /// family token is not itself a PostScript name (measured from the TTFs in
    /// `Resources/Fonts`). CoreText reports these families correctly on macOS 14,
    /// so this table is the last-resort fallback: it keeps a document's CSS stack
    /// (`"'Bitter', 'Rockwell', serif"`, `"'ZCOOL KuaiLe', 'PingFang SC', …"`)
    /// resolving to the bundled face even where only the PostScript name is
    /// exposed, instead of silently dropping to the system fallback.
    private static let bundledFaceAliases: [String: String] = [
        "archivo black": "ArchivoBlack-Regular",
        "bitter": "Bitter-Regular",
        "caveat": "Caveat-Regular",
        "playfair display": "PlayfairDisplay-Regular",
        "zcool kuaile": "ZCOOLKuaiLe-Regular",
    ]

    public static func nsWeight(for token: String?) -> NSFont.Weight {
        switch (token ?? "regular").lowercased() {
        case "100", "ultralight": return .ultraLight
        case "200", "thin": return .thin
        case "300", "light": return .light
        case "500", "medium": return .medium
        case "600", "semibold", "semi-bold": return .semibold
        case "700", "bold": return .bold
        case "800", "heavy": return .heavy
        case "900", "black": return .black
        default: return .regular
        }
    }

    public static func font(for node: VOONode, size: CGFloat) -> NSFont {
        let resolvedSize = max(size, 1.0)
        let familyToken = node.fontFamily ?? "Inter"
        let base = resolveFamily(familyToken, size: resolvedSize)
            ?? NSFont.systemFont(ofSize: resolvedSize, weight: .regular)
        let weight = nsWeight(for: node.fontWeight)
        guard weight != .regular else { return base }

        // The bundled text faces are variable fonts. Carrying the weight trait on
        // a *named-instance* descriptor keeps that instance (e.g. always Bitter
        // Regular); going through a family descriptor lets CoreText pick the
        // matching instance (Bitter-Bold, PlayfairDisplayRoman-Bold,
        // Inter-Regular_Bold, …) — the face the web build's `font-weight` renders.
        let traits: [NSFontDescriptor.TraitKey: Any] = [.weight: weight.rawValue]
        let familyDescriptor = NSFontDescriptor(fontAttributes: [
            .family: base.familyName ?? base.fontName,
            .traits: traits,
        ])
        if let matched = NSFont(descriptor: familyDescriptor, size: resolvedSize) {
            return matched
        }
        let weighted = base.fontDescriptor.addingAttributes([.traits: traits])
        return NSFont(descriptor: weighted, size: resolvedSize) ?? base
    }

    /// Resolves a document `fontFamily` value. Web nodes store a CSS stack such as
    /// `"'Inter', system-ui, sans-serif"`, so the first concrete family that the
    /// system (or the bundled OFL faces in `Resources/Fonts`) can provide wins.
    public static func resolveFamily(_ token: String, size: CGFloat) -> NSFont? {
        // Ensure the bundled faces (Intel One Mono, Inter + the OFL text faces)
        // are registered.
        VooMonoTypeface.registerBundledFonts()

        let candidates = token
            .split(separator: ",")
            .map { raw -> String in
                raw.trimmingCharacters(in: CharacterSet(charactersIn: " '\"\t\n"))
            }
            .filter { candidate in
                !candidate.isEmpty && ![
                    "system-ui", "ui-sans-serif", "ui-monospace", "ui-serif",
                    "sans-serif", "serif", "monospace", "cursive", "fantasy",
                    "-apple-system", "inherit", "initial"
                ].contains(candidate.lowercased())
            }

        for family in candidates {
            if let direct = NSFont(name: family, size: size) {
                return direct
            }
            if let member = NSFontManager.shared.availableMembers(ofFontFamily: family)?.first,
               let name = member.first as? String,
               let font = NSFont(name: name, size: size) {
                return font
            }
            if let postScript = bundledFaceAliases[family.lowercased()],
               let font = NSFont(name: postScript, size: size) {
                return font
            }
        }
        return nil
    }

    public static func alignment(for token: String?) -> NSTextAlignment {
        switch (token ?? "left").lowercased() {
        case "center": return .center
        case "right": return .right
        case "justify": return .justified
        default: return .left
        }
    }

    public static func paragraphStyle(for node: VOONode) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.alignment = alignment(for: node.textAlign)
        style.lineHeightMultiple = max(CGFloat(node.lineHeight ?? 1.2), 0.8)
        style.lineBreakMode = .byWordWrapping
        return style
    }

    // MARK: Attributes

    public static func attributes(for node: VOONode, color: NSColor, size: CGFloat) -> [NSAttributedString.Key: Any] {
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font(for: node, size: size),
            .foregroundColor: color,
            .paragraphStyle: paragraphStyle(for: node)
        ]
        if let spacing = node.letterSpacing, spacing != 0 {
            attributes[.kern] = spacing
        }
        return attributes
    }

    /// Convenience for NSTextView-based editors.
    public static func apply(to textView: NSTextView, node: VOONode, color: NSColor, size: CGFloat) {
        let font = font(for: node, size: size)
        let paragraph = paragraphStyle(for: node)
        textView.font = font
        textView.textColor = color
        textView.alignment = paragraph.alignment
        textView.defaultParagraphStyle = paragraph
        var typing = textView.typingAttributes
        typing[.font] = font
        typing[.foregroundColor] = color
        typing[.paragraphStyle] = paragraph
        if let spacing = node.letterSpacing, spacing != 0 {
            typing[.kern] = spacing
        }
        textView.typingAttributes = typing
    }
}
