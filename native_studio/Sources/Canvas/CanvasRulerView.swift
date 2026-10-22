//
//  CanvasRulerView.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M5.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Ruler Orientation

public enum RulerOrientation: Sendable, Equatable {
    case horizontal
    case vertical
}

// MARK: - Canvas Ruler View (High Performance CoreGraphics Vector Drawing)

public class CanvasRulerView: NSView {
    public let orientation: RulerOrientation

    public var zoom: CGFloat = 1.0 {
        didSet {
            if oldValue != zoom {
                needsDisplay = true
            }
        }
    }

    public var panOffset: CGFloat = 0.0 {
        didSet {
            if oldValue != panOffset {
                needsDisplay = true
            }
        }
    }

    public var cursorPosition: CGFloat? = nil {
        didSet {
            if oldValue != cursorPosition {
                needsDisplay = true
            }
        }
    }

    public var onGuideCreated: ((_ axis: String, _ position: CGFloat) -> Void)?

    private var isDraggingGuide: Bool = false
    private var dragGuidePosition: CGFloat = 0.0

    public init(orientation: RulerOrientation) {
        self.orientation = orientation
        super.init(frame: .zero)
        setupRuler()
    }

    public override init(frame frameRect: NSRect) {
        self.orientation = .horizontal
        super.init(frame: frameRect)
        setupRuler()
    }

    required init?(coder: NSCoder) {
        self.orientation = .horizontal
        super.init(coder: coder)
        setupRuler()
    }

    private func setupRuler() {
        // Direct CoreGraphics drawing (wantsLayer = false) prevents CALayer backing store overhead
        wantsLayer = false

        let identifier = (orientation == .horizontal) ? AccessibilityCatalog.rulerHorizontal : AccessibilityCatalog.rulerVertical
        setAccessibilityIdentifier(identifier)
        setAccessibilityRole(.ruler)
        setAccessibilityLabel(orientation == .horizontal ? "Horizontal Pixel Ruler" : "Vertical Pixel Ruler")
    }

    // MARK: - Drawing & Layout

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let b = bounds

        // 1. Background fill (#171717)
        ctx.setFillColor(ThemeTokens.colorPanel.cgColor)
        ctx.fill(b)

        // 2. Separator border line (#262626 / borderDefault)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.12).cgColor)
        ctx.setLineWidth(1.0)
        if orientation == .horizontal {
            ctx.strokeLineSegments(between: [CGPoint(x: 0, y: 0.5), CGPoint(x: b.width, y: 0.5)])
        } else {
            ctx.strokeLineSegments(between: [CGPoint(x: b.width - 0.5, y: 0), CGPoint(x: b.width - 0.5, y: b.height)])
        }

        // 3. Adaptive Major Step Selection based on Zoom
        let majorStep: CGFloat
        if zoom >= 8.0 {
            majorStep = 10.0
        } else if zoom >= 4.0 {
            majorStep = 20.0
        } else if zoom >= 2.0 {
            majorStep = 50.0
        } else if zoom >= 0.8 {
            majorStep = 100.0
        } else if zoom >= 0.4 {
            majorStep = 200.0
        } else if zoom >= 0.2 {
            majorStep = 500.0
        } else {
            majorStep = 1000.0
        }

        let screenStep = majorStep * zoom
        guard screenStep > 8.0 else { return }

        let textAttrs: [NSAttributedString.Key: Any] = [
            .font: ThemeFonts.monoDigit(size: 9, weight: .regular),
            .foregroundColor: NSColor(white: 0.60, alpha: 1.0)
        ]

        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.25).cgColor)

        if orientation == .horizontal {
            let startDocX = -panOffset / zoom
            let firstTick = floor(startDocX / majorStep) * majorStep
            var docX = firstTick

            while true {
                let screenX = floor(docX * zoom + panOffset) + 0.5
                if screenX > b.width + 100.0 { break }

                if screenX >= -50.0 {
                    // Major tick (8px high)
                    ctx.setLineWidth(1.0)
                    ctx.strokeLineSegments(between: [CGPoint(x: screenX, y: 0), CGPoint(x: screenX, y: 8)])

                    // Tick numeric label
                    let label = String(format: "%.0f", docX)
                    let attrStr = NSAttributedString(string: label, attributes: textAttrs)
                    attrStr.draw(at: CGPoint(x: screenX + 3.0, y: 2.0))

                    // Minor ticks (5 subdivisions)
                    ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.15).cgColor)
                    for sub in 1...4 {
                        let subScreenX = floor(screenX + (screenStep / 5.0) * CGFloat(sub)) + 0.5
                        let tickH: CGFloat = (sub == 2 || sub == 3) ? 5.0 : 3.0
                        ctx.strokeLineSegments(between: [CGPoint(x: subScreenX, y: 0), CGPoint(x: subScreenX, y: tickH)])
                    }
                    ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.25).cgColor)
                }

                docX += majorStep
            }

            // 4. Cursor Projection Guide (VOO Mint #b2ffd6)
            if let cur = cursorPosition {
                let curScreen = floor(cur * zoom + panOffset) + 0.5
                ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
                ctx.setLineWidth(1.0)
                ctx.strokeLineSegments(between: [CGPoint(x: curScreen, y: 0), CGPoint(x: curScreen, y: b.height)])
            }
        } else {
            // Vertical Ruler
            let startDocY = -panOffset / zoom
            let firstTick = floor(startDocY / majorStep) * majorStep
            var docY = firstTick

            while true {
                let screenY = floor(docY * zoom + panOffset) + 0.5
                if screenY > b.height + 100.0 { break }

                if screenY >= -50.0 {
                    // Major tick (8px wide from right edge)
                    ctx.setLineWidth(1.0)
                    ctx.strokeLineSegments(between: [CGPoint(x: b.width - 8, y: screenY), CGPoint(x: b.width, y: screenY)])

                    // Number label rotated or placed vertically
                    let label = String(format: "%.0f", docY)
                    let attrStr = NSAttributedString(string: label, attributes: textAttrs)
                    attrStr.draw(at: CGPoint(x: 2.0, y: screenY + 2.0))

                    // Minor ticks
                    ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.15).cgColor)
                    for sub in 1...4 {
                        let subScreenY = floor(screenY + (screenStep / 5.0) * CGFloat(sub)) + 0.5
                        let tickW: CGFloat = (sub == 2 || sub == 3) ? 5.0 : 3.0
                        ctx.strokeLineSegments(between: [CGPoint(x: b.width - tickW, y: subScreenY), CGPoint(x: b.width, y: subScreenY)])
                    }
                    ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.25).cgColor)
                }

                docY += majorStep
            }

            // Cursor Projection Guide (VOO Mint #b2ffd6)
            if let cur = cursorPosition {
                let curScreen = floor(cur * zoom + panOffset) + 0.5
                ctx.setStrokeColor(ThemeTokens.colorMint.cgColor)
                ctx.setLineWidth(1.0)
                ctx.strokeLineSegments(between: [CGPoint(x: 0, y: curScreen), CGPoint(x: b.width, y: curScreen)])
            }
        }
    }

    // MARK: - Interactive Guide Creation via Drag

    public override func mouseDown(with event: NSEvent) {
        let loc = convert(event.locationInWindow, from: nil)
        isDraggingGuide = true
        if orientation == .horizontal {
            dragGuidePosition = (loc.x - panOffset) / zoom
        } else {
            dragGuidePosition = (loc.y - panOffset) / zoom
        }
    }

    public override func mouseDragged(with event: NSEvent) {
        guard isDraggingGuide else { return }
        let loc = convert(event.locationInWindow, from: nil)
        if orientation == .horizontal {
            dragGuidePosition = (loc.x - panOffset) / zoom
        } else {
            dragGuidePosition = (loc.y - panOffset) / zoom
        }
        cursorPosition = dragGuidePosition
    }

    public override func mouseUp(with event: NSEvent) {
        guard isDraggingGuide else { return }
        isDraggingGuide = false
        let axis = (orientation == .horizontal) ? "v" : "h" // Dragging horizontally creates a vertical guide line across X
        onGuideCreated?(axis, dragGuidePosition)
    }
}
