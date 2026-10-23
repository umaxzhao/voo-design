import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Copy, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";

export default function PageSwitcher() {
  const { t } = useI18n();
  const [size, setSize] = useState("default");
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const root = useRef(null);
  const nodes = useDesignStore((s) => s.nodes);
  const focusedId = useDesignStore((s) => s.editingNodeId);
  const current = nodes.find((node) => node.id === focusedId) ?? nodes[0];
  const actions = useDesignStore.getState();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (!root.current?.contains(event.target)) {
        setOpen(false);
        setRenaming(null);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const add = () => {
    const highest = nodes.reduce(
      (max, node) =>
        Math.max(
          max,
          Number(/(?:Page|页面) (\d+)$/.exec(node.data?.label ?? "")?.[1] || 0),
        ),
      0,
    );
    actions.addEditorPage({
      label: `${t("pageSwitcher.page")} ${highest + 1}`,
      ...({ phone: { width: 393, height: 852 }, desktop: { width: 1440, height: 900 }, social: { width: 1080, height: 1080 } }[size] ?? {}),
    });
  };
  return (
    <div
      ref={root}
      data-testid="page-switcher"
      className="absolute bottom-4 left-4 z-[60] flex flex-col items-start gap-2"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          setOpen(false);
          setRenaming(null);
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
              className="px-3 py-4 text-sm text-neutral-400"
            >
              {t("pageSwitcher.empty")}
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {nodes.map((node, index) => {
              const active = node.id === current?.id;
              const label = node.data?.label ?? t("pageSwitcher.untitled");
              return (
                <li
                  key={node.id}
                  className={`group flex items-center gap-1 rounded-xl px-1 text-xs ${active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5"}`}
                >
                  {renaming === node.id ? (
                    <input
                      autoFocus
                      aria-label={t("pageSwitcher.rename")}
                      defaultValue={label}
                      maxLength={80}
                      onFocus={(e) => e.target.select()}
                      className="min-w-0 flex-1 rounded bg-white/10 px-2 py-2 outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setRenaming(null);
                        }
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        actions.renameEditorPage(node.id, e.target.value);
                        setRenaming(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onDoubleClick={() => setRenaming(node.id)}
                      onClick={() => actions.focusEditorPage(node.id)}
                      className="min-w-0 flex-1 truncate px-2 py-2.5 text-left focus-visible:outline focus-visible:outline-[#a7ffd4]"
                      title={label}
                    >
                      {label}
                    </button>
                  )}
                  {[
                    [Pencil, "rename", () => setRenaming(node.id)],
                    [
                      Copy,
                      "duplicate",
                      () =>
                        actions.duplicateEditorPage(node.id, {
                          copySuffix: t("pageSwitcher.copySuffix"),
                          defaultLabel: t("pageSwitcher.page"),
                        }),
                    ],
                    [
                      ChevronUp,
                      "moveUp",
                      () => actions.reorderEditorPage(node.id, -1),
                      index === 0,
                    ],
                    [
                      ChevronDown,
                      "moveDown",
                      () => actions.reorderEditorPage(node.id, 1),
                      index === nodes.length - 1,
                    ],
                    [Trash2, "close", () => actions.deleteEditorPage(node.id)],
                  ].map(([Icon, key, onClick, disabled]) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={`${t(`pageSwitcher.${key}`)}: ${label}`}
                      title={t(`pageSwitcher.${key}`)}
                      disabled={disabled}
                      onClick={onClick}
                      className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-[#a7ffd4] disabled:opacity-25"
                    >
                      <Icon size={13} />
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
          <select
            aria-label={t("editor.canvas.size")}
            value={size}
            onChange={(event) => setSize(event.target.value)}
            className="mx-2 mt-2 rounded-lg border border-white/10 bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300"
          >
            <option value="default">{t("editor.canvas.group.default")} · 1200 × 800</option>
            <option value="phone">{t("editor.canvas.group.phone")} · 393 × 852</option>
            <option value="desktop">{t("editor.canvas.group.desktop")} · 1440 × 900</option>
            <option value="social">{t("editor.canvas.group.social")} · 1080 × 1080</option>
          </select>
          <button
            type="button"
            onClick={add}
            className="mt-1 rounded-xl px-3 py-2 text-left text-xs text-[#a7ffd4] hover:bg-white/5"
          >
            + {t("pageSwitcher.add")}
          </button>
        </section>
      )}
      <button
        type="button"
        aria-label={t("pageSwitcher.label")}
        aria-expanded={open || nodes.length === 0}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-neutral-900/95 px-3.5 text-xs text-neutral-100 shadow-menu backdrop-blur-2xl"
      >
        <span className="max-w-[160px] truncate">
          {current?.data?.label ?? t("pageSwitcher.untitled")}
        </span>
        <span className="text-neutral-400">
          {current ? nodes.indexOf(current) + 1 : 0}/{nodes.length}
        </span>
        {open || nodes.length === 0 ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>
    </div>
  );
}
