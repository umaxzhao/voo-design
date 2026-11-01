import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/** One portable, configurable home for generated browser evidence. */
export function editorArtifactPath(name) {
  const root = resolve(process.env.VOO_BROWSER_EVIDENCE_DIR || join(tmpdir(), "voo-editor-browser-evidence"));
  const destination = resolve(root, name);
  const inside = relative(root, destination);
  if (isAbsolute(name) || inside.startsWith("..") || isAbsolute(inside)) {
    throw new Error("Browser evidence must stay inside its configured temporary directory");
  }
  mkdirSync(dirname(destination), { recursive: true });
  return destination;
}
