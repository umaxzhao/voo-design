import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocale,
  loadLocale,
  resolveInitialLocale,
  setLocale,
  t,
  toggleLocale,
} from "../../src/shared/i18n.js";
import extendedEn from "../../src/shared/i18n/extended-en.js";
import extendedZh from "../../src/shared/i18n/extended-zh.js";
import fullEn from "../../src/shared/i18n/en.js";
import fullZh from "../../src/shared/i18n/zh.js";

/** Helper: Convert 8-bit sRGB channel to linear light value. */
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Helper: Calculate relative luminance according to WCAG 2.1 specs. */
function relativeLuminance(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Helper: Calculate contrast ratio between two hex colors. */
function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("QA issue 1: locale persistence in localStorage", () => {
  let store;
  let storageMock;

  beforeEach(() => {
    store = new Map();
    storageMock = {
      getItem: vi.fn((key) => store.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        store.set(key, String(value));
      }),
      removeItem: vi.fn((key) => {
        store.delete(key);
      }),
      clear: vi.fn(() => {
        store.clear();
      }),
    };
    vi.stubGlobal("localStorage", storageMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await setLocale("en");
  });

  it("persists chosen locale to localStorage under ciw.locale key", async () => {
    await setLocale("zh");
    expect(storageMock.setItem).toHaveBeenCalledWith("ciw.locale", "zh");
    expect(storageMock.getItem("ciw.locale")).toBe("zh");
    expect(getLocale()).toBe("zh");

    await setLocale("en");
    expect(storageMock.setItem).toHaveBeenCalledWith("ciw.locale", "en");
    expect(storageMock.getItem("ciw.locale")).toBe("en");
    expect(getLocale()).toBe("en");
  });

  it("persists toggled locale through toggleLocale()", async () => {
    await setLocale("en");
    storageMock.setItem.mockClear();

    await toggleLocale();
    expect(storageMock.setItem).toHaveBeenCalledWith("ciw.locale", "zh");
    expect(getLocale()).toBe("zh");

    await toggleLocale();
    expect(storageMock.setItem).toHaveBeenCalledWith("ciw.locale", "en");
    expect(getLocale()).toBe("en");
  });

  it("does not persist unsupported locales to localStorage", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await setLocale("es-ES");

    expect(storageMock.setItem).not.toHaveBeenCalledWith("ciw.locale", "es-ES");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("allows bootstrap resolveInitialLocale to reload stored locale on restart", async () => {
    await setLocale("zh");
    const stored = storageMock.getItem("ciw.locale");
    expect(stored).toBe("zh");

    const reloaded = resolveInitialLocale({
      stored,
      languages: ["en-US"],
      automated: false,
    });
    expect(reloaded).toBe("zh");
  });

  it("handles storage exceptions gracefully without crashing setLocale", async () => {
    storageMock.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await expect(setLocale("zh")).resolves.toBeDefined();
    expect(getLocale()).toBe("zh");
  });
});

describe("QA issue 2: editor.openFailed translation", () => {
  const expectedEn =
    "Could not open document. Only .voo, .zip, .svg, .psd, .fig, and .pen files are supported.";
  const expectedZh =
    "无法打开文档。仅支持 .voo、.zip、.svg、.psd、.fig 和 .pen 文件。";

  it("provides exact editor.openFailed string in extended-en.js and extended-zh.js", () => {
    expect(extendedEn["editor.openFailed"]).toBe(expectedEn);
    expect(extendedZh["editor.openFailed"]).toBe(expectedZh);
  });

  it("includes editor.openFailed in aggregated full en and zh dictionaries", () => {
    expect(fullEn["editor.openFailed"]).toBe(expectedEn);
    expect(fullZh["editor.openFailed"]).toBe(expectedZh);
  });

  it("translates editor.openFailed via t() according to active locale", async () => {
    await loadLocale("en");
    expect(t("editor.openFailed")).toBe(expectedEn);

    await loadLocale("zh");
    expect(t("editor.openFailed")).toBe(expectedZh);

    await loadLocale("en");
  });
});

describe("QA issue 3: light theme contrast rules", () => {
  const cssPath = resolve(__dirname, "../../src/theme-light.css");
  const cssContent = readFileSync(cssPath, "utf8");

  it("replaces text-[#a7ffd4] and text-[#b2ffd6] color with #0d7647", () => {
    expect(cssContent).toMatch(/\[class\*="text-\[#a7ffd4\]"\][\s\S]*?color:\s*#0d7647\s*!important/);
    expect(cssContent).toMatch(/\[class\*="text-\[#b2ffd6\]"\][\s\S]*?color:\s*#0d7647\s*!important/);
    expect(cssContent).not.toMatch(/\[class\*="text-\[#a7ffd4\]"\][\s\S]*?color:\s*#a7ffd4/);
  });

  it("ensures #0d7647 provides >= 4.5:1 contrast ratio against pure white", () => {
    const contrast = contrastRatio("#0d7647", "#ffffff");
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  it("ensures translucent white text rules map to dark neutrals", () => {
    expect(cssContent).toContain('[class*="text-white/"]');
    expect(cssContent).toMatch(/\[class\*="text-white\/70"\]/);
    expect(cssContent).toMatch(/\[class\*="text-white\/60"\]/);

    const darkNeutrals = ["#171717", "#262626", "#525252", "#737373"];
    for (const neutral of darkNeutrals) {
      const contrast = contrastRatio(neutral, "#ffffff");
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("verifies contrast against light theme background surfaces", () => {
    const lightSurfaces = ["#ffffff", "#fafafa", "#f5f5f5"];
    for (const surface of lightSurfaces) {
      const greenContrast = contrastRatio("#0d7647", surface);
      expect(greenContrast).toBeGreaterThanOrEqual(4.5);

      const textContrast = contrastRatio("#262626", surface);
      expect(textContrast).toBeGreaterThanOrEqual(4.5);
    }
  });
});
