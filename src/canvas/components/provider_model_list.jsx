import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import {
  IconAdd,
  IconCheck,
  IconClose,
  IconEdit,
  IconRefresh,
  IconTrash,
} from "../icons.jsx";
import { listProviderModels } from "../provider_client.js";
import {
  addProviderModel,
  mediaTypesFor,
  mergeFetchedModels,
  providerModelList,
  PROVIDER_MODELS_KEY,
  removeProviderModel,
  updateProviderModel,
} from "../../shared/provider_models.js";
import { API_MEDIA_TYPE } from "../../shared/providers.js";
import {
  getSettingAsync,
  onSettingChange,
  setSetting,
} from "../../shared/settings.js";
import { useI18n } from "../use_i18n.js";
import ImeInput from "./ime_input.jsx";

const MEDIA_LABEL_KEY = {
  [API_MEDIA_TYPE.IMAGE]: "settings.models.image",
  [API_MEDIA_TYPE.TEXT]: "settings.models.text",
};

const inputClass =
  "w-full rounded-xl bg-[#191919] px-2.5 py-1.5 text-[11px] text-neutral-200 outline-none transition-colors placeholder:text-neutral-400 hover:bg-[#1d1d1d] focus:bg-[#202020] focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/35";

function MediaSection({ providerId, mediaType, stored, configured, onStore }) {
  const { t } = useI18n();
  const [draftId, setDraftId] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [editingModelId, setEditingModelId] = useState(null);
  const [editId, setEditId] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const models = providerModelList(stored, providerId, mediaType);

  const fetchAll = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await listProviderModels({ providerId, mediaType });
      const next = mergeFetchedModels(
        stored,
        providerId,
        mediaType,
        result?.models,
      );
      const added =
        providerModelList(next, providerId, mediaType).length - models.length;
      await onStore(next);
      setNote(
        added > 0
          ? t("settings.models.fetchedCount", { count: String(added) })
          : t("settings.models.fetchedNone"),
      );
    } catch {
      setNote(t("settings.models.fetchFailed"));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const trimmedId = draftId.trim();
    if (!trimmedId) return;
    const trimmedLabel = draftLabel.trim() || trimmedId;
    const { stored: next, added } = addProviderModel(
      stored,
      providerId,
      mediaType,
      {
        id: trimmedId,
        label: trimmedLabel,
      },
    );
    if (!added) {
      setNote(t("settings.models.addDuplicate"));
      return;
    }
    setDraftId("");
    setDraftLabel("");
    setNote(null);
    await onStore(next);
  };

  const startEdit = (model) => {
    setEditingModelId(model.id);
    setEditId(model.id);
    setEditLabel(model.label || model.id);
  };

  const cancelEdit = () => {
    setEditingModelId(null);
    setEditId("");
    setEditLabel("");
  };

  const saveEdit = async (oldId) => {
    const trimmedId = editId.trim();
    if (!trimmedId) return;
    const trimmedLabel = editLabel.trim() || trimmedId;
    const next = updateProviderModel(stored, providerId, mediaType, oldId, {
      id: trimmedId,
      label: trimmedLabel,
    });
    cancelEdit();
    await onStore(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-neutral-500 font-medium">
          {t(MEDIA_LABEL_KEY[mediaType] ?? "settings.models.text")}
        </span>
        <button
          type="button"
          onClick={fetchAll}
          disabled={busy || !configured}
          title={configured ? undefined : t("platform.apiNotConfigured")}
          className="flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] text-neutral-300 transition-colors hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconRefresh
            size={11}
            className={busy ? "animate-spin" : undefined}
          />
          {t("settings.models.fetchAll")}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {models.length === 0 ? (
          <div className="px-2.5 py-1.5 text-[11px] text-neutral-500">
            {t("settings.models.fetchedNone")}
          </div>
        ) : (
          models.map((model) => {
            const isEditing = editingModelId === model.id;
            if (isEditing) {
              return (
                <div
                  key={model.id}
                  className="flex flex-col gap-1.5 rounded-xl bg-white/[0.06] p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[10px] text-neutral-400">
                      {t("settings.models.labelField")}
                    </span>
                    <ImeInput
                      value={editLabel}
                      onValueChange={setEditLabel}
                      placeholder={model.id}
                      className={inputClass}
                      ariaLabel={t("settings.models.labelField")}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[10px] text-neutral-400">
                      {t("settings.models.idField")}
                    </span>
                    <ImeInput
                      value={editId}
                      onValueChange={setEditId}
                      placeholder="model-id"
                      className={inputClass}
                      ariaLabel={t("settings.models.idField")}
                    />
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="flex h-6 items-center gap-1 rounded-lg bg-white/10 px-2 text-[10px] text-neutral-300 hover:bg-white/15 hover:text-white transition-colors"
                    >
                      <IconClose size={11} />
                      <span>{t("common.cancel")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(model.id)}
                      disabled={!editId.trim()}
                      className="flex h-6 items-center gap-1 rounded-lg bg-white px-2 text-[10px] font-medium text-black hover:bg-neutral-200 transition-colors disabled:opacity-40"
                    >
                      <IconCheck size={11} />
                      <span>{t("common.save")}</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={model.id}
                className="group flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-2.5 py-1.5 transition-colors hover:bg-white/[0.06]"
              >
                <div className="min-w-0 flex-1 flex items-center">
                  <span
                    className="truncate text-[11px] font-medium text-neutral-200"
                    title={model.id}
                  >
                    {model.label || model.id}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={t("settings.models.edit")}
                    title={t("settings.models.edit")}
                    onClick={() => startEdit(model)}
                    className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <IconEdit size={11} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("settings.models.remove")}
                    title={t("settings.models.remove")}
                    onClick={() =>
                      onStore(
                        removeProviderModel(
                          stored,
                          providerId,
                          mediaType,
                          model.id,
                        ),
                      )
                    }
                    className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                  >
                    <IconTrash size={11} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-1.5 rounded-xl bg-white/[0.03] p-2 mt-1">
        <div className="flex items-center gap-1.5">
          <ImeInput
            value={draftId}
            onValueChange={setDraftId}
            placeholder={t("settings.models.idField")}
            ariaLabel={t("settings.models.idField")}
            className={inputClass}
          />
          <ImeInput
            value={draftLabel}
            onValueChange={setDraftLabel}
            placeholder={t("settings.models.labelField")}
            ariaLabel={t("settings.models.labelField")}
            className={inputClass}
          />
          <button
            type="button"
            onClick={add}
            disabled={!draftId.trim()}
            aria-label={t("settings.models.add")}
            title={t("settings.models.add")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-black font-medium transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <IconAdd size={13} />
          </button>
        </div>
      </div>

      {note ? (
        <span className="text-[10px] text-neutral-400 px-1">{note}</span>
      ) : null}
    </div>
  );
}

MediaSection.propTypes = {
  providerId: PropTypes.string.isRequired,
  mediaType: PropTypes.string.isRequired,
  stored: PropTypes.object,
  configured: PropTypes.bool,
  onStore: PropTypes.func.isRequired,
};

export default function ProviderModelList({ providerId, configured = false }) {
  const [stored, setStored] = useState(null);

  useEffect(() => {
    let active = true;
    getSettingAsync(PROVIDER_MODELS_KEY).then((value) => {
      if (active) setStored(value ?? {});
    });
    const stop = onSettingChange(PROVIDER_MODELS_KEY, (value) =>
      setStored(value ?? {}),
    );
    return () => {
      active = false;
      stop();
    };
  }, []);

  if (stored === null) return null;

  const persist = async (next) => {
    setStored(next);
    await setSetting(PROVIDER_MODELS_KEY, next);
    window.dispatchEvent(new Event("ciw-provider-config-changed"));
  };

  // Only render text and image media types (no 3D, no motion/video)
  const allowedMediaTypes = mediaTypesFor(providerId).filter(
    (mt) => mt === API_MEDIA_TYPE.TEXT || mt === API_MEDIA_TYPE.IMAGE,
  );

  return (
    <div className="flex flex-col gap-3">
      {allowedMediaTypes.map((mediaType) => (
        <MediaSection
          key={mediaType}
          providerId={providerId}
          mediaType={mediaType}
          stored={stored}
          configured={configured}
          onStore={persist}
        />
      ))}
    </div>
  );
}

ProviderModelList.propTypes = {
  providerId: PropTypes.string.isRequired,
  configured: PropTypes.bool,
};
