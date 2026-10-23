# Drawic 0.2.0 — Unsigned Preview

Drawic 0.2 replaces hierarchical Cells with independent drawing pages and moves
the device catalog into one self-contained library file.

## Highlights

- Page tabs with create, rename, duplicate, delete, reorder, and switch actions.
  Switching pages never marks the document as modified.
- A single 109-device `drawic-built-in.drawiclib.json` runtime library containing
  sanitized, themeable artwork plus exact pin coordinates and label anchors.
- Ctrl+wheel pointer-centered zoom, Ctrl+0 reset, and Space-drag panning.
- Live device placement previews.
- Click-a-port, click-another-port wiring with anchor-backed connectivity.
- Orthogonal wire segment handles for fast route adjustment.
- Device labels use resource-defined anchors instead of overlapping the symbol.
- Junction markers no longer cover wires with a paper-colored disc.
- Rectangle and ellipse drawing tools for free-form page content.
- Clear rejection of the retired Cell-oriented preview format.

## Validation

The release pipeline runs strict TypeScript checks, automated model and
interaction tests, renderer and desktop builds, Linux packaged application smoke
tests, Windows x64 packaging, macOS x64/arm64 packaging, offline auditing,
checksum verification, and a real Release download verification.

## Unsigned preview

Every artifact in this release is unsigned. Windows SmartScreen and macOS
Gatekeeper warnings are expected. Verify `SHA256SUMS.txt` before running any
downloaded package.

## Known limitations

- User-editable device libraries are not exposed in the UI yet.
- Draw.io `mxlibrary` conversion exists in the device-library core, but there is
  not yet a draw.io document import/export UI.
- PDF output is raster-backed.
- Spectre/SCS and local MCP are not implemented.
