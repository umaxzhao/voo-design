import PropTypes from "prop-types";
import { ProviderLogo } from "../provider_icons.jsx";
import { getModelDisplayParts } from "./model_catalog.js";

/** Compact model name: provider mark followed directly by model and tier. */
export default function AgentModelLabel({ modelId, size = 12, className = "" }) {
  const { providerId, platformName, modelName, tier } = getModelDisplayParts(modelId);
  const accessibleName = [platformName, modelName, tier].filter(Boolean).join(" ");

  return (
    <span
      aria-label={accessibleName}
      className={`inline-flex min-w-0 items-center overflow-hidden whitespace-nowrap ${className}`}
      data-testid="agent-model-name"
    >
      {providerId ? (
        <ProviderLogo
          providerId={providerId}
          size={size}
          className="mr-0"
        />
      ) : null}
      <span className="truncate">{modelName}{tier}</span>
    </span>
  );
}

AgentModelLabel.propTypes = {
  modelId: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
};
