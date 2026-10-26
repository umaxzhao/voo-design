export const VOO_RUN_ORIGIN = "https://voo.run";

/** Compatibility alias for the server origin used by older modules. */
export const VPS_ORIGIN = VOO_RUN_ORIGIN;

/** The hosted collaboration signalling socket. */
export const HOSTED_SIGNALING_URL = "wss://voo.run/collab";

/** Where reference media is uploaded before a generation API pulls it by URL. */
export const MEDIA_UPLOAD_URL = `${VOO_RUN_ORIGIN}/upload`;

/** Hostnames served by the same web and signaling services. */
export const SITE_HOSTNAMES = ["voo.run", "www.voo.run"];
