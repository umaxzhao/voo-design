/** Converts ephemeral editor media into IPC-safe bytes for Remotion. */
const REMOTE_URL = /^https?:\/\//i;
const EPHEMERAL_URL = /^(?:blob:|data:)/i;

/** The container each sound filename says it is. */
const SOUND_MIME_BY_SUFFIX = new Map(
  [
    [".wav", "audio/wav"],
    [".wave", "audio/wav"],
    [".mp3", "audio/mpeg"],
    [".m4a", "audio/mp4"],
    [".ogg", "audio/ogg"],
    [".oga", "audio/ogg"],
    [".flac", "audio/flac"],
  ].map(([suffix, mime]) => [suffix, mime]),
);

function soundMimeByName(node) {
  const name = node.name ?? node.src ?? "";
  for (const [suffix, mime] of SOUND_MIME_BY_SUFFIX) {
    if (name.toLowerCase().endsWith(suffix)) return mime;
  }
  return "audio/mpeg";
}

function assetMime(node, blob) {
  if (blob.type && blob.type !== "application/octet-stream") return blob.type;
  if (node.kind === "video" || node.kind === "canvasInstance")
    return "video/mp4";
  if (node.kind === "audio") return soundMimeByName(node);
  if (node.kind === "model3d")
    return /\.obj$/i.test(node.name ?? node.src ?? "")
      ? "model/obj"
      : "model/gltf-binary";
  return "image/png";
}

async function sourceBlob(source, fetcher, signal) {
  if (source instanceof Blob) return source;
  if (typeof source !== "string" || !EPHEMERAL_URL.test(source))
    throw new TypeError("Motion media source is unavailable");
  const response = await fetcher(source, { signal });
  if (!response.ok) throw new Error("Motion media could not be read");
  return response.blob();
}

async function materializeSource(node, source, assets, options) {
  const { fetcher, signal, idFactory } = options;
  if (typeof source === "string" && REMOTE_URL.test(source)) return source;
  const blob = await sourceBlob(source, fetcher, signal);
  signal?.throwIfAborted();
  const id = idFactory();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("Motion media is empty");
  assets.push({ id, bytes, mime: assetMime(node, blob) });
  return id;
}

async function materializeNodes(nodes, assets, options) {
  const output = [];
  for (const node of nodes) {
    options.signal?.throwIfAborted();
    if (
      node.kind === "canvasInstance" &&
      node.instance?.playbackMode === "video"
    ) {
      const source = await options.resolveNodeSource(node);
      const videoSrc = await materializeSource(node, source, assets, options);
      output.push({
        ...node,
        instance: { ...node.instance, videoSrc },
      });
    } else if (["image", "video", "audio", "model3d"].includes(node.kind)) {
      const source = await options.resolveNodeSource(node);
      output.push({
        ...node,
        src: await materializeSource(node, source, assets, options),
      });
    } else {
      output.push(node);
    }
  }
  return output;
}

/** Materialize every nested canvas so no offscreen source silently disappears. */
export async function materializeMotionAssets(
  props,
  {
    resolveNodeSource,
    fetcher = fetch,
    signal,
    idFactory = () => crypto.randomUUID(),
  },
) {
  if (typeof resolveNodeSource !== "function")
    throw new TypeError("A Motion asset resolver is required");
  const options = { resolveNodeSource, fetcher, signal, idFactory };
  const assets = [];
  const nodes = await materializeNodes(props.nodes, assets, options);
  const canvases = {};
  for (const [id, canvas] of Object.entries(props.canvases ?? {})) {
    canvases[id] = {
      ...canvas,
      nodes: await materializeNodes(canvas.nodes, assets, options),
    };
  }
  return { props: { ...props, nodes, canvases }, assets };
}
