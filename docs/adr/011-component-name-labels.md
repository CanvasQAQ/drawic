# ADR 011: Component Name labels and typography

Status: accepted, 2026-10-25

## Decision

A placed component owns one electrical Reference and one optional visual Name
label bound to that component. The electrical Reference remains the value used
by connectivity, ERC, SPICE, and exports. Label position, visibility, color, and
font presentation are view data and are stored separately in the component's
`labelLayout`.

New components receive a Reference from the symbol's electrical prefix and the
smallest unused positive suffix when the caller does not supply one. An
explicitly supplied duplicate Reference is moved to the next available suffix.
The assembled Name is visible by default and the Value is hidden by default.
An empty Reference, `showReference: false`, or a symbol with
`referenceLabel: false` produces no visible Name.

The device library gains an unpadded `labelBounds` rectangle for visible artwork
and visible pins. It intentionally excludes selection tolerance, invisible
pins, and extra viewBox whitespace. Name placement uses this rectangle, a
4-canvas-unit gap, the current Name font size, cap-height ratio `0.72`, and
subscript drop `0.76 * 0.44 * font-size`.

Default Name sides are deterministic:

- MOS, BJT, two-terminal passives, sources, and related two-terminal devices use
  the local right side;
- T-coil and center-tapped inductors use the local top side;
- Ports use the side away from their connected wiring and pin direction;
- other devices, including most analog function blocks, use the local bottom
  side.

The local side follows rotation and both mirror axes into world coordinates.
Text itself never rotates. Default labels are reflowed after transform changes;
manually positioned labels remain at their authored world coordinates. Pure
translation shifts both default and manual label positions with the component.
The GUI exposes horizontal Mirror and vertical Flip V actions.

Name and Value are laid out as one adjacent group when both are visible. Right
and bottom groups read Name then Value; top groups place Value closer to the
device. When only Value is visible, it occupies the Name slot. GUI placement
always keeps the preview's default position. Agent placement tests the default
group against component ink, wires, junctions, labels, text, and drawing shapes,
then tries other sides and nearby slides before accepting the least-overlapping
candidate.

Schema version 3 receives only optional additions:

- document `typography` with `family: "sans" | "serif"` and positive `scale`;
- component `mirroredVertically`;
- label `position`, `anchor`, `placement`, `side`, `fontSizeScale`, `color`,
  `fontWeight`, `fontStyle`, `script`, and optional rich-text runs;
- device library `labelBounds` and `referenceLabel`.

Documents without these fields continue to use their persisted legacy label
offsets. Existing projects are not migrated or silently re-laid-out.

## Typography

The sans stack is:

```text
'ICM Round Period', 'Metropolis', 'DejaVu Sans', Arial,
'Helvetica Neue', Helvetica, sans-serif
```

The optional serif stack is:

```text
'ICM Serif', 'Liberation Serif', 'Times New Roman', Times,
'DejaVu Sans', serif
```

The default Name size is `15.116`. Document scale and per-label scale multiply
that value. Standard Reference forms render their prefix as a bold italic base
and the remaining designator as a `0.76`-scale bold upright subscript with a
`0.046 em` horizontal gap and `0.44 em` baseline drop. Non-matching References
render as ordinary text without changing characters or case.

Canvas labels explicitly allow style/weight synthesis so italic remains visible
when a preferred local font lacks an italic face. The Properties Name editor is
built on Lexical: clicking a base or subscript places the caret in that run,
selection formatting is applied only to selected text, and a live preview uses
the same SVG label renderer. Rich runs are serialized with the document. Lexical
is renderer-only, bundled locally, and performs no runtime network access.

## Consequences

- Editing visual label properties cannot alter electrical connectivity or
  netlists.
- Default layouts are captured at placement time, while transform-driven
  reflow is limited to labels still marked as default.
- GUI placement remains predictable and non-magical; automation can request a
  collision-avoiding layout without changing GUI behavior.
- Rich Name rendering is deterministic in SVG export and on the canvas.
