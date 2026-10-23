import fs from "fs";
import path from "path";

const projectRoot = "/Users/tt/teamwork_projects/voo_design";
const iconsJsxPath = path.join(projectRoot, "src/canvas/icons.jsx");
const lucideMainPath = path.join(projectRoot, "node_modules/lucide-react/dist/esm/lucide-react.mjs");

// Step 1: Build Lucide export map
const lucideContent = fs.readFileSync(lucideMainPath, "utf8");
const lucideExportRegex = /export\s+\{([^}]+)\}\s+from\s+["\x27]([^"\x27]+)["\x27];/g;
const lucideComponentToFile = new Map();
let m;
while ((m = lucideExportRegex.exec(lucideContent)) !== null) {
  const filePath = m[2];
  const items = m[1].split(",");
  for (const item of items) {
    const parts = item.trim().split(/\s+as\s+/);
    if (parts.length === 2) {
      lucideComponentToFile.set(parts[1], filePath);
    }
  }
}

// Step 2: Parse icons.jsx
const iconsContent = fs.readFileSync(iconsJsxPath, "utf8");

// Find all `export { ... } from "lucide-react";`
const lucideReExports = [];
const reExportRegex = /export\s+\{([^}]+)\}\s+from\s+["\x27]lucide-react["\x27];/g;
while ((m = reExportRegex.exec(iconsContent)) !== null) {
  const items = m[1].split(",");
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+as\s+/);
    const orig = parts[0].trim();
    const alias = parts.length > 1 ? parts[1].trim() : orig;
    lucideReExports.push({ orig, alias });
  }
}

// Find all `export function IconX(...) { ... }`
const functionRegex = /export\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{([\s\S]*?\n\})/g;
const customFunctions = [];
while ((m = functionRegex.exec(iconsContent)) !== null) {
  const name = m[1];
  const body = m[2];
  customFunctions.push({ name, body });
}

// Find all `export const IconX = ...;`
const constRegex = /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*([^;]+);/g;
const customConsts = [];
while ((m = constRegex.exec(iconsContent)) !== null) {
  const name = m[1];
  const target = m[2].trim();
  customConsts.push({ name, target });
}

// Find alias exports: `export { IconA as IconB, ... };`
const aliasBlockRegex = /export\s+\{([^}]+)\};/g;
const aliasExports = [];
while ((m = aliasBlockRegex.exec(iconsContent)) !== null) {
  const items = m[1].split(",");
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+as\s+/);
    aliasExports.push({
      orig: parts[0].trim(),
      alias: parts.length > 1 ? parts[1].trim() : parts[0].trim()
    });
  }
}

// Find raw icon data exports: `export { __iconData as IconImageNode } from ...`
const rawNodeRegex = /export\s+\{\s*__iconData\s+as\s+([A-Za-z0-9_]+)\s*\}\s+from\s+["\x27]([^"\x27]+)["\x27];/g;
const rawNodes = [];
while ((m = rawNodeRegex.exec(iconsContent)) !== null) {
  rawNodes.push({ alias: m[1], from: m[2] });
}

// Load __iconData for all Lucide re-exports
async function run() {
  const resolvedLucideIcons = [];
  for (const re of lucideReExports) {
    const fileRel = lucideComponentToFile.get(re.orig);
    if (!fileRel) {
      console.warn("Could not find file for Lucide component:", re.orig);
      resolvedLucideIcons.push({
        orig: re.orig,
        alias: re.alias,
        error: "Not found in lucide-react export map"
      });
      continue;
    }
    const fullPath = path.resolve(projectRoot, "node_modules/lucide-react/dist/esm", fileRel);
    try {
      const mod = await import(fullPath);
      const iconData = mod.__iconData;
      resolvedLucideIcons.push({
        orig: re.orig,
        alias: re.alias,
        lucideName: iconData?.name || re.orig,
        size: iconData?.size || 24,
        node: iconData?.node || []
      });
    } catch (e) {
      console.warn("Failed to load icon module:", fullPath, e.message);
      resolvedLucideIcons.push({
        orig: re.orig,
        alias: re.alias,
        error: e.message
      });
    }
  }

  console.log("Total Lucide re-exports:", resolvedLucideIcons.length);
  console.log("Total custom functions:", customFunctions.length);
  console.log("Total consts:", customConsts.length);
  console.log("Total alias exports:", aliasExports.length);
  console.log("Total raw nodes:", rawNodes.length);

  // Write full extraction JSON
  const result = {
    lucideReExports: resolvedLucideIcons,
    customFunctions: customFunctions.map(f => ({ name: f.name, raw: f.body })),
    customConsts,
    aliasExports,
    rawNodes
  };

  fs.writeFileSync(
    "/Users/tt/teamwork_projects/voo_design/native_studio/.agents/teamwork/spec_miner_survey/icons_dump.json",
    JSON.stringify(result, null, 2)
  );
  console.log("Saved dump to icons_dump.json");
}

run().catch(console.error);
