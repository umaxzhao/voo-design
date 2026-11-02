import Foundation

/// Mirrors the web inspector's CSS and Tailwind readouts for the selected layer.
enum NativeInspectCode {
    static func snippet(for node: VOONode) -> String {
        var css = [
            "position: absolute;", "left: \(px(node.x));", "top: \(px(node.y));",
            "width: \(px(node.width));", "height: \(px(node.height));",
        ]
        var classes = [
            "absolute", "left-[\(px(node.x))]", "top-[\(px(node.y))]",
            "w-[\(px(node.width))]", "h-[\(px(node.height))]",
        ]
        if node.rotation != 0 { css.append("transform: rotate(\(number(node.rotation))deg);") }
        if node.fill != "transparent" && node.fill != "none" {
            css.append("background: \(node.fill);")
            classes += colourClasses(prefix: "bg", value: node.fill)
        }
        if node.stroke != "transparent" && node.stroke != "none" && node.strokeWidth > 0 {
            css.append("border: \(px(node.strokeWidth)) solid \(node.stroke);")
            classes.append("border-[\(px(node.strokeWidth))]")
            classes += colourClasses(prefix: "border", value: node.stroke)
        }
        if let radius = node.cornerRadii?.tl, radius > 0 {
            css.append("border-radius: \(px(radius));")
            classes.append("rounded-[\(px(radius))]")
        }
        if node.opacity != 1 {
            css.append("opacity: \(number(node.opacity));")
            classes.append("opacity-[\(number(node.opacity))]")
        }
        if node.blendMode != "normal" && node.blendMode != "source-over" {
            css.append("mix-blend-mode: \(node.blendMode);")
        }
        if node.kind == .text {
            if let family = node.fontFamily {
                let escaped = family.replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: "\"", with: "\\\"")
                css.append("font-family: \"\(escaped)\";")
                classes.append("font-['\(family.replacingOccurrences(of: " ", with: "_"))']")
            }
            if let size = node.fontSize {
                css.append("font-size: \(px(size));")
                classes.append("text-[\(px(size))]")
            }
            if let weight = node.fontWeight {
                css.append("font-weight: \(weight);")
                classes.append("font-[\(weight)]")
            }
            if let height = node.lineHeight { css.append("line-height: \(number(height));") }
            if let spacing = node.letterSpacing {
                css.append("letter-spacing: \(px(spacing));")
                classes.append("tracking-[\(px(spacing))]")
            }
            if let alignment = node.textAlign {
                css.append("text-align: \(alignment);")
                if alignment == "center" || alignment == "right" {
                    classes.append("text-\(alignment)")
                }
            }
            css.append("color: \(node.fill);")
        }
        return "/* CSS */\n" + css.joined(separator: "\n") + "\n\n/* Tailwind */\n"
            + classes.joined(separator: " ")
    }

    private static func px(_ value: CGFloat) -> String { "\(Int(value.rounded()))px" }
    private static func number(_ value: CGFloat) -> String { String(format: "%g", Double(value)) }
    private static func colourClasses(prefix: String, value: String) -> [String] {
        if value.contains("gradient(") { return ["\(prefix)-gradient", "bg-cover"] }
        if value.hasPrefix("#") { return ["\(prefix)-[\(value.uppercased())]"] }
        return []
    }
}
