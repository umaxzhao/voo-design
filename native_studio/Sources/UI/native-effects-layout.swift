import AppKit

/// Configured effects share the web's compact rows; only the open row exposes parameters.
enum NativeEffectsLayout {
    static func layout(_ panel: PropertiesPanelView, width: CGFloat) -> CGFloat {
        let groups: [(String, Bool, Bool, NativeCopy.Key, [NSView])] = [
            (
                "gaussianBlur", panel.currentEffects.gaussianBlur != nil,
                panel.currentEffects.gaussianBlur?.enabled == true,
                .blurEffect, [panel.blurCheckbox, panel.blurPill]
            ),
            (
                "shadow", panel.currentEffects.shadow != nil,
                panel.currentEffects.shadow?.enabled == true,
                .shadowEffect,
                [
                    panel.dropShadowCheckbox, panel.dropShadowHexPill, panel.dropShadowOpacityPill,
                    panel.dropShadowBlurPill, panel.dropShadowXPill, panel.dropShadowYPill,
                ]
            ),
            (
                "innerShadow", panel.currentEffects.innerShadow != nil,
                panel.currentEffects.innerShadow?.enabled == true,
                .innerShadowEffect,
                [
                    panel.innerShadowCheckbox, panel.innerShadowHexPill,
                    panel.innerShadowOpacityPill,
                    panel.innerShadowBlurPill, panel.innerShadowXPill, panel.innerShadowYPill,
                ]
            ),
        ]
        var y: CGFloat = groups.contains { $0.1 } ? 32 : 18
        for (key, configured, enabled, label, controls) in groups {
            guard let row = panel.configuredEffectRows[key] else {
                preconditionFailure("Missing effect row")
            }
            row.isHidden = !configured
            row.label = NativeCopy.text(label)
            row.isEffectEnabled = enabled
            let expanded = configured && panel.expandedNativeEffect == key
            row.isExpanded = expanded
            for control in controls { control.isHidden = true }
            guard configured else { continue }
            row.frame = CGRect(x: 0, y: y, width: width, height: 28)
            y += 32
            guard expanded else { continue }
            for control in controls.dropFirst() { control.isHidden = false }
            if key == "gaussianBlur" {
                controls[1].frame = CGRect(x: 8, y: y + 4, width: width - 16, height: 32)
                y += 44
            } else {
                controls[1].frame = CGRect(x: 8, y: y + 4, width: (width - 24) / 2, height: 32)
                controls[2].frame = CGRect(
                    x: width / 2 + 4, y: y + 4, width: (width - 24) / 2, height: 32)
                let fieldWidth = (width - 32) / 3
                for index in 0..<3 {
                    controls[index + 3].frame = CGRect(
                        x: 8 + CGFloat(index) * (fieldWidth + 8), y: y + 44,
                        width: fieldWidth, height: 32)
                }
                y += 84
            }
        }
        return y + 4
    }
}
