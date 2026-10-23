//
//  AdversarialCommandTests.swift
//  native_studio
//
//  Empirical Adversarial Stress Testing Suite for CommandManager.swift
//  Milestone M1 Challenge Vectors:
//  1. Stack overflow & FIFO pruning (2,500 commands -> exact 1,000 clamp + oldest pruned)
//  2. Redo branch invalidation (500 undos -> new branch -> redo stack purged, canRedo false)
//  3. Batch rollback consistency (800 -> 100 -> 800 exact byte-level state matching)
//  4. Memory footprint under 1,000 history steps (RAM RSS < 5 MB)
//  5. Rapid concurrency & @MainActor isolation analysis
//

import CoreGraphics
import Darwin
import Foundation

// MARK: - Memory Measurement Utility

struct ProcessMemoryStats {
    let rssBytes: UInt64
    let physFootprintBytes: UInt64

    var rssMB: Double { Double(rssBytes) / (1024.0 * 1024.0) }
    var footprintMB: Double { Double(physFootprintBytes) / (1024.0 * 1024.0) }

    static func current() -> ProcessMemoryStats {
        var basicInfo = mach_task_basic_info()
        var basicCount = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let basicKerr: kern_return_t = withUnsafeMutablePointer(to: &basicInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(basicCount)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &basicCount)
            }
        }
        let rss = (basicKerr == KERN_SUCCESS) ? basicInfo.resident_size : 0

        var vmInfo = task_vm_info_data_t()
        var vmCount = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let vmKerr: kern_return_t = withUnsafeMutablePointer(to: &vmInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &vmCount)
            }
        }
        let footprint = (vmKerr == KERN_SUCCESS) ? vmInfo.phys_footprint : 0
        return ProcessMemoryStats(rssBytes: rss, physFootprintBytes: footprint)
    }
}

// MARK: - Test Framework Runner

final class AdversarialHarness {
    private var totalTests = 0
    private var passedTests = 0
    private var failedTests = 0
    private var failureMessages: [String] = []

    func assert(_ condition: Bool, _ testName: String, detail: String = "") {
        totalTests += 1
        if condition {
            print("  ✓ [PASS] \(testName)")
            passedTests += 1
        } else {
            let msg = "  ✗ [FAIL] \(testName) \(detail.isEmpty ? "" : "(\(detail))")"
            print(msg)
            failedTests += 1
            failureMessages.append(msg)
        }
    }

    func section(_ title: String) {
        print("\n" + String(repeating: "=", count: 70))
        print("  \(title)")
        print(String(repeating: "=", count: 70))
    }

    func summary() -> Bool {
        print("\n" + String(repeating: "=", count: 70))
        print("  ADVERSARIAL SUITE SUMMARY")
        print(String(repeating: "=", count: 70))
        print("  Total Asserts: \(totalTests)")
        print("  Passed:        \(passedTests)")
        print("  Failed:        \(failedTests)")
        if !failureMessages.isEmpty {
            print("\n  Failures recorded:")
            for f in failureMessages {
                print("    \(f)")
            }
        }
        print(String(repeating: "=", count: 70))
        return failedTests == 0
    }
}

// MARK: - Main Test Execution

@main
struct AdversarialMain {
    static func main() {
        let harness = AdversarialHarness()
        print("Starting Adversarial Command Engine Stress Testing Suite...")

        test1_StackOverflowAndFIFOPruning(harness: harness)
        test2_RedoBranchInvalidation(harness: harness)
        test3_BatchRollbackConsistency(harness: harness)
        test4_MemoryFootprintMeasurement(harness: harness)
        test5_ConcurrencyAndMainActorIsolation(harness: harness)

        let success = harness.summary()
        if !success {
            exit(1)
        }
    }

    // =========================================================================
    // Challenge 1: Stack overflow & FIFO pruning
    // =========================================================================
    static func test1_StackOverflowAndFIFOPruning(harness: AdversarialHarness) {
        harness.section("CHALLENGE 1: Stack Overflow & FIFO Pruning (2,500 Commands -> 1,000 Clamp)")

        var doc = VOODocument(title: "FIFO Pruning Doc")
        let mgr = CommandManager(maxStackDepth: 1000)

        harness.assert(mgr.undoStack.isEmpty, "Initial undoStack is empty")
        harness.assert(!mgr.canUndo, "canUndo is initially false")

        let totalPushed = 2500
        let startTime = CFAbsoluteTimeGetCurrent()

        for i in 1...totalPushed {
            let node = VOONode(
                id: "node_\(i)",
                kind: .rect,
                name: "Node_\(i)",
                x: CGFloat(i % 1000),
                y: CGFloat(i % 1000),
                width: 100,
                height: 50
            )
            let cmd = InsertNodeCommand(node: node)
            let ok = mgr.execute(cmd, on: &doc)
            if !ok {
                harness.assert(false, "Command execute failed at index \(i)")
                break
            }
        }
        let elapsed = CFAbsoluteTimeGetCurrent() - startTime
        print("  --> Pushed \(totalPushed) commands in \(String(format: "%.4f", elapsed))s (\(Int(Double(totalPushed) / elapsed)) ops/sec)")

        // 1. Exact clamp check
        harness.assert(mgr.undoStack.count == 1000, "Undo stack clamped exactly to 1,000 (actual: \(mgr.undoStack.count))")
        harness.assert(mgr.undoCount == 1000, "undoCount property reports 1,000")
        harness.assert(mgr.canUndo == true, "canUndo is true")
        harness.assert(mgr.redoStack.isEmpty, "redoStack is empty")
        harness.assert(!mgr.canRedo, "canRedo is false")
        harness.assert(doc.nodes.count == 2500, "Document accumulated all 2,500 executed nodes (actual: \(doc.nodes.count))")

        // 2. FIFO Pruning verification: commands 1...1500 were pruned, 1501...2500 remain
        let firstKeptCmd = mgr.undoStack.first as? InsertNodeCommand
        let lastKeptCmd = mgr.undoStack.last as? InsertNodeCommand

        harness.assert(firstKeptCmd?.node.name == "Node_1501",
                       "Oldest command in stack is exactly command #1501",
                       detail: "found: \(firstKeptCmd?.node.name ?? "nil")")
        harness.assert(lastKeptCmd?.node.name == "Node_2500",
                       "Newest command in stack is exactly command #2500",
                       detail: "found: \(lastKeptCmd?.node.name ?? "nil")")

        // Verify sequential continuity in retained 1000 commands
        var continuityOk = true
        for (idx, cmd) in mgr.undoStack.enumerated() {
            let expectedIndex = 1501 + idx
            if let insert = cmd as? InsertNodeCommand {
                if insert.node.name != "Node_\(expectedIndex)" {
                    continuityOk = false
                    break
                }
            } else {
                continuityOk = false
                break
            }
        }
        harness.assert(continuityOk, "Retained 1,000 commands form an unbroken sequence from #1501 to #2500")

        // 3. History timeline and items API
        let historyItems = mgr.getHistoryItems()
        harness.assert(historyItems.count == 1000, "getHistoryItems() returns exactly 1,000 tuples")
        harness.assert(historyItems.first?.name == "Insert Node", "getHistoryItems() first item name correct")

        let timeline = mgr.getHistoryTimeline()
        harness.assert(timeline.count == 1001, "getHistoryTimeline() returns 1,001 items (root + 1,000 commands)")
        harness.assert(timeline.first?.name == "创建文档", "Timeline root item is '创建文档'")
        harness.assert(timeline.last?.isCurrentHead == true, "Timeline current head is index 1000")

        // 4. Drain all 1,000 undos
        var undosSucceeded = true
        for _ in 1...1000 {
            if !mgr.undo(on: &doc) {
                undosSucceeded = false
                break
            }
        }
        harness.assert(undosSucceeded, "1,000 consecutive undos succeeded")
        harness.assert(mgr.undoStack.isEmpty, "undoStack is completely empty after 1,000 undos")
        harness.assert(!mgr.canUndo, "canUndo is false after 1,000 undos")
        harness.assert(mgr.redoStack.count == 1000, "redoStack contains all 1,000 undone commands")
        harness.assert(mgr.canRedo == true, "canRedo is true after undos")

        // Crucial FIFO boundary check: exactly the 1,500 pruned nodes remain permanent in the document!
        harness.assert(doc.nodes.count == 1500, "Document contains exactly the 1,500 pruned permanent nodes (actual: \(doc.nodes.count))")
        harness.assert(doc.nodes.first?.name == "Node_1", "First document node is Node_1")
        harness.assert(doc.nodes.last?.name == "Node_1500", "1,500th document node is Node_1500")

        // 5. Redo all 1,000 commands back to full 2,500 state
        var redosSucceeded = true
        for _ in 1...1000 {
            if !mgr.redo(on: &doc) {
                redosSucceeded = false
                break
            }
        }
        harness.assert(redosSucceeded, "1,000 consecutive redos succeeded")
        harness.assert(mgr.undoStack.count == 1000, "undoStack restored to 1,000 commands")
        harness.assert(mgr.redoStack.isEmpty, "redoStack is completely drained (count == 0)")
        harness.assert(doc.nodes.count == 2500, "Document fully restored all 2,500 nodes (actual: \(doc.nodes.count))")
        harness.assert(doc.nodes.last?.name == "Node_2500", "Final node is Node_2500")
    }

    // =========================================================================
    // Challenge 2: Redo branch invalidation
    // =========================================================================
    static func test2_RedoBranchInvalidation(harness: AdversarialHarness) {
        harness.section("CHALLENGE 2: Redo Branch Invalidation (500 Undos -> New Branch -> Purge)")

        var doc = VOODocument(title: "Branch Invalidation Doc")
        let mgr = CommandManager(maxStackDepth: 1000)

        // Seed 1,000 commands
        for i in 1...1000 {
            let node = VOONode(id: "node_\(i)", kind: .ellipse, name: "Circle_\(i)")
            _ = mgr.execute(InsertNodeCommand(node: node), on: &doc)
        }
        harness.assert(mgr.undoStack.count == 1000, "Seeded 1,000 commands into manager")
        harness.assert(doc.nodes.count == 1000, "Document contains 1,000 nodes")

        // Perform 500 undos
        var undosOk = true
        for _ in 1...500 {
            if !mgr.undo(on: &doc) {
                undosOk = false
                break
            }
        }
        harness.assert(undosOk, "500 undos executed cleanly")
        harness.assert(mgr.undoStack.count == 500, "Undo stack count is exactly 500")
        harness.assert(mgr.redoStack.count == 500, "Redo stack count is exactly 500")
        harness.assert(mgr.canUndo == true, "canUndo is true")
        harness.assert(mgr.canRedo == true, "canRedo is true before branching")
        harness.assert(doc.nodes.count == 500, "Document currently has 500 nodes")

        // Check top of redo stack before branching
        let topRedoCmd = mgr.redoStack.last as? InsertNodeCommand
        harness.assert(topRedoCmd?.node.name == "Circle_501", "Next redo command is Circle_501")

        // Now execute a NEW divergent command branch
        let branchNode = VOONode(id: "branch_alpha_999", kind: .path, name: "BranchDivergenceNode")
        let branchCmd = InsertNodeCommand(node: branchNode)
        let branchExecResult = mgr.execute(branchCmd, on: &doc)

        harness.assert(branchExecResult, "New branch command executed successfully")

        // INVARIANT VERIFICATION: Redo stack MUST be completely purged
        harness.assert(mgr.redoStack.isEmpty, "Redo stack is completely empty after new branch")
        harness.assert(mgr.redoStack.count == 0, "Redo stack count is strictly 0")
        harness.assert(mgr.canRedo == false, "canRedo is strictly false after new branch")
        harness.assert(mgr.undoStack.count == 501, "Undo stack count incremented to 501")
        harness.assert(doc.nodes.count == 501, "Document node count is 501")
        harness.assert(doc.nodes.last?.id == "branch_alpha_999", "Document contains new branch node")

        // Attempting redo must strictly fail without side-effects
        let rogueRedoResult = mgr.redo(on: &doc)
        harness.assert(!rogueRedoResult, "Redo attempt on empty redoStack returns false")
        harness.assert(mgr.redoStack.count == 0, "Redo stack remains 0 after failed redo")
        harness.assert(mgr.undoStack.count == 501, "Undo stack remains 501")

        // Undo the branch command
        let undoBranchOk = mgr.undo(on: &doc)
        harness.assert(undoBranchOk, "Undo branch command succeeded")
        harness.assert(mgr.undoStack.count == 500, "Undo stack back to 500")
        harness.assert(mgr.redoStack.count == 1, "Redo stack has only 1 command (the branch command)")
        harness.assert(mgr.canRedo == true, "canRedo is true for the branch command")
        let redoableCmd = mgr.redoStack.last as? InsertNodeCommand
        harness.assert(redoableCmd?.node.name == "BranchDivergenceNode", "Redoable command is BranchDivergenceNode, not old Circle_501")
    }

    // =========================================================================
    // Challenge 3: Batch rollback consistency (800 -> 100 -> 800)
    // =========================================================================
    static func test3_BatchRollbackConsistency(harness: AdversarialHarness) {
        harness.section("CHALLENGE 3: Batch Rollback Consistency (800 -> 100 -> 800 Exact State Matching)")

        var doc = VOODocument(title: "Batch Rollback Consistency Doc")
        let mgr = CommandManager(maxStackDepth: 1000)

        var snapshot100JSON: Data?
        var snapshot800JSON: Data?

        print("  --> Generating 800 heterogeneous transactional operations...")
        for i in 1...800 {
            let cmd: StudioCommand
            switch i {
            case 1...200:
                // Insert distinct nodes
                let node = VOONode(
                    id: "elem_\(i)",
                    kind: (i % 2 == 0) ? .rect : .ellipse,
                    name: "Element_\(i)",
                    x: CGFloat(i * 5),
                    y: CGFloat(i * 3),
                    width: 100,
                    height: 80
                )
                cmd = InsertNodeCommand(node: node)

            case 201...400:
                // Transform existing nodes
                let targetId = "elem_\(i - 200)"
                cmd = TransformLayerCommand(
                    nodeId: targetId,
                    oldFrame: CGRect(x: CGFloat((i - 200) * 5), y: CGFloat((i - 200) * 3), width: 100, height: 80),
                    newFrame: CGRect(x: CGFloat(i * 2), y: CGFloat(i * 4), width: 200, height: 160),
                    oldRotation: 0,
                    newRotation: CGFloat((i * 15) % 360)
                )

            case 401...600:
                // Style property mutations
                let targetId = "elem_\(i - 400)"
                let currentNode = doc.nodes.first(where: { $0.id == targetId })
                let currentFill = currentNode?.style.fill ?? "#262626"
                let currentOpacity = currentNode?.style.opacity ?? 1.0
                let currentStrokeWidth = currentNode?.style.strokeWidth ?? 1.0

                let change: NodeStylePropertyChange
                if i % 3 == 0 {
                    change = .fill(old: currentFill, new: "#ff00\(String(format: "%02x", i % 256))")
                } else if i % 3 == 1 {
                    change = .opacity(old: currentOpacity, new: 0.5)
                } else {
                    change = .strokeWidth(old: currentStrokeWidth, new: CGFloat(i % 10 + 2))
                }
                cmd = StyleChangeCommand(nodeId: targetId, change: change)

            default:
                // 601...800: Compound move + transform operations
                let targetId = "elem_\(i - 600)"
                let c1 = MoveLayerCommand(
                    nodeId: targetId,
                    oldPosition: CGPoint(x: CGFloat((i - 600) * 2), y: CGFloat((i - 600) * 4)),
                    newPosition: CGPoint(x: CGFloat(i * 10), y: CGFloat(i * 10))
                )
                let c2 = StyleChangeCommand(
                    nodeId: targetId,
                    change: .visible(old: true, new: false)
                )
                cmd = CompoundCommand(name: "Compound_\(i)", commands: [c1, c2])
            }

            let ok = mgr.execute(cmd, on: &doc)
            if !ok {
                harness.assert(false, "Failed to execute command at index \(i)")
                return
            }

            // Capture exact snapshot at index 100
            if i == 100 {
                do {
                    snapshot100JSON = try doc.serializeToJSON()
                } catch {
                    harness.assert(false, "Failed to serialize snapshot at index 100: \(error)")
                }
            }
        }

        // Capture exact snapshot at index 800
        do {
            snapshot800JSON = try doc.serializeToJSON()
        } catch {
            harness.assert(false, "Failed to serialize snapshot at index 800: \(error)")
        }

        harness.assert(mgr.undoStack.count == 800, "800 commands successfully executed")
        harness.assert(mgr.redoStack.count == 0, "Redo stack initially empty at index 800")
        harness.assert(snapshot100JSON != nil, "Snapshot at index 100 successfully captured (\(snapshot100JSON?.count ?? 0) bytes)")
        harness.assert(snapshot800JSON != nil, "Snapshot at index 800 successfully captured (\(snapshot800JSON?.count ?? 0) bytes)")

        // --- STEP 1: Rollback from 800 down to 100 ---
        let t0 = CFAbsoluteTimeGetCurrent()
        let rollbackDownOk = mgr.rollback(toIndex: 100, on: &doc)
        let tDown = CFAbsoluteTimeGetCurrent() - t0
        print("  --> Rollback 800 -> 100 (700 steps) executed in \(String(format: "%.4f", tDown))s")

        harness.assert(rollbackDownOk, "Rollback down to index 100 returned true")
        harness.assert(mgr.undoStack.count == 100, "undoStack count is exactly 100 after rollback down")
        harness.assert(mgr.redoStack.count == 700, "redoStack count is exactly 700 after rollback down")
        harness.assert(doc.nodes.count == 100, "Document contains exactly 100 nodes at index 100")

        // State byte-exact comparison at index 100
        do {
            let currentJSON100 = try doc.serializeToJSON()
            let byteMatch = (currentJSON100 == snapshot100JSON)
            if !byteMatch {
                let docSnap = try VOODocument.deserialize(from: snapshot100JSON!)
                print("  [DEBUG DIFF] doc.nodes.count: \(doc.nodes.count), snap.nodes.count: \(docSnap.nodes.count)")
                for idx in 0..<min(doc.nodes.count, docSnap.nodes.count) {
                    let nCurr = doc.nodes[idx]
                    let nSnap = docSnap.nodes[idx]
                    if nCurr != nSnap {
                        print("  [DEBUG DIFF] Mismatch at node [\(idx)] id=\(nCurr.id):")
                        if nCurr.x != nSnap.x { print("    x: \(nCurr.x) vs \(nSnap.x)") }
                        if nCurr.y != nSnap.y { print("    y: \(nCurr.y) vs \(nSnap.y)") }
                        if nCurr.width != nSnap.width { print("    w: \(nCurr.width) vs \(nSnap.width)") }
                        if nCurr.height != nSnap.height { print("    h: \(nCurr.height) vs \(nSnap.height)") }
                        if nCurr.rotation != nSnap.rotation { print("    rotation: \(nCurr.rotation) vs \(nSnap.rotation)") }
                        if nCurr.shear != nSnap.shear { print("    shear: \(nCurr.shear) vs \(nSnap.shear)") }
                        if nCurr.style != nSnap.style { print("    style: \(nCurr.style) vs \(nSnap.style)") }
                        if nCurr.name != nSnap.name { print("    name: \(nCurr.name) vs \(nSnap.name)") }
                    }
                }
                if doc.canvas != docSnap.canvas {
                    print("  [DEBUG DIFF] Canvas mismatch")
                }
                if doc.selectedNodeIds != docSnap.selectedNodeIds {
                    print("  [DEBUG DIFF] selectedNodeIds mismatch: \(doc.selectedNodeIds) vs \(docSnap.selectedNodeIds)")
                }
            }
            harness.assert(byteMatch,
                           "Document state at index 100 is BYTE-EXACT identical to pre-recorded snapshot 100",
                           detail: "size: \(currentJSON100.count) vs \(snapshot100JSON?.count ?? 0)")
        } catch {
            harness.assert(false, "Serialization check failed at index 100: \(error)")
        }

        // --- STEP 2: Rollback from 100 back forward to 800 ---
        let t1 = CFAbsoluteTimeGetCurrent()
        let rollbackUpOk = mgr.rollback(toIndex: 800, on: &doc)
        let tUp = CFAbsoluteTimeGetCurrent() - t1
        print("  --> Rollback forward 100 -> 800 (700 steps) executed in \(String(format: "%.4f", tUp))s")

        harness.assert(rollbackUpOk, "Rollback forward to index 800 returned true")
        harness.assert(mgr.undoStack.count == 800, "undoStack count is exactly 800 after rollback forward")
        harness.assert(mgr.redoStack.count == 0, "redoStack count is exactly 0 after rollback forward")
        harness.assert(doc.nodes.count == 200, "Document has 200 nodes restored (commands 1..200 created 200 nodes)")

        // State byte-exact comparison at index 800
        do {
            let currentJSON800 = try doc.serializeToJSON()
            harness.assert(currentJSON800 == snapshot800JSON,
                           "Document state at index 800 is BYTE-EXACT identical to pre-recorded snapshot 800",
                           detail: "size: \(currentJSON800.count) vs \(snapshot800JSON?.count ?? 0)")
        } catch {
            harness.assert(false, "Serialization check failed at index 800: \(error)")
        }

        // --- STEP 3: Boundary edge-cases ---
        let invalidNeg = mgr.rollback(toIndex: -1, on: &doc)
        harness.assert(!invalidNeg, "Rollback to index -1 is rejected")

        let invalidOver = mgr.rollback(toIndex: 801, on: &doc)
        harness.assert(!invalidOver, "Rollback to index 801 (beyond total 800) is rejected")

        let noopSame = mgr.rollback(toIndex: 800, on: &doc)
        harness.assert(noopSame, "Rollback to current index 800 is a no-op returning true")
        harness.assert(mgr.undoStack.count == 800, "Undo stack unchanged after no-op rollback")
    }

    // =========================================================================
    // Challenge 4: Memory footprint under 1,000 history steps
    // =========================================================================
    static func test4_MemoryFootprintMeasurement(harness: AdversarialHarness) {
        harness.section("CHALLENGE 4: Memory Footprint Under 1,000 History Steps (RAM RSS < 5 MB Target)")

        // Warm up and settle memory
        var warmupDoc = VOODocument(title: "Warmup")
        let warmupMgr = CommandManager(maxStackDepth: 100)
        for i in 1...100 {
            _ = warmupMgr.execute(InsertNodeCommand(node: VOONode(name: "W_\(i)")), on: &warmupDoc)
        }
        warmupMgr.clear()

        let memBaseline = ProcessMemoryStats.current()
        print("  --> Baseline Process RSS:      \(String(format: "%.3f", memBaseline.rssMB)) MB (\(memBaseline.rssBytes) bytes)")
        print("  --> Baseline Phys Footprint:   \(String(format: "%.3f", memBaseline.footprintMB)) MB (\(memBaseline.physFootprintBytes) bytes)")

        var doc = VOODocument(title: "Memory Stress Document")
        let mgr = CommandManager(maxStackDepth: 1000)

        // Generate 1,000 commands with realistic rich payloads (paths, styles, adjustments)
        for i in 1...1000 {
            let anchor1 = PenAnchor(x: CGFloat(i), y: CGFloat(i * 2), inHandle: CGPoint(x: CGFloat(i - 2), y: CGFloat(i)), outHandle: CGPoint(x: CGFloat(i + 2), y: CGFloat(i + 3)), isClosed: false, type: .smooth)
            let anchor2 = PenAnchor(x: CGFloat(i + 50), y: CGFloat(i + 80), inHandle: nil, outHandle: nil, isClosed: true, type: .sharp)

            var node = VOONode(
                id: "mem_node_\(i)",
                kind: .path,
                name: "VectorShapePath_\(i)",
                x: CGFloat(i),
                y: CGFloat(i * 2),
                width: 250,
                height: 180,
                points: [anchor1, anchor2]
            )
            node.style = LayerStyle(
                fill: "#3a7bd5",
                stroke: "#ffffff",
                strokeWidth: 2.5,
                opacity: 0.95,
                blendMode: "multiply",
                visible: true,
                locked: false
            )
            var effects = LayerEffects()
            effects.shadow = DropShadowEffect(enabled: true, color: "#00000088", blur: 8.0, offsetX: 2, offsetY: 4)
            node.effects = effects

            let cmd = InsertNodeCommand(node: node)
            _ = mgr.execute(cmd, on: &doc)
        }

        let memAfter1000 = ProcessMemoryStats.current()
        let deltaRSSBytes = (memAfter1000.rssBytes >= memBaseline.rssBytes) ? (memAfter1000.rssBytes - memBaseline.rssBytes) : 0
        let deltaFootprintBytes = (memAfter1000.physFootprintBytes >= memBaseline.physFootprintBytes) ? (memAfter1000.physFootprintBytes - memBaseline.physFootprintBytes) : 0

        let deltaRSSMB = Double(deltaRSSBytes) / (1024.0 * 1024.0)
        let deltaFootprintMB = Double(deltaFootprintBytes) / (1024.0 * 1024.0)
        let bytesPerStep = Double(deltaFootprintBytes) / 1000.0

        print("  --> Memory After 1,000 Steps:  RSS = \(String(format: "%.3f", memAfter1000.rssMB)) MB, Footprint = \(String(format: "%.3f", memAfter1000.footprintMB)) MB")
        print("  --> Delta RSS:                 \(String(format: "%.3f", deltaRSSMB)) MB (\(deltaRSSBytes) bytes)")
        print("  --> Delta Phys Footprint:      \(String(format: "%.3f", deltaFootprintMB)) MB (\(deltaFootprintBytes) bytes)")
        print("  --> Average Cost Per Step:     \(String(format: "%.2f", bytesPerStep)) bytes/step (~\(String(format: "%.2f", bytesPerStep / 1024.0)) KB)")

        let maxAllowedMB: Double = 5.0
        harness.assert(deltaRSSMB < maxAllowedMB,
                       "RAM RSS delta under 1,000 history steps is under 5 MB (actual: \(String(format: "%.3f", deltaRSSMB)) MB)",
                       detail: "ceiling: 5.0 MB")
        harness.assert(deltaFootprintMB < maxAllowedMB,
                       "Phys Footprint delta under 1,000 history steps is under 5 MB (actual: \(String(format: "%.3f", deltaFootprintMB)) MB)",
                       detail: "ceiling: 5.0 MB")

        // Verify clean deallocation on reset
        mgr.clear()
        doc.nodes.removeAll()
        let memAfterClear = ProcessMemoryStats.current()
        print("  --> Memory After clear():      RSS = \(String(format: "%.3f", memAfterClear.rssMB)) MB, Footprint = \(String(format: "%.3f", memAfterClear.footprintMB)) MB")
        harness.assert(mgr.undoStack.isEmpty && mgr.redoStack.isEmpty, "CommandManager completely purged on clear()")
    }

    // =========================================================================
    // Challenge 5: Concurrency, Thread Safety & @MainActor Isolation
    // =========================================================================
    static func test5_ConcurrencyAndMainActorIsolation(harness: AdversarialHarness) {
        harness.section("CHALLENGE 5: Rapid Concurrency & @MainActor Isolation Analysis")

        // --- SUBTEST 5A: Rapid Serialized Dispatch (Throughput & Stress) ---
        var doc = VOODocument(title: "Rapid Dispatch Doc")
        let mgr = CommandManager(maxStackDepth: 1000)

        let rapidCount = 10_000
        print("  --> Dispatching \(rapidCount) commands rapidly in sequence...")
        let t0 = CFAbsoluteTimeGetCurrent()

        for i in 1...rapidCount {
            let cmd = BasicCommand(
                name: "FastCmd_\(i)",
                execute: { doc in
                    doc.canvas.width += 0.001
                    return true
                },
                undo: { doc in
                    doc.canvas.width -= 0.001
                    return true
                }
            )
            _ = mgr.execute(cmd, on: &doc)
        }
        let elapsed = CFAbsoluteTimeGetCurrent() - t0
        let opsPerSec = Int(Double(rapidCount) / elapsed)
        print("  --> Completed \(rapidCount) dispatches in \(String(format: "%.4f", elapsed))s (\(opsPerSec) ops/sec)")

        harness.assert(mgr.undoStack.count == 1000, "Rapid dispatch maintains exact 1,000 stack clamp (count: \(mgr.undoStack.count))")
        harness.assert(abs(doc.canvas.width - (1920.0 + Double(rapidCount) * 0.001)) < 1e-4,
                       "Document mutations accurately applied across all \(rapidCount) calls")

        // --- SUBTEST 5B: Isolation Architectural Inspection ---
        func checkSendable<T: Sendable>(_ val: T) -> Bool { true }
        let isClassSendable = checkSendable(mgr)
        print("  --> Architectural Inspection:")
        print("      CommandManager is declared '@unchecked Sendable'")
        print("      CommandManager has NO internal locks (NSLock / os_unfair_lock)")
        print("      CommandManager has NO @MainActor class or method annotation")

        harness.assert(isClassSendable, "CommandManager conforms to Sendable (via @unchecked Sendable)")

        // Verify whether CommandManager methods can be called from non-main threads without compiler diagnostics
        var threadExecuted = false
        var threadWasMain = true
        let threadGroup = DispatchGroup()

        threadGroup.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            threadWasMain = Thread.isMainThread
            var backgroundDoc = VOODocument(title: "Background Doc")
            let bgCmd = BasicCommand(name: "BgCmd", execute: { _ in true }, undo: { _ in true })
            let ok = mgr.execute(bgCmd, on: &backgroundDoc)
            if ok {
                threadExecuted = true
            }
            threadGroup.leave()
        }
        threadGroup.wait()

        harness.assert(!threadWasMain, "CommandManager was callable from non-main thread (\(threadWasMain ? "Main" : "Background Thread"))")
        harness.assert(threadExecuted, "Background execution succeeded without @MainActor runtime trap")

        // CRITICAL EMPIRICAL FINDING:
        // CommandManager is NOT isolated to @MainActor at compile-time or runtime.
        // It relies on the caller (AppKit UI / WindowController) to dispatch on MainActor.
        // If multiple threads concurrently access CommandManager without caller-level synchronization,
        // data races will occur on undoStack/redoStack because it lacks internal locks.
        print("  --> Concurrency Isolation Conclusion:")
        print("      [FINDING] CommandManager lacks explicit @MainActor attribute and internal synchronization locks.")
        print("      [FINDING] In AppKit architecture, all UI actions (menus, canvas tools) execute on @MainActor.")
        print("      [RECOMMENDATION] Explicitly annotate 'public final class CommandManager' with '@MainActor'")
        print("      or replace '@unchecked Sendable' with internal lock/actor serialization to prevent concurrent corruption.")
    }
}
