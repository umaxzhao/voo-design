import assert from "node:assert/strict";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";

await withEditorBrowser(async ({ page, tool }) => {
  await page.evaluate(async () => {
    const { setSetting } = await import("/src/shared/settings.js");
    const { setLocale } = await import("/src/shared/i18n.js");
    const { useDesignStore } = await import("/src/store/design_store.js");
    const { createGroupNode, createRectNode } = await import(
      "/src/canvas/editor/scene_model.js"
    );
    setLocale("en");
    setSetting("agent.model", "codex:gpt-6-astra");
    window.__capturedAgentRequests = [];
    window.vooDesktop = {
      localCli: {
        connect: async () => ({ installed: false }),
        onText: () => () => {},
        cancel: async () => {},
        advance: async (request) => {
          window.__capturedAgentRequests.push(request);
          return { ok: true, done: true, text: "Selection received." };
        },
      },
    };
    const e = window.__vooEditor;
    e.setDoc({
      ...e.getDocument(),
      nodes: [
        {
          ...createGroupNode({ x: 0, y: 0, width: 300, height: 200 }),
          id: "reference-frame",
          name: "Poster",
          isFrame: true,
        },
        {
          ...createRectNode({ x: 20, y: 20, width: 100, height: 40 }),
          id: "reference-a",
          name: "Heading",
          parentId: "reference-frame",
        },
        {
          ...createRectNode({ x: 20, y: 100, width: 100, height: 40 }),
          id: "reference-b",
          name: "Button",
          parentId: "reference-frame",
        },
      ],
    });
    e.selectExactly(["reference-a"]);
    useDesignStore.setState({ agentPanelOpen: true });
  });
  const chip = page.getByTestId("agent-context-badge");
  await chip.getByText("@Heading", { exact: true }).waitFor();
  assert.equal(
    await chip.evaluate((element) =>
      Boolean(element.closest("form.agent-composer")),
    ),
    true,
  );
  assert.equal(await chip.locator("svg.lucide-layers").count(), 1);
  await page.evaluate(() => window.__vooEditor.selectExactly(["reference-frame"]));
  await chip.getByText("@Poster", { exact: true }).waitFor();
  assert.equal(await chip.locator("svg.lucide-frame").count(), 1,
    "A selected Frame uses the canvas Frame icon");
  assert.equal(await chip.locator("svg.lucide-layers").count(), 0);
  await page.evaluate(() => window.__vooEditor.selectExactly(["reference-a"]));
  await chip.getByText("@Heading", { exact: true }).waitFor();
  assert.equal(await chip.locator("svg.lucide-layers").count(), 1);
  const input = page.locator("form.agent-composer textarea");
  await input.fill("Make these green");
  await page.evaluate(() =>
    window.__vooEditor.selectExactly(["reference-a", "reference-b"]),
  );
  await chip.getByText("@2 selected objects", { exact: true }).waitFor();
  assert.equal(await chip.locator("svg.lucide-layers").count(), 1);
  assert.equal(await input.inputValue(), "Make these green");
  await input.press("Enter");
  await page.waitForFunction(() => window.__capturedAgentRequests.length > 0);
  const sent = await page.evaluate(
    () =>
      window.__capturedAgentRequests[0].messages
        .filter((message) => message.role === "user")
        .at(-1).content,
  );
  assert.match(sent, /"nodeId":"reference-a"/);
  assert.match(sent, /"nodeId":"reference-b"/);
  assert.match(sent, /"frameId":"reference-frame"/);
  assert.match(sent, /Make these green/);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="agent-cancel"]'),
  );
  await page.getByTestId("agent-context-detach").click();
  await chip.waitFor({ state: "detached" });
  await page.evaluate(() =>
    window.__vooEditor.updateNode("reference-a", { name: "Renamed heading" }),
  );
  assert.equal(await chip.count(), 0);
  await page.evaluate(() => window.__vooEditor.selectExactly(["reference-b"]));
  await chip.getByText("@Button", { exact: true }).waitFor();
  await page.evaluate(() => window.__vooEditor.selectExactly([]));
  await chip.waitFor({ state: "detached" });
  await page.evaluate(() => window.__vooEditor.selectExactly(["reference-a"]));
  await chip.getByText("@Renamed heading", { exact: true }).waitFor();
  await tool("new_document", {
    width: 600,
    height: 400,
    name: "NextDocument",
    force: true,
  });
  await chip.waitFor({ state: "detached" });
  console.log(
    "Verified selection chips, multi-selection, prompt payload, detach, deselect, and document switching",
  );
});
