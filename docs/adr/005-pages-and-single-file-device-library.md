# ADR 005: Pages and single-file device libraries

Status: accepted, 2026-10-23

## Decision

Drawic 0.2 replaces hierarchical Cells with independent drawing pages. A page is
a complete canvas with its own devices, wires, junctions, annotations, and
free-form shapes. There is no Top page and no hierarchy relationship.

The document kind changes to `drawic-drawing` with a newly defined schema
version. Drawic 0.2 deliberately does not migrate earlier preview files. The
earlier format is rejected rather than partially interpreted.

Devices are managed in a single self-contained library file, inspired by the
draw.io `mxlibrary` concept. A library file contains an array of device records;
an individual device is never split across several files. Each record carries
its sanitized artwork, dimensions, exact pin coordinates, label anchors,
category, search terms, and SPICE metadata.

SVG files are source artwork, not Drawic's live device representation. The
library build converts SVG into normalized device records. A converter can
produce and consume a draw.io `mxlibrary` export, while Drawic-specific
electrical metadata may not survive arbitrary draw.io edits.

## Consequences

- The renderer can lazy-parse and cache device records instead of loading every
  SVG into the main bundle.
- Wire endpoints bind to stable `deviceId + pinId` references.
- Custom devices can later be added as records in one user library file.
- Page operations replace all Cell and Top-cell behavior.
- No migration or compatibility code is retained for the 0.1 preview.
- Draw.io compatibility is a documented file-interchange subset, not a promise
  of complete editor or plugin compatibility.
