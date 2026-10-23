#!/usr/bin/env python3
"""Read-only extractor for Chromium "simple cache" HTTP responses.

Chromium simple cache data files (Cache_Data/<hash>_0) hold, after a fixed
24-byte block header and a NUL-terminated key, the raw response body, followed
(after the body) by the serialized response header block that begins with
"HTTP/1.1 ". The body length equals content-length; the body starts immediately
after the key and content-encoding is applied (usually `br`).

This tool finds every entry whose body is brotli/gzip-compressed or plain text,
decompresses it (via node's zlib, invoked once per file for brotli), writes the
result to an output directory, and emits an index JSON mapping
original URL -> dumped file + metadata.

Never writes to the cache directory. Usage:
  python3 extract_chromium_cache.py <cache_data_dir> <out_dir>
"""
import os
import sys
import json
import gzip
import subprocess
import collections

CACHE_SUFFIXES = ("_0", "_1", "_2", "_s")


def parse_block(path):
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError:
        return None
    if len(data) < 24:
        return None
    key_len = int.from_bytes(data[0x0C:0x10], "little")
    if not (0 < key_len < 1 << 20) or 0x18 + key_len > len(data):
        return None
    raw_key = data[0x18:0x18 + key_len].split(b"\x00", 1)[0]
    try:
        key = raw_key.decode("utf-8")
    except UnicodeDecodeError:
        key = raw_key.decode("latin-1")
    parts = key.split("/", 2)
    url = parts[2] if len(parts) == 3 and parts[0].isdigit() else key

    # header block sits at the end and starts with "HTTP/1.1 "
    h = data.rfind(b"HTTP/1.1 ")
    if h <= 0x18 + key_len:
        return None
    header_end = data.find(b"\x00\x00", h)
    if header_end < 0:
        header_end = len(data)
    tokens = data[h:header_end].split(b"\x00")
    headers = {}
    for t in tokens[1:]:
        if b":" in t:
            k, v = t.split(b":", 1)
            headers[k.strip().decode("latin-1").lower()] = v.strip().decode("latin-1")

    body = data[0x18 + key_len:h]
    return {"file": os.path.basename(path), "url": url, "headers": headers,
            "body": body, "block_len": len(data)}


def brotli_decompress_many(items):
    """items: list of (path, body) -> dict path->bytes|None using node zlib."""
    script = r"""
const fs = require('fs'), z = require('zlib');
let input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let out = {};
for (const [name, file, off] of input) {
  try {
    const b = fs.readFileSync(file);
    out[name] = z.brotliDecompressSync(b.slice(off)).toString('base64');
  } catch (e) { out[name] = null; }
}
console.log(JSON.stringify(out));
"""
    tmp_in = "/tmp/_br_in.json"
    tmp_js = "/tmp/_br_dec.js"
    with open(tmp_in, "w") as fh:
        json.dump(items, fh)
    with open(tmp_js, "w") as fh:
        fh.write(script)
    res = subprocess.run(["node", tmp_js, tmp_in], capture_output=True)
    if res.returncode != 0:
        print(res.stderr.decode()[:500], file=sys.stderr)
        return {}
    import base64
    raw = json.loads(res.stdout)
    return {k: (base64.b64decode(v) if v else None) for k, v in raw.items()}


def main():
    cache_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    entries = []
    for name in os.listdir(cache_dir):
        p = os.path.join(cache_dir, name)
        if not os.path.isfile(p) or not name.endswith(CACHE_SUFFIXES):
            continue
        e = parse_block(p)
        if e:
            entries.append(e)

    # group by URL, keep the largest block (most recent complete copy)
    by_url = {}
    for e in entries:
        cur = by_url.get(e["url"])
        if not cur or e["block_len"] > cur["block_len"]:
            by_url[e["url"]] = e

    br_items = []
    plain = []
    for url, e in by_url.items():
        enc = (e["headers"].get("content-encoding") or "").lower()
        ct = (e["headers"].get("content-type") or "").lower()
        if enc == "br":
            br_items.append((url, os.path.join(cache_dir, e["file"]),
                             0x18 + len(_key_bytes(cache_dir, e["file"]))))
        else:
            plain.append((url, e, enc, ct))

    print(f"blocks: {len(entries)}, unique urls: {len(by_url)}, brotli: {len(br_items)}")
    decoded = brotli_decompress_many(br_items) if br_items else {}

    index = []
    skipped = collections.Counter()

    def ext_for(ct, url):
        if "javascript" in ct or "ecmascript" in ct or url.split("?")[0].endswith(".js"):
            return "js"
        if "css" in ct:
            return "css"
        if "json" in ct:
            return "json"
        if "html" in ct:
            return "html"
        if "wasm" in ct:
            return "wasm"
        if "svg" in ct:
            return "svg"
        return None

    def write_out(url, ct, data, src, transport):
        ext = ext_for(ct, url)
        if not ext:
            skipped[ct] += 1
            return
        base = url.split("?")[0].rstrip("/").split("/")[-1] or "index"
        base = "".join(c if c.isalnum() or c in "._-@" else "_" for c in base)
        if len(base) > 120:
            base = base[:80] + "_" + str(abs(hash(url)) % 10 ** 8)
        fn = base
        n = 1
        while os.path.exists(os.path.join(out_dir, fn)):
            fn = f"{n}-{base}"
            n += 1
        with open(os.path.join(out_dir, fn), "wb") as fh:
            fh.write(data)
        index.append({"url": url, "file": fn, "bytes": len(data),
                      "content_type": ct, "transport": transport,
                      "source_block": src})

    for url, f, off in br_items:
        data = decoded.get(url)
        if data is None:
            skipped["brotli-fail"] += 1
            continue
        e = by_url[url]
        write_out(url, e["headers"].get("content-type", ""), data, e["file"], "br")
    for url, e, enc, ct in plain:
        body = e["body"]
        data = None
        if enc == "gzip":
            try:
                data = gzip.decompress(body)
            except Exception:
                skipped["gzip-fail"] += 1
                continue
        elif not enc:
            data = body
        else:
            skipped[enc] += 1
            continue
        write_out(url, ct, data, e["file"], enc or "identity")

    with open(os.path.join(out_dir, "_index.json"), "w") as fh:
        json.dump(index, fh, indent=1)
    print(f"wrote {len(index)} files to {out_dir}")
    print("skipped:", dict(skipped))


def _key_bytes(cache_dir, name):
    with open(os.path.join(cache_dir, name), "rb") as fh:
        head = fh.read(0x18 + 4096)
    key_len = int.from_bytes(head[0x0C:0x10], "little")
    return head[0x18:0x18 + key_len].split(b"\x00", 1)[0]


if __name__ == "__main__":
    main()
