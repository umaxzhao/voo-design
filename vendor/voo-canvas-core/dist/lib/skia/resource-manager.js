function toError(error, url) {
    return error instanceof Error
        ? error
        : new Error(`Unable to load Skia image resource: ${url}`);
}
/**
 * Decode a `data:` URL to bytes without going through `fetch`.
 *
 * `fetch` is governed by the CSP `connect-src` directive, which does not list
 * `data:` (see next.config.ts) — so fetching one throws "Failed to fetch" and
 * the image silently never decodes. Every image a Figma import produces is an
 * inline `data:` URL, which is why imported artwork rendered blank while the
 * DOM inspector thumbnail (an `<img>`, governed by the looser `img-src`) still
 * showed it. Decoding inline also skips a needless round-trip through the
 * network stack for payloads that are already in memory.
 */
export function decodeDataUrl(url) {
    const comma = url.indexOf(",");
    if (comma < 0)
        throw new Error(`Malformed data URL: ${url.slice(0, 32)}…`);
    const meta = url.slice(0, comma);
    const payload = url.slice(comma + 1);
    if (!/;base64$/i.test(meta)) {
        // Percent-encoded (non-base64) data URLs are rare for images but legal.
        const decoded = decodeURIComponent(payload);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i += 1)
            bytes[i] = decoded.charCodeAt(i);
        return bytes;
    }
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
export class SkiaResourceManager {
    constructor(canvasKit, onInvalidate) {
        this.canvasKit = canvasKit;
        this.onInvalidate = onInvalidate;
        this.images = new Map();
        this.videoFrames = new Map();
    }
    preloadImage(url) {
        const existing = this.images.get(url);
        if (existing)
            return existing.promise;
        const resource = {
            state: "loading",
            image: null,
            error: null,
            released: false,
            promise: Promise.resolve(null),
        };
        resource.promise = this.loadImage(url)
            .then((image) => {
            if (resource.released)
                image.delete();
            resource.state = "ready";
            resource.image = resource.released ? null : image;
            this.onInvalidate();
            return image;
        })
            .catch((error) => {
            const normalized = toError(error, url);
            resource.state = "error";
            resource.error = normalized;
            this.onInvalidate();
            throw normalized;
        });
        this.images.set(url, resource);
        return resource.promise;
    }
    getImage(url) {
        const resource = this.images.get(url);
        if (!resource) {
            void this.preloadImage(url).catch(() => undefined);
            return null;
        }
        return resource.image;
    }
    getError(url) {
        return this.images.get(url)?.error ?? null;
    }
    updateVideoFrame(id, source) {
        const image = this.canvasKit.MakeImageFromCanvasImageSource(source);
        if (!image)
            throw new Error(`Skia could not capture video frame: ${id}`);
        const previous = this.videoFrames.get(id);
        this.videoFrames.set(id, image);
        previous?.delete();
        this.onInvalidate();
    }
    getVideoFrame(id) {
        return this.videoFrames.get(id) ?? null;
    }
    releaseVideoFrame(id) {
        this.videoFrames.get(id)?.delete();
        this.videoFrames.delete(id);
        this.onInvalidate();
    }
    async waitForImages(urls, timeoutMs) {
        const uniqueUrls = [...new Set(urls.filter(Boolean))];
        if (uniqueUrls.length === 0)
            return;
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`Skia resources did not load within ${timeoutMs}ms`)), timeoutMs);
        });
        try {
            await Promise.race([
                Promise.all(uniqueUrls.map((url) => this.preloadImage(url))),
                timeout,
            ]);
        }
        finally {
            if (timeoutId !== undefined)
                clearTimeout(timeoutId);
        }
    }
    releaseImage(url) {
        const resource = this.images.get(url);
        if (!resource)
            return;
        resource.released = true;
        resource.image?.delete();
        this.images.delete(url);
    }
    dispose() {
        for (const resource of this.images.values())
            resource.image?.delete();
        this.images.clear();
        for (const frame of this.videoFrames.values())
            frame.delete();
        this.videoFrames.clear();
    }
    async loadImage(url) {
        const bytes = url.startsWith("data:")
            ? decodeDataUrl(url)
            : await this.fetchImageBytes(url);
        const image = this.canvasKit.MakeImageFromEncoded(bytes);
        if (!image)
            throw new Error(`Skia could not decode image: ${url}`);
        return image;
    }
    async fetchImageBytes(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Skia image request failed (${response.status}): ${url}`);
        }
        return response.arrayBuffer();
    }
}
//# sourceMappingURL=resource-manager.js.map