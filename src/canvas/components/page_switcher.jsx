import { useState } from "react";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";

const PAGE_NAME = /^Page (\d+)$/;

/** Next free "Page N" name, after the highest one already in the file. */
function nextPageName(nodes) {
  const highest = nodes.reduce((max, node) => {
    const match = PAGE_NAME.exec(node.data?.label ?? "");
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `Page ${highest + 1}`;
}

/**
 * Page switcher for the open file, bottom-left. Collapsed it shows the current
 * page; expanded, the page list opens upward above it.
 */
export default function PageSwitcher() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const nodes = useDesignStore((state) => state.nodes);
  const focusedId = useDesignStore((state) => state.editingNodeId);
  const focusEditorPage = useDesignStore((state) => state.focusEditorPage);
  const addEditorPage = useDesignStore((state) => state.addEditorPage);
  const deleteEditorPage = useDesignStore((state) => state.deleteEditorPage);

  const current = nodes.find((node) => node.id === focusedId) ?? nodes[0];
  const index = Math.max(0, nodes.findIndex((node) => node.id === current?.id));
  const canDelete = nodes.length > 1;

  return (
    <div className="absolute bottom-4 left-4 z-[60] flex flex-col items-start gap-2">
      {open && (
        <div
          role="listbox"
          aria-label={t("pageSwitcher.label")}
          className="flex max-h-[50vh] w-56 flex-col gap-1 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/95 p-1.5 shadow-menu backdrop-blur-2xl"
        >
          {nodes.map((node) => {
            const active = node.id === focusedId;
            return (
              <div
                key={node.id}
                className={`group flex items-center gap-1 rounded-xl pr-1 text-[12px] ${
                  active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    focusEditorPage(node.id);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left outline-none"
                >
                  {node.data?.label ?? t("pageSwitcher.untitled")}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => deleteEditorPage(node.id)}
                    aria-label={t("pageSwitcher.close")}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-white/20 hover:text-white"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              addEditorPage({ label: nextPageName(nodes) });
            }}
            className="rounded-xl px-3 py-2 text-left text-[12px] text-neutral-300 hover:bg-white/5 hover:text-white"
          >
            + {t("pageSwitcher.add")}
          </button>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-neutral-900/95 px-3.5 text-[12px] text-neutral-100 shadow-menu backdrop-blur-2xl hover:text-white"
      >
        <span className="max-w-[160px] truncate">{current?.data?.label ?? t("pageSwitcher.untitled")}</span>
        <span className="text-neutral-400">
          {index + 1}/{nodes.length}
        </span>
      </button>
    </div>
  );
}
