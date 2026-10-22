#!/usr/bin/env python3
"""Merge the three analyst inventories into one canonical feature matrix.

Input : analysis/{pen,figma,voo}/features.jsonl
Output: analysis/FEATURE_MATRIX.json  (canonical rows + per-source evidence)
        analysis/FEATURE_MATRIX.md    (human table, grouped by area)

Matching strategy (deterministic, inspectable):
 1. Normalise name -> tokens; strip generic words (and, of, the, mode, tool...).
 2. Group rows by area; within an area, merge rows whose token Jaccard >= 0.5
    or whose id matches exactly. Rows that do not merge stay separate.
 3. Verdict per canonical row:
      parity          -> pen and/or figma present AND voo implemented
      gap             -> (pen or figma present) AND voo missing_expected/unknown
      partial_gap     -> (pen or figma present) AND voo partial
      differentiator  -> voo implemented and neither pen nor figma has it
      voo_only_gap    -> voo missing_expected but no external reference
"""
import json, re, itertools, collections, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STOP = set("and of the a an to in on with for tool tools mode modes system support".split())

def load(name):
    path = os.path.join(ROOT, name, "features.jsonl")
    rows = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows

def toks(text):
    return {t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if t and t not in STOP}

def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)

def key_of(row):
    return (row.get("area"), tuple(sorted(toks(row.get("name")))))

def merge_source(rows, source):
    """collapse duplicate rows within one source (same area + similar name)"""
    out = []
    for row in rows:
        r = dict(row); r["_source"] = source
        r["_tok"] = toks(row.get("name"))
        hit = None
        for prev in out:
            if prev["area"] == r["area"] and jaccard(prev["_tok"], r["_tok"]) >= 0.6:
                hit = prev; break
        if hit is None:
            out.append(r)
        else:
            # keep the higher priority / richer description
            if (r.get("priority_guess") or "P9") < (hit.get("priority_guess") or "P9"):
                hit["priority_guess"] = r.get("priority_guess")
            if len(r.get("description") or "") > len(hit.get("description") or ""):
                hit["description"] = r.get("description")
            hit.setdefault("_also", []).append(r.get("name"))
    return out

PRI = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}

def verdict(voo_status, pen_present, figma_present):
    ext = pen_present or figma_present
    if voo_status == "implemented":
        return "differentiator" if not ext else "parity"
    if voo_status == "partial":
        return "partial_gap"
    return "gap" if ext else "voo_gap"

def main():
    sources = {s: merge_source(load(s), s) for s in ("pen", "figma", "voo")}
    canon = []
    for row in sources["pen"] + sources["figma"]:
        row = dict(row)
        hit = None
        for c in canon:
            if c["area"] == row["area"] and jaccard(c["_tok"], row["_tok"]) >= 0.55:
                hit = c; break
        if hit is None:
            canon.append({**row, "sources": {row["_source"]: row}})
        else:
            hit["sources"][row["_source"]] = row
            if (row.get("priority_guess") or "P9") < (hit.get("priority_guess") or "P9"):
                hit["priority_guess"] = row.get("priority_guess")
            hit["_tok"] = hit["_tok"] | row["_tok"]

    # attach voo evidence
    for c in canon:
        area = c["area"]
        best = None; best_score = 0.0
        for v in sources["voo"]:
            if v["area"] != area:
                continue
            score = jaccard(c["_tok"], v["_tok"])
            if score > best_score:
                best, best_score = v, score
        c["voo"] = best if best_score >= 0.42 else None

    # voo-only rows
    matched_voo = {id(c["voo"]) for c in canon if c["voo"]}
    for v in sources["voo"]:
        if id(v) not in matched_voo:
            canon.append({
                "id": v.get("id"), "area": v["area"], "name": v.get("name"),
                "description": v.get("description"),
                "priority_guess": v.get("priority_guess"),
                "_tok": v["_tok"], "sources": {}, "voo": v,
            })

    out_rows = []
    for c in canon:
        pen = c["sources"].get("pen")
        figma = c["sources"].get("figma")
        voo = c["voo"]
        voo_status = (voo or {}).get("status", "missing_expected") if voo else "missing_expected"
        v = verdict(voo_status, bool(pen), bool(figma))
        prios = [p for p in [(pen or {}).get("priority_guess"), (figma or {}).get("priority_guess")] if p]
        pri = min(prios, key=lambda p: PRI.get(p, 9)) if prios else (voo or {}).get("priority_guess", "P2")
        if v in ("gap", "partial_gap") and pri == "P0" and voo_status != "partial":
            pass
        out_rows.append({
            "id": (pen or figma or voo).get("id"),
            "area": c["area"],
            "name": (pen or figma or voo).get("name"),
            "description": (pen or figma or voo).get("description"),
            "pen": "present" if pen else "absent",
            "figma": "present" if figma else "absent",
            "voo": voo_status,
            "verdict": v,
            "priority": pri,
            "evidence": {
                "pen": [{"file": e.get("file"), "locator": e.get("locator"), "strength": e.get("strength")} for e in (pen or {}).get("evidence", [])][:3],
                "figma": [{"file": e.get("file"), "locator": e.get("locator"), "strength": e.get("strength")} for e in (figma or {}).get("evidence", [])][:3],
                "voo": (voo or {}).get("repo_evidence", [])[:3],
            },
            "notes": (voo or {}).get("completeness_note") or (pen or {}).get("notes") or (figma or {}).get("notes"),
            "also": (pen or {}).get("_also") or (figma or {}).get("_also") or None,
        })

    order = {a: i for i, a in enumerate([
        "file", "storage", "canvas", "tools", "selection", "vector", "text", "layout",
        "components", "variables", "styles", "effects", "masks", "image", "motion",
        "prototyping", "presentation", "slides", "export", "import", "ai", "agent",
        "collaboration", "comments", "devmode", "plugins", "performance", "shortcuts",
        "settings", "onboarding", "accessibility", "i18n",
    ])}
    out_rows.sort(key=lambda r: (order.get(r["area"], 99), PRI.get(r["priority"], 9), r["name"] or ""))

    summary = collections.Counter(r["verdict"] for r in out_rows)
    doc = {
        "generated_from": ["analysis/pen/features.jsonl", "analysis/figma/features.jsonl", "analysis/voo/features.jsonl"],
        "counts": {"total": len(out_rows), **summary},
        "rows": out_rows,
    }
    with open(os.path.join(ROOT, "FEATURE_MATRIX.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
    print(json.dumps(doc["counts"], indent=1))

    # markdown
    lines = ["# VOO Design — canonical feature matrix", "",
             "Generated by `analysis/tools/merge_matrix.py` from the three `features.jsonl` inventories.",
             "`pen`/`figma` = present in that reference app; `voo` = implemented / partial / missing_expected.",
             "", f"Totals: {json.dumps(doc['counts'])}", ""]
    cur = None
    for r in out_rows:
        if r["area"] != cur:
            cur = r["area"]
            lines += ["", f"## {cur}", "",
                      "| Feature | Pen | Figma | VOO | Verdict | Pri |",
                      "|---|---|---|---|---|---|"]
        lines.append(f"| {r['name']} | {r['pen']} | {r['figma']} | {r['voo']} | {r['verdict']} | {r['priority']} |")
    with open(os.path.join(ROOT, "FEATURE_MATRIX.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

if __name__ == "__main__":
    main()
