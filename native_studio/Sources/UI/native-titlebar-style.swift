import AppKit

/// File actions share the web title bar's UI font and locale.
enum NativeTitleBarStyle {
    enum Key { case importDocument, exportDocument, newDocument, share, guest }

    static var actionFont: NSFont { ThemeFonts.system(size: 11, weight: .medium) }

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
