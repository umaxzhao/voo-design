import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const distDir = path.resolve("dist");
const assetsDir = path.join(distDir, "assets");

if (!fs.existsSync(distDir)) {
  console.error("dist directory does not exist!");
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const jsFiles = files.filter(f => f.endsWith(".js"));

let totalImportsChecked = 0;
const missingImports = [];
const allReferencedFiles = new Set();

// Check index.html references
const indexHtmlPath = path.join(distDir, "index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

const scriptMatches = [...indexHtml.matchAll(/src=["'](\.[^"']+)["']/g)];
for (const m of scriptMatches) {
  totalImportsChecked++;
  const target = path.resolve(distDir, m[1]);
  allReferencedFiles.add(target);
  if (!fs.existsSync(target)) {
    missingImports.push({ from: "index.html", importPath: m[1], resolved: target, type: "html_script" });
  }
}

const cssMatches = [...indexHtml.matchAll(/href=["'](\.[^"']+\.css)["']/g)];
for (const m of cssMatches) {
  totalImportsChecked++;
  const target = path.resolve(distDir, m[1]);
  allReferencedFiles.add(target);
  if (!fs.existsSync(target)) {
    missingImports.push({ from: "index.html", importPath: m[1], resolved: target, type: "html_css" });
  }
}

// Check CSS references (fonts, images)
const cssFiles = files.filter(f => f.endsWith(".css"));
for (const cssFile of cssFiles) {
  const cssPath = path.join(assetsDir, cssFile);
  const cssContent = fs.readFileSync(cssPath, "utf-8");
  const urlMatches = [...cssContent.matchAll(/url\(([^)]+)\)/g)];
  for (const m of urlMatches) {
    let cleanUrl = m[1].replace(/['"]/g, "").trim();
    if (cleanUrl.startsWith("data:")) continue;
    totalImportsChecked++;
    const resolved = path.resolve(assetsDir, cleanUrl);
    allReferencedFiles.add(resolved);
    if (!fs.existsSync(resolved)) {
      missingImports.push({ from: cssFile, importPath: cleanUrl, resolved, type: "css_url" });
    }
  }
}

for (const jsFile of jsFiles) {
  const filePath = path.join(assetsDir, jsFile);
  const code = fs.readFileSync(filePath, "utf-8");

  // Static imports: from "./..."
  const staticMatches = [...code.matchAll(/from\s*["'](\.[^"']+)["']/g)];
  for (const m of staticMatches) {
    const importPath = m[1];
    const resolved = path.resolve(assetsDir, importPath);
    totalImportsChecked++;
    allReferencedFiles.add(resolved);
    if (!fs.existsSync(resolved)) {
      missingImports.push({ from: jsFile, importPath, resolved, type: "static" });
    }
  }

  // Dynamic imports: import("./...")
  const dynamicMatches = [...code.matchAll(/import\s*\(\s*["'](\.[^"']+)["']\s*\)/g)];
  for (const m of dynamicMatches) {
    const importPath = m[1];
    const resolved = path.resolve(assetsDir, importPath);
    totalImportsChecked++;
    allReferencedFiles.add(resolved);
    if (!fs.existsSync(resolved)) {
      missingImports.push({ from: jsFile, importPath, resolved, type: "dynamic" });
    }
  }

  // Vite preload helper
  const preloadMatches = [...code.matchAll(/__vitePreload\(\(\)\s*=>\s*import\(["'](\.[^"']+)["']\)/g)];
  for (const m of preloadMatches) {
    const importPath = m[1];
    const resolved = path.resolve(assetsDir, importPath);
    totalImportsChecked++;
    allReferencedFiles.add(resolved);
    if (!fs.existsSync(resolved)) {
      missingImports.push({ from: jsFile, importPath, resolved, type: "preload" });
    }
  }

  // Worker / WASM / new URL references
  const urlMatches = [...code.matchAll(/new\s+URL\(["'](\.[^"']+)["'],\s*import\.meta\.url\)/g)];
  for (const m of urlMatches) {
    const importPath = m[1];
    const resolved = path.resolve(assetsDir, importPath);
    totalImportsChecked++;
    allReferencedFiles.add(resolved);
    if (!fs.existsSync(resolved)) {
      missingImports.push({ from: jsFile, importPath, resolved, type: "new_url" });
    }
  }
}

console.log("Integrity Check Summary:");
console.log(`- Checked ${jsFiles.length} JS files and ${cssFiles.length} CSS files in dist/assets`);
console.log(`- Checked ${totalImportsChecked} total module/asset references`);
console.log(`- Total unique target files referenced: ${allReferencedFiles.size}`);
console.log(`- Missing references (404 candidates): ${missingImports.length}`);

if (missingImports.length > 0) {
  console.error("FAIL: Missing files detected:", missingImports);
  process.exit(1);
} else {
  console.log("SUCCESS: All imports and asset references exist without 404s.");
}
