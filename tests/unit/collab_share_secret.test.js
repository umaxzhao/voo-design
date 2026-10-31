import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

// The share path obtains its session through a dynamic import and the store
// through another; both are mocked here so the real link-building code runs.
const { storeState, getCollabSession, startCollab } = vi.hoisted(() => ({
  storeState: { activeDocumentId: "doc-1" },
  getCollabSession: vi.fn(),
  startCollab: vi.fn(),
}));

vi.mock("../../src/canvas/collab/use_collab.js", () => ({
  getCollabSession,
  startCollab,
}));
vi.mock("../../src/store/design_store.js", () => ({
  useDesignStore: { getState: () => storeState },
}));

import { createShareActions, shareWorkflow } from "../../src/canvas/store/share_actions.js";
import {
  accessFromLink,
  roomSecretFromLink,
  roomUrl,
} from "../../src/canvas/collab/room.js";

const ROOM_ID = "23456789abcdefghjkmn";
const SECRET = "abcdefghijklmnopqrstuv"; // 22 base64url characters

/** A session whose snapshot exposes the secret-bearing link a real one has. */
function fakeSession({ access = "edit", joinedViaLink = false, link = true } = {}) {
  return {
    access,
    joinedViaLink,
    getSnapshot() {
      return {
        roomId: ROOM_ID,
        access: this.access,
        joinedViaLink: this.joinedViaLink,
        link: link ? roomUrl(ROOM_ID, undefined, this.access, SECRET) : null,
      };
    },
  };
}

function fakeStore() {
  const set = (patch) => Object.assign(storeState, patch);
  const get = () => storeState;
  return { actions: createShareActions(set, get), set, get };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["roomId", "roomCreatedAt", "shareLoading", "shareError", "lastShareUrl", "shareWorkflow"]) {
    delete storeState[key];
  }
  storeState.activeDocumentId = "doc-1";
});

test("a hosted room shares the session link, which carries the room secret", async () => {
  const session = fakeSession();
  getCollabSession.mockReturnValue(session);
  startCollab.mockImplementation(async (roomId, access) => {
    session.access = access ?? session.access;
    return roomId;
  });
  const { actions, get } = fakeStore();

  const link = await actions.shareWorkflow("edit");

  assert.match(link, new RegExp(`/r/${ROOM_ID}#k=${SECRET}$`));
  assert.equal(roomSecretFromLink(link), SECRET);
  assert.equal(get().lastShareUrl, link);
});

test("a view grant keeps ?access=view before the #k secret", async () => {
  const session = fakeSession();
  getCollabSession.mockReturnValue(session);
  startCollab.mockImplementation(async (roomId, access) => {
    session.access = access ?? session.access;
    return roomId;
  });
  const { actions } = fakeStore();

  const link = await actions.shareWorkflow("view");

  assert.match(link, new RegExp(`/r/${ROOM_ID}\\?access=view#k=${SECRET}$`));
  assert.equal(accessFromLink(link), "view");
  assert.equal(roomSecretFromLink(link), SECRET);
});

test("re-sharing a room joined by link reuses its secret-bearing link", async () => {
  const session = fakeSession({ access: "view", joinedViaLink: true });
  getCollabSession.mockReturnValue(session);
  const { actions } = fakeStore();

  const link = await actions.shareWorkflow("edit");

  assert.match(link, new RegExp(`\\?access=view#k=${SECRET}$`));
  assert.equal(startCollab.mock.calls.length, 0);
});

test("the module-level shareWorkflow returns the secret-bearing link too", async () => {
  const session = fakeSession();
  getCollabSession.mockReturnValue(session);
  startCollab.mockImplementation(async (roomId) => roomId);

  const link = await shareWorkflow("edit");

  assert.equal(roomSecretFromLink(link), SECRET);
});

test("a session with no published link falls back to the plain room URL", async () => {
  // A peer on an older build has no snapshot link; the fallback keeps the old
  // behaviour (no #k) rather than inventing a secret it does not own.
  const session = fakeSession({ link: false });
  getCollabSession.mockReturnValue(session);
  startCollab.mockImplementation(async (roomId) => roomId);
  const { actions } = fakeStore();

  const link = await actions.shareWorkflow("edit");

  assert.equal(link, roomUrl(ROOM_ID, undefined, "edit"));
  assert.equal(roomSecretFromLink(link), null);
});
