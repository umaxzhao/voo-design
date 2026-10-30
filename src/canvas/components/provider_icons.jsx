import PropTypes from "prop-types";
import { PROVIDER_ID } from "../../shared/providers.js";
import { assetUrl } from "../asset_url.js";
import { IconApi, ICON_STROKE_WIDTH } from "../icons.jsx";

// Use sourced provider marks; never substitute a hand-drawn lookalike.
const PROVIDER_MARKS = Object.freeze({
  "claude-cli": "claude",
  cli: "openai",
  "antigravity-cli": "antigravity",
  "deepseek-harness": "deepseek",
  "deepseek-harness-models": "deepseek",
  "deepseek-cli": "deepseek",
  [PROVIDER_ID.DASHSCOPE]: "alibabacloud",
  [PROVIDER_ID.ZHIPU]: "zhipu",
  [PROVIDER_ID.DEEPSEEK]: "deepseek",
  [PROVIDER_ID.OPENROUTER]: "openrouter",
  [PROVIDER_ID.VOLCENGINE]: "volcengine",
  [PROVIDER_ID.AI_302]: "ai302",
  [PROVIDER_ID.APIMART]: "apimart",
  [PROVIDER_ID.MINIMAX]: "minimax",
  [PROVIDER_ID.MOONSHOT]: "moonshot",
  [PROVIDER_ID.XAI]: "xai",
  [PROVIDER_ID.NOVITA]: "novita",
  [PROVIDER_ID.BAIDU]: "baidu",
  [PROVIDER_ID.ANTHROPIC]: "anthropic",
  [PROVIDER_ID.OPENAI]: "openai",
  [PROVIDER_ID.CHATGPT]: "openai",
  chatgpt: "openai",
  [PROVIDER_ID.GEMINI]: "gemini",
  [PROVIDER_ID.QINIU]: "qiniu",
  [PROVIDER_ID.MODELSCOPE]: "modelscope",
  [PROVIDER_ID.STEPFUN]: "stepfun",
  [PROVIDER_ID.YI]: "yi",
  [PROVIDER_ID.TRIPO_WEB]: "tripo",
  tripo: "tripo",
  "tripo-web": "tripo",
  qwen: "qwen",
  lightricks: "lightricks",
  ltx: "lightricks",
});

export function hasProviderLogo(providerId) {
  return (
    providerId === PROVIDER_ID.CREDITS ||
    providerId === "credits" ||
    providerId === "voo" ||
    providerId === "voo_credits" ||
    Object.hasOwn(PROVIDER_MARKS, providerId)
  );
}

export function ProviderLogo({ providerId, size = 16, className = "" }) {
  const isCredits =
    providerId === PROVIDER_ID.CREDITS ||
    providerId === "credits" ||
    providerId === "voo" ||
    providerId === "voo_credits";
  const mark = PROVIDER_MARKS[providerId];
  if (!mark && !isCredits) {
    return (
      <IconApi
        aria-hidden="true"
        size={size}
        strokeWidth={ICON_STROKE_WIDTH}
        className={`shrink-0 text-neutral-400 ${className}`}
      />
    );
  }

  return (
    <img
      src={assetUrl(
        isCredits
          ? "voo-mark.svg"
          : `brand-icons/${mark}.svg`,
      )}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-contain brightness-0 invert ${className}`}
    />
  );
}

ProviderLogo.propTypes = {
  providerId: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
};
