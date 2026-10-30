import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { withEditorBrowser } from "./editor-browser-fixture.mjs";
import { imageAudit } from "./image-audit-fixture.mjs";
import { basicAgentCases } from "./image-agent-basic-cases.mjs";
import { componentAgentCases } from "./image-agent-components-cases.mjs";
await withEditorBrowser(async ({
  page,
  tool
}) => {
  const audit = imageAudit(page, "agent-tools");
  const doc = () => page.evaluate(() => window.__vooEditor.getDocument());
  const node = id => page.evaluate(id => window.__vooEditor.getNode(id) ?? null, id);
  const call = tool;
  const context = {
    page,
    call,
    doc,
    node,
    image: null
  };
  const seed = async () => {
    context.image = await audit.seed();
    await page.evaluate(() => {
      const e = window.__vooEditor;
      e.setDoc({
        ...e.getDocument(),
        components: {},
        variablesV2: undefined,
        colorVariables: [],
        styles: undefined,
        comments: [],
        nodes: [...e.getDocument().nodes, ...[["a", 100, 100, "#ff0000"], ["b", 160, 120, "#0000ff"], ["c", 250, 140, "#ffff00"]].map(([id, x, y, fill]) => ({
          id,
          name: `Audit ${id.toUpperCase()}`,
          kind: "rect",
          x,
          y,
          width: 30,
          height: 30,
          fill,
          opacity: 1,
          visible: true
        })), {
          id: "text",
          kind: "text",
          x: 300,
          y: 160,
          width: 100,
          height: 30,
          text: "Hello audit",
          fontSize: 20,
          fill: "#000000",
          opacity: 1,
          visible: true
        }, {
          id: "frame",
          kind: "group",
          isFrame: true,
          x: 100,
          y: 240,
          width: 140,
          height: 80,
          fill: "#eeeeee",
          opacity: 1,
          visible: true
        }, {
          id: "child",
          kind: "rect",
          parentId: "frame",
          x: 110,
          y: 250,
          width: 30,
          height: 25,
          fill: "#123456",
          opacity: 1,
          visible: true
        }]
      });
      e.selectExactly(["a"]);
    });
  };
  const advertised = await page.evaluate(async () => (await import("/src/canvas/agent/canvas_tools.js")).CANVAS_TOOL_SCHEMAS.map(s => s.function.name));
  const blocked = {
    generate_image: "Requires the user's OPENAI_API_KEY for the requested Gen Image integration.",
    generate_image_web: "Requires the signed-in browser extension; the user selected API generation instead.",
    generate_vector: "Requires a configured live text-model provider; no credentials in isolated fixture.",
    edit_image: "Requires an actual configured image provider; local LaMa inference does not certify this provider tool.",
    stock_image: "Public Openverse search and third-party image loading are tested in the network probe."
  };
  const visited = new Set();
  const run = async (name, factory) => {
    visited.add(name);
    await audit.record(name, async () => {
      await seed();
      await factory();
      return {
        liveMcp: true,
        documentAssertion: true
      };
    });
  };
  for (const name of advertised.filter(name => !blocked[name] && !["new_document", "update_plan", "get_plan", "list_comments", "create_comment", "reply_comment", "resolve_comment", "delete_comment"].includes(name))) {
    await run(name, async () => {
      const cases = {
        ...basicAgentCases(context),
        ...componentAgentCases(context)
      };
      assert.equal(typeof cases[name], "function", `No positive scenario registered for ${name}`);
      await cases[name]();
    });
  }
  const createComment = () => call("create_comment", {
    x: 100,
    y: 100,
    body: "Audit comment",
    author: "Test"
  });
  for (const name of ["list_comments", "create_comment", "reply_comment", "resolve_comment", "delete_comment"]) await run(name, async () => {
    const created = await createComment();
    assert.equal(created.comment.messages[0].body, "Audit comment");
    if (name === "create_comment") return;
    if (name === "list_comments") {
      assert.equal((await call(name)).comments.length, 1);
      return;
    }
    const args = {
      commentId: created.comment.id,
      body: "Audit reply",
      resolved: true
    };
    await call(name, args);
    const comments = (await doc()).comments;
    if (name === "delete_comment") assert.equal(comments.length, 0);
    if (name === "reply_comment") assert.match(JSON.stringify(comments), /Audit reply/);
    if (name === "resolve_comment") assert.equal(comments[0].resolved, true);
  });
  for (const name of ["update_plan", "get_plan"]) await run(name, async () => {
    await call("update_plan", {
      steps: [{
        id: "audit",
        title: "Audit",
        status: "in_progress"
      }]
    });
    assert.equal((await call("get_plan")).plan.steps[0].id, "audit");
  });
  await run("new_document", async () => {
    await call("new_document", {
      width: 320,
      height: 240,
      name: "FreshAudit",
      force: true
    });
    assert.equal((await doc()).width, 320);
    assert.equal((await doc()).height, 240);
  });
  assert.equal(visited.size + Object.keys(blocked).length, advertised.length, "Every advertised MCP tool needs a result or an explicit blocker");
  await writeFile(`${process.env.VOO_IMAGE_AUDIT_DIR ?? "/private/tmp/voo-image-complete"}/agent-blockers.json`, JSON.stringify(blocked, null, 2));
  audit.finish();
});
