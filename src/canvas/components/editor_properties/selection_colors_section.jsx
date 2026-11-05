/** Selection colours: the unique fill/stroke colours across a multi-selection. */

import PropTypes from "prop-types";
import { MousePointer2 } from "lucide-react";
import { isCssGradient } from "../../color_picker/gradient_fill.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";

const HEX = /^#[0-9a-f]{3,8}$/i;

function coloursOf(node, key) {
  const list = node?.[key === "fill" ? "fills" : "strokeFills"];
  if (Array.isArray(list) && list.length) {
    return list
      .filter((paint) => paint.visible !== false)
      .map((paint) => paint.fill);
  }
  return [node?.[key]];
}

/** Keep each visible gradient intact; its stops are not separate page paints. */
export function selectionColours(nodes = []) {
  const seen = new Map();
  for (const node of nodes) {
    for (const key of ["fill", "stroke"]) {
      for (const value of coloursOf(node, key)) {
        if (typeof value !== "string") continue;
        const colour = value.trim();
        const gradient = isCssGradient(colour);
        if (!gradient && !HEX.test(colour)) continue;
        // Preserve gradient URLs and geometry metadata exactly for the preview.
        const normalised = gradient ? colour : colour.toUpperCase();
        const entry = seen.get(normalised) ?? {
          colour: normalised,
          gradient,
          nodes: new Set(),
        };
        entry.nodes.add(node.id);
        seen.set(normalised, entry);
      }
    }
  }
  return [...seen.values()].map((entry) => ({ ...entry, nodes: [...entry.nodes] }));
}

/**
 * Replace a specific color across all selected nodes that use it (Figma Selection Colors).
 * Updates fill, stroke, and multiple paint arrays (fills, strokeFills) as one undoable operation.
 */
export function replaceSelectionColour(engine, nodeIds = [], oldColour, newColour) {
  if (!engine || !oldColour || !newColour || oldColour === newColour || !nodeIds.length) return false;
  const targetColour = oldColour.trim().toUpperCase();
  const nextColour = newColour.trim();
  const doc = engine.getDocument();
  if (!doc?.nodes) return false;
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));

  let anyChanged = false;
  for (const nodeId of nodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const patch = {};
    let nodeChanged = false;

    if (typeof node.fill === "string" && node.fill.trim().toUpperCase() === targetColour) {
      patch.fill = nextColour;
      nodeChanged = true;
    }
    if (typeof node.stroke === "string" && node.stroke.trim().toUpperCase() === targetColour) {
      patch.stroke = nextColour;
      nodeChanged = true;
    }
    if (Array.isArray(node.fills)) {
      let fillsChanged = false;
      const nextFills = node.fills.map((p) => {
        if (typeof p.fill === "string" && p.fill.trim().toUpperCase() === targetColour) {
          fillsChanged = true;
          return { ...p, fill: nextColour };
        }
        return p;
      });
      if (fillsChanged) {
        patch.fills = nextFills;
        nodeChanged = true;
      }
    }
    if (Array.isArray(node.strokeFills)) {
      let strokeFillsChanged = false;
      const nextStrokeFills = node.strokeFills.map((p) => {
        if (typeof p.fill === "string" && p.fill.trim().toUpperCase() === targetColour) {
          strokeFillsChanged = true;
          return { ...p, fill: nextColour };
        }
        return p;
      });
      if (strokeFillsChanged) {
        patch.strokeFills = nextStrokeFills;
        nodeChanged = true;
      }
    }

    if (nodeChanged) {
      engine.updateNode(nodeId, patch, { commit: false });
      anyChanged = true;
    }
  }

  if (anyChanged) {
    engine.commit("editor.history.entry.color");
  }
  return anyChanged;
}

export default function SelectionColorsSection({ selectedNodes = [], engine }) {
  const { t } = useI18n();
  const colours = selectionColours(selectedNodes);
  if (colours.length === 0) return null;

  return (
    <StaticSection
      title={t("editor.props.selectionColors")}
      storageKey="selectionColours"
    >
      <div className="flex flex-col gap-1.5">
        {colours.map((entry) => {
          const isHex = !entry.gradient && HEX.test(entry.colour);
          const hexValue = isHex ? (entry.colour.length === 7 ? entry.colour : entry.colour.slice(0, 7)) : "#000000";
          return (
            <div
              key={entry.colour}
              className="group flex min-h-7 items-center gap-2 rounded-xl bg-neutral-800 px-2.5 transition-colors hover:bg-neutral-800/80"
            >
              <label
                className={`relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full ${isHex ? "cursor-pointer" : ""}`}
                title={isHex ? t("editor.props.customColour") : undefined}
                style={{ background: entry.colour, backgroundSize: "100% 100%" }}
              >
                {isHex ? (
                  <input
                    type="color"
                    value={hexValue}
                    onChange={(event) =>
                      replaceSelectionColour(
                        engine,
                        entry.nodes,
                        entry.colour,
                        event.target.value.toUpperCase(),
                      )
                    }
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    aria-label={`${t("editor.props.customColour")} ${entry.colour}`}
                  />
                ) : null}
              </label>
              <span className="min-w-0 flex-1 truncate text-[11px] font-mono uppercase text-neutral-200">
                {entry.gradient ? t("editor.props.gradientLabel") : entry.colour}
              </span>
              <span className="shrink-0 text-[10px] font-mono tabular-nums text-neutral-400">
                ×{new Set(entry.nodes).size}
              </span>
              <button
                type="button"
                onClick={() => engine?.selectMany?.(entry.nodes)}
                title={t("editor.props.selectLayersUsingColour")}
                aria-label={`${t("editor.props.selectLayersUsingColour")} ${entry.colour}`}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-neutral-400 opacity-60 transition-opacity hover:opacity-100 hover:text-neutral-100 focus-visible:opacity-100"
              >
                <MousePointer2 size={12} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </StaticSection>
  );
}

SelectionColorsSection.propTypes = {
  selectedNodes: PropTypes.array,
  engine: PropTypes.object,
};
