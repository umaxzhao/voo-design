import CoreGraphics
import Foundation

public enum NodeType: String, Codable, Sendable, CaseIterable, Equatable {
    case sharp
    case smooth
    case symmetric
    case smart
}

/// Cubic Bezier pen anchor point with in/out control handles.
public struct PenAnchor: Codable, Sendable, Equatable {
    public var x: CGFloat
    public var y: CGFloat
    public var inHandle: CGPoint?
    public var outHandle: CGPoint?
    public var isClosed: Bool
    public var type: NodeType

    public init(
        x: CGFloat,
        y: CGFloat,
        inHandle: CGPoint? = nil,
        outHandle: CGPoint? = nil,
        isClosed: Bool = false,
        type: NodeType = .sharp
    ) {
        self.x = x
        self.y = y
        self.inHandle = inHandle
        self.outHandle = outHandle
        self.isClosed = isClosed
        self.type = type
    }

    public var point: CGPoint {
        CGPoint(x: x, y: y)
    }

    public var inLength: CGFloat {
        guard let inH = inHandle else { return 0 }
        return hypot(inH.x - x, inH.y - y)
    }

    public var outLength: CGFloat {
        guard let outH = outHandle else { return 0 }
        return hypot(outH.x - x, outH.y - y)
    }

    // Custom Codable to support both standard format and VOO Design JSON [in: [dx, dy], out: [dx, dy]]
    private enum CodingKeys: String, CodingKey {
        case x, y, inHandle, outHandle, isClosed, type
        case vooIn = "in"
        case vooOut = "out"
        case vooClose = "close"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.x = (try? container.decode(FlexibleNumber.self, forKey: .x))?.cgFloatValue ?? 0
        self.y = (try? container.decode(FlexibleNumber.self, forKey: .y))?.cgFloatValue ?? 0

        // Decode inHandle (CGPoint or [dx, dy] with flexible numbers)
        if let directIn = try? container.decode(CGPoint.self, forKey: .inHandle) {
            self.inHandle = directIn
        } else if let arr = try? container.decode([FlexibleNumber].self, forKey: .vooIn),
            arr.count >= 2
        {
            self.inHandle = CGPoint(x: x + arr[0].cgFloatValue, y: y + arr[1].cgFloatValue)
        } else {
            self.inHandle = nil
        }

        // Decode outHandle (CGPoint or [dx, dy] with flexible numbers)
        if let directOut = try? container.decode(CGPoint.self, forKey: .outHandle) {
            self.outHandle = directOut
        } else if let arr = try? container.decode([FlexibleNumber].self, forKey: .vooOut),
            arr.count >= 2
        {
            self.outHandle = CGPoint(x: x + arr[0].cgFloatValue, y: y + arr[1].cgFloatValue)
        } else {
            self.outHandle = nil
        }

        if let closed = try? container.decode(Bool.self, forKey: .isClosed) {
            self.isClosed = closed
        } else if let vooClose = try? container.decode(FlexibleBool.self, forKey: .vooClose) {
            self.isClosed = vooClose.boolValue
        } else {
            self.isClosed = false
        }

        self.type =
            (try? container.decode(NodeType.self, forKey: .type))
            ?? (inHandle == nil && outHandle == nil ? .sharp : .smooth)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(x, forKey: .x)
        try container.encode(y, forKey: .y)
        try container.encodeIfPresent(inHandle, forKey: .inHandle)
        try container.encodeIfPresent(outHandle, forKey: .outHandle)
        try container.encode(isClosed, forKey: .isClosed)
        try container.encode(type, forKey: .type)
        try container.encode(isClosed, forKey: .vooClose)
        if let inHandle { try container.encode([inHandle.x - x, inHandle.y - y], forKey: .vooIn) }
        if let outHandle {
            try container.encode([outHandle.x - x, outHandle.y - y], forKey: .vooOut)
        }
    }
}

// MARK: - 25 Comprehensive Blend Modes

extension PenAnchor {
    func translatedBy(dx: CGFloat, dy: CGFloat) -> PenAnchor {
        var copy = self
        copy.x += dx
        copy.y += dy
        copy.inHandle = inHandle.map { CGPoint(x: $0.x + dx, y: $0.y + dy) }
        copy.outHandle = outHandle.map { CGPoint(x: $0.x + dx, y: $0.y + dy) }
        return copy
    }
}
