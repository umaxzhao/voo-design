/**
 * Pure Skill format and safety boundary.
 *
 * External Markdown is untrusted prompt text. This parser is deliberately not
 * an execution sandbox: runtime callers must still treat `instructions` as
 * data below system rules, tools, approvals, and undo contracts. A static
 * scan of the body is never a substitute for that runtime isolation.
 */

import {
  MAX_SKILL_PACKAGE_BYTES,
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_RESOURCE_BYTES,
} from "../../../shared/skill_package_limits.js";

export {
  MAX_SKILL_PACKAGE_BYTES,
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_RESOURCE_BYTES,
};
export const MAX_SKILL_BYTES = 64 * 1024;
export const MAX_SKILL_INSTRUCTIONS = 32 * 1024;
export const MAX_SKILL_TRIGGERS = 32;
const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
  "triggers",
  "version",
]);

function fail(code, detail) {
  return { ok: false, error: { code, detail } };
}

function scalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^['"].*['"]$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseFrontmatter(lines) {
  const fields = {};
  let nestedKey = null;
  let block = null;

  const finishBlock = () => {
    if (!block) return;
    const content = block.lines.join(block.style === ">" ? " " : "\n").trim();
    fields[block.key] = content;
    block = null;
  };

  for (const line of lines) {
    if (block && !line.trim()) {
      block.lines.push("");
      continue;
    }
    if (block && /^\s{2,}/.test(line)) {
      block.lines.push(line.trimStart());
      continue;
    }
    finishBlock();
    if (!line.trim()) continue;
    if (nestedKey === "triggers") {
      const listItem = line.match(/^\s{2,}-\s+(.+)$/);
      if (listItem) {
        fields.triggers.push(String(scalar(listItem[1])));
        continue;
      }
    }
    if (nestedKey === "metadata") {
      const metadataItem = line.match(
        /^\s{2,}([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/,
      );
      if (metadataItem) {
        if (Object.hasOwn(fields.metadata, metadataItem[1])) {
          return fail("duplicateField", metadataItem[1]);
        }
        fields.metadata[metadataItem[1]] = String(scalar(metadataItem[2]));
        continue;
      }
    }
    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!entry) return fail("frontmatterSyntax", line);
    const [, key, raw] = entry;
    if (!ALLOWED_FIELDS.has(key)) return fail("unknownField", key);
    if (Object.hasOwn(fields, key)) return fail("duplicateField", key);
    if (
      (raw === ">" || raw === "|-" || raw === "|") &&
      (key === "description" || key === "compatibility")
    ) {
      block = { key, style: raw[0], lines: [] };
      nestedKey = null;
    } else if (raw) {
      fields[key] = scalar(raw);
      nestedKey = null;
    } else if (key === "triggers") {
      fields[key] = [];
      nestedKey = key;
    } else if (key === "metadata") {
      fields[key] = {};
      nestedKey = key;
    } else {
      return fail("frontmatterSyntax", line);
    }
  }
  finishBlock();
  return { ok: true, fields };
}

function contentHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Parse and validate one Agent Skills SKILL.md document. */
export function parseExternalSkill(markdown, source = "upload") {
  if (typeof markdown !== "string") return fail("notText");
  if (new TextEncoder().encode(markdown).byteLength > MAX_SKILL_BYTES) {
    return fail("tooLarge", String(MAX_SKILL_BYTES));
  }
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return fail("frontmatterRequired");
  const parsed = parseFrontmatter(match[1].split(/\r?\n/));
  if (!parsed.ok) return parsed;
  const { fields } = parsed;
  const name = String(fields.name ?? "").trim();
  const description = String(fields.description ?? "").trim();
  const triggers = fields.triggers ?? [];
  const compatibility = String(fields.compatibility ?? "").trim();
  const body = match[2].trim();
  if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return fail("invalidName");
  }
  if (!description || description.length > 1024)
    return fail("invalidDescription");
  if (compatibility.length > 500) return fail("invalidCompatibility");
  if (!Array.isArray(triggers) || triggers.length > MAX_SKILL_TRIGGERS) {
    return fail("invalidTriggers");
  }
  if (triggers.some((item) => !item || item.length > 80))
    return fail("invalidTriggers");
  if (!body || body.length > MAX_SKILL_INSTRUCTIONS)
    return fail("invalidInstructions");
  return {
    ok: true,
    skill: {
      id: name,
      name,
      description,
      triggers,
      version: String(fields.metadata?.version ?? fields.version ?? "1"),
      author: fields.metadata?.author ?? null,
      license: String(fields.license ?? ""),
      compatibility,
      allowedTools: String(fields["allowed-tools"] ?? ""),
      metadata: fields.metadata ?? {},
      params: {},
      instructions: body,
      source,
      trust: "untrusted",
      contentHash: contentHash(markdown),
    },
  };
}

/** Parse one validated SKILL.md together with its package resources. */
export function parseSkillInput(input, source = "upload") {
  if (input?.error) return fail(input.error);
  const parsed = parseExternalSkill(input?.text, source);
  if (!parsed.ok) return parsed;
  const resources = input.resources ?? [];
  if (!Array.isArray(resources)) return fail("attachmentForbidden");
  const resourceFiles = [];
  for (const resource of resources) {
    if (
      typeof resource?.path !== "string" ||
      typeof resource.content !== "string" ||
      !["utf8", "base64"].includes(resource.encoding)
    ) {
      return fail("attachmentForbidden");
    }
    let actualSize;
    try {
      actualSize =
        resource.encoding === "utf8"
          ? new TextEncoder().encode(resource.content).byteLength
          : atob(resource.content).length;
    } catch {
      return fail("attachmentForbidden");
    }
    if (actualSize !== resource.size) return fail("attachmentForbidden");
    resourceFiles.push({ name: resource.path, size: actualSize });
  }
  const files = [
    { name: "SKILL.md", size: new TextEncoder().encode(input.text).byteLength },
    ...resourceFiles,
  ];
  const validation = validateSkillFiles(files);
  if (!validation.ok) return validation;
  return { ok: true, skill: { ...parsed.skill, resources } };
}

/** Reject unsafe package paths and oversized resources before persistence. */
export function validateSkillFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return fail("emptyPackage");
  if (files.length > MAX_SKILL_PACKAGE_FILES) return fail("tooLarge");
  const names = new Set();
  let totalBytes = 0;
  let manifestCount = 0;
  for (const file of files) {
    const name = String(file?.name ?? "");
    const parts = name.split("/");
    if (
      !name ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes("\0") ||
      parts.some((part) => !part || part === "." || part === "..") ||
      /^[A-Za-z]:/.test(name)
    ) {
      return fail("pathTraversal", name);
    }
    if (names.has(name.toLowerCase())) return fail("duplicateFile", name);
    names.add(name.toLowerCase());
    const isManifest = /^skill\.md$/i.test(parts.at(-1));
    if (isManifest) manifestCount += 1;
    const size = Number(file?.size ?? file?.bytes?.byteLength ?? 0);
    if (!Number.isSafeInteger(size) || size < 0) return fail("tooLarge");
    if (size > (isManifest ? MAX_SKILL_BYTES : MAX_SKILL_RESOURCE_BYTES)) {
      return fail("tooLarge", name);
    }
    totalBytes += size;
    if (totalBytes > MAX_SKILL_PACKAGE_BYTES) return fail("tooLarge");
  }
  if (manifestCount === 0) return fail("skillFileRequired");
  return { ok: true };
}

/** Detect duplicate ids/names before a collection is exposed to the agent. */
export function validateSkillCollection(skills) {
  const seen = new Set();
  for (const skill of skills ?? []) {
    const key = String(skill?.id ?? skill?.name ?? "").toLowerCase();
    if (!key) return fail("missingId");
    if (seen.has(key)) return fail("duplicateId", key);
    seen.add(key);
  }
  return { ok: true };
}
