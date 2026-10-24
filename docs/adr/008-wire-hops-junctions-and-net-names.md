# ADR 008: Wire hops, explicit junctions, and net names

Status: accepted, 2026-10-24

## Decision

A device pin touching a wire is an electrical contact. Wire-to-wire contact is
not implicit: only an explicit junction joins two wires electrically.

When a new wire endpoint is deliberately snapped onto an existing wire, the
completion operation creates an explicit junction at that point. Existing
junctions may also be placed with the Junction tool. Without such a junction,
wire endpoint overlap and interior crossing remain separate networks.

Separate network crossings render a small arc hop on the horizontal wire. The
arc is presentation only and never changes connectivity. If the networks are
already electrically joined by a junction or a shared name, no hop is drawn.

An intersection between wires that are already in the same network renders as a
single merged junction indicator. Exact collinear overlap between same-net
segments is rendered once so a route does not show doubled conductor sections.

An explicit junction inside a collinear overlap still supplies the connection
intent needed to merge the wires, but the junction marker is suppressed while
it lies within that shared conductor section.

Collinear overlap is normalized into persisted wire geometry. The later wire is
trimmed at the overlap boundary. A junction is then retained or created only if
that boundary is a branch point inside the through-wire. If the wires simply
continue along the same conductor, their point paths are concatenated into one
wire object and no junction is created.

The connected electrical network owns one canonical name. A visible Net Label
has naming precedence over an explicit wire name, followed by a generated
default such as `N001`. Every wire in the same network displays that one name.
Renaming the net updates all member wires and visible Net Labels together.
Explicit aliases still merge by trimmed text and conflicting aliases remain
visible to ERC.

Artwork does not store an automatic/manual routing mode. Whenever automatic
routing runs, it applies the current default pin-escape rules.

## Consequences

- Visual overlap no longer invents wire-to-wire connectivity.
- Crossing topology remains readable through arc hops.
- New-wire snapping and the Junction tool are the explicit ways to introduce a
  branch.
- Wire identities have stable user-editable names without cluttering the canvas.
- The Net Label tool has a single purpose: attach and name a visible net label
  on a wire.
- This ADR supersedes ADR 003 where endpoint contact implicitly joined wires.
