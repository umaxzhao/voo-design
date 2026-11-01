import Foundation

extension VOONode {
    /// Preserve unsupported effect kinds and extension fields while merging only
    /// the native properties that were actually changed by an explicit edit.
    func portableEffects() throws -> PortableJSONValue? {
        guard let effects else { return portableProperties["effects"] }
        guard let original = portableProperties["effects"] else { return try .encoded(effects) }
        guard var result = original.object else {
            throw EncodingError.invalidValue(
                effects,
                .init(
                    codingPath: [],
                    debugDescription: "Native controls cannot replace an unsupported effects schema"
                ))
        }
        let data = try JSONEncoder().encode(original)
        let previous: LayerEffects
        do {
            previous = try JSONDecoder().decode(LayerEffects.self, from: data)
        } catch is DecodingError {
            throw EncodingError.invalidValue(
                effects,
                .init(
                    codingPath: [],
                    debugDescription: "Native controls cannot replace an unsupported effects schema"
                ))
        }
        let before = try PortableJSONValue.encoded(previous).object ?? [:]
        let after = try PortableJSONValue.encoded(effects).object ?? [:]
        let keys = Set(before.keys).union(after.keys)
        for key in keys where before[key] != after[key] {
            guard let changed = after[key] else {
                result.removeValue(forKey: key)
                continue
            }
            if let update = changed.object, var existing = result[key]?.object {
                existing.merge(update) { _, new in new }
                result[key] = .object(existing)
            } else {
                result[key] = changed
            }
        }
        return .object(result)
    }
}
