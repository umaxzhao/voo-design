/** Bounded LRU for immutable layout data. The byte budget also bounds large edits. */
export class TextLayoutCache {
  constructor(maxEntries = 4096, maxBytes = 8 * 1024 * 1024) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.entries = new Map();
    this.bytes = 0;
  }
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    const previous = this.entries.get(key);
    if (previous) {
      this.bytes -= previous.bytes;
      this.entries.delete(key);
    }
    const bytes = key.length * 2 + JSON.stringify(value).length * 2 + 128;
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      this.bytes -= this.entries.get(oldest).bytes;
      this.entries.delete(oldest);
    }
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
