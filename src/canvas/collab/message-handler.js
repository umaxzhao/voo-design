import { MSG, ProtocolError, decode, encode } from "./protocol.js";
import { decodeBinaryFrame } from "./chunking.js";
import { verifyHello } from "./room-security.js";

export function createMessageHandler({ roomSecret: getRoomSecret, verifiedPeers, whoIs, peerCaps,
  requestedDocs, presence, sendHello, dispatch, sink: getSink, joinedViaLink: isJoinedViaLink,
  getAccess, setAccess, transportTypes, announce, setReceivedDocument }) {
  const roomSecret = () => getRoomSecret();
  const sink = () => getSink();
  const joinedViaLink = () => isJoinedViaLink();
  const access = () => getAccess();
  return async function handleMessage(fromPeerId, raw) {
    // Bulk image bytes arrive as binary frames rather than JSON; everything
    // else — and everything from older builds — is a JSON string.
    if (typeof raw !== "string") {
      let frame;
      try {
        frame = decodeBinaryFrame(raw);
      } catch (error) {
        if (error instanceof ProtocolError) {
          console.warn("collab: dropped frame", error.reason, error.message);
          return;
        }
        throw error;
      }
      if (roomSecret() && !verifiedPeers.has(fromPeerId)) return;
      if (!whoIs.has(fromPeerId)) {
        if (roomSecret()) await sendHello(fromPeerId, { reply: true });
        else void sendHello(fromPeerId, { reply: true });
      }
      presence.touch(whoIs.get(fromPeerId));
      if (frame.meta.t === MSG.BLOB_DATA) {
        sink().onBlobChunk?.(frame.meta, frame.bytes, fromPeerId);
      }
      return;
    }
    let message;
    try {
      message = decode(raw);
    } catch (error) {
      // A peer on another build is a fact of life once links are shared; log
      // it and carry on rather than tearing the session down.
      if (error instanceof ProtocolError) {
        console.warn("collab: dropped message", error.reason, error.message);
        return;
      }
      throw error;
    }
    // If a non-greeting message arrives from an unknown connection, prompt them
    // with our HELLO so they can greet us back and complete presence.
    if (!whoIs.has(fromPeerId) && message.type !== MSG.HELLO) {
      void sendHello(fromPeerId, { reply: true });
    }
    // Attribute the connection to a person the first time it says who it is.
    if (message.type === MSG.HELLO) {
      if (roomSecret() && !(await verifyHello(roomSecret(), message))) return;
      verifiedPeers.add(fromPeerId);
      whoIs.set(fromPeerId, message.peerId);
      peerCaps.set(
        fromPeerId,
        new Set(Array.isArray(message.caps) ? message.caps : []),
      );
    }
    if (roomSecret() && !verifiedPeers.has(fromPeerId)) return;
    presence.touch(whoIs.get(fromPeerId));

    switch (message.type) {
      case MSG.HELLO:
        // A room's permission is decided by the host and announced in its
        // hello. A guest adopts it (a deep-link viewer has no query to read);
        // the host keeps whatever it chose. Adopting also re-greets peers so
        // the change propagates.
        if (message.access && joinedViaLink()) {
          const next = message.access === "view" ? "view" : "edit";
          if (access() !== next) {
            setAccess(next);
            void sendHello(null);
          }
        }
        presence.upsert(message.peerId, {
          name: message.name,
          colour: message.colour,
          avatarSeed: message.avatarSeed ?? null,
          workflowId: message.workflowId ?? null,
          // The channel is already open before the greeting arrives, so the
          // transport kind is known by now — attach it directly to this person.
          transport: transportTypes.get(fromPeerId),
        });
        // Two-way handshake guarantee: answer back so the sender has us in
        // their roster even if our initial onPeer hello was lost or raced.
        if (message.reply !== false) {
          void sendHello(fromPeerId, { reply: false });
        }
        if (roomSecret() && !requestedDocs.has(fromPeerId)) {
          requestedDocs.add(fromPeerId);
          dispatch(fromPeerId, encode(MSG.DOC_REQUEST, {}));
        }
        announce();
        break;
      case MSG.CURSOR:
        presence.setCursor(message.peerId, message.cursor ?? null);
        announce();
        break;
      case MSG.BYE:
        presence.remove(message.peerId);
        announce();
        break;
      case MSG.SUBGRAPH_TEMPLATE:
        sink().onSubgraphTemplate?.(message.template, fromPeerId);
        break;
      case MSG.DOC_REQUEST:
        sink().onDocRequest?.(fromPeerId);
        break;
      case MSG.DOC:
        setReceivedDocument(true);
        sink().onDocument?.(message, fromPeerId);
        break;
      case MSG.BLOB_HAVE:
        sink().onBlobHave?.(message.ids, fromPeerId);
        break;
      case MSG.BLOB_WANT:
        sink().onBlobWant?.(message.ids, fromPeerId);
        break;
      case MSG.BLOB_DATA:
        sink().onBlobData?.(message, fromPeerId);
        break;
      case MSG.STROKE:
        sink().onStroke?.(message, fromPeerId);
        break;
      default:
        break;
    }
  }
}
