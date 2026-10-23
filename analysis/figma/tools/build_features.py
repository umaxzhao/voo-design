#!/usr/bin/env python3
"""Build analysis/figma/features.jsonl from verified evidence pointers.

Evidence model (see analysis/README.md): source "figma", strength "static" for
recovered shell/cache files, "docs" for public URLs. Commands for each source are
recorded in analysis/figma/rea/COMMANDS.md.

Pointer kinds (verified at build time; unresolved -> build fails):
  ed:<key>          exact key in the recovered editor English i18n bundle
  edns:<prefix>     namespace present in the editor i18n bundle (key count recorded)
  sh:<key>          exact key in the desktop shell i18n (de.json; identical key set in 7 locales)
  shmain:<text>     literal present in /tmp/apps/figma/main.js
  shbind:<text>     literal in web_app_binding_renderer.js (desktop bridge capability list)
  shml:<text>       literal in make_local/make_local_browser_preview_preload.js
  shmcp:<text>      literal in lazy/external/codegen_mcp_server.js
  edjs:<text>       literal/code token present in the recovered figma_app JS bundle
  proto:<text>      literal in the recovered prototype_app JS bundle
  build:<text>      literal in build.json
  docs:<url>        public documentation URL (strength docs)
"""
import json
import os
import sys

WEB = "/tmp/figma_web"
SHELL = "/tmp/apps/figma"
EDITOR_I18N = "figma_app-61e97149e8b9c012.min.en.json.br"
EDITOR_JS = "figma_app-ce44270e1f795160.min.js.br"
PROTO_JS = "prototype_app-2782359aaccef92f.min.js.br"
MCP = "lazy/external/codegen_mcp_server.js"
BIND = "web_app_binding_renderer.js"
SHML = "make_local/make_local_browser_preview_preload.js"

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from feature_rows import ROWS  # noqa: E402

with open(os.path.join(WEB, EDITOR_I18N), encoding="utf-8") as fh:
    ED = json.load(fh)
with open(os.path.join(SHELL, "i18n/de.json"), encoding="utf-8") as fh:
    SH = json.load(fh)
SHELL_MAIN = open(os.path.join(SHELL, "main.js"), encoding="utf-8", errors="replace").read()
SHELL_BIND = open(os.path.join(SHELL, BIND), encoding="utf-8", errors="replace").read()
SHELL_ML = open(os.path.join(SHELL, SHML), encoding="utf-8", errors="replace").read()
SHELL_MCP = open(os.path.join(SHELL, MCP), encoding="utf-8", errors="replace").read()
SHELL_BUILD = open(os.path.join(SHELL, "build.json"), encoding="utf-8", errors="replace").read()
EDITOR_JS_TXT = open(os.path.join(WEB, EDITOR_JS), encoding="utf-8", errors="replace").read()
PROTO_TXT = open(os.path.join(WEB, PROTO_JS), encoding="utf-8", errors="replace").read()

problems = []
CACHE_CMD = "extract Figma Desktop cache -> /tmp/figma_web (COMMANDS.md §3); i18n lookup (§4)"
SHELL_CMD = "rea analyze-javascript-application /tmp/apps/figma --artifact-format directory (§1) + grep (§6)"
JS_CMD = "grep token in recovered editor bundle (COMMANDS.md §5)"


def ev(kind_value):
    kind, value = kind_value.split(":", 1) if ":" in kind_value else (kind_value, "")
    if kind == "ed":
        if value not in ED:
            problems.append(kind_value)
            return None
        s = ED[value].get("string", "") if isinstance(ED[value], dict) else str(ED[value])
        return {"source": "figma", "strength": "static", "file": EDITOR_I18N,
                "locator": f'i18n key: {value} = "{s[:160]}"', "command": CACHE_CMD}
    if kind == "edns":
        n = sum(1 for k in ED if k.startswith(value))
        if not n:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": EDITOR_I18N,
                "locator": f"namespace {value}* ({n} keys)", "command": CACHE_CMD}
    if kind == "sh":
        if value not in SH:
            problems.append(kind_value)
            return None
        s = SH[value].get("string", "") if isinstance(SH[value], dict) else str(SH[value])
        return {"source": "figma", "strength": "static", "file": "i18n/de.json",
                "locator": f'i18n key: {value} = "{s[:160]}" (locale de; same key set in all locales)',
                "command": SHELL_CMD}
    if kind == "shmain":
        if value not in SHELL_MAIN:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": "main.js",
                "locator": f"string: {value[:140]}", "command": SHELL_CMD}
    if kind == "shbind":
        if value not in SHELL_BIND:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": BIND,
                "locator": f"desktop bridge capability: {value}", "command": SHELL_CMD}
    if kind == "shml":
        if value not in SHELL_ML:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": SHML,
                "locator": f"preload bridge API: {value}", "command": SHELL_CMD}
    if kind == "shmcp":
        if value not in SHELL_MCP:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": MCP,
                "locator": f"string: {value[:140]}", "command": SHELL_CMD}
    if kind == "build":
        if value not in SHELL_BUILD:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": "build.json",
                "locator": f"string: {value}", "command": "cat /tmp/apps/figma/build.json (§1)"}
    if kind == "edjs":
        if value not in EDITOR_JS_TXT:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": EDITOR_JS,
                "locator": f'JS token "{value}" ({EDITOR_JS_TXT.count(value)} occurrence(s))',
                "command": JS_CMD}
    if kind == "proto":
        if value not in PROTO_TXT:
            problems.append(kind_value)
            return None
        return {"source": "figma", "strength": "static", "file": PROTO_JS,
                "locator": f'JS token "{value}"', "command": JS_CMD}
    if kind == "docs":
        return {"source": "figma", "strength": "docs", "file": value,
                "locator": "public documentation / announcement", "command": "web_search (cited URL)"}
    problems.append(kind_value)
    return None


def main():
    out, used = [], set()
    for (rid, area, name, desc, visible, prio, evs, notes) in ROWS:
        if rid in used:
            raise SystemExit(f"duplicate id {rid}")
        used.add(rid)
        evidence = [e for e in (ev(x) for x in evs) if e]
        if not evidence:
            print(f"!! row {rid} has no verified evidence", file=sys.stderr)
            continue
        out.append({"id": rid, "area": area, "name": name, "description": desc,
                    "user_visible": visible, "priority_guess": prio,
                    "evidence": evidence, "notes": notes})
    dest = os.path.join(os.path.dirname(HERE), "features.jsonl")
    with open(dest, "w", encoding="utf-8") as fh:
        for row in out:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    areas = {}
    for row in out:
        areas[row["area"]] = areas.get(row["area"], 0) + 1
    print(f"wrote {len(out)} rows -> {dest}")
    print("by area:", json.dumps(areas, indent=1, sort_keys=True))
    if problems:
        print("UNRESOLVED EVIDENCE POINTERS:", len(problems), file=sys.stderr)
        for p in problems:
            print("  ", p, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
