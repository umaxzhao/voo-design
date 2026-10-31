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
