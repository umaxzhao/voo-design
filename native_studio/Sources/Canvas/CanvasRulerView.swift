//
//  CanvasRulerView.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M5.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import CoreText
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

    private static let majorTickLength: CGFloat = 7.0
    private static let minorTickLength: CGFloat = 3.0
    private static let labelFontSize: CGFloat = 9.0
    /// Web `MIN_MINOR_SPACING_PX` in `rulers_geometry.js`.
    private static let minMinorSpacing: CGFloat = 6.0

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let b = bounds

        // 1. Track ground: the current web rulers overlay the #525252 stage
        // with the same ground; only separators/ticks distinguish the strip.
        ctx.setFillColor(ThemeTokens.colorRulerBackground.cgColor)
        ctx.fill(b)

        // 2. Inner-edge separator: web `border-b border-white/10` (horizontal)
        // / `border-r border-white/10` (vertical). In this y-up view the canvas
        // edge is the bottom for the horizontal ruler and the right for the
        // vertical one.
        ctx.setStrokeColor(ThemeTokens.colorRulerSeparator.cgColor)
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
        guard screenStep > 4.0 else { return }

        // Minor ticks follow the web rule: divide by 5 while they stay at least
        // `MIN_MINOR_SPACING_PX` apart, otherwise fall back to halves (or none).
        let minorDivisions: Int
        if screenStep / 5.0 >= Self.minMinorSpacing {
            minorDivisions = 5
        } else if screenStep / 2.0 >= Self.minMinorSpacing {
            minorDivisions = 2
        } else {
            minorDivisions = 0
        }

        let font = ThemeFonts.monoDigit(size: Self.labelFontSize, weight: .regular)
        let textAttrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: ThemeTokens.colorRulerLabel
        ]

        ctx.setStrokeColor(ThemeTokens.colorRulerTick.cgColor)

        if orientation == .horizontal {
            let startDocX = -panOffset / zoom
            let firstTick = floor(startDocX / majorStep) * majorStep
            var docX = firstTick

            while true {
                let screenX = floor(docX * zoom + panOffset) + 0.5
                if screenX > b.width + 100.0 { break }

                if screenX >= -50.0 {
                    // Major tick: 7px tall from the canvas edge (bottom in y-up).
                    ctx.setLineWidth(1.0)
                    ctx.strokeLineSegments(between: [CGPoint(x: screenX, y: 0), CGPoint(x: screenX, y: Self.majorTickLength)])

                    // Label: web `top-[2px] ... left: tick + 3px`, 9px mono,
                    // top-aligned near the ruler's outer edge.
                    let attrStr = NSAttributedString(string: String(Int(round(docX))), attributes: textAttrs)
                    let line = CTLineCreateWithAttributedString(attrStr)
                    var ascent: CGFloat = 0
                    var descent: CGFloat = 0
                    var leading: CGFloat = 0
                    _ = CTLineGetTypographicBounds(line, &ascent, &descent, &leading)
                    ctx.saveGState()
                    ctx.textPosition = CGPoint(x: screenX + 3.0, y: b.height - 2.0 - ascent)
                    CTLineDraw(line, ctx)
                    ctx.restoreGState()

                    // Minor ticks: same white/25 as the majors, 3px tall.
                    if minorDivisions > 0 {
                        for sub in 1..<minorDivisions {
                            let subScreenX = floor(screenX + (screenStep / CGFloat(minorDivisions)) * CGFloat(sub)) + 0.5
                            ctx.strokeLineSegments(between: [CGPoint(x: subScreenX, y: 0), CGPoint(x: subScreenX, y: Self.minorTickLength)])
                        }
                    }
                }

                docX += majorStep
            }

            // 4. Cursor Projection Guide (VOO mint #a7ffd4)
            if let cur = cursorPosition {
                let curScreen = floor(cur * zoom + panOffset) + 0.5
                ctx.setStrokeColor(NSColor(hex: ThemeTokens.accentMint).cgColor)
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
                    // Major tick: 7px wide, anchored to the canvas edge (right).
                    ctx.setLineWidth(1.0)
                    ctx.strokeLineSegments(between: [CGPoint(x: b.width - Self.majorTickLength, y: screenY), CGPoint(x: b.width, y: screenY)])

                    // Label rotated 90° like the web (`rotate(90deg)`, origin
                    // left/top), reading top-to-bottom next to the track edge.
                    let attrStr = NSAttributedString(string: String(Int(round(docY))), attributes: textAttrs)
                    let line = CTLineCreateWithAttributedString(attrStr)
                    ctx.saveGState()
                    ctx.translateBy(x: 2.0, y: screenY - 3.0)
                    ctx.rotate(by: -CGFloat.pi / 2.0)
                    ctx.textPosition = .zero
                    CTLineDraw(line, ctx)
                    ctx.restoreGState()

                    // Minor ticks: white/25, 3px wide.
                    if minorDivisions > 0 {
                        for sub in 1..<minorDivisions {
                            let subScreenY = floor(screenY + (screenStep / CGFloat(minorDivisions)) * CGFloat(sub)) + 0.5
                            ctx.strokeLineSegments(between: [CGPoint(x: b.width - Self.minorTickLength, y: subScreenY), CGPoint(x: b.width, y: subScreenY)])
                        }
                    }
                }

                docY += majorStep
            }

            // Cursor Projection Guide (VOO mint #a7ffd4)
            if let cur = cursorPosition {
                let curScreen = floor(cur * zoom + panOffset) + 0.5
                ctx.setStrokeColor(NSColor(hex: ThemeTokens.accentMint).cgColor)
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
