/** Shared module ownership, merged without dropping existing acceptance coverage. */
export const EDITOR_MODULES = [
  {
    id: "workspace",
    title: "Workspace and resources",
    paths: [
      "src/app_title_bar.jsx", "src/welcome_settings.css", "src/canvas/components/welcome*", "src/canvas/components/welcome_dashboard/*",
      "src/canvas/components/editor*resources*", "src/canvas/components/editor_layers_assets*", "src/canvas/components/titlebar*",
      "src/canvas/components/canvas_tab_bar.jsx", "src/canvas/components/canvas_tab_strip.jsx", "src/canvas/components/canvas_tab_label.js",
      "src/canvas/components/use_tab_bar_overflow.js", "src/canvas/components/use_prompt_attachments.js",
      "src/canvas/components/prompt_image_attachments.jsx", "tests/unit/prompt-attachments.test.js", "tests/unit/collab_core.test.js",
      "tests/unit/webrtc_transport_coverage.test.js", "tests/unit/collab_session.test.js", "tests/unit/collab_share_secret.test.js", "src/App.jsx",
      "src/canvas/components/page_switcher.jsx", "tests/unit/titlebar_actions.test.jsx", "tests/unit/welcome_header_actions.test.js",
      "tests/e2e/critical_flows.e2e.mjs",
    ],
    related: [
      "documents", "inspector", "platform",
    ],
    features: [
      "workspace.projects", "workspace.covers", "workspace.assets", "workspace.templates", "workspace.settings-entry", "workspace.project-tabs",
      "workspace.touch-file-open", "workspace.file-actions-ready", "workspace.cold-start-new", "workspace.import-references",
    ],
    suites: [
      "project-picker", "titlebar-file-actions", "welcome-model-menu", "welcome-draft-trash", "ui-home-settings", "welcome-covers",
      "editor-resources", "editor-resources-built", "top-tabs-overflow", "welcome-sidebar-toggle", "welcome-import-references", "qa_flows",
    ],
    remaining: [
      "Native OS picker behavior and physical touch devices require separate evidence.",
    ],
  },
  {
    id: "documents",
    title: "Documents, persistence and history",
    paths: [
      "src/canvas/store/*", "src/storage/*", "src/services/*", "src/canvas/editor/editor_history*", "src/canvas/editor/editor_engine_history*",
      "src/canvas/undo*", "src/canvas/editor/editor-history-asset-pins.js", "tests/unit/editor-history-asset-pins.test.js",
      "src/canvas/editor/scene_model_serialization.js", "src/canvas/editor/scene-node-serialization.js",
      "tests/unit/scene-serialization-purity.test.js", "src/canvas/editor/scene_model_core.js", "src/canvas/editor/default-value-matcher.js",
      "tests/unit/default-value-matcher.test.js", "src/canvas/editor/document-snapshot-state.js", "tests/unit/document-snapshot-state.test.js",
      "tests/e2e/document-dirty-state-checks.mjs", "src/canvas/editor/external-image-ingestion.js", "tests/unit/external-image-ingestion.test.js",
      "tests/e2e/external-image-history-checks.mjs", "tests/unit/scene-model-lint.test.js", "src/canvas/editor/editor_engine.js",
      "src/canvas/editor/editor_engine_assembly.js",
    ],
    related: [
      "workspace", "layers", "images", "platform", "compositing", "layout",
    ],
    features: [
      "documents.autosave", "documents.import-export", "documents.undo-redo", "documents.portable-roundtrip", "documents.history-asset-pins",
      "documents.serialization-purity", "documents.dirty-checkpoints", "documents.external-image-history",
    ],
    suites: [
      "editor-session", "image-assets-history", "image-file-clipboard", "image-generated-workflow", "nested-project-roundtrip", "pages_dnd",
      "multi_document_tabs", "qa3_roundtrip", "roundtrip",
    ],
    remaining: [
      "Interrupted native writes, signed installer recovery and every legacy document version are not certified by browser round trips.",
    ],
  },
  {
    id: "canvas",
    title: "Canvas, camera and snapping",
    paths: [
      "src/canvas/components/editor_free*", "src/canvas/components/editor_full*", "src/canvas/components/editor_page*",
      "src/canvas/editor/*viewport*", "src/canvas/editor/*snapp*", "src/canvas/editor/*tile*", "src/canvas/page_camera.js",
      "src/canvas/editor/workspace-free-artwork.js", "src/canvas/editor/workspace-artwork-picture.js",
      "src/canvas/editor/workspace-artwork-stamp.js", "tests/unit/workspace-artwork-picture.test.js", "tests/unit/workspace-artwork-stamp.test.js",
      "src/canvas/components/editor_hooks/use_editor_page_engine.js", "src/canvas/editor/free-artwork-hit-regions.js",
      "tests/unit/free-artwork-hit-regions.test.js", "src/canvas/editor/frame-canvas-labels.js", "tests/unit/frame-canvas-labels.test.js",
      "tests/unit/viewport_notifications.test.js", "tests/e2e/canvas_fps.e2e.mjs",
    ],
    related: [
      "selection", "layers", "compositing", "platform",
    ],
    features: [
      "canvas.camera", "canvas.world-coordinates", "canvas.snapping", "canvas.performance", "canvas.zoom-preview",
    ],
    suites: [
      "editor-canvas-navigation", "editor-snapping", "frame-negative-space", "frame-surface-camera", "frame-adjustment-space",
      "root-contextual-toolbar", "canvas-zoom-preview",
    ],
    remaining: [
      "Hardware FPS/memory gates run separately; passing geometry tests does not establish performance parity.",
    ],
  },
  {
    id: "selection",
    title: "Selection and transforms",
    paths: [
      "tests/unit/legacy-tool-shortcuts.test.js",
      "src/canvas/components/editor_page_frame_labels.jsx", "src/canvas/editor/editor_pointer*", "src/canvas/editor/*hit-test*",
      "src/canvas/editor/selection*", "src/canvas/editor/transform*", "src/canvas/*shortcut*", "src/canvas/editor/drawing-gesture-*",
      "src/canvas/editor/move-gesture-*", "src/canvas/editor/editor-pointer-*", "src/canvas/editor/editor_engine_tools.js",
      "src/canvas/editor/editor_transform_api.js", "src/canvas/editor/editor_engine_assembly.js",
      "tests/unit/editor-module-audit-regressions.test.js", "src/canvas/components/editor_family_menu.jsx",
      "src/canvas/components/editor_select_menu.jsx", "src/canvas/components/editor_eraser_menu.jsx", "src/canvas/components/use_hover_menu.js",
      "tests/unit/toolbar_hover_menu.test.js", "tests/unit/move-gesture-start.test.js", "src/canvas/editor/chrome_design_issues.js",
      "tests/unit/node_at_point_spatial.test.js", "scripts/editor-module-catalog.mjs", "tests/unit/editor-check-plans.test.js",
    ],
    related: [
      "canvas", "layers", "text", "vectors", "inspector",
    ],
    features: [
      "selection.hit-testing", "selection.transforms", "selection.cancel", "selection.shortcuts", "selection.continuous-creation",
      "selection.frame-title-selection", "selection.toolbar-hover-menu", "selection.overlap-cycling", "selection.hover-outline",
    ],
    suites: [
      "frame-child-pointer", "frame-label-selection", "canvas-double-click", "text-box-geometry", "editor-shortcut-lifecycle", "hook-lifecycle",
      "continuous-creation",
    ],
    remaining: [
      "Physical stylus pressure, OS shortcut interception and all multi-touch sequences need device-specific checks.",
    ],
  },
  {
    id: "layers",
    title: "Layers, Frames and ownership",
    paths: [
      "src/canvas/components/editor_layer*", "src/canvas/components/use*layer*", "src/canvas/editor/*node*", "src/canvas/editor/layer_selection.js",
      "src/canvas/components/image_editor.jsx", "src/canvas/editor/*frame*", "src/canvas/editor/*reparent*", "src/canvas/editor/*duplicate*",
      "src/canvas/editor/*paste*", "src/canvas/editor/*clipboard*", "src/canvas/editor/group-structure.js", "src/canvas/editor/doc_ops_groups.js",
      "src/canvas/editor/editor_engine_groups.js", "src/canvas/editor/doc_ops_groups_helpers.js", "src/canvas/editor/reorder-layer-batch.js",
      "src/canvas/components/editor_image_batch.js", "src/canvas/components/use_editor_dnd.js", "tests/unit/batch-layer-reorder.test.js",
      "tests/unit/layer-hierarchy-stack.test.js", "tests/unit/container-command-boundaries.test.js",
      "src/canvas/components/editor_canvas_tree_model.js", "tests/unit/editor_layer_tree_cache.test.js", "src/shared/settings.js",
      "tests/unit/editor_layers_width.test.js", "tests/unit/layer-order-contracts.test.js", "tests/e2e/layer-order-contract-checks.mjs",
      "tests/e2e/duplicate-frame-drag-checks.mjs", "tests/e2e/multiframe-drag-checks.mjs", "tests/unit/frame_fit_to_content.test.js",
      "tests/unit/reparent-moved-roots.test.js", "src/canvas/editor/chrome_sections.js", "tests/unit/nested-group-commands.test.js",
      "src/canvas/editor/editor_engine.js", "src/canvas/editor/scene_model_groups.js",
    ],
    related: [
      "selection", "compositing", "layout", "documents",
    ],
    features: [
      "layers.nesting", "layers.placement", "layers.reparent", "layers.duplicate-delete-lock", "layers.container-boundaries", "layers.model-cache",
      "layers.panel-width", "layers.section-container",
    ],
    suites: [
      "editor-layers-composition", "image-layer-window", "frame-alt-duplicate", "frame-reparent-contracts", "nested-placement",
      "nested-object-lifecycle", "container-command-boundaries", "layers-panel-width",
    ],
    remaining: [
      "Browser File drops are injected DataTransfer events, not Finder/Explorer drag certification.",
    ],
  },
  {
    id: "compositing",
    title: "Masks, clipping and rendering",
    paths: [
      "src/canvas/editor/clipping-chain-cache.js", "src/canvas/editor/layer-pass-document.js", "tests/e2e/selection-size-label-checks.mjs",
      "tests/unit/container_selection_chrome.test.js", "tests/unit/clipping-chain-cache.test.js", "tests/unit/layer-pass-document.test.js",
      "src/canvas/editor/chrome*", "src/canvas/editor/render*", "src/canvas/editor/skia*", "src/canvas/editor/*mask*", "src/canvas/editor/*opacity*",
      "src/canvas/editor/*sampling*", "src/canvas/editor/*readback*", "src/canvas/editor/doc_ops_clipping.js", "tests/unit/frame-clip-run.test.js",
      "src/canvas/editor/editor_engine_render.js", "src/canvas/editor/node_effects.js", "tests/unit/empty-effect-cache.test.js",
      "tests/unit/container-opacity.test.js", "src/canvas/editor/effect-source.js", "tests/unit/effect-paint-generation.test.js",
      "tests/e2e/effect-resource-generation-checks.mjs",
    ],
    related: [
      "layers", "images", "vectors", "documents",
    ],
    features: [
      "compositing.selection-size-label", "compositing.mask-cache", "compositing.masks", "compositing.frame-clips", "compositing.alpha",
      "compositing.artwork-parity", "compositing.clip-run-culling", "compositing.effect-resources",
    ],
    suites: [
      "container-opacity", "svg-frame-clipping", "frame-clip-review", "nested-mask-lifecycle", "image-layer-alpha", "layout-mask-audit",
      "ed04_pixel_consistency",
    ],
    remaining: [
      "All blend/mask/effect combinations and GPU-driver-specific parity are not exhausted.",
    ],
  },
  {
    id: "vectors",
    title: "Shapes, paths and Boolean geometry",
    paths: [
      "tests/unit/figma/*", "src/canvas/editor/shape_geometry.js", "src/canvas/editor/*boolean*", "src/canvas/editor/*path*",
      "src/canvas/editor/*pen*", "src/canvas/editor/*svg*", "src/canvas/editor/editor_export*", "src/canvas/figma/*", "src/canvas/pen/*",
      "src/canvas/codegen/*", "tests/unit/pen-midpoint-insertion.test.js", "tests/unit/pen_curve_math.test.js",
      "tests/unit/figma_worker_subscription.test.js",
    ],
    related: [
      "selection", "compositing", "documents", "inspector",
    ],
    features: [
      "vectors.path-edit", "vectors.midpoint-insertion", "vectors.booleans", "vectors.stroke", "vectors.format-losses",
      "vectors.native-fig-properties", "vectors.import-subscriptions", "vectors.modifier-bend",
    ],
    suites: [
      "pen-midpoint-insertion", "boolean-stroke-export", "boolean-resize", "destructive-boolean", "image-svg-parity", "figma-import-fidelity",
      "html2nodes",
    ],
    remaining: [
      "Arbitrary third-party paths/fonts and every format round-trip loss require corpus expansion.",
    ],
  },
  {
    id: "text",
    title: "Text editing and typography",
    paths: [
      "src/canvas/editor/editor_annotations.js", "src/canvas/editor/*text*", "src/canvas/editor/*font*", "src/canvas/editor/drawing_api_shapes.js",
      "src/canvas/components/editor_text*", "src/canvas/components/editor_properties/text*", "tests/unit/text_section_compact.test.jsx",
      "tests/unit/tools_text_pen_shape.test.jsx", "tests/unit/affinity_tool_properties_panel.test.jsx", "tests/unit/text_on_path_engine_ops.test.js",
      "tests/unit/text-spacing-probe.test.js",
    ],
    related: [
      "selection", "layout", "compositing", "documents", "platform",
    ],
    features: [
      "text.edit", "text.box-sizing", "text.typography", "text.font-loading", "text.placement-transactions", "text.spacing-probe",
    ],
    suites: [
      "agent-paint-text", "text-creation-boundaries",
    ],
    remaining: [
      "Physical IME composition, installed-font differences, RTL and arbitrary variable fonts need dedicated acceptance.",
    ],
  },
  {
    id: "images",
    title: "Image editing, filters and local AI",
    paths: [
      "src/canvas/editor/*paint*", "src/canvas/editor/*raster*", "src/canvas/editor/*adjust*", "src/canvas/editor/*filter*",
      "src/canvas/editor/*crop*", "src/canvas/editor/*bitmap*", "src/canvas/editor/*matting*", "src/canvas/editor/*upscal*",
      "src/canvas/editor/*repair*", "src/canvas/raster/*",
    ],
    related: [
      "selection", "compositing", "documents", "inspector",
    ],
    features: [
      "images.retouch", "images.pixel-selections", "images.adjustments", "images.local-models",
    ],
    suites: [
      "drawing-retouch", "raster-loading", "image-action-loading", "image-interaction-boundaries", "image-adjustments-complete",
      "image-selections-warp", "image-toolbar-complete", "image-agent-complete", "image-inspector-core", "gl-spatial-parity", "generated-output",
      "image-export-formats",
    ],
    remaining: [
      "Real model/network and hardware memory/FPS gates are separate from offline browser checks; video is excluded from this audit.",
    ],
  },
  {
    id: "layout",
    title: "Layout, constraints and design systems",
    paths: [
      "tests/unit/legacy-constraints-resize.test.js",
      "src/canvas/editor/*layout*", "src/canvas/editor/*constraint*", "src/canvas/editor/*variable*", "src/canvas/editor/*component*",
      "src/canvas/components/editor_properties/*layout*", "src/canvas/components/editor_properties/*constraint*",
      "src/canvas/components/editor_properties/*variant*", "src/canvas/design_systems/*", "tests/unit/auto-layout-sharing.test.js",
      "tests/e2e/auto-layout-sharing-checks.mjs", "src/canvas/editor/editor_engine_init.js", "tests/unit/layout-measure-convergence.test.js",
    ],
    related: [
      "layers", "text", "inspector", "documents", "platform", "compositing",
    ],
    features: [
      "layout.auto-layout", "layout.constraints", "layout.variables", "layout.components", "layout.reflow-sharing", "layout.constraint-hit-targets",
    ],
    suites: [
      "editor-effects", "stretch-layout", "build-layout-history", "mesh-gradient", "stroke-controls", "editor-document-aids",
      "constraints-pin-regression", "constraint-hit-targets",
    ],
    remaining: [
      "All component/variable alias cycles, nested layout combinations and every design-system preset are not exhausted.",
    ],
  },
  {
    id: "inspector",
    title: "Inspector, menus and shared UI",
    paths: [
      "tests/unit/legacy-panel-effects.test.js",
      "src/canvas/components/scrub_field.jsx", "tests/e2e/inspector-control-cases.mjs", "tests/e2e/typography-inspector-cases.mjs",
      "tests/e2e/context-submenu-checks.mjs", "tests/unit/export_presets.test.js", "tests/unit/right_panel_phase1.test.jsx",
      "tests/unit/properties_panel_restructure.test.jsx", "src/canvas/color_picker/*", "src/canvas/components/popover_scope.js",
      "tests/e2e/unified-fill-*.mjs", "tests/unit/unified-fill-picker.test.jsx", "tests/unit/fill-paint-values.test.js",
      "src/canvas/components/editor_properties/*", "src/canvas/components/*context*", "src/canvas/components/*taskbar*",
      "src/canvas/components/*toolbar*", "src/canvas/components/editor_pie_menu.jsx", "src/canvas/components/flat_select*",
      "src/canvas/components/settings*", "src/canvas/use_i18n.js", "src/shared/i18n*", "src/shared/i18n/*", "src/canvas/*layout.css",
      "src/canvas/*panels.css", "tests/e2e/inspector-audit-panel.mjs", "src/canvas/components/editor_hooks/use_comments_history_switch.js",
      "tests/e2e/comment-panel-slot-checks.mjs", "src/canvas/components/editor_comments_layout.css", "tests/unit/comments_panel_slot.test.jsx",
      "src/canvas/components/editor_mobile_navigation.css", "src/canvas/components/comment_view_types.js",
      "src/canvas/components/comment_launcher_host.jsx", "src/canvas/components/editor_comment*", "tests/e2e/number-input-checkpoint-checks.mjs",
      "src/canvas/components/bounded_number_input.jsx", "src/canvas/components/ui/color_field.jsx", "src/canvas/components/inspector_primitives.jsx",
      "src/canvas/components/design_system_cards.jsx", "tests/unit/opacity_icon_blend_bg.test.jsx",
      "src/canvas/components/anchored_global_popover.jsx", "src/canvas/components/global_overlay_portal.jsx",
      "src/canvas/components/deferred_editor_surface.jsx", "src/canvas/components/editor_mobile_control_targets.css",
      "src/canvas/components/editor_touch_targets.css", "src/canvas/components/editor_mobile*.css",
      "src/canvas/components/editor_compact_layout.css", "src/canvas/components/shortcut_reference_modal.jsx",
      "src/canvas/components/editor_icon_picker_modal.jsx", "src/canvas/components/SvgEditModal.jsx", "tests/e2e/global-overlay-harness.jsx",
      "tests/unit/global-overlay-portals.test.jsx", "src/canvas/components/editor_design_issues.jsx", "src/shared/i18n/extended-en.js",
      "src/shared/i18n/extended-zh.js", "src/canvas/icons.jsx",
    ],
    related: [
      "selection", "layers", "text", "images", "layout",
    ],
    features: [
      "inspector.control-hierarchy", "inspector.typography-clarity", "inspector.export-opt-in", "inspector.unified-fill",
      "inspector.impeccable-polish", "inspector.context-submenus", "inspector.field-commit", "inspector.menu-focus", "inspector.responsive",
      "inspector.locale-lifecycle", "inspector.mobile-targets", "inspector.comments-panel-slot", "inspector.global-overlay-stacking",
      "inspector.design-issue-review",
    ],
    suites: [
      "inspector-controls", "ui-inspector-interaction", "ui-responsive-editor", "ui-global-interaction", "settings-i18n", "locale-lifecycle",
      "taskbar-mobile-reachability", "mobile-bottom-spacing", "toolbar-hover-menu", "impeccable-polish", "mobile-control-targets", "command_palette",
      "design_tokens",
    ],
    remaining: [
      "Not every inspector control/value/input method is individually certified by the current representative scenarios.",
    ],
  },
  {
    id: "platform",
    title: "Agent, runtime and platform integration",
    paths: [
      "tests/unit/integration-conflict-regressions.test.jsx",
      "src/store/design_store.js", "src/store/editor-panel-actions.js", "tests/unit/editor-panel-actions.test.js",
      "scripts/generate-third-party-notices.mjs", "scripts/bundled-third-party-notices.mjs", "scripts/license-texts/*", "scripts/verify-package.mjs",
      "NOTICE", "tests/e2e/agent-cancel-harness.jsx", "tests/e2e/editor-browser-server.mjs", "tests/e2e/editor-browser-fixture.mjs",
      "tests/unit/third_party_notices.test.js", "tests/unit/package_contents.test.js", "src/canvas/agent/*", "src/canvas/mcp/*",
      "src/canvas/collab/*", "src/canvas/comments/*", "src/canvas/components/agent-panel/*", "src/canvas/components/onboarding/*", "electron/*",
      "plugins/*", "src/shared/providers/*", "src/canvas/components/browser_drawer/*", "tests/unit/browser_drawer_import.test.js",
      "tests/unit/agent_selection_context.test.js", "tests/e2e/agent-suggestions.e2e.mjs", "tests/e2e/agent-suggestions-harness.jsx",
      "tests/unit/canvas_agent_build_layout.test.js", "tests/unit/canvas_tools_build_layout.test.js", "native_studio/Sources/*",
      "native_studio/tests/*", "native_studio/build.sh", "native_studio/tests/NativeTitleBarDetailTests.swift",
      "native_studio/tests/NativeToolMenuParityTests.swift", "native_studio/tests/NativeToolRailResponsiveTests.swift",
      "native_studio/tests/NativeViewAidParityTests.swift", "native_studio/tests/NativeTextWidthTests.swift",
      "native_studio/tests/WorkspaceWatcherRegression.swift", "native_studio/tests/NativeEffectsImportRegression.swift",
      "native_studio/tests/NativeInspectorVisualTests.swift", "native_studio/tests/NativeWorkflowParityTests.swift",
      "native_studio/Sources/UI/WindowController.swift", "native_studio/tests/main.swift", "native_studio/tests/run_tests.sh", "src/main.jsx",
      "tests/unit/collab_core.test.js", "tests/unit/webrtc_transport_coverage.test.js", "tests/unit/collab_session.test.js",
      "tests/unit/collab_share_secret.test.js", "src/App.jsx", "src/app_title_bar.jsx", "src/canvas/components/voo_brand_logo.jsx",
      "src/canvas/components/loading_modal.*", "tests/unit/loading_modal.test.jsx", "scripts/release-command-pool.mjs",
      "scripts/verify-editor-release.mjs", "tests/unit/release-command-pool.test.js", ".github/workflows/release.yml",
      "scripts/desktop-release-plan.mjs", "scripts/build-desktop-release.mjs", "scripts/assemble-desktop-release.mjs",
      "scripts/smoke-desktop-release.mjs", "scripts/build-signed-mac.mjs", "scripts/mac-signing.cjs", "scripts/mac-release-environment.mjs",
      "scripts/notarize.cjs", "scripts/signing-env.mjs", "tests/unit/mac-signing.test.js", "tests/unit/desktop-release.test.js",
      "tests/unit/code_signing_stubs.test.js", "tests/unit/native-close-guard.test.js", "tests/unit/electron_cli_bridge.test.js",
      "tests/e2e/editor-test-artifacts.mjs", "tests/unit/editor-test-artifacts.test.js", "src/canvas/components/collab_avatars.jsx",
      "tests/unit/design_quality_lint.test.js", "tests/e2e/agent-selection-context.e2e.mjs", "scripts/editor-check-plans.mjs",
      "tests/e2e/qa3_electron.e2e.mjs", "tests/e2e/image-electron.e2e.mjs",
    ],
    related: [
      "workspace", "documents", "inspector", "images", "text",
    ],
    features: [
      "platform.agent-contracts", "platform.async-lifecycle", "platform.loading", "platform.native-collaboration", "platform.browser-drawer",
      "platform.side-panel-exclusivity", "platform.local-service-discovery", "platform.live-preview", "platform.streaming-authoring",
      "platform.agent-generated-text-sizing", "platform.third-party-attribution", "platform.browser-fixture-lifecycle", "platform.desktop-release",
      "platform.desktop-close", "platform.macos-signing", "platform.native-view-aids", "platform.native-text-box",
      "platform.native-responsive-toolbar", "platform.native-workspace-watch", "platform.native-titlebar", "platform.native-chrome",
      "platform.native-paints", "platform.native-portability", "platform.native-lifecycle", "platform.native-rendering",
      "platform.native-agent-entry", "platform.native-inspector", "platform.native-island-anchor", "platform.agent-section",
    ],
    suites: [
      "editor-fixture-startup", "browser-drawer", "browser-import-frame-resizer", "browser-import-wysiwyg-parity", "browser-topbar-actions",
      "pending-integration", "agent-model-catalog", "editor-loading", "editor-optional-loading", "comments-loading", "comments-lifecycle",
      "editor-refactor", "editor-context", "editor-page-composition", "local-service", "canvas-live-preview", "agent-authoring",
      "agent_cancel_polish", "agent_tools", "agent_pencil_tools", "agent-selection-context", "agent-suggestions",
    ],
    remaining: [
      "Paid endpoints, authenticated external clients, signed installers and skipped collaboration cases require separate evidence and cannot inherit an offline pass.",
      "Desktop release acceptance runs separately on four native CI targets; browser passes do not certify installers, signatures or upgrades.",
    ],
  },
];
export const ACCEPTANCE_AXES = ["entry-points","document-state","visible-result","undo-redo","persistence","failure-cancel","platform-performance"];
export const RELEASE_BROWSER_SUITES = ["editor-fixture-startup", ...EDITOR_MODULES.flatMap(module => module.suites).filter(suite => suite !== "editor-fixture-startup")];
// Independent checks remain classified debt, never implicit passes.
export const ADDITIONAL_BROWSER_CHECKS = [
  {"suite":"claude_agent","owner":"platform","kind":"external","reason":"Live integration requires an authenticated Claude Code CLI and a real model request; no paid preflight is run in offline audits."},
  {"suite":"codex_agent","owner":"platform","kind":"external","reason":"Live integration requires an authenticated Codex CLI and a real streamed model/tool request."},
  {"suite":"mcp_cli","owner":"platform","kind":"external","reason":"Live integration launches authenticated Claude/Codex to call MCP tools and create canvas content."},
  {"suite":"qa3_electron","owner":"platform","kind":"native","reason":"Isolated Electron smoke covering preload, document creation and pointer drawing."},
  {"suite":"critical_flows","owner":"workspace","kind":"local","reason":"Isolated localhost browser path covering load, create, draw/select, undo/redo, ZIP export, draft restore and local signaling share."},
  {"suite":"canvas_fps","owner":"canvas","kind":"hardware","reason":"Hardware/scene-specific FPS gate; preserve environment and scene sizes."},
  {"suite":"image-electron","owner":"platform","kind":"native","reason":"Separate isolated Electron and native filesystem acceptance."},
  {"suite":"image-network","owner":"images","kind":"network","reason":"Separate real model downloads, inference and network acceptance."},
  {"suite":"ui-audit","owner":"inspector","kind":"audit","reason":"Generic layout scan and per-platform screenshot baselines; fails on known open findings until fixed or accepted with a reason."},
];
