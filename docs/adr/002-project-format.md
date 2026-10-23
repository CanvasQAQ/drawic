# ADR 002: Versioned Drawic project document

Status: accepted, 2026-10-23

## Decision

The `.drawic.json` format uses an integer `schemaVersion`, a `drawic-schematic`
kind discriminator, UUID-based IDs, and an explicit list of cells. Exactly one
cell is marked as Top. Wires store orthogonal point lists; junctions are
explicit coordinates; net and free-text labels share a small annotation record.

Drawic 0.1 accepts schema version 1 only. A future version is rejected rather
than partially interpreted. Saves use a same-directory temporary file, flush the
file, then atomically rename it over the target.

## Consequences

The format has a deliberate migration boundary. Versions may add fields in a
future release, but opening unknown future data remains prohibited until a
version-aware migration exists. Selection, zoom, open panels, and the active
tool are view state and are intentionally excluded from the document.
