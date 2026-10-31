//
//  CanvasStageView.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M5.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import CoreImage
import Foundation

// MARK: - Snapping Alignment Result

public struct MagneticGuide: Sendable, Equatable {
    public var start: CGPoint
    public var end: CGPoint
    public init(start: CGPoint, end: CGPoint) {
        self.start = start
        self.end = end
    }
}

public struct SnapResult: Sendable, Equatable {
    public var snapped: Bool
    public var snappedPoint: CGPoint
    public var snappedDelta: CGPoint
    public var snapGuides: [MagneticGuide]

    public init(snapped: Bool = false, snappedPoint: CGPoint, snappedDelta: CGPoint = .zero, snapGuides: [MagneticGuide] = []) {
        self.snapped = snapped
        self.snappedPoint = snappedPoint
        self.snappedDelta = snappedDelta
        self.snapGuides = snapGuides
    }
}

// MARK: - Vector Path Editing Value Types

/// Which Bezier control handle of a pen anchor is being addressed.
public enum PathEditingHandleKind: String, Sendable, Equatable {
    case inHandle
    case outHandle
}

/// Reference to a specific in/out handle knob of a path anchor.
public struct PathEditingHandleRef: Sendable, Equatable {
    public var anchorIndex: Int
    public var kind: PathEditingHandleKind

    public init(anchorIndex: Int, kind: PathEditingHandleKind) {
        self.anchorIndex = anchorIndex
        self.kind = kind
    }
}

// MARK: - Geometric Shape Generators

public final class ShapeGenerators {
    public static func regularPolygonPoints(in box: CGRect, sides: Int = 6) -> [CGPoint] {
        guard sides >= 3 else { return [] }
        let center = CGPoint(x: box.midX, y: box.midY)
        let rx = box.width / 2.0
        let ry = box.height / 2.0
        var points: [CGPoint] = []

        for i in 0..<sides {
            let theta = -CGFloat.pi / 2.0 + (2.0 * CGFloat.pi * CGFloat(i)) / CGFloat(sides)
            let x = center.x + rx * cos(theta)
            let y = center.y + ry * sin(theta)
            points.append(CGPoint(x: x, y: y))
        }
        return points
    }

    public static func starPoints(in box: CGRect, spikes: Int = 5, innerRatio: CGFloat = 0.382) -> [CGPoint] {
        guard spikes >= 3 else { return [] }
        let center = CGPoint(x: box.midX, y: box.midY)
        let rx = box.width / 2.0
        let ry = box.height / 2.0
        let innerRx = rx * innerRatio
        let innerRy = ry * innerRatio
        let totalVertices = spikes * 2
        var points: [CGPoint] = []

        for i in 0..<totalVertices {
            let theta = -CGFloat.pi / 2.0 + (CGFloat.pi * CGFloat(i)) / CGFloat(spikes)
            let isOuter = (i % 2 == 0)
            let currRx = isOuter ? rx : innerRx
            let currRy = isOuter ? ry : innerRy
            let x = center.x + currRx * cos(theta)
            let y = center.y + currRy * sin(theta)
            points.append(CGPoint(x: x, y: y))
        }
        return points
    }

    public static func linePoints(from start: CGPoint, to end: CGPoint) -> [CGPoint] {
        return [start, end]
    }

    public static func arrowPoints(from start: CGPoint, to end: CGPoint, headLength: CGFloat = 16.0, headAngle: CGFloat = .pi / 6.0) -> [CGPoint] {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let len = hypot(dx, dy)
        guard len > 1e-4 else { return [start, end] }

        let ux = dx / len
        let uy = dy / len
        let nx = -uy
        let ny = ux

        let backX = end.x - ux * headLength * cos(headAngle)
        let backY = end.y - uy * headLength * cos(headAngle)
        let wing1 = CGPoint(x: backX + nx * headLength * sin(headAngle),
                            y: backY + ny * headLength * sin(headAngle))
        let wing2 = CGPoint(x: backX - nx * headLength * sin(headAngle),
                            y: backY - ny * headLength * sin(headAngle))

        return [start, end, wing1, wing2]
    }
}

// MARK: - Curve Conversion Engine

public final class CurveConversionEngine {
    public static func convertRectToCubicBezier(node: VOONode) -> VOONode {
        var copy = node
        copy.kind = .path
        let p0 = PenAnchor(x: node.x, y: node.y, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p1 = PenAnchor(x: node.x + node.width, y: node.y, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p2 = PenAnchor(x: node.x + node.width, y: node.y + node.height, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p3 = PenAnchor(x: node.x, y: node.y + node.height, inHandle: nil, outHandle: nil, isClosed: true, type: .sharp)
        copy.points = [p0, p1, p2, p3]
        return copy
    }

    public static func convertEllipseToCubicBezier(node: VOONode) -> VOONode {
        var copy = node
        copy.kind = .path
        let cx = node.x + node.width / 2.0
        let cy = node.y + node.height / 2.0
        let rx = node.width / 2.0
        let ry = node.height / 2.0
        let kappa: CGFloat = 0.5522847498
        let dx = rx * kappa
        let dy = ry * kappa

        let top = PenAnchor(x: cx, y: cy + ry,
                            inHandle: CGPoint(x: cx - dx, y: cy + ry),
                            outHandle: CGPoint(x: cx + dx, y: cy + ry),
                            isClosed: false, type: .smooth)
        let right = PenAnchor(x: cx + rx, y: cy,
                              inHandle: CGPoint(x: cx + rx, y: cy + dy),
                              outHandle: CGPoint(x: cx + rx, y: cy - dy),
                              isClosed: false, type: .smooth)
        let bottom = PenAnchor(x: cx, y: cy - ry,
                               inHandle: CGPoint(x: cx + dx, y: cy - ry),
                               outHandle: CGPoint(x: cx - dx, y: cy - ry),
                               isClosed: false, type: .smooth)
        let left = PenAnchor(x: cx - rx, y: cy,
                             inHandle: CGPoint(x: cx - rx, y: cy - dy),
                             outHandle: CGPoint(x: cx - rx, y: cy + dy),
                             isClosed: true, type: .smooth)

        copy.points = [top, right, bottom, left]
        return copy
    }

    public static func convertTextToCubicBezier(node: VOONode) -> VOONode {
        var copy = node
        copy.kind = .path
        let baselineY = node.y + node.height * 0.25
        let capY = node.y + node.height * 0.85
        let p0 = PenAnchor(x: node.x, y: baselineY, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p1 = PenAnchor(x: node.x + node.width, y: baselineY, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p2 = PenAnchor(x: node.x + node.width, y: capY, inHandle: nil, outHandle: nil, isClosed: false, type: .sharp)
        let p3 = PenAnchor(x: node.x, y: capY, inHandle: nil, outHandle: nil, isClosed: true, type: .sharp)
        copy.points = [p0, p1, p2, p3]
        return copy
    }

    public static func convertToCurves(node: VOONode) -> VOONode {
        switch node.kind {
        case .rect, .frame:
            return convertRectToCubicBezier(node: node)
        case .ellipse:
            return convertEllipseToCubicBezier(node: node)
        case .text:
            return convertTextToCubicBezier(node: node)
        case .path:
            return node
        default:
            return convertRectToCubicBezier(node: node)
        }
    }
}

// MARK: - Canvas Stage View (High Performance Interactive Studio Viewport)

public class CanvasStageView: NSView {
    // Document State
    public var document: VOODocument = VOODocument() {
        didSet {
            cancelCreation()
            // Keep resolving selections alive across in-place document mutations (drag-move,
            // handle resize, host command insertions) but drop ids that left the document.
            let validIds = Set(document.nodes.map { $0.id })
            let survivingIds = selectedNodeIds.intersection(validIds)
            if survivingIds != selectedNodeIds {
                selectedNodeIds = survivingIds
            }
            validatePathEditingTarget()
            handlePaintDocumentChangeIfNeeded()
            updateTransformHandlesTarget()
            syncPathEditingOverlay()
            needsDisplay = true
        }
    }

    public var selectedNodeIds: Set<String> = [] {
        didSet {
            updatePathEditingTargetForSelection()
            updateTransformHandlesTarget()
            syncPathEditingOverlay()
            onSelectionChanged?(selectedNodeIds)
            needsDisplay = true
        }
    }

    public var activeTool: StudioToolType = .move {
        didSet {
            if oldValue != activeTool {
                // Switching tools abandons any half-built shape/artboard/pen preview.
                cancelCreation()
                // A tool switch mid-stroke discards the in-progress paint stroke.
                if isPainting {
                    cancelPaintStroke(restore: true)
                }
            }
            if activeTool != .brush && activeTool != .eraser {
                paintCursorDocPoint = nil
            }
            if activeTool != .node {
                cancelPathEditing()
            } else {
                updatePathEditingTargetForSelection()
            }
            updateCursorForTool()
            updateTransformHandlesTarget()
            syncPathEditingOverlay()
            needsDisplay = true
        }
    }

    // Viewport Navigation
    public var zoom: CGFloat = 1.0 {
        didSet {
            let clamped = min(max(zoom, 0.05), 32.0)
            if zoom != clamped { zoom = clamped }
            horizontalRuler.zoom = zoom
            verticalRuler.zoom = zoom
            transformHandles.zoom = zoom
            creationPreview.zoom = zoom
            pathEditingOverlay.zoom = zoom
            bottomToolsPill.zoomText = "\(Int(round(zoom * 100)))%"
            onZoomChanged?(zoom)
            updateContextualTaskbarPosition()
            needsDisplay = true
        }
    }

    public var panOffset: CGPoint = .zero {
        didSet {
            horizontalRuler.panOffset = panOffset.x
            verticalRuler.panOffset = panOffset.y
            creationPreview.panOffset = panOffset
            transformHandles.panOffset = panOffset
            pathEditingOverlay.panOffset = panOffset
            updateContextualTaskbarPosition()
            needsDisplay = true
        }
    }

    // Callbacks
    public var onSelectionChanged: ((Set<String>) -> Void)?
    public var onNodeTransformed: ((VOONode) -> Void)?
    public var onZoomChanged: ((CGFloat) -> Void)?
    public var onCursorMoved: ((CGPoint) -> Void)?

    // MARK: - Canvas Creation Tool Hooks (host wires these into CommandManager for undo)

    /// Invoked when a canvas tool has constructed a new node (shapes / artboard / pen).
    /// The host is responsible for inserting the node through `CommandManager`; this view
    /// never mutates `document` itself.
    public var onCreateNode: ((VOONode) -> Void)?
    /// Invoked by the .text tool on a single click; the host creates the text node + editing overlay.
    public var onRequestTextInsertion: ((CGPoint) -> Void)?
    /// Invoked when an existing .text node is double-clicked with the .move tool.
    public var onEditTextNode: ((VOONode) -> Void)?
    /// Invoked after a pen path node is completed (also delivered through `onCreateNode`).
    public var onPenPathCreated: ((VOONode) -> Void)?
    /// Optional toast/debug hook receiving a short identifier for each completed canvas tool action.
    public var onToolActionCompleted: ((String) -> Void)?

    // MARK: - Undoable Transform + Context Menu Hooks

    /// Fired once per completed move gesture with the before/after rects of every
    /// selected layer, so the host can record a single undoable command.
    public var onMoveCommitted: (([String: CGRect], [String: CGRect]) -> Void)?
    /// Fired once per completed resize / rotate gesture through the 8-point handles.
    public var onHandleTransformCommitted: ((_ nodeId: String,
                                            _ before: CGRect, _ beforeRotation: CGFloat,
                                            _ after: CGRect, _ afterRotation: CGFloat) -> Void)?
    /// Host-provided right-click menu (document-space hit point). Selection is
    /// updated before the provider runs.
    public var contextMenuProvider: ((CGPoint) -> NSMenu?)?

    // MARK: - Vector Node Editing Hooks (node tool)

    /// Fired once per completed anchor / handle drag or structural anchor edit
    /// (type toggle, anchor deletion) with the anchor snapshot before and after.
    public var onPathPointsCommitted: ((_ nodeId: String, _ before: [PenAnchor], _ after: [PenAnchor]) -> Void)?
    /// Index of the anchor currently selected by the node tool (nil when none).
    public private(set) var selectedAnchorIndex: Int?

    // MARK: - Multi-Selection Transform Commit

    /// Fired once per completed transform of a 2+ node selection so the host can
    /// record a single undoable command.
    public var onSelectionTransformCommitted: (([String: CGRect], [String: CGRect],
                                               [String: CGFloat], [String: CGFloat]) -> Void)?

    // MARK: - Image Drag & Drop Hook

    /// Files dropped on the canvas (URLs) together with the document-space drop point.
    public var onDropFiles: (([URL], CGPoint) -> Void)?

    // MARK: - Freehand Painting Hooks (brush / eraser)

    /// Fired exactly once per completed brush/eraser stroke with the PNG data URL of the
    /// in-memory paint layer. The host creates/updates the Paint image node (undoable);
    /// this view never mutates `document`.
    public var onPaintStrokeCommitted: ((_ nodeId: String?, _ dataURL: String) -> Void)?
    /// Id of the document node that persists the paint layer (hydrated via `setPaintNode`).
    public private(set) var paintNodeId: String?
    /// True while a brush/eraser stroke is being dragged.
    public private(set) var isPainting: Bool = false

    /// Brush ink colour (hex). Default mint, mirrors the VOO editor accent.
    public var brushColorHex: String = "#b2ffd6"
    /// Brush dab diameter in document points.
    public var brushDiameter: CGFloat = 24
    /// Eraser dab diameter in document points.
    public var eraserDiameter: CGFloat = 32

    /// Toggle the design grid overlay (web grid toggle in the zoom cluster).
    public var showGrid: Bool = false {
        didSet { if oldValue != showGrid { needsDisplay = true } }
    }

    /// Toggle magnetic snapping while dragging layers.
    public var isSnappingEnabled: Bool = true

    // MARK: - Selection Modes (marquee / lasso / magic wand) + hand tool

    public enum CanvasSelectionStyle: String, Sendable, CaseIterable {
        case marquee
        case lasso
        case wand
    }

    public var selectionStyle: CanvasSelectionStyle = .marquee {
        didSet {
            if oldValue != selectionStyle {
                isLassoSelecting = false
                lassoPoints.removeAll()
                updateCursorForTool()
                needsDisplay = true
            }
        }
    }

    // MARK: - M1 Sub-tool Selections & Contextual Taskbar
    public var activeShapeSubTool: ShapeSubTool = .rect
    public var activePenSubTool: PenSubTool = .pen
    public var activeSelectionSubTool: SelectionSubTool = .marqueeRect {
        didSet {
            switch activeSelectionSubTool {
            case .marqueeRect: selectionStyle = .marquee
            case .lassoFree: selectionStyle = .lasso
            }
        }
    }

    public private(set) var isDrawingPencil: Bool = false
    private var pencilPoints: [CGPoint] = []

    public let contextualTaskbar = ContextualTaskbarView()

    /// When enabled, dragging the canvas pans it regardless of the active tool
    /// (the hand tool in the VOO web tool rail).
    public var panModeEnabled: Bool = false {
        didSet {
            if oldValue != panModeEnabled {
                isPanningWithHand = false
                updateCursorForTool()
            }
        }
    }

    private var isPanningWithHand = false
    private var isLassoSelecting = false
    private var lassoPoints: [CGPoint] = []
    private var lassoAdditive = false

    // MARK: - Public Creation State (read-only for tests & host chrome)

    /// True while a .shapes / .artboard drag preview is in flight.
    public private(set) var isCreatingShape: Bool = false
    /// Number of anchors currently placed by the .pen tool (0 when no path is in progress).
    public private(set) var penAnchorCount: Int = 0

    /// Transparent overlay that renders the dashed mint creation previews (never hit-tested).
    public let creationPreview = CanvasCreationPreviewView()
    /// Transparent overlay that renders vector anchors / Bezier handles for the node tool.
    public let pathEditingOverlay = PathEditingOverlayView()

    /// True while the node tool is editing the anchors of a selected path.
    public var isPathEditing: Bool { pathEditingNodeId != nil }

    public var showRulers: Bool = false {
        didSet {
            horizontalRuler.isHidden = !showRulers
            verticalRuler.isHidden = !showRulers
            creationPreview.showsRulers = showRulers
            transformHandles.rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0
            pathEditingOverlay.rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0
            needsDisplay = true
        }
    }

    // Subviews
    public let horizontalRuler = CanvasRulerView(orientation: .horizontal)
    public let verticalRuler = CanvasRulerView(orientation: .vertical)
    public let transformHandles = TransformHandlesView()
    public let bottomToolsPill = FloatingBottomToolsView()

    // Public Actions forwarding
    public var onUndoRequested: (() -> Void)?
    public var onRedoRequested: (() -> Void)?

    // Interactive Drag Tracking
    private var isPanningWithSpace: Bool = false
    private var isSpaceKeyDown: Bool = false
    private var panDragStartMouse: CGPoint = .zero
    private var panDragStartOffset: CGPoint = .zero

    private var isDraggingNode: Bool = false
    private var nodeDragStartMouse: CGPoint = .zero
    private var nodeInitialRect: CGRect = .zero
    private var dragInitialRects: [String: CGRect] = [:]
    private var handleInitialRect: CGRect = .zero
    private var handleInitialRotation: CGFloat = 0

    private var isMarqueeSelecting: Bool = false
    private var marqueeStart: CGPoint = .zero
    private var currentMarqueeRect: CGRect = .zero

    // Active Magnetic Snapping Guides
    private var activeMagneticGuides: [MagneticGuide] = []

    // MARK: - Creation Gesture State
    private var shapeCreationTool: StudioToolType = .shapes
    private var shapeStartPoint: CGPoint = .zero
    private var shapeCurrentRect: CGRect = .zero
    private var shapeConstrainSquare: Bool = false
    private var shapeWantsEllipse: Bool = false

    private var penAnchors: [PenAnchor] = []
    private var penDraggingAnchorIndex: Int?
    private var penPreviewPoint: CGPoint?
    private var penHoveringFirstAnchor: Bool = false

    // MARK: - Node Tool Path Editing State
    private var pathEditingNodeId: String?
    private var pathEditDrag: PathEditDrag?
    private var pathEditBeforePoints: [PenAnchor]?
    private var pathEditDragStartDoc: CGPoint = .zero
    private var hoveredPathAnchorIndex: Int?
    private var hoveredPathHandle: PathEditingHandleRef?

    private enum PathEditDrag {
        case anchor(index: Int)
        case handle(index: Int, kind: PathEditingHandleKind)
    }

    // MARK: - Multi-Selection Handle Transform State
    private var selectionBeforeRects: [String: CGRect] = [:]
    private var selectionBeforeRotations: [String: CGFloat] = [:]
    private var appliedMultiRotationDelta: CGFloat = 0

    // MARK: - Freehand Painting State
    /// In-memory RGBA paint layer, lazily sized to the document canvas.
    private var paintBitmap: NSBitmapImageRep?
    /// NSGraphicsContext wrapping `paintBitmap` (y-up document space, origin bottom-left).
    private var paintGraphicsContext: NSGraphicsContext?
    /// Canvas size (document points) the bitmap was created for.
    private var paintBitmapDocSize: CGSize = .zero
    /// Document points -> bitmap pixels scale (1.0 unless the canvas exceeds the cap).
    private var paintBitmapScale: CGFloat = 1.0
    /// Cached CGImage of the paint bitmap (nil forces regeneration after edits).
    private var paintCGImage: CGImage?
    /// Pixel backup captured at stroke start, used to discard on Escape.
    private var paintStrokeBackup: Data?
    /// Last stamped document point (spacing interpolation anchor).
    private var lastPaintDocPoint: CGPoint?
    /// Pointer position for the brush/eraser diameter cursor ring.
    private var paintCursorDocPoint: CGPoint?
    /// Hard cap on the paint layer bitmap dimensions.
    private let paintBitmapMaxDimension: CGFloat = 4096
    /// Document id the current paint layer belongs to (drop stale layers on document swap).
    private var paintLayerDocumentId: String?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupStage()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupStage()
    }

    private func setupStage() {
        wantsLayer = false
        setAccessibilityIdentifier(AccessibilityCatalog.canvasViewport)
        setAccessibilityRole(.group)
        setAccessibilityLabel("Canvas Stage Viewport")

        // Add subviews
        horizontalRuler.translatesAutoresizingMaskIntoConstraints = false
        verticalRuler.translatesAutoresizingMaskIntoConstraints = false
        transformHandles.translatesAutoresizingMaskIntoConstraints = false

        horizontalRuler.isHidden = !showRulers
        verticalRuler.isHidden = !showRulers

        // Creation preview overlay sits at the very bottom of the subview stack (above the
        // stage background / nodes, below rulers and the floating tools pill).
        creationPreview.translatesAutoresizingMaskIntoConstraints = false
        creationPreview.showsRulers = showRulers
        creationPreview.zoom = zoom
        creationPreview.panOffset = panOffset
        addSubview(creationPreview)

        // Node-tool vector overlay (anchors / bezier handles), also never hit-tested.
        pathEditingOverlay.translatesAutoresizingMaskIntoConstraints = false
        pathEditingOverlay.zoom = zoom
        pathEditingOverlay.panOffset = panOffset
        pathEditingOverlay.rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0
        addSubview(pathEditingOverlay)

        addSubview(horizontalRuler)
        addSubview(verticalRuler)
        addSubview(transformHandles)

        let thickness = ThemeTokens.rulerTrackThickness
        transformHandles.contentInset = thickness
        transformHandles.rulerOffset = showRulers ? thickness : 0
        transformHandles.panOffset = panOffset

        NSLayoutConstraint.activate([
            creationPreview.topAnchor.constraint(equalTo: topAnchor),
            creationPreview.leadingAnchor.constraint(equalTo: leadingAnchor),
            creationPreview.trailingAnchor.constraint(equalTo: trailingAnchor),
            creationPreview.bottomAnchor.constraint(equalTo: bottomAnchor),

            pathEditingOverlay.topAnchor.constraint(equalTo: topAnchor),
            pathEditingOverlay.leadingAnchor.constraint(equalTo: leadingAnchor),
            pathEditingOverlay.trailingAnchor.constraint(equalTo: trailingAnchor),
            pathEditingOverlay.bottomAnchor.constraint(equalTo: bottomAnchor),

            // Horizontal Ruler (Top)
            horizontalRuler.topAnchor.constraint(equalTo: topAnchor),
            horizontalRuler.leadingAnchor.constraint(equalTo: leadingAnchor, constant: thickness),
            horizontalRuler.trailingAnchor.constraint(equalTo: trailingAnchor),
            horizontalRuler.heightAnchor.constraint(equalToConstant: thickness),

            // Vertical Ruler (Left)
            verticalRuler.topAnchor.constraint(equalTo: topAnchor, constant: thickness),
            verticalRuler.leadingAnchor.constraint(equalTo: leadingAnchor),
            verticalRuler.bottomAnchor.constraint(equalTo: bottomAnchor),
            verticalRuler.widthAnchor.constraint(equalToConstant: thickness),

            // Transform Handles Overlay (inset by the ruler track on all sides so the
            // rulerOffset/contentInset conversion in viewRect lands on the canvas)
            transformHandles.topAnchor.constraint(equalTo: topAnchor, constant: thickness),
            transformHandles.leadingAnchor.constraint(equalTo: leadingAnchor, constant: thickness),
            transformHandles.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -thickness),
            transformHandles.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -thickness)
        ])

        // Add Floating Contextual Taskbar
        contextualTaskbar.isHidden = true
        addSubview(contextualTaskbar)

        // Add Floating Bottom Tools Pill
        bottomToolsPill.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bottomToolsPill)
        NSLayoutConstraint.activate([
            bottomToolsPill.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -16),
            bottomToolsPill.centerXAnchor.constraint(equalTo: centerXAnchor),
            bottomToolsPill.widthAnchor.constraint(equalToConstant: 200),
            bottomToolsPill.heightAnchor.constraint(equalToConstant: 34)
        ])

        bottomToolsPill.onUndo = { [weak self] in self?.onUndoRequested?() }
        bottomToolsPill.onRedo = { [weak self] in self?.onRedoRequested?() }
        bottomToolsPill.onZoomIn = { [weak self] in self?.zoomIn() }
        bottomToolsPill.onZoomOut = { [weak self] in self?.zoomOut() }
        bottomToolsPill.onZoomFit = { [weak self] in self?.zoomFit() }
        bottomToolsPill.onToggleGrid = { [weak self] in
            guard let self = self else { return }
            self.showRulers.toggle()
        }

        // Wire ruler guide line creation
        horizontalRuler.onGuideCreated = { [weak self] axis, pos in
            self?.addGuide(axis: axis, position: pos)
        }
        verticalRuler.onGuideCreated = { [weak self] axis, pos in
            self?.addGuide(axis: axis, position: pos)
        }

        // Wire transform handles update
        transformHandles.onTransformChange = { [weak self] newRect, newRot in
            self?.applyHandleTransform(newRect: newRect, newRotation: newRot)
        }

        // Tracking area for mouse motion & cursor projections
        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeInKeyWindow, .mouseMoved, .mouseEnteredAndExited, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)

        // Image import: accept files dropped anywhere on the canvas.
        registerForDraggedTypes([.fileURL])
    }

    // MARK: - Coordinate Transformations

    public func documentPoint(from viewPoint: CGPoint) -> CGPoint {
        let rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0.0
        let originX = rulerOffset + panOffset.x
        let originY = rulerOffset + panOffset.y
        let docX = (viewPoint.x - originX) / zoom
        let docY = (viewPoint.y - originY) / zoom
        return CGPoint(x: docX, y: docY)
    }

    public func viewPoint(from documentPoint: CGPoint) -> CGPoint {
        let rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0.0
        let originX = rulerOffset + panOffset.x
        let originY = rulerOffset + panOffset.y
        let vx = documentPoint.x * zoom + originX
        let vy = documentPoint.y * zoom + originY
        return CGPoint(x: vx, y: vy)
    }

    public func viewRect(from docRect: CGRect) -> CGRect {
        let p0 = viewPoint(from: CGPoint(x: docRect.minX, y: docRect.minY))
        let p1 = viewPoint(from: CGPoint(x: docRect.maxX, y: docRect.maxY))
        return CGRect(x: min(p0.x, p1.x), y: min(p0.y, p1.y), width: abs(p1.x - p0.x), height: abs(p1.y - p0.y))
    }

    public func updateContextualTaskbarPosition() {
        if activeTool == .node, let nodeId = pathEditingNodeId,
           let node = document.nodes.first(where: { $0.id == nodeId }) {
            contextualTaskbar.isHidden = false
            contextualTaskbar.update(selectedNodes: [node], isPathEditing: true)
            let docRect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            let vRect = viewRect(from: docRect)
            let taskbarSize = contextualTaskbar.intrinsicContentSize
            let bottomLimit: CGFloat = (showRulers ? ThemeTokens.rulerTrackThickness : 0.0) + 44.0
            let (frame, _) = ContextualTaskbarGeometry.calculateTaskbarFrame(
                selectionViewRect: vRect,
                taskbarSize: taskbarSize,
                stageBounds: bounds,
                bottomLimit: bottomLimit,
                margin: 10.0
            )
            contextualTaskbar.frame = frame
            return
        }

        let selectedNodes = selectedNodeIds.compactMap { id in
            document.nodes.first(where: { $0.id == id })
        }

        guard !selectedNodes.isEmpty else {
            contextualTaskbar.isHidden = true
            return
        }

        contextualTaskbar.isHidden = false
        contextualTaskbar.update(selectedNodes: selectedNodes, isPathEditing: false)

        let vRect: CGRect
        if selectedNodes.count == 1, let first = selectedNodes.first {
            let docRect = CGRect(x: first.x, y: first.y, width: first.width, height: first.height)
            vRect = viewRect(from: docRect)
        } else {
            var union = CGRect(x: selectedNodes[0].x, y: selectedNodes[0].y, width: selectedNodes[0].width, height: selectedNodes[0].height)
            for node in selectedNodes.dropFirst() {
                union = union.union(CGRect(x: node.x, y: node.y, width: node.width, height: node.height))
            }
            vRect = viewRect(from: union)
        }

        let taskbarSize = contextualTaskbar.intrinsicContentSize
        let bottomLimit: CGFloat = (showRulers ? ThemeTokens.rulerTrackThickness : 0.0) + 44.0
        let (frame, _) = ContextualTaskbarGeometry.calculateTaskbarFrame(
            selectionViewRect: vRect,
            taskbarSize: taskbarSize,
            stageBounds: bounds,
            bottomLimit: bottomLimit,
            margin: 10.0
        )
        contextualTaskbar.frame = frame
    }

    public override func layout() {
        super.layout()
        updateContextualTaskbarPosition()
    }

    // MARK: - Zoom Navigation Commands

    public func zoomIn() {
        zoom = zoom * 1.25
    }

    public func zoomOut() {
        zoom = zoom / 1.25
    }

    public func zoomActual() {
        zoom = 1.0
    }

    public func zoomFit() {
        let canvas = document.canvas
        let availW = bounds.width - (showRulers ? ThemeTokens.rulerTrackThickness : 0) - 80.0
        let availH = bounds.height - (showRulers ? ThemeTokens.rulerTrackThickness : 0) - 80.0
        guard availW > 0, availH > 0 else { return }

        let scaleX = availW / max(100.0, canvas.width)
        let scaleY = availH / max(100.0, canvas.height)
        zoom = min(scaleX, scaleY)

        let centerX = (availW - canvas.width * zoom) / 2.0 + 40.0
        let centerY = (availH - canvas.height * zoom) / 2.0 + 40.0
        panOffset = CGPoint(x: centerX, y: centerY)
    }

    public func zoomReset() {
        zoomActual()
    }

    public func zoomToFit() {
        zoomFit()
    }

    public func zoomToFitRect(_ targetRect: CGRect) {
        let availW = bounds.width - (showRulers ? ThemeTokens.rulerTrackThickness : 0) - 80.0
        let availH = bounds.height - (showRulers ? ThemeTokens.rulerTrackThickness : 0) - 80.0
        guard availW > 0, availH > 0, targetRect.width > 0, targetRect.height > 0 else { return }

        let scaleX = availW / max(100.0, targetRect.width)
        let scaleY = availH / max(100.0, targetRect.height)
        zoom = min(scaleX, scaleY, 2.0)

        let rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0
        let centerX = rulerOffset + (availW - targetRect.width * zoom) / 2.0 + 40.0 - targetRect.origin.x * zoom
        let centerY = rulerOffset + (availH - targetRect.height * zoom) / 2.0 + 40.0 - targetRect.origin.y * zoom
        panOffset = CGPoint(x: centerX, y: centerY)
        updateTransformHandlesTarget()
        needsDisplay = true
    }

    // MARK: - Node Selection & Hit Testing

    public func selectNode(id: String) {
        selectedNodeIds = [id]
        updateTransformHandlesTarget()
        needsDisplay = true
    }

    public func focusOnNode(id: String) {
        guard let node = document.nodes.first(where: { $0.id == id }) else { return }
        selectNode(id: id)
        let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
        zoomToFitRect(rect)
    }

    public func clearSelection() {
        selectedNodeIds.removeAll()
        updateTransformHandlesTarget()
        needsDisplay = true
    }

    public func hitTestNode(at docPt: CGPoint) -> VOONode? {
        for node in document.nodes.reversed() where node.style.visible && !node.style.locked {
            let r = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            if r.contains(docPt) {
                return node
            }
        }
        return nil
    }

    // MARK: - Guide Line Management

    public func addGuide(axis: String, position: CGFloat) {
        let guide = GuideLine(axis: axis, position: position)
        if document.guides == nil {
            document.guides = []
        }
        document.guides?.append(guide)
        needsDisplay = true
    }

    // MARK: - Drawing Stage Content

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // 1. Stage Background (Neutral studio grey #4a4a4d)
        ctx.setFillColor(ThemeTokens.colorStageStudio.cgColor)
        ctx.fill(bounds)

        let rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0.0
        let originX = rulerOffset + panOffset.x
        let originY = rulerOffset + panOffset.y

        ctx.saveGState()
        // Clip to viewport area excluding rulers when visible
        if showRulers {
            let clipRect = CGRect(
                x: ThemeTokens.rulerTrackThickness,
                y: ThemeTokens.rulerTrackThickness,
                width: bounds.width - ThemeTokens.rulerTrackThickness,
                height: bounds.height - ThemeTokens.rulerTrackThickness
            )
            ctx.clip(to: clipRect)
        }

        // Apply document world transformation
        ctx.translateBy(x: originX, y: originY)
        ctx.scaleBy(x: zoom, y: zoom)

        // 1.5 Optional design grid (web zoom-cluster grid toggle)
        if showGrid {
            let step: CGFloat = 20.0
            ctx.saveGState()
            ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.10).cgColor)
            ctx.setLineWidth(1.0 / zoom)
            var gx = floor(document.canvas.x / step) * step
            while gx <= document.canvas.x + document.canvas.width {
                ctx.move(to: CGPoint(x: gx, y: document.canvas.y))
                ctx.addLine(to: CGPoint(x: gx, y: document.canvas.y + document.canvas.height))
                gx += step
            }
            var gy = floor(document.canvas.y / step) * step
            while gy <= document.canvas.y + document.canvas.height {
                ctx.move(to: CGPoint(x: document.canvas.x, y: gy))
                ctx.addLine(to: CGPoint(x: document.canvas.x + document.canvas.width, y: gy))
                gy += step
            }
            ctx.strokePath()
            ctx.restoreGState()
        }

        // 2. Draw Canvas Document Stage Frame (Artboard / Page)
        if !document.nodes.isEmpty || (document.title != "Untitled" && document.canvas.width > 0) {
            let canvas = document.canvas
            let pageRect = CGRect(x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height)
            ctx.setFillColor(ThemeTokens.colorArtboard.cgColor)
            ctx.fill(pageRect)
            ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
            ctx.setLineWidth(1.0 / zoom)
            ctx.stroke(pageRect)

            // Top-left Title Badge: 12px frame glyph + 4px gap + 11px title + 4px gap +
            // 10px chevron, offset 8px above the artboard edge, all in mint.
            var artboardTitle = document.title
            if artboardTitle.lowercased().hasSuffix(".voo") {
                artboardTitle = String(artboardTitle.dropLast(4))
            }
            let badgeY = pageRect.origin.y + pageRect.height + 8 / zoom
            let glyphSize = 12.0 / zoom
            let glyphRect = CGRect(x: pageRect.origin.x, y: badgeY + 1.0 / zoom, width: glyphSize, height: glyphSize)
            VooIconFactory.drawFrame(in: glyphRect, color: ThemeTokens.colorMint, strokeWidth: 1.5 / zoom)

            let badgeAttrs: [NSAttributedString.Key: Any] = [
                .font: ThemeFonts.mono(size: 11 / zoom, weight: .medium),
                .foregroundColor: ThemeTokens.colorMint
            ]
            let titleX = pageRect.origin.x + glyphSize + 4.0 / zoom
            (artboardTitle as NSString).draw(at: CGPoint(x: titleX, y: badgeY), withAttributes: badgeAttrs)
            let badgeTextWidth = (artboardTitle as NSString).size(withAttributes: badgeAttrs).width
            let chevronRect = CGRect(
                x: titleX + badgeTextWidth + 4.0 / zoom,
                y: badgeY + 1.0 / zoom,
                width: 10.0 / zoom,
                height: 10.0 / zoom
            )
            VooIconFactory.drawChevronDown(in: chevronRect, color: ThemeTokens.colorMint, strokeWidth: 1.6 / zoom)

            // White Pill Handles on left and right borders
            let handleWidth: CGFloat = 4.0 / zoom
            let handleHeight: CGFloat = 18.0 / zoom
            let handleRadius: CGFloat = 2.0 / zoom
            let leftHandle = CGRect(x: pageRect.origin.x - handleWidth / 2.0, y: pageRect.midY - handleHeight / 2.0, width: handleWidth, height: handleHeight)
            let rightHandle = CGRect(x: pageRect.maxX - handleWidth / 2.0, y: pageRect.midY - handleHeight / 2.0, width: handleWidth, height: handleHeight)

            ctx.setFillColor(NSColor.white.cgColor)
            let lhPath = CGPath(roundedRect: leftHandle, cornerWidth: handleRadius, cornerHeight: handleRadius, transform: nil)
            let rhPath = CGPath(roundedRect: rightHandle, cornerWidth: handleRadius, cornerHeight: handleRadius, transform: nil)
            ctx.addPath(lhPath)
            ctx.addPath(rhPath)
            ctx.fillPath()

            // Floating dimension badge below artboard: h18, radius 9, 10px mono,
            // 8px horizontal padding.
            let dimText = "\(Int(canvas.width))×\(Int(canvas.height))"
            let dimAttrs: [NSAttributedString.Key: Any] = [
                .font: ThemeFonts.monoDigit(size: 10 / zoom, weight: .regular),
                .foregroundColor: NSColor(white: 0.65, alpha: 1.0)
            ]
            let dimSize = (dimText as NSString).size(withAttributes: dimAttrs)
            let dimBadgeRect = CGRect(x: pageRect.midX - (dimSize.width + 16 / zoom) / 2.0, y: pageRect.origin.y - 24 / zoom, width: dimSize.width + 16 / zoom, height: 18 / zoom)
            let dimPath = CGPath(roundedRect: dimBadgeRect, cornerWidth: 9 / zoom, cornerHeight: 9 / zoom, transform: nil)
            ctx.setFillColor(NSColor(red: 0.10, green: 0.10, blue: 0.11, alpha: 0.90).cgColor)
            ctx.addPath(dimPath)
            ctx.fillPath()
            (dimText as NSString).draw(
                at: CGPoint(
                    x: dimBadgeRect.origin.x + 8 / zoom,
                    y: dimBadgeRect.origin.y + (18.0 / zoom - dimSize.height) / 2.0
                ),
                withAttributes: dimAttrs
            )

            // Floating circular "+" button on the right: 28x28, 16px from the page
            // edge, 14px plus glyph, white/12 border.
            let addBtnRect = CGRect(x: pageRect.maxX + 16 / zoom, y: pageRect.midY - 14 / zoom, width: 28 / zoom, height: 28 / zoom)
            ctx.setFillColor(NSColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 0.90).cgColor)
            ctx.fillEllipse(in: addBtnRect)
            ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
            ctx.strokeEllipse(in: addBtnRect)
            let plusRect = CGRect(
                x: addBtnRect.midX - 7.0 / zoom,
                y: addBtnRect.midY - 7.0 / zoom,
                width: 14.0 / zoom,
                height: 14.0 / zoom
            )
            VooIconFactory.drawPlus(in: plusRect, color: NSColor(white: 0.85, alpha: 1.0), strokeWidth: 1.5 / zoom)
        }

        // 2.9 Draw child Artboard frame titles and badges
        for frameNode in document.nodes where frameNode.kind == .frame && frameNode.style.visible {
            let fRect = CGRect(x: frameNode.x, y: frameNode.y, width: frameNode.width, height: frameNode.height)
            let isSelected = selectedNodeIds.contains(frameNode.id)
            let badgeColor = isSelected ? ThemeTokens.colorMint : NSColor(white: 0.65, alpha: 1.0)
            let badgeY = fRect.origin.y + fRect.height + 6 / zoom
            let glyphSize = 12.0 / zoom
            let glyphRect = CGRect(x: fRect.origin.x, y: badgeY + 1.0 / zoom, width: glyphSize, height: glyphSize)
            VooIconFactory.drawFrame(in: glyphRect, color: badgeColor, strokeWidth: 1.5 / zoom)

            let badgeAttrs: [NSAttributedString.Key: Any] = [
                .font: ThemeFonts.mono(size: 11 / zoom, weight: .medium),
                .foregroundColor: badgeColor
            ]
            let titleX = fRect.origin.x + glyphSize + 4.0 / zoom
            (frameNode.name as NSString).draw(at: CGPoint(x: titleX, y: badgeY), withAttributes: badgeAttrs)
        }

        // 3. Draw Document Nodes (Bottom to Top). The persisted paint layer is
        // rendered from the in-memory bitmap above, so skip its image node here
        // to avoid double compositing.
        for node in document.nodes where node.style.visible {
            if node.kind == .image, node.id == paintNodeId { continue }
            drawNode(node, in: ctx)
        }

        // 3.5 Freehand paint layer (brush / eraser): lives inside the canvas rect,
        // above the artboard content and below selection chrome.
        if let paintImage = paintDisplayImage() {
            let canvas = document.canvas
            ctx.saveGState()
            ctx.interpolationQuality = .high
            ctx.draw(paintImage, in: CGRect(x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height))
            ctx.restoreGState()
        }

        // 3.9 Draw the in-progress lasso outline (mint dashed)
        if isLassoSelecting, lassoPoints.count > 1 {
            ctx.saveGState()
            ctx.setStrokeColor(NSColor(hex: ThemeTokens.accentSelection).cgColor)
            ctx.setLineWidth(1.2 / zoom)
            ctx.setLineDash(phase: 0, lengths: [5 / zoom, 4 / zoom])
            ctx.beginPath()
            ctx.move(to: lassoPoints[0])
            for point in lassoPoints.dropFirst() { ctx.addLine(to: point) }
            ctx.strokePath()
            ctx.restoreGState()
        }

        // 4. Draw Persistent Ruler Guide Lines (Cyan #00c8ff) only when rulers are active
        if showRulers, let guides = document.guides {
            ctx.setStrokeColor(NSColor(red: 0.0, green: 0.78, blue: 1.0, alpha: 0.70).cgColor)
            ctx.setLineWidth(1.0 / zoom)
            for g in guides {
                if g.axis == "v" {
                    ctx.strokeLineSegments(between: [CGPoint(x: g.position, y: -10000), CGPoint(x: g.position, y: 10000)])
                } else {
                    ctx.strokeLineSegments(between: [CGPoint(x: -10000, y: g.position), CGPoint(x: 10000, y: g.position)])
                }
            }
        }

        // 5. Draw Magnetic Alignment Snapping Lines (Mint #b2ffd6)
        if !activeMagneticGuides.isEmpty {
            ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
            ctx.setLineWidth(1.0 / zoom)
            for g in activeMagneticGuides {
                ctx.strokeLineSegments(between: [g.start, g.end])
            }
        }

        // 6. Draw Marquee Selection Box
        if isMarqueeSelecting && currentMarqueeRect.width > 1 && currentMarqueeRect.height > 1 {
            ctx.setFillColor(NSColor(red: 0.70, green: 1.00, blue: 0.84, alpha: 0.15).cgColor)
            ctx.fill(currentMarqueeRect)
            ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
            ctx.setLineWidth(1.0 / zoom)
            ctx.stroke(currentMarqueeRect)
        }

        // 6.5 Brush / eraser cursor ring at the pointer (diameter * zoom in view space).
        if let pointer = paintCursorDocPoint, activeTool == .brush || activeTool == .eraser {
            let diameter = max(activeTool == .eraser ? eraserDiameter : brushDiameter, 1.0)
            let ringRect = CGRect(
                x: pointer.x - diameter / 2.0,
                y: pointer.y - diameter / 2.0,
                width: diameter,
                height: diameter
            )
            ctx.saveGState()
            ctx.setLineWidth(1.5 / zoom)
            ctx.setStrokeColor(NSColor.black.withAlphaComponent(0.55).cgColor)
            ctx.strokeEllipse(in: ringRect.insetBy(dx: -0.25 / zoom, dy: -0.25 / zoom))
            ctx.setLineWidth(1.0 / zoom)
            ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.9).cgColor)
            ctx.strokeEllipse(in: ringRect)
            ctx.restoreGState()
        }

        // 6.6 Freehand Pencil Live Drawing Preview
        if isDrawingPencil && pencilPoints.count >= 2 {
            ctx.saveGState()
            ctx.setStrokeColor(NSColor.white.cgColor)
            ctx.setLineWidth(2.0 / zoom)
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            ctx.beginPath()
            ctx.move(to: pencilPoints[0])
            for pt in pencilPoints.dropFirst() {
                ctx.addLine(to: pt)
            }
            ctx.strokePath()
            ctx.restoreGState()
        }

        ctx.restoreGState()

        // 7. Corner Ruler Origin Junction Square (Top-Left 18x18) when rulers active
        if showRulers {
            let cornerRect = CGRect(x: 0, y: 0, width: ThemeTokens.rulerTrackThickness, height: ThemeTokens.rulerTrackThickness)
            ctx.setFillColor(ThemeTokens.colorPanel.cgColor)
            ctx.fill(cornerRect)
            ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
            ctx.stroke(cornerRect)
        }
    }

    // MARK: - M2 Inspector Studio Rendering Pipeline

    public static func pathWithCornerRadii(rect: CGRect, radii: CornerRadii) -> CGPath {
        let path = CGMutablePath()
        let clamped = radii.clamped(forWidth: rect.width, height: rect.height)
        let minX = rect.minX
        let maxX = rect.maxX
        let minY = rect.minY
        let maxY = rect.maxY

        path.move(to: CGPoint(x: minX + clamped.tl, y: minY))
        path.addLine(to: CGPoint(x: maxX - clamped.tr, y: minY))
        path.addArc(tangent1End: CGPoint(x: maxX, y: minY),
                    tangent2End: CGPoint(x: maxX, y: maxY),
                    radius: clamped.tr)
        path.addLine(to: CGPoint(x: maxX, y: maxY - clamped.br))
        path.addArc(tangent1End: CGPoint(x: maxX, y: maxY),
                    tangent2End: CGPoint(x: minX, y: maxY),
                    radius: clamped.br)
        path.addLine(to: CGPoint(x: minX + clamped.bl, y: maxY))
        path.addArc(tangent1End: CGPoint(x: minX, y: maxY),
                    tangent2End: CGPoint(x: minX, y: minY),
                    radius: clamped.bl)
        path.addLine(to: CGPoint(x: minX, y: minY + clamped.tl))
        path.addArc(tangent1End: CGPoint(x: minX, y: minY),
                    tangent2End: CGPoint(x: maxX, y: minY),
                    radius: clamped.tl)
        path.closeSubpath()
        return path
    }

    public static func shapePath(for node: VOONode, in rect: CGRect) -> CGPath {
        switch node.kind {
        case .rect, .frame:
            if let radii = node.cornerRadii, (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0) {
                return pathWithCornerRadii(rect: rect, radii: radii)
            } else {
                let p = CGMutablePath()
                p.addRect(rect)
                return p
            }
        case .ellipse:
            let p = CGMutablePath()
            p.addEllipse(in: rect)
            return p
        case .path:
            return CanvasCreationPreviewView.bezierPath(from: node.points ?? [], closed: node.points?.last?.isClosed ?? false)
        default:
            let p = CGMutablePath()
            p.addRect(rect)
            return p
        }
    }

    public struct ParsedGradientStop {
        public var color: NSColor
        public var location: CGFloat
        public init(color: NSColor, location: CGFloat) {
            self.color = color
            self.location = location
        }
    }

    public enum ParsedGradientType {
        case linear(angle: CGFloat)
        case radial(centerX: CGFloat, centerY: CGFloat)
    }

    public struct ParsedGradient {
        public var type: ParsedGradientType
        public var stops: [ParsedGradientStop]
        public init(type: ParsedGradientType, stops: [ParsedGradientStop]) {
            self.type = type
            self.stops = stops
        }
    }

    public static func parseGradient(from string: String) -> ParsedGradient? {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("linear-gradient") {
            guard let openIdx = trimmed.firstIndex(of: "("),
                  let closeIdx = trimmed.lastIndex(of: ")"),
                  openIdx < closeIdx else { return nil }
            let inner = String(trimmed[trimmed.index(after: openIdx)..<closeIdx])
            var parts = splitCSSArguments(inner)
            guard !parts.isEmpty else { return nil }

            var angle: CGFloat = 180.0
            if let first = parts.first?.trimmingCharacters(in: .whitespacesAndNewlines) {
                if first.hasSuffix("deg"), let deg = Double(first.dropLast(3).trimmingCharacters(in: .whitespaces)) {
                    angle = CGFloat(deg)
                    parts.removeFirst()
                } else if first.hasPrefix("to ") {
                    let dir = first.dropFirst(3).trimmingCharacters(in: .whitespaces)
                    if dir == "top" { angle = 0 }
                    else if dir == "right" { angle = 90 }
                    else if dir == "bottom" { angle = 180 }
                    else if dir == "left" { angle = 270 }
                    else if dir == "top right" || dir == "right top" { angle = 45 }
                    else if dir == "bottom right" || dir == "right bottom" { angle = 135 }
                    else if dir == "bottom left" || dir == "left bottom" { angle = 225 }
                    else if dir == "top left" || dir == "left top" { angle = 315 }
                    parts.removeFirst()
                }
            }

            let stops = parseStops(parts)
            guard stops.count >= 2 else { return nil }
            return ParsedGradient(type: .linear(angle: angle), stops: stops)

        } else if trimmed.hasPrefix("radial-gradient") {
            guard let openIdx = trimmed.firstIndex(of: "("),
                  let closeIdx = trimmed.lastIndex(of: ")"),
                  openIdx < closeIdx else { return nil }
            let inner = String(trimmed[trimmed.index(after: openIdx)..<closeIdx])
            var parts = splitCSSArguments(inner)
            guard !parts.isEmpty else { return nil }

            var centerX: CGFloat = 0.5
            var centerY: CGFloat = 0.5
            if let first = parts.first, first.contains("at ") {
                let afterAt = first.components(separatedBy: "at ").last ?? ""
                let tokens = afterAt.trimmingCharacters(in: .whitespaces).components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                if tokens.count >= 2 {
                    if let xVal = Double(tokens[0].replacingOccurrences(of: "%", with: "")) {
                        centerX = CGFloat(xVal) / 100.0
                    }
                    if let yVal = Double(tokens[1].replacingOccurrences(of: "%", with: "")) {
                        centerY = CGFloat(yVal) / 100.0
                    }
                }
                parts.removeFirst()
            }

            let stops = parseStops(parts)
            guard stops.count >= 2 else { return nil }
            return ParsedGradient(type: .radial(centerX: centerX, centerY: centerY), stops: stops)
        }
        return nil
    }

    private static func splitCSSArguments(_ string: String) -> [String] {
        var result: [String] = []
        var parenDepth = 0
        var current = ""
        for char in string {
            if char == "(" {
                parenDepth += 1
                current.append(char)
            } else if char == ")" {
                parenDepth = max(0, parenDepth - 1)
                current.append(char)
            } else if char == "," && parenDepth == 0 {
                let item = current.trimmingCharacters(in: .whitespaces)
                if !item.isEmpty { result.append(item) }
                current = ""
            } else {
                current.append(char)
            }
        }
        let item = current.trimmingCharacters(in: .whitespaces)
        if !item.isEmpty { result.append(item) }
        return result
    }

    private static func parseStops(_ parts: [String]) -> [ParsedGradientStop] {
        var stops: [ParsedGradientStop] = []
        for (index, part) in parts.enumerated() {
            let tokens = part.trimmingCharacters(in: .whitespaces).components(separatedBy: .whitespaces).filter { !$0.isEmpty }
            guard !tokens.isEmpty else { continue }
            let colorStr = tokens[0]
            guard let color = NSColor(hexString: colorStr) ?? parseRGBColor(colorStr) else { continue }
            var loc: CGFloat = CGFloat(index) / max(CGFloat(parts.count - 1), 1.0)
            if tokens.count > 1, let pct = Double(tokens[1].replacingOccurrences(of: "%", with: "")) {
                loc = CGFloat(pct) / 100.0
            }
            stops.append(ParsedGradientStop(color: color, location: min(max(loc, 0.0), 1.0)))
        }
        stops.sort { $0.location < $1.location }
        return stops
    }

    private static func parseRGBColor(_ string: String) -> NSColor? {
        if string.hasPrefix("rgb") {
            guard let start = string.firstIndex(of: "("), let end = string.lastIndex(of: ")") else { return nil }
            let sub = string[string.index(after: start)..<end]
            let vals = sub.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            if vals.count >= 3,
               let r = Double(vals[0]),
               let g = Double(vals[1]),
               let b = Double(vals[2]) {
                let a = vals.count >= 4 ? (Double(vals[3]) ?? 1.0) : 1.0
                return NSColor(srgbRed: CGFloat(r) / 255.0, green: CGFloat(g) / 255.0, blue: CGFloat(b) / 255.0, alpha: CGFloat(a))
            }
        }
        return nil
    }

    public static func createCGGradient(from stops: [ParsedGradientStop]) -> CGGradient? {
        let colors = stops.map { $0.color.cgColor } as CFArray
        let locations = stops.map { $0.location }
        return CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: locations)
    }

    public static func drawGradientFill(parsed: ParsedGradient, in rect: CGRect, path: CGPath, ctx: CGContext) {
        guard let gradient = createCGGradient(from: parsed.stops) else { return }
        ctx.saveGState()
        ctx.addPath(path)
        ctx.clip()

        switch parsed.type {
        case .linear(let angle):
            let rad = angle * .pi / 180.0
            let cx = rect.midX
            let cy = rect.midY
            let dx = sin(rad)
            let dy = -cos(rad)
            let halfDiag = sqrt(rect.width * rect.width + rect.height * rect.height) / 2.0
            let start = CGPoint(x: cx - dx * halfDiag, y: cy - dy * halfDiag)
            let end = CGPoint(x: cx + dx * halfDiag, y: cy + dy * halfDiag)
            ctx.drawLinearGradient(gradient, start: start, end: end, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])

        case .radial(let cxRel, let cyRel):
            let center = CGPoint(x: rect.minX + rect.width * cxRel, y: rect.minY + rect.height * cyRel)
            let radius = max(rect.width, rect.height) / 2.0
            ctx.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
        ctx.restoreGState()
    }

    public static func applyStrokeStyle(style: LayerStyle, to ctx: CGContext) {
        ctx.setLineWidth(style.strokeWidth)

        let effectiveCap: CGLineCap
        if style.strokeCap == "round" || (style.strokeDash != nil && style.strokeDash?.first == 0) {
            effectiveCap = .round
        } else if style.strokeCap == "square" {
            effectiveCap = .square
        } else {
            effectiveCap = .butt
        }
        ctx.setLineCap(effectiveCap)

        let join: CGLineJoin
        if style.strokeJoin == "round" {
            join = .round
        } else if style.strokeJoin == "bevel" {
            join = .bevel
        } else {
            join = .miter
        }
        ctx.setLineJoin(join)

        if let ml = style.strokeMiterLimit {
            ctx.setMiterLimit(ml)
        } else {
            ctx.setMiterLimit(4.0)
        }

        if let dash = style.strokeDash, !dash.isEmpty {
            let lengths = dash.count % 2 == 1 ? dash + dash : dash
            ctx.setLineDash(phase: 0, lengths: lengths)
        } else {
            ctx.setLineDash(phase: 0, lengths: [])
        }
    }

    public static func drawStroke(for node: VOONode, path: CGPath, in rect: CGRect, ctx: CGContext) {
        guard node.style.strokeWidth > 0, let strokeColor = NSColor(hexString: node.style.stroke) else { return }
        let strokeAlpha = node.style.strokeOpacity ?? 1.0
        ctx.setStrokeColor(strokeColor.withAlphaComponent(strokeAlpha).cgColor)
        applyStrokeStyle(style: node.style, to: ctx)

        let align = node.style.strokeAlign ?? "center"
        if align == "inside" {
            ctx.saveGState()
            ctx.addPath(path)
            ctx.clip()
            ctx.setLineWidth(node.style.strokeWidth * 2.0)
            ctx.addPath(path)
            ctx.strokePath()
            ctx.restoreGState()
        } else if align == "outside" {
            ctx.saveGState()
            let bigBounds = rect.insetBy(dx: -node.style.strokeWidth * 4, dy: -node.style.strokeWidth * 4)
            let clipP = CGMutablePath()
            clipP.addRect(bigBounds)
            clipP.addPath(path)
            ctx.addPath(clipP)
            ctx.clip(using: .evenOdd)
            ctx.setLineWidth(node.style.strokeWidth * 2.0)
            ctx.addPath(path)
            ctx.strokePath()
            ctx.restoreGState()
        } else {
            ctx.addPath(path)
            ctx.strokePath()
        }
    }

    private func renderNodeWithGaussianBlur(node: VOONode, in ctx: CGContext, rect: CGRect, blurRadius: Double) {
        let pad = CGFloat(blurRadius * 2.5 + 4)
        let paddedRect = rect.insetBy(dx: -pad, dy: -pad)
        guard paddedRect.width > 0, paddedRect.height > 0 else { return }

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let offscreen = CGContext(
            data: nil,
            width: max(1, Int(paddedRect.width)),
            height: max(1, Int(paddedRect.height)),
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else { return }

        offscreen.translateBy(x: pad - rect.minX, y: pad - rect.minY)
        drawNodeContents(node, in: offscreen, rect: rect)

        if let cgImage = offscreen.makeImage() {
            let ciImage = CIImage(cgImage: cgImage)
            if let filter = CIFilter(name: "CIGaussianBlur") {
                filter.setValue(ciImage, forKey: kCIInputImageKey)
                filter.setValue(blurRadius, forKey: kCIInputRadiusKey)
                if let outputCI = filter.outputImage {
                    let ciContext = CIContext()
                    if let blurredCG = ciContext.createCGImage(outputCI, from: CGRect(x: 0, y: 0, width: paddedRect.width, height: paddedRect.height)) {
                        ctx.draw(blurredCG, in: paddedRect)
                        return
                    }
                }
            }
            ctx.draw(cgImage, in: paddedRect)
        }
    }

    private func drawNodeContents(_ node: VOONode, in ctx: CGContext, rect: CGRect) {
        let path = Self.shapePath(for: node, in: rect)

        // Drop shadow
        if let shadow = node.effects?.shadow, shadow.enabled {
            let col = NSColor(hexString: shadow.color) ?? NSColor.black
            let shadowColor = col.withAlphaComponent(CGFloat(shadow.opacity))
            ctx.setShadow(
                offset: CGSize(width: shadow.offsetX, height: -shadow.offsetY),
                blur: CGFloat(shadow.blur),
                color: shadowColor.cgColor
            )
        }

        // Fill
        if node.kind != .text, node.kind != .image {
            if let gradient = Self.parseGradient(from: node.style.fill) {
                Self.drawGradientFill(parsed: gradient, in: rect, path: path, ctx: ctx)
            } else if let fillColor = NSColor(hexString: node.style.fill) {
                let fillAlpha = node.style.fillOpacity ?? 1.0
                ctx.setFillColor(fillColor.withAlphaComponent(fillAlpha).cgColor)
                ctx.addPath(path)
                ctx.fillPath()
            }
        }

        // Inner shadow
        if let innerShadow = node.effects?.innerShadow, innerShadow.enabled {
            ctx.saveGState()
            ctx.addPath(path)
            ctx.clip()
            let outerRect = rect.insetBy(dx: -CGFloat(innerShadow.blur * 2 + 50), dy: -CGFloat(innerShadow.blur * 2 + 50))
            let maskPath = CGMutablePath()
            maskPath.addRect(outerRect)
            maskPath.addPath(path)
            let col = NSColor(hexString: innerShadow.color) ?? NSColor.black
            let shadowColor = col.withAlphaComponent(CGFloat(innerShadow.opacity))
            ctx.setShadow(
                offset: CGSize(width: innerShadow.offsetX, height: -innerShadow.offsetY),
                blur: CGFloat(innerShadow.blur),
                color: shadowColor.cgColor
            )
            ctx.addPath(maskPath)
            ctx.setFillColor(NSColor.black.cgColor)
            ctx.fillPath(using: .evenOdd)
            ctx.restoreGState()
        }

        // Stroke
        if node.kind != .text, node.kind != .image {
            Self.drawStroke(for: node, path: path, in: rect, ctx: ctx)
        }

        // Text rendering if text node
        if node.kind == .text, let text = node.text {
            let fontSize = node.fontSize ?? 16.0
            let color = NSColor(hexString: node.style.fill) ?? NSColor.white
            let attrs = TextStyleResolver.resolvedAttributes(for: node, color: color, size: fontSize)
            let attrStr = NSAttributedString(string: text, attributes: attrs)
            attrStr.draw(with: rect, options: [.usesLineFragmentOrigin, .usesFontLeading])
        }

        // Image rendering for image nodes
        if node.kind == .image {
            drawImageNode(node, in: ctx, rect: rect)
        }
    }

    private func drawNode(_ node: VOONode, in ctx: CGContext) {
        ctx.saveGState()

        let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)

        if node.rotation != 0 {
            let cx = rect.midX
            let cy = rect.midY
            ctx.translateBy(x: cx, y: cy)
            ctx.rotate(by: node.rotation * .pi / 180.0)
            ctx.translateBy(x: -cx, y: -cy)
        }

        ctx.setAlpha(node.style.opacity)
        ctx.setBlendMode(Self.cgBlendMode(for: node.style.blendMode))

        // Layer mask clipping
        if let maskId = node.maskId,
           let maskNode = document.nodes.first(where: { $0.id == maskId }) {
            let maskRect = CGRect(x: maskNode.x, y: maskNode.y, width: maskNode.width, height: maskNode.height)
            if maskNode.kind == .ellipse {
                ctx.addEllipse(in: maskRect)
                ctx.clip()
            } else {
                let radius = maskNode.cornerRadii?.tl ?? 0
                if radius > 0 {
                    let path = CGPath(roundedRect: maskRect, cornerWidth: radius, cornerHeight: radius, transform: nil)
                    ctx.addPath(path)
                    ctx.clip()
                } else {
                    ctx.clip(to: maskRect)
                }
            }
        }

        if let gBlur = node.effects?.gaussianBlur, gBlur.enabled, gBlur.radius > 0 {
            renderNodeWithGaussianBlur(node: node, in: ctx, rect: rect, blurRadius: gBlur.radius)
        } else {
            drawNodeContents(node, in: ctx, rect: rect)
        }

        ctx.restoreGState()
    }

    // MARK: - Transform Handles Synchronization

    private func updateTransformHandlesTarget() {
        defer { updateContextualTaskbarPosition() }
        // The node tool's vector overlay replaces the transform box while editing anchors.
        if activeTool == .node, pathEditingNodeId != nil {
            transformHandles.isVisible = false
            transformHandles.targetRect = .zero
            transformHandles.rotationAngle = 0.0
            return
        }

        let selectedNodes = selectedNodeIds.compactMap { id in
            document.nodes.first(where: { $0.id == id })
        }
        guard let firstNode = selectedNodes.first else {
            transformHandles.isVisible = false
            transformHandles.targetRect = .zero
            transformHandles.rotationAngle = 0.0
            return
        }

        transformHandles.isVisible = true

        if selectedNodes.count > 1 {
            // Multi-selection: axis-aligned union bounding box, no rotation chrome.
            var union = CGRect(x: firstNode.x, y: firstNode.y, width: firstNode.width, height: firstNode.height)
            for node in selectedNodes.dropFirst() {
                union = union.union(CGRect(x: node.x, y: node.y, width: node.width, height: node.height))
            }
            transformHandles.targetRect = union
            transformHandles.rotationAngle = 0.0
            return
        }

        transformHandles.targetRect = CGRect(x: firstNode.x, y: firstNode.y, width: firstNode.width, height: firstNode.height)
        transformHandles.rotationAngle = firstNode.rotation
    }

    public func applyHandleTransform(newRect: CGRect, newRotation: CGFloat) {
        let selectedNodes = selectedNodeIds.compactMap { id in
            document.nodes.first(where: { $0.id == id })
        }

        if selectedNodes.count > 1 {
            applyMultiSelectionTransform(newRect: newRect, newRotation: newRotation)
            return
        }

        guard let firstId = selectedNodeIds.first,
              let idx = document.nodes.firstIndex(where: { $0.id == firstId }) else { return }

        let previousRect = CGRect(
            x: document.nodes[idx].x,
            y: document.nodes[idx].y,
            width: document.nodes[idx].width,
            height: document.nodes[idx].height
        )

        document.nodes[idx].x = newRect.origin.x
        document.nodes[idx].y = newRect.origin.y
        document.nodes[idx].width = newRect.size.width
        document.nodes[idx].height = newRect.size.height
        document.nodes[idx].rotation = newRotation

        // Pen nodes store their anchors in absolute document coordinates; scale them with
        // the bounding box so transform-handle resizing stays visually in sync.
        if document.nodes[idx].kind == .path {
            scalePathPoints(of: idx, from: previousRect, to: newRect)
        } else if document.nodes[idx].kind == .group {
            let scaleX = previousRect.width > 0 ? newRect.width / previousRect.width : 1.0
            let scaleY = previousRect.height > 0 ? newRect.height / previousRect.height : 1.0
            let childIds = collectDescendantIds(of: document.nodes[idx].id)
            for cId in childIds {
                guard let cIdx = document.nodes.firstIndex(where: { $0.id == cId }) else { continue }
                let relX = document.nodes[cIdx].x - previousRect.origin.x
                let relY = document.nodes[cIdx].y - previousRect.origin.y
                document.nodes[cIdx].x = newRect.origin.x + relX * scaleX
                document.nodes[cIdx].y = newRect.origin.y + relY * scaleY
                document.nodes[cIdx].width *= scaleX
                document.nodes[cIdx].height *= scaleY
            }
        }

        onNodeTransformed?(document.nodes[idx])
        needsDisplay = true
    }

    /// Applies one handle gesture to a 2+ node selection: proportional resize around
    /// the union rect, or rotation of every selected layer around the union center.
    private func applyMultiSelectionTransform(newRect: CGRect, newRotation: CGFloat) {
        // Direct API callers (tests / host automation) may not have gone through a
        // mouse-down, so derive the pre-gesture snapshot from the current selection.
        var initialUnion = handleInitialRect
        var beforeRects = selectionBeforeRects
        var beforeRotations = selectionBeforeRotations
        if initialUnion.width <= 0.0001 || initialUnion.height <= 0.0001 || beforeRects.isEmpty {
            let nodes = selectedNodeIds.compactMap { id in
                document.nodes.first(where: { $0.id == id })
            }
            guard let firstNode = nodes.first else { return }
            initialUnion = CGRect(x: firstNode.x, y: firstNode.y, width: firstNode.width, height: firstNode.height)
            beforeRects = [:]
            beforeRotations = [:]
            for node in nodes {
                initialUnion = initialUnion.union(CGRect(x: node.x, y: node.y, width: node.width, height: node.height))
                beforeRects[node.id] = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                beforeRotations[node.id] = node.rotation
            }
        }

        let isRotating = transformHandles.activeDragHandle == .rotatePin
            || newRotation != handleInitialRotation

        var doc = document

        if isRotating {
            let union = initialUnion
            guard union.width > 0.0001 || union.height > 0.0001 else { return }
            let deltaDegrees = newRotation - handleInitialRotation
            let step = deltaDegrees - appliedMultiRotationDelta
            guard step != 0 else { return }
            let center = CGPoint(x: union.midX, y: union.midY)
            let radians = step * .pi / 180.0
            let cosine = cos(radians)
            let sine = sin(radians)

            for index in doc.nodes.indices where beforeRects[doc.nodes[index].id] != nil {
                let nodeCenter = CGPoint(
                    x: doc.nodes[index].x + doc.nodes[index].width / 2.0,
                    y: doc.nodes[index].y + doc.nodes[index].height / 2.0
                )
                let dx = nodeCenter.x - center.x
                let dy = nodeCenter.y - center.y
                let rotatedCenter = CGPoint(
                    x: center.x + dx * cosine - dy * sine,
                    y: center.y + dx * sine + dy * cosine
                )
                doc.nodes[index].x = rotatedCenter.x - doc.nodes[index].width / 2.0
                doc.nodes[index].y = rotatedCenter.y - doc.nodes[index].height / 2.0
                doc.nodes[index].rotation += step
            }
            appliedMultiRotationDelta = deltaDegrees
        } else {
            let union = initialUnion
            guard union.width > 0.0001, union.height > 0.0001 else { return }
            let scaleX = newRect.width / union.width
            let scaleY = newRect.height / union.height

            for index in doc.nodes.indices {
                let id = doc.nodes[index].id
                guard let initial = beforeRects[id] else { continue }
                let scaledRect = CGRect(
                    x: newRect.origin.x + (initial.minX - union.minX) * scaleX,
                    y: newRect.origin.y + (initial.minY - union.minY) * scaleY,
                    width: max(initial.width * scaleX, 0.001),
                    height: max(initial.height * scaleY, 0.001)
                )
                if doc.nodes[index].kind == .path, let points = doc.nodes[index].points {
                    doc.nodes[index].points = Self.pathPoints(points, scaledFrom: initial, to: scaledRect)
                }
                doc.nodes[index].x = scaledRect.origin.x
                doc.nodes[index].y = scaledRect.origin.y
                doc.nodes[index].width = scaledRect.width
                doc.nodes[index].height = scaledRect.height
            }
        }

        document = doc
        let committedIds = beforeRects.keys
        for id in committedIds {
            if let updated = document.nodes.first(where: { $0.id == id }) {
                onNodeTransformed?(updated)
            }
        }
        needsDisplay = true
    }

    /// Translates all absolute pen anchors/handles of a node by `delta` (drag-move support).
    private func shiftPathPoints(of nodeIndex: Int, by delta: CGPoint) {
        guard delta != .zero,
              nodeIndex >= 0, nodeIndex < document.nodes.count,
              var points = document.nodes[nodeIndex].points else { return }

        for index in points.indices {
            points[index].x += delta.x
            points[index].y += delta.y
            if let handle = points[index].inHandle {
                points[index].inHandle = CGPoint(x: handle.x + delta.x, y: handle.y + delta.y)
            }
            if let handle = points[index].outHandle {
                points[index].outHandle = CGPoint(x: handle.x + delta.x, y: handle.y + delta.y)
            }
        }
        document.nodes[nodeIndex].points = points
    }

    /// Scales all absolute pen anchors/handles of a node from `oldRect` into `newRect`
    /// (transform-handle resize support).
    private func scalePathPoints(of nodeIndex: Int, from oldRect: CGRect, to newRect: CGRect) {
        guard nodeIndex >= 0, nodeIndex < document.nodes.count,
              let points = document.nodes[nodeIndex].points else { return }
        document.nodes[nodeIndex].points = Self.pathPoints(points, scaledFrom: oldRect, to: newRect)
    }

    /// Returns absolute pen anchors scaled from `oldRect` into `newRect`.
    static func pathPoints(_ points: [PenAnchor], scaledFrom oldRect: CGRect, to newRect: CGRect) -> [PenAnchor] {
        guard oldRect.width > 0.0001, oldRect.height > 0.0001 else { return points }
        let scaleX = newRect.width / oldRect.width
        let scaleY = newRect.height / oldRect.height

        func scaled(_ point: CGPoint) -> CGPoint {
            CGPoint(
                x: newRect.origin.x + (point.x - oldRect.origin.x) * scaleX,
                y: newRect.origin.y + (point.y - oldRect.origin.y) * scaleY
            )
        }

        return points.map { anchor in
            var updated = anchor
            let anchorPoint = scaled(anchor.point)
            updated.x = anchorPoint.x
            updated.y = anchorPoint.y
            if let handle = anchor.inHandle {
                updated.inHandle = scaled(handle)
            }
            if let handle = anchor.outHandle {
                updated.outHandle = scaled(handle)
            }
            return updated
        }
    }

    // MARK: - Magnetic Snapping Calculation

    public func computeSnapping(
        for candidate: CGPoint,
        movingEdge: String,
        excludeId: String? = nil,
        threshold: CGFloat = ThemeTokens.snapThresholdPx
    ) -> SnapResult {
        let docThreshold = threshold / zoom
        var snapped = candidate
        var isSnapped = false
        var guides: [MagneticGuide] = []

        let canvas = document.canvas
        let targetsX: [CGFloat] = [
            0.0,
            canvas.x,
            canvas.x + canvas.width / 2.0,
            canvas.x + canvas.width
        ]

        if movingEdge == "x" || movingEdge == "both" {
            for tx in targetsX {
                if abs(candidate.x - tx) <= docThreshold {
                    snapped.x = tx
                    isSnapped = true
                    guides.append(MagneticGuide(start: CGPoint(x: tx, y: -5000), end: CGPoint(x: tx, y: 5000)))
                    break
                }
            }
            if !isSnapped {
                for node in document.nodes where node.id != excludeId && node.style.visible {
                    let edges = [node.x, node.x + node.width / 2.0, node.x + node.width]
                    for ex in edges {
                        if abs(candidate.x - ex) <= docThreshold {
                            snapped.x = ex
                            isSnapped = true
                            guides.append(MagneticGuide(start: CGPoint(x: ex, y: -5000), end: CGPoint(x: ex, y: 5000)))
                            break
                        }
                    }
                    if isSnapped { break }
                }
            }
            if !isSnapped, let userGuides = document.guides {
                for g in userGuides where g.axis == "v" {
                    if abs(candidate.x - g.position) <= docThreshold {
                        snapped.x = g.position
                        isSnapped = true
                        guides.append(MagneticGuide(start: CGPoint(x: g.position, y: -5000), end: CGPoint(x: g.position, y: 5000)))
                        break
                    }
                }
            }
        }

        if movingEdge == "y" || movingEdge == "both" {
            let targetsY: [CGFloat] = [
                0.0,
                canvas.y,
                canvas.y + canvas.height / 2.0,
                canvas.y + canvas.height
            ]
            for ty in targetsY {
                if abs(candidate.y - ty) <= docThreshold {
                    snapped.y = ty
                    isSnapped = true
                    guides.append(MagneticGuide(start: CGPoint(x: -5000, y: ty), end: CGPoint(x: 5000, y: ty)))
                    break
                }
            }
            if !isSnapped {
                for node in document.nodes where node.id != excludeId && node.style.visible {
                    let edges = [node.y, node.y + node.height / 2.0, node.y + node.height]
                    for ey in edges {
                        if abs(candidate.y - ey) <= docThreshold {
                            snapped.y = ey
                            isSnapped = true
                            guides.append(MagneticGuide(start: CGPoint(x: -5000, y: ey), end: CGPoint(x: 5000, y: ey)))
                            break
                        }
                    }
                    if isSnapped { break }
                }
            }
            if !isSnapped, let userGuides = document.guides {
                for g in userGuides where g.axis == "h" {
                    if abs(candidate.y - g.position) <= docThreshold {
                        snapped.y = g.position
                        isSnapped = true
                        guides.append(MagneticGuide(start: CGPoint(x: -5000, y: g.position), end: CGPoint(x: 5000, y: g.position)))
                        break
                    }
                }
            }
        }

        return SnapResult(
            snapped: isSnapped,
            snappedPoint: snapped,
            snappedDelta: CGPoint(x: snapped.x - candidate.x, y: snapped.y - candidate.y),
            snapGuides: guides
        )
    }

    private func snapPoint(_ candidate: CGPoint, threshold: CGFloat = ThemeTokens.snapThresholdPx) -> SnapResult {
        return computeSnapping(for: candidate, movingEdge: "both", threshold: threshold)
    }

    // MARK: - Mouse Event Handling

    public override func mouseMoved(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        let docPt = documentPoint(from: loc)

        // Project cursor onto rulers
        horizontalRuler.cursorPosition = docPt.x
        verticalRuler.cursorPosition = docPt.y
        onCursorMoved?(docPt)

        // Creation tools draw their own cursor + pen rubber-band preview.
        if activeTool == .pen {
            penPreviewPoint = docPt
            if penAnchors.count >= 2, let first = penAnchors.first {
                let hitRadius = 10.0 / max(zoom, 0.0001)
                penHoveringFirstAnchor = hypot(docPt.x - first.x, docPt.y - first.y) <= hitRadius
            } else {
                penHoveringFirstAnchor = false
            }
            NSCursor.crosshair.set()
            syncCreationPreview()
            needsDisplay = true
            return
        }
        if activeTool == .shapes || activeTool == .artboard {
            NSCursor.crosshair.set()
            return
        }
        if activeTool == .text {
            NSCursor.iBeam.set()
            return
        }
        if activeTool == .brush || activeTool == .eraser {
            paintCursorDocPoint = docPt
            NSCursor.crosshair.set()
            needsDisplay = true
            return
        }

        if activeTool == .node, pathEditingNodeId != nil {
            updatePathEditingHover(at: docPt)
            NSCursor.crosshair.set()
            return
        }

        // Check transform handles hover
        if transformHandles.isVisible {
            transformHandles.updateHover(at: docPt)
        }
    }

    public override func mouseEntered(with event: NSEvent) {
        updateCursorForTool()
    }

    public override func mouseExited(with event: NSEvent) {
        if activeTool == .brush || activeTool == .eraser {
            paintCursorDocPoint = nil
            needsDisplay = true
            return
        }
        if activeTool == .node, pathEditingNodeId != nil {
            hoveredPathAnchorIndex = nil
            hoveredPathHandle = nil
            syncPathEditingOverlay()
            needsDisplay = true
            return
        }
        guard activeTool == .pen else { return }
        penPreviewPoint = nil
        penHoveringFirstAnchor = false
        syncCreationPreview()
        needsDisplay = true
    }

    private func collectDescendantIds(of parentId: String) -> [String] {
        var results: [String] = []
        let children = document.nodes.filter { $0.parentId == parentId }
        for child in children {
            results.append(child.id)
            results.append(contentsOf: collectDescendantIds(of: child.id))
        }
        return results
    }

    public override func mouseDown(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        let docPt = documentPoint(from: loc)

        // Any canvas interaction focuses the stage so Escape/Return/Delete and
        // space-pan keyboard handling works for every tool (shape, artboard,
        // pen, text, node editing).
        window?.makeFirstResponder(self)

        // 0. Canvas creation tools take precedence and suspend selection/marquee logic.
        switch activeTool {
        case .shapes, .artboard:
            beginShapeCreation(at: docPt, tool: activeTool)
            return
        case .pen:
            if activePenSubTool == .pencil {
                isDrawingPencil = true
                pencilPoints = [docPt]
                needsDisplay = true
                return
            }
            handlePenMouseDown(at: docPt, event: event)
            return
        case .text:
            // Ignore the second event of a double-click so only one insertion is requested.
            if event.clickCount <= 1 {
                onRequestTextInsertion?(docPt)
                onToolActionCompleted?("text.insertion.requested")
            }
            return
        default:
            break
        }

        // 0.5 Node tool: vector anchor / bezier handle editing takes the mouse when applicable.
        if activeTool == .node, handleNodeToolMouseDown(at: docPt, event: event) {
            return
        }

        // 1. Spacebar Pan Mode
        if isSpaceKeyDown {
            isPanningWithSpace = true
            panDragStartMouse = loc
            panDragStartOffset = panOffset
            NSCursor.closedHand.set()
            return
        }

        // 1.5 Hand/pan mode
        if panModeEnabled {
            isPanningWithHand = true
            panDragStartMouse = loc
            panDragStartOffset = panOffset
            NSCursor.closedHand.set()
            return
        }

        // 1.55 Freehand painting tools: brush / eraser own the mouse.
        if activeTool == .brush || activeTool == .eraser {
            beginPaintStroke(at: docPt)
            return
        }

        // 1.6 Lasso and magic-wand selection modes (with the move tool)
        if activeTool == .move {
            if selectionStyle == .lasso {
                lassoAdditive = event.modifierFlags.contains(.shift)
                if !lassoAdditive { selectedNodeIds.removeAll() }
                isLassoSelecting = true
                lassoPoints = [docPt]
                needsDisplay = true
                onToolActionCompleted?("lasso.started")
                return
            }
            if selectionStyle == .wand {
                performMagicWandSelection(at: docPt, additive: event.modifierFlags.contains(.shift))
                onToolActionCompleted?("wand.selected")
                return
            }
        }

        // 2. Transform Handle Dragging
        if transformHandles.isVisible, let handle = transformHandles.hitTestHandle(at: docPt) {
            let selectedNodes = selectedNodeIds.compactMap { id in
                document.nodes.first(where: { $0.id == id })
            }
            selectionBeforeRects = [:]
            selectionBeforeRotations = [:]
            for node in selectedNodes {
                selectionBeforeRects[node.id] = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                selectionBeforeRotations[node.id] = node.rotation
            }
            appliedMultiRotationDelta = 0
            if selectedNodes.count > 1 {
                var union = CGRect(x: selectedNodes[0].x, y: selectedNodes[0].y,
                                   width: selectedNodes[0].width, height: selectedNodes[0].height)
                for node in selectedNodes.dropFirst() {
                    union = union.union(CGRect(x: node.x, y: node.y, width: node.width, height: node.height))
                }
                handleInitialRect = union
                handleInitialRotation = 0
            } else if let node = selectedNodes.first {
                handleInitialRect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                handleInitialRotation = node.rotation
            }
            transformHandles.beginDrag(handle: handle, at: docPt)
            return
        }

        // 3. Node Selection / Move Hit Testing
        var hitNodeId: String?
        for node in document.nodes.reversed() where node.style.visible && !node.style.locked {
            let r = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            if r.contains(docPt) {
                hitNodeId = node.id
                break
            }
        }

        // 4. Double-click on empty canvas with .move or .text tool creates text node.
        if (activeTool == .move || activeTool == .text), event.clickCount >= 2, hitNodeId == nil {
            onRequestTextInsertion?(docPt)
            onToolActionCompleted?("text.insertion.requested")
            return
        }

        // 4.1 Double-click on a text node with the .move tool requests inline editing.
        if activeTool == .move, event.clickCount >= 2, let id = hitNodeId,
           let node = document.nodes.first(where: { $0.id == id }), node.kind == .text {
            selectedNodeIds = [id]
            onEditTextNode?(node)
            onToolActionCompleted?("text.edit.requested")
            return
        }

        if let id = hitNodeId {
            if event.modifierFlags.contains(.shift) {
                if selectedNodeIds.contains(id) {
                    selectedNodeIds.remove(id)
                } else {
                    selectedNodeIds.insert(id)
                }
            } else {
                selectedNodeIds = [id]
            }

            if let node = document.nodes.first(where: { $0.id == id }) {
                isDraggingNode = true
                nodeDragStartMouse = docPt
                nodeInitialRect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                dragInitialRects = [:]
                var allIdsToMove = selectedNodeIds
                for selectedId in selectedNodeIds {
                    for descId in collectDescendantIds(of: selectedId) {
                        allIdsToMove.insert(descId)
                    }
                }
                for moveId in allIdsToMove {
                    if let selected = document.nodes.first(where: { $0.id == moveId }) {
                        dragInitialRects[moveId] = CGRect(x: selected.x, y: selected.y,
                                                          width: selected.width, height: selected.height)
                    }
                }
            }
        } else {
            // Marquee selection start
            if !event.modifierFlags.contains(.shift) {
                selectedNodeIds.removeAll()
            }
            isMarqueeSelecting = true
            marqueeStart = docPt
            currentMarqueeRect = CGRect(origin: docPt, size: .zero)
        }
    }

    public override func mouseDragged(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        let docPt = documentPoint(from: loc)

        // Update ruler cursor projection
        horizontalRuler.cursorPosition = docPt.x
        verticalRuler.cursorPosition = docPt.y

        // 0. Canvas creation gestures (shape / artboard drag, pen handle drag, pencil).
        if isDrawingPencil {
            pencilPoints.append(docPt)
            needsDisplay = true
            return
        }
        if isCreatingShape {
            updateShapeCreation(at: docPt, event: event)
            return
        }
        if activeTool == .pen {
            handlePenDrag(to: docPt)
            return
        }

        // 0.5 Node tool: anchor / handle drag.
        if pathEditDrag != nil {
            handlePathEditDrag(to: docPt)
            return
        }

        // 1. Spacebar Panning
        if isPanningWithSpace {
            let dx = loc.x - panDragStartMouse.x
            let dy = loc.y - panDragStartMouse.y
            panOffset = CGPoint(x: panDragStartOffset.x + dx, y: panDragStartOffset.y + dy)
            return
        }

        // 1.5 Hand pan drag
        if isPanningWithHand {
            let dx = loc.x - panDragStartMouse.x
            let dy = loc.y - panDragStartMouse.y
            panOffset = CGPoint(x: panDragStartOffset.x + dx, y: panDragStartOffset.y + dy)
            return
        }

        // 1.55 Freehand paint stroke (brush / eraser).
        if isPainting {
            continuePaintStroke(to: docPt)
            return
        }

        // 1.6 Lasso selection drag
        if isLassoSelecting {
            if let last = lassoPoints.last,
               hypot(docPt.x - last.x, docPt.y - last.y) * zoom >= 1.5 {
                lassoPoints.append(docPt)
                needsDisplay = true
            }
            return
        }

        // 2. Transform Handle Drag
        if transformHandles.activeDragHandle != nil {
            transformHandles.continueDrag(to: docPt)
            return
        }

        // 3. Node Moving with Magnetic Snapping (multi-selection aware)
        if isDraggingNode, let id = selectedNodeIds.first {
            let rawX = nodeInitialRect.origin.x + (docPt.x - nodeDragStartMouse.x)
            let rawY = nodeInitialRect.origin.y + (docPt.y - nodeDragStartMouse.y)

            let snapped: SnapResult
            if isSnappingEnabled {
                snapped = snapPoint(CGPoint(x: rawX, y: rawY))
            } else {
                snapped = SnapResult(snapped: false,
                                     snappedPoint: CGPoint(x: rawX, y: rawY),
                                     snappedDelta: .zero,
                                     snapGuides: [])
            }
            activeMagneticGuides = snapped.snapGuides
            let delta = CGPoint(x: snapped.snappedPoint.x - nodeInitialRect.origin.x,
                                y: snapped.snappedPoint.y - nodeInitialRect.origin.y)

            for (selectedId, initialRect) in dragInitialRects {
                guard let i = document.nodes.firstIndex(where: { $0.id == selectedId }) else { continue }
                let previousX = document.nodes[i].x
                let previousY = document.nodes[i].y
                document.nodes[i].x = initialRect.origin.x + delta.x
                document.nodes[i].y = initialRect.origin.y + delta.y
                if document.nodes[i].kind == .path {
                    shiftPathPoints(
                        of: i,
                        by: CGPoint(x: document.nodes[i].x - previousX, y: document.nodes[i].y - previousY)
                    )
                }
            }

            updateTransformHandlesTarget()
            if let moved = document.nodes.first(where: { $0.id == id }) {
                onNodeTransformed?(moved)
            }
            needsDisplay = true
            return
        }

        // 4. Marquee Selection Drag
        if isMarqueeSelecting {
            let minX = min(marqueeStart.x, docPt.x)
            let minY = min(marqueeStart.y, docPt.y)
            let w = abs(docPt.x - marqueeStart.x)
            let h = abs(docPt.y - marqueeStart.y)
            currentMarqueeRect = CGRect(x: minX, y: minY, width: w, height: h)

            // Select intersecting nodes
            for node in document.nodes where node.style.visible && !node.style.locked {
                let r = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                if currentMarqueeRect.intersects(r) {
                    selectedNodeIds.insert(node.id)
                }
            }
            needsDisplay = true
        }
    }

    public override func mouseUp(with event: NSEvent) {
        // 0. Finish freehand pencil stroke.
        if isDrawingPencil {
            isDrawingPencil = false
            needsDisplay = true
            if pencilPoints.count >= 2 {
                let anchors = BezierCurveFitter.fitContourToBezier(polygon: pencilPoints, isClosed: false, errorTolerance: 1.5)
                var minX = pencilPoints[0].x, maxX = pencilPoints[0].x
                var minY = pencilPoints[0].y, maxY = pencilPoints[0].y
                for p in pencilPoints {
                    minX = min(minX, p.x); maxX = max(maxX, p.x)
                    minY = min(minY, p.y); maxY = max(maxY, p.y)
                }
                let w = max(maxX - minX, 1.0)
                let h = max(maxY - minY, 1.0)
                let node = VOONode(
                    kind: .path,
                    name: "Pencil \(nextAvailableIndex(prefix: "Pencil "))",
                    x: minX,
                    y: minY,
                    width: w,
                    height: h,
                    style: LayerStyle(
                        fill: "none",
                        stroke: "#ffffff",
                        strokeWidth: 2.0,
                        opacity: 1.0,
                        blendMode: "normal"
                    ),
                    points: anchors
                )
                onCreateNode?(node)
                onToolActionCompleted?("pencil.path.created")
            }
            pencilPoints.removeAll()
            return
        }

        // 0. Finish canvas creation gestures.
        if isCreatingShape {
            let docPt = documentPoint(from: convert(event.locationInWindow, from: nil))
            finishShapeCreation(at: docPt, event: event)
            return
        }
        if activeTool == .pen {
            penDraggingAnchorIndex = nil
            penPreviewPoint = penAnchors.isEmpty ? nil : documentPoint(from: convert(event.locationInWindow, from: nil))
            syncCreationPreview()
            needsDisplay = true
            return
        }

        // 0.5 Node tool: finish an anchor / handle drag (one commit per gesture).
        if pathEditDrag != nil {
            finishPathEditDrag()
            return
        }

        // 0.55 Freehand paint stroke: encode the paint layer and notify the host once.
        if isPainting {
            finishPaintStroke()
            return
        }

        if isPanningWithSpace {
            isPanningWithSpace = false
            updateCursorForTool()
        }
        if isPanningWithHand {
            isPanningWithHand = false
            updateCursorForTool()
        }
        if isLassoSelecting {
            finishLassoSelection(additive: lassoAdditive)
            isLassoSelecting = false
            lassoPoints.removeAll()
            onToolActionCompleted?("lasso.finished")
            needsDisplay = true
        }

        if transformHandles.activeDragHandle != nil {
            let wasMultiSelection = selectionBeforeRects.count > 1
            let previousRects = selectionBeforeRects
            let previousRotations = selectionBeforeRotations
            transformHandles.endDrag()

            if wasMultiSelection {
                var afterRects: [String: CGRect] = [:]
                var afterRotations: [String: CGFloat] = [:]
                for id in previousRects.keys {
                    if let node = document.nodes.first(where: { $0.id == id }) {
                        afterRects[id] = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                        afterRotations[id] = node.rotation
                    }
                }
                if afterRects != previousRects || afterRotations != previousRotations {
                    onSelectionTransformCommitted?(previousRects, afterRects,
                                                   previousRotations, afterRotations)
                }
            } else if let firstId = selectedNodeIds.first,
                      let node = document.nodes.first(where: { $0.id == firstId }) {
                let after = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                if after != handleInitialRect || node.rotation != handleInitialRotation {
                    onHandleTransformCommitted?(firstId, handleInitialRect, handleInitialRotation,
                                                after, node.rotation)
                }
            }

            selectionBeforeRects = [:]
            selectionBeforeRotations = [:]
            appliedMultiRotationDelta = 0
        }

        if isDraggingNode {
            isDraggingNode = false
            activeMagneticGuides.removeAll()
            var afterRects: [String: CGRect] = [:]
            for id in dragInitialRects.keys {
                if let node = document.nodes.first(where: { $0.id == id }) {
                    afterRects[id] = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
                }
            }
            if !dragInitialRects.isEmpty, afterRects != dragInitialRects {
                onMoveCommitted?(dragInitialRects, afterRects)
            }
            dragInitialRects = [:]
            needsDisplay = true
        }

        if isMarqueeSelecting {
            isMarqueeSelecting = false
            currentMarqueeRect = .zero
            needsDisplay = true
        }
    }

    // MARK: - Right-Click Context Menu

    public override func menu(for event: NSEvent) -> NSMenu? {
        guard let provider = contextMenuProvider else { return super.menu(for: event) }
        let viewPt = convert(event.locationInWindow, from: nil)
        let docPt = documentPoint(from: viewPt)

        if let hit = hitTestNode(at: docPt) {
            if !selectedNodeIds.contains(hit.id) {
                selectedNodeIds = [hit.id]
            }
        }
        return provider(docPt)
    }

    // MARK: - Trackpad Scroll & Pinch Zoom

    public override func scrollWheel(with event: NSEvent) {
        if event.modifierFlags.contains(.command) {
            // Pinch / Command-Scroll Zoom
            let zoomFactor: CGFloat = (event.deltaY > 0) ? 1.05 : 0.95
            zoom = zoom * zoomFactor
        } else {
            // Pan Scroll
            panOffset.x += event.deltaX * 2.0
            panOffset.y += event.deltaY * 2.0
        }
    }

    public override func magnify(with event: NSEvent) {
        zoom = zoom * (1.0 + event.magnification)
    }

    // MARK: - Hit Testing (creation-friendly)

    public override func hitTest(_ point: NSPoint) -> NSView? {
        guard let hit = super.hitTest(point) else { return nil }
        // The transform-handle overlay is a purely decorative, full-viewport subview; its
        // interactions (hit-testing handles, drag math) are driven by this view's mouse
        // handlers. Route events to the stage so selection, marquee, pan, zoom and the
        // creation tools receive them.
        if hit === transformHandles || hit.isDescendant(of: transformHandles) {
            return self
        }
        return hit
    }

    // MARK: - Keyboard Handling

    public override var acceptsFirstResponder: Bool { true }

    public override func keyDown(with event: NSEvent) {
        // Freehand paint: Escape discards the in-progress stroke (restores the snapshot).
        if isPainting, event.keyCode == 53 {
            cancelPaintStroke(restore: true)
            return
        }

        // Node tool: vector anchor editing keyboard shortcuts.
        if activeTool == .node, pathEditingNodeId != nil {
            switch event.keyCode {
            case 53: // Escape — clear anchor selection first, then leave editing mode
                if selectedAnchorIndex != nil {
                    selectedAnchorIndex = nil
                    hoveredPathAnchorIndex = nil
                    hoveredPathHandle = nil
                    syncPathEditingOverlay()
                    needsDisplay = true
                    return
                }
                cancelPathEditing()
                return
            case 51, 117: // Delete / Forward Delete — remove the selected anchor (>= 2 kept)
                if selectedAnchorIndex != nil {
                    deleteSelectedPathAnchor()
                    return
                }
            default:
                break
            }
        }

        switch event.keyCode {
        case 53: // Escape — cancel the active creation gesture / lasso
            if isLassoSelecting {
                isLassoSelecting = false
                lassoPoints.removeAll()
                needsDisplay = true
                return
            }
            if isCreatingShape || !penAnchors.isEmpty {
                cancelCreation()
                return
            }
        case 36, 76: // Return / keypad Enter — finish the current pen path (open)
            if activeTool == .pen, !penAnchors.isEmpty {
                finishPenPath(closed: false)
                return
            }
        case 51, 117: // Delete / Forward Delete — remove the last pen anchor
            if activeTool == .pen, !penAnchors.isEmpty {
                removeLastPenAnchor()
                return
            }
        case 49: // Spacebar
            isSpaceKeyDown = true
            NSCursor.openHand.set()
            return
        default:
            break
        }

        super.keyDown(with: event)
    }

    public override func keyUp(with event: NSEvent) {
        if event.keyCode == 49 { // Spacebar
            isSpaceKeyDown = false
            updateCursorForTool()
        } else {
            super.keyUp(with: event)
        }
    }

    private func updateCursorForTool() {
        if isSpaceKeyDown || panModeEnabled {
            NSCursor.openHand.set()
            return
        }
        if activeTool == .move, selectionStyle == .lasso || selectionStyle == .wand {
            NSCursor.crosshair.set()
            return
        }
        switch activeTool {
        case .move:
            NSCursor.arrow.set()
        case .node, .pen, .shapes, .artboard, .brush, .eraser:
            NSCursor.crosshair.set()
        case .text:
            NSCursor.iBeam.set()
        }
    }

    // MARK: - Blend Mode Mapping

    static func cgBlendMode(for blendMode: String) -> CGBlendMode {
        switch blendMode.lowercased() {
        case "multiply": return .multiply
        case "screen": return .screen
        case "overlay": return .overlay
        case "darken": return .darken
        case "lighten": return .lighten
        case "color-dodge", "color dodge": return .colorDodge
        case "color-burn", "color burn": return .colorBurn
        case "hard-light", "hard light": return .hardLight
        case "soft-light", "soft light": return .softLight
        case "difference": return .difference
        case "exclusion": return .exclusion
        case "hue": return .hue
        case "saturation": return .saturation
        case "color": return .color
        case "luminosity": return .luminosity
        default: return .normal
        }
    }

    // MARK: - Node Tool: Vector Path Editing

    /// Ends node-tool anchor editing and clears the anchor selection.
    public func cancelPathEditing() {
        let hadEditing = pathEditingNodeId != nil
        pathEditingNodeId = nil
        selectedAnchorIndex = nil
        hoveredPathAnchorIndex = nil
        hoveredPathHandle = nil
        pathEditDrag = nil
        pathEditBeforePoints = nil
        if hadEditing {
            onToolActionCompleted?("path.editing.cancelled")
        }
        updateTransformHandlesTarget()
        syncPathEditingOverlay()
        needsDisplay = true
    }

    private var pathEditingNode: VOONode? {
        guard let id = pathEditingNodeId else { return nil }
        return document.nodes.first(where: { $0.id == id })
    }

    /// Auto-enters path editing when a single path is selected with the node tool.
    private func updatePathEditingTargetForSelection() {
        guard activeTool == .node else {
            pathEditingNodeId = nil
            selectedAnchorIndex = nil
            return
        }

        if let id = pathEditingNodeId, !selectedNodeIds.contains(id) || selectedNodeIds.count != 1 {
            pathEditingNodeId = nil
            selectedAnchorIndex = nil
            hoveredPathAnchorIndex = nil
            hoveredPathHandle = nil
            pathEditDrag = nil
            pathEditBeforePoints = nil
            return
        }

        guard pathEditingNodeId == nil,
              selectedNodeIds.count == 1,
              let id = selectedNodeIds.first,
              let node = document.nodes.first(where: { $0.id == id }),
              node.kind == .path,
              (node.points?.count ?? 0) >= 2 else { return }

        pathEditingNodeId = id
        selectedAnchorIndex = nil
    }

    /// Drops the editing target when the node vanished / stopped being a path.
    private func validatePathEditingTarget() {
        guard let id = pathEditingNodeId else { return }
        guard activeTool == .node,
              let node = document.nodes.first(where: { $0.id == id }),
              node.kind == .path,
              (node.points?.count ?? 0) >= 2 else {
            pathEditingNodeId = nil
            selectedAnchorIndex = nil
            pathEditDrag = nil
            pathEditBeforePoints = nil
            hoveredPathAnchorIndex = nil
            hoveredPathHandle = nil
            return
        }
        if let index = selectedAnchorIndex, index >= (node.points?.count ?? 0) {
            selectedAnchorIndex = nil
        }
    }

    private func enterPathEditing(nodeId: String) {
        pathEditingNodeId = nodeId
        selectedAnchorIndex = nil
        hoveredPathAnchorIndex = nil
        hoveredPathHandle = nil
        pathEditDrag = nil
        pathEditBeforePoints = nil
        updateTransformHandlesTarget()
        syncPathEditingOverlay()
        needsDisplay = true
    }

    private func syncPathEditingOverlay() {
        let editing = pathEditingNode
        pathEditingOverlay.zoom = zoom
        pathEditingOverlay.panOffset = panOffset
        pathEditingOverlay.rulerOffset = showRulers ? ThemeTokens.rulerTrackThickness : 0
        pathEditingOverlay.editingNode = editing
        pathEditingOverlay.selectedAnchorIndex = selectedAnchorIndex
        pathEditingOverlay.hoveredAnchorIndex = hoveredPathAnchorIndex
        pathEditingOverlay.hoveredHandle = hoveredPathHandle
        pathEditingOverlay.isHidden = editing == nil
        pathEditingOverlay.needsDisplay = true
    }

    // MARK: Node Tool Mouse Handling

    /// Returns true when the node tool consumed the mouse-down (anchor / handle editing).
    private func handleNodeToolMouseDown(at docPt: CGPoint, event: NSEvent) -> Bool {
        window?.makeFirstResponder(self)

        if pathEditingNodeId == nil {
            if let hit = hitTestNode(at: docPt), hit.kind == .path, (hit.points?.count ?? 0) >= 2 {
                selectedNodeIds = [hit.id]
                enterPathEditing(nodeId: hit.id)
                return true
            }
            return false
        }

        guard let points = pathEditingNode?.points else { return false }

        // 1. Bezier handle knobs (drawn above anchors).
        if let handle = pathHandleHitTest(at: docPt, points: points) {
            selectedAnchorIndex = handle.anchorIndex
            pathEditBeforePoints = points
            pathEditDragStartDoc = docPt
            pathEditDrag = .handle(index: handle.anchorIndex, kind: handle.kind)
            hoveredPathAnchorIndex = handle.anchorIndex
            hoveredPathHandle = handle
            syncPathEditingOverlay()
            needsDisplay = true
            return true
        }

        // 2. Anchor squares: click-select, double-click toggles sharp/smooth,
        //    Option-click toggles symmetric.
        if let index = pathAnchorHitTest(at: docPt, points: points) {
            if event.clickCount >= 2 {
                let target: NodeType = points[index].type == .sharp ? .smooth : .sharp
                togglePathAnchorType(index: index, to: target)
                return true
            }
            if event.modifierFlags.contains(.option) {
                let target: NodeType = points[index].type == .symmetric ? .sharp : .symmetric
                togglePathAnchorType(index: index, to: target)
                return true
            }
            selectedAnchorIndex = index
            pathEditBeforePoints = points
            pathEditDragStartDoc = docPt
            pathEditDrag = .anchor(index: index)
            hoveredPathAnchorIndex = index
            hoveredPathHandle = nil
            syncPathEditingOverlay()
            needsDisplay = true
            return true
        }

        // 2.5 Midpoint anchor insertion on segment click (vectors.midpoint-insertion)
        if let (insertIndex, midpoint) = pathSegmentMidpointHitTest(at: docPt, points: points),
           let nodeId = pathEditingNodeId,
           let nodeIndex = document.nodes.firstIndex(where: { $0.id == nodeId }) {
            let before = points
            let newAnchor = PenAnchor(
                x: midpoint.x,
                y: midpoint.y,
                inHandle: nil,
                outHandle: nil,
                isClosed: points.first?.isClosed ?? false,
                type: .smooth
            )
            var updatedPoints = points
            updatedPoints.insert(newAnchor, at: insertIndex)
            document.nodes[nodeIndex].points = updatedPoints
            selectedAnchorIndex = insertIndex
            pathEditBeforePoints = before
            onPathPointsCommitted?(nodeId, before, updatedPoints)
            syncPathEditingOverlay()
            needsDisplay = true
            onToolActionCompleted?("path.midpoint.inserted")
            return true
        }

        // 3. Clicking another path re-targets the editor.
        if let hit = hitTestNode(at: docPt), hit.kind == .path,
           hit.id != pathEditingNodeId, (hit.points?.count ?? 0) >= 2 {
            selectedNodeIds = [hit.id]
            enterPathEditing(nodeId: hit.id)
            return true
        }

        // 4. Blank canvas: clear the anchor selection / leave editing, then let the
        //    standard selection + marquee behaviour run.
        let changed = selectedAnchorIndex != nil || hoveredPathAnchorIndex != nil || hoveredPathHandle != nil
        selectedAnchorIndex = nil
        hoveredPathAnchorIndex = nil
        hoveredPathHandle = nil
        if hitTestNode(at: docPt) == nil {
            cancelPathEditing()
        } else if changed {
            syncPathEditingOverlay()
            needsDisplay = true
        }
        return false
    }

    private func handlePathEditDrag(to docPt: CGPoint) {
        guard let drag = pathEditDrag,
              let id = pathEditingNodeId,
              let before = pathEditBeforePoints,
              let nodeIndex = document.nodes.firstIndex(where: { $0.id == id }) else { return }

        let delta = CGPoint(x: docPt.x - pathEditDragStartDoc.x, y: docPt.y - pathEditDragStartDoc.y)
        var points = before

        switch drag {
        case .anchor(let index):
            guard index >= 0, index < points.count else { return }
            var anchor = points[index]
            anchor.x += delta.x
            anchor.y += delta.y
            if let handle = anchor.inHandle {
                anchor.inHandle = CGPoint(x: handle.x + delta.x, y: handle.y + delta.y)
            }
            if let handle = anchor.outHandle {
                anchor.outHandle = CGPoint(x: handle.x + delta.x, y: handle.y + delta.y)
            }
            points[index] = anchor

        case .handle(let index, let kind):
            guard index >= 0, index < points.count else { return }
            var anchor = points[index]
            if kind == .outHandle {
                anchor.outHandle = docPt
            } else {
                anchor.inHandle = docPt
            }
            if anchor.type == .sharp {
                anchor.type = .smooth
            }
            Self.mirrorPathHandle(anchor: &anchor, moved: kind, target: docPt)
            points[index] = anchor
        }

        writePathPoints(nodeIndex: nodeIndex, points: points)
    }

    private func finishPathEditDrag() {
        guard pathEditDrag != nil else { return }
        pathEditDrag = nil
        guard let id = pathEditingNodeId, let before = pathEditBeforePoints else { return }
        pathEditBeforePoints = nil
        guard let after = document.nodes.first(where: { $0.id == id })?.points, after != before else { return }
        onPathPointsCommitted?(id, before, after)
        onToolActionCompleted?("path.points.edited")
        needsDisplay = true
    }

    /// Writes anchors back to the node, recomputing its absolute bounds in one mutation.
    private func writePathPoints(nodeIndex: Int, points: [PenAnchor]) {
        guard nodeIndex >= 0, nodeIndex < document.nodes.count else { return }
        var node = document.nodes[nodeIndex]
        node.points = points
        let bounds = bezierBounds(for: points)
        node.x = bounds.origin.x
        node.y = bounds.origin.y
        node.width = max(bounds.width, 1.0)
        node.height = max(bounds.height, 1.0)
        document.nodes[nodeIndex] = node
        syncPathEditingOverlay()
        needsDisplay = true
    }

    private func togglePathAnchorType(index: Int, to type: NodeType) {
        guard let id = pathEditingNodeId,
              let nodeIndex = document.nodes.firstIndex(where: { $0.id == id }),
              let before = document.nodes[nodeIndex].points,
              index >= 0, index < before.count else { return }

        var node = document.nodes[nodeIndex]
        GeometryEngine.convertNode(in: &node, at: index, to: type)
        guard let after = node.points, after != before else { return }

        let bounds = bezierBounds(for: after)
        node.x = bounds.origin.x
        node.y = bounds.origin.y
        node.width = max(bounds.width, 1.0)
        node.height = max(bounds.height, 1.0)
        document.nodes[nodeIndex] = node
        selectedAnchorIndex = index
        syncPathEditingOverlay()
        needsDisplay = true
        onPathPointsCommitted?(id, before, after)
        onToolActionCompleted?("path.anchor.typeChanged")
    }

    public func convertSelectedPathAnchor(to type: NodeType) {
        guard let index = selectedAnchorIndex else { return }
        togglePathAnchorType(index: index, to: type)
    }

    public func deleteSelectedPathAnchor() {
        guard let id = pathEditingNodeId,
              let index = selectedAnchorIndex,
              let nodeIndex = document.nodes.firstIndex(where: { $0.id == id }),
              let before = document.nodes[nodeIndex].points,
              before.count > 2,
              index >= 0, index < before.count else { return }

        var points = before
        points.remove(at: index)
        selectedAnchorIndex = min(index, points.count - 1)
        writePathPoints(nodeIndex: nodeIndex, points: points)
        onPathPointsCommitted?(id, before, points)
        onToolActionCompleted?("path.anchor.removed")
    }

    public func breakSelectedPathAnchor() {
        guard let id = pathEditingNodeId,
              let index = selectedAnchorIndex,
              let nodeIndex = document.nodes.firstIndex(where: { $0.id == id }),
              let before = document.nodes[nodeIndex].points,
              index >= 0, index < before.count else { return }

        var targetNode = document.nodes[nodeIndex]
        let splitNodes = GeometryEngine.breakCurve(in: &targetNode, at: index)
        if splitNodes.count == 1 {
            document.nodes[nodeIndex] = splitNodes[0]
            selectedAnchorIndex = 0
            syncPathEditingOverlay()
            needsDisplay = true
            onPathPointsCommitted?(id, before, splitNodes[0].points ?? [])
            onToolActionCompleted?("path.curve.broken")
        } else if splitNodes.count > 1 {
            document.nodes[nodeIndex] = splitNodes[0]
            for extra in splitNodes.dropFirst() {
                document.nodes.insert(extra, at: nodeIndex + 1)
            }
            selectedAnchorIndex = nil
            cancelPathEditing()
            needsDisplay = true
            onToolActionCompleted?("path.curve.split")
        }
    }

    private func pathSegmentMidpointHitTest(at docPt: CGPoint, points: [PenAnchor], threshold: CGFloat = 8.0) -> (index: Int, point: CGPoint)? {
        guard points.count >= 2 else { return nil }
        let count = points.count
        let isClosed = points.first?.isClosed ?? false
        let maxSegments = isClosed ? count : count - 1

        var bestMatch: (index: Int, point: CGPoint)?
        var bestDist = CGFloat.greatestFiniteMagnitude

        for i in 0..<maxSegments {
            let next = (i + 1) % count
            let p1 = CGPoint(x: points[i].x, y: points[i].y)
            let p2 = CGPoint(x: points[next].x, y: points[next].y)
            let mid = CGPoint(x: (p1.x + p2.x) / 2.0, y: (p1.y + p2.y) / 2.0)

            let dx = p2.x - p1.x
            let dy = p2.y - p1.y
            let lenSq = dx * dx + dy * dy
            if lenSq <= 0.0001 { continue }
            let t = max(0, min(1, ((docPt.x - p1.x) * dx + (docPt.y - p1.y) * dy) / lenSq))
            let proj = CGPoint(x: p1.x + t * dx, y: p1.y + t * dy)
            let dist = hypot(docPt.x - proj.x, docPt.y - proj.y) * max(zoom, 0.0001)
            if dist <= threshold && dist < bestDist {
                bestDist = dist
                bestMatch = (i + 1, mid)
            }
        }
        return bestMatch
    }

    private func pathAnchorHitTest(at docPt: CGPoint, points: [PenAnchor]) -> Int? {
        let tolerance = 6.0 / max(zoom, 0.0001)
        var bestIndex: Int?
        var bestDistance = CGFloat.greatestFiniteMagnitude
        for (index, anchor) in points.enumerated() {
            let distance = hypot(docPt.x - anchor.x, docPt.y - anchor.y)
            if distance <= tolerance, distance < bestDistance {
                bestIndex = index
                bestDistance = distance
            }
        }
        return bestIndex
    }

    private func pathHandleHitTest(at docPt: CGPoint, points: [PenAnchor]) -> PathEditingHandleRef? {
        let tolerance = 6.0 / max(zoom, 0.0001)
        var best: PathEditingHandleRef?
        var bestDistance = CGFloat.greatestFiniteMagnitude
        for (index, anchor) in points.enumerated() {
            if let outHandle = anchor.outHandle {
                let distance = hypot(docPt.x - outHandle.x, docPt.y - outHandle.y)
                if distance <= tolerance, distance < bestDistance {
                    best = PathEditingHandleRef(anchorIndex: index, kind: .outHandle)
                    bestDistance = distance
                }
            }
            if let inHandle = anchor.inHandle {
                let distance = hypot(docPt.x - inHandle.x, docPt.y - inHandle.y)
                if distance <= tolerance, distance < bestDistance {
                    best = PathEditingHandleRef(anchorIndex: index, kind: .inHandle)
                    bestDistance = distance
                }
            }
        }
        return best
    }

    private func updatePathEditingHover(at docPt: CGPoint) {
        guard let points = pathEditingNode?.points else { return }
        let handle = pathHandleHitTest(at: docPt, points: points)
        let anchorIndex = handle?.anchorIndex ?? pathAnchorHitTest(at: docPt, points: points)
        if handle != hoveredPathHandle || anchorIndex != hoveredPathAnchorIndex {
            hoveredPathHandle = handle
            hoveredPathAnchorIndex = anchorIndex
            syncPathEditingOverlay()
        }
    }

    /// Mirrors the opposite handle for symmetric anchors (equal length) and smooth
    /// anchors (same tangent direction, preserved opposite length).
    private static func mirrorPathHandle(anchor: inout PenAnchor, moved kind: PathEditingHandleKind, target: CGPoint) {
        let vx = target.x - anchor.x
        let vy = target.y - anchor.y
        let length = hypot(vx, vy)
        guard length > 0.0001 else { return }

        switch anchor.type {
        case .symmetric:
            let mirrored = CGPoint(x: anchor.x - vx, y: anchor.y - vy)
            if kind == .outHandle {
                anchor.inHandle = mirrored
            } else {
                anchor.outHandle = mirrored
            }
        case .smooth:
            let opposite = kind == .outHandle ? anchor.inHandle : anchor.outHandle
            let oppositeLength = opposite.map { hypot($0.x - anchor.x, $0.y - anchor.y) } ?? 0
            guard oppositeLength > 0.0001 else { return }
            let mirrored = CGPoint(
                x: anchor.x - vx / length * oppositeLength,
                y: anchor.y - vy / length * oppositeLength
            )
            if kind == .outHandle {
                anchor.inHandle = mirrored
            } else {
                anchor.outHandle = mirrored
            }
        default:
            break
        }
    }

    // MARK: - Image Nodes

    private static let imageCache = NSCache<NSString, CGImage>()

    /// Decodes an image node source (base64 data URL or file path) with caching.
    static func decodedImage(for source: String) -> CGImage? {
        guard !source.isEmpty else { return nil }
        let key = NSString(string: "\(source.count)-\(source.hashValue)")
        if let cached = imageCache.object(forKey: key) {
            return cached
        }

        var image: CGImage?
        if source.hasPrefix("data:image/") {
            image = ImageImporter.cgImage(fromDataURL: source)
        } else {
            let url: URL?
            if source.hasPrefix("file://") {
                url = URL(string: source)
            } else if source.hasPrefix("/") {
                url = URL(fileURLWithPath: source)
            } else {
                url = nil
            }
            if let url, let data = try? Data(contentsOf: url) {
                image = ImageImporter.cgImage(from: data)
            } else if let url, let nsImage = NSImage(contentsOf: url) {
                image = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil)
            }
        }

        if let image {
            imageCache.setObject(image, forKey: key)
        }
        return image
    }

    private func drawImageNode(_ node: VOONode, in ctx: CGContext, rect: CGRect) {
        if let source = node.src, let image = Self.decodedImage(for: source) {
            ctx.saveGState()
            ctx.clip(to: rect)
            ctx.draw(image, in: rect)
            ctx.restoreGState()
        } else {
            drawImagePlaceholder(in: ctx, rect: rect)
        }
    }

    private func drawImagePlaceholder(in ctx: CGContext, rect: CGRect) {
        ctx.saveGState()
        ctx.setFillColor(NSColor(red: 0.12, green: 0.12, blue: 0.14, alpha: 1.0).cgColor)
        ctx.fill(rect)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
        ctx.setLineWidth(1.0 / max(zoom, 0.0001))
        ctx.stroke(rect)

        let side = max(min(rect.width, rect.height) * 0.35, 10.0)
        let glyph = CGRect(x: rect.midX - side / 2.0, y: rect.midY - side / 2.0, width: side, height: side)
        ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
        ctx.setLineWidth(max(1.0 / max(zoom, 0.0001), side * 0.05))

        let path = CGMutablePath()
        path.addRoundedRect(in: glyph, cornerWidth: side * 0.14, cornerHeight: side * 0.14)
        path.move(to: CGPoint(x: glyph.minX + side * 0.14, y: glyph.minY + side * 0.22))
        path.addLine(to: CGPoint(x: glyph.minX + side * 0.38, y: glyph.minY + side * 0.55))
        path.addLine(to: CGPoint(x: glyph.minX + side * 0.58, y: glyph.minY + side * 0.34))
        path.addLine(to: CGPoint(x: glyph.minX + side * 0.88, y: glyph.minY + side * 0.72))
        path.addEllipse(in: CGRect(x: glyph.maxX - side * 0.34, y: glyph.maxY - side * 0.30,
                                   width: side * 0.14, height: side * 0.14))
        ctx.addPath(path)
        ctx.strokePath()
        ctx.restoreGState()
    }

    // MARK: - Image Drag & Drop

    public override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        draggedFileURLs(from: sender).isEmpty ? [] : .copy
    }

    public override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
        draggedFileURLs(from: sender).isEmpty ? [] : .copy
    }

    public override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool {
        !draggedFileURLs(from: sender).isEmpty
    }

    public override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let urls = draggedFileURLs(from: sender)
        guard !urls.isEmpty else { return false }
        let location = convert(sender.draggingLocation, from: nil)
        onDropFiles?(urls, documentPoint(from: location))
        return true
    }

    private func draggedFileURLs(from sender: NSDraggingInfo) -> [URL] {
        guard onDropFiles != nil else { return [] }
        let options: [NSPasteboard.ReadingOptionKey: Any] = [.urlReadingFileURLsOnly: true]
        guard let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: options) as? [URL] else {
            return []
        }
        return urls
    }

    // MARK: - Freehand Painting (brush / eraser)

    /// Hydrates the in-memory paint layer from an existing document node.
    /// Passing `nil` for `dataURL` clears the layer.
    public func setPaintNode(id: String?, dataURL: String?) {
        if isPainting {
            cancelPaintStroke(restore: true)
        }
        paintNodeId = id

        guard let dataURL, !dataURL.isEmpty else {
            paintBitmap = nil
            paintGraphicsContext = nil
            paintBitmapDocSize = .zero
            paintBitmapScale = 1.0
            paintCGImage = nil
            paintLayerDocumentId = nil
            paintStrokeBackup = nil
            lastPaintDocPoint = nil
            needsDisplay = true
            return
        }

        ensurePaintBitmap()
        clearPaintBitmap()

        if let image = ImageImporter.cgImage(fromDataURL: dataURL),
           let bitmap = paintBitmap,
           let context = paintGraphicsContext?.cgContext {
            context.saveGState()
            context.interpolationQuality = .high
            context.draw(
                image,
                in: CGRect(x: 0, y: 0, width: CGFloat(bitmap.pixelsWide), height: CGFloat(bitmap.pixelsHigh))
            )
            context.restoreGState()
            paintCGImage = nil
        }
        paintLayerDocumentId = document.id
        needsDisplay = true
    }

    /// Discards the in-progress stroke; when `restore` is true the pre-stroke pixels are put back.
    public func cancelPaintStroke(restore: Bool = true) {
        guard isPainting else { return }
        isPainting = false
        lastPaintDocPoint = nil
        if restore, let backup = paintStrokeBackup, let bitmap = paintBitmap, let data = bitmap.bitmapData {
            let length = min(backup.count, bitmap.bytesPerRow * bitmap.pixelsHigh)
            if length > 0 {
                backup.copyBytes(to: data, count: length)
            }
            paintCGImage = nil
        }
        paintStrokeBackup = nil
        needsDisplay = true
        onToolActionCompleted?("paint.stroke.cancelled")
    }

    // MARK: Painting gesture

    private func beginPaintStroke(at docPt: CGPoint) {
        ensurePaintBitmap()
        guard paintBitmap != nil else { return }

        isPainting = true
        paintStrokeBackup = paintPixelSnapshot()
        lastPaintDocPoint = docPt
        paintCursorDocPoint = docPt
        stampPaint(
            at: docPt,
            diameter: activeTool == .eraser ? eraserDiameter : brushDiameter,
            erasing: activeTool == .eraser
        )
        needsDisplay = true
        onToolActionCompleted?(activeTool == .eraser ? "paint.erase.started" : "paint.stroke.started")
    }

    private func continuePaintStroke(to docPt: CGPoint) {
        guard isPainting else { return }
        paintCursorDocPoint = docPt

        let erasing = activeTool == .eraser
        let diameter = erasing ? eraserDiameter : brushDiameter
        let spacing = max(1.0, diameter / 4.0)
        let start = lastPaintDocPoint ?? docPt
        let dx = docPt.x - start.x
        let dy = docPt.y - start.y
        let distance = hypot(dx, dy)

        if distance >= spacing {
            let steps = max(1, Int(ceil(distance / spacing)))
            for step in 1...steps {
                let t = CGFloat(step) / CGFloat(steps)
                stampPaint(
                    at: CGPoint(x: start.x + dx * t, y: start.y + dy * t),
                    diameter: diameter,
                    erasing: erasing
                )
            }
            lastPaintDocPoint = docPt
        }
        needsDisplay = true
    }

    private func finishPaintStroke() {
        guard isPainting else { return }
        let erasing = activeTool == .eraser
        isPainting = false
        lastPaintDocPoint = nil
        paintStrokeBackup = nil
        needsDisplay = true

        guard let dataURL = paintDataURL() else { return }
        onPaintStrokeCommitted?(paintNodeId, dataURL)
        onToolActionCompleted?(erasing ? "paint.erase.committed" : "paint.stroke.committed")
    }

    // MARK: Painting bitmap plumbing

    private func handlePaintDocumentChangeIfNeeded() {
        guard let boundId = paintLayerDocumentId, boundId != document.id else { return }
        if isPainting {
            cancelPaintStroke(restore: false)
        }
        paintBitmap = nil
        paintGraphicsContext = nil
        paintBitmapDocSize = .zero
        paintBitmapScale = 1.0
        paintCGImage = nil
        paintLayerDocumentId = nil
        paintStrokeBackup = nil
        lastPaintDocPoint = nil
        paintNodeId = nil
    }

    private func ensurePaintBitmap() {
        handlePaintDocumentChangeIfNeeded()

        let canvas = document.canvas
        let docSize = CGSize(width: max(canvas.width, 1.0), height: max(canvas.height, 1.0))
        let scale = min(1.0, paintBitmapMaxDimension / max(docSize.width, docSize.height))
        let pixelWidth = max(1, Int((docSize.width * scale).rounded()))
        let pixelHeight = max(1, Int((docSize.height * scale).rounded()))

        if let bitmap = paintBitmap,
           paintBitmapDocSize == docSize,
           bitmap.pixelsWide == pixelWidth,
           bitmap.pixelsHigh == pixelHeight {
            return
        }

        guard let bitmap = makePaintBitmap(pixelWidth: pixelWidth, pixelHeight: pixelHeight) else { return }
        let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap)

        // Preserve existing pixels (scaled) when the canvas size or bitmap cap changes.
        if let previousImage = paintBitmap?.cgImage,
           let context = graphicsContext?.cgContext {
            context.saveGState()
            context.interpolationQuality = .high
            context.draw(
                previousImage,
                in: CGRect(x: 0, y: 0, width: CGFloat(pixelWidth), height: CGFloat(pixelHeight))
            )
            context.restoreGState()
        }

        paintBitmap = bitmap
        paintGraphicsContext = graphicsContext
        paintBitmapDocSize = docSize
        paintBitmapScale = scale
        paintCGImage = nil
        paintLayerDocumentId = document.id
    }

    private func makePaintBitmap(pixelWidth: Int, pixelHeight: Int) -> NSBitmapImageRep? {
        guard let bitmap = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: pixelWidth,
            pixelsHigh: pixelHeight,
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .calibratedRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        ) else { return nil }
        if let data = bitmap.bitmapData {
            data.update(repeating: 0, count: bitmap.bytesPerRow * bitmap.pixelsHigh)
        }
        return bitmap
    }

    private func clearPaintBitmap() {
        guard let bitmap = paintBitmap, let data = bitmap.bitmapData else { return }
        data.update(repeating: 0, count: bitmap.bytesPerRow * bitmap.pixelsHigh)
        paintCGImage = nil
    }

    /// One round antialiased dab (full alpha centre, ~1px feathered edge), or an alpha erase.
    private func stampPaint(at docPoint: CGPoint, diameter: CGFloat, erasing: Bool) {
        guard paintBitmap != nil, let context = paintGraphicsContext?.cgContext else { return }

        let canvas = document.canvas
        let scale = paintBitmapScale
        let center = CGPoint(x: (docPoint.x - canvas.x) * scale, y: (docPoint.y - canvas.y) * scale)
        let radius = max(0.5, diameter / 2.0 * scale)

        context.saveGState()
        context.setShouldAntialias(true)
        if erasing {
            context.setBlendMode(.clear)
        } else {
            context.setBlendMode(.normal)
            let color = NSColor(hexString: brushColorHex) ?? ThemeTokens.colorMint
            let resolved = color.usingColorSpace(.sRGB) ?? color
            context.setFillColor(resolved.cgColor)
        }
        context.fillEllipse(in: CGRect(
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2.0,
            height: radius * 2.0
        ))
        context.restoreGState()

        paintCGImage = nil
    }

    /// Current paint layer as a display CGImage (cached until the next stamp/clear).
    private func paintDisplayImage() -> CGImage? {
        guard let bitmap = paintBitmap else { return nil }
        if let cached = paintCGImage { return cached }
        let image = bitmap.cgImage
        paintCGImage = image
        return image
    }

    private func paintPixelSnapshot() -> Data? {
        guard let bitmap = paintBitmap, let data = bitmap.bitmapData else { return nil }
        let length = bitmap.bytesPerRow * bitmap.pixelsHigh
        guard length > 0 else { return nil }
        return Data(bytes: data, count: length)
    }

    private func paintDataURL() -> String? {
        guard let bitmap = paintBitmap,
              let pngData = bitmap.representation(using: .png, properties: [:]) else { return nil }
        return "data:image/png;base64,\(pngData.base64EncodedString())"
    }

    // MARK: - Global Keyboard Pan Helpers

    /// Begin space-bar panning from a window-level key monitor (works even when
    /// the canvas has not received focus yet).
    public func beginSpacePan() {
        isSpaceKeyDown = true
        NSCursor.openHand.set()
    }

    public func endSpacePan() {
        isSpaceKeyDown = false
        isPanningWithSpace = false
        updateCursorForTool()
    }

    // MARK: - Lasso & Magic Wand Selection

    private func finishLassoSelection(additive: Bool) {
        guard lassoPoints.count >= 3 else { return }
        if !additive { selectedNodeIds.removeAll() }
        let polygon = lassoPoints
        for node in document.nodes where node.style.visible && !node.style.locked {
            let rect = CGRect(x: node.x, y: node.y, width: node.width, height: node.height)
            let center = CGPoint(x: rect.midX, y: rect.midY)
            let corners = [
                CGPoint(x: rect.minX, y: rect.minY),
                CGPoint(x: rect.maxX, y: rect.minY),
                CGPoint(x: rect.minX, y: rect.maxY),
                CGPoint(x: rect.maxX, y: rect.maxY)
            ]
            let selected = Self.pointInPolygon(center, polygon: polygon)
                || corners.contains { Self.pointInPolygon($0, polygon: polygon) }
                || polygon.contains { rect.contains($0) }
            if selected {
                if additive { selectedNodeIds.insert(node.id) } else { selectedNodeIds.insert(node.id) }
            }
        }
        updateTransformHandlesTarget()
    }

    private func performMagicWandSelection(at docPoint: CGPoint, additive: Bool) {
        guard let hit = hitTestNode(at: docPoint) else {
            if !additive { selectedNodeIds.removeAll() }
            updateTransformHandlesTarget()
            needsDisplay = true
            return
        }
        let targetFill = hit.style.fill.lowercased()
        var matched = Set<String>()
        for node in document.nodes where node.style.visible && !node.style.locked {
            if node.style.fill.lowercased() == targetFill { matched.insert(node.id) }
        }
        if additive {
            selectedNodeIds.formUnion(matched)
        } else {
            selectedNodeIds = matched
        }
        updateTransformHandlesTarget()
        needsDisplay = true
    }

    static func pointInPolygon(_ point: CGPoint, polygon: [CGPoint]) -> Bool {
        guard polygon.count >= 3 else { return false }
        var inside = false
        var j = polygon.count - 1
        for i in 0..<polygon.count {
            let pi = polygon[i], pj = polygon[j]
            if (pi.y > point.y) != (pj.y > point.y) {
                let x = (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x
                if point.x < x { inside.toggle() }
            }
            j = i
        }
        return inside
    }

    // MARK: - Canvas Creation Gestures (shape / artboard / pen / text)

    /// Cancels any in-flight shape, artboard or pen creation gesture and clears its preview.
    public func cancelCreation() {
        let hadCreation = isCreatingShape || !penAnchors.isEmpty
        isCreatingShape = false
        shapeCurrentRect = .zero
        shapeConstrainSquare = false
        shapeWantsEllipse = false
        resetPenState()
        if hadCreation {
            onToolActionCompleted?("creation.cancelled")
        }
        syncCreationPreview()
        needsDisplay = true
    }

    // MARK: Shape / Artboard

    private func beginShapeCreation(at docPt: CGPoint, tool: StudioToolType) {
        window?.makeFirstResponder(self)
        shapeCreationTool = tool
        shapeStartPoint = docPt
        shapeCurrentRect = CGRect(origin: docPt, size: .zero)
        shapeConstrainSquare = false
        shapeWantsEllipse = false
        isCreatingShape = true
        onToolActionCompleted?("creation.started")
        syncCreationPreview()
        needsDisplay = true
    }

    private func updateShapeCreation(at docPt: CGPoint, event: NSEvent) {
        guard isCreatingShape else { return }
        shapeConstrainSquare = event.modifierFlags.contains(.shift)
        shapeWantsEllipse = event.modifierFlags.contains(.option) && shapeCreationTool == .shapes
        shapeCurrentRect = normalizedCreationRect(
            from: shapeStartPoint,
            to: docPt,
            constrainSquare: shapeConstrainSquare
        )
        syncCreationPreview()
        needsDisplay = true
    }

    private func finishShapeCreation(at docPt: CGPoint, event: NSEvent) {
        guard isCreatingShape else { return }

        let shift = event.modifierFlags.contains(.shift)
        let option = event.modifierFlags.contains(.option)
        var rect = normalizedCreationRect(from: shapeStartPoint, to: docPt, constrainSquare: shift)

        // A click (no meaningful drag) drops a default-sized shape at the click point.
        let screenDragDistance = hypot(docPt.x - shapeStartPoint.x, docPt.y - shapeStartPoint.y) * max(zoom, 0.0001)
        if screenDragDistance <= 3.0 {
            rect = CGRect(origin: shapeStartPoint, size: CGSize(width: 120.0, height: 120.0))
        }

        let isArtboard = shapeCreationTool == .artboard
        let wantsEllipse = !isArtboard && (option || activeShapeSubTool == .ellipse)

        if isArtboard {
            rect.size.width = max(rect.width, 40.0)
            rect.size.height = max(rect.height, 40.0)
        } else {
            rect.size.width = max(rect.width, 1.0)
            rect.size.height = max(rect.height, 1.0)
        }

        let node: VOONode
        if isArtboard {
            node = VOONode(
                kind: .frame,
                name: "Artboard \(nextAvailableIndex(prefix: "Artboard "))",
                x: rect.origin.x,
                y: rect.origin.y,
                width: rect.width,
                height: rect.height,
                style: LayerStyle(
                    fill: "#171717",
                    stroke: "#2e2e32",
                    strokeWidth: 1.0,
                    opacity: 1.0,
                    blendMode: "normal"
                )
            )
        } else {
            switch activeShapeSubTool {
            case .rect:
                if wantsEllipse {
                    node = VOONode(
                        kind: .ellipse,
                        name: "Ellipse \(nextAvailableIndex(prefix: "Ellipse "))",
                        x: rect.origin.x,
                        y: rect.origin.y,
                        width: rect.width,
                        height: rect.height,
                        style: LayerStyle(fill: "#000000", stroke: "#000000", strokeWidth: 0, opacity: 1.0, blendMode: "normal")
                    )
                } else {
                    node = VOONode(
                        kind: .rect,
                        name: "Rectangle \(nextAvailableIndex(prefix: "Rectangle "))",
                        x: rect.origin.x,
                        y: rect.origin.y,
                        width: rect.width,
                        height: rect.height,
                        style: LayerStyle(fill: "#000000", stroke: "#000000", strokeWidth: 0, opacity: 1.0, blendMode: "normal")
                    )
                }
            case .ellipse:
                node = VOONode(
                    kind: .ellipse,
                    name: "Ellipse \(nextAvailableIndex(prefix: "Ellipse "))",
                    x: rect.origin.x,
                    y: rect.origin.y,
                    width: rect.width,
                    height: rect.height,
                    style: LayerStyle(fill: "#000000", stroke: "#000000", strokeWidth: 0, opacity: 1.0, blendMode: "normal")
                )
            case .polygon:
                let pts = ShapeGenerators.regularPolygonPoints(in: rect, sides: 6)
                let anchors = pts.enumerated().map { idx, pt in
                    PenAnchor(x: pt.x, y: pt.y, isClosed: idx == pts.count - 1, type: .sharp)
                }
                node = VOONode(
                    kind: .path,
                    name: "Polygon \(nextAvailableIndex(prefix: "Polygon "))",
                    x: rect.origin.x,
                    y: rect.origin.y,
                    width: rect.width,
                    height: rect.height,
                    style: LayerStyle(fill: "#000000", stroke: "#000000", strokeWidth: 0, opacity: 1.0, blendMode: "normal"),
                    points: anchors
                )
            case .star:
                let pts = ShapeGenerators.starPoints(in: rect, spikes: 5, innerRatio: 0.382)
                let anchors = pts.enumerated().map { idx, pt in
                    PenAnchor(x: pt.x, y: pt.y, isClosed: idx == pts.count - 1, type: .sharp)
                }
                node = VOONode(
                    kind: .path,
                    name: "Star \(nextAvailableIndex(prefix: "Star "))",
                    x: rect.origin.x,
                    y: rect.origin.y,
                    width: rect.width,
                    height: rect.height,
                    style: LayerStyle(fill: "#000000", stroke: "#000000", strokeWidth: 0, opacity: 1.0, blendMode: "normal"),
                    points: anchors
                )
            case .line:
                let pts = ShapeGenerators.linePoints(from: shapeStartPoint, to: docPt)
                let anchors = [
                    PenAnchor(x: pts[0].x, y: pts[0].y, isClosed: false, type: .sharp),
                    PenAnchor(x: pts[1].x, y: pts[1].y, isClosed: false, type: .sharp)
                ]
                let minX = min(pts[0].x, pts[1].x), minY = min(pts[0].y, pts[1].y)
                let w = max(abs(pts[1].x - pts[0].x), 1.0), h = max(abs(pts[1].y - pts[0].y), 1.0)
                node = VOONode(
                    kind: .path,
                    name: "Line \(nextAvailableIndex(prefix: "Line "))",
                    x: minX,
                    y: minY,
                    width: w,
                    height: h,
                    style: LayerStyle(fill: "none", stroke: "#ffffff", strokeWidth: 2.0, opacity: 1.0, blendMode: "normal"),
                    points: anchors
                )
            case .arrow:
                let pts = ShapeGenerators.arrowPoints(from: shapeStartPoint, to: docPt, headLength: 16.0, headAngle: .pi / 6.0)
                let anchors = [
                    PenAnchor(x: pts[0].x, y: pts[0].y, isClosed: false, type: .sharp),
                    PenAnchor(x: pts[1].x, y: pts[1].y, isClosed: false, type: .sharp),
                    PenAnchor(x: pts[2].x, y: pts[2].y, isClosed: false, type: .sharp),
                    PenAnchor(x: pts[1].x, y: pts[1].y, isClosed: false, type: .sharp),
                    PenAnchor(x: pts[3].x, y: pts[3].y, isClosed: false, type: .sharp)
                ]
                let minX = min(min(pts[0].x, pts[1].x), min(pts[2].x, pts[3].x))
                let minY = min(min(pts[0].y, pts[1].y), min(pts[2].y, pts[3].y))
                let maxX = max(max(pts[0].x, pts[1].x), max(pts[2].x, pts[3].x))
                let maxY = max(max(pts[0].y, pts[1].y), max(pts[2].y, pts[3].y))
                node = VOONode(
                    kind: .path,
                    name: "Arrow \(nextAvailableIndex(prefix: "Arrow "))",
                    x: minX,
                    y: minY,
                    width: max(maxX - minX, 1.0),
                    height: max(maxY - minY, 1.0),
                    style: LayerStyle(fill: "none", stroke: "#ffffff", strokeWidth: 2.0, opacity: 1.0, blendMode: "normal"),
                    points: anchors
                )
            }
        }

        // Clear the gesture *before* invoking the host hook (which may synchronously insert
        // the node into `document` and therefore trigger this view's document didSet).
        isCreatingShape = false
        shapeCurrentRect = .zero
        shapeConstrainSquare = false
        shapeWantsEllipse = false
        syncCreationPreview()
        needsDisplay = true

        onCreateNode?(node)
        if isArtboard {
            onToolActionCompleted?("artboard.created")
        } else {
            onToolActionCompleted?("shape.created.\(activeShapeSubTool.rawValue)")
        }
    }

    private func normalizedCreationRect(from start: CGPoint, to end: CGPoint, constrainSquare: Bool) -> CGRect {
        var dx = end.x - start.x
        var dy = end.y - start.y
        if constrainSquare {
            let side = max(abs(dx), abs(dy))
            dx = dx < 0 ? -side : side
            dy = dy < 0 ? -side : side
        }
        return CGRect(
            x: min(start.x, start.x + dx),
            y: min(start.y, start.y + dy),
            width: abs(dx),
            height: abs(dy)
        )
    }

    // MARK: Pen

    private func handlePenMouseDown(at docPt: CGPoint, event: NSEvent) {
        window?.makeFirstResponder(self)
        penPreviewPoint = docPt

        // Double-click finishes the current path (open), matching the VOO web pen tool.
        if event.clickCount >= 2, penAnchors.count >= 2 {
            finishPenPath(closed: false)
            return
        }

        // Clicking the first anchor closes the path.
        if penAnchors.count >= 2, let first = penAnchors.first {
            let hitRadius = 10.0 / max(zoom, 0.0001)
            if hypot(docPt.x - first.x, docPt.y - first.y) <= hitRadius {
                finishPenPath(closed: true)
                return
            }
        }

        penAnchors.append(PenAnchor(x: docPt.x, y: docPt.y, type: .sharp))
        penAnchorCount = penAnchors.count
        penDraggingAnchorIndex = penAnchors.count - 1
        penHoveringFirstAnchor = false
        syncCreationPreview()
        needsDisplay = true
    }

    private func handlePenDrag(to docPt: CGPoint) {
        guard let index = penDraggingAnchorIndex, index >= 0, index < penAnchors.count else {
            penPreviewPoint = docPt
            syncCreationPreview()
            needsDisplay = true
            return
        }

        var anchor = penAnchors[index]
        let dx = docPt.x - anchor.x
        let dy = docPt.y - anchor.y
        if hypot(dx, dy) * max(zoom, 0.0001) > 1.5 {
            // Dragging from an anchor produces a symmetric smooth curve.
            anchor.outHandle = CGPoint(x: docPt.x, y: docPt.y)
            anchor.inHandle = CGPoint(x: anchor.x - dx, y: anchor.y - dy)
            anchor.type = .symmetric
        } else {
            anchor.outHandle = nil
            anchor.inHandle = nil
            anchor.type = .sharp
        }
        penAnchors[index] = anchor
        penPreviewPoint = docPt
        syncCreationPreview()
        needsDisplay = true
    }

    private func removeLastPenAnchor() {
        guard !penAnchors.isEmpty else { return }
        penAnchors.removeLast()
        penAnchorCount = penAnchors.count
        penDraggingAnchorIndex = nil
        penHoveringFirstAnchor = false
        syncCreationPreview()
        needsDisplay = true
    }

    private func finishPenPath(closed: Bool) {
        guard penAnchors.count >= 2 else {
            resetPenState()
            return
        }

        var anchors = penAnchors
        if closed {
            anchors[anchors.count - 1].isClosed = true
        }
        let bounds = bezierBounds(for: anchors)
        let node = VOONode(
            kind: .path,
            name: "Path \(nextAvailableIndex(prefix: "Path "))",
            x: bounds.origin.x,
            y: bounds.origin.y,
            width: max(bounds.width, 1.0),
            height: max(bounds.height, 1.0),
            style: LayerStyle(
                fill: "none",
                stroke: "#ffffff",
                strokeWidth: 1.0,
                opacity: 1.0,
                blendMode: "normal"
            ),
            points: anchors
        )

        resetPenState()
        onCreateNode?(node)
        onPenPathCreated?(node)
        onToolActionCompleted?("path.created")
    }

    private func resetPenState() {
        penAnchors.removeAll()
        penAnchorCount = 0
        penDraggingAnchorIndex = nil
        penPreviewPoint = nil
        penHoveringFirstAnchor = false
        syncCreationPreview()
        needsDisplay = true
    }

    private func bezierBounds(for anchors: [PenAnchor]) -> CGRect {
        guard !anchors.isEmpty else { return .zero }
        var minX = CGFloat.greatestFiniteMagnitude
        var minY = CGFloat.greatestFiniteMagnitude
        var maxX = -CGFloat.greatestFiniteMagnitude
        var maxY = -CGFloat.greatestFiniteMagnitude

        func include(_ point: CGPoint) {
            minX = min(minX, point.x)
            minY = min(minY, point.y)
            maxX = max(maxX, point.x)
            maxY = max(maxY, point.y)
        }

        for anchor in anchors {
            include(anchor.point)
            if let handle = anchor.inHandle { include(handle) }
            if let handle = anchor.outHandle { include(handle) }
        }
        return CGRect(
            x: minX,
            y: minY,
            width: max(maxX - minX, 1.0),
            height: max(maxY - minY, 1.0)
        )
    }

    private func nextAvailableIndex(prefix: String) -> Int {
        var maxIndex = 0
        for node in document.nodes where node.name.hasPrefix(prefix) {
            let suffix = String(node.name.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces)
            if let value = Int(suffix), value > maxIndex {
                maxIndex = value
            }
        }
        return maxIndex + 1
    }

    private func syncCreationPreview() {
        creationPreview.zoom = zoom
        creationPreview.panOffset = panOffset
        creationPreview.showsRulers = showRulers
        creationPreview.shapePreviewRect = isCreatingShape ? shapeCurrentRect : .zero
        creationPreview.shapeIsEllipse = shapeWantsEllipse
        creationPreview.shapeIsArtboard = shapeCreationTool == .artboard
        creationPreview.penAnchors = penAnchors
        creationPreview.penPreviewPoint = penPreviewPoint
        creationPreview.penDragAnchorIndex = penDraggingAnchorIndex
        creationPreview.penHoveringFirstAnchor = penHoveringFirstAnchor
        creationPreview.needsDisplay = true
    }
}

// MARK: - Vector Path Editing Overlay (Node Tool Anchors & Bezier Handles)

/// Transparent overlay that renders the node tool's vector editing chrome:
/// 8x8 anchor squares (white, mint when selected) and 6px circular in/out
/// Bezier handle knobs connected by mint lines. The overlay is never
/// hit-tested; `CanvasStageView` drives all anchor/handle gestures.
public final class PathEditingOverlayView: NSView {
    public var zoom: CGFloat = 1.0 {
        didSet { if oldValue != zoom { needsDisplay = true } }
    }

    public var panOffset: CGPoint = .zero {
        didSet { if oldValue != panOffset { needsDisplay = true } }
    }

    public var rulerOffset: CGFloat = 0 {
        didSet { if oldValue != rulerOffset { needsDisplay = true } }
    }

    /// Snapshot of the path node currently being edited.
    public var editingNode: VOONode? {
        didSet { needsDisplay = true }
    }

    public var selectedAnchorIndex: Int? {
        didSet { if oldValue != selectedAnchorIndex { needsDisplay = true } }
    }

    public var hoveredAnchorIndex: Int? {
        didSet { if oldValue != hoveredAnchorIndex { needsDisplay = true } }
    }

    public var hoveredHandle: PathEditingHandleRef? {
        didSet { if oldValue != hoveredHandle { needsDisplay = true } }
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupPathEditingOverlay()
    }

    public convenience init() {
        self.init(frame: .zero)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupPathEditingOverlay()
    }

    private func setupPathEditingOverlay() {
        wantsLayer = false
        setAccessibilityIdentifier("Canvas.PathEditor")
        setAccessibilityRole(.group)
        setAccessibilityLabel("Vector path editor")
    }

    /// The overlay must never intercept mouse gestures meant for the canvas.
    public override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// Document -> view-space conversion, identical to the transform-handle overlay.
    public func viewPoint(forDocumentPoint docPoint: CGPoint) -> CGPoint {
        CGPoint(
            x: docPoint.x * zoom + panOffset.x + rulerOffset,
            y: docPoint.y * zoom + panOffset.y + rulerOffset
        )
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let node = editingNode, node.kind == .path,
              let points = node.points, !points.isEmpty else { return }
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // 1. Bezier handle lines + circular knobs (6px diameter, mint).
        for (index, anchor) in points.enumerated() {
            let anchorPoint = viewPoint(forDocumentPoint: anchor.point)
            let handles: [(PathEditingHandleKind, CGPoint?)] = [
                (.inHandle, anchor.inHandle),
                (.outHandle, anchor.outHandle)
            ]
            for (kind, handle) in handles {
                guard let handle else { continue }
                let handlePoint = viewPoint(forDocumentPoint: handle)
                let isHovered = hoveredHandle?.anchorIndex == index && hoveredHandle?.kind == kind

                ctx.setStrokeColor(ThemeTokens.colorMint.withAlphaComponent(0.60).cgColor)
                ctx.setLineWidth(1.0)
                ctx.strokeLineSegments(between: [anchorPoint, handlePoint])

                let radius: CGFloat = isHovered ? 4.5 : 3.0
                let knobRect = CGRect(
                    x: handlePoint.x - radius,
                    y: handlePoint.y - radius,
                    width: radius * 2.0,
                    height: radius * 2.0
                )
                ctx.setFillColor(isHovered ? NSColor.white.cgColor : ThemeTokens.colorMint.cgColor)
                ctx.fillEllipse(in: knobRect)
                ctx.setStrokeColor(NSColor.black.cgColor)
                ctx.setLineWidth(1.0)
                ctx.strokeEllipse(in: knobRect)
            }
        }

        // 2. Anchor squares (8x8; selected anchor = mint fill).
        let anchorSize: CGFloat = 8.0
        for (index, anchor) in points.enumerated() {
            let point = viewPoint(forDocumentPoint: anchor.point)
            let rect = CGRect(
                x: point.x - anchorSize / 2.0,
                y: point.y - anchorSize / 2.0,
                width: anchorSize,
                height: anchorSize
            )
            let isSelected = selectedAnchorIndex == index
            let isHovered = hoveredAnchorIndex == index

            ctx.setFillColor(isSelected ? ThemeTokens.colorMint.cgColor : NSColor.white.cgColor)
            ctx.fill(rect)
            if isSelected {
                ctx.setStrokeColor(NSColor.black.cgColor)
            } else if isHovered {
                ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
            } else {
                ctx.setStrokeColor(NSColor.black.cgColor)
            }
            ctx.setLineWidth(isHovered && !isSelected ? 2.0 : 1.0)
            ctx.stroke(rect)
        }
    }
}

// MARK: - Canvas Creation Preview Overlay (Dashed Mint Shape / Pen Previews)

/// Transparent overlay that renders the live creation previews for the canvas tools:
/// dashed mint rectangle / ellipse / artboard outlines and the pen path being built
/// (mint stroke, anchor dots and symmetric handle projections).
/// It is never hit-tested, so all gestures continue to reach `CanvasStageView`.
public final class CanvasCreationPreviewView: NSView {
    public var zoom: CGFloat = 1.0 {
        didSet { if oldValue != zoom { needsDisplay = true } }
    }

    public var panOffset: CGPoint = .zero {
        didSet { if oldValue != panOffset { needsDisplay = true } }
    }

    public var showsRulers: Bool = false {
        didSet { if oldValue != showsRulers { needsDisplay = true } }
    }

    /// Normalized document-space rectangle for the in-flight shape / artboard drag.
    public var shapePreviewRect: CGRect = .zero {
        didSet { if oldValue != shapePreviewRect { needsDisplay = true } }
    }

    public var shapeIsEllipse: Bool = false {
        didSet { if oldValue != shapeIsEllipse { needsDisplay = true } }
    }

    public var shapeIsArtboard: Bool = false {
        didSet { if oldValue != shapeIsArtboard { needsDisplay = true } }
    }

    public var penAnchors: [PenAnchor] = [] {
        didSet { needsDisplay = true }
    }

    public var penPreviewPoint: CGPoint? {
        didSet { needsDisplay = true }
    }

    public var penDragAnchorIndex: Int? {
        didSet { needsDisplay = true }
    }

    public var penHoveringFirstAnchor: Bool = false {
        didSet { if oldValue != penHoveringFirstAnchor { needsDisplay = true } }
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupPreview()
    }

    public convenience init() {
        self.init(frame: .zero)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupPreview()
    }

    private func setupPreview() {
        wantsLayer = false
        setAccessibilityIdentifier("Canvas.CreationPreview")
        setAccessibilityRole(.group)
        setAccessibilityLabel("Canvas creation preview")
    }

    /// The preview must never intercept mouse gestures meant for the canvas.
    public override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// Builds an absolute-coordinate CGPath from VOO pen anchors (shared by preview + node drawing).
    public static func bezierPath(from anchors: [PenAnchor], closed: Bool = false) -> CGPath {
        let path = CGMutablePath()
        guard let first = anchors.first else { return path }
        path.move(to: first.point)
        guard anchors.count > 1 else { return path }

        for index in 1..<anchors.count {
            let previous = anchors[index - 1]
            let current = anchors[index]
            path.addCurve(
                to: current.point,
                control1: previous.outHandle ?? previous.point,
                control2: current.inHandle ?? current.point
            )
        }

        if closed, let last = anchors.last {
            path.addCurve(
                to: first.point,
                control1: last.outHandle ?? last.point,
                control2: first.inHandle ?? first.point
            )
            path.closeSubpath()
        }
        return path
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let wantsShapePreview = shapePreviewRect.width > 0.01 || shapePreviewRect.height > 0.01
        let wantsPenPreview = !penAnchors.isEmpty || penPreviewPoint != nil
        guard wantsShapePreview || wantsPenPreview else { return }

        let rulerOffset = showsRulers ? ThemeTokens.rulerTrackThickness : 0.0
        let originX = rulerOffset + panOffset.x
        let originY = rulerOffset + panOffset.y

        ctx.saveGState()
        if showsRulers {
            ctx.clip(to: CGRect(
                x: rulerOffset,
                y: rulerOffset,
                width: max(bounds.width - rulerOffset, 0.0),
                height: max(bounds.height - rulerOffset, 0.0)
            ))
        }
        ctx.translateBy(x: originX, y: originY)
        ctx.scaleBy(x: zoom, y: zoom)

        if wantsShapePreview {
            drawShapePreview(in: ctx)
        }
        if wantsPenPreview {
            drawPenPreview(in: ctx)
        }

        ctx.restoreGState()
    }

    private func drawShapePreview(in ctx: CGContext) {
        let rect = shapePreviewRect
        guard rect.width > 0.01 || rect.height > 0.01 else { return }
        let unit = max(zoom, 0.0001)

        ctx.saveGState()
        ctx.setLineWidth(1.0 / unit)
        ctx.setLineDash(phase: 0, lengths: [4.0 / unit, 4.0 / unit])
        ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
        ctx.setFillColor(ThemeTokens.colorMint.withAlphaComponent(0.08).cgColor)

        if shapeIsEllipse {
            let ellipse = CGPath(ellipseIn: rect, transform: nil)
            ctx.addPath(ellipse)
            ctx.fillPath()
            ctx.addPath(ellipse)
            ctx.strokePath()
        } else {
            ctx.fill(rect)
            ctx.stroke(rect)
        }

        // Live dimension badge sits just above the preview rectangle.
        let label = "\(Int(round(rect.width))) × \(Int(round(rect.height)))"
        let attrs: [NSAttributedString.Key: Any] = [
            .font: ThemeFonts.monoDigit(size: 10.0 / unit, weight: .medium),
            .foregroundColor: NSColor.white
        ]
        let textSize = (label as NSString).size(withAttributes: attrs)
        let horizontalPadding = 5.0 / unit
        let badgeHeight = 15.0 / unit
        let badgeRect = CGRect(
            x: rect.midX - (textSize.width + horizontalPadding * 2.0) / 2.0,
            y: rect.maxY + 6.0 / unit,
            width: textSize.width + horizontalPadding * 2.0,
            height: badgeHeight
        )
        ctx.setLineDash(phase: 0, lengths: [])
        let badgePath = CGPath(
            roundedRect: badgeRect,
            cornerWidth: badgeHeight / 2.0,
            cornerHeight: badgeHeight / 2.0,
            transform: nil
        )
        ctx.setFillColor(NSColor(red: 0.07, green: 0.07, blue: 0.08, alpha: 0.92).cgColor)
        ctx.addPath(badgePath)
        ctx.fillPath()
        (label as NSString).draw(
            at: CGPoint(x: badgeRect.minX + horizontalPadding, y: badgeRect.minY + 3.0 / unit),
            withAttributes: attrs
        )

        ctx.restoreGState()
    }

    private func drawPenPreview(in ctx: CGContext) {
        let unit = max(zoom, 0.0001)

        // 1. Committed segments of the path being built.
        if !penAnchors.isEmpty {
            let path = Self.bezierPath(from: penAnchors, closed: penAnchors.last?.isClosed ?? false)
            ctx.saveGState()
            ctx.setLineWidth(1.0 / unit)
            ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
            ctx.addPath(path)
            ctx.strokePath()
            ctx.restoreGState()
        }

        // 2. Rubber-band segment from the last anchor to the cursor.
        if let last = penAnchors.last, let previewPoint = penPreviewPoint, penDragAnchorIndex == nil {
            ctx.saveGState()
            ctx.setLineWidth(1.0 / unit)
            ctx.setLineDash(phase: 0, lengths: [4.0 / unit, 4.0 / unit])
            ctx.setStrokeColor(ThemeTokens.colorMint.withAlphaComponent(0.75).cgColor)
            let rubberBand = CGMutablePath()
            rubberBand.move(to: last.point)
            rubberBand.addCurve(
                to: previewPoint,
                control1: last.outHandle ?? last.point,
                control2: previewPoint
            )
            ctx.addPath(rubberBand)
            ctx.strokePath()
            ctx.restoreGState()
        }

        // 3. Symmetric handles of the anchor currently being dragged.
        if let index = penDragAnchorIndex, index >= 0, index < penAnchors.count {
            let anchor = penAnchors[index]
            ctx.saveGState()
            ctx.setLineWidth(1.0 / unit)
            ctx.setStrokeColor(ThemeTokens.colorMint.withAlphaComponent(0.65).cgColor)
            if let outHandle = anchor.outHandle {
                ctx.strokeLineSegments(between: [anchor.point, outHandle])
                drawDot(outHandle, radius: 2.0 / unit, fill: ThemeTokens.colorMint, stroke: nil, in: ctx)
            }
            if let inHandle = anchor.inHandle {
                ctx.strokeLineSegments(between: [anchor.point, inHandle])
                drawDot(inHandle, radius: 2.0 / unit, fill: ThemeTokens.colorMint, stroke: nil, in: ctx)
            }
            ctx.restoreGState()
        }

        // 4. Anchor dots (the first one grows + turns mint when hovering closes the path).
        for (index, anchor) in penAnchors.enumerated() {
            let closable = index == 0 && penAnchors.count >= 2 && penHoveringFirstAnchor
            let radius = (closable ? 5.0 : 3.5) / unit
            drawDot(
                anchor.point,
                radius: radius,
                fill: closable ? ThemeTokens.colorMint : NSColor.white,
                stroke: closable ? NSColor.black : ThemeTokens.colorMint,
                in: ctx
            )
        }
    }

    private func drawDot(_ point: CGPoint, radius: CGFloat, fill: NSColor, stroke: NSColor?, in ctx: CGContext) {
        let rect = CGRect(
            x: point.x - radius,
            y: point.y - radius,
            width: radius * 2.0,
            height: radius * 2.0
        )
        ctx.setFillColor(fill.cgColor)
        ctx.fillEllipse(in: rect)
        if let strokeColor = stroke {
            ctx.setStrokeColor(strokeColor.cgColor)
            ctx.setLineWidth(1.0 / max(zoom, 0.0001))
            ctx.strokeEllipse(in: rect)
        }
    }
}

// MARK: - Floating Bottom Tools Pill (Silver / Light Glass Capsule #e3e3e3)

public class FloatingBottomToolsView: NSView {
    public var onUndo: (() -> Void)?
    public var onRedo: (() -> Void)?
    public var onToggleGrid: (() -> Void)?
    public var onZoomIn: (() -> Void)?
    public var onZoomOut: (() -> Void)?
    public var onZoomFit: (() -> Void)?

    public var zoomText: String = "100%" {
        didSet {
            needsDisplay = true
        }
    }

    public override init(frame frameRect: NSRect) {
        super.init(frame: NSRect(x: 0, y: 0, width: 200, height: 34))
        wantsLayer = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Silver Capsule Background #e3e3e3
        let pillRadius = bounds.height / 2.0
        let path = CGPath(roundedRect: bounds, cornerWidth: pillRadius, cornerHeight: pillRadius, transform: nil)
        ctx.setFillColor(NSColor(red: 0.89, green: 0.89, blue: 0.89, alpha: 1.0).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // Border
        ctx.setStrokeColor(NSColor(white: 0.0, alpha: 0.10).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()

        // 1. Undo (x: 10)
        let undoRect = CGRect(x: 12, y: bounds.midY - 7, width: 14, height: 14)
        VooIconFactory.drawUndo(in: undoRect, color: .black)

        // 2. Redo (x: 36)
        let redoRect = CGRect(x: 34, y: bounds.midY - 7, width: 14, height: 14)
        VooIconFactory.drawRedo(in: redoRect, color: .black)

        // Divider 1 (x: 56)
        ctx.setStrokeColor(NSColor(white: 0.0, alpha: 0.15).cgColor)
        ctx.setLineWidth(1.0)
        ctx.strokeLineSegments(between: [CGPoint(x: 56, y: bounds.midY - 8), CGPoint(x: 56, y: bounds.midY + 8)])

        // 3. Grid (x: 66)
        let gridRect = CGRect(x: 66, y: bounds.midY - 7, width: 14, height: 14)
        VooIconFactory.drawGrid(in: gridRect, color: .black)

        // Divider 2 (x: 88)
        ctx.strokeLineSegments(between: [CGPoint(x: 88, y: bounds.midY - 8), CGPoint(x: 88, y: bounds.midY + 8)])

        // 4. Zoom In (+) (x: 98) - matching VOO editor.jpg
        let plusRect = CGRect(x: 98, y: bounds.midY - 7, width: 14, height: 14)
        VooIconFactory.drawPlus(in: plusRect, color: .black)

        // 5. Zoom Label (x: 114..156)
        let pStyle = NSMutableParagraphStyle()
        pStyle.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .font: ThemeFonts.monoDigit(size: 11, weight: .semibold),
            .foregroundColor: NSColor.black,
            .paragraphStyle: pStyle
        ]
        let str = NSAttributedString(string: zoomText, attributes: attrs)
        str.draw(in: NSRect(x: 114, y: bounds.midY - 7, width: 44, height: 16))

        // 6. Zoom Out (-) (x: 164)
        let minusRect = CGRect(x: 164, y: bounds.midY - 7, width: 14, height: 14)
        VooIconFactory.drawMinus(in: minusRect, color: .black)
    }

    public override func mouseDown(with event: NSEvent) {
        let pt = convert(event.locationInWindow, from: nil)
        if pt.x < 30 {
            onUndo?()
        } else if pt.x < 52 {
            onRedo?()
        } else if pt.x < 80 {
            onToggleGrid?()
        } else if pt.x < 112 {
            onZoomIn?()
        } else if pt.x < 156 {
            onZoomFit?()
        } else {
            onZoomOut?()
        }
    }
}

// MARK: - TextStyleResolver Extension for M2 Typography
extension TextStyleResolver {
    public static func resolvedAttributes(for node: VOONode, color: NSColor, size: CGFloat) -> [NSAttributedString.Key: Any] {
        var attrs = TextStyleResolver.attributes(for: node, color: color, size: size)
        if node.underline == true {
            attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
        }
        if node.italic == true {
            let currentFont = (attrs[.font] as? NSFont) ?? TextStyleResolver.font(for: node, size: size)
            let descriptor = currentFont.fontDescriptor.withSymbolicTraits(.italic)
            if let italicFont = NSFont(descriptor: descriptor, size: currentFont.pointSize) {
                attrs[.font] = italicFont
            }
        }
        return attrs
    }
}

