import { acquireAuthoring, createAuthoringTimeline } from "../authoring-timeline.js";
import { createLayoutNode } from "../canvas_tools_build_layout.js";
import { HtmlRenderer } from "./render_html.js";
import { htmlToNodes } from "./html_to_nodes.js";
export class CanvasStreamer {
  constructor({ editor, frame, signal, renderer = new HtmlRenderer(), convert = htmlToNodes, create = createLayoutNode, authoring, targetFrameId, commitName = "AI: Generate page" }) {
    Object.assign(this, { editor, frame, signal, renderer, convert, create });
    this.authoring = authoring ?? createAuthoringTimeline(editor, { signal });
    this.canvasId = (editor.getDocument?.() ?? editor.getDoc?.())?.canvasId;
    this.targetFrameId = targetFrameId; this.commitName = commitName;
    this.previous = new Map(); this.queue = Promise.resolve(); this.pending = null;
  }
  start() {
    this.release = acquireAuthoring(this.editor);
    try {
      this.restores = [];
      this.editor.beginBatch?.();
      for (const key of ["commit", "commitEditorDocument"]) {
        const original = this.editor[key];
        if (typeof original === "function") { this.editor[key] = () => {}; this.restores.push(() => { this.editor[key] = original; }); }
      }
      this.frameId = this.targetFrameId ?? this.create(this.editor, { type: "frame", name: "Generated page", x: this.frame.x || 0, y: this.frame.y || 0, width: this.frame.width, height: this.frame.height, fill: "#FFFFFF", htmlKey: "__html_frame__" });
    } catch (error) {
      this.finish({ commit: false });
      throw error;
    }
  }
  snapshot(html) {
    // Coalesce while layout is busy; never accumulate an unbounded DOM queue.
    this.pending = html;
    this.queue = this.queue.then(async () => {
      if (this.pending == null) return;
      this.signal?.throwIfAborted();
      const next = this.pending; this.pending = null;
      const doc = await this.renderer.render(next, this.frame, this.signal);
      this.authoring.assertCurrent();
      const nodes = this.convert(doc, this.frame);
      const steps = this.applySteps(nodes);
      this.authoring.begin(nodes.length);
      try {
        for (let step = steps.next(); !step.done; step = steps.next()) {
          await this.authoring.before(step.value);
          this.signal?.throwIfAborted();
          this.authoring.assertCurrent();
          const applied = steps.next();
          await this.authoring.after(applied.value);
        }
      } finally { steps.return(); }
    });
    // Keep rejected background work observed until flush propagates it.
    this.queue.catch(() => {});
    return this.queue;
  }
  apply(nodes) { for (const node of this.applySteps(nodes)) void node; }
  *applySteps(nodes) {
    const keys = new Set();
    for (const node of nodes) {
      if (keys.has(node.key)) throw new Error(`Duplicate HTML node key: ${node.key}`);
      keys.add(node.key);
    }
    const next = new Map();
    for (const node of nodes) {
      const parentId = next.get(node.parentKey)?.id ?? this.frameId;
      const previous = this.previous.get(node.key);
      let id = previous?.id;
      const changed = !previous || JSON.stringify(previous.node) !== JSON.stringify(node);
      if (changed) yield node;
      if (previous && (previous.node.type !== node.type || (node.type === "path" && previous.node.d !== node.d))) {
        this.editor.removeNode(id); id = null;
      }
      if (!id) {
        id = this.create(this.editor, node, parentId);
        // The shared layout creator defaults text wrapping to width.
        if (node.type === "text" && node.boxWidth !== undefined) this.editor.updateNode(id, { boxWidth: node.boxWidth });
      }
      else if (JSON.stringify(previous.node) !== JSON.stringify(node)) this.editor.updateNode(id, { ...node, boxWidth: node.type === "text" ? node.boxWidth ?? node.width : undefined, parentId });
      next.set(node.key, { id, node });
      // Publish ownership immediately so interruption never loses already placed nodes.
      this.previous.set(node.key, { id, node });
      if (changed) yield { ...node, id };
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
  finish({ commit = true } = {}) {
    if (this.finished) return;
    this.finished = true;
    this.authoring.finish();
    this.renderer.dispose();
    for (const restore of (this.restores || []).reverse()) restore();
    this.editor.endBatch?.();
    this.release?.();
    if (!commit) return;
    if (this.canvasId && (this.editor.getDocument?.() ?? this.editor.getDoc?.())?.canvasId !== this.canvasId) return;
    if (this.editor.commit) this.editor.commit(this.commitName);
    else this.editor.commitEditorDocument?.({ message: this.commitName });
  }
}
