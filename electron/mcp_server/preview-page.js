import { startPreview } from "./preview-client.js";
import { PREVIEW_COPY } from "./preview-copy.js";
/** A read-only view of one relay session; no editor, storage or CLI connection. */
export function renderPreviewPage(nonce) {
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>VOO Preview</title>
<style nonce="${nonce}">
:root{color-scheme:dark;font:14px system-ui,sans-serif;color:#eee;background:#525252}
*{box-sizing:border-box}body{margin:0;overflow:hidden}main{position:fixed;inset:0;overflow:hidden;touch-action:none}
img{position:absolute;transform-origin:0 0;user-select:none;pointer-events:none;max-width:none}
header{position:fixed;top:12px;left:12px;right:12px;display:flex;align-items:center;gap:12px;pointer-events:none}
nav{display:flex;align-items:center;gap:8px;margin-left:auto;padding:6px;border:1px solid #ffffff26;border-radius:16px;background:#171717;pointer-events:auto}
button{min-width:48px;min-height:48px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}
button:hover{background:#ffffff14}button:focus-visible{outline:2px solid #e5b2ff;outline-offset:1px}
#status{padding:10px 14px;background:#171717;border-radius:12px;max-width:min(65ch,65vw);line-height:1.5}
</style><main tabindex="0"><img alt=""></main><header><span id="status" role="status"></span><nav>
<button id="out" aria-label="Zoom out">−</button><button id="fit">Fit</button><button id="in" aria-label="Zoom in">+</button>
</nav></header><script nonce="${nonce}">
const zh=navigator.language.startsWith('zh');
const copy=${JSON.stringify(PREVIEW_COPY)}[zh?'zh':'en'];
document.title=copy.title;document.documentElement.lang=zh?'zh':'en';
(${startPreview.toString()})(copy);
</script></html>`;
}
