# ADR 007: Wire interaction and movement model

Status: accepted, 2026-10-23

## Decision

The normative wire behavior is defined in
[`docs/WIRE_INTERACTION_MODEL.md`](../WIRE_INTERACTION_MODEL.md).

Wire endpoint intent is independent from the route's intermediate geometry.
Device drags use a frozen source page and one movement plan. Internal wires
retain their authored shape, boundary wires stretch only at the moving endpoint,
and external wires remain unchanged. Rendering, connectivity, export, and
movement use the same endpoint-resolution rules.

Preview and commit invoke the same plan function. A completed pointer gesture
creates one document revision and one undo entry.

Network highlighting is expressed with stroke color and width. SVG filters are
not applied to wire paths.

Automatically routed wires leave each connected pin along its outward direction
for at least two grid steps before turning. Endpoint devices remain obstacles
after that escape segment. Every automatic routing trigger reapplies this same
default escape rule; no persistent manual/automatic mode is stored.

This ADR supersedes ADR 006 where it calls for full connected-wire rerouting
during device movement. Directional routing remains available when creating a
new wire.

## Consequences

- A selected device can no longer make axis-aligned wires disappear because an
  object-bounding-box filter region collapses.
- Authored wire shapes survive ordinary component movement.
- Boundary wires can gain a local dogleg without changing unrelated geometry.
- Preview and commit cannot diverge because they share the movement plan.
- Automatic wires cannot immediately turn back through their endpoint device.
- Advanced segment identity and direction-mode metadata remain a documented
  schema extension requiring a future ADR.
