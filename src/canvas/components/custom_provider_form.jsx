import PropTypes from "prop-types";
import { useState } from "react";
import {
  formatCustomModels,
  isValidCustomBaseUrl,
  parseCustomModels,
} from "../../shared/custom_providers.js";
import { useI18n } from "../use_i18n.js";

const inputClass =
  "w-full rounded-xl bg-[#191919] px-3 py-2.5 text-xs text-neutral-200 outline-none transition-colors placeholder:text-neutral-400 hover:bg-[#1d1d1d] focus:bg-[#202020] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/35";

export default function CustomProviderForm({
  initialProvider = null,
  onSave,
  onCancel,
}) {
  const { t } = useI18n();
  const isEdit = Boolean(initialProvider?.id);

  const [name, setName] = useState(
    initialProvider?.name || initialProvider?.label || "",
  );
  const [baseUrl, setBaseUrl] = useState(initialProvider?.defaultBaseUrl || "");
  const [protocol, setProtocol] = useState(
    initialProvider?.protocol || "openai",
  );
  const [protocolModified, setProtocolModified] = useState(
    Boolean(initialProvider?.protocol),
  );
  const [modelsText, setModelsText] = useState(
    initialProvider?.models ? formatCustomModels(initialProvider.models) : "",
  );
  const [nameError, setNameError] = useState("");
  const [urlError, setUrlError] = useState("");

  const handleBaseUrlChange = (value) => {
    setBaseUrl(value);
    setUrlError("");
    if (!protocolModified) {
      if (value.includes("dashscope") || value.includes("uiodesign")) {
        setProtocol("dashscope");
      } else {
        setProtocol("openai");
      }
    }
  };

  const handleNameChange = (value) => {
    setName(value);
    setNameError("");
  };

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    let hasError = false;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t("settings.customProvider.nameRequired"));
      hasError = true;
    }

    const trimmedUrl = baseUrl.trim();
    if (!trimmedUrl || !isValidCustomBaseUrl(trimmedUrl)) {
      setUrlError(t("settings.customProvider.baseUrlInvalid"));
      hasError = true;
    }

    if (hasError) return;

    const parsedModels = parseCustomModels(modelsText);
    onSave({
      id: initialProvider?.id,
      name: trimmedName,
      defaultBaseUrl: trimmedUrl,
      protocol,
      models: parsedModels,
    });
  };

  return (
    <form
      data-testid="custom-provider-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl bg-[#121212] p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-neutral-100">
          {isEdit
            ? t("settings.customProvider.titleEdit")
            : t("settings.customProvider.titleAdd")}
        </h3>
      </div>

      {/* Name Field */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {t("settings.customProvider.name")}
        </span>
        <input
          type="text"
          data-testid="custom-provider-name-input"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder={t("settings.customProvider.namePlaceholder")}
          className={inputClass}
          autoComplete="off"
          spellCheck={false}
        />
        {nameError ? (
          <span
            data-testid="custom-provider-name-error"
            className="text-[10px] text-rose-400"
          >
            {nameError}
          </span>
        ) : null}
      </label>

      {/* Base URL Field */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {t("settings.customProvider.baseUrl")}
        </span>
        <input
          type="text"
          data-testid="custom-provider-url-input"
          value={baseUrl}
          onChange={(e) => handleBaseUrlChange(e.target.value)}
          placeholder={t("settings.customProvider.baseUrlPlaceholder")}
          className={inputClass}
          autoComplete="off"
          spellCheck={false}
        />
        {urlError ? (
          <span
            data-testid="custom-provider-url-error"
            className="text-[10px] text-rose-400"
          >
            {urlError}
          </span>
        ) : null}
      </label>

      {/* Protocol Selection */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {t("settings.customProvider.protocol")}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="protocol-openai-btn"
            onClick={() => {
              setProtocol("openai");
              setProtocolModified(true);
            }}
            className={`flex-1 rounded-lg px-2.5 py-2 text-left text-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              protocol === "openai"
                ? "bg-white/[0.12] text-neutral-100 font-medium"
                : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
            }`}
          >
            {t("settings.customProvider.protocolOpenAI")}
          </button>
          <button
            type="button"
            data-testid="protocol-dashscope-btn"
            onClick={() => {
              setProtocol("dashscope");
              setProtocolModified(true);
            }}
            className={`flex-1 rounded-lg px-2.5 py-2 text-left text-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              protocol === "dashscope"
                ? "bg-white/[0.12] text-neutral-100 font-medium"
                : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08] hover:text-neutral-200"
            }`}
          >
            {t("settings.customProvider.protocolDashScope")}
          </button>
        </div>
      </div>

      {/* Models Field */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
          {t("settings.customProvider.models")}
        </span>
        <textarea
          data-testid="custom-provider-models-input"
          value={modelsText}
          onChange={(e) => setModelsText(e.target.value)}
          placeholder={t("settings.customProvider.modelsPlaceholder")}
          rows={2}
          className={`${inputClass} resize-none`}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="text-[9px] leading-relaxed text-neutral-500">
          {t("settings.customProvider.modelsHint")}
        </span>
      </label>

      {/* Actions */}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-testid="custom-provider-cancel-btn"
          onClick={onCancel}
          className="rounded-xl bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/[0.12] hover:text-white"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          data-testid="custom-provider-save-btn"
          className="flex-1 rounded-xl bg-white px-3.5 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200"
        >
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

CustomProviderForm.propTypes = {
  initialProvider: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    label: PropTypes.string,
    defaultBaseUrl: PropTypes.string,
    protocol: PropTypes.string,
    models: PropTypes.array,
  }),
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
