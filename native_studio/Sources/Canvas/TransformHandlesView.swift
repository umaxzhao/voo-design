//
//  TransformHandlesView.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M5.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Transform Handle Types

public enum TransformHandleType: Int, CaseIterable, Sendable, Equatable {
    case topLeft = 0
    case topCenter = 1
    case topRight = 2
    case middleRight = 3
    case bottomRight = 4
    case bottomCenter = 5
    case bottomLeft = 6
    case middleLeft = 7
    case rotatePin = 8

    public var cursor: NSCursor {
        switch self {
        case .topLeft, .bottomRight:
            return NSCursor.crosshair
        case .topRight, .bottomLeft:
            return NSCursor.crosshair
        case .topCenter, .bottomCenter:
            return NSCursor.resizeUpDown
        case .middleLeft, .middleRight:
            return NSCursor.resizeLeftRight
        case .rotatePin:
            return NSCursor.crosshair
        }
    }
}

// MARK: - Transform Handles View (8-Point Bounding Box & Rotation Stalk)

public class TransformHandlesView: NSView {
    public var targetRect: CGRect = .zero {
        didSet {
            if oldValue != targetRect {
                needsDisplay = true
            }
        }
    }

    public var rotationAngle: CGFloat = 0.0 { // Degrees
        didSet {
            if oldValue != rotationAngle {
                needsDisplay = true
            }
        }
    }

    public var zoom: CGFloat = 1.0 {
        didSet {
            if oldValue != zoom {
                needsDisplay = true
            }
        }
    }

    public var isVisible: Bool = true {
        didSet {
            if oldValue != isVisible {
                needsDisplay = true
            }
        }
    }

    /// Viewport translation in stage points (mirrors CanvasStageView.panOffset).
    public var panOffset: CGPoint = .zero {
        didSet {
            if oldValue != panOffset {
                needsDisplay = true
            }
        }
    }

    /// Ruler track thickness (0 when rulers are hidden).
    public var rulerOffset: CGFloat = 0 {
        didSet {
            if oldValue != rulerOffset {
                needsDisplay = true
            }
        }
    }

    /// The handles view is inset from the stage by the ruler thickness.
    public var contentInset: CGFloat = 0 {
        didSet {
            if oldValue != contentInset {
                needsDisplay = true
            }
        }
    }

    /// Converts a document rect into the handles view's coordinate space.
    public func viewRect(forDocumentRect docRect: CGRect) -> CGRect {
        let ox = panOffset.x + rulerOffset - contentInset
        let oy = panOffset.y + rulerOffset - contentInset
        return CGRect(
            x: docRect.minX * zoom + ox,
            y: docRect.minY * zoom + oy,
            width: docRect.width * zoom,
            height: docRect.height * zoom
        )
    }

    /// Converts a document point into the handles view's coordinate space.
    public func viewPoint(forDocumentPoint docPoint: CGPoint) -> CGPoint {
        let ox = panOffset.x + rulerOffset - contentInset
        let oy = panOffset.y + rulerOffset - contentInset
        return CGPoint(x: docPoint.x * zoom + ox, y: docPoint.y * zoom + oy)
    }

    /// Converts a point in the handles view's coordinate space back into document space.
    public func documentPoint(forViewPoint viewPoint: CGPoint) -> CGPoint {
        let ox = panOffset.x + rulerOffset - contentInset
        let oy = panOffset.y + rulerOffset - contentInset
        let safeZoom = max(zoom, 0.0001)
        return CGPoint(x: (viewPoint.x - ox) / safeZoom, y: (viewPoint.y - oy) / safeZoom)
    }

    // MARK: - Rotation Helpers

    private var rotationRadians: CGFloat {
        rotationAngle * .pi / 180.0
    }

    private func rotatedPoint(_ point: CGPoint, around center: CGPoint, by radians: CGFloat) -> CGPoint {
        guard radians != 0 else { return point }
        let dx = point.x - center.x
        let dy = point.y - center.y
        let cosine = cos(radians)
        let sine = sin(radians)
        return CGPoint(
            x: center.x + dx * cosine - dy * sine,
            y: center.y + dx * sine + dy * cosine
        )
    }

    /// Document-space handle positions rotated with the selection frame. The drawing
    /// code and hit-testing share this so rotated handles remain grabbable at their
    /// visible locations.
    public func rotatedHandlePoints(for rect: CGRect) -> [TransformHandleType: CGPoint] {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radians = rotationRadians
        guard radians != 0 else { return handlePoints(for: rect) }
        return handlePoints(for: rect).mapValues { rotatedPoint($0, around: center, by: radians) }
    }

    /// World-space position of a handle after the selection frame rotation is applied.
    private func worldPoint(for handle: TransformHandleType, rect: CGRect, rotation: CGFloat) -> CGPoint? {
        guard let point = handlePoints(for: rect)[handle] else { return nil }
        let center = CGPoint(x: rect.midX, y: rect.midY)
        return rotatedPoint(point, around: center, by: rotation * .pi / 180.0)
    }

    private func oppositeHandle(of handle: TransformHandleType) -> TransformHandleType? {
        switch handle {
        case .topLeft: return .bottomRight
        case .topCenter: return .bottomCenter
        case .topRight: return .bottomLeft
        case .middleRight: return .middleLeft
        case .bottomRight: return .topLeft
        case .bottomCenter: return .topCenter
        case .bottomLeft: return .topRight
        case .middleLeft: return .middleRight
        case .rotatePin: return nil
        }
    }

    private func handlePointsView(for rect: CGRect) -> [TransformHandleType: CGPoint] {
        var map: [TransformHandleType: CGPoint] = [:]
        map[.topLeft] = CGPoint(x: rect.minX, y: rect.minY)
        map[.topCenter] = CGPoint(x: rect.midX, y: rect.minY)
        map[.topRight] = CGPoint(x: rect.maxX, y: rect.minY)
        map[.middleRight] = CGPoint(x: rect.maxX, y: rect.midY)
        map[.bottomRight] = CGPoint(x: rect.maxX, y: rect.maxY)
        map[.bottomCenter] = CGPoint(x: rect.midX, y: rect.maxY)
        map[.bottomLeft] = CGPoint(x: rect.minX, y: rect.maxY)
        map[.middleLeft] = CGPoint(x: rect.minX, y: rect.midY)
        map[.rotatePin] = CGPoint(x: rect.midX, y: rect.maxY + ThemeTokens.rotateStalkOffset)
        return map
    }

    public var onTransformChange: ((_ newRect: CGRect, _ newRotation: CGFloat) -> Void)?

    // Hover & Drag State
    public private(set) var activeHoverHandle: TransformHandleType?
    public private(set) var activeDragHandle: TransformHandleType?
    private var dragStartMousePos: CGPoint = .zero
    private var initialRect: CGRect = .zero
    private var initialRotation: CGFloat = 0.0
    /// World-space position of the opposite handle captured at drag start (rotated resize anchor).
    private var dragStartFixedWorld: CGPoint?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }

    private func setupView() {
        wantsLayer = false
        setAccessibilityIdentifier("transform_handles_overlay")
        setAccessibilityRole(.group)
    }

    // MARK: - Handle Coordinates Calculation

    public func handlePoints(for rect: CGRect) -> [TransformHandleType: CGPoint] {
        var map: [TransformHandleType: CGPoint] = [:]
        map[.topLeft] = CGPoint(x: rect.minX, y: rect.minY)
        map[.topCenter] = CGPoint(x: rect.midX, y: rect.minY)
        map[.topRight] = CGPoint(x: rect.maxX, y: rect.minY)
        map[.middleRight] = CGPoint(x: rect.maxX, y: rect.midY)
        map[.bottomRight] = CGPoint(x: rect.maxX, y: rect.maxY)
        map[.bottomCenter] = CGPoint(x: rect.midX, y: rect.maxY)
        map[.bottomLeft] = CGPoint(x: rect.minX, y: rect.maxY)
        map[.middleLeft] = CGPoint(x: rect.minX, y: rect.midY)

        let stalkOffset = ThemeTokens.rotateStalkOffset / zoom
        // Document space shares the view's y-up convention, so the rotation pin
        // sits above the visual top edge (maxY) of the selection.
        map[.rotatePin] = CGPoint(x: rect.midX, y: rect.maxY + stalkOffset)
        return map
    }

    // MARK: - Hit Testing Handles

    public func hitTestHandle(at docPoint: CGPoint) -> TransformHandleType? {
        guard isVisible, targetRect.width > 0, targetRect.height > 0 else { return nil }

        // Inverse-rotate the document point around the frame center so the visual
        // (rotated) handle positions can be compared against the unrotated math.
        let center = CGPoint(x: targetRect.midX, y: targetRect.midY)
        let localPoint = rotatedPoint(docPoint, around: center, by: -rotationRadians)

        let points = handlePoints(for: targetRect)
        let handleSize = ThemeTokens.handleSize / zoom
        let hitSlop = ThemeTokens.handleHitSlop / zoom
        let hitRadius = (handleSize / 2.0) + hitSlop

        // Check rotate pin first (priority over topCenter)
        if let pin = points[.rotatePin] {
            let d = hypot(localPoint.x - pin.x, localPoint.y - pin.y)
            if d <= hitRadius + 2.0 {
                return .rotatePin
            }
        }

        // Check remaining 8 handles
        for handle in TransformHandleType.allCases where handle != .rotatePin {
            guard let pt = points[handle] else { continue }
            let d = hypot(localPoint.x - pt.x, localPoint.y - pt.y)
            if d <= hitRadius {
                return handle
            }
        }

        return nil
    }

    // MARK: - Drawing

    public override func draw(_ dirtyRect: NSRect) {
        guard isVisible, targetRect.width > 0, targetRect.height > 0 else { return }
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        ctx.saveGState()

        // The selection box is authored in document space; render it in view
        // space so pan / zoom / ruler offsets stay aligned with the canvas.
        let r = viewRect(forDocumentRect: targetRect)

        // Rotate the whole frame (box, handles and stalk) around its visual center
        // so the chrome follows the rotated node.
        if rotationAngle != 0 {
            let center = CGPoint(x: r.midX, y: r.midY)
            ctx.translateBy(x: center.x, y: center.y)
            ctx.rotate(by: rotationRadians)
            ctx.translateBy(x: -center.x, y: -center.y)
        }

        let points = handlePointsView(for: r)
        let handleSize = ThemeTokens.handleSize
        let half = handleSize / 2.0

        // 1. Selection Bounding Box Rectangle (Mint #b2ffd6)
        ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
        ctx.setLineWidth(1.0)
        ctx.stroke(r)

        // 2. Rotation Stalk Connecting Line (from Top Center to Pin)
        if let bc = points[.bottomCenter], let pin = points[.rotatePin] {
            ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
            ctx.setLineWidth(1.0)
            ctx.strokeLineSegments(between: [bc, pin])

            // Rotation Circular Pin Dot
            let pinRadius: CGFloat = 4.5
            let pinRect = CGRect(x: pin.x - pinRadius, y: pin.y - pinRadius, width: pinRadius * 2.0, height: pinRadius * 2.0)
            ctx.setFillColor(NSColor(red: 0.70, green: 1.00, blue: 0.84, alpha: 1.0).cgColor)
            ctx.fillEllipse(in: pinRect)
            ctx.setStrokeColor(NSColor.black.cgColor)
            ctx.setLineWidth(1.0)
            ctx.strokeEllipse(in: pinRect)
        }

        // 3. Draw 8 Square Handles
        for handle in TransformHandleType.allCases where handle != .rotatePin {
            guard let pt = points[handle] else { continue }
            let hRect = CGRect(x: pt.x - half, y: pt.y - half, width: handleSize, height: handleSize)

            ctx.setFillColor(NSColor.white.cgColor)
            ctx.fill(hRect)

            // 8x8 white squares with a 1px black border; hover / active-drag turns mint.
            let isHighlighted = (activeHoverHandle == handle) || (activeDragHandle == handle)
            ctx.setStrokeColor(isHighlighted ? ThemeTokens.colorMint.cgColor : NSColor.black.cgColor)
            ctx.setLineWidth(1.0)
            ctx.stroke(hRect)
        }

        ctx.restoreGState()
    }

    // MARK: - Interactive Mouse Transformations

    public func beginDrag(handle: TransformHandleType, at docPoint: CGPoint) {
        activeDragHandle = handle
        dragStartMousePos = docPoint
        initialRect = targetRect
        initialRotation = rotationAngle
        dragStartFixedWorld = nil
        if handle != .rotatePin, let opposite = oppositeHandle(of: handle) {
            dragStartFixedWorld = worldPoint(for: opposite, rect: initialRect, rotation: initialRotation)
        }
    }

    public func continueDrag(to docPoint: CGPoint) {
        guard let handle = activeDragHandle else { return }

        // Convert the mouse delta into the selection's unrotated local frame so a
        // rotated frame resizes along its own axes.
        let radians = initialRotation * .pi / 180.0
        let rawDx = docPoint.x - dragStartMousePos.x
        let rawDy = docPoint.y - dragStartMousePos.y
        let cosine = cos(-radians)
        let sine = sin(-radians)
        let dx = rawDx * cosine - rawDy * sine
        let dy = rawDx * sine + rawDy * cosine

        var newRect = initialRect

        switch handle {
        case .topLeft:
            newRect.origin.x = initialRect.origin.x + dx
            newRect.origin.y = initialRect.origin.y + dy
            newRect.size.width = max(5.0, initialRect.size.width - dx)
            newRect.size.height = max(5.0, initialRect.size.height - dy)

        case .topCenter:
            newRect.origin.y = initialRect.origin.y + dy
            newRect.size.height = max(5.0, initialRect.size.height - dy)

        case .topRight:
            newRect.origin.y = initialRect.origin.y + dy
            newRect.size.width = max(5.0, initialRect.size.width + dx)
            newRect.size.height = max(5.0, initialRect.size.height - dy)

        case .middleRight:
            newRect.size.width = max(5.0, initialRect.size.width + dx)

        case .bottomRight:
            newRect.size.width = max(5.0, initialRect.size.width + dx)
            newRect.size.height = max(5.0, initialRect.size.height + dy)

        case .bottomCenter:
            newRect.size.height = max(5.0, initialRect.size.height + dy)

        case .bottomLeft:
            newRect.origin.x = initialRect.origin.x + dx
            newRect.size.width = max(5.0, initialRect.size.width - dx)
            newRect.size.height = max(5.0, initialRect.size.height + dy)

        case .middleLeft:
            newRect.origin.x = initialRect.origin.x + dx
            newRect.size.width = max(5.0, initialRect.size.width - dx)

        case .rotatePin:
            let center = CGPoint(x: initialRect.midX, y: initialRect.midY)
            let angleRad = atan2(docPoint.y - center.y, docPoint.x - center.x)
            // The pin sits above the frame center in document space (y-up): subtract
            // 90° so the initial pin position maps to exactly 0°.
            let degrees = (angleRad * 180.0 / .pi) - 90.0
            var finalDeg = degrees.truncatingRemainder(dividingBy: 360.0)
            if finalDeg < 0 { finalDeg += 360.0 }
            rotationAngle = finalDeg
            onTransformChange?(targetRect, rotationAngle)
            needsDisplay = true
            return
        }

        // For rotated frames keep the handle opposite the dragged one anchored in
        // world space (a plain local resize would otherwise drift the frame).
        if initialRotation != 0, let fixedWorld = dragStartFixedWorld,
           let opposite = oppositeHandle(of: handle),
           let newFixedWorld = worldPoint(for: opposite, rect: newRect, rotation: initialRotation) {
            newRect.origin.x += fixedWorld.x - newFixedWorld.x
            newRect.origin.y += fixedWorld.y - newFixedWorld.y
        }

        targetRect = newRect
        onTransformChange?(targetRect, rotationAngle)
        needsDisplay = true
    }

    public func endDrag() {
        activeDragHandle = nil
        dragStartFixedWorld = nil
    }

    public func updateHover(at docPoint: CGPoint) {
        let handle = hitTestHandle(at: docPoint)
        if activeHoverHandle != handle {
            activeHoverHandle = handle
            needsDisplay = true
        }
        if let h = handle {
            h.cursor.set()
        } else {
            NSCursor.arrow.set()
        }
    }
}
