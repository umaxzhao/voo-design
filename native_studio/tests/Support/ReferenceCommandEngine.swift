import Foundation
import CoreGraphics

public protocol StudioCommand: AnyObject {
    var id: UUID { get }
    var name: String { get }
    var timestamp: Date { get }
    func execute(document: inout VOODocument) -> Bool
    func undo(document: inout VOODocument) -> Bool
}

public final class InsertNodeCommand: StudioCommand {
    public let id: UUID = UUID()
    public let name: String = "Insert Node"
    public let timestamp: Date = Date()
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

public final class DeleteNodeCommand: StudioCommand {
    public let id: UUID = UUID()
    public let name: String = "Delete Node"
    public let timestamp: Date = Date()
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
        if idx <= document.nodes.count {
            document.nodes.insert(node, at: idx)
        } else {
            document.nodes.append(node)
        }
        return true
    }
}

public final class TransformNodeCommand: StudioCommand {
    public let id: UUID = UUID()
    public let name: String = "Transform Node"
    public let timestamp: Date = Date()
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

public final class UpdateStyleCommand: StudioCommand {
    public let id: UUID = UUID()
    public let name: String = "Update Style"
    public let timestamp: Date = Date()
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

public final class BooleanMutationCommand: StudioCommand {
    public let id: UUID = UUID()
    public let name: String
    public let timestamp: Date = Date()
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

        // Remove subjects in reverse index order
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

public final class CommandManager {
    public private(set) var undoStack: [StudioCommand] = []
    public private(set) var redoStack: [StudioCommand] = []
    public let maxStackDepth: Int

    public init(maxStackDepth: Int = 1000) {
        self.maxStackDepth = maxStackDepth
    }

    public var canUndo: Bool {
        return !undoStack.isEmpty
    }

    public var canRedo: Bool {
        return !redoStack.isEmpty
    }

    public func execute(_ command: StudioCommand, on document: inout VOODocument) -> Bool {
        let success = command.execute(document: &document)
        if success {
            undoStack.append(command)
            if undoStack.count > maxStackDepth {
                undoStack.removeFirst()
            }
            redoStack.removeAll()
        }
        return success
    }

    public func undo(on document: inout VOODocument) -> Bool {
        guard let command = undoStack.popLast() else { return false }
        let success = command.undo(document: &document)
        if success {
            redoStack.append(command)
        } else {
            // Put it back if undo failed
            undoStack.append(command)
        }
        return success
    }

    public func redo(on document: inout VOODocument) -> Bool {
        guard let command = redoStack.popLast() else { return false }
        let success = command.execute(document: &document)
        if success {
            undoStack.append(command)
        } else {
            redoStack.append(command)
        }
        return success
    }

    public func getHistoryItems() -> [(id: UUID, name: String, timestamp: Date)] {
        return undoStack.map { ($0.id, $0.name, $0.timestamp) }
    }

    public func rollback(toIndex index: Int, on document: inout VOODocument) -> Bool {
        guard index >= 0 && index <= undoStack.count else { return false }
        let stepsToUndo = undoStack.count - index
        for _ in 0..<stepsToUndo {
            if !undo(on: &document) {
                return false
            }
        }
        return true
    }

    public func clear() {
        undoStack.removeAll()
        redoStack.removeAll()
    }
}
