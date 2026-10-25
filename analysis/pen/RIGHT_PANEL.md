# Pen.app 1.2.15 — Right-Hand Properties Panel: Functional Layout Spec

Scope: the desktop editor renderer (`/tmp/apps/pen/out/editor/assets/index.js`, 7.6 MB, byte offsets below are **file byte offsets** from `grep -b` / byte-accurate reads). Read-only analysis; no repo was modified.

FACT = directly evidenced in the bundle or schema. INFERENCE = my reading of code that I did not execute. UNKNOWN = not found in the available evidence.

---

## 1. Top-level structure and per-context order

### 1.1 The panel is conditional on selection

The panel component is `WBn` (defined at byte **6354800**). Its root return is:

```js
i.selectedNodesLength>0 && f.jsx(rrt,{isCollapsed:t, children: f.jsxs(MOn,{...})})
```

So **when nothing is selected the right panel does not exist at all** — there is no "page/canvas" property panel, no empty-state, no page settings section in this surface. (FACT, offset 6354800.)

Container `rrt` (byte 6353991) is a fixed-width island: `w-[221px]`, rounded, with a custom vertical scrollbar (`AOn`/`TOn`), collapsible to `absolute right-2 w-[221px]`. (FACT.)

Two substitutions happen before the node sections render:

| Condition | Result | Evidence |
|---|---|---|
| active tool `comment` and a comment manager exists | panel is replaced by the comment thread panel (`HBn`) | `qBn` at 6353901: `kpe()==="comment" && e!=null ? <rrt><HBn/></rrt> : <WBn/>` |
| active tool `scale` | panel body replaced by the **Scale** tool panel (`Wzn`); header still shows | `!t&&l==="scale"&&f.jsx(Wzn,...)` at 6355685 |
| selection is a path-editing state (`Xet()` is `instanceof Of`, the pen/path editor state) | body replaced by a **Vector** section only (`wBn`) | 6355813; `Of` class at 2196234 |

### 1.2 Section render order (single node / normal node panel)

From `WBn`'s child list (offsets are the call sites inside `WBn`), verbatim order:

| # | Component | Section title string (exact) | Offset | Gate |
|---|---|---|---|---|
| 0 | `aBn` | (no title; header) | 6355482 | always |
| 1 | `OOn` | `"Alignment"` | 6355898 | `!readonly` |
| 2 | `Uzn` | `"Position"` | 6355961 | always |
| 3 | `Dzn` | `"Layout"` / `"Flex Layout"` | 6356109 | always |
| 4 | `lDn` | `"Appearance"` | 6356654 | always |
| 5 | `mjn` | `"Fill"` | 6357007 | `showFills` |
| 6 | `iBn` | `"Stroke"` | 6357056 | `showStroke` |
| 7 | `bBn` | `"Typography"` | 6357258 | any selected node is `text` |
| 8 | `Tzn` | `"Icon"` | 6357574 | any selected node is `icon` |
| 9 | `Xzn` | `"Script"`(INFERENCE: script panel) | 6357716 | any selected node is `script` |
| 10 | `ADn` | `"Browser"` | 6357839 | any selected node is `browser` |
| 11 | `VDn` | `"Effects"` | 6357926 | always |
| 12 | `sBn` | `"Theme"` | 6357965 | always (renders only if document has themes) |
| 13 | `$zn` | `"Metadata"` | 6358004 | exactly 1 node with `metadata` |
| 14 | `DDn` | `"Code"` | 6358087 | `!onlyBrowserNodes` |
| 15 | `KDn` | `"Export"` | 6358154 | `!onlyBrowserNodes` |

Note: `"Appearance"` renders *before* fills; `"Theme"` sits between Effects and Metadata; **Code and Export are the last two sections** (Code before Export).

### 1.3 Per-context answers

Visibility is computed in the selector `rEe` (byte **6120482**), which walks `selectionManager.selectedNodes` and merges with `Xs()`/`"Mixed"` semantics.

| Context | Sections shown, in order |
|---|---|
| (a) nothing selected | **none** — panel unmounted (FACT 6354800) |
| (a′) page/canvas | UNKNOWN — no page section found in the panel module (grep `[Cc]onstraint`/`Page` finds nothing in 5.9–6.4 MB range) |
| (b) frame | header → Alignment → Position → **Layout** (direction/gap/padding/dimensions/fill-hug/resize/clip) → Appearance (opacity + corner radius) → Fill → Stroke → Effects → Theme → Metadata → Code → Export |
| (c) shape (rect/ellipse/polygon/path/line) | same as frame minus Layout's flex controls; Layout collapses to Dimensions/Fill/Hug; Appearance adds `"Ellipse"` (A/S/R) or `"Polygon"` (N) sub-blocks |
| (d) image | INFERENCE: Pen has **no image node type** (schema `Fill` has `type:"image"`; `rEe` lists `frame|rectangle|path|ellipse|text|line|polygon|icon` for fills). An image is a rectangle/frame with an image fill, so the surface is identical to (c) except the Fill row opens the image editor (`"Apply shader"`, `"Remove background"`, `"Vectorize image"`, `"Image path or URL"`, `"Import image file"`) |
| (e) text | header → Alignment → Position → Layout (Dimensions + `"Resizing"` auto width/height/fixed) → Appearance → Fill (text colour) → **Typography** → Effects → Theme → Metadata → Code → Export. Typography has **no** auto-size or truncate control (those live in Layout → `"Resizing"`) |
| (f) component/instance | Same node panel. Component ops are **in the header**, not a section: `"Create Component"`, `"Detach Component"`, `"Detach instance"`, `"Go to component"`, `"Make slot"`/`"Remove slot"`, plus a `"Slot"` section listing slot children (byte 6309333–6311100) |
| (g) multi-selection | header becomes `"<N> Selected"` (mono, 11 px); same section list, values show `"Mixed"`; sections show `"Mixed fills"` / `"Mixed effects"` / `"Mixed themes"`; Metadata hidden; Export button reads `"Export layers (N)"` |

FACT for gating thresholds (from `rEe`): fills are shown for `frame|rectangle|path|ellipse|text|line|polygon|icon`; stroke for `frame|rectangle|browser|path|ellipse|line|polygon`; corner radius for `frame|rectangle|browser`; flex controls initialise for `frame|group`; clip for `frame|script`; `onlyBrowserNodes` hides Code/Export when every selected node is a `browser`.

**Absent by design (FACT):** no Constraints section, no Prototype/prototype-interaction section, no component-properties/variants section, no export presets list, no Variables section in the panel. `grep -i constraint` over the panel module returns no hits. Variables are a separate panel reached from the left toolbar button whose tooltip is `"Variables"` (byte 6806376); its own UI has a table `Name | Value` + `"Add variable"` menu with `Color / Number / String / Boolean` (byte 6899512).

---

## 2. Section anatomy and control order

All sections share one shell: `Du` = `<div class="grid gap-1.5 py-2.5 pl-4 pr-3.5 border-t border-foreground/[0.06]">` (byte 5913974) and `Ja` = section title `<div class="text-xxs font-medium text-secondary-foreground">` (byte 5914109); subsection label `zp` = 9 px/70% (byte 5914222). A header with a trailing action is `flex items-center justify-between`.

### 2.1 Header (`aBn`, 6305777)

Single selection: `[name input (Qn, 11 px, type badge icon)] [Present (Cmd+Enter, VSCode only)] [collapse "Hide panel"]` → action row `[Make slot / Remove slot] ["Go to component"] ["Detach instance" (Cmd+Alt+X)] ["Detach Component"] ["Create Component"]` → `"Slot"` section → collapsible `"Context"` block with a textarea whose placeholder is `"Context information"` (byte 6311400).

Multi-selection: `[icon] "<N> Selected"` + collapse button only.

Collapse button: `Do` with `tooltip: t?"Show panel":"Hide panel"` (byte 6305649).

### 2.2 Alignment (`OOn`, 5914962)

Title `"Alignment"`, then two 3-button button-groups in one row: `[Align left, Align center, Align right]` + `[Align top, Align middle, Align bottom]` (arrays `IOn` 5914320, `ROn` 5914464). No distribute, no spacing controls (those live in Layout → Gap → `"Space Between"`/`"Space Around"`). Disabled when `availableActions.align` is false.

### 2.3 Position (`Uzn`, 6277380)

Title `"Position"` → grid 2-col: `X`, `Y`, `R` (suffix `°`, arrow-key step 15° when Shift) → a 3-button row `[Rotate 90° right] [Flip horizontal (Shift+H)] [Flip vertical (Shift+V)]` → if all parents have layout: checkbox `"Absolute Position"` (`layoutPosition: auto|absolute`).

No W/H here — size lives in Layout.

### 2.4 Layout (`Dzn`, 6263735)

Title is `"Flex Layout"` when `layoutMode ∈ {Horizontal, Vertical}`, otherwise `"Layout"`; header action toggles flex: tooltip `"Add flex layout"` (Shift+A) / `"Remove flex layout"` (Shift+Alt+A).

Order:
1. Direction segmented control (3 icon buttons, tooltips `"Freeform"`, `"Vertical"`, `"Horizontal"`) — only for `frame|group`.
2. If direction ≠ None:
   - `"Alignment"` — 3×3 anchor grid (`Bnt`), with space-between/around mode.
   - `"Gap"` — radio `childSpacing` numeric input (`K7e` icon), plus radios `"Space Between"`, `"Space Around"` (map to `layoutJustifyContent`).
   - `"Padding"` — label + `"Padding settings"` popover titled `"Padding Values"` with single/dual/quad radio modes; inputs padded L/T/R/B (grid order L,R,T,B).
3. `"Dimensions"` — `W`, `H` inputs (H disabled for `fixed-width` text).
4. `"Fill Width"` / `"Fill Height"` checkboxes (`horizontalSizing/verticalSizing = FillContainer`).
5. When a text node is selected and direction ≠ None: `"Hug Width"` / `"Hug Height"` checkboxes (`FitContent`).
6. When a text node is selected: `"Resizing"` 3-way segmented `"Auto width"` / `"Auto height"` / `"Fixed size"` (`textGrowth: auto|fixed-width|fixed-width-height`, `Ozn` at 6263557).
7. When `frame|script`: clip checkbox (`Lzn`, id `clip_content`).

No wrap toggle and no min/max width/height exist. (FACT: `grep -i wrap` in this component yields nothing.)

### 2.5 Appearance (`lDn`, 5953840)

Title `"Appearance"` → one row: `[opacity % input] [corner radius input]` in a 2-col grid, plus a `"Edit corners individually"` toggle that expands to four radius inputs in order top-left, top-right, bottom-right, bottom-left. Then `"Ellipse"` sub-block (`A` start angle, `S` sweep, `R` inner radius %) or `"Polygon"` sub-block (`N` count, 3–60). Subsection labels use `zp` (9 px, 70% opacity).

Corner radius only for `frame|rectangle|browser`; ellipse/polygon blocks only for the matching type.

### 2.6 Fill (`mjn` 6182160, list `Xtt` 6179621, row `pjn` 6177233, editor `ajn` 6172494)

- Header: `"Fill"` + `"+"` (`"Add fill"`). New fill default `{type:"color", enabled:true, color:"#d9d9d9ff"}` (empty list) else `#00000033`.
- Empty list: section renders header only. All-mixed: centred `"Mixed fills"` at 60% opacity.
- Rows are rendered **bottom-up** (`for(i=len-1;i>=0;i--)`), so the last fill edits on top; each row supports drag-reorder (`showGrip` when >1), hover remove (`"Remove"`), and click-to-edit in a **250 px left-side popover** (`w-[250px]`, `side:"left"`).
- Row composition: `[swatch+hex input (variables:"color") | non-color summary + "%" opacity input] … [Remove]`. Colour fills encode alpha in the hex; gradients/images get a separate `%` (`opacityPercent`).
- Editor header: 4 icon type buttons with tooltips `"Color"`, `"Gradient"`, `"Image"`, `"Shader"` (array `sjn` 6172159), `"Blend mode"` select (`Stt` 5980619), and an enable toggle.
- Blend modes (`LDn`, 5979700 area): Normal; Darken, Multiply, Color Burn, Linear Burn; Lighten, Screen, Color Dodge, Linear Dodge; Overlay, Soft Light, Hard Light; Difference, Exclusion; Hue, Saturation, Color, Luminosity.
- Gradient body: type select `Linear / Radial / Angular / Mesh` (6161230–6161317) + `"Stops"` section with `"Add color stop"` (6160233/6160269) and gradient geometry (rotation, centre, size).
- Image body: URL/file picker (`"Image path or URL"`, `"Import image file"`), fit mode (`"Stretch"`, `"Fill"`… → schema `mode: cover|contain|stretch`), actions `"Apply shader"`, `"Remove background"`, `"Vectorize image"`.
- Variables: colour inputs accept `variables:"color"`, i.e. a token picker is embedded in the numeric/colour input (`Qn`).

### 2.7 Stroke (`iBn`, 6298528)

Header `"Stroke"` + `"+"` (`"Add stroke"`, default `#000000ff`, subsequent `#00000033`; on first stroke Pen also sets `lineCap=Butt, lineJoin=Miter, strokeWidth=[1,1,1,1], strokeAlignment=Inside`).
Then: stroke paint list (same `Xtt` rows, property `strokeFills`) → row `"Position"` (`Center / Inside / Outside` → `strokeAlignment`) + `"Weight"` (`W` input, per-side array) + `"Edit sides individually"` button expanding to four side inputs → row `"Join"` (`Miter / Round / Bevel`) + `"Cap"` (`None / Round / Square`; enum is Butt/Round/Square, label for Butt is `"None"`). No arrowheads/markers.

### 2.8 Effects (`VDn`, 5998438; list `WDn` 5995214; row `qDn` 5993973)

Header `"Effects"` + add menu (`GDn` 5998000) with `"Drop Shadow"`, `"Inner Shadow"`, `"Layer Blur"`, `"Background Blur"` (display names from `cq`, 5989727). Layer/Background blur entries are **disabled once one exists** in the list (`Ntt`).
Rows: newest first, drag-reorder, click opens 250 px editor. Shadow editor: colour+alpha (`kT`), X/Y offset, blur radius, blend mode, spread; blur editor: radius only. All-mixed shows `"Mixed effects"`.

### 2.9 Typography (`bBn`, 6323379)

Title `"Typography"` → full-width **font family button** (shows family, or `"Mixed"`, or `"\"X\" font not found"` warning) opening a 60-unit font picker (searchable) + a font-variable binding button when string variables exist → 2-col: `[Weight/Style select] [Font size "S"]` → 2-col: `"Line height"` (%, `Auto` = 0, arrow step 10) + `"Letter spacing"` (px or %) → `grid-cols-7`: `"Horizontal"` align segmented (`Align Left / Align Center / Align Right / Justify`, col-span 4) and `"Vertical"` align (`Align Top / Align Middle / Align Bottom`, col-span 3).

No truncate, no text case, no decoration, no paragraph spacing. Weight list is derived from the font's available weights (`vBn`) with names from `dBn`: Thin / Extra Light / Light / Regular / Medium / Semi Bold / Bold / Extra Bold / Black / Heavy (+ `Italic` variants).

### 2.10 Icon (`Tzn`, 6257790)

Title `"Icon"` → icon-name picker button (`"Select icon..."`, scrollable glyph grid) → `"Font"` select (icon families, `Azn`) → weight select when the family exposes variable weights.

### 2.11 Theme (`sBn`, 6302590)

Renders only if the document has themes. Title `"Theme"` + `"Add theme"` menu (existing themes not already applied) + applied theme rows with remove. All-mixed: `"Mixed themes"`.

### 2.12 Metadata (`$zn`, 6276798)

Title `"Metadata"` + `"Remove metadata"` trash; body is a read-only key/value display (`Bzn`). Single selection only.

### 2.13 Code (`DDn`, 5975520)

Title `"Code"` + `"Code export settings"` popover (`"Export Settings"`: asset mode, `"Include HTML scaffold"`, `"Center <body> contents"`, `"Ask user where to export the file"`, `"Open in Browser after Export"`, `"Include layer names"`, `"Include layer IDs"`). Body: code-format select, then `[Copy HTML (Cmd+Alt+C)] [Export HTML]`, then `"Import Web via Browser"` (opens `"Import from Browser"` dialog).

### 2.14 Export (`KDn`, 5999994)

Title `"Export"` → 2-col `[scale select] [format select]`: PNG/JPEG/WEBP scale `1x/2x/3x`; PDF fixed `1x`. Formats `PNG`, `JPEG`, `WEBP`, `PDF`. If the format has qualities: row `"Quality"` (`High/Medium/Low` for JPEG; `Lossless/Medium/Low` for WEBP). For PDF a note: `"Layers will be exported as pages in a single PDF. Pages are sorted in the order they were selected."` Then the primary button `"Export layer"` / `"Export layers (N)"`. Settings persist in `localStorage` (`export-scale`, `export-type`, `export-quality`). Only **one** export configuration exists — no multi-preset list.

---

## 3. Interaction patterns worth mirroring

| Pattern | Evidence |
|---|---|
| Section = header row + body; sections are separated by a top hairline and 2.5 vertical padding | `Du`, `Ja`, `zp` at 5913974 / 5914109 / 5914222 |
| Collapsible *panel* (not per-section): one chevron in the header collapses the whole island to an absolute floating panel | `rrt` 6353991, `jEe` 6305649 |
| Paint/effect lists: `"+"` in section header; rows bottom-up; drag grip only when >1; delete on hover; click row → side popover editor | 6179621, 6177233, 5995214 |
| Color row = swatch button + editable hex + inline variable binding (purple token state when bound) | `Qn` `variables:"color"`, `pjn` |
| Numeric rows = `icon + letter badge` (X/Y/W/H/S/R/%) with arrow-key nudge and Shift-step; `"Mixed"` placeholder for heterogeneous selection | `Qn`, `Us`, `Xs` |
| Multi-select = union of sections, `"Mixed"` values, indeterminate checkboxes for tri-state | `rEe` 6120482 |
| Add-property menus are simple `+` icon-buttons with tooltips, not menus with search; effect/add-theme use dropdowns | `GDn`, `sBn` |
| Tool panels replace the node panel rather than docking next to it (Scale tool, Comment tool) | `qBn`/`Wzn` 6353901, 6355685 |
| Variables live in a separate resizable panel with a table + `"Add variable"` type menu — the right panel only *consumes* variables via inline binding | 6899512 |

---

## 4. Keyboard/accelerator effects on the panel (FACT, from tooltip `shortcut` props)

| Shortcut | Action | Offset |
|---|---|---|
| `Shift+A` | Add flex layout | 6267570 (`shortcut:[wt.shiftKey,"A"]`) |
| `Shift+Alt+A` | Remove flex layout | 6267570 |
| `Shift+H` | Flip horizontal | 6279400 |
| `Shift+V` | Flip vertical | 6279599 |
| `Cmd+Alt+X` | Detach instance | 6309943 |
| `Cmd+Enter` | Present (VSCode only) | 6309057 |
| `Cmd+Alt+C` | Copy HTML | `ODn=[wt.cmdKey,wt.altKey,"C"]` (5975490) |
| `Shift+?` | Keyboard shortcuts modal | 6806968 |

Arrow keys inside a focused numeric field nudge by step (Shift = ×multiplier), and Shift snaps rotation to 15°. There is no keyboard shortcut to collapse the panel (button only).

---

## 5. Layout blueprint for reimplementation

Ordered section list per context, and per-row control order:

```
RIGHT PANEL (221 px, scrolls, one collapsible island)
├─ [no selection] → render nothing
├─ [comment tool] → comment thread panel
├─ [scale tool]   → header + Scale panel
└─ [node selection]
   HEADER   name · type badge · present · collapse
            ├ single: component actions row · Slot section · Context (collapsible)
            └ multi:  "N Selected"
   ALIGNMENT      [left|center|right] [top|middle|bottom]                (readonly hidden)
   POSITION       X Y R° · [rot90|flipH|flipV] · ☐ Absolute Position
   LAYOUT         title(+add/remove flex)
                  [freeform|vertical|horizontal]
                  if flex: Alignment(3×3) · Gap(number, space-between, space-around)
                           Padding(L,T,R,B + single/dual/quad menu)
                  Dimensions W H
                  ☐ Fill Width ☐ Fill Height
                  (text) ☐ Hug Width ☐ Hug Height
                  (text) [auto width|auto height|fixed size]
                  (frame/script) ☐ Clip content
   APPEARANCE     opacity% · radius (→ 4 corners) · [Ellipse A/S/R | Polygon N]
   FILL           title(+) · rows(bottom-up: swatch+hex | summary+% ; hover ✕)
                  editor popover: [Color|Gradient|Image|Shader] · blend · enabled
                                  → colour picker | gradient(type+stops+geometry) |
                                    image(url,fit,shader/bg-removal/vectorize) | shader
   STROKE         title(+) · paint rows · Position(center/in/out) · Weight(+per-side)
                  · Join(miter/round/bevel) · Cap(none/round/square)
   TYPOGRAPHY     font family(+variable) · weight/style · size
                  · line-height% · letter-spacing · horizontal(4) · vertical(3)
   ICON           glyph picker · font family · weight
   SCRIPT         (script-specific)
   BROWSER        url · device · zoom
   EFFECTS        title(+) · rows(newest first) → shadow(build) | blur(radius)
   THEME          title(+) · applied themes
   METADATA       key/values + remove           (single selection only)
   CODE           format · Copy HTML · Export HTML · Import Web via Browser
   EXPORT         scale(1x/2x/3x) · format(PNG/JPEG/WEBP/PDF) · quality · Export(N)
```

Implementation notes: one shared numeric/colour input primitive covers number, percent, hex, variable-bound, and mixed states (`Qn`, and `kT` for colour+alpha); one shared paint-list covers fill and stroke; editors are side popovers (250 px) rather than inline expansion, which keeps the 221 px column narrow.

---

## 6. Reproduction

All commands run from `/tmp/apps/pen/out/editor/assets`. Offsets are byte offsets.

```bash
# 1. Section title inventory (Ja is the section-header component)
grep -o -b 'Ja,{title:[^}]*}' index.js

# 2. Locate the panel composition component and its render order
grep -o -b 'function WBn(' index.js                       # 6354800
python3 -c "d=open('index.js','rb').read();print(d[6354800:6358500].decode('utf-8','replace'))"

# 3. Per-context visibility rules (the state selector)
grep -o -b 'function rEe(' index.js                       # 6120482
python3 -c "d=open('index.js','rb').read();print(d[6120482:6130500].decode('utf-8','replace'))"

# 4. Section components
grep -o -b 'const OOn=\|const Uzn=\|function Dzn(\|const lDn=\|const mjn=\|const iBn=\|bBn=ft.memo\|function Tzn(\|const Xzn=\|const ADn=\|const VDn=\|function sBn(\|const \$zn=\|const DDn=\|const KDn=' index.js

# 5. Fill list / row / editor
grep -o -b 'Xtt({fills\|pjn={fills\|const ajn=\|const sjn=' index.js
grep -o -b 'Add fill\|Add stroke\|Add effect\|Remove\|Blend mode' index.js

# 6. Effects names and menu
grep -o -b 'function cq(\|const Ttt=' index.js
echo 'Drop Shadow Inner Shadow Layer Blur Background Blur'   # 5989727

# 7. Stroke enums (join/cap labels)
grep -o -b 'eBn=\[{\|tBn=\[{\|Edit sides individually\|Weight\|Position' index.js

# 8. Typography align labels
grep -o -b 'mBn=\[{\|gBn=\[{\|Line height\|Letter spacing' index.js

# 9. Export formats/qualities and button label
grep -o -b 's4={\|Export layer\|Quality\|Layers will be exported as pages' index.js

# 10. Absence checks (no constraints / no prototype / no page section)
grep -o -b -i 'constraint' index.js | awk -F: '$1>5900000 && $1<6400000'   # (no output)
grep -o -b 'Prototype' index.js | awk -F: '$1>6120000 && $1<6400000'       # (no hits in panel module)

# 11. Variables panel entry + table
grep -o -b '"Variables"' index.js                          # 6806376
grep -o -b '"Add variable"' index.js                       # 6899512

# 12. Panel container + tool substitution
grep -o -b 'w-\[221px\]\|kpe()==="comment"\|l==="scale"' index.js

# 13. Schema cross-reference
grep -n 'textGrowth\|horizontalSizing\|SizingBehavior\|strokeAlignment\|strokeLinejoin\|BlendMode\|type: "image"\|type: "shader"\|layoutPosition\|Effect =' \
  /tmp/apps/pen/out/skills/pen-dev/pen-schema.md
```

### Evidence integrity note

The REA graphs (`/tmp/rea_evidence/pen/analyze-index-renderer.json`, 197 MB) were not parsed: every claim above is directly greppable in the shipped bundle, which is stronger evidence than a derived graph, and the 197 MB parse would have exceeded the time-box. Two claims are explicitly INFERENCE (image-as-fill; Script panel body) and one is UNKNOWN (page/canvas properties surface).
