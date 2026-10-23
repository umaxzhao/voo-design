//
//  ReferenceUIStudio.swift
//  native_studio tests Support
//
//  Reference models for Milestone M5 (Rulers, Guides, Snapping, Transform Handles).
//  M4 symbols (ThemeTokens, StudioToolType, ToolRailState, AppTitleBarState,
//  TransformAnchor3x3, ColorWheelState, AccessibilityCatalog) are now canonically
//  implemented in production Sources/UI/.
//

import Foundation
import CoreGraphics
import AppKit

// MARK: - M5: Dual Adaptive Pixel Rulers

public final class RulerConfig {
    public static func tickInterval(forZoom zoom: CGFloat) -> CGFloat {
        if zoom >= 4.0 { return 5.0 }
        if zoom >= 2.0 { return 10.0 }
        if zoom >= 0.75 { return 50.0 }
        if zoom >= 0.25 { return 100.0 }
        return 200.0
    }

    public static func cursorIndicatorLine(cursorDocPos: CGPoint, zoom: CGFloat, panOffset: CGPoint) -> (rulerX: CGFloat, rulerY: CGFloat) {
        let screenX = cursorDocPos.x * zoom + panOffset.x + ThemeTokens.rulerTrackThickness
        let screenY = cursorDocPos.y * zoom + panOffset.y + ThemeTokens.rulerTrackThickness
        return (screenX, screenY)
    }
}

// MARK: - M5: Magnetic Snapping Guidelines

public struct SnapGuide: Equatable {
    public enum Orientation { case horizontal, vertical }
    public let orientation: Orientation
    public let position: CGFloat
    public let colorHex: String = ThemeTokens.accentSelection
}

public final class MagneticSnappingEngine {
    public static func snap(
        point: CGPoint,
        targetBounds: [CGRect],
        canvasSize: CGSize,
        zoom: CGFloat,
        bypass: Bool = false
    ) -> (snapped: CGPoint, guides: [SnapGuide]) {
        if bypass { return (point, []) }

        let threshold = ThemeTokens.snapThresholdPx / zoom
        var snappedX = point.x
        var snappedY = point.y
        var guides: [SnapGuide] = []

        var bestDistX: CGFloat = threshold + 0.001
        var bestDistY: CGFloat = threshold + 0.001

        // Canvas edges
        let candidateX: [CGFloat] = [0, canvasSize.width / 2.0, canvasSize.width]
        let candidateY: [CGFloat] = [0, canvasSize.height / 2.0, canvasSize.height]

        for cx in candidateX {
            let d = abs(point.x - cx)
            if d <= threshold && d < bestDistX {
                bestDistX = d
                snappedX = cx
            }
        }

        for cy in candidateY {
            let d = abs(point.y - cy)
            if d <= threshold && d < bestDistY {
                bestDistY = d
                snappedY = cy
            }
        }

        // Sibling bounds & equidistant gap alignment
        for b in targetBounds {
            let bEdgesX = [b.minX, b.midX, b.maxX, b.maxX + 16.0, b.minX - 16.0]
            let bEdgesY = [b.minY, b.midY, b.maxY, b.maxY + 16.0, b.minY - 16.0]
            for ex in bEdgesX {
                let d = abs(point.x - ex)
                if d <= threshold && d < bestDistX {
                    bestDistX = d
                    snappedX = ex
                }
            }
            for ey in bEdgesY {
                let d = abs(point.y - ey)
                if d <= threshold && d < bestDistY {
                    bestDistY = d
                    snappedY = ey
                }
            }
        }

        if bestDistX <= threshold {
            guides.append(SnapGuide(orientation: .vertical, position: snappedX))
        }
        if bestDistY <= threshold {
            guides.append(SnapGuide(orientation: .horizontal, position: snappedY))
        }

        return (CGPoint(x: snappedX, y: snappedY), guides)
    }
}

// MARK: - M5: 8-Point Transform Handles & Rotation Stalk

public final class TransformHandlesEngine {
    public static func handleRects(for box: CGRect) -> [String: CGRect] {
        let size = ThemeTokens.handleSize
        let half = size / 2.0

        return [
            "nw": CGRect(x: box.minX - half, y: box.minY - half, width: size, height: size),
            "n":  CGRect(x: box.midX - half, y: box.minY - half, width: size, height: size),
            "ne": CGRect(x: box.maxX - half, y: box.minY - half, width: size, height: size),
            "e":  CGRect(x: box.maxX - half, y: box.midY - half, width: size, height: size),
            "se": CGRect(x: box.maxX - half, y: box.maxY - half, width: size, height: size),
            "s":  CGRect(x: box.midX - half, y: box.maxY - half, width: size, height: size),
            "sw": CGRect(x: box.minX - half, y: box.maxY - half, width: size, height: size),
            "w":  CGRect(x: box.minX - half, y: box.midY - half, width: size, height: size)
        ]
    }

    public static func rotationStalk(for box: CGRect) -> (base: CGPoint, tip: CGPoint, gripDot: CGRect) {
        let base = CGPoint(x: box.midX, y: box.minY)
        let tip = CGPoint(x: box.midX, y: box.minY - ThemeTokens.rotateStalkOffset)
        let dot = CGRect(x: tip.x - 5.0, y: tip.y - 5.0, width: 10.0, height: 10.0)
        return (base, tip, dot)
    }

    public static func hitTest(point: CGPoint, in box: CGRect) -> String? {
        let grabRadius = ThemeTokens.handleSize / 2.0 + ThemeTokens.handleHitSlop
        let handles = handleRects(for: box)

        for (name, rect) in handles {
            let center = CGPoint(x: rect.midX, y: rect.midY)
            if hypot(point.x - center.x, point.y - center.y) <= grabRadius {
                return name
            }
        }

        let stalk = rotationStalk(for: box)
        let stalkCenter = CGPoint(x: stalk.gripDot.midX, y: stalk.gripDot.midY)
        if hypot(point.x - stalkCenter.x, point.y - stalkCenter.y) <= grabRadius {
            return "rotation"
        }

        return nil
    }

    public static func dimensionChipText(for box: CGRect) -> String {
        return "\(Int(round(box.width))) × \(Int(round(box.height))) px"
    }
}
