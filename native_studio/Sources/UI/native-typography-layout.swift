import AppKit

/// Mirrors TypographyBasics: captions belong to each group, not a compact unlabeled grid.
enum NativeTypographyLayout {
    enum Caption: String, CaseIterable {
        case font, weight, size, lineHeight, letterSpacing, style, alignment, widthMode, boxWidth
        var title: String {
            let chinese =
                (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey)
                ?? "en").hasPrefix("zh")
            switch (self, chinese) {
            case (.font, true): return "字体"
            case (.font, false): return "Font"
            case (.weight, true): return "字重"
            case (.weight, false): return "Weight"
            case (.size, true): return "字号"
            case (.size, false): return "Size"
            case (.lineHeight, true): return "行高"
            case (.lineHeight, false): return "Line height"
            case (.letterSpacing, true): return "字距"
            case (.letterSpacing, false): return "Letter spacing"
            case (.style, true): return "样式"
            case (.style, false): return "Style"
            case (.alignment, true): return "对齐"
            case (.alignment, false): return "Alignment"
            case (.widthMode, true): return "文本框"
            case (.widthMode, false): return "Text box"
            case (.boxWidth, _): return NativeCopy.text(.textBoxWidth)
            }
        }
    }

    static var sectionTitle: String {
        let chinese =
            (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
        return chinese ? "文字排版" : "Text style"
    }

    static var weightOptions: [(title: String, value: String)] {
        let chinese =
            (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
        let values = ["100", "200", "300", "normal", "500", "600", "700", "800", "900"]
        let titles =
            chinese
            ? ["纤细", "极细", "细体", "常规", "中等", "半粗", "粗体", "特粗", "黑体"]
            : [
                "Thin", "Extra Light", "Light", "Regular", "Medium", "SemiBold", "Bold",
                "Extra Bold", "Black",
            ]
        return zip(titles, values).map { ($0, $1) }
    }

    static func weightValue(_ raw: String) -> String {
        let aliases = [
            "thin": "100", "light": "300", "regular": "normal", "400": "normal",
            "medium": "500", "semibold": "600", "bold": "700", "black": "900",
        ]
        return aliases[raw.lowercased()] ?? raw
    }

    static func drawMetricGlyph(
        _ kind: PropertiesGlyphFactory.Kind, in rect: CGRect, color: NSColor
    ) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.minY)
        if NSGraphicsContext.current?.isFlipped != true {
            context.translateBy(x: 0, y: rect.height)
            context.scaleBy(x: 1, y: -1)
        }
        context.scaleBy(x: rect.width / 16, y: rect.height / 16)
        context.setStrokeColor(color.cgColor)
        context.setLineWidth(1.5)
        context.setLineCap(.round)
        context.setLineJoin(.round)
        if kind == .typeSize {
            for (x, top, width) in [(1.0, 3.0, 6.0), (9.0, 7.0, 5.0)] {
                context.move(to: CGPoint(x: x, y: 13))
                context.addLine(to: CGPoint(x: x + width / 2, y: top))
                context.addLine(to: CGPoint(x: x + width, y: 13))
                context.move(to: CGPoint(x: x + 1, y: 10))
                context.addLine(to: CGPoint(x: x + width - 1, y: 10))
            }
        } else if kind == .typeBoxWidth {
            context.stroke(CGRect(x: 2, y: 5, width: 12, height: 6))
        } else {
            if kind == .typeSpacing {
                context.translateBy(x: 16, y: 0)
                context.rotate(by: .pi / 2)
            }
            context.move(to: CGPoint(x: 8, y: 2))
            context.addLine(to: CGPoint(x: 8, y: 14))
            for (y, direction) in [(2.0, 1.0), (14.0, -1.0)] {
                context.move(to: CGPoint(x: 5, y: y + direction * 3))
                context.addLine(to: CGPoint(x: 8, y: y))
                context.addLine(to: CGPoint(x: 11, y: y + direction * 3))
            }
        }
        context.strokePath()
        context.restoreGState()
    }

    struct Controls {
        var heading: NSView
        var family: NSView
        var weight: NSView
        var size: NSView
        var lineHeight: NSView
        var letterSpacing: NSView
        var italic: NSView
        var underline: NSView
        var styleGroup: NSView
        var alignment: NSView
        var widthMode: NSView
        var boxWidth: NSView
    }

    static func makeCaptions(in container: NSView) -> [Caption: NSTextField] {
        Dictionary(
            uniqueKeysWithValues: Caption.allCases.map { caption in
                let label = NSTextField(labelWithString: caption.title)
                label.font = ThemeFonts.mono(size: 11, weight: .medium)
                label.textColor = NSColor(hex: "d4d4d4")
                label.setAccessibilityIdentifier(
                    "Inspector.Properties.TypographyCaption.\(caption.rawValue)")
                container.addSubview(label)
                return (caption, label)
            })
    }

    static func layout(
        _ controls: Controls, captions: [Caption: NSTextField], width: CGFloat, fixedWidth: Bool
    )
        -> CGFloat
    {
        controls.heading.frame = CGRect(x: 2, y: 0, width: width - 4, height: 16)
        let top: CGFloat = 24
        let rowStep: CGFloat = 64
        let weightWidth = (width - 8) * 1.15 / 2
        let halfWidth = (width - 8) / 2
        let styleWidth = (width - 12) / 2.4
        let groups: [(Caption, CGRect)] = [
            (.font, CGRect(x: 0, y: top, width: width, height: 52)),
            (.weight, CGRect(x: 0, y: top + rowStep, width: weightWidth, height: 52)),
            (
                .size,
                CGRect(
                    x: weightWidth + 8, y: top + rowStep, width: width - weightWidth - 8, height: 52
                )
            ),
            (.lineHeight, CGRect(x: 0, y: top + rowStep * 2, width: halfWidth, height: 52)),
            (
                .letterSpacing,
                CGRect(x: halfWidth + 8, y: top + rowStep * 2, width: halfWidth, height: 52)
            ),
            (.style, CGRect(x: 0, y: top + rowStep * 3, width: styleWidth, height: 52)),
            (
                .alignment,
                CGRect(
                    x: styleWidth + 12, y: top + rowStep * 3, width: width - styleWidth - 12,
                    height: 52)
            ),
        ]
        for (caption, group) in groups {
            captions[caption]?.stringValue = caption.title
            captions[caption]?.frame = CGRect(
                x: group.minX, y: group.minY, width: group.width, height: 16)
        }
        controls.family.frame = CGRect(x: 0, y: top + 20, width: width, height: 32)
        controls.weight.frame = CGRect(x: 0, y: top + rowStep + 20, width: weightWidth, height: 32)
        controls.size.frame = CGRect(
            x: weightWidth + 8, y: top + rowStep + 20, width: width - weightWidth - 8, height: 32)
        controls.lineHeight.frame = CGRect(
            x: 0, y: top + rowStep * 2 + 20, width: halfWidth, height: 32)
        controls.letterSpacing.frame = CGRect(
            x: halfWidth + 8, y: top + rowStep * 2 + 20, width: halfWidth, height: 32)
        controls.styleGroup.frame = CGRect(
            x: 0, y: top + rowStep * 3 + 20, width: styleWidth, height: 32)
        let styleButtonWidth = (styleWidth - 6) / 2
        controls.italic.frame = CGRect(x: 2, y: 2, width: styleButtonWidth, height: 28)
        controls.underline.frame = CGRect(
            x: styleButtonWidth + 4, y: 2, width: styleButtonWidth, height: 28)
        controls.alignment.frame = CGRect(
            x: styleWidth + 12, y: top + rowStep * 3 + 20, width: width - styleWidth - 12,
            height: 32)
        let modeTop = top + rowStep * 4
        captions[.widthMode]?.frame = CGRect(x: 0, y: modeTop, width: width, height: 16)
        controls.widthMode.frame = CGRect(x: 0, y: modeTop + 20, width: width, height: 32)
        captions[.boxWidth]?.isHidden = !fixedWidth
        controls.boxWidth.isHidden = !fixedWidth
        captions[.boxWidth]?.frame = CGRect(x: 0, y: modeTop + 64, width: width, height: 16)
        controls.boxWidth.frame = CGRect(x: 0, y: modeTop + 84, width: width, height: 32)
        return modeTop + (fixedWidth ? 116 : 52)
    }
}

/// The two style toggles share one track, matching the inspector's grouped controls.
final class NativeTypographyStyleGroup: NSView {
    override var isFlipped: Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        NSColor(hex: "171717").setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 12, yRadius: 12).fill()
    }
}
