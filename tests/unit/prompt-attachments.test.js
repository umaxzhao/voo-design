import { beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ slots: [], cursor: 0, cleanup: null, read: vi.fn() }));
vi.mock("react", () => ({
  useCallback: callback => callback,
  useState: initial => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [harness.slots[index], value => { harness.slots[index] = value; }];
  },
  useRef: initial => {
    const index = harness.cursor++;
    return harness.slots[index] ??= { current: initial };
  },
  useEffect: effect => { harness.cleanup ??= effect(); },
}));
vi.mock("../../src/canvas/components/welcome_dashboard/generation_intent.js", () => ({ readAttachmentFiles: harness.read }));
import { clipboardImageFiles, usePromptAttachments } from "../../src/canvas/components/use_prompt_attachments.js";
const t = key => key;
function render() { harness.cursor = 0; return usePromptAttachments(t); }
const image = name => ({ name, type: "image/png", size: 12 });
const records = files => ({ attachments: files.map(file => ({ kind: "image", name: file.name, dataUrl: "data:image/png;base64,eA==" })), errors: [] });
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.cleanup = null;
  harness.read.mockReset().mockImplementation(async files => records(files));
});
describe("prompt reference attachments", () => {
  it("prefers clipboard image items without duplicating their files entry", () => {
    const file = image("paste.png");
    expect(clipboardImageFiles({ items: [{ kind: "file", type: "image/png", getAsFile: () => file }], files: [file] })).toEqual([file]);
    expect(clipboardImageFiles({ files: [file, { type: "text/plain" }] })).toEqual([file]);
  });
  it("preserves ordinary text paste and intercepts images before canvas paste", async () => {
    const event = { clipboardData: { files: [] }, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const hook = render();
    await hook.onPaste(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    event.clipboardData.files.push(image("paste.png"));
    await hook.onPaste(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(render().attachments[0].name).toBe("paste.png");
  });
  it("reserves concurrent read slots and reports overflow instead of silently dropping it", async () => {
    const pending = [];
    harness.read.mockImplementation(files => new Promise(resolve => pending.push(() => resolve(records(files)))));
    const hook = render();
    const first = hook.addFiles([image("a"), image("b"), image("c")]);
    const second = hook.addFiles([image("d"), image("e")]);
    expect(harness.slots[3].current.reserved).toBe(4);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending.forEach(resolve => resolve());
    await Promise.all([first, second]);
    expect(render().attachments).toHaveLength(4);
    expect(new Set(render().attachments.map(item => item.id)).size).toBe(4);
    expect(render().attachmentError).toBe("welcome.prompt.attachmentLimit");
    expect(render().isReading).toBe(false);
  });
  it.each(["reset", "unmount"])("discards a late file read after %s", async action => {
    let finish;
    harness.read.mockImplementation(files => new Promise(resolve => { finish = () => resolve(records(files)); }));
    const hook = render();
    const reading = hook.addFiles([image("late.png")]);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    if (action === "reset") hook.clearAttachments();
    else harness.cleanup();
    finish();
    await reading;
    expect(render().attachments).toEqual([]);
  });
  it("keeps valid references when another attachment fails validation", async () => {
    harness.read.mockResolvedValue({ ...records([image("valid.png")]), errors: ["invalid"] });
    await render().addFiles([image("valid.png"), image("bad.png")]);
    expect(render().attachmentError).toBe("welcome.prompt.attachmentReadError");
    const target = render().attachments[0];
    render().removeAttachment(target);
    expect(render().attachments).toEqual([]);
  });
});
