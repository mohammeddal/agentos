// A conservative reachability check. Reports candidates; never deletes files.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const source = new Set();
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "dist-types", "target", "gen"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (/\.(tsx?|css)$/.test(file) && !file.endsWith(".d.ts")) source.add(path.resolve(file));
  }
}
for (const directory of ["apps/desktop/src", "apps/desktop/server", "apps/cli/src", "packages"])
  collect(directory);
source.add(path.resolve("apps/desktop/vite.config.ts"));
const packages = new Map();
for (const name of fs.readdirSync("packages")) {
  const manifest = path.join("packages", name, "package.json");
  if (!fs.existsSync(manifest)) continue;
  const json = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (typeof json.exports === "string")
    packages.set(json.name, path.resolve(path.dirname(manifest), json.exports));
}
const roots = [
  "apps/desktop/src/main.tsx",
  "apps/desktop/vite.config.ts",
  "apps/cli/src/index.ts",
].map((p) => path.resolve(p));
roots.push(...packages.values(), ...[...source].filter((p) => p.endsWith(".test.ts")));
const seen = new Set(),
  broken = [];
function visit(file) {
  if (seen.has(file) || !source.has(file)) return;
  seen.add(file);
  const contents = fs.readFileSync(file, "utf8");
  const imports = ts
    .preProcessFile(contents, true, true)
    .importedFiles.map((item) => item.fileName);
  if (file.endsWith(".css"))
    for (const match of contents.matchAll(/@import\s+["']([^"']+)["']/g)) imports.push(match[1]);
  for (const specifier of imports) {
    if (packages.has(specifier)) {
      visit(packages.get(specifier));
      continue;
    }
    if (!specifier.startsWith(".")) continue;
    const base = path.resolve(path.dirname(file), specifier);
    const target = [
      base,
      base.replace(/\.js$/, ".ts"),
      base.replace(/\.js$/, ".tsx"),
      `${base}.ts`,
      `${base}.tsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ].find((p) => source.has(p));
    if (target) visit(target);
    else broken.push(`${path.relative(root, file)} -> ${specifier}`);
  }
}
roots.forEach(visit);
const unreachable = [...source]
  .filter((file) => !seen.has(file))
  .map((file) => path.relative(root, file));
console.log(
  JSON.stringify(
    {
      checkedFiles: source.size,
      reachableFiles: seen.size,
      brokenImports: broken,
      unreachableCandidates: unreachable,
    },
    null,
    2,
  ),
);
if (broken.length || unreachable.length) process.exitCode = 1;
