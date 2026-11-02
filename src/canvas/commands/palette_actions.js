import { TOOL } from "../editor/tool_ids.js";
import { BOOLEAN_OPERATIONS } from "../editor/scene_model.js";

/** Only existing, directly runnable editor actions belong in this list. */
export function buildExtendedPaletteActions({
  engine,
  onTool,
  onCreateComponent,
  onToggleGrid,
  onOpenAgent,
  setLocale,
}) {
  // Pan is a held Space gesture; there is no persistent Hand tool.
  const tools = [
    "SELECT", "RECT", "ELLIPSE", "LINE", "POLYGON", "STAR", "ARROW",
    "PEN", "FREE_PEN", "TEXT", "CROP", "BRUSH", "ERASER", "MARQUEE",
    "LASSO", "WAND", "DROPPER", "FILL", "GRADIENT",
  ];
  return [
    ...tools.map((name) => {
      const tool = TOOL[name];
      const labelKey = `editor.tool.${tool === TOOL.FREE_PEN ? "freePen" : tool}`;
      return {
        id: `tool-${tool}`,
        labelKey,
        catalogKey: labelKey,
        keywords: ["tool", tool],
        run: () => onTool(tool),
      };
    }),
    { id: "flip-horizontal", labelKey: "editor.taskbar.flipH", run: () => engine?.flipHorizontal?.() },
    { id: "flip-vertical", labelKey: "editor.taskbar.flipV", run: () => engine?.flipVertical?.() },
    ...BOOLEAN_OPERATIONS.map((op) => ({
      id: `boolean-${op}`,
      labelKey: `editor.props.combine.${op}`,
      keywords: ["boolean", op],
      run: () => {
        if (engine?.canCombineSelection?.()) engine.combineSelected(op);
      },
    })),
    { id: "create-component", labelKey: "editor.component.create", run: onCreateComponent },
    { id: "toggle-grid", labelKey: "commandPalette.toggleGrid", run: onToggleGrid },
    { id: "open-agent", labelKey: "agent.panel.open", run: onOpenAgent },
    { id: "language-en", labelKey: "commandPalette.languageEnglish", keywords: ["language", "locale", "English"], run: () => setLocale("en") },
    { id: "language-zh", labelKey: "commandPalette.languageChinese", keywords: ["language", "locale", "中文"], run: () => setLocale("zh") },
  ];
}
