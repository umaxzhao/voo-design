import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistory } from "../../src/canvas/editor/editor_history.js";

const hooks = vi.hoisted(() => ({ active: false, slots: [], cursor: 0, dirty: false, layout: [], passive: [] }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal();
  const effect = (queue, callback, deps) => {
    const index = hooks.cursor++, previous = hooks.slots[index];
    const changed = !deps || !previous || deps.some((value, at) => !Object.is(value, previous[at]));
    hooks.slots[index] = deps;
    if (changed) hooks[queue].push(callback);
  };
  return {
    ...actual,
    useState(initial) {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? initial() : initial;
      return [hooks.slots[index], next => {
        const value = typeof next === "function" ? next(hooks.slots[index]) : next;
        if (!Object.is(value, hooks.slots[index])) { hooks.slots[index] = value; hooks.dirty = true; }
      }];
    },
    useRef(value) {
      if (!hooks.active) return actual.useRef(value);
      const index = hooks.cursor++;
      return hooks.slots[index] ??= { current: value };
    },
    useEffect(callback, deps) { if (hooks.active) effect("passive", callback, deps); else actual.useEffect(callback, deps); },
    useLayoutEffect(callback, deps) { if (hooks.active) effect("layout", callback, deps); else actual.useLayoutEffect(callback, deps); },
  };
});
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: key => key }) }));
import BoundedNumberInput from "../../src/canvas/components/bounded_number_input.jsx";
import MixedField from "../../src/canvas/components/editor_properties/mixed_field.jsx";

/** Child state keeps its actual props object; a parent publication supplies a new one. */
function mountField(options = {}) {
  Object.assign(hooks, { active: true, slots: [], cursor: 0, dirty: false, layout: [], passive: [] });
  let model = options.value ?? 100, tree, focused = false, blurCount = 0;
  const history = createHistory();
  history.reset({ value: model });
  const commits = [];
  const changes = [];
  let props = {
    value: model, min: 0, max: 1000, ariaLabel: "Checkpoint", ...options,
    onValueChange(next) { model = next; changes.push(next); },
    onCommit() {
      commits.push(model); history.push({ value: model });
      if (options.coalesceUndo) {
        model = history.undo().value;
        props = { ...props, value: model };
        hooks.dirty = true;
      }
    },
  };
  const flush = () => {
    let renders = 0;
    do {
      if (++renders > 20) throw new Error("Numeric field render did not settle");
      hooks.cursor = 0; hooks.dirty = false;
      tree = BoundedNumberInput(props);
      for (const run of hooks.layout.splice(0)) run();
      for (const run of hooks.passive.splice(0)) run();
    } while (hooks.dirty);
  };
  const blur = () => {
    if (!focused) return;
    focused = false; blurCount++;
    tree.props.onBlur();
  };
  const focus = () => {
    if (focused) return;
    focused = true; tree.props.onFocus();
  };
  flush();
  return {
    change(text) { focus(); tree.props.onChange({ target: { value: text } }); if (hooks.dirty) flush(); },
    key(key, extra = {}) {
      tree.props.onKeyDown({ key, nativeEvent: {}, preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { blur }, ...extra });
      if (hooks.dirty) flush();
    },
    blur() { blur(); if (hooks.dirty) flush(); },
    compose(active) { tree.props[active ? "onCompositionStart" : "onCompositionEnd"]?.(); },
    publish(value) { props = { ...props, value }; flush(); },
    undo() { model = history.undo().value; this.publish(model); },
    redo() { model = history.redo().value; this.publish(model); },
    get inputType() { return tree.props.type; },
    get model() { return model; }, get draft() { return tree.props.value; },
    get commits() { return commits; }, get changes() { return changes; },
    get blurCount() { return blurCount; }, get history() { return history; },
  };
}
afterEach(() => { hooks.active = false; });

describe("bounded numeric publication boundaries", () => {
  it("restores the latest local Enter immediately while parent props are still old, with one Undo", () => {
    const field = mountField();
    field.change("150"); field.key("Enter");
    expect([field.model, field.draft, field.commits]).toEqual([150, "150", [150]]);
    field.change("222"); field.key("Escape");
    expect([field.model, field.draft, field.commits]).toEqual([150, "150", [150]]);
    field.undo(); expect([field.model, field.draft]).toEqual([100, "100"]);
    expect(field.history.canUndo()).toBe(false);
    field.redo(); expect([field.model, field.draft]).toEqual([150, "150"]);
  });

  it("accepts an authoritative same-value parent publication after coalesced Enter and Undo", () => {
    const field = mountField({ coalesceUndo: true });
    field.change("150"); field.key("Enter");
    expect([field.model, field.draft, field.commits]).toEqual([100, "100", [150]]);
    field.change("222"); field.key("Escape");
    expect([field.model, field.draft, field.commits]).toEqual([100, "100", [150]]);
  });

  it("does not replace a focused expression with a published live preview", () => {
    const field = mountField({ precision: 1 });
    field.change("(20 + 5) / 2"); field.publish(12.5);
    expect(field.draft).toBe("(20 + 5) / 2");
    field.blur(); expect([field.model, field.draft, field.commits]).toEqual([12.5, "12.5", [12.5]]);
  });

  it.each(["", "1/", "1/0", "not a number"])("keeps the latest commit for invalid draft %j with delayed props", text => {
    const field = mountField();
    field.change("150"); field.key("Enter");
    field.change(text); field.blur();
    expect([field.model, field.draft, field.commits]).toEqual([150, "150", [150]]);
  });

  it("clamps on blur and keeps decimal and shifted arrow boundaries", () => {
    const field = mountField({ value: 10, min: 0, max: 20, step: 0.5, precision: 1 });
    field.change("999"); expect(field.model).toBe(10);
    field.blur(); expect([field.model, field.draft, field.commits]).toEqual([20, "20", [20]]);
    field.change("12.2"); field.key("ArrowUp", { shiftKey: true });
    expect([field.model, field.draft, field.commits]).toEqual([17.2, "17.2", [20, 17.2]]);
    field.key("Escape"); expect(field.commits).toEqual([20, 17.2]);
  });

  it("focus-only, unchanged blur and Escape add no history", () => {
    const field = mountField();
    field.change("100"); field.blur();
    field.change("100"); field.key("Escape");
    expect([field.model, field.draft, field.commits]).toEqual([100, "100", []]);
    expect(field.history.canUndo()).toBe(false);
  });

  it("leaves Enter and Escape to an active IME composition", () => {
    const field = mountField();
    field.change("222"); field.compose(true);
    field.key("Enter"); field.key("Escape");
    expect([field.blurCount, field.commits, field.draft]).toEqual([0, [], "222"]);
    field.compose(false); field.key("Escape");
    expect([field.model, field.draft, field.commits]).toEqual([100, "100", []]);
  });

  it.each([{ nativeEvent: { isComposing: true } }, { keyCode: 229 }])("preserves native composition keys %j", extra => {
    const field = mountField();
    field.change("222"); field.key("Enter", extra); field.key("Escape", extra);
    expect([field.blurCount, field.commits, field.draft]).toEqual([0, [], "222"]);
  });

  it("retains numeric text semantics and the separate mixed-field empty placeholder", () => {
    const field = mountField();
    expect(field.draft).toBe("100");
    expect(field.inputType).toBe("text");
    hooks.active = false;
    const markup = renderToStaticMarkup(<MixedField label="X" ariaLabel="Mixed X" onValueChange={() => {}} />);
    expect(markup).toContain('type="number"');
    expect(markup).toContain('placeholder="—"');
    expect(markup).toContain('value=""');
  });
});
