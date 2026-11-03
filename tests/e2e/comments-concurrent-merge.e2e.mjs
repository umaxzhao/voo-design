import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";
import { editorArtifactPath } from "./editor-test-artifacts.mjs";
import { startLoopbackSignaling } from "../../electron/lan-loopback-signaling.js";

const server = await startEditorBrowserServer(), relay = await startLoopbackSignaling();
const browser = await chromium.launch({ headless: true }), contexts = [];
const expectedComments = {};
const out = mkdtempSync(editorArtifactPath("comments-concurrent-merge/run-"));
mkdirSync(out, { recursive: true });
const observations = {};
try {
  async function setup(identity) {
    const context = await browser.newContext(); contexts.push(context);
    await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(`${server.origin}/?voo-test=1`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("editor-top-bar").waitFor();
    await page.keyboard.press("Control+n");
    await page.waitForFunction(() => window.__vooEditor?.getDocument);
    await page.evaluate(async ({ identity, port, room, token, secret }) => {
      const { createCollabSession } = await import("/src/canvas/collab/session.js");
      const { createLoopbackTransport } = await import("/src/canvas/collab/loopback_transport.js");
      const { createDocumentBridge } = await import("/src/canvas/collab/document_bridge.js");
      const { useDesignStore } = await import("/src/store/design_store.js");
      const db = await import("/src/canvas/store/db.js");
      const e = window.__vooEditor;
      const msg = id => ({ id, body: `original-${id}`, createdAt: 10, author: { name: "Owner" } });
      const thread = id => ({ id, x: 30, y: 40, createdAt: 10, resolved: false, author: { name: "Owner" }, messages: [msg(id)] });
      e.setDoc({ ...e.getDocument(), nodes: [], comments: [thread("one"), thread("two")] });
      window.commentGate = { hold: false, pending: [] };
      const session = createCollabSession({ userId: identity, connectionId: identity,
        connect: (id, handlers) => {
          const transport = createLoopbackTransport(id, handlers, { url: `ws://127.0.0.1:${port}`, token,
            initialAccess: identity === "host" ? "edit" : undefined });
          return { ...transport, send(peer, wire) {
            if (window.commentGate.hold && typeof wire === "string" && JSON.parse(wire).t === "doc") {
              window.commentGate.pending.push({ peer, wire }); return;
            }
            transport.send(peer, wire);
          } };
        } });
      window.commentSession = session;
      window.commentDetach = createDocumentBridge({ session, engine: e, store: useDesignStore, db });
      session.start(room, { secret, viaLink: identity !== "host" });
      window.commentRelease = () => {
        window.commentGate.hold = false;
        const transport = window.commentGate.pending.splice(0);
        for (const entry of transport) session.sendRaw(entry.peer, entry.wire);
      };
    }, { identity, port: relay.port, room: relay.room,
      token: identity === "host" ? relay.hostToken : relay.guestToken, secret: relay.guestToken });
    return page;
  }
  const host = await setup("host"), guest = await setup("guest");
  await Promise.all([host.waitForFunction(() => window.commentSession.isPeerKnown("guest")),
    guest.waitForFunction(() => window.commentSession.isPeerKnown("host"))]);
  for (const scenario of ["different", "same"]) {
    for (const page of [host, guest]) await page.evaluate(() => { window.commentGate.hold = true; });
    const added = await Promise.all([host, guest].map((page, index) => page.evaluate(async ({ index, scenario }) => {
      const { addReply } = await import("/src/canvas/comments/comment_model.js");
      const e = window.__vooEditor;
      const next = addReply(e.getDocument(), index === 1 && scenario === "different" ? "two" : "one", {
        id: `${scenario}-${index}`, body: `reply-${index}`, author: { name: `peer-${index}` },
      });
      e.setDoc(next);
      return next.comments.flatMap(thread => thread.messages).find(message => message.id === `${scenario}-${index}`);
    }, { index, scenario })));
    await Promise.all([host, guest].map(page => page.waitForFunction(() => window.commentGate.pending.length > 0)));
    await Promise.all([host, guest].map(page => page.evaluate(() => window.commentRelease())));
    const contains = scenario => {
      const comments = window.__vooEditor.getDocument().comments;
      return comments.some(t => t.id === "one" && t.messages.some(m => m.id === `${scenario}-0`)) &&
        comments.some(t => t.id === (scenario === "different" ? "two" : "one") && t.messages.some(m => m.id === `${scenario}-1`));
    };
    await Promise.all([host, guest].map(page => page.waitForFunction(contains, scenario)));
    const comments = await Promise.all([host, guest].map(page => page.evaluate(() => window.__vooEditor.getDocument().comments)));
    assert.deepEqual(comments[0], comments[1]);
    for (const entry of added) assert.deepEqual(comments[0].flatMap(thread => thread.messages).find(message => message.id === entry.id), entry);
    expectedComments[scenario] = comments[0];
    observations[scenario] = { added, live: comments, loaded: [], cold: [] };
    for (const [index, page] of [host, guest].entries()) {
      const result = await page.evaluate(async ({ id }) => {
        const db = await import("/src/canvas/store/db.js"), doc = { ...window.__vooEditor.getDocument(), id };
        await db.saveDocument(doc); return { doc, loaded: await db.loadDocument(id) };
      }, { id: `comments-${scenario}-${index}` });
      assert.deepEqual(result.loaded.comments, result.doc.comments);
      observations[scenario].loaded[index] = result.loaded.comments;
    }
  }
  for (const page of [host, guest]) await page.evaluate(() => { window.commentDetach(); window.commentSession.stop(); });
  for (const [index, page] of [host, guest].entries()) {
    await page.reload({ waitUntil: "domcontentloaded" });
    const saved = await page.evaluate(async index => {
      const { loadDocument } = await import("/src/canvas/store/db.js");
      return Promise.all([loadDocument(`comments-different-${index}`), loadDocument(`comments-same-${index}`)]);
    }, index);
    for (const [doc, scenario] of saved.map((doc, i) => [doc, i ? "same" : "different"])) {
      assert.deepEqual(doc.comments, expectedComments[scenario]);
      observations[scenario].cold[index] = doc.comments;
      assert.ok(doc.comments.some(t => t.id === "one" && t.messages.some(m => m.id === `${scenario}-0`)));
      assert.ok(doc.comments.some(t => t.id === (scenario === "same" ? "one" : "two") && t.messages.some(m => m.id === `${scenario}-1`)));
    }
  }
  writeFileSync(`${out}/observations.json`, JSON.stringify(observations, null, 2));
  console.log(JSON.stringify({ passed: "both concurrent reply shapes converge through live loopback bridges and persist across reload", evidence: out }));
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close(); await relay.close(); await server.close();
}
