import { describe, expect, it } from "vitest";
import { isEmbedPage, isEmbedQuery } from "../../src/shared/embed_mode.js";

describe("embed mode query", () => {
  it.each([
    ["?embed", true],
    ["?embed=1", true],
    ["?embed=true", true],
    ["?minimal", true],
    ["?minimal=1&foo=bar", true],
    ["?em=1", false],
    ["", false],
    ["?foo=embed", false],
    ["?embedding=1", false],
  ])("%s -> %s", (search, expected) => {
    expect(isEmbedQuery(search)).toBe(expected);
  });

  it("treats a missing value and a false-looking value as embedded", () => {
    // Presence-based: the panel sends `?embed`, and a bare flag must count.
    expect(isEmbedQuery("?embed=")).toBe(true);
    expect(isEmbedQuery("?embed=false")).toBe(true);
  });

  it("is safe outside a browser", () => {
    expect(isEmbedPage()).toBe(false);
  });
});
