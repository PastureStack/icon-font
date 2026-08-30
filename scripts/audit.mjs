import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenBrand = String.fromCharCode(114, 97, 110, 99, 104, 101, 114);
const personalDenylist = [
  Buffer.from("6368656e3231303139", "hex").toString("utf8"),
  Buffer.from("6368656e323130313940676d61696c2e636f6d", "hex").toString("utf8")
];
const expectedRootLicenseHash = "1d5afc26765f4da03ed7605f2944198b985dac1ddac0ec0b5ace57fe06b94330";
const expectedLucideLicenseHash = "b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57";
const expectedLucideTtfHash = "2ff7709e2f12f6ce07b2df9d3bad4120b622bfdb12c5c8eeaf5a713cf5bba233";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function filesUnder(directory, relative = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const childRelative = path.join(relative, entry.name);
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child, childRelative));
    else files.push(childRelative);
  }
  return files;
}

const files = await filesUnder(root);
const brandHits = [];
const personalHits = [];
for (const relative of files) {
  const normalized = relative.replaceAll("\\", "/");
  const buffer = await readFile(path.join(root, relative));
  const text = buffer.toString("latin1");
  if (normalized.toLowerCase().includes(forbiddenBrand) || text.toLowerCase().includes(forbiddenBrand)) {
    brandHits.push(normalized);
  }
  for (const denied of personalDenylist) {
    if (normalized.toLowerCase().includes(denied) || text.toLowerCase().includes(denied)) personalHits.push(normalized);
  }
}

if (brandHits.join(",") !== "README.md") {
  throw new Error(`Unexpected historical-brand match: ${brandHits.join(", ")}`);
}
const readme = await readFile(path.join(root, "README.md"), "utf8");
const readmeMatches = readme.toLowerCase().match(new RegExp(forbiddenBrand, "g")) ?? [];
const historicalBrand = `${forbiddenBrand[0].toUpperCase()}${forbiddenBrand.slice(1)}`;
const requiredIndependenceNotice = `PastureStack is an independent community effort to preserve, audit, and modernize the ${historicalBrand} 1.6 ecosystem. It is not affiliated with or endorsed by ${historicalBrand} Labs or SUSE.`;
const requiredUpstreamLink = `**Upstream:** [\`${forbiddenBrand}/icons\`](https://github.com/${forbiddenBrand}/icons).`;
if (readmeMatches.length !== 4 || !readme.includes(requiredIndependenceNotice) || !readme.includes(requiredUpstreamLink)) {
  throw new Error("README independence disclosure is missing or contains extra historical-brand references");
}
if (personalHits.length) {
  throw new Error(`Personal identity found in current files: ${[...new Set(personalHits)].join(", ")}`);
}

for (const disallowed of ["selection.json", "compatibility-baseline.json"]) {
  try {
    await access(path.join(root, disallowed));
    throw new Error(`Legacy outline artifact must not exist: ${disallowed}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

if (sha256(await readFile(path.join(root, "LICENSE"))) !== expectedRootLicenseHash) {
  throw new Error("Root LICENSE changed unexpectedly");
}
const lucideLicense = await readFile(path.join(root, "node_modules", "lucide-static", "LICENSE"));
const distributedLucideLicense = await readFile(path.join(root, "LICENSES", "LUCIDE.txt"));
if (sha256(lucideLicense) !== expectedLucideLicenseHash || !lucideLicense.equals(distributedLucideLicense)) {
  throw new Error("The distributed Lucide/Feather license notice is not an exact copy of the locked package license");
}
const lucideTtf = await readFile(path.join(root, "node_modules", "lucide-static", "font", "lucide.ttf"));
if (sha256(lucideTtf) !== expectedLucideTtfHash) throw new Error("Locked Lucide source font hash changed");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
if (
  packageJson.packageManager !== "npm@12.0.2" ||
  packageJson.engines?.node !== "24.20.0" ||
  packageJson.engines?.npm !== "12.0.2" ||
  packageJson.devEngines?.runtime?.version !== "24.20.0" ||
  packageJson.devEngines?.packageManager?.version !== "12.0.2"
) {
  throw new Error("The Node.js LTS and npm build toolchain must remain exactly pinned");
}
if (
  Object.keys(packageJson.allowScripts ?? {}).join(",") !== "ttf2woff2@8.0.1" ||
  packageJson.allowScripts["ttf2woff2@8.0.1"] !== true
) {
  throw new Error("Only the reviewed ttf2woff2 lifecycle script may be enabled");
}
if (packageJson.overrides?.ttf2woff2?.["node-gyp"] !== "13.0.1") {
  throw new Error("ttf2woff2 must use the maintained Node 24-compatible node-gyp release");
}
if (
  packageLock.lockfileVersion !== 3 ||
  packageLock.packages?.[""]?.name !== packageJson.name ||
  packageLock.packages?.[""]?.version !== packageJson.version ||
  packageLock.packages?.[""]?.license !== packageJson.license
) {
  throw new Error("package-lock.json root metadata does not match package.json");
}

const lifecycleScripts = [];
for (const [location, metadata] of Object.entries(packageLock.packages ?? {})) {
  if (!location) continue;
  if (!metadata.version || !metadata.resolved || !metadata.integrity?.startsWith("sha512-")) {
    throw new Error(`Incomplete locked package evidence: ${location}`);
  }
  const resolved = new URL(metadata.resolved);
  if (resolved.protocol !== "https:" || resolved.hostname !== "registry.npmjs.org") {
    throw new Error(`Unapproved package source: ${location} -> ${metadata.resolved}`);
  }
  if (metadata.hasInstallScript) lifecycleScripts.push(`${location}@${metadata.version}`);
}
if (lifecycleScripts.join(",") !== "node_modules/ttf2woff2@8.0.1") {
  throw new Error(`Unexpected package lifecycle scripts: ${lifecycleScripts.join(", ")}`);
}

const lockedVersion = (name) => packageLock.packages?.[`node_modules/${name}`]?.version;
if (lockedVersion("node-gyp") !== "13.0.1" || lockedVersion("glob") !== "13.0.6") {
  throw new Error("The native font build chain must use node-gyp 13 and glob 13");
}
if (lockedVersion("brace-expansion") !== "5.0.9") {
  throw new Error("brace-expansion 5.x must remain at the fully patched 5.0.9 release");
}
for (const obsolete of ["cacache", "make-fetch-happen", "ip-address"]) {
  if (lockedVersion(obsolete)) throw new Error(`Obsolete node-gyp 11 dependency remains: ${obsolete}`);
}
if (lockedVersion("tar") !== "7.5.22") {
  throw new Error("tar must remain at the audited 7.5.22 release");
}
const lucidePackage = JSON.parse(await readFile(path.join(root, "node_modules", "lucide-static", "package.json"), "utf8"));
if (packageJson.devDependencies["lucide-static"] !== "1.34.0" || lucidePackage.version !== "1.34.0" || lucidePackage.license !== "ISC") {
  throw new Error("Lucide package version or license metadata changed");
}

const manifest = JSON.parse(await readFile(path.join(root, "src", "icon-map.json"), "utf8"));
if (manifest.schemaVersion !== 1 || manifest.icons.length !== 108) throw new Error("Source manifest must contain 108 codepoints");
const codepoints = new Set(manifest.icons.map((entry) => entry.codepoint));
const aliases = manifest.icons.flatMap((entry) => entry.aliases);
if (codepoints.size !== 108 || aliases.length !== 116 || new Set(aliases).size !== 116) {
  throw new Error("Source manifest codepoints or aliases are incomplete");
}
const brand = manifest.icons.find((entry) => entry.codepoint === 0xe946);
if (!brand || brand.aliases.join(",") !== "pasture-stack" || brand.source.kind !== "pasturestack") {
  throw new Error("PastureStack brand glyph mapping is invalid");
}
if (manifest.icons.filter((entry) => entry.source.kind === "lucide").length !== 107) {
  throw new Error("All non-project-brand glyphs must use locked Lucide sources");
}

const neutralCompatibilitySources = {
  apple: "monitor-cog",
  docker: "package",
  github: "git-branch",
  kubernetes: "network",
  linux: "square-terminal",
  windows: "panels-top-left"
};
for (const [alias, expectedSource] of Object.entries(neutralCompatibilitySources)) {
  const entry = manifest.icons.find((candidate) => candidate.aliases.includes(alias));
  if (!entry || entry.source.kind !== "lucide" || entry.source.icon !== expectedSource) {
    throw new Error(`Compatibility identifier ${alias} is not mapped to its neutral source`);
  }
}

const generatedCodepoints = JSON.parse(await readFile(path.join(root, "codepoints.json"), "utf8"));
if (Object.keys(generatedCodepoints).length !== 116 || generatedCodepoints["pasture-stack"] !== 0xe946) {
  throw new Error("Generated compatibility codepoints are incomplete");
}
for (const entry of manifest.icons) {
  for (const alias of entry.aliases) {
    if (generatedCodepoints[alias] !== entry.codepoint) throw new Error(`Generated alias mismatch: ${alias}`);
  }
}

const sourceManifest = JSON.parse(await readFile(path.join(root, "source-manifest.json"), "utf8"));
if (sourceManifest.generatedFrom !== "lucide-static@1.34.0" || sourceManifest.lucideTtfSha256 !== expectedLucideTtfHash || sourceManifest.icons.length !== 108) {
  throw new Error("Generated source provenance manifest is invalid");
}
for (const entry of sourceManifest.icons) {
  if (!/^[0-9a-f]{64}$/.test(entry.sourceOutlineSha256)) throw new Error(`Invalid source hash at U+${entry.codepoint.toString(16)}`);
}

const ttf = await readFile(path.join(root, "fonts", "pasturestack-icons.ttf"));
const font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
const cmapCodepoints = new Set();
for (let index = 0; index < font.glyphs.length; index += 1) {
  const glyph = font.glyphs.get(index);
  for (const value of glyph.unicodes ?? []) cmapCodepoints.add(value);
}
if (cmapCodepoints.size !== 108 || !cmapCodepoints.has(0xe946)) {
  throw new Error(`Unexpected font cmap: ${cmapCodepoints.size} codepoints`);
}
for (const entry of manifest.icons) {
  const glyph = font.charToGlyph(String.fromCodePoint(entry.codepoint));
  const bounds = glyph.getBoundingBox();
  if (glyph.index === 0 || glyph.path.commands.length === 0 || bounds.x2 <= bounds.x1 || bounds.y2 <= bounds.y1) {
    throw new Error(`Empty or invalid generated glyph at U+${entry.codepoint.toString(16).toUpperCase()}`);
  }
}

console.log("Audit passed: 108 codepoints, 116 aliases, 107 Lucide-derived neutral functional glyphs, one original PastureStack mark, exact ISC/MIT notices, and no legacy outline manifest.");
