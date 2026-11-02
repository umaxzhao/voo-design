import { describe, it, expect } from "vitest";
import { documentToHtml } from "../../src/canvas/editor/editor_html_export.js";
import { createVideoNode } from "../../src/canvas/editor/scene-video.js";

const doc = (node) => ({ width: 800, height: 600, backgroundColor: "#fff", nodes: [node] });

describe("HTML export keeps video layers", () => {
  it("exports a silent, looping, autoplaying video element without controls", () => {
    const node = createVideoNode({ box: { x: 0, y: 0, width: 320, height: 180 }, src: "https://cdn.example.com/clip.mp4" });
    const html = documentToHtml(doc(node));
    expect(html).toContain('<video');
    expect(html).toContain('src="https://cdn.example.com/clip.mp4"');
    expect(html).toMatch(/autoplay muted loop playsinline/);
    expect(html).not.toMatch(/<video[^>]*controls/);
  });

  it("fails fast on a video layer with no safe source", () => {
    const node = createVideoNode({ box: { x: 0, y: 0, width: 320, height: 180 }, src: "javascript:alert(1)" });
    expect(() => documentToHtml(doc(node))).toThrow("html-export-video-source");
  });
});
