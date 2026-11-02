import AppKit
import Foundation

extension WindowController {
    func initializeNewDocument() {
        // Web `newVooProject` → `promoteFixedPageToFrame("Frame")`: a 1200x800 frame
        // named "Frame" whose background child carries the page colour.
        var doc = VOODocument()
        doc.title = "Design 1"
        doc.canvas = CanvasFrame(x: 0, y: 0, width: 1200, height: 800, backgroundColor: "#171717")
        let artboard = VOONode(
            id: "design_1",
            kind: .frame,
            name: "Frame",
            x: 0,
            y: 0,
            width: 1200,
            height: 800,
            // Web `promoteFixedPageToFrame`: frame stroke stays null and the outline
            // seen on screen is the 1px selection border drawn by the stage.
            style: LayerStyle(fill: "#171717", stroke: "none", strokeWidth: 1.0)
        )
        // The web layer list also shows a "Background" child carrying the page colour;
        // the frame fill already paints that surface, so no extra node is inserted
        // (a child would paint over the frame and change the artboard colour).
        doc.nodes = [artboard]
        mainContentView.canvasStageView.document = doc
        mainContentView.canvasStageView.clearSelection()
        commandManager.clear()
        currentFileURL = nil
        savedDocumentSnapshot = doc
        mainContentView.titleBar.setDocumentTitle("Design 1")
        mainContentView.inspector.layersPanel.searchQuery = ""
        mainContentView.inspector.layersPanel.configure(with: doc.nodes, selectedId: nil)
        mainContentView.inspector.setPropertiesVisible(false)
        mainContentView.canvasStageView.setPaintNode(id: nil, dataURL: nil)
        // Match the web "Design 1" empty document: 1200x800 artboard at 58%.
        let stage = mainContentView.canvasStageView
        let targetZoom: CGFloat = 0.58
        stage.zoom = targetZoom
        let availW = max(0, stage.bounds.width - 80)
        let availH = max(0, stage.bounds.height - 80)
        stage.panOffset = CGPoint(
            x: (availW - doc.canvas.width * targetZoom) / 2.0 + 40.0,
            y: (availH - doc.canvas.height * targetZoom) / 2.0 + 40.0
        )
        syncChromeState()
        DispatchQueue.main.async { [weak self] in self?.focusCanvas() }
    }

}
