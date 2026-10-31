import { useEffect, useState } from "react";
import { lintDesign } from "../agent/design_quality/lint.js";
import { useI18n } from "../use_i18n.js";
import { IconAlertTriangle, IconChevronDown, IconChevronRight } from "../icons.jsx";

export default function EditorDesignIssues({ objects, engine }) {
  const { t } = useI18n();
  const [issues, setIssues] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    engine?.setDesignIssues?.(issues ?? []);
    return () => engine?.setDesignIssues?.([]);
  }, [engine, issues]);

  useEffect(() => {
    setIssues(null);
    setOpen(false);
  }, [objects]);

  function inspect() {
    const result = lintDesign({ nodes: objects });
    setIssues(result.issues);
    setOpen(true);
  }

  return <section className="mb-2">
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={inspect}
        aria-label={t("editor.designIssues.run")}
        title={t("editor.designIssues.run")}
        className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-[10px] font-mono text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
      >
        <IconAlertTriangle size={13} />
        <span>{t("editor.designIssues.run")}</span>
        {issues ? <span className="ml-auto tabular-nums">{issues.length}</span> : null}
      </button>
      {issues ? <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={t(open ? "editor.designIssues.collapse" : "editor.designIssues.expand")}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-white/[0.06] hover:text-neutral-200"
      >
        {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
      </button> : null}
    </div>
    {open && issues ? <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
      {issues.length === 0 ? <p className="px-2 py-2 text-[10px] text-neutral-500">{t("editor.designIssues.clean")}</p> : issues.map((issue, index) => <article
        key={`${issue.rule}-${issue.nodeIds.join("-")}-${index}`}
        className="rounded-lg bg-white/[0.035] px-2 py-1.5"
      >
        <p className="text-[10px] leading-relaxed text-neutral-300">{issue.message}</p>
        <p className="mt-0.5 text-[9px] text-neutral-500">{issue.fix}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {issue.nodeIds.map(id => <button
            key={id}
            type="button"
            onClick={() => engine?.selectExactly?.([id])}
            className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-[#a7ffd4] hover:bg-white/[0.1]"
          >{objects.find(node => node.id === id)?.name || t("editor.designIssues.selectLayer")}</button>)}
        </div>
      </article>)}</div> : null}
  </section>;
}
