import AppKit

extension WindowController {
    public func inspectorTextBoxInteractionChanged(active: Bool) {
        nativeTextBoxEditing = active
        if active {
            nativeTextBoxEditCommand = nil
            nativeTextBoxPreviousRedo = commandManager.redoStack
        } else {
            if let command = nativeTextBoxEditCommand, command.isNoOp,
                commandManager.lastExecutedCommand?.id == command.id
            {
                precondition(command.undo(document: &mainContentView.canvasStageView.document))
                commandManager.undoStack.removeLast()
                commandManager.redoStack = nativeTextBoxPreviousRedo ?? []
                commandManager.onHistoryChanged?()
                refreshAfterDocumentMutation()
            }
            nativeTextBoxEditCommand = nil
            nativeTextBoxPreviousRedo = nil
        }
    }

    public func inspectorDidChangeTextDecoration(
        id: String, italic: Bool?, underline: Bool?, boxWidth: CGFloat?
    ) {
        do {
            _ = try applyTextLayout(
                id: id, italic: italic, underline: underline, boxWidth: boxWidth)
        } catch {
            refreshAfterDocumentMutation()
            showChromeToast(NativeCopy.text(.invalidTextWidth))
        }
    }

    /// UI, shortcuts and Agent tools can share this validated, undoable text operation.
    @discardableResult
    func applyTextLayout(
        id: String, italic: Bool? = nil, underline: Bool? = nil, boxWidth: CGFloat? = nil
    ) throws -> Bool {
        let stage = mainContentView.canvasStageView
        guard let old = stage.document.nodes.first(where: { $0.id == id }), old.kind == .text else {
            throw NativeTextBoxLayout.Failure.missingTextNode
        }
        var next = old
        if let italic { next.italic = italic }
        if let underline { next.underline = underline }
        if let boxWidth {
            next = try NativeTextBoxLayout.settingWidth(boxWidth, on: next)
        } else {
            NativeTextBoxLayout.resizeToContent(&next)
        }
        guard old != next else { return false }
        let candidate = NativeTextBoxWidthCommand(oldNode: old, newNode: next)
        guard !candidate.isNoOp else { return false }
        if let command = nativeTextBoxEditCommand, command.oldNode.id == id,
            commandManager.lastExecutedCommand?.id == command.id
        {
            command.newNode = next
            guard command.execute(document: &stage.document) else {
                throw NativeTextBoxLayout.Failure.missingTextNode
            }
        } else {
            let command = candidate
            guard commandManager.execute(command, on: &stage.document) else {
                throw NativeTextBoxLayout.Failure.missingTextNode
            }
            if nativeTextBoxEditing { nativeTextBoxEditCommand = command }
        }
        refreshAfterDocumentMutation()
        return true
    }
}
