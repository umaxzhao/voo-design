//
//  AccessibilityCatalog.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import Foundation

// MARK: - Central Accessibility Identification Catalog

public struct AccessibilityCatalog {
    // MARK: - AppTitleBar (6 identifiers)
    public static let titleBar = "AppTitleBar"
    public static let docTitle = "AppTitleBar.DocTitle"
    public static let zoomIndicator = "AppTitleBar.ZoomIndicator"
    public static let undoButton = "AppTitleBar.UndoButton"
    public static let redoButton = "AppTitleBar.RedoButton"
    public static let exportButton = "AppTitleBar.ExportButton"

    // MARK: - ToolRail (9 identifiers)
    public static let toolRail = "ToolRail"
    public static let toolMove = "ToolRail.Move"
    public static let toolNode = "ToolRail.Node"
    public static let toolPen = "ToolRail.Pen"
    public static let toolShapes = "ToolRail.Shapes"
    public static let toolBrush = "ToolRail.Brush"
    public static let toolEraser = "ToolRail.Eraser"
    public static let toolText = "ToolRail.Text"
    public static let toolArtboard = "ToolRail.Artboard"

    // MARK: - Canvas Viewport & Rulers (3 identifiers)
    public static let canvasViewport = "Canvas.Viewport"
    public static let rulerHorizontal = "Canvas.RulerHorizontal"
    public static let rulerVertical = "Canvas.RulerVertical"

    // MARK: - Inspector Studio (5 identifiers)
    public static let inspectorStudio = "Inspector.Studio"
    public static let layersTree = "Inspector.LayersTree"
    public static let transformPanel = "Inspector.TransformPanel"
    public static let appearancePanel = "Inspector.AppearancePanel"
    public static let colorPicker = "Inspector.ColorPicker"
}
