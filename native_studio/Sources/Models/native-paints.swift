import CoreGraphics
import Foundation

public enum NativePaintChannel: String, Sendable {
    case fill, stroke
    var stackKey: String { rawValue + "s" }
    var hiddenKey: String { rawValue + "Hidden" }
    var opacityKey: String { rawValue == "fill" ? "opacity" : "strokeOpacity" }
}

public struct NativePaint: Equatable, Sendable {
    public var properties: [String: PortableJSONValue]
    public init(properties: [String: PortableJSONValue]) { self.properties = properties }
    public func value(_ channel: NativePaintChannel) -> String? {
        properties[channel.rawValue]?.string
    }
    public var opacity: CGFloat {
        CGFloat(
            properties["opacity"]?.nativeNumber ?? properties["strokeOpacity"]?.nativeNumber ?? 1)
    }
    public var isVisible: Bool { properties["visible"] != .bool(false) }
    public var blendMode: String { properties["blendMode"]?.string ?? "source-over" }
}

public enum NativePaintMutation: Sendable {
    case opacity(NativePaintChannel, Int, CGFloat)
    case visibility(NativePaintChannel, Int, Bool)
    case remove(NativePaintChannel, Int)
    case insert(NativePaintChannel, Int, NativePaint)
    case move(NativePaintChannel, Int, Int)

    var channel: NativePaintChannel {
        switch self {
        case .opacity(let channel, _, _), .visibility(let channel, _, _), .remove(let channel, _),
            .insert(let channel, _, _), .move(let channel, _, _):
            return channel
        }
    }
}

public enum NativePaintError: Error {
    case invalidIndex, invalidOpacity, invalidStack, primaryStrokeMove
}

extension PortableJSONValue {
    var nativeNumber: Double? {
        if case .number(let value) = self { return value }
        return nil
    }
}

extension VOONode {
    /// Web fills own the complete stack; Web strokes contain additional paints.
    /// The primary stroke remains in the legacy fields and must never be mirrored
    /// into strokes[0], which belongs to a different paint.
    public func nativePaints(_ channel: NativePaintChannel) -> [NativePaint] {
        let additional = portableProperties[channel.stackKey]?.array?.compactMap { value in
            value.object.map { NativePaint(properties: $0) }
        }
        if channel == .fill, let additional { return additional }
        let value = channel == .fill ? style.fill : style.stroke
        let opacity = channel == .fill ? style.fillOpacity : style.strokeOpacity
        let primary = NativePaint(properties: [
            channel.rawValue: .string(value), channel.opacityKey: .number(Double(opacity ?? 1)),
            "visible": .bool(portableProperties[channel.hiddenKey] != .bool(true)),
            "blendMode": .string(
                portableProperties[channel.rawValue + "BlendMode"]?.string ?? style.blendMode),
            "strokeWidth": .number(Double(style.strokeWidth)),
        ])
        return [primary] + (channel == .stroke ? additional ?? [] : [])
    }

    public mutating func applyPaintMutation(_ mutation: NativePaintMutation) throws {
        let channel = mutation.channel
        var paints = nativePaints(channel)
        let rawCount = portableProperties[channel.stackKey]?.array?.count
        let expectedCount = channel == .stroke ? paints.count - 1 : paints.count
        if let rawCount, rawCount != expectedCount { throw NativePaintError.invalidStack }
        switch mutation {
        case .opacity(_, let index, let value):
            guard value.isFinite, (0...1).contains(value) else {
                throw NativePaintError.invalidOpacity
            }
            guard paints.indices.contains(index) else { throw NativePaintError.invalidIndex }
            paints[index].properties[channel.opacityKey] = .number(Double(value))
        case .visibility(_, let index, let visible):
            guard paints.indices.contains(index) else { throw NativePaintError.invalidIndex }
            paints[index].properties["visible"] = .bool(visible)
        case .remove(_, let index):
            guard paints.indices.contains(index) else { throw NativePaintError.invalidIndex }
            if channel == .stroke && index == 0 {
                paints[0].properties["stroke"] = .string("transparent")
                paints[0].properties["strokeWidth"] = .number(0)
            } else {
                paints.remove(at: index)
            }
        case .insert(_, let index, let paint):
            guard (0...paints.count).contains(index) else { throw NativePaintError.invalidIndex }
            if channel == .stroke && index == 0 {
                guard
                    style.strokeWidth == 0 || style.stroke == "transparent"
                        || style.stroke == "none"
                else {
                    throw NativePaintError.primaryStrokeMove
                }
                paints[0] = paint
            } else {
                paints.insert(paint, at: index)
            }
        case .move(_, let source, let destination):
            guard paints.indices.contains(source), paints.indices.contains(destination) else {
                throw NativePaintError.invalidIndex
            }
            if channel == .stroke && (source == 0 || destination == 0) {
                throw NativePaintError.primaryStrokeMove
            }
            paints.insert(paints.remove(at: source), at: destination)
        }
        let primary = paints.first
        var nextStyle = style
        if channel == .fill {
            nextStyle.fill = primary?.value(.fill) ?? "transparent"
            nextStyle.fillOpacity = primary?.opacity ?? 1
        } else {
            nextStyle.stroke = primary?.value(.stroke) ?? "transparent"
            nextStyle.strokeOpacity = primary?.opacity ?? 1
            nextStyle.strokeWidth = CGFloat(
                primary?.properties["strokeWidth"]?.nativeNumber ?? Double(style.strokeWidth))
        }
        style = nextStyle
        let stored = channel == .fill ? paints : Array(paints.dropFirst())
        portableProperties[channel.stackKey] = .array(stored.map { .object($0.properties) })
        portableProperties[channel.hiddenKey] = .bool(primary?.isVisible == false)
    }
}
