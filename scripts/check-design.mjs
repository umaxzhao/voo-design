#!/usr/bin/env node
/**
 * The visual-language gate — enforces `Design.md` across every agent.
 *
 * This repo is written by several different agents (Claude Code, Codex,
 * Antigravity, DeepSeek), and each reads a different instructions file, or
 * none at all. A rule that lives only in prose reaches whoever happened to
 * load that prose. This script reaches all of them, because they all run
 * commands and they all commit through the same hook.
 *
 * The output format is the actual teaching surface: every finding states the
 * correct replacement, not just the offence. An agent that has never opened
 * Design.md still learns the rule from this output — which is the point.
 *
 * Usage:
 *   node scripts/check-design.mjs               # whole tree
 *   node scripts/check-design.mjs --staged      # staged content only (hook)
 *   node scripts/check-design.mjs src/foo.jsx   # specific paths
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { relative, join, resolve } from "node:path";
import { readFileSync, globSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createLinter, lintCode, LABEL, RULE_ID } = require("../design/lint.cjs");
const { scanCss } = require("../design/scan_css.cjs");

// `fileURLToPath`, not `new URL(...).pathname`: on Windows the latter keeps a
// leading slash (`/C:/…`), which ESLint resolved into `C:\C:\…` and the gate
// could not find a single file to judge.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "Design.md";

const eslint = createLinter(ROOT);

export async function runDesignSelfTest() {
  const tests = [
    {
      name: "Catches emoji in JSX text",
      code: "export function Bad() { return <div>Hello 😀</div>; }",
      css: false,
      assert: (findings) => findings.some((f) => f.label === "emoji"),
    },
    {
      name: "Catches prohibited gradient in className",
      code: "export function Bad() { return <div className=\"bg-gradient-to-r from-red-500\" />; }",
      css: false,
      assert: (findings) => findings.some((f) => f.label === "flat"),
    },
    {
      name: "Catches prohibited CSS property in stylesheet",
      code: ".bad { box-shadow: inset 0 2px 4px black; }",
      css: true,
      assert: (findings) => findings.length > 0 && findings.some((f) => f.label === "flat"),
    },
    {
      name: "Permits compliant design token usage",
      code: "export function Good() { return <div className=\"bg-neutral-900 text-neutral-100 rounded-lg\" />; }",
      css: false,
      assert: (findings) => findings.length === 0,
    },
  ];

  const results = [];
  for (const t of tests) {
    let findings = [];
    if (t.css) {
      for (const m of scanCss(t.code)) {
        findings.push({ label: m.label, text: m.message });
      }
    } else {
      const msgs = await lintCode(eslint, t.code, "src/synthetic.jsx");
      for (const m of msgs) {
        findings.push({ label: m.label, text: m.message });
      }
    }
    results.push({ name: t.name, passed: t.assert(findings) });
  }

  return {
    ok: results.every((r) => r.passed),
    results,
  };
}

/** Files to judge, and the source to judge them by. */
async function collect(staged, paths) {
  if (staged) {
    // Judge the version going IN, not the working tree: several agents write
    // here at once, so the tree usually holds somebody else's unfinished work.
    // `website/` is deliberately NOT in this pathspec. Design.md defines the
    // canvas and editor's visual language, and its rules are written for it:
    // a 9/10/11/12px type scale and two interface accents. The marketing site
    // is a separate surface with its own CSS language (16/17/18px body sizes,
    // its own accent), so judging it by those rules rejected every staged
    // website file while never catching anything the app cares about.
    const out = execFileSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACM", "--", "src/"],
      { cwd: ROOT, encoding: "utf8" },
    );
    return out
      .split("\n")
      .filter((f) => /\.(js|jsx|css)$/.test(f))
      .map((f) => ({
        path: f,
        css: f.endsWith(".css"),
        code: execFileSync("git", ["show", `:${f}`], { cwd: ROOT, encoding: "utf8" }),
      }));
  }
  const targets = paths.length ? paths : ["src"];
  const results = await eslint.lintFiles(targets);
  const js = results.map((r) => ({ path: relative(ROOT, r.filePath), result: r }));
  // ESLint does not parse CSS, so stylesheets are collected separately and
  // run through the scanner instead. Same command, same output, same hook —
  // two parallel checks would drift apart.
  const sheets = paths.length
    ? paths.filter((p) => p.endsWith(".css"))
    : globSync("src/**/*.css", { cwd: ROOT });
  return js.concat(
    sheets.map((f) => ({
      path: f,
      css: true,
      code: readFileSync(join(ROOT, f), "utf8"),
    })),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const staged = args.includes("--staged");
  const isSelfTest = args.includes("--self-test");
  const paths = args.filter((a) => !a.startsWith("--"));

  if (isSelfTest) {
    const selfTest = await runDesignSelfTest();
    for (const r of selfTest.results) {
      console.log(`  ${r.passed ? "✔" : "✖"} ${r.name}`);
    }
    if (!selfTest.ok) {
      console.error("\n✖ check-design self-test failed.");
      process.exit(1);
    }
    console.log("\n✔ check-design self-test passed (all fault injection checks verified).");
    process.exit(0);
  }

  const files = await collect(staged, paths);
  let findings = [];

  for (const f of files) {
    if (f.css) {
      for (const m of scanCss(f.code)) {
        findings.push({ file: f.path, line: m.line, col: 1, label: m.label, text: m.message });
      }
      continue;
    }
    const msgs = f.result
      ? f.result.messages
          .filter((m) => m.ruleId === RULE_ID)
          .map((m) => ({
            line: m.line,
            column: m.column,
            label: LABEL[m.messageId] || "design",
            message: m.message,
          }))
      : await lintCode(eslint, f.code, f.path);
    for (const m of msgs) {
      findings.push({ file: f.path, line: m.line, col: m.column, label: m.label, text: m.message });
    }
  }

  if (files.length === 0) {
    if (!staged && paths.length === 0) {
      console.error(`design: error: no files found to check in src/ (possible directory corruption).`);
      process.exit(1);
    }
    console.log(`design: clean — 0 file(s) match ${DOC}.`);
    process.exit(0);
  }

  if (findings.length === 0) {
    console.log(`design: clean — ${files.length} file(s) match ${DOC}.`);
    process.exit(0);
  }

  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  console.error("");
  for (const [file, list] of byFile) {
    console.error(file);
    for (const f of list.sort((a, b) => a.line - b.line)) {
      console.error(`  ${String(f.line).padStart(4)}:${String(f.col).padEnd(3)} ${f.label.padEnd(7)} ${f.text}`);
    }
    console.error("");
  }

  const counts = {};
  for (const f of findings) counts[f.label] = (counts[f.label] || 0) + 1;
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join("  ");

  console.error(`design: ${findings.length} violation(s) in ${byFile.size} file(s) — ${summary}`);
  console.error(`        Each message names the correct replacement. Full rationale: ${DOC}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
