# Drawic wire interaction model

Status: normative, schema version 3, 2026-10-24

This document defines how schematic wires are represented, resolved, edited, and
committed. Implementations must use one path fact for rendering, hit testing,
connectivity, movement previews, and final edits.

## 1. Two responsibilities

A wire has two separate responsibilities:

1. It records an electrical connection between stable objects.
2. It stores a visible polyline between two electrical endpoints.

Connection intent takes priority when a device moves. The wire endpoint follows
its resolved object, while the authored path is preserved wherever possible.
Device movement must not trigger global rerouting.

## 2. Wire data

A net has:

- a stable, unique net ID;
- one canonical optional name;
- an optional visual color shared by every wire in the net;
- zero or more wire edges;
- zero or more stable junction vertices.

Each wire has:

- a stable, unique wire ID;
- exactly one start endpoint and one end endpoint;
- ordered bend points between those endpoints.
- optional per-segment direction metadata;
- optional visual style and attached-object metadata.

An endpoint is exactly one of:

- a stable device-pin reference;
- a stable junction ID in the same net;
- an explicit open end.

A transient nearest point is not a persistent endpoint. A wire never owns a net
name; the containing net does.

Intermediate bends use world-canvas coordinates. Segment identity, when present,
must remain stable so labels, probes, and other attachments do not depend on a
segment's current array index.

Current Drawic schema version 3 stores nets, junction IDs, endpoint references,
and bend points. Version 2 is rejected. Stable segment identity and per-segment
direction mode remain reserved extension points. An optional six-digit
hexadecimal Net color is additive within version 3 and does not affect
connectivity.

The editor implements shared endpoint/path resolution, topology-driven wire
split/merge, rigid internal wire movement, local boundary stretching, grouped
device rotation/mirroring, gesture cancellation, resolved export bounds, stable
junction selection, net-owned names, attached net labels, and one
preview/commit plan. Stable segment identity, editable direction modes, and an
explicit disconnection-move gesture remain future work.

## 3. Resolving endpoints and paths

A pin endpoint is resolved from the current device state:

1. find the device instance;
2. find the pin on the device's symbol;
3. apply the device transform (rotation and mirror);
4. add the device position;
5. obtain the world-space pin contact point;
6. align the adjacent route locally when the contact point changed.

The visible path is the resolved start point, persisted bends, and resolved end
point. Rendering, connectivity, export, bounds, and pointer hit testing must all
consume the same resolved path.

If an endpoint cannot be resolved, its connection must not be guessed from a
nearby item. Diagnostics should identify the unresolved wire.

## 4. Drawing a new wire

Endpoint resolution distinguishes device pins, existing wire contact points,
junction vertices, and open ends. It records:

- the exact contact point;
- a grid landing point;
- the pin's outward direction;
- whether a short escape segment is required;
- the stable target identity.

Orthogonal routing prefers horizontal-first or vertical-first paths, avoids
device bodies, and leaves pins along their outward direction. The path shown
while drawing is the path submitted when the wire is completed.

Automatically routed wires must leave a pin along its outward direction for at
least `AUTO_ROUTE_ESCAPE` (currently 20 canvas units) before the first
perpendicular turn. Movement and wire snapping use a 10-unit grid. Both
endpoint devices remain routing obstacles; the short escape segment is the only
portion allowed to touch its owning device. This prevents an automatic route
from crossing back through the device body.

Every automatic routing trigger applies the same escape rule. A later
auto-routing pass may restore the default pin escape even if a previous route
was arranged differently.

Completing a wire commits its endpoint references, any required junction and net
merge, resulting wire edge count, attachments, and its single undo record
atomically.

## 5. Electrical contact

A device pin touching an anchored wire connects to it. Wire-to-wire crossings
and passive endpoint overlap do not invent topology. Two different nets become
electrically joined only through an explicit junction operation or a shared net
name.

Without an explicit junction, crossing routes remain separate electrical
networks and the horizontal wire renders a small arc hop over a vertical wire.
An endpoint laying on another wire without junction intent is also treated as a
non-connection and receives the same visual separation.

A junction is a stable vertex in one net:

- it is created when a branch is attached to an existing wire;
- wires reference it by `junctionId`, never by coordinate;
- every incident wire endpoint resolves to the junction point;
- a degree-two junction is normalized away and its two wires become one edge;
- a degree-three or higher junction remains;
- moving it updates every incident wire endpoint atomically.

During device placement or an explicit device drop, a nearby pin snaps onto an
existing Wire and joins that Net. A pin merely crossing a Wire during an
in-progress drag does not connect; connection is evaluated when the drag is
released.

All wires already owned by one net are electrically equivalent. A geometric
crossing inside that net is not a second junction representation and receives no
arc. A crossing between different nets remains non-connected and renders an arc
on the horizontal wire.

Normalization updates wire count and coordinates from topology:

- splitting a wire at a branch creates two edge wires and one junction;
- a branch that initially overlaps its trunk is trimmed back to the divergence
  point, and the junction moves there;
- two branches that converge with a shared tail are split at the tail boundary,
  leaving two branch edges plus one unique continuation edge;
- an open wire endpoint landing inside another same-net edge creates a junction
  and splits the through edge at that point;
- an interior crossing between two same-net wires creates one degree-4 junction
  and splits both edges;
- continuing end-to-end merges two edges into one polyline;
- duplicate edges between the same endpoint pair are removed;
- separate nets with the same explicit name are merged;
- nets sharing a pin endpoint are merged.

Geometry alone still never creates electrical topology.

Net graph canonicalization runs as one segment-arrangement pipeline rather than
operation-specific overlap passes. ERC validates the resulting invariants:
stable Junction references, degree >= 3 junctions, no Junction or wire endpoint
inside another edge, no duplicate endpoint edges, and no overlapping conductor
segments inside one Net.

## 5.1 Net names and labels

The Net owns the canonical name. Every wire in that net displays the same name
without duplicating a name field in wire records.

Canonical-name precedence is:

1. a visible Net Label;
2. the explicit Net name;
3. a generated default such as `N001`.

Renaming a net from the inspector updates the Net object and all visible labels
in one transaction.

Default names remain hidden on the canvas. Nets with the same trimmed explicit
name merge into one logical net.

The Net Label tool attaches a visible label to a wire. Labels with the same text
merge networks. Label text can be edited directly or in the inspector.

## 6. Freezing a gesture

At the start of a device drag, freeze:

- the source document and revision;
- the selection;
- the complete original geometry of every affected wire;
- affected junctions and attachments;
- the set of moving devices.

Classify wires for the whole gesture:

- internal: every pin endpoint belongs to the moving set;
- boundary: at least one, but not every, pin endpoint belongs to the moving set;
- external: no pin endpoint belongs to the moving set.

This classification must not change while the same gesture is active.

## 7. Moving internal wires

Pure translation of an internal wire translates every bend and attached
intermediate object by the same grid-snapped displacement. Its relative shape,
wire identity, and attached labels remain intact. It is not rerouted.

When a gesture rotates or mirrors the owning devices, internal wire geometry is
transformed rigidly with the device group rather than rerouted.

## 8. Moving boundary wires

Only the moving endpoint and its local neighborhood may change. The fixed
endpoint and the distal authored route stay in place.

- If the new endpoint can align with the adjacent bend, slide that bend on the
  perpendicular axis and keep the segment orthogonal.
- If alignment cannot be preserved, insert a local dogleg.
- A pin escape segment follows the pin's current outward direction.
- A single-segment connection between two constrained pins may become an L or Z
  path; it must not become a diagonal.
- Locked and trunk segments cannot be shortened, rotated, or rewritten. Reject
  the move if a valid connection would require violating them.

After local edits, remove zero-length segments, merge collinear segments, retain
the strongest segment constraint, and verify all allowed directions. Do not
reorder or reroute the rest of the network.

## 9. External wires and junctions

External wires do not change.

Internal junctions translate with the internal path. A junction shared with an
external or boundary wire is a boundary object and must remain connected through
local stretching. Selecting a junction alone moves that junction and locally
follows all connected wire ends.

## 10. Rotation and mirroring

Anchored endpoints resolve from the transformed pins. Internal wire bends,
junctions, and attachments are transformed with the same rigid operation.
Labels retain their relative position along the wire, but label text remains
upright; mirroring changes the side, not the glyphs.

Boundary wires continue to use fixed-end preservation and local endpoint
stretching.

## 11. Preview, commit, cancellation, and history

Each pointer move computes a preview from the frozen source and current pointer.
It never mutates the source document, revision, or history.

On pointer release, the final preview is the submitted result. Preview and
commit must call the same movement-plan function. One gesture creates one
document revision and one undo entry. Escape or pointer cancellation discards
the preview and restores the exact pre-gesture document.

## 12. Disconnection mode

Disconnection-style movement keeps wire geometry fixed while moving the device.
Affected wire ends become open branches and the device pins leave their previous
networks. Device motion and disconnection are committed together.

## 13. Labels, markers, and display bounds

Attachments resolve against stable segment identity. Local deformation
reprojects an attachment onto its segment; rigid internal movement carries it
unchanged.

Fit-to-content includes all rendered ink: devices, resolved wire centerlines and
stroke widths, junctions, labels, drawing objects, no-connect markers, and other
visible annotations. It must not use only device bounds.

## 14. Rendering constraint

Wire highlighting must not use an SVG filter whose region depends on the path's
object bounding box. A horizontal or vertical path has a zero-sized bounding-box
dimension, which can collapse the filter region and make a correctly stored wire
disappear. Highlight wires with stroke color and width only.

## 15. Acceptance scenarios

The following scenarios are required regression coverage:

1. Moving one end of a horizontal wire keeps the other end fixed and the wire
   horizontal.
2. Diagonal device movement adds a local dogleg while preserving the distal
   path.
3. Moving both devices of an internal wire preserves every bend.
4. Unrelated wires do not change.
5. Repeated pointer previews do not accumulate drift.
6. Cancellation restores the exact starting geometry.
7. Release produces exactly the final preview and one revision.
8. Rotation leaves an escaping wire along the new pin direction.
9. Mirroring keeps labels upright and on the corresponding side.
10. Moving an open wire endpoint does not move the untouched endpoint.
11. Disconnection movement preserves wire geometry.
12. Fit-to-content includes negative and large positive wire coordinates.
13. Automatic routing leaves both pins along their outward directions for the
    minimum escape distance before turning.
14. A crossing without an explicit junction remains electrically separate and
    renders a hop on the horizontal route.
15. Snapping a new wire endpoint onto an existing wire creates an explicit
    junction and joins the networks.
16. Every schema v3 wire belongs to one net and references two electrical
    endpoints.
17. Matching Net names and labels merge nets.
18. Duplicate endpoint edges inside one net are normalized to one wire.
19. Every wire in one net displays the same canonical net name.
20. Renaming a net updates all visible labels without rewriting wire records.
21. Wire snapping always lands on the 10-unit grid when staying on an
    existing orthogonal segment.
22. A new wire overlapping its source wire along the first segment merges into
    one net with no redundant junction or arc hop.
23. Overlap normalization trims the retained wire and places a junction only at
    an actual branch/divergence point.
24. A collinear overlap followed by continuation is merged without a junction.
25. A collinear continuation becomes one wire object containing the resulting
    bends, not a long wire plus a second short continuation wire.
26. A later wire whose trailing segment overlaps an existing continuation is
    merged into that wire and the overlap junction is removed.
27. Two wires meeting end-to-end at a degree-two join become one polyline;
    genuine T branches remain separate and keep their junction.
28. A same-net geometric crossing draws no arc, creates one degree-4 junction,
    and splits both crossing edges.
29. Changing a Net color renders every wire in that Net with the same color and
    preserves the color through canonicalization and SVG export.
