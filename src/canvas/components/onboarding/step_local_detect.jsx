import PropTypes from "prop-types";
import { useState, useCallback, useEffect } from "react";
import {
  ensureLocalCliBridge,
  getLocalCliBridge,
} from "../agent-panel/local_cli_bridge.js";

const CLI_DEFAULT_COMMANDS = {
  claude: {
    installCmd: "npm install -g @anthropic-ai/claude-code",
    loginCmd: "claude",
  },
  codex: {
    installCmd: "npm install -g @openai/codex",
    loginCmd: "codex login",
  },
  antigravity: {
    installCmd: "npm install -g @google/antigravity-cli",
    loginCmd: "agy login",
  },
};

const DEFAULT_COMMANDS = CLI_DEFAULT_COMMANDS.claude;

export default function StepLocalDetect({ selectedAgent }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const defaults = CLI_DEFAULT_COMMANDS[selectedAgent] || DEFAULT_COMMANDS;
  const isDesktop = typeof window !== "undefined" && Boolean(window.vooDesktop?.localCli);

  const handleCopy = useCallback((text, key) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    }
  }, []);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (isDesktop && window.vooDesktop?.localCli?.checkStatus) {
        const res = await window.vooDesktop.localCli.checkStatus(selectedAgent);
        setTestResult(res);
      } else {
        // In Web mode, attempt to connect to local loopback bridge
        let bridge = null;
        try {
          bridge = getLocalCliBridge() || (await ensureLocalCliBridge({ dial: true }));
        } catch {
          bridge = null;
        }

        if (bridge?.checkStatus) {
          const res = await bridge.checkStatus(selectedAgent);
          setTestResult(res);
        } else {
          setTestResult({
            status: "web_bridge_missing",
            installed: false,
            authenticated: false,
            ready: false,
            bridgeCmd: "npm run bridge",
            reason: "Web 浏览器需启动本地 bridge 服务",
          });
        }
      }
    } catch (err) {
      setTestResult({
        status: "error",
        installed: false,
        authenticated: false,
        ready: false,
        reason: err?.message || "检测过程中发生错误",
      });
    } finally {
      setTesting(false);
    }
  }, [isDesktop, selectedAgent]);

  useEffect(() => {
    handleTestConnection();
  }, [handleTestConnection]);

  // Normalize status and commands
  const status = testResult?.status || (testResult ? (testResult.ok ? "ready" : (testResult.installed ? "unauthenticated" : "not_installed")) : null);
  const installCmd = testResult?.installCmd || defaults.installCmd;
  const loginCmd = testResult?.loginCmd || defaults.loginCmd;
  const binPath = testResult?.binPath || null;
  const bridgeCmd = testResult?.bridgeCmd || "npm run bridge";

  return (
    <div className="flex flex-col gap-3">
      {/* Detection status card */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] p-4 border border-white/5">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-100">{selectedAgent}</span>
            {testing ? (
              <span
                data-testid="onboarding-detect-status"
                className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-neutral-400"
              >
                检测中...
              </span>
            ) : status === "ready" ? (
              <span
                data-testid="onboarding-detect-status"
                className="rounded-full bg-[#a7ffd4]/10 border border-[#a7ffd4]/20 px-2 py-0.5 text-[10px] font-medium text-[#a7ffd4]"
              >
                CLI 已就绪
              </span>
            ) : status === "unauthenticated" ? (
              <span
                data-testid="onboarding-detect-status"
                className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400"
              >
                已检测到 CLI，但尚未登录认证
              </span>
            ) : status === "web_bridge_missing" ? (
              <span
                data-testid="onboarding-detect-status"
                className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400"
              >
                Web 模式需启动本地桥接服务
              </span>
            ) : status === "not_installed" ? (
              <span
                data-testid="onboarding-detect-status"
                className="rounded-full bg-white/[0.08] border border-white/10 px-2 py-0.5 text-[10px] font-medium text-neutral-400"
              >
                未检测到 CLI
              </span>
            ) : (
              <span
                data-testid="onboarding-detect-status"
                className="text-[11px] text-neutral-400"
              >
                准备检测...
              </span>
            )}
          </div>

          {/* Diagnostic details */}
          {status === "ready" && binPath && (
            <span
              data-testid="onboarding-bin-path"
              className="font-mono text-[10px] text-neutral-400 truncate pt-0.5"
            >
              路径: {binPath}
            </span>
          )}
          {status === "unauthenticated" && (
            <span className="text-[11px] text-amber-300/80 pt-0.5">
              CLI 虽已安装但未登录，请在终端执行登录命令。
            </span>
          )}
          {status === "web_bridge_missing" && (
            <span className="text-[11px] text-neutral-400 pt-0.5">
              Web 模式需要运行本地 bridge 才能连接本机 CLI。
            </span>
          )}
        </div>

        <button
          type="button"
          data-testid="onboarding-test-btn"
          onClick={handleTestConnection}
          disabled={testing}
          className="shrink-0 rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-neutral-100 hover:bg-white/[0.14] transition-colors disabled:opacity-40"
        >
          {testing ? "检测中..." : "重新检测"}
        </button>
      </div>

      {/* Unauthenticated guidance with loginCmd */}
      {status === "unauthenticated" && (
        <div
          data-testid="onboarding-unauth-guidance"
          className="flex flex-col gap-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4"
        >
          <span className="text-[11px] font-medium text-amber-300">
            在终端运行登录命令完成认证：
          </span>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/40 px-3 py-2 border border-white/5">
            <code className="overflow-x-auto font-mono text-[11px] text-amber-300">
              {loginCmd}
            </code>
            <button
              type="button"
              data-testid="onboarding-copy-login-btn"
              onClick={() => handleCopy(loginCmd, "login")}
              className="shrink-0 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-neutral-200 hover:bg-white/[0.14] transition-colors"
            >
              {copiedKey === "login" ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}

      {/* Web bridge missing guidance */}
      {status === "web_bridge_missing" && (
        <div
          data-testid="onboarding-bridge-guidance"
          className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] border border-white/5 p-4"
        >
          <span className="text-[11px] text-neutral-400">
            启动本地桥接服务（开启 WebSocket 桥接与本地 CLI 通信）：
          </span>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/40 px-3 py-2 border border-white/5">
            <code className="overflow-x-auto font-mono text-[11px] text-[#a7ffd4]">
              {bridgeCmd}
            </code>
            <button
              type="button"
              data-testid="onboarding-copy-bridge-btn"
              onClick={() => handleCopy(bridgeCmd, "bridge")}
              className="shrink-0 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-neutral-200 hover:bg-white/[0.14] transition-colors"
            >
              {copiedKey === "bridge" ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}

      {/* Install guidance (shown when not installed, initial state, or anytime as fallback) */}
      {(status === "not_installed" || status === null || (!status && !testing)) && (
        <div
          data-testid="onboarding-install-guidance"
          className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] border border-white/5 p-4"
        >
          <span className="text-[11px] text-neutral-400">没有安装？在终端运行：</span>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-black/40 px-3 py-2 border border-white/5">
            <code className="overflow-x-auto font-mono text-[11px] text-[#a7ffd4]">
              {installCmd}
            </code>
            <button
              type="button"
              data-testid="onboarding-copy-install-btn"
              onClick={() => handleCopy(installCmd, "install")}
              className="shrink-0 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[10px] font-medium text-neutral-200 hover:bg-white/[0.14] transition-colors"
            >
              {copiedKey === "install" ? "已复制" : "复制"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

StepLocalDetect.propTypes = {
  selectedAgent: PropTypes.string.isRequired,
};
