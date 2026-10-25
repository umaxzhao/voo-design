/** Fill section controls for nodes: solid, gradient, image fills, and opacity. */

import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import ScrubValueInput from "./scrub_value_input.jsx";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { BLEND_MODES, NODE_KIND } from "../../editor/scene_model.js";
import { useI18n } from "../../use_i18n.js";
import { IconMinus, IconOpacity } from "../../icons.jsx";
import { PaintBucket } from "lucide-react";
import { Swatch, HexField, HEX_COLOUR } from "./colour_swatch.jsx";
import {
  SectionAddButton,
  StaticSection,
  sectionActionClass,
  sectionRowClass,
} from "./property_section.jsx";

/** imageId → preview URL, so the fill picker never re-encodes per render. */
const fillPreviewCache = new Map();
const FILL_PREVIEW_LIMIT = 64;
/** The bitmap cache decodes lazily — give up polling after this many tries. */
const FILL_PREVIEW_POLL_TRIES = 20;
const FILL_PREVIEW_POLL_MS = 200;
/** Encode the preview at most this wide/tall; the picker shows it at ~256px. */
const FILL_PREVIEW_MAX = 512;

/** A displayable URL for a node's bitmap, mirroring the layers panel. */
function bitmapPreviewUrl(bmp) {
  if (!bmp) return null;
  // A decoded <img> with a data/http src keeps a usable URL — using it
  // directly keeps the full resolution instead of re-encoding a thumbnail.
  if (typeof bmp.src === "string" && bmp.src && !bmp.src.startsWith("blob:")) {
    return bmp.src;
  }
  if (bmp instanceof HTMLCanvasElement) {
    try {
      return bmp.toDataURL();
    } catch {
      return null;
    }
  }
  // HTMLImageElement without a src, or an ImageBitmap: draw into a canvas.
  try {
    const sourceWidth = bmp.naturalWidth ?? bmp.width ?? 1;
    const sourceHeight = bmp.naturalHeight ?? bmp.height ?? 1;
    const scale = Math.min(
      1,
      FILL_PREVIEW_MAX / Math.max(sourceWidth, sourceHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

/** Whether a fill string names a picture (a URL) rather than a paint. */
function isImageUrlFill(fill) {
  return (
    typeof fill === "string" &&
    (fill.startsWith("data:") ||
      fill.startsWith("blob:") ||
      fill.startsWith("http"))
  );
}

export function FillSection({
  object,
  edit,
  editAndCommit,
  commitNow = undefined,
  selectedNodes = [],
  getBitmap = null,
  paintRow = false,
  onRemove = null,
}) {
  const { t } = useI18n();
  const isImageNode = isImageUrlFill(object.fill) || (object.kind === NODE_KIND.IMAGE && (!object.fill || object.fill === "transparent"));
  const imageKey = object.imageId ?? object.src ?? null;

  const [imageUrl, setImageUrl] = useState(() => {
    if (!isImageNode) return null;
    if (isImageUrlFill(object.fill)) return object.fill;
    return imageKey ? (fillPreviewCache.get(imageKey) ?? null) : null;
  });
  // `object` is rebuilt on every document edit; only the image identity should
  // restart the poll, so the latest node reaches it via a ref.
  const objectRef = useRef(object);
  objectRef.current = object;
  /** A fill that names a picture replaces the bitmap preview when set. */
  const fillImage = isImageUrlFill(object.fill) ? object.fill : null;

  useEffect(() => {
    if (!isImageNode) return undefined;
    if (fillImage) {
      setImageUrl(fillImage);
      return undefined;
    }
    if (!imageKey) {
      setImageUrl(null);
      return undefined;
    }
    const cached = fillPreviewCache.get(imageKey);
    if (cached) {
      setImageUrl(cached);
      return undefined;
    }
    setImageUrl(null);
    let cancelled = false;
    let timer = 0;
    let tries = 0;
    // The bitmap decodes lazily in the engine's cache, so the first read often
    // returns nothing; poll until it lands or the budget runs out.
    const poll = () => {
      if (cancelled) return;
      const bmp = getBitmap?.(objectRef.current);
      const url = bitmapPreviewUrl(bmp);
      if (url) {
        if (fillPreviewCache.size >= FILL_PREVIEW_LIMIT) {
          fillPreviewCache.delete(fillPreviewCache.keys().next().value);
        }
        fillPreviewCache.set(imageKey, url);
        setImageUrl(url);
        return;
      }
      tries += 1;
      if (tries < FILL_PREVIEW_POLL_TRIES) {
        timer = setTimeout(poll, FILL_PREVIEW_POLL_MS);
      }
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isImageNode, imageKey, fillImage, getBitmap]);

  const fill = typeof object.fill === "string" ? object.fill : "transparent";
  const isGradient = fill.includes("-gradient");
  const none = !isImageNode && !HEX_COLOUR.test(fill) && !isGradient;
  const fillOpacity = Math.round((object.fillOpacity ?? 1) * 100);
  const fillOpacityMixed =
    selectedNodes.length > 1 &&
    commonValue(selectedNodes, "fillOpacity") === MIXED;

  const paints = Array.isArray(object.fills) ? object.fills : [{
    fill: object.fill ?? "transparent", opacity: object.fillOpacity ?? 1,
    visible: object.fillHidden !== true, blendMode: object.fillBlendMode ?? "source-over",
    ...(object.imageId ? { imageId: object.imageId } : {}),
  }];
  const updatePaint = (index, patch, commit) => {
    const next = paints.map((paint, at) => at === index ? { ...paint, ...patch } : paint);
    const first = next[0];
    (commit ? editAndCommit : edit)({ fills: next, fill: first?.fill ?? "transparent",
      fillOpacity: first?.opacity ?? 1, fillHidden: first?.visible === false });
  };
  if (!paintRow) return (
    <StaticSection title={t("editor.props.fillLabel")} storageKey="fill" extra={
      <SectionAddButton label={t("editor.props.addFill")}
        onClick={() => editAndCommit({ fills: [...paints, { fill: "#D9D9D9", opacity: 1, visible: true, blendMode: "source-over" }] })} />
    }>
      {paints.map((paint, index) => <FillSection key={index}
        object={{ ...object, fills: undefined, fill: paint.fill, fillOpacity: paint.opacity,
          fillHidden: paint.visible === false, fillBlendMode: paint.blendMode,
          imageId: paint.imageId ?? object.imageId }}
        paintRow onRemove={() => {
          const next = paints.filter((_, at) => at !== index);
          editAndCommit({ fills: next, fill: next[0]?.fill ?? "transparent", fillOpacity: next[0]?.opacity ?? 1 });
        }}
        edit={(patch) => updatePaint(index, paintPatch(patch), false)}
        editAndCommit={(patch) => updatePaint(index, paintPatch(patch), true)}
        commitNow={commitNow} getBitmap={getBitmap} selectedNodes={selectedNodes} />)}
      {object.maskBase && <span className="text-[11px] text-neutral-400">Mask · {object.maskType ?? "alpha"}</span>}
    </StaticSection>
  );

  return (
    <div
    >
      {none ? (
        <button
          type="button"
          onClick={() => editAndCommit({ fill: "#D9D9D9" })}
          className="flex h-7 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 text-[11px] font-mono text-neutral-400 hover:border-white/20 hover:text-white transition-colors cursor-pointer"
        >
          <span>+</span>
          <span className="uppercase">{t("editor.props.fill")}</span>
        </button>
      ) : (
        /* Row 1: Unified Pill (Swatch + Label/Hex + Opacity + Minus) */
        <div className={sectionRowClass}>
          <Swatch
            value={none ? null : fill}
            onPick={(colour) => editAndCommit({ fill: colour })}
            ariaLabel={t("editor.props.fill")}
            previewImage={imageUrl}
            isImage={isImageNode}
          />
          <span className="shrink-0 text-neutral-500" aria-hidden="true">
            <PaintBucket size={11} />
          </span>
          {isImageNode ? (
            <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-neutral-200">
              {object.name || t("editor.props.imageLabel")}
            </span>
          ) : isGradient ? (
            <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-neutral-300">
              {t("editor.props.gradientLabel")}
            </span>
          ) : (
            <HexField
              value={fill}
              onCommit={(colour) => editAndCommit({ fill: colour })}
              ariaLabel={t("editor.props.customColour")}
            />
          )}
          <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-2">
            {fillOpacityMixed ? (
              <span
                className="text-[11px] font-mono text-neutral-500"
                title={t("editor.props.mixedValues")}
              >
                —%
              </span>
            ) : (
              <>
                <span className="text-neutral-500" aria-hidden="true">
                  <IconOpacity size={11} />
                </span>
                <ScrubValueInput
                  min={0}
                  max={100}
                  step={1}
                  value={fillOpacity}
                  format={(val) => `${val}`}
                  onChange={(val) =>
                    edit({ fillOpacity: Math.max(0, Math.min(1, val / 100)) })
                  }
                  onCommit={commitNow}
                  ariaLabel={t("editor.props.opacity")}
                  scrubHint={t("editor.props.dragToAdjust")}
                  className="!w-7 !p-0 bg-transparent text-right text-[11px] font-mono text-neutral-300 outline-none"
                />
                <span className="text-[10px] font-mono text-neutral-500">
                  %
                </span>
              </>
            )}
            <button
              type="button"
              onClick={() => onRemove?.()}
              title={t("editor.props.removeFill")}
              aria-label={t("editor.props.removeFill")}
              className={`${sectionActionClass} ml-1`}
            >
              <IconMinus size={12} />
            </button>
          </div>
        </div>
      )}
    <div className="flex items-center gap-2 py-1">
        <input type="checkbox" aria-label="Fill visible" checked={object.fillHidden !== true}
          onChange={(event) => editAndCommit({ fillHidden: !event.target.checked })} />
        <select aria-label="Fill blend mode" value={object.fillBlendMode ?? "source-over"}
          onChange={(event) => editAndCommit({ fillBlendMode: event.target.value })}
          className="min-w-0 flex-1 bg-neutral-900 text-[11px] text-neutral-300">
          {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode === "source-over" ? "Normal" : mode}</option>)}
        </select>
      </div>
    </div>
  );
}

FillSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  /** Interaction-end commit for the continuous (debounced) fields. */
  commitNow: PropTypes.func,
  /** Selected node objects when several are picked (plan 1.9). */
  selectedNodes: PropTypes.array,
  getBitmap: PropTypes.func,
  paintRow: PropTypes.bool,
  onRemove: PropTypes.func,
};

function paintPatch(patch) {
  const result = {};
  if ("fill" in patch) result.fill = patch.fill;
  if ("fillOpacity" in patch) result.opacity = patch.fillOpacity;
  if ("fillHidden" in patch) result.visible = !patch.fillHidden;
  if ("fillBlendMode" in patch) result.blendMode = patch.fillBlendMode;
  return result;
}
