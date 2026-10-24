import assert from "node:assert/strict";
import { test } from "vitest";
import { createCollabSession } from "../../src/canvas/collab/session.js";
import { MSG } from "../../src/canvas/collab/protocol.js";
import { createEditor, attachEditorBridge } from "./collab_test_helpers.js";

function transport() {
  const log = [];
  let handlers;
  return {
    log,
    connect: (_room, next) => {
      handlers = next;
      return {
        send: (_peer, wire) => log.push(JSON.parse(wire)),
        broadcast: (wire) => log.push(JSON.parse(wire)),
        close: () => {},
      };
    },
    get handlers() { return handlers; },
  };
}
function setup(userId = "guest") {
  const wire = transport();
  const session = createCollabSession({ connect: wire.connect, userId, setInterval: () => 0, clearInterval: () => {} });
  session.start("abcdefgh");
  const state = { images: {}, document: { nodes: [], pages: [], settings: {} } };
  const store = { getState: () => state };
  const editor = createEditor(store);
  attachEditorBridge(session, store, editor);
  return { wire, session, editor, store };
}

test("session tracks access; a view grant makes a joined guest read-only", () => {
  const { session, wire } = setup();
  session.setAccess("view");
  assert.equal(session.getSnapshot().readOnly, true);
  assert.ok(wire.log.some((message) => message.t === MSG.HELLO && message.access === "view"));
});

test("a read-only guest cannot broadcast free-canvas document edits", () => {
  const { session, editor, wire } = setup();
  session.setAccess("view");
  editor.edit({ nodes: [{ id: "layer-a" }], pages: [], settings: {} });
  assert.equal(wire.log.filter((message) => message.t === MSG.DOC).length, 0);
});

test("a host may grant view access and still edit", () => {
  const wire = transport();
  const session = createCollabSession({ connect: wire.connect, userId: "host", setInterval: () => 0, clearInterval: () => {} });
  session.start("abcdefgh", { viaLink: false });
  session.setAccess("view");
  assert.equal(session.getSnapshot().readOnly, false);
  assert.equal(session.getSnapshot().access, "view");
});
