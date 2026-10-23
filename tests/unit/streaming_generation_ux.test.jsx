import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import StreamingLayoutPreview from "../../src/canvas/components/streaming_layout_preview.jsx";
import { runAgentTurn } from "../../src/canvas/agent/canvas_agent.js";

describe("streaming generation UX", () => {
  it("releases the turn immediately if a provider ignores its abort signal", async () => {
    const controller = new AbortController();
    let started;
    const waiting = new Promise((resolve) => { started = resolve; });
    const turn = runAgentTurn({ history: [], userText: "draw", tools: [], signal: controller.signal,
      streamStep: () => { started(); return new Promise(() => {}); },
    });
    await waiting;
    controller.abort();
    await expect(turn).rejects.toMatchObject({ name: "AbortError" });
  });
  it("renders a visible, accessible skeleton before any HTML arrives", () => {
    const html = renderToStaticMarkup(<StreamingLayoutPreview previewHtml="" width={640} height={720} t={(key) => key} />);
    expect(html).toContain('data-testid="streaming-layout-skeleton"');
    expect(html).toContain('role="status"');
    expect(html).toContain('motion-safe:animate-pulse');
    expect(html).toContain('opacity-0');
  });

  it("does not execute streamed tools after cancellation even when the provider returns", async () => {
    const controller = new AbortController();
    const executeTool = vi.fn();
    await expect(runAgentTurn({
      history: [], userText: "draw", tools: [], executeTool, signal: controller.signal,
      streamStep: async () => {
        controller.abort();
        return { text: "done", toolCalls: [{ id: "1", name: "create_shape", arguments: "{}" }] };
      },
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("passes cancellation to tools and does not report success for a cancelled tool", async () => {
    const controller = new AbortController();
    const events = [];
    await expect(runAgentTurn({
      history: [], userText: "draw", tools: [], signal: controller.signal,
      streamStep: async () => ({ text: "", toolCalls: [{ id: "1", name: "create_shape", arguments: "{}" }] }),
      executeTool: async (_name, _args, { signal }) => {
        expect(signal).toBe(controller.signal);
        controller.abort();
        return { ok: true };
      },
      onToolEvent: (event) => events.push(event),
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(events.some((event) => event.status === "completed")).toBe(false);
  });
});
