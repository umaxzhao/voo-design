// Unit checks that read dist/ run from `npm test`, which is invoked before
// `npm run build` on a clean install. Build the production bundle once when
// it is not already present. Vite must see NODE_ENV=production; a test-mode
// bundle inlines React dev warnings that look like unresolved imports.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = path.join(root, "dist/index.html");
const assetsDir = path.join(root, "dist/assets");

if (existsSync(indexHtml) && existsSync(assetsDir)) {
  process.exit(0);
}

const env = { ...process.env, NODE_ENV: "production" };
delete env.VITEST;
delete env.VITEST_POOL_ID;

const result = spawnSync("npm", ["run", "build"], {
  cwd: root,
  env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
