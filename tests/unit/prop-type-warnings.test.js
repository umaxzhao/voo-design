import { describe, expect, it, vi } from "vitest";
import { watchPropTypeWarnings } from "../helpers/prop-type-warnings.js";

describe("React contract warning guard", () => {
  it("records interpolated prop warnings without suppressing the original log", () => {
    const target = { error: vi.fn() };
    const original = target.error;
    const guard = watchPropTypeWarnings(target);
    target.error("Warning: Failed %s type: %s", "prop", "Missing callback");
    expect(guard.takeWarnings()).toEqual(["Warning: Failed prop type: Missing callback"]);
    expect(original).toHaveBeenCalledWith("Warning: Failed %s type: %s", "prop", "Missing callback");
    expect(guard.takeWarnings()).toEqual([]);
    guard.restore();
    expect(target.error).toBe(original);
  });

  it("keeps unrelated diagnostics out of the prop contract assertion", () => {
    const target = { error: vi.fn() };
    const guard = watchPropTypeWarnings(target);
    target.error("Expected storage failure");
    target.error("Warning: useLayoutEffect does nothing on the server");
    expect(guard.takeWarnings()).toEqual([]);
    guard.restore();
    expect(target.error).toHaveBeenCalledTimes(2);
  });
});
