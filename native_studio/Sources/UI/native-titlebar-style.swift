import AppKit

/// File actions share the web title bar's UI font and locale.
enum NativeTitleBarStyle {
    enum Key { case importDocument, exportDocument, newDocument, share, guest }

    static var actionFont: NSFont { ThemeFonts.system(size: 11, weight: .medium) }
    static let actionTracking: CGFloat = 11 * 0.025

    /// Lucide Bolt: the web preferences icon is a hexagonal nut, not Settings.
    static func drawSettingsBolt(in rect: CGRect, color: NSColor) {
        VooIconFactory.withCanonicalCanvas(in: rect, color: color, strokeWidth: 2) { context in
            let path = CGMutablePath()
            path.move(to: CGPoint(x: 21, y: 16))
            path.addLine(to: CGPoint(x: 21, y: 8))
            path.addArc(
                center: CGPoint(x: 19, y: 8), radius: 2,
                startAngle: 0, endAngle: -.pi / 3, clockwise: true)
            path.addLine(to: CGPoint(x: 13, y: 4 - sqrt(3)))
            path.addArc(
                center: CGPoint(x: 12, y: 4), radius: 2,
                startAngle: -.pi / 3, endAngle: -.pi * 2 / 3, clockwise: true)
            path.addLine(to: CGPoint(x: 4, y: 8 - sqrt(3)))
            path.addArc(
                center: CGPoint(x: 5, y: 8), radius: 2,
                startAngle: -.pi * 2 / 3, endAngle: -.pi, clockwise: true)
            path.addLine(to: CGPoint(x: 3, y: 16))
            path.addArc(
                center: CGPoint(x: 5, y: 16), radius: 2,
                startAngle: .pi, endAngle: .pi * 2 / 3, clockwise: true)
            path.addLine(to: CGPoint(x: 11, y: 20 + sqrt(3)))
            path.addArc(
                center: CGPoint(x: 12, y: 20), radius: 2,
                startAngle: .pi * 2 / 3, endAngle: .pi / 3, clockwise: true)
            path.addLine(to: CGPoint(x: 20, y: 16 + sqrt(3)))
            path.addArc(
                center: CGPoint(x: 19, y: 16), radius: 2,
                startAngle: .pi / 3, endAngle: 0, clockwise: true)
            path.closeSubpath()
            context.addPath(path)
            context.addEllipse(in: CGRect(x: 8, y: 8, width: 8, height: 8))
            context.strokePath()
        }
    }

    static func text(_ key: Key) -> String {
        let chinese =
            (UserDefaults.standard.string(forKey: SettingsDrawerView.languageDefaultsKey) ?? "en")
            .hasPrefix("zh")
        switch key {
        case .importDocument: return chinese ? "导入" : "Import"
        case .exportDocument: return chinese ? "导出" : "Export"
        case .newDocument: return chinese ? "新建" : "New"
        case .share: return chinese ? "分享" : "Share"
        case .guest: return chinese ? "访" : "G"
        }
    }

    /// A local guest identity is not an authenticated account or live peer.
    /// The cluster retains the existing collaboration-unavailable action.
    static func drawGuestShare(in bounds: CGRect, hovered: Bool, context: CGContext) {
        if hovered {
            context.setFillColor(NSColor(white: 1, alpha: 0.06).cgColor)
            context.addPath(
                CGPath(
                    roundedRect: bounds, cornerWidth: 12, cornerHeight: 12,
                    transform: nil))
            context.fillPath()
        }
        let y = bounds.midY - 11
        let addCircle = CGRect(x: bounds.maxX - 26, y: y, width: 22, height: 22)
        context.setFillColor(NSColor(hex: hovered ? "404040" : "262626").cgColor)
        context.fillEllipse(in: addCircle)
        VooIconFactory.draw(
            .plus,
            in: CGRect(x: addCircle.midX - 5.5, y: addCircle.midY - 5.5, width: 11, height: 11),
            color: NSColor(hex: hovered ? "ffffff" : "a3a3a3"), strokeWidth: 1.5)

        let guestCircle = CGRect(x: bounds.minX + 4, y: y, width: 22, height: 22)
        context.setFillColor(NSColor(hex: "E5B2FF").cgColor)
        context.fillEllipse(in: guestCircle)
        let guest = NSAttributedString(
            string: text(.guest),
            attributes: [
                .font: ThemeFonts.system(size: 11, weight: .medium),
                .foregroundColor: NSColor.black,
            ])
        let size = guest.size()
        guest.draw(
            at: CGPoint(
                x: guestCircle.midX - size.width / 2,
                y: guestCircle.midY - size.height / 2))
    }
}
