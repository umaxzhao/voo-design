// Cache policy is separate from the dirty provider, so stage raster tiles can
// consume the same {bucket,size,reset,keys} protocol without a second tile layer.
export class TilePictures {
  constructor(limit = 128) { this.limit = limit; this.pictures = new Map(); }
  clear() { for (const p of this.pictures.values()) p.delete(); this.pictures.clear(); }
  invalidate({ bucket, reset, keys }) {
    if (reset || bucket !== this.bucket) this.clear();
    this.bucket = bucket;
    for (let i = 0; i < keys.length; i += 2) {
      const key = `${keys[i]}:${keys[i + 1]}`;
      this.pictures.get(key)?.delete(); this.pictures.delete(key);
    }
  }
  draw(kit, canvas, dirty, rect, record) {
    this.invalidate(dirty);
    const size = dirty.size;
    const x0 = Math.floor(rect.minX / size), x1 = Math.floor(rect.maxX / size);
    const y0 = Math.floor(rect.minY / size), y1 = Math.floor(rect.maxY / size);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const key = `${x}:${y}`;
      const bounds = [x * size, y * size, (x + 1) * size, (y + 1) * size];
      let picture = this.pictures.get(key);
      if (!picture) {
        const recorder = new kit.PictureRecorder();
        try {
          const target = recorder.beginRecording(bounds);
          record(target, { minX: bounds[0], minY: bounds[1], maxX: bounds[2], maxY: bounds[3] });
          picture = recorder.finishRecordingAsPicture();
        } finally { recorder.delete(); }
      }
      this.pictures.delete(key); this.pictures.set(key, picture);
      canvas.save();
      canvas.clipRect(bounds, kit.ClipOp.Intersect, false);
      canvas.drawPicture(picture);
      canvas.restore();
      while (this.pictures.size > this.limit) {
        const oldest = this.pictures.keys().next().value;
        this.pictures.get(oldest).delete(); this.pictures.delete(oldest);
      }
    }
  }
}
