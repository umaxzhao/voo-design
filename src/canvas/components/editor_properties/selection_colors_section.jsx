/** Selection colours: the unique fill/stroke colours across a multi-selection. */

import PropTypes from "prop-types";
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
        {colours.map((entry) => (
          <button
            key={entry.colour}
            type="button"
            onClick={() => engine?.selectMany?.(entry.nodes)}
            title={t("editor.props.selectLayersUsingColour")}
            className="flex min-h-7 items-center gap-2 rounded-xl bg-neutral-800 px-2.5 text-left transition-colors hover:bg-neutral-800/80"
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20"
              style={{ background: entry.colour, backgroundSize: "100% 100%" }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-[11px] font-mono uppercase text-neutral-200">
              {entry.gradient ? t("editor.props.gradientLabel") : entry.colour}
            </span>
            <span className="shrink-0 text-[10px] font-mono tabular-nums text-neutral-400">
              ×{new Set(entry.nodes).size}
            </span>
          </button>
        ))}
      </div>
    </StaticSection>
  );
}

SelectionColorsSection.propTypes = {
  selectedNodes: PropTypes.array,
  engine: PropTypes.object,
};
