import AppKit

/// The two tool families absent from the shared Lucide table.
enum NativeToolbarGlyphs {
    static func drawBucket(in rect: CGRect, color: NSColor) {
        VooIconFactory.withCanonicalCanvas(in: rect, color: color, strokeWidth: 1.5) { ctx in
            let bucket = CGMutablePath()
            bucket.move(to: CGPoint(x: 19, y: 11))
            bucket.addLine(to: CGPoint(x: 11, y: 3))
            bucket.addLine(to: CGPoint(x: 2.4, y: 11.6))
            bucket.addCurve(
                to: CGPoint(x: 2.4, y: 14.4),
                control1: CGPoint(x: 1.6, y: 12.4), control2: CGPoint(x: 1.6, y: 13.6))
            bucket.addLine(to: CGPoint(x: 7.6, y: 19.6))
            bucket.addCurve(
                to: CGPoint(x: 10.4, y: 19.6),
                control1: CGPoint(x: 8.4, y: 20.4), control2: CGPoint(x: 9.6, y: 20.4))
            bucket.closeSubpath()
            bucket.move(to: CGPoint(x: 5, y: 2))
            bucket.addLine(to: CGPoint(x: 10, y: 7))
            bucket.move(to: CGPoint(x: 2, y: 13))
            bucket.addLine(to: CGPoint(x: 17, y: 13))
            ctx.addPath(bucket)
            ctx.strokePath()

            let drop = CGMutablePath()
            drop.move(to: CGPoint(x: 22, y: 20))
            drop.addCurve(
                to: CGPoint(x: 18, y: 20),
                control1: CGPoint(x: 22, y: 22.667), control2: CGPoint(x: 18, y: 22.667))
            drop.addCurve(
                to: CGPoint(x: 20, y: 16),
                control1: CGPoint(x: 18, y: 18), control2: CGPoint(x: 20, y: 16))
            drop.addCurve(
                to: CGPoint(x: 22, y: 20),
                control1: CGPoint(x: 20, y: 16), control2: CGPoint(x: 22, y: 18))
            ctx.addPath(drop)
            ctx.strokePath()
        }
    }

    /// Same scaled bandage and sparkle composition as web IconHealAi.
    static func drawHealing(in rect: CGRect, color: NSColor) {
        VooIconFactory.withCanonicalCanvas(in: rect, color: color, strokeWidth: 1.5) { ctx in
            ctx.saveGState()
            ctx.scaleBy(x: 0.7, y: 0.7)
            ctx.addPath(
                CGPath(
                    roundedRect: CGRect(x: 2, y: 6, width: 20, height: 12),
                    cornerWidth: 2, cornerHeight: 2, transform: nil))
            ctx.move(to: CGPoint(x: 6, y: 6))
            ctx.addLine(to: CGPoint(x: 6, y: 18))
            ctx.move(to: CGPoint(x: 18, y: 6))
            ctx.addLine(to: CGPoint(x: 18, y: 18))
            for point in [
                CGPoint(x: 10, y: 10), CGPoint(x: 10, y: 14),
                CGPoint(x: 14, y: 10), CGPoint(x: 14, y: 14),
            ] {
                ctx.move(to: point)
                ctx.addLine(to: CGPoint(x: point.x + 0.01, y: point.y))
            }
            ctx.strokePath()
            ctx.restoreGState()
            ctx.translateBy(x: 3.6, y: 3.4)
            ctx.scaleBy(x: 0.8, y: 0.8)
            let sparkleData = """
                M 18.3194 21.8847
                C 18.4091 21.8101 18.47 21.7066 18.4914 21.5919
                C 18.6638 20.5669 19.1513 19.6212 19.8863 18.8863
                C 20.6212 18.1513 21.5669 17.6638 22.5919 17.4914
                C 22.7066 17.47 22.8101 17.4091 22.8847 17.3194
                C 22.9592 17.2296 23 17.1167 23 17
                C 23 16.8833 22.9592 16.7704 22.8847 16.6806
                C 22.8101 16.5909 22.7066 16.53 22.5919 16.5086
                C 21.5669 16.3362 20.6212 15.8487 19.8863 15.1137
                C 19.1513 14.3788 18.6638 13.4331 18.4914 12.4081
                C 18.47 12.2934 18.4091 12.1899 18.3194 12.1153
                C 18.2296 12.0408 18.1167 12 18 12
                C 17.8833 12 17.7704 12.0408 17.6806 12.1153
                C 17.5909 12.1899 17.53 12.2934 17.5086 12.4081
                C 17.3362 13.4331 16.8487 14.3788 16.1137 15.1137
                C 15.3788 15.8487 14.4331 16.3362 13.4081 16.5086
                C 13.2934 16.53 13.1899 16.5909 13.1153 16.6806
                C 13.0408 16.7704 13 16.8833 13 17
                C 13 17.1167 13.0408 17.2296 13.1153 17.3194
                C 13.1899 17.4091 13.2934 17.47 13.4081 17.4914
                C 14.4331 17.6638 15.3788 18.1513 16.1137 18.8863
                C 16.8487 19.6212 17.3362 20.5669 17.5086 21.5919
                C 17.53 21.7066 17.5909 21.8101 17.6806 21.8847
                C 17.7704 21.9592 17.8833 22 18 22
                C 18.1167 22 18.2296 21.9592 18.3194 21.8847 Z
                """
            // The shared path decoder accepts space-separated tokens only.
            // Normalize this multiline source locally before parsing it.
            let sparkle = VooIconFactory.cgPath(
                fromAbsolute: sparkleData.split(whereSeparator: { $0.isWhitespace }).joined(
                    separator: " "))
            ctx.addPath(sparkle)
            ctx.strokePath()
        }
    }
}

enum NativeToolbarCopy {
    enum Key { case fill, healing, crop, selection }

    static func text(_ key: Key) -> String {
        let chinese =
            (UserDefaults.standard.string(
                forKey: SettingsDrawerView.languageDefaultsKey) ?? "en").hasPrefix("zh")
        switch key {
        case .fill: return chinese ? "填充" : "Fill"
        case .healing: return chinese ? "AI修补" : "AI Repair"
        case .crop: return chinese ? "裁剪" : "Crop"
        case .selection: return chinese ? "选区" : "Selection"
        }
    }
}
