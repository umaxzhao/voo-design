//
//  M4_UnitTests.swift
//  native_studio
//
//  Milestone M4 Comprehensive Verification Suite:
//  - ThemeTokens: 6-Tier Dark Theme Tokens, Mint Accents, Contrast
//  - AccessibilityCatalog: Canonical UI Accessibility Identifiers
//  - AppTitleBar: 40px Height, Traffic Light Inset, Actions & Zoom Menu
//  - ToolRail: 8 Studio Tools, Single-Key Shortcuts (V, P, B, T)
//  - TransformPanel: 3x3 Interactive Anchor Array, Coordinate Scrubbing
//  - AppearancePanel & ColorPickerView: HSV Wheel, Swatches, Hex Formatting
//  - LayersPanel: Virtualized Layer Table View & Item State Toggles
//  - WindowController: Full AppKit Assembly & Event Dispatch
//

import AppKit
import CoreGraphics
import Foundation

@MainActor
func runM4Tests() {
    print("============================================================")
    print(" Running Milestone M4 Comprehensive Verification Suite")
    print("============================================================")

    var passed = 0
    var failed = 0

    func assert(_ condition: Bool, _ name: String) {
        if condition {
            print("  ✓ [PASS] \(name)")
            passed += 1
        } else {
            print("  ✗ [FAIL] \(name)")
            failed += 1
        }
    }

    // ============================================================
    // Section 1: Theme Tokens & Color Palette
    // ============================================================
    print("\n--- [Section 1] Theme Tokens & Dark Palette ---")

    assert(ThemeTokens.surfacePage == "#000000", "1.1 surfacePage is #000000")
    assert(ThemeTokens.surfacePanel == "#171717", "1.2 surfacePanel is #171717")
    assert(ThemeTokens.surfaceStage == "#525252", "1.3 surfaceStage is #525252")
    assert(ThemeTokens.accentMint == "#a7ffd4", "1.4 accentMint is #a7ffd4")
    assert(ThemeTokens.accentSelection == "#b2ffd6", "1.5 accentSelection is #b2ffd6")

    // Verify Theme Tokens dimensions
    assert(ThemeTokens.titleBarHeight == 40.0, "1.6 titleBarHeight == 40.0")
    assert(ThemeTokens.macTrafficLightInset == 96.0, "1.7 macTrafficLightInset == 96.0")
    assert(ThemeTokens.rulerTrackThickness == 18.0, "1.8 rulerTrackThickness == 18.0")
    assert(ThemeTokens.rotateStalkOffset == 20.0, "1.9 rotateStalkOffset == 20.0")

    // ============================================================
    // Section 2: Accessibility Catalog Identifiers
    // ============================================================
    print("\n--- [Section 2] Accessibility Catalog Identifiers ---")

    assert(AccessibilityCatalog.titleBar == "AppTitleBar", "2.1 titleBar identifier == 'AppTitleBar'")
    assert(AccessibilityCatalog.docTitle == "AppTitleBar.DocTitle", "2.2 docTitle identifier == 'AppTitleBar.DocTitle'")
    assert(AccessibilityCatalog.zoomIndicator == "AppTitleBar.ZoomIndicator", "2.3 zoomIndicator identifier == 'AppTitleBar.ZoomIndicator'")
    assert(AccessibilityCatalog.undoButton == "AppTitleBar.UndoButton", "2.4 undoButton identifier == 'AppTitleBar.UndoButton'")
    assert(AccessibilityCatalog.redoButton == "AppTitleBar.RedoButton", "2.5 redoButton identifier == 'AppTitleBar.RedoButton'")
    assert(AccessibilityCatalog.exportButton == "AppTitleBar.ExportButton", "2.6 exportButton identifier == 'AppTitleBar.ExportButton'")
    assert(AccessibilityCatalog.toolRail == "ToolRail", "2.7 toolRail identifier == 'ToolRail'")
    assert(AccessibilityCatalog.toolMove == "ToolRail.Move", "2.8 toolMove identifier == 'ToolRail.Move'")
    assert(AccessibilityCatalog.toolPen == "ToolRail.Pen", "2.9 toolPen identifier == 'ToolRail.Pen'")
    assert(AccessibilityCatalog.toolBrush == "ToolRail.Brush", "2.10 toolBrush identifier == 'ToolRail.Brush'")
    assert(AccessibilityCatalog.layersTree == "Inspector.LayersTree", "2.11 layersTree identifier == 'Inspector.LayersTree'")
    assert(AccessibilityCatalog.transformPanel == "Inspector.TransformPanel", "2.12 transformPanel identifier == 'Inspector.TransformPanel'")
    assert(AccessibilityCatalog.appearancePanel == "Inspector.AppearancePanel", "2.13 appearancePanel identifier == 'Inspector.AppearancePanel'")
    assert(AccessibilityCatalog.colorPicker == "Inspector.ColorPicker", "2.14 colorPicker identifier == 'Inspector.ColorPicker'")
    assert(AccessibilityCatalog.canvasViewport == "Canvas.Viewport", "2.15 canvasViewport identifier == 'Canvas.Viewport'")
    assert(AccessibilityCatalog.rulerHorizontal == "Canvas.RulerHorizontal", "2.16 rulerHorizontal identifier == 'Canvas.RulerHorizontal'")
    assert(AccessibilityCatalog.rulerVertical == "Canvas.RulerVertical", "2.17 rulerVertical identifier == 'Canvas.RulerVertical'")

    // ============================================================
    // Section 3: AppTitleBar Component
    // ============================================================
    print("\n--- [Section 3] AppTitleBar Component ---")

    let titleBar = AppTitleBar(frame: NSRect(x: 0, y: 0, width: 1440, height: 40))
    assert(titleBar.docTitleField.stringValue == "Untitled.voo", "3.1 Default document title is 'Untitled.voo'")
    titleBar.docTitleField.stringValue = "Artwork_Final.voo"
    assert(titleBar.docTitleField.stringValue == "Artwork_Final.voo", "3.2 Updating docTitle reflects correctly")
    assert(titleBar.zoomIndicator.stringValue == "100%", "3.3 Default zoom indicator is '100%'")
    titleBar.zoomIndicator.stringValue = "250%"
    assert(titleBar.zoomIndicator.stringValue == "250%", "3.4 Updating zoomIndicator reflects correctly")

    // Verify Action Buttons
    assert(titleBar.undoButton.isEnabled, "3.5 Undo button is enabled by default")
    assert(titleBar.redoButton.isEnabled, "3.6 Redo button is enabled by default")
    assert(titleBar.exportButton.isEnabled, "3.7 Export button is enabled by default")

    // ============================================================
    // Section 4: ToolRail & StudioToolType
    // ============================================================
    print("\n--- [Section 4] ToolRail & StudioToolType ---")

    let toolRail = ToolRailView()
    assert(toolRail.state.activeTool == .move, "4.1 Default active tool is .move")
    assert(toolRail.toolButtons.count == 8, "4.2 ToolRail contains 8 tool buttons")

    // Test tool switching
    toolRail.state.selectTool(.pen)
    toolRail.updateSelection()
    assert(toolRail.state.activeTool == .pen, "4.3 ToolRail switches activeTool to .pen")
    toolRail.state.selectTool(.brush)
    toolRail.updateSelection()
    assert(toolRail.state.activeTool == .brush, "4.4 ToolRail switches activeTool to .brush")
    toolRail.state.selectTool(.text)
    toolRail.updateSelection()
    assert(toolRail.state.activeTool == .text, "4.5 ToolRail switches activeTool to .text")
    toolRail.state.selectTool(.move)
    toolRail.updateSelection()
    assert(toolRail.state.activeTool == .move, "4.6 ToolRail switches activeTool to .move")

    // Verify StudioToolType shortcut bindings
    assert(StudioToolType.move.defaultShortcut == "V", "4.7 Move tool shortcut is 'V'")
    assert(StudioToolType.pen.defaultShortcut == "P", "4.8 Pen tool shortcut is 'P'")
    assert(StudioToolType.brush.defaultShortcut == "B", "4.9 Brush tool shortcut is 'B'")
    assert(StudioToolType.text.defaultShortcut == "T", "4.10 Text tool shortcut is 'T'")
    assert(StudioToolType.shapes.defaultShortcut == "R", "4.11 Shapes tool shortcut is 'R'")

    // ============================================================
    // Section 5: TransformPanel & 3x3 Anchor Array
    // ============================================================
    print("\n--- [Section 5] TransformPanel & 3x3 Anchor Array ---")

    let transformPanel = TransformPanelView(frame: NSRect(x: 0, y: 0, width: 280, height: 160))
    assert(transformPanel.activeAnchor == .nw, "5.1 Default transform anchor is .nw")

    // Verify anchor point calculation
    let testRect = CGRect(x: 100, y: 100, width: 200, height: 100)
    assert(TransformAnchor3x3.nw.anchorPoint(for: testRect) == CGPoint(x: 100, y: 100), "5.2 NW anchor point is (100, 100)")
    assert(TransformAnchor3x3.center.anchorPoint(for: testRect) == CGPoint(x: 200, y: 150), "5.3 Center anchor point is (200, 150)")
    assert(TransformAnchor3x3.se.anchorPoint(for: testRect) == CGPoint(x: 300, y: 200), "5.4 SE anchor point is (300, 200)")

    // Test configure with node
    let testNode = VOONode(
        id: "T1",
        kind: .rect,
        name: "Rect 1",
        x: 42.0, y: 84.0, width: 250.0, height: 180.0,
        rotation: 15.0,
        style: LayerStyle()
    )
    transformPanel.configure(with: testNode)
    assert(transformPanel.xField.value == 42.0, "5.5 X field configured to 42.0")
    assert(transformPanel.yField.value == 84.0, "5.6 Y field configured to 84.0")
    assert(transformPanel.wField.value == 250.0, "5.7 W field configured to 250.0")
    assert(transformPanel.hField.value == 180.0, "5.8 H field configured to 180.0")
    assert(transformPanel.rField.value == 15.0, "5.9 R field configured to 15.0")

    // ============================================================
    // Section 6: ColorPickerView & AppearancePanel
    // ============================================================
    print("\n--- [Section 6] ColorPickerView & AppearancePanel ---")

    let redState = ColorWheelState(hue: 0.0, saturation: 1.0, value: 1.0)
    assert(redState.hexString == "#FF0000", "6.1 Pure red hex string is '#FF0000'")

    let greenState = ColorWheelState(hue: 120.0, saturation: 1.0, value: 1.0)
    assert(greenState.hexString == "#00FF00", "6.2 Pure green hex string is '#00FF00'")

    let blueState = ColorWheelState(hue: 240.0, saturation: 1.0, value: 1.0)
    assert(blueState.hexString == "#0000FF", "6.3 Pure blue hex string is '#0000FF'")

    let colorPicker = ColorPickerView(frame: NSRect(x: 0, y: 0, width: 280, height: 260))
    colorPicker.state = ColorWheelState(hue: 180.0, saturation: 1.0, value: 1.0)
    assert(colorPicker.state.hexString == "#00FFFF", "6.4 Setting state updates hexString to '#00FFFF'")

    let appearancePanel = AppearancePanelView(frame: NSRect(x: 0, y: 0, width: 280, height: 220))
    assert(appearancePanel.fillHexLabel.stringValue.starts(with: "#"), "6.5 fillHexLabel is formatted hex")
    assert(appearancePanel.opacityLabel.stringValue.contains("%"), "6.6 opacityLabel is formatted percentage")

    // ============================================================
    // Section 7: LayersPanel Component
    // ============================================================
    print("\n--- [Section 7] LayersPanel Component ---")

    let layersPanel = LayersPanelView(frame: NSRect(x: 0, y: 0, width: 280, height: 250))
    assert(layersPanel.nodes.isEmpty, "7.1 LayersPanel initialized with empty nodes")

    let mockNode1 = VOONode(
        id: "N1",
        kind: .rect,
        name: "Rectangle 1",
        x: 100, y: 100, width: 200, height: 150,
        style: LayerStyle(fill: "#b2ffd6", stroke: "#171717", strokeWidth: 2, opacity: 1.0, visible: true, locked: false)
    )
    let mockNode2 = VOONode(
        id: "N2",
        kind: .text,
        name: "Text Heading",
        x: 100, y: 300, width: 250, height: 40,
        style: LayerStyle(fill: "#ffffff", stroke: "#000000", strokeWidth: 0, opacity: 0.8, visible: false, locked: true)
    )
    layersPanel.configure(with: [mockNode1, mockNode2], selectedId: "N1")
    assert(layersPanel.nodes.count == 2, "7.2 configure updates count to 2")
    assert(layersPanel.nodes[0].name == "Rectangle 1", "7.3 Node 0 name preserved")
    assert(layersPanel.nodes[1].style.locked == true, "7.4 Node 1 style.locked preserved")
    assert(layersPanel.selectedNodeId == "N1", "7.5 selectedNodeId == 'N1'")

    // ============================================================
    // Section 8: WindowController Full AppKit Assembly
    // ============================================================
    print("\n--- [Section 8] WindowController Assembly ---")

    let wc = WindowController()
    assert(wc.studioWindow.contentView === wc.mainContentView, "8.1 studioWindow contentView is mainContentView")
    assert(wc.mainContentView.titleBarView.superview === wc.mainContentView, "8.2 titleBarView is mounted")
    assert(wc.mainContentView.toolRailView.superview === wc.mainContentView, "8.3 toolRailView is mounted")
    assert(wc.mainContentView.canvasViewportView.superview === wc.mainContentView, "8.4 canvasViewportView is mounted")
    assert(wc.mainContentView.inspectorStudioView.superview === wc.mainContentView, "8.5 inspectorStudioView is mounted")

    // Verify Layout Size
    wc.studioWindow.setContentSize(NSSize(width: 1440, height: 900))
    wc.studioWindow.layoutIfNeeded()
    wc.mainContentView.layoutSubtreeIfNeeded()

    assert(wc.mainContentView.frame.width == 1440.0, "8.6 mainContentView frame width == 1440")
    assert(wc.mainContentView.frame.height == 900.0, "8.7 mainContentView frame height == 900")

    // ============================================================
    // Test Summary
    // ============================================================
    print("\n============================================================")
    print(" MILESTONE M4 TEST SUMMARY: \(passed) PASSED, \(failed) FAILED")
    print("============================================================")

    if failed > 0 {
        exit(1)
    }
}

@main
struct M4TestMain {
    static func main() {
        runM4Tests()
    }
}
