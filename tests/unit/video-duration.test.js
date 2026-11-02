import { describe, expect, it } from "vitest";
import { EXECUTION_MODE, PLATFORM_TARGET } from "../../src/canvas/generation_routes.js";
import { getVideoDurationProfile, sanitizeVideoDuration, validateVideoDuration } from "../../src/shared/providers/video_duration.js";

describe("video duration route vocabulary", () => {
  it("uses the shared web-route constants for Jimeng's discrete durations", () => {
    const context = { executionMode: EXECUTION_MODE.CHAT, platform: PLATFORM_TARGET.JIMENG };
    expect(getVideoDurationProfile(context)).toMatchObject({ supported: true, type: "options", options: [5, 10] });
    expect(sanitizeVideoDuration("10s", context)).toBe(10);
    expect(validateVideoDuration(6, context)).toMatchObject({ valid: false, allowed: [5, 10] });
  });

  it("keeps general chat duration validation and platform-default omission", () => {
    const context = { executionMode: EXECUTION_MODE.CHAT, platform: PLATFORM_TARGET.CHATGPT };
    expect(getVideoDurationProfile(context)).toMatchObject({ supported: true, type: "range", min: 1, max: 60 });
    expect(sanitizeVideoDuration(undefined, context)).toBeUndefined();
    expect(() => sanitizeVideoDuration(61, context)).toThrow("Duration must be between 1s and 60s");
  });
});
