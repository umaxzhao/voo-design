import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const revision = git("rev-parse", "HEAD");
const dirty = Boolean(git("status", "--porcelain"));
const output = process.argv[2]
  ? resolve(process.argv[2])
  : join(tmpdir(), `voo-bundle-${revision.slice(0, 12)}.json`);
const chunks = [];

// Analyze actual minified production chunks without replacing dist/ or writing
// generated reports into the repository. Keep this distinct from FPS evidence.
await build({
  root,
  configFile: join(root, "vite.config.js"),
  logLevel: "error",
  build: { write: false },
  plugins: [{
    name: "editor-bundle-evidence",
    generateBundle(_options, bundle) {
      for (const [file, item] of Object.entries(bundle)) {
        if (item.type !== "chunk") continue;
        chunks.push({
          file, bytes: Buffer.byteLength(item.code), gzipBytes: gzipSync(item.code).length,
          isEntry: item.isEntry, imports: item.imports, dynamicImports: item.dynamicImports,
          modules: Object.entries(item.modules).map(([id, module]) => ({
            id: isAbsolute(id) ? relative(root, id) : id,
            bytes: module.renderedLength,
          })).sort((a, b) => b.bytes - a.bytes),
        });
      }
    },
  }],
});

const byName = new Map(chunks.map(chunk => [chunk.file, chunk]));
const pending = chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.file);
const seen = new Set();
while (pending.length) {
  const file = pending.pop();
  if (seen.has(file) || !byName.has(file)) continue;
  seen.add(file);
  pending.push(...byName.get(file).imports);
}
const files = [...seen].sort();
const sum = key => files.reduce((total, file) => total + byName.get(file)[key], 0);
const report = {
  revision, dirty, analyzedAt: new Date().toISOString(), node: process.version,
  metric: "Sum of minified entry chunks and their static JS imports; excludes runtime-requested dynamic imports, CSS, fonts and WASM. Gzip sums independent chunks.",
  staticEntry: { files, bytes: sum("bytes"), gzipBytes: sum("gzipBytes") },
  chunks: chunks.sort((a, b) => b.bytes - a.bytes),
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ revision, dirty, bytes: report.staticEntry.bytes, gzipBytes: report.staticEntry.gzipBytes, report: output }));
