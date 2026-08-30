# PastureStack Icon Font

This package provides the compatibility-preserving UI icon font used by the PastureStack web console. Existing functional icon class names, aliases, and codepoints remain stable while the glyph outlines are rebuilt from a locked, licensed Lucide source and project-specific branding is replaced with original PastureStack artwork.

PastureStack is an independent community effort to preserve, audit, and modernize the Rancher 1.6 ecosystem. It is not affiliated with or endorsed by Rancher Labs or SUSE.

**Upstream:** [`rancher/icons`](https://github.com/rancher/icons). This GitHub fork retains the upstream Git history, authorship, dates, and license notices unchanged; PastureStack maintenance is consolidated into one commit after the preserved upstream boundary.

## Local validation

The build toolchain is pinned to Node.js 24.20.0 LTS and npm 12.0.2. Use those exact versions so the lockfile, native WOFF2 converter, and generated font artifacts are reproducible.

```sh
npm ci
npm test
```

Open `demo.html` after a successful build to inspect every glyph and alias. Publishing this source repository does not constitute a package or production release; repeat the web-console integration, legal and trademark review, public-history audit, and small-size visual checks before any release.

## Compatibility contract

- The generic `icon-*` API and all non-project-brand codepoints remain stable.
- The PastureStack project mark occupies `U+E946` and uses `icon-pasture-stack`.
- The font family and generated filenames are `pasturestack-icons`.
- Product-like compatibility identifiers render neutral functional symbols rather than third-party logos.
- `src/icon-map.json` is the authoritative API and source mapping; generated `source-manifest.json` records source-outline hashes.
- `package-lock.json` must resolve only integrity-checked packages from the npm registry; the audit verifies registry signatures and rejects unexpected lifecycle scripts or vulnerable dependency versions.
- The root Apache-2.0 license and the Lucide/Feather notices under `LICENSES/` must be distributed together.

See `CHANGES.md`, `PROVENANCE.md`, and `UPSTREAM_ATTRIBUTION.md` for modification, source, and contributor boundaries.
