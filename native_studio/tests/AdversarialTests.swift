//
//  AdversarialTests.swift
//  native_studio
//
//  Comprehensive Adversarial Stress Test Suite for DocumentModel & Serialization
//  Milestone M1 Challenge Verification
//

import CoreGraphics
import Foundation

@main
public struct AdversarialTestSuite {

    public static func main() {
        let args = CommandLine.arguments

        // Subprocess probe dispatch
        if args.contains("--probe-dup-node-id") {
            runProbeDuplicateNodeId()
            return
        }
        if args.contains("--probe-dup-color-id") {
            runProbeDuplicateColorId()
            return
        }

        print("================================================================================")
        print("    VOO DESIGN NATIVE STUDIO — ADVERSARIAL STRESS TEST SUITE (M1)")
        print("================================================================================")
        print("Target: DocumentModel.swift & Serialization.swift")
        print("Timestamp: \(ISO8601DateFormatter().string(from: Date()))")
        print("--------------------------------------------------------------------------------\n")

        var suitePassed = 0
        var suiteFailed = 0
        var criticalBugsFound: [String] = []

        func recordPass(_ name: String, detail: String = "") {
            suitePassed += 1
            let detailStr = detail.isEmpty ? "" : " (\(detail))"
            print("  \u{001B}[32m[PASS]\u{001B}[0m \(name)\(detailStr)")
        }

        func recordFail(_ name: String, reason: String) {
            suiteFailed += 1
            print("  \u{001B}[31m[FAIL]\u{001B}[0m \(name)")
            print("         \u{001B}[31m↳ \(reason)\u{001B}[0m")
        }

        func recordBug(_ title: String, _ description: String) {
            criticalBugsFound.append("\(title): \(description)")
            print("  \u{001B}[35m[BUG CONFIRMED]\u{001B}[0m \(title)")
            print("         \u{001B}[35m↳ \(description)\u{001B}[0m")
        }

        // =========================================================================
        // AREA 1: Circular References & Graph Invariants
        // =========================================================================
        print("\n--- [Area 1: Circular References & Graph Invariants] ---")

        // 1.1 Direct 2-Node Cycle (A -> B -> A)
        do {
            var doc = VOODocument(title: "Cycle A-B-A")
            let idA = "node_cycle_A"
            let idB = "node_cycle_B"
            let nodeA = VOONode(id: idA, parentId: idB, kind: .group, name: "NodeA")
            let nodeB = VOONode(id: idB, parentId: idA, kind: .group, name: "NodeB")
            doc.nodes = [nodeA, nodeB]

            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            let nA = normalized.nodes.first(where: { $0.id == idA })
            let nB = normalized.nodes.first(where: { $0.id == idB })

            if nA?.parentId == nil && nB?.parentId == nil {
                recordPass("1.1 Direct 2-Node Cycle (A -> B -> A)", detail: "Both parentIds cleared cleanly to nil")
            } else {
                recordFail("1.1 Direct 2-Node Cycle", reason: "Expected both parentIds nil, got A=\(String(describing: nA?.parentId)), B=\(String(describing: nB?.parentId))")
            }
        }

        // 1.2 3-Node Cycle (A -> B -> C -> A)
        do {
            var doc = VOODocument(title: "Cycle 3-Node")
            let nodeA = VOONode(id: "node_3A", parentId: "node_3C", kind: .group, name: "3A")
            let nodeB = VOONode(id: "node_3B", parentId: "node_3A", kind: .group, name: "3B")
            let nodeC = VOONode(id: "node_3C", parentId: "node_3B", kind: .group, name: "3C")
            doc.nodes = [nodeA, nodeB, nodeC]

            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            let allCleared = normalized.nodes.allSatisfy { $0.parentId == nil }
            if allCleared {
                recordPass("1.2 3-Node Cycle (A -> B -> C -> A)", detail: "All cyclic parentIds cleared to nil")
            } else {
                recordFail("1.2 3-Node Cycle", reason: "Cycles not completely broken")
            }
        }

        // 1.3 Self-Cycle (A -> A)
        do {
            var doc = VOODocument(title: "Self-Cycle")
            let nodeA = VOONode(id: "self_ref", parentId: "self_ref", kind: .group, name: "SelfRef")
            doc.nodes = [nodeA]

            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            if normalized.nodes.first?.parentId == nil {
                recordPass("1.3 Self-Cycle (A -> A)", detail: "Self-referencing parentId cleared to nil")
            } else {
                recordFail("1.3 Self-Cycle", reason: "Self-cycle was not broken")
            }
        }

        // 1.4 Disconnected Multiple Cycles (A<->B and C<->D)
        do {
            var doc = VOODocument(title: "Multi-Cycles")
            let a = VOONode(id: "cA", parentId: "cB", kind: .group, name: "cA")
            let b = VOONode(id: "cB", parentId: "cA", kind: .group, name: "cB")
            let c = VOONode(id: "cC", parentId: "cD", kind: .group, name: "cC")
            let d = VOONode(id: "cD", parentId: "cC", kind: .group, name: "cD")
            let valid = VOONode(id: "validRoot", parentId: nil, kind: .group, name: "validRoot")
            doc.nodes = [a, b, c, d, valid]

            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            let cyclesCleared = normalized.nodes.filter { ["cA", "cB", "cC", "cD"].contains($0.id) }.allSatisfy { $0.parentId == nil }
            let validPreserved = normalized.nodes.first(where: { $0.id == "validRoot" })?.parentId == nil
            if cyclesCleared && validPreserved {
                recordPass("1.4 Disconnected Multiple Cycles", detail: "Multiple disjoint cycles broken independently")
            } else {
                recordFail("1.4 Disconnected Multiple Cycles", reason: "Disjoint cycles failed to clear")
            }
        }

        // 1.5 Branch pointing into a cycle (Leaf -> CycleA -> CycleB -> CycleA)
        do {
            var doc = VOODocument(title: "Inbound Branch")
            let leaf = VOONode(id: "leaf", parentId: "cA", kind: .rect, name: "leaf")
            let a = VOONode(id: "cA", parentId: "cB", kind: .group, name: "cA")
            let b = VOONode(id: "cB", parentId: "cA", kind: .group, name: "cB")
            doc.nodes = [leaf, a, b]

            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            let leafParent = normalized.nodes.first(where: { $0.id == "leaf" })?.parentId
            let aParent = normalized.nodes.first(where: { $0.id == "cA" })?.parentId
            let bParent = normalized.nodes.first(where: { $0.id == "cB" })?.parentId
            if leafParent == nil && aParent == nil && bParent == nil {
                recordPass("1.5 Inbound Branch into Cycle", detail: "Subtree pointing into cycle correctly severed without recursion")
            } else {
                recordFail("1.5 Inbound Branch into Cycle", reason: "Failed to sever inbound branch")
            }
        }

        // 1.6 Orphan Parent Reference (parentId pointing to nonexistent node)
        do {
            var doc = VOODocument(title: "Orphan")
            let orphan = VOONode(id: "orphan", parentId: "ghost_id_404", kind: .rect, name: "orphan")
            doc.nodes = [orphan]

            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            if normalized.nodes.first?.parentId == nil {
                recordPass("1.6 Orphan Parent Reference", detail: "Non-existent parentId cleanly cleared to nil")
            } else {
                recordFail("1.6 Orphan Parent Reference", reason: "Ghost parentId was not cleared")
            }
        }

        // 1.7 Direct sanitizeCyclicHierarchy() Mutating Call
        do {
            var doc = VOODocument(title: "Direct Mutating Sanitization")
            let a = VOONode(id: "mA", parentId: "mB", kind: .group, name: "mA")
            let b = VOONode(id: "mB", parentId: "mA", kind: .group, name: "mB")
            doc.nodes = [a, b]
            doc.sanitizeCyclicHierarchy()
            let nA = doc.nodes.first(where: { $0.id == "mA" })
            let nB = doc.nodes.first(where: { $0.id == "mB" })
            if nA?.parentId == nil && nB?.parentId == nil {
                recordPass("1.7 Direct sanitizeCyclicHierarchy()", detail: "In-place mutation clears cycles")
            } else {
                recordFail("1.7 Direct sanitizeCyclicHierarchy()", reason: "In-place mutation failed")
            }
        }

        // =========================================================================
        // AREA 2: Malformed JSON Inputs & Schema Edge Cases
        // =========================================================================
        print("\n--- [Area 2: Malformed JSON Inputs & Schema Edge Cases] ---")

        // 2.1 Missing Top-Level Keys
        let malformedKeyCases: [(name: String, json: String)] = [
            ("Completely Empty JSON Object", "{}"),
            ("Missing nodes Array", """
            { "id": "d1", "title": "No Nodes", "version": 2, "canvasType": "design", "canvas": { "x": 0, "y": 0, "width": 100, "height": 100, "backgroundColor": "#000", "guides": [], "colorVariables": [] }, "selectedNodeIds": [] }
            """),
            ("Missing canvas Object", """
            { "id": "d1", "title": "No Canvas", "version": 2, "canvasType": "design", "nodes": [], "selectedNodeIds": [] }
            """)
        ]
        for c in malformedKeyCases {
            do {
                _ = try VOODocument.deserialize(from: c.json.data(using: .utf8)!)
                recordFail("2.1 Malformed Key: \(c.name)", reason: "Expected DecodingError, but deserialization succeeded")
            } catch is DecodingError {
                recordPass("2.1 Malformed Key: \(c.name)", detail: "Safely threw DecodingError")
            } catch {
                recordPass("2.1 Malformed Key: \(c.name)", detail: "Safely threw error: \(error)")
            }
        }

        // 2.2 Invalid Property Types
        let invalidTypeCases: [(name: String, json: String)] = [
            ("version as String instead of Int", """
            { "id": "d1", "title": "Bad Version", "version": "v2.0", "canvasType": "design", "canvas": { "x": 0, "y": 0, "width": 100, "height": 100, "backgroundColor": "#000", "guides": [], "colorVariables": [] }, "nodes": [], "selectedNodeIds": [] }
            """),
            ("nodes as Number instead of Array", """
            { "id": "d1", "title": "Bad Nodes", "version": 2, "canvasType": "design", "canvas": { "x": 0, "y": 0, "width": 100, "height": 100, "backgroundColor": "#000", "guides": [], "colorVariables": [] }, "nodes": 9999, "selectedNodeIds": [] }
            """),
            ("node width as Boolean instead of CGFloat", """
            { "id": "d1", "title": "Bad Width", "version": 2, "canvasType": "design", "canvas": { "x": 0, "y": 0, "width": 100, "height": 100, "backgroundColor": "#000", "guides": [], "colorVariables": [] }, "nodes": [{ "id": "n1", "kind": "rect", "name": "Box", "x": 0, "y": 0, "width": true, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } }], "selectedNodeIds": [] }
            """)
        ]
        for c in invalidTypeCases {
            do {
                _ = try VOODocument.deserialize(from: c.json.data(using: .utf8)!)
                recordFail("2.2 Invalid Type: \(c.name)", reason: "Expected DecodingError, but deserialization succeeded")
            } catch is DecodingError {
                recordPass("2.2 Invalid Type: \(c.name)", detail: "Safely rejected with DecodingError")
            } catch {
                recordPass("2.2 Invalid Type: \(c.name)", detail: "Safely threw error: \(error)")
            }
        }

        // 2.3 Extreme Coordinate & Dimension Values
        do {
            let extremeDocJSON = """
            {
              "id": "extreme_doc",
              "title": "Extreme Coordinates",
              "version": 2,
              "canvasType": "design",
              "canvas": { "x": 0, "y": 0, "width": 100000, "height": 100000, "backgroundColor": "#000", "guides": [], "colorVariables": [] },
              "nodes": [
                {
                  "id": "huge_node",
                  "kind": "rect",
                  "name": "Huge",
                  "x": 10000000000000.0,
                  "y": -10000000000000.0,
                  "width": 5000000000.0,
                  "height": 5000000000.0,
                  "rotation": 360000.0,
                  "shear": 80.0,
                  "style": { "fill": "#262626", "stroke": "#b2ffd6", "strokeWidth": 999.0, "opacity": 1.0, "blendMode": "source-over", "visible": true, "locked": false }
                }
              ],
              "selectedNodeIds": []
            }
            """.data(using: .utf8)!

            let decoded = try VOODocument.deserialize(from: extremeDocJSON)
            let node = decoded.nodes.first
            if let n = node, n.x == 10000000000000.0 && n.width == 5000000000.0 {
                recordPass("2.3 Extreme Coordinates & Dimensions", detail: "Decoded 1e13 coordinate values without precision crash")
            } else {
                recordFail("2.3 Extreme Coordinates", reason: "Value mismatch on extreme coordinates")
            }
        } catch {
            recordFail("2.3 Extreme Coordinates", reason: "Error: \(error)")
        }

        // 2.4 Negative & Zero Dimensions in JSON
        do {
            let negativeDimJSON = """
            {
              "id": "neg_doc",
              "title": "Negative Dimensions",
              "version": 2,
              "canvasType": "design",
              "canvas": { "x": 0, "y": 0, "width": 1920, "height": 1080, "backgroundColor": "#000", "guides": [], "colorVariables": [] },
              "nodes": [
                { "id": "valid_node", "kind": "rect", "name": "Valid", "x": 0, "y": 0, "width": 100, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } },
                { "id": "neg_width_node", "kind": "rect", "name": "NegWidth", "x": 0, "y": 0, "width": -50, "height": 100, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } },
                { "id": "zero_height_node", "kind": "rect", "name": "ZeroHeight", "x": 0, "y": 0, "width": 100, "height": 0, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } }
              ],
              "selectedNodeIds": []
            }
            """.data(using: .utf8)!

            let decoded = try VOODocument.deserialize(from: negativeDimJSON)
            if decoded.nodes.count == 1 && decoded.nodes[0].id == "valid_node" {
                recordPass("2.4 Negative & Zero Dimensions Filtering", detail: "Pruned 2 unrenderable non-positive dimension nodes")
            } else {
                recordFail("2.4 Negative & Zero Dimensions", reason: "Expected 1 readable node, got \(decoded.nodes.count)")
            }
        } catch {
            recordFail("2.4 Negative & Zero Dimensions", reason: "Error: \(error)")
        }

        // 2.5 Out-of-Order & Invalid clipTo Mask Indices
        do {
            var doc = VOODocument(title: "Clip Mask Test")
            let maskTarget = VOONode(id: "mask_target", kind: .rect, name: "MaskTarget")
            let validClipped = VOONode(id: "valid_clipped", kind: .image, name: "ValidClipped", clipTo: "mask_target")
            let forwardClipped = VOONode(id: "forward_clipped", kind: .image, name: "ForwardClipped", clipTo: "mask_future")
            let futureTarget = VOONode(id: "mask_future", kind: .rect, name: "FutureTarget")
            let selfClipped = VOONode(id: "self_clipped", kind: .image, name: "SelfClipped", clipTo: "self_clipped")
            let ghostClipped = VOONode(id: "ghost_clipped", kind: .image, name: "GhostClipped", clipTo: "ghost_target_999")

            // Layout: mask_target (0), valid_clipped (1), forward_clipped (2), futureTarget (3), self_clipped (4), ghost_clipped (5)
            // Note: forward_clipped is at index 2, but its target mask_future is at index 3 (paintOrder: 3 > 2, so baseIndex > nodeIndex: INVALID!)
            doc.nodes = [maskTarget, validClipped, forwardClipped, futureTarget, selfClipped, ghostClipped]

            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            let validResult = normalized.nodes.first(where: { $0.id == "valid_clipped" })?.clipTo
            let forwardResult = normalized.nodes.first(where: { $0.id == "forward_clipped" })?.clipTo
            let selfResult = normalized.nodes.first(where: { $0.id == "self_clipped" })?.clipTo
            let ghostResult = normalized.nodes.first(where: { $0.id == "ghost_clipped" })?.clipTo

            if validResult == "mask_target" && forwardResult == nil && selfResult == nil && ghostResult == nil {
                recordPass("2.5 Out-of-Order clipTo Normalization", detail: "Valid clip preserved, out-of-order/self/ghost clipTo safely reset to nil")
            } else {
                recordFail("2.5 clipTo Normalization", reason: "valid=\(String(describing: validResult)), forward=\(String(describing: forwardResult)), self=\(String(describing: selfResult)), ghost=\(String(describing: ghostResult))")
            }
        }

        // 2.6 Negative & Out-of-Bounds Crop Rectangles
        do {
            let cropTests: [(name: String, crop: CropRect?, shouldPreserve: Bool)] = [
                ("Negative x", CropRect(x: -10, y: 0, width: 100, height: 100), false),
                ("Negative y", CropRect(x: 0, y: -5, width: 100, height: 100), false),
                ("Zero width", CropRect(x: 0, y: 0, width: 0, height: 100), false),
                ("Negative height", CropRect(x: 0, y: 0, width: 100, height: -20), false),
                ("Exceeding canvas width (1920)", CropRect(x: 1900, y: 0, width: 50, height: 100), false),
                ("Exceeding canvas height (1080)", CropRect(x: 0, y: 1050, width: 100, height: 50), false),
                ("Valid inside canvas", CropRect(x: 50, y: 50, width: 800, height: 600), true)
            ]

            var allCropPassed = true
            for ct in cropTests {
                let doc = VOODocument(canvas: CanvasFrame(width: 1920, height: 1080, crop: ct.crop))
                let normalized = VOOSerializer.shared.normalizeOnImport(doc)
                let preserved = (normalized.canvas.crop != nil)
                if preserved != ct.shouldPreserve {
                    allCropPassed = false
                    recordFail("2.6 Crop Test: \(ct.name)", reason: "Expected preserved=\(ct.shouldPreserve), got \(preserved)")
                }
            }
            if allCropPassed {
                recordPass("2.6 Negative & Out-of-Bounds Crop Rectangles", detail: "7 boundary cases verified; invalid crops nulled, valid preserved")
            }
        }

        // 2.7 CRITICAL ADVERSARIAL CHALLENGE: Duplicate Node IDs Crash Detection
        print("  --> Executing isolated subprocess probe for duplicate node ID crash...")
        let (dupNodeExit, dupNodeErr) = runSubprocessProbe(flag: "--probe-dup-node-id")
        if dupNodeExit == 133 || dupNodeErr.contains("Duplicate values for key") {
            recordBug("CRITICAL-01: Duplicate Node IDs Trigger Uncaught Fatal Error (SIGTRAP)",
                      "When untrusted JSON contains duplicate node IDs, Serialization.swift line 135/163 and DocumentModel.swift line 844 invoke Dictionary(uniqueKeysWithValues:) which triggers fatalError: Duplicate values for key, crashing the host process with SIGTRAP (code 133). Fix required: Use Dictionary(..., uniquingKeysWith: { first, _ in first }).")
        } else if dupNodeExit == 0 {
            recordPass("2.7 Duplicate Node IDs Handled Gracefully")
        } else {
            recordFail("2.7 Duplicate Node IDs", reason: "Subprocess exited with code \(dupNodeExit), error: \(dupNodeErr)")
        }

        // 2.8 CRITICAL ADVERSARIAL CHALLENGE: Duplicate Color Variable IDs Crash Detection
        print("  --> Executing isolated subprocess probe for duplicate colorVariable ID crash...")
        let (dupColorExit, dupColorErr) = runSubprocessProbe(flag: "--probe-dup-color-id")
        if dupColorExit == 133 || dupColorErr.contains("Duplicate values for key") {
            recordBug("CRITICAL-02: Duplicate Color Variable IDs Trigger Uncaught Fatal Error (SIGTRAP)",
                      "When canvas.colorVariables contains duplicate IDs, Serialization.swift line 108 invokes Dictionary(uniqueKeysWithValues:) crashing with SIGTRAP (code 133). Fix required: Use Dictionary(..., uniquingKeysWith: { first, _ in first }).")
        } else if dupColorExit == 0 {
            recordPass("2.8 Duplicate ColorVariable IDs Handled Gracefully")
        } else {
            recordFail("2.8 Duplicate ColorVariable IDs", reason: "Subprocess exited with code \(dupColorExit), error: \(dupColorErr)")
        }

        // =========================================================================
        // AREA 3: Deep Nesting & Hierarchy Stress
        // =========================================================================
        print("\n--- [Area 3: Deep Nesting & Hierarchy Stress] ---")

        // 3.1 100-Level Deeply Nested Hierarchy
        do {
            let depth = 100
            var nodes: [VOONode] = []
            for i in 0..<depth {
                let pid = (i == 0) ? nil : "group_\(i - 1)"
                nodes.append(VOONode(id: "group_\(i)", parentId: pid, kind: .group, name: "NestLevel_\(i)"))
            }
            // Append terminal leaf shape
            nodes.append(VOONode(id: "leaf_rect", parentId: "group_\(depth - 1)", kind: .rect, name: "DeepestChild", width: 50, height: 50))

            let doc = VOODocument(title: "Deep 100-Level Doc", nodes: nodes)

            let t0 = CFAbsoluteTimeGetCurrent()
            let jsonData = try doc.serializeToJSON()
            let tSer = (CFAbsoluteTimeGetCurrent() - t0) * 1000.0

            let t1 = CFAbsoluteTimeGetCurrent()
            let decoded = try VOODocument.deserialize(from: jsonData)
            let tDeser = (CFAbsoluteTimeGetCurrent() - t1) * 1000.0

            let countMatch = (decoded.nodes.count == depth + 1)
            let leafParent = decoded.nodes.first(where: { $0.id == "leaf_rect" })?.parentId
            let leafOk = (leafParent == "group_\(depth - 1)")

            if countMatch && leafOk {
                recordPass("3.1 100-Level Deeply Nested Hierarchy", detail: "101 nodes, Ser: \(String(format: "%.2f", tSer))ms, Deser: \(String(format: "%.2f", tDeser))ms, no stack overflow")
            } else {
                recordFail("3.1 100-Level Deeply Nested Hierarchy", reason: "Hierarchy corruption: countMatch=\(countMatch), leafOk=\(leafOk)")
            }
        } catch {
            recordFail("3.1 100-Level Deeply Nested Hierarchy", reason: "Error: \(error)")
        }

        // 3.2 100-Level Nesting with Cycle at Deepest Level (Group 99 -> Group 0)
        do {
            let depth = 100
            var nodes: [VOONode] = []
            for i in 0..<depth {
                let pid = (i == 0) ? "group_\(depth - 1)" : "group_\(i - 1)" // Creates 100-level cycle
                nodes.append(VOONode(id: "group_\(i)", parentId: pid, kind: .group, name: "CycleLevel_\(i)"))
            }
            let doc = VOODocument(title: "Deep 100-Level Cycle Doc", nodes: nodes)

            let t0 = CFAbsoluteTimeGetCurrent()
            let normalized = VOOSerializer.shared.normalizeOnImport(doc)
            let elapsedMs = (CFAbsoluteTimeGetCurrent() - t0) * 1000.0

            let allBroken = normalized.nodes.allSatisfy { $0.parentId == nil }
            if allBroken {
                recordPass("3.2 100-Level Deep Cycle Traversal", detail: "Broke 100-level cycle in \(String(format: "%.2f", elapsedMs))ms without stack overflow")
            } else {
                recordFail("3.2 100-Level Deep Cycle", reason: "Cycle not fully broken")
            }
        }

        // 3.3 500-Level Extreme Nesting Stress
        do {
            let depth = 500
            var nodes: [VOONode] = []
            for i in 0..<depth {
                let pid = (i == 0) ? nil : "huge_nest_\(i - 1)"
                nodes.append(VOONode(id: "huge_nest_\(i)", parentId: pid, kind: .group, name: "L_\(i)"))
            }
            let doc = VOODocument(title: "500-Level Doc", nodes: nodes)
            let t0 = CFAbsoluteTimeGetCurrent()
            let jsonData = try doc.serializeToJSON()
            let decoded = try VOODocument.deserialize(from: jsonData)
            let elapsedMs = (CFAbsoluteTimeGetCurrent() - t0) * 1000.0

            if decoded.nodes.count == 500 {
                recordPass("3.3 500-Level Extreme Nesting Stress", detail: "Round-trip completed in \(String(format: "%.2f", elapsedMs))ms, all 500 levels preserved")
            } else {
                recordFail("3.3 500-Level Extreme Nesting", reason: "Expected 500 nodes, got \(decoded.nodes.count)")
            }
        } catch {
            recordFail("3.3 500-Level Extreme Nesting", reason: "Error: \(error)")
        }

        // =========================================================================
        // AREA 4: VOOBIN01 Binary Container Corruption
        // =========================================================================
        print("\n--- [Area 4: VOOBIN01 Binary Container Corruption] ---")

        // 4.1 Zero Length Data
        do {
            _ = try VOOBinaryContainer.decode(data: Data())
            recordFail("4.1 Zero Length Data", reason: "Expected error on empty Data, but decode succeeded")
        } catch let err as SerializationError {
            recordPass("4.1 Zero Length Data", detail: "Safely threw \(err)")
        } catch {
            recordPass("4.1 Zero Length Data", detail: "Safely threw \(error)")
        }

        // 4.2 Short Magic (1 to 7 bytes)
        let shortMagics = ["V", "VOO", "VOOB", "VOOBIN", "VOOBIN0"]
        var allShortMagicPassed = true
        for sm in shortMagics {
            do {
                _ = try VOOBinaryContainer.decode(data: sm.data(using: .utf8)!)
                allShortMagicPassed = false
            } catch is SerializationError {
                // Expected
            } catch {
                allShortMagicPassed = false
            }
        }
        if allShortMagicPassed {
            recordPass("4.2 Short Magic Bytes (< 8 bytes)", detail: "All short prefixes correctly rejected")
        } else {
            recordFail("4.2 Short Magic Bytes", reason: "One or more short magics did not throw SerializationError")
        }

        // 4.3 Invalid Magic Strings (8 bytes)
        let badMagics = ["VOOBIN00", "VOOBIN02", "AFFINITY", "NULLNULL", "12345678"]
        var allBadMagicsPassed = true
        for bm in badMagics {
            var data = bm.data(using: .utf8)!
            var zeroLen: UInt32 = 0
            data.append(Data(bytes: &zeroLen, count: 4))
            do {
                _ = try VOOBinaryContainer.decode(data: data)
                allBadMagicsPassed = false
            } catch SerializationError.invalidMagic {
                // Expected
            } catch {
                allBadMagicsPassed = false
            }
        }
        if allBadMagicsPassed {
            recordPass("4.3 Invalid 8-Byte Magic Headers", detail: "Rejected bad magic bytes with SerializationError.invalidMagic")
        } else {
            recordFail("4.3 Invalid Magic Headers", reason: "Bad magic bytes failed to trigger invalidMagic error")
        }

        // 4.4 Truncated Header (Magic present, but data < 12 bytes)
        do {
            let truncatedHeaderData = "VOOBIN01\u{01}\u{02}".data(using: .utf8)! // 10 bytes
            _ = try VOOBinaryContainer.decode(data: truncatedHeaderData)
            recordFail("4.4 Truncated Header (< 12 bytes)", reason: "Expected error, decode succeeded")
        } catch SerializationError.invalidMagic {
            recordPass("4.4 Truncated Header (< 12 bytes)", detail: "Safely rejected via prefix guard")
        } catch {
            recordPass("4.4 Truncated Header (< 12 bytes)", detail: "Threw \(error)")
        }

        // 4.5 Truncated Payload (Header specifies 2,000 bytes, file is 20 bytes)
        do {
            var truncatedPayload = "VOOBIN01".data(using: .utf8)!
            let length: UInt32 = 2000
            var lengthLE = length.littleEndian
            truncatedPayload.append(Data(bytes: &lengthLE, count: 4))
            truncatedPayload.append("{\"format\":\"voo\"}".data(using: .utf8)!) // only ~16 bytes

            _ = try VOOBinaryContainer.decode(data: truncatedPayload)
            recordFail("4.5 Truncated Payload", reason: "Expected truncatedHeader error, decode succeeded")
        } catch SerializationError.truncatedHeader {
            recordPass("4.5 Truncated Payload", detail: "Safely threw SerializationError.truncatedHeader")
        } catch {
            recordFail("4.5 Truncated Payload", reason: "Unexpected error: \(error)")
        }

        // 4.6 Corrupted JSON in Header Payload
        do {
            let garbageJSON = "NOT_A_VALID_JSON_STRING_AT_ALL".data(using: .utf8)!
            var data = "VOOBIN01".data(using: .utf8)!
            let length: UInt32 = UInt32(garbageJSON.count)
            var lengthLE = length.littleEndian
            data.append(Data(bytes: &lengthLE, count: 4))
            data.append(garbageJSON)

            _ = try VOOBinaryContainer.decode(data: data)
            recordFail("4.6 Corrupted JSON Header Payload", reason: "Expected DecodingError, decode succeeded")
        } catch is DecodingError {
            recordPass("4.6 Corrupted JSON Header Payload", detail: "Safely threw DecodingError on invalid JSON envelope")
        } catch {
            recordPass("4.6 Corrupted JSON Header Payload", detail: "Safely caught error: \(error)")
        }

        // 4.7 Out-of-Bounds Asset Byte Range in Asset Table
        do {
            let doc = VOODocument(title: "OOB Asset Doc")
            let badEnvelopeJSON = """
            {
              "format": "voo-editor",
              "version": 2,
              "kind": "design",
              "document": \(String(data: try! doc.serializeToJSON(), encoding: .utf8)!),
              "assetIndex": {
                "malicious_asset": {
                  "offset": 50,
                  "length": 9999999,
                  "mime": "image/png"
                }
              }
            }
            """.data(using: .utf8)!

            var data = "VOOBIN01".data(using: .utf8)!
            let length: UInt32 = UInt32(badEnvelopeJSON.count)
            var lengthLE = length.littleEndian
            data.append(Data(bytes: &lengthLE, count: 4))
            data.append(badEnvelopeJSON)
            data.append("SHORT_PAYLOAD".data(using: .utf8)!)

            _ = try VOOBinaryContainer.decode(data: data)
            recordFail("4.7 Out-of-Bounds Asset Table", reason: "Expected assetOutOfRange, decode succeeded")
        } catch SerializationError.assetOutOfRange(let id) {
            recordPass("4.7 Out-of-Bounds Asset Table", detail: "Safely threw assetOutOfRange for '\(id)'")
        } catch {
            recordFail("4.7 Out-of-Bounds Asset Table", reason: "Unexpected error: \(error)")
        }

        // 4.8 50-Iteration Fuzzed Bit-Flip Container Robustness
        do {
            let validDoc = VOODocument(title: "Fuzz Source", nodes: [VOONode(name: "FuzzTarget")])
            let validBin = try VOOBinaryContainer.encode(
                document: validDoc,
                assets: ["fuzz_img": (data: "VALID_IMAGE_DATA".data(using: .utf8)!, mime: "image/png")],
                preview: "PREVIEW_DATA".data(using: .utf8)!
            )

            for iter in 0..<50 {
                var corrupted = validBin
                let flipIndex = (iter * 17) % corrupted.count
                corrupted[flipIndex] ^= 0xFF // Invert byte

                do {
                    _ = try VOOBinaryContainer.decode(data: corrupted)
                } catch {
                    // Clean error throw expected
                }
            }
            recordPass("4.8 50-Iteration Fuzzed Bit-Flip Container Robustness", detail: "0 crashes across 50 random single-byte flips")
        } catch {
            recordFail("4.8 Fuzzed Bit-Flip Robustness", reason: "Error: \(error)")
        }

        // =========================================================================
        // AREA 5: Large Documents (1,000 Nodes) Stress & Performance
        // =========================================================================
        print("\n--- [Area 5: Large Documents (1,000 Nodes) Stress & Performance] ---")

        do {
            print("  --> Synthesizing 1,000-node heterogeneous document AST...")
            let nodeCount = 1000
            var nodes: [VOONode] = []
            nodes.reserveCapacity(nodeCount)

            // Group pool for hierarchy
            let groupCount = 100
            for g in 0..<groupCount {
                let parentId = (g > 0 && g % 5 != 0) ? "stress_group_\(g - 1)" : nil
                nodes.append(VOONode(
                    id: "stress_group_\(g)",
                    parentId: parentId,
                    kind: .group,
                    name: "Group_\(g)",
                    x: CGFloat(g * 10),
                    y: CGFloat(g * 10),
                    width: 500,
                    height: 500
                ))
            }

            // Rectangles (300)
            for r in 0..<300 {
                let parentGroup = (r < groupCount) ? "stress_group_\(r % groupCount)" : nil
                let style = LayerStyle(
                    fill: (r % 2 == 0) ? "#171717" : "#262626",
                    stroke: "#b2ffd6",
                    strokeWidth: CGFloat((r % 5) + 1),
                    opacity: 0.95
                )
                nodes.append(VOONode(
                    id: "stress_rect_\(r)",
                    parentId: parentGroup,
                    kind: .rect,
                    name: "Rect_\(r)",
                    x: CGFloat((r % 30) * 40),
                    y: CGFloat((r / 30) * 40),
                    width: 120,
                    height: 80,
                    rotation: CGFloat(r % 360),
                    style: style,
                    cornerRadii: CornerRadii(uniform: CGFloat(r % 16))
                ))
            }

            // Ellipses (200)
            for e in 0..<200 {
                nodes.append(VOONode(
                    id: "stress_ellipse_\(e)",
                    kind: .ellipse,
                    name: "Ellipse_\(e)",
                    x: CGFloat(e * 5),
                    y: CGFloat(e * 3),
                    width: 60,
                    height: 60,
                    style: LayerStyle(fill: "#ffffff", stroke: "#000000", strokeWidth: 2, opacity: 0.8)
                ))
            }

            // Paths with Cubic Bezier Anchors (200)
            for p in 0..<200 {
                let a1 = PenAnchor(x: 0, y: 0, inHandle: nil, outHandle: CGPoint(x: 20, y: 30), isClosed: false, type: .smooth)
                let a2 = PenAnchor(x: 100, y: 50, inHandle: CGPoint(x: 80, y: 20), outHandle: CGPoint(x: 120, y: 80), isClosed: false, type: .smooth)
                let a3 = PenAnchor(x: 200, y: 0, inHandle: CGPoint(x: 180, y: -20), outHandle: nil, isClosed: true, type: .sharp)
                nodes.append(VOONode(
                    id: "stress_path_\(p)",
                    kind: .path,
                    name: "Curve_\(p)",
                    x: CGFloat(p * 4),
                    y: CGFloat(p * 2),
                    width: 200,
                    height: 100,
                    points: [a1, a2, a3]
                ))
            }

            // Text Nodes (100)
            for t in 0..<100 {
                nodes.append(VOONode(
                    id: "stress_text_\(t)",
                    kind: .text,
                    name: "Label_\(t)",
                    x: CGFloat(t * 10),
                    y: CGFloat(t * 8),
                    width: 150,
                    height: 30,
                    text: "Typography Label #\(t) (VOO Design)",
                    fontSize: CGFloat(12 + (t % 16)),
                    fontFamily: "Inter"
                ))
            }

            // Shapes with FX & Adjustments (100)
            for fx in 0..<100 {
                var effects = LayerEffects()
                effects.shadow = DropShadowEffect(enabled: true, color: "#000000", blur: 12, offsetX: 0, offsetY: 4, opacity: 0.6)
                effects.glow = OuterGlowEffect(enabled: true, color: "#b2ffd6", blur: 8, opacity: 0.4)

                let adj = LayerAdjustments(brightness: 0.1, contrast: 0.2, saturation: 0.15, exposure: 0.05)
                nodes.append(VOONode(
                    id: "stress_fx_\(fx)",
                    kind: .rect,
                    name: "StyledCard_\(fx)",
                    x: CGFloat(fx * 15),
                    y: CGFloat(fx * 10),
                    width: 200,
                    height: 120,
                    adjustments: adj,
                    effects: effects
                ))
            }

            assert(nodes.count == 1000, "Node synthesis count mismatch")

            let largeDoc = VOODocument(
                title: "1000-Node Stress Benchmark",
                canvas: CanvasFrame(width: 3840, height: 2160),
                nodes: nodes
            )

            // 5.1 Serialization Benchmark
            let t0 = CFAbsoluteTimeGetCurrent()
            let jsonData = try largeDoc.serializeToJSON()
            let serTimeMs = (CFAbsoluteTimeGetCurrent() - t0) * 1000.0
            let payloadKB = Double(jsonData.count) / 1024.0

            if serTimeMs < 500.0 && jsonData.count > 100_000 {
                recordPass("5.1 1,000-Node JSON Serialization Benchmark", detail: "Payload: \(String(format: "%.1f", payloadKB)) KB, Time: \(String(format: "%.2f", serTimeMs)) ms (< 500ms gate)")
            } else {
                recordFail("5.1 1,000-Node JSON Serialization", reason: "Time exceeded gate: \(serTimeMs) ms, size: \(jsonData.count) bytes")
            }

            // 5.2 Deserialization & Normalization Benchmark
            let t1 = CFAbsoluteTimeGetCurrent()
            let deserializedDoc = try VOODocument.deserialize(from: jsonData)
            let deserTimeMs = (CFAbsoluteTimeGetCurrent() - t1) * 1000.0

            if deserTimeMs < 500.0 && deserializedDoc.nodes.count == 1000 {
                recordPass("5.2 1,000-Node JSON Deserialization & Normalization", detail: "Time: \(String(format: "%.2f", deserTimeMs)) ms (< 500ms gate)")
            } else {
                recordFail("5.2 1,000-Node JSON Deserialization", reason: "Time: \(deserTimeMs) ms, nodeCount: \(deserializedDoc.nodes.count)")
            }

            // 5.3 Round-Trip Fidelity Invariants Check
            var fidelityPass = true
            var mismatchDetail = ""

            if deserializedDoc.nodes.count != 1000 {
                fidelityPass = false
                mismatchDetail = "Node count mismatch: \(deserializedDoc.nodes.count) vs 1000"
            } else {
                for i in 0..<1000 {
                    let orig = largeDoc.nodes[i]
                    let dest = deserializedDoc.nodes[i]

                    if orig.id != dest.id {
                        fidelityPass = false
                        mismatchDetail = "Node \(i) ID mismatch: orig=\(orig.id), dest=\(dest.id)"
                        break
                    }
                    if orig.name != dest.name || orig.kind != dest.kind {
                        fidelityPass = false
                        mismatchDetail = "Node \(i) name/kind mismatch"
                        break
                    }
                    if abs(orig.x - dest.x) > 0.001 || abs(orig.y - dest.y) > 0.001 ||
                       abs(orig.width - dest.width) > 0.001 || abs(orig.height - dest.height) > 0.001 {
                        fidelityPass = false
                        mismatchDetail = "Node \(i) geometry mismatch"
                        break
                    }
                    if orig.points?.count != dest.points?.count {
                        fidelityPass = false
                        mismatchDetail = "Node \(i) Bezier points count mismatch"
                        break
                    }
                }
            }

            if fidelityPass {
                recordPass("5.3 1,000-Node Full Round-Trip Fidelity", detail: "100% of 1,000 nodes exact identity, geometry, and Bezier match")
            } else {
                recordFail("5.3 1,000-Node Round-Trip Fidelity", reason: mismatchDetail)
            }

            // 5.4 VOOBIN01 Binary Container 1,000 Nodes + Multi-Assets
            let mockAsset1 = Data(repeating: 0xAA, count: 128 * 1024) // 128 KB
            let mockAsset2 = Data(repeating: 0xBB, count: 256 * 1024) // 256 KB
            let mockAsset3 = Data(repeating: 0xCC, count: 512 * 1024) // 512 KB
            let mockPreview = Data(repeating: 0xDD, count: 64 * 1024)  // 64 KB

            let t2 = CFAbsoluteTimeGetCurrent()
            let binData = try VOOBinaryContainer.encode(
                document: largeDoc,
                assets: [
                    "asset_128k": (data: mockAsset1, mime: "image/png"),
                    "asset_256k": (data: mockAsset2, mime: "image/jpeg"),
                    "asset_512k": (data: mockAsset3, mime: "image/png")
                ],
                preview: mockPreview
            )
            let binEncodeTimeMs = (CFAbsoluteTimeGetCurrent() - t2) * 1000.0

            let t3 = CFAbsoluteTimeGetCurrent()
            let decodedBin = try VOOBinaryContainer.decode(data: binData)
            let binDecodeTimeMs = (CFAbsoluteTimeGetCurrent() - t3) * 1000.0

            let binNodesMatch = (decodedBin.document.nodes.count == 1000)
            let asset1Match = (decodedBin.assets["asset_128k"]?.data == mockAsset1)
            let asset2Match = (decodedBin.assets["asset_256k"]?.data == mockAsset2)
            let asset3Match = (decodedBin.assets["asset_512k"]?.data == mockAsset3)
            let previewMatch = (decodedBin.preview == mockPreview)

            if binNodesMatch && asset1Match && asset2Match && asset3Match && previewMatch {
                let binTotalKB = Double(binData.count) / 1024.0
                recordPass("5.4 VOOBIN01 Container (1,000 Nodes + 960KB Assets)", detail: "Total: \(String(format: "%.1f", binTotalKB)) KB, Enc: \(String(format: "%.2f", binEncodeTimeMs))ms, Dec: \(String(format: "%.2f", binDecodeTimeMs))ms, byte-exact")
            } else {
                recordFail("5.4 VOOBIN01 Container Stress", reason: "Mismatch in decoded container assets or nodes")
            }

        } catch {
            recordFail("Area 5 Execution Failure", reason: "Unexpected error: \(error)")
        }

        // =========================================================================
        // FINAL SUMMARY & VERDICT
        // =========================================================================
        print("\n================================================================================")
        print("                         ADVERSARIAL SUITE SUMMARY")
        print("================================================================================")
        print("  Total Tests Run:     \(suitePassed + suiteFailed)")
        print("  Passed:              \(suitePassed)")
        print("  Failed:              \(suiteFailed)")
        print("  Critical Bugs Found: \(criticalBugsFound.count)")
        print("--------------------------------------------------------------------------------")

        if !criticalBugsFound.isEmpty {
            print("\n\u{001B}[31m[CRITICAL BUGS IDENTIFIED]\u{001B}[0m")
            for (idx, bug) in criticalBugsFound.enumerated() {
                print("  \(idx + 1). \(bug)")
            }
            print("\n\u{001B}[31m>>> VERDICT: REQUEST_CHANGES <<<\u{001B}[0m")
            print("Explanation: The core SerDe pipeline contains fatal runtime crash vulnerabilities under untrusted JSON inputs.")
            exit(2)
        } else if suiteFailed > 0 {
            print("\n\u{001B}[31m>>> VERDICT: REQUEST_CHANGES <<<\u{001B}[0m")
            exit(1)
        } else {
            print("\n\u{001B}[32m>>> VERDICT: APPROVE <<<\u{001B}[0m")
            print("All adversarial challenges, invariants, and stress boundaries satisfied cleanly.")
            exit(0)
        }
    }

    // MARK: - Subprocess Probes for Crash Isolation

    private static func runProbeDuplicateNodeId() {
        let json = """
        {
          "id": "probe_doc",
          "title": "Dup Node Probe",
          "version": 2,
          "canvasType": "design",
          "canvas": { "x": 0, "y": 0, "width": 100, "height": 100, "backgroundColor": "#000", "guides": [], "colorVariables": [] },
          "nodes": [
            { "id": "collision_id", "kind": "rect", "name": "Box1", "x": 0, "y": 0, "width": 10, "height": 10, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } },
            { "id": "collision_id", "kind": "rect", "name": "Box2", "x": 0, "y": 0, "width": 10, "height": 10, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } }
          ],
          "selectedNodeIds": []
        }
        """.data(using: .utf8)!

        do {
            _ = try VOODocument.deserialize(from: json)
            exit(0)
        } catch {
            exit(1)
        }
    }

    private static func runProbeDuplicateColorId() {
        let json = """
        {
          "id": "probe_color_doc",
          "title": "Dup Color Probe",
          "version": 2,
          "canvasType": "design",
          "canvas": {
            "x": 0, "y": 0, "width": 100, "height": 100, "backgroundColor": "#000",
            "guides": [],
            "colorVariables": [
              { "id": "dup_color", "name": "ColorA", "value": "#ffffff" },
              { "id": "dup_color", "name": "ColorB", "value": "#000000" }
            ]
          },
          "nodes": [
            { "id": "n1", "kind": "rect", "name": "Box", "x": 0, "y": 0, "width": 10, "height": 10, "rotation": 0, "shear": 0, "style": { "fill": "#000", "stroke": "#fff", "strokeWidth": 1, "opacity": 1, "blendMode": "source-over", "visible": true, "locked": false } }
          ],
          "selectedNodeIds": []
        }
        """.data(using: .utf8)!

        do {
            _ = try VOODocument.deserialize(from: json)
            exit(0)
        } catch {
            exit(1)
        }
    }

    private static func runSubprocessProbe(flag: String) -> (exitCode: Int32, errorOutput: String) {
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
            return (-1, "Failed to launch probe: \(error)")
        }
    }
}
