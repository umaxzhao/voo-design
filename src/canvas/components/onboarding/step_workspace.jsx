import PropTypes from "prop-types";
import { useCallback, useEffect, useState } from "react";
import OnboardingFlatOption from "./onboarding_flat_option.jsx";
import { workspaceStorage, ElectronWorkspaceDriver, WebFsaWorkspaceDriver } from "../../../services/workspace_storage.js";

const DEFAULT_DESKTOP_PATH = "~/Documents/VOO/Projects";
const DEFAULT_VIRTUAL_PATH = "Virtual Workspace";

export default function StepWorkspace({ workspaceConfig, onSelectConfig }) {
  const isElectron = ElectronWorkspaceDriver.isAvailable();
  const hasFsa = WebFsaWorkspaceDriver.isAvailable();
  const [defaultDesktopPath, setDefaultDesktopPath] = useState(DEFAULT_DESKTOP_PATH);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    if (isElectron && window.electronAPI?.workspace?.getDefaultDirectory) {
      window.electronAPI.workspace.getDefaultDirectory()
        .then((dir) => {
          if (active && dir) setDefaultDesktopPath(dir);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [isElectron]);

  const activeType = workspaceConfig?.type || (isElectron ? "electron" : "web-idb");
  const activePath = workspaceConfig?.path || (isElectron ? defaultDesktopPath : DEFAULT_VIRTUAL_PATH);

  const selectNative = useCallback(
    (path, isDefault) => {
      setErrorMsg("");
      onSelectConfig?.({ path, type: "electron", name: "VOO Projects", isDefault, isConfigured: true });
    },
    [onSelectConfig],
  );

  const handleChooseCustomNative = useCallback(async () => {
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await workspaceStorage.chooseDirectory();
      if (res.ok && res.config) {
        selectNative(res.config.path, false);
      } else if (!res.canceled && res.error) {
        setErrorMsg(res.error);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to select directory");
    } finally {
      setLoading(false);
    }
  }, [selectNative]);

  const handleSelectVirtual = useCallback(() => {
    setErrorMsg("");
    onSelectConfig?.({
      path: DEFAULT_VIRTUAL_PATH,
      type: "web-idb",
      name: "Virtual Workspace",
      isDefault: false,
      isConfigured: true,
    });
  }, [onSelectConfig]);

  const handleChooseWebFsa = useCallback(async () => {
    if (!hasFsa) {
      setErrorMsg("当前浏览器不支持本地文件夹挂载，推荐使用沙盒工作区。");
      handleSelectVirtual();
      return;
    }
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await workspaceStorage.chooseDirectory();
      if (res.ok && res.config) {
        onSelectConfig?.({
          path: res.config.path,
          type: res.config.type || "web-fsa",
          name: res.config.path,
          isDefault: false,
          isConfigured: true,
        });
      } else if (!res.canceled && res.error) {
        setErrorMsg(res.error);
      }
    } catch (err) {
      setErrorMsg(err.message || "File System Access API failed");
    } finally {
      setLoading(false);
    }
  }, [hasFsa, handleSelectVirtual, onSelectConfig]);

  const isNativeSelected = activeType === "electron";
  const isFsaSelected = activeType === "web-fsa";
  const isVirtualSelected = activeType === "web-idb";

  return (
    <div data-testid="onboarding-step-workspace" className="flex flex-col gap-3">
      {isElectron ? (
        <OnboardingFlatOption
          testId="workspace-option-native"
          title="本地磁盘"
          description={defaultDesktopPath}
          selected={isNativeSelected}
          onSelect={() => selectNative(defaultDesktopPath, true)}
        >
          <button
            type="button"
            data-testid="workspace-option-native-custom"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              handleChooseCustomNative();
            }}
            className="mt-1 w-fit text-[11px] font-medium text-neutral-300 underline-offset-2 hover:text-white hover:underline disabled:opacity-40"
          >
            {loading ? "选择中..." : "选择其他目录"}
          </button>
        </OnboardingFlatOption>
      ) : (
        <OnboardingFlatOption
          testId="workspace-option-fsa"
          title="本地文件夹"
          description={hasFsa ? "授权后直接读写所选文件夹" : "当前浏览器不支持直接挂载"}
          selected={isFsaSelected}
          onSelect={handleChooseWebFsa}
        >
          {hasFsa && (
            <button
              type="button"
              data-testid="workspace-option-fsa-btn"
              disabled={loading}
              onClick={(event) => {
                event.stopPropagation();
                handleChooseWebFsa();
              }}
              className="mt-1 w-fit text-[11px] font-medium text-neutral-300 underline-offset-2 hover:text-white hover:underline disabled:opacity-40"
            >
              {loading ? "选择中..." : "选择文件夹"}
            </button>
          )}
        </OnboardingFlatOption>
      )}

      <OnboardingFlatOption
        testId="workspace-option-virtual"
        title="沙盒工作区"
        description="保存在浏览器内，无需授权"
        selected={isVirtualSelected}
        onSelect={handleSelectVirtual}
      />

      {errorMsg && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{errorMsg}</p>
      )}

      <p className="px-1 text-[11px] text-neutral-400">
        已选：
        <span data-testid="onboarding-selected-workspace-path" className="font-mono text-neutral-200">
          {activePath}
        </span>
      </p>
    </div>
  );
}

StepWorkspace.propTypes = {
  workspaceConfig: PropTypes.shape({
    path: PropTypes.string,
    type: PropTypes.string,
    name: PropTypes.string,
    isDefault: PropTypes.bool,
    isConfigured: PropTypes.bool,
  }),
  onSelectConfig: PropTypes.func.isRequired,
};
