import AppKit

/// Only configured effects occupy the default inspector. The single + menu
/// owns adding/removing effects; disabled effects retain their editable values.
enum NativeEffectsLayout {
    static func layout(_ panel: PropertiesPanelView, width: CGFloat) -> CGFloat {
        var y: CGFloat = 18
        let groups: [(Bool, [NSView])] = [
            (panel.currentEffects.gaussianBlur != nil, [panel.blurCheckbox, panel.blurPill]),
            (
                panel.currentEffects.shadow != nil,
                [
                    panel.dropShadowCheckbox, panel.dropShadowHexPill,
                    panel.dropShadowOpacityPill, panel.dropShadowBlurPill, panel.dropShadowXPill,
                    panel.dropShadowYPill,
                ]
            ),
            (
                panel.currentEffects.innerShadow != nil,
                [
                    panel.innerShadowCheckbox, panel.innerShadowHexPill,
                    panel.innerShadowOpacityPill, panel.innerShadowBlurPill, panel.innerShadowXPill,
                    panel.innerShadowYPill,
                ]
            ),
        ]
        for (index, group) in groups.enumerated() {
            for view in group.1 { view.isHidden = !group.0 }
            guard group.0 else { continue }
            group.1[0].frame = CGRect(x: 0, y: y, width: 116, height: 24)
            if index == 0 {
                group.1[1].frame = CGRect(x: width - 60, y: y, width: 60, height: 24)
                y += 28
            } else {
                group.1[1].frame = CGRect(x: 116, y: y, width: 64, height: 24)
                group.1[2].frame = CGRect(x: width - 48, y: y, width: 48, height: 24)
                for offset in 0..<3 {
                    group.1[offset + 3].frame = CGRect(
                        x: CGFloat(offset) * 56, y: y + 28, width: 50, height: 24)
                }
                y += 56
            }
        }
        return y + 4
    }
}
