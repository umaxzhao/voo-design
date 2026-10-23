// Extract unique short string literals from minified JS bundles for feature vocabulary mining.
// Usage: node extract-strings.js <input.js> <output.txt>
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const out = new Set();
const re = /(["'])((?:\\.|(?!\1)[^\\\r\n]){2,120})\1/g;
let m;
while ((m = re.exec(src)) !== null) {
  let s = m[2];
  if (!/[A-Za-z]/.test(s)) continue;
  if (/^[a-z0-9_\-]{2,40}$/.test(s) && !/[-_ ]/.test(s)) continue; // skip bare identifiers
  out.add(s);
}
const lines = [...out].sort();
fs.writeFileSync(process.argv[3], lines.join("\n") + "\n");
console.log("unique strings:", lines.length);
