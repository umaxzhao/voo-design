// Real-app MCP check: a coding CLI (Claude Code or Codex) drives a running VOO
// canvas through `npm run mcp`. Prereqs: `npx vite --port 5231`, `npm run bridge`,
// the voo-design server registered with the CLI (see docs/mcp-server.md), and
// `playwright` resolvable. Usage: node tests/e2e/mcp_cli.e2e.mjs [claude|codex]
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const cli = process.argv[2] || "claude";
const URL = process.env.VOO_URL || "http://localhost:5231/?voo-test=1";
const PROMPT =
  "Using the voo-design MCP tools, create a simple card on the VOO canvas: a 320x200 frame named 'Card' with a white fill, a title text 'Hello VOO' and a subtitle text 'MCP card' inside it. Reply DONE.";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(URL);
await page.waitForFunction(() => !!window.__vooEditor, null, { timeout: 90000 });
await page.waitForTimeout(3000); // let the MCP link register with the bridge
const nodes = () => page.evaluate(() =>
  window.__vooEditor.getDocument().nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, text: n.text })));
const before = await nodes();

const cmd = cli === "codex"
  ? ["codex", ["exec", "--dangerously-bypass-approvals-and-sandbox", PROMPT]]
  : ["claude", ["-p", "--model", process.env.CLAUDE_MODEL || "haiku", PROMPT, "--allowedTools", "mcp__voo-design__*"]];
const run = spawnSync(cmd[0], cmd[1], { encoding: "utf8", timeout: 600000, stdio: ["ignore", "pipe", "pipe"] });
console.log(run.stdout.slice(-1500), run.stderr.slice(-500));

const after = await nodes();
await page.screenshot({ path: process.env.VOO_SHOT || "/tmp/voo-mcp-e2e.png" });
await browser.close();
const added = after.filter((n) => !before.some((b) => b.id === n.id));
console.log("added", JSON.stringify(added));
const text = JSON.stringify(added);
const ok = added.length >= 3 && text.includes("Hello VOO") && text.includes("MCP card");
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
