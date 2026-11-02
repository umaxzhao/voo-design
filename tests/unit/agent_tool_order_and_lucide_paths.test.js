import { describe, expect, it, vi } from "vitest";
import { parseSvgPath } from "../../src/canvas/editor/editor_svg_parse.js";
import { pathDataFor } from "../../src/canvas/editor/skia_adapter_paths.js";
import { pathData } from "../../src/canvas/editor/editor_svg_shapes.js";
import { createPenNode } from "../../src/canvas/editor/scene_model_paths.js";
import { normalizeToolMessageOrder } from "../../src/canvas/agent/chat_stream.js";
import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";
import { ICONS } from "../../src/canvas/agent/html_pipeline/lucide.js";
import { parseSvgToNodes } from "../../src/canvas/agent/svg_to_nodes.js";

describe("Agent multi-tool response order and Lucide subpath separation", () => {
  describe("a) Tool response message ordering for OpenAI specification", () => {
    it("orders all tool responses consecutively before any follow-up user message", () => {
      const input = [
        { role: "system", content: "sys" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_capture", type: "function", function: { name: "capture_canvas", arguments: "{}" } },
            { id: "call_inspect", type: "function", function: { name: "inspect_layout", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "call_capture", content: '{"imageAttached":true}' },
        { role: "user", content: "Canvas captured. Review the lint summary above." },
        { role: "tool", tool_call_id: "call_inspect", content: '{"issues":[]}' },
      ];

      const ordered = normalizeToolMessageOrder(input);

      expect(ordered[0].role).toBe("system");
      expect(ordered[1].role).toBe("assistant");
      // Both tool responses must come immediately after the assistant message
      expect(ordered[2]).toEqual({ role: "tool", tool_call_id: "call_capture", content: '{"imageAttached":true}' });
      expect(ordered[3]).toEqual({ role: "tool", tool_call_id: "call_inspect", content: '{"issues":[]}' });
      // Follow-up user message must come after all tool responses
      expect(ordered[4]).toEqual({ role: "user", content: "Canvas captured. Review the lint summary above." });
    });

    it("runs runAgentTurn and places all tool responses before follow-up user image message when multiple tools are called", async () => {
      const messagesSeen = [];
      const streamStep = vi.fn(async ({ messages }) => {
        messagesSeen.push(messages.slice());
        if (streamStep.mock.calls.length === 1) {
          return {
            text: "checking",
            toolCalls: [
              { id: "c1", name: "capture_canvas", arguments: "{}" },
              { id: "c2", name: "inspect_layout", arguments: "{}" },
            ],
          };
        }
        return { text: "done", toolCalls: [] };
      });

      const result = await runAgentTurn({
        config: { apiKey: "key", baseUrl: "https://api.example.com", model: "deepseek-chat" },
        history: [],
        userText: "verify design",
        tools: [],
        executeTool: vi.fn(async (name) => {
          if (name === "capture_canvas") {
            return { ok: true, dataUrl: "data:image/png;base64,DATA" };
          }
          return { ok: true, issues: [] };
        }),
        streamStep,
      });

      expect(result).toBe("done");
      const turnMessages = messagesSeen[1];
      const assistantIdx = turnMessages.findIndex((m) => m.role === "assistant" && m.tool_calls?.length === 2);
      expect(assistantIdx).toBeGreaterThanOrEqual(0);

      // Tool responses must immediately follow assistant without user message in between
      expect(turnMessages[assistantIdx + 1].role).toBe("tool");
      expect(turnMessages[assistantIdx + 1].tool_call_id).toBe("c1");
      expect(turnMessages[assistantIdx + 2].role).toBe("tool");
      expect(turnMessages[assistantIdx + 2].tool_call_id).toBe("c2");

      // Follow-up user message must come after tool responses
      expect(turnMessages[assistantIdx + 3].role).toBe("user");
      expect(turnMessages[assistantIdx + 3].content).toBe("Canvas captured. Review the lint summary above.");
    });
  });

  describe("b) Multi-subpath SVG path parsing and contour separation", () => {
    it("marks moveTo: true on subsequent M commands in parseSvgPath", () => {
      // Path with two disconnected line segments: (0,0)->(10,10) and (20,20)->(30,30)
      const d = "M 0 0 L 10 10 M 20 20 L 30 30";
      const anchors = parseSvgPath(d);

      expect(anchors.length).toBe(4);
      expect(anchors[0]).toMatchObject({ x: 0, y: 0 });
      expect(anchors[0].moveTo).toBeUndefined();
      expect(anchors[1]).toMatchObject({ x: 10, y: 10 });
      expect(anchors[1].moveTo).toBeUndefined();

      // Second M anchor must be marked as moveTo
      expect(anchors[2]).toMatchObject({ x: 20, y: 20, moveTo: true });
      expect(anchors[3]).toMatchObject({ x: 30, y: 30 });
    });

    it("renders distinct M commands in Skia path data without cross-connecting line segments", () => {
      const d = "M 0 0 L 10 10 M 20 20 L 30 30";
      const anchors = parseSvgPath(d);
      const node = createPenNode(anchors, "#ffffff", 2);

      const pathDataString = pathDataFor(node);
      // Path data must contain M for both contours
      expect(pathDataString).toMatch(/M \d+ \d+ L \d+ \d+ M \d+ \d+ L \d+ \d+/);
      // Must not draw a line connecting contour 1 to contour 2
      expect(pathDataString).not.toMatch(/L \d+ \d+ L \d+ \d+/);
    });

    it("renders distinct contours in SVG path export without cross-connecting line segments", () => {
      const d = "M 0 0 L 10 10 M 20 20 L 30 30";
      const anchors = parseSvgPath(d);
      const node = createPenNode(anchors, "#ffffff", 2);

      const exported = pathData(node);
      expect(exported).toContain("M");
      // Must have at least two M commands
      const mMatches = exported.match(/M/g);
      expect(mMatches?.length).toBe(2);
    });

    it("correctly separates all subpaths of Lucide user-plus icon without diagonal cross lines", () => {
      const iconData = ICONS["user-plus"];
      expect(iconData).toBeDefined();

      const body = iconData.node.map(([tag, attrs]) => {
        const attrsStr = Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ");
        return `<${tag} ${attrsStr}></${tag}>`;
      }).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`;
      const parsed = parseSvgToNodes(svg, { targetWidth: 24, targetHeight: 24 });
      const compositeD = parsed.nodes.map((n) => n.d).filter(Boolean).join(" ");

      const anchors = parseSvgPath(compositeD);
      // user-plus consists of shoulders, head, and two plus lines -> at least 4 contours
      const moveTos = anchors.filter((a) => a.moveTo === true);
      expect(moveTos.length).toBeGreaterThanOrEqual(3); // subsequent contours

      const node = createPenNode(anchors, "#ffffff", 2);
      const pathDataString = pathDataFor(node);

      // Must have separate M commands in Skia path data (one per subpath)
      const mCount = (pathDataString.match(/M /g) || []).length;
      expect(mCount).toBeGreaterThanOrEqual(4);

      // Also verify SVG export path has all 4 M commands
      const svgD = pathData(node);
      const svgMCount = (svgD.match(/M/g) || []).length;
      expect(svgMCount).toBeGreaterThanOrEqual(4);
    });
  });
});
