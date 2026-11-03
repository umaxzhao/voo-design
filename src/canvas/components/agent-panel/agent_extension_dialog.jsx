import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { AlertCircle, CheckCircle, Copy, FolderOpen, RefreshCw, X } from "lucide-react";
import { EXTENSION_STATUS } from "../../agent/extension_detection.js";

/**
 * Centered modal dialog for Chrome extension installation, connection guidance,
 * and capability re-verification when a Web Image model (ChatGPT / Gemini) is picked.
 */
export default function AgentExtensionDialog({
  isOpen,
  status = EXTENSION_STATUS.MISSING,
  onClose,
  onRetry,
  t,
  route = "chatgpt",
}) {
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const routeName = route === "gemini" ? "Gemini 网页" : "GPT 网页";

  // Handle Escape key to dismiss dialog without triggering generation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDesktop = typeof window !== "undefined" && Boolean(window.vooDesktop);
  const isChecking = status === EXTENSION_STATUS.CHECKING;

  const getStatusBadge = () => {
    switch (status) {
      case EXTENSION_STATUS.READY:
        return {
          label: t("agent.extension.statusReady") || "扩展已就绪",
          color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          icon: CheckCircle,
        };
      case EXTENSION_STATUS.UNREACHABLE:
        return {
          label: t("agent.extension.statusUnreachable") || "已安装但未连接 (Chrome 未运行或未启用)",
          color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          icon: AlertCircle,
        };
      case EXTENSION_STATUS.OUTDATED:
        return {
          label: t("agent.extension.statusOutdated") || "扩展协议需更新",
          color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          icon: AlertCircle,
        };
      case EXTENSION_STATUS.TIMEOUT:
        return {
          label: t("agent.extension.statusTimeout") || "检测超时 (Chrome 扩展无响应)",
          color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          icon: AlertCircle,
        };
      case EXTENSION_STATUS.CHECKING:
        return {
          label: t("agent.extension.statusChecking") || "检测扩展中…",
          color: "bg-purple-500/15 text-purple-300 border-purple-500/30",
          icon: RefreshCw,
        };
      case EXTENSION_STATUS.MISSING:
        return {
          label: t("agent.extension.statusMissing") || "未检测到扩展 (需加载本地包)",
          color: "bg-rose-500/15 text-rose-300 border-rose-500/30",
          icon: AlertCircle,
        };
      // UNKNOWN and any unexpected value must not be presented as "missing".
      case EXTENSION_STATUS.UNKNOWN:
      default:
        return {
          label: t("agent.extension.statusUnknown") || "检测结果不明确 (请重新检测)",
          color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
          icon: AlertCircle,
        };
    }
  };

  const badge = getStatusBadge();
  const StatusIcon = badge.icon;

  const handleCopyCommand = () => {
    const packageCmd = "npm run package:extension";
    navigator.clipboard?.writeText(packageCmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleOpenFolder = () => {
    if (typeof window !== "undefined" && window.vooDesktop?.revealExtensionFolder) {
      window.vooDesktop.revealExtensionFolder();
    } else {
      handleCopyCommand();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-ext-dialog-title"
      data-testid="agent-extension-dialog"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-6 shadow-panel text-neutral-100 flex flex-col gap-4 select-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 id="agent-ext-dialog-title" className="text-[15px] font-semibold text-white">
              {t("agent.extension.dialogTitle") || `使用 ${routeName} 需要连接 Chrome 扩展`}
            </h3>
            <p className="text-[12px] text-neutral-400">
              {t("agent.extension.dialogSubtitle") ||
                "生图将在您本地已登录的 Chrome 标签页中执行，免除 API Key，安全且不保存您的凭证。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("editor.cancel") || "关闭"}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Status Indicator */}
        <div
          data-testid="agent-ext-status-badge"
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium ${badge.color}`}
        >
          <StatusIcon size={14} className={`shrink-0 ${isChecking ? "animate-spin" : ""}`} />
          <span className="min-w-0 flex-1">{badge.label}</span>
        </div>

        {/* Installation Instructions */}
        <div className="flex flex-col gap-2 rounded-xl bg-white/[0.04] p-3 text-[12px] text-neutral-300">
          <p className="font-medium text-neutral-200">
            {t("agent.extension.stepsTitle") || "安装与连接步骤："}
          </p>
          <ol className="list-decimal space-y-1.5 pl-4 text-neutral-400">
            <li>
              <span>在 Chrome 浏览器打开 </span>
              <code className="rounded-md bg-black/40 px-1 py-0.5 text-neutral-200 font-mono text-[11px]">
                chrome://extensions
              </code>
              <span> 并开启右上角“开发者模式”。</span>
            </li>
            <li>
              <span>点击左上角“加载已解压的扩展程序”，选择项目本地构建后的扩展目录 </span>
              <code className="rounded-md bg-black/40 px-1 py-0.5 text-[#E5B2FF] font-mono text-[11px]">
                extension/
              </code>
              <span>。</span>
            </li>
            <li>
              <span>在 Chrome 中保持 </span>
              <span className="text-neutral-200">{route === "gemini" ? "gemini.google.com" : "chatgpt.com"}</span>
              <span> 登录，扩展将自动建立连接。</span>
            </li>
          </ol>
        </div>

        {/* Local Package Identity & Action */}
        <div className="flex flex-col gap-2 rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 text-[11px] text-neutral-400">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-neutral-300 truncate">
              {t("agent.extension.packageIdentity") || "扩展包标识: VOO Design Web Images (0.1.0)"}
            </span>
            <span className="rounded-md px-1.5 py-0.5 bg-amber-500/10 text-amber-300 text-[10px] shrink-0">
              {t("agent.extension.downloadBlocked") || "未发布远端下载包 (需本地构建)"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {isDesktop && typeof window.vooDesktop?.revealExtensionFolder === "function" ? (
              <button
                type="button"
                onClick={handleOpenFolder}
                data-testid="agent-ext-open-folder"
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-200 hover:bg-white/20 hover:text-white transition-colors"
              >
                <FolderOpen size={14} />
                <span>{t("agent.extension.openFolder") || "打开扩展所在目录"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCopyCommand}
                data-testid="agent-ext-copy-path"
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-medium text-neutral-200 hover:bg-white/20 hover:text-white transition-colors"
              >
                <Copy size={13} />
                <span>
                  {copied
                    ? t("install.desktop.copied") || "已复制命令"
                    : t("agent.extension.copyBuildCmd") || "复制打包命令"}
                </span>
              </button>
            )}
            <code className="text-[11px] font-mono text-[#E5B2FF] truncate">
              npm run package:extension
            </code>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            data-testid="agent-ext-cancel"
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            {t("editor.cancel") || "取消"}
          </button>
          <button
            type="button"
            disabled={isChecking}
            onClick={onRetry}
            data-testid="agent-ext-retry"
            className="flex items-center gap-1.5 rounded-lg bg-[#E5B2FF] px-3.5 py-1.5 text-[12px] font-semibold text-black hover:bg-[#eed0ff] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isChecking ? "animate-spin" : ""} />
            <span>{isChecking ? (t("agent.extension.checking") || "正在检测…") : (t("agent.extension.retry") || "重新检测")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

AgentExtensionDialog.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  status: PropTypes.string,
  onClose: PropTypes.func,
  onRetry: PropTypes.func,
  t: PropTypes.func.isRequired,
  route: PropTypes.string,
};
