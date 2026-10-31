import { CommentLauncherHost } from "./comment_launcher_host.jsx";
import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Copy, Trash2 } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { finishPageRename, movePageToEdge } from "./page_switcher_interactions.js";
import usePageSwitcherDrag from "./use_page_switcher_drag.js";
import { useDesignStore } from "../../store/design_store.js";

export default function PageSwitcher() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const root = useRef(null);
  const edit = useRef(null);
  const listRef = useRef(null);
  const startRename = (id) => {
    edit.current = id;
    setRenaming(id);
  };
  const finishRename = (value, cancel = false) => {
    finishPageRename(edit, useDesignStore.getState(), value, cancel);
    setRenaming(null);
  };
  const nodes = useDesignStore((s) => s.nodes);
  const focusedId = useDesignStore((s) => s.editingNodeId);
  const current = nodes.find((node) => node.id === focusedId) ?? nodes[0];
  const actions = useDesignStore.getState();
  const { drag, beginRowDrag, cancelDrag } = usePageSwitcherDrag({
    listRef,
    enabled: open || nodes.length === 0,
    onDrop: (sourceId, targetId, edge) => {
      const state = useDesignStore.getState();
      movePageToEdge(state, state.nodes, sourceId, targetId, edge);
    },
  });
  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (!root.current?.contains(event.target)) {
        cancelDrag();
        finishPageRename(edit, useDesignStore.getState(), root.current?.querySelector("input")?.value);
        setRenaming(null);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [cancelDrag, open]);
  const add = () => {
    const highest = nodes.reduce(
      (max, node) =>
        Math.max(
          max,
          Number(/(?:Page|页面) (\d+)$/.exec(node.data?.label ?? "")?.[1] || 0),
        ),
      0,
    );
    actions.addEditorPage({ label: `${t("pageSwitcher.page")} ${highest + 1}` });
  };
  return (
    <div
      ref={root}
      data-testid="page-switcher"
      className="absolute bottom-4 left-4 z-[60] flex flex-col items-start gap-2"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          cancelDrag();
          setOpen(false);
          finishRename("", true);
        }
      }}
    >
      {(open || nodes.length === 0) && (
        <section
          aria-label={t("pageSwitcher.label")}
          className="flex max-h-[50vh] w-80 flex-col gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/95 p-2 shadow-menu backdrop-blur-2xl"
        >
          <h2 className="px-3 py-2 text-xs font-medium text-neutral-400">
            {t("pageSwitcher.label")}
          </h2>
          {nodes.length === 0 && (
            <p
              data-testid="pages-empty"
              className="px-3 py-4 text-xs text-neutral-400"
            >
              {t("pageSwitcher.empty")}
            </p>
          )}
          <ul ref={listRef} className="flex flex-col gap-1">
            {nodes.map((node) => {
              const active = node.id === current?.id;
              const label = node.data?.label ?? t("pageSwitcher.untitled");
              return (
                <li
                  key={node.id}
                  data-page-id={node.id}
                  onPointerDown={(event) => {
                    if (renaming !== null) return;
                    beginRowDrag(event, node.id);
                  }}
                  className={`relative group flex items-center gap-1 rounded-xl px-1 text-xs ${active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5"}${drag?.id === node.id ? " opacity-60" : ""}`}
                >
                  {drag?.targetId === node.id && drag.id !== node.id && (
                    <span
                      data-testid="page-drop-indicator"
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-x-1 z-10 h-px bg-neutral-300 ${drag.edge === "before" ? "-top-0.5" : "-bottom-0.5"}`}
                    />
                  )}
                  {renaming === node.id ? (
                    <input
                      autoFocus
                      aria-label={t("pageSwitcher.rename")}
                      defaultValue={label}
                      maxLength={80}
                      onFocus={(e) => e.target.select()}
                      className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-2 outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          finishRename(e.currentTarget.value, true);
                        }
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          finishRename(e.currentTarget.value);
                        }
                      }}
                      onBlur={(e) => {
                        finishRename(e.currentTarget.value);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onDoubleClick={() => startRename(node.id)}
                      onClick={() =>
                        actions.focusEditorPage(node.id, {
                          rememberCamera: true,
                          exclusive: true,
                        })
                      }
                      className="min-w-0 flex-1 truncate px-2 py-2.5 text-left focus-visible:outline focus-visible:outline-[#a7ffd4]"
                      title={label}
                    >
                      {label}
                    </button>
                  )}
                  {[
                    [
                      Copy,
                      "duplicate",
                      () =>
                        actions.duplicateEditorPage(node.id, {
                          copySuffix: t("pageSwitcher.copySuffix"),
                          defaultLabel: t("pageSwitcher.page"),
                        }),
                    ],
                    [Trash2, "close", () => actions.deleteEditorPage(node.id)],
                  ].map(([Icon, key, onClick]) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={`${t(`pageSwitcher.${key}`)}: ${label}`}
                      title={t(`pageSwitcher.${key}`)}
                      data-page-action="true"
                      onClick={onClick}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-[#a7ffd4]"
                    >
                      <Icon size={13} />
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={add}
            className="mt-1 rounded-xl px-3 py-2 text-left text-xs text-[#a7ffd4] hover:bg-white/5"
          >
            + {t("pageSwitcher.add")}
          </button>
        </section>
      )}
      <div className="flex max-w-[calc(100vw-2rem)] items-center gap-2">
        <button
          type="button"
          data-page-switcher-trigger="true"
          aria-label={t("pageSwitcher.label")}
          aria-expanded={open || nodes.length === 0}
          onClick={() => {
            if (open) cancelDrag();
            setOpen((value) => !value);
          }}
          className="flex h-9 min-w-0 items-center gap-2 rounded-full border border-white/10 bg-neutral-900/95 px-3.5 text-xs text-neutral-100 shadow-menu backdrop-blur-2xl"
        >
          <span className="min-w-0 max-w-[160px] truncate">
            {current?.data?.label ?? t("pageSwitcher.untitled")}
          </span>
          <span className="text-neutral-400">
            {current ? nodes.indexOf(current) + 1 : 0}/{nodes.length}
          </span>
          {open || nodes.length === 0 ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <CommentLauncherHost />
      </div>
    </div>
  );
}
