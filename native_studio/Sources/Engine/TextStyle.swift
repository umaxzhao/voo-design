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

    public static func nsWeight(for token: String?) -> NSFont.Weight {
        switch (token ?? "regular").lowercased() {
        case "thin": return .thin
        case "light": return .light
        case "medium": return .medium
        case "semibold", "semi-bold": return .semibold
        case "bold": return .bold
        case "heavy", "black": return .heavy
        default: return .regular
        }
    }

    public static func font(for node: VOONode, size: CGFloat) -> NSFont {
        let resolvedSize = max(size, 1.0)
        let family = node.fontFamily ?? "Helvetica Neue"
        let base = NSFont(name: family, size: resolvedSize)
            ?? NSFont.systemFont(ofSize: resolvedSize, weight: .regular)
        let weight = nsWeight(for: node.fontWeight)
        guard weight != .regular else { return base }
        let traits: [NSFontDescriptor.TraitKey: Any] = [.weight: weight.rawValue]
        let weighted = base.fontDescriptor.addingAttributes([.traits: traits])
        return NSFont(descriptor: weighted, size: resolvedSize) ?? base
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
