# Drawic 0.3.1 — Unsigned Preview

This preview extends the local MCP drawing tools so an agent can arrange
oriented devices and preserve their electrical connections while editing.

## Downloads

- Windows x64 application ZIP
- macOS x64 and arm64 DMG/ZIP application bundles
- Linux x64 AppImage and DEB packages

All packages are unsigned. Windows SmartScreen and macOS Gatekeeper may warn
about the unknown publisher. Verify downloads against `SHA256SUMS.txt`.

## Highlights

- `edit_page` can place devices at 0, 90, 180, or 270 degrees and apply
  horizontal or vertical mirrors.
- A `transform` operation can move or reorient an existing device in the same
  revision-checked, atomic batch as placement and pin connections.
- `read_page` reports orientation options, transformed pin positions, and
  resolved wire paths so an agent can plan and review its layout.
- Connected-device transforms retain pin identities and electrical links.
  A five-transistor OTA regression verifies differential-pair, current-mirror,
  and tail-device nets with the built-in NMOS and PMOS symbols.
- Batch edits remain one undo step and preserve request-ID replay semantics.

## Validation

The tagged release workflow checks types, tests, offline and clean-room rules,
documentation privacy, and builds. It packages Windows, macOS, and Linux
artifacts, runs platform smoke tests, verifies checksums, and checks the
published downloads before the release is considered complete.

## Known limitations

- Moving or reorienting a connected device locally stretches attached wires;
  it does not reroute entire existing paths around obstacles.
- Local MCP edits the active page only. Project file operations and device
  library editing remain in the UI.
- Electrical simulation is not embedded; Drawic exports SPICE netlists.
- PDF output is raster-backed rather than searchable vector text.
