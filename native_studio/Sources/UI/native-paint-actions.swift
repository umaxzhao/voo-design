import AppKit

extension WindowController {
    public func inspectorPaintInteractionChanged(active: Bool) {
        if active {
            nativePaintEditIds = mainContentView.canvasStageView.selectedNodeIds
            nativePaintEditCommand = nil
            nativePaintPreviousRedo = commandManager.redoStack
        } else {
            if let command = nativePaintEditCommand, command.isPaintNoOp,
                commandManager.lastExecutedCommand?.id == command.id
            {
                let stage = mainContentView.canvasStageView
                precondition(
                    command.undo(document: &stage.document), "Paint interaction lost its target")
                commandManager.undoStack.removeLast()
                commandManager.redoStack = nativePaintPreviousRedo ?? []
                commandManager.onHistoryChanged?()
                refreshAfterDocumentMutation()
            }
            nativePaintPreviousRedo = nil
            nativePaintEditIds = nil
            nativePaintEditCommand = nil
        }
    }

    public func inspectorDidMutatePaint(id: String, mutation: NativePaintMutation) {
        let selected = mainContentView.canvasStageView.selectedNodeIds
        let ids = selected.contains(id) ? selected : [id]
        do { _ = try applyPaintChange(ids: ids, mutation: mutation) } catch {
            refreshAfterDocumentMutation()
            showChromeToast(NativeCopy.text(.paintEditFailed) + error.localizedDescription)
        }
    }

    /// Common paint operation with atomic selection updates and undo.
    @discardableResult
    public func applyPaintChange(ids: Set<String>, mutation: NativePaintMutation) throws -> Bool {
        let stage = mainContentView.canvasStageView
        if let expected = nativePaintEditIds, expected != ids {
            throw NativePaintError.invalidStack
        }
        let old = stage.document.nodes.filter { ids.contains($0.id) }
        guard old.count == ids.count, !old.isEmpty else { throw NativePaintError.invalidIndex }
        let updated = try old.map { node in
            var edited = node
            try edited.applyPaintMutation(mutation)
            return edited
        }
        guard old != updated else { return false }
        if let command = nativePaintEditCommand,
            commandManager.lastExecutedCommand?.id == command.id
        {
            command.newNodes = updated
            guard command.execute(document: &stage.document) else {
                throw NativePaintError.invalidIndex
            }
        } else {
            let command = NativePaintCommand(oldNodes: old, newNodes: updated)
            guard commandManager.execute(command, on: &stage.document) else {
                throw NativePaintError.invalidIndex
            }
            if nativePaintEditIds != nil { nativePaintEditCommand = command }
        }
        refreshAfterDocumentMutation()
        return true
    }

    public func inspectorDidChangeEffects(id: String, effects: LayerEffects) {
        let stage = mainContentView.canvasStageView
        guard let node = stage.document.nodes.first(where: { $0.id == id }), node.effects != effects
        else { return }
        // An unsupported effect-list schema cannot be replaced by native controls.
        guard node.portableProperties["effects"] == nil || node.effects != nil else {
            refreshAfterDocumentMutation()
            showChromeToast(NativeCopy.text(.unsupportedEffects))
            return
        }
        let old = node.effects
        let command = BasicCommand(
            name: NativeCopy.text(.editEffects),
            execute: { document in
                guard let index = document.nodes.firstIndex(where: { $0.id == id }) else {
                    return false
                }
                document.nodes[index].effects = effects
                return true
            },
            undo: { document in
                guard let index = document.nodes.firstIndex(where: { $0.id == id }) else {
                    return false
                }
                document.nodes[index].effects = old
                return true
            })
        _ = commandManager.execute(command, on: &stage.document)
        refreshAfterDocumentMutation()
    }
}
