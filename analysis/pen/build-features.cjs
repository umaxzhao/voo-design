#!/usr/bin/env node
/**
 * Builds analysis/pen/features.jsonl (Pen.app 1.2.15 feature inventory).
 * Every row carries bundle-relative evidence (path from /tmp/apps/pen) + locator + command.
 * Commands: see analysis/pen/rea/COMMANDS.md for the full definitions of CMD_RENDERER,
 * CMD_MAIN, CMD_STRINGS; grep rows reference strings-index.txt produced by CMD_STRINGS.
 */
const fs = require("fs");
const path = require("path");

const CMD_RENDERER =
  "rea analyze-javascript-application /tmp/apps/pen --artifact-format directory --source-path out/editor/assets/index.js --format json > analysis/pen/rea/analyze-index-renderer.json";
const CMD_MAIN =
  "rea analyze-javascript-application /tmp/apps/pen --artifact-format directory --source-path out/main.js --source-path out/app.js --source-path out/menu.js --source-path out/config.js --source-path out/skills-manager.js --source-path out/desktop-mcp-adapter.js --source-path out/save-document-as.js --source-path out/load-document.js --source-path out/file-io.js --source-path out/constants.js --format json > analysis/pen/rea/analyze-main-process.json";
const CMD_STRINGS =
  "node analysis/pen/rea/extract-strings.cjs /tmp/apps/pen/out/editor/assets/index.js analysis/pen/rea/strings-index.txt";

const IDX = "out/editor/assets/index.js";
const MENU = "out/menu.js";
const APP = "out/app.js";
const SKILL = "out/skills/pen-dev/";

function strev(locator, file = IDX, strength = "static") {
  return {
    source: "pen",
    strength,
    file,
    locator,
    command:
      `${CMD_STRINGS} && grep -n -F '${locator.replace(/^string:/, "")}' analysis/pen/rea/strings-index.txt`,
  };
}
function strctx(locator, file = IDX) {
  // locator is the literal used to find surrounding compiled code in the bundle
  return {
    source: "pen",
    strength: "static",
    file,
    locator,
    command: `grep -o '.\\{60\\}${locator.replace(/^code:/, "")}.\\{80\\}' ${file} | head -2`,
  };
}
function mainev(file, locator, cmd = CMD_MAIN) {
  return { source: "pen", strength: "static", file, locator, command: cmd };
}
function doc(file, locator, cmd) {
  return {
    source: "pen",
    strength: "static",
    file,
    locator,
    command: cmd || `sed -n '1,260p' ${file}`,
  };
}
function rend(locator) {
  return { source: "pen", strength: "static", file: IDX, locator, command: CMD_RENDERER };
}

/** row: [area, id, name, description, priority, evidence[], notes] */
const rows = [];
function add(area, id, name, description, priority, evidence, notes = "") {
  rows.push({ area, id, name, description, priority, evidence, notes });
}

/* ---------------- file / document ---------------- */
add("file", "file.new_file", "New File", "Creates a new .pen document (Cmd+Shift+N) and opens it in a new editor window.", "P1",
  [mainev(MENU, "label:New File / accelerator CmdOrCtrl+Shift+N")], "Dashboard is Cmd+N; both handled through the focused device IPC.");
add("file", "file.open", "Open document", "Native Open dialog (Cmd+O) for .pen files.", "P0",
  [mainev(MENU, "label:Open… / accelerator CmdOrCtrl+O")]);
add("file", "file.open_recent", "Open Recent", "Recent-files submenu (max 14 entries) with per-file reopen and 'Clear Recent Files'.", "P1",
  [mainev(MENU, "MAX_RECENT_MENU_FILES = 14; label:Open Recent")]);
add("file", "file.save", "Save", "Saves the current document in place (Cmd+S) through the focused resource's saveResource().", "P0",
  [mainev(MENU, "label:Save / device.saveResource()")]);
add("file", "file.save_as", "Save As", "Save-under-new-name flow (Cmd+Shift+S) with document serialization, asset handling and path validation.", "P0",
  [mainev(MENU, "label:Save As… / saveResource({saveAs:true})"),
   mainev("out/save-document-as.js", "symbol:saveDocumentAs")], "saveDocumentAs collects referenced assets before writing.");
add("file", "file.dashboard", "Document dashboard", "Multi-window document dashboard (Cmd+N) listing recent/bundled documents with previews.", "P1",
  [mainev(MENU, "label:Dashboard / accelerator CmdOrCtrl+N"),
   mainev("out/dashboard-documents.js", "symbol:dashboard-documents")]);
add("file", "file.autosave", "Autosave + save-failure reporting", "The editor autosaves the document and reports autosave failures back to the shell ('auto-save-failed').", "P1",
  [mainev(APP, "ipc channel:auto-save-failed")]);
add("file", "file.local_storage", "Local document store", "Documents live under ~/.pencil/documents; config, skills and browser previews have sibling folders.", "P1",
  [mainev("out/constants.js", "CONFIG_FOLDER = ~/.pencil; DOCUMENTS_FOLDER = ~/.pencil/documents")]);
add("file", "file.snapshot_export", "Export Snapshot (portable .zip)", "Exports the document plus every referenced asset into a snapshot archive for another machine.", "P1",
  [strev("string:Export Snapshot"),
   mainev(MENU, "ipc channel:open-export-snapshot-dialog"),
   strev("string:Snapshot archive is invalid")]);
add("file", "file.snapshot_import", "Import snapshot from URL", "Imports a shared snapshot URL / archive back onto the canvas.", "P2",
  [strev("string:Snapshot import from URL is not available in this environment."),
   mainev(APP, "ipc channel:write-snapshot-import")]);
add("file", "file.bundled_templates", "Bundled starter documents", "Ships starter design-system libraries and demo documents (shadcn, halo, lunaris, nitro, heroui, welcome).", "P1",
  [mainev("out/data", "files: pencil-shadcn.pen, shadcn.lib.pen, halo.lib.pen, lunaris.lib.pen, nitro.lib.pen, pencil-heroui.pen, pencil-welcome.pen"),
   mainev("out/constants.js", "BUNDLED_DOCUMENTS_FOLDER = app/out/data")]);

/* ---------------- canvas ---------------- */
add("canvas", "canvas.infinite_canvas", "Infinite zoomable canvas", "Infinite pan/zoom canvas with zoom-to-fit, zoom-to-selection, 100% and region zoom.", "P0",
  [strev("string:Zoom to Fit"), strev("string:Zoom to region"), strev("string:Pan")],
  "All five zoom modes appear in the compiled shortcut catalog (category Zoom, 9 entries).");
add("canvas", "canvas.pixel_grid", "Pixel grid + snap to pixel grid", "Toggleable pixel grid and 'Snap to pixel grid' / 'Snap to objects' config toggles.", "P1",
  [strctx("code:Snap to pixel grid", IDX)], "Config keys showPixelGrid / roundToPixels / snapToObjects.");
add("canvas", "canvas.guides_snapping", "Object snapping and guides", "Snaps dragged objects to other objects and renders alignment guides.", "P1",
  [strev("string:Snap to objects"),
   strev("string:Must be attached to a SceneGraph to query snap points!")]);
add("canvas", "canvas.multi_window_grid", "Organize Windows into Grid", "Tiles all open editor windows into a grid from the Window menu.", "P2",
  [mainev(MENU, "label:Organize Windows into Grid / organizeWindowsIntoGrid()")]);
add("canvas", "canvas.hide_ui", "Show/Hide UI (focus mode)", "Hides all editor chrome with Cmd+\\ for canvas-only viewing.", "P2",
  [mainev(MENU, "label:Show/Hide UI / accelerator CmdOrCtrl+\\")]);
add("canvas", "canvas.find_empty_space", "Find empty canvas area", "Agent-facing API that locates a free WxH region (direction + padding) to place new screens without overlap.", "P2",
  [doc(SKILL + "execute.md", "function FindEmptySpace({width,height,direction,padding,nodeId})",
    "sed -n '241,252p' out/skills/pen-dev/execute.md")]);
add("canvas", "canvas.design_mode", "Design Mode toggle", "Toggles between design/edit mode and pure canvas navigation (bound in the VS Code host too).", "P2",
  [strctx("code:Toggle Design Mode")], "Also exposed in the VS Code webview integration.");

/* ---------------- tools ---------------- */
add("tools", "tools.move", "Move tool", "Primary pointer tool for selecting and moving nodes; supports drag-off duplication.", "P0",
  [strev("string:Move"), strctx("code:setActiveTool(\"move\")")]);
add("tools", "tools.scale", "Scale tool", "Resize/scale handles tool.", "P0",
  [strctx("code:setActiveTool(\"scale\")")]);
add("tools", "tools.hand", "Hand / pan tool", "Space-drag panning plus a dedicated hand tool.", "P0",
  [strctx("code:setActiveTool(\"hand\")"), strev("string:Pan")]);
add("tools", "tools.frame", "Frame tool", "Draws layout frames (the primary container/screen node).", "P0",
  [strctx("code:setActiveTool(\"frame\")"), doc(SKILL + "pen-schema.md", "interface Frame extends Rectangleish, CanHaveChildren, Layout",
    "grep -n 'interface Frame' out/skills/pen-dev/pen-schema.md")]);
add("tools", "tools.shapes", "Rectangle / ellipse / polygon tools", "Shape tools: rectangle, ellipse (with ring/arc), polygon (sides + corner radius).", "P0",
  [strctx("code:setActiveTool(\"rectangle\")"), strctx("code:setActiveTool(\"ellipse\")"),
   doc(SKILL + "pen-schema.md", "interface Polygon { type: \"polygon\"; polygonCount?: NumberOrVariable; cornerRadius?: NumberOrVariable; }",
    "grep -n 'interface Polygon' out/skills/pen-dev/pen-schema.md")]);
add("tools", "tools.pen", "Pen / vector path tool", "Pen tool with full point editing: add point, insert point on segment, cut, connect points, smooth/corner toggle, symmetric handles, bend, straighten.", "P0",
  [strctx("code:setActiveTool(\"pen\")"), strctx("code:setActiveTool(\"pen_move\")"),
   strev("string:CutAnchor"), strev("string:JoinContour")],
  "Shortcut catalog categories 'Pen tool', 'Points & handles', 'Segments' document each operation.");
add("tools", "tools.text", "Text tool", "Inserts and edits text nodes with in-place canvas editing.", "P0",
  [strctx("code:setActiveTool(\"text\")")]);
add("tools", "tools.sticky_note", "Sticky note tool", "Adds note nodes (annotation objects separate from design content).", "P2",
  [strctx("code:setActiveTool(\"sticky_note\")"),
   doc(SKILL + "pen-schema.md", "interface Note extends Entity, Size, TextStyle { type: \"note\"; content?: TextContent; }",
    "grep -n 'interface Note' out/skills/pen-dev/pen-schema.md")]);
add("tools", "tools.comment", "Comment tool", "Places comment pins on the canvas; markers can be shown/hidden.", "P1",
  [strctx("code:setActiveTool(\"comment\")"), strev("string:Comment markers hidden")]);
add("tools", "tools.icon", "Icon node tool", "Places icons from six icon libraries (lucide, feather, Material Symbols Outlined/Rounded/Sharp, phosphor) with variable weight.", "P1",
  [doc(SKILL + "pen-schema.md", "interface Icon { library?: 'lucide'|'feather'|'Material Symbols Outlined'|... ; icon?: StringOrVariable; weight?: NumberOrVariable; }",
    "grep -n 'interface Icon' out/skills/pen-dev/pen-schema.md"),
   strctx("code:activeTool===\"icon\"")]);
add("tools", "tools.script_node", "Script node tool", "Script nodes run a JS file that returns generated child nodes, with typed @input parameters exposed in the UI.", "P2",
  [strctx("code:activeTool===\"script\""),
   doc(SKILL + "scripts-and-shaders.md", "@schema 2.11 / @input name: type — pencil.width/pencil.height/pencil.input",
    "sed -n '1,40p' out/skills/pen-dev/scripts-and-shaders.md")], "Deterministic Math.random() in scripts.");
add("tools", "tools.browser_node", "Browser node tool", "Places a live web page on the canvas (URL, device emulation, zoom, scroll) that agents can drive.", "P1",
  [strctx("code:activeTool===\"browser\""),
   doc(SKILL + "pen-schema.md", "interface Browser { type: \"browser\"; url?: string; deviceId?: string; zoom?: number; scrollX?; scrollY?; }",
    "grep -n 'interface Browser' out/skills/pen-dev/pen-schema.md")]);

/* ---------------- selection / transform ---------------- */
add("selection", "selection.marquee", "Marquee + deep selection", "Box select, add-to-box-select and deep box select through nested containers.", "P0",
  [strev("string:Box select"), strev("string:Deep box select"), strev("string:Deep select")]);
add("selection", "selection.modifier_modes", "Selection combine modes", "Shift = add/union, Alt = subtract, Shift+Alt = intersect; replace is the default.", "P1",
  [strctx("code:if(event.shiftKey&&event.altKey)return\"intersect\""),
   strev("string:Add to selection")]);
add("selection", "selection.align", "Align", "Align left/center/right/top/middle/bottom for multi-selection.", "P0",
  [strev("string:Align left"), strev("string:Align middle"), strev("string:Align right")]);
add("selection", "selection.order", "Z-order commands", "Bring forward / send backward / bring to front / send to back.", "P0",
  [strev("string:Bring to Front"), strev("string:Bring forward"), strev("string:Send to back")]);
add("selection", "selection.parent_child_nav", "Select parent / select children", "Keyboard traversal of the layer hierarchy.", "P1",
  [strev("string:Select children"), strev("string:Select parent")]);
add("selection", "selection.nudge", "Nudge with arrow keys", "Arrow-key nudge, Shift for big nudge, and transform-while-dragging duplicates.", "P0",
  [strev("string:Nudge selection (⇧ for big nudge)")]);
add("selection", "selection.flip", "Flip horizontal / vertical", "Flips the selected nodes, reflected in the flipX/flipY schema properties.", "P1",
  [strev("string:Flip horizontal"),
   doc(SKILL + "pen-schema.md", "interface Entity { flipX?: BooleanOrVariable; flipY?: BooleanOrVariable; }",
    "grep -n 'flipX' out/skills/pen-dev/pen-schema.md")]);
add("selection", "selection.rotate", "Rotate", "Rotate handles plus 'Rotate 90° right' command; rotation is a schema property.", "P0",
  [strev("string:Rotate 90° right"),
   doc(SKILL + "pen-schema.md", "interface Entity { rotation?: NumberOrVariable; }")]);
add("selection", "selection.group", "Group / ungroup", "Group nodes into group containers and ungroup them.", "P0",
  [strev("string:Group "), doc(SKILL + "pen-schema.md", "interface Group extends Entity, CanHaveChildren, CanHaveEffects { type: \"group\"; }")]);

/* ---------------- vector ---------------- */
add("vector", "vector.path_node", "Raw SVG path nodes", "Path nodes store SVG geometry + viewBox + fillRule (nonzero/evenodd).", "P0",
  [doc(SKILL + "pen-schema.md", "interface Path { type: \"path\"; fillRule?: 'nonzero'|'evenodd'; geometry?: string; viewBox?: [x,y,w,h] }",
    "grep -n 'interface Path' out/skills/pen-dev/pen-schema.md")]);
add("vector", "vector.boolean_ops", "Boolean operations (union/subtract/intersect/exclude)", "Destructive boolean combine of selected shapes, with a BOOLEAN_OPERATION node kind.", "P0",
  [strev("string:BOOLEAN_OPERATION"), strctx("code:destructiveBoolean")], "Also reachable from the layer context menu.");
add("vector", "vector.stroke_editing", "Stroke properties", "Stroke paint, per-side width, linecap, linejoin and inner/center/outer alignment.", "P0",
  [doc(SKILL + "pen-schema.md", "interface CanHaveStroke { stroke?; strokeWidth?: number|{top,right,bottom,left}; strokeLinecap; strokeLinejoin; strokeAlignment }")]);
add("vector", "vector.corner_radius", "Per-corner corner radius", "Uniform or four-value corner radius on rectangles and polygons, editable per corner.", "P1",
  [strev("string:Edit corners individually"),
   doc(SKILL + "pen-schema.md", "cornerRadius?: NumberOrVariable | [NumberOrVariable x4]")]);
add("vector", "vector.ellipse_arcs", "Ellipse rings and arcs", "Ellipse nodes expose innerRadius (donut) plus startAngle/sweepAngle arcs.", "P2",
  [doc(SKILL + "pen-schema.md", "interface Ellipse { innerRadius?; startAngle?; sweepAngle? (-360..360) }")]);
add("vector", "vector.vectorize_image", "Vectorize image (raster → paths)", "Traces an existing raster image into editable vector paths placed in a target frame.", "P1",
  [strev("string:Vectorize image"),
   doc(SKILL + "generate.md", "Generate(type: \"vectorize-image\", nodeId, imageUrl)")]);
add("vector", "vector.svg_import_as_paths", "Import SVG as editable paths", "Imported SVG artwork becomes path nodes inside a frame (no SVG-in-image indirection).", "P1",
  [strev("string:Import Image or SVG…"),
   doc(SKILL + "generate.md", "\"svg\" results are inserted as paths scaled to the frame bbox")]);

/* ---------------- text ---------------- */
add("text", "text.font_basics", "Font family / size / weight", "Core typography: family (all Google Fonts available), size, weight, style.", "P0",
  [doc(SKILL + "pen-schema.md", "interface TextStyle { fontFamily?; fontSize?; fontWeight?; fontStyle? }"),
   doc(SKILL + "SKILL.md", "\"All Google fonts are available.\"")]);
add("text", "text.advanced_typography", "Letter spacing, line height, underline, strikethrough", "Advanced text attributes incl. line-height multiplier and href for links.", "P1",
  [doc(SKILL + "pen-schema.md", "letterSpacing?; lineHeight?; underline?; strikethrough?; href?: string"),
   strev("string:Line height"), strev("string:Font weight")]);
add("text", "text.alignment", "Text alignment (h + v)", "Horizontal left/center/right/justify and vertical top/middle/bottom alignment.", "P0",
  [doc(SKILL + "pen-schema.md", "textAlign?: 'left'|'center'|'right'|'justify'; textAlignVertical?: 'top'|'middle'|'bottom'")]);
add("text", "text.growth_modes", "Text growth modes", "Auto (grow), fixed-width (wrap), fixed-width-height (overflow) sizing modes.", "P0",
  [doc(SKILL + "pen-schema.md", "textGrowth?: 'auto'|'fixed-width'|'fixed-width-height'")]);
add("text", "text.inline_edit", "On-canvas text editing", "Double-click in-canvas text editing with a floating text overlay/toolbar.", "P0",
  [strev("string:Edit text"), strev("string:Text")]);
add("text", "text.links", "Hyperlinks on text", "Text runs can carry an href rendered as a link.", "P2",
  [doc(SKILL + "pen-schema.md", "TextStyle.href?: string")]);
add("text", "text.prompt_context_nodes", "Prompt / context / note text nodes", "Dedicated text-bearing node types used by the agent workflow (prompt, context) and annotations (note).", "P2",
  [doc(SKILL + "pen-schema.md", "interface Prompt / Context / Note all extend Entity, Size, TextStyle"),
   strev("string:Add to Context")], "These are document objects, not chat UI.");

/* ---------------- layout ---------------- */
add("layout", "layout.flex", "Flex layout (auto layout)", "Add/remove horizontal or vertical flex layout on frames with gap, padding, justify and align.", "P0",
  [strev("string:Add flex layout"), strev("string:Remove flex layout"), strev("string:Gap"), strev("string:Padding"),
   doc(SKILL + "pen-schema.md", "interface Layout { layout?; gap?; padding?; justifyContent?; alignItems?; layoutIncludeStroke? }")]);
add("layout", "layout.sizing_fit_fill", "Hug / fill sizing", "fit_content and fill_container sizing behaviors with optional numeric fallbacks.", "P0",
  [doc(SKILL + "pen-schema.md", "type SizingBehavior = 'fit_content' | 'fill_container' with '(fallback)'"),
   doc(SKILL + "pen-schema.md", "interface Size { width?: NumberOrVariable | SizingBehavior }")]);
add("layout", "layout.absolute_position", "Absolute positioning in layout", "Child frames can opt out of the flex flow and be absolutely positioned.", "P1",
  [doc(SKILL + "pen-schema.md", "layoutPosition?: 'auto' | 'absolute'")]);
add("layout", "layout.clip_content", "Clip content", "Frame clip flag hides overflow; agents are required to clip screen frames.", "P1",
  [strev("string:Clip Content"), doc(SKILL + "pen-schema.md", "interface Frame { clip?: BooleanOrVariable }")]);
add("layout", "layout.slots", "Component slot frames", "Frames marked `slot: [componentIds]` declare recommended children (used by the design-system guides).", "P2",
  [doc(SKILL + "pen-schema.md", "slot?: false | string[] — 'Marks frame as a slot for component instances'"),
   doc(SKILL + "guide/design-system.md", "## 2. Understanding Slots")]);
add("layout", "layout.layout_quality_checks", "Clipping / off-center problem detection", "The document API reports per-node layout problems ('partially clipped', 'fully clipped') so agents can self-check.", "P2",
  [doc(SKILL + "execute.md", "interface Ctx { problems?: \"partially clipped\" | \"fully clipped\"; bounds: Rect }")],
  "Pen has no CSS-grid layout: Layout.layout is only none|vertical|horizontal.");

/* ---------------- components ---------------- */
add("components", "components.reusable", "Reusable components (symbols)", "Any node can be marked reusable:true to become a component/symbol.", "P0",
  [doc(SKILL + "guide/components.md", "Object that has `reusable` property `true` is a component/symbol"),
   doc(SKILL + "pen-schema.md", "interface Entity { reusable?: boolean }")]);
add("components", "components.instances", "Instances via ref nodes", "Instances are `ref` nodes pointing at component ids; the subtree comes from the component.", "P0",
  [doc(SKILL + "pen-schema.md", "interface Ref { type: \"ref\"; ref: string; descendants?: {...} }"),
   strev("string:No reusable components found")]);
add("components", "components.descendant_overrides", "Nested descendant overrides", "Instance overrides target the component root, descendant ids/paths/names, or nested instance paths (a/b/c).", "P1",
  [doc(SKILL + "guide/components.md", "descendants map; nested instance overrides use instanceId/childId paths")]);
add("components", "components.slot_replacement", "Replace instance subtree", "A descendant override carrying `type` fully replaces that subtree inside an instance.", "P2",
  [doc(SKILL + "guide/components.md", "Parts of an instance's object tree can also be replaced with completely new objects")]);
add("components", "components.detach_instance", "Detach instance", "Detaches an instance into plain layers, breaking the link to the component.", "P1",
  [strev("string:Detach instance")]);
add("components", "components.no_cross_file", "No cross-file component references (limitation)", "Components cannot be referenced across .pen files; they must be copied in.", "P2",
  [doc(SKILL + "guide/components.md", "You cannot reference components across files.")],
  "Notable difference vs Figma's library system; .pen imports only pull assets.");
add("components", "components.variants", "Component variants", "Figma-style variants/properties are NOT present in the 1.2.15 schema; reuse is by generic components + instance overrides.", "P2",
  [{ source: "pen", strength: "inferred", file: SKILL + "pen-schema.md",
     locator: "absence: Child union has no variant/variant-set type (Frame|Group|Rectangle|Ellipse|Path|Polygon|Text|Note|Prompt|Context|Icon|Script|Browser|Ref)",
     command: "grep -n 'export type Child' out/skills/pen-dev/pen-schema.md" }],
  "Negative evidence recorded once, flagged inferred: no variant set / component-property UI strings were found ('variants' hits are font-variant CSS keywords and shader preset names).");

/* ---------------- variables / themes ---------------- */
add("variables", "variables.types", "Document variables (color/number/string/boolean)", "Document-level variable definitions referenced from any property with a `$name` token.", "P0",
  [doc(SKILL + "pen-schema.md", "interface Document { variables?: { [name]: {type: 'boolean'|'color'|'number'|'string'; value: ... }} }"),
   doc(SKILL + "execute.md", "SetVariables({accent:{type:\"color\",value:\"#A3B59A\"}, ...})")]);
add("variables", "variables.theming_modes", "Multi-axis themes on variables", "Variables can carry per-theme values keyed by theme axes (e.g. mode: light/dark); axes auto-register.", "P0",
  [doc(SKILL + "pen-schema.md", "themes?: { [axis]: string[] }; variable value may be {value, theme}[]"),
   doc(SKILL + "execute.md", "background:{type:\"color\",value:[{value:\"#F8F5F0\",theme:{mode:\"light\"}},{value:\"#1A1A1A\",theme:{mode:\"dark\"}}]}")]);
add("variables", "variables.panel", "Variables panel", "Dedicated Variables panel listing variables with add/remove and usage editing.", "P1",
  [strev("string:Variables Panel"), strev("string:Add variable"), strev("string:Variables panel controls and drag handle")]);
add("variables", "variables.bind_property", "Bind any property to a variable", "Number, color, string and boolean properties accept `$var` references (fills, padding, gap, font family...).", "P1",
  [doc(SKILL + "pen-schema.md", "type NumberOrVariable / ColorOrVariable / BooleanOrVariable / StringOrVariable; Dollar-prefixed variable name binds the property"),
   strev("string:Apply variable")]);
add("variables", "variables.clone_set_variables", "Agent variable API", "MCP execute API SetVariables/GetVariables lets agents read and write variables and themes.", "P2",
  [doc(SKILL + "execute.md", "### SetVariables / ### GetVariables")]);

/* ---------------- styles ---------------- */
add("styles", "styles.named_styles", "Named styles", "No evidence of Figma-style named color/text/effect styles; shared design intent is expressed through variables and components.", "P2",
  [{ source: "pen", strength: "inferred", file: SKILL + "pen-schema.md",
     locator: "absence: Document/Child schema has no style collection; only variables + components",
     command: "grep -n 'interface Document' out/skills/pen-dev/pen-schema.md" },
   strev("string:Copy all styles")],
  "The only 'Styles' label found is the MCP tool-result group title for get_style (visual style archetypes). Recorded as negative evidence, strength inferred.");

/* ---------------- effects ---------------- */
add("effects", "effects.blur_background_blur", "Layer + background blur", "Layer blur and backdrop (background) blur effects with radius.", "P1",
  [strev("string:Layer Blur"), strev("string:Background Blur"),
   doc(SKILL + "pen-schema.md", "type Effect = {type:'blur'}|{type:'background_blur'} | {type:'shadow'}")]);
add("effects", "effects.shadows", "Inner / outer drop shadows", "Drop shadows with inner/outer type, offset, blur, color and blend mode.", "P1",
  [strev("string:Inner Shadow"), strev("string:Drop Shadow"), strev("string:Add effect")]);
add("effects", "effects.blend_modes", "Blend modes", "18 blend modes (normal, multiply, screen, overlay, softLight, hue, luminosity, ...).", "P1",
  [doc(SKILL + "pen-schema.md", "type BlendMode = 'normal'|'darken'|'multiply'|...|'luminosity'"),
   strev("string:Blend mode")]);
add("effects", "effects.gradient_fills", "Linear / radial / angular gradients", "Gradient fills with normalized center/size, rotation and multiple color stops.", "P0",
  [doc(SKILL + "pen-schema.md", "type: 'gradient'; gradientType?: 'linear'|'radial'|'angular'; colors?: {color,position}[]"),
   strev("string:Add color stop")]);
add("effects", "effects.mesh_gradient", "Mesh gradient fill", "Bezier-interpolated color grid fill (rows x columns vertices with optional handles).", "P2",
  [doc(SKILL + "pen-schema.md", "type: 'mesh_gradient'; columns?; rows?; colors?; points?")]);
add("effects", "effects.shader_fill", "WebGL shader fills", "Shader fill type running WebGL 1.0 fragment shaders with annotated uniforms (@resolution, @time, @mouse, @sdf, @backdrop, @color, @min/@max, @label).", "P1",
  [doc(SKILL + "pen-schema.md", "type: 'shader'; url; uniforms"),
   doc(SKILL + "scripts-and-shaders.md", "## Shaders — uniform annotations")]);
add("effects", "effects.shader_presets", "Bundled shader gallery", "~40 prebuilt .glsl shaders (ember, ink-on-paper, jade-tile, dot-grid, riso, CRT, gradients...) with preview images.", "P2",
  [mainev("out/editor/goodies/shaders", "files: ember.glsl, ink-on-paper.glsl, jade-tile.glsl, dot-grid.glsl… (146 goodies files incl. previews)")]);
add("effects", "effects.image_fill", "Image fills with crop transform", "Image fills with cover/contain/stretch modes and an affine crop transform.", "P0",
  [doc(SKILL + "pen-schema.md", "type: 'image'; url; mode?: 'cover'|'contain'|'stretch'; transform?: AffineTransform")]);
add("effects", "effects.fill_stack", "Multiple fill/stroke/effect stacks", "Fill, stroke and effect properties accept one value or an ordered list, each with enabled/blendMode/opacity.", "P1",
  [doc(SKILL + "pen-schema.md", "export type Fills = Fill | Fill[]; export type Effects = Effect | Effect[]"),
   strev("string:Add fill"), strev("string:Add stroke")]);
add("effects", "effects.graphics_script_presets", "Bundled generative scripts", "Goodies include ready-made generative scripts with previews (clock, chart, gauge, radar, flow-field, candlestick, circular visualizer...).", "P2",
  [mainev("out/editor/goodies/scripts", "files: clock.js, chart.js, gauge.js, radar.js, flow-field.js, candlestick.js…")]);

/* ---------------- image ---------------- */
add("image", "image.ai_generate", "AI image generation into a fill", "Generate('ai', nodeId, prompt) writes an AI image into a node's fill and resolves asynchronously.", "P0",
  [doc(SKILL + "generate.md", "function Generate(type: \"ai\"|\"svg\", nodeId, prompt)"),
   strev("string:Import & Generation")]);
add("image", "image.stock", "Stock photo search (Unsplash)", "Generate('stock', nodeId, query) fills a node from a stock photo search.", "P1",
  [doc(SKILL + "generate.md", "## `\"ai\"` and `\"stock\"`: a new image — Unsplash query rules")]);
add("image", "image.remove_background", "Remove background (cutout)", "Returns a transparent cutout asset URL for an existing image fill.", "P1",
  [strev("string:Remove background"),
   doc(SKILL + "generate.md", "### `\"remove-background\"`")]);
add("image", "image.replace_background", "Replace background with prompt", "Keeps the subject and generates a new prompted background around it.", "P1",
  [doc(SKILL + "generate.md", "### `\"replace-background\"` — the one transform that takes a prompt")]);
add("image", "image.svg_generation", "SVG artwork generation", "Generate('svg', frameId, prompt) draws new vector artwork into a placeholder frame (async, minutes).", "P1",
  [doc(SKILL + "generate.md", "## `\"svg\"`: new vector artwork"),
   strev("string:Failed to vectorize image")]);
add("image", "image.crop", "Crop tool for images", "Non-destructive and destructive crop of image nodes, with rotation and reset.", "P1",
  [strev("string:Reset crop"), strev("string:Crop")]);
add("image", "image.media_import", "Import images / files onto canvas", "Drag or import images and files as fills/nodes, including from the clipboard.", "P0",
  [strev("string:Import Image or SVG…"), strev("string:Add image or file")]);

/* ---------------- motion ---------------- */
add("motion", "motion.shader_animation", "Time-driven shader animation", "Shader uniforms annotated @time animate continuously; there is no keyframe timeline.", "P2",
  [doc(SKILL + "scripts-and-shaders.md", "@time: set to the elapsed time in seconds. For animations."),
   { source: "pen", strength: "inferred", file: SKILL + "pen-schema.md",
     locator: "absence: no keyframe/timeline/easing model in the .pen schema",
     command: "grep -n 'keyframe\|timeline\|animation' out/skills/pen-dev/pen-schema.md" }],
  "Pen has no keyframe/timeline editor: the only time-based animation is the shader @time uniform (inferred absence, no matching schema/menu/UI surface).");

/* ---------------- presentation ---------------- */
add("presentation", "presentation.slides", "Presentation mode over frames", "Any frame can be presented as a slide; the app steps between enabled slide frames.", "P1",
  [strctx("code:Create a frame to start a presentation", IDX),
   strctx("code:this.getStartSlide()", IDX), strctx("code:stepSlides(e)", IDX)]);
add("presentation", "presentation.playback", "Slide playback transitions", "Transitions into a slide state and fits layout while presenting (fullscreen present loop).", "P2",
  [strctx("code:transitionTo(new i6(this.sceneManager,n))", IDX)], "Evidence is compiled class names in the slide controller.");

/* ---------------- export ---------------- */
add("export", "export.images_pdf", "Export selection to PDF/PNG/JPEG/WebP", "File ▸ Export Selection to… with four image formats; PDF combines nodes into one multi-page file.", "P0",
  [mainev(MENU, "label:Export Selection to... submenu PDF/PNG/JPEG/WebP"),
   doc(SKILL + "execute.md", "Export(nodeIds, format: 'png'|'jpeg'|'webp'|'pdf', outputPath)")]);
add("export", "export.html_code", "Export to HTML (code handoff)", "Exports nodes as a single HTML file with Tailwind or plain CSS; assets referenced by relative path.", "P0",
  [strev("string:Export HTML"), strctx("code:copyAsCode(\"html-css\",\"HTML\")"),
   strctx("code:copyAsCode(\"html-tailwind\",\"Tailwind\")"),
   doc(SKILL + "execute.md", "HTML formats ('html-tailwind', 'html-css')")]);
add("export", "export.copy_as_png", "Copy selection as PNG", "Copies the selection raster to the clipboard (Mod+Shift+C).", "P1",
  [strev("string:Copy as PNG"), strctx("code:description:\"Copy as PNG\"")]);
add("export", "export.copy_as_html", "Copy as HTML / HTML+Tailwind", "Copy the selection as HTML or HTML+Tailwind markup to the clipboard.", "P1",
  [strev("string:Copy as HTML"), strev("string:Copy as HTML + Tailwind")]);
add("export", "export.copy_json", "Copy as JSON", "Copies the selected nodes as .pen schema JSON.", "P2",
  [strev("string:Copy as JSON")]);
add("export", "export.copy_fill", "Copy fill / copy code", "Copy a fill to reuse on other layers, or copy node code.", "P2",
  [strev("string:Copy as Fill"), strev("string:Copy Code")]);
add("export", "export.settings", "Export settings (scale / quality)", "Export dialog with scale and quality (JPEG/WebP) settings persisted per document.", "P1",
  [strev("string:Export Settings"), strctx("code:configKey:\"exportScale\"", IDX)]);
add("export", "export.snapshot_zip", "Snapshot export/import", "Self-contained snapshot archive export and URL import (see file area).", "P1",
  [strev("string:Export Snapshot"), strev("string:Exporting HTML...")]);

/* ---------------- import ---------------- */
add("import", "import.figma", "Figma import", "Imports a Figma page (via file or copy/paste) with layers as native nodes; images are not carried over.", "P0",
  [strev("string:Import from Figma"), strev("string:Select Figma page to import"),
   strev("string:Copy any layer or frame in Figma and paste it onto the canvas. Images are not included."),
   mainev(MENU, "label:Guide: How to Import from Figma...")]);
add("import", "import.svg", "SVG import", "Imports SVG files as editable vector paths.", "P1",
  [strev("string:Import Image or SVG…"), mainev(MENU, "label:Import Image/SVG/Figma...")]);
add("import", "import.web_browser", "Import a live web page", "Browser import brings a website page (or a clipped region) onto the canvas as a snapshot of nodes.", "P1",
  [strev("string:Import Web via Browser"), strev("string:Import from Browser"),
   strctx("code:Drag to clip import height, double-click to import the full page", IDX)]);
add("import", "import.images", "Image import", "Import raster images as fills on new nodes.", "P0",
  [strev("string:Import image file"), strev("string:Import Image or SVG…")]);
add("import", "import.snapshot_url", "Snapshot import", "Imports a shared snapshot archive/URL into the current document.", "P2",
  [strev("string:open-import-snapshot-dialog"), strev("string:Could not import this snapshot.")]);
add("import", "import.pen_libraries", "Import .pen libraries", "Documents can import other .pen files as libraries via the `imports` map of short aliases to relative URIs.", "P2",
  [doc(SKILL + "pen-schema.md", "interface Document { imports?: { [alias]: relativeURI } }"),
   strev("string:Remove imported library?")]);

/* ---------------- ai / agent ---------------- */
add("agent", "agent.on_canvas_chat", "On-canvas agent chat", "Chat panel drives an agent that creates and edits real document nodes while the user watches.", "P0",
  [strev("string:Agent"), strev("string:Send message to agent"), strev("string:Toggle chat"),
   mainev(APP, "ipc channel:prompt-agent")]);
add("agent", "agent.multi_model", "Multi-provider model picker", "Claude, Codex, Gemini, Cursor, Grok, DeepSeek, Kimi, GLM and OpenAI/Anthropic-compatible endpoints; API key or OAuth login.", "P0",
  [strev("string:Select Model"), strev("string:Connect any OpenAI or Anthropic compatible API"),
   mainev("out/agent-config-manager.js", "symbol:AgentConfigManager; providers anthropic, openai-codex, gemini, cursor"),
   strev("string:Multiple models, e.g. Opus 4.8 · GPT-5.5 · DeepSeek V4 Pro · GLM 5.2")]);
add("agent", "agent.execute_api", "Execute tool: JS document API", "The agent's core tool is `execute`: a sandboxed JS snippet with Insert/Copy/Update/Replace/Move/Delete/Get/Print/TakeScreenshot/Export/Generate/SetVariables/FindEmptySpace; failures roll back.", "P0",
  [doc(SKILL + "execute.md", "## `execute` API")]);
add("agent", "agent.screenshot_feedback_loop", "Screenshot verification loop", "TakeScreenshot attaches rendered node images to the tool response so the agent can visually verify its work.", "P0",
  [doc(SKILL + "execute.md", "### TakeScreenshot")]);
add("agent", "agent.parallel_agents", "Parallel agents / subagents", "Spawn multiple named design agents that run in parallel alongside the current one.", "P2",
  [strev("string:Set parallel agents"), strev("string:Subagent Task"),
   mainev(APP, "ipc channel:Failed to execute spawn-agents!")]);
add("agent", "agent.cursor", "Agent cursor on canvas", "Agents get a labeled cursor with configurable label and size, making automated edits visible.", "P2",
  [strev("string:Agent cursor label"), strev("string:Agent cursor size")]);
add("agent", "agent.sessions", "Agent sessions & history", "Chat sessions persist, can be reopened from Agent History, and deleted permanently.", "P1",
  [strev("string:Agent sessions"), strev("string:Show Agent History"),
   mainev(APP, "ipc channel:chat-session-save / chat-sessions-load / chat-session-delete")]);
add("agent", "agent.skills", "Skills (SKILL.md) system", "Bundled + custom SKILL.md instruction packages (pen-dev skill with 15 guides) loaded by the agent on demand.", "P0",
  [mainev("out/skills/pen-dev/SKILL.md", "frontmatter name: pen-dev; 15 topic guides"),
   mainev("out/skills-manager.js", "symbol:SkillsManager; SKILLS_FOLDER ~/.pencil/skills; LATEST_URL blob/skills/latest.json"),
   mainev(APP, "ipc channel:skills-add / skills-list / skills-remove"),
   strev("string:Add SKILL.md file…")]);
add("agent", "agent.style_archetypes", "Style archetypes (get_style)", "MCP get_style tool offers ready visual style archetypes (Aerial Gravitas, Artisan Editorial, Cinematic Device Column...) with fonts/colors/imagery.", "P1",
  [doc(SKILL + "SKILL.md", "get_style({name}) — available styles list"),
   strev("string:get_style:\"Styles\"")]);
add("agent", "agent.design_feedback", "Apply AI feedback to nodes", "Feedback loop that applies targeted changes to selected nodes, optionally on copies for comparison.", "P2",
  [strev("string:Apply feedback to the targeted nodes"), strev("string:Apply with AI on copies"),
   strev("string:Duplicate target nodes first, then apply feedback so you can compare")]);
add("agent", "agent.context_and_guides", "Guides + prompt gallery", "Help menu links a prompt gallery, and the skill ships design guides (slides, web app, mobile app, dashboard/table, design system, tailwind, code).", "P1",
  [mainev(MENU, "label:Prompt Gallery && Tips -> https://pen.dev/prompts"),
   mainev(SKILL + "SKILL.md", "Quick reference table of 15 guides")]);
add("agent", "agent.usage_limits", "Plan usage limits surfaced to the agent", "When the plan limit is reached the design tools hard-stop and return a blocking instruction to the agent.", "P2",
  [strev("string:STOP. Do not continue. The user's pen.dev plan usage limit has been reached and all design tools are now blocked.")]);
add("agent", "agent.provider_setup", "Provider & credential setup", "Agent setup screen for API key / OAuth per provider incl. custom providers and executable paths.", "P1",
  [strev("string:API key connected"), strev("string:Add provider"),
   mainev(APP, "ipc channel:agent-set-api-key / agent-oauth-login / agent-set-executable-path"),
   mainev("out/config.js", "claudeApiKey, codexApiKey, geminiApiKey, cursorApiKey, loginType defaults")]);

/* ---------------- plugins / MCP / dev mode ---------------- */
add("plugins", "plugins.mcp_server", "MCP server (connect external coding tools)", "Pen exposes its canvas as an MCP server and can write the config into external clients.", "P0",
  [strev("string:Connect via MCP"), strev("string:MCP configuration"),
   strev("string:Paste this into your tool’s MCP server settings to connect it to pen.dev."),
   mainev(APP, "ipc channel:get-mcp-config / toggle-mcp-integration")]);
add("plugins", "plugins.mcp_integrations", "One-click MCP integrations", "Installs MCP config into claudeCodeCLI, codexCLI, geminiCLI, antigravity, openCodeCLI, kiroCLI, claudeDesktop.", "P1",
  [mainev("out/desktop-mcp-adapter.js", "getSupportedIntegrations() -> [claudeCodeCLI, codexCLI, geminiCLI, antigravity, openCodeCLI, kiroCLI, claudeDesktop]")]);
add("plugins", "plugins.custom_mcp", "Custom MCP servers", "Add/configure custom MCP servers and see connected tools with their status.", "P2",
  [strev("string:Custom MCP Server Configuration"), strev("string:MCP connections"), strev("string:Registered Tools")]);
add("plugins", "plugins.vscode_extension", "VS Code extension host", "Design Mode inside VS Code via the highagency.pencildev extension (webview host, IDE sidebar).", "P1",
  [mainev(MENU, "label:VSCode Extension -> marketplace item highagency.pencildev"),
   strev("string:Hide IDE sidebar when Layers are open"), strctx("code:wt.isVSCode")]);
add("plugins", "plugins.cursor_extension", "Cursor extension", "Opens cursor:extension/highagency.pencildev and installs the extension when Cursor is present.", "P2",
  [mainev(MENU, "label:Cursor Extension"), mainev("out/ide.js", "symbol:handleExtensionToIDEInstall / notifyExtensionInstall")]);
add("plugins", "plugins.pen_cli", "pen CLI", "Ships a CLI (mcp-server-darwin-arm64 binary + docs) for driving pen from a terminal / coding agents.", "P2",
  [mainev(MENU, "label:Install 'pen' CLI... -> docs.pen.dev/for-developers/pen-cli"),
   mainev("out/mcp-server-darwin-arm64", "binary (4.7MB) — not decompiled")]);
add("devmode", "devmode.export_design_to_code", "Export Design to Code", "Dialog that hands a design to a coding agent (or exports HTML) with code-export settings.", "P0",
  [strev("string:Export Design to Code"), strev("string:Code export settings"),
   strev("string:Connect your local project, or export your design as ready-to-use HTML."),
   mainev(MENU, "label:Guide: How to Export Design to Code...")]);
add("devmode", "devmode.workspace_folder", "Local workspace folder for code output", "Points the agent at a local project folder where generated code should be written.", "P1",
  [strev("string:Choose a folder where agent can generate code"), strev("string:Set Workspace Folder"),
   mainev(APP, "ipc channel:change-workspace-folder / open-workspace-folder")]);
add("devmode", "devmode.code_handoff", "Code handoff in agent chat", "Copy-to-agent actions (Copy HTML, Copy as HTML+Tailwind, copy style guide) feed the coding agent directly.", "P1",
  [strev("string:Copy to Agent"), strev("string:Style guide copied to clipboard. Paste it into the agent chat.")]);

/* ---------------- collaboration / comments ---------------- */
add("collaboration", "collaboration.multiplayer", "Live multiplayer editing", "Real-time co-editing with presence (LiveShareSync, Presence) over the collaboration transport.", "P1",
  [strev("string:LiveShareSync"), strev("string:Presence"),
   doc("out/skills/pen-dev/SKILL.md", "pen.dev is a collaborative multiplayer environment: the document can change while you work",
       "grep -n 'collaborative multiplayer' out/skills/pen-dev/SKILL.md")],
  "Skill text explicitly warns agents the document changes while they work.");
add("collaboration", "collaboration.share_link", "Share links for snapshots", "Create/revoke share links that publish a snapshot with assets; recipients can open the design without the app.", "P1",
  [strev("string:Create share link"), strev("string:Delete share link"),
   strev("string:Deleting the share link revokes access."),
   mainev(APP, "ipc channel:share-upload-changed")]);
add("comments", "comments.threads", "Comments and threads", "Canvas comments with threads, replies, resolved state and comment markers.", "P1",
  [strev("string:Post comment"), strev("string:Comment resolved"), strev("string:Comments are tied to your account."),
   strev("string:Only the share owner can change a thread's status")]);
add("comments", "comments.markers", "Comment markers visibility", "Toggle comment markers on/off on the canvas.", "P2",
  [strev("string:Comment markers visible"), strev("string:Comment markers hidden")]);

/* ---------------- shortcuts / settings / onboarding ---------------- */
add("shortcuts", "shortcuts.catalog", "Keyboard shortcuts catalog + dialog", "A categorized shortcut registry (Align, Ordering, File, View, AI Chat, Tools, Selection, Pen tool, Points & handles, Segments, Layers, Mouse, Zoom, Move) backing a Keyboard Shortcuts dialog.", "P1",
  [strev("string:Keyboard Shortcuts"),
   strctx("code:x7n=[{category:\"Align\"", IDX)],
  "77 shortcut entries extracted from the compiled catalog (see analysis/pen/rea/shortcuts-catalog-chunk.js.txt).");
add("shortcuts", "shortcuts.contextual", "Per-tool shortcut help", "Shortcut hints are shown inline per tool family (pen tool, points & handles, segments).", "P2",
  [strev("string:Points & handles"), strev("string:Segments")]);
add("settings", "settings.general", "Settings dialog", "Settings (Cmd+,) with general/preferences sections opened via IPC 'open-settings'.", "P1",
  [mainev(MENU, "label:Settings… / accelerator CmdOrCtrl+,")]);
add("settings", "settings.theme", "Light / dark mode", "Toggle app theme from the Window menu; native theme is reported to the app.", "P1",
  [mainev(MENU, "label:Toggle Light/Dark Mode"),
   mainev(APP, "ipc channel:toggle-theme / set-native-theme")]);
add("settings", "settings.agent_text_size", "Agent chat text size", "View ▸ Agent Chat Text Size: small / medium / large radio options.", "P2",
  [mainev(MENU, "AGENT_TEXT_SIZE_MENU_OPTIONS = [Small, Medium, Large]")]);
add("settings", "settings.integrations", "Integrations settings", "Toggle MCP/agent integrations and manage install locations.", "P2",
  [mainev(APP, "ipc channel:get-active-integrations / toggle-mcp-integration"),
   strev("string:No automatic integrations are available. You can connect another tool with the configuration below.")]);
add("onboarding", "onboarding.first_run", "First-run onboarding", "Onboarding walkthrough (agent setup → MCP → skills → workspace) with resume-later and dev reset hooks.", "P1",
  [mainev(MENU, "label:[DEV] Start Onboarding / [DEV] Reset to First Run"),
   mainev("out/config.js", "isFirstLaunch: true"),
   strev("string:Set up pen.dev"), strev("string:Close setup and resume next time")]);
add("onboarding", "onboarding.docs_links", "Docs, Discord and updates in Help", "Help menu links docs.pen.dev, prompt gallery, website, Discord; update check/restart-to-install.", "P2",
  [mainev(MENU, "label:Help submenu: Documentation / Prompt Gallery / Website / Join Our Discord / Check for Updates")]);

/* ---------------- storage / performance / accessibility ---------------- */
add("storage", "storage.cloud_blob", "Cloud blob storage for skills & share uploads", "Downloads skills manifests and uploads share/snapshot assets from Vercel blob storage.", "P2",
  [mainev("out/constants.js", "BLOB_STORAGE_URL = https://hctfc8iexhqk0x3o.public.blob.vercel-storage.com"),
   strev("string:Failed to upload share assets")]);
add("performance", "performance.wasm_core", "WASM rendering core", "A 9.5MB pencil WASM module plus emscripten modules render/layout the document (worker + offscreen canvas paths).", "P1",
  [mainev("out/editor/assets", "files: pencil-DYQf2TFZ.wasm (9.5MB), emscripten-module-*.wasm (1.0MB, 0.5MB), webworkerAll.js, module-asyncify")]);
add("performance", "performance.webgl_effects", "GPU/WebGL effect pipeline", "WebGL2 feature probes (float blend, anisotropic filtering, texture compression, parallel shader compile) for shader effects.", "P2",
  [strev("string:EXT_float_blend"), strev("string:KHR_parallel_shader_compile"),
   strev("string:EXT_disjoint_timer_query_webgl2")]);
add("accessibility", "accessibility.aria_toolbar", "ARIA on editor chrome", "Toolbar/dialog controls expose aria-label and tooltip text (spot-checked in the compiled UI).", "P2",
  [strctx("code:tooltip:\"Code export settings\",\"aria-label\":\"Code export settings\"", IDX)],
  "Static spot-check only; no dedicated a11y panel or contrast checker found.");

/* ---------------- build ---------------- */
const outPath = path.join(__dirname, "features.jsonl");
const lines = rows.map((r) => {
  const evidence = r.evidence.length
    ? r.evidence
    : [{ source: "pen", strength: "inferred", file: IDX, locator: "n/a", command: CMD_RENDERER }];
  const obj = {
    id: r.id,
    area: r.area,
    name: r.name,
    description: r.description,
    user_visible: true,
    priority_guess: r.priority,
    evidence,
  };
  if (r.notes) obj.notes = r.notes;
  return JSON.stringify(obj);
});
fs.writeFileSync(outPath, lines.join("\n") + "\n");
const byArea = {};
for (const r of rows) byArea[r.area] = (byArea[r.area] || 0) + 1;
console.log("wrote", rows.length, "rows to", outPath);
console.log(JSON.stringify(byArea, null, 1));
