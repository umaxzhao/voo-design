//
//  ColorPickerView.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - ColorWheelState (HSV to Uppercase Hex String)

public final class ColorWheelState: @unchecked Sendable {
    public var hue: CGFloat        // 0..360
    public var saturation: CGFloat // 0..1
    public var value: CGFloat      // 0..1

    public init(hue: CGFloat = 150.0, saturation: CGFloat = 0.5, value: CGFloat = 1.0) {
        var h = hue.truncatingRemainder(dividingBy: 360.0)
        if h < 0 { h += 360.0 }
        self.hue = h
        self.saturation = min(max(saturation, 0), 1)
        self.value = min(max(value, 0), 1)
    }

    public var hexString: String {
        let c = value * saturation
        let x = c * (1.0 - abs((hue / 60.0).truncatingRemainder(dividingBy: 2.0) - 1.0))
        let m = value - c

        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0
        switch Int(hue / 60.0) % 6 {
        case 0: r1 = c; g1 = x; b1 = 0
        case 1: r1 = x; g1 = c; b1 = 0
        case 2: r1 = 0; g1 = c; b1 = x
        case 3: r1 = 0; g1 = x; b1 = c
        case 4: r1 = x; g1 = 0; b1 = c
        case 5: r1 = c; g1 = 0; b1 = x
        default: break
        }

        let r = Int((r1 + m) * 255.0)
        let g = Int((g1 + m) * 255.0)
        let b = Int((b1 + m) * 255.0)
        return String(format: "#%02X%02X%02X", r, g, b)
    }
}

// MARK: - Color Swatch Button

public class ColorSwatchButton: NSView {
    public var colorHex: String = "#262626" {
        didSet { needsDisplay = true }
    }
    public var onClick: (() -> Void)?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    public override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: ThemeTokens.radiusMd, yRadius: ThemeTokens.radiusMd)
        let color = NSColor(hex: colorHex)
        color.setFill()
        path.fill()

        NSColor(white: 1.0, alpha: 0.2).setStroke()
        path.lineWidth = 1.0
        path.stroke()
    }

    public override func mouseDown(with event: NSEvent) {
        onClick?()
    }
}

// MARK: - Color Picker Interactive View (360° Circular HSV Wheel)

public class ColorPickerView: NSView, NSTextFieldDelegate {
    public var state = ColorWheelState() {
        didSet {
            hexInputField.stringValue = state.hexString
            needsDisplay = true
        }
    }
    public var onColorChanged: ((String) -> Void)?

    private let hexInputField = NSTextField()
    private let quickSwatchesStack = NSStackView()

    private let presetHexes = [
        "#000000", "#171717", "#262626", "#525252",
        "#a7ffd4", "#b2ffd6", "#E5B2FF", "#ffe066"
    ]

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        setAccessibilityIdentifier(AccessibilityCatalog.colorPicker)
        setAccessibilityRole(.group)

        // Hex input field
        hexInputField.translatesAutoresizingMaskIntoConstraints = false
        hexInputField.stringValue = state.hexString
        hexInputField.font = ThemeFonts.mono(size: 11, weight: .regular)
        hexInputField.textColor = .white
        hexInputField.isBordered = false
        hexInputField.drawsBackground = true
        hexInputField.backgroundColor = ThemeTokens.colorRaised
        hexInputField.focusRingType = .none
        hexInputField.alignment = .center
        hexInputField.delegate = self
        addSubview(hexInputField)

        // Preset Swatches
        quickSwatchesStack.translatesAutoresizingMaskIntoConstraints = false
        quickSwatchesStack.orientation = .horizontal
        quickSwatchesStack.spacing = 4
        quickSwatchesStack.distribution = .fillEqually
        addSubview(quickSwatchesStack)

        for hex in presetHexes {
            let chip = ColorSwatchButton()
            chip.colorHex = hex
            chip.translatesAutoresizingMaskIntoConstraints = false
            chip.onClick = { [weak self] in
                guard let self = self else { return }
                self.updateFromHex(hex)
            }
            quickSwatchesStack.addArrangedSubview(chip)
        }

        NSLayoutConstraint.activate([
            hexInputField.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
            hexInputField.centerXAnchor.constraint(equalTo: centerXAnchor),
            hexInputField.widthAnchor.constraint(equalToConstant: 80),
            hexInputField.heightAnchor.constraint(equalToConstant: 20),

            quickSwatchesStack.bottomAnchor.constraint(equalTo: hexInputField.topAnchor, constant: -6),
            quickSwatchesStack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 8),
            quickSwatchesStack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -8),
            quickSwatchesStack.heightAnchor.constraint(equalToConstant: 18)
        ])
    }

    public override func draw(_ dirtyRect: NSRect) {
        ThemeTokens.colorPanel.setFill()
        bounds.fill()
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        let wheelBounds = CGRect(x: bounds.minX, y: bounds.minY + 50, width: bounds.width, height: bounds.height - 50)
        let center = CGPoint(x: wheelBounds.midX, y: wheelBounds.midY)
        let radius = max(min(wheelBounds.width, wheelBounds.height) / 2.0 - 8, 10)

        // 1. Draw outer hue ring (60 discrete segments with smooth blend)
        let segments = 60
        for i in 0..<segments {
            let startAngle = CGFloat(i) * (2.0 * .pi / CGFloat(segments))
            let endAngle = CGFloat(i + 1) * (2.0 * .pi / CGFloat(segments))
            let midAngleDeg = (startAngle + endAngle) / 2.0 * 180.0 / .pi

            let sample = ColorWheelState(hue: midAngleDeg, saturation: 1.0, value: 1.0)
            let color = NSColor(hex: sample.hexString)

            ctx.beginPath()
            ctx.addArc(center: center, radius: radius, startAngle: startAngle, endAngle: endAngle, clockwise: false)
            ctx.setStrokeColor(color.cgColor)
            ctx.setLineWidth(12.0)
            ctx.strokePath()
        }

        // 2. Draw inner preview circle with current color
        let innerRadius = max(radius - 16, 5)
        let currentColor = NSColor(hex: state.hexString)
        ctx.setFillColor(currentColor.cgColor)
        ctx.fillEllipse(in: CGRect(x: center.x - innerRadius * 0.6, y: center.y - innerRadius * 0.6, width: innerRadius * 1.2, height: innerRadius * 1.2))

        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.3).cgColor)
        ctx.setLineWidth(1.0)
        ctx.strokeEllipse(in: CGRect(x: center.x - innerRadius * 0.6, y: center.y - innerRadius * 0.6, width: innerRadius * 1.2, height: innerRadius * 1.2))
    }

    public override func mouseDown(with event: NSEvent) {
        handleMouse(event)
    }

    public override func mouseDragged(with event: NSEvent) {
        handleMouse(event)
    }

    private func handleMouse(_ event: NSEvent) {
        let pt = convert(event.locationInWindow, from: nil)
        let wheelBounds = CGRect(x: bounds.minX, y: bounds.minY + 50, width: bounds.width, height: bounds.height - 50)
        guard wheelBounds.contains(pt) else { return }

        let center = CGPoint(x: wheelBounds.midX, y: wheelBounds.midY)
        let dx = pt.x - center.x
        let dy = pt.y - center.y

        var rad = atan2(dy, dx)
        if rad < 0 { rad += 2.0 * .pi }
        let deg = rad * 180.0 / .pi

        state = ColorWheelState(hue: deg, saturation: 1.0, value: 1.0)
        hexInputField.stringValue = state.hexString
        needsDisplay = true
        onColorChanged?(state.hexString)
    }

    private func updateFromHex(_ hex: String) {
        guard let color = NSColor(hexString: hex),
              let srgb = color.usingColorSpace(.sRGB) else { return }

        let r = srgb.redComponent
        let g = srgb.greenComponent
        let b = srgb.blueComponent

        let maxVal = max(r, max(g, b))
        let minVal = min(r, min(g, b))
        let delta = maxVal - minVal

        var h: CGFloat = 0
        if delta > 0.0001 {
            if maxVal == r {
                h = ((g - b) / delta).truncatingRemainder(dividingBy: 6.0)
            } else if maxVal == g {
                h = ((b - r) / delta) + 2.0
            } else {
                h = ((r - g) / delta) + 4.0
            }
            h *= 60.0
            if h < 0 { h += 360.0 }
        }

        let s = maxVal > 0.0001 ? delta / maxVal : 0.0
        let v = maxVal

        state = ColorWheelState(hue: h, saturation: s, value: v)
        hexInputField.stringValue = state.hexString
        needsDisplay = true
        onColorChanged?(state.hexString)
    }

    public func controlTextDidEndEditing(_ obj: Notification) {
        updateFromHex(hexInputField.stringValue)
    }
}
