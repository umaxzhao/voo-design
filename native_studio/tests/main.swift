import Foundation
import CoreGraphics
import AppKit

// 1. Initialize AppKit in headless mode for UI views and drawing contexts
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

// 2. Register all test suites across Tiers 1-4
Tier1_FeatureCoverageTests.registerTests()
Tier2_BoundaryCornerTests.registerTests()
Tier3_CrossFeatureTests.registerTests()
Tier4_RealWorldScenarioTests.registerTests()
UIParityTests.registerTests()
CanvasInteractionTests.registerTests()
M1_ToolFlyoutContextualTaskbarTests.registerTests()
M2_InspectorStudioTests.registerTests()
WorkspaceManagerTests.registerTests()
// AIAgentTests.registerTests()

let args = CommandLine.arguments

var selectedTier: Int? = nil
var filterPattern: String? = nil
var verbose: Bool = false

var i = 1
while i < args.count {
    let arg = args[i]
    if arg == "--tier" && i + 1 < args.count {
        i += 1
        if let t = Int(args[i]) {
            selectedTier = t
        }
    } else if arg == "--filter" && i + 1 < args.count {
        i += 1
        filterPattern = args[i]
    } else if arg == "--verbose" || arg == "-v" {
        verbose = true
    }
    i += 1
}

let allTests = TestRegistry.shared.allTests()
var testsToRun = allTests

if let tier = selectedTier {
    testsToRun = testsToRun.filter { $0.tier == tier }
}

if let filter = filterPattern {
    testsToRun = testsToRun.filter {
        $0.name.localizedCaseInsensitiveContains(filter) ||
        $0.feature.localizedCaseInsensitiveContains(filter)
    }
}

print("================================================================================")
print("             VOO DESIGN NATIVE STUDIO — OPAQUE-BOX E2E TEST RUNNER")
print("================================================================================")
print("Target: VOO Design Native (Swift 6 + AppKit + CoreGraphics + Metal)")
print("Filter: Tier = \(selectedTier.map { String($0) } ?? "All (1-4)"), Pattern = \(filterPattern ?? "None")")
print("Total registered test cases: \(allTests.count) | Selected: \(testsToRun.count)")
print("--------------------------------------------------------------------------------\n")

var executionResults: [TestExecutionResult] = []
let suiteStartTime = Date()

for test in testsToRun {
    let start = Date()
    var failure: TestFailure? = nil
    do {
        try test.closure()
    } catch let error as TestFailure {
        failure = error
    } catch {
        failure = TestFailure(message: "Unexpected error: \(error)", file: #file, line: #line)
    }
    let duration = Date().timeIntervalSince(start)
    let passed = (failure == nil)
    let result = TestExecutionResult(testCase: test, passed: passed, duration: duration, failure: failure)
    executionResults.append(result)

    let ms = String(format: "%.3fs", duration)
    if passed {
        if verbose || testsToRun.count <= 40 {
            print("  \u{001B}[32m[PASS]\u{001B}[0m (\(ms)) [T\(test.tier)] [\(test.feature)] \(test.name)")
        }
    } else {
        print("  \u{001B}[31m[FAIL]\u{001B}[0m (\(ms)) [T\(test.tier)] [\(test.feature)] \(test.name)")
        if let fail = failure {
            print("         \u{001B}[31m↳ \(fail.description)\u{001B}[0m")
        }
    }
}

let totalDuration = Date().timeIntervalSince(suiteStartTime)

// Summary Statistics per Tier
print("\n================================================================================")
print("                             TEST RESULTS SUMMARY")
print("================================================================================")
let hCol1 = "Tier & Feature Category".padding(toLength: 42, withPad: " ", startingAt: 0)
let hCol2 = "Total".padding(toLength: 10, withPad: " ", startingAt: 0)
let hCol3 = "Passed".padding(toLength: 10, withPad: " ", startingAt: 0)
let hCol4 = "Failed".padding(toLength: 10, withPad: " ", startingAt: 0)
let hCol5 = "Pass Rate"
print("\(hCol1)\(hCol2)\(hCol3)\(hCol4)\(hCol5)")
print("--------------------------------------------------------------------------------")

var grandTotal = 0
var grandPassed = 0
var grandFailed = 0

let tierNames = [
    1: "Tier 1: Feature Coverage (F1-F18)",
    2: "Tier 2: Boundary & Corner Cases",
    3: "Tier 3: Cross-Feature Combinations",
    4: "Tier 4: Real-World Scenarios"
]

for tier in 1...4 {
    let tierResults = executionResults.filter { $0.testCase.tier == tier }
    if tierResults.isEmpty && selectedTier != nil && selectedTier != tier {
        continue
    }
    let total = tierResults.count
    let passed = tierResults.filter { $0.passed }.count
    let failed = total - passed
    let rate = total > 0 ? (Double(passed) / Double(total) * 100.0) : 0.0

    grandTotal += total
    grandPassed += passed
    grandFailed += failed

    let tierTitle = tierNames[tier] ?? "Tier \(tier)"
    let rCol1 = tierTitle.padding(toLength: 42, withPad: " ", startingAt: 0)
    let rCol2 = String(format: "%-10d", total)
    let rCol3 = String(format: "%-10d", passed)
    let rCol4 = String(format: "%-10d", failed)
    let rCol5 = String(format: "%6.1f%%", rate)
    print("\(rCol1)\(rCol2)\(rCol3)\(rCol4)\(rCol5)")
}

print("--------------------------------------------------------------------------------")
let overallRate = grandTotal > 0 ? (Double(grandPassed) / Double(grandTotal) * 100.0) : 0.0
let gCol1 = "TOTAL".padding(toLength: 42, withPad: " ", startingAt: 0)
let gCol2 = String(format: "%-10d", grandTotal)
let gCol3 = String(format: "%-10d", grandPassed)
let gCol4 = String(format: "%-10d", grandFailed)
let gCol5 = String(format: "%6.1f%%", overallRate)
print("\(gCol1)\(gCol2)\(gCol3)\(gCol4)\(gCol5)")
print("================================================================================")
print(String(format: "Execution Time: %.3f seconds", totalDuration))

let isFiltered = (selectedTier != nil || filterPattern != nil)

if grandFailed == 0 && grandTotal > 0 {
    if !isFiltered && grandTotal < 207 {
        print("\u{001B}[33m⚠ ALL \(grandTotal) TESTS PASSED, BUT BELOW 207 FULL-SUITE THRESHOLD (Exit Code 1)\u{001B}[0m\n")
        exit(1)
    } else {
        let note = isFiltered ? " (Filtered Run)" : " (>= 207 THRESHOLD MET)"
        print("\u{001B}[32m✓ ALL \(grandTotal) TESTS PASSED CLEANLY\(note) (Exit Code 0)\u{001B}[0m\n")
        exit(0)
    }
} else {
    print("\u{001B}[31m✗ TEST SUITE FAILED with \(grandFailed) failure(s) (Exit Code 1)\u{001B}[0m\n")
    exit(1)
}
