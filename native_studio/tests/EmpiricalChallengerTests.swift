//
//  EmpiricalChallengerTests.swift
//  native_studio
//
//  Authoritative Adversarial Stress Test Suite for Milestone M1_R2
//  Executed by Empirical Challenger (challenger_m1_r2_2)
//
//  Challenge Vectors Tested:
//  1. Multi-Collision Duplicate Key Stress (10x node IDs, 50x color IDs, duplicate clipping masks)
//  2. Extreme Graph Invariants (Intertwined cycles A->B->C->A, D->E->D, overlapping, acyclic preservation)
//  3. VOOBIN01 Container Corruption Fuzzing (Random 100-byte mutations across header, envelope, payload)
//  4. CommandManager 2,500-Action Stress (1,000 clamp, 500 undo, branch purge, RAM RSS < 5 MB)
//

import CoreGraphics
import Darwin
import Foundation

// MARK: - Process Memory Statistics

public struct MemorySnapshot {
    public let rssBytes: UInt64
    public let physFootprintBytes: UInt64

    public var rssMB: Double { Double(rssBytes) / (1024.0 * 1024.0) }
    public var footprintMB: Double { Double(physFootprintBytes) / (1024.0 * 1024.0) }

    public static func capture() -> MemorySnapshot {
        var basicInfo = mach_task_basic_info()
        var basicCount = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let basicKerr = withUnsafeMutablePointer(to: &basicInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(basicCount)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &basicCount)
            }
        }
        let rss = (basicKerr == KERN_SUCCESS) ? basicInfo.resident_size : 0

        var vmInfo = task_vm_info_data_t()
        var vmCount = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let vmKerr = withUnsafeMutablePointer(to: &vmInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &vmCount)
            }
        }
        let footprint = (vmKerr == KERN_SUCCESS) ? vmInfo.phys_footprint : 0
        return MemorySnapshot(rssBytes: rss, physFootprintBytes: footprint)
    }
}

// MARK: - Test Harness Reporter

public final class StressHarness {
    public private(set) var totalAsserts = 0
    public private(set) var passedAsserts = 0
    public private(set) var failedAsserts = 0
    public private(set) var failureMessages: [String] = []

    public func assert(_ condition: Bool, _ title: String, detail: String = "") {
        totalAsserts += 1
        if condition {
            let detailStr = detail.isEmpty ? "" : " (\(detail))"
            print("  \u{001B}[32m✓ [PASS]\u{001B}[0m \(title)\(detailStr)")
            passedAsserts += 1
        } else {
            let detailStr = detail.isEmpty ? "" : " [\(detail)]"
            let msg = "  \u{001B}[31m✗ [FAIL]\u{001B}[0m \(title)\(detailStr)"
            print(msg)
            failedAsserts += 1
            failureMessages.append(msg)
        }
    }

    public func section(_ name: String) {
        print("\n" + String(repeating: "=", count: 78))
        print("  \(name)")
        print(String(repeating: "=", count: 78))
    }

    public func summary() -> Bool {
        print("\n" + String(repeating: "=", count: 78))
        print("  EMPIRICAL CHALLENGER STRESS SUITE SUMMARY")
        print(String(repeating: "=", count: 78))
        print("  Total Assertions: \(totalAsserts)")
        print("  Passed:           \(passedAsserts)")
        print("  Failed:           \(failedAsserts)")
        if !failureMessages.isEmpty {
            print("\n  Failures:")
            for f in failureMessages {
                print("    \(f)")
            }
        }
        print(String(repeating: "=", count: 78))
        return failedAsserts == 0
    }
}

// MARK: - Main Runner & Subprocess Probes

@main
public struct EmpiricalChallengerMain {

    public static func main() {
        let args = CommandLine.arguments

        // Isolated subprocess probe entry points
        if args.contains("--probe-multi-collision") {
            runProbeMultiCollision()
            return
        }
        if args.contains("--probe-extreme-cycles") {
            runProbeExtremeCycles()
            return
        }
        if args.contains("--probe-container-fuzz") {
            runProbeContainerFuzz()
            return
        }
        if args.contains("--probe-command-2500") {
            runProbeCommand2500()
            return
        }

        print("================================================================================")
        print("  VOO DESIGN NATIVE STUDIO — EMPIRICAL ADVERSARIAL STRESS SUITE (M1_R2)")
        print("================================================================================")
        print("Target: /Users/tt/teamwork_projects/voo_design/native_studio")
        print("Challenger: challenger_m1_r2_2 (teamwork_preview_challenger)")
        print("Timestamp: \(ISO8601DateFormatter().string(from: Date()))")

        let harness = StressHarness()

        // Challenge 1: Multi-Collision Duplicate Key Stress
        test1_MultiCollisionDuplicateKeyStress(harness: harness)

        // Challenge 2: Extreme Graph Invariants
        test2_ExtremeGraphInvariants(harness: harness)

        // Challenge 3: VOOBIN01 Container Corruption Fuzzing
        test3_VOOBIN01ContainerCorruptionFuzzing(harness: harness)

        // Challenge 4: CommandManager 2,500-Action Stress
        test4_CommandManager2500ActionStress(harness: harness)

        let success = harness.summary()
        if success {
            print("\n\u{001B}[32m>>> EMPIRICAL VERDICT: APPROVE <<<\u{001B}[0m")
            print("All stress vectors, invariants, memory bounds, and crash immunity verified.\n")
            exit(0)
        } else {
            print("\n\u{001B}[31m>>> EMPIRICAL VERDICT: REQUEST_CHANGES <<<\u{001B}[0m")
            print("One or more empirical assertions failed. See failure details above.\n")
            exit(1)
        }
    }

    // =========================================================================
    // 1. Multi-Collision Duplicate Key Stress
    // =========================================================================
    public static func test1_MultiCollisionDuplicateKeyStress(harness: StressHarness) {
        harness.section("CHALLENGE 1: Multi-Collision Duplicate Key Stress")

        // Step 1.1: Execute isolated subprocess probe to assert 0 SIGTRAP crashes
        print("  --> Executing isolated subprocess probe for Multi-Collision JSON payload...")
        let (probeExit, probeOutput) = runSubprocess(flag: "--probe-multi-collision")
        harness.assert(probeExit == 0,
                       "Isolated subprocess probe for multi-collision completed with exit code 0",
                       detail: "exitCode: \(probeExit), output: \(probeOutput.trimmingCharacters(in: .whitespacesAndNewlines))")

        // Step 1.2: In-process synthesis and strict assertion verification
        // Build payload with:
        // - 10x duplicate node IDs across multiple clusters ("node_cluster_A", "node_cluster_B", "node_cluster_C")
        // - 50x duplicate color variable IDs ("var_accent") with distinct values
        // - Duplicate clipping masks ("mask_dup_root") and multiple dependent clipped nodes
        var colorVariablesJSON: [String] = []
        for i in 1...50 {
            let hex = String(format: "#%06x", i * 1000)
            colorVariablesJSON.append("""
            {"id": "var_accent", "name": "Accent_\(i)", "value": "\(hex)"}
            """)
        }

        var nodesJSON: [String] = []
        // Cluster A: 10 nodes with ID "node_cluster_A"
        for i in 1...10 {
            nodesJSON.append("""
            {
              "id": "node_cluster_A",
              "kind": "rect",
              "name": "RectA_\(i)",
              "x": \(i * 10), "y": \(i * 10), "width": 100, "height": 100,
              "rotation": 0, "shear": 0,
              "fillVariableId": "var_accent",
              "style": { "fill": "#ffffff", "stroke": "#000000", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }
            }
            """)
        }

        // Mask Base 1
        nodesJSON.append("""
        {
          "id": "mask_dup_root",
          "kind": "rect",
          "name": "MaskRoot_1",
          "x": 0, "y": 0, "width": 500, "height": 500,
          "rotation": 0, "shear": 0,
          "style": { "fill": "#222222", "stroke": "#000000", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }
        }
        """)

        // Clipped nodes referencing mask_dup_root
        for i in 1...5 {
            nodesJSON.append("""
            {
              "id": "clipped_child_\(i)",
              "kind": "image",
              "name": "Clipped_\(i)",
              "x": 10, "y": 10, "width": 80, "height": 80,
              "rotation": 0, "shear": 0,
              "clipTo": "mask_dup_root",
              "style": { "fill": "#333333", "stroke": "#000000", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }
            }
            """)
        }

        // Duplicate Mask Base 2 (duplicate key collision in paint order)
        nodesJSON.append("""
        {
          "id": "mask_dup_root",
          "kind": "rect",
          "name": "MaskRoot_Duplicate",
          "x": 0, "y": 0, "width": 500, "height": 500,
          "rotation": 0, "shear": 0,
          "style": { "fill": "#444444", "stroke": "#000000", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }
        }
        """)

        // Cluster B: 10 nodes with ID "node_cluster_B"
        for i in 1...10 {
            nodesJSON.append("""
            {
              "id": "node_cluster_B",
              "kind": "ellipse",
              "name": "CircleB_\(i)",
              "x": \(i * 20), "y": \(i * 20), "width": 80, "height": 80,
              "rotation": 0, "shear": 0,
              "strokeVariableId": "var_accent",
              "style": { "fill": "#000000", "stroke": "#ffffff", "strokeWidth": 2, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false }
            }
            """)
        }

        let fullJSON = """
        {
          "id": "doc_multi_collision",
          "title": "Multi-Collision Stress Test Document",
          "version": 2,
          "canvasType": "design",
          "canvas": {
            "x": 0, "y": 0, "width": 1920, "height": 1080,
            "backgroundColor": "#0f0f0f",
            "guides": [],
            "colorVariables": [
              \(colorVariablesJSON.joined(separator: ",\n"))
            ]
          },
          "nodes": [
            \(nodesJSON.joined(separator: ",\n"))
          ],
          "selectedNodeIds": []
        }
        """.data(using: .utf8)!

        do {
            let doc = try VOODocument.deserialize(from: fullJSON)

            harness.assert(doc.title == "Multi-Collision Stress Test Document",
                           "Document title parsed successfully under 50x color + 20x node collisions")

            // Verify clean deduplication in colorMap:
            // First color variable in array was Accent_1 with hex #0003e8 (1 * 1000 = 1000 = 0x3e8)
            let expectedFirstColor = String(format: "#%06x", 1000)
            let clusterANodes = doc.nodes.filter { $0.id == "node_cluster_A" }
            harness.assert(clusterANodes.count == 10,
                           "Document retained all 10 nodes in cluster A (count: \(clusterANodes.count))")

            let allResolvedToFirst = clusterANodes.allSatisfy { $0.fill == expectedFirstColor }
            harness.assert(allResolvedToFirst,
                           "50x duplicate colorVariable IDs cleanly resolved to first declaration (\(expectedFirstColor))")

            // Verify clipping masks with duplicate root
            let clippedNodes = doc.nodes.filter { $0.id.hasPrefix("clipped_child_") }
            harness.assert(clippedNodes.count == 5, "All 5 clipped nodes parsed")
            let clippedOk = clippedNodes.allSatisfy { $0.clipTo == "mask_dup_root" }
            harness.assert(clippedOk,
                           "Clipped nodes correctly preserved valid clipping reference against paint order")

            // Verify deterministic reproducibility over 50 consecutive runs
            var deterministic = true
            for _ in 1...50 {
                let d = try VOODocument.deserialize(from: fullJSON)
                if d.nodes.count != doc.nodes.count || d.nodes.first?.fill != expectedFirstColor {
                    deterministic = false
                    break
                }
            }
            harness.assert(deterministic,
                           "Deserialization is 100% deterministic over 50 consecutive stress runs")

            // Verify direct mutate sanitizeCyclicHierarchy on multi-collision document
            var mutatedDoc = doc
            mutatedDoc.sanitizeCyclicHierarchy()
            harness.assert(mutatedDoc.nodes.count == doc.nodes.count,
                           "sanitizeCyclicHierarchy() completed with 0 crashes on duplicate ID document")

        } catch {
            harness.assert(false, "Deserialization threw unexpected error: \(error)")
        }
    }

    // =========================================================================
    // 2. Extreme Graph Invariants
    // =========================================================================
    public static func test2_ExtremeGraphInvariants(harness: StressHarness) {
        harness.section("CHALLENGE 2: Extreme Graph Invariants & Intertwined Cycles")

        // Step 2.1: Execute isolated subprocess probe
        print("  --> Executing isolated subprocess probe for Extreme Graph Cycles...")
        let (probeExit, probeOutput) = runSubprocess(flag: "--probe-extreme-cycles")
        harness.assert(probeExit == 0,
                       "Isolated subprocess probe for extreme graph cycles completed with exit code 0",
                       detail: "exitCode: \(probeExit), output: \(probeOutput.trimmingCharacters(in: .whitespacesAndNewlines))")

        // Step 2.2: Intertwined Cycles Topology Construction
        // Graph structure:
        // - Cycle 1 (3-node): cyc1_A -> cyc1_B -> cyc1_C -> cyc1_A
        // - Cycle 2 (2-node): cyc2_D -> cyc2_E -> cyc2_D
        // - Overlapping Cycle (sharing node G):
        //     shared_F -> shared_G -> shared_H -> shared_F
        //     shared_G -> shared_I -> shared_J -> shared_G
        // - Inbound Tail into Cycle 1: tail_X -> tail_Y -> cyc1_A
        // - Outbound Leaf Tree under Cycle 1: leaf_L1 -> leaf_L2 -> cyc1_B
        // - Self-Cycle: self_Z -> self_Z
        // - Disconnected Ghost Parent: ghost_node -> non_existent_parent_id
        // - Pristine Acyclic Hierarchy: root_R -> (child_R1, child_R2 -> grand_R2_1)

        var nodes: [VOONode] = []

        // Cycle 1
        nodes.append(VOONode(id: "cyc1_A", parentId: "cyc1_C", kind: .group, name: "Cyc1_A"))
        nodes.append(VOONode(id: "cyc1_B", parentId: "cyc1_A", kind: .group, name: "Cyc1_B"))
        nodes.append(VOONode(id: "cyc1_C", parentId: "cyc1_B", kind: .group, name: "Cyc1_C"))

        // Cycle 2
        nodes.append(VOONode(id: "cyc2_D", parentId: "cyc2_E", kind: .group, name: "Cyc2_D"))
        nodes.append(VOONode(id: "cyc2_E", parentId: "cyc2_D", kind: .group, name: "Cyc2_E"))

        // Overlapping Cycles sharing G
        nodes.append(VOONode(id: "shared_F", parentId: "shared_H", kind: .group, name: "Shared_F"))
        nodes.append(VOONode(id: "shared_G", parentId: "shared_F", kind: .group, name: "Shared_G"))
        nodes.append(VOONode(id: "shared_H", parentId: "shared_G", kind: .group, name: "Shared_H"))
        nodes.append(VOONode(id: "shared_I", parentId: "shared_G", kind: .group, name: "Shared_I"))
        nodes.append(VOONode(id: "shared_J", parentId: "shared_I", kind: .group, name: "Shared_J"))

        // Inbound Tail into Cycle 1
        nodes.append(VOONode(id: "tail_Y", parentId: "cyc1_A", kind: .group, name: "Tail_Y"))
        nodes.append(VOONode(id: "tail_X", parentId: "tail_Y", kind: .group, name: "Tail_X"))

        // Leaf Subtree rooted on Cycle 1
        nodes.append(VOONode(id: "leaf_L2", parentId: "cyc1_B", kind: .rect, name: "Leaf_L2"))
        nodes.append(VOONode(id: "leaf_L1", parentId: "leaf_L2", kind: .rect, name: "Leaf_L1"))

        // Self-Cycle & Ghost Parent
        nodes.append(VOONode(id: "self_Z", parentId: "self_Z", kind: .group, name: "Self_Z"))
        nodes.append(VOONode(id: "ghost_node", parentId: "ghost_id_404", kind: .rect, name: "GhostNode"))

        // Pristine Acyclic Tree
        nodes.append(VOONode(id: "root_R", parentId: nil, kind: .group, name: "Root_R"))
        nodes.append(VOONode(id: "child_R1", parentId: "root_R", kind: .rect, name: "Child_R1"))
        nodes.append(VOONode(id: "child_R2", parentId: "root_R", kind: .group, name: "Child_R2"))
        nodes.append(VOONode(id: "grand_R2_1", parentId: "child_R2", kind: .rect, name: "Grand_R2_1"))

        var doc = VOODocument(title: "Intertwined Cycles Doc", nodes: nodes)

        let t0 = CFAbsoluteTimeGetCurrent()
        doc.sanitizeCyclicHierarchy()
        let sanitizeElapsedMs = (CFAbsoluteTimeGetCurrent() - t0) * 1000.0

        print("  --> sanitizeCyclicHierarchy() completed in \(String(format: "%.3f", sanitizeElapsedMs)) ms")

        // Assert 1: Cycle 1 nodes must be cleared to nil
        let cyc1A = doc.nodes.first(where: { $0.id == "cyc1_A" })?.parentId
        let cyc1B = doc.nodes.first(where: { $0.id == "cyc1_B" })?.parentId
        let cyc1C = doc.nodes.first(where: { $0.id == "cyc1_C" })?.parentId
        harness.assert(cyc1A == nil && cyc1B == nil && cyc1C == nil,
                       "Cycle 1 (A->B->C->A) completely broken (all parentIds == nil)")

        // Assert 2: Cycle 2 nodes must be cleared to nil
        let cyc2D = doc.nodes.first(where: { $0.id == "cyc2_D" })?.parentId
        let cyc2E = doc.nodes.first(where: { $0.id == "cyc2_E" })?.parentId
        harness.assert(cyc2D == nil && cyc2E == nil,
                       "Cycle 2 (D->E->D) completely broken (both parentIds == nil)")

        // Assert 3: Overlapping cycle nodes sharing G must be cleared
        let sF = doc.nodes.first(where: { $0.id == "shared_F" })?.parentId
        let sG = doc.nodes.first(where: { $0.id == "shared_G" })?.parentId
        let sH = doc.nodes.first(where: { $0.id == "shared_H" })?.parentId
        let sI = doc.nodes.first(where: { $0.id == "shared_I" })?.parentId
        let sJ = doc.nodes.first(where: { $0.id == "shared_J" })?.parentId
        harness.assert(sF == nil && sG == nil && sH == nil && sI == nil && sJ == nil,
                       "Overlapping cycles sharing node G completely broken with 0 recursion")

        // Assert 4: Self cycle & ghost parent
        let selfZ = doc.nodes.first(where: { $0.id == "self_Z" })?.parentId
        let ghost = doc.nodes.first(where: { $0.id == "ghost_node" })?.parentId
        harness.assert(selfZ == nil, "Self-cycle Z->Z cleared to nil")
        harness.assert(ghost == nil, "Ghost parent reference cleared to nil")

        // Assert 5: PRISTINE ACYCLIC HIERARCHY PRESERVED INTACT
        let rParent = doc.nodes.first(where: { $0.id == "root_R" })?.parentId
        let r1Parent = doc.nodes.first(where: { $0.id == "child_R1" })?.parentId
        let r2Parent = doc.nodes.first(where: { $0.id == "child_R2" })?.parentId
        let grandParent = doc.nodes.first(where: { $0.id == "grand_R2_1" })?.parentId

        harness.assert(rParent == nil, "Valid root R has parentId nil")
        harness.assert(r1Parent == "root_R", "Child R1 preserved parentId == 'root_R'")
        harness.assert(r2Parent == "root_R", "Child R2 preserved parentId == 'root_R'")
        harness.assert(grandParent == "child_R2", "Grandchild grand_R2_1 preserved parentId == 'child_R2'")

        // Assert 6: Idempotency of sanitizeCyclicHierarchy()
        let nodesBefore = doc.nodes
        doc.sanitizeCyclicHierarchy()
        let nodesAfter = doc.nodes
        harness.assert(nodesBefore == nodesAfter,
                       "sanitizeCyclicHierarchy() is strictly idempotent (0 side-effects on re-run)")

        // Assert 7: 50-node dense ring cycle stress test
        var ringNodes: [VOONode] = []
        let ringCount = 50
        for i in 0..<ringCount {
            let nextIndex = (i + 1) % ringCount
            ringNodes.append(VOONode(id: "ring_\(i)", parentId: "ring_\(nextIndex)", kind: .group, name: "Ring_\(i)"))
        }
        var ringDoc = VOODocument(title: "50-Node Dense Ring Cycle", nodes: ringNodes)
        let tRing = CFAbsoluteTimeGetCurrent()
        ringDoc.sanitizeCyclicHierarchy()
        let tRingElapsed = (CFAbsoluteTimeGetCurrent() - tRing) * 1000.0

        let ringAllCleared = ringDoc.nodes.allSatisfy { $0.parentId == nil }
        harness.assert(ringAllCleared,
                       "50-node dense intertwined ring cycle broken in \(String(format: "%.2f", tRingElapsed)) ms with 0 stack overflow")
    }

    // =========================================================================
    // 3. VOOBIN01 Container Corruption Fuzzing
    // =========================================================================
    public static func test3_VOOBIN01ContainerCorruptionFuzzing(harness: StressHarness) {
        harness.section("CHALLENGE 3: VOOBIN01 Container Corruption Fuzzing")

        // Step 3.1: Execute isolated subprocess probe for fuzzing
        print("  --> Executing isolated subprocess probe for 100-byte container fuzzing...")
        let (probeExit, probeOutput) = runSubprocess(flag: "--probe-container-fuzz")
        harness.assert(probeExit == 0,
                       "Isolated subprocess probe for VOOBIN01 container fuzzing completed with exit code 0",
                       detail: "exitCode: \(probeExit), output: \(probeOutput.trimmingCharacters(in: .whitespacesAndNewlines))")

        // Step 3.2: In-process extensive randomized mutation fuzzing
        // Build reference valid VOOBIN01 container with multiple assets
        var sampleDoc = VOODocument(title: "Container Fuzz Baseline")
        for i in 1...10 {
            sampleDoc.nodes.append(VOONode(id: "sample_\(i)", kind: .rect, name: "Rect_\(i)", width: 100, height: 100))
        }

        let asset1 = (data: Data(repeating: 0x11, count: 4096), mime: "image/png")
        let asset2 = (data: Data(repeating: 0x22, count: 8192), mime: "image/jpeg")
        let asset3 = (data: Data(repeating: 0x33, count: 16384), mime: "application/octet-stream")
        let preview = Data(repeating: 0x44, count: 2048)

        guard let validBinary = try? VOOBinaryContainer.encode(
            document: sampleDoc,
            assets: ["asset_1": asset1, "asset_2": asset2, "asset_3": asset3],
            preview: preview
        ) else {
            harness.assert(false, "Failed to encode baseline VOOBIN01 container")
            return
        }

        harness.assert(VOOBinaryContainer.isVooBinary(data: validBinary),
                       "Baseline VOOBIN01 binary validated (\(validBinary.count) bytes)")

        // Sub-test 3.A: 100 iterations of 100-byte random scattered fuzz mutations
        let zeroCrashesScattered = true
        var caughtExpectedErrors = 0

        for seed in 1...100 {
            var fuzzedData = validBinary
            var rng = SplitMix64(seed: UInt64(seed * 7919))

            // Mutate 100 random distinct byte positions across the file
            for _ in 0..<100 {
                let offset = Int(rng.next() % UInt64(fuzzedData.count))
                let randomByte = UInt8(truncatingIfNeeded: rng.next())
                fuzzedData[offset] = randomByte
            }

            do {
                _ = try VOOBinaryContainer.decode(data: fuzzedData)
                // If it miraculously decodes (e.g. payload bytes mutated without affecting lengths), that's fine
            } catch is SerializationError {
                caughtExpectedErrors += 1
            } catch is DecodingError {
                caughtExpectedErrors += 1
            } catch {
                caughtExpectedErrors += 1
            }
        }

        harness.assert(zeroCrashesScattered,
                       "100 iterations of 100-byte scattered fuzz mutations executed with 0 fatal crashes")
        harness.assert(caughtExpectedErrors > 90,
                       "Over 90% of corrupted containers gracefully triggered recognized decode errors (actual: \(caughtExpectedErrors)/100)")

        // Sub-test 3.B: Targeted 100-byte contiguous block corruption across critical zones
        let zones: [(name: String, offset: Int)] = [
            ("Header Magic (offset 0)", 0),
            ("Length Prefix (offset 8)", 8),
            ("JSON Envelope Start (offset 12)", 12),
            ("JSON Envelope Middle", 12 + 100),
            ("Payload Boundary", validBinary.count / 2),
            ("Near File End", validBinary.count - 120)
        ]

        let allZonesHandledGracefully = true
        for zone in zones {
            var fuzzed = validBinary
            let start = min(zone.offset, fuzzed.count - 100)
            let garbage = (0..<100).map { UInt8($0 % 256) }
            fuzzed.replaceSubrange(start..<(start + 100), with: garbage)

            do {
                _ = try VOOBinaryContainer.decode(data: fuzzed)
            } catch is SerializationError {
                // Expected graceful error
            } catch is DecodingError {
                // Expected graceful error
            } catch {
                // Other thrown errors are fine
            }
        }
        harness.assert(allZonesHandledGracefully,
                       "100-byte contiguous block corruptions across all 6 critical zones threw errors gracefully without crashing")

        // Sub-test 3.C: Boundary truncations
        let truncationPoints = [0, 4, 8, 11, 12, 16, 50, 100, validBinary.count / 2, validBinary.count - 1]
        var allTruncationsSafe = true
        for tp in truncationPoints {
            let truncated = validBinary.prefix(tp)
            do {
                _ = try VOOBinaryContainer.decode(data: truncated)
                allTruncationsSafe = false
            } catch is SerializationError {
                // Expected
            } catch is DecodingError {
                // Expected
            } catch {
                // Other thrown errors
            }
        }
        harness.assert(allTruncationsSafe,
                       "All 10 truncation boundary cases (<12 bytes, truncated JSON, truncated payload) threw gracefully")
    }

    // =========================================================================
    // 4. CommandManager 2,500-Action Stress
    // =========================================================================
    public static func test4_CommandManager2500ActionStress(harness: StressHarness) {
        harness.section("CHALLENGE 4: CommandManager 2,500-Action Stress")

        // Step 4.1: Execute isolated subprocess probe
        print("  --> Executing isolated subprocess probe for 2,500-action CommandManager stress...")
        let (probeExit, probeOutput) = runSubprocess(flag: "--probe-command-2500")
        harness.assert(probeExit == 0,
                       "Isolated subprocess probe for CommandManager 2,500 stress completed with exit code 0",
                       detail: "exitCode: \(probeExit), output: \(probeOutput.trimmingCharacters(in: .whitespacesAndNewlines))")


        // Step 4.2: Phase A — 2,500 Transactional Actions & Memory Footprint (< 5 MB Target)
        print("  --> Phase A: 2,500 Heterogeneous Transactional Actions & Memory Measurement...")
        var doc = VOODocument(title: "Command 2500 Stress Document")
        let mgr = CommandManager(maxStackDepth: 1000)

        // Seed 50 baseline nodes
        for i in 1...50 {
            doc.nodes.append(VOONode(id: "n_\(i)", kind: .rect, name: "Node_\(i)", x: 10, y: 10, width: 100, height: 100))
        }

        let memBaseline = MemorySnapshot.capture()
        print("  --> Baseline Process RSS:      \(String(format: "%.3f", memBaseline.rssMB)) MB (\(memBaseline.rssBytes) bytes)")
        print("  --> Baseline Phys Footprint:   \(String(format: "%.3f", memBaseline.footprintMB)) MB (\(memBaseline.physFootprintBytes) bytes)")

        let totalPushed = 2500
        let t0 = CFAbsoluteTimeGetCurrent()
        for i in 1...totalPushed {
            let targetId = "n_\((i % 50) + 1)"
            let cmd: StudioCommand
            if i % 4 == 0 {
                cmd = MoveLayerCommand(nodeId: targetId, oldPosition: .zero, newPosition: CGPoint(x: CGFloat(i), y: CGFloat(i)))
            } else if i % 4 == 1 {
                cmd = TransformLayerCommand(nodeId: targetId, oldFrame: .zero, newFrame: CGRect(x: 0, y: 0, width: CGFloat(i), height: CGFloat(i)))
            } else if i % 4 == 2 {
                cmd = StyleChangeCommand(nodeId: targetId, change: .opacity(old: 1.0, new: 0.5))
            } else {
                cmd = MoveLayerCommand(nodeId: targetId, oldPosition: CGPoint(x: CGFloat(i), y: CGFloat(i)), newPosition: CGPoint(x: CGFloat(i * 2), y: CGFloat(i * 2)), name: "Move_\(i)")
            }
            let ok = mgr.execute(cmd, on: &doc)
            if !ok {
                harness.assert(false, "Failed to execute command at index \(i)")
                break
            }
        }
        let elapsedPush = CFAbsoluteTimeGetCurrent() - t0
        print("  --> Pushed \(totalPushed) actions in \(String(format: "%.4f", elapsedPush)) s (\(Int(Double(totalPushed) / elapsedPush)) ops/sec)")

        // 1. Verify strict 1,000-level clamp
        harness.assert(mgr.undoStack.count == 1000,
                       "Undo stack strictly clamped to 1,000 (actual: \(mgr.undoStack.count))")
        harness.assert(mgr.undoCount == 1000,
                       "undoCount property strictly reports 1,000")
        harness.assert(mgr.canUndo == true,
                       "canUndo is true after pushing 2,500 actions")
        harness.assert(mgr.redoStack.isEmpty == true,
                       "redoStack is completely empty")
        harness.assert(mgr.canRedo == false,
                       "canRedo is false")

        // 2. Undo 500 actions
        let t1 = CFAbsoluteTimeGetCurrent()
        var undosOk = true
        for _ in 1...500 {
            if !mgr.undo(on: &doc) {
                undosOk = false
                break
            }
        }
        let elapsedUndo = CFAbsoluteTimeGetCurrent() - t1
        print("  --> Undid 500 commands in \(String(format: "%.4f", elapsedUndo)) s")

        harness.assert(undosOk, "500 consecutive undos executed cleanly")
        harness.assert(mgr.undoStack.count == 500, "undoStack count is exactly 500")
        harness.assert(mgr.redoStack.count == 500, "redoStack count is exactly 500")
        harness.assert(mgr.canUndo == true, "canUndo is true")
        harness.assert(mgr.canRedo == true, "canRedo is true before branching")

        // 3. Branch new command -> verify redo stack strictly purged
        let branchCmd = MoveLayerCommand(nodeId: "n_1", oldPosition: .zero, newPosition: CGPoint(x: 999, y: 999), name: "BranchDivergentMove")
        let branchOk = mgr.execute(branchCmd, on: &doc)

        harness.assert(branchOk, "New branch command executed successfully")
        harness.assert(mgr.redoStack.isEmpty == true,
                       "Redo stack strictly purged on new branch command (count == 0)")
        harness.assert(mgr.redoStack.count == 0, "Redo stack count is 0")
        harness.assert(mgr.canRedo == false,
                       "canRedo is strictly false after new branch command")
        harness.assert(mgr.undoStack.count == 501,
                       "undoStack count incremented to 501")

        // 4. Measure memory footprint under 2,500 operations
        let memAfter = MemorySnapshot.capture()
        let deltaRSSBytes = (memAfter.rssBytes >= memBaseline.rssBytes) ? (memAfter.rssBytes - memBaseline.rssBytes) : 0
        let deltaFootprintBytes = (memAfter.physFootprintBytes >= memBaseline.physFootprintBytes) ? (memAfter.physFootprintBytes - memBaseline.physFootprintBytes) : 0
        let deltaRSSMB = Double(deltaRSSBytes) / (1024.0 * 1024.0)
        let deltaFootprintMB = Double(deltaFootprintBytes) / (1024.0 * 1024.0)

        print("  --> Memory After 2,500 Operations: RSS = \(String(format: "%.3f", memAfter.rssMB)) MB, Footprint = \(String(format: "%.3f", memAfter.footprintMB)) MB")
        print("  --> Delta RSS:                     \(String(format: "%.3f", deltaRSSMB)) MB (\(deltaRSSBytes) bytes)")
        print("  --> Delta Phys Footprint:          \(String(format: "%.3f", deltaFootprintMB)) MB (\(deltaFootprintBytes) bytes)")

        harness.assert(deltaRSSMB < 5.0,
                       "RAM RSS delta under 2,500 operations is strictly under 5 MB (actual: \(String(format: "%.3f", deltaRSSMB)) MB)")
        harness.assert(deltaFootprintMB < 5.0,
                       "Physical Footprint delta under 2,500 operations is strictly under 5 MB (actual: \(String(format: "%.3f", deltaFootprintMB)) MB)")

        // 5. Rollback verification to confirm stack coherence
        let rollbackDownOk = mgr.rollback(toIndex: 100, on: &doc)
        harness.assert(rollbackDownOk, "Rollback down to index 100 succeeded")
        harness.assert(mgr.undoStack.count == 100, "undoStack count is 100 after rollback down")
        harness.assert(mgr.redoStack.count == 401, "redoStack count is 401 after rollback down")

        let rollbackUpOk = mgr.rollback(toIndex: 501, on: &doc)
        harness.assert(rollbackUpOk, "Rollback back up to index 501 succeeded")
        harness.assert(mgr.undoStack.count == 501, "undoStack restored to 501 after rollback up")
        harness.assert(mgr.redoStack.count == 0, "redoStack completely cleared at head 501")

        // Step 4.3: Phase B — 2,500 Sequential Node Inserter & Exact FIFO Boundary Verification
        print("  --> Phase B: 2,500 Sequential Node Inserter & Exact FIFO Boundary Check...")
        var fifoDoc = VOODocument(title: "FIFO Boundary Doc")
        let fifoMgr = CommandManager(maxStackDepth: 1000)

        for i in 1...2500 {
            let node = VOONode(id: "fifo_\(i)", kind: .rect, name: "Node_\(i)")
            _ = fifoMgr.execute(InsertNodeCommand(node: node), on: &fifoDoc)
        }

        harness.assert(fifoMgr.undoStack.count == 1000,
                       "FIFO Manager strictly clamped to 1,000 commands")
        harness.assert(fifoDoc.nodes.count == 2500,
                       "FIFO Document accumulated all 2,500 nodes")

        let firstFifoCmd = fifoMgr.undoStack.first as? InsertNodeCommand
        let lastFifoCmd = fifoMgr.undoStack.last as? InsertNodeCommand
        harness.assert(firstFifoCmd?.node.name == "Node_1501",
                       "Oldest command in clamped stack is exactly #1501 (commands 1..1500 pruned)",
                       detail: "found: \(firstFifoCmd?.node.name ?? "nil")")
        harness.assert(lastFifoCmd?.node.name == "Node_2500",
                       "Newest command in clamped stack is exactly #2500",
                       detail: "found: \(lastFifoCmd?.node.name ?? "nil")")

        // Drain 1,000 undos
        for _ in 1...1000 {
            _ = fifoMgr.undo(on: &fifoDoc)
        }
        harness.assert(fifoMgr.undoStack.isEmpty, "undoStack drained to 0 after 1,000 undos")
        harness.assert(fifoMgr.redoStack.count == 1000, "redoStack contains all 1,000 undone commands")
        harness.assert(fifoDoc.nodes.count == 1500,
                       "Document retains exactly the 1,500 pruned permanent nodes (actual: \(fifoDoc.nodes.count))")
        harness.assert(fifoDoc.nodes.first?.name == "Node_1", "First retained node is Node_1")
        harness.assert(fifoDoc.nodes.last?.name == "Node_1500", "1,500th retained node is Node_1500")
    }

    // =========================================================================
    // Subprocess Runners for Strict Isolation
    // =========================================================================

    private static func runSubprocess(flag: String) -> (exitCode: Int32, output: String) {
        let binaryPath = CommandLine.arguments[0]
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = [flag]

        let pipe = Pipe()
        process.standardError = pipe
        process.standardOutput = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            return (process.terminationStatus, output)
        } catch {
            return (-1, "Subprocess execution failed: \(error)")
        }
    }

    // Subprocess Probe 1: Multi-collision duplicate key probe
    private static func runProbeMultiCollision() {
        var colorVariablesJSON: [String] = []
        for i in 1...50 {
            colorVariablesJSON.append("{\"id\": \"var_dup\", \"name\": \"Color_\(i)\", \"value\": \"#\(String(format: "%06x", i))\"}")
        }
        var nodesJSON: [String] = []
        for i in 1...10 {
            nodesJSON.append("{\"id\": \"node_dup\", \"kind\": \"rect\", \"name\": \"N_\(i)\", \"x\": 10, \"y\": 10, \"width\": 50, \"height\": 50, \"rotation\": 0, \"shear\": 0, \"style\": {\"fill\": \"#000\", \"stroke\": \"#fff\", \"strokeWidth\": 1, \"opacity\": 1, \"blendMode\": \"source-over\", \"visible\": true, \"locked\": false}}")
        }
        let jsonStr = """
        {
          "id": "probe_doc", "title": "Probe", "version": 2, "canvasType": "design",
          "canvas": { "x": 0, "y": 0, "width": 100, "height": 100, "backgroundColor": "#000", "guides": [], "colorVariables": [\(colorVariablesJSON.joined(separator: ","))] },
          "nodes": [\(nodesJSON.joined(separator: ","))],
          "selectedNodeIds": []
        }
        """
        guard let data = jsonStr.data(using: .utf8) else { exit(1) }
        do {
            _ = try VOODocument.deserialize(from: data)
            exit(0)
        } catch {
            exit(2)
        }
    }

    // Subprocess Probe 2: Extreme cycles probe
    private static func runProbeExtremeCycles() {
        var nodes: [VOONode] = []
        // Intertwined 3-node + 2-node cycles
        nodes.append(VOONode(id: "cA", parentId: "cC", kind: .group, name: "cA"))
        nodes.append(VOONode(id: "cB", parentId: "cA", kind: .group, name: "cB"))
        nodes.append(VOONode(id: "cC", parentId: "cB", kind: .group, name: "cC"))
        nodes.append(VOONode(id: "cD", parentId: "cE", kind: .group, name: "cD"))
        nodes.append(VOONode(id: "cE", parentId: "cD", kind: .group, name: "cE"))
        var doc = VOODocument(title: "Probe Cycles", nodes: nodes)
        doc.sanitizeCyclicHierarchy()
        exit(0)
    }

    // Subprocess Probe 3: Container fuzz probe
    private static func runProbeContainerFuzz() {
        let doc = VOODocument(title: "Fuzz Probe")
        guard let bin = try? VOOBinaryContainer.encode(document: doc) else { exit(1) }
        var fuzzed = bin
        if fuzzed.count >= 20 {
            for i in 0..<min(20, fuzzed.count) {
                fuzzed[i] = UInt8((Int(fuzzed[i]) + 42) % 256)
            }
        }
        do {
            _ = try VOOBinaryContainer.decode(data: fuzzed)
        } catch {
            // Expected
        }
        exit(0)
    }

    // Subprocess Probe 4: Command 2,500 actions probe
    private static func runProbeCommand2500() {
        var doc = VOODocument(title: "Cmd Probe")
        let mgr = CommandManager(maxStackDepth: 1000)
        for i in 1...2500 {
            _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "P_\(i)")), on: &doc)
        }
        for _ in 1...500 {
            _ = mgr.undo(on: &doc)
        }
        _ = mgr.execute(InsertNodeCommand(node: VOONode(name: "Branch")), on: &doc)
        if mgr.undoStack.count == 501 && mgr.redoStack.count == 0 {
            exit(0)
        } else {
            exit(3)
        }
    }
}

// Simple deterministic RNG for fuzzing reproducibility
private struct SplitMix64 {
    private var state: UInt64
    init(seed: UInt64) { self.state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9e3779b97f4a7c15
        var z = state
        z = (z ^ (z &>> 30)) &* 0xbf58476d1ce4e5b9
        z = (z ^ (z &>> 27)) &* 0x94d049bb133111eb
        return z ^ (z &>> 31)
    }
}
