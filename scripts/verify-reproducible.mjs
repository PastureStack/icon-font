import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputs = [
  "fonts/pasturestack-icons.svg",
  "fonts/pasturestack-icons.ttf",
  "fonts/pasturestack-icons.woff",
  "fonts/pasturestack-icons.woff2",
  "style.css",
  "style.scss",
  "variables.scss",
  "codepoints.json",
  "source-manifest.json",
  "demo.html"
];

function build() {
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Build failed");
}

async function hashes() {
  return Object.fromEntries(await Promise.all(outputs.map(async (relative) => [
    relative,
    createHash("sha256").update(await readFile(path.join(root, relative))).digest("hex")
  ])));
}

build();
const first = await hashes();
build();
const second = await hashes();
const mismatches = outputs.filter((relative) => first[relative] !== second[relative]);
if (mismatches.length) throw new Error(`Non-reproducible outputs: ${mismatches.join(", ")}`);

console.log(`Reproducibility passed: ${outputs.length} generated files matched byte-for-byte.`);
