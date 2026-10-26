/** Selection colours: the unique fill/stroke colours across a multi-selection. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";

const HEX = /^#[0-9a-f]{3,8}$/i;

function colourOf(node, key) {
  const list = node?.[key === "fill" ? "fills" : "strokeFills"];
  if (Array.isArray(list) && list.length) {
    const paint = list.find((entry) => entry.visible !== false) ?? list[0];
    return typeof paint?.fill === "string" ? paint.fill : null;
  }
  const value = node?.[key];
  return typeof value === "string" ? value : null;
}

/** Unique colours of the selected nodes, in first-seen order. */
export function selectionColours(nodes = []) {
  const seen = new Map();
  for (const node of nodes) {
    for (const key of ["fill", "stroke"]) {
      const colour = colourOf(node, key);
      if (!colour || !HEX.test(colour)) continue;
      const normalised = colour.toUpperCase();
      const entry = seen.get(normalised) ?? { colour: normalised, nodes: [] };
      entry.nodes.push(node.id);
      seen.set(normalised, entry);
    }
  }
  return [...seen.values()];
}

export default function SelectionColorsSection({ selectedNodes = [], engine }) {
  const { t } = useI18n();
  const colours = selectionColours(selectedNodes);
  if (colours.length === 0) return null;

  return (
    <StaticSection title={t("editor.props.selectionColors")} storageKey="selectionColours">
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
              style={{ backgroundColor: entry.colour }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-[11px] font-mono uppercase text-neutral-200">
              {entry.colour}
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
