import { readFile } from "node:fs/promises";

// Embedded material is absent from npm's dependency graph and needs explicit notices.
const COMPONENTS = [
  {
    name: "openpencil-figma-schema",
    version: "f5bd2425b6491be58b43c398ac1343e4d8249fe6",
    license: "MIT",
    licenseFile: "openpencil.txt",
    sourceUrl: "https://github.com/open-pencil/open-pencil/blob/f5bd2425b6491be58b43c398ac1343e4d8249fe6/packages/kiwi/src/fig/schema/fig.kiwi",
    contentSha256: "8df57261637ee079f4802d32cd97b5fb3cee40234cea6876abfb8d2adcbe6f74",
    attribution: "Copyright (c) 2026 Danila Poyarkov; existing attribution: OpenPencil contributors.",
    modifications: "VOO stores the schema as compressed binary data; export adds nodeChangeOrder in memory. The decoder is maintained separately.",
  },
  {
    name: "opendesign-layout-guidance",
    version: "adapted",
    license: "Apache-2.0",
    licenseFile: "opendesign.txt",
    sourceUrl: "https://github.com/nexu-io/open-design/tree/12d970eacc8971150e3c76470d2a9afe16dc2ed1/skills",
    reviewedRevision: "12d970eacc8971150e3c76470d2a9afe16dc2ed1",
    originalImportRevision: "not recorded",
    attribution: "OpenDesign contributors (nexu-io/open-design).",
    modifications: "VOO condensed and adapted design guidance into layout presets and added VOO-specific dimensions, examples and constraints. The review revision identifies the license reference, not a recovered original import revision.",
  },
];

export async function generateBundledNotices() {
  return Promise.all(COMPONENTS.map(async ({ licenseFile, ...component }) => {
    const licenseText = await readFile(new URL(`./license-texts/${licenseFile}`, import.meta.url), "utf8");
    if (!licenseText.trim()) throw new Error(`Empty bundled license: ${licenseFile}`);
    return { ...component, licenseText };
  }));
}
