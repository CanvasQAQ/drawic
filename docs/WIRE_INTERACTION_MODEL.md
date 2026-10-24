# Drawic wire interaction model

Status: normative, 2026-10-23

This document defines how schematic wires are represented, resolved, edited, and
committed. Implementations must use one path fact for rendering, hit testing,
connectivity, movement previews, and final edits.

## 1. Two responsibilities

A wire has two separate responsibilities:

1. It records an electrical connection between stable objects.
2. It stores a visible drawing route made of ordered bends and constrained
   segments.

Connection intent takes priority when a device moves. The wire endpoint follows
its resolved object, while the authored path is preserved wherever possible.
Device movement must not trigger global rerouting.

## 2. Wire data

A wire has:

- a stable, unique wire ID;
- a start endpoint intent;
- an end endpoint intent;
- ordered intermediate bend points;
- optional per-segment direction metadata;
- an optional hidden net name;
- optional visual style and attached-object metadata.

Endpoint intent is either a stable `{ deviceId, pinId }` anchor or a stable
junction reference. A transient "nearest point" is not a valid persistent
endpoint. An open end must be represented explicitly rather than rebound by
proximity.

Intermediate bends use world-canvas coordinates. Segment identity, when present,
must remain stable so labels, probes, and other attachments do not depend on a
segment's current array index.

Current Drawic schema version 2 stores endpoint anchors, bend points, optional
wire names, and wire-attached labels. Segment identity and per-segment direction
mode are reserved extension points; adding them requires an ADR and a
parser/serializer update.

The current editor implements shared endpoint/path resolution, rigid internal
wire movement, local boundary stretching, grouped device rotation/mirroring,
gesture cancellation, resolved export bounds, hidden wire names, attached net
labels, junction selection/deletion, same-net geometry cleanup, and one
preview/commit plan. Stable segment identity, editable direction modes, and an
explicit disconnection-move gesture remain future work.

## 3. Resolving endpoints and paths

An anchored endpoint is resolved from the current device state:

1. find the device instance;
2. find the pin on the device's symbol;
3. apply the device transform (rotation and mirror);
4. add the device position;
5. obtain the world-space pin contact point;
6. align the adjacent route locally when the contact point changed.

The visible path is the resolved start point, persisted bends, and resolved end
point. Rendering, connectivity, export, bounds, and pointer hit testing must all
consume the same resolved path.

If an anchor cannot be resolved, its connection must not be guessed from a
nearby item. Diagnostics should identify the unresolved wire.

## 4. Drawing a new wire

Endpoint resolution distinguishes device pins, existing wire contact points,
junctions, and open ends. It records:

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

Completing a wire commits its endpoint intent, any required junction, network
membership, attachments, and its single undo record atomically.

## 5. Electrical contact

A device pin touching an anchored wire connects to it. Wire-to-wire crossings
and passive endpoint overlap do not connect. Two wires become electrically joined
only through an explicit junction, which is created when the user deliberately
snaps a new wire endpoint onto an existing wire or places a junction.

Without an explicit junction, crossing routes remain separate electrical
networks and the horizontal wire renders a small arc hop over a vertical wire.
An endpoint laying on another wire without junction intent is also treated as a
non-connection and receives the same visual separation.

When two wires already belong to the same electrical network, their T or
crossing intersection is shown as one merged junction indicator rather than an
electrically ambiguous crossing. Exactly duplicated collinear conductor
segments are rendered only once.

When a new wire deliberately starts on an existing wire and initially follows
the same axis, the shared collinear section is treated as one conductor. The
two wires merge electrically, the duplicate section is drawn once, and the
start junction is not shown while it lies inside that overlap.

This overlap is normalized into persistent geometry rather than only hidden at
render time. The later wire is trimmed so its retained path starts where it
leaves the shared conductor:

- if it branches away while the other wire continues through that point, the
  retained path starts at an explicit junction on the through-wire;
- if the overlap ends in collinear continuation, both wire objects are merged
  into one continuous polyline with no junction;
- repeated overlaps are processed in order, producing the same split points
  regardless of the original authored start/end beyond the shared section.

Network membership is rebuilt from final pins, explicit junctions, and named
net labels. Geometry alone is not proof of a current electrical path.

## 5.1 Net names and labels

The electrical network, not an individual wire, owns the canonical net name.
Every connected wire displays the same name even when only one wire or label
provided it.

Canonical-name precedence is:

1. a visible Net Label;
2. an explicit wire name;
3. a generated default such as `N001`.

Renaming a net from the inspector updates every wire and visible Net Label in
that connected network in one transaction. Explicit aliases that still disagree
remain visible to ERC as name conflicts.

Default names remain hidden on the canvas. Explicit wire names with the same
trimmed text also identify the same logical net.

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

- internal: both endpoint intents belong to the moving set;
- boundary: exactly one endpoint intent belongs to the moving set;
- external: neither endpoint intent belongs to the moving set.

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
16. Hidden default wire names are editable, and matching Net Labels merge
    networks.
17. A same-net T or crossing displays one merged connection indicator and no
    arc hop.
18. Duplicate collinear segments inside one net are drawn once.
19. Every wire in one connected network displays the same canonical net name.
20. Renaming one wire's net name updates the whole connected net.
21. Wire snapping always lands on the 10-unit grid when staying on an
    existing orthogonal segment.
22. A new wire overlapping its source wire along the first segment merges into
    one net with no redundant junction or arc hop.
23. Overlap normalization trims the retained wire and places a junction only at
    an actual branch/divergence point.
24. A collinear overlap followed by continuation is merged without a junction.
25. A collinear continuation becomes one wire object containing the resulting
    bends, not a long wire plus a second short continuation wire.
