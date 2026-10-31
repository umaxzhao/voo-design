import { randomBytes } from "node:crypto";
import { PREVIEW_COPY } from "./preview-copy.js";
import { renderPreviewPage } from "./preview-page.js";

/** Capability links grant screenshots only, never tool invocation or CLI access. */
export async function handlePreviewRequest(request, response, relay) {
  const match = /^\/preview\/([a-f0-9]{48})(\/snapshot)?$/.exec(request.url);
  if (!match) return false;
  const nonce = randomBytes(16).toString("base64");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'`);
  if (request.method !== "GET") { response.writeHead(405); response.end(); return true; }
  if (!relay?.getStatus || relay.getStatus().previewSession !== match[1]) {
    response.writeHead(410, { "Content-Type": "text/plain; charset=utf-8" });
    const locale = /^zh(?:-|,|;|$)/i.test(request.headers["accept-language"] ?? "") ? "zh" : "en";
    response.end(PREVIEW_COPY[locale].gone);
    return true;
  }
  if (!match[2]) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(renderPreviewPage(nonce));
    return true;
  }
  if (request.headers["sec-fetch-site"] === "cross-site") {
    response.writeHead(403); response.end(); return true;
  }
  try {
    const capture = await relay.capturePreview(match[1]);
    if (!capture?.dataUrl?.startsWith("data:image/png;base64,")) throw new Error("preview.empty");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(capture));
  } catch (error) {
    response.writeHead(error.message === "preview.expired" ? 410 : 503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error.message === "preview.expired" ? "preview.expired" : "preview.unavailable" }));
  }
  return true;
}
