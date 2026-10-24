# ADR 009: Net-owned wire graph

Status: accepted, 2026-10-24

## Decision

Drawic schema version 3 stores electrical topology directly.

- A page owns independent logical nets.
- A net owns its wires and junctions.
- Every wire is one polyline edge between two electrical endpoints.
- A wire endpoint references a device pin, a junction in the same net, or an
  explicit open end.
- Junction identity is a stable ID. Coordinates are geometry, not identity.
- Only genuine branch vertices are stored as junctions. Degree-two joins are
  normalized into one wire.
- Wire names are removed. The net owns the canonical name.
- Net Labels reference a net and a wire attachment point, but do not own an
  alias independent of the net name.
- Cross-net wire crossings are presentation-only. They are derived from wire
  geometry and render as arcs. They are never stored as junctions.
- Same-net crossings become ordinary graph Junctions; there is only one junction
  representation.

The editor updates the number and geometry of a net's wires from topology, not
from the sequence of pointer gestures that originally produced the geometry.

## Consequences

- Connectivity comes from explicit net and endpoint ownership.
- Selecting a wire displays handles only for that electrical edge.
- A junction move updates every incident wire endpoint explicitly.
- A branch split creates one junction and two wires. A degree-two continuation
  merges back into one wire.
- Arc hops remain derived renderer state.
- Schema version 2 files are deliberately rejected.
