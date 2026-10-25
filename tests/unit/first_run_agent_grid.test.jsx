import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AgentCardGrid, { selectableCliAgents } from "../../src/canvas/components/onboarding/agent_card_grid.jsx";
import { AGENT_STATUS, DETECTION_PHASE, cliAgentStatus, customAgentStatus } from "../../src/canvas/components/onboarding/agent_status_model.js";
import { detectLocalClis } from "../../src/canvas/components/onboarding/use_agent_detection.js";
import { CLI_AGENTS, CLI_TRANSPORT } from "../../src/shared/cli-agents.js";
import { loadLocale, t } from "../../src/shared/i18n.js";

const agent = (id) => CLI_AGENTS.find((entry) => entry.id === id);
const ready = { status: "ready", installed: true, authenticated: true, ready: true };
const done = (statuses, transport = CLI_TRANSPORT.RUNNABLE) => ({ phase: DETECTION_PHASE.DONE, transport, statuses });
const render = (detection, extra = {}) =>
  renderToStaticMarkup(
    <AgentCardGrid t={t} label="Agent" selected="" detection={detection} customConfigured={false} onSelect={() => {}} {...extra} />,
  );

describe("agent status mapping", () => {
  const claude = agent("claude");
  it("reads connected, not installed and not signed in from checkAll entries", () => {
    expect(cliAgentStatus(claude, done({ claude: ready }))).toBe(AGENT_STATUS.CONNECTED);
    expect(cliAgentStatus(claude, done({ claude: { status: "not_installed", installed: false, authenticated: false, ready: false } }))).toBe(AGENT_STATUS.NOT_INSTALLED);
    expect(cliAgentStatus(claude, done({ claude: { status: "unauthenticated", installed: true, authenticated: false, ready: false } }))).toBe(AGENT_STATUS.NOT_SIGNED_IN);
  });
  it("never calls a login without a binary connected", () => {
    const stale = { status: "unauthenticated", installed: false, authenticated: true, ready: false };
    expect(cliAgentStatus(claude, done({ claude: stale }))).toBe(AGENT_STATUS.NOT_INSTALLED);
  });
  it("is checking while detection is pending", () => {
    expect(cliAgentStatus(claude, { phase: DETECTION_PHASE.CHECKING })).toBe(AGENT_STATUS.CHECKING);
  });
  it("is unavailable without a bridge, without an entry, or when the CLI reports unavailable", () => {
    expect(cliAgentStatus(claude, { phase: DETECTION_PHASE.UNAVAILABLE })).toBe(AGENT_STATUS.UNAVAILABLE);
    expect(cliAgentStatus(claude, done({}))).toBe(AGENT_STATUS.UNAVAILABLE);
    expect(cliAgentStatus(claude, done({ claude: { status: "unavailable", installed: true } }))).toBe(AGENT_STATUS.UNAVAILABLE);
  });
  it("maps custom model to configure or configured", () => {
    expect(customAgentStatus(false)).toBe(AGENT_STATUS.CONFIGURE);
    expect(customAgentStatus(true)).toBe(AGENT_STATUS.CONFIGURED);
  });
});

describe("local CLI detection", () => {
  it("returns checkAll results from a runnable bridge", async () => {
    const checkAll = vi.fn().mockResolvedValue({ codex: ready });
    const result = await detectLocalClis(async () => ({ bridge: { checkAll }, transport: CLI_TRANSPORT.RUNNABLE }));
    expect(result).toEqual(done({ codex: ready }));
  });
  it.each([
    ["no bridge", { bridge: null, transport: CLI_TRANSPORT.NONE }],
    ["read-only link", { bridge: { checkAll: vi.fn() }, transport: CLI_TRANSPORT.READS_ONLY }],
    ["bridge without checkAll", { bridge: {}, transport: CLI_TRANSPORT.RUNNABLE }],
  ])("is unavailable for %s", async (_name, resolved) => {
    expect((await detectLocalClis(async () => resolved)).phase).toBe(DETECTION_PHASE.UNAVAILABLE);
  });
  it("is unavailable when the probe throws", async () => {
    const checkAll = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await detectLocalClis(async () => ({ bridge: { checkAll }, transport: CLI_TRANSPORT.RUNNABLE }));
    expect(result.phase).toBe(DETECTION_PHASE.UNAVAILABLE);
  });
});

describe("agent card grid", () => {
  beforeEach(() => loadLocale("en"));
  it("lays cards out three per row, each with icon, name and status", () => {
    const html = render(done({ codex: ready, claude: { installed: false }, antigravity: { installed: true, authenticated: false } }));
    expect(html).toContain("grid-cols-3");
    const cards = html.match(/data-testid="first-run-agent-card-[a-z]+"/g);
    expect(cards).toEqual([
      'data-testid="first-run-agent-card-codex"',
      'data-testid="first-run-agent-card-claude"',
      'data-testid="first-run-agent-card-antigravity"',
      'data-testid="first-run-agent-card-custom"',
    ]);
    for (const card of html.split("<button").slice(1)) {
      expect(card).toMatch(/<img [^>]*src="[^"]*brand-icons\/|<svg /);
      expect(card).toMatch(/text-xs font-semibold[^>]*>[^<]+</);
      expect(card).toMatch(/data-testid="first-run-agent-status-[a-z]+" data-status="[a-zA-Z]+"/);
    }
    expect(html).toContain("Connected");
    expect(html).toContain("Not installed");
    expect(html).toContain("Not signed in");
    expect(html).toContain("Configure");
  });
  it("shows Checking… while pending and Not detected without a bridge", () => {
    expect(render({ phase: DETECTION_PHASE.CHECKING })).toContain("Checking…");
    const html = render({ phase: DETECTION_PHASE.UNAVAILABLE });
    expect(html).toContain("Not detected");
    expect(html).not.toContain("Checking…");
  });
  it("reports a configured custom model", () => {
    expect(render({ phase: DETECTION_PHASE.UNAVAILABLE }, { customConfigured: true })).toContain("Configured");
  });
  it("marks only the selected card pressed", () => {
    const html = render({ phase: DETECTION_PHASE.UNAVAILABLE }, { selected: "claude" });
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
  });
  it("translates every label in zh", async () => {
    await loadLocale("zh");
    const html = render({ phase: DETECTION_PHASE.UNAVAILABLE });
    expect(html).toContain("未检测到");
    expect(html).toContain("去配置");
    expect(html).not.toContain("firstRun.");
  });
  it("offers only platforms that can run as a native agent", () => {
    expect(selectableCliAgents().map((entry) => entry.id)).toEqual(["codex", "claude", "antigravity"]);
  });
  it("forwards a card click as its platform id", () => {
    const onSelect = vi.fn();
    const grid = AgentCardGrid({ t, label: "Agent", selected: "", detection: { phase: DETECTION_PHASE.UNAVAILABLE }, customConfigured: false, onSelect });
    grid.props.children[0][0].props.onSelect();
    grid.props.children[1].props.onSelect();
    expect(onSelect.mock.calls).toEqual([["codex"], ["custom"]]);
  });
});
