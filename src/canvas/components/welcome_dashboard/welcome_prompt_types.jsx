import PropTypes from "prop-types";
import FlatSelect from "../flat_select.jsx";
import { AI_GEN_TYPES } from "./welcome_constants.js";

/** Design types share the advanced panel instead of a second persistent row. */
export default function WelcomePromptTypes({
  t,
  activePill,
  onSelectPill
}) {
  return <FlatSelect value={activePill} onChange={value => onSelectPill?.(value)} label={t("welcome.prompt.generationTypeLabel")} options={AI_GEN_TYPES.map(type => ({
    value: type.id,
    label: t(type.label)
  }))} className="welcome-composer-select w-full min-w-0" triggerClassName="!h-9 !w-full !rounded-xl !border !border-white/10 !bg-[#202020] !px-2 !text-xs" panelClassName="!z-[400]" portal />;
}
WelcomePromptTypes.propTypes = {
  t: PropTypes.func.isRequired,
  activePill: PropTypes.string,
  onSelectPill: PropTypes.func
};
