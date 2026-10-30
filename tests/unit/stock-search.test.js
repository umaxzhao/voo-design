import { describe, expect, it, vi } from "vitest";
import { searchStock } from "../../src/canvas/agent/stock-search.js";
describe("public stock search fallback", () => {
  it("retains license, source and creator when the primary index returns nothing", async () => {
    const fetch = vi.fn(async url => ({
      ok: true,
      json: async () => url.includes("openverse") ? {
        results: []
      } : {
        query: {
          pages: {
            photo: {
              title: "File:Fern.jpg",
              imageinfo: [{
                thumburl: "https://example.test/fern.jpg",
                descriptionurl: "https://example.test/license",
                extmetadata: {
                  Artist: {
                    value: "<a>Alice</a>"
                  },
                  LicenseShortName: {
                    value: "CC0"
                  }
                }
              }]
            }
          }
        }
      }
    }));
    const result = await searchStock("fern & leaf", 1, {
      fetch
    });
    expect(result.source).toBe("wikimedia-commons");
    expect(result.warnings).toEqual([{
      source: "openverse",
      reason: "No results"
    }]);
    expect(result.results[0]).toMatchObject({
      creator: "Alice",
      license: "CC0",
      foreign_landing_url: "https://example.test/license"
    });
    const url = new URL(fetch.mock.calls[1][0]);
    expect(url.searchParams.get("origin")).toBe("*");
    expect(url.searchParams.get("gsrsearch")).toBe("fern & leaf filetype:bitmap");
  });
  it("does not return fallback assets without an explicit open license", async () => {
    const fetch = async url => ({
      ok: true,
      json: async () => url.includes("openverse") ? {
        results: []
      } : {
        query: {
          pages: {
            unknown: {
              imageinfo: [{
                url: "https://example.test/unlicensed.jpg"
              }]
            }
          }
        }
      }
    });
    await expect(searchStock("fern", 1, {
      fetch
    })).rejects.toMatchObject({
      code: "agentStockUnavailable"
    });
  });
  it("does not start another request after cancellation", async () => {
    const abort = new AbortController();
    const fetch = vi.fn(async () => {
      abort.abort(new Error("cancelled"));
      throw abort.signal.reason;
    });
    await expect(searchStock("fern", 1, {
      fetch,
      signal: abort.signal
    })).rejects.toThrow("cancelled");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
