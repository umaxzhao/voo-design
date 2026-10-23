import { afterEach, expect, it, vi } from "vitest";
import { streamChatTurn } from "../../src/canvas/agent/chat_stream.js";

afterEach(() => vi.unstubAllGlobals());

const event = delta => `data: ${JSON.stringify({ choices: [{ delta }] })}`;
const config = { apiKey: "mock-only", baseUrl: "https://qa.invalid/v1", model: "qa-mock" };

it.each(["", "\n", "\r\n"])("keeps the final tool call with %j as the stream ending", async ending => {
  const payload = event({ tool_calls: [{ index: 0, id: "qa-shape", function: {
    name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 80 }),
  } }] }) + ending;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(payload)));
  const reply = await streamChatTurn({ config, messages: [], tools: [] });
  expect(reply.toolCalls).toEqual([{ id: "qa-shape", name: "create_shape", arguments: JSON.stringify({ kind: "rect", x: 0, y: 0, width: 100, height: 80 }) }]);
});

it("preserves Unicode and fragments across byte chunks and an unterminated final event", async () => {
  const bytes = new TextEncoder().encode(event({ content: "设计 🎨" }) + "\n" + event({ content: "完成" }));
  const body = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  const onText = vi.fn();
  const reply = await streamChatTurn({ config, messages: [], tools: [], onText });
  expect(reply.text).toBe("设计 🎨完成");
  expect(onText).toHaveBeenLastCalledWith(reply.text);
});

it("ignores an unterminated DONE marker", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(event({ content: "Done" }) + "\n\ndata: [DONE]")));
  expect((await streamChatTurn({ config, messages: [], tools: [] })).text).toBe("Done");
});

it("aborts a pending read, cancels the source, and releases its lock", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  const controller = new AbortController();
  const pending = streamChatTurn({ config, messages: [], tools: [], signal: controller.signal });
  await vi.waitFor(() => expect(body.locked).toBe(true));
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(body.locked).toBe(false);
});

it("stops on DONE even if the server leaves the connection open", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(event({ content: "Ready" }) + "\ndata: [DONE]\n"));
  }, cancel });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  expect((await streamChatTurn({ config, messages: [], tools: [] })).text).toBe("Ready");
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it("cancels and unlocks malformed streams without returning partial tool calls", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(event({ tool_calls: [{ index: 0, function: { name: "create_shape", arguments: "{" } }] }) + '\ndata: broken\n'));
  }, cancel });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  await expect(streamChatTurn({ config, messages: [], tools: [] })).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});

it("does not fetch an already cancelled request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(streamChatTurn({ config, messages: [], tools: [], signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});

it("discards buffered events and partial Unicode when cancelled from onText", async () => {
  const controller = new AbortController();
  const cancel = vi.fn();
  const body = new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(event({ content: "First" }) + '\n' + event({ content: "Late" }) + '\n'));
  }, cancel });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  const onText = vi.fn(() => controller.abort());
  await expect(streamChatTurn({ config, messages: [], tools: [], signal: controller.signal, onText })).rejects.toMatchObject({ name: "AbortError" });
  expect(onText).toHaveBeenCalledTimes(1);
  expect(body.locked).toBe(false);
});
