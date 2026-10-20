/** Queues selection until its canvas engine has finished initializing. */
export class PendingCanvasSelectionManager {
  constructor() {
    this.pending = null;
  }

  set(canvasId, layerId = null, isBackground = false) {
    this.pending = {
      canvasId,
      layerId: layerId || null,
      isBackground: Boolean(isBackground),
    };
  }

  hasPending(canvasId) {
    return Boolean(
      this.pending && (!canvasId || this.pending.canvasId === canvasId),
    );
  }

  getPending(canvasId) {
    if (!this.pending || (canvasId && this.pending.canvasId !== canvasId))
      return null;
    return this.pending;
  }

  clear() {
    this.pending = null;
  }

  clearIfCanvasChanges(canvasId) {
    if (this.pending && this.pending.canvasId !== canvasId) {
      this.clear();
    }
  }

  consume(canvasId, engine) {
    if (!this.pending || this.pending.canvasId !== canvasId || !engine) {
      return false;
    }

    const { layerId, isBackground } = this.pending;
    this.pending = null;
    if (layerId) {
      engine.selectExactly([layerId]);
      return true;
    }
    if (isBackground) {
      engine.selectBackground?.();
      return true;
    }
    return false;
  }
}
