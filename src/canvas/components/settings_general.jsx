import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../use_i18n.js";
import { setLocale } from "../../shared/i18n.js";
import { getSetting, setSetting } from "../../shared/settings.js";
import { useUserStore } from "../store/user_store.js";
import {
  avatarUrl,
  loadIdentity,
  saveIdentity,
} from "../collab/identity.js";
import { initialsFor } from "../collab/presence.js";
import {
  IconFolder,
  IconFolderOpen,
  IconRefresh,
  IconExternalLink,
} from "../icons.jsx";
import {
  workspaceStorage,
  ElectronWorkspaceDriver,
} from "../../services/workspace_storage.js";
import InfoHint from "./info_hint.jsx";
import { useShowRulers } from "../use_show_rulers.js";
import SettingsSection from "./settings_section.jsx";
import { Switch } from "./ui/switch.jsx";

export function WorkspaceSettingsSection() {
  const { t } = useI18n();
  const [config, setConfig] = useState(() => {
    const isElectron = ElectronWorkspaceDriver.isAvailable();
    const path = getSetting("voo.workspace.path");
    const type = getSetting("voo.workspace.type");
    return {
      path: path || (isElectron ? "~/Documents/VOO/Projects" : "Virtual Workspace"),
      type: type || (isElectron ? "electron" : "web-idb"),
      name: getSetting("voo.workspace.name") || "VOO Projects",
    };
  });
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await workspaceStorage.getConfig();
      if (cfg) {
        setConfig((curr) => ({
          ...curr,
          path: cfg.path || curr.path,
          type: cfg.type || curr.type,
        }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshConfig();

    const handleWorkspaceChanged = (e) => {
      if (e?.detail) {
        setConfig((curr) => ({
          ...curr,
          ...e.detail,
        }));
      } else {
        refreshConfig();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("voo:workspace-changed", handleWorkspaceChanged);
      return () => {
        window.removeEventListener("voo:workspace-changed", handleWorkspaceChanged);
      };
    }
  }, [refreshConfig]);

  const handleChangeDirectory = async () => {
    setErrorMsg("");
    try {
      const res = await workspaceStorage.chooseDirectory();
      if (res.ok && res.config) {
        const next = {
          path: res.config.path,
          type: res.config.type,
          name: res.config.name || "VOO Projects",
        };
        setConfig(next);
        setSetting("voo.workspace.path", next.path);
        setSetting("voo.workspace.type", next.type);
        setSetting("voo.workspace.name", next.name);
        setSetting("voo.workspace.lastScannedAt", Date.now());
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("voo:workspace-changed", { detail: next }));
        }
      } else if (!res.canceled && res.error) {
        setErrorMsg(res.error);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to change directory");
    }
  };

  const handleRescan = async () => {
    setErrorMsg("");
    setScanning(true);
    setScanStatus(t("settings.workspace.scanning") || "正在扫描...");
    try {
      const files = await workspaceStorage.scanFiles();
      setSetting("voo.workspace.lastScannedAt", Date.now());
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("voo:workspace-rescan", {
            detail: { path: config.path, count: files.length },
          })
        );
      }
      setScanStatus(`${t("settings.workspace.rescanSuccess") || "扫描完成"} (${files.length})`);
      setTimeout(() => setScanStatus(""), 3000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to scan workspace");
      setScanStatus("");
    } finally {
      setScanning(false);
    }
  };

  const handleReveal = async () => {
    setErrorMsg("");
    try {
      await workspaceStorage.revealInFinder(config.path);
    } catch (err) {
      setErrorMsg(err.message || "Failed to reveal in Finder");
    }
  };

  const isElectron = config.type === "electron" || ElectronWorkspaceDriver.isAvailable();

  const getPlatformBadge = (type) => {
    if (type === "electron") {
      const val = t("settings.workspace.badgeDesktop");
      return val && val !== "settings.workspace.badgeDesktop" ? val : "[macOS 原生]";
    }
    if (type === "web-fsa") {
      const val = t("settings.workspace.badgeFsa");
      return val && val !== "settings.workspace.badgeFsa" ? val : "[浏览器挂载]";
    }
    const val = t("settings.workspace.badgeVirtual");
    return val && val !== "settings.workspace.badgeVirtual" ? val : "[虚拟工作区]";
  };

  return (
    <SettingsSection
      title={t("settings.workspace.title") || "项目工作区"}
      hint={t("settings.workspace.hint") || "管理设计工程文件（.voo、.fig、.psd、.svg）存储与同步的本地物理目录。"}
    >
      <div data-testid="settings-workspace-section" className="flex flex-col gap-3">
        {/* Active Path Box */}
        <div className="flex flex-col gap-2 rounded-xl bg-white/[0.04] p-3.5 border border-white/5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <IconFolder size={15} className="text-[#a7ffd4] shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">
                {t("settings.workspace.activePath") || "当前工作区"}
              </span>
            </div>
            <span
              data-testid="workspace-platform-badge"
              className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-neutral-300 shrink-0"
            >
              {getPlatformBadge(config.type)}
            </span>
          </div>

          <div
            data-testid="workspace-current-path"
            className="font-mono text-xs text-neutral-200 break-all select-all pt-0.5"
          >
            {config.path}
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
            {errorMsg}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            data-testid="workspace-change-dir-btn"
            onClick={handleChangeDirectory}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-white/[0.1] transition-colors"
          >
            <IconFolderOpen size={14} />
            <span>{t("settings.workspace.changeDir") || "更换目录"}</span>
          </button>

          <button
            type="button"
            data-testid="workspace-rescan-btn"
            disabled={scanning}
            onClick={handleRescan}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-white/[0.1] transition-colors"
          >
            <IconRefresh size={14} className={scanning ? "animate-spin" : ""} />
            <span>{scanStatus || t("settings.workspace.rescan") || "重新扫描"}</span>
          </button>

          {isElectron && (
            <button
              type="button"
              data-testid="workspace-reveal-btn"
              onClick={handleReveal}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-white/[0.1] transition-colors"
            >
              <IconExternalLink size={14} />
              <span>{t("settings.workspace.revealInFinder") || "在访达中显示"}</span>
            </button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}

export function CanvasSettingsSection() {
  const { t } = useI18n();
  const { showRulers, setShowRulers } = useShowRulers();
  const label = t("settings.canvas.showRulers");
  return (
    <SettingsSection title={t("settings.canvas.title")} hint={t("settings.canvas.rulersHint")}>
      <div className="flex items-center justify-between gap-3 text-xs text-neutral-200">
        <span>{label}</span>
        <Switch
          testId="settings-show-rulers"
          checked={showRulers}
          onChange={setShowRulers}
          label={label}
        />
      </div>
    </SettingsSection>
  );
}

export default function SettingsGeneral() {
  const { t, locale } = useI18n();
  const user = useUserStore((s) => s.user);
  const isLoggedIn = Boolean(user?.isLoggedIn);
  const [identity, setIdentity] = useState(loadIdentity);
  const [broken, setBroken] = useState(false);

  const updateGuestIdentity = (patch) => {
    setIdentity((curr) => {
      const next = { ...curr, ...patch };
      saveIdentity(next);
      return next;
    });
  };

  const displayName = isLoggedIn
    ? user?.name || user?.email || t("collab.anonymous")
    : identity.name || t("collab.anonymous");

  const currentAvatar = identity.avatarSeed
    ? avatarUrl(identity.avatarSeed)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Profile Section */}
      <div
        data-testid="settings-profile-section"
        className="flex flex-col gap-3 rounded-2xl bg-neutral-900 p-4"
      >
        <p className="text-[9px] uppercase tracking-[0.14em] text-neutral-500 font-medium">
          <InfoHint
            label={t("settings.profile")}
            text={t("settings.profileHint")}
          />
        </p>

        <div className="flex items-center gap-3">
          <div
            data-testid="profile-avatar"
            className="relative flex h-10 w-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-xs font-medium text-neutral-100"
          >
            {initialsFor(displayName)}
            {currentAvatar && !broken ? (
              <img
                src={currentAvatar}
                alt=""
                draggable={false}
                onError={() => setBroken(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-neutral-200">
              {displayName}
            </span>
            <span className="text-[10px] text-neutral-500">
              {isLoggedIn ? user?.email : t("collab.guestBadge")}
            </span>
          </div>
        </div>

        {!isLoggedIn && (
          <label className="flex flex-col gap-1.5 pt-1">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              {t("collab.nameField")}
            </span>
            <input
              type="text"
              value={identity.name || ""}
              onChange={(e) => updateGuestIdentity({ name: e.target.value })}
              placeholder={t("collab.namePlaceholder")}
              className="w-full rounded-xl bg-[#191919] px-3 py-2 text-xs text-neutral-200 outline-none transition-colors placeholder:text-neutral-400 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/35"
            />
          </label>
        )}
      </div>

      <CanvasSettingsSection />

      {/* Workspace Directory Section */}
      <WorkspaceSettingsSection />

      {/* Language Section */}
      <SettingsSection
        title={t("settings.language")}
        hint={t("settings.languageHint")}
      >
        <div className="grid grid-cols-2 gap-2">
          {[
            { code: "zh", label: "简体中文" },
            { code: "en", label: "English" },
          ].map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className={`flex items-center justify-center rounded-xl p-3 text-xs transition-colors ${
                locale === code
                  ? "bg-white/[0.12] text-white font-medium"
                  : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
