import { afterEach, describe, expect, it, vi } from "vitest";

const paths = ["../../src/shared/i18n/core-zh.js", "../../src/shared/i18n/zh.js"];
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function freshLocale() {
  vi.resetModules();
  const runtime = await import("../../src/shared/i18n.js");
  await runtime.loadLocale("en");
  return runtime;
}
afterEach(() => {
  for (const path of paths) vi.doUnmock(path);
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("locale lifecycle and asynchronous ordering", () => {
  it("keeps the current translated language until the critical replacement arrives", async () => {
    const core = deferred();
    vi.doMock("../../src/shared/i18n/core-zh.js", () => core.promise);
    const locale = await freshLocale();
    const loading = locale.loadCriticalLocale("zh");
    expect(locale.getLocale()).toBe("en");
    expect(locale.t("editor.props.transform")).toBe("Transform");
    core.resolve({ default: { "editor.props.transform": "变换" } });
    await loading;
    expect(locale.getLocale()).toBe("zh");
    expect(locale.t("editor.props.transform")).toBe("变换");
  });

  it("never lets a delayed critical slice replace the already loaded full dictionary", async () => {
    const core = deferred();
    vi.doMock("../../src/shared/i18n/core-zh.js", () => core.promise);
    vi.doMock("../../src/shared/i18n/zh.js", () => ({ default: {
      "editor.props.transform": "变换", "editor.constraints.title": "约束",
    } }));
    const locale = await freshLocale();
    const loading = locale.loadCriticalLocale("zh");
    await locale.loadLocale("zh");
    const expected = locale.t("editor.props.transform");
    core.resolve({ default: { "editor.props.transform": "obsolete critical label" } });
    await loading;
    expect(locale.t("editor.props.transform")).toBe(expected);
    expect(locale.t("editor.constraints.title")).toBe("约束");
  });

  it("notifies mounted consumers when returning to an already cached language", async () => {
    const locale = await freshLocale();
    await locale.loadLocale("zh");
    const listener = vi.fn();
    const unsubscribe = locale.onLocaleChange(listener);
    await locale.loadLocale("en");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith("en");
    expect(locale.t("editor.props.transform")).toBe("Transform");
    unsubscribe();
  });

  it("keeps the latest choice when the previous language request finishes late", async () => {
    const full = deferred();
    vi.doMock("../../src/shared/i18n/zh.js", () => full.promise);
    const locale = await freshLocale();
    const loading = locale.setLocale("zh");
    await locale.setLocale("en");
    full.resolve({ default: { "editor.props.transform": "变换" } });
    await loading;
    expect(locale.getLocale()).toBe("en");
    expect(locale.t("editor.props.transform")).toBe("Transform");
  });

  it("honors a second toggle while the first language is still loading", async () => {
    const full = deferred();
    vi.doMock("../../src/shared/i18n/zh.js", () => full.promise);
    const locale = await freshLocale();
    const first = locale.toggleLocale();
    const second = locale.toggleLocale();
    full.resolve({ default: { "editor.props.transform": "变换" } });
    await Promise.all([first, second]);
    expect(locale.getLocale()).toBe("en");
    expect(locale.t("editor.props.transform")).toBe("Transform");
  });

  it("preserves readable strings on failure and permits a later retry", async () => {
    const full = deferred();
    vi.doMock("../../src/shared/i18n/zh.js", () => full.promise);
    const locale = await freshLocale();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loading = locale.setLocale("zh");
    full.reject(new Error("dictionary network unavailable"));
    await loading;
    expect(locale.getLocale()).toBe("en");
    expect(locale.t("editor.props.transform")).toBe("Transform");
    expect(warning).toHaveBeenCalledOnce();
    vi.doUnmock("../../src/shared/i18n/zh.js");
    await locale.setLocale("zh");
    expect(locale.getLocale()).toBe("zh");
    expect(locale.t("editor.props.transform")).toBe("变换");
  });

  it("does not steal a pending language choice when a component asks for its dictionary", async () => {
    const full = deferred();
    vi.doMock("../../src/shared/i18n/zh.js", () => full.promise);
    const locale = await freshLocale();
    const loading = locale.setLocale("zh");
    const recovery = locale.ensureCurrentLocale();
    full.resolve({ default: { "editor.props.transform": "变换" } });
    await Promise.all([loading, recovery]);
    expect(locale.getLocale()).toBe("zh");
    expect(locale.t("editor.props.transform")).toBe("变换");
  });
});
