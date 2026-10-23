import VariantsSection from "./editor_properties/variants_section.jsx";
import { EDITOR_BETA_ENABLED } from "../editor-beta-features.js";
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { useI18n } from "../use_i18n.js";
import { getCanvasType } from "../editor/canvas-composition-model.js";
import {
  getInstanceView,
  hasInstanceView,
  setInstanceView,
  VIEW_FIELDS,
} from "../editor/instance-view.js";
import { InspectorGroup, InspectorRow } from "./inspector_primitives.jsx";
import VectorRow from "./vector_row.jsx";
import EditorInstanceOverrides from "./editor_instance_overrides.jsx";

const FIELD_CLASS =
  "h-8 w-full min-w-0 rounded-xl bg-[#222222] px-2 text-[11px] text-neutral-100 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]";
const BUTTON_CLASS =
  "flex h-8 w-full items-center rounded-xl bg-[#222222] px-3 text-left text-[11px] text-neutral-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40";

/**
 * Content of the properties panel for a canvas instance: the docked shell
 * around it is supplied by the editor. `onPreview` writes without a history
 * entry while a value is being typed; `onCommit` closes it; `onPatch` is for
 * one-shot changes such as a select.
 */
export default function EditorCanvasInstanceProperties({
  node,
  engine,
  sourceDoc,
  onPatch,
  onPreview,
  onCommit,
  onOpenSource,
  onDetach = null,
  onAdjustView = null,
  onResetInstanceCamera = null,
  onToggleInstanceViewLock = null,
  onRenderVideo,
  renderBusy = false,
  renderError = false,
}) {
  const { t } = useI18n();
  const sourceType = sourceDoc ? getCanvasType(sourceDoc) : null;
  const instance = node.instance ?? {};
  const [videoDraft, setVideoDraft] = useState(instance.videoSrc ?? "");
  const [videoError, setVideoError] = useState(false);
  // Proportional scaling is an editing aid, not document data.
  const [lockScale, setLockScale] = useState(false);
  useEffect(() => {
    setVideoDraft(instance.videoSrc ?? "");
    setVideoError(false);
  }, [node.id, instance.videoSrc]);
  const supportsPlayback = Boolean(sourceType);
  const patchInstance = (patch) =>
    onPatch({ instance: { ...instance, ...patch } });
  const patchSize = (key, value) => {
    if (!lockScale || !(node[key] > 0)) return onPreview({ [key]: value });
    const ratio = value / node[key];
    return onPreview({
      width: node.width * ratio,
      height: node.height * ratio,
    });
  };
  const view = getInstanceView(instance);
  const commitVideoSource = () => {
    if (!videoDraft.trim()) {
      patchInstance({
        videoSrc: null,
        videoAssetId: null,
        playbackMode: "live",
      });
      setVideoError(false);
      return;
    }
    try {
      const url = new URL(videoDraft);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        setVideoError(true);
        return;
      }
      patchInstance({ videoSrc: url.href, videoAssetId: null });
      setVideoError(false);
    } catch {
      setVideoError(true);
    }
  };

  return (
    <div data-testid="editor-instance-properties" className="ui-scroll w-full">
      <InspectorGroup
        title={t("editor.instance.title")}
        testId="editor-instance-component-group"
      >
        <InspectorRow label={t("editor.instance.type")}>
          <span className="text-[11px] text-neutral-300">
            {sourceType
              ? t(
                  `editor.canvasType.${sourceType === "3d" ? "threeD" : sourceType}`,
                )
              : ""}
          </span>
        </InspectorRow>
        <InspectorRow label={t("editor.instance.scope")}>
          <span
            data-testid="editor-instance-scope"
            className="text-[11px] text-neutral-200"
          >
            {t("editor.instance.thisInstance")}
          </span>
        </InspectorRow>
        <button type="button" onClick={onOpenSource} className={BUTTON_CLASS}>
          {t("editor.instance.editSharedMaster")}
        </button>
        {onDetach ? (
          <button
            type="button"
            data-testid="editor-instance-detach"
            onClick={onDetach}
            className={BUTTON_CLASS}
          >
            {t("editor.component.detach")}
          </button>
        ) : null}
      </InspectorGroup>
      <VariantsSection engine={engine} node={node} sourceDoc={sourceDoc} />
      <InspectorGroup title={t("editor.three.transform")}>
        <VectorRow
          testId="editor-instance-position"
          label={t("editor.three.position")}
          fields={["x", "y"].map((axis) => ({
            axis: axis.toUpperCase(),
            ariaLabel: t(`editor.three.position${axis.toUpperCase()}`),
            value: node[axis],
            onChange: (value) => onPreview({ [axis]: value }),
            onCommit,
          }))}
        />
        <VectorRow
          testId="editor-instance-scale"
          label={t("editor.three.scale")}
          lock={{
            locked: lockScale,
            onToggle: () => setLockScale((locked) => !locked),
            label: t("editor.three.lockScale"),
          }}
          fields={["width", "height"].map((key) => ({
            axis: key === "width" ? "W" : "H",
            ariaLabel: t(`editor.three.${key}`),
            value: node[key],
            min: 1,
            onChange: (value) => patchSize(key, value),
            onCommit,
          }))}
        />
      </InspectorGroup>
      {EDITOR_BETA_ENABLED && sourceType === "3d" ? (
        <InspectorGroup
          title={t("editor.instance.view")}
          testId="editor-instance-view-group"
        >
          <VectorRow
            testId="editor-instance-view"
            label={t("editor.three.rotation")}
            fields={VIEW_FIELDS.map((field) => ({
              axis: field.slice(-1),
              ariaLabel: t(`editor.media.${field}`),
              value: view[field],
              min: -360,
              max: 360,
              onChange: (value) =>
                onPreview({
                  instance: setInstanceView(instance, { [field]: value }),
                }),
              onCommit,
            }))}
          />
          <button
            type="button"
            data-testid="editor-instance-adjust-view"
            onClick={onAdjustView}
            disabled={!onAdjustView}
            className={BUTTON_CLASS}
          >
            {t("editor.instance.adjustView")}
          </button>
          <button
            type="button"
            data-testid="editor-instance-reset-camera"
            onClick={onResetInstanceCamera}
            disabled={!instance.overrides?.camera}
            className={BUTTON_CLASS}
          >
            {t("editor.instance.resetMainView")}
          </button>
          <button
            type="button"
            aria-pressed={instance.overrides?.viewLocked === true}
            onClick={onToggleInstanceViewLock}
            className={BUTTON_CLASS}
          >
            {t(
              instance.overrides?.viewLocked === true
                ? "editor.instance.unlockView"
                : "editor.instance.lockView",
            )}
          </button>
          <button
            type="button"
            data-testid="editor-instance-reset-view"
            disabled={!hasInstanceView(instance)}
            onClick={() =>
              onPatch({
                instance: setInstanceView(instance, {
                  rotationX: 0,
                  rotationY: 0,
                  rotationZ: 0,
                }),
              })
            }
            className={BUTTON_CLASS}
          >
            {t("editor.instance.resetView")}
          </button>
        </InspectorGroup>
      ) : null}
      <EditorInstanceOverrides
        sourceDoc={sourceDoc}
        instance={instance}
        onPreview={onPreview}
        onCommit={onCommit}
        onPatch={onPatch}
        t={t}
      />
      <InspectorGroup title={t("editor.instance.layout")}>
        <select
          aria-label={t("editor.instance.layout")}
          value={instance.layoutMode ?? "fixed"}
          onChange={(event) =>
            patchInstance({ layoutMode: event.target.value })
          }
          className={FIELD_CLASS}
        >
          <option value="fixed">{t("editor.instance.fixed")}</option>
          <option value="fill">{t("editor.instance.fill")}</option>
        </select>
      </InspectorGroup>
      {EDITOR_BETA_ENABLED && supportsPlayback ? (
        <InspectorGroup title={t("editor.instance.playback")}>
          <select
            aria-label={t("editor.instance.playback")}
            value={instance.playbackMode ?? "live"}
            onChange={(event) =>
              patchInstance({ playbackMode: event.target.value })
            }
            className={FIELD_CLASS}
          >
            <option value="live">{t("editor.instance.live")}</option>
            <option value="video" disabled={!instance.videoSrc}>
              {t("editor.instance.video")}
            </option>
          </select>
          <label className="flex flex-col gap-1 text-[10px] text-neutral-400">
            <span>{t("editor.instance.videoSource")}</span>
            <input
              type="url"
              value={videoDraft}
              onChange={(event) => setVideoDraft(event.target.value)}
              onBlur={commitVideoSource}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-invalid={videoError}
              placeholder={t("editor.instance.videoSourceHint")}
              className={FIELD_CLASS}
            />
            {videoError ? (
              <span role="alert" className="text-[10px] text-rose-400">
                {t("editor.instance.invalidVideoSource")}
              </span>
            ) : null}
          </label>
          {sourceType === "motion" && onRenderVideo ? (
            <button
              type="button"
              disabled={renderBusy}
              onClick={onRenderVideo}
              className={BUTTON_CLASS}
            >
              {t(
                renderBusy
                  ? "editor.instance.renderingVideo"
                  : "editor.instance.renderVideo",
              )}
            </button>
          ) : null}
          {renderError ? (
            <span role="alert" className="text-[10px] text-rose-400">
              {t("editor.instance.renderFailed")}
            </span>
          ) : null}
        </InspectorGroup>
      ) : null}
    </div>
  );
}

EditorCanvasInstanceProperties.propTypes = {
  node: PropTypes.object.isRequired,
  sourceDoc: PropTypes.object,
  onPatch: PropTypes.func.isRequired,
  onPreview: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
  onOpenSource: PropTypes.func.isRequired,
  onDetach: PropTypes.func,
  onAdjustView: PropTypes.func,
  onResetInstanceCamera: PropTypes.func,
  onToggleInstanceViewLock: PropTypes.func,
  onRenderVideo: PropTypes.func,
  renderBusy: PropTypes.bool,
  renderError: PropTypes.bool,
};
