/**
 * Variables panel — collections, modes and typed variables.
 *
 * A self-contained portal modal. It is a *pure* view: every mutation is routed
 * through the `actions` object supplied by the caller (`color_variables_section`
 * builds one on top of the pure model ops in `scene_variables.js` and the
 * engine commit path), so one user action is one undo entry and the panel never
 * touches the document itself.
 *
 * Data model: see `src/canvas/editor/scene_variables.js`.
 *
 * Design language: dark chrome, mono type, 10–11px labels, #222 fields,
 * mint/purple focus accents, no gradients or emoji. Esc or a backdrop click
 * closes; every control has an aria label.
 */

import PropTypes from "prop-types";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../use_i18n.js";
import { HexField } from "./colour_swatch.jsx";
import { IconAdd, IconClose, IconTrash } from "../../icons.jsx";
import variablesEn from "../../../shared/i18n/variables-en.js";

/** Translation with a local fallback until `en.js`/`zh.js` import these keys. */
function usePanelText() {
  const { t } = useI18n();
  return useMemo(
    () => (key) => {
      const translated = t(key);
      return translated === key ? (variablesEn[key] ?? key) : translated;
    },
    [t],
  );
}

const CONTROL_CLASS =
  "rounded-lg bg-[#222222] px-2 py-1 text-[11px] font-mono text-neutral-200 outline-none transition-colors hover:bg-[#282828] focus:bg-[#282828] focus:ring-1 focus:ring-[#a7ffd4]/50";
const GHOST_BUTTON_CLASS =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/60";

/** Row label used above each variable editor field. */
function RowLabel({ children }) {
  return (
    <span className="text-[9px] uppercase tracking-wider text-neutral-500">
      {children}
    </span>
  );
}

RowLabel.propTypes = { children: PropTypes.node.isRequired };

/** Committed-on-blur text input. `syncKey` remounts it when the doc changes. */
function TextField({ value, ariaLabel, syncKey, onCommit }) {
  return (
    <input
      key={syncKey}
      type="text"
      defaultValue={value}
      aria-label={ariaLabel}
      spellCheck={false}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={(event) => {
        const next = event.target.value.trim();
        if (next && next !== value) onCommit(next);
      }}
      className={`${CONTROL_CLASS} min-w-0 flex-1`}
    />
  );
}

TextField.propTypes = {
  value: PropTypes.string.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  syncKey: PropTypes.string.isRequired,
  onCommit: PropTypes.func.isRequired,
};

/** Number editor; invalid/NaN input is discarded (state stays unchanged). */
function NumberField({ value, ariaLabel, syncKey, onCommit }) {
  return (
    <input
      key={syncKey}
      type="number"
      step="any"
      defaultValue={value}
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={(event) => {
        const next = Number(event.target.value);
        if (event.target.value.trim() !== "" && Number.isFinite(next) && next !== value) {
          onCommit(next);
        }
      }}
      className={`${CONTROL_CLASS} w-24 min-w-0 tabular-nums`}
    />
  );
}

NumberField.propTypes = {
  value: PropTypes.number.isRequired,
  ariaLabel: PropTypes.string.isRequired,
  syncKey: PropTypes.string.isRequired,
  onCommit: PropTypes.func.isRequired,
};

/** One variable value editor, switched on the variable type. */
function ValueEditor({ variable, modeId, label, onCommit }) {
  const value = variable.valuesByMode[modeId];
  if (variable.type === "color") {
    const color = typeof value === "string" ? value : "";
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
          style={{ backgroundColor: color || "transparent" }}
        />
        <div className="flex min-w-0 flex-1 items-center rounded-lg bg-[#222222] focus-within:bg-[#282828] focus-within:ring-1 focus-within:ring-[#a7ffd4]/50">
          <HexField
            value={color}
            ariaLabel={label}
            onCommit={(next) => onCommit(next)}
          />
        </div>
      </div>
    );
  }
  if (variable.type === "number") {
    return (
      <NumberField
        value={typeof value === "number" ? value : 0}
        ariaLabel={label}
        syncKey={`${variable.id}:${modeId}:${String(value)}`}
        onCommit={onCommit}
      />
    );
  }
  if (variable.type === "boolean") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={value === true}
        aria-label={label}
        onClick={() => onCommit(value !== true)}
        className={`flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors ${
          value === true
            ? "justify-end border-[#a7ffd4]/40 bg-[#a7ffd4]/20"
            : "justify-start border-white/10 bg-[#222222]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-4 w-4 rounded-full transition-colors ${
            value === true ? "bg-[#a7ffd4]" : "bg-neutral-500"
          }`}
        />
      </button>
    );
  }
  return (
    <TextField
      value={typeof value === "string" ? value : ""}
      ariaLabel={label}
      syncKey={`${variable.id}:${modeId}:${String(value)}`}
      onCommit={onCommit}
    />
  );
}

ValueEditor.propTypes = {
  variable: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    valuesByMode: PropTypes.object.isRequired,
  }).isRequired,
  modeId: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onCommit: PropTypes.func.isRequired,
};

/**
 * The variables panel.
 *
 * `actions` (all optional — missing ones render disabled/hidden so the panel
 * degrades safely in hosts that only expose the legacy colour callbacks):
 *   close(), setActiveMode(collectionId, modeId),
 *   addCollection(), renameCollection(id, name), deleteCollection(id),
 *   addMode(collectionId), deleteMode(collectionId, modeId),
 *   addVariable(collectionId, type), renameVariable(id, name),
 *   updateValue(variableId, modeId, value), deleteVariable(id),
 *   bind(variableId | null)
 */
export default function VariablesPanel({
  open,
  model,
  activeBindingId = null,
  supportedTypes = ["color"],
  canAddVariable = true,
  actions = {},
}) {
  const tv = usePanelText();
  const dialogRef = useRef(null);
  // Keep the latest close handler without re-running the key/focus effect on
  // every parent render (a re-focus would steal focus from a field mid-edit).
  const closeRef = useRef(actions.close);
  closeRef.current = actions.close;
  const collections = model?.collections ?? [];
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? null);
  const [addType, setAddType] = useState(supportedTypes[0] ?? "color");

  // A delete/undo can remove the selected collection; follow the model.
  useEffect(() => {
    if (collections.length === 0) {
      if (collectionId !== null) setCollectionId(null);
      return;
    }
    if (!collections.some((collection) => collection.id === collectionId)) {
      setCollectionId(collections[0].id);
    }
  }, [collections, collectionId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus?.();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const collection = collections.find((item) => item.id === collectionId) ?? null;
  const modeId = collection
    ? model.activeModeByCollection?.[collection.id] ?? collection.modes[0]?.id
    : null;
  const canCreateVariable = Boolean(
    collection && actions.addVariable && canAddVariable,
  );

  return createPortal(
    <div
      data-testid="editor-variables-panel"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) actions.close?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={tv("editor.variables.panel.title")}
        tabIndex={-1}
        className="flex max-h-[80vh] w-[680px] max-w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] p-3 font-mono text-neutral-200 shadow-panel outline-none"
      >
        <header className="mb-2.5 flex items-center justify-between gap-2">
          <h2 className="text-[12px] font-medium tracking-wide text-neutral-100">
            {tv("editor.variables.panel.title")}
          </h2>
          <button
            type="button"
            onClick={() => actions.close?.()}
            aria-label={tv("editor.variables.panel.close")}
            title={tv("editor.variables.panel.close")}
            className={GHOST_BUTTON_CLASS}
          >
            <IconClose size={13} strokeWidth={1.5} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Collections rail */}
          <aside
            aria-label={tv("editor.variables.panel.collections")}
            className="flex w-40 shrink-0 flex-col gap-1.5 overflow-y-auto rounded-xl bg-[#151515] p-1.5"
          >
            <div className="flex items-center justify-between px-1">
              <RowLabel>{tv("editor.variables.panel.collections")}</RowLabel>
              <button
                type="button"
                onClick={() => actions.addCollection?.()}
                disabled={!actions.addCollection}
                aria-label={tv("editor.variables.panel.addCollection")}
                title={tv("editor.variables.panel.addCollection")}
                className={`${GHOST_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <IconAdd className="text-neutral-300" size={12} strokeWidth={1.5} />
              </button>
            </div>
            {collections.length === 0 ? (
              <p className="px-1 text-[10px] text-neutral-500">
                {tv("editor.variables.panel.noCollections")}
              </p>
            ) : (
              collections.map((item) => {
                const selected = item.id === collectionId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCollectionId(item.id)}
                    className={`truncate rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                      selected
                        ? "bg-[#222222] text-[#a7ffd4]"
                        : "text-neutral-300 hover:bg-white/5 hover:text-neutral-100"
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })
            )}
            {collection && actions.deleteCollection ? (
              <button
                type="button"
                onClick={() => actions.deleteCollection?.(collection.id)}
                aria-label={tv("editor.variables.panel.deleteCollection")}
                title={tv("editor.variables.panel.deleteCollection")}
                className={`${GHOST_BUTTON_CLASS} mt-auto w-full`}
              >
                <IconTrash size={12} strokeWidth={1.5} />
              </button>
            ) : null}
          </aside>

          {/* Selected collection */}
          <section className="flex min-w-0 flex-1 flex-col gap-2">
            {!collection ? (
              <p className="rounded-xl bg-[#151515] p-3 text-[10px] text-neutral-500">
                {tv("editor.variables.panel.noCollections")}
              </p>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <input
                    key={`${collection.id}:${collection.name}`}
                    type="text"
                    defaultValue={collection.name}
                    aria-label={tv("editor.variables.panel.collectionName")}
                    spellCheck={false}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== collection.name) {
                        actions.renameCollection?.(collection.id, next);
                      }
                    }}
                    className={`${CONTROL_CLASS} min-w-0 flex-1 text-[11px] text-neutral-100`}
                  />
                </div>

                {/* Mode tabs */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <RowLabel>{tv("editor.variables.panel.modes")}</RowLabel>
                    <button
                      type="button"
                      onClick={() => actions.addMode?.(collection.id)}
                      disabled={!actions.addMode}
                      aria-label={tv("editor.variables.panel.addMode")}
                      title={tv("editor.variables.panel.addMode")}
                      className={`${GHOST_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <IconAdd className="text-neutral-300" size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {collection.modes.map((mode) => {
                      const active = mode.id === modeId;
                      return (
                        <span
                          key={mode.id}
                          className={`flex items-center gap-0.5 rounded-lg border px-1 ${
                            active
                              ? "border-[#a7ffd4]/30 bg-[#a7ffd4]/10"
                              : "border-white/10 bg-[#151515]"
                          }`}
                        >
                          <button
                            type="button"
                            aria-pressed={active}
                            title={mode.name}
                            onClick={() =>
                              actions.setActiveMode?.(collection.id, mode.id)
                            }
                            className={`px-1.5 py-1 text-[10px] transition-colors ${
                              active ? "text-[#a7ffd4]" : "text-neutral-300 hover:text-neutral-100"
                            }`}
                          >
                            {mode.name}
                          </button>
                          {actions.deleteMode && collection.modes.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                actions.deleteMode?.(collection.id, mode.id)
                              }
                              aria-label={`${tv("editor.variables.panel.deleteMode")} ${mode.name}`}
                              title={tv("editor.variables.panel.deleteMode")}
                              className="flex h-4 w-4 items-center justify-center rounded-lg text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
                            >
                              <IconClose size={9} strokeWidth={2} />
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                  {!actions.setActiveMode ? (
                    <p className="text-[9px] leading-relaxed text-neutral-500">
                      {tv("editor.variables.panel.modesUnavailable")}
                    </p>
                  ) : null}
                </div>

                {/* Variables list */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl bg-[#151515]">
                  <div className="flex items-center gap-2 border-b border-white/5 px-2 py-1.5">
                    <RowLabel>{tv("editor.variables.panel.variables")}</RowLabel>
                    <span className="flex-1" />
                    <RowLabel>{tv("editor.variables.panel.value")}</RowLabel>
                  </div>
                  {collection.variables.length === 0 ? (
                    <p className="px-2 py-3 text-[10px] text-neutral-500">
                      {tv("editor.variables.panel.empty")}
                    </p>
                  ) : (
                    collection.variables.map((variable) => {
                      const bound = activeBindingId === variable.id;
                      const value = variable.valuesByMode[modeId];
                      return (
                        <div
                          key={variable.id}
                          data-testid={`editor-variables-row-${variable.id}`}
                          className="flex items-center gap-2 border-b border-white/[0.04] px-2 py-1.5 last:border-b-0"
                        >
                          <span className="w-10 shrink-0 text-[9px] uppercase tracking-wider text-neutral-500">
                            {tv(`editor.variables.panel.type.${variable.type}`)}
                          </span>
                          <TextField
                            value={variable.name}
                            ariaLabel={tv("editor.variables.panel.variableName")}
                            syncKey={`${variable.id}:${variable.name}`}
                            onCommit={(name) =>
                              actions.renameVariable?.(variable.id, name)
                            }
                          />
                          <ValueEditor
                            variable={variable}
                            modeId={modeId}
                            label={`${tv("editor.variables.panel.value")} ${variable.name}`}
                            onCommit={(next) =>
                              actions.updateValue?.(variable.id, modeId, next)
                            }
                          />
                          {variable.type === "color" && actions.bind ? (
                            <button
                              type="button"
                              onClick={() =>
                                actions.bind?.(bound ? null : variable.id)
                              }
                              aria-pressed={bound}
                              aria-label={
                                bound
                                  ? tv("editor.variables.panel.bound")
                                  : tv("editor.variables.panel.bind")
                              }
                              title={
                                bound
                                  ? tv("editor.variables.panel.unbind")
                                  : tv("editor.variables.panel.bind")
                              }
                              className={`flex h-6 shrink-0 items-center rounded-lg px-1.5 text-[9px] uppercase tracking-wide transition-colors ${
                                bound
                                  ? "bg-[#a7ffd4]/15 text-[#a7ffd4]"
                                  : "text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
                              }`}
                            >
                              {bound ? tv("editor.variables.panel.bound") : tv("editor.variables.panel.bind")}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => actions.deleteVariable?.(variable.id)}
                            disabled={!actions.deleteVariable}
                            aria-label={tv("editor.variables.panel.deleteVariable")}
                            title={tv("editor.variables.panel.deleteVariable")}
                            className={`${GHOST_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            <IconTrash size={11} strokeWidth={1.5} />
                          </button>
                          <span className="sr-only">
                            {variable.type === "boolean"
                              ? value === true
                                ? tv("editor.variables.panel.true")
                                : tv("editor.variables.panel.false")
                              : ""}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add variable */}
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label={tv("editor.variables.panel.variableType")}
                    disabled={!canCreateVariable}
                    value={addType}
                    onChange={(event) => setAddType(event.target.value)}
                    className={`${CONTROL_CLASS} w-28 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {supportedTypes.map((type) => (
                      <option key={type} value={type}>
                        {tv(`editor.variables.panel.type.${type}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!canCreateVariable}
                    onClick={() =>
                      actions.addVariable?.(
                        collection.id,
                        addType || supportedTypes[0] || "color",
                      )
                    }
                    className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[10px] text-neutral-300 transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconAdd className="text-neutral-300" size={11} strokeWidth={1.5} />
                    <span>{tv("editor.variables.panel.addVariable")}</span>
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

VariablesPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  model: PropTypes.shape({
    collections: PropTypes.array.isRequired,
    activeModeByCollection: PropTypes.object.isRequired,
  }),
  activeBindingId: PropTypes.string,
  supportedTypes: PropTypes.arrayOf(PropTypes.string),
  canAddVariable: PropTypes.bool,
  actions: PropTypes.shape({
    close: PropTypes.func,
    setActiveMode: PropTypes.func,
    addCollection: PropTypes.func,
    renameCollection: PropTypes.func,
    deleteCollection: PropTypes.func,
    addMode: PropTypes.func,
    deleteMode: PropTypes.func,
    addVariable: PropTypes.func,
    renameVariable: PropTypes.func,
    updateValue: PropTypes.func,
    deleteVariable: PropTypes.func,
    bind: PropTypes.func,
  }),
};
