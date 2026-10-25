# Drawic 0.3.0 — Unsigned Preview

Drawic 0.3.0 is a cross-platform unsigned preview focused on richer schematic
editing, clearer desktop chrome, and safer device interactions.

## Downloads

- Windows x64 application ZIP
- macOS x64 and arm64 DMG/ZIP application bundles
- Linux x64 AppImage and DEB packages

All packages are unsigned. Windows SmartScreen and macOS Gatekeeper are expected
to warn about the unknown publisher. Verify every download against
`SHA256SUMS.txt`.

## Highlights

- Added a frameless Windows/Linux shell with custom window controls and native
  macOS traffic lights.
- Added locally persisted light and dark themes.
- Added Net-owned wire colors, including matching Junction colors and SVG
  export.
- Added component Reference Name labels with IEEE-style rich text, document
  typography controls, GUI/Agent collision policies, stable placement rules,
  and a Lexical-based direct segment editor.
- Added one-shot Duplicate preview (`C`), Ctrl/Command drag copying, placement
  rotation (`R`), and EDA-style `U` undo.
- Improved device/wire interaction with pin-to-Wire drop snapping and stable
  single-device rotation that does not accumulate wire loops.
- Simplified the title and toolbar layout and removed persistent library
  placement badges.
- Added comprehensive model, renderer, interaction, export, desktop, and
  packaged smoke coverage.

## Validation

The tagged workflow runs strict TypeScript checks, 174 automated tests, offline
and clean-room audits, documentation privacy checks, renderer and desktop
builds, Windows/macOS/Linux packaging, platform package smoke tests, checksum
verification, and real Release download verification.

## Known limitations

- PDF output is raster-backed rather than vector or searchable.
- Electrical simulation is not embedded; Drawic exports SPICE netlists.
- Stable wire-segment identities, direction modes, lock/trunk segments, and
  disconnection-style device movement remain future work.
- Arbitrary mixed-format TEXT/Note editing is not exposed yet, but the bundled
  Lexical editor is ready to be reused for it.
