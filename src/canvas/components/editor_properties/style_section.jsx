/**
 * Named styles section — apply, save, update, rename and detach paint / text /
 * effect styles on the selected layer.
 *
 * Pure view: every mutation goes through the `styleActions` object the host
 * builds with `createStylePanelActions`, so each action is one undo entry.
 * Model: see `src/canvas/editor/scene_styles.js`.
 *
 * Design language: dark chrome, mono type, 9–11px labels, #222 fields,
 * mint/purple focus, no gradients or emoji.
 */

import PropTypes from "prop-types";
import { useMemo, useState } from "react";
import { useI18n } from "../../use_i18n.js";
import { CollapsibleSection } from "./property_section.jsx";
import {
  IconAdd,
  IconChevronDown,
  IconClose,
  IconSwap,
  IconTrash,
} from "../../icons.jsx";
import stylesEn from "../../../shared/i18n/styles-en.js";
import { STYLE_TYPE_KEYS, normalizeStyles } from "../../editor/scene_styles.js";

/** Translation with a local fallback until en.js/zh.js import these keys. */
function usePanelText() {
  const { t } = useI18n();
  return useMemo(
    () => (key) => {
      const translated = t(key);
      return translated === key ? (stylesEn[key] ?? key) : translated;
    },
    [t],
  );
}

const CONTROL_CLASS =
  "rounded-lg bg-[#222222] px-2 py-1 text-[11px] font-mono text-neutral-200 outline-none transition-colors hover:bg-[#282828] focus:bg-[#282828] focus:ring-1 focus:ring-[#a7ffd4]/50";
const ICON_BUTTON_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/60 disabled:cursor-not-allowed disabled:opacity-40";

const TYPE_ORDER = ["paint", "text", "effect"];

/** Same paint capability rule as the colour section: no regions/groups/adjustments. */
function isPaintCapable(object) {
  return (
    object.kind !== "region" &&
    object.kind !== "group" &&
    object.kind !== "adjustment"
  );
}

/**
 * One style type block: current style dropdown (apply/detach), active style
 * name (rename), update-from-selection, delete and inline save-current.
 */
function StyleTypeRow({
  type,
  styles,
  activeStyle,
  actions,
  tv,
  creating,
  onStartCreate,
  onCancelCreate,
  onCreate,
}) {
  const [draft, setDraft] = useState("");
  const canApply = Boolean(actions.apply);
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/5 bg-[#1c1c1c] p-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[9px] uppercase tracking-[0.14em] text-neutral-400">
          {tv(`styles.type.${type}`)}
        </span>
        <button
          type="button"
          data-testid={`editor-style-save-${type}`}
          onClick={() => {
            setDraft("");
            onStartCreate(type);
          }}
          disabled={!actions.create || creating === type}
          title={tv("styles.saveCurrent")}
          aria-label={tv("styles.saveCurrent")}
          className={ICON_BUTTON_CLASS}
        >
          <IconAdd size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* Apply / detach: "No style" clears the reference but keeps the values. */}
      <div className="relative flex items-center">
        <select
          data-testid={`editor-style-${type}`}
          aria-label={`${tv("styles.type." + type)} ${tv("styles.select")}`}
          value={activeStyle?.id ?? ""}
          disabled={!canApply}
          onChange={(event) => {
            const styleId = event.target.value;
            if (styleId) actions.apply?.(type, styleId);
            else actions.detach?.(type);
          }}
          className="w-full appearance-none rounded-xl bg-[#222222] py-1.5 pl-2 pr-7 text-[11px] font-mono text-neutral-200 outline-none transition-colors hover:bg-[#282828] focus:bg-[#282828] focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <option value="" className="bg-[#1e1e1e] text-neutral-300">
            {tv("styles.none")}
          </option>
          {styles.map((style) => (
            <option
              key={style.id}
              value={style.id}
              className="bg-[#1e1e1e] text-neutral-100"
            >
              {style.name}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 text-neutral-400">
          <IconChevronDown size={12} />
        </span>
        {activeStyle ? (
          <button
            type="button"
            onClick={() => actions.detach?.(type)}
            disabled={!actions.detach}
            title={tv("styles.detach")}
            aria-label={tv("styles.detach")}
            className={`${ICON_BUTTON_CLASS} ml-1`}
          >
            <IconClose size={11} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {creating === type ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={tv("styles.newName")}
            aria-label={tv("styles.newName")}
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCreate(type, draft.trim());
              } else if (event.key === "Escape") {
                event.stopPropagation();
                onCancelCreate();
              }
            }}
            className={`${CONTROL_CLASS} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => onCreate(type, draft.trim())}
            disabled={!actions.create}
            title={tv("styles.save")}
            aria-label={tv("styles.save")}
            className="rounded-lg bg-[#a7ffd4]/15 px-2 py-1 text-[10px] font-mono text-[#a7ffd4] transition-colors hover:bg-[#a7ffd4]/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {tv("styles.save")}
          </button>
          <button
            type="button"
            onClick={onCancelCreate}
            title={tv("styles.none")}
            aria-label={tv("styles.none")}
            className={ICON_BUTTON_CLASS}
          >
            <IconClose size={11} strokeWidth={2} />
          </button>
        </div>
      ) : null}

      {activeStyle ? (
        <div className="flex items-center gap-1.5">
          <input
            key={`${activeStyle.id}:${activeStyle.name}`}
            type="text"
            defaultValue={activeStyle.name}
            aria-label={tv("styles.rename")}
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (name && name !== activeStyle.name) {
                actions.rename?.(type, activeStyle.id, name);
              }
            }}
            className={`${CONTROL_CLASS} min-w-0 flex-1 text-[11px] text-neutral-100`}
          />
          <button
            type="button"
            data-testid={`editor-style-update-${type}`}
            onClick={() => actions.update?.(type, activeStyle.id)}
            disabled={!actions.update}
            title={tv("styles.update")}
            aria-label={tv("styles.update")}
            className={ICON_BUTTON_CLASS}
          >
            <IconSwap size={12} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            data-testid={`editor-style-delete-${type}`}
            onClick={() => actions.delete?.(type, activeStyle.id)}
            disabled={!actions.delete}
            title={tv("styles.delete")}
            aria-label={tv("styles.delete")}
            className={`${ICON_BUTTON_CLASS} hover:bg-rose-500/10 hover:text-rose-400`}
          >
            <IconTrash size={12} strokeWidth={1.5} />
          </button>
        </div>
      ) : styles.length === 0 ? (
        <p className="px-0.5 text-[9px] leading-relaxed text-neutral-500">
          {tv("styles.empty")}
        </p>
      ) : null}
    </div>
  );
}

StyleTypeRow.propTypes = {
  type: PropTypes.string.isRequired,
  styles: PropTypes.array.isRequired,
  activeStyle: PropTypes.object,
  actions: PropTypes.object.isRequired,
  tv: PropTypes.func.isRequired,
  creating: PropTypes.string,
  onStartCreate: PropTypes.func.isRequired,
  onCancelCreate: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
};

/**
 * Named styles for one selected layer.
 *
 * `styles`   — raw `doc.styles` (normalised here; `null` is tolerated).
 * `styleActions` — actions from `createStylePanelActions`:
 *   create(type, name?), apply(type, styleId), detach(type),
 *   update(type, styleId), rename(type, styleId, name), delete(type, styleId).
 */
export default function StyleSection({ object, styles = null, styleActions = null }) {
  const tv = usePanelText();
  const [creating, setCreating] = useState(null);
  const library = normalizeStyles(styles);
  const styleIds = object?.styleIds ?? {};

  if (!styleActions) return null;

  const types = TYPE_ORDER.filter((type) => {
    // Images paint from their bitmap, so only effects/text apply to them.
    if (type === "paint") return isPaintCapable(object) && object.kind !== "image";
    if (type === "text") return object.kind === "text";
    return true;
  });

  return (
    <CollapsibleSection
      title={tv("styles.title")}
      storageKey="editor.styles"
      testId="editor-style-section"
    >
      <div className="flex flex-col gap-2">
        {types.map((type) => {
          const list = library[type];
          const activeId = styleIds[STYLE_TYPE_KEYS[type]];
          const activeStyle = activeId
            ? (list.find((style) => style.id === activeId) ?? null)
            : null;
          return (
            <StyleTypeRow
              key={type}
              type={type}
              styles={list}
              activeStyle={activeStyle}
              actions={styleActions}
              tv={tv}
              creating={creating}
              onStartCreate={setCreating}
              onCancelCreate={() => setCreating(null)}
              onCreate={(nextType, name) => {
                styleActions.create?.(nextType, name || undefined);
                setCreating(null);
              }}
            />
          );
        })}
        <p className="px-0.5 text-[9px] leading-relaxed text-neutral-500">
          {tv("styles.hint")}
        </p>
      </div>
    </CollapsibleSection>
  );
}

StyleSection.propTypes = {
  object: PropTypes.object.isRequired,
  styles: PropTypes.object,
  styleActions: PropTypes.object,
};
