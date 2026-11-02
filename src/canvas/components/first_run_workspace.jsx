import { useEffect, useReducer } from "react";
import { useI18n } from "../use_i18n.js";
import { getSetting } from "../../shared/settings.js";
import { workspaceStorage, ElectronWorkspaceDriver, WebFsaWorkspaceDriver } from "../../services/workspace_storage.js";
import { IconFolderOpen } from "../icons.jsx";

const initialState = () => ({
  path: getSetting("voo.workspace.path") || "",
  type: workspaceStorage.getDriverType(),
  busy: false,
  error: "",
});
const updateState = (state, patch) => ({ ...state, ...patch });

/** Configure the same workspace used by project creation and file storage. */
export default function FirstRunWorkspace() {
  const { t } = useI18n();
  const [state, update] = useReducer(updateState, undefined, initialState);
  const isDesktop = ElectronWorkspaceDriver.isAvailable();
  const canChooseDirectory = isDesktop || WebFsaWorkspaceDriver.isAvailable();

  useEffect(() => {
    let active = true;
    workspaceStorage.getConfig().then(config => {
      if (active) update({ path: config.path || "", type: config.type });
    }).catch(error => {
      console.error("[VOO] Workspace configuration failed", error);
      if (active) update({ error: t("firstRun.workspace.failed") });
    });
    return () => { active = false; };
  }, [t]);

  const configure = async operation => {
    update({ busy: true, error: "" });
    try {
      const result = await operation();
      if (result.ok && result.config) {
        update({ path: result.config.path, type: result.config.type });
      } else if (!result.canceled) {
        update({ error: t("firstRun.workspace.failed") });
      }
    } catch (error) {
      console.error("[VOO] Workspace directory could not be configured", error);
      update({ error: t("firstRun.workspace.failed") });
    } finally {
      update({ busy: false });
    }
  };

  return (
    <form data-testid="first-run-workspace" aria-busy={state.busy}
      onSubmit={event => {
        event.preventDefault();
        if (isDesktop && state.path.trim()) void configure(() => workspaceStorage.setDirectory(state.path.trim()));
      }}
      className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-4">
      <label htmlFor="first-run-workspace-path" className="text-xs font-medium text-neutral-200">
        {t("firstRun.workspace.label")}
      </label>
      <div className="flex min-h-12 items-center rounded-lg bg-white/[0.06] focus-within:ring-1 focus-within:ring-white/40">
        <input id="first-run-workspace-path" data-testid="first-run-workspace-path"
          type="text" value={state.type === "web-idb" ? t("firstRun.workspace.browserDefault") : state.path}
          readOnly={!isDesktop} disabled={state.busy}
          aria-describedby="first-run-workspace-description"
          placeholder={t("firstRun.workspace.placeholder")}
          onChange={event => update({ path: event.target.value, error: "" })}
          className="min-h-12 min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-[11px] text-neutral-200 outline-none" />
        <button type="button" data-testid="first-run-workspace-choose"
          aria-label={t("firstRun.workspace.choose")} title={t("firstRun.workspace.choose")}
          disabled={state.busy || !canChooseDirectory}
          onClick={() => void configure(() => workspaceStorage.chooseDirectory())}
          className="flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 disabled:opacity-40">
          <IconFolderOpen size={16} />
        </button>
      </div>
      <p id="first-run-workspace-description" className="text-[11px] leading-relaxed text-neutral-400">
        {t(isDesktop ? "firstRun.workspace.desktopHint" : "firstRun.workspace.browserHint")}
      </p>
      {state.error && <p role="alert" className="text-[11px] text-rose-400">{state.error}</p>}
    </form>
  );
}
