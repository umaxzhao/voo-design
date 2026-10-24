import React, { useState, useRef, useEffect } from "react";
import { Search, Layers, X } from "lucide-react";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_TEMPLATES,
} from "./community_templates_data.js";
import { useI18n } from "../use_i18n.js";

/**
 * Miniature visual preview mockups for templates
 * Conforms 100% to Design.md: neutral structure, no off-scale fonts, no non-standard borders.
 */
function TemplateMiniPreview({ templateId }) {
  switch (templateId) {
    case "saas-analytics-dashboard":
      return (
        <div className="w-full h-full bg-neutral-950 p-3 flex flex-col justify-between text-[9px] select-none pointer-events-none">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-md bg-white/40" />
              <span className="font-medium text-white">VOO Cloud</span>
            </div>
            <div className="flex gap-1.5">
              <div className="h-4 px-2 rounded-lg bg-neutral-800 text-neutral-400 flex items-center">30 Days</div>
              <div className="h-4 px-2 rounded-lg bg-white/10 text-white flex items-center font-medium">+ Report</div>
            </div>
          </div>
          <div className="flex-1 flex gap-2 pt-2">
            <div className="w-12 border-r border-white/10 flex flex-col gap-1 pr-1">
              <div className="h-2.5 rounded-lg bg-white/10 text-white px-1 flex items-center">Overview</div>
              <div className="h-2 rounded-lg bg-neutral-800" />
              <div className="h-2 rounded-lg bg-neutral-800" />
              <div className="h-2 rounded-lg bg-neutral-800" />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-neutral-900 border border-white/10 rounded-lg p-1.5">
                  <div className="text-[9px] text-neutral-400">Revenue</div>
                  <div className="text-[10px] font-medium text-white mt-0.5">$142.8k</div>
                </div>
                <div className="bg-neutral-900 border border-white/10 rounded-lg p-1.5">
                  <div className="text-[9px] text-neutral-400">Users</div>
                  <div className="text-[10px] font-medium text-white mt-0.5">8,420</div>
                </div>
                <div className="bg-neutral-900 border border-white/10 rounded-lg p-1.5">
                  <div className="text-[9px] text-neutral-400">Uptime</div>
                  <div className="text-[10px] font-medium text-white mt-0.5">99.98%</div>
                </div>
              </div>
              <div className="flex-1 bg-neutral-900 border border-white/10 rounded-lg p-2 flex items-end justify-between gap-1">
                {[40, 65, 30, 85, 55, 95, 75].map((h, i) => (
                  <div key={i} className="flex-1 bg-neutral-800 rounded-lg flex flex-col justify-end overflow-hidden h-full">
                    <div
                      style={{ height: `${h}%` }}
                      className={`w-full rounded-lg ${i === 5 ? "bg-white" : "bg-neutral-700"}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );

    case "ios-fintech-wallet":
      return (
        <div className="w-full h-full bg-neutral-950 flex items-center justify-center p-2 select-none pointer-events-none">
          <div className="w-[120px] h-[190px] rounded-2xl bg-neutral-900 border border-white/10 p-2 flex flex-col justify-between relative">
            <div className="self-center w-10 h-2 bg-black rounded-full mb-1" />
            <div className="w-full h-16 rounded-xl bg-neutral-800 p-2 flex flex-col justify-between text-[9px] text-white">
              <div className="flex justify-between items-center">
                <span className="font-medium tracking-wider">VOO Platinum</span>
                <div className="w-3 h-2 rounded-md bg-neutral-700 text-neutral-300" />
              </div>
              <div className="font-mono text-[9px] tracking-widest">8892</div>
              <div className="flex justify-between items-center text-[9px]">
                <span>$28,540.00</span>
                <span>09/28</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center text-[9px] text-neutral-400">
              {["Transfer", "Pay", "Invest", "Bill"].map((act, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <div className="w-5 h-5 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center text-white text-[9px]">
                    +
                  </div>
                  <span>{act}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-neutral-800 border border-white/10 p-1 flex items-center justify-between text-[9px]">
              <div className="flex items-center gap-1">
                <div className="w-3.5 h-3.5 rounded-md bg-neutral-700 text-neutral-400 flex items-center justify-center">O</div>
                <span className="text-neutral-200">Apple Store</span>
              </div>
              <span className="text-neutral-400 font-mono">-$199</span>
            </div>
          </div>
        </div>
      );

    case "ai-bento-landing":
      return (
        <div className="w-full h-full bg-neutral-950 p-3 flex flex-col justify-between select-none pointer-events-none text-[9px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="font-medium text-white text-[10px]">
              Hyperion
            </span>
            <div className="flex gap-2 text-neutral-400 text-[9px]">
              <span>Features</span>
              <span>Models</span>
              <span className="text-white font-medium">Get Started</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 flex-1 pt-2">
            <div className="col-span-2 rounded-lg bg-neutral-900 border border-white/10 p-2 flex flex-col justify-between">
              <span className="text-[9px] text-neutral-300 font-medium">Workspace</span>
              <div className="text-[11px] font-medium text-white leading-tight">A place for your work.</div>
              <div className="flex gap-1 mt-1">
                <div className="h-4 px-2 rounded-lg bg-white/10 text-white text-[9px] flex items-center font-medium">
                  Start Free
                </div>
              </div>
            </div>
            <div className="col-span-1 rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex flex-col justify-between">
              <span className="text-[9px] text-neutral-400">Latency</span>
              <span className="text-[12px] font-mono font-medium text-white">12ms</span>
              <span className="text-[9px] text-neutral-400">Realtime sync</span>
            </div>
            <div className="col-span-1 rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex flex-col justify-between">
              <span className="text-[9px] text-neutral-400">Auto Layout</span>
              <div className="w-full h-1 bg-neutral-700 rounded-full" />
            </div>
            <div className="col-span-2 rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex items-center justify-between">
              <span className="text-[9px] text-neutral-300">Built for your team</span>
              <span className="text-[9px] text-white font-medium">Explore</span>
            </div>
          </div>
        </div>
      );

    case "universal-design-system":
      return (
        <div className="w-full h-full bg-neutral-950 p-3 flex flex-col justify-between select-none pointer-events-none text-[9px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="font-medium text-white text-[10px]">Universal Tokens & UI Kit</span>
            <span className="text-[9px] text-neutral-400 font-mono">v3.2.0</span>
          </div>
          <div className="space-y-1 pt-1">
            <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">Color Semantics</span>
            <div className="flex gap-1.5">
              {[
                { label: "Accent", color: "bg-white" },
                { label: "Emerald", color: "bg-neutral-600" },
                { label: "Amber", color: "bg-neutral-500" },
                { label: "Rose", color: "bg-neutral-400" },
                { label: "Light", color: "bg-neutral-200" },
                { label: "Dark", color: "bg-neutral-800" },
              ].map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className={`w-full h-4 rounded-md ${c.color}`} />
                  <span className="text-[9px] text-neutral-400">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-medium">Button Variants</span>
            <div className="flex gap-1.5">
              <div className="h-4 px-2 rounded-lg bg-white/10 text-white text-[9px] font-medium flex items-center justify-center">
                Primary
              </div>
              <div className="h-4 px-2 rounded-lg border border-white/10 bg-neutral-800 text-neutral-200 text-[9px] flex items-center justify-center">
                Outline
              </div>
              <div className="h-4 px-2 rounded-lg bg-neutral-800 text-neutral-400 text-[9px] flex items-center justify-center">
                Ghost
              </div>
            </div>
          </div>
        </div>
      );

    case "tech-pitch-deck":
      return (
        <div className="w-full h-full bg-neutral-950 p-3 flex flex-col justify-between select-none pointer-events-none text-[9px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="font-medium text-neutral-200 text-[10px] tracking-wider uppercase">Series A Pitch Deck</span>
            <span className="text-[9px] text-neutral-400 font-mono">16:9 Slide 04/18</span>
          </div>
          <div className="flex-1 flex items-center justify-between py-2 gap-3">
            <div className="space-y-1">
              <span className="text-[9px] px-1 py-0.5 rounded-md bg-neutral-700 text-neutral-300 font-medium">
                Market Traction
              </span>
              <div className="text-[12px] font-medium text-white leading-tight">
                10x ARR Growth <br />
                <span className="text-neutral-300">in 12 Months.</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 w-24">
              <div className="rounded-lg bg-neutral-900 border border-white/10 p-1 flex justify-between items-center">
                <span className="text-[9px] text-neutral-400">Net Retention</span>
                <span className="text-[9px] font-medium text-white font-mono">148%</span>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-white/10 p-1 flex justify-between items-center">
                <span className="text-[9px] text-neutral-400">Gross Margin</span>
                <span className="text-[9px] font-medium text-neutral-300 font-mono">82%</span>
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center text-[9px] text-neutral-400 border-t border-white/10 pt-1">
            <span>Confidential & Proprietary</span>
            <span>VOO Presentation Suite</span>
          </div>
        </div>
      );

    case "minimal-ecommerce-lookbook":
      return (
        <div className="w-full h-full bg-neutral-950 p-3 flex flex-col justify-between select-none pointer-events-none text-[9px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="font-serif tracking-widest text-white text-[10px] uppercase font-medium">Atelier Nord</span>
            <div className="flex gap-2 text-[9px] text-neutral-400">
              <span>Collection</span>
              <span>Lookbook</span>
              <span className="text-white">Bag (0)</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 flex-1 pt-1.5">
            <div className="rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex flex-col justify-between">
              <div className="w-full h-12 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 text-[10px]">
                Item 01
              </div>
              <div className="flex justify-between items-center pt-1 text-[9px]">
                <span className="text-neutral-200">Wool Overcoat</span>
                <span className="font-mono text-neutral-400">$480</span>
              </div>
            </div>
            <div className="rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex flex-col justify-between">
              <div className="w-full h-12 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 text-[10px]">
                Item 02
              </div>
              <div className="flex justify-between items-center pt-1 text-[9px]">
                <span className="text-neutral-200">Ceramic Vessel</span>
                <span className="font-mono text-neutral-400">$165</span>
              </div>
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div className="w-full h-full flex items-center justify-center">
          <Layers size={24} className="text-neutral-500" />
        </div>
      );
  }
}

// Native dialog supplies focus containment, Escape dismissal, and focus restoration.
function TemplateDialog({ template, title, t, onClose, onUse }) {
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
      <div aria-hidden="true" className="mx-5 aspect-[16/10] overflow-hidden rounded-lg border border-white/10">
        <TemplateMiniPreview templateId={template.id} />
      </div>
      <div className="flex items-center justify-between p-5">
        <span className="text-xs tabular-nums text-neutral-400">{template.width} × {template.height} px</span>
        <button type="button" data-testid="use-template" onClick={() => onUse(template)}
          className="rounded-lg bg-white px-4 py-2 text-xs font-medium text-black hover:bg-neutral-200">{t("welcome.community.useTemplate")}</button>
      </div>
    </dialog>
  );
}

export default function CommunityTemplatesView({ onUseTemplate }) {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModalTemplate, setActiveModalTemplate] = useState(null);
  const title = (template) => t(`welcome.community.template.${template.id}`);
  const filteredTemplates = (() => {
    const query = searchQuery.trim().toLowerCase();
    return COMMUNITY_TEMPLATES.filter((template) =>
      (selectedCategory === "all" || template.category === selectedCategory) &&
      (!query || [title(template), template.title, t(COMMUNITY_CATEGORIES.find((category) => category.id === template.category).label)].some((value) => value.toLowerCase().includes(query)))
    );
  })();
  const handleUse = (template) => {
    setActiveModalTemplate(null);
    onUseTemplate?.(template);
  };
  return (
    <section data-testid="community-templates" className="w-full space-y-5" aria-labelledby="templates-title">
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
        {COMMUNITY_CATEGORIES.map((category) => (
          <button key={category.id} type="button" aria-pressed={selectedCategory === category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${selectedCategory === category.id ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}>
            {t(category.label)}
          </button>
        ))}
      </div>
      {filteredTemplates.length ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <article key={template.id} data-testid="template-card" className="min-w-0">
              <button type="button" onClick={() => setActiveModalTemplate(template)}
                aria-label={`${t("welcome.community.preview")}: ${title(template)}`}
                className="block aspect-[16/10] w-full overflow-hidden rounded-lg border border-white/10 bg-neutral-900 transition-colors hover:border-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50">
                <div aria-hidden="true" className="h-full w-full"><TemplateMiniPreview templateId={template.id} /></div>
              </button>
              <div className="flex items-center justify-between gap-3 pt-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xs font-medium text-white">{title(template)}</h2>
                  <p className="mt-1 text-[11px] tabular-nums text-neutral-500">{template.width} × {template.height} px</p>
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
      {activeModalTemplate && <TemplateDialog template={activeModalTemplate} title={title(activeModalTemplate)} t={t}
        onClose={() => setActiveModalTemplate(null)} onUse={handleUse} />}
    </section>
  );
}
