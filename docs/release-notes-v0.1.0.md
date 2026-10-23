# Drawic v0.1.0 — Unsigned Preview

This is the first downloadable preview of Drawic, a local-first, offline analog
and mixed-signal schematic editor.

## Included

- Searchable and categorized device library with continuous placement.
- Selection, marquee/multi-selection, movement, deletion, rotation, and mirroring.
- Orthogonal wires, pin/endpoint snapping, crossings, junctions, and network
  highlighting.
- Component labels, values, free text, named nets, properties, and multiple cells.
- Atomic `.drawic.json` save/open, recent projects, and unsaved-work recovery.
- Save/discard/cancel protection when replacing or closing a dirty document.
- Basic SPICE import and deterministic SPICE export.
- Self-contained SVG, PNG, and PDF export.
- Basic ERC for duplicate/empty references, dangling pins, invalid wires, and
  conflicting net labels.
- 109 bundled device symbols from the owner-approved static artwork package.

## Unsigned Preview

All installers and application bundles are unsigned. Windows SmartScreen and
macOS Gatekeeper will warn about the publisher. Linux packages are not
cryptographically signed. Verify every download against `SHA256SUMS.txt`.

## Known limitations

- Hierarchical block instances and port mapping are not implemented.
- Controlled-source, switch, logic, and analog-block symbols may be drawn and
  saved but are explicitly omitted from SPICE export in 0.1.
- PDF export embeds a locally rasterized diagram; it is not a searchable vector
  PDF.
- There is no cloud sync, runtime network service, scripting host, or local MCP.
- Custom component libraries and Spectre/SCS netlists are future work.
