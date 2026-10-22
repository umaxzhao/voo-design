import Foundation
import CoreGraphics
import AppKit

public struct TestFailure: Error, CustomStringConvertible {
    public let message: String
    public let file: String
    public let line: Int

    public var description: String {
        return "[\(URL(fileURLWithPath: file).lastPathComponent):\(line)] \(message)"
    }
}

public class TestAssertions {
    public static func assertTrue(_ condition: Bool, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if !condition {
            let msg = message.isEmpty ? "Expected condition to be true, but got false" : message
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertFalse(_ condition: Bool, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if condition {
            let msg = message.isEmpty ? "Expected condition to be false, but got true" : message
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if actual != expected {
            let msg = message.isEmpty ? "Assertion failed: expected <\(expected)>, got <\(actual)>" : "\(message) (expected <\(expected)>, got <\(actual)>)"
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertNotEqual<T: Equatable>(_ actual: T, _ unexpected: T, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if actual == unexpected {
            let msg = message.isEmpty ? "Assertion failed: expected value to not equal <\(unexpected)>" : "\(message) (got unexpected <\(unexpected)>)"
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertNil<T>(_ value: T?, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if let val = value {
            let msg = message.isEmpty ? "Expected nil, got <\(val)>" : "\(message) (expected nil, got <\(val)>)"
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertNotNil<T>(_ value: T?, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if value == nil {
            let msg = message.isEmpty ? "Expected non-nil value, got nil" : message
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertApproxEqual(_ actual: CGFloat, _ expected: CGFloat, accuracy: CGFloat = 1e-3, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if abs(actual - expected) > accuracy {
            let msg = message.isEmpty ? "Assertion failed: expected ~<\(expected)>, got <\(actual)> (diff \(abs(actual - expected)) > \(accuracy))" : "\(message) (expected ~<\(expected)>, got <\(actual)>)"
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertPointApproxEqual(_ actual: CGPoint, _ expected: CGPoint, accuracy: CGFloat = 1e-2, _ message: String = "", file: String = #file, line: Int = #line) throws {
        let dist = hypot(actual.x - expected.x, actual.y - expected.y)
        if dist > accuracy {
            let msg = message.isEmpty ? "Assertion failed: expected point ~<\(expected)>, got <\(actual)> (dist \(dist) > \(accuracy))" : "\(message) (expected ~<\(expected)>, got <\(actual)>)"
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertRectApproxEqual(_ actual: CGRect, _ expected: CGRect, accuracy: CGFloat = 1e-2, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if abs(actual.origin.x - expected.origin.x) > accuracy ||
           abs(actual.origin.y - expected.origin.y) > accuracy ||
           abs(actual.size.width - expected.size.width) > accuracy ||
           abs(actual.size.height - expected.size.height) > accuracy {
            let msg = message.isEmpty ? "Assertion failed: expected rect ~<\(expected)>, got <\(actual)>" : "\(message) (expected ~<\(expected)>, got <\(actual)>)"
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertGreaterThan(_ a: CGFloat, _ b: CGFloat, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if a <= b {
            let msg = message.isEmpty ? "Expected <\(a)> to be > <\(b)>" : message
            throw TestFailure(message: msg, file: file, line: line)
        }
    }

    public static func assertLessThan(_ a: CGFloat, _ b: CGFloat, _ message: String = "", file: String = #file, line: Int = #line) throws {
        if a >= b {
            let msg = message.isEmpty ? "Expected <\(a)> to be < <\(b)>" : message
            throw TestFailure(message: msg, file: file, line: line)
        }
    }
}

public struct TestCaseRecord {
    public let name: String
    public let tier: Int
    public let feature: String
    public let closure: () throws -> Void

    public init(name: String, tier: Int, feature: String, closure: @escaping () throws -> Void) {
        self.name = name
        self.tier = tier
        self.feature = feature
        self.closure = closure
    }
}

public struct TestExecutionResult {
    public let testCase: TestCaseRecord
    public let passed: Bool
    public let duration: TimeInterval
    public let failure: TestFailure?
}

public class TestRegistry {
    public static let shared = TestRegistry()
    private var tests: [TestCaseRecord] = []

    public func register(tier: Int, feature: String, name: String, test: @escaping () throws -> Void) {
        let record = TestCaseRecord(name: name, tier: tier, feature: feature, closure: test)
        tests.append(record)
    }

    public func allTests() -> [TestCaseRecord] {
        return tests
    }

    public func tests(forTier tier: Int) -> [TestCaseRecord] {
        return tests.filter { $0.tier == tier }
    }

    public func tests(matching filter: String) -> [TestCaseRecord] {
        return tests.filter { $0.name.localizedCaseInsensitiveContains(filter) || $0.feature.localizedCaseInsensitiveContains(filter) }
    }
}
