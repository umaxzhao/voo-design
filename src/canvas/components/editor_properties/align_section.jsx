import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ALIGN_TYPES,
  DISTRIBUTE_AXES,
  alignNodes,
  distributeNodes,
  distributeSpacingNodes,
  tidyNodes,
  measureSpacing,
} from "../../editor/align_ops.js";
import { nodeAABB } from "../../editor/scene_geometry.js";
import { StaticSection } from "./property_section.jsx";
import { useI18n } from "../../use_i18n.js";
import EditorTooltip from "../editor_tooltip.jsx";

if (typeof globalThis !== "undefined" && typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

const { default: ScrubField } = await import("../scrub_field.jsx");

import { AlignIcon, DistributeIcon, TidyIcon } from "../alignment_icon.jsx";
export { AlignIcon, DistributeIcon, TidyIcon } from "../alignment_icon.jsx";

function Row({ children }) {
  return <div className="flex gap-1">{children}</div>;
}

Row.propTypes = { children: PropTypes.node };

const buttonClass =
  "flex h-7 flex-1 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300 transition-colors hover:bg-white/[0.12] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.06] disabled:hover:text-neutral-300";

/**
 * Determine the dominant axis by comparing spread along X vs Y.
 */
export function getDominantAxis(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return "horizontal";
  const items = nodes.map((node) => {
    const box =
      node.width !== undefined || node.height !== undefined || node.rotation
        ? nodeAABB(node)
        : {
            x: node.x ?? 0,
            y: node.y ?? 0,
            width: node.w ?? node.width ?? 0,
            height: node.h ?? node.height ?? 0,
          };
    return {
      cx: box.x + box.width / 2,
      cy: box.y + box.height / 2,
    };
  });
  const spreadX =
    Math.max(...items.map((it) => it.cx)) -
    Math.min(...items.map((it) => it.cx));
  const spreadY =
    Math.max(...items.map((it) => it.cy)) -
    Math.min(...items.map((it) => it.cy));
  return spreadX >= spreadY ? "horizontal" : "vertical";
}

/**
 * Interactive Gap control row:
 * Displays an axis toggle button (H / V) and a ScrubField allowing
 * users to drag-scrub or type exact pixel gaps.
 */
function GapControlRow({ selectedNodes = [], onLayout }) {
  const { t } = useI18n();
  const [selectedAxis, setSelectedAxis] = useState(null);
  const [scrubGap, setScrubGap] = useState(null);
  const [lastSelectionKey, setLastSelectionKey] = useState("");

  const selectionKey = useMemo(
    () =>
      Array.isArray(selectedNodes)
        ? selectedNodes
            .map((n) => n?.id ?? "")
            .sort()
            .join(",")
        : "",
    [selectedNodes],
  );

  if (selectionKey !== lastSelectionKey) {
    setLastSelectionKey(selectionKey);
    setSelectedAxis(null);
  }

  const dominantAxis = useMemo(
    () => getDominantAxis(selectedNodes),
    [selectedNodes],
  );

  const activeAxis = selectedAxis ?? dominantAxis;

  useEffect(() => {
    setScrubGap(null);
  }, [selectionKey, activeAxis]);

  const measured = useMemo(() => {
    return measureSpacing(selectedNodes, activeAxis);
  }, [selectedNodes, activeAxis]);

  const computedGap = measured?.avgGap ?? 0;
  const displayedGap = scrubGap !== null ? scrubGap : computedGap;

  const handleGapChange = useCallback(
    (nextVal) => {
      const parsedValue = Number(nextVal);
      if (!Number.isFinite(parsedValue)) return;
      setScrubGap(parsedValue);
      if (typeof onLayout === "function") {
        onLayout(
          (nodes) =>
            distributeSpacingNodes(nodes, {
              axis: activeAxis,
              gap: parsedValue,
            }),
          { axis: activeAxis, gap: parsedValue },
        );
      }
    },
    [onLayout, activeAxis],
  );

  const handleGapCommit = useCallback(() => {
    const parsedValue = Number(displayedGap);
    setScrubGap(null);
    if (typeof onLayout === "function" && Number.isFinite(parsedValue)) {
      onLayout(
        (nodes) =>
          distributeSpacingNodes(nodes, {
            axis: activeAxis,
            gap: parsedValue,
          }),
        { axis: activeAxis, gap: parsedValue },
      );
    }
  }, [onLayout, activeAxis, displayedGap]);

  const gapLabel =
    t("editor.props.align.gap") || t("editor.props.gap") || "Gap";
  const gapHint =
    t("editor.props.align.gapHint") ||
    t("editor.props.gapHint") ||
    "Drag or enter gap in pixels";
  const hLabel =
    t("editor.props.align.gapHorizontal") ||
    t("editor.props.gapHorizontal") ||
    "Horizontal gap";
  const vLabel =
    t("editor.props.align.gapVertical") ||
    t("editor.props.gapVertical") ||
    "Vertical gap";

  return (
    <div className="flex h-7 min-w-0 items-center gap-1.5">
      <div className="flex h-7 shrink-0 items-center rounded-lg bg-white/[0.06] p-0.5">
        <EditorTooltip title={hLabel} side="top">
          <button
            type="button"
            onClick={() => setSelectedAxis("horizontal")}
            aria-pressed={activeAxis === "horizontal"}
            aria-label={hLabel}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-mono font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              activeAxis === "horizontal"
                ? "bg-white/[0.12] text-[#a7ffd4]"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            H
          </button>
        </EditorTooltip>
        <EditorTooltip title={vLabel} side="top">
          <button
            type="button"
            onClick={() => setSelectedAxis("vertical")}
            aria-pressed={activeAxis === "vertical"}
            aria-label={vLabel}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-mono font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
              activeAxis === "vertical"
                ? "bg-white/[0.12] text-[#a7ffd4]"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            V
          </button>
        </EditorTooltip>
      </div>

      <ScrubField
        prefix={gapLabel}
        value={displayedGap}
        min={-999}
        max={9999}
        step={1}
        onValueChange={handleGapChange}
        onCommit={handleGapCommit}
        ariaLabel={gapLabel}
        scrubHint={gapHint}
        className="flex-1"
      />
    </div>
  );
}

GapControlRow.propTypes = {
  selectedNodes: PropTypes.array,
  onLayout: PropTypes.func.isRequired,
};

/**
 * Aligning and spreading a selection.
 *
 * Aligning needs two shapes; spreading needs three, since it is the shapes
 * *between* the outermost two that move. The spread buttons are shown
 * disabled rather than hidden at two, so the row does not change shape as
 * shapes are added to the selection.
 */
export default function AlignSection({ count, onLayout, selectedNodes = [], showQuickActions = true }) {
  const { t } = useI18n();
  const canSpread = count >= 3;

  return (
    <StaticSection title={t("editor.props.align")} storageKey="align">
      {showQuickActions ? <Row>
        {ALIGN_TYPES.map((type) => (
          <EditorTooltip
            key={type}
            title={t(`editor.props.alignShapes.${type}`)}
            side="top"
            className="flex-1"
          >
            <button
              type="button"
              onClick={() => onLayout(alignNodes, type)}
              aria-label={t(`editor.props.alignShapes.${type}`)}
              className={`${buttonClass} w-full`}
            >
              <AlignIcon type={type} />
            </button>
          </EditorTooltip>
        ))}
      </Row> : null}

      {showQuickActions && count >= 2 && (
        <Row>
          {DISTRIBUTE_AXES.map((axis) => (
            <EditorTooltip
              key={`spread-${axis}`}
              title={
                canSpread
                  ? t(`editor.props.distribute.${axis}`)
                  : t("editor.props.distribute.requiresThree")
              }
              side="top"
              className="flex-1"
            >
              <button
                type="button"
                aria-disabled={!canSpread}
                aria-description={
                  canSpread ? undefined : t("editor.props.distribute.requiresThree")
                }
                onClick={() => {
                  if (canSpread) onLayout(distributeNodes, axis);
                }}
                aria-label={t(`editor.props.distribute.${axis}`)}
                className={`${buttonClass} w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-white/[0.06] aria-disabled:hover:text-neutral-300`}
              >
                <DistributeIcon axis={axis} />
              </button>
            </EditorTooltip>
          ))}
          {DISTRIBUTE_AXES.map((axis) => (
            <EditorTooltip
              key={`tidy-${axis}`}
              title={
                canSpread
                  ? (axis === "horizontal"
                      ? t("editor.props.distributeSpacingH") || t("editor.props.tidy.horizontal")
                      : t("editor.props.distributeSpacingV") || t("editor.props.tidy.vertical"))
                  : t("editor.props.distribute.requiresThree")
              }
              shortcut={canSpread ? (axis === "horizontal" ? "⌥⇧H" : "⌥⇧V") : ""}
              side="top"
              className="flex-1"
            >
              <button
                type="button"
                aria-disabled={!canSpread}
                aria-description={
                  canSpread ? undefined : t("editor.props.distribute.requiresThree")
                }
                onClick={() => {
                  if (canSpread) onLayout(tidyNodes, axis);
                }}
                aria-label={
                  axis === "horizontal"
                    ? t("editor.props.distributeSpacingH") || t("editor.props.tidy.horizontal")
                    : t("editor.props.distributeSpacingV") || t("editor.props.tidy.vertical")
                }
                className={`${buttonClass} w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-white/[0.06] aria-disabled:hover:text-neutral-300`}
              >
                <TidyIcon axis={axis} />
              </button>
            </EditorTooltip>
          ))}
        </Row>
      )}

      {count >= 2 && (
        <GapControlRow
          selectedNodes={selectedNodes}
          onLayout={onLayout}
        />
      )}
    </StaticSection>
  );
}

AlignSection.propTypes = {
  count: PropTypes.number.isRequired,
  onLayout: PropTypes.func.isRequired,
  selectedNodes: PropTypes.array,
  showQuickActions: PropTypes.bool,
};
