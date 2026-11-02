import React from "react";

// A tiny one-hook React harness: the install handler belongs to a button, and
// the dialog tests in this repo already exercise handlers this way. Only
// `useState` is diverted, and only while a test is drawing by hand.
const hooks = vi.hoisted(() => ({ active: false, values: [], index: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useState: (initial) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.index++;
      if (!(index in hooks.values)) {
        hooks.values[index] = typeof initial === "function" ? initial() : initial;
      }
      return [hooks.values[index], (value) => {
        hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value;
      }];
    },
  };
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DeepSeekConnectorInline, {
  DEEPSEEK_DOWNLOAD_URL,
  DEEPSEEK_INSTALL_PLACEHOLDER,
  deepseekConnectorState,
  deepseekInstallCommand,
} from "../../src/canvas/components/onboarding/deepseek_connector_inline.jsx";
import { AGENT_STATUS, DETECTION_PHASE, cliAgentStatus } from "../../src/canvas/components/onboarding/agent_status_model.js";
import { CLI_AGENTS, CLI_TRANSPORT } from "../../src/shared/cli-agents.js";
import { loadLocale, t } from "../../src/shared/i18n.js";

const CONNECTOR_DIR = "/Users/me/Library/Application Support/VOO/connectors/voo";
const INSTALL_COMMAND = `dsh plugin add link:${CONNECTOR_DIR}`;
const APP_PATH = "/Applications/DeepSeek Harness.app";

/** A `checkAll` entry shaped like PLAN 4.2. */
function checkAllEntry({ appInstalled, pluginInstalled, installCommand = INSTALL_COMMAND }) {
  const dsh = {
    appInstalled,
    appPath: appInstalled ? APP_PATH : null,
    pluginInstalled,
    connectorDir: CONNECTOR_DIR,
    installCommand,
  };
  return {
    status: !appInstalled ? "not_installed" : pluginInstalled ? "ready" : "unauthenticated",
    installed: appInstalled,
    authenticated: pluginInstalled,
    ready: appInstalled && pluginInstalled,
    binPath: dsh.appPath,
    installCmd: appInstalled ? "" : installCommand,
    loginCmd: "",
    dsh,
  };
}

const detection = (extra = {}) => ({ phase: DETECTION_PHASE.DONE, transport: CLI_TRANSPORT.RUNNABLE, refresh: vi.fn(), ...extra });
const markup = (status, extra = {}) =>
  renderToStaticMarkup(
    <DeepSeekConnectorInline t={t} status={status} detection={detection(extra.detection)} />,
  );

const deepseek = CLI_AGENTS.find((agent) => agent.id === "deepseek-harness");

beforeEach(async () => {
  await loadLocale("en");
});

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(elements)];
}

function draw(props) {
  hooks.index = 0;
  return DeepSeekConnectorInline(props);
}

describe("deepseek connector state", () => {
  it("reads the app and plugin installs from status.dsh", () => {
    expect(deepseekConnectorState(null)).toEqual({ known: false, appInstalled: null, pluginInstalled: null });
    expect(deepseekConnectorState(checkAllEntry({ appInstalled: true, pluginInstalled: false })))
      .toEqual({ known: true, appInstalled: true, pluginInstalled: false });
    expect(deepseekConnectorState(checkAllEntry({ appInstalled: true, pluginInstalled: true })))
      .toEqual({ known: true, appInstalled: true, pluginInstalled: true });
    expect(deepseekConnectorState(checkAllEntry({ appInstalled: false, pluginInstalled: false })))
      .toEqual({ known: true, appInstalled: false, pluginInstalled: false });
  });
  it("falls back to the flat installed/authenticated pair for older bridges", () => {
    expect(deepseekConnectorState({ installed: true, authenticated: false }))
      .toEqual({ known: true, appInstalled: true, pluginInstalled: false });
    expect(deepseekConnectorState({ installed: true, authenticated: true }))
      .toEqual({ known: true, appInstalled: true, pluginInstalled: true });
  });
  it("prefers an explicit command, then the connector folder, then a placeholder", () => {
    expect(deepseekInstallCommand(checkAllEntry({ appInstalled: true, pluginInstalled: false }))).toBe(INSTALL_COMMAND);
    expect(deepseekInstallCommand({ dsh: { connectorDir: CONNECTOR_DIR } })).toBe(INSTALL_COMMAND);
    expect(deepseekInstallCommand({ dsh: { connectorDir: CONNECTOR_DIR, installCommand: "" } })).toBe(INSTALL_COMMAND);
    expect(deepseekInstallCommand(null)).toBe(DEEPSEEK_INSTALL_PLACEHOLDER);
    expect(DEEPSEEK_INSTALL_PLACEHOLDER).not.toMatch(/\/(?:Users|home|tmp|Applications)\//);
  });
  it("maps the DeepSeek Harness entry to pluginMissing instead of notSignedIn", () => {
    const done = (entry) => ({ phase: DETECTION_PHASE.DONE, transport: CLI_TRANSPORT.RUNNABLE, statuses: { "deepseek-harness": entry } });
    expect(cliAgentStatus(deepseek, done(checkAllEntry({ appInstalled: false, pluginInstalled: false })))).toBe(AGENT_STATUS.NOT_INSTALLED);
    expect(cliAgentStatus(deepseek, done(checkAllEntry({ appInstalled: true, pluginInstalled: false })))).toBe(AGENT_STATUS.PLUGIN_MISSING);
    expect(cliAgentStatus(deepseek, done(checkAllEntry({ appInstalled: true, pluginInstalled: true })))).toBe(AGENT_STATUS.CONNECTED);
    expect(cliAgentStatus(deepseek, { phase: DETECTION_PHASE.UNAVAILABLE })).toBe(AGENT_STATUS.UNAVAILABLE);
  });
});

describe("deepseek connector inline rendering", () => {
  it("asks to install the app first when only the app is missing", () => {
    const html = markup(checkAllEntry({ appInstalled: false, pluginInstalled: false }));
    expect(html).toContain('data-testid="deepseek-connector-inline"');
    expect(html).toContain('data-state="needsApp"');
    expect(html).toContain('data-testid="deepseek-app-status"');
    expect(html).toContain('data-testid="deepseek-plugin-status"');
    expect(html).toContain("Not installed");
    expect(html).toContain("Install the DeepSeek Harness app first");
    expect(html).toContain(`href="${DEEPSEEK_DOWNLOAD_URL}"`);
    expect(html).toContain("Download DeepSeek Harness");
    expect(html).not.toContain('data-testid="deepseek-install-command"');
    expect(html).not.toContain('data-testid="deepseek-install-button"');
    expect(html).not.toContain('data-testid="deepseek-installed-hint"');
    expect(html).toContain('data-testid="deepseek-refresh"');
  });

  it("offers the command, copy, install and refresh when only the plugin is missing", () => {
    const html = markup(checkAllEntry({ appInstalled: true, pluginInstalled: false }));
    expect(html).toContain('data-state="needsPlugin"');
    expect(html).toMatch(/data-testid="deepseek-app-status" data-installed="true"[^>]*>Installed</);
    expect(html).toMatch(/data-testid="deepseek-plugin-status" data-installed="false"[^>]*>Not installed</);
    expect(html).toContain("Plugin needed");
    expect(html).toContain('data-testid="deepseek-install-command"');
    expect(html).toContain(INSTALL_COMMAND);
    expect(html).toContain('data-testid="deepseek-copy-command"');
    expect(html).toContain("Install command");
    expect(html).toContain('data-testid="deepseek-install-button"');
    expect(html).toContain("Install VOO plugin");
    expect(html).toContain('data-testid="deepseek-refresh"');
    expect(html).not.toContain('data-testid="deepseek-installed-hint"');
  });

  it("tells the user how to use the connector once both are installed", () => {
    const html = markup(checkAllEntry({ appInstalled: true, pluginInstalled: true }));
    expect(html).toContain('data-state="ready"');
    expect(html).toContain('data-testid="deepseek-installed-hint"');
    expect(html).toContain("In a new DeepSeek Harness session, say: Open my VOO canvas");
    expect(html).not.toContain('data-testid="deepseek-install-button"');
    expect(html).not.toContain('data-testid="deepseek-install-command"');
  });

  it("keeps the manual command and refresh available without a bridge (null status)", () => {
    const html = markup(null);
    expect(html).toContain('data-state="unknown"');
    expect(html).toContain('data-testid="deepseek-app-status"');
    expect(html).toContain('data-testid="deepseek-plugin-status"');
    expect(html).toContain("Not detected");
    expect(html).toContain('data-testid="deepseek-install-command"');
    expect(html).toContain("dsh plugin add link:&lt;connector folder&gt;");
    expect(html).toContain('data-testid="deepseek-refresh"');
    expect(html).not.toContain('data-testid="deepseek-install-button"');
    expect(html).not.toContain('data-testid="deepseek-installed-hint"');
  });

  it.each(["en", "zh"])("translates every label in %s", async (locale) => {
    await loadLocale(locale);
    const missingPlugin = markup(checkAllEntry({ appInstalled: true, pluginInstalled: false }));
    const missingApp = markup(checkAllEntry({ appInstalled: false, pluginInstalled: false }));
    const ready = markup(checkAllEntry({ appInstalled: true, pluginInstalled: true }));
    for (const html of [missingPlugin, missingApp, ready, markup(null)]) {
      expect(html).not.toContain("firstRun.");
    }
    if (locale === "zh") {
      expect(missingPlugin).toContain("VOO 插件");
      expect(missingPlugin).toMatch(/data-testid="deepseek-app-status" data-installed="true"[^>]*>已安装</);
      expect(missingPlugin).toMatch(/data-testid="deepseek-plugin-status" data-installed="false"[^>]*>未安装</);
      expect(missingPlugin).toContain("待安装插件");
      expect(missingPlugin).toContain("VOO 插件尚未安装");
      expect(missingPlugin).toContain("安装 VOO 插件");
      expect(missingPlugin).toContain("重新检测");
      expect(ready).toContain("打开我的 VOO 画布");
      expect(missingApp).toContain("下载 DeepSeek Harness");
    } else {
      expect(missingPlugin).toContain("VOO plugin");
      expect(missingPlugin).toContain("Installed");
      expect(missingPlugin).toContain("Plugin needed");
      expect(missingPlugin).toContain("Check again");
    }
    await loadLocale("en");
  });
});

describe("deepseek connector inline install action", () => {
  afterEach(() => {
    hooks.active = false;
    hooks.values = [];
    vi.unstubAllGlobals();
  });

  const status = checkAllEntry({ appInstalled: true, pluginInstalled: false });
  const props = (overrides = {}) => ({
    t,
    status,
    detection: detection(),
    ...overrides,
  });

  it("calls the bridge install and refreshes the detection on success", async () => {
    await loadLocale("en");
    const dshInstall = vi.fn().mockResolvedValue({ ok: true, connectorPath: CONNECTOR_DIR, command: INSTALL_COMMAND });
    vi.stubGlobal("window", { vooDesktop: { localCli: { dshInstall } } });
    hooks.active = true;
    hooks.values = [];
    const view = props();
    const tree = draw(view);
    const button = elements(tree).find((el) => el?.props?.["data-testid"] === "deepseek-install-button");
    expect(button).toBeTruthy();
    button.props.onClick();
    await vi.waitFor(() => expect(dshInstall).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(view.detection.refresh).toHaveBeenCalledTimes(1));
    expect(renderToStaticMarkup(draw(view))).toContain("Installed. Checking again…");
  });

  it("reports a failed install and shows the command the bridge returned", async () => {
    await loadLocale("en");
    const manualCommand = `dsh plugin add link:${CONNECTOR_DIR}`;
    const dshInstall = vi.fn().mockResolvedValue({ ok: false, code: "dshCliNotFound", command: manualCommand });
    vi.stubGlobal("window", { vooDesktop: { localCli: { dshInstall } } });
    hooks.active = true;
    hooks.values = [];
    const view = props();
    const tree = draw(view);
    elements(tree).find((el) => el?.props?.["data-testid"] === "deepseek-install-button").props.onClick();
    await vi.waitFor(() => expect(dshInstall).toHaveBeenCalledTimes(1));
    const html = renderToStaticMarkup(draw(view));
    expect(view.detection.refresh).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="deepseek-install-result"');
    expect(html).toContain("Automatic install failed");
    expect(html).toContain(manualCommand);
  });

  it("does not throw when no bridge can answer the install", async () => {
    await loadLocale("en");
    hooks.active = true;
    hooks.values = [];
    const view = props();
    const tree = draw(view);
    elements(tree).find((el) => el?.props?.["data-testid"] === "deepseek-install-button").props.onClick();
    await vi.waitFor(() => expect(hooks.values?.[0]).toBe("failed"));
    expect(view.detection.refresh).not.toHaveBeenCalled();
  });
});
