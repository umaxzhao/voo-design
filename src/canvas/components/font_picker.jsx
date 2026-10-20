import PropTypes from "prop-types";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "../icons.jsx";
import { ensureFontLoaded } from "../editor/font_loader.js";
import { useI18n } from "../use_i18n.js";

/**
 * The sample string every font row renders in its own face.
 *
 * Data, not copy: it stays identical in every locale because its job is to
 * show whether the face carries Latin, numerals and CJK glyphs at all. Held
 * as a constant so the CJK never sits in JSX, where the i18n lint rule reads
 * it — correctly, for anything that really is copy — as a translation leak.
 */
const SPECIMEN = "System \u00b7 Aa Bb Gg 123 \u4e2d\u6587";

export const GOOGLE_FONTS_CATALOG = [
  // Popular Sans Serif
  {
    family: "Inter",
    category: "Sans Serif",
    stack: "'Inter', system-ui, sans-serif",
  },
  { family: "Roboto", category: "Sans Serif", stack: "'Roboto', sans-serif" },
  {
    family: "Montserrat",
    category: "Sans Serif",
    stack: "'Montserrat', sans-serif",
  },
  { family: "Poppins", category: "Sans Serif", stack: "'Poppins', sans-serif" },
  {
    family: "Open Sans",
    category: "Sans Serif",
    stack: "'Open Sans', sans-serif",
  },
  { family: "Lato", category: "Sans Serif", stack: "'Lato', sans-serif" },
  { family: "Oswald", category: "Sans Serif", stack: "'Oswald', sans-serif" },
  { family: "Raleway", category: "Sans Serif", stack: "'Raleway', sans-serif" },
  {
    family: "Plus Jakarta Sans",
    category: "Sans Serif",
    stack: "'Plus Jakarta Sans', sans-serif",
  },
  { family: "DM Sans", category: "Sans Serif", stack: "'DM Sans', sans-serif" },
  {
    family: "Space Grotesk",
    category: "Sans Serif",
    stack: "'Space Grotesk', sans-serif",
  },
  {
    family: "Work Sans",
    category: "Sans Serif",
    stack: "'Work Sans', sans-serif",
  },
  { family: "Nunito", category: "Sans Serif", stack: "'Nunito', sans-serif" },
  { family: "Rubik", category: "Sans Serif", stack: "'Rubik', sans-serif" },
  { family: "Outfit", category: "Sans Serif", stack: "'Outfit', sans-serif" },
  { family: "Syne", category: "Sans Serif", stack: "'Syne', sans-serif" },
  { family: "Manrope", category: "Sans Serif", stack: "'Manrope', sans-serif" },
  {
    family: "Urbanist",
    category: "Sans Serif",
    stack: "'Urbanist', sans-serif",
  },
  { family: "Geist", category: "Sans Serif", stack: "'Geist', sans-serif" },
  {
    family: "Cabinet Grotesk",
    category: "Sans Serif",
    stack: "'Cabinet Grotesk', sans-serif",
  },
  {
    family: "Clash Display",
    category: "Sans Serif",
    stack: "'Clash Display', sans-serif",
  },
  { family: "Satoshi", category: "Sans Serif", stack: "'Satoshi', sans-serif" },
  {
    family: "General Sans",
    category: "Sans Serif",
    stack: "'General Sans', sans-serif",
  },
  {
    family: "Epilogue",
    category: "Sans Serif",
    stack: "'Epilogue', sans-serif",
  },
  {
    family: "Bricolage Grotesque",
    category: "Sans Serif",
    stack: "'Bricolage Grotesque', sans-serif",
  },
  { family: "Lexend", category: "Sans Serif", stack: "'Lexend', sans-serif" },
  { family: "Barlow", category: "Sans Serif", stack: "'Barlow', sans-serif" },
  { family: "Kanit", category: "Sans Serif", stack: "'Kanit', sans-serif" },
  { family: "Teko", category: "Sans Serif", stack: "'Teko', sans-serif" },
  {
    family: "Bebas Neue",
    category: "Sans Serif",
    stack: "'Bebas Neue', sans-serif",
  },
  { family: "Anton", category: "Sans Serif", stack: "'Anton', sans-serif" },

  // Popular Serif
  {
    family: "Playfair Display",
    category: "Serif",
    stack: "'Playfair Display', Georgia, serif",
  },
  { family: "Merriweather", category: "Serif", stack: "'Merriweather', serif" },
  { family: "Lora", category: "Serif", stack: "'Lora', serif" },
  { family: "Bitter", category: "Serif", stack: "'Bitter', 'Rockwell', serif" },
  { family: "Cinzel", category: "Serif", stack: "'Cinzel', serif" },
  { family: "Bodoni Moda", category: "Serif", stack: "'Bodoni Moda', serif" },
  {
    family: "Cormorant Garamond",
    category: "Serif",
    stack: "'Cormorant Garamond', serif",
  },
  { family: "PT Serif", category: "Serif", stack: "'PT Serif', serif" },
  { family: "Fraunces", category: "Serif", stack: "'Fraunces', serif" },
  {
    family: "DM Serif Display",
    category: "Serif",
    stack: "'DM Serif Display', serif",
  },
  { family: "Prata", category: "Serif", stack: "'Prata', serif" },
  { family: "Italiana", category: "Serif", stack: "'Italiana', serif" },
  {
    family: "Cinzel Decorative",
    category: "Serif",
    stack: "'Cinzel Decorative', serif",
  },
  { family: "Marcellus", category: "Serif", stack: "'Marcellus', serif" },
  { family: "Castoro", category: "Serif", stack: "'Castoro', serif" },
  { family: "Newsreader", category: "Serif", stack: "'Newsreader', serif" },
  {
    family: "Instrument Serif",
    category: "Serif",
    stack: "'Instrument Serif', serif",
  },
  { family: "EB Garamond", category: "Serif", stack: "'EB Garamond', serif" },
  { family: "Spectral", category: "Serif", stack: "'Spectral', serif" },
  { family: "Vollkorn", category: "Serif", stack: "'Vollkorn', serif" },

  // Display & Bold Headlines
  {
    family: "Archivo Black",
    category: "Display",
    stack: "'Archivo Black', 'Arial Black', sans-serif",
  },
  { family: "Righteous", category: "Display", stack: "'Righteous', cursive" },
  {
    family: "Abril Fatface",
    category: "Display",
    stack: "'Abril Fatface', serif",
  },
  { family: "Lobster", category: "Display", stack: "'Lobster', cursive" },
  {
    family: "Press Start 2P",
    category: "Display",
    stack: "'Press Start 2P', monospace",
  },
  {
    family: "Unbounded",
    category: "Display",
    stack: "'Unbounded', sans-serif",
  },
  {
    family: "Dela Gothic One",
    category: "Display",
    stack: "'Dela Gothic One', cursive",
  },
  { family: "Shrikhand", category: "Display", stack: "'Shrikhand', cursive" },
  { family: "Chonburi", category: "Display", stack: "'Chonburi', cursive" },
  { family: "Bungee", category: "Display", stack: "'Bungee', cursive" },
  { family: "Faster One", category: "Display", stack: "'Faster One', cursive" },
  { family: "Monoton", category: "Display", stack: "'Monoton', cursive" },
  {
    family: "Permanent Marker",
    category: "Display",
    stack: "'Permanent Marker', cursive",
  },
  { family: "Creepster", category: "Display", stack: "'Creepster', cursive" },
  {
    family: "Silkscreen",
    category: "Display",
    stack: "'Silkscreen', monospace",
  },

  // Handwriting & Calligraphy
  { family: "Caveat", category: "Handwriting", stack: "'Caveat', cursive" },
  { family: "Pacifico", category: "Handwriting", stack: "'Pacifico', cursive" },
  {
    family: "Dancing Script",
    category: "Handwriting",
    stack: "'Dancing Script', cursive",
  },
  {
    family: "Great Vibes",
    category: "Handwriting",
    stack: "'Great Vibes', cursive",
  },
  {
    family: "Sacramento",
    category: "Handwriting",
    stack: "'Sacramento', cursive",
  },
  { family: "Satisfy", category: "Handwriting", stack: "'Satisfy', cursive" },
  {
    family: "Kaushan Script",
    category: "Handwriting",
    stack: "'Kaushan Script', cursive",
  },
  {
    family: "Alex Brush",
    category: "Handwriting",
    stack: "'Alex Brush', cursive",
  },
  { family: "Allura", category: "Handwriting", stack: "'Allura', cursive" },
  {
    family: "Marck Script",
    category: "Handwriting",
    stack: "'Marck Script', cursive",
  },
  {
    family: "Nothing You Could Do",
    category: "Handwriting",
    stack: "'Nothing You Could Do', cursive",
  },
  {
    family: "Covered By Your Grace",
    category: "Handwriting",
    stack: "'Covered By Your Grace', cursive",
  },
  {
    family: "Shadows Into Light",
    category: "Handwriting",
    stack: "'Shadows Into Light', cursive",
  },
  {
    family: "Architects Daughter",
    category: "Handwriting",
    stack: "'Architects Daughter', cursive",
  },
  {
    family: "Indie Flower",
    category: "Handwriting",
    stack: "'Indie Flower', cursive",
  },

  // Code & Monospace
  {
    family: "Fira Code",
    category: "Monospace",
    stack: "'Fira Code', monospace",
  },
  {
    family: "JetBrains Mono",
    category: "Monospace",
    stack: "'JetBrains Mono', monospace",
  },
  {
    family: "Space Mono",
    category: "Monospace",
    stack: "'Space Mono', monospace",
  },
  {
    family: "Intel One Mono",
    category: "Monospace",
    stack: "'Intel One Mono', monospace",
  },
  {
    family: "Source Code Pro",
    category: "Monospace",
    stack: "'Source Code Pro', monospace",
  },
  {
    family: "IBM Plex Mono",
    category: "Monospace",
    stack: "'IBM Plex Mono', monospace",
  },
  {
    family: "Roboto Mono",
    category: "Monospace",
    stack: "'Roboto Mono', monospace",
  },
  {
    family: "Courier Prime",
    category: "Monospace",
    stack: "'Courier Prime', monospace",
  },
  { family: "VT323", category: "Monospace", stack: "'VT323', monospace" },
  {
    family: "Share Tech Mono",
    category: "Monospace",
    stack: "'Share Tech Mono', monospace",
  },

  // Chinese & CJK Fonts (中文字体)
  {
    family: "Noto Sans SC",
    category: "Chinese",
    stack: "'Noto Sans SC', sans-serif",
  },
  {
    family: "Noto Serif SC",
    category: "Chinese",
    stack: "'Noto Serif SC', serif",
  },
  {
    family: "ZCOOL KuaiLe",
    category: "Chinese",
    stack: "'ZCOOL KuaiLe', sans-serif",
  },
  {
    family: "ZCOOL XiaoWei",
    category: "Chinese",
    stack: "'ZCOOL XiaoWei', serif",
  },
  {
    family: "ZCOOL QingKe HuangYou",
    category: "Chinese",
    stack: "'ZCOOL QingKe HuangYou', sans-serif",
  },
  {
    family: "Ma Shan Zheng",
    category: "Chinese",
    stack: "'Ma Shan Zheng', cursive",
  },
  {
    family: "Zhi Mang Xing",
    category: "Chinese",
    stack: "'Zhi Mang Xing', cursive",
  },
  { family: "Long Cang", category: "Chinese", stack: "'Long Cang', cursive" },
  {
    family: "Liu Jian Mao Cao",
    category: "Chinese",
    stack: "'Liu Jian Mao Cao', cursive",
  },
];

export const SYSTEM_FONTS_CATALOG = [
  {
    name: "System Sans",
    family: "system-ui, -apple-system, sans-serif",
    stack: "system-ui, -apple-system, sans-serif",
  },
  {
    name: "PingFang SC / Helvetica",
    family: "'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
    stack: "'PingFang SC', 'Helvetica Neue', Arial, sans-serif",
  },
  {
    name: "Microsoft YaHei (微软雅黑)",
    family: "'Microsoft YaHei', sans-serif",
    stack: "'Microsoft YaHei', sans-serif",
  },
  {
    name: "Songti SC (宋体)",
    family: "'Songti SC', SimSun, Georgia, serif",
    stack: "'Songti SC', SimSun, Georgia, serif",
  },
  {
    name: "Kaiti SC (楷体)",
    family: "'Kaiti SC', KaiTi, serif",
    stack: "'Kaiti SC', KaiTi, serif",
  },
  {
    name: "Yuanti SC (圆体)",
    family: "'Yuanti SC', 'YouYuan', sans-serif",
    stack: "'Yuanti SC', 'YouYuan', sans-serif",
  },
  {
    name: "Heiti SC (黑体)",
    family: "'Heiti SC', SimHei, sans-serif",
    stack: "'Heiti SC', SimHei, sans-serif",
  },
  {
    name: "SF Pro / Apple System",
    family: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    stack: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
  },
  {
    name: "SF Mono / Menlo",
    family: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    stack: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  {
    name: "Arial / Helvetica",
    family: "Arial, Helvetica, sans-serif",
    stack: "Arial, Helvetica, sans-serif",
  },
  {
    name: "Georgia / Times",
    family: "Georgia, 'Times New Roman', Times, serif",
    stack: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    name: "Impact / Compact",
    family: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
    stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  },
  {
    name: "Trebuchet MS",
    family: "'Trebuchet MS', 'Lucida Sans Unicode', sans-serif",
    stack: "'Trebuchet MS', 'Lucida Sans Unicode', sans-serif",
  },
  {
    name: "Verdana",
    family: "Verdana, Geneva, sans-serif",
    stack: "Verdana, Geneva, sans-serif",
  },
  {
    name: "Comic Sans MS",
    family: "'Comic Sans MS', 'Comic Sans', cursive",
    stack: "'Comic Sans MS', 'Comic Sans', cursive",
  },
];

export function CustomFontPicker({ value, onChange, defaultOpen = false, initialSearch = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState("google"); // 'google' | 'system'
  const [search, setSearch] = useState(initialSearch);
  const [pos, setPos] = useState(null);

  const buttonRef = useRef(null);
  const popRef = useRef(null);

  // Position popover relative to button (Figma style to the left of the properties panel)
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!rect || !pop) return;
      const box = pop.getBoundingClientRect();
      const left =
        rect.left > box.width + 12
          ? rect.left - box.width - 12
          : Math.max(8, rect.left - box.width - 8);
      setPos({
        left: Math.max(8, left),
        top: Math.min(
          Math.max(8, rect.top - 10),
          Math.max(8, window.innerHeight - box.height - 8),
        ),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Outside click to close
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      if (popRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // Find label for current value
  const currentFont =
    GOOGLE_FONTS_CATALOG.find((f) => value?.includes(f.family))?.family ||
    SYSTEM_FONTS_CATALOG.find((f) => f.stack === value)?.name ||
    value?.split(",")[0]?.replace(/['"]/g, "") ||
    "Inter";

  // Memoised so the preview list and the preload effect share one stable
  // reference per search term (a fresh array every render would re-run the
  // preload on each keystroke).
  const filteredGoogleFonts = useMemo(
    () =>
      GOOGLE_FONTS_CATALOG.filter(
        (f) =>
          f.family.toLowerCase().includes(search.toLowerCase()) ||
          f.category.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  );

  const filteredSystemFonts = SYSTEM_FONTS_CATALOG.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Preload fonts for immediate list preview when popover opens
  useEffect(() => {
    if (!open) return;
    // Load first 25 fonts or filtered list for instant preview
    const fontsToLoad = search
      ? filteredGoogleFonts
      : GOOGLE_FONTS_CATALOG.slice(0, 30);
    fontsToLoad.forEach((font) => {
      ensureFontLoaded(font.stack);
    });
  }, [open, search, filteredGoogleFonts]);

  const handleSelect = (stack) => {
    ensureFontLoaded(stack);
    onChange(stack);
    setOpen(false);
  };

  return (
    <div className="relative block w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl bg-[#222222] pl-3 pr-2 py-1.5 text-[11px] font-mono text-neutral-100 outline-none transition-all hover:bg-[#282828] focus:ring-1 focus:ring-white/20"
      >
        <span
          className="truncate pr-2 font-medium"
          style={{ fontFamily: value }}
        >
          {currentFont}
        </span>
        <IconChevronDown size={13} className="shrink-0 text-neutral-400" />
      </button>

      {open && typeof document !== "undefined" && document.body
        ? createPortal(
            <FontPickerPopover
              tab={tab}
              setTab={setTab}
              search={search}
              setSearch={setSearch}
              value={value}
              onSelect={handleSelect}
              popRef={popRef}
              pos={pos}
              filteredGoogleFonts={filteredGoogleFonts}
              filteredSystemFonts={filteredSystemFonts}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

export function FontPickerPopover({
  tab,
  setTab,
  search,
  setSearch,
  value,
  onSelect,
  popRef,
  pos,
  filteredGoogleFonts = [],
  filteredSystemFonts = [],
}) {
  const { t } = useI18n();

  return (
    <div
      ref={popRef}
      className="fixed z-[100] w-72 rounded-2xl bg-[#1a1a1a]/98 p-2.5 shadow-menu backdrop-blur-xl border border-white/10 font-mono text-neutral-200"
      style={pos ?? { left: -9999, top: 0 }}
    >
      {/* Tab Header */}
      <div className="flex rounded-lg bg-[#111111] p-0.5 text-[10px]">
        <button
          type="button"
          onClick={() => setTab?.("google")}
          className={`flex-1 rounded-md py-1 text-center font-medium transition-all ${
            tab === "google"
              ? "bg-[#282828] text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("editor.fontPicker.googleFontsTab", { count: GOOGLE_FONTS_CATALOG.length })}
        </button>
        <button
          type="button"
          onClick={() => setTab?.("system")}
          className={`flex-1 rounded-md py-1 text-center font-medium transition-all ${
            tab === "system"
              ? "bg-[#282828] text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("editor.fontPicker.systemFontsTab", { count: SYSTEM_FONTS_CATALOG.length })}
        </button>
      </div>

      {/* Search Bar */}
      <div className="mt-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch?.(e.target.value)}
          placeholder={t("editor.fontPicker.search")}
          className="w-full rounded-lg bg-[#111111] px-2.5 py-1 text-[11px] text-neutral-200 outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-white/20"
        />
      </div>

      {/* Font List */}
      <div className="ui-scroll mt-2 max-h-64 overflow-y-auto space-y-1 pr-0.5">
        {(tab === "google" ? filteredGoogleFonts : filteredSystemFonts).length === 0 ? (
          <div className="py-8 text-center text-[11px] text-neutral-500">
            {t("editor.fontPicker.noResults")}
          </div>
        ) : tab === "google" ? (
          filteredGoogleFonts.map((font) => (
            <button
              key={font.family}
              type="button"
              onClick={() => onSelect?.(font.stack)}
              onMouseEnter={() => ensureFontLoaded(font.stack)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                value === font.stack
                  ? "bg-white/15 text-white font-medium"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex flex-col min-w-0 pr-2">
                <span
                  style={{
                    fontFamily: `"${font.family}", sans-serif`,
                  }}
                  className="text-[12px] leading-snug truncate"
                >
                  {font.family}
                </span>
                <span className="text-[9px] text-neutral-500 font-sans tracking-wide">
                  {font.category} · Aa Bb Gg 123
                </span>
              </div>
            </button>
          ))
        ) : (
          filteredSystemFonts.map((font) => (
            <button
              key={font.name}
              type="button"
              onClick={() => onSelect?.(font.stack)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                value === font.stack
                  ? "bg-white/15 text-white font-medium"
                  : "text-neutral-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex flex-col min-w-0 pr-2">
                <span
                  style={{ fontFamily: font.stack }}
                  className="text-[12px] leading-snug truncate"
                >
                  {font.name}
                </span>
                <span className="text-[9px] text-neutral-500 font-sans tracking-wide">
                  {SPECIMEN}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

FontPickerPopover.propTypes = {
  tab: PropTypes.oneOf(["google", "system"]).isRequired,
  setTab: PropTypes.func,
  search: PropTypes.string,
  setSearch: PropTypes.func,
  value: PropTypes.string,
  onSelect: PropTypes.func,
  popRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  pos: PropTypes.shape({ left: PropTypes.number, top: PropTypes.number }),
  filteredGoogleFonts: PropTypes.array,
  filteredSystemFonts: PropTypes.array,
};

CustomFontPicker.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  defaultOpen: PropTypes.bool,
  initialSearch: PropTypes.string,
};
