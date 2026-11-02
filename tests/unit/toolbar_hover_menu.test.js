// Resting a mouse on a toolbar tool opens its menu; a click pins it open;
// touch and pen never hover-open.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ refs: [], cursor: 0 }));
vi.mock("react", () => ({
  useRef: (initial) => {
    const i = hooks.cursor++;
    if (!(i in hooks.refs)) hooks.refs[i] = { current: initial };
    return hooks.refs[i];
  },
  useEffect: () => {},
}));

const { useHoverMenu } = await import("../../src/canvas/components/use_hover_menu.js");

function make(open = false) {
  hooks.cursor = 0;
  const state = { open };
  const openMenu = vi.fn(() => { state.open = true; });
  const close = vi.fn(() => { state.open = false; });
  const render = () => { hooks.cursor = 0; return useHoverMenu({ open: state.open, openMenu, close }); };
  return { state, openMenu, close, render };
}

describe("useHoverMenu", () => {
  beforeEach(() => { hooks.refs = []; vi.useFakeTimers(); globalThis.window = globalThis.window ?? globalThis; });
  afterEach(() => vi.useRealTimers());

  it("opens after a short mouse rest and closes again on leave", () => {
    const m = make();
    const hover = m.render();
    hover.onPointerEnter({ pointerType: "mouse" });
    expect(m.openMenu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(130);
    expect(m.openMenu).toHaveBeenCalledOnce();
    const next = m.render();
    next.onPointerLeave({ pointerType: "mouse" });
    vi.advanceTimersByTime(250);
    expect(m.close).toHaveBeenCalledOnce();
  });

  it("returning before the close delay keeps the menu open", () => {
    const m = make();
    m.render().onPointerEnter({ pointerType: "mouse" });
    vi.advanceTimersByTime(130);
    const hover = m.render();
    hover.onPointerLeave({ pointerType: "mouse" });
    vi.advanceTimersByTime(100);
    hover.onPointerEnter({ pointerType: "mouse" });
    vi.advanceTimersByTime(300);
    expect(m.close).not.toHaveBeenCalled();
  });

  it("a click before the delay cancels the hover open and toggles normally", () => {
    const m = make();
    const hover = m.render();
    hover.onPointerEnter({ pointerType: "mouse" });
    expect(hover.pin()).toBe(false);
    vi.advanceTimersByTime(300);
    expect(m.openMenu).not.toHaveBeenCalled();
  });

  it("a click on a hover-opened menu pins it open past mouse leave", () => {
    const m = make();
    m.render().onPointerEnter({ pointerType: "mouse" });
    vi.advanceTimersByTime(130);
    const hover = m.render();
    expect(hover.pin()).toBe(true);
    hover.onPointerLeave({ pointerType: "mouse" });
    vi.advanceTimersByTime(300);
    expect(m.close).not.toHaveBeenCalled();
  });

  it("ignores touch and pen pointers", () => {
    const m = make();
    const hover = m.render();
    hover.onPointerEnter({ pointerType: "touch" });
    hover.onPointerEnter({ pointerType: "pen" });
    vi.advanceTimersByTime(300);
    expect(m.openMenu).not.toHaveBeenCalled();
  });
});
