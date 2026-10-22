//
//  CommandManager.swift
//  native_studio
//
//  Created for VOO Design Native Studio Milestone M1.
//  Copyright © 2026 VOO Design. All rights reserved.
//

import CoreGraphics
import Foundation

// MARK: - Core Command Protocol

public protocol StudioCommand: AnyObject, Sendable {
    var id: UUID { get }
    var name: String { get }
    var timestamp: Date { get }
    var iconName: String { get }

    func execute(document: inout VOODocument) -> Bool
    func undo(document: inout VOODocument) -> Bool
}

// Default icon fallback
extension StudioCommand {
    public var iconName: String { "LayersTabAddIcon" }
}

// MARK: - Basic Closure Command

public final class BasicCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String
    private let executeBlock: (inout VOODocument) -> Bool
    private let undoBlock: (inout VOODocument) -> Bool

    public init(
        name: String,
        iconName: String = "LayersTabAddIcon",
        execute: @escaping (inout VOODocument) -> Bool,
        undo: @escaping (inout VOODocument) -> Bool
    ) {
        self.name = name
        self.iconName = iconName
        self.executeBlock = execute
        self.undoBlock = undo
    }

    public func execute(document: inout VOODocument) -> Bool {
        executeBlock(&document)
    }

    public func undo(document: inout VOODocument) -> Bool {
        undoBlock(&document)
    }
}

// MARK: - Concrete Test Harness Commands (Insert, Delete, Transform, UpdateStyle, BooleanMutation)

public final class InsertNodeCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String = "Insert Node"
    public let timestamp: Date = Date()
    public let iconName: String = "LayersTabAddIcon"
    public let node: VOONode
    public let index: Int?

    public init(node: VOONode, index: Int? = nil) {
        self.node = node
        self.index = index
    }

    public func execute(document: inout VOODocument) -> Bool {
        if let idx = index, idx >= 0 && idx <= document.nodes.count {
            document.nodes.insert(node, at: idx)
        } else {
            document.nodes.append(node)
        }
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        if let idx = document.nodes.firstIndex(where: { $0.id == node.id }) {
            document.nodes.remove(at: idx)
            return true
        }
        return false
    }
}

public final class DeleteNodeCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String = "Delete Node"
    public let timestamp: Date = Date()
    public let iconName: String = "LayersTabDeleteIcon"
    public let nodeId: String
    private var deletedNode: VOONode?
    private var deletedIndex: Int?

    public init(nodeId: String) {
        self.nodeId = nodeId
    }

    public func execute(document: inout VOODocument) -> Bool {
        if let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) {
            deletedIndex = idx
            deletedNode = document.nodes[idx]
            document.nodes.remove(at: idx)
            return true
        }
        return false
    }

    public func undo(document: inout VOODocument) -> Bool {
        guard let node = deletedNode, let idx = deletedIndex else { return false }
        let safeIndex = min(idx, document.nodes.count)
        document.nodes.insert(node, at: safeIndex)
        return true
    }
}

public final class TransformNodeCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String = "Transform Node"
    public let timestamp: Date = Date()
    public let iconName: String = "TransformResizeIcon"
    public let nodeId: String
    public let newX: CGFloat
    public let newY: CGFloat
    public let newWidth: CGFloat
    public let newHeight: CGFloat
    public let newRotation: CGFloat
    private var oldX: CGFloat = 0
    private var oldY: CGFloat = 0
    private var oldWidth: CGFloat = 0
    private var oldHeight: CGFloat = 0
    private var oldRotation: CGFloat = 0

    public init(nodeId: String, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, rotation: CGFloat = 0) {
        self.nodeId = nodeId
        self.newX = x
        self.newY = y
        self.newWidth = width
        self.newHeight = height
        self.newRotation = rotation
    }

    public func execute(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        oldX = document.nodes[idx].x
        oldY = document.nodes[idx].y
        oldWidth = document.nodes[idx].width
        oldHeight = document.nodes[idx].height
        oldRotation = document.nodes[idx].rotation

        document.nodes[idx].x = newX
        document.nodes[idx].y = newY
        document.nodes[idx].width = max(newWidth, 0.001)
        document.nodes[idx].height = max(newHeight, 0.001)
        document.nodes[idx].rotation = newRotation
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        document.nodes[idx].x = oldX
        document.nodes[idx].y = oldY
        document.nodes[idx].width = oldWidth
        document.nodes[idx].height = oldHeight
        document.nodes[idx].rotation = oldRotation
        return true
    }
}

public final class UpdateStyleCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String = "Update Style"
    public let timestamp: Date = Date()
    public let iconName: String = "ColourPickerGlass"
    public let nodeId: String
    public let newStyle: LayerStyle
    private var oldStyle: LayerStyle?

    public init(nodeId: String, newStyle: LayerStyle) {
        self.nodeId = nodeId
        self.newStyle = newStyle
    }

    public func execute(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        oldStyle = document.nodes[idx].style
        document.nodes[idx].style = newStyle
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }), let old = oldStyle else { return false }
        document.nodes[idx].style = old
        return true
    }
}

public final class BooleanMutationCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "BooleanAddIcon"
    public let subjectId: String
    public let clipId: String
    public let resultNode: VOONode
    private var oldSubject: VOONode?
    private var oldClip: VOONode?
    private var oldSubjectIndex: Int?
    private var oldClipIndex: Int?

    public init(opName: String, subjectId: String, clipId: String, resultNode: VOONode) {
        self.name = "Boolean \(opName)"
        self.subjectId = subjectId
        self.clipId = clipId
        self.resultNode = resultNode
    }

    public func execute(document: inout VOODocument) -> Bool {
        guard let sIdx = document.nodes.firstIndex(where: { $0.id == subjectId }),
              let cIdx = document.nodes.firstIndex(where: { $0.id == clipId }) else { return false }

        oldSubject = document.nodes[sIdx]
        oldClip = document.nodes[cIdx]
        oldSubjectIndex = sIdx
        oldClipIndex = cIdx

        let maxIdx = max(sIdx, cIdx)
        let minIdx = min(sIdx, cIdx)
        document.nodes.remove(at: maxIdx)
        document.nodes.remove(at: minIdx)

        document.nodes.insert(resultNode, at: minIdx)
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        guard let resIdx = document.nodes.firstIndex(where: { $0.id == resultNode.id }),
              let subj = oldSubject, let clip = oldClip,
              let sIdx = oldSubjectIndex, let cIdx = oldClipIndex else { return false }

        document.nodes.remove(at: resIdx)
        let first = sIdx < cIdx ? (sIdx, subj) : (cIdx, clip)
        let second = sIdx < cIdx ? (cIdx, clip) : (sIdx, subj)

        if first.0 <= document.nodes.count { document.nodes.insert(first.1, at: first.0) } else { document.nodes.append(first.1) }
        if second.0 <= document.nodes.count { document.nodes.insert(second.1, at: second.0) } else { document.nodes.append(second.1) }
        return true
    }
}

// MARK: - Full Studio Command Suite (Move, Add, Delete, Transform, Style, Boolean, Reorder, Compound)

public final class AddLayerCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "LayersTabAddIcon"
    public let node: VOONode
    public let targetIndex: Int
    public let previousSelectedIds: Set<String>

    public init(node: VOONode, targetIndex: Int? = nil, previousSelectedIds: Set<String> = []) {
        self.name = "新建图层: \(node.name)"
        self.node = node
        self.targetIndex = targetIndex ?? Int.max
        self.previousSelectedIds = previousSelectedIds
    }

    public func execute(document: inout VOODocument) -> Bool {
        if !document.nodes.contains(where: { $0.id == node.id }) {
            let index = min(targetIndex, document.nodes.count)
            document.nodes.insert(node, at: index)
        }
        document.selectedNodeIds = [node.id]
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        document.nodes.removeAll { $0.id == node.id }
        document.selectedNodeIds = previousSelectedIds
        return true
    }
}

public final class DeleteLayerCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "LayersTabDeleteIcon"
    public let node: VOONode
    public let originalIndex: Int
    public let previousSelectedIds: Set<String>

    public init(node: VOONode, originalIndex: Int, previousSelectedIds: Set<String> = []) {
        self.name = "删除图层: \(node.name)"
        self.node = node
        self.originalIndex = originalIndex
        self.previousSelectedIds = previousSelectedIds
    }

    public func execute(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == node.id }) else { return false }
        document.nodes.remove(at: idx)
        document.selectedNodeIds.remove(node.id)
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        if !document.nodes.contains(where: { $0.id == node.id }) {
            let idx = min(originalIndex, document.nodes.count)
            document.nodes.insert(node, at: idx)
        }
        document.selectedNodeIds = previousSelectedIds
        return true
    }
}

public final class MoveLayerCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "TransformMoveIcon"
    public let nodeId: String
    public let oldPosition: CGPoint
    public let newPosition: CGPoint

    public init(nodeId: String, oldPosition: CGPoint, newPosition: CGPoint, name: String = "移动图层") {
        self.name = name
        self.nodeId = nodeId
        self.oldPosition = oldPosition
        self.newPosition = newPosition
    }

    public func execute(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        document.nodes[idx].x = newPosition.x
        document.nodes[idx].y = newPosition.y
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        document.nodes[idx].x = oldPosition.x
        document.nodes[idx].y = oldPosition.y
        return true
    }
}

public final class TransformLayerCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "TransformResizeIcon"
    public let nodeId: String
    public let oldFrame: CGRect
    public let newFrame: CGRect
    public let oldRotation: CGFloat
    public let newRotation: CGFloat
    public let oldShear: CGFloat
    public let newShear: CGFloat

    public init(
        nodeId: String,
        oldFrame: CGRect,
        newFrame: CGRect,
        oldRotation: CGFloat = 0,
        newRotation: CGFloat = 0,
        oldShear: CGFloat = 0,
        newShear: CGFloat = 0,
        name: String = "变换图层"
    ) {
        self.name = name
        self.nodeId = nodeId
        self.oldFrame = oldFrame
        self.newFrame = newFrame
        self.oldRotation = oldRotation
        self.newRotation = newRotation
        self.oldShear = oldShear
        self.newShear = newShear
    }

    public func execute(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        document.nodes[idx].x = newFrame.origin.x
        document.nodes[idx].y = newFrame.origin.y
        document.nodes[idx].width = max(newFrame.width, 0.001)
        document.nodes[idx].height = max(newFrame.height, 0.001)
        document.nodes[idx].rotation = newRotation
        document.nodes[idx].shear = min(max(newShear, -80), 80)
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        document.nodes[idx].x = oldFrame.origin.x
        document.nodes[idx].y = oldFrame.origin.y
        document.nodes[idx].width = max(oldFrame.width, 0.001)
        document.nodes[idx].height = max(oldFrame.height, 0.001)
        document.nodes[idx].rotation = oldRotation
        document.nodes[idx].shear = min(max(oldShear, -80), 80)
        return true
    }
}

public enum NodeStylePropertyChange: Sendable, Equatable {
    case fill(old: String, new: String)
    case stroke(old: String, new: String)
    case strokeWidth(old: CGFloat, new: CGFloat)
    case opacity(old: CGFloat, new: CGFloat)
    case blendMode(old: String, new: String)
    case visible(old: Bool, new: Bool)
    case locked(old: Bool, new: Bool)
}

public final class StyleChangeCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "ColourPickerGlass"
    public let nodeId: String
    public let change: NodeStylePropertyChange

    public init(nodeId: String, change: NodeStylePropertyChange, name: String = "修改样式") {
        self.nodeId = nodeId
        self.change = change
        self.name = name
    }

    public func execute(document: inout VOODocument) -> Bool {
        apply(forward: true, document: &document)
    }

    public func undo(document: inout VOODocument) -> Bool {
        apply(forward: false, document: &document)
    }

    private func apply(forward: Bool, document: inout VOODocument) -> Bool {
        guard let idx = document.nodes.firstIndex(where: { $0.id == nodeId }) else { return false }
        switch change {
        case .fill(let old, let new):
            document.nodes[idx].style.fill = forward ? new : old
        case .stroke(let old, let new):
            document.nodes[idx].style.stroke = forward ? new : old
        case .strokeWidth(let old, let new):
            document.nodes[idx].style.strokeWidth = forward ? new : old
        case .opacity(let old, let new):
            document.nodes[idx].style.opacity = forward ? new : old
        case .blendMode(let old, let new):
            document.nodes[idx].style.blendMode = forward ? new : old
        case .visible(let old, let new):
            document.nodes[idx].style.visible = forward ? new : old
        case .locked(let old, let new):
            document.nodes[idx].style.locked = forward ? new : old
        }
        return true
    }
}

public final class BooleanCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "BooleanAddIcon"
    public let op: BooleanOperationType
    public let inputNodes: [(node: VOONode, index: Int)]
    public let resultNodes: [VOONode]
    public let previousSelectedIds: Set<String>

    public init(
        op: BooleanOperationType,
        inputNodes: [(node: VOONode, index: Int)],
        resultNodes: [VOONode],
        previousSelectedIds: Set<String>,
        name: String? = nil
    ) {
        self.op = op
        self.inputNodes = inputNodes
        self.resultNodes = resultNodes
        self.previousSelectedIds = previousSelectedIds

        let opName: String
        switch op {
        case .add, .union: opName = "并集 (Add)"
        case .subtract: opName = "减去 (Subtract)"
        case .intersect: opName = "相交 (Intersect)"
        case .xor, .exclude: opName = "异或 (Xor)"
        case .divide: opName = "分割 (Divide)"
        }
        self.name = name ?? "矢量布尔: \(opName)"
    }

    /// Convenience initializer extracting operands directly from document and executing BooleanTopologyEngine.
    public convenience init?(
        op: BooleanOperationType,
        document: VOODocument,
        operandIds: [String],
        name: String? = nil
    ) {
        guard operandIds.count >= 2 else { return nil }
        var inputs: [(node: VOONode, index: Int)] = []
        for (idx, node) in document.nodes.enumerated() {
            if operandIds.contains(node.id) {
                inputs.append((node, idx))
            }
        }
        guard inputs.count >= 2 else { return nil }

        let subject = inputs[0].node
        let clip = inputs[1].node
        let results = BooleanTopologyEngine.performBoolean(op: op, subject: subject, clip: clip)

        self.init(
            op: op,
            inputNodes: inputs,
            resultNodes: results,
            previousSelectedIds: document.selectedNodeIds,
            name: name
        )
    }

    public func execute(document: inout VOODocument) -> Bool {
        let inputIds = Set(inputNodes.map { $0.node.id })
        document.nodes.removeAll { inputIds.contains($0.id) }

        let insertIndex = inputNodes.map { $0.index }.min() ?? document.nodes.count
        let safeIndex = min(insertIndex, document.nodes.count)

        for (i, res) in resultNodes.enumerated() {
            document.nodes.insert(res, at: safeIndex + i)
        }
        document.selectedNodeIds = Set(resultNodes.map { $0.id })
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        let resultIds = Set(resultNodes.map { $0.id })
        document.nodes.removeAll { resultIds.contains($0.id) }

        let sortedInputs = inputNodes.sorted { $0.index < $1.index }
        for item in sortedInputs {
            let safeIndex = min(item.index, document.nodes.count)
            document.nodes.insert(item.node, at: safeIndex)
        }
        document.selectedNodeIds = previousSelectedIds
        return true
    }
}

public final class ReorderLayerCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "arrange"
    public let nodeId: String
    public let fromIndex: Int
    public let toIndex: Int

    public init(nodeId: String, fromIndex: Int, toIndex: Int, name: String = "调整图层顺序") {
        self.name = name
        self.nodeId = nodeId
        self.fromIndex = fromIndex
        self.toIndex = toIndex
    }

    public func execute(document: inout VOODocument) -> Bool {
        reorder(from: fromIndex, to: toIndex, document: &document)
    }

    public func undo(document: inout VOODocument) -> Bool {
        reorder(from: toIndex, to: fromIndex, document: &document)
    }

    private func reorder(from: Int, to: Int, document: inout VOODocument) -> Bool {
        guard from >= 0, from < document.nodes.count else { return false }
        let element = document.nodes.remove(at: from)
        let safeTo = max(0, min(to, document.nodes.count))
        document.nodes.insert(element, at: safeTo)
        return true
    }
}

public final class CompoundCommand: StudioCommand, @unchecked Sendable {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
    public let iconName: String = "square.stack.3d.up"
    public let commands: [StudioCommand]

    public init(name: String, commands: [StudioCommand]) {
        self.name = name
        self.commands = commands
    }

    public func execute(document: inout VOODocument) -> Bool {
        var executedCount = 0
        for cmd in commands {
            if cmd.execute(document: &document) {
                executedCount += 1
            } else {
                for rollbackCmd in commands.prefix(executedCount).reversed() {
                    _ = rollbackCmd.undo(document: &document)
                }
                return false
            }
        }
        return true
    }

    public func undo(document: inout VOODocument) -> Bool {
        for cmd in commands.reversed() {
            guard cmd.undo(document: &document) else { return false }
        }
        return true
    }
}

// MARK: - History UI Timeline Model

public struct HistoryItem: Equatable, Sendable, Identifiable {
    public let id: UUID
    public let index: Int
    public let name: String
    public let timestamp: Date
    public let iconName: String
    public let isActive: Bool
    public let isCurrentHead: Bool

    public init(
        id: UUID = UUID(),
        index: Int,
        name: String,
        timestamp: Date,
        iconName: String,
        isActive: Bool,
        isCurrentHead: Bool
    ) {
        self.id = id
        self.index = index
        self.name = name
        self.timestamp = timestamp
        self.iconName = iconName
        self.isActive = isActive
        self.isCurrentHead = isCurrentHead
    }
}

// MARK: - Transactional Command Manager Controller

@MainActor
public final class CommandManager: @unchecked Sendable {
    public static let shared = CommandManager()

    private var _undoStack: [StudioCommand] = []
    private var _redoStack: [StudioCommand] = []
    private var _maxStackDepth: Int = 1000

    nonisolated public var undoStack: [StudioCommand] {
        get { MainActor.assumeIsolated { _undoStack } }
        set { MainActor.assumeIsolated { _undoStack = newValue } }
    }
    nonisolated public var redoStack: [StudioCommand] {
        get { MainActor.assumeIsolated { _redoStack } }
        set { MainActor.assumeIsolated { _redoStack = newValue } }
    }
    nonisolated public var maxStackDepth: Int {
        get { MainActor.assumeIsolated { _maxStackDepth } }
        set {
            MainActor.assumeIsolated {
                _maxStackDepth = newValue
                while _undoStack.count > _maxStackDepth {
                    _undoStack.removeFirst()
                }
            }
        }
    }
    nonisolated public var maxHistory: Int {
        get { maxStackDepth }
        set { maxStackDepth = newValue }
    }

    private var isBatching: Bool = false
    public var onHistoryChanged: (() -> Void)?

    nonisolated public var canUndo: Bool {
        MainActor.assumeIsolated { !_undoStack.isEmpty }
    }
    nonisolated public var canRedo: Bool {
        MainActor.assumeIsolated { !_redoStack.isEmpty }
    }
    nonisolated public var undoCount: Int {
        MainActor.assumeIsolated { _undoStack.count }
    }
    nonisolated public var redoCount: Int {
        MainActor.assumeIsolated { _redoStack.count }
    }
    nonisolated public var currentHeadIndex: Int {
        MainActor.assumeIsolated { _undoStack.count }
    }
    nonisolated public var lastExecutedCommand: StudioCommand? {
        MainActor.assumeIsolated { _undoStack.last }
    }
    nonisolated public var nextRedoCommand: StudioCommand? {
        MainActor.assumeIsolated { _redoStack.last }
    }

    nonisolated public init(maxStackDepth: Int = 1000) {
        self._maxStackDepth = maxStackDepth
    }

    nonisolated public func reset() {
        MainActor.assumeIsolated {
            _undoStack.removeAll()
            _redoStack.removeAll()
            isBatching = false
            onHistoryChanged?()
        }
    }

    nonisolated public func clear() {
        reset()
    }

    @discardableResult
    nonisolated public func execute(_ command: StudioCommand, on document: inout VOODocument) -> Bool {
        MainActor.assumeIsolated {
            let success = command.execute(document: &document)
            if success {
                _undoStack.append(command)
                if _undoStack.count > _maxStackDepth {
                    _undoStack.removeFirst()
                }
                _redoStack.removeAll() // Branch invalidation invariant
                if !isBatching {
                    onHistoryChanged?()
                }
            }
            return success
        }
    }

    @discardableResult
    nonisolated public func undo(on document: inout VOODocument) -> Bool {
        MainActor.assumeIsolated {
            guard let command = _undoStack.popLast() else { return false }
            let success = command.undo(document: &document)
            if success {
                _redoStack.append(command)
                if !isBatching {
                    onHistoryChanged?()
                }
            } else {
                _undoStack.append(command) // Restore on failure
            }
            return success
        }
    }

    @discardableResult
    nonisolated public func redo(on document: inout VOODocument) -> Bool {
        MainActor.assumeIsolated {
            guard let command = _redoStack.popLast() else { return false }
            let success = command.execute(document: &document)
            if success {
                _undoStack.append(command)
                if !isBatching {
                    onHistoryChanged?()
                }
            } else {
                _redoStack.append(command) // Restore on failure
            }
            return success
        }
    }

    @discardableResult
    nonisolated public func rollback(toIndex targetIndex: Int, on document: inout VOODocument) -> Bool {
        MainActor.assumeIsolated {
            let current = _undoStack.count
            let total = _undoStack.count + _redoStack.count
            guard targetIndex >= 0 && targetIndex <= total else {
                return false
            }
            if targetIndex == current {
                return true
            }

            isBatching = true
            defer {
                isBatching = false
                onHistoryChanged?()
            }

            if targetIndex < current {
                let steps = current - targetIndex
                for _ in 0..<steps {
                    if !undo(on: &document) {
                        return false
                    }
                }
            } else {
                let steps = targetIndex - current
                for _ in 0..<steps {
                    if !redo(on: &document) {
                        return false
                    }
                }
            }
            return true
        }
    }

    /// Tuple array of history items strictly conforming to PROJECT.md line 102
    nonisolated public func getHistoryItems() -> [(id: UUID, name: String, timestamp: Date)] {
        MainActor.assumeIsolated {
            _undoStack.map { ($0.id, $0.name, $0.timestamp) }
        }
    }

    /// Rich UI timeline items for Inspector Studio History Tab
    nonisolated public func getHistoryTimeline() -> [HistoryItem] {
        MainActor.assumeIsolated {
            var items: [HistoryItem] = []
            let u = _undoStack.count

            items.append(HistoryItem(
                index: 0,
                name: "创建文档",
                timestamp: _undoStack.first?.timestamp ?? Date(),
                iconName: "LayersTabAddIcon",
                isActive: true,
                isCurrentHead: (u == 0)
            ))

            for (i, cmd) in _undoStack.enumerated() {
                let idx = i + 1
                items.append(HistoryItem(
                    id: cmd.id,
                    index: idx,
                    name: cmd.name,
                    timestamp: cmd.timestamp,
                    iconName: cmd.iconName,
                    isActive: true,
                    isCurrentHead: (idx == u)
                ))
            }

            for (i, cmd) in _redoStack.reversed().enumerated() {
                let idx = u + 1 + i
                items.append(HistoryItem(
                    id: cmd.id,
                    index: idx,
                    name: cmd.name,
                    timestamp: cmd.timestamp,
                    iconName: cmd.iconName,
                    isActive: false,
                    isCurrentHead: false
                ))
            }

            return items
        }
    }
}
