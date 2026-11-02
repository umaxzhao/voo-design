import AppKit

/// One paint implementation for the live stage and raster exports. The parent
/// opacity is explicit because CGContext.setAlpha replaces rather than multiplies.
enum NativePaintRenderer {
    static func fills(
        _ node: VOONode, path: CGPath, rect: CGRect, opacity: CGFloat, context: CGContext
    ) {
        for paint in node.nativePaints(.fill) where paint.isVisible && paint.opacity > 0 {
            guard let value = paint.value(.fill) else { continue }
            context.saveGState()
            context.setAlpha(opacity * paint.opacity)
            context.setBlendMode(CanvasStageView.cgBlendMode(for: paint.blendMode))
            if let gradient = CanvasStageView.parseGradient(from: value) {
                CanvasStageView.drawGradientFill(
                    parsed: gradient, in: rect, path: path, ctx: context)
            } else if let color = NSColor(hexString: value) {
                context.setFillColor(color.cgColor)
                context.addPath(path)
                context.fillPath()
            }
            context.restoreGState()
        }
    }

    static func strokes(
        _ node: VOONode, path: CGPath, rect: CGRect, opacity: CGFloat, context: CGContext
    ) {
        for paint in node.nativePaints(.stroke) where paint.isVisible && paint.opacity > 0 {
            guard let value = paint.value(.stroke) else { continue }
            var painted = node
            painted.style.stroke = value
            painted.style.strokeWidth = CGFloat(
                paint.properties["strokeWidth"]?.nativeNumber ?? Double(node.style.strokeWidth))
            painted.style.strokeOpacity = 1
            painted.style.strokeAlign =
                paint.properties["strokeAlign"]?.string ?? node.style.strokeAlign
            context.saveGState()
            context.setAlpha(opacity * paint.opacity)
            context.setBlendMode(CanvasStageView.cgBlendMode(for: paint.blendMode))
            CanvasStageView.drawStroke(for: painted, path: path, in: rect, ctx: context)
            context.restoreGState()
        }
    }

    static func text(_ node: VOONode, rect: CGRect, opacity: CGFloat, context: CGContext) {
        var text = node.text ?? node.name
        guard !text.isEmpty else { return }
        var rect = rect
        var textNode = node
        if (node.boxWidth ?? 0) > 0 {
            let layout = NativeTextBoxLayout.layout(node)
            text = layout.text
            rect.size.width = layout.size.width
            // Lines are already wrapped; clipping prevents a second independent layout.
            textNode.boxWidth = 0
        }
        let size = node.fontSize ?? 16
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
        defer { NSGraphicsContext.restoreGraphicsState() }
        for paint in node.nativePaints(.stroke) where paint.isVisible && paint.opacity > 0 {
            guard let value = paint.value(.stroke), let color = NSColor(hexString: value) else {
                continue
            }
            let width = CGFloat(
                paint.properties["strokeWidth"]?.nativeNumber ?? Double(node.style.strokeWidth))
            guard width > 0 else { continue }
            context.saveGState()
            context.setAlpha(opacity * paint.opacity)
            context.setBlendMode(CanvasStageView.cgBlendMode(for: paint.blendMode))
            var attributes = TextStyleResolver.resolvedAttributes(
                for: textNode, color: color, size: size)
            attributes[.strokeColor] = color
            attributes[.strokeWidth] = width / max(size, 1) * 100
            NSAttributedString(string: text, attributes: attributes).draw(
                with: rect, options: [.usesLineFragmentOrigin])
            context.restoreGState()
        }
        for paint in node.nativePaints(.fill) where paint.isVisible && paint.opacity > 0 {
            guard let value = paint.value(.fill), let color = NSColor(hexString: value) else {
                continue
            }
            context.saveGState()
            context.setAlpha(opacity * paint.opacity)
            context.setBlendMode(CanvasStageView.cgBlendMode(for: paint.blendMode))
            let attributes = TextStyleResolver.resolvedAttributes(
                for: textNode, color: color, size: size)
            NSAttributedString(string: text, attributes: attributes).draw(
                with: rect, options: [.usesLineFragmentOrigin])
            context.restoreGState()
        }
    }
}
