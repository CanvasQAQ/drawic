# Provenance

## Drawic original source

- Origin: new implementation initialized in an empty local Git worktree on
  2026-10-23.
- Repository: `https://github.com/CanvasQAQ/drawic`
- License: MIT for original Drawic source.
- Upstream schematic-editor code: none.

## Device symbols

- Supplied collection: `analog-canvas-device-svg-20261023/device-svg-export`
- Supplier and rights basis: CanvasQAQ, repository owner, via the Drawic product
  brief dated 2026-10-23. The owner explicitly authorized use of this static
  artwork for Drawic.
- Imported material: 109 selected primary symbol SVGs plus the matching labels,
  categories, view boxes, and pin direction metadata. The supplied pack contains
  126 SVG files; only the 109 primary files are bundled by this import.
- Excluded material: package fonts, exporter scripts, source catalogs, and any
  implementation files.
- Import transform: `scripts/import-device-assets.mjs` creates an original,
  minimal runtime manifest and a per-file integrity lock.
- Integrity ledger: `src/renderer/assets/device-symbols/asset-lock.json`.
- Per-file hashes: see the ledger. The ledger hashes every copied SVG and removes
  source paths and generator details from the runtime manifest.
- Runtime packaging: `scripts/build-device-library.mjs` converts the approved
  manifest and SVG artwork into the single generated file
  `src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json`. Each
  device record retains its source filename and source-file SHA-256.
- Generated library SHA-256:
  `77c28a55e88cb9642973d279c3692ac70c98c873d2093ef660d5378816f519dd`.
- Runtime library size: 346,626 bytes, containing 109 self-contained device
  records. The transform sanitizes active content and external references,
  normalizes fixed black paint to the renderer theme color, and derives exact
  visual pin coordinates and label anchors.

The supplied package reports source commit
`a239991de3d765ad68729a2fc59b87483c7d401c` in its manifest. That value is retained
here solely to identify the approved static-art revision; the repository was not
downloaded or inspected.

## Runtime dependencies

Exact versions are pinned by `package-lock.json`. External dependencies are
obtained from the public npm registry at build time and are not contacted by the
packaged application at runtime. License notices are summarized in
`THIRD_PARTY_NOTICES.md`.

## Generated files

Exported `.drawic.json`, SVG, PNG, PDF, and SPICE files are generated entirely
from local document data and the single-file bundled device library. Drawic does not add
remote images, fonts, scripts, or service links to exported documents.
