import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import UZIP from "uzip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const extDir = path.join(rootDir, "extension");

// Ensure background.js and content.js are compiled
const bgPath = path.join(extDir, "dist", "background.js");
const contentPath = path.join(extDir, "dist", "content.js");

if (!fs.existsSync(bgPath) || !fs.existsSync(contentPath)) {
  console.log("Compiling extension artifacts via scripts/build-extension.mjs...");
  execFileSync(process.execPath, [path.join(rootDir, "scripts", "build-extension.mjs")], {
    cwd: rootDir,
    stdio: "inherit",
  });
}

const manifestPath = path.join(extDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const PACKAGE_FILES = [
  "manifest.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "dist/background.js",
  "dist/content.js",
];

const archiveFiles = {};
for (const rel of PACKAGE_FILES) {
  const full = path.join(extDir, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing required extension file: ${rel}`);
  }
  archiveFiles[rel] = fs.readFileSync(full);
}

// Encode into ZIP using uzip
const zipBuffer = Buffer.from(UZIP.encode(archiveFiles));
const sha256 = crypto.createHash("sha256").update(zipBuffer).digest("hex");

const outZipName = `voo-design-extension-${manifest.version || "0.1.0"}.zip`;
const outZipPath = path.join(extDir, "dist", outZipName);
fs.writeFileSync(outZipPath, zipBuffer);

// Calculate derived Extension ID from manifest public key
const keyDer = Buffer.from(manifest.key, "base64");
const keyHash = crypto.createHash("sha256").update(keyDer).digest();
const derivedExtensionId = keyHash
  .subarray(0, 16)
  .toString("hex")
  .split("")
  .map((c) => {
    const code = c.charCodeAt(0);
    return code >= 97 ? String.fromCharCode(code + 10) : String.fromCharCode(code + 49);
  })
  .join("");

const meta = {
  name: manifest.name,
  version: manifest.version,
  manifestVersion: manifest.manifest_version,
  extensionId: derivedExtensionId,
  permissions: manifest.permissions,
  hostPermissions: manifest.host_permissions,
  zipFile: outZipName,
  zipPath: path.relative(rootDir, outZipPath),
  zipBytes: zipBuffer.length,
  sha256,
  packagedFiles: PACKAGE_FILES,
  timestamp: new Date().toISOString(),
};

const metaPath = path.join(extDir, "dist", "package-manifest.json");
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

console.log("=== VOO Design Web Images Extension Package ===");
console.log(`Identity:      ${meta.name} (v${meta.version})`);
console.log(`Extension ID:  ${meta.extensionId}`);
console.log(`ZIP Package:   ${meta.zipPath} (${meta.zipBytes} bytes)`);
console.log(`SHA-256:       ${meta.sha256}`);
console.log(`Permissions:   ${JSON.stringify(meta.permissions)} (strictly tabs only)`);
console.log("================================================");
