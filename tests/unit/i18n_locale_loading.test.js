import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getLocale,
  loadCriticalLocale,
  loadLocale,
  setLocale,
  t,
} from "../../src/shared/i18n.js";

afterEach(() => vi.restoreAllMocks());

describe("locale loading safety", () => {
  it("keeps essential properties labels translated before the full dictionary loads", async () => {
    await loadCriticalLocale("zh");

    expect(t("editor.props.transform")).toBe("变换");
    expect(t("editor.props.layout")).toBe("布局");
    expect(t("editor.props.appearance")).toBe("外观");
  });

  it("rejects unsupported locales without changing the active locale", async () => {
    await loadLocale("zh");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(loadLocale("zh-CN")).rejects.toThrow("Unsupported locale: zh-CN");
    await setLocale("zh-CN");

    expect(getLocale()).toBe("zh");
    expect(t("editor.props.transform")).toBe("变换");
    expect(warning).toHaveBeenCalledOnce();
  });
});
