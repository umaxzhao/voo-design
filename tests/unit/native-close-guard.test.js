import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
const { createCloseGuard } = createRequire(import.meta.url)("../../electron/close-guard.cjs");

function fixture(dirty = true, response = 0, locale = "en") {
  const handlers = new Map();
  const window = { isDestroyed: () => false, close: vi.fn(),
    on: (event, handler) => handlers.set(event, handler),
    webContents: { on: (event, handler) => handlers.set(event, handler), executeJavaScript: vi.fn(async () => dirty) } };
  const dialog = { showMessageBox: vi.fn(async () => ({ response })) };
  const guard = createCloseGuard({ app: { getLocale: () => locale }, dialog, getWindow: () => window });
  guard.attach(window);
  return { guard, handlers, window, dialog };
}

describe("native dirty-close confirmation", () => {
  it("keeps editing by default and permits a later explicit discard", async () => {
    const f = fixture();
    expect(await f.guard.confirm()).toBe(false);
    expect(f.dialog.showMessageBox.mock.calls[0][1]).toMatchObject({ defaultId: 0, cancelId: 0 });
    const unload = { preventDefault: vi.fn() }; f.handlers.get("will-prevent-unload")(unload);
    expect(unload.preventDefault).not.toHaveBeenCalled();
    f.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
    expect(await f.guard.confirm()).toBe(true);
    f.handlers.get("will-prevent-unload")(unload); expect(unload.preventDefault).toHaveBeenCalledOnce();
  });
  it("shares one pending choice between concurrent window-close and quit requests", async () => {
    const f = fixture(); let resolve;
    f.dialog.showMessageBox.mockImplementation(() => new Promise(r => { resolve = r; }));
    const first = f.guard.confirm(); expect(f.guard.confirm()).toBe(first);
    await Promise.resolve(); resolve({ response: 1 }); expect(await first).toBe(true);
    expect(f.dialog.showMessageBox).toHaveBeenCalledOnce();
  });
  it("closes clean windows without prompting, and localizes dirty prompts", async () => {
    const clean = fixture(false);
    expect(await clean.guard.confirm()).toBe(true); expect(clean.dialog.showMessageBox).not.toHaveBeenCalled();
    const zh = fixture(true, 1, "zh-CN"); expect(await zh.guard.confirm()).toBe(true);
    expect(zh.dialog.showMessageBox.mock.calls[0][1].buttons).toEqual(["继续编辑", "放弃并关闭"]);
  });
  it("keeps a failed renderer query visible to the caller instead of assuming work is saved", async () => {
    const f = fixture(); f.window.webContents.executeJavaScript.mockRejectedValueOnce(new Error("renderer gone"));
    await expect(f.guard.confirm()).rejects.toThrow("renderer gone");
    expect(f.dialog.showMessageBox).not.toHaveBeenCalled();
  });
});
