import PropTypes from "prop-types";
import FlatSelect from "../flat_select.jsx";
import { ProviderLogo } from "../provider_icons.jsx";
import { getModelDisplayParts } from "../agent-panel/model_catalog.js";

/** Render outside the welcome scroll container so every model remains reachable. */
export default function WelcomeModelSelect({
  label,
  modelGroups = [],
  selectedModel,
  onSelectModel,
  className = "min-w-0 flex-1",
  triggerClassName = "!h-9 !w-full !max-w-64 !rounded-xl !bg-transparent !px-2 !text-xs !text-neutral-300 hover:!bg-white/[0.06]",
}) {
  const options = modelGroups.flatMap((group) =>
    group.models.map((model) => {
      const parts = getModelDisplayParts(model.id, modelGroups);
      return {
        value: model.id,
        label: `${parts.modelName}${parts.tier}`,
        icon: (
          <ProviderLogo
            providerId={parts.providerId ?? group.cliId}
            size={14}
          />
        ),
      };
    }),
  );
  return (
    <FlatSelect
      value={selectedModel ?? ""}
      onChange={onSelectModel}
      label={label}
      options={options}
      className={`welcome-composer-model-select ${className}`}
      triggerClassName={triggerClassName}
      panelClassName="!z-[400]"
      portal
    />
  );
}

WelcomeModelSelect.propTypes = {
  label: PropTypes.string.isRequired,
  modelGroups: PropTypes.array,
  selectedModel: PropTypes.string,
  onSelectModel: PropTypes.func,
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
};
