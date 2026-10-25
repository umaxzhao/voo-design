import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { CollapsibleSection, SectionAddButton, sectionActionClass } from "./property_section.jsx";
import { IconEye, IconEyeOff, IconMinus } from "../../icons.jsx";
import LinearArraySection from "./linear_array_section.jsx";
import GridArraySection from "./grid_array_section.jsx";
import CircularArraySection from "./circular_array_section.jsx";
import * as linear from "../../editor/doc-ops-linear-array.js";
import * as grid from "../../editor/doc-ops-grid-array.js";
import * as circular from "../../editor/doc-ops-circular-array.js";

const kinds = [
  { type: "linearArray", title: "editor.linearArray.title", Editor: LinearArraySection, ops: linear, name: "Linear" },
  { type: "gridArray", title: "editor.gridArray.title", Editor: GridArraySection, ops: grid, name: "Grid" },
  { type: "circularArray", title: "editor.circularArray.title", Editor: CircularArraySection, ops: circular, name: "Circular" },
];

export default function ModifiersSection({ object, engine, t, revealed = false }) {
  const [, refresh] = useState(0);
  // Revealed from the panel's add menu: open straight onto the kind picker.
  const [picker, setPicker] = useState(revealed);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => engine?.subscribeRender?.(() => refresh(n => n + 1), { documentOnly: true }), [engine]);
  const modifier = engine?.getDocument?.()?.modifiers?.find(m => m.targetId === object.id && kinds.some(k => k.type === m.type));
  const kind = kinds.find(k => k.type === modifier?.type);
  const invoke = (item, action, ...args) => {
    const name = `${action}${item.name}ArrayModifier`;
    if (typeof engine?.[name] === "function") engine[name](...args);
    else item.ops[name](engine, ...args);
    refresh(n => n + 1);
  };
  const add = item => {
    // Validation allows one array per target, including disabled arrays.
    if (engine?.getDocument?.()?.modifiers?.some(m => m.targetId === object.id)) return;
    invoke(item, "add", { targetId: object.id });
    setPicker(false);
    setExpanded(true);
  };
  const Editor = kind?.Editor;
  // No modifier and nothing being added: the section does not exist in the panel.
  if (!modifier && !picker && !revealed) return null;
  return <CollapsibleSection title={t("editor.props.modifiers")} storageKey="modifiers.section" testId="editor-modifiers-section"
    extra={<span data-testid="editor-modifiers-add"><SectionAddButton label={t("editor.modifiers.add")} onClick={() => setPicker(value => !value)} /></span>}>
    {picker ? <div data-testid="editor-modifiers-picker" className="rounded-xl border border-white/10 bg-neutral-900 p-1" onKeyDown={event => { if (event.key === "Escape") setPicker(false); }}>
      {kinds.map(item => <button key={item.type} type="button" data-testid={`editor-modifier-add-${item.type}`} disabled={Boolean(modifier) || !engine} onClick={() => add(item)} className="block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-neutral-200 hover:bg-white/[0.08] disabled:opacity-40">{t(item.title)}</button>)}
    </div> : null}
    {!modifier ? null : <div data-testid="editor-modifiers-stack">
      <div data-testid="editor-modifier-row" className="flex h-8 items-center gap-1 rounded-xl bg-white/[0.04] px-1">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="min-w-0 flex-1 truncate px-2 text-left text-[11px] text-neutral-200">{t(kind.title)}</button>
        <button type="button" data-testid="editor-modifier-toggle" aria-label={t(modifier.enabled === false ? "editor.show" : "editor.hide")} aria-pressed={modifier.enabled !== false} className={sectionActionClass} onClick={() => invoke(kind, "update", modifier.id, { enabled: modifier.enabled === false })}>{modifier.enabled === false ? <IconEyeOff size={12} /> : <IconEye size={12} />}</button>
        <button type="button" data-testid="editor-modifier-remove" aria-label={t("editor.modifiers.remove")} className={sectionActionClass} onClick={() => invoke(kind, "remove", modifier.id)}><IconMinus size={12} /></button>
      </div>
      {expanded ? <div className="pt-2"><Editor embedded object={object} engine={engine} t={t} /></div> : null}
    </div>}
  </CollapsibleSection>;
}
ModifiersSection.propTypes = { object: PropTypes.object.isRequired, engine: PropTypes.object, t: PropTypes.func.isRequired, revealed: PropTypes.bool };
