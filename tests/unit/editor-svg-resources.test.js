import { afterEach, expect, it, vi } from "vitest";
import { exportSvgNodes } from "../../src/canvas/editor/editor-svg-resources.js";

afterEach(() => vi.unstubAllGlobals());

it("embeds persisted image bytes and natural crop dimensions without retaining blob URLs", () => {
  const drawImage = vi.fn();
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ drawImage }), toDataURL: () => "data:image/png;base64,b3Jhbmdl" }) });
  const node = { id: "photo", kind: "image", imageId: "asset", src: "blob:temporary",
    x: -200, y: -100, width: 90, height: 70,
    crop: { x: 10, y: 20, width: 80, height: 60 } };
  const bitmap = { naturalWidth: 200, naturalHeight: 160 };
  const svg = exportSvgNodes([node], { cache: { get: () => bitmap } });
  expect(svg).toContain('viewBox="10 20 80 60"');
  expect(svg).toContain('href="data:image/png;base64,b3Jhbmdl"');
  expect(svg).not.toContain("blob:temporary");
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
  expect(node.src).toBe("blob:temporary");
});

it("retains masks for bitmap-backed copies", () => {
  let encoded = 0;
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ drawImage() {} }), toDataURL: () => `data:image/png;base64,${++encoded}` }) });
  const node = { id: "photo", kind: "image", imageId: "asset", maskId: "mask",
    x: -20, y: -30, width: 40, height: 30 };
  const svg = exportSvgNodes([node], { cache: { get: () => ({ width: 40, height: 30 }) },
    maskTools: { maskSourceOf: () => ({ width: 40, height: 30 }) } });
  expect(svg).toContain('mask="url(#mask-photo)"');
  expect(svg).toContain('href="data:image/png;base64,2"');
});

it("keeps vector-only SVG available without a browser bitmap context", () => {
  expect(exportSvgNodes([{ id: "rect", kind: "rect", x: -10, y: -20,
    width: 30, height: 40, fill: "#ff0000" }])).toContain('fill="#ff0000"');
});
