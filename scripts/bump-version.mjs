#!/usr/bin/env node
/**
 * Helper for bumping the project version after a meaningful change.
 *
 * Usage:
 *   node scripts/bump-version.mjs [patch|minor|major]
 *
 * Defaults to "patch". Updates package.json's "version" field in place.
 * The version is read by src/components/DocVersionBadge.tsx and by the
 * "What's new" toast (src/components/WhatsNewToast.tsx) at runtime, so
 * bumping it is the single source of truth for both.
 *
 * NPM aliases (see package.json scripts):
 *   npm run bump          → patch (0.2.0 → 0.2.1)
 *   npm run bump:minor    → minor (0.2.0 → 0.3.0)
 *   npm run bump:major    → major (0.2.0 → 1.0.0)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "package.json");

const kind = (process.argv[2] ?? "patch").toLowerCase();
if (!["patch", "minor", "major"].includes(kind)) {
  console.error(`Unknown bump kind: ${kind}. Use patch | minor | major.`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const current = pkg.version ?? "0.0.0";
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
if (!m) {
  console.error(`Cannot parse current version "${current}". Expected MAJOR.MINOR.PATCH.`);
  process.exit(1);
}
let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
if (kind === "major") { maj += 1; min = 0; pat = 0; }
else if (kind === "minor") { min += 1; pat = 0; }
else { pat += 1; }

const next = `${maj}.${min}.${pat}`;
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`✓ Version: ${current} → ${next}`);
console.log(`  Don't forget to add an entry to src/routes/documentation.changelog.tsx`);
