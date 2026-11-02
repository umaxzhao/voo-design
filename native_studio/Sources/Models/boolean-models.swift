import CoreGraphics
import Foundation

public enum BooleanOperationType: String, Codable, Sendable, CaseIterable, Equatable {
    case add = "add"
    case subtract = "subtract"
    case intersect = "intersect"
    case xor = "xor"
    case divide = "divide"
    case union = "union"
    case exclude = "exclude"
}

public struct BooleanSource: Codable, Sendable, Equatable {
    public var id: String
    public var type: String
    public var x: CGFloat
    public var y: CGFloat
    public var w: CGFloat
    public var h: CGFloat
    public var rotation: CGFloat
    public var cornerRadius: CGFloat?
    public var points: [CGPoint]?
    public var booleanOperation: String?
    public var booleanSources: [BooleanSource]?

    public init(
        id: String, type: String, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat,
        rotation: CGFloat = 0
    ) {
        self.id = id
        self.type = type
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.rotation = rotation
    }
}
