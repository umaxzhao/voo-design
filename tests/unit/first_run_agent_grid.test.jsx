import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AgentCardGrid, { selectableCliAgents } from "../../src/canvas/components/onboarding/agent_card_grid.jsx";
import { AGENT_STATUS, DETECTION_PHASE, cliAgentStatus, customAgentStatus, visibleCloudProviderPresets } from "../../src/canvas/components/onboarding/agent_status_model.js";
import { detectLocalClis } from "../../src/canvas/components/onboarding/use_agent_detection.js";
import { CLI_AGENTS, CLI_TRANSPORT } from "../../src/shared/cli-agents.js";
import { loadLocale, t } from "../../src/shared/i18n.js";
import { CLOUD_PROVIDER_PRESETS } from "../../src/canvas/components/onboarding/cloud_provider_presets.js";

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

describe("DeepSeek Harness model-card visibility", () => {
  it("hides its duplicate model setup after the Harness app and plugin connect", () => {
    const detection = done({
      "deepseek-harness": {
        status: "ready",
        installed: true,
        authenticated: true,
        ready: true,
      },
    });

    const visible = visibleCloudProviderPresets(CLOUD_PROVIDER_PRESETS, detection);
    expect(visible).toEqual(
      CLOUD_PROVIDER_PRESETS.filter(({ id }) => id !== "deepseek-harness-models"),
    );
    expect(visible.map(({ id }) => id)).not.toContain("deepseek-harness-models");
  });

  it.each([
    ["checking", { phase: DETECTION_PHASE.CHECKING }],
    ["app installed but plugin missing", done({ "deepseek-harness": { installed: true, authenticated: false } })],
  ])("keeps the model setup visible while %s", (_label, detection) => {
    expect(visibleCloudProviderPresets(CLOUD_PROVIDER_PRESETS, detection))
      .toEqual(CLOUD_PROVIDER_PRESETS);
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
  it("places agents in row 1 and API providers in row 2 with their sourced logos", () => {
    const html = render(done({}), { cloudProviders: CLOUD_PROVIDER_PRESETS });
    const parts = html.split('<div role="group" aria-label="');
    const row1Ids = [...parts[1].matchAll(/data-testid="first-run-agent-card-([a-z0-9-]+)"/g)].map(match => match[1]);
    expect(row1Ids).toEqual(["codex", "claude", "antigravity", "deepseek-harness"]);

    const row2Ids = [...parts[2].matchAll(/data-testid="first-run-agent-card-([a-z0-9-]+)"/g)].map(match => match[1]);
    expect(row2Ids).toEqual(["dashscope", "volcengine", "deepseek", "deepseek-harness-models", "custom"]);

    expect(html).toContain("Alibaba Cloud");
    expect(html).toContain("Volcengine");
    expect(html).toContain("brand-icons/alibabacloud.svg");
    expect(html).toContain("brand-icons/volcengine.svg");
  });
  it("lays cards out with icon, name and status in two groups", () => {
    const html = render(
      done({ codex: ready, claude: { installed: false }, antigravity: { installed: true, authenticated: false } }),
      { cloudProviders: CLOUD_PROVIDER_PRESETS },
    );
    const parts = html.split('<div role="group" aria-label="');
    expect(parts).toHaveLength(3);
    const agentGroup = parts[1];
    const apiGroup = parts[2];
    expect(agentGroup).toContain("grid grid-cols-2 gap-2 sm:grid-cols-4");
    // API cards wrap after four columns, matching the agent cards.
    expect(apiGroup).toContain("grid grid-cols-2 gap-2 sm:grid-cols-4");
    const agentCards = agentGroup.match(/data-testid="first-run-agent-card-[a-z0-9-]+"/g);
    expect(agentCards).toEqual([
      'data-testid="first-run-agent-card-codex"',
      'data-testid="first-run-agent-card-claude"',
      'data-testid="first-run-agent-card-antigravity"',
      'data-testid="first-run-agent-card-deepseek-harness"',
    ]);
    const apiCards = apiGroup.match(/data-testid="first-run-agent-card-[a-z0-9-]+"/g);
    expect(apiCards).toEqual([
      'data-testid="first-run-agent-card-dashscope"',
      'data-testid="first-run-agent-card-volcengine"',
      'data-testid="first-run-agent-card-deepseek"',
      'data-testid="first-run-agent-card-deepseek-harness-models"',
      'data-testid="first-run-agent-card-custom"',
    ]);
    expect(apiGroup).toContain("Alibaba Cloud");
    expect(apiGroup).toContain("Volcengine");
    for (const card of html.split("<button").slice(1)) {
      expect(card).toMatch(/<img [^>]*src="[^"]*brand-icons\/|<svg /);
      expect(card).toMatch(/text-xs font-semibold[^>]*>[^<]+</);
      expect(card).toMatch(/data-testid="first-run-agent-status-[a-z0-9-]+" data-status="[a-zA-Z]+"/);
    }
    expect(html).toContain("Connected");
    expect(html).toContain("Not installed");
    expect(html).toContain("Not signed in");
    expect(html).toContain("Configure");
    expect(html).toContain("break-normal text-xs font-semibold");
    expect(html).toContain('aria-label="Agent" class="grid grid-cols-2 gap-2 sm:grid-cols-4"');
    expect(html).toContain('class="grid grid-cols-2 gap-2 sm:grid-cols-4"');
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
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
  });
  it("translates every label in zh", async () => {
    await loadLocale("zh");
    const html = render({ phase: DETECTION_PHASE.UNAVAILABLE });
    expect(html).toContain("未检测到");
    expect(html).toContain("去配置");
    expect(html).not.toContain("firstRun.");
  });
  it.each(["en", "zh"])("resolves a non-empty label for every cloud provider card in %s", async (locale) => {
    await loadLocale(locale);
    const html = render(done({}), { cloudProviders: CLOUD_PROVIDER_PRESETS });
    // An unresolved key renders as its raw `firstRun.*` identifier.
    expect(html).not.toContain("firstRun.");
    for (const preset of CLOUD_PROVIDER_PRESETS) {
      expect(t(preset.labelKey)).not.toBe(preset.labelKey);
      expect(html).toContain(`>${t(preset.labelKey)}<`);
    }
  });
  it("offers only platforms that can run as a native agent", () => {
    expect(selectableCliAgents().map((entry) => entry.id)).toEqual(["codex", "claude", "antigravity", "deepseek-harness"]);
  });
  it("forwards a card click as its platform id", () => {
    const onSelect = vi.fn();
    const grid = AgentCardGrid({ t, label: "Agent", selected: "", detection: { phase: DETECTION_PHASE.UNAVAILABLE },
      cloudProviders: CLOUD_PROVIDER_PRESETS, customConfigured: false, onSelect });
    const extractCards = (node) => {
      if (!node) return [];
      if (Array.isArray(node)) return node.flatMap(extractCards);
      if (typeof node !== "object") return [];
      if (node.props?.id && node.props?.onSelect) return [node];
      return [node.props?.children].flat(Infinity).flatMap(extractCards);
    };
    const cards = extractCards(grid);
    for (const id of ["codex", "volcengine", "custom", "deepseek-harness"]) {
      cards.find(card => card?.props?.id === id).props.onSelect();
    }
    expect(onSelect.mock.calls).toEqual([["codex"], ["volcengine"], ["custom"], ["deepseek-harness"]]);
  });
});

describe("agent grid host adaptation", () => {
  it("lets a host pick and order platforms, drop the custom card and rename test ids", () => {
    const html = render({ phase: DETECTION_PHASE.CHECKING }, {
      agentIds: ["claude", "codex"],
      showCustom: false,
      testIds: { grid: "host-grid", card: "host-card", status: "host-status" },
    });
    expect(html).toContain('data-testid="host-grid"');
    expect(html.indexOf("host-card-claude")).toBeLessThan(html.indexOf("host-card-codex"));
    expect(html).not.toContain("host-card-antigravity");
    expect(html).not.toContain("host-card-deepseek-harness");
    expect(html).not.toContain("host-card-custom");
    expect(html).toContain('<div role="group" aria-label="Agent" class="grid grid-cols-2 gap-2 sm:grid-cols-4">');
  });
  it("keeps the first-run defaults when no host props are given", () => {
    const html = render({ phase: DETECTION_PHASE.CHECKING });
    expect(html).toContain('data-testid="first-run-agent-card-custom"');
    expect(html).toContain('data-testid="first-run-agent-grid"');
  });
});
