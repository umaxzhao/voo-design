import CoreGraphics
import Foundation

// MARK: - Flexible JSON Value Deserializers (Web SerDe Interop)

public struct FlexibleNumber: Decodable, Sendable {
    public let cgFloatValue: CGFloat
    public init(from decoder: Decoder) throws {
        let single = try decoder.singleValueContainer()
        if let d = try? single.decode(Double.self), d.isFinite {
            cgFloatValue = CGFloat(d)
        } else if let s = try? single.decode(String.self), let d = Double(s), d.isFinite {
            cgFloatValue = CGFloat(d)
        } else if let i = try? single.decode(Int.self) {
            cgFloatValue = CGFloat(i)
        } else {
            throw DecodingError.dataCorruptedError(
                in: single, debugDescription: "Expected a finite number")
        }
    }
}

public struct FlexibleBool: Decodable, Sendable {
    public let boolValue: Bool
    public init(from decoder: Decoder) throws {
        let single = try decoder.singleValueContainer()
        if let b = try? single.decode(Bool.self) {
            boolValue = b
        } else if let i = try? single.decode(Int.self) {
            boolValue = (i != 0)
        } else if let s = try? single.decode(String.self) {
            boolValue = (s == "1" || s.lowercased() == "true")
        } else {
            boolValue = false
        }
    }
}

public struct FlexibleString: Decodable, Sendable {
    public let stringValue: String
    public init(from decoder: Decoder) throws {
        let single = try decoder.singleValueContainer()
        if let s = try? single.decode(String.self) {
            stringValue = s
        } else if let i = try? single.decode(Int.self) {
            stringValue = String(i)
        } else if let d = try? single.decode(Double.self), d.isFinite {
            stringValue = String(d)
        } else {
            stringValue = ""
        }
    }
}
