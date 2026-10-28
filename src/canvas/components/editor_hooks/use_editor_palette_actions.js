import { useCallback, useMemo, useState } from "react";
import { buildExtendedPaletteActions } from "../../commands/palette_actions.js";
import { executeEditorCommand } from "../../editor/command_table.js";
import { setLocale } from "../../../shared/i18n.js";

/** Bind palette commands to this render's focused engine and view actions. */
export function useEditorPaletteActions({
  engine, runTool, handleCreateComponent, toggleGrid, presentationHistory, multi,
  zoomSharedStep, zoomSharedHundred, fitAll, toggleRulers, toggleGuides,
  handleClearGuides, toggleSnapToGrid, toggleCommentsPanel, toggleCommentMode,
  openFindReplace, setExportOpen, setShortcutsOpen,
}) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const toggleCommandPalette = useCallback(() => setCommandPaletteOpen((previous) => !previous), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  /**
   * Non-command-table actions the palette exposes: view toggles, zoom, panel
   * openers. Handlers are closures over the live editor state, so a palette row
   * always acts on the page the user is looking at.
   */
  const paletteActions = useMemo(
    () => [
      ...buildExtendedPaletteActions({
        engine,
        onTool: runTool,
        onCreateComponent: handleCreateComponent,
        onToggleGrid: toggleGrid,
        onOpenAgent: () =>
          window.dispatchEvent(new CustomEvent("voo:open-agent-panel")),
        setLocale,
      }),
      {
        id: "undo",
        labelKey: "editor.undo",
        label: "Undo",
        catalogKey: "editor.undo",
        run: () => void presentationHistory.undo(),
      },
      {
        id: "redo",
        labelKey: "editor.redo",
        label: "Redo",
        catalogKey: "editor.redo",
        run: () => void presentationHistory.redo(),
      },
      {
        id: "zoom-in",
        labelKey: "editor.zoomIn",
        label: "Zoom in",
        run: () => (multi ? zoomSharedStep(1) : engine?.zoomStep?.(1)),
      },
      {
        id: "zoom-out",
        labelKey: "editor.zoomOut",
        label: "Zoom out",
        run: () => (multi ? zoomSharedStep(-1) : engine?.zoomStep?.(-1)),
      },
      {
        id: "zoom-fit",
        labelKey: "editor.zoomFit",
        label: "Zoom to fit",
        run: () => (multi ? fitAll() : engine?.zoomToFit?.()),
      },
      {
        id: "zoom-100",
        labelKey: "editor.shortcut.zoom100",
        label: "Zoom to 100%",
        run: () =>
          multi ? zoomSharedHundred() : engine?.zoomToHundred?.(),
      },
      {
        id: "toggle-rulers",
        labelKey: "editor.rulers.toggle",
        label: "Show/hide rulers",
        catalogKey: "editor.rulers.toggle",
        run: toggleRulers,
      },
      {
        id: "toggle-guides",
        labelKey: "editor.guides.toggle",
        label: "Show/hide guides",
        catalogKey: "editor.guides.toggle",
        run: toggleGuides,
      },
      {
        id: "clear-guides",
        labelKey: "editor.guides.clearAll",
        label: "Clear all guides",
        run: handleClearGuides,
      },
      {
        id: "snap-to-grid",
        labelKey: "editor.snapping.toGrid",
        label: "Snap to grid",
        catalogKey: "editor.snapping.toGrid",
        run: toggleSnapToGrid,
      },
      {
        id: "toggle-comments",
        labelKey: "editor.comments.toggle",
        label: "Show/hide comments",
        catalogKey: "editor.comments.toggle",
        run: toggleCommentsPanel,
      },
      {
        id: "comment-mode",
        labelKey: "editor.comments.toggleAddMode",
        label: "Comment mode",
        run: toggleCommentMode,
      },
      {
        id: "find-replace",
        labelKey: "findReplace.title",
        label: "Find and replace",
        catalogKey: "findReplace.title",
        run: openFindReplace,
      },
      {
        id: "export",
        labelKey: "editor.exportTitle",
        label: "Export",
        run: () => setExportOpen(true),
      },
      {
        id: "shortcuts",
        labelKey: "editor.shortcuts.title",
        label: "Keyboard shortcuts",
        run: () => setShortcutsOpen(true),
      },
    ],
    [
      runTool,
      handleCreateComponent,
      toggleGrid,
      presentationHistory,
      multi,
      zoomSharedStep,
      zoomSharedHundred,
      engine,
      fitAll,
      toggleRulers,
      toggleGuides,
      handleClearGuides,
      toggleSnapToGrid,
      toggleCommentsPanel,
      toggleCommentMode,
      openFindReplace,
      setExportOpen,
      setShortcutsOpen,
    ],
  );

  /**
   * Runs a palette row. Commands come from the editor's own command table, so
   * palette execution and agent execution share one implementation; actions
   * carry their handler from `paletteActions`.
   */
  const runPaletteCommand = useCallback(
    (command) => {
      setCommandPaletteOpen(false);
      if (!command) return;
      if (command.kind === "action") {
        command.run?.();
        return;
      }
      void executeEditorCommand(command.sourceId, engine).catch((error) => {
        if (error?.code === "NO_SELECTION" || error?.code === "EDITOR_NOT_OPEN") {
          return;
        }
        console.error(`command palette: ${command.sourceId} failed`, error);
      });
    },
    [engine],
  );

  return { commandPaletteOpen, toggleCommandPalette, closeCommandPalette, paletteActions, runPaletteCommand };
}
