import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import OfflineSessionNotice from "../../src/canvas/components/offline_session_notice.jsx";
import RoomProjectNotice from "../../src/canvas/components/room_project_notice.jsx";
import SharedDocumentLoading from "../../src/canvas/components/shared_document_loading.jsx";
import { STATUS } from "../../src/canvas/collab/session.js";
import { loadLocale } from "../../src/shared/i18n.js";

beforeEach(async () => {
  await loadLocale("en");
});

describe("OfflineSessionNotice component", () => {
  it("stays hidden when not in a room", () => {
    const state = { status: STATUS.OFF, roomId: null };
    const html = renderToStaticMarkup(<OfflineSessionNotice state={state} graceMs={0} />);
    expect(html).toBe("");
  });

  it("stays hidden when host (not joined via link)", () => {
    const state = {
      status: STATUS.ACTIVE,
      roomId: "room-1",
      joinedViaLink: false,
      receivedDocument: false,
      peers: [],
    };
    const html = renderToStaticMarkup(<OfflineSessionNotice state={state} graceMs={0} />);
    expect(html).toBe("");
  });

  it("stays hidden when peers are present", () => {
    const state = {
      status: STATUS.ACTIVE,
      roomId: "room-1",
      joinedViaLink: true,
      receivedDocument: false,
      peers: [{ peerId: "peer-remote", self: false }],
    };
    const html = renderToStaticMarkup(<OfflineSessionNotice state={state} graceMs={0} />);
    expect(html).toBe("");
  });

  it("renders offline notice after grace period for link joiner in empty room", async () => {
    const state = {
      status: STATUS.ACTIVE,
      roomId: "room-1",
      joinedViaLink: true,
      receivedDocument: false,
      peers: [{ peerId: "peer-self", self: true }],
    };
    // graceMs=0 immediately triggers notice render
    const html = renderToStaticMarkup(<OfflineSessionNotice state={state} graceMs={0} />);
    expect(html).toContain('data-testid="offline-session-notice"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Dismiss");
  });

  it("renders localized notice in Chinese", async () => {
    await loadLocale("zh");
    const state = {
      status: STATUS.ACTIVE,
      roomId: "room-1",
      joinedViaLink: true,
      receivedDocument: false,
      peers: [],
    };
    const html = renderToStaticMarkup(<OfflineSessionNotice state={state} graceMs={0} />);
    expect(html).toContain("关闭提示");
    await loadLocale("en");
  });
});

describe("RoomProjectNotice component", () => {
  it("stays hidden on web or when not in room", () => {
    const state = { status: STATUS.OFF, roomId: null };
    expect(renderToStaticMarkup(<RoomProjectNotice state={state} isDesktop={false} />)).toBe("");
    const liveState = { status: STATUS.ACTIVE, roomId: "room-1" };
    expect(renderToStaticMarkup(<RoomProjectNotice state={liveState} isDesktop={false} />)).toBe("");
  });

  it("renders save-to-project prompt on desktop", () => {
    const state = { status: STATUS.ACTIVE, roomId: "room-1" };
    const html = renderToStaticMarkup(<RoomProjectNotice state={state} isDesktop={true} />);
    expect(html).toContain('data-testid="room-project-notice"');
    expect(html).toContain("Save as project");
    expect(html).toContain("Dismiss");
  });
});

describe("SharedDocumentLoading component", () => {
  it("stays hidden when not in a room or when document received", () => {
    expect(renderToStaticMarkup(<SharedDocumentLoading state={{ status: STATUS.OFF }} />)).toBe("");
    const loadedState = {
      status: STATUS.ACTIVE,
      roomId: "room-1",
      joinedViaLink: true,
      receivedDocument: true,
      peers: [],
    };
    expect(renderToStaticMarkup(<SharedDocumentLoading state={loadedState} />)).toBe("");
  });

  it("shows loading modal while link visitor waits for initial document", () => {
    const waitingState = {
      status: STATUS.ACTIVE,
      roomId: "room-1",
      joinedViaLink: true,
      receivedDocument: false,
      peers: [{ peerId: "peer-host", self: false }],
    };
    const html = renderToStaticMarkup(<SharedDocumentLoading state={waitingState} />);
    expect(html).toContain('data-testid="shared-document-loading"');
    expect(html).toContain('data-testid="loading-modal"');
    expect(html).toContain("Loading the shared document…");
  });
});
