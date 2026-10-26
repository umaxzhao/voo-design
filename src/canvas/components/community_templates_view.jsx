import React, { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { VOO_RUN_ORIGIN } from "../../shared/vps_origin.js";
import { localizedTemplateValue as localized } from "./community-template-selection.js";
import {
  COMMUNITY_TEMPLATES,
  COMMUNITY_CATEGORIES,
} from "./community_templates_data.js";

const TEMPLATE_API_URL = `${VOO_RUN_ORIGIN}/api/v1/templates`;

function TemplatePreview({ template, locale }) {
  if (template.preview) {
    return (
      <img
        src={template.preview}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-neutral-900 p-6 text-center">
      <p className="line-clamp-5 text-xs text-neutral-300">
        {localized(template.description, locale || "zh") || template.id}
      </p>
    </div>
  );
}

// Native dialog supplies focus containment, Escape dismissal, and focus restoration.
function TemplateDialog({ template, title, locale, t, onClose, onUse }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="template-dialog-title"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-0 text-white backdrop:bg-black/70">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 id="template-dialog-title" className="text-xs font-medium">{title}</h2>
        <button type="button" autoFocus onClick={onClose} aria-label={t("welcome.community.close")}
          className="rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-white"><X size={16} /></button>
      </div>
      <div aria-hidden="true" className="mx-5 aspect-[16/10] overflow-hidden rounded-lg border border-white/10 bg-neutral-950">
        <TemplatePreview template={template} locale={locale} />
      </div>
      <div className="flex items-center justify-between p-5">
        <span className="line-clamp-2 max-w-[70%] text-xs text-neutral-400">{localized(template.description, locale)}</span>
        <button type="button" data-testid="use-template" onClick={() => onUse(template)}
          className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-black hover:bg-neutral-200">{t("welcome.community.useTemplate")}</button>
      </div>
    </dialog>
  );
}

export default function CommunityTemplatesView({ onUseTemplate }) {
  const { t, locale } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModalTemplate, setActiveModalTemplate] = useState(null);
  const [templates, setTemplates] = useState(COMMUNITY_TEMPLATES);
  const [categories, setCategories] = useState(COMMUNITY_CATEGORIES);
  const [loadState, setLoadState] = useState("ready");
  const [applyError, setApplyError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(TEMPLATE_API_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Template API returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data.templates) || !Array.isArray(data.categories)) {
          throw new Error("Template API returned an invalid catalog");
        }
        setTemplates(
          data.templates.filter(
            (template) =>
              template?.id &&
              (template.body || template.document || template.kind === "design" || template.type === "design"),
          ),
        );
        setCategories(data.categories);
        setLoadState("ready");
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.error("[VOO] Failed to load online templates:", error);
        setLoadState(COMMUNITY_TEMPLATES.length ? "ready" : "error");
      });
    return () => controller.abort();
  }, []);

  const title = (template) => {
    const key = `welcome.community.template.${template.id}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
    return localized(template.title, locale) || template.id;
  };
  const categoryLabel = (id) => {
    const category = categories.find((item) => item.id === id);
    if (category?.label) return t(category.label);
    return localized(category, locale) || id;
  };
  const filteredTemplates = (() => {
    const query = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      const cat = template.category || template.categories;
      const matchCat =
        selectedCategory === "all" ||
        (Array.isArray(cat) ? cat.includes(selectedCategory) : cat === selectedCategory);
      const catLabels = Array.isArray(cat) ? cat.map(categoryLabel) : [categoryLabel(cat || "")];
      return (
        matchCat &&
        (!query ||
          [
            title(template),
            localized(template.description, locale),
            localized(template.body, locale),
            ...catLabels,
          ].some((value) => typeof value === "string" && value.toLowerCase().includes(query)))
      );
    });
  })();
  const handleUse = async (template) => {
    setActiveModalTemplate(null);
    setApplyError(false);
    try { await onUseTemplate?.(template); }
    catch (error) {
      console.error("[VOO] Template could not be opened:", error);
      setApplyError(true);
    }
  };
  return (
    <section data-testid="community-templates" className="w-full space-y-5" aria-labelledby="templates-title">
      {applyError ? <p role="alert" className="text-xs text-rose-400">{t("welcome.community.applyFailed")}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="templates-title" className="text-[15px] font-medium text-white">{t("welcome.community.title")}</h1>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
            aria-label={t("welcome.community.searchPlaceholder")} placeholder={t("welcome.community.searchPlaceholder")}
            className="w-full rounded-lg border border-white/10 bg-neutral-900 py-2 pl-9 pr-3 text-xs text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-white/30" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("welcome.community.categories")}>
        {(categories.some((c) => c.id === "all") ? categories : [{ id: "all" }, ...categories]).map((category) => (
          <button key={category.id} type="button" aria-pressed={selectedCategory === category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${selectedCategory === category.id ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}>
            {category.id === "all" ? t("welcome.community.all") : (category.label ? t(category.label) : categoryLabel(category.id))}
          </button>
        ))}
      </div>
      {loadState === "loading" ? (
        <p role="status" className="py-20 text-center text-xs text-neutral-400">{t("welcome.community.loading")}</p>
      ) : loadState === "error" ? (
        <p role="alert" className="py-20 text-center text-xs text-neutral-400">{t("welcome.community.loadFailed")}</p>
      ) : filteredTemplates.length ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <article key={template.id} data-testid="template-card" className="min-w-0">
              <button type="button" onClick={() => setActiveModalTemplate(template)}
                aria-label={`${t("welcome.community.preview")}: ${title(template)}`}
                className="block aspect-[16/10] w-full overflow-hidden rounded-lg border border-white/10 bg-neutral-900 transition-colors hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50">
                <div aria-hidden="true" className="h-full w-full"><TemplatePreview template={template} locale={locale} /></div>
              </button>
              <div className="flex items-center justify-between gap-3 pt-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-medium text-white">{title(template)}</h2>
                  <p className="mt-1 truncate text-[11px] text-neutral-500">
                    {categoryLabel(template.category || template.categories?.[0] || "")}
                    {template.width && template.height ? ` · ${template.width} × ${template.height} px` : ""}
                  </p>
                </div>
                <button type="button" data-testid="use-template" onClick={() => handleUse(template)}
                  className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/20">{t("welcome.community.useTemplate")}</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p role="status" className="text-xs text-neutral-400">{t("welcome.community.empty")}</p>
          <button type="button" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}
            className="mt-3 text-xs text-neutral-300 hover:text-white hover:underline">{t("welcome.community.reset")}</button>
        </div>
      )}
      {activeModalTemplate && <TemplateDialog template={activeModalTemplate} title={title(activeModalTemplate)} locale={locale} t={t}
        onClose={() => setActiveModalTemplate(null)} onUse={handleUse} />}
    </section>
  );
}
