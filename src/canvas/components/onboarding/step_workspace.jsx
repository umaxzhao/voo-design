import PropTypes from "prop-types";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import OnboardingFlatOption from "./onboarding_flat_option.jsx";
import { workspaceStorage, ElectronWorkspaceDriver, WebFsaWorkspaceDriver } from "../../../services/workspace_storage.js";

const DEFAULT_DESKTOP_PATH = "~/Documents/VOO/Projects";
const DEFAULT_VIRTUAL_PATH = "Virtual Workspace";

export default function StepWorkspace({ workspaceConfig, onSelectConfig }) {
  const { t } = useI18n();
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
      setErrorMsg(err.message || t("onboardingGuide.workspace.chooseFailed"));
    } finally {
      setLoading(false);
    }
  }, [selectNative, t]);

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
      setErrorMsg(t("onboardingGuide.workspace.fsaUnsupported"));
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
      setErrorMsg(err.message || t("onboardingGuide.workspace.fsaFailed"));
    } finally {
      setLoading(false);
    }
  }, [hasFsa, handleSelectVirtual, onSelectConfig, t]);

  const isNativeSelected = activeType === "electron";
  const isFsaSelected = activeType === "web-fsa";
  const isVirtualSelected = activeType === "web-idb";

  return (
    <div data-testid="onboarding-step-workspace" className="flex flex-col gap-3">
      {isElectron ? (
        <OnboardingFlatOption
          testId="workspace-option-native"
          title={t("onboardingGuide.workspace.native")}
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
            {loading ? t("onboardingGuide.workspace.choosing") : t("onboardingGuide.workspace.nativeCustom")}
          </button>
        </OnboardingFlatOption>
      ) : (
        <OnboardingFlatOption
          testId="workspace-option-fsa"
          title={t("onboardingGuide.workspace.fsa")}
          description={hasFsa ? t("onboardingGuide.workspace.fsaAvailable") : t("onboardingGuide.workspace.fsaUnavailable")}
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
              {loading ? t("onboardingGuide.workspace.choosing") : t("onboardingGuide.workspace.fsaChoose")}
            </button>
          )}
        </OnboardingFlatOption>
      )}

      <OnboardingFlatOption
        testId="workspace-option-virtual"
        title={t("onboardingGuide.workspace.virtual")}
        description={t("onboardingGuide.workspace.virtualDesc")}
        selected={isVirtualSelected}
        onSelect={handleSelectVirtual}
      />

      {errorMsg && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{errorMsg}</p>
      )}

      <p className="px-1 text-[11px] text-neutral-400">
        {t("onboardingGuide.workspace.selected")}
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
