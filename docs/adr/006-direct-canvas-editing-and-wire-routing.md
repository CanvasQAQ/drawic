# ADR 006: Direct canvas editing and connected wire routing

Status: accepted, 2026-10-23

## Decision

Drawic treats direct manipulation on the canvas as the primary editing surface.
Device reference/value labels can be selected and moved independently, renamed
in place, and hidden with the normal delete command. Free text, network labels,
rectangles, and ellipses can be moved, edited in place, and resized without a
modal dialog. Shape labels and per-device label offsets are optional persisted
document fields.

Wire endpoints bound to device pins remain electrically anchored while the
device moves, rotates, or mirrors. Connected wires are rerouted as orthogonal
paths. Automatic routing first prefers a direct or minimum-bend path and uses a
grid search around component and drawing-shape obstacles when the direct path
is blocked. Obstacles do not include the two devices that own a wire's bound
endpoints. Manual segment handles remain available after routing and keep
bound endpoints fixed by adding doglegs when necessary.

Canvas view state uses direct wheel zoom centered under the pointer. `F` fits
the active page content while preserving the canvas aspect ratio.

## Consequences

- Device transforms cannot leave a bound wire visually detached from its pin.
- Automatic routing avoids other devices and drawing shapes without inventing
  connectivity changes; crossing-wire semantics remain governed by ADR 003.
- Manual route edits are intentionally limited to orthogonal geometry and do
  not create or remove electrical anchors.
- Label offsets are canvas-space offsets from the symbol's authored label
  anchor, so rotating or mirroring a symbol does not rotate its text.
- The optional fields are additive within schema version 2. Files without them
  render the authored defaults, and existing projects need no migration.
