#!/usr/bin/env python3
"""Render analysis/figma/FEATURES.md from features.jsonl (grouped by area)."""
import json
import os
from collections import OrderedDict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)

AREA_ORDER = ["file", "canvas", "tools", "selection", "vector", "text", "layout",
              "components", "variables", "styles", "effects", "masks", "image",
              "motion", "prototyping", "presentation", "slides", "export", "import",
              "ai", "agent", "collaboration", "comments", "devmode", "plugins",
              "shortcuts", "settings", "onboarding", "performance", "accessibility",
              "i18n", "storage"]

BLURB = {
    "file": "Cloud files, the file browser, version history, branching, the desktop tab model and the desktop update/error shell around the web editor.",
    "canvas": "The infinite canvas itself plus panels that are canvas-adjacent (pages, guides, quick actions, FigJam whiteboard).",
    "tools": "Toolbelt: move/scale, frame, shapes, pen/vector, brush, text, comment, and the Design/Draw/Dev Mode switch.",
    "selection": "Selection-level operations: align/distribute, aspect-ratio lock, constraints, select-same.",
    "vector": "Vector network editing, live booleans, flatten/outline, text on a path and transform modifiers.",
    "text": "Type panel and typography features (OpenType, RTL, lists, fonts, text styles).",
    "layout": "Auto layout/stacks, grids, wrap and sizing, plus the AI 'suggest auto layout' helpers.",
    "components": "Components, instances, variants/component properties, slots, libraries and overrides.",
    "variables": "Design variables: collections, modes, scopes/code syntax and variable binding UI.",
    "styles": "Paint/text/effect/grid styles, libraries, publishing and UI-kit presets.",
    "effects": "Shadows, blur and shader effects.",
    "masks": "Mask layers and mask types (alpha, luminance, vector outlines).",
    "image": "Placing/cropping media plus the AI image tools (edit, expand, background removal, generate).",
    "motion": "Figma Motion: the keyframe timeline, presets, audio; smart animate is counted here as the animation bridge from prototypes.",
    "prototyping": "Prototype interactions, transitions/easing, overlays/scroll, flows and presentation.",
    "presentation": "Presenter spotlight/recordings (present mode detail lives under prototyping/slides).",
    "slides": "Figma Slides: carousel, outline, speaker notes, charts, slide animation and PDF export.",
    "export": "Export panel, formats, copy-as, batch/all-frames PDF and the desktop PDF menu item.",
    "import": "Sketch import, CSV import, SVG/PDF imports and local .fig opening.",
    "ai": "Figma AI/Make surfaces: Make, Make Local, canvas assistant, content fill, text rewrite/translate, linter, FigSpec and MCP connectors.",
    "agent": "The agent layer: the Figma agent, the Dev Mode MCP server shipped inside the desktop app, MCP client management and proxy support.",
    "collaboration": "Multiplayer editing, follow/observe, cursor chat, voice, notifications, branch reviews, sharing and the activity log.",
    "comments": "Comment pins, threads, unread state and mute/notification behaviour.",
    "devmode": "Dev Mode inspect panel, codegen, Code Connect, annotations, dev resources, platform units and MCP/VS Code setup.",
    "plugins": "Plugins, FigJam widgets and the Figma Community.",
    "shortcuts": "Shortcut reference/customization and native desktop accelerators.",
    "settings": "Desktop preferences: interface scale, color management, haptics/tray and localization.",
    "onboarding": "New-user experience and the desktop Home tab.",
    "performance": "Performance HUD/memory instrumentation exposed by the editor.",
    "accessibility": "Screen-reader announcements, contrast checks and accessible Slides/Sites content.",
    "i18n": "Editor localization surface.",
    "storage": "Local storage/cache surfaces (documented for method completeness).",
}

METHOD = """## How this inventory was produced (and how strong each row is)

Two thirds of the rows below are backed by **static artifacts recovered from the user's
own Figma install**, not by reading documentation:

1. **Desktop shell (static, strongest).** `rea analyze-javascript-application` over the
   pre-extracted asar (`/tmp/apps/figma`, Figma Desktop 126.9.13) reconstructed the Electron
   boundary (4 browser windows, 75 exposed API members, 34 IPC channels/23 handlers) and we
   grepped the same files for menu accelerators, i18n keys (328 shell keys × 7 locales) and
   the ~60-entry desktop bridge capability list.
2. **Editor web app (static, recovered).** Figma's editor is a remote web app; it is not in
   the asar. We recovered it non-destructively from the **Chromium simple cache** of the
   user's Figma profile (read-only scan, bodies decompressed with brotli) — 1,182 decoded
   responses including the main `figma_app` JS (8.3 MB), the English editor i18n bundle
   (33,116 UI strings / 451 namespaces), the prototype viewer, the import worker and the
   canvas WASM. `rea analyze-javascript-application` was then run over the recovered
   `figma_app.js` as well. No Figma process was restarted, killed or reconfigured.
3. **Public docs (supplementary, `strength: "docs"`).** Used only for naming/launch context
   where the recovered strings are ambiguous (Figma Motion docs).

Each row in `features.jsonl` carries a concrete pointer: an i18n key, a namespace name with
its key count, a JS token with occurrence count, an IPC/bridge capability id, or a URL.
Rows flagged `user_visible: false` are debug/internal surfaces that exist in the build but
are not part of the normal product UX.
"""


def main():
    rows = [json.loads(l) for l in open(os.path.join(BASE, "features.jsonl"))]
    groups = OrderedDict((a, []) for a in AREA_ORDER)
    for r in rows:
        groups.setdefault(r["area"], []).append(r)
    counts = Counter(r["area"] for r in rows)
    out = ["# Figma — recovered feature inventory (static + docs)\n",
           METHOD,
           "\n## Coverage summary\n",
           f"Total inventoried capabilities: **{len(rows)}** across **{len([a for a in groups if groups[a]])} areas**.\n",
           "| area | rows |", "|---|---|"]
    for area in AREA_ORDER:
        if groups.get(area):
            out.append(f"| `{area}` | {counts[area]} |")
    out.append("")
    for area in AREA_ORDER:
        if not groups.get(area):
            continue
        out.append(f"\n## {area}\n")
        if area in BLURB:
            out.append(BLURB[area] + "\n")
        for r in sorted(groups[area], key=lambda x: (x["priority_guess"], x["id"])):
            loc = r["evidence"][0]["locator"] if r["evidence"] else "no locator"
            strength = r["evidence"][0]["strength"] if r["evidence"] else "?"
            notes = f" — {r['notes']}" if r["notes"] else ""
            out.append(f"- **{r['name']}** (`{r['id']}`, {r['priority_guess']}, {strength}): "
                       f"{r['description']} Evidence: `{loc[:200]}`.{notes}")
    out.append("""
## Products found in the recovered editor (beyond "Figma Design")

The recovered i18n/JS surface shows Figma is now a suite. These product surfaces are
registered inside the same editor bundle and are represented in `features.jsonl`:

- **Figma Design** — the core editor (canvas, layout, components, variables, prototyping).
- **Figma Make** (`figmake`, 2,460 strings) — prompt-to-prototype/app, plus **Make Local**
  (`make_local`, 577 strings) for running Make projects in a local working directory with a
  browser preview + code components (desktop bridge `makeLocalBrowserPreview:*`).
- **Figma Sites** (`sites`, 1,285 strings) — responsive site building with breakpoints, CMS,
  code components, a lint pass and semantic-HTML accessibility tags.
- **Figma Slides** (`slides`, 605 strings) — slide editor, speaker notes, charts, PDF export.
- **Figma Buzz** (`buzz`/`cooper`, ~600 strings) — marketing/brand asset production with an
  approvals workflow; "Send to Figma Buzz" from Design.
- **Figma Draw** — illustration-oriented mode/editor (Design ↔ Draw switch).
- **FigJam** (`whiteboard`, 1,081 strings) — whiteboard, widgets, stamps/tables.
- **Figma Motion** (`motion`, 465 strings) — keyframe timeline, animation presets, audio clips.
- **Figma agent / FigSpec / Weave** — AI agent chat, technical-spec drafting from
  Figma/GitHub/Jira/Slack connectors, and org-managed AI models.
- **Dev Mode MCP server** — shipped inside the desktop app (`lazy/external/codegen_mcp_server.js`,
  canonical docs `https://developers.figma.com/docs/figma-mcp-server/`).

Caveat: the i18n bundle is present in the cache regardless of the user's plan/entitlements;
a product surface being listed means the code ships, not that this user has access to it.
""")
    dest = os.path.join(BASE, "FEATURES.md")
    open(dest, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"wrote {dest} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
