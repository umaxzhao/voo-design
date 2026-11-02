import AppKit

/// NSBitmapImageRep.colorAt can return a generic calibrated NSColor even when
/// the bitmap is tagged sRGB. Reattach the bitmap's actual ICC space before
/// converting: converting that temporary colour directly applies a second,
/// incorrect transform (e.g. sRGB [0.5, 0, 0.5] becomes [0.577, 0.128, 0.575]).
enum TestBitmapSampling {
    static func color(_ bitmap: NSBitmapImageRep, x: Int, y: Int) -> NSColor {
        let raw = bitmap.colorAt(x: x, y: y)!
        var components = [CGFloat](repeating: 0, count: raw.numberOfComponents)
        raw.getComponents(&components)
        return components.withUnsafeBufferPointer { buffer in
            NSColor(
                colorSpace: bitmap.colorSpace, components: buffer.baseAddress!, count: buffer.count
            )
            .usingColorSpace(.sRGB)!
        }
    }
}
