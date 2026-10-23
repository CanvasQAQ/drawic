# Clean-room record

Drawic is an original implementation begun on 2026-10-23 from an empty workspace
and a newly initialized Git repository.

## Participants

- CanvasQAQ: product owner, repository owner, and supplier of the approved
  device-art package.
- Drawic primary implementation agent: independent architecture, implementation,
  tests, documentation, packaging, and release automation.

## Allowed inputs

- The Drawic product brief supplied by CanvasQAQ.
- Public language, runtime, format, and operating-system documentation.
- Public standards such as SPICE syntax and the SVG, PNG, and PDF formats.
- `analog-canvas-device-svg-20261023/device-svg-export`, limited to its
  `manifest.json`, SVG artwork, optional fonts, and checksum records.

For the supplied device package, only static SVG artwork and the manifest's
device labels, categories, view boxes, and pin direction metadata were read.
The package's fonts were not copied or used. Source-path fields embedded in the
package manifest were ignored during import. The exporter was not inspected or
executed.

## Excluded inputs

No participant cloned, forked, downloaded, browsed, or consulted source code,
Git history, tests, styles, plugins, internal files, or screenshots from
`cascode-ai/analog-canvas`, `LXY-freshman/schematic-draft`, or another
schematic editor. No files from the pre-existing experimental Drawic workspace
were read.

The device package's provenance metadata names a source repository. That name is
recorded only as provenance for the approved static art; it is not a source-code
input. Drawic's document schema, component graph, history model, IPC surface,
errors, visual design, and module structure were designed independently.

## Integrity controls

- `PROVENANCE.md` and `src/renderer/assets/device-symbols/asset-lock.json` record
  the source, license basis, and per-file SHA-256 values for imported art.
- `scripts/verify-clean-room.mjs` scans source for excluded identifiers and
  unexpected external asset references.
- `scripts/verify-offline.mjs` scans production source for network clients and
  rejects undeclared runtime endpoints.
- Source changes are reviewed before release for unexplained copied text,
  distinctive upstream names, and incompatible licensing.

This record is a declaration of process. It does not grant any license to the
approved device artwork beyond the owner's authorization recorded in
`THIRD_PARTY_NOTICES.md`.
