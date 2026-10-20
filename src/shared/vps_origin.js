/**
 * The VPS ("la") runs what a serverless host cannot: the long-lived collaboration signalling socket
 * and the raw media upload that feeds generation APIs. voo.run itself is the Vercel site, so these
 * two live on their own hostname; everything else stays under voo.run.
 */
export const VPS_ORIGIN = "https://la.voo.run";

/** The hosted collaboration signalling socket. */
export const HOSTED_SIGNALING_URL = "wss://la.voo.run/collab";

/** Where reference media is uploaded before a generation API pulls it by URL. */
export const MEDIA_UPLOAD_URL = `${VPS_ORIGIN}/upload`;

/** Hostnames that serve the site itself and therefore have no signalling socket of their own. */
export const SITE_HOSTNAMES = ["voo.run", "www.voo.run"];
