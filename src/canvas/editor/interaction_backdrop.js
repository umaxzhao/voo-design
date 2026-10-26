// SwiftShader/llvmpipe can spend hundreds of milliseconds per frame updating
// live CSS backdrop blurs over changing artwork. Use a gesture preview tier on
// those drivers; restore all settled UI styles without changing React state.
export const isSoftwareGpu = name => /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(String(name));
let software;
function softwareGpu() {
  if (software !== undefined) return software;
  software = false;
  if (typeof WebGL2RenderingContext === 'undefined' && typeof WebGLRenderingContext === 'undefined') return software;
  let gl;
  try {
    const canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const info = gl?.getExtension?.('WEBGL_debug_renderer_info');
    if (info) software = isSoftwareGpu(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  } catch { /* Unknown drivers retain the normal visual tier. */ }
  finally { try { gl?.getExtension?.('WEBGL_lose_context')?.loseContext(); } catch { /* Already lost. */ } }
  return software;
}
const ATTRIBUTE = 'data-voo-camera-preview';
export function createInteractionBackdrop(shouldOptimize = softwareGpu) {
  const states = new WeakMap(), roots = new WeakMap(), styled = new WeakSet();
  function release(ctx) {
    const state = states.get(ctx);
    if (!state) return;
    clearTimeout(state.timer);
    if (state.frame) cancelAnimationFrame(state.frame);
    if (state.active) {
      const record = roots.get(state.root);
      if (--record.count === 0) {
        if (record.previous == null) state.root.removeAttribute(ATTRIBUTE);
        else state.root.setAttribute(ATTRIBUTE, record.previous);
      }
    }
    states.delete(ctx);
  }
  function update(ctx, moving) {
    if (!moving) { release(ctx); return; }
    let state = states.get(ctx);
    const now = performance.now();
    const slowFrame = state && now - state.lastFrame > 24 && now - state.lastFrame < 400;
    if (!state) {
      const editor = ctx.canvas?.closest?.('[data-testid="design-editor"]');
      if (!editor) return;
      // The application header also blurs the moving workspace underneath.
      // Share one document tier so it cannot keep forcing full-page sampling.
      const root = editor.ownerDocument.documentElement ?? editor;
      state = { root, revision: 0, frame: 0, software: shouldOptimize(), active: false };
      states.set(ctx, state);
    }
    state.lastFrame = now;
    if (!state.active && (state.software || slowFrame)) {
      const root = state.root, doc = root.ownerDocument;
      if (!styled.has(doc)) {
        const style = doc.createElement('style');
        style.textContent = `[${ATTRIBUTE}],[${ATTRIBUTE}] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}`;
        doc.head.append(style); styled.add(doc);
      }
      let record = roots.get(root);
      if (!record) { record = { count: 0, previous: root.getAttribute(ATTRIBUTE) }; roots.set(root, record); }
      if (!record.count) record.previous = root.getAttribute(ATTRIBUTE);
      record.count++;
      root.setAttribute(ATTRIBUTE, '');
      state.active = true;
    }
    clearTimeout(state.timer);
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    const revision = ++state.revision;
    state.timer = setTimeout(() => {
      state.frame = requestAnimationFrame(() => {
        state.frame = 0;
        if (state.revision === revision) release(ctx);
      });
    }, 400);
  }
  return { update, release };
}
export const interactionBackdrop = createInteractionBackdrop();
