import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import svg2ttf from "svg2ttf";
import { SVGIcons2SVGFontStream } from "svgicons2svgfont";
import ttf2woff from "ttf2woff";
import ttf2woff2 from "ttf2woff2";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "src", "icon-map.json"), "utf8"));
const family = "pasturestack-icons";
const assetVersion = "2.0.0-alpha.0-lucide-1.25.0";
const fixedTimestamp = Date.UTC(2026, 6, 18) / 1000;
const lucideRoot = path.join(root, "node_modules", "lucide-static");

if (manifest.schemaVersion !== 1 || manifest.icons.length !== 108) {
  throw new Error(`Expected schema 1 with 108 codepoints, found ${manifest.icons.length}`);
}

const lucidePackage = JSON.parse(await readFile(path.join(lucideRoot, "package.json"), "utf8"));
if (lucidePackage.name !== manifest.sourcePackage.name || lucidePackage.version !== manifest.sourcePackage.version || lucidePackage.license !== "ISC") {
  throw new Error("The locked Lucide source package does not match src/icon-map.json");
}

const lucideCss = await readFile(path.join(lucideRoot, "font", "lucide.css"), "utf8");
const lucideCodepoints = new Map(
  [...lucideCss.matchAll(/\.icon-([a-z0-9-]+)::before\s*\{\s*content:\s*"\\([0-9a-f]+)";\s*\}/gi)]
    .map((match) => [match[1], Number.parseInt(match[2], 16)])
);
const lucideTtf = await readFile(path.join(lucideRoot, "font", "lucide.ttf"));
const lucideFont = opentype.parse(lucideTtf.buffer.slice(lucideTtf.byteOffset, lucideTtf.byteOffset + lucideTtf.byteLength));
const lucideUnits = lucideFont.unitsPerEm;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadSource(entry) {
  if (entry.source.kind === "lucide") {
    const sourceCodepoint = lucideCodepoints.get(entry.source.icon);
    if (sourceCodepoint == null) throw new Error(`Lucide source icon not found: ${entry.source.icon}`);
    const glyph = lucideFont.charToGlyph(String.fromCodePoint(sourceCodepoint));
    if (!glyph || glyph.index === 0) throw new Error(`Lucide font glyph not found: ${entry.source.icon}`);
    const width = glyph.advanceWidth ?? lucideUnits;
    const pathData = glyph.getPath(0, lucideUnits, lucideUnits).toPathData(6);
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${lucideUnits}"><path d="${pathData}"/></svg>`,
      sourceOutlineSha256: sha256(pathData),
      sourceReference: `lucide-static@${lucidePackage.version}:${entry.source.icon}`
    };
  }

  if (entry.source.kind === "pasturestack") {
    const absolute = path.join(root, entry.source.file);
    const svg = await readFile(absolute, "utf8");
    if (!/^<svg[\s\S]*<path[\s\S]*<\/svg>\s*$/u.test(svg) || /<(script|image|use|text)\b|\b(?:href|onload)=/iu.test(svg)) {
      throw new Error(`Unsafe PastureStack SVG source: ${entry.source.file}`);
    }
    return {
      svg,
      sourceOutlineSha256: sha256(svg),
      sourceReference: entry.source.file
    };
  }

  throw new Error(`Unsupported source kind: ${entry.source.kind}`);
}

const icons = [];
for (const entry of [...manifest.icons].sort((left, right) => left.codepoint - right.codepoint)) {
  const source = await loadSource(entry);
  icons.push({ ...entry, ...source });
}

const uniqueCodepoints = new Set(icons.map((entry) => entry.codepoint));
const aliases = icons.flatMap((entry) => entry.aliases.map((name) => ({ name, codepoint: entry.codepoint })));
if (uniqueCodepoints.size !== 108 || aliases.length !== 116 || new Set(aliases.map(({ name }) => name)).size !== 116) {
  throw new Error("Compatibility codepoints and aliases must remain unique and complete");
}

const brand = icons.find((entry) => entry.codepoint === 0xe946);
if (!brand || brand.aliases.join(",") !== "pasture-stack" || brand.source.kind !== "pasturestack") {
  throw new Error("U+E946 must contain only the original PastureStack project mark");
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
  const entry = icons.find((candidate) => candidate.aliases.includes(alias));
  if (!entry || entry.source.kind !== "lucide" || entry.source.icon !== expectedSource) {
    throw new Error(`Compatibility identifier ${alias} must use the neutral ${expectedSource} symbol`);
  }
}

async function createSvgFont() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new SVGIcons2SVGFontStream({
      fontName: family,
      fontId: family,
      fontHeight: 1024,
      descent: 192,
      normalize: false,
      fixedWidth: false,
      preserveAspectRatio: true,
      round: 1000000,
      metadata: "Functional symbols derived from Lucide Icons under ISC/MIT; PastureStack mark under Apache-2.0",
      log: () => {}
    });

    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));

    for (const entry of icons) {
      const glyph = Readable.from([entry.svg]);
      glyph.metadata = {
        name: entry.aliases[0],
        unicode: [String.fromCodePoint(entry.codepoint)]
      };
      stream.write(glyph);
    }

    stream.end();
  });
}

function escapedCodepoint(codepoint) {
  return `\\${codepoint.toString(16).padStart(4, "0")}`;
}

const svgFont = await createSvgFont();
const ttfResult = svg2ttf(svgFont.toString("utf8"), {
  copyright: "Lucide Icons and Contributors (ISC); Cole Bemis (MIT); PastureStack contributors (Apache-2.0)",
  description: "PastureStack compatibility UI icon font built from licensed neutral symbols",
  ts: fixedTimestamp,
  url: "https://github.com/PastureStack/icon-font",
  version: "Version 2.0"
});
const ttf = Buffer.from(ttfResult.buffer);
const woff = Buffer.from(ttf2woff(new Uint8Array(ttf)).buffer);
const woff2 = Buffer.from(ttf2woff2(ttf));

const cssRules = aliases.map(({ name, codepoint }) => `.icon-${name}:before { content: "${escapedCodepoint(codepoint)}"; }`).join("\n");
const css = `@font-face {
  font-family: "${family}";
  src:
    url("fonts/${family}.woff2?v=${assetVersion}") format("woff2"),
    url("fonts/${family}.woff?v=${assetVersion}") format("woff"),
    url("fonts/${family}.ttf?v=${assetVersion}") format("truetype"),
    url("fonts/${family}.svg?v=${assetVersion}#${family}") format("svg");
  font-display: block;
  font-style: normal;
  font-weight: normal;
}

[class^="icon-"], [class*=" icon-"] {
  font-family: "${family}" !important;
  speak: never;
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

${cssRules}
`;

const variables = `$icomoon-font-path: "fonts" !default;\n\n${aliases.map(({ name, codepoint }) => `$icon-${name}: "${escapedCodepoint(codepoint)}";`).join("\n")}\n`;
const scssRules = aliases.map(({ name }) => `.icon-${name} { &:before { content: $icon-${name}; } }`).join("\n");
const scss = `@use "variables" as *;\n\n@font-face {\n  font-family: "${family}";\n  src: url("#{$icomoon-font-path}/${family}.woff2?v=${assetVersion}") format("woff2"), url("#{$icomoon-font-path}/${family}.woff?v=${assetVersion}") format("woff"), url("#{$icomoon-font-path}/${family}.ttf?v=${assetVersion}") format("truetype"), url("#{$icomoon-font-path}/${family}.svg?v=${assetVersion}#${family}") format("svg");\n  font-style: normal;\n  font-weight: normal;\n}\n\n[class^="icon-"], [class*=" icon-"] {\n  font-family: "${family}" !important;\n  speak: never;\n  font-style: normal;\n  font-weight: normal;\n  font-variant: normal;\n  text-transform: none;\n  line-height: 1;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\n\n${scssRules}\n`;

const cards = aliases.map(({ name, codepoint }) => `<article class="glyph"><i class="icon-${name}" aria-hidden="true"></i><strong>icon-${name}</strong><code>U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}</code></article>`).join("\n");
const demo = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PastureStack icon font demo</title>
  <link rel="stylesheet" href="style.css?v=${assetVersion}">
  <style>
    body { background: #f7f4ea; color: #20332c; font: 15px/1.4 system-ui, sans-serif; margin: 0; }
    header { background: #155a45; color: white; padding: 1.25rem 2rem; }
    h1 { margin: 0; }
    main { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); padding: 2rem; }
    .glyph { align-items: center; background: white; border: 1px solid #d8ded9; border-radius: .5rem; display: grid; gap: .35rem .75rem; grid-template-columns: 2.5rem 1fr; padding: .8rem; }
    .glyph i { color: #155a45; font-size: 1.8rem; grid-row: span 2; text-align: center; }
    .glyph code { color: #65736d; }
    footer { border-top: 1px solid #d8ded9; padding: 1rem 2rem 2rem; }
  </style>
</head>
<body>
  <header><h1>PastureStack icons</h1><p>${icons.length} codepoints · ${aliases.length} displayed aliases</p></header>
  <main>${cards}</main>
  <footer>Functional symbols are derived from Lucide Icons under ISC/MIT. Product-like compatibility identifiers use neutral symbols and are not third-party logos.</footer>
</body>
</html>
`;

const codepointManifest = Object.fromEntries(aliases.map(({ name, codepoint }) => [name, codepoint]));
const sourceManifest = {
  schemaVersion: 1,
  generatedFrom: `${lucidePackage.name}@${lucidePackage.version}`,
  lucideTtfSha256: sha256(lucideTtf),
  icons: icons.map((entry) => ({
    codepoint: entry.codepoint,
    aliases: entry.aliases,
    source: entry.sourceReference,
    sourceOutlineSha256: entry.sourceOutlineSha256
  }))
};

await mkdir(path.join(root, "fonts"), { recursive: true });
await Promise.all([
  writeFile(path.join(root, "fonts", `${family}.svg`), svgFont),
  writeFile(path.join(root, "fonts", `${family}.ttf`), ttf),
  writeFile(path.join(root, "fonts", `${family}.woff`), woff),
  writeFile(path.join(root, "fonts", `${family}.woff2`), woff2),
  writeFile(path.join(root, "codepoints.json"), `${JSON.stringify(codepointManifest, null, 2)}\n`),
  writeFile(path.join(root, "source-manifest.json"), `${JSON.stringify(sourceManifest, null, 2)}\n`),
  writeFile(path.join(root, "style.css"), css),
  writeFile(path.join(root, "style.scss"), scss),
  writeFile(path.join(root, "variables.scss"), variables),
  writeFile(path.join(root, "demo.html"), demo)
]);
