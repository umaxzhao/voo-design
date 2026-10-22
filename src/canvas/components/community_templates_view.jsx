import React, { useState, useMemo } from "react";
import {
  Search,
  Heart,
  Download,
  Eye,
  Sparkles,
  CheckCircle2,
  Layers,
  X,
  ArrowRight,
} from "lucide-react";
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
              <div className="w-2.5 h-2.5 rounded-md bg-[#a7ffd4]" />
              <span className="font-medium text-white">VOO Cloud</span>
            </div>
            <div className="flex gap-1.5">
              <div className="h-4 px-2 rounded-lg bg-neutral-800 text-neutral-400 flex items-center">30 Days</div>
              <div className="h-4 px-2 rounded-lg bg-white/10 text-white flex items-center font-medium">+ Report</div>
            </div>
          </div>
          <div className="flex-1 flex gap-2 pt-2">
            <div className="w-12 border-r border-white/10 flex flex-col gap-1 pr-1">
              <div className="h-2.5 rounded-lg bg-white/10 text-[#a7ffd4] px-1 flex items-center">Overview</div>
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
                  <div className="text-[10px] font-medium text-emerald-400 mt-0.5">99.98%</div>
                </div>
              </div>
              <div className="flex-1 bg-neutral-900 border border-white/10 rounded-lg p-2 flex items-end justify-between gap-1">
                {[40, 65, 30, 85, 55, 95, 75].map((h, i) => (
                  <div key={i} className="flex-1 bg-neutral-800 rounded-lg flex flex-col justify-end overflow-hidden h-full">
                    <div
                      style={{ height: `${h}%` }}
                      className={`w-full rounded-lg ${i === 5 ? "bg-[#a7ffd4]" : "bg-neutral-700"}`}
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
                <div className="w-3 h-2 rounded-md bg-amber-500/20 text-amber-300" />
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
                <div className="w-3.5 h-3.5 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center">O</div>
                <span className="text-neutral-200">Apple Store</span>
              </div>
              <span className="text-rose-400 font-mono">-$199</span>
            </div>
          </div>
        </div>
      );

    case "ai-bento-landing":
      return (
        <div className="w-full h-full bg-neutral-950 p-3 flex flex-col justify-between select-none pointer-events-none text-[9px]">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="font-medium text-white text-[10px]">
              Hyperion AI
            </span>
            <div className="flex gap-2 text-neutral-400 text-[9px]">
              <span>Features</span>
              <span>Models</span>
              <span className="text-[#a7ffd4] font-medium">Get Started</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 flex-1 pt-2">
            <div className="col-span-2 rounded-lg bg-neutral-900 border border-white/10 p-2 flex flex-col justify-between">
              <span className="text-[9px] text-neutral-300 font-medium">Next-Gen Neural Canvas</span>
              <div className="text-[11px] font-medium text-white leading-tight">Design at the Speed of Thought.</div>
              <div className="flex gap-1 mt-1">
                <div className="h-4 px-2 rounded-lg bg-white/10 text-white text-[9px] flex items-center font-medium">
                  Start Free
                </div>
              </div>
            </div>
            <div className="col-span-1 rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex flex-col justify-between">
              <span className="text-[9px] text-neutral-400">Latency</span>
              <span className="text-[12px] font-mono font-medium text-emerald-400">12ms</span>
              <span className="text-[9px] text-neutral-400">Realtime sync</span>
            </div>
            <div className="col-span-1 rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex flex-col justify-between">
              <span className="text-[9px] text-neutral-400">Auto Layout</span>
              <div className="w-full h-1 bg-neutral-700 rounded-full" />
            </div>
            <div className="col-span-2 rounded-lg bg-neutral-900 border border-white/10 p-1.5 flex items-center justify-between">
              <span className="text-[9px] text-neutral-300">Over 10,000+ teams designing daily</span>
              <span className="text-[9px] text-[#a7ffd4] font-medium">Join Community</span>
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
                { label: "Accent", color: "bg-[#a7ffd4]" },
                { label: "Emerald", color: "bg-emerald-500" },
                { label: "Amber", color: "bg-amber-500" },
                { label: "Rose", color: "bg-rose-500" },
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
            <span className="font-medium text-amber-200 text-[10px] tracking-wider uppercase">Series A Pitch Deck</span>
            <span className="text-[9px] text-neutral-400 font-mono">16:9 Slide 04/18</span>
          </div>
          <div className="flex-1 flex items-center justify-between py-2 gap-3">
            <div className="space-y-1">
              <span className="text-[9px] px-1 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-medium">
                Market Traction
              </span>
              <div className="text-[12px] font-medium text-white leading-tight">
                10x ARR Growth <br />
                <span className="text-amber-400">in 12 Months.</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 w-24">
              <div className="rounded-lg bg-neutral-900 border border-white/10 p-1 flex justify-between items-center">
                <span className="text-[9px] text-neutral-400">Net Retention</span>
                <span className="text-[9px] font-medium text-emerald-400 font-mono">148%</span>
              </div>
              <div className="rounded-lg bg-neutral-900 border border-white/10 p-1 flex justify-between items-center">
                <span className="text-[9px] text-neutral-400">Gross Margin</span>
                <span className="text-[9px] font-medium text-amber-400 font-mono">82%</span>
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

export default function CommunityTemplatesView({ onUseTemplate }) {
  const { t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("popular");
  const [activeModalTemplate, setActiveModalTemplate] = useState(null);

  const filteredTemplates = useMemo(() => {
    let list = [...COMMUNITY_TEMPLATES];

    if (selectedCategory !== "all") {
      list = list.filter((item) => item.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((item) => {
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchAuthor = item.author?.name?.toLowerCase().includes(q);
        const matchTags = item.tags?.some((tag) => tag.toLowerCase().includes(q));
        return matchTitle || matchDesc || matchAuthor || matchTags;
      });
    }

    if (sortBy === "popular") {
      list.sort((a, b) => parseFloat(b.stats?.likes) - parseFloat(a.stats?.likes));
    } else if (sortBy === "newest") {
      list.reverse();
    }

    return list;
  }, [selectedCategory, searchQuery, sortBy]);

  const handleUse = (template, e) => {
    e?.stopPropagation?.();
    onUseTemplate?.(template);
  };

  return (
    <div className="w-full flex flex-col space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900 border border-white/10 p-6 md:p-8">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[#a7ffd4] text-xs font-medium">
            <Sparkles size={13} />
            <span>{t("welcome.community.title")}</span>
          </div>

          <h2 className="text-[15px] font-bold text-white tracking-tight">
            {t("welcome.community.title")}
          </h2>

          <p className="text-xs text-neutral-400 leading-relaxed max-w-2xl">
            {t("welcome.community.subtitle")}
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("welcome.community.searchPlaceholder")}
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-xs text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-xs text-neutral-300 focus:outline-none cursor-pointer"
              >
                <option value="popular">{t("welcome.community.sortPopular")}</option>
                <option value="newest">{t("welcome.community.sortNewest")}</option>
                <option value="curated">{t("welcome.community.sortCurated")}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {COMMUNITY_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? "bg-white text-black"
                  : "bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-white/10"
              }`}
            >
              <span>{t(cat.label)}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                  isActive ? "bg-black/10 text-black font-medium" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-white/10 p-12 text-center space-y-3">
          <Search size={24} className="mx-auto text-neutral-500" />
          <p className="text-xs text-neutral-400">未找到匹配的社区模板</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
            }}
            className="text-xs text-[#a7ffd4] hover:underline"
          >
            重置筛选条件
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => setActiveModalTemplate(template)}
              className="group relative flex flex-col rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 overflow-hidden cursor-pointer transition-all duration-200"
            >
              <div className="relative aspect-[16/10] w-full bg-neutral-950 overflow-hidden border-b border-white/10">
                <TemplateMiniPreview templateId={template.id} />

                <div className="absolute top-2.5 left-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border border-white/10 bg-neutral-900/80 text-white">
                    {template.badge}
                  </span>
                </div>

                <div className="absolute top-2.5 right-2.5">
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-mono text-neutral-400 bg-neutral-950 border border-white/10">
                    {template.width} × {template.height}
                  </span>
                </div>

                <div className="absolute inset-0 bg-neutral-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModalTemplate(template);
                    }}
                    className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>{t("welcome.community.preview") || "预览详情"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleUse(template, e)}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download size={13} />
                    <span>{t("welcome.community.useTemplate") || "使用模板"}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <h3 className="text-xs font-medium text-white group-hover:text-[#a7ffd4] transition-colors line-clamp-1">
                    {template.title}
                  </h3>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                    {template.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {template.tags?.slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded-md bg-neutral-800 text-[10px] text-neutral-400 font-mono"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-neutral-400">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{template.author?.avatar}</span>
                    <span className="text-xs font-medium text-neutral-300 truncate max-w-[100px]">
                      {template.author?.name}
                    </span>
                    {template.author?.verified && (
                      <CheckCircle2 size={12} className="text-[#a7ffd4] shrink-0" />
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 text-[11px] font-mono text-neutral-400">
                    <span className="flex items-center gap-1 hover:text-rose-400 transition-colors">
                      <Heart size={11} className="text-neutral-400" />
                      {template.stats?.likes}
                    </span>
                    <span className="flex items-center gap-1 hover:text-[#a7ffd4] transition-colors">
                      <Download size={11} className="text-neutral-400" />
                      {template.stats?.clones}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Detail Modal */}
      {activeModalTemplate && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 md:p-6"
          onClick={() => setActiveModalTemplate(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-neutral-900 border border-white/10 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border border-white/10 bg-neutral-800 text-white">
                  {activeModalTemplate.badge}
                </span>
                <span className="text-xs font-medium text-white truncate">
                  {activeModalTemplate.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalTemplate(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="w-full aspect-[16/9] rounded-xl bg-neutral-950 border border-white/10 overflow-hidden relative">
                <TemplateMiniPreview templateId={activeModalTemplate.id} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-neutral-950 border border-white/10 p-3 space-y-0.5">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    {t("welcome.community.artboardSize")}
                  </span>
                  <div className="text-xs font-mono font-medium text-white">
                    {activeModalTemplate.width} × {activeModalTemplate.height} px
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-950 border border-white/10 p-3 space-y-0.5">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    {t("welcome.community.popularity")}
                  </span>
                  <div className="text-xs font-mono font-medium text-emerald-400">
                    {activeModalTemplate.stats?.likes} Likes
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-950 border border-white/10 p-3 space-y-0.5">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    {t("welcome.community.author")}
                  </span>
                  <div className="text-xs font-medium text-white truncate">
                    {activeModalTemplate.author?.name}
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-950 border border-white/10 p-3 space-y-0.5">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
                    {t("welcome.community.layers")}
                  </span>
                  <div className="text-xs font-mono font-medium text-[#a7ffd4]">
                    Editable Vector Nodes
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-medium text-neutral-300 uppercase tracking-wider">
                  模板概述与特性
                </h4>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  {activeModalTemplate.description}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {activeModalTemplate.tags?.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-lg bg-neutral-800 text-xs text-neutral-300 font-mono"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 bg-neutral-950 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setActiveModalTemplate(null)}
                className="px-4 py-2 rounded-xl text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                取消
              </button>

              <button
                type="button"
                onClick={() => {
                  const tmpl = activeModalTemplate;
                  setActiveModalTemplate(null);
                  handleUse(tmpl);
                }}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-medium flex items-center gap-2 transition-all cursor-pointer"
              >
                <Download size={14} />
                <span>{t("welcome.community.duplicate")}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
