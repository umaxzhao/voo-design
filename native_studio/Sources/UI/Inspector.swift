//
//  Inspector.swift
//  native_studio
//
//  Floating studio overlay container matching VOO Design 1:1.
//  Hosts the floating left layers card and floating right properties card.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import AppKit
import CoreGraphics
import Foundation

// MARK: - Inspector Delegate Protocol

public protocol InspectorDelegate: AnyObject {
    func inspectorDidSelectNode(id: String)
    func inspectorDidChangeNodeGeometry(id: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, rotation: CGFloat, cornerRadius: CGFloat?)
    func inspectorDidChangeNodeGeometryWithRadii(id: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, rotation: CGFloat, cornerRadii: CornerRadii?, lockRatio: Bool?)
    func inspectorDidChangeNodeCornerRadii(id: String, cornerRadii: CornerRadii)
    func inspectorDidChangeNodeLockRatio(id: String, lockRatio: Bool)
    func inspectorDidChangeNodeStyle(id: String, fill: String, stroke: String, strokeWidth: CGFloat, opacity: CGFloat, blendMode: String)
    func inspectorDidChangeNodeStrokeStyle(id: String, strokeCap: String?, strokeJoin: String?, strokeMiterLimit: CGFloat?, strokeDash: [CGFloat]?, strokeAlign: String?)
    func inspectorDidChangeTextTypography(id: String, fontFamily: String, fontSize: CGFloat)
    func inspectorDidChangeTextFormatting(id: String, fontWeight: String, textAlign: String, lineHeight: CGFloat, letterSpacing: CGFloat)
    func inspectorTextBoxInteractionChanged(active: Bool)
    func inspectorDidChangeTextDecoration(id: String, italic: Bool?, underline: Bool?, boxWidth: CGFloat?)
    func inspectorDidChangeEffects(id: String, effects: LayerEffects)
    func inspectorDidMutatePaint(id: String, mutation: NativePaintMutation)
    func inspectorPaintInteractionChanged(active: Bool)
    func inspectorDidRequestFlip(horizontal: Bool)
    func inspectorDidToggleVisibility(id: String, visible: Bool)
    func inspectorDidToggleLock(id: String, locked: Bool)
    /// Figma-style constraints changed for a layer:
    /// `horizontal` = left|center|right|scale, `vertical` = top|middle|bottom|scale.
    func inspectorDidChangeConstraints(id: String, horizontal: String, vertical: String)
}

public extension InspectorDelegate {
    func inspectorDidSelectNode(id: String) {}
    func inspectorDidChangeNodeGeometry(id: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, rotation: CGFloat, cornerRadius: CGFloat?) {}
    func inspectorDidChangeNodeGeometryWithRadii(id: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, rotation: CGFloat, cornerRadii: CornerRadii?, lockRatio: Bool?) {}
    func inspectorDidChangeNodeCornerRadii(id: String, cornerRadii: CornerRadii) {}
    func inspectorDidChangeNodeLockRatio(id: String, lockRatio: Bool) {}
    func inspectorDidChangeNodeStyle(id: String, fill: String, stroke: String, strokeWidth: CGFloat, opacity: CGFloat, blendMode: String) {}
    func inspectorDidChangeNodeStrokeStyle(id: String, strokeCap: String?, strokeJoin: String?, strokeMiterLimit: CGFloat?, strokeDash: [CGFloat]?, strokeAlign: String?) {}
    func inspectorDidChangeTextTypography(id: String, fontFamily: String, fontSize: CGFloat) {}
    func inspectorDidChangeTextFormatting(id: String, fontWeight: String, textAlign: String, lineHeight: CGFloat, letterSpacing: CGFloat) {}
    func inspectorTextBoxInteractionChanged(active: Bool) {}
    func inspectorDidChangeTextDecoration(id: String, italic: Bool?, underline: Bool?, boxWidth: CGFloat?) {}
    func inspectorDidChangeEffects(id: String, effects: LayerEffects) {}
    func inspectorDidMutatePaint(id: String, mutation: NativePaintMutation) {}
    func inspectorPaintInteractionChanged(active: Bool) {}
    func inspectorDidRequestFlip(horizontal: Bool) {}
    func inspectorDidToggleVisibility(id: String, visible: Bool) {}
    func inspectorDidToggleLock(id: String, locked: Bool) {}
    func inspectorDidChangeConstraints(id: String, horizontal: String, vertical: String) {}
}

// MARK: - Right Floating Properties Card Shell

public class FloatingPropertiesCardView: NSView {
    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.45
        layer?.shadowRadius = 18.0
        layer?.shadowOffset = CGSize(width: 0, height: -6)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.45
        layer?.shadowRadius = 18.0
        layer?.shadowOffset = CGSize(width: 0, height: -6)
    }

    public override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }

        // Floating Card Shell: cornerRadius 24, near-black rgba(0, 0, 0, 0.95)
        // matching the web editor's PROPERTIES card over the canvas stage. The
        // 0.5pt inset keeps the 1px border inside the view, exactly like the
        // LAYERS card, so both floating cards stroke identically.
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = CGPath(roundedRect: rect, cornerWidth: 24, cornerHeight: 24, transform: nil)
        ctx.setFillColor(NSColor(white: 0.0, alpha: 0.95).cgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // Border: 1px solid rgba(255, 255, 255, 0.08)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.08).cgColor)
        ctx.setLineWidth(1.0)
        ctx.addPath(path)
        ctx.strokePath()
    }
}

// MARK: - Properties scroll container (web `no-scrollbar`)

/// Scroll container for the PROPERTIES card content. It mirrors the web panel's
/// `no-scrollbar` class: no scrollbar is ever drawn, but wheel/trackpad scrolling
/// still reaches the sections below the 368pt fold. `NSScrollView` handles wheel
/// events itself, so removing the scrollers keeps scrolling; the manual fallback
/// only runs if that default path produced no movement.
public final class PropertiesScrollView: NSScrollView {
    public override func scrollWheel(with event: NSEvent) {
        let documentHeight = documentView?.frame.height ?? 0
        let clip = contentView
        let maxOffset = max(0, documentHeight - clip.bounds.height)
        guard maxOffset > 0 else {
            super.scrollWheel(with: event)
            return
        }
        let before = clip.bounds.origin.y
        super.scrollWheel(with: event)
        guard abs(clip.bounds.origin.y - before) < 0.01 else { return }

        // No scrollers configured: scroll the clip view directly. The content is a
        // flipped document, so a positive (upward) delta decreases the y origin.
        let delta = event.hasPreciseScrollingDeltas
            ? event.scrollingDeltaY
            : event.scrollingDeltaY * 12.0
        guard abs(delta) > 0.01 else { return }
        let target = min(max(before - delta, 0), maxOffset)
        guard abs(target - before) > 0.01 else { return }
        clip.scroll(to: NSPoint(x: clip.bounds.origin.x, y: target))
        reflectScrolledClipView(clip)
    }
}

// MARK: - Inspector Studio Container View (Transparent Floating Overlay)

public class InspectorView: NSView {
    public weak var delegate: InspectorDelegate?

    public let layersPanel = LayersPanelView()
    public let propertiesCard = FloatingPropertiesCardView()
    public private(set) var arePropertiesVisible: Bool = true
    /// Web-parity PROPERTIES card content (visible, functional inspector).
    public let propertiesPanel = PropertiesPanelView()
    let canvasPropertiesPanel = NativeCanvasPropertiesView(frame: .zero)
    public var onCanvasBackgroundChange: ((String) -> Void)?
    private var hasCanvasDocument = false
    /// Scroll container that keeps the native-only TRANSFORM / APPEARANCE sections
    /// reachable below the 368pt-tall web-sized card fold.
    public let propertiesScrollView = PropertiesScrollView()
    /// Legacy Affinity-style panels kept as hidden subviews for backward compatibility
    /// (`WindowController` and the accessibility test-suite still reference them).
    public let transformPanel = TransformPanelView()
    public let appearancePanel = AppearancePanelView()

    // Latest web-parity property values (mirrors of the card state) used to compose
    // complete geometry / style payloads for `InspectorDelegate`.
    private var propertiesFill = "#262626"
    private var propertiesStroke = "#b2ffd6"
    private var propertiesStrokeWidth: CGFloat = 1.0
    private var propertiesOpacity: CGFloat = 1.0
    private var propertiesBlendMode = "source-over"
    private var propertiesX: CGFloat = 0
    private var propertiesY: CGFloat = 0
    private var normalDockConstraints: [NSLayoutConstraint] = []
    private var swappedDockConstraints: [NSLayoutConstraint] = []
    public private(set) var panelsAreSwapped = false
    private var propertiesWidth: CGFloat = 0
    private var propertiesHeight: CGFloat = 0
    private var propertiesRotation: CGFloat = 0
    private var propertiesCornerRadius: CGFloat = 0
    private var propertiesFontFamily: String = "Inter"
    private var propertiesFontSize: CGFloat = 16
    private var propertiesFontWeight: String = "regular"
    private var propertiesTextAlign: String = "left"
    private var propertiesLineHeight: CGFloat = 1.2
    private var propertiesLetterSpacing: CGFloat = 0
    private var panelHeightConstraint: NSLayoutConstraint?
    private var cardHeightConstraint: NSLayoutConstraint?
    private var layersHeightConstraint: NSLayoutConstraint?

    public override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupUI()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
    }

    private func setupUI() {
        setAccessibilityIdentifier(AccessibilityCatalog.inspectorStudio)
        setAccessibilityRole(.group)

        // 1. Left Floating Card: Layers Panel
        layersPanel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(layersPanel)

        // 2. Right Floating Card: Properties Card (web-parity PROPERTIES content)
        propertiesCard.translatesAutoresizingMaskIntoConstraints = false
        addSubview(propertiesCard)

        // Scrollable content: the card keeps the web inspector's fixed 368pt
        // visible height, so TRANSFORM and APPEARANCE live below the fold and
        // remain reachable by scrolling.
        propertiesScrollView.translatesAutoresizingMaskIntoConstraints = false
        propertiesScrollView.drawsBackground = false
        propertiesScrollView.backgroundColor = .clear
        propertiesScrollView.contentView.drawsBackground = false
        propertiesScrollView.borderType = .noBorder
        // Web parity: the panel clips its content with `no-scrollbar`, so no
        // scrollbar is drawn at rest or while scrolling (wheel scrolling still
        // works — see PropertiesScrollView).
        propertiesScrollView.hasVerticalScroller = false
        propertiesScrollView.hasHorizontalScroller = false
        propertiesScrollView.autohidesScrollers = true
        propertiesScrollView.scrollerStyle = .overlay
        propertiesScrollView.verticalScrollElasticity = .automatic
        propertiesScrollView.horizontalScrollElasticity = .none
        // The document is clipped to the scroll view's own bounds. Keep that clip
        // RECTANGULAR: the card's rounded corners are respected by insetting the
        // scroll area inside the card's 12pt padding (below), so content can never
        // paint into the corner arcs (a corner-radius mask is layer-only and is
        // dropped by drawing-based renderings such as the screenshot harness).
        propertiesScrollView.wantsLayer = true
        propertiesScrollView.layer?.cornerRadius = 0
        propertiesScrollView.layer?.masksToBounds = true
        // The CLIP view is what actually clips a scroll document; without a layer
        // mask on it, layer-backed drawing (and the snapshot harness) paints the
        // document outside the card.
        propertiesScrollView.contentView.wantsLayer = true
        propertiesScrollView.contentView.layer?.masksToBounds = true
        propertiesCard.addSubview(propertiesScrollView)

        propertiesScrollView.documentView = propertiesPanel

        // The panel is the scroll document: fixed 288pt width, 520pt scrollable
        // height. Auto Layout (rather than autoresizing) keeps the width locked
        // to the clip view at 288 irrespective of when the card is first laid out.
        propertiesPanel.translatesAutoresizingMaskIntoConstraints = false
        let heightConstraint = propertiesPanel.heightAnchor.constraint(equalToConstant: PropertiesPanelView.preferredContentHeight)
        self.panelHeightConstraint = heightConstraint
        NSLayoutConstraint.activate([
            propertiesPanel.leadingAnchor.constraint(equalTo: propertiesScrollView.contentView.leadingAnchor),
            propertiesPanel.topAnchor.constraint(equalTo: propertiesScrollView.contentView.topAnchor),
            propertiesPanel.widthAnchor.constraint(equalTo: propertiesScrollView.widthAnchor),
            heightConstraint
        ])

        // Legacy Affinity panels are retained (and configured) but never shown.
        transformPanel.translatesAutoresizingMaskIntoConstraints = false
        appearancePanel.translatesAutoresizingMaskIntoConstraints = false
        transformPanel.isHidden = true
        appearancePanel.isHidden = true
        propertiesCard.addSubview(transformPanel)
        propertiesCard.addSubview(appearancePanel)
        canvasPropertiesPanel.translatesAutoresizingMaskIntoConstraints = false
        canvasPropertiesPanel.isHidden = true
        canvasPropertiesPanel.onBackgroundChange = { [weak self] color in
            self?.onCanvasBackgroundChange?(color)
        }
        propertiesCard.addSubview(canvasPropertiesPanel)
        NSLayoutConstraint.activate([
            canvasPropertiesPanel.topAnchor.constraint(equalTo: propertiesCard.topAnchor),
            canvasPropertiesPanel.leadingAnchor.constraint(equalTo: propertiesCard.leadingAnchor),
            canvasPropertiesPanel.trailingAnchor.constraint(equalTo: propertiesCard.trailingAnchor),
            canvasPropertiesPanel.bottomAnchor.constraint(equalTo: propertiesCard.bottomAnchor),
        ])

        // The web inspector is content-driven (~704pt for a shape at 1440x900):
        // the card height follows the panel's measured content height, capped by
        // the space available so the card always stays inside the editor shell.
        let cardHeight = propertiesCard.heightAnchor.constraint(equalToConstant: 368)
        cardHeightConstraint = cardHeight

        // Layout Constraints:
        // Layers Panel: Floating on the left
        // Properties Card: Floating on the right
        normalDockConstraints = [
            layersPanel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            propertiesCard.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
        ]
        swappedDockConstraints = [
            layersPanel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            propertiesCard.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
        ]
        NSLayoutConstraint.activate(normalDockConstraints)
        layersPanel.onSortTapped = { [weak self] in self?.swapPanels() }
        propertiesPanel.onSwapPanels = { [weak self] in self?.swapPanels() }
        propertiesPanel.onPresentationChange = { [weak self] in self?.needsLayout = true }
        layersPanel.onPresentationChange = { [weak self] in self?.needsLayout = true }
        let layersHeight = layersPanel.heightAnchor.constraint(
            equalToConstant: layersPanel.preferredCardHeight)
        layersHeightConstraint = layersHeight
        NSLayoutConstraint.activate([
            // Left Floating Card (web: md:w-64 = 256, p12, rounded-3xl, centred).
            // The layer card grows with expanded rows, then scrolls at the
            // same viewport clearance cap as the Electron layer card.
            layersPanel.centerYAnchor.constraint(equalTo: centerYAnchor),
            layersPanel.widthAnchor.constraint(equalToConstant: 256),
            layersHeight,

            // Right Floating Card (web: md:w-72 = 288, p12, rounded-3xl, centred;
            // the fixed 368pt visible height scrolls to the rest of the sections).
            propertiesCard.centerYAnchor.constraint(equalTo: centerYAnchor),
            propertiesCard.widthAnchor.constraint(equalToConstant: 288),
            cardHeight,

            // Scroll box = the card's padded content box: full width (the panel
            // carries the 12pt side padding itself) but stopped 12pt above the
            // card bottom (web `p-3`), so the rounded bottom corners never receive
            // document content.
            propertiesScrollView.topAnchor.constraint(equalTo: propertiesCard.topAnchor),
            propertiesScrollView.leadingAnchor.constraint(equalTo: propertiesCard.leadingAnchor),
            propertiesScrollView.trailingAnchor.constraint(equalTo: propertiesCard.trailingAnchor),
            propertiesScrollView.bottomAnchor.constraint(equalTo: propertiesCard.bottomAnchor,
                                                         constant: -12),

            // Hidden legacy panels keep their original layout (offscreen, non-interactive).
            transformPanel.topAnchor.constraint(equalTo: propertiesCard.topAnchor, constant: 8),
            transformPanel.leadingAnchor.constraint(equalTo: propertiesCard.leadingAnchor, constant: 8),
            transformPanel.trailingAnchor.constraint(equalTo: propertiesCard.trailingAnchor, constant: -8),
            transformPanel.heightAnchor.constraint(equalToConstant: 165),

            appearancePanel.topAnchor.constraint(equalTo: transformPanel.bottomAnchor, constant: 6),
            appearancePanel.leadingAnchor.constraint(equalTo: propertiesCard.leadingAnchor, constant: 8),
            appearancePanel.trailingAnchor.constraint(equalTo: propertiesCard.trailingAnchor, constant: -8),
            appearancePanel.bottomAnchor.constraint(equalTo: propertiesCard.bottomAnchor, constant: -8)
        ])

        wireDelegates()
    }

    private func wireDelegates() {
        layersPanel.onSelectNode = { [weak self] id in
            self?.delegate?.inspectorDidSelectNode(id: id)
        }
        layersPanel.onToggleVisibility = { [weak self] id, vis in
            self?.delegate?.inspectorDidToggleVisibility(id: id, visible: vis)
        }
        layersPanel.onToggleLock = { [weak self] id, lck in
            self?.delegate?.inspectorDidToggleLock(id: id, locked: lck)
        }

        transformPanel.onGeometryChange = { [weak self] x, y, w, h, r, cr in
            guard let self = self, let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeNodeGeometry(id: id, x: x, y: y, width: w, height: h, rotation: r, cornerRadius: cr)
        }

        appearancePanel.onStyleChange = { [weak self] fill, stroke, width, opacity, blend in
            guard let self = self, let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeNodeStyle(id: id, fill: fill, stroke: stroke, strokeWidth: width, opacity: opacity, blendMode: blend)
        }

        // Web-parity PROPERTIES card → InspectorDelegate forwarding.
        propertiesPanel.onGeometryChange = { [weak self] x, y, w, h, r, cr in
            guard let self = self else { return }
            self.propertiesX = x
            self.propertiesY = y
            self.propertiesWidth = w
            self.propertiesHeight = h
            self.propertiesRotation = r
            if let cr = cr { self.propertiesCornerRadius = cr }
            guard let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeNodeGeometry(id: id, x: x, y: y, width: w, height: h, rotation: r, cornerRadius: cr)
        }

        propertiesPanel.onCornerRadiusChange = { [weak self] radius in
            guard let self = self else { return }
            self.propertiesCornerRadius = radius
            guard let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeNodeGeometry(id: id,
                                                         x: self.propertiesX,
                                                         y: self.propertiesY,
                                                         width: self.propertiesWidth,
                                                         height: self.propertiesHeight,
                                                         rotation: self.propertiesRotation,
                                                         cornerRadius: radius)
        }

        propertiesPanel.onFillChange = { [weak self] fill in
            guard let self = self else { return }
            self.propertiesFill = fill
            self.forwardPropertiesStyle(fill: fill)
        }
        propertiesPanel.onStrokeChange = { [weak self] stroke in
            guard let self = self else { return }
            self.propertiesStroke = stroke
            self.forwardPropertiesStyle(stroke: stroke)
        }
        propertiesPanel.onStrokeWidthChange = { [weak self] width in
            guard let self = self else { return }
            self.propertiesStrokeWidth = width
            self.forwardPropertiesStyle(strokeWidth: width)
        }
        propertiesPanel.onOpacityChange = { [weak self] opacity in
            guard let self = self else { return }
            self.propertiesOpacity = opacity
            self.forwardPropertiesStyle(opacity: opacity)
        }
        propertiesPanel.onBlendModeChange = { [weak self] blend in
            guard let self = self else { return }
            self.propertiesBlendMode = blend
            self.forwardPropertiesStyle(blendMode: blend)
        }

        // Text-layer typography → InspectorDelegate (both values sent together).
        propertiesPanel.onFontFamilyChange = { [weak self] family in
            guard let self = self else { return }
            self.propertiesFontFamily = family
            self.forwardPropertiesTypography()
        }
        propertiesPanel.onFontSizeChange = { [weak self] size in
            guard let self = self else { return }
            self.propertiesFontSize = size
            self.forwardPropertiesTypography()
        }

        // Text-layer formatting (weight / align / line height / letter spacing)
        // → InspectorDelegate, always sending all current values together.
        propertiesPanel.onFontWeightChange = { [weak self] weight in
            guard let self = self else { return }
            self.propertiesFontWeight = weight
            self.forwardPropertiesFormatting()
        }
        propertiesPanel.onTextAlignChange = { [weak self] align in
            guard let self = self else { return }
            self.propertiesTextAlign = align
            self.forwardPropertiesFormatting()
        }
        propertiesPanel.onLineHeightChange = { [weak self] lineHeight in
            guard let self = self else { return }
            self.propertiesLineHeight = lineHeight
            self.forwardPropertiesFormatting()
        }
        propertiesPanel.onLetterSpacingChange = { [weak self] spacing in
            guard let self = self else { return }
            self.propertiesLetterSpacing = spacing
            self.forwardPropertiesFormatting()
        }

        propertiesPanel.onLockRatioChange = { [weak self] locked in
            guard let self = self, let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeNodeLockRatio(id: id, lockRatio: locked)
        }

        propertiesPanel.onCornerRadiiChange = { [weak self] radii in
            guard let self = self else { return }
            self.propertiesCornerRadius = radii.uniformRadius
            guard let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeNodeCornerRadii(id: id, cornerRadii: radii)
            self.delegate?.inspectorDidChangeNodeGeometryWithRadii(
                id: id,
                x: self.propertiesX,
                y: self.propertiesY,
                width: self.propertiesWidth,
                height: self.propertiesHeight,
                rotation: self.propertiesRotation,
                cornerRadii: radii,
                lockRatio: self.propertiesPanel.isAspectLocked
            )
        }

        propertiesPanel.onStrokeCapChange = { [weak self] cap in self?.forwardPropertiesStrokeStyle(strokeCap: cap) }
        propertiesPanel.onStrokeJoinChange = { [weak self] join in self?.forwardPropertiesStrokeStyle(strokeJoin: join) }
        propertiesPanel.onStrokeMiterLimitChange = { [weak self] miter in self?.forwardPropertiesStrokeStyle(strokeMiterLimit: miter) }
        propertiesPanel.onStrokeDashChange = { [weak self] dash in self?.forwardPropertiesStrokeStyle(strokeDash: dash) }
        propertiesPanel.onStrokeAlignChange = { [weak self] align in self?.forwardPropertiesStrokeStyle(strokeAlign: align) }

        propertiesPanel.onBoxWidthChange = { [weak self] _ in
            self?.forwardPropertiesTextDecoration()
        }
        propertiesPanel.onBoxWidthInteraction = { [weak self] in
            self?.delegate?.inspectorTextBoxInteractionChanged(active: $0)
        }
        propertiesPanel.onItalicChange = { [weak self] it in self?.forwardPropertiesTextDecoration(italic: it) }
        propertiesPanel.onUnderlineChange = { [weak self] un in self?.forwardPropertiesTextDecoration(underline: un) }

        propertiesPanel.onConstraintsChange = { [weak self] horizontal, vertical in
            guard let self = self, let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeConstraints(id: id, horizontal: horizontal, vertical: vertical)
        }

        propertiesPanel.onPaintMutation = { [weak self] mutation in
            guard let self, let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidMutatePaint(id: id, mutation: mutation)
        }
        propertiesPanel.onFlipRequest = { [weak self] horizontal in
            self?.delegate?.inspectorDidRequestFlip(horizontal: horizontal)
        }
        propertiesPanel.onPaintInteraction = { [weak self] active in
            self?.delegate?.inspectorPaintInteractionChanged(active: active)
        }
        propertiesPanel.onEffectsChange = { [weak self] effects in
            guard let self = self, let id = self.layersPanel.selectedNodeId else { return }
            self.delegate?.inspectorDidChangeEffects(id: id, effects: effects)
        }
    }

    /// Forwards the current text typography for the selected node.
    private func forwardPropertiesTypography() {
        guard let id = layersPanel.selectedNodeId else { return }
        delegate?.inspectorDidChangeTextTypography(id: id,
                                                  fontFamily: propertiesFontFamily,
                                                  fontSize: propertiesFontSize)
    }

    /// Forwards the current text formatting for the selected node.
    private func forwardPropertiesFormatting() {
        guard let id = layersPanel.selectedNodeId else { return }
        delegate?.inspectorDidChangeTextFormatting(id: id,
                                                  fontWeight: propertiesFontWeight,
                                                  textAlign: propertiesTextAlign,
                                                  lineHeight: propertiesLineHeight,
                                                  letterSpacing: propertiesLetterSpacing)
    }

    /// Composes a full style payload from the latest PROPERTIES card values and
    /// forwards it through `InspectorDelegate`.
    private func forwardPropertiesStyle(fill: String? = nil,
                                       stroke: String? = nil,
                                       strokeWidth: CGFloat? = nil,
                                       opacity: CGFloat? = nil,
                                       blendMode: String? = nil) {
        guard let id = layersPanel.selectedNodeId else { return }
        delegate?.inspectorDidChangeNodeStyle(
            id: id,
            fill: fill ?? propertiesFill,
            stroke: stroke ?? propertiesStroke,
            strokeWidth: strokeWidth ?? propertiesStrokeWidth,
            opacity: opacity ?? propertiesOpacity,
            blendMode: blendMode ?? propertiesBlendMode
        )
    }

    private func forwardPropertiesStrokeStyle(strokeCap: String? = nil,
                                               strokeJoin: String? = nil,
                                               strokeMiterLimit: CGFloat? = nil,
                                               strokeDash: [CGFloat]? = nil,
                                               strokeAlign: String? = nil) {
        guard let id = layersPanel.selectedNodeId else { return }
        delegate?.inspectorDidChangeNodeStrokeStyle(
            id: id,
            strokeCap: strokeCap ?? propertiesPanel.currentStrokeCap,
            strokeJoin: strokeJoin ?? propertiesPanel.currentStrokeJoin,
            strokeMiterLimit: strokeMiterLimit ?? propertiesPanel.currentStrokeMiterLimit,
            strokeDash: strokeDash ?? propertiesPanel.currentStrokeDash,
            strokeAlign: strokeAlign ?? propertiesPanel.currentStrokeAlign
        )
    }

    private func forwardPropertiesTextDecoration(italic: Bool? = nil, underline: Bool? = nil) {
        guard let id = layersPanel.selectedNodeId else { return }
        delegate?.inspectorDidChangeTextDecoration(
            id: id,
            italic: italic ?? propertiesPanel.isItalic,
            underline: underline ?? propertiesPanel.isUnderline,
            boxWidth: propertiesPanel.node?.boxWidth
        )
    }

    /// Configures the visible web-parity PROPERTIES card (and keeps the hidden
    /// legacy panels in sync for backward compatibility / test coverage).
    public func configureProperties(with node: VOONode?) {
        propertiesPanel.configure(with: node)
        // Every selection change resets the inspector to its first section (web
        // keeps the card at the top); AppKit otherwise keeps the previous scroll
        // offset and the card can look like it opens mid-section.
        propertiesScrollView.contentView.scroll(to: .zero)
        propertiesScrollView.reflectScrolledClipView(propertiesScrollView.contentView)
        transformPanel.configure(with: node)
        appearancePanel.configure(with: node)
        panelHeightConstraint?.constant = propertiesPanel.contentHeight

        if let node = node {
            propertiesFill = node.fill
            propertiesStroke = node.stroke
            propertiesStrokeWidth = node.strokeWidth
            propertiesOpacity = node.opacity
            propertiesBlendMode = node.blendMode
            propertiesX = node.x
            propertiesY = node.y
            propertiesWidth = node.width
            propertiesHeight = node.height
            propertiesRotation = node.rotation
            propertiesCornerRadius = node.cornerRadii?.tl ?? 0
            propertiesFontFamily = node.fontFamily ?? "Inter"
            propertiesFontSize = min(max(node.fontSize ?? 16, 8), 200)
            propertiesFontWeight = node.fontWeight ?? "regular"
            propertiesTextAlign = node.textAlign ?? "left"
            propertiesLineHeight = node.lineHeight ?? 1.2
            propertiesLetterSpacing = node.letterSpacing ?? 0
        } else {
            propertiesFill = "#262626"
            propertiesStroke = "#b2ffd6"
            propertiesStrokeWidth = 1.0
            propertiesOpacity = 1.0
            propertiesBlendMode = "source-over"
            propertiesX = 0
            propertiesY = 0
            propertiesWidth = 0
            propertiesHeight = 0
            propertiesRotation = 0
            propertiesCornerRadius = 0
            propertiesFontFamily = "Inter"
            propertiesFontSize = 16
            propertiesFontWeight = "regular"
            propertiesTextAlign = "left"
            propertiesLineHeight = 1.2
            propertiesLetterSpacing = 0
        }
    }

    public func configureCanvas(document: VOODocument) {
        hasCanvasDocument = true
        canvasPropertiesPanel.configure(document: document)
        layersPanel.canvasBackgroundColor = document.workspaceBackgroundColor
        setPropertiesVisible(arePropertiesVisible)
    }

    /// An empty selection displays the canvas properties in the same card.
    public func setPropertiesVisible(_ visible: Bool) {
        arePropertiesVisible = visible
        propertiesCard.isHidden = !visible && !hasCanvasDocument
        propertiesScrollView.isHidden = !visible
        canvasPropertiesPanel.isHidden = visible || !hasCanvasDocument
        needsLayout = true
    }

    public func swapPanels() {
        panelsAreSwapped.toggle()
        NSLayoutConstraint.deactivate(
            panelsAreSwapped ? normalDockConstraints : swappedDockConstraints)
        NSLayoutConstraint.activate(
            panelsAreSwapped ? swappedDockConstraints : normalDockConstraints)
        needsLayout = true
    }

    public override func layout() {
        super.layout()
        syncPropertiesCardHeight()
        syncLayersCardHeight()
    }

    private func syncLayersCardHeight() {
        guard bounds.height > 0 else { return }
        let cap = max(198, min(bounds.height * 0.75, bounds.height - 144))
        let wanted = min(layersPanel.preferredCardHeight, cap)
        if let constraint = layersHeightConstraint, abs(constraint.constant - wanted) > 0.5 {
            constraint.constant = wanted
            needsLayout = true
        }
    }

    /// Card height = measured content height + the card's 12pt bottom inset, capped
    /// by the available shell height (the scroll view then scrolls the overflow).
    private func syncPropertiesCardHeight() {
        guard bounds.height > 0 else { return }
        let content =
            arePropertiesVisible
            ? max(propertiesPanel.contentHeight, 240)
            : NativeCanvasPropertiesView.preferredContentHeight - 12
        // Web DOCKED_PANEL_MAX_HEIGHT_CLASS reserves 9rem (144pt) around the
        // centred card so it clears the bottom controls at every window height.
        let maxAvailable = max(240, bounds.height - 144)
        let wanted = min(content + 12, maxAvailable)
        if let constraint = cardHeightConstraint, abs(constraint.constant - wanted) > 0.5 {
            constraint.constant = wanted
            // Apply outside the current layout pass, then re-anchor the document to
            // its first section so the card never opens scrolled mid-panel.
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.needsLayout = true
                self.layoutSubtreeIfNeeded()
                self.propertiesScrollView.contentView.scroll(to: .zero)
                self.propertiesScrollView.reflectScrolledClipView(self.propertiesScrollView.contentView)
            }
        }
        if let constraint = panelHeightConstraint, abs(constraint.constant - content) > 0.5 {
            constraint.constant = content
            propertiesPanel.needsLayout = true
        }
    }

    public override func hitTest(_ point: NSPoint) -> NSView? {
        // Transparent passthrough for canvas stage interactions
        let res = super.hitTest(point)
        if res === self {
            return nil
        }
        return res
    }

    public override func draw(_ dirtyRect: NSRect) {
        // Transparent overlay container
    }
}
