# ADR 003: Crossing and junction semantics

Status: superseded by ADR 008 for wire-to-wire contact, 2026-10-24

## Decision

Device pins connect when they touch a wire segment. Wires connect when an
endpoint touches another segment. Two wires that cross in their interiors remain
electrically separate unless Drawic stores an explicit junction at that point.
Net labels with the same normalized text are merged into one electrical network.

Automatic junction indicators are rendered where a T-connection exists even
though no extra document object is required for endpoint contact. Explicit
junction points are saved because they change crossing semantics.

## Consequences

Crossing geometry alone never invents a connection. ERC reports dangling pins
and invalid non-orthogonal wires, and SPICE export derives node names from the
same connectivity graph used by the editor.
