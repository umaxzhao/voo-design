import Foundation

extension VOONode {
    /// Flat native controls edit the primary paint while preserving the rest of
    /// the web paint stack, including paint identity and unsupported metadata.
    mutating func synchronizePortablePaints(previous: LayerStyle) {
        if previous.fill != style.fill || previous.fillOpacity != style.fillOpacity {
            updatePrimaryPaint(
                key: "fills", valueKey: "fill", value: style.fill,
                opacity: style.fillOpacity, updateOpacity: previous.fillOpacity != style.fillOpacity
            )
        }
        if previous.stroke != style.stroke || previous.strokeOpacity != style.strokeOpacity {
            updatePrimaryPaint(
                key: "strokes", valueKey: "stroke", value: style.stroke,
                opacity: style.strokeOpacity,
                updateOpacity: previous.strokeOpacity != style.strokeOpacity)
        }
    }

    private mutating func updatePrimaryPaint(
        key: String, valueKey: String, value: String,
        opacity: CGFloat?, updateOpacity: Bool
    ) {
        guard var paints = portableProperties[key]?.array,
            !paints.isEmpty, var primary = paints[0].object
        else { return }
        primary[valueKey] = .string(value)
        if updateOpacity { primary["opacity"] = .number(Double(opacity ?? 1)) }
        paints[0] = .object(primary)
        portableProperties[key] = .array(paints)
    }
}
