import Foundation

/// Structured storage for document properties the native editor does not yet own.
public enum PortableJSONValue: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([PortableJSONValue])
    case object([String: PortableJSONValue])

    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() {
            self = .null
        } else if let bool = try? value.decode(Bool.self) {
            self = .bool(bool)
        } else if let number = try? value.decode(Double.self) {
            self = .number(number)
        } else if let string = try? value.decode(String.self) {
            self = .string(string)
        } else if let array = try? value.decode([Self].self) {
            self = .array(array)
        } else {
            self = .object(try value.decode([String: Self].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    public static func encoded<T: Encodable>(_ value: T) throws -> Self {
        try JSONDecoder().decode(Self.self, from: JSONEncoder().encode(value))
    }

    public var object: [String: Self]? {
        if case .object(let value) = self { return value }
        return nil
    }
    public var array: [Self]? {
        if case .array(let value) = self { return value }
        return nil
    }
    public var string: String? {
        if case .string(let value) = self { return value }
        return nil
    }
}

struct PortableCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init(_ value: String) { stringValue = value }
    init?(stringValue: String) { self.init(stringValue) }
    init?(intValue: Int) { return nil }
}

struct PortableDocumentEnvelope: Encodable {
    let format = "voo-editor"
    let version = 2
    let kind = "design"
    let document: VOODocument
    let assets: [String: String]
}
