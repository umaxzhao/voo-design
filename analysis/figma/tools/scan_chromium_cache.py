#!/usr/bin/env python3
"""Read-only scanner for Chromium "simple cache" entries (Cache_Data).

Never writes to the cache directory. Emits an index (URL, content-type, size,
cache entry file) and optionally dumps cacheable text bodies (JS/CSS/JSON/HTML)
to an output directory under /tmp.

Usage:
  python3 scan_chromium_cache.py <cache_data_dir> <out_dir> [--dump]

Chromium simple cache data file layout (little-endian):
  0x00  uint64 magic 0xfcfb6d1ba7725c30
  0x08  uint32 version (5)
  0x0c  uint32 key_length
  0x10  uint64 key_hash
  0x18  key bytes: "<stream_id>/<index>/<url>"  (stream 1/0 is the response)
  then  uint32 stream_size, then serialized headers (NUL-separated),
        then response body.
"""
import os
import sys
import struct
import zlib
import gzip
import json
import collections

MAGIC = 0xFCFB6D1BA7725C30


def parse_entry(path):
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError:
        return None
    if len(data) < 24:
        return None
    magic, = struct.unpack_from("<Q", data, 0)
    if magic != MAGIC:
        return None
    key_len, = struct.unpack_from("<I", data, 0x0C)
    if not (0 < key_len < 1 << 20) or 0x18 + key_len > len(data):
        return None
    key = data[0x18:0x18 + key_len].split(b"\x00", 1)[0]
    try:
        key = key.decode("utf-8")
    except UnicodeDecodeError:
        key = key.decode("latin-1")
    # key is usually "1/0/https://..." ; skip stream prefix
    parts = key.split("/", 2)
    url = parts[2] if len(parts) == 3 and parts[0].isdigit() else key

    # body offset: search for first stream_size after key
    off = 0x18 + key_len
    body = data
    stream_size = None
    if off + 4 <= len(data):
        stream_size, = struct.unpack_from("<I", data, off)
        body = data[off + 4:]

    # headers are serialised with NUL separators; find content-type
    ctype = None
    encoding = None
    lo = body[:65536].lower()
    i = lo.find(b"content-type:")
    if i >= 0:
        j = body.find(b"\x00", i)
        ctype = body[i + 13:j].strip().decode("latin-1", "replace")
    i = lo.find(b"content-encoding:")
    if i >= 0:
        j = body.find(b"\x00", i)
        encoding = body[i + 17:j].strip().decode("latin-1", "replace")

    # locate end of headers: response headers block is followed by the body.
    # Chromium serialises headers NUL-separated then a NUL NUL then body.
    # Practical heuristic: headers start right after the 4-byte stream size at
    # body[0]; find double-NUL after the last known header.
    hdr_end = body.find(b"\x00\x00")
    while hdr_end != -1 and hdr_end < len(body) and hdr_end + 2 == body.find(b"\x00", hdr_end + 2) and False:
        break
    # fall back: body starts after the final header token we recognise
    payload = None
    if hdr_end != -1:
        payload = body[hdr_end + 2:]
    return {
        "file": os.path.basename(path),
        "url": url,
        "content_type": ctype,
        "content_encoding": encoding,
        "stream_size": stream_size,
        "raw_len": len(data),
        "payload": payload,
    }


def maybe_decompress(payload, encoding):
    if not payload:
        return None
    enc = (encoding or "").lower()
    try:
        if enc == "gzip":
            return gzip.decompress(payload)
        if enc == "deflate":
            return zlib.decompress(payload)
        if enc == "br":
            try:
                import brotli  # type: ignore
                return brotli.decompress(payload)
            except Exception:
                return None
        # zstd via system module if available
        if enc == "zstd":
            try:
                import zstandard  # type: ignore
                return zstandard.ZstdDecompressor().decompress(payload)
            except Exception:
                return None
    except Exception:
        return None
    return payload


TEXT_TYPES = ("javascript", "ecmascript", "text/css", "application/json",
              "text/html", "text/plain", "application/wasm", "source-map")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    cache_dir, out_dir = sys.argv[1], sys.argv[2]
    dump = "--dump" in sys.argv
    if dump:
        os.makedirs(out_dir, exist_ok=True)
    entries = []
    for name in os.listdir(cache_dir):
        p = os.path.join(cache_dir, name)
        if not os.path.isfile(p):
            continue
        if "_" not in name:
            continue
        e = parse_entry(p)
        if e:
            entries.append(e)
    hosts = collections.Counter()
    ctypes = collections.Counter()
    for e in entries:
        u = e["url"]
        host = u.split("/")[2] if "://" in u else u[:40]
        hosts[host] += 1
        ctypes[(e["content_type"] or "?")[:40]] += 1
    print(f"entries: {len(entries)}")
    print("hosts:", json.dumps(hosts.most_common(25), indent=0))
    print("content-types:", json.dumps(ctypes.most_common(25), indent=0))

    js = [e for e in entries
          if any(t in (e["content_type"] or "").lower() for t in TEXT_TYPES)]
    print(f"text-ish entries: {len(js)}")
    index_path = os.path.join(os.path.dirname(out_dir.rstrip('/')) or '.', "cache_index.jsonl")
    with open(index_path, "w") as fh:
        for e in entries:
            fh.write(json.dumps({k: v for k, v in e.items() if k != "payload"},
                                ensure_ascii=False) + "\n")
    print("index:", index_path)

    if dump:
        n = 0
        for e in js:
            payload = e["payload"]
            data = maybe_decompress(payload, e["content_encoding"]) if e["content_encoding"] else payload
            if not data:
                continue
            ext = "bin"
            ct = (e["content_type"] or "").lower()
            if "javascript" in ct or "ecmascript" in ct:
                ext = "js"
            elif "css" in ct:
                ext = "css"
            elif "json" in ct:
                ext = "json"
            elif "html" in ct:
                ext = "html"
            fn = os.path.join(out_dir, e["file"] + "." + ext)
            with open(fn, "wb") as fh:
                fh.write(data)
            n += 1
        print(f"dumped: {n} -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
