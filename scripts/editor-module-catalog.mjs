/** Product ownership and test registration, never a certificate of full coverage. */
export const EDITOR_MODULES = [
  {
    id: "workspace",
    title: "Workspace and resources",
    paths: [
      "tests/unit/collab_core.test.js", "tests/unit/webrtc_transport_coverage.test.js",
      "tests/unit/collab_session.test.js", "tests/unit/collab_share_secret.test.js",
      "src/App.jsx", "src/app_title_bar.jsx", "src/welcome_settings.css", "src/canvas/components/page_switcher.jsx",
      "tests/unit/titlebar_actions.test.jsx", "tests/unit/welcome_header_actions.test.js",
      "src/canvas/components/welcome*", "src/canvas/components/welcome_dashboard/*",
      "src/canvas/components/editor*resources*", "src/canvas/components/editor_layers_assets*",
      "src/canvas/components/titlebar*",
    ],
    related: ["documents","inspector","platform"],
    features: ["workspace.touch-file-open", "workspace.file-actions-ready","workspace.projects","workspace.cold-start-new","workspace.covers","workspace.assets","workspace.templates","workspace.settings-entry"],
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
      "nested-project-roundtrip", "pages_dnd", "multi_document_tabs", "qa3_roundtrip", "roundtrip",
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
      "src/canvas/components/editor_page_frame_labels.jsx",
      "src/canvas/editor/editor_pointer*", "src/canvas/editor/*hit-test*", "src/canvas/editor/selection*",
      "src/canvas/editor/transform*", "src/canvas/*shortcut*",
      "src/canvas/editor/drawing-gesture-*", "src/canvas/editor/move-gesture-*", "src/canvas/editor/editor-pointer-*",
      "src/canvas/editor/editor_engine_tools.js", "src/canvas/editor/editor_transform_api.js", "src/canvas/editor/editor_engine_assembly.js", "tests/unit/editor-module-audit-regressions.test.js",
    ],
    related: ["canvas","layers","text","vectors","inspector"],
    features: ["selection.hit-testing","selection.transforms","selection.cancel","selection.shortcuts","selection.continuous-creation","selection.frame-title-selection"],
    suites: [
      "frame-child-pointer", "frame-label-selection", "canvas-double-click", "text-box-geometry", "editor-shortcut-lifecycle",
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
      "src/canvas/editor/doc_ops_groups_helpers.js", "src/canvas/editor/reorder-layer-batch.js",
      "src/canvas/components/editor_image_batch.js", "src/canvas/components/use_editor_dnd.js",
      "tests/unit/batch-layer-reorder.test.js", "tests/unit/layer-hierarchy-stack.test.js",
      "tests/unit/container-command-boundaries.test.js", "tests/e2e/duplicate-frame-drag-checks.mjs",
      "tests/e2e/multiframe-drag-checks.mjs",
      "tests/unit/frame_fit_to_content.test.js", "tests/unit/reparent-moved-roots.test.js",
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
      "src/canvas/editor/clipping-chain-cache.js", "src/canvas/editor/layer-pass-document.js",
      "tests/e2e/selection-size-label-checks.mjs", "tests/unit/container_selection_chrome.test.js",
      "tests/unit/clipping-chain-cache.test.js", "tests/unit/layer-pass-document.test.js",
      "tests/unit/frame-clip-run.test.js", "src/canvas/editor/editor_engine_render.js",
      "src/canvas/editor/node_effects.js", "tests/unit/empty-effect-cache.test.js", "tests/unit/container-opacity.test.js",
      "src/canvas/editor/chrome*", "src/canvas/editor/render*", "src/canvas/editor/skia*",
      "src/canvas/editor/*mask*", "src/canvas/editor/*opacity*", "src/canvas/editor/*sampling*",
      "src/canvas/editor/*readback*", "src/canvas/editor/doc_ops_clipping.js",
    ],
    related: ["layers","images","vectors","documents"],
    features: [
      "compositing.selection-size-label", "compositing.mask-cache",
      "compositing.clip-run-culling",
      "compositing.masks", "compositing.frame-clips", "compositing.alpha", "compositing.artwork-parity",
    ],
    suites: [
      "container-opacity", "svg-frame-clipping", "frame-clip-review", "nested-mask-lifecycle",
      "image-layer-alpha", "layout-mask-audit", "ed04_pixel_consistency",
    ],
    remaining: ["All blend/mask/effect combinations and GPU-driver-specific parity are not exhausted."],
  },
  {
    id: "vectors",
    title: "Shapes, paths and Boolean geometry",
    paths: [
      "tests/unit/figma/*",
      "src/canvas/editor/shape_geometry.js", "src/canvas/editor/*boolean*", "src/canvas/editor/*path*", "src/canvas/editor/*pen*",
      "src/canvas/editor/*svg*", "src/canvas/editor/editor_export*", "src/canvas/figma/*", "src/canvas/pen/*",
      "src/canvas/codegen/*", "tests/unit/pen-midpoint-insertion.test.js", "tests/unit/pen_curve_math.test.js",
    ],
    related: ["selection","compositing","documents","inspector"],
    features: ["vectors.path-edit","vectors.midpoint-insertion","vectors.booleans","vectors.stroke","vectors.format-losses","vectors.native-fig-properties"],
    suites: ["pen-midpoint-insertion","boolean-stroke-export","boolean-resize","destructive-boolean","image-svg-parity","figma-import-fidelity","html2nodes"],
    remaining: [
      "Arbitrary third-party paths/fonts and every format round-trip loss require corpus expansion.",
    ],
  },
  {
    id: "text",
    title: "Text editing and typography",
    paths: [
      "src/canvas/editor/editor_annotations.js", "src/canvas/editor/*text*", "src/canvas/editor/*font*", "src/canvas/editor/drawing_api_shapes.js", "src/canvas/components/editor_text*",
      "src/canvas/components/editor_properties/text*", "tests/unit/text-spacing-probe.test.js", "tests/unit/text_section_compact.test.jsx", "tests/unit/tools_text_pen_shape.test.jsx", "tests/unit/affinity_tool_properties_panel.test.jsx", "tests/unit/text_on_path_engine_ops.test.js",
    ],
    related: ["selection","layout","compositing","documents","platform"],
    features: ["text.spacing-probe", "text.edit","text.box-sizing","text.typography","text.font-loading","text.placement-transactions"],
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
    features: ["layout.constraint-hit-targets","layout.auto-layout","layout.constraints","layout.variables","layout.components"],
    suites: [
      "constraint-hit-targets", "editor-effects", "stretch-layout", "build-layout-history", "mesh-gradient", "stroke-controls",
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
      "src/canvas/components/editor_hooks/use_comments_history_switch.js", "tests/e2e/comment-panel-slot-checks.mjs", "src/canvas/components/editor_comments_layout.css",
      "tests/unit/comments_panel_slot.test.jsx", "src/canvas/components/editor_mobile_navigation.css",
      "src/canvas/components/comment_view_types.js", "src/canvas/components/comment_launcher_host.jsx", "src/canvas/components/editor_comment*",
      "tests/e2e/inspector-control-cases.mjs", "src/canvas/components/scrub_field.jsx",
      "src/canvas/components/ui/color_field.jsx", "src/canvas/components/inspector_primitives.jsx",
      "src/canvas/components/design_system_cards.jsx",
      "tests/e2e/typography-inspector-cases.mjs", "tests/e2e/context-submenu-checks.mjs",
      "tests/unit/opacity_icon_blend_bg.test.jsx", "tests/unit/export_presets.test.js", "tests/unit/right_panel_phase1.test.jsx", "tests/unit/properties_panel_restructure.test.jsx",
      "src/canvas/components/anchored_global_popover.jsx", "src/canvas/components/global_overlay_portal.jsx", "src/canvas/components/deferred_editor_surface.jsx",
      "src/canvas/components/editor_mobile_control_targets.css", "src/canvas/components/editor_touch_targets.css", "src/canvas/components/editor_mobile*.css", "src/canvas/components/editor_compact_layout.css", "src/canvas/components/shortcut_reference_modal.jsx", "src/canvas/components/editor_icon_picker_modal.jsx", "src/canvas/components/SvgEditModal.jsx",
      "tests/e2e/global-overlay-harness.jsx", "tests/unit/global-overlay-portals.test.jsx",
      "src/canvas/color_picker/*", "src/canvas/components/popover_scope.js", "tests/e2e/unified-fill-*.mjs", "tests/unit/unified-fill-picker.test.jsx", "tests/unit/fill-paint-values.test.js",
      "src/canvas/components/editor_properties/*", "src/canvas/components/*context*",
      "src/canvas/components/*taskbar*", "src/canvas/components/*toolbar*",
      "src/canvas/components/editor_pie_menu.jsx", "src/canvas/components/flat_select*", "src/canvas/components/settings*", "src/canvas/use_i18n.js",
      "src/shared/i18n*", "src/shared/i18n/*", "src/canvas/*layout.css", "src/canvas/*panels.css",
    ],
    related: ["selection","layers","text","images","layout"],
    features: ["inspector.mobile-targets", "inspector.comments-panel-slot", "inspector.control-hierarchy", "inspector.typography-clarity", "inspector.export-opt-in", "inspector.unified-fill", "inspector.impeccable-polish", "inspector.context-submenus",
      "inspector.global-overlay-stacking", "inspector.field-commit", "inspector.menu-focus", "inspector.responsive", "inspector.locale-lifecycle",
    ],
    suites: ["impeccable-polish",
      "mobile-control-targets", "command_palette", "design_tokens", "inspector-controls", "ui-inspector-interaction", "ui-responsive-editor", "ui-global-interaction",
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
      "src/main.jsx",
      "tests/unit/collab_core.test.js", "tests/unit/webrtc_transport_coverage.test.js",
      "tests/unit/collab_session.test.js", "tests/unit/collab_share_secret.test.js",
      "src/App.jsx", "src/app_title_bar.jsx", "src/canvas/components/voo_brand_logo.jsx",
      "src/canvas/components/loading_modal.*", "tests/unit/loading_modal.test.jsx",
      "scripts/release-command-pool.mjs", "scripts/verify-editor-release.mjs", "tests/unit/release-command-pool.test.js",
      "src/store/design_store.js", "src/store/editor-panel-actions.js", "tests/unit/editor-panel-actions.test.js",
      "scripts/generate-third-party-notices.mjs", "scripts/bundled-third-party-notices.mjs",
      "scripts/license-texts/*", "scripts/verify-package.mjs", "NOTICE",
      "tests/e2e/agent-cancel-harness.jsx", "tests/e2e/editor-browser-server.mjs", "tests/e2e/editor-browser-fixture.mjs",
      "tests/unit/third_party_notices.test.js", "tests/unit/package_contents.test.js",
      "src/canvas/components/collab_avatars.jsx",
      "src/canvas/agent/*", "src/canvas/mcp/*", "src/canvas/collab/*", "src/canvas/comments/*",
      "src/canvas/components/agent-panel/*", "src/canvas/components/onboarding/*", "electron/*", "plugins/*",
      "src/shared/providers/*", "src/canvas/components/browser_drawer/*", "tests/unit/browser_drawer_import.test.js",
      "tests/unit/agent_selection_context.test.js",
      "tests/e2e/agent-suggestions.e2e.mjs", "tests/e2e/agent-suggestions-harness.jsx",
      "tests/unit/canvas_agent_build_layout.test.js", "tests/unit/canvas_tools_build_layout.test.js",
    ],
    related: ["workspace","documents","inspector","images","text"],
    features: [
      "platform.agent-contracts", "platform.async-lifecycle", "platform.loading",
      "platform.native-collaboration", "platform.browser-drawer", "platform.side-panel-exclusivity", "platform.local-service-discovery", "platform.live-preview",
      "platform.streaming-authoring", "platform.agent-generated-text-sizing", "platform.third-party-attribution", "platform.browser-fixture-lifecycle",
    ],
    suites: [
      "agent_cancel_polish", "agent_tools", "agent_pencil_tools", "editor-fixture-startup", "browser-drawer", "pending-integration", "agent-model-catalog", "editor-loading",
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
  platform: ["agent-selection-context", "agent-suggestions", "claude_agent", "codex_agent", "mcp_cli", "qa3_electron"],
  workspace: ["critical_flows", "qa_flows"],
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
