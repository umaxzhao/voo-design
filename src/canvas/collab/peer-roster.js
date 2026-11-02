export function createPeerRoster() {
  return {
    whoIs: new Map(),
    peerCaps: new Map(),
    verifiedPeers: new Set(),
    requestedDocs: new Set(),
    transportTypes: new Map(),
  };
}
