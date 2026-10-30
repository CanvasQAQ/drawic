# Provenance

## Drawic original source

- Origin: new implementation initialized in an empty local Git worktree on
  2026-10-23.
- Repository: `https://github.com/CanvasQAQ/drawic`
- License: MIT for original Drawic source.
- Upstream schematic-editor code: none.

## Brand assets

- Origin: original Drawic brand concept `drawic-icon.svg`, a MOSFET symbol on a
  warm paper tile, supplied by CanvasQAQ, repository owner.
- Transformation: adapted into the production icon in `build/icon.svg` with
  standard icon-grid clear space, optical centering, regularized stroke
  geometry, and compact 16 px and 32 px variants. The in-app mark in
  `src/renderer/components/DrawicMark.tsx` mirrors the 32 px variant.
- Derived files: `build/icon.png`, `build/icon.ico`, `build/icon.icns`,
  `build/icons/`, and the runtime favicon/window icons under
  `src/renderer/public/`. All are generated from the repository-local SVGs.
- Third-party material: no icon set, icon font, wordmark font, or templates are
  bundled. Rasterization uses local development tools only and those tools are
  not packaged with Drawic.
- Details and regeneration commands: [docs/BRAND_ASSETS.md](docs/BRAND_ASSETS.md).

## Device symbols

- Supplied collection: `analog-canvas-device-svg-20261024/device-svg-export`
- Supplied archive: `analog-canvas-device-svg-20261024.zip`, SHA-256
  `2a53f925a324fe98c915cae12a7ebcd2b7a9a1f068eafa0bc39af4614c78a846`
- Supplier and rights basis: CanvasQAQ, repository owner, via the Drawic product
  brief dated 2026-10-23. The owner explicitly authorized use of this static
  artwork for Drawic.
- Imported material: 109 primary symbol SVGs and 17 alternate/base appearances,
  plus the matching labels, categories, view boxes, variant mappings, and pin
  direction metadata. All 126 supplied SVG files are retained as build inputs.
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
  `cd8cb21c32754396ad96e8c852ba6c07c5a34284538e02958f0136f689a1194f`.
- Runtime library size: 403,652 bytes, containing 109 primary records and 11
  distinct alternate appearances (120 total). The transform sanitizes active
  content and external references, normalizes fixed black paint to the renderer
  theme color, applies terminal visibility per variant, and derives exact visual
  pin coordinates and label anchors.

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
