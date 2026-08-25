# Modification Notice

PastureStack has modified this Apache-2.0-licensed work as follows:

- rebuilt all functional glyph outlines from locked `lucide-static@1.34.0` sources under ISC/MIT terms;
- preserved 108 compatibility codepoints and 116 aliases while removing the legacy outline manifest from the current tree;
- replaced product and platform logo outlines with neutral functional symbols;
- replaced the historical project-brand glyph at `U+E946` with original PastureStack artwork;
- renamed the project-brand glyph to `pasture-stack` (`icon-pasture-stack` in CSS);
- renamed the font family, generated files, package metadata, and demo branding;
- replaced the historical release tooling with a reproducible local build and audit workflow.
- pinned the build to Node.js 24.19.0 LTS and npm 12.0.2, added registry, integrity, lifecycle-script, and dependency-vulnerability gates.

These changes do not claim authorship of the compatibility API or Lucide/Feather artwork. The existing root `LICENSE`, the Lucide/Feather notices under `LICENSES/`, and the contributor acknowledgment in `UPSTREAM_ATTRIBUTION.md` are retained. The GitHub fork preserves the upstream history unchanged; this notice describes only the PastureStack integration commit and its current tree.
