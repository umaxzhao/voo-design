import AppKit
import Foundation
import UniformTypeIdentifiers

extension WindowController {
    public var hasUnsavedChanges: Bool {
        guard let savedDocumentSnapshot else { return commandManager.canUndo }
        var current = mainContentView.canvasStageView.document
        var saved = savedDocumentSnapshot
        // Selection and camera chrome are not document edits.
        current.selectedNodeIds = []
        saved.selectedNodeIds = []
        return current != saved
    }

    @discardableResult
    public func requestNewDocument() -> Bool {
        guard confirmDocumentReplacement() else { return false }
        initializeNewDocument()
        return true
    }

    public func confirmDocumentReplacement() -> Bool {
        guard hasUnsavedChanges else { return true }
        if let documentReplacementDecision { return documentReplacementDecision() }
        // A background/non-presented editor cannot ask a user to discard work.
        guard studioWindow.isVisible else { return false }
        let alert = NSAlert()
        alert.messageText = NativeCopy.text(.unsavedTitle)
        alert.informativeText = NativeCopy.text(.unsavedBody)
        alert.addButton(withTitle: NativeCopy.text(.save))
        alert.addButton(withTitle: NativeCopy.text(.cancel))
        alert.addButton(withTitle: NativeCopy.text(.discard))
        switch alert.runModal() {
        case .alertFirstButtonReturn: return saveBeforeReplacement()
        case .alertThirdButtonReturn: return true
        default: return false
        }
    }

    private func saveBeforeReplacement() -> Bool {
        var destination = currentFileURL
        if destination == nil {
            let panel = NSSavePanel()
            panel.allowedContentTypes = [UTType(filenameExtension: "voo") ?? .data]
            panel.nameFieldStringValue = mainContentView.canvasStageView.document.title + ".voo"
            guard panel.runModal() == .OK else { return false }
            destination = panel.url
        }
        guard let destination else { return false }
        do {
            try DocumentIO.shared.saveDocument(
                mainContentView.canvasStageView.document, to: destination)
            currentFileURL = destination
            savedDocumentSnapshot = mainContentView.canvasStageView.document
            return true
        } catch {
            NSAlert(error: error).runModal()
            return false
        }
    }

    public func submitWelcomePrompt(_ prompt: String) {
        guard !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            requestNewDocument()
        else { return }
        mainContentView.isWelcomeOpen = false
        setAgentPanelOpen(true)
        dispatchAgentPrompt(prompt)
    }

    public func dispatchAgentPrompt(_ prompt: String) {
        if let agentRequestDispatcher {
            agentRequestDispatcher(prompt)
        } else {
            runNativeAgentPrompt(prompt)
        }
    }
}

extension WindowController: NSWindowDelegate {
    public func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard confirmDocumentReplacement() else { return false }
        // Closing has explicitly been approved; app termination must not prompt twice.
        savedDocumentSnapshot = mainContentView.canvasStageView.document
        return true
    }
}
