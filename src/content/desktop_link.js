/**
 * Extension half of the desktop link.
 *
 * The service worker dials the loopback socket and speaks LINK frames. A job
 * is accepted with link.ack (or refused with ok:false) inside the desktop's
 * ack window. The generation itself finishes later and is relayed.
 */

import { LINK } from "../shared/messages.js";
import { codedError } from "./errors.js";

export async function handleLinkFrame(frame, { send, routeJob, openPlatform } = {}) {
  if (!frame || typeof frame !== "object") return;
  switch (frame.type) {
    case LINK.PING:
      send?.({ type: LINK.PONG });
      return;
    case LINK.OPEN:
      await openPlatform?.(frame.platform);
      return;
    case LINK.JOB: {
      try {
        await routeJob?.(frame);
        send?.({ type: LINK.ACK, id: frame.id, ok: true });
      } catch (error) {
        send?.({
          type: LINK.ACK,
          id: frame.id,
          ok: false,
          error: error?.code || error?.message || "generic",
        });
      }
      return;
    }
    default:
  }
}

export function relayJobProgress(send, message) {
  if (!send || !message?.type) return false;
  send({ type: LINK.RELAY, name: message.type, payload: message });
  return true;
}

export function assertLinkedSocket(readyState) {
  if (readyState !== 1) throw codedError("desktopNotLinked");
}
