//
//  AppearancePanel.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M4.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import Foundation

// MARK: - Appearance Panel View

public class AppearancePanelView: NSView {
    public var onStyleChange: ((_ fill: String, _ stroke: String, _ strokeWidth: CGFloat, _ opacity: CGFloat, _ blendMode: String) -> Void)?

    private let headerLabel = NSTextField(labelWithString: "APPEARANCE")
    public let fillSwatch = ColorSwatchButton()
    public let fillHexLabel = NSTextField(labelWithString: "#262626")

    public let strokeSwatch = ColorSwatchButton()
    public let strokeWidthField = ScrubbableNumberField(label: "W")

    public let opacitySlider = NSSlider()
    public let opacityLabel = NSTextField(labelWithString: "100%")

    public let blendModePopUp = NSPopUpButton()
    public let colorPicker = ColorPickerView()

    private var currentFill = "#262626"
    private var currentStroke = "#b2ffd6"
    private var currentStrokeWidth: CGFloat = 1.0
    private var currentOpacity: CGFloat = 1.0
    private var currentBlendMode = "source-over"

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        setAccessibilityIdentifier(AccessibilityCatalog.appearancePanel)
        setAccessibilityRole(.group)

        headerLabel.translatesAutoresizingMaskIntoConstraints = false
        headerLabel.font = NSFont.systemFont(ofSize: 10, weight: .bold)
        headerLabel.textColor = NSColor(white: 0.6, alpha: 1.0)
        headerLabel.isBordered = false
        headerLabel.drawsBackground = false
        headerLabel.isEditable = false
        headerLabel.isSelectable = false
        addSubview(headerLabel)

        // Fill row
        fillSwatch.translatesAutoresizingMaskIntoConstraints = false
        fillSwatch.colorHex = currentFill
        fillSwatch.onClick = { [weak self] in
            guard let self = self else { return }
            self.colorPicker.isHidden.toggle()
        }
        addSubview(fillSwatch)

        fillHexLabel.translatesAutoresizingMaskIntoConstraints = false
        fillHexLabel.stringValue = currentFill
        fillHexLabel.font = ThemeFonts.mono(size: 11, weight: .regular)
        fillHexLabel.textColor = .white
        fillHexLabel.isBordered = false
        fillHexLabel.drawsBackground = false
        fillHexLabel.isEditable = false
        fillHexLabel.isSelectable = false
        addSubview(fillHexLabel)

        // Stroke row
        strokeSwatch.translatesAutoresizingMaskIntoConstraints = false
        strokeSwatch.colorHex = currentStroke
        addSubview(strokeSwatch)

        strokeWidthField.translatesAutoresizingMaskIntoConstraints = false
        strokeWidthField.value = currentStrokeWidth
        strokeWidthField.onValueChanged = { [weak self] w in
            self?.currentStrokeWidth = w
            self?.dispatchChanges()
        }
        addSubview(strokeWidthField)

        // Opacity row
        opacitySlider.translatesAutoresizingMaskIntoConstraints = false
        opacitySlider.minValue = 0
        opacitySlider.maxValue = 100
        opacitySlider.doubleValue = 100
        opacitySlider.target = self
        opacitySlider.action = #selector(didChangeOpacity)
        addSubview(opacitySlider)

        opacityLabel.translatesAutoresizingMaskIntoConstraints = false
        opacityLabel.stringValue = "100%"
        opacityLabel.font = ThemeFonts.monoDigit(size: 11, weight: .regular)
        opacityLabel.textColor = .white
        opacityLabel.isBordered = false
        opacityLabel.drawsBackground = false
        opacityLabel.isEditable = false
        opacityLabel.isSelectable = false
        addSubview(opacityLabel)

        // Blend mode row
        blendModePopUp.translatesAutoresizingMaskIntoConstraints = false
        blendModePopUp.target = self
        blendModePopUp.action = #selector(didSelectBlendMode)
        populateBlendModes()
        addSubview(blendModePopUp)

        // Color Picker (collapsed by default, expands on clicking Fill swatch)
        colorPicker.translatesAutoresizingMaskIntoConstraints = false
        colorPicker.isHidden = true
        colorPicker.onColorChanged = { [weak self] hex in
            guard let self = self else { return }
            self.currentFill = hex
            self.fillSwatch.colorHex = hex
            self.fillHexLabel.stringValue = hex
            self.dispatchChanges()
        }
        addSubview(colorPicker)

        NSLayoutConstraint.activate([
            headerLabel.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            headerLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            headerLabel.heightAnchor.constraint(equalToConstant: 16),

            // Fill
            fillSwatch.topAnchor.constraint(equalTo: headerLabel.bottomAnchor, constant: 10),
            fillSwatch.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            fillSwatch.widthAnchor.constraint(equalToConstant: 24),
            fillSwatch.heightAnchor.constraint(equalToConstant: 24),

            fillHexLabel.centerYAnchor.constraint(equalTo: fillSwatch.centerYAnchor),
            fillHexLabel.leadingAnchor.constraint(equalTo: fillSwatch.trailingAnchor, constant: 8),
            fillHexLabel.widthAnchor.constraint(equalToConstant: 80),
            fillHexLabel.heightAnchor.constraint(equalToConstant: 20),

            // Stroke
            strokeSwatch.topAnchor.constraint(equalTo: fillSwatch.bottomAnchor, constant: 8),
            strokeSwatch.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            strokeSwatch.widthAnchor.constraint(equalToConstant: 24),
            strokeSwatch.heightAnchor.constraint(equalToConstant: 24),

            strokeWidthField.centerYAnchor.constraint(equalTo: strokeSwatch.centerYAnchor),
            strokeWidthField.leadingAnchor.constraint(equalTo: strokeSwatch.trailingAnchor, constant: 8),
            strokeWidthField.widthAnchor.constraint(equalToConstant: 80),
            strokeWidthField.heightAnchor.constraint(equalToConstant: 24),

            // Opacity
            opacitySlider.topAnchor.constraint(equalTo: strokeSwatch.bottomAnchor, constant: 10),
            opacitySlider.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            opacitySlider.widthAnchor.constraint(equalToConstant: 180),
            opacitySlider.heightAnchor.constraint(equalToConstant: 20),

            opacityLabel.centerYAnchor.constraint(equalTo: opacitySlider.centerYAnchor),
            opacityLabel.leadingAnchor.constraint(equalTo: opacitySlider.trailingAnchor, constant: 8),
            opacityLabel.widthAnchor.constraint(equalToConstant: 40),
            opacityLabel.heightAnchor.constraint(equalToConstant: 20),

            // Blend Mode
            blendModePopUp.topAnchor.constraint(equalTo: opacitySlider.bottomAnchor, constant: 8),
            blendModePopUp.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            blendModePopUp.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            blendModePopUp.heightAnchor.constraint(equalToConstant: 24),

            // Inline Color Picker
            colorPicker.topAnchor.constraint(equalTo: blendModePopUp.bottomAnchor, constant: 10),
            colorPicker.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            colorPicker.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            colorPicker.heightAnchor.constraint(equalToConstant: 160)
        ])
    }

    private func populateBlendModes() {
        let modes = [
            ("Normal", "source-over"),
            ("Multiply", "multiply"),
            ("Screen", "screen"),
            ("Overlay", "overlay"),
            ("Darken", "darken"),
            ("Lighten", "lighten"),
            ("Color Dodge", "color-dodge"),
            ("Color Burn", "color-burn"),
            ("Hard Light", "hard-light"),
            ("Soft Light", "soft-light"),
            ("Difference", "difference"),
            ("Exclusion", "exclusion"),
            ("Hue", "hue"),
            ("Saturation", "saturation"),
            ("Color", "color"),
            ("Luminosity", "luminosity")
        ]
        blendModePopUp.removeAllItems()
        for (title, tag) in modes {
            blendModePopUp.addItem(withTitle: title)
            blendModePopUp.lastItem?.representedObject = tag
        }
    }

    public func configure(with node: VOONode?) {
        guard let node = node else {
            alphaValue = 0.4
            return
        }
        alphaValue = 1.0

        currentFill = node.fill
        currentStroke = node.stroke
        currentStrokeWidth = node.strokeWidth
        currentOpacity = node.opacity
        currentBlendMode = node.blendMode

        fillSwatch.colorHex = currentFill
        fillHexLabel.stringValue = currentFill
        strokeSwatch.colorHex = currentStroke
        strokeWidthField.value = currentStrokeWidth
        opacitySlider.doubleValue = Double(currentOpacity * 100.0)
        opacityLabel.stringValue = "\(Int(round(currentOpacity * 100.0)))%"

        if let idx = blendModePopUp.itemArray.firstIndex(where: { ($0.representedObject as? String) == currentBlendMode }) {
            blendModePopUp.selectItem(at: idx)
        }
    }

    @objc private func didChangeOpacity() {
        currentOpacity = CGFloat(opacitySlider.doubleValue / 100.0)
        opacityLabel.stringValue = "\(Int(round(opacitySlider.doubleValue)))%"
        dispatchChanges()
    }

    @objc private func didSelectBlendMode() {
        if let mode = blendModePopUp.selectedItem?.representedObject as? String {
            currentBlendMode = mode
            dispatchChanges()
        }
    }

    public override func draw(_ dirtyRect: NSRect) {
        ThemeTokens.colorPanel.setFill()
        bounds.fill()
    }

    private func dispatchChanges() {
        onStyleChange?(currentFill, currentStroke, currentStrokeWidth, currentOpacity, currentBlendMode)
    }
}
