import PropTypes from "prop-types";
import OnboardingFlatOption from "./onboarding_flat_option.jsx";
import { assetUrl } from "../../asset_url.js";

const AGENT_OPTIONS = [
  { id: "claude", name: "Claude Code", logo: "claude.svg", desc: "Anthropic 官方智能体，默认推荐" },
  { id: "codex", name: "OpenAI Codex", logo: "openai.svg", desc: "OpenAI 智能体，适合复杂逻辑" },
  { id: "antigravity", name: "Google Antigravity", logo: "antigravity.svg", desc: "Google 多智能体，端到端协作" },
];

/** Brand marks are drawn in their own colours; the mask paints them white so they match the flat UI. */
function AgentLogo({ src }) {
  return (
    <span
      aria-hidden="true"
      className="size-7 shrink-0 bg-white"
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskSize: "contain",
        maskPosition: "center",
        maskRepeat: "no-repeat",
      }}
    />
  );
}

AgentLogo.propTypes = {
  src: PropTypes.string.isRequired,
};

export default function StepAgentSelect({ selectedAgent, onSelectAgent }) {
  return (
    <div role="radiogroup" aria-label="默认智能体" className="flex flex-col gap-2">
      {AGENT_OPTIONS.map((opt) => (
        <OnboardingFlatOption
          key={opt.id}
          role="radio"
          testId={`onboarding-agent-option-${opt.id}`}
          leading={<AgentLogo src={assetUrl(`brand-icons/${opt.logo}`)} />}
          title={opt.name}
          description={opt.desc}
          selected={selectedAgent === opt.id}
          onSelect={() => onSelectAgent(opt.id)}
        />
      ))}
    </div>
  );
}

StepAgentSelect.propTypes = {
  selectedAgent: PropTypes.string.isRequired,
  onSelectAgent: PropTypes.func.isRequired,
};
