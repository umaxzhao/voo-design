/** Product ownership and test registration, never a certificate of full coverage. */
export const EDITOR_MODULES = [
  {
    id: "workspace",
    title: "Workspace and resources",
    paths: [
      "src/canvas/components/welcome*", "src/canvas/components/welcome_dashboard/*",
      "src/canvas/components/editor*resources*", "src/canvas/components/editor_layers_assets*",
      "src/canvas/components/titlebar*",
    ],
    related: ["documents","inspector","platform"],
    features: ["workspace.projects","workspace.covers","workspace.assets","workspace.templates"],
    suites: [
      "project-picker", "titlebar-file-actions", "welcome-model-menu", "welcome-draft-trash",
      "ui-home-settings", "welcome-covers", "editor-resources", "editor-resources-built",
    ],
    remaining: ["Native OS picker behavior and physical touch devices require separate evidence."],
  },
  {
    id: "documents",
    title: "Documents, persistence and history",
    paths: [
      "src/canvas/store/*", "src/storage/*", "src/services/*", "src/canvas/editor/editor_history*",
      "src/canvas/editor/editor_engine_history*", "src/canvas/undo*",
    ],
    related: ["workspace","layers","images","platform"],
    features: [
      "documents.autosave", "documents.import-export", "documents.undo-redo", "documents.portable-roundtrip",
    ],
    suites: [
      "editor-session", "image-assets-history", "image-file-clipboard", "image-generated-workflow",
      "nested-project-roundtrip", "pages_dnd",
    ],
    remaining: [
      "Interrupted native writes, signed installer recovery and every legacy document version are not certified by browser round trips.",
    ],
  },
  {
    id: "canvas",
    title: "Canvas, camera and snapping",
    paths: [
      "src/canvas/components/editor_free*", "src/canvas/components/editor_full*",
      "src/canvas/components/editor_page*", "src/canvas/editor/*viewport*", "src/canvas/editor/*snapp*",
      "src/canvas/editor/*tile*", "src/canvas/page_camera.js",
    ],
    related: ["selection","layers","compositing","platform"],
    features: ["canvas.camera","canvas.world-coordinates","canvas.snapping","canvas.performance"],
    suites: [
      "editor-canvas-navigation", "editor-snapping", "frame-negative-space", "frame-surface-camera",
      "frame-adjustment-space", "root-contextual-toolbar",
    ],
    remaining: [
      "Hardware FPS/memory gates run separately; passing geometry tests does not establish performance parity.",
    ],
  },
  {
    id: "selection",
    title: "Selection and transforms",
    paths: [
      "src/canvas/editor/editor_pointer*", "src/canvas/editor/*hit-test*", "src/canvas/editor/selection*",
      "src/canvas/editor/transform*", "src/canvas/*shortcut*",
      "src/canvas/editor/drawing-gesture-*", "src/canvas/editor/move-gesture-*", "src/canvas/editor/editor-pointer-*",
      "src/canvas/editor/editor_engine_tools.js", "tests/unit/editor-module-audit-regressions.test.js",
    ],
    related: ["canvas","layers","text","vectors","inspector"],
    features: ["selection.hit-testing","selection.transforms","selection.cancel","selection.shortcuts","selection.continuous-creation"],
    suites: [
      "frame-child-pointer", "canvas-double-click", "text-box-geometry", "editor-shortcut-lifecycle",
      "hook-lifecycle", "continuous-creation",
    ],
    remaining: [
      "Physical stylus pressure, OS shortcut interception and all multi-touch sequences need device-specific checks.",
    ],
  },
  {
    id: "layers",
    title: "Layers, Frames and ownership",
    paths: [
      "src/canvas/components/editor_layer*", "src/canvas/components/use*layer*", "src/canvas/editor/*node*",
      "src/canvas/editor/layer_selection.js", "src/canvas/components/image_editor.jsx",
      "src/canvas/editor/*frame*", "src/canvas/editor/*reparent*", "src/canvas/editor/*duplicate*",
      "src/canvas/editor/*paste*", "src/canvas/editor/*clipboard*",
      "src/canvas/editor/group-structure.js", "src/canvas/editor/doc_ops_groups.js", "src/canvas/editor/editor_engine_groups.js",
      "src/canvas/components/editor_image_batch.js", "src/canvas/components/use_editor_dnd.js",
    ],
    related: ["selection","compositing","layout","documents"],
    features: ["layers.nesting","layers.placement","layers.reparent","layers.duplicate-delete-lock","layers.container-boundaries"],
    suites: [
      "editor-layers-composition", "image-layer-window", "frame-alt-duplicate", "frame-reparent-contracts",
      "nested-placement", "nested-object-lifecycle", "container-command-boundaries",
    ],
    remaining: [
      "Browser File drops are injected DataTransfer events, not Finder/Explorer drag certification.",
    ],
  },
  {
    id: "compositing",
    title: "Masks, clipping and rendering",
    paths: [
      "src/canvas/editor/chrome*", "src/canvas/editor/render*", "src/canvas/editor/skia*",
      "src/canvas/editor/*mask*", "src/canvas/editor/*opacity*", "src/canvas/editor/*sampling*",
      "src/canvas/editor/*readback*", "src/canvas/editor/doc_ops_clipping.js",
    ],
    related: ["layers","images","vectors","documents"],
    features: [
      "compositing.masks", "compositing.frame-clips", "compositing.alpha", "compositing.artwork-parity",
    ],
    suites: [
      "container-opacity", "svg-frame-clipping", "frame-clip-review", "nested-mask-lifecycle",
      "image-layer-alpha", "layout-mask-audit",
    ],
    remaining: ["All blend/mask/effect combinations and GPU-driver-specific parity are not exhausted."],
  },
  {
    id: "vectors",
    title: "Shapes, paths and Boolean geometry",
    paths: [
      "src/canvas/editor/shape_geometry.js", "src/canvas/editor/*boolean*", "src/canvas/editor/*path*", "src/canvas/editor/*pen*",
      "src/canvas/editor/*svg*", "src/canvas/editor/editor_export*", "src/canvas/figma/*", "src/canvas/pen/*",
      "src/canvas/codegen/*", "tests/unit/pen-midpoint-insertion.test.js",
    ],
    related: ["selection","compositing","documents","inspector"],
    features: ["vectors.path-edit","vectors.midpoint-insertion","vectors.booleans","vectors.stroke","vectors.format-losses"],
    suites: ["pen-midpoint-insertion","boolean-stroke-export","boolean-resize","destructive-boolean","image-svg-parity"],
    remaining: [
      "Arbitrary third-party paths/fonts and every format round-trip loss require corpus expansion.",
    ],
  },
  {
    id: "text",
    title: "Text editing and typography",
    paths: [
      "src/canvas/editor/editor_annotations.js", "src/canvas/editor/*text*", "src/canvas/editor/*font*", "src/canvas/editor/drawing_api_shapes.js", "src/canvas/components/editor_text*",
      "src/canvas/components/editor_properties/text*",
    ],
    related: ["selection","layout","compositing","documents","platform"],
    features: ["text.edit","text.box-sizing","text.typography","text.font-loading","text.placement-transactions"],
    suites: ["agent-paint-text", "text-creation-boundaries"],
    remaining: [
      "Physical IME composition, installed-font differences, RTL and arbitrary variable fonts need dedicated acceptance.",
    ],
  },
  {
    id: "images",
    title: "Image editing, filters and local AI",
    paths: [
      "src/canvas/editor/*paint*", "src/canvas/editor/*raster*", "src/canvas/editor/*adjust*",
      "src/canvas/editor/*filter*", "src/canvas/editor/*crop*", "src/canvas/editor/*bitmap*",
      "src/canvas/editor/*matting*", "src/canvas/editor/*upscal*", "src/canvas/editor/*repair*",
      "src/canvas/raster/*",
    ],
    related: ["selection","compositing","documents","inspector"],
    features: ["images.retouch","images.pixel-selections","images.adjustments","images.local-models"],
    suites: [
      "drawing-retouch", "raster-loading", "image-action-loading", "image-interaction-boundaries",
      "image-adjustments-complete", "image-selections-warp", "image-toolbar-complete", "image-agent-complete",
      "image-inspector-core", "gl-spatial-parity", "generated-output", "image-export-formats",
    ],
    remaining: [
      "Real model/network and hardware memory/FPS gates are separate from offline browser checks; video is excluded from this audit.",
    ],
  },
  {
    id: "layout",
    title: "Layout, constraints and design systems",
    paths: [
      "src/canvas/editor/*layout*", "src/canvas/editor/*constraint*", "src/canvas/editor/*variable*",
      "src/canvas/editor/*component*", "src/canvas/components/editor_properties/*layout*",
      "src/canvas/components/editor_properties/*constraint*",
      "src/canvas/components/editor_properties/*variant*", "src/canvas/design_systems/*",
    ],
    related: ["layers","text","inspector","documents","platform"],
    features: ["layout.auto-layout","layout.constraints","layout.variables","layout.components"],
    suites: [
      "editor-effects", "stretch-layout", "build-layout-history", "mesh-gradient", "stroke-controls",
      "editor-document-aids",
    ],
    remaining: [
      "All component/variable alias cycles, nested layout combinations and every design-system preset are not exhausted.",
    ],
  },
  {
    id: "inspector",
    title: "Inspector, menus and shared UI",
    paths: [
      "src/canvas/components/editor_properties/*", "src/canvas/components/*context*",
      "src/canvas/components/*taskbar*", "src/canvas/components/*toolbar*",
      "src/canvas/components/editor_pie_menu.jsx", "src/canvas/components/flat_select*", "src/canvas/components/settings*", "src/canvas/use_i18n.js",
      "src/shared/i18n*", "src/shared/i18n/*", "src/canvas/*layout.css", "src/canvas/*panels.css",
    ],
    related: ["selection","layers","text","images","layout"],
    features: [
      "inspector.field-commit", "inspector.menu-focus", "inspector.responsive", "inspector.locale-lifecycle",
    ],
    suites: [
      "inspector-controls", "ui-inspector-interaction", "ui-responsive-editor", "ui-global-interaction",
      "settings-i18n", "locale-lifecycle",
    ],
    remaining: [
      "Not every inspector control/value/input method is individually certified by the current representative scenarios.",
    ],
  },
  {
    id: "platform",
    title: "Agent, runtime and platform integration",
    paths: [
      "src/canvas/agent/*", "src/canvas/mcp/*", "src/canvas/collab/*", "src/canvas/comments/*",
      "src/canvas/components/agent-panel/*", "src/canvas/components/onboarding/*", "electron/*", "plugins/*",
      "src/shared/providers/*", "src/canvas/components/browser_drawer/*", "tests/unit/browser_drawer_import.test.js",
      "tests/unit/canvas_agent_build_layout.test.js", "tests/unit/canvas_tools_build_layout.test.js",
    ],
    related: ["workspace","documents","inspector","images","text"],
    features: [
      "platform.agent-contracts", "platform.async-lifecycle", "platform.loading",
      "platform.native-collaboration", "platform.browser-drawer", "platform.local-service-discovery", "platform.live-preview",
      "platform.streaming-authoring", "platform.agent-generated-text-sizing",
    ],
    suites: [
      "editor-fixture-startup", "browser-drawer", "pending-integration", "agent-model-catalog", "editor-loading",
      "editor-optional-loading", "comments-loading", "comments-lifecycle", "editor-refactor",
      "editor-context", "editor-page-composition", "local-service", "canvas-live-preview", "agent-authoring",
    ],
    remaining: [
      "Paid endpoints, authenticated external clients, signed installers and skipped collaboration cases require separate evidence and cannot inherit an offline pass.",
    ],
  },
];

// Every product feature starts partial. A suite pass is execution evidence,
// not permission to infer that every entry point and context was exercised.
export const ACCEPTANCE_AXES = ["entry-points", "document-state", "visible-result", "undo-redo", "persistence", "failure-cancel", "platform-performance"];
export const RELEASE_BROWSER_SUITES = ["editor-fixture-startup", ...EDITOR_MODULES
  .flatMap(module => module.suites).filter(suite => suite !== "editor-fixture-startup")];

// Standalone checks are visible debt, not implicit passes or silent omissions.
const unreviewedSuites = {
  platform: ["agent-selection-context", "agent-suggestions", "agent_cancel_polish", "agent_pencil_tools",
    "agent_tools", "claude_agent", "codex_agent", "mcp_cli", "qa3_electron"],
  workspace: ["critical_flows", "qa_flows"],
  inspector: ["command_palette", "design_tokens"],
  documents: ["multi_document_tabs", "qa3_roundtrip", "roundtrip"],
  compositing: ["ed04_pixel_consistency"],
  vectors: ["html2nodes"],
};
export const ADDITIONAL_BROWSER_CHECKS = [
  ...Object.entries(unreviewedSuites).flatMap(([owner, suites]) => suites.map(suite => ({
    suite, owner, kind: "unreviewed",
    reason: "Existing standalone suite: review its fixtures, assertions and service requirements before gate registration.",
  }))),
  { suite: "canvas_fps", owner: "canvas", kind: "hardware", reason: "Hardware/scene-specific FPS gate; preserve environment and scene sizes." },
  { suite: "image-electron", owner: "platform", kind: "native", reason: "Separate isolated Electron and native filesystem acceptance." },
  { suite: "image-network", owner: "images", kind: "network", reason: "Separate real model downloads, inference and network acceptance." },
];
