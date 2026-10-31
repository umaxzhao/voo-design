import React from "react";
import PropTypes from "prop-types";
import WelcomePromptTypes from "./welcome_prompt_types.jsx";
import FlatSelect from "../flat_select.jsx";
import { AUTO_SIZE_ID, DEFAULT_STYLE_ID, DEFAULT_DESIGN_SYSTEM_ID } from "./generation-options.js";

/** One secondary home for every advanced generation option. */
export default function WelcomePromptSettings({
  t,
  panelRef,
  panelPos,
  activePill,
  onSelectPill,
  styleId,
  styleOptions,
  onSelectStyle,
  designSystemId,
  designSystemOptions,
  onSelectDesignSystem,
  candidates,
  onSelectCandidates,
  currentSize,
  sizeOptions,
  onSelectSize
}) {
  return <div ref={panelRef} role="dialog" aria-label={t("welcome.prompt.settingsLabel")} className="welcome-composer-settings fixed z-[250] w-80 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#171717] p-3 shadow-panel" style={panelPos ?? {
    left: -9999,
    top: 0
  }}>
          <div className="welcome-composer-settings-grid space-y-2">
            <div className="col-span-full"><WelcomePromptTypes t={t} activePill={activePill} onSelectPill={onSelectPill} /></div>
            <ComposerField label={t("welcome.prompt.styleLabel")}>
              <FlatSelect value={styleId ?? DEFAULT_STYLE_ID} onChange={value => onSelectStyle?.(value)} disabled={designSystemId !== DEFAULT_DESIGN_SYSTEM_ID} label={t("welcome.prompt.styleLabel")} options={[{
          value: DEFAULT_STYLE_ID,
          label: t("welcome.prompt.styleAuto")
        }, ...(styleOptions ?? []).map(style => ({
          value: style.id,
          label: style.name
        }))]} className="welcome-composer-select w-full min-w-0" triggerClassName="!h-9 !w-full !rounded-xl !border !border-white/10 !bg-[#202020] !px-2 !text-xs" panelClassName="!z-[400]" portal />
            </ComposerField>

            <ComposerField label={t("welcome.prompt.designSystem")}>
              <FlatSelect value={designSystemId} onChange={value => onSelectDesignSystem?.(value)} label={t("welcome.prompt.designSystem")} options={(designSystemOptions ?? []).map(system => ({
          value: system.id,
          label: system.label
        }))} className="welcome-composer-select w-full min-w-0" triggerClassName="!h-9 !w-full !rounded-xl !border !border-white/10 !bg-[#202020] !px-2 !text-xs" panelClassName="!z-[400]" portal />
            </ComposerField>

            <ComposerField label={t("welcome.prompt.candidates")}>
              <FlatSelect value={candidates} onChange={value => onSelectCandidates?.(Number(value))} label={t("welcome.prompt.candidates")} options={[1, 2, 3].map(count => ({
          value: count,
          label: t("welcome.prompt.candidateN", {
            n: count
          })
        }))} className="welcome-composer-select w-full min-w-0" triggerClassName="!h-9 !w-full !rounded-xl !border !border-white/10 !bg-[#202020] !px-2 !text-xs" panelClassName="!z-[400]" portal />
            </ComposerField>
            <ComposerField label={t("welcome.prompt.sizeLabel")}>
              <FlatSelect value={currentSize ? `${currentSize.width}x${currentSize.height}` : AUTO_SIZE_ID} onChange={value => {
          if (value === AUTO_SIZE_ID) {
            onSelectSize?.(null);
            return;
          }
          const option = sizeOptions?.find(item => `${item.width}x${item.height}` === value);
          if (option) onSelectSize?.({
            width: option.width,
            height: option.height
          });
        }} label={t("welcome.prompt.sizeLabel")} options={[{ value: AUTO_SIZE_ID, label: t("welcome.prompt.sizeAuto") }, ...(sizeOptions ?? []).map(option => ({
          value: `${option.width}x${option.height}`,
          label: `${option.width} × ${option.height}`
        }))]} className="welcome-composer-select w-full min-w-0" triggerClassName="!h-9 !w-full !rounded-xl !border !border-white/10 !bg-[#202020] !px-2 !text-xs" panelClassName="!z-[400]" portal />
            </ComposerField>
              </div>
              </div>;
}
function ComposerField({
  label,
  children
}) {
  return <div className="welcome-composer-field flex items-center gap-2">
      <span className="welcome-composer-field-label w-24 shrink-0 truncate text-[10px] text-neutral-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>;
}
ComposerField.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired
};
WelcomePromptSettings.propTypes = {
  t: PropTypes.func.isRequired,
  panelRef: PropTypes.object.isRequired,
  panelPos: PropTypes.object,
  activePill: PropTypes.string,
  onSelectPill: PropTypes.func,
  styleId: PropTypes.string,
  styleOptions: PropTypes.array,
  onSelectStyle: PropTypes.func,
  designSystemId: PropTypes.string,
  designSystemOptions: PropTypes.array,
  onSelectDesignSystem: PropTypes.func,
  candidates: PropTypes.number,
  onSelectCandidates: PropTypes.func,
  currentSize: PropTypes.shape({
    width: PropTypes.number,
    height: PropTypes.number
  }),
  sizeOptions: PropTypes.array,
  onSelectSize: PropTypes.func
};
