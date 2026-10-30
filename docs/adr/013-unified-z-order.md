# ADR 013: Unified stacking order

Status: accepted, 2026-10-30

## Context

Objects used fixed render bands: drawing shapes at the bottom, then wires,
components, Notes, and finally free text. Two problems followed:

- a Note always painted above every component, so a component covered by a
  Note could not be clicked without making the Note's whole body click-through,
  which in turn removed the natural way to drag a selected Note;
- the canvas and the SVG export did not agree — junctions sat above wires in one
  and between components and Notes in the other.

## Decision

A page carries one stacking order shared by every paintable object.

- `DrawingPage.zOrder` is an optional `string[]` of object ids, bottom to top.
  Components, wires, text annotations, and shapes (including Notes) all
  participate. Nets are containers and are not painted.
- A page without the field keeps the legacy bands, so existing documents and
  their appearance are unchanged. The parser drops unknown and duplicate ids
  and appends objects missing from a stored order, so every object is painted
  exactly once.
- New objects are inserted directly above the last object of the same kind,
  which preserves the familiar grouping on pages nobody has reordered.
- Arrange offers the four documented operations — to front, forward, backward,
  to back. Front and back accept a multi-selection and move it as one block;
  stepping operates on a single object.
- The canvas paints one ordered pass and the SVG/PDF/PNG export walks the same
  order, so what the editor shows is what is exported.
- Junctions remain derived interaction affordances and render above the ordered
  pass so they stay visible and clickable.

## Consequences

- Hit-testing follows paint order: the topmost object receives the pointer. A
  Note can be placed behind components instead of relying on click-through.
- Note bodies keep passing clicks through, so a foreground Note still does not
  block a component underneath; sending the Note to the back is the way to make
  it visually a background.
- Reordering is a document change and participates in undo/redo like any other.
- The stored order is redundant with the object lists; the parser normalizes it
  rather than rejecting documents that drift, which keeps older or hand-edited
  files loadable.
