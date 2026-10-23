import { createLayoutNode } from '../canvas_tools_build_layout.js';
import { HtmlRenderer } from './render_html.js';
import { htmlToNodes } from './html_to_nodes.js';
export class CanvasStreamer {
  constructor({ editor, frame, signal, renderer = new HtmlRenderer(), convert = htmlToNodes, create = createLayoutNode }) {
    Object.assign(this, { editor, frame, signal, renderer, convert, create });
    this.previous = new Map(); this.queue = Promise.resolve(); this.pending = null;
  }
  start() {
    this.restores = [];
    this.editor.beginBatch?.();
    for (const key of ['commit', 'commitEditorDocument']) {
      const original = this.editor[key];
      if (typeof original === 'function') { this.editor[key] = () => {}; this.restores.push(() => { this.editor[key] = original; }); }
    }
    this.frameId = this.create(this.editor, { type: 'frame', name: 'Generated page', x: this.frame.x || 0, y: this.frame.y || 0, width: this.frame.width, height: this.frame.height, fill: '#FFFFFF', htmlKey: '__html_frame__' });
  }
  snapshot(html) {
    // Coalesce while layout is busy; never accumulate an unbounded DOM queue.
    this.pending = html;
    this.queue = this.queue.then(async () => {
      if (this.pending == null) return;
      this.signal?.throwIfAborted();
      const next = this.pending; this.pending = null;
      const doc = await this.renderer.render(next, this.frame, this.signal);
      this.apply(this.convert(doc, this.frame));
    });
    // Keep rejected background work observed until flush propagates it.
    this.queue.catch(() => {});
    return this.queue;
  }
  apply(nodes) {
    const next = new Map();
    for (const node of nodes) {
      if (next.has(node.key)) throw new Error(`Duplicate HTML node key: ${node.key}`);
      const parentId = next.get(node.parentKey)?.id ?? this.frameId;
      const previous = this.previous.get(node.key);
      let id = previous?.id;
      if (previous && (previous.node.type !== node.type || (node.type === 'path' && previous.node.d !== node.d))) {
        this.editor.removeNode(id); id = null;
      }
      if (!id) {
        id = this.create(this.editor, node, parentId);
        // The shared layout creator defaults text wrapping to width.
        if (node.type === 'text' && node.boxWidth !== undefined) this.editor.updateNode(id, { boxWidth: node.boxWidth });
      }
      else if (JSON.stringify(previous.node) !== JSON.stringify(node)) this.editor.updateNode(id, { ...node, boxWidth: node.type === 'text' ? node.boxWidth ?? node.width : undefined, parentId });
      next.set(node.key, { id, node });
    }
    for (const [key, value] of this.previous) if (!next.has(key)) this.editor.removeNode(value.id);
    if (this.editor.reorderNodeTo) {
      const doc = this.editor.getDocument?.() ?? this.editor.getDoc?.();
      const start = doc?.nodes?.findIndex(n => n.id === this.frameId);
      if (start >= 0) [...next.values()].forEach((entry, i) => this.editor.reorderNodeTo(entry.id, start + i + 1));
    }
    this.previous = next; this.editor.requestRender?.();
  }
  async flush() { await this.queue; }
  finish() {
    this.renderer.dispose();
    for (const restore of (this.restores || []).reverse()) restore();
    this.editor.endBatch?.();
    if (this.editor.commit) this.editor.commit('AI: Generate page');
    else this.editor.commitEditorDocument?.({ message: 'AI: Generate page' });
  }
}
