import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { startEditorBrowserServer } from "./editor-browser-server.mjs";
import { startLoopbackSignaling } from "../../electron/lan-loopback-signaling.js";

let signal = await startLoopbackSignaling();
const editor = await startEditorBrowserServer();
const browser = await chromium.launch({ headless: true });
const contexts = [];
try {
  async function editorPage() {
    const context = await browser.newContext(); contexts.push(context);
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.goto(`${editor.origin}/?voo-test=1`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("editor-top-bar").waitFor();
    await page.keyboard.press("Control+n");
    await page.waitForFunction(() => window.__vooEditor?.getDocument);
    await page.evaluate(async () => {
      const { createCollabSession } = await import("/src/canvas/collab/session.js");
      const { createLoopbackTransport } = await import("/src/canvas/collab/loopback_transport.js");
      const { createDocumentBridge } = await import("/src/canvas/collab/document_bridge.js");
      const { useDesignStore } = await import("/src/store/design_store.js");
      const { getImageBlobMap, getImageDataUrls, putImages } = await import("/src/canvas/store/db.js");
      const e = window.__vooEditor;
      e.setDoc({ ...e.getDocument(), isCanvasRoot: true, nodes: [] });
      window.startLoopbackAudit = ({ url, identity, room, secret, token }) => {
        const connect = (id, handlers) => {
          window.auditTransport = createLoopbackTransport(id, handlers, {
            url, token, initialAccess: identity === "host" ? "edit" : undefined,
          });
          return window.auditTransport;
        };
        const session = createCollabSession({ connect, userId: identity, connectionId: identity });
        window.auditSession = session;
        window.auditDetach = createDocumentBridge({ session, engine: e, store: useDesignStore,
          db: { getImageBlobMap, getImageDataUrls, putImages } });
        session.start(room, { secret, viaLink: identity !== "host" });
        return session.getSnapshot().link;
      };
    });
    return page;
  }
  const [host, guest] = await Promise.all([editorPage(), editorPage()]);
  const share = host.getByRole("button", { name: "Share", exact: true });
  await share.click();
  await host.getByText("Online link", { exact: true }).waitFor();
  await host.getByText("Local network link", { exact: true }).waitFor();
  await host.getByText("Unavailable", { exact: true }).waitFor();
  await share.click();
  const url = `ws://127.0.0.1:${signal.port}`;
  const link = await host.evaluate(({ url, room, secret, token }) => window.startLoopbackAudit({ url, identity: "host", room, secret, token }),
    { url, room: signal.room, secret: signal.guestToken, token: signal.hostToken });
  const parsed = new URL(link);
  await guest.evaluate(({ url, room, secret }) => window.startLoopbackAudit({ url, identity: "guest", room, secret, token: secret }), {
    url, room: parsed.searchParams.get("r"), secret: new URLSearchParams(parsed.hash.slice(1)).get("k"),
  });
  await Promise.all([
    host.waitForFunction(() => window.auditSession?.isPeerKnown("guest")),
    guest.waitForFunction(() => window.auditSession?.isPeerKnown("host")),
  ]);
  await guest.evaluate(async () => {
    const { onRemoteStroke } = await import("/src/canvas/collab/stroke_bus.js");
    window.auditStrokes = [];
    window.auditOffStroke = onRemoteStroke(stroke => window.auditStrokes.push(stroke));
  });
  await host.evaluate(async () => {
    const { MSG } = await import("/src/canvas/collab/protocol.js");
    const { emitLocalStroke } = await import("/src/canvas/collab/stroke_bus.js");
    window.auditSession.broadcast(MSG.CURSOR, { peerId: "host", cursor: { x: 12, y: 34 } });
    emitLocalStroke({ nodeId: "paint-node", points: [{ x: 3, y: 4 }] });
  });
  await guest.waitForFunction(() => window.auditSession.getSnapshot().peers.some(peer => peer.peerId === "host" && peer.cursor?.x === 12));
  await guest.waitForFunction(() => window.auditStrokes.some(stroke => stroke.nodeId === "paint-node"));
  async function add(page, id, x) {
    await page.evaluate(async ({ id, x }) => {
      const { createRectNode } = await import("/src/canvas/editor/scene_model.js");
      const e = window.__vooEditor, doc = e.getDocument();
      e.setDoc({ ...doc, nodes: [...doc.nodes, { ...createRectNode({ x, y: 50, width: 40, height: 40, fill: "#ff0000" }), id }] });
    }, { id, x });
  }
  await add(host, "from-host", 80);
  await guest.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(node => node.id === "from-host"));
  const hostHistory = await host.evaluate(() => window.__vooEditor.getCurrentHistoryIndex());
  await add(guest, "from-guest", 180);
  await host.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(node => node.id === "from-guest"));
  assert.equal(await host.evaluate(() => window.__vooEditor.getCurrentHistoryIndex()), hostHistory,
    "a remote edit must not add to the host undo stack");
  const nodes = await Promise.all([host, guest].map(page => page.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id).sort())));
  assert.deepEqual(nodes[0], ["from-guest", "from-host"]);
  assert.deepEqual(nodes[1], nodes[0]);
  await host.evaluate(() => window.__vooEditor.undo());
  const afterUndo = await host.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id).sort());
  assert.deepEqual(afterUndo, ["from-guest"], "local Undo must preserve the remote node");
  await guest.waitForFunction(() => !window.__vooEditor.getDocument().nodes.some(node => node.id === "from-host"));
  await host.evaluate(() => window.__vooEditor.redo());
  await guest.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(node => node.id === "from-host"));
  assert.deepEqual(await host.evaluate(() => window.__vooEditor.getDocument().nodes.map(node => node.id).sort()), nodes[0]);
  await host.evaluate(() => { window.auditTransport.setAccess("view"); window.auditSession.setAccess("view"); });
  await guest.waitForFunction(() => window.auditSession.getSnapshot().readOnly === true);
  await host.evaluate(() => { window.auditTransport.setAccess("edit"); window.auditSession.setAccess("edit"); });
  await guest.waitForFunction(() => window.auditSession.getSnapshot().readOnly === false);
  const downloadPromise = host.waitForEvent("download");
  const snapshot = await host.evaluate(async () => {
    const { exportRoomSnapshot } = await import("/src/canvas/store/share_actions.js");
    return exportRoomSnapshot();
  });
  const download = await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith(".json"));
  assert.deepEqual(snapshot.document.nodes.map(node => node.id).sort(), nodes[0]);
  const savedSnapshot = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.deepEqual(savedSnapshot.document.nodes.map(node => node.id).sort(), nodes[0]);
  const port = signal.port;
  const credentials = { room: signal.room, hostToken: signal.hostToken, guestToken: signal.guestToken };
  await signal.close();
  await Promise.all([host, guest].map(page => page.waitForFunction(() => window.auditSession.getSnapshot().status === "connecting")));
  signal = await startLoopbackSignaling({ port, ...credentials });
  await Promise.all([
    host.waitForFunction(() => window.auditSession.isPeerKnown("guest")),
    guest.waitForFunction(() => window.auditSession.isPeerKnown("host")),
  ]);
  await add(host, "after-reconnect", 280);
  await guest.waitForFunction(() => window.__vooEditor.getDocument().nodes.some(node => node.id === "after-reconnect"));
  await guest.evaluate(() => window.auditOffStroke());
  for (const page of [host, guest]) await page.evaluate(() => { window.auditDetach(); window.auditSession.stop(); });
  console.log(JSON.stringify({ passed: "two loopback browser editors exchange nodes through the existing document bridge", nodes }));
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  await editor.close();
  await signal.close();
}
