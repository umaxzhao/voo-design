# Panel Control Audit Report (WB-02)

## Welcome settings entry — 2026-10-31

- Capability: `workspace.settings-entry`; ownership: workspace; regression: `ui-home-settings`.
- Follow-up: reduce the bottom gap from 24px to 12px; the existing browser scenario asserts the exact gap at 320/390/768/1440px. Final revision/results: `/private/tmp/voo-settings-lower-release.json`; no new capability or platform claim.
- Change: remove the welcome sidebar version/status row and relocate its single global Settings entry from the title bar to the bottom-left. Reuse the existing drawer state, event and shortcut handlers; editor-mode settings retain their existing position.
- Assertions: no version row or welcome title-bar Settings; at 320/390/768/1440px the entry remains in the bottom-left with a minimum 48px target. Existing drawer checks cover open/close, Escape, focus restore and bilingual settings.
- Reproduction: `/private/tmp/voo-settings-before.log` records the old version row failing the new absence assertion. The dirty workspace's subsequent suite stopped at unrelated Generation type changes; it is not release evidence.
- Targeted verification: 17 related unit assertions and the complete `ui-home-settings` browser scenario pass, including 320/390/768/1440px screenshots and settings focus restoration.
- Release blocker: 10 existing failures in Agent schema/documentation and first-run provider/i18n checks also fail on parent baseline `e2d3517` (`/private/tmp/voo-settings-baseline.log`). No push or deployment is claimed. Exact clean revision and final execution results: `/private/tmp/voo-settings-release.json`; initial gate: `/private/tmp/voo-settings-release-initial.json`.
- Coverage remains partial: physical touch, signed Electron installers and other operating systems are unverified. The change does not mutate document state, history or persistence.

**Specification:** `WB-02` (Workbench / Design Editor Panel Control Audit)  
**Date:** 2026-10-24  
**Scope:** Left Panel, Right Panel, Top Toolbar/Subbar, Bottom Bar/Contextual Taskbar  
> **Historical (2026-10-24).** Files named here such as `editor_tool_subbar.jsx`, `raster_context_toolbar.jsx` and `src/locales/*.json` have since been removed or replaced; translations now live in `src/shared/i18n/`. Re-audit before relying on line numbers.

**Audit Standard:** Control selector/line, handler, engine/store method, definition verification, status.

---

## Verification update — 2026-10-27

The tables below are the historical 2026-10-24 audit, not the current open-bug count.

- Selection PNG download now extracts `result.dataUrl`; the obsolete duplicate right-panel export control is removed.
- The header's `activateMaskAction` distinguishes add from edit.
- Forward/backward actions now use atomic `engine.reorderNodes`, preserving click-independent stack order, stack boundaries, group subtrees, locked layers and one document commit. `tests/unit/batch-layer-reorder.test.js` covers these behaviors.
- The unimplemented 3D add control is rendered only when its callback exists.
- `image_editor.jsx` supplies both color-variable and style actions.
- Image crop/replace remain in the bottom contextual toolbar; the old raster context toolbar is removed.
- Live Filter functionality was already merged; its ongoing Effects-section consolidation is separate concurrent work and must not be overwritten.

## 1. Audit Summary & Counts

| Zone | Files | Controls Audited | Works | Dead | Unwired | Hardcoded Text |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Left Panel** | `page_switcher.jsx`, `editor_layers.jsx` | 24 | 24 | 0 | 0 | 0 |
| **Top Toolbar** | `editor_toolbar.jsx`, `editor_tool_subbar.jsx` | 18 | 17 | 0 | 1 | 0 |
| **Bottom Bar** | `editor_toolbar.jsx` (Zoom), `editor_contextual_taskbar.jsx` | 32 | 30 | 2 | 0 | 0 |
| **Right Panel** | `src/canvas/components/editor_properties/*` | 40 | 21 | 2 | 2 | 15 |
| **Total** | **18 files** | **114** | **92** | **4** | **3** | **15** |

- **Works (92):** Handler properly bound, target engine/store method verified to exist.
- **Dead (4):** P0 controls where handler crashes, fails silently, or produces corrupt output.
- **Unwired (3):** UI component defined but host parent does not pass callbacks/actions.
- **Hardcoded Text (15):** Functional or visible control lacking i18n localization keys (`t(...)`).

---

## 2. Left Panel Audit

### 2.1 Page Switcher (`src/canvas/components/page_switcher.jsx`)

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Page Name Input (Inline Rename) | `page_switcher.jsx:77` | `onBlur`, `onKeyDown` | `onRenamePage(id, name)` -> `design_store.renamePage` | Yes | works |
| Focus Page Button | `page_switcher.jsx:98` | `onClick` | `onFocusPage(page.id)` -> `engine.switchPage` | Yes | works |
| Duplicate Page Button | `page_switcher.jsx:119` | `onClick` | `onDuplicatePage(page.id)` -> `design_store.duplicatePage` | Yes | works |
| Delete Page Button | `page_switcher.jsx:131` | `onClick` | `onDeletePage(page.id)` -> `design_store.deletePage` | Yes | works |
| Canvas Preset Dropdown | `page_switcher.jsx:153` | `onChange` | `setCanvasPreset` / `setDimensions` | Yes | works |
| Add Page Button (`+`) | `page_switcher.jsx:194` | `onClick` | `onAddPage()` -> `design_store.createPage` | Yes | works |

### 2.2 Layers Panel (`src/canvas/components/editor_layers.jsx`)

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Search Toggle Button | `editor_layers.jsx:324` | `onClick` | `setSearchOpen(prev => !prev)` | Local | works |
| Search Filter Input | `editor_layers.jsx:336` | `onChange` | `setSearchQuery(e.target.value)` | Local | works |
| Primary Axis Swap Button | `editor_layers.jsx:350` | `onClick` | `engine.togglePrimaryAxis()` | Yes | works |
| Global Opacity Scrub / Field | `editor_layers.jsx:368` | `onChange` | `engine.setNodeOpacity(id, val)` | Yes | works |
| Blend Mode Select | `editor_layers.jsx:384` | `onChange` | `engine.setNodeBlendMode(id, mode)` | Yes | works |
| Group Expansion Chevron | `editor_layers.jsx:713` | `onClick` | `toggleCollapse(node.id)` | Local | works |
| Visibility Eye Toggle | `editor_layers.jsx:728` | `onClick` | `engine.setNodeVisibility(id, bool)` | Yes | works |
| Layer Thumbnail / Select Row | `editor_layers.jsx:748` | `onClick` | `engine.selectNode(id)` / `selectMany` | Yes | works |
| Mask Thumbnail / Edit Mask | `editor_layers.jsx:764` | `onClick` | `engine.beginMaskEdit(id)` | Yes | works |
| Inline Layer Rename | `editor_layers.jsx:784` | `onBlur`, `onKeyDown` | `engine.updateNode(id, { name })` | Yes | works |
| Lock Toggle & Granular Flyout | `editor_layers.jsx:812` | `onClick` | `engine.updateNode(id, { locked })` | Yes | works |
| Context Menu: Duplicate | `editor_layers.jsx:1899` | `onClick` | `onDuplicateLayer(idx)` -> `engine.duplicateSelected` | Yes | works |
| Context Menu: Bring to Front | `editor_layers.jsx:1910` | `onClick` | `onLayerToFront(idx)` -> `engine.moveToFront` | Yes | works |
| Context Menu: Send to Back | `editor_layers.jsx:1921` | `onClick` | `onLayerToBack(idx)` -> `engine.moveToBack` | Yes | works |
| Context Menu: Rasterize Layer | `editor_layers.jsx:1936` | `onClick` | `onRasterize(idx)` -> `engine.rasterizeNode` | Yes | works |
| Context Menu: Convert to Path | `editor_layers.jsx:1948` | `onClick` | `engine.convertSelectedToPath(id)` | Yes | works |
| Bottom Bar: Group Selection | `editor_layers.jsx:1652` | `onClick` | `engine.groupSelection()` | Yes | works |
| Bottom Bar: Merge / Combine | `editor_layers.jsx:1679` | `onClick` | `onCombineSelected("union")` -> `engine.combineSelected` | Yes | works |
| Bottom Bar: Add Mask | `editor_layers.jsx:1705` | `onClick` | `engine.addMaskToSelected()` | Yes | works |
| Bottom Bar: Adjustment Layer Picker | `editor_layers.jsx:1728` | `onClick` | `engine.addAdjustmentLayer(kind)` | Yes | works |
| Bottom Bar: New Layer Button | `editor_layers.jsx:1754` | `onClick` | `engine.createEmptyLayer()` | Yes | works |
| Bottom Bar: Trash / Delete | `editor_layers.jsx:1777` | `onClick` | `engine.deleteSelected()` | Yes | works |

---

## 3. Top Toolbar Audit

### 3.1 Primary Toolbar (`src/canvas/components/editor_toolbar.jsx`)

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Primary Tool Group (Select..Shapes) | `editor_toolbar.jsx:190-340`| `onClick` | `setActiveTool(tool)` -> `engine.setTool` | Yes | works |
| Beta 3D Object Menu Trigger | `editor_toolbar.jsx:102, 355`| `onAddObject3d` | `onAddObject3d` (prop not passed from host) | No | unwired |
| Top Action: Undo | `editor_toolbar.jsx:410` | `onClick` | `engine.undo()` | Yes | works |
| Top Action: Redo | `editor_toolbar.jsx:422` | `onClick` | `engine.redo()` | Yes | works |
| Top Action: Grid Toggle | `editor_toolbar.jsx:434` | `onClick` | `engine.toggleGrid()` | Yes | works |
| Top Action: History Drawer Toggle | `editor_toolbar.jsx:450` | `onClick` | `toggleHistory()` | Local | works |
| Top Action: Multi-Axis Toggle | `editor_toolbar.jsx:465` | `onClick` | `engine.togglePrimaryAxis()` | Yes | works |
| Top Action: Add Page | `editor_toolbar.jsx:480` | `onClick` | `onAddPage()` -> `design_store.createPage` | Yes | works |
| Top Action: Export Toggle | `editor_toolbar.jsx:495` | `onClick` | `onToggleExport()` | Local | works |
| Top Action: Apply / Commit | `editor_toolbar.jsx:512` | `onClick` | `onApply()` -> `host.applySnapshot` | Yes | works |
| Top Action: Close Editor | `editor_toolbar.jsx:530` | `onClick` | `onClose()` | Host | works |

### 3.2 Tool Subbar (`src/canvas/components/editor_tool_subbar.jsx`)

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Marquee Sub-options (Rect/Ellipse) | `editor_tool_subbar.jsx:65` | `onClick` | `engine.setToolOptions({ marqueeType })` | Yes | works |
| Brush Size & Hardness Scrubs | `editor_tool_subbar.jsx:110`| `onChange` | `engine.setBrushOptions({ size, hardness })`| Yes | works |
| Healing Mode Selector | `editor_tool_subbar.jsx:160`| `onChange` | `engine.setHealingOptions({ mode })` | Yes | works |
| Pen Path Mode / Curvature Toggle | `editor_tool_subbar.jsx:210`| `onClick` | `engine.setPenOptions({ mode })` | Yes | works |
| Shape Geometry Controls | `editor_tool_subbar.jsx:260`| `onChange` | `engine.setShapeOptions(options)` | Yes | works |
| Feather / Anti-alias Checkbox | `editor_tool_subbar.jsx:295`| `onChange` | `engine.setToolOptions({ feather, aa })` | Yes | works |

---

## 4. Bottom Bar Audit

### 4.1 Zoom & Canvas Cluster (`editor_toolbar.jsx` -> `EditorZoom`)

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Add Canvas Size Preset | `editor_toolbar.jsx:625` | `onClick` | `onAddCanvas(preset)` -> `engine.addCanvas` | Yes | works |
| Zoom Undo Button | `editor_toolbar.jsx:638` | `onClick` | `onUndo()` -> `engine.undo` | Yes | works |
| Zoom Redo Button | `editor_toolbar.jsx:648` | `onClick` | `onRedo()` -> `engine.redo` | Yes | works |
| Zoom Out Button (`-`) | `editor_toolbar.jsx:660` | `onClick` | `onZoomOut()` -> `viewportTools.zoomOut` | Yes | works |
| Zoom In Button (`+`) | `editor_toolbar.jsx:672` | `onClick` | `onZoomIn()` -> `viewportTools.zoomIn` | Yes | works |
| Zoom Fit Button (`100% / Fit`) | `editor_toolbar.jsx:690` | `onClick` | `onZoomFit()` -> `viewportTools.zoomToFit` | Yes | works |
| Grid Display Toggle | `editor_toolbar.jsx:710` | `onClick` | `onToggleGrid()` -> `engine.toggleGrid` | Yes | works |
| Snap to Grid Checkbox | `editor_toolbar.jsx:725` | `onChange` | `onToggleSnap()` -> `engine.setSnapToGrid` | Yes | works |
| Grid Size Presets (8/16/32/64) | `editor_toolbar.jsx:748` | `onClick` | `onSetGridSize(sz)` -> `engine.setGridSize` | Yes | works |

### 4.2 Contextual Taskbar (`src/canvas/components/editor_contextual_taskbar.jsx`)

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Transform Apply Button | `editor_contextual_taskbar.jsx:68` | `onClick` | `engine.commitTransform()` | Yes | works |
| Transform Cancel Button | `editor_contextual_taskbar.jsx:76` | `onClick` | `engine.cancelTransform()` | Yes | works |
| Selection Invert Button | `editor_contextual_taskbar.jsx:87` | `onClick` | `engine.invertSelection()` | Yes | works |
| Selection Deselect Button | `editor_contextual_taskbar.jsx:95` | `onClick` | `engine.clearSelection()` | Yes | works |
| Pen Finish Path | `editor_contextual_taskbar.jsx:106` | `onClick` | `engine.finishPenPath()` | Yes | works |
| Pen Delete Anchor Point | `editor_contextual_taskbar.jsx:114` | `onClick` | `engine.deleteSelectedAnchor()` | Yes | works |
| Text Font Family Dropdown | `editor_contextual_taskbar.jsx:128` | `onChange` | `engine.updateSelectedNode({ fontFamily })` | Yes | works |
| Text Font Size Scrub | `editor_contextual_taskbar.jsx:138` | `onChange` | `engine.updateSelectedNode({ fontSize })` | Yes | works |
| Text Bold Toggle | `editor_contextual_taskbar.jsx:148` | `onClick` | `engine.updateSelectedNode({ fontWeight })` | Yes | works |
| Text Align (Left/Center/Right) | `editor_contextual_taskbar.jsx:158` | `onClick` | `engine.updateSelectedNode({ textAlign })` | Yes | works |
| Image Crop Trigger | `editor_contextual_taskbar.jsx:175` | `onClick` | `engine.enterCropMode()` | Yes | works |
| Image Replace Button | `editor_contextual_taskbar.jsx:183` | `onClick` | `engine.replaceImage()` | Yes | works |
| Image Matting AI Trigger | `editor_contextual_taskbar.jsx:191` | `onClick` | `engine.runMatting()` | Yes | works |
| Shape Fill Color Swatch | `editor_contextual_taskbar.jsx:215` | `onChange` | `engine.updateSelectedNode({ fill })` | Yes | works |
| Shape Stroke Color Swatch | `editor_contextual_taskbar.jsx:225` | `onChange` | `engine.updateSelectedNode({ stroke })` | Yes | works |
| Shape Flip Horizontal/Vertical | `editor_contextual_taskbar.jsx:236` | `onClick` | `engine.flipSelectedNode(axis)` | Yes | works |
| AutoLayout Mode Toggle | `editor_contextual_taskbar.jsx:248` | `onClick` | `engine.toggleAutoLayout()` | Yes | works |
| Group / Ungroup Buttons | `editor_contextual_taskbar.jsx:258` | `onClick` | `engine.groupSelected / ungroupSelected` | Yes | works |
| Multi-align & Distribute | `editor_contextual_taskbar.jsx:263` | `onClick` | `engine.layoutSelection(alignNodes, mode)` | Yes | works |
| **Bring Forward Action** | `editor_contextual_taskbar.jsx:268` | `onClick` | `ids.forEach(id => engine?.reorderNode?.(id, 1))` | Broken | **dead (P0)** |
| **Send Backward Action** | `editor_contextual_taskbar.jsx:269` | `onClick` | `ids.forEach(id => engine?.reorderNode?.(id, -1))` | Broken | **dead (P0)** |
| Duplicate Selection | `editor_contextual_taskbar.jsx:271` | `onClick` | `engine.duplicateSelected()` | Yes | works |
| Lock / Unlock Selection | `editor_contextual_taskbar.jsx:274` | `onClick` | `ids.forEach(id => engine?.toggleLockNode(id))` | Yes | works |

---

## 5. Right Properties Panel Audit (`editor_properties/*`)

### 5.1 Panel Shell, Header & Context Toolbar

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Header Mask Toggle Button** | `properties_panel_header.jsx:106` | `onClick` | `maskActions?.onAddMask?.()` (ignores `hasMask`) | Broken | **dead (P0)** |
| Header Motion Panel Trigger | `properties_panel_header.jsx:132` | `onClick` | `onToggleMotion()` | Local | works |
| Header Swap Panel Side | `properties_panel_header.jsx:150` | `onClick` | `onSwapSide()` | Host | works |
| Mask Toolbar Brush Mode | `properties_panel_mask_toolbar.jsx:35` | `onClick` | `engine.setMaskBrushMode(mode)` | Yes | works |
| Mask Toolbar Feather Slider | `properties_panel_mask_toolbar.jsx:68` | `onChange` | `engine.setMaskBrushFeather(val)` | Yes | works |
| Mask Toolbar Invert Button | `properties_panel_mask_toolbar.jsx:82` | `onClick` | `engine.invertMask()` | Yes | works |
| Raster Context Tool Settings | `raster_context_toolbar.jsx:13` | `<summary>` | Collapsible disclosure | Local | hardcoded text |
| Raster Context Image Type Label | `raster_context_toolbar.jsx:14` | `<span>` | Displays '图像' | Text | hardcoded text |
| Raster Context Crop Button | `raster_context_toolbar.jsx:15` | `onClick` | `engine.setTool('crop')` (label '裁切') | Yes | hardcoded text |
| Raster Context Replace Button | `raster_context_toolbar.jsx:17` | `onClick` | `engine.replaceNodeBitmap` (label '替换图像') | Yes | hardcoded text |
| Raster Context Adjustments | `raster_context_toolbar.jsx:26` | `<summary>` | Collapsible disclosure (label '调整') | Local | hardcoded text |
| Raster Context Fit/Fill Select | `raster_context_toolbar.jsx:35` | `onChange` | `editAndCommit({ width, height })` | Yes | hardcoded text |

### 5.2 Core Geometry, Constraints & Layout

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Anchor Point 9-Grid | `transform_section.jsx:65` | `onClick` | `engine.setTransformAnchor(anchor)` | Yes | works |
| Transform X, Y, W, H Inputs | `transform_dimension_bar.jsx:30` | `onChange` | `editAndCommit({ x, y, width, height })` | Yes | works |
| Aspect Ratio Lock Toggle | `transform_dimension_bar.jsx:95` | `onClick` | `editAndCommit({ lockRatio: !prev })` | Yes | works |
| Rotation & Skew Scrubs | `transform_section.jsx:110` | `onChange` | `editAndCommit({ rotation, skew })` | Yes | works |
| Flip H / Flip V Buttons | `transform_section.jsx:140` | `onClick` | `engine.flipSelectedNode(axis)` | Yes | works |
| Opacity Slider & Blend Select | `transform_section.jsx:170` | `onChange` | `editAndCommit({ opacity, blendMode })` | Yes | works |
| Corner Radius Controls | `transform_radius_controls.jsx:45` | `onChange` | `editAndCommit({ cornerRadius })` | Yes | works |
| Constraints Pin Diagram & Selects | `constraints_section.jsx:50-110` | `onClick/Change` | `editAndCommit({ constraints })` | Yes | works |
| Auto Layout Flow & Alignment | `auto_layout_section.jsx:55-85` | `onClick` | `editAndCommit({ autoLayout })` | Yes | works |
| Auto Layout Padding & Gap Scrubs | `auto_layout_section.jsx:95-145` | `onChange` | `editAndCommit({ autoLayout })` | Yes | works |
| Auto Layout Child Sizing Dropdowns | `auto_layout_child_section.jsx:40` | `onChange` | `editAndCommit({ layoutSizing })` | Yes | works |
| Align 6 Buttons & Distribute | `align_section.jsx:40-100` | `onClick` | `engine.layoutSelection(...)` | Yes | works |
| Boolean Combine (Union..Exclude) | `combine_section.jsx:45-80` | `onClick` | `engine.combineSelected(op)` | Yes | works |
| Warp Perspective, Bend & Presets | `warp_section.jsx:55-155` | `onChange/Click` | `engine.setWarpParameters(...)` | Yes | works |
| Puppet Pin Depth & Rotation | `puppet_pin_section.jsx:48-125` | `onChange/Click` | `engine.setPinProperties(...)` | Yes | works |

### 5.3 Type-Specific, Media, Styling & Variables

| Control / Element | File:Line | Handler | Engine / Store Method | Exists? | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| Arc Angles & Inner Radius | `type_specific_sections.jsx:14` | `onChange` | `editAndCommit({ arcStart.. })` | Yes | hardcoded text |
| Frame Clip Content Checkbox | `type_specific_sections.jsx:15` | `onChange` | `editAndCommit({ clipContent })` | Yes | hardcoded text |
| Layout Grid Size Input | `type_specific_sections.jsx:16` | `onChange` | `editAndCommit({ layoutGrid })` | Yes | hardcoded text |
| Component Master Indicator | `type_specific_sections.jsx:17` | `<span>` | Shows '主组件' | Text | hardcoded text |
| **Type-Specific Export PNG Button** | `type_specific_sections.jsx:19` | `onClick` | `engine.exportSelectionPng` (obj href crash) | Broken | **dead (P0)** |
| Variant Property & Value Selects | `variants_section.jsx:45-60` | `onChange` | `engine.setVariantProperty(...)` | Yes | works |
| Add Variant Button | `variants_section.jsx:85` | `onClick` | `engine.addVariant()` | Yes | works |
| Video Trim / Volume / Speed | `media_section.jsx:45-95` | `onChange` | `engine.updateVideoProperties(...)` | Yes | works |
| Audio Trim / Volume / Mute | `media_section.jsx:110-150` | `onChange` | `engine.updateAudioProperties(...)` | Yes | works |
| 3D Rotation / Material / Exposure | `media_section.jsx:170-240` | `onChange` | `engine.update3DProperties(...)` | Yes | works |
| Adjustment Layer Presets & Sliders | `affinity_adjustment_section.jsx:201`| `onChange` | `engine.applyAdjustmentPreset(...)` | Yes | hardcoded text |
| Color Variables Section Root | `properties_panel_sections.jsx:247` | host prop | `colorVariableActions` (dormant if omitted) | Host | unwired |
| Reusable Style Section Root | `properties_panel_sections.jsx:260` | host prop | `styleActions` (dormant if omitted) | Host | unwired |

---

## 6. P0 Dead Controls List

Visible interactive controls that do nothing, throw errors, or produce corrupt outputs:

### P0-1: Broken Selection PNG Download
- **Location:** `src/canvas/components/editor_properties/type_specific_sections.jsx:19-22`
- **Control:** "导出 PNG" button in right panel.
- **Root Cause:** Handler executes `const url = engine?.exportSelectionPng?.([object.id])`. `engine.exportSelectionPng()` returns an Object `{ dataUrl, width, height, bounds }`, NOT a string URL. Line 22 sets `anchor.href = url`, turning the link into `blob:http://.../[object%20Object]`. The browser fails to download or generates a corrupted file. Furthermore, fallback method `engine.exportNodePng` does not exist on the engine instance.
- **Fix:** Extract `const dataUrl = typeof url === 'string' ? url : url?.dataUrl; if (!dataUrl) return; anchor.href = dataUrl;`.

### P0-2: Mask Header Button Always Creates Mask, Cannot Edit Existing Mask
- **Location:** `src/canvas/components/editor_properties/properties_panel_header.jsx:106-112`
- **Control:** Mask button in properties header (`IconMask`).
- **Root Cause:** When `hasMask` is true, the button tooltip displays `t("editor.mask.edit")`. However, the click handler checks `if (maskActions?.onAddMask) { maskActions.onAddMask(); } else { maskActions?.onEditToggle?.(); }`. Because `onAddMask` is always supplied by `ImageEditor`, the button always re-invokes `onAddMask()` instead of toggling mask edit mode (`onEditToggle`).
- **Fix:** Update condition to `if (hasMask) { maskActions?.onEditToggle?.(); } else { maskActions?.onAddMask?.(); }`.

### P0-3 & P0-4: Contextual Taskbar Layer Reordering Swaps Multi-Selection Incorrectly
- **Location:** `src/canvas/components/editor_contextual_taskbar.jsx:268-269`
- **Controls:** Bring Forward (`IconArrowUp`) and Send Backward (`IconArrowUp.rotate-180`).
- **Root Cause:** Handlers run `() => ids.forEach((id) => engine?.reorderNode?.(id, 1))` and `ids.forEach((id) => engine?.reorderNode?.(id, -1))`.
  1. For multi-selection, looping through `ids` invokes multiple document commits instead of a single atomic transaction.
  2. Reordering adjacent selected nodes one-by-one causes them to swap against each other rather than shifting past the unselected bounding layers.
- **Fix:** Wire to batch layer reordering `engine.reorderNodes?.(ids, 1)` or sort by stack index before moving non-overlapping units.

---

## 7. Remediation & Fix Plan

Grouped into focused pull request batches of at most 5 files per batch:

### Batch 1: Right Panel P0 Bugs & Raster Context Localization (3 files)
- **Files:**
  1. `src/canvas/components/editor_properties/type_specific_sections.jsx` (Fix P0-1 PNG export dataUrl resolution & localize button labels)
  2. `src/canvas/components/editor_properties/properties_panel_header.jsx` (Fix P0-2 mask edit toggle branch)
  3. `src/canvas/components/editor_properties/raster_context_toolbar.jsx` (Extract hardcoded text: "工具设置", "图像", "裁切", "替换图像", "调整", "适合/填满" into `useI18n`)
- **Objective:** Eliminate P0 download crash, fix mask edit mode switching, and clean up raster toolbar i18n keys.

### Batch 2: Contextual Taskbar Multi-Reorder & Host Prop Wiring (3 files)
- **Files:**
  1. `src/canvas/components/editor_contextual_taskbar.jsx` (Fix P0-3/P0-4 atomic batch reorder for forward/backward)
  2. `src/canvas/components/editor_toolbar.jsx` (Safely guard or wire `onAddObject3d` when `EDITOR_BETA_ENABLED`)
  3. `src/canvas/components/image_editor.jsx` (Pass `colorVariableActions` and `styleActions` to properties panel shell)
- **Objective:** Resolve taskbar multi-layer reordering bug and wire dormant props from host container.

### Batch 3: Properties Panel i18n & Affinity Adjustment Polish (4 files)
- **Files:**
  1. `src/canvas/components/editor_properties/affinity_adjustment_section.jsx` (Localize header labels, bypass title, and reset tooltips)
  2. `src/canvas/components/editor_properties/colour_fill_section.jsx` (Localize fill blend modes, mask labels, and aria attributes)
  3. `src/canvas/components/editor_properties/colour_stroke_section.jsx` (Ensure all stroke alignment tooltips use i18n keys)
  4. `src/locales/zh-CN.json` / `src/locales/en-US.json` (Register corresponding localized dictionary keys)
- **Objective:** Complete 100% i18n coverage across all properties panel controls per Spec `WB-02` criterion 3.

## Welcome import and image references — 2026-10-31

- Capability: `workspace.import-references`; suites: `welcome-import-references`, related `browser-drawer`, `pending-integration` and `ui-home-settings`.
- Both desktop import cards and the compact welcome menu use the browser panel command. Screenshot selection appends a reference, preserves the brief and focuses the composer; it never creates a document or starts generation by itself.
- Welcome and editor Agent composers share picker/clipboard attachment processing. Image-only submit uses localized recreation guidance. Images are passed as model visual references and remain outside canvas artwork; retries retain the request's references.
- Regression: `welcome-import-references` uses a real Chromium clipboard image and text paste, verifies preview/removal and deferred creation, and intercepts the editor Agent HTTP request to assert a PNG data URL. No external model is called. `prompt-attachments.test.js` covers concurrent limits, duplicate clipboard representations, failed files, reset/unmount and ordinary text paste.
- Precise release revision and execution: `/private/tmp/voo-welcome-import-release.json`; targeted browser log: `/private/tmp/voo-welcome-reference-clean.log`. Existing baseline failures remain separate; inspect receipts before claiming release success.
- Remaining contexts: physical OS screenshot clipboard variants, signed Electron installers, other operating systems and live model quality. Document undo/save are unaffected by attaching references; generated result history remains owned by the existing Agent operation.

## Layers panel width — 2026-10-31

- Capability: `layers.panel-width`; core browser suite: `layers-panel-width`; related suites: `editor-layers-composition` and `ui-responsive-editor`.
- A narrow separator on the layers panel edge adjusts its width without changing the canvas document, selection or undo history. The edge switches inward when panels swap sides. The shared width operation clamps to 200–560px and the actual space before the opposite inspector/history panel.
- Pointer release and keyboard adjustments persist one local chrome preference. Escape, pointer cancellation, capture loss and blur roll back an active drag; double-click restores 256px. Narrow/mobile layouts retain their existing automatic widths and hide the separator; desktop width is restored when space returns.
- Keyboard ownership: an additional selected-layer scenario initially moved the artwork by 1px; the separator now uses the existing floating-surface shortcut boundary, and the selected-layer scenario is retained in the browser suite. Initial evidence: `/private/tmp/voo-layer-width-selected.log`.
- Reproduction: `/private/tmp/voo-layer-width-before.log` fails because the old panel has no edge handle. Browser assertions cover actual mouse drag, expanded long-name area, fixed opposite edge, left/right docking, Arrow/Home keyboard changes, limits, Escape, reset, refresh/new-document persistence, viewport transitions and serialized document invariance.
- Evidence: `/private/tmp/voo-layer-width-clean.log`, `/private/tmp/voo-layers-width-release.json` (exact revision and executed steps), `/private/tmp/voo-layers-width-long-name.png`. Earlier dirty-workspace execution is not clean release evidence.
- Remaining contexts: physical touch/stylus resizing, signed Electron builds, other operating systems, every inspector/history combination and large-tree performance. These are unverified; chrome preferences do not require artwork undo or export parity.

## Unified fill editor

Capability: `inspector.unified-fill`, related to image placement and SVG rendering.
One swatch opens Solid / Gradient / Image / Texture in the same editor. The old
fill-only type menu, separate image file input and inline image-fit row are removed;
media choices are exposed only for fill rows; this audit does not certify every pre-existing effect-colour context.

Baseline `64e6ddd`: `unified-fill-picker.test.jsx` reproduced four failures: missing
media tabs, an empty image editor, undefined image-fit control, and hidden/empty
paint stacks reviving legacy fills. Real-browser checks additionally reproduced
nested portal clicks closing the parent, native image restoration hiding its row,
and native picture type/undo state not following its underlying asset.

| Context | Assertions / evidence | Status |
| --- | --- | --- |
| Actual inspector in Chromium | Mode drafts, mesh opening, real image decode/retry, shared alpha, centred fit, independent paints, hidden rows, removing/undo, selection-switch cancellation | Passed on `cb4d1c9`; 89/89 final release steps |
| Bitmap resource ownership | Type round trips preserve the original asset, image replacement calls the existing bitmap operation, subsequent bitmap editing remains visible; undo/redo restore resources | Passed on `cb4d1c9` in `unified-fill-native-cases.mjs` |
| Visible/export result | Real image and texture pixels; texture size/colour; decoded PNG/SVG selection pixel parity. Image sizing uses the authoritative SVG raster fallback; texture silhouettes keep native SVG patterns | Passed on `cb4d1c9` |
| Responsive / input | Keyboard tabs, nested menu Escape, 320/390/768/1440px, English/Chinese, light/dark, emulated touch | Passed on `cb4d1c9`; final screenshots in `/private/tmp/voo-unified-fill-inspector-final/` |
| Remaining | Physical devices, every image codec and large-image memory limit, cross-document cancellation with cloned IDs, exhaustive multi-image bitmap replacement and cold native-app restart | Not certified by these checks |

Tests: `fill-paint-values.test.js`, `unified-fill-picker.test.jsx`, and the registered
`ui-inspector-interaction.e2e.mjs` with its two unified-fill helper modules. Source
modules remain below 400 lines; picker state is held by one reducer and assets use
the editor's shared bitmap replacement operation. Exact final revision and online
evidence are maintained in [quality-progress.md](../quality-progress.md).

Final public execution: `cb4d1c9fbfdba8e87282a0af500fa0f1e8120d79` completed all 89 release steps, including
85 browser suites, 4567 unit passes and 4 skips on clean unchanged source.
Final report: `/private/tmp/voo-unified-fill-release-final.json`. Production index/fill resources match the build;
actual inspector switches, upload, texture pixels, undo/redo and Escape pass in a
private production browser. Evidence: `/private/tmp/voo-unified-fill-deployment-proof.json`
and `/private/tmp/voo-unified-fill-production-result.log`. The older recovered
execution is retained separately and is not attributed to this final commit.

## Opt-in layer export

Capability: `inspector.export-opt-in`; the document's `exportPresets` is the
single source of truth. Absent, invalid and explicitly empty lists must not
synthesize a PNG row or reveal an export section. The existing bottom Add menu
enables export and creates its first preset. Removing the last row hides the
entire section and restores the Add-menu entry. Explicit saved configurations remain.

Baseline `1dd3dac`: six regression assertions failed because normalization always
created a default preset. Retained log: `/private/tmp/voo-export-opt-in-baseline.log`.

| Context | Assertions | Status |
| --- | --- | --- |
| Actual inspector | Rectangle, Frame, text and image start without the entire export section; bottom Add-menu enable, remove and reselection follow each layer | Passed on `da86f56` |
| History | Undo/redo adding and removing the last preset immediately restores/hides the real controls | Passed on `da86f56` |
| Active export | Explicit add retains PNG 2x dimensions and JPEG/WebP file signatures/quality | Passed on `da86f56` |
| Normalization | Missing, empty and invalid presets remain empty; existing settings retain formats/scales/suffixes | Passed on `da86f56` |
| Remaining | Native OS download UI, physical touch devices and cold native-project reopen | Not certified by this change |

Registered coverage: `export_presets.test.js`, `right_panel_phase1.test.jsx`,
`ui-inspector-interaction.e2e.mjs` and `inspector-controls.e2e.mjs`.

Final execution: `da86f56a14a4080265fb46b834b5df363056660c` completed all 89 release steps, including 85
browser suites, 4574 unit passes and 4 skips on clean unchanged source.
Evidence: `/private/tmp/voo-export-opt-in-release-verified.json`. Public resources match the build; the real production
inspector hides the entire unconfigured section, enables it through Add, downloads
a 160x100 PNG and hides it after removal; undo/redo pass without page errors.
Production evidence: `/private/tmp/voo-export-opt-in-production-result.log` and
`/private/tmp/voo-export-opt-in-deployment-proof.json`. Earlier incomplete/failed
attempts are retained separately and are not attributed to the final revision.

## Typography clarity

Capabilities: `inspector.typography-clarity`, `text.typography`, `text.box-sizing`.
Reference: [Figma type properties](https://help.figma.com/hc/en-us/articles/360039956634-Explore-text-properties).
The existing VOO visual identity remains; the refinement adds visible metric
captions, consistent units and Lucide icons rather than new unimplemented type
features. Common settings share one implementation for editing and creation.
Text-box sizing is visible, while all less frequent options have one disclosure.

| Context | Registered assertions | Status |
| --- | --- | --- |
| Labels/icons | Explicit visible captions; 16px icons and actual 1.5px stroke after scaling | Passed on `9cd70af` |
| Real text | Size/line-height/tracking alter actual bounds; cancel and one-step undo/redo; weight/decoration/alignment | Passed on `9cd70af` |
| Advanced | Box width wraps actual text; direction/case/paragraph/baseline/path offset retain writes and undo | Passed on `9cd70af` |
| Shared creation | Same basic controls, actual pointer creates text with selected size/weight/spacing; one-step undo/redo | Passed on `9cd70af` |
| Font/multi | Existing font picker applies a real family; mixed numeric fields update both layers and undo each original value | Passed on `9cd70af` |
| Layout | 320/390/768/1440px, both themes and languages; numeric space and readable captions; 48px narrow controls | Passed on `9cd70af` |
| Window menu events | Reproduced non-Node Window target crash in `image-file-clipboard`; guard preserves inner scrolling and dismisses safely on resize/scroll | Passed on `9cd70af` |
| Remaining | Physical IME/touch/stylus, every installed font and variable-font axis, OS-level scaling | Not certified |

Evidence: `text_section_compact.test.jsx`, `tools_text_pen_shape.test.jsx`,
`paragraph_spacing.test.jsx`, `text_case.test.jsx`; registered
`ui-inspector-interaction.e2e.mjs` calls `typography-inspector-cases.mjs`.
Before screenshots: `/private/tmp/voo-typography-before.png`; targeted after
matrix: `/private/tmp/voo-typography-only/`. The two baseline regressions are in
`/private/tmp/voo-typography-baseline.log`. Mechanical typography scan returned
no findings; it does not certify every contrast or accessibility context.

Final execution `9cd70afd10df836c269b5597b5558a114e463640`: all 90 release steps, including 86 browser suites,
4587 unit passes and 4 skips on clean unchanged source. Report:
`/private/tmp/voo-typography-release-recovered.json`. All 16 viewport/theme/locale contexts have retained screenshots.
This is a same-source recovery after a private startup-cache teardown assertion,
not a single first-pass invocation: the original failure remains in
`/private/tmp/voo-typography-release-complete.json`; startup was rechecked serially
and remaining browser suites completed at reduced concurrency.
A later integrated revision `e28b5110896851246e12ffbfc0571284851f1265` preserves incoming Agent refinements and separately passes a new build, design/module validation, full unit run and the inspector/Agent-context/Agent-suggestions browser suites. It does not inherit the earlier revision's full 90-check execution. Public resources match this integrated build; the actual Chinese production panel
passes captions, 16px/1.5px SVG metrics, size geometry, weight, text wrapping,
paragraph updates and undo without page errors. Production evidence:
`/private/tmp/voo-typography-production-result.log` and
`/private/tmp/voo-typography-deployment-proof.json`. Earlier failed execution
remains separate and is not attributed to the final revision.

## Inspector control hierarchy

Capability: `inspector.control-hierarchy`. Styling opts in only inside
`editor-properties-panel`; shared field/dropdown markers have no effect in
Layers, the welcome page, Agent or toolbar. Large panel radii remain unchanged.

| Context | Assertions | Status |
| --- | --- | --- |
| Numeric fields | 6px field radius, 32px desktop row, explicit label/value/unit roles; actual typed commit/cancel and undo | Passed on `7e6a77a` |
| Dropdown | Distinct outlined surface, real keyboard open/Escape and focus retention | Passed on `7e6a77a` |
| Switch/command | Grouped Frame layout modes and lighter rotate command keep actual operations and one-step undo | Passed on `7e6a77a` |
| Responsive | 320/390/768/1440px, light/dark, English/Chinese; 48px narrow inputs, no anchor/field overlap | Passed on `7e6a77a` |
| Existing editing | Typography creation/editing, mixed selection, fill/stroke and scrub interactions | Passed on `7e6a77a` |
| Remaining | Physical touch/IME/stylus, all advanced portaled dialogs, private workspace as a whole | Not certified |

Baseline `/private/tmp/voo-inspector-controls-before.log` fails the old 12px
capsule against the new geometry requirement. Targeted checks and screenshots:
`/private/tmp/voo-inspector-controls-after-v2.log` and
`/private/tmp/voo-inspector-control-evidence/`. Registered helper
`tests/e2e/inspector-control-cases.mjs` runs inside the existing UI inspector suite.
Clean fixed revision `7e6a77a3d0836b7eecceeefddf3be3f94afb11c0`: all 91 steps, 87 browser suites, 4637 unit passes/4 skips. Report `/private/tmp/voo-inspector-controls-release-integrated.json`. Earlier Figma cold-reopen sampling ran before the imported document was ready (empty nodes and open guard on); the fixture now waits for the actual scene while retaining exact pixel assertions. This does not claim an application import fix. Browser concurrency alone was reduced to 2. Production revision `7e6a77a3d0836b7eecceeefddf3be3f94afb11c0` separately matches the build and passes actual Chinese Frame/typography controls and undo; evidence `/private/tmp/voo-inspector-controls-production-result.log` and `/private/tmp/voo-inspector-controls-deployment-proof.json`. Distinct integrated revisions do not inherit a historical complete run.

## Inspector large-radius follow-up

Existing capability `inspector.control-hierarchy`: the user chose the original
12px large control radius. Fields, dropdowns, segmented tracks/options and
commands share one scoped CSS variable. Outer panels, dimensions, typography,
fill/outline distinctions and existing commands remain unchanged.

Baseline `/private/tmp/voo-inspector-radius-before.log` reproduces 6px versus
12px. The existing inspector control browser helper verifies every control
category, actual commit/cancel, dropdown keyboard/focus, rotation/layout undo,
and 16 viewport/theme/locale contexts. Final revision `b965942e22bcfb408015acdba58f49d8d7c3cd8c`: all 91 release checks including 87 browser suites, 4637 unit passes/4 skips. Evidence `/private/tmp/voo-inspector-radius-release.json`. Production resources match the build; actual Chinese Frame and text controls, keyboard and undo pass without errors (`/private/tmp/voo-inspector-radius-production-result.log`). Physical devices and all advanced dialogs remain unverified.

<a id="claude-checklist-closeout"></a>
## Claude checklist closeout — 2026-11-01

The input report describes committed `78155ee` plus another, uncommitted main
workspace. This audit starts at clean `c85224c`; the local private tree is not
replaced by the clean public checkout. Execution and functional coverage remain
separate. No native, paid or physical-device context inherits a browser pass.

| Issue | Current finding and acceptance |
| --- | --- |
| A1 | Reproduced 19×2px target. Six separate midpoint clicks, unchanged other axis, one undo and keyboard now pass in `constraint-hit-targets`. |
| A2 | Actual 28px quickbar and 32px tabs reproduced. `mobile-control-targets` requires 48px ordinary navigation/tool/tab targets at 320/390/768 with mouse and touch contexts. Precision artwork controls are separate; no universal touch certification. |
| A3 | Current preset uses translated provider key. Both locales exist; first-run tests expect all configured providers, including DeepSeek API and Harness. No provider was silently removed. |
| A4 | `resize_document` already appears in the Canvas tools table; schema/document parity tests pass. |
| B1 | Prior test explicitly required the overlapping mobile drawer. Replaced with separate vertical geometry and usable heights; opening Browser still closes Agent, and reverse switching remains valid. |
| B2 | Single-column phone cards, visible independent corner actions, no hidden interception and scroll padding above fixed Settings. Real card midpoint and More, plus keyboard opening, are covered in `ui-home-settings`. |
| B3 | Committed composer keeps advanced controls behind its existing settings entry. The private redesign now also uses one advanced entry for eight types/style/system/candidates/size, retains automatic sizing and attachment IDs, and passes scoped real UI and unit checks. Its original dialogs are archived; unrelated drafts remain untouched. |
| B4 | Unit URL compatibility alone missed a deployed 404. Deployed a scoped legacy redirect and rollback-safe nginx provisioning; actual public redirects preserve the room and browser fragment, and no longer leak the private 8444 listener. The destination was intercepted before any room join. |
| B5 | Both named suites exist in current clean source. Module registration explicitly rejects missing files and duplicate ownership. In the private tree, only the two truly absent entries were removed; two other standalone suites were explicitly left unreviewed, never marked passed. |
| B6 | Existing comments slot/navigation and welcome inertness remain; run their current core regressions rather than reverting them. |
| C | All ten named scripts become self-starting; paths are temporary OS paths. No assertions are discarded to hide failures. See gate records below. |

Restored standalone suites: `agent_cancel_polish`, `agent_tools`,
`agent_pencil_tools`, `command_palette`, `design_tokens`, `multi_document_tabs`,
`qa3_roundtrip`, `roundtrip`, `html2nodes`, `ed04_pixel_consistency`.
Agent cancellation uses a deterministic provider stub, not a live endpoint.
File roundtrips compare every persisted field, canonicalizing only JSON-omitted
undefined values and absent/null `clipTo` references. Non-null masks and all
paint values still compare. GL retains its original max-channel-delta ≤3.
HTML retains its original <1% pixel mismatch gate.

The HTML pixel gate revealed an additional real defect: the letter-spacing
capability probe could leave 8px spacing active because restoring an empty
native getter is ignored. Native Canvas save/restore now protects the probe;
`text-spacing-probe.test.js` reproduces that browser contract. Typography pixel
mismatch falls from 2.617% to 0; the four other HTML fixtures remain under 1%.

Evidence while developing (not fixed-revision release certification):
`/private/tmp/voo-claude-constraints-before.log`,
`/private/tmp/voo-claude-mobile-before.log`,
`/private/tmp/voo-claude-checklist-baseline-unit.log`,
`/private/tmp/voo-claude-targeted-results.log`,
`/private/tmp/voo-claude-fifth-results.log`,
`/private/tmp/voo-claude-html-restored-probe.log`,
`/private/tmp/voo-claude-qa3-verified.log`.
Earlier failed development runs stay failed; only the final clean revision's
complete gate can certify integrated execution. The private generic `ui-audit`
and its screenshot baseline collection have not been adopted here: missing
baselines, skipped states and untested devices cannot count as passes.

Final acceptance on unchanged clean source `db4a184b9bd712dbff87982ecd75a4b6a88ac826`: all 103 registered
commands have a passing result, including 99 browser suites, 4717 unit passes
and 4 skips. Build and design lint (1432 files) pass. This is a same-revision
recovery, not one successful full-script invocation: startup/registration
failures remain in `voo-claude-checklist-release-complete.json` and the first
recovery receipt; `voo-claude-checklist-release-recovered-final.json` links the
immutable source-report hashes and passing results. The existing 1% HTML and
GL channel-delta thresholds were not relaxed. The earlier unrelated-height,
hidden-action and rotating-icon geometry failures remain in their original
reports. Loading layout now measures untransformed offsets while still checking
rotation, spacing and reduced motion. HTML uses the shared isolated-cache server.

Production is deployed through SSH la2. Index and 12 selected resources match
the build byte-for-byte; 83 actually loaded JS/CSS paths match SHA-256. Real
constraint midpoint/undo, phone Browser/editor separation, a 48px duplicate
action/undo, file-card midpoint and default advanced disclosure pass with no
page errors. The actual legacy redirect preserves the room and dummy fragment
without joining a room. Evidence: `/private/tmp/voo-claude-production-proof.json`
and `voo-claude-deployment-proof.json`. Nginx backup:
`/etc/nginx/voo-editor-sharing-backup-lJVyNn`; prior app backup:
`/srv/voo-run/editor-backups/db4a184b9bd712dbff87982ecd75a4b6a88ac826-20261101T014747Z`.
Initial production-probe assumptions (Escape-cleared selection and absent
versus explicit default constraints) were corrected in the probe, with original
logs retained; the application source did not change.

Private-workspace acceptance is deliberately partial: 120 related unit checks,
design lint (1427 files), ten restored suites after explicit startup retries,
and actual constraint/mobile/composer scenarios pass. Receipt:
`/private/tmp/voo-claude-primary-proof.json`. The 38 original draft snapshots
are hash-verified in
`/Volumes/TD/Projects/voo_design/.local-drafts/claude-checklist-2026-11-01.tar`.
This does not certify the entire dirty workspace or the private generic UI
audit/baseline collection. Native packages, physical devices, WebKit/IME, paid
services, live multi-peer networking and hardware performance remain unverified.
