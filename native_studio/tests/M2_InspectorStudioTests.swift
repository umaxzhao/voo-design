//
//  M2_InspectorStudioTests.swift
//  native_studio tests
//
//  Milestone M2 E2E Test Suite:
//  - Transform: Aspect ratio lock, independent 4-corner radii, clamping
//  - Models: SerDe fidelity for LayerStyle (stroke), LayerEffects (blur), VOONode (lock/italic/underline)
//  - Appearance: Fill mode (Solid/Linear/Radial), Gradient stops bar, Stroke caps/joins/dash/align
//  - Typography: Visible dropdown/segmented controls, line height/letter spacing, italic/underline
//  - Effects: Collapsible Gaussian blur, drop shadow, inner shadow stack
//  - Canvas: 4-corner rounded rect path, gradient rendering, stroke styling, shadow passes
//  - Inspector: Delegate wiring and callback forwarding
//  Copyright © 2026 VOO Design. All rights reserved.
//

#if INTEGRATED
import AppKit
import CoreGraphics
import Foundation

public final class M2_InspectorStudioTests {
    private final class MockInspectorDelegate: InspectorDelegate {
        var selectedNodeId: String?
        var lastLockRatio: (id: String, locked: Bool)?
        var lastCornerRadii: (id: String, radii: CornerRadii)?
        var lastStrokeStyle: (id: String, cap: String?, join: String?, miter: CGFloat?, dash: [CGFloat]?, align: String?)?
        var lastTextDecoration: (id: String, italic: Bool?, underline: Bool?, boxWidth: CGFloat?)?
        var lastEffects: (id: String, effects: LayerEffects)?

        func inspectorDidSelectNode(id: String) { selectedNodeId = id }
        func inspectorDidChangeNodeLockRatio(id: String, lockRatio: Bool) {
            lastLockRatio = (id, lockRatio)
        }
        func inspectorDidChangeNodeCornerRadii(id: String, cornerRadii: CornerRadii) {
            lastCornerRadii = (id, cornerRadii)
        }
        func inspectorDidChangeNodeStrokeStyle(id: String, strokeCap: String?, strokeJoin: String?, strokeMiterLimit: CGFloat?, strokeDash: [CGFloat]?, strokeAlign: String?) {
            lastStrokeStyle = (id, strokeCap, strokeJoin, strokeMiterLimit, strokeDash, strokeAlign)
        }
        func inspectorDidChangeTextDecoration(id: String, italic: Bool?, underline: Bool?, boxWidth: CGFloat?) {
            lastTextDecoration = (id, italic, underline, boxWidth)
        }
        func inspectorDidChangeEffects(id: String, effects: LayerEffects) {
            lastEffects = (id, effects)
        }
    }

    public static func registerTests() {
        let registry = TestRegistry.shared

        // MARK: - 1. CornerRadii Helpers & Clamping
        registry.register(tier: 1, feature: "M2-CornerRadii", name: "test_M2_CornerRadii_UniformAndClamping") {
            let uniformRadii = CornerRadii(uniform: 12.0)
            try TestAssertions.assertTrue(uniformRadii.isUniform, "CornerRadii(uniform: 12) must be uniform")
            try TestAssertions.assertApproxEqual(uniformRadii.uniformRadius, 12.0, "uniformRadius must return 12.0")

            let nonUniformRadii = CornerRadii(tl: 10, tr: 12, br: 10, bl: 10)
            try TestAssertions.assertFalse(nonUniformRadii.isUniform, "Radii with different corner values must not be uniform")

            // Clamping test: W3C CSS Backgrounds and Borders §5.5 proportional reduction
            // For rect 20x30: topSum(40) > 20 -> f=20/40=0.5; bottomSum(45) > 20 -> f=20/45=4/9; leftSum(55) > 30 -> f=30/55=6/11; rightSum(30) <= 30
            // min factor is 4/9 ≈ 0.4444. All corner radii scale by 4/9 so adjacent sums never exceed box dimensions.
            let unclamped = CornerRadii(tl: 15, tr: 25, br: 5, bl: 40)
            let clamped = unclamped.clamped(forWidth: 20, height: 30)
            let expectedFactor: CGFloat = 20.0 / 45.0
            try TestAssertions.assertApproxEqual(clamped.tl, 15.0 * expectedFactor, "TL radius must be scaled proportionally")
            try TestAssertions.assertApproxEqual(clamped.tr, 25.0 * expectedFactor, "TR radius must be scaled proportionally")
            try TestAssertions.assertApproxEqual(clamped.br, 5.0 * expectedFactor, "BR radius must be scaled proportionally")
            try TestAssertions.assertApproxEqual(clamped.bl, 40.0 * expectedFactor, "BL radius must be scaled proportionally")
            try TestAssertions.assertTrue(clamped.tl + clamped.tr <= 20.001, "Top sum must not exceed width")
            try TestAssertions.assertTrue(clamped.bl + clamped.br <= 20.001, "Bottom sum must not exceed width")
            try TestAssertions.assertTrue(clamped.tl + clamped.bl <= 30.001, "Left sum must not exceed height")
            try TestAssertions.assertTrue(clamped.tr + clamped.br <= 30.001, "Right sum must not exceed height")
        }

        // MARK: - 2. Data Model SerDe Fidelity
        registry.register(tier: 1, feature: "M2-ModelSerDe", name: "test_M2_Model_SerDe_StrokeAttributesAndEffects") {
            var style = LayerStyle(fill: "#FFFFFF", stroke: "#000000", strokeWidth: 2.0, opacity: 1.0, blendMode: "source-over", visible: true, locked: false)
            style.strokeCap = "round"
            style.strokeJoin = "bevel"
            style.strokeMiterLimit = 5.0
            style.strokeDash = [10.0, 5.0]
            style.strokeAlign = "inside"
            style.fillOpacity = 0.8
            style.strokeOpacity = 0.5

            let encoder = JSONEncoder()
            let decoder = JSONDecoder()

            let styleData = try encoder.encode(style)
            let decodedStyle = try decoder.decode(LayerStyle.self, from: styleData)
            try TestAssertions.assertEqual(decodedStyle.strokeCap, "round")
            try TestAssertions.assertEqual(decodedStyle.strokeJoin, "bevel")
            try TestAssertions.assertApproxEqual(decodedStyle.strokeMiterLimit ?? 0, 5.0)
            try TestAssertions.assertEqual(decodedStyle.strokeDash, [10.0, 5.0])
            try TestAssertions.assertEqual(decodedStyle.strokeAlign, "inside")
            try TestAssertions.assertApproxEqual(decodedStyle.fillOpacity ?? 0, 0.8)
            try TestAssertions.assertApproxEqual(decodedStyle.strokeOpacity ?? 0, 0.5)

            // LayerEffects with gaussianBlur
            var effects = LayerEffects()
            effects.gaussianBlur = BlurEffect(enabled: true, radius: 15.0)
            effects.shadow = DropShadowEffect(enabled: true, color: "#112233", blur: 12, offsetX: 2, offsetY: 4, spread: 1, opacity: 0.7)

            let effectsData = try encoder.encode(effects)
            let decodedEffects = try decoder.decode(LayerEffects.self, from: effectsData)
            try TestAssertions.assertEqual(decodedEffects.gaussianBlur?.enabled, true)
            try TestAssertions.assertApproxEqual(CGFloat(decodedEffects.gaussianBlur?.radius ?? 0), 15.0)
            try TestAssertions.assertEqual(decodedEffects.shadow?.color, "#112233")
            try TestAssertions.assertApproxEqual(CGFloat(decodedEffects.shadow?.offsetX ?? 0), 2.0)

            // VOONode with lockRatio, italic, underline
            var node = VOONode(id: "test_node_m2", kind: .text, name: "Text Layer", x: 10, y: 20, width: 200, height: 40)
            node.lockRatio = true
            node.italic = true
            node.underline = true
            node.boxWidth = 250.0

            let nodeData = try encoder.encode(node)
            let decodedNode = try decoder.decode(VOONode.self, from: nodeData)
            try TestAssertions.assertEqual(decodedNode.lockRatio, true)
            try TestAssertions.assertEqual(decodedNode.italic, true)
            try TestAssertions.assertEqual(decodedNode.underline, true)
            try TestAssertions.assertApproxEqual(decodedNode.boxWidth ?? 0, 250.0)
        }

        // MARK: - 3. Properties Panel Aspect Ratio Lock
        registry.register(tier: 1, feature: "M2-Transform", name: "test_M2_PropertiesPanel_LockRatioRecalculation") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 520))
            let node = VOONode(id: "rect_1", kind: .rect, name: "Rectangle", x: 0, y: 0, width: 100, height: 50)
            panel.configure(with: node)
            panel.layoutSubtreeIfNeeded()

            try TestAssertions.assertFalse(panel.isAspectLocked, "Default lockRatio must be false")

            // Toggle lock ratio
            panel.lockRatioButton.performClick(nil)
            try TestAssertions.assertTrue(panel.isAspectLocked, "lockRatio must be true after toggle")

            // Editing width from 100 to 200 should scale height from 50 to 100
            var changedW: CGFloat = 0
            var changedH: CGFloat = 0
            panel.onGeometryChange = { _, _, w, h, _, _ in
                changedW = w
                changedH = h
            }

            // Simulate editing W via pill value change
            panel.wPill.onValueChanged?(200)
            try TestAssertions.assertApproxEqual(changedW, 200, "Width must scale to 200")
            try TestAssertions.assertApproxEqual(changedH, 100, "Height must scale to 100 proportionally")

            // Simulate editing H via pill value change
            panel.hPill.onValueChanged?(25)
            try TestAssertions.assertApproxEqual(changedW, 50, "Width must scale to 50 proportionally")
            try TestAssertions.assertApproxEqual(changedH, 25, "Height must scale to 25")
        }

        // MARK: - 4. Independent Corner Radii Unlinking
        registry.register(tier: 1, feature: "M2-Transform", name: "test_M2_PropertiesPanel_CornerRadiiUnlinking") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 520))
            var node = VOONode(id: "rect_radii", kind: .rect, name: "Rounded Rect", x: 0, y: 0, width: 100, height: 100)
            node.cornerRadii = CornerRadii(uniform: 15)
            panel.configure(with: node)
            panel.layoutSubtreeIfNeeded()

            try TestAssertions.assertTrue(panel.isCornerRadiiLinked, "Initial uniform radii must be linked")
            try TestAssertions.assertFalse(panel.tlPill.isHidden == false, "Independent corner pills must be hidden when linked")

            // Unlink corner radii
            panel.crLinkButton.performClick(nil)
            try TestAssertions.assertFalse(panel.isCornerRadiiLinked, "isCornerRadiiLinked must be false after toggle")
            try TestAssertions.assertTrue(panel.tlPill.isHidden == false, "TL pill must be visible when unlinked")

            var updatedRadii: CornerRadii?
            panel.onCornerRadiiChange = { updatedRadii = $0 }

            panel.trPill.onValueChanged?(30)
            try TestAssertions.assertNotNil(updatedRadii, "onCornerRadiiChange must be triggered on TR edit")
            try TestAssertions.assertApproxEqual(updatedRadii?.tl ?? 0, 15, "TL must stay 15")
            try TestAssertions.assertApproxEqual(updatedRadii?.tr ?? 0, 30, "TR must become 30")

            // Relink
            panel.crLinkButton.performClick(nil)
            try TestAssertions.assertTrue(panel.isCornerRadiiLinked, "isCornerRadiiLinked must be true after relinking")
            try TestAssertions.assertApproxEqual(panel.currentCornerRadii.uniformRadius, 15, "Uniform radius must be restored")
        }

        // MARK: - 5. Gradient Fill & Stops Bar
        registry.register(tier: 1, feature: "M2-Appearance", name: "test_M2_PropertiesPanel_GradientFillAndStops") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 520))
            let node = VOONode(id: "shape_grad", kind: .rect, name: "Grad Rect", x: 0, y: 0, width: 100, height: 100)
            panel.configure(with: node)
            panel.layoutSubtreeIfNeeded()

            var latestFill: String?
            panel.onFillChange = { latestFill = $0 }

            // Switch to linear gradient
            panel.fillModeControl.select(value: "linear", notify: true)
            try TestAssertions.assertEqual(panel.currentFillMode, "linear")
            try TestAssertions.assertFalse(panel.gradientStopsBar.isHidden, "Gradient stops bar must be visible")
            try TestAssertions.assertFalse(panel.gradientAnglePill.isHidden, "Angle pill must be visible in linear mode")

            // Check that fill string contains linear-gradient
            try TestAssertions.assertNotNil(latestFill, "Fill change must be emitted on switching to gradient")
            try TestAssertions.assertTrue(latestFill?.hasPrefix("linear-gradient") == true, "Fill string must be linear-gradient")

            // Switch to radial gradient
            panel.fillModeControl.select(value: "radial", notify: true)
            try TestAssertions.assertEqual(panel.currentFillMode, "radial")
            try TestAssertions.assertTrue(panel.gradientAnglePill.isHidden, "Angle pill must be hidden in radial mode")
            try TestAssertions.assertTrue(latestFill?.hasPrefix("radial-gradient") == true, "Fill string must be radial-gradient")

            // Switch back to solid
            panel.fillModeControl.select(value: "solid", notify: true)
            try TestAssertions.assertEqual(panel.currentFillMode, "solid")
            try TestAssertions.assertTrue(panel.gradientStopsBar.isHidden, "Gradient stops bar must be hidden in solid mode")
        }

        // MARK: - 6. Stroke Options & Presets
        registry.register(tier: 1, feature: "M2-Appearance", name: "test_M2_PropertiesPanel_StrokeControls") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 520))
            let node = VOONode(id: "stroke_node", kind: .rect, name: "Stroke Rect", x: 0, y: 0, width: 100, height: 100)
            panel.configure(with: node)
            panel.layoutSubtreeIfNeeded()

            var emittedCap: String?
            var emittedJoin: String?
            var emittedMiter: CGFloat?
            var emittedDash: [CGFloat]?
            var emittedAlign: String?

            panel.onStrokeCapChange = { emittedCap = $0 }
            panel.onStrokeJoinChange = { emittedJoin = $0 }
            panel.onStrokeMiterLimitChange = { emittedMiter = $0 }
            panel.onStrokeDashChange = { emittedDash = $0 }
            panel.onStrokeAlignChange = { emittedAlign = $0 }

            panel.strokeCapControl.select(value: "round", notify: true)
            try TestAssertions.assertEqual(emittedCap, "round")

            panel.strokeJoinControl.select(value: "bevel", notify: true)
            try TestAssertions.assertEqual(emittedJoin, "bevel")

            panel.strokeMiterLimitPill.onValueChanged?(8.0)
            try TestAssertions.assertApproxEqual(emittedMiter ?? 0, 8.0)

            // Dash preset "dotted": must force cap to round and dash to [0, 2w]
            panel.strokeDashControl.select(value: "dotted", notify: true)
            try TestAssertions.assertEqual(panel.currentStrokeCap, "round", "Dotted stroke must force cap to round")
            try TestAssertions.assertEqual(emittedDash?.first, 0.0, "Dotted stroke dash starts with 0")

            panel.strokeAlignControl.select(value: "inside", notify: true)
            try TestAssertions.assertEqual(emittedAlign, "inside")
        }

        // MARK: - 7. Visible Typography Controls
        registry.register(tier: 1, feature: "M2-Typography", name: "test_M2_PropertiesPanel_VisibleTypographyControls") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 520))
            let textNode = VOONode(id: "txt_layer", kind: .text, name: "Heading", x: 0, y: 0, width: 200, height: 40)
            panel.configure(with: textNode)
            panel.layoutSubtreeIfNeeded()

            var emittedWeight: String?
            var emittedAlign: String?
            var emittedLH: CGFloat?
            var emittedLS: CGFloat?
            var emittedItalic: Bool?
            var emittedUnderline: Bool?

            panel.onFontWeightChange = { emittedWeight = $0 }
            panel.onTextAlignChange = { emittedAlign = $0 }
            panel.onLineHeightChange = { emittedLH = $0 }
            panel.onLetterSpacingChange = { emittedLS = $0 }
            panel.onItalicChange = { emittedItalic = $0 }
            panel.onUnderlineChange = { emittedUnderline = $0 }

            panel.fontWeightDropdown.select(value: "bold")
            panel.fontWeightDropdown.onValueChange?("bold")
            try TestAssertions.assertEqual(emittedWeight, "bold")

            panel.alignSegmentedControl.select(value: "center", notify: true)
            try TestAssertions.assertEqual(emittedAlign, "center")

            panel.lineHeightPill.onValueChanged?(1.6)
            try TestAssertions.assertApproxEqual(emittedLH ?? 0, 1.6)

            panel.letterSpacingPill.onValueChanged?(2.5)
            try TestAssertions.assertApproxEqual(emittedLS ?? 0, 2.5)

            panel.italicButton.performClick(nil)
            try TestAssertions.assertEqual(emittedItalic, true)

            panel.underlineButton.performClick(nil)
            try TestAssertions.assertEqual(emittedUnderline, true)
        }

        // MARK: - 8. Effects Stack
        registry.register(tier: 1, feature: "M2-Effects", name: "test_M2_PropertiesPanel_EffectsStack") {
            let panel = PropertiesPanelView(frame: NSRect(x: 0, y: 0, width: 256, height: 520))
            let node = VOONode(id: "fx_node", kind: .rect, name: "FX Rect", x: 0, y: 0, width: 100, height: 100)
            panel.configure(with: node)
            panel.layoutSubtreeIfNeeded()

            var emittedEffects: LayerEffects?
            panel.onEffectsChange = { emittedEffects = $0 }

            // Gaussian blur
            panel.blurCheckbox.performClick(nil)
            panel.blurPill.onValueChanged?(12.0)
            try TestAssertions.assertNotNil(emittedEffects)
            try TestAssertions.assertEqual(emittedEffects?.gaussianBlur?.enabled, true)
            try TestAssertions.assertApproxEqual(CGFloat(emittedEffects?.gaussianBlur?.radius ?? 0), 12.0)

            // Drop shadow
            panel.dropShadowCheckbox.performClick(nil)
            panel.dropShadowXPill.onValueChanged?(6.0)
            panel.dropShadowYPill.onValueChanged?(8.0)
            try TestAssertions.assertApproxEqual(CGFloat(emittedEffects?.shadow?.offsetX ?? 0), 6.0)
            try TestAssertions.assertApproxEqual(CGFloat(emittedEffects?.shadow?.offsetY ?? 0), 8.0)

            // Inner shadow
            panel.innerShadowCheckbox.performClick(nil)
            panel.innerShadowBlurPill.onValueChanged?(4.0)
            try TestAssertions.assertApproxEqual(CGFloat(emittedEffects?.innerShadow?.blur ?? 0), 4.0)
        }

        // MARK: - 9. Canvas Stage Path & Gradient Rendering
        registry.register(tier: 1, feature: "M2-CanvasRendering", name: "test_M2_CanvasStageView_PathWithCornerRadiiAndGradient") {
            let rect = CGRect(x: 0, y: 0, width: 200, height: 100)
            let radii = CornerRadii(tl: 10, tr: 20, br: 30, bl: 40)
            let path = CanvasStageView.pathWithCornerRadii(rect: rect, radii: radii)

            try TestAssertions.assertFalse(path.isEmpty, "Corner radii path must not be empty")
            try TestAssertions.assertRectApproxEqual(path.boundingBox, rect, accuracy: 1e-2, "Path bounding box must equal input rect")

            // Gradient parser
            let linearCSS = "linear-gradient(45deg, #FF0000 0%, #00FF00 100%)"
            guard let linearGrad = CanvasStageView.parseGradient(from: linearCSS) else {
                throw TestFailure(message: "Failed to parse linear gradient", file: #file, line: #line)
            }
            if case .linear(let angle) = linearGrad.type {
                try TestAssertions.assertApproxEqual(angle, 45, "Parsed linear gradient angle must be 45")
            } else {
                throw TestFailure(message: "Expected linear gradient type", file: #file, line: #line)
            }
            try TestAssertions.assertEqual(linearGrad.stops.count, 2, "Linear gradient must have 2 stops")

            let radialCSS = "radial-gradient(circle at 50% 50%, #000000 0%, #FFFFFF 100%)"
            guard let radialGrad = CanvasStageView.parseGradient(from: radialCSS) else {
                throw TestFailure(message: "Failed to parse radial gradient", file: #file, line: #line)
            }
            if case .radial = radialGrad.type {
                try TestAssertions.assertEqual(radialGrad.stops.count, 2, "Radial gradient must have 2 stops")
            } else {
                throw TestFailure(message: "Expected radial gradient type", file: #file, line: #line)
            }
        }

        // MARK: - 10. Inspector Studio Forwarding & Wiring
        registry.register(tier: 1, feature: "M2-InspectorWiring", name: "test_M2_Inspector_WiringAndForwarding") {
            let inspector = InspectorView(frame: NSRect(x: 0, y: 0, width: 1436, height: 857))
            let spy = MockInspectorDelegate()
            inspector.delegate = spy

            let node = VOONode(id: "node_wiring", kind: .rect, name: "Wiring Rect", x: 10, y: 20, width: 100, height: 80)
            inspector.layersPanel.configure(with: [node], selectedId: node.id)
            inspector.configureProperties(with: node)

            // Test lock ratio forwarding
            inspector.propertiesPanel.onLockRatioChange?(true)
            try TestAssertions.assertEqual(spy.lastLockRatio?.id, node.id)
            try TestAssertions.assertEqual(spy.lastLockRatio?.locked, true)

            // Test corner radii forwarding
            let newRadii = CornerRadii(tl: 5, tr: 10, br: 15, bl: 20)
            inspector.propertiesPanel.onCornerRadiiChange?(newRadii)
            try TestAssertions.assertEqual(spy.lastCornerRadii?.id, node.id)
            try TestAssertions.assertEqual(spy.lastCornerRadii?.radii, newRadii)

            // Test stroke style forwarding
            inspector.propertiesPanel.onStrokeCapChange?("round")
            try TestAssertions.assertEqual(spy.lastStrokeStyle?.id, node.id)

            // Test text decoration forwarding
            inspector.propertiesPanel.onItalicChange?(true)
            try TestAssertions.assertEqual(spy.lastTextDecoration?.id, node.id)
            try TestAssertions.assertEqual(spy.lastTextDecoration?.italic, true)

            // Test effects forwarding
            var effects = LayerEffects()
            effects.gaussianBlur = BlurEffect(enabled: true, radius: 8.0)
            inspector.propertiesPanel.onEffectsChange?(effects)
            try TestAssertions.assertEqual(spy.lastEffects?.id, node.id)
            try TestAssertions.assertEqual(spy.lastEffects?.effects.gaussianBlur?.enabled, true)
        }
    }
}
#else
import Foundation
public class M2_InspectorStudioTests {
    public static func registerTests() {}
}
#endif
