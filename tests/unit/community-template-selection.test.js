import { expect, it } from "vitest";
import { prepareCommunityTemplate } from "../../src/canvas/components/community-template-selection.js";

it("keeps offline design factories usable when the online catalog is unavailable", () => {
  const template = { title: "Local template", createDoc: () => ({ nodes: [] }) };
  const result = prepareCommunityTemplate(template, "zh");
  expect(result.type).toBe("design");
  expect(result.template).toBe(template);
});

it("opens a serialized design envelope with image assets and independent document copies", () => {
  const result = prepareCommunityTemplate({ id: "design", title: "Plain title", document: JSON.stringify({
    document: { width: 500, height: 400, nodes: [{ id: "image", kind: "image", assetId: "asset" }] },
    assets: { asset: { data: "image-bytes" } },
  }) }, "zh");
  expect(result.template.title).toBe("Plain title");
  expect(result.template.assets.asset.data).toBe("image-bytes");
  const first = result.template.createDoc();
  first.nodes[0].id = "changed";
  expect(result.template.createDoc().nodes[0].id).toBe("image");
});

it("localizes prompt templates and rejects malformed or empty designs", () => {
  expect(prepareCommunityTemplate({ body: { zh: "页面提示", en: "Page prompt" } }, "zh").prompt).toBe("页面提示");
  expect(() => prepareCommunityTemplate({ kind: "design", document: "invalid" }, "en")).toThrow();
  expect(() => prepareCommunityTemplate({ kind: "design" }, "en")).toThrow();
  expect(() => prepareCommunityTemplate({ body: "" }, "en")).toThrow();
});
