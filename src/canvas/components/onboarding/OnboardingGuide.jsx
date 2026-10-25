import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose } from "../../icons.jsx";
import { getSetting, setSetting } from "../../../shared/settings.js";
import { ElectronWorkspaceDriver } from "../../../services/workspace_storage.js";
import OnboardingArt from "./onboarding_art.jsx";
import { OnboardingStepProgress } from "./onboarding_step_progress.jsx";
import StepWorkspace from "./step_workspace.jsx";
import StepAgentSelect from "./step_agent_select.jsx";
import StepLocalDetect from "./step_local_detect.jsx";
import StepReady from "./step_ready.jsx";
import {
  GUIDE_STEP,
  ONBOARDING_STEPS,
  markOnboardingCompleted,
} from "./onboarding_state.js";

import { applyAgentModel } from "./onboarding_agent_model.js";
import { clearDraft, loadDraft, saveDraft } from "./onboarding_draft.js";
import { useI18n } from "../../use_i18n.js";

/** i18n key of each step's title. */
const STEP_TITLE_KEYS = {
  [GUIDE_STEP.WORKSPACE_SETUP]: "onboardingGuide.step.workspace",
  [GUIDE_STEP.AGENT_SELECT]: "onboardingGuide.step.agent",
  [GUIDE_STEP.LOCAL_DETECT]: "onboardingGuide.step.detect",
  [GUIDE_STEP.READY]: "onboardingGuide.step.ready",
};

/**
 * Applies default workspace directory settings and marks onboarding completed.
 * Used when the user skips onboarding or takes one-click default.
 */
export function applyDefaultWorkspaceOnboarding(isElectron = false, customAgent = null) {
  const defaultPath = isElectron ? "~/Documents/VOO/Projects" : "Virtual Workspace";
  const defaultType = isElectron ? "electron" : "web-idb";
  const defaultName = isElectron ? "VOO Projects" : "Virtual Workspace";

  setSetting("voo.workspace.path", defaultPath);
  setSetting("voo.workspace.type", defaultType);
  setSetting("voo.workspace.name", defaultName);
  setSetting("voo.workspace.lastScannedAt", Date.now());

  if (!getSetting("voo.agent.llmProvider")) {
    setSetting("voo.agent.llmProvider", customAgent || "claude");
  }
  applyAgentModel(customAgent || "claude");

  markOnboardingCompleted();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("voo:workspace-changed", {
        detail: { path: defaultPath, type: defaultType, name: defaultName },
      })
    );
  }

  return { path: defaultPath, type: defaultType, name: defaultName };
}

/**
 * Persists the user's selected agent and workspace configuration to settings.
 */
export function persistOnboardingConfig({ agent, workspaceConfig, isElectron = false }) {
  setSetting("voo.agent.llmProvider", agent || "claude");
  applyAgentModel(agent || "claude");
  if (workspaceConfig?.path) {
    const finalType = workspaceConfig.type || (isElectron ? "electron" : "web-idb");
    const finalName = workspaceConfig.name || (isElectron ? "VOO Projects" : "Virtual Workspace");
    setSetting("voo.workspace.path", workspaceConfig.path);
    setSetting("voo.workspace.type", finalType);
    setSetting("voo.workspace.name", finalName);
    setSetting("voo.workspace.lastScannedAt", Date.now());

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("voo:workspace-changed", {
          detail: { path: workspaceConfig.path, type: finalType, name: finalName },
        })
      );
    }
  }
  markOnboardingCompleted();
}

export default function OnboardingGuide({ open, onClose, steps = ONBOARDING_STEPS }) {
  const { t } = useI18n();
  const isElectron = ElectronWorkspaceDriver.isAvailable();
  const [stepIndex, setStepIndex] = useState(() => {
    const draft = loadDraft();
    return typeof draft?.stepIndex === "number" && draft.stepIndex >= 0 && draft.stepIndex < steps.length
      ? draft.stepIndex
      : 0;
  });
  const [selectedAgent, setSelectedAgent] = useState(() => {
    const draft = loadDraft();
    return draft?.selectedAgent || "claude";
  });
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);
  const contentRef = useRef(null);

  // Reset scroll position on step transition
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [stepIndex]);

  const [workspaceConfig, setWorkspaceConfig] = useState(() => {
    const draft = loadDraft();
    if (draft?.workspaceConfig) {
      return draft.workspaceConfig;
    }
    const savedPath = getSetting("voo.workspace.path");
    const savedType = getSetting("voo.workspace.type");
    const savedName = getSetting("voo.workspace.name");
    if (savedPath) {
      return {
        path: savedPath,
        type: savedType || (isElectron ? "electron" : "web-idb"),
        name: savedName || (isElectron ? "VOO Projects" : "Virtual Workspace"),
        isDefault: false,
        isConfigured: true,
      };
    }
    if (isElectron) {
      return {
        path: "~/Documents/VOO/Projects",
        type: "electron",
        name: "VOO Projects",
        isDefault: true,
        isConfigured: false,
      };
    }
    return {
      path: "Virtual Workspace",
      type: "web-idb",
      name: "Virtual Workspace",
      isDefault: true,
      isConfigured: false,
    };
  });

  // Recover draft state on mount or reset when modal opens
  useEffect(() => {
    if (open) {
      finishingRef.current = false;
      setFinishing(false);

      const draft = loadDraft();
      if (draft) {
        if (typeof draft.stepIndex === "number" && draft.stepIndex >= 0 && draft.stepIndex < steps.length) {
          setStepIndex(draft.stepIndex);
        } else {
          setStepIndex(0);
        }
        if (draft.selectedAgent) {
          setSelectedAgent(draft.selectedAgent);
        }
        if (draft.workspaceConfig) {
          setWorkspaceConfig(draft.workspaceConfig);
        }
      } else {
        setStepIndex(0);
      }

      // Fetch default directory in Electron if available
      if (isElectron && window.electronAPI?.workspace?.getDefaultDirectory) {
        window.electronAPI.workspace.getDefaultDirectory()
          .then((defaultDir) => {
            if (defaultDir) {
              setWorkspaceConfig((prev) => {
                if (prev.isDefault) {
                  return { ...prev, path: defaultDir };
                }
                return prev;
              });
            }
          })
          .catch(() => {});
      }
    }
  }, [open, isElectron, steps.length]);

  // Persist draft on step or selection change
  useEffect(() => {
    if (open && !finishingRef.current) {
      saveDraft({
        stepIndex,
        selectedAgent,
        workspaceConfig,
      });
    }
  }, [open, stepIndex, selectedAgent, workspaceConfig]);

  const handleFinish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    clearDraft();
    try {
      persistOnboardingConfig({
        agent: selectedAgent,
        workspaceConfig,
        isElectron,
      });
    } catch {
      // ignore
    }
    onClose?.();
  }, [selectedAgent, workspaceConfig, isElectron, onClose]);

  const handleSkip = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    clearDraft();
    try {
      applyDefaultWorkspaceOnboarding(isElectron, selectedAgent);
    } catch {
      // ignore
    }
    onClose?.();
  }, [isElectron, selectedAgent, onClose]);

  const handleNext = useCallback(() => {
    if (finishingRef.current) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    } else {
      handleFinish();
    }
  }, [stepIndex, steps.length, handleFinish]);

  const handlePrev = useCallback(() => {
    if (finishingRef.current) return;
    if (stepIndex > 0) {
      setStepIndex((prev) => Math.max(0, prev - 1));
    }
  }, [stepIndex]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleSkip]);

  if (!open) return null;

  const currentStep = steps[stepIndex] || steps[0];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-guide-title"
      data-testid="onboarding-guide-modal"
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70"
    >
      {/* One fixed height for every step so the frame does not jump between them. */}
      <div className="relative flex h-[min(656px,90dvh)] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-[#161616] border border-white/10 shadow-panel lg:max-w-[960px] lg:flex-row">
        <OnboardingArt
          name="onboarding/cover.webp"
          className="hidden shrink-0 lg:block lg:h-full lg:w-1/3"
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
            <OnboardingStepProgress
              stepIndex={stepIndex}
              steps={steps}
              label={t("onboarding.stepOf", { current: stepIndex + 1, total: steps.length })}
            />
            <span
              data-testid="onboarding-step-counter"
              aria-hidden="true"
              className="shrink-0 text-[10px] font-medium tabular-nums text-neutral-400"
            >
              {stepIndex + 1} / {steps.length}
            </span>
            <div className="order-last flex w-full items-center gap-1.5">
              <h2
                id="onboarding-guide-title"
                tabIndex={-1}
                className="text-xs font-medium leading-relaxed text-neutral-100 outline-none"
              >
                {STEP_TITLE_KEYS[currentStep] ? t(STEP_TITLE_KEYS[currentStep]) : ""}
              </h2>
            </div>
            <button
              type="button"
              data-testid="onboarding-close-btn"
              disabled={finishing}
              onClick={handleSkip}
              title={t("onboardingGuide.close")}
              aria-label={t("onboardingGuide.close")}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200 transition-colors disabled:opacity-40"
            >
              <IconClose size={14} />
            </button>
          </div>

          <div
            ref={contentRef}
            data-testid="onboarding-scroll-content"
            className="ui-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 pb-6 pt-2"
          >
            {currentStep === GUIDE_STEP.WORKSPACE_SETUP && (
              <StepWorkspace
                workspaceConfig={workspaceConfig}
                onSelectConfig={setWorkspaceConfig}
              />
            )}
            {currentStep === GUIDE_STEP.AGENT_SELECT && (
              <StepAgentSelect
                selectedAgent={selectedAgent}
                onSelectAgent={setSelectedAgent}
              />
            )}
            {currentStep === GUIDE_STEP.LOCAL_DETECT && (
              <StepLocalDetect selectedAgent={selectedAgent} />
            )}
            {currentStep === GUIDE_STEP.READY && (
              <StepReady
                selectedAgent={selectedAgent}
                workspaceConfig={workspaceConfig}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#121212] px-6 py-4">
            <button
              type="button"
              data-testid="onboarding-skip-btn"
              disabled={finishing}
              onClick={handleSkip}
              className="rounded-lg px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-40"
            >
              {t("onboardingGuide.skip")}
            </button>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  type="button"
                  data-testid="onboarding-prev-btn"
                  disabled={finishing}
                  onClick={handlePrev}
                  className="rounded-lg bg-white/[0.06] px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-white/[0.12] transition-colors disabled:opacity-40"
                >
                  {t("onboarding.back")}
                </button>
              )}
              <button
                type="button"
                data-testid="onboarding-next-btn"
                disabled={finishing}
                onClick={handleNext}
                className="rounded-lg bg-[#a7ffd4] px-5 py-2 text-xs font-medium text-black hover:bg-[#a7ffd4]/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                {isLastStep ? t("onboardingGuide.enterCanvas") : t("onboarding.next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

OnboardingGuide.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  steps: PropTypes.arrayOf(PropTypes.string),
};
